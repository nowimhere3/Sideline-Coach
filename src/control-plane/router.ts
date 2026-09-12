import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { StadiumRegistry, StadiumSession } from './stadium-registry';
import { buildRpcRequest, type DispatchAcceptedParams, type DispatchRejectedParams } from './protocol';
import { computeAutoRoute, CodexRoutingPolicy, type ProviderRoutingPolicy } from '../routing-policy';
import type { PlayerRoutingCapability, RoutingDecision } from '../capability-types';

export interface DispatchOptions {
  prompt: string;
  gameId?: string;
  stadiumId?: string;
  playerInstanceId?: string;
  terminalName?: string;
  routingMode?: 'auto' | 'manual';
  model?: string;
  effort?: string;
  modelSwitch?: string;
}

export interface DispatchResult {
  success: boolean;
  statusCode: number;
  clientRef?: string;
  turnRef?: string;
  status?: 'received' | 'failed' | 'unknown';
  message?: string;
  decision?: RoutingDecision;
}

interface PendingDispatch {
  clientRef: string;
  stadiumId: string;
  gameId: string;
  playerInstanceId: string;
  resolve: (result: DispatchResult) => void;
  timer: NodeJS.Timeout;
  session: StadiumSession;
}

export class ControlPlaneRouter extends EventEmitter {
  private nextRpcId = 1;
  private readonly inFlight = new Map<string, PendingDispatch>();
  private readonly activePlayerDispatches = new Set<string>();
  private readonly policies = new Map<string, ProviderRoutingPolicy>([
    ['codex', new CodexRoutingPolicy()]
  ]);

  constructor(private readonly registry: StadiumRegistry) {
    super();

    // Listen for session removals to handle in-flight drop -> Unknown
    this.registry.on('change', (event: { type: string; instanceId?: string }) => {
      if (event.type === 'session-removed' && event.instanceId) {
        this.handleSessionDisconnected(event.instanceId);
      }
    });
  }

  async dispatch(options: DispatchOptions): Promise<DispatchResult> {
    const prompt = typeof options.prompt === 'string' ? options.prompt : '';
    if (!prompt.trim()) {
      return { success: false, statusCode: 400, message: 'Prompt cannot be empty.' };
    }

    const targetGameId = options.gameId || this.registry.getSelectedGameId();
    if (!targetGameId) {
      return { success: false, statusCode: 400, message: 'No Game selected or available.' };
    }

    const auth = this.registry.getAuthoritativeSessionForGame(targetGameId);
    if (auth.status === 'offline') {
      return {
        success: false,
        statusCode: 400,
        message: auth.error || `Game '${targetGameId}' is currently offline. Open a Stadium window for this Game to dispatch plays.`
      };
    }

    if (auth.status === 'conflicted' || !auth.session) {
      return {
        success: false,
        statusCode: 409,
        message: auth.error || `Game '${targetGameId}' binding is conflicted across multiple stadiums. Dispatch blocked.`
      };
    }

    const session = auth.session;

    // Cross-stadium validation
    if (options.stadiumId && options.stadiumId !== session.stadiumId) {
      return {
        success: false,
        statusCode: 409,
        message: `Cross-Stadium dispatch rejection: Target stadium '${options.stadiumId}' does not match active stadium '${session.stadiumId}'.`
      };
    }

    let targetPlayerInstanceId = options.playerInstanceId;
    let targetModel = options.model;
    let targetEffort = options.effort;
    let decision: RoutingDecision | undefined;

    const routingMode = options.routingMode ?? 'auto';

    if (routingMode === 'auto') {
      // `session.capabilities` is already the Stadium's canonical
      // PlayerRoutingCapability[] (PlayerRoster.getRoutingCapabilities). It is the
      // only roster projection shaped for routing; `session.roster` is the grouped
      // per-Player status projection and must not be reinterpreted as a flat
      // candidate list.
      const candidates = (session.capabilities || []) as PlayerRoutingCapability[];

      if (!session.rosterSynchronized) {
        return {
          success: false,
          statusCode: 409,
          message: 'Roster is still synchronizing with the Stadium. Retry in a moment or switch to Manual.'
        };
      }

      const autoResult = computeAutoRoute(targetGameId, prompt, candidates, this.policies);
      if (autoResult.error || !autoResult.decision) {
        return {
          success: false,
          statusCode: 400,
          message: autoResult.error || 'Failed to compute automatic route.'
        };
      }

      decision = autoResult.decision;
      targetPlayerInstanceId = decision.playerInstanceId;
      targetModel = decision.model;
      targetEffort = decision.effort;
    }

    const effectivePlayerId = targetPlayerInstanceId || (options.terminalName ? `term_${options.terminalName}` : 'unknown');

    // Duplicate SEND guard
    const flightKey = `${targetGameId}:${effectivePlayerId}`;
    if (this.activePlayerDispatches.has(flightKey)) {
      return {
        success: false,
        statusCode: 409,
        message: `Dispatch already in flight for target '${effectivePlayerId}'. Wait for completion.`
      };
    }

    this.activePlayerDispatches.add(flightKey);

    const clientRef = `ref_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Phase 1: Emit Sending...
    this.emit('status-update', {
      type: 'turn',
      gameId: targetGameId,
      stadiumId: session.stadiumId,
      playerInstanceId: effectivePlayerId,
      state: 'sending',
      clientRef,
      at: Date.now()
    });

    return new Promise<DispatchResult>((resolve) => {
      const timeoutMs = 15000;
      const timer = setTimeout(() => {
        this.inFlight.delete(clientRef);
        this.activePlayerDispatches.delete(flightKey);

        // Timeout -> Unknown
        this.emit('status-update', {
          type: 'turn',
          gameId: targetGameId,
          stadiumId: session.stadiumId,
          playerInstanceId: effectivePlayerId,
          state: 'unknown',
          clientRef,
          at: Date.now()
        });

        resolve({
          success: false,
          statusCode: 504,
          clientRef,
          status: 'unknown',
          message: 'Dispatch timed out waiting for Stadium ingress confirmation. State is Unknown (no auto-resend).'
        });
      }, timeoutMs);

      const pending: PendingDispatch = {
        clientRef,
        stadiumId: session.stadiumId,
        gameId: targetGameId,
        playerInstanceId: effectivePlayerId,
        resolve: (res) => {
          clearTimeout(timer);
          this.inFlight.delete(clientRef);
          this.activePlayerDispatches.delete(flightKey);
          resolve(res);
        },
        timer,
        session
      };

      this.inFlight.set(clientRef, pending);

      // Send dispatch.request JSON-RPC frame to Stadium
      const rpcId = this.nextRpcId++;
      const frame = buildRpcRequest(rpcId, 'dispatch.request', {
        clientRef,
        stadiumId: session.stadiumId,
        gameId: targetGameId,
        playerInstanceId: targetPlayerInstanceId,
        terminalName: options.terminalName,
        prompt,
        modelSwitch: options.modelSwitch,
        routingMode,
        model: targetModel,
        effort: targetEffort
      });

      try {
        session.socket.send(JSON.stringify(frame));
      } catch (err) {
        clearTimeout(timer);
        this.inFlight.delete(clientRef);
        this.activePlayerDispatches.delete(flightKey);

        // Immediate failure to send -> Unknown or Failed
        this.emit('status-update', {
          type: 'turn',
          gameId: targetGameId,
          stadiumId: session.stadiumId,
          playerInstanceId: effectivePlayerId,
          state: 'unknown',
          clientRef,
          at: Date.now()
        });

        resolve({
          success: false,
          statusCode: 502,
          clientRef,
          status: 'unknown',
          message: `Failed to forward dispatch frame to Stadium: ${err instanceof Error ? err.message : String(err)}`
        });
      }
    });
  }

  handleDispatchAccepted(params: DispatchAcceptedParams): void {
    const pending = this.inFlight.get(params.clientRef);
    if (!pending) return;

    // Phase 2: Downstream ingress confirmed -> Received
    this.emit('status-update', {
      type: 'turn',
      gameId: pending.gameId,
      stadiumId: pending.stadiumId,
      playerInstanceId: pending.playerInstanceId,
      state: 'received',
      clientRef: params.clientRef,
      turnRef: params.turnRef,
      at: params.acceptedAt || Date.now()
    });

    pending.resolve({
      success: true,
      statusCode: 200,
      clientRef: params.clientRef,
      turnRef: params.turnRef,
      status: 'received',
      message: 'Dispatch accepted by Stadium provider.'
    });
  }

  handleDispatchRejected(params: DispatchRejectedParams): void {
    const pending = this.inFlight.get(params.clientRef);
    if (!pending) return;

    this.emit('status-update', {
      type: 'turn',
      gameId: pending.gameId,
      stadiumId: pending.stadiumId,
      playerInstanceId: pending.playerInstanceId,
      state: 'failed',
      clientRef: params.clientRef,
      error: params.error.message,
      at: Date.now()
    });

    pending.resolve({
      success: false,
      statusCode: 400,
      clientRef: params.clientRef,
      status: 'failed',
      message: params.error.message
    });
  }

  private handleSessionDisconnected(instanceId: string): void {
    for (const [clientRef, pending] of this.inFlight.entries()) {
      if (pending.session.instanceId === instanceId) {
        clearTimeout(pending.timer);
        this.inFlight.delete(clientRef);
        const flightKey = `${pending.gameId}:${pending.playerInstanceId}`;
        this.activePlayerDispatches.delete(flightKey);

        // Acknowledgement loss -> Unknown (Certified Invariant)
        this.emit('status-update', {
          type: 'turn',
          gameId: pending.gameId,
          stadiumId: pending.stadiumId,
          playerInstanceId: pending.playerInstanceId,
          state: 'unknown',
          clientRef,
          at: Date.now()
        });

        pending.resolve({
          success: false,
          statusCode: 502,
          clientRef,
          status: 'unknown',
          message: 'Stadium WebSocket disconnected before downstream acceptance confirmed. Outcome is Unknown.'
        });
      }
    }
  }
}
