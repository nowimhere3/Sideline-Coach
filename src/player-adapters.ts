/**
 * Player catalog and adapter descriptors.
 *
 * Two identities are deliberately distinct and must not be collapsed:
 *   Player TYPE      catalog identity  — "Codex", "Claude", "Terminal"
 *   Player INSTANCE  a live Game-scoped seat with an opaque instanceId
 *
 * Terminal is a first-class Player type, not a costume worn by a provider.
 */

export type PlayerId = 'claude' | 'codex' | 'antigravity' | 'terminal';

/**
 * Who is allowed to destroy the process or terminal behind a Player instance.
 * Coach must never infer this from a terminal's name — Stage 1.7/1.8 established
 * that names carry no authority.
 */
export type PlayerOwnership = 'coach-managed' | 'adopted' | 'external';

/** What a Stadium observed about a Player type in one Game's environment. */
export type PlayerDetectionState =
  | 'ready'                  // installed, and usable now
  | 'authentication-needed'  // installed, but a probe says it is not signed in
  | 'not-installed'
  | 'available'              // needs no installation at all (Terminal)
  | 'unknown';               // could not be determined — never guess

export interface InstallGuidance {
  /** Shown to the human to run themselves. Coach never runs it silently. */
  readonly command: string;
  readonly docsUrl?: string;
}

export interface PlayerAdapter {
  readonly id: PlayerId;
  readonly name: string;
  /** Canonical terminal name for the uncertified direct-terminal transport. */
  readonly terminalName: string;
  /** Command Coach sends to start the agent. Empty for Terminal, which starts nothing. */
  readonly command: string;
  /** Executable probed to decide whether the Player type is installed. */
  readonly probeCommand?: string;
  readonly installGuidance?: InstallGuidance;
  /** True when Coach has a certified control adapter for this type. */
  readonly hasControlledAdapter?: boolean;
  /** Terminal needs no installation and is always offerable. */
  readonly alwaysAvailable?: boolean;
}

export const PLAYER_ADAPTERS: readonly PlayerAdapter[] = [
  {
    id: 'codex',
    name: 'Codex',
    terminalName: 'Codex',
    command: 'codex --yolo',
    probeCommand: 'codex',
    hasControlledAdapter: true,
    installGuidance: { command: 'npm install -g @openai/codex', docsUrl: 'https://developers.openai.com/codex/cli' }
  },
  {
    id: 'claude',
    name: 'Claude',
    terminalName: 'Claude',
    command: 'claude',
    probeCommand: 'claude',
    // Q2.10C: Coach-launched Claude is Controlled (structured print, accept-edits).
    hasControlledAdapter: true,
    installGuidance: { command: 'npm install -g @anthropic-ai/claude-code', docsUrl: 'https://docs.claude.com/en/docs/claude-code' }
  },
  {
    id: 'antigravity',
    name: 'AntiGravity',
    terminalName: 'AntiGravity',
    command: 'agy',
    probeCommand: 'agy',
    // Q2.10C: Coach-launched AntiGravity is Controlled (structured print, accept-edits).
    hasControlledAdapter: true
  },
  {
    id: 'terminal',
    name: 'Terminal',
    terminalName: 'Terminal',
    command: '',
    alwaysAvailable: true
  }
];

export function getPlayerAdapter(id: string): PlayerAdapter | undefined {
  return PLAYER_ADAPTERS.find((player) => player.id === id);
}

export function isPlayerId(value: unknown): value is PlayerId {
  return typeof value === 'string' && PLAYER_ADAPTERS.some((player) => player.id === value);
}

/** Provider Player types only — the ones an install/authentication path applies to. */
export function providerAdapters(): readonly PlayerAdapter[] {
  return PLAYER_ADAPTERS.filter((player) => !player.alwaysAvailable);
}

/**
 * Roster field state for one Player TYPE, derived only from real instances.
 *
 * Availability ("could this type play here?") is deliberately not an input. A
 * type that is installed but has no instance is not on the bench — it is simply
 * not on the roster. Merging the two produced phantom "Ready on Bench" Players.
 */
export type PlayerRosterFieldState = 'on-field' | 'on-bench' | 'not-on-roster';

export function rosterFieldState(onFieldCount: number, instanceCount: number): PlayerRosterFieldState {
  if (onFieldCount > 0) return 'on-field';
  return instanceCount > 0 ? 'on-bench' : 'not-on-roster';
}

export function playerStatus(player: PlayerAdapter, available: boolean, terminalNames: readonly string[]) {
  const onField = terminalNames.includes(player.terminalName);
  return {
    id: player.id,
    name: player.name,
    availability: available ? ('available' as const) : ('not-available' as const),
    fieldState: rosterFieldState(onField ? 1 : 0, onField ? 1 : 0)
  };
}

export function launchPlan(player: PlayerAdapter, terminalNames: readonly string[]) {
  return terminalNames.includes(player.terminalName)
    ? { action: 'reuse' as const, terminalName: player.terminalName }
    : { action: 'create' as const, terminalName: player.terminalName, command: player.command };
}

/**
 * Human-facing vocabulary for how Coach reaches a Player. "Legacy" is an
 * implementation generation, never something the human should have to learn.
 */
export type PlayerTransportLabel = 'Controlled' | 'Terminal' | 'Adopted' | 'External';

export function transportLabel(options: {
  controlled: boolean;
  playerType: PlayerId;
  ownership: PlayerOwnership;
}): PlayerTransportLabel {
  if (options.controlled) return 'Controlled';
  if (options.ownership === 'external') return 'External';
  if (options.ownership === 'adopted') return 'Adopted';
  return 'Terminal';
}

/** One catalog entry as offered by "+ Add Player", derived from live detection. */
export interface PlayerCatalogEntry {
  readonly playerType: PlayerId;
  readonly displayName: string;
  readonly state: PlayerDetectionState;
  /** Short human sentence. Never a stack trace, never a binary path. */
  readonly summary: string;
  readonly canAddNow: boolean;
  readonly controlled: boolean;
  readonly installGuidance?: InstallGuidance;
  /** Details are opt-in: paths and versions live here, not in the summary. */
  readonly detail?: string;
  /**
   * What Coach can see and control of this provider's settings, independent of
   * transport. Absent when the provider was not probed.
   */
  readonly controls?: import('./provider-control').ProviderControlProfile;
}

export function summariseDetection(
  adapter: PlayerAdapter,
  state: PlayerDetectionState
): { summary: string; canAddNow: boolean } {
  switch (state) {
    case 'available':
      return { summary: 'Available', canAddNow: true };
    case 'ready':
      return { summary: 'Ready', canAddNow: true };
    case 'authentication-needed':
      return { summary: 'Authentication needed', canAddNow: false };
    case 'not-installed':
      return { summary: `${adapter.name} is not installed in this Stadium`, canAddNow: false };
    default:
      return { summary: 'Status unknown', canAddNow: false };
  }
}
