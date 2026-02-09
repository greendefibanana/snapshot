export interface AudioConfig {
    masterVolume: number;
    sfxVolume: number;
}

export class AudioManager {
    private masterVolume: number;
    private sfxVolume: number;
    private unlocked = false;

    private shoot: HTMLAudioElement;
    private walk: HTMLAudioElement;
    private run: HTMLAudioElement;
    private jump: HTMLAudioElement;

    private isWalking = false;
    private isRunning = false;

    constructor(config?: Partial<AudioConfig>) {
        this.masterVolume = config?.masterVolume ?? 1.0;
        this.sfxVolume = config?.sfxVolume ?? 0.9;

        this.shoot = this.createAudio('/audio/shooting.mp3', false);
        this.walk = this.createAudio('/audio/walking.mp3', true);
        this.run = this.createAudio('/audio/running.mp3', true);
        this.jump = this.createAudio('/audio/jumping.mp3', false);
    }

    private createAudio(src: string, loop: boolean): HTMLAudioElement {
        const audio = new Audio(src);
        audio.loop = loop;
        audio.preload = 'auto';
        audio.volume = 0;
        return audio;
    }

    unlock(): void {
        if (this.unlocked) return;
        this.unlocked = true;
        // Attempt silent play to unlock audio on user gesture
        this.walk.play().then(() => {
            this.walk.pause();
            this.walk.currentTime = 0;
        }).catch(() => {});
        this.run.play().then(() => {
            this.run.pause();
            this.run.currentTime = 0;
        }).catch(() => {});
    }

    setVolumes(master: number, sfx: number): void {
        this.masterVolume = Math.max(0, Math.min(1, master));
        this.sfxVolume = Math.max(0, Math.min(1, sfx));
        this.refreshLoopVolumes();
    }

    private get volume(): number {
        return this.masterVolume * this.sfxVolume;
    }

    private refreshLoopVolumes(): void {
        if (this.isWalking) this.walk.volume = 0.5 * this.volume;
        if (this.isRunning) this.run.volume = 0.6 * this.volume;
    }

    playShoot(): void {
        if (!this.unlocked) return;
        this.shoot.currentTime = 0;
        this.shoot.volume = 0.9 * this.volume;
        void this.shoot.play();
    }

    playJump(): void {
        if (!this.unlocked) return;
        this.jump.currentTime = 0;
        this.jump.volume = 0.8 * this.volume;
        void this.jump.play();
    }

    setWalking(active: boolean): void {
        if (!this.unlocked) return;
        if (active === this.isWalking) return;
        this.isWalking = active;
        if (active) {
            this.walk.currentTime = 0;
            this.walk.volume = 0.5 * this.volume;
            void this.walk.play();
        } else {
            this.walk.pause();
        }
    }

    setRunning(active: boolean): void {
        if (!this.unlocked) return;
        if (active === this.isRunning) return;
        this.isRunning = active;
        if (active) {
            this.run.currentTime = 0;
            this.run.volume = 0.6 * this.volume;
            void this.run.play();
        } else {
            this.run.pause();
        }
    }

    stopAllMovement(): void {
        this.setWalking(false);
        this.setRunning(false);
    }
}

