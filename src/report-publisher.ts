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

export interface ReportWatchHost {
  /** The Game's configured report contract (coach.reportGlobs, with the default). */
  getGlobs(): string[];
  /** Watch one glob; call `onEvent` for any create / change / delete. */
  createWatcher(glob: string, onEvent: () => void): Disposable;
  /** Called when the report contract configuration may have changed. */
  onReportConfigurationChanged(listener: () => void): Disposable;
}

export class ReportPublisher implements Disposable {
  private watchers: Disposable[] = [];
  private configListener: Disposable | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private watchedGlobs: string[] = [];

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
  get globs(): readonly string[] { return this.watchedGlobs; }

  /** Coalesce bursts (an agent writing a report fires several events). */
  schedule(reason: string): void {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.run(reason);
    }, this.debounceMs);
  }

  /** Immediate canonical republish (connect, explicit rescan). */
  async publishNow(reason: string): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    await this.run(reason);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.configListener?.dispose();
    this.configListener = undefined;
    for (const watcher of this.watchers.splice(0)) watcher.dispose();
  }

  private rebuild(): void {
    for (const watcher of this.watchers.splice(0)) watcher.dispose();
    this.watchedGlobs = [...this.host.getGlobs()];
    for (const glob of this.watchedGlobs) {
      this.watchers.push(this.host.createWatcher(glob, () => this.schedule('report-file-changed')));
    }
  }

  private async run(reason: string): Promise<void> {
    if (this.disposed) return;
    try { await this.publish(reason); }
    catch { /* A failed publish is retried by the next event or rescan; never crash the Stadium. */ }
  }
}
