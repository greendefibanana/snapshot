/**
 * Effect Processor
 * 
 * Processes active effects (DoT, HoT, buffs, debuffs)
 * and applies their tick-based effects.
 */

import {
    type World,
    type EntityId,
    type Tick,
    type GameEvent,
    SIMULATION,
    EffectType,
    getEntitiesWith,
    getComponent,
} from '@snapshot/shared';

import { dealDamage, healEntity } from './CombatSystem.js';

// =============================================================================
// EFFECT PROCESSOR
// =============================================================================

/**
 * Process active effects on all entities.
 */
export function effectProcessor(world: World, events: GameEvent[]): void {
    for (const [entityId, player] of getEntitiesWith(world, 'player')) {
        const ability = getComponent(world, entityId, 'ability');
        if (!ability) continue;

        // Process each active effect
        for (const effect of ability.activeEffects) {
            processEffect(world, entityId, effect, events);
        }
    }
}

/**
 * Process a single active effect.
 */
function processEffect(
    world: World,
    targetId: EntityId,
    effect: {
        effectType: EffectType | string;
        value: number;
        sourceEntityId: number;
        startTick: number;
        endTick: number;
        lastTickApplied: number;
    },
    events: GameEvent[]
): void {
    // Check if effect should tick
    const tickRate = 1; // 1 tick per second default
    const tickInterval = Math.ceil(SIMULATION.TICK_RATE / tickRate);

    if (world.tick - effect.lastTickApplied < tickInterval) {
        return; // Not time to tick yet
    }

    // Update last tick
    effect.lastTickApplied = world.tick;

    // Apply effect based on type
    switch (effect.effectType) {
        case EffectType.DamageOverTime:
        case 'damage_over_time':
            dealDamage(world, targetId, effect.sourceEntityId, effect.value, 'dot', {
                isAbilityDamage: true,
            });
            break;

        case EffectType.HealOverTime:
        case 'heal_over_time':
            healEntity(world, targetId, effect.value, effect.sourceEntityId);
            break;

        // Modifier effects are read by other systems, no processing needed here
        case EffectType.SpeedModifier:
        case EffectType.DamageModifier:
        case EffectType.DamageResistance:
        case 'speed_modifier':
        case 'damage_modifier':
        case 'damage_resistance':
            // These are checked by movement/combat systems
            break;

        default:
            // Most effects are applied once on activation, not per-tick
            break;
    }
}

// =============================================================================
// EFFECT QUERIES
// =============================================================================

/**
 * Get total speed modifier from active effects.
 */
export function getSpeedModifier(world: World, entityId: EntityId): number {
    const ability = getComponent(world, entityId, 'ability');
    if (!ability) return 1.0;

    let modifier = 1.0;

    for (const effect of ability.activeEffects) {
        if (effect.effectType === EffectType.SpeedModifier || effect.effectType === 'speed_modifier') {
            modifier *= effect.value;
        }
        if (effect.effectType === EffectType.Slow || effect.effectType === 'slow') {
            modifier *= (1 - effect.value);
        }
        if (effect.effectType === EffectType.Root || effect.effectType === 'root') {
            modifier = 0;
        }
        if (effect.effectType === EffectType.Stun || effect.effectType === 'stun') {
            modifier = 0;
        }
    }

    return modifier;
}

/**
 * Get total damage modifier from active effects.
 */
export function getDamageModifier(world: World, entityId: EntityId): number {
    const ability = getComponent(world, entityId, 'ability');
    if (!ability) return 1.0;

    let modifier = 1.0;

    for (const effect of ability.activeEffects) {
        if (effect.effectType === EffectType.DamageModifier || effect.effectType === 'damage_modifier') {
            modifier *= effect.value;
        }
    }

    return modifier;
}

/**
 * Get total damage resistance from active effects.
 */
export function getDamageResistance(world: World, entityId: EntityId): number {
    const ability = getComponent(world, entityId, 'ability');
    if (!ability) return 0;

    let resistance = 0;

    for (const effect of ability.activeEffects) {
        if (effect.effectType === EffectType.DamageResistance || effect.effectType === 'damage_resistance') {
            resistance = Math.max(resistance, effect.value);
        }
        if (effect.effectType === EffectType.Invulnerability || effect.effectType === 'invulnerability') {
            return 1.0; // Full immunity
        }
    }

    return Math.min(resistance, 0.9); // Cap at 90% resistance
}

/**
 * Check if entity is stunned.
 */
export function isStunned(world: World, entityId: EntityId): boolean {
    const ability = getComponent(world, entityId, 'ability');
    if (!ability) return false;

    return ability.activeEffects.some(
        e => e.effectType === EffectType.Stun || e.effectType === 'stun'
    );
}

/**
 * Check if entity is rooted.
 */
export function isRooted(world: World, entityId: EntityId): boolean {
    const ability = getComponent(world, entityId, 'ability');
    if (!ability) return false;

    return ability.activeEffects.some(
        e => e.effectType === EffectType.Root || e.effectType === 'root'
    );
}

/**
 * Check if entity is silenced.
 */
export function isSilenced(world: World, entityId: EntityId): boolean {
    const ability = getComponent(world, entityId, 'ability');
    if (!ability) return false;

    return ability.activeEffects.some(
        e => e.effectType === EffectType.Silence || e.effectType === 'silence'
    );
}

/**
 * Check if entity is invisible.
 */
export function isInvisible(world: World, entityId: EntityId): boolean {
    const ability = getComponent(world, entityId, 'ability');
    if (!ability) return false;

    return ability.activeEffects.some(
        e => e.effectType === EffectType.Invisibility || e.effectType === 'invisibility'
    );
}

/**
 * Check if entity can fly.
 */
export function canFly(world: World, entityId: EntityId): boolean {
    const ability = getComponent(world, entityId, 'ability');
    if (!ability) return false;

    return ability.activeEffects.some(
        e => e.effectType === EffectType.Flight || e.effectType === 'flight'
    );
}
