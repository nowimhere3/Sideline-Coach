/**
 * Q2.10D — Queue-for-owner.
 *
 * A Play waiting for ONE exact Player instance in ONE Game. Owned by the Control
 * Plane and written to disk on every change, so an accepted queued Play survives a
 * routine Control Plane freshness replacement (the successor reads the same file).
 *
 *   queued           waiting for its instance to be free (FIFO per Game + instance)
 *   dispatching      handed to the router; the file says so before the send
 *   needs-attention  Coach will not guess: target gone, benched, unavailable, or the
 *                    send outcome is unknown. It blocks the items behind it.
 *
 * A queued Play is never moved to a sibling and never resent on its own after an
 * unknown outcome. Finished items leave the queue (the Ledger keeps history).
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RouteConstraints } from '../capability-types';

export type QueuedPlayState = 'queued' | 'dispatching' | 'needs-attention';

export interface QueuedPlay {
  readonly id: string;
  readonly gameId: string;
  readonly playerInstanceId: string;
  readonly playerType?: string;
  readonly prompt: string;
  readonly model?: string;
  readonly effort?: string;
  readonly playLabel?: string;
  /** One Dadified sentence: why this Play waits for this instance. */
  readonly reason: string;
  readonly context?: { readonly reportPath?: string; readonly ownerInstanceId?: string; readonly preamble?: string };
  /** Human constraints resolved when this durable route was accepted. */
  readonly constraints?: RouteConstraints;
  readonly queuedAt: number;
  readonly seq: number;
  state: QueuedPlayState;
  attention?: string;
}

export interface QueueStore {
  load(): unknown;
  save(items: readonly QueuedPlay[]): void;
}

/** Atomic JSON file store beside the Control Plane manifest. */
export function fileQueueStore(file: string): QueueStore {
  return {
    load: () => {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; }
    },
    save: (items) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(temp, JSON.stringify({ version: 1, items }, null, 2), 'utf8');
      fs.renameSync(temp, file);
    }
  };
}

export const MEMORY_QUEUE_STORE: QueueStore = { load: () => undefined, save: () => undefined };

export class PlayQueue {
  private items: QueuedPlay[] = [];
  private seq = 0;

  constructor(private readonly store: QueueStore = MEMORY_QUEUE_STORE, private readonly now: () => number = Date.now) {
    const loaded = store.load() as { version?: unknown; items?: unknown } | undefined;
    if (loaded?.version === 1 && Array.isArray(loaded.items)) {
      let interrupted = false;
      for (const raw of loaded.items) {
        const item = raw as Partial<QueuedPlay>;
        if (typeof item.id !== 'string' || typeof item.gameId !== 'string' || typeof item.playerInstanceId !== 'string' || typeof item.prompt !== 'string') continue;
        const restored: QueuedPlay = {
          id: item.id,
          gameId: item.gameId,
          playerInstanceId: item.playerInstanceId,
          playerType: item.playerType,
          prompt: item.prompt,
          model: item.model,
          effort: item.effort,
          playLabel: item.playLabel,
          reason: typeof item.reason === 'string' ? item.reason : 'Queued',
          context: item.context,
          constraints: item.constraints,
          queuedAt: typeof item.queuedAt === 'number' ? item.queuedAt : 0,
          seq: typeof item.seq === 'number' ? item.seq : 0,
          state: item.state === 'needs-attention' ? 'needs-attention' : item.state === 'dispatching' ? 'needs-attention' : 'queued',
          // A Control Plane that stopped mid-send cannot know whether the Play started.
          attention: item.state === 'dispatching'
            ? "Coach can't tell whether this queued Play started before Coach restarted. Check the Player, then send it again or cancel it."
            : item.attention
        };
        if (item.state === 'dispatching') interrupted = true;
        this.items.push(restored);
        this.seq = Math.max(this.seq, restored.seq);
      }
      if (interrupted) this.persist();
    }
  }

  enqueue(input: Omit<QueuedPlay, 'id' | 'queuedAt' | 'seq' | 'state' | 'attention'>): QueuedPlay {
    const item: QueuedPlay = { ...input, id: `queue_${crypto.randomBytes(6).toString('hex')}`, queuedAt: this.now(), seq: ++this.seq, state: 'queued' };
    this.items.push(item);
    this.persist();
    return item;
  }

  /** Items for one Game, in dispatch order. Never another Game's. */
  forGame(gameId: string): QueuedPlay[] {
    return this.items.filter((item) => item.gameId === gameId).sort((a, b) => a.seq - b.seq).map((item) => ({ ...item }));
  }

  forInstance(gameId: string, playerInstanceId: string): QueuedPlay[] {
    return this.forGame(gameId).filter((item) => item.playerInstanceId === playerInstanceId);
  }

  /** The next item for an exact instance (FIFO). A blocked head blocks the rest. */
  head(gameId: string, playerInstanceId: string): QueuedPlay | undefined {
    return this.forInstance(gameId, playerInstanceId)[0];
  }

  instancesWithWork(gameId: string): string[] {
    return [...new Set(this.forGame(gameId).map((item) => item.playerInstanceId))];
  }

  get(id: string): QueuedPlay | undefined {
    const item = this.items.find((candidate) => candidate.id === id);
    return item ? { ...item } : undefined;
  }

  markDispatching(id: string): boolean {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item || item.state !== 'queued') return false;
    item.state = 'dispatching';
    item.attention = undefined;
    this.persist();
    return true;
  }

  /** The Play was delivered: it leaves the queue. */
  complete(id: string): void {
    this.items = this.items.filter((item) => item.id !== id);
    this.persist();
  }

  /** Back to waiting (for example the instance turned busy again before the send). */
  requeue(id: string): void {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) return;
    item.state = 'queued';
    item.attention = undefined;
    this.persist();
  }

  needsAttention(id: string, message: string): void {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) return;
    if (item.state === 'needs-attention' && item.attention === message) return;
    item.state = 'needs-attention';
    item.attention = message;
    this.persist();
  }

  /** Human "Try again": only a human clears an attention state. */
  retry(id: string, gameId?: string): boolean {
    const item = this.items.find((candidate) => candidate.id === id && (!gameId || candidate.gameId === gameId));
    if (!item || item.state !== 'needs-attention') return false;
    item.state = 'queued';
    item.attention = undefined;
    this.persist();
    return true;
  }

  cancel(id: string, gameId?: string): QueuedPlay | undefined {
    const item = this.items.find((candidate) => candidate.id === id && (!gameId || candidate.gameId === gameId));
    if (!item || item.state === 'dispatching') return undefined;
    this.items = this.items.filter((candidate) => candidate !== item);
    this.persist();
    return { ...item };
  }

  private persist(): void {
    try { this.store.save(this.items); } catch { /* The in-memory queue stays truthful; the next change retries the write. */ }
  }
}
