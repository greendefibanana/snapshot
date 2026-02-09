/**
 * Game World
 * 
 * Central data structure holding all entities and components.
 * Used by both client (for prediction) and server (authoritative).
 */

import type { EntityId, Tick } from '../types/index.js';
import type {
    TransformComponent,
    PhysicsComponent,
    PlayerComponent,
    HealthComponent,
    WeaponComponent,
    AbilityComponent,
    ProjectileComponent,
    ZoneComponent,
    BarrierComponent,
    SummonComponent,
    ObjectiveComponent,
} from './components.js';

// =============================================================================
// COMPONENT STORES - Type-safe component storage
// =============================================================================

/**
 * All component types in the game.
 * Add new component types here to extend the ECS.
 */
export interface ComponentStores {
    transform: Map<EntityId, TransformComponent>;
    physics: Map<EntityId, PhysicsComponent>;
    player: Map<EntityId, PlayerComponent>;
    health: Map<EntityId, HealthComponent>;
    weapon: Map<EntityId, WeaponComponent>;
    ability: Map<EntityId, AbilityComponent>;
    projectile: Map<EntityId, ProjectileComponent>;
    zone: Map<EntityId, ZoneComponent>;
    barrier: Map<EntityId, BarrierComponent>;
    summon: Map<EntityId, SummonComponent>;
    objective: Map<EntityId, ObjectiveComponent>;

    // Extension point: Add new component types here
}

/** Component type names */
export type ComponentType = keyof ComponentStores;

/** Get component type from store */
export type ComponentOf<T extends ComponentType> = ComponentStores[T] extends Map<EntityId, infer C> ? C : never;

// =============================================================================
// GAME WORLD - The complete game state
// =============================================================================

/**
 * The complete game world state.
 * This is the single source of truth for game simulation.
 */
export interface World {
    /** Current simulation tick */
    tick: Tick;

    /** All active entity IDs */
    entities: Set<EntityId>;

    /** Next entity ID to assign */
    nextEntityId: number;

    /** All component stores */
    components: ComponentStores;

    /** Entity to component type mapping (for fast queries) */
    entityComponents: Map<EntityId, Set<ComponentType>>;

    /** Pending entity removals (processed at end of tick) */
    pendingRemovals: Set<EntityId>;
}

// =============================================================================
// WORLD FACTORY
// =============================================================================

/**
 * Create an empty game world.
 */
export function createWorld(): World {
    return {
        tick: 0 as Tick,
        entities: new Set(),
        nextEntityId: 1,
        components: {
            transform: new Map(),
            physics: new Map(),
            player: new Map(),
            health: new Map(),
            weapon: new Map(),
            ability: new Map(),
            projectile: new Map(),
            zone: new Map(),
            barrier: new Map(),
            summon: new Map(),
            objective: new Map(),
        },
        entityComponents: new Map(),
        pendingRemovals: new Set(),
    };
}

// =============================================================================
// ENTITY OPERATIONS
// =============================================================================

/**
 * Create a new entity in the world.
 * Returns the entity ID.
 */
export function createEntity(world: World): EntityId {
    const id = world.nextEntityId as EntityId;
    world.nextEntityId++;
    world.entities.add(id);
    world.entityComponents.set(id, new Set());
    return id;
}

/**
 * Mark an entity for removal.
 * Entity will be removed at the end of the current tick.
 */
export function removeEntity(world: World, entityId: EntityId): void {
    world.pendingRemovals.add(entityId);
}

/**
 * Process pending entity removals.
 * Called at the end of each tick.
 */
export function processPendingRemovals(world: World): EntityId[] {
    const removed: EntityId[] = [];

    for (const entityId of world.pendingRemovals) {
        // Remove from entity set
        world.entities.delete(entityId);

        // Remove all components
        const componentTypes = world.entityComponents.get(entityId);
        if (componentTypes) {
            for (const type of componentTypes) {
                world.components[type].delete(entityId);
            }
        }

        // Remove component tracking
        world.entityComponents.delete(entityId);

        removed.push(entityId);
    }

    world.pendingRemovals.clear();

    return removed;
}

/**
 * Check if an entity exists in the world.
 */
export function entityExists(world: World, entityId: EntityId): boolean {
    return world.entities.has(entityId) && !world.pendingRemovals.has(entityId);
}

// =============================================================================
// COMPONENT OPERATIONS
// =============================================================================

/**
 * Add a component to an entity.
 */
export function addComponent<T extends ComponentType>(
    world: World,
    entityId: EntityId,
    componentType: T,
    component: ComponentOf<T>
): void {
    if (!world.entities.has(entityId)) {
        throw new Error(`Entity ${entityId} does not exist`);
    }

    (world.components[componentType] as Map<EntityId, ComponentOf<T>>).set(entityId, component);
    world.entityComponents.get(entityId)!.add(componentType);
}

/**
 * Get a component from an entity.
 * Returns undefined if the entity doesn't have this component.
 */
export function getComponent<T extends ComponentType>(
    world: World,
    entityId: EntityId,
    componentType: T
): ComponentOf<T> | undefined {
    return (world.components[componentType] as Map<EntityId, ComponentOf<T>>).get(entityId);
}

/**
 * Get a component from an entity (throws if not found).
 */
export function getComponentRequired<T extends ComponentType>(
    world: World,
    entityId: EntityId,
    componentType: T
): ComponentOf<T> {
    const component = getComponent(world, entityId, componentType);
    if (component === undefined) {
        throw new Error(`Entity ${entityId} does not have component ${componentType}`);
    }
    return component;
}

/**
 * Check if an entity has a component.
 */
export function hasComponent(
    world: World,
    entityId: EntityId,
    componentType: ComponentType
): boolean {
    return world.entityComponents.get(entityId)?.has(componentType) ?? false;
}

/**
 * Remove a component from an entity.
 */
export function removeComponent(
    world: World,
    entityId: EntityId,
    componentType: ComponentType
): boolean {
    const componentTypes = world.entityComponents.get(entityId);
    if (!componentTypes?.has(componentType)) {
        return false;
    }

    world.components[componentType].delete(entityId);
    componentTypes.delete(componentType);
    return true;
}

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get all entities with a specific component.
 */
export function getEntitiesWith<T extends ComponentType>(
    world: World,
    componentType: T
): IterableIterator<[EntityId, ComponentOf<T>]> {
    return (world.components[componentType] as Map<EntityId, ComponentOf<T>>).entries();
}

/**
 * Get all entities with multiple components.
 */
export function queryEntities(
    world: World,
    ...componentTypes: ComponentType[]
): EntityId[] {
    const result: EntityId[] = [];

    // Start with entities that have the first component type (assume smallest set)
    const firstType = componentTypes[0];
    if (!firstType) {
        return [...world.entities];
    }

    for (const entityId of world.components[firstType].keys()) {
        // Check if entity has all required components
        let hasAll = true;
        for (let i = 1; i < componentTypes.length; i++) {
            if (!hasComponent(world, entityId, componentTypes[i]!)) {
                hasAll = false;
                break;
            }
        }

        if (hasAll && !world.pendingRemovals.has(entityId)) {
            result.push(entityId);
        }
    }

    return result;
}

/**
 * Get all player entities.
 */
export function getPlayerEntities(world: World): EntityId[] {
    return queryEntities(world, 'player', 'transform', 'health');
}

/**
 * Get all alive player entities.
 */
export function getAlivePlayerEntities(world: World): EntityId[] {
    const result: EntityId[] = [];

    for (const [entityId, player] of getEntitiesWith(world, 'player')) {
        if (player.isAlive && !world.pendingRemovals.has(entityId)) {
            result.push(entityId);
        }
    }

    return result;
}

/**
 * Get all projectile entities.
 */
export function getProjectileEntities(world: World): EntityId[] {
    return queryEntities(world, 'projectile', 'transform');
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Serializable snapshot of the world state.
 * Used for networking.
 */
export interface WorldSnapshot {
    tick: number;
    entities: number[];
    components: {
        transform: Array<[number, TransformComponent]>;
        physics: Array<[number, Omit<PhysicsComponent, 'bodyHandle' | 'colliderHandle'>]>;
        player: Array<[number, Omit<PlayerComponent, 'inputBuffer'>]>;
        health: Array<[number, HealthComponent]>;
        weapon: Array<[number, WeaponComponent]>;
        ability: Array<[number, AbilityComponent]>;
        projectile: Array<[number, ProjectileComponent]>;
        zone: Array<[number, Omit<ZoneComponent, 'entitiesInZone'> & { entitiesInZone: number[] }]>;
        objective: Array<[number, Omit<ObjectiveComponent, 'entitiesInZone'> & { entitiesInZone: number[] }]>;
    };
}

/**
 * Create a serializable snapshot of the world.
 */
export function createWorldSnapshot(world: World): WorldSnapshot {
    const snapshot: WorldSnapshot = {
        tick: world.tick,
        entities: [...world.entities],
        components: {
            transform: [...world.components.transform.entries()],
            physics: [...world.components.physics.entries()].map(([id, p]) => [
                id,
                {
                    velocity: p.velocity,
                    angularVelocity: p.angularVelocity,
                    isGrounded: p.isGrounded,
                    groundNormal: p.groundNormal,
                    isTouchingWall: p.isTouchingWall,
                    wallNormal: p.wallNormal,
                    ticksSinceGrounded: p.ticksSinceGrounded,
                    isClimbing: p.isClimbing,
                },
            ]),
            player: [...world.components.player.entries()].map(([id, p]) => [
                id,
                {
                    playerId: p.playerId,
                    teamId: p.teamId,
                    displayName: p.displayName,
                    loadout: p.loadout,
                    species: p.species,
                    archetype: p.archetype,
                    currentInput: p.currentInput,
                    lastProcessedInputTick: p.lastProcessedInputTick,
                    isAlive: p.isAlive,
                    deathTick: p.deathTick,
                    spawnProtectionEndTick: p.spawnProtectionEndTick,
                    stats: p.stats,
                },
            ]),
            health: [...world.components.health.entries()],
            weapon: [...world.components.weapon.entries()],
            ability: [...world.components.ability.entries()],
            projectile: [...world.components.projectile.entries()],
            zone: [...world.components.zone.entries()].map(([id, z]) => [
                id,
                { ...z, entitiesInZone: [...z.entitiesInZone] },
            ]),
            objective: [...world.components.objective.entries()].map(([id, o]) => [
                id,
                { ...o, entitiesInZone: [...o.entitiesInZone] },
            ]),
        },
    };

    return snapshot;
}
