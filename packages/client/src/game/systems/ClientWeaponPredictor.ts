/**
 * Client Weapon Predictor
 * 
 * Client-side fire prediction for immediate feedback.
 * Creates predicted projectiles that are reconciled with server state.
 */

import type { Vector3, Tick, WeaponId } from '@snapshot/shared';

// =============================================================================
// TYPES
// =============================================================================

export interface PredictedProjectile {
    id: number;
    tick: Tick;
    weaponId: WeaponId;
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    createdAt: number;
    reconciled: boolean;
    authoritativeId?: number;
}

export interface WeaponVisualEffect {
    type: 'muzzle_flash' | 'tracer' | 'impact';
    position: { x: number; y: number; z: number };
    direction?: { x: number; y: number; z: number };
    weaponId: WeaponId;
    timestamp: number;
}

// =============================================================================
// CLIENT WEAPON PREDICTOR
// =============================================================================

export class ClientWeaponPredictor {
    private predictedProjectiles: Map<number, PredictedProjectile> = new Map();
    private nextPredictedId: number = 1;
    private visualEffects: WeaponVisualEffect[] = [];
    private maxEffectAge: number = 500; // ms

    // Settings
    private reconcileThreshold: number = 2.0; // Max position difference to smooth
    private maxPredictedProjectiles: number = 50;

    /**
     * Predict a weapon fire (visual only).
     * Returns predicted projectile ID.
     */
    predictFire(
        weaponId: WeaponId,
        position: Vector3,
        direction: Vector3,
        speed: number,
        tick: Tick
    ): number {
        const id = this.nextPredictedId++;

        const predicted: PredictedProjectile = {
            id,
            tick,
            weaponId,
            position: { ...position },
            velocity: {
                x: direction.x * speed,
                y: direction.y * speed,
                z: direction.z * speed,
            },
            createdAt: performance.now(),
            reconciled: false,
        };

        this.predictedProjectiles.set(id, predicted);

        // Limit predicted projectiles
        if (this.predictedProjectiles.size > this.maxPredictedProjectiles) {
            const oldest = this.getOldestPredicted();
            if (oldest) {
                this.predictedProjectiles.delete(oldest.id);
            }
        }

        // Add muzzle flash effect
        this.addVisualEffect({
            type: 'muzzle_flash',
            position: { ...position },
            direction: { ...direction },
            weaponId,
            timestamp: performance.now(),
        });

        return id;
    }

    /**
     * Predict a hitscan fire (tracer visual).
     */
    predictHitscan(
        weaponId: WeaponId,
        origin: Vector3,
        direction: Vector3,
        maxRange: number,
        hitPoint?: Vector3
    ): void {
        // Add muzzle flash
        this.addVisualEffect({
            type: 'muzzle_flash',
            position: { ...origin },
            direction: { ...direction },
            weaponId,
            timestamp: performance.now(),
        });

        // Add tracer
        this.addVisualEffect({
            type: 'tracer',
            position: { ...origin },
            direction: hitPoint ? {
                x: hitPoint.x - origin.x,
                y: hitPoint.y - origin.y,
                z: hitPoint.z - origin.z,
            } : {
                x: direction.x * maxRange,
                y: direction.y * maxRange,
                z: direction.z * maxRange,
            },
            weaponId,
            timestamp: performance.now(),
        });

        // Add impact effect if hit
        if (hitPoint) {
            this.addVisualEffect({
                type: 'impact',
                position: { ...hitPoint },
                weaponId,
                timestamp: performance.now(),
            });
        }
    }

    /**
     * Reconcile with server projectile spawn.
     */
    reconcileProjectile(
        predictedId: number,
        authoritativePosition: Vector3,
        authoritativeVelocity: Vector3,
        authoritativeEntityId: number
    ): void {
        const predicted = this.predictedProjectiles.get(predictedId);
        if (!predicted) return;

        predicted.reconciled = true;
        predicted.authoritativeId = authoritativeEntityId;

        // Check if we need to correct position
        const dx = authoritativePosition.x - predicted.position.x;
        const dy = authoritativePosition.y - predicted.position.y;
        const dz = authoritativePosition.z - predicted.position.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance > this.reconcileThreshold) {
            // Snap to authoritative position (too far off)
            predicted.position = { ...authoritativePosition };
            predicted.velocity = { ...authoritativeVelocity };
        }
        // Otherwise, keep predicted position for smooth visuals
    }

    /**
     * Find predicted projectile by tick and rough direction.
     */
    findPredictedByTick(tick: Tick, direction: Vector3): PredictedProjectile | undefined {
        for (const [, proj] of this.predictedProjectiles) {
            if (proj.reconciled) continue;
            if (proj.tick !== tick) continue;

            // Check direction similarity (dot product > 0.9)
            const velLen = Math.sqrt(
                proj.velocity.x ** 2 +
                proj.velocity.y ** 2 +
                proj.velocity.z ** 2
            );
            if (velLen < 0.001) continue;

            const dot = (
                proj.velocity.x / velLen * direction.x +
                proj.velocity.y / velLen * direction.y +
                proj.velocity.z / velLen * direction.z
            );

            if (dot > 0.9) {
                return proj;
            }
        }
        return undefined;
    }

    /**
     * Update predicted projectiles.
     */
    update(dt: number): void {
        const gravity = -28.0; // Match movement system

        for (const [id, proj] of this.predictedProjectiles) {
            if (proj.reconciled) continue;

            // Simple physics update
            proj.velocity.y += gravity * dt;
            proj.position.x += proj.velocity.x * dt;
            proj.position.y += proj.velocity.y * dt;
            proj.position.z += proj.velocity.z * dt;

            // Remove old unreconciled projectiles (stale predictions)
            const age = performance.now() - proj.createdAt;
            if (age > 3000) { // 3 seconds max
                this.predictedProjectiles.delete(id);
            }
        }

        // Clean up old visual effects
        const now = performance.now();
        this.visualEffects = this.visualEffects.filter(
            e => now - e.timestamp < this.maxEffectAge
        );
    }

    /**
     * Get all predicted projectiles for rendering.
     */
    getPredictedProjectiles(): PredictedProjectile[] {
        return Array.from(this.predictedProjectiles.values());
    }

    /**
     * Get active visual effects.
     */
    getVisualEffects(): WeaponVisualEffect[] {
        return this.visualEffects;
    }

    /**
     * Remove a predicted projectile (e.g., when hit confirmed).
     */
    removePredicted(id: number): void {
        this.predictedProjectiles.delete(id);
    }

    /**
     * Clear all predictions (e.g., on respawn).
     */
    clear(): void {
        this.predictedProjectiles.clear();
        this.visualEffects = [];
    }

    // =========================================================================
    // PRIVATE
    // =========================================================================

    private addVisualEffect(effect: WeaponVisualEffect): void {
        this.visualEffects.push(effect);
    }

    private getOldestPredicted(): PredictedProjectile | undefined {
        let oldest: PredictedProjectile | undefined;
        for (const [, proj] of this.predictedProjectiles) {
            if (!oldest || proj.createdAt < oldest.createdAt) {
                oldest = proj;
            }
        }
        return oldest;
    }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createClientWeaponPredictor(): ClientWeaponPredictor {
    return new ClientWeaponPredictor();
}
