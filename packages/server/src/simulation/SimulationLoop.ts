/**
 * SimulationLoop - Deterministic game simulation
 * 
 * The core authoritative simulation that processes inputs and updates world state.
 * Executes systems in a fixed, deterministic order.
 */

import type RAPIER from '@dimforge/rapier3d-compat';
import fs from 'node:fs';
import path from 'node:path';
import { Extension, NodeIO } from '@gltf-transform/core';
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
import { COMBAT, SMG_STATS, type ServerMessage, type GameEvent, type GameMode } from '@snapshot/shared';

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
        weaponModelId: WeaponModelId;
        ammo: number;
        isReloading: boolean;
        reloadEndTick: Tick;
        nextFireTick: Tick;
        isADS: boolean;
    };
    lastProcessedInputTick: Tick;
    lastProcessedInputSeq: number;
    characterModelId: CharacterModelId;
    inputLockUntilTick: Tick;
    teamId: 1 | 2;
}

export interface MatchConfig {
    mode?: GameMode;
    targetScore?: number;
    teamByPlayer?: Record<string, number>;
}

interface HardpointDefinition {
    id: 'hardpoint1' | 'hardpoint2' | 'hardpoint3' | 'hardpoint4';
    position: Vec3;
    radius: number;
    suddenDeath: boolean;
}

interface SignalProtocolState {
    hardpoints: HardpointDefinition[];
    activeHardpointIndex: number;
    phaseStartTick: Tick;
    matchStartTick: Tick;
    teamSignal: [number, number];
    controllingTeam: 1 | 2 | null;
    contested: boolean;
    lastScoreBroadcast: [number, number];
    lastStateBroadcastTick: Tick;
}

export type CharacterModelId = 'assasin' | 'grizzly' | 'kodiak' | 'panda';
const DEFAULT_CHARACTER_MODEL_ID: CharacterModelId = 'assasin';
const VALID_CHARACTER_MODEL_IDS: ReadonlySet<string> = new Set(['assasin', 'grizzly', 'kodiak', 'panda']);
export type WeaponModelId =
    | 'smg1'
    | 'sniper'
    | 'short-gun'
    | 'g-88-workhorse'
    | 'kilometer'
    | 'the-mainline'
    | 'tungsten'
    | 'v-3-interval';
const DEFAULT_WEAPON_MODEL_ID: WeaponModelId = 'smg1';
const VALID_WEAPON_MODEL_IDS: ReadonlySet<string> = new Set([
    'smg1',
    'sniper',
    'short-gun',
    'g-88-workhorse',
    'kilometer',
    'the-mainline',
    'tungsten',
    'v-3-interval',
]);
interface WeaponRuntimeStats {
    damage: number;
    range: number;
    fireRateSeconds: number;
    reloadSeconds: number;
    magazineSize: number;
    headshotMultiplier: number;
}
const WEAPON_STATS_BY_MODEL_ID: Record<WeaponModelId, WeaponRuntimeStats> = {
    'smg1': { damage: 20, range: SMG_STATS.range, fireRateSeconds: SMG_STATS.fireRate, reloadSeconds: SMG_STATS.reloadTime, magazineSize: SMG_STATS.magazineSize, headshotMultiplier: SMG_STATS.headshotMultiplier },
    'sniper': { damage: 58, range: 90, fireRateSeconds: 0.9, reloadSeconds: 2.6, magazineSize: 6, headshotMultiplier: 1.8 },
    'short-gun': { damage: 34, range: 24, fireRateSeconds: 0.35, reloadSeconds: 2.2, magazineSize: 10, headshotMultiplier: 1.25 },
    'g-88-workhorse': { damage: 30, range: 54, fireRateSeconds: 0.16, reloadSeconds: 2.1, magazineSize: 28, headshotMultiplier: 1.35 },
    'kilometer': { damage: 24, range: 62, fireRateSeconds: 0.14, reloadSeconds: 1.9, magazineSize: 32, headshotMultiplier: 1.35 },
    'the-mainline': { damage: 32, range: 56, fireRateSeconds: 0.2, reloadSeconds: 2.3, magazineSize: 24, headshotMultiplier: 1.4 },
    'tungsten': { damage: 40, range: 46, fireRateSeconds: 0.28, reloadSeconds: 2.5, magazineSize: 18, headshotMultiplier: 1.45 },
    'v-3-interval': { damage: 27, range: 65, fireRateSeconds: 0.18, reloadSeconds: 2.0, magazineSize: 30, headshotMultiplier: 1.4 },
};
const SIGNAL_PROTOCOL = {
    targetScore: 500,
    rotationSeconds: 90,
    signalPerSecond: 10,
    hardpointRadius: 8,
    stateBroadcastIntervalTicks: 6,
} as const;
const DEFAULT_SIGNAL_HARDPOINTS: HardpointDefinition[] = [
    { id: 'hardpoint1', position: { x: -24, y: 3.1, z: 0 }, radius: SIGNAL_PROTOCOL.hardpointRadius, suddenDeath: false },
    { id: 'hardpoint2', position: { x: 0, y: 3.1, z: 0 }, radius: SIGNAL_PROTOCOL.hardpointRadius, suddenDeath: false },
    { id: 'hardpoint3', position: { x: 24, y: 3.1, z: 0 }, radius: SIGNAL_PROTOCOL.hardpointRadius, suddenDeath: false },
    { id: 'hardpoint4', position: { x: 0, y: 3.1, z: 18 }, radius: SIGNAL_PROTOCOL.hardpointRadius, suddenDeath: true },
];
const DEFAULT_TEAM_SPAWNS: Record<1 | 2, Vec3> = {
    1: { x: -18, y: 3, z: 0 },
    2: { x: 18, y: 3, z: 0 },
};

function resolveWeaponStats(weaponModelId: string): WeaponRuntimeStats {
    if (VALID_WEAPON_MODEL_IDS.has(weaponModelId)) {
        return WEAPON_STATS_BY_MODEL_ID[weaponModelId as WeaponModelId];
    }
    return WEAPON_STATS_BY_MODEL_ID[DEFAULT_WEAPON_MODEL_ID];
}

class KHRTextureTransformCompat extends Extension {
    public static readonly EXTENSION_NAME = 'KHR_texture_transform';
    public readonly extensionName = 'KHR_texture_transform';
    public read(): this {
        return this;
    }
    public write(): this {
        return this;
    }
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
    private teamByPlayerId: Map<string, 1 | 2> = new Map();
    private matchMode: GameMode = '1v1';
    private targetScore: number = 10;
    private hardpoints: HardpointDefinition[] = [...DEFAULT_SIGNAL_HARDPOINTS];
    private teamSpawns: Record<1 | 2, Vec3> = { ...DEFAULT_TEAM_SPAWNS };
    private signalState: SignalProtocolState | null = null;

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

            await this.loadMapColliders();

        } catch (e) {
            console.warn('SimulationLoop: Rapier not available, using simplified physics');
            this.rapier = null;
            this.physicsWorld = null;
        }
    }

    /**
     * Load static colliders from map JSON (server-side).
     */
    private async loadMapColliders(): Promise<void> {
        if (!this.rapier || !this.physicsWorld) return;
        const mapPath = path.resolve(process.cwd(), '../client/public/maps/space.glb');
        if (!fs.existsSync(mapPath)) {
            console.warn(`SimulationLoop: GLB map not found at ${mapPath}`);
            return;
        }

        try {
            const io = new NodeIO().registerExtensions([KHRTextureTransformCompat]);
            const doc = await io.read(mapPath);
            let meshCount = 0;
            let triCount = 0;
            const extractedHardpoints = new Map<string, Vec3>();
            const extractedTeamSpawns = new Map<1 | 2, Vec3>();

            const runtimeScale = 3;
            const runtimeOffsetY = 0.1;
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

            for (const node of doc.getRoot().listNodes()) {
                const nodeName = (node.getName() ?? '').toLowerCase();
                if (nodeName === 'hardpoint1' || nodeName === 'hardpoint2' || nodeName === 'hardpoint3' || nodeName === 'hardpoint4') {
                    const world = node.getWorldMatrix();
                    extractedHardpoints.set(nodeName, {
                        x: (world[12] ?? 0) * runtimeScale,
                        y: (world[13] ?? 0) * runtimeScale + runtimeOffsetY,
                        z: (world[14] ?? 0) * runtimeScale,
                    });
                }
                if (nodeName === 'spawnpoint1' || nodeName === 'spawnpoint2') {
                    const world = node.getWorldMatrix();
                    extractedTeamSpawns.set(nodeName === 'spawnpoint2' ? 2 : 1, {
                        x: (world[12] ?? 0) * runtimeScale,
                        y: (world[13] ?? 0) * runtimeScale + runtimeOffsetY,
                        z: (world[14] ?? 0) * runtimeScale,
                    });
                }
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
                        let wx = (world[0] ?? 0) * x + (world[4] ?? 0) * y + (world[8] ?? 0) * z + (world[12] ?? 0);
                        let wy = (world[1] ?? 0) * x + (world[5] ?? 0) * y + (world[9] ?? 0) * z + (world[13] ?? 0);
                        let wz = (world[2] ?? 0) * x + (world[6] ?? 0) * y + (world[10] ?? 0) * z + (world[14] ?? 0);
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

            console.log(`SimulationLoop: Loaded map colliders (meshes=${meshCount}, triangles=${triCount})`);
            console.log(`SimulationLoop: Colliders count=${this.physicsWorld.colliders.len()}`);
            if (minX !== Infinity) {
                this.mapBounds = {
                    min: { x: minX, y: minY, z: minZ },
                    max: { x: maxX, y: maxY, z: maxZ },
                };
                console.log(`SimulationLoop: Map bounds min=(${minX.toFixed(2)},${minY.toFixed(2)},${minZ.toFixed(2)}) max=(${maxX.toFixed(2)},${maxY.toFixed(2)},${maxZ.toFixed(2)})`);
            }
            this.hardpoints = this.resolveHardpoints(extractedHardpoints);
            this.teamSpawns = this.resolveTeamSpawns(extractedTeamSpawns);
            console.log('SimulationLoop: Team spawns', this.teamSpawns);
        } catch (e) {
            console.warn('SimulationLoop: Failed to load GLB map colliders', e);
        }
    }

    getTeamSpawn(teamId: 1 | 2): Vec3 {
        const spawn = this.teamSpawns[teamId];
        return spawn ? { ...spawn } : { ...DEFAULT_TEAM_SPAWNS[teamId] };
    }

    /**
     * Create a placeholder player entity.
     */
    createPlayerEntity(playerId: string, spawnPosition: Vec3, teamId?: number): EntityId {
        const id = entityId(this.world.nextEntityId++);
        const groundedAtSpawn = spawnPosition.y <= this.config.groundY + 0.05;
        const resolvedTeam = (teamId === 2 ? 2 : (this.teamByPlayerId.get(playerId) ?? 1)) as 1 | 2;

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
                weaponModelId: DEFAULT_WEAPON_MODEL_ID,
                ammo: WEAPON_STATS_BY_MODEL_ID[DEFAULT_WEAPON_MODEL_ID].magazineSize,
                isReloading: false,
                reloadEndTick: tick(0),
                nextFireTick: tick(0),
                isADS: false,
            },
            lastProcessedInputTick: tick(0),
            lastProcessedInputSeq: -1,
            characterModelId: DEFAULT_CHARACTER_MODEL_ID,
            inputLockUntilTick: tick(0),
            teamId: resolvedTeam,
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

    configureMatch(config: MatchConfig): void {
        this.matchMode = config.mode ?? '1v1';
        const fallbackTarget = this.matchMode === 'signal'
            ? SIGNAL_PROTOCOL.targetScore
            : this.matchMode === '4v4'
                ? 50
                : 10;
        this.targetScore = Math.max(1, Math.floor(config.targetScore ?? fallbackTarget));
        this.teamByPlayerId.clear();
        if (config.teamByPlayer) {
            for (const [playerId, teamRaw] of Object.entries(config.teamByPlayer)) {
                const team = Number(teamRaw) === 2 ? 2 : 1;
                this.teamByPlayerId.set(playerId, team);
            }
        }
        this.matchEnded = false;
        this.signalState = this.matchMode === 'signal'
            ? {
                hardpoints: this.hardpoints.length > 0 ? [...this.hardpoints] : [...DEFAULT_SIGNAL_HARDPOINTS],
                activeHardpointIndex: 0,
                phaseStartTick: this.world.tick,
                matchStartTick: this.world.tick,
                teamSignal: [0, 0],
                controllingTeam: null,
                contested: false,
                lastScoreBroadcast: [0, 0],
                lastStateBroadcastTick: this.world.tick,
            }
            : null;
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
        this.processSignalProtocol();
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
            if (this.isEntityInputLocked(entity)) {
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

    private isEntityInputLocked(entity: PlaceholderEntity): boolean {
        return entity.inputLockUntilTick > this.world.tick;
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
            const weaponStats = resolveWeaponStats(entity.weapon.weaponModelId);
            if (entity.weapon.isReloading && this.world.tick >= entity.weapon.reloadEndTick) {
                entity.weapon.isReloading = false;
                entity.weapon.ammo = weaponStats.magazineSize;
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
            if (this.isEntityInputLocked(shooter)) continue;
            if (shot.weaponId && VALID_WEAPON_MODEL_IDS.has(shot.weaponId)) {
                shooter.weapon.weaponModelId = shot.weaponId as WeaponModelId;
            }
            const weaponStats = resolveWeaponStats(shooter.weapon.weaponModelId);

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
                    weapon: shooter.weapon.weaponModelId,
                },
                tick: this.world.tick,
            });

            // Perform hit test against other players
            const hit = this.findRayHit(shooter, shot.origin, dir, weaponStats.range);
            shooter.weapon.ammo -= 1;
            shooter.weapon.nextFireTick = (this.world.tick + secondsToTicks(weaponStats.fireRateSeconds)) as Tick;

            if (!hit) {
                if (shooter.weapon.ammo <= 0) {
                    this.startReload(shooter);
                }
                continue;
            }

            const { target, hitPoint, isHeadshot } = hit;

            const damage = weaponStats.damage * (isHeadshot ? weaponStats.headshotMultiplier : 1);
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
            const weaponStats = resolveWeaponStats(entity.weapon.weaponModelId);
            entity.weapon.ammo = weaponStats.magazineSize;
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
        const weaponStats = resolveWeaponStats(entity.weapon.weaponModelId);
        entity.weapon.isReloading = true;
        entity.weapon.reloadEndTick = (this.world.tick + secondsToTicks(weaponStats.reloadSeconds)) as Tick;
    }

    private applyDamage(
        shooter: PlaceholderEntity,
        target: PlaceholderEntity,
        damage: number,
        shotId: string,
        _hitPoint: Vec3,
        _isHeadshot: boolean
    ): void {
        if (!target.isAlive) return;
        if (this.isEntityInputLocked(shooter) || this.isEntityInputLocked(target)) return;
        if (shooter.teamId === target.teamId) return;
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
            weapon: shooter.weapon.weaponModelId,
        };
        this.pendingMessages.push({
            type: 'event',
            event,
            tick: this.world.tick,
        });

        if (this.matchMode === 'signal') {
            return;
        }

        // Score update
        const scores = this.buildKillScoreRecord();
        this.pendingMessages.push({
            type: 'score_update',
            scores,
            targetScore: this.targetScore,
        });

        const team1Score = scores.team_1 ?? 0;
        const team2Score = scores.team_2 ?? 0;
        const shooterWon = this.matchMode === '4v4'
            ? (shooter.teamId === 1 ? team1Score : team2Score) >= this.targetScore
            : shooter.kills >= this.targetScore;
        if (shooterWon) {
            const winnerId = this.matchMode === '4v4'
                ? `team_${shooter.teamId}`
                : String(shooter.playerId);
            this.pendingMessages.push({
                type: 'match_ended',
                winnerId,
                scores,
                targetScore: this.targetScore,
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
        if (this.matchMode === 'signal') {
            return;
        }
        const scores = this.buildKillScoreRecord();
        const team1Score = scores.team_1 ?? 0;
        const team2Score = scores.team_2 ?? 0;
        let winnerId: string | null = null;
        if (this.matchMode === '4v4') {
            if (team1Score >= this.targetScore) winnerId = 'team_1';
            if (team2Score >= this.targetScore) winnerId = 'team_2';
        } else {
            for (const entity of this.world.entities.values()) {
                if (entity.kills >= this.targetScore) {
                    winnerId = entity.playerId;
                    break;
                }
            }
        }
        if (!winnerId) return;
        this.pendingMessages.push({
            type: 'match_ended',
            winnerId,
            scores,
            targetScore: this.targetScore,
        });
        this.matchEnded = true;
    }

    private buildKillScoreRecord(): Record<string, number> {
        const scores: Record<string, number> = {};
        let team1Score = 0;
        let team2Score = 0;
        for (const entity of this.world.entities.values()) {
            scores[entity.playerId] = entity.kills;
            if (entity.teamId === 1) team1Score += entity.kills;
            if (entity.teamId === 2) team2Score += entity.kills;
        }
        scores.team_1 = team1Score;
        scores.team_2 = team2Score;
        return scores;
    }

    private buildSignalScoreRecord(signal: [number, number]): Record<string, number> {
        const scores: Record<string, number> = {};
        for (const entity of this.world.entities.values()) {
            scores[entity.playerId] = entity.kills;
        }
        scores.team_1 = Math.round(signal[0]);
        scores.team_2 = Math.round(signal[1]);
        return scores;
    }

    private processSignalProtocol(): void {
        const state = this.signalState;
        if (!state || this.matchEnded) return;
        const hardpoints = state.hardpoints.length > 0 ? state.hardpoints : DEFAULT_SIGNAL_HARDPOINTS;
        const rotationTicks = secondsToTicks(SIGNAL_PROTOCOL.rotationSeconds);
        if (this.world.tick - state.phaseStartTick >= rotationTicks) {
            state.activeHardpointIndex = (state.activeHardpointIndex + 1) % 3;
            state.phaseStartTick = this.world.tick;
        }

        const activeHardpoint = hardpoints[state.activeHardpointIndex] ?? hardpoints[0]!;
        const radiusSq = activeHardpoint.radius * activeHardpoint.radius;
        let team1OnPoint = 0;
        let team2OnPoint = 0;
        for (const entity of this.world.entities.values()) {
            if (!entity.isAlive) continue;
            const dx = entity.position.x - activeHardpoint.position.x;
            const dz = entity.position.z - activeHardpoint.position.z;
            if ((dx * dx + dz * dz) > radiusSq) continue;
            if (entity.teamId === 1) {
                team1OnPoint++;
            } else {
                team2OnPoint++;
            }
        }

        state.contested = team1OnPoint > 0 && team2OnPoint > 0;
        if (state.contested) {
            state.controllingTeam = null;
        } else if (team1OnPoint > 0) {
            state.controllingTeam = 1;
        } else if (team2OnPoint > 0) {
            state.controllingTeam = 2;
        } else {
            state.controllingTeam = null;
        }

        if (state.controllingTeam !== null && !state.contested) {
            const delta = SIGNAL_PROTOCOL.signalPerSecond * TICK_DELTA;
            if (state.controllingTeam === 1) {
                state.teamSignal[0] = Math.min(this.targetScore, state.teamSignal[0] + delta);
            } else {
                state.teamSignal[1] = Math.min(this.targetScore, state.teamSignal[1] + delta);
            }
        }

        const rounded: [number, number] = [Math.round(state.teamSignal[0]), Math.round(state.teamSignal[1])];
        if (rounded[0] !== state.lastScoreBroadcast[0] || rounded[1] !== state.lastScoreBroadcast[1]) {
            state.lastScoreBroadcast = rounded;
            this.pendingMessages.push({
                type: 'score_update',
                scores: this.buildSignalScoreRecord(state.teamSignal),
                targetScore: this.targetScore,
            });
        }

        if (this.world.tick - state.lastStateBroadcastTick >= SIGNAL_PROTOCOL.stateBroadcastIntervalTicks) {
            state.lastStateBroadcastTick = this.world.tick;
            this.pendingMessages.push({
                type: 'signal_state',
                activeHardpointId: activeHardpoint.id,
                activeHardpointIndex: state.activeHardpointIndex,
                hardpointPosition: { ...activeHardpoint.position },
                hardpointRadius: activeHardpoint.radius,
                controllingTeam: state.controllingTeam,
                contested: state.contested,
                teamSignal: [rounded[0], rounded[1]],
                targetSignal: this.targetScore,
                tick: this.world.tick,
            });
        }

        if (rounded[0] >= this.targetScore || rounded[1] >= this.targetScore) {
            const winnerTeam = rounded[0] >= this.targetScore ? 1 : 2;
            this.pendingMessages.push({
                type: 'match_ended',
                winnerId: `team_${winnerTeam}`,
                scores: this.buildSignalScoreRecord(state.teamSignal),
                targetScore: this.targetScore,
            });
            this.matchEnded = true;
        }
    }

    private resolveHardpoints(extractedHardpoints: Map<string, Vec3>): HardpointDefinition[] {
        const ids: HardpointDefinition['id'][] = ['hardpoint1', 'hardpoint2', 'hardpoint3', 'hardpoint4'];
        const out: HardpointDefinition[] = [];
        for (const id of ids) {
            const position = extractedHardpoints.get(id);
            if (position) {
                out.push({
                    id,
                    position: { ...position },
                    radius: SIGNAL_PROTOCOL.hardpointRadius,
                    suddenDeath: id === 'hardpoint4',
                });
            }
        }
        if (out.length >= 4) {
            return out;
        }
        return [...DEFAULT_SIGNAL_HARDPOINTS];
    }

    private resolveTeamSpawns(extractedTeamSpawns: Map<1 | 2, Vec3>): Record<1 | 2, Vec3> {
        return {
            1: extractedTeamSpawns.get(1) ? { ...extractedTeamSpawns.get(1)! } : { ...DEFAULT_TEAM_SPAWNS[1] },
            2: extractedTeamSpawns.get(2) ? { ...extractedTeamSpawns.get(2)! } : { ...DEFAULT_TEAM_SPAWNS[2] },
        };
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
                teamId: entity.teamId,
                isAlive: entity.isAlive,
                characterModelId: entity.characterModelId,
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

    setCharacterModelForPlayer(playerId: string, characterModelId: string): void {
        if (!VALID_CHARACTER_MODEL_IDS.has(characterModelId)) return;
        const entity = this.getEntityByPlayerId(playerId);
        if (!entity) return;
        entity.characterModelId = characterModelId as CharacterModelId;
    }

    setWeaponModelForPlayer(playerId: string, weaponModelId: string): void {
        if (!VALID_WEAPON_MODEL_IDS.has(weaponModelId)) return;
        const entity = this.getEntityByPlayerId(playerId);
        if (!entity) return;
        entity.weapon.weaponModelId = weaponModelId as WeaponModelId;
        const weaponStats = resolveWeaponStats(entity.weapon.weaponModelId);
        entity.weapon.ammo = Math.min(entity.weapon.ammo, weaponStats.magazineSize);
        if (entity.weapon.ammo <= 0) {
            entity.weapon.ammo = weaponStats.magazineSize;
        }
        entity.weapon.isReloading = false;
        entity.weapon.reloadEndTick = tick(0);
        entity.weapon.nextFireTick = tick(0);
    }

    setInputLockForPlayers(playerIds: string[], durationSeconds: number): Tick {
        const endTick = (this.world.tick + secondsToTicks(durationSeconds)) as Tick;
        for (const playerId of playerIds) {
            const entity = this.getEntityByPlayerId(playerId);
            if (!entity) continue;
            entity.inputLockUntilTick = endTick;
            entity.velocity = { x: 0, y: 0, z: 0 };
        }
        return endTick;
    }

    isInputLockedForPlayer(playerId: string): boolean {
        const entity = this.getEntityByPlayerId(playerId);
        if (!entity) return false;
        return this.isEntityInputLocked(entity);
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
