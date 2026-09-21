/**
 * In-product Scout bootstrap (S31 Slice 4).
 *
 * BREADCRUMB — Coach Refresh product trigger.
 *
 * WAS: Scout qualification existed, but only developer CLI paths could populate
 * the depth chart, so a freshly installed Sideline could never discover its own
 * Scouts even with a working provider credential.
 *
 * IS: after a provider credential is configured, Dad can explicitly authorize
 * bounded in-product Scout tryouts. Sideline reuses Coach Refresh / Combine
 * unchanged (same `refresh-due` policy, same limits, same canonical Scout
 * Intelligence root, same Work ownership and hygiene) and writes canonical
 * evidence with no terminal work and no Game mutation. The trigger is a human
 * action only: there is no scheduler, timer, or activation-time refresh, so the
 * 7-day rule decides what is DUE when Dad asks, never whether to spend.
 *
 * WHY: installing Scout machinery without a product bootstrap leaves Scout
 * functionally unavailable to every new user.
 *
 * WILL BE: Slice 5 can recruit the logical Scout Player against a product-owned,
 * self-maintaining depth chart, and future adaptive coaching may consume the same
 * evidence without changing human authority.
 *
 * Three facts are kept deliberately separate:
 *   CONSENT     did the human authorize tryouts?       -> extension-owned durable state
 *   READINESS   can Scout play right now?                -> derived from depth-chart evidence
 *   RUN         is a tryout session in flight?           -> in-memory only
 * Nothing here is a second health store: status is recomputed from disk every time.
 *
 * No `vscode` import: the memento, credential and runner are injected so the whole
 * contract is unit-testable, and so no secret ever has to pass through this module.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { COMBINE_STALE_MS, type CombineCompletion, type CombineStatus } from './scout-combine';
import { COACH_REFRESH_LIMITS, runCoachRefresh, type CoachRefreshRequest } from './scout-coach-refresh';
import { inspectScoutFormationAvailability } from './scout-formation';

export const SCOUT_BOOTSTRAP_CONSENT_KEY = 'sidelineCoach.scout.bootstrapConsent';

export type ScoutBootstrapConsent = 'not-decided' | 'authorized' | 'declined';

/** The subset of `vscode.Memento` this needs, so it works with globalState and with a plain test fake. */
export interface ConsentMemento {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

interface StoredConsent {
  readonly state: 'authorized' | 'declined';
  readonly decidedAt: string;
}

/**
 * The one durable owner of the human's bootstrap decision. Deliberately not the
 * Game, not a scorecard, not browser storage, and not SecretStorage: it is a
 * preference, not secret material. Absence means "not decided".
 */
export class ScoutBootstrapConsentStore {
  constructor(private readonly memento: ConsentMemento, private readonly now: () => Date = () => new Date()) {}

  read(): { readonly state: ScoutBootstrapConsent; readonly decidedAt?: string } {
    const stored = this.memento.get<StoredConsent>(SCOUT_BOOTSTRAP_CONSENT_KEY);
    if (stored && (stored.state === 'authorized' || stored.state === 'declined') && typeof stored.decidedAt === 'string') {
      return { state: stored.state, decidedAt: stored.decidedAt };
    }
    return { state: 'not-decided' };
  }

  async authorize(): Promise<void> { await this.write('authorized'); }
  async decline(): Promise<void> { await this.write('declined'); }

  private async write(state: StoredConsent['state']): Promise<void> {
    await this.memento.update(SCOUT_BOOTSTRAP_CONSENT_KEY, { state, decidedAt: this.now().toISOString() } satisfies StoredConsent);
  }
}

/** What Settings shows. One word of state; everything else is derived. */
export type ScoutBootstrapPhase =
  | 'credential-required'
  | 'ready-to-find'
  | 'declined'
  | 'holding-tryouts'
  | 'scouts-ready'
  | 'provider-limited'
  | 'no-scouts-ready';

export interface ScoutBootstrapRunSummary {
  readonly endedAt: string;
  readonly tryoutsHeld: number;
  readonly completed: number;
  readonly blocked: number;
  readonly failed: number;
  /** Dad-safe, plain-language notes such as "OpenRouter's model list could not be reached". */
  readonly notes: readonly string[];
  /** True when the session itself could not run (as opposed to running and finding nobody). */
  readonly stopped?: boolean;
}

/** Only these fields ever leave the extension. There is no credential, path, or raw provider error among them. */
export interface ScoutBootstrapStatus {
  readonly phase: ScoutBootstrapPhase;
  readonly consent: ScoutBootstrapConsent;
  readonly credentialConfigured: boolean;
  /** Scout receivers currently READY in the canonical depth chart. */
  readonly readyCount: number;
  /** Receivers whose last result was an infrastructure condition, not a quality verdict. */
  readonly providerLimitedCount: number;
  readonly holdingTryouts: boolean;
  /** Find Scouts is offered (consent not yet given, or previously declined). */
  readonly canFind: boolean;
  /** Refresh Scouts is offered (consent already given). */
  readonly canRefresh: boolean;
  readonly maxTryouts: number;
  /** A receiver is only re-tried when it is new or its last tryout is at least this old. */
  readonly staleDays: number;
  readonly lastRun?: ScoutBootstrapRunSummary;
}

/**
 * Statuses that describe the provider, account or catalog, never a Player's quality.
 *
 * These are exactly the statuses Combine derives from BLOCKED attempts (plus a model that
 * vanished from the catalog). `CALL BACK LATER` is deliberately NOT here: Combine derives it
 * from a FAILED attempt and counts that in `totals.failures`, so it is quality film, and
 * `LIMITED` / `UNKNOWN` describe the result or the outcome, not the provider. Calling any of
 * those "provider limited" would tell Dad a model was blocked when it simply did not qualify.
 */
const INFRASTRUCTURE_STATUSES: ReadonlySet<CombineStatus> = new Set<CombineStatus>(['RATE LIMITED', 'AUTH ISSUE', 'PROVIDER UNSTABLE', 'UNAVAILABLE']);

export class ScoutBootstrapError extends Error {
  constructor(message: string, readonly code: 'disabled' | 'credential-required' | 'authorization-required' | 'already-running') {
    super(message);
    this.name = 'ScoutBootstrapError';
  }
}

export interface ScoutBootstrapOptions {
  /** The canonical Scout Intelligence root (S34). The only place evidence is read or written. */
  readonly scoutIntelligenceRoot: string;
  readonly consent: ScoutBootstrapConsentStore;
  /** Boolean state only. The key itself is never requested through this. */
  readonly credentialConfigured: () => Promise<boolean>;
  /** Trusted runtime resolver (VS Code SecretStorage). The value goes only to Combine's execution environment. */
  readonly resolveOpenRouterApiKey: () => PromiseLike<string | undefined>;
  /** The existing entitlement seam (`coach.scout.enabled`). */
  readonly enabled?: () => boolean;
  /** Test seam. Defaults to the real Coach Refresh, unchanged. */
  readonly runRefresh?: (request: CoachRefreshRequest) => Promise<CombineCompletion>;
  /** Called after a session ends so the capability snapshot can be republished. */
  readonly onFinished?: () => void;
  readonly log?: (message: string) => void;
}

/**
 * ONE SESSION PER MACHINE.
 *
 * Several VS Code windows share one Scout Intelligence root, and each has its own in-memory
 * run flag. Without a shared guard a second window would offer "Refresh Scouts" mid-session and
 * start a second session: double provider spend, both selecting the same due receivers (a
 * scorecard only changes when a receiver finishes), and two writers on the same scorecards.
 *
 * The guard is a tiny file created with an exclusive flag, so exactly one process can win. It
 * is deliberately small: it records who holds it, and it is treated as stale if that process
 * is gone or it is older than any session could plausibly last (5 tryouts, 2 at a time, each
 * capped at 5 minutes by Combine). A crashed session therefore can never wedge Scout.
 */
const LOCK_FILE = '.coach-refresh.lock';
export const REFRESH_LOCK_MAX_AGE_MS = 30 * 60_000;

interface LockRecord { readonly pid: number; readonly startedAt: number }

function lockPath(scoutIntelligenceRoot: string): string {
  return path.join(path.resolve(scoutIntelligenceRoot), 'Work', LOCK_FILE);
}

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; } // exists, just not ours to signal
}

function lockIsStale(file: string, now: number): boolean {
  let record: LockRecord | undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<LockRecord>;
    if (Number.isInteger(parsed.pid) && typeof parsed.startedAt === 'number') record = { pid: parsed.pid as number, startedAt: parsed.startedAt };
  } catch { /* unreadable: decided below */ }
  if (!record) {
    // Unreadable is most likely a writer caught mid-write, so only an old file is stale.
    try { return now - fs.statSync(file).mtimeMs > 60_000; } catch { return true; }
  }
  return now - record.startedAt > REFRESH_LOCK_MAX_AGE_MS || !processAlive(record.pid);
}

/** True while another live process holds a session. Read-only. */
export function refreshLockHeld(scoutIntelligenceRoot: string, now = Date.now()): boolean {
  const file = lockPath(scoutIntelligenceRoot);
  return fs.existsSync(file) && !lockIsStale(file, now);
}

function acquireRefreshLock(scoutIntelligenceRoot: string, now = Date.now()): boolean {
  const file = lockPath(scoutIntelligenceRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: now } satisfies LockRecord), { flag: 'wx' });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (!lockIsStale(file, now)) return false;
      try { fs.unlinkSync(file); } catch { /* another process cleared it first */ }
    }
  }
  return false;
}

function releaseRefreshLock(scoutIntelligenceRoot: string): void {
  const file = lockPath(scoutIntelligenceRoot);
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<LockRecord>;
    if (record.pid === process.pid) fs.unlinkSync(file); // never release a lock someone else holds
  } catch { /* already gone */ }
}

function redact(text: string, secret: string | undefined): string {
  return secret && secret.length >= 4 ? text.split(secret).join('[REDACTED]') : text;
}

export class ScoutBootstrapService {
  private running = false;
  private lastRun: ScoutBootstrapRunSummary | undefined;

  constructor(private readonly options: ScoutBootstrapOptions) {}

  /** Recomputed from durable evidence on every call. Never spends, never starts anything. */
  async status(gameRoot: string): Promise<ScoutBootstrapStatus> {
    const consent = this.options.consent.read().state;
    const credentialConfigured = await this.options.credentialConfigured();
    const availability = inspectScoutFormationAvailability({ gameRoot, durableReportRoot: this.options.scoutIntelligenceRoot });
    const readyCount = availability.eligibleIds.length;
    const providerLimitedCount = countInfrastructureLimited(this.options.scoutIntelligenceRoot);

    const holding = this.running || refreshLockHeld(this.options.scoutIntelligenceRoot);
    let phase: ScoutBootstrapPhase;
    if (holding) phase = 'holding-tryouts';
    else if (readyCount > 0) phase = 'scouts-ready';
    else if (!credentialConfigured) phase = 'credential-required';
    else if (consent === 'declined') phase = 'declined';
    else if (consent === 'not-decided') phase = 'ready-to-find';
    else phase = providerLimitedCount > 0 ? 'provider-limited' : 'no-scouts-ready';

    return {
      phase,
      consent,
      credentialConfigured,
      readyCount,
      providerLimitedCount,
      holdingTryouts: holding,
      canFind: credentialConfigured && !holding && consent !== 'authorized',
      canRefresh: credentialConfigured && !holding && consent === 'authorized',
      maxTryouts: COACH_REFRESH_LIMITS.maxTryouts,
      staleDays: Math.round(COMBINE_STALE_MS / 86_400_000),
      ...(this.lastRun ? { lastRun: this.lastRun } : {})
    };
  }

  /**
   * The explicit human authorization ("Start tryouts"). Records consent, then
   * starts one bounded session in the background and returns immediately.
   */
  async authorizeAndStart(gameRoot: string): Promise<ScoutBootstrapStatus> {
    await this.assertMayStart();
    await this.options.consent.authorize();
    this.begin(gameRoot);
    return this.status(gameRoot);
  }

  /** "Not now". Recorded so Dad is not asked again on every render; a manual action stays available. */
  async decline(gameRoot: string): Promise<ScoutBootstrapStatus> {
    await this.options.consent.decline();
    return this.status(gameRoot);
  }

  /** "Refresh Scouts": reuses the standing authorization, with no second consent ceremony. */
  async refresh(gameRoot: string): Promise<ScoutBootstrapStatus> {
    await this.assertMayStart();
    if (this.options.consent.read().state !== 'authorized') {
      throw new ScoutBootstrapError('Authorize Scout tryouts first.', 'authorization-required');
    }
    this.begin(gameRoot);
    return this.status(gameRoot);
  }

  private async assertMayStart(): Promise<void> {
    if (this.options.enabled?.() === false) throw new ScoutBootstrapError('Scout is not enabled.', 'disabled');
    if (this.running || refreshLockHeld(this.options.scoutIntelligenceRoot)) throw new ScoutBootstrapError('Scout tryouts are already running.', 'already-running');
    if (!(await this.options.credentialConfigured())) {
      throw new ScoutBootstrapError('Connect OpenRouter before finding Scouts.', 'credential-required');
    }
  }

  /** Synchronously claims the run slot, so two rapid requests can never start two sessions. */
  private begin(gameRoot: string): void {
    if (this.running) throw new ScoutBootstrapError('Scout tryouts are already running.', 'already-running');
    if (!acquireRefreshLock(this.options.scoutIntelligenceRoot)) {
      throw new ScoutBootstrapError('Scout tryouts are already running in another Sideline window.', 'already-running');
    }
    this.running = true;
    void this.execute(gameRoot);
  }

  private async execute(gameRoot: string): Promise<void> {
    let secret: string | undefined;
    try {
      const completion = await (this.options.runRefresh ?? runCoachRefresh)({
        gameRoot: path.resolve(gameRoot),
        // Canonical root only. No workspaceRoot: Combine derives <Scout Intelligence>/Work itself (S37),
        // so working state can never default into the Game.
        durableReportRoot: this.options.scoutIntelligenceRoot,
        resolveOpenRouterApiKey: async () => { secret = await this.options.resolveOpenRouterApiKey(); return secret; }
      });
      this.lastRun = summarize(completion);
    } catch (error) {
      const message = redact(error instanceof Error ? error.message : String(error), secret);
      this.options.log?.(`[Sideline Coach] Scout tryouts stopped: ${message.slice(0, 300)}`);
      this.lastRun = {
        endedAt: new Date().toISOString(), tryoutsHeld: 0, completed: 0, blocked: 0, failed: 0, stopped: true,
        notes: ['Scout tryouts stopped before finishing. Nothing was lost; you can try again later.']
      };
    } finally {
      this.running = false;
      try { releaseRefreshLock(this.options.scoutIntelligenceRoot); } catch { /* a stale lock expires by itself */ }
      try { this.options.onFinished?.(); } catch { /* republishing is best-effort */ }
    }
  }
}

function summarize(completion: CombineCompletion): ScoutBootstrapRunSummary {
  const notes: string[] = [];
  for (const source of completion.discovery.sources) {
    if (source.available) continue;
    notes.push(source.id === 'openrouter'
      ? "OpenRouter's model list could not be reached."
      : "Scout's tooling (OpenCode) could not be used on this computer.");
  }
  if (completion.prospectsDue === 0 && completion.prospectsDiscovered > 0 && notes.length === 0) {
    notes.push('Nothing was due for a tryout right now.');
  }
  return {
    endedAt: completion.endedAt,
    tryoutsHeld: completion.prospectsSelected,
    completed: completion.tryoutsCompleted,
    blocked: completion.tryoutsBlocked,
    failed: completion.tryoutsFailed,
    notes
  };
}

/**
 * How many receivers' last result was an infrastructure condition. Shared with Scout's
 * readiness label so the Team card and Settings never disagree about "provider limited".
 * Tolerant: one unreadable scorecard never breaks the count.
 */
export function countInfrastructureLimited(scoutIntelligenceRoot: string): number {
  const dir = path.join(path.resolve(scoutIntelligenceRoot), 'Combine', 'Scorecards');
  let names: string[];
  try { names = fs.readdirSync(dir).filter((name) => name.endsWith('.json')); } catch { return 0; }
  let count = 0;
  for (const name of names) {
    try {
      const card = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as { currentStatus?: CombineStatus };
      if (card.currentStatus && INFRASTRUCTURE_STATUSES.has(card.currentStatus)) count += 1;
    } catch { /* skip */ }
  }
  return count;
}
