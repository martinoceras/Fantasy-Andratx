-- Afegir llegenda d'estat de Biwenger als jugadors
-- Executa aquest script a Supabase SQL Editor

alter table public.players
  add column if not exists status_info text;

