-- Longbox (Comic) schema — lives in the letterSizd Supabase project so both
-- apps share accounts, profiles/avatars and the friend list.
-- Apply: Management API  POST /v1/projects/{ref}/database/query  (idempotent)

-- ── one row per comic in a user's collection ───────────────────────────────
create table if not exists public.comic_entries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  comic_id text not null,
  owned boolean not null default false,
  read boolean not null default false,
  wishlist boolean not null default false,
  rating numeric(2,1) check (rating is null or (rating >= 0.5 and rating <= 5)),
  read_at date,
  review text,
  variants jsonb not null default '[]'::jsonb,
  paid numeric(10,2),
  value numeric(10,2),
  est numeric(10,2),
  meta jsonb not null,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, comic_id)
);
create index if not exists comic_entries_updated on public.comic_entries (updated_at desc);
create index if not exists comic_entries_comic on public.comic_entries (comic_id);
-- your count of the issues a collected edition holds (overrides the looked-up one)
alter table public.comic_entries add column if not exists issues smallint check (issues is null or (issues between 1 and 999));

-- ── series a user follows (their pull list) ────────────────────────────────
create table if not exists public.comic_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  series_id text not null,
  title text not null,
  publisher text,
  cover text,
  created_at timestamptz not null default now(),
  primary key (user_id, series_id)
);

-- ── daily collection value, for the portfolio chart ────────────────────────
create table if not exists public.comic_value_history (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  value numeric(12,2) not null,
  items integer not null,
  primary key (user_id, day)
);

-- ── server-side caches (edge functions only; no client policies) ───────────
create table if not exists public.comic_cache (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.comic_upc (
  code text primary key, -- 12-digit UPC-A or 13-digit ISBN (no add-on)
  series_id text,
  comic_id text,
  meta jsonb,
  source text,
  updated_at timestamptz not null default now()
);

-- ── RLS: friends app — everyone signed in reads, you write only your rows ──
alter table public.comic_entries enable row level security;
drop policy if exists "ce_select" on public.comic_entries;
create policy "ce_select" on public.comic_entries for select to authenticated using (true);
drop policy if exists "ce_insert" on public.comic_entries;
create policy "ce_insert" on public.comic_entries for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "ce_update" on public.comic_entries;
create policy "ce_update" on public.comic_entries for update to authenticated using (user_id = auth.uid());
drop policy if exists "ce_delete" on public.comic_entries;
create policy "ce_delete" on public.comic_entries for delete to authenticated using (user_id = auth.uid());

alter table public.comic_follows enable row level security;
drop policy if exists "cf_select" on public.comic_follows;
create policy "cf_select" on public.comic_follows for select to authenticated using (true);
drop policy if exists "cf_insert" on public.comic_follows;
create policy "cf_insert" on public.comic_follows for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "cf_delete" on public.comic_follows;
create policy "cf_delete" on public.comic_follows for delete to authenticated using (user_id = auth.uid());

alter table public.comic_value_history enable row level security;
drop policy if exists "cv_select" on public.comic_value_history;
create policy "cv_select" on public.comic_value_history for select to authenticated using (true);
drop policy if exists "cv_insert" on public.comic_value_history;
create policy "cv_insert" on public.comic_value_history for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "cv_update" on public.comic_value_history;
create policy "cv_update" on public.comic_value_history for update to authenticated using (user_id = auth.uid());

alter table public.comic_cache enable row level security;
alter table public.comic_upc enable row level security;
