/**
 * Coach Routines V0 — Game-scoped Strategy Board refresh rules.
 *
 * This module owns definitions, counters, due evaluation and delivery evidence.
 * It never reads Game files, edits reports, injects Player prompts, or schedules
 * work. Time cadences are evaluated lazily by callers using the Control Plane clock.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const COACH_ROUTINES_VERSION = 1;
export const DAY_MS = 86_400_000;
/** Human field polish: Hours is the same lazy `time` cadence, just a finer-grained
 * presentation unit. No scheduler, no new evaluation path — `cadenceEarned` already
 * compares raw `everyMs` regardless of which unit produced it. */
export const HOUR_MS = 3_600_000;
const COUNTED_REF_LIMIT = 200;
const MAX_SOURCES = 20;
const MAX_PATH = 240;
const MAX_NAME = 60;
const MAX_INSTRUCTION = 500;
const MAX_ENVELOPE = 12_000;

export type RoutineTemplate = 'canonical-refresh' | 'map-check' | 'custom';
export type RoutineCadence =
  | { readonly kind: 'plays'; readonly every: number }
  | { readonly kind: 'time'; readonly everyMs: number };
export type RoutineSourceState = 'file' | 'folder' | 'missing' | 'blocked' | 'unknown';

export interface RoutineSource {
  readonly path: string;
  readonly kind: 'file' | 'folder';
  readonly lastCheck?: { readonly at: number; readonly state: RoutineSourceState };
}

export interface RoutineDelivery {
  readonly at: number;
  readonly playCount: number;
  readonly via: 'copy-report' | 'strategy-board-send';
  readonly cycle: string;
  readonly reportPath?: string;
}

export interface CoachRoutine {
  readonly id: string;
  name: string;
  template: RoutineTemplate;
  enabled: boolean;
  cadence: RoutineCadence;
  targets: { strategyBoard: boolean; players: boolean };
  sources: RoutineSource[];
  instruction?: string;
  includeLocalRoot: boolean;
  playersScope?: { mode: 'all' | 'selected'; instanceIds?: string[]; onFirstPlay: boolean };
  readonly createdAt: number;
  board: {
    baselinePlayCount: number;
    baselineAt: number;
    manualDue?: boolean;
    manualDueSeq?: number;
    lastDelivered?: RoutineDelivery;
  };
  /** Reserved for the later exact-instance Player-target slice. */
  players: Record<string, { lastDelivered?: { at: number; playCount: number; clientRef: string } }>;
}

export interface GameRoutineState {
  readonly gameId: string;
  playCount: number;
  countedRefs: string[];
  players: Record<string, { playCount: number; firstSeenAt: number; leftTeamAt?: number }>;
  routines: CoachRoutine[];
  /** A human deletion must survive Dev Mode toggles; emptiness is not an initializer. */
  defaultsInitialized: boolean;
}

export interface CoachRoutinesState {
  readonly version: 1;
  games: Record<string, GameRoutineState>;
}

export interface RoutineView {
  id: string;
  name: string;
  enabled: boolean;
  template: RoutineTemplate;
  cadence: RoutineCadence;
  cadenceLabel: string;
  targets: { strategyBoard: boolean; players: boolean };
  targetsLabel: string;
  due: boolean;
  cycle?: string;
  lastSentLabel: string;
  nextLabel: string;
  needs?: 'sources' | 'devMode';
  sources: Array<{ path: string; kind: 'file' | 'folder'; state: RoutineSourceState | 'not-checked' }>;
  instruction?: string;
  includeLocalRoot: boolean;
}

export interface RoutinesProjection {
  gameId: string;
  devMode: boolean;
  playCount: number;
  routines: RoutineView[];
  handoff?: {
    text: string;
    deliveries: Array<{ routineId: string; cycle: string }>;
    names: string[];
  };
}

export interface RoutineLocator {
  displayName?: string;
  repoUri?: string;
  branch?: string;
  rootFsPath?: string;
}

export interface RoutineInput {
  name: string;
  template: RoutineTemplate;
  enabled?: boolean;
  cadence: RoutineCadence;
  targets?: { strategyBoard?: boolean; players?: boolean };
  sources?: Array<{ path: string; kind: 'file' | 'folder'; lastCheck?: { at: number; state: RoutineSourceState } }>;
  instruction?: string;
  includeLocalRoot?: boolean;
  /** Durable seam only. Player-target delivery is intentionally not implemented in V0 A+B. */
  playersScope?: { mode: 'all' | 'selected'; instanceIds?: string[]; onFirstPlay?: boolean };
}

export type RoutinePatch = Partial<Omit<RoutineInput, 'targets'>> & { targets?: RoutineInput['targets'] };

export interface CoachRoutineStore {
  load(): unknown;
  save(state: CoachRoutinesState): void;
  quarantine?(reason: string): string | undefined;
}

export const MEMORY_COACH_ROUTINE_STORE: CoachRoutineStore = {
  load: () => undefined,
  save: () => undefined
};

/** Atomic store. Invalid contents are preserved as a .bak before a clean state is used. */
export function fileCoachRoutineStore(file: string, warn: (message: string) => void = () => undefined): CoachRoutineStore {
  return {
    load: () => {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined;
        warn(`Coach Routines store could not be read: ${error instanceof Error ? error.message : String(error)}`);
        const backup = quarantineFile(file);
        if (backup) warn(`Preserved unreadable Coach Routines state at ${backup}.`);
        return undefined;
      }
    },
    save: (state) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      fs.renameSync(temp, file);
    },
    quarantine: (reason) => {
      warn(`Coach Routines state was ignored: ${reason}`);
      const backup = quarantineFile(file);
      if (backup) warn(`Preserved unsupported Coach Routines state at ${backup}.`);
      return backup;
    }
  };
}

function quarantineFile(file: string): string | undefined {
  if (!fs.existsSync(file)) return undefined;
  let backup = `${file}.bak`;
  if (fs.existsSync(backup)) backup = `${file}.${Date.now()}.bak`;
  try { fs.renameSync(file, backup); return backup; } catch { return undefined; }
}

export class RoutineValidationError extends Error {}

export function normalizeRoutineSourcePath(value: string): string {
  const original = String(value ?? '').trim();
  if (!original || original.length > MAX_PATH) throw new RoutineValidationError('Choose a path inside this Game.');
  if (/^[a-z]:[\\/]/i.test(original) || /^[/\\]{1,2}/.test(original)) throw new RoutineValidationError('Routine sources must be paths inside this Game.');
  const normalized = original.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/').replace(/\/$/, '');
  const segments = normalized.split('/');
  if (!normalized || segments.some((segment) => !segment || segment === '..' || segment === '.')) throw new RoutineValidationError('Routine sources cannot leave the Game folder.');
  const lower = segments.map((segment) => segment.toLowerCase());
  const basename = lower[lower.length - 1];
  if (lower.some((segment) => segment === '.git' || segment === 'node_modules' || segment === '.sideline' || segment === 'secrets')) {
    throw new RoutineValidationError('That location is not available as a routine source.');
  }
  if (lower.some((segment) => segment.startsWith('credentials')) || basename === '.env' || basename.startsWith('.env.')
    || /\.(?:pem|key|pfx)$/.test(basename) || basename.startsWith('id_rsa')) {
    throw new RoutineValidationError('That file is not available as a routine source.');
  }
  return normalized;
}

function normalizedInput(input: RoutineInput, existing?: CoachRoutine, trustPersistedChecks = false): Omit<CoachRoutine, 'id' | 'createdAt' | 'board' | 'players'> {
  const name = String(input.name ?? '').trim();
  if (!name || name.length > MAX_NAME) throw new RoutineValidationError('Routine names must be between 1 and 60 characters.');
  if (!['canonical-refresh', 'map-check', 'custom'].includes(input.template)) throw new RoutineValidationError('Choose a known routine template.');
  const cadence = validateCadence(input.cadence);
  const sources = (input.sources ?? []).map((source): RoutineSource => {
    const normalizedPath = normalizeRoutineSourcePath(source.path);
    const kind = source.kind === 'folder' ? 'folder' : source.kind === 'file' ? 'file' : (() => { throw new RoutineValidationError('Choose file or folder for each source.'); })();
    const prior = existing?.sources.find((candidate) => candidate.path.toLowerCase() === normalizedPath.toLowerCase() && candidate.kind === kind)?.lastCheck;
    const supplied = trustPersistedChecks ? source.lastCheck : prior;
    const lastCheck = supplied && Number.isFinite(supplied.at) && supplied.at >= 0 && ['file', 'folder', 'missing', 'blocked', 'unknown'].includes(supplied.state)
      ? { at: supplied.at, state: supplied.state }
      : undefined;
    return { path: normalizedPath, kind, ...(lastCheck ? { lastCheck } : {}) };
  });
  if (sources.length > MAX_SOURCES) throw new RoutineValidationError(`A routine can use at most ${MAX_SOURCES} sources.`);
  if (new Set(sources.map((source) => source.path.toLowerCase())).size !== sources.length) throw new RoutineValidationError('Routine source paths must be unique.');
  const instruction = String(input.instruction ?? '').trim();
  if (instruction.length > MAX_INSTRUCTION) throw new RoutineValidationError('Routine instructions can be at most 500 characters.');
  const rawScope = input.playersScope ?? existing?.playersScope;
  let playersScope: CoachRoutine['playersScope'];
  if (rawScope) {
    if (rawScope.mode !== 'all' && rawScope.mode !== 'selected') throw new RoutineValidationError('Choose all Players or selected Players.');
    const instanceIds = rawScope.mode === 'selected'
      ? [...new Set((rawScope.instanceIds ?? []).filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))]
      : undefined;
    if ((instanceIds?.length ?? 0) > 50) throw new RoutineValidationError('A routine can target at most 50 exact Players.');
    playersScope = {
      mode: rawScope.mode,
      ...(instanceIds ? { instanceIds } : {}),
      onFirstPlay: rawScope.onFirstPlay ?? existing?.playersScope?.onFirstPlay ?? false
    };
  }
  return {
    name,
    template: input.template,
    enabled: input.enabled ?? existing?.enabled ?? true,
    cadence,
    targets: {
      strategyBoard: input.targets?.strategyBoard ?? existing?.targets.strategyBoard ?? true,
      players: input.targets?.players ?? existing?.targets.players ?? false
    },
    sources,
    ...(instruction ? { instruction } : {}),
    includeLocalRoot: input.includeLocalRoot ?? existing?.includeLocalRoot ?? true,
    ...(playersScope ? { playersScope } : {})
  };
}

function validateCadence(value: RoutineCadence): RoutineCadence {
  if (value?.kind === 'plays' && Number.isInteger(value.every) && value.every >= 1 && value.every <= 100) return { kind: 'plays', every: value.every };
  // Same lazy time cadence either way: an hour-granular value (Hours) or a whole-day
  // value (Days). Both are evaluated by the identical `now - last >= everyMs` check.
  if (value?.kind === 'time' && Number.isInteger(value.everyMs) && value.everyMs >= HOUR_MS && value.everyMs <= 30 * DAY_MS && value.everyMs % HOUR_MS === 0) {
    return { kind: 'time', everyMs: value.everyMs };
  }
  throw new RoutineValidationError('Choose every 1–100 Plays, or a time cadence between 1 hour and 30 days.');
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function emptyState(): CoachRoutinesState { return { version: 1, games: {} }; }

function decodeState(raw: unknown): CoachRoutinesState | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const root = raw as { version?: unknown; games?: unknown };
  if (root.version !== COACH_ROUTINES_VERSION || !root.games || typeof root.games !== 'object' || Array.isArray(root.games)) return undefined;
  const state = emptyState();
  try {
    for (const [gameId, value] of Object.entries(root.games as Record<string, unknown>)) {
      if (!gameId || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid Game state');
      const game = value as Partial<GameRoutineState>;
      if (!Number.isInteger(game.playCount) || (game.playCount ?? -1) < 0 || !Array.isArray(game.countedRefs) || !Array.isArray(game.routines)) throw new Error('invalid counters');
      const decoded: GameRoutineState = {
        gameId,
        playCount: game.playCount!,
        countedRefs: game.countedRefs.filter((ref): ref is string => typeof ref === 'string').slice(-COUNTED_REF_LIMIT),
        players: game.players && typeof game.players === 'object' && !Array.isArray(game.players) ? clone(game.players) : {},
        routines: [],
        defaultsInitialized: game.defaultsInitialized === true
      };
      for (const candidate of game.routines) {
        const routine = candidate as CoachRoutine;
        if (!routine || typeof routine.id !== 'string' || !/^rt_[a-f0-9]+$/.test(routine.id)
          || !Number.isFinite(routine.createdAt) || !routine.board || !Number.isFinite(routine.board.baselineAt)
          || !Number.isInteger(routine.board.baselinePlayCount) || !routine.players || typeof routine.players !== 'object') throw new Error('invalid routine');
        const config = normalizedInput(routine, routine, true);
        decoded.routines.push({
          ...config,
          id: routine.id,
          createdAt: routine.createdAt,
          board: clone(routine.board),
          players: clone(routine.players)
        });
      }
      state.games[gameId] = decoded;
    }
    return state;
  } catch {
    return undefined;
  }
}

export class CoachRoutineEngine {
  private state: CoachRoutinesState;
  onChange: ((gameId: string, urgency: 'deferred' | 'immediate') => void) | undefined;

  constructor(private readonly store: CoachRoutineStore = MEMORY_COACH_ROUTINE_STORE, private readonly now: () => number = Date.now) {
    const raw = store.load();
    if (raw === undefined) this.state = emptyState();
    else {
      const decoded = decodeState(raw);
      if (decoded) this.state = decoded;
      else {
        store.quarantine?.('unsupported version or malformed shape');
        this.state = emptyState();
      }
    }
  }

  hasGame(gameId: string): boolean { return Boolean(this.state.games[gameId]); }
  snapshot(): CoachRoutinesState { return clone(this.state); }
  flush(): void { this.store.save(this.snapshot()); }

  forGame(gameId: string): GameRoutineState {
    return clone(this.state.games[gameId] ?? { gameId, playCount: 0, countedRefs: [], players: {}, routines: [], defaultsInitialized: false });
  }

  create(gameId: string, input: RoutineInput): CoachRoutine {
    const game = this.game(gameId);
    const config = normalizedInput(input);
    const at = this.now();
    const routine: CoachRoutine = {
      ...config,
      id: `rt_${crypto.randomBytes(8).toString('hex')}`,
      createdAt: at,
      board: { baselinePlayCount: game.playCount, baselineAt: at },
      players: {}
    };
    game.routines.push(routine);
    this.changed(gameId, 'immediate');
    return clone(routine);
  }

  update(gameId: string, routineId: string, input: RoutinePatch): CoachRoutine | undefined {
    const game = this.state.games[gameId];
    const routine = game?.routines.find((candidate) => candidate.id === routineId);
    if (!routine) return undefined;
    const config = normalizedInput({
      name: input.name ?? routine.name,
      template: input.template ?? routine.template,
      enabled: input.enabled ?? routine.enabled,
      cadence: input.cadence ?? routine.cadence,
      targets: {
        strategyBoard: input.targets?.strategyBoard ?? routine.targets.strategyBoard,
        players: input.targets?.players ?? routine.targets.players
      },
      sources: input.sources ?? routine.sources,
      instruction: input.instruction ?? routine.instruction,
      includeLocalRoot: input.includeLocalRoot ?? routine.includeLocalRoot,
      playersScope: input.playersScope ?? routine.playersScope
    }, routine);
    Object.assign(routine, config);
    if (Object.prototype.hasOwnProperty.call(input, 'instruction') && !String(input.instruction ?? '').trim()) delete routine.instruction;
    this.changed(gameId, 'immediate');
    return clone(routine);
  }

  remove(gameId: string, routineId: string): boolean {
    const game = this.state.games[gameId];
    if (!game) return false;
    const before = game.routines.length;
    game.routines = game.routines.filter((routine) => routine.id !== routineId);
    if (game.routines.length === before) return false;
    game.defaultsInitialized = true;
    this.changed(gameId, 'immediate');
    return true;
  }

  markDue(gameId: string, routineId: string): CoachRoutine | undefined {
    const routine = this.state.games[gameId]?.routines.find((candidate) => candidate.id === routineId);
    if (!routine) return undefined;
    routine.board.manualDue = true;
    routine.board.manualDueSeq = (routine.board.manualDueSeq ?? 0) + 1;
    this.changed(gameId, 'immediate');
    return clone(routine);
  }

  /** Human amendment: called only on an actual false→true Dev Mode transition. */
  initializeDevModeDefaults(gameId: string): CoachRoutine | undefined {
    const game = this.game(gameId);
    if (game.defaultsInitialized) return undefined;
    game.defaultsInitialized = true;
    if (game.routines.length) {
      this.changed(gameId, 'immediate');
      return undefined;
    }
    const at = this.now();
    const routine: CoachRoutine = {
      id: `rt_${crypto.randomBytes(8).toString('hex')}`,
      name: 'Canonical Refresh',
      template: 'canonical-refresh',
      enabled: true,
      cadence: { kind: 'plays', every: 5 },
      targets: { strategyBoard: true, players: false },
      sources: [],
      includeLocalRoot: true,
      createdAt: at,
      board: { baselinePlayCount: game.playCount, baselineAt: at },
      players: {}
    };
    game.routines.push(routine);
    this.changed(gameId, 'immediate');
    return clone(routine);
  }

  observePlay(input: {
    gameId: string;
    kind: 'received' | 'unknown' | 'queued' | 'failed';
    clientRef?: string;
    queueItemId?: string;
    queueRelease?: boolean;
    playerType?: string;
    executionType?: 'reasoning' | 'direct-shell';
  }): boolean {
    if (!input.gameId || input.kind === 'failed' || input.queueRelease || input.executionType === 'direct-shell' || input.playerType === 'terminal') return false;
    const identity = input.kind === 'queued'
      ? (input.queueItemId ? `queue:${input.queueItemId}` : '')
      : (input.clientRef ? `play:${input.clientRef}` : '');
    if (!identity) return false;
    const game = this.game(input.gameId);
    if (game.countedRefs.includes(identity)) return false;
    game.playCount += 1;
    game.countedRefs.push(identity);
    if (game.countedRefs.length > COUNTED_REF_LIMIT) game.countedRefs.splice(0, game.countedRefs.length - COUNTED_REF_LIMIT);
    this.changed(input.gameId, 'deferred');
    return true;
  }

  project(gameId: string, devMode: boolean, locator: RoutineLocator = {}): RoutinesProjection {
    const game = this.state.games[gameId] ?? { gameId, playCount: 0, countedRefs: [], players: {}, routines: [], defaultsInitialized: false };
    const now = this.now();
    const routines = game.routines.map((routine) => this.view(game, routine, devMode, now));
    const due = routines.filter((view) => view.due && view.cycle);
    const projection: RoutinesProjection = { gameId, devMode, playCount: game.playCount, routines };
    if (devMode && due.length) {
      projection.handoff = {
        text: buildStrategyBoardEnvelope(due, locator),
        deliveries: due.map((view) => ({ routineId: view.id, cycle: view.cycle! })),
        names: due.map((view) => view.name)
      };
    }
    return projection;
  }

  markDelivered(gameId: string, deliveries: Array<{ routineId: string; cycle: string }>, via: RoutineDelivery['via'], reportPath?: string): {
    found: boolean; changed: boolean; alreadyDelivered: boolean; stale: boolean;
  } {
    const game = this.state.games[gameId];
    if (!game || !deliveries.length) return { found: false, changed: false, alreadyDelivered: false, stale: false };
    const now = this.now();
    const checks = deliveries.map((delivery) => {
      const routine = game.routines.find((candidate) => candidate.id === delivery.routineId);
      if (!routine) return { delivery, routine, status: 'missing' as const };
      if (routine.board.lastDelivered?.cycle === delivery.cycle) return { delivery, routine, status: 'already' as const };
      const view = this.view(game, routine, true, now);
      return { delivery, routine, status: view.due && view.cycle === delivery.cycle ? 'current' as const : 'stale' as const };
    });
    if (checks.some((check) => check.status === 'missing')) return { found: false, changed: false, alreadyDelivered: false, stale: false };
    if (checks.some((check) => check.status === 'stale')) return { found: true, changed: false, alreadyDelivered: false, stale: true };
    let changed = false;
    for (const check of checks) {
      if (check.status !== 'current' || !check.routine) continue;
      check.routine.board.lastDelivered = { at: now, playCount: game.playCount, via, cycle: check.delivery.cycle, ...(reportPath ? { reportPath } : {}) };
      check.routine.board.manualDue = false;
      changed = true;
    }
    if (changed) this.changed(gameId, 'immediate');
    return { found: true, changed, alreadyDelivered: !changed, stale: false };
  }

  recordSourceCheck(gameId: string, checkedAt: number, checks: Array<{ path: string; state: RoutineSourceState }>): { updatedCount: number } {
    const game = this.state.games[gameId];
    if (!game || !Number.isFinite(checkedAt) || checkedAt < 0 || !checks.length) return { updatedCount: 0 };
    let updatedCount = 0;
    const checkMap = new Map<string, RoutineSourceState>();
    for (const check of checks) {
      if (!check || typeof check.path !== 'string' || !['file', 'folder', 'missing', 'blocked', 'unknown'].includes(check.state)) continue;
      const key = check.path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/').replace(/\/$/, '').toLowerCase();
      checkMap.set(key, check.state);
    }
    for (const routine of game.routines) {
      for (const source of routine.sources) {
        const sourceKey = source.path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/').replace(/\/$/, '').toLowerCase();
        if (checkMap.has(sourceKey) && (source.lastCheck?.at ?? -1) < checkedAt) {
          const state = checkMap.get(sourceKey)!;
          (source as { lastCheck?: { at: number; state: RoutineSourceState } }).lastCheck = { at: checkedAt, state };
          updatedCount++;
        }
      }
    }
    if (updatedCount > 0) {
      this.changed(gameId, 'immediate');
    }
    return { updatedCount };
  }

  private view(game: GameRoutineState, routine: CoachRoutine, devMode: boolean, now: number): RoutineView {
    const last = routine.board.lastDelivered;
    const hasConfirmedSources = routine.sources.length > 0 && routine.sources.every((source) => source.lastCheck?.state === source.kind);
    const sourceIndependent = routine.sources.length === 0 && (routine.template === 'map-check' || Boolean(routine.instruction));
    const deliverable = routine.targets.strategyBoard && (hasConfirmedSources || sourceIndependent);
    const cadenceEarned = routine.cadence.kind === 'plays'
      ? game.playCount - (last?.playCount ?? routine.board.baselinePlayCount) >= routine.cadence.every
      : now - (last?.at ?? routine.board.baselineAt) >= routine.cadence.everyMs;
    const earned = routine.board.manualDue === true || cadenceEarned;
    const due = routine.enabled && devMode && deliverable && earned;
    const needs = !deliverable && routine.enabled ? 'sources' : (!devMode && routine.enabled && deliverable && earned ? 'devMode' : undefined);
    const cycle = due ? `${routine.id}:${last?.at ?? routine.board.baselineAt}:${routine.board.manualDue ? `m${routine.board.manualDueSeq ?? 1}` : 'c'}` : undefined;
    const sincePlays = game.playCount - (last?.playCount ?? routine.board.baselinePlayCount);
    const elapsed = now - (last?.at ?? routine.board.baselineAt);
    return {
      id: routine.id,
      name: routine.name,
      enabled: routine.enabled,
      template: routine.template,
      cadence: clone(routine.cadence),
      cadenceLabel: routine.cadence.kind === 'plays'
        ? `Every ${routine.cadence.every} Play${routine.cadence.every === 1 ? '' : 's'}`
        : routine.cadence.everyMs % DAY_MS === 0
          ? `Every ${routine.cadence.everyMs / DAY_MS} day${routine.cadence.everyMs === DAY_MS ? '' : 's'}`
          : `Every ${routine.cadence.everyMs / HOUR_MS} hour${routine.cadence.everyMs === HOUR_MS ? '' : 's'}`,
      targets: clone(routine.targets),
      targetsLabel: routine.targets.strategyBoard && routine.targets.players ? 'Strategy Board + Players'
        : routine.targets.strategyBoard ? 'Strategy Board' : routine.targets.players ? 'Players' : 'No target',
      due,
      ...(cycle ? { cycle } : {}),
      lastSentLabel: last
        ? (routine.cadence.kind === 'plays' ? `Last sent: ${sincePlays} Play${sincePlays === 1 ? '' : 's'} ago`
          : elapsed < DAY_MS ? `Last sent: ${Math.max(0, Math.floor(elapsed / HOUR_MS))} hour${Math.floor(elapsed / HOUR_MS) === 1 ? '' : 's'} ago`
          : `Last sent: ${Math.floor(elapsed / DAY_MS)} day${Math.floor(elapsed / DAY_MS) === 1 ? '' : 's'} ago`)
        : 'Last sent: never',
      nextLabel: !routine.enabled ? 'Paused'
        : needs === 'sources' ? 'Needs files — add what to reread'
        : needs === 'devMode' ? 'Due when Dev Mode is on'
        : due ? 'Due now'
        : routine.cadence.kind === 'plays'
          ? `Next: in ${Math.max(0, routine.cadence.every - sincePlays)} Play${Math.max(0, routine.cadence.every - sincePlays) === 1 ? '' : 's'}`
          : routine.cadence.everyMs < DAY_MS
            ? `Next: in ${Math.max(0, Math.ceil((routine.cadence.everyMs - elapsed) / HOUR_MS))} hour${Math.max(0, Math.ceil((routine.cadence.everyMs - elapsed) / HOUR_MS)) === 1 ? '' : 's'}`
            : `Next: in ${Math.max(0, Math.ceil((routine.cadence.everyMs - elapsed) / DAY_MS))} day${Math.max(0, Math.ceil((routine.cadence.everyMs - elapsed) / DAY_MS)) === 1 ? '' : 's'}`,
      ...(needs ? { needs } : {}),
      sources: routine.sources.map((source) => ({ path: source.path, kind: source.kind, state: source.lastCheck?.state ?? 'not-checked' })),
      ...(routine.instruction ? { instruction: routine.instruction } : {}),
      includeLocalRoot: routine.includeLocalRoot
    };
  }

  private game(gameId: string): GameRoutineState {
    if (!gameId) throw new RoutineValidationError('Missing gameId.');
    return this.state.games[gameId] ??= { gameId, playCount: 0, countedRefs: [], players: {}, routines: [], defaultsInitialized: false };
  }

  private changed(gameId: string, urgency: 'deferred' | 'immediate'): void { this.onChange?.(gameId, urgency); }
}

export function buildStrategyBoardEnvelope(views: RoutineView[], locator: RoutineLocator): string {
  const names = views.map((view) => view.name);
  const sources = new Map<string, RoutineView['sources'][number]>();
  for (const view of views) for (const source of view.sources) if (!sources.has(source.path.toLowerCase())) sources.set(source.path.toLowerCase(), source);
  const lines = [
    `=== SIDELINE COACH ROUTINE — ${names.length === 1 ? names[0].toUpperCase() : 'CANONICAL REFRESH'} DUE ===`,
    'Before recommending or drafting the next Play, reread the canonical project sources below and reconcile the report that follows against them.',
    'If you cannot open a source, say so plainly. Do not say you reread something you could not open.',
    'Start your reply by stating what you reread and what you could not open.',
    '',
    `Game: ${locator.displayName || 'Unknown Game'}`
  ];
  const repo = normalizeRepositoryLocator(locator.repoUri);
  if (repo) lines.push(`Repository: ${repo}${locator.branch ? ` · branch ${locator.branch}` : ''}`);
  if (locator.rootFsPath && views.some((view) => view.includeLocalRoot)) lines.push(`Local folder: ${locator.rootFsPath}`);
  if (sources.size) {
    lines.push('Sources (paths inside the Game folder):');
    for (const source of sources.values()) {
      const missing = source.state === 'missing' ? " (Sideline couldn't find this at its last check)" : source.state === 'blocked' ? ' (blocked)' : '';
      lines.push(`- ${source.path}${source.kind === 'folder' ? ' (folder — everything inside)' : ''}${missing}`);
    }
  }
  const instructions = views.map((view) => view.instruction || (view.template === 'map-check' ? 'Give me a Map Check: WAS / IS / NEXT / horizon.' : '')).filter(Boolean);
  if (instructions.length) {
    lines.push('Also:');
    for (const instruction of instructions) lines.push(`- ${instruction}`);
  }
  lines.push('Note: the remote repository may not include unpushed local changes.');
  lines.push('=== END COACH ROUTINE — REPORT FOLLOWS ===', '');
  return lines.join('\n').slice(0, MAX_ENVELOPE);
}

function normalizeRepositoryLocator(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/\.git$/i, '');
  const ssh = /^git@([^:]+):(.+)$/.exec(trimmed);
  if (ssh) return `${ssh[1]}/${ssh[2]}`;
  try {
    const url = new URL(trimmed);
    if (url.username || url.password) return undefined;
    return `${url.host}${url.pathname}`.replace(/\/$/, '');
  } catch { return undefined; }
}
