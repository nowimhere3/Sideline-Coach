import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { isCapabilityId } from './capabilities';
import type { Allowance, CapabilityGrant, GrantSource, Period } from './grants';
import type { EntitlementProfile } from './profiles';

/**
 * S57.2 §12 / C6 — signed entitlement, file-based.
 *
 * A license is DATA: grants signed by the vendor with Ed25519 over a canonical JSON
 * serialization of every field except `sig`. The local authority uses a license's grants
 * only while it verifies against a pinned public key, is bound to this install and has
 * not expired; otherwise it falls back to the built-in DEFAULT_PROFILE. A missing, bad or
 * expired license can therefore never reduce access below the built-in default.
 *
 * No network, activation, billing, account, DRM, hardware fingerprint, obfuscation or
 * kill switch. Feature code never sees any of this: only gate decisions.
 */

export const ENTITLEMENT_LICENSE_VERSION = 1;
export const LICENSE_FILE = 'license.json';
export const CLOCK_FILE = 'clock.json';
const MAX_LICENSE_BYTES = 64 * 1024;
const MAX_GRANTS = 200;
/** A clock more than this far behind the highest time ever observed is treated as rolled back. */
export const CLOCK_ROLLBACK_TOLERANCE_MS = 86_400_000;
/** The clock high-water mark is only rewritten when it advances by at least this much. */
const HIGH_WATER_WRITE_STEP_MS = 3_600_000;

/**
 * Pinned production verification keys, keyId → raw 32-byte Ed25519 public key (hex).
 *
 * Deliberately EMPTY: no vendor signing key exists yet. Generating one, and deciding who
 * holds its private half, is a Coach decision (S57.4 COACH REVIEW). With no pinned key every
 * license is `unknown-key` and the built-in default profile applies.
 */
export const PINNED_ENTITLEMENT_KEYS: Readonly<Record<string, string>> = Object.freeze({});

export interface SignedEntitlement {
  readonly v: typeof ENTITLEMENT_LICENSE_VERSION;
  readonly licenseId: string;
  readonly installId: string;
  /** Display only (Settings). Never branched on. */
  readonly profileLabel: string;
  readonly grants: readonly CapabilityGrant[];
  readonly issuedAt: number;
  readonly refreshAfter: number;
  readonly expiresAt: number;
  readonly keyId: string;
  /** base64url Ed25519 signature over canonicalEntitlementPayload(). */
  readonly sig: string;
}

export type LicenseInvalidReason =
  | 'malformed'
  | 'unknown-key'
  | 'bad-signature'
  | 'install-mismatch'
  | 'install-unavailable'
  | 'unreadable';

/**
 * none           no license file
 * valid          verified, before refreshAfter
 * refresh-needed verified, past refreshAfter (or clock rollback suspected) but before expiry
 * expired        verified but expired → built-in default applies
 * invalid        present but not trusted → built-in default applies
 */
export type LicenseState = 'none' | 'valid' | 'refresh-needed' | 'expired' | 'invalid';

export interface LicenseStatus {
  readonly state: LicenseState;
  readonly reason?: LicenseInvalidReason;
  readonly rollbackSuspected?: true;
}

export interface LicenseEvaluation {
  readonly status: LicenseStatus;
  /** Present only when the license's grants are in force (valid or refresh-needed). */
  readonly profile?: EntitlementProfile;
}

/** Source of the license the authority consults on every evaluation. */
export interface LicenseSource {
  current(now: number): LicenseEvaluation;
}

// ── Canonical serialization ─────────────────────────────────────────────────

function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number in entitlement.');
    return JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`).join(',')}}`;
  }
  throw new Error('Unsupported value in entitlement.');
}

/** The exact bytes that are signed: every field except `sig`, keys sorted, no whitespace. */
export function canonicalEntitlementPayload(document: Omit<SignedEntitlement, 'sig'> | SignedEntitlement): Buffer {
  const { sig: _sig, ...unsigned } = document as SignedEntitlement;
  return Buffer.from(canonicalize(unsigned), 'utf8');
}

// ── Structural validation ───────────────────────────────────────────────────

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const GRANT_SOURCES: readonly GrantSource[] = ['profile', 'license', 'promo', 'override'];

function validPeriod(value: unknown): value is Period {
  if (!value || typeof value !== 'object') return false;
  const period = value as Record<string, unknown>;
  switch (period.kind) {
    case 'lifetime':
    case 'daily':
      return Object.keys(period).length === 1;
    case 'monthly':
      return period.anchor === 'calendar' || isTime(period.anchor);
    case 'rolling':
      return Number.isInteger(period.days) && (period.days as number) >= 1 && (period.days as number) <= 366;
    default:
      return false;
  }
}

function validAllowance(value: unknown): value is Allowance {
  if (!value || typeof value !== 'object') return false;
  const allowance = value as Record<string, unknown>;
  switch (allowance.kind) {
    case 'unlimited':
    case 'enabled':
      return true;
    case 'ceiling':
      return Number.isInteger(allowance.limit) && (allowance.limit as number) >= 0;
    case 'quota':
      return Number.isInteger(allowance.limit) && (allowance.limit as number) >= 0 && validPeriod(allowance.period);
    default:
      return false;
  }
}

function validGrant(value: unknown): value is CapabilityGrant {
  if (!value || typeof value !== 'object') return false;
  const grant = value as Record<string, unknown>;
  if (typeof grant.grantId !== 'string' || !ID_PATTERN.test(grant.grantId)) return false;
  if (!isCapabilityId(grant.capability)) return false;
  if (!validAllowance(grant.allowance)) return false;
  if (!GRANT_SOURCES.includes(grant.source as GrantSource)) return false;
  if (grant.validFrom !== undefined && !isTime(grant.validFrom)) return false;
  if (grant.validUntil !== undefined && !isTime(grant.validUntil)) return false;
  if (grant.graceMinutes !== undefined && !(Number.isInteger(grant.graceMinutes) && (grant.graceMinutes as number) >= 0 && (grant.graceMinutes as number) <= 1440)) return false;
  return true;
}

/** Structural check only (no crypto). Unknown top-level fields make a document malformed. */
export function parseSignedEntitlement(value: unknown): SignedEntitlement | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const document = value as Record<string, unknown>;
  const allowed = new Set(['v', 'licenseId', 'installId', 'profileLabel', 'grants', 'issuedAt', 'refreshAfter', 'expiresAt', 'keyId', 'sig']);
  if (Object.keys(document).some((key) => !allowed.has(key))) return undefined;
  if (document.v !== ENTITLEMENT_LICENSE_VERSION) return undefined;
  if (typeof document.licenseId !== 'string' || !ID_PATTERN.test(document.licenseId)) return undefined;
  if (typeof document.installId !== 'string' || !/^[a-z2-7]{26}$/.test(document.installId)) return undefined;
  if (typeof document.profileLabel !== 'string' || document.profileLabel.length < 1 || document.profileLabel.length > 60) return undefined;
  if (!Array.isArray(document.grants) || document.grants.length > MAX_GRANTS || !document.grants.every(validGrant)) return undefined;
  if (new Set((document.grants as CapabilityGrant[]).map((grant) => grant.grantId)).size !== document.grants.length) return undefined;
  if (!isTime(document.issuedAt) || !isTime(document.refreshAfter) || !isTime(document.expiresAt)) return undefined;
  if (!(document.issuedAt <= document.refreshAfter && document.refreshAfter <= document.expiresAt)) return undefined;
  if (typeof document.keyId !== 'string' || !ID_PATTERN.test(document.keyId)) return undefined;
  if (typeof document.sig !== 'string' || !/^[A-Za-z0-9_-]{80,100}$/.test(document.sig)) return undefined;
  return document as unknown as SignedEntitlement;
}

// ── Verification ────────────────────────────────────────────────────────────

/** keyId → raw 32-byte Ed25519 public key as 64 hex chars. */
export type TrustedKeys = Readonly<Record<string, string>>;

function publicKeyFromHex(hex: string): crypto.KeyObject | undefined {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return undefined;
  try {
    return crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(hex, 'hex').toString('base64url') }, format: 'jwk' });
  } catch {
    return undefined;
  }
}

export type VerifyResult =
  | { readonly ok: true; readonly entitlement: SignedEntitlement }
  | { readonly ok: false; readonly reason: LicenseInvalidReason };

/** Deterministic: structure → key → signature → install binding. Never throws. */
export function verifySignedEntitlement(value: unknown, options: { readonly keys: TrustedKeys; readonly installId: string | undefined }): VerifyResult {
  const entitlement = parseSignedEntitlement(value);
  if (!entitlement) return { ok: false, reason: 'malformed' };
  const keyHex = Object.prototype.hasOwnProperty.call(options.keys, entitlement.keyId) ? options.keys[entitlement.keyId] : undefined;
  const key = keyHex ? publicKeyFromHex(keyHex) : undefined;
  if (!key) return { ok: false, reason: 'unknown-key' };
  let signed: boolean;
  try {
    signed = crypto.verify(null, canonicalEntitlementPayload(entitlement), key, Buffer.from(entitlement.sig, 'base64url'));
  } catch {
    signed = false;
  }
  if (!signed) return { ok: false, reason: 'bad-signature' };
  if (!options.installId) return { ok: false, reason: 'install-unavailable' };
  if (entitlement.installId !== options.installId) return { ok: false, reason: 'install-mismatch' };
  return { ok: true, entitlement };
}

/**
 * Validity of a VERIFIED entitlement. `highWater` is the latest time ever observed; if the
 * clock is more than a day behind it, the clock is treated as rolled back: expiry is judged
 * against the high-water mark (rollback never extends a license) and a still-unexpired
 * license is only `refresh-needed`, never `valid`.
 */
export function evaluateEntitlementValidity(entitlement: SignedEntitlement, now: number, highWater: number): LicenseStatus {
  const rolledBack = now < highWater - CLOCK_ROLLBACK_TOLERANCE_MS;
  const effectiveNow = Math.max(now, rolledBack ? highWater : now);
  const flag = rolledBack ? { rollbackSuspected: true as const } : {};
  if (effectiveNow >= entitlement.expiresAt) return { state: 'expired', ...flag };
  if (rolledBack || effectiveNow >= entitlement.refreshAfter) return { state: 'refresh-needed', ...flag };
  return { state: 'valid' };
}

function licenseProfile(entitlement: SignedEntitlement): EntitlementProfile {
  return Object.freeze({
    id: `license:${entitlement.licenseId}`,
    label: entitlement.profileLabel,
    grants: Object.freeze(entitlement.grants.map((grant) => Object.freeze({ ...grant })))
  });
}

// ── File source ─────────────────────────────────────────────────────────────

export interface LicenseFileSourceOptions {
  /** `~/.sideline/entitlement/license.json` */
  readonly file: string;
  /** `~/.sideline/entitlement/clock.json` (high-water mark; written only while a license exists). */
  readonly clockFile: string;
  readonly keys?: TrustedKeys;
  readonly installId: () => string | undefined;
  readonly warn?: (message: string) => void;
}

/**
 * Reads and verifies the license once per reload(); validity is re-judged against the clock
 * on every current() call, so refresh-needed and expiry happen on time without re-reading.
 */
export class LicenseFileSource implements LicenseSource {
  private verified: SignedEntitlement | undefined;
  private loadStatus: LicenseStatus = { state: 'none' };
  private highWater = 0;
  private persistedHighWater = 0;
  private readonly keys: TrustedKeys;
  private readonly warn: (message: string) => void;

  constructor(private readonly options: LicenseFileSourceOptions) {
    this.keys = options.keys ?? PINNED_ENTITLEMENT_KEYS;
    this.warn = options.warn ?? (() => undefined);
  }

  /** Re-reads license.json (and the clock high-water mark). Never throws. */
  reload(): LicenseStatus {
    this.verified = undefined;
    let text: string;
    try {
      const stat = fs.lstatSync(this.options.file);
      if (!stat.isFile() || stat.size > MAX_LICENSE_BYTES) return this.invalid('malformed');
      text = fs.readFileSync(this.options.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return (this.loadStatus = { state: 'none' });
      return this.invalid('unreadable');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return this.invalid('malformed'); }
    const result = verifySignedEntitlement(parsed, { keys: this.keys, installId: this.options.installId() });
    if (!result.ok) return this.invalid(result.reason);
    this.verified = result.entitlement;
    this.highWater = Math.max(this.highWater, this.readHighWater());
    this.persistedHighWater = Math.max(this.persistedHighWater, this.highWater);
    this.loadStatus = { state: 'valid' };
    return this.loadStatus;
  }

  current(now: number): LicenseEvaluation {
    if (!this.verified) return { status: this.loadStatus };
    const status = evaluateEntitlementValidity(this.verified, now, this.highWater);
    if (now > this.highWater) {
      this.highWater = now;
      if (this.highWater - this.persistedHighWater >= HIGH_WATER_WRITE_STEP_MS) this.writeHighWater();
    }
    return status.state === 'expired' ? { status } : { status, profile: licenseProfile(this.verified) };
  }

  private invalid(reason: LicenseInvalidReason): LicenseStatus {
    this.warn(`Entitlement license ignored (${reason}); the built-in profile applies.`);
    return (this.loadStatus = { state: 'invalid', reason });
  }

  private readHighWater(): number {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.options.clockFile, 'utf8')) as { v?: unknown; highWater?: unknown };
      return parsed.v === 1 && isTime(parsed.highWater) ? parsed.highWater : 0;
    } catch {
      return 0;
    }
  }

  private writeHighWater(): void {
    try {
      const tmp = `${this.options.clockFile}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, highWater: this.highWater }), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, this.options.clockFile);
      this.persistedHighWater = this.highWater;
    } catch {
      // Best effort: an unwritten mark only weakens rollback detection; it never blocks.
    }
  }
}
