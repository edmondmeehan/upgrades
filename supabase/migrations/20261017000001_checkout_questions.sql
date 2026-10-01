-- Checkout questions: artists ask fans things at checkout (per order or per guest); answers land on the order and each pass.

alter table public.products add column questions jsonb not null default '[]'::jsonb
  check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 6);
alter table public.checkout_holds add column answers jsonb;
alter table public.orders add column answers jsonb;
alter table public.passes add column answers jsonb;

drop function if exists public.create_checkout_hold(uuid, integer, text, text, boolean);
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
    'product_name', p.name, 'image_url', p.image_url, 'city', s.city, 'region', s.region, 'venue', s.venue_name, 'show_date', s.show_date
  );
end $$;
revoke execute on function public.create_checkout_hold(uuid, integer, text, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.create_checkout_hold(uuid, integer, text, text, boolean, jsonb) to service_role;


/** When a checkout becomes an order, copy the fan's answers onto the order and onto each pass (in code order). */
create or replace function public.apply_hold_answers() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.order_id is not null and old.order_id is null and new.answers is not null then
    update public.orders set answers = new.answers -> 'order' where id = new.order_id;
    update public.passes p set answers = (new.answers -> 'passes') -> (x.rn - 1)::int
    from (select ps.id, row_number() over (order by ps.code) as rn
          from public.passes ps join public.order_items oi on oi.id = ps.order_item_id where oi.order_id = new.order_id) x
    where p.id = x.id and jsonb_typeof(new.answers -> 'passes') = 'array';
  end if;
  return new;
end $$;
create trigger checkout_holds_answers after update of order_id on public.checkout_holds
  for each row execute function public.apply_hold_answers();
revoke execute on function public.apply_hold_answers() from public, anon, authenticated;

-- Check-in shows a pass's answers (e.g. T-shirt size) when scanned.
create or replace function public.check_in_pass(p_show uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := public.normalize_pass_code(p_code); ps public.passes; oi public.order_items; o public.orders;
  v_artist uuid; v_name text; v_email text; v_pkg text; v_n int; v_by text; v_other record;
begin
  select artist_id into v_artist from public.shows where id = p_show;
  if v_artist is null or not public.can_edit_shows(v_artist) then raise exception 'Not allowed'; end if;
  if v_code = '' then return jsonb_build_object('result', 'not_found', 'code', v_code); end if;

  select * into ps from public.passes where code = v_code and artist_id = v_artist for update;
  if not found then return jsonb_build_object('result', 'not_found', 'code', v_code); end if;
  select * into oi from public.order_items where id = ps.order_item_id;
  select * into o from public.orders where id = oi.order_id;
  select f.name, f.email into v_name, v_email from public.fans f where f.id = o.fan_id;
  if ps.attendee_name is not null then v_name := ps.attendee_name || ' (via ' || coalesce(v_name, v_email) || ')'; end if;
  select p.name into v_pkg from public.show_products sp join public.products p on p.id = sp.product_id where sp.id = oi.show_product_id;
  if o.is_comp then v_pkg := v_pkg || ', comp'; end if;
  select count(*) into v_n from public.passes where order_item_id = ps.order_item_id and code <= ps.code;

  if ps.show_id <> p_show then
    select s.city, s.show_date into v_other from public.shows s where s.id = ps.show_id;
    return jsonb_build_object('result', 'wrong_show', 'code', v_code, 'name', v_name, 'package', v_pkg, 'other_city', v_other.city, 'other_date', v_other.show_date);
  end if;
  if ps.voided_at is not null or o.status = 'refunded' then
    return jsonb_build_object('result', 'void', 'code', v_code, 'name', v_name, 'package', v_pkg);
  end if;
  if ps.checked_in_at is not null then
    select coalesce(name, email) into v_by from public.profiles where id = ps.checked_in_by;
    return jsonb_build_object('result', 'already', 'pass_id', ps.id, 'code', v_code, 'name', v_name, 'email', v_email, 'package', v_pkg,
      'guest', v_n, 'of', oi.quantity, 'at', ps.checked_in_at, 'by', v_by, 'answers', ps.answers);
  end if;

  update public.passes set checked_in_at = now(), checked_in_by = auth.uid() where id = ps.id;
  perform public.log_event(v_artist, 'checkin.in', 'pass', ps.id::text, jsonb_build_object('show', p_show));
  return jsonb_build_object('result', 'ok', 'pass_id', ps.id, 'code', v_code, 'name', v_name, 'email', v_email, 'package', v_pkg,
    'guest', v_n, 'of', oi.quantity, 'answers', ps.answers);
end $$;
revoke execute on function public.check_in_pass(uuid, text) from public, anon;
grant execute on function public.check_in_pass(uuid, text) to authenticated;
