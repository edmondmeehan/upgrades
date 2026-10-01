-- Door staff: a team role that can only check fans in. Plus a guest list made for the door (and offline use).

/** Who can check fans in: owners, reps, door staff, P&T. */
create or replace function public.can_check_in(p_artist uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_edit_shows(p_artist) or public.member_role(p_artist) = 'door'
$$;
grant execute on function public.can_check_in(uuid) to authenticated;

-- Door staff don't see orders or what anyone paid.
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select to authenticated
  using ((public.is_member(artist_id) and public.member_role(artist_id) is distinct from 'door') or public.is_super_admin());
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items for select to authenticated
  using ((public.is_member(artist_id) and public.member_role(artist_id) is distinct from 'door') or public.is_super_admin());

/** The door list for one show: names, packages and answers, no emails or money for door staff. */
create or replace function public.checkin_guest_list(p_show uuid)
returns table (pass_id uuid, code text, name text, buyer text, email text, pkg text, guest integer, of_qty integer,
  checked_in_at timestamptz, is_void boolean, is_comp boolean, answers jsonb)
language sql stable security definer set search_path = public as $$
  select ps.id, ps.code, coalesce(ps.attendee_name, f.name, split_part(f.email, '@', 1)),
    case when ps.attendee_name is not null then coalesce(f.name, split_part(f.email, '@', 1)) end,
    case when public.can_edit_shows(s.artist_id) then f.email end,
    p.name,
    (row_number() over (partition by oi.id order by ps.code))::int, oi.quantity,
    ps.checked_in_at, (ps.voided_at is not null or o.status = 'refunded'), o.is_comp, ps.answers
  from public.passes ps
  join public.shows s on s.id = ps.show_id
  join public.order_items oi on oi.id = ps.order_item_id
  join public.orders o on o.id = oi.order_id
  left join public.fans f on f.id = o.fan_id
  join public.show_products sp on sp.id = oi.show_product_id
  join public.products p on p.id = sp.product_id
  where ps.show_id = p_show and not o.is_sample and public.can_check_in(s.artist_id)
  order by 3
$$;
revoke execute on function public.checkin_guest_list(uuid) from public, anon;
grant execute on function public.checkin_guest_list(uuid) to authenticated;

create or replace function public.undo_check_in(p_pass uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ps public.passes;
begin
  select * into ps from public.passes where id = p_pass;
  if not found or not public.can_check_in(ps.artist_id) then raise exception 'Not allowed'; end if;
  update public.passes set checked_in_at = null, checked_in_by = null where id = p_pass;
  perform public.log_event(ps.artist_id, 'checkin.undo', 'pass', ps.id::text, jsonb_build_object('show', ps.show_id));
end $$;

-- Owners invite anyone; reps can invite door staff.
create or replace function public.create_invitation(p_artist uuid, p_email text, p_role public.member_role)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text; v_email text := lower(trim(p_email));
begin
  if not (public.is_owner(p_artist) or public.is_super_admin() or (p_role = 'door' and public.member_role(p_artist) = 'rep')) then
    raise exception 'Only the account owner can invite people';
  end if;
  if p_role = 'owner' then raise exception 'Invite as a rep, accountant or door staff'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;
  if exists (select 1 from public.artist_members m join public.profiles p on p.id = m.user_id
             where m.artist_id = p_artist and p.email = v_email) then
    raise exception '% is already on this team', v_email;
  end if;
  update public.invitations set revoked_at = now()
    where artist_id = p_artist and email = v_email and accepted_at is null and revoked_at is null;
  insert into public.invitations (artist_id, email, role, invited_by)
  values (p_artist, v_email, p_role, auth.uid()) returning token into v_token;
  perform public.log_event(p_artist, 'team.invited', 'invitation', v_email, jsonb_build_object('role', p_role));
  return v_token;
end $$;

create or replace function public.check_in_pass(p_show uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := public.normalize_pass_code(p_code); ps public.passes; oi public.order_items; o public.orders;
  v_artist uuid; v_name text; v_email text; v_pkg text; v_n int; v_by text; v_other record;
begin
  select artist_id into v_artist from public.shows where id = p_show;
  if v_artist is null or not public.can_check_in(v_artist) then raise exception 'Not allowed'; end if;
  if v_code = '' then return jsonb_build_object('result', 'not_found', 'code', v_code); end if;

  select * into ps from public.passes where code = v_code and artist_id = v_artist for update;
  if not found then return jsonb_build_object('result', 'not_found', 'code', v_code); end if;
  select * into oi from public.order_items where id = ps.order_item_id;
  select * into o from public.orders where id = oi.order_id;
  select f.name, f.email into v_name, v_email from public.fans f where f.id = o.fan_id;
  if not public.can_edit_shows(v_artist) then v_email := null; end if;  -- door staff don't see emails
  if v_name is null and v_email is not null then v_name := split_part(v_email, '@', 1); end if;
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
