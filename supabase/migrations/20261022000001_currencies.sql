-- Currencies: each show sells in one currency (USD, GBP, EUR, CAD, AUD). Orders inherit it; money views carry it so
-- totals are never added across currencies.

alter table public.shows add column if not exists currency text not null default 'usd' check (currency in ('usd', 'gbp', 'eur', 'cad', 'aud'));
-- orders.currency already exists (from the financials setup); make sure it's lower-case and one we support.
update public.orders set currency = lower(currency) where currency <> lower(currency);
alter table public.orders drop constraint if exists orders_currency_supported;
alter table public.orders add constraint orders_currency_supported check (currency in ('usd', 'gbp', 'eur', 'cad', 'aud'));
alter table public.products add column if not exists currency_prices jsonb not null default '{}'::jsonb check (jsonb_typeof(currency_prices) = 'object');

create or replace function public.currency_for_country(p_country text) returns text
language sql immutable as $$
  select case upper(coalesce(p_country, 'US'))
    when 'GB' then 'gbp' when 'UK' then 'gbp' when 'CA' then 'cad' when 'AU' then 'aud'
    when 'IE' then 'eur' when 'FR' then 'eur' when 'DE' then 'eur' when 'ES' then 'eur' when 'IT' then 'eur' when 'NL' then 'eur'
    when 'BE' then 'eur' when 'AT' then 'eur' when 'PT' then 'eur' when 'FI' then 'eur' when 'GR' then 'eur' when 'LU' then 'eur'
    else 'usd' end
$$;

-- New shows pick a currency from their country unless one is chosen.
create or replace function public.default_show_currency() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and (new.currency is null or new.currency = 'usd') then new.currency := public.currency_for_country(new.country); end if;
  return new;
end $$;
drop trigger if exists shows_currency on public.shows;
create trigger shows_currency before insert on public.shows for each row execute function public.default_show_currency();
update public.shows set currency = public.currency_for_country(country) where currency = 'usd' and upper(coalesce(country, 'US')) <> 'US';

-- Orders always carry their show's currency.
create or replace function public.order_currency() returns trigger
language plpgsql set search_path = public as $$
begin
  new.currency := coalesce((select currency from public.shows where id = new.show_id), 'usd');
  return new;
end $$;
drop trigger if exists orders_currency on public.orders;
create trigger orders_currency before insert on public.orders for each row execute function public.order_currency();
update public.orders o set currency = s.currency from public.shows s where s.id = o.show_id and o.currency <> s.currency;

-- Package defaults: a default price per currency (falls back to the main default price).
create or replace function public.apply_package_defaults() returns trigger
language plpgsql set search_path = public as $$
declare d record; v_cur text;
begin
  select default_price_cents, default_capacity, currency_prices into d from public.products where id = new.product_id;
  select currency into v_cur from public.shows where id = new.show_id;
  if new.uses_default_price then
    new.price_cents := coalesce((d.currency_prices ->> v_cur)::int, d.default_price_cents, new.price_cents);
  end if;
  if new.uses_default_capacity and d.default_capacity is not null then new.capacity := d.default_capacity; end if;
  return new;
end $$;
create or replace function public.propagate_package_defaults() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.default_price_cents is distinct from old.default_price_cents or new.default_capacity is distinct from old.default_capacity
     or new.currency_prices is distinct from old.currency_prices then
    update public.show_products set price_cents = price_cents where product_id = new.id and (uses_default_price or uses_default_capacity);
  end if;
  return new;
end $$;

-- Money views carry currency (added as the last column).
create or replace view public.v_order_money with (security_invoker = true) as
 SELECT o.id AS order_id, o.artist_id, o.show_id, s.tour_id, s.show_date, o.created_at, o.status, o.payout_id, o.is_sample,
    o.subtotal_cents AS gross_cents, o.service_fee_cents, o.total_cents, o.stripe_fee_cents,
    COALESCE(r.amount, 0::bigint) AS refunded_cents, COALESCE(r.fee, 0::bigint) AS service_fee_refunded_cents,
    COALESCE(r.amount, 0::bigint) - COALESCE(r.fee, 0::bigint) AS artist_refunded_cents,
    COALESCE(d.lost, 0::bigint) AS dispute_lost_cents, COALESCE(d.fees, 0::bigint) AS dispute_fee_cents,
    COALESCE(d.plat, 0::bigint) AS dispute_platform_reversed_cents, COALESCE(d.open_count, 0::bigint) AS open_disputes,
    o.subtotal_cents - o.stripe_fee_cents - (COALESCE(r.amount, 0::bigint) - COALESCE(r.fee, 0::bigint)) - (COALESCE(d.lost, 0::bigint) - COALESCE(d.plat, 0::bigint)) - COALESCE(d.fees, 0::bigint) AS net_to_artist_cents,
    o.service_fee_cents - COALESCE(r.fee, 0::bigint) - COALESCE(d.plat, 0::bigint) AS platform_net_cents,
    o.currency
   FROM orders o
     JOIN shows s ON s.id = o.show_id
     LEFT JOIN ( SELECT refunds.order_id, sum(refunds.amount_cents) AS amount, sum(refunds.service_fee_refunded_cents) AS fee FROM refunds GROUP BY refunds.order_id) r ON r.order_id = o.id
     LEFT JOIN ( SELECT disputes.order_id,
            sum(CASE WHEN disputes.status = 'lost'::dispute_status THEN disputes.amount_cents ELSE 0 END) AS lost,
            sum(disputes.fee_cents) AS fees,
            sum(CASE WHEN disputes.status = 'lost'::dispute_status THEN disputes.platform_fee_reversed_cents ELSE 0 END) AS plat,
            count(*) FILTER (WHERE disputes.status = 'open'::dispute_status) AS open_count
           FROM disputes GROUP BY disputes.order_id) d ON d.order_id = o.id;

create or replace view public.v_show_money with (security_invoker = true) as
 SELECT artist_id, show_id, tour_id, show_date, count(*)::integer AS orders, sum(gross_cents) AS gross_cents, sum(service_fee_cents) AS service_fee_cents,
    sum(stripe_fee_cents) AS stripe_fee_cents, sum(refunded_cents)::bigint AS refunded_cents, sum(service_fee_refunded_cents)::bigint AS service_fee_refunded_cents,
    sum(artist_refunded_cents)::bigint AS artist_refunded_cents, sum(dispute_lost_cents - dispute_platform_reversed_cents + dispute_fee_cents)::bigint AS dispute_cost_cents,
    sum(net_to_artist_cents)::bigint AS net_to_artist_cents, sum(platform_net_cents)::bigint AS platform_net_cents, bool_or(is_sample) AS has_sample,
    min(currency) AS currency
   FROM v_order_money GROUP BY artist_id, show_id, tour_id, show_date;

create or replace view public.v_artist_monthly with (security_invoker = true) as
 SELECT artist_id, date_trunc('month', created_at)::date AS month, count(*)::integer AS orders, sum(gross_cents) AS gross_cents,
    sum(service_fee_cents) AS service_fee_cents, sum(stripe_fee_cents) AS stripe_fee_cents, sum(refunded_cents)::bigint AS refunded_cents,
    sum(service_fee_refunded_cents)::bigint AS service_fee_refunded_cents, sum(dispute_lost_cents)::bigint AS dispute_lost_cents,
    sum(dispute_fee_cents)::bigint AS dispute_fee_cents, sum(net_to_artist_cents)::bigint AS net_to_artist_cents, sum(platform_net_cents)::bigint AS platform_net_cents,
    count(*) FILTER (WHERE refunded_cents > 0)::integer AS refunded_orders, sum(open_disputes)::integer AS open_disputes, bool_or(is_sample) AS has_sample,
    currency
   FROM v_order_money GROUP BY artist_id, date_trunc('month', created_at), currency;

create or replace view public.v_show_product_sales with (security_invoker = true) as
 SELECT sp.id AS show_product_id, sp.artist_id, sp.show_id, sh.tour_id, sp.product_id, p.name AS product_name, p.includes_photo, sp.price_cents, sp.capacity,
    COALESCE(sum(oi.quantity), 0::bigint)::integer AS units, COALESCE(sum(oi.refunded_quantity), 0::bigint)::integer AS units_refunded,
    COALESCE(sum((oi.quantity - oi.refunded_quantity) * oi.unit_price_cents), 0::bigint) AS net_gross_cents,
    COALESCE(sum(oi.quantity * oi.unit_price_cents), 0::bigint) AS gross_cents,
    (( SELECT count(*) FROM passes ps JOIN order_items oi2 ON oi2.id = ps.order_item_id
          WHERE oi2.show_product_id = sp.id AND ps.checked_in_at IS NOT NULL AND ps.voided_at IS NULL))::integer AS checked_in,
    sh.currency
   FROM show_products sp JOIN products p ON p.id = sp.product_id JOIN shows sh ON sh.id = sp.show_id LEFT JOIN order_items oi ON oi.show_product_id = sp.id
  GROUP BY sp.id, sh.tour_id, p.name, p.includes_photo, sh.currency;

-- Checkout returns the show's currency (Stripe charges in it).
create or replace function public.create_checkout_hold(p_show_product uuid, p_qty integer, p_code text, p_client text default null, p_marketing boolean default false, p_answers jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  sp public.show_products; p public.products; s public.shows; a public.artists; st public.artist_stripe;
  v_left integer; v_fee integer; v_id uuid; v_bps integer;
begin
  if p_client is not null and (select count(*) from public.checkout_holds
      where client_key = p_client and status = 'pending' and expires_at > now()) >= 3 then
    raise exception 'You already have checkouts open. Finish or close one, or try again in 30 minutes.';
  end if;
  select * into sp from public.show_products where id = p_show_product for update;
  if not found or not sp.active or sp.is_sample then raise exception 'This package isn''t available.'; end if;
  select * into p from public.products where id = sp.product_id;
  select * into s from public.shows where id = sp.show_id;
  select * into a from public.artists where id = sp.artist_id;
  select * into st from public.artist_stripe where artist_id = sp.artist_id;
  if p.archived_at is not null or a.status <> 'approved' or s.status <> 'published' or s.show_date < current_date then
    raise exception 'This package isn''t available.';
  end if;
  if st.stripe_account_id is null or not st.charges_enabled then raise exception 'This artist isn''t taking payments yet.'; end if;
  if sp.on_sale_at is not null and sp.on_sale_at > now() then raise exception 'This package isn''t on sale yet.'; end if;
  if sp.off_sale_at is not null and sp.off_sale_at <= now() then raise exception 'Sales for this package have closed.'; end if;
  if sp.presale_code is not null and upper(trim(coalesce(p_code, ''))) <> upper(sp.presale_code) then
    raise exception 'That presale code isn''t right.';
  end if;
  if p_qty < 1 or p_qty > 4 then raise exception 'Choose between 1 and 4.'; end if;
  v_left := sp.capacity - public.units_taken(sp.id);
  if v_left <= 0 then raise exception 'Sold out.'; end if;
  if p_qty > v_left then raise exception 'Only % left.', v_left; end if;

  v_bps := public.effective_fee_bps(a.id, s.id);
  v_fee := round(sp.price_cents * p_qty * v_bps / 10000.0);
  insert into public.checkout_holds (artist_id, show_id, show_product_id, quantity, unit_price_cents, service_fee_cents, fee_bps, stripe_account_id, client_key, marketing_opt_in, answers)
  values (a.id, s.id, sp.id, p_qty, sp.price_cents, v_fee, v_bps, st.stripe_account_id, p_client, coalesce(p_marketing, false), p_answers) returning id into v_id;

  return jsonb_build_object(
    'hold_id', v_id, 'quantity', p_qty, 'unit_price_cents', sp.price_cents, 'service_fee_cents', v_fee,
    'stripe_account_id', st.stripe_account_id, 'artist_name', a.name, 'handle', a.handle, 'show_slug', s.slug,
    'product_name', p.name, 'image_url', p.image_url, 'city', s.city, 'region', s.region, 'venue', s.venue_name, 'show_date', s.show_date,
    'currency', s.currency
  );
end $$;
revoke execute on function public.create_checkout_hold(uuid, integer, text, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.create_checkout_hold(uuid, integer, text, text, boolean, jsonb) to service_role;



-- Storefront and discovery send each show's currency.
create or replace function public.get_storefront(p_handle text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', a.name, 'handle', a.handle, 'website', a.website, 'bio', a.bio, 'tagline', a.tagline,
    'verified', a.verified_at is not null,
    'brand_color', a.brand_color, 'accent_color', a.accent_color,
    'header_image_url', a.header_image_url, 'avatar_url', a.avatar_url,
    'fee_bps', a.fee_bps,
    'accepting_payments', coalesce((select charges_enabled from public.artist_stripe where artist_id = a.id), false),
    'shows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', s.slug, 'date', s.show_date, 'venue', s.venue_name, 'city', s.city,
        'region', s.region, 'country', s.country, 'tour', t.name, 'currency', s.currency,
        'fee_bps', public.effective_fee_bps(a.id, s.id),
        'packages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', sp.id, 'name', p.name, 'description', p.description, 'included', p.included,
            'image_url', p.image_url, 'includes_photo', p.includes_photo, 'price_cents', sp.price_cents,
            'presale', sp.presale_code is not null,
            'on_sale_at', sp.on_sale_at, 'off_sale_at', sp.off_sale_at,
            'remaining', greatest(0, sp.capacity - public.units_taken(sp.id)),
            'questions', p.questions
          ) order by sp.price_cents desc)
          from public.show_products sp join public.products p on p.id = sp.product_id
          where sp.show_id = s.id and sp.active and p.archived_at is null and not sp.is_sample
            and (sp.off_sale_at is null or sp.off_sale_at > now())
        ), '[]'::jsonb)
      ) order by s.show_date)
      from public.shows s join public.tours t on t.id = s.tour_id
      where s.artist_id = a.id and s.status = 'published' and s.show_date >= current_date
    ), '[]'::jsonb))
  from public.artists a
  where a.handle = lower(p_handle) and a.status = 'approved'
$$;
grant execute on function public.get_storefront(text) to anon, authenticated;

create or replace function public.get_discover()
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (
    select sh.id, sh.slug, sh.show_date, sh.city, sh.region, sh.country, sh.venue_name, sh.timezone, sh.doors_time, sh.currency,
           a.id as artist_id, a.name, a.handle, a.genres, a.avatar_url, a.header_image_url, a.brand_color, a.accent_color,
           (select min(sp.price_cents) from public.show_products sp join public.products p on p.id = sp.product_id
             where sp.show_id = sh.id and sp.active and not sp.is_sample and p.archived_at is null
               and (sp.off_sale_at is null or sp.off_sale_at > now())) as from_cents,
           (now() at time zone coalesce(sh.timezone, 'America/New_York'))::date = sh.show_date as tonight
    from public.shows sh join public.artists a on a.id = sh.artist_id
    where a.status = 'approved' and sh.status = 'published' and sh.show_date >= current_date - 1
  )
  select jsonb_build_object(
    'shows', coalesce((select jsonb_agg(jsonb_build_object(
        'slug', slug, 'date', show_date, 'city', city, 'region', region, 'country', country, 'venue', venue_name,
        'doors', doors_time, 'tonight', tonight, 'from_cents', from_cents, 'currency', currency,
        'artist', jsonb_build_object('name', name, 'handle', handle, 'genres', genres, 'avatar_url', avatar_url,
                                     'header_image_url', header_image_url, 'brand_color', brand_color, 'accent_color', accent_color))
      order by show_date, name) from s where from_cents is not null and show_date >= current_date - 1 and (tonight or show_date >= current_date)), '[]'),
    'artists', coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'handle', a.handle, 'genres', a.genres, 'avatar_url', a.avatar_url,
        'header_image_url', a.header_image_url, 'brand_color', a.brand_color, 'accent_color', a.accent_color, 'tagline', a.tagline,
        'upcoming', (select count(*) from s where s.artist_id = a.id and s.show_date >= current_date)) order by a.name)
      from public.artists a where a.status = 'approved'), '[]')
  )
$$;
grant execute on function public.get_discover() to anon, authenticated;

-- Daily report: headline numbers in USD, other currencies listed separately.
create or replace function public.platform_daily_report(p_day date)
returns jsonb language sql stable security definer set search_path = public as $$
  with bounds as (
    select (p_day::timestamp at time zone 'America/New_York') as d0,
           ((p_day + 1)::timestamp at time zone 'America/New_York') as d1,
           ((p_day - 1)::timestamp at time zone 'America/New_York') as prev0,
           ((p_day - 7)::timestamp at time zone 'America/New_York') as wk0,
           (date_trunc('month', p_day)::timestamp at time zone 'America/New_York') as m0
  ),
  allo as (select o.*, a.name as artist_name, a.handle from public.orders o join public.artists a on a.id = o.artist_id where not o.is_sample and not o.is_comp),
  o as (select * from allo where currency = 'usd'),  -- headline numbers are USD; other currencies are listed separately
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
    'other_currencies', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('currency', allo.currency, 'orders', count(*), 'gross_cents', sum(subtotal_cents), 'fees_cents', sum(service_fee_cents)) x
        from allo, bounds b where allo.currency <> 'usd' and allo.created_at >= b.d0 and allo.created_at < b.d1 group by allo.currency) t), '[]'),
    'shows_today', (select count(*) from public.shows s join public.artists a on a.id = s.artist_id
                     where a.status = 'approved' and s.status = 'published' and s.show_date = p_day + 1)
  )
$$;
revoke execute on function public.platform_daily_report(date) from public, anon, authenticated;
grant execute on function public.platform_daily_report(date) to service_role;
