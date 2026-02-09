/**
 * Game Renderer - Three.js Setup
 * 
 * Handles Three.js scene, camera, renderer, and entity visualization.
 * Uses placeholder meshes for development.
 * 
 * EXTENSION POINT: Replace placeholders with real assets.
 */

import * as THREE from 'three';
import type {
    EntityId,
    Vector3,
    Quaternion,
    Species,
} from '@snapshot/shared';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Minimap } from './Minimap';

// =============================================================================
// TYPES
// =============================================================================

export interface RendererConfig {
    /** Target DOM element or canvas */
    container: HTMLElement;
    /** Initial camera position */
    cameraPosition?: Vector3;
    /** Enable shadows */
    shadows?: boolean;
    /** Pixel ratio */
    pixelRatio?: number;
    /** Callback when map is loaded */
    onMapLoaded?: (mesh: THREE.Object3D) => void;
}

export interface EntityVisual {
    mesh: THREE.Object3D;
    mixer?: THREE.AnimationMixer;
    outline?: THREE.LineSegments;
    attachments?: {
        gunHolder: THREE.Object3D;
        handBone: THREE.Object3D;
        gripPoint?: THREE.Object3D;
        nozzle?: THREE.Object3D;
    };
    aimState?: {
        isAiming: boolean;
        locomotionAnim: string; // The underlying movement animation
    };
    aimOverlay?: {
        active: boolean;
        animationName: string;
        weight: number;
    };
    overlayAction?: {
        animationName: string;
        untilMs: number;
        weight: number;
        loop: boolean;
        clamp: boolean;
    };
    overrideAction?: {
        animationName: string;
        untilMs: number | null;
        priority: number;
        loop: boolean;
        clamp: boolean;
    };
}

// =============================================================================
// GAME RENDERER CLASS
// =============================================================================

export class GameRenderer {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private container: HTMLElement;
    private minimap: Minimap;
    private minimapLocalEntityId: EntityId | null = null;
    private networkWorldRoot: THREE.Group;
    private readonly overlaySuffix = '__Upper';

    /** Entity meshes by entity ID */
    private entityVisuals: Map<number, EntityVisual> = new Map();

    /**
     * Check if an entity visual exists.
     */
    hasEntityVisual(entityId: EntityId): boolean {
        return this.entityVisuals.has(entityId as any);
    }

    /** Shared geometries for reuse */
    private geometries = {
        player: new THREE.CapsuleGeometry(0.4, 1.2, 8, 16),
        projectile: new THREE.SphereGeometry(0.1, 8, 8),
        ground: new THREE.PlaneGeometry(100, 100),
        box: new THREE.BoxGeometry(1, 1, 1),
    };

    /** Species-specific materials */
    private speciesMaterials: Record<Species, THREE.Material> = {
        urshari: new THREE.MeshStandardMaterial({ color: 0x8B4513 }), // Brown
        aeonids: new THREE.MeshStandardMaterial({ color: 0x4169E1 }), // Blue
        vexis: new THREE.MeshStandardMaterial({ color: 0x228B22 }),   // Green
        khaurans: new THREE.MeshStandardMaterial({ color: 0xB22222 }), // Red
        zynni: new THREE.MeshStandardMaterial({ color: 0x808080 }),    // Gray
    };

    /** Team-based materials */
    private teamMaterials = {
        team1: new THREE.MeshStandardMaterial({ color: 0x3498db, emissive: 0x1a4f7a }),
        team2: new THREE.MeshStandardMaterial({ color: 0xe74c3c, emissive: 0x7a1a1a }),
        neutral: new THREE.MeshStandardMaterial({ color: 0x95a5a6 }),
        projectile: new THREE.MeshStandardMaterial({
            color: 0xffff00,
            emissive: 0xffaa00,
            transparent: true,
            opacity: 0.8,
        }),
    };

    constructor(config: RendererConfig) {
        this.container = config.container;

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
        });

        this.renderer.setSize(
            config.container.clientWidth,
            config.container.clientHeight
        );
        this.renderer.setPixelRatio(config.pixelRatio ?? Math.min(window.devicePixelRatio, 2));

        if (config.shadows) {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }

        config.container.appendChild(this.renderer.domElement);

        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        this.scene.fog = new THREE.Fog(0x1a1a2e, 50, 150);
        this.networkWorldRoot = new THREE.Group();
        this.networkWorldRoot.position.set(0, 0, 0);
        this.networkWorldRoot.rotation.set(0, 0, 0);
        this.networkWorldRoot.scale.set(1, 1, 1);
        this.scene.add(this.networkWorldRoot);

        // Create camera
        const aspect = config.container.clientWidth / config.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);

        const camPos = config.cameraPosition ?? { x: 0, y: 5, z: 10 };
        this.camera.position.set(camPos.x, camPos.y, camPos.z);
        this.camera.lookAt(0, 0, 0);

        // Setup scene
        this.setupLighting();
        this.setupEnvironment(config.onMapLoaded);

        this.minimap = new Minimap(this.scene, this.container);

        // Handle resize
        window.addEventListener('resize', () => this.onResize());
    }

    /**
     * Get the Three.js camera.
     */
    get mainCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }

    /**
     * Get the Three.js scene.
     */
    get mainScene(): THREE.Scene {
        return this.scene;
    }

    /**
     * Get the canvas element.
     */
    get canvas(): HTMLCanvasElement {
        return this.renderer.domElement;
    }

    /**
     * Setup scene lighting.
     */
    private setupLighting(): void {
        // Ambient light - bright enough to see details
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        // Main directional light (sun)
        const sunPosition = new THREE.Vector3(50, 80, -50);
        const sun = new THREE.DirectionalLight(0xffffff, 3.5); // Bright White, High Intensity
        sun.position.copy(sunPosition);
        sun.lookAt(0, 0, 0);
        sun.castShadow = true;

        // Optimize shadow map
        sun.shadow.mapSize.width = 4096;
        sun.shadow.mapSize.height = 4096;
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 200;
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        sun.shadow.bias = -0.0005;

        this.scene.add(sun);

        // --- SUPER HOT SUN VISUAL (WHITE) ---
        const sunGeometry = new THREE.SphereGeometry(15, 32, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff, // Pure White
        });
        const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
        sunMesh.position.copy(sunPosition);

        // Add glow/halo effect (White/Blue tint)
        const haloGeometry = new THREE.SphereGeometry(18, 32, 32);
        const haloMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide
        });
        const haloMesh = new THREE.Mesh(haloGeometry, haloMaterial);
        sunMesh.add(haloMesh);

        this.scene.add(sunMesh);

        // Update Hemisphere light to be bright and neutral
        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0); // White Sky / Dark Grey Ground
        this.scene.add(hemi);
    }

    /**
     * Setup basic environment with a floor and the map.
     */
    private setupEnvironment(onMapLoaded?: (mesh: THREE.Object3D) => void): void {
        const loader = new GLTFLoader();
        loader.load('/models/Map2.glb', (gltf) => {
            const model = gltf.scene;
            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            // Position map slightly above our new floor if needed, or integrated
            model.position.y = 0.1;
            model.scale.set(3, 3, 3);
            model.updateMatrixWorld(true);
            this.scene.add(model);
            console.log('GameRenderer: Map2.glb loaded');
            onMapLoaded?.(model);
        }, undefined, (error) => {
            console.error('GameRenderer: Error loading Map2.glb', error);
        });

        // --- GROUND PLANE ---
        // Large dark floor to define the arena boundary
        const planeGeometry = new THREE.PlaneGeometry(200, 200);
        const planeMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.8,
            metalness: 0.2
        });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        this.scene.add(plane);

        // --- GRID HELPER ---
        // Cyber-style grid for orientation
        const gridHelper = new THREE.GridHelper(200, 100, 0x3498db, 0x2c3e50);
        gridHelper.position.y = 0.01; // Slightly above floor to prevent Z-fighting
        this.scene.add(gridHelper);

        // --- FOG ---
        // Update fog to blend with the sky
        const skyColor = 0x87CEEB;
        this.scene.fog = new THREE.Fog(skyColor, 50, 200);
        this.scene.background = new THREE.Color(skyColor);
    }

    // Removed createArenaWalls method


    /**
     * Create a player visual.
     */
    /**
     * Create a player visual.
     */
    createPlayerVisual(
        entityId: EntityId,
        _species: Species,
        _teamId: number
    ): void {
        if (this.entityVisuals.has(entityId as any)) {
            return;
        }
        // Container group
        const group = new THREE.Group();
        group.name = 'PlayerVisual';
        this.networkWorldRoot.add(group);

        const visual: EntityVisual = {
            mesh: group,
            aimState: { isAiming: false, locomotionAnim: 'idle' },
            aimOverlay: { active: false, animationName: 'Pistol Walk', weight: 0.85 },
        };
        this.entityVisuals.set(entityId, visual);

        if (this.minimapLocalEntityId !== entityId) {
            this.minimap.addEntityMarker(entityId as any, this.getTeamColor(_teamId));
        }

        // Load Character model
        const loader = new GLTFLoader();
        loader.load('/models/characters/Assasin.glb', (gltf) => {
            const model = gltf.scene;
            console.log('Loaded character model', model);
            console.log('Available animations:', gltf.animations.map(a => a.name));

            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Center the model vertically (assuming origin is at feet)
            model.position.y = 0;
            model.rotation.y = 0;

            group.add(model);

            // Setup animation mixer if animations exist
            if (gltf.animations.length > 0) {
                visual.mixer = new THREE.AnimationMixer(model);

                // Store animations in userData for later access
                (group as any).animations = {};
                for (const clip of gltf.animations) {
                    const cleanedClip = this.stripRootMotion(clip);
                    const action = visual.mixer.clipAction(cleanedClip);

                    if (clip.name === 'Death') {
                        action.setLoop(THREE.LoopOnce, 1);
                        action.clampWhenFinished = true;
                    }

                    if (clip.name === 'Hit React' || clip.name === 'Pistol Aim') {
                        action.setLoop(THREE.LoopOnce, 1);
                        action.clampWhenFinished = false;
                    }

                    (group as any).animations[clip.name] = action;

                    // Create upper-body overlay clips for aim/hit reactions
                    if (clip.name === 'Pistol Walk' || clip.name === 'Hit React' || clip.name === 'Pistol Aim' || clip.name === 'Grabbing Ammo') {
                        const upperClip = this.createUpperBodyClip(cleanedClip);
                        if (upperClip) {
                            const upperAction = visual.mixer.clipAction(upperClip);
                            upperAction.enabled = true;
                            (group as any).animations[upperClip.name] = upperAction;
                        }
                    }
                }

                // Fallback: use Pistol Aim if Pistol Walk isn't available
                if (visual.aimOverlay) {
                    const animMap = (group as any).animations as Record<string, THREE.AnimationAction>;
                    if (!animMap['Pistol Walk'] && animMap['Pistol Aim']) {
                        visual.aimOverlay.animationName = 'Pistol Aim';
                    }
                }

                // Play idle by default
                const idleAction = (group as any).animations['idle'];
                if (idleAction) {
                    idleAction.play();
                }
            }

            // --- ATTACH GUN ---
            // Find hand bone
            let handBone: THREE.Object3D | null = null;

            console.log('--- Character Node Hierarchy ---');
            model.traverse((child) => {
                // Log all nodes to find the correct bone name
                console.log('Node:', child.name, child.type);
                if (child.name === 'socket_righthand' || child.name === 'Socket_Righthand') {
                    handBone = child;
                }
            });
            console.log('-------------------------------');

            if (handBone) {
                const targetHand = handBone as THREE.Object3D;
                console.log('Found hand bone:', targetHand.name);

                // Load Gun
                const gunLoader = new GLTFLoader();
                gunLoader.load('/models/smg1.glb', (gunGltf) => {
                    const gunModel = gunGltf.scene;

                    // DEBUG: Log gun details
                    console.log('Gun loaded:', gunModel);
                    console.log('Gun children count:', gunModel.children.length);

                    // Find grip point
                    let gripPoint: THREE.Object3D | null = null;
                    let nozzle: THREE.Object3D | null = null;

                    gunModel.traverse((child) => {
                        if (child.name === 'Grip') {
                            gripPoint = child;
                        }
                        // Check for Nozzle/Muzzle (case insensitive)
                        const nameLower = child.name.toLowerCase();
                        if (nameLower === 'nozzle' || nameLower === 'muzzle' || nameLower === 'nuzzle') {
                            nozzle = child;
                            console.log('Found gun nozzle/muzzle:', child.name);
                        }
                    });

                    // Traverse and log everything + force visibility + debug material
                    gunModel.traverse((child) => {
                        console.log('Gun child:', child.type, child.name, 'visible:', child.visible);
                        if ((child as THREE.Mesh).isMesh) {
                            const mesh = child as THREE.Mesh;
                            console.log('  - Has geometry:', !!mesh.geometry);
                            console.log('  - Has material:', !!mesh.material);
                            if (mesh.geometry && mesh.geometry.attributes && mesh.geometry.attributes.position) {
                                console.log('  - Geometry vertices:', mesh.geometry.attributes.position.count);
                            }

                            // Log original material
                            if (mesh.material) {
                                const mat = mesh.material as THREE.Material;
                                console.log('Original material:', mat.type, 'opacity:', mat.opacity, 'transparent:', mat.transparent);
                            }

                            // FORCE RED MATERIAL FOR DEBUGGING
                            // mesh.material = new THREE.MeshBasicMaterial({
                            //     color: 0xff0000,
                            //     side: THREE.DoubleSide
                            // });

                            mesh.visible = true;
                            mesh.frustumCulled = false;
                            mesh.renderOrder = 999;

                            // console.log('Set bright red material on:', child.name);
                        }
                    });

                    // Force scale to 10,10,10 for testing
                    // gunModel.scale.set(10, 10, 10);
                    // console.log('Gun scale (forced 10x):', gunModel.scale);

                    // Log Hand World Position
                    const handWorldPos = new THREE.Vector3();
                    targetHand.getWorldPosition(handWorldPos);
                    console.log('Hand bone world position:', handWorldPos);

                    if (gripPoint) {
                        const targetGrip = gripPoint as THREE.Object3D;
                        console.log('Found gun grip:', targetGrip.name);
                        console.log('Grip position (local):', targetGrip.position);

                        // Calculate the inverse of the grip point's world matrix
                        // This matrix transforms from the grip's local space to world space.
                        // We want to transform the gun model (which is currently in its own local space)
                        // such that its grip point aligns with the hand bone's origin.
                        // So, we need to apply the inverse of the grip's world transform to the gun model.
                        // However, since the gun model will be a child of the hand bone,
                        // we need to calculate the transformation from the hand bone's local space
                        // to the grip point's local space.

                        // 1. Get the local matrix of the grip point relative to the gun model's root.
                        //    Since gripPoint is a child of gunModel, gripPoint.matrix is its local transform.
                        const gripLocalMatrix = targetGrip.matrix; // This is grip's transform relative to its parent (gunModel)

                        // 2. Invert this matrix. This will give us the transform to move the gun model
                        //    such that the grip point's local origin aligns with the gun model's local origin.
                        const inverseGripLocalMatrix = new THREE.Matrix4().copy(gripLocalMatrix).invert();

                        // MANUAL ATTACHMENT STRATEGY
                        console.log('Using manual attachment strategy with GunHolder');

                        // Create a holder for the gun in the scene
                        const gunHolder = new THREE.Object3D();
                        gunHolder.name = 'GunHolder';
                        this.scene.add(gunHolder);

                        // Add gun to holder
                        gunHolder.add(gunModel);

                        // Apply offset to gun within the holder so grip aligns with holder origin
                        // The holder will match the bone position/rotation
                        gunModel.applyMatrix4(inverseGripLocalMatrix);

                        // Ensure gun casts shadows
                        gunModel.traverse((child) => {
                            if ((child as THREE.Mesh).isMesh) {
                                child.castShadow = true;
                                child.receiveShadow = true;
                            }
                        });

                        // Store attachment info for manual sync in render loop
                        if (!visual.attachments) {
                            visual.attachments = {
                                gunHolder: gunHolder,
                                handBone: targetHand,
                                gripPoint: targetGrip
                            };
                            if (nozzle) {
                                visual.attachments.nozzle = nozzle;
                            }
                        } else {
                            visual.attachments.gunHolder = gunHolder;
                            visual.attachments.handBone = targetHand;
                            visual.attachments.gripPoint = targetGrip;
                            if (nozzle) {
                                visual.attachments.nozzle = nozzle;
                            }
                        }

                        console.log('Gun attached to GunHolder. Syncing in render loop.');

                    } else {
                        console.warn('Grip point not found. Attaching directly to hand (fallback).');
                        targetHand.add(gunModel);
                        gunModel.position.set(0, 0, 0);
                    }

                    // Remove debug test gun if it was added
                    // const testGun = this.scene.getObjectByName('TestGunGreen');
                    // if (testGun) {
                    //     this.scene.remove(testGun);
                    // }

                }, undefined, (err) => {
                    console.error('Failed to load smg1.glb', err);
                });
            } else {
                console.warn('Socket_Righthand not found in character model');
            }
        }, undefined, (error) => {
            console.error('Failed to load character.glb:', error);
        });
    }

    /**
     * Create a projectile visual.
     */
    createProjectileVisual(entityId: EntityId): void {
        const mesh = new THREE.Mesh(
            this.geometries.projectile,
            this.teamMaterials.projectile
        );
        mesh.castShadow = false;

        // Add trail effect
        const trail = new THREE.PointLight(0xffaa00, 0.5, 3);
        mesh.add(trail);

        this.scene.add(mesh);
        this.entityVisuals.set(entityId, { mesh });
    }

    /**
     * Update entity position and rotation.
     */
    updateEntityTransform(
        entityId: EntityId,
        position: Vector3,
        rotation: Quaternion
    ): void {
        const visual = this.entityVisuals.get(entityId);
        if (!visual) return;

        visual.mesh.position.set(position.x, position.y, position.z);
        visual.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
        this.minimap.updateEntityMarker(entityId as any, visual.mesh.position);
    }

    /**
     * Get entity position if visual exists.
     */
    getEntityPosition(entityId: EntityId): THREE.Vector3 | null {
        const visual = this.entityVisuals.get(entityId);
        if (!visual) return null;
        return visual.mesh.position.clone();
    }

    /**
     * Remove an entity visual.
     */
    removeEntityVisual(entityId: EntityId): void {
        const visual = this.entityVisuals.get(entityId);
        if (!visual) return;

        this.scene.remove(visual.mesh);
        this.entityVisuals.delete(entityId);
        this.minimap.removeEntityMarker(entityId as any);
    }

    /**
     * Get muzzle transform for an entity.
     */
    getMuzzleTransform(entityId: EntityId): { position: THREE.Vector3; direction: THREE.Vector3 } | null {
        const visual = this.entityVisuals.get(entityId);
        if (!visual || !visual.attachments || !visual.attachments.nozzle) return null;

        const nozzle = visual.attachments.nozzle;
        const position = new THREE.Vector3();
        const direction = new THREE.Vector3();

        nozzle.updateMatrixWorld(true);
        nozzle.getWorldPosition(position);
        nozzle.getWorldDirection(direction);

        return { position, direction };
    }

    /**
     * Create a tracer visual from start to end.
     */
    createTracer(start: THREE.Vector3, end: THREE.Vector3): void {
        const distance = start.distanceTo(end);

        // Splatoon-style vibrant tracer
        const geometry = new THREE.CylinderGeometry(0.04, 0.04, distance, 3, 1, false);
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, 0, distance / 2);

        // Random bright color (Cyan, Magenta, Yellow, Lime)
        const colors = [0x00ffff, 0xff00ff, 0xffff00, 0x00ff00];
        const color = colors[Math.floor(Math.random() * colors.length)];

        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(start);
        mesh.lookAt(end);

        this.scene.add(mesh);

        // Fast fade out
        const startTime = performance.now();
        const duration = 150; // ms

        const animateTrace = () => {
            const now = performance.now();
            const elapsed = now - startTime;
            if (elapsed > duration) {
                this.scene.remove(mesh);
                geometry.dispose();
                material.dispose();
                return;
            }

            const progress = elapsed / duration;
            material.opacity = 0.9 * (1 - progress);
            // Shrink thickness
            mesh.scale.setScalar(1 - progress);
            requestAnimationFrame(animateTrace);
        };
        requestAnimationFrame(animateTrace);
    }

    /**
     * Create a hit effect (sparks).
     */
    createHitEffect(position: THREE.Vector3, normal: THREE.Vector3): void {
        const particleCount = 8;
        const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff, // White center
            transparent: true
        });

        // Create particles
        const particles: { mesh: THREE.Mesh; velocity: THREE.Vector3 }[] = [];

        for (let i = 0; i < particleCount; i++) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(position);

            // Random velocity roughly along normal
            const velocity = normal.clone();
            velocity.x += (Math.random() - 0.5) * 2;
            velocity.y += (Math.random() - 0.5) * 2;
            velocity.z += (Math.random() - 0.5) * 2;
            velocity.normalize().multiplyScalar(5 + Math.random() * 5); // Fast burst

            this.scene.add(mesh);
            particles.push({ mesh, velocity });
        }

        const startTime = performance.now();
        const duration = 200;

        const animateParticles = () => {
            const now = performance.now();
            const elapsed = now - startTime;

            if (elapsed > duration) {
                particles.forEach(p => this.scene.remove(p.mesh));
                geometry.dispose();
                material.dispose();
                return;
            }

            const dt = 0.016; // Approx
            particles.forEach((p) => {
                p.mesh.position.addScaledVector(p.velocity, dt);
                p.mesh.scale.setScalar(1 - elapsed / duration);
            });

            requestAnimationFrame(animateParticles);
        };
        requestAnimationFrame(animateParticles);
    }

    /**
     * Show muzzle flash at the given position.
     */
    showMuzzleFlash(position: THREE.Vector3): void {
        const light = new THREE.PointLight(0xffaa00, 2, 5);
        light.position.copy(position);
        this.scene.add(light);

        // Optional: Add a sprite or mesh for visual flash
        // const geometry = new THREE.SphereGeometry(0.1, 8, 8);
        // const material = new THREE.MeshBasicMaterial({ color: 0xffffaa });
        // const mesh = new THREE.Mesh(geometry, material);
        // mesh.position.copy(position);
        // this.scene.add(mesh);

        setTimeout(() => {
            this.scene.remove(light);
            // this.scene.remove(mesh);
        }, 50);
    }

    updateAnimations(deltaTime: number): void {
        this.entityVisuals.forEach((visual) => {
            if (visual.mixer) {
                const nowMs = performance.now();
                const animations = (visual.mesh as any).animations as Record<string, THREE.AnimationAction> | undefined;
                if (!animations) {
                    visual.mixer.update(deltaTime);
                    return;
                }

                // 1) Override (Death)
                if (visual.overrideAction) {
                    const handled = this.applyOverrideAction(visual, nowMs);
                    if (handled) {
                        visual.mixer.update(deltaTime);
                        return;
                    }
                }

                // 2) Base locomotion
                const locomotionAnim = visual.aimState?.locomotionAnim ?? 'idle';
                this.playAnimationInternal(visual, locomotionAnim);

                // 3) Hit react overlay (short, higher priority than aim overlay)
                let hitReactActive = false;
                if (visual.overlayAction) {
                    if (nowMs < visual.overlayAction.untilMs) {
                        this.applyOverlayAction(
                            visual,
                            visual.overlayAction.animationName,
                            visual.overlayAction.weight,
                            visual.overlayAction.loop,
                            visual.overlayAction.clamp
                        );
                        hitReactActive = true;
                    } else {
                        this.stopOverlayAction(visual, visual.overlayAction.animationName);
                        visual.overlayAction = undefined;
                    }
                }

                // 4) Aim overlay (Pistol Walk upper-body)
                if (visual.aimOverlay && visual.aimState) {
                    const shouldAimOverlay =
                        visual.aimState.isAiming &&
                        !hitReactActive;

                    if (visual.aimOverlay.active !== shouldAimOverlay) {
                        visual.aimOverlay.active = shouldAimOverlay;
                        if (!shouldAimOverlay) {
                            this.stopOverlayAction(visual, visual.aimOverlay.animationName, true);
                        }
                    }

                    if (visual.aimOverlay.active) {
                        this.applyOverlayAction(
                            visual,
                            visual.aimOverlay.animationName,
                            visual.aimOverlay.weight,
                            true,
                            false,
                            true
                        );
                    }
                }

                visual.mixer.update(deltaTime);
            }
        });
    }

    /**
     * Set aiming state.
     */
    setAiming(entityId: EntityId, isAiming: boolean): void {
        const visual = this.entityVisuals.get(entityId);
        if (visual && visual.aimState) {
            visual.aimState.isAiming = isAiming;
        }
    }

    /**
     * Set entity rotation (Y-axis) directly.
     */
    setEntityRotation(entityId: EntityId, rotationY: number): void {
        const visual = this.entityVisuals.get(entityId);
        if (visual) {
            visual.mesh.rotation.y = rotationY;
        }
    }

    /**
     * Set animation for an entity (Locomotion).
     * This now sets the 'underlying' animation.
     */
    setAnimation(entityId: EntityId, animationName: string, crossfadeDuration: number = 0.2): void {
        const visual = this.entityVisuals.get(entityId);
        if (!visual || !visual.aimState) return;

        // Update intent
        visual.aimState.locomotionAnim = animationName;

        // Only apply immediately if we are NOT controlled by Aim logic
        const aimAction = (visual.mesh as any).animations?.['Pistol Aim'];
        const isAimingOrHolstering = aimAction && (visual.aimState.isAiming || aimAction.isRunning());

        if (!isAimingOrHolstering) {
            this.playAnimationInternal(visual, animationName, crossfadeDuration);
        }
    }

    /**
     * Play a short overlay animation (e.g., Hit React) without interrupting locomotion.
     */
    playOverlayAnimation(
        entityId: EntityId,
        animationName: string,
        durationMs: number,
        weight: number = 1,
        options?: { loop?: boolean; clamp?: boolean }
    ): void {
        const visual = this.entityVisuals.get(entityId);
        if (!visual || !visual.mixer) return;
        const nowMs = performance.now();
        visual.overlayAction = {
            animationName,
            untilMs: nowMs + Math.max(0, durationMs),
            weight,
            loop: options?.loop ?? false,
            clamp: options?.clamp ?? false,
        };

        // Kick immediately so the first frame shows the reaction
        this.applyOverlayAction(
            visual,
            animationName,
            visual.overlayAction.weight,
            visual.overlayAction.loop,
            visual.overlayAction.clamp
        );
    }

    /**
     * Play a high-priority override animation (e.g., Death).
     */
    playOverrideAnimation(
        entityId: EntityId,
        animationName: string,
        options?: { loop?: boolean; clamp?: boolean; durationMs?: number }
    ): void {
        const visual = this.entityVisuals.get(entityId);
        if (!visual || !visual.mixer) return;
        const nowMs = performance.now();
        visual.overrideAction = {
            animationName,
            untilMs: options?.durationMs ? nowMs + options.durationMs : null,
            priority: 100,
            loop: options?.loop ?? false,
            clamp: options?.clamp ?? true,
        };

        // Force stop aim overlay when overridden
        if (visual.aimOverlay?.active) {
            visual.aimOverlay.active = false;
            this.stopOverlayAction(visual, visual.aimOverlay.animationName, false);
        }

        this.applyOverrideAction(visual, nowMs);
    }

    /**
     * Clear a previously set override animation.
     */
    clearOverrideAnimation(entityId: EntityId): void {
        const visual = this.entityVisuals.get(entityId);
        if (!visual || !visual.overrideAction) return;
        const action = this.getAnimationAction(visual, visual.overrideAction.animationName);
        if (action) {
            action.stop();
            action.reset();
        }
        visual.overrideAction = undefined;
    }

    /**
     * Internal helper to actually play an animation on the mixer.
     */
    private playAnimationInternal(visual: EntityVisual, animationName: string, crossfadeDuration: number = 0.2): void {
        if (!visual.mixer) return;

        const animations = (visual.mesh as any).animations;
        if (!animations) return;

        const newAction = animations[animationName] as THREE.AnimationAction | undefined;
        if (!newAction) return;

        // Get current action
        const currentAction = (visual.mesh as any).currentAction as THREE.AnimationAction | undefined;

        // Don't do anything if same animation already playing
        if (currentAction === newAction && newAction.isRunning() && !newAction.paused) {
            return;
        }

        if (currentAction && currentAction !== newAction) {
            // Smooth crossfade
            newAction.reset();
            newAction.setEffectiveTimeScale(1);
            newAction.setEffectiveWeight(1);
            newAction.play();
            currentAction.crossFadeTo(newAction, crossfadeDuration, true);
        } else if (!currentAction || !newAction.isRunning()) {
            newAction.reset();
            newAction.play();
        }

        (visual.mesh as any).currentAction = newAction;
    }

    /**
     * Get available animations for an entity.
     */
    getAnimationNames(entityId: EntityId): string[] {
        const visual = this.entityVisuals.get(entityId);
        if (!visual) return [];

        const animations = (visual.mesh as any).animations;
        if (!animations) return [];

        return Object.keys(animations);
    }

    /**
     * Set camera to follow a target.
     */
    setCameraTarget(
        targetPosition: Vector3,
        yaw: number,
        pitch: number,
        distance: number = 8
    ): void {
        // Calculate camera position based on yaw/pitch
        const offsetX = Math.sin(yaw) * Math.cos(pitch) * distance;
        const offsetY = Math.sin(pitch) * distance + 2;
        const offsetZ = Math.cos(yaw) * Math.cos(pitch) * distance;

        this.camera.position.set(
            targetPosition.x + offsetX,
            targetPosition.y + offsetY,
            targetPosition.z + offsetZ
        );

        this.camera.lookAt(
            targetPosition.x,
            targetPosition.y + 1.5, // Look at head height
            targetPosition.z
        );
    }

    // ... (existing code) ...

    /**
     * Render a frame.
     */
    render(): void {
        // Update manual attachments
        for (const visual of this.entityVisuals.values()) {
            if (visual.attachments) {
                const { gunHolder, handBone } = visual.attachments;

                // Sync gunHolder to handBone world transform
                if (handBone && gunHolder) {
                    const params = {
                        pos: new THREE.Vector3(),
                        quat: new THREE.Quaternion(),
                        scale: new THREE.Vector3()
                    };

                    handBone.updateWorldMatrix(true, false);
                    handBone.matrixWorld.decompose(params.pos, params.quat, params.scale);

                    // CORRECTION: Rotate gun to point forward/downward
                    // The gun model is likely oriented 'up' by default, so we need to rotate it.
                    // 90 degrees on X-axis: Points the barrel down (flipped 180 from -90)
                    // 180 degrees on Y-axis: Mirrors/flips the gun horizontally
                    const correction = new THREE.Quaternion();
                    const euler = new THREE.Euler(Math.PI / 2, Math.PI, 0); // 90 deg X, 180 deg Y
                    correction.setFromEuler(euler);

                    // Apply correction relative to the hand's rotation
                    params.quat.multiply(correction);

                    gunHolder.position.copy(params.pos);
                    gunHolder.quaternion.copy(params.quat);
                    // We typically don't sync scale for weapons to avoid squashing, 
                    // or maybe we do if the character scales? keeping it simple for now.
                }
            }

            // Update animations if mixer exists
            if (visual.mixer) {
                // visual.mixer.update(delta); // We need delta time here...
                // For now assuming mixer is updated elsewhere or we need to add it.
                // Actually mixer update is usually done in GameLoop using updateAnimations()
                // which calls mixer.update(). We don't need to do it here.
            }
        }

        this.renderer.render(this.scene, this.camera);
        this.minimap.render();
    }

    private isMoveAnimation(name: string): boolean {
        const lower = name.toLowerCase();
        if (lower.includes('idle')) return false;
        if (lower.includes('jump') || lower.includes('fall')) return false;
        if (lower.includes('slide')) return false;
        return true;
    }

    private applyOverrideAction(visual: EntityVisual, nowMs: number): boolean {
        const override = visual.overrideAction;
        if (!override) return false;
        if (override.untilMs !== null && nowMs >= override.untilMs) {
            this.stopOverlayAction(visual, override.animationName);
            visual.overrideAction = undefined;
            return false;
        }

        const action = this.getAnimationAction(visual, override.animationName);
        if (!action) {
            visual.overrideAction = undefined;
            return false;
        }

        action.setLoop(override.loop ? THREE.LoopRepeat : THREE.LoopOnce, 1);
        action.clampWhenFinished = override.clamp;
        action.enabled = true;
        action.setEffectiveWeight(1);

        if (!action.isRunning()) {
            action.reset();
            action.play();
        }

        const currentAction = (visual.mesh as any).currentAction as THREE.AnimationAction | undefined;
        if (currentAction && currentAction !== action) {
            currentAction.crossFadeTo(action, 0.15, true);
        }
        (visual.mesh as any).currentAction = action;
        return true;
    }

    private applyOverlayAction(
        visual: EntityVisual,
        animationName: string,
        weight: number,
        loop: boolean,
        clamp: boolean,
        allowFullBody: boolean = true
    ): void {
        const action = this.resolveOverlayAction(visual, animationName, allowFullBody);
        if (!action) return;
        action.enabled = true;
        action.setEffectiveWeight(weight);
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, 1);
        action.clampWhenFinished = clamp;
        if (!action.isRunning()) {
            action.reset();
            action.play();
        }
    }

    private stopOverlayAction(visual: EntityVisual, animationName: string, allowFullBody: boolean = true): void {
        const action = this.resolveOverlayAction(visual, animationName, allowFullBody);
        if (!action) return;
        action.stop();
        action.reset();
    }

    private resolveOverlayAction(
        visual: EntityVisual,
        animationName: string,
        allowFullBody: boolean
    ): THREE.AnimationAction | null {
        const animations = (visual.mesh as any).animations as Record<string, THREE.AnimationAction> | undefined;
        if (!animations) return null;
        const upperName = `${animationName}${this.overlaySuffix}`;
        if (animations[upperName]) return animations[upperName];
        if (!allowFullBody) return null;
        return animations[animationName] ?? null;
    }

    private getAnimationAction(visual: EntityVisual, animationName: string): THREE.AnimationAction | null {
        const animations = (visual.mesh as any).animations as Record<string, THREE.AnimationAction> | undefined;
        if (!animations) return null;
        return animations[animationName] ?? null;
    }

    setMinimapTarget(position: THREE.Vector3, yaw?: number): void {
        if (!position) return;
        this.minimap.updateTarget(position);
        if (typeof yaw === 'number') {
            this.minimap.setPlayerHeading(position, yaw);
        }
    }

    private stripRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
        const tracks = clip.tracks.filter((track) => {
            const name = track.name.toLowerCase();
            if (!name.endsWith('.position')) return true;
            return !(name.includes('hips') || name.includes('mixamorig') || name.includes('root'));
        });
        if (tracks.length === clip.tracks.length) return clip;
        return new THREE.AnimationClip(clip.name, clip.duration, tracks);
    }

    private createUpperBodyClip(clip: THREE.AnimationClip): THREE.AnimationClip | null {
        const tracks = clip.tracks.filter((track) => this.isUpperBodyTrack(track.name));
        if (tracks.length === 0) return null;
        return new THREE.AnimationClip(`${clip.name}${this.overlaySuffix}`, clip.duration, tracks);
    }

    private isUpperBodyTrack(trackName: string): boolean {
        const name = trackName.toLowerCase();
        if (name.includes('hips') || name.includes('pelvis') || name.includes('thigh') || name.includes('calf') || name.includes('foot') || name.includes('toe') || name.includes('leg')) {
            return false;
        }
        return (
            name.includes('spine') ||
            name.includes('chest') ||
            name.includes('neck') ||
            name.includes('head') ||
            name.includes('shoulder') ||
            name.includes('clavicle') ||
            name.includes('arm') ||
            name.includes('forearm') ||
            name.includes('hand') ||
            name.includes('wrist') ||
            name.includes('elbow')
        );
    }

    setMinimapLocalEntityId(entityId: EntityId): void {
        this.minimapLocalEntityId = entityId;
        this.minimap.removeEntityMarker(entityId as any);
    }

    private getTeamColor(teamId: number): number {
        if (teamId === 1) return 0x3498db;
        if (teamId === 2) return 0xe74c3c;
        return 0x95a5a6;
    }

    /**
     * Handle window resize.
     */
    private onResize(): void {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.minimap.resize();
    }

    /**
     * Cleanup and dispose.
     */
    dispose(): void {
        // Remove resize listener
        window.removeEventListener('resize', () => this.onResize());

        // Dispose geometries
        Object.values(this.geometries).forEach(g => g.dispose());

        // Dispose materials
        Object.values(this.speciesMaterials).forEach(m => m.dispose());
        Object.values(this.teamMaterials).forEach(m => m.dispose());

        // Remove all entity visuals
        for (const [id] of this.entityVisuals) {
            this.removeEntityVisual(id as EntityId);
        }

        // Dispose renderer
        this.renderer.dispose();
        this.minimap.dispose();

        // Remove from DOM
        if (this.container.contains(this.renderer.domElement)) {
            this.container.removeChild(this.renderer.domElement);
        }
    }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createGameRenderer(config: RendererConfig): GameRenderer {
    return new GameRenderer(config);
}
