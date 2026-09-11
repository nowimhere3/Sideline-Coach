export type PlayerId = 'claude' | 'codex' | 'antigravity';

export interface PlayerAdapter { id: PlayerId; name: string; terminalName: string; command: string; }

export const PLAYER_ADAPTERS: readonly PlayerAdapter[] = [
  { id: 'claude', name: 'Claude', terminalName: 'Claude', command: 'claude' },
  { id: 'codex', name: 'Codex', terminalName: 'Codex', command: 'codex --yolo' },
  { id: 'antigravity', name: 'AntiGravity', terminalName: 'AntiGravity', command: 'agy' }
];

export function getPlayerAdapter(id: string): PlayerAdapter | undefined { return PLAYER_ADAPTERS.find((player) => player.id === id); }

export function playerStatus(player: PlayerAdapter, available: boolean, terminalNames: readonly string[]) {
  const onField = terminalNames.includes(player.terminalName);
  return { id: player.id, name: player.name, availability: available ? 'available' as const : 'not-available' as const, fieldState: onField ? 'on-field' as const : available ? 'ready-on-bench' as const : 'not-available' as const };
}

export function launchPlan(player: PlayerAdapter, terminalNames: readonly string[]) {
  return terminalNames.includes(player.terminalName)
    ? { action: 'reuse' as const, terminalName: player.terminalName }
    : { action: 'create' as const, terminalName: player.terminalName, command: player.command };
}
