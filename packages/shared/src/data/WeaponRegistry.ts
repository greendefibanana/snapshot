/**
 * Weapon Registry
 * 
 * Hot-reloadable weapon definition store with versioning.
 * Allows live balance patches without restart.
 */

import type { WeaponId, WeaponDefinition, WeaponStats } from '../types/weapons.js';

// =============================================================================
// TYPES
// =============================================================================

export interface WeaponPatch {
    weaponId: WeaponId;
    stats?: Partial<WeaponStats>;
    // Other patchable fields can be added here
}

export interface BalancePatch {
    version: string;
    date: string;
    changes: WeaponPatch[];
}

type WeaponChangeListener = (weaponId: WeaponId, definition: WeaponDefinition) => void;

// =============================================================================
// WEAPON REGISTRY
// =============================================================================

class WeaponRegistryImpl {
    private weapons: Map<WeaponId, WeaponDefinition> = new Map();
    private version: number = 0;
    private listeners: Set<WeaponChangeListener> = new Set();

    /**
     * Load all weapons (call on init).
     */
    loadWeapons(definitions: WeaponDefinition[]): void {
        this.weapons.clear();
        for (const def of definitions) {
            this.weapons.set(def.id, def);
        }
        this.version++;
    }

    /**
     * Hot-reload a single weapon (runtime patching).
     */
    patchWeapon(id: WeaponId, patch: Partial<WeaponStats>): void {
        const existing = this.weapons.get(id);
        if (!existing) {
            console.warn(`[WeaponRegistry] Cannot patch unknown weapon: ${id}`);
            return;
        }

        // Create patched definition
        const patched: WeaponDefinition = {
            ...existing,
            stats: {
                ...existing.stats,
                ...patch,
            },
        };

        this.weapons.set(id, patched);
        this.version++;

        // Notify listeners
        for (const listener of this.listeners) {
            listener(id, patched);
        }

        console.log(`[WeaponRegistry] Patched weapon: ${id} (v${this.version})`);
    }

    /**
     * Apply a full balance patch.
     */
    applyBalancePatch(patch: BalancePatch): void {
        console.log(`[WeaponRegistry] Applying balance patch ${patch.version} (${patch.date})`);

        for (const change of patch.changes) {
            if (change.stats) {
                this.patchWeapon(change.weaponId, change.stats);
            }
        }
    }

    /**
     * Get weapon by ID.
     * @throws Error if weapon not found
     */
    get(id: WeaponId): WeaponDefinition {
        const weapon = this.weapons.get(id);
        if (!weapon) {
            throw new Error(`[WeaponRegistry] Unknown weapon: ${id}`);
        }
        return weapon;
    }

    /**
     * Get weapon by ID, or undefined if not found.
     */
    tryGet(id: WeaponId): WeaponDefinition | undefined {
        return this.weapons.get(id);
    }

    /**
     * Check if weapon exists.
     */
    has(id: WeaponId): boolean {
        return this.weapons.has(id);
    }

    /**
     * Get all weapon IDs.
     */
    getAllIds(): WeaponId[] {
        return Array.from(this.weapons.keys());
    }

    /**
     * Get all weapons.
     */
    getAll(): WeaponDefinition[] {
        return Array.from(this.weapons.values());
    }

    /**
     * Get current version (for cache invalidation).
     */
    getVersion(): number {
        return this.version;
    }

    /**
     * Subscribe to weapon changes.
     */
    onChange(listener: WeaponChangeListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Clear all weapons (for testing).
     */
    clear(): void {
        this.weapons.clear();
        this.version = 0;
    }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const weaponRegistry = new WeaponRegistryImpl();

/**
 * Get weapon by ID (convenience function).
 * @throws Error if weapon not found
 */
export function getWeapon(id: WeaponId): WeaponDefinition {
    return weaponRegistry.get(id);
}

/**
 * Get weapon by ID, throws if not found (alias for clarity).
 */
export function getWeaponRequired(id: WeaponId): WeaponDefinition {
    return weaponRegistry.get(id);
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the weapon registry with all weapons.
 * Call this on application startup.
 */
export function initializeWeaponRegistry(weapons: WeaponDefinition[]): void {
    weaponRegistry.loadWeapons(weapons);
    console.log(`[WeaponRegistry] Loaded ${weapons.length} weapons (v${weaponRegistry.getVersion()})`);
}
