-- Bloqueig de punts per jornada finalitzada
-- Només service_role (backend/admin) pot modificar punts d'una jornada bloquejada.

create table if not exists public.gameweek_points_lock (
  jornada integer primary key check (jornada > 0 and jornada <= 38),
  locked boolean not null default true,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now()
);

create or replace function public.prevent_locked_gameweek_points_mutation()
returns trigger
language plpgsql
as $$
declare
  _jornada integer;
  _locked boolean;
  _role text;
begin
  _jornada := coalesce(new.jornada, old.jornada);
  _role := coalesce(current_setting('request.jwt.claim.role', true), '');

  select locked into _locked
  from public.gameweek_points_lock
  where jornada = _jornada;

  if coalesce(_locked, false) and _role <> 'service_role' then
    raise exception 'La jornada % està bloquejada. Només super admin pot modificar punts.', _jornada;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_prevent_locked_gameweek_points_mutation on public.player_punts;
create trigger trg_prevent_locked_gameweek_points_mutation
before insert or update or delete on public.player_punts
for each row
execute function public.prevent_locked_gameweek_points_mutation();

-- Exemples:
-- lock jornada 3
-- insert into public.gameweek_points_lock (jornada, locked, locked_at, locked_by)
-- values (3, true, now(), 'system')
-- on conflict (jornada) do update set locked = excluded.locked, locked_at = excluded.locked_at, locked_by = excluded.locked_by;
--
-- unlock jornada 3
-- update public.gameweek_points_lock set locked = false, locked_at = null, locked_by = 'super_admin' where jornada = 3;

