// Zero-turn behavioural probe of the REAL compiled adapter against the REAL installed Codex.
// - No turn/start is ever sent (no model usage). No repo source is modified.
// - Runs in a scratch Game root. The installed Codex CLI is only launched (as the adapter would), never changed.
// - The only lever used is the adapter's existing test seam: LaunchOptions.certifiedVersions.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const repo = path.resolve(__dirname, '..', '..', '..'); // run from REPORTS/Claude/S54.8-evidence after `npm run compile`
const { CodexAppServerFactory } = require(path.join(repo, 'out/player-control/codex-app-server.js'));
const root = path.join(require('os').tmpdir(), 'sideline-codex-probe-root'); // scratch Game root
fs.mkdirSync(root, { recursive: true });
const request = { instanceId: 'codex-abcd1234', playerType: 'codex', seat: 1, gameRoot: root, authority: { approvalPolicy: 'never', sandbox: 'danger-full-access' } };
const line = (label, value) => console.log(`${label.padEnd(58)} ${value}`);
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms} ms`)), ms))]);

(async () => {
  // 1. Reproduce the field result with the shipped default (exact-version allowlist).
  const shipped = new CodexAppServerFactory();
  try { await withTimeout(shipped.open(request), 40_000, 'default open'); line('1 default open()', 'UNEXPECTEDLY OPENED'); }
  catch (error) { line('1 default open() [shipped gate]', `${error.outcome || error.name}: ${error.message}`); }
  const shippedRestore = await withTimeout(shipped.restore(request, { instanceId: request.instanceId, playerType: 'codex', seat: 1, adapter: 'codex-app-server', sessionRef: crypto.randomUUID(), historyExpected: false, pendingPlay: null }), 40_000, 'default restore');
  line('2 default restore() [shipped gate]', `${shippedRestore.kind}: ${shippedRestore.message}`);

  // 2. Same adapter, same installed Codex, version allowlist widened ONLY via the existing test seam.
  const probe = new CodexAppServerFactory({ certifiedVersions: ['0.155.1'] });
  const control = await withTimeout(probe.open(request), 40_000, 'seam open');
  line('3 open() with 0.155.1 allowed: state', control.state);
  line('  runtimeVersion / model / effort', `${control.runtimeVersion} / ${control.model} / ${control.effort}`);
  line('  providerSessionRef (thread id present)', Boolean(control.providerSessionRef));
  const caps = await withTimeout(control.queryCapabilities(), 20_000, 'capabilities');
  line('  capabilities: authenticated / models / freshness', `${caps.authenticated} / ${caps.models.length} / ${caps.freshness}`);
  line('  capabilities: default model + efforts', `${caps.defaultModelId} / [${(caps.models.find((m) => m.isDefault) || caps.models[0] || { supportedEfforts: [] }).supportedEfforts.join(',')}]`);
  await control.close();
  line('  close()', control.state);

  // 3. Restore semantics against the 0.155.1 thread/read + thread/resume error wording (the 0.154.0 quirk area).
  const ghost = crypto.randomUUID();
  const freshBinding = { instanceId: request.instanceId, playerType: 'codex', seat: 1, adapter: 'codex-app-server', sessionRef: ghost, historyExpected: false, pendingPlay: null };
  const r1 = await withTimeout(probe.restore(request, freshBinding), 60_000, 'restore no-history');
  line('4 restore(missing thread, no history expected)', `${r1.kind}${r1.openedFresh !== undefined ? ` openedFresh=${r1.openedFresh}` : ''}${r1.message ? ` :: ${r1.message}` : ''}${r1.diagnostic ? ` :: ${r1.diagnostic}` : ''}`);
  if (r1.control) { line('  new thread differs from ghost id', r1.control.providerSessionRef !== ghost); await r1.control.close(); }
  const r2 = await withTimeout(probe.restore(request, { ...freshBinding, historyExpected: true }), 60_000, 'restore history-expected');
  line('5 restore(missing thread, history EXPECTED)', `${r2.kind} :: ${r2.message}${r2.diagnostic ? ` :: diag=${r2.diagnostic}` : ''}`);
  line('  capabilities preserved on failed restore', Boolean(r2.capabilities && r2.capabilities.models && r2.capabilities.models.length));
})().catch((error) => { console.error('PROBE ERROR', error && error.stack || error); process.exitCode = 1; });
