import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import type { SnapAction, SnapState } from '../../engine/types.js';
import type { SnapClient } from '../snapClient.js';
import type {
  SnapAuthorityBackend,
  SnapAuthorityBridgeConfig,
  SnapAuthorityChainState,
  SnapAuthorityRpcConfig,
  SnapAuthorityTxResult,
  SnapSendTransactionOptions,
} from './types.js';

const DEFAULT_SOLANA_RPC_URL = 'https://api.devnet.solana.com';
const DEFAULT_MAGICBLOCK_RPC_URL = 'http://127.0.0.1:8899';
const DEFAULT_MATCH_SEED_HEX = '0708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20212223242526';
const APPLY_EVENT_TAG = 1;
const UTF8 = new TextEncoder();
const ZONE_PHASE_COUNTDOWN = 0;
const ZONE_PHASE_ACTIVE = 1;

type EncodedEvent =
  | { type: 'tick'; dtSec: number }
  | { type: 'signal_add'; teamId: number; amount: number }
  | { type: 'zone_set'; index: number; phase: number; remainingSec: number }
  | { type: 'drop_buff_granted'; teamId: number; dropId: string; buffKey?: string; endsAt?: number }
  | {
    type: 'drop_state_set';
    dropId: string;
    state: number;
    zone: number;
    eligibleTeam: number;
    extractingTeam: number;
    extractProgressMs: number;
    extractTargetMs: number;
    expiresAt?: number;
  }
  | { type: 'powerup_burn_use'; teamId: number; buffKey?: string; burnNonce?: number }
  | { type: 'loadout_selected'; slot: number };

function parseMatchSeedHex(value: string): Uint8Array {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('matchSeedHex must be exactly 32 bytes in hex');
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    const offset = i * 2;
    out[i] = Number.parseInt(normalized.slice(offset, offset + 2), 16);
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  const maybeBtoa = (globalThis as { btoa?: (input: string) => string }).btoa;
  if (typeof maybeBtoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return maybeBtoa(binary);
  }
  const maybeBuffer = (globalThis as { Buffer?: { from: (src: Uint8Array) => { toString: (enc: string) => string } } }).Buffer;
  if (maybeBuffer?.from) return maybeBuffer.from(bytes).toString('base64');
  throw new Error('No base64 encoder available in current runtime');
}

function fromBase64(encoded: string): Uint8Array {
  const normalized = encoded.trim();
  if (!normalized) throw new Error('base64Transaction is required');
  const maybeAtob = (globalThis as { atob?: (input: string) => string }).atob;
  if (typeof maybeAtob === 'function') {
    const binary = maybeAtob(normalized);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  const maybeBuffer = (globalThis as { Buffer?: { from: (src: string, enc: string) => Uint8Array } }).Buffer;
  if (maybeBuffer?.from) return maybeBuffer.from(normalized, 'base64');
  throw new Error('No base64 decoder available in current runtime');
}

function writeU16(out: Uint8Array, offset: number, value: number): number {
  const safe = value & 0xffff;
  out[offset] = safe & 0xff;
  out[offset + 1] = (safe >> 8) & 0xff;
  return offset + 2;
}

function writeU32(out: Uint8Array, offset: number, value: number): number {
  const safe = value >>> 0;
  out[offset] = safe & 0xff;
  out[offset + 1] = (safe >>> 8) & 0xff;
  out[offset + 2] = (safe >>> 16) & 0xff;
  out[offset + 3] = (safe >>> 24) & 0xff;
  return offset + 4;
}

function writeU64(out: Uint8Array, offset: number, value: bigint): number {
  let v = value;
  for (let i = 0; i < 8; i++) {
    out[offset + i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return offset + 8;
}

function encodeHeader(matchSeed: Uint8Array, payloadLength: number): Uint8Array {
  const out = new Uint8Array(1 + 32 + payloadLength);
  out[0] = APPLY_EVENT_TAG;
  out.set(matchSeed, 1);
  return out;
}

function encodeTickSeconds(matchSeed: Uint8Array, dtSec: number): Uint8Array {
  const out = encodeHeader(matchSeed, 1 + 2);
  let o = 33;
  out[o++] = 0;
  writeU16(out, o, Math.max(0, Math.round(dtSec)));
  return out;
}

function encodeSignalAdd(matchSeed: Uint8Array, teamId: number, amount: number): Uint8Array {
  const out = encodeHeader(matchSeed, 1 + 1 + 1);
  let o = 33;
  out[o++] = 1;
  out[o++] = teamId & 0xff;
  out[o] = amount & 0xff;
  return out;
}

function encodeZoneSet(matchSeed: Uint8Array, index: number, phase: number, remainingSec: number): Uint8Array {
  const out = encodeHeader(matchSeed, 1 + 1 + 1 + 2);
  let o = 33;
  out[o++] = 2;
  out[o++] = index & 0xff;
  out[o++] = phase & 0xff;
  writeU16(out, o, Math.max(0, Math.round(remainingSec)));
  return out;
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function resolveBuffKey(buffKey: string | undefined): number {
  if (!buffKey) return 0;
  const normalized = buffKey.trim().toUpperCase();
  if (normalized === 'FORGE_LINK') return 1;
  if (normalized === 'SKY_EYE_RECON') return 2;
  if (normalized === 'NEURO_TOXIN_CLOUD') return 3;
  if (normalized === 'STAMPEDE_OVERDRIVE') return 4;
  if (normalized === 'SCRAP_MAGNET') return 5;
  return 0;
}

function encodeDropBuffGranted(
  matchSeed: Uint8Array,
  teamId: number,
  dropId: string,
  buffKey: string | undefined,
  endsAt?: number,
): Uint8Array {
  const out = encodeHeader(matchSeed, 1 + 1 + 4 + 1 + 8);
  let o = 33;
  out[o++] = 3;
  out[o++] = teamId & 0xff;
  o = writeU32(out, o, fnv1a32(dropId));
  out[o++] = resolveBuffKey(buffKey);
  const endsAtSec = Number.isFinite(endsAt) ? Math.max(0, Math.floor(Number(endsAt))) : 0;
  writeU64(out, o, BigInt(endsAtSec));
  return out;
}

function encodeLoadoutSelected(matchSeed: Uint8Array, slot: number): Uint8Array {
  const out = encodeHeader(matchSeed, 1 + 1);
  let o = 33;
  out[o++] = 4;
  out[o] = Math.max(0, Math.floor(slot)) & 0xff;
  return out;
}

function encodeDropStateSet(
  matchSeed: Uint8Array,
  dropId: string,
  state: number,
  zone: number,
  eligibleTeam: number,
  extractingTeam: number,
  extractProgressMs: number,
  extractTargetMs: number,
  expiresAt?: number,
): Uint8Array {
  const out = encodeHeader(matchSeed, 1 + 4 + 1 + 1 + 1 + 1 + 2 + 2 + 8);
  let o = 33;
  out[o++] = 5;
  o = writeU32(out, o, fnv1a32(dropId));
  out[o++] = state & 0xff;
  out[o++] = zone & 0xff;
  out[o++] = eligibleTeam & 0xff;
  out[o++] = extractingTeam & 0xff;
  o = writeU16(out, o, Math.max(0, Math.floor(extractProgressMs)));
  o = writeU16(out, o, Math.max(0, Math.floor(extractTargetMs)));
  const expiresAtSec = Number.isFinite(expiresAt) ? Math.max(0, Math.floor(Number(expiresAt))) : 0;
  writeU64(out, o, BigInt(expiresAtSec));
  return out;
}

function encodePowerupBurnUse(
  matchSeed: Uint8Array,
  teamId: number,
  buffKey: string | undefined,
  burnNonce?: number,
): Uint8Array {
  const out = encodeHeader(matchSeed, 1 + 1 + 1 + 8);
  let o = 33;
  out[o++] = 6;
  out[o++] = teamId & 0xff;
  out[o++] = resolveBuffKey(buffKey);
  const nonce = Number.isFinite(burnNonce) ? Math.max(0, Math.floor(Number(burnNonce))) : 0;
  writeU64(out, o, BigInt(nonce));
  return out;
}

function readU16(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8);
}

function readU32(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24);
}

function readU64(data: Uint8Array, offset: number): number {
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    v |= BigInt(data[offset + i]!) << BigInt(8 * i);
  }
  return Number(v);
}

function decodeMatchAuthorityAccount(data: Uint8Array): SnapAuthorityChainState {
  let o = 0;
  o += 1;
  o += 32;
  o += 32;
  o += 2;
  o += 2;
  const blue = readU16(data, o); o += 2;
  const red = readU16(data, o); o += 2;
  const zoneIndex = data[o++]!;
  const zonePhaseRaw = data[o++]!;
  const zoneRemainingSec = readU16(data, o); o += 2;
  const blueBuff = data[o++]!;
  const redBuff = data[o++]!;
  const blueEndsAt = readU64(data, o); o += 8;
  const redEndsAt = readU64(data, o); o += 8;
  const lastDropId = readU32(data, o); o += 4;
  const dropState = data[o++]!;
  const dropZone = data[o++]!;
  const dropEligibleTeam = data[o++]!;
  const dropExtractingTeam = data[o++]!;
  const dropExtractProgressMs = readU16(data, o); o += 2;
  const dropExtractTargetMs = readU16(data, o); o += 2;
  const dropExpiresAt = readU64(data, o); o += 8;
  const powerupBurnNonce = readU64(data, o); o += 8;
  const lastPowerupBurnTeam = data[o++]!;
  const lastPowerupBurnBuff = data[o++]!;
  const selectedLoadoutSlot = data[o++]!;
  const eventSeq = readU64(data, o); o += 8;
  const hashBytes = data.slice(o, o + 32); o += 32;
  const ended = data[o] === 1;
  const stateHashHex = [...hashBytes].map((n) => n.toString(16).padStart(2, '0')).join('');
  return {
    eventSeq,
    signal: { blue, red },
    zone: {
      index: zoneIndex,
      phase: zonePhaseRaw === ZONE_PHASE_ACTIVE ? 'ACTIVE' : 'COUNTDOWN',
      remainingSec: zoneRemainingSec,
    },
    activeDropBuff: { blue: blueBuff, red: redBuff },
    dropInfo: {
      lastDropId,
      blueEndsAt,
      redEndsAt,
      state: dropState,
      zone: dropZone,
      eligibleTeam: dropEligibleTeam,
      extractingTeam: dropExtractingTeam,
      extractProgressMs: dropExtractProgressMs,
      extractTargetMs: dropExtractTargetMs,
      expiresAt: dropExpiresAt,
    },
    powerupBurn: {
      nonce: powerupBurnNonce,
      team: lastPowerupBurnTeam,
      buff: lastPowerupBurnBuff,
    },
    selectedLoadoutSlot,
    stateHashHex,
    ended,
  };
}

function resolveTeamId(entityId: string): number | null {
  const normalized = entityId.trim().toLowerCase();
  if (normalized === 'blue' || normalized === 'teama' || normalized === '1') return 1;
  if (normalized === 'red' || normalized === 'teamb' || normalized === '2') return 2;
  return null;
}

function resolveDropState(raw: string): number {
  const v = raw.trim().toUpperCase();
  if (v === 'INCOMING') return 1;
  if (v === 'LANDED') return 2;
  if (v === 'EXTRACTING') return 3;
  if (v === 'EXTRACTED') return 4;
  if (v === 'EXPIRED') return 5;
  return 0;
}

function resolveZonePhase(phase: string): number | null {
  if (phase === 'COUNTDOWN') return ZONE_PHASE_COUNTDOWN;
  if (phase === 'ACTIVE') return ZONE_PHASE_ACTIVE;
  return null;
}

function actionToEvents(action: SnapAction): EncodedEvent[] {
  if (action.kind === 'TICK') {
    const payload = (action.payload ?? {}) as { dtSec?: number };
    const dtSec = Math.max(0, Number(payload.dtSec ?? 0));
    return [{ type: 'tick', dtSec }];
  }

  if (action.kind === 'SCORE_ADD') {
    const payload = (action.payload ?? {}) as { counter?: string; entityId?: string; delta?: number };
    if (String(payload.counter ?? '') !== 'signal') return [];
    const teamId = resolveTeamId(String(payload.entityId ?? ''));
    if (!teamId) return [];
    const amount = Math.max(0, Math.floor(Number(payload.delta ?? 0)));
    if (amount <= 0) return [];
    return [{ type: 'signal_add', teamId, amount }];
  }

  if (action.kind === 'ZONE_SET') {
    const payload = (action.payload ?? {}) as { index?: number; phase?: string; remainingSec?: number };
    const phase = resolveZonePhase(String(payload.phase ?? ''));
    if (phase === null) return [];
    return [{
      type: 'zone_set',
      index: Math.max(0, Math.floor(Number(payload.index ?? 0))),
      phase,
      remainingSec: Math.max(0, Math.floor(Number(payload.remainingSec ?? 0))),
    }];
  }

  if (action.kind === 'DROP_BUFF_GRANTED' || action.kind === 'DROP_EXTRACT_COMPLETE') {
    const payload = (action.payload ?? {}) as {
      teamId?: string;
      dropId?: string;
      buffKey?: string;
      endsAt?: number;
    };
    const teamId = resolveTeamId(String(payload.teamId ?? ''));
    const dropId = String(payload.dropId ?? '').trim();
    if (!teamId || !dropId) return [];
    return [{
      type: 'drop_buff_granted',
      teamId,
      dropId,
      ...(payload.buffKey ? { buffKey: payload.buffKey } : {}),
      ...(Number.isFinite(payload.endsAt) ? { endsAt: Number(payload.endsAt) } : {}),
    }];
  }

  if (action.kind === 'DROP_STATE_SET' || action.kind === 'EXTRACTION_PROGRESS_SET') {
    const payload = (action.payload ?? {}) as {
      dropId?: string;
      state?: string;
      zone?: number;
      eligibleTeam?: string;
      extractingTeam?: string;
      extractProgressMs?: number;
      extractTargetMs?: number;
      expiresAt?: number;
    };
    const dropId = String(payload.dropId ?? '').trim();
    if (!dropId) return [];
    const eligibleTeam = payload.eligibleTeam ? (resolveTeamId(String(payload.eligibleTeam)) ?? 0) : 0;
    const extractingTeam = payload.extractingTeam ? (resolveTeamId(String(payload.extractingTeam)) ?? 0) : 0;
    return [{
      type: 'drop_state_set',
      dropId,
      state: resolveDropState(String(payload.state ?? 'INACTIVE')),
      zone: Math.max(0, Math.floor(Number(payload.zone ?? 0))),
      eligibleTeam,
      extractingTeam,
      extractProgressMs: Math.max(0, Math.floor(Number(payload.extractProgressMs ?? 0))),
      extractTargetMs: Math.max(0, Math.floor(Number(payload.extractTargetMs ?? 0))),
      ...(Number.isFinite(payload.expiresAt) ? { expiresAt: Number(payload.expiresAt) } : {}),
    }];
  }

  if (action.kind === 'POWERUP_BURN_USE') {
    const payload = (action.payload ?? {}) as {
      teamId?: string;
      buffKey?: string;
      burnNonce?: number;
    };
    const teamId = resolveTeamId(String(payload.teamId ?? ''));
    if (!teamId) return [];
    return [{
      type: 'powerup_burn_use',
      teamId,
      ...(payload.buffKey ? { buffKey: payload.buffKey } : {}),
      ...(Number.isFinite(payload.burnNonce) ? { burnNonce: Number(payload.burnNonce) } : {}),
    }];
  }

  if (action.kind === 'SELECT_LOADOUT' || action.kind === 'LOADOUT_SELECTED') {
    const payload = (action.payload ?? {}) as { slot?: number };
    return [{ type: 'loadout_selected', slot: Math.max(0, Math.floor(Number(payload.slot ?? 0))) }];
  }

  return [];
}

function eventToIxData(matchSeed: Uint8Array, event: EncodedEvent): Uint8Array {
  if (event.type === 'tick') return encodeTickSeconds(matchSeed, event.dtSec);
  if (event.type === 'signal_add') return encodeSignalAdd(matchSeed, event.teamId, event.amount);
  if (event.type === 'zone_set') return encodeZoneSet(matchSeed, event.index, event.phase, event.remainingSec);
  if (event.type === 'drop_buff_granted') {
    return encodeDropBuffGranted(matchSeed, event.teamId, event.dropId, event.buffKey, event.endsAt);
  }
  if (event.type === 'drop_state_set') {
    return encodeDropStateSet(
      matchSeed,
      event.dropId,
      event.state,
      event.zone,
      event.eligibleTeam,
      event.extractingTeam,
      event.extractProgressMs,
      event.extractTargetMs,
      event.expiresAt,
    );
  }
  if (event.type === 'powerup_burn_use') {
    return encodePowerupBurnUse(matchSeed, event.teamId, event.buffKey, event.burnNonce);
  }
  return encodeLoadoutSelected(matchSeed, event.slot);
}

function toSnapState(chain: SnapAuthorityChainState, matchId: string, matchPda: PublicKey, programId: PublicKey): SnapState {
  const phase = chain.ended ? 'POSTMATCH' : 'LIVE';
  return {
    matchId,
    phase,
    seq: chain.eventSeq,
    stateHash: chain.stateHashHex,
    ruleVars: {},
    modules: {
      scoring: {
        counters: {
          signal: {
            blue: chain.signal.blue,
            red: chain.signal.red,
          },
        },
      },
    },
    custom: {
      onchain: {
        programId: programId.toBase58(),
        matchAuthority: matchPda.toBase58(),
        zone: { ...chain.zone },
        activeDropBuff: { ...chain.activeDropBuff },
        dropInfo: { ...chain.dropInfo },
        powerupBurn: { ...chain.powerupBurn },
        selectedLoadoutSlot: chain.selectedLoadoutSlot,
        ended: chain.ended,
      },
    },
  };
}

export class MagicBlockSnapClientAdapter implements SnapClient {
  readonly backend: 'magicblock' = 'magicblock';
  private readonly authorityBackend: SnapAuthorityBackend;
  private readonly magicblockRpcUrl: string;
  private readonly solanaRpcUrl: string;
  private readonly programId: PublicKey;
  private readonly signer: SnapAuthorityBridgeConfig['signer'];
  private readonly matchSeed: Uint8Array;
  private readonly matchPda: PublicKey;
  private readonly pollHz: number;
  private readonly matchId: string;

  constructor(config: SnapAuthorityBridgeConfig) {
    this.authorityBackend = config.backend;
    this.magicblockRpcUrl = (config.magicblockRpcUrl ?? DEFAULT_MAGICBLOCK_RPC_URL).trim();
    this.solanaRpcUrl = (config.solanaRpcUrl ?? DEFAULT_SOLANA_RPC_URL).trim();
    this.programId = new PublicKey(config.programId);
    this.signer = config.signer;
    this.matchSeed = parseMatchSeedHex(config.matchSeedHex ?? DEFAULT_MATCH_SEED_HEX);
    this.pollHz = Math.max(5, Math.min(10, Math.floor(config.pollHz ?? 6)));
    this.matchPda = PublicKey.findProgramAddressSync(
      [UTF8.encode('match_authority'), this.matchSeed],
      this.programId,
    )[0];
    this.matchId = `mb:${this.matchPda.toBase58()}`;
  }

  private getRpcUrl(delegated = false): string {
    if (this.authorityBackend === 'magicblock' && delegated) return this.magicblockRpcUrl;
    return this.solanaRpcUrl;
  }

  private getConnection(delegated = false): Connection {
    return new Connection(this.getRpcUrl(delegated), 'confirmed');
  }

  private async signAndSend(ixData: Uint8Array, delegated = true): Promise<SnapAuthorityTxResult> {
    const connection = this.getConnection(delegated);
    const latest = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({
      feePayer: this.signer.publicKey,
      recentBlockhash: latest.blockhash,
    }).add(new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.signer.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.matchPda, isSigner: false, isWritable: true },
      ],
      data: ixData as any,
    }));
    const signed = await this.signer.signTransaction(tx);
    const raw = signed.serialize();
    const signature = await connection.sendRawTransaction(raw, { skipPreflight: false });
    await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
    return {
      backendUsed: delegated && this.authorityBackend === 'magicblock' ? 'magicblock' : 'local',
      rpcUrl: connection.rpcEndpoint,
      signature,
    };
  }

  async dispatch(action: SnapAction): Promise<void> {
    const events = actionToEvents(action);
    if (events.length === 0) return;
    const delegated = this.authorityBackend === 'magicblock';
    for (const event of events) {
      const ixData = eventToIxData(this.matchSeed, event);
      await this.signAndSend(ixData, delegated);
    }
  }

  private async fetchChainState(): Promise<SnapAuthorityChainState> {
    const connection = this.getConnection(this.authorityBackend === 'magicblock');
    const info = await connection.getAccountInfo(this.matchPda, 'confirmed');
    if (!info) {
      throw new Error(`MatchAuthority account not found: ${this.matchPda.toBase58()}`);
    }
    return decodeMatchAuthorityAccount(info.data);
  }

  async getState(): Promise<SnapState> {
    const chain = await this.fetchChainState();
    return toSnapState(chain, this.matchId, this.matchPda, this.programId);
  }

  subscribe(callback: (state: SnapState) => void): () => void {
    const pollMs = Math.max(100, Math.floor(1000 / this.pollHz));
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const state = await this.getState();
        callback(state);
      } catch {
        // Keep polling through transient RPC errors.
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, pollMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }

  async getSummary(): Promise<Record<string, unknown>> {
    const state = await this.getState();
    return {
      matchId: state.matchId,
      phase: state.phase,
      seq: state.seq,
      stateHash: state.stateHash,
    };
  }
}

export function createMagicBlockSnapClientAdapter(config: SnapAuthorityBridgeConfig): SnapClient {
  return new MagicBlockSnapClientAdapter(config);
}

export interface MagicBlockAuthorityClientAdapter {
  getRpcUrl(delegated?: boolean): string;
  sendRawTransaction(base64Transaction: string, options?: SnapSendTransactionOptions): Promise<SnapAuthorityTxResult>;
}

export class LegacyMagicBlockAuthorityClientAdapter implements MagicBlockAuthorityClientAdapter {
  private readonly backend: SnapAuthorityBackend;
  private readonly magicblockRpcUrl: string;
  private readonly solanaRpcUrl: string;

  constructor(config: SnapAuthorityRpcConfig) {
    this.backend = config.backend;
    this.magicblockRpcUrl = (config.magicblockRpcUrl ?? DEFAULT_MAGICBLOCK_RPC_URL).trim() || DEFAULT_MAGICBLOCK_RPC_URL;
    this.solanaRpcUrl = (config.solanaRpcUrl ?? DEFAULT_SOLANA_RPC_URL).trim() || DEFAULT_SOLANA_RPC_URL;
  }

  getRpcUrl(delegated = false): string {
    if (this.backend === 'magicblock' && delegated) return this.magicblockRpcUrl;
    return this.solanaRpcUrl;
  }

  async sendRawTransaction(
    base64Transaction: string,
    options: SnapSendTransactionOptions = {},
  ): Promise<SnapAuthorityTxResult> {
    const delegated = Boolean(options.delegated);
    const connection = new Connection(this.getRpcUrl(delegated), 'confirmed');
    const signature = await connection.sendRawTransaction(fromBase64(base64Transaction), {
      skipPreflight: options.skipPreflight,
      maxRetries: options.maxRetries,
      minContextSlot: options.minContextSlot,
      preflightCommitment: options.preflightCommitment,
    });
    return {
      backendUsed: delegated && this.backend === 'magicblock' ? 'magicblock' : 'local',
      rpcUrl: connection.rpcEndpoint,
      signature,
    };
  }
}

export function createMagicBlockAuthorityClientAdapter(
  config: SnapAuthorityRpcConfig,
): MagicBlockAuthorityClientAdapter {
  return new LegacyMagicBlockAuthorityClientAdapter(config);
}
