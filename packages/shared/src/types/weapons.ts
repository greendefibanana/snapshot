/**
 * Weapon Type Definitions
 * 
 * Defines the 5 weapon classes and 25 weapon variants.
 * All weapons are defined in data/weapons.ts
 */

import type { Vector3 } from './index.js';

// =============================================================================
// WEAPON CLASSES - The 5 main weapon categories
// =============================================================================

export enum WeaponClass {
    Shooter = 'shooter',   // Assault Rifles / SMGs
    Blaster = 'blaster',   // Explosive Launchers
    Charger = 'charger',   // Bows / Sniper Rifles
    Slosher = 'slosher',   // Arc Weapons
    Dualie = 'dualie',     // Dual Pistols
}

export const WEAPON_CLASS_NAMES: Record<WeaponClass, string> = {
    [WeaponClass.Shooter]: 'Shooter',
    [WeaponClass.Blaster]: 'Blaster',
    [WeaponClass.Charger]: 'Charger',
    [WeaponClass.Slosher]: 'Slosher',
    [WeaponClass.Dualie]: 'Dualie',
};

// =============================================================================
// FIRE MODES - How the weapon fires
// =============================================================================

export enum FireMode {
    /** Single shot per trigger pull */
    SemiAuto = 'semi_auto',
    /** Continuous fire while trigger held */
    FullAuto = 'full_auto',
    /** Multiple shots in quick succession per trigger */
    Burst = 'burst',
    /** Hold to charge, release to fire */
    Charge = 'charge',
    /** Continuous beam while trigger held */
    Beam = 'beam',
}

// =============================================================================
// PROJECTILE TYPES - How the weapon's shots behave
// =============================================================================

export enum ProjectileType {
    /** Instant hit, raycast-based */
    Hitscan = 'hitscan',
    /** Physical projectile with travel time */
    Projectile = 'projectile',
    /** Explosive projectile */
    Explosive = 'explosive',
    /** Arc trajectory (affected by gravity) */
    Arc = 'arc',
    /** Continuous damage beam */
    Beam = 'beam',
}

// =============================================================================
// WEAPON DEFINITION - Complete weapon data structure
// =============================================================================

/** Unique weapon identifier */
export type WeaponId = string;

/**
 * Complete definition of a weapon.
 * All values are tuned for balance and can be hotfixed.
 */
export interface WeaponDefinition {
    /** Unique identifier (e.g., 'burst_shooter', 'lob_blaster') */
    readonly id: WeaponId;

    /** Display name */
    readonly name: string;

    /** Weapon class */
    readonly weaponClass: WeaponClass;

    /** Description of the weapon's playstyle */
    readonly description: string;

    /** How the weapon fires */
    readonly fireMode: FireMode;

    /** Projectile behavior */
    readonly projectileType: ProjectileType;

    /** Core weapon stats */
    readonly stats: WeaponStats;

    /** Projectile configuration (if not hitscan) */
    readonly projectile?: ProjectileConfig;

    /** Charge configuration (if charge fire mode) */
    readonly charge?: ChargeConfig;

    /** Burst configuration (if burst fire mode) */
    readonly burst?: BurstConfig;

    /** Special weapon properties */
    readonly special?: WeaponSpecial;
}

/** Core weapon statistics */
export interface WeaponStats {
    /** Damage per hit (before falloff/armor) */
    readonly damage: number;

    /** Shots per second (0 for charge weapons) */
    readonly fireRate: number;

    /** Magazine size */
    readonly magazineSize: number;

    /** Time to reload in seconds */
    readonly reloadTime: number;

    /** Effective range in units (full damage) */
    readonly effectiveRange: number;

    /** Maximum range in units (damage falloff ends) */
    readonly maxRange: number;

    /** Damage falloff multiplier at max range (0-1) */
    readonly falloffMultiplier: number;

    /** Base spread in degrees (hipfire) */
    readonly spreadBase: number;

    /** Maximum spread after sustained fire */
    readonly spreadMax: number;

    /** Spread increase per shot */
    readonly spreadPerShot: number;

    /** Spread recovery per second */
    readonly spreadRecovery: number;

    /** Movement speed multiplier while equipped */
    readonly moveSpeedMultiplier: number;

    /** ADS (aim down sights) zoom multiplier */
    readonly adsZoom: number;

    /** Spread multiplier when ADS */
    readonly adsSpreadMultiplier: number;

    /** Knockback force applied to target on hit (default: 0) */
    readonly knockback?: number;

    /** Self-knockback for explosive jumping/rocket jumping (default: 0) */
    readonly selfKnockback?: number;

    /** Knockback falloff with distance (0 = no falloff, 1 = linear to 0 at max range, default: 0.5) */
    readonly knockbackFalloff?: number;
}

/** Configuration for projectile-based weapons */
export interface ProjectileConfig {
    /** Projectile speed in units per second */
    readonly speed: number;

    /** Projectile radius for collision */
    readonly radius: number;

    /** Gravity multiplier (0 = no gravity, 1 = normal, negative = floats) */
    readonly gravity: number;

    /** Time before projectile despawns (seconds) */
    readonly lifetime: number;

    /** Number of bounces before despawn (0 = no bounce) */
    readonly bounces: number;

    /** Can penetrate enemies */
    readonly penetrating: boolean;

    /** Number of enemies that can be penetrated */
    readonly maxPenetrations: number;
}

/** Configuration for explosive projectiles */
export interface ExplosiveConfig {
    /** Explosion radius for full damage */
    readonly innerRadius: number;

    /** Explosion radius for falloff damage */
    readonly outerRadius: number;

    /** Damage at outer edge (multiplier) */
    readonly outerDamageMultiplier: number;

    /** Self-damage multiplier */
    readonly selfDamageMultiplier: number;

    /** Knockback force */
    readonly knockback: number;
}

/** Configuration for charge weapons */
export interface ChargeConfig {
    /** Minimum charge time for minimum damage (seconds) */
    readonly minChargeTime: number;

    /** Time to reach full charge (seconds) */
    readonly fullChargeTime: number;

    /** Damage multiplier at minimum charge */
    readonly minChargeDamage: number;

    /** Damage multiplier at full charge */
    readonly fullChargeDamage: number;

    /** Does full charge auto-fire? */
    readonly autoFireOnFull: boolean;

    /** Can hold charge indefinitely? */
    readonly canHoldCharge: boolean;

    /** Maximum hold time before forced fire (seconds, 0 = infinite) */
    readonly maxHoldTime: number;
}

/** Configuration for burst weapons */
export interface BurstConfig {
    /** Number of shots per burst */
    readonly shotsPerBurst: number;

    /** Time between shots within burst (seconds) */
    readonly burstDelay: number;

    /** Time between bursts (seconds) */
    readonly burstCooldown: number;
}

/** Special weapon properties */
export interface WeaponSpecial {
    /** Grants dodge roll ability (Dualies) */
    readonly dodgeRoll?: DodgeRollConfig;

    /** Sticky projectile that can be detonated */
    readonly sticky?: StickyConfig;

    /** Cluster munition that splits */
    readonly cluster?: ClusterConfig;

    /** Temporary flight mode */
    readonly flight?: FlightConfig;
}

export interface DodgeRollConfig {
    /** Number of dodges available */
    readonly charges: number;

    /** Recharge time per dodge (seconds) */
    readonly rechargeTime: number;

    /** Distance covered by dodge */
    readonly distance: number;

    /** Dodge duration (seconds) */
    readonly duration: number;

    /** Damage bonus after dodge (multiplier) */
    readonly postDodgeDamageBonus: number;

    /** Duration of damage bonus (seconds) */
    readonly bonusDuration: number;
}

export interface StickyConfig {
    /** Maximum active sticky projectiles */
    readonly maxActive: number;

    /** Lifetime before auto-detonate (seconds) */
    readonly lifetime: number;

    /** Can detonate early with secondary fire */
    readonly manualDetonate: boolean;
}

export interface ClusterConfig {
    /** Number of sub-munitions */
    readonly count: number;

    /** Spread angle of sub-munitions */
    readonly spread: number;

    /** Damage per sub-munition */
    readonly subDamage: number;
}

export interface FlightConfig {
    /** Flight duration (seconds) */
    readonly duration: number;

    /** Cooldown after landing (seconds) */
    readonly cooldown: number;

    /** Can fire while flying */
    readonly canFire: boolean;

    /** Fire rate multiplier while flying */
    readonly flyingFireRate: number;
}

// =============================================================================
// WEAPON STATE - Runtime state during gameplay
// =============================================================================

/**
 * Runtime state of a weapon during gameplay.
 * Tracked per-player, per-weapon.
 */
export interface WeaponState {
    /** Current ammo in magazine */
    ammo: number;

    /** Reserve ammo (0 for infinite reserve) */
    reserveAmmo: number;

    /** Is currently reloading */
    isReloading: boolean;

    /** Reload end tick */
    reloadEndTick: number;

    /** Next tick when weapon can fire */
    nextFireTick: number;

    /** Current spread value */
    currentSpread: number;

    /** Current charge level (0-1) for charge weapons */
    chargeLevel: number;

    /** Is currently charging */
    isCharging: boolean;

    /** Burst shots remaining */
    burstShotsRemaining: number;

    /** Dodge roll charges (Dualies) */
    dodgeCharges: number;

    /** Next dodge recharge tick */
    nextDodgeRechargeTick: number;

    /** Active sticky projectile IDs */
    stickyProjectiles: number[];
}

/** Create initial weapon state from definition */
export function createWeaponState(weapon: WeaponDefinition): WeaponState {
    return {
        ammo: weapon.stats.magazineSize,
        reserveAmmo: 0, // Infinite reserve by default
        isReloading: false,
        reloadEndTick: 0,
        nextFireTick: 0,
        currentSpread: weapon.stats.spreadBase,
        chargeLevel: 0,
        isCharging: false,
        burstShotsRemaining: 0,
        dodgeCharges: weapon.special?.dodgeRoll?.charges ?? 0,
        nextDodgeRechargeTick: 0,
        stickyProjectiles: [],
    };
}

// =============================================================================
// PROJECTILE STATE - Runtime state of active projectiles
// =============================================================================

export interface ProjectileState {
    /** Projectile's entity ID */
    entityId: number;

    /** Weapon that spawned this projectile */
    weaponId: WeaponId;

    /** Owner player's entity ID */
    ownerId: number;

    /** Owner's team */
    teamId: number;

    /** Current position */
    position: Vector3;

    /** Current velocity */
    velocity: Vector3;

    /** How long the projectile has existed (ticks) */
    age: number;

    /** Remaining bounces */
    bouncesRemaining: number;

    /** Remaining penetrations */
    penetrationsRemaining: number;

    /** Is this a sticky that hasn't been detonated */
    isSticky: boolean;

    /** Charge level at time of firing (for charge weapons) */
    chargeLevel: number;
}
