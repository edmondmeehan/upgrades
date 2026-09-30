-- Public image bucket for storefront headers, profile images, and package images.
-- Files live under <artist_id>/...; the artist's owner and reps can upload, anyone can view.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('storefront', 'storefront', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create or replace function public.storage_artist_editable(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  begin v := (storage.foldername(p_name))[1]::uuid; exception when others then return false; end;
  return public.can_edit_shows(v);
end $$;
grant execute on function public.storage_artist_editable(text) to authenticated;

create policy storefront_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'storefront' and public.storage_artist_editable(name));
create policy storefront_update on storage.objects for update to authenticated
  using (bucket_id = 'storefront' and public.storage_artist_editable(name));
create policy storefront_delete on storage.objects for delete to authenticated
  using (bucket_id = 'storefront' and public.storage_artist_editable(name));
