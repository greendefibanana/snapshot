/**
 * Client Ability Preview
 * 
 * Handles ability targeting UI and telegraph previews.
 */

import type { Vector3, AbilityId } from '@snapshot/shared';

// =============================================================================
// TYPES
// =============================================================================

export interface TargetingState {
    isTargeting: boolean;
    abilityId: AbilityId | null;
    targetPosition: Vector3 | null;
    range: number;
    radius: number;
    targetingMode: string;
}

export interface TelegraphPreview {
    type: 'circle' | 'cone' | 'line' | 'cylinder';
    position: Vector3;
    radius: number;
    direction?: Vector3;
    angle?: number;
    height?: number;
    color: string;
    opacity: number;
}

export interface AbilityCast {
    abilityId: AbilityId;
    casterId: number;
    position: Vector3;
    direction?: Vector3;
    startTime: number;
    duration: number;
}

// =============================================================================
// CLIENT ABILITY PREVIEW
// =============================================================================

export class ClientAbilityPreview {
    private targetingState: TargetingState = {
        isTargeting: false,
        abilityId: null,
        targetPosition: null,
        range: 0,
        radius: 0,
        targetingMode: 'instant',
    };

    private activeCasts: Map<number, AbilityCast> = new Map();
    // TODO: Implement preview rendering using activePreviews
    private activePreviews: TelegraphPreview[] = [];

    /**
     * Start targeting mode for an ability.
     */
    startTargeting(
        abilityId: AbilityId,
        range: number,
        radius: number,
        targetingMode: string
    ): void {
        this.targetingState = {
            isTargeting: true,
            abilityId,
            targetPosition: null,
            range,
            radius,
            targetingMode,
        };
    }

    /**
     * Update target position during targeting.
     */
    updateTargetPosition(position: Vector3): void {
        if (!this.targetingState.isTargeting) return;
        this.targetingState.targetPosition = { ...position };
    }

    /**
     * Confirm target and return targeting data.
     */
    confirmTarget(): { abilityId: AbilityId; position: Vector3 } | null {
        if (!this.targetingState.isTargeting || !this.targetingState.targetPosition) {
            return null;
        }

        const result = {
            abilityId: this.targetingState.abilityId!,
            position: this.targetingState.targetPosition,
        };

        this.cancelTargeting();
        return result;
    }

    /**
     * Cancel targeting mode.
     */
    cancelTargeting(): void {
        this.targetingState = {
            isTargeting: false,
            abilityId: null,
            targetPosition: null,
            range: 0,
            radius: 0,
            targetingMode: 'instant',
        };
    }

    /**
     * Handle ability cast started event.
     */
    onAbilityCastStarted(
        casterId: number,
        abilityId: AbilityId,
        position: Vector3,
        direction: Vector3 | undefined,
        duration: number
    ): void {
        const cast: AbilityCast = {
            abilityId,
            casterId,
            position: { ...position },
            direction: direction ? { ...direction } : { x: 0, y: 0, z: 1 },
            startTime: performance.now(),
            duration,
        };
        this.activeCasts.set(casterId, cast);
    }

    /**
     * Handle ability cast completed/cancelled.
     */
    onAbilityCastEnded(casterId: number): void {
        this.activeCasts.delete(casterId);
    }

    /**
     * Get targeting preview for rendering.
     */
    getTargetingPreview(): TelegraphPreview | null {
        if (!this.targetingState.isTargeting || !this.targetingState.targetPosition) {
            return null;
        }

        return {
            type: 'circle',
            position: this.targetingState.targetPosition,
            radius: this.targetingState.radius,
            color: '#00ff00',
            opacity: 0.3,
        };
    }

    /**
     * Get range indicator for rendering.
     */
    getRangeIndicator(casterPosition: Vector3): TelegraphPreview | null {
        if (!this.targetingState.isTargeting) return null;

        return {
            type: 'circle',
            position: casterPosition,
            radius: this.targetingState.range,
            color: '#ffffff',
            opacity: 0.1,
        };
    }

    /**
     * Get active cast previews for rendering.
     */
    getActiveCastPreviews(): TelegraphPreview[] {
        const previews: TelegraphPreview[] = [];
        const now = performance.now();

        for (const [, cast] of this.activeCasts) {
            const elapsed = now - cast.startTime;
            const progress = Math.min(1, elapsed / (cast.duration * 1000));

            previews.push({
                type: 'circle',
                position: cast.position,
                radius: 2, // Placeholder radius
                color: '#ff8800',
                opacity: 0.5 * (1 - progress), // Fade as cast completes
            });
        }

        return previews;
    }

    /**
     * Check if currently in targeting mode.
     */
    isInTargetingMode(): boolean {
        return this.targetingState.isTargeting;
    }

    /**
     * Get current targeting state.
     */
    getTargetingState(): TargetingState {
        return { ...this.targetingState };
    }

    /**
     * Clear all state.
     */
    clear(): void {
        this.cancelTargeting();
        this.activeCasts.clear();
        this.activePreviews = [];
    }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createClientAbilityPreview(): ClientAbilityPreview {
    return new ClientAbilityPreview();
}
