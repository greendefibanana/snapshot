/**
 * Weapon - Weapon state component
 * 
 * Tracks ammo, reload state, and fire timing.
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Weapon component.
 * 32 bytes when serialized.
 */
export interface Weapon {
    /** Equipped weapon ID */
    weaponId: number;

    /** Current slot (0-2) */
    activeSlot: number;

    /** Current ammo in magazine */
    ammo: number;

    /** Maximum ammo per magazine */
    maxAmmo: number;

    /** Reserve ammo */
    reserveAmmo: number;

    /** Is currently reloading */
    isReloading: boolean;

    /** Tick when reload completes */
    reloadEndTick: number;

    /** Tick when weapon can fire again */
    nextFireTick: number;

    /** Consecutive shots fired (for spread calculation) */
    consecutiveShots: number;

    /** Last fire tick (for spread recovery) */
    lastFireTick: number;
}

/**
 * Create default weapon state.
 */
export function createWeapon(weaponId: number, maxAmmo: number): Weapon {
    return {
        weaponId,
        activeSlot: 0,
        ammo: maxAmmo,
        maxAmmo,
        reserveAmmo: maxAmmo * 3,
        isReloading: false,
        reloadEndTick: 0,
        nextFireTick: 0,
        consecutiveShots: 0,
        lastFireTick: 0,
    };
}

/**
 * Clone weapon.
 */
export function cloneWeapon(w: Weapon): Weapon {
    return { ...w };
}

// =============================================================================
// WEAPON POOL (SOA)
// =============================================================================

/**
 * SOA pool for weapon components.
 */
export class WeaponPool {
    readonly weaponId: Uint8Array;
    readonly activeSlot: Uint8Array;
    readonly ammo: Uint16Array;
    readonly maxAmmo: Uint16Array;
    readonly reserveAmmo: Uint16Array;
    readonly isReloading: Uint8Array;
    readonly reloadEndTick: Uint32Array;
    readonly nextFireTick: Uint32Array;
    readonly consecutiveShots: Uint8Array;
    readonly lastFireTick: Uint32Array;

    readonly capacity: number;

    constructor(capacity: number) {
        this.capacity = capacity;
        this.weaponId = new Uint8Array(capacity);
        this.activeSlot = new Uint8Array(capacity);
        this.ammo = new Uint16Array(capacity);
        this.maxAmmo = new Uint16Array(capacity);
        this.reserveAmmo = new Uint16Array(capacity);
        this.isReloading = new Uint8Array(capacity);
        this.reloadEndTick = new Uint32Array(capacity);
        this.nextFireTick = new Uint32Array(capacity);
        this.consecutiveShots = new Uint8Array(capacity);
        this.lastFireTick = new Uint32Array(capacity);
    }

    /**
     * Get weapon at slot.
     */
    get(slot: number): Weapon {
        return {
            weaponId: this.weaponId[slot]!,
            activeSlot: this.activeSlot[slot]!,
            ammo: this.ammo[slot]!,
            maxAmmo: this.maxAmmo[slot]!,
            reserveAmmo: this.reserveAmmo[slot]!,
            isReloading: this.isReloading[slot] === 1,
            reloadEndTick: this.reloadEndTick[slot]!,
            nextFireTick: this.nextFireTick[slot]!,
            consecutiveShots: this.consecutiveShots[slot]!,
            lastFireTick: this.lastFireTick[slot]!,
        };
    }

    /**
     * Set weapon at slot.
     */
    set(slot: number, w: Weapon): void {
        this.weaponId[slot] = w.weaponId;
        this.activeSlot[slot] = w.activeSlot;
        this.ammo[slot] = w.ammo;
        this.maxAmmo[slot] = w.maxAmmo;
        this.reserveAmmo[slot] = w.reserveAmmo;
        this.isReloading[slot] = w.isReloading ? 1 : 0;
        this.reloadEndTick[slot] = w.reloadEndTick;
        this.nextFireTick[slot] = w.nextFireTick;
        this.consecutiveShots[slot] = w.consecutiveShots;
        this.lastFireTick[slot] = w.lastFireTick;
    }

    /**
     * Check if weapon can fire.
     */
    canFire(slot: number, currentTick: number): boolean {
        if (this.isReloading[slot] === 1) return false;
        if (this.ammo[slot]! <= 0) return false;
        if (currentTick < this.nextFireTick[slot]!) return false;
        return true;
    }

    /**
     * Fire the weapon.
     */
    fire(slot: number, currentTick: number, fireCooldown: number): boolean {
        if (!this.canFire(slot, currentTick)) return false;

        this.ammo[slot]--;
        this.nextFireTick[slot] = currentTick + fireCooldown;
        this.consecutiveShots[slot]++;
        this.lastFireTick[slot] = currentTick;

        return true;
    }

    /**
     * Start reloading.
     */
    startReload(slot: number, currentTick: number, reloadDuration: number): boolean {
        if (this.isReloading[slot] === 1) return false;
        if (this.ammo[slot]! >= this.maxAmmo[slot]!) return false;
        if (this.reserveAmmo[slot]! <= 0) return false;

        this.isReloading[slot] = 1;
        this.reloadEndTick[slot] = currentTick + reloadDuration;
        this.consecutiveShots[slot] = 0;

        return true;
    }

    /**
     * Complete reload.
     */
    completeReload(slot: number): void {
        if (this.isReloading[slot] !== 1) return;

        const ammoNeeded = this.maxAmmo[slot]! - this.ammo[slot]!;
        const ammoToAdd = Math.min(ammoNeeded, this.reserveAmmo[slot]!);

        this.ammo[slot] += ammoToAdd;
        this.reserveAmmo[slot] -= ammoToAdd;
        this.isReloading[slot] = 0;
    }

    /**
     * Cancel reload.
     */
    cancelReload(slot: number): void {
        this.isReloading[slot] = 0;
    }

    /**
     * Check if reload is complete.
     */
    isReloadComplete(slot: number, currentTick: number): boolean {
        return this.isReloading[slot] === 1 && currentTick >= this.reloadEndTick[slot]!;
    }

    /**
     * Get ammo percentage.
     */
    getAmmoPercent(slot: number): number {
        const max = this.maxAmmo[slot]!;
        if (max <= 0) return 0;
        return this.ammo[slot]! / max;
    }

    /**
     * Reset weapon state.
     */
    reset(slot: number, weaponId: number, maxAmmo: number): void {
        this.weaponId[slot] = weaponId;
        this.activeSlot[slot] = 0;
        this.ammo[slot] = maxAmmo;
        this.maxAmmo[slot] = maxAmmo;
        this.reserveAmmo[slot] = maxAmmo * 3;
        this.isReloading[slot] = 0;
        this.reloadEndTick[slot] = 0;
        this.nextFireTick[slot] = 0;
        this.consecutiveShots[slot] = 0;
        this.lastFireTick[slot] = 0;
    }

    /**
     * Copy weapon from one slot to another.
     */
    copy(destSlot: number, srcSlot: number): void {
        this.weaponId[destSlot] = this.weaponId[srcSlot]!;
        this.activeSlot[destSlot] = this.activeSlot[srcSlot]!;
        this.ammo[destSlot] = this.ammo[srcSlot]!;
        this.maxAmmo[destSlot] = this.maxAmmo[srcSlot]!;
        this.reserveAmmo[destSlot] = this.reserveAmmo[srcSlot]!;
        this.isReloading[destSlot] = this.isReloading[srcSlot]!;
        this.reloadEndTick[destSlot] = this.reloadEndTick[srcSlot]!;
        this.nextFireTick[destSlot] = this.nextFireTick[srcSlot]!;
        this.consecutiveShots[destSlot] = this.consecutiveShots[srcSlot]!;
        this.lastFireTick[destSlot] = this.lastFireTick[srcSlot]!;
    }
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Byte size of serialized weapon.
 */
export const WEAPON_SIZE = 32;

/**
 * Serialize weapon to a DataView.
 */
export function writeWeapon(view: DataView, offset: number, w: Weapon): number {
    view.setUint8(offset, w.weaponId);
    view.setUint8(offset + 1, w.activeSlot);
    view.setUint16(offset + 2, w.ammo, true);
    view.setUint16(offset + 4, w.maxAmmo, true);
    view.setUint16(offset + 6, w.reserveAmmo, true);
    view.setUint8(offset + 8, w.isReloading ? 1 : 0);
    view.setUint8(offset + 9, w.consecutiveShots);
    view.setUint16(offset + 10, 0, true); // padding
    view.setUint32(offset + 12, w.reloadEndTick, true);
    view.setUint32(offset + 16, w.nextFireTick, true);
    view.setUint32(offset + 20, w.lastFireTick, true);
    view.setUint32(offset + 24, 0, true); // padding
    view.setUint32(offset + 28, 0, true); // padding
    return WEAPON_SIZE;
}

/**
 * Deserialize weapon from a DataView.
 */
export function readWeapon(view: DataView, offset: number): Weapon {
    return {
        weaponId: view.getUint8(offset),
        activeSlot: view.getUint8(offset + 1),
        ammo: view.getUint16(offset + 2, true),
        maxAmmo: view.getUint16(offset + 4, true),
        reserveAmmo: view.getUint16(offset + 6, true),
        isReloading: view.getUint8(offset + 8) === 1,
        consecutiveShots: view.getUint8(offset + 9),
        reloadEndTick: view.getUint32(offset + 12, true),
        nextFireTick: view.getUint32(offset + 16, true),
        lastFireTick: view.getUint32(offset + 20, true),
    };
}
