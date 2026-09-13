/**
 * Permission policy for Players Coach launches and owns.
 *
 * Q2.10C.1 human authority amendment: every Coach-managed Controlled Player
 * defaults to Full Autonomy. Adopted and external Players never pass through
 * this policy and retain their human-owned authority.
 *
 * Provider flags remain in their adapters; this module records human intent.
 */

import type { PlayerAuthority } from './player-control/contract';

export type CoachLaunchedAuthorityLevel = 'full-autonomy' | 'ask-for-risky-actions' | 'ask-every-time';

export interface PlayerAuthorityPolicy {
  readonly codex: CoachLaunchedAuthorityLevel;
  readonly claude: CoachLaunchedAuthorityLevel;
  readonly antigravity: CoachLaunchedAuthorityLevel;
}

export const DEFAULT_PLAYER_AUTHORITY_POLICY: PlayerAuthorityPolicy = Object.freeze({
  codex: 'full-autonomy',
  claude: 'full-autonomy',
  antigravity: 'full-autonomy'
});

/** Durable Settings shape; the normal Dispatcher does not expose this plumbing. */
export const PLAYER_PERMISSION_CHOICES = Object.freeze([
  { id: 'full-autonomy', label: 'Full Autonomy', description: 'Coach-managed Players complete Plays without approval interruptions.' },
  { id: 'ask-for-risky-actions', label: 'Ask for risky actions', description: 'Allow routine edits but require approval for broader tools.' },
  { id: 'ask-every-time', label: 'Ask every time', description: 'Require approval whenever the provider supports it.' }
] as const);

const SUPPORTED_LEVELS: ReadonlySet<CoachLaunchedAuthorityLevel> = new Set(PLAYER_PERMISSION_CHOICES.map((choice) => choice.id));

/**
 * The old Q2.10C `accept-edits` value migrates to the Dadified
 * `ask-for-risky-actions` name. Unknown values use this user's explicit default.
 */
export function normalizePlayerAuthorityPolicy(value: unknown): PlayerAuthorityPolicy {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const level = (entry: unknown): CoachLaunchedAuthorityLevel => {
    if (entry === 'accept-edits') return 'ask-for-risky-actions';
    return SUPPORTED_LEVELS.has(entry as CoachLaunchedAuthorityLevel) ? entry as CoachLaunchedAuthorityLevel : 'full-autonomy';
  };
  return { codex: level(record.codex), claude: level(record.claude), antigravity: level(record.antigravity) };
}

/** The authority a Coach-managed Controlled Player runs with. */
export function authorityForPlayer(playerType: string, policy: PlayerAuthorityPolicy = DEFAULT_PLAYER_AUTHORITY_POLICY): PlayerAuthority | undefined {
  const normalized = normalizePlayerAuthorityPolicy(policy);
  if (playerType === 'codex') {
    return normalized.codex === 'full-autonomy' ? { approvalPolicy: 'never', sandbox: 'danger-full-access' } : undefined;
  }
  if (playerType === 'claude' || playerType === 'antigravity') {
    if (normalized[playerType] === 'full-autonomy') return { permission: 'full-autonomy' };
    if (normalized[playerType] === 'ask-for-risky-actions') return { permission: 'accept-edits' };
  }
  return undefined;
}

/** Human-facing policy truth for status/settings projections. */
export function permissionSettingForPlayer(
  playerType: string,
  policy: PlayerAuthorityPolicy = DEFAULT_PLAYER_AUTHORITY_POLICY
): CoachLaunchedAuthorityLevel | undefined {
  if (playerType !== 'codex' && playerType !== 'claude' && playerType !== 'antigravity') return undefined;
  return normalizePlayerAuthorityPolicy(policy)[playerType];
}
