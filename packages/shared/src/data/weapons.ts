/**
 * Weapon Data Definitions
 * 
 * All 25 weapons (5 per class).
 * This is the primary source for balance changes.
 * 
 * EXTENSION POINT: Add new weapons here.
 */

import {
    WeaponClass,
    FireMode,
    ProjectileType,
    type WeaponDefinition,
} from '../types/weapons.js';

// =============================================================================
// SHOOTERS (Assault Rifles / SMGs) - Versatile, medium range, reliable
// =============================================================================

const BURST_SHOOTER: WeaponDefinition = {
    id: 'burst_shooter',
    name: 'Burst Shooter',
    weaponClass: WeaponClass.Shooter,
    description: '3-round burst with higher accuracy. Rewards precise timing.',
    fireMode: FireMode.Burst,
    projectileType: ProjectileType.Hitscan,
    stats: {
        damage: 28,
        fireRate: 0, // Controlled by burst config
        magazineSize: 24,
        reloadTime: 1.8,
        effectiveRange: 35,
        maxRange: 60,
        falloffMultiplier: 0.5,
        spreadBase: 0.5,
        spreadMax: 2.0,
        spreadPerShot: 0.3,
        spreadRecovery: 8,
        moveSpeedMultiplier: 0.95,
        adsZoom: 1.3,
        adsSpreadMultiplier: 0.4,
        knockback: 2.0,
        selfKnockback: 0,
        knockbackFalloff: 0.5,
    },
    burst: {
        shotsPerBurst: 3,
        burstDelay: 0.05,
        burstCooldown: 0.35,
    },
};

const AUTO_SHOOTER: WeaponDefinition = {
    id: 'auto_shooter',
    name: 'Auto Shooter',
    weaponClass: WeaponClass.Shooter,
    description: 'Full-auto spray for close to mid range. High damage output up close.',
    fireMode: FireMode.FullAuto,
    projectileType: ProjectileType.Hitscan,
    stats: {
        damage: 18,
        fireRate: 12,
        magazineSize: 30,
        reloadTime: 2.0,
        effectiveRange: 25,
        maxRange: 45,
        falloffMultiplier: 0.4,
        spreadBase: 1.0,
        spreadMax: 4.0,
        spreadPerShot: 0.4,
        spreadRecovery: 6,
        moveSpeedMultiplier: 0.92,
        adsZoom: 1.25,
        adsSpreadMultiplier: 0.5,
        knockback: 1.5,
        selfKnockback: 0,
        knockbackFalloff: 0.6,
    },
};

const PRECISION_SHOOTER: WeaponDefinition = {
    id: 'precision_shooter',
    name: 'Precision Shooter',
    weaponClass: WeaponClass.Shooter,
    description: 'Slower fire, better range and damage. A marksman\'s choice.',
    fireMode: FireMode.SemiAuto,
    projectileType: ProjectileType.Hitscan,
    stats: {
        damage: 42,
        fireRate: 4,
        magazineSize: 18,
        reloadTime: 2.2,
        effectiveRange: 50,
        maxRange: 80,
        falloffMultiplier: 0.6,
        spreadBase: 0.3,
        spreadMax: 1.5,
        spreadPerShot: 0.5,
        spreadRecovery: 5,
        moveSpeedMultiplier: 0.9,
        adsZoom: 1.5,
        adsSpreadMultiplier: 0.3,
        knockback: 3.0,
        selfKnockback: 0,
        knockbackFalloff: 0.4,
    },
};

const SPRAY_SHOOTER: WeaponDefinition = {
    id: 'spray_shooter',
    name: 'Spray Shooter',
    weaponClass: WeaponClass.Shooter,
    description: 'Very high fire rate, low damage. Keeps moving while spraying.',
    fireMode: FireMode.FullAuto,
    projectileType: ProjectileType.Hitscan,
    stats: {
        damage: 12,
        fireRate: 18,
        magazineSize: 45,
        reloadTime: 2.5,
        effectiveRange: 18,
        maxRange: 35,
        falloffMultiplier: 0.3,
        spreadBase: 1.5,
        spreadMax: 5.0,
        spreadPerShot: 0.3,
        spreadRecovery: 10,
        moveSpeedMultiplier: 1.05, // Actually faster!
        adsZoom: 1.15,
        adsSpreadMultiplier: 0.6,
        knockback: 1.0,
        selfKnockback: 0,
        knockbackFalloff: 0.7,
    },
};

const HEAVY_SHOOTER: WeaponDefinition = {
    id: 'heavy_shooter',
    name: 'Heavy Shooter',
    weaponClass: WeaponClass.Shooter,
    description: 'Slow and powerful with armor penetration. Shreds tanks.',
    fireMode: FireMode.FullAuto,
    projectileType: ProjectileType.Hitscan,
    stats: {
        damage: 35,
        fireRate: 6,
        magazineSize: 20,
        reloadTime: 3.0,
        effectiveRange: 40,
        maxRange: 65,
        falloffMultiplier: 0.7,
        spreadBase: 1.2,
        spreadMax: 3.0,
        spreadPerShot: 0.6,
        spreadRecovery: 4,
        moveSpeedMultiplier: 0.85,
        adsZoom: 1.4,
        adsSpreadMultiplier: 0.4,
        knockback: 4.0,
        selfKnockback: 0,
        knockbackFalloff: 0.3,
    },
};

// =============================================================================
// BLASTERS (Explosive Launchers) - AOE damage, zone control
// =============================================================================

const DIRECT_BLASTER: WeaponDefinition = {
    id: 'direct_blaster',
    name: 'Direct Blaster',
    weaponClass: WeaponClass.Blaster,
    description: 'Fast projectile with small splash. Rewards direct hits.',
    fireMode: FireMode.SemiAuto,
    projectileType: ProjectileType.Explosive,
    stats: {
        damage: 80,
        fireRate: 1.5,
        magazineSize: 4,
        reloadTime: 2.0,
        effectiveRange: 30,
        maxRange: 50,
        falloffMultiplier: 0.8,
        spreadBase: 0,
        spreadMax: 0,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.9,
        adsZoom: 1.2,
        adsSpreadMultiplier: 1,
    },
    projectile: {
        speed: 40,
        radius: 0.15,
        gravity: 0.3,
        lifetime: 3,
        bounces: 0,
        penetrating: false,
        maxPenetrations: 0,
    },
};

const LOB_BLASTER: WeaponDefinition = {
    id: 'lob_blaster',
    name: 'Lob Blaster',
    weaponClass: WeaponClass.Blaster,
    description: 'Arc trajectory with large splash. Hits behind cover.',
    fireMode: FireMode.SemiAuto,
    projectileType: ProjectileType.Arc,
    stats: {
        damage: 70,
        fireRate: 1.2,
        magazineSize: 3,
        reloadTime: 2.5,
        effectiveRange: 25,
        maxRange: 40,
        falloffMultiplier: 0.6,
        spreadBase: 0,
        spreadMax: 0,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.88,
        adsZoom: 1.1,
        adsSpreadMultiplier: 1,
    },
    projectile: {
        speed: 25,
        radius: 0.2,
        gravity: 1.5,
        lifetime: 4,
        bounces: 0,
        penetrating: false,
        maxPenetrations: 0,
    },
};

const RAPID_BLASTER: WeaponDefinition = {
    id: 'rapid_blaster',
    name: 'Rapid Blaster',
    weaponClass: WeaponClass.Blaster,
    description: 'Multiple weak explosions. Area denial specialist.',
    fireMode: FireMode.SemiAuto,
    projectileType: ProjectileType.Explosive,
    stats: {
        damage: 40,
        fireRate: 3,
        magazineSize: 8,
        reloadTime: 2.8,
        effectiveRange: 22,
        maxRange: 35,
        falloffMultiplier: 0.5,
        spreadBase: 0,
        spreadMax: 0,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.92,
        adsZoom: 1.15,
        adsSpreadMultiplier: 1,
    },
    projectile: {
        speed: 35,
        radius: 0.12,
        gravity: 0.5,
        lifetime: 2.5,
        bounces: 0,
        penetrating: false,
        maxPenetrations: 0,
    },
};

const CLUSTER_BLASTER: WeaponDefinition = {
    id: 'cluster_blaster',
    name: 'Cluster Blaster',
    weaponClass: WeaponClass.Blaster,
    description: 'Splits into smaller bombs on impact. Devastating area damage.',
    fireMode: FireMode.SemiAuto,
    projectileType: ProjectileType.Explosive,
    stats: {
        damage: 50,
        fireRate: 0.8,
        magazineSize: 2,
        reloadTime: 3.0,
        effectiveRange: 28,
        maxRange: 45,
        falloffMultiplier: 0.7,
        spreadBase: 0,
        spreadMax: 0,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.85,
        adsZoom: 1.2,
        adsSpreadMultiplier: 1,
    },
    projectile: {
        speed: 30,
        radius: 0.18,
        gravity: 0.8,
        lifetime: 3.5,
        bounces: 0,
        penetrating: false,
        maxPenetrations: 0,
    },
    special: {
        cluster: {
            count: 5,
            spread: 45,
            subDamage: 25,
        },
    },
};

const STICKY_BLASTER: WeaponDefinition = {
    id: 'sticky_blaster',
    name: 'Sticky Blaster',
    weaponClass: WeaponClass.Blaster,
    description: 'Attach to surfaces, detonate remotely. Trap master.',
    fireMode: FireMode.SemiAuto,
    projectileType: ProjectileType.Projectile,
    stats: {
        damage: 90,
        fireRate: 1.0,
        magazineSize: 4,
        reloadTime: 2.2,
        effectiveRange: 25,
        maxRange: 40,
        falloffMultiplier: 0.8,
        spreadBase: 0,
        spreadMax: 0,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.9,
        adsZoom: 1.15,
        adsSpreadMultiplier: 1,
    },
    projectile: {
        speed: 35,
        radius: 0.1,
        gravity: 0.2,
        lifetime: 10,
        bounces: 0,
        penetrating: false,
        maxPenetrations: 0,
    },
    special: {
        sticky: {
            maxActive: 3,
            lifetime: 10,
            manualDetonate: true,
        },
    },
};

// =============================================================================
// CHARGERS (Bows / Sniper Rifles) - Long range, charge-up, precision
// =============================================================================

const CLASSIC_CHARGER: WeaponDefinition = {
    id: 'classic_charger',
    name: 'Classic Charger',
    weaponClass: WeaponClass.Charger,
    description: 'Hold to charge, release to fire. The sniper\'s standard.',
    fireMode: FireMode.Charge,
    projectileType: ProjectileType.Hitscan,
    stats: {
        damage: 150,
        fireRate: 0,
        magazineSize: 6,
        reloadTime: 2.5,
        effectiveRange: 80,
        maxRange: 120,
        falloffMultiplier: 0.9,
        spreadBase: 0,
        spreadMax: 0,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.75,
        adsZoom: 2.5,
        adsSpreadMultiplier: 0,
    },
    charge: {
        minChargeTime: 0.3,
        fullChargeTime: 1.2,
        minChargeDamage: 0.4,
        fullChargeDamage: 1.0,
        autoFireOnFull: false,
        canHoldCharge: true,
        maxHoldTime: 3,
    },
};

const SNAP_CHARGER: WeaponDefinition = {
    id: 'snap_charger',
    name: 'Snap Charger',
    weaponClass: WeaponClass.Charger,
    description: 'Quick charge, less damage. For aggressive snipers.',
    fireMode: FireMode.Charge,
    projectileType: ProjectileType.Hitscan,
    stats: {
        damage: 100,
        fireRate: 0,
        magazineSize: 8,
        reloadTime: 2.0,
        effectiveRange: 60,
        maxRange: 90,
        falloffMultiplier: 0.8,
        spreadBase: 0,
        spreadMax: 0,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.85,
        adsZoom: 2.0,
        adsSpreadMultiplier: 0,
    },
    charge: {
        minChargeTime: 0.15,
        fullChargeTime: 0.6,
        minChargeDamage: 0.5,
        fullChargeDamage: 1.0,
        autoFireOnFull: false,
        canHoldCharge: true,
        maxHoldTime: 2,
    },
};

const PIERCER_CHARGER: WeaponDefinition = {
    id: 'piercer_charger',
    name: 'Piercer Charger',
    weaponClass: WeaponClass.Charger,
    description: 'Penetrates enemies and shields. Line up your shots.',
    fireMode: FireMode.Charge,
    projectileType: ProjectileType.Hitscan,
    stats: {
        damage: 120,
        fireRate: 0,
        magazineSize: 5,
        reloadTime: 2.8,
        effectiveRange: 70,
        maxRange: 100,
        falloffMultiplier: 0.95,
        spreadBase: 0,
        spreadMax: 0,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.7,
        adsZoom: 2.2,
        adsSpreadMultiplier: 0,
    },
    charge: {
        minChargeTime: 0.4,
        fullChargeTime: 1.5,
        minChargeDamage: 0.3,
        fullChargeDamage: 1.0,
        autoFireOnFull: false,
        canHoldCharge: true,
        maxHoldTime: 2.5,
    },
    projectile: {
        speed: 0, // Hitscan
        radius: 0,
        gravity: 0,
        lifetime: 0,
        bounces: 0,
        penetrating: true,
        maxPenetrations: 3,
    },
};

const SCATTER_CHARGER: WeaponDefinition = {
    id: 'scatter_charger',
    name: 'Scatter Charger',
    weaponClass: WeaponClass.Charger,
    description: 'Charge releases 3-shot spread. Close-range charger.',
    fireMode: FireMode.Charge,
    projectileType: ProjectileType.Hitscan,
    stats: {
        damage: 45, // Per pellet
        fireRate: 0,
        magazineSize: 6,
        reloadTime: 2.2,
        effectiveRange: 25,
        maxRange: 40,
        falloffMultiplier: 0.4,
        spreadBase: 3,
        spreadMax: 3,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.88,
        adsZoom: 1.5,
        adsSpreadMultiplier: 0.7,
    },
    charge: {
        minChargeTime: 0.2,
        fullChargeTime: 0.8,
        minChargeDamage: 0.5,
        fullChargeDamage: 1.0,
        autoFireOnFull: true,
        canHoldCharge: false,
        maxHoldTime: 0,
    },
};

const BEAM_CHARGER: WeaponDefinition = {
    id: 'beam_charger',
    name: 'Beam Charger',
    weaponClass: WeaponClass.Charger,
    description: 'Continuous damage beam while charged. Melt through targets.',
    fireMode: FireMode.Beam,
    projectileType: ProjectileType.Beam,
    stats: {
        damage: 80, // Per second
        fireRate: 0,
        magazineSize: 100, // Ammo is beam duration
        reloadTime: 3.0,
        effectiveRange: 50,
        maxRange: 70,
        falloffMultiplier: 0.7,
        spreadBase: 0,
        spreadMax: 0,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.6,
        adsZoom: 1.8,
        adsSpreadMultiplier: 0,
    },
    charge: {
        minChargeTime: 0.5,
        fullChargeTime: 1.0,
        minChargeDamage: 0.6,
        fullChargeDamage: 1.0,
        autoFireOnFull: true,
        canHoldCharge: false,
        maxHoldTime: 0,
    },
};

// =============================================================================
// SLOSHERS (Arc Weapons) - Over-cover firing, area denial
// =============================================================================

const BUCKET_SLOSHER: WeaponDefinition = {
    id: 'bucket_slosher',
    name: 'Bucket Slosher',
    weaponClass: WeaponClass.Slosher,
    description: 'Wide arc, short range. Hit enemies behind low cover.',
    fireMode: FireMode.SemiAuto,
    projectileType: ProjectileType.Arc,
    stats: {
        damage: 55,
        fireRate: 1.5,
        magazineSize: 10,
        reloadTime: 2.0,
        effectiveRange: 15,
        maxRange: 25,
        falloffMultiplier: 0.6,
        spreadBase: 8,
        spreadMax: 8,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.92,
        adsZoom: 1.1,
        adsSpreadMultiplier: 1,
    },
    projectile: {
        speed: 18,
        radius: 0.25,
        gravity: 2.0,
        lifetime: 1.5,
        bounces: 0,
        penetrating: true,
        maxPenetrations: 2,
    },
};

const TRI_SLOSHER: WeaponDefinition = {
    id: 'tri_slosher',
    name: 'Tri-Slosher',
    weaponClass: WeaponClass.Slosher,
    description: '3 projectiles in fan pattern. Covers wide areas.',
    fireMode: FireMode.SemiAuto,
    projectileType: ProjectileType.Arc,
    stats: {
        damage: 35,
        fireRate: 2.0,
        magazineSize: 15,
        reloadTime: 2.2,
        effectiveRange: 12,
        maxRange: 20,
        falloffMultiplier: 0.5,
        spreadBase: 15,
        spreadMax: 15,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.95,
        adsZoom: 1.05,
        adsSpreadMultiplier: 1,
    },
    projectile: {
        speed: 20,
        radius: 0.2,
        gravity: 2.5,
        lifetime: 1.2,
        bounces: 0,
        penetrating: false,
        maxPenetrations: 0,
    },
};

const SLOSHING_MACHINE: WeaponDefinition = {
    id: 'sloshing_machine',
    name: 'Sloshing Machine',
    weaponClass: WeaponClass.Slosher,
    description: 'Longer range, narrower arc. Precision sloshing.',
    fireMode: FireMode.SemiAuto,
    projectileType: ProjectileType.Arc,
    stats: {
        damage: 65,
        fireRate: 1.2,
        magazineSize: 8,
        reloadTime: 2.4,
        effectiveRange: 22,
        maxRange: 35,
        falloffMultiplier: 0.7,
        spreadBase: 4,
        spreadMax: 4,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.88,
        adsZoom: 1.2,
        adsSpreadMultiplier: 0.8,
    },
    projectile: {
        speed: 25,
        radius: 0.2,
        gravity: 1.5,
        lifetime: 2.0,
        bounces: 0,
        penetrating: false,
        maxPenetrations: 0,
    },
};

const EXPLOSIVE_SLOSHER: WeaponDefinition = {
    id: 'explosive_slosher',
    name: 'Explosive Slosher',
    weaponClass: WeaponClass.Slosher,
    description: 'AOE on impact. Combines slosh and blast.',
    fireMode: FireMode.SemiAuto,
    projectileType: ProjectileType.Explosive,
    stats: {
        damage: 45,
        fireRate: 1.0,
        magazineSize: 6,
        reloadTime: 2.8,
        effectiveRange: 18,
        maxRange: 30,
        falloffMultiplier: 0.6,
        spreadBase: 5,
        spreadMax: 5,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.85,
        adsZoom: 1.15,
        adsSpreadMultiplier: 0.9,
    },
    projectile: {
        speed: 22,
        radius: 0.22,
        gravity: 1.8,
        lifetime: 2.5,
        bounces: 0,
        penetrating: false,
        maxPenetrations: 0,
    },
};

const INKJET_SLOSHER: WeaponDefinition = {
    id: 'inkjet_slosher',
    name: 'Inkjet Slosher',
    weaponClass: WeaponClass.Slosher,
    description: 'Secondary fire grants temporary flight + aerial bombardment.',
    fireMode: FireMode.SemiAuto,
    projectileType: ProjectileType.Arc,
    stats: {
        damage: 50,
        fireRate: 1.8,
        magazineSize: 12,
        reloadTime: 2.5,
        effectiveRange: 16,
        maxRange: 28,
        falloffMultiplier: 0.55,
        spreadBase: 6,
        spreadMax: 6,
        spreadPerShot: 0,
        spreadRecovery: 0,
        moveSpeedMultiplier: 0.9,
        adsZoom: 1.1,
        adsSpreadMultiplier: 1,
    },
    projectile: {
        speed: 20,
        radius: 0.2,
        gravity: 2.0,
        lifetime: 1.8,
        bounces: 0,
        penetrating: false,
        maxPenetrations: 0,
    },
    special: {
        flight: {
            duration: 5,
            cooldown: 20,
            canFire: true,
            flyingFireRate: 1.5,
        },
    },
};

// =============================================================================
// DUALIES (Dual Pistols) - Mobility, dodge-rolling, close-range
// =============================================================================

const STANDARD_DUALIES: WeaponDefinition = {
    id: 'standard_dualies',
    name: 'Standard Dualies',
    weaponClass: WeaponClass.Dualie,
    description: 'Balanced dodge and damage. The jack of all trades.',
    fireMode: FireMode.FullAuto,
    projectileType: ProjectileType.Hitscan,
    stats: {
        damage: 22,
        fireRate: 10,
        magazineSize: 28,
        reloadTime: 1.8,
        effectiveRange: 20,
        maxRange: 35,
        falloffMultiplier: 0.4,
        spreadBase: 2.0,
        spreadMax: 5.0,
        spreadPerShot: 0.4,
        spreadRecovery: 8,
        moveSpeedMultiplier: 1.0,
        adsZoom: 1.2,
        adsSpreadMultiplier: 0.5,
    },
    special: {
        dodgeRoll: {
            charges: 2,
            rechargeTime: 4,
            distance: 4,
            duration: 0.3,
            postDodgeDamageBonus: 1.0,
            bonusDuration: 0,
        },
    },
};

const SQUELCHER_DUALIES: WeaponDefinition = {
    id: 'squelcher_dualies',
    name: 'Squelcher Dualies',
    weaponClass: WeaponClass.Dualie,
    description: 'Longer range, slower dodge. Mid-range dualie.',
    fireMode: FireMode.FullAuto,
    projectileType: ProjectileType.Hitscan,
    stats: {
        damage: 26,
        fireRate: 8,
        magazineSize: 24,
        reloadTime: 2.0,
        effectiveRange: 30,
        maxRange: 50,
        falloffMultiplier: 0.5,
        spreadBase: 1.5,
        spreadMax: 4.0,
        spreadPerShot: 0.35,
        spreadRecovery: 7,
        moveSpeedMultiplier: 0.95,
        adsZoom: 1.4,
        adsSpreadMultiplier: 0.4,
    },
    special: {
        dodgeRoll: {
            charges: 2,
            rechargeTime: 5,
            distance: 3.5,
            duration: 0.35,
            postDodgeDamageBonus: 1.0,
            bonusDuration: 0,
        },
    },
};

const GLOOGA_DUALIES: WeaponDefinition = {
    id: 'glooga_dualies',
    name: 'Glooga Dualies',
    weaponClass: WeaponClass.Dualie,
    description: 'Damage boost after dodge roll. Rewards aggressive play.',
    fireMode: FireMode.FullAuto,
    projectileType: ProjectileType.Hitscan,
    stats: {
        damage: 28,
        fireRate: 7,
        magazineSize: 22,
        reloadTime: 2.2,
        effectiveRange: 22,
        maxRange: 38,
        falloffMultiplier: 0.45,
        spreadBase: 2.5,
        spreadMax: 5.5,
        spreadPerShot: 0.45,
        spreadRecovery: 6,
        moveSpeedMultiplier: 0.98,
        adsZoom: 1.25,
        adsSpreadMultiplier: 0.5,
    },
    special: {
        dodgeRoll: {
            charges: 2,
            rechargeTime: 4.5,
            distance: 3.5,
            duration: 0.3,
            postDodgeDamageBonus: 1.5, // 50% bonus!
            bonusDuration: 2.0,
        },
    },
};

const TETRAS: WeaponDefinition = {
    id: 'tetras',
    name: 'Tetras',
    weaponClass: WeaponClass.Dualie,
    description: '4 quick dodges, weaker shots. Ultimate evasion.',
    fireMode: FireMode.FullAuto,
    projectileType: ProjectileType.Hitscan,
    stats: {
        damage: 16,
        fireRate: 12,
        magazineSize: 32,
        reloadTime: 1.6,
        effectiveRange: 18,
        maxRange: 30,
        falloffMultiplier: 0.35,
        spreadBase: 2.5,
        spreadMax: 6.0,
        spreadPerShot: 0.35,
        spreadRecovery: 10,
        moveSpeedMultiplier: 1.05,
        adsZoom: 1.15,
        adsSpreadMultiplier: 0.6,
    },
    special: {
        dodgeRoll: {
            charges: 4, // Four dodges!
            rechargeTime: 3,
            distance: 3,
            duration: 0.25,
            postDodgeDamageBonus: 1.0,
            bonusDuration: 0,
        },
    },
};

const DUALIE_SQUELCHERS: WeaponDefinition = {
    id: 'dualie_squelchers',
    name: 'Dualie Squelchers',
    weaponClass: WeaponClass.Dualie,
    description: 'Hybrid mid-range with single long dodge.',
    fireMode: FireMode.FullAuto,
    projectileType: ProjectileType.Hitscan,
    stats: {
        damage: 24,
        fireRate: 9,
        magazineSize: 26,
        reloadTime: 2.0,
        effectiveRange: 28,
        maxRange: 45,
        falloffMultiplier: 0.5,
        spreadBase: 1.8,
        spreadMax: 4.5,
        spreadPerShot: 0.38,
        spreadRecovery: 7,
        moveSpeedMultiplier: 0.97,
        adsZoom: 1.35,
        adsSpreadMultiplier: 0.45,
    },
    special: {
        dodgeRoll: {
            charges: 1,
            rechargeTime: 6,
            distance: 6, // Long dodge!
            duration: 0.4,
            postDodgeDamageBonus: 1.2,
            bonusDuration: 1.5,
        },
    },
};

// =============================================================================
// WEAPON REGISTRY
// =============================================================================

/** All weapon definitions indexed by ID */
export const WEAPONS: Record<string, WeaponDefinition> = {
    // Shooters
    burst_shooter: BURST_SHOOTER,
    auto_shooter: AUTO_SHOOTER,
    precision_shooter: PRECISION_SHOOTER,
    spray_shooter: SPRAY_SHOOTER,
    heavy_shooter: HEAVY_SHOOTER,

    // Blasters
    direct_blaster: DIRECT_BLASTER,
    lob_blaster: LOB_BLASTER,
    rapid_blaster: RAPID_BLASTER,
    cluster_blaster: CLUSTER_BLASTER,
    sticky_blaster: STICKY_BLASTER,

    // Chargers
    classic_charger: CLASSIC_CHARGER,
    snap_charger: SNAP_CHARGER,
    piercer_charger: PIERCER_CHARGER,
    scatter_charger: SCATTER_CHARGER,
    beam_charger: BEAM_CHARGER,

    // Sloshers
    bucket_slosher: BUCKET_SLOSHER,
    tri_slosher: TRI_SLOSHER,
    sloshing_machine: SLOSHING_MACHINE,
    explosive_slosher: EXPLOSIVE_SLOSHER,
    inkjet_slosher: INKJET_SLOSHER,

    // Dualies
    standard_dualies: STANDARD_DUALIES,
    squelcher_dualies: SQUELCHER_DUALIES,
    glooga_dualies: GLOOGA_DUALIES,
    tetras: TETRAS,
    dualie_squelchers: DUALIE_SQUELCHERS,
};

/** Get all weapons */
export function getAllWeapons(): WeaponDefinition[] {
    return Object.values(WEAPONS);
}

/** Get weapons by class */
export function getWeaponsByClass(weaponClass: WeaponClass): WeaponDefinition[] {
    return getAllWeapons().filter(w => w.weaponClass === weaponClass);
}

/** Get a weapon by ID */
export function getWeapon(id: string): WeaponDefinition | undefined {
    return WEAPONS[id];
}

/** Get a weapon by ID (throws if not found) */
export function getWeaponRequired(id: string): WeaponDefinition {
    const weapon = WEAPONS[id];
    if (!weapon) {
        throw new Error(`Weapon not found: ${id}`);
    }
    return weapon;
}
