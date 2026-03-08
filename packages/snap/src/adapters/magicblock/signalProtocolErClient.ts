import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type AccountMeta,
} from '@solana/web3.js';
import type { SnapAction } from '../../engine/types.js';

export type SignalProtocolMethod =
  | 'create_match'
  | 'init_zone_rotation'
  | 'init_drop_state'
  | 'init_player_inventory'
  | 'init_activation'
  | 'delegate_match_accounts'
  | 'confirm_loadout_and_start'
  | 'start_zone_countdown'
  | 'activate_zone'
  | 'set_zone_owner'
  | 'set_zone_contested'
  | 'checkpoint_signal_score'
  | 'spawn_drop'
  | 'begin_drop_extract'
  | 'stall_drop_extract'
  | 'reset_drop_extract'
  | 'claim_drop_key'
  | 'burn_and_activate_key'
  | 'trigger_sudden_death_warning'
  | 'activate_collapse'
  | 'checkpoint_collapse_state'
  | 'commit_match_checkpoint'
  | 'commit_and_finalize_match';

export type RewardKey = 'FORGE_LINK' | 'SKY_EYE_RECON' | 'NEURO_TOXIN_CLOUD' | 'STAMPEDE_OVERDRIVE' | 'SCRAP_MAGNET';

export interface WalletLikeSigner {
  publicKey: PublicKey;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
}

export interface SignalProtocolRouterConfig {
  programId: PublicKey;
  signer: WalletLikeSigner;
  l1Connection: Connection;
  erConnection: Connection;
  magicRouterUrl?: string;
  matchSeed: Uint8Array;
  matchStatePda?: PublicKey;
  zoneRotationStatePda?: PublicKey;
  dropStatePda?: PublicKey;
  playerInventoryStatePda?: PublicKey;
  activationStatePda?: PublicKey;
  magicProgram?: PublicKey;
  magicContext?: PublicKey;
}

export interface SignalProtocolDelegationAccounts {
  ownerProgram: PublicKey;
  delegationProgram: PublicKey;
  validator: PublicKey;
  matchBuffer: PublicKey;
  matchRecord: PublicKey;
  matchMetadata: PublicKey;
  zoneBuffer: PublicKey;
  zoneRecord: PublicKey;
  zoneMetadata: PublicKey;
  dropBuffer: PublicKey;
  dropRecord: PublicKey;
  dropMetadata: PublicKey;
  inventoryBuffer: PublicKey;
  inventoryRecord: PublicKey;
  inventoryMetadata: PublicKey;
  activationBuffer: PublicKey;
  activationRecord: PublicKey;
  activationMetadata: PublicKey;
}

export interface RouterSendResult {
  signature: string;
  backendUsed: 'magic_router' | 'direct_er';
}

export interface SignalProtocolL1SendResult {
  signature: string;
  backendUsed: 'solana_l1';
}

interface ResolvedDelegationAccount {
  pubkey: PublicKey;
  exists: boolean;
  source: 'derived-existing' | 'derived-canonical';
}

export interface ResolvedSignalProtocolDelegationAccounts {
  accounts: SignalProtocolDelegationAccounts;
  alreadyDelegated: boolean;
}

async function enrichTransactionError(connection: Connection, error: unknown): Promise<Error> {
  const originalMessage = error instanceof Error ? error.message : String(error ?? 'Unknown transaction error');
  let logs: string[] = [];
  try {
    const maybeLogs = typeof (error as any)?.getLogs === 'function'
      ? await (error as any).getLogs(connection)
      : (Array.isArray((error as any)?.logs) ? (error as any).logs : []);
    if (Array.isArray(maybeLogs)) {
      logs = maybeLogs.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    }
  } catch {
    // Fall through with the original error message.
  }
  if (logs.length === 0) {
    return error instanceof Error ? error : new Error(originalMessage);
  }
  const detail = `${originalMessage}\nLogs:\n${logs.join('\n')}`;
  const enriched = new Error(detail);
  (enriched as any).cause = error;
  (enriched as any).logs = logs;
  return enriched;
}

const TEAM_BLUE = 1;
const TEAM_RED = 2;

const DISCRIMINATOR_HEX: Record<SignalProtocolMethod, string> = {
  create_match: '6b02b891468e11a5',
  init_zone_rotation: 'b16e3f874839393b',
  init_drop_state: '01d7cbc9208643fb',
  init_player_inventory: '35b4e4ba815ee7a8',
  init_activation: '28d89bb42ab7db8a',
  delegate_match_accounts: '08d1781bea418913',
  confirm_loadout_and_start: '6f2e5711e9dc139d',
  start_zone_countdown: 'bedc3098de549e4e',
  activate_zone: '994d015da077401a',
  set_zone_owner: '8b4642078c655eac',
  set_zone_contested: '4ed1f701d559065e',
  checkpoint_signal_score: 'ff5d84e77477c4f6',
  spawn_drop: '1517a8e704fa8dc5',
  begin_drop_extract: 'a534eb358bc05b43',
  stall_drop_extract: '061a6bb99820f7b1',
  reset_drop_extract: '652e884280eb07bc',
  claim_drop_key: '938b71516eefac8b',
  burn_and_activate_key: '7612c85861b0a3d6',
  trigger_sudden_death_warning: '655ccfe58fbc1f34',
  activate_collapse: '3a4c13c5537feebf',
  checkpoint_collapse_state: 'be095ff1bf0a947b',
  commit_match_checkpoint: '9e72368391e6d814',
  commit_and_finalize_match: '22a15f045626b9fc',
};

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, (i * 2) + 2), 16);
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function fromBase64(encoded: string): Uint8Array {
  return Uint8Array.from(Buffer.from(encoded, 'base64'));
}

function dedupePubkeys(pubkeys: PublicKey[]): PublicKey[] {
  const seen = new Set<string>();
  const out: PublicKey[] = [];
  for (const pubkey of pubkeys) {
    const key = pubkey.toBase58();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pubkey);
  }
  return out;
}

async function resolveDelegationAccount(
  connection: Connection,
  pubkey: PublicKey,
): Promise<ResolvedDelegationAccount> {
  const info = await connection.getAccountInfo(pubkey, 'confirmed');
  return {
    pubkey,
    exists: Boolean(info),
    source: info ? 'derived-existing' : 'derived-canonical',
  };
}

function writeU8(buf: number[], v: number): void { buf.push(v & 0xff); }
function writeBool(buf: number[], v: boolean): void { buf.push(v ? 1 : 0); }
function writeU16(buf: number[], v: number): void { buf.push(v & 0xff, (v >>> 8) & 0xff); }
function writeU32(buf: number[], v: number): void {
  buf.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}
function writeU64(buf: number[], v: bigint): void {
  let n = v;
  for (let i = 0; i < 8; i++) {
    buf.push(Number(n & 0xffn));
    n >>= 8n;
  }
}
function writeI64(buf: number[], v: number): void {
  writeU64(buf, BigInt(v));
}
function readU16(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8);
}
function readU32(data: Uint8Array, offset: number): number {
  return data[offset]!
    | (data[offset + 1]! << 8)
    | (data[offset + 2]! << 16)
    | (data[offset + 3]! << 24);
}
function readU64(data: Uint8Array, offset: number): number {
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    v |= BigInt(data[offset + i]!) << BigInt(8 * i);
  }
  return Number(v);
}
function writePk(buf: number[], pk: PublicKey): void {
  const bytes = pk.toBytes();
  for (let i = 0; i < bytes.length; i++) buf.push(bytes[i]!);
}
function rewardToU8(reward: RewardKey): number {
  if (reward === 'FORGE_LINK') return 1;
  if (reward === 'SKY_EYE_RECON') return 2;
  if (reward === 'NEURO_TOXIN_CLOUD') return 3;
  if (reward === 'STAMPEDE_OVERDRIVE') return 4;
  return 5;
}
function teamFromEntity(entity: string | undefined): number {
  const t = String(entity ?? '').trim().toLowerCase();
  if (t === 'blue' || t === '1' || t === 'teama') return TEAM_BLUE;
  if (t === 'red' || t === '2' || t === 'teamb') return TEAM_RED;
  return 0;
}
function buffFromKey(raw: string | undefined): RewardKey {
  const key = String(raw ?? '').trim().toUpperCase();
  if (key === 'SKY_EYE_RECON') return 'SKY_EYE_RECON';
  if (key === 'NEURO_TOXIN_CLOUD') return 'NEURO_TOXIN_CLOUD';
  if (key === 'STAMPEDE_OVERDRIVE') return 'STAMPEDE_OVERDRIVE';
  if (key === 'SCRAP_MAGNET') return 'SCRAP_MAGNET';
  return 'FORGE_LINK';
}
export class SignalProtocolErClient {
  private readonly config: SignalProtocolRouterConfig;
  private readonly matchStatePda: PublicKey;
  private readonly zoneRotationStatePda: PublicKey;
  private readonly dropStatePda: PublicKey;
  private readonly playerInventoryStatePda: PublicKey;
  private readonly activationStatePda: PublicKey;
  private mirrorScoreBlue = 0;
  private mirrorScoreRed = 0;
  private readonly canCommitToL1: boolean;
  private initialized = false;
  private initializationPromise: Promise<SignalProtocolL1SendResult | null> | null = null;

  constructor(config: SignalProtocolRouterConfig) {
    this.config = config;
    this.matchStatePda = config.matchStatePda ?? PublicKey.findProgramAddressSync(
      [Buffer.from('match_state'), Buffer.from(config.matchSeed)],
      config.programId,
    )[0];
    this.zoneRotationStatePda = config.zoneRotationStatePda ?? PublicKey.findProgramAddressSync(
      [Buffer.from('zone_rotation_state'), Buffer.from(config.matchSeed)],
      config.programId,
    )[0];
    this.dropStatePda = config.dropStatePda ?? PublicKey.findProgramAddressSync(
      [Buffer.from('drop_state'), Buffer.from(config.matchSeed)],
      config.programId,
    )[0];
    this.playerInventoryStatePda = config.playerInventoryStatePda ?? PublicKey.findProgramAddressSync(
      [Buffer.from('player_inventory_state'), Buffer.from(config.matchSeed), config.signer.publicKey.toBuffer()],
      config.programId,
    )[0];
    this.activationStatePda = config.activationStatePda ?? PublicKey.findProgramAddressSync(
      [Buffer.from('activation_state'), Buffer.from(config.matchSeed)],
      config.programId,
    )[0];
    this.canCommitToL1 = Boolean(config.magicProgram && config.magicContext);
  }

  getAuthorityMutateKeys(): AccountMeta[] {
    return [
      { pubkey: this.config.signer.publicKey, isSigner: true, isWritable: false },
      { pubkey: this.matchStatePda, isSigner: false, isWritable: true },
      { pubkey: this.zoneRotationStatePda, isSigner: false, isWritable: true },
      { pubkey: this.dropStatePda, isSigner: false, isWritable: true },
      { pubkey: this.playerInventoryStatePda, isSigner: false, isWritable: true },
      { pubkey: this.activationStatePda, isSigner: false, isWritable: true },
    ];
  }

  getCreateMatchKeys(): AccountMeta[] {
    return [
      { pubkey: this.config.signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: this.matchStatePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
  }

  getInitZoneRotationKeys(): AccountMeta[] {
    return [
      { pubkey: this.config.signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: this.matchStatePda, isSigner: false, isWritable: false },
      { pubkey: this.zoneRotationStatePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
  }

  getInitDropStateKeys(): AccountMeta[] {
    return [
      { pubkey: this.config.signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: this.matchStatePda, isSigner: false, isWritable: false },
      { pubkey: this.dropStatePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
  }

  getInitPlayerInventoryKeys(): AccountMeta[] {
    return [
      { pubkey: this.config.signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: this.matchStatePda, isSigner: false, isWritable: false },
      { pubkey: this.playerInventoryStatePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
  }

  getInitActivationKeys(): AccountMeta[] {
    return [
      { pubkey: this.config.signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: this.matchStatePda, isSigner: false, isWritable: false },
      { pubkey: this.activationStatePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
  }

  getCommitKeys(): AccountMeta[] {
    const magicProgram = this.config.magicProgram ?? PublicKey.default;
    const magicContext = this.config.magicContext ?? PublicKey.default;
    return [
      ...this.getAuthorityMutateKeys(),
      { pubkey: magicProgram, isSigner: false, isWritable: false },
      { pubkey: magicContext, isSigner: false, isWritable: true },
    ];
  }

  getDelegateMatchAccountsKeys(accounts: SignalProtocolDelegationAccounts): AccountMeta[] {
    return [
      { pubkey: this.config.signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: this.matchStatePda, isSigner: false, isWritable: true },
      { pubkey: this.zoneRotationStatePda, isSigner: false, isWritable: true },
      { pubkey: this.dropStatePda, isSigner: false, isWritable: true },
      { pubkey: this.playerInventoryStatePda, isSigner: false, isWritable: true },
      { pubkey: this.activationStatePda, isSigner: false, isWritable: true },
      { pubkey: accounts.ownerProgram, isSigner: false, isWritable: false },
      { pubkey: accounts.delegationProgram, isSigner: false, isWritable: false },
      { pubkey: accounts.matchBuffer, isSigner: false, isWritable: true },
      { pubkey: accounts.matchRecord, isSigner: false, isWritable: true },
      { pubkey: accounts.matchMetadata, isSigner: false, isWritable: true },
      { pubkey: accounts.zoneBuffer, isSigner: false, isWritable: true },
      { pubkey: accounts.zoneRecord, isSigner: false, isWritable: true },
      { pubkey: accounts.zoneMetadata, isSigner: false, isWritable: true },
      { pubkey: accounts.dropBuffer, isSigner: false, isWritable: true },
      { pubkey: accounts.dropRecord, isSigner: false, isWritable: true },
      { pubkey: accounts.dropMetadata, isSigner: false, isWritable: true },
      { pubkey: accounts.inventoryBuffer, isSigner: false, isWritable: true },
      { pubkey: accounts.inventoryRecord, isSigner: false, isWritable: true },
      { pubkey: accounts.inventoryMetadata, isSigner: false, isWritable: true },
      { pubkey: accounts.activationBuffer, isSigner: false, isWritable: true },
      { pubkey: accounts.activationRecord, isSigner: false, isWritable: true },
      { pubkey: accounts.activationMetadata, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
  }

  canCommit(): boolean {
    return this.canCommitToL1;
  }

  createCommitCheckpointInstruction(): TransactionInstruction | null {
    if (!this.canCommitToL1) return null;
    return this.buildInstruction('commit_match_checkpoint', this.getCommitKeys());
  }

  createCommitAndFinalizeInstruction(winnerTeam: number, blue: number, red: number, endedAt: number): TransactionInstruction | null {
    if (!this.canCommitToL1) return null;
    return this.buildInstruction(
      'commit_and_finalize_match',
      this.getCommitKeys(),
      this.encodeCommitAndFinalizeMatch(winnerTeam, blue, red, endedAt),
    );
  }

  buildInstruction(method: SignalProtocolMethod, keys: AccountMeta[], argsData: Uint8Array = new Uint8Array()): TransactionInstruction {
    const discriminator = fromHex(DISCRIMINATOR_HEX[method]);
    const data = new Uint8Array(discriminator.length + argsData.length);
    data.set(discriminator, 0);
    data.set(argsData, discriminator.length);
    return new TransactionInstruction({
      programId: this.config.programId,
      keys,
      data: Buffer.from(data),
    });
  }

  encodeConfirmLoadoutAndStart(slot: number): Uint8Array {
    return Uint8Array.from([Math.max(0, Math.min(255, Math.floor(slot)))]);
  }

  encodeCreateMatch(targetSignal: number = 500): Uint8Array {
    const buf: number[] = [];
    for (const byte of this.config.matchSeed) buf.push(byte);
    writeU16(buf, Math.max(1, Math.min(65535, Math.floor(targetSignal))));
    return Uint8Array.from(buf);
  }

  encodeInitZoneRotation(countdownSec: number = 30, activeSec: number = 60): Uint8Array {
    const buf: number[] = [];
    writeU16(buf, Math.max(1, Math.min(65535, Math.floor(countdownSec))));
    writeU16(buf, Math.max(1, Math.min(65535, Math.floor(activeSec))));
    return Uint8Array.from(buf);
  }

  encodeInitDropState(intervalSec: number = 30, incomingSec: number = 2, extractSec: number = 8, expireSec: number = 60): Uint8Array {
    const buf: number[] = [];
    writeU16(buf, Math.max(1, Math.min(65535, Math.floor(intervalSec))));
    writeU16(buf, Math.max(1, Math.min(65535, Math.floor(incomingSec))));
    writeU16(buf, Math.max(1, Math.min(65535, Math.floor(extractSec))));
    writeU16(buf, Math.max(1, Math.min(65535, Math.floor(expireSec))));
    return Uint8Array.from(buf);
  }

  encodeStartZoneCountdown(zoneIndex: number, phaseEndsAt: number): Uint8Array {
    const buf: number[] = [];
    writeU8(buf, zoneIndex);
    writeI64(buf, phaseEndsAt);
    return Uint8Array.from(buf);
  }

  encodeActivateZone(phaseEndsAt: number): Uint8Array {
    const buf: number[] = [];
    writeI64(buf, phaseEndsAt);
    return Uint8Array.from(buf);
  }

  encodeSetZoneOwner(ownerTeam: number): Uint8Array {
    return Uint8Array.from([ownerTeam & 0xff]);
  }

  encodeSetZoneContested(contested: boolean): Uint8Array {
    const buf: number[] = [];
    writeBool(buf, contested);
    return Uint8Array.from(buf);
  }

  encodeCheckpointSignalScore(blue: number, red: number, eventSeq: bigint): Uint8Array {
    const buf: number[] = [];
    writeU16(buf, blue);
    writeU16(buf, red);
    writeU64(buf, eventSeq);
    return Uint8Array.from(buf);
  }

  encodeSpawnDrop(args: {
    dropId: bigint;
    zoneIndex: number;
    eligibleTeam: number;
    rewardKey: RewardKey;
    incomingUntil: number;
    expiresAt: number;
  }): Uint8Array {
    const buf: number[] = [];
    writeU64(buf, args.dropId);
    writeU8(buf, args.zoneIndex);
    writeU8(buf, args.eligibleTeam);
    writeU8(buf, rewardToU8(args.rewardKey));
    writeI64(buf, args.incomingUntil);
    writeI64(buf, args.expiresAt);
    return Uint8Array.from(buf);
  }

  encodeBeginDropExtract(team: number, player: PublicKey, progressMs: number): Uint8Array {
    const buf: number[] = [];
    writeU8(buf, team);
    writePk(buf, player);
    writeU32(buf, progressMs);
    return Uint8Array.from(buf);
  }

  encodeStallDropExtract(stallTickSeq: bigint): Uint8Array {
    const buf: number[] = [];
    writeU64(buf, stallTickSeq);
    return Uint8Array.from(buf);
  }

  encodeClaimDropKey(team: number, rewardKey: RewardKey, player: PublicKey): Uint8Array {
    const buf: number[] = [];
    writeU8(buf, team);
    writeU8(buf, rewardToU8(rewardKey));
    writePk(buf, player);
    return Uint8Array.from(buf);
  }

  encodeBurnAndActivateKey(team: number, rewardKey: RewardKey, burnNonce: bigint, activatedUntil: number): Uint8Array {
    const buf: number[] = [];
    writeU8(buf, team);
    writeU8(buf, rewardToU8(rewardKey));
    writeU64(buf, burnNonce);
    writeI64(buf, activatedUntil);
    return Uint8Array.from(buf);
  }

  encodeTriggerSuddenDeathWarning(warningEndsAt: number): Uint8Array {
    const buf: number[] = [];
    writeI64(buf, warningEndsAt);
    return Uint8Array.from(buf);
  }

  encodeActivateCollapse(at: number, radius: number): Uint8Array {
    const buf: number[] = [];
    writeI64(buf, at);
    writeU16(buf, radius);
    return Uint8Array.from(buf);
  }

  encodeCheckpointCollapseState(radius: number, checkpointSeq: bigint): Uint8Array {
    const buf: number[] = [];
    writeU16(buf, radius);
    writeU64(buf, checkpointSeq);
    return Uint8Array.from(buf);
  }

  encodeCommitAndFinalizeMatch(winnerTeam: number, blue: number, red: number, endedAt: number): Uint8Array {
    const buf: number[] = [];
    writeU8(buf, winnerTeam);
    writeU16(buf, blue);
    writeU16(buf, red);
    writeI64(buf, endedAt);
    return Uint8Array.from(buf);
  }

  encodeDelegateMatchAccounts(validator: PublicKey): Uint8Array {
    return validator.toBytes();
  }

  createDelegateMatchAccountsInstruction(accounts: SignalProtocolDelegationAccounts): TransactionInstruction {
    return this.buildInstruction(
      'delegate_match_accounts',
      this.getDelegateMatchAccountsKeys(accounts),
      this.encodeDelegateMatchAccounts(accounts.validator),
    );
  }

  async sendErTransaction(ix: TransactionInstruction): Promise<RouterSendResult> {
    return this.sendRouted(ix);
  }

  async sendL1Transaction(ix: TransactionInstruction): Promise<SignalProtocolL1SendResult> {
    return this.sendL1Transactions([ix]);
  }

  async sendL1Transactions(ixs: TransactionInstruction[]): Promise<SignalProtocolL1SendResult> {
    if (ixs.length === 0) {
      throw new Error('No L1 instructions to send.');
    }
    const blockhash = await this.config.l1Connection.getLatestBlockhash('confirmed');
    let tx = new Transaction({
      feePayer: this.config.signer.publicKey,
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
    });
    for (const ix of ixs) {
      tx = tx.add(ix);
    }
    tx = await this.config.signer.signTransaction(tx);
    try {
      const signature = await this.config.l1Connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
      const confirmation = await this.config.l1Connection.confirmTransaction({
        signature,
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
      }, 'confirmed');
      if (confirmation.value.err) {
        throw new Error(`L1 transaction ${signature} failed confirmation: ${JSON.stringify(confirmation.value.err)}`);
      }
      return { signature, backendUsed: 'solana_l1' };
    } catch (error) {
      throw await enrichTransactionError(this.config.l1Connection, error);
    }
  }

  async resolveDelegationAccounts(params: {
    delegationProgram: PublicKey;
    validator: PublicKey;
    ownerProgram?: PublicKey;
  }): Promise<ResolvedSignalProtocolDelegationAccounts> {
    const ownerProgram = params.ownerProgram ?? this.config.programId;
    const primaryInfos = await this.config.l1Connection.getMultipleAccountsInfo([
      this.matchStatePda,
      this.zoneRotationStatePda,
      this.dropStatePda,
      this.playerInventoryStatePda,
      this.activationStatePda,
    ], 'confirmed');
    const resolveTriple = async (delegatedPda: PublicKey): Promise<{
      buffer: ResolvedDelegationAccount;
      record: ResolvedDelegationAccount;
      metadata: ResolvedDelegationAccount;
    }> => {
      const bufferPda = PublicKey.findProgramAddressSync(
        [Buffer.from('buffer'), delegatedPda.toBuffer()],
        ownerProgram,
      )[0];
      const recordPda = PublicKey.findProgramAddressSync(
        [Buffer.from('delegation'), delegatedPda.toBuffer()],
        params.delegationProgram,
      )[0];
      const metadataPda = PublicKey.findProgramAddressSync(
        [Buffer.from('delegation-metadata'), delegatedPda.toBuffer()],
        params.delegationProgram,
      )[0];
      const [buffer, record, metadata] = await Promise.all([
        resolveDelegationAccount(this.config.l1Connection, bufferPda),
        resolveDelegationAccount(this.config.l1Connection, recordPda),
        resolveDelegationAccount(this.config.l1Connection, metadataPda),
      ]);
      return { buffer, record, metadata };
    };

    const [match, zone, drop, inventory, activation] = await Promise.all([
      resolveTriple(this.matchStatePda),
      resolveTriple(this.zoneRotationStatePda),
      resolveTriple(this.dropStatePda),
      resolveTriple(this.playerInventoryStatePda),
      resolveTriple(this.activationStatePda),
    ]);

    const alreadyDelegated = [match, zone, drop, inventory, activation].every((entry) => (
      entry.buffer.exists && entry.record.exists && entry.metadata.exists
    )) || primaryInfos.every((info) => (
      Boolean(info) && Boolean(info?.owner?.equals(params.delegationProgram))
    ));

    return {
      accounts: {
        ownerProgram,
        delegationProgram: params.delegationProgram,
        validator: params.validator,
        matchBuffer: match.buffer.pubkey,
        matchRecord: match.record.pubkey,
        matchMetadata: match.metadata.pubkey,
        zoneBuffer: zone.buffer.pubkey,
        zoneRecord: zone.record.pubkey,
        zoneMetadata: zone.metadata.pubkey,
        dropBuffer: drop.buffer.pubkey,
        dropRecord: drop.record.pubkey,
        dropMetadata: drop.metadata.pubkey,
        inventoryBuffer: inventory.buffer.pubkey,
        inventoryRecord: inventory.record.pubkey,
        inventoryMetadata: inventory.metadata.pubkey,
        activationBuffer: activation.buffer.pubkey,
        activationRecord: activation.record.pubkey,
        activationMetadata: activation.metadata.pubkey,
      },
      alreadyDelegated,
    };
  }

  async delegateMatchAccounts(accounts: SignalProtocolDelegationAccounts): Promise<SignalProtocolL1SendResult> {
    const ix = this.createDelegateMatchAccountsInstruction(accounts);
    return this.sendL1Transaction(ix);
  }

  getPdas(): {
    matchState: PublicKey;
    zoneRotationState: PublicKey;
    dropState: PublicKey;
    playerInventoryState: PublicKey;
    activationState: PublicKey;
  } {
    return {
      matchState: this.matchStatePda,
      zoneRotationState: this.zoneRotationStatePda,
      dropState: this.dropStatePda,
      playerInventoryState: this.playerInventoryStatePda,
      activationState: this.activationStatePda,
    };
  }

  async sendRouted(ix: TransactionInstruction): Promise<RouterSendResult> {
    const blockhash = await this.config.erConnection.getLatestBlockhash('confirmed');
    let tx = new Transaction({
      feePayer: this.config.signer.publicKey,
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
    }).add(ix);
    tx = await this.config.signer.signTransaction(tx);
    const serialized = tx.serialize();

    if (this.config.magicRouterUrl) {
      try {
        const response = await fetch(this.config.magicRouterUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ txBase64: toBase64(serialized) }),
        });
        if (response.ok) {
          const payload = (await response.json()) as { signature?: string; txBase64?: string };
          if (typeof payload.signature === 'string' && payload.signature.length > 0) {
            const confirmation = await this.config.erConnection.confirmTransaction({
              signature: payload.signature,
              blockhash: blockhash.blockhash,
              lastValidBlockHeight: blockhash.lastValidBlockHeight,
            }, 'confirmed');
            if (confirmation.value.err) {
              throw new Error(`Magic router transaction ${payload.signature} failed confirmation: ${JSON.stringify(confirmation.value.err)}`);
            }
            return { signature: payload.signature, backendUsed: 'magic_router' };
          }
          if (typeof payload.txBase64 === 'string' && payload.txBase64.length > 0) {
            const sig = await this.config.erConnection.sendRawTransaction(fromBase64(payload.txBase64), { skipPreflight: false });
            const confirmation = await this.config.erConnection.confirmTransaction({
              signature: sig,
              blockhash: blockhash.blockhash,
              lastValidBlockHeight: blockhash.lastValidBlockHeight,
            }, 'confirmed');
            if (confirmation.value.err) {
              throw new Error(`Magic router forwarded transaction ${sig} failed confirmation: ${JSON.stringify(confirmation.value.err)}`);
            }
            return { signature: sig, backendUsed: 'magic_router' };
          }
        }
      } catch {
        // Router is optional; direct ER fallback below.
      }
    }

    try {
      const signature = await this.config.erConnection.sendRawTransaction(serialized, { skipPreflight: false });
      const confirmation = await this.config.erConnection.confirmTransaction({
        signature,
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
      }, 'confirmed');
      if (confirmation.value.err) {
        throw new Error(`ER transaction ${signature} failed confirmation: ${JSON.stringify(confirmation.value.err)}`);
      }
      return { signature, backendUsed: 'direct_er' };
    } catch (error) {
      throw await enrichTransactionError(this.config.erConnection, error);
    }
  }

  async ensureInitialized(options: { delegateAccounts?: SignalProtocolDelegationAccounts | null } = {}): Promise<SignalProtocolL1SendResult | null> {
    if (this.initialized && !options.delegateAccounts) return null;
    if (this.initializationPromise) {
      return await this.initializationPromise;
    }
    this.initializationPromise = this.bootstrapAccounts(options.delegateAccounts ?? null).then((result) => {
      this.initialized = true;
      return result;
    }).finally(() => {
      this.initializationPromise = null;
    });
    return await this.initializationPromise;
  }

  async mirrorAuthorityAction(action: SnapAction): Promise<boolean> {
    const nowSec = Math.floor(Date.now() / 1000);
    if (action.kind === 'SELECT_LOADOUT' || action.kind === 'LOADOUT_SELECTED') {
      const payload = (action.payload ?? {}) as { slot?: number };
      const ix = this.buildInstruction(
        'confirm_loadout_and_start',
        this.getAuthorityMutateKeys(),
        this.encodeConfirmLoadoutAndStart(Number(payload.slot ?? 0)),
      );
      await this.sendRouted(ix);
      return true;
    }

    if (action.kind === 'SCORE_ADD') {
      const payload = (action.payload ?? {}) as { counter?: string; entityId?: string; delta?: number };
      if (String(payload.counter ?? '') !== 'signal') return false;
      const team = teamFromEntity(payload.entityId);
      const delta = Math.max(0, Math.floor(Number(payload.delta ?? 0)));
      if (team === TEAM_BLUE) this.mirrorScoreBlue = Math.min(65535, this.mirrorScoreBlue + delta);
      if (team === TEAM_RED) this.mirrorScoreRed = Math.min(65535, this.mirrorScoreRed + delta);
      const ix = this.buildInstruction(
        'checkpoint_signal_score',
        this.getAuthorityMutateKeys(),
        this.encodeCheckpointSignalScore(this.mirrorScoreBlue, this.mirrorScoreRed, BigInt(nowSec)),
      );
      await this.sendRouted(ix);
      return true;
    }

    if (action.kind === 'ZONE_SET') {
      const payload = (action.payload ?? {}) as { index?: number; phase?: string; remainingSec?: number };
      const index = Math.max(0, Math.floor(Number(payload.index ?? 0)));
      const remainingSec = Math.max(0, Math.floor(Number(payload.remainingSec ?? 0)));
      const phaseEndsAt = nowSec + remainingSec;
      const phase = String(payload.phase ?? 'COUNTDOWN').toUpperCase();
      const method: SignalProtocolMethod = phase === 'ACTIVE' ? 'activate_zone' : 'start_zone_countdown';
      const args = phase === 'ACTIVE'
        ? this.encodeActivateZone(phaseEndsAt)
        : this.encodeStartZoneCountdown(index, phaseEndsAt);
      const ix = this.buildInstruction(method, this.getAuthorityMutateKeys(), args);
      await this.sendRouted(ix);
      return true;
    }

    if (action.kind === 'ZONE_OWNER_SET') {
      const payload = (action.payload ?? {}) as { teamId?: string | null };
      const ix = this.buildInstruction(
        'set_zone_owner',
        this.getAuthorityMutateKeys(),
        this.encodeSetZoneOwner(teamFromEntity(payload.teamId ?? '')),
      );
      await this.sendRouted(ix);
      return true;
    }

    if (action.kind === 'ZONE_CONTESTED_SET') {
      const payload = (action.payload ?? {}) as { contested?: boolean };
      const ix = this.buildInstruction(
        'set_zone_contested',
        this.getAuthorityMutateKeys(),
        this.encodeSetZoneContested(Boolean(payload.contested)),
      );
      await this.sendRouted(ix);
      return true;
    }

    if (action.kind === 'DROP_STATE_SET') {
      const payload = (action.payload ?? {}) as {
        state?: string;
        zone?: number;
        eligibleTeam?: string;
        extractingTeam?: string;
        extractProgressMs?: number;
        expiresAt?: number;
        dropId?: string;
        rewardKey?: string;
      };
      const state = String(payload.state ?? 'INACTIVE').toUpperCase();
      if (state === 'INCOMING') {
        const rewardKey = buffFromKey(payload.rewardKey);
        const dropNum = Number(String(payload.dropId ?? '0').replace(/\D/g, '')) || 0;
        const ix = this.buildInstruction(
          'spawn_drop',
          this.getAuthorityMutateKeys(),
          this.encodeSpawnDrop({
            dropId: BigInt(dropNum),
            zoneIndex: Math.max(0, Math.floor(Number(payload.zone ?? 0))),
            eligibleTeam: teamFromEntity(payload.eligibleTeam),
            rewardKey,
            incomingUntil: nowSec + 2,
            expiresAt: Number.isFinite(payload.expiresAt) ? Math.floor(Number(payload.expiresAt)) : nowSec + 60,
          }),
        );
        await this.sendRouted(ix);
        return true;
      }
      if (state === 'EXTRACTING') {
        const ix = this.buildInstruction(
          'begin_drop_extract',
          this.getAuthorityMutateKeys(),
          this.encodeBeginDropExtract(
            teamFromEntity(payload.extractingTeam),
            this.config.signer.publicKey,
            Math.max(0, Math.floor(Number(payload.extractProgressMs ?? 0))),
          ),
        );
        await this.sendRouted(ix);
        return true;
      }
      if (state === 'LANDED') {
        const ix = this.buildInstruction('reset_drop_extract', this.getAuthorityMutateKeys());
        await this.sendRouted(ix);
        return true;
      }
      if (state === 'EXPIRED') {
        const ix = this.buildInstruction(
          'checkpoint_collapse_state',
          this.getAuthorityMutateKeys(),
          this.encodeCheckpointCollapseState(20, BigInt(nowSec)),
        );
        await this.sendRouted(ix);
        return true;
      }
      return false;
    }

    if (action.kind === 'DROP_EXTRACT_COMPLETE' || action.kind === 'DROP_BUFF_GRANTED') {
      const payload = (action.payload ?? {}) as { teamId?: string; buffKey?: string };
      const team = teamFromEntity(payload.teamId);
      if (team === 0) return false;
      const ix = this.buildInstruction(
        'claim_drop_key',
        this.getAuthorityMutateKeys(),
        this.encodeClaimDropKey(team, buffFromKey(payload.buffKey), this.config.signer.publicKey),
      );
      await this.sendRouted(ix);
      return true;
    }

    if (action.kind === 'POWERUP_BURN_USE') {
      const payload = (action.payload ?? {}) as { teamId?: string; buffKey?: string; burnNonce?: number };
      const team = teamFromEntity(payload.teamId);
      if (team === 0) return false;
      const nonce = BigInt(Math.max(0, Math.floor(Number(payload.burnNonce ?? nowSec))));
      const ix = this.buildInstruction(
        'burn_and_activate_key',
        this.getAuthorityMutateKeys(),
        this.encodeBurnAndActivateKey(team, buffFromKey(payload.buffKey), nonce, nowSec + 15),
      );
      await this.sendRouted(ix);
      return true;
    }

    return false;
  }

  resetMirroredScores(blue: number, red: number): void {
    this.mirrorScoreBlue = Math.max(0, Math.min(65535, Math.floor(blue)));
    this.mirrorScoreRed = Math.max(0, Math.min(65535, Math.floor(red)));
  }

  async readMirroredState(): Promise<any> {
    const infos = await this.config.erConnection.getMultipleAccountsInfo([
      this.matchStatePda,
      this.zoneRotationStatePda,
      this.dropStatePda,
      this.playerInventoryStatePda,
      this.activationStatePda,
    ], 'confirmed');
    const [matchInfo, zoneInfo, dropInfo, inventoryInfo, activationInfo] = infos;
    if (!matchInfo || !zoneInfo || !dropInfo || !inventoryInfo || !activationInfo) {
      throw new Error('Signal authority accounts are not fully initialized on ER');
    }

    const match = this.decodeMatchStateAccount(matchInfo.data);
    const zone = this.decodeZoneStateAccount(zoneInfo.data);
    const drop = this.decodeDropStateAccount(dropInfo.data);
    const inventory = this.decodeInventoryStateAccount(inventoryInfo.data);
    const activation = this.decodeActivationStateAccount(activationInfo.data);
    const nowSec = Math.floor(Date.now() / 1000);
    const blueEndsAt = inventory.team === TEAM_BLUE ? inventory.activeUntil : 0;
    const redEndsAt = inventory.team === TEAM_RED ? inventory.activeUntil : 0;

    return {
      seq: match.eventSeq,
      phase: match.flow === 2 ? 'POSTMATCH' : match.flow === 1 ? 'LIVE' : 'PREMATCH',
      stateHash: `${match.eventSeq}:${match.scoreBlue}:${match.scoreRed}:${zone.activeZoneIndex}:${zone.phase}:${zone.ownerTeam}:${zone.contested ? 1 : 0}:${drop.dropId}:${drop.lifecycle}`,
      modules: {
        scoring: {
          counters: {
            signal: {
              blue: match.scoreBlue,
              red: match.scoreRed,
            },
          },
        },
      },
      custom: {
        onchain: {
          zone: {
            index: zone.activeZoneIndex,
            phase: zone.phase === 1 ? 'ACTIVE' : 'COUNTDOWN',
            remainingSec: Math.max(0, zone.phaseEndsAt - nowSec),
            ownerTeam: zone.ownerTeam,
            contested: zone.contested,
          },
          activeDropBuff: {
            blue: inventory.team === TEAM_BLUE ? inventory.activeKey : 0,
            red: inventory.team === TEAM_RED ? inventory.activeKey : 0,
          },
          dropInfo: {
            lastDropId: drop.dropId,
            blueEndsAt,
            redEndsAt,
            state: drop.lifecycle,
            zone: drop.zoneIndex,
            eligibleTeam: drop.eligibleTeam,
            extractingTeam: drop.extractingTeam,
            extractProgressMs: drop.extractProgressMs,
            extractTargetMs: drop.extractTargetMs,
            expiresAt: drop.expiresAt,
          },
          powerupBurn: {
            nonce: activation.lastBurnNonce,
            team: inventory.team,
            buff: activation.lastBurnedKey,
          },
          selectedLoadoutSlot: match.selectedLoadoutSlot,
          ended: match.finalized || match.flow === 2,
        },
      },
    };
  }

  private async bootstrapAccounts(delegateAccounts: SignalProtocolDelegationAccounts | null = null): Promise<SignalProtocolL1SendResult | null> {
    const infos = await this.config.l1Connection.getMultipleAccountsInfo([
      this.matchStatePda,
      this.zoneRotationStatePda,
      this.dropStatePda,
      this.playerInventoryStatePda,
      this.activationStatePda,
    ], 'confirmed');
    const [matchInfo, zoneInfo, dropInfo, inventoryInfo, activationInfo] = infos;

    if (matchInfo) {
      const authority = this.decodeMatchAuthority(matchInfo.data);
      if (!authority.equals(this.config.signer.publicKey)) {
        throw new Error(
          `match seed already belongs to authority ${authority.toBase58()}, but connected Phantom is ${this.config.signer.publicKey.toBase58()}`,
        );
      }
    }

    const bootstrapIxs: TransactionInstruction[] = [];
    if (!matchInfo) {
      bootstrapIxs.push(this.buildInstruction(
        'create_match',
        this.getCreateMatchKeys(),
        this.encodeCreateMatch(),
      ));
    }
    if (!zoneInfo) {
      bootstrapIxs.push(this.buildInstruction(
        'init_zone_rotation',
        this.getInitZoneRotationKeys(),
        this.encodeInitZoneRotation(),
      ));
    }
    if (!dropInfo) {
      bootstrapIxs.push(this.buildInstruction(
        'init_drop_state',
        this.getInitDropStateKeys(),
        this.encodeInitDropState(),
      ));
    }
    if (!inventoryInfo) {
      bootstrapIxs.push(this.buildInstruction(
        'init_player_inventory',
        this.getInitPlayerInventoryKeys(),
      ));
    }
    if (!activationInfo) {
      bootstrapIxs.push(this.buildInstruction(
        'init_activation',
        this.getInitActivationKeys(),
      ));
    }
    if (delegateAccounts) {
      bootstrapIxs.push(this.createDelegateMatchAccountsInstruction(delegateAccounts));
    }
    if (bootstrapIxs.length > 0) {
      return await this.sendL1Transactions(bootstrapIxs);
    }
    return null;
  }

  subscribeState(callback: (state: any) => void, pollHz: number = 6): () => void {
    const pollMs = Math.max(100, Math.floor(1000 / Math.max(1, pollHz)));
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        callback(await this.readMirroredState());
      } catch {
        // Keep polling through transient ER/account errors.
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

  private decodeMatchStateAccount(data: Uint8Array): {
    flow: number;
    scoreBlue: number;
    scoreRed: number;
    eventSeq: number;
    selectedLoadoutSlot: number;
    finalized: boolean;
  } {
    let o = 8;
    o += 1;
    o += 32;
    o += 32;
    const flow = data[o++]!;
    o += 2;
    const scoreBlue = readU16(data, o); o += 2;
    const scoreRed = readU16(data, o); o += 2;
    o += 1;
    const eventSeq = readU64(data, o); o += 8;
    o += 8;
    o += 8;
    o += 8;
    o += 8;
    const selectedLoadoutSlot = data[o++]!;
    const finalized = data[o] === 1;
    return { flow, scoreBlue, scoreRed, eventSeq, selectedLoadoutSlot, finalized };
  }

  private decodeMatchAuthority(data: Uint8Array): PublicKey {
    const start = 8 + 1 + 32;
    return new PublicKey(data.slice(start, start + 32));
  }

  private decodeZoneStateAccount(data: Uint8Array): {
    activeZoneIndex: number;
    phase: number;
    phaseEndsAt: number;
    ownerTeam: number;
    contested: boolean;
  } {
    let o = 8;
    o += 1;
    o += 32;
    o += 1;
    const activeZoneIndex = data[o++]!;
    const phase = data[o++]!;
    const phaseEndsAt = readU64(data, o); o += 8;
    o += 2;
    o += 2;
    const ownerTeam = data[o++]!;
    const contested = data[o] === 1;
    return { activeZoneIndex, phase, phaseEndsAt, ownerTeam, contested };
  }

  private decodeDropStateAccount(data: Uint8Array): {
    dropId: number;
    lifecycle: number;
    zoneIndex: number;
    eligibleTeam: number;
    extractTargetMs: number;
    extractProgressMs: number;
    extractingTeam: number;
    expiresAt: number;
  } {
    let o = 8;
    o += 1;
    o += 32;
    const dropId = readU64(data, o); o += 8;
    const lifecycle = data[o++]!;
    const zoneIndex = data[o++]!;
    const eligibleTeam = data[o++]!;
    o += 1;
    o += 8;
    const extractTargetMs = readU32(data, o); o += 4;
    const extractProgressMs = readU32(data, o); o += 4;
    const extractingTeam = data[o++]!;
    o += 32;
    const expiresAt = readU64(data, o);
    return { dropId, lifecycle, zoneIndex, eligibleTeam, extractTargetMs, extractProgressMs, extractingTeam, expiresAt };
  }

  private decodeInventoryStateAccount(data: Uint8Array): {
    team: number;
    activeKey: number;
    activeUntil: number;
  } {
    let o = 8;
    o += 1;
    o += 32;
    o += 32;
    const team = data[o++]!;
    o += 10;
    const activeKey = data[o++]!;
    const activeUntil = readU64(data, o);
    return { team, activeKey, activeUntil };
  }

  private decodeActivationStateAccount(data: Uint8Array): {
    lastBurnedKey: number;
    lastBurnNonce: number;
  } {
    let o = 8;
    o += 1;
    o += 32;
    o += 8;
    o += 8;
    o += 8;
    o += 2;
    o += 2;
    o += 2;
    o += 8;
    o += 8;
    const lastBurnedKey = data[o++]!;
    const lastBurnNonce = readU64(data, o);
    return { lastBurnedKey, lastBurnNonce };
  }
}

export function parseMatchSeedHex(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('match seed must be 32 bytes hex');
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(normalized.slice(i * 2, (i * 2) + 2), 16);
  }
  return out;
}
