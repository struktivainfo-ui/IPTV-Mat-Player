# IPTV Mat Fullstack v6.6 Profiles and Diagnostics

Gepruefte Fullstack-Version mit:
- sauberem Frontend-Refactor
- Quellprofilen fuer Xtream und M3U
- Stream-Diagnose fuer den Player
- Backend-Proxy fuer Xtream und M3U

## Frontend
- Hosting: Vercel
- Root: `frontend`
- Build: `npm run build`
- Output: `dist`
- lokale Datei:
  - `frontend/.env` nur lokal benutzen, nicht zu GitHub pushen
- Env in Vercel:
  - `VITE_BACKEND_URL=https://DEIN-RENDER-BACKEND.onrender.com`

## Backend
- Hosting: Render
- Root: `backend`
- Start: `npm start`
- Healthcheck: `/api/health`

## Render
- Render Blueprint im Projektwurzelordner:
  - [render.yaml](</C:/Users/matzk/OneDrive/Desktop/salon-karola-v7-2-render-menu-fix/zip-audit-v6.4/render.yaml>)

## Deployment-Reihenfolge
1. Backend auf Render deployen
2. Render-URL kopieren
3. `VITE_BACKEND_URL` in Vercel setzen
4. Frontend in Vercel neu deployen

## GitHub-Struktur
- `frontend/` fuer die Vercel-App
- `backend/` fuer den Render-Service
- `render.yaml` im Projektwurzelordner fuer Render Blueprint
- `.gitignore` blendet `node_modules`, `dist` und lokale `.env` Dateien aus
