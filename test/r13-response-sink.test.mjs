import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter, once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import { WebSocket } from 'ws';
import { ReferenceRelay } from '../out/relay-build/relay/reference-relay.js';
import { RelayClient, RESPONSE_HIGH_WATER_BYTES, RESPONSE_LOW_WATER_BYTES } from '../out/control-plane/relay-client.js';
import { HostIdentityManager } from '../out/control-plane/host-identity.js';
import { DeviceRegistry } from '../out/control-plane/device-registry.js';
import { InProcessRemoteAdapter } from '../out/control-plane/remote-dispatch.js';

function setup(t, daemon) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r13-sink-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const identity = new HostIdentityManager().ensureIdentity(path.join(dir, 'remote'));
  const deviceRegistry = new DeviceRegistry(path.join(dir, 'devices.json'));
  const { rawToken } = deviceRegistry.createDevice('Phone');
  return { identity, deviceRegistry, daemon, rawToken };
}
const requestFrame = (token, id = 'stream') => ({ t: 'req', id, method: 'GET', path: '/asset', headers: { cookie: `sl_dev=${token}` } });
const bytes = (frame) => frame.chunkB64 !== undefined ? Buffer.from(frame.chunkB64, 'base64') : Buffer.from(frame.chunk, 'utf8');

test('S1 binary PNG/WOFF2/WASM and split UTF-8 bytes survive the real ReferenceRelay', async (t) => {
  const fixtures = [
    Buffer.from('89504e470d0a1a0a0000ff80c328', 'hex'),
    Buffer.from('774f46320000ff80deadbeef', 'hex'),
    Buffer.from('0061736d0100000080ff', 'hex'),
    Buffer.from('before 😀 after', 'utf8')
  ];
  let fixture;
  const stack = setup(t, { async dispatchRemoteRequest(_req, res) {
    // Uint8Array subviews exercise byteOffset; split every byte of the emoji.
    for (let i = 0; i < fixture.length - 1; i++) res.write(new Uint8Array(fixture.buffer, fixture.byteOffset + i, 1));
    res.end(fixture.subarray(-1));
  } });
  const relay = new ReferenceRelay({ relayDomain: 'localhost' });
  const port = await relay.listen(0);
  const client = new RelayClient({ ...stack, relayUrl: `ws://127.0.0.1:${port}/tunnel/v1`, relayDomain: 'localhost' });
  try {
    await client.start();
    // Ping proves the relay accepted the hello, without a fixed sleep.
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('hello timeout')), 3000);
      const poll = () => {
        if (relay.isHostConnected(stack.identity.hostPublicId)) { clearTimeout(deadline); resolve(); }
        else setTimeout(poll, 5);
      };
      poll();
    });
    for (fixture of fixtures) {
      const received = await new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: '/asset', headers: {
          Host: `h-${stack.identity.hostPublicId}.localhost:${port}`, Cookie: `sl_dev=${stack.rawToken}`
        } }, (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        });
        req.on('error', reject);
      });
      assert.deepEqual(received, fixture);
    }
  } finally { await client.stop(); await relay.close(); }
});

class PacedSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
  bufferedAmount = 0;
  sent = [];
  callbacks = [];
  send(json, callback) {
    this.sent.push(JSON.parse(json));
    this.bufferedAmount += Buffer.byteLength(json);
    if (callback) this.callbacks.push(callback);
  }
  release() {
    this.bufferedAmount = 0;
    const callbacks = this.callbacks.splice(0);
    for (const callback of callbacks) callback();
  }
  close() { this.readyState = WebSocket.CLOSED; this.emit('close'); }
  terminate() { this.close(); }
}

test('S1 paced 20 MiB producer pauses at 2 MiB, drains at 1 MiB and preserves all bytes', async (t) => {
  const payload = Buffer.alloc(20 * 1024 * 1024);
  for (let i = 0; i < payload.length; i++) payload[i] = i % 251;
  let pauses = 0, maxQueue = 0, complete = false;
  let client;
  const stack = setup(t, { async dispatchRemoteRequest(_req, res) {
    for (let offset = 0; offset < payload.length; offset += 64 * 1024) {
      const accepted = res.write(payload.subarray(offset, offset + 64 * 1024));
      maxQueue = Math.max(maxQueue, client.stats.queuedBytes);
      if (!accepted) {
        pauses++;
        await once(res, 'drain');
        assert.ok(client.stats.queuedBytes <= RESPONSE_LOW_WATER_BYTES);
      }
    }
    res.end();
    complete = true;
  } });
  const socket = new PacedSocket();
  client = new RelayClient({ ...stack, relayUrl: 'ws://test', relayDomain: 'localhost', createSocket: () => socket });
  const started = client.start(); socket.emit('open'); await started;
  socket.emit('message', Buffer.from(JSON.stringify({ t: 'challenge', nonce: Buffer.alloc(32).toString('base64url') })));
  socket.emit('message', Buffer.from(JSON.stringify(requestFrame(stack.rawToken))));
  try {
    for (let i = 0; i < 1000 && (!complete || client.stats.queuedBytes); i++) {
      socket.release();
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(complete, true);
    assert.ok(pauses > 0);
    assert.ok(maxQueue >= RESPONSE_HIGH_WATER_BYTES);
    assert.ok(maxQueue <= RESPONSE_HIGH_WATER_BYTES + 90 * 1024, `${maxQueue} exceeds high water plus one frame`);
    assert.equal(client.stats.connected, true);
    assert.deepEqual(Buffer.concat(socket.sent.filter((f) => f.t === 'data').map(bytes)), payload);
  } finally { await client.stop(); }
});

test('S1 strings keep text frames and cancellation closes both surfaces exactly once', async (t) => {
  let req, res;
  const stack = setup(t, { async dispatchRemoteRequest(request, response) { req = request; res = response; res.write('data: 😀\n\n'); } });
  const adapter = new InProcessRemoteAdapter({ ...stack, expectedOrigin: 'https://h-test.localhost' });
  const frames = [];
  await adapter.dispatch(requestFrame(stack.rawToken), (f) => { frames.push(f); });
  assert.equal(frames.find((f) => f.t === 'data').chunk, 'data: 😀\n\n');
  let reqClosed = 0, resClosed = 0;
  req.once('close', () => reqClosed++); res.on('close', () => resClosed++);
  adapter.cancel('stream'); adapter.cancel('stream');
  assert.equal(reqClosed, 1); assert.equal(resClosed, 1);
  assert.equal(req.destroyed, true); assert.equal(res.destroyed, true);
  assert.equal(res.write('late'), false);
});

for (const termination of ['cancel', 'tunnel loss']) test(`S1 ${termination} closes request and response producers`, async (t) => {
  let req, res;
  const stack = setup(t, { async dispatchRemoteRequest(a, b) { req = a; res = b; b.write('SSE'); } });
  const socket = new PacedSocket();
  const client = new RelayClient({ ...stack, relayUrl: 'ws://test', relayDomain: 'localhost', createSocket: () => socket });
  const started = client.start(); socket.emit('open'); await started;
  socket.emit('message', Buffer.from(JSON.stringify({ t: 'challenge', nonce: Buffer.alloc(32).toString('base64url') })));
  socket.emit('message', Buffer.from(JSON.stringify(requestFrame(stack.rawToken))));
  const requestClosed = once(req, 'close'), responseClosed = once(res, 'close');
  if (termination === 'cancel') socket.emit('message', Buffer.from(JSON.stringify({ t: 'cancel', id: 'stream' })));
  else socket.terminate();
  await Promise.all([requestClosed, responseClosed]);
  assert.equal(client.stats.active, 0);
  await client.stop();
});
