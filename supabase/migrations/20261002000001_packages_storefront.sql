-- VIP package builder and storefront design.

-- ── Packages ─────────────────────────────────────────────────
alter table public.products add column included text[] not null default '{}';
alter table public.products add column image_url text;
alter table public.products add column archived_at timestamptz;
alter table public.products add column updated_at timestamptz not null default now();
alter table public.products add constraint products_name_len check (char_length(name) between 1 and 120);

alter table public.show_products add column active boolean not null default true;
alter table public.show_products add constraint show_products_sale_window check (off_sale_at is null or on_sale_at is null or off_sale_at > on_sale_at);

create or replace function public.enforce_show_product_links() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select artist_id from public.shows where id = new.show_id) is distinct from new.artist_id
     or (select artist_id from public.products where id = new.product_id) is distinct from new.artist_id then
    raise exception 'Package, show and artist do not match';
  end if;
  return new;
end $$;
create trigger show_products_links before insert or update on public.show_products
  for each row execute function public.enforce_show_product_links();
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
revoke execute on function public.enforce_show_product_links() from public, anon, authenticated;

-- Artists and reps build packages; money tables stay server-only.
grant insert, update, delete on public.products, public.show_products to authenticated;
create policy products_write on public.products for all to authenticated
  using (public.can_edit_shows(artist_id)) with check (public.can_edit_shows(artist_id) and not is_sample);
create policy show_products_write on public.show_products for all to authenticated
  using (public.can_edit_shows(artist_id)) with check (public.can_edit_shows(artist_id) and not is_sample);

-- ── Storefront design ────────────────────────────────────────
alter table public.artists add column brand_color text check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');
alter table public.artists add column accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$');
alter table public.artists add column header_image_url text;
alter table public.artists add column avatar_url text;
alter table public.artists add column tagline text check (tagline is null or char_length(tagline) <= 140);
grant update (brand_color, accent_color, header_image_url, avatar_url, tagline) on public.artists to authenticated;

-- ── Public storefront: design, shows, and packages on sale ───
create or replace function public.get_storefront(p_handle text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', a.name, 'handle', a.handle, 'website', a.website, 'bio', a.bio, 'tagline', a.tagline,
    'verified', a.verified_at is not null,
    'brand_color', a.brand_color, 'accent_color', a.accent_color,
    'header_image_url', a.header_image_url, 'avatar_url', a.avatar_url,
    'shows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', s.slug, 'date', s.show_date, 'venue', s.venue_name, 'city', s.city,
        'region', s.region, 'country', s.country, 'tour', t.name,
        'packages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', sp.id, 'name', p.name, 'description', p.description, 'included', p.included,
            'image_url', p.image_url, 'includes_photo', p.includes_photo, 'price_cents', sp.price_cents,
            'presale', sp.presale_code is not null,
            'on_sale_at', sp.on_sale_at, 'off_sale_at', sp.off_sale_at,
            'remaining', greatest(0, sp.capacity - coalesce((
              select sum(oi.quantity - oi.refunded_quantity) from public.order_items oi
              join public.orders o on o.id = oi.order_id
              where oi.show_product_id = sp.id and o.status <> 'refunded'), 0))
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
