# SNAPSHOT Monorepo

Multiplayer Three.js client + authoritative Node/Socket.io server in an npm workspace monorepo.

## Repo Layout

- `packages/client`: Vite + React + Three.js frontend.
- `packages/server`: Node.js authoritative game server (Socket.io).
- `packages/shared`: Shared protocol/simulation/types used by client and server.

## Local Development

Install dependencies from repo root:

```bash
npm ci
```

Run both services for development:

```bash
npm run dev:all
```

Run only client:

```bash
npm run dev
```

Run only server:

```bash
npm run dev:server
```

## Production Build

Build for Render deployment:

```bash
npm run build:render
```

Start the production server (from repo root):

```bash
npm start
```

The server binds to `0.0.0.0` and uses `PORT` (default `10000`).

## Client/Server Connection

- Production default: same-origin Socket.io connection (no hardcoded host).
- Optional override: set `VITE_SERVER_URL` (for split frontend/backend deployments).
- Optional dev override: set `VITE_SERVER_PORT` (defaults to `10000` in dev only).

## Render Deployment

Use a single Render Web Service from repo root:

```bash
Build Command: npm ci && npm run build:render
Start Command: npm start
```

Set health check path to `/health`.

For full details, env vars, and two-service alternative, see `RENDER_DEPLOY.md`.

## Domain Setup

1. Open your Render service.
2. Go to `Settings` -> `Custom Domains`.
3. Add domain/subdomain and copy the DNS records Render provides.
4. Create those DNS records at your DNS provider.
5. Wait for Render verification and SSL certificate issuance.
