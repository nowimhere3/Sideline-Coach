import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { StadiumRegistry, StadiumSession } from './stadium-registry';
import { buildRpcRequest, type DispatchAcceptedParams, type DispatchRejectedParams } from './protocol';
import { computeAutoRoute, computeContextAwareRoute, createRoutingPolicies, resolveCoachAuto, type ProviderRoutingPolicy, type RouteChoice, type RouteContext } from '../routing-policy';
import { extractTouches } from './context-affinity';
import type { PlayQueue } from './play-queue';
import type { PlayerRoutingCapability, RoutingDecision } from '../capability-types';
import { analyzePlay, analyzeScoutContinuationAuthority, isReportRequested } from '../play-analyzer';
import { buildReportProvenanceInstruction, buildReportDestinationInstruction, createControlledExecutionProvenance } from '../report-provenance';
import { friendlyInstanceNames } from '../player-display-labels';
import { summarizePlayContext } from '../play-summary';
import { SCOUT_PLAYER_INSTANCE_ID } from '../scout-player-contract';
import { buildScoutContinuationPreamble } from './scout-continuation';

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
  /** Q2.10D: the report the human is looking at in Incoming (explicit context evidence). */
  incomingReportPath?: string;
  /** Q2.10D: the human picked the offered alternative route. */
  routeChoice?: RouteChoice;
  /** Q2.10D: MANUAL — wait for a busy exact instance instead of refusing. */
  whenBusy?: 'queue';
  /** Internal: a queued Play being released for its exact instance (no re-routing). */
  queueItemId?: string;
  /** Internal: the provider-neutral handoff accepted with a queued route. */
  contextPreamble?: string;
  /** Explicit report-requested override if known. */
  reportRequested?: boolean;
  /** Internal: one post-Formation return to ordinary AUTO, with Scout excluded. */
  scoutContinuation?: {
    readonly originalClientRef: string;
    readonly formationId?: string;
    readonly reportPath: string;
    readonly authorityReason: string;
    readonly originalContextPreamble?: string;
  };
}

export interface DispatchResult {
  success: boolean;
  statusCode: number;
  clientRef?: string;
  turnRef?: string;
  status?: 'received' | 'failed' | 'unknown' | 'queued';
  message?: string;
  decision?: RoutingDecision;
  queueItemId?: string;
  queuePosition?: number;
  /** Exact executed/queued target; clients never infer it from UI selection. */
  playerInstanceId?: string;
  playerName?: string;
}

interface PendingDispatch {
  clientRef: string;
  stadiumId: string;
  gameId: string;
  playerInstanceId: string;
  playerName: string;
  resolve: (result: DispatchResult) => void;
  timer: NodeJS.Timeout;
  session: StadiumSession;
  /** The canonical AUTO decision used to build the frame (preview and actual share computeRoute). */
  decision?: RoutingDecision;
}

export class ControlPlaneRouter extends EventEmitter {
  private nextRpcId = 1;
  private readonly inFlight = new Map<string, PendingDispatch>();
  private readonly activePlayerDispatches = new Set<string>();
  private readonly policies = createRoutingPolicies();

  /** Optional per-instance activity (Instance Work Ledger) layered onto AUTO candidates. */
  private candidateEnricher: ((gameId: string, candidates: PlayerRoutingCapability[]) => PlayerRoutingCapability[]) | undefined;

  setCandidateEnricher(enricher: (gameId: string, candidates: PlayerRoutingCapability[]) => PlayerRoutingCapability[]): void {
    this.candidateEnricher = enricher;
  }

  /** Q2.10D: Ledger, reports, names and queue depth for ONE Game — the evidence AUTO routes on. */
  private routeContextProvider: ((gameId: string) => RouteContext) | undefined;
  private playQueue: PlayQueue | undefined;

  setRouteContextProvider(provider: (gameId: string) => RouteContext): void {
    this.routeContextProvider = provider;
  }

  setPlayQueue(queue: PlayQueue): void {
    this.playQueue = queue;
  }

  /**
   * S9.0: resolves the canonical, Game-relative report destination for a
   * Controlled Play — the same GameFilesystemContract coordinate S7 already
   * applies and watches for that exact Game/Stadium. `undefined` means "do not
   * fabricate a destination" (contract not ready, lane not ready, or the exact
   * session cannot consume the canonical contract) — the Play is dispatched
   * with provenance only, exactly as before S9.0.
   */
  private reportDestinationResolver: ((gameId: string, playerType: string, sessionFeatures: readonly string[]) => string | undefined) | undefined;

  setReportDestinationResolver(resolver: (gameId: string, playerType: string, sessionFeatures: readonly string[]) => string | undefined): void {
    this.reportDestinationResolver = resolver;
  }

  /**
   * The AUTO route — shared by the staged preview and the real dispatch, so what the
   * human saw is what runs.
   */
  computeRoute(gameId: string, prompt: string, candidates: PlayerRoutingCapability[], extra: { incomingReportPath?: string; routeChoice?: RouteChoice } = {}): { decision?: RoutingDecision; error?: string } {
    const enriched = this.candidateEnricher ? this.candidateEnricher(gameId, candidates) : candidates;
    if (!this.routeContextProvider) return computeAutoRoute(gameId, prompt, enriched, this.policies);
    return computeContextAwareRoute(gameId, prompt, enriched, this.policies, {
      ...this.routeContextProvider(gameId),
      incomingReportPath: extra.incomingReportPath,
      choice: extra.routeChoice
    });
  }

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
      const raw = (session.capabilities || []) as PlayerRoutingCapability[];
      // One automatic Scout stage maximum. Continuation reuses ordinary AUTO
      // over the current Team, with only the logical Scout target removed.
      const routeCandidates = options.scoutContinuation
        ? raw.filter((candidate) => candidate.instanceId !== SCOUT_PLAYER_INSTANCE_ID)
        : raw;

      if (!session.rosterSynchronized) {
        return {
          success: false,
          statusCode: 409,
          message: 'Roster is still synchronizing with the Stadium. Retry in a moment or switch to Manual.'
        };
      }

      const autoResult = options.queueItemId
        ? { error: 'A queued Play is released to its exact instance, never re-routed.' }
        : this.computeRoute(targetGameId, prompt, routeCandidates, { incomingReportPath: options.incomingReportPath, routeChoice: options.routeChoice });
      if (autoResult.error || !autoResult.decision) {
        return {
          success: false,
          statusCode: 400,
          message: autoResult.error || 'Failed to compute automatic route.'
        };
      }

      decision = autoResult.decision;
      if (options.scoutContinuation) {
        const continuationPreamble = buildScoutContinuationPreamble({
          reportPath: options.scoutContinuation.reportPath,
          formationId: options.scoutContinuation.formationId,
          authorityReason: options.scoutContinuation.authorityReason
        });
        decision = {
          ...decision,
          action: decision.action === 'queue' ? 'queue' : 'handoff',
          contextPreamble: `${continuationPreamble}${options.scoutContinuation.originalContextPreamble ?? ''}${decision.contextPreamble ?? ''}`,
          scoutContinuation: {
            phase: 'post-scout',
            originalClientRef: options.scoutContinuation.originalClientRef,
            formationId: options.scoutContinuation.formationId,
            reportPath: options.scoutContinuation.reportPath,
            authorityReason: options.scoutContinuation.authorityReason
          }
        };
      }
      targetPlayerInstanceId = decision.playerInstanceId;
      targetModel = decision.model;
      targetEffort = decision.effort;
    } else if (targetModel === 'auto' || targetEffort === 'auto') {
      // MANUAL Player, Coach Auto model/effort: resolve for the EXACT instance the
      // human chose. Never substitutes a sibling; never fakes a control.
      const candidate = ((session.capabilities || []) as PlayerRoutingCapability[]).find((entry) => entry.instanceId === targetPlayerInstanceId);
      const resolved = resolveCoachAuto(candidate, prompt, { model: targetModel, effort: targetEffort }, this.policies);
      targetModel = resolved.model;
      targetEffort = resolved.effort;
    }

    // Terminal executes the exact command: model and reasoning do not apply.
    const targetCapability = ((session.capabilities || []) as PlayerRoutingCapability[]).find((entry) => entry.instanceId === targetPlayerInstanceId);
    if (routingMode === 'manual' && targetPlayerInstanceId === SCOUT_PLAYER_INSTANCE_ID) {
      if (!targetCapability || targetCapability.executionType !== 'scout-formation' || targetCapability.state !== 'ready') {
        return {
          success: false,
          statusCode: 400,
          playerInstanceId: SCOUT_PLAYER_INSTANCE_ID,
          playerName: 'Scout',
          message: 'Scout is unavailable: the capability is disabled, already working, or no eligible Formation receiver is currently proven READY.'
        };
      }
      targetModel = undefined;
      targetEffort = undefined;
      decision = {
        mode: 'manual',
        gameId: targetGameId,
        playerInstanceId: SCOUT_PLAYER_INSTANCE_ID,
        playerLabel: 'Scout',
        playerName: 'Scout',
        provider: 'scout',
        modelDisplayName: 'Scout Formation',
        reason: 'Scout selected explicitly by the human.',
        summary: 'Scout selected as you asked.',
        stagedAt: Date.now(),
        transport: 'controlled',
        playLabel: analyzePlay(prompt).label,
        action: 'dispatch'
      };
    }
    const targetPlayerName = friendlyInstanceNames(session.roster).get(targetPlayerInstanceId ?? '')
      ?? decision?.playerName
      ?? decision?.playerLabel
      ?? targetCapability?.fieldLabel?.replace(/\s*·\s*(Controlled|Terminal|Adopted|External).*$/i, '').trim()
      ?? targetCapability?.playerType
      ?? 'Player';
    if (targetCapability?.playerType === 'terminal') {
      targetModel = undefined;
      targetEffort = undefined;
    }

    // S56.1 SCOUT-DIRECTIVE-INTERCEPT control/play separation: the recognized "Scout this play" directive is routing
    // control, not the objective. Scout receives the remaining objective; with none, it keeps the original Play so
    // nothing is fabricated or lost. Only an AUTO decision that actually landed on Scout ever carries a directive.
    const scoutDirective = decision?.constraints?.directive;
    const executionPrompt = scoutDirective?.kind === 'scout' && scoutDirective.executionPrompt && targetPlayerInstanceId === SCOUT_PLAYER_INSTANCE_ID
      ? scoutDirective.executionPrompt
      : prompt;

    // Q2.10D: wait for the exact instance instead of sending now.
    //   AUTO  — the route said so (busy context owner, or a Player changing the same files)
    //   MANUAL — the human asked to queue for a busy instance
    const manualQueue = routingMode === 'manual' && options.whenBusy === 'queue' && !options.queueItemId
      && targetCapability?.transport === 'controlled' && targetCapability.playerType !== 'terminal'
      && targetCapability.supportsQueue !== false
      && (targetCapability.state === 'busy' || (this.playQueue?.forInstance(targetGameId, targetCapability.instanceId).length ?? 0) > 0);
    if ((decision?.action === 'queue' || manualQueue) && targetPlayerInstanceId) {
      if (!this.playQueue) {
        return { success: false, statusCode: 409, message: 'Coach cannot queue Plays right now. Wait or switch to Manual.' };
      }
      const ahead = this.playQueue.forInstance(targetGameId, targetPlayerInstanceId).length;
      const item = this.playQueue.enqueue({
        gameId: targetGameId,
        playerInstanceId: targetPlayerInstanceId,
        playerType: targetCapability?.playerType,
        prompt: executionPrompt,
        model: targetModel,
        effort: targetEffort,
        playLabel: decision?.playLabel ?? analyzePlay(prompt).label,
        reason: decision?.summary ?? `You queued this for ${targetCapability?.fieldLabel?.split(' · ')[0] ?? 'this Player'}.`,
        context: decision?.context ? {
          reportPath: decision.context.reportPath,
          ownerInstanceId: decision.context.ownerInstanceId,
          preamble: decision.contextPreamble
        } : undefined,
        constraints: decision?.constraints
      });
      this.emit('play-queued', {
        gameId: targetGameId,
        playerInstanceId: targetPlayerInstanceId,
        playerType: targetCapability?.playerType,
        queueItemId: item.id
      });
      return {
        success: true,
        statusCode: 202,
        status: 'queued',
        queueItemId: item.id,
        queuePosition: ahead + 1,
        playerInstanceId: targetPlayerInstanceId,
        playerName: targetPlayerName,
        decision,
        message: decision?.summary ?? 'Queued.'
      };
    }

    // Q2.10D: a handoff (or a Play whose owner is Unknown but whose report is known)
    // carries a compact, provider-neutral context package ahead of the human's Play.
    const humanPrompt = executionPrompt;

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

    const dispatchedAt = Date.now();
    const clientRef = `ref_${dispatchedAt}_${crypto.randomBytes(4).toString('hex')}`;

    // Instance Work Ledger: what is about to be sent, to which EXACT instance, and how.
    const routed = ((session.capabilities || []) as PlayerRoutingCapability[]).find((entry) => entry.instanceId === targetPlayerInstanceId);
    const contextPreamble = decision?.contextPreamble ?? options.contextPreamble;
    const contextPrompt = contextPreamble ? `${contextPreamble}${humanPrompt}` : humanPrompt;
    const isControlledReasoningPlay = routed?.transport === 'controlled'
      && routed.executionType !== 'direct-shell'
      && routed.executionType !== 'scout-formation';
    const provenanceInstruction = isControlledReasoningPlay
      ? buildReportProvenanceInstruction(createControlledExecutionProvenance({
          gameId: targetGameId,
          clientRef,
          playerInstanceId: routed.instanceId,
          playerType: routed.playerType,
          provider: routed.capability.provider || routed.playerType,
          model: targetModel,
          effort: targetEffort,
          at: dispatchedAt
        }))
      : undefined;
    // S9.0: the SAME authoritative contract S7 applies/watches for this exact
    // Game/Stadium — never re-derived from prompt text, reportGlobs, or a
    // browser-selected Game. `undefined` (not-ready/unresolved/mixed-version)
    // silently omits the clause; it never fabricates or guesses a path.
    const destination = isControlledReasoningPlay && this.reportDestinationResolver
      ? this.reportDestinationResolver(targetGameId, routed.playerType, session.features ?? [])
      : undefined;
    const reportInstruction = provenanceInstruction
      ? [provenanceInstruction, destination ? buildReportDestinationInstruction(destination) : undefined].filter(Boolean).join('\n\n')
      : undefined;
    const deliveredPrompt = reportInstruction ? `${contextPrompt}\n\n${reportInstruction}` : contextPrompt;
    // AUTO direct-shell is fail-closed: only the classifier's exact reviewed
    // command may cross the dispatch boundary. MANUAL Terminal retains its
    // existing exact-human-text behavior.
    const isAutoTerminal = routingMode === 'auto' && routed?.executionType === 'direct-shell';
    if (isAutoTerminal && !decision?.terminalCommand) {
      this.activePlayerDispatches.delete(flightKey);
      return {
        success: false,
        statusCode: 409,
        playerInstanceId: effectivePlayerId,
        playerName: targetPlayerName,
        decision,
        message: 'AUTO Terminal command evidence is missing. Nothing was run.'
      };
    }
    const dispatchPrompt = isAutoTerminal ? decision!.terminalCommand! : deliveredPrompt;
    this.emit('play-dispatched', {
      gameId: targetGameId,
      playerInstanceId: effectivePlayerId,
      playerType: routed?.playerType,
      clientRef,
      playLabel: decision?.playLabel ?? analyzePlay(humanPrompt).label,
      promptSummary: summarizePlayContext(humanPrompt, options.incomingReportPath ?? decision?.context?.reportPath),
      model: targetModel,
      effort: targetEffort,
      transport: routed?.transport ?? (options.terminalName ? 'legacy' : undefined),
      at: dispatchedAt,
      touches: extractTouches(humanPrompt),
      queueItemId: options.queueItemId,
      reportRequested: options.reportRequested ?? isReportRequested(prompt)
    });
    if (routingMode === 'auto' && decision?.scoutNeed && targetPlayerInstanceId === SCOUT_PLAYER_INSTANCE_ID) {
      this.emit('scout-continuation-staged', {
        gameId: targetGameId,
        originalClientRef: clientRef,
        originalPrompt: humanPrompt,
        originalPlayLabel: decision.playLabel,
        createdAt: dispatchedAt,
        scoutReason: decision.reason,
        authority: analyzeScoutContinuationAuthority(humanPrompt),
        originalContextPreamble: decision.contextPreamble,
        originalContextReportPath: decision.context?.reportPath
      });
    }

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
        if (decision?.scoutNeed) {
          this.emit('scout-continuation-delivery-failed', {
            originalClientRef: clientRef,
            state: 'unknown',
            note: 'Scout dispatch timed out before Stadium ingress was confirmed; no continuation was attempted.'
          });
        }

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
          playerInstanceId: effectivePlayerId,
          playerName: targetPlayerName,
          decision,
          message: 'Dispatch timed out waiting for Stadium ingress confirmation. State is Unknown (no auto-resend).'
        });
      }, timeoutMs);

      const pending: PendingDispatch = {
        clientRef,
        stadiumId: session.stadiumId,
        gameId: targetGameId,
        playerInstanceId: effectivePlayerId,
        playerName: targetPlayerName,
        resolve: (res) => {
          clearTimeout(timer);
          this.inFlight.delete(clientRef);
          this.activePlayerDispatches.delete(flightKey);
          resolve(res);
        },
        timer,
        session,
        decision
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
        prompt: dispatchPrompt,
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
        if (decision?.scoutNeed) {
          this.emit('scout-continuation-delivery-failed', {
            originalClientRef: clientRef,
            state: 'unknown',
            note: 'Scout dispatch could not be forwarded; no continuation was attempted.'
          });
        }

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
          playerInstanceId: effectivePlayerId,
          playerName: targetPlayerName,
          decision,
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
      at: params.acceptedAt || Date.now(),
      observed: params.observed
    });
    if (pending.decision?.scoutNeed) {
      this.emit('scout-continuation-accepted', {
        originalClientRef: params.clientRef,
        turnRef: params.turnRef
      });
    }

    pending.resolve({
      success: true,
      statusCode: 200,
      clientRef: params.clientRef,
      turnRef: params.turnRef,
      status: 'received',
      playerInstanceId: pending.playerInstanceId,
      playerName: pending.playerName,
      decision: pending.decision,
      message: `Play sent to ${pending.playerName}.`
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
    if (pending.decision?.scoutNeed) {
      this.emit('scout-continuation-delivery-failed', {
        originalClientRef: params.clientRef,
        state: 'failed',
        note: params.error.message
      });
    }

    pending.resolve({
      success: false,
      statusCode: 400,
      clientRef: params.clientRef,
      status: 'failed',
      playerInstanceId: pending.playerInstanceId,
      playerName: pending.playerName,
      decision: pending.decision,
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
          playerInstanceId: pending.playerInstanceId,
          playerName: pending.playerName,
          decision: pending.decision,
          message: 'Stadium WebSocket disconnected before downstream acceptance confirmed. Outcome is Unknown.'
        });
      }
    }
  }
}
