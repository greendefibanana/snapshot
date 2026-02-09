/**
 * Matchmaking Module Exports
 */

// Base types and interface
export {
    type PlayerId,
    type MatchId,
    type MatchFailure,
    type MatchResult,
    type MatchRequest,
    type MatchmakingStats,
    type MatchmakingStrategy,
    generateMatchId,
    createMatchResult,
    createFailedResult,
} from './MatchmakingStrategy.js';

// Queue-based matchmaking
export {
    type QueueMatchRequest,
    QueueMatchmaker,
} from './QueueMatchmaking.js';

// Order-book matchmaking
export {
    type OrderSide,
    type OrderId,
    type MatchOrder,
    type CreateOrderParams,
    OrderBook,
    OrderBookMatchmaker,
} from './OrderBookMatchmaking.js';
