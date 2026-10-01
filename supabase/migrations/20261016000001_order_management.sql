-- Order management: comp passes, guest names per pass, and check-in showing the guest's name.

alter table public.orders add column is_comp boolean not null default false, add column comp_note text,
  add column created_by uuid references public.profiles (id) on delete set null;
alter table public.passes add column attendee_name text check (attendee_name is null or char_length(attendee_name) <= 120),
  add column attendee_email text check (attendee_email is null or char_length(attendee_email) <= 200),
  add column sent_to_attendee_at timestamptz;

/** Free passes from the artist (crew, radio winners, friends). Counts against the package's quantity unless told not to. */
create or replace function public.create_comp_order(p_show_product uuid, p_qty integer, p_name text, p_email text, p_note text, p_allow_over boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare sp public.show_products; v_fan uuid; v_order uuid; v_item uuid; v_hold uuid; v_left int; v_email text := lower(trim(p_email));
begin
  select * into sp from public.show_products where id = p_show_product for update;
  if not found or not public.can_edit_shows(sp.artist_id) then raise exception 'Not allowed'; end if;
  if p_qty < 1 or p_qty > 50 then raise exception 'Choose between 1 and 50 passes.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email for the guest.'; end if;
  v_left := sp.capacity - public.units_taken(sp.id);
  if not coalesce(p_allow_over, false) and p_qty > v_left then raise exception 'Only % left for this package. Tick "Allow over capacity" to add them anyway.', greatest(v_left, 0); end if;

  insert into public.fans (artist_id, email, name) values (sp.artist_id, v_email, nullif(trim(p_name), ''))
  on conflict (artist_id, email) do update set name = coalesce(excluded.name, public.fans.name) returning id into v_fan;
  insert into public.orders (artist_id, show_id, fan_id, status, subtotal_cents, service_fee_cents, total_cents, stripe_fee_cents, is_comp, comp_note, created_by)
  values (sp.artist_id, sp.show_id, v_fan, 'paid', 0, 0, 0, 0, true, nullif(trim(p_note), ''), auth.uid()) returning id into v_order;
  insert into public.order_items (order_id, artist_id, show_product_id, quantity, unit_price_cents)
  values (v_order, sp.artist_id, sp.id, p_qty, 0) returning id into v_item;
  insert into public.passes (order_item_id, artist_id, show_id) select v_item, sp.artist_id, sp.show_id from generate_series(1, p_qty);
  -- An order page link, same as paid orders have.
  insert into public.checkout_holds (artist_id, show_id, show_product_id, quantity, unit_price_cents, service_fee_cents, fee_bps, stripe_account_id, status, order_id, completed_at)
  values (sp.artist_id, sp.show_id, sp.id, p_qty, 0, 0, 0, 'comp', 'completed', v_order, now()) returning id into v_hold;
  perform public.log_event(sp.artist_id, 'order.comp_created', 'order', v_order::text, jsonb_build_object('qty', p_qty, 'email', v_email));
  return jsonb_build_object('order_id', v_order, 'hold_id', v_hold);
end $$;

/** Artist sets the guest name/email on a pass. */
create or replace function public.set_pass_guest(p_pass uuid, p_name text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare ps public.passes;
begin
  select * into ps from public.passes where id = p_pass;
  if not found or not public.can_edit_shows(ps.artist_id) then raise exception 'Not allowed'; end if;
  update public.passes set attendee_name = nullif(trim(p_name), ''), attendee_email = nullif(lower(trim(p_email)), '') where id = p_pass;
  perform public.log_event(ps.artist_id, 'pass.guest_set', 'pass', p_pass::text, jsonb_build_object('name', p_name));
end $$;

revoke execute on function public.create_comp_order(uuid, integer, text, text, text, boolean), public.set_pass_guest(uuid, text, text) from public, anon;
grant execute on function public.create_comp_order(uuid, integer, text, text, text, boolean), public.set_pass_guest(uuid, text, text) to authenticated, service_role;

-- Check-in shows the guest's name when one is set.
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
      'guest', v_n, 'of', oi.quantity, 'at', ps.checked_in_at, 'by', v_by);
  end if;

  update public.passes set checked_in_at = now(), checked_in_by = auth.uid() where id = ps.id;
  perform public.log_event(v_artist, 'checkin.in', 'pass', ps.id::text, jsonb_build_object('show', p_show));
  return jsonb_build_object('result', 'ok', 'pass_id', ps.id, 'code', v_code, 'name', v_name, 'email', v_email, 'package', v_pkg,
    'guest', v_n, 'of', oi.quantity);
end $$;
revoke execute on function public.check_in_pass(uuid, text) from public, anon;
grant execute on function public.check_in_pass(uuid, text) to authenticated;
