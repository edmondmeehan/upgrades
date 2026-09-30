-- 1. Self-serve account deletion. History stays (orders, audit log, check-ins); who did it becomes null.
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and c.confdeltype = 'a'
  loop
    execute format('alter table %s alter column %I drop not null', r.tbl, r.col);
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references public.profiles (id) on delete set null', r.tbl, r.conname, r.col);
  end loop;
end $$;

/** What deleting my account would do: artists that go with me, artists that block it. */
create or replace function public.account_deletion_check()
returns jsonb language sql stable security definer set search_path = public as $$
  with mine as (
    select a.id, a.name,
      (select count(*) from public.artist_members m2 where m2.artist_id = a.id and m2.role = 'owner' and m2.user_id <> auth.uid()) as other_owners,
      exists (select 1 from public.orders o where o.artist_id = a.id and not o.is_sample) as has_sales
    from public.artist_members m join public.artists a on a.id = m.artist_id
    where m.user_id = auth.uid() and m.role = 'owner'
  )
  select jsonb_build_object(
    'delete_artists', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name)) from mine where other_owners = 0 and not has_sales), '[]'),
    'blocked_artists', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name)) from mine where other_owners = 0 and has_sales), '[]'),
    'last_admin', (select is_super_admin from public.profiles where id = auth.uid())
                  and (select count(*) from public.profiles where is_super_admin) <= 1
  )
$$;

/** Runs before the login is removed: deletes artists that go with this account, logs it. Returns false if blocked. */
create or replace function public.prepare_account_deletion()
returns boolean language plpgsql security definer set search_path = public as $$
declare c jsonb := public.account_deletion_check(); r record;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if jsonb_array_length(c->'blocked_artists') > 0 or (c->>'last_admin')::boolean then return false; end if;
  for r in select (e->>'id')::uuid as id, e->>'name' as name from jsonb_array_elements(c->'delete_artists') e loop
    delete from public.checkout_holds where artist_id = r.id;
    delete from public.orders where artist_id = r.id;          -- sample data only; real sales block deletion
    delete from public.show_products where artist_id = r.id;
    delete from public.artists where id = r.id;
    insert into public.audit_log (actor_id, action, target_type, target_id, detail)
      values (auth.uid(), 'artist.deleted_with_account', 'artist', r.id::text, jsonb_build_object('name', r.name));
  end loop;
  insert into public.audit_log (actor_id, action, target_type, target_id) values (auth.uid(), 'account.deleted', 'profile', auth.uid()::text);
  return true;
end $$;
revoke execute on function public.account_deletion_check(), public.prepare_account_deletion() from public, anon;
grant execute on function public.account_deletion_check(), public.prepare_account_deletion() to authenticated;

-- 2. Discovery: genres on artists, and one public read for the fan home page.
alter table public.artists add column genres text[] not null default '{}'
  check (cardinality(genres) <= 3);
grant update (genres) on public.artists to authenticated;

create or replace function public.get_discover()
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (
    select sh.id, sh.slug, sh.show_date, sh.city, sh.region, sh.country, sh.venue_name, sh.timezone, sh.doors_time,
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
        'doors', doors_time, 'tonight', tonight, 'from_cents', from_cents,
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
