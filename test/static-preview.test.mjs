import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveGamePreview } from '../out/preview-discovery.js';
import { discoverStaticPreview, StaticPreviewServer } from '../out/static-preview.js';
import { StadiumClient } from '../out/stadium-client.js';

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-static-'));
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

function request(port, requestPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: requestPath, method }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

const dead = async () => ({ ipv4: false, ipv6: false });

test('SP-1: GS3 pages select root index as canonical and title-label three alternates', () => {
  const root = fixture({
    'index.html': '<title>Launchpad</title>', 'index2.html': '<title>Solo</title>',
    'index3.html': '<title>Grid</title>', 'settings.html': '<title>Settings</title>'
  });
  const result = discoverStaticPreview(root);
  assert.equal(result.canonical, 'index.html');
  assert.deepEqual(result.pages.map((page) => [page.path, page.label, page.primary]), [
    ['index.html', 'Launchpad', true], ['index2.html', 'Solo', false],
    ['index3.html', 'Grid', false], ['settings.html', 'Settings', false]
  ]);
});

test('SP-2: public/index.html is canonical; excluded/generated/secret trees are not inferred', () => {
  const root = fixture({
    'public/index.html': '<title>Public Home</title>', 'about.html': '',
    'node_modules/x.html': '', 'test/fixtures/canary.html': '', 'coverage/report.html': '',
    'REPORTS/a.html': '', '.hidden/secret.html': '', '.env.html': '', 'vendor/docs.html': '',
    'architecture-lab/demo/demo.html': '', 'secrets/private.html': '', 'dist/index.html': '', 'build/index.html': ''
  });
  const result = discoverStaticPreview(root);
  assert.equal(result.canonical, 'public/index.html');
  assert.deepEqual(result.pages.map((page) => page.path), ['about.html', 'public/index.html']);
});

test('SP-3: multiple non-index pages require choice; remembered choice is deterministic', () => {
  const root = fixture({ 'dashboard.html': '<title>Dashboard</title>', 'player.html': '<title>Player</title>' });
  assert.deepEqual(discoverStaticPreview(root), {
    pages: [
      { path: 'dashboard.html', label: 'Dashboard', primary: false },
      { path: 'player.html', label: 'Player', primary: false }
    ],
    needsChoice: true
  });
  const hinted = discoverStaticPreview(root, { activeHtmlPath: 'player.html' });
  assert.equal(hinted.canonical, undefined, 'editor focus never silently redefines the home page');
  assert.equal(hinted.pages[0].path, 'player.html', 'editor focus is only a chooser hint');
  const remembered = discoverStaticPreview(root, { remembered: 'player.html' });
  assert.equal(remembered.canonical, 'player.html');
  assert.equal(remembered.pages.find((page) => page.primary)?.path, 'player.html');
});

test('SP-4: explicit static declaration may point at generated HTML and rejects escapes', () => {
  const explicit = fixture({ '.sideline/game.json': JSON.stringify({ staticEntrypoint: 'dist/index.html' }), 'dist/index.html': 'ok' });
  assert.equal(discoverStaticPreview(explicit).canonical, 'dist/index.html');
  const bad = fixture({ '.sideline/game.json': JSON.stringify({ staticEntrypoint: '../outside.html' }), 'index.html': 'ignored' });
  assert.equal(discoverStaticPreview(bad).invalidDeclaration, true);
  const evidenced = fixture({ 'package.json': JSON.stringify({ browser: 'build/app.html' }), 'build/app.html': 'ok' });
  assert.equal(discoverStaticPreview(evidenced).canonical, 'build/app.html');
});

test('SP-5: loopback server serves MIME-correct GET/HEAD and rejects methods, traversal and dotfiles', async () => {
  const root = fixture({
    'index.html': '<h1>ok</h1>', 'app.mjs': 'export {}', 'style.css': 'body{}', 'data.json': '{}',
    'icon.svg': '<svg/>', '.env': 'SECRET=x', '.git/config': 'secret', 'secrets/token.json': '{}'
  });
  const server = new StaticPreviewServer();
  try {
    const url = await server.urlFor('g1', root, 'index.html');
    assert.equal(url.hostname, '127.0.0.1');
    const port = Number(url.port);
    for (const [name, mime] of [['index.html', 'text/html'], ['app.mjs', 'text/javascript'], ['style.css', 'text/css'], ['data.json', 'application/json'], ['icon.svg', 'image/svg+xml']]) {
      const response = await request(port, `/${name}`);
      assert.equal(response.status, 200, name);
      assert.match(response.headers['content-type'], new RegExp(`^${mime.replace('+', '\\+')}`));
    }
    assert.equal((await request(port, '/index.html', 'HEAD')).body, '');
    assert.equal((await request(port, '/index.html', 'POST')).status, 405);
    assert.equal((await request(port, '/index.html', 'PUT')).status, 405);
    for (const attack of ['/%2e%2e/outside.html', '/..%5coutside.html', '/%00index.html', '/.env', '/.git/config', '/secrets/token.json']) {
      assert.notEqual((await request(port, attack)).status, 200, attack);
    }
  } finally { await server.dispose(); }
});

test('SP-6: static PreviewEndpoint is reachable and carries canonical/alternate page URLs', async () => {
  const root = fixture({ 'index.html': '<title>Home</title>', 'settings.html': '<title>Settings</title>' });
  const server = new StaticPreviewServer();
  try {
    const result = await resolveGamePreview({
      gameId: 'g1', stadiumId: 's1', rootFsPath: root, probe: dead, staticServer: server,
      toClientUrl: async (localUrl) => ({ url: `https://forwarded.example${new URL(localUrl).pathname}`, directTabOnly: true })
    });
    assert.equal(result.available, true);
    const endpoint = result.endpoints[0];
    assert.equal(endpoint.source, 'static');
    assert.equal(endpoint.ownership, 'verified');
    assert.equal(endpoint.directTabOnly, true);
    assert.equal(endpoint.clientUrl, 'https://forwarded.example/index.html');
    assert.equal(endpoint.pages.length, 2);
    assert.equal(endpoint.pages.find((page) => page.path === 'settings.html').clientUrl, 'https://forwarded.example/settings.html');
    assert.equal(endpoint.pages.find((page) => page.primary).path, 'index.html');
    assert.equal((await request(endpoint.port, '/index.html')).status, 200);
  } finally { await server.dispose(); }
});

test('SP-7: a running Vite endpoint wins and does not start static hosting', async () => {
  const root = fixture({ 'package.json': JSON.stringify({ scripts: { dev: 'vite' } }), 'index.html': 'static' });
  const server = new StaticPreviewServer();
  try {
    const result = await resolveGamePreview({
      gameId: 'g1', stadiumId: 's1', rootFsPath: root, staticServer: server,
      probe: async (port) => port === 5173 ? { ipv4: true, ipv6: false, protocol: 'http' } : { ipv4: false, ipv6: false },
      inspectListener: async () => ({ cwd: root })
    });
    assert.equal(result.endpoints[0].source, 'detected');
    assert.equal(result.endpoints[0].port, 5173);
    assert.equal(server.activePort, undefined);
  } finally { await server.dispose(); }
});

test('SP-8: switching Games and disposal stop the prior static listener', async () => {
  const a = fixture({ 'index.html': 'a' });
  const b = fixture({ 'index.html': 'b' });
  const server = new StaticPreviewServer();
  const first = await server.urlFor('a', a, 'index.html');
  const oldPort = Number(first.port);
  await server.prepare('b', b);
  await assert.rejects(request(oldPort, '/index.html'));
  const second = await server.urlFor('b', b, 'index.html');
  const newPort = Number(second.port);
  await server.dispose();
  await assert.rejects(request(newPort, '/index.html'));
});

test('SP-9: dashboard selector navigates the same endpoint without mutating canonical page metadata', () => {
  const source = fs.readFileSync(new URL('../src/public/index.html', import.meta.url), 'utf8');
  assert.match(source, /preview\.canonicalEndpoint \|\|= endpoint/);
  assert.match(source, /renderPreviewEndpoint\(\{ \.\.\.canonical, clientUrl: page\.clientUrl \}\)/);
  assert.match(source, /candidate\.path === event\.target\.value/);
});

test('SP-10: Stadium remembers an ambiguity choice and the next resolution is deterministic', async () => {
  const root = fixture({ 'dashboard.html': '<title>Dashboard</title>', 'player.html': '<title>Player</title>' });
  const sent = [];
  let remembered;
  const stadium = new StadiumClient({
    autoReconnect: false,
    gameContextGetter: () => ({
      game: { gameId: 'g1', displayName: 'Game', fingerprintSource: 'test' },
      stadium: { stadiumId: 's1', name: 'Test', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: 'g1', stadiumId: 's1', rootFsPath: root, boundAt: Date.now(), isPrimary: true, status: 'bound' }
    }),
    previewRememberedEntrypoint: () => remembered,
    previewRememberEntrypoint: (_gameId, relativePath) => { remembered = relativePath; }
  });
  stadium.socket = { readyState: 1, send: (raw) => sent.push(JSON.parse(String(raw))), close() {} };
  stadium.connected = true;
  try {
    await stadium.handleIncomingRequest({ id: 1, method: 'game.preview.resolve', params: { gameId: 'g1' } });
    assert.equal(sent.at(-1).result.reason, 'static-choice-required');
    await stadium.handleIncomingRequest({ id: 2, method: 'game.preview.resolve', params: { gameId: 'g1', staticEntrypoint: 'player.html' } });
    assert.equal(remembered, 'player.html');
    assert.equal(sent.at(-1).result.endpoints[0].pages.find((page) => page.primary).path, 'player.html');
    await stadium.handleIncomingRequest({ id: 3, method: 'game.preview.resolve', params: { gameId: 'g1' } });
    assert.equal(sent.at(-1).result.endpoints[0].pages.find((page) => page.primary).path, 'player.html');
  } finally { stadium.dispose(); }
});
