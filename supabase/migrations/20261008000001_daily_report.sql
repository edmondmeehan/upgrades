-- Daily sales email to P&T admins. Each admin can turn it off for themselves.
alter table public.profiles add column daily_report boolean not null default true;
grant update (daily_report) on public.profiles to authenticated;

create table public.report_runs (
  report     text not null,
  day        date not null,
  sent_at    timestamptz not null default now(),
  recipients integer not null default 0,
  primary key (report, day)
);
alter table public.report_runs enable row level security;
revoke all on public.report_runs from anon, authenticated;

/** Platform sales for one day (America/New_York), with comparisons. Real sales only; sample data excluded. */
create or replace function public.platform_daily_report(p_day date)
returns jsonb language sql stable security definer set search_path = public as $$
  with bounds as (
    select (p_day::timestamp at time zone 'America/New_York') as d0,
           ((p_day + 1)::timestamp at time zone 'America/New_York') as d1,
           ((p_day - 1)::timestamp at time zone 'America/New_York') as prev0,
           ((p_day - 7)::timestamp at time zone 'America/New_York') as wk0,
           (date_trunc('month', p_day)::timestamp at time zone 'America/New_York') as m0
  ),
  o as (select o.*, a.name as artist_name, a.handle from public.orders o join public.artists a on a.id = o.artist_id where not o.is_sample),
  units as (select oi.order_id, sum(oi.quantity) as u from public.order_items oi group by oi.order_id),
  day as (select o.*, coalesce(u.u, 0) as units from o left join units u on u.order_id = o.id, bounds b where o.created_at >= b.d0 and o.created_at < b.d1)
  select jsonb_build_object(
    'day', p_day,
    'orders', (select count(*) from day),
    'units', (select coalesce(sum(units), 0) from day),
    'gross_cents', (select coalesce(sum(subtotal_cents), 0) from day),
    'fees_cents', (select coalesce(sum(service_fee_cents), 0) from day),
    'fan_paid_cents', (select coalesce(sum(total_cents), 0) from day),
    'refunds_cents', (select coalesce(sum(r.amount_cents), 0) from public.refunds r, bounds b where not r.is_sample and r.created_at >= b.d0 and r.created_at < b.d1),
    'prev_gross_cents', (select coalesce(sum(subtotal_cents), 0) from o, bounds b where o.created_at >= b.prev0 and o.created_at < b.d0),
    'week_avg_gross_cents', (select coalesce(round(sum(subtotal_cents) / 7.0), 0) from o, bounds b where o.created_at >= b.wk0 and o.created_at < b.d0),
    'mtd_orders', (select count(*) from o, bounds b where o.created_at >= b.m0 and o.created_at < b.d1),
    'mtd_gross_cents', (select coalesce(sum(subtotal_cents), 0) from o, bounds b where o.created_at >= b.m0 and o.created_at < b.d1),
    'mtd_fees_cents', (select coalesce(sum(service_fee_cents), 0) from o, bounds b where o.created_at >= b.m0 and o.created_at < b.d1),
    'by_artist', coalesce((select jsonb_agg(x order by (x->>'gross_cents')::bigint desc) from (
        select jsonb_build_object('name', artist_name, 'handle', handle, 'orders', count(*), 'units', sum(units),
                                  'gross_cents', sum(subtotal_cents), 'fees_cents', sum(service_fee_cents)) x
        from day group by artist_name, handle order by sum(subtotal_cents) desc limit 10) t), '[]'),
    'top_packages', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('artist', a.name, 'package', p.name, 'city', s.city, 'date', s.show_date,
                 'units', sum(oi.quantity), 'left', greatest(0, sp.capacity - public.units_taken(sp.id))) x
        from day d join public.order_items oi on oi.order_id = d.id
        join public.show_products sp on sp.id = oi.show_product_id join public.products p on p.id = sp.product_id
        join public.shows s on s.id = sp.show_id join public.artists a on a.id = sp.artist_id
        group by a.name, p.name, s.city, s.show_date, sp.id, sp.capacity order by sum(oi.quantity) desc limit 5) t), '[]'),
    'new_artists', (select count(*) from public.artists a, bounds b where a.created_at >= b.d0 and a.created_at < b.d1),
    'pending_review', (select count(*) from public.artists where status = 'pending'),
    'open_disputes', (select count(*) from public.disputes where status = 'open' and not is_sample),
    'shows_today', (select count(*) from public.shows s join public.artists a on a.id = s.artist_id
                     where a.status = 'approved' and s.status = 'published' and s.show_date = p_day + 1)
  )
$$;
revoke execute on function public.platform_daily_report(date) from public, anon, authenticated;
grant execute on function public.platform_daily_report(date) to service_role;
