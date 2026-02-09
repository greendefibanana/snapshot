import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';

const WAGER_SEED = 'wager';
const VAULT_SEED = 'vault';

export function findWagerPda(programId: PublicKey, matchSeed: Uint8Array): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from(WAGER_SEED), Buffer.from(matchSeed)], programId)[0];
}

export function findVaultPda(programId: PublicKey, matchSeed: Uint8Array): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from(VAULT_SEED), Buffer.from(matchSeed)], programId)[0];
}

export function buildSettleWagerIx(args: {
    programId: PublicKey;
    authority: PublicKey;
    matchSeed: Uint8Array;
    winner: PublicKey;
    feeWallet: PublicKey;
}): TransactionInstruction {
    const wagerPda = findWagerPda(args.programId, args.matchSeed);
    const vaultPda = findVaultPda(args.programId, args.matchSeed);

    const data = Buffer.concat([
        Buffer.from([2]),
        Buffer.from(args.matchSeed),
        args.winner.toBuffer(),
    ]);

    return new TransactionInstruction({
        programId: args.programId,
        keys: [
            { pubkey: args.authority, isSigner: true, isWritable: false },
            { pubkey: wagerPda, isSigner: false, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: args.winner, isSigner: false, isWritable: true },
            { pubkey: args.feeWallet, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
    });
}
