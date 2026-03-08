# SNAP

SNAP is a deterministic match authority runtime for Snapshot.

It provides:
- A universal state/action model (`SnapState`, `SnapAction`, `SnapManifest`)
- A local deterministic engine + event log + state hash
- Pluggable modules (scoring, mutation, registry, stake, settlement, provenance, burn)
- Pluggable rulesets (game logic)
- Client adapters:
  - `createLocalSnapClient(...)`
  - `createMagicBlockSnapClient(...)`

## Layout

`src/engine/`
- Engine runtime and hashing

`src/modules/`
- Generic modules (no game-specific naming)

`src/rulesets/`
- `snapshot-hardpoint`
- `ctf-2d` (minimal portability ruleset)

`src/adapters/`
- Local and MagicBlock SnapClient adapters

## Core Concepts

`SnapManifest`
- Declares game/ruleset and module config/toggles

`SnapAction`
- Envelope for deterministic actions:
  - `matchId`, `actor`, `t`, `kind`, `payload`, optional `sig`

`SnapState`
- Engine state:
  - phase/seq/hash/ruleVars/modules/custom
- Ruleset-specific fields live in `state.custom.<namespace>`

## Modules

Builtin module factories are exported from `src/modules/index.ts`:
- `stake`
- `registry`
- `scoring`
- `mutation`
- `burn`
- `settlement`
- `provenance`

Typical usage:
- Rulesets write counters via scoring (`SCORE_ADD`)
- Rulesets apply timed modifiers via mutation (`MODIFIER_START` / `MODIFIER_END`)

## Rulesets

### `snapshot-hardpoint`
- Zone countdown/active rotation
- Presence ownership/contested state
- Signal scoring while owned and uncontested
- Drop extraction -> mutation modifier flow

### `ctf-2d`
- `state.custom.ctf2d = { scoresByTeam, flagHeldBy?, timer }`
- Handles `FLAG_PICKUP`, `FLAG_CAPTURE`, `TICK`
- On capture, writes `ctf_score` via scoring module

## Run Sims

From repo root:

```bash
npm run sim --workspace=@snapshot/snap
```

This runs both rulesets and prints deterministic state snapshots and hashes.

## Client Adapters

### Local

```ts
import { createLocalSnapClient } from '@snapshot/snap';

const client = createLocalSnapClient(manifest);
await client.dispatch(action);
const state = await client.getState();
const stop = client.subscribe((s) => console.log(s.seq, s.stateHash));
```

### MagicBlock

```ts
import { createMagicBlockSnapClient } from '@snapshot/snap';

const client = createMagicBlockSnapClient({
  backend: 'magicblock',
  programId: '<PROGRAM_ID>',
  signer, // web3 signer adapter
  magicblockRpcUrl: 'http://127.0.0.1:8899',
  solanaRpcUrl: 'https://api.devnet.solana.com',
});
```

Notes:
- Adapter is transport/execution only.
- Rules logic stays in rulesets/modules, not in adapter code.
