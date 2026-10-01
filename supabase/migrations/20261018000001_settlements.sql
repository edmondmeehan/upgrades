-- Settlement statements: emailed to the artist's owner and accountants the morning after each show.

alter table public.shows add column settlement_sent_at timestamptz, add column settlement_net_cents bigint;  -- what the last statement said

/** One show's statement numbers: real sales only (no sample data), comps counted separately. */
create or replace function public.show_settlement(p_show uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select * from public.shows where id = p_show),
  m as (select vm.* from public.v_order_money vm join public.orders o on o.id = vm.order_id
        where vm.show_id = p_show and not o.is_sample and not o.is_comp),
  pk as (
    select p.name, sp.price_cents,
      coalesce(sum(oi.quantity - oi.refunded_quantity) filter (where not o.is_comp), 0)::int as sold,
      coalesce(sum(oi.refunded_quantity) filter (where not o.is_comp), 0)::int as refunded,
      coalesce(sum(oi.quantity) filter (where o.is_comp and o.status <> 'refunded'), 0)::int as comps,
      coalesce(sum((oi.quantity - oi.refunded_quantity) * oi.unit_price_cents) filter (where not o.is_comp), 0)::bigint as gross_cents
    from public.show_products sp join public.products p on p.id = sp.product_id
    left join public.order_items oi on oi.show_product_id = sp.id
    left join public.orders o on o.id = oi.order_id and not o.is_sample
    where sp.show_id = p_show and not sp.is_sample
    group by p.name, sp.price_cents having count(o.id) > 0
  ),
  ps as (select count(*) filter (where ps.voided_at is null) as valid, count(*) filter (where ps.checked_in_at is not null and ps.voided_at is null) as checked_in
         from public.passes ps join public.order_items oi on oi.id = ps.order_item_id join public.orders o on o.id = oi.order_id
         where ps.show_id = p_show and not o.is_sample)
  select jsonb_build_object(
    'show_id', s.id, 'artist_id', s.artist_id, 'show_date', s.show_date, 'city', s.city, 'region', s.region, 'venue', s.venue_name, 'status', s.status,
    'orders', (select count(*) from m),
    'gross_cents', (select coalesce(sum(gross_cents), 0) from m),
    'refunded_cents', (select coalesce(sum(artist_refunded_cents), 0) from m),
    'stripe_fee_cents', (select coalesce(sum(stripe_fee_cents), 0) from m),
    'dispute_cost_cents', (select coalesce(sum(dispute_lost_cents - dispute_platform_reversed_cents + dispute_fee_cents), 0) from m),
    'net_cents', (select coalesce(sum(net_to_artist_cents), 0) from m),
    'service_fee_cents', (select coalesce(sum(service_fee_cents - service_fee_refunded_cents), 0) from m),
    'open_disputes', (select coalesce(sum(open_disputes), 0) from m),
    'packages', coalesce((select jsonb_agg(to_jsonb(pk) order by pk.gross_cents desc) from pk), '[]'),
    'passes_valid', (select valid from ps), 'checked_in', (select checked_in from ps),
    'sent_at', s.settlement_sent_at, 'sent_net_cents', s.settlement_net_cents
  ) from s
  where auth.role() = 'service_role' or public.is_finance(s.artist_id) or public.is_owner(s.artist_id) or public.is_super_admin()
$$;

/** Shows that ended (in their own time zone) in the last week, had real sales, and haven't had a statement. */
create or replace function public.due_settlements()
returns table (show_id uuid) language sql stable security definer set search_path = public as $$
  select s.id from public.shows s
  where s.settlement_sent_at is null and s.status in ('published', 'cancelled')
    and s.show_date < (now() at time zone s.timezone)::date
    and s.show_date >= (now() at time zone s.timezone)::date - 7
    and exists (select 1 from public.orders o where o.show_id = s.id and not o.is_sample and not o.is_comp)
$$;

revoke execute on function public.show_settlement(uuid), public.due_settlements() from public, anon, authenticated;
grant execute on function public.show_settlement(uuid) to authenticated, service_role;
grant execute on function public.due_settlements() to service_role;
