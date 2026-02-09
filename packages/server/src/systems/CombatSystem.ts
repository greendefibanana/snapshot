/**
 * Combat System
 * 
 * Handles damage application, health management,
 * death, respawn, and kill attribution.
 */

import {
    type World,
    type EntityId,
    type TeamId,
    type Tick,
    type GameEvent,
    SIMULATION,
    COMBAT,
    getEntitiesWith,
    getComponent,
    getComponentRequired,
    hasComponent,
    removeEntity,
} from '@snapshot/shared';

// =============================================================================
// TYPES
// =============================================================================

export interface DamageInfo {
    /** Entity taking damage */
    targetId: EntityId;
    /** Entity dealing damage */
    sourceId: EntityId;
    /** Base damage amount */
    amount: number;
    /** Damage source (weapon ID, ability ID) */
    source: string;
    /** Is this damage from an ability */
    isAbilityDamage: boolean;
    /** Ignore damage resistance */
    ignoreResistance: boolean;
    /** Headshot multiplier (1.0 = no headshot) */
    headshotMultiplier: number;
}

export interface PendingDamage {
    info: DamageInfo;
    tick: Tick;
}

// =============================================================================
// DAMAGE QUEUE
// =============================================================================

/** Pending damage to be processed */
const damageQueue: PendingDamage[] = [];

/**
 * Queue damage to be processed this tick.
 */
export function queueDamage(info: DamageInfo, tick: Tick): void {
    damageQueue.push({ info, tick });
}

/**
 * Clear the damage queue.
 */
export function clearDamageQueue(): void {
    damageQueue.length = 0;
}

// =============================================================================
// COMBAT SYSTEM
// =============================================================================

/**
 * Process combat: damage, deaths, respawns.
 */
export function combatSystem(world: World, events: GameEvent[]): void {
    // Process all queued damage
    processDamageQueue(world, events);

    // Process deaths
    processDeaths(world, events);

    // Process respawns
    processRespawns(world, events);

    // Regenerate shields
    processShieldRegen(world);
}

/**
 * Process queued damage.
 */
function processDamageQueue(world: World, events: GameEvent[]): void {
    for (const { info, tick } of damageQueue) {
        applyDamage(world, info, events);
    }

    clearDamageQueue();
}

/**
 * Apply damage to a target entity.
 */
function applyDamage(
    world: World,
    info: DamageInfo,
    events: GameEvent[]
): number {
    const health = getComponent(world, info.targetId, 'health');
    const player = getComponent(world, info.targetId, 'player');
    const transform = getComponent(world, info.targetId, 'transform');

    if (!health || !player) {
        return 0;
    }

    // Validate damage source
    const sourcePlayer = getComponent(world, info.sourceId, 'player');
    if (!sourcePlayer || !sourcePlayer.isAlive) {
        return 0; // Dead players can't deal damage
    }

    // Check friendly fire (skip damage to teammates)
    if (!COMBAT.FRIENDLY_FIRE_ENABLED && player.teamId === sourcePlayer.teamId) {
        return 0;
    }

    // Check spawn protection
    if (player.spawnProtectionEndTick > world.tick) {
        return 0;
    }

    // Calculate final damage
    let damage = info.amount * info.headshotMultiplier;

    // Apply damage resistance from abilities
    if (!info.ignoreResistance) {
        const ability = getComponent(world, info.targetId, 'ability');
        if (ability) {
            for (const effect of ability.effects) {
                if (effect.effectType === 'damage_resistance') {
                    damage *= (1 - effect.value);
                }
            }
        }
    }

    // Apply damage to overshield first
    if (health.overshield > 0) {
        const overshieldDamage = Math.min(health.overshield, damage);
        health.overshield -= overshieldDamage;
        damage -= overshieldDamage;
    }

    // Apply damage to shield
    if (damage > 0 && health.shield > 0) {
        const shieldDamage = Math.min(health.shield, damage);
        health.shield -= shieldDamage;
        damage -= shieldDamage;

        // Reset shield regen timer
        health.shieldRegenStartTick = (world.tick + 180) as Tick; // 3 seconds
    }

    // Apply remaining damage to health
    if (damage > 0) {
        health.health = Math.max(0, health.health - damage);
    }

    const totalDamage = info.amount * info.headshotMultiplier;
    const isKill = health.health <= 0;

    // Record damage for assist tracking
    health.recentDamage.push({
        sourceEntityId: info.sourceId,
        amount: totalDamage,
        tick: world.tick,
        source: info.source,
    });

    // Prune old damage records (older than assist timeout)
    health.recentDamage = health.recentDamage.filter(
        d => (world.tick - d.tick) < COMBAT.ASSIST_TIMEOUT_TICKS
    );

    // Update stats
    sourcePlayer.stats.damageDealt += totalDamage;
    player.stats.damageTaken += totalDamage;

    // Emit damage event
    events.push({
        type: 'damage_dealt',
        targetId: info.targetId,
        sourceId: info.sourceId,
        amount: totalDamage,
        weapon: info.source,
    });

    // Emit hit feedback to attacker (for client hit markers)
    const hitPosition = transform?.position ?? { x: 0, y: 0, z: 0 };
    events.push({
        type: 'hit_feedback',
        sourceId: info.sourceId,
        targetId: info.targetId,
        damage: totalDamage,
        isHeadshot: info.headshotMultiplier > 1.0,
        isKill,
        hitPosition,
    });

    // Emit damage taken to victim (for damage direction indicator)
    const sourceTransform = getComponent(world, info.sourceId, 'transform');
    const direction = sourceTransform && transform ? {
        x: sourceTransform.position.x - transform.position.x,
        y: sourceTransform.position.y - transform.position.y,
        z: sourceTransform.position.z - transform.position.z,
    } : { x: 0, y: 0, z: 1 };

    events.push({
        type: 'damage_taken',
        targetId: info.targetId,
        direction,
        damage: totalDamage,
        remainingHealth: health.health,
        remainingShield: health.shield,
    });

    return totalDamage;
}

/**
 * Process deaths for entities at 0 health.
 */
function processDeaths(world: World, events: GameEvent[]): void {
    for (const [entityId, player] of getEntitiesWith(world, 'player')) {
        if (!player.isAlive) continue;

        const health = getComponent(world, entityId, 'health');
        if (!health || health.health > 0) continue;

        // Player died
        player.isAlive = false;
        player.deathTick = world.tick;
        player.stats.deaths++;

        // Find killer and assistants
        const killer = findKiller(world, health);
        const assistants = findAssists(world, health, killer?.entityId);

        // Award kill
        if (killer) {
            const killerPlayer = getComponent(world, killer.entityId, 'player');
            if (killerPlayer) {
                killerPlayer.stats.kills++;
            }
        }

        // Award assists
        for (const assistant of assistants) {
            const assistPlayer = getComponent(world, assistant.entityId, 'player');
            if (assistPlayer) {
                assistPlayer.stats.assists++;
            }
        }

        // Emit death event
        events.push({
            type: 'player_died',
            entityId,
            killerId: killer?.entityId ?? null,
            weapon: killer?.weapon ?? 'unknown',
        });
    }
}

/**
 * Find the entity that dealt the killing blow.
 */
function findKiller(
    world: World,
    health: { recentDamage: Array<{ sourceEntityId: EntityId; amount: number; tick: Tick; source: string }> }
): { entityId: EntityId; weapon: string } | null {
    if (health.recentDamage.length === 0) {
        return null;
    }

    // Most recent damager is the killer
    const lastDamage = health.recentDamage[health.recentDamage.length - 1]!;
    return {
        entityId: lastDamage.sourceEntityId,
        weapon: lastDamage.source,
    };
}

/**
 * Find entities that assisted in a kill.
 */
function findAssists(
    world: World,
    health: { recentDamage: Array<{ sourceEntityId: EntityId; amount: number; tick: Tick; source: string }> },
    killerEntityId: EntityId | undefined
): Array<{ entityId: EntityId }> {
    const assists: Array<{ entityId: EntityId }> = [];
    const seen = new Set<number>();

    for (const damage of health.recentDamage) {
        // Skip the killer
        if (damage.sourceEntityId === killerEntityId) continue;

        // Skip duplicates
        if (seen.has(damage.sourceEntityId)) continue;
        seen.add(damage.sourceEntityId);

        // Check if still within assist window
        if ((world.tick - damage.tick) < COMBAT.ASSIST_TIMEOUT_TICKS) {
            assists.push({ entityId: damage.sourceEntityId });
        }
    }

    return assists;
}

/**
 * Process respawns for dead players.
 */
function processRespawns(world: World, events: GameEvent[]): void {
    for (const [entityId, player] of getEntitiesWith(world, 'player')) {
        if (player.isAlive) continue;

        // Check if respawn delay has passed
        const ticksSinceDeath = world.tick - player.deathTick;
        if (ticksSinceDeath < COMBAT.RESPAWN_DELAY_TICKS) continue;

        // Respawn the player
        respawnPlayer(world, entityId, events);
    }
}

/**
 * Respawn a dead player.
 */
function respawnPlayer(
    world: World,
    entityId: EntityId,
    events: GameEvent[]
): void {
    const player = getComponent(world, entityId, 'player');
    const health = getComponent(world, entityId, 'health');
    const transform = getComponent(world, entityId, 'transform');
    const weapon = getComponent(world, entityId, 'weapon');

    if (!player || !health || !transform) return;

    // Restore health
    health.health = health.maxHealth;
    health.shield = health.maxShield;
    health.overshield = 0;
    health.recentDamage = [];

    // Reset position to spawn point
    // TODO: Get spawn point from map/mode system
    const spawnPoint = getSpawnPoint(world, player.teamId);
    transform.position = spawnPoint;

    // Reset weapon state
    if (weapon) {
        for (const state of weapon.weaponStates) {
            if (state) {
                state.ammo = 30; // Reset to max (get from weapon definition)
                state.isReloading = false;
                state.chargeLevel = 0;
            }
        }
        weapon.activeSlot = 0;
    }

    // Mark as alive with spawn protection
    player.isAlive = true;
    player.spawnProtectionEndTick = (world.tick + COMBAT.SPAWN_PROTECTION_TICKS) as Tick;

    // Emit spawn event
    events.push({
        type: 'player_spawned',
        entityId,
        position: spawnPoint,
    });
}

/**
 * Get a spawn point for a team.
 * TODO: Implement proper spawn point selection from map data.
 */
function getSpawnPoint(world: World, teamId: TeamId): { x: number; y: number; z: number } {
    // Placeholder spawn points
    const spawns = {
        1: { x: -20, y: 1, z: 0 },
        2: { x: 20, y: 1, z: 0 },
    };

    return spawns[teamId as 1 | 2] ?? { x: 0, y: 1, z: 0 };
}

/**
 * Process shield regeneration.
 */
function processShieldRegen(world: World): void {
    for (const [entityId, player] of getEntitiesWith(world, 'player')) {
        if (!player.isAlive) continue;

        const health = getComponent(world, entityId, 'health');
        if (!health) continue;

        // Check if shield regen has started
        if (world.tick < health.shieldRegenStartTick) continue;

        // Regenerate shield
        if (health.shield < health.maxShield) {
            health.shield = Math.min(
                health.maxShield,
                health.shield + health.shieldRegenRate * SIMULATION.TICK_DELTA
            );
        }
    }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Deal damage to an entity (convenience function).
 */
export function dealDamage(
    world: World,
    targetId: EntityId,
    sourceId: EntityId,
    amount: number,
    source: string,
    options: Partial<{
        isAbilityDamage: boolean;
        ignoreResistance: boolean;
        headshotMultiplier: number;
    }> = {}
): void {
    queueDamage({
        targetId,
        sourceId,
        amount,
        source,
        isAbilityDamage: options.isAbilityDamage ?? false,
        ignoreResistance: options.ignoreResistance ?? false,
        headshotMultiplier: options.headshotMultiplier ?? 1.0,
    }, world.tick);
}

/**
 * Heal an entity.
 */
export function healEntity(
    world: World,
    entityId: EntityId,
    amount: number,
    healerId?: EntityId
): number {
    const health = getComponent(world, entityId, 'health');
    if (!health) return 0;

    const healAmount = Math.min(health.maxHealth - health.health, amount);
    health.health += healAmount;

    // Track healing stats
    if (healerId) {
        const healer = getComponent(world, healerId, 'player');
        if (healer) {
            healer.stats.healingDone += healAmount;
        }
    }

    return healAmount;
}

/**
 * Apply overshield to an entity.
 */
export function applyOvershield(
    world: World,
    entityId: EntityId,
    amount: number,
    durationTicks: number
): void {
    const health = getComponent(world, entityId, 'health');
    if (!health) return;

    health.overshield = Math.max(health.overshield, amount);
    health.overshieldEndTick = (world.tick + durationTicks) as Tick;
}
