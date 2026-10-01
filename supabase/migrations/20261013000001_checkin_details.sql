-- Pre-show check-in emails: where and when to check in, sent automatically before the show.

alter table public.shows
  add column checkin_time          time,
  add column checkin_location      text check (checkin_location is null or char_length(checkin_location) <= 300),
  add column checkin_contact_name  text check (checkin_contact_name is null or char_length(checkin_contact_name) <= 120),
  add column checkin_contact_phone text check (checkin_contact_phone is null or char_length(checkin_contact_phone) <= 40),
  add column checkin_notes         text check (checkin_notes is null or char_length(checkin_notes) <= 2000),
  add column checkin_email_days    integer not null default 2 check (checkin_email_days between 0 and 14),
  add column checkin_sent_at       timestamptz,   -- first time the check-in email went out for this show
  add column checkin_updated_at    timestamptz;   -- last time details changed after it went out

alter table public.show_products
  add column checkin_time  time,                  -- overrides the show's check-in time for this package
  add column checkin_notes text check (checkin_notes is null or char_length(checkin_notes) <= 1000);

create table public.checkin_emails (
  show_id  uuid not null references public.shows (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  kind     text not null default 'details' check (kind in ('details', 'update')),
  sent_at  timestamptz not null default now(),
  primary key (show_id, order_id, kind, sent_at)
);
create index on public.checkin_emails (show_id, order_id);
alter table public.checkin_emails enable row level security;
revoke all on public.checkin_emails from anon, authenticated;
grant select on public.checkin_emails to authenticated;
create policy checkin_emails_select on public.checkin_emails for select to authenticated
  using (exists (select 1 from public.shows s where s.id = show_id and public.can_edit_shows(s.artist_id)));

/** Everyone holding passes for a show, with what they bought and whether they've had the check-in email. */
create or replace function public.checkin_recipients(p_show uuid)
returns table (order_id uuid, hold_id uuid, email text, name text, confirmation_code text, packages jsonb, sent boolean)
language sql stable security definer set search_path = public as $$
  select o.id, h.id, f.email, f.name, o.confirmation_code,
    (select jsonb_agg(jsonb_build_object('name', p.name, 'qty', oi.quantity, 'time', sp.checkin_time, 'notes', sp.checkin_notes) order by p.name)
       from public.order_items oi join public.show_products sp on sp.id = oi.show_product_id join public.products p on p.id = sp.product_id
      where oi.order_id = o.id and oi.quantity > oi.refunded_quantity),
    exists (select 1 from public.checkin_emails e where e.show_id = o.show_id and e.order_id = o.id)
  from public.orders o
  join public.fans f on f.id = o.fan_id
  left join public.checkout_holds h on h.order_id = o.id
  where o.show_id = p_show and o.status <> 'refunded' and not o.is_sample
    and (auth.role() = 'service_role' or exists (select 1 from public.shows s where s.id = p_show and public.can_edit_shows(s.artist_id)))
$$;

/** Shows whose check-in email is due today (in the show's own time zone), with details filled in. */
create or replace function public.due_checkin_shows()
returns table (show_id uuid) language sql stable security definer set search_path = public as $$
  select s.id from public.shows s join public.artists a on a.id = s.artist_id
  where a.status = 'approved' and s.status = 'published'
    and (s.checkin_time is not null or s.checkin_location is not null)
    and s.show_date - (now() at time zone s.timezone)::date between 0 and s.checkin_email_days
    and exists (select 1 from public.orders o where o.show_id = s.id and o.status <> 'refunded' and not o.is_sample
                  and not exists (select 1 from public.checkin_emails e where e.show_id = s.id and e.order_id = o.id))
$$;

revoke execute on function public.checkin_recipients(uuid), public.due_checkin_shows() from public, anon;
grant execute on function public.checkin_recipients(uuid) to authenticated, service_role;
grant execute on function public.due_checkin_shows() to service_role;
