/**
 * S6 — durable ownership of every Game's filesystem contract.
 *
 * The Control Plane decides and remembers; the exact Game's Stadium observes. The
 * daemon may not share the Stadium's filesystem at all (remote Extension Hosts), so
 * it never inspects a Game directly: it asks for evidence and applies a pure
 * decision to durable, Game-keyed state.
 *
 * S6 performs NO Game filesystem mutation. A decision that reaches "create
 * Reports-SLC" is recorded as a pending action for a later slice.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  GAME_FILESYSTEM_SCHEMA_VERSION,
  applyEvidenceToContract,
  contractDecisionEquals,
  createEmptyContract,
  pathsToVerify,
  projectGameSetup,
  type CanonicalFolder,
  type GameFilesystemContract,
  type GameFilesystemEvidence,
  type GameFilesystemStoreFile,
  type GameSetupView
} from '../game-filesystem-contract';

export interface GameFilesystemStore {
  load(): GameFilesystemStoreFile | undefined;
  save(state: GameFilesystemStoreFile): void;
  quarantine(reason: string): string | undefined;
}

/** Atomic store beside the other durable Control Plane records. */
export function fileGameFilesystemStore(file: string, warn: (message: string) => void = () => undefined): GameFilesystemStore {
  const quarantineFile = (): string | undefined => {
    if (!fs.existsSync(file)) return undefined;
    let backup = `${file}.bak`;
    if (fs.existsSync(backup)) backup = `${file}.${Date.now()}.bak`;
    try {
      fs.renameSync(file, backup);
      return backup;
    } catch {
      return undefined;
    }
  };

  return {
    load: () => {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8')) as GameFilesystemStoreFile;
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined;
        warn(`Game filesystem state could not be read: ${error instanceof Error ? error.message : String(error)}`);
        const backup = quarantineFile();
        if (backup) warn(`Preserved unreadable Game filesystem state at ${backup}.`);
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
      warn(`Game filesystem state was ignored: ${reason}`);
      const backup = quarantineFile();
      if (backup) warn(`Preserved unsupported Game filesystem state at ${backup}.`);
      return backup;
    }
  };
}

export interface EvidenceRequest {
  gameId: string;
  /** Contract paths whose current state the Stadium must confirm. */
  checkPaths: string[];
}

/** Returns undefined when the exact Game's Stadium cannot supply evidence. */
export type GameFilesystemEvidenceProvider = (request: EvidenceRequest) => Promise<GameFilesystemEvidence | undefined>;

export interface ReconcileResult {
  gameId: string;
  contract: GameFilesystemContract;
  /** False when no evidence was available, so nothing was re-decided. */
  inspected: boolean;
  changed: boolean;
  reason?: 'no-evidence' | 'wrong-game';
}

export interface GameFilesystemCoordinatorOptions {
  evidenceProvider: GameFilesystemEvidenceProvider;
  warn?: (message: string) => void;
  now?: () => Date;
}

export class GameFilesystemCoordinator {
  private state: GameFilesystemStoreFile;
  private readonly inflight = new Map<string, Promise<ReconcileResult>>();
  private readonly rerun = new Set<string>();
  private readonly warn: (message: string) => void;
  private readonly now: () => Date;

  /** Fired after a persisted decision change, so status can be rebroadcast. */
  onChange: ((gameId: string) => void) | undefined;

  constructor(private readonly store: GameFilesystemStore, private readonly options: GameFilesystemCoordinatorOptions) {
    this.warn = options.warn ?? (() => undefined);
    this.now = options.now ?? (() => new Date());
    this.state = this.loadState();
  }

  private loadState(): GameFilesystemStoreFile {
    const loaded = this.store.load();
    if (!loaded) return { schemaVersion: GAME_FILESYSTEM_SCHEMA_VERSION, games: {} };
    if (loaded.schemaVersion !== GAME_FILESYSTEM_SCHEMA_VERSION || typeof loaded.games !== 'object' || !loaded.games) {
      // Everything except an explicit human choice is re-derivable from evidence.
      const humanChoices = Object.values(loaded.games ?? {})
        .filter((contract) => contract?.reports?.provenance === 'human' || contract?.sop?.provenance === 'human')
        .map((contract) => contract.gameId);
      this.store.quarantine(
        `unsupported schemaVersion ${String(loaded.schemaVersion)}${humanChoices.length ? `; human-selected folders for ${humanChoices.join(', ')} must be re-chosen` : ''}`
      );
      return { schemaVersion: GAME_FILESYSTEM_SCHEMA_VERSION, games: {} };
    }
    return loaded;
  }

  private persist(): void {
    try {
      this.store.save(this.state);
    } catch (error) {
      this.warn(`Game filesystem state could not be saved: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Durable contract for one Game. Never falls back to another Game's state. */
  get(gameId: string): GameFilesystemContract | undefined {
    return gameId ? this.state.games[gameId] : undefined;
  }

  knows(gameId: string): boolean {
    return Boolean(this.get(gameId));
  }

  projection(gameId: string, canChange: boolean): GameSetupView {
    return projectGameSetup(this.get(gameId), canChange);
  }

  /** Dev-Mode-only detail. Never part of the Dad-facing projection. */
  diagnostics(gameId: string): Record<string, unknown> | undefined {
    const contract = this.get(gameId);
    if (!contract) return undefined;
    return {
      schemaVersion: contract.schemaVersion,
      revision: contract.revision,
      lastInspectedAt: contract.lastInspectedAt,
      pendingReportsAction: contract.pendingReportsAction,
      reports: contract.reports,
      sop: contract.sop
    };
  }

  async reconcile(gameId: string): Promise<ReconcileResult> {
    if (!gameId) {
      return { gameId, contract: createEmptyContract(gameId), inspected: false, changed: false, reason: 'no-evidence' };
    }
    const existing = this.inflight.get(gameId);
    if (existing) {
      // Coalesce, then run exactly once more so a late request still sees fresh evidence.
      this.rerun.add(gameId);
      return existing;
    }
    const run = this.runReconcile(gameId).finally(() => {
      this.inflight.delete(gameId);
      if (this.rerun.delete(gameId)) void this.reconcile(gameId).catch(() => undefined);
    });
    this.inflight.set(gameId, run);
    return run;
  }

  private async runReconcile(gameId: string): Promise<ReconcileResult> {
    const current = this.state.games[gameId] ?? createEmptyContract(gameId);
    let evidence: GameFilesystemEvidence | undefined;
    try {
      evidence = await this.options.evidenceProvider({ gameId, checkPaths: pathsToVerify(current) });
    } catch (error) {
      this.warn(`Game filesystem evidence failed for ${gameId}: ${error instanceof Error ? error.message : String(error)}`);
      evidence = undefined;
    }
    if (!evidence) {
      // Offline/unsupported Stadium: keep the last durable answer rather than guess.
      return { gameId, contract: current, inspected: false, changed: false, reason: 'no-evidence' };
    }
    if (evidence.gameId !== gameId) {
      this.warn(`Discarded Game filesystem evidence for '${evidence.gameId}' answered against '${gameId}'.`);
      return { gameId, contract: current, inspected: false, changed: false, reason: 'wrong-game' };
    }

    const decided = applyEvidenceToContract(current, evidence, this.now().toISOString());
    const changed = !contractDecisionEquals(current, decided);
    const next: GameFilesystemContract = { ...decided, revision: changed ? current.revision + 1 : current.revision };
    this.state.games[gameId] = next;
    this.persist();
    if (changed) this.onChange?.(gameId);
    return { gameId, contract: next, inspected: true, changed };
  }

  /**
   * Storage seam for the later Settings picker: an explicit human choice outranks
   * automatic detection and is never overwritten by re-detection.
   */
  recordHumanChoice(gameId: string, kind: 'reports' | 'sop', folderPath: string): GameFilesystemContract {
    const current = this.state.games[gameId] ?? createEmptyContract(gameId);
    const now = this.now().toISOString();
    const chosen: CanonicalFolder = { path: folderPath, provenance: 'human', state: 'ready', decidedAt: now, verifiedAt: now };
    const next: GameFilesystemContract = {
      ...current,
      revision: current.revision + 1,
      ...(kind === 'reports'
        ? { reports: { ...chosen, lanes: current.reports.lanes ?? {} } }
        : { sop: chosen })
    };
    if (kind === 'reports') delete next.pendingReportsAction;
    this.state.games[gameId] = next;
    this.persist();
    this.onChange?.(gameId);
    return next;
  }

  /** "Use automatic" — clears the human decision so detection may decide again. */
  clearChoice(gameId: string, kind: 'reports' | 'sop'): GameFilesystemContract {
    const current = this.state.games[gameId] ?? createEmptyContract(gameId);
    const next: GameFilesystemContract = {
      ...current,
      revision: current.revision + 1,
      ...(kind === 'reports'
        ? { reports: { provenance: 'none', state: 'not-set', lanes: current.reports.lanes ?? {} } }
        : { sop: { provenance: 'none', state: 'not-set' } })
    };
    this.state.games[gameId] = next;
    this.persist();
    this.onChange?.(gameId);
    return next;
  }
}
