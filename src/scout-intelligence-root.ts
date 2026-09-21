import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const SCOUT_INTELLIGENCE_DIRNAME = 'Scout Intelligence';
export const SCOUT_INTELLIGENCE_ROOT_ENV = 'SIDELINE_SCOUT_INTELLIGENCE_ROOT';
export const DEVELOPMENT_EXTENSION_MODE = 2;

/** Sideline-owned working state for in-flight Scout execution. Never durable evidence, never a Game folder. */
export const SCOUT_WORK_LANE = 'Work';

const REQUIRED_LANES = [
  path.join('Combine', 'Scorecards'),
  path.join('Combine', 'Runs'),
  'Formations',
  'Player Verification',
  SCOUT_WORK_LANE
] as const;

const LEGACY_MIGRATION_LANES = [
  path.join('Combine', 'Scorecards'),
  'Player Verification',
  'Formations'
] as const;

export interface ScoutIntelligenceRootOptions {
  readonly extensionMode: number;
  readonly globalStorageFsPath: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDir?: string;
}

export type ScoutIntelligenceMigrationResult =
  | 'migrated'
  | 'destination-non-empty'
  | 'legacy-missing'
  | 'legacy-empty';

/**
 * The shared development root deliberately follows Sideline's existing
 * ~/.sideline runtime convention. The harness supplies the explicit override;
 * the fallback keeps direct Extension Development Host launches and developer
 * Scout CLIs on the same Sideline-owned root.
 */
export function resolveDevelopmentScoutIntelligenceRoot(options: {
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDir?: string;
} = {}): string {
  const env = options.env ?? process.env;
  const explicit = env[SCOUT_INTELLIGENCE_ROOT_ENV]?.trim();
  if (explicit) return path.resolve(explicit);

  const sidelineDir = env.SIDELINE_DIR?.trim() || path.join(options.homeDir ?? os.homedir(), '.sideline');
  return path.resolve(sidelineDir, SCOUT_INTELLIGENCE_DIRNAME);
}

/**
 * SCOUT INTELLIGENCE ROOT OWNERSHIP
 *
 * WAS: Durable Scout evidence lived under the extension source/install
 * directory.
 *
 * IS: Installed Sideline uses extension global storage; development uses an
 * explicit Sideline-owned shared root because harness profiles are
 * intentionally isolated.
 *
 * WHY: Scout Intelligence belongs to Sideline and must survive extension
 * updates while remaining one shared department across Games.
 *
 * WILL BE: Future ReportSource, Coach Refresh bootstrap, working-root
 * relocation, and Virtual Players consume this canonical root rather than
 * inventing storage.
 */
export function resolveScoutIntelligenceRoot(options: ScoutIntelligenceRootOptions): string {
  if (options.extensionMode === DEVELOPMENT_EXTENSION_MODE) {
    return resolveDevelopmentScoutIntelligenceRoot(options);
  }
  if (!path.isAbsolute(options.globalStorageFsPath)) {
    throw new Error('globalStorageFsPath must be absolute.');
  }
  return path.join(path.resolve(options.globalStorageFsPath), SCOUT_INTELLIGENCE_DIRNAME);
}

/**
 * The working root for a given Scout Intelligence root. Derived only from that
 * root: it can never depend on, or land inside, the Game being scouted.
 */
export function resolveScoutWorkRoot(scoutIntelligenceRoot: string): string {
  return path.join(path.resolve(scoutIntelligenceRoot), SCOUT_WORK_LANE);
}

export function ensureScoutIntelligenceRoot(root: string): void {
  const resolved = path.resolve(root);
  for (const lane of REQUIRED_LANES) {
    fs.mkdirSync(path.join(resolved, lane), { recursive: true });
  }
}

function hasEntries(root: string): boolean {
  try {
    return fs.readdirSync(root).length > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function existingMigrationLanes(legacyRoot: string): string[] {
  return LEGACY_MIGRATION_LANES.filter((lane) => fs.existsSync(path.join(legacyRoot, lane)));
}

/**
 * Copies only the S31-approved durable lanes through a sibling staging folder.
 * The legacy tree is never moved or deleted. A populated destination always
 * wins, so activation cannot merge competing depth-chart truth.
 */
export function migrateLegacyScoutIntelligence(options: {
  readonly legacyRoot: string;
  readonly destinationRoot: string;
}): ScoutIntelligenceMigrationResult {
  const legacyRoot = path.resolve(options.legacyRoot);
  const destinationRoot = path.resolve(options.destinationRoot);
  if (!fs.existsSync(legacyRoot)) return 'legacy-missing';
  if (hasEntries(destinationRoot)) return 'destination-non-empty';

  const lanes = existingMigrationLanes(legacyRoot);
  if (lanes.length === 0) return 'legacy-empty';

  const parent = path.dirname(destinationRoot);
  fs.mkdirSync(parent, { recursive: true });
  const stagingRoot = path.join(parent, `.${path.basename(destinationRoot)}.migration-${process.pid}-${Date.now()}`);

  try {
    fs.mkdirSync(stagingRoot, { recursive: false });
    for (const lane of lanes) {
      fs.cpSync(path.join(legacyRoot, lane), path.join(stagingRoot, lane), {
        recursive: true,
        errorOnExist: true,
        preserveTimestamps: true
      });
    }

    if (fs.existsSync(destinationRoot)) {
      if (hasEntries(destinationRoot)) return 'destination-non-empty';
      fs.rmdirSync(destinationRoot);
    }

    try {
      fs.renameSync(stagingRoot, destinationRoot);
    } catch (error) {
      if (hasEntries(destinationRoot)) return 'destination-non-empty';
      throw error;
    }
    return 'migrated';
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}
