-- Fan order lookup: a short confirmation number on every order, plus the billing ZIP to match against.

create or replace function public.new_confirmation_code() returns text
language plpgsql volatile set search_path = public as $$
declare v text; alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- no 0/O/1/I/L
begin
  loop
    v := 'OTU-' || (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.orders where confirmation_code = v);
  end loop;
  return v;
end $$;

alter table public.orders add column confirmation_code text;
alter table public.orders add column billing_postal_code text;
update public.orders set confirmation_code = public.new_confirmation_code() where confirmation_code is null;
alter table public.orders alter column confirmation_code set default public.new_confirmation_code();
alter table public.orders alter column confirmation_code set not null;
create unique index orders_confirmation_code_key on public.orders (confirmation_code);

-- Fulfillment now also stores the billing ZIP from Checkout.
drop function if exists public.fulfill_checkout(uuid, text, text, text, text, text, integer, integer);
create or replace function public.fulfill_checkout(
  p_hold uuid, p_email text, p_name text, p_payment_intent text, p_charge text,
  p_application_fee text, p_stripe_fee integer, p_total integer, p_postal text default null
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
    stripe_payment_intent_id, stripe_charge_id, stripe_application_fee_id, billing_postal_code)
  values (h.artist_id, h.show_id, v_fan, 'paid', h.unit_price_cents * h.quantity, h.service_fee_cents,
    coalesce(p_total, h.unit_price_cents * h.quantity + h.service_fee_cents), coalesce(p_stripe_fee, 0),
    p_payment_intent, p_charge, p_application_fee, nullif(upper(regexp_replace(coalesce(p_postal, ''), '\s', '', 'g')), ''))
  returning id into v_order;

  insert into public.order_items (order_id, artist_id, show_product_id, quantity, unit_price_cents)
  values (v_order, h.artist_id, h.show_product_id, h.quantity, h.unit_price_cents) returning id into v_item;

  insert into public.passes (order_item_id, artist_id, show_id)
  select v_item, h.artist_id, h.show_id from generate_series(1, h.quantity);

  update public.checkout_holds set status = 'completed', order_id = v_order, completed_at = now() where id = h.id;
  return v_order;
end $$;
revoke execute on function public.fulfill_checkout(uuid, text, text, text, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.fulfill_checkout(uuid, text, text, text, text, text, integer, integer, text) to service_role;

-- Throttle for the public lookup form (IP hashed, never stored raw).
create table public.order_lookup_attempts (
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
create index on public.order_lookup_attempts (ip_hash, created_at);
alter table public.order_lookup_attempts enable row level security;
revoke all on public.order_lookup_attempts from anon, authenticated;

/** Finds an order by confirmation number plus last name, email, or billing ZIP. Returns the order page key or null. */
create or replace function public.lookup_order(p_code text, p_proof text, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_proof text := lower(trim(coalesce(p_proof, ''))); r record; v_recent int;
begin
  select count(*) into v_recent from public.order_lookup_attempts where ip_hash = p_ip_hash and created_at > now() - interval '15 minutes';
  if v_recent >= 10 then return jsonb_build_object('result', 'throttled'); end if;
  insert into public.order_lookup_attempts (ip_hash) values (p_ip_hash);
  delete from public.order_lookup_attempts where created_at < now() - interval '1 day';

  if v_code like 'OTU%' then v_code := substr(v_code, 4); end if;
  select o.id, o.billing_postal_code, f.email, f.name, h.id as hold_id into r
  from public.orders o
  left join public.fans f on f.id = o.fan_id
  left join public.checkout_holds h on h.order_id = o.id
  where o.confirmation_code = 'OTU-' || v_code and not o.is_sample;
  if not found or v_proof = '' or r.hold_id is null then return jsonb_build_object('result', 'no_match'); end if;

  if v_proof = lower(r.email)
     or (r.billing_postal_code is not null and upper(regexp_replace(v_proof, '\s', '', 'g')) = r.billing_postal_code)
     or (r.name is not null and v_proof = lower(regexp_replace(trim(r.name), '^.*\s', '')))
     or (r.name is not null and v_proof = lower(trim(r.name))) then
    return jsonb_build_object('result', 'ok', 'hold_id', r.hold_id);
  end if;
  return jsonb_build_object('result', 'no_match');
end $$;
revoke execute on function public.lookup_order(text, text, text), public.new_confirmation_code() from public, anon, authenticated;
grant execute on function public.lookup_order(text, text, text) to service_role;
grant execute on function public.new_confirmation_code() to service_role, authenticated;
