/**
 * Data Module Exports
 */

export * from './characters.js';
// Export specific items from weapons to avoid conflicts with WeaponRegistry
export {
    WEAPONS,
    getAllWeapons,
    getWeaponsByClass,
} from './weapons.js';
export * from './abilities.js';
export * from './smg.js';
// WeaponRegistry takes precedence for getWeapon/getWeaponRequired
export * from './WeaponRegistry.js';
