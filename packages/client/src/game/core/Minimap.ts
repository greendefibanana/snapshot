import * as THREE from 'three';

interface MinimapOptions {
    sizePx?: number;
    viewHalfSize?: number;
    height?: number;
    zoom?: number;
}

export class Minimap {
    private static readonly MARKER_LAYER = 1;

    private renderer: THREE.WebGLRenderer;
    private camera: THREE.OrthographicCamera;
    private scene: THREE.Scene;
    private container: HTMLElement;
    private target = new THREE.Vector3();
    private entityMarkers: Map<number, THREE.Object3D> = new Map();
    private playerMarker: THREE.Object3D;

    private sizePx: number;
    private viewHalfSize: number;
    private height: number;

    constructor(scene: THREE.Scene, container: HTMLElement, options: MinimapOptions = {}) {
        this.scene = scene;
        this.container = container;

        const zoom = options.zoom ?? 2;
        this.sizePx = options.sizePx ?? 200;
        this.viewHalfSize = (options.viewHalfSize ?? 40) / zoom;
        this.height = options.height ?? 60;

        this.camera = new THREE.OrthographicCamera(
            -this.viewHalfSize,
            this.viewHalfSize,
            this.viewHalfSize,
            -this.viewHalfSize,
            0.1,
            500
        );
        // Keep north-up (negative Z) for a stable minimap orientation.
        this.camera.up.set(0, 0, -1);
        this.camera.position.set(0, this.height, 0);
        this.camera.lookAt(0, 0, 0);
        this.camera.layers.enable(0);
        this.camera.layers.enable(Minimap.MARKER_LAYER);

        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: true,
            powerPreference: 'low-power',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.sizePx, this.sizePx);
        this.renderer.setClearColor(0x0b0f1a, 0.35);

        const canvas = this.renderer.domElement;
        if (getComputedStyle(this.container).position === 'static') {
            this.container.style.position = 'relative';
        }
        canvas.style.position = 'absolute';
        canvas.style.top = '16px';
        canvas.style.right = '16px';
        canvas.style.width = `${this.sizePx}px`;
        canvas.style.height = `${this.sizePx}px`;
        canvas.style.border = '2px solid rgba(255, 255, 255, 0.2)';
        canvas.style.borderRadius = '50%';
        canvas.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.45)';
        canvas.style.pointerEvents = 'none';
        canvas.style.backgroundColor = 'rgba(7, 12, 20, 0.9)';
        canvas.style.backgroundImage = [
            'linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px)'
        ].join(',');
        canvas.style.backgroundSize = '16px 16px';

        this.container.appendChild(canvas);

        this.playerMarker = this.createPlayerMarker();
        this.scene.add(this.playerMarker);
    }

    updateTarget(position: THREE.Vector3): void {
        this.target.copy(position);
        this.camera.position.set(this.target.x, this.target.y + this.height, this.target.z);
        this.camera.lookAt(this.target);
    }

    render(): void {
        this.renderer.render(this.scene, this.camera);
    }

    setPlayerHeading(position: THREE.Vector3, yaw: number): void {
        this.playerMarker.position.set(position.x, position.y + 0.12, position.z);
        this.playerMarker.rotation.set(0, yaw, 0);
    }

    addEntityMarker(entityId: number, color: number): void {
        if (this.entityMarkers.has(entityId)) return;
        const marker = this.createTeamMarker(color);
        this.entityMarkers.set(entityId, marker);
        this.scene.add(marker);
    }

    updateEntityMarker(entityId: number, position: THREE.Vector3): void {
        const marker = this.entityMarkers.get(entityId);
        if (!marker) return;
        marker.position.set(position.x, position.y + 0.06, position.z);
    }

    removeEntityMarker(entityId: number): void {
        const marker = this.entityMarkers.get(entityId);
        if (!marker) return;
        this.scene.remove(marker);
        this.entityMarkers.delete(entityId);
    }

    resize(): void {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.sizePx, this.sizePx);
    }

    dispose(): void {
        this.scene.remove(this.playerMarker);
        this.disposeObject(this.playerMarker);
        for (const marker of this.entityMarkers.values()) {
            this.scene.remove(marker);
            this.disposeObject(marker);
        }
        this.entityMarkers.clear();
        this.renderer.dispose();
        if (this.container.contains(this.renderer.domElement)) {
            this.container.removeChild(this.renderer.domElement);
        }
    }

    private createPlayerMarker(): THREE.Object3D {
        const group = new THREE.Group();

        const shape = new THREE.Shape();
        shape.moveTo(0, 1.2);
        shape.lineTo(-0.7, -0.6);
        shape.lineTo(0, -0.2);
        shape.lineTo(0.7, -0.6);
        shape.closePath();

        const geometry = new THREE.ShapeGeometry(shape);
        geometry.rotateX(-Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false,
        });
        const arrow = new THREE.Mesh(geometry, material);
        arrow.layers.set(Minimap.MARKER_LAYER);
        arrow.renderOrder = 10;
        group.add(arrow);

        const dotGeometry = new THREE.CircleGeometry(0.25, 12);
        dotGeometry.rotateX(-Math.PI / 2);
        const dotMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false,
        });
        const dot = new THREE.Mesh(dotGeometry, dotMaterial);
        dot.layers.set(Minimap.MARKER_LAYER);
        dot.renderOrder = 11;
        group.add(dot);

        return group;
    }

    private createTeamMarker(color: number): THREE.Mesh {
        const geometry = new THREE.CircleGeometry(0.45, 14);
        geometry.rotateX(-Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.layers.set(Minimap.MARKER_LAYER);
        mesh.renderOrder = 9;
        return mesh;
    }

    private disposeObject(object: THREE.Object3D): void {
        object.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if ((mesh as any).isMesh) {
                if (mesh.geometry) {
                    mesh.geometry.dispose();
                }
                const material = mesh.material;
                if (Array.isArray(material)) {
                    for (const mat of material) {
                        mat.dispose();
                    }
                } else if (material) {
                    material.dispose();
                }
            }
        });
    }
}
