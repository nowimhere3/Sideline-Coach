import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPreflight } from './collect-preflight.mjs';
import { renderSnapshot } from './render-snapshot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sidelineDir = process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline');
const snapshot = collectPreflight({ root, sidelineDir });

/** Bounded live probe. A dead or unreachable daemon simply leaves `live` null. */
async function probeControlPlane(cp) {
  if (!cp?.discoveryPresent || cp.daemonAlive !== true || !Number.isSafeInteger(cp.port)) return null;
  let token = '';
  try { token = fs.readFileSync(path.join(sidelineDir, 'token'), 'utf8').trim(); } catch {}
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const url = `http://127.0.0.1:${cp.port}/api/diagnostics${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

snapshot.controlPlane.live = await probeControlPlane(snapshot.controlPlane);

const markdown = renderSnapshot(snapshot);
const output = path.join(root, 'Diagnostics', 'local', 'CURRENT.md');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, markdown, 'utf8');
process.stdout.write(markdown);
