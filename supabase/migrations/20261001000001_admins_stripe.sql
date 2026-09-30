-- P&T admin team (invite-only, like photos.ontour.vip) and Stripe Connect accounts for artists.

-- ── Admin invitations ────────────────────────────────────────
create table public.admin_invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  token       text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by  uuid not null references public.profiles (id),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.admin_invitations enable row level security;
revoke all on public.admin_invitations from anon;
revoke insert, update, delete on public.admin_invitations from authenticated;
create policy admin_invitations_select on public.admin_invitations for select to authenticated using (public.is_super_admin());

create or replace function public.create_admin_invitation(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_token text;
begin
  if not public.is_super_admin() then raise exception 'Super admin only'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;
  if exists (select 1 from public.profiles where email = v_email and is_super_admin) then
    raise exception '% is already a P&T admin', v_email;
  end if;
  update public.admin_invitations set revoked_at = now() where email = v_email and accepted_at is null and revoked_at is null;
  insert into public.admin_invitations (email, invited_by) values (v_email, auth.uid()) returning token into v_token;
  perform public.log_event(null, 'admin.invited', 'admin', v_email, '{}'::jsonb);
  return v_token;
end $$;

create or replace function public.revoke_admin_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not public.is_super_admin() then raise exception 'Super admin only'; end if;
  update public.admin_invitations set revoked_at = now() where id = p_id and accepted_at is null returning email into v_email;
  perform public.log_event(null, 'admin.invite_revoked', 'admin', v_email, '{}'::jsonb);
end $$;

create or replace function public.get_admin_invitation(p_token text)
returns table (email text, invited_by_name text, state text)
language sql stable security definer set search_path = public as $$
  select i.email, coalesce(p.name, p.email),
    case when i.accepted_at is not null then 'accepted' when i.revoked_at is not null then 'revoked'
         when i.expires_at < now() then 'expired' else 'open' end
  from public.admin_invitations i join public.profiles p on p.id = i.invited_by
  where i.token = p_token
$$;

create or replace function public.accept_admin_invitation(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.admin_invitations; v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into v from public.admin_invitations where token = p_token for update;
  if not found or v.revoked_at is not null then raise exception 'This invite is no longer valid'; end if;
  if v.accepted_at is not null then
    if v.accepted_by = auth.uid() then return; end if;
    raise exception 'This invite has already been used';
  end if;
  if v.expires_at < now() then raise exception 'This invite has expired. Ask for a new one.'; end if;
  if v.email <> v_email then raise exception 'This invite was sent to %. Sign in with that email to accept it.', v.email; end if;
  update public.profiles set is_super_admin = true where id = auth.uid();
  update public.admin_invitations set accepted_at = now(), accepted_by = auth.uid() where id = v.id;
  perform public.log_event(null, 'admin.joined', 'admin', v_email, '{}'::jsonb);
end $$;

create or replace function public.remove_admin(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not public.is_super_admin() then raise exception 'Super admin only'; end if;
  if p_user = auth.uid() then raise exception 'You can''t remove yourself. Ask another admin.'; end if;
  if (select count(*) from public.profiles where is_super_admin) <= 1 then raise exception 'There must be at least one admin'; end if;
  update public.profiles set is_super_admin = false where id = p_user and is_super_admin returning email into v_email;
  if v_email is null then raise exception 'That person isn''t an admin'; end if;
  perform public.log_event(null, 'admin.removed', 'admin', v_email, '{}'::jsonb);
end $$;

revoke execute on function public.create_admin_invitation(text), public.revoke_admin_invitation(uuid),
  public.accept_admin_invitation(text), public.remove_admin(uuid), public.get_admin_invitation(text) from public, anon;
grant execute on function public.create_admin_invitation(text), public.revoke_admin_invitation(uuid),
  public.accept_admin_invitation(text), public.remove_admin(uuid) to authenticated;
grant execute on function public.get_admin_invitation(text) to anon, authenticated;

-- ── Stripe Connect (Express) per artist ──────────────────────
-- Written only by the server with the service role (after Stripe API calls or verified webhooks),
-- so an artist can't point payouts at an account Stripe didn't create for them.
create table public.artist_stripe (
  artist_id           uuid primary key references public.artists (id) on delete cascade,
  stripe_account_id   text unique,
  country             text,
  charges_enabled     boolean not null default false,
  payouts_enabled     boolean not null default false,
  details_submitted   boolean not null default false,
  requirements_due    jsonb not null default '[]'::jsonb,
  disabled_reason     text,
  customer_id         text unique,   -- the artist as a customer on P&T's platform account (card on file)
  payment_method_id   text,
  card_brand          text,
  card_last4          text,
  card_exp            text,
  livemode            boolean not null default false,
  updated_at          timestamptz not null default now()
);
alter table public.artist_stripe enable row level security;
revoke all on public.artist_stripe from anon;
revoke insert, update, delete on public.artist_stripe from authenticated;
create policy artist_stripe_select on public.artist_stripe for select to authenticated
  using (public.is_super_admin() or public.member_role(artist_id) in ('owner', 'accountant'));
