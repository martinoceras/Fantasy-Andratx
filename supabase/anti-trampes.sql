-- Anti-trampes: snapshots d'alineació bloquejada per jornada
-- Executa aquest script a Supabase SQL Editor

create table if not exists public.gameweek_lineups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  jornada integer not null check (jornada > 0 and jornada <= 38),
  alineacio jsonb not null default '{}'::jsonb,
  suplents jsonb not null default '{}'::jsonb,
  formacio text not null default '4-4-2',
  locked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, jornada)
);

create index if not exists idx_gameweek_lineups_jornada on public.gameweek_lineups(jornada);
create index if not exists idx_gameweek_lineups_user on public.gameweek_lineups(user_id);

alter table public.gameweek_lineups enable row level security;

-- Lectura per l'usuari propietari
create policy if not exists "gameweek_lineups_select_own"
on public.gameweek_lineups
for select
using (auth.uid() = user_id);

-- Inserció/actualització per l'usuari propietari
create policy if not exists "gameweek_lineups_insert_own"
on public.gameweek_lineups
for insert
with check (auth.uid() = user_id);

create policy if not exists "gameweek_lineups_update_own"
on public.gameweek_lineups
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

