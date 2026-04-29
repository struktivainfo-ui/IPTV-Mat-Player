# IPTV Mat Player

Produktionsaufbau fuer einen legalen IPTV-Player ohne mitgelieferte Sender, Streams oder Playlists.

## Architektur

- Frontend: Vercel
- Backend: Render
- Android: Capacitor WebView plus nativer Player-Fallback
- Inhalte: Nutzer importieren eigene M3U/M3U8- oder Xtream-Zugangsdaten

## Frontend Env

In Vercel muss diese Environment Variable gesetzt sein:

```env
VITE_API_URL=https://iptv-mat-backend-v6-6.onrender.com
```

Neue Builds verwenden ausschliesslich `VITE_API_URL`.

## Backend Env

Render nutzt den Blueprint [render.yaml](</C:/Users/matzk/OneDrive/Desktop/salon-karola-v7-2-render-menu-fix/IPTV-Mat-Player/render.yaml>).

Wichtige Werte:

```env
NODE_ENV=production
DATA_DIR=/var/data
PUBLIC_BASE_URL=https://iptv-mat-backend-v6-6.onrender.com
ALLOWED_ORIGINS=https://iptv-mat-player.vercel.app,capacitor://localhost,http://localhost,https://localhost,http://localhost:3000,http://localhost:4173,http://localhost:5173
```

Der Blueprint haengt eine kleine Render Persistent Disk unter `/var/data` ein. Dort speichert das Backend Sync-Metadaten als JSON-Datei. Fuer groessere Nutzerzahlen sollte spaeter Render Postgres oder Redis statt JSON-Datei genutzt werden.

Healthcheck:

```text
GET /health
GET /api/health
```

## Backend-Aufgaben

Render stellt die stabile API-Schicht bereit fuer:

- M3U/Xtream Proxy und CORS-sicheren Import
- Media-Proxy fuer HLS/TS
- User-Status
- Paywall-Status als vorbereitete Free/Premium-Struktur
- Playlist-Metadaten-Speicherung ohne Zugangsdaten
- EPG-Cache-Struktur
- Favoriten-Sync
- Geraeteverwaltung

## Sicherheit

- Keine API Keys im Frontend.
- Keine Xtream/M3U-Zugangsdaten in `localStorage`.
- URL-Importe laufen nur ueber Render, damit CORS/WebView-Probleme kontrolliert behandelt werden.
- Backend-Logs redigieren sensible Felder wie Passwort, Benutzername, URL, Tokens und MAC-Adresse.
- Die App liefert keine Sender, Streams, Playlists oder Inhalte mit.

## Deployment

1. Nach GitHub pushen.
2. Vercel baut das Frontend automatisch.
3. Render Blueprint synchronisieren oder Render Service neu deployen.
4. In Vercel pruefen, dass `VITE_API_URL` gesetzt ist.
5. Healthcheck pruefen: `https://iptv-mat-backend-v6-6.onrender.com/health`.
