-- Financials & reporting
-- Money tables are shaped after the Stripe objects they'll be filled from (Connect direct charges,
-- application fees, refunds, disputes, payouts). Phase 2 checkout and Stripe webhooks write them;
-- nothing here is written from the browser. Rows with is_sample = true are demo data for testing.

create type public.order_status   as enum ('paid', 'partially_refunded', 'refunded', 'disputed');
create type public.dispute_status as enum ('open', 'won', 'lost');
create type public.payout_status  as enum ('pending', 'in_transit', 'paid', 'failed');

create table public.products (
  id             uuid primary key default gen_random_uuid(),
  artist_id      uuid not null references public.artists (id) on delete cascade,
  name           text not null,
  description    text,
  kind           text not null default 'custom', -- meet_greet, soundcheck, early_entry, merch_bundle, qa_acoustic, custom
  includes_photo boolean not null default false,
  is_sample      boolean not null default false,
  created_at     timestamptz not null default now()
);
create index on public.products (artist_id);

create table public.show_products (
  id           uuid primary key default gen_random_uuid(),
  artist_id    uuid not null references public.artists (id) on delete cascade,
  show_id      uuid not null references public.shows (id) on delete cascade,
  product_id   uuid not null references public.products (id) on delete cascade,
  price_cents  integer not null check (price_cents >= 0),
  capacity     integer not null check (capacity >= 0),
  on_sale_at   timestamptz,
  off_sale_at  timestamptz,
  presale_code text,
  is_sample    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (show_id, product_id)
);
create index on public.show_products (artist_id);

create table public.fans (
  id         uuid primary key default gen_random_uuid(),
  artist_id  uuid not null references public.artists (id) on delete cascade,
  email      text not null,
  name       text,
  city       text,
  region     text,
  is_sample  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (artist_id, email)
);

create table public.payouts (
  id               uuid primary key default gen_random_uuid(),
  artist_id        uuid not null references public.artists (id) on delete cascade,
  stripe_payout_id text unique,
  amount_cents     integer not null,
  currency         text not null default 'usd',
  arrival_date     date not null,
  status           public.payout_status not null default 'paid',
  is_sample        boolean not null default false,
  created_at       timestamptz not null default now()
);
create index on public.payouts (artist_id, arrival_date desc);

create table public.orders (
  id                        uuid primary key default gen_random_uuid(),
  artist_id                 uuid not null references public.artists (id) on delete cascade,
  show_id                   uuid not null references public.shows (id) on delete restrict,
  fan_id                    uuid references public.fans (id) on delete set null,
  status                    public.order_status not null default 'paid',
  currency                  text not null default 'usd',
  subtotal_cents            integer not null check (subtotal_cents >= 0), -- the artist's price x quantity
  service_fee_cents         integer not null check (service_fee_cents >= 0), -- P&T fee paid by the fan (application fee)
  total_cents               integer not null check (total_cents >= 0),     -- what the fan paid
  stripe_fee_cents          integer not null default 0,                    -- processing, borne by the artist
  stripe_payment_intent_id  text unique,
  stripe_charge_id          text unique,
  stripe_application_fee_id text,
  payout_id                 uuid references public.payouts (id) on delete set null,
  is_sample                 boolean not null default false,
  created_at                timestamptz not null default now()
);
create index on public.orders (artist_id, created_at);
create index on public.orders (show_id);
create index on public.orders (payout_id);

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  artist_id         uuid not null references public.artists (id) on delete cascade,
  show_product_id   uuid not null references public.show_products (id) on delete restrict,
  quantity          integer not null check (quantity > 0),
  unit_price_cents  integer not null check (unit_price_cents >= 0),
  refunded_quantity integer not null default 0 check (refunded_quantity >= 0)
);
create index on public.order_items (order_id);
create index on public.order_items (show_product_id);

-- One pass per upgrade unit. Scanning (a later phase) fills checked_in_at.
create table public.passes (
  id              uuid primary key default gen_random_uuid(),
  order_item_id   uuid not null references public.order_items (id) on delete cascade,
  artist_id       uuid not null references public.artists (id) on delete cascade,
  show_id         uuid not null references public.shows (id) on delete cascade,
  code            text not null unique default upper(encode(extensions.gen_random_bytes(6), 'hex')),
  checked_in_at   timestamptz,
  checked_in_by   uuid references public.profiles (id),
  voided_at       timestamptz
);
create index on public.passes (show_id);

create table public.refunds (
  id                         uuid primary key default gen_random_uuid(),
  order_id                   uuid not null references public.orders (id) on delete cascade,
  artist_id                  uuid not null references public.artists (id) on delete cascade,
  amount_cents               integer not null check (amount_cents > 0),            -- total returned to the fan
  service_fee_refunded_cents integer not null default 0 check (service_fee_refunded_cents >= 0), -- P&T's share of that
  reason                     text,
  issued_by                  uuid references public.profiles (id),
  stripe_refund_id           text unique,
  is_sample                  boolean not null default false,
  created_at                 timestamptz not null default now()
);
create index on public.refunds (artist_id, created_at);

create table public.disputes (
  id                          uuid primary key default gen_random_uuid(),
  order_id                    uuid not null references public.orders (id) on delete cascade,
  artist_id                   uuid not null references public.artists (id) on delete cascade,
  amount_cents                integer not null,           -- disputed amount (full charge)
  fee_cents                   integer not null default 0, -- Stripe dispute fee, borne by the artist
  platform_fee_reversed_cents integer not null default 0, -- P&T fee given back if the dispute is lost
  status                      public.dispute_status not null default 'open',
  reason                      text,
  stripe_dispute_id           text unique,
  opened_at                   timestamptz not null default now(),
  closed_at                   timestamptz,
  is_sample                   boolean not null default false
);
create index on public.disputes (artist_id, opened_at);

-- ── Permissions ─────────────────────────────────────────────
-- Money: owner, accountant, P&T admin. Fan identities: owner, rep, admin (not accountants).
create or replace function public.is_finance(p_artist uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or public.member_role(p_artist) in ('owner', 'accountant')
$$;
grant execute on function public.is_finance(uuid) to authenticated;

alter table public.products      enable row level security;
alter table public.show_products enable row level security;
alter table public.fans          enable row level security;
alter table public.payouts       enable row level security;
alter table public.orders        enable row level security;
alter table public.order_items   enable row level security;
alter table public.passes        enable row level security;
alter table public.refunds       enable row level security;
alter table public.disputes      enable row level security;

revoke all on public.products, public.show_products, public.fans, public.payouts, public.orders,
  public.order_items, public.passes, public.refunds, public.disputes from anon;
revoke insert, update, delete on public.products, public.show_products, public.fans, public.payouts, public.orders,
  public.order_items, public.passes, public.refunds, public.disputes from authenticated;

create policy products_select      on public.products      for select to authenticated using (public.is_member(artist_id) or public.is_super_admin());
create policy show_products_select on public.show_products for select to authenticated using (public.is_member(artist_id) or public.is_super_admin());
create policy fans_select          on public.fans          for select to authenticated using (public.is_super_admin() or public.member_role(artist_id) in ('owner', 'rep'));
create policy orders_select        on public.orders        for select to authenticated using (public.is_member(artist_id) or public.is_super_admin());
create policy order_items_select   on public.order_items   for select to authenticated using (public.is_member(artist_id) or public.is_super_admin());
create policy passes_select        on public.passes        for select to authenticated using (public.is_member(artist_id) or public.is_super_admin());
create policy payouts_select       on public.payouts       for select to authenticated using (public.is_finance(artist_id));
create policy refunds_select       on public.refunds       for select to authenticated using (public.is_finance(artist_id));
create policy disputes_select      on public.disputes      for select to authenticated using (public.is_finance(artist_id));

-- ── Reporting views (security_invoker: the caller's row-level security applies) ──
-- Net to artist = artist's price − Stripe processing − artist's share of refunds − artist's share of lost disputes − dispute fees.
-- P&T net = service fee − service fee refunded − service fee reversed on lost disputes.
create view public.v_order_money with (security_invoker = true) as
select
  o.id as order_id, o.artist_id, o.show_id, s.tour_id, s.show_date, o.created_at, o.status, o.payout_id, o.is_sample,
  o.subtotal_cents as gross_cents,
  o.service_fee_cents,
  o.total_cents,
  o.stripe_fee_cents,
  coalesce(r.amount, 0) as refunded_cents,
  coalesce(r.fee, 0) as service_fee_refunded_cents,
  coalesce(r.amount, 0) - coalesce(r.fee, 0) as artist_refunded_cents,
  coalesce(d.lost, 0) as dispute_lost_cents,
  coalesce(d.fees, 0) as dispute_fee_cents,
  coalesce(d.plat, 0) as dispute_platform_reversed_cents,
  coalesce(d.open_count, 0) as open_disputes,
  o.subtotal_cents - o.stripe_fee_cents - (coalesce(r.amount, 0) - coalesce(r.fee, 0))
    - (coalesce(d.lost, 0) - coalesce(d.plat, 0)) - coalesce(d.fees, 0) as net_to_artist_cents,
  o.service_fee_cents - coalesce(r.fee, 0) - coalesce(d.plat, 0) as platform_net_cents
from public.orders o
join public.shows s on s.id = o.show_id
left join (select order_id, sum(amount_cents) amount, sum(service_fee_refunded_cents) fee from public.refunds group by order_id) r on r.order_id = o.id
left join (
  select order_id,
         sum(case when status = 'lost' then amount_cents else 0 end) lost,
         sum(fee_cents) fees,
         sum(case when status = 'lost' then platform_fee_reversed_cents else 0 end) plat,
         count(*) filter (where status = 'open') open_count
  from public.disputes group by order_id
) d on d.order_id = o.id;

create view public.v_show_money with (security_invoker = true) as
select
  artist_id, show_id, tour_id, show_date,
  count(*)::int as orders,
  sum(gross_cents)::bigint as gross_cents,
  sum(service_fee_cents)::bigint as service_fee_cents,
  sum(stripe_fee_cents)::bigint as stripe_fee_cents,
  sum(refunded_cents)::bigint as refunded_cents,
  sum(service_fee_refunded_cents)::bigint as service_fee_refunded_cents,
  sum(artist_refunded_cents)::bigint as artist_refunded_cents,
  sum(dispute_lost_cents - dispute_platform_reversed_cents + dispute_fee_cents)::bigint as dispute_cost_cents,
  sum(net_to_artist_cents)::bigint as net_to_artist_cents,
  sum(platform_net_cents)::bigint as platform_net_cents,
  bool_or(is_sample) as has_sample
from public.v_order_money
group by artist_id, show_id, tour_id, show_date;

create view public.v_artist_monthly with (security_invoker = true) as
select
  artist_id,
  date_trunc('month', created_at)::date as month,
  count(*)::int as orders,
  sum(gross_cents)::bigint as gross_cents,
  sum(service_fee_cents)::bigint as service_fee_cents,
  sum(stripe_fee_cents)::bigint as stripe_fee_cents,
  sum(refunded_cents)::bigint as refunded_cents,
  sum(service_fee_refunded_cents)::bigint as service_fee_refunded_cents,
  sum(dispute_lost_cents)::bigint as dispute_lost_cents,
  sum(dispute_fee_cents)::bigint as dispute_fee_cents,
  sum(net_to_artist_cents)::bigint as net_to_artist_cents,
  sum(platform_net_cents)::bigint as platform_net_cents,
  count(*) filter (where refunded_cents > 0)::int as refunded_orders,
  sum(open_disputes)::int as open_disputes,
  bool_or(is_sample) as has_sample
from public.v_order_money
group by artist_id, date_trunc('month', created_at);

create view public.v_show_product_sales with (security_invoker = true) as
select
  sp.id as show_product_id, sp.artist_id, sp.show_id, sh.tour_id, sp.product_id, p.name as product_name, p.includes_photo,
  sp.price_cents, sp.capacity,
  coalesce(sum(oi.quantity), 0)::int as units,
  coalesce(sum(oi.refunded_quantity), 0)::int as units_refunded,
  coalesce(sum((oi.quantity - oi.refunded_quantity) * oi.unit_price_cents), 0)::bigint as net_gross_cents,
  coalesce(sum(oi.quantity * oi.unit_price_cents), 0)::bigint as gross_cents,
  (select count(*) from public.passes ps join public.order_items oi2 on oi2.id = ps.order_item_id
     where oi2.show_product_id = sp.id and ps.checked_in_at is not null and ps.voided_at is null)::int as checked_in
from public.show_products sp
join public.products p on p.id = sp.product_id
join public.shows sh on sh.id = sp.show_id
left join public.order_items oi on oi.show_product_id = sp.id
group by sp.id, sh.tour_id, p.name, p.includes_photo;

grant select on public.v_order_money, public.v_show_money, public.v_artist_monthly, public.v_show_product_sales to authenticated;
revoke all on public.v_order_money, public.v_show_money, public.v_artist_monthly, public.v_show_product_sales from anon;

-- ── Sample data (P&T admin testing tool) ────────────────────
create or replace function public.clear_sample_sales(p_artist uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Super admin only'; end if;
  delete from public.orders where artist_id = p_artist and is_sample;
  delete from public.payouts where artist_id = p_artist and is_sample;
  delete from public.show_products where artist_id = p_artist and is_sample;
  delete from public.products where artist_id = p_artist and is_sample;
  delete from public.fans where artist_id = p_artist and is_sample;
  perform public.log_event(p_artist, 'admin.sample_sales_cleared', 'artist', p_artist::text, '{}'::jsonb);
end $$;

create or replace function public.generate_sample_sales(p_artist uuid)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare
  v_fee_bps integer;
  v_show record;
  v_sp record;
  v_prod uuid[];
  v_fans uuid[];
  v_units integer;
  v_qty integer;
  v_order uuid;
  v_item uuid;
  v_sub integer; v_svc integer; v_tot integer; v_stripe integer;
  v_when timestamptz;
  v_orders integer := 0;
  v_first text[] := array['Avery','Jordan','Taylor','Morgan','Riley','Casey','Jamie','Quinn','Drew','Skyler','Reese','Parker','Rowan','Emerson','Hayden','Blake','Kendall','Logan','Sage','Dakota'];
  v_last  text[] := array['Nguyen','Garcia','Smith','Patel','Johnson','Lee','Brown','Martinez','Davis','Clark','Lopez','Walker','Young','King','Wright','Hill'];
  i integer;
  r numeric;
begin
  if not public.is_super_admin() then raise exception 'Super admin only'; end if;
  if not exists (select 1 from public.shows where artist_id = p_artist) then
    raise exception 'Add at least one show to this artist first';
  end if;
  perform public.clear_sample_sales(p_artist);
  select fee_bps into v_fee_bps from public.artists where id = p_artist;

  -- products
  insert into public.products (artist_id, name, kind, includes_photo, is_sample) values
    (p_artist, 'Meet & greet + photo', 'meet_greet', true, true),
    (p_artist, 'Soundcheck access', 'soundcheck', false, true),
    (p_artist, 'Early entry', 'early_entry', false, true);
  select array_agg(id order by name) into v_prod from public.products where artist_id = p_artist and is_sample;
  -- v_prod sorted by name: [Early entry, Meet & greet + photo, Soundcheck access]

  -- fans
  for i in 1..80 loop
    insert into public.fans (artist_id, email, name, is_sample)
    values (p_artist, format('sample.fan%s@example.com', i),
            v_first[1 + (i * 7) % array_length(v_first, 1)] || ' ' || v_last[1 + (i * 3) % array_length(v_last, 1)], true);
  end loop;
  select array_agg(id) into v_fans from public.fans where artist_id = p_artist and is_sample;

  -- show products + orders
  for v_show in select id, show_date from public.shows where artist_id = p_artist and status <> 'cancelled' order by show_date limit 60 loop
    insert into public.show_products (artist_id, show_id, product_id, price_cents, capacity, is_sample) values
      (p_artist, v_show.id, v_prod[2], 17500, 24, true),
      (p_artist, v_show.id, v_prod[3], 7500, 40, true),
      (p_artist, v_show.id, v_prod[1], 3500, 80, true);

    for v_sp in select id, price_cents, capacity from public.show_products where show_id = v_show.id and is_sample loop
      v_units := floor(v_sp.capacity * (0.35 + random() * 0.65))::int;
      while v_units > 0 loop
        v_qty := least(v_units, case when random() < 0.25 then 2 else 1 end);
        v_units := v_units - v_qty;
        v_sub := v_sp.price_cents * v_qty;
        v_svc := round(v_sub * v_fee_bps / 10000.0);
        v_tot := v_sub + v_svc;
        v_stripe := round(v_tot * 0.029) + 30;
        v_when := least(now() - interval '1 hour', v_show.show_date::timestamptz - (random() * 55 + 1) * interval '1 day');
        insert into public.orders (artist_id, show_id, fan_id, subtotal_cents, service_fee_cents, total_cents, stripe_fee_cents,
                                   stripe_charge_id, is_sample, created_at)
        values (p_artist, v_show.id, v_fans[1 + floor(random() * array_length(v_fans, 1))::int], v_sub, v_svc, v_tot, v_stripe,
                'ch_sample_' || encode(gen_random_bytes(8), 'hex'), true, v_when)
        returning id into v_order;
        insert into public.order_items (order_id, artist_id, show_product_id, quantity, unit_price_cents)
        values (v_order, p_artist, v_sp.id, v_qty, v_sp.price_cents) returning id into v_item;
        insert into public.passes (order_item_id, artist_id, show_id, checked_in_at)
        select v_item, p_artist, v_show.id,
               case when v_show.show_date < current_date and random() < 0.86 then v_show.show_date::timestamptz + interval '17 hours' end
        from generate_series(1, v_qty);
        v_orders := v_orders + 1;

        r := random();
        if r < 0.04 then
          insert into public.refunds (order_id, artist_id, amount_cents, service_fee_refunded_cents, reason, is_sample, created_at)
          values (v_order, p_artist, v_tot, v_svc, 'Fan can no longer attend', true, v_when + interval '3 days');
          update public.order_items set refunded_quantity = quantity where id = v_item;
          update public.passes set voided_at = v_when + interval '3 days', checked_in_at = null where order_item_id = v_item;
          update public.orders set status = 'refunded' where id = v_order;
        elsif r < 0.05 then
          insert into public.disputes (order_id, artist_id, amount_cents, fee_cents, status, reason, is_sample, opened_at, closed_at)
          values (v_order, p_artist, v_tot, 1500, case when random() < 0.5 then 'lost' else 'won' end::public.dispute_status,
                  'Fraudulent', true, v_when + interval '20 days', v_when + interval '45 days');
          update public.orders set status = 'disputed' where id = v_order;
        end if;
      end loop;
    end loop;
  end loop;

  -- weekly payouts for orders older than 2 days
  with wk as (
    select date_trunc('week', m.created_at)::date as week, sum(m.net_to_artist_cents) as amt, array_agg(m.order_id) ids
    from public.v_order_money m where m.artist_id = p_artist and m.is_sample and m.created_at < now() - interval '2 days'
    group by 1
  ), ins as (
    insert into public.payouts (artist_id, stripe_payout_id, amount_cents, arrival_date, status, is_sample)
    select p_artist, 'po_sample_' || encode(gen_random_bytes(8), 'hex'), amt, week + 9, 'paid', true from wk
    returning id, arrival_date
  )
  update public.orders o set payout_id = ins.id
  from wk join ins on ins.arrival_date = wk.week + 9
  where o.id = any(wk.ids);

  perform public.log_event(p_artist, 'admin.sample_sales_loaded', 'artist', p_artist::text, jsonb_build_object('orders', v_orders));
  return v_orders;
end $$;

revoke execute on function public.generate_sample_sales(uuid), public.clear_sample_sales(uuid) from public, anon;
grant execute on function public.generate_sample_sales(uuid), public.clear_sample_sales(uuid) to authenticated;
