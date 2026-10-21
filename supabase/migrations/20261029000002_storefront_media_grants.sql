-- The artists table only allows updates to listed columns; the music and links columns were missing.
grant update (spotify_url, youtube_url, links) on public.artists to authenticated;
