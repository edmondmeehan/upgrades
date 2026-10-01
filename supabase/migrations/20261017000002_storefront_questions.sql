-- Storefront sends each package's checkout questions to the buy form.
create or replace function public.get_storefront(p_handle text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', a.name, 'handle', a.handle, 'website', a.website, 'bio', a.bio, 'tagline', a.tagline,
    'verified', a.verified_at is not null,
    'brand_color', a.brand_color, 'accent_color', a.accent_color,
    'header_image_url', a.header_image_url, 'avatar_url', a.avatar_url,
    'fee_bps', a.fee_bps,
    'accepting_payments', coalesce((select charges_enabled from public.artist_stripe where artist_id = a.id), false),
    'shows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', s.slug, 'date', s.show_date, 'venue', s.venue_name, 'city', s.city,
        'region', s.region, 'country', s.country, 'tour', t.name,
        'fee_bps', public.effective_fee_bps(a.id, s.id),
        'packages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', sp.id, 'name', p.name, 'description', p.description, 'included', p.included,
            'image_url', p.image_url, 'includes_photo', p.includes_photo, 'price_cents', sp.price_cents,
            'presale', sp.presale_code is not null,
            'on_sale_at', sp.on_sale_at, 'off_sale_at', sp.off_sale_at,
            'remaining', greatest(0, sp.capacity - public.units_taken(sp.id)),
            'questions', p.questions
          ) order by sp.price_cents desc)
          from public.show_products sp join public.products p on p.id = sp.product_id
          where sp.show_id = s.id and sp.active and p.archived_at is null and not sp.is_sample
            and (sp.off_sale_at is null or sp.off_sale_at > now())
        ), '[]'::jsonb)
      ) order by s.show_date)
      from public.shows s join public.tours t on t.id = s.tour_id
      where s.artist_id = a.id and s.status = 'published' and s.show_date >= current_date
    ), '[]'::jsonb))
  from public.artists a
  where a.handle = lower(p_handle) and a.status = 'approved'
$$;
grant execute on function public.get_storefront(text) to anon, authenticated;
