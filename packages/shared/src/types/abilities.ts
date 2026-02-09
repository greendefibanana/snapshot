/**
 * Ability Type Definitions
 * 
 * Defines tactical abilities (4-5 per species) and ultimate abilities (3-4 per species).
 * All abilities are defined in data/abilities.ts
 */

import type { Vector3 } from './index.js';
import type { Species } from './characters.js';

// =============================================================================
// ABILITY TYPES
// =============================================================================

export enum AbilityType {
    Tactical = 'tactical',
    Ultimate = 'ultimate',
}

// =============================================================================
// TARGETING MODES - How the ability is aimed/activated
// =============================================================================

export enum TargetingMode {
    /** No targeting, instant activation */
    Instant = 'instant',

    /** Affects self only */
    Self = 'self',

    /** Affects area around self */
    SelfAOE = 'self_aoe',

    /** Point on ground to target */
    GroundTarget = 'ground_target',

    /** Direction to aim */
    Directional = 'directional',

    /** Single enemy target */
    SingleTarget = 'single_target',

    /** Channeled over time */
    Channeled = 'channeled',

    /** Toggle on/off */
    Toggle = 'toggle',
}

// =============================================================================
// EFFECT TYPES - What the ability does
// =============================================================================

export enum EffectType {
    /** Deal damage */
    Damage = 'damage',

    /** Restore health */
    Heal = 'heal',

    /** Grant shield/overshield */
    Shield = 'shield',

    /** Modify movement speed */
    SpeedModifier = 'speed_modifier',

    /** Modify damage dealt */
    DamageModifier = 'damage_modifier',

    /** Modify damage taken */
    DamageResistance = 'damage_resistance',

    /** Apply knockback force */
    Knockback = 'knockback',

    /** Stun/immobilize */
    Stun = 'stun',

    /** Slow movement */
    Slow = 'slow',

    /** Root in place */
    Root = 'root',

    /** Grant invisibility */
    Invisibility = 'invisibility',

    /** Reveal enemies */
    Reveal = 'reveal',

    /** Create barrier/cover */
    Barrier = 'barrier',

    /** Create area denial zone */
    Zone = 'zone',

    /** Summon AI entities */
    Summon = 'summon',

    /** Grant flight */
    Flight = 'flight',

    /** Grant invulnerability */
    Invulnerability = 'invulnerability',

    /** Teleport/dash */
    Teleport = 'teleport',

    /** Silence enemy abilities */
    Silence = 'silence',

    /** Damage over time */
    DamageOverTime = 'damage_over_time',

    /** Heal over time */
    HealOverTime = 'heal_over_time',
}

// =============================================================================
// ABILITY DEFINITION - Complete ability data structure
// =============================================================================

/** Unique ability identifier */
export type AbilityId = string;

/**
 * Complete definition of an ability (tactical or ultimate).
 */
export interface AbilityDefinition {
    /** Unique identifier (e.g., 'deployable_cover', 'invulnerability_shell') */
    readonly id: AbilityId;

    /** Display name */
    readonly name: string;

    /** Tactical or Ultimate */
    readonly type: AbilityType;

    /** Which species can use this ability */
    readonly species: Species;

    /** Description of what the ability does */
    readonly description: string;

    /** How the ability is targeted */
    readonly targetingMode: TargetingMode;

    /** Cooldown in seconds */
    readonly cooldown: number;

    /** Duration of effect in seconds (0 for instant) */
    readonly duration: number;

    /** Range of the ability in units (0 for self) */
    readonly range: number;

    /** Radius of effect for AOE abilities */
    readonly radius: number;

    /** Effects applied by this ability */
    readonly effects: readonly AbilityEffect[];

    /** Ultimate charge required (for ultimates, 0-100) */
    readonly ultimateChargeRequired?: number;

    /** Cast time before ability activates (seconds) */
    readonly castTime: number;

    /** Can be interrupted during cast */
    readonly interruptible: boolean;

    /** Can move while casting/channeling */
    readonly canMoveWhileCasting: boolean;

    /** Animation/visual identifier */
    readonly visualId: string;

    /** Sound effect identifier */
    readonly soundId: string;
}

/**
 * A single effect applied by an ability.
 * Abilities can have multiple effects.
 */
export interface AbilityEffect {
    /** Type of effect */
    readonly type: EffectType;

    /** Who the effect targets */
    readonly target: EffectTarget;

    /** Primary value (damage amount, heal amount, speed multiplier, etc.) */
    readonly value: number;

    /** Duration of this specific effect (seconds, 0 for instant) */
    readonly duration: number;

    /** Tick rate for over-time effects (effects per second) */
    readonly tickRate?: number;

    /** Stacks with other instances of the same effect */
    readonly stacks?: boolean;

    /** Maximum stacks */
    readonly maxStacks?: number;

    /** Zone configuration for zone effects */
    readonly zone?: ZoneConfig;

    /** Summon configuration for summon effects */
    readonly summon?: SummonConfig;

    /** Barrier configuration for barrier effects */
    readonly barrier?: BarrierConfig;
}

export enum EffectTarget {
    /** Affects self */
    Self = 'self',

    /** Affects allies (including self) */
    Allies = 'allies',

    /** Affects allies (excluding self) */
    AlliesOnly = 'allies_only',

    /** Affects enemies */
    Enemies = 'enemies',

    /** Affects all players */
    All = 'all',
}

// =============================================================================
// EFFECT CONFIGURATIONS
// =============================================================================

export interface ZoneConfig {
    /** Zone shape */
    readonly shape: 'sphere' | 'cylinder' | 'cone';

    /** Zone radius */
    readonly radius: number;

    /** Zone height (for cylinder) */
    readonly height?: number;

    /** Cone angle (for cone) */
    readonly angle?: number;

    /** Does zone follow caster */
    readonly followsCaster: boolean;

    /** Zone persists after caster dies */
    readonly persistsAfterDeath: boolean;
}

export interface SummonConfig {
    /** Number of summons */
    readonly count: number;

    /** Summon type identifier */
    readonly summonType: string;

    /** Summon health */
    readonly health: number;

    /** Summon damage */
    readonly damage: number;

    /** Summon movement speed */
    readonly speed: number;

    /** Summon lifetime (seconds) */
    readonly lifetime: number;

    /** AI behavior */
    readonly behavior: 'attack_nearest' | 'follow_caster' | 'guard_area' | 'distract';
}

export interface BarrierConfig {
    /** Barrier type */
    readonly type: 'wall' | 'dome' | 'directional';

    /** Barrier health (0 for indestructible) */
    readonly health: number;

    /** Barrier width */
    readonly width: number;

    /** Barrier height */
    readonly height: number;

    /** Blocks enemy fire */
    readonly blocksEnemyFire: boolean;

    /** Blocks ally fire */
    readonly blocksAllyFire: boolean;

    /** Blocks movement */
    readonly blocksMovement: boolean;
}

// =============================================================================
// ABILITY STATE - Runtime state during gameplay
// =============================================================================

/**
 * Runtime state of a player's abilities.
 */
export interface AbilityState {
    /** Tactical ability ID equipped */
    tacticalId: AbilityId;

    /** Ultimate ability ID equipped */
    ultimateId: AbilityId;

    /** Tick when tactical comes off cooldown */
    tacticalReadyTick: number;

    /** Is tactical currently active */
    isTacticalActive: boolean;

    /** Tick when active tactical effect ends */
    tacticalEndTick: number;

    /** Ultimate charge (0-100) */
    ultimateCharge: number;

    /** Is ultimate currently active */
    isUltimateActive: boolean;

    /** Tick when active ultimate effect ends */
    ultimateEndTick: number;

    /** Currently channeling an ability */
    isChanneling: boolean;

    /** Ability being channeled */
    channelingAbilityId: AbilityId | null;

    /** Tick when channel completes/expires */
    channelEndTick: number;

    /** Active effects on this player */
    activeEffects: ActiveEffect[];
}

/**
 * An active effect currently applied to an entity.
 */
export interface ActiveEffect {
    /** Unique instance ID */
    id: number;

    /** Source ability ID */
    abilityId: AbilityId;

    /** Effect type */
    effectType: EffectType;

    /** Effect value */
    value: number;

    /** Entity that applied the effect */
    sourceEntityId: number;

    /** Tick when effect started */
    startTick: number;

    /** Tick when effect ends */
    endTick: number;

    /** Current stack count */
    stacks: number;

    /** Last tick effect was applied (for DoT/HoT) */
    lastTickApplied: number;
}

/** Create initial ability state */
export function createAbilityState(
    tacticalId: AbilityId,
    ultimateId: AbilityId
): AbilityState {
    return {
        tacticalId,
        ultimateId,
        tacticalReadyTick: 0,
        isTacticalActive: false,
        tacticalEndTick: 0,
        ultimateCharge: 0,
        isUltimateActive: false,
        ultimateEndTick: 0,
        isChanneling: false,
        channelingAbilityId: null,
        channelEndTick: 0,
        activeEffects: [],
    };
}

// =============================================================================
// ULTIMATE CHARGE
// =============================================================================

/** How ultimate charge is gained */
export const ULTIMATE_CHARGE = {
    /** Charge per tick of game time (passive) */
    PASSIVE_PER_TICK: 0.01,

    /** Charge per point of damage dealt */
    PER_DAMAGE_DEALT: 0.1,

    /** Charge per point of damage taken */
    PER_DAMAGE_TAKEN: 0.05,

    /** Charge per elimination */
    PER_ELIMINATION: 10,

    /** Charge per assist */
    PER_ASSIST: 5,

    /** Charge per objective tick */
    PER_OBJECTIVE_TICK: 0.5,

    /** Maximum charge */
    MAX: 100,
} as const;
