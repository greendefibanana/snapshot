import * as THREE from 'three';
import type { EntityId } from '@snapshot/shared';
import { collectAbilityVfxPrefabKeys } from './AbilityVfxMap';
import type { AbilityRuntime } from './AbilityRuntime';
import type { VfxSystem } from '../game/vfx/VfxSystem';

export class VfxBrowserMenu {
    private readonly root: HTMLDivElement | null;
    private visible = false;
    private f2Held = false;
    private attachments: Array<{ handle: string; anchor: THREE.Object3D }> = [];

    constructor(
        private readonly runtime: AbilityRuntime,
        private readonly vfx: VfxSystem,
        private readonly scene: THREE.Scene,
        private readonly localCasterId: EntityId
    ) {
        if (typeof document === 'undefined') {
            this.root = null;
            return;
        }
        const root = document.createElement('div');
        root.style.position = 'fixed';
        root.style.left = '590px';
        root.style.top = '60px';
        root.style.zIndex = '10000';
        root.style.width = '360px';
        root.style.maxHeight = '72vh';
        root.style.overflow = 'auto';
        root.style.padding = '10px';
        root.style.background = 'rgba(10,16,24,0.92)';
        root.style.border = '1px solid rgba(170,210,255,0.35)';
        root.style.borderRadius = '10px';
        root.style.color = '#e7f2ff';
        root.style.fontFamily = 'Consolas, Menlo, Monaco, monospace';
        root.style.display = 'none';
        document.body.appendChild(root);
        this.root = root;
        this.render();
    }

    update(isF2Down: boolean): void {
        if (!this.root) return;
        if (isF2Down && !this.f2Held) this.setVisible(!this.visible);
        this.f2Held = isF2Down;
        const pos = this.runtime.getPlayerPosition(this.localCasterId);
        if (pos) {
            for (const a of this.attachments) {
                a.anchor.position.set(pos.x, pos.y + 1.1, pos.z);
            }
        }
    }

    dispose(): void {
        this.clearAttachments();
        if (this.root?.parentElement) this.root.parentElement.removeChild(this.root);
    }

    private setVisible(visible: boolean): void {
        this.visible = visible;
        if (!this.root) return;
        this.root.style.display = visible ? 'block' : 'none';
        if (visible) this.render();
    }

    private render(): void {
        if (!this.root) return;
        this.root.innerHTML = '';

        const title = document.createElement('div');
        title.innerHTML = '<strong>VFX Browser</strong> <span style="opacity:.7">(F2)</span>';
        title.style.marginBottom = '8px';
        this.root.appendChild(title);

        const disableRow = document.createElement('label');
        disableRow.style.display = 'flex';
        disableRow.style.gap = '8px';
        disableRow.style.alignItems = 'center';
        disableRow.style.marginBottom = '10px';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = !this.vfx.isEnabled();
        check.addEventListener('change', () => {
            this.vfx.setEnabled(!check.checked);
        });
        const label = document.createElement('span');
        label.textContent = 'Disable all VFX';
        disableRow.appendChild(check);
        disableRow.appendChild(label);
        this.root.appendChild(disableRow);

        const keys = collectAbilityVfxPrefabKeys();
        for (const key of keys) {
            const row = document.createElement('div');
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '1fr auto auto';
            row.style.gap = '6px';
            row.style.alignItems = 'center';
            row.style.padding = '4px 0';
            row.style.borderBottom = '1px dashed rgba(170,210,255,0.15)';

            const name = document.createElement('div');
            name.textContent = key;
            row.appendChild(name);

            const play = document.createElement('button');
            play.textContent = 'Play at crosshair';
            play.style.fontSize = '11px';
            play.addEventListener('click', () => {
                const p = this.crosshairPosition();
                this.vfx.playOneShot(key, p);
            });
            row.appendChild(play);

            const attach = document.createElement('button');
            attach.textContent = 'Attach to player';
            attach.style.fontSize = '11px';
            attach.addEventListener('click', () => this.attachToPlayer(key));
            row.appendChild(attach);

            this.root!.appendChild(row);
        }
    }

    private crosshairPosition(): { x: number; y: number; z: number } {
        const p = this.runtime.getPlayerPosition(this.localCasterId) ?? { x: 0, y: 0, z: 0 };
        const f = this.runtime.getPlayerForward(this.localCasterId) ?? { x: 0, y: 0, z: 1 };
        return {
            x: p.x + f.x * 4,
            y: p.y + 1.2 + f.y * 4,
            z: p.z + f.z * 4,
        };
    }

    private attachToPlayer(key: string): void {
        const pos = this.runtime.getPlayerPosition(this.localCasterId) ?? { x: 0, y: 0, z: 0 };
        const anchor = new THREE.Object3D();
        anchor.position.set(pos.x, pos.y + 1.1, pos.z);
        this.scene.add(anchor);
        const handle = this.vfx.startLoop(key, anchor);
        this.attachments.push({ handle, anchor });
    }

    private clearAttachments(): void {
        for (const a of this.attachments) {
            this.vfx.stop(a.handle);
            this.scene.remove(a.anchor);
        }
        this.attachments = [];
    }
}
