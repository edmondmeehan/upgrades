-- Refunds and disputes, kept in sync with Stripe. Called only by the server (service role).

alter table public.refunds add column passes_voided integer not null default 0;
alter table public.passes add column void_reason text;

/** Voids up to N not-yet-checked-in passes on an order item (newest codes first). Returns how many. */
create or replace function public.void_passes(p_item uuid, p_count integer, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with v as (
    select id from public.passes where order_item_id = p_item and voided_at is null and checked_in_at is null
    order by code desc limit greatest(p_count, 0)
  )
  update public.passes p set voided_at = now(), void_reason = p_reason from v where p.id = v.id;
  get diagnostics n = row_count;
  return n;
end $$;

/**
 * Records a refund (idempotent on the Stripe refund id).
 * p_items: [{item_id, qty}] when we know which passes were refunded (refunds made in Upgrades);
 * null for refunds made directly in Stripe, where a full refund voids everything and a partial one is flagged.
 */
create or replace function public.record_refund(
  p_charge text, p_refund_id text, p_amount integer, p_fee_refunded integer, p_reason text, p_issued_by uuid, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_total_refunded bigint; v_voided integer := 0; it record; v_status public.order_status;
begin
  if exists (select 1 from public.refunds where stripe_refund_id = p_refund_id) then return jsonb_build_object('result', 'already'); end if;
  select * into o from public.orders where stripe_charge_id = p_charge for update;
  if not found then return jsonb_build_object('result', 'unknown_charge'); end if;

  if p_items is not null then
    for it in select (e->>'item_id')::uuid as item_id, (e->>'qty')::int as qty from jsonb_array_elements(p_items) e loop
      update public.order_items set refunded_quantity = least(quantity, refunded_quantity + it.qty) where id = it.item_id and order_id = o.id;
      v_voided := v_voided + public.void_passes(it.item_id, it.qty, 'refunded');
    end loop;
  end if;

  insert into public.refunds (order_id, artist_id, amount_cents, service_fee_refunded_cents, reason, issued_by, stripe_refund_id, passes_voided)
  values (o.id, o.artist_id, p_amount, greatest(coalesce(p_fee_refunded, 0), 0), p_reason, p_issued_by, p_refund_id, 0);

  select coalesce(sum(amount_cents), 0) into v_total_refunded from public.refunds where order_id = o.id;
  if v_total_refunded >= o.total_cents then
    -- Fully refunded: every remaining pass is void, every item fully refunded.
    update public.order_items set refunded_quantity = quantity where order_id = o.id;
    select v_voided + coalesce(sum(public.void_passes(oi.id, oi.quantity, 'refunded')), 0) into v_voided from public.order_items oi where oi.order_id = o.id;
    v_status := 'refunded';
  else
    v_status := case when o.status = 'disputed' then 'disputed' else 'partially_refunded' end;
  end if;
  update public.orders set status = v_status where id = o.id;
  update public.refunds set passes_voided = v_voided where stripe_refund_id = p_refund_id;
  perform public.log_event(o.artist_id, 'order.refunded', 'order', o.id::text,
    jsonb_build_object('amount_cents', p_amount, 'refund', p_refund_id, 'passes_voided', v_voided, 'source', case when p_items is null then 'stripe' else 'upgrades' end));
  return jsonb_build_object('result', 'ok', 'order_id', o.id, 'status', v_status, 'passes_voided', v_voided,
    'needs_review', p_items is null and v_status = 'partially_refunded');
end $$;

/** Records a dispute opening or changing (idempotent on the Stripe dispute id). */
create or replace function public.record_dispute(
  p_charge text, p_dispute_id text, p_amount integer, p_fee integer, p_status text, p_reason text, p_fee_reversed integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; d public.disputes; v_status public.dispute_status;
begin
  select * into o from public.orders where stripe_charge_id = p_charge for update;
  if not found then return jsonb_build_object('result', 'unknown_charge'); end if;
  v_status := case when p_status = 'won' then 'won' when p_status = 'lost' then 'lost' else 'open' end;
  select * into d from public.disputes where stripe_dispute_id = p_dispute_id;
  if not found then
    insert into public.disputes (order_id, artist_id, amount_cents, fee_cents, platform_fee_reversed_cents, status, reason, stripe_dispute_id, closed_at)
    values (o.id, o.artist_id, p_amount, coalesce(p_fee, 0), coalesce(p_fee_reversed, 0), v_status, p_reason, p_dispute_id, case when v_status <> 'open' then now() end);
  else
    update public.disputes set status = v_status, fee_cents = coalesce(p_fee, fee_cents), platform_fee_reversed_cents = coalesce(p_fee_reversed, platform_fee_reversed_cents),
      reason = coalesce(p_reason, reason), closed_at = case when v_status <> 'open' then coalesce(closed_at, now()) end
    where id = d.id;
  end if;

  if v_status = 'open' then
    update public.orders set status = 'disputed' where id = o.id and status <> 'refunded';
  elsif v_status = 'lost' then
    -- Money went back to the fan's bank: the passes are no longer valid.
    perform public.void_passes(oi.id, oi.quantity, 'dispute_lost') from public.order_items oi where oi.order_id = o.id;
    update public.orders set status = 'refunded' where id = o.id;
  else
    update public.orders set status = case when exists (select 1 from public.refunds r where r.order_id = o.id) then 'partially_refunded' else 'paid' end
    where id = o.id and status = 'disputed';
  end if;
  perform public.log_event(o.artist_id, 'order.dispute_' || v_status, 'order', o.id::text, jsonb_build_object('dispute', p_dispute_id, 'amount_cents', p_amount));
  return jsonb_build_object('result', 'ok', 'order_id', o.id, 'status', v_status);
end $$;

revoke execute on function public.void_passes(uuid, integer, text), public.record_refund(text, text, integer, integer, text, uuid, jsonb),
  public.record_dispute(text, text, integer, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.void_passes(uuid, integer, text), public.record_refund(text, text, integer, integer, text, uuid, jsonb),
  public.record_dispute(text, text, integer, integer, text, text, integer) to service_role;
