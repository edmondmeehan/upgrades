-- Tour date builder: draft shows can be saved with just a date (city/venue filled in later).
-- A show must have a city and venue before it can be published.

alter table public.shows alter column venue_name drop not null;
alter table public.shows alter column city drop not null;

alter table public.shows add constraint shows_published_needs_details
  check (status <> 'published' or (coalesce(trim(city), '') <> '' and coalesce(trim(venue_name), '') <> ''));

-- Keep repo in sync with hardening already applied to the live project.
alter function public.enforce_show_artist() set search_path = public;
alter function public.touch_updated_at() set search_path = public;
revoke execute on function public.handle_new_user(), public.enforce_show_artist(), public.touch_updated_at()
  from public, anon, authenticated;
