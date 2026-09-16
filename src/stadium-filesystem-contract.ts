/**
 * S7 Stadium-side projection of the Control Plane's durable filesystem contract.
 *
 * This cache is deliberately memory-only. The Control Plane remains the sole
 * durable owner and re-applies the current revision whenever the Game reconnects.
 */

import { isBlockedRelativePath, validateRelativeGamePath } from './game-files';
import type { FolderState, ReportLaneRecord } from './game-filesystem-contract';

export interface GameFilesystemApplyParams {
  gameId: string;
  revision: number;
  reports: { path?: string; state: FolderState };
  lanes: Record<string, ReportLaneRecord>;
}

export interface AppliedGameFilesystemContract {
  gameId: string;
  revision: number;
  reportsPath?: string;
  reportsReady: boolean;
  lanes: Record<string, ReportLaneRecord>;
}

export type GameFilesystemApplyResult = {
  success: true;
  gameId: string;
  revision: number;
  applied: boolean;
  stale: boolean;
  reportsChanged: boolean;
};

export class StadiumFilesystemContractCache {
  private applied: AppliedGameFilesystemContract | undefined;

  get current(): Readonly<AppliedGameFilesystemContract> | undefined { return this.applied; }

  apply(params: GameFilesystemApplyParams): GameFilesystemApplyResult {
    if (!params.gameId || !Number.isSafeInteger(params.revision) || params.revision < 0) {
      throw new Error('Filesystem contract apply requires a Game and a non-negative integer revision.');
    }
    if (!params.reports || typeof params.reports.state !== 'string' || !params.lanes || typeof params.lanes !== 'object') {
      throw new Error('Filesystem contract apply payload is incomplete.');
    }

    const previous = this.applied;
    if (previous && previous.gameId !== params.gameId) {
      throw new Error(`Filesystem contract cache belongs to '${previous.gameId}', not '${params.gameId}'.`);
    }
    if (previous && params.revision < previous.revision) {
      return { success: true, gameId: params.gameId, revision: previous.revision, applied: false, stale: true, reportsChanged: false };
    }
    if (previous && params.revision === previous.revision) {
      return { success: true, gameId: params.gameId, revision: previous.revision, applied: false, stale: false, reportsChanged: false };
    }

    let reportsPath: string | undefined;
    const reportsReady = params.reports.state === 'ready' && typeof params.reports.path === 'string';
    if (reportsReady) {
      const checked = validateRelativeGamePath(params.reports.path!);
      if (!checked.valid || isBlockedRelativePath(checked.normalized)) {
        throw new Error(`Canonical Reports root is not a safe Game-relative path: ${checked.reason ?? params.reports.path}`);
      }
      reportsPath = checked.normalized;
    }

    const next: AppliedGameFilesystemContract = {
      gameId: params.gameId,
      revision: params.revision,
      reportsPath,
      reportsReady: Boolean(reportsPath),
      lanes: { ...params.lanes }
    };
    const reportsChanged = !previous
      || previous.reportsReady !== next.reportsReady
      || previous.reportsPath !== next.reportsPath
      || JSON.stringify(previous.lanes) !== JSON.stringify(next.lanes);
    this.applied = next;
    return { success: true, gameId: params.gameId, revision: params.revision, applied: true, stale: false, reportsChanged };
  }

  /** Canonical lane first; legacy path interpretation remains a caller fallback. */
  canonicalAgent(relativePath: string, platform: NodeJS.Platform = process.platform): string | undefined {
    const root = this.applied?.reportsReady ? this.applied.reportsPath : undefined;
    if (!root) return undefined;
    const reportSegments = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    const rootSegments = root.split('/').filter(Boolean);
    const equal = (left: string, right: string): boolean => platform === 'win32'
      ? left.toLowerCase() === right.toLowerCase()
      : left === right;
    if (reportSegments.length <= rootSegments.length || !rootSegments.every((segment, index) => equal(segment, reportSegments[index]))) {
      return undefined;
    }
    // A file directly under the root has no lane segment.
    if (reportSegments.length === rootSegments.length + 1) return 'Unknown Agent';
    const folder = reportSegments[rootSegments.length];
    const lane = Object.values(this.applied?.lanes ?? {}).find((candidate) => candidate.folder.toLowerCase() === folder.toLowerCase());
    return lane?.key ?? folder;
  }
}
