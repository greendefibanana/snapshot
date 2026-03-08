import * as THREE from 'three';
import { findNozzleNode, findGripNode } from './gunRegistry.js';

export class WeaponAttacher {
    constructor(characterModel) {
        this.characterModel = characterModel;
        this.attachedWeapon = null;
        this.nozzleRef = null;
        this.leftHandIKTarget = null;
        this.nodeMap = new Map();

        this._cacheSkeletonNodes();
    }

    _cacheSkeletonNodes() {
        const bones = [];
        const objects = [];

        this.characterModel.traverse((node) => {
            this.nodeMap.set(node.name, node);
            if (node.isBone) {
                bones.push(node.name);
            } else if (node.isObject3D && !node.isBone) {
                objects.push(node.name);
            }
        });

        console.group('--- Cached Skeleton Nodes ---');
        console.log('Bones:', bones);
        console.log('Objects:', objects);
        console.groupEnd();
    }

    attach(weaponModel, gunDef) {
        this.detach();

        const rightHandSocketName = gunDef.socketMap.rightHand;
        const rightHandSocket = this.nodeMap.get(rightHandSocketName);

        if (!rightHandSocket) {
            console.warn(`Socket '${rightHandSocketName}' not found on character model. Attaching to root.`);
            this.characterModel.add(weaponModel);
            weaponModel.position.set(0, 0, 0);
            weaponModel.quaternion.identity();
        } else {
            const rightGripName = gunDef.attachments.rightHand;
            const rightGrip = findGripNode(weaponModel, rightGripName);

            if (rightGrip) {
                rightHandSocket.add(weaponModel);

                weaponModel.position.set(0, 0, 0);
                weaponModel.quaternion.identity();
                weaponModel.scale.set(1, 1, 1);
                weaponModel.updateMatrixWorld(true);

                const gripLocalMatrix = new THREE.Matrix4();
                const invWeaponWorld = new THREE.Matrix4().copy(weaponModel.matrixWorld).invert();
                // Compute Grip's local matrix relative to the weapon root
                gripLocalMatrix.copy(rightGrip.matrixWorld).premultiply(invWeaponWorld);

                // Apply inverse offset so the grip sits at exactly (0,0,0) inside the socket
                const invGripLocal = new THREE.Matrix4().copy(gripLocalMatrix).invert();
                invGripLocal.decompose(weaponModel.position, weaponModel.quaternion, weaponModel.scale);
            } else {
                console.warn(`Grip node '${rightGripName}' not found on weapon model. Attaching at zero offset.`);
                rightHandSocket.add(weaponModel);
                weaponModel.position.set(0, 0, 0);
                weaponModel.quaternion.identity();
            }
        }

        if (gunDef.attachments.leftHand) {
            const leftGripName = gunDef.attachments.leftHand;
            const leftGrip = findGripNode(weaponModel, leftGripName);

            const leftHandSocketName = gunDef.socketMap.leftHand;
            const leftHandSocket = leftHandSocketName ? this.nodeMap.get(leftHandSocketName) : null;

            if (leftGrip && leftHandSocket) {
                weaponModel.updateMatrixWorld(true);
                this.leftHandIKTarget = new THREE.Vector3();
                leftGrip.getWorldPosition(this.leftHandIKTarget);
                console.log('Left Hand IK Target Position:', this.leftHandIKTarget);
            }
        }

        this.nozzleRef = findNozzleNode(weaponModel);
        this.attachedWeapon = weaponModel;

        return { nozzle: this.nozzleRef };
    }

    detach() {
        if (this.attachedWeapon && this.attachedWeapon.parent) {
            this.attachedWeapon.parent.remove(this.attachedWeapon);
        }
        this.attachedWeapon = null;
        this.nozzleRef = null;
        this.leftHandIKTarget = null;
    }

    getNozzleWorldPosition(cameraFallback = null) {
        const pos = new THREE.Vector3();
        if (this.nozzleRef) {
            this.nozzleRef.getWorldPosition(pos);
        } else if (cameraFallback) {
            cameraFallback.getWorldPosition(pos);
        }
        return pos;
    }

    getNozzleWorldDirection(cameraFallback = null) {
        const dir = new THREE.Vector3();
        if (this.nozzleRef) {
            // Extract -Z forward direction directly from the world matrix
            const e = this.nozzleRef.matrixWorld.elements;
            dir.set(-e[8], -e[9], -e[10]).normalize();
        } else if (cameraFallback) {
            const e = cameraFallback.matrixWorld.elements;
            dir.set(-e[8], -e[9], -e[10]).normalize();
        } else {
            dir.set(0, 0, -1);
        }
        return dir;
    }
}

/**
 * WeaponAttachment System
 * 
 * Why grip-offset-based attachment is used instead of direct parenting:
 * Directly parenting the weapon to the hand bone assumes the weapon's pivot (or 0,0,0 coordinate) 
 * is perfectly aligned with the grip. By using a grip-offset computation, we can attach any weapon model 
 * so that its specific 'Grip' node precisely aligns with the character's hand socket, regardless of where 
 * the artist placed the weapon's true origin or how it was scaled in Blender. This ensures a flawless hold
 * for diverse weapon shapes.
 * 
 * How leftHandIKTarget should be consumed by an IK solver:
 * Because primary weapons naturally dictate the position of both hands, the right hand is hard-parented 
 * to the socket. The left hand requires an Inverse Kinematics (IK) constraint to reach the barrel. 
 * `leftHandIKTarget` provides the exact world-space position of 'Grip_2'. The IK solver for the character's 
 * left arm should use this Vector3 as its end-effector target to smoothly snap the left hand onto the weapon 
 * during gameplay.
 * 
 * The nozzle naming inconsistency problem and why findNozzleNode handles it centrally:
 * Different 3D artists, weapon packs, and asset updates often introduce discrepancies in the muzzle flash 
 * point naming (e.g., 'nozzle', 'Nozzle1', 'nuzzle'). Hardcoding one name leads to frequent bugs where
 * projectiles or flashes spawn at the world origin or character hips. `findNozzleNode` centrally searches 
 * against a known array of common naming variations, allowing us to accurately locate the muzzle on any 
 * model without needing to manually edit the 3D asset files.
 */
