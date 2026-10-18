-- Team management: change a person's role, keep a record of removed people so they can be added back,
-- and let P&T admins reactivate a former admin.

-- People removed from an artist's team (one row per person; replaced if removed again).
create table public.removed_members (
  artist_id  uuid not null references public.artists (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,   -- null once their whole account is deleted
  email      text not null,
  name       text,
  role       public.member_role not null,
  removed_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz not null default now(),
  primary key (artist_id, email)
);
alter table public.removed_members enable row level security;
revoke all on public.removed_members from anon, authenticated;
grant select on public.removed_members to authenticated;
create policy removed_members_select on public.removed_members for select to authenticated
  using (public.is_owner(artist_id) or public.is_super_admin());

-- Former P&T admins.
alter table public.profiles add column admin_removed_at timestamptz;

/** Remove someone from a team, keeping a record so they can be added back. */
create or replace function public.remove_member(p_artist uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role public.member_role; p public.profiles;
begin
  if not (public.is_owner(p_artist) or public.is_super_admin()) then raise exception 'Only the account owner can remove people'; end if;
  select role into v_role from public.artist_members where artist_id = p_artist and user_id = p_user;
  if v_role is null then raise exception 'That person isn''t on this team'; end if;
  if v_role = 'owner' and (select count(*) from public.artist_members where artist_id = p_artist and role = 'owner') <= 1 then
    raise exception 'The only owner can''t be removed. Make someone else an owner first.';
  end if;
  select * into p from public.profiles where id = p_user;
  delete from public.artist_members where artist_id = p_artist and user_id = p_user;
  insert into public.removed_members (artist_id, user_id, email, name, role, removed_by)
  values (p_artist, p_user, lower(p.email), p.name, v_role, auth.uid())
  on conflict (artist_id, email) do update set user_id = excluded.user_id, name = excluded.name, role = excluded.role,
    removed_by = excluded.removed_by, removed_at = now();
  perform public.log_event(p_artist, 'team.removed', 'member', p_user::text, jsonb_build_object('role', v_role, 'email', p.email));
end $$;

/** Add a removed person back with their previous role (or a new one). */
create or replace function public.restore_member(p_artist uuid, p_email text, p_role public.member_role default null)
returns text language plpgsql security definer set search_path = public as $$
declare r public.removed_members; v_user uuid; v_role public.member_role;
begin
  if not (public.is_owner(p_artist) or public.is_super_admin()) then raise exception 'Only the account owner can add people back'; end if;
  select * into r from public.removed_members where artist_id = p_artist and email = lower(trim(p_email));
  if not found then raise exception 'No removed person with that email'; end if;
  v_role := coalesce(p_role, r.role);
  -- Their account may have been deleted and created again since: match by email.
  select id into v_user from public.profiles where id = r.user_id or lower(email) = r.email order by (id = r.user_id) desc limit 1;
  if v_user is null then return 'no_account'; end if;
  insert into public.artist_members (artist_id, user_id, role, invited_by) values (p_artist, v_user, v_role, auth.uid())
  on conflict (artist_id, user_id) do update set role = excluded.role;
  delete from public.removed_members where artist_id = p_artist and email = r.email;
  perform public.log_event(p_artist, 'team.restored', 'member', v_user::text, jsonb_build_object('role', v_role, 'email', r.email));
  return 'ok';
end $$;

/** Forget a removed person (clears them from the Removed list). */
create or replace function public.forget_removed_member(p_artist uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_owner(p_artist) or public.is_super_admin()) then raise exception 'Not allowed'; end if;
  delete from public.removed_members where artist_id = p_artist and email = lower(trim(p_email));
end $$;

/** Change someone's role on a team. Owners and P&T admins only; there must always be an owner. */
create or replace function public.set_member_role(p_artist uuid, p_user uuid, p_role public.member_role)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.member_role;
begin
  if not (public.is_owner(p_artist) or public.is_super_admin()) then raise exception 'Only the account owner can change roles'; end if;
  select role into v_old from public.artist_members where artist_id = p_artist and user_id = p_user for update;
  if v_old is null then raise exception 'That person isn''t on this team'; end if;
  if v_old = p_role then return; end if;
  if v_old = 'owner' and (select count(*) from public.artist_members where artist_id = p_artist and role = 'owner') <= 1 then
    raise exception 'This is the only owner. Make someone else an owner first.';
  end if;
  update public.artist_members set role = p_role where artist_id = p_artist and user_id = p_user;
  perform public.log_event(p_artist, 'team.role_changed', 'member', p_user::text, jsonb_build_object('from', v_old, 'to', p_role));
end $$;

/** Inviting someone who was removed clears them from the Removed list. */
create or replace function public.clear_removed_on_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.removed_members where artist_id = new.artist_id and email = lower(new.email);
  return new;
end $$;
create trigger invitations_clear_removed after insert on public.invitations for each row execute function public.clear_removed_on_invite();

/** P&T admins: removing keeps a record; reactivating restores access. */
create or replace function public.remove_admin(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not public.is_super_admin() then raise exception 'Super admin only'; end if;
  if p_user = auth.uid() then raise exception 'You can''t remove yourself. Ask another admin.'; end if;
  if (select count(*) from public.profiles where is_super_admin) <= 1 then raise exception 'There must be at least one admin'; end if;
  update public.profiles set is_super_admin = false, admin_removed_at = now() where id = p_user and is_super_admin returning email into v_email;
  if v_email is null then raise exception 'That person isn''t an admin'; end if;
  perform public.log_event(null, 'admin.removed', 'admin', v_email, '{}'::jsonb);
end $$;

create or replace function public.reactivate_admin(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not public.is_super_admin() then raise exception 'Super admin only'; end if;
  update public.profiles set is_super_admin = true, admin_removed_at = null where id = p_user and not is_super_admin returning email into v_email;
  if v_email is null then raise exception 'That person isn''t a former admin'; end if;
  perform public.log_event(null, 'admin.reactivated', 'admin', v_email, '{}'::jsonb);
end $$;

/** Former admins, for the Admins page. */
create or replace function public.former_admins()
returns table (id uuid, email text, name text, removed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.name, p.admin_removed_at from public.profiles p
  where p.admin_removed_at is not null and not p.is_super_admin and public.is_super_admin()
  order by p.admin_removed_at desc
$$;

revoke execute on function public.restore_member(uuid, text, public.member_role), public.forget_removed_member(uuid, text),
  public.set_member_role(uuid, uuid, public.member_role), public.reactivate_admin(uuid), public.former_admins(), public.clear_removed_on_invite() from public, anon;
grant execute on function public.restore_member(uuid, text, public.member_role), public.forget_removed_member(uuid, text),
  public.set_member_role(uuid, uuid, public.member_role), public.reactivate_admin(uuid), public.former_admins() to authenticated;
