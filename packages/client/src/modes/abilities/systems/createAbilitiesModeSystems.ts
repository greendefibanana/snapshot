import * as THREE from 'three';
import type { EntityId } from '@snapshot/shared';
import type { InputHandler } from '../../../game/core/InputHandler';
import { AbilityRuntime } from './AbilityRuntime';
import { DebugTools } from './DebugTools';
import { AbilitiesEventBus } from './EventBus';
import { AbilityVfxBindings } from './AbilityVfxBindings';
import { VfxSystem } from '../game/vfx/VfxSystem';

export type AbilitiesModeSystems = {
    abilityRuntime: AbilityRuntime;
    vfxSystem: VfxSystem;
    vfxBindings: AbilityVfxBindings;
    eventBus: AbilitiesEventBus;
    debug: DebugTools;
};

export function createAbilitiesModeSystems(
    world: unknown,
    scene: THREE.Scene,
    input: InputHandler
): AbilitiesModeSystems {
    const localCasterId = (typeof world === 'object' && world && 'localCasterId' in world
        ? (world as { localCasterId?: EntityId }).localCasterId
        : undefined) ?? (-100 as EntityId);
    const eventBus = new AbilitiesEventBus();
    const abilityRuntime = new AbilityRuntime(eventBus);
    abilityRuntime.registerPlayer(localCasterId, 1, { x: 0, y: 0, z: 0 });
    abilityRuntime.setPlayerPassive(localCasterId, 'BULWARK_PHYSIOLOGY');
    abilityRuntime.setPlayerTeam(localCasterId, 1);
    const vfxSystem = new VfxSystem(scene, eventBus);
    const vfxBindings = new AbilityVfxBindings(eventBus, abilityRuntime, vfxSystem, scene);
    const debug = new DebugTools(input, abilityRuntime, eventBus, vfxSystem, scene, localCasterId);
    void vfxSystem.init();
    void vfxBindings.init();

    return {
        abilityRuntime,
        vfxSystem,
        vfxBindings,
        eventBus,
        debug,
    };
}
