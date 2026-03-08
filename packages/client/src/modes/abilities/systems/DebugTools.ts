import type { EntityId } from '@snapshot/shared';
import type { Scene } from 'three';
import { ABILITIES, AbilityKind, type AbilityKey } from '../registry/abilities.registry';
import type { InputHandler } from '../../../game/core/InputHandler';
import { AbilityRuntime } from './AbilityRuntime';
import { AbilitiesDevOverlay } from './AbilitiesDevOverlay';
import { AbilitiesEventBus } from './EventBus';
import { AbilityTestMenu } from './AbilityTestMenu';
import { VfxBrowserMenu } from './VfxBrowserMenu';
import { VfxSystem } from '../game/vfx/VfxSystem';

export class DebugTools {
    private tacticalHeld = false;
    private ultimateHeld = false;
    private readonly overlay: AbilitiesDevOverlay;
    private readonly testMenu: AbilityTestMenu;
    private readonly vfxBrowser: VfxBrowserMenu;

    constructor(
        private readonly input: InputHandler,
        private readonly abilityRuntime: AbilityRuntime,
        private readonly eventBus: AbilitiesEventBus,
        private readonly vfxSystem: VfxSystem,
        scene: Scene,
        private readonly localCasterId: EntityId
    ) {
        this.overlay = new AbilitiesDevOverlay(
            abilityRuntime,
            eventBus,
            localCasterId,
            (cmd) => this.executeCommand(cmd)
        );
        this.testMenu = new AbilityTestMenu(abilityRuntime, eventBus, localCasterId);
        this.vfxBrowser = new VfxBrowserMenu(abilityRuntime, vfxSystem, scene, localCasterId);
        if (typeof window !== 'undefined') {
            (window as any).abilitiesDevCommand = (cmd: string): void => {
                this.executeCommand(cmd);
            };
        }
        this.eventBus.emit('DEBUG_MESSAGE', {
            message: 'Abilities debug ready: F1 test menu, F2 VFX browser, F6 tactical, F7 ultimate, commands via /... or window.abilitiesDevCommand(cmd).',
        });
    }

    update(): void {
        const tactical = this.input.isKeyDown('F6');
        if (tactical && !this.tacticalHeld) {
            const ok = this.abilityRuntime.debugForceCast(this.localCasterId, 'SEISMIC_SLAM');
            this.eventBus.emit('DEBUG_MESSAGE', {
                message: ok
                    ? 'Abilities debug: Seismic Slam force-cast'
                    : 'Abilities debug: Seismic Slam blocked',
            });
        }
        this.tacticalHeld = tactical;

        const ultimate = this.input.isKeyDown('F7');
        if (ultimate && !this.ultimateHeld) {
            const ok = this.abilityRuntime.debugForceCast(this.localCasterId, 'IRON_FORTRESS');
            this.eventBus.emit('DEBUG_MESSAGE', {
                message: ok
                    ? 'Abilities debug: Iron Fortress force-cast'
                    : 'Abilities debug: Iron Fortress blocked',
            });
        }
        this.ultimateHeld = ultimate;

        this.testMenu.update(this.input.isKeyDown('F1'));
        this.vfxBrowser.update(this.input.isKeyDown('F2'));
        this.overlay.update(typeof performance !== 'undefined' ? performance.now() : Date.now());
    }

    dispose(): void {
        this.testMenu.dispose();
        this.vfxBrowser.dispose();
        this.overlay.dispose();
    }

    private executeCommand(raw: string): void {
        const cmd = raw.trim();
        if (!cmd.startsWith('/')) {
            this.eventBus.emit('DEBUG_MESSAGE', { message: `Abilities debug: expected slash command, got "${cmd}"` });
            return;
        }
        const parts = cmd.slice(1).split(/\s+/g);
        if (parts.length < 3) {
            this.eventBus.emit('DEBUG_MESSAGE', { message: `Abilities debug: invalid command "${cmd}"` });
            return;
        }
        const scope = parts[0] ?? '';
        const action = parts[1] ?? '';
        const keyRaw = parts[2] ?? '';
        const key = keyRaw as AbilityKey;

        if (scope === 'ability' && action === 'cast') {
            if (!(key in ABILITIES)) {
                this.eventBus.emit('DEBUG_MESSAGE', { message: `Abilities debug: unknown AbilityKey "${keyRaw}"` });
                return;
            }
            const ok = this.abilityRuntime.debugForceCast(this.localCasterId, key);
            this.eventBus.emit('DEBUG_MESSAGE', {
                message: ok
                    ? `Abilities debug: force-cast ${key}`
                    : `Abilities debug: force-cast failed ${key}`,
            });
            return;
        }

        if (scope === 'drop' && action === 'activate') {
            if (!(key in ABILITIES)) {
                this.eventBus.emit('DEBUG_MESSAGE', { message: `Abilities debug: unknown DropKey "${keyRaw}"` });
                return;
            }
            if (ABILITIES[key].kind !== AbilityKind.DROP) {
                this.eventBus.emit('DEBUG_MESSAGE', { message: `Abilities debug: ${key} is not a drop` });
                return;
            }
            const ok = this.abilityRuntime.debugForceCast(this.localCasterId, key);
            this.eventBus.emit('DEBUG_MESSAGE', {
                message: ok
                    ? `Abilities debug: activated drop ${key}`
                    : `Abilities debug: drop activation failed ${key}`,
            });
            return;
        }

        if ((scope === 'vfx' || scope === 'preset') && action === 'play') {
            const vfxKey = keyRaw;
            const pos = this.abilityRuntime.getPlayerPosition(this.localCasterId) ?? { x: 0, y: 0, z: 0 };
            this.vfxSystem.playOneShot(vfxKey, pos);
            this.eventBus.emit('DEBUG_MESSAGE', { message: `Abilities debug: played preset ${vfxKey} at player position` });
            return;
        }

        this.eventBus.emit('DEBUG_MESSAGE', { message: `Abilities debug: unknown command "${cmd}"` });
    }
}
