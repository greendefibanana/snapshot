import type { EntityId } from '@snapshot/shared';
import type { AbilityRuntime } from './AbilityRuntime';
import type { AbilitiesEventBus } from './EventBus';
import type { AbilitiesGameEventType } from './GameEvents';

type CommandHandler = (command: string) => void;

export class AbilitiesDevOverlay {
    private readonly root: HTMLDivElement | null;
    private readonly text: HTMLPreElement | null;
    private readonly events: string[] = [];
    private readonly unsubs: Array<() => void> = [];
    private lastRenderAt = 0;

    constructor(
        private readonly runtime: AbilityRuntime,
        private readonly eventBus: AbilitiesEventBus,
        private readonly localCasterId: EntityId,
        onCommand: CommandHandler
    ) {
        if (typeof document === 'undefined') {
            this.root = null;
            this.text = null;
            return;
        }

        const root = document.createElement('div');
        root.style.position = 'fixed';
        root.style.top = '12px';
        root.style.right = '12px';
        root.style.zIndex = '9999';
        root.style.width = '420px';
        root.style.maxHeight = '48vh';
        root.style.overflow = 'auto';
        root.style.padding = '10px';
        root.style.background = 'rgba(8,12,20,0.8)';
        root.style.border = '1px solid rgba(120,180,255,0.35)';
        root.style.borderRadius = '8px';
        root.style.backdropFilter = 'blur(4px)';
        root.style.fontFamily = 'Consolas, Menlo, Monaco, monospace';
        root.style.fontSize = '12px';
        root.style.color = '#d8ecff';

        const text = document.createElement('pre');
        text.style.margin = '0';
        text.style.whiteSpace = 'pre-wrap';
        text.style.lineHeight = '1.35';
        root.appendChild(text);

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '/ability cast SEISMIC_SLAM';
        input.style.width = '100%';
        input.style.marginTop = '8px';
        input.style.padding = '6px 8px';
        input.style.border = '1px solid rgba(120,180,255,0.35)';
        input.style.background = 'rgba(0,0,0,0.35)';
        input.style.color = '#d8ecff';
        input.style.outline = 'none';
        input.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Enter') return;
            const value = input.value.trim();
            if (!value) return;
            onCommand(value);
            input.value = '';
            ev.preventDefault();
            ev.stopPropagation();
        });
        root.appendChild(input);

        document.body.appendChild(root);
        this.root = root;
        this.text = text;

        this.bindEventLog();
    }

    update(nowMs: number): void {
        if (!this.text) return;
        if (nowMs - this.lastRenderAt < 100) return;
        this.lastRenderAt = nowMs;

        const teamId = this.runtime.getPlayerTeam(this.localCasterId);
        const tactical = this.runtime.getTacticalCharge(this.localCasterId).toFixed(0);
        const ultimate = this.runtime.getUltimateCharge(this.localCasterId).toFixed(0);
        const cds = this.runtime.getPlayerTacticalCooldowns(this.localCasterId)
            .filter((c) => c.remainingSec > 0)
            .map((c) => `${c.abilityKey}:${c.remainingSec.toFixed(1)}s`)
            .join(', ');
        const buffs = teamId === null
            ? 'none'
            : this.runtime.getTeamActiveBuffs(teamId)
                .map((b) => `${b.kind}:${b.abilityKey}${b.remainingSec === null ? '' : `(${b.remainingSec.toFixed(1)}s)`}`)
                .join(', ') || 'none';

        this.text.textContent = [
            'Abilities Dev Overlay',
            `tacticalCharge=${tactical}  ultimateCharge=${ultimate}`,
            `cooldowns=${cds || 'none'}`,
            `activeBuffs=${buffs}`,
            'events:',
            ...this.events,
        ].join('\n');
    }

    dispose(): void {
        for (const off of this.unsubs) off();
        this.unsubs.length = 0;
        if (this.root?.parentElement) this.root.parentElement.removeChild(this.root);
    }

    private bindEventLog(): void {
        const push = (line: string): void => {
            this.events.push(line);
            if (this.events.length > 10) this.events.shift();
        };
        const types: AbilitiesGameEventType[] = [
            'ABILITY_CAST',
            'ABILITY_HIT',
            'FORGE_LINK_SHARED_DAMAGE',
            'BUFF_START',
            'BUFF_END',
            'DEPLOYABLE_SPAWN',
            'DEPLOYABLE_DESPAWN',
        ];
        for (const t of types) {
            this.unsubs.push(this.eventBus.on(t as any, (payload: any) => {
                const short = JSON.stringify(payload);
                push(`${t} ${short.length > 120 ? `${short.slice(0, 117)}...` : short}`);
            }));
        }
    }
}
