/**
 * Interpolator - Remote entity interpolation
 * 
 * Smoothly interpolates remote player positions between snapshots
 * to provide smooth visuals despite discrete network updates.
 */

import {
    type Tick,
    type Snapshot,
    type EntityState,
    type EntityId,
    type Vec3,
    type Quat,
    tick,
    TICK_MS,
    INTERPOLATION_DELAY_TICKS,
    SnapshotBuffer,
} from '@snapshot/shared/simulation';

// =============================================================================
// TYPES
// =============================================================================

export interface InterpolatorConfig {
    /** Interpolation delay in ticks */
    delayTicks: number;

    /** Maximum extrapolation time in ticks */
    maxExtrapolationTicks: number;

    /** Entity IDs to exclude from interpolation (e.g., local player) */
    excludeEntityIds: Set<EntityId>;
}

export const DEFAULT_INTERPOLATOR_CONFIG: InterpolatorConfig = {
    delayTicks: INTERPOLATION_DELAY_TICKS,
    maxExtrapolationTicks: 3,
    excludeEntityIds: new Set(),
};

export interface InterpolatedEntity {
    id: EntityId;
    position: Vec3;
    rotation: Quat;
    velocity: Vec3;
    isExtrapolating: boolean;
}

export interface InterpolationState {
    /** Snapshot buffer for interpolation */
    snapshots: SnapshotBuffer;

    /** Current render time in ticks (with fractional part) */
    renderTick: number;

    /** Interpolated entities */
    entities: Map<EntityId, InterpolatedEntity>;
}

// =============================================================================
// INTERPOLATOR
// =============================================================================

export class Interpolator {
    private config: InterpolatorConfig;
    private state: InterpolationState;

    constructor(config: Partial<InterpolatorConfig> = {}) {
        this.config = { ...DEFAULT_INTERPOLATOR_CONFIG, ...config };

        this.state = {
            snapshots: new SnapshotBuffer(32),
            renderTick: 0,
            entities: new Map(),
        };
    }

    /**
     * Push a new snapshot for interpolation.
     */
    pushSnapshot(snapshot: Snapshot): void {
        this.state.snapshots.push(snapshot);
    }

    /**
     * Get interpolated entity state for a given render time.
     */
    getInterpolatedState(
        serverTick: Tick,
        timeSinceLastTick: number
    ): Map<EntityId, InterpolatedEntity> {
        // Calculate render tick (server tick - delay + fractional)
        const fractionalTick = timeSinceLastTick / TICK_MS;
        const renderTick = (serverTick - this.config.delayTicks) + fractionalTick;
        this.state.renderTick = renderTick;

        // Find surrounding snapshots
        const floorTick = tick(Math.floor(renderTick));
        const ceilTick = tick(Math.ceil(renderTick));
        const alpha = renderTick - floorTick;

        const fromSnapshot = this.state.snapshots.get(floorTick);
        const toSnapshot = this.state.snapshots.get(ceilTick);

        // Handle different cases
        if (fromSnapshot && toSnapshot) {
            // Normal interpolation between two snapshots
            this.interpolateBetween(fromSnapshot, toSnapshot, alpha);
        } else if (toSnapshot) {
            // Only have target snapshot, use it directly
            this.useSnapshot(toSnapshot);
        } else if (fromSnapshot) {
            // Only have source snapshot, extrapolate
            this.extrapolateFrom(fromSnapshot, renderTick - floorTick);
        }
        // else: No snapshots available, keep previous state

        return this.state.entities;
    }

    /**
     * Interpolate between two snapshots.
     */
    private interpolateBetween(
        from: Snapshot,
        to: Snapshot,
        alpha: number
    ): void {
        // Build entity maps
        const fromMap = new Map<EntityId, EntityState>();
        const toMap = new Map<EntityId, EntityState>();

        for (const entity of from.entities) {
            fromMap.set(entity.id, entity);
        }
        for (const entity of to.entities) {
            toMap.set(entity.id, entity);
        }

        // Process all entities in target snapshot
        for (const [id, toEntity] of toMap) {
            // Skip excluded entities
            if (this.config.excludeEntityIds.has(id)) continue;

            const fromEntity = fromMap.get(id);

            if (fromEntity) {
                // Interpolate between states
                this.state.entities.set(id, this.interpolateEntity(fromEntity, toEntity, alpha));
            } else {
                // New entity, use target state
                this.state.entities.set(id, this.entityToInterpolated(toEntity, false));
            }
        }

        // Remove entities not in target
        for (const id of this.state.entities.keys()) {
            if (!toMap.has(id)) {
                this.state.entities.delete(id);
            }
        }
    }

    /**
     * Interpolate between two entity states.
     */
    private interpolateEntity(
        from: EntityState,
        to: EntityState,
        alpha: number
    ): InterpolatedEntity {
        const fromPos = from.transform?.position ?? { x: 0, y: 0, z: 0 };
        const toPos = to.transform?.position ?? { x: 0, y: 0, z: 0 };
        const fromRot = from.transform?.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
        const toRot = to.transform?.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
        const toVel = to.physics?.velocity ?? { x: 0, y: 0, z: 0 };

        return {
            id: to.id,
            position: vec3Lerp(fromPos, toPos, alpha),
            rotation: quatSlerp(fromRot, toRot, alpha),
            velocity: toVel,
            isExtrapolating: false,
        };
    }

    /**
     * Use a snapshot directly without interpolation.
     */
    private useSnapshot(snapshot: Snapshot): void {
        for (const entity of snapshot.entities) {
            if (this.config.excludeEntityIds.has(entity.id)) continue;
            this.state.entities.set(entity.id, this.entityToInterpolated(entity, false));
        }
    }

    /**
     * Extrapolate from a snapshot.
     */
    private extrapolateFrom(snapshot: Snapshot, ticksAhead: number): void {
        const dt = ticksAhead * (TICK_MS / 1000);

        for (const entity of snapshot.entities) {
            if (this.config.excludeEntityIds.has(entity.id)) continue;

            // Only extrapolate up to max
            if (ticksAhead > this.config.maxExtrapolationTicks) {
                this.state.entities.set(entity.id, this.entityToInterpolated(entity, true));
                continue;
            }

            // Extrapolate position using velocity
            const pos = entity.transform?.position ?? { x: 0, y: 0, z: 0 };
            const vel = entity.physics?.velocity ?? { x: 0, y: 0, z: 0 };

            const extrapolated: InterpolatedEntity = {
                id: entity.id,
                position: {
                    x: pos.x + vel.x * dt,
                    y: pos.y + vel.y * dt,
                    z: pos.z + vel.z * dt,
                },
                rotation: entity.transform?.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
                velocity: vel,
                isExtrapolating: true,
            };

            this.state.entities.set(entity.id, extrapolated);
        }
    }

    /**
     * Convert EntityState to InterpolatedEntity.
     */
    private entityToInterpolated(entity: EntityState, isExtrapolating: boolean): InterpolatedEntity {
        return {
            id: entity.id,
            position: entity.transform?.position ?? { x: 0, y: 0, z: 0 },
            rotation: entity.transform?.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
            velocity: entity.physics?.velocity ?? { x: 0, y: 0, z: 0 },
            isExtrapolating,
        };
    }

    /**
     * Set entities to exclude from interpolation.
     */
    setExcludedEntities(ids: EntityId[]): void {
        this.config.excludeEntityIds = new Set(ids);
    }

    /**
     * Add an entity to exclusion list.
     */
    excludeEntity(id: EntityId): void {
        this.config.excludeEntityIds.add(id);
        this.state.entities.delete(id);
    }

    /**
     * Remove an entity from exclusion list.
     */
    includeEntity(id: EntityId): void {
        this.config.excludeEntityIds.delete(id);
    }

    /**
     * Get current render tick.
     */
    get renderTick(): number {
        return this.state.renderTick;
    }

    /**
     * Get interpolation delay in ms.
     */
    get delayMs(): number {
        return this.config.delayTicks * TICK_MS;
    }

    /**
     * Clear all state.
     */
    clear(): void {
        this.state.snapshots.clear();
        this.state.entities.clear();
    }
}

// =============================================================================
// MATH HELPERS
// =============================================================================

function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
    };
}

function quatSlerp(a: Quat, b: Quat, t: number): Quat {
    let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

    let bx = b.x, by = b.y, bz = b.z, bw = b.w;
    if (dot < 0) {
        dot = -dot;
        bx = -bx;
        by = -by;
        bz = -bz;
        bw = -bw;
    }

    if (dot > 0.9995) {
        return normalizeQuat({
            x: a.x + (bx - a.x) * t,
            y: a.y + (by - a.y) * t,
            z: a.z + (bz - a.z) * t,
            w: a.w + (bw - a.w) * t,
        });
    }

    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);
    const wa = Math.sin((1 - t) * theta) / sinTheta;
    const wb = Math.sin(t * theta) / sinTheta;

    return {
        x: a.x * wa + bx * wb,
        y: a.y * wa + by * wb,
        z: a.z * wa + bz * wb,
        w: a.w * wa + bw * wb,
    };
}

function normalizeQuat(q: Quat): Quat {
    const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    if (len < 0.0001) return { x: 0, y: 0, z: 0, w: 1 };
    return {
        x: q.x / len,
        y: q.y / len,
        z: q.z / len,
        w: q.w / len,
    };
}

// =============================================================================
// FACTORY
// =============================================================================

export function createInterpolator(config?: Partial<InterpolatorConfig>): Interpolator {
    return new Interpolator(config);
}
