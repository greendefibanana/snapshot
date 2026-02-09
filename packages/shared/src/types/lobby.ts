/**
 * Shared Types - Lobby, Players, Inventory, Store, Match
 * 
 * Types only. No implementation. JSON-serializable.
 */

// =============================================================================
// IDS
// =============================================================================

export type PlayerId = string;
export type LobbyId = string;
export type MatchId = string;
export type ItemId = string;
export type CurrencyId = string;

// =============================================================================
// LOBBY
// =============================================================================

export type LobbyPhase =
    | 'idle'
    | 'queueing'
    | 'assembling'
    | 'ready_check'
    | 'countdown'
    | 'starting'
    | 'error';

export type TeamId = 0 | 1 | 2;

export type GameMode = '1v1' | '4v4' | 'training';

export type Ruleset = 'casual' | 'wager';

export type AccessType = 'public' | 'token' | 'nft' | 'friends';

export interface PlayerSlot {
    readonly playerId: PlayerId;
    readonly displayName: string;
    readonly team: TeamId;
    readonly slot: number;
    readonly isReady: boolean;
    readonly isHost: boolean;
}

export interface QueueState {
    readonly waitTimeSec: number;
    readonly mode: GameMode;
    readonly ruleset: Ruleset;
    readonly playersInQueue: number;
    readonly wagerAmountSol?: number;
    readonly totalPotSol?: number;
}

export interface LobbyError {
    readonly code: string;
    readonly message: string;
}

export interface LobbyState {
    readonly lobbyId: LobbyId;
    readonly phase: LobbyPhase;
    readonly players: readonly PlayerSlot[];
    readonly localPlayerId: PlayerId;
    readonly mode: GameMode;
    readonly ruleset: Ruleset;
    readonly access: AccessType;
    readonly maxPlayers: number;
    readonly minPlayers: number;
    readonly countdownSec: number;
    readonly queue?: QueueState;
    readonly error?: LobbyError;
}

// =============================================================================
// INVENTORY
// =============================================================================

export type ItemType = 'character' | 'weapon' | 'cosmetic';

export type AcquisitionSource = 'purchase' | 'reward' | 'default' | 'gift';

export interface InventoryItem {
    readonly itemId: ItemId;
    readonly itemType: ItemType;
    readonly ownedAt: number;
    readonly source: AcquisitionSource;
}

// =============================================================================
// STORE
// =============================================================================

export interface StoreItem {
    readonly itemId: ItemId;
    readonly itemType: ItemType;
    readonly name: string;
    readonly description: string;
    readonly price: number;
    readonly currency: CurrencyId;
    readonly available: boolean;
    readonly limitedQuantity?: number;
    readonly expiresAt?: number;
}

// =============================================================================
// MATCH
// =============================================================================

export type MatchOutcome = 'win' | 'loss' | 'draw' | 'forfeit';

export interface PlayerMatchResult {
    readonly playerId: PlayerId;
    readonly team: TeamId;
    readonly outcome: MatchOutcome;
    readonly kills: number;
    readonly deaths: number;
    readonly assists: number;
    readonly score: number;
}

export interface MatchResult {
    readonly matchId: MatchId;
    readonly mode: GameMode;
    readonly ruleset: Ruleset;
    readonly startedAt: number;
    readonly endedAt: number;
    readonly durationSec: number;
    readonly winningTeam: TeamId;
    readonly players: readonly PlayerMatchResult[];
}
