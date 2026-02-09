/**
 * Game Loop - Fixed Timestep Simulation
 * 
 * The heart of the server-side game simulation.
 * Runs at 60 ticks per second with deterministic execution order.
 */

import {
    SIMULATION,
    type Tick,
    type GameEvent,
} from '@snapshot/shared';
import {
    type World,
    createWorld,
    processPendingRemovals,
} from '@snapshot/shared';

// System imports will be added as we build them
// import { processInputSystem } from '../systems/InputSystem.js';
// import { movementSystem } from '../systems/MovementSystem.js';
// import { abilitySystem } from '../systems/AbilitySystem.js';
// import { weaponSystem } from '../systems/WeaponSystem.js';
// import { combatSystem } from '../systems/CombatSystem.js';

// =============================================================================
// TYPES
// =============================================================================

export interface GameLoopConfig {
    /** Callback when match starts */
    onMatchStart?: (world: World) => void;

    /** Callback when match ends */
    onMatchEnd?: (world: World, winningTeam: number) => void;

    /** Callback when an event occurs */
    onEvent?: (event: GameEvent) => void;

    /** Callback each tick with the world state */
    onTick?: (world: World, events: GameEvent[]) => void;
}

export interface GameLoopState {
    /** Is the game loop running */
    running: boolean;

    /** The game world */
    world: World;

    /** Events generated this tick */
    pendingEvents: GameEvent[];

    /** Last real time the loop ran */
    lastTime: number;

    /** Accumulated time for fixed timestep */
    accumulator: number;

    /** Loop handle for cancellation */
    loopHandle: ReturnType<typeof setInterval> | null;
}

// =============================================================================
// GAME LOOP CLASS
// =============================================================================

export class GameLoop {
    private state: GameLoopState;
    private config: GameLoopConfig;

    constructor(config: GameLoopConfig = {}) {
        this.config = config;
        this.state = {
            running: false,
            world: createWorld(),
            pendingEvents: [],
            lastTime: 0,
            accumulator: 0,
            loopHandle: null,
        };
    }

    /**
     * Get the current game world.
     */
    get world(): World {
        return this.state.world;
    }

    /**
     * Get the current tick.
     */
    get currentTick(): Tick {
        return this.state.world.tick;
    }

    /**
     * Check if the loop is running.
     */
    get isRunning(): boolean {
        return this.state.running;
    }

    /**
     * Start the game loop.
     */
    start(): void {
        if (this.state.running) {
            console.warn('GameLoop: Already running');
            return;
        }

        console.log('GameLoop: Starting simulation at', SIMULATION.TICK_RATE, 'ticks/s');

        this.state.running = true;
        this.state.lastTime = performance.now();
        this.state.accumulator = 0;

        // Use setInterval for consistent tick rate
        // In production, consider using a more precise timer
        this.state.loopHandle = setInterval(() => {
            this.update();
        }, SIMULATION.TICK_MS);

        this.config.onMatchStart?.(this.state.world);
    }

    /**
     * Stop the game loop.
     */
    stop(): void {
        if (!this.state.running) {
            return;
        }

        console.log('GameLoop: Stopping simulation at tick', this.state.world.tick);

        this.state.running = false;

        if (this.state.loopHandle) {
            clearInterval(this.state.loopHandle);
            this.state.loopHandle = null;
        }
    }

    /**
     * Reset the game loop with a fresh world.
     */
    reset(): void {
        this.stop();
        this.state.world = createWorld();
        this.state.pendingEvents = [];
        this.state.accumulator = 0;
    }

    /**
     * Queue an event to be dispatched.
     */
    queueEvent(event: GameEvent): void {
        this.state.pendingEvents.push(event);
    }

    /**
     * Main update function called each interval.
     */
    private update(): void {
        const now = performance.now();
        const deltaTime = now - this.state.lastTime;
        this.state.lastTime = now;

        // Add delta to accumulator
        this.state.accumulator += deltaTime;

        // Cap accumulator to prevent spiral of death
        const maxAccumulator = SIMULATION.TICK_MS * 10;
        if (this.state.accumulator > maxAccumulator) {
            console.warn('GameLoop: Accumulator capped, simulation falling behind');
            this.state.accumulator = maxAccumulator;
        }

        // Run fixed timestep updates
        while (this.state.accumulator >= SIMULATION.TICK_MS) {
            this.tick();
            this.state.accumulator -= SIMULATION.TICK_MS;
        }
    }

    /**
     * Execute a single simulation tick.
     */
    private tick(): void {
        const world = this.state.world;

        // Increment tick
        (world as { tick: Tick }).tick = (world.tick + 1) as Tick;

        // Clear pending events from previous tick
        const events: GameEvent[] = [];

        // ===========================================
        // SYSTEM EXECUTION ORDER (deterministic)
        // ===========================================

        // 1. Process player inputs
        // processInputSystem(world);

        // 2. Update abilities (cooldowns, effects)
        // abilitySystem(world, events);

        // 3. Update weapons (firing, reloading, projectiles)
        // weaponSystem(world, events);

        // 4. Movement system (apply velocities, species traits)
        // movementSystem(world);

        // 5. Physics step (Rapier simulation)
        // physicsStep(world);

        // 6. Combat resolution (damage, deaths, respawns)
        // combatSystem(world, events);

        // 7. Objective updates (capture points, etc.)
        // objectiveSystem(world, events);

        // 8. Process pending entity removals
        const removed = processPendingRemovals(world);
        if (removed.length > 0) {
            // Could emit events for removed entities if needed
        }

        // 9. Collect all events generated this tick
        events.push(...this.state.pendingEvents);
        this.state.pendingEvents = [];

        // Dispatch events
        for (const event of events) {
            this.config.onEvent?.(event);
        }

        // Notify tick complete
        this.config.onTick?.(world, events);
    }

    /**
     * Run a single tick manually (for testing/replays).
     */
    tickManual(): void {
        this.tick();
    }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new game loop instance.
 */
export function createGameLoop(config?: GameLoopConfig): GameLoop {
    return new GameLoop(config);
}
