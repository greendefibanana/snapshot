/**
 * Character Type Definitions
 * 
 * Defines the 5 species, 4 archetypes, and character structure.
 * All 20 characters are defined in data/characters.ts
 */

// =============================================================================
// SPECIES - The 5 playable species of Arbitra
// =============================================================================

export enum Species {
    Urshari = 'urshari',   // Bears - The Industrialists
    Aeonids = 'aeonids',   // Birds - The Sky Lords
    Vexis = 'vexis',       // Snakes - The Technologists
    Khaurans = 'khaurans', // Bulls - The Enforcers
    Zynni = 'zynni',       // Rats - The Survivors
}

export const SPECIES_NAMES: Record<Species, string> = {
    [Species.Urshari]: 'Urshari',
    [Species.Aeonids]: 'Aeonids',
    [Species.Vexis]: 'Vexis',
    [Species.Khaurans]: 'Khaurans',
    [Species.Zynni]: 'Zynni',
};

// =============================================================================
// ARCHETYPES - Combat roles within each species
// =============================================================================

export enum Archetype {
    Tank = 'tank',
    Skirmisher = 'skirmisher',
    Support = 'support',
    Assassin = 'assassin',
}

export const ARCHETYPE_NAMES: Record<Archetype, string> = {
    [Archetype.Tank]: 'Tank',
    [Archetype.Skirmisher]: 'Skirmisher',
    [Archetype.Support]: 'Support',
    [Archetype.Assassin]: 'Assassin',
};

// =============================================================================
// PASSIVE TRAITS - Species-specific passive abilities
// =============================================================================

/**
 * Passive trait modifiers applied to characters based on species.
 * These affect base stats and unlock special movement abilities.
 */
export interface PassiveTraits {
    /** Multiplier applied to base health (1.0 = 100%) */
    readonly healthMultiplier: number;

    /** Multiplier applied to base movement speed (1.0 = 100%) */
    readonly speedMultiplier: number;

    /** Multiplier applied to hitbox size (1.0 = 100%) */
    readonly hitboxMultiplier: number;

    /** Can break through weak/destructible walls */
    readonly canBreakWalls: boolean;

    /** Extended jump with mid-air control */
    readonly extendedJump: boolean;

    /** Faster climbing on walls/ladders */
    readonly fastClimb: boolean;

    /** Can climb on any vertical surface */
    readonly wallClimb: boolean;

    /** Reduced visibility when crouching */
    readonly stealthCrouch: boolean;

    /** Momentum-based charge ability */
    readonly chargeMomentum: boolean;

    /** Cannot be stopped or slowed while sprinting */
    readonly unstoppableSprint: boolean;

    /** Can access vents/tight spaces */
    readonly ventAccess: boolean;

    /** Faster interaction with objects */
    readonly fastInteract: boolean;
}

/** Default passive traits (no bonuses) */
export const DEFAULT_PASSIVE_TRAITS: PassiveTraits = {
    healthMultiplier: 1.0,
    speedMultiplier: 1.0,
    hitboxMultiplier: 1.0,
    canBreakWalls: false,
    extendedJump: false,
    fastClimb: false,
    wallClimb: false,
    stealthCrouch: false,
    chargeMomentum: false,
    unstoppableSprint: false,
    ventAccess: false,
    fastInteract: false,
};

/** Passive traits by species */
export const SPECIES_TRAITS: Record<Species, Partial<PassiveTraits>> = {
    [Species.Urshari]: {
        healthMultiplier: 1.25,       // 25% more HP
        speedMultiplier: 0.85,        // 15% slower
        hitboxMultiplier: 1.15,       // Larger hitbox
        canBreakWalls: true,
    },
    [Species.Aeonids]: {
        speedMultiplier: 1.05,        // Slightly faster
        hitboxMultiplier: 0.95,       // Slightly smaller
        extendedJump: true,
        fastClimb: true,
    },
    [Species.Vexis]: {
        speedMultiplier: 0.95,        // Slightly slower base
        hitboxMultiplier: 0.9,        // Smaller hitbox
        wallClimb: true,
        stealthCrouch: true,
    },
    [Species.Khaurans]: {
        healthMultiplier: 1.1,        // 10% more HP
        speedMultiplier: 1.1,         // 10% faster (straight lines)
        hitboxMultiplier: 1.1,        // Larger hitbox
        chargeMomentum: true,
        unstoppableSprint: true,
    },
    [Species.Zynni]: {
        healthMultiplier: 0.9,        // 10% less HP
        speedMultiplier: 1.05,        // 5% faster
        hitboxMultiplier: 0.8,        // Smaller hitbox
        ventAccess: true,
        fastInteract: true,
    },
};

/** Compute full passive traits for a species */
export function getSpeciesTraits(species: Species): PassiveTraits {
    return {
        ...DEFAULT_PASSIVE_TRAITS,
        ...SPECIES_TRAITS[species],
    };
}

// =============================================================================
// CHARACTER DEFINITION - Complete character data structure
// =============================================================================

/** Unique character identifier */
export type CharacterId = string;

/**
 * Complete definition of a playable character.
 * Used for both client display and server simulation.
 */
export interface CharacterDefinition {
    /** Unique identifier (e.g., 'kodiak', 'skyclaw') */
    readonly id: CharacterId;

    /** Display name */
    readonly name: string;

    /** Character species */
    readonly species: Species;

    /** Combat archetype */
    readonly archetype: Archetype;

    /** Character description/lore */
    readonly description: string;

    /** Base stats (before passive trait modifiers) */
    readonly baseStats: CharacterBaseStats;

    /** Available tactical ability IDs (player chooses 1) */
    readonly tacticalAbilities: readonly string[];

    /** Available ultimate ability IDs (player chooses 1) */
    readonly ultimateAbilities: readonly string[];
}

/** Base character stats before species modifiers */
export interface CharacterBaseStats {
    /** Base health points */
    readonly health: number;

    /** Base shield points (regenerates) */
    readonly shield: number;

    /** Base movement speed (units per second) */
    readonly moveSpeed: number;

    /** Jump velocity */
    readonly jumpForce: number;

    /** Sprint speed multiplier */
    readonly sprintMultiplier: number;
}

/** Default base stats for each archetype */
export const ARCHETYPE_BASE_STATS: Record<Archetype, CharacterBaseStats> = {
    [Archetype.Tank]: {
        health: 250,
        shield: 50,
        moveSpeed: 6.0,
        jumpForce: 8.0,
        sprintMultiplier: 1.3,
    },
    [Archetype.Skirmisher]: {
        health: 175,
        shield: 25,
        moveSpeed: 7.5,
        jumpForce: 9.0,
        sprintMultiplier: 1.5,
    },
    [Archetype.Support]: {
        health: 200,
        shield: 50,
        moveSpeed: 6.5,
        jumpForce: 8.5,
        sprintMultiplier: 1.4,
    },
    [Archetype.Assassin]: {
        health: 150,
        shield: 0,
        moveSpeed: 8.0,
        jumpForce: 10.0,
        sprintMultiplier: 1.6,
    },
};

// =============================================================================
// LOADOUT - Player's selected configuration
// =============================================================================

/**
 * A player's complete loadout for a match.
 * Selected before the match starts.
 */
export interface Loadout {
    /** Selected character ID */
    readonly characterId: CharacterId;

    /** Selected weapon ID */
    readonly weaponId: string;

    /** Selected tactical ability ID */
    readonly tacticalAbilityId: string;

    /** Selected ultimate ability ID */
    readonly ultimateAbilityId: string;
}
