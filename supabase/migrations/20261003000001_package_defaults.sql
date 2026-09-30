-- Package defaults: each package has a default price and quantity per show.
-- Shows use the default unless the artist overrides that show; changing the default updates every show still on it.

alter table public.products add column default_price_cents integer check (default_price_cents is null or default_price_cents >= 0);
alter table public.products add column default_capacity integer check (default_capacity is null or default_capacity >= 0);
alter table public.show_products add column uses_default_price boolean not null default true;
alter table public.show_products add column uses_default_capacity boolean not null default true;

-- Backfill: the most common price and quantity become the default; shows that differ keep their own values.
update public.products p set
  default_price_cents = (select sp.price_cents from public.show_products sp where sp.product_id = p.id group by 1 order by count(*) desc, 1 limit 1),
  default_capacity    = (select sp.capacity    from public.show_products sp where sp.product_id = p.id group by 1 order by count(*) desc, 1 limit 1)
where not p.is_sample;
update public.show_products sp set
  uses_default_price    = sp.price_cents = p.default_price_cents,
  uses_default_capacity = sp.capacity    = p.default_capacity
from public.products p where p.id = sp.product_id and not p.is_sample;
update public.show_products set uses_default_price = false, uses_default_capacity = false where is_sample;

-- New or edited show rows that use the default take the package's current values.
create or replace function public.apply_package_defaults() returns trigger
language plpgsql set search_path = public as $$
declare d record;
begin
  select default_price_cents, default_capacity into d from public.products where id = new.product_id;
  if new.uses_default_price and d.default_price_cents is not null then new.price_cents := d.default_price_cents; end if;
  if new.uses_default_capacity and d.default_capacity is not null then new.capacity := d.default_capacity; end if;
  return new;
end $$;
create trigger show_products_defaults before insert or update on public.show_products
  for each row execute function public.apply_package_defaults();

-- Changing a package default flows to every show still on the default.
create or replace function public.propagate_package_defaults() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.default_price_cents is distinct from old.default_price_cents or new.default_capacity is distinct from old.default_capacity then
    update public.show_products set price_cents = price_cents where product_id = new.id and (uses_default_price or uses_default_capacity);
  end if;
  return new;
end $$;
create trigger products_propagate_defaults after update on public.products
  for each row execute function public.propagate_package_defaults();

revoke execute on function public.apply_package_defaults(), public.propagate_package_defaults() from public, anon, authenticated;
