-- Fan checkout: inventory holds while a fan is on Stripe Checkout, and atomic fulfillment into
-- orders, order items, passes and fans. Only the server (service role) calls these.

create table public.checkout_holds (
  id                uuid primary key default gen_random_uuid(),
  artist_id         uuid not null references public.artists (id) on delete cascade,
  show_id           uuid not null references public.shows (id) on delete cascade,
  show_product_id   uuid not null references public.show_products (id) on delete restrict,
  quantity          integer not null check (quantity between 1 and 10),
  unit_price_cents  integer not null,
  service_fee_cents integer not null,           -- total P&T fee for this order
  fee_bps           integer not null,
  stripe_account_id text not null,
  stripe_session_id text unique,
  status            text not null default 'pending' check (status in ('pending', 'completed', 'expired')),
  order_id          uuid references public.orders (id) on delete set null,
  expires_at        timestamptz not null default now() + interval '35 minutes',
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);
create index on public.checkout_holds (show_product_id, status, expires_at);
alter table public.checkout_holds enable row level security;
revoke all on public.checkout_holds from anon, authenticated;

create or replace function public.units_taken(p_show_product uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(oi.quantity - oi.refunded_quantity) from public.order_items oi
                   join public.orders o on o.id = oi.order_id
                   where oi.show_product_id = p_show_product and o.status <> 'refunded'), 0)::int
       + coalesce((select sum(h.quantity) from public.checkout_holds h
                   where h.show_product_id = p_show_product and h.status = 'pending' and h.expires_at > now()), 0)::int
$$;

/** Validates a purchase and reserves the units for the length of a Checkout session. */
create or replace function public.create_checkout_hold(p_show_product uuid, p_qty integer, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  sp public.show_products; p public.products; s public.shows; a public.artists; st public.artist_stripe;
  v_left integer; v_fee integer; v_id uuid;
begin
  select * into sp from public.show_products where id = p_show_product for update; -- serializes buyers of this package
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

  v_fee := round(sp.price_cents * p_qty * a.fee_bps / 10000.0);
  insert into public.checkout_holds (artist_id, show_id, show_product_id, quantity, unit_price_cents, service_fee_cents, fee_bps, stripe_account_id)
  values (a.id, s.id, sp.id, p_qty, sp.price_cents, v_fee, a.fee_bps, st.stripe_account_id) returning id into v_id;

  return jsonb_build_object(
    'hold_id', v_id, 'quantity', p_qty, 'unit_price_cents', sp.price_cents, 'service_fee_cents', v_fee,
    'stripe_account_id', st.stripe_account_id, 'artist_name', a.name, 'handle', a.handle, 'show_slug', s.slug,
    'product_name', p.name, 'image_url', p.image_url, 'city', s.city, 'region', s.region, 'venue', s.venue_name, 'show_date', s.show_date
  );
end $$;

create or replace function public.attach_checkout_session(p_hold uuid, p_session text)
returns void language sql security definer set search_path = public as $$
  update public.checkout_holds set stripe_session_id = p_session where id = p_hold;
$$;

create or replace function public.release_checkout_hold(p_session text)
returns void language sql security definer set search_path = public as $$
  update public.checkout_holds set status = 'expired' where stripe_session_id = p_session and status = 'pending';
$$;

/** Turns a paid Checkout session into an order. Safe to call more than once for the same payment. */
create or replace function public.fulfill_checkout(
  p_hold uuid, p_email text, p_name text, p_payment_intent text, p_charge text,
  p_application_fee text, p_stripe_fee integer, p_total integer
) returns uuid language plpgsql security definer set search_path = public as $$
declare h public.checkout_holds; v_fan uuid; v_order uuid; v_item uuid; v_email text := lower(trim(p_email));
begin
  select * into h from public.checkout_holds where id = p_hold for update;
  if not found then raise exception 'Unknown checkout'; end if;
  if h.order_id is not null then return h.order_id; end if;
  select id into v_order from public.orders where stripe_payment_intent_id = p_payment_intent;
  if v_order is not null then
    update public.checkout_holds set status = 'completed', order_id = v_order, completed_at = coalesce(completed_at, now()) where id = h.id;
    return v_order;
  end if;

  insert into public.fans (artist_id, email, name)
  values (h.artist_id, v_email, nullif(trim(p_name), ''))
  on conflict (artist_id, email) do update set name = coalesce(excluded.name, public.fans.name)
  returning id into v_fan;

  insert into public.orders (artist_id, show_id, fan_id, status, subtotal_cents, service_fee_cents, total_cents, stripe_fee_cents,
    stripe_payment_intent_id, stripe_charge_id, stripe_application_fee_id)
  values (h.artist_id, h.show_id, v_fan, 'paid', h.unit_price_cents * h.quantity, h.service_fee_cents,
    coalesce(p_total, h.unit_price_cents * h.quantity + h.service_fee_cents), coalesce(p_stripe_fee, 0),
    p_payment_intent, p_charge, p_application_fee)
  returning id into v_order;

  insert into public.order_items (order_id, artist_id, show_product_id, quantity, unit_price_cents)
  values (v_order, h.artist_id, h.show_product_id, h.quantity, h.unit_price_cents) returning id into v_item;

  insert into public.passes (order_item_id, artist_id, show_id)
  select v_item, h.artist_id, h.show_id from generate_series(1, h.quantity);

  update public.checkout_holds set status = 'completed', order_id = v_order, completed_at = now() where id = h.id;
  return v_order;
end $$;

create or replace function public.set_order_stripe_fee(p_payment_intent text, p_fee integer)
returns void language sql security definer set search_path = public as $$
  update public.orders set stripe_fee_cents = p_fee where stripe_payment_intent_id = p_payment_intent and stripe_fee_cents = 0;
$$;

revoke execute on function public.units_taken(uuid), public.create_checkout_hold(uuid, integer, text), public.attach_checkout_session(uuid, text),
  public.release_checkout_hold(text), public.fulfill_checkout(uuid, text, text, text, text, text, integer, integer),
  public.set_order_stripe_fee(text, integer) from public, anon, authenticated;
grant execute on function public.units_taken(uuid), public.create_checkout_hold(uuid, integer, text), public.attach_checkout_session(uuid, text),
  public.release_checkout_hold(text), public.fulfill_checkout(uuid, text, text, text, text, text, integer, integer),
  public.set_order_stripe_fee(text, integer) to service_role;

-- Storefront "left" counts now include units held by fans who are mid-checkout.
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
        'region', s.region, 'country', s.country, 'tour', t.name,
        'packages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', sp.id, 'name', p.name, 'description', p.description, 'included', p.included,
            'image_url', p.image_url, 'includes_photo', p.includes_photo, 'price_cents', sp.price_cents,
            'presale', sp.presale_code is not null,
            'on_sale_at', sp.on_sale_at, 'off_sale_at', sp.off_sale_at,
            'remaining', greatest(0, sp.capacity - public.units_taken(sp.id))
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
