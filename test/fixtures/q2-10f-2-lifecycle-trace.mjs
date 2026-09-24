// Q2.10F.2 forensic reproduction: REAL Control Plane daemon + REAL StadiumClient +
// REAL src/public/index.html script, with a simulated Stadium that emits in the exact
// order PlayerRoster.handleControlEvent + StructuredPrintControl do for Controlled AntiGravity.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import vm from 'node:vm';

// Usage (from repo root, after npm run compile):
//   node test/fixtures/q2-10f-2-lifecycle-trace.mjs                       AUTO, one Player
//   SECOND=1 WORK_MS=9000 node test/fixtures/q2-10f-2-lifecycle-trace.mjs  two concurrent Players
//   MODE=manual ROSTER_DELAY=2500 node test/fixtures/q2-10f-2-lifecycle-trace.mjs  slow roster publish
// Diagnostic only: not part of npm test. Prints the event/snapshot/browser timeline.
const repo = (process.env.REPO || process.cwd()).replace(/\\/g, '/');
const mode = process.env.MODE || 'auto';          // auto | manual
const rosterDelayMs = Number(process.env.ROSTER_DELAY ?? 0); // PlayerRoster.status() awaits refreshAvailability()
const { ControlPlaneDaemon } = await import(`file://${repo}/out/control-plane/daemon.js`);
const { StadiumClient } = await import(`file://${repo}/out/stadium-client.js`);
const { getDurableStadiumId } = await import(`file://${repo}/out/game-identity.js`);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(String(Date.now() - t0).padStart(5), ...a);

const GAME = 'game_git_forensic';
const AG = 'antigravity-aaaa1111';
const CX = 'codex-bbbb2222';
const agySnap = { provider: 'agy', authenticated: true, observedAt: Date.now(), freshness: 'live', defaultModelId: 'gemini-pro', models: [{ id: 'gemini-pro', displayName: 'Gemini Pro', isDefault: true, supportedEfforts: [] }] };
const codexSnap = { provider: 'codex', authenticated: true, observedAt: Date.now(), freshness: 'live', defaultModelId: 'gpt-sol', models: [{ id: 'gpt-sol', displayName: 'GPT Sol', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }] };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'q210f2-'));
const daemon = new ControlPlaneDaemon({ dir, port: 39410 + Math.floor(Math.random() * 400), idleTimeoutMs: 120_000 });
await daemon.start();
const port = daemon.port;
const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();

// ---- Simulated Stadium (mirrors player-roster.ts + structured-print.ts ordering) ----
const turnState = new Map();
const active = new Set();
let client;
const players = [[AG, 'antigravity', 'AntiGravity', agySnap], [CX, 'codex', 'Codex', codexSnap]];
const roster = {
  resolve: (id) => ({ state: 'live', transport: 'controlled', instance: { instanceId: id, playerType: id.split('-')[0], onField: true } }),
  status: async () => {
    if (rosterDelayMs) await wait(rosterDelayMs);
    return players.map(([id, type, name]) => ({ id: type, name, availability: 'available', fieldState: 'on-field', instances: [{
      instanceId: id, playerType: type, seat: 1, fieldLabel: `${name} Â· Controlled`, onField: true, ownership: 'coach-managed',
      controlMode: 'controlled', transport: 'Controlled', controlState: 'ready',
      turnState: turnState.get(id) ?? { instanceId: id, state: 'idle', summary: 'Ready', at: 0 } }] }));
  },
  getRoutingCapabilities: () => players.map(([id, type, name, snap]) => {
    const t = turnState.get(id)?.state;
    return { instanceId: id, playerType: type, transport: 'controlled', transportLabel: 'Controlled', fieldLabel: name,
      state: t === 'accepted' || t === 'started' || active.has(id) ? 'busy' : 'ready', capability: snap };
  }),
  getLastDiscovery: () => undefined
};
const changed = () => { void client.sendRosterChanged(); client.sendCapabilitySnapshot(); };
const emitTurn = (instanceId, state, turnRef, summary) => {
  const ev = { instanceId, state, turnRef, summary, at: Date.now() };
  turnState.set(instanceId, ev);
  log(`STADIUM  turn ${state} (${instanceId.split('-')[0]})`);
  client.sendTurnChanged(ev);   // turnChanged.fire
  changed();                    // changed.fire â†’ roster.changed (async) + capability.snapshot
};
const INIT_MS = Number(process.env.INIT_MS ?? 1200);
const WORK_MS = Number(process.env.WORK_MS ?? 6000);
let n = 0;
const host = {
  deliver: async (instanceId) => {
    active.add(instanceId);                       // controlState = 'active' (no event)
    const turnRef = `turn-${++n}`;
    await wait(INIT_MS);                          // agy spawns; init line arrives
    emitTurn(instanceId, 'accepted', turnRef, 'Play received');
    emitTurn(instanceId, 'started', turnRef, 'Workingâ€¦');
    setTimeout(() => {
      active.delete(instanceId);                  // controlState = 'ready' BEFORE the terminal event
      emitTurn(instanceId, 'completed', turnRef, 'Done');
    }, WORK_MS);
    return { kind: 'accepted', turnRef };
  }
};
const stadiumId = getDurableStadiumId(dir);
client = new StadiumClient({
  port, dir, instanceId: `inst_${stadiumId}_${GAME}`,
  gameContextGetter: () => ({
    game: { gameId: GAME, displayName: 'Forensic', fingerprintSource: 'git-remote', repoUri: 'https://example.com/f.git' },
    stadium: { stadiumId, name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    binding: { gameId: GAME, stadiumId, rootFsPath: 'C:\\Games\\Forensic', boundAt: Date.now(), isPrimary: true, status: 'bound' }
  }),
  playerRoster: roster, playerControlHost: host, reportsGetter: async () => [],
  resolveControlPlane: async () => ({ port })
});
await client.connect();
await client.sendRosterChanged(); client.sendCapabilitySnapshot();
const apiCall = (url, init = {}) => fetch(`http://127.0.0.1:${port}${url}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }).then((r) => r.json());
await apiCall('/api/game/select', { method: 'POST', body: JSON.stringify({ gameId: GAME }) });
await wait(300);

// ---- Real browser script in a DOM stub, fetch + SSE bridged to the real daemon ----
const elements = new Map();
const makeNode = (id) => ({
  id, textContent: '', innerHTML: '', value: '', disabled: false, hidden: false, title: '', className: '', dataset: {}, style: {}, attributes: {}, children: [], listeners: {},
  classList: { classes: new Set(), add(...t) { for (const x of t) this.classes.add(x); }, remove(...t) { for (const x of t) this.classes.delete(x); }, toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.classes.add(c); else this.classes.delete(c); return on; }, contains(c) { return this.classes.has(c); } },
  addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); },
  setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k]; },
  appendChild(c) { this.children.push(c); }, append(...k) { this.children.push(...k); }, focus() {}, contains: () => false
});
const $ = (id) => { if (!elements.has(id)) elements.set(id, makeNode(id)); return elements.get(id); };
let source;
const abort = new AbortController();
const browserOrigin = `http://127.0.0.1:${port}`;
let browserCookie = '';
const browserFetch = async (url, init = {}) => {
  const headers = new Headers(init.headers || {});
  if (browserCookie) headers.set('Cookie', browserCookie);
  const method = (init.method || 'GET').toUpperCase();
  if (browserCookie && method !== 'GET' && method !== 'HEAD') headers.set('Origin', browserOrigin);
  const response = await fetch(`${browserOrigin}${url}`, { ...init, headers });
  if (url === '/api/session') browserCookie = (response.headers.get('set-cookie') || '').split(';', 1)[0];
  return response;
};
class BridgedEventSource {
  constructor(url) {
    this.listeners = {}; source = this;
    (async () => {
      const res = await browserFetch(url, { signal: abort.signal });
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ done: true }));
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1]; const data = /^data: (.*)$/m.exec(block)?.[1];
          if (!ev) continue;
          let parsed = {}; try { parsed = JSON.parse(data); } catch {}
          const brief = ev === 'turn' ? `${parsed.state} instanceId=${parsed.instanceId ?? 'âˆ…'} playerInstanceId=${parsed.playerInstanceId ?? 'âˆ…'}` : ev === 'status' ? (parsed.type ? `${parsed.type}${parsed.gameId ? '' : ''}` : 'full-status') : '';
          log(`SSE      ${ev} ${brief}`);
          for (const fn of this.listeners[ev] || []) fn({ data });
          probe(`after SSE ${ev}`);
        }
      }
    })();
  }
  addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); }
  close() {}
}
let last = '';
const probe = (why) => {
  const s = $('activePlayStatus'); const b = $('dispatchBtn');
  const cur = `clock=${s.hidden ? 'HIDDEN' : JSON.stringify(s.textContent)} btn=${JSON.stringify(b.textContent)}${b.disabled ? '(disabled)' : ''} select=${$('terminalSelect').value || 'âˆ…'}`;
  if (cur !== last) { log(`BROWSER  ${cur}   [${why}]`); last = cur; }
};
const ctx = {
  document: { getElementById: $, querySelectorAll: (s) => (s === '[data-live-action]' ? [$('dispatchBtn')] : []), createElement: () => makeNode(''), addEventListener() {} },
  location: { search: '', hash: `#token=${encodeURIComponent(token)}`, pathname: '/' }, history: { replaceState() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  Headers, URLSearchParams, EventSource: BridgedEventSource,
  fetch: async (url, init = {}) => {
    const res = await browserFetch(url, init);
    const body = await res.json();
    if (url === '/api/dispatch') log(`HTTP     /api/dispatch â†’ ${JSON.stringify({ status: body.status, outcome: body.outcome, success: body.success })}`);
    if (url === '/api/status') {
      const w = (body.capabilities || []).map((c) => `${c.instanceId.split('-')[0]}:${c.state}/${c.work?.workState}${c.work?.currentPlay ? '@' + (c.work.currentPlay.startedAt - t0) : ''}`).join(' ');
      const r = (body.players || []).flatMap((p) => p.instances).map((i) => `${i.instanceId.split('-')[0]}:${i.turnState?.state}`).join(' ');
      log(`HTTP     /api/status  caps[${w}] rosterTurn[${r}] activeDecision=${body.routing?.activeDecision?.playerInstanceId?.split('-')[0] ?? 'âˆ…'}`);
    }
    return { ok: res.ok, status: res.status, json: async () => body };
  },
  setTimeout, clearTimeout, setInterval: (fn, ms) => setInterval(() => { fn(); }, ms), clearInterval, console: { ...console, error: () => {} },
  navigator: { clipboard: { writeText: async () => {} } }, window: { isSecureContext: true }, Date
};
const html = fs.readFileSync(path.join(repo, 'src', 'public', 'index.html'), 'utf8');
vm.createContext(ctx);
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], ctx);
const poll = setInterval(() => probe('poll'), 50);
await wait(1200);

log(`---- ${mode.toUpperCase()} dispatch ----`);
if (mode === 'manual') {
  for (const fn of $('modeManualBtn').listeners.click || []) fn();
  $('terminalSelect').value = AG;
  for (const fn of $('terminalSelect').listeners.change || []) fn({ target: { value: AG } });
}
$('promptInput').value = process.env.PROMPT || 'Use AntiGravity to summarize the README';
for (const fn of $('promptInput').listeners.input || []) fn();
await wait(600);
probe('before click');
if (mode === 'auto') log(`staged route chip = ${$('autoRoutePlayer').textContent}`);
for (const fn of $('dispatchBtn').listeners.click || []) await fn();
probe('click handler returned');
if (process.env.SECOND) {
  await wait(1500);
  log('---- second AUTO Play while AntiGravity works ----');
  $('promptInput').value = 'Use Codex to add a unit test for the parser';
  for (const fn of $('promptInput').listeners.input || []) fn();
  await wait(600);
  log(`staged route chip = ${$('autoRoutePlayer').textContent}`);
  for (const fn of $('dispatchBtn').listeners.click || []) await fn();
  probe('second click returned');
}
await wait(INIT_MS + WORK_MS + 2500);
clearInterval(poll);
abort.abort();
client.dispose();
await daemon.stop();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
