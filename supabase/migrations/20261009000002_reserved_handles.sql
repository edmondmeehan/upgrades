alter table public.artists drop constraint if exists artists_handle_not_reserved;
alter table public.artists add constraint artists_handle_not_reserved
  check (handle <> all (array['order', 'checkout', 'api', 'o', 'admin-invite', 'dev', 'photos', 'find-order', 'for-artists', 'qr', 'support']));
