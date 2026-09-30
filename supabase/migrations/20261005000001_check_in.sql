-- Door check-in: scan or look up a pass, check it in (or undo), for the artist's owner, reps, and P&T.

create or replace function public.normalize_pass_code(p text) returns text
language sql immutable as $$
  select upper(regexp_replace(regexp_replace(coalesce(p, ''), '^.*[:/]', ''), '[^A-Za-z0-9]', '', 'g'))
$$;

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
  select p.name into v_pkg from public.show_products sp join public.products p on p.id = sp.product_id where sp.id = oi.show_product_id;
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

create or replace function public.undo_check_in(p_pass uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ps public.passes;
begin
  select * into ps from public.passes where id = p_pass;
  if not found or not public.can_edit_shows(ps.artist_id) then raise exception 'Not allowed'; end if;
  update public.passes set checked_in_at = null, checked_in_by = null where id = p_pass;
  perform public.log_event(ps.artist_id, 'checkin.undo', 'pass', ps.id::text, jsonb_build_object('show', ps.show_id));
end $$;

revoke execute on function public.check_in_pass(uuid, text), public.undo_check_in(uuid) from public, anon;
grant execute on function public.check_in_pass(uuid, text), public.undo_check_in(uuid) to authenticated;
grant execute on function public.normalize_pass_code(text) to authenticated, service_role;
