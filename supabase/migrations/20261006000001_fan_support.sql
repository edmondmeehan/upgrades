-- Fan support: each artist handles their own. Fans write in through the artist's storefront;
-- messages are emailed to the artist's support address and kept in a simple inbox.

alter table public.artists add column support_email text check (support_email is null or support_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
grant update (support_email) on public.artists to authenticated;

create table public.support_requests (
  id                uuid primary key default gen_random_uuid(),
  artist_id         uuid not null references public.artists (id) on delete cascade,
  order_id          uuid references public.orders (id) on delete set null,
  confirmation_code text,
  name              text not null check (char_length(name) between 1 and 120),
  email             text not null check (char_length(email) <= 200),
  topic             text not null default 'other' check (topic in ('order', 'change', 'refund', 'checkin', 'photos', 'other')),
  message           text not null check (char_length(message) between 1 and 4000),
  status            text not null default 'open' check (status in ('open', 'resolved')),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  resolved_by       uuid references public.profiles (id)
);
create index on public.support_requests (artist_id, status, created_at desc);
alter table public.support_requests enable row level security;
revoke all on public.support_requests from anon, authenticated;
grant select, update (status, resolved_at, resolved_by) on public.support_requests to authenticated;
-- Owners, reps and P&T answer fans; accountants don't see fan messages.
create policy support_select on public.support_requests for select to authenticated using (public.can_edit_shows(artist_id));
create policy support_update on public.support_requests for update to authenticated using (public.can_edit_shows(artist_id)) with check (public.can_edit_shows(artist_id));

create table public.support_attempts (ip_hash text not null, created_at timestamptz not null default now());
create index on public.support_attempts (ip_hash, created_at);
alter table public.support_attempts enable row level security;
revoke all on public.support_attempts from anon, authenticated;

/** Public form submission (server only). Links the order when the confirmation number belongs to this artist. */
create or replace function public.submit_support_request(
  p_handle text, p_name text, p_email text, p_topic text, p_message text, p_code text, p_ip_hash text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.artists; v_order uuid; v_code text; v_id uuid; v_to text;
begin
  if (select count(*) from public.support_attempts where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('result', 'throttled');
  end if;
  insert into public.support_attempts (ip_hash) values (p_ip_hash);
  delete from public.support_attempts where created_at < now() - interval '1 day';

  select * into a from public.artists where handle = lower(p_handle) and status = 'approved';
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  v_code := nullif(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), '');
  if v_code is not null then
    if v_code like 'OTU%' then v_code := substr(v_code, 4); end if;
    select id into v_order from public.orders where confirmation_code = 'OTU-' || v_code and artist_id = a.id;
  end if;

  insert into public.support_requests (artist_id, order_id, confirmation_code, name, email, topic, message)
  values (a.id, v_order, case when v_code is null then null else 'OTU-' || v_code end, trim(p_name), lower(trim(p_email)),
          coalesce(nullif(p_topic, ''), 'other'), trim(p_message))
  returning id into v_id;

  v_to := coalesce(a.support_email, (select p.email from public.artist_members m join public.profiles p on p.id = m.user_id
                                     where m.artist_id = a.id and m.role = 'owner' order by m.created_at limit 1));
  return jsonb_build_object('result', 'ok', 'id', v_id, 'artist_id', a.id, 'artist_name', a.name, 'to', v_to, 'order_id', v_order);
end $$;
revoke execute on function public.submit_support_request(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_support_request(text, text, text, text, text, text, text) to service_role;
