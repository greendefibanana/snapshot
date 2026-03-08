# Snapshot MagicBlock Adapter

This folder documents local MagicBlock setup and the adapter wiring added in `@snapshot/snap`.

The repo now includes a live Anchor + MagicBlock ER authority path for the private `duel_er` room mode. For the devnet deployment flow, see:

- `docs/MAGICBLOCK_DUEL_ER_DEVNET.md`

## Local Validator

Per MagicBlock docs:

1. Install latest toolchain:
   - `curl https://sh.rustup.rs -sSf | sh`
   - `cargo install magicblock-cli --locked`
2. Start local validator:
   - `mb-test-validator --reset`
3. Optional ephemeral validator flow:
   - `magicblock ephemeral-validator --ledger ./.mb-ledger --rpc-port 8899 --faucet-port 9900 --gossip-port 10001 --dynamic-port-range 10002-10012`

Docs:
- https://docs.magicblock.gg/pages/get-started/install
- https://docs.magicblock.gg/pages/get-started/local-development

## Env Flags

Client wiring reads:

- `SNAP_AUTHORITY_BACKEND=local|magicblock`
- `MAGICBLOCK_RPC_URL=...`
- `SOLANA_RPC_URL=...`

For Vite client runtime, set these in `packages/client/.env` (or root `.env` if already loaded by your setup), for example:

```bash
SNAP_AUTHORITY_BACKEND=local
SOLANA_RPC_URL=https://api.devnet.solana.com
MAGICBLOCK_RPC_URL=http://127.0.0.1:8899
```

## Current Scope

- Anchor program-backed authority state for delegated MagicBlock ER sessions
- Solana L1 bootstrap + delegation for authority accounts
- MagicBlock ER live score mirroring
- checkpoint / finalize support for settlement back to Solana

## Delegation Flow Scripts

The repo root now includes MagicBlock flow tasks for `snap_authority`:

- `npm run snap:mb:local`
- `npm run snap:mb:doctor`
- `npm run snap:mb:delegate`
- `npm run snap:mb:run`
- `npm run snap:mb:commit`
- `npm run snap:mb:undelegate`
