/**
 * Client Hit Feedback System
 * 
 * Handles visual feedback for combat events:
 * - Hit markers (crosshair flash)
 * - Damage numbers
 * - Kill confirmation
 * - Damage direction indicator
 */

// =============================================================================
// TYPES
// =============================================================================

export interface HitMarker {
    damage: number;
    isHeadshot: boolean;
    isKill: boolean;
    timestamp: number;
}

export interface DamageIndicator {
    direction: { x: number; y: number; z: number };
    damage: number;
    timestamp: number;
}

export interface DamageNumber {
    position: { x: number; y: number; z: number };
    damage: number;
    isHeadshot: boolean;
    timestamp: number;
}

// =============================================================================
// CLIENT HIT FEEDBACK
// =============================================================================

export class ClientHitFeedback {
    private hitMarkers: HitMarker[] = [];
    private damageIndicators: DamageIndicator[] = [];
    private damageNumbers: DamageNumber[] = [];

    // Configuration
    private hitMarkerDuration = 200; // ms
    private damageIndicatorDuration = 1500; // ms
    private damageNumberDuration = 1000; // ms

    // State
    private lastKillTime = 0;
    private killStreak = 0;

    /**
     * Process a hit feedback event (attacker receives this).
     */
    onHitFeedback(event: {
        damage: number;
        isHeadshot: boolean;
        isKill: boolean;
        hitPosition: { x: number; y: number; z: number };
    }): void {
        const now = performance.now();

        // Add hit marker
        this.hitMarkers.push({
            damage: event.damage,
            isHeadshot: event.isHeadshot,
            isKill: event.isKill,
            timestamp: now,
        });

        // Add damage number at hit position
        this.damageNumbers.push({
            position: { ...event.hitPosition },
            damage: event.damage,
            isHeadshot: event.isHeadshot,
            timestamp: now,
        });

        // Track kill streak
        if (event.isKill) {
            if (now - this.lastKillTime < 4000) {
                this.killStreak++;
            } else {
                this.killStreak = 1;
            }
            this.lastKillTime = now;
        }
    }

    /**
     * Process a damage taken event (victim receives this).
     */
    onDamageTaken(event: {
        direction: { x: number; y: number; z: number };
        damage: number;
    }): void {
        const now = performance.now();

        // Add damage direction indicator
        this.damageIndicators.push({
            direction: { ...event.direction },
            damage: event.damage,
            timestamp: now,
        });
    }

    /**
     * Update and cleanup old indicators.
     */
    update(): void {
        const now = performance.now();

        // Remove expired hit markers
        this.hitMarkers = this.hitMarkers.filter(
            m => now - m.timestamp < this.hitMarkerDuration
        );

        // Remove expired damage indicators
        this.damageIndicators = this.damageIndicators.filter(
            i => now - i.timestamp < this.damageIndicatorDuration
        );

        // Remove expired damage numbers
        this.damageNumbers = this.damageNumbers.filter(
            n => now - n.timestamp < this.damageNumberDuration
        );
    }

    /**
     * Get active hit markers for rendering.
     */
    getHitMarkers(): HitMarker[] {
        return this.hitMarkers;
    }

    /**
     * Get active damage indicators for rendering.
     */
    getDamageIndicators(): DamageIndicator[] {
        return this.damageIndicators;
    }

    /**
     * Get active damage numbers for rendering.
     */
    getDamageNumbers(): DamageNumber[] {
        return this.damageNumbers;
    }

    /**
     * Check if there's an active hit marker (for crosshair flash).
     */
    hasActiveHit(): boolean {
        return this.hitMarkers.length > 0;
    }

    /**
     * Check if there's an active kill marker.
     */
    hasActiveKill(): boolean {
        return this.hitMarkers.some(m => m.isKill);
    }

    /**
     * Get current kill streak.
     */
    getKillStreak(): number {
        return this.killStreak;
    }

    /**
     * Clear all feedback (e.g., on respawn).
     */
    clear(): void {
        this.hitMarkers = [];
        this.damageIndicators = [];
        this.damageNumbers = [];
        this.killStreak = 0;
    }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createClientHitFeedback(): ClientHitFeedback {
    return new ClientHitFeedback();
}
