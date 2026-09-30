-- Handles that would collide with site routes.
alter table public.artists add constraint artists_handle_not_reserved
  check (handle <> all (array['order', 'checkout', 'api', 'o', 'admin-invite', 'dev']));
