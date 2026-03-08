/**
 * @snapshot/client
 * 
 * SNAPSHOT Game Client
 * 
 * Entry point that initializes React UI and Three.js game.
 */

import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './index.css';
import '@solana/wallet-adapter-react-ui/styles.css';
import { createGameRenderer } from './game/core/GameRenderer';
import { createInputHandler } from './game/core/InputHandler';
import { createShooterCameraController } from './game/core/ShooterCameraController';
import { createGameBridge } from './bridge/GameBridge';
import { AudioManager } from './game/audio/AudioManager';
import {
    createMovementState,
    isDodgeActive,
    type EntityId,
    Species,
    SMG_STATS,
} from '@snapshot/shared';
import { TICK_MS, tick } from '@snapshot/shared/simulation';
import * as THREE from 'three';
import { createBVHCharacterController, generateBVHColliderFromGroup, type BVHCharacterController } from './game/physics/BVHCharacterController';
import { GLTFLoader as _GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getGameClient } from './networking/GameClient';

// =============================================================================
// INITIALIZATION
// =============================================================================


import { WalletProvider } from './wallet/WalletProvider';

function extractMapSpawnPositions(root: THREE.Object3D): {
    team1: { x: number; y: number; z: number } | null;
    team2: { x: number; y: number; z: number } | null;
    hardpoints: Array<{ id: string; position: { x: number; y: number; z: number }; radius?: number }>;
} {
    const byNameLower = new Map<string, THREE.Object3D>();
    root.traverse((obj) => {
        const key = (obj.name || '').trim().toLowerCase();
        if (!key || byNameLower.has(key)) return;
        byNameLower.set(key, obj);
    });

    const readPoint = (name: string): { x: number; y: number; z: number } | null => {
        const target = byNameLower.get(name);
        if (!target) return null;
        const worldPos = new THREE.Vector3();
        target.getWorldPosition(worldPos);
        return { x: worldPos.x, y: worldPos.y, z: worldPos.z };
    };

    return {
        team1: readPoint('spawnpoint1'),
        team2: readPoint('spawnpoint2'),
        hardpoints: ['hardpoint1', 'hardpoint2', 'hardpoint3', 'hardpoint4'].reduce<Array<{ id: string; position: { x: number; y: number; z: number }; radius?: number }>>((out, id) => {
            const position = readPoint(id);
            if (position) {
                out.push({ id, position, radius: 8 });
            }
            return out;
        }, []),
    };
}

function projectPointToColliderFloor(
    collider: THREE.Mesh | null,
    point: { x: number; y: number; z: number },
    lift: number = 0.08,
): { x: number; y: number; z: number } {
    const boundsTree = collider?.geometry?.boundsTree;
    if (!boundsTree) return { ...point };
    const offsets = [4, 12, 40];
    let hit: { point: THREE.Vector3 } | null = null;
    for (const offset of offsets) {
        const origin = new THREE.Vector3(point.x, point.y + offset, point.z);
        const ray = new THREE.Ray(origin, new THREE.Vector3(0, -1, 0));
        const nextHit = boundsTree.raycastFirst(ray, THREE.DoubleSide);
        if (!nextHit) continue;
        hit = nextHit as { point: THREE.Vector3 };
        break;
    }
    if (!hit) return { ...point };
    return {
        x: point.x,
        y: hit.point.y + lift,
        z: point.z,
    };
}

async function main(): Promise<void> {
    console.log('========================================');
    console.log('  SNAPSHOT Client');
    console.log('  1v1 Multiplayer Arena Shooter');
    console.log('========================================');
    console.log('');

    // Initialize React UI
    const rootElement = document.getElementById('root');
    if (!rootElement) {
        throw new Error('Root element not found');
    }

    const root = createRoot(rootElement);
    root.render(
        <WalletProvider>
            <App />
        </WalletProvider>
    );

    console.log('React UI initialized');

    // Wait for React to render, then initialize game
    // The game will be initialized when the user clicks Play
    // setTimeout(() => {
    //    initializeGame(bridge);
    // }, 100);
}


/**
 * Initialize the game renderer and input handler.
 */
export async function initializeGame(bridge: ReturnType<typeof createGameBridge>): Promise<void> {
    const canvasContainer = document.getElementById('game-canvas');
    if (!canvasContainer) {
        console.log('Canvas container not ready, waiting...');
        setTimeout(() => initializeGame(bridge), 100);
        return;
    }

    // Get local player ID from bridge (network identity)
    let localPlayerId: EntityId | null = bridge.getState().localPlayerEntityId as EntityId;
    // Local visual is decoupled from network ID to avoid desync while testing.
    const LOCAL_VISUAL_ID = (-100 as unknown as EntityId);
    if (!localPlayerId) {
        console.error('GameClient: Local player ID missing in initializeGame');
    }

    // BVH Character Controller (created after map loads)
    let characterController: BVHCharacterController | null = null;
    let bvhCollider: THREE.Mesh | null = null;

    // HMR Cleanup: Dispose previous instance if it exists
    if ((window as any).__game) {
        console.log('Disposing previous game instance...');
        try {
            (window as any).__game.renderer.dispose();
            // Cancel events/inputs if needed, but renderer dispose handles canvas
        } catch (e) {
            console.warn('Error verifying cleanup:', e);
        }
    }

    // Determine spawn position early so controller exists immediately
    let initialSpawn = new THREE.Vector3(0, 2, 0);
    const matchDataEarly = bridge.getMatchData();
    if (matchDataEarly && matchDataEarly.spawnPosition) {
        initialSpawn.set(
            matchDataEarly.spawnPosition.x,
            matchDataEarly.spawnPosition.y,
            matchDataEarly.spawnPosition.z
        );
    }

    // Create character controller immediately (collider will be attached after map loads)
    if (!characterController) {
        characterController = createBVHCharacterController(initialSpawn);
        console.log('BVH character controller created (pre-collider) at', initialSpawn);
    }

    const client = getGameClient();

    let mapLoadedNotified = false;
    let localPreRoundStarted = false;

    // Create game renderer
    const renderer = createGameRenderer({
        container: canvasContainer,
        cameraPosition: { x: 0, y: 5, z: 10 },
        shadows: true,
        mapAssetPath: '/maps/space.glb',
        onMapLoaded: (mesh) => {
            bvhCollider = generateBVHColliderFromGroup(mesh);
            if (bvhCollider) {
                renderer.mainScene.add(bvhCollider);
                client.setAuthoritativeCollider(bvhCollider);
                console.log('BVH collider created');
            }

            const rawMapSpawns = extractMapSpawnPositions(mesh);
            const mapSpawns = {
                team1: rawMapSpawns.team1 ? projectPointToColliderFloor(bvhCollider, rawMapSpawns.team1) : null,
                team2: rawMapSpawns.team2 ? projectPointToColliderFloor(bvhCollider, rawMapSpawns.team2) : null,
                hardpoints: rawMapSpawns.hardpoints.map((entry) => ({
                    ...entry,
                    position: projectPointToColliderFloor(bvhCollider, entry.position),
                })),
            };
            if (mapSpawns.team1 && mapSpawns.team2) {
                client.setSignalSoloSpawnPoints(mapSpawns.team1, mapSpawns.team2);
                client.setTeamSpawnPoints(mapSpawns.team1, mapSpawns.team2);
                if (!bridge.getState().isConnected && characterController) {
                    const localSpawn = new THREE.Vector3(mapSpawns.team1.x, mapSpawns.team1.y, mapSpawns.team1.z);
                    initialSpawn.copy(localSpawn);
                    characterController.reset(localSpawn);
                    bridge.setLocalRenderPos({ x: localSpawn.x, y: localSpawn.y, z: localSpawn.z });
                    bridge.applyServerCorrection?.({ x: localSpawn.x, y: localSpawn.y, z: localSpawn.z });
                    bridge.clearServerCorrectionTarget?.();
                }
            }
            if (mapSpawns.hardpoints.length >= 3) {
                client.setSignalHardpointPositions(mapSpawns.hardpoints);
            }
            client.bindSignalHardpointScene(renderer.mainScene);

            if (bvhCollider && characterController) {
                characterController.setCollider(bvhCollider);
                console.log('BVH collider attached to character controller');
            }
            if (!mapLoadedNotified) {
                mapLoadedNotified = true;
                client.sendMapLoaded();
                if (!bridge.getState().isConnected && !localPreRoundStarted) {
                    localPreRoundStarted = true;
                    bridge.notifyPreRoundStart({
                        durationSec: 10,
                        availableCharacterModelIds: ['assasin', 'grizzly', 'kodiak', 'panda'],
                    });
                }
            }
        }
    });

    console.log('Three.js renderer initialized');

    // Always create a local visual for the controller.
    if (!renderer.hasEntityVisual(LOCAL_VISUAL_ID)) {
        renderer.setMinimapLocalEntityId(LOCAL_VISUAL_ID);
        renderer.createPlayerVisual(LOCAL_VISUAL_ID, Species.Urshari, bridge.getState().localTeamId ?? 1, bridge.getState().selectedCharacterModelId);
        console.log('Created local player visual');
    }

    // Create input handler
    const input = createInputHandler({
        target: renderer.canvas,
        sensitivity: 0.002,
    });

    console.log('Input handler initialized');

    // Create shooter third-person camera controller
    renderer.mainCamera.position.set(0, 5, 15);
    const camera = createShooterCameraController(renderer.mainCamera, {
        distance: 2.7,
        verticalOffset: 1.8,
        shoulderOffset: 0.4,
    });
    console.log('Shooter camera initialized');

    const audio = new AudioManager({ masterVolume: 1.0, sfxVolume: 0.9 });

    // Input tick sending
    const inputStartTime = performance.now();
    let lastSentTick = -1;
    let inputSequence = 0;

    // Subscribe to UI events
    const remoteAnimStates = new Map<EntityId, {
        lastPos: { x: number; y: number; z: number };
        lastUpdateMs: number;
        isGrounded?: boolean;
    }>();
    const remoteAnimHints = new Map<EntityId, { locomotion: string; isSliding: boolean; atMs: number }>();
    const CLIENT_AUTHORITY = false;
    const POSE_SEND_INTERVAL_MS = 33;
    let lastPoseSentMs = 0;
    const ACK_GUARD = {
        maxStaleTicks: 20,
        minSeq: 0,
    };

    const resolveVisualId = (entityId: EntityId): EntityId => {
        const localEntityId = bridge.getState().localPlayerEntityId as EntityId | null;
        if (localEntityId !== null && entityId === localEntityId) {
            return LOCAL_VISUAL_ID;
        }
        return entityId;
    };

    const getDesiredCharacterModel = (entityId: EntityId): string =>
        bridge.getEntityCharacterModelId(entityId) ?? 'assasin';

    const getDesiredTeamId = (entityId: EntityId): number =>
        bridge.getEntityTeamId(entityId) ?? 2;

    const getDesiredWeaponModel = (entityId: EntityId): string => {
        const localEntityId = bridge.getState().localPlayerEntityId as EntityId | null;
        if ((entityId === LOCAL_VISUAL_ID) || (localEntityId !== null && entityId === localEntityId)) {
            return bridge.getState().selectedWeaponModelId ?? 'smg1';
        }
        return bridge.getEntityWeaponModelId(entityId) ?? 'smg1';
    };

    const ensureVisual = (entityId: EntityId, teamId: number, desiredModelId: string, desiredWeaponModelId: string): void => {
        const currentModelId = renderer.getEntityCharacterModelId(entityId);
        const currentWeaponModelId = renderer.getEntityWeaponModelId(entityId);
        if (!renderer.hasEntityVisual(entityId)) {
            renderer.createPlayerVisual(entityId, Species.Urshari, teamId, desiredModelId, desiredWeaponModelId);
            return;
        }
        renderer.updateEntityTeam(entityId, teamId);
        if (currentModelId !== desiredModelId || currentWeaponModelId !== desiredWeaponModelId) {
            renderer.removeEntityVisual(entityId);
            renderer.createPlayerVisual(entityId, Species.Urshari, teamId, desiredModelId, desiredWeaponModelId);
        }
    };

    let lastHealth = bridge.getState().health;
    let lastIsDead = bridge.getState().isDead;
    let lastIsReloading = bridge.getState().isReloading;
    const deadEntities = new Set<EntityId>();
    type PulseRingEffect = {
        mesh: THREE.Mesh;
        material: THREE.MeshBasicMaterial;
        startMs: number;
        durationMs: number;
        maxScale: number;
    };
    type ToxinFieldEffect = {
        group: THREE.Group;
        disc: THREE.Mesh;
        ring: THREE.Mesh;
        discMat: THREE.MeshBasicMaterial;
        ringMat: THREE.MeshBasicMaterial;
        light: THREE.PointLight;
        endT: number;
    };
    type LocalBuffAuraEffect = {
        group: THREE.Group;
        innerRing: THREE.Mesh;
        innerMat: THREE.MeshBasicMaterial;
        outerRing: THREE.Mesh;
        outerMat: THREE.MeshBasicMaterial;
        light: THREE.PointLight;
        buffKey: string;
    };
    const pulseRingEffects: PulseRingEffect[] = [];
    const toxinFields = new Map<string, ToxinFieldEffect>();
    let localBuffAura: LocalBuffAuraEffect | null = null;

    const createPulseRingEffect = (
        position: { x: number; y: number; z: number },
        color: number,
        maxScale: number = 2.8,
        durationMs: number = 320,
    ): void => {
        const geometry = new THREE.RingGeometry(0.8, 1.1, 48);
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(position.x, position.y + 0.08, position.z);
        renderer.mainScene.add(mesh);
        pulseRingEffects.push({
            mesh,
            material,
            startMs: performance.now(),
            durationMs,
            maxScale,
        });
    };

    const getScenePositionForPlayerId = (playerId: string): THREE.Vector3 | null => {
        const entityId = bridge.getEntityIdForPlayerId(playerId as any);
        if (entityId === null) return null;
        return renderer.getEntityPosition(resolveVisualId(entityId as any));
    };

    const clearToxinField = (key: string): void => {
        const field = toxinFields.get(key);
        if (!field) return;
        renderer.mainScene.remove(field.group);
        renderer.mainScene.remove(field.light);
        field.disc.geometry.dispose();
        field.ring.geometry.dispose();
        field.discMat.dispose();
        field.ringMat.dispose();
        toxinFields.delete(key);
    };

    const spawnToxinField = (key: string, center: { x: number; y: number; z: number }, radius: number, endT: number): void => {
        clearToxinField(key);
        const group = new THREE.Group();
        const discMat = new THREE.MeshBasicMaterial({
            color: 0x65ff7a,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(center.x, center.y + 0.05, center.z);
        group.add(disc);

        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xb7ff63,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.35, radius, 64), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(center.x, center.y + 0.07, center.z);
        group.add(ring);

        const light = new THREE.PointLight(0x8cff66, 2.2, Math.max(12, radius * 3));
        light.position.set(center.x, center.y + 2.0, center.z);
        renderer.mainScene.add(group);
        renderer.mainScene.add(light);
        toxinFields.set(key, { group, disc, ring, discMat, ringMat, light, endT });
    };

    const clearLocalBuffAura = (): void => {
        if (!localBuffAura) return;
        renderer.mainScene.remove(localBuffAura.group);
        renderer.mainScene.remove(localBuffAura.light);
        localBuffAura.innerRing.geometry.dispose();
        localBuffAura.outerRing.geometry.dispose();
        localBuffAura.innerMat.dispose();
        localBuffAura.outerMat.dispose();
        localBuffAura = null;
    };

    const ensureLocalBuffAura = (buffKey: string): void => {
        const normalized = buffKey.trim().toUpperCase();
        if (!normalized) {
            clearLocalBuffAura();
            return;
        }
        if (localBuffAura?.buffKey === normalized) {
            return;
        }
        clearLocalBuffAura();
        let color = 0x55ddff;
        if (normalized.includes('FORGE')) color = 0xff9a52;
        if (normalized.includes('TOXIN')) color = 0x8fff66;
        if (normalized.includes('STAMPEDE')) color = 0xffd54a;
        if (normalized.includes('SCRAP')) color = 0x59f5ff;

        const group = new THREE.Group();
        const innerMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.45,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.9, 40), innerMat);
        innerRing.rotation.x = -Math.PI / 2;
        group.add(innerRing);

        const outerMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.22,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const outerRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.35, 40), outerMat);
        outerRing.rotation.x = -Math.PI / 2;
        outerRing.position.y = 0.04;
        group.add(outerRing);

        const light = new THREE.PointLight(color, 1.4, 6);
        renderer.mainScene.add(group);
        renderer.mainScene.add(light);
        localBuffAura = { group, innerRing, innerMat, outerRing, outerMat, light, buffKey: normalized };
    };

    bridge.subscribeToGame((event) => {
        if (event.type === 'state_update') {
            const state = bridge.getState();
            if (state.health < lastHealth && state.health > 0 && !state.isDead) {
                renderer.playOverlayAnimation(LOCAL_VISUAL_ID, 'Hit React', 450, 0.9, { loop: false, clamp: false });
            }

            if (!lastIsReloading && state.isReloading) {
                renderer.playOverlayAnimation(
                    LOCAL_VISUAL_ID,
                    'Grabbing Ammo',
                    SMG_STATS.reloadTime * 1000,
                    0.9,
                    { loop: false, clamp: false }
                );
            }

            if (!lastIsDead && state.isDead) {
                renderer.playOverrideAnimation(LOCAL_VISUAL_ID, 'Death', { loop: false, clamp: true });
            }

            if (lastIsDead && !state.isDead) {
                renderer.clearOverrideAnimation(LOCAL_VISUAL_ID);
            }

            lastHealth = state.health;
            lastIsDead = state.isDead;
            lastIsReloading = state.isReloading;
            return;
        }

        if (event.type !== 'game_event') return;
        const gameEvent = event.event;
        if (gameEvent.type === 'damage_taken') {
            const visualId = resolveVisualId(gameEvent.targetId as any);
            renderer.playOverlayAnimation(visualId, 'Hit React', 450, 0.9, { loop: false, clamp: false });
            return;
        }

        if (gameEvent.type === 'damage_dealt') {
            const visualId = resolveVisualId(gameEvent.sourceId as any);
            renderer.playOverlayAnimation(visualId, 'Pistol Walk', 120, 0.85, { loop: false, clamp: false });
            return;
        }

        if (gameEvent.type === 'shot_fired') {
            const visualId = resolveVisualId(gameEvent.sourceId as any);
            renderer.playOverlayAnimation(visualId, 'Pistol Walk', 120, 0.85, { loop: false, clamp: false });
            if (visualId !== LOCAL_VISUAL_ID) {
                const start = new THREE.Vector3(gameEvent.origin.x, gameEvent.origin.y, gameEvent.origin.z);
                const end = start.clone().add(new THREE.Vector3(
                    gameEvent.direction.x,
                    gameEvent.direction.y,
                    gameEvent.direction.z
                ).multiplyScalar(SMG_STATS.range));
                renderer.createTracer(start, end);
                renderer.showMuzzleFlash(start);
            }
            return;
        }

        if (gameEvent.type === 'aim_state') {
            const visualId = resolveVisualId(gameEvent.sourceId as any);
            renderer.setAiming(visualId, gameEvent.isAiming);
            return;
        }

        if ((gameEvent as any).type === 'p2p_anim_state') {
            const visualId = resolveVisualId((gameEvent as any).sourceId as any);
            remoteAnimHints.set(visualId, {
                locomotion: String((gameEvent as any).locomotion ?? 'idle'),
                isSliding: Boolean((gameEvent as any).isSliding),
                atMs: performance.now(),
            });
            return;
        }

        if (gameEvent.type === 'player_died') {
            const visualId = resolveVisualId(gameEvent.entityId as any);
            renderer.playOverrideAnimation(visualId, 'Death', { loop: false, clamp: true });
            deadEntities.add(visualId);
            return;
        }

        if (gameEvent.type === 'player_spawned') {
            const visualId = resolveVisualId(gameEvent.entityId as any);
            renderer.clearOverrideAnimation(visualId);
            renderer.setAnimation(visualId, 'idle');
            deadEntities.delete(visualId);
            if (visualId === LOCAL_VISUAL_ID && characterController) {
                const spawnPos = new THREE.Vector3(
                    gameEvent.position.x,
                    gameEvent.position.y,
                    gameEvent.position.z
                );
                characterController.reset(spawnPos);
                playerPosition.copy(spawnPos);
                bridge.applyServerCorrection?.({ x: spawnPos.x, y: spawnPos.y, z: spawnPos.z });
                bridge.clearServerCorrectionTarget?.();
                client.sendPose({
                    position: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z },
                    velocity: { x: 0, y: 0, z: 0 },
                    rotation: { x: 0, y: 0, z: 0, w: 1 },
                    isGrounded: true,
                    timeMs: performance.now(),
                });
            }
            return;
        }

        if (gameEvent.type === 'FORGE_LINK_PULSE' && 'data' in gameEvent) {
            const signalEvent: any = gameEvent.data;
            const sourcePos = getScenePositionForPlayerId(String(signalEvent.sourceVictimId ?? ''));
            if (sourcePos) {
                renderer.createHitEffect(sourcePos.clone(), new THREE.Vector3(0, 1, 0));
                createPulseRingEffect(sourcePos, 0xff9a52, 2.2, 260);
            }
            for (const linkedPlayerId of Array.isArray(signalEvent.linkedPlayerIds) ? signalEvent.linkedPlayerIds : []) {
                const linkedPos = getScenePositionForPlayerId(String(linkedPlayerId));
                if (!linkedPos) continue;
                renderer.createHitEffect(linkedPos.clone(), new THREE.Vector3(0, 1, 0));
                createPulseRingEffect(linkedPos, 0xff9a52, 1.8, 240);
                if (sourcePos) {
                    renderer.createTracer(sourcePos.clone(), linkedPos.clone());
                }
            }
            return;
        }

        if (gameEvent.type === 'STAMPEDE_KNOCK' && 'data' in gameEvent) {
            const signalEvent: any = gameEvent.data;
            const attackerPos = getScenePositionForPlayerId(String(signalEvent.attackerId ?? ''));
            const victimPos = getScenePositionForPlayerId(String(signalEvent.victimId ?? ''));
            if (victimPos) {
                renderer.createHitEffect(victimPos.clone(), new THREE.Vector3(0, 1, 0));
                createPulseRingEffect(victimPos, 0xffd54a, 2.8, 280);
            }
            if (attackerPos && victimPos) {
                renderer.createTracer(attackerPos.clone(), victimPos.clone());
            }
            return;
        }

        if (gameEvent.type === 'TOXIN_START' && 'data' in gameEvent) {
            const signalEvent: any = gameEvent.data;
            spawnToxinField(
                `toxin_${String(signalEvent.team ?? 'unknown')}`,
                signalEvent.center,
                Number(signalEvent.radius ?? 6),
                Number(signalEvent.endT ?? (performance.now() + 8000)),
            );
            return;
        }

        if (gameEvent.type === 'TOXIN_END' && 'data' in gameEvent) {
            const signalEvent: any = gameEvent.data;
            clearToxinField(`toxin_${String(signalEvent.team ?? 'unknown')}`);
            return;
        }

        if (gameEvent.type === 'DROP_BUFF_START' && 'data' in gameEvent) {
            const signalEvent: any = gameEvent.data;
            const localTeam = bridge.getState().localTeamId === 2 ? 'red' : 'blue';
            if (String(signalEvent.team ?? '') === localTeam) {
                createPulseRingEffect(playerPosition, 0x55ddff, 3.2, 360);
            }
        }
    });

    bridge.subscribeToUI((event) => {
        switch (event.type) {
            case 'set_sensitivity':
                input.setSensitivity(event.value);
                break;
            case 'set_fov':
                // Update base FOV in camera config would require recreating
                // For now, directly set on camera
                renderer.mainCamera.fov = event.value;
                renderer.mainCamera.updateProjectionMatrix();
                break;
            case 'quit_match':
                console.log('Quitting match...');
                break;
            case 'entity_move':
                if (localPlayerId !== null && event.entityId === localPlayerId) {
                    // Ignore local network entity updates for now to avoid snapbacks/dup visuals.
                    break;
                }
                ensureVisual(
                    event.entityId,
                    getDesiredTeamId(event.entityId),
                    getDesiredCharacterModel(event.entityId),
                    getDesiredWeaponModel(event.entityId),
                );
                renderer.updateEntityTransform(event.entityId, event.position, event.rotation);
                break;
        }
    });

    // Start render loop
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsUpdateTime = lastTime;
    const NETDBG = import.meta.env.DEV && String(import.meta.env.VITE_NETDBG ?? '').toLowerCase() === 'true';
    let lastNetDbgMs = 0;

    // Simulated player position (would come from game state)
    const playerPosition = new THREE.Vector3(initialSpawn.x, initialSpawn.y, initialSpawn.z);
    let lastLocalServerPos = new THREE.Vector3(0, 0, 0);
    const tmpLocalPos = new THREE.Vector3();
    const tmpLocalVel = new THREE.Vector3();
    const tmpVisualPos = new THREE.Vector3();
    const tmpPushOffset = new THREE.Vector3();
    const tmpCorrectionTarget = new THREE.Vector3();
    const tmpCameraPos = new THREE.Vector3();
    const tmpAimPoint = new THREE.Vector3();
    const tmpShootDir = new THREE.Vector3();
    const tmpHitNormal = new THREE.Vector3(0, 1, 0);
    const tmpShotOrigin = new THREE.Vector3();
    const tmpCorrectionDelta = new THREE.Vector3();
    const tmpPlayerQuat = new THREE.Quaternion();
    const tmpCameraDir = new THREE.Vector3();
    const tmpRay = new THREE.Ray();
    const upAxis = new THREE.Vector3(0, 1, 0);
    const screenCenter = new THREE.Vector2(0, 0);
    const shotRaycaster = new THREE.Raycaster();
    const tmpHitPoint = new THREE.Vector3();
    let lastUiAiming = false;
    const playerVelocity = { x: 0, y: 0, z: 0 };

    let lastShotTime = 0;
    let lastJumpPressed = false;
    let lastWasGrounded = true;

    // Client-side movement state
    const movementState = createMovementState();

    function animate(): void {
        requestAnimationFrame(animate);

        const now = performance.now();
        bridge.tickLocalPreRound(now);
        if (NETDBG) {
            if (!(window as any).__netdbg_last) (window as any).__netdbg_last = 0;
            if (now - (window as any).__netdbg_last > 1000) {
                (window as any).__netdbg_last = now;
                const dbg = bridge.getDebugNetState?.();
                if (dbg) {
                    console.log("[NETDBG]", dbg);
                } else {
                    console.log("[NETDBG] bridge debug state missing");
                }
            }
        }
        const deltaTime = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        // If local player ID wasn't ready at init, pull it once from bridge.
        if (!localPlayerId) {
            const stateId = bridge.getState().localPlayerEntityId as EntityId;
            if (stateId) {
                localPlayerId = stateId;
                // If a remote visual existed for our network entity, remove it.
                if (renderer.hasEntityVisual(localPlayerId)) {
                    renderer.removeEntityVisual(localPlayerId);
                }
                remoteAnimStates.delete(localPlayerId);
                console.log('Local player network ID resolved', localPlayerId);
            }
        }
        // Safety: ensure local visual exists even if it was dropped.
        if (!renderer.hasEntityVisual(LOCAL_VISUAL_ID)) {
            renderer.setMinimapLocalEntityId(LOCAL_VISUAL_ID);
            renderer.createPlayerVisual(LOCAL_VISUAL_ID, Species.Urshari, bridge.getState().localTeamId ?? 1, bridge.getState().selectedCharacterModelId);
            console.log('Recreated local player visual');
        }
        const liveState = bridge.getState();
        const normalizedLocalDropBuff = String(liveState.signalActiveDropBuffName ?? '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_');
        const hasLocalStampede = normalizedLocalDropBuff.includes('STAMPEDE');
        const hasLocalSkyRecon = normalizedLocalDropBuff.includes('SKY_EYE_RECON');
        ensureVisual(
            LOCAL_VISUAL_ID,
            liveState.localTeamId ?? 1,
            bridge.getState().selectedCharacterModelId,
            bridge.getState().selectedWeaponModelId,
        );

        // FPS counter
        frameCount++;
        if (now - fpsUpdateTime >= 1000) {
            const elapsed = now - fpsUpdateTime;
            const avgFrameTimeMs = frameCount > 0 ? elapsed / frameCount : 0;
            bridge.updateState({ fps: frameCount, frameTimeMs: avgFrameTimeMs });
            frameCount = 0;
            fpsUpdateTime = now;
        }
        if (NETDBG && now - lastNetDbgMs >= 1000) {
            lastNetDbgMs = now;
            const dbg = bridge.getDebugNetState();
            if (dbg.localPlayerId && dbg.localRenderPos) {
                const localServer = dbg.lastServerPosByPlayerId.get(dbg.localPlayerId as any);
                for (const [remoteId, remoteRender] of dbg.remoteRenderPos) {
                    const remoteServer = dbg.lastServerPosByPlayerId.get(remoteId as any);
                    if (!localServer || !remoteServer) continue;
                    const dRx = remoteRender.x - dbg.localRenderPos.x;
                    const dRy = remoteRender.y - dbg.localRenderPos.y;
                    const dRz = remoteRender.z - dbg.localRenderPos.z;
                    const dSx = remoteServer.x - localServer.x;
                    const dSy = remoteServer.y - localServer.y;
                    const dSz = remoteServer.z - localServer.z;
                    const dR = Math.sqrt(dRx * dRx + dRy * dRy + dRz * dRz);
                    const dS = Math.sqrt(dSx * dSx + dSy * dSy + dSz * dSz);
                    console.log(
                        `[NETDBG] t=${(now / 1000).toFixed(1)}s me=${dbg.localPlayerId} ` +
                        `lr=(${dbg.localRenderPos.x.toFixed(2)},${dbg.localRenderPos.y.toFixed(2)},${dbg.localRenderPos.z.toFixed(2)}) ` +
                        `ls=(${localServer.x.toFixed(2)},${localServer.y.toFixed(2)},${localServer.z.toFixed(2)}) | ` +
                        `them=${remoteId} rr=(${remoteRender.x.toFixed(2)},${remoteRender.y.toFixed(2)},${remoteRender.z.toFixed(2)}) ` +
                        `rs=(${remoteServer.x.toFixed(2)},${remoteServer.y.toFixed(2)},${remoteServer.z.toFixed(2)}) ` +
                        `dR=${dR.toFixed(2)} dS=${dS.toFixed(2)} ` +
                        `dZsign S=${dSz >= 0 ? '+' : '-'} R=${dRz >= 0 ? '+' : '-'} ` +
                        `dXsign S=${dSx >= 0 ? '+' : '-'} R=${dRx >= 0 ? '+' : '-'}`
                    );
                }
            }
        }

        // Get input state (only when pointer is locked)
        const preRoundActive = bridge.getState().preRoundActive;
        const rawMovement = input.getMovementInput();
        const pendingWeaponSlot = input.consumeWeaponSlotRequest();
        const pendingWeaponCycle = input.consumeWeaponCycleDirection();
        if (!preRoundActive) {
            if (pendingWeaponSlot === 0 || pendingWeaponSlot === 1) {
                client.equipWeaponSlot(pendingWeaponSlot);
            } else if (pendingWeaponCycle !== 0) {
                client.cycleWeaponSlot(pendingWeaponCycle);
            }
        }
        const movement = preRoundActive
            ? { forward: false, backward: false, left: false, right: false, jump: false, crouch: false, sprint: false, dodge: false }
            : rawMovement;
        const movementForController = {
            ...movement,
            left: movement.right,
            right: movement.left,
        };
        const isSprinting = !preRoundActive && (input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight'));
        const jumpPressed = !preRoundActive && input.isKeyDown('Space');
        const isSliding = !preRoundActive && input.isKeyDown('KeyC');
        const isAiming = !preRoundActive && input.isMouseButtonDown(2); // RMB
        // Detect shooting click (edge) or hold
        const isShootingDown = !preRoundActive && input.isMouseButtonDown(0); // LMB
        const isReloadPressed = !preRoundActive && input.isActionActive('reload');
        if (isShootingDown || isAiming || movement.forward || movement.backward || movement.left || movement.right || jumpPressed) {
            audio.unlock();
        }
        const aim = input.getAim();
        // Adjust if model forward axis isn't +Z. Use 0 for correct facing.
        const MODEL_FORWARD_YAW = 0;
        const serverYaw = -aim.yaw;
        const movementYaw = aim.yaw;
        const facingYaw = aim.yaw + MODEL_FORWARD_YAW;

        // Debug logs disabled to avoid frame drops.
        const snapshotInfo = bridge.getLastSnapshotInfo();
        if (!CLIENT_AUTHORITY && characterController) {
            const correction = bridge.getServerCorrectionTarget?.();
            if (correction) {
                const localPos = characterController.copyPosition(tmpLocalPos);
                const target = tmpCorrectionTarget.set(correction.x, correction.y, correction.z);
                const delta = tmpCorrectionDelta.subVectors(target, localPos);
                const dist = delta.length();
                if (dist > 0.01) {
                    const maxStep = 5.0 * deltaTime;
                    const step = Math.min(dist, maxStep);
                    delta.normalize().multiplyScalar(step);
                    characterController.applyPositionOffset(delta);
                } else {
                    characterController.reset(target);
                    bridge.clearServerCorrectionTarget?.();
                }
            }
        }

        // Send inputs to server at tick rate
        const elapsedMs = now - inputStartTime;
        const estimatedServerTick = snapshotInfo
            ? Math.floor(snapshotInfo.tick + (now - snapshotInfo.timeMs) / TICK_MS)
            : Math.floor(elapsedMs / TICK_MS);
        const currentTick = Math.max(estimatedServerTick, lastSentTick + 1);
        renderer.setMinimapLocalTeamId(liveState.localTeamId ?? 1);
        if (currentTick > lastSentTick && !liveState.isGameOver) {
            // Send inputs for each missing tick (use latest sampled input)
            for (let t = lastSentTick + 1; t <= currentTick; t++) {
                const rawInput = input.getInputFrame(
                    tick(t),
                    inputSequence++,
                    Date.now()
                );
                const inputFrame = {
                    ...rawInput,
                    movement: {
                        forward: preRoundActive ? false : rawInput.movement.forward,
                        backward: preRoundActive ? false : rawInput.movement.backward,
                        left: preRoundActive ? false : rawInput.movement.right,
                        right: preRoundActive ? false : rawInput.movement.left,
                        jump: preRoundActive ? false : rawInput.movement.jump,
                        crouch: preRoundActive ? false : rawInput.movement.crouch,
                        sprint: preRoundActive ? false : rawInput.movement.sprint,
                        dodge: preRoundActive ? false : rawInput.movement.dodge,
                    },
                    aim: { ...aim, yaw: serverYaw },
                    primaryFire: preRoundActive ? false : rawInput.primaryFire,
                    secondaryFire: preRoundActive ? false : rawInput.secondaryFire,
                    reload: preRoundActive ? false : rawInput.reload,
                    tactical: preRoundActive ? false : rawInput.tactical,
                    ultimate: preRoundActive ? false : rawInput.ultimate,
                    interact: preRoundActive ? false : rawInput.interact,
                };
                client.sendInput(inputFrame);
            }
            lastSentTick = currentTick;
        }

        const interpolationDelayTicks = Math.max(2, Number(bridge.getState().netInterpolationDelayTicks ?? 7));
        const interpolatedRemotes = bridge.getRemoteInterpolatedEntities(now, interpolationDelayTicks);

        // Update BVH character controller
        if (characterController) {
            characterController.setExternalSpeedMultiplier(hasLocalStampede ? 1.5 : 1);
            // Update controller with input
            const lockInput = liveState.isGameOver || liveState.preRoundActive;
            characterController.update(deltaTime, {
                forward: lockInput ? false : movementForController.forward,
                backward: lockInput ? false : movementForController.backward,
                left: lockInput ? false : movementForController.left,
                right: lockInput ? false : movementForController.right,
                jump: lockInput ? false : jumpPressed,
                sprint: lockInput ? false : isSprinting,
                slide: lockInput ? false : isSliding,
                aim: lockInput ? false : isAiming,
            }, movementYaw);
            characterController.modelEulerY = aim.yaw;

            // Client-side pushback vs remote players (disabled in client-authority mode).
            if (!CLIENT_AUTHORITY && interpolatedRemotes.size > 0) {
                const localPos = characterController.copyPosition(tmpLocalPos);
                const localVel = characterController.copyVelocity(tmpLocalVel);
                const playerRadius = 0.35;
                const minDist = playerRadius * 2.0;
                let pushX = 0;
                let pushZ = 0;

                for (const pose of interpolatedRemotes.values()) {
                    const dx = localPos.x - pose.position.x;
                    const dz = localPos.z - pose.position.z;
                    const distSq = dx * dx + dz * dz;
                    if (distSq > 1e-6 && distSq < minDist * minDist) {
                        const dist = Math.sqrt(distSq);
                        const overlap = minDist - dist;
                        const nx = dx / dist;
                        const nz = dz / dist;
                        pushX += nx * overlap;
                        pushZ += nz * overlap;
                    }
                }

                if (pushX !== 0 || pushZ !== 0) {
                    tmpPushOffset.set(pushX, 0, pushZ);
                    characterController.applyPositionOffset(tmpPushOffset);
                    // Remove velocity into the push direction to avoid immediate re-penetration.
                    const pushLen = Math.sqrt(pushX * pushX + pushZ * pushZ);
                    if (pushLen > 1e-6) {
                        const nx = pushX / pushLen;
                        const nz = pushZ / pushLen;
                        const dot = localVel.x * nx + localVel.z * nz;
                        if (dot < 0) {
                            localVel.x -= nx * dot;
                            localVel.z -= nz * dot;
                            characterController.setVelocity(localVel);
                        }
                    }
                }
            }

            // Get position for camera
            const pos = characterController.copyPosition(tmpLocalPos);
            playerPosition.x = pos.x;
            playerPosition.y = pos.y;
            playerPosition.z = pos.z;

            // Get velocity for animations
            const vel = characterController.copyVelocity(tmpLocalVel);
            playerVelocity.x = vel.x;
            playerVelocity.y = vel.y;
            playerVelocity.z = vel.z;

            // Update grounded state
            movementState.velocity.isGrounded = characterController.isGrounded;

            // Sync visual mesh to controller position
            const visualPos = characterController.copyVisualPosition(tmpVisualPos);
            const playerQuat = tmpPlayerQuat.setFromAxisAngle(upAxis, characterController.modelEulerY + MODEL_FORWARD_YAW);

            const renderPos = bridge.worldToRenderPosPublic(visualPos) ?? visualPos;
            renderer.updateEntityTransform(
                LOCAL_VISUAL_ID,
                renderPos,
                { x: playerQuat.x, y: playerQuat.y, z: playerQuat.z, w: playerQuat.w }
            );
            bridge.updateLocalRenderPos({ x: renderPos.x, y: renderPos.y, z: renderPos.z });

            // Update animations based on movement
            const isMoving = movement.forward || movement.backward || movement.left || movement.right;
            const isGrounded = characterController.isGrounded;
            const isControllerSliding = characterController.sliding;
            const verticalVel = vel.y;

            let targetAnim = 'idle';
            if (isControllerSliding) {
                targetAnim = 'Running Slide';
            } else if (!isGrounded && verticalVel > 1) {
                targetAnim = 'Jump start';
            } else if (!isGrounded && verticalVel < -1) {
                targetAnim = 'Jump Loop';
            } else if (isMoving) {
                targetAnim = isSprinting ? 'Sprint' : 'Walking female';
            }

            // Send BVH pose + animation state for P2P remote animation sync.
            if (now - lastPoseSentMs >= POSE_SEND_INTERVAL_MS && !liveState.isGameOver) {
                const pos = characterController.copyPosition(tmpLocalPos);
                const vel = characterController.copyVelocity(tmpLocalVel);
                client.sendPose({
                    position: { x: pos.x, y: pos.y, z: pos.z },
                    velocity: { x: vel.x, y: vel.y, z: vel.z },
                    rotation: { x: playerQuat.x, y: playerQuat.y, z: playerQuat.z, w: playerQuat.w },
                    isGrounded: characterController.isGrounded,
                    timeMs: now,
                    animation: {
                        locomotion: targetAnim,
                        isSliding: isControllerSliding,
                    },
                });
                lastPoseSentMs = now;
            }

            // Sync Aim State to Renderer
            renderer.setAiming(LOCAL_VISUAL_ID, isAiming || isShootingDown);
            if ((renderer as any)._lastAnim !== targetAnim) {
                renderer.setAnimation(LOCAL_VISUAL_ID, targetAnim);
                (renderer as any)._lastAnim = targetAnim;
            }

            // Movement audio (local only)
            if (!liveState.isGameOver && !liveState.isDead) {
                if (isMoving && isGrounded) {
                    if (isSprinting) {
                        audio.setWalking(false);
                        audio.setRunning(true);
                    } else {
                        audio.setRunning(false);
                        audio.setWalking(true);
                    }
                } else {
                    audio.stopAllMovement();
                }
            } else {
                audio.stopAllMovement();
            }

            // Jump audio (edge)
            const jumpEdge = jumpPressed && !lastJumpPressed && isGrounded;
            if (jumpEdge) {
                audio.playJump();
            }
            lastJumpPressed = jumpPressed;
            lastWasGrounded = isGrounded;
        }

        // If controller isn't ready, keep camera attached to last known local position.
        if (!characterController) {
            const visualPos = renderer.getEntityPosition(LOCAL_VISUAL_ID);
            if (visualPos) {
                playerPosition.x = visualPos.x;
                playerPosition.y = visualPos.y;
                playerPosition.z = visualPos.z;
            } else {
                playerPosition.x = lastLocalServerPos.x;
                playerPosition.y = lastLocalServerPos.y;
                playerPosition.z = lastLocalServerPos.z;
            }
        }

        // Update camera - hard lock to player each frame (Splatoon-style TPS)
        camera.update(aim.yaw, aim.pitch, playerPosition, deltaTime);
        {
            const distance = 2.7;
            const verticalOffset = 1.8;
            const shoulderOffset = 0.4;
            const cosPitch = Math.cos(aim.pitch);
            const dir = tmpCameraDir.set(
                Math.sin(aim.yaw) * cosPitch,
                Math.sin(aim.pitch),
                Math.cos(aim.yaw) * cosPitch
            );
            const shoulderX = Math.cos(aim.yaw) * shoulderOffset;
            const shoulderZ = -Math.sin(aim.yaw) * shoulderOffset;
            const camPos = tmpCameraPos.set(
                playerPosition.x - dir.x * distance + shoulderX,
                playerPosition.y - dir.y * distance + verticalOffset,
                playerPosition.z - dir.z * distance + shoulderZ
            );
            renderer.mainCamera.position.copy(camPos);
        renderer.mainCamera.lookAt(
            playerPosition.x,
            playerPosition.y + verticalOffset,
            playerPosition.z
        );

        renderer.setMinimapTarget(playerPosition, aim.yaw);
        }

        ensureLocalBuffAura(normalizedLocalDropBuff);
        if (localBuffAura) {
            const auraPulse = 0.55 + ((Math.sin(now * 0.009) + 1) * 0.2);
            localBuffAura.group.position.set(playerPosition.x, playerPosition.y + 0.08, playerPosition.z);
            localBuffAura.group.rotation.y += deltaTime * 1.6;
            localBuffAura.innerRing.scale.setScalar(0.92 + auraPulse * 0.24);
            localBuffAura.outerRing.scale.setScalar(0.94 + auraPulse * 0.36);
            localBuffAura.innerMat.opacity = 0.22 + auraPulse * 0.28;
            localBuffAura.outerMat.opacity = 0.08 + auraPulse * 0.16;
            localBuffAura.light.position.set(playerPosition.x, playerPosition.y + 1.1, playerPosition.z);
            localBuffAura.light.intensity = 0.8 + auraPulse * 1.2;
        }

        for (let i = pulseRingEffects.length - 1; i >= 0; i--) {
            const effect = pulseRingEffects[i]!;
            const elapsedMs = now - effect.startMs;
            const progress = Math.min(1, elapsedMs / effect.durationMs);
            if (progress >= 1) {
                renderer.mainScene.remove(effect.mesh);
                effect.mesh.geometry.dispose();
                effect.material.dispose();
                pulseRingEffects.splice(i, 1);
                continue;
            }
            const scale = 0.4 + (effect.maxScale * progress);
            effect.mesh.scale.setScalar(scale);
            effect.material.opacity = 0.8 * (1 - progress);
        }

        for (const [key, field] of toxinFields) {
            if (now >= field.endT) {
                clearToxinField(key);
                continue;
            }
            const toxinPulse = 0.5 + 0.5 * Math.sin(now * 0.007);
            field.ring.scale.setScalar(1 + toxinPulse * 0.08);
            field.discMat.opacity = 0.1 + toxinPulse * 0.12;
            field.ringMat.opacity = 0.28 + toxinPulse * 0.3;
            field.light.intensity = 1.3 + toxinPulse * 1.1;
        }

        // Update remote entities from buffered server poses (interpolation only)
        const nowMs = now;
        for (const [entityId, pose] of interpolatedRemotes) {
            if (deadEntities.has(entityId)) {
                renderer.setEntityRevealHighlight(entityId, false);
                continue;
            }
            ensureVisual(
                entityId,
                getDesiredTeamId(entityId),
                getDesiredCharacterModel(entityId),
                getDesiredWeaponModel(entityId),
            );

            renderer.updateEntityTransform(entityId, pose.position, {
                x: pose.rotation.x,
                y: pose.rotation.y,
                z: pose.rotation.z,
                w: pose.rotation.w,
            });
            const entityTeamId = getDesiredTeamId(entityId);
            const isEnemyReveal = hasLocalSkyRecon && entityTeamId !== (liveState.localTeamId ?? 1);
            renderer.setEntityRevealHighlight(entityId, isEnemyReveal, 0x55ddff);

            let state = remoteAnimStates.get(entityId);
            if (!state) {
                const createdState: {
                    lastPos: { x: number; y: number; z: number };
                    lastUpdateMs: number;
                    isGrounded?: boolean;
                } = {
                    lastPos: { x: pose.position.x, y: pose.position.y, z: pose.position.z },
                    lastUpdateMs: nowMs,
                };
                if (pose.isGrounded !== undefined) {
                    createdState.isGrounded = pose.isGrounded;
                }
                remoteAnimStates.set(entityId, createdState);
                state = createdState;
            }

            const dx = pose.position.x - state.lastPos.x;
            const dy = pose.position.y - state.lastPos.y;
            const dz = pose.position.z - state.lastPos.z;
            const speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / Math.max(deltaTime, 0.001);
            const stale = nowMs - state.lastUpdateMs > 200;
            state.lastPos.x = pose.position.x;
            state.lastPos.y = pose.position.y;
            state.lastPos.z = pose.position.z;
            state.lastUpdateMs = nowMs;
            state.isGrounded = pose.isGrounded ?? state.isGrounded;

            const isGrounded = state.isGrounded ?? true;
            let targetAnim = 'idle';
            if (!stale) {
                if (!isGrounded) {
                    targetAnim = 'Jump Loop';
                } else if (speed > 0.2) {
                    targetAnim = speed > 6 ? 'Sprint' : 'Walking female';
                }
            }
            const hint = remoteAnimHints.get(entityId);
            if (hint && nowMs - hint.atMs <= 250) {
                targetAnim = hint.isSliding ? 'Running Slide' : hint.locomotion;
            }

            renderer.setAnimation(entityId, targetAnim);
        }

        // --- CHARACTER ROTATION ---
        // Option 2: Character always faces camera forward direction (Splatoon-style)
        // This provides stable, precise control without jitter.
        // Character always faces aim direction (even without ADS)
        // Don't override local rotation here; updateEntityTransform already applied the correct quaternion.


        // Update aim state in UI
        if (isAiming !== lastUiAiming) {
            bridge.updateState({ isAiming });
            lastUiAiming = isAiming;
        }
        // Shooting Logic
        // Fire if aiming + shooting held + cooldown ready
        const CURRENT_FIRE_RATE = SMG_STATS.fireRate * 1000;
        const stateNow = bridge.getState();
        const isReloading = stateNow.isReloading;
        const isDead = stateNow.isDead;
        const isGameOver = stateNow.isGameOver;

        if (isShootingDown && !isReloading && !isReloadPressed && !isDead && !isGameOver && (now - lastShotTime > CURRENT_FIRE_RATE)) {
            const muzzle = renderer.getMuzzleTransform(LOCAL_VISUAL_ID);
            const cameraPos = tmpCameraPos;
            renderer.mainCamera.getWorldPosition(cameraPos);
            const startPos = muzzle?.position ?? cameraPos;
            if (startPos) {
                // --- TPS AIMING LOGIC ---
                // 1. Raycast from camera center to find what we are looking at
                // Screen center is (0, 0) in normalized device coordinates
                const raycaster = shotRaycaster;
                raycaster.setFromCamera(screenCenter, renderer.mainCamera);
                raycaster.far = 1000;

                const aimPoint = tmpAimPoint;
                aimPoint.set(0, 0, 0);
                let hasAimHit = false;

                // Check Map Collision for Aiming
                if (bvhCollider && bvhCollider.geometry.boundsTree) {
                    const hit = bvhCollider.geometry.boundsTree.raycastFirst(raycaster.ray, THREE.DoubleSide);
                    if (hit) {
                        aimPoint.copy(hit.point);
                        hasAimHit = true;
                    }
                }

                // If no map hit, aim into distance
                if (!hasAimHit) {
                    aimPoint.copy(raycaster.ray.origin).add(raycaster.ray.direction.multiplyScalar(100));
                }

                // 2. Calculate shoot direction from nozzle to aim point
                const shootDirection = tmpShootDir.subVectors(aimPoint, startPos).normalize();

                // 3. Perform actual shot raycast from nozzle
                const hitPoint = tmpHitPoint.copy(startPos).addScaledVector(shootDirection, 100);
                const hitNormal = tmpHitNormal.set(0, 1, 0);
                let hasHit = false;

                if (bvhCollider && bvhCollider.geometry.boundsTree) {
                    const ray = tmpRay.set(startPos, shootDirection);
                    const hit = bvhCollider.geometry.boundsTree.raycastFirst(ray, THREE.DoubleSide);

                    if (hit) {
                        hitPoint.copy(hit.point);
                        if (hit.face) hitNormal.copy(hit.face.normal);
                        hasHit = true;
                    }
                }

                // Spawn visuals
                renderer.createTracer(startPos, hitPoint);
                renderer.showMuzzleFlash(startPos);
                if (hasHit) {
                    renderer.createHitEffect(hitPoint, hitNormal);
                }
                audio.playShoot();

                // Send shot to server (authoritative damage)
                const serverSelfPos = bridge.getServerSelfPos?.();
                const shotOrigin = serverSelfPos
                    ? tmpShotOrigin.set(serverSelfPos.x, serverSelfPos.y + 1.2, serverSelfPos.z)
                    : startPos;
                client.sendShoot({
                    shotId: `${now}-${Math.random()}`,
                    origin: { x: shotOrigin.x, y: shotOrigin.y, z: shotOrigin.z },
                    dir: { x: shootDirection.x, y: shootDirection.y, z: shootDirection.z },
                    time: now,
                    weaponId: stateNow.selectedWeaponModelId ?? 'smg1',
                });

                // Ensure aim pose plays while shooting even without ADS
                renderer.playOverlayAnimation(LOCAL_VISUAL_ID, 'Pistol Walk', 120, 0.85, { loop: false, clamp: false });

                lastShotTime = now;
            } else {
                if (Math.random() < 0.01) console.warn('Muzzle not found!');
            }
        }

        // Update all animation mixers
        renderer.updateAnimations(deltaTime);

        // Render frame
        renderer.render();
    }

    animate();
    console.log('Render loop started');

    // Store references for cleanup
    (window as any).__game = {
        renderer,
        input,
        camera,
        bridge,
    };
}

// Run
main().catch(console.error);
