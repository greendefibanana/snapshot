import * as YUKA from 'yuka';
import * as THREE from 'three';
import { EnemyController } from './EnemyController';
import { BVHControllerConfig } from '../physics/BVHCharacterController';

export class AISystem {
    private entityManager: YUKA.EntityManager;
    private scene: THREE.Scene;
    private collider: THREE.Mesh | null = null;
    private enemies: EnemyController[] = [];

    // Shared references
    private playerPosition = new THREE.Vector3();

    constructor(scene: THREE.Scene) {
        this.entityManager = new YUKA.EntityManager();
        this.scene = scene;
    }

    setCollider(collider: THREE.Mesh) {
        this.collider = collider;
        for (const enemy of this.enemies) {
            enemy.setCollider(collider);
        }
    }

    spawnEnemy(
        position: THREE.Vector3,
        model: THREE.Object3D,
        config?: Partial<BVHControllerConfig>
    ) {
        // Clone model for this enemy
        const enemyModel = model.clone();
        enemyModel.traverse((c) => {
            if (c instanceof THREE.Mesh) {
                c.castShadow = true;
                c.receiveShadow = true;
            }
        });

        this.scene.add(enemyModel);

        const enemy = new EnemyController(position, enemyModel, config);

        if (this.collider) {
            enemy.setCollider(this.collider);
        }

        // Behavior: Seek Player
        // We create a generic target that we will update to player position
        const target = new YUKA.GameEntity();
        // We don't add target to manager, we just keep a ref to update it manually

        const seekBehavior = new YUKA.SeekBehavior(target.position);
        enemy.steering.add(seekBehavior);

        // Store metadata for updates
        (enemy as any)._targetEntity = target;

        this.entityManager.add(enemy);
        this.enemies.push(enemy);

        console.log('Spawned AI Enemy at', position);

        return enemy;
    }

    update(delta: number, playerPos: THREE.Vector3) {
        this.playerPosition.copy(playerPos);

        // Update all enemy targets to current player position
        for (const enemy of this.enemies) {
            const target = (enemy as any)._targetEntity;
            if (target) {
                target.position.set(playerPos.x, playerPos.y, playerPos.z);
            }
        }

        this.entityManager.update(delta);
    }
}
