import { describe, expect, it } from 'vitest';
import {
    ComponentType,
    applyDelta,
    calcSnapshotSize,
    deserializeInput,
    deserializeSnapshot,
    entityId,
    generateDelta,
    serializeInput,
    serializeSnapshot,
    tick,
    type Snapshot,
} from './index.js';

describe('Simulation serialization precision', () => {
    it('roundtrips InputFrame with angle and action precision', () => {
        const input = {
            tick: tick(1234),
            sequence: 777,
            movement: {
                forward: true,
                backward: false,
                left: true,
                right: false,
                jump: true,
                crouch: false,
                sprint: true,
                dodge: false,
            },
            aim: {
                yaw: 0.7891234,
                pitch: -0.456789,
            },
            primaryFire: true,
            secondaryFire: false,
            reload: true,
            tactical: false,
            ultimate: true,
            interact: false,
            weaponSlot: 2,
            clientTime: 1700000000.125,
        };

        const decoded = deserializeInput(serializeInput(input));
        expect(decoded.tick).toBe(input.tick);
        expect(decoded.sequence).toBe(input.sequence);
        expect(decoded.movement).toEqual(input.movement);
        expect(decoded.primaryFire).toBe(input.primaryFire);
        expect(decoded.reload).toBe(input.reload);
        expect(decoded.weaponSlot).toBe(input.weaponSlot);
        expect(decoded.clientTime).toBeCloseTo(input.clientTime, 6);
        expect(decoded.aim.yaw).toBeCloseTo(input.aim.yaw, 4);
        expect(decoded.aim.pitch).toBeCloseTo(input.aim.pitch, 4);
    });

    it('roundtrips Snapshot and preserves component fields within float precision', () => {
        const snapshot: Snapshot = {
            tick: tick(200),
            timestamp: 1700000000.875,
            entities: [
                {
                    id: entityId(1),
                    components:
                        ComponentType.Transform |
                        ComponentType.Physics |
                        ComponentType.Player |
                        ComponentType.Health |
                        ComponentType.Weapon |
                        ComponentType.Ability,
                    transform: {
                        position: { x: 12.3456, y: 7.8912, z: -3.4567 },
                        rotation: { x: 0.1234, y: -0.5678, z: 0.2222, w: 0.7777 },
                    },
                    physics: {
                        velocity: { x: 4.5678, y: -1.2345, z: 0.9876 },
                        isGrounded: true,
                    },
                    player: {
                        playerId: 'player-precision-test',
                        teamId: 2,
                        isAlive: true,
                        characterModelId: 'assasin',
                        lastProcessedInputTick: tick(198),
                    },
                    health: {
                        health: 87.6543,
                        maxHealth: 100,
                        shield: 22.3344,
                        maxShield: 50,
                    },
                    weapon: {
                        activeSlot: 1,
                        ammo: 18,
                        isReloading: false,
                        reloadEndTick: tick(0),
                        nextFireTick: tick(201),
                    },
                    ability: {
                        tacticalReadyTick: tick(230),
                        ultimateCharge: 54.321,
                    },
                },
            ],
            deletedEntityIds: [entityId(9), entityId(10)],
        };

        const bytes = serializeSnapshot(snapshot);
        expect(bytes.byteLength).toBe(calcSnapshotSize(snapshot));

        const decoded = deserializeSnapshot(bytes);
        expect(decoded.tick).toBe(snapshot.tick);
        expect(decoded.timestamp).toBe(snapshot.timestamp);
        expect(decoded.deletedEntityIds).toEqual(snapshot.deletedEntityIds);
        expect(decoded.entities.length).toBe(1);

        const e = decoded.entities[0]!;
        expect(e.components).toBe(snapshot.entities[0]!.components);
        expect(e.transform!.position.x).toBeCloseTo(snapshot.entities[0]!.transform!.position.x, 4);
        expect(e.transform!.position.y).toBeCloseTo(snapshot.entities[0]!.transform!.position.y, 4);
        expect(e.transform!.position.z).toBeCloseTo(snapshot.entities[0]!.transform!.position.z, 4);
        expect(e.transform!.rotation.w).toBeCloseTo(snapshot.entities[0]!.transform!.rotation.w, 4);
        expect(e.physics!.velocity.x).toBeCloseTo(snapshot.entities[0]!.physics!.velocity.x, 4);
        expect(e.health!.health).toBeCloseTo(snapshot.entities[0]!.health!.health, 4);
        expect(e.ability!.ultimateCharge).toBeCloseTo(snapshot.entities[0]!.ability!.ultimateCharge, 4);
        expect(e.player!.playerId).toBe(snapshot.entities[0]!.player!.playerId);
    });

    it('applies generated delta and matches target snapshot state', () => {
        const base: Snapshot = {
            tick: tick(300),
            timestamp: 1700000100,
            entities: [
                {
                    id: entityId(42),
                    components: ComponentType.Transform | ComponentType.Health,
                    transform: {
                        position: { x: 0, y: 0, z: 0 },
                        rotation: { x: 0, y: 0, z: 0, w: 1 },
                    },
                    health: {
                        health: 100,
                        maxHealth: 100,
                        shield: 50,
                        maxShield: 50,
                    },
                },
            ],
            deletedEntityIds: [],
        };

        const target: Snapshot = {
            tick: tick(301),
            timestamp: 1700000100.016,
            entities: [
                {
                    id: entityId(42),
                    components: ComponentType.Transform | ComponentType.Health,
                    transform: {
                        position: { x: 1.25, y: 0, z: -2.5 },
                        rotation: { x: 0, y: 0.707, z: 0, w: 0.707 },
                    },
                    health: {
                        health: 92.5,
                        maxHealth: 100,
                        shield: 40,
                        maxShield: 50,
                    },
                },
            ],
            deletedEntityIds: [],
        };

        const delta = generateDelta(base, target);
        expect(delta).toBeTruthy();

        const reconstructed = applyDelta(base, delta!);
        expect(reconstructed.tick).toBe(target.tick);
        expect(reconstructed.entities[0]!.transform!.position.x).toBeCloseTo(target.entities[0]!.transform!.position.x, 4);
        expect(reconstructed.entities[0]!.transform!.position.z).toBeCloseTo(target.entities[0]!.transform!.position.z, 4);
        expect(reconstructed.entities[0]!.health!.health).toBeCloseTo(target.entities[0]!.health!.health, 4);
        expect(reconstructed.entities[0]!.health!.shield).toBeCloseTo(target.entities[0]!.health!.shield, 4);
    });
});
