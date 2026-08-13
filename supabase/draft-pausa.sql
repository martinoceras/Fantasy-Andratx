-- Pausa/reactivació del draft
-- Executa aquest script al SQL Editor de Supabase abans d'usar els botons nous

alter table public.drafts
  add column if not exists pausat_at timestamptz,
  add column if not exists temps_pausat_acumulat integer not null default 0;

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.drafts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%estat%';

  if constraint_name is not null and constraint_name <> 'drafts_estat_check' then
    execute format('alter table public.drafts drop constraint %I', constraint_name);
  end if;
exception
  when undefined_table then
    raise notice 'La taula public.drafts no existeix encara.';
end $$;

alter table public.drafts
  drop constraint if exists drafts_estat_check;

alter table public.drafts
  add constraint drafts_estat_check
  check (estat in ('pendent', 'actiu', 'pausat'));

