# Render Deployment Guide

This repo is an npm workspace monorepo. Default deployment mode is a single Render Web Service that serves:

- Socket.io game backend
- built frontend static assets

## Preferred Mode: Single Render Web Service

Create one **Web Service** on Render with:

- Root Directory: *(leave empty; repo root)*
- Environment: `Node`
- Build Command:
  ```bash
  npm ci && npm run build:render
  ```
- Start Command:
  ```bash
  npm start
  ```

### Required/Recommended Environment Variables

- `NODE_VERSION=20`
- `PORT` is provided by Render (server defaults to `10000` if absent).
- `SOLANA_RPC_URL` (optional, defaults to devnet in current server code).
- `WAGER_PROGRAM_ID` (optional; required only for wager settlement flows).
- `WAGER_AUTHORITY_SECRET_KEY` (optional; required only for wager settlement flows).
- `WAGER_FEE_WALLET` (optional; required only for wager settlement flows).

Do **not** set `VITE_SERVER_URL` for single-service mode.

### Health Check

The server exposes:

- `GET /health` -> `200` with JSON body.

Set Render health check path to `/health`.

## Optional Mode: Two Render Services

If you want split hosting:

1. Web Service for backend (same commands as above, but you may skip client build).
2. Static Site for client:
   - Root Directory: `packages/client`
   - Build Command:
     ```bash
     npm ci && npm run build --workspace=@snapshot/shared && npm run build:deploy --workspace=@snapshot/client
     ```
   - Publish Directory: `dist`
   - Environment Variable: `VITE_SERVER_URL=https://<your-backend>.onrender.com`

## Custom Domain Setup (Render)

1. In Render dashboard, open your service.
2. Go to `Settings` -> `Custom Domains`.
3. Add your domain/subdomain (for example `play.example.com`).
4. Create the DNS records Render shows (usually `CNAME` for subdomain).
5. Wait for verification and SSL issuance.
6. If using two-service mode, point frontend domain to Static Site and keep backend on its own domain; set `VITE_SERVER_URL` accordingly.
