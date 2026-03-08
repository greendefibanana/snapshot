import type { GameBridge } from '../../bridge/GameBridge';
import type { GameRenderer } from '../../game/core/GameRenderer';
import { Species, type EntityId, type Quaternion, type Vector3 } from '@snapshot/shared';
import type { AbilityRuntime } from './systems/AbilityRuntime';

export const ABILITIES_MODE_ID = 'abilities';
export const ABILITIES_MODE_LABEL = 'Abilities (Sandbox)';

type SandboxDummy = {
    id: EntityId;
    teamId: 1 | 2;
    position: Vector3;
    yawRadians: number;
};

const ABILITIES_MAP_ASSET_PATH = '/models/Map2.glb';
const ABILITIES_LOCAL_SPAWN: Vector3 = { x: 0, y: 2, z: 8 };

const ABILITIES_DUMMIES: readonly SandboxDummy[] = [
    {
        id: -210 as EntityId,
        teamId: 1,
        position: { x: -4, y: 2, z: -2 },
        yawRadians: Math.PI * 0.15,
    },
    {
        id: -211 as EntityId,
        teamId: 2,
        position: { x: 4, y: 2, z: -10 },
        yawRadians: Math.PI,
    },
    {
        id: -212 as EntityId,
        teamId: 2,
        position: { x: -2, y: 2, z: -14 },
        yawRadians: Math.PI,
    },
];

export function getAbilitiesSandboxTeam(entityId: EntityId): 1 | 2 | null {
    if (Number(entityId) === Number(ABILITIES_DUMMIES[0]?.id)) return 1;
    if (ABILITIES_DUMMIES.some((d) => Number(d.id) === Number(entityId) && d.teamId === 2)) return 2;
    return null;
}

function yawToRotation(yawRadians: number): Quaternion {
    const half = yawRadians * 0.5;
    return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

export function getAbilitiesMapAssetPath(): string {
    return ABILITIES_MAP_ASSET_PATH;
}

export function getAbilitiesSpawnPosition(): Vector3 {
    return { ...ABILITIES_LOCAL_SPAWN };
}

export function setupAbilitiesSandbox(renderer: GameRenderer, bridge: GameBridge, runtime?: AbilityRuntime): void {
    for (const dummy of ABILITIES_DUMMIES) {
        if (!renderer.hasEntityVisual(dummy.id)) {
            renderer.createPlayerVisual(dummy.id, Species.Urshari, dummy.teamId, 'assasin');
            renderer.setAnimation(dummy.id, 'idle');
        }
        renderer.updateEntityTransform(dummy.id, dummy.position, yawToRotation(dummy.yawRadians));
        runtime?.upsertPlayer(dummy.id, dummy.teamId, dummy.position, { x: Math.sin(dummy.yawRadians), y: 0, z: Math.cos(dummy.yawRadians) });
    }

    bridge.notifyGameMessage(
        'Abilities sandbox ready. F1 Ability Test Menu, F2 VFX Browser, F6/F7 force-cast. Commands: /ability cast <AbilityKey>, /drop activate <DropKey>, /vfx play <VfxKey>, /preset play <PresetKey>.',
        'info'
    );
}
