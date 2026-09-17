/**
 * Provider-neutral Scout Play contract (A-Team V0.1).
 *
 * WAS: the first Scout Runner manifest combined reconnaissance intent with an
 * OpenCode agent name, which also selected the provider/model.
 * IS: ScoutPlay owns only the route; executor configuration below this seam
 * selects the Player, harness, provider, model and transport.
 * WHY: Sideline owns the Play. A Player can be substituted without rewriting
 * objective, scope, authority, evidence requirements or report requirements.
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ScoutAuthority {
  readonly mode: 'read-only-reconnaissance';
  readonly allowed: readonly string[];
  readonly denied: readonly string[];
}

export interface ScoutReportContract {
  readonly requiredStatement: string;
  readonly sections: readonly string[];
}

export interface ScoutPlayInput {
  readonly playId: string;
  readonly gameRoot: string;
  readonly taskClass: string;
  readonly objective: string;
  readonly scope: readonly string[];
  readonly nonGoals: readonly string[];
  readonly authority: ScoutAuthority;
  readonly evidenceContract: readonly string[];
  readonly reportContract: ScoutReportContract;
}

export interface CanonicalScoutPlay extends ScoutPlayInput {
  readonly schemaVersion: 1;
}

export interface ScoutPlayEnvelope {
  readonly play: CanonicalScoutPlay;
  readonly playHash: string;
  readonly semanticPrompt: string;
  readonly semanticPromptHash: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

function text(value: unknown, field: string, max = 20_000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${field} must contain 1-${max} characters.`);
  return value.trim();
}

function textList(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) throw new Error(`${field} must contain 1-50 entries.`);
  return Object.freeze(value.map((item, index) => text(item, `${field}[${index}]`, 2_000)));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/** Normalize once into an explicit-key-order, deeply immutable representation. */
export function normalizeScoutPlay(input: unknown): CanonicalScoutPlay {
  if (!input || typeof input !== 'object') throw new Error('ScoutPlay must be an object.');
  const raw = input as Partial<ScoutPlayInput>;
  const playId = text(raw.playId, 'playId', 120);
  if (!SAFE_ID.test(playId)) throw new Error('playId contains unsafe filename characters.');
  const gameRoot = text(raw.gameRoot, 'gameRoot', 2_000);
  if (!path.isAbsolute(gameRoot)) throw new Error('gameRoot must be absolute.');
  let stat: fs.Stats;
  try { stat = fs.statSync(gameRoot); } catch { throw new Error(`Game root does not exist: ${gameRoot}`); }
  if (!stat.isDirectory()) throw new Error(`Game root is not a directory: ${gameRoot}`);
  const authority = raw.authority;
  if (!authority || authority.mode !== 'read-only-reconnaissance') throw new Error('authority.mode must be read-only-reconnaissance.');
  const report = raw.reportContract;
  if (!report) throw new Error('reportContract is required.');
  return deepFreeze({
    schemaVersion: 1,
    playId,
    gameRoot: path.resolve(gameRoot),
    taskClass: text(raw.taskClass, 'taskClass', 200),
    objective: text(raw.objective, 'objective'),
    scope: textList(raw.scope, 'scope'),
    nonGoals: textList(raw.nonGoals, 'nonGoals'),
    authority: {
      mode: 'read-only-reconnaissance',
      allowed: textList(authority.allowed, 'authority.allowed'),
      denied: textList(authority.denied, 'authority.denied')
    },
    evidenceContract: textList(raw.evidenceContract, 'evidenceContract'),
    reportContract: {
      requiredStatement: text(report.requiredStatement, 'reportContract.requiredStatement', 1_000),
      sections: textList(report.sections, 'reportContract.sections')
    }
  });
}

export function canonicalScoutPlayJson(play: CanonicalScoutPlay): string {
  return JSON.stringify(play);
}

export function hashText(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function scoutPlayHash(play: CanonicalScoutPlay): string {
  return hashText(canonicalScoutPlayJson(play));
}

function bullets(values: readonly string[]): string {
  return values.map((value) => `- ${value}`).join('\n');
}

/** Render once. Every executor receives these exact bytes as its semantic Play. */
export function renderScoutPlay(play: CanonicalScoutPlay, playHash = scoutPlayHash(play)): string {
  return `SIDELINE COACH SCOUT PLAY\n\nSCOUT PLAY ID: ${play.playId}\nCANONICAL PLAY HASH: ${playHash}\nTASK CLASS: ${play.taskClass}\nGAME ROOT: ${play.gameRoot}\n\nOBJECTIVE\n${play.objective}\n\nSCOPE\n${bullets(play.scope)}\n\nNON-GOALS\n${bullets(play.nonGoals)}\n\nAUTHORITY: ${play.authority.mode}\nAllowed:\n${bullets(play.authority.allowed)}\nDenied:\n${bullets(play.authority.denied)}\n\nEVIDENCE CONTRACT\n${bullets(play.evidenceContract)}\n\nRESULT CONTRACT\n${bullets(play.reportContract.sections)}\n\nREQUIRED STATEMENT\n${play.reportContract.requiredStatement}\n\nReturn report text only. Stop when the bounded reconnaissance is complete.`;
}

export function createScoutPlayEnvelope(input: unknown): ScoutPlayEnvelope {
  const play = normalizeScoutPlay(input);
  const playHash = scoutPlayHash(play);
  const semanticPrompt = renderScoutPlay(play, playHash);
  return deepFreeze({ play, playHash, semanticPrompt, semanticPromptHash: hashText(semanticPrompt) });
}
