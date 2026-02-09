/**
 * Loadout Manager
 * 
 * Manages player loadout selection and validation.
 * 
 * SCOPE: Loadout logic only. No stats, no rendering.
 */

import type { PlayerId, ItemId } from './PlayerInventory.js';
import { PlayerInventory } from './PlayerInventory.js';

// =============================================================================
// TYPES
// =============================================================================

/** Player loadout configuration */
export interface Loadout {
    readonly characterId: ItemId;
    readonly primaryWeaponId: ItemId;
    readonly secondaryWeaponId?: ItemId;
}

/** Loadout validation result */
export interface LoadoutValidation {
    readonly valid: boolean;
    readonly errors: readonly string[];
}

/** Default loadout configuration */
export interface DefaultLoadout {
    readonly characterId: ItemId;
    readonly primaryWeaponId: ItemId;
    readonly secondaryWeaponId?: ItemId;
}

// =============================================================================
// LOADOUT MANAGER
// =============================================================================

/**
 * Manages player loadouts with ownership validation.
 */
export class LoadoutManager {
    /** Map of playerId -> Loadout */
    private loadouts = new Map<PlayerId, Loadout>();

    constructor(
        private inventory: PlayerInventory,
        private defaultLoadout: DefaultLoadout
    ) { }

    // =========================================================================
    // LOADOUT MANAGEMENT
    // =========================================================================

    /** Get player's current loadout */
    getLoadout(playerId: PlayerId): Loadout {
        return this.loadouts.get(playerId) ?? this.defaultLoadout;
    }

    /** Set player's loadout (validates ownership) */
    setLoadout(playerId: PlayerId, loadout: Loadout): LoadoutValidation {
        const validation = this.validateLoadout(playerId, loadout);

        if (validation.valid) {
            this.loadouts.set(playerId, loadout);
        }

        return validation;
    }

    /** Set only the character */
    setCharacter(playerId: PlayerId, characterId: ItemId): LoadoutValidation {
        const current = this.getLoadout(playerId);
        return this.setLoadout(playerId, { ...current, characterId });
    }

    /** Set only the primary weapon */
    setPrimaryWeapon(playerId: PlayerId, weaponId: ItemId): LoadoutValidation {
        const current = this.getLoadout(playerId);
        return this.setLoadout(playerId, { ...current, primaryWeaponId: weaponId });
    }

    /** Set only the secondary weapon */
    setSecondaryWeapon(playerId: PlayerId, weaponId: ItemId | undefined): LoadoutValidation {
        const current = this.getLoadout(playerId);
        const newLoadout: Loadout = {
            characterId: current.characterId,
            primaryWeaponId: current.primaryWeaponId,
        };
        if (weaponId !== undefined) {
            return this.setLoadout(playerId, { ...newLoadout, secondaryWeaponId: weaponId });
        }
        return this.setLoadout(playerId, newLoadout);
    }

    /** Reset to default loadout */
    resetLoadout(playerId: PlayerId): void {
        this.loadouts.delete(playerId);
    }

    // =========================================================================
    // VALIDATION
    // =========================================================================

    /** Validate loadout against player's inventory */
    validateLoadout(playerId: PlayerId, loadout: Loadout): LoadoutValidation {
        const errors: string[] = [];

        // Check character ownership
        if (!this.inventory.owns(playerId, loadout.characterId)) {
            errors.push(`Character not owned: ${loadout.characterId}`);
        }

        // Check primary weapon ownership
        if (!this.inventory.owns(playerId, loadout.primaryWeaponId)) {
            errors.push(`Primary weapon not owned: ${loadout.primaryWeaponId}`);
        }

        // Check secondary weapon ownership (if specified)
        if (loadout.secondaryWeaponId) {
            if (!this.inventory.owns(playerId, loadout.secondaryWeaponId)) {
                errors.push(`Secondary weapon not owned: ${loadout.secondaryWeaponId}`);
            }

            // Check for duplicate weapons
            if (loadout.secondaryWeaponId === loadout.primaryWeaponId) {
                errors.push('Primary and secondary weapons cannot be the same');
            }
        }

        return { valid: errors.length === 0, errors };
    }

    /** Check if loadout is valid without setting */
    isValidLoadout(playerId: PlayerId, loadout: Loadout): boolean {
        return this.validateLoadout(playerId, loadout).valid;
    }

    // =========================================================================
    // QUERIES
    // =========================================================================

    /** Get all players with custom loadouts */
    getPlayersWithCustomLoadouts(): PlayerId[] {
        return Array.from(this.loadouts.keys());
    }

    /** Check if player has custom loadout */
    hasCustomLoadout(playerId: PlayerId): boolean {
        return this.loadouts.has(playerId);
    }
}
