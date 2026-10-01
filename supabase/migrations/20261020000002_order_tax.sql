alter table public.orders add column tax_cents integer not null default 0 check (tax_cents >= 0);
