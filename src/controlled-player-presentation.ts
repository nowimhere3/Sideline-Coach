import * as vscode from 'vscode';
import type { ControlEvent, PlayerControl } from './player-control/contract';

/** Read-only mirror. Player identity and transport remain outside this presentation object. */
export class ControlledPlayerPresentation implements vscode.Pseudoterminal, vscode.Disposable {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly backlog: string[] = [];
  private opened = false;
  private messageOpen = false;
  readonly onDidWrite = this.writeEmitter.event;

  open(): void {
    this.opened = true;
    for (const text of this.backlog.splice(0)) this.writeEmitter.fire(text);
  }

  close(): void { /* The owning roster handles terminal closure and child-process shutdown. */ }

  handleInput(): void {
    this.line('Send Plays through Sideline Coach.');
  }

  identity(fieldLabel: string): void {
    const base = fieldLabel.replace(/\s*·\s*controlled.*$/i, '').trim();
    this.line(`${base.toUpperCase()} · CONTROLLED`);
  }

  ready(control: PlayerControl, resumed: boolean): void {
    this.line(resumed ? 'READY · same conversation' : 'CONTROLLED PLAYER READY');
    this.line(`Runtime ${control.runtimeVersion} · ${control.model ?? 'default model'} · ${control.effort ?? 'default effort'}`);
  }

  restoring(message: string): void { this.line(message); }
  unavailable(message: string): void { this.line(message); }
  notice(message: string): void { this.line(message); }
  previousOutcome(summary: string): void { this.line(`Last Play before restart: ${summary}`); }

  show(event: ControlEvent): void {
    if (event.kind === 'progress' && event.category === 'message') {
      if (!this.messageOpen) {
        this.write('\r\nAgent: ');
        this.messageOpen = true;
      }
      this.write(event.summary.replace(/\r?\n/g, '\r\n'));
      return;
    }
    this.messageOpen = false;
    if (event.kind === 'progress') {
      this.line(`${event.category === 'command' ? 'Command' : 'Tool'}: ${event.summary}`);
      return;
    }
    if (event.kind === 'request') {
      this.line(event.summary);
      return;
    }
    if (event.kind === 'settings' || (event.kind === 'channel' && event.state === 'ready')) return;
    this.line(event.summary);
  }

  dispose(): void {
    this.writeEmitter.dispose();
  }

  private line(text: string): void { this.write(`\r\n${text}\r\n`); }
  private write(text: string): void {
    if (this.opened) this.writeEmitter.fire(text);
    else this.backlog.push(text);
  }
}
