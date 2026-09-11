import * as vscode from 'vscode';
import type { BindingStore, ControlledBindingRecord } from './player-control/bindings';

export const CONTROLLED_BINDINGS_KEY = 'sidelineCoach.playerSessions.v1';

/** Thin VS Code storage boundary; Player Control remains unaware of workspaceState. */
export class WorkspaceStateBindingStore implements BindingStore {
  constructor(private readonly workspaceState: vscode.Memento) {}
  load(): unknown { return this.workspaceState.get<unknown>(CONTROLLED_BINDINGS_KEY); }
  async save(records: ControlledBindingRecord[]): Promise<void> { await this.workspaceState.update(CONTROLLED_BINDINGS_KEY, records); }
}
