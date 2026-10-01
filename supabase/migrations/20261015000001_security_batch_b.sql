-- Security batch B: admin two-step sign-in, checkout abuse limits, system health, marketing consent, photo link expiry.

-- 1. Admin powers require a two-step (aal2) session once the admin has set up an authenticator app.
--    (The app makes every admin set one up on their first visit; switch to "always aal2" once all have.)
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false)
     and (coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
          or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'))
$$;

/** For the Admins page: who has two-step sign-in set up. */
create or replace function public.admin_mfa_status()
returns table (user_id uuid, has_mfa boolean) language sql stable security definer set search_path = public, auth as $$
  select p.id, exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
  from public.profiles p where p.is_super_admin and public.is_super_admin()
$$;
revoke execute on function public.admin_mfa_status() from public, anon;
grant execute on function public.admin_mfa_status() to authenticated;

-- 2. Checkout abuse: at most 3 unpaid checkouts open per person (hashed IP) at a time; marketing opt-in rides along.
alter table public.checkout_holds add column client_key text, add column marketing_opt_in boolean not null default false;
create index on public.checkout_holds (client_key, status, expires_at);

drop function if exists public.create_checkout_hold(uuid, integer, text);
create or replace function public.create_checkout_hold(p_show_product uuid, p_qty integer, p_code text, p_client text default null, p_marketing boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  sp public.show_products; p public.products; s public.shows; a public.artists; st public.artist_stripe;
  v_left integer; v_fee integer; v_id uuid; v_bps integer;
begin
  if p_client is not null and (select count(*) from public.checkout_holds
      where client_key = p_client and status = 'pending' and expires_at > now()) >= 3 then
    raise exception 'You already have checkouts open. Finish or close one, or try again in 30 minutes.';
  end if;
  select * into sp from public.show_products where id = p_show_product for update;
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

  v_bps := public.effective_fee_bps(a.id, s.id);
  v_fee := round(sp.price_cents * p_qty * v_bps / 10000.0);
  insert into public.checkout_holds (artist_id, show_id, show_product_id, quantity, unit_price_cents, service_fee_cents, fee_bps, stripe_account_id, client_key, marketing_opt_in)
  values (a.id, s.id, sp.id, p_qty, sp.price_cents, v_fee, v_bps, st.stripe_account_id, p_client, coalesce(p_marketing, false)) returning id into v_id;

  return jsonb_build_object(
    'hold_id', v_id, 'quantity', p_qty, 'unit_price_cents', sp.price_cents, 'service_fee_cents', v_fee,
    'stripe_account_id', st.stripe_account_id, 'artist_name', a.name, 'handle', a.handle, 'show_slug', s.slug,
    'product_name', p.name, 'image_url', p.image_url, 'city', s.city, 'region', s.region, 'venue', s.venue_name, 'show_date', s.show_date
  );
end $$;
revoke execute on function public.create_checkout_hold(uuid, integer, text, text, boolean) from public, anon, authenticated;
grant execute on function public.create_checkout_hold(uuid, integer, text, text, boolean) to service_role;

-- 4. Marketing consent, recorded per fan when they tick the box at checkout.
alter table public.fans add column marketing_opt_in_at timestamptz;
create or replace function public.apply_marketing_opt_in() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.order_id is not null and old.order_id is null and new.marketing_opt_in then
    update public.fans f set marketing_opt_in_at = coalesce(f.marketing_opt_in_at, now())
    from public.orders o where o.id = new.order_id and f.id = o.fan_id;
  end if;
  return new;
end $$;
create trigger checkout_holds_marketing after update of order_id on public.checkout_holds
  for each row execute function public.apply_marketing_opt_in();
revoke execute on function public.apply_marketing_opt_in() from public, anon, authenticated;

-- 3. System health: last success and failure of each background job.
create table public.system_runs (
  job           text primary key,
  last_ok_at    timestamptz,
  last_error_at timestamptz,
  last_error    text,
  last_alert_at timestamptz,
  error_count   integer not null default 0
);
alter table public.system_runs enable row level security;
revoke all on public.system_runs from anon, authenticated;
grant select on public.system_runs to authenticated;
create policy system_runs_admin on public.system_runs for select to authenticated using (public.is_super_admin());

-- 5. Photo gallery links stop working 90 days after the show (artists can extend).
alter table public.photo_galleries add column expires_at timestamptz;
update public.photo_galleries g set expires_at = (s.show_date + 90)::timestamptz from public.shows s where s.id = g.show_id and g.expires_at is null;
create or replace function public.default_gallery_expiry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.expires_at is null then
    new.expires_at := ((select show_date from public.shows where id = new.show_id) + 90)::timestamptz;
  end if;
  return new;
end $$;
create trigger photo_galleries_expiry before insert on public.photo_galleries for each row execute function public.default_gallery_expiry();
revoke execute on function public.default_gallery_expiry() from public, anon, authenticated;
