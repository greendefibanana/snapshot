import { promises as fs } from 'node:fs';
import path from 'node:path';

export class PlayerNameStore {
    private filePath: string;
    private names: Map<string, string> = new Map();
    private flushTimer: NodeJS.Timeout | null = null;

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    async load(): Promise<void> {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            if (!parsed || typeof parsed !== 'object') return;
            for (const [key, value] of Object.entries(parsed)) {
                if (typeof key !== 'string') continue;
                if (typeof value !== 'string') continue;
                const trimmed = value.trim();
                if (!trimmed) continue;
                this.names.set(key, trimmed);
            }
        } catch (error: any) {
            if (error?.code !== 'ENOENT') {
                console.warn('PlayerNameStore: failed to load', error);
            }
        }
    }

    get(key: string): string | null {
        return this.names.get(key) ?? null;
    }

    set(key: string, value: string): void {
        const trimmed = value.trim();
        if (!trimmed) return;
        this.names.set(key, trimmed);
        this.scheduleFlush();
    }

    async flush(): Promise<void> {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        try {
            await fs.mkdir(path.dirname(this.filePath), { recursive: true });
            const output: Record<string, string> = {};
            for (const [key, value] of this.names) {
                output[key] = value;
            }
            await fs.writeFile(this.filePath, JSON.stringify(output, null, 2), 'utf8');
        } catch (error) {
            console.warn('PlayerNameStore: failed to persist', error);
        }
    }

    private scheduleFlush(): void {
        if (this.flushTimer) return;
        this.flushTimer = setTimeout(() => {
            void this.flush();
        }, 500);
    }
}
