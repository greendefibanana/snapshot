import type { EntityId } from '@snapshot/shared';
import { ABILITIES, AbilityKind, type AbilityKey } from '../registry/abilities.registry';
import type { AbilityRuntime } from './AbilityRuntime';
import type { AbilitiesEventBus } from './EventBus';

export class AbilityTestMenu {
    private readonly button: HTMLButtonElement | null;
    private readonly panel: HTMLDivElement | null;
    private readonly coreList: HTMLDivElement | null;
    private readonly dropList: HTMLDivElement | null;
    private visible = false;
    private f1Held = false;

    constructor(
        private readonly runtime: AbilityRuntime,
        private readonly eventBus: AbilitiesEventBus,
        private readonly localCasterId: EntityId
    ) {
        if (typeof document === 'undefined') {
            this.button = null;
            this.panel = null;
            this.coreList = null;
            this.dropList = null;
            return;
        }

        const button = document.createElement('button');
        button.textContent = 'Ability Test Menu';
        button.style.position = 'fixed';
        button.style.left = '12px';
        button.style.bottom = '12px';
        button.style.zIndex = '10000';
        button.style.padding = '8px 12px';
        button.style.border = '1px solid rgba(255,255,255,0.35)';
        button.style.borderRadius = '6px';
        button.style.background = 'rgba(0,0,0,0.55)';
        button.style.color = '#fff';
        button.style.cursor = 'pointer';
        button.addEventListener('click', () => this.setVisible(!this.visible));
        document.body.appendChild(button);
        this.button = button;

        const panel = document.createElement('div');
        panel.style.position = 'fixed';
        panel.style.left = '12px';
        panel.style.top = '60px';
        panel.style.zIndex = '10000';
        panel.style.width = '560px';
        panel.style.maxHeight = '75vh';
        panel.style.overflow = 'hidden';
        panel.style.border = '1px solid rgba(120,180,255,0.5)';
        panel.style.borderRadius = '10px';
        panel.style.background = 'rgba(8,12,20,0.92)';
        panel.style.color = '#e9f4ff';
        panel.style.fontFamily = 'Consolas, Menlo, Monaco, monospace';
        panel.style.display = 'none';

        const header = document.createElement('div');
        header.style.padding = '10px 12px';
        header.style.borderBottom = '1px solid rgba(120,180,255,0.3)';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.innerHTML = '<strong>Ability Test Menu</strong><span>F1 toggle</span>';
        panel.appendChild(header);

        const content = document.createElement('div');
        content.style.display = 'grid';
        content.style.gridTemplateColumns = '1fr 1fr';
        content.style.gap = '10px';
        content.style.padding = '10px';
        panel.appendChild(content);

        const coreWrap = document.createElement('div');
        coreWrap.style.border = '1px solid rgba(120,180,255,0.25)';
        coreWrap.style.borderRadius = '8px';
        coreWrap.style.padding = '8px';
        coreWrap.style.maxHeight = '58vh';
        coreWrap.style.overflow = 'auto';
        const coreTitle = document.createElement('div');
        coreTitle.textContent = 'Core Abilities';
        coreTitle.style.fontWeight = '700';
        coreTitle.style.marginBottom = '8px';
        coreWrap.appendChild(coreTitle);
        const coreList = document.createElement('div');
        coreWrap.appendChild(coreList);
        content.appendChild(coreWrap);
        this.coreList = coreList;

        const dropWrap = document.createElement('div');
        dropWrap.style.border = '1px solid rgba(120,180,255,0.25)';
        dropWrap.style.borderRadius = '8px';
        dropWrap.style.padding = '8px';
        dropWrap.style.maxHeight = '58vh';
        dropWrap.style.overflow = 'auto';
        const dropTitle = document.createElement('div');
        dropTitle.textContent = 'Drop Buffs';
        dropTitle.style.fontWeight = '700';
        dropTitle.style.marginBottom = '8px';
        dropWrap.appendChild(dropTitle);
        const dropList = document.createElement('div');
        dropWrap.appendChild(dropList);
        content.appendChild(dropWrap);
        this.dropList = dropList;

        document.body.appendChild(panel);
        this.panel = panel;
        this.renderLists();
    }

    update(isF1Down: boolean): void {
        if (!this.panel) return;
        if (isF1Down && !this.f1Held) this.setVisible(!this.visible);
        this.f1Held = isF1Down;
    }

    dispose(): void {
        if (this.panel?.parentElement) this.panel.parentElement.removeChild(this.panel);
        if (this.button?.parentElement) this.button.parentElement.removeChild(this.button);
    }

    private setVisible(visible: boolean): void {
        this.visible = visible;
        if (!this.panel) return;
        this.panel.style.display = visible ? 'block' : 'none';
        if (visible) this.renderLists();
    }

    private renderLists(): void {
        if (!this.coreList || !this.dropList) return;
        this.coreList.innerHTML = '';
        this.dropList.innerHTML = '';

        const keys = (Object.keys(ABILITIES) as AbilityKey[]).sort((a, b) => a.localeCompare(b));
        for (const key of keys) {
            const def = ABILITIES[key];
            if (def.kind === AbilityKind.DROP) {
                this.dropList.appendChild(this.buildRow(key, 'Activate'));
            } else if (def.kind === AbilityKind.PASSIVE) {
                const active = this.runtime.getPlayerPassive(this.localCasterId) === key;
                this.coreList.appendChild(this.buildRow(key, active ? 'Clear Passive' : 'Apply Passive'));
            } else {
                this.coreList.appendChild(this.buildRow(key, 'Cast'));
            }
        }
    }

    private buildRow(key: AbilityKey, buttonText: string): HTMLDivElement {
        const def = ABILITIES[key];
        const row = document.createElement('div');
        row.style.display = 'grid';
        row.style.gridTemplateColumns = '1fr auto';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        row.style.padding = '6px 0';
        row.style.borderBottom = '1px dashed rgba(120,180,255,0.18)';

        const label = document.createElement('div');
        label.innerHTML = `<div style="font-weight:700">${key}</div><div style="opacity:.8">${def.name}</div>`;
        row.appendChild(label);

        const btn = document.createElement('button');
        btn.textContent = buttonText;
        btn.style.padding = '4px 8px';
        btn.style.border = '1px solid rgba(255,255,255,0.3)';
        btn.style.borderRadius = '6px';
        btn.style.background = 'rgba(16,28,44,0.95)';
        btn.style.color = '#fff';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', () => this.onAction(key));
        row.appendChild(btn);

        return row;
    }

    private onAction(key: AbilityKey): void {
        const def = ABILITIES[key];
        if (def.kind === AbilityKind.PASSIVE) {
            const current = this.runtime.getPlayerPassive(this.localCasterId);
            this.runtime.setPlayerPassive(this.localCasterId, current === key ? null : key);
            this.eventBus.emit('DEBUG_MESSAGE', {
                message: `Ability Test Menu: passive ${current === key ? 'cleared' : 'applied'} ${key}`,
            });
            this.renderLists();
            return;
        }

        const ok = this.runtime.debugForceCast(this.localCasterId, key);
        this.eventBus.emit('DEBUG_MESSAGE', {
            message: ok
                ? `Ability Test Menu: executed ${key}`
                : `Ability Test Menu: failed ${key}`,
        });
    }
}
