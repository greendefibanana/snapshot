import {
  BinaryMessageType,
  wrapBinaryMessage,
  unwrapBinaryMessage,
  normalizeBinaryData,
} from './packages/shared/dist/networking/BinaryProtocol.js';

import {
  serializeInput,
  deserializeInput,
  serializeSnapshot,
  deserializeSnapshot,
  generateDelta,
  applyDelta,
  tick,
  entityId,
  ComponentType,
} from './packages/shared/dist/simulation/index.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertClose(actual, expected, epsilon, message) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: actual=${actual}, expected=${expected}, epsilon=${epsilon}`);
  }
}

const results = [];

{
  const payload = new Uint8Array([5, 10, 15, 20]).buffer;
  const wrapped = wrapBinaryMessage(BinaryMessageType.ServerEvent, payload);
  const decoded = unwrapBinaryMessage(wrapped);
  assert(decoded.type === BinaryMessageType.ServerEvent, 'Part1 type mismatch');
  const bytes = Array.from(new Uint8Array(decoded.payload));
  assert(JSON.stringify(bytes) === JSON.stringify([5, 10, 15, 20]), 'Part1 payload mismatch');
  results.push('Part1 envelope: PASS');
}

{
  const src = Uint8Array.from([1, 2, 3, 4]);
  const a = normalizeBinaryData(src);
  const b = normalizeBinaryData(Buffer.from(src));
  assert(a instanceof ArrayBuffer, 'Part2 typed array normalization failed');
  assert(b instanceof ArrayBuffer, 'Part2 buffer normalization failed');
  assert(JSON.stringify(Array.from(new Uint8Array(a))) === JSON.stringify([1,2,3,4]), 'Part2 typed array bytes mismatch');
  assert(JSON.stringify(Array.from(new Uint8Array(b))) === JSON.stringify([1,2,3,4]), 'Part2 buffer bytes mismatch');
  results.push('Part2 normalization: PASS');
}

{
  const input = {
    tick: tick(500),
    sequence: 123,
    movement: { forward: true, backward: false, left: true, right: false, jump: true, crouch: false, sprint: true, dodge: false },
    aim: { yaw: 1.23456, pitch: -0.34567 },
    primaryFire: true,
    secondaryFire: false,
    reload: true,
    tactical: false,
    ultimate: true,
    interact: false,
    weaponSlot: 2,
    clientTime: 1700000000.123,
  };
  const decoded = deserializeInput(serializeInput(input));
  assert(decoded.tick === input.tick, 'Part3 tick mismatch');
  assert(decoded.sequence === input.sequence, 'Part3 sequence mismatch');
  assert(decoded.weaponSlot === input.weaponSlot, 'Part3 weapon slot mismatch');
  assertClose(decoded.aim.yaw, input.aim.yaw, 1e-4, 'Part3 yaw precision');
  assertClose(decoded.aim.pitch, input.aim.pitch, 1e-4, 'Part3 pitch precision');
  assertClose(decoded.clientTime, input.clientTime, 1e-6, 'Part3 client time precision');
  results.push('Part3 input serialization precision: PASS');
}

{
  const snapshot = {
    tick: tick(600),
    timestamp: 1700001000.5,
    entities: [
      {
        id: entityId(7),
        components: ComponentType.Transform | ComponentType.Physics | ComponentType.Health,
        transform: { position: { x: 12.3456, y: 7.8912, z: -3.4567 }, rotation: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 } },
        physics: { velocity: { x: 4.5678, y: -1.2345, z: 0.9876 }, isGrounded: true },
        health: { health: 87.6543, maxHealth: 100, shield: 22.3344, maxShield: 50 },
      }
    ],
    deletedEntityIds: [entityId(9)],
  };
  const decoded = deserializeSnapshot(serializeSnapshot(snapshot));
  assert(decoded.tick === snapshot.tick, 'Part4 tick mismatch');
  assert(decoded.entities.length === 1, 'Part4 entity count mismatch');
  assertClose(decoded.entities[0].transform.position.x, snapshot.entities[0].transform.position.x, 1e-4, 'Part4 pos x precision');
  assertClose(decoded.entities[0].physics.velocity.y, snapshot.entities[0].physics.velocity.y, 1e-4, 'Part4 vel y precision');
  assertClose(decoded.entities[0].health.health, snapshot.entities[0].health.health, 1e-4, 'Part4 health precision');
  results.push('Part4 snapshot serialization precision: PASS');
}

{
  const base = {
    tick: tick(700),
    timestamp: 1700002000,
    entities: [
      {
        id: entityId(42),
        components: ComponentType.Transform | ComponentType.Health,
        transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
        health: { health: 100, maxHealth: 100, shield: 50, maxShield: 50 },
      }
    ],
    deletedEntityIds: [],
  };
  const target = {
    tick: tick(701),
    timestamp: 1700002000.016,
    entities: [
      {
        id: entityId(42),
        components: ComponentType.Transform | ComponentType.Health,
        transform: { position: { x: 1.25, y: 0, z: -2.5 }, rotation: { x: 0, y: 0.707, z: 0, w: 0.707 } },
        health: { health: 92.5, maxHealth: 100, shield: 40, maxShield: 50 },
      }
    ],
    deletedEntityIds: [],
  };
  const delta = generateDelta(base, target);
  assert(delta, 'Part5 delta generation returned null');
  const reconstructed = applyDelta(base, delta);
  assert(reconstructed.tick === target.tick, 'Part5 tick mismatch');
  assertClose(reconstructed.entities[0].transform.position.x, target.entities[0].transform.position.x, 1e-4, 'Part5 delta pos x precision');
  assertClose(reconstructed.entities[0].health.health, target.entities[0].health.health, 1e-4, 'Part5 delta health precision');
  results.push('Part5 delta apply precision: PASS');
}

console.log('Simulation precision harness results:');
for (const line of results) console.log(`- ${line}`);
console.log('OVERALL: PASS');
