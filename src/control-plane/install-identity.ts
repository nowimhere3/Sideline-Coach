import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { base32Lower } from './host-identity';

/**
 * S57.2 C0 — durable install identity.
 *
 * One random, pseudonymous id per Sideline home (`~/.sideline`), created once and
 * never rewritten. It exists whether or not Remote is enabled and is deliberately
 * NOT the relay `hostPublicId` (that id is public to the relay and only exists once
 * Remote is turned on). Future license binding and product telemetry read it; this
 * module never sends it anywhere and nothing in the product depends on it yet.
 *
 * Why now: an install's creation time cannot be backfilled later, and it is what lets
 * a launch cohort be recognized without a backend.
 */

export const INSTALL_IDENTITY_FILE = 'install.json';
export const INSTALL_IDENTITY_VERSION = 1;
const INSTALL_ID_PATTERN = /^[a-z2-7]{26}$/;
const MAX_FILE_BYTES = 4_096;
const MAX_ATTEMPTS = 3;

export interface InstallIdentity {
  readonly v: typeof INSTALL_IDENTITY_VERSION;
  /** 128 random bits, lowercase base32 (26 chars). */
  readonly installId: string;
  /** Epoch ms of first creation. */
  readonly createdAt: number;
}

/**
 * `created`   this call wrote the file
 * `loaded`    an existing valid file was read (including one a concurrent start just won)
 * `recovered` a malformed file was quarantined beside it and a fresh identity created
 */
export type InstallIdentityStatus = 'created' | 'loaded' | 'recovered';

export interface InstallIdentityResult {
  readonly identity: InstallIdentity;
  readonly status: InstallIdentityStatus;
  /** Quarantine file name, when a malformed identity was set aside. */
  readonly quarantined?: string;
}

export function parseInstallIdentity(text: string): InstallIdentity | undefined {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return undefined; }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const candidate = parsed as Partial<InstallIdentity>;
  if (candidate.v !== INSTALL_IDENTITY_VERSION) return undefined;
  if (typeof candidate.installId !== 'string' || !INSTALL_ID_PATTERN.test(candidate.installId)) return undefined;
  if (typeof candidate.createdAt !== 'number' || !Number.isFinite(candidate.createdAt) || candidate.createdAt <= 0) return undefined;
  return { v: INSTALL_IDENTITY_VERSION, installId: candidate.installId, createdAt: candidate.createdAt };
}

export function generateInstallId(randomBytes: (size: number) => Buffer = crypto.randomBytes): string {
  return base32Lower(randomBytes(16));
}

/**
 * Returns the durable install identity for `sidelineDir`, creating it exactly once.
 *
 * Concurrency: the file is written to a unique temp file and published with `linkSync`,
 * which fails with EEXIST instead of replacing a file another process created first;
 * the loser simply loads the winner. A malformed file is never silently overwritten:
 * it is renamed aside (only if its bytes are unchanged at that moment) and a fresh
 * identity is published through the same create-once path.
 *
 * Throws only for genuine filesystem failures (for example an unwritable home); the
 * daemon treats that as "no install identity" and carries on.
 */
export function ensureInstallIdentity(
  sidelineDir: string,
  options: { now?: () => number; randomBytes?: (size: number) => Buffer } = {}
): InstallIdentityResult {
  const now = options.now ?? Date.now;
  const randomBytes = options.randomBytes ?? crypto.randomBytes;
  const file = path.join(sidelineDir, INSTALL_IDENTITY_FILE);
  fs.mkdirSync(sidelineDir, { recursive: true });

  let quarantined: string | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const existing = readIfPresent(file);
    if (existing !== undefined) {
      const identity = parseInstallIdentity(existing);
      if (identity) return { identity, status: quarantined ? 'recovered' : 'loaded', ...(quarantined ? { quarantined } : {}) };
      // Malformed: set it aside only if nobody replaced it since we read it.
      const aside = `${INSTALL_IDENTITY_FILE}.malformed-${now()}-${crypto.randomBytes(4).toString('hex')}`;
      if (readIfPresent(file) === existing) {
        try {
          fs.renameSync(file, path.join(sidelineDir, aside));
          quarantined = aside;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
      }
      continue;
    }

    const identity: InstallIdentity = { v: INSTALL_IDENTITY_VERSION, installId: generateInstallId(randomBytes), createdAt: now() };
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(tmp, `${JSON.stringify(identity, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.linkSync(tmp, file);
      return { identity, status: quarantined ? 'recovered' : 'created', ...(quarantined ? { quarantined } : {}) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      // A concurrent start won the race: loop and load its identity.
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* temp already gone */ }
    }
  }
  throw new Error('Install identity could not be established after repeated concurrent changes.');
}

function readIfPresent(file: string): string | undefined {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return '';
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}
