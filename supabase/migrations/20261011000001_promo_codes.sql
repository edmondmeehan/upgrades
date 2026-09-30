-- Artist acquisition promo codes: a reduced (or zero) service fee for a time window and/or a number of show dates.

create table public.promo_codes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[A-Z0-9-]{3,30}$'),
  description     text,
  fee_bps         integer not null check (fee_bps between 0 and 5000),   -- the promo service fee (0 = none)
  months          integer check (months between 1 and 36),              -- lasts this many months from redemption
  show_limit      integer check (show_limit between 1 and 500),         -- covers this many show dates from redemption
  max_redemptions integer check (max_redemptions >= 1),
  expires_at      timestamptz,                                           -- last day it can be redeemed
  active          boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (months is not null or show_limit is not null)
);

create table public.promo_redemptions (
  id          uuid primary key default gen_random_uuid(),
  promo_id    uuid not null references public.promo_codes (id) on delete restrict,
  artist_id   uuid not null references public.artists (id) on delete cascade,
  redeemed_by uuid references public.profiles (id) on delete set null,
  redeemed_at timestamptz not null default now(),
  ends_at     timestamptz,           -- set when the code has a months limit
  unique (promo_id, artist_id)
);
create index on public.promo_redemptions (artist_id, redeemed_at desc);

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
revoke all on public.promo_codes, public.promo_redemptions from anon, authenticated;
grant select on public.promo_codes, public.promo_redemptions to authenticated;
create policy promo_codes_admin on public.promo_codes for select to authenticated using (public.is_super_admin());
create policy promo_redemptions_select on public.promo_redemptions for select to authenticated
  using (public.is_super_admin() or public.is_member(artist_id));

/** The artist's active promo, if any: newest redemption that hasn't run out of time. */
create or replace function public.active_promo(p_artist uuid)
returns table (redemption_id uuid, code text, description text, fee_bps integer, ends_at timestamptz, show_limit integer, redeemed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, c.code, c.description, c.fee_bps, r.ends_at, c.show_limit, r.redeemed_at
  from public.promo_redemptions r join public.promo_codes c on c.id = r.promo_id
  where r.artist_id = p_artist and (r.ends_at is null or r.ends_at > now())
  order by r.redeemed_at desc limit 1
$$;

/** The fee fans pay at this show: the promo rate if a promo covers it, otherwise the artist's normal rate. */
create or replace function public.effective_fee_bps(p_artist uuid, p_show uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare pr record; v_base integer; v_covered boolean;
begin
  select fee_bps into v_base from public.artists where id = p_artist;
  select * into pr from public.active_promo(p_artist);
  if pr.redemption_id is null then return v_base; end if;
  if pr.show_limit is null then return least(v_base, pr.fee_bps); end if;
  -- Covers the first N show dates on or after the day the code was redeemed.
  select p_show in (
    select s.id from public.shows s
    where s.artist_id = p_artist and s.status <> 'cancelled' and s.show_date >= (pr.redeemed_at at time zone 'America/New_York')::date
    order by s.show_date, s.created_at limit pr.show_limit
  ) into v_covered;
  return case when v_covered then least(v_base, pr.fee_bps) else v_base end;
end $$;

create or replace function public.redeem_promo(p_artist uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.promo_codes; v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')); v_used int; v_ends timestamptz;
begin
  if not public.is_owner(p_artist) and not public.is_super_admin() then raise exception 'Only the artist owner can add a promo code'; end if;
  select * into c from public.promo_codes where code = v_code for update;
  if not found or not c.active then raise exception 'That promo code isn''t valid'; end if;
  if c.expires_at is not null and c.expires_at < now() then raise exception 'That promo code has expired'; end if;
  select count(*) into v_used from public.promo_redemptions where promo_id = c.id;
  if c.max_redemptions is not null and v_used >= c.max_redemptions then raise exception 'That promo code has been fully claimed'; end if;
  if exists (select 1 from public.promo_redemptions where promo_id = c.id and artist_id = p_artist) then raise exception 'You''ve already used that code'; end if;
  if exists (select 1 from public.active_promo(p_artist)) then raise exception 'You already have a promo running. Add another once it ends.'; end if;
  v_ends := case when c.months is not null then now() + make_interval(months => c.months) end;
  insert into public.promo_redemptions (promo_id, artist_id, redeemed_by, ends_at) values (c.id, p_artist, auth.uid(), v_ends);
  perform public.log_event(p_artist, 'promo.redeemed', 'promo', c.id::text, jsonb_build_object('code', c.code));
  return jsonb_build_object('code', c.code, 'fee_bps', c.fee_bps, 'months', c.months, 'show_limit', c.show_limit, 'ends_at', v_ends);
end $$;

create or replace function public.admin_save_promo(p_id uuid, p_code text, p_description text, p_fee_bps integer, p_months integer,
  p_show_limit integer, p_max integer, p_expires timestamptz, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Super admin only'; end if;
  if p_id is null then
    insert into public.promo_codes (code, description, fee_bps, months, show_limit, max_redemptions, expires_at, active, created_by)
    values (upper(p_code), nullif(trim(p_description), ''), p_fee_bps, p_months, p_show_limit, p_max, p_expires, coalesce(p_active, true), auth.uid())
    returning id into v_id;
  else
    update public.promo_codes set description = nullif(trim(p_description), ''), max_redemptions = p_max, expires_at = p_expires, active = coalesce(p_active, active)
    where id = p_id returning id into v_id;   -- the discount itself can't change once artists may have redeemed it
  end if;
  perform public.log_event(null, case when p_id is null then 'promo.created' else 'promo.updated' end, 'promo', v_id::text, jsonb_build_object('code', upper(p_code)));
  return v_id;
end $$;

revoke execute on function public.active_promo(uuid), public.effective_fee_bps(uuid, uuid), public.redeem_promo(uuid, text),
  public.admin_save_promo(uuid, text, text, integer, integer, integer, integer, timestamptz, boolean) from public, anon;
grant execute on function public.active_promo(uuid), public.redeem_promo(uuid, text),
  public.admin_save_promo(uuid, text, text, integer, integer, integer, integer, timestamptz, boolean) to authenticated;
grant execute on function public.effective_fee_bps(uuid, uuid), public.active_promo(uuid) to authenticated, service_role;

-- Checkout and storefront use the effective (promo-aware) fee per show.
create or replace function public.create_checkout_hold(p_show_product uuid, p_qty integer, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  sp public.show_products; p public.products; s public.shows; a public.artists; st public.artist_stripe;
  v_left integer; v_fee integer; v_id uuid; v_bps integer;
begin
  select * into sp from public.show_products where id = p_show_product for update; -- serializes buyers of this package
  if not found or not sp.active or sp.is_sample then raise exception 'This package isn''t available.'; end if;
  select * into p from public.products where id = sp.product_id;
  select * into s from public.shows where id = sp.show_id;
  select * into a from public.artists where id = sp.artist_id;
  select * into st from public.artist_stripe where artist_id = sp.artist_id;
  if p.archived_at is not null or a.status <> 'approved' or s.status <> 'published' or s.show_date < current_date then
    raise exception 'This package isn''t available.';
  end if;
  if st.stripe_account_id is null or not st.charges_enabled then raise exception 'This artist isn''t taking payments yet.'; end if;
  if sp.on_sale_at is not null and sp.on_sale_at > now() then raise exception 'This package isn''t on sale yet.'; end if;
  if sp.off_sale_at is not null and sp.off_sale_at <= now() then raise exception 'Sales for this package have closed.'; end if;
  if sp.presale_code is not null and upper(trim(coalesce(p_code, ''))) <> upper(sp.presale_code) then
    raise exception 'That presale code isn''t right.';
  end if;
  if p_qty < 1 or p_qty > 4 then raise exception 'Choose between 1 and 4.'; end if;
  v_left := sp.capacity - public.units_taken(sp.id);
  if v_left <= 0 then raise exception 'Sold out.'; end if;
  if p_qty > v_left then raise exception 'Only % left.', v_left; end if;

  v_bps := public.effective_fee_bps(a.id, s.id); -- promo rate when a promo code covers this show
  v_fee := round(sp.price_cents * p_qty * v_bps / 10000.0);
  insert into public.checkout_holds (artist_id, show_id, show_product_id, quantity, unit_price_cents, service_fee_cents, fee_bps, stripe_account_id)
  values (a.id, s.id, sp.id, p_qty, sp.price_cents, v_fee, v_bps, st.stripe_account_id) returning id into v_id;

  return jsonb_build_object(
    'hold_id', v_id, 'quantity', p_qty, 'unit_price_cents', sp.price_cents, 'service_fee_cents', v_fee,
    'stripe_account_id', st.stripe_account_id, 'artist_name', a.name, 'handle', a.handle, 'show_slug', s.slug,
    'product_name', p.name, 'image_url', p.image_url, 'city', s.city, 'region', s.region, 'venue', s.venue_name, 'show_date', s.show_date
  );
end $$;

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
            'remaining', greatest(0, sp.capacity - public.units_taken(sp.id))
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
