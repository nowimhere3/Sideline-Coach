/**
 * Pure planning logic for the two-Game development harness.
 *
 * WHY THIS EXISTS
 * ---------------
 * VS Code cannot run two simultaneous Extension Development Hosts from one
 * VS Code instance when both use the same `--extensionDevelopmentPath`.
 * Its main process short-circuits:
 *
 *   openExtensionDevelopmentHostWindow(paths, opts) {
 *     const existing = findWindowOnExtensionDevelopmentPath(this.getWindows(), paths);
 *     if (existing) { this.lifecycleMainService.reload(existing, opts.cli); existing.focus(); return [existing]; }
 *     ...
 *   }
 *
 * `getWindows()` is scoped to the current VS Code instance, and an instance is
 * keyed by its `--user-data-dir`. So the only reliable way to get N live
 * Extension Development Hosts off one extension source is N VS Code instances,
 * each with its own user-data-dir. That is exactly what this planner encodes.
 *
 * Kept separate from the spawning CLI so the argument construction stays
 * unit-testable without launching windows.
 */

import * as path from 'node:path';

/** Profile roots live beside the Control Plane state, never inside the repo. */
export const DEV_HOSTS_DIRNAME = 'dev-hosts';

const WINDOWS_CANDIDATES = [
  '%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe',
  '%PROGRAMFILES%\\Microsoft VS Code\\Code.exe',
  '%PROGRAMFILES(X86)%\\Microsoft VS Code\\Code.exe'
];

const DARWIN_CANDIDATES = ['/Applications/Visual Studio Code.app/Contents/MacOS/Electron'];

const LINUX_CANDIDATES = ['/usr/share/code/code', '/usr/bin/code', '/snap/bin/code'];

function expandWindowsVars(candidate, env) {
  return candidate.replace(/%([^%]+)%/g, (whole, name) => env[name] ?? whole);
}

/**
 * Resolve the VS Code executable to spawn.
 *
 * `SIDELINE_DEV_VSCODE` always wins so a human on an unusual install (Insiders,
 * portable, a non-default drive) can point the harness at it without editing code.
 * Returns `code` as a last resort and lets the OS resolve it on PATH.
 */
export function resolveVSCodeExecutable({ env = {}, platform = process.platform, existsSync } = {}) {
  const override = (env.SIDELINE_DEV_VSCODE ?? '').trim();
  if (override) {
    return { executable: override, source: 'env' };
  }

  const candidates =
    platform === 'win32'
      ? WINDOWS_CANDIDATES.map((c) => expandWindowsVars(c, env))
      : platform === 'darwin'
        ? DARWIN_CANDIDATES
        : LINUX_CANDIDATES;

  if (typeof existsSync === 'function') {
    for (const candidate of candidates) {
      if (candidate.includes('%')) continue; // unexpanded variable -> not a real path
      if (existsSync(candidate)) {
        return { executable: candidate, source: 'detected' };
      }
    }
  }

  return { executable: platform === 'win32' ? 'code.cmd' : 'code', source: 'path' };
}

/**
 * Validate a dev-games config. Throws with a human-readable message rather than
 * letting a typo surface later as a silently-missing second host.
 */
export function validateDevGamesConfig(config) {
  if (!config || typeof config !== 'object' || !Array.isArray(config.hosts)) {
    throw new Error('dev-games config must be an object with a "hosts" array.');
  }
  if (config.hosts.length === 0) {
    throw new Error('dev-games config declares no hosts.');
  }

  const seenNames = new Set();
  const seenPorts = new Set();
  for (const host of config.hosts) {
    if (!host || typeof host.name !== 'string' || !host.name.trim()) {
      throw new Error('Every host needs a non-empty "name".');
    }
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(host.name)) {
      throw new Error(`Host name '${host.name}' must be filesystem-safe (letters, digits, hyphens).`);
    }
    if (seenNames.has(host.name)) {
      throw new Error(`Duplicate host name '${host.name}'. Each host needs its own profile directory.`);
    }
    seenNames.add(host.name);

    if (typeof host.workspace !== 'string' || !host.workspace.trim()) {
      throw new Error(`Host '${host.name}' needs a "workspace" path.`);
    }

    if (host.inspectExtensionsPort !== undefined) {
      const port = host.inspectExtensionsPort;
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error(`Host '${host.name}' has an invalid inspectExtensionsPort: ${port}`);
      }
      if (seenPorts.has(port)) {
        throw new Error(`Duplicate inspectExtensionsPort ${port}. Each host needs its own debug port.`);
      }
      seenPorts.add(port);
    }
  }

  return config;
}

/**
 * Build the spawn plan for a single Extension Development Host.
 *
 * The isolated `--user-data-dir` is the load-bearing argument: it is what makes
 * this a distinct VS Code instance, and therefore what stops VS Code from
 * reloading an existing host instead of opening a new one.
 */
export function buildHostLaunchPlan(host, { repoRoot, devHostsDir }) {
  const workspacePath = path.resolve(repoRoot, host.workspace);
  const profileRoot = path.join(devHostsDir, host.name);
  const userDataDir = path.join(profileRoot, 'user-data');
  const extensionsDir = path.join(profileRoot, 'extensions');

  const args = [
    `--user-data-dir=${userDataDir}`,
    `--extensions-dir=${extensionsDir}`,
    '--disable-workspace-trust',
    `--extensionDevelopmentPath=${repoRoot}`
  ];

  if (host.inspectExtensionsPort !== undefined) {
    args.push(`--inspect-extensions=${host.inspectExtensionsPort}`);
  }

  // The folder to open must come last, as a positional argument.
  args.push(workspacePath);

  return {
    name: host.name,
    label: host.label ?? host.name,
    workspacePath,
    profileRoot,
    userDataDir,
    extensionsDir,
    inspectExtensionsPort: host.inspectExtensionsPort,
    args
  };
}

/** Build every host plan, optionally filtered to a subset of host names. */
export function buildLaunchPlans(config, { repoRoot, devHostsDir, only } = {}) {
  validateDevGamesConfig(config);

  const wanted = only && only.length > 0 ? new Set(only) : undefined;
  const hosts = wanted ? config.hosts.filter((h) => wanted.has(h.name)) : config.hosts;

  if (wanted) {
    for (const name of wanted) {
      if (!config.hosts.some((h) => h.name === name)) {
        throw new Error(`Unknown host '${name}'. Known hosts: ${config.hosts.map((h) => h.name).join(', ')}`);
      }
    }
  }

  return hosts.map((host) => buildHostLaunchPlan(host, { repoRoot, devHostsDir }));
}
