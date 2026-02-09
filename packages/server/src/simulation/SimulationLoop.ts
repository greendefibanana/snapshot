/**
 * SimulationLoop - Deterministic game simulation
 * 
 * The core authoritative simulation that processes inputs and updates world state.
 * Executes systems in a fixed, deterministic order.
 */

import type RAPIER from '@dimforge/rapier3d-compat';
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import {
    type Tick,
    tick,
    tickAdvance,
    TICK_DELTA,
    type Snapshot,
    type EntityState,
    type EntityId,
    entityId,
    ComponentType,
    type Vec3,
    type Quat,
    type InputFrame,
    type ServerInputQueue,
    createEmptySnapshot,
    createEmptyInput,
} from '@snapshot/shared/simulation';
import { COMBAT, SMG_STATS, type ServerMessage, type GameEvent } from '@snapshot/shared';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Placeholder entity for testing.
 * Contains minimal state for simulation verification.
 */
export interface PlaceholderEntity {
    id: EntityId;
    playerId: string;
    position: Vec3;
    velocity: Vec3;
    rotation: Quat;
    isGrounded: boolean;
    health: number;
    maxHealth: number;
    isAlive: boolean;
    deathTick: Tick;
    respawnTick: Tick;
    spawnPosition: Vec3;
    kills: number;
    deaths: number;
    weapon: {
        ammo: number;
        isReloading: boolean;
        reloadEndTick: Tick;
        nextFireTick: Tick;
        isADS: boolean;
    };
    lastProcessedInputTick: Tick;
    lastProcessedInputSeq: number;
}

/**
 * Simulation world state.
 * Minimal state for authoritative simulation without gameplay rules.
 */
export interface SimulationWorld {
    /** Current simulation tick */
    tick: Tick;

    /** All entities by ID */
    entities: Map<EntityId, PlaceholderEntity>;

    /** Next entity ID to assign */
    nextEntityId: number;

    /** Deleted entity IDs this tick (for delta) */
    deletedThisTick: EntityId[];

    /** Created entity IDs this tick (for delta) */
    createdThisTick: EntityId[];
}

export interface ShotRequest {
    playerId: string;
    shotId: string;
    origin: Vec3;
    dir: Vec3;
    time: number;
    weaponId?: string;
}

/**
 * Simulation configuration.
 */
export interface SimulationConfig {
    /** Gravity vector */
    gravity: Vec3;

    /** Ground plane Y */
    groundY: number;

    /** Player walk speed (units/second) */
    walkSpeed: number;

    /** Player sprint speed (units/second) */
    sprintSpeed: number;

    /** Aim speed multiplier */
    aimSpeed: number;

    /** Jump velocity */
    jumpVelocity: number;

    /** Friction coefficient */
    friction: number;
}

/**
 * Default simulation config.
 */
export const DEFAULT_SIM_CONFIG: SimulationConfig = {
    gravity: { x: 0, y: -30, z: 0 },
    groundY: 0,
    walkSpeed: 3.0,
    sprintSpeed: 6.0,
    aimSpeed: 1.5,
    jumpVelocity: 15,
    friction: 0.9,
};

// =============================================================================
// SIMULATION LOOP
// =============================================================================

export class SimulationLoop {
    private world: SimulationWorld;
    private inputQueue: ServerInputQueue;
    private config: SimulationConfig;

    // Rapier physics (optional, can be null for simplified sim)
    private rapier: typeof RAPIER | null = null;
    private physicsWorld: RAPIER.World | null = null;
    private bodyHandles: Map<EntityId, number> = new Map();
    private mapBounds: { min: Vec3; max: Vec3 } | null = null;
    private pendingShots: ShotRequest[] = [];
    private pendingMessages: ServerMessage[] = [];
    private matchEnded: boolean = false;

    constructor(
        inputQueue: ServerInputQueue,
        config: Partial<SimulationConfig> = {}
    ) {
        this.inputQueue = inputQueue;
        this.config = { ...DEFAULT_SIM_CONFIG, ...config };

        this.world = {
            tick: tick(0),
            entities: new Map(),
            nextEntityId: 1,
            deletedThisTick: [],
            createdThisTick: [],
        };
    }

    /**
     * Get current tick.
     */
    get currentTick(): Tick {
        return this.world.tick;
    }

    /**
     * Get entity count.
     */
    get entityCount(): number {
        return this.world.entities.size;
    }

    /**
     * Initialize Rapier physics (optional).
     */
    async initPhysics(): Promise<void> {
        try {
            this.rapier = await import('@dimforge/rapier3d-compat');
            await this.rapier.init();

            this.physicsWorld = new this.rapier.World({
                x: this.config.gravity.x,
                y: this.config.gravity.y,
                z: this.config.gravity.z,
            });

            console.log('SimulationLoop: Rapier physics initialized');

            // Create placeholder floor
            // Size: 2000x2x2000 (HalfExtents: 1000x1x1000)
            // Position: Y=-1 so top surface is at Y=0
            const floorId = entityId(0); // Reserved ID for floor
            this.physicsWorld.createCollider(
                this.rapier.ColliderDesc.cuboid(1000, 1, 1000)
                    .setTranslation(0, -1, 0)
            );
            console.log('SimulationLoop: Created placeholder floor');

            this.loadMapColliders();

        } catch (e) {
            console.warn('SimulationLoop: Rapier not available, using simplified physics');
            this.rapier = null;
            this.physicsWorld = null;
        }
    }

    /**
     * Load static colliders from map JSON (server-side).
     */
    private loadMapColliders(): void {
        if (!this.rapier || !this.physicsWorld) return;
        const mapPath = path.resolve(process.cwd(), '../client/public/models/Map2.glb');
        if (!fs.existsSync(mapPath)) {
            console.warn(`SimulationLoop: GLB map not found at ${mapPath}`);
            return;
        }

        try {
            const io = new NodeIO();
            const doc = io.read(mapPath);
            let meshCount = 0;
            let triCount = 0;

            const runtimeScale = 3;
            const runtimeOffsetY = 0.1;
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

            for (const node of doc.getRoot().listNodes()) {
                const mesh = node.getMesh();
                if (!mesh) continue;
                const world = node.getWorldMatrix();
                meshCount++;

                for (const prim of mesh.listPrimitives()) {
                    const position = prim.getAttribute('POSITION');
                    if (!position) continue;

                    const indices = prim.getIndices();
                    const posArray = position.getArray() as Float32Array;

                    const positions: number[] = [];
                    const pushVertex = (i: number) => {
                        const x = posArray[i * 3];
                        const y = posArray[i * 3 + 1];
                        const z = posArray[i * 3 + 2];
                        let wx = world[0] * x + world[4] * y + world[8] * z + world[12];
                        let wy = world[1] * x + world[5] * y + world[9] * z + world[13];
                        let wz = world[2] * x + world[6] * y + world[10] * z + world[14];
                        wx *= runtimeScale;
                        wy = wy * runtimeScale + runtimeOffsetY;
                        wz *= runtimeScale;
                        positions.push(wx, wy, wz);
                        minX = Math.min(minX, wx);
                        minY = Math.min(minY, wy);
                        minZ = Math.min(minZ, wz);
                        maxX = Math.max(maxX, wx);
                        maxY = Math.max(maxY, wy);
                        maxZ = Math.max(maxZ, wz);
                    };

                    if (indices) {
                        const indexArray = indices.getArray() as Uint16Array | Uint32Array;
                        const triangles: number[] = [];
                        for (let i = 0; i < indexArray.length; i++) {
                            const idx = indexArray[i] as number;
                            triangles.push(idx);
                            if (idx >= position.getCount()) continue;
                            // We will push all vertex positions later by count.
                        }

                        for (let i = 0; i < position.getCount(); i++) {
                            pushVertex(i);
                        }
                        triCount += triangles.length / 3;
                        const desc = this.rapier.ColliderDesc.trimesh(new Float32Array(positions), new Uint32Array(triangles));
                        this.physicsWorld.createCollider(desc);
                    } else {
                        // Non-indexed: triangles are sequential.
                        for (let i = 0; i < position.getCount(); i++) {
                            pushVertex(i);
                        }
                        const triangleCount = Math.floor(position.getCount() / 3);
                        const triangles = new Uint32Array(triangleCount * 3);
                        for (let i = 0; i < triangleCount * 3; i++) {
                            triangles[i] = i;
                        }
                        triCount += triangleCount;
                        const desc = this.rapier.ColliderDesc.trimesh(new Float32Array(positions), triangles);
                        this.physicsWorld.createCollider(desc);
                    }
                }
            }

            console.log(`SimulationLoop: Loaded Map2.glb colliders (meshes=${meshCount}, triangles=${triCount})`);
            console.log(`SimulationLoop: Colliders count=${this.physicsWorld.colliders.len()}`);
            if (minX !== Infinity) {
                this.mapBounds = {
                    min: { x: minX, y: minY, z: minZ },
                    max: { x: maxX, y: maxY, z: maxZ },
                };
                console.log(`SimulationLoop: Map bounds min=(${minX.toFixed(2)},${minY.toFixed(2)},${minZ.toFixed(2)}) max=(${maxX.toFixed(2)},${maxY.toFixed(2)},${maxZ.toFixed(2)})`);
            }
        } catch (e) {
            console.warn('SimulationLoop: Failed to load GLB map colliders', e);
        }
    }

    /**
     * Create a placeholder player entity.
     */
    createPlayerEntity(playerId: string, spawnPosition: Vec3): EntityId {
        const id = entityId(this.world.nextEntityId++);
        const groundedAtSpawn = spawnPosition.y <= this.config.groundY + 0.05;

        const entity: PlaceholderEntity = {
            id,
            playerId,
            position: { ...spawnPosition },
            velocity: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            isGrounded: groundedAtSpawn,
            health: 100,
            maxHealth: 100,
            isAlive: true,
            deathTick: tick(0),
            respawnTick: tick(0),
            spawnPosition: { ...spawnPosition },
            kills: 0,
            deaths: 0,
            weapon: {
                ammo: SMG_STATS.magazineSize,
                isReloading: false,
                reloadEndTick: tick(0),
                nextFireTick: tick(0),
                isADS: false,
            },
            lastProcessedInputTick: tick(0),
            lastProcessedInputSeq: -1,
        };

        this.world.entities.set(id, entity);
        this.world.createdThisTick.push(id);

        // Create physics body if Rapier is available
        if (this.rapier && this.physicsWorld) {
            const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
                .setTranslation(spawnPosition.x, spawnPosition.y, spawnPosition.z);
            const body = this.physicsWorld.createRigidBody(bodyDesc);
            const colliderDesc = this.rapier.ColliderDesc.capsule(0.6, 0.4)
                .setFriction(1.0)
                .setRestitution(0.0);
            this.physicsWorld.createCollider(colliderDesc, body);
            this.bodyHandles.set(id, body.handle);
            body.lockRotations(true, true);
        }

        console.log(`SimulationLoop: Created entity ${id} for player ${playerId}`);
        return id;
    }

    /**
     * Remove an entity.
     */
    removeEntity(id: EntityId): void {
        const entity = this.world.entities.get(id);
        if (!entity) return;

        this.world.entities.delete(id);
        this.world.deletedThisTick.push(id);

        // Remove physics body
        if (this.physicsWorld) {
            const handle = this.bodyHandles.get(id);
            if (handle !== undefined) {
                const body = this.physicsWorld.getRigidBody(handle);
                if (body) {
                    this.physicsWorld.removeRigidBody(body);
                }
                this.bodyHandles.delete(id);
            }
        }

        console.log(`SimulationLoop: Removed entity ${id}`);
    }

    /**
     * Execute a single simulation tick.
     * Systems run in deterministic order.
     */
    tick(targetTick: Tick): void {
        // Clear per-tick tracking
        this.world.deletedThisTick = [];
        this.world.createdThisTick = [];

        // Advance tick
        this.world.tick = targetTick;

        // =============================================
        // SYSTEM EXECUTION ORDER (deterministic)
        // =============================================

        // 1. Process inputs for all players
        this.processInputs();

        // 2. Apply physics (gravity, movement)
        this.applyPhysics();

        // 3. Step Rapier physics (if available)
        if (this.physicsWorld) {
            this.physicsWorld.step();
            this.syncFromPhysics();
        }

        // 4. Resolve collisions (ground check)
        this.resolveCollisions();

        // 5. Combat system (shots, damage, deaths, respawns)
        this.processReloads();
        this.processShots();
        this.processDeathsAndRespawns();
        this.checkMatchEnd();

        // 6. [Placeholder] Ability system would go here

        // 7. [Placeholder] Objective system would go here
    }

    /**
     * Process inputs for all players.
     */
    private processInputs(): void {
        if (this.matchEnded) {
            for (const entity of this.world.entities.values()) {
                entity.velocity = { x: 0, y: 0, z: 0 };
            }
            return;
        }
        for (const entity of this.world.entities.values()) {
            if (!entity.isAlive) {
                entity.velocity = { x: 0, y: 0, z: 0 };
                continue;
            }
            // Get input for this tick
            let input = this.inputQueue.getInputForTick(entity.playerId, this.world.tick);

            // If no input for exact tick, use latest (input prediction on server)
            if (!input) {
                input = this.inputQueue.getLatestInput(entity.playerId);
            }

            if (!input) {
                // No input available, use empty input (player will stand still)
                input = createEmptyInput(this.world.tick, 0);
            }

            // Apply input to entity
            this.applyInputToEntity(entity, input);

            // Mark input as processed
            if (input.sequence > entity.lastProcessedInputSeq) {
                entity.lastProcessedInputTick = input.tick;
                entity.lastProcessedInputSeq = input.sequence;
                this.inputQueue.markProcessed(entity.playerId, input.sequence);
            }
        }
    }

    /**
     * Apply input to an entity.
     */
    private applyInputToEntity(entity: PlaceholderEntity, input: InputFrame): void {
        const isAiming = input.secondaryFire;
        if (entity.weapon.isADS !== isAiming) {
            entity.weapon.isADS = isAiming;
            this.pendingMessages.push({
                type: 'event',
                event: {
                    type: 'aim_state',
                    sourceId: entity.id as any,
                    isAiming,
                },
                tick: this.world.tick,
            });
        }

        const speed = input.movement.sprint ? this.config.sprintSpeed : this.config.walkSpeed;
        const aimSpeed = input.secondaryFire ? this.config.aimSpeed : 1;
        const moveSpeed = speed * aimSpeed;

        // Calculate movement direction from aim
        const yaw = input.aim.yaw;
        const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
        const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };

        // Accumulate movement
        let moveX = 0;
        let moveZ = 0;

        if (input.movement.forward) {
            moveX += forward.x;
            moveZ += forward.z;
        }
        if (input.movement.backward) {
            moveX -= forward.x;
            moveZ -= forward.z;
        }
        if (input.movement.right) {
            moveX += right.x;
            moveZ += right.z;
        }
        if (input.movement.left) {
            moveX -= right.x;
            moveZ -= right.z;
        }

        // Normalize diagonal movement
        const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (moveLen > 0.001) {
            moveX = (moveX / moveLen) * moveSpeed;
            moveZ = (moveZ / moveLen) * moveSpeed;
        }

        // Set horizontal velocity (units/sec)
        entity.velocity.x = moveX;
        entity.velocity.z = moveZ;

        // Handle jump
        if (input.movement.jump && entity.isGrounded) {
            entity.velocity.y = this.config.jumpVelocity;
            entity.isGrounded = false;
        }

        // Update rotation to face aim direction
        entity.rotation = quaternionFromYaw(yaw);

        if (input.reload && entity.weapon.ammo < SMG_STATS.magazineSize) {
            this.startReload(entity);
        }

        if (this.physicsWorld) {
            const handle = this.bodyHandles.get(entity.id);
            if (handle !== undefined) {
                const body = this.physicsWorld.getRigidBody(handle);
                if (body) {
                    const vel = body.linvel();
                    const y = input.movement.jump && entity.isGrounded ? this.config.jumpVelocity : vel.y;
                    body.setLinvel({ x: entity.velocity.x, y, z: entity.velocity.z }, true);
                    body.setRotation(entity.rotation, true);
                }
            }
        }
    }

    /**
     * Apply physics (gravity, velocity integration).
     */
    private applyPhysics(): void {
        if (this.physicsWorld) {
            return;
        }

        const gravity = this.config.gravity;
        const friction = this.config.friction;

        for (const entity of this.world.entities.values()) {
            // Apply gravity
            if (!entity.isGrounded) {
                entity.velocity.y += gravity.y * TICK_DELTA;
            }

            // Apply friction (horizontal only)
            if (entity.isGrounded) {
                entity.velocity.x *= friction;
                entity.velocity.z *= friction;
            }

            // Integrate velocity
            entity.position.x += entity.velocity.x * TICK_DELTA;
            entity.position.y += entity.velocity.y * TICK_DELTA;
            entity.position.z += entity.velocity.z * TICK_DELTA;
        }
    }

    /**
     * Sync entity positions from Rapier physics.
     */
    private syncFromPhysics(): void {
        if (!this.physicsWorld) return;

        for (const entity of this.world.entities.values()) {
            const handle = this.bodyHandles.get(entity.id);
            if (handle === undefined) continue;

            const body = this.physicsWorld.getRigidBody(handle);
            if (!body) continue;

            const pos = body.translation();
            const vel = body.linvel();
            entity.position = { x: pos.x, y: pos.y, z: pos.z };
            entity.velocity = { x: vel.x, y: vel.y, z: vel.z };
        }
    }

    /**
     * Resolve collisions.
     */
    private resolveCollisions(): void {
        const groundY = this.config.groundY;

        for (const entity of this.world.entities.values()) {
            // If we have physics, use raycast for ground detection
        if (!this.physicsWorld || !this.rapier) {
            // Fallback to simple plane check
            if (entity.position.y <= groundY) {
                entity.position.y = groundY;
                entity.velocity.y = 0;
                entity.isGrounded = true;
            } else if (entity.position.y > groundY + 0.1) {
                entity.isGrounded = false;
            }
        } else {
            // Raycast down, excluding the player's own collider/body
            const handle = this.bodyHandles.get(entity.id);
            const body = handle !== undefined ? this.physicsWorld.getRigidBody(handle) : null;
            const collider = body ? body.collider(0) : null;
            if (body) {
                const origin = body.translation();
                const ray = new this.rapier.Ray({ x: origin.x, y: origin.y + 0.1, z: origin.z }, { x: 0, y: -1, z: 0 });
                const hit = this.physicsWorld.castRay(ray, 0.3, true, undefined, undefined, collider ?? undefined, body);
                entity.isGrounded = !!hit;
            }
        }
        }
    }

    private processReloads(): void {
        for (const entity of this.world.entities.values()) {
            if (entity.weapon.isReloading && this.world.tick >= entity.weapon.reloadEndTick) {
                entity.weapon.isReloading = false;
                entity.weapon.ammo = SMG_STATS.magazineSize;
            }
        }
    }

    private processShots(): void {
        if (this.matchEnded) {
            this.pendingShots = [];
            return;
        }
        if (this.pendingShots.length === 0) return;

        const shots = this.pendingShots;
        this.pendingShots = [];

        for (const shot of shots) {
            const shooter = this.getEntityByPlayerId(shot.playerId);
            if (!shooter || !shooter.isAlive) continue;

            if (shooter.weapon.isReloading) {
                continue;
            }

            if (shooter.weapon.ammo <= 0) {
                this.startReload(shooter);
                continue;
            }

            if (this.world.tick < shooter.weapon.nextFireTick) {
                continue;
            }

            // Validate origin close to shooter position
            const originDelta = Vec3Distance(shot.origin, shooter.position);
            if (originDelta > 2.0) {
                continue;
            }

            // Normalize direction
            const dir = normalizeVec3(shot.dir);

            this.pendingMessages.push({
                type: 'event',
                event: {
                    type: 'shot_fired',
                    sourceId: shooter.id as any,
                    origin: { ...shot.origin },
                    direction: { ...dir },
                    weapon: 'smg',
                },
                tick: this.world.tick,
            });

            // Perform hit test against other players
            const hit = this.findRayHit(shooter, shot.origin, dir, SMG_STATS.range);
            shooter.weapon.ammo -= 1;
            shooter.weapon.nextFireTick = (this.world.tick + secondsToTicks(SMG_STATS.fireRate)) as Tick;

            if (!hit) {
                if (shooter.weapon.ammo <= 0) {
                    this.startReload(shooter);
                }
                continue;
            }

            const { target, hitPoint, isHeadshot } = hit;

            const damage = SMG_STATS.damage * (isHeadshot ? SMG_STATS.headshotMultiplier : 1);
            this.applyDamage(shooter, target, damage, shot.shotId, hitPoint, isHeadshot);

            if (shooter.weapon.ammo <= 0) {
                this.startReload(shooter);
            }
        }
    }

    private processDeathsAndRespawns(): void {
        if (this.matchEnded) {
            return;
        }
        for (const entity of this.world.entities.values()) {
            if (entity.isAlive) continue;
            if (entity.respawnTick === tick(0)) continue;
            if (this.world.tick < entity.respawnTick) continue;

            // Respawn
            entity.isAlive = true;
            entity.health = entity.maxHealth;
            entity.position = { ...entity.spawnPosition };
            entity.velocity = { x: 0, y: 0, z: 0 };
            entity.weapon.ammo = SMG_STATS.magazineSize;
            entity.weapon.isReloading = false;
            entity.weapon.reloadEndTick = tick(0);
            entity.weapon.nextFireTick = tick(0);
            entity.respawnTick = tick(0);

            const event: GameEvent = {
                type: 'player_spawned',
                entityId: entity.id as any,
                position: { ...entity.position },
            };
            this.pendingMessages.push({
                type: 'event',
                event,
                tick: this.world.tick,
            });
        }
    }

    private startReload(entity: PlaceholderEntity): void {
        if (entity.weapon.isReloading) return;
        entity.weapon.isReloading = true;
        entity.weapon.reloadEndTick = (this.world.tick + secondsToTicks(SMG_STATS.reloadTime)) as Tick;
    }

    private applyDamage(
        shooter: PlaceholderEntity,
        target: PlaceholderEntity,
        damage: number,
        shotId: string,
        hitPoint: Vec3,
        isHeadshot: boolean
    ): void {
        if (!target.isAlive) return;
        target.health = Math.max(0, target.health - damage);

        this.pendingMessages.push({
            type: 'damage_applied',
            targetId: String(target.playerId),
            attackerId: String(shooter.playerId),
            amount: damage,
            healthAfter: target.health,
            shotId,
        });

        if (target.health > 0) {
            return;
        }

        // Kill
        target.isAlive = false;
        target.deaths += 1;
        target.deathTick = this.world.tick;
        target.respawnTick = (this.world.tick + COMBAT.RESPAWN_DELAY_TICKS) as Tick;

        shooter.kills += 1;

        this.pendingMessages.push({
            type: 'player_died',
            victimId: String(target.playerId),
            killerId: String(shooter.playerId),
            killerScore: shooter.kills,
        });

        const event: GameEvent = {
            type: 'player_died',
            entityId: target.id as any,
            killerId: shooter.id as any,
            weapon: 'smg',
        };
        this.pendingMessages.push({
            type: 'event',
            event,
            tick: this.world.tick,
        });

        // Score update (1v1)
        const scores: Record<string, number> = {};
        for (const entity of this.world.entities.values()) {
            scores[entity.playerId] = entity.kills;
        }
        this.pendingMessages.push({
            type: 'score_update',
            scores,
            targetScore: 10,
        });

        if (shooter.kills >= 10) {
            this.pendingMessages.push({
                type: 'match_ended',
                winnerId: String(shooter.playerId),
                scores,
                targetScore: 10,
            });
            this.matchEnded = true;
        }
    }

    isMatchEnded(): boolean {
        return this.matchEnded;
    }

    forceMatchEnded(): void {
        this.matchEnded = true;
    }

    private checkMatchEnd(): void {
        if (this.matchEnded) return;
        let winnerId: string | null = null;
        const scores: Record<string, number> = {};
        for (const entity of this.world.entities.values()) {
            scores[entity.playerId] = entity.kills;
            if (entity.kills >= 10) {
                winnerId = entity.playerId;
            }
        }
        if (!winnerId) return;
        this.pendingMessages.push({
            type: 'match_ended',
            winnerId,
            scores,
            targetScore: 10,
        });
        this.matchEnded = true;
    }

    private findRayHit(
        shooter: PlaceholderEntity,
        origin: Vec3,
        dir: Vec3,
        range: number
    ): { target: PlaceholderEntity; hitPoint: Vec3; isHeadshot: boolean } | null {
        let closestT = Infinity;
        let closest: { target: PlaceholderEntity; hitPoint: Vec3; isHeadshot: boolean } | null = null;

        for (const target of this.world.entities.values()) {
            if (target.id === shooter.id) continue;
            if (!target.isAlive) continue;

            const bodyCenter = {
                x: target.position.x,
                y: target.position.y + 0.9,
                z: target.position.z,
            };
            const headCenter = {
                x: target.position.x,
                y: target.position.y + 1.6,
                z: target.position.z,
            };

            const bodyHit = raySphereIntersection(origin, dir, bodyCenter, 0.55);
            const headHit = raySphereIntersection(origin, dir, headCenter, 0.25);

            const hit = headHit !== null && (bodyHit === null || headHit < bodyHit)
                ? { t: headHit, isHeadshot: true }
                : bodyHit !== null
                    ? { t: bodyHit, isHeadshot: false }
                    : null;

            if (!hit) continue;
            if (hit.t < 0 || hit.t > range) continue;

            if (hit.t < closestT) {
                closestT = hit.t;
                closest = {
                    target,
                    hitPoint: {
                        x: origin.x + dir.x * hit.t,
                        y: origin.y + dir.y * hit.t,
                        z: origin.z + dir.z * hit.t,
                    },
                    isHeadshot: hit.isHeadshot,
                };
            }
        }

        return closest;
    }

    /**
     * Get entity by ID.
     */
    getEntity(id: EntityId): PlaceholderEntity | undefined {
        return this.world.entities.get(id);
    }

    /**
     * Get entity by player ID.
     */
    getEntityByPlayerId(playerId: string): PlaceholderEntity | undefined {
        for (const entity of this.world.entities.values()) {
            if (entity.playerId === playerId) {
                return entity;
            }
        }
        return undefined;
    }

    /**
     * Queue a shot request from a player.
     */
    queueShot(playerId: string, shot: ShotRequest): void {
        this.pendingShots.push({ ...shot, playerId });
    }

    /**
     * Drain pending server messages generated by the simulation.
     */
    drainServerMessages(): ServerMessage[] {
        if (this.pendingMessages.length === 0) return [];
        const out = this.pendingMessages;
        this.pendingMessages = [];
        return out;
    }

    /**
     * Create a snapshot of the current world state.
     */
    createSnapshot(): Snapshot {
        const entities: EntityState[] = [];

        for (const entity of this.world.entities.values()) {
            entities.push(this.entityToState(entity));
        }

        return {
            tick: this.world.tick,
            timestamp: Date.now(),
            entities,
            deletedEntityIds: [...this.world.deletedThisTick],
        };
    }

    /**
     * Convert a placeholder entity to EntityState.
     */
    private entityToState(entity: PlaceholderEntity): EntityState {
        return {
            id: entity.id,
            components: ComponentType.Transform | ComponentType.Physics | ComponentType.Player | ComponentType.Health | ComponentType.Weapon,
            transform: {
                position: { ...entity.position },
                rotation: { ...entity.rotation },
            },
            physics: {
                velocity: { ...entity.velocity },
                isGrounded: entity.isGrounded,
            },
            player: {
                playerId: entity.playerId,
                teamId: 1, // Placeholder
                isAlive: entity.isAlive,
                lastProcessedInputTick: entity.lastProcessedInputTick,
            },
            health: {
                health: entity.health,
                maxHealth: entity.maxHealth,
                shield: 0,
                maxShield: 0,
            },
            weapon: {
                activeSlot: 0,
                ammo: entity.weapon.ammo,
                isReloading: entity.weapon.isReloading,
                reloadEndTick: entity.weapon.reloadEndTick,
                nextFireTick: entity.weapon.nextFireTick,
            },
        };
    }

    /**
     * Get last processed input sequence for a player.
     */
    getLastProcessedInputSeq(playerId: string): number {
        const entity = this.getEntityByPlayerId(playerId);
        return entity?.lastProcessedInputSeq ?? -1;
    }

    /**
     * Cleanup resources.
     */
    destroy(): void {
        if (this.physicsWorld) {
            this.physicsWorld.free();
            this.physicsWorld = null;
        }
        this.world.entities.clear();
        this.bodyHandles.clear();
    }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create a quaternion from yaw angle.
 */
function quaternionFromYaw(yaw: number): Quat {
    const halfYaw = yaw * 0.5;
    return {
        x: 0,
        y: Math.sin(halfYaw),
        z: 0,
        w: Math.cos(halfYaw),
    };
}

function secondsToTicks(seconds: number): number {
    return Math.max(1, Math.round(seconds / TICK_DELTA));
}

function normalizeVec3(v: Vec3): Vec3 {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len <= 0.00001) return { x: 0, y: 0, z: 1 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function Vec3Distance(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function raySphereIntersection(origin: Vec3, dir: Vec3, center: Vec3, radius: number): number | null {
    const ox = origin.x - center.x;
    const oy = origin.y - center.y;
    const oz = origin.z - center.z;

    const b = ox * dir.x + oy * dir.y + oz * dir.z;
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const discriminant = b * b - c;
    if (discriminant < 0) return null;

    const t = -b - Math.sqrt(discriminant);
    if (t >= 0) return t;

    const t2 = -b + Math.sqrt(discriminant);
    return t2 >= 0 ? t2 : null;
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new simulation loop.
 */
export function createSimulationLoop(
    inputQueue: ServerInputQueue,
    config?: Partial<SimulationConfig>
): SimulationLoop {
    return new SimulationLoop(inputQueue, config);
}
