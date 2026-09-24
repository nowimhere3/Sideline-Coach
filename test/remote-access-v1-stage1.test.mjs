import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { classifyDaemonRoute, DAEMON_ROUTE_POLICIES, principalMayAccess } from '../out/control-plane/remote-routes.js';
import { requestOriginMatchesExpected, requestOriginMatchesHost, timingSafeSecretEqual } from '../out/control-plane/request-security.js';
import { PlayerActivityStore } from '../out/player-activity.js';
import { redactForPrincipal } from '../out/remote-redaction.js';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from '../out/running-players.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const daemonSource = fs.readFileSync(path.join(repoRoot, 'src', 'control-plane', 'daemon.ts'), 'utf8');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const extensionSource = fs.readFileSync(path.join(repoRoot, 'src', 'extension.ts'), 'utf8');

const request = (port, route, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, (res) => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : undefined }));
  });
  req.on('error', reject);
  if (body !== undefined) req.write(JSON.stringify(body));
  req.end();
});

const makeDaemon = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-remote-stage1-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 41600 + Math.floor(Math.random() * 500), idleTimeoutMs: 60_000 });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  return {
    daemon,
    dir,
    token,
    stop: async () => { await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
  };
};

const exchangeSession = async (port, token) => {
  const response = await request(port, '/api/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers['set-cookie']?.[0] ?? '';
  assert.match(setCookie, /^sl_local=[^;]+;/);
  return { response, cookie: setCookie.split(';', 1)[0] };
};

test('RA1-1. browser bootstrap uses fragment -> session exchange; URLs and EventSource retain no credential', () => {
  assert.match(extensionSource, /\/#token=\$\{encodeURIComponent\(token\)\}/);
  assert.match(pageSource, /location\.hash/);
  assert.match(pageSource, /history\.replaceState\(null, '', location\.pathname\)/);
  assert.match(pageSource, /fetch\('\/api\/session'/);
  assert.match(pageSource, /new EventSource\('\/api\/events'\)/);
  assert.doesNotMatch(pageSource, /sessionStorage[^\n]*sidelineCoachToken/);
  assert.doesNotMatch(pageSource, /EventSource\([^\n]*token/i);
  assert.doesNotMatch(extensionSource, /\?token=/);
});

test('RA1-2. timing-safe comparison and origin matching are explicit security seams', () => {
  assert.equal(timingSafeSecretEqual('same-secret', 'same-secret'), true);
  assert.equal(timingSafeSecretEqual('same-secret', 'different-secret'), false);
  assert.equal(timingSafeSecretEqual('short', 'much-longer-secret'), false);
  assert.match(fs.readFileSync(path.join(repoRoot, 'src', 'control-plane', 'request-security.ts'), 'utf8'), /crypto\.timingSafeEqual/);
  assert.doesNotMatch(daemonSource, /bearer\s*===\s*this\.authToken|this\.authToken\s*===\s*bearer/);
  assert.equal(requestOriginMatchesHost('http://127.0.0.1:3100', '127.0.0.1:3100'), true);
  assert.equal(requestOriginMatchesHost('https://evil.test', '127.0.0.1:3100'), false);
});

test('RA1-3. every daemon route is behind the default-deny classification table', () => {
  const literalPaths = new Set(['/stadium']);
  for (const match of daemonSource.matchAll(/['`](\/api\/[A-Za-z0-9_./:-]+)['`]/g)) literalPaths.add(match[1]);
  const classifiedByAnyMethod = (pathname) => DAEMON_ROUTE_POLICIES.some((policy) =>
    typeof policy.path === 'string' ? policy.path === pathname : policy.path.test(pathname));
  const missing = [...literalPaths].filter((pathname) => !classifiedByAnyMethod(pathname));
  assert.deepEqual(missing, [], `unclassified daemon route literals: ${missing.join(', ')}`);

  const exactHandlers = [...daemonSource.matchAll(/method === '([A-Z]+)'[^\n]*requestUrl\.pathname === '([^']+)'/g)]
    .map((match) => [match[1], match[2]]);
  const unclassifiedMethods = exactHandlers.filter(([method, pathname]) => classifyDaemonRoute(method, pathname) === undefined);
  assert.deepEqual(unclassifiedMethods, [], `unclassified daemon route handlers: ${JSON.stringify(unclassifiedMethods)}`);

  assert.equal(classifyDaemonRoute('POST', '/api/queue/work-1/cancel'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/players/player-1/field'), 'local-only');
  assert.equal(classifyDaemonRoute('PUT', '/api/status'), undefined, 'an unlisted method is denied');
  assert.equal(classifyDaemonRoute('GET', '/api/future-route'), undefined, 'an unlisted path is denied');
});

test('RA1-4. remote principals cannot cross local-only lifecycle, credential, file, or preference boundaries', () => {
  const remote = { kind: 'remote-device', deviceId: 'paired-1', authenticatedBy: 'in-process' };
  for (const [method, pathname] of [
    ['POST', '/api/control-plane/shutdown'],
    ['GET', '/stadium'],
    ['POST', '/api/session'],
    ['POST', '/api/games/files/absolute-path'],
    ['POST', '/api/games/filesystem/choose'],
    ['POST', '/api/scout/openrouter-credential'],
    ['POST', '/api/preferences']
  ]) {
    const access = classifyDaemonRoute(method, pathname);
    assert.equal(access, 'local-only', `${method} ${pathname}`);
    assert.equal(principalMayAccess(remote, access), false, `${method} ${pathname}`);
  }
  assert.equal(principalMayAccess(remote, classifyDaemonRoute('GET', '/api/status')), true);
});

test('RA1-5. local session cookie works; URL token is rejected; cookie mutations enforce action + same Origin; CORS is same-origin', async () => {
  const h = await makeDaemon();
  try {
    const { response: exchange, cookie } = await exchangeSession(h.daemon.port, h.token);
    const setCookie = exchange.headers['set-cookie'][0];
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.equal(exchange.headers['access-control-allow-origin'], undefined);

    const localStatus = await request(h.daemon.port, '/api/status', { headers: { Cookie: cookie } });
    assert.equal(localStatus.status, 200, 'cookie-authenticated local UX remains available');
    assert.equal((await request(h.daemon.port, `/api/status?token=${encodeURIComponent(h.token)}`)).status, 401);

    const mutationHeaders = { Cookie: cookie, 'Content-Type': 'application/json' };
    assert.equal((await request(h.daemon.port, '/api/preferences', { method: 'POST', headers: mutationHeaders, body: { timeFormat: '24h' } })).status, 403);
    assert.equal((await request(h.daemon.port, '/api/preferences', { method: 'POST', headers: { ...mutationHeaders, 'X-Sideline-Action': '1', Origin: 'https://evil.test' }, body: { timeFormat: '24h' } })).status, 403);
    const origin = `http://127.0.0.1:${h.daemon.port}`;
    const saved = await request(h.daemon.port, '/api/preferences', { method: 'POST', headers: { ...mutationHeaders, 'X-Sideline-Action': '1', Origin: origin }, body: { timeFormat: '24h' } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.preferences.timeFormat, '24h');

    const bearerMutation = await request(h.daemon.port, '/api/preferences', { method: 'POST', headers: { Authorization: `Bearer ${h.token}`, 'Content-Type': 'application/json' }, body: { timeFormat: '12h' } });
    assert.equal(bearerMutation.status, 200, 'trusted local extension/CLI Bearer flow remains available');
    const terminalOverride = await request(h.daemon.port, '/api/preferences', { method: 'POST', headers: { Authorization: `Bearer ${h.token}`, 'Content-Type': 'application/json' }, body: { remoteSensitiveTerminalOutput: true } });
    assert.equal(terminalOverride.status, 200);
    assert.equal(terminalOverride.body.preferences.remoteSensitiveTerminalOutput, true);
    assert.equal((await request(h.daemon.port, '/api/preferences', { headers: { Cookie: cookie } })).body.preferences.remoteSensitiveTerminalOutput, true, 'new preference saves and reloads through the existing contract');
  } finally {
    await h.stop();
  }
});

test('RA1-5b. remote-device mutations require action header + Origin matching the trusted expectedOrigin', async () => {
  assert.equal(requestOriginMatchesExpected('https://h-test.sideline.live', 'https://h-test.sideline.live'), true);
  assert.equal(requestOriginMatchesExpected('https://evil.test', 'https://h-test.sideline.live'), false);
  assert.equal(requestOriginMatchesExpected(undefined, 'https://h-test.sideline.live'), false);
  assert.equal(requestOriginMatchesExpected('https://h-test.sideline.live', undefined), false);

  const h = await makeDaemon();
  try {
    const drive = async (headers, principal) => {
      const res = { headersSent: false, status: undefined, writeHead(s) { this.status = s; this.headersSent = true; }, end() {} };
      const req = Readable.from([]);
      Object.assign(req, { method: 'POST', url: '/api/queue/work-1/cancel', headers: { host: 'spoofed.test', ...headers }, socket: {} });
      try { await h.daemon.handleHttpRequest(req, res, principal); } catch { /* past the guard is enough */ }
      return res.status;
    };
    const remote = { kind: 'remote-device', deviceId: 'paired-1', authenticatedBy: 'in-process', expectedOrigin: 'https://h-test.sideline.live' };
    const good = { origin: 'https://h-test.sideline.live', 'x-sideline-action': '1' };
    assert.equal(await drive({ origin: good.origin }, remote), 403, 'missing action header');
    assert.equal(await drive({ ...good, origin: 'https://evil.test' }, remote), 403, 'foreign Origin');
    assert.equal(await drive({ 'x-sideline-action': '1', origin: 'https://spoofed.test', host: 'spoofed.test' }, { ...remote, expectedOrigin: undefined }), 403, 'missing expectedOrigin');
    assert.notEqual(await drive(good, remote), 403, 'matching Origin proceeds past the CSRF guard');
  } finally {
    await h.stop();
  }
});

test('RA1-6. SSE uses cookie auth, hardening headers, initial resync, and a heartbeat within 20 seconds', async () => {
  const h = await makeDaemon();
  let stream;
  try {
    const { cookie } = await exchangeSession(h.daemon.port, h.token);
    const observed = await new Promise((resolve, reject) => {
      let body = '';
      const req = http.get({ hostname: '127.0.0.1', port: h.daemon.port, path: '/api/events', headers: { Cookie: cookie } }, (res) => {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['cache-control'], 'no-cache, no-transform');
        assert.equal(res.headers['x-accel-buffering'], 'no');
        assert.equal(res.headers['access-control-allow-origin'], undefined);
        res.on('data', (chunk) => {
          body += String(chunk);
          if (body.includes('event: hello') && body.includes('event: status') && body.includes(': hb ')) resolve({ req, body });
        });
      });
      stream = req;
      req.on('error', reject);
      setTimeout(() => reject(new Error('SSE heartbeat not observed within 20 seconds')), 20_000).unref();
    });
    stream = observed.req;
    assert.match(observed.body, /event: hello/);
    assert.match(observed.body, /: hb \d+/);
  } finally {
    stream?.destroy();
    await h.stop();
  }
});

test('RA1-7. shared remote redaction is local-verbatim, remote-safe, and terminal override only', () => {
  const local = { kind: 'local-admin', authenticatedBy: 'cookie' };
  const remote = { kind: 'remote-device', deviceId: 'paired-1', authenticatedBy: 'in-process' };
  const secret = 'Authorization: Bearer abcdefghijklmnop1234567890';
  const report = { path: 'REPORTS/result.md', content: `result\n${secret}` };
  assert.deepEqual(redactForPrincipal(report, local), report, 'trusted local report remains verbatim');
  assert.doesNotMatch(redactForPrincipal(report, remote).content, /abcdefghijklmnop/);
  assert.doesNotMatch(redactForPrincipal(report, remote, { allowSensitiveTerminalOutput: true }).content, /abcdefghijklmnop/, 'override cannot affect report/file output');
  assert.match(daemonSource, /redactForPrincipal\(reports, principal\)/, 'report-list responses use the shared remote boundary');
  assert.match(daemonSource, /redactForPrincipal\(found, principal\)/, 'report-body responses use the shared remote boundary');

  const terminal = { entry: { text: `Read C:\\Users\\Dad\\private-project\\plan.md; ${secret}` } };
  const remoteDefault = redactForPrincipal(terminal, remote, { terminalActivity: true }).entry.text;
  assert.match(remoteDefault, /\[redacted path\]/, 'remote terminal details are masked by default');
  assert.doesNotMatch(remoteDefault, /abcdefghijklmnop/, 'hard secrets are also masked by default');
  const remoteOverride = redactForPrincipal(terminal, remote, { terminalActivity: true, allowSensitiveTerminalOutput: true }).entry.text;
  assert.match(remoteOverride, /C:\\Users\\Dad\\private-project\\plan\.md/, 'override restores terminal detail');
  assert.doesNotMatch(remoteOverride, /abcdefghijklmnop/, 'override never restores hard secrets');

  const filler = (n) => 'lorem ipsum dolor sit amet. '.repeat(Math.ceil(n / 28)).slice(0, n);
  const head = filler(10_000);
  const tail = filler(4_000);
  const long = `${head} AKIAIOSFODNN7EXAMPLE and Authorization: Bearer abcdefghijklmnop1234567890 ${tail}`;
  for (const options of [{}, { terminalActivity: true, allowSensitiveTerminalOutput: true }]) {
    const out = redactForPrincipal({ content: long }, remote, options).content;
    assert.ok(out.length > 14_000, 'payload beyond 8 KB is not truncated');
    assert.ok(out.startsWith(head) && out.endsWith(tail), 'non-secret content before and after the former cutoff survives verbatim');
    assert.doesNotMatch(out, /AKIAIOSFODNN7EXAMPLE|abcdefghijklmnop/, 'secrets past 8 KB are redacted, even under the Dev terminal override');
    assert.match(out, /\[redacted\]/);
  }

  const store = new PlayerActivityStore();
  store.record('game|player', { at: 1, category: 'output', text: secret });
  assert.doesNotMatch(store.snapshot('game|player').entries[0].text, /abcdefghijklmnop/, 'hard-secret-redacted text is all the activity store retains');
});

test('RA1-8. sensitive terminal override defaults off, persists conventionally, and is Dev-only UI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-remote-pref-'));
  const file = path.join(dir, 'preferences.json');
  try {
    assert.equal(loadPreferences(file).remoteSensitiveTerminalOutput, false);
    savePreferences(file, { ...DEFAULT_PREFERENCES, devMode: true, remoteSensitiveTerminalOutput: true });
    assert.equal(loadPreferences(file).remoteSensitiveTerminalOutput, true);
    assert.match(pageSource, /Show sensitive terminal output on paired devices/);
    assert.match(pageSource, /Remote terminal output is redacted by default/);
    assert.match(pageSource, /card\.hidden = !status\?\.preferences\?\.devMode/);
    assert.match(daemonSource, /principal\.kind === 'remote-device'[\s\S]*remoteSensitiveTerminalOutput/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
