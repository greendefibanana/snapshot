/**
 * AnimationController - Character Animation Management
 * 
 * Manages Three.js AnimationMixer with state-based crossfade transitions.
 * Supports locomotion states: idle, running, jumping, etc.
 */

import * as THREE from 'three';

// =============================================================================
// ANIMATION STATES
// =============================================================================

export enum AnimationState {
    IDLE = 'idle',
    RUNNING = 'Running',
    PISTOL_WALK = 'Pistol Walk',
    RIFLE_RUN = 'Rifle Run',
    JUMP_START = 'Jump start',
    JUMP_LOOP = 'Jump Loop',
    JUMP_LAND = 'Jump Land',
    HIT_REACT = 'Hit React',
    PISTOL_AIM = 'Pistol Aim',
    RIFLE_AIMING_IDLE = 'Rifle Aiming Idle',
}

// =============================================================================
// ANIMATION CONTROLLER
// =============================================================================

export class AnimationController {
    private mixer: THREE.AnimationMixer;
    private actions: Map<string, THREE.AnimationAction> = new Map();
    private currentState: AnimationState = AnimationState.IDLE;
    private currentAction: THREE.AnimationAction | null = null;

    // Crossfade duration
    private fadeDuration = 0.15;

    constructor(model: THREE.Object3D, animations: THREE.AnimationClip[]) {
        this.mixer = new THREE.AnimationMixer(model);

        // Store all animations by name
        for (const clip of animations) {
            const action = this.mixer.clipAction(clip);
            this.actions.set(clip.name, action);
            console.log(`Animation loaded: ${clip.name}`);
        }

        // Start with idle
        this.setState(AnimationState.IDLE);
    }

    /**
     * Update the animation mixer.
     */
    update(deltaTime: number): void {
        this.mixer.update(deltaTime);
    }

    /**
     * Set the current animation state.
     */
    setState(state: AnimationState): void {
        if (state === this.currentState && this.currentAction?.isRunning()) {
            return;
        }

        const action = this.actions.get(state);
        if (!action) {
            console.warn(`Animation not found: ${state}`);
            return;
        }

        // Crossfade from current to new
        if (this.currentAction && this.currentAction !== action) {
            action.reset();
            action.play();
            this.currentAction.crossFadeTo(action, this.fadeDuration, true);
        } else {
            action.reset();
            action.play();
        }

        this.currentAction = action;
        this.currentState = state;
    }

    /**
     * Update animation based on movement state.
     */
    updateFromMovement(
        isMoving: boolean,
        isRunning: boolean,
        isGrounded: boolean,
        verticalVelocity: number,
        isAiming: boolean = false
    ): void {
        // Priority: Jump > Movement > Idle

        if (!isGrounded) {
            // In air
            if (verticalVelocity > 0.5) {
                this.setState(AnimationState.JUMP_START);
            } else if (verticalVelocity < -0.5) {
                this.setState(AnimationState.JUMP_LOOP);
            }
            return;
        }

        // On ground
        if (isMoving) {
            if (isAiming) {
                this.setState(AnimationState.PISTOL_WALK);
            } else if (isRunning) {
                this.setState(AnimationState.RUNNING);
            } else {
                this.setState(AnimationState.RUNNING); // Use running for walk too
            }
        } else {
            if (isAiming) {
                this.setState(AnimationState.RIFLE_AIMING_IDLE);
            } else {
                this.setState(AnimationState.IDLE);
            }
        }
    }

    /**
     * Play a one-shot animation (e.g., hit react).
     */
    playOneShot(state: AnimationState, onComplete?: () => void): void {
        const action = this.actions.get(state);
        if (!action) return;

        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();

        if (onComplete) {
            const onFinished = () => {
                this.mixer.removeEventListener('finished', onFinished);
                onComplete();
            };
            this.mixer.addEventListener('finished', onFinished);
        }
    }

    /**
     * Get the animation mixer.
     */
    getMixer(): THREE.AnimationMixer {
        return this.mixer;
    }

    /**
     * Check if an animation exists.
     */
    hasAnimation(name: string): boolean {
        return this.actions.has(name);
    }

    /**
     * Get current state.
     */
    getCurrentState(): AnimationState {
        return this.currentState;
    }
}

export function createAnimationController(
    model: THREE.Object3D,
    animations: THREE.AnimationClip[]
): AnimationController {
    return new AnimationController(model, animations);
}
