/**
 * Input Handler
 * 
 * Captures keyboard and mouse input, buffers it per-tick,
 * and manages pointer lock.
 * 
 * EXTENSION POINT: Add gamepad support.
 */

import type {
    Tick,
    InputFrame,
    MovementInput,
    AimInput,
} from '@snapshot/shared';


// =============================================================================
// TYPES
// =============================================================================

export interface InputHandlerConfig {
    /** Target element for input capture */
    target: HTMLElement;
    /** Mouse sensitivity */
    sensitivity?: number;
    /** Invert Y axis */
    invertY?: boolean;
}

export interface KeyBindings {
    forward: string[];
    backward: string[];
    left: string[];
    right: string[];
    jump: string[];
    crouch: string[];
    sprint: string[];
    dodge: string[];
    reload: string[];
    tactical: string[];
    ultimate: string[];
    interact: string[];
    weapon1: string[];
    weapon2: string[];
    weapon3: string[];
}

// =============================================================================
// DEFAULT KEY BINDINGS
// =============================================================================

const DEFAULT_BINDINGS: KeyBindings = {
    forward: ['KeyW', 'ArrowUp'],
    backward: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    jump: ['Space'],
    crouch: ['ControlLeft', 'KeyC'],
    sprint: ['ShiftLeft'],
    dodge: ['KeyV'],
    reload: ['KeyR'],
    tactical: ['KeyE'],
    ultimate: ['KeyQ'],
    interact: ['KeyF'],
    weapon1: ['Digit1'],
    weapon2: ['Digit2'],
    weapon3: ['Digit3'],
};

// =============================================================================
// INPUT HANDLER CLASS
// =============================================================================

export class InputHandler {
    private target: HTMLElement;
    private sensitivity: number;
    private invertY: boolean;
    private bindings: KeyBindings;

    /** Currently pressed keys */
    private keysDown: Set<string> = new Set();

    /** Mouse buttons currently pressed */
    private mouseDown: Set<number> = new Set();

    /** Accumulated mouse movement since last frame */
    private mouseDeltaX = 0;
    private mouseDeltaY = 0;

    /** Current aim angles (radians) */
    private yaw = 0;
    private pitch = 0;

    /** Is pointer currently locked */
    private isPointerLocked = false;

    /** Bound event handlers (for cleanup) */
    private boundHandlers: {
        keydown: (e: KeyboardEvent) => void;
        keyup: (e: KeyboardEvent) => void;
        mousedown: (e: MouseEvent) => void;
        mouseup: (e: MouseEvent) => void;
        mousemove: (e: MouseEvent) => void;
        pointerlock: () => void;
        pointerlockError: () => void;
    };

    constructor(config: InputHandlerConfig) {
        this.target = config.target;
        this.sensitivity = config.sensitivity ?? 0.002;
        this.invertY = config.invertY ?? false;
        this.bindings = { ...DEFAULT_BINDINGS };

        // Create bound handlers
        this.boundHandlers = {
            keydown: this.onKeyDown.bind(this),
            keyup: this.onKeyUp.bind(this),
            mousedown: this.onMouseDown.bind(this),
            mouseup: this.onMouseUp.bind(this),
            mousemove: this.onMouseMove.bind(this),
            pointerlock: this.onPointerLockChange.bind(this),
            pointerlockError: this.onPointerLockError.bind(this),
        };

        // Attach event listeners
        this.attach();
    }

    /**
     * Attach event listeners.
     */
    private attach(): void {
        document.addEventListener('keydown', this.boundHandlers.keydown);
        document.addEventListener('keyup', this.boundHandlers.keyup);
        this.target.addEventListener('mousedown', this.boundHandlers.mousedown);
        document.addEventListener('mouseup', this.boundHandlers.mouseup);
        document.addEventListener('mousemove', this.boundHandlers.mousemove);
        document.addEventListener('pointerlockchange', this.boundHandlers.pointerlock);
        document.addEventListener('pointerlockerror', this.boundHandlers.pointerlockError);
    }

    /**
     * Detach event listeners.
     */
    private detach(): void {
        document.removeEventListener('keydown', this.boundHandlers.keydown);
        document.removeEventListener('keyup', this.boundHandlers.keyup);
        this.target.removeEventListener('mousedown', this.boundHandlers.mousedown);
        document.removeEventListener('mouseup', this.boundHandlers.mouseup);
        document.removeEventListener('mousemove', this.boundHandlers.mousemove);
        document.removeEventListener('pointerlockchange', this.boundHandlers.pointerlock);
        document.removeEventListener('pointerlockerror', this.boundHandlers.pointerlockError);
    }

    /**
     * Request pointer lock.
     */
    requestPointerLock(): void {
        this.target.requestPointerLock();
    }

    /**
     * Exit pointer lock.
     */
    exitPointerLock(): void {
        document.exitPointerLock();
    }

    /**
     * Check if a key is currently pressed.
     */
    isKeyDown(code: string): boolean {
        return this.keysDown.has(code);
    }

    /**
     * Check if any of the keys for an action are pressed.
     */
    isActionActive(action: keyof KeyBindings): boolean {
        const codes = this.bindings[action];
        return codes.some(code => this.keysDown.has(code));
    }

    /**
     * Check if a mouse button is pressed.
     */
    isMouseButtonDown(button: number): boolean {
        return this.mouseDown.has(button);
    }

    /**
     * Get current aim angles.
     */
    getAim(): AimInput {
        return {
            yaw: this.yaw,
            pitch: this.pitch,
        };
    }

    /**
     * Get current movement input state.
     */
    getMovementInput(): MovementInput {
        return {
            forward: this.isActionActive('forward'),
            backward: this.isActionActive('backward'),
            left: this.isActionActive('left'),
            right: this.isActionActive('right'),
            jump: this.isActionActive('jump'),
            crouch: this.isActionActive('crouch'),
            sprint: this.isActionActive('sprint'),
            dodge: this.isActionActive('dodge'),
        };
    }

    /**
     * Get the complete input frame for the current tick.
     */
    getInputFrame(tick: Tick, sequence: number, clientTime: number): InputFrame {
        const weaponSlot =
            this.isActionActive('weapon1') ? 0 :
                this.isActionActive('weapon2') ? 1 :
                    this.isActionActive('weapon3') ? 2 : -1;

        return {
            tick,
            sequence,
            movement: this.getMovementInput(),
            aim: this.getAim(),
            primaryFire: this.isMouseButtonDown(0),
            secondaryFire: this.isMouseButtonDown(2),
            reload: this.isActionActive('reload'),
            tactical: this.isActionActive('tactical'),
            ultimate: this.isActionActive('ultimate'),
            interact: this.isActionActive('interact'),
            weaponSlot,
            clientTime,
        };
    }

    /**
     * Reset accumulated mouse delta (call after processing).
     */
    resetMouseDelta(): void {
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
    }

    /**
     * Update key bindings.
     */
    setBindings(bindings: Partial<KeyBindings>): void {
        this.bindings = {
            ...this.bindings,
            ...bindings,
        };
    }

    /**
     * Set mouse sensitivity.
     */
    setSensitivity(sensitivity: number): void {
        this.sensitivity = sensitivity;
    }

    /**
     * Set Y axis inversion.
     */
    setInvertY(invert: boolean): void {
        this.invertY = invert;
    }

    /**
     * Check if pointer is locked.
     */
    get pointerLocked(): boolean {
        return this.isPointerLocked;
    }

    // =========================================================================
    // EVENT HANDLERS
    // =========================================================================

    private onKeyDown(e: KeyboardEvent): void {
        // Ignore repeats
        if (e.repeat) return;

        // Ignore if typing in input field
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }

        this.keysDown.add(e.code);

        // Prevent default for game keys
        if (this.isGameKey(e.code)) {
            e.preventDefault();
        }
    }

    private onKeyUp(e: KeyboardEvent): void {
        this.keysDown.delete(e.code);
    }

    private onMouseDown(e: MouseEvent): void {
        this.mouseDown.add(e.button);
        // Request pointer lock on click for shooter-style camera
        if (!this.isPointerLocked) {
            this.requestPointerLock();
        }
    }

    private onMouseUp(e: MouseEvent): void {
        this.mouseDown.delete(e.button);
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.isPointerLocked) return;

        // Accumulate mouse movement
        this.mouseDeltaX += e.movementX;
        this.mouseDeltaY += e.movementY;

        // Update aim angles
        this.yaw -= e.movementX * this.sensitivity;

        const pitchDelta = this.invertY ? e.movementY : -e.movementY;
        this.pitch += pitchDelta * this.sensitivity;

        // Clamp pitch to prevent flipping
        const maxPitch = Math.PI / 2 - 0.01;
        this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

        // Normalize yaw
        while (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
        while (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
    }

    private onPointerLockChange(): void {
        this.isPointerLocked = document.pointerLockElement === this.target;

        if (!this.isPointerLocked) {
            // Clear mouse buttons when pointer lock is released
            this.mouseDown.clear();
        }
    }

    private onPointerLockError(): void {
        console.error('InputHandler: Pointer lock error');
        this.isPointerLocked = false;
    }

    /**
     * Check if a key code is used by the game.
     */
    private isGameKey(code: string): boolean {
        for (const keys of Object.values(this.bindings)) {
            if (keys.includes(code)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Cleanup and dispose.
     */
    dispose(): void {
        this.detach();
        this.keysDown.clear();
        this.mouseDown.clear();

        if (this.isPointerLocked) {
            document.exitPointerLock();
        }
    }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createInputHandler(config: InputHandlerConfig): InputHandler {
    return new InputHandler(config);
}
