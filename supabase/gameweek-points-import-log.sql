-- Historial de la darrera importació de punts per jornada.
-- Desa només una fila per jornada i permet mostrar la data/hora a Classificació.

create table if not exists public.gameweek_points_import_log (
  jornada integer primary key check (jornada > 0 and jornada <= 38),
  imported_at timestamptz not null,
  imported_by text,
  source text,
  created_at timestamptz not null default now()
);

comment on table public.gameweek_points_import_log is 'Historial de la darrera importació de punts per jornada';

