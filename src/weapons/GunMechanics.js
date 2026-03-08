import * as THREE from 'three';

export class GunMechanics {
    constructor(gunDef) {
        this.def = gunDef;
        this.ammo = gunDef.mechanics.magSize;
        this.reserve = gunDef.mechanics.reserveAmmo;
        this.isReloading = false;
        this.reloadTimer = 0;
        this.canFire = true;
        this.fireCooldown = 0;
        this.shotIndex = 0;
        this.recoilOffset = new THREE.Vector2();
        this.recoilTarget = new THREE.Vector2();
        this.pumpReady = true;
        this.boltReady = true;
        this.burstFiring = false;
        this.burstShotsFired = 0;
        this.mouseHeld = false;

        this.isADS = false;
        this.isMoving = false;
        this._autoFirePending = false;
        this.pendingBurstRays = [];
    }

    update(delta) {
        if (this.fireCooldown > 0) {
            this.fireCooldown -= delta;
            if (this.fireCooldown < 0) this.fireCooldown = 0;
        }

        if (this.fireCooldown === 0 && !this.canFire && !this.burstFiring) {
            this.canFire = true;
        }

        if (this.mouseHeld && this.canFire && this.def.mechanics.fireMode === 'auto') {
            this._autoFirePending = true;
        }

        if (this.isReloading) {
            this.reloadTimer -= delta;
            if (this.reloadTimer <= 0) {
                this._finishReload();
            }
        }

        const recoveryDist = delta * this.def.mechanics.recoilRecovery;
        const zeroVec = new THREE.Vector2(0, 0);
        this.recoilTarget.lerp(zeroVec, recoveryDist);
        this.recoilOffset.lerp(this.recoilTarget, 0.3);

        return {
            recoilX: this.recoilOffset.x,
            recoilY: this.recoilOffset.y,
            autoFire: this._autoFirePending
        };
    }

    tryFire(cameraDirection = new THREE.Vector3(0, 0, -1)) {
        if (this.isReloading) return null;
        if (this.ammo <= 0) {
            return { fired: false, reason: 'empty', ammo: 0, reserve: this.reserve };
        }
        if (!this.canFire) return null;

        const mode = this.def.mechanics.fireMode;
        if (mode === 'pump' && !this.pumpReady) return null;
        if (mode === 'bolt' && !this.boltReady) return null;
        if (mode === 'burst' && this.burstFiring) return null;

        this._consumeAmmo();
        this._applyRecoil();

        const rays = this._buildRays(cameraDirection);

        this.canFire = false;
        this.fireCooldown = 60 / this.def.mechanics.fireRate;
        this._autoFirePending = false;

        if (mode === 'pump') this._startPumpCycle();
        if (mode === 'bolt') this._startBoltCycle();
        if (mode === 'burst') this._startBurstCycle(cameraDirection);

        return {
            fired: true,
            fireMode: mode,
            rays: rays,
            damage: this.def.mechanics.damage,
            headshotMult: this.def.mechanics.headshotMult,
            isProjectile: this.def.mechanics.projectile,
            projectileSpeed: this.def.mechanics.bulletSpeed,
            projectileGravity: this.def.mechanics.gravity,
            splashDamage: this.def.mechanics.splashDamage,
            splashRadius: this.def.mechanics.splashRadius,
            ammoRemaining: this.ammo,
            reserveRemaining: this.reserve
        };
    }

    _buildRays(cameraDirection) {
        const rays = [];
        const count = this.def.mechanics.pellets || 1;

        let baseSpread = this.isADS
            ? this.def.mechanics.adsSpread
            : (this.def.mechanics.hipfireSpread !== null && this.def.mechanics.hipfireSpread !== undefined
                ? this.def.mechanics.hipfireSpread
                : this.def.mechanics.spread);

        if (this.isMoving) {
            baseSpread *= this.def.mechanics.moveSpreadMult;
        }

        const up = new THREE.Vector3(0, 1, 0);
        if (Math.abs(cameraDirection.y) > 0.99) {
            up.set(1, 0, 0);
        }

        const right = new THREE.Vector3().crossVectors(cameraDirection, up).normalize();
        const trueUp = new THREE.Vector3().crossVectors(right, cameraDirection).normalize();

        for (let i = 0; i < count; i++) {
            const r = Math.sqrt(Math.random()) * baseSpread;
            const theta = Math.random() * Math.PI * 2;

            const xOffset = r * Math.cos(theta);
            const yOffset = r * Math.sin(theta);

            const dir = cameraDirection.clone();
            dir.addScaledVector(right, xOffset);
            dir.addScaledVector(trueUp, yOffset);
            dir.normalize();

            rays.push({ direction: dir });
        }

        return rays;
    }

    _applyRecoil() {
        const pattern = this.def.mechanics.recoilPattern;
        if (!pattern || pattern.length === 0) return;

        const [x, y] = pattern[this.shotIndex % pattern.length];
        this.recoilTarget.add(new THREE.Vector2(x, y));
        this.shotIndex++;
    }

    _consumeAmmo() {
        this.ammo = Math.max(0, this.ammo - 1);
    }

    _startPumpCycle() {
        this.pumpReady = false;
        setTimeout(() => {
            this.pumpReady = true;
        }, this.def.mechanics.pumpTime * 1000);
    }

    _startBoltCycle() {
        this.boltReady = false;
        setTimeout(() => {
            this.boltReady = true;
        }, this.def.mechanics.boltTime * 1000);
    }

    _startBurstCycle(cameraDirection) {
        this.burstFiring = true;
        this.burstShotsFired = 1;

        const interval = setInterval(() => {
            if (this.ammo > 0) {
                this._consumeAmmo();
                this._applyRecoil();
                const rays = this._buildRays(cameraDirection);
                this.pendingBurstRays.push({
                    fired: true,
                    fireMode: 'burst',
                    rays: rays,
                    damage: this.def.mechanics.damage,
                    headshotMult: this.def.mechanics.headshotMult,
                    isProjectile: this.def.mechanics.projectile,
                    projectileSpeed: this.def.mechanics.bulletSpeed,
                    projectileGravity: this.def.mechanics.gravity,
                    splashDamage: this.def.mechanics.splashDamage,
                    splashRadius: this.def.mechanics.splashRadius,
                    ammoRemaining: this.ammo,
                    reserveRemaining: this.reserve
                });
                this.burstShotsFired++;
            }

            if (this.burstShotsFired >= this.def.mechanics.burstCount || this.ammo <= 0) {
                clearInterval(interval);
                setTimeout(() => {
                    this.burstFiring = false;
                    this.canFire = true;
                }, this.def.mechanics.burstCooldown * 1000);
            }
        }, this.def.mechanics.burstDelay * 1000);
    }

    startReload() {
        if (this.ammo === this.def.mechanics.magSize) return 'full';
        if (this.reserve <= 0) return 'no_reserve';

        this.isReloading = true;
        this.reloadTimer = this.def.mechanics.reloadTime;
        this.shotIndex = 0;
        return 'started';
    }

    _finishReload() {
        if (this.def.mechanics.reloadType === 'shell_by_shell') {
            this.ammo += 1;
            this.reserve -= 1;

            if (this.ammo < this.def.mechanics.magSize && this.reserve > 0) {
                this.reloadTimer = this.def.mechanics.reloadTime;
            } else {
                this.isReloading = false;
            }
        } else {
            const needed = this.def.mechanics.magSize - this.ammo;
            const given = Math.min(needed, this.reserve);
            this.ammo += given;
            this.reserve -= given;
            this.isReloading = false;
        }
    }

    cancelReload() {
        this.isReloading = false;
        this.reloadTimer = 0;
    }

    getState() {
        return {
            ammo: this.ammo,
            reserve: this.reserve,
            isReloading: this.isReloading,
            canFire: this.canFire,
            pumpReady: this.pumpReady,
            boltReady: this.boltReady,
            burstFiring: this.burstFiring,
            recoilOffset: { x: this.recoilOffset.x, y: this.recoilOffset.y }
        };
    }

    setADS(isADS) {
        this.isADS = isADS;
    }

    setMoving(isMoving) {
        this.isMoving = isMoving;
    }

    onMouseDown() {
        this.mouseHeld = true;
        if (this.def.mechanics.fireMode !== 'auto') {
            this.tryFire();
        } else {
            this._autoFirePending = true;
        }
    }

    onMouseUp() {
        this.mouseHeld = false;
        this._autoFirePending = false;
    }
}
