import * as crypto from 'node:crypto';
import { CAPABILITY_IDS, type CapabilityId } from '../commercial/capabilities';

/**
 * S57.2 §14/§16 / C7 — the closed ProductEvent contract.
 *
 * Telemetry tells us WHAT people do, never WHAT THEY WORK ON. Every field is a closed enum,
 * a fixed-format identifier, a bucketed number or a small integer. There is NO free-form
 * string anywhere in the schema, so source code, prompts, report text, paths, repository or
 * Game names, commands, credentials, device ids, hostPublicId, emails and the like cannot be
 * represented — the validator rejects them structurally, not by pattern-matching content.
 *
 * Unknown fields are rejected. Timestamps are rounded to the minute and durations to 10 s.
 */

export const PRODUCT_EVENT_VERSION = 1;

export const PRODUCT_EVENT_NAMES = [
  'app.daily_active',
  'remote.enabled',
  'remote.paired',
  'remote.session_ended',
  'remote.allowance_exhausted',
  'game.admitted',
  'game.archived',
  'games.daily_snapshot',
  'scout.play_started',
  'scout.play_finished',
  'scout.followed_by_premium',
  'scout.maintenance_run',
  'routing.recommendation_decided',
  'routing.scout_first_outcome',
  'routines.delivered',
  'coach_refresh.used',
  'alert.fired',
  'report.delivered',
  'play.dispatched',
  'gate.refused'
] as const;
export type ProductEventName = typeof PRODUCT_EVENT_NAMES[number];

export const TELEMETRY_PLATFORMS = ['win32', 'darwin', 'linux'] as const;
export const TELEMETRY_SURFACES = ['desktop', 'remote'] as const;
export const ENTITLEMENT_STATES = ['unlimited', 'granted', 'trial', 'exhausted', 'not-entitled'] as const;
export const ALLOWANCE_BANDS = ['none', 'low', 'mid', 'high'] as const;
export const OUTCOMES = ['ok', 'failed', 'cancelled', 'refused', 'unknown'] as const;

/** Closed dimension vocabularies. Nothing outside these lists can be recorded. */
export const DIMENSIONS = {
  playerType: ['claude', 'codex', 'antigravity', 'terminal', 'scout', 'other'],
  taskClass: ['architecture', 'implementation', 'quick', 'default'],
  decidedBy: ['accepted-primary', 'accepted-next-best', 'accepted-scout', 'accepted-wait', 'overridden', 'manual'],
  optionKind: ['send', 'queue', 'handoff', 'scout-first', 'wait-for-reset'],
  channel: ['vscode', 'browser', 'sse'],
  burnBand: ['none', 'low', 'mid', 'high', 'unknown'],
  reason: ['not-entitled', 'allowance-exhausted', 'ceiling-reached']
} as const satisfies Record<string, readonly string[]>;
export type DimensionKey = keyof typeof DIMENSIONS;

export const COUNT_KEYS = ['receivers', 'games', 'devices', 'reconnects'] as const;
export type CountKey = typeof COUNT_KEYS[number];
export const MAX_COUNT = 10_000;
export const MAX_DURATION_SEC = 7 * 24 * 3600;

export interface ProductEvent {
  readonly v: typeof PRODUCT_EVENT_VERSION;
  /** Random UUID v4; the dedupe key. */
  readonly eventId: string;
  readonly name: ProductEventName;
  /** Epoch ms rounded down to the minute. */
  readonly at: number;
  /** Pseudonymous install id (never hostPublicId, deviceId or email). */
  readonly installId: string;
  /** Numeric semver only. */
  readonly appVersion: string;
  readonly platform: typeof TELEMETRY_PLATFORMS[number];
  readonly surface: typeof TELEMETRY_SURFACES[number];
  readonly capability?: CapabilityId;
  readonly entitlement?: typeof ENTITLEMENT_STATES[number];
  readonly allowanceBand?: typeof ALLOWANCE_BANDS[number];
  readonly outcome?: typeof OUTCOMES[number];
  /** Seconds, rounded to 10. */
  readonly durationSec?: number;
  readonly counts?: Partial<Record<CountKey, number>>;
  readonly dims?: { readonly [K in DimensionKey]?: typeof DIMENSIONS[K][number] };
}

const TOP_LEVEL_FIELDS = new Set([
  'v', 'eventId', 'name', 'at', 'installId', 'appVersion', 'platform', 'surface',
  'capability', 'entitlement', 'allowanceBand', 'outcome', 'durationSec', 'counts', 'dims'
]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INSTALL_ID = /^[a-z2-7]{26}$/;
const APP_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const MIN_AT = Date.UTC(2024, 0, 1);
const MAX_AT = Date.UTC(2100, 0, 1);

export type ValidationResult = { readonly ok: true; readonly event: ProductEvent } | { readonly ok: false; readonly reason: string };

const oneOf = (list: readonly string[], value: unknown): boolean => typeof value === 'string' && list.includes(value);
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/** Strict allowlist validation. Never throws. */
export function validateProductEvent(value: unknown): ValidationResult {
  try {
    if (!isPlainObject(value)) return { ok: false, reason: 'not-an-object' };
    for (const key of Object.keys(value)) if (!TOP_LEVEL_FIELDS.has(key)) return { ok: false, reason: `unknown-field:${key}` };
    if (value.v !== PRODUCT_EVENT_VERSION) return { ok: false, reason: 'version' };
    if (typeof value.eventId !== 'string' || !UUID_V4.test(value.eventId)) return { ok: false, reason: 'eventId' };
    if (!oneOf(PRODUCT_EVENT_NAMES, value.name)) return { ok: false, reason: 'name' };
    if (!Number.isInteger(value.at) || (value.at as number) % 60_000 !== 0 || (value.at as number) < MIN_AT || (value.at as number) > MAX_AT) return { ok: false, reason: 'at' };
    if (typeof value.installId !== 'string' || !INSTALL_ID.test(value.installId)) return { ok: false, reason: 'installId' };
    if (typeof value.appVersion !== 'string' || !APP_VERSION.test(value.appVersion)) return { ok: false, reason: 'appVersion' };
    if (!oneOf(TELEMETRY_PLATFORMS, value.platform)) return { ok: false, reason: 'platform' };
    if (!oneOf(TELEMETRY_SURFACES, value.surface)) return { ok: false, reason: 'surface' };
    if (value.capability !== undefined && !oneOf(CAPABILITY_IDS, value.capability)) return { ok: false, reason: 'capability' };
    if (value.entitlement !== undefined && !oneOf(ENTITLEMENT_STATES, value.entitlement)) return { ok: false, reason: 'entitlement' };
    if (value.allowanceBand !== undefined && !oneOf(ALLOWANCE_BANDS, value.allowanceBand)) return { ok: false, reason: 'allowanceBand' };
    if (value.outcome !== undefined && !oneOf(OUTCOMES, value.outcome)) return { ok: false, reason: 'outcome' };
    if (value.durationSec !== undefined) {
      const seconds = value.durationSec;
      if (!Number.isInteger(seconds) || (seconds as number) < 0 || (seconds as number) > MAX_DURATION_SEC || (seconds as number) % 10 !== 0) return { ok: false, reason: 'durationSec' };
    }
    if (value.counts !== undefined) {
      if (!isPlainObject(value.counts)) return { ok: false, reason: 'counts' };
      for (const [key, count] of Object.entries(value.counts)) {
        if (!oneOf(COUNT_KEYS, key)) return { ok: false, reason: `unknown-count:${key}` };
        if (!Number.isInteger(count) || (count as number) < 0 || (count as number) > MAX_COUNT) return { ok: false, reason: `count:${key}` };
      }
    }
    if (value.dims !== undefined) {
      if (!isPlainObject(value.dims)) return { ok: false, reason: 'dims' };
      for (const [key, dimension] of Object.entries(value.dims)) {
        if (!Object.prototype.hasOwnProperty.call(DIMENSIONS, key)) return { ok: false, reason: `unknown-dimension:${key}` };
        if (!oneOf(DIMENSIONS[key as DimensionKey], dimension)) return { ok: false, reason: `dimension:${key}` };
      }
    }
    return { ok: true, event: JSON.parse(JSON.stringify(value)) as ProductEvent };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

export type ProductEventInput = Omit<ProductEvent, 'v' | 'eventId' | 'at' | 'installId' | 'appVersion' | 'platform'> & {
  /** Raw epoch ms; rounded down to the minute. */
  readonly at?: number;
  /** Raw seconds or ms-derived value; rounded to 10 s. */
  readonly durationSec?: number;
};

export interface ProductEventContext {
  readonly installId: string;
  readonly appVersion: string;
  readonly platform: string;
  readonly now?: () => number;
  readonly uuid?: () => string;
}

/** Stamps identity, rounds time, then validates. Returns a rejection instead of throwing. */
export function buildProductEvent(input: ProductEventInput, context: ProductEventContext): ValidationResult {
  try {
    const at = input.at ?? (context.now ?? Date.now)();
    const candidate: Record<string, unknown> = {
      ...input,
      v: PRODUCT_EVENT_VERSION,
      eventId: (context.uuid ?? crypto.randomUUID)(),
      at: Math.floor(at / 60_000) * 60_000,
      installId: context.installId,
      appVersion: context.appVersion,
      platform: context.platform
    };
    if (input.durationSec !== undefined) candidate.durationSec = Math.round(input.durationSec / 10) * 10;
    return validateProductEvent(candidate);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
