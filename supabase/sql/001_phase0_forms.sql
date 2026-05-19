create table if not exists public.launch_waitlist (
  id bigint generated always as identity primary key,
  email text not null unique,
  focus text not null,
  source_page text,
  submitted_at_iso text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.launch_feedback (
  id bigint generated always as identity primary key,
  feedback_type text not null check (feedback_type in ('feedback', 'bug')),
  email text not null,
  message text not null,
  source_page text,
  submitted_at_iso text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_entitlements (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  plan text not null check (plan in ('pro_monthly', 'pro_yearly')),
  status text not null check (status in ('active', 'cancelled', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists launch_waitlist_set_updated_at on public.launch_waitlist;
create trigger launch_waitlist_set_updated_at
before update on public.launch_waitlist
for each row execute function public.set_updated_at();

drop trigger if exists user_entitlements_set_updated_at on public.user_entitlements;
create trigger user_entitlements_set_updated_at
before update on public.user_entitlements
for each row execute function public.set_updated_at();

alter table public.launch_waitlist enable row level security;
alter table public.launch_feedback enable row level security;
alter table public.user_entitlements enable row level security;

drop policy if exists launch_waitlist_no_client_access on public.launch_waitlist;
create policy launch_waitlist_no_client_access
on public.launch_waitlist
for all
using (false)
with check (false);

drop policy if exists launch_feedback_no_client_access on public.launch_feedback;
create policy launch_feedback_no_client_access
on public.launch_feedback
for all
using (false)
with check (false);

drop policy if exists user_entitlements_no_client_access on public.user_entitlements;
create policy user_entitlements_no_client_access
on public.user_entitlements
for all
using (false)
with check (false);
