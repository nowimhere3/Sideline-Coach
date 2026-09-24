/**
 * Live Player Terminal — sanitized exact-Player activity (no `vscode` import).
 *
 *   WAS:     Rich provider `ControlEvent`s stayed inside the extension host; the browser
 *            only ever saw coarse turn state.
 *   IS:      Each ControlEvent is projected onto a tiny ALLOW-LIST — `{ category, text }`
 *            for one exact `instanceId` — and hard-secret-redacted before it may leave the
 *            extension host. The daemon re-applies the shared hard-secret boundary and owns
 *            any additional per-principal remote presentation before it reaches a browser.
 *   WHY:     Humans get "it is really doing things" visibility without provider plumbing
 *            or secrets crossing the browser boundary.
 *   WILL BE: Terminal Player stdout/stderr, richer Codex activity and durable history can
 *            feed this same `PlayerActivityNotice` without changing the browser contract.
 *
 * Policy. The PRIMARY control is structural: only `category` + a short human `text`
 * derived from ControlEvent summaries ever leave. Raw provider frames, environment
 * objects, headers, tool-argument objects and protocol metadata are never read here.
 * Redaction is defense in depth for the free text that remains (assistant messages,
 * command lines, tool/file targets, failure details); it is best-effort pattern
 * matching, NOT a proof that no secret can appear in free text.
 */

import * as crypto from 'node:crypto';
import type { ControlEvent } from './player-control/contract';
export { redactSecrets } from './remote-redaction';
import { redactSecrets } from './remote-redaction';

export type ActivityCategory = 'working' | 'message' | 'command' | 'tool' | 'declined' | 'result' | 'channel' | 'output';

export const ACTIVITY_CATEGORIES: readonly ActivityCategory[] = ['working', 'message', 'command', 'tool', 'declined', 'result', 'channel', 'output'];

/** What one Player may say to the browser. Nothing else about an event is forwarded. */
export interface PlayerActivityNotice {
  /** Exact Player identity. Never a display label. */
  instanceId: string;
  /** Opaque digest of the provider session ref (never the ref itself). Scopes copy cursors. */
  sessionKey?: string;
  at: number;
  category: ActivityCategory;
  text: string;
  /** Message text arriving as fragments of one message (coalesced by the store). */
  streaming?: boolean;
}

/** A retained, ordered terminal line. `seq` is daemon-assigned and monotonic per Player. */
export interface PlayerActivityEntry {
  seq: number;
  at: number;
  category: ActivityCategory;
  text: string;
}

export const ACTIVITY_LINE_MAX = 240;
export const ACTIVITY_MESSAGE_MAX = 1200;
export const ACTIVITY_MAX_ENTRIES = 300;
export const ACTIVITY_MAX_PLAYERS = 64;
const REGEX_INPUT_CAP = 8_000;
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/**
 * BREADCRUMB: REMOTE-TERMINAL-REDACTION-BOUNDARY
 *
 * Terminal/activity presentation is redacted for remote devices by default. The trusted
 * local Stadium link carries only bounded, allow-listed, hard-secret-redacted text. The
 * daemon may mask additional terminal detail for remote devices; the explicit Dev-only
 * "Show sensitive terminal output on paired devices" override removes only that extra mask.
 * That override is presentation-only: report/file redaction, blocked paths, credentials,
 * admin routes and other hard security boundaries never consult it. Local terminal UX keeps
 * receiving the existing hard-secret-redacted `text` value.
 */
/**
 * Bound + clean + redact one piece of free text for the browser boundary.
 * Streaming fragments keep their spacing so they can be concatenated; output preserves
 * leading/internal whitespace with trailing whitespace trimmed; every other category
 * collapses to a single line.
 */
function normalizeActivityText(value: unknown, category: ActivityCategory, streaming = false): string {
  let text = String(value ?? '').slice(0, REGEX_INPUT_CAP).replace(ANSI, '').replace(CONTROL, '');
  const max = category === 'message' ? ACTIVITY_MESSAGE_MAX : ACTIVITY_LINE_MAX;
  if (category === 'message') {
    text = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
    if (!streaming) text = text.trim();
  } else if (category === 'output') {
    text = text.trimEnd();
  } else {
    text = text.replace(/\s+/g, ' ').trim();
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function sanitizeActivityText(value: unknown, category: ActivityCategory, streaming = false): string {
  return redactSecrets(normalizeActivityText(value, category, streaming));
}

/** Digest of a provider session ref: enough to tell sessions apart, useless to resume one. */
export function sessionKeyFor(providerSessionRef: string | undefined): string | undefined {
  if (!providerSessionRef) return undefined;
  return crypto.createHash('sha256').update(providerSessionRef).digest('hex').slice(0, 8);
}

/**
 * The allow-list projection. Returns `undefined` for events that carry nothing a human
 * should watch (settings, channel-ready). Only `kind`-derived category and the event's
 * own short `summary` string are ever read.
 */
export function projectControlEvent(event: ControlEvent): { category: ActivityCategory; text: string; streaming?: boolean } | undefined {
  let category: ActivityCategory;
  let streaming = false;
  switch (event.kind) {
    case 'turn':
      category = event.state === 'accepted' || event.state === 'started' ? 'working' : 'result';
      break;
    case 'progress':
      category = event.category;
      streaming = event.category === 'message' && event.streaming === true;
      break;
    case 'request':
      category = 'declined';
      break;
    case 'channel':
      if (event.state === 'ready') return undefined;
      category = 'channel';
      break;
    default:
      return undefined;
  }
  const text = sanitizeActivityText(event.summary, category, streaming);
  if (!text.trim()) return undefined;
  return streaming ? { category, text, streaming: true } : { category, text };
}

interface Bucket {
  sessionKey?: string;
  seq: number;
  entries: PlayerActivityEntry[];
  /** Seq of a streaming message that further fragments may extend. */
  openMessageSeq?: number;
}

export interface PlayerActivitySnapshot {
  sessionKey?: string;
  entries: PlayerActivityEntry[];
}

/**
 * Bounded, ordered, per-exact-Player retention (daemon side). Keys are opaque strings
 * (`gameId|instanceId`) chosen by the caller. Re-sanitizes every input, so the browser
 * boundary never depends on what an upstream sender did.
 */
export class PlayerActivityStore {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly maxEntries = ACTIVITY_MAX_ENTRIES, private readonly maxPlayers = ACTIVITY_MAX_PLAYERS) {}

  /** Returns the new or extended entry (same `seq` when a streaming message grew), or undefined when dropped. */
  record(key: string, notice: Pick<PlayerActivityNotice, 'sessionKey' | 'at' | 'category' | 'text' | 'streaming'>): PlayerActivityEntry | undefined {
    if (!ACTIVITY_CATEGORIES.includes(notice.category)) return undefined;
    const streaming = notice.streaming === true && notice.category === 'message';
    const text = sanitizeActivityText(notice.text, notice.category, streaming);
    if (!text.trim()) return undefined;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { seq: 0, entries: [] };
      this.buckets.set(key, bucket);
      while (this.buckets.size > this.maxPlayers) this.buckets.delete(this.buckets.keys().next().value as string);
    }
    // A different provider session is a different transcript. Seq keeps counting up.
    if (notice.sessionKey && bucket.sessionKey && notice.sessionKey !== bucket.sessionKey) {
      bucket.entries = [];
      bucket.openMessageSeq = undefined;
    }
    if (notice.sessionKey) bucket.sessionKey = notice.sessionKey;

    const last = bucket.entries[bucket.entries.length - 1];
    if (streaming && last && last.seq === bucket.openMessageSeq && last.text.length < ACTIVITY_MESSAGE_MAX) {
      last.text = sanitizeActivityText(last.text + text, 'message', true);
      return { ...last };
    }
    // Some providers report a command/tool at both start and completion; show it once.
    if ((notice.category === 'command' || notice.category === 'tool') && last && last.category === notice.category && last.text === text) return undefined;

    const entry: PlayerActivityEntry = { seq: ++bucket.seq, at: Number.isFinite(notice.at) ? notice.at : Date.now(), category: notice.category, text };
    bucket.entries.push(entry);
    bucket.openMessageSeq = streaming ? entry.seq : undefined;
    if (bucket.entries.length > this.maxEntries) bucket.entries.splice(0, bucket.entries.length - this.maxEntries);
    return { ...entry };
  }

  snapshot(key: string): PlayerActivitySnapshot {
    const bucket = this.buckets.get(key);
    return { sessionKey: bucket?.sessionKey, entries: bucket ? bucket.entries.map((entry) => ({ ...entry })) : [] };
  }

  clear(): void { this.buckets.clear(); }
}
