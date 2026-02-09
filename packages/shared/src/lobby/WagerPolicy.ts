/**
 * Wager Policy System
 * 
 * Validates wagers and provides settlement hooks for match lobbies.
 * 
 * SCOPE: Policy logic only. No on-chain code, no wallet integration.
 */

// =============================================================================
// TYPES
// =============================================================================

/** Wager policy types */
export type WagerPolicyType = 'none' | 'fixed' | 'orderbook';

/** Currency identifier (abstracted) */
export type CurrencyId = string;

/** Base wager policy */
export interface WagerPolicyBase {
    readonly type: WagerPolicyType;
    readonly currency: CurrencyId;
}

/** No wager policy (casual) */
export interface NoWagerPolicy extends WagerPolicyBase {
    readonly type: 'none';
}

/** Fixed wager policy - everyone pays exact amount */
export interface FixedWagerPolicy extends WagerPolicyBase {
    readonly type: 'fixed';
    readonly amount: number;
}

/** Order-book wager policy - variable amounts within bounds */
export interface OrderBookWagerPolicy extends WagerPolicyBase {
    readonly type: 'orderbook';
    readonly minAmount: number;
    readonly maxAmount: number;
}

/** Union of all wager policies */
export type WagerPolicy = NoWagerPolicy | FixedWagerPolicy | OrderBookWagerPolicy;

/** Player wager entry */
export interface PlayerWager {
    readonly playerId: string;
    readonly amount: number;
    readonly lockedAt?: number;
}

/** Wager validation result */
export interface WagerValidation {
    readonly valid: boolean;
    readonly errors: readonly string[];
}

// =============================================================================
// SETTLEMENT TYPES (Placeholders)
// =============================================================================

/** Result of locking wagers */
export interface LockResult {
    readonly success: boolean;
    readonly matchId: string;
    readonly lockedAmount: number;
    readonly error?: string;
}

/** Result of settling a match */
export interface SettleResult {
    readonly success: boolean;
    readonly matchId: string;
    readonly distributed: number;
    readonly error?: string;
}

/** Result of refunding wagers */
export interface RefundResult {
    readonly success: boolean;
    readonly matchId: string;
    readonly refundedCount: number;
    readonly error?: string;
}

/**
 * Settlement hooks interface.
 * Implement this to integrate with your balance/payment system.
 */
export interface WagerSettlementHooks {
    /** Lock wagers before match starts */
    lockWagers(matchId: string, wagers: readonly PlayerWager[]): Promise<LockResult>;

    /** Distribute winnings after match ends */
    settleMatch(
        matchId: string,
        winners: readonly string[],
        losers: readonly string[],
        totalPot: number
    ): Promise<SettleResult>;

    /** Refund wagers on match cancellation */
    refundWagers(matchId: string, players: readonly string[]): Promise<RefundResult>;
}

// =============================================================================
// FACTORY
// =============================================================================

/** Create a no-wager policy */
export function createNoWagerPolicy(): NoWagerPolicy {
    return { type: 'none', currency: '' };
}

/** Create a fixed wager policy */
export function createFixedWagerPolicy(
    amount: number,
    currency: CurrencyId = 'default'
): FixedWagerPolicy {
    return { type: 'fixed', currency, amount };
}

/** Create an order-book wager policy */
export function createOrderBookWagerPolicy(
    minAmount: number,
    maxAmount: number,
    currency: CurrencyId = 'default'
): OrderBookWagerPolicy {
    return { type: 'orderbook', currency, minAmount, maxAmount };
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate a single player's wager against policy.
 */
export function validateWager(
    policy: WagerPolicy,
    wager: PlayerWager
): WagerValidation {
    const errors: string[] = [];

    switch (policy.type) {
        case 'none':
            // No wager required, but if provided it should be 0
            if (wager.amount !== 0) {
                errors.push(`No wager expected for this match, got ${wager.amount}`);
            }
            break;

        case 'fixed':
            if (wager.amount !== policy.amount) {
                errors.push(
                    `Wager must be exactly ${policy.amount}, got ${wager.amount}`
                );
            }
            break;

        case 'orderbook':
            if (wager.amount < policy.minAmount) {
                errors.push(
                    `Wager ${wager.amount} below minimum ${policy.minAmount}`
                );
            }
            if (wager.amount > policy.maxAmount) {
                errors.push(
                    `Wager ${wager.amount} exceeds maximum ${policy.maxAmount}`
                );
            }
            break;
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate all players' wagers for a match.
 */
export function validateAllWagers(
    policy: WagerPolicy,
    wagers: readonly PlayerWager[]
): WagerValidation {
    const errors: string[] = [];

    // Validate each wager
    for (const wager of wagers) {
        const result = validateWager(policy, wager);
        if (!result.valid) {
            errors.push(`Player ${wager.playerId}: ${result.errors.join(', ')}`);
        }
    }

    // For fixed policy, ensure all amounts match
    if (policy.type === 'fixed' && wagers.length > 1) {
        const amounts = new Set(wagers.map(w => w.amount));
        if (amounts.size > 1) {
            errors.push('All players must wager the same amount in fixed mode');
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Calculate total pot from wagers.
 */
export function calculateTotalPot(wagers: readonly PlayerWager[]): number {
    return wagers.reduce((sum, w) => sum + w.amount, 0);
}

/**
 * Calculate winner payout (equal split).
 */
export function calculateWinnerPayout(
    totalPot: number,
    winnerCount: number,
    rake: number = 0
): number {
    if (winnerCount === 0) return 0;
    const afterRake = totalPot * (1 - rake);
    return afterRake / winnerCount;
}

// =============================================================================
// PLACEHOLDER SETTLEMENT
// =============================================================================

/**
 * Placeholder settlement hooks for testing.
 * Replace with actual implementation.
 */
export const placeholderSettlement: WagerSettlementHooks = {
    async lockWagers(matchId, wagers): Promise<LockResult> {
        // TODO: Implement actual lock logic
        console.log(`[Wager] Locking ${wagers.length} wagers for match ${matchId}`);
        return {
            success: true,
            matchId,
            lockedAmount: calculateTotalPot(wagers),
        };
    },

    async settleMatch(matchId, winners, losers, totalPot): Promise<SettleResult> {
        // TODO: Implement actual settlement logic
        console.log(`[Wager] Settling match ${matchId}: ${winners.length} winners, ${losers.length} losers, pot=${totalPot}`);
        return {
            success: true,
            matchId,
            distributed: totalPot,
        };
    },

    async refundWagers(matchId, players): Promise<RefundResult> {
        // TODO: Implement actual refund logic
        console.log(`[Wager] Refunding ${players.length} players for match ${matchId}`);
        return {
            success: true,
            matchId,
            refundedCount: players.length,
        };
    },
};
