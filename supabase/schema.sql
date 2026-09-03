-- ============================================================
-- Scriptorium / Wizards Playground — Supabase Schema v1
--
-- Paste this entire file into the Supabase SQL Editor and run it.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS).
-- ============================================================


-- ── 1. Profiles ──────────────────────────────────────────────────────────────
-- One row per user. Auto-created by trigger when a user signs up.
-- plan: 'free' | 'pro'

create table if not exists public.profiles (
  id               uuid        primary key references auth.users(id) on delete cascade,
  display_name     text,
  plan             text        not null default 'free'
                               check (plan in ('free', 'pro')),
  plan_expires_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own profile
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update their own profile (display_name only; plan is server-controlled)
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);


-- ── 2. Trigger: auto-create profile on signup ─────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── 3. Book cloud backups ─────────────────────────────────────────────────
-- One row per book per user. The `data` JSONB column holds a full snapshot:
-- { book, writingNodes, worldSections, worldEntries, assembly }
-- Upserting on (user_id, local_id) keeps only the latest backup per book.

create table if not exists public.books_backup (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  local_id     text        not null,
  title        text        not null default 'Untitled',
  author       text,
  word_count   integer     not null default 0,
  data         jsonb       not null,
  backed_up_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),

  constraint books_backup_user_local_unique unique (user_id, local_id)
);

alter table public.books_backup enable row level security;

drop policy if exists "books_backup_all_own" on public.books_backup;
create policy "books_backup_all_own"
  on public.books_backup for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists books_backup_user_id_idx
  on public.books_backup (user_id, backed_up_at desc);


-- ── 4. Usage analytics (private) ─────────────────────────────────────────
-- Stores per-user events. Never shared or aggregated externally.
-- Events: 'session_start' | 'words_written' | 'feature_used' | 'backup_created'

create table if not exists public.usage_events (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  event      text        not null,
  data       jsonb,
  created_at timestamptz not null default now()
);

alter table public.usage_events enable row level security;

drop policy if exists "usage_events_insert_own" on public.usage_events;
create policy "usage_events_insert_own"
  on public.usage_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "usage_events_select_own" on public.usage_events;
create policy "usage_events_select_own"
  on public.usage_events for select
  using (auth.uid() = user_id);

create index if not exists usage_events_user_created_idx
  on public.usage_events (user_id, created_at desc);


-- ── 5. updated_at trigger ────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();
