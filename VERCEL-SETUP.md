# Vercel Setup

## Build

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`

## Enthaltene Deploy-Fixes

- `vercel.json` setzt einen SPA-Fallback auf `index.html`
- `/api/xtream` proxyt Xtream-JSON-Aufrufe
- `/api/media` proxyt HLS-Playlists, Segmente und MP4-Dateien
- Im UI gibt es die Modi `Auto`, `Proxy` und `Direkt`

## Empfohlener Betriebsmodus

- Auf Vercel: `Auto`
- Fuer Fehlersuche: `Proxy`
- `Direkt` nur, wenn der IPTV-Server Browser-Zugriffe inklusive CORS sauber erlaubt
