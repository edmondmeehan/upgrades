-- Homepage: send show coordinates so "near you" can use real distance.
create or replace function public.get_discover()
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (
    select sh.id, sh.slug, sh.show_date, sh.city, sh.region, sh.country, sh.venue_name, sh.timezone, sh.doors_time, sh.currency, sh.latitude, sh.longitude,
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
        'doors', doors_time, 'tonight', tonight, 'from_cents', from_cents, 'currency', currency, 'lat', latitude, 'lng', longitude,
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

