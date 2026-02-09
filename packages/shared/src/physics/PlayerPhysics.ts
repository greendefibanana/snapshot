import type { Vector3 } from '../types/index.js';
import type { InputFrame } from '../types/index.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import { RapierWorld } from './RapierWorld.js';

export interface PlayerPhysicsConfig {
    capsuleRadius: number;
    capsuleHeight: number;
    walkSpeed: number;
    sprintSpeed: number;
    slideSpeed: number;
    aimSpeed: number;
    jumpVelocity: number;
    gravity: number;
    slideDuration: number;
    slideCooldown: number;
    slideHeightReduction: number;
}

export const DEFAULT_PLAYER_PHYSICS: PlayerPhysicsConfig = {
    capsuleRadius: 0.35,
    capsuleHeight: 1.8,
    walkSpeed: 3.0,
    sprintSpeed: 6.0,
    slideSpeed: 6.0,
    aimSpeed: 1.5,
    jumpVelocity: 15.0,
    gravity: -30.0,
    slideDuration: 0.5,
    slideCooldown: 1.0,
    slideHeightReduction: 0.6,
};

export interface PlayerPhysicsInput {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    jump: boolean;
    sprint: boolean;
    slide: boolean;
    aim: boolean;
    yaw: number;
}

export class PlayerPhysicsController {
    private world: RapierWorld;
    private config: PlayerPhysicsConfig;
    private body: RAPIER.RigidBody | null = null;
    private collider: RAPIER.Collider | null = null;
    private velocity: Vector3 = { x: 0, y: 0, z: 0 };
    private isOnGround = false;
    private isSliding = false;
    private slideTimer = 0;
    private slideCooldownTimer = 0;

    constructor(world: RapierWorld, position: Vector3, config: Partial<PlayerPhysicsConfig> = {}) {
        this.world = world;
        this.config = { ...DEFAULT_PLAYER_PHYSICS, ...config };
        if (!world.world) {
            throw new Error('RapierWorld not initialized');
        }

        const rapier = world.rapier;
        const bodyDesc = rapier.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y, position.z)
            .setLinearDamping(0.1)
            .setAngularDamping(1.0)
            .setCcdEnabled(true)
            .lockRotations();
        this.body = world.world.createRigidBody(bodyDesc);

        const colliderDesc = rapier.ColliderDesc.capsule(
            this.config.capsuleHeight * 0.5 - this.config.capsuleRadius,
            this.config.capsuleRadius
        ).setFriction(1.0).setRestitution(0.0);
        this.collider = world.world.createCollider(colliderDesc, this.body);
        this.body.lockRotations(true, true);
    }

    getPosition(): Vector3 {
        if (!this.body) return { x: 0, y: 0, z: 0 };
        const t = this.body.translation();
        return { x: t.x, y: t.y, z: t.z };
    }

    getVelocity(): Vector3 {
        if (!this.body) return { x: 0, y: 0, z: 0 };
        const v = this.body.linvel();
        return { x: v.x, y: v.y, z: v.z };
    }

    get isGrounded(): boolean {
        return this.isOnGround;
    }

    get sliding(): boolean {
        return this.isSliding;
    }

    reset(position: Vector3): void {
        if (!this.body) return;
        this.body.setTranslation(position, true);
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.velocity = { x: 0, y: 0, z: 0 };
        this.isOnGround = false;
        this.isSliding = false;
        this.slideTimer = 0;
        this.slideCooldownTimer = 0;
    }

    applyPositionOffset(offset: Vector3): void {
        if (!this.body) return;
        const t = this.body.translation();
        this.body.setTranslation({ x: t.x + offset.x, y: t.y + offset.y, z: t.z + offset.z }, true);
    }

    setVelocity(velocity: Vector3): void {
        if (!this.body) return;
        this.body.setLinvel(velocity, true);
    }

    update(dt: number, input: PlayerPhysicsInput): void {
        if (!this.body || !this.world.world) return;

        const delta = Math.min(dt, 0.1);
        const rapier = this.world.rapier;

        if (this.slideCooldownTimer > 0) {
            this.slideCooldownTimer -= delta;
        }
        if (input.slide && this.isOnGround && !this.isSliding && this.slideCooldownTimer <= 0) {
            this.isSliding = true;
            this.slideTimer = this.config.slideDuration;
            if (this.collider) {
                const halfHeight = this.config.capsuleHeight * this.config.slideHeightReduction * 0.5 - this.config.capsuleRadius;
                this.collider.setShape(rapier.ColliderDesc.capsule(halfHeight, this.config.capsuleRadius).shape);
            }
        }
        if (this.isSliding) {
            this.slideTimer -= delta;
            if (this.slideTimer <= 0) {
                this.isSliding = false;
                this.slideCooldownTimer = this.config.slideCooldown;
                if (this.collider) {
                    const halfHeight = this.config.capsuleHeight * 0.5 - this.config.capsuleRadius;
                    this.collider.setShape(rapier.ColliderDesc.capsule(halfHeight, this.config.capsuleRadius).shape);
                }
            }
        }

        const speed = input.sprint ? this.config.sprintSpeed : this.config.walkSpeed;
        const aimSpeed = input.aim ? this.config.aimSpeed : 1;
        const moveSpeed = speed * aimSpeed;

        const forward = { x: Math.sin(input.yaw), z: Math.cos(input.yaw) };
        const right = { x: Math.cos(input.yaw), z: -Math.sin(input.yaw) };

        let moveX = 0;
        let moveZ = 0;
        if (input.forward) {
            moveX += forward.x;
            moveZ += forward.z;
        }
        if (input.backward) {
            moveX -= forward.x;
            moveZ -= forward.z;
        }
        if (input.right) {
            moveX += right.x;
            moveZ += right.z;
        }
        if (input.left) {
            moveX -= right.x;
            moveZ -= right.z;
        }

        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (len > 0.001) {
            moveX = (moveX / len) * moveSpeed;
            moveZ = (moveZ / len) * moveSpeed;
        }

        this.velocity = { x: moveX, y: this.velocity.y, z: moveZ };

        if (this.body) {
            const vel = this.body.linvel();
            let y = vel.y;
            if (this.isOnGround && input.jump) {
                y = this.config.jumpVelocity;
                this.isOnGround = false;
            }
            this.body.setLinvel({ x: moveX, y, z: moveZ }, true);
        }

        // Ground check (raycast down, exclude self collider/body)
        if (this.body && this.world.world && this.collider) {
            const origin = this.body.translation();
            const ray = new rapier.Ray({ x: origin.x, y: origin.y + 0.1, z: origin.z }, { x: 0, y: -1, z: 0 });
            const hit = this.world.world.castRay(ray, this.config.capsuleRadius + 0.15, true, undefined, undefined, this.collider, this.body);
            this.isOnGround = !!hit;
        }
    }
}
