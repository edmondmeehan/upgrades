-- Basic photo delivery: artists upload a show's meet & greet photos; buyers of photo packages get an emailed gallery link.

create table public.show_photos (
  id          uuid primary key default gen_random_uuid(),
  artist_id   uuid not null references public.artists (id) on delete cascade,
  show_id     uuid not null references public.shows (id) on delete cascade,
  path        text not null unique,          -- full-size image in the private "photos" bucket
  thumb_path  text not null,                 -- small version for grids
  width       integer, height integer, bytes integer,
  position    integer not null default 0,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (path like artist_id::text || '/' || show_id::text || '/%' and thumb_path like artist_id::text || '/' || show_id::text || '/%')
);
create index on public.show_photos (show_id, position, created_at);

create table public.photo_galleries (
  show_id     uuid primary key references public.shows (id) on delete cascade,
  artist_id   uuid not null references public.artists (id) on delete cascade,
  token       text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  first_sent_at timestamptz,
  created_at  timestamptz not null default now()
);

create table public.photo_deliveries (
  show_id     uuid not null references public.shows (id) on delete cascade,
  order_id    uuid not null references public.orders (id) on delete cascade,
  email       text not null,
  sent_at     timestamptz not null default now(),
  opened_at   timestamptz,
  primary key (show_id, order_id)
);

alter table public.show_photos enable row level security;
alter table public.photo_galleries enable row level security;
alter table public.photo_deliveries enable row level security;
revoke all on public.show_photos, public.photo_galleries, public.photo_deliveries from anon, authenticated;
grant select, insert, delete on public.show_photos to authenticated;
grant update (position) on public.show_photos to authenticated;
grant select on public.photo_galleries, public.photo_deliveries to authenticated;
-- Owners, reps and P&T manage photos; accountants don't.
create policy show_photos_select on public.show_photos for select to authenticated using (public.can_edit_shows(artist_id));
create policy show_photos_insert on public.show_photos for insert to authenticated with check (public.can_edit_shows(artist_id)
  and exists (select 1 from public.shows s where s.id = show_id and s.artist_id = show_photos.artist_id));
create policy show_photos_delete on public.show_photos for delete to authenticated using (public.can_edit_shows(artist_id));
create policy show_photos_update on public.show_photos for update to authenticated using (public.can_edit_shows(artist_id)) with check (public.can_edit_shows(artist_id));
create policy photo_galleries_select on public.photo_galleries for select to authenticated using (public.can_edit_shows(artist_id));
create policy photo_deliveries_select on public.photo_deliveries for select to authenticated
  using (exists (select 1 from public.shows s where s.id = show_id and public.can_edit_shows(s.artist_id)));

/** Paid orders at a show that include a photo package, with the buyer's email. */
create or replace function public.photo_buyers(p_show uuid)
returns table (order_id uuid, email text, name text, confirmation_code text, hold_id uuid, sent_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (o.id) o.id, f.email, f.name, o.confirmation_code, h.id, d.sent_at
  from public.orders o
  join public.fans f on f.id = o.fan_id
  join public.order_items oi on oi.order_id = o.id
  join public.show_products sp on sp.id = oi.show_product_id
  join public.products p on p.id = sp.product_id
  left join public.checkout_holds h on h.order_id = o.id
  left join public.photo_deliveries d on d.show_id = o.show_id and d.order_id = o.id
  where o.show_id = p_show and o.status <> 'refunded' and not o.is_sample and p.includes_photo
    and (auth.role() = 'service_role' or public.can_edit_shows(o.artist_id))
  order by o.id
$$;
revoke execute on function public.photo_buyers(uuid) from public, anon;
grant execute on function public.photo_buyers(uuid) to authenticated, service_role;

-- Private bucket; files live under <artist_id>/<show_id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 26214400, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.storage_artist_editable(name));
create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.storage_artist_editable(name));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.storage_artist_editable(name));
