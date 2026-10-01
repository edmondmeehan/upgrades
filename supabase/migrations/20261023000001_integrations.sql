-- Integrations: Bandsintown (import dates) and Laylo (sync opted-in fans). Keys are only readable by the server.

create table public.artist_integrations (
  artist_id    uuid not null references public.artists (id) on delete cascade,
  provider     text not null check (provider in ('bandsintown', 'laylo')),
  settings     jsonb not null default '{}'::jsonb,   -- e.g. Bandsintown artist name, Laylo Drop id (not secret)
  secret       text,                                 -- API key: never sent to the browser
  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz not null default now(),
  last_ok_at   timestamptz,
  last_error   text,
  last_error_at timestamptz,
  synced_count integer not null default 0,
  primary key (artist_id, provider)
);
alter table public.artist_integrations enable row level security;
revoke all on public.artist_integrations from anon, authenticated;   -- server (service role) only

/** What the Integrations page shows: connection status, never the key. */
create or replace function public.integration_status(p_artist uuid)
returns table (provider text, settings jsonb, connected_at timestamptz, last_ok_at timestamptz, last_error text, last_error_at timestamptz, synced_count integer, key_hint text)
language sql stable security definer set search_path = public as $$
  select provider, settings, connected_at, last_ok_at, last_error, last_error_at, synced_count,
    case when secret is null then null else '••••' || right(secret, 4) end
  from public.artist_integrations where artist_id = p_artist and public.can_edit_shows(p_artist)
$$;
revoke execute on function public.integration_status(uuid) from public, anon;
grant execute on function public.integration_status(uuid) to authenticated;

-- Bandsintown event id on imported shows, so re-imports don't duplicate.
alter table public.shows add column bit_event_id text;
create unique index shows_bit_event on public.shows (artist_id, bit_event_id) where bit_event_id is not null;
