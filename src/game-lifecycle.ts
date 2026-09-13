/**
 * Game lifecycle — the pure state model behind Add Game, Opening, and Archive.
 *
 * The hard rule this file exists to enforce:
 *
 *     Offline ≠ Archived
 *
 * Closing a VS Code window, sleeping a Codespace, or losing a socket makes a
 * Game **Offline** — it is still a live project Coach expects to see again.
 * **Archived** is the human saying the project is finished. Archiving is a
 * Coach-registry operation only: it never deletes or modifies a repository.
 */

/** How long a Game may sit in Opening before Coach admits the open did not take. */
export const OPENING_TIMEOUT_MS = 90_000;

export type GameLifecycleState =
  | 'known'       // registered, never yet seen connected
  | 'opening'     // Coach asked a Stadium to open it; waiting for activation
  | 'connected'   // exactly one live authoritative Stadium session
  | 'offline'     // has connected before, no live session now
  | 'conflicted'  // more than one live session claims this Game
  | 'archived';   // the human finished with it; hidden from the active Sideline

export interface GameStateInputs {
  /** Live Stadium sessions currently bound to this Game. */
  readonly activeSessionCount: number;
  readonly isArchived: boolean;
  readonly hasEverConnected: boolean;
  /** Epoch ms when Coach issued an open request, if one is outstanding. */
  readonly openingSince?: number;
  readonly now: number;
}

/**
 * Single source of truth for a Game's state.
 *
 * Order matters. Archived wins over everything, because an archived Game must
 * never reappear in the active Sideline just because a window happens to be
 * open. Conflicted wins over connected, because exact routing must be blocked
 * rather than silently guessing which of two windows owns the Game.
 */
export function deriveGameState(inputs: GameStateInputs): GameLifecycleState {
  if (inputs.isArchived) return 'archived';
  if (inputs.activeSessionCount > 1) return 'conflicted';
  if (inputs.activeSessionCount === 1) return 'connected';
  if (isOpeningActive(inputs.openingSince, inputs.now)) return 'opening';
  return inputs.hasEverConnected ? 'offline' : 'known';
}

export function isOpeningActive(openingSince: number | undefined, now: number): boolean {
  if (openingSince === undefined) return false;
  return now - openingSince < OPENING_TIMEOUT_MS;
}

/** True once an Opening request has waited past the point of plausible success. */
export function hasOpeningTimedOut(openingSince: number | undefined, now: number): boolean {
  if (openingSince === undefined) return false;
  return now - openingSince >= OPENING_TIMEOUT_MS;
}

/** Short human label. No jargon, no internal state names leaking to the human. */
export function describeGameState(state: GameLifecycleState): string {
  switch (state) {
    case 'connected': return 'Connected';
    case 'opening': return 'Opening…';
    case 'offline': return 'Offline';
    case 'conflicted': return 'Conflicted';
    case 'archived': return 'Archived';
    default: return 'Not connected';
  }
}

/** Whether a Game in this state can accept Plays and Player actions. */
export function isGameActionable(state: GameLifecycleState): boolean {
  return state === 'connected';
}

export type AddGameDecision =
  | { kind: 'select-existing'; gameId: string }
  | { kind: 'already-opening'; gameId: string }
  | { kind: 'open-window'; gameId: string; folderPath: string }
  | { kind: 'conflicted'; gameId: string; message: string }
  | { kind: 'unresolved'; message: string };

export interface AddGameInputs {
  readonly gameId: string;
  readonly folderPath: string;
  readonly state: GameLifecycleState;
}

/**
 * What Add Game should actually do once a repository has been chosen.
 *
 * Deliberately pure so every edge case is testable without a VS Code window:
 * an already-Connected Game is selected rather than opened twice, an Opening
 * Game is not opened again, and a Conflicted Game is reported rather than
 * silently resolved in favour of one window.
 */
export function decideAddGame(inputs: AddGameInputs): AddGameDecision {
  if (!inputs.gameId || inputs.gameId === 'unknown') {
    return {
      kind: 'unresolved',
      message: 'Coach could not identify a Game in that folder. Open a folder that is a git repository or contains a .sideline/game.json marker.'
    };
  }

  switch (inputs.state) {
    case 'connected':
      return { kind: 'select-existing', gameId: inputs.gameId };
    case 'opening':
      return { kind: 'already-opening', gameId: inputs.gameId };
    case 'conflicted':
      return {
        kind: 'conflicted',
        gameId: inputs.gameId,
        message: 'That Game is already open in more than one window. Close one so Coach knows where to send Plays.'
      };
    default:
      return { kind: 'open-window', gameId: inputs.gameId, folderPath: inputs.folderPath };
  }
}
