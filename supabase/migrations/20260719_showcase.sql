-- Showcase / "get featured" — delta migration for databases that already ran
-- schema.sql before 2026-07-19. Paste into the Supabase SQL editor and run.

alter table public.projects
  add column if not exists published boolean not null default false,
  add column if not exists published_at timestamptz;

create index if not exists projects_published_idx on public.projects (published_at desc)
  where published;

drop policy if exists "read published projects" on public.projects;
create policy "read published projects" on public.projects
  for select using (published = true);
