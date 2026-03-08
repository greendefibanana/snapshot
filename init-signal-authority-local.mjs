import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

const DEFAULT_RPC_URL = 'http://127.0.0.1:8899';
const DEFAULT_PROGRAM_ID = '8hNYsyzuX2SKEmBWamQCBPkdJZ3a8wNehZTEJX51A9Zi';
const DEFAULT_MATCH_SEED_HEX = '0708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20212223242526';
const DEFAULT_WALLET_PATH = 'C:\\Users\\ezevi\\.config\\solana\\id.json';

function requireHex32(value) {
  const hex = String(value).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(`expected 32-byte hex match seed, got "${value}"`);
  }
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

function loadWallet(walletPath) {
  const secret = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function discriminator(name) {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

function u16(value) {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value, 0);
  return out;
}

function buildIx(programId, method, keys, args = Buffer.alloc(0)) {
  return new TransactionInstruction({
    programId,
    keys,
    data: Buffer.concat([discriminator(method), args]),
  });
}

async function sendIfMissing(connection, signer, label, pda, ix) {
  const existing = await connection.getAccountInfo(pda, 'confirmed');
  if (existing) {
    console.log(`${label}: exists ${pda.toBase58()}`);
    return;
  }
  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(ix),
    [signer],
    { commitment: 'confirmed' },
  );
  console.log(`${label}: created ${pda.toBase58()} via ${signature}`);
}

const rpcUrl = String(process.env.SOLANA_RPC_URL ?? DEFAULT_RPC_URL).trim() || DEFAULT_RPC_URL;
const programId = new PublicKey(String(process.env.SNAP_AUTHORITY_PROGRAM_ID ?? DEFAULT_PROGRAM_ID).trim() || DEFAULT_PROGRAM_ID);
const matchSeed = requireHex32(process.env.SNAP_MATCH_SEED_HEX ?? DEFAULT_MATCH_SEED_HEX);
const walletPath = String(process.env.ANCHOR_WALLET ?? process.env.SOLANA_KEYPAIR_PATH ?? DEFAULT_WALLET_PATH).trim() || DEFAULT_WALLET_PATH;
const authority = loadWallet(walletPath);
const connection = new Connection(rpcUrl, 'confirmed');

const matchStatePda = PublicKey.findProgramAddressSync(
  [Buffer.from('match_state'), Buffer.from(matchSeed)],
  programId,
)[0];
const zoneRotationStatePda = PublicKey.findProgramAddressSync(
  [Buffer.from('zone_rotation_state'), Buffer.from(matchSeed)],
  programId,
)[0];
const dropStatePda = PublicKey.findProgramAddressSync(
  [Buffer.from('drop_state'), Buffer.from(matchSeed)],
  programId,
)[0];
const playerInventoryStatePda = PublicKey.findProgramAddressSync(
  [Buffer.from('player_inventory_state'), Buffer.from(matchSeed), authority.publicKey.toBuffer()],
  programId,
)[0];
const activationStatePda = PublicKey.findProgramAddressSync(
  [Buffer.from('activation_state'), Buffer.from(matchSeed)],
  programId,
)[0];

const createMatchArgs = Buffer.concat([
  Buffer.from(matchSeed),
  u16(500),
]);
const initZoneRotationArgs = Buffer.concat([
  u16(30),
  u16(60),
]);
const initDropStateArgs = Buffer.concat([
  u16(30),
  u16(2),
  u16(8),
  u16(60),
]);

const writableSigner = { pubkey: authority.publicKey, isSigner: true, isWritable: true };
const readonlySystem = { pubkey: SystemProgram.programId, isSigner: false, isWritable: false };

await sendIfMissing(
  connection,
  authority,
  'match_state',
  matchStatePda,
  buildIx(programId, 'create_match', [
    writableSigner,
    { pubkey: matchStatePda, isSigner: false, isWritable: true },
    readonlySystem,
  ], createMatchArgs),
);

await sendIfMissing(
  connection,
  authority,
  'zone_rotation_state',
  zoneRotationStatePda,
  buildIx(programId, 'init_zone_rotation', [
    writableSigner,
    { pubkey: matchStatePda, isSigner: false, isWritable: false },
    { pubkey: zoneRotationStatePda, isSigner: false, isWritable: true },
    readonlySystem,
  ], initZoneRotationArgs),
);

await sendIfMissing(
  connection,
  authority,
  'drop_state',
  dropStatePda,
  buildIx(programId, 'init_drop_state', [
    writableSigner,
    { pubkey: matchStatePda, isSigner: false, isWritable: false },
    { pubkey: dropStatePda, isSigner: false, isWritable: true },
    readonlySystem,
  ], initDropStateArgs),
);

await sendIfMissing(
  connection,
  authority,
  'player_inventory_state',
  playerInventoryStatePda,
  buildIx(programId, 'init_player_inventory', [
    writableSigner,
    { pubkey: matchStatePda, isSigner: false, isWritable: false },
    { pubkey: playerInventoryStatePda, isSigner: false, isWritable: true },
    readonlySystem,
  ]),
);

await sendIfMissing(
  connection,
  authority,
  'activation_state',
  activationStatePda,
  buildIx(programId, 'init_activation', [
    writableSigner,
    { pubkey: matchStatePda, isSigner: false, isWritable: false },
    { pubkey: activationStatePda, isSigner: false, isWritable: true },
    readonlySystem,
  ]),
);

console.log('program_id', programId.toBase58());
console.log('authority', authority.publicKey.toBase58());
console.log('match_seed_hex', Buffer.from(matchSeed).toString('hex'));
console.log('match_state', matchStatePda.toBase58());
console.log('zone_rotation_state', zoneRotationStatePda.toBase58());
console.log('drop_state', dropStatePda.toBase58());
console.log('player_inventory_state', playerInventoryStatePda.toBase58());
console.log('activation_state', activationStatePda.toBase58());
