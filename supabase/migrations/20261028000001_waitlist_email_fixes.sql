-- Stricter waitlist email check (two-letter-or-longer ending), and settle sends: failures back in line, undeliverable off the list.
create or replace function public.join_waitlist(p_show_product uuid, p_email text, p_name text, p_qty integer, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare sp public.show_products; v_email text := lower(trim(p_email)); w public.waitlist; v_pos int;
begin
  if (select count(*) from public.waitlist_attempts where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('result', 'throttled');
  end if;
  insert into public.waitlist_attempts (ip_hash) values (p_ip_hash);
  delete from public.waitlist_attempts where created_at < now() - interval '1 day';
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then return jsonb_build_object('result', 'bad_email'); end if;
  select * into sp from public.show_products where id = p_show_product and active and not is_sample;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  insert into public.waitlist (show_product_id, artist_id, show_id, email, name, qty)
  values (sp.id, sp.artist_id, sp.show_id, v_email, nullif(trim(p_name), ''), least(greatest(coalesce(p_qty, 1), 1), 4))
  on conflict (show_product_id, email) do update set
    qty = excluded.qty, name = coalesce(excluded.name, public.waitlist.name),
    left_at = null, notified_at = case when public.waitlist.left_at is not null then null else public.waitlist.notified_at end
  returning * into w;
  select count(*) into v_pos from public.waitlist where show_product_id = sp.id and converted_at is null and left_at is null and created_at <= w.created_at;
  return jsonb_build_object('result', 'ok', 'position', v_pos, 'token', w.token, 'already_notified', w.notified_at is not null);
end $$;

alter table public.waitlist add column if not exists bounced_at timestamptz;
create or replace function public.settle_waitlist_notifications(p_retry uuid[], p_bad uuid[])
returns void language sql security definer set search_path = public as $$
  update public.waitlist set notified_at = null where id = any(coalesce(p_retry, '{}'));
  update public.waitlist set bounced_at = now(), left_at = coalesce(left_at, now()) where id = any(coalesce(p_bad, '{}'));
$$;
revoke execute on function public.settle_waitlist_notifications(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.settle_waitlist_notifications(uuid[], uuid[]) to service_role;
