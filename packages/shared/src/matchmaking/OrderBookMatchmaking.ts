/**
 * Order-Book Matchmaking
 * 
 * Players post orders with wager amounts. Matches occur when bid meets ask.
 * 
 * SCOPE: Matching logic only. No settlement, no networking.
 */

import type { TeamSize, MatchMode } from '../lobby/MatchRules.js';
import {
    type PlayerId,
    type MatchId,
    type MatchResult,
    type MatchmakingStats,
    type MatchmakingStrategy,
    type MatchRequest,
    createMatchResult,
    createFailedResult,
} from './MatchmakingStrategy.js';

// =============================================================================
// TYPES
// =============================================================================

/** Order side - bid (challenger) or ask (acceptor) */
export type OrderSide = 'bid' | 'ask';

/** Unique order identifier */
export type OrderId = string;

/** A matchmaking order */
export interface MatchOrder {
    readonly orderId: OrderId;
    readonly playerId: PlayerId;
    readonly teamSize: TeamSize;
    readonly mode: MatchMode;
    readonly side: OrderSide;
    readonly wagerAmount: number;
    readonly minOpponentWager: number;
    readonly createdAt: number;
    readonly expiresAt: number;
    readonly partyMembers?: readonly PlayerId[];
}

/** Order creation params */
export interface CreateOrderParams {
    playerId: PlayerId;
    teamSize: TeamSize;
    mode: MatchMode;
    side: OrderSide;
    wagerAmount: number;
    minOpponentWager: number;
    ttlMs?: number;
    partyMembers?: PlayerId[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default order TTL (10 minutes) */
const DEFAULT_ORDER_TTL_MS = 10 * 60 * 1000;

/** Team size mapping */
const TEAM_SIZE_MAP: Record<TeamSize, number> = {
    '1v1': 1,
    '4v4': 4,
};

// =============================================================================
// ORDER BOOK
// =============================================================================

/**
 * Order book data structure.
 * Maintains sorted bid/ask lists for efficient matching.
 */
export class OrderBook {
    /** Bids sorted by wagerAmount DESC */
    private bids: MatchOrder[] = [];

    /** Asks sorted by wagerAmount ASC */
    private asks: MatchOrder[] = [];

    /** Add an order to the book */
    addOrder(order: MatchOrder): void {
        if (order.side === 'bid') {
            this.bids.push(order);
            // Sort by wager DESC (highest first)
            this.bids.sort((a, b) => b.wagerAmount - a.wagerAmount);
        } else {
            this.asks.push(order);
            // Sort by wager ASC (lowest first)
            this.asks.sort((a, b) => a.wagerAmount - b.wagerAmount);
        }
    }

    /** Remove an order by ID */
    removeOrder(orderId: OrderId): boolean {
        let idx = this.bids.findIndex(o => o.orderId === orderId);
        if (idx !== -1) {
            this.bids.splice(idx, 1);
            return true;
        }

        idx = this.asks.findIndex(o => o.orderId === orderId);
        if (idx !== -1) {
            this.asks.splice(idx, 1);
            return true;
        }

        return false;
    }

    /** Remove orders by player ID */
    removeByPlayer(playerId: PlayerId): number {
        const initialCount = this.bids.length + this.asks.length;

        this.bids = this.bids.filter(o =>
            o.playerId !== playerId &&
            !o.partyMembers?.includes(playerId)
        );
        this.asks = this.asks.filter(o =>
            o.playerId !== playerId &&
            !o.partyMembers?.includes(playerId)
        );

        return initialCount - (this.bids.length + this.asks.length);
    }

    /** Remove expired orders */
    pruneExpired(now: number = Date.now()): number {
        const initialCount = this.bids.length + this.asks.length;

        this.bids = this.bids.filter(o => o.expiresAt > now);
        this.asks = this.asks.filter(o => o.expiresAt > now);

        return initialCount - (this.bids.length + this.asks.length);
    }

    /** Get all bids (highest wager first) */
    getBids(): readonly MatchOrder[] {
        return this.bids;
    }

    /** Get all asks (lowest wager first) */
    getAsks(): readonly MatchOrder[] {
        return this.asks;
    }

    /** Check if player has an order */
    hasOrder(playerId: PlayerId): boolean {
        return this.bids.some(o => o.playerId === playerId) ||
            this.asks.some(o => o.playerId === playerId);
    }

    /** Get order by ID */
    getOrder(orderId: OrderId): MatchOrder | undefined {
        return this.bids.find(o => o.orderId === orderId) ||
            this.asks.find(o => o.orderId === orderId);
    }

    /** Get total order count */
    getOrderCount(): number {
        return this.bids.length + this.asks.length;
    }

    /** Clear all orders */
    clear(): void {
        this.bids = [];
        this.asks = [];
    }
}

// =============================================================================
// ORDER BOOK MATCHMAKER
// =============================================================================

/**
 * Order-book based matchmaking.
 * Matches bids and asks based on wager compatibility.
 */
export class OrderBookMatchmaker implements MatchmakingStrategy {
    readonly name = 'orderbook';
    readonly teamSize: TeamSize;
    readonly mode: MatchMode;

    private book = new OrderBook();
    private matchesFormed = 0;
    private failures = 0;
    private orderCounter = 0;

    constructor(teamSize: TeamSize, mode: MatchMode) {
        this.teamSize = teamSize;
        this.mode = mode;
    }

    // =========================================================================
    // STRATEGY INTERFACE
    // =========================================================================

    enqueue(request: MatchRequest): void {
        // For basic enqueue, create a bid order with 0 wager
        this.createOrder({
            playerId: request.playerId,
            teamSize: request.teamSize,
            mode: request.mode,
            side: 'bid',
            wagerAmount: 0,
            minOpponentWager: 0,
            partyMembers: request.partyMembers ? [...request.partyMembers] : undefined,
        });
    }

    dequeue(playerId: PlayerId): boolean {
        return this.book.removeByPlayer(playerId) > 0;
    }

    isQueued(playerId: PlayerId): boolean {
        return this.book.hasOrder(playerId);
    }

    tryMatch(): MatchResult | null {
        // Prune expired orders first
        this.book.pruneExpired();

        const bids = this.book.getBids();
        const asks = this.book.getAsks();

        // Try to match highest bid with compatible ask
        for (const bid of bids) {
            for (const ask of asks) {
                const result = this.tryMatchOrders(bid, ask);
                if (result) {
                    return result;
                }
            }
        }

        return null;
    }

    getStats(): MatchmakingStats {
        return {
            queueSize: this.book.getOrderCount(),
            averageWaitMs: 0, // TODO: track wait times
            matchesFormedTotal: this.matchesFormed,
            failuresTotal: this.failures,
        };
    }

    clear(): void {
        this.book.clear();
    }

    // =========================================================================
    // ORDER MANAGEMENT
    // =========================================================================

    /** Create and add an order */
    createOrder(params: CreateOrderParams): MatchOrder {
        const now = Date.now();
        const ttl = params.ttlMs ?? DEFAULT_ORDER_TTL_MS;

        const order: MatchOrder = {
            orderId: this.generateOrderId(),
            playerId: params.playerId,
            teamSize: params.teamSize,
            mode: params.mode,
            side: params.side,
            wagerAmount: params.wagerAmount,
            minOpponentWager: params.minOpponentWager,
            createdAt: now,
            expiresAt: now + ttl,
            partyMembers: params.partyMembers,
        };

        this.book.addOrder(order);
        return order;
    }

    /** Cancel an order by ID */
    cancelOrder(orderId: OrderId): boolean {
        return this.book.removeOrder(orderId);
    }

    /** Get the order book */
    getOrderBook(): OrderBook {
        return this.book;
    }

    // =========================================================================
    // MATCHING LOGIC
    // =========================================================================

    private tryMatchOrders(bid: MatchOrder, ask: MatchOrder): MatchResult | null {
        // Self-match prevention
        if (bid.playerId === ask.playerId) {
            return null;
        }

        // Check party overlap
        if (this.hasPartyOverlap(bid, ask)) {
            return null;
        }

        // Check wager compatibility
        // Bid must meet ask's minimum
        if (bid.wagerAmount < ask.minOpponentWager) {
            return null;
        }
        // Ask must meet bid's minimum
        if (ask.wagerAmount < bid.minOpponentWager) {
            return null;
        }

        // Check team size compatibility
        if (bid.teamSize !== ask.teamSize) {
            return null;
        }

        // For 1v1, we have a match!
        // For 4v4, we need more players (simplified: just match the orders)
        const team1 = this.getPlayersFromOrder(bid);
        const team2 = this.getPlayersFromOrder(ask);

        const playersPerTeam = TEAM_SIZE_MAP[this.teamSize];

        // For now, allow partial teams (TODO: require full teams)
        if (team1.length > playersPerTeam || team2.length > playersPerTeam) {
            return null;
        }

        // Match found! Remove orders
        this.book.removeOrder(bid.orderId);
        this.book.removeOrder(ask.orderId);
        this.matchesFormed++;

        return createMatchResult(team1, team2, {
            strategy: this.name,
            teamSize: this.teamSize,
            mode: this.mode,
            bidWager: bid.wagerAmount,
            askWager: ask.wagerAmount,
            bidOrderId: bid.orderId,
            askOrderId: ask.orderId,
        });
    }

    private hasPartyOverlap(order1: MatchOrder, order2: MatchOrder): boolean {
        const players1 = new Set(this.getPlayersFromOrder(order1));
        const players2 = this.getPlayersFromOrder(order2);
        return players2.some(p => players1.has(p));
    }

    private getPlayersFromOrder(order: MatchOrder): PlayerId[] {
        const players = [order.playerId];
        if (order.partyMembers) {
            players.push(...order.partyMembers);
        }
        return players;
    }

    private generateOrderId(): OrderId {
        return `order_${Date.now()}_${++this.orderCounter}`;
    }
}
