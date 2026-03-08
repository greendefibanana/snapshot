/**
 * Lobby Viewport — Standalone Three.js Character Renderer
 * 
 * Creates a cinematic character viewport for the lobby screen.
 * Independent renderer/scene — does NOT interfere with the game renderer.
 * 
 * Features:
 *   - Cinematic 3-point lighting (key, fill, rim)
 *   - Auto-rotate character with idle animation
 *   - Atmospheric particles + dark moody background
 *   - Hot-swap character models for carousel
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// =============================================================================
// CHARACTER MODEL PATHS (mirrors GameRenderer.getCharacterModelPath)
// =============================================================================

const CHARACTER_MODEL_PATHS: Record<string, string> = {
    assasin: '/models/characters/Assasin.glb',
    grizzly: '/models/characters/grizzly.glb',
    kodiak: '/models/characters/Kodiak.glb',
    panda: '/models/characters/Panda.glb',
};

/** All lobby-available characters (ones with actual GLB assets) */
export const LOBBY_CHARACTER_IDS = Object.keys(CHARACTER_MODEL_PATHS);

// =============================================================================
// LOBBY VIEWPORT CLASS
// =============================================================================

export class LobbyViewport {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private container: HTMLElement;
    private animationFrameId: number | null = null;
    private clock = new THREE.Clock();

    // Character state
    private currentModel: THREE.Object3D | null = null;
    private currentMixer: THREE.AnimationMixer | null = null;
    private currentCharacterId: string = '';
    private isLoading = false;
    private targetRotationY = 0;
    private autoRotateSpeed = 0.12; // rad/s

    // Particles
    private particles: THREE.Points | null = null;

    // Resize observer
    private resizeObserver: ResizeObserver;

    constructor(container: HTMLElement) {
        this.container = container;

        // ── Renderer ──
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.appendChild(this.renderer.domElement);

        // ── Scene ──
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x08080f);
        this.scene.fog = new THREE.FogExp2(0x08080f, 0.08);

        // ── Camera ──
        const aspect = container.clientWidth / container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 100);
        this.camera.position.set(0, 1.4, 3.8);
        this.camera.lookAt(0, 0.9, 0);

        // ── Lighting ──
        this.setupLighting();

        // ── Floor ──
        this.setupFloor();

        // ── Particles ──
        this.setupParticles();

        // ── Resize ──
        this.resizeObserver = new ResizeObserver(() => this.onResize());
        this.resizeObserver.observe(container);

        // ── Start loop ──
        this.animate();
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /** Load / swap character model by ID */
    setCharacter(characterId: string): void {
        const id = characterId.toLowerCase();
        if (id === this.currentCharacterId || this.isLoading) return;

        const path = CHARACTER_MODEL_PATHS[id];
        if (!path) {
            console.warn(`[LobbyViewport] Unknown character: ${id}`);
            return;
        }

        this.isLoading = true;

        // Remove old model
        if (this.currentModel) {
            this.scene.remove(this.currentModel);
            this.currentModel = null;
        }
        if (this.currentMixer) {
            this.currentMixer.stopAllAction();
            this.currentMixer = null;
        }

        const loader = new GLTFLoader();
        loader.load(
            path,
            (gltf) => {
                const model = gltf.scene;

                model.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                model.position.set(0, 0, 0);
                model.rotation.y = 0;
                this.scene.add(model);
                this.currentModel = model;
                this.currentCharacterId = id;
                this.targetRotationY = 0;

                // Setup animation
                if (gltf.animations.length > 0) {
                    this.currentMixer = new THREE.AnimationMixer(model);
                    // Prefer idle, fallback to first clip
                    const idleClip = gltf.animations.find(
                        (c) => c.name.toLowerCase() === 'idle'
                    );
                    const clipToPlay = idleClip ?? gltf.animations[0]!;

                    const action = this.currentMixer.clipAction(clipToPlay);
                    action.play();
                }

                this.isLoading = false;
            },
            undefined,
            (err) => {
                console.error(`[LobbyViewport] Failed to load ${path}:`, err);
                this.isLoading = false;
            }
        );
    }

    /** Get current character ID */
    getCharacterId(): string {
        return this.currentCharacterId;
    }

    /** Cleanup everything */
    dispose(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.resizeObserver.disconnect();

        if (this.currentMixer) {
            this.currentMixer.stopAllAction();
        }

        this.renderer.dispose();
        if (this.container.contains(this.renderer.domElement)) {
            this.container.removeChild(this.renderer.domElement);
        }
    }

    // =========================================================================
    // LIGHTING — Cinematic 3-Point
    // =========================================================================

    private setupLighting(): void {
        // Ambient — very low, keeps shadows from going pitch-black
        const ambient = new THREE.AmbientLight(0x1a1a2e, 0.3);
        this.scene.add(ambient);

        // KEY light — warm, slightly left-above
        const key = new THREE.DirectionalLight(0xffe4c4, 2.8);
        key.position.set(-2, 4, 3);
        key.castShadow = true;
        key.shadow.mapSize.setScalar(1024);
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far = 15;
        key.shadow.bias = -0.001;
        this.scene.add(key);

        // FILL light — cool, right side
        const fill = new THREE.DirectionalLight(0x6088a0, 0.8);
        fill.position.set(3, 2, 1);
        this.scene.add(fill);

        // RIM / BACK light — strong edge highlight from behind
        const rim = new THREE.DirectionalLight(0xff6b1a, 3.5);
        rim.position.set(0, 3, -4);
        this.scene.add(rim);

        // Subtle cyan accent from below-right
        const accent = new THREE.PointLight(0x00f0ff, 1.2, 8);
        accent.position.set(1.5, 0.3, 1);
        this.scene.add(accent);

        // Subtle orange accent from below-left
        const accent2 = new THREE.PointLight(0xff6b1a, 0.6, 6);
        accent2.position.set(-1.5, 0.1, 0.5);
        this.scene.add(accent2);
    }

    // =========================================================================
    // FLOOR
    // =========================================================================

    private setupFloor(): void {
        const geo = new THREE.CircleGeometry(4, 64);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x111118,
            roughness: 0.7,
            metalness: 0.4,
        });
        const floor = new THREE.Mesh(geo, mat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        floor.receiveShadow = true;
        this.scene.add(floor);

        // Subtle grid ring
        const ringGeo = new THREE.RingGeometry(1.8, 2.0, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff6b1a,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.005;
        this.scene.add(ring);

        // Inner subtle ring
        const ring2Geo = new THREE.RingGeometry(0.9, 1.0, 64);
        const ring2Mat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.08,
            side: THREE.DoubleSide,
        });
        const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
        ring2.rotation.x = -Math.PI / 2;
        ring2.position.y = 0.003;
        this.scene.add(ring2);
    }

    // =========================================================================
    // PARTICLES — Atmospheric Dust
    // =========================================================================

    private setupParticles(): void {
        const count = 120;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 6;
            positions[i * 3 + 1] = Math.random() * 4;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 6;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.PointsMaterial({
            color: 0xffa040,
            size: 0.03,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.particles = new THREE.Points(geo, mat);
        this.scene.add(this.particles);
    }

    // =========================================================================
    // ANIMATION LOOP
    // =========================================================================

    private animate = (): void => {
        this.animationFrameId = requestAnimationFrame(this.animate);

        const dt = this.clock.getDelta();
        const elapsed = this.clock.getElapsedTime();

        // Update mixer
        if (this.currentMixer) {
            this.currentMixer.update(dt);
        }

        // Auto-rotate character
        if (this.currentModel) {
            this.targetRotationY += this.autoRotateSpeed * dt;
            this.currentModel.rotation.y = this.targetRotationY;
            // Subtle breathing bob
            this.currentModel.position.y = Math.sin(elapsed * 1.2) * 0.008;
        }

        // Animate particles — slow drift upward
        if (this.particles) {
            const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
            for (let i = 0; i < pos.count; i++) {
                let y = pos.getY(i) + dt * 0.08;
                if (y > 4) y = 0;
                pos.setY(i, y);
                // Slight horizontal sway
                pos.setX(i, pos.getX(i) + Math.sin(elapsed + i) * dt * 0.01);
            }
            pos.needsUpdate = true;
        }

        // Render
        this.renderer.render(this.scene, this.camera);
    };

    // =========================================================================
    // RESIZE
    // =========================================================================

    private onResize(): void {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w === 0 || h === 0) return;

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }
}
