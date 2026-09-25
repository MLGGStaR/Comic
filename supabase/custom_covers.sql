-- Your own cover photos for covers the catalogue doesn't have (e.g. FOMO
-- Books exclusives from Dubai). Shared with friends; scans can match them.
-- New objects only — nothing letterSizd uses is touched.

create table if not exists public.comic_custom_covers (
  id uuid primary key default gen_random_uuid(),
  comic_id text not null,
  name text not null,
  image_url text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists comic_custom_covers_comic on public.comic_custom_covers (comic_id);

alter table public.comic_custom_covers enable row level security;
drop policy if exists "ccc_select" on public.comic_custom_covers;
create policy "ccc_select" on public.comic_custom_covers for select to authenticated using (true);
drop policy if exists "ccc_insert" on public.comic_custom_covers;
create policy "ccc_insert" on public.comic_custom_covers for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "ccc_update" on public.comic_custom_covers;
create policy "ccc_update" on public.comic_custom_covers for update to authenticated using (created_by = auth.uid());
drop policy if exists "ccc_delete" on public.comic_custom_covers;
create policy "ccc_delete" on public.comic_custom_covers for delete to authenticated using (created_by = auth.uid());

-- public bucket for the photos: anyone can view, you upload into your own folder
insert into storage.buckets (id, name, public) values ('comic-covers', 'comic-covers', true) on conflict (id) do nothing;
drop policy if exists "lbx_covers_read" on storage.objects;
create policy "lbx_covers_read" on storage.objects for select using (bucket_id = 'comic-covers');
drop policy if exists "lbx_covers_insert" on storage.objects;
create policy "lbx_covers_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'comic-covers' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "lbx_covers_delete" on storage.objects;
create policy "lbx_covers_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'comic-covers' and (storage.foldername(name))[1] = auth.uid()::text);
