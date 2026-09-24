# Fantasy Andratx

PWA (Progressive Web App) preparada per distribuir la lliga entre amics sense publicar a App Store o Play Store.

## Desenvolupament local

```bash
npm install
npm run dev
```

Obre `http://localhost:3000`.

## Build de produccio

```bash
npm run build
npm run start
```

## Instal lar com app

### Android (Chrome)
1. Obre la URL de produccio.
2. Menu > `Install app` o `Add to Home screen`.
3. Accepta la instal lacio.

### iPhone (Safari)
1. Obre la URL de produccio amb Safari.
2. Botó compartir.
3. `Afegir a pantalla d inici`.

## Fitxers PWA clau

- `public/manifest.webmanifest`: metadades instal lables.
- `public/sw.js`: service worker per cache basic i offline parcial.
- `app/components/PWARegistrar.js`: registra el service worker al client.
- `next.config.mjs`: headers per evitar cache agressiva de `sw.js` i manifest.

## Com s actualitza per als usuaris

1. Fas deploy d una nova versio.
2. Quan l usuari torni a obrir l app, el navegador detecta canvis de `sw.js`.
3. Si encara veu dades antigues, tancar i reobrir l app sol ser suficient.

## Deploy recomanat

Vercel funciona be per aquest flux. Si uses un altre hosting, mantingues HTTPS actiu i respecta els headers de cache.

## Anti-trampes de jornada

- Script DB: `supabase/anti-trampes.sql`
- Script DB (bloqueig punts): `supabase/anti-trampes-punts-lock.sql`
- Documentació funcional: `docs/anti-trampes.md`
- Endpoint super admin punts: `POST /api/admin/gameweek-points` (requereix `ADMIN_SECRET`)

## Importar el draft des d'una altra plataforma

Si necessites crear usuaris que falten, assignar-los les contrasenyes inicials i carregar tots els picks del draft a Supabase:

```bash
npm run seed:draft
```

Per fer una prova sense escriure dades:

```bash
npm run seed:draft -- --dry-run
```

També pots cridar l'endpoint intern d'administració:

```bash
POST /api/admin/seed-draft-roster
```

Aquest procés:
- crea perfils i usuaris que faltin
- deixa un correu i contrasenya inicials per a cada participant nou
- neteja `draft_picks`, `teams` i snapshots relacionats dels participants
- reescriu l'ordre del draft i carrega els picks importats
