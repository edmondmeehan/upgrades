-- Fix: audit_log columns are entity / entity_id / details. Use log_event like everything else.
create or replace function public.prepare_account_deletion()
returns boolean language plpgsql security definer set search_path = public as $$
declare c jsonb := public.account_deletion_check(); r record;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if jsonb_array_length(c->'blocked_artists') > 0 or (c->>'last_admin')::boolean then return false; end if;
  for r in select (e->>'id')::uuid as id, e->>'name' as name from jsonb_array_elements(c->'delete_artists') e loop
    delete from public.checkout_holds where artist_id = r.id;
    delete from public.orders where artist_id = r.id;
    delete from public.show_products where artist_id = r.id;
    delete from public.artists where id = r.id;
    perform public.log_event(null, 'artist.deleted_with_account', 'artist', r.id::text, jsonb_build_object('name', r.name));
  end loop;
  perform public.log_event(null, 'account.deleted', 'profile', auth.uid()::text, '{}'::jsonb);
  return true;
end $$;
revoke execute on function public.prepare_account_deletion() from public, anon;
grant execute on function public.prepare_account_deletion() to authenticated;
