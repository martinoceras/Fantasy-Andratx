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
