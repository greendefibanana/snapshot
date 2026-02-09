/**
 * Ability - Ability cooldown and charge component
 * 
 * Tracks tactical ability cooldown and ultimate charge.
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Ability component.
 * 24 bytes when serialized.
 */
export interface Ability {
    /** Tactical ability ID */
    tacticalId: number;

    /** Ultimate ability ID */
    ultimateId: number;

    /** Tick when tactical is ready (0 = ready now) */
    tacticalReadyTick: number;

    /** Tactical cooldown duration in ticks */
    tacticalCooldown: number;

    /** Tactical charges remaining */
    tacticalCharges: number;

    /** Maximum tactical charges */
    maxTacticalCharges: number;

    /** Ultimate charge (0-100) */
    ultimateCharge: number;

    /** Is ultimate currently active */
    ultimateActive: boolean;

    /** Tick when ultimate ends (if active) */
    ultimateEndTick: number;
}

/**
 * Create default ability state.
 */
export function createAbility(
    tacticalId: number,
    ultimateId: number,
    tacticalCooldown: number = 600, // 10 seconds
    maxCharges: number = 1
): Ability {
    return {
        tacticalId,
        ultimateId,
        tacticalReadyTick: 0,
        tacticalCooldown,
        tacticalCharges: maxCharges,
        maxTacticalCharges: maxCharges,
        ultimateCharge: 0,
        ultimateActive: false,
        ultimateEndTick: 0,
    };
}

/**
 * Clone ability.
 */
export function cloneAbility(a: Ability): Ability {
    return { ...a };
}

// =============================================================================
// ABILITY POOL (SOA)
// =============================================================================

/**
 * SOA pool for ability components.
 */
export class AbilityPool {
    readonly tacticalId: Uint8Array;
    readonly ultimateId: Uint8Array;
    readonly tacticalReadyTick: Uint32Array;
    readonly tacticalCooldown: Uint16Array;
    readonly tacticalCharges: Uint8Array;
    readonly maxTacticalCharges: Uint8Array;
    readonly ultimateCharge: Float32Array;
    readonly ultimateActive: Uint8Array;
    readonly ultimateEndTick: Uint32Array;

    readonly capacity: number;

    constructor(capacity: number) {
        this.capacity = capacity;
        this.tacticalId = new Uint8Array(capacity);
        this.ultimateId = new Uint8Array(capacity);
        this.tacticalReadyTick = new Uint32Array(capacity);
        this.tacticalCooldown = new Uint16Array(capacity);
        this.tacticalCharges = new Uint8Array(capacity);
        this.maxTacticalCharges = new Uint8Array(capacity);
        this.ultimateCharge = new Float32Array(capacity);
        this.ultimateActive = new Uint8Array(capacity);
        this.ultimateEndTick = new Uint32Array(capacity);
    }

    /**
     * Get ability at slot.
     */
    get(slot: number): Ability {
        return {
            tacticalId: this.tacticalId[slot]!,
            ultimateId: this.ultimateId[slot]!,
            tacticalReadyTick: this.tacticalReadyTick[slot]!,
            tacticalCooldown: this.tacticalCooldown[slot]!,
            tacticalCharges: this.tacticalCharges[slot]!,
            maxTacticalCharges: this.maxTacticalCharges[slot]!,
            ultimateCharge: this.ultimateCharge[slot]!,
            ultimateActive: this.ultimateActive[slot] === 1,
            ultimateEndTick: this.ultimateEndTick[slot]!,
        };
    }

    /**
     * Set ability at slot.
     */
    set(slot: number, a: Ability): void {
        this.tacticalId[slot] = a.tacticalId;
        this.ultimateId[slot] = a.ultimateId;
        this.tacticalReadyTick[slot] = a.tacticalReadyTick;
        this.tacticalCooldown[slot] = a.tacticalCooldown;
        this.tacticalCharges[slot] = a.tacticalCharges;
        this.maxTacticalCharges[slot] = a.maxTacticalCharges;
        this.ultimateCharge[slot] = a.ultimateCharge;
        this.ultimateActive[slot] = a.ultimateActive ? 1 : 0;
        this.ultimateEndTick[slot] = a.ultimateEndTick;
    }

    /**
     * Check if tactical is ready.
     */
    isTacticalReady(slot: number, currentTick: number): boolean {
        return this.tacticalCharges[slot]! > 0 && currentTick >= this.tacticalReadyTick[slot]!;
    }

    /**
     * Use tactical ability.
     */
    useTactical(slot: number, currentTick: number): boolean {
        if (!this.isTacticalReady(slot, currentTick)) return false;

        this.tacticalCharges[slot]--;

        // Start cooldown if all charges used
        if (this.tacticalCharges[slot]! <= 0) {
            this.tacticalReadyTick[slot] = currentTick + this.tacticalCooldown[slot]!;
        }

        return true;
    }

    /**
     * Update tactical cooldown (call each tick).
     */
    updateTactical(slot: number, currentTick: number): void {
        // Regenerate charges when cooldown is up
        if (
            this.tacticalCharges[slot]! < this.maxTacticalCharges[slot]! &&
            currentTick >= this.tacticalReadyTick[slot]!
        ) {
            this.tacticalCharges[slot]++;

            // Set cooldown for next charge if not at max
            if (this.tacticalCharges[slot]! < this.maxTacticalCharges[slot]!) {
                this.tacticalReadyTick[slot] = currentTick + this.tacticalCooldown[slot]!;
            }
        }
    }

    /**
     * Check if ultimate is ready.
     */
    isUltimateReady(slot: number): boolean {
        return this.ultimateCharge[slot]! >= 100 && this.ultimateActive[slot] === 0;
    }

    /**
     * Use ultimate ability.
     */
    useUltimate(slot: number, currentTick: number, duration: number): boolean {
        if (!this.isUltimateReady(slot)) return false;

        this.ultimateCharge[slot] = 0;
        this.ultimateActive[slot] = 1;
        this.ultimateEndTick[slot] = currentTick + duration;

        return true;
    }

    /**
     * Update ultimate state (call each tick).
     */
    updateUltimate(slot: number, currentTick: number): void {
        if (this.ultimateActive[slot] === 1 && currentTick >= this.ultimateEndTick[slot]!) {
            this.ultimateActive[slot] = 0;
        }
    }

    /**
     * Add ultimate charge.
     */
    addUltimateCharge(slot: number, amount: number): void {
        if (this.ultimateActive[slot] === 1) return; // Can't charge while active
        this.ultimateCharge[slot] = Math.min(100, this.ultimateCharge[slot]! + amount);
    }

    /**
     * Get tactical cooldown progress (0-1, 1 = ready).
     */
    getTacticalProgress(slot: number, currentTick: number): number {
        if (this.tacticalCharges[slot]! >= this.maxTacticalCharges[slot]!) return 1;

        const cooldown = this.tacticalCooldown[slot]!;
        if (cooldown <= 0) return 1;

        const remaining = this.tacticalReadyTick[slot]! - currentTick;
        if (remaining <= 0) return 1;

        return 1 - (remaining / cooldown);
    }

    /**
     * Reset ability state.
     */
    reset(slot: number, tacticalId: number, ultimateId: number, cooldown: number, maxCharges: number): void {
        this.tacticalId[slot] = tacticalId;
        this.ultimateId[slot] = ultimateId;
        this.tacticalReadyTick[slot] = 0;
        this.tacticalCooldown[slot] = cooldown;
        this.tacticalCharges[slot] = maxCharges;
        this.maxTacticalCharges[slot] = maxCharges;
        this.ultimateCharge[slot] = 0;
        this.ultimateActive[slot] = 0;
        this.ultimateEndTick[slot] = 0;
    }

    /**
     * Copy ability from one slot to another.
     */
    copy(destSlot: number, srcSlot: number): void {
        this.tacticalId[destSlot] = this.tacticalId[srcSlot]!;
        this.ultimateId[destSlot] = this.ultimateId[srcSlot]!;
        this.tacticalReadyTick[destSlot] = this.tacticalReadyTick[srcSlot]!;
        this.tacticalCooldown[destSlot] = this.tacticalCooldown[srcSlot]!;
        this.tacticalCharges[destSlot] = this.tacticalCharges[srcSlot]!;
        this.maxTacticalCharges[destSlot] = this.maxTacticalCharges[srcSlot]!;
        this.ultimateCharge[destSlot] = this.ultimateCharge[srcSlot]!;
        this.ultimateActive[destSlot] = this.ultimateActive[srcSlot]!;
        this.ultimateEndTick[destSlot] = this.ultimateEndTick[srcSlot]!;
    }
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Byte size of serialized ability.
 */
export const ABILITY_SIZE = 24;

/**
 * Serialize ability to a DataView.
 */
export function writeAbility(view: DataView, offset: number, a: Ability): number {
    view.setUint8(offset, a.tacticalId);
    view.setUint8(offset + 1, a.ultimateId);
    view.setUint8(offset + 2, a.tacticalCharges);
    view.setUint8(offset + 3, a.maxTacticalCharges);
    view.setUint32(offset + 4, a.tacticalReadyTick, true);
    view.setUint16(offset + 8, a.tacticalCooldown, true);
    view.setUint8(offset + 10, a.ultimateActive ? 1 : 0);
    view.setUint8(offset + 11, 0); // padding
    view.setFloat32(offset + 12, a.ultimateCharge, true);
    view.setUint32(offset + 16, a.ultimateEndTick, true);
    view.setUint32(offset + 20, 0, true); // padding
    return ABILITY_SIZE;
}

/**
 * Deserialize ability from a DataView.
 */
export function readAbility(view: DataView, offset: number): Ability {
    return {
        tacticalId: view.getUint8(offset),
        ultimateId: view.getUint8(offset + 1),
        tacticalCharges: view.getUint8(offset + 2),
        maxTacticalCharges: view.getUint8(offset + 3),
        tacticalReadyTick: view.getUint32(offset + 4, true),
        tacticalCooldown: view.getUint16(offset + 8, true),
        ultimateActive: view.getUint8(offset + 10) === 1,
        ultimateCharge: view.getFloat32(offset + 12, true),
        ultimateEndTick: view.getUint32(offset + 16, true),
    };
}
