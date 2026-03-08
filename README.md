# SNAPSHOT Monorepo

Multiplayer Three.js client + authoritative Node/Socket.io server in an npm workspace monorepo.

## Repo Layout

- `packages/client`: Vite + React + Three.js frontend.
- `packages/server`: Node.js authoritative game server (Socket.io).
- `packages/shared`: Shared protocol/simulation/types used by client and server.

## MagicBlock ER Status

The current MagicBlock integration is focused on the `1v1` duel grant/demo flow.

- Real-time movement, aiming, shooting, and hit replication still run through the existing P2P gameplay path.
- On match start, the host bootstraps the duel authority PDAs on Solana L1 and delegates them to MagicBlock ER.
- During the match, the live duel remains playable without repeated wallet prompts.
- On match end, the host signs the final authority transaction to commit the result back to Solana and undelegate the ER accounts.

Today, MagicBlock is being used as the delegated match authority layer for the duel flow: match state bootstrap, ER delegation, and final commit/undelegate back to Solana.

## Next Phase

The next stage of the team is migrating the authority path from this hybrid model to fully realtime onchain execution.

- Move more match state updates from local/P2P authority into MagicBlock ER during live gameplay.
- Replace end-of-match-only settlement with continuous realtime authority writes.
- Expand from delegated duel state into broader onchain gameplay authority, with the long-term goal of moving the full competitive loop onchain in realtime.

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
