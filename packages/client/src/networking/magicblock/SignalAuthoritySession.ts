import type { TransactionInstruction } from '@solana/web3.js';
import { getGameClient } from '../GameClient';

export async function delegateSignalAuthorityAccounts(accounts: any): Promise<{ signature: string; backendUsed: 'solana_l1' | 'magic_router' | 'direct_er' }> {
    return getGameClient().delegateSignalAuthorityAccounts(accounts);
}

export async function sendSignalAuthorityTransaction(ix: TransactionInstruction): Promise<{ signature: string; backendUsed: 'magic_router' | 'direct_er' }> {
    return getGameClient().sendSignalAuthorityTransaction(ix);
}

export async function commitSignalAuthorityCheckpoint(): Promise<{ signature: string; backendUsed: 'magic_router' | 'direct_er' } | null> {
    return getGameClient().commitSignalAuthorityCheckpoint();
}

export async function finalizeSignalAuthorityMatch(
    winner: 'blue' | 'red',
    blueScore: number,
    redScore: number,
): Promise<{ signature: string; backendUsed: 'magic_router' | 'direct_er' } | null> {
    return getGameClient().finalizeSignalAuthorityMatch(winner, blueScore, redScore);
}
