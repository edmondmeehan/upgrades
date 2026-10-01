-- Superfans and follows: fans follow an artist (confirmed by email), artists announce new shows to followers.

create table public.follows (
  id              uuid primary key default gen_random_uuid(),
  artist_id       uuid not null references public.artists (id) on delete cascade,
  email           text not null check (char_length(email) <= 200),
  name            text check (name is null or char_length(name) <= 120),
  region          text check (region is null or region ~ '^[A-Z]{2}$'),   -- US state code, for "near me" announcements
  source          text not null default 'storefront' check (source in ('storefront', 'checkout')),
  token           text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (artist_id, email)
);
create index on public.follows (artist_id) where confirmed_at is not null and unsubscribed_at is null;
alter table public.follows enable row level security;
revoke all on public.follows from anon, authenticated;
grant select on public.follows to authenticated;
-- Owners, reps and P&T see followers; accountants don't see fan details.
create policy follows_select on public.follows for select to authenticated using (public.can_edit_shows(artist_id));

create table public.follow_attempts (ip_hash text not null, created_at timestamptz not null default now());
create index on public.follow_attempts (ip_hash, created_at);
alter table public.follow_attempts enable row level security;
revoke all on public.follow_attempts from anon, authenticated;

create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  artist_id  uuid not null references public.artists (id) on delete cascade,
  show_ids   uuid[] not null default '{}',
  message    text check (message is null or char_length(message) <= 1000),
  regions    text[],
  sent_to    integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;
create policy announcements_select on public.announcements for select to authenticated using (public.can_edit_shows(artist_id));
alter table public.shows add column announced_at timestamptz;

/** Storefront follow form (server only). Returns the token and whether a confirmation email is needed. */
create or replace function public.follow_artist(p_handle text, p_email text, p_name text, p_region text, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.artists; f public.follows; v_email text := lower(trim(p_email));
begin
  if (select count(*) from public.follow_attempts where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('result', 'throttled');
  end if;
  insert into public.follow_attempts (ip_hash) values (p_ip_hash);
  delete from public.follow_attempts where created_at < now() - interval '1 day';
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('result', 'bad_email'); end if;
  select * into a from public.artists where handle = lower(p_handle) and status = 'approved';
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  insert into public.follows (artist_id, email, name, region)
  values (a.id, v_email, nullif(trim(p_name), ''), nullif(upper(trim(p_region)), ''))
  on conflict (artist_id, email) do update set
    name = coalesce(excluded.name, public.follows.name), region = coalesce(excluded.region, public.follows.region),
    unsubscribed_at = null,
    confirmed_at = case when public.follows.unsubscribed_at is not null then null else public.follows.confirmed_at end
  returning * into f;
  return jsonb_build_object('result', 'ok', 'token', f.token, 'confirmed', f.confirmed_at is not null, 'artist_name', a.name, 'handle', a.handle);
end $$;

create or replace function public.confirm_follow(p_token text) returns jsonb
language sql security definer set search_path = public as $$
  update public.follows set confirmed_at = coalesce(confirmed_at, now()), unsubscribed_at = null where token = p_token
  returning jsonb_build_object('artist_id', artist_id, 'email', email)
$$;
create or replace function public.unsubscribe_follow(p_token text) returns jsonb
language sql security definer set search_path = public as $$
  update public.follows set unsubscribed_at = coalesce(unsubscribed_at, now()) where token = p_token
  returning jsonb_build_object('artist_id', artist_id, 'email', email)
$$;

-- Ticking "Email me news" at checkout makes the fan a (confirmed) follower.
create or replace function public.apply_marketing_opt_in() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_email text; v_name text; v_zip text;
begin
  if new.order_id is not null and old.order_id is null and new.marketing_opt_in then
    update public.fans f set marketing_opt_in_at = coalesce(f.marketing_opt_in_at, now())
    from public.orders o where o.id = new.order_id and f.id = o.fan_id
    returning f.email, f.name into v_email, v_name;
    if v_email is not null then
      insert into public.follows (artist_id, email, name, region, source, confirmed_at)
      values (new.artist_id, v_email, v_name, (select s.region from public.shows s where s.id = new.show_id and s.region ~ '^[A-Z]{2}$'), 'checkout', now())
      on conflict (artist_id, email) do update set confirmed_at = coalesce(public.follows.confirmed_at, now())
        where public.follows.unsubscribed_at is null;
    end if;
  end if;
  return new;
end $$;

/** The artist's best fans: everyone who has bought, ranked by money spent. */
create or replace function public.superfans(p_artist uuid)
returns table (email text, name text, orders integer, spent_cents bigint, passes integer, shows_attended integer,
  first_order_at timestamptz, last_order_at timestamptz, last_city text, opted_in boolean, following boolean)
language sql stable security definer set search_path = public as $$
  select f.email, f.name,
    count(distinct o.id) filter (where not o.is_comp)::int,
    coalesce(sum(o.total_cents) filter (where not o.is_comp), 0)::bigint
      - coalesce((select sum(r.amount_cents) from public.refunds r join public.orders o2 on o2.id = r.order_id where o2.fan_id = f.id and not o2.is_sample), 0)::bigint,
    (select count(*) from public.passes ps join public.order_items oi on oi.id = ps.order_item_id join public.orders o3 on o3.id = oi.order_id
       where o3.fan_id = f.id and ps.voided_at is null and not o3.is_sample)::int,
    (select count(distinct ps.show_id) from public.passes ps join public.order_items oi on oi.id = ps.order_item_id join public.orders o4 on o4.id = oi.order_id
       where o4.fan_id = f.id and ps.checked_in_at is not null and not o4.is_sample)::int,
    min(o.created_at), max(o.created_at),
    (select s.city || coalesce(', ' || s.region, '') from public.orders o5 join public.shows s on s.id = o5.show_id where o5.fan_id = f.id and not o5.is_sample order by o5.created_at desc limit 1),
    f.marketing_opt_in_at is not null,
    exists (select 1 from public.follows fl where fl.artist_id = f.artist_id and fl.email = f.email and fl.confirmed_at is not null and fl.unsubscribed_at is null)
  from public.fans f
  join public.orders o on o.fan_id = f.id and not o.is_sample and o.status <> 'refunded'
  where f.artist_id = p_artist and public.can_edit_shows(p_artist)
  group by f.id
  order by 4 desc, 3 desc
$$;

revoke execute on function public.follow_artist(text, text, text, text, text), public.confirm_follow(text), public.unsubscribe_follow(text),
  public.superfans(uuid) from public, anon, authenticated;
grant execute on function public.follow_artist(text, text, text, text, text), public.confirm_follow(text), public.unsubscribe_follow(text) to service_role;
grant execute on function public.superfans(uuid) to authenticated, service_role;
