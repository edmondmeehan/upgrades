-- Artist page extras: a Spotify player, a YouTube video, and links (official website is the existing website column).
alter table public.artists
  add column spotify_url text check (spotify_url is null or spotify_url ~ '^https://open\.spotify\.com/'),
  add column youtube_url text check (youtube_url is null or youtube_url ~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/'),
  add column links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 6);

/** What the public artist page shows beside the tour dates (approved artists only). */
create or replace function public.storefront_media(p_handle text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('spotify_url', spotify_url, 'youtube_url', youtube_url, 'website', website, 'links', links)
  from public.artists where handle = lower(p_handle) and status = 'approved'
$$;
grant execute on function public.storefront_media(text) to anon, authenticated;
