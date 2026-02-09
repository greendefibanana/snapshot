/**
 * Ability Data Definitions
 * 
 * All tactical and ultimate abilities for each species.
 * This is the primary source for balance changes.
 * 
 * EXTENSION POINT: Add new abilities here.
 */

import { Species } from '../types/characters.js';
import {
    AbilityType,
    TargetingMode,
    EffectType,
    EffectTarget,
    type AbilityDefinition,
} from '../types/abilities.js';

// =============================================================================
// URSHARI ABILITIES (Bears)
// =============================================================================

const DEPLOYABLE_COVER: AbilityDefinition = {
    id: 'deployable_cover',
    name: 'Deployable Cover',
    type: AbilityType.Tactical,
    species: Species.Urshari,
    description: 'Place a temporary barrier that blocks enemy fire.',
    targetingMode: TargetingMode.GroundTarget,
    cooldown: 20,
    duration: 12,
    range: 10,
    radius: 0,
    castTime: 0.3,
    interruptible: true,
    canMoveWhileCasting: false,
    visualId: 'barrier_deploy',
    soundId: 'ability_barrier',
    effects: [{
        type: EffectType.Barrier,
        target: EffectTarget.Self,
        value: 500, // barrier health
        duration: 12,
        barrier: {
            type: 'wall',
            health: 500,
            width: 4,
            height: 2.5,
            blocksEnemyFire: true,
            blocksAllyFire: false,
            blocksMovement: true,
        },
    }],
};

const SELF_HEAL: AbilityDefinition = {
    id: 'self_heal',
    name: 'Self-Heal',
    type: AbilityType.Tactical,
    species: Species.Urshari,
    description: 'Regenerate 30% HP over 5 seconds.',
    targetingMode: TargetingMode.Self,
    cooldown: 30,
    duration: 5,
    range: 0,
    radius: 0,
    castTime: 0.5,
    interruptible: true,
    canMoveWhileCasting: true,
    visualId: 'heal_self',
    soundId: 'ability_heal',
    effects: [{
        type: EffectType.HealOverTime,
        target: EffectTarget.Self,
        value: 0.06, // 6% per second = 30% over 5s
        duration: 5,
        tickRate: 1,
    }],
};

const KNOCKBACK_ROAR: AbilityDefinition = {
    id: 'knockback_roar',
    name: 'Knockback Roar',
    type: AbilityType.Tactical,
    species: Species.Urshari,
    description: 'Push enemies away in a cone.',
    targetingMode: TargetingMode.Directional,
    cooldown: 25,
    duration: 0,
    range: 8,
    radius: 0,
    castTime: 0.2,
    interruptible: false,
    canMoveWhileCasting: false,
    visualId: 'roar_cone',
    soundId: 'ability_roar',
    effects: [{
        type: EffectType.Knockback,
        target: EffectTarget.Enemies,
        value: 15, // knockback force
        duration: 0,
        zone: {
            shape: 'cone',
            radius: 8,
            angle: 60,
            followsCaster: false,
            persistsAfterDeath: false,
        },
    }],
};

const HONEY_TRAP: AbilityDefinition = {
    id: 'honey_trap',
    name: 'Honey Trap',
    type: AbilityType.Tactical,
    species: Species.Urshari,
    description: 'Drop a slow field that snares enemies.',
    targetingMode: TargetingMode.GroundTarget,
    cooldown: 35,
    duration: 6,
    range: 15,
    radius: 5,
    castTime: 0.3,
    interruptible: true,
    canMoveWhileCasting: true,
    visualId: 'trap_honey',
    soundId: 'ability_trap',
    effects: [{
        type: EffectType.Slow,
        target: EffectTarget.Enemies,
        value: 0.5, // 50% slow
        duration: 6,
        zone: {
            shape: 'cylinder',
            radius: 5,
            height: 2,
            followsCaster: false,
            persistsAfterDeath: true,
        },
    }],
};

const INVULNERABILITY_SHELL: AbilityDefinition = {
    id: 'invulnerability_shell',
    name: 'Invulnerability Shell',
    type: AbilityType.Ultimate,
    species: Species.Urshari,
    description: '5 seconds of complete damage immunity.',
    targetingMode: TargetingMode.Self,
    cooldown: 90,
    duration: 5,
    range: 0,
    radius: 0,
    castTime: 0.5,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'ult_invuln',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [{
        type: EffectType.Invulnerability,
        target: EffectTarget.Self,
        value: 1,
        duration: 5,
    }],
};

const TEAM_DAMAGE_REDUCTION: AbilityDefinition = {
    id: 'team_damage_reduction',
    name: 'Fortress Aura',
    type: AbilityType.Ultimate,
    species: Species.Urshari,
    description: '30% damage reduction for nearby allies for 8 seconds.',
    targetingMode: TargetingMode.SelfAOE,
    cooldown: 120,
    duration: 8,
    range: 0,
    radius: 12,
    castTime: 0.5,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'ult_aura',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [{
        type: EffectType.DamageResistance,
        target: EffectTarget.Allies,
        value: 0.3, // 30% reduction
        duration: 8,
        zone: {
            shape: 'sphere',
            radius: 12,
            followsCaster: true,
            persistsAfterDeath: false,
        },
    }],
};

const RAMPAGE_MODE: AbilityDefinition = {
    id: 'rampage_mode',
    name: 'Rampage Mode',
    type: AbilityType.Ultimate,
    species: Species.Urshari,
    description: 'Increased speed and melee damage for 10 seconds.',
    targetingMode: TargetingMode.Self,
    cooldown: 100,
    duration: 10,
    range: 0,
    radius: 0,
    castTime: 0.3,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'ult_rampage',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [
        {
            type: EffectType.SpeedModifier,
            target: EffectTarget.Self,
            value: 1.4, // 40% speed boost
            duration: 10,
        },
        {
            type: EffectType.DamageModifier,
            target: EffectTarget.Self,
            value: 1.5, // 50% damage boost
            duration: 10,
        },
    ],
};

// =============================================================================
// AEONIDS ABILITIES (Birds)
// =============================================================================

const GUST_DASH: AbilityDefinition = {
    id: 'gust_dash',
    name: 'Gust Dash',
    type: AbilityType.Tactical,
    species: Species.Aeonids,
    description: 'Horizontal boost in any direction.',
    targetingMode: TargetingMode.Directional,
    cooldown: 15,
    duration: 0.2,
    range: 8,
    radius: 0,
    castTime: 0,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'dash_wind',
    soundId: 'ability_dash',
    effects: [{
        type: EffectType.Teleport,
        target: EffectTarget.Self,
        value: 8, // distance
        duration: 0.2,
    }],
};

const UPDRAFT: AbilityDefinition = {
    id: 'updraft',
    name: 'Updraft',
    type: AbilityType.Tactical,
    species: Species.Aeonids,
    description: 'Create a wind current that lifts allies.',
    targetingMode: TargetingMode.GroundTarget,
    cooldown: 30,
    duration: 6,
    range: 20,
    radius: 4,
    castTime: 0.3,
    interruptible: true,
    canMoveWhileCasting: true,
    visualId: 'zone_updraft',
    soundId: 'ability_wind',
    effects: [{
        type: EffectType.Zone,
        target: EffectTarget.Allies,
        value: 12, // upward force
        duration: 6,
        zone: {
            shape: 'cylinder',
            radius: 4,
            height: 15,
            followsCaster: false,
            persistsAfterDeath: true,
        },
    }],
};

const DIVE_STRIKE: AbilityDefinition = {
    id: 'dive_strike',
    name: 'Dive Strike',
    type: AbilityType.Tactical,
    species: Species.Aeonids,
    description: 'Aerial slam attack dealing AOE damage.',
    targetingMode: TargetingMode.GroundTarget,
    cooldown: 25,
    duration: 0,
    range: 15,
    radius: 3,
    castTime: 0.1,
    interruptible: false,
    canMoveWhileCasting: false,
    visualId: 'attack_dive',
    soundId: 'ability_slam',
    effects: [{
        type: EffectType.Damage,
        target: EffectTarget.Enemies,
        value: 80,
        duration: 0,
        zone: {
            shape: 'sphere',
            radius: 3,
            followsCaster: false,
            persistsAfterDeath: false,
        },
    }],
};

const RADAR_PULSE: AbilityDefinition = {
    id: 'radar_pulse',
    name: 'Radar Pulse',
    type: AbilityType.Tactical,
    species: Species.Aeonids,
    description: 'Reveal enemies in a large radius for 3 seconds.',
    targetingMode: TargetingMode.SelfAOE,
    cooldown: 35,
    duration: 3,
    range: 0,
    radius: 25,
    castTime: 0.2,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'scan_radar',
    soundId: 'ability_scan',
    effects: [{
        type: EffectType.Reveal,
        target: EffectTarget.Enemies,
        value: 1,
        duration: 3,
        zone: {
            shape: 'sphere',
            radius: 25,
            followsCaster: false,
            persistsAfterDeath: false,
        },
    }],
};

const SKY_SUPREMACY: AbilityDefinition = {
    id: 'sky_supremacy',
    name: 'Sky Supremacy',
    type: AbilityType.Ultimate,
    species: Species.Aeonids,
    description: 'Gain unlimited flight for 8 seconds.',
    targetingMode: TargetingMode.Self,
    cooldown: 90,
    duration: 8,
    range: 0,
    radius: 0,
    castTime: 0.3,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'ult_flight',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [{
        type: EffectType.Flight,
        target: EffectTarget.Self,
        value: 1,
        duration: 8,
    }],
};

const TAILWIND_AURA: AbilityDefinition = {
    id: 'tailwind_aura',
    name: 'Tailwind',
    type: AbilityType.Ultimate,
    species: Species.Aeonids,
    description: '40% movement speed boost for entire team, 10 seconds.',
    targetingMode: TargetingMode.Instant,
    cooldown: 100,
    duration: 10,
    range: 0,
    radius: 100, // Map-wide
    castTime: 0.3,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'ult_speed',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [{
        type: EffectType.SpeedModifier,
        target: EffectTarget.Allies,
        value: 1.4,
        duration: 10,
    }],
};

const AERIAL_BOMBARDMENT: AbilityDefinition = {
    id: 'aerial_bombardment',
    name: 'Aerial Bombardment',
    type: AbilityType.Ultimate,
    species: Species.Aeonids,
    description: 'Call in 3 explosive strikes from above.',
    targetingMode: TargetingMode.GroundTarget,
    cooldown: 110,
    duration: 3,
    range: 40,
    radius: 5,
    castTime: 0.5,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'ult_bomb',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [{
        type: EffectType.Damage,
        target: EffectTarget.Enemies,
        value: 120,
        duration: 0,
        tickRate: 1, // 3 strikes
    }],
};

// =============================================================================
// VEXIS ABILITIES (Snakes) - Sample set
// =============================================================================

const VENOM_SPIT: AbilityDefinition = {
    id: 'venom_spit',
    name: 'Venom Spit',
    type: AbilityType.Tactical,
    species: Species.Vexis,
    description: 'Projectile that deals damage-over-time.',
    targetingMode: TargetingMode.Directional,
    cooldown: 20,
    duration: 5,
    range: 25,
    radius: 0,
    castTime: 0.1,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'proj_venom',
    soundId: 'ability_spit',
    effects: [{
        type: EffectType.DamageOverTime,
        target: EffectTarget.Enemies,
        value: 15, // per tick
        duration: 5,
        tickRate: 1,
    }],
};

const SHED_SKIN: AbilityDefinition = {
    id: 'shed_skin',
    name: 'Shed Skin',
    type: AbilityType.Tactical,
    species: Species.Vexis,
    description: 'Leave a decoy, briefly go invisible.',
    targetingMode: TargetingMode.Instant,
    cooldown: 30,
    duration: 3,
    range: 0,
    radius: 0,
    castTime: 0,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'decoy_shed',
    soundId: 'ability_stealth',
    effects: [
        {
            type: EffectType.Invisibility,
            target: EffectTarget.Self,
            value: 1,
            duration: 3,
        },
        {
            type: EffectType.Summon,
            target: EffectTarget.Self,
            value: 1,
            duration: 5,
            summon: {
                count: 1,
                summonType: 'decoy',
                health: 1,
                damage: 0,
                speed: 0,
                lifetime: 5,
                behavior: 'distract',
            },
        },
    ],
};

const CONSTRICT: AbilityDefinition = {
    id: 'constrict',
    name: 'Constrict',
    type: AbilityType.Tactical,
    species: Species.Vexis,
    description: 'Grapple and immobilize an enemy for 2 seconds.',
    targetingMode: TargetingMode.SingleTarget,
    cooldown: 35,
    duration: 2,
    range: 8,
    radius: 0,
    castTime: 0.2,
    interruptible: true,
    canMoveWhileCasting: false,
    visualId: 'grapple_constrict',
    soundId: 'ability_grab',
    effects: [{
        type: EffectType.Root,
        target: EffectTarget.Enemies,
        value: 1,
        duration: 2,
    }],
};

const HEAT_VISION: AbilityDefinition = {
    id: 'heat_vision',
    name: 'Heat Vision',
    type: AbilityType.Tactical,
    species: Species.Vexis,
    description: 'See enemies through walls for 5 seconds.',
    targetingMode: TargetingMode.Self,
    cooldown: 40,
    duration: 5,
    range: 0,
    radius: 30,
    castTime: 0.3,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'vision_heat',
    soundId: 'ability_scan',
    effects: [{
        type: EffectType.Reveal,
        target: EffectTarget.Enemies,
        value: 1,
        duration: 5,
    }],
};

const BASILISK_STARE: AbilityDefinition = {
    id: 'basilisk_stare',
    name: 'Basilisk Stare',
    type: AbilityType.Ultimate,
    species: Species.Vexis,
    description: 'Stun all enemies looking at you for 3 seconds.',
    targetingMode: TargetingMode.SelfAOE,
    cooldown: 100,
    duration: 3,
    range: 0,
    radius: 20,
    castTime: 0.5,
    interruptible: false,
    canMoveWhileCasting: false,
    visualId: 'ult_stare',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [{
        type: EffectType.Stun,
        target: EffectTarget.Enemies,
        value: 1,
        duration: 3,
    }],
};

const SERPENT_SWARM: AbilityDefinition = {
    id: 'serpent_swarm',
    name: 'Serpent Swarm',
    type: AbilityType.Ultimate,
    species: Species.Vexis,
    description: 'Summon AI snakes that attack enemies.',
    targetingMode: TargetingMode.GroundTarget,
    cooldown: 110,
    duration: 10,
    range: 20,
    radius: 8,
    castTime: 0.5,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'ult_swarm',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [{
        type: EffectType.Summon,
        target: EffectTarget.Enemies,
        value: 4,
        duration: 10,
        summon: {
            count: 4,
            summonType: 'snake',
            health: 50,
            damage: 20,
            speed: 8,
            lifetime: 10,
            behavior: 'attack_nearest',
        },
    }],
};

const TOXIC_CLOUD: AbilityDefinition = {
    id: 'toxic_cloud',
    name: 'Toxic Cloud',
    type: AbilityType.Ultimate,
    species: Species.Vexis,
    description: 'Large poison gas zone, 8 seconds duration.',
    targetingMode: TargetingMode.GroundTarget,
    cooldown: 90,
    duration: 8,
    range: 25,
    radius: 8,
    castTime: 0.3,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'ult_cloud',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [{
        type: EffectType.DamageOverTime,
        target: EffectTarget.Enemies,
        value: 25,
        duration: 8,
        tickRate: 1,
        zone: {
            shape: 'sphere',
            radius: 8,
            followsCaster: false,
            persistsAfterDeath: true,
        },
    }],
};

const MOLT: AbilityDefinition = {
    id: 'molt',
    name: 'Molt',
    type: AbilityType.Ultimate,
    species: Species.Vexis,
    description: 'Full heal + damage immunity for 3 seconds.',
    targetingMode: TargetingMode.Self,
    cooldown: 120,
    duration: 3,
    range: 0,
    radius: 0,
    castTime: 1.0,
    interruptible: true,
    canMoveWhileCasting: false,
    visualId: 'ult_molt',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [
        {
            type: EffectType.Heal,
            target: EffectTarget.Self,
            value: 1.0, // 100% heal
            duration: 0,
        },
        {
            type: EffectType.Invulnerability,
            target: EffectTarget.Self,
            value: 1,
            duration: 3,
        },
    ],
};

// =============================================================================
// KHAURANS ABILITIES (Bulls) - Sample set
// =============================================================================

const CHARGE: AbilityDefinition = {
    id: 'charge',
    name: 'Charge',
    type: AbilityType.Tactical,
    species: Species.Khaurans,
    description: 'Rush forward, knock back enemies.',
    targetingMode: TargetingMode.Directional,
    cooldown: 20,
    duration: 0.5,
    range: 12,
    radius: 2,
    castTime: 0.1,
    interruptible: false,
    canMoveWhileCasting: false,
    visualId: 'dash_charge',
    soundId: 'ability_charge',
    effects: [
        {
            type: EffectType.Teleport,
            target: EffectTarget.Self,
            value: 12,
            duration: 0.5,
        },
        {
            type: EffectType.Knockback,
            target: EffectTarget.Enemies,
            value: 10,
            duration: 0,
        },
        {
            type: EffectType.Damage,
            target: EffectTarget.Enemies,
            value: 50,
            duration: 0,
        },
    ],
};

const GROUND_STOMP: AbilityDefinition = {
    id: 'ground_stomp',
    name: 'Ground Stomp',
    type: AbilityType.Tactical,
    species: Species.Khaurans,
    description: 'AOE knockdown around you.',
    targetingMode: TargetingMode.SelfAOE,
    cooldown: 25,
    duration: 1,
    range: 0,
    radius: 6,
    castTime: 0.3,
    interruptible: false,
    canMoveWhileCasting: false,
    visualId: 'aoe_stomp',
    soundId: 'ability_stomp',
    effects: [
        {
            type: EffectType.Stun,
            target: EffectTarget.Enemies,
            value: 1,
            duration: 1,
        },
        {
            type: EffectType.Damage,
            target: EffectTarget.Enemies,
            value: 40,
            duration: 0,
        },
    ],
};

const PROTECTIVE_STANCE: AbilityDefinition = {
    id: 'protective_stance',
    name: 'Protective Stance',
    type: AbilityType.Tactical,
    species: Species.Khaurans,
    description: '50% damage reduction while stationary.',
    targetingMode: TargetingMode.Toggle,
    cooldown: 30,
    duration: 5,
    range: 0,
    radius: 0,
    castTime: 0.2,
    interruptible: true,
    canMoveWhileCasting: false,
    visualId: 'stance_protect',
    soundId: 'ability_stance',
    effects: [{
        type: EffectType.DamageResistance,
        target: EffectTarget.Self,
        value: 0.5,
        duration: 5,
    }],
};

const BATTLE_CRY: AbilityDefinition = {
    id: 'battle_cry',
    name: 'Battle Cry',
    type: AbilityType.Tactical,
    species: Species.Khaurans,
    description: 'Nearby allies gain 20% damage boost for 5 seconds.',
    targetingMode: TargetingMode.SelfAOE,
    cooldown: 35,
    duration: 5,
    range: 0,
    radius: 10,
    castTime: 0.2,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'buff_cry',
    soundId: 'ability_cry',
    effects: [{
        type: EffectType.DamageModifier,
        target: EffectTarget.Allies,
        value: 1.2,
        duration: 5,
    }],
};

const UNSTOPPABLE_FORCE: AbilityDefinition = {
    id: 'unstoppable_force',
    name: 'Unstoppable Force',
    type: AbilityType.Ultimate,
    species: Species.Khaurans,
    description: 'Cannot be stopped or slowed for 10 seconds.',
    targetingMode: TargetingMode.Self,
    cooldown: 90,
    duration: 10,
    range: 0,
    radius: 0,
    castTime: 0.2,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'ult_unstoppable',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [{
        type: EffectType.SpeedModifier,
        target: EffectTarget.Self,
        value: 1.3,
        duration: 10,
    }],
};

const SHIELD_WALL: AbilityDefinition = {
    id: 'shield_wall',
    name: 'Shield Wall',
    type: AbilityType.Ultimate,
    species: Species.Khaurans,
    description: 'Massive barrier for the team, 8 seconds.',
    targetingMode: TargetingMode.GroundTarget,
    cooldown: 100,
    duration: 8,
    range: 15,
    radius: 0,
    castTime: 0.5,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'ult_wall',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [{
        type: EffectType.Barrier,
        target: EffectTarget.Allies,
        value: 2000,
        duration: 8,
        barrier: {
            type: 'wall',
            health: 2000,
            width: 8,
            height: 4,
            blocksEnemyFire: true,
            blocksAllyFire: false,
            blocksMovement: false,
        },
    }],
};

const EXECUTION_MODE: AbilityDefinition = {
    id: 'execution_mode',
    name: 'Execution Mode',
    type: AbilityType.Ultimate,
    species: Species.Khaurans,
    description: 'Deal 50% more damage to low-health enemies for 12 seconds.',
    targetingMode: TargetingMode.Self,
    cooldown: 110,
    duration: 12,
    range: 0,
    radius: 0,
    castTime: 0.3,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'ult_execute',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [{
        type: EffectType.DamageModifier,
        target: EffectTarget.Self,
        value: 1.5, // Conditional on target health in combat system
        duration: 12,
    }],
};

// =============================================================================
// ZYNNI ABILITIES (Rats) - Sample set
// =============================================================================

const SCRAP_SHIELD: AbilityDefinition = {
    id: 'scrap_shield',
    name: 'Scrap Shield',
    type: AbilityType.Tactical,
    species: Species.Zynni,
    description: 'Deploy a small recycled barrier.',
    targetingMode: TargetingMode.GroundTarget,
    cooldown: 18,
    duration: 8,
    range: 8,
    radius: 0,
    castTime: 0.2,
    interruptible: true,
    canMoveWhileCasting: true,
    visualId: 'barrier_scrap',
    soundId: 'ability_build',
    effects: [{
        type: EffectType.Barrier,
        target: EffectTarget.Self,
        value: 200,
        duration: 8,
        barrier: {
            type: 'wall',
            health: 200,
            width: 2,
            height: 1.5,
            blocksEnemyFire: true,
            blocksAllyFire: false,
            blocksMovement: true,
        },
    }],
};

const SPEED_BURST: AbilityDefinition = {
    id: 'speed_burst',
    name: 'Speed Burst',
    type: AbilityType.Tactical,
    species: Species.Zynni,
    description: '50% movement speed for 4 seconds.',
    targetingMode: TargetingMode.Self,
    cooldown: 22,
    duration: 4,
    range: 0,
    radius: 0,
    castTime: 0,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'buff_speed',
    soundId: 'ability_speed',
    effects: [{
        type: EffectType.SpeedModifier,
        target: EffectTarget.Self,
        value: 1.5,
        duration: 4,
    }],
};

const HEALING_PACK: AbilityDefinition = {
    id: 'healing_pack',
    name: 'Healing Pack',
    type: AbilityType.Tactical,
    species: Species.Zynni,
    description: 'Drop a health kit for allies.',
    targetingMode: TargetingMode.GroundTarget,
    cooldown: 28,
    duration: 15,
    range: 10,
    radius: 2,
    castTime: 0.2,
    interruptible: true,
    canMoveWhileCasting: true,
    visualId: 'item_heal',
    soundId: 'ability_drop',
    effects: [{
        type: EffectType.Heal,
        target: EffectTarget.Allies,
        value: 75,
        duration: 0,
    }],
};

const SPIKE_TRAP: AbilityDefinition = {
    id: 'spike_trap',
    name: 'Spike Trap',
    type: AbilityType.Tactical,
    species: Species.Zynni,
    description: 'Place a damaging trap on the ground.',
    targetingMode: TargetingMode.GroundTarget,
    cooldown: 30,
    duration: 30,
    range: 12,
    radius: 1.5,
    castTime: 0.3,
    interruptible: true,
    canMoveWhileCasting: false,
    visualId: 'trap_spike',
    soundId: 'ability_trap',
    effects: [{
        type: EffectType.Damage,
        target: EffectTarget.Enemies,
        value: 60,
        duration: 0,
    }],
};

const SWARM_CALL: AbilityDefinition = {
    id: 'swarm_call',
    name: 'Swarm Call',
    type: AbilityType.Ultimate,
    species: Species.Zynni,
    description: 'Summon 3 AI Zynni that distract enemies.',
    targetingMode: TargetingMode.GroundTarget,
    cooldown: 100,
    duration: 12,
    range: 15,
    radius: 5,
    castTime: 0.5,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'ult_swarm',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [{
        type: EffectType.Summon,
        target: EffectTarget.Enemies,
        value: 3,
        duration: 12,
        summon: {
            count: 3,
            summonType: 'zynni_decoy',
            health: 75,
            damage: 15,
            speed: 10,
            lifetime: 12,
            behavior: 'distract',
        },
    }],
};

const SCRAP_ARMOR: AbilityDefinition = {
    id: 'scrap_armor',
    name: 'Scrap Armor',
    type: AbilityType.Ultimate,
    species: Species.Zynni,
    description: 'Grant temporary overshield for entire team.',
    targetingMode: TargetingMode.Instant,
    cooldown: 110,
    duration: 8,
    range: 0,
    radius: 100,
    castTime: 0.3,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'ult_armor',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [{
        type: EffectType.Shield,
        target: EffectTarget.Allies,
        value: 100,
        duration: 8,
    }],
};

const EMP_BLAST: AbilityDefinition = {
    id: 'emp_blast',
    name: 'EMP Blast',
    type: AbilityType.Ultimate,
    species: Species.Zynni,
    description: 'Disable all enemy abilities in radius for 4 seconds.',
    targetingMode: TargetingMode.SelfAOE,
    cooldown: 90,
    duration: 4,
    range: 0,
    radius: 15,
    castTime: 0.3,
    interruptible: false,
    canMoveWhileCasting: true,
    visualId: 'ult_emp',
    soundId: 'ultimate_activate',
    ultimateChargeRequired: 100,
    effects: [{
        type: EffectType.Silence,
        target: EffectTarget.Enemies,
        value: 1,
        duration: 4,
    }],
};

// =============================================================================
// ABILITY REGISTRY
// =============================================================================

/** All ability definitions indexed by ID */
export const ABILITIES: Record<string, AbilityDefinition> = {
    // Urshari
    deployable_cover: DEPLOYABLE_COVER,
    self_heal: SELF_HEAL,
    knockback_roar: KNOCKBACK_ROAR,
    honey_trap: HONEY_TRAP,
    invulnerability_shell: INVULNERABILITY_SHELL,
    team_damage_reduction: TEAM_DAMAGE_REDUCTION,
    rampage_mode: RAMPAGE_MODE,

    // Aeonids
    gust_dash: GUST_DASH,
    updraft: UPDRAFT,
    dive_strike: DIVE_STRIKE,
    radar_pulse: RADAR_PULSE,
    sky_supremacy: SKY_SUPREMACY,
    tailwind_aura: TAILWIND_AURA,
    aerial_bombardment: AERIAL_BOMBARDMENT,

    // Vexis
    venom_spit: VENOM_SPIT,
    shed_skin: SHED_SKIN,
    constrict: CONSTRICT,
    heat_vision: HEAT_VISION,
    basilisk_stare: BASILISK_STARE,
    serpent_swarm: SERPENT_SWARM,
    toxic_cloud: TOXIC_CLOUD,
    molt: MOLT,

    // Khaurans
    charge: CHARGE,
    ground_stomp: GROUND_STOMP,
    protective_stance: PROTECTIVE_STANCE,
    battle_cry: BATTLE_CRY,
    unstoppable_force: UNSTOPPABLE_FORCE,
    shield_wall: SHIELD_WALL,
    execution_mode: EXECUTION_MODE,

    // Zynni
    scrap_shield: SCRAP_SHIELD,
    speed_burst: SPEED_BURST,
    healing_pack: HEALING_PACK,
    spike_trap: SPIKE_TRAP,
    swarm_call: SWARM_CALL,
    scrap_armor: SCRAP_ARMOR,
    emp_blast: EMP_BLAST,
};

/** Get all abilities */
export function getAllAbilities(): AbilityDefinition[] {
    return Object.values(ABILITIES);
}

/** Get abilities by species */
export function getAbilitiesBySpecies(species: Species): AbilityDefinition[] {
    return getAllAbilities().filter(a => a.species === species);
}

/** Get abilities by type */
export function getAbilitiesByType(type: AbilityType): AbilityDefinition[] {
    return getAllAbilities().filter(a => a.type === type);
}

/** Get tactical abilities for a species */
export function getTacticalAbilities(species: Species): AbilityDefinition[] {
    return getAbilitiesBySpecies(species).filter(a => a.type === AbilityType.Tactical);
}

/** Get ultimate abilities for a species */
export function getUltimateAbilities(species: Species): AbilityDefinition[] {
    return getAbilitiesBySpecies(species).filter(a => a.type === AbilityType.Ultimate);
}

/** Get an ability by ID */
export function getAbility(id: string): AbilityDefinition | undefined {
    return ABILITIES[id];
}

/** Get an ability by ID (throws if not found) */
export function getAbilityRequired(id: string): AbilityDefinition {
    const ability = ABILITIES[id];
    if (!ability) {
        throw new Error(`Ability not found: ${id}`);
    }
    return ability;
}
