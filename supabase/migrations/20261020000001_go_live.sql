-- Go live: test vs. live orders, manual launch confirmations, clearing test data, and opt-in sales tax.

alter table public.orders add column livemode boolean not null default false;   -- set from Stripe on each order
alter table public.artists add column collect_tax boolean not null default false; -- Stripe Tax at checkout (artist's choice)
grant update (collect_tax) on public.artists to authenticated;

create table public.platform_checks (
  key          text primary key,
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz not null default now()
);
alter table public.platform_checks enable row level security;
revoke all on public.platform_checks from anon, authenticated;
grant select, insert, update, delete on public.platform_checks to authenticated;
create policy platform_checks_admin on public.platform_checks for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

/** Before launch: removes every test-mode order (and its passes, refunds, disputes) and test Stripe connections. */
create or replace function public.clear_test_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_orders int; v_accounts int; v_holds int; v_shows uuid[];
begin
  if not public.is_super_admin() then raise exception 'Super admin only'; end if;
  select array_agg(distinct show_id) into v_shows from public.orders where not livemode and not is_sample;
  delete from public.checkout_holds h using public.orders o where h.order_id = o.id and not o.livemode and not o.is_sample;
  delete from public.checkout_holds where order_id is null and stripe_account_id in (select stripe_account_id from public.artist_stripe where not livemode);
  get diagnostics v_holds = row_count;
  delete from public.orders where not livemode and not is_sample;
  get diagnostics v_orders = row_count;
  update public.artist_stripe set stripe_account_id = null, charges_enabled = false, payouts_enabled = false, details_submitted = false,
    requirements_due = '[]'::jsonb, disabled_reason = null, customer_id = null, card_brand = null, card_last4 = null, card_exp = null, updated_at = now()
  where not livemode and stripe_account_id is not null;
  get diagnostics v_accounts = row_count;
  -- Shows that only had test orders can send real statements and check-in emails later.
  update public.shows set settlement_sent_at = null, settlement_net_cents = null, checkin_sent_at = null, checkin_updated_at = null
  where id = any (coalesce(v_shows, '{}'));
  perform public.log_event(null, 'platform.test_data_cleared', 'platform', 'all', jsonb_build_object('orders', v_orders, 'stripe_accounts', v_accounts));
  return jsonb_build_object('orders', v_orders, 'stripe_accounts', v_accounts, 'holds', v_holds);
end $$;
revoke execute on function public.clear_test_data() from public, anon;
grant execute on function public.clear_test_data() to authenticated;
