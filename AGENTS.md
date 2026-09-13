# Scramjet Demo — Base44 Dev Environment

## What this is
A Node.js web proxy demo (Scramjet) built with Fastify. Serves static files from `public/` and a Wisp WebSocket server on the `/wisp/` upgrade path. No database, no external services, no secrets required.

## Running
```
docker compose -f docker-compose.base44.yml up -d
```
- App listens on port 3000 (set via `PORT` env var in compose).
- Uses `node:20-bookworm` base image with source bind-mounted at `/app`.
- Build tools (python3, make, g++) are installed at container start for native deps (`@mercuryworkshop/libcurl-transport`).
- `node --watch src/index.js` provides live reload on source changes.
- `node_modules` is persisted in a named volume so `npm install` is fast on restarts.

## Key details
- The app sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers (required for SharedArrayBuffer used by the proxy).
- The scramjet package is installed from a GitHub release URL, not npm — first install may be slow.
- Static assets in `public/` are served directly; editing them doesn't require a server restart.
- Only `src/index.js` contains server logic; `public/index.js` is the client-side app.
