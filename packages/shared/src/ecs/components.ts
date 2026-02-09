/**
 * ECS Components
 * 
 * Lightweight component definitions for the entity-component system.
 * Components are plain data objects, no methods.
 */

import type {
    EntityId,
    PlayerId,
    TeamId,
    Tick,
    Vector3,
    Quaternion,
    InputFrame,
} from '../types/index.js';
import type { CharacterId, Species, Archetype, Loadout } from '../types/characters.js';
import type { WeaponId, WeaponState, ProjectileState } from '../types/weapons.js';
import type { AbilityState, ActiveEffect } from '../types/abilities.js';

// =============================================================================
// TRANSFORM COMPONENT - Position and rotation in world space
// =============================================================================

export interface TransformComponent {
    /** World position */
    position: Vector3;

    /** World rotation */
    rotation: Quaternion;

    /** Scale (usually 1,1,1) */
    scale: Vector3;
}

// =============================================================================
// PHYSICS COMPONENT - Physics body state
// =============================================================================

export interface PhysicsComponent {
    /** Linear velocity */
    velocity: Vector3;

    /** Angular velocity */
    angularVelocity: Vector3;

    /** Handle to Rapier physics body (stored as number for serialization) */
    bodyHandle: number;

    /** Collider handle */
    colliderHandle: number;

    /** Is grounded on a surface */
    isGrounded: boolean;

    /** Surface normal if grounded */
    groundNormal: Vector3;

    /** Is touching a wall */
    isTouchingWall: boolean;

    /** Wall normal if touching */
    wallNormal: Vector3;

    /** Coyote time - ticks since last grounded */
    ticksSinceGrounded: number;

    /** Is currently climbing (Vexis wall-climb) */
    isClimbing: boolean;
}

// =============================================================================
// PLAYER COMPONENT - Player-specific data
// =============================================================================

export interface PlayerComponent {
    /** Connected player ID */
    playerId: PlayerId;

    /** Team assignment */
    teamId: TeamId;

    /** Player's display name */
    displayName: string;

    /** Selected loadout */
    loadout: Loadout;

    /** Character species (for quick access) */
    species: Species;

    /** Character archetype (for quick access) */
    archetype: Archetype;

    /** Current input state */
    currentInput: InputFrame;

    /** Input buffer for reconciliation */
    inputBuffer: InputFrame[];

    /** Last processed input tick */
    lastProcessedInputTick: Tick;

    /** Is currently alive */
    isAlive: boolean;

    /** Tick when player died (for respawn timer) */
    deathTick: Tick;

    /** Tick when spawn protection ends */
    spawnProtectionEndTick: Tick;

    /** Match statistics */
    stats: PlayerMatchStats;
}

export interface PlayerMatchStats {
    kills: number;
    deaths: number;
    assists: number;
    damageDealt: number;
    damageTaken: number;
    healingDone: number;
    objectiveScore: number;
}

// =============================================================================
// HEALTH COMPONENT - Health and shields
// =============================================================================

export interface HealthComponent {
    /** Current health */
    health: number;

    /** Maximum health */
    maxHealth: number;

    /** Current shield */
    shield: number;

    /** Maximum shield */
    maxShield: number;

    /** Tick when shield regeneration starts */
    shieldRegenStartTick: Tick;

    /** Shield regeneration rate per tick */
    shieldRegenRate: number;

    /** Overshield (temporary extra shield) */
    overshield: number;

    /** Tick when overshield expires */
    overshieldEndTick: Tick;

    /** Damage sources for assist tracking */
    recentDamage: DamageRecord[];
}

export interface DamageRecord {
    /** Entity that dealt the damage */
    sourceEntityId: EntityId;

    /** Amount of damage */
    amount: number;

    /** Tick when damage was dealt */
    tick: Tick;

    /** Weapon or ability that dealt the damage */
    source: string;
}

// =============================================================================
// WEAPON COMPONENT - Equipped weapons and state
// =============================================================================

export interface WeaponComponent {
    /** Equipped weapon IDs (up to 3 slots) */
    weaponSlots: [WeaponId | null, WeaponId | null, WeaponId | null];

    /** Currently active weapon slot (0-2) */
    activeSlot: number;

    /** Weapon state for each slot */
    weaponStates: [WeaponState | null, WeaponState | null, WeaponState | null];

    /** Is currently switching weapons */
    isSwitching: boolean;

    /** Tick when weapon switch completes */
    switchCompleteTick: Tick;

    /** Is aiming down sights */
    isADS: boolean;
}

// =============================================================================
// ABILITY COMPONENT - Tactical and ultimate abilities
// =============================================================================

export interface AbilityComponent {
    /** Ability state */
    state: AbilityState;

    /** Active effects applied TO this entity */
    effects: ActiveEffect[];
}

// =============================================================================
// PROJECTILE COMPONENT - Active projectiles
// =============================================================================

export interface ProjectileComponent {
    /** Projectile state */
    state: ProjectileState;

    /** Has the projectile been marked for removal */
    markedForRemoval: boolean;
}

// =============================================================================
// ZONE COMPONENT - Ability zones (poison clouds, healing areas, etc.)
// =============================================================================

export interface ZoneComponent {
    /** Zone type identifier */
    zoneType: string;

    /** Source ability ID */
    abilityId: string;

    /** Entity that created the zone */
    ownerEntityId: EntityId;

    /** Team of the owner */
    teamId: TeamId;

    /** Center position */
    position: Vector3;

    /** Zone radius */
    radius: number;

    /** Zone height (for cylinder zones) */
    height: number;

    /** Effect applied to entities in zone */
    effect: ActiveEffect;

    /** Tick when zone was created */
    startTick: Tick;

    /** Tick when zone expires */
    endTick: Tick;

    /** Entities currently in the zone */
    entitiesInZone: Set<EntityId>;
}

// =============================================================================
// BARRIER COMPONENT - Barriers and deployable cover
// =============================================================================

export interface BarrierComponent {
    /** Barrier type */
    barrierType: string;

    /** Entity that deployed the barrier */
    ownerEntityId: EntityId;

    /** Team of the owner */
    teamId: TeamId;

    /** Current health (0 = invulnerable) */
    health: number;

    /** Maximum health */
    maxHealth: number;

    /** Does this barrier block enemy fire */
    blocksEnemyFire: boolean;

    /** Does this barrier block ally fire */
    blocksAllyFire: boolean;

    /** Does this barrier block movement */
    blocksMovement: boolean;

    /** Tick when barrier was deployed */
    startTick: Tick;

    /** Tick when barrier expires */
    endTick: Tick;
}

// =============================================================================
// SUMMON COMPONENT - AI-controlled summons
// =============================================================================

export interface SummonComponent {
    /** Summon type */
    summonType: string;

    /** Entity that created the summon */
    ownerEntityId: EntityId;

    /** Team of the owner */
    teamId: TeamId;

    /** Current target entity (if any) */
    targetEntityId: EntityId | null;

    /** AI behavior mode */
    behavior: 'attack_nearest' | 'follow_caster' | 'guard_area' | 'distract';

    /** Guard position (for guard_area behavior) */
    guardPosition: Vector3;

    /** Attack damage */
    damage: number;

    /** Attack cooldown in ticks */
    attackCooldownTicks: number;

    /** Next attack tick */
    nextAttackTick: Tick;

    /** Tick when summon expires */
    expirationTick: Tick;
}

// =============================================================================
// OBJECTIVE COMPONENT - Capture points, payloads, etc.
// =============================================================================

export interface ObjectiveComponent {
    /** Objective type */
    objectiveType: 'capture_point' | 'payload' | 'flag';

    /** Unique objective ID */
    objectiveId: string;

    /** Currently controlling team (0 = neutral) */
    controllingTeam: TeamId;

    /** Capture progress per team (0-100) */
    captureProgress: Record<number, number>;

    /** Entities currently in capture zone */
    entitiesInZone: Set<EntityId>;

    /** Capture rate modifier */
    captureRate: number;

    /** Is objective locked (can't be captured) */
    isLocked: boolean;

    /** Payload-specific: current checkpoint index */
    payloadCheckpoint?: number;

    /** Payload-specific: progress to next checkpoint (0-100) */
    payloadProgress?: number;
}

// =============================================================================
// COMPONENT FACTORY FUNCTIONS
// =============================================================================

export const Components = {
    transform: (
        position: Vector3 = { x: 0, y: 0, z: 0 },
        rotation: Quaternion = { x: 0, y: 0, z: 0, w: 1 }
    ): TransformComponent => ({
        position,
        rotation,
        scale: { x: 1, y: 1, z: 1 },
    }),

    physics: (bodyHandle: number, colliderHandle: number): PhysicsComponent => ({
        velocity: { x: 0, y: 0, z: 0 },
        angularVelocity: { x: 0, y: 0, z: 0 },
        bodyHandle,
        colliderHandle,
        isGrounded: false,
        groundNormal: { x: 0, y: 1, z: 0 },
        isTouchingWall: false,
        wallNormal: { x: 0, y: 0, z: 0 },
        ticksSinceGrounded: 0,
        isClimbing: false,
    }),

    health: (maxHealth: number, maxShield: number): HealthComponent => ({
        health: maxHealth,
        maxHealth,
        shield: maxShield,
        maxShield,
        shieldRegenStartTick: 0 as Tick,
        shieldRegenRate: 5, // per tick
        overshield: 0,
        overshieldEndTick: 0 as Tick,
        recentDamage: [],
    }),
} as const;
