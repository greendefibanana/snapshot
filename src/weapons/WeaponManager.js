import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GUN_REGISTRY } from './gunRegistry.js';
import { WeaponAttacher } from './WeaponAttacher.js';
import { GunMechanics } from './GunMechanics.js';

export class WeaponManager {
    constructor({ scene, camera, characterModel, loadout, callbacks }) {
        this.scene = scene;
        this.camera = camera;
        this.characterModel = characterModel;
        this.loadout = loadout;
        this.callbacks = callbacks;

        this.loader = new GLTFLoader();
        this.attacher = new WeaponAttacher(characterModel);

        this.weapons = {};
        this.currentSlot = null;
        this.current = null;
        this.isADS = false;

        this._projectiles = [];
    }

    async init() {
        for (const slot of ['primary', 'secondary']) {
            const gunId = this.loadout[slot];
            if (!gunId) continue;

            const def = GUN_REGISTRY[gunId];
            if (!def) {
                console.warn(`Weapon definition not found for ID: ${gunId}`);
                continue;
            }

            try {
                const gltf = await this.loader.loadAsync(`/models/guns/${def.modelPath}`);
                const model = gltf.scene;

                const mechanics = new GunMechanics(def);
                const mixer = new THREE.AnimationMixer(model);
                const animations = this._mapAnimations(mixer, gltf.animations);

                this.weapons[slot] = {
                    model,
                    def,
                    mechanics,
                    animations,
                    mixer
                };

                model.visible = false;
                this.scene.add(model);
            } catch (err) {
                console.error(`Failed to load weapon model ${def.modelPath}:`, err);
            }
        }

        if (this.loadout.primary) {
            this.equipSlot('primary');
        } else if (this.loadout.secondary) {
            this.equipSlot('secondary');
        }
    }

    _mapAnimations(mixer, clips) {
        const anims = {
            idle: null,
            fire: null,
            reload: null,
            equip: null,
            pump: null,
            bolt: null
        };

        if (!clips || clips.length === 0) return anims;

        for (const clip of clips) {
            const name = clip.name.toLowerCase();
            const action = mixer.clipAction(clip);

            if (name.includes('idle')) anims.idle = action;
            else if (name.includes('fire') || name.includes('shoot') || name.includes('shot')) anims.fire = action;
            else if (name.includes('reload')) anims.reload = action;
            else if (name.includes('equip') || name.includes('draw') || name.includes('raise')) anims.equip = action;
            else if (name.includes('pump')) anims.pump = action;
            else if (name.includes('bolt') || name.includes('cycle')) anims.bolt = action;
        }

        // Set some defaults like clamping for one-shot anims
        if (anims.fire) {
            anims.fire.setLoop(THREE.LoopOnce);
            anims.fire.clampWhenFinished = true;
        }
        if (anims.reload) {
            anims.reload.setLoop(THREE.LoopOnce);
            anims.reload.clampWhenFinished = true;
        }
        if (anims.equip) {
            anims.equip.setLoop(THREE.LoopOnce);
            anims.equip.clampWhenFinished = true;
        }
        if (anims.pump) {
            anims.pump.setLoop(THREE.LoopOnce);
            anims.pump.clampWhenFinished = true;
        }
        if (anims.bolt) {
            anims.bolt.setLoop(THREE.LoopOnce);
            anims.bolt.clampWhenFinished = true;
        }

        return anims;
    }

    equipSlot(slot) {
        if (!this.weapons[slot]) return;

        if (this.current) {
            this.current.model.visible = false;
            this.attacher.detach();
            this.current.mixer.stopAllAction();
        }

        this.currentSlot = slot;
        this.current = this.weapons[slot];

        this.current.model.visible = true;
        this.attacher.attach(this.current.model, this.current.def);

        if (this.current.animations.equip) {
            this.current.animations.equip.reset().play();
            if (this.current.animations.idle) {
                this.current.animations.idle.reset().play();
                this.current.animations.equip.crossFadeTo(this.current.animations.idle, 0.2, false);
            }
        } else if (this.current.animations.idle) {
            this.current.animations.idle.reset().play();
        }

        this.current.mechanics.cancelReload();
        console.log(`Equipped ${this.current.def.name}`);
    }

    update(delta) {
        if (!this.current) {
            this._updateProjectiles(delta);
            return;
        }

        // Update all mixers (so even background reloads/pumps finish if we want logic detached from equip)
        for (const key in this.weapons) {
            const wpn = this.weapons[key];
            if (wpn.mixer) wpn.mixer.update(delta);
        }

        const { recoilX, recoilY, autoFire } = this.current.mechanics.update(delta);

        // Apply recoil vertically (x-axis pitch) and horizontally (y-axis yaw)
        this.camera.rotation.x += recoilX * delta;
        this.camera.rotation.y += recoilY * delta;

        if (autoFire) {
            this._processFire(this.current.mechanics.tryFire(this.camera.getWorldDirection(new THREE.Vector3())));
        }

        // Drain burst queue
        if (this.current.mechanics.pendingBurstRays && this.current.mechanics.pendingBurstRays.length > 0) {
            for (const burstShot of this.current.mechanics.pendingBurstRays) {
                this._processFire(burstShot);
            }
            this.current.mechanics.pendingBurstRays = [];
        }

        this._updateProjectiles(delta);
    }

    _processFire(result) {
        if (!result || !result.fired) {
            if (result && result.reason === 'empty' && this.callbacks.onEmpty) {
                this.callbacks.onEmpty();
            }
            return;
        }

        const nozzlePos = this.attacher.getNozzleWorldPosition(this.camera);
        const nozzleDir = this.attacher.getNozzleWorldDirection(this.camera);
        const def = this.current.def;

        // Rebase the mechanics-generated rays (which were camera-relative) to be nozzle-relative
        // by finding the relative spread offset from the front and applying it to the nozzle forward.
        const reorientedRays = result.rays.map(ray => {
            // Very simple approximation: since spread is small, we just treat the angle difference
            const cameraFwd = this.camera.getWorldDirection(new THREE.Vector3());
            const offsetQuad = new THREE.Quaternion().setFromUnitVectors(cameraFwd, ray.direction);
            const newDir = nozzleDir.clone().applyQuaternion(offsetQuad).normalize();
            return { direction: newDir };
        });

        if (this.callbacks.onFire) {
            this.callbacks.onFire(def, nozzlePos, reorientedRays);
        }

        if (this.current.animations.fire) {
            this.current.animations.fire.reset().play();
        }

        // Handle special cycle animations
        if (result.fireMode === 'pump' && this.current.animations.pump) {
            this.current.animations.pump.reset().play();
        }
        if (result.fireMode === 'bolt' && this.current.animations.bolt) {
            this.current.animations.bolt.reset().play();
        }

        for (const ray of reorientedRays) {
            if (result.isProjectile) {
                this._spawnProjectile(nozzlePos, ray.direction, result);
            } else {
                const raycaster = new THREE.Raycaster(nozzlePos, ray.direction);
                const intersects = raycaster.intersectObjects(this.scene.children, true);

                let hitProcessed = false;
                if (intersects.length > 0) {
                    // Filter out own player meshes if needed here. Assuming external layer masks handle this.
                    const intersection = intersects[0];
                    const target = intersection.object;

                    let isHeadshot = false;
                    // Simple headshot check based on naming convention or userData
                    if (target.name.toLowerCase().includes('head') || target.userData.isHead) {
                        isHeadshot = true;
                    }

                    let finalDamage = result.damage * (isHeadshot ? result.headshotMult : 1);

                    if (def.mechanics.rangeFalloff !== null) {
                        const dist = intersection.distance;
                        if (dist > def.mechanics.range) {
                            const falloffFactor = Math.max(0, 1 - (dist - def.mechanics.range) / def.mechanics.range);
                            // Linear drop off using falloff multiplier bounds
                            const minScalar = def.mechanics.rangeFalloff;
                            finalDamage *= THREE.MathUtils.lerp(minScalar, 1, falloffFactor);
                        }
                    }

                    if (this.callbacks.onHit) {
                        this.callbacks.onHit(target, finalDamage, isHeadshot, intersection.point);
                    }

                    this._spawnImpactSplat(intersection.point, def.visualFX);
                    this._spawnTracer(nozzlePos, intersection.point, def.visualFX);
                    hitProcessed = true;
                }

                if (!hitProcessed) {
                    // If hit nothing, spawn a tracer way out
                    const endPoint = nozzlePos.clone().add(ray.direction.clone().multiplyScalar(200));
                    this._spawnTracer(nozzlePos, endPoint, def.visualFX);
                }
            }
        }

        this._spawnMuzzleFlash(nozzlePos, def.visualFX);

        if (this.callbacks.onAmmoChange) {
            this.callbacks.onAmmoChange(this.currentSlot, result.ammoRemaining, result.reserveRemaining);
        }
    }

    _spawnProjectile(origin, direction, fireResult) {
        const radius = 0.08;
        const geometry = new THREE.SphereGeometry(radius, 8, 8);
        const material = new THREE.MeshToonMaterial({ color: fireResult.def?.visualFX.tracerColor || '#FF0000' });
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.copy(origin);
        this.scene.add(mesh);

        this._projectiles.push({
            mesh,
            velocity: direction.clone().multiplyScalar(fireResult.projectileSpeed),
            gravity: fireResult.projectileGravity,
            def: this.current.def,
            distanceTravelled: 0,
            fireResult
        });
    }

    _updateProjectiles(delta) {
        for (let i = this._projectiles.length - 1; i >= 0; i--) {
            const proj = this._projectiles[i];

            if (proj.gravity !== null) {
                proj.velocity.y -= proj.gravity * delta;
            }

            const stepVec = proj.velocity.clone().multiplyScalar(delta);
            const newPos = proj.mesh.position.clone().add(stepVec);
            const stepDist = stepVec.length();

            // Cast a ray for this frame's step to prevent tunneling
            const raycaster = new THREE.Raycaster(proj.mesh.position, proj.velocity.clone().normalize(), 0, stepDist);
            const intersects = raycaster.intersectObjects(this.scene.children, true);

            if (intersects.length > 0) {
                const intersection = intersects[0];

                if (this.callbacks.onExplosion) {
                    this.callbacks.onExplosion(
                        intersection.point,
                        proj.fireResult.splashRadius,
                        proj.fireResult.splashDamage
                    );
                }

                this._spawnImpactSplat(intersection.point, proj.def.visualFX);

                this.scene.remove(proj.mesh);
                proj.mesh.geometry.dispose();
                proj.mesh.material.dispose();
                this._projectiles.splice(i, 1);
                continue;
            }

            proj.mesh.position.copy(newPos);
            proj.distanceTravelled += stepDist;

            if (proj.distanceTravelled > 300) {
                this.scene.remove(proj.mesh);
                proj.mesh.geometry.dispose();
                proj.mesh.material.dispose();
                this._projectiles.splice(i, 1);
            }
        }
    }

    _spawnMuzzleFlash(position, visualFX) {
        const geometry = new THREE.PlaneGeometry(visualFX.muzzleScale, visualFX.muzzleScale);
        const material = new THREE.MeshBasicMaterial({
            color: visualFX.muzzleColor,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });

        const quad = new THREE.Mesh(geometry, material);
        quad.position.copy(position);

        // Billboard towards camera
        quad.quaternion.copy(this.camera.quaternion);

        // Random roll for visual variety
        quad.rotateZ(Math.random() * Math.PI * 2);

        this.scene.add(quad);

        setTimeout(() => {
            this.scene.remove(quad);
            geometry.dispose();
            material.dispose();
        }, 50);
    }

    _spawnTracer(from, to, visualFX) {
        const points = [from, to];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: visualFX.tracerColor,
            linewidth: visualFX.tracerWidth // Note: linewidth > 1 is largely unsupported in WebGL, might need a cylinder if thickness is critical
        });
        const line = new THREE.LineSegments(geometry, material);

        this.scene.add(line);

        setTimeout(() => {
            this.scene.remove(line);
            geometry.dispose();
            material.dispose();
        }, 80);
    }

    _spawnImpactSplat(position, visualFX) {
        const geometry = new THREE.PlaneGeometry(visualFX.impactScale, visualFX.impactScale);
        const material = new THREE.MeshBasicMaterial({
            color: visualFX.impactColor,
            transparent: true,
            depthWrite: false
        });

        const quad = new THREE.Mesh(geometry, material);
        quad.position.copy(position);

        // Add tiny offset along camera forward to avoid z-fighting on walls
        const camFwd = this.camera.getWorldDirection(new THREE.Vector3());
        quad.position.addScaledVector(camFwd, -0.05);

        // Billboard towards camera
        quad.quaternion.copy(this.camera.quaternion);

        this.scene.add(quad);

        setTimeout(() => {
            this.scene.remove(quad);
            geometry.dispose();
            material.dispose();
        }, 300);
    }

    // --- Input API ---

    onMouseDown() {
        if (!this.current) return;
        this.current.mechanics.onMouseDown();

        const cameraFwd = this.camera.getWorldDirection(new THREE.Vector3());
        const res = this.current.mechanics.tryFire(cameraFwd);
        this._processFire(res);
    }

    onMouseUp() {
        if (!this.current) return;
        this.current.mechanics.onMouseUp();
    }

    onKeyDown(key) {
        if (!this.current) return;
        const k = key.toLowerCase();

        if (k === '1') {
            this.equipSlot('primary');
        } else if (k === '2') {
            this.equipSlot('secondary');
        } else if (k === 'r') {
            this.startReload();
        }
    }

    startReload() {
        if (!this.current) return;
        const res = this.current.mechanics.startReload();
        if (res === 'started') {
            if (this.current.animations.reload) {
                this.current.animations.reload.reset().play();
            }
            if (this.callbacks.onReload) {
                this.callbacks.onReload(this.current.def, res);
            }
        }
    }

    setADS(isADS) {
        this.isADS = isADS;
        if (this.current) {
            this.current.mechanics.setADS(isADS);
        }
    }

    setMoving(isMoving) {
        if (this.current) {
            this.current.mechanics.setMoving(isMoving);
        }
    }

    getAmmoState() {
        if (!this.current) return null;
        const mechanicsState = this.current.mechanics.getState();
        return {
            ammo: mechanicsState.ammo,
            reserve: mechanicsState.reserve,
            slot: this.currentSlot,
            gunName: this.current.def.name
        };
    }
}
