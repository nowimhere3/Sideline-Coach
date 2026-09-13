/**
 * Control Plane Freshness Guard (P0.1).
 *
 * "Fresh source should automatically meet fresh runtime."
 *
 * The detached Control Plane outlives the windows that start it. A daemon keeps
 * its compiled modules in memory, so after a compile + Game-host reload a Stadium
 * could silently reconnect to an old daemon. This module answers ONE question
 * deterministically — never with clocks, mtimes or "newer than":
 *
 *   Is the running Control Plane the build this Stadium expects?
 *
 * Build identity = SHA-256 over the daemon's compiled runtime closure: the daemon
 * entrypoint plus every module reachable through its relative `require` graph.
 * Stadium-only code (roster, adapters) and the page (served from disk per request)
 * are outside the closure, so UI or Stadium changes never churn the daemon.
 *
 * No `vscode` import: shared by the daemon, the Stadium launcher and tests.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const CONTROL_PLANE_SERVICE = 'sideline-control-plane';

export interface ControlPlaneBuild {
  /** Deterministic identity of the daemon runtime closure, e.g. `cp-3f9c…`. */
  readonly buildId: string;
  /** Closure files, relative to the compiled output root, sorted. */
  readonly files: readonly string[];
}

const RELATIVE_REQUIRE = /require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;

/**
 * Hash the daemon's compiled runtime closure starting at `daemonScriptPath`
 * (e.g. `out/control-plane/daemon.js`). Throws when the entrypoint is unreadable;
 * a missing transitive module is part of the identity (`<missing>`), not ignored.
 */
export function computeControlPlaneBuild(
  daemonScriptPath: string,
  readFile: (file: string) => string = (file) => fs.readFileSync(file, 'utf8')
): ControlPlaneBuild {
  const entry = path.resolve(daemonScriptPath);
  const root = path.dirname(path.dirname(entry));
  const seen = new Map<string, string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    let content: string;
    try { content = readFile(file); }
    catch (error) {
      if (file === entry) throw error;
      seen.set(file, '<missing>');
      continue;
    }
    seen.set(file, content);
    for (const match of content.matchAll(RELATIVE_REQUIRE)) {
      const target = path.resolve(path.dirname(file), match[1]);
      queue.push(target.endsWith('.js') || target.endsWith('.json') ? target : `${target}.js`);
    }
  }
  const files = [...seen.keys()].map((file) => path.relative(root, file).replace(/\\/g, '/')).sort();
  const hash = crypto.createHash('sha256');
  for (const relative of files) {
    const content = seen.get(path.resolve(root, relative))!;
    hash.update(relative).update('\0').update(crypto.createHash('sha256').update(content).digest('hex')).update('\n');
  }
  return { buildId: `cp-${hash.digest('hex').slice(0, 24)}`, files };
}

/** What a running daemon says about itself through `/api/health`. */
export interface RunningControlPlane {
  readonly status?: string;
  readonly service?: string;
  readonly pid?: number;
  readonly instanceId?: string;
  readonly buildId?: string;
  readonly daemonScriptPath?: string;
  readonly supersedes?: readonly string[];
  readonly protocolVersion?: number;
}

export interface ControlPlaneManifest {
  readonly pid: number;
  readonly port: number;
  readonly instanceId?: string;
}

/**
 * Prove the process named by the manifest IS Sideline Coach's Control Plane before
 * any termination: the daemon listening on the manifest's port must report the
 * manifest's PID through the Control Plane health API (and its instance nonce, when
 * the manifest records one). A reused PID or an unrelated listener never matches.
 */
export function provesOwnership(manifest: ControlPlaneManifest, health: RunningControlPlane | undefined): boolean {
  if (!health || health.status !== 'ok') return false;
  if (typeof health.pid !== 'number' || health.pid !== manifest.pid) return false;
  // A guard-era daemon must name its service; a legacy daemon predates the field.
  if (health.service !== undefined && health.service !== CONTROL_PLANE_SERVICE) return false;
  if (manifest.instanceId && health.instanceId !== manifest.instanceId) return false;
  return true;
}

export interface LocalControlPlaneBuild {
  /** The build this Stadium loaded at activation. */
  readonly expectedBuildId: string;
  /** The build on disk at this Stadium's daemon path right now; undefined = unknown. */
  readonly diskBuildId?: string;
  readonly daemonScriptPath: string;
}

export type FreshnessVerdict =
  | { kind: 'current'; replace: false; reason: 'build-match' }
  | { kind: 'stale'; replace: true; reason: 'build-mismatch' | 'legacy-daemon-without-build-identity' }
  | { kind: 'stadium-outdated'; replace: false; reason: 'window-loaded-older-build' | 'build-superseded-by-running-daemon' };

/**
 * Decide whether to reuse or replace a running (ownership-proven) daemon.
 *
 * Replacement is only allowed from a Stadium that is itself current, so windows
 * running different builds never fight over the daemon:
 *   - same installation: a window whose loaded build differs from the build on disk
 *     is the outdated one (it has not been reloaded since the compile);
 *   - different installation (another version's extension folder): a build the
 *     running daemon already superseded never replaces it back.
 */
export function assessFreshness(local: LocalControlPlaneBuild, running: RunningControlPlane): FreshnessVerdict {
  if (!running.buildId) return { kind: 'stale', replace: true, reason: 'legacy-daemon-without-build-identity' };
  if (running.buildId === local.expectedBuildId) return { kind: 'current', replace: false, reason: 'build-match' };
  if (running.daemonScriptPath && samePath(running.daemonScriptPath, local.daemonScriptPath)) {
    if (local.diskBuildId !== undefined && local.diskBuildId !== local.expectedBuildId) {
      return { kind: 'stadium-outdated', replace: false, reason: 'window-loaded-older-build' };
    }
    return { kind: 'stale', replace: true, reason: 'build-mismatch' };
  }
  if ((running.supersedes ?? []).includes(local.expectedBuildId)) {
    return { kind: 'stadium-outdated', replace: false, reason: 'build-superseded-by-running-daemon' };
  }
  return { kind: 'stale', replace: true, reason: 'build-mismatch' };
}

/** Lineage carried by a replacement daemon, bounded. */
export function supersedesAfter(running: RunningControlPlane): string[] {
  const chain = [running.buildId, ...(running.supersedes ?? [])].filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(chain)].slice(0, 20);
}

export function samePath(left: string, right: string): boolean {
  const normalize = (value: string): string => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}
