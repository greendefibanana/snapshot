/**
 * TickScheduler - High-precision server tick timer
 * 
 * Manages the fixed-timestep simulation loop with drift compensation.
 * Uses setInterval with accumulator pattern to maintain consistent tick rate.
 */

import {
    TICK_RATE,
    TICK_MS,
    MAX_TICKS_PER_FRAME,
    type Tick,
    tick,
    tickAdvance,
    type PrecisionTimer,
    defaultTimer,
    type TickTimingStats,
    createTickTimingStats,
    updateTickTimingStats,
} from '@snapshot/shared/simulation';

// =============================================================================
// TYPES
// =============================================================================

export interface TickSchedulerConfig {
    /** Custom timer (for testing) */
    timer?: PrecisionTimer;

    /** Callback for each tick */
    onTick: (tick: Tick, deltaMs: number) => void;

    /** Callback when ticks are skipped due to lag */
    onTicksSkipped?: (count: number) => void;

    /** Callback for timing stats (called every second) */
    onStats?: (stats: TickTimingStats) => void;
}

export interface TickSchedulerState {
    /** Is scheduler running */
    running: boolean;

    /** Current tick number */
    currentTick: Tick;

    /** Accumulated time since last tick */
    accumulator: number;

    /** Last timestamp from timer */
    lastTime: number;

    /** Interval handle */
    intervalHandle: ReturnType<typeof setInterval> | null;

    /** Timing statistics */
    stats: TickTimingStats;

    /** Time of last stats report */
    lastStatsTime: number;
}

// =============================================================================
// TICK SCHEDULER
// =============================================================================

export class TickScheduler {
    private config: Required<TickSchedulerConfig>;
    private state: TickSchedulerState;
    private timer: PrecisionTimer;

    constructor(config: TickSchedulerConfig) {
        this.timer = config.timer ?? defaultTimer;

        this.config = {
            timer: this.timer,
            onTick: config.onTick,
            onTicksSkipped: config.onTicksSkipped ?? (() => { }),
            onStats: config.onStats ?? (() => { }),
        };

        this.state = {
            running: false,
            currentTick: tick(0),
            accumulator: 0,
            lastTime: 0,
            intervalHandle: null,
            stats: createTickTimingStats(),
            lastStatsTime: 0,
        };
    }

    /**
     * Get current tick.
     */
    get currentTick(): Tick {
        return this.state.currentTick;
    }

    /**
     * Check if scheduler is running.
     */
    get isRunning(): boolean {
        return this.state.running;
    }

    /**
     * Get timing statistics.
     */
    get stats(): TickTimingStats {
        return { ...this.state.stats };
    }

    /**
     * Start the tick scheduler.
     */
    start(initialTick: Tick = tick(0)): void {
        if (this.state.running) {
            console.warn('TickScheduler: Already running');
            return;
        }

        this.state.currentTick = initialTick;
        this.state.running = true;
        this.state.lastTime = this.timer.now();
        this.state.accumulator = 0;
        this.state.stats = createTickTimingStats();
        this.state.lastStatsTime = this.state.lastTime;

        // Use setInterval at slightly faster rate to ensure we don't miss ticks
        // The accumulator pattern handles actual timing
        const intervalMs = Math.floor(TICK_MS * 0.9);

        this.state.intervalHandle = setInterval(() => {
            this.update();
        }, intervalMs);

        console.log(`TickScheduler: Started at tick ${initialTick}, ${TICK_RATE}Hz`);
    }

    /**
     * Stop the tick scheduler.
     */
    stop(): void {
        if (!this.state.running) {
            return;
        }

        this.state.running = false;

        if (this.state.intervalHandle) {
            clearInterval(this.state.intervalHandle);
            this.state.intervalHandle = null;
        }

        console.log(`TickScheduler: Stopped at tick ${this.state.currentTick}`);
    }

    /**
     * Reset the scheduler.
     */
    reset(initialTick: Tick = tick(0)): void {
        this.stop();
        this.state.currentTick = initialTick;
        this.state.accumulator = 0;
        this.state.stats = createTickTimingStats();
    }

    /**
     * Manually advance a single tick (for testing/replay).
     */
    manualTick(): void {
        this.executeTick(TICK_MS, false);
    }

    /**
     * Update loop called by setInterval.
     */
    private update(): void {
        const now = this.timer.now();
        const deltaMs = now - this.state.lastTime;
        this.state.lastTime = now;

        // Add to accumulator
        this.state.accumulator += deltaMs;

        // Cap accumulator to prevent death spiral
        const maxAccumulator = TICK_MS * MAX_TICKS_PER_FRAME;
        if (this.state.accumulator > maxAccumulator) {
            const skipped = Math.floor((this.state.accumulator - maxAccumulator) / TICK_MS);
            this.config.onTicksSkipped(skipped);
            this.state.accumulator = maxAccumulator;
            this.state.stats.catchupCount++;
        }

        // Execute ticks
        let ticksThisFrame = 0;
        while (this.state.accumulator >= TICK_MS && ticksThisFrame < MAX_TICKS_PER_FRAME) {
            const tickStart = this.timer.now();

            this.executeTick(TICK_MS, ticksThisFrame > 0);

            const tickDuration = this.timer.now() - tickStart;
            updateTickTimingStats(
                this.state.stats,
                tickDuration,
                this.state.currentTick,
                ticksThisFrame > 0
            );

            this.state.accumulator -= TICK_MS;
            ticksThisFrame++;
        }

        // Report stats every second
        if (now - this.state.lastStatsTime >= 1000) {
            this.config.onStats(this.state.stats);
            this.state.lastStatsTime = now;
        }
    }

    /**
     * Execute a single tick.
     */
    private executeTick(deltaMs: number, isCatchup: boolean): void {
        this.state.currentTick = tickAdvance(this.state.currentTick);
        this.config.onTick(this.state.currentTick, deltaMs);
    }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new tick scheduler.
 */
export function createTickScheduler(config: TickSchedulerConfig): TickScheduler {
    return new TickScheduler(config);
}
