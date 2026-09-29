/** R12 — Browser Preview V1: discovery, ownership, scheme allowlist, and browser projection. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  classifyListenerOwnership,
  detectPreviewCandidates,
  parsePreviewUrl,
  projectPreviewResolution,
  readPreviewDeclaration,
  resolveGamePreview
} from '../out/preview-discovery.js';

function game(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-game-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}
const viteGame = () => game({ 'package.json': { scripts: { dev: 'vite', build: 'vite build' } } });
const base = (rootFsPath, extra = {}) => ({ gameId: 'g1', stadiumId: 's1', rootFsPath, now: () => 1000, ...extra });
const alive = { ipv4: true, ipv6: false, protocol: 'http' };
const dead = { ipv4: false, ipv6: false };

test('P1: only plain http(s) URLs without credentials are accepted', () => {
  assert.equal(parsePreviewUrl('http://localhost:5173')?.href, 'http://localhost:5173/');
  assert.equal(parsePreviewUrl('https://app.example.test/')?.href, 'https://app.example.test/');
  for (const bad of ['javascript:alert(1)', 'file:///C:/x.html', 'vscode://x', 'ftp://h/', 'http://user:pw@localhost:1/', '', 42, 'not a url']) {
    assert.equal(parsePreviewUrl(bad), undefined, String(bad));
  }
});

test('P2: candidates come from the dev script, explicit ports first, framework defaults otherwise', () => {
  const vite = detectPreviewCandidates(viteGame());
  assert.equal(vite.framework, 'Vite');
  assert.equal(vite.devScript, 'dev');
  assert.deepEqual(vite.candidates.map((c) => c.port), [5173, 5174, 5175, 5176]);

  assert.deepEqual(detectPreviewCandidates(game({ 'package.json': { scripts: { dev: 'vite --port 4000' } } })).candidates.map((c) => c.port), [4000]);
  assert.deepEqual(detectPreviewCandidates(game({
    'package.json': { scripts: { dev: 'vite' } },
    'vite.config.ts': 'export default { server: { port: 5555 } }'
  })).candidates.map((c) => c.port), [5555]);
  const next = detectPreviewCandidates(game({ 'package.json': { scripts: { dev: 'next dev -p 3100' } } }));
  assert.equal(next.framework, 'Next.js');
  assert.deepEqual(next.candidates.map((c) => c.port), [3100]);
  assert.equal(detectPreviewCandidates(game({ 'package.json': { scripts: { dev: 'next' } } })).framework, 'Next.js');
  assert.deepEqual(detectPreviewCandidates(game({ 'package.json': { scripts: { build: 'vite build', dev: 'vite build --watch' } } })).candidates, []);
  assert.deepEqual(detectPreviewCandidates(game({})).candidates, []);
});

test('P3: a declared previewUrl must be http(s); a refused declaration is reported, not ignored', async () => {
  const bad = game({ '.sideline/game.json': { gameId: 'g1', previewUrl: 'javascript:alert(1)' } });
  assert.deepEqual(readPreviewDeclaration(bad), { invalid: true });
  const result = await resolveGamePreview(base(bad, { probe: async () => alive }));
  assert.equal(result.available, false);
  assert.equal(result.reason, 'invalid-declaration');

  const declared = game({ '.sideline/game.json': { previewPort: 6100 }, 'package.json': { scripts: { dev: 'vite' } } });
  const probed = [];
  const ok = await resolveGamePreview(base(declared, { probe: async (port) => { probed.push(port); return alive; } }));
  assert.deepEqual(probed, [6100], 'a declaration beats detection');
  assert.equal(ok.endpoints[0].ownership, 'declared');
  assert.equal(ok.endpoints[0].localUrl, 'http://localhost:6100/');
});

test('P4: ownership — verified under the Game root, foreign only on positive evidence', () => {
  const exists = (p) => p.replace(/\\/g, '/').toLowerCase().endsWith('c:/games/a/package.json') || p.replace(/\\/g, '/').endsWith('/work/mono/package.json');
  assert.equal(classifyListenerOwnership('C:\\Games\\B', { commandLine: '"C:\\Program Files\\nodejs\\node.exe" C:\\games\\b\\node_modules\\vite\\bin\\vite.js' }, exists), 'verified');
  assert.equal(classifyListenerOwnership('C:\\Games\\B', { commandLine: 'node C:\\Games\\A\\node_modules\\vite\\bin\\vite.js' }, exists), 'foreign');
  assert.equal(classifyListenerOwnership('C:\\Games\\B', { commandLine: 'node C:\\Users\\dad\\AppData\\Roaming\\npm\\node_modules\\vite\\bin\\vite.js' }, exists), 'unknown', 'global install is not evidence');
  assert.equal(classifyListenerOwnership('/work/mono/apps/web', { commandLine: 'node /work/mono/node_modules/vite/bin/vite.js' }, exists), 'unknown', 'a hoisted ancestor is not foreign');
  assert.equal(classifyListenerOwnership('/work/b', { cwd: '/work/b/sub', commandLine: 'vite' }, exists), 'verified');
  assert.equal(classifyListenerOwnership('/work/b', undefined, exists), 'unknown');
});

test('P5: Game B is never handed Game A\'s server on 5173', async () => {
  const rootA = viteGame();
  const rootB = viteGame();
  const result = await resolveGamePreview(base(rootB, {
    probe: async (port) => (port === 5173 || port === 5174 ? alive : dead),
    inspectListener: async (port) => ({ commandLine: `node ${path.join(port === 5173 ? rootA : rootB, 'node_modules', 'vite', 'bin', 'vite.js')}` })
  }));
  assert.equal(result.available, true);
  assert.equal(result.endpoints[0].port, 5174);
  assert.equal(result.endpoints[0].ownership, 'verified');
  assert.equal(result.endpoints[0].label, 'Vite');
});

test('P6: an unprovable listener is offered as unverified; nothing running says how to start it', async () => {
  const root = viteGame();
  const unverified = await resolveGamePreview(base(root, { probe: async (port) => (port === 5173 ? alive : dead), inspectListener: async () => undefined }));
  assert.equal(unverified.endpoints[0].ownership, 'unverified');
  assert.equal(unverified.endpoints[0].primary, true);

  const none = await resolveGamePreview(base(root, { probe: async () => dead }));
  assert.deepEqual(none, { available: false, endpoints: [], reason: 'not-running', framework: 'Vite', devScript: 'dev' });
  const empty = await resolveGamePreview(base(game({}), { probe: async () => alive }));
  assert.equal(empty.reason, 'no-web-app');
});

test('P7: the client-URL bridge is injected; bad mappings fall back; directTabOnly passes through', async () => {
  const root = viteGame();
  const opts = { probe: async (port) => (port === 5173 ? alive : dead), inspectListener: async () => undefined };
  const forwarded = await resolveGamePreview(base(root, { ...opts, toClientUrl: async () => ({ url: 'http://localhost:61234/' }) }));
  assert.equal(forwarded.endpoints[0].localUrl, 'http://localhost:5173/');
  assert.equal(forwarded.endpoints[0].clientUrl, 'http://localhost:61234/');
  assert.equal(forwarded.endpoints[0].loopbackIpv4, undefined, 'a forwarded URL says nothing about this listener');

  const future = await resolveGamePreview(base(root, { ...opts, toClientUrl: async () => ({ url: 'https://5173-cs-abc.cloudshell.dev/', directTabOnly: true }) }));
  assert.equal(future.endpoints[0].directTabOnly, true);

  const hostile = await resolveGamePreview(base(root, { ...opts, toClientUrl: async () => ({ url: 'javascript:alert(1)' }) }));
  assert.equal(hostile.endpoints[0].clientUrl, 'http://localhost:5173/');
  assert.equal(hostile.endpoints[0].loopbackIpv4, true);
});

test('P8: an IPv6-only listener is found through the real probe', async (t) => {
  const server = http.createServer((_req, res) => res.end('ok'));
  try {
    await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '::1', resolveListen); });
  } catch {
    t.skip('IPv6 loopback unavailable');
    return;
  }
  try {
    const port = server.address().port;
    const root = game({ '.sideline/game.json': { previewPort: port } });
    const result = await resolveGamePreview(base(root));
    assert.equal(result.available, true);
    assert.equal(result.endpoints[0].localUrl, `http://localhost:${port}/`);
    assert.equal(result.endpoints[0].loopbackIpv4, undefined);
  } finally {
    server.close();
  }
});

test('P9: the browser projection is rebuilt from an allowlist and refuses anything it cannot trust', () => {
  const endpoint = {
    previewId: 'g1:s1:5173', gameId: 'g1', stadiumId: 's1', localUrl: 'http://localhost:5173/', clientUrl: 'http://localhost:5173/',
    port: 5173, protocol: 'http', source: 'detected', ownership: 'verified', label: 'Vite', primary: true, observedAt: 5, rootFsPath: 'C:\\secret'
  };
  const projected = projectPreviewResolution('g1', { success: true, gameId: 'g1', available: true, endpoints: [endpoint], framework: 'Vite', devScript: 'dev', extra: 1 });
  assert.deepEqual(projected, {
    success: true, gameId: 'g1', available: true, framework: 'Vite', devScript: 'dev',
    endpoints: [{ previewId: 'g1:s1:5173', gameId: 'g1', clientUrl: 'http://localhost:5173/', port: 5173, protocol: 'http', source: 'detected', ownership: 'verified', label: 'Vite', primary: true, observedAt: 5 }]
  });
  assert.throws(() => projectPreviewResolution('g1', { success: true, available: true, endpoints: [{ ...endpoint, clientUrl: 'javascript:alert(1)' }] }));
  assert.throws(() => projectPreviewResolution('g1', { success: true, available: true, endpoints: [{ ...endpoint, gameId: 'other' }] }));
  assert.throws(() => projectPreviewResolution('g1', { success: true, available: false, reason: 'made-up' }));
  assert.deepEqual(projectPreviewResolution('g1', { success: true, available: false, reason: 'not-running', devScript: 'rm -rf /' }), {
    success: true, gameId: 'g1', available: false, endpoints: [], reason: 'not-running'
  });
});
