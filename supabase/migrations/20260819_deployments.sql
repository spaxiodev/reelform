-- Deploying a finished site to the user's own Vercel / Supabase accounts.
--
-- Two new tables: `integrations` holds the OAuth grants (service-role only),
-- `deployments` is the per-project history the studio shows.

-- ── Connected third-party accounts ───────────────────────────────────
-- Tokens are sealed with INTEGRATION_SECRET before they reach this table
-- (see lib/crypto.ts). RLS is enabled with *no policies on purpose*: nothing
-- but the service-role client may read a row, so a token can never be pulled
-- through the browser client the way a project row can.
create table if not exists public.integrations (
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('vercel', 'supabase')),
  access_token text not null,                  -- encrypted
  refresh_token text,                          -- encrypted
  expires_at timestamptz,                      -- null = does not expire (Vercel)
  account_id text,                             -- Vercel team id, when installed on a team
  account_name text,                           -- display label for the UI
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.integrations enable row level security;

revoke all on public.integrations from anon, authenticated;

-- ── Deployment history ───────────────────────────────────────────────
create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('vercel', 'supabase')),
  -- vercel: hosting. supabase: backend, storage, or both.
  target text not null default 'hosting',
  status text not null default 'queued',       -- queued | building | ready | error
  url text,                                    -- the live site, once it is up
  external_id text,                            -- Vercel deployment id
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deployments_project_idx
  on public.deployments (project_id, created_at desc);
create index if not exists deployments_user_idx
  on public.deployments (user_id, created_at desc);

alter table public.deployments enable row level security;

-- Read-only for the owner: rows are written by the deploy route with the
-- service-role client, which already knows the user is entitled to deploy.
drop policy if exists "deployments_select_own" on public.deployments;
create policy "deployments_select_own" on public.deployments
  for select using (user_id = auth.uid());

-- ── Where a project currently lives ──────────────────────────────────
-- Kept on the project so a re-deploy lands on the same Vercel project and
-- writes into the same Supabase project instead of creating a new one, and so
-- the live-site cap can be counted per plan.
alter table public.projects add column if not exists vercel_project_id text;
alter table public.projects add column if not exists vercel_url text;
alter table public.projects add column if not exists supabase_project_ref text;
alter table public.projects add column if not exists supabase_url text;
alter table public.projects add column if not exists live_at timestamptz;

create index if not exists projects_live_idx on public.projects (user_id)
  where live_at is not null;
