/**
 * Stadium report return loop (P0 Incoming repair).
 *
 * Outbound dispatch and inbound reporting are one product contract: a Play is not
 * complete for the human until its report returns through Incoming. In the
 * detached architecture the Stadium, not the retired local CoachServer, must
 * notice reports and publish them to the Control Plane.
 *
 *   report file created / changed / deleted  → debounced republish
 *   coach.reportGlobs changed                → watchers rebuilt, immediate republish
 *
 * No `vscode` import: the host is injected so the loop is unit-testable.
 */

export interface Disposable { dispose(): void }
export type ReportWatchPattern = string | object;

export interface ReportWatchHost {
  /** Canonical anchored pattern plus coach.reportGlobs compatibility patterns. */
  getPatterns?: () => ReportWatchPattern[];
  /** Pre-S7 host compatibility; new Stadium wiring supplies getPatterns. */
  getGlobs?: () => string[];
  /** Watch one pattern; call `onEvent` for any create / change / delete. */
  createWatcher(pattern: ReportWatchPattern, onEvent: () => void): Disposable;
  /** Called when the report contract configuration may have changed. */
  onReportConfigurationChanged(listener: () => void): Disposable;
}

export class ReportPublisher implements Disposable {
  private watchers: Disposable[] = [];
  private configListener: Disposable | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private watchedPatterns: ReportWatchPattern[] = [];
  private generation = 0;
  private publishChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly host: ReportWatchHost,
    private readonly publish: (reason: string) => Promise<unknown> | unknown,
    private readonly debounceMs = 500
  ) {}

  start(): void {
    if (this.disposed || this.configListener) return;
    this.rebuild();
    this.configListener = this.host.onReportConfigurationChanged(() => {
      this.rebuild();
      this.schedule('report-config-changed');
    });
  }

  /** Globs currently watched — for diagnostics and tests. */
  get patterns(): readonly ReportWatchPattern[] { return this.watchedPatterns; }
  /** Compatibility diagnostic name retained for existing callers and tests. */
  get globs(): readonly ReportWatchPattern[] { return this.watchedPatterns; }

  /** Coalesce bursts (an agent writing a report fires several events). */
  schedule(reason: string): void {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.enqueue(reason);
    }, this.debounceMs);
  }

  /** Immediate canonical republish (connect, explicit rescan). */
  async publishNow(reason: string): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    await this.enqueue(reason);
  }

  /** Dispose old watchers, install the current contract, then publish its snapshot. */
  async rebuildAndPublish(reason = 'report-root-changed'): Promise<void> {
    if (this.disposed) return;
    this.rebuild();
    await this.publishNow(reason);
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.configListener?.dispose();
    this.configListener = undefined;
    for (const watcher of this.watchers.splice(0)) watcher.dispose();
  }

  private rebuild(): void {
    const generation = ++this.generation;
    for (const watcher of this.watchers.splice(0)) watcher.dispose();
    this.watchedPatterns = [...(this.host.getPatterns?.() ?? this.host.getGlobs?.() ?? [])];
    for (const pattern of this.watchedPatterns) {
      this.watchers.push(this.host.createWatcher(pattern, () => {
        if (generation === this.generation) this.schedule('report-file-changed');
      }));
    }
  }

  /** Serial publishing means a superseded scan cannot finish after its replacement. */
  private enqueue(reason: string): Promise<void> {
    this.publishChain = this.publishChain.then(async () => {
      if (this.disposed) return;
      try { await this.publish(reason); }
      catch { /* The next event/rescan retries; watcher failures never crash the Stadium. */ }
    });
    return this.publishChain;
  }
}
