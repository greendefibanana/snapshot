/**
 * ZoneVFXManager — mesh-based pulsing zone indicators
 *
 * No scattered particles. Clean pulsing ring discs:
 *   - Active zone   → green (0x00ff88), pulsing opacity
 *   - Inactive zone → grey (0x444455), static dim
 *   - Drop marker   → simple glowing octahedron (handled by HardpointManager)
 */
import * as THREE from 'three';

type TeamOwner = 'blue' | 'red' | null;

const COLOR_ACTIVE = 0x00ff88; // green — active zone
const COLOR_INACTIVE = 0x444455; // grey  — inactive
const COLOR_BLUE = 0x1f7aff;
const COLOR_RED = 0xff3b30;
const COLOR_CONTESTED = 0xffcc00;

// ─── Per-zone bundle ───────────────────────────────────────────
interface ZoneBundle {
    disc: THREE.Mesh;             // filled circle on ground
    ring: THREE.Mesh;             // thin ring at perimeter
    discMat: THREE.MeshBasicMaterial;
    ringMat: THREE.MeshBasicMaterial;
    currentOwner: TeamOwner;
    isContested: boolean;
    isActive: boolean;
}

// ═══════════════════════════════════════════════════════════════
export class ZoneVFXManager {
    private readonly scene: THREE.Scene;
    private readonly zones = new Map<string, ZoneBundle>();
    private time = 0;
    private disposed = false;

    // Drop / extraction state (used by GameClient events)
    private currentDropLight: THREE.PointLight | null = null;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    // ─── PUBLIC API ─────────────────────────────────────────────

    /** Create ground-plane indicator for a hardpoint zone */
    createZoneVFX(id: string, position: { x: number; y: number; z: number }, radius: number): void {
        if (this.zones.has(id)) return;

        const y = position.y + 0.04; // slightly above floor

        // Filled disc (very translucent)
        const discGeo = new THREE.CircleGeometry(radius, 64);
        const discMat = new THREE.MeshBasicMaterial({
            color: COLOR_INACTIVE,
            transparent: true,
            opacity: 0.06,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
        });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(position.x, y, position.z);
        disc.renderOrder = 1200;
        this.scene.add(disc);

        // Perimeter ring (thin torus lying flat)
        const ringGeo = new THREE.RingGeometry(radius - 0.18, radius, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: COLOR_INACTIVE,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(position.x, y + 0.01, position.z);
        ring.renderOrder = 1250;
        this.scene.add(ring);

        this.zones.set(id, {
            disc, ring, discMat, ringMat,
            currentOwner: null,
            isContested: false,
            isActive: false,
        });
    }

    /** Sync zone visual state from game logic */
    updateZoneState(id: string, owner: TeamOwner, isContested: boolean, isActive: boolean): void {
        const z = this.zones.get(id);
        if (!z) return;
        if (z.currentOwner === owner && z.isContested === isContested && z.isActive === isActive) return;
        z.currentOwner = owner;
        z.isContested = isContested;
        z.isActive = isActive;

        let color: number;
        if (isContested) {
            color = COLOR_CONTESTED;
        } else if (owner === 'blue') {
            color = COLOR_BLUE;
        } else if (owner === 'red') {
            color = COLOR_RED;
        } else if (isActive) {
            color = COLOR_ACTIVE;
        } else {
            color = COLOR_INACTIVE;
        }

        z.discMat.color.setHex(color);
        z.ringMat.color.setHex(color);

        if (!isActive) {
            // Dim static look for inactive
            z.discMat.opacity = 0.04;
            z.ringMat.opacity = 0.18;
        }
    }

    /** Spawn drop VFX at position */
    createDropVFX(position: { x: number; y: number; z: number }, isGolden: boolean): void {
        this.removeDropVFX();
        const light = new THREE.PointLight(isGolden ? 0xffd700 : 0x00ffcc, 4, 14);
        light.position.set(position.x, position.y + 1.5, position.z);
        this.scene.add(light);
        this.currentDropLight = light;
    }

    removeDropVFX(): void {
        if (this.currentDropLight) {
            this.scene.remove(this.currentDropLight);
            this.currentDropLight = null;
        }
        this.stopExtractionVFX();
    }

    startExtractionVFX(_dropPos: { x: number; y: number; z: number }, _extractorPos: { x: number; y: number; z: number }): void {
        // No-op — kept for API compatibility
    }

    stopExtractionVFX(): void {
        // No-op — kept for API compatibility
    }

    triggerCaptureBurst(_position: { x: number; y: number; z: number }, _team: TeamOwner): void {
        // No-op — kept for API compatibility
    }

    /** Tick — call every frame with delta seconds */
    update(delta: number): void {
        if (this.disposed) return;
        this.time += delta;

        for (const [, z] of this.zones) {
            if (!z.isActive) continue;

            // Pulse: oscillate opacity between 0.08 and 0.22 (disc) and 0.4-0.9 (ring)
            const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.8);
            z.discMat.opacity = 0.055 + pulse * 0.10;
            z.ringMat.opacity = 0.45 + pulse * 0.45;

            // Contested: faster flash
            if (z.isContested) {
                const flash = 0.5 + 0.5 * Math.sin(this.time * 9);
                z.ringMat.opacity = 0.3 + flash * 0.65;
            }
        }

        // Pulse the drop point light
        if (this.currentDropLight) {
            this.currentDropLight.intensity = 2.5 + Math.sin(this.time * 4) * 1.5;
        }
    }

    /** Full cleanup */
    dispose(): void {
        this.disposed = true;
        this.removeDropVFX();
        for (const [, z] of this.zones) {
            this.scene.remove(z.disc);
            this.scene.remove(z.ring);
            z.discMat.dispose();
            z.ringMat.dispose();
            z.disc.geometry.dispose();
            z.ring.geometry.dispose();
        }
        this.zones.clear();
    }
}
