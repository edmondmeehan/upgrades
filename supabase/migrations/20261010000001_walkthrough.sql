-- First-time walkthrough: shown once per person, replayable.
alter table public.profiles add column walkthrough_done_at timestamptz;
grant update (walkthrough_done_at) on public.profiles to authenticated;
