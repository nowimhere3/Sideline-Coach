/**
 * SCOUT TERMINAL VIEW — the running clock and the event lines for `npm run scout:play`.
 *
 * WAS: The runner printed bare `[STATE] id (agent)` lines with no time, no failure meaning, and nothing
 * to tell Dad the Formation was still alive during a multi-minute run.
 *
 * IS: One quiet status line carries a running clock (`[00:03:17] SCOUTING · 2 running · 1 complete ·
 * 1 substitution`). On an interactive TTY it redraws in place once a second and is erased before every
 * event line and at stop, so it never corrupts Scout output. Where in-place rendering is not safe (a
 * pipe or redirected file) it degrades to a restrained periodic plain line instead of flooding. Event
 * lines carry the elapsed time, the lane, the Player, and the failure meaning
 * (`[00:01:42] [RATE LIMITED] lane-a · Laguna S 2.1`). The view is inert after `stop()`, so no timer
 * output can ever appear after the final report path.
 *
 * WHY: Dad should watch the clock, see a receiver go down and the bench Player take the same lane, and
 * never wonder whether the machine is stuck.
 *
 * WILL BE: Dev Mode and the browser Scout card can render the same event stream; the clock, counters and
 * wording are already driven by structured events rather than parsed text.
 *
 * No `vscode` import. Everything time-related is injected so tests never sleep.
 */
import { formatElapsed } from './scout-master-report';
import type { ScoutRunEvent } from './scout-play-runner';

export interface ScoutTerminalOptions {
  write(text: string): void;
  /** True only when in-place rendering is safe (an interactive terminal). */
  isTTY: boolean;
  /** Milliseconds; injectable. */
  now(): number;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Non-TTY status cadence. Default 30 s: readable, never a flood. */
  fallbackIntervalMs?: number;
  columns?: number;
}

const CLEAR_LINE = '\r\u001b[2K';

export class ScoutTerminalView {
  private startedAt: number | undefined;
  private timer: unknown;
  private statusShown = false;
  private stopped = false;
  private running = 0;
  private complete = 0;
  private substitutions = 0;
  private lanes = 0;
  /** Writes attempted after stop(); a test asserts this stays writes-suppressed, not silently emitted. */
  suppressedAfterStop = 0;

  constructor(private readonly options: ScoutTerminalOptions) {}

  elapsedMs(): number {
    return this.startedAt === undefined ? 0 : Math.max(0, this.options.now() - this.startedAt);
  }

  private stamp(): string { return `[${formatElapsed(this.elapsedMs())}]`; }

  statusLine(): string {
    const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
    return `${this.stamp()} SCOUTING · ${this.running} running · ${this.complete} complete of ${this.lanes} · ${plural(this.substitutions, 'substitution')}`;
  }

  private emit(text: string): void {
    if (this.stopped) { this.suppressedAfterStop += 1; return; }
    this.options.write(text);
  }

  private drawStatus(): void {
    if (this.stopped) return;
    const width = Math.max(20, (this.options.columns ?? 100) - 1);
    const line = this.statusLine();
    this.emit(`${CLEAR_LINE}${line.length > width ? `${line.slice(0, width - 1)}…` : line}`);
    this.statusShown = true;
  }

  /** The clock starts when the Formation actually begins. */
  start(): void {
    if (this.startedAt !== undefined || this.stopped) return;
    this.startedAt = this.options.now();
    if (this.options.isTTY) {
      this.drawStatus();
      this.timer = this.options.setTimer(() => this.drawStatus(), 1_000);
    } else {
      this.emit(`${this.statusLine()}\n`);
      this.timer = this.options.setTimer(() => this.emit(`${this.statusLine()}\n`), this.options.fallbackIntervalMs ?? 30_000);
    }
  }

  /** One event line, with the status line erased before it and redrawn after it. */
  line(kind: string, message: string): void {
    if (this.stopped) { this.suppressedAfterStop += 1; return; }
    const text = `${this.stamp()} [${kind}] ${message}\n`;
    if (this.options.isTTY && this.statusShown) {
      this.emit(`${CLEAR_LINE}${text}`);
      this.statusShown = false;
      this.drawStatus();
    } else {
      this.emit(text);
    }
  }

  /** Feed a structured runner event: prints the right line and updates the counters. */
  handle(event: ScoutRunEvent): void {
    switch (event.type) {
      case 'formation-start':
        this.lanes = event.lanes;
        this.start();
        break;
      case 'lane-queued':
        this.line('QUEUED', `${event.lane} · ${event.displayName}`);
        break;
      case 'attempt-start':
        this.running += 1;
        this.line('RUNNING', `${event.lane} · ${event.displayName}${event.attempt > 1 ? ` (attempt ${event.attempt})` : ''}`);
        break;
      case 'attempt-end':
        this.running = Math.max(0, this.running - 1);
        this.line(event.label, `${event.lane} · ${event.displayName} (elapsed ${formatElapsed(event.durationMs)})`);
        break;
      case 'substitute':
        this.substitutions += 1;
        this.line('SUBSTITUTE', `${event.lane} · ${event.fromName} → ${event.toName}`);
        break;
      case 'no-substitute':
        this.line('NO SUBSTITUTE', `${event.lane} · ${event.receiverName}: no eligible receiver remains`);
        break;
      case 'lane-complete':
        this.complete += 1;
        break;
      case 'formation-end':
        break;
    }
    // Events that print a line already redraw the status line; a silent counter change refreshes it here.
    if (this.options.isTTY && this.statusShown && (event.type === 'lane-complete' || event.type === 'formation-end')) this.drawStatus();
  }

  /** Stop the clock, erase the live status line, and go inert. Idempotent. */
  stop(): void {
    if (this.timer !== undefined) { this.options.clearTimer(this.timer); this.timer = undefined; }
    if (this.stopped) return;
    if (this.options.isTTY && this.statusShown) this.options.write(CLEAR_LINE);
    this.statusShown = false;
    this.stopped = true;
  }
}

/** Default wiring for a real process. */
export function createProcessScoutTerminalView(stream: { write(text: string): unknown; isTTY?: boolean; columns?: number }): ScoutTerminalView {
  return new ScoutTerminalView({
    write: (text) => { stream.write(text); },
    isTTY: Boolean(stream.isTTY),
    now: () => Date.now(),
    setTimer: (callback, ms) => setInterval(callback, ms),
    clearTimer: (handle) => clearInterval(handle as NodeJS.Timeout),
    columns: stream.columns
  });
}
