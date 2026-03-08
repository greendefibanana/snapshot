import type { AbilitiesGameEventMap, AbilitiesGameEventType } from './GameEvents';

type Listener<T extends AbilitiesGameEventType> = (payload: AbilitiesGameEventMap[T]) => void;

export class AbilitiesEventBus {
    private listeners = new Map<AbilitiesGameEventType, Set<Listener<any>>>();

    on<T extends AbilitiesGameEventType>(type: T, listener: Listener<T>): () => void {
        const bucket = this.listeners.get(type) ?? new Set();
        bucket.add(listener as Listener<any>);
        this.listeners.set(type, bucket);
        return () => {
            bucket.delete(listener as Listener<any>);
            if (bucket.size === 0) this.listeners.delete(type);
        };
    }

    emit<T extends AbilitiesGameEventType>(type: T, payload: AbilitiesGameEventMap[T]): void {
        const bucket = this.listeners.get(type);
        if (!bucket) return;
        for (const listener of bucket) {
            listener(payload);
        }
    }
}
