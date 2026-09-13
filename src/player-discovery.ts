/**
 * Player discovery — "who could play here?", asked of one Stadium.
 *
 * Deliberately separate from PlayerRoster, which answers the different
 * question "who IS playing here?". Collapsing the two is what previously let a
 * manually-launched agent be invisible to Coach: the roster only knew about
 * Players it had created itself, and nothing ever asked the environment.
 *
 * Availability is a property of a Stadium, never of the product. A Player
 * installed on the Windows Stadium says nothing about a Codespace, so every
 * result here is scoped to the Stadium that produced it.
 *
 * This module imports no `vscode` API on purpose: the impure probes are
 * injected, so the decision rules stay unit-testable outside an extension host.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  PLAYER_ADAPTERS,
  getPlayerAdapter,
  summariseDetection,
  type PlayerAdapter,
  type PlayerCatalogEntry,
  type PlayerDetectionState,
  type PlayerId
} from './player-adapters';
import type { ProviderControlProfile } from './provider-control';

const execFileAsync = promisify(execFile);

/** One running process as observed from the OS. Shape kept minimal on purpose. */
export interface ObservedProcess {
  readonly pid: number;
  readonly parentPid: number;
  readonly name: string;
  readonly commandLine?: string;
}

/** A shell Coach can see, and therefore search for an already-running agent. */
export interface ObservedShell {
  readonly terminalName: string;
  readonly shellPid: number;
}

/**
 * An agent already running in this Game that Coach did NOT start.
 * Surfacing it is observation only — adoption is always an explicit human act.
 */
export interface ExternalPlayerCandidate {
  readonly playerType: PlayerId;
  readonly displayName: string;
  readonly terminalName: string;
  readonly shellPid: number;
  readonly processPid: number;
  readonly detail: string;
}

/**
 * A supported Player running on this computer but NOT inside this Game's
 * terminals — typically another VS Code window. Coach cannot use it for this
 * Game (it cannot reach that terminal, and its folder is another project), so it
 * is never offered for adoption. It is reported so "Add" never silently starts a
 * duplicate the human did not intend.
 */
export interface RunningElsewhere {
  readonly playerType: PlayerId;
  readonly displayName: string;
  readonly count: number;
}

export interface StadiumPlayerDiscovery {
  readonly stadiumId: string;
  readonly gameId: string;
  readonly at: number;
  readonly catalog: PlayerCatalogEntry[];
  readonly externalCandidates: ExternalPlayerCandidate[];
  /** Supported Players running outside this Game. Empty when the scan is unsupported. */
  readonly runningElsewhere?: RunningElsewhere[];
  /** True when the platform has no supported process probe, so absence proves nothing. */
  readonly externalScanSupported: boolean;
}

/** Optional cheap authentication probe. Absent means Coach must say "unknown", never guess. */
export type AuthProbe = (adapter: PlayerAdapter) => Promise<boolean | undefined>;

/** Optional provider-settings probe. It is enrichment and never part of core discovery. */
export type ControlsProbe = (adapter: PlayerAdapter, signal: AbortSignal) => Promise<ProviderControlProfile | undefined>;

/**
 * One optional, provider-specific enrichment. Keeping these separate from
 * DiscoveryProbes makes it impossible for a slow provider CLI to hold the core
 * Player catalog open.
 */
export interface PlayerDiscoveryEnricher {
  readonly playerType: PlayerId;
  readonly probe: ControlsProbe;
  readonly unknown: (adapter: PlayerAdapter) => ProviderControlProfile;
  readonly timeoutMs?: number;
}

export const DEFAULT_PROVIDER_ENRICHMENT_TIMEOUT_MS = 8_000;

export interface DiscoveryProbes {
  readonly commandAvailable: (command: string) => Promise<boolean>;
  readonly listProcesses?: () => Promise<ObservedProcess[]>;
  readonly probeAuth?: AuthProbe;
}

/** Result of one process scan against this Game's terminals. */
export interface RunningPlayerScan {
  readonly supported: boolean;
  readonly externalCandidates: ExternalPlayerCandidate[];
  readonly runningElsewhere: RunningElsewhere[];
}

// --- Pure decision rules ---------------------------------------------------

/**
 * Turn raw observation into a detection state.
 *
 * `authenticated === undefined` means "no probe exists for this provider", which
 * resolves to `ready` rather than `authentication-needed`: Coach can attempt to
 * open the Player, and a genuine sign-in failure surfaces honestly at open time
 * through the existing `needs-sign-in` control outcome. Claiming
 * "Authentication needed" without evidence would be a fabricated status.
 */
export function classifyDetection(
  adapter: PlayerAdapter,
  installed: boolean | undefined,
  authenticated?: boolean
): PlayerDetectionState {
  if (adapter.alwaysAvailable) return 'available';
  if (installed === undefined) return 'unknown';
  if (!installed) return 'not-installed';
  if (authenticated === false) return 'authentication-needed';
  return 'ready';
}

export function buildCatalogEntry(
  adapter: PlayerAdapter,
  state: PlayerDetectionState,
  detail?: string
): PlayerCatalogEntry {
  const { summary, canAddNow } = summariseDetection(adapter, state);
  return {
    playerType: adapter.id,
    displayName: adapter.name,
    state,
    summary,
    canAddNow,
    controlled: adapter.hasControlledAdapter === true,
    installGuidance: state === 'not-installed' ? adapter.installGuidance : undefined,
    detail
  };
}

/**
 * Match one observed process against the Player catalog.
 *
 * Matching is on the executable name or the leading token of the command line —
 * never on a terminal's display name. Stage 1.7/1.8 established that names carry
 * no authority, and that rule applies just as hard to discovery as to dispatch.
 */
export function matchProcessToPlayerType(
  process: ObservedProcess,
  adapters: readonly PlayerAdapter[] = PLAYER_ADAPTERS
): PlayerId | undefined {
  const executable = stripExecutableSuffix(process.name).toLowerCase();
  const leadingToken = stripExecutableSuffix(firstToken(process.commandLine ?? '')).toLowerCase();

  for (const adapter of adapters) {
    const probe = adapter.probeCommand;
    if (!probe) continue;
    const target = probe.toLowerCase();
    if (executable === target || leadingToken === target) return adapter.id;
  }
  return undefined;
}

function firstToken(commandLine: string): string {
  const trimmed = commandLine.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"')) {
    const closing = trimmed.indexOf('"', 1);
    const quoted = closing === -1 ? trimmed.slice(1) : trimmed.slice(1, closing);
    return baseName(quoted);
  }
  return baseName(trimmed.split(/\s+/, 1)[0]);
}

function baseName(value: string): string {
  const parts = value.split(/[\\/]/);
  return parts[parts.length - 1] ?? value;
}

function stripExecutableSuffix(value: string): string {
  return value.replace(/\.(exe|cmd|bat|ps1)$/i, '');
}

/** All descendants of `rootPid`, cycle-safe and depth-bounded. */
export function collectDescendants(
  processes: readonly ObservedProcess[],
  rootPid: number,
  maxDepth = 6
): ObservedProcess[] {
  const byParent = new Map<number, ObservedProcess[]>();
  for (const proc of processes) {
    const list = byParent.get(proc.parentPid) ?? [];
    list.push(proc);
    byParent.set(proc.parentPid, list);
  }

  const found: ObservedProcess[] = [];
  const seen = new Set<number>([rootPid]);
  let frontier = byParent.get(rootPid) ?? [];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: ObservedProcess[] = [];
    for (const proc of frontier) {
      if (seen.has(proc.pid)) continue;
      seen.add(proc.pid);
      found.push(proc);
      next.push(...(byParent.get(proc.pid) ?? []));
    }
    frontier = next;
  }

  return found;
}

/**
 * Find agents already running inside the Game's own terminals.
 *
 * `claimedShellPids` are shells Coach already owns; they are skipped so a
 * Coach-managed Player is never re-offered as an external discovery.
 */
export function findExternalCandidates(
  shells: readonly ObservedShell[],
  processes: readonly ObservedProcess[],
  claimedShellPids: ReadonlySet<number> = new Set(),
  adapters: readonly PlayerAdapter[] = PLAYER_ADAPTERS
): ExternalPlayerCandidate[] {
  const candidates: ExternalPlayerCandidate[] = [];

  for (const shell of shells) {
    if (claimedShellPids.has(shell.shellPid)) continue;

    for (const descendant of collectDescendants(processes, shell.shellPid)) {
      const playerType = matchProcessToPlayerType(descendant, adapters);
      if (!playerType) continue;
      const adapter = getPlayerAdapter(playerType);
      if (!adapter) continue;

      candidates.push({
        playerType,
        displayName: adapter.name,
        terminalName: shell.terminalName,
        shellPid: shell.shellPid,
        processPid: descendant.pid,
        detail: `Running in terminal "${shell.terminalName}" (process ${descendant.pid})`
      });
      break; // one agent per terminal is enough to offer adoption
    }
  }

  return candidates;
}

/**
 * Supported Players running on this computer outside this Game's terminals.
 *
 * A process counts only when it is NOT a descendant of any of this Game's
 * shells (those are candidates or Coach's own Players) and NOT a descendant of
 * `excludeRootPids` (Coach's own extension host, which owns controlled Players).
 * Nested helper processes of one agent are counted once, as their top-most match.
 */
export function findRunningElsewhere(
  shells: readonly ObservedShell[],
  processes: readonly ObservedProcess[],
  excludeRootPids: readonly number[] = [],
  adapters: readonly PlayerAdapter[] = PLAYER_ADAPTERS
): RunningElsewhere[] {
  const insideGame = new Set<number>();
  for (const root of [...shells.map((shell) => shell.shellPid), ...excludeRootPids]) {
    insideGame.add(root);
    for (const descendant of collectDescendants(processes, root, 12)) insideGame.add(descendant.pid);
  }

  const byPid = new Map(processes.map((proc) => [proc.pid, proc]));
  const counts = new Map<PlayerId, number>();

  for (const proc of processes) {
    if (insideGame.has(proc.pid)) continue;
    const playerType = matchProcessToPlayerType(proc, adapters);
    if (!playerType) continue;

    // Count the top-most process of an agent only.
    let parent = byPid.get(proc.parentPid);
    let nested = false;
    for (let depth = 0; parent && depth < 12; depth++) {
      if (matchProcessToPlayerType(parent, adapters) === playerType) { nested = true; break; }
      parent = byPid.get(parent.parentPid);
    }
    if (nested) continue;

    counts.set(playerType, (counts.get(playerType) ?? 0) + 1);
  }

  return [...counts.entries()].map(([playerType, count]) => ({
    playerType,
    displayName: getPlayerAdapter(playerType)?.name ?? playerType,
    count
  }));
}

/**
 * Discovery minus candidates whose shell is now a roster Player.
 *
 * Discovery is a snapshot, so without this an adopted agent kept its "Add to
 * Roster" offer while already on the roster — two contradictory truths about
 * one process. Identity is the shell pid, never a terminal name.
 */
export function withoutClaimedCandidates(
  discovery: StadiumPlayerDiscovery,
  claimedShellPids: ReadonlySet<number>
): StadiumPlayerDiscovery {
  const externalCandidates = discovery.externalCandidates.filter((candidate) => !claimedShellPids.has(candidate.shellPid));
  return externalCandidates.length === discovery.externalCandidates.length ? discovery : { ...discovery, externalCandidates };
}

/**
 * Offer a still-running agent again after its roster Player is removed.
 * Removal of a Player Coach did not start leaves the process alive, so it is
 * truthfully recruitable again without another scan.
 */
export function withRestoredCandidate(
  discovery: StadiumPlayerDiscovery,
  candidate: ExternalPlayerCandidate
): StadiumPlayerDiscovery {
  if (discovery.externalCandidates.some((entry) => entry.shellPid === candidate.shellPid)) return discovery;
  return { ...discovery, externalCandidates: [...discovery.externalCandidates, candidate] };
}

// --- Impure probes ---------------------------------------------------------

/** Windows process table. Returns undefined support elsewhere rather than lying. */
export async function listWindowsProcesses(): Promise<ObservedProcess[]> {
  const script =
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 2";
  const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', script], {
    timeout: 8_000,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });

  const parsed = JSON.parse(stdout) as unknown;
  const rows = Array.isArray(parsed) ? parsed : [parsed];

  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map((row) => ({
      pid: Number(row.ProcessId),
      parentPid: Number(row.ParentProcessId),
      name: typeof row.Name === 'string' ? row.Name : '',
      commandLine: typeof row.CommandLine === 'string' ? row.CommandLine : undefined
    }))
    .filter((proc) => Number.isSafeInteger(proc.pid) && Number.isSafeInteger(proc.parentPid));
}

export async function windowsCommandAvailable(command: string): Promise<boolean> {
  if (!command) return false;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-Command', `if (Get-Command -Name '${command}' -ErrorAction SilentlyContinue) { 'available' }`],
      { timeout: 3_000, windowsHide: true }
    );
    return stdout.trim() === 'available';
  } catch {
    return false;
  }
}

/**
 * Stadium-scoped discovery. One instance per extension host, because the
 * environment it describes is the extension host's environment.
 */
export class PlayerDiscoveryService {
  private lastResult: StadiumPlayerDiscovery | undefined;
  private readonly enrichmentInFlight = new Map<string, Promise<ReadonlyMap<PlayerId, ProviderControlProfile>>>();

  constructor(
    private readonly probes: DiscoveryProbes,
    private readonly enrichers: readonly PlayerDiscoveryEnricher[] = []
  ) {}

  get last(): StadiumPlayerDiscovery | undefined {
    return this.lastResult;
  }

  /**
   * One process scan against this Game's terminals. Used by Check Players and,
   * freshly, by Add — so a Player started after the last check can never be
   * duplicated by a stale snapshot.
   */
  async scanRunning(options: {
    shells: readonly ObservedShell[];
    claimedShellPids?: ReadonlySet<number>;
    excludeRootPids?: readonly number[];
  }): Promise<RunningPlayerScan> {
    if (!this.probes.listProcesses) return { supported: false, externalCandidates: [], runningElsewhere: [] };
    try {
      const processes = await this.probes.listProcesses();
      return {
        supported: true,
        externalCandidates: findExternalCandidates(options.shells, processes, options.claimedShellPids),
        runningElsewhere: findRunningElsewhere(options.shells, processes, options.excludeRootPids)
      };
    } catch {
      return { supported: false, externalCandidates: [], runningElsewhere: [] };
    }
  }

  async discover(options: {
    stadiumId: string;
    gameId: string;
    shells: readonly ObservedShell[];
    claimedShellPids?: ReadonlySet<number>;
    excludeRootPids?: readonly number[];
  }): Promise<StadiumPlayerDiscovery> {
    // Core discovery contains only fast availability and process observation.
    // Optional provider CLIs are launched later by enrich(), never from here.
    const runningPromise = this.scanRunning(options);
    const catalog = await Promise.all(PLAYER_ADAPTERS.map(async (adapter): Promise<PlayerCatalogEntry> => {
      if (adapter.alwaysAvailable) {
        return buildCatalogEntry(adapter, 'available');
      }

      let installed: boolean | undefined;
      try {
        installed = await this.probes.commandAvailable(adapter.probeCommand ?? adapter.id);
      } catch {
        installed = undefined;
      }

      let authenticated: boolean | undefined;
      if (installed && this.probes.probeAuth) {
        try {
          authenticated = await this.probes.probeAuth(adapter);
        } catch {
          authenticated = undefined;
        }
      }

      return buildCatalogEntry(adapter, classifyDetection(adapter, installed, authenticated));
    }));
    const running = await runningPromise;

    this.lastResult = {
      stadiumId: options.stadiumId,
      gameId: options.gameId,
      at: Date.now(),
      catalog,
      externalCandidates: running.externalCandidates,
      runningElsewhere: running.runningElsewhere,
      externalScanSupported: running.supported
    };
    return this.lastResult;
  }

  /**
   * Enrich an already-complete discovery snapshot. Concurrent cycles for the
   * same Game share one provider pass, preventing repeated Check Players clicks
   * from spawning a process storm while enrichment is already in flight.
   */
  enrich(discovery: StadiumPlayerDiscovery): Promise<StadiumPlayerDiscovery> {
    const key = `${discovery.stadiumId}\u0000${discovery.gameId}`;
    let task = this.enrichmentInFlight.get(key);
    if (!task) {
      task = this.probeControls(discovery).finally(() => {
        if (this.enrichmentInFlight.get(key) === task) this.enrichmentInFlight.delete(key);
      });
      this.enrichmentInFlight.set(key, task);
    }
    return task.then((controlsByType) => ({
      ...discovery,
      catalog: discovery.catalog.map((entry) => {
        const controls = controlsByType.get(entry.playerType);
        return controls ? { ...entry, controls } : entry;
      })
    }));
  }

  private async probeControls(discovery: StadiumPlayerDiscovery): Promise<ReadonlyMap<PlayerId, ProviderControlProfile>> {
    if (!this.enrichers.length) return new Map();
    const enrichers = new Map(this.enrichers.map((enricher) => [enricher.playerType, enricher]));
    const results = await Promise.all(discovery.catalog.map(async (entry): Promise<readonly [PlayerId, ProviderControlProfile] | undefined> => {
      const enricher = enrichers.get(entry.playerType);
      if (!enricher || (entry.state !== 'ready' && entry.state !== 'authentication-needed')) return undefined;
      const adapter = getPlayerAdapter(entry.playerType);
      if (!adapter) return undefined;

      const controller = new AbortController();
      const timeoutMs = enricher.timeoutMs ?? DEFAULT_PROVIDER_ENRICHMENT_TIMEOUT_MS;
      let timer: NodeJS.Timeout | undefined;
      try {
        const timeout = new Promise<never>((_resolve, reject) => {
          if (timeoutMs <= 0) {
            controller.abort();
            reject(new Error(`${adapter.name} capability probe timed out.`));
            return;
          }
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`${adapter.name} capability probe timed out.`));
          }, timeoutMs);
          timer.unref();
        });
        const controls = await Promise.race([enricher.probe(adapter, controller.signal), timeout]);
        return [entry.playerType, controls ?? enricher.unknown(adapter)] as const;
      } catch {
        return [entry.playerType, enricher.unknown(adapter)] as const;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }));

    return new Map(results.filter((result): result is readonly [PlayerId, ProviderControlProfile] => Boolean(result)));
  }
}
