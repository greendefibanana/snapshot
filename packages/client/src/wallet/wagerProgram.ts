import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';

const WAGER_SEED = 'wager';
const VAULT_SEED = 'vault';

export function findWagerPda(programId: PublicKey, matchSeed: Uint8Array): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from(WAGER_SEED), Buffer.from(matchSeed)], programId)[0];
}

export function findVaultPda(programId: PublicKey, matchSeed: Uint8Array): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from(VAULT_SEED), Buffer.from(matchSeed)], programId)[0];
}

function u64ToLe(value: number): Buffer {
    const buf = Buffer.alloc(8);
    const big = BigInt(Math.floor(value));
    buf.writeBigUInt64LE(big, 0);
    return buf;
}

function u16ToLe(value: number): Buffer {
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(value, 0);
    return buf;
}

export function buildInitWagerIx(args: {
    programId: PublicKey;
    payer: PublicKey;
    player: PublicKey;
    authority: PublicKey;
    feeWallet: PublicKey;
    matchSeed: Uint8Array;
    amountLamports: number;
    feeBps: number;
}): TransactionInstruction {
    const wagerPda = findWagerPda(args.programId, args.matchSeed);
    const vaultPda = findVaultPda(args.programId, args.matchSeed);

    const data = Buffer.concat([
        Buffer.from([0]),
        Buffer.from(args.matchSeed),
        u64ToLe(args.amountLamports),
        u16ToLe(args.feeBps),
        args.authority.toBuffer(),
        args.feeWallet.toBuffer(),
    ]);

    return new TransactionInstruction({
        programId: args.programId,
        keys: [
            { pubkey: args.payer, isSigner: true, isWritable: true },
            { pubkey: args.player, isSigner: true, isWritable: true },
            { pubkey: wagerPda, isSigner: false, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
    });
}

export function buildJoinWagerIx(args: {
    programId: PublicKey;
    player: PublicKey;
    matchSeed: Uint8Array;
}): TransactionInstruction {
    const wagerPda = findWagerPda(args.programId, args.matchSeed);
    const vaultPda = findVaultPda(args.programId, args.matchSeed);

    const data = Buffer.concat([
        Buffer.from([1]),
        Buffer.from(args.matchSeed),
    ]);

    return new TransactionInstruction({
        programId: args.programId,
        keys: [
            { pubkey: args.player, isSigner: true, isWritable: true },
            { pubkey: wagerPda, isSigner: false, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
    });
}
