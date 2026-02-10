import { io } from 'socket.io-client';
import {
  BinaryMessageType,
  normalizeBinaryData,
  unwrapBinaryMessage,
  wrapBinaryMessage,
} from './packages/shared/dist/networking/BinaryProtocol.js';
import { serializeInput, tick } from './packages/shared/dist/simulation/index.js';

const url = process.env.SMOKE_URL || 'http://127.0.0.1:10000';
const timeoutMs = 30000;
const startedAt = Date.now();

const a = {
  connected: false,
  lobbyState: false,
  matchFound: false,
  matchStart: false,
  pongRttMs: null,
  snapshots: 0,
  deltas: 0,
  inputAcks: 0,
  serverEvents: 0,
};
const b = { connected: false, lobbyState: false, matchFound: false, matchStart: false };

function fail(msg) {
  console.error(`[MATCH SMOKE FAIL] ${msg}`);
  process.exit(1);
}

const s1 = io(url, { transports: ['websocket', 'polling'], reconnection: false, timeout: 5000 });
const s2 = io(url, { transports: ['websocket', 'polling'], reconnection: false, timeout: 5000 });

const watchdog = setTimeout(() => {
  fail(`timeout statsA=${JSON.stringify(a)} statsB=${JSON.stringify(b)}`);
}, timeoutMs);

function setupShared(socket, state, name) {
  socket.on('connect', () => {
    state.connected = true;
    socket.emit('auth', { publicKey: `${name}-wallet`, displayName: name });
    socket.emit('get_lobby_state', {});
    socket.emit('join_queue', { mode: '1v1', ruleset: 'casual' });
  });

  socket.on('lobby_state', () => { state.lobbyState = true; });
  socket.on('match_found', () => { state.matchFound = true; });
  socket.on('match_start', () => { state.matchStart = true; });

  socket.on('connect_error', (err) => fail(`${name} connect_error: ${err?.message || err}`));
}

setupShared(s1, a, 'SmokeA');
setupShared(s2, b, 'SmokeB');

let inputSeq = 1;
let inputTimer = null;
let pingSent = false;

s1.on('bin', (raw) => {
  const buffer = normalizeBinaryData(raw);
  if (!buffer) return;
  const { type, payload } = unwrapBinaryMessage(buffer);

  switch (type) {
    case BinaryMessageType.Snapshot: a.snapshots += 1; break;
    case BinaryMessageType.Delta: a.deltas += 1; break;
    case BinaryMessageType.InputAck: a.inputAcks += 1; break;
    case BinaryMessageType.ServerEvent: a.serverEvents += 1; break;
    case BinaryMessageType.Pong: {
      const sentAt = new DataView(payload).getFloat64(0, true);
      a.pongRttMs = Date.now() - sentAt;
      break;
    }
  }

  const readyToDrive = a.matchStart && b.matchStart;
  if (readyToDrive && !pingSent) {
    pingSent = true;
    const pingPayload = new ArrayBuffer(8);
    new DataView(pingPayload).setFloat64(0, Date.now(), true);
    s1.emit('bin', wrapBinaryMessage(BinaryMessageType.Ping, pingPayload));

    inputTimer = setInterval(() => {
      const input = serializeInput({
        tick: tick(inputSeq),
        sequence: inputSeq,
        movement: { forward: true, backward: false, left: false, right: false, jump: false, crouch: false, sprint: false, dodge: false },
        aim: { yaw: 0.15, pitch: -0.05 },
        primaryFire: false,
        secondaryFire: false,
        reload: false,
        tactical: false,
        ultimate: false,
        interact: false,
        weaponSlot: -1,
        clientTime: Date.now(),
      });
      s1.emit('bin', wrapBinaryMessage(BinaryMessageType.Input, input));
      inputSeq += 1;
    }, 40);
  }

  const pass =
    a.connected && b.connected &&
    a.lobbyState && b.lobbyState &&
    a.matchFound && b.matchFound &&
    a.matchStart && b.matchStart &&
    a.snapshots > 0 &&
    a.inputAcks > 0 &&
    typeof a.pongRttMs === 'number';

  if (pass) {
    clearTimeout(watchdog);
    if (inputTimer) clearInterval(inputTimer);
    const elapsedMs = Date.now() - startedAt;
    console.log('[MATCH SMOKE PASS] protocol+simulation check passed', {
      elapsedMs,
      a,
      b,
      socketA: s1.id,
      socketB: s2.id,
    });
    s1.disconnect();
    s2.disconnect();
    process.exit(0);
  }
});
