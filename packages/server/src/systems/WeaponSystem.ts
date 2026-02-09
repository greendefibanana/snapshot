/**
 * Weapon System
 * 
 * Handles weapon firing, reloading, projectile spawning,
 * and hitscan raycasting.
 */

import {
    type World,
    type EntityId,
    type Tick,
    type GameEvent,
    type Vector3,
    Vec3,
    Quat,
    SIMULATION,
    getEntitiesWith,
    getComponent,
    createEntity,
    addComponent,
    removeEntity,
    getWeaponRequired,
    createWeaponState,
    FireMode,
    ProjectileType,
    type WeaponDefinition,
    type WeaponState,
    Components,
} from '@snapshot/shared';

import { dealDamage } from './CombatSystem.js';
import type { PhysicsWorld, RaycastResult } from '../simulation/PhysicsWorld.js';

// =============================================================================
// TYPES
// =============================================================================

export interface WeaponSystemContext {
    physicsWorld: PhysicsWorld;
}

// =============================================================================
// WEAPON SYSTEM
// =============================================================================

/**
 * Process weapon actions for all players.
 */
export function weaponSystem(
    world: World,
    events: GameEvent[],
    context: WeaponSystemContext
): void {
    // Process player weapon inputs
    for (const [entityId, player] of getEntitiesWith(world, 'player')) {
        if (!player.isAlive) continue;

        const weapon = getComponent(world, entityId, 'weapon');
        const transform = getComponent(world, entityId, 'transform');

        if (!weapon || !transform) continue;

        const input = player.currentInput;
        const activeSlot = weapon.activeSlot;
        const activeWeaponId = weapon.weaponSlots[activeSlot];
        const activeState = weapon.weaponStates[activeSlot];

        if (!activeWeaponId || !activeState) continue;

        const weaponDef = getWeaponRequired(activeWeaponId);

        // Handle weapon switch
        if (input.weaponSlot >= 0 && input.weaponSlot !== activeSlot) {
            startWeaponSwitch(world, weapon, input.weaponSlot);
        }

        // Skip if switching
        if (weapon.isSwitching && world.tick < weapon.switchCompleteTick) {
            continue;
        }
        weapon.isSwitching = false;

        // Handle reload
        if (input.reload && canReload(activeState, weaponDef)) {
            startReload(world, activeState, weaponDef);
        }

        // Update reload progress
        if (activeState.isReloading) {
            if (world.tick >= activeState.reloadEndTick) {
                completeReload(activeState, weaponDef);
            }
            continue; // Can't fire while reloading
        }

        // Handle ADS
        weapon.isADS = input.secondaryFire;

        // Handle firing
        if (input.primaryFire) {
            tryFire(
                world,
                entityId,
                player.teamId,
                transform,
                input.aim,
                weapon,
                weaponDef,
                activeState,
                events,
                context
            );
        } else {
            // Release charge if not firing
            if (activeState.isCharging) {
                activeState.isCharging = false;
                activeState.chargeLevel = 0;
            }
        }

        // Update spread recovery
        updateSpread(activeState, weaponDef);

        // Update dodge roll charges (Dualies)
        if (weaponDef.special?.dodgeRoll) {
            updateDodgeCharges(world, activeState, weaponDef);
        }
    }

    // Update projectiles
    updateProjectiles(world, events, context);
}

/**
 * Attempt to fire the weapon.
 */
function tryFire(
    world: World,
    entityId: EntityId,
    teamId: number,
    transform: { position: Vector3; rotation: { x: number; y: number; z: number; w: number } },
    aim: { yaw: number; pitch: number },
    weapon: { isADS: boolean },
    weaponDef: WeaponDefinition,
    state: WeaponState,
    events: GameEvent[],
    context: WeaponSystemContext
): void {
    // Check cooldown
    if (world.tick < state.nextFireTick) {
        // Handle charge weapons
        if (weaponDef.fireMode === FireMode.Charge && weaponDef.charge) {
            state.isCharging = true;
            state.chargeLevel = Math.min(
                1.0,
                state.chargeLevel + SIMULATION.TICK_DELTA / weaponDef.charge.fullChargeTime
            );

            // Auto-fire on full charge if configured
            if (state.chargeLevel >= 1.0 && weaponDef.charge.autoFireOnFull) {
                fireWeapon(world, entityId, teamId, transform, aim, weapon, weaponDef, state, events, context);
            }
        }
        return;
    }

    // Check ammo
    if (state.ammo <= 0) {
        startReload(world, state, weaponDef);
        return;
    }

    // Handle charge weapons - need minimum charge
    if (weaponDef.fireMode === FireMode.Charge && weaponDef.charge) {
        if (!state.isCharging) {
            // Start charging
            state.isCharging = true;
            state.chargeLevel = 0;
            return;
        }

        if (state.chargeLevel < weaponDef.charge.minChargeTime / weaponDef.charge.fullChargeTime) {
            state.chargeLevel += SIMULATION.TICK_DELTA / weaponDef.charge.fullChargeTime;
            return;
        }
    }

    // Fire!
    fireWeapon(world, entityId, teamId, transform, aim, weapon, weaponDef, state, events, context);
}

/**
 * Fire the weapon.
 */
function fireWeapon(
    world: World,
    entityId: EntityId,
    teamId: number,
    transform: { position: Vector3; rotation: { x: number; y: number; z: number; w: number } },
    aim: { yaw: number; pitch: number },
    weapon: { isADS: boolean },
    weaponDef: WeaponDefinition,
    state: WeaponState,
    events: GameEvent[],
    context: WeaponSystemContext
): void {
    // Calculate fire direction
    const spread = weapon.isADS
        ? state.currentSpread * weaponDef.stats.adsSpreadMultiplier
        : state.currentSpread;

    const direction = calculateFireDirection(aim, spread);

    // Calculate muzzle position (offset from player center)
    const muzzleOffset = Quat.rotateVector(transform.rotation, { x: 0.5, y: 1.5, z: -0.5 });
    const muzzlePos = Vec3.add(transform.position, muzzleOffset);

    // Consume ammo
    state.ammo--;

    // Calculate damage with charge multiplier
    let damage = weaponDef.stats.damage;
    if (weaponDef.charge) {
        const chargeMultiplier = lerp(
            weaponDef.charge.minChargeDamage,
            weaponDef.charge.fullChargeDamage,
            state.chargeLevel
        );
        damage *= chargeMultiplier;
    }

    // Handle different projectile types
    switch (weaponDef.projectileType) {
        case ProjectileType.Hitscan:
            fireHitscan(
                world, entityId, teamId, muzzlePos, direction,
                weaponDef, damage, events, context
            );
            break;

        case ProjectileType.Projectile:
        case ProjectileType.Explosive:
        case ProjectileType.Arc:
            spawnProjectile(
                world, entityId, teamId, muzzlePos, direction,
                weaponDef, damage, state.chargeLevel, events, context
            );
            break;

        case ProjectileType.Beam:
            // Beam weapons are handled specially (continuous damage)
            fireBeam(
                world, entityId, teamId, muzzlePos, direction,
                weaponDef, damage, events, context
            );
            break;
    }

    // Update spread
    state.currentSpread = Math.min(
        weaponDef.stats.spreadMax,
        state.currentSpread + weaponDef.stats.spreadPerShot
    );

    // Set cooldown
    if (weaponDef.fireMode === FireMode.Burst && weaponDef.burst) {
        // Handle burst fire
        if (state.burstShotsRemaining <= 0) {
            state.burstShotsRemaining = weaponDef.burst.shotsPerBurst - 1;
            state.nextFireTick = (world.tick + Math.ceil(weaponDef.burst.burstDelay * SIMULATION.TICK_RATE)) as Tick;
        } else {
            state.burstShotsRemaining--;
            if (state.burstShotsRemaining > 0) {
                state.nextFireTick = (world.tick + Math.ceil(weaponDef.burst.burstDelay * SIMULATION.TICK_RATE)) as Tick;
            } else {
                state.nextFireTick = (world.tick + Math.ceil(weaponDef.burst.burstCooldown * SIMULATION.TICK_RATE)) as Tick;
            }
        }
    } else if (weaponDef.stats.fireRate > 0) {
        const ticksBetweenShots = Math.ceil(SIMULATION.TICK_RATE / weaponDef.stats.fireRate);
        state.nextFireTick = (world.tick + ticksBetweenShots) as Tick;
    } else {
        // Charge weapons reset on fire
        state.nextFireTick = (world.tick + 10) as Tick; // Small delay before can charge again
    }

    // Reset charge
    state.isCharging = false;
    state.chargeLevel = 0;
}

/**
 * Fire a hitscan weapon (instant hit).
 */
function fireHitscan(
    world: World,
    entityId: EntityId,
    teamId: number,
    origin: Vector3,
    direction: Vector3,
    weaponDef: WeaponDefinition,
    damage: number,
    events: GameEvent[],
    context: WeaponSystemContext
): void {
    const result = context.physicsWorld.raycast(
        origin,
        direction,
        weaponDef.stats.maxRange,
        entityId
    );

    if (result.hit && result.entityId !== undefined && result.distance !== undefined) {
        // Apply damage falloff
        const falloffDamage = calculateFalloff(
            damage,
            result.distance,
            weaponDef.stats.effectiveRange,
            weaponDef.stats.maxRange,
            weaponDef.stats.falloffMultiplier
        );

        // Check for headshot (if hit is in upper portion of target)
        const headshotMultiplier = 1.0; // TODO: Implement headshot detection

        // Deal damage
        dealDamage(world, result.entityId, entityId, falloffDamage, weaponDef.id, {
            headshotMultiplier,
        });
    }
}

/**
 * Spawn a projectile.
 */
function spawnProjectile(
    world: World,
    ownerId: EntityId,
    teamId: number,
    position: Vector3,
    direction: Vector3,
    weaponDef: WeaponDefinition,
    damage: number,
    chargeLevel: number,
    events: GameEvent[],
    context: WeaponSystemContext
): void {
    if (!weaponDef.projectile) return;

    const projectileId = createEntity(world);

    // Calculate velocity with gravity consideration for arc projectiles
    const speed = weaponDef.projectile.speed;
    const velocity = Vec3.scale(direction, speed);

    // Add transform component
    addComponent(world, projectileId, 'transform', Components.transform(position));

    // Add projectile component
    addComponent(world, projectileId, 'projectile', {
        state: {
            entityId: projectileId,
            weaponId: weaponDef.id,
            ownerId,
            teamId,
            position,
            velocity,
            age: 0,
            bouncesRemaining: weaponDef.projectile.bounces,
            penetrationsRemaining: weaponDef.projectile.maxPenetrations,
            isSticky: !!weaponDef.special?.sticky,
            chargeLevel,
        },
        markedForRemoval: false,
    });

    // Create physics body
    const isAlly = true; // Relative to owner
    const { bodyHandle, colliderHandle } = context.physicsWorld.createProjectileBody(
        projectileId,
        position,
        velocity,
        weaponDef.projectile.radius,
        isAlly
    );

    // Add physics component
    addComponent(world, projectileId, 'physics', {
        velocity,
        angularVelocity: Vec3.zero(),
        bodyHandle,
        colliderHandle,
        isGrounded: false,
        groundNormal: Vec3.up(),
        isTouchingWall: false,
        wallNormal: Vec3.zero(),
        ticksSinceGrounded: 0,
        isClimbing: false,
    });

    // Emit event
    events.push({
        type: 'projectile_spawned',
        entityId: projectileId,
        position,
        velocity,
    });
}

/**
 * Fire a beam weapon (continuous damage).
 */
function fireBeam(
    world: World,
    entityId: EntityId,
    teamId: number,
    origin: Vector3,
    direction: Vector3,
    weaponDef: WeaponDefinition,
    damagePerSecond: number,
    events: GameEvent[],
    context: WeaponSystemContext
): void {
    // Beam does damage every tick
    const damageThisTick = damagePerSecond * SIMULATION.TICK_DELTA;

    const result = context.physicsWorld.raycast(
        origin,
        direction,
        weaponDef.stats.maxRange,
        entityId
    );

    if (result.hit && result.entityId !== undefined && result.distance !== undefined) {
        const falloffDamage = calculateFalloff(
            damageThisTick,
            result.distance,
            weaponDef.stats.effectiveRange,
            weaponDef.stats.maxRange,
            weaponDef.stats.falloffMultiplier
        );

        dealDamage(world, result.entityId, entityId, falloffDamage, weaponDef.id);
    }
}

/**
 * Update all projectiles.
 */
function updateProjectiles(
    world: World,
    events: GameEvent[],
    context: WeaponSystemContext
): void {
    for (const [entityId, projectile] of getEntitiesWith(world, 'projectile')) {
        if (projectile.markedForRemoval) {
            removeEntity(world, entityId);
            continue;
        }

        const state = projectile.state;
        state.age++;

        // Get current position from physics
        const pos = context.physicsWorld.getBodyPosition(entityId);
        const vel = context.physicsWorld.getBodyVelocity(entityId);

        if (pos) state.position = pos;
        if (vel) state.velocity = vel;

        // Check lifetime
        const weaponDef = getWeaponRequired(state.weaponId);
        const maxAge = (weaponDef.projectile?.lifetime ?? 3) * SIMULATION.TICK_RATE;

        if (state.age >= maxAge) {
            // Explode if explosive
            if (weaponDef.projectileType === ProjectileType.Explosive) {
                explodeProjectile(world, entityId, state, weaponDef, events, context);
            }

            projectile.markedForRemoval = true;
            continue;
        }

        // Check for collisions
        // This would be handled by physics callbacks in a real implementation
    }
}

/**
 * Explode a projectile.
 */
function explodeProjectile(
    world: World,
    projectileId: EntityId,
    state: { position: Vector3; ownerId: number; teamId: number; weaponId: string },
    weaponDef: WeaponDefinition,
    events: GameEvent[],
    context: WeaponSystemContext
): void {
    // TODO: Implement explosion damage in radius
    // Would use physics overlap query to find entities in explosion radius

    events.push({
        type: 'projectile_hit',
        projectileId,
        targetId: null,
        position: state.position,
    });
}

/**
 * Calculate fire direction with spread.
 */
function calculateFireDirection(
    aim: { yaw: number; pitch: number },
    spreadDegrees: number
): Vector3 {
    // Base direction from aim
    const baseDir: Vector3 = {
        x: -Math.sin(aim.yaw) * Math.cos(aim.pitch),
        y: Math.sin(aim.pitch),
        z: -Math.cos(aim.yaw) * Math.cos(aim.pitch),
    };

    if (spreadDegrees <= 0.001) {
        return Vec3.normalize(baseDir);
    }

    // Add random spread
    const spreadRad = (spreadDegrees * Math.PI) / 180;
    const randomAngle = Math.random() * Math.PI * 2;
    const randomSpread = Math.random() * spreadRad;

    // Calculate perpendicular vectors
    const up = Vec3.up();
    const right = Vec3.normalize(Vec3.cross(baseDir, up));
    const actualUp = Vec3.cross(right, baseDir);

    // Apply spread
    const spreadX = Math.cos(randomAngle) * Math.sin(randomSpread);
    const spreadY = Math.sin(randomAngle) * Math.sin(randomSpread);

    const spreadDir = Vec3.add(
        Vec3.add(
            Vec3.scale(baseDir, Math.cos(randomSpread)),
            Vec3.scale(right, spreadX)
        ),
        Vec3.scale(actualUp, spreadY)
    );

    return Vec3.normalize(spreadDir);
}

/**
 * Calculate damage falloff.
 */
function calculateFalloff(
    baseDamage: number,
    distance: number,
    effectiveRange: number,
    maxRange: number,
    falloffMultiplier: number
): number {
    if (distance <= effectiveRange) {
        return baseDamage;
    }

    if (distance >= maxRange) {
        return baseDamage * falloffMultiplier;
    }

    // Linear falloff between effective and max range
    const t = (distance - effectiveRange) / (maxRange - effectiveRange);
    return baseDamage * lerp(1.0, falloffMultiplier, t);
}

/**
 * Linear interpolation.
 */
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * Start weapon switch.
 */
function startWeaponSwitch(
    world: World,
    weapon: { activeSlot: number; isSwitching: boolean; switchCompleteTick: Tick; weaponSlots: (string | null)[] },
    newSlot: number
): void {
    if (newSlot < 0 || newSlot >= weapon.weaponSlots.length) return;
    if (!weapon.weaponSlots[newSlot]) return;

    weapon.isSwitching = true;
    weapon.activeSlot = newSlot;
    weapon.switchCompleteTick = (world.tick + 15) as Tick; // 0.25s switch time
}

/**
 * Check if weapon can reload.
 */
function canReload(state: WeaponState, weaponDef: WeaponDefinition): boolean {
    return !state.isReloading && state.ammo < weaponDef.stats.magazineSize;
}

/**
 * Start reloading.
 */
function startReload(world: World, state: WeaponState, weaponDef: WeaponDefinition): void {
    state.isReloading = true;
    state.reloadEndTick = (world.tick + Math.ceil(weaponDef.stats.reloadTime * SIMULATION.TICK_RATE)) as Tick;
}

/**
 * Complete reload.
 */
function completeReload(state: WeaponState, weaponDef: WeaponDefinition): void {
    state.isReloading = false;
    state.ammo = weaponDef.stats.magazineSize;
}

/**
 * Update spread recovery.
 */
function updateSpread(state: WeaponState, weaponDef: WeaponDefinition): void {
    if (state.currentSpread > weaponDef.stats.spreadBase) {
        state.currentSpread = Math.max(
            weaponDef.stats.spreadBase,
            state.currentSpread - weaponDef.stats.spreadRecovery * SIMULATION.TICK_DELTA
        );
    }
}

/**
 * Update dodge roll charges for Dualies.
 */
function updateDodgeCharges(world: World, state: WeaponState, weaponDef: WeaponDefinition): void {
    const dodgeConfig = weaponDef.special?.dodgeRoll;
    if (!dodgeConfig) return;

    if (state.dodgeCharges < dodgeConfig.charges) {
        if (world.tick >= state.nextDodgeRechargeTick) {
            state.dodgeCharges++;
            state.nextDodgeRechargeTick = (world.tick + Math.ceil(dodgeConfig.rechargeTime * SIMULATION.TICK_RATE)) as Tick;
        }
    }
}
