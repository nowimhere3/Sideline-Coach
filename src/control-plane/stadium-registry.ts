import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import type { GameIdentityPayload } from './protocol';

export interface StadiumSession {
  instanceId: string;
  stadiumId: string;
  name: string;
  platform: string;
  socket: WebSocket;
  lastHeartbeat: number;
  game?: GameIdentityPayload;
  rootFsPath?: string;
  roster: unknown[];
  capabilities: unknown[];
  reports: unknown[];
  /**
   * False until this session has actually published a roster snapshot. An empty
   * roster before the first snapshot means "not synchronized yet", never
   * "this Game has no Players" — the two must not be collapsed.
   */
  rosterSynchronized: boolean;
  rosterSyncedAt: number;
}

export interface KnownGameRecord {
  gameId: string;
  displayName: string;
  fingerprintSource: string;
  repoUri?: string;
  knownRootFsPaths: string[];
  lastSeenAt: number;
  isArchived?: boolean;
}

export type GameConnectionStatus = 'connected' | 'offline' | 'conflicted';

export interface GameViewItem {
  gameId: string;
  displayName: string;
  fingerprintSource: string;
  repoUri?: string;
  connectionStatus: GameConnectionStatus;
  isSelected: boolean;
}

export class StadiumRegistry extends EventEmitter {
  private readonly sessions = new Map<string, StadiumSession>();
  private readonly knownGames = new Map<string, KnownGameRecord>();
  private selectedGameId = '';

  constructor() {
    super();
  }

  registerSession(session: StadiumSession): void {
    this.sessions.set(session.instanceId, session);
    if (session.game) {
      this.recordKnownGame(session.game, session.rootFsPath);
      if (!this.selectedGameId) {
        this.selectedGameId = session.game.gameId;
      }
    }
    this.emit('change', { type: 'session-registered', instanceId: session.instanceId });
  }

  removeSession(instanceId: string): { disconnectedGameId?: string } {
    const session = this.sessions.get(instanceId);
    if (!session) {
      return {};
    }
    const disconnectedGameId = session.game?.gameId;
    this.sessions.delete(instanceId);
    this.emit('change', { type: 'session-removed', instanceId, disconnectedGameId });
    return { disconnectedGameId };
  }

  updateHeartbeat(instanceId: string, timestamp: number): void {
    const session = this.sessions.get(instanceId);
    if (session) {
      session.lastHeartbeat = timestamp;
    }
  }

  setGame(instanceId: string, game: GameIdentityPayload, rootFsPath?: string): void {
    const session = this.sessions.get(instanceId);
    if (!session) return;

    session.game = game;
    session.rootFsPath = rootFsPath;
    this.recordKnownGame(game, rootFsPath);

    if (!this.selectedGameId) {
      this.selectedGameId = game.gameId;
    }

    this.emit('change', { type: 'game-connected', instanceId, gameId: game.gameId });
  }

  removeGame(instanceId: string, gameId: string): void {
    const session = this.sessions.get(instanceId);
    if (session && session.game?.gameId === gameId) {
      session.game = undefined;
      session.roster = [];
      session.rosterSynchronized = false;
      session.rosterSyncedAt = 0;
      session.capabilities = [];
      session.reports = [];
      this.emit('change', { type: 'game-disconnected', instanceId, gameId });
    }
  }

  updateRoster(instanceId: string, roster: unknown[]): void {
    const session = this.sessions.get(instanceId);
    if (session) {
      session.roster = roster;
      session.rosterSynchronized = true;
      session.rosterSyncedAt = Date.now();
      this.emit('change', { type: 'roster-updated', instanceId, gameId: session.game?.gameId });
    }
  }

  updateCapabilities(instanceId: string, capabilities: unknown[]): void {
    const session = this.sessions.get(instanceId);
    if (session) {
      session.capabilities = capabilities;
      this.emit('change', { type: 'capabilities-updated', instanceId, gameId: session.game?.gameId });
    }
  }

  updateReports(instanceId: string, reports: unknown[]): void {
    const session = this.sessions.get(instanceId);
    if (session) {
      session.reports = reports;
      this.emit('change', { type: 'reports-updated', instanceId, gameId: session.game?.gameId });
    }
  }

  getSession(instanceId: string): StadiumSession | undefined {
    return this.sessions.get(instanceId);
  }

  getAllSessions(): StadiumSession[] {
    return Array.from(this.sessions.values());
  }

  getConnectedSessionsForGame(gameId: string): StadiumSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.game?.gameId === gameId && s.socket.readyState === 1 /* OPEN */
    );
  }

  getAuthoritativeSessionForGame(gameId: string): {
    session?: StadiumSession;
    status: GameConnectionStatus;
    error?: string;
  } {
    const candidates = this.getConnectedSessionsForGame(gameId);
    if (candidates.length === 0) {
      return { status: 'offline', error: `Game '${gameId}' is currently offline.` };
    }
    if (candidates.length > 1) {
      return {
        status: 'conflicted',
        error: `Game '${gameId}' binding is conflicted/ambiguous across ${candidates.length} active Stadium windows. Exact routing is blocked.`
      };
    }
    return { session: candidates[0], status: 'connected' };
  }

  getGames(): GameViewItem[] {
    const result: GameViewItem[] = [];
    const activeByGame = new Map<string, StadiumSession[]>();

    for (const session of this.sessions.values()) {
      if (session.game && session.socket.readyState === 1) {
        const list = activeByGame.get(session.game.gameId) ?? [];
        list.push(session);
        activeByGame.set(session.game.gameId, list);
      }
    }

    // Process known games
    for (const record of this.knownGames.values()) {
      if (record.isArchived) continue;
      const activeSessions = activeByGame.get(record.gameId) ?? [];
      let status: GameConnectionStatus = 'offline';
      if (activeSessions.length === 1) {
        status = 'connected';
      } else if (activeSessions.length > 1) {
        status = 'conflicted';
      }

      result.push({
        gameId: record.gameId,
        displayName: record.displayName,
        fingerprintSource: record.fingerprintSource,
        repoUri: record.repoUri,
        connectionStatus: status,
        isSelected: record.gameId === this.selectedGameId
      });
    }

    // Also include any connected games not yet in knownGames
    for (const [gameId, sessions] of activeByGame.entries()) {
      if (!this.knownGames.has(gameId) && sessions.length > 0) {
        const first = sessions[0];
        const status: GameConnectionStatus = sessions.length > 1 ? 'conflicted' : 'connected';
        result.push({
          gameId,
          displayName: first.game?.displayName || 'Game',
          fingerprintSource: first.game?.fingerprintSource || 'unknown',
          repoUri: first.game?.repoUri,
          connectionStatus: status,
          isSelected: gameId === this.selectedGameId
        });
      }
    }

    return result;
  }

  getSelectedGameId(): string {
    return this.selectedGameId;
  }

  setSelectedGameId(gameId: string): boolean {
    if (!gameId) return false;
    const games = this.getGames();
    const found = games.some((g) => g.gameId === gameId);
    if (!found) {
      return false;
    }
    this.selectedGameId = gameId;
    this.emit('change', { type: 'selected-game-changed', selectedGameId: gameId });
    return true;
  }

  getRosterForGame(gameId: string): unknown[] {
    const auth = this.getAuthoritativeSessionForGame(gameId);
    if (auth.status === 'connected' && auth.session) {
      return auth.session.roster;
    }
    return [];
  }

  /** True once the authoritative Stadium session for this Game has published a roster snapshot. */
  isRosterSynchronizedForGame(gameId: string): boolean {
    const auth = this.getAuthoritativeSessionForGame(gameId);
    return auth.status === 'connected' && auth.session ? auth.session.rosterSynchronized : false;
  }

  getCapabilitiesForGame(gameId: string): unknown[] {
    const auth = this.getAuthoritativeSessionForGame(gameId);
    if (auth.status === 'connected' && auth.session) {
      return auth.session.capabilities;
    }
    return [];
  }

  getReportsForGame(gameId: string): unknown[] {
    const auth = this.getAuthoritativeSessionForGame(gameId);
    if (auth.status === 'connected' && auth.session) {
      return auth.session.reports;
    }
    return [];
  }

  private recordKnownGame(game: GameIdentityPayload, rootFsPath?: string): void {
    const existing = this.knownGames.get(game.gameId);
    const now = Date.now();
    if (existing) {
      existing.lastSeenAt = now;
      if (rootFsPath && !existing.knownRootFsPaths.includes(rootFsPath)) {
        existing.knownRootFsPaths.push(rootFsPath);
      }
      if (game.displayName && existing.displayName === 'Unknown') {
        existing.displayName = game.displayName;
      }
      return;
    }

    this.knownGames.set(game.gameId, {
      gameId: game.gameId,
      displayName: game.displayName,
      fingerprintSource: game.fingerprintSource,
      repoUri: game.repoUri,
      knownRootFsPaths: rootFsPath ? [rootFsPath] : [],
      lastSeenAt: now,
      isArchived: false
    });
  }
}
