import RAPIER from '@dimforge/rapier3d-compat';

export class RapierWorld {
    private initialized = false;
    world: RAPIER.World | null = null;

    async init(gravity: { x: number; y: number; z: number } = { x: 0, y: -30, z: 0 }): Promise<void> {
        if (this.initialized) return;
        await RAPIER.init();
        this.world = new RAPIER.World(gravity);
        this.initialized = true;
    }

    step(deltaTime?: number): void {
        if (!this.world) return;
        if (deltaTime && Number.isFinite(deltaTime)) {
            this.world.timestep = deltaTime;
        }
        this.world.step();
    }

    get rapier(): typeof RAPIER {
        return RAPIER;
    }
}
