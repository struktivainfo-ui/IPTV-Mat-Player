# Vercel Setup

## Build

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Environment: `VITE_API_URL=https://iptv-mat-backend-v6-6.onrender.com`

## Enthaltene Deploy-Fixes

- `vercel.json` setzt einen SPA-Fallback auf `index.html`
- Render ist die produktive API-Schicht fuer M3U/Xtream, Healthcheck und Media-Proxy.
- Vercel API-Dateien bleiben nur als technische Fallbacks im Repository.

## Empfohlener Betriebsmodus

- Auf Vercel: `VITE_API_URL` setzen und danach Production neu deployen.
- URL-Importe und Xtream laufen aus Sicherheitsgruenden ueber Render.
- Direkte Browser-Zugriffe auf Anbieter werden produktiv nicht genutzt.
