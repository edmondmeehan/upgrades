-- Waitlist for sold-out packages: fans join, the next people in line are emailed when spots open.

create table public.waitlist (
  id              uuid primary key default gen_random_uuid(),
  show_product_id uuid not null references public.show_products (id) on delete cascade,
  artist_id       uuid not null references public.artists (id) on delete cascade,
  show_id         uuid not null references public.shows (id) on delete cascade,
  email           text not null check (char_length(email) <= 200),
  name            text check (name is null or char_length(name) <= 120),
  qty             integer not null default 1 check (qty between 1 and 4),
  token           text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  created_at      timestamptz not null default now(),
  notified_at     timestamptz,     -- emailed that spots opened
  converted_at    timestamptz,     -- bought after joining
  left_at         timestamptz,     -- removed themselves
  unique (show_product_id, email)
);
create index on public.waitlist (show_product_id, created_at) where notified_at is null and converted_at is null and left_at is null;
alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;
grant select on public.waitlist to authenticated;
-- Owners, reps and P&T see waitlists (fan emails), like orders.
create policy waitlist_select on public.waitlist for select to authenticated using (public.can_edit_shows(artist_id));

create table public.waitlist_attempts (ip_hash text not null, created_at timestamptz not null default now());
create index on public.waitlist_attempts (ip_hash, created_at);
alter table public.waitlist_attempts enable row level security;
revoke all on public.waitlist_attempts from anon, authenticated;

/** Storefront: join a sold-out package's waitlist (server only). */
create or replace function public.join_waitlist(p_show_product uuid, p_email text, p_name text, p_qty integer, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare sp public.show_products; v_email text := lower(trim(p_email)); w public.waitlist; v_pos int;
begin
  if (select count(*) from public.waitlist_attempts where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('result', 'throttled');
  end if;
  insert into public.waitlist_attempts (ip_hash) values (p_ip_hash);
  delete from public.waitlist_attempts where created_at < now() - interval '1 day';
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('result', 'bad_email'); end if;
  select * into sp from public.show_products where id = p_show_product and active and not is_sample;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  insert into public.waitlist (show_product_id, artist_id, show_id, email, name, qty)
  values (sp.id, sp.artist_id, sp.show_id, v_email, nullif(trim(p_name), ''), least(greatest(coalesce(p_qty, 1), 1), 4))
  on conflict (show_product_id, email) do update set
    qty = excluded.qty, name = coalesce(excluded.name, public.waitlist.name),
    left_at = null, notified_at = case when public.waitlist.left_at is not null then null else public.waitlist.notified_at end
  returning * into w;
  select count(*) into v_pos from public.waitlist where show_product_id = sp.id and converted_at is null and left_at is null and created_at <= w.created_at;
  return jsonb_build_object('result', 'ok', 'position', v_pos, 'token', w.token, 'already_notified', w.notified_at is not null);
end $$;

/** Fan removes themselves (link in every waitlist email). */
create or replace function public.leave_waitlist(p_token text) returns jsonb
language sql security definer set search_path = public as $$
  update public.waitlist set left_at = coalesce(left_at, now()) where token = p_token
  returning jsonb_build_object('show_product_id', show_product_id, 'email', email)
$$;

/**
 * Who to email now that spots may be open: the next people in line, oldest first, until their wanted
 * quantities cover the open spots. Marks them notified. Server only.
 */
create or replace function public.claim_waitlist_notifications(p_show_product uuid)
returns table (id uuid, email text, name text, qty integer, token text, open_spots integer)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare sp public.show_products; v_open int; v_covered int := 0; r record;
begin
  select * into sp from public.show_products where show_products.id = p_show_product for update;
  if not found or not sp.active then return; end if;
  if (select status from public.shows s where s.id = sp.show_id) <> 'published'
     or (select show_date from public.shows s where s.id = sp.show_id) < current_date
     or (sp.off_sale_at is not null and sp.off_sale_at <= now()) then return; end if;
  v_open := sp.capacity - public.units_taken(sp.id);
  -- Anyone already emailed in the last 24 hours is still "in line" for open spots.
  select coalesce(sum(w.qty), 0) into v_covered from public.waitlist w
    where w.show_product_id = sp.id and w.notified_at > now() - interval '24 hours' and w.converted_at is null and w.left_at is null;
  if v_open - v_covered <= 0 then return; end if;
  v_open := v_open - v_covered;
  for r in select w.* from public.waitlist w where w.show_product_id = sp.id and w.notified_at is null and w.converted_at is null and w.left_at is null
           order by w.created_at for update skip locked loop
    update public.waitlist set notified_at = now() where waitlist.id = r.id;
    id := r.id; email := r.email; name := r.name; qty := r.qty; token := r.token; open_spots := v_open;
    return next;
    v_open := v_open - least(r.qty, v_open);
    exit when v_open <= 0;
  end loop;
end $$;

/** Packages that have people waiting and might have room (for the daily sweep). */
create or replace function public.waitlists_with_room()
returns table (show_product_id uuid) language sql stable security definer set search_path = public as $$
  select distinct w.show_product_id from public.waitlist w join public.show_products sp on sp.id = w.show_product_id
  where w.notified_at is null and w.converted_at is null and w.left_at is null and sp.active
    and sp.capacity - public.units_taken(sp.id) > 0
$$;

-- Buying the package takes you off its waitlist.
create or replace function public.waitlist_mark_converted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.order_id is not null and old.order_id is null then
    update public.waitlist w set converted_at = now()
    from public.orders o join public.fans f on f.id = o.fan_id
    where o.id = new.order_id and w.show_product_id = new.show_product_id and w.email = lower(f.email) and w.converted_at is null;
  end if;
  return new;
end $$;
create trigger checkout_holds_waitlist after update of order_id on public.checkout_holds for each row execute function public.waitlist_mark_converted();

-- Storefront shows how many are waiting (no emails) so sold-out cards can say so.
create or replace function public.waitlist_count(p_show_product uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.waitlist where show_product_id = p_show_product and converted_at is null and left_at is null
$$;

revoke execute on function public.join_waitlist(uuid, text, text, integer, text), public.leave_waitlist(text),
  public.claim_waitlist_notifications(uuid), public.waitlists_with_room(), public.waitlist_mark_converted() from public, anon, authenticated;
grant execute on function public.join_waitlist(uuid, text, text, integer, text), public.leave_waitlist(text),
  public.claim_waitlist_notifications(uuid), public.waitlists_with_room() to service_role;
grant execute on function public.waitlist_count(uuid) to anon, authenticated;
