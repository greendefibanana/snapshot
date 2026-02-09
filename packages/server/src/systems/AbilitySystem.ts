/**
 * Ability System
 * 
 * Handles ability activation, validation, execution,
 * cooldowns, and ultimate charge.
 */

import {
    type World,
    type EntityId,
    type Tick,
    type GameEvent,
    type Vector3,
    Vec3,
    SIMULATION,
    ULTIMATE_CHARGE,
    getEntitiesWith,
    getComponent,
    AbilityType,
    TargetingMode,
    type AbilityDefinition,
    type AbilityState,
} from '@snapshot/shared';

import { getAbility } from '@snapshot/shared';

// =============================================================================
// TYPES
// =============================================================================

export interface AbilityInput {
    slot: 0 | 1; // 0 = tactical, 1 = ultimate
    targetPosition?: Vector3;
    targetDirection?: Vector3;
    targetEntityId?: EntityId;
}

interface AbilityCast {
    entityId: EntityId;
    abilityId: string;
    startTick: Tick;
    endTick: Tick;
    targetPosition?: Vector3;
    targetDirection?: Vector3;
    targetEntityId?: EntityId;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const ABILITY_LIMITS = {
    MIN_TARGETING_TIME_TICKS: 30, // 0.5 seconds
    CANCEL_LOCKOUT_TICKS: 60,     // 1.0 seconds
    MAX_INPUTS_PER_SECOND: 5,
} as const;

// Active casts (entities currently casting)
const activeCasts: Map<EntityId, AbilityCast> = new Map();

// =============================================================================
// ABILITY SYSTEM
// =============================================================================

/**
 * Process abilities for all players.
 */
export function abilitySystem(world: World, events: GameEvent[]): void {
    // Process ability inputs
    processAbilityInputs(world, events);

    // Update active casts
    updateActiveCasts(world, events);

    // Update active abilities
    updateActiveAbilities(world, events);

    // Update cooldowns (already handled by tick comparison)

    // Update ultimate charge (passive)
    updatePassiveUltimateCharge(world);
}

/**
 * Process ability inputs from players.
 */
function processAbilityInputs(world: World, events: GameEvent[]): void {
    for (const [entityId, player] of getEntitiesWith(world, 'player')) {
        if (!player.isAlive) continue;

        const ability = getComponent(world, entityId, 'ability');
        const transform = getComponent(world, entityId, 'transform');
        const input = player.currentInput;

        if (!ability || !transform) continue;

        // Check for ability activation
        if (input.tactical) {
            tryActivateAbility(world, entityId, ability, transform, 0, input, events);
        }

        if (input.ultimate) {
            tryActivateAbility(world, entityId, ability, transform, 1, input, events);
        }
    }
}

/**
 * Try to activate an ability.
 */
function tryActivateAbility(
    world: World,
    entityId: EntityId,
    state: AbilityState,
    transform: { position: Vector3 },
    slot: 0 | 1,
    input: { aim: { yaw: number; pitch: number }; abilityTarget?: Vector3 },
    events: GameEvent[]
): void {
    const abilityId = slot === 0 ? state.tacticalId : state.ultimateId;
    const abilityDef = getAbility(abilityId);

    if (!abilityDef) return;

    // Check if already casting
    if (activeCasts.has(entityId)) return;

    // Check cooldown (tactical)
    if (slot === 0 && world.tick < state.tacticalReadyTick) return;

    // Check already active
    if (slot === 0 && state.isTacticalActive) return;
    if (slot === 1 && state.isUltimateActive) return;

    // Check ultimate charge
    if (slot === 1) {
        const required = abilityDef.ultimateChargeRequired ?? 100;
        if (state.ultimateCharge < required) return;
    }

    // Validate target
    const targetData = resolveTarget(abilityDef, transform, input);
    if (!validateTarget(world, entityId, abilityDef, targetData)) {
        return;
    }

    // Start cast or execute immediately
    if (abilityDef.castTime > 0) {
        startCast(world, entityId, abilityDef, targetData, events);
    } else {
        executeAbility(world, entityId, state, abilityDef, targetData, events);
    }
}

/**
 * Resolve target based on targeting mode.
 */
function resolveTarget(
    ability: AbilityDefinition,
    transform: { position: Vector3 },
    input: { aim: { yaw: number; pitch: number }; abilityTarget?: Vector3 }
): { position?: Vector3; direction?: Vector3; entityId?: EntityId } {
    switch (ability.targetingMode) {
        case TargetingMode.Instant:
        case TargetingMode.Self:
        case TargetingMode.SelfAOE:
            return { position: transform.position };

        case TargetingMode.GroundTarget:
            return { position: input.abilityTarget ?? transform.position };

        case TargetingMode.Directional:
            const dir = {
                x: -Math.sin(input.aim.yaw) * Math.cos(input.aim.pitch),
                y: Math.sin(input.aim.pitch),
                z: -Math.cos(input.aim.yaw) * Math.cos(input.aim.pitch),
            };
            return { direction: dir };

        case TargetingMode.SingleTarget:
            // Would need raycast to find target - placeholder
            return { entityId: undefined };

        default:
            return {};
    }
}

/**
 * Validate target for ability.
 */
function validateTarget(
    world: World,
    casterId: EntityId,
    ability: AbilityDefinition,
    target: { position?: Vector3; direction?: Vector3; entityId?: EntityId }
): boolean {
    const casterTransform = getComponent(world, casterId, 'transform');
    if (!casterTransform) return false;

    // Range check for ground-targeted abilities
    if (target.position && ability.range > 0) {
        const distance = Vec3.distance(casterTransform.position, target.position);
        if (distance > ability.range) return false;
    }

    // Single target validation
    if (ability.targetingMode === TargetingMode.SingleTarget) {
        if (!target.entityId) return false;

        const targetPlayer = getComponent(world, target.entityId, 'player');
        if (!targetPlayer || !targetPlayer.isAlive) return false;

        // Check range to target
        const targetTransform = getComponent(world, target.entityId, 'transform');
        if (targetTransform) {
            const distance = Vec3.distance(casterTransform.position, targetTransform.position);
            if (distance > ability.range) return false;
        }
    }

    return true;
}

/**
 * Start casting an ability.
 */
function startCast(
    world: World,
    entityId: EntityId,
    ability: AbilityDefinition,
    target: { position?: Vector3; direction?: Vector3; entityId?: EntityId },
    events: GameEvent[]
): void {
    const castTicks = Math.ceil(ability.castTime * SIMULATION.TICK_RATE);

    activeCasts.set(entityId, {
        entityId,
        abilityId: ability.id,
        startTick: world.tick,
        endTick: (world.tick + castTicks) as Tick,
        targetPosition: target.position,
        targetDirection: target.direction,
        targetEntityId: target.entityId,
    });

    // Emit telegraph event for clients
    events.push({
        type: 'ability_activated',
        entityId,
        abilityId: ability.id,
    });
}

/**
 * Update active casts.
 */
function updateActiveCasts(world: World, events: GameEvent[]): void {
    for (const [entityId, cast] of activeCasts) {
        // Check if cast complete
        if (world.tick >= cast.endTick) {
            const ability = getComponent(world, entityId, 'ability');
            const abilityDef = getAbility(cast.abilityId);

            if (ability && abilityDef) {
                const slot = abilityDef.type === AbilityType.Tactical ? 0 : 1;
                executeAbility(world, entityId, ability, abilityDef, {
                    position: cast.targetPosition,
                    direction: cast.targetDirection,
                    entityId: cast.targetEntityId,
                }, events);
            }

            activeCasts.delete(entityId);
        }

        // Check if caster died or was interrupted
        const player = getComponent(world, entityId, 'player');
        const abilityDef = getAbility(cast.abilityId);

        if (!player?.isAlive && abilityDef?.interruptible) {
            activeCasts.delete(entityId);
        }
    }
}

/**
 * Execute an ability.
 */
function executeAbility(
    world: World,
    entityId: EntityId,
    state: AbilityState,
    ability: AbilityDefinition,
    target: { position?: Vector3; direction?: Vector3; entityId?: EntityId },
    events: GameEvent[]
): void {
    const isTactical = ability.type === AbilityType.Tactical;

    // Start cooldown / consume charge
    if (isTactical) {
        const cooldownTicks = Math.ceil(ability.cooldown * SIMULATION.TICK_RATE);
        state.tacticalReadyTick = (world.tick + cooldownTicks);
        state.isTacticalActive = ability.duration > 0;
        state.tacticalEndTick = (world.tick + Math.ceil(ability.duration * SIMULATION.TICK_RATE));
    } else {
        state.ultimateCharge = 0;
        state.isUltimateActive = ability.duration > 0;
        state.ultimateEndTick = (world.tick + Math.ceil(ability.duration * SIMULATION.TICK_RATE));
    }

    // Apply effects
    applyAbilityEffects(world, entityId, ability, target, events);

    // Emit activation event
    events.push({
        type: 'ability_activated',
        entityId,
        abilityId: ability.id,
    });
}

/**
 * Apply ability effects.
 */
function applyAbilityEffects(
    world: World,
    casterId: EntityId,
    ability: AbilityDefinition,
    target: { position?: Vector3; direction?: Vector3; entityId?: EntityId },
    events: GameEvent[]
): void {
    const casterPlayer = getComponent(world, casterId, 'player');
    if (!casterPlayer) return;

    for (const effect of ability.effects) {
        // Find targets based on effect.target
        const targets = findEffectTargets(world, casterId, casterPlayer.teamId, ability, effect, target);

        // Apply effect to each target
        for (const targetId of targets) {
            applyEffect(world, targetId, casterId, ability.id, effect, events);
        }
    }
}

/**
 * Find targets for an effect.
 */
function findEffectTargets(
    world: World,
    casterId: EntityId,
    casterTeam: number,
    ability: AbilityDefinition,
    effect: { target: string },
    target: { position?: Vector3 }
): EntityId[] {
    const targets: EntityId[] = [];
    const center = target.position ?? { x: 0, y: 0, z: 0 };

    for (const [entityId, player] of getEntitiesWith(world, 'player')) {
        if (!player.isAlive) continue;

        const transform = getComponent(world, entityId, 'transform');
        if (!transform) continue;

        // Check if in range
        const distance = Vec3.distance(center, transform.position);
        if (distance > ability.radius) continue;

        // Check target filter
        const isSelf = entityId === casterId;
        const isAlly = player.teamId === casterTeam;
        const isEnemy = !isAlly;

        switch (effect.target) {
            case 'self':
                if (isSelf) targets.push(entityId);
                break;
            case 'allies':
                if (isAlly) targets.push(entityId);
                break;
            case 'allies_only':
                if (isAlly && !isSelf) targets.push(entityId);
                break;
            case 'enemies':
                if (isEnemy) targets.push(entityId);
                break;
            case 'all':
                targets.push(entityId);
                break;
        }
    }

    return targets;
}

/**
 * Apply a single effect to a target.
 */
function applyEffect(
    world: World,
    targetId: EntityId,
    sourceId: EntityId,
    abilityId: string,
    effect: { type: string; value: number; duration: number },
    events: GameEvent[]
): void {
    const ability = getComponent(world, targetId, 'ability');
    if (!ability) return;

    // Add to active effects
    const effectId = Date.now() + Math.random();
    ability.activeEffects.push({
        id: effectId,
        abilityId,
        effectType: effect.type as any,
        value: effect.value,
        sourceEntityId: sourceId,
        startTick: world.tick,
        endTick: world.tick + Math.ceil(effect.duration * SIMULATION.TICK_RATE),
        stacks: 1,
        lastTickApplied: world.tick,
    });
}

/**
 * Update active abilities (check for expiration).
 */
function updateActiveAbilities(world: World, events: GameEvent[]): void {
    for (const [entityId, player] of getEntitiesWith(world, 'player')) {
        const ability = getComponent(world, entityId, 'ability');
        if (!ability) continue;

        // Check tactical expiration
        if (ability.isTacticalActive && world.tick >= ability.tacticalEndTick) {
            ability.isTacticalActive = false;
            events.push({
                type: 'ability_ended',
                entityId,
                abilityId: ability.tacticalId,
            });
        }

        // Check ultimate expiration
        if (ability.isUltimateActive && world.tick >= ability.ultimateEndTick) {
            ability.isUltimateActive = false;
            events.push({
                type: 'ability_ended',
                entityId,
                abilityId: ability.ultimateId,
            });
        }

        // Prune expired effects
        ability.activeEffects = ability.activeEffects.filter(
            e => world.tick < e.endTick
        );
    }
}

/**
 * Update passive ultimate charge.
 */
function updatePassiveUltimateCharge(world: World): void {
    for (const [entityId, player] of getEntitiesWith(world, 'player')) {
        if (!player.isAlive) continue;

        const ability = getComponent(world, entityId, 'ability');
        if (!ability) continue;

        // Add passive charge
        ability.ultimateCharge = Math.min(
            ULTIMATE_CHARGE.MAX,
            ability.ultimateCharge + ULTIMATE_CHARGE.PASSIVE_PER_TICK
        );
    }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Add ultimate charge from combat actions.
 */
export function addUltimateCharge(
    world: World,
    entityId: EntityId,
    type: 'damage' | 'kill' | 'assist',
    value: number
): void {
    const ability = getComponent(world, entityId, 'ability');
    if (!ability) return;

    let chargeAmount = 0;
    switch (type) {
        case 'damage':
            chargeAmount = value * ULTIMATE_CHARGE.PER_DAMAGE_DEALT;
            break;
        case 'kill':
            chargeAmount = ULTIMATE_CHARGE.PER_ELIMINATION;
            break;
        case 'assist':
            chargeAmount = ULTIMATE_CHARGE.PER_ASSIST;
            break;
    }

    ability.ultimateCharge = Math.min(ULTIMATE_CHARGE.MAX, ability.ultimateCharge + chargeAmount);
}

/**
 * Interrupt an ability cast.
 */
export function interruptCast(entityId: EntityId): boolean {
    const cast = activeCasts.get(entityId);
    if (!cast) return false;

    const abilityDef = getAbility(cast.abilityId);
    if (abilityDef?.interruptible) {
        activeCasts.delete(entityId);
        return true;
    }

    return false;
}
