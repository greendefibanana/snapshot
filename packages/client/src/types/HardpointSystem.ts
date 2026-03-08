import * as THREE from 'three';

export type Team = 'blue' | 'red';

export interface Hardpoint {
    id: string;
    position: THREE.Vector3;
    radius: number;
    owner: Team | null;
    isContested: boolean;
    isActive: boolean;
    captureProgress: number;
    mesh: THREE.Object3D;
}

export interface HardpointPlayer {
    id: string;
    team: Team;
    isAlive: boolean;
    position: THREE.Vector3 | { x: number; y: number; z: number };
}
