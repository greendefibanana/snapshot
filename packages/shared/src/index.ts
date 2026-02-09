/**
 * @snapshot/shared
 * 
 * Shared types, data definitions, and utilities used by both client and server.
 */

// Core types (primary source for most types)
export * from './types/index.js';
export * from './types/characters.js';
export * from './types/weapons.js';
export * from './types/abilities.js';

// ECS
export * from './ecs/index.js';

// Data definitions
export * from './data/index.js';

// Networking
export * from './networking/index.js';

// Simulation - re-export selectively to avoid conflicts with types/index.js
// The simulation module has more detailed versions of Tick, MovementInput, etc.
export {
    // Tick utilities (TICK_RATE, TICK_MS, TICK_DELTA are also in types/SIMULATION)
    tick,
    tickBefore,
    tickAfter,
    tickDiff,
    tickAdvance,
    tickClamp,
    tickLerp,
    tickAlpha,
    msToTicks,
    ticksToMs,
    secondsToTicks,
    ticksToSeconds,
    TICK_ZERO,
    SERVER_INPUT_BUFFER_TICKS,
    INTERPOLATION_DELAY_TICKS,
    MAX_CLIENT_AHEAD_TICKS,
    MAX_CLIENT_BEHIND_TICKS,
    FULL_SNAPSHOT_INTERVAL,
    DELTA_INTERVAL,
    MAX_TICKS_PER_FRAME,
    createTickTimingStats,
    updateTickTimingStats,
    defaultTimer,
    type PrecisionTimer,
    type TickTimingStats,
    type ServerTickInfo,
    type ClientTickState,
} from './simulation/Tick.js';

export {
    // Snapshot types and utilities
    type Snapshot,
    type EntityState,
    type TransformState,
    type PhysicsState,
    type HealthState,
    type PlayerState,
    cloneSnapshot,
    createEmptySnapshot,
    calcSnapshotSize,
    calculateSnapshotSize,
    entityId,
} from './simulation/Snapshot.js';

export {
    // Delta compression
    type SnapshotDelta,
    type EntityDelta,
    DeltaFlags,
    generateDelta,
    applyDelta,
    serializeDelta,
    deserializeDelta,
    calcDeltaSavings,
} from './simulation/Delta.js';

export {
    // Input buffer (use these versions - they have serialization)
    InputBuffer,
    ServerInputQueue,
    createEmptyInput,
    cloneInput,
    serializeInput,
    deserializeInput,
    serializeInputBatch,
    deserializeInputBatch,
    serializeInputAck,
    deserializeInputAck,
    type InputAck,
    // Note: MovementInput, AimInput, InputFrame types come from types/index.js
} from './simulation/InputBuffer.js';

// Physics (shared)
export * from './physics/RapierWorld.js';
export * from './physics/PlayerPhysics.js';
export * from './physics/CollisionHandlers.js';

// Movement System
export * from './movement/index.js';

// Map Types - export selectively to avoid conflicts
export type {
    MapData,
    MapGeometry,
    MapCollider,
    SpawnZone,
    ObjectiveZone,
    CollisionLayer,
    MapBounds,
    MaterialRef,
    AssetManifest,
} from './types/map.js';

// Lobby Types - export selectively to avoid conflicts with branded types
export type {
    LobbyState,
    LobbyPhase,
    PlayerSlot,
    QueueState,
    LobbyError,
    GameMode,
    Ruleset,
    AccessType,
    // PlayerId and TeamId are intentionally excluded - use branded types from types/index.js
    InventoryItem,
    ItemId,
    ItemType,
    AcquisitionSource,
    StoreItem,
    CurrencyId,
    MatchOutcome,
    PlayerMatchResult,
    MatchResult,
} from './types/lobby.js';

// Solana helpers
export { wagerMatchSeed } from './solana/wagerSeeds.js';
