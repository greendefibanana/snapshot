/**
 * Matchmaking Strategy - Base types and interfaces
 * 
 * Defines common interface for all matchmaking strategies.
 * 
 * SCOPE: Types and interfaces only. No networking.
 */

import type { TeamSize, MatchMode } from '../lobby/MatchRules.js';

// =============================================================================
// TYPES
// =============================================================================

/** Unique player identifier (opaque string) */
export type PlayerId = string;

/** Unique match identifier */
export type MatchId = string;

/** Failure reasons for matchmaking */
export type MatchFailure =
    | 'INSUFFICIENT_PLAYERS'
    | 'TIMEOUT'
    | 'PARTY_TOO_LARGE'
    | 'NO_MATCHING_ORDERS'
    | 'ORDER_EXPIRED'
    | 'SELF_MATCH'
    | 'INSUFFICIENT_STAKE'
    | 'CANCELLED';

/** Result of a match attempt */
export interface MatchResult {
    readonly matched: boolean;
    readonly matchId?: MatchId;
    readonly team1: readonly PlayerId[];
    readonly team2: readonly PlayerId[];
    readonly failureReason?: MatchFailure;
    readonly metadata?: Record<string, unknown>;
}

/** Base match request */
export interface MatchRequest {
    readonly playerId: PlayerId;
    readonly teamSize: TeamSize;
    readonly mode: MatchMode;
    readonly enqueuedAt: number;
    readonly partyMembers?: readonly PlayerId[];
}

/** Matchmaking statistics */
export interface MatchmakingStats {
    readonly queueSize: number;
    readonly averageWaitMs: number;
    readonly matchesFormedTotal: number;
    readonly failuresTotal: number;
}

// =============================================================================
// STRATEGY INTERFACE
// =============================================================================

/**
 * Common interface for all matchmaking strategies.
 */
export interface MatchmakingStrategy {
    /** Strategy name */
    readonly name: string;

    /** Team size this strategy handles */
    readonly teamSize: TeamSize;

    /** Add player to matchmaking pool */
    enqueue(request: MatchRequest): void;

    /** Remove player from pool */
    dequeue(playerId: PlayerId): boolean;

    /** Check if player is in pool */
    isQueued(playerId: PlayerId): boolean;

    /** Attempt to form a match */
    tryMatch(): MatchResult | null;

    /** Get queue statistics */
    getStats(): MatchmakingStats;

    /** Clear all queued players */
    clear(): void;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Generate a unique match ID */
export function generateMatchId(): MatchId {
    return `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a successful match result */
export function createMatchResult(
    team1: PlayerId[],
    team2: PlayerId[],
    metadata?: Record<string, unknown>
): MatchResult {
    return {
        matched: true,
        matchId: generateMatchId(),
        team1,
        team2,
        metadata,
    };
}

/** Create a failed match result */
export function createFailedResult(
    reason: MatchFailure,
    partialTeam1: PlayerId[] = [],
    partialTeam2: PlayerId[] = []
): MatchResult {
    return {
        matched: false,
        team1: partialTeam1,
        team2: partialTeam2,
        failureReason: reason,
    };
}
