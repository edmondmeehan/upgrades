-- OnTour Upgrades — Phase 1
-- Accounts, roles, artists, verification + manual approval, tours, shows, audit log.
-- Every artist-owned row carries artist_id; row-level security scopes all reads/writes to it.

create extension if not exists pgcrypto with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- Types
-- ─────────────────────────────────────────────────────────────
create type public.artist_status as enum ('draft', 'pending', 'approved', 'rejected', 'suspended');
create type public.member_role   as enum ('owner', 'rep', 'accountant');
create type public.proof_method  as enum ('code_post', 'domain_email', 'third_party');
create type public.review_status as enum ('pending', 'approved', 'rejected', 'superseded');
create type public.tour_status   as enum ('active', 'archived');
create type public.show_status   as enum ('draft', 'published', 'cancelled');

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  name           text,
  is_super_admin boolean not null default false,
  created_at     timestamptz not null default now()
);

create table public.artists (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 1 and 120),
  handle            text not null unique check (handle ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  website           text,
  bio               text,
  status            public.artist_status not null default 'draft',
  verification_code text not null default ('ONTOUR-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6))),
  verified_at       timestamptz,
  verified_by       uuid references public.profiles (id),
  fee_bps           integer not null default 1000 check (fee_bps between 0 and 5000), -- 1000 = 10%
  managed_candidate boolean not null default false, -- flag for conversion to a managed P&T program
  created_by        uuid not null references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.artist_members (
  artist_id  uuid not null references public.artists (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null,
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (artist_id, user_id)
);
create index on public.artist_members (user_id);

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  artist_id   uuid not null references public.artists (id) on delete cascade,
  email       text not null,
  role        public.member_role not null check (role <> 'owner'),
  token       text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by  uuid not null references public.profiles (id),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.invitations (artist_id);

create table public.verification_submissions (
  id                      uuid primary key default gen_random_uuid(),
  artist_id               uuid not null references public.artists (id) on delete cascade,
  submitted_by            uuid not null references public.profiles (id),
  website                 text not null,
  socials                 jsonb not null default '{}'::jsonb, -- {instagram, tiktok, x, facebook, youtube, spotify}
  proof_method            public.proof_method not null,
  proof_post_url          text,                -- code_post: link to the post / DM screenshot location
  proof_code              text,                -- code the artist was asked to post
  submitter_email         text not null,
  domain_email_match      boolean not null default false,
  third_party_name        text,
  third_party_email       text,
  third_party_relation    text,                -- manager, agent, label
  third_party_token       text unique,
  third_party_confirmed_at timestamptz,
  notes                   text,
  status                  public.review_status not null default 'pending',
  checklist               jsonb not null default '{}'::jsonb, -- reviewer ticks
  reviewer_id             uuid references public.profiles (id),
  reviewer_notes          text,
  decided_at              timestamptz,
  created_at              timestamptz not null default now()
);
create index on public.verification_submissions (artist_id, created_at desc);

create table public.tours (
  id          uuid primary key default gen_random_uuid(),
  artist_id   uuid not null references public.artists (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 160),
  description text,
  status      public.tour_status not null default 'active',
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.tours (artist_id);

create table public.shows (
  id           uuid primary key default gen_random_uuid(),
  artist_id    uuid not null references public.artists (id) on delete cascade,
  tour_id      uuid not null references public.tours (id) on delete cascade,
  slug         text not null,
  show_date    date not null,
  doors_time   time,
  show_time    time,
  timezone     text not null default 'America/New_York',
  venue_name   text not null,
  address      text,
  city         text not null,
  region       text,
  country      text not null default 'US',
  postal_code  text,
  latitude     numeric(9,6),
  longitude    numeric(9,6),
  status       public.show_status not null default 'draft',
  cancelled_at timestamptz,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (artist_id, slug)
);
create index on public.shows (tour_id);
create index on public.shows (artist_id, show_date);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles (id),
  artist_id  uuid references public.artists (id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log (artist_id, created_at desc);
create index on public.audit_log (created_at desc);

-- Keep tours/shows consistent: a show's artist must match its tour's artist
create or replace function public.enforce_show_artist() returns trigger
language plpgsql as $$
begin
  if (select artist_id from public.tours where id = new.tour_id) is distinct from new.artist_id then
    raise exception 'Show and tour belong to different artists';
  end if;
  return new;
end $$;
create trigger shows_artist_matches_tour before insert or update on public.shows
  for each row execute function public.enforce_show_artist();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger artists_touch before update on public.artists for each row execute function public.touch_updated_at();
create trigger tours_touch   before update on public.tours   for each row execute function public.touch_updated_at();
create trigger shows_touch   before update on public.shows   for each row execute function public.touch_updated_at();

-- New auth user → profile
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, lower(new.email), nullif(new.raw_user_meta_data ->> 'name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Permission helpers (security definer so policies don't recurse)
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.member_role(p_artist uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from public.artist_members where artist_id = p_artist and user_id = auth.uid()
$$;

create or replace function public.is_member(p_artist uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.artist_members where artist_id = p_artist and user_id = auth.uid())
$$;

-- owner or rep (or super admin assisting) may edit tours and shows
create or replace function public.can_edit_shows(p_artist uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or public.member_role(p_artist) in ('owner', 'rep')
$$;

create or replace function public.is_owner(p_artist uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.member_role(p_artist) = 'owner'
$$;

create or replace function public.shares_artist_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.artist_members a
    join public.artist_members b on a.artist_id = b.artist_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

create or replace function public.log_event(p_artist uuid, p_action text, p_entity text, p_entity_id text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, artist_id, action, entity, entity_id, details)
  values (auth.uid(), p_artist, p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb))
$$;
revoke execute on function public.log_event(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────
alter table public.profiles                 enable row level security;
alter table public.artists                  enable row level security;
alter table public.artist_members           enable row level security;
alter table public.invitations              enable row level security;
alter table public.verification_submissions enable row level security;
alter table public.tours                    enable row level security;
alter table public.shows                    enable row level security;
alter table public.audit_log                enable row level security;

-- Only authenticated users touch tables directly; public pages go through definer functions below.
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.profiles, public.artists, public.artist_members,
  public.invitations, public.verification_submissions, public.audit_log from authenticated;

-- profiles: yourself, teammates, super admin. Users may only edit their own name.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_super_admin() or public.shares_artist_with(id));
grant update (name) on public.profiles to authenticated;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- artists: members + super admin can read; owner edits profile fields only (status/fee via functions)
create policy artists_select on public.artists for select to authenticated
  using (public.is_member(id) or public.is_super_admin());
grant update (name, website, bio) on public.artists to authenticated;
create policy artists_update_owner on public.artists for update to authenticated
  using (public.is_owner(id) or public.is_super_admin())
  with check (public.is_owner(id) or public.is_super_admin());

-- memberships: visible to the artist's team and super admin; changes via functions only
create policy members_select on public.artist_members for select to authenticated
  using (public.is_member(artist_id) or public.is_super_admin());

-- invitations: owner + super admin can see; create/revoke via functions
create policy invitations_select on public.invitations for select to authenticated
  using (public.is_owner(artist_id) or public.is_super_admin());

-- verification: owner + super admin can see; writes via functions
create policy verification_select on public.verification_submissions for select to authenticated
  using (public.is_owner(artist_id) or public.is_super_admin());

-- tours & shows: whole team reads (accountants need show lists for settlements); owner/rep write
create policy tours_select on public.tours for select to authenticated
  using (public.is_member(artist_id) or public.is_super_admin());
create policy tours_insert on public.tours for insert to authenticated
  with check (public.can_edit_shows(artist_id));
create policy tours_update on public.tours for update to authenticated
  using (public.can_edit_shows(artist_id)) with check (public.can_edit_shows(artist_id));
create policy tours_delete on public.tours for delete to authenticated
  using (public.can_edit_shows(artist_id));

create policy shows_select on public.shows for select to authenticated
  using (public.is_member(artist_id) or public.is_super_admin());
create policy shows_insert on public.shows for insert to authenticated
  with check (public.can_edit_shows(artist_id));
create policy shows_update on public.shows for update to authenticated
  using (public.can_edit_shows(artist_id)) with check (public.can_edit_shows(artist_id));
create policy shows_delete on public.shows for delete to authenticated
  using (public.can_edit_shows(artist_id));

-- audit: super admin only
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_super_admin());

-- ─────────────────────────────────────────────────────────────
-- Actions
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_artist(p_name text, p_handle text, p_website text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_handle text := lower(trim(p_handle));
  reserved text[] := array['admin','a','api','auth','login','logout','signup','dashboard','onboarding',
    'invite','confirm','pass','photos','settings','help','support','ontour','upgrades','www','about',
    'terms','privacy','account','artists','shows','tours','static','assets'];
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if v_handle = any(reserved) then raise exception 'That handle is reserved. Pick another.'; end if;
  if exists (select 1 from public.artists where handle = v_handle) then
    raise exception 'That handle is taken. Pick another.';
  end if;
  insert into public.artists (name, handle, website, created_by)
  values (trim(p_name), v_handle, nullif(trim(p_website), ''), auth.uid())
  returning id into v_id;
  insert into public.artist_members (artist_id, user_id, role) values (v_id, auth.uid(), 'owner');
  perform public.log_event(v_id, 'artist.created', 'artist', v_id::text, jsonb_build_object('handle', v_handle));
  return v_id;
end $$;

create or replace function public.submit_verification(
  p_artist uuid, p_website text, p_socials jsonb, p_method public.proof_method,
  p_proof_post_url text, p_third_party_name text, p_third_party_email text,
  p_third_party_relation text, p_notes text
) returns table (submission_id uuid, third_party_token text)
language plpgsql security definer set search_path = public as $$
declare
  v_artist public.artists;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_email_domain text;
  v_site_host text;
  v_match boolean;
  v_token text;
  v_id uuid;
begin
  if not public.is_owner(p_artist) then raise exception 'Only the account owner can submit verification'; end if;
  select * into v_artist from public.artists where id = p_artist;
  if v_artist.status in ('approved', 'suspended') then
    raise exception 'This account is %; verification can''t be resubmitted', v_artist.status;
  end if;
  if coalesce(trim(p_website), '') = '' then raise exception 'Add the official website'; end if;

  v_email_domain := split_part(v_email, '@', 2);
  v_site_host := lower(regexp_replace(regexp_replace(trim(p_website), '^[a-z]+://', '', 'i'), '[/:?#].*$', ''));
  v_site_host := regexp_replace(v_site_host, '^www\.', '');
  v_match := v_email_domain <> '' and (v_email_domain = v_site_host or v_email_domain like '%.' || v_site_host);

  if p_method = 'domain_email' and not v_match then
    raise exception 'Your sign-in email (%) isn''t on %. Choose another proof method.', v_email, v_site_host;
  end if;
  if p_method = 'code_post' and coalesce(trim(p_proof_post_url), '') = '' then
    raise exception 'Add the link to the post (or where you sent the DM)';
  end if;
  if p_method = 'third_party' then
    if coalesce(trim(p_third_party_email), '') = '' or coalesce(trim(p_third_party_name), '') = '' then
      raise exception 'Add the name and email of your manager, agent, or label contact';
    end if;
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
  end if;

  update public.verification_submissions set status = 'superseded'
    where artist_id = p_artist and status = 'pending';

  insert into public.verification_submissions (
    artist_id, submitted_by, website, socials, proof_method, proof_post_url, proof_code,
    submitter_email, domain_email_match, third_party_name, third_party_email, third_party_relation,
    third_party_token, notes
  ) values (
    p_artist, auth.uid(), trim(p_website), coalesce(p_socials, '{}'::jsonb), p_method,
    nullif(trim(p_proof_post_url), ''), v_artist.verification_code, v_email, v_match,
    nullif(trim(p_third_party_name), ''), lower(nullif(trim(p_third_party_email), '')),
    nullif(trim(p_third_party_relation), ''), v_token, nullif(trim(p_notes), '')
  ) returning id into v_id;

  update public.artists set status = 'pending', website = trim(p_website) where id = p_artist;
  perform public.log_event(p_artist, 'verification.submitted', 'verification', v_id::text,
    jsonb_build_object('method', p_method, 'domain_email_match', v_match));
  return query select v_id, v_token;
end $$;

-- Public: manager/agent/label confirms via emailed link (token is the secret)
create or replace function public.get_third_party_request(p_token text)
returns table (artist_name text, artist_handle text, website text, contact_name text, relation text, confirmed boolean, open boolean)
language sql stable security definer set search_path = public as $$
  select a.name, a.handle, v.website, v.third_party_name, v.third_party_relation,
         v.third_party_confirmed_at is not null, v.status = 'pending'
  from public.verification_submissions v join public.artists a on a.id = v.artist_id
  where v.third_party_token = p_token
$$;

create or replace function public.confirm_third_party(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v public.verification_submissions;
begin
  select * into v from public.verification_submissions where third_party_token = p_token;
  if not found or v.status <> 'pending' then return false; end if;
  if v.third_party_confirmed_at is null then
    update public.verification_submissions set third_party_confirmed_at = now() where id = v.id;
    insert into public.audit_log (actor_id, artist_id, action, entity, entity_id, details)
    values (null, v.artist_id, 'verification.third_party_confirmed', 'verification', v.id::text,
            jsonb_build_object('contact', v.third_party_email));
  end if;
  return true;
end $$;

-- Super admin: approve / reject / suspend / reinstate
create or replace function public.review_artist(p_artist uuid, p_decision text, p_notes text, p_checklist jsonb)
returns public.artist_status language plpgsql security definer set search_path = public as $$
declare
  v_artist public.artists;
  v_sub uuid;
  v_new public.artist_status;
begin
  if not public.is_super_admin() then raise exception 'Super admin only'; end if;
  select * into v_artist from public.artists where id = p_artist for update;
  if not found then raise exception 'Artist not found'; end if;
  select id into v_sub from public.verification_submissions
    where artist_id = p_artist and status = 'pending' order by created_at desc limit 1;

  case p_decision
    when 'approve' then
      if v_artist.status not in ('pending', 'rejected') then raise exception 'Only pending or rejected artists can be approved'; end if;
      v_new := 'approved';
      update public.artists set status = v_new, verified_at = now(), verified_by = auth.uid() where id = p_artist;
      update public.verification_submissions set status = 'approved', reviewer_id = auth.uid(),
        reviewer_notes = p_notes, checklist = coalesce(p_checklist, '{}'::jsonb), decided_at = now() where id = v_sub;
    when 'reject' then
      if v_artist.status <> 'pending' then raise exception 'Only pending artists can be rejected'; end if;
      if coalesce(trim(p_notes), '') = '' then raise exception 'Add a note telling the artist what to fix'; end if;
      v_new := 'rejected';
      update public.artists set status = v_new where id = p_artist;
      update public.verification_submissions set status = 'rejected', reviewer_id = auth.uid(),
        reviewer_notes = p_notes, checklist = coalesce(p_checklist, '{}'::jsonb), decided_at = now() where id = v_sub;
    when 'suspend' then
      if v_artist.status <> 'approved' then raise exception 'Only approved artists can be suspended'; end if;
      v_new := 'suspended';
      update public.artists set status = v_new where id = p_artist;
    when 'reinstate' then
      if v_artist.status <> 'suspended' then raise exception 'Only suspended artists can be reinstated'; end if;
      v_new := 'approved';
      update public.artists set status = v_new where id = p_artist;
    else raise exception 'Unknown decision %', p_decision;
  end case;

  perform public.log_event(p_artist, 'artist.' || p_decision, 'artist', p_artist::text,
    jsonb_build_object('from', v_artist.status, 'to', v_new, 'notes', p_notes, 'checklist', p_checklist));
  return v_new;
end $$;

create or replace function public.set_artist_fee(p_artist uuid, p_bps integer, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_old integer;
begin
  if not public.is_super_admin() then raise exception 'Super admin only'; end if;
  if p_bps < 0 or p_bps > 5000 then raise exception 'Fee must be between 0%% and 50%%'; end if;
  select fee_bps into v_old from public.artists where id = p_artist for update;
  update public.artists set fee_bps = p_bps where id = p_artist;
  perform public.log_event(p_artist, 'artist.fee_changed', 'artist', p_artist::text,
    jsonb_build_object('from_bps', v_old, 'to_bps', p_bps, 'note', p_note));
end $$;

create or replace function public.set_managed_candidate(p_artist uuid, p_flag boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Super admin only'; end if;
  update public.artists set managed_candidate = p_flag where id = p_artist;
  perform public.log_event(p_artist, case when p_flag then 'artist.flagged_managed' else 'artist.unflagged_managed' end,
    'artist', p_artist::text, '{}'::jsonb);
end $$;

create or replace function public.log_assist(p_artist uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Super admin only'; end if;
  perform public.log_event(p_artist, 'admin.assist_opened', 'artist', p_artist::text, '{}'::jsonb);
end $$;

-- Team
create or replace function public.create_invitation(p_artist uuid, p_email text, p_role public.member_role)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text; v_email text := lower(trim(p_email));
begin
  if not (public.is_owner(p_artist) or public.is_super_admin()) then raise exception 'Only the account owner can invite people'; end if;
  if p_role = 'owner' then raise exception 'Invite as a rep or accountant'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;
  if exists (select 1 from public.artist_members m join public.profiles p on p.id = m.user_id
             where m.artist_id = p_artist and p.email = v_email) then
    raise exception '% is already on this team', v_email;
  end if;
  update public.invitations set revoked_at = now()
    where artist_id = p_artist and email = v_email and accepted_at is null and revoked_at is null;
  insert into public.invitations (artist_id, email, role, invited_by)
  values (p_artist, v_email, p_role, auth.uid()) returning token into v_token;
  perform public.log_event(p_artist, 'team.invited', 'invitation', v_email, jsonb_build_object('role', p_role));
  return v_token;
end $$;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.invitations;
begin
  select * into v from public.invitations where id = p_invitation;
  if not found or not (public.is_owner(v.artist_id) or public.is_super_admin()) then raise exception 'Not allowed'; end if;
  update public.invitations set revoked_at = now() where id = p_invitation and accepted_at is null;
  perform public.log_event(v.artist_id, 'team.invite_revoked', 'invitation', v.email, '{}'::jsonb);
end $$;

create or replace function public.get_invitation(p_token text)
returns table (artist_name text, role public.member_role, email text, state text)
language sql stable security definer set search_path = public as $$
  select a.name, i.role, i.email,
    case when i.accepted_at is not null then 'accepted'
         when i.revoked_at is not null then 'revoked'
         when i.expires_at < now() then 'expired'
         else 'open' end
  from public.invitations i join public.artists a on a.id = i.artist_id
  where i.token = p_token
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.invitations; v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into v from public.invitations where token = p_token for update;
  if not found or v.revoked_at is not null then raise exception 'This invite is no longer valid'; end if;
  if v.accepted_at is not null then
    if v.accepted_by = auth.uid() then return v.artist_id; end if;
    raise exception 'This invite has already been used';
  end if;
  if v.expires_at < now() then raise exception 'This invite has expired. Ask for a new one.'; end if;
  if v.email <> v_email then
    raise exception 'This invite was sent to %. Sign in with that email to accept it.', v.email;
  end if;
  insert into public.artist_members (artist_id, user_id, role, invited_by)
  values (v.artist_id, auth.uid(), v.role, v.invited_by)
  on conflict (artist_id, user_id) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = v.id;
  perform public.log_event(v.artist_id, 'team.joined', 'member', auth.uid()::text, jsonb_build_object('role', v.role));
  return v.artist_id;
end $$;

create or replace function public.remove_member(p_artist uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role public.member_role;
begin
  if not (public.is_owner(p_artist) or public.is_super_admin()) then raise exception 'Only the account owner can remove people'; end if;
  select role into v_role from public.artist_members where artist_id = p_artist and user_id = p_user;
  if v_role = 'owner' then raise exception 'The account owner can''t be removed'; end if;
  delete from public.artist_members where artist_id = p_artist and user_id = p_user;
  perform public.log_event(p_artist, 'team.removed', 'member', p_user::text, jsonb_build_object('role', v_role));
end $$;

-- Public storefront (safe fields only; only approved artists; only published upcoming shows)
create or replace function public.get_storefront(p_handle text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', a.name, 'handle', a.handle, 'website', a.website, 'bio', a.bio, 'verified', a.verified_at is not null,
    'shows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', s.slug, 'date', s.show_date, 'venue', s.venue_name, 'city', s.city,
        'region', s.region, 'country', s.country, 'tour', t.name) order by s.show_date)
      from public.shows s join public.tours t on t.id = s.tour_id
      where s.artist_id = a.id and s.status = 'published' and s.show_date >= current_date
    ), '[]'::jsonb))
  from public.artists a
  where a.handle = lower(p_handle) and a.status = 'approved'
$$;

-- Function grants
revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_super_admin(), public.member_role(uuid), public.is_member(uuid),
  public.can_edit_shows(uuid), public.is_owner(uuid), public.shares_artist_with(uuid) to authenticated;
grant execute on function
  public.create_artist(text, text, text),
  public.submit_verification(uuid, text, jsonb, public.proof_method, text, text, text, text, text),
  public.review_artist(uuid, text, text, jsonb),
  public.set_artist_fee(uuid, integer, text),
  public.set_managed_candidate(uuid, boolean),
  public.log_assist(uuid),
  public.create_invitation(uuid, text, public.member_role),
  public.revoke_invitation(uuid),
  public.accept_invitation(text),
  public.remove_member(uuid, uuid)
  to authenticated;
grant execute on function
  public.get_invitation(text),
  public.get_third_party_request(text),
  public.confirm_third_party(text),
  public.get_storefront(text)
  to anon, authenticated;
