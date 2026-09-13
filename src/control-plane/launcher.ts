import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as child_process from 'node:child_process';
import type { ControlPlaneDiscoveryRecord, ControlPlaneFreshness } from './protocol';
import {
  assessFreshness,
  provesOwnership,
  supersedesAfter,
  type RunningControlPlane
} from './freshness';

export type { ControlPlaneDiscoveryRecord };

export interface LauncherOptions {
  dir?: string;
  daemonScriptPath?: string;
  requestedPort?: number;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  /** The Control Plane build this Stadium loaded at activation (Freshness Guard). */
  expectedBuildId?: string;
  /** The build currently on disk at `daemonScriptPath`; undefined = unknown. */
  diskBuildId?: () => string | undefined;
  /** Injectable process/network layer — tests, never production overrides. */
  deps?: Partial<LauncherDeps>;
}

export interface LauncherDeps {
  health(port: number): Promise<RunningControlPlane | undefined>;
  isProcessAlive(pid: number): boolean;
  /** Ask exactly this instance to step down; resolves true when it accepted. */
  requestShutdown(port: number, token: string, instanceId: string, reason: string): Promise<boolean>;
  /** Terminate a process whose Control Plane ownership was already proven. */
  terminate(pid: number): void;
  spawnDaemon(args: string[], env: NodeJS.ProcessEnv, logFile: string): void;
  sleep(ms: number): Promise<void>;
}

export type EnsuredControlPlane = ControlPlaneDiscoveryRecord & { freshness: ControlPlaneFreshness };

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException)?.code === 'EPERM';
  }
}

export function readHealth(port: number, timeoutMs = 600): Promise<RunningControlPlane | undefined> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(undefined); return; }
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body) as RunningControlPlane & { buildId?: string | null };
          resolve({ ...parsed, buildId: parsed.buildId ?? undefined });
        } catch {
          resolve(undefined);
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(undefined); });
    req.on('error', () => resolve(undefined));
  });
}

export async function checkHealth(port: number, timeoutMs = 400): Promise<boolean> {
  return (await readHealth(port, timeoutMs))?.status === 'ok';
}

const DEFAULT_DEPS: LauncherDeps = {
  health: (port) => readHealth(port),
  isProcessAlive,
  requestShutdown: (port, token, instanceId, reason) => new Promise((resolve) => {
    const body = JSON.stringify({ instanceId, reason });
    const req = http.request({
      host: '127.0.0.1', port, path: '/api/control-plane/shutdown', method: 'POST', timeout: 1_500,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Authorization: `Bearer ${token}` }
    }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end(body);
  }),
  terminate: (pid) => { try { process.kill(pid); } catch { /* already gone */ } },
  spawnDaemon: (args, env, logFile) => {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const logFd = fs.openSync(logFile, 'a');
    try {
      const child = child_process.spawn(process.execPath, args, { detached: true, windowsHide: true, stdio: ['ignore', logFd, logFd], env });
      child.unref();
    } finally {
      fs.closeSync(logFd);
    }
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
};

interface Manifest extends ControlPlaneDiscoveryRecord {}

function readManifest(file: string): Manifest | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest;
    return parsed && Number.isSafeInteger(parsed.pid) && parsed.pid > 0 && Number.isSafeInteger(parsed.port) && parsed.port > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Find — or start, or safely replace — the Control Plane this Stadium should use.
 *
 *   manifest + owned daemon + build match      → reuse
 *   owned daemon + stale build (this Stadium current) → exactly one Stadium replaces it
 *   owned daemon + this Stadium outdated       → reuse (never fight a newer build)
 *   dead / missing / corrupt manifest          → start one (single winner)
 *   PID alive but not provably ours            → never killed; a new daemon is started
 *
 * One election lock (`control-plane.lock`, atomic create, holder identified by PID)
 * serialises every start and replacement across all Stadiums. Losers wait and then
 * re-evaluate, so all converge on the winner's daemon.
 */
export async function ensureControlPlaneRunning(options: LauncherOptions = {}): Promise<EnsuredControlPlane> {
  const deps: LauncherDeps = { ...DEFAULT_DEPS, ...options.deps };
  const dir = options.dir ?? process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline');
  fs.mkdirSync(dir, { recursive: true });
  const manifestPath = path.join(dir, 'control-plane.json');
  const lockPath = path.join(dir, 'control-plane.lock');
  const deadline = Date.now() + (options.timeoutMs ?? 25_000);
  const daemonScript = path.resolve(options.daemonScriptPath ?? path.join(__dirname, 'daemon.js'));
  const expectedBuildId = options.expectedBuildId;

  const verdictFor = (running: RunningControlPlane): ReturnType<typeof assessFreshness> | undefined => {
    if (!expectedBuildId) return undefined;
    let diskBuildId: string | undefined;
    try { diskBuildId = options.diskBuildId?.(); } catch { diskBuildId = undefined; }
    return assessFreshness({ expectedBuildId, diskBuildId, daemonScriptPath: daemonScript }, running);
  };

  while (Date.now() < deadline) {
    const manifest = readManifest(manifestPath);
    let health: RunningControlPlane | undefined;
    let owned = false;
    if (manifest) {
      health = await deps.health(manifest.port);
      owned = provesOwnership(manifest, health);
      if (!owned && !health && deps.isProcessAlive(manifest.pid)) {
        // Alive but silent: maybe busy. Look again before concluding anything.
        for (let attempt = 0; attempt < 3 && !health; attempt += 1) {
          await deps.sleep(250);
          health = await deps.health(manifest.port);
        }
        owned = provesOwnership(manifest, health);
      }
    }

    if (manifest && owned && health) {
      const verdict = verdictFor(health);
      if (!verdict) {
        return withFreshness(manifest, { verdict: 'unknown', runningBuildId: health.buildId, replaced: false, reason: 'stadium-build-unknown' });
      }
      if (!verdict.replace) {
        return withFreshness(manifest, { verdict: verdict.kind, expectedBuildId, runningBuildId: health.buildId, replaced: false, reason: verdict.reason });
      }
      // Stale: replace under the election lock.
      const lock = acquireLock(lockPath);
      if (!lock) { await deps.sleep(150); continue; }
      try {
        const again = readManifest(manifestPath);
        if (!again || again.pid !== manifest.pid || again.instanceId !== manifest.instanceId) continue; // someone else replaced it
        await stepDown(dir, manifest, health, deps, verdict.reason);
        if (readManifest(manifestPath)?.instanceId === manifest.instanceId) {
          try { fs.unlinkSync(manifestPath); } catch { /* already removed by the daemon */ }
        }
        const started = await startDaemon(dir, daemonScript, options, deps, deadline, supersedesAfter(health), verdict.reason);
        return withFreshness(started, { verdict: 'current', expectedBuildId, runningBuildId: started.buildId, replaced: true, reason: verdict.reason });
      } finally {
        releaseLock(lockPath, lock);
      }
    }

    // No usable daemon: missing / corrupt / dead manifest, or a PID we cannot prove is ours.
    const lock = acquireLock(lockPath);
    if (!lock) { await deps.sleep(150); continue; }
    try {
      const again = readManifest(manifestPath);
      if (again && (!manifest || again.instanceId !== manifest.instanceId || again.pid !== manifest.pid)) continue; // a winner started one
      if (again && !provesOwnership(again, await deps.health(again.port)) && !deps.isProcessAlive(again.pid)) {
        try { fs.unlinkSync(manifestPath); } catch { /* gone */ }
      }
      const reason = !manifest ? 'no-control-plane' : deps.isProcessAlive(manifest.pid) ? 'control-plane-unverifiable' : 'control-plane-not-running';
      const started = await startDaemon(dir, daemonScript, options, deps, deadline, [], reason);
      return withFreshness(started, {
        verdict: expectedBuildId ? (started.buildId === expectedBuildId ? 'current' : 'unknown') : 'unknown',
        expectedBuildId,
        runningBuildId: started.buildId,
        replaced: false,
        reason
      });
    } finally {
      releaseLock(lockPath, lock);
    }
  }
  throw new Error('Timed out waiting for the Sideline Coach Control Plane.');
}

function withFreshness(record: ControlPlaneDiscoveryRecord, freshness: ControlPlaneFreshness): EnsuredControlPlane {
  return { ...record, freshness };
}

/** Owner-verified step-down: graceful request first, proven-ownership termination second. */
async function stepDown(dir: string, manifest: Manifest, health: RunningControlPlane, deps: LauncherDeps, reason: string): Promise<void> {
  const token = readToken(dir);
  const accepted = health.instanceId && token ? await deps.requestShutdown(manifest.port, token, health.instanceId, reason) : false;
  for (let waited = 0; waited < 40 && deps.isProcessAlive(manifest.pid) && (await deps.health(manifest.port)); waited += 1) {
    await deps.sleep(125);
  }
  if (!accepted || deps.isProcessAlive(manifest.pid)) {
    // Re-prove ownership immediately before terminating: never kill a reused PID.
    const current = await deps.health(manifest.port);
    if (provesOwnership(manifest, current)) deps.terminate(manifest.pid);
  }
  for (let waited = 0; waited < 40 && deps.isProcessAlive(manifest.pid); waited += 1) {
    await deps.sleep(125);
  }
}

async function startDaemon(
  dir: string,
  daemonScript: string,
  options: LauncherOptions,
  deps: LauncherDeps,
  deadline: number,
  supersedes: string[],
  reason: string
): Promise<ControlPlaneDiscoveryRecord> {
  const instanceId = `cpi_${crypto.randomBytes(8).toString('hex')}`;
  const args = [daemonScript];
  if (options.requestedPort) args.push('--port', String(options.requestedPort));
  if (options.dir) args.push('--dir', options.dir);
  if (options.idleTimeoutMs) args.push('--idle-timeout-ms', String(options.idleTimeoutMs));
  deps.spawnDaemon(args, {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    SIDELINE_DAEMON_INSTANCE: instanceId,
    SIDELINE_SUPERSEDES: JSON.stringify(supersedes),
    SIDELINE_REPLACEMENT_REASON: reason
  }, path.join(dir, 'logs', 'control-plane.log'));

  const manifestPath = path.join(dir, 'control-plane.json');
  const spawnDeadline = Math.min(deadline, Date.now() + 10_000);
  while (Date.now() < spawnDeadline) {
    const record = readManifest(manifestPath);
    if (record?.instanceId === instanceId) {
      const health = await deps.health(record.port);
      if (health?.instanceId === instanceId && health.status === 'ok') return record;
    }
    await deps.sleep(100);
  }
  throw new Error('The Control Plane did not start in time.');
}

interface HeldLock { fd: number; nonce: string }

/** Atomic election lock. A lock whose holder process is gone is broken; a live holder is waited for. */
function acquireLock(lockPath: string): HeldLock | undefined {
  const nonce = crypto.randomBytes(8).toString('hex');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, nonce }));
      return { fd, nonce };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let holder: { pid?: unknown } | undefined;
      try { holder = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid?: unknown }; }
      catch { return undefined; } // being written right now — wait
      // Lock holders are Stadium processes on this machine: always the real liveness check.
      if (typeof holder.pid === 'number' && isProcessAlive(holder.pid)) return undefined;
      try { fs.unlinkSync(lockPath); } catch { /* another Stadium broke it first */ }
    }
  }
  return undefined;
}

function releaseLock(lockPath: string, lock: HeldLock): void {
  try { fs.closeSync(lock.fd); } catch { /* closed */ }
  try {
    const holder = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { nonce?: unknown };
    if (holder.nonce === lock.nonce) fs.unlinkSync(lockPath);
  } catch { /* not ours or already gone */ }
}

function readToken(dir: string): string {
  try { return fs.readFileSync(path.join(dir, 'token'), 'utf8').trim(); } catch { return ''; }
}
