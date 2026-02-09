/**
 * PredictionLoop - Client-side prediction
 * 
 * Runs a local simulation using unacknowledged inputs.
 * Provides immediate response while waiting for server confirmation.
 */

import {
    type Tick,
    type Snapshot,
    type EntityId,
    type InputFrame,
    type Vec3,
    type Quat,
    tick,
    TICK_DELTA,
    InputBuffer,
} from '@snapshot/shared/simulation';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Predicted entity state.
 */
export interface PredictedEntity {
    id: EntityId;
    position: Vec3;
    velocity: Vec3;
    rotation: Quat;
    isGrounded: boolean;
}

/**
 * Prediction state.
 */
export interface PredictionState {
    /** Last confirmed server tick */
    confirmedTick: Tick;

    /** Last confirmed snapshot */
    confirmedSnapshot: Snapshot | null;

    /** Current predicted tick */
    predictedTick: Tick;

    /** Predicted local player state */
    predictedPlayer: PredictedEntity | null;

    /** Unacknowledged inputs */
    pendingInputs: InputBuffer;
}

export interface PredictionConfig {
    /** Local player entity ID */
    localPlayerId: EntityId;

    /** Simulation config */
    moveSpeed?: number;
    jumpVelocity?: number;
    gravity?: number;
    friction?: number;
}

const DEFAULT_PREDICTION_CONFIG = {
    moveSpeed: 7,
    jumpVelocity: 10,
    gravity: -30,
    friction: 0.9,
};

// =============================================================================
// PREDICTION LOOP
// =============================================================================

export class PredictionLoop {
    private state: PredictionState;
    private config: Required<PredictionConfig>;

    constructor(config: PredictionConfig) {
        this.config = {
            localPlayerId: config.localPlayerId,
            moveSpeed: config.moveSpeed ?? DEFAULT_PREDICTION_CONFIG.moveSpeed,
            jumpVelocity: config.jumpVelocity ?? DEFAULT_PREDICTION_CONFIG.jumpVelocity,
            gravity: config.gravity ?? DEFAULT_PREDICTION_CONFIG.gravity,
            friction: config.friction ?? DEFAULT_PREDICTION_CONFIG.friction,
        };

        this.state = {
            confirmedTick: tick(0),
            confirmedSnapshot: null,
            predictedTick: tick(0),
            predictedPlayer: null,
            pendingInputs: new InputBuffer(128),
        };
    }

    /**
     * Get current predicted state.
     */
    get predictedPlayer(): PredictedEntity | null {
        return this.state.predictedPlayer;
    }

    /**
     * Get current predicted tick.
     */
    get predictedTick(): Tick {
        return this.state.predictedTick;
    }

    /**
     * Get pending input count.
     */
    get pendingInputCount(): number {
        return this.state.pendingInputs.size;
    }

    /**
     * Record a new input (for prediction replay).
     */
    recordInput(input: InputFrame): void {
        this.state.pendingInputs.push(input);
    }

    /**
     * Apply a new input immediately (local prediction).
     */
    applyInput(input: InputFrame): void {
        if (!this.state.predictedPlayer) return;

        this.simulateInput(this.state.predictedPlayer, input);
        this.state.predictedTick = input.tick;
    }

    /**
     * Process a server snapshot.
     * This is called when we receive authoritative state from server.
     */
    processServerSnapshot(snapshot: Snapshot, lastProcessedInputSeq: number): void {
        // Find local player in snapshot
        const localPlayerState = snapshot.entities.find(
            e => e.player?.playerId !== undefined // In real impl, match against local player ID
        );

        if (!localPlayerState) {
            console.warn('PredictionLoop: Local player not found in snapshot');
            return;
        }

        // Update confirmed state
        this.state.confirmedTick = snapshot.tick;
        this.state.confirmedSnapshot = snapshot;

        // Prune acknowledged inputs
        this.state.pendingInputs.pruneUpToSequence(lastProcessedInputSeq);

        // Extract confirmed player state
        const confirmedPlayer: PredictedEntity = {
            id: localPlayerState.id,
            position: localPlayerState.transform?.position ?? { x: 0, y: 0, z: 0 },
            velocity: localPlayerState.physics?.velocity ?? { x: 0, y: 0, z: 0 },
            rotation: localPlayerState.transform?.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
            isGrounded: localPlayerState.physics?.isGrounded ?? true,
        };

        // Re-simulate from confirmed state with pending inputs
        this.resimulate(confirmedPlayer);
    }

    /**
     * Re-simulate from confirmed state with pending inputs.
     */
    private resimulate(confirmedPlayer: PredictedEntity): void {
        // Start from confirmed state
        this.state.predictedPlayer = { ...confirmedPlayer };

        // Get all pending inputs sorted by tick
        const pendingInputs = this.state.pendingInputs.toArray();

        // Re-apply each pending input
        for (const input of pendingInputs) {
            if (input.tick > this.state.confirmedTick) {
                this.simulateInput(this.state.predictedPlayer, input);
            }
        }

        // Update predicted tick
        if (pendingInputs.length > 0) {
            this.state.predictedTick = pendingInputs[pendingInputs.length - 1]!.tick;
        } else {
            this.state.predictedTick = this.state.confirmedTick;
        }
    }

    /**
     * Simulate a single input on an entity.
     */
    private simulateInput(entity: PredictedEntity, input: InputFrame): void {
        const speed = this.config.moveSpeed * TICK_DELTA;

        // Calculate movement direction from aim
        const yaw = input.aim.yaw;
        const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
        const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };

        // Accumulate movement
        let moveX = 0;
        let moveZ = 0;

        if (input.movement.forward) {
            moveX += forward.x;
            moveZ += forward.z;
        }
        if (input.movement.backward) {
            moveX -= forward.x;
            moveZ -= forward.z;
        }
        if (input.movement.right) {
            moveX += right.x;
            moveZ += right.z;
        }
        if (input.movement.left) {
            moveX -= right.x;
            moveZ -= right.z;
        }

        // Normalize diagonal movement
        const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (moveLen > 0.001) {
            moveX = (moveX / moveLen) * speed;
            moveZ = (moveZ / moveLen) * speed;
        }

        // Apply sprint
        if (input.movement.sprint) {
            moveX *= 1.4;
            moveZ *= 1.4;
        }

        // Set velocity
        entity.velocity.x = moveX / TICK_DELTA;
        entity.velocity.z = moveZ / TICK_DELTA;

        // Handle jump
        if (input.movement.jump && entity.isGrounded) {
            entity.velocity.y = this.config.jumpVelocity;
            entity.isGrounded = false;
        }

        // Apply gravity
        if (!entity.isGrounded) {
            entity.velocity.y += this.config.gravity * TICK_DELTA;
        }

        // Apply friction
        if (entity.isGrounded) {
            entity.velocity.x *= this.config.friction;
            entity.velocity.z *= this.config.friction;
        }

        // Integrate velocity
        entity.position.x += entity.velocity.x * TICK_DELTA;
        entity.position.y += entity.velocity.y * TICK_DELTA;
        entity.position.z += entity.velocity.z * TICK_DELTA;

        // Ground collision
        if (entity.position.y <= 0) {
            entity.position.y = 0;
            entity.velocity.y = 0;
            entity.isGrounded = true;
        }

        // Update rotation
        entity.rotation = quaternionFromYaw(yaw);
    }

    /**
     * Initialize prediction with server state.
     */
    initialize(snapshot: Snapshot, localEntityId: EntityId): void {
        const entity = snapshot.entities.find(e => e.id === localEntityId);
        if (!entity) {
            console.error('PredictionLoop: Could not find local entity in snapshot');
            return;
        }

        this.state.confirmedTick = snapshot.tick;
        this.state.confirmedSnapshot = snapshot;
        this.state.predictedTick = snapshot.tick;

        this.state.predictedPlayer = {
            id: entity.id,
            position: entity.transform?.position ?? { x: 0, y: 0, z: 0 },
            velocity: entity.physics?.velocity ?? { x: 0, y: 0, z: 0 },
            rotation: entity.transform?.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
            isGrounded: entity.physics?.isGrounded ?? true,
        };
    }

    /**
     * Clear prediction state.
     */
    clear(): void {
        this.state.confirmedSnapshot = null;
        this.state.predictedPlayer = null;
        this.state.pendingInputs.clear();
    }
}

// =============================================================================
// HELPERS
// =============================================================================

function quaternionFromYaw(yaw: number): Quat {
    const halfYaw = yaw * 0.5;
    return {
        x: 0,
        y: Math.sin(halfYaw),
        z: 0,
        w: Math.cos(halfYaw),
    };
}

// =============================================================================
// FACTORY
// =============================================================================

export function createPredictionLoop(config: PredictionConfig): PredictionLoop {
    return new PredictionLoop(config);
}
