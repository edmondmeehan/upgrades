-- Marketing and growth views for P&T admins: promo performance, the artist funnel, and who's stuck where.

/** Per redemption: how that artist is doing since they used the code, and what the promo has cost P&T in fees. */
create or replace function public.promo_performance()
returns table (promo_id uuid, artist_id uuid, artist_name text, handle text, status public.artist_status, redeemed_at timestamptz, ends_at timestamptz,
  payments_ready boolean, packages integer, orders integer, gross_cents bigint, fees_cents bigint, fees_waived_cents bigint)
language sql stable security definer set search_path = public as $$
  select r.promo_id, a.id, a.name, a.handle, a.status, r.redeemed_at, r.ends_at,
    coalesce(st.charges_enabled, false),
    (select count(*)::int from public.products p where p.artist_id = a.id and not p.is_sample and p.archived_at is null),
    count(o.id)::int, coalesce(sum(o.subtotal_cents), 0)::bigint, coalesce(sum(o.service_fee_cents), 0)::bigint,
    coalesce(sum(greatest(0, round(o.subtotal_cents * a.fee_bps / 10000.0) - o.service_fee_cents)), 0)::bigint
  from public.promo_redemptions r
  join public.artists a on a.id = r.artist_id
  left join public.artist_stripe st on st.artist_id = a.id
  left join public.orders o on o.artist_id = a.id and not o.is_sample and o.created_at >= r.redeemed_at and o.status <> 'refunded'
  where public.is_super_admin()
  group by r.promo_id, a.id, a.name, a.handle, a.status, r.redeemed_at, r.ends_at, st.charges_enabled
$$;

/** Every artist with where they are in setup, for the funnel and follow-up lists. */
create or replace function public.artist_funnel()
returns table (artist_id uuid, name text, handle text, status public.artist_status, created_at timestamptz, owner_email text, owner_name text,
  promo_code text, submitted boolean, approved boolean, payments_ready boolean, has_published_show boolean, has_package boolean,
  first_sale_at timestamptz, orders integer, gross_cents bigint)
language sql stable security definer set search_path = public as $$
  select a.id, a.name, a.handle, a.status, a.created_at,
    (select p.email from public.artist_members m join public.profiles p on p.id = m.user_id where m.artist_id = a.id and m.role = 'owner' order by m.created_at limit 1),
    (select p.name  from public.artist_members m join public.profiles p on p.id = m.user_id where m.artist_id = a.id and m.role = 'owner' order by m.created_at limit 1),
    (select c.code from public.promo_redemptions r join public.promo_codes c on c.id = r.promo_id where r.artist_id = a.id order by r.redeemed_at limit 1),
    exists (select 1 from public.verification_submissions v where v.artist_id = a.id),
    a.status = 'approved',
    coalesce((select charges_enabled from public.artist_stripe where artist_id = a.id), false),
    exists (select 1 from public.shows s where s.artist_id = a.id and s.status = 'published'),
    exists (select 1 from public.show_products sp where sp.artist_id = a.id and sp.active and not sp.is_sample),
    (select min(o.created_at) from public.orders o where o.artist_id = a.id and not o.is_sample),
    (select count(*)::int from public.orders o where o.artist_id = a.id and not o.is_sample),
    coalesce((select sum(o.subtotal_cents) from public.orders o where o.artist_id = a.id and not o.is_sample), 0)::bigint
  from public.artists a
  where public.is_super_admin()
  order by a.created_at desc
$$;

revoke execute on function public.promo_performance(), public.artist_funnel() from public, anon;
grant execute on function public.promo_performance(), public.artist_funnel() to authenticated;
