import { io } from 'socket.io-client';
import {
  BinaryMessageType,
  normalizeBinaryData,
  unwrapBinaryMessage,
  wrapBinaryMessage,
} from './packages/shared/dist/networking/BinaryProtocol.js';
import { serializeInput, tick } from './packages/shared/dist/simulation/index.js';

const url = process.env.SMOKE_URL || 'http://127.0.0.1:10000';
const timeoutMs = 20000;
const startedAt = Date.now();

const stats = {
  connected: false,
  lobbyState: false,
  pongRttMs: null,
  snapshots: 0,
  deltas: 0,
  serverEvents: 0,
  inputAcks: 0,
};

function fail(msg) {
  console.error(`[SMOKE FAIL] ${msg}`);
  process.exit(1);
}

const socket = io(url, {
  transports: ['websocket', 'polling'],
  reconnection: false,
  timeout: 5000,
});

const watchdog = setTimeout(() => {
  fail(`timeout after ${timeoutMs}ms; stats=${JSON.stringify(stats)}`);
}, timeoutMs);

socket.on('connect', () => {
  stats.connected = true;
  socket.emit('auth', { publicKey: 'smoke-wallet', displayName: 'SmokeUser' });
  socket.emit('get_lobby_state', {});

  const inputPayload = serializeInput({
    tick: tick(1),
    sequence: 1,
    movement: { forward: true, backward: false, left: false, right: false, jump: false, crouch: false, sprint: false, dodge: false },
    aim: { yaw: 0.1, pitch: -0.1 },
    primaryFire: false,
    secondaryFire: false,
    reload: false,
    tactical: false,
    ultimate: false,
    interact: false,
    weaponSlot: -1,
    clientTime: Date.now(),
  });
  socket.emit('bin', wrapBinaryMessage(BinaryMessageType.Input, inputPayload));

  const pingPayload = new ArrayBuffer(8);
  new DataView(pingPayload).setFloat64(0, Date.now(), true);
  socket.emit('bin', wrapBinaryMessage(BinaryMessageType.Ping, pingPayload));
});

socket.on('lobby_state', () => {
  stats.lobbyState = true;
});

socket.on('bin', (raw) => {
  const buffer = normalizeBinaryData(raw);
  if (!buffer) return;

  const { type, payload } = unwrapBinaryMessage(buffer);
  switch (type) {
    case BinaryMessageType.Snapshot:
      stats.snapshots += 1;
      break;
    case BinaryMessageType.Delta:
      stats.deltas += 1;
      break;
    case BinaryMessageType.ServerEvent:
      stats.serverEvents += 1;
      break;
    case BinaryMessageType.InputAck:
      stats.inputAcks += 1;
      break;
    case BinaryMessageType.Pong: {
      const sentAt = new DataView(payload).getFloat64(0, true);
      stats.pongRttMs = Date.now() - sentAt;
      break;
    }
  }

  const hasStateStream = stats.snapshots > 0 || stats.deltas > 0;
  const hasControlPlane = stats.lobbyState && typeof stats.pongRttMs === 'number';
  if (hasStateStream && hasControlPlane) {
    clearTimeout(watchdog);
    const elapsedMs = Date.now() - startedAt;
    console.log('[SMOKE PASS] live protocol check passed', {
      elapsedMs,
      ...stats,
      socketId: socket.id,
    });
    socket.disconnect();
    process.exit(0);
  }
});

socket.on('connect_error', (err) => {
  fail(`connect_error: ${err?.message || err}`);
});

socket.on('disconnect', (reason) => {
  if (!stats.connected) return;
  if (reason !== 'io client disconnect') {
    fail(`unexpected disconnect: ${reason}; stats=${JSON.stringify(stats)}`);
  }
});
