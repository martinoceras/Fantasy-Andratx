# Anti-trampes de jornada

Aquest document explica com funciona el bloqueig d'alineació i la substitució automàtica.

## Regla funcional

1. Quan la jornada entra en joc, es bloqueja l'edició de `titulars` i `banqueta`.
2. En aquell moment es guarda un snapshot immutable per usuari i jornada (`gameweek_lineups`).
3. En el càlcul de classificació de jornada:
   - La substitució automàtica només s'aplica quan la jornada està **tancada** i hi ha punts oficials publicats.
   - Si un titular no té registre a `player_punts` per la jornada, es considera que no ha puntuat.
   - El sistema prova el canvi automàtic amb el suplent `#1` de la mateixa posició.
   - La suma de punts es fa sobre l'alineació després d'aplicar aquest canvi.
4. Un cop tancada la jornada, els punts queden bloquejats i només els pot modificar el super admin.

## Setup base de dades

Executa el fitxer `supabase/anti-trampes.sql` a Supabase SQL Editor.

## Endpoints implicats

- `GET /api/gameweek-status`: determina si la jornada està en compte enrere o en joc.
- `POST /api/gameweek-lock`: guarda snapshot (`alineacio`, `suplents`, `formacio`) quan entra en joc.
- `GET /api/laliga-calendar`: dades de partits i estat de jornada.
- `POST /api/admin/gameweek-points`: accions de super admin (`lock`, `unlock`, `set-player-points`).

## SQL addicional de bloqueig de punts

Executa també `supabase/anti-trampes-punts-lock.sql`.

Aquest script crea:
- taula `gameweek_points_lock` (estat bloquejat per jornada)
- trigger sobre `player_punts` que impedeix canvis si la jornada està bloquejada (excepte `service_role`)

## Nota tècnica

Actualment la detecció de "no juga ni un minut" s'aproxima a partir de l'absència de registre a `player_punts` per aquella jornada.
Si després incorpores una font fiable de minuts jugats, es pot substituir aquesta regla per minuts reals.


