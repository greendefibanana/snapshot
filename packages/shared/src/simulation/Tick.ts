/**
 * Tick - Core timing types and utilities
 * 
 * Defines the fundamental timing primitives for deterministic simulation.
 * All timing in the simulation is expressed in ticks, not real time.
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Simulation tick rate in Hz.
 * 60 ticks per second provides smooth gameplay while being computationally feasible.
 */
export const TICK_RATE = 60;

/**
 * Duration of a single tick in milliseconds.
 */
export const TICK_MS = 1000 / TICK_RATE; // 16.667ms

/**
 * Duration of a single tick in seconds.
 * Used for physics and velocity calculations.
 */
export const TICK_DELTA = 1 / TICK_RATE; // 0.01667s

/**
 * Maximum ticks to simulate in a single frame.
 * Prevents death spiral when server falls behind.
 */
export const MAX_TICKS_PER_FRAME = 5;

/**
 * Ticks of input buffer on server to absorb jitter.
 * At 60Hz with 100ms network jitter, 6 ticks = 100ms buffer.
 */
export const SERVER_INPUT_BUFFER_TICKS = 6;

/**
 * Ticks of interpolation delay for remote entities.
 * 6 ticks = 100ms, enough to smooth out most network variance.
 */
export const INTERPOLATION_DELAY_TICKS = 6;

/**
 * Maximum ticks a client can be ahead of server before correction.
 */
export const MAX_CLIENT_AHEAD_TICKS = 10;

/**
 * Maximum ticks a client can be behind server before correction.
 */
export const MAX_CLIENT_BEHIND_TICKS = 30;

/**
 * How often to send full snapshots (in ticks).
 * 60 ticks = once per second.
 */
export const FULL_SNAPSHOT_INTERVAL = 60;

/**
 * How often to send delta updates (in ticks).
 * 2 ticks = 30 times per second.
 */
export const DELTA_INTERVAL = 2;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Branded type for simulation ticks.
 * Prevents accidental mixing of ticks with other numbers.
 */
export type Tick = number & { readonly __brand: 'Tick' };

/**
 * Create a tick value.
 */
export function tick(value: number): Tick {
    return value as Tick;
}

/**
 * Tick 0 - the starting tick of any simulation.
 */
export const TICK_ZERO = tick(0);

/**
 * Server tick info sent to clients.
 */
export interface ServerTickInfo {
    /** Current server tick */
    tick: Tick;

    /** Server timestamp in ms */
    serverTime: number;

    /** Tick rate (for verification) */
    tickRate: number;
}

/**
 * Client tick estimation state.
 */
export interface ClientTickState {
    /** Estimated current server tick */
    serverTick: Tick;

    /** Local tick (may differ from server during prediction) */
    localTick: Tick;

    /** Estimated one-way latency in ticks */
    latencyTicks: number;

    /** Clock difference: serverTime - localTime */
    clockOffset: number;

    /** Last time we synced with server */
    lastSyncTime: number;
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Convert milliseconds to ticks (rounded down).
 */
export function msToTicks(ms: number): number {
    return Math.floor(ms / TICK_MS);
}

/**
 * Convert ticks to milliseconds.
 */
export function ticksToMs(ticks: number): number {
    return ticks * TICK_MS;
}

/**
 * Convert seconds to ticks (rounded).
 */
export function secondsToTicks(seconds: number): number {
    return Math.round(seconds * TICK_RATE);
}

/**
 * Convert ticks to seconds.
 */
export function ticksToSeconds(ticks: number): number {
    return ticks * TICK_DELTA;
}

/**
 * Check if tickA is before tickB.
 * Handles tick wraparound (though with 32-bit ticks, wraparound takes ~2 years).
 */
export function tickBefore(a: Tick, b: Tick): boolean {
    return a < b;
}

/**
 * Check if tickA is after tickB.
 */
export function tickAfter(a: Tick, b: Tick): boolean {
    return a > b;
}

/**
 * Get the difference between two ticks.
 */
export function tickDiff(a: Tick, b: Tick): number {
    return a - b;
}

/**
 * Advance a tick by a number of steps.
 */
export function tickAdvance(t: Tick, steps: number = 1): Tick {
    return tick(t + steps);
}

/**
 * Clamp a tick to a valid range.
 */
export function tickClamp(t: Tick, min: Tick, max: Tick): Tick {
    return tick(Math.max(min, Math.min(max, t)));
}

/**
 * Linear interpolation between two tick values.
 * Returns a fractional tick (used for rendering interpolation).
 */
export function tickLerp(from: Tick, to: Tick, t: number): number {
    return from + (to - from) * t;
}

/**
 * Calculate the interpolation alpha between two ticks given current time.
 */
export function tickAlpha(fromTick: Tick, toTick: Tick, currentTime: number, fromTime: number): number {
    if (fromTick === toTick) return 1;
    const tickDuration = TICK_MS;
    const elapsed = currentTime - fromTime;
    return Math.min(1, Math.max(0, elapsed / tickDuration));
}

// =============================================================================
// TIMING MEASUREMENT
// =============================================================================

/**
 * Precision timer interface.
 * Abstracts over performance.now() for testability.
 */
export interface PrecisionTimer {
    now(): number;
}

/**
 * Default timer using performance.now().
 */
export const defaultTimer: PrecisionTimer = {
    now: () => typeof performance !== 'undefined' ? performance.now() : Date.now(),
};

/**
 * Timing statistics for monitoring.
 */
export interface TickTimingStats {
    /** Average tick execution time in ms */
    avgTickTime: number;

    /** Maximum tick execution time in ms */
    maxTickTime: number;

    /** Minimum tick execution time in ms */
    minTickTime: number;

    /** Number of ticks measured */
    sampleCount: number;

    /** Number of times we had to catch up */
    catchupCount: number;

    /** Current tick */
    currentTick: Tick;
}

/**
 * Create empty timing stats.
 */
export function createTickTimingStats(): TickTimingStats {
    return {
        avgTickTime: 0,
        maxTickTime: 0,
        minTickTime: Infinity,
        sampleCount: 0,
        catchupCount: 0,
        currentTick: TICK_ZERO,
    };
}

/**
 * Update timing stats with a new sample.
 */
export function updateTickTimingStats(
    stats: TickTimingStats,
    tickTime: number,
    currentTick: Tick,
    wasCatchup: boolean
): void {
    stats.sampleCount++;
    stats.maxTickTime = Math.max(stats.maxTickTime, tickTime);
    stats.minTickTime = Math.min(stats.minTickTime, tickTime);
    stats.avgTickTime = stats.avgTickTime + (tickTime - stats.avgTickTime) / stats.sampleCount;
    stats.currentTick = currentTick;
    if (wasCatchup) stats.catchupCount++;
}
