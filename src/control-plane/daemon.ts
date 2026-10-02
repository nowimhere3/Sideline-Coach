import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import QRCode from 'qrcode';
import { WebSocketServer, WebSocket } from 'ws';
import {
  CONTROL_PLANE_PROTOCOL_VERSION,
  buildRpcResponse,
  buildRpcError,
  buildRpcRequest,
  buildRpcNotification,
  isJsonRpcRequest,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isJsonRpcError,
  type ControlPlaneDiscoveryRecord,
  type StadiumHelloParams,
  type StadiumHeartbeatParams,
  type GameConnectedParams,
  type GameDisconnectedParams,
  type RosterSnapshotParams,
  type CapabilitySnapshotParams,
  type PlayerDiscoverySnapshotParams,
  type ReportSnapshotParams,
  type TurnChangedParams,
  type PlayerActivityParams,
  type DispatchAcceptedParams,
  type DispatchRejectedParams,
  type PlayerActionResult,
  type GamePickResult,
  type GameOpenResult,
  type PlayerLifecycleResult,
  type GameFilesBrowseResult,
  type GameFilesCheckResult,
  type GameFilesSearchResult,
  type GameFilesResolveAbsoluteResult,
  type GameFilesystemInspectResult,
  type GameFilesystemApplyResult,
  type GameFilesystemEnsureResult,
  type HealthEvidenceParams,
  type HealthEvidence
} from './protocol';
import { decideAddGame } from '../game-lifecycle';
import { projectPreviewResolution } from '../preview-discovery';
import { ACTIVITY_CATEGORIES, PlayerActivityStore, type ActivityCategory } from '../player-activity';
import { redactForPrincipal } from '../remote-redaction';
import { classifyDaemonRoute, isKnownDaemonRoutePath, principalMayAccess } from './remote-routes';
import { DeviceRegistry, sanitizeDeviceLabel } from './device-registry';
import { RemotePreviewGateway, STADIUM_REMOTE_PREVIEW_FEATURE } from './remote-preview-gateway';
import { PairingStore } from './pairing';
import { HostIdentityManager } from './host-identity';
import { ensureInstallIdentity, type InstallIdentity } from './install-identity';
import { EntitlementAuthority } from '../commercial/authority';
import { FeatureGate } from '../commercial/gate';
import { DEFAULT_PROFILE, type BuiltInProfileId, type EntitlementProfile } from '../commercial/profiles';
import { UsageStore } from '../commercial/usage-store';
import { CLOCK_FILE, LICENSE_FILE, LicenseFileSource, type TrustedKeys } from '../commercial/license';
import { RemoteMinuteMeter, type RemoteMinuteMeterOptions } from '../commercial/remote-minute-meter';
import { NOOP_TRANSPORT, TelemetryOutbox, type TelemetryConsent } from '../telemetry/outbox';
import { buildProductEvent, DIMENSIONS, type ProductEventInput } from '../telemetry/events';
import type { GateDecision } from '../commercial/gate';
import { RelayClient, type RelayClientOptions } from './relay-client';
import { productRemoteRelayBootstrap } from './remote-bootstrap';
import { parseCookies, requestOriginMatchesExpected, requestOriginMatchesHost, timingSafeSecretEqual, type Principal } from './request-security';
import { StadiumRegistry, type StadiumSession } from './stadium-registry';
import { ControlPlaneRouter, type ShadowRoutingFacts } from './router';
import { computeAutoRoute, createRoutingPolicies, eligibleSeats, PROVIDER_PREFERENCE, type ProviderRoutingPolicy } from '../routing-policy';
import { InstanceWorkLedger, type DispatchRecord, type LedgerRecentPlay, type TurnRecord } from './work-ledger';
import { projectExecution, type ExecutionView, type QueuedExecutionItem } from './execution-projection';
import { CONTROL_PLANE_SERVICE, computeControlPlaneBuild } from './freshness';
import { PlayQueue, fileQueueStore, type QueuedPlay } from './play-queue';
import { buildHandoffPreamble, type GameReportRef } from './context-affinity';
import {
  DEFERRED_PLAY_FILE,
  DeferredPlayBook,
  HANDOFF_AFTER_LIMIT_INSTRUCTION,
  continuationEligibility,
  fileDeferredPlayStore,
  type DeferredPlay
} from './deferred-play';
import { DeferredPlayScheduler, type DeferredPlayGameView } from './deferred-play-scheduler';
import { parseProviderLimitBlocker } from '../player-control/contract';
import { friendlyInstanceNames, projectFriendlyRoster } from '../player-display-labels';
import type { RouteContext } from '../routing-policy';
import type { PlayerRoutingCapability, RoutingDecision, RoutingMode } from '../capability-types';
import { projectInstanceControls, type ProviderControlProfile } from '../provider-control';
import {
  RUNNING_PLAYERS_SAVED,
  isRunningPlayersPreference,
  advancedPlayerDiscoveryVisible,
  isTerminalRetention,
  isTimeFormatPreference,
  isProductTelemetryPreference,
  isAiUsageRefreshMinutes,
  isAiScoreboardPlacement,
  isAiScoreboardPercentMode,
  isAiScoreboardResetMode,
  isAiScoreboardDensity,
  isAiScoreboardResetMarker,
  isAlarmPreferences,
  loadPreferences,
  projectDiscovery,
  savePreferences,
  type CoachPreferences
} from '../running-players';
import { ClaudeUsageReader, watchClaudeActivity, defaultClaudeActivityDir, type ClaudeUsageStatus } from './claude-usage-reader';
import { CodexUsageReader, type CodexUsageStatus, watchCodexActivity, defaultCodexSessionsDir } from './codex-usage-reader';
import {
  CoachRoutineEngine,
  RoutineValidationError,
  fileCoachRoutineStore,
  type RoutineDelivery,
  type RoutineInput,
  type RoutinePatch,
  type RoutineSourceState
} from './coach-routines';
import { GameFilesystemCoordinator, fileGameFilesystemStore } from './game-filesystem-coordinator';
import { HealthAuthority, claudeWindowsNotReflected, codexWindowsNotReflected, fileHealthStateStore, providerFreshness, type HealthAuthoritySnapshot } from './health-authority';
import { UsageFreshnessCoordinator } from './usage-freshness-coordinator';
import { AlarmEngine, type AiAlarmEvent } from './alarm-engine';
import { fileAlarmStateStore } from './alarm-state-store';
import { parsePushSubscription, WEB_PUSH_DIR, WebPushNotifier, type PushTransport } from './web-push';
import { resourcePoolForSeat, RoutingEconomicsReader, type ResourcePoolId, type RoutingEconomicsSnapshot } from './routing-economics';
import {
  RoutingFilmRecorder,
  RoutingFilmStore,
  deriveRoutingFilmBurn,
  projectRoutingFilmConcurrency,
  projectRoutingFilmReceipt,
  summarizeRoutingFilmIsolation,
  type RoutingFilmEvent,
  type RoutingFilmJournal,
  type RoutingFilmReceipt,
  type RoutingFilmTarget,
  type RoutingFilmWorkInterval
} from '../routing-intel/routing-film';
import { buildAttributedFilmIndex, coachAttributionEvent, effectiveAttributions, recordDispatchAttribution, settleResolutions } from '../routing-intel/attribution';
import { buildRoutingIntelligenceView, recommendationNarrative } from '../routing-intel/dev-views';
import { calibrationWeekStart, evaluateCalibration, withCalibration, type CalibrationEvaluation } from '../routing-intel/calibration';
import { R8_ADVISORY_STAGE_GATE, advisoryStageOpen, type AdvisoryStageGate } from '../routing-intel/advisory-stage';
import { isAdvisedChoice, optionToDecision, type AcceptedDecidedBy, type AdvisedChoice } from '../routing-intel/option-to-decision';
import { dadAdvisoryView, type DadAdvisoryView } from '../routing-intel/dad-advisory';
import { FIX_CAUSES } from './follow-up-evidence';
import { buildDispatchEvidence, evidenceKey, type DispatchEvidence } from './follow-up-evidence';
import { computeBelief } from '../routing-intel/belief';
import type { FilmIndex } from '../routing-intel/film-index';
import { emptyPriorPackSource, loadShippedPriorPack, type PriorPackSource } from '../routing-intel/prior-pack';
import {
  recommendRoute,
  recommendationDigest,
  type RecommendationBaseline,
  type RoutingCapabilitySet,
  type RoutingPosture,
  type RoutingRecommendation
} from '../routing-intel/recommend';
import { SCOUT_ROI_CONSTANTS, scoutFilmEvidence, type ScoutIntelRecord } from '../routing-intel/scout-roi';
import { analyzeScoutNeed } from '../play-analyzer';
import {
  sanitizeGameFilesystemEvidence,
  CANONICAL_REPORTS_ROOT_NAME,
  isPlumbingReportsPath,
  type AttentionCode,
  type GameFilesystemContract,
  type PlumbingBootstrapPlan
} from '../game-filesystem-contract';
import { getPlayerAdapter } from '../player-adapters';
import { SCOUT_PLAYER_INSTANCE_ID, SCOUT_PLAYER_TYPE } from '../scout-player-contract';
import {
  ScoutContinuationLedger,
  fileScoutContinuationStore,
  type ContinuationCandidateEvidence,
  type ScoutFormationOutcome
} from './scout-continuation';

export interface ManualRoutingSelection {
  playerInstanceId?: string;
  model?: string;
  effort?: string;
}

/** R8: how long a shown suggestion stays acceptable. */
const ADVISORY_OFFER_TTL_MS = 10 * 60_000;

type RoutingFilmDispatchRecord = DispatchRecord & {
  queueItemId?: string;
  routingMode?: RoutingMode;
  decidedBy?: 'auto-baseline' | 'coach-manual' | 'coach-envelope'
    | 'coach-accepted-primary' | 'coach-accepted-next-best' | 'coach-accepted-scout';
  routeAction?: 'dispatch' | 'handoff';
  /** R5: derived, prompt-free profile/follow-up facts computed by the router at the commit point. */
  evidence?: DispatchEvidence;
  /** R6: in-memory facts for the shadow recommendation, built after the route was fixed. */
  shadow?: ShadowRoutingFacts;
};

export interface DaemonRemoteRelayConfig {
  /** Tunnel endpoint, e.g. `ws://127.0.0.1:<port>/tunnel/v1` for the local reference relay. */
  relayUrl: string;
  /** Trusted domain for expectedOrigin (`https://h-<hostPublicId>.<relayDomain>`). Never a user preference. */
  relayDomain: string;
  /** Beta host-enrollment secret for the relay upgrade. Runtime config only: never a preference, never persisted or logged. */
  enrollmentKey?: string;
  /** Transport tuning seam (tests); production leaves it unset. */
  tuning?: Pick<RelayClientOptions, 'watchdogMs' | 'backoffScheduleMs' | 'random' | 'timers' | 'createSocket' | 'flow'>;
}

/**
 * INTERNAL private-beta bootstrap (never Dad-facing): maps the operator environment onto the typed
 * relay seam. All three variables must be present and valid, otherwise Remote Access has no relay
 * (returns undefined) and `problems` names the offending VARIABLES only, never their values.
 *   SIDELINE_RELAY_URL         -> relayUrl        (ws:// or wss:// tunnel endpoint)
 *   SIDELINE_RELAY_DOMAIN      -> relayDomain     (bare lowercase domain used for expectedOrigin)
 *   SIDELINE_ENROLLMENT_KEY    -> enrollmentKey   (operator secret; runtime only, never persisted)
 */
export function remoteRelayConfigFromEnv(env: NodeJS.ProcessEnv): { config?: DaemonRemoteRelayConfig; problems: string[] } {
  const url = env.SIDELINE_RELAY_URL?.trim();
  const domain = env.SIDELINE_RELAY_DOMAIN?.trim().toLowerCase();
  const key = env.SIDELINE_ENROLLMENT_KEY;
  if (!url && !domain && !key) return { problems: [] };
  const problems: string[] = [];
  let parsed: URL | undefined;
  try {
    parsed = url ? new URL(url) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!parsed || (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') || parsed.username || parsed.password) problems.push('SIDELINE_RELAY_URL');
  if (!domain || !/^(localhost|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+)$/.test(domain)) problems.push('SIDELINE_RELAY_DOMAIN');
  if (!key || key.length < 16) problems.push('SIDELINE_ENROLLMENT_KEY');
  if (problems.length > 0 || !parsed || !domain || !key) return { problems };
  return { config: { relayUrl: parsed.toString(), relayDomain: domain, enrollmentKey: key }, problems };
}

export function resolveRemoteRelayBootstrap(
  env: NodeJS.ProcessEnv,
  sidelineDir: string
): { config?: DaemonRemoteRelayConfig; problems: string[]; source: 'environment' | 'product-defaults' } {
  const explicitEnvironment = ['SIDELINE_RELAY_URL', 'SIDELINE_RELAY_DOMAIN', 'SIDELINE_ENROLLMENT_KEY']
    .some((name) => typeof env[name] === 'string' && env[name]!.trim().length > 0);
  if (explicitEnvironment) {
    const resolved = remoteRelayConfigFromEnv(env);
    return { ...resolved, source: 'environment' };
  }

  const product = productRemoteRelayBootstrap(sidelineDir);
  return {
    config: {
      relayUrl: product.relayUrl,
      relayDomain: product.relayDomain,
      ...(product.enrollmentKey ? { enrollmentKey: product.enrollmentKey } : {})
    },
    problems: product.problems,
    source: 'product-defaults'
  };
}

export interface DaemonOptions {
  /**
   * Where Remote Access connects when `preferences.remoteAccess.enabled` is true. Unset means the
   * daemon never opens a relay connection, whatever the preference says (Stage 3 has no production relay).
   */
  remoteRelay?: DaemonRemoteRelayConfig;
  port?: number;
  dir?: string;
  idleTimeoutMs?: number;
  /** Test seam: what happens when the idle timer ends the daemon (default `process.exit`). */
  exitProcess?: (code: number) => void;
  /** Ordinary machine-to-machine RPC deadline. */
  rpcTimeoutMs?: number;
  /** Bounded deadline for UI RPCs that legitimately wait on a human. */
  humanInteractionRpcTimeoutMs?: number;
  /** Instance nonce; a replacing Stadium names its child so it can recognise it. */
  instanceId?: string;
  /** Build ids this daemon replaced (lineage), newest first. */
  supersedes?: readonly string[];
  /** Why this daemon was started as a replacement, when it was. */
  replacementReason?: string;
  /** Entrypoint whose runtime closure defines this daemon's build identity. */
  daemonScriptPath?: string;
  /** Exit the process after an owner-verified shutdown request (detached daemon only). */
  exitOnShutdown?: boolean;
  /** Extension entrypoint whose closure defines the current Stadium build (default: ../extension.js beside this daemon). */
  extensionEntryPath?: string;
  /**
   * The global Claude OAuth usage reader. Off by default so ordinary daemon tests
   * never touch the network or real credentials. Enabled only in the production
   * entry point (see the `require.main` block), and only one reader ever exists
   * per daemon regardless of how many Games or browser tabs connect.
   */
  claudeUsage?: {
    enabled?: boolean;
    reader?: ClaudeUsageReader;
    /** Claude Code transcript dir to watch for Claude work (event-driven freshness). Unset = no watch. */
    activityDir?: string;
  };
  codexUsage?: {
    enabled?: boolean;
    reader?: CodexUsageReader;
    /** Codex sessions dir whose rollouts signal Codex work (event-driven freshness). Unset = no scan. */
    activityDir?: string;
    /** Rollout scan interval (tests only; default CODEX_ACTIVITY_SCAN_MS). */
    activityScanMs?: number;
  };
  /**
   * S57.2 test seam: the entitlement profile this daemon enforces. Production leaves it unset,
   * which is the built-in DEFAULT_PROFILE (`unlimited`): every capability allowed, no limits.
   */
  entitlements?: {
    profile?: BuiltInProfileId | EntitlementProfile;
    /** C6 test seam: trusted license keys. Production uses the pinned set (empty today). */
    trustedKeys?: TrustedKeys;
    /** C4/C6 test seam: one clock for usage, license validity and Remote metering. */
    now?: () => number;
    /** C4 test seam: checkpoint timers for the Remote minute meter. */
    meterTimers?: RemoteMinuteMeterOptions['timers'];
  };
  /**
   * C7 test seam: telemetry consent. Production reads the canonical preference
   * `productTelemetry` (Q7 closed: OFF by default, opt-in only).
   */
  telemetry?: {
    consent?: () => TelemetryConsent;
  };
  /** R2 test seam. Production uses ~/.sideline/routing-film.jsonl. */
  routingFilm?: {
    journal?: RoutingFilmJournal;
  };
  /**
   * R8 test seam ONLY (like `routingFilm`): production never passes it, so the stage stays on the closed
   * compile-time gate. No preference, HTTP field or Dad control can open it.
   */
  routingAdvisoryStage?: AdvisoryStageGate;
  /** Web Push test seam. Production sends to the browser vendor's push service over HTTPS. */
  webPush?: {
    transport?: PushTransport;
  };
}

/** C8: this build's numeric version for product events (`0.0.0` when unknown). */
function sidelineAppVersion(): string {
  for (const candidate of [path.resolve(__dirname, '..', '..', 'package.json'), path.resolve(__dirname, '..', 'package.json')]) {
    try {
      const version = (JSON.parse(fs.readFileSync(candidate, 'utf8')) as { name?: unknown; version?: unknown });
      if (version.name === 'sideline-coach' && typeof version.version === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version.version)) return version.version;
    } catch { /* try the next location */ }
  }
  return '0.0.0';
}

/** C8: closed-vocabulary Player type for product events; anything else is `other`. */
function telemetryPlayerType(playerType: unknown, instanceId?: string): typeof DIMENSIONS.playerType[number] {
  if (instanceId === SCOUT_PLAYER_INSTANCE_ID || playerType === SCOUT_PLAYER_TYPE) return 'scout';
  return typeof playerType === 'string' && (DIMENSIONS.playerType as readonly string[]).includes(playerType)
    ? playerType as typeof DIMENSIONS.playerType[number]
    : 'other';
}

/** C4: the page a paired phone sees after its Remote allowance and grace are used up. */
function remoteAllowanceExhaustedHtml(message: string): string {
  const safe = message.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    + '<meta name="robots" content="noindex, nofollow"><title>Mobile Remote - Sideline Coach</title>'
    + '<style>html,body{margin:0;min-height:100%;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f4f6f8;color:#14202b}'
    + 'body{display:flex;align-items:center;justify-content:center;padding:16px;min-height:100vh}'
    + 'main{max-width:420px;background:#fff;border:1px solid #d5dde5;border-radius:16px;padding:24px 20px}'
    + 'h1{font-size:1.25rem;margin:0 0 8px}p{margin:0;color:#5b6b7a}'
    + '@media (prefers-color-scheme:dark){html,body{background:#0e141a;color:#e8eef4}main{background:#16202a;border-color:#2a3846}p{color:#9fb0c0}}</style></head>'
    + `<body><main><h1>Mobile Remote paused</h1><p>${safe} Sideline keeps working on your computer, and this phone stays paired.</p></main></body></html>`;
}

function parseSupersedes(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string').slice(0, 20) : [];
  } catch {
    return [];
  }
}

export class ControlPlaneDaemon {
  private httpServer: http.Server | undefined;
  private wsServer: WebSocketServer | undefined;
  private readonly registry: StadiumRegistry;
  private readonly router: ControlPlaneRouter;
  private readonly sseClients = new Map<http.ServerResponse, { principal: Principal; heartbeat: NodeJS.Timeout }>();
  /** Bounded in-memory handoff for startup alarms emitted just before local adapters attach. */
  private readonly pendingStadiumAlarms: AiAlarmEvent[] = [];
  private readonly pendingWebviewAlarms: AiAlarmEvent[] = [];
  /** Live Player Terminal: bounded, exact-Player, already-sanitized activity. In memory only. */
  private readonly playerActivity = new PlayerActivityStore();
  /** Play 3: last valid live evidence per Game, in memory only. */
  private readonly healthEvidenceByGame = new Map<string, HealthEvidenceParams>();
  /** One Sideline-global authority; Games contribute provenance, never ownership. */
  private readonly healthAuthority: HealthAuthority;
  /** Transition/dedupe memory over HealthAuthority facts; never a second telemetry authority. */
  private readonly alarmEngine: AlarmEngine;
  /** R1 read-only projection. Constructed for later stages; never consulted by routing in R1. */
  private readonly routingEconomics: RoutingEconomicsReader;
  /** R2 historical camera. Never consulted by routing and never allowed to fail a Play. */
  private readonly routingFilm: RoutingFilmRecorder;
  /** R6: shipped prior pack (loaded once) and the attributed Film index cache. Derived, never persisted. */
  private priorPackSource: PriorPackSource | undefined;
  /** R8: the stage gate (closed by default) and the in-memory offers a `[USE]` may accept. Nothing here is persisted. */
  private readonly advisoryStage: AdvisoryStageGate;
  private readonly advisoryOffers = new Map<string, {
    rec: RoutingRecommendation; gameId: string; promptHash: string; at: number;
    scoutNeed: { reconnaissancePrimary: boolean; materialEvidenceGap: boolean };
    base: RoutingDecision;
  }>();
  private filmIndexCache: { length: number; minute: number; pack: PriorPackSource; index: FilmIndex } | undefined;
  /** R10: the current weekly calibration evaluation. A derived cache of the Film, never authoritative. */
  private calibrationCache: { weekStart: number; length: number; pack: PriorPackSource; evaluation: CalibrationEvaluation } | undefined;
  private healthSaveTimer: NodeJS.Timeout | undefined;
  /** One global, daemon-owned Claude account usage reader. Off unless explicitly enabled. */
  private readonly claudeUsageReader: ClaudeUsageReader | undefined;
  private claudeUsageStatus: ClaudeUsageStatus = { state: 'idle' };
  private readonly claudeActivityDir: string | undefined;
  private stopClaudeActivityWatch: (() => void) | undefined;
  private readonly codexActivityDir: string | undefined;
  private readonly codexActivityScanMs: number | undefined;
  private stopCodexActivityWatch: (() => void) | undefined;
  /** Global Codex usage reader. Off unless enabled. */
  private readonly codexUsageReader: CodexUsageReader | undefined;
  private codexUsageStatus: CodexUsageStatus = { state: 'idle' };
  /**
   * S57.39: periodic Codex acquisition + stale/reset healing. Only when Codex usage is
   * EXPLICITLY enabled (the production entry point); the legacy implicit enablement via
   * `claudeUsage` stays manual/activity-only so ordinary daemon tests never spawn the CLI.
   */
  private readonly usageFreshness: UsageFreshnessCoordinator | undefined;
  private readonly pendingRpcRequests = new Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
      socket: StadiumSession['socket'];
      method: string;
    }
  >();
  private nextRpcId = 1;
  private idleTimer: NodeJS.Timeout | undefined;
  private disposed = false;
  private boundPort = 0;
  private readonly dir: string;
  private readonly pairingStore = new PairingStore();
  private readonly deviceRegistry: DeviceRegistry;
  /** Device push delivery: an AlarmEngine event consumer with its own subscription store. */
  private readonly webPush: WebPushNotifier;
  private readonly remoteRelay: DaemonRemoteRelayConfig | undefined;
  private relayClient: RelayClient | undefined;
  private relaySync: Promise<void> = Promise.resolve();
  private readonly requestedPort: number;
  private readonly idleTimeoutMs: number;
  private readonly exitProcess: (code: number) => void;
  private readonly rpcTimeoutMs: number;
  private readonly humanInteractionRpcTimeoutMs: number;
  private addGameInProgress = false;
  private authToken = '';
  private readonly localSessions = new Map<string, number>();
  private routingMode: RoutingMode = 'auto';
  /**
   * Coach routing posture (S57.1 §14): the CONSERVE actuator's truth. Human intent only, never the automatic
   * Scarcity fact (ResourcePolicy `isConserveActive` / AlarmEngine). In memory, like `routingMode`: a browser
   * refresh restores it from status; a daemon restart returns to `balanced`.
   */
  private routingPosture: RoutingPosture = 'balanced';
  private manualSelection: ManualRoutingSelection | undefined;
  private readonly policies = createRoutingPolicies();
  private readonly ledger = new InstanceWorkLedger();
  private readonly playQueue: PlayQueue;
  /** R9: durable continue-task intents (separate from the PlayQueue) and their wakeup/revalidation scheduler. */
  private readonly deferredPlays: DeferredPlayBook;
  private readonly deferredScheduler: DeferredPlayScheduler;
  /** S57.2 C1/C6: the single local entitlement authority (signed license, else built-in) and its gate. */
  private readonly entitlements: EntitlementAuthority;
  private readonly featureGate: FeatureGate;
  /** S57.2 C3/C4: local usage accounting (`~/.sideline/entitlement`). */
  private readonly usageStore: UsageStore;
  /** S57.2 C6: file-based signed entitlement (`~/.sideline/entitlement/license.json`). */
  private readonly licenseSource: LicenseFileSource;
  /** S57.2 C4: observes remote SSE/requests; never changes Mobile or relay behavior. */
  private readonly remoteMeter: RemoteMinuteMeter;
  /** R13 S5: memory-only remote static Preview grants and loopback forwarding; never a generic proxy. */
  private readonly remotePreviewGateway: RemotePreviewGateway;
  /** S57.2 C7: bounded product-telemetry outbox, NO-OP transport, consent `off` by default. */
  private readonly telemetryOutbox: TelemetryOutbox;
  /** C8: build version stamped on product events. */
  private readonly appVersion = sidelineAppVersion();
  /** C8: one `gate.refused` per capability+reason per minute (refusal storms are one signal). */
  private readonly refusalSeen = new Map<string, number>();
  /** C8: Scout turns already reported finished (bounded). */
  private readonly scoutTurnsFinished = new Set<string>();
  /** S57.2 C0: durable install identity, established at start(). Never sent anywhere. */
  private installIdentity: InstallIdentity | undefined;
  private readonly scoutContinuations: ScoutContinuationLedger;
  private readonly routines: CoachRoutineEngine;
  /** S6: durable per-Game filesystem contract. Decisions here, filesystem truth in the Stadium. */
  private readonly gameFilesystem: GameFilesystemCoordinator;
  private readonly drainingQueues = new Set<string>();
  private ledgerSaveTimer: NodeJS.Timeout | undefined;
  private routineSaveTimer: NodeJS.Timeout | undefined;
  private readonly routineDispatches = new Map<string, {
    gameId: string;
    playerType?: string;
    queueItemId?: string;
    executionType: 'reasoning' | 'direct-shell';
  }>();
  private readonly pendingExecutionGames = new Set<string>();
  private executionBroadcastScheduled = false;
  private readonly daemonScriptPath: string;
  private readonly buildId: string | undefined;
  private readonly instanceNonce: string;
  private readonly supersedes: string[];
  private readonly replacementReason: string | undefined;
  private readonly exitOnShutdown: boolean;
  private readonly extensionEntryPath: string;
  /** The human's last selected Game, restored when it reconnects after a restart. */
  private preferredSelectedGameId: string | undefined;

  constructor(options: DaemonOptions = {}) {
    this.dir = options.dir ?? process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline');
    this.remoteRelay = options.remoteRelay;
    this.requestedPort = options.port ?? (process.env.SIDELINE_PORT ? parseInt(process.env.SIDELINE_PORT, 10) : 3100);
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60 * 1000;
    this.exitProcess = options.exitProcess ?? ((code) => process.exit(code));
    this.rpcTimeoutMs = options.rpcTimeoutMs ?? 5_000;
    this.humanInteractionRpcTimeoutMs = options.humanInteractionRpcTimeoutMs ?? 15 * 60 * 1000;

    // Freshness Guard identity: what build this daemon IS, which instance, and why it exists.
    this.daemonScriptPath = path.resolve(options.daemonScriptPath ?? path.join(__dirname, 'daemon.js'));
    try { this.buildId = computeControlPlaneBuild(this.daemonScriptPath).buildId; }
    catch { this.buildId = undefined; }
    this.instanceNonce = options.instanceId ?? process.env.SIDELINE_DAEMON_INSTANCE ?? `cpi_${crypto.randomBytes(8).toString('hex')}`;
    this.supersedes = [...(options.supersedes ?? parseSupersedes(process.env.SIDELINE_SUPERSEDES))];
    this.replacementReason = options.replacementReason ?? process.env.SIDELINE_REPLACEMENT_REASON ?? undefined;
    this.exitOnShutdown = options.exitOnShutdown ?? false;
    this.extensionEntryPath = path.resolve(options.extensionEntryPath ?? path.join(path.dirname(this.daemonScriptPath), '..', 'extension.js'));
    this.preferredSelectedGameId = this.loadPreferredSelection();

    this.healthAuthority = new HealthAuthority(
      fileHealthStateStore(path.join(this.dir, 'ai-health-state.json'), (message) => this.log(message)),
      {
        warn: (message) => this.log(message),
        onChange: (snapshot) => {
          this.healthAuthority.flush();
          this.broadcast('ai-health', this.projectAiHealth(snapshot));
          this.alarmEngine?.evaluateTelemetry(snapshot);
          this.usageFreshness?.rearm(snapshot, this.getPreferences().alarms.maxStaleAgeMinutes);
          // R9: fresh resource truth may confirm a reset a continuation is waiting on (check now, not "safe").
          void this.deferredScheduler?.wake({});
        }
      }
    );

    // Exactly one global Claude OAuth usage reader per daemon (never per Game, per
    // Stadium, or per browser tab). Off by default; the production entry point
    // (require.main, below) turns it on unless SIDELINE_CLAUDE_USAGE=0.
    if (options.claudeUsage?.enabled) {
      this.claudeUsageReader = options.claudeUsage.reader ?? new ClaudeUsageReader({
        ingest: (windows) => this.healthAuthority.ingestClaudeUsage(windows),
        initialCadenceMinutes: this.getPreferences().aiUsageRefreshMinutes,
        log: (message) => this.log(message),
        onStatusChange: (status) => { this.claudeUsageStatus = status; }
      });
      this.claudeActivityDir = options.claudeUsage.activityDir;
    }

    if (options.codexUsage?.enabled ?? options.claudeUsage?.enabled) {
      this.codexUsageReader = options.codexUsage?.reader ?? new CodexUsageReader({
        ingest: (rateLimits) => this.healthAuthority.ingest({
          stadiumId: 'control-plane',
          instanceId: 'codex-manual-reader',
          gameId: 'control-plane',
          playerInstanceId: 'codex-manual-reader',
          evidence: {
            provider: 'codex',
            type: 'account_rate_limits',
            rate_limits: rateLimits
          }
        }),
        log: (message) => this.log(message),
        onStatusChange: (status) => { this.codexUsageStatus = status; },
        initialCadenceMinutes: this.getPreferences().aiUsageRefreshMinutes
      });
      this.codexActivityDir = options.codexUsage?.activityDir;
      this.codexActivityScanMs = options.codexUsage?.activityScanMs;
      if (options.codexUsage?.enabled === true) {
        this.usageFreshness = new UsageFreshnessCoordinator({
          reader: this.codexUsageReader,
          log: (message) => this.log(message)
        });
      }
    }

    this.registry = new StadiumRegistry();
    this.router = new ControlPlaneRouter(this.registry);
    // S57.2 C1-C6: one entitlement authority, one gate, one usage store. The license is read at
    // start() (it is bound to the install identity); until then, and whenever it is missing,
    // invalid or expired, the built-in DEFAULT_PROFILE (`unlimited`) applies.
    const entitlementDir = path.join(this.dir, 'entitlement');
    const commercialNow = options.entitlements?.now ?? Date.now;
    const warn = (message: string): void => this.log(message);
    this.usageStore = new UsageStore({ dir: entitlementDir, now: commercialNow, warn });
    this.licenseSource = new LicenseFileSource({
      file: path.join(entitlementDir, LICENSE_FILE),
      clockFile: path.join(entitlementDir, CLOCK_FILE),
      ...(options.entitlements?.trustedKeys ? { keys: options.entitlements.trustedKeys } : {}),
      installId: () => this.installIdentity?.installId,
      warn
    });
    this.entitlements = new EntitlementAuthority({
      profile: options.entitlements?.profile ?? DEFAULT_PROFILE,
      license: this.licenseSource,
      usage: this.usageStore,
      now: commercialNow
    });
    this.featureGate = new FeatureGate(this.entitlements, { usage: this.usageStore, warn });
    this.router.setFeatureGate(this.featureGate, { onRefused: (decision) => this.recordRefusal(decision) });
    // C5 (Q5): the first committed Play to a Game admits it (idempotent once admitted).
    this.router.setGameAdmitter((gameId) => this.admitGame(gameId));
    this.remoteMeter = new RemoteMinuteMeter({
      gate: this.featureGate,
      graceMinutes: () => this.entitlements.graceMinutes('remote.access'),
      dir: entitlementDir,
      now: commercialNow,
      ...(options.entitlements?.meterTimers ? { timers: options.entitlements.meterTimers } : {}),
      onGraceStarted: (episode, decision) => {
        this.notifyRemoteAllowance('grace', decision.dadMessage, episode.graceUntil);
        this.emitProduct({ name: 'remote.allowance_exhausted', surface: 'remote', capability: 'remote.access', entitlement: 'exhausted', allowanceBand: 'none' });
      },
      onSessionEnded: (session) => this.emitProduct({
        name: 'remote.session_ended',
        surface: 'remote',
        capability: 'remote.access',
        durationSec: Math.min(7 * 24 * 3600, Math.round(session.durationMs / 1000)),
        counts: { reconnects: Math.min(10_000, session.reconnects) }
      }),
      onGraceEnded: (decision) => {
        this.notifyRemoteAllowance('exhausted', decision.dadMessage);
        this.closeRemoteStreams();
      },
      warn
    });
    this.remotePreviewGateway = new RemotePreviewGateway({
      origin: () => this.relayClient && this.remoteRelay
        ? { hostPublicId: this.relayClient.hostPublicId, relayDomain: this.remoteRelay.relayDomain }
        : undefined,
      tunnelConnected: () => this.relayClient?.stats.connected === true,
      previewAdvertised: () => this.relayClient?.previewAdvertised === true,
      deviceLive: (deviceId) => this.deviceRegistry.isLive(deviceId),
      admission: () => this.remoteMeter.admission(),
      touch: () => this.remoteMeter.touch(),
      knownGame: (gameId) => Boolean(this.registry.getKnownGame(gameId)),
      session: (gameId) => this.registry.getAuthoritativeSessionForGame(gameId),
      rpc: (session, method, params) => this.sendRpcToStadium(session, method, params)
    });
    // S57.2 C7: analytics is a separate failure domain from entitlement. No sender exists.
    this.telemetryOutbox = new TelemetryOutbox({
      dir: path.join(this.dir, 'telemetry'),
      // Q7 (closed): the canonical consent source is the `productTelemetry` preference, OFF by default.
      consent: options.telemetry?.consent ?? (() => this.getPreferences().productTelemetry),
      transport: NOOP_TRANSPORT,
      warn
    });
    this.alarmEngine = new AlarmEngine(
      fileAlarmStateStore(path.join(this.dir, 'alarm-state.json'), (message) => this.log(message)),
      {
        preferences: () => this.getPreferences().alarms,
        healthSnapshot: () => this.healthAuthority.getSnapshot(),
        onEvent: (event) => this.deliverAlarmEvent(event),
        warn: (message) => this.log(message)
      }
    );
    this.routingEconomics = new RoutingEconomicsReader({
      health: () => this.healthAuthority.getSnapshot(),
      alarmState: () => this.alarmEngine.getState(),
      preferences: () => this.getPreferences().alarms
    });
    this.advisoryStage = options.routingAdvisoryStage ?? R8_ADVISORY_STAGE_GATE;
    this.routingFilm = new RoutingFilmRecorder(
      options.routingFilm?.journal ?? new RoutingFilmStore({ dir: this.dir, warn: (message) => this.log(message) }),
      { warn: (message) => this.log(message) }
    );

    // Q2.10D: context history and queued Plays live beside the manifest, so an
    // automatic freshness replacement inherits them instead of silently losing them.
    this.deviceRegistry = new DeviceRegistry(path.join(this.dir, 'remote', 'devices.json'));
    this.webPush = new WebPushNotifier({
      dir: path.join(this.dir, WEB_PUSH_DIR),
      ...(options.webPush?.transport ? { transport: options.webPush.transport } : {}),
      log: (message) => this.log(message)
    });
    this.playQueue =new PlayQueue(fileQueueStore(path.join(this.dir, 'play-queue.json')));
    this.scoutContinuations = new ScoutContinuationLedger(
      fileScoutContinuationStore(path.join(this.dir, 'scout-continuations.json'))
    );
    this.routines = new CoachRoutineEngine(fileCoachRoutineStore(
      path.join(this.dir, 'coach-routines.json'),
      (message) => this.log(message)
    ));
    // S6: the daemon may not share a Stadium's filesystem, so it only ever asks the
    // exact Game's authoritative Stadium for evidence and decides from that.
    this.gameFilesystem = new GameFilesystemCoordinator(
      fileGameFilesystemStore(path.join(this.dir, 'game-filesystem.json'), (message) => this.log(message)),
      {
        warn: (message) => this.log(message),
        evidenceProvider: async ({ gameId, checkPaths }) => {
          const auth = this.registry.getAuthoritativeSessionForGame(gameId);
          if (auth.status !== 'connected' || !auth.session) return undefined;
          if (!auth.session.features?.includes('game.filesystem.v1')) return undefined;
          const result = (await this.sendRpcToStadium(auth.session, 'game.filesystem.inspect', {
            gameId,
            checkPaths
          })) as GameFilesystemInspectResult;
          if (!result?.success || result.gameId !== gameId) return undefined;
          return sanitizeGameFilesystemEvidence(gameId, result.evidence);
        }
      }
    );
    this.gameFilesystem.onChange = (gameId) => {
      this.broadcastStatus();
      // Persist first, then converge the exact connected Stadium. Failure never
      // rolls back durable truth and reconnect retries the current revision.
      setImmediate(() => void this.applyGameFilesystemContract(this.gameFilesystem.get(gameId)).catch(() => undefined));
    };
    this.routines.onChange = (_gameId, urgency) => {
      if (urgency === 'immediate') this.flushRoutines();
      else this.scheduleRoutineSave();
      this.broadcastStatus();
    };
    try { this.ledger.restore(JSON.parse(fs.readFileSync(path.join(this.dir, 'work-ledger.json'), 'utf8'))); } catch { /* no history yet */ }
    // C8: a genuinely new report (never the first-seen baseline) — no path, name or body.
    this.ledger.onReportArrived = () => this.emitProduct({ name: 'report.delivered', surface: 'desktop' });
    this.ledger.onChange = (gameId) => {
      this.scheduleLedgerSave();
      this.scheduleExecutionBroadcast(gameId);
    };

    // Instance Work Ledger: only what Coach knows moves an instance's activity.
    this.router.on('play-dispatched', (record: RoutingFilmDispatchRecord) => {
      this.ledger.recordDispatch(record);
      this.recordRoutingFilmDecision(record);
      this.recordRoutingFilmFollowUp(record);
      // C8: behavior only — the Player type, never the Play, Game, report or prompt.
      const playerType = telemetryPlayerType(record.playerType, record.playerInstanceId);
      this.emitProduct({ name: 'play.dispatched', surface: 'desktop', dims: { playerType } });
      if (playerType === 'scout') this.emitProduct({ name: 'scout.play_started', surface: 'desktop', capability: 'scout.play' });
      this.routineDispatches.set(record.clientRef, {
        gameId: record.gameId,
        playerType: record.playerType,
        queueItemId: record.queueItemId,
        executionType: record.playerType === 'terminal' || record.transport === 'legacy' ? 'direct-shell' : 'reasoning'
      });
    });
    // AUTO dispatch reads the same per-instance activity the staged route showed.
    // COMMERCIAL GATE: scout.play. A non-entitled Scout is not an AUTO candidate at all
    // (entitlement only: readiness and recommendation stay with their owners).
    this.router.setCandidateEnricher((gameId, candidates) => {
      const scoutEntitled = this.featureGate.check('scout.play').allowed;
      return candidates
        .filter((candidate) => scoutEntitled || (candidate.instanceId !== SCOUT_PLAYER_INSTANCE_ID && candidate.executionType !== 'scout-formation'))
        .map((candidate) => {
          const entry = this.ledger.get(gameId, candidate.instanceId);
          return entry ? { ...candidate, work: { workState: entry.workState } } : candidate;
        });
    });
    this.router.setPlayQueue(this.playQueue);
    this.router.setRouteContextProvider((gameId) => this.routeContextFor(gameId));
    // R9: scheduled continuations. Sending goes through this same router (MANUAL, exact instance,
    // expectedSessionKey); nothing here routes, reranks, substitutes or touches the PlayQueue.
    this.deferredPlays = new DeferredPlayBook(fileDeferredPlayStore(path.join(this.dir, DEFERRED_PLAY_FILE), (message) => this.log(message)));
    this.deferredScheduler = new DeferredPlayScheduler({
      book: this.deferredPlays,
      economics: () => this.currentRoutingEconomics(),
      game: (gameId) => this.deferredGameView(gameId),
      ledger: (gameId, instanceId) => this.ledger.get(gameId, instanceId),
      dispatch: (options) => this.router.dispatch(options),
      onChange: () => this.broadcastStatus(),
      log: (message) => this.log(message)
    });
    // S9.0: PLAYER WRITES HERE == INCOMING WATCHES HERE. Resolved lazily; by
    // the time a Play actually dispatches, this.gameFilesystem is constructed.
    this.router.setReportDestinationResolver((gameId, playerType, sessionFeatures) =>
      this.resolveCanonicalReportDestination(gameId, playerType, sessionFeatures));
    this.router.on('scout-continuation-staged', (record: Parameters<ScoutContinuationLedger['stage']>[0]) => {
      this.scoutContinuations.stage(record);
    });
    this.router.on('scout-continuation-accepted', (event: { originalClientRef: string; turnRef: string }) => {
      this.scoutContinuations.acceptScout(event.originalClientRef, event.turnRef);
    });
    this.router.on('scout-continuation-delivery-failed', (event: { originalClientRef: string; state: 'failed' | 'unknown'; note: string }) => {
      this.scoutContinuations.failScoutDelivery(event.originalClientRef, event.note, event.state);
    });
    this.router.on('play-queued', (event: { gameId: string; playerInstanceId: string; playerType?: string; queueItemId: string }) => {
      this.ledger.recordQueueMutation(event.gameId, event.playerInstanceId);
      this.routines.observePlay({
        gameId: event.gameId,
        kind: 'queued',
        queueItemId: event.queueItemId,
        playerType: event.playerType
      });
      this.broadcastStatus();
      setImmediate(() => void this.drainQueue(event.gameId, event.playerInstanceId));
    });

    // Forward status updates to SSE clients
    this.router.on('status-update', (payload) => {
      if (typeof payload?.clientRef === 'string' && typeof payload?.state === 'string') {
        this.ledger.recordDelivery(payload.clientRef, payload.state, { turnRef: payload.turnRef, error: payload.error, observed: (payload as { observed?: boolean }).observed });
        if (payload.state === 'failed') this.recordRoutingFilmOutcomeByClientRef(payload.clientRef);
        const observed = this.routineDispatches.get(payload.clientRef);
        if (observed && (payload.state === 'received' || payload.state === 'unknown' || payload.state === 'failed')) {
          this.routines.observePlay({
            gameId: observed.gameId,
            kind: payload.state,
            clientRef: payload.clientRef,
            queueRelease: Boolean(observed.queueItemId),
            playerType: observed.playerType,
            executionType: observed.executionType
          });
          this.routineDispatches.delete(payload.clientRef);
        }
      }
      this.broadcast('turn', payload);
      this.broadcast('status', { type: 'turn-update', ...payload });
    });

    this.registry.on('change', (event: { type?: string; gameId?: string; disconnectedGameId?: string }) => {
      if (event.type === 'session-removed') this.ledger.markGameDisconnected(event.disconnectedGameId);
      else if (event.type === 'game-disconnected') this.ledger.markGameDisconnected(event.gameId);
      else if (event.type === 'capabilities-updated' && event.gameId) this.ledger.observeRoster(event.gameId, this.registry.getCapabilitiesForGame(event.gameId), this.rosterInstanceIds(event.gameId));
      else if (event.type === 'reports-updated' && event.gameId) this.ledger.recordReports(event.gameId, this.registry.getReportsForGame(event.gameId));
      // A restarted Control Plane keeps the human's selected Game: the first Stadium to
      // reconnect must not silently become the selection.
      if (event.type === 'selected-game-changed') {
        this.persistPreferredSelection(this.registry.getSelectedGameId());
      } else if ((event.type === 'session-registered' || event.type === 'game-connected')
        && this.preferredSelectedGameId && this.registry.getSelectedGameId() !== this.preferredSelectedGameId
        && this.registry.getAuthoritativeSessionForGame(this.preferredSelectedGameId).status === 'connected') {
        this.registry.setSelectedGameId(this.preferredSelectedGameId);
      }
      // S6: a Game that just connected re-proves its filesystem contract. Read-only.
      if (event.type === 'game-connected' && event.gameId) {
        const gameId = event.gameId;
        setImmediate(() => void (async () => {
          const result = await this.gameFilesystem.reconcile(gameId);
          await this.applyGameFilesystemContract(result.contract);
          // S8.0: only after the contract is current does Sideline ever mutate a Game.
          await this.runFilesystemEnsure(gameId, result.bootstrapPlan, result.inspected);
        })().catch((error) => this.log(`Game filesystem reconcile/apply failed for ${gameId}: ${error instanceof Error ? error.message : String(error)}`)));
      }
      // S8.0: a roster change may mean the current roster now needs a lane that
      // did not exist before. Never touches the root decision itself.
      if (event.type === 'roster-updated' && event.gameId) {
        const gameId = event.gameId;
        setImmediate(() => void this.runFilesystemEnsure(gameId).catch((error) =>
          this.log(`Filesystem lane ensure failed for ${gameId}: ${error instanceof Error ? error.message : String(error)}`)
        ));
      }
      // Q2.10D: an exact instance that became free (or a Game that reconnected) may release its queue.
      if ((event.type === 'capabilities-updated' || event.type === 'game-connected') && event.gameId) {
        const gameId = event.gameId;
        setImmediate(() => { for (const instanceId of this.playQueue.instancesWithWork(gameId)) void this.drainQueue(gameId, instanceId); });
        // R9: the same seam wakes continuations waiting for this Game or one of its Players.
        setImmediate(() => void this.deferredScheduler.wake({ gameId }));
      }
      this.broadcast('status', { type: 'registry-change', ...event });
      this.broadcast('games', { games: this.registry.getGames() });
      this.checkIdleTimeout();
    });
  }

  /** S57.2 C0: read-only install identity for future license/telemetry consumers (undefined before start()). */
  getInstallIdentity(): InstallIdentity | undefined {
    return this.installIdentity;
  }

  /** S57.2 C1: read-only entitlement snapshot (also projected into /api/status). */
  getEntitlementSnapshot(): ReturnType<EntitlementAuthority['snapshot']> {
    return this.entitlements.snapshot();
  }

  get port(): number {
    return this.boundPort;
  }

  get isListening(): boolean {
    return Boolean(this.httpServer?.listening);
  }

  get registryInstance(): StadiumRegistry {
    return this.registry;
  }

  getHealthEvidence(gameId: string): HealthEvidenceParams | undefined {
    const value = this.healthEvidenceByGame.get(gameId);
    return value ? structuredClone(value) : undefined;
  }

  get healthAuthorityInstance(): HealthAuthority {
    return this.healthAuthority;
  }

  /** Test/diagnostic seam: proves exactly one Claude usage reader exists per daemon. */
  get claudeUsageReaderInstance(): ClaudeUsageReader | undefined {
    return this.claudeUsageReader;
  }

  /** Test/diagnostic seam: proves exactly one Codex usage reader exists per daemon. */
  get codexUsageReaderInstance(): CodexUsageReader | undefined {
    return this.codexUsageReader;
  }

  getHealthSnapshot(): HealthAuthoritySnapshot {
    return this.healthAuthority.getSnapshot();
  }

  get alarmEngineInstance(): AlarmEngine {
    return this.alarmEngine;
  }

  get webPushInstance(): WebPushNotifier {
    return this.webPush;
  }

  /** R1 test/diagnostic query seam; current routing has no reference to this reader. */
  get routingEconomicsReaderInstance(): RoutingEconomicsReader {
    return this.routingEconomics;
  }

  get routerInstance(): ControlPlaneRouter {
    return this.router;
  }

  get ledgerInstance(): InstanceWorkLedger {
    return this.ledger;
  }

  get routineEngineInstance(): CoachRoutineEngine {
    return this.routines;
  }

  get gameFilesystemInstance(): GameFilesystemCoordinator {
    return this.gameFilesystem;
  }

  get scoutContinuationLedgerInstance(): ScoutContinuationLedger {
    return this.scoutContinuations;
  }

  executionSnapshot(gameId = this.registry.getSelectedGameId()): { gameId: string; epoch: string; serverNow: number; byInstance: Record<string, ExecutionView> } {
    return this.buildExecution(gameId);
  }

  async start(): Promise<ControlPlaneDiscoveryRecord> {
    if (this.isListening) {
      return this.getDiscoveryRecord();
    }

    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }

    // S57.2 C0: create-once install identity. Independent of Remote; never sent anywhere;
    // a filesystem failure leaves it absent and the daemon starts normally.
    try {
      const result = ensureInstallIdentity(this.dir);
      this.installIdentity = result.identity;
      if (result.status === 'recovered') this.log('Install identity file was malformed; it was set aside and a new identity created.');
    } catch (error) {
      this.log(`Install identity unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    // S57.2 C6: a license binds to the install identity, so it is read only once that exists.
    // Missing, invalid or expired → built-in DEFAULT_PROFILE; never an error.
    this.licenseSource.reload();
    // S57.2 §8.3 (C5): first activation of Game admission grandfathers every Game with recorded
    // Play history, regardless of any ceiling. It runs only while the admission meter has never
    // been used, so a later archive is never undone by a restart. Open windows alone are not seeded.
    try {
      const played = new Set<string>();
      for (const raw of this.ledger.serialize().entries) {
        const entry = raw as { gameId?: unknown; currentPlay?: unknown; recentPlays?: unknown[] };
        if (typeof entry.gameId === 'string' && entry.gameId && (entry.currentPlay || (entry.recentPlays?.length ?? 0) > 0)) played.add(entry.gameId);
      }
      const seeded = this.featureGate.grandfather('games.active', [...played]);
      if (seeded > 0) this.log(`Active Games: ${seeded} Game(s) with Play history were admitted (one-time grandfathering).`);
    } catch (error) {
      this.log(`Active Games grandfathering skipped: ${error instanceof Error ? error.message : String(error)}`);
    }

    this.initAuthToken();

    this.httpServer = http.createServer((req, res) => {
      void this.handleHttpRequest(req, res).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`HTTP request error: ${msg}`);
        if (!res.headersSent) {
          this.sendJson(res, 500, { success: false, message: msg });
        } else if (!res.writableEnded) {
          res.end();
        }
      });
    });

    this.wsServer = new WebSocketServer({ noServer: true });
    this.wsServer.on('connection', (socket: WebSocket, req: http.IncomingMessage) => {
      this.handleWsConnection(socket, req);
    });

    this.httpServer.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.boundPort}`);
      if (url.pathname === '/stadium') {
        const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
        if (this.authToken && !timingSafeSecretEqual(token, this.authToken)) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        this.wsServer?.handleUpgrade(req, socket, head, (ws) => {
          this.wsServer?.emit('connection', ws, req);
        });
      } else {
        socket.destroy();
      }
    });

    // Try binding starting from requestedPort
    let currentPort = this.requestedPort;
    const maxPort = currentPort + 20;

    while (currentPort <= maxPort) {
      try {
        await this.listenOnPort(currentPort);
        this.boundPort = currentPort;
        break;
      } catch (err: unknown) {
        if ((err as { code?: string }).code === 'EADDRINUSE') {
          currentPort++;
        } else {
          throw err;
        }
      }
    }

    if (!this.boundPort) {
      throw new Error(`Could not bind Control Plane daemon to any port between ${this.requestedPort} and ${maxPort}.`);
    }

    const record = this.getDiscoveryRecord();
    this.writeDiscoveryRecord(record);
    this.setupExitHandlers();
    this.checkIdleTimeout();
    this.alarmEngine.start(this.healthAuthority.getSnapshot());
    // R9: settle a continuation that was mid-send at shutdown, then re-arm and check the rest.
    void this.deferredScheduler.start().catch((error) => this.log(`Scheduled continuations could not start: ${error instanceof Error ? error.message : String(error)}`));
    await this.syncRelayClient();
    this.claudeUsageReader?.start();
    if (this.claudeUsageReader && this.claudeActivityDir && !this.stopClaudeActivityWatch) {
      const reader = this.claudeUsageReader;
      this.stopClaudeActivityWatch = watchClaudeActivity(this.claudeActivityDir, () => reader.noteClaudeActivity(), (message) => this.log(message));
    }
    if (this.codexUsageReader && this.codexActivityDir && !this.stopCodexActivityWatch) {
      const reader = this.codexUsageReader;
      this.stopCodexActivityWatch = watchCodexActivity(this.codexActivityDir, () => reader.noteCodexActivity(), { intervalMs: this.codexActivityScanMs, log: (message) => this.log(message) });
    }
    // S57.39: one immediate read, then Dad's cadence; the coordinator arms stale/reset deadlines.
    if (this.usageFreshness) {
      this.codexUsageReader?.start();
      this.usageFreshness.rearm(this.healthAuthority.getSnapshot(), this.getPreferences().alarms.maxStaleAgeMinutes);
    }

    this.log(`Control Plane daemon started on port ${this.boundPort} (PID: ${process.pid})`);
    return record;
  }

  /**
   * Reconciles the daemon-owned RelayClient with `preferences.remoteAccess.enabled`. Calls are
   * serialised, so rapid toggles can never create a second client/socket; a stopped RelayClient is
   * discarded and a fresh one is built on the next enable.
   */
  private syncRelayClient(): Promise<void> {
    this.relaySync = this.relaySync.then(async () => {
      const enabled = !this.disposed && !!this.remoteRelay && this.getPreferences().remoteAccess?.enabled === true;
      // COMMERCIAL GATE: remote.access. Not entitled → the tunnel never opens. An exhausted
      // allowance keeps the tunnel (requests are refused per request, C4) so access resumes by
      // itself at the reset or with a new grant.
      const remoteEntitlement = enabled ? this.featureGate.check('remote.access') : undefined;
      const remoteEntitled = remoteEntitlement?.allowed === true || remoteEntitlement?.reason === 'allowance-exhausted';
      if (remoteEntitlement && !remoteEntitled) {
        this.log(`Remote Access not started: ${remoteEntitlement.dadMessage}`);
        this.recordRefusal(remoteEntitlement);
      }
      const wanted = enabled && remoteEntitled;
      if (wanted && !this.relayClient && this.remoteRelay) {
        const identity = new HostIdentityManager().ensureIdentity(path.join(this.dir, 'remote'));
        const client = new RelayClient({
          relayUrl: this.remoteRelay.relayUrl,
          relayDomain: this.remoteRelay.relayDomain,
          ...(this.remoteRelay.enrollmentKey ? { enrollmentKey: this.remoteRelay.enrollmentKey } : {}),
          identity,
          daemon: this,
          deviceRegistry: this.deviceRegistry,
          ...this.remoteRelay.tuning
        });
        this.relayClient = client;
        await client.start().catch((error) => this.log(`Remote Access could not start: ${error instanceof Error ? error.message : String(error)}`));
      } else if (!wanted && this.relayClient) {
        const client = this.relayClient;
        this.relayClient = undefined;
        // Remote Access off (or daemon stop): every Preview grant dies with the tunnel.
        this.remotePreviewGateway.revokeAll();
        await client.stop();
      }
    }).catch((error) => this.log(`Remote Access sync failed: ${error instanceof Error ? error.message : String(error)}`));
    return this.relaySync;
  }

  async stop(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    // The tunnel goes first so no remote request can reach a half-torn-down daemon.
    await this.syncRelayClient();

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
    if (this.routineSaveTimer) {
      clearTimeout(this.routineSaveTimer);
      this.routineSaveTimer = undefined;
      this.flushRoutines();
    }
    if (this.healthSaveTimer) clearTimeout(this.healthSaveTimer);
    this.healthSaveTimer = undefined;
    this.healthAuthority.flush();
    this.alarmEngine.stop();
    this.deferredScheduler.stop();
    // C4 final checkpoint (open streams are about to end); C7 outbox writes settle best-effort.
    this.remoteMeter.stop();
    await Promise.race([this.telemetryOutbox.whenIdle(), new Promise((resolve) => setTimeout(resolve, 2_000).unref())]);
    this.claudeUsageReader?.stop();
    this.stopClaudeActivityWatch?.();
    this.stopClaudeActivityWatch = undefined;
    this.stopCodexActivityWatch?.();
    this.stopCodexActivityWatch = undefined;
    this.usageFreshness?.stop();
    this.codexUsageReader?.stop();

    for (const [client, state] of this.sseClients) {
      clearInterval(state.heartbeat);
      try {
        client.end();
      } catch {}
    }
    this.sseClients.clear();

    this.rejectPendingRpcRequests(() => true, 'Control Plane stopped before the Stadium replied.');

    for (const session of this.registry.getAllSessions()) {
      try {
        session.socket.close();
      } catch {}
    }

    if (this.wsServer) {
      await new Promise<void>((resolve) => {
        this.wsServer?.close(() => resolve());
      });
      this.wsServer = undefined;
    }

    if (this.httpServer && this.httpServer.listening) {
      const server = this.httpServer;
      const closed = new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      // Idle keep-alive and streaming (SSE) connections would otherwise keep close() pending.
      server.closeAllConnections?.();
      await closed;
      this.httpServer = undefined;
    }

    if (this.cleanExitHandler) {
      process.off('SIGINT', this.cleanExitHandler);
      process.off('SIGTERM', this.cleanExitHandler);
      this.cleanExitHandler = undefined;
    }

    this.removeDiscoveryRecord();
    this.log('Control Plane daemon stopped.');
  }

  private listenOnPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = this.httpServer!;
      const onError = (err: Error): void => {
        server.off('listening', onListening);
        reject(err);
      };
      const onListening = (): void => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    });
  }

  private initAuthToken(): void {
    const tokenPath = path.join(this.dir, 'token');
    try {
      if (fs.existsSync(tokenPath)) {
        const existing = fs.readFileSync(tokenPath, 'utf8').trim();
        if (existing) {
          this.authToken = existing;
          return;
        }
      }
    } catch {}

    this.authToken = `sideline_sec_${crypto.randomBytes(24).toString('hex')}`;
    try {
      fs.writeFileSync(tokenPath, this.authToken, { encoding: 'utf8', mode: 0o600 });
    } catch {}
  }

  private getDiscoveryRecord(): ControlPlaneDiscoveryRecord {
    return {
      protocolVersion: CONTROL_PLANE_PROTOCOL_VERSION,
      port: this.boundPort,
      pid: process.pid,
      startedAt: Date.now(),
      controlPlaneUrl: `http://127.0.0.1:${this.boundPort}`,
      service: CONTROL_PLANE_SERVICE,
      instanceId: this.instanceNonce,
      buildId: this.buildId,
      daemonScriptPath: this.daemonScriptPath,
      supersedes: this.supersedes
    };
  }

  /** Self-description for the Freshness Guard handshake. Structural only; no secrets. */
  private identity(): Record<string, unknown> {
    return {
      service: CONTROL_PLANE_SERVICE,
      pid: process.pid,
      instanceId: this.instanceNonce,
      buildId: this.buildId ?? null,
      daemonScriptPath: this.daemonScriptPath,
      supersedes: this.supersedes,
      replacementReason: this.replacementReason ?? null
    };
  }

  private writeDiscoveryRecord(record: ControlPlaneDiscoveryRecord): void {
    const discoveryPath = path.join(this.dir, 'control-plane.json');
    // Atomic: a Stadium must never read a half-written manifest.
    const temp = `${discoveryPath}.${this.instanceNonce}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(record, null, 2), 'utf8');
    fs.renameSync(temp, discoveryPath);
  }

  private removeDiscoveryRecord(): void {
    try {
      const discoveryPath = path.join(this.dir, 'control-plane.json');
      if (fs.existsSync(discoveryPath)) {
        const content = fs.readFileSync(discoveryPath, 'utf8');
        const parsed = JSON.parse(content) as { pid?: number; instanceId?: string };
        // Only ever remove our OWN manifest — a replacement may already have written its own.
        if (parsed.pid === process.pid && (!parsed.instanceId || parsed.instanceId === this.instanceNonce)) {
          fs.unlinkSync(discoveryPath);
        }
      }
    } catch {}
  }

  private loadPreferredSelection(): string | undefined {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(this.dir, 'control-plane-state.json'), 'utf8')) as { selectedGameId?: unknown };
      return typeof parsed.selectedGameId === 'string' && parsed.selectedGameId ? parsed.selectedGameId : undefined;
    } catch {
      return undefined;
    }
  }

  private persistPreferredSelection(gameId: string): void {
    if (!gameId) return;
    this.preferredSelectedGameId = gameId;
    try {
      if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
      const file = path.join(this.dir, 'control-plane-state.json');
      const temp = `${file}.${this.instanceNonce}.tmp`;
      fs.writeFileSync(temp, JSON.stringify({ selectedGameId: gameId }, null, 2), 'utf8');
      fs.renameSync(temp, file);
    } catch {}
  }

  private cleanExitHandler: (() => void) | undefined;

  private setupExitHandlers(): void {
    if (this.cleanExitHandler) return;
    this.cleanExitHandler = (): void => {
      this.flushRoutines();
      if (this.healthSaveTimer) clearTimeout(this.healthSaveTimer);
      this.healthSaveTimer = undefined;
      this.healthAuthority.flush();
      this.claudeUsageReader?.stop();
      this.stopClaudeActivityWatch?.();
      this.stopClaudeActivityWatch = undefined;
      this.stopCodexActivityWatch?.();
      this.stopCodexActivityWatch = undefined;
      this.usageFreshness?.stop();
      this.codexUsageReader?.stop();
      this.removeDiscoveryRecord();
      process.exit(0);
    };
    process.once('SIGINT', this.cleanExitHandler);
    process.once('SIGTERM', this.cleanExitHandler);
  }

  /**
   * Remote Access liveness lease: while the local human has Remote Access ENABLED the daemon must stay
   * available for a remote return, regardless of Stadium/VS Code presence, remote traffic or relay state.
   */
  private remoteAccessHoldsDaemon(): boolean {
    return this.getPreferences().remoteAccess?.enabled === true;
  }

  /** Dad-facing relay state only. Never projects infrastructure or credentials. */
  private remoteAccessProductState(): 'off' | 'connecting' | 'online' | 'reconnecting' | 'unavailable' {
    if (!this.remoteAccessHoldsDaemon()) return 'off';
    if (!this.remoteRelay) return 'unavailable';
    if (!this.relayClient) return 'connecting';
    const relay = this.relayClient.stats;
    if (relay.healthy) return 'online';
    if (relay.connected) return 'connecting';
    if (relay.reconnectPending || relay.attempt > 0) return 'reconnecting';
    return 'connecting';
  }

  private checkIdleTimeout(): void {
    const activeSessions = this.registry.getAllSessions().filter((s) => s.socket.readyState === WebSocket.OPEN);
    const held = this.remoteAccessHoldsDaemon();
    if (activeSessions.length === 0 && !held) {
      if (!this.idleTimer && this.idleTimeoutMs > 0) {
        this.log(`All Stadium sessions disconnected. Starting ${this.idleTimeoutMs}ms idle shutdown timer.`);
        this.idleTimer = setTimeout(() => {
          this.idleTimer = undefined;
          // A stale timer must never end a daemon that has since been given a liveness owner.
          if (this.disposed || this.remoteAccessHoldsDaemon()
            || this.registry.getAllSessions().some((s) => s.socket.readyState === WebSocket.OPEN)) return;
          this.log('Idle timeout expired with 0 active Stadium clients. Exiting daemon cleanly.');
          void this.stop().then(() => this.exitProcess(0));
        }, this.idleTimeoutMs);
        this.idleTimer.unref();
      }
    } else {
      if (this.idleTimer) {
        this.log(held && activeSessions.length === 0 ? 'Remote Access enabled. Idle shutdown timer cancelled.' : 'Stadium session connected. Idle shutdown timer cancelled.');
        clearTimeout(this.idleTimer);
        this.idleTimer = undefined;
      }
    }
  }

  private log(message: string): void {
    const line = `[${new Date().toISOString()}] [ControlPlane:${process.pid}] ${message}\n`;
    try {
      const logDir = path.join(this.dir, 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.appendFileSync(path.join(logDir, 'control-plane.log'), line, 'utf8');
    } catch {}
  }

  // --- WebSocket Connection & Handshake ---

  private handleWsConnection(socket: WebSocket, req: http.IncomingMessage): void {
    let sessionInstanceId = '';

    socket.on('message', (raw: string | Buffer) => {
      try {
        const text = raw.toString('utf8');
        const message = JSON.parse(text) as unknown;

        if (isJsonRpcRequest(message)) {
          this.handleWsRequest(socket, message, sessionInstanceId, (newId) => {
            sessionInstanceId = newId;
          });
        } else if (isJsonRpcNotification(message)) {
          this.handleWsNotification(socket, message, sessionInstanceId);
        } else if (isJsonRpcResponse(message) || isJsonRpcError(message)) {
          const pending = this.pendingRpcRequests.get(message.id as string | number);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRpcRequests.delete(message.id as string | number);
            if (isJsonRpcResponse(message)) {
              pending.resolve(message.result);
            } else {
              pending.reject(new Error(message.error.message));
            }
          }
        }
      } catch (err) {
        this.log(`WS frame parsing error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    socket.on('close', () => {
      this.rejectPendingRpcRequests(
        (pending) => pending.socket === socket,
        'Stadium disconnected before the request completed.'
      );
      if (sessionInstanceId) {
        this.log(`Stadium session disconnected: ${sessionInstanceId}`);
        this.registry.removeSession(sessionInstanceId);
      }
      this.checkIdleTimeout();
    });

    socket.on('error', (err) => {
      this.log(`WS socket error (${sessionInstanceId}): ${err.message}`);
    });
  }

  private handleWsRequest(
    socket: WebSocket,
    req: { id: string | number; method: string; params: unknown },
    currentInstanceId: string,
    setInstanceId: (id: string) => void
  ): void {
    if (req.method === 'stadium.hello') {
      const params = req.params as StadiumHelloParams;
      if (this.authToken && !timingSafeSecretEqual(params.token, this.authToken)) {
        socket.send(JSON.stringify(buildRpcError(req.id, 401, 'Unauthorized: Invalid token.')));
        socket.close();
        return;
      }

      setInstanceId(params.instanceId);

      const session: StadiumSession = {
        instanceId: params.instanceId,
        stadiumId: params.stadiumId,
        name: params.name,
        platform: params.platform,
        socket,
        lastHeartbeat: Date.now(),
        game: params.game,
        rootFsPath: params.rootFsPath,
        roster: [],
        capabilities: [],
        reports: [],
        rosterSynchronized: false,
        rosterSyncedAt: 0,
        controlPlaneBuildId: typeof params.controlPlaneBuildId === 'string' ? params.controlPlaneBuildId : undefined,
        controlPlaneFreshness: params.controlPlaneFreshness,
        extensionBuildId: typeof params.extensionBuildId === 'string' ? params.extensionBuildId : undefined,
        features: Array.isArray(params.features)
          ? params.features.filter((feature): feature is string => typeof feature === 'string').slice(0, 50)
          : []
      };

      this.registry.registerSession(session);
      this.log(`Registered Stadium session: ${params.instanceId} (${params.name} on ${params.platform})`);

      socket.send(
        JSON.stringify(
          buildRpcResponse(req.id, {
            protocolVersion: CONTROL_PLANE_PROTOCOL_VERSION,
            controlPlaneId: `cp_${process.pid}_${this.boundPort}`,
            heartbeatIntervalMs: 10000
          })
        )
      );
      for (const event of this.pendingStadiumAlarms.splice(0)) {
        try { socket.send(JSON.stringify(buildRpcNotification('ai.alarm', event))); } catch { break; }
      }
      this.checkIdleTimeout();
      return;
    }

    socket.send(JSON.stringify(buildRpcError(req.id, -32601, `Method '${req.method}' not found.`)));
  }

  private handleWsNotification(
    socket: WebSocket,
    notif: { method: string; params: unknown },
    sessionInstanceId: string
  ): void {
    const params = notif.params as Record<string, unknown>;

    switch (notif.method) {
      case 'stadium.heartbeat': {
        const p = params as unknown as StadiumHeartbeatParams;
        this.registry.updateHeartbeat(p.instanceId, p.timestamp);
        break;
      }
      case 'game.connected': {
        const p = params as unknown as GameConnectedParams;
        this.registry.setGame(p.instanceId, p.game, p.rootFsPath);
        this.log(`Stadium session ${p.instanceId} bound to Game: ${p.game.displayName} (${p.game.gameId})`);
        break;
      }
      case 'game.disconnected': {
        const p = params as unknown as GameDisconnectedParams;
        this.registry.removeGame(p.instanceId, p.gameId);
        break;
      }
      case 'roster.snapshot':
      case 'roster.changed': {
        const p = params as unknown as RosterSnapshotParams;
        this.registry.updateRoster(p.instanceId, p.roster);
        break;
      }
      case 'capability.snapshot':
      case 'capability.changed': {
        const p = params as unknown as CapabilitySnapshotParams;
        this.registry.updateCapabilities(p.instanceId, p.capabilities);
        break;
      }
      case 'player.discovery.snapshot':
      case 'player.discovery.changed': {
        const p = params as unknown as PlayerDiscoverySnapshotParams;
        const session = this.registry.getSession(sessionInstanceId);
        if (!session || p.instanceId !== sessionInstanceId || session.game?.gameId !== p.gameId) break;
        this.discoveryByGame.set(p.gameId, p.discovery);
        this.broadcastStatus();
        break;
      }
      case 'report.snapshot':
      case 'report.changed': {
        const p = params as unknown as ReportSnapshotParams;
        this.registry.updateReports(p.instanceId, p.reports);
        break;
      }
      case 'turn.changed': {
        const p = params as unknown as TurnChangedParams;
        const session = this.registry.getSession(sessionInstanceId);
        const gameId = session?.game?.gameId ?? p.gameId;
        if (gameId) {
          const turn = (p.turn ?? {}) as TurnRecord;
          this.ledger.recordTurn(gameId, turn);
          if (turn.instanceId && ['completed', 'partial', 'blocked', 'failed', 'interrupted', 'unknown'].includes(String(turn.state))) {
            this.recordRoutingFilmOutcome(gameId, turn.instanceId, turn.turnRef);
          }
          this.observeScoutTurn(turn);
          if (turn.instanceId && ['completed', 'partial', 'blocked', 'failed', 'interrupted', 'unknown'].includes(String(turn.state))) {
            const instanceId = turn.instanceId;
            setImmediate(() => void this.drainQueue(gameId, instanceId));
            // R9: this exact Player just became free — a continuation waiting for it may send now.
            setImmediate(() => void this.deferredScheduler.wake({ gameId, playerInstanceId: instanceId }));
            if (instanceId === SCOUT_PLAYER_INSTANCE_ID) {
              setImmediate(() => void this.continueAfterScout(gameId, p.turn));
            } else if (typeof turn.turnRef === 'string') {
              this.scoutContinuations.recordContinuationOutcome(gameId, turn.turnRef, String(turn.state), turn.summary);
            }
          }
        }
        this.broadcast('turn', p.turn);
        break;
      }
      case 'player.activity': {
        // Live Player Terminal. Nothing is stored or broadcast unless BOTH Dev Mode and
        // View Player Terminal are on, so the feature costs nothing (and exposes nothing) when off.
        const p = params as unknown as PlayerActivityParams;
        if (!this.livePlayerTerminalEnabled()) break;
        const session = this.registry.getSession(sessionInstanceId);
        const gameId = session?.game?.gameId ?? p.gameId;
        const a = (p.activity ?? {}) as { instanceId?: unknown; sessionKey?: unknown; at?: unknown; category?: unknown; text?: unknown; streaming?: unknown };
        if (!gameId || typeof a.instanceId !== 'string' || !a.instanceId || typeof a.text !== 'string') break;
        if (!ACTIVITY_CATEGORIES.includes(a.category as ActivityCategory)) break;
        const sessionKey = typeof a.sessionKey === 'string' && /^[0-9a-f]{8}$/.test(a.sessionKey) ? a.sessionKey : undefined;
        // record() re-sanitizes: the browser boundary never trusts the sender's redaction.
        const entry = this.playerActivity.record(`${gameId}|${a.instanceId}`, {
          sessionKey,
          at: typeof a.at === 'number' ? a.at : Date.now(),
          category: a.category as ActivityCategory,
          text: a.text,
          streaming: a.streaming === true
        });
        if (entry) this.broadcast('activity', { gameId, instanceId: a.instanceId, epoch: this.ledger.epoch, sessionKey, entry });
        break;
      }
      case 'health.evidence': {
        const p = params as unknown as HealthEvidenceParams;
        const session = this.registry.getSession(sessionInstanceId);
        if (!session || p.instanceId !== sessionInstanceId || p.stadiumId !== session.stadiumId) break;
        if (!session.features?.includes('health.evidence.v1') || session.game?.gameId !== p.gameId) break;
        if (typeof p.playerInstanceId !== 'string' || !p.playerInstanceId || !isHealthEvidence(p.evidence)) break;
        this.healthEvidenceByGame.set(p.gameId, structuredClone(p));
        this.healthAuthority.ingest(p);
        break;
      }
      case 'dispatch.accepted': {
        const p = params as unknown as DispatchAcceptedParams;
        this.router.handleDispatchAccepted(p);
        break;
      }
      case 'dispatch.rejected': {
        const p = params as unknown as DispatchRejectedParams;
        this.router.handleDispatchRejected(p);
        break;
      }
      default:
        this.log(`Unknown WS notification method: ${notif.method}`);
        break;
    }
  }

  // --- HTTP Request Routing ---

  /**
   * The only entry for remote traffic. Stage 3 transport reaches the router through this typed
   * seam, so a caller can inject nothing but a verified `remote-device` principal.
   */
  public async dispatchRemoteRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    principal: Extract<Principal, { kind: 'remote-device' }>
  ): Promise<void> {
    // COMMERCIAL GATE: remote.access for every non-public remote path. Public bootstrap
    // (pair page, pairing exchange, health, app shell) keeps its existing behavior.
    const method = (req.method ?? 'GET').toUpperCase();
    let pathname = '/';
    try { pathname = new URL(req.url ?? '/', 'http://remote.invalid').pathname; } catch { /* the router answers bad paths */ }
    const paired = principal.deviceId !== 'unpaired';
    if (classifyDaemonRoute(method, pathname) !== 'public') {
      // C4: grace keeps requests flowing; after grace an exhausted allowance is refused here.
      const admission = this.remoteMeter.admission();
      if (admission.state === 'not-entitled') {
        this.recordRefusal(admission.decision, 'remote');
        this.sendJson(res, 403, { success: false, code: 'capability-unavailable', capability: 'remote.access', message: admission.decision.dadMessage });
        return;
      }
      if (admission.state === 'exhausted') {
        this.recordRefusal(admission.decision, 'remote');
        this.sendJson(res, 403, { success: false, code: 'remote-allowance-exhausted', capability: 'remote.access', message: admission.decision.dadMessage });
        return;
      }
      // S57.2 §7: an authenticated remote request marks this minute as a Remote Minute.
      if (paired) this.remoteMeter.touch();
    } else if (paired && method === 'GET' && (pathname === '/' || pathname === '/index.html')
      && String(req.headers.accept ?? '').toLowerCase().includes('text/html')
      && this.remoteMeter.admission().state === 'exhausted') {
      // The app shell would only fail every call: a paired phone gets one plain page instead.
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(remoteAllowanceExhaustedHtml(this.remoteMeter.admission().decision.dadMessage ?? 'Mobile Remote: allowance used up.'));
      return;
    }
    return this.handleHttpRequest(req, res, principal);
  }

  /**
   * R13 S5: the only entry for the relay's `p-` Preview surface. It never reaches the daemon router
   * and carries no device principal: the gateway authorizes each request with its own grant.
   */
  public dispatchRemotePreview(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    ctx: { previewTag: string; cookie?: string }
  ): Promise<void> {
    return this.remotePreviewGateway.handle(req, res, ctx);
  }

  /**
   * C8: the single product-event emitter. Consent OFF (the default) returns before anything is
   * built, so nothing is written. Only closed-schema events that pass the C7 validator reach
   * the outbox; this never throws into the feature that called it.
   */
  private emitProduct(input: ProductEventInput): void {
    try {
      if (this.telemetryOutbox.consent() !== 'on') return;
      const installId = this.installIdentity?.installId;
      if (!installId) return;
      const built = buildProductEvent(input, { installId, appVersion: this.appVersion, platform: process.platform });
      if (built.ok) this.telemetryOutbox.emit(built.event);
    } catch {
      // Telemetry never influences the product.
    }
  }

  /** C8: an actual refusal at a choke point → `gate.refused` (capability + closed reason only). */
  private recordRefusal(decision: GateDecision, surface: 'desktop' | 'remote' = 'desktop'): void {
    if (decision.allowed) return;
    const reason = decision.reason;
    if (reason !== 'not-entitled' && reason !== 'allowance-exhausted' && reason !== 'ceiling-reached') return;
    const key = `${decision.capability}:${reason}:${surface}`;
    const now = Date.now();
    const last = this.refusalSeen.get(key);
    if (last !== undefined && now - last < 60_000) return;
    this.refusalSeen.set(key, now);
    this.emitProduct({ name: 'gate.refused', surface, capability: decision.capability, dims: { reason } });
  }

  /**
   * C5 (Q5): admit a Game to an active slot — on explicit Add Game or its first committed Play.
   * Idempotent; an admitted Game is never refused. Refusal is capability-named and recorded.
   */
  private admitGame(gameId: string): GateDecision {
    const wasAdmitted = this.featureGate.hasMember('games.active', gameId);
    const decision = this.featureGate.charge('games.active', gameId);
    if (!decision.allowed) {
      this.recordRefusal(decision);
      return decision;
    }
    if (!wasAdmitted && this.featureGate.hasMember('games.active', gameId)) {
      this.emitProduct({ name: 'game.admitted', surface: 'desktop', capability: 'games.active', counts: { games: this.activeGameCount() } });
    }
    return decision;
  }

  /** C8: a Scout turn reached a terminal state → `scout.play_finished` once per turn, coarse outcome. */
  private observeScoutTurn(turn: TurnRecord): void {
    if (turn.instanceId !== SCOUT_PLAYER_INSTANCE_ID) return;
    const outcome = turn.state === 'completed' || turn.state === 'partial' ? 'ok'
      : turn.state === 'failed' || turn.state === 'blocked' ? 'failed'
        : turn.state === 'interrupted' ? 'cancelled'
          : turn.state === 'unknown' ? 'unknown' : undefined;
    if (!outcome) return;
    const key = turn.turnRef ?? `${turn.at ?? ''}:${turn.state}`;
    if (this.scoutTurnsFinished.has(key)) return;
    this.scoutTurnsFinished.add(key);
    if (this.scoutTurnsFinished.size > 500) this.scoutTurnsFinished.delete(this.scoutTurnsFinished.values().next().value as string);
    this.emitProduct({ name: 'scout.play_finished', surface: 'desktop', capability: 'scout.play', outcome });
  }

  private activeGameCount(): number {
    return Math.min(10_000, Object.keys(this.usageStore.state.members['games.active'] ?? {}).length);
  }

  /** C4: one concise notice to connected phones (a new SSE event; existing clients ignore it safely). */
  private notifyRemoteAllowance(state: 'grace' | 'exhausted', message: string | undefined, graceUntil?: number): void {
    const payload = JSON.stringify({ state, message: message ?? 'Mobile Remote: allowance used up.', ...(graceUntil !== undefined ? { graceUntil } : {}) });
    for (const [client, clientState] of this.sseClients) {
      if (clientState.principal.kind !== 'remote-device') continue;
      try { client.write(`event: remote-allowance\ndata: ${payload}\n\n`); } catch { this.removeSseClient(client); }
    }
    this.log(`Mobile Remote allowance ${state === 'grace' ? 'reached zero; grace started' : 'grace ended; remote streams closed'}.`);
  }

  /** C4: after grace, remote SSE streams end. Local streams, Plays and paired devices are untouched. */
  private closeRemoteStreams(): void {
    for (const [client, clientState] of [...this.sseClients]) {
      if (clientState.principal.kind !== 'remote-device') continue;
      this.removeSseClient(client);
      try { client.end(); } catch { /* already gone */ }
    }
  }

  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse, injectedPrincipal?: Principal): Promise<void> {
    const method = req.method ?? 'GET';
    const requestUrl = new URL(req.url ?? '/', `http://127.0.0.1:${this.boundPort}`);

    // Browser credentials never arrive in a URL. Remote dispatch will also inject
    // its principal in-process, so neither Bearer nor query data can forge it.
    if (requestUrl.searchParams.has('token')) {
      this.sendJson(res, 401, { success: false, message: 'URL token authentication is not supported.' });
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/session') {
      if (injectedPrincipal?.kind === 'remote-device') {
        this.sendJson(res, 403, { success: false, message: 'This action is available only on the local Sideline.' });
        return;
      }
      const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (!this.authToken || !timingSafeSecretEqual(bearer, this.authToken)) {
        this.sendJson(res, 401, { success: false, message: 'Unauthorized' });
        return;
      }
      const sessionToken = crypto.randomBytes(32).toString('base64url');
      this.localSessions.set(this.hashSessionToken(sessionToken), Date.now() + 30 * 24 * 60 * 60 * 1000);
      res.setHeader('Set-Cookie', `sl_local=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
      this.sendJson(res, 200, { success: true });
      return;
    }

    // Secret-gated bootstrap: the future phone has no device credential yet, so this is `public`
    // but only a live, unburned pairing secret/code mints a device.
    if (method === 'POST' && requestUrl.pathname === '/api/pairing/exchange') {
      const body = (await this.readJsonBody(req)) as { secret?: unknown; code?: unknown; label?: unknown };
      const result = this.pairingStore.exchange({ secret: body?.secret, code: body?.code });
      if (!result.ok) {
        this.sendJson(res, 401, { success: false, message: 'Pairing could not be verified.' });
        return;
      }
      const label = sanitizeDeviceLabel(body?.label);
      const { deviceId, rawToken } = this.deviceRegistry.createDevice(label);
      res.setHeader('Set-Cookie', `__Host-sl_dev=${rawToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
      this.sendJson(res, 200, { success: true, deviceId });
      // Device persistence is synchronous. Only after it succeeds do local desktop listeners
      // receive the correlation signal; raw credentials never enter the event stream.
      this.broadcast('pairing-complete', { pairingId: result.pairingId, deviceId, label }, true);
      this.emitProduct({ name: 'remote.paired', surface: 'remote', capability: 'remote.access', counts: { devices: Math.min(10_000, this.deviceRegistry.list().length) } });
      return;
    }

    // Health check requires no token
    if (method === 'GET' && requestUrl.pathname === '/api/health') {
      this.sendJson(res, 200, {
        status: 'ok',
        pid: process.pid,
        uptime: process.uptime(),
        protocolVersion: CONTROL_PLANE_PROTOCOL_VERSION,
        ...this.identity()
      });
      return;
    }

    // Freshness Guard: an authenticated replacement asks THIS exact instance to step down.
    if (method === 'POST' && requestUrl.pathname === '/api/control-plane/shutdown') {
      const principal = injectedPrincipal ?? this.resolvePrincipal(req);
      if (!principal || principal.kind !== 'local-admin') {
        this.sendJson(res, 401, { success: false, message: 'Unauthorized' });
        return;
      }
      const body = (await this.readJsonBody(req)) as { instanceId?: unknown; reason?: unknown };
      if (body.instanceId !== this.instanceNonce) {
        this.sendJson(res, 409, { success: false, message: 'That shutdown request names a different Control Plane instance.' });
        return;
      }
      this.log(`Owner-verified shutdown requested (${typeof body.reason === 'string' ? body.reason : 'no reason'}).`);
      this.sendJson(res, 200, { success: true, instanceId: this.instanceNonce });
      setImmediate(() => {
        if (this.exitOnShutdown) {
          // A superseded daemon must actually leave: lingering keep-alive or SSE
          // sockets can hold a graceful close open indefinitely (seen live in P0.1).
          setTimeout(() => process.exit(0), 3_000).unref();
        }
        void this.stop().then(() => { if (this.exitOnShutdown) process.exit(0); });
      });
      return;
    }

    // UI serving
    if (method === 'GET' && (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html')) {
      await this.serveIndex(res);
      return;
    }
    // Public, static pairing bootstrap page (never authenticates anything; exchange stays secret-gated).
    if (method === 'GET' && (requestUrl.pathname === '/pair' || requestUrl.pathname === '/pair.html')) {
      this.servePairPage(res);
      return;
    }
    // Static service worker: displays pushed notifications while no Sideline page is open.
    if (method === 'GET' && requestUrl.pathname === '/sw.js') {
      this.serveServiceWorker(res);
      return;
    }

    if (!requestUrl.pathname.startsWith('/api/')) {
      this.sendJson(res, 404, { success: false, message: 'Not found' });
      return;
    }

    const access = classifyDaemonRoute(method, requestUrl.pathname);
    if (!access) {
      const knownPath = isKnownDaemonRoutePath(requestUrl.pathname);
      this.sendJson(res, knownPath ? 405 : 404, {
        success: false,
        message: knownPath ? 'Method not allowed.' : `Unknown endpoint: ${requestUrl.pathname}`
      });
      return;
    }
    const principal = injectedPrincipal ?? this.resolvePrincipal(req);
    if (!principal) {
      this.sendJson(res, 401, { success: false, message: 'Unauthorized' });
      return;
    }
    if (!principalMayAccess(principal, access)) {
      this.sendJson(res, 403, { success: false, message: 'This action is available only on the local Sideline.' });
      return;
    }
    if ((principal.authenticatedBy === 'cookie' || principal.kind === 'remote-device') && method !== 'GET' && method !== 'HEAD') {
      const originMatches = principal.kind === 'remote-device'
        ? requestOriginMatchesExpected(req.headers.origin, principal.expectedOrigin)
        : requestOriginMatchesHost(req.headers.origin, req.headers.host);
      if (req.headers['x-sideline-action'] !== '1' || !originMatches) {
        this.sendJson(res, 403, { success: false, message: 'Request origin could not be verified.' });
        return;
      }
    }

    // Pairing + device management (local-only by route policy; remote principals are refused above).
    if (method === 'POST' && requestUrl.pathname === '/api/pairing/create') {
      // COMMERCIAL GATE: remote.access. Say so on the desktop before anyone scans a QR.
      const remoteEntitlement = this.featureGate.check('remote.access');
      if (!remoteEntitlement.allowed) {
        this.recordRefusal(remoteEntitlement);
        this.sendJson(res, 403, { success: false, code: 'capability-unavailable', capability: 'remote.access', message: remoteEntitlement.dadMessage });
        return;
      }
      const pairing = this.pairingStore.createPairing();
      const identity = new HostIdentityManager().ensureIdentity(path.join(this.dir, 'remote'));
      // Until Slice 5P supplies product relay defaults, relay-less local/test daemons retain
      // the Stage 2 creation seam with a development-only localhost domain.
      const relayDomain = this.remoteRelay?.relayDomain ?? 'localhost';
      const url = `https://h-${identity.hostPublicId}.${relayDomain}/pair#${pairing.secret}`;
      const qrSvg = await QRCode.toString(url, { type: 'svg' });
      this.sendJson(res, 200, {
        success: true,
        pairingId: pairing.pairingId,
        secret: pairing.secret,
        url,
        qrSvg,
        code: pairing.code,
        expiresAt: pairing.expiresAt
      });
      return;
    }
    if (method === 'GET' && requestUrl.pathname === '/api/devices') {
      this.sendJson(res, 200, { success: true, devices: this.deviceRegistry.list() });
      return;
    }
    if (method === 'DELETE' && requestUrl.pathname === '/api/devices') {
      const revoked = this.deviceRegistry.revokeAll();
      this.webPush.removeOwner((owner) => owner.startsWith('device:'));
      this.sendJson(res, 200, { success: true, revoked });
      return;
    }
    const deviceRoute = /^\/api\/devices\/([^/]+)$/.exec(requestUrl.pathname);
    if (deviceRoute && (method === 'PATCH' || method === 'DELETE')) {
      const deviceId = decodeURIComponent(deviceRoute[1]);
      if (method === 'DELETE') {
        const removed = this.deviceRegistry.revoke(deviceId);
        if (removed) this.webPush.removeOwner(`device:${deviceId}`);
        this.sendJson(res, removed ? 200 : 404, removed ? { success: true } : { success: false, message: 'Unknown device.' });
        return;
      }
      const body = (await this.readJsonBody(req)) as { label?: unknown };
      const renamed = this.deviceRegistry.rename(deviceId, body?.label);
      this.sendJson(res, renamed ? 200 : 404, renamed ? { success: true, device: renamed } : { success: false, message: 'Unknown device.' });
      return;
    }

    // Device push: each browser registers its own subscription. Only the VAPID public key leaves.
    if (method === 'GET' && requestUrl.pathname === '/api/push/config') {
      this.sendJson(res, 200, { success: true, publicKey: this.webPush.publicKey() });
      return;
    }
    if (method === 'POST' && requestUrl.pathname === '/api/push/subscriptions') {
      const body = (await this.readJsonBody(req)) as { subscription?: unknown; label?: unknown };
      const subscription = parsePushSubscription(body?.subscription);
      if (!subscription) {
        this.sendJson(res, 400, { success: false, message: 'This browser\'s push subscription was not recognized.' });
        return;
      }
      const owner = principal.kind === 'remote-device' ? `device:${principal.deviceId}` : 'local';
      const record = this.webPush.register(subscription, owner, body?.label);
      this.sendJson(res, 200, { success: true, registered: true, label: record.label });
      return;
    }
    if (method === 'POST' && requestUrl.pathname === '/api/push/unsubscribe') {
      const body = (await this.readJsonBody(req)) as { endpoint?: unknown };
      this.sendJson(res, 200, { success: true, removed: this.webPush.unregister(body?.endpoint) });
      return;
    }
    if (method === 'POST' && requestUrl.pathname === '/api/push/test') {
      const body = (await this.readJsonBody(req)) as { endpoint?: unknown };
      const result = await this.webPush.sendTest(body?.endpoint);
      this.sendJson(res, result.ok ? 200 : 409, { success: result.ok, message: result.message, ...(result.status !== undefined ? { pushStatus: result.status } : {}) });
      return;
    }

    // SSE Events
    if (method === 'GET' && requestUrl.pathname === '/api/events') {
      this.handleSseConnection(req, res, principal);
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/ai-health') {
      this.sendJson(res, 200, {
        success: true,
        health: this.projectAiHealth(this.healthAuthority.getSnapshot()),
        ...((this.claudeUsageReader || this.codexUsageReader) ? {
          acquisition: {
            ...(this.claudeUsageReader ? { claude: this.claudeUsageStatus } : {}),
            ...(this.codexUsageReader ? { codex: this.codexUsageReader.getStatus() } : {})
          }
        } : {})
      });
      return;
    }

    // Manual "Refresh Health": real, forced Claude and Codex account reads (never a routing
    // decision). Joins any read already in flight. Broadcasts over SSE only if the
    // canonical windows actually changed; otherwise this is a silent no-op.
    if (method === 'POST' && requestUrl.pathname === '/api/ai-health/refresh') {
      const claudePromise = this.claudeUsageReader
        ? this.claudeUsageReader.refresh().catch((err) => ({
            outcome: { ok: false as const, code: 'network_error' as const, reason: String(err) },
            changed: false
          }))
        : Promise.resolve({
            outcome: { ok: false as const, code: 'unavailable' as const, reason: 'The Claude usage reader is not enabled.' },
            changed: false
          });

      const codexPromise = this.codexUsageReader
        ? this.codexUsageReader.refresh().catch((err) => ({
            outcome: { ok: false as const, code: 'process_error' as const, reason: String(err) },
            changed: false
          }))
        : Promise.resolve({
            outcome: { ok: false as const, code: 'cli_not_found' as const, reason: 'The Codex usage reader is not enabled.' },
            changed: false
          });

      const [claudeResult, codexResult] = await Promise.all([claudePromise, codexPromise]);

      const nowIso = new Date().toISOString();
      const claudeOutcome = claudeResult.outcome;
      const codexOutcome = codexResult.outcome;
      const health = this.healthAuthority.getSnapshot();
      // Truthful status: a successful read is only "changed"/"unchanged" when the
      // authority now actually reflects every window that read returned. Any window
      // the merge kept at an older value is named, and the outcome says so.
      const claudeNotReflected = claudeOutcome.ok ? claudeWindowsNotReflected(health, claudeOutcome.windows) : [];
      const codexNotReflected = codexOutcome.ok ? codexWindowsNotReflected(health, codexOutcome.rateLimits) : [];

      this.sendJson(res, 200, {
        success: true,
        health: this.projectAiHealth(health),
        acquisition: {
          claude: {
            outcome: claudeOutcome.ok
              ? (claudeNotReflected.length > 0 ? 'retained' : claudeResult.changed ? 'changed' : 'unchanged')
              : (claudeOutcome.code === 'rate_limited'
                  ? 'rate_limited'
                  : claudeOutcome.code === 'auth_rejected'
                    ? 'auth_rejected'
                    : claudeOutcome.code === 'unavailable'
                      ? 'unavailable'
                      : 'failed'),
            ...(claudeOutcome.ok ? {} : { reason: claudeOutcome.reason, code: claudeOutcome.code }),
            ...(claudeNotReflected.length > 0 ? { notReflected: claudeNotReflected, reason: 'Claude returned newer usage that Sideline did not accept.' } : {}),
            checkedAt: nowIso
          },
          codex: {
            outcome: codexOutcome.ok
              ? (codexNotReflected.length > 0 ? 'retained' : codexResult.changed ? 'changed' : 'unchanged')
              : (codexOutcome.code === 'cli_not_found' ? 'unavailable' : 'failed'),
            ...(codexOutcome.ok ? {} : { reason: codexOutcome.reason, code: codexOutcome.code }),
            ...(codexNotReflected.length > 0 ? { notReflected: codexNotReflected, reason: 'Codex returned newer usage that Sideline did not accept.' } : {}),
            checkedAt: nowIso
          }
        }
      });
      return;
    }

    // Live Player Terminal backfill (reconnect / first Expand). Exact Player only.
    if (method === 'GET' && requestUrl.pathname === '/api/player-activity') {
      const gameId = requestUrl.searchParams.get('gameId') ?? '';
      const instanceId = requestUrl.searchParams.get('instanceId') ?? '';
      if (!gameId || !instanceId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId or instanceId.' });
        return;
      }
      const allowSensitive = principal.kind === 'remote-device'
        && this.getPreferences().devMode
        && this.getPreferences().remoteSensitiveTerminalOutput;
      const snapshot = this.livePlayerTerminalEnabled() ? this.playerActivity.snapshot(`${gameId}|${instanceId}`) : { sessionKey: undefined, entries: [] };
      this.sendJson(res, 200, redactForPrincipal(
        { success: true, gameId, instanceId, epoch: this.ledger.epoch, sessionKey: snapshot.sessionKey, entries: snapshot.entries },
        principal,
        { terminalActivity: true, allowSensitiveTerminalOutput: allowSensitive }
      ));
      return;
    }

    // Status
    if (method === 'GET' && requestUrl.pathname === '/api/status') {
      this.sendJson(res, 200, redactForPrincipal(this.buildStatus(), principal));
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/games/files/browse') {
      const gameId = requestUrl.searchParams.get('gameId')?.trim() ?? '';
      const dir = requestUrl.searchParams.get('dir')?.trim() ?? '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      await this.proxyExactGameRpc(res, gameId, 'game.files.v1', 'game.files.browse', { gameId, dir }, (raw) => {
        const result = raw as GameFilesBrowseResult;
        if (!result?.success) throw new Error(result?.message || 'Coach could not browse this Game.');
        return {
          success: true,
          gameId,
          dir: typeof result.dir === 'string' ? result.dir : '',
          entries: (Array.isArray(result.entries) ? result.entries : []).slice(0, 200).flatMap((entry) =>
            entry && typeof entry.name === 'string' && typeof entry.path === 'string' && (entry.kind === 'file' || entry.kind === 'folder')
              ? [{ name: entry.name, path: entry.path, kind: entry.kind }]
              : []),
          truncated: result.truncated === true
        };
      });
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/games/files/check') {
      const body = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      const paths = body.paths;
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!Array.isArray(paths) || paths.length > 20 || paths.some((candidate) => typeof candidate !== 'string')) {
        this.sendJson(res, 400, { success: false, message: 'Provide at most 20 Game paths as strings.' });
        return;
      }
      await this.proxyExactGameRpc(res, gameId, 'game.files.v1', 'game.files.check', { gameId, paths }, (raw) => {
        const result = raw as GameFilesCheckResult;
        if (!result?.success || !Number.isFinite(result.checkedAt)) throw new Error(result?.message || 'Coach could not check paths for this Game.');
        return {
          success: true,
          gameId,
          checkedAt: result.checkedAt,
          checks: (Array.isArray(result.checks) ? result.checks : []).slice(0, 20).flatMap((check) =>
            check && typeof check.path === 'string' && ['file', 'folder', 'missing', 'blocked', 'unknown'].includes(check.state)
              ? [{ path: check.path, state: check.state }]
              : [])
        };
      });
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/games/files/search') {
      const gameId = requestUrl.searchParams.get('gameId')?.trim() ?? '';
      const rawQuery = requestUrl.searchParams.get('q') ?? '';
      const rawLimit = requestUrl.searchParams.get('limit');
      const limit = rawLimit === null || rawLimit === '' ? undefined : Number(rawLimit);
      const allowSingleCharacter = requestUrl.searchParams.get('explicit') === '1';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (rawQuery.length > 120) {
        this.sendJson(res, 400, { success: false, message: 'Search query cannot exceed 120 characters.' });
        return;
      }
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
        this.sendJson(res, 400, { success: false, message: 'Search limit must be an integer from 1 to 100.' });
        return;
      }
      const query = rawQuery.trim().replace(/\\/g, '/').replace(/\s+/g, ' ').toLowerCase();
      const searchId = crypto.randomUUID();
      await this.proxyExactGameRpc(res, gameId, 'game.files.v1', 'game.files.search', { gameId, query, limit, searchId, allowSingleCharacter }, (raw) => {
        const result = raw as GameFilesSearchResult;
        if (!result?.success) throw new Error(result?.message || 'Coach could not search this Game.');
        if (result.searchId !== searchId || result.query !== query) throw new Error('Stadium returned a mismatched search response.');
        const allowedReasons = ['entries', 'directories', 'depth', 'time'];
        const shapedResults = (Array.isArray(result.results) ? result.results : []).slice(0, limit ?? 50).flatMap((entry) =>
          entry && typeof entry.name === 'string' && typeof entry.path === 'string' && (entry.kind === 'file' || entry.kind === 'folder')
            ? [{ name: entry.name, path: entry.path, kind: entry.kind }]
            : []);
        return {
          success: true,
          gameId,
          query: result.query,
          searchId,
          results: shapedResults,
          truncated: result.truncated === true,
          ...(typeof result.limitReason === 'string' && allowedReasons.includes(result.limitReason) ? { limitReason: result.limitReason } : {}),
          moreMatches: result.moreMatches === true,
          ...(result.superseded === true ? { superseded: true } : {})
        };
      });
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/games/files/absolute-path') {
      const body = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      const rawPath = typeof body.path === 'string' ? body.path : '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!rawPath.trim() || rawPath.length > 240) {
        this.sendJson(res, 400, { success: false, message: 'Provide one Game-relative path no longer than 240 characters.' });
        return;
      }
      const requestedPath = rawPath.trim() === '.'
        ? '.'
        : rawPath.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/').replace(/\/$/, '');
      await this.proxyExactGameRpc(res, gameId, 'game.files.v1', 'game.files.resolveAbsolute', { gameId, path: requestedPath }, (raw) => {
        const result = raw as GameFilesResolveAbsoluteResult;
        if (!result?.success) throw new Error(result?.message || 'Coach could not resolve that path.');
        if (result.path !== requestedPath) throw new Error('Stadium returned a mismatched absolute-path response.');
        if (result.available === true) {
          if (typeof result.absolutePath !== 'string' || !result.absolutePath ||
              !['windows', 'posix'].includes(String(result.pathStyle)) ||
              !['local', 'remote'].includes(String(result.environment))) {
            throw new Error('Stadium returned an invalid absolute-path response.');
          }
          const remoteLabels = ['WSL', 'SSH', 'Dev Container', 'Remote'];
          return {
            success: true, gameId, path: requestedPath, available: true,
            absolutePath: result.absolutePath,
            pathStyle: result.pathStyle,
            environment: result.environment,
            ...(result.environment === 'remote' && typeof result.remoteLabel === 'string' && remoteLabels.includes(result.remoteLabel)
              ? { remoteLabel: result.remoteLabel }
              : {})
          };
        }
        const reasons = ['missing', 'blocked', 'unknown', 'virtual-workspace'];
        if (!reasons.includes(String(result.reason))) throw new Error('Stadium returned an invalid absolute-path availability response.');
        return { success: true, gameId, path: requestedPath, available: false, reason: result.reason };
      });
      return;
    }

    // R12 Browser Preview. The URL is valid only for a browser on the VS Code client machine,
    // so a paired phone is told so instead of being handed a URL it cannot open. No proxying.
    if (method === 'GET' && requestUrl.pathname === '/api/games/preview') {
      const gameId = requestUrl.searchParams.get('gameId')?.trim() ?? '';
      const staticEntrypoint = requestUrl.searchParams.get('staticEntrypoint')?.trim();
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (principal.kind === 'remote-device') {
        this.sendJson(res, 200, { success: true, gameId, available: false, endpoints: [], reason: 'remote-viewer', remotePreview: this.remotePreviewGateway.isAvailable(gameId) });
        return;
      }
      if (staticEntrypoint && (staticEntrypoint.length > 500 || staticEntrypoint.includes('\0'))) {
        this.sendJson(res, 400, { success: false, message: 'Invalid static preview entrypoint.' });
        return;
      }
      await this.proxyExactGameRpc(res, gameId, 'game.preview.v1', 'game.preview.resolve', {
        gameId, ...(staticEntrypoint ? { staticEntrypoint } : {})
      }, (raw) => projectPreviewResolution(gameId, raw));
      return;
    }

    // R13 S5: a paired phone asks for a remote static Preview. The daemon re-resolves through the Stadium
    // (never trusting the caller), and only a static endpoint with a co-located Stadium can mint a grant.
    if (method === 'POST' && requestUrl.pathname === '/api/games/preview/remote') {
      if (principal.kind !== 'remote-device') {
        this.sendJson(res, 409, { success: false, reason: 'local-viewer', message: 'The local Sideline opens Preview directly.' });
        return;
      }
      const body = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      const staticEntrypoint = typeof body.staticEntrypoint === 'string' ? body.staticEntrypoint.trim() : undefined;
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (staticEntrypoint && (staticEntrypoint.length > 500 || staticEntrypoint.includes('\0'))) {
        this.sendJson(res, 400, { success: false, message: 'Invalid static preview entrypoint.' });
        return;
      }
      await this.openRemotePreview(res, principal.deviceId, gameId, staticEntrypoint);
      return;
    }

    // S6: read-only Game filesystem contract. No route in this slice mutates a Game.
    if (method === 'GET' && requestUrl.pathname === '/api/games/filesystem') {
      const gameId = requestUrl.searchParams.get('gameId')?.trim() ?? '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.registry.getKnownGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      this.sendJson(res, 200, this.projectGameFilesystem(gameId));
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/games/filesystem/reinspect') {
      const body = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.registry.getKnownGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      const auth = this.registry.getAuthoritativeSessionForGame(gameId);
      if (auth.status !== 'connected' || !auth.session) {
        this.sendJson(res, 409, {
          success: false,
          status: 'offline',
          message: auth.error || "That Game's Stadium is not connected.",
          ...this.projectGameFilesystem(gameId)
        });
        return;
      }
      const result = await this.gameFilesystem.reconcile(gameId);
      if (result.inspected) {
        await this.applyGameFilesystemContract(result.contract);
        await this.runFilesystemEnsure(gameId, result.bootstrapPlan, result.inspected);
      }
      this.sendJson(res, 200, { ...this.projectGameFilesystem(gameId), inspected: result.inspected, changed: result.changed });
      return;
    }

    /**
     * S10.0 — the human's explicit folder choice. Selects an EXISTING folder
     * only: verified live via `game.files.check` immediately before recording,
     * never created/moved/renamed. Recorded through the exact same
     * `GameFilesystemCoordinator.recordHumanChoice` authority S6 already
     * reserved for this — no second settings store, no new persistence
     * concept. `kind: 'reports'` also pushes the updated contract to the
     * Stadium so S7's apply/watch path converges on it immediately; `kind:
     * 'sop'` is a Coach-local decision only and is never applied remotely.
     */
    if (method === 'POST' && requestUrl.pathname === '/api/games/filesystem/choose') {
      const body = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      const kind = body.kind;
      const rawPath = typeof body.path === 'string' ? body.path : '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (kind !== 'reports' && kind !== 'sop') {
        this.sendJson(res, 400, { success: false, message: 'kind must be "reports" or "sop".' });
        return;
      }
      if (!rawPath.trim() || rawPath.length > 240) {
        this.sendJson(res, 400, { success: false, message: "Can't use this location." });
        return;
      }
      // Exact Game-relative path preserved (spaces, casing, nesting) — only backslashes
      // are normalized and a trailing slash is stripped, matching the absolute-path route.
      const folderPath = rawPath.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/').replace(/\/$/, '');
      if (!folderPath || folderPath === '.') {
        this.sendJson(res, 400, { success: false, message: "Can't use this location." });
        return;
      }
      if (!this.registry.getKnownGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      const auth = this.registry.getAuthoritativeSessionForGame(gameId);
      if (auth.status !== 'connected' || !auth.session) {
        this.sendJson(res, 409, { success: false, status: 'offline', message: auth.error || "That Game's Stadium is not connected." });
        return;
      }
      if (!auth.session.features?.includes('game.files.v1') || !auth.session.features?.includes('game.filesystem.v1')) {
        this.sendJson(res, 409, { success: false, status: 'unsupported', message: 'Reload or update this Game window to change this folder.' });
        return;
      }
      let checkResult: GameFilesCheckResult | undefined;
      try {
        checkResult = (await this.sendRpcToStadium(auth.session, 'game.files.check', { gameId, paths: [folderPath] })) as GameFilesCheckResult;
      } catch (error) {
        this.sendJson(res, 502, { success: false, message: `Could not verify that folder. ${error instanceof Error ? error.message : String(error)}` });
        return;
      }
      if (!checkResult?.success || checkResult.gameId !== gameId) {
        this.sendJson(res, 502, { success: false, message: 'Coach could not verify that folder.' });
        return;
      }
      const check = checkResult.checks?.find((entry) => entry.path === folderPath);
      if (!check || check.state !== 'folder') {
        this.sendJson(res, 409, { success: false, message: "Can't use this location." });
        return;
      }
      const updated = this.gameFilesystem.recordHumanChoice(gameId, kind, folderPath);
      if (kind === 'reports') await this.applyGameFilesystemContract(updated);
      this.sendJson(res, 200, this.projectGameFilesystem(gameId));
      return;
    }

    /**
     * S10.0 — "Restore detected folder": clears the human override
     * (`GameFilesystemCoordinator.clearChoice`, the same authority) and lets
     * automatic detection decide again, reusing S6's own reconcile pass.
     */
    if (method === 'POST' && requestUrl.pathname === '/api/games/filesystem/restore') {
      const body = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      const kind = body.kind;
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (kind !== 'reports' && kind !== 'sop') {
        this.sendJson(res, 400, { success: false, message: 'kind must be "reports" or "sop".' });
        return;
      }
      if (!this.registry.getKnownGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      this.gameFilesystem.clearChoice(gameId, kind);
      const auth = this.registry.getAuthoritativeSessionForGame(gameId);
      if (auth.status === 'connected' && auth.session) {
        const result = await this.gameFilesystem.reconcile(gameId);
        if (result.inspected) {
          await this.applyGameFilesystemContract(result.contract);
          await this.runFilesystemEnsure(gameId, result.bootstrapPlan, result.inspected);
        }
      }
      this.sendJson(res, 200, this.projectGameFilesystem(gameId));
      return;
    }

    // Coach Routines V0. Every request names its Game; browser selection is
    // never accepted as mutation authority.
    if (method === 'GET' && requestUrl.pathname === '/api/routines') {
      const gameId = requestUrl.searchParams.get('gameId')?.trim() ?? '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      this.sendJson(res, 200, {
        success: true,
        gameId,
        definitions: this.routines.forGame(gameId).routines,
        projection: this.projectRoutines(gameId)
      });
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/routines') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      // COMMERCIAL GATE: routines (creation only; existing routines keep working).
      const routinesEntitlement = this.featureGate.check('routines');
      if (!routinesEntitlement.allowed) {
        this.recordRefusal(routinesEntitlement);
        this.sendJson(res, 403, { success: false, code: 'capability-unavailable', capability: 'routines', message: routinesEntitlement.dadMessage });
        return;
      }
      try {
        const routine = this.routines.create(gameId, body as unknown as RoutineInput);
        this.sendJson(res, 201, { success: true, gameId, routine, projection: this.projectRoutines(gameId) });
      } catch (error) {
        this.sendRoutineValidationError(res, error);
      }
      return;
    }

    if ((method === 'GET' || method === 'POST') && requestUrl.pathname === '/api/routines/sources/suggest') {
      const body = method === 'POST' ? (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown> : {};
      const gameId = (requestUrl.searchParams.get('gameId') ?? (typeof body.gameId === 'string' ? body.gameId : '')).trim();
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      const auth = this.registry.getAuthoritativeSessionForGame(gameId);
      if (auth.status !== 'connected' || !auth.session) {
        this.sendJson(res, 409, { success: false, status: 'offline', message: auth.error || "That Game's Stadium is not connected." });
        return;
      }
      try {
        const result = (await this.sendRpcToStadium(auth.session, 'routine.sources.suggest', { gameId })) as {
          success?: boolean;
          gameId?: string;
          suggestions?: Array<{ path: string; kind: 'file' | 'folder'; reason: string }>;
          message?: string;
        };
        if (!result?.success || result.gameId !== gameId) {
          this.sendJson(res, 502, { success: false, message: result?.message || 'Coach could not suggest sources for this Game.' });
          return;
        }
        this.sendJson(res, 200, {
          success: true,
          gameId,
          suggestions: (Array.isArray(result.suggestions) ? result.suggestions : []).slice(0, 10).flatMap((suggestion) =>
            suggestion && typeof suggestion.path === 'string' && (suggestion.kind === 'file' || suggestion.kind === 'folder') && typeof suggestion.reason === 'string'
              ? [{ path: suggestion.path, kind: suggestion.kind, reason: suggestion.reason.slice(0, 160) }]
              : [])
        });
      } catch (err) {
        this.sendJson(res, 502, { success: false, message: `Coach could not suggest sources. ${err instanceof Error ? err.message : String(err)}` });
      }
      return;
    }

    if ((method === 'GET' || method === 'POST') && requestUrl.pathname === '/api/routines/sources/browse') {
      const body = method === 'POST' ? (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown> : {};
      const gameId = (requestUrl.searchParams.get('gameId') ?? (typeof body.gameId === 'string' ? body.gameId : '')).trim();
      const dir = (requestUrl.searchParams.get('dir') ?? (typeof body.dir === 'string' ? body.dir : '')).trim();
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      const auth = this.registry.getAuthoritativeSessionForGame(gameId);
      if (auth.status !== 'connected' || !auth.session) {
        this.sendJson(res, 409, { success: false, status: 'offline', message: auth.error || "That Game's Stadium is not connected." });
        return;
      }
      try {
        const result = (await this.sendRpcToStadium(auth.session, 'routine.sources.browse', { gameId, dir })) as {
          success?: boolean;
          gameId?: string;
          dir?: string;
          entries?: Array<{ name: string; path: string; kind: 'file' | 'folder' }>;
          message?: string;
        };
        if (!result?.success || result.gameId !== gameId) {
          this.sendJson(res, 502, { success: false, message: result?.message || 'Coach could not browse sources for this Game.' });
          return;
        }
        this.sendJson(res, 200, {
          success: true,
          gameId,
          dir: typeof result.dir === 'string' ? result.dir : '',
          entries: (Array.isArray(result.entries) ? result.entries : []).slice(0, 200).flatMap((entry) =>
            entry && typeof entry.name === 'string' && typeof entry.path === 'string' && (entry.kind === 'file' || entry.kind === 'folder')
              ? [{ name: entry.name, path: entry.path, kind: entry.kind }]
              : [])
        });
      } catch (err) {
        this.sendJson(res, 502, { success: false, message: `Coach could not browse sources. ${err instanceof Error ? err.message : String(err)}` });
      }
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/routines/sources/check') {
      const body = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const gameId = (typeof body.gameId === 'string' ? body.gameId : (requestUrl.searchParams.get('gameId') ?? '')).trim();
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      const rawPaths = Array.isArray(body.paths)
        ? body.paths
        : (requestUrl.searchParams.has('path') ? requestUrl.searchParams.getAll('path') : null);
      if (!Array.isArray(rawPaths)) {
        this.sendJson(res, 400, { success: false, message: 'Paths must be an array of strings.' });
        return;
      }
      if (rawPaths.length > 20 || rawPaths.some((candidate) => typeof candidate !== 'string')) {
        this.sendJson(res, 400, { success: false, message: 'Provide at most 20 source paths as strings.' });
        return;
      }
      const paths = rawPaths as string[];
      const auth = this.registry.getAuthoritativeSessionForGame(gameId);
      if (auth.status !== 'connected' || !auth.session) {
        this.sendJson(res, 200, {
          success: true,
          gameId,
          checks: paths.map((path) => ({ path, state: 'unknown' as const })),
          offline: true
        });
        return;
      }
      try {
        const result = (await this.sendRpcToStadium(auth.session, 'routine.sources.check', { gameId, paths })) as {
          success?: boolean;
          gameId?: string;
          checkedAt?: number;
          checks?: Array<{ path: string; state: RoutineSourceState }>;
          message?: string;
        };
        if (!result?.success || result.gameId !== gameId || !Number.isFinite(result.checkedAt)) {
          this.sendJson(res, 502, { success: false, message: result?.message || 'Coach could not check sources for this Game.' });
          return;
        }
        const checks = (Array.isArray(result.checks) ? result.checks : []).slice(0, 20).flatMap((check) =>
          check && typeof check.path === 'string' && ['file', 'folder', 'missing', 'blocked', 'unknown'].includes(check.state)
            ? [{ path: check.path, state: check.state }]
            : []) as Array<{ path: string; state: RoutineSourceState }>;
        this.routines.recordSourceCheck(gameId, result.checkedAt!, checks);
        this.sendJson(res, 200, {
          success: true,
          gameId,
          checkedAt: result.checkedAt,
          checks,
          projection: this.projectRoutines(gameId)
        });
      } catch (err) {
        this.sendJson(res, 502, { success: false, message: `Coach could not check sources. ${err instanceof Error ? err.message : String(err)}` });
      }
      return;
    }

    // Human-entered per-Game repository coordinate for an AI Assistant Coach that cannot
    // reach local files. Matched before the generic routine-id mutation regex below so
    // this exact path is never mistaken for a routineId of "repository".
    if (method === 'PATCH' && requestUrl.pathname === '/api/routines/repository') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      try {
        const repositoryUrl = this.routines.setRepositoryUrl(gameId, typeof body.repositoryUrl === 'string' ? body.repositoryUrl : '');
        this.sendJson(res, 200, { success: true, gameId, repositoryUrl, projection: this.projectRoutines(gameId) });
      } catch (error) {
        this.sendRoutineValidationError(res, error);
      }
      return;
    }

    const routineMutation = /^\/api\/routines\/([^/]+)(?:\/(due))?$/.exec(requestUrl.pathname);
    if (routineMutation && ((method === 'PATCH' && !routineMutation[2]) || (method === 'DELETE' && !routineMutation[2]) || (method === 'POST' && routineMutation[2] === 'due'))) {
      const routineId = decodeURIComponent(routineMutation[1]);
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      try {
        if (method === 'PATCH') {
          const routine = this.routines.update(gameId, routineId, body as RoutinePatch);
          this.sendJson(res, routine ? 200 : 404, routine
            ? { success: true, gameId, routine, projection: this.projectRoutines(gameId) }
            : { success: false, message: 'That routine does not belong to this Game.' });
        } else if (method === 'DELETE') {
          const removed = this.routines.remove(gameId, routineId);
          this.sendJson(res, removed ? 200 : 404, removed
            ? { success: true, gameId, projection: this.projectRoutines(gameId) }
            : { success: false, message: 'That routine does not belong to this Game.' });
        } else {
          const routine = this.routines.markDue(gameId, routineId);
          this.sendJson(res, routine ? 200 : 404, routine
            ? { success: true, gameId, routine, projection: this.projectRoutines(gameId) }
            : { success: false, message: 'That routine does not belong to this Game.' });
        }
      } catch (error) {
        this.sendRoutineValidationError(res, error);
      }
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/routines/delivered') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      const via = body.via === 'copy-report' || body.via === 'strategy-board-send' ? body.via : undefined;
      const deliveries = Array.isArray(body.deliveries)
        ? body.deliveries.filter((item): item is { routineId: string; cycle: string } => Boolean(item)
          && typeof (item as { routineId?: unknown }).routineId === 'string'
          && typeof (item as { cycle?: unknown }).cycle === 'string')
        : [];
      if (!gameId || !via || deliveries.length === 0 || deliveries.length > 20) {
        this.sendJson(res, 400, { success: false, message: 'Name the exact Game, due routine cycle, and delivery method.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      const reportPath = typeof body.reportPath === 'string' && body.reportPath.length <= 500 ? body.reportPath : undefined;
      const result = this.routines.markDelivered(gameId, deliveries, via, reportPath);
      const statusCode = !result.found ? 404 : result.stale ? 409 : 200;
      if (statusCode === 200 && result.changed) this.emitProduct({ name: 'routines.delivered', surface: 'desktop', capability: 'routines' });
      this.sendJson(res, statusCode, {
        success: statusCode === 200,
        gameId,
        delivered: result.changed,
        alreadyDelivered: result.alreadyDelivered,
        stale: result.stale,
        ...(statusCode === 200 ? { projection: this.projectRoutines(gameId) }
          : { message: result.stale ? 'That routine cycle is no longer current.' : 'That routine does not belong to this Game.' })
      });
      return;
    }

    // Player-plumbing diagnostics. Bounded, structural facts only: no prompts,
    // no provider credentials, no report or conversation content. Exists so that
    // "terminal alive but browser shows 0 Players" can be localized in one snapshot.
    if (method === 'GET' && requestUrl.pathname === '/api/diagnostics') {
      this.sendJson(res, 200, this.buildDiagnostics());
      return;
    }

    // Games
    if (method === 'GET' && requestUrl.pathname === '/api/games') {
      const selectedGameId = this.registry.getSelectedGameId();
      const games = this.registry.getGames();
      this.sendJson(res, 200, {
        success: true,
        selectedGameId,
        games
      });
      return;
    }

    // Game select
    if (method === 'POST' && requestUrl.pathname === '/api/game/select') {
      const body = (await this.readJsonBody(req)) as { gameId?: string };
      const targetGameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      if (!targetGameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId in request body.' });
        return;
      }
      const success = this.registry.setSelectedGameId(targetGameId);
      if (!success) {
        this.sendJson(res, 404, { success: false, message: `Game '${targetGameId}' is not found in registry.` });
        return;
      }
      this.broadcast('status', { type: 'game-select', gameId: targetGameId, at: Date.now() });
      this.sendJson(res, 200, { success: true, selectedGameId: targetGameId });
      return;
    }

    // Dispatch
    if (method === 'POST' && requestUrl.pathname === '/api/dispatch') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      // R8: `[USE]` is the explicit Coach click. It resolves through optionToDecision behind the closed-by-default
      // stage gate, then the ordinary router dispatches it. Anything unresolved is refused with nothing sent.
      let advised: { decision: RoutingDecision; decidedBy: AcceptedDecidedBy } | undefined;
      if (isAdvisedChoice(body.routeChoice)) {
        const advisedGameId = typeof body.gameId === 'string' ? body.gameId : this.registry.getSelectedGameId();
        const accepted = body.routingMode === 'manual'
          ? { ok: false as const, message: 'Manual routing stays exactly as you chose it.' }
          : this.resolveAdvised(body.routeChoice, body.recommendationId, advisedGameId, typeof body.prompt === 'string' ? body.prompt : '');
        if (!accepted.ok) {
          this.sendJson(res, 409, { success: false, message: accepted.message });
          return;
        }
        advised = { decision: accepted.decision, decidedBy: accepted.decidedBy };
      }
      const result = await this.router.dispatch({
        ...(advised ? { advised } : {}),
        prompt: typeof body.prompt === 'string' ? body.prompt : '',
        gameId: typeof body.gameId === 'string' ? body.gameId : undefined,
        stadiumId: typeof body.stadiumId === 'string' ? body.stadiumId : undefined,
        playerInstanceId: typeof body.playerInstanceId === 'string' ? body.playerInstanceId : undefined,
        terminalName: typeof body.terminalName === 'string' ? body.terminalName : undefined,
        routingMode: body.routingMode === 'manual' ? 'manual' : 'auto',
        model: typeof body.model === 'string' ? body.model : undefined,
        effort: typeof body.effort === 'string' ? body.effort : undefined,
        modelSwitch: typeof body.modelSwitch === 'string' ? body.modelSwitch : undefined,
        incomingReportPath: typeof body.incomingReportPath === 'string' ? body.incomingReportPath : undefined,
        routeChoice: body.routeChoice === 'queue' || body.routeChoice === 'handoff' || body.routeChoice === 'dispatch' ? body.routeChoice : undefined,
        whenBusy: body.whenBusy === 'queue' ? 'queue' : undefined
      });
      if (advised && result.success && typeof body.recommendationId === 'string') this.advisoryOffers.delete(body.recommendationId);

      this.sendJson(res, result.statusCode, result);
      return;
    }

    // Reports list
    if (method === 'GET' && requestUrl.pathname === '/api/reports') {
      // A client may name its Game explicitly; reports are only ever read from that
      // Game's own authoritative Stadium, so a Game never sees another Game's reports.
      const gameId = requestUrl.searchParams.get('gameId') || this.registry.getSelectedGameId();
      const reports = this.registry.getReportsForGame(gameId);
      this.sendJson(res, 200, redactForPrincipal(reports, principal));
      return;
    }

    // Q2.10D: one Game's queue (never another Game's).
    if (method === 'GET' && requestUrl.pathname === '/api/queue') {
      const gameId = requestUrl.searchParams.get('gameId') || this.registry.getSelectedGameId();
      this.sendJson(res, 200, { success: true, gameId, queue: this.projectQueue(gameId) });
      return;
    }

    // Slice A: acknowledge existing canonical work/report truth. The browser will
    // call this in a later slice; no separate acknowledgement store is introduced.
    if (method === 'POST' && requestUrl.pathname === '/api/work/acknowledge') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' && body.gameId ? body.gameId : '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      const result = this.ledger.acknowledge({
        gameId,
        reportPath: typeof body.reportPath === 'string' ? body.reportPath : undefined,
        instanceId: typeof body.instanceId === 'string' ? body.instanceId : undefined,
        playRef: typeof body.playRef === 'string' ? body.playRef : undefined
      });
      this.sendJson(res, result.found ? 200 : 404, result.found
        ? { success: true, acknowledged: true, changed: result.changed, instanceId: result.instanceId }
        : { success: false, acknowledged: false, message: 'That work item is not linked to this Game and Player.' });
      return;
    }

    // R9: Schedule after reset — arm one continue-task intent for the exact interrupted Play.
    // The browser names only the Player and the interrupted Play; every fact is re-derived here.
    if (method === 'POST' && requestUrl.pathname === '/api/deferred-play') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const result = this.armDeferredContinuation(
        typeof body.gameId === 'string' && body.gameId ? body.gameId : this.registry.getSelectedGameId(),
        typeof body.playerInstanceId === 'string' ? body.playerInstanceId : '',
        typeof body.interruptedClientRef === 'string' ? body.interruptedClientRef : ''
      );
      this.sendJson(res, result.status, result.body);
      return;
    }
    // R9: Use another Player — explicit human choice of an exact receiver, through the existing router + handoff.
    if (method === 'POST' && requestUrl.pathname === '/api/deferred-play/use-another') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const result = await this.useAnotherPlayer(
        typeof body.gameId === 'string' && body.gameId ? body.gameId : this.registry.getSelectedGameId(),
        typeof body.fromInstanceId === 'string' ? body.fromInstanceId : '',
        typeof body.interruptedClientRef === 'string' ? body.interruptedClientRef : '',
        typeof body.toInstanceId === 'string' ? body.toInstanceId : ''
      );
      this.sendJson(res, result.status, result.body);
      return;
    }
    const deferredAction = /^\/api\/deferred-play\/([^/]+)\/(cancel|retry)$/.exec(requestUrl.pathname);
    if (method === 'POST' && deferredAction) {
      const id = decodeURIComponent(deferredAction[1]);
      const body = (await this.readJsonBody(req)) as { gameId?: unknown };
      const gameId = typeof body.gameId === 'string' && body.gameId ? body.gameId : this.registry.getSelectedGameId();
      if (deferredAction[2] === 'cancel') {
        const cancelled = this.deferredScheduler.cancel(id, gameId);
        this.sendJson(res, cancelled ? 200 : 409, cancelled
          ? { success: true, message: 'Scheduled continuation cancelled. Nothing will be sent.' }
          : { success: false, message: 'That scheduled continuation can\'t be cancelled now (it may already be sending or done).' });
        return;
      }
      const retried = await this.deferredScheduler.retry(id, gameId);
      const record = this.deferredPlays.get(id);
      this.sendJson(res, retried ? 200 : 409, retried
        ? { success: true, message: record?.state === 'handed-off' ? 'That continuation had already been received.' : 'Coach will check again and continue when it is safe.', state: record?.state }
        : { success: false, message: 'That scheduled continuation does not need attention.' });
      return;
    }

    const queueAction = /^\/api\/queue\/([^/]+)\/(cancel|retry)$/.exec(requestUrl.pathname);
    if (method === 'POST' && queueAction) {
      const id = decodeURIComponent(queueAction[1]);
      const body = (await this.readJsonBody(req)) as { gameId?: unknown };
      const gameId = typeof body.gameId === 'string' && body.gameId ? body.gameId : this.registry.getSelectedGameId();
      if (queueAction[2] === 'cancel') {
        const cancelled = this.playQueue.cancel(id, gameId);
        if (cancelled) this.ledger.recordQueueMutation(cancelled.gameId, cancelled.playerInstanceId);
        this.broadcastStatus();
        this.sendJson(res, cancelled ? 200 : 404, cancelled
          ? { success: true, message: 'Queued Play cancelled. Nothing was sent.' }
          : { success: false, message: 'That queued Play is no longer waiting (it may already be starting).' });
        return;
      }
      const item = this.playQueue.get(id);
      const retried = item?.gameId === gameId && this.playQueue.retry(id, gameId);
      if (retried && item) this.ledger.recordQueueMutation(item.gameId, item.playerInstanceId);
      this.broadcastStatus();
      if (retried && item) setImmediate(() => void this.drainQueue(item.gameId, item.playerInstanceId));
      this.sendJson(res, retried ? 200 : 404, retried
        ? { success: true, message: 'Coach will send it when that Player is free.' }
        : { success: false, message: 'That queued Play does not need attention.' });
      return;
    }

    // Refresh Incoming — recovery only. Asks the Game's own Stadium for a canonical
    // rescan; normal reports arrive through the Stadium's report watcher.
    if (method === 'POST' && requestUrl.pathname === '/api/reports/rescan') {
      const body = (await this.readJsonBody(req)) as { gameId?: unknown };
      const gameId = typeof body.gameId === 'string' && body.gameId ? body.gameId : this.registry.getSelectedGameId();
      const auth = this.registry.getAuthoritativeSessionForGame(gameId);
      if (auth.status !== 'connected' || !auth.session) {
        this.sendJson(res, 409, { success: false, message: auth.error || "That Game isn't connected, so Coach can't check its reports." });
        return;
      }
      try {
        const result = (await this.sendRpcToStadium(auth.session, 'report.rescan', {})) as { success?: boolean; count?: number; message?: string };
        if (!result?.success) {
          this.sendJson(res, 502, { success: false, message: result?.message || "Coach couldn't check this Game's reports." });
          return;
        }
        const count = typeof result.count === 'number' ? result.count : 0;
        this.sendJson(res, 200, { success: true, gameId, count, message: count ? `Incoming refreshed · ${count} report${count === 1 ? '' : 's'}` : 'Incoming refreshed · no reports found for this Game' });
      } catch (err) {
        this.sendJson(res, 502, { success: false, message: `Coach couldn't check this Game's reports. ${err instanceof Error ? err.message : String(err)}` });
      }
      return;
    }

    // Single report
    if (method === 'GET' && requestUrl.pathname === '/api/report') {
      const reportPath = requestUrl.searchParams.get('path');
      const selectedGameId = this.registry.getSelectedGameId();
      const reports = this.registry.getReportsForGame(selectedGameId) as Array<{ path: string }>;
      const found = reports.find((r) => r.path === reportPath);
      if (!found) {
        this.sendJson(res, 404, { success: false, message: 'Report not found' });
        return;
      }
      this.sendJson(res, 200, redactForPrincipal(found, principal));
      return;
    }

    // Player action forwarders: /api/players/:playerId/field, /instances, /controlled-instances
    if (method === 'POST' && requestUrl.pathname.startsWith('/api/players/')) {
      const parts = requestUrl.pathname.split('/');
      // [' ', 'api', 'players', ':playerId', 'action']
      if (parts.length === 5) {
        const playerId = parts[3];
        const actionType = parts[4];
        let action: 'field' | 'instance' | 'controlled' | undefined;
        if (actionType === 'field') action = 'field';
        else if (actionType === 'instances') action = 'instance';
        else if (actionType === 'controlled-instances') action = 'controlled';

        if (action) {
          const selectedGameId = this.registry.getSelectedGameId();
          const auth = this.registry.getAuthoritativeSessionForGame(selectedGameId);
          if (auth.status !== 'connected' || !auth.session) {
            this.sendJson(res, 400, { success: false, message: auth.error || 'Game is offline.' });
            return;
          }

          try {
            const result = (await this.sendRpcToStadium(auth.session, 'player.action', {
              action,
              playerId,
              gameId: selectedGameId
            })) as PlayerActionResult;
            this.sendJson(res, result.success ? 200 : 400, result);
            return;
          } catch (err) {
            this.sendJson(res, 500, { success: false, message: err instanceof Error ? err.message : String(err) });
            return;
          }
        }
      }
    }

    // Routing mode / manual selection
    if (method === 'POST' && requestUrl.pathname === '/api/route') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      if (body.mode === 'auto' || body.mode === 'manual') {
        this.routingMode = body.mode;
      }
      // CONSERVE actuator: only the two postures the Coach control offers; anything else is ignored (state echoed back).
      if (body.posture === 'balanced' || body.posture === 'conserve') {
        this.setRoutingPosture(body.posture);
      }
      if (body.playerInstanceId !== undefined || body.model !== undefined || body.effort !== undefined) {
        this.manualSelection = {
          playerInstanceId: typeof body.playerInstanceId === 'string' ? body.playerInstanceId : this.manualSelection?.playerInstanceId,
          model: typeof body.model === 'string' ? body.model : body.model === null ? undefined : this.manualSelection?.model,
          effort: typeof body.effort === 'string' ? body.effort : body.effort === null ? undefined : this.manualSelection?.effort
        };
      }
      this.broadcast('status', { type: 'routing-change', at: Date.now() });
      this.sendJson(res, 200, {
        success: true,
        routing: { mode: this.routingMode, posture: this.routingPosture, manualSelection: this.manualSelection }
      });
      return;
    }

    // AUTO route preview for the prompt currently being typed
    if (method === 'POST' && requestUrl.pathname === '/api/route/preview') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const prompt = typeof body.prompt === 'string' ? body.prompt : '';
      const previewGameId = this.registry.getSelectedGameId();
      const previewGame = this.registry.getGames().find((g) => g.gameId === previewGameId);
      const previewAuth = this.registry.getAuthoritativeSessionForGame(previewGameId);
      const previewCapabilities = this.registry.getCapabilitiesForGame(previewGameId) as PlayerRoutingCapability[];
      const routing = this.buildRouting(
        previewGameId,
        previewGame?.displayName,
        previewAuth.status,
        this.registry.isRosterSynchronizedForGame(previewGameId),
        previewCapabilities,
        prompt,
        {
          incomingReportPath: typeof body.incomingReportPath === 'string' ? body.incomingReportPath : undefined,
          routeChoice: !isAdvisedChoice(body.routeChoice) && (body.routeChoice === 'queue' || body.routeChoice === 'handoff' || body.routeChoice === 'dispatch') ? body.routeChoice : undefined
        }
      );
      if (routing.activeDecision) {
        const stageOpen = advisoryStageOpen(this.advisoryStage);
        // R8: accepting a suggestion goes through the same staged-route request the alternatives use.
        // Closed stage: refused, nothing staged, nothing sent.
        if (isAdvisedChoice(body.routeChoice)) {
          const accepted = this.resolveAdvised(body.routeChoice, body.recommendationId, previewGameId, prompt);
          if (!accepted.ok) {
            this.sendJson(res, 409, { success: false, error: accepted.message });
            return;
          }
          this.sendJson(res, 200, { success: true, decision: accepted.decision, advised: true });
          return;
        }
        const devMode = this.getPreferences().devMode;
        // R6 shadow recommendation: Dev-only data exposure. It never changes `decision`, and
        // preview never writes Film. R8 additionally needs it for the Dad advisory, only once the stage is open.
        const recommendation = (devMode || stageOpen)
          ? this.previewRecommendation(
              previewGameId,
              prompt,
              routing.activeDecision as RoutingDecision,
              previewCapabilities,
              typeof body.incomingReportPath === 'string' ? body.incomingReportPath : undefined
            )
          : undefined;
        const advisory = stageOpen && recommendation
          ? this.offerAdvisory(previewGameId, prompt, routing.activeDecision as RoutingDecision, recommendation)
          : undefined;
        this.sendJson(res, 200, {
          success: true,
          decision: routing.activeDecision,
          ...(devMode && recommendation ? { recommendation, recommendationNarrative: recommendationNarrative(recommendation) } : {}),
          ...(advisory ? { advisory } : {})
        });
      } else {
        this.sendJson(res, 200, { success: false, error: routing.autoError });
      }
      return;
    }

    // Add Game — one human action, complete lifecycle.
    //
    // The Control Plane coordinates and decides; the Stadium executes the two
    // environment-specific mechanics (the native picker, and opening a window).
    // The browser only expresses intent, because it has no Stadium of its own
    // and cannot safely enumerate local paths.
    if (method === 'POST' && requestUrl.pathname === '/api/game/add') {
      await this.handleAddGame(res);
      return;
    }

    // Exit / Archive. A registry operation only: no repository is ever touched.
    if (method === 'POST' && requestUrl.pathname === '/api/game/archive') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId : this.registry.getSelectedGameId();
      const known = this.registry.getKnownGame(gameId);
      if (!known) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      const archived = this.registry.archiveGame(gameId);
      // C5 (Q5): archiving releases the active slot. History, reports and the repository stay.
      const heldSlot = this.featureGate.hasMember('games.active', gameId);
      if (archived || heldSlot) this.featureGate.release('games.active', gameId);
      if (heldSlot) this.emitProduct({ name: 'game.archived', surface: 'desktop', capability: 'games.active', counts: { games: this.activeGameCount() } });
      this.broadcastStatus();
      this.sendJson(res, archived ? 200 : 400, {
        success: archived,
        message: archived
          ? `${known.displayName} was archived. Its repository was not changed.`
          : `${known.displayName} is already archived.`,
        selectedGameId: this.registry.getSelectedGameId()
      });
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/game/restore') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId : '';
      const restored = this.registry.restoreGame(gameId);
      if (restored) this.broadcastStatus();
      this.sendJson(res, restored ? 200 : 404, {
        success: restored,
        message: restored ? 'Game restored to the active Sideline.' : 'That Game is not archived.'
      });
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/games/archived') {
      this.sendJson(res, 200, { success: true, games: this.registry.getArchivedGames() });
      return;
    }

    // --- Player lifecycle -------------------------------------------------
    if (method === 'POST' && requestUrl.pathname === '/api/players/discover') {
      await this.forwardPlayerLifecycle(res, 'player.discover', {});
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/players/add') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const playerType = typeof body.playerType === 'string' ? body.playerType : '';
      if (playerType === 'terminal') {
        await this.forwardPlayerLifecycle(res, 'player.addTerminal', {});
        return;
      }
      // Provider Players keep their existing certified/direct entry points so
      // Q2.9 adds a surface without changing how a provider Player is started.
      const controlled = body.controlled !== false;
      const runningPlayers = this.getPreferences().runningPlayers;
      // "Ignore running Players" is the human saying duplicates are fine.
      const allowDuplicate = body.allowDuplicate === true || runningPlayers === 'ignore';
      await this.forwardPlayerAction(res, controlled ? 'controlled' : 'instance', playerType, { allowDuplicate });
      return;
    }

    if (requestUrl.pathname === '/api/scout/openrouter-credential') {
      let body: Record<string, unknown> = {};
      if (method === 'POST' || method === 'DELETE') {
        body = (await this.readJsonBody(req)) as Record<string, unknown>;
      }
      const gameId = method === 'GET'
        ? (requestUrl.searchParams.get('gameId') ?? '').trim()
        : (typeof body.gameId === 'string' ? body.gameId.trim() : '');
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined;
      if (method === 'POST' && (!apiKey || !apiKey.trim() || apiKey.length > 4096)) {
        this.sendJson(res, 400, { success: false, message: 'Enter a valid OpenRouter API key.' });
        return;
      }
      const rpcMethod = method === 'GET'
        ? 'scout.openrouterCredential.status'
        : method === 'POST'
          ? 'scout.openrouterCredential.save'
          : method === 'DELETE'
            ? 'scout.openrouterCredential.disconnect'
            : undefined;
      if (!rpcMethod) {
        this.sendJson(res, 405, { success: false, message: 'Method not allowed.' });
        return;
      }
      await this.proxyExactGameRpc(
        res,
        gameId,
        'scout.openrouter-credential.v1',
        rpcMethod,
        { gameId, ...(method === 'POST' ? { apiKey } : {}) },
        (raw) => {
          const result = raw as { success?: unknown; gameId?: unknown; configured?: unknown; available?: unknown; message?: unknown };
          return {
            success: result.success === true,
            gameId,
            configured: result.configured === true,
            available: result.available === true,
            ...(typeof result.message === 'string' ? { message: result.message } : {})
          };
        }
      );
      return;
    }

    // S31 Slice 4: in-product Scout bootstrap. A thin, human-action-only bridge to the Stadium's
    // extension-owned service. It carries no credential in either direction, and the response is
    // rebuilt field by field from an allowlist, so nothing else can reach the browser.
    if (requestUrl.pathname === '/api/scout/bootstrap') {
      if (method !== 'GET' && method !== 'POST') {
        this.sendJson(res, 405, { success: false, message: 'Method not allowed.' });
        return;
      }
      const body = method === 'POST' ? (await this.readJsonBody(req)) as Record<string, unknown> : {};
      const gameId = method === 'GET'
        ? (requestUrl.searchParams.get('gameId') ?? '').trim()
        : (typeof body.gameId === 'string' ? body.gameId.trim() : '');
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      const action = method === 'POST' ? body.action : 'status';
      const rpcMethod = action === 'status' ? 'scout.bootstrap.status'
        : action === 'authorize' ? 'scout.bootstrap.authorize'
          : action === 'decline' ? 'scout.bootstrap.decline'
            : action === 'refresh' ? 'scout.bootstrap.refresh'
              : undefined;
      if (!rpcMethod) {
        this.sendJson(res, 400, { success: false, message: 'Unknown Scout tryout action.' });
        return;
      }
      // COMMERCIAL GATE: scout.maintenance for the two actions that start Combine tryouts.
      // Status and decline stay ungated.
      if (action === 'authorize' || action === 'refresh') {
        const maintenanceEntitlement = this.featureGate.check('scout.maintenance');
        if (!maintenanceEntitlement.allowed) {
          this.recordRefusal(maintenanceEntitlement);
          this.sendJson(res, 403, { success: false, code: 'capability-unavailable', capability: 'scout.maintenance', message: maintenanceEntitlement.dadMessage });
          return;
        }
      }
      await this.proxyExactGameRpc(
        res,
        gameId,
        'scout.bootstrap.v1',
        rpcMethod,
        { gameId },
        (raw) => {
          const result = raw as { success?: unknown; code?: unknown; message?: unknown; status?: unknown };
          const status = shapeScoutBootstrapStatus(result.status);
          return {
            success: result.success === true,
            gameId,
            ...(typeof result.code === 'string' ? { code: result.code.slice(0, 40) } : {}),
            ...(typeof result.message === 'string' ? { message: result.message.slice(0, 300) } : {}),
            ...(status ? { status } : {})
          };
        }
      );
      // C8: a Scout Roster Refresh run (Q3 name) and its coarse outcome — nothing else.
      if (action === 'authorize' || action === 'refresh') {
        this.emitProduct({ name: 'scout.maintenance_run', surface: 'desktop', capability: 'scout.maintenance', outcome: res.statusCode >= 200 && res.statusCode < 300 ? 'ok' : 'failed' });
      }
      return;
    }

    // R7: Dev-only, read-only routing intelligence (scorecards, shadow report, follow-up attributions).
    // A pure projection of the existing Film + R3/R5; it persists nothing and recomputes nothing new.
    if (method === 'GET' && requestUrl.pathname === '/api/routing/intelligence') {
      if (!this.getPreferences().devMode) {
        this.sendJson(res, 404, { success: false, message: 'Routing intelligence is available only in Dev Mode.' });
        return;
      }
      this.sendJson(res, 200, {
        success: true,
        ...buildRoutingIntelligenceView(this.routingFilm.events(), this.routingPriorPack(), Date.now(), PROVIDER_PREFERENCE)
      });
      return;
    }

    // R7: an explicit Coach attribution correction. Appends one `source: 'coach'`, high-confidence
    // event through the R5 authority; history is never edited. The only R7 write.
    if (method === 'POST' && requestUrl.pathname === '/api/routing/attribution') {
      if (!this.getPreferences().devMode) {
        this.sendJson(res, 404, { success: false, message: 'Attribution correction is available only in Dev Mode.' });
        return;
      }
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const clientRef = typeof body.clientRef === 'string' ? body.clientRef : '';
      const cause = typeof body.cause === 'string' ? body.cause : '';
      if (!clientRef || !(FIX_CAUSES as readonly string[]).includes(cause)) {
        this.sendJson(res, 400, { success: false, message: 'A follow-up and a valid cause are required.' });
        return;
      }
      const events = this.routingFilm.events();
      const link = events.find((event) => event.kind === 'link' && event.clientRef === clientRef);
      if (!link || link.kind !== 'link') {
        this.sendJson(res, 404, { success: false, message: 'That Play has no proven parent, so there is nothing to attribute.' });
        return;
      }
      const current = effectiveAttributions(events).get(clientRef);
      if (current && current.source === 'coach' && current.cause === cause) {
        this.sendJson(res, 200, { success: true, unchanged: true, cause });
        return;
      }
      const written = this.routingFilm.recordAttribution(coachAttributionEvent({
        clientRef, parentClientRef: link.parentClientRef, gameId: link.gameId, cause: cause as (typeof FIX_CAUSES)[number], at: Date.now()
      }));
      if (!written) {
        this.sendJson(res, 500, { success: false, message: 'The correction could not be saved.' });
        return;
      }
      settleResolutions(this.routingFilm, Date.now());
      this.filmIndexCache = undefined;
      this.calibrationCache = undefined;
      this.sendJson(res, 200, { success: true, cause });
      return;
    }

    // S57.2 C7: read-only Dev preview of the local telemetry outbox. Local-only by route policy;
    // the visual surface belongs to C9. Nothing here sends anything anywhere.
    if (method === 'GET' && requestUrl.pathname === '/api/telemetry/preview') {
      if (!this.getPreferences().devMode) {
        this.sendJson(res, 404, { success: false, message: 'Telemetry preview is available only in Dev Mode.' });
        return;
      }
      const pending = this.telemetryOutbox.pending();
      this.sendJson(res, 200, {
        success: true,
        consent: this.telemetryOutbox.consent(),
        transport: this.telemetryOutbox.transportKind,
        pending: pending.length,
        events: pending.slice(-50)
      });
      return;
    }

    if (requestUrl.pathname === '/api/scout/formation-receivers' || requestUrl.pathname === '/api/scout/formation-run') {
      if (!this.getPreferences().devMode) {
        this.sendJson(res, 404, { success: false, message: 'Scout Formation operator is available only in Dev Mode.' });
        return;
      }
      const isList = requestUrl.pathname.endsWith('formation-receivers');
      if ((isList && method !== 'GET') || (!isList && method !== 'POST')) {
        this.sendJson(res, 405, { success: false, message: 'Method not allowed.' });
        return;
      }
      // COMMERCIAL GATE: scout.play for a run. Dev Mode above is presentation, not entitlement;
      // listing READY receivers is a read and stays ungated.
      if (!isList) {
        const scoutEntitlement = this.featureGate.check('scout.play');
        if (!scoutEntitlement.allowed) {
          this.recordRefusal(scoutEntitlement);
          this.sendJson(res, 403, { success: false, code: 'capability-unavailable', capability: 'scout.play', message: scoutEntitlement.dadMessage });
          return;
        }
      }
      const body = isList ? {} : (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = isList
        ? (requestUrl.searchParams.get('gameId') ?? '').trim()
        : (typeof body.gameId === 'string' ? body.gameId.trim() : '');
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      await this.proxyExactGameRpc(
        res,
        gameId,
        'scout.formation-operator.v1',
        isList ? 'scout.formation.receivers' : 'scout.formation.run',
        isList ? { gameId } : {
          gameId,
          receiverId: typeof body.receiverId === 'string' ? body.receiverId : '',
          objective: typeof body.objective === 'string' ? body.objective : ''
        },
        (raw) => {
          const result = raw as Record<string, unknown>;
          return {
            success: result.success === true,
            gameId,
            ...(Array.isArray(result.receivers) ? { receivers: result.receivers } : {}),
            ...(typeof result.receiverId === 'string' ? { receiverId: result.receiverId } : {}),
            ...(typeof result.clientRef === 'string' ? { clientRef: result.clientRef } : {}),
            ...(typeof result.message === 'string' ? { message: result.message } : {})
          };
        }
      );
      return;
    }

    // Human-owned preferences. Dev Mode reveals observability/configuration only;
    // it never changes how a Play runs.
    if (requestUrl.pathname === '/api/preferences') {
      if (method === 'GET') {
        this.sendJson(res, 200, { success: true, preferences: this.getPreferences() });
        return;
      }
      if (method === 'POST') {
        const body = (await this.readJsonBody(req)) as Record<string, unknown>;
        const hasRunningPlayers = Object.prototype.hasOwnProperty.call(body, 'runningPlayers');
        const hasDevMode = Object.prototype.hasOwnProperty.call(body, 'devMode');
        const hasLiveConsole = Object.prototype.hasOwnProperty.call(body, 'livePlayerConsole');
        const hasAdvancedDiscovery = Object.prototype.hasOwnProperty.call(body, 'advancedPlayerDiscovery');
        const hasRemoteSensitiveTerminalOutput = Object.prototype.hasOwnProperty.call(body, 'remoteSensitiveTerminalOutput');
        const hasRemoteAccess = Object.prototype.hasOwnProperty.call(body, 'remoteAccess');
        const hasTerminalRetention = Object.prototype.hasOwnProperty.call(body, 'terminalRetention');
        const hasTimeFormat = Object.prototype.hasOwnProperty.call(body, 'timeFormat');
        const hasAiUsageRefreshMinutes = Object.prototype.hasOwnProperty.call(body, 'aiUsageRefreshMinutes');
        const hasAiScoreboardPlacement = Object.prototype.hasOwnProperty.call(body, 'aiScoreboardPlacement');
        const hasAiScoreboardDefaultExpanded = Object.prototype.hasOwnProperty.call(body, 'aiScoreboardDefaultExpanded');
        const hasAiScoreboardPercentMode = Object.prototype.hasOwnProperty.call(body, 'aiScoreboardPercentMode');
        const hasAiScoreboardResetMode = Object.prototype.hasOwnProperty.call(body, 'aiScoreboardResetMode');
        const hasAiScoreboardDensity = Object.prototype.hasOwnProperty.call(body, 'aiScoreboardDensity');
        const hasAiScoreboardResetMarker = Object.prototype.hasOwnProperty.call(body, 'aiScoreboardResetMarker');
        const hasAiScoreboardShowOnMobileLiveTerminal = Object.prototype.hasOwnProperty.call(body, 'aiScoreboardShowOnMobileLiveTerminal');
        const hasAlarms = Object.prototype.hasOwnProperty.call(body, 'alarms');
        const hasProductTelemetry = Object.prototype.hasOwnProperty.call(body, 'productTelemetry');
        const hasAnyAiScoreboardField = hasAiUsageRefreshMinutes || hasAiScoreboardPlacement || hasAiScoreboardDefaultExpanded
          || hasAiScoreboardPercentMode || hasAiScoreboardResetMode || hasAiScoreboardDensity || hasAiScoreboardResetMarker
          || hasAiScoreboardShowOnMobileLiveTerminal;
        if (!hasRunningPlayers && !hasDevMode && !hasLiveConsole && !hasAdvancedDiscovery && !hasRemoteSensitiveTerminalOutput && !hasRemoteAccess && !hasTerminalRetention && !hasTimeFormat && !hasAnyAiScoreboardField && !hasAlarms && !hasProductTelemetry) {
          this.sendJson(res, 400, { success: false, message: 'Choose a preference to update.' });
          return;
        }
        if (hasAiUsageRefreshMinutes && !isAiUsageRefreshMinutes(body.aiUsageRefreshMinutes)) {
          this.sendJson(res, 400, { success: false, message: 'Choose 3, 5, 10, or 15 minutes.' });
          return;
        }
        if (hasAiScoreboardPlacement && !isAiScoreboardPlacement(body.aiScoreboardPlacement)) {
          this.sendJson(res, 400, { success: false, message: 'Choose Top or Bottom.' });
          return;
        }
        if (hasAiScoreboardDefaultExpanded && typeof body.aiScoreboardDefaultExpanded !== 'boolean') {
          this.sendJson(res, 400, { success: false, message: 'Default state must be Collapsed or Expanded.' });
          return;
        }
        if (hasAiScoreboardPercentMode && !isAiScoreboardPercentMode(body.aiScoreboardPercentMode)) {
          this.sendJson(res, 400, { success: false, message: 'Choose % Left, % Used, or Both.' });
          return;
        }
        if (hasAiScoreboardResetMode && !isAiScoreboardResetMode(body.aiScoreboardResetMode)) {
          this.sendJson(res, 400, { success: false, message: 'Choose Absolute, Countdown, or Both.' });
          return;
        }
        if (hasAiScoreboardDensity && !isAiScoreboardDensity(body.aiScoreboardDensity)) {
          this.sendJson(res, 400, { success: false, message: 'Choose Standard or Tight.' });
          return;
        }
        if (hasAiScoreboardResetMarker && !isAiScoreboardResetMarker(body.aiScoreboardResetMarker)) {
          this.sendJson(res, 400, { success: false, message: 'Choose Plain Separator or Reset Icon.' });
          return;
        }
        if (hasAiScoreboardShowOnMobileLiveTerminal && typeof body.aiScoreboardShowOnMobileLiveTerminal !== 'boolean') {
          this.sendJson(res, 400, { success: false, message: 'Show on Mobile Live Terminal must be on or off.' });
          return;
        }
        if (hasAlarms && !isAlarmPreferences(body.alarms)) {
          this.sendJson(res, 400, { success: false, message: 'AI Usage Alarm preferences are invalid.' });
          return;
        }
        if (hasProductTelemetry && !isProductTelemetryPreference(body.productTelemetry)) {
          this.sendJson(res, 400, { success: false, message: 'Product usage telemetry must be on or off.' });
          return;
        }
        if (hasTimeFormat && !isTimeFormatPreference(body.timeFormat)) {
          this.sendJson(res, 400, { success: false, message: 'Choose 12-hour or 24-hour.' });
          return;
        }
        if (hasTerminalRetention && !isTerminalRetention(body.terminalRetention)) {
          this.sendJson(res, 400, { success: false, message: 'Choose 30 seconds, 5 minutes, 30 minutes, or Until Dismissed.' });
          return;
        }
        if (hasAdvancedDiscovery && typeof body.advancedPlayerDiscovery !== 'boolean') {
          this.sendJson(res, 400, { success: false, message: 'Advanced Player Discovery must be on or off.' });
          return;
        }
        const remoteAccessBody = body.remoteAccess as { enabled?: unknown } | null | undefined;
        if (hasRemoteAccess && (!remoteAccessBody || typeof remoteAccessBody !== 'object' || typeof remoteAccessBody.enabled !== 'boolean')) {
          this.sendJson(res, 400, { success: false, message: 'Remote Access must be on or off.' });
          return;
        }
        if (hasRemoteSensitiveTerminalOutput && typeof body.remoteSensitiveTerminalOutput !== 'boolean') {
          this.sendJson(res, 400, { success: false, message: 'Sensitive remote terminal output must be on or off.' });
          return;
        }
        if (hasLiveConsole && typeof body.livePlayerConsole !== 'boolean') {
          this.sendJson(res, 400, { success: false, message: 'Live Player Console must be on or off.' });
          return;
        }
        if (hasRunningPlayers && !isRunningPlayersPreference(body.runningPlayers)) {
          this.sendJson(res, 400, { success: false, message: 'Choose Ask me, Automatically add, or Ignore.' });
          return;
        }
        if (hasDevMode && typeof body.devMode !== 'boolean') {
          this.sendJson(res, 400, { success: false, message: 'Dev Mode must be on or off.' });
          return;
        }
        const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
        if (hasDevMode && !gameId) {
          this.sendJson(res, 400, { success: false, message: 'Missing gameId for Dev Mode.' });
          return;
        }
        if (hasDevMode && !this.knowsRoutineGame(gameId)) {
          this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
          return;
        }
        const previous = this.getPreferences();
        const preferences = this.savePreferences({
          ...previous,
          ...(hasRunningPlayers ? { runningPlayers: body.runningPlayers as CoachPreferences['runningPlayers'] } : {}),
          ...(hasDevMode ? { devMode: body.devMode as boolean } : {}),
          ...(hasLiveConsole ? { livePlayerConsole: body.livePlayerConsole as boolean } : {}),
          ...(hasAdvancedDiscovery ? { advancedPlayerDiscovery: body.advancedPlayerDiscovery as boolean } : {}),
          ...(hasRemoteSensitiveTerminalOutput ? { remoteSensitiveTerminalOutput: body.remoteSensitiveTerminalOutput as boolean } : {}),
          ...(hasRemoteAccess ? { remoteAccess: { enabled: remoteAccessBody?.enabled === true } } : {}),
          ...(hasTerminalRetention ? { terminalRetention: body.terminalRetention as CoachPreferences['terminalRetention'] } : {}),
          ...(hasTimeFormat ? { timeFormat: body.timeFormat as CoachPreferences['timeFormat'] } : {}),
          ...(hasAiUsageRefreshMinutes ? { aiUsageRefreshMinutes: body.aiUsageRefreshMinutes as CoachPreferences['aiUsageRefreshMinutes'] } : {}),
          ...(hasAiScoreboardPlacement ? { aiScoreboardPlacement: body.aiScoreboardPlacement as CoachPreferences['aiScoreboardPlacement'] } : {}),
          ...(hasAiScoreboardDefaultExpanded ? { aiScoreboardDefaultExpanded: body.aiScoreboardDefaultExpanded as boolean } : {}),
          ...(hasAiScoreboardPercentMode ? { aiScoreboardPercentMode: body.aiScoreboardPercentMode as CoachPreferences['aiScoreboardPercentMode'] } : {}),
          ...(hasAiScoreboardResetMode ? { aiScoreboardResetMode: body.aiScoreboardResetMode as CoachPreferences['aiScoreboardResetMode'] } : {}),
          ...(hasAiScoreboardDensity ? { aiScoreboardDensity: body.aiScoreboardDensity as CoachPreferences['aiScoreboardDensity'] } : {}),
          ...(hasAiScoreboardResetMarker ? { aiScoreboardResetMarker: body.aiScoreboardResetMarker as CoachPreferences['aiScoreboardResetMarker'] } : {}),
          ...(hasAiScoreboardShowOnMobileLiveTerminal ? { aiScoreboardShowOnMobileLiveTerminal: body.aiScoreboardShowOnMobileLiveTerminal as boolean } : {}),
          ...(hasAlarms ? { alarms: body.alarms as CoachPreferences['alarms'] } : {}),
          ...(hasProductTelemetry ? { productTelemetry: body.productTelemetry as CoachPreferences['productTelemetry'] } : {})
        });
        // C9 (Q7): opting out discards anything still waiting in the local outbox.
        if (hasProductTelemetry && preferences.productTelemetry === 'off') this.telemetryOutbox.discardPending();
        if (hasRemoteAccess && previous.remoteAccess?.enabled !== true && preferences.remoteAccess?.enabled === true) {
          this.emitProduct({ name: 'remote.enabled', surface: 'desktop', capability: 'remote.access' });
        }
        if (hasDevMode && !previous.devMode && preferences.devMode) this.routines.initializeDevModeDefaults(gameId);
        // Turning the feature (or its Dev Mode gate) off discards retained activity.
        if (!(preferences.devMode && preferences.livePlayerConsole)) this.playerActivity.clear();
        // The ONE global reader adopts the new cadence; no second reader is ever created.
        if (hasAiUsageRefreshMinutes) this.claudeUsageReader?.setCadenceMinutes(preferences.aiUsageRefreshMinutes);
        // S57.39: Dad's "Refresh every" is AI usage in general — Codex honours it too.
        if (hasAiUsageRefreshMinutes) this.codexUsageReader?.setCadenceMinutes(preferences.aiUsageRefreshMinutes);
        // A new stale threshold moves every staleAfter: re-arm healing and re-project freshness.
        if (hasAlarms && previous.alarms?.maxStaleAgeMinutes !== preferences.alarms.maxStaleAgeMinutes) {
          const health = this.healthAuthority.getSnapshot();
          this.usageFreshness?.rearm(health, preferences.alarms.maxStaleAgeMinutes);
          this.broadcast('ai-health', this.projectAiHealth(health));
        }
        if (hasRemoteAccess) {
          this.checkIdleTimeout();
          await this.syncRelayClient();
        }
        this.broadcastStatus();
        const message = hasProductTelemetry
          ? (preferences.productTelemetry === 'on' ? 'Product usage telemetry is on.' : 'Product usage telemetry is off.')
          : hasRemoteAccess
          ? (preferences.remoteAccess?.enabled ? 'Remote Access is on.' : 'Remote Access is off.')
          : hasDevMode
          ? (preferences.devMode ? 'Dev Mode is on. Coach Routines are available.' : 'Dev Mode is off. Coach Routines are paused.')
          : hasLiveConsole
            ? (preferences.livePlayerConsole ? 'Live Player Console is on.' : 'Live Player Console is off.')
            : hasAdvancedDiscovery
              ? (preferences.advancedPlayerDiscovery ? 'Advanced Player Discovery is on.' : 'Advanced Player Discovery is off.')
              : hasRemoteSensitiveTerminalOutput
                ? (preferences.remoteSensitiveTerminalOutput ? 'Sensitive terminal output is allowed on paired devices.' : 'Remote terminal output will be redacted.')
              : hasTerminalRetention
                ? 'Terminal Success Retention saved.'
                : hasTimeFormat
                  ? 'Time format saved.'
                  : hasAiUsageRefreshMinutes
                    ? 'AI Usage Refresh Frequency saved.'
                    : hasAnyAiScoreboardField
                      ? 'AI Usage Scoreboard setting saved.'
                      : hasAlarms
                        ? 'AI Usage Alarm preferences saved.'
                      : RUNNING_PLAYERS_SAVED[preferences.runningPlayers];
        this.sendJson(res, 200, { success: true, preferences, message, routines: this.projectRoutines(gameId || this.registry.getSelectedGameId()) });
        return;
      }
    }

    if (method === 'POST' && requestUrl.pathname === '/api/players/adopt') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      await this.forwardPlayerLifecycle(res, 'player.adopt', { shellPid: Number(body.shellPid) });
      return;
    }

    // Deliberate adoption of one open human terminal as a Terminal Player (never automatic).
    if (method === 'POST' && requestUrl.pathname === '/api/players/adopt-terminal') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      await this.forwardPlayerLifecycle(res, 'player.adoptTerminal', { shellPid: Number(body.shellPid) });
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/players/helper-terminal') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      await this.forwardPlayerLifecycle(res, 'player.helperTerminal', {
        playerType: typeof body.playerType === 'string' ? body.playerType : '',
        purpose: body.purpose === 'authenticate' ? 'authenticate' : 'install'
      });
      return;
    }

    // /api/players/instance/:instanceId/{field|bench|remove|send}
    if (method === 'POST' && requestUrl.pathname.startsWith('/api/players/instance/')) {
      const parts = requestUrl.pathname.split('/');
      if (parts.length === 6) {
        const instanceId = decodeURIComponent(parts[4]);
        const verb = parts[5];
        if (verb === 'field') {
          await this.forwardPlayerLifecycle(res, 'player.putOnField', { playerInstanceId: instanceId });
          return;
        }
        if (verb === 'bench') {
          await this.forwardPlayerLifecycle(res, 'player.takeOffField', { playerInstanceId: instanceId });
          return;
        }
        if (verb === 'remove') {
          await this.forwardPlayerLifecycle(res, 'player.remove', { playerInstanceId: instanceId });
          return;
        }
        if (verb === 'send') {
          const body = (await this.readJsonBody(req)) as Record<string, unknown>;
          await this.forwardPlayerLifecycle(res, 'player.terminalSend', {
            playerInstanceId: instanceId,
            text: typeof body.text === 'string' ? body.text : '',
            enter: body.enter !== false
          });
          return;
        }
      }
    }

    // Refresh capabilities
    if (method === 'POST' && requestUrl.pathname === '/api/capabilities/refresh') {
      const selectedGameId = this.registry.getSelectedGameId();
      const auth = this.registry.getAuthoritativeSessionForGame(selectedGameId);
      if (auth.status !== 'connected' || !auth.session) {
        this.sendJson(res, 400, { success: false, message: auth.error || 'Game is offline.' });
        return;
      }

      try {
        const result = await this.sendRpcToStadium(auth.session, 'capability.refresh', {
          gameId: selectedGameId
        });
        this.sendJson(res, 200, { success: true, result });
        return;
      } catch (err) {
        this.sendJson(res, 500, { success: false, message: err instanceof Error ? err.message : String(err) });
        return;
      }
    }

    this.sendJson(res, 404, { success: false, message: `Unknown endpoint: ${requestUrl.pathname}` });
  }

  /**
   * Pick a Stadium that can perform a UI-bearing mechanic for us.
   *
   * Preference order matters: the selected Game's own window first, so a picker
   * or a new window appears where the human is already looking.
   */
  /**
   * The Stadium that performs Add Game's mechanics (picker, adoption, window open).
   *
   * Those mechanics run in whatever code that Stadium LOADED, not what is on disk.
   * A Stadium reporting a build other than the current one is known-stale and may
   * lack launch or identity repairs (field evidence: Add Game served by a pre-fix
   * GS3 host stayed Opening while a current Stadium was connected). So the selected
   * Game's Stadium is used unless it is known-stale and a current one exists.
   * Unknown builds never cause a switch.
   */
  private pickHostSession(): { session: StadiumSession; freshness: 'current' | 'stale' | 'unknown' } | undefined {
    const expected = this.currentExtensionBuildId();
    const freshness = (s: StadiumSession): 'current' | 'stale' | 'unknown' =>
      !expected || !s.extensionBuildId || s.extensionBuildId === 'unknown' ? 'unknown' : s.extensionBuildId === expected ? 'current' : 'stale';
    const live = this.registry.getAllSessions().filter((candidate) => candidate.socket.readyState === 1);
    const selected = this.registry.getAuthoritativeSessionForGame(this.registry.getSelectedGameId()).session;
    const current = live.find((candidate) => freshness(candidate) === 'current');

    const session = selected && (freshness(selected) !== 'stale' || !current) ? selected : current ?? selected ?? live[0];
    return session ? { session, freshness: freshness(session) } : undefined;
  }

  private currentExtensionBuildId(): string | undefined {
    try { return computeControlPlaneBuild(this.extensionEntryPath).buildId; } catch { return undefined; }
  }

  private async handleAddGame(res: http.ServerResponse): Promise<void> {
    if (this.addGameInProgress) {
      this.sendJson(res, 409, {
        success: false,
        status: 'picker-open',
        message: 'The repository picker is already open. Finish or cancel it before trying Add Game again.'
      });
      return;
    }

    this.addGameInProgress = true;
    try {
      await this.runAddGame(res);
    } finally {
      this.addGameInProgress = false;
    }
  }

  private async runAddGame(res: http.ServerResponse): Promise<void> {
    // C5 (Q5): at the active-Game ceiling, say so before the picker opens. (Picking a Game that
    // already holds a slot never needs Add Game; it is selected from the Sideline instead.)
    const slots = this.featureGate.check('games.active');
    if (!slots.allowed) {
      this.recordRefusal(slots);
      this.sendJson(res, 403, { success: false, status: 'capability-unavailable', capability: 'games.active', message: slots.dadMessage });
      return;
    }
    const chosen = this.pickHostSession();
    if (!chosen) {
      this.sendJson(res, 400, {
        success: false,
        message: 'No Game window is connected yet, so Coach has nowhere to show the repository picker. Open a Game first.'
      });
      return;
    }
    const host = chosen.session;

    let picked: GamePickResult;
    const pickerStartedAt = Date.now();
    this.log(`Add Game: repository picker requested from ${host.instanceId} (serving build ${chosen.freshness})`);
    try {
      picked = (await this.sendRpcToStadium(
        host,
        'game.pick',
        {},
        this.humanInteractionRpcTimeoutMs
      )) as GamePickResult;
    } catch (err) {
      this.log(`Add Game: repository picker failed after ${Date.now() - pickerStartedAt}ms: ${err instanceof Error ? err.message : String(err)}`);
      this.sendJson(res, 500, {
        success: false,
        message: `Coach could not open the repository picker. ${err instanceof Error ? err.message : String(err)}`
      });
      return;
    }

    this.log(`Add Game: repository picker resolved after ${Date.now() - pickerStartedAt}ms (${picked?.cancelled ? 'cancelled' : picked?.success ? 'selected' : 'unresolved'})`);

    if (picked?.cancelled) {
      this.sendJson(res, 200, { success: true, status: 'cancelled', message: 'No repository chosen.' });
      return;
    }
    if (!picked?.success || !picked.game || !picked.folderPath) {
      this.sendJson(res, 400, {
        success: false,
        status: 'unresolved',
        message: picked?.message ?? 'Coach could not identify a Game in that folder.'
      });
      return;
    }

    // COMMERCIAL GATE (C5, Q5): completing Add Game admits the chosen Game (idempotent when it
    // already holds a slot). Refused → nothing is registered or opened.
    const gameEntitlement = this.admitGame(picked.game.gameId);
    if (!gameEntitlement.allowed) {
      this.sendJson(res, 403, { success: false, status: 'capability-unavailable', capability: 'games.active', message: gameEntitlement.dadMessage });
      return;
    }

    // Register before deciding, so an Offline or Opening Game is a Game Coach knows.
    this.registry.recordKnownGameFromPicker(picked.game, picked.folderPath);
    this.log(`Add Game: registered ${picked.game.displayName} (${picked.game.gameId}) from picker result`);

    const decision = decideAddGame({
      gameId: picked.game.gameId,
      folderPath: picked.folderPath,
      state: this.registry.getGameState(picked.game.gameId)
    });

    switch (decision.kind) {
      case 'select-existing': {
        this.registry.setSelectedGameId(decision.gameId);
        this.broadcastStatus();
        this.sendJson(res, 200, {
          success: true,
          status: 'connected',
          gameId: decision.gameId,
          message: `${picked.game.displayName} is already connected. Coach switched to it.`
        });
        return;
      }
      case 'already-opening': {
        this.sendJson(res, 200, {
          success: true,
          status: 'opening',
          gameId: decision.gameId,
          message: `${picked.game.displayName} is already opening…`
        });
        return;
      }
      case 'conflicted': {
        this.sendJson(res, 409, { success: false, status: 'conflicted', gameId: decision.gameId, message: decision.message });
        return;
      }
      case 'unresolved': {
        this.sendJson(res, 400, { success: false, status: 'unresolved', message: decision.message });
        return;
      }
      default:
        break;
    }

    this.registry.markOpening(decision.gameId);
    this.registry.setSelectedGameId(decision.gameId);
    this.broadcastStatus();
    this.log(`Add Game: published Opening status for ${picked.game.displayName} (${decision.gameId})`);

    let opened: GameOpenResult;
    try {
      opened = (await this.sendRpcToStadium(host, 'game.open', {
        gameId: decision.gameId,
        folderPath: decision.folderPath,
        displayName: picked.game.displayName
      })) as GameOpenResult;
    } catch (err) {
      this.registry.clearOpening(decision.gameId);
      this.broadcastStatus();
      this.sendJson(res, 500, {
        success: false,
        status: 'failed',
        message: `Coach could not open this Game. ${err instanceof Error ? err.message : String(err)}`
      });
      return;
    }

    if (!opened?.success) {
      this.registry.clearOpening(decision.gameId);
      this.broadcastStatus();
      this.sendJson(res, 400, {
        success: false,
        status: 'failed',
        gameId: decision.gameId,
        message: opened?.message ?? 'Coach could not open this Game.'
      });
      return;
    }

    this.log(`Add Game: opening ${picked.game.displayName} (${decision.gameId}) from ${decision.folderPath} via ${host.instanceId}`);
    this.sendJson(res, 200, {
      success: true,
      status: 'opening',
      gameId: decision.gameId,
      message: opened.message ?? `Opening ${picked.game.displayName}…`
    });
  }

  /** Forward a Player lifecycle RPC to the selected Game's authoritative window. */
  private readonly discoveryByGame = new Map<string, unknown>();
  private preferencesCache: CoachPreferences | undefined;

  private getPreferences(): CoachPreferences {
    if (!this.preferencesCache) this.preferencesCache = loadPreferences(path.join(this.dir, 'preferences.json'));
    return this.preferencesCache;
  }

  private savePreferences(next: CoachPreferences): CoachPreferences {
    savePreferences(path.join(this.dir, 'preferences.json'), next);
    this.preferencesCache = next;
    return next;
  }

  private knowsRoutineGame(gameId: string): boolean {
    return Boolean(gameId && (this.registry.getKnownGame(gameId) || this.routines.hasGame(gameId)));
  }

  /** R13 S5 remote projection: no localUrl, clientUrl, port, loopback flag or Stadium id ever leaves the host. */
  private async openRemotePreview(res: http.ServerResponse, deviceId: string, gameId: string, staticEntrypoint?: string): Promise<void> {
    const notEligible = (): void => this.sendJson(res, 200, { success: true, gameId, available: false, endpoints: [], reason: 'remote-viewer' });
    if (!this.registry.getKnownGame(gameId)) {
      this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
      return;
    }
    const auth = this.registry.getAuthoritativeSessionForGame(gameId);
    if (auth.status !== 'connected' || !auth.session) {
      this.sendJson(res, 409, { success: false, status: 'offline', message: "That Game's Stadium is not connected." });
      return;
    }
    const features = auth.session.features ?? [];
    if (!features.includes('game.preview.v1') || !features.includes(STADIUM_REMOTE_PREVIEW_FEATURE) || !this.remotePreviewGateway.isAvailable(gameId)) {
      notEligible();
      return;
    }
    let projected: Record<string, unknown>;
    try {
      const raw = await this.sendRpcToStadium(auth.session, 'game.preview.resolve', { gameId, ...(staticEntrypoint ? { staticEntrypoint } : {}) }) as { gameId?: unknown };
      if (raw?.gameId !== gameId) {
        this.sendJson(res, 502, { success: false, message: 'Stadium returned data for a different Game.' });
        return;
      }
      projected = projectPreviewResolution(gameId, raw);
    } catch (error) {
      this.sendJson(res, 502, { success: false, message: `game.preview.resolve failed. ${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    if (projected.available !== true) {
      this.sendJson(res, 200, projected);
      return;
    }
    const endpoints = Array.isArray(projected.endpoints) ? projected.endpoints as Array<Record<string, unknown>> : [];
    const endpoint = endpoints.find((candidate) => candidate.primary === true) ?? endpoints[0];
    const pages = endpoint && Array.isArray(endpoint.pages) ? endpoint.pages as Array<Record<string, unknown>> : [];
    const primaryPage = pages.find((page) => page.primary === true);
    if (!endpoint || endpoint.source !== 'static' || typeof primaryPage?.path !== 'string') {
      notEligible();
      return;
    }
    const minted = await this.remotePreviewGateway.mint({ deviceId, gameId, pagePath: primaryPage.path });
    if (!minted.ok) {
      notEligible();
      return;
    }
    this.sendJson(res, 200, {
      success: true,
      gameId,
      available: true,
      endpoints: [{
        previewId: `remote:${crypto.createHash('sha256').update(String(endpoint.previewId)).digest('hex').slice(0, 16)}`,
        gameId,
        source: 'static',
        ownership: endpoint.ownership,
        primary: true,
        ...(typeof endpoint.label === 'string' ? { label: endpoint.label } : {}),
        observedAt: endpoint.observedAt,
        remote: { frameUrl: minted.frameUrl, openUrl: minted.openUrl, expiresAt: minted.expiresAt },
        pages: pages.map((page) => ({ path: page.path, label: page.label, primary: page.primary === true, remoteUrl: minted.pageUrl(String(page.path)) }))
      }]
    });
  }

  private async proxyExactGameRpc<T>(
    res: http.ServerResponse,
    gameId: string,
    requiredFeature: string,
    method: string,
    params: unknown,
    shape: (result: unknown) => T
  ): Promise<void> {
    if (!this.registry.getKnownGame(gameId)) {
      this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
      return;
    }
    const auth = this.registry.getAuthoritativeSessionForGame(gameId);
    if (auth.status !== 'connected' || !auth.session) {
      this.sendJson(res, 409, { success: false, status: 'offline', message: auth.error || "That Game's Stadium is not connected." });
      return;
    }
    if (!auth.session.features?.includes(requiredFeature)) {
      this.sendJson(res, 409, {
        success: false,
        status: 'unsupported',
        message: `That Game's Stadium does not support ${requiredFeature}. Reload or update the Stadium.`
      });
      return;
    }
    try {
      const result = await this.sendRpcToStadium(auth.session, method, params) as { gameId?: unknown };
      if (result?.gameId !== gameId) {
        this.sendJson(res, 502, { success: false, message: 'Stadium returned data for a different Game.' });
        return;
      }
      this.sendJson(res, 200, shape(result));
    } catch (error) {
      this.sendJson(res, 502, { success: false, message: `${method} failed. ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  /**
   * S57.39 browser projection of AI health: the raw facts plus derived, never-persisted
   * `freshness` from the ONE canonical rule. The browser compares `staleAfter` to its clock
   * and never re-derives staleness from maxStaleAgeMinutes.
   */
  private projectAiHealth(snapshot: HealthAuthoritySnapshot): HealthAuthoritySnapshot & { freshness: Record<string, unknown> } {
    const now = new Date();
    const maxStale = this.getPreferences().alarms.maxStaleAgeMinutes;
    const freshness: Record<string, unknown> = {};
    for (const provider of ['claude', 'codex'] as const) {
      const state = snapshot.providers[provider];
      if (state) freshness[provider] = providerFreshness(state, now, maxStale);
    }
    return { ...snapshot, freshness };
  }

  /**
   * S6 projection. The Dad-facing view carries folder, provenance and attention only;
   * raw evidence stays behind Dev Mode.
   */
  private projectGameFilesystem(gameId: string): Record<string, unknown> {
    const auth = this.registry.getAuthoritativeSessionForGame(gameId);
    const canChange = auth.status === 'connected' && Boolean(auth.session?.features?.includes('game.filesystem.v1'));
    const diagnostics = this.getPreferences().devMode ? this.gameFilesystem.diagnostics(gameId) : undefined;
    return {
      success: true,
      gameId,
      gameSetup: this.gameFilesystem.projection(gameId, canChange),
      ...(diagnostics ? { diagnostics } : {})
    };
  }

  private projectRoutines(gameId: string) {
    const game = this.registry.getKnownGame(gameId);
    const gameView = this.registry.getGames().find((candidate) => candidate.gameId === gameId);
    const auth = this.registry.getAuthoritativeSessionForGame(gameId);
    return this.routines.project(gameId, this.getPreferences().devMode, {
      displayName: game?.displayName,
      repoUri: game?.repoUri,
      rootFsPath: auth.session?.rootFsPath ?? gameView?.rootFsPath
    });
  }

  private sendRoutineValidationError(res: http.ServerResponse, error: unknown): void {
    if (error instanceof RoutineValidationError) {
      this.sendJson(res, 400, { success: false, message: error.message });
      return;
    }
    this.log(`Coach Routine mutation failed: ${error instanceof Error ? error.message : String(error)}`);
    this.sendJson(res, 500, { success: false, message: 'Coach could not save that routine.' });
  }

  private async forwardPlayerLifecycle(
    res: http.ServerResponse,
    method: string,
    params: Record<string, unknown>
  ): Promise<void> {
    const selectedGameId = this.registry.getSelectedGameId();
    const auth = this.registry.getAuthoritativeSessionForGame(selectedGameId);
    if (auth.status !== 'connected' || !auth.session) {
      this.sendJson(res, 400, { success: false, message: auth.error || 'That Game is not connected.' });
      return;
    }

    try {
      // gameId travels with every action so a Player can never be created,
      // benched or removed in a Game other than the selected one.
      const result = (await this.sendRpcToStadium(auth.session, method, {
        ...params,
        gameId: selectedGameId
      })) as PlayerLifecycleResult;
      // Cached per Game: a Player installed on one Stadium says nothing about another.
      // Any lifecycle action that changed discovery truth (a scan, an adoption, the
      // removal of an adopted Player) returns the Stadium's reconciled discovery, so
      // Recruit and Roster converge in one broadcast instead of contradicting.
      if (result?.success && result.discovery) {
        this.discoveryByGame.set(selectedGameId, result.discovery);
      }

      // "Automatically add to my Roster": adopt every running Player found in this
      // Game. Adoption keeps ownership `adopted`, so removal never destroys the
      // human's own process. Players running elsewhere are never adopted.
      let finalResult = result;
      if (method === 'player.discover' && result?.success && this.getPreferences().runningPlayers === 'auto-add') {
        const candidates = (result.discovery as { externalCandidates?: Array<{ shellPid: number; displayName: string }> } | undefined)?.externalCandidates ?? [];
        const added: string[] = [];
        for (const candidate of candidates) {
          const adopted = (await this.sendRpcToStadium(auth.session, 'player.adopt', { shellPid: candidate.shellPid, gameId: selectedGameId })) as PlayerLifecycleResult;
          if (adopted?.success) {
            added.push(candidate.displayName);
            if (adopted.discovery) this.discoveryByGame.set(selectedGameId, adopted.discovery);
          }
        }
        if (added.length) {
          finalResult = {
            ...result,
            discovery: this.discoveryByGame.get(selectedGameId),
            autoAdded: added,
            message: `Added ${added.join(', ')} to your Roster from ${added.length === 1 ? 'its' : 'their'} running terminal${added.length === 1 ? '' : 's'}.`
          };
        }
      }

      if (finalResult?.success) this.broadcastStatus();
      // The cache keeps the truth; the response body gets the same Dad-safe view as status.
      const responseBody = finalResult?.discovery
        ? {
            ...finalResult,
            discovery: projectDiscovery(
              finalResult.discovery as { externalCandidates?: unknown[]; runningElsewhere?: unknown[]; adoptableTerminals?: unknown[] },
              'ask',
              advancedPlayerDiscoveryVisible(this.getPreferences())
            )
          }
        : finalResult;
      this.sendJson(res, finalResult?.success === false ? 400 : 200, responseBody ?? { success: false, message: 'No result.' });
    } catch (err) {
      this.sendJson(res, 500, { success: false, message: err instanceof Error ? err.message : String(err) });
    }
  }

  private async forwardPlayerAction(
    res: http.ServerResponse,
    action: 'field' | 'instance' | 'controlled',
    playerId: string,
    options: { allowDuplicate?: boolean } = {}
  ): Promise<void> {
    const selectedGameId = this.registry.getSelectedGameId();
    const auth = this.registry.getAuthoritativeSessionForGame(selectedGameId);
    if (auth.status !== 'connected' || !auth.session) {
      this.sendJson(res, 400, { success: false, message: auth.error || 'That Game is not connected.' });
      return;
    }
    try {
      let result = (await this.sendRpcToStadium(auth.session, 'player.action', {
        action,
        playerId,
        gameId: selectedGameId,
        allowDuplicate: options.allowDuplicate === true
      })) as PlayerActionResult;

      // The Stadium's duplicate guard scanned afresh; keep Recruit truthful either way.
      if (result?.discovery) this.discoveryByGame.set(selectedGameId, result.discovery);

      // Same process already running in this Game + "Automatically add": adopt it
      // rather than starting a second copy. Ownership stays `adopted`.
      const candidate = result?.candidate as { shellPid?: number } | undefined;
      if (result?.code === 'running-in-game' && candidate?.shellPid && this.getPreferences().runningPlayers === 'auto-add') {
        const adopted = (await this.sendRpcToStadium(auth.session, 'player.adopt', { shellPid: candidate.shellPid, gameId: selectedGameId })) as PlayerLifecycleResult;
        if (adopted?.discovery) this.discoveryByGame.set(selectedGameId, adopted.discovery);
        result = adopted as PlayerActionResult;
      }

      if (result?.success || result?.discovery) this.broadcastStatus();
      // A duplicate refusal is a conflict the human resolves, not a server fault.
      const duplicate = result?.code === 'running-in-game' || result?.code === 'running-elsewhere';
      this.sendJson(res, result.success ? 200 : duplicate ? 409 : 400, result);
    } catch (err) {
      this.sendJson(res, 500, { success: false, message: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Push a fresh status to every browser so no manual refresh is ever needed. */
  private broadcastStatus(): void {
    this.broadcast('status', this.buildStatus());
  }

  /** Coalesced canonical execution publication; elapsed clocks never create SSE. */
  private scheduleExecutionBroadcast(gameId: string): void {
    if (!gameId || this.disposed) return;
    this.pendingExecutionGames.add(gameId);
    if (this.executionBroadcastScheduled) return;
    this.executionBroadcastScheduled = true;
    setImmediate(() => {
      this.executionBroadcastScheduled = false;
      if (this.disposed) return;
      for (const pendingGameId of this.pendingExecutionGames) {
        const projection = this.buildExecution(pendingGameId);
        this.broadcast('execution', {
          gameId: projection.gameId,
          epoch: projection.epoch,
          serverNow: projection.serverNow,
          views: Object.values(projection.byInstance)
        });
      }
      this.pendingExecutionGames.clear();
    });
  }

  /** Project only the report-discovery coordinate to this Game's authoritative Stadium. */
  private async applyGameFilesystemContract(contract: GameFilesystemContract | undefined): Promise<boolean> {
    if (!contract) return false;
    const auth = this.registry.getAuthoritativeSessionForGame(contract.gameId);
    if (auth.status !== 'connected' || !auth.session) return false;
    if (!auth.session.features?.includes('game.filesystem.apply.v1')) {
      this.log(`Stadium for ${contract.gameId} does not support game.filesystem.apply; legacy report discovery remains active.`);
      return false;
    }
    try {
      const result = (await this.sendRpcToStadium(auth.session, 'game.filesystem.apply', {
        gameId: contract.gameId,
        revision: contract.revision,
        reports: { path: contract.reports.path, state: contract.reports.state },
        lanes: contract.reports.lanes ?? {}
      })) as GameFilesystemApplyResult;
      if (!result?.success || result.gameId !== contract.gameId || result.revision !== contract.revision) {
        this.log(`Filesystem contract apply was rejected for ${contract.gameId} revision ${contract.revision}.`);
        return false;
      }
      return true;
    } catch (error) {
      this.log(`Filesystem contract apply failed for ${contract.gameId} revision ${contract.revision}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * S8.0: the current roster's stable provider-type keys for exactly one Game
   * (e.g. `Codex`, `Claude`, `AntiGravity`) — never model, instance ID, seat,
   * or a human label. Terminal is excluded: it authors no reports. Multiple
   * instances of the same type collapse to one key, matching one lane.
   */
  private rosterProviderKeys(gameId: string): string[] {
    const roster = this.registry.getRosterForGame(gameId) as Array<{ id?: unknown; name?: unknown; instances?: unknown[] }>;
    const keys: string[] = [];
    for (const entry of roster) {
      if (entry?.id === 'terminal') continue;
      if (!Array.isArray(entry?.instances) || entry.instances.length === 0) continue;
      const key = typeof entry.name === 'string' && entry.name.trim() ? entry.name : undefined;
      if (key && !keys.includes(key)) keys.push(key);
    }
    return keys;
  }

  /**
   * S11.1: the bounded mutation pass. A fresh, safe bootstrap plan creates the
   * Plumbing parent and required Reports/SOP children through the existing S8
   * exact-Game Stadium seam after full preflight. Mature canonical roots only
   * receive missing roster-provider lanes. Never deletes, renames, migrates, or
   * touches an existing lane.
   */
  private async runFilesystemEnsure(
    gameId: string,
    bootstrapPlan?: PlumbingBootstrapPlan,
    freshEvidence = false
  ): Promise<void> {
    const contract = this.gameFilesystem.get(gameId);
    if (!contract) return;

    // A legacy pending value remains loadable, but only fresh evidence may
    // authorize re-creating an already-established legacy Sideline root. A
    // clean old pending value is handled by the fresh S11 bootstrapPlan.
    const legacyRootNeeded = freshEvidence
      && contract.pendingReportsAction === 'create-reports-slc'
      && contract.reports.provenance === 'created'
      && contract.reports.path === CANONICAL_REPORTS_ROOT_NAME
      && contract.reports.state === 'needs-attention'
      && contract.reports.attention?.code === 'missing';
    const rootReady = contract.reports.state === 'ready' && typeof contract.reports.path === 'string';
    if (!bootstrapPlan && !legacyRootNeeded && !rootReady) return;

    // A partial Plumbing workspace is one coherent bootstrap. Do not create
    // lanes beneath Reports while the approved SOP child is unresolved.
    if (!bootstrapPlan && rootReady && isPlumbingReportsPath(contract.reports.path) && contract.sop.state !== 'ready') return;

    const auth = this.registry.getAuthoritativeSessionForGame(gameId);
    if (auth.status !== 'connected' || !auth.session) return;
    if (!auth.session.features?.includes('game.filesystem.ensure.v1')) return;

    const existingLanes = contract.reports.lanes ?? {};
    const missingLanes = this.rosterProviderKeys(gameId).filter((key) => !existingLanes[key]);
    if (!bootstrapPlan && !legacyRootNeeded && missingLanes.length === 0) return;

    const recordLaneResults = (lanes: NonNullable<GameFilesystemEnsureResult['lanes']>, now: string): void => {
      for (const [laneKey, outcome] of Object.entries(lanes ?? {})) {
        if (!outcome || (outcome.state !== 'ready' && outcome.state !== 'needs-attention')) continue;
        this.gameFilesystem.recordLaneEnsured(
          gameId,
          laneKey,
          outcome.folder || laneKey,
          { state: outcome.state, attention: outcome.state === 'needs-attention' ? sanitizeEnsureAttention(outcome.attention) : undefined },
          now
        );
      }
    };

    if (bootstrapPlan) {
      // The new workspace requires an explicit read-only preflight against the
      // same exact Stadium. Older Stadiums may keep mature roots working, but
      // cannot perform the S11 bootstrap until they advertise Game Files check.
      if (!auth.session.features?.includes('game.files.v1')) return;
      const lanePaths = missingLanes.map((lane) => `${bootstrapPlan.reportsPath}/${lane}`);
      const preflightPaths = [
        bootstrapPlan.parentPath,
        bootstrapPlan.reportsPath,
        bootstrapPlan.sopPath,
        ...lanePaths
      ];
      let preflight: GameFilesCheckResult | undefined;
      try {
        preflight = (await this.sendRpcToStadium(auth.session, 'game.files.check', { gameId, paths: preflightPaths })) as GameFilesCheckResult;
      } catch (error) {
        this.log(`Filesystem bootstrap preflight failed for ${gameId}: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      if (!preflight?.success || preflight.gameId !== gameId) return;
      const returnedPaths = new Set((preflight.checks ?? []).map((check) => check.path));
      if (preflightPaths.some((requiredPath) => !returnedPaths.has(requiredPath))) {
        this.log(`Filesystem bootstrap preflight was incomplete for ${gameId}; no mutation authorized.`);
        return;
      }

      const invalid = (preflight.checks ?? []).filter((check) => check.state !== 'folder' && check.state !== 'missing');
      if (invalid.length > 0) {
        const now = new Date().toISOString();
        for (const check of invalid) {
          const attention = {
            code: check.state === 'file' ? 'name-collision' : check.state === 'blocked' ? 'blocked' : 'inaccessible',
            detail: check.path
          } satisfies { code: AttentionCode; detail?: string };
          if (check.path === bootstrapPlan.sopPath) this.gameFilesystem.recordSopRootAttention(gameId, attention, now);
          else if (check.path === bootstrapPlan.parentPath || check.path === bootstrapPlan.reportsPath) {
            this.gameFilesystem.recordReportsRootAttention(gameId, attention, now);
          } else {
            const laneKey = missingLanes.find((lane) => `${bootstrapPlan.reportsPath}/${lane}` === check.path);
            if (laneKey && rootReady) this.gameFilesystem.recordLaneEnsured(gameId, laneKey, laneKey, { state: 'needs-attention', attention }, now);
          }
        }
        const updated = this.gameFilesystem.get(gameId);
        if (updated) await this.applyGameFilesystemContract(updated);
        return;
      }

      const ensureOne = async (folderPath: string): Promise<NonNullable<GameFilesystemEnsureResult['root']> | undefined> => {
        const current = this.gameFilesystem.get(gameId) ?? contract;
        try {
          const result = (await this.sendRpcToStadium(auth.session!, 'game.filesystem.ensure', {
            gameId,
            revision: current.revision,
            root: { name: folderPath }
          })) as GameFilesystemEnsureResult;
          if (!result?.success || result.gameId !== gameId) return undefined;
          return result.root;
        } catch (error) {
          this.log(`Filesystem ensure failed for ${gameId} at ${folderPath}: ${error instanceof Error ? error.message : String(error)}`);
          return undefined;
        }
      };

      const now = new Date().toISOString();
      if (bootstrapPlan.ensureParent) {
        const outcome = await ensureOne(bootstrapPlan.parentPath);
        if (!outcome || outcome.state !== 'ready') {
          this.gameFilesystem.recordReportsRootAttention(
            gameId,
            sanitizeEnsureAttention(outcome?.attention) ?? { code: 'create-failed', detail: bootstrapPlan.parentPath },
            now
          );
          return;
        }
      }
      if (bootstrapPlan.ensureReports) {
        const outcome = await ensureOne(bootstrapPlan.reportsPath);
        if (!outcome || outcome.state !== 'ready') {
          this.gameFilesystem.recordReportsRootAttention(
            gameId,
            sanitizeEnsureAttention(outcome?.attention) ?? { code: 'create-failed', detail: bootstrapPlan.reportsPath },
            now
          );
          return;
        }
        this.gameFilesystem.recordReportsRootCreated(gameId, bootstrapPlan.reportsPath, now);
      }
      if (bootstrapPlan.ensureSop) {
        const outcome = await ensureOne(bootstrapPlan.sopPath);
        if (!outcome || outcome.state !== 'ready') {
          this.gameFilesystem.recordSopRootAttention(
            gameId,
            sanitizeEnsureAttention(outcome?.attention) ?? { code: 'create-failed', detail: bootstrapPlan.sopPath },
            now
          );
          return;
        }
        this.gameFilesystem.recordSopRootCreated(gameId, bootstrapPlan.sopPath, now);
      }

      if (missingLanes.length > 0) {
        const current = this.gameFilesystem.get(gameId) ?? contract;
        try {
          const result = (await this.sendRpcToStadium(auth.session, 'game.filesystem.ensure', {
            gameId,
            revision: current.revision,
            lanesRoot: bootstrapPlan.reportsPath,
            lanes: missingLanes
          })) as GameFilesystemEnsureResult;
          if (result?.success && result.gameId === gameId) recordLaneResults(result.lanes ?? {}, now);
        } catch (error) {
          this.log(`Filesystem lane ensure failed for ${gameId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const updated = this.gameFilesystem.get(gameId);
      if (updated) await this.applyGameFilesystemContract(updated);
      return;
    }

    const request = legacyRootNeeded
      ? { gameId, revision: contract.revision, root: { name: CANONICAL_REPORTS_ROOT_NAME }, lanesRoot: CANONICAL_REPORTS_ROOT_NAME, lanes: missingLanes }
      : { gameId, revision: contract.revision, lanesRoot: contract.reports.path, lanes: missingLanes };

    let result: GameFilesystemEnsureResult | undefined;
    try {
      result = (await this.sendRpcToStadium(auth.session, 'game.filesystem.ensure', request)) as GameFilesystemEnsureResult;
    } catch (error) {
      this.log(`Filesystem ensure failed for ${gameId}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!result?.success || result.gameId !== gameId) return;

    const now = new Date().toISOString();
    if (result.root) {
      if (result.root.state === 'ready') this.gameFilesystem.recordReportsRootCreated(gameId, result.root.name, now);
      else {
        const attention = sanitizeEnsureAttention(result.root.attention);
        if (attention) this.gameFilesystem.recordReportsRootAttention(gameId, attention, now);
      }
    }
    recordLaneResults(result.lanes ?? {}, now);

    const updated = this.gameFilesystem.get(gameId);
    if (updated) await this.applyGameFilesystemContract(updated);
  }

  /**
   * S9.0: the ONE canonical report-destination coordinate — never re-derived
   * from `coach.reportGlobs`, filesystem scanning, prompt text, Player cwd, or
   * the browser-selected Game. `undefined` means "never fabricate a
   * destination"; the Play still dispatches, with provenance only.
   *
   * Reuses the exact same durable `GameFilesystemContract` (`this.gameFilesystem`,
   * the sole owner since S6) and the exact same `game.filesystem.apply.v1`
   * feature-support truth S7's own `applyGameFilesystemContract` already
   * checks — a Stadium that cannot consume the canonical contract is never
   * told its Player write and Incoming's watch scope are aligned, because
   * they are not.
   */
  private resolveCanonicalReportDestination(gameId: string, playerType: string, sessionFeatures: readonly string[]): string | undefined {
    if (!sessionFeatures.includes('game.filesystem.apply.v1')) return undefined;
    const contract = this.gameFilesystem.get(gameId);
    if (!contract || contract.reports.state !== 'ready' || !contract.reports.path) return undefined;
    // Stable provider-type lane key (Codex/Claude/AntiGravity) — the exact same
    // vocabulary rosterProviderKeys()/S8 lane creation already uses. Never
    // model, effort, instance ID, terminal name, or a display label.
    const laneKey = getPlayerAdapter(playerType)?.name;
    if (!laneKey) return undefined;
    const lane = contract.reports.lanes?.[laneKey];
    if (!lane || lane.state !== 'ready') return undefined;
    return `${contract.reports.path}/${lane.folder}/`;
  }

  private sendRpcToStadium(
    session: StadiumSession,
    method: string,
    params: unknown,
    timeoutMs = this.rpcTimeoutMs
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextRpcId++;
      const timer = setTimeout(() => {
        this.pendingRpcRequests.delete(id);
        reject(new Error(`RPC request '${method}' to Stadium timed out.`));
      }, timeoutMs);

      this.pendingRpcRequests.set(id, { resolve, reject, timer, socket: session.socket, method });
      const req = buildRpcRequest(id, method, params);
      try {
        session.socket.send(JSON.stringify(req));
      } catch (err) {
        clearTimeout(timer);
        this.pendingRpcRequests.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private rejectPendingRpcRequests(
    predicate: (pending: { socket: StadiumSession['socket']; method: string }) => boolean,
    message: string
  ): void {
    for (const [id, pending] of this.pendingRpcRequests) {
      if (!predicate(pending)) continue;
      clearTimeout(pending.timer);
      this.pendingRpcRequests.delete(id);
      pending.reject(new Error(`${message} (${pending.method})`));
    }
  }

  /** Test seam to resolve or reject pending RPC requests from mock sessions. */
  handleWsResponseForTest(id: string | number, result: unknown, error?: Error): boolean {
    const pending = this.pendingRpcRequests.get(id);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pendingRpcRequests.delete(id);
    if (error) pending.reject(error);
    else pending.resolve(result);
    return true;
  }

  private handleSseConnection(req: http.IncomingMessage, res: http.ServerResponse, principal: Principal): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const heartbeat = setInterval(() => {
      try { res.write(`: hb ${Date.now()}\n\n`); }
      catch { this.removeSseClient(res); }
    }, 15_000);
    heartbeat.unref();
    this.sseClients.set(res, { principal, heartbeat });
    // C4: a paired phone's open stream is Remote presence (observed, never altered).
    if (principal.kind === 'remote-device') this.remoteMeter.streamOpened(res);

    // Initial sync. `hello` drives the browser's reconnect-convergence path.
    res.write(`event: hello\ndata: ${JSON.stringify({ connected: true, at: Date.now() })}\n\n`);
    res.write(`event: status\ndata: ${JSON.stringify(redactForPrincipal(this.buildStatus(), principal))}\n\n`);
    res.write(`event: ai-health\ndata: ${JSON.stringify(redactForPrincipal(this.projectAiHealth(this.healthAuthority.getSnapshot()), principal))}\n\n`);
    if (principal.kind === 'local-admin') {
      for (const event of this.pendingWebviewAlarms.splice(0)) {
        res.write(`event: ai-alarm\ndata: ${JSON.stringify(event)}\n\n`);
      }
    }
    const execution = this.buildExecution(this.registry.getSelectedGameId());
    res.write(`event: execution\ndata: ${JSON.stringify(redactForPrincipal({
      gameId: execution.gameId,
      epoch: execution.epoch,
      serverNow: execution.serverNow,
      views: Object.values(execution.byInstance)
    }, principal))}\n\n`);

    req.on('close', () => {
      this.removeSseClient(res);
    });
  }

  private removeSseClient(res: http.ServerResponse): void {
    const state = this.sseClients.get(res);
    if (state) clearInterval(state.heartbeat);
    this.sseClients.delete(res);
    if (state?.principal.kind === 'remote-device') this.remoteMeter.streamClosed(res);
  }

  private livePlayerTerminalEnabled(): boolean {
    const preferences = this.getPreferences();
    return Boolean(preferences.devMode && preferences.livePlayerConsole);
  }

  private broadcast(event: string, data: unknown, localOnly = false): void {
    for (const [client, state] of this.sseClients) {
      if (localOnly && state.principal.kind !== 'local-admin') continue;
      try {
        const allowSensitive = event === 'activity'
          && state.principal.kind === 'remote-device'
          && this.getPreferences().devMode
          && this.getPreferences().remoteSensitiveTerminalOutput;
        const projected = redactForPrincipal(data, state.principal, {
          terminalActivity: event === 'activity',
          allowSensitiveTerminalOutput: allowSensitive
        });
        client.write(`event: ${event}\ndata: ${JSON.stringify(projected)}\n\n`);
      } catch {
        this.removeSseClient(client);
      }
    }
  }

  private deliverAlarmEvent(event: AiAlarmEvent): void {
    // Stage 1A is local delivery only. Remote mobile alarm projection remains a later adapter.
    const hasLocalWebview = [...this.sseClients.values()].some((state) => state.principal.kind === 'local-admin');
    if (!hasLocalWebview) this.enqueuePendingAlarm(this.pendingWebviewAlarms, event);
    this.broadcast('ai-alarm', event, true);
    // Device push reaches registered phones/browsers even when no Sideline page is open. It
    // applies only the Browser Notifications channel gates; the event itself is already decided.
    void this.webPush.deliverAlarm(event, this.getPreferences().alarms)
      .catch((error: unknown) => this.log(`AI alarm push failed: ${error instanceof Error ? error.message : String(error)}`));
    // R9: a reset/recovery event is a wakeup for continuations waiting on that pool — never proof by itself.
    void this.deferredScheduler.onAlarm(event);
    this.emitProduct({ name: 'alert.fired', surface: 'desktop', dims: { channel: this.getPreferences().alarms.channels.vscode ? 'vscode' : 'sse' } });
    if (!this.getPreferences().alarms.channels.vscode) return;
    const notification = JSON.stringify(buildRpcNotification('ai.alarm', event));
    const sessions = this.registry.getAllSessions();
    let sent = false;
    for (const session of sessions) {
      try { session.socket.send(notification); sent = true; break; }
      catch { /* A reconnecting Stadium will receive future alarms; the domain event remains persisted/deduped. */ }
    }
    if (!sent) this.enqueuePendingAlarm(this.pendingStadiumAlarms, event);
    // Future Stage seams consume this same domain event: browser permission,
    // CONSERVE routing, Schedule Later, Copy Context, and remote mobile alarms.
  }

  private enqueuePendingAlarm(queue: AiAlarmEvent[], event: AiAlarmEvent): void {
    if (queue.some((candidate) => candidate.id === event.id)) return;
    queue.push(event);
    if (queue.length > 8) queue.shift();
  }

  /**
   * Projects Control Plane truth into the status contract the browser consumes.
   *
   * The field names here are load-bearing: `players` and `routing` are the
   * field-proven Q2.6 contract that src/public/index.html parses. Renaming them
   * silently blanks the roster and the Target Player list even while the
   * upstream Stadium roster is perfectly healthy, so they must not drift.
   */
  private buildStatus(): Record<string, unknown> {
    // A window that never activated must decay to Offline rather than spin forever.
    this.registry.expireStaleOpenings();
    const selectedGameId = this.registry.getSelectedGameId();
    const games = this.registry.getGames();
    const selectedGame = games.find((g) => g.gameId === selectedGameId);
    const auth = this.registry.getAuthoritativeSessionForGame(selectedGameId);
    const serverNow = Date.now();

    // One exact-instance label projection for every Dad-mode surface. Stable seats
    // order siblings; current roster membership determines contiguous numbering.
    const players = projectFriendlyRoster(this.registry.getRosterForGame(selectedGameId));
    const discoveryCatalog = ((this.discoveryByGame.get(selectedGameId) as { catalog?: Array<{ playerType: string; controls?: ProviderControlProfile }> } | undefined)?.catalog) ?? [];
    // One control answer per EXACT instance, whatever the provider or transport:
    // live Controlled capability > provider discovery > Unknown (absent).
    const workLedger = this.ledger.forGame(selectedGameId);
    const capabilities = (this.registry.getCapabilitiesForGame(selectedGameId) as PlayerRoutingCapability[]).map((capability) => {
      const controls = projectInstanceControls(capability, discoveryCatalog.find((entry) => entry.playerType === capability.playerType)?.controls);
      // Activity of this EXACT instance, beside its eligibility. Unknown when unrecorded.
      const entry = workLedger.find((candidate) => candidate.playerInstanceId === capability.instanceId);
      const queued = this.playQueue.forInstance(selectedGameId, capability.instanceId);
      const needsAttention = queued.some((item) => item.state === 'needs-attention');
      const baseState = entry?.workState ?? 'unknown';
      // Queued is work state, distinct from On Field (eligibility): free-but-waiting instances show Queued.
      const workState = queued.length && baseState !== 'working' && baseState !== 'disconnected' ? 'queued' : baseState;
      const work = { workState, currentPlay: entry?.currentPlay, lastPlay: entry?.recentPlays[0], queuedCount: queued.length, needsAttention };
      return { ...capability, ...(controls ? { controls } : {}), work };
    });
    const reports = this.registry.getReportsForGame(selectedGameId);
    const rosterSynchronized = this.registry.isRosterSynchronizedForGame(selectedGameId);
    const execution = this.buildExecution(selectedGameId, serverNow);
    const preferences = this.getPreferences();
    const routines = this.routines.project(selectedGameId, preferences.devMode, {
      displayName: selectedGame?.displayName,
      repoUri: selectedGame?.repoUri,
      rootFsPath: auth.session?.rootFsPath ?? selectedGame?.rootFsPath
    });

    const routing = this.buildRouting(selectedGameId, selectedGame?.displayName, auth.status, rosterSynchronized, capabilities, '');

    return {
      success: true,
      connected: auth.status === 'connected',
      connectionStatus: selectedGame?.connectionStatus || auth.status,
      selectedGameId,
      game: selectedGame
        ? {
            gameId: selectedGame.gameId,
            displayName: selectedGame.displayName,
            fingerprintSource: selectedGame.fingerprintSource,
            repoUri: selectedGame.repoUri
          }
        : { gameId: 'unknown', displayName: 'None', fingerprintSource: 'unknown' },
      activeProject: selectedGame?.displayName ?? 'No Game',
      workspaceRoots: auth.session?.rootFsPath ? [path.basename(auth.session.rootFsPath)] : [],
      stadium: auth.session
        ? {
            stadiumId: auth.session.stadiumId,
            name: auth.session.name,
            platform: auth.session.platform,
            stadiumType: 'vscode-desktop'
          }
        : {
            stadiumId: 'none',
            name: 'Local Control Plane',
            platform: process.platform,
            stadiumType: 'standalone'
          },
      games,
      players,
      roster: players,
      rosterSynchronized,
      capabilities,
      workLedger,
      execution,
      queue: this.projectQueue(selectedGameId),
      deferredPlays: this.projectDeferredPlays(selectedGameId),
      continuations: this.projectContinuations(selectedGameId),
      // Lifecycle truth for a future aggregate Scout Player card. The original
      // prompt stays in the private durable ledger; normal status exposes only
      // bounded state, evidence, authority, candidates, and the chosen Player.
      scoutContinuations: this.scoutContinuations.forGame(selectedGameId).slice(-10).map((record) => ({
        id: record.id,
        state: record.state,
        originalPlayLabel: record.originalPlayLabel,
        authority: record.authority,
        formationId: record.formationId,
        formationOutcome: record.formationOutcome,
        scoutReportPath: record.scoutReportPath,
        candidates: record.continuationCandidates,
        selectedPlayerInstanceId: record.continuationDecision?.playerInstanceId,
        selectedPlayerName: record.continuationDecision?.playerName,
        selectedModel: record.continuationDecision?.model,
        selectedEffort: record.continuationDecision?.effort,
        note: record.note,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      })),
      routing,
      routingMode: this.routingMode,
      routingPosture: this.routingPosture,
      // S57.2 C1: read-only capability projection. No pricing, no plan names.
      entitlements: this.entitlements.snapshot(serverNow),
      reports: reports.slice(0, 10),
      // Always present in the contract: null means "not checked yet", which is
      // different from an empty catalog and must not be collapsed into it.
      playerDiscovery: projectDiscovery(
        this.discoveryByGame.get(selectedGameId) as { externalCandidates?: unknown[]; runningElsewhere?: unknown[]; adoptableTerminals?: unknown[] } | undefined,
        preferences.runningPlayers,
        advancedPlayerDiscoveryVisible(preferences)
      ),
      preferences,
      remoteAccess: { state: this.remoteAccessProductState() },
      routines,
      // S6: where this Game's Reports/SOP coordinates are, and why Coach believes it.
      gameSetup: this.gameFilesystem.projection(
        selectedGameId,
        auth.status === 'connected' && Boolean(auth.session?.features?.includes('game.filesystem.v1'))
      ),
      at: serverNow
    };
  }

  /** One revisioned execution view for roster instances and logical capability-backed Players in one Game. */
  private buildExecution(gameId: string, serverNow = Date.now()): { gameId: string; epoch: string; serverNow: number; byInstance: Record<string, ExecutionView> } {
    const entries = new Map(this.ledger.forGame(gameId).map((entry) => [entry.playerInstanceId, entry]));
    const capabilities = new Map((this.registry.getCapabilitiesForGame(gameId) as PlayerRoutingCapability[])
      .map((capability) => [capability.instanceId, capability]));
    const names = friendlyInstanceNames(this.registry.getRosterForGame(gameId));
    const byInstance: Record<string, ExecutionView> = {};
    for (const rawPlayer of this.registry.getRosterForGame(gameId)) {
      const player = rawPlayer as { instances?: Array<Record<string, unknown>> };
      for (const instance of player.instances ?? []) {
        const instanceId = typeof instance.instanceId === 'string' ? instance.instanceId : '';
        if (!instanceId) continue;
        const entry = entries.get(instanceId);
        const queuedItems: QueuedExecutionItem[] = this.playQueue.forInstance(gameId, instanceId).map((item) => ({
          state: item.state,
          attention: item.attention,
          reasonKind: entry?.currentPlay || item.context?.ownerInstanceId === instanceId ? 'own-current-play' : 'waiting-for-player',
          waitingOnName: names.get(instanceId)
        }));
        const capability = capabilities.get(instanceId);
        byInstance[instanceId] = projectExecution({
          instanceId,
          entry,
          pendingDispatch: this.ledger.hasPendingDispatch(gameId, instanceId),
          queued: queuedItems,
          controlState: typeof instance.controlState === 'string' ? instance.controlState : undefined,
          executionType: capability?.executionType === 'scout-formation' || instance.playerType === SCOUT_PLAYER_TYPE
            ? 'scout-formation'
            : capability?.executionType === 'direct-shell' || instance.playerType === 'terminal' ? 'direct-shell' : 'reasoning',
          now: serverNow
        });
      }
    }
    return { gameId, epoch: this.ledger.epoch, serverNow, byInstance };
  }

  /** Single source of AUTO-routing projection, shared by /api/status and /api/route/preview. */
  private buildRouting(
    selectedGameId: string,
    displayName: string | undefined,
    connectionStatus: string,
    rosterSynchronized: boolean,
    capabilities: readonly PlayerRoutingCapability[],
    prompt: string,
    extra: { incomingReportPath?: string; routeChoice?: 'queue' | 'handoff' | 'dispatch' } = {}
  ): Record<string, unknown> {
    let activeDecision: RoutingDecision | undefined;
    let autoError: string | undefined;

    if (connectionStatus !== 'connected') {
      autoError = `Game '${displayName ?? selectedGameId}' is offline. Connect its Stadium or open in VS Code to dispatch Plays.`;
    } else if (!rosterSynchronized) {
      // Not-yet-synchronized is explicitly NOT an authoritative empty roster.
      autoError = 'Roster is still synchronizing with the Stadium…';
    } else {
      // The same route the real dispatch will compute (context, queue, handoff).
      const result = this.router.computeRoute(selectedGameId, prompt, [...capabilities], extra);
      if (result.decision) {
        activeDecision = result.decision;
      } else {
        autoError = result.error;
      }
    }

    return {
      mode: this.routingMode,
      posture: this.routingPosture,
      activeDecision,
      autoError,
      capabilities,
      manualSelection: this.manualSelection
    };
  }

  // --- Q2.10D: context, queue-for-owner -----------------------------------------

  /** Every instance on this Game's Team, benched included; undefined until the roster synchronizes. */
  private rosterInstanceIds(gameId: string): Set<string> | undefined {
    if (!this.registry.isRosterSynchronizedForGame(gameId)) return undefined;
    const ids = new Set<string>();
    for (const raw of this.registry.getRosterForGame(gameId)) {
      for (const instance of ((raw as { instances?: unknown[] }).instances ?? [])) {
        const id = (instance as { instanceId?: unknown }).instanceId;
        if (typeof id === 'string') ids.add(id);
      }
    }
    return ids;
  }

  /** The evidence context-aware AUTO may use — strictly ONE Game's Ledger, reports and queue. */
  /**
   * Return exactly one completed AUTO Scout detour to Coach. Coach re-runs the
   * ordinary AUTO router over the Team that exists now; Scout is excluded by
   * the router's continuation phase, and every other Formation outcome stops.
   */
  private async continueAfterScout(gameId: string, rawTurn: unknown): Promise<void> {
    const turn = (rawTurn ?? {}) as TurnRecord & {
      formationOutcome?: unknown;
      formationId?: unknown;
      reportPath?: unknown;
    };
    if (typeof turn.turnRef !== 'string') return;
    const outcome = typeof turn.formationOutcome === 'string'
      && ['COMPLETE', 'PARTIAL', 'BLOCKED', 'FAILED', 'UNKNOWN'].includes(turn.formationOutcome)
      ? turn.formationOutcome as ScoutFormationOutcome
      : undefined;
    if (!outcome) return;
    const record = this.scoutContinuations.recordScoutOutcome({
      gameId,
      turnRef: turn.turnRef,
      outcome,
      formationId: typeof turn.formationId === 'string' ? turn.formationId : undefined,
      reportPath: typeof turn.reportPath === 'string' ? turn.reportPath : undefined
    });
    if (!record || record.state !== 'awaiting-scout' || !record.scoutReportPath) return;

    const candidates = this.continuationCandidateEvidence(gameId);
    const begun = this.scoutContinuations.beginContinuation(record.id, candidates);
    if (!begun) return;
    if (!candidates.some((candidate) => candidate.eligible)) {
      this.scoutContinuations.stopContinuation(
        record.id,
        'Scout evidence is ready, but no eligible non-Scout Player can continue on the current Team.'
      );
      this.broadcastStatus();
      return;
    }

    const result = await this.router.dispatch({
      gameId,
      routingMode: 'auto',
      prompt: record.originalPrompt,
      incomingReportPath: record.scoutReportPath,
      scoutContinuation: {
        originalClientRef: record.originalClientRef,
        formationId: record.formationId,
        reportPath: record.scoutReportPath,
        authorityReason: record.authority.reason,
        originalContextPreamble: record.originalContextPreamble
      }
    });
    this.scoutContinuations.recordContinuationDispatch(record.id, {
      decision: result.decision,
      clientRef: result.clientRef,
      turnRef: result.turnRef,
      status: result.status,
      message: result.message,
      queueItemId: result.queueItemId
    });
    this.broadcastStatus();
  }

  private continuationCandidateEvidence(gameId: string): ContinuationCandidateEvidence[] {
    return (this.registry.getCapabilitiesForGame(gameId) as PlayerRoutingCapability[])
      .filter((candidate) => candidate.instanceId !== SCOUT_PLAYER_INSTANCE_ID)
      .map((candidate) => {
        let reason = 'Eligible in the current live Team projection.';
        let eligible = true;
        if (candidate.playerType === 'terminal' || candidate.executionType === 'direct-shell') {
          eligible = false;
          reason = 'Terminal runs exact commands and is not a natural-language AUTO continuation Player.';
        } else if (candidate.autoEligible === false) {
          eligible = false;
          reason = 'This capability is excluded from ordinary AUTO routing.';
        } else if (candidate.state !== 'ready') {
          eligible = false;
          reason = `Current Player state is ${candidate.state}, not ready.`;
        } else if (candidate.capability.freshness === 'unavailable') {
          eligible = false;
          reason = 'Live capability truth is unavailable.';
        } else if (candidate.transport === 'controlled' && candidate.capability.models.length === 0) {
          eligible = false;
          reason = 'No live model capability is available for this controlled Player.';
        }
        return {
          instanceId: candidate.instanceId,
          playerType: candidate.playerType,
          provider: candidate.capability.provider || candidate.playerType,
          state: candidate.state,
          eligible,
          reason
        };
      });
  }

  private recordRoutingFilmDecision(record: RoutingFilmDispatchRecord): void {
    try {
      const capability = (this.registry.getCapabilitiesForGame(record.gameId) as PlayerRoutingCapability[])
        .find((candidate) => candidate.instanceId === record.playerInstanceId);
      const resourcePool = capability ? resourcePoolForSeat(capability) : 'unknown';
      const chosen: RoutingFilmTarget = {
        playerInstanceId: record.playerInstanceId,
        ...(record.playerType ? { playerType: record.playerType } : {}),
        ...(record.transport ? { transport: record.transport } : {}),
        ...(record.model ? { model: record.model } : {}),
        ...(record.effort ? { effort: record.effort } : {}),
        resourcePool
      };
      const at = record.at ?? Date.now();
      // R6 shadow: the route is already fixed. The recommendation is recorded next to it and
      // never changes it. Without the router's Play profile there is nothing truthful to recommend.
      const recommendation = record.evidence && record.shadow && !this.routingFilm.decision(record.clientRef)
        ? this.shadowRecommendation({
            gameId: record.gameId,
            clientRef: record.clientRef,
            now: at,
            mode: record.routingMode === 'manual' ? 'manual' : 'auto',
            evidence: record.evidence,
            shadow: record.shadow
          })
        : undefined;
      const chosenPossession = recommendation?.possession.seats.find((seat) => seat.seat === record.playerInstanceId);
      this.routingFilm.recordDecision({
        schemaVersion: 1,
        kind: 'decision',
        at,
        clientRef: record.clientRef,
        gameId: record.gameId,
        baseline: chosen,
        chosen,
        ...(recommendation ? {
          recommendation: recommendationDigest(recommendation),
          possession: chosenPossession ? { tier: chosenPossession.tier, value: chosenPossession.value } : { tier: 'none', value: 0 }
        } : {}),
        decidedBy: record.decidedBy
          ?? (record.routingMode === 'auto' ? 'auto-baseline' : 'coach-manual'),
        routeAction: record.routeAction === 'handoff' ? 'handoff' : 'dispatch',
        receiptBefore: this.captureRoutingFilmReceipt(resourcePool),
        ...(record.evidence ? {
          profile: record.evidence.profile,
          ...(record.evidence.touchKeys.length ? { touchKeys: record.evidence.touchKeys } : {}),
          ...(record.evidence.context ? { context: record.evidence.context } : {}),
          ...(record.evidence.scoutReportKey ? { scoutReportKey: record.evidence.scoutReportKey } : {})
        } : {})
      });
    } catch (error) {
      this.log(`Routing Film decision capture failed for ${record.clientRef}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * R6: the one shadow recommendation seam, shared by real dispatch (Film digest) and the Dev
   * route preview. It only reads: current economics (never Film receipts), the attributed Film
   * index, the shipped prior pack, the Ledger, and the capability envelope. Failure-isolated.
   */
  private shadowRecommendation(input: {
    gameId: string;
    clientRef?: string;
    now: number;
    mode: RoutingMode;
    evidence: DispatchEvidence;
    shadow: ShadowRoutingFacts;
  }): RoutingRecommendation | undefined {
    try {
      const { evidence, shadow } = input;
      const events = this.routingFilm.events();
      const priorPack = this.routingPriorPack();
      const filmIndex = this.attributedFilmIndex(events, priorPack, input.now);
      const capabilities = this.routingCapabilities();
      const candidates = [...shadow.candidates];
      const seats = eligibleSeats(candidates, {
        authority: 'auto',
        ...(input.mode === 'manual' || !shadow.constraints ? {} : { constraints: shadow.constraints }),
        availability: 'taking-plays'
      });
      const baselineDecision = shadow.baseline;
      const baselineCandidate = baselineDecision ? candidates.find((candidate) => candidate.instanceId === baselineDecision.playerInstanceId) : undefined;
      const baseline: RecommendationBaseline | undefined = baselineDecision ? {
        playerInstanceId: baselineDecision.playerInstanceId,
        ...(baselineCandidate?.playerType ? { playerType: baselineCandidate.playerType } : {}),
        ...(baselineDecision.model ? { model: baselineDecision.model } : {}),
        ...(baselineDecision.effort ? { effort: baselineDecision.effort } : {}),
        action: baselineDecision.action ?? 'dispatch',
        ...(baselineCandidate?.executionType ? { executionType: baselineCandidate.executionType } : {})
      } : undefined;

      // Film touch keys by clientRef for this Game: possession overlap and Scout topic coverage.
      const filmTouchKeys = new Map<string, readonly string[]>();
      for (const event of events) {
        if (event.kind === 'decision' && event.gameId === input.gameId && event.touchKeys?.length && !filmTouchKeys.has(event.clientRef)) {
          filmTouchKeys.set(event.clientRef, event.touchKeys);
        }
      }
      const ledger = this.ledger.forGame(input.gameId);
      const owner = evidence.followUp.owner;

      // Scout: readiness is the Scout seat's Combine-proven READY state; correctness is Film.
      const scoutSeat = candidates.find((candidate) => candidate.instanceId === SCOUT_PLAYER_INSTANCE_ID || candidate.executionType === 'scout-formation');
      const seatReady = scoutSeat?.state === 'ready';
      const scoutDuration = scoutSeat ? computeBelief(
        { playerType: scoutSeat.playerType },
        { taskClass: evidence.profile.taskClass, difficulty: evidence.profile.difficulty, role: 'scout', gameId: input.gameId },
        priorPack, filmIndex, input.now, { baselinePreference: PROVIDER_PREFERENCE }
      ).durationMin : undefined;
      const scoutEvidence = scoutFilmEvidence(events, input.now);
      const playKeys = new Set(evidence.touchKeys);
      const coveringKeys = new Set([
        evidence.followUp.namedReportKey,
        owner?.reportPath ? evidenceKey(owner.reportPath) : undefined,
        evidence.context?.reportKey
      ].filter((key): key is string => Boolean(key)));
      const scoutEntry = ledger.find((entry) => entry.playerInstanceId === scoutSeat?.instanceId);
      const intel: ScoutIntelRecord[] = (scoutEntry?.reports ?? []).map((report) => {
        const reportKey = evidenceKey(report.path);
        const touched = report.clientRef ? (filmTouchKeys.get(report.clientRef) ?? []) : [];
        return { reportKey, at: report.mtime, coversPlay: coveringKeys.has(reportKey) || touched.some((key) => playKeys.has(key)) };
      });

      const recommendation = recommendRoute({
        now: input.now,
        gameId: input.gameId,
        ...(input.clientRef ? { clientRef: input.clientRef } : {}),
        profile: {
          taskClass: evidence.profile.taskClass,
          difficulty: evidence.profile.difficulty,
          role: evidence.profile.role,
          urgency: 'normal',
          scoutNeed: shadow.scoutNeed,
          followUp: evidence.followUp.detected,
          touchKeys: evidence.touchKeys,
          postScoutContinuation: shadow.postScoutContinuation
        },
        authority: { mode: input.mode, ...(shadow.constraints ? { constraints: shadow.constraints } : {}) },
        // The Coach's CONSERVE actuator selects the engine's existing posture weights. MANUAL stays authoritative:
        // under MANUAL the recommendation is advisory-only and never changes the human's route.
        posture: { value: this.routingPosture, source: 'coach-default' },
        ...(baseline ? { baseline } : {}),
        seats,
        economics: this.currentRoutingEconomics(),
        priorPack,
        filmIndex,
        baselinePreference: PROVIDER_PREFERENCE,
        possession: {
          ledger,
          ...(owner ? { owner: { instanceId: owner.instanceId, evidence: owner.evidence } } : {}),
          playTouchKeys: evidence.touchKeys,
          filmTouchKeys
        },
        scout: {
          seatReady,
          ...(seatReady ? { pRuns: SCOUT_ROI_CONSTANTS.readyPRuns } : {}),
          ...(scoutDuration && scoutDuration.confidence !== 'unknown' ? { delayMin: scoutDuration.p50 } : {}),
          scoutPriceCost: 0,
          intel,
          contradictedReportKeys: scoutEvidence.contradictedReportKeys,
          pRightEvidence: scoutEvidence.pRightEvidence
        },
        capabilities
      });
      // R10: after ranking, and only ever adding the earned percent; ordering and the Film digest are untouched.
      return withCalibration(recommendation, this.calibrationEvaluation(events, priorPack, input.now));
    } catch (error) {
      this.log(`Routing recommendation (shadow) failed${input.clientRef ? ` for ${input.clientRef}` : ''}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  /** The shipped R0 pack. A missing pack is logged and degrades to baseline-preference priors only. */
  private routingPriorPack(): PriorPackSource {
    if (!this.priorPackSource) {
      try {
        this.priorPackSource = loadShippedPriorPack();
      } catch (error) {
        this.log(`Routing prior pack unavailable (${error instanceof Error ? error.message : String(error)}); recommendations use baseline priors only.`);
        this.priorPackSource = emptyPriorPackSource('missing');
      }
    }
    return this.priorPackSource;
  }

  /**
   * The one seam that changes the Coach routing posture. Today only the CONSERVE actuator calls it; a future
   * alarm policy could call it too, and every client's actuator follows the broadcast. Never touches Scarcity.
   */
  private setRoutingPosture(posture: RoutingPosture): void {
    this.routingPosture = posture;
  }

  /** R10: the weekly calibration evaluation (S57.1 §12.3), re-derived from the Film when the week turns or the Film grows. */
  private calibrationEvaluation(events: readonly RoutingFilmEvent[], priorPack: PriorPackSource, now: number): CalibrationEvaluation {
    const weekStart = calibrationWeekStart(now);
    const cached = this.calibrationCache;
    if (cached && cached.weekStart === weekStart && cached.length === events.length && cached.pack === priorPack) return cached.evaluation;
    const evaluation = evaluateCalibration(events, priorPack, weekStart);
    this.calibrationCache = { weekStart, length: events.length, pack: priorPack, evaluation };
    return evaluation;
  }

  /** R5's single Film seam for belief, recomputed when the Film grows or the minute changes. */
  private attributedFilmIndex(events: readonly RoutingFilmEvent[], priorPack: PriorPackSource, now: number): FilmIndex {
    const minute = Math.floor(now / 60_000);
    const cached = this.filmIndexCache;
    if (cached && cached.length === events.length && cached.minute === minute && cached.pack === priorPack) return cached.index;
    const index = buildAttributedFilmIndex(events, priorPack, now);
    this.filmIndexCache = { length: events.length, minute, pack: priorPack, index };
    return index;
  }

  /** S57.2 §10.2: the one adapter from the capability envelope to routing capability facts. */
  private routingCapabilities(): RoutingCapabilitySet {
    const allowed = (capability: Parameters<FeatureGate['check']>[0]): boolean => this.featureGate.check(capability).allowed;
    return {
      intelligent: allowed('routing.intelligent'),
      economics: allowed('routing.intelligent.economics'),
      nextBest: allowed('routing.intelligent.nextBest'),
      schedule: allowed('routing.schedule'),
      scoutExecutionAllowed: allowed('scout.play'),
      autonomous: allowed('routing.autonomous')
    };
  }

  /**
   * R8: build the Dad advisory for a staged AUTO decision and remember the offer (in memory, bounded, short-lived)
   * so a later `[USE]` can only accept a suggestion Dad was actually shown. Called only when the stage is open.
   */
  private offerAdvisory(gameId: string, prompt: string, decision: RoutingDecision, rec: RoutingRecommendation): DadAdvisoryView | undefined {
    const view = dadAdvisoryView(rec, { names: friendlyInstanceNames(this.registry.getRosterForGame(gameId)) });
    if (!view) return undefined;
    const now = Date.now();
    for (const [id, offer] of this.advisoryOffers) if (now - offer.at > ADVISORY_OFFER_TTL_MS) this.advisoryOffers.delete(id);
    while (this.advisoryOffers.size >= 20) this.advisoryOffers.delete(this.advisoryOffers.keys().next().value as string);
    const scoutNeed = analyzeScoutNeed(prompt);
    this.advisoryOffers.set(rec.id, {
      rec, gameId, at: now, base: decision, promptHash: evidenceKey(prompt),
      scoutNeed: { reconnaissancePrimary: scoutNeed.reconnaissancePrimary, materialEvidenceGap: scoutNeed.materialEvidenceGap }
    });
    return view;
  }

  /** R8: turn an accepted, previously offered suggestion into an executable decision, or refuse it (never reroute). */
  private resolveAdvised(
    choice: AdvisedChoice, recommendationId: unknown, gameId: string, prompt: string
  ): { ok: true; decision: RoutingDecision; decidedBy: AcceptedDecidedBy } | { ok: false; message: string } {
    if (!advisoryStageOpen(this.advisoryStage)) return { ok: false, message: 'That suggestion is not available.' };
    const offer = typeof recommendationId === 'string' ? this.advisoryOffers.get(recommendationId) : undefined;
    if (!offer || offer.gameId !== gameId || Date.now() - offer.at > ADVISORY_OFFER_TTL_MS || offer.promptHash !== evidenceKey(prompt)) {
      return { ok: false, message: 'That suggestion is out of date. Nothing was sent.' };
    }
    const option = choice === 'recommended-primary' ? offer.rec.primary : choice === 'recommended-next-best' ? offer.rec.nextBest : offer.rec.scoutOption;
    const result = optionToDecision(offer.rec, option, {
      choice,
      base: offer.base,
      candidates: this.registry.getCapabilitiesForGame(gameId) as PlayerRoutingCapability[],
      names: friendlyInstanceNames(this.registry.getRosterForGame(gameId)),
      scoutNeed: offer.scoutNeed,
      now: Date.now()
    });
    return result.ok
      ? { ok: true, decision: result.decision, decidedBy: result.decidedBy }
      : { ok: false, message: 'That suggestion is no longer available. Nothing was sent.' };
  }

  /** R6 Dev preview: the same seam, over the staged decision. Reads only; never writes Film. */
  private previewRecommendation(gameId: string, prompt: string, decision: RoutingDecision, capabilities: readonly PlayerRoutingCapability[], incomingReportPath?: string): RoutingRecommendation | undefined {
    try {
      const context = this.routeContextFor(gameId);
      const evidence = buildDispatchEvidence({
        prompt,
        gameId,
        role: decision.playerInstanceId === SCOUT_PLAYER_INSTANCE_ID ? 'scout' : 'player',
        ledger: context.ledger,
        reports: context.reports,
        incomingReportPath,
        decisionContext: decision.context ? { state: decision.context.state, reportPath: decision.context.reportPath } : undefined
      });
      const scoutNeed = analyzeScoutNeed(prompt);
      return this.shadowRecommendation({
        gameId,
        now: Date.now(),
        mode: 'auto',
        evidence,
        shadow: {
          decision,
          baseline: decision,
          ...(decision.constraints ? { constraints: decision.constraints } : {}),
          candidates: [...capabilities],
          scoutNeed: { reconnaissancePrimary: scoutNeed.reconnaissancePrimary, materialEvidenceGap: scoutNeed.materialEvidenceGap },
          postScoutContinuation: false
        }
      });
    } catch {
      return undefined;
    }
  }

  /**
   * R5: at the follow-up's real dispatch, link it to its proven parent and attribute it. Preview and
   * status paths never reach this seam. Failure-isolated like every other Film capture.
   */
  private recordRoutingFilmFollowUp(record: RoutingFilmDispatchRecord): void {
    if (!record.evidence) return;
    try {
      const at = record.at ?? Date.now();
      recordDispatchAttribution(this.routingFilm, {
        clientRef: record.clientRef,
        gameId: record.gameId,
        at,
        playerInstanceId: record.playerInstanceId,
        evidence: record.evidence
      }, this.ledger.forGame(record.gameId));
      settleResolutions(this.routingFilm, at);
    } catch (error) {
      this.log(`Routing Film attribution capture failed for ${record.clientRef}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private recordRoutingFilmOutcome(gameId: string, playerInstanceId: string, turnRef?: string): void {
    const entry = this.ledger.get(gameId, playerInstanceId);
    const play = turnRef
      ? entry?.recentPlays.find((candidate) => candidate.turnRef === turnRef)
      : entry?.recentPlays[0];
    if (play) this.appendRoutingFilmOutcome(gameId, playerInstanceId, play);
  }

  private recordRoutingFilmOutcomeByClientRef(clientRef: string): void {
    for (const game of this.registry.getGames()) {
      for (const entry of this.ledger.forGame(game.gameId)) {
        const play = entry.recentPlays.find((candidate) => candidate.clientRef === clientRef);
        if (play) {
          this.appendRoutingFilmOutcome(game.gameId, entry.playerInstanceId, play);
          return;
        }
      }
    }
  }

  private appendRoutingFilmOutcome(gameId: string, playerInstanceId: string, play: LedgerRecentPlay): void {
    try {
      const decision = this.routingFilm.decision(play.clientRef);
      if (!decision) return;
      const startedAt = play.executionStartedAt ?? play.startedAt;
      const target: RoutingFilmWorkInterval & { finishedAt: number } = {
        clientRef: play.clientRef,
        playerInstanceId,
        playerType: decision.chosen.playerType,
        resourcePool: decision.chosen.resourcePool,
        startedAt,
        finishedAt: play.finishedAt
      };
      const concurrency = projectRoutingFilmConcurrency(target, this.routingFilmIntervals());
      const receiptAfter = this.captureRoutingFilmReceipt(decision.chosen.resourcePool);
      const entry = this.ledger.get(gameId, playerInstanceId);
      const reportProduced = entry?.reports.some((report) => report.clientRef === play.clientRef) ?? false;
      const burn = deriveRoutingFilmBurn(decision.receiptBefore, receiptAfter, play.startedAt, play.finishedAt, concurrency);
      const isolation = summarizeRoutingFilmIsolation(burn);
      this.routingFilm.recordOutcome({
        schemaVersion: 1,
        kind: 'outcome',
        at: play.finishedAt,
        clientRef: play.clientRef,
        gameId,
        ledgerOutcome: play.outcome,
        startedAt: play.startedAt,
        ...(play.executionStartedAt !== undefined ? { executionStartedAt: play.executionStartedAt } : {}),
        finishedAt: play.finishedAt,
        durationMs: Math.max(0, play.finishedAt - startedAt),
        retries: 0,
        reportProduced,
        receiptAfter,
        concurrency,
        isolation: isolation.isolation,
        isolationReason: isolation.reason,
        burn
      });
      settleResolutions(this.routingFilm, Date.now());
    } catch (error) {
      this.log(`Routing Film outcome capture failed for ${play.clientRef}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private captureRoutingFilmReceipt(pool: ResourcePoolId | 'unknown'): RoutingFilmReceipt {
    const snapshot = this.currentRoutingEconomics();
    const health = this.healthAuthority.getSnapshot();
    const observedAt = pool === 'claude' || pool === 'codex' ? health.providers[pool]?.observedAt : undefined;
    return projectRoutingFilmReceipt(snapshot, pool, observedAt);
  }

  /**
   * The one bounded daemon read of current R1 economics. Two consumers, both off the routing
   * path: R2 receipt capture and the R6 shadow recommendation. The router never reads it.
   */
  private currentRoutingEconomics(): RoutingEconomicsSnapshot {
    return this.routingEconomics.read();
  }

  private routingFilmIntervals(): RoutingFilmWorkInterval[] {
    const intervals: RoutingFilmWorkInterval[] = [];
    for (const game of this.registry.getGames()) {
      const capabilities = this.registry.getCapabilitiesForGame(game.gameId) as PlayerRoutingCapability[];
      for (const entry of this.ledger.forGame(game.gameId)) {
        const capability = capabilities.find((candidate) => candidate.instanceId === entry.playerInstanceId);
        const add = (play: { clientRef: string; startedAt: number; executionStartedAt?: number; finishedAt?: number }): void => {
          const recorded = this.routingFilm.decision(play.clientRef);
          const resourcePool = recorded?.chosen.resourcePool ?? (capability ? resourcePoolForSeat(capability) : 'unknown');
          intervals.push({
            clientRef: play.clientRef,
            playerInstanceId: entry.playerInstanceId,
            ...(entry.playerType ? { playerType: entry.playerType } : {}),
            resourcePool,
            startedAt: play.executionStartedAt ?? play.startedAt,
            ...(play.finishedAt !== undefined ? { finishedAt: play.finishedAt } : {})
          });
        };
        if (entry.currentPlay) add(entry.currentPlay);
        for (const recent of entry.recentPlays) add(recent);
      }
    }
    return intervals;
  }

  private routeContextFor(gameId: string): RouteContext {
    const reports = (this.registry.getReportsForGame(gameId) as Array<Record<string, unknown>>)
      .filter((report) => typeof report.path === 'string' && typeof report.mtime === 'number' && (!report.gameId || report.gameId === 'unknown' || report.gameId === gameId))
      .map((report): GameReportRef => ({
        path: report.path as string,
        filename: typeof report.filename === 'string' ? report.filename : undefined,
        mtime: report.mtime as number,
        gameId,
        provenance: report.provenance && typeof report.provenance === 'object' ? report.provenance as GameReportRef['provenance'] : undefined
      }));
    const queuedCounts = new Map<string, number>();
    for (const item of this.playQueue.forGame(gameId)) queuedCounts.set(item.playerInstanceId, (queuedCounts.get(item.playerInstanceId) ?? 0) + 1);
    return {
      ledger: this.ledger.forGame(gameId),
      reports,
      names: friendlyInstanceNames(this.registry.getRosterForGame(gameId)),
      rosterInstanceIds: this.rosterInstanceIds(gameId),
      queuedCounts
    };
  }

  private scheduleLedgerSave(): void {
    if (this.ledgerSaveTimer) return;
    this.ledgerSaveTimer = setTimeout(() => {
      this.ledgerSaveTimer = undefined;
      try {
        const file = path.join(this.dir, 'work-ledger.json');
        const temp = `${file}.${this.instanceNonce}.tmp`;
        fs.writeFileSync(temp, JSON.stringify(this.ledger.serialize()), 'utf8');
        fs.renameSync(temp, file);
      } catch { /* history is best-effort; routing never depends on the write */ }
    }, 250);
    this.ledgerSaveTimer.unref();
  }

  private scheduleRoutineSave(): void {
    if (this.routineSaveTimer) return;
    this.routineSaveTimer = setTimeout(() => {
      this.routineSaveTimer = undefined;
      this.flushRoutines();
    }, 250);
    this.routineSaveTimer.unref();
  }

  private scheduleHealthSave(): void {
    if (this.healthSaveTimer) return;
    this.healthSaveTimer = setTimeout(() => {
      this.healthSaveTimer = undefined;
      this.healthAuthority.flush();
    }, 250);
    this.healthSaveTimer.unref();
  }

  private flushRoutines(): void {
    try { this.routines.flush(); }
    catch (error) { this.log(`Coach Routines state could not be saved: ${error instanceof Error ? error.message : String(error)}`); }
  }

  /**
   * Release the next queued Play for ONE exact instance, after revalidating everything
   * that could have changed while it waited. Never a sibling; never a guess:
   * an unprovable situation becomes "needs attention" for the human.
   */
  private async drainQueue(gameId: string, playerInstanceId: string): Promise<void> {
    const key = `${gameId} ${playerInstanceId}`;
    if (this.drainingQueues.has(key) || this.disposed) return;
    const head = this.playQueue.head(gameId, playerInstanceId);
    if (!head || head.state !== 'queued') return;
    const auth = this.registry.getAuthoritativeSessionForGame(gameId);
    if (auth.status !== 'connected' || !auth.session?.rosterSynchronized) return; // waits for the Game to reconnect
    const names = friendlyInstanceNames(this.registry.getRosterForGame(gameId));
    const name = names.get(playerInstanceId) ?? 'The Player this Play was queued for';
    const roster = this.rosterInstanceIds(gameId);
    if (roster && !roster.has(playerInstanceId)) {
      this.playQueue.needsAttention(head.id, `${name} is no longer on your Team. Cancel this Play or send it to another Player.`);
      this.ledger.recordQueueMutation(gameId, playerInstanceId);
      this.broadcastStatus();
      return;
    }
    const capability = (auth.session.capabilities as PlayerRoutingCapability[]).find((entry) => entry.instanceId === playerInstanceId);
    if (!capability) {
      this.playQueue.needsAttention(head.id, `${name} is on the bench. Put it back on field and try again — or cancel this Play.`);
      this.ledger.recordQueueMutation(gameId, playerInstanceId);
      this.broadcastStatus();
      return;
    }
    if (capability.transport !== 'controlled' || capability.playerType === 'terminal') {
      this.playQueue.needsAttention(head.id, `${name} can't take queued Plays. Cancel this Play or send it yourself.`);
      this.ledger.recordQueueMutation(gameId, playerInstanceId);
      this.broadcastStatus();
      return;
    }
    if (capability.state === 'busy' || this.ledger.get(gameId, playerInstanceId)?.workState === 'working') return; // still working
    if (capability.state !== 'ready') {
      this.playQueue.needsAttention(head.id, `Queued Play needs attention: ${name} can't take Plays right now.`);
      this.ledger.recordQueueMutation(gameId, playerInstanceId);
      this.broadcastStatus();
      return;
    }

    this.drainingQueues.add(key);
    try {
      if (!this.playQueue.markDispatching(head.id)) return;
      this.ledger.recordQueueMutation(gameId, playerInstanceId);
      this.broadcastStatus();
      const result = await this.router.dispatch({
        prompt: head.prompt,
        gameId,
        playerInstanceId,
        routingMode: 'manual',
        model: head.model,
        effort: head.effort,
        incomingReportPath: head.context?.reportPath,
        contextPreamble: head.context?.preamble,
        queueItemId: head.id
      });
      if (result.success) {
        this.playQueue.complete(head.id);
        // Q2.13: if this exact queue item was a Scout continuation waiting for a
        // busy instance, bind the real released turn back onto its audit record
        // so the terminal-turn handler above can close it truthfully instead of
        // leaving it stuck reading `queued` forever.
        if (result.turnRef) this.scoutContinuations.bindQueueRelease(head.id, result.turnRef);
      } else if (result.status === 'unknown') {
        this.playQueue.needsAttention(head.id, "Coach can't tell whether this queued Play started. Check the Player, then try again or cancel it.");
      } else if (/still working|already in flight|reconnecting/i.test(result.message ?? '')) {
        this.playQueue.requeue(head.id);
      } else {
        this.playQueue.needsAttention(head.id, `Queued Play needs attention: ${result.message ?? 'it could not be sent.'}`);
      }
      this.ledger.recordQueueMutation(gameId, playerInstanceId);
    } finally {
      this.drainingQueues.delete(key);
      this.broadcastStatus();
    }
  }

  /** Dad Mode projection of one Game's queue. No prompts beyond a short first line; no ids shown. */
  private projectQueue(gameId: string): Array<Record<string, unknown>> {
    const names = friendlyInstanceNames(this.registry.getRosterForGame(gameId));
    const auth = this.registry.getAuthoritativeSessionForGame(gameId);
    const positions = new Map<string, number>();
    return this.playQueue.forGame(gameId).map((item: QueuedPlay) => {
      const position = (positions.get(item.playerInstanceId) ?? 0) + 1;
      positions.set(item.playerInstanceId, position);
      const first = item.prompt.trim().split(/\r?\n/, 1)[0] ?? '';
      return {
        id: item.id,
        playerInstanceId: item.playerInstanceId,
        playerName: names.get(item.playerInstanceId) ?? 'Player',
        playLabel: item.playLabel,
        promptSummary: first.length > 80 ? `${first.slice(0, 79)}…` : first,
        reason: item.reason,
        state: item.state,
        attention: item.attention ?? (auth.status !== 'connected' && item.state === 'queued' ? 'Waiting for this Game to reconnect.' : undefined),
        position,
        queuedAt: item.queuedAt
      };
    });
  }

  // --- R9 DeferredPlay: same-Player continue-task ---------------------------------------------

  private deferredGameView(gameId: string): DeferredPlayGameView {
    const auth = this.registry.getAuthoritativeSessionForGame(gameId);
    const connected = auth.status === 'connected';
    const rosterInstanceIds = this.rosterInstanceIds(gameId);
    return {
      connected,
      rosterSynchronized: Boolean(connected && auth.session?.rosterSynchronized),
      capabilities: connected ? (auth.session?.capabilities ?? []) as PlayerRoutingCapability[] : [],
      ...(rosterInstanceIds ? { rosterInstanceIds } : {}),
      names: friendlyInstanceNames(this.registry.getRosterForGame(gameId))
    };
  }

  private armDeferredContinuation(gameId: string, playerInstanceId: string, interruptedClientRef: string): { status: number; body: Record<string, unknown> } {
    if (!gameId || !playerInstanceId || !interruptedClientRef) return { status: 400, body: { success: false, message: 'Choose the interrupted Player to schedule.' } };
    const view = this.deferredGameView(gameId);
    if (!view.connected) return { status: 409, body: { success: false, message: 'This Game is offline. Reconnect it, then schedule the continuation.' } };
    const existing = this.deferredPlays.forInterruption(gameId, playerInstanceId, interruptedClientRef);
    if (existing) return { status: 200, body: { success: true, created: false, deferredPlay: this.projectDeferredPlay(existing, view), message: 'Already scheduled.' } };
    const eligibility = continuationEligibility({
      capability: view.capabilities.find((candidate) => candidate.instanceId === playerInstanceId),
      entry: this.ledger.get(gameId, playerInstanceId),
      economics: this.currentRoutingEconomics()
    });
    const name = view.names.get(playerInstanceId) ?? 'This Player';
    if (!eligibility.eligible) {
      const why: Record<typeof eligibility.reason, string> = {
        'no-interruption': `${name} wasn't stopped by a usage limit, so there is nothing to continue after a reset.`,
        'not-controlled': `${name} can't continue a task automatically.`,
        'no-session': `Coach can't prove which conversation ${name} was in, so it can't continue it safely.`,
        'session-changed': `${name} is already in a different conversation, so the interrupted task can't be continued there.`,
        'player-working': `${name} is working on something else now.`,
        'reset-unknown': `Coach doesn't know when ${name}'s usage resets, so it can't schedule the continuation yet.`
      };
      return { status: 409, body: { success: false, reason: eligibility.reason, message: why[eligibility.reason] } };
    }
    if (eligibility.interrupted.clientRef !== interruptedClientRef) {
      return { status: 409, body: { success: false, message: `That interruption is no longer ${name}'s latest Play.` } };
    }
    const capability = view.capabilities.find((candidate) => candidate.instanceId === playerInstanceId) as PlayerRoutingCapability;
    const { record, created } = this.deferredPlays.arm({
      gameId,
      playerInstanceId,
      playerType: capability.playerType,
      interrupted: eligibility.interrupted,
      expectedSessionKey: eligibility.expectedSessionKey,
      condition: eligibility.condition
    });
    void this.deferredScheduler.armed(record.id);
    this.broadcastStatus();
    return { status: 200, body: { success: true, created, deferredPlay: this.projectDeferredPlay(record, view), message: `${name} will continue this task after the reset.` } };
  }

  private async useAnotherPlayer(gameId: string, fromInstanceId: string, interruptedClientRef: string, toInstanceId: string): Promise<{ status: number; body: Record<string, unknown> }> {
    if (!gameId || !fromInstanceId || !interruptedClientRef || !toInstanceId) return { status: 400, body: { success: false, message: 'Choose which Player should take over.' } };
    if (fromInstanceId === toInstanceId) return { status: 400, body: { success: false, message: 'Choose a different Player to take over.' } };
    const view = this.deferredGameView(gameId);
    const fromName = view.names.get(fromInstanceId) ?? 'the previous Player';
    const entry = this.ledger.get(gameId, fromInstanceId);
    const interrupted = entry?.recentPlays[0];
    if (!interrupted || interrupted.clientRef !== interruptedClientRef || !parseProviderLimitBlocker(interrupted.blocker)) {
      return { status: 409, body: { success: false, message: `That interruption is no longer ${fromName}'s latest Play.` } };
    }
    const intent = this.deferredPlays.forInterruption(gameId, fromInstanceId, interruptedClientRef);
    if (intent) {
      return { status: 409, body: { success: false, message: intent.state === 'handed-off'
        ? `${fromName} is already continuing this task.`
        : `A continuation is scheduled for ${fromName}. Cancel it first, then use another Player.` } };
    }
    const target = view.capabilities.find((candidate) => candidate.instanceId === toInstanceId);
    const toName = view.names.get(toInstanceId) ?? 'That Player';
    if (!target || target.instanceId === SCOUT_PLAYER_INSTANCE_ID || target.executionType === 'scout-formation'
      || target.executionType === 'direct-shell' || target.playerType === 'terminal') {
      return { status: 409, body: { success: false, message: `${toName} can't take over this task.` } };
    }
    if (target.state !== 'ready') return { status: 409, body: { success: false, message: `${toName} can't take the task right now.` } };
    // The existing handoff package (owner, report, previous Play), plus the fixed inspect-then-continue instruction.
    const report = entry?.reports.find((link) => link.clientRef === interruptedClientRef);
    const contextPreamble = buildHandoffPreamble({
      ownerName: fromName,
      ...(report ? { report: { path: report.path, filename: report.filename, mtime: report.mtime, gameId } } : {}),
      ...(interrupted.promptSummary ? { previousPlaySummary: interrupted.promptSummary } : {}),
      reason: 'owner-unavailable'
    });
    const result = await this.router.dispatch({
      gameId,
      routingMode: 'manual',
      playerInstanceId: toInstanceId,
      prompt: HANDOFF_AFTER_LIMIT_INSTRUCTION,
      contextPreamble,
      ...(report ? { incomingReportPath: report.path } : {})
    });
    this.broadcastStatus();
    return {
      status: result.success ? 200 : result.statusCode || 409,
      body: { success: result.success, message: result.success ? `${toName} is taking over the interrupted task.` : (result.message ?? 'The handoff could not be sent.'), status: result.status, playerInstanceId: toInstanceId }
    };
  }

  /** Dad Mode projection of one Game's scheduled continuations. No prompts, no session keys. */
  private projectDeferredPlays(gameId: string): Array<Record<string, unknown>> {
    const view = this.deferredGameView(gameId);
    return this.deferredPlays.forGame(gameId)
      .filter((record) => record.state === 'waiting' || record.state === 'firing' || record.state === 'needs-attention')
      .map((record) => this.projectDeferredPlay(record, view));
  }

  private projectDeferredPlay(record: DeferredPlay, view: DeferredPlayGameView): Record<string, unknown> {
    return {
      id: record.id,
      playerInstanceId: record.playerInstanceId,
      playerName: view.names.get(record.playerInstanceId) ?? 'Player',
      interruptedClientRef: record.interrupted.clientRef,
      state: record.state,
      ...(record.waitingFor ? { waitingFor: record.waitingFor } : {}),
      pool: record.condition.pool,
      resetsAt: record.condition.cycleResetsAt,
      ...(record.attention ? { attention: record.attention } : {}),
      createdAt: record.createdAt
    };
  }

  /** Players whose latest Play was provably stopped by a provider limit and can be scheduled now. */
  private projectContinuations(gameId: string): Array<Record<string, unknown>> {
    const view = this.deferredGameView(gameId);
    if (!view.connected) return [];
    const economics = this.currentRoutingEconomics();
    const receivers = view.capabilities.filter((candidate) => candidate.state === 'ready' && candidate.instanceId !== SCOUT_PLAYER_INSTANCE_ID
      && candidate.executionType !== 'scout-formation' && candidate.executionType !== 'direct-shell' && candidate.playerType !== 'terminal');
    const offers: Array<Record<string, unknown>> = [];
    for (const capability of view.capabilities) {
      const eligibility = continuationEligibility({ capability, entry: this.ledger.get(gameId, capability.instanceId), economics });
      if (!eligibility.eligible) continue;
      if (this.deferredPlays.forInterruption(gameId, capability.instanceId, eligibility.interrupted.clientRef)) continue;
      offers.push({
        playerInstanceId: capability.instanceId,
        playerName: view.names.get(capability.instanceId) ?? 'Player',
        interruptedClientRef: eligibility.interrupted.clientRef,
        pool: eligibility.condition.pool,
        resetsAt: eligibility.condition.cycleResetsAt,
        limit: eligibility.interrupted.blocker.providerCode,
        alternatives: receivers.filter((candidate) => candidate.instanceId !== capability.instanceId)
          .map((candidate) => ({ instanceId: candidate.instanceId, name: view.names.get(candidate.instanceId) ?? candidate.playerType }))
      });
    }
    return offers;
  }

  /** Structural Player-plumbing facts for field triage. Never includes content or secrets. */
  private buildDiagnostics(): Record<string, unknown> {
    const selectedGameId = this.registry.getSelectedGameId();
    return {
      remotePreview: this.remotePreviewGateway.diagnosticsSnapshot(),
      controlPlane: {
        pid: process.pid,
        port: this.boundPort,
        protocolVersion: CONTROL_PLANE_PROTOCOL_VERSION,
        uptimeSeconds: Math.round(process.uptime()),
        routingMode: this.routingMode,
        // Freshness Guard (Advanced only; never in Dad Mode).
        buildId: this.buildId ?? 'unknown',
        instanceId: this.instanceNonce,
        supersedes: this.supersedes,
        replacementReason: this.replacementReason ?? null
      },
      selectedGameId,
      selectedGameRosterCount: countRosterInstances(this.registry.getRosterForGame(selectedGameId)),
      selectedGameCapabilityCount: this.registry.getCapabilitiesForGame(selectedGameId).length,
      selectedGameRosterSynchronized: this.registry.isRosterSynchronizedForGame(selectedGameId),
      sessions: this.registry.getAllSessions().map((session) => ({
        instanceId: session.instanceId,
        stadiumId: session.stadiumId,
        platform: session.platform,
        socketOpen: session.socket.readyState === 1,
        gameId: session.game?.gameId ?? null,
        rosterSynchronized: session.rosterSynchronized,
        rosterSyncedAt: session.rosterSyncedAt || null,
        rosterGroupCount: Array.isArray(session.roster) ? session.roster.length : 0,
        rosterInstanceCount: countRosterInstances(session.roster),
        rosterInstanceIds: rosterInstanceIds(session.roster),
        capabilityCount: Array.isArray(session.capabilities) ? session.capabilities.length : 0,
        capabilityInstanceIds: (Array.isArray(session.capabilities) ? session.capabilities : [])
          .map((entry) => (entry as { instanceId?: unknown }).instanceId)
          .filter((id): id is string => typeof id === 'string'),
        reportCount: Array.isArray(session.reports) ? session.reports.length : 0,
        lastHeartbeat: session.lastHeartbeat,
        expectedControlPlaneBuildId: session.controlPlaneBuildId ?? 'unknown',
        controlPlaneCompatibility: !session.controlPlaneBuildId || !this.buildId
          ? 'unknown'
          : session.controlPlaneBuildId === this.buildId ? 'current' : 'stadium-outdated',
        launcherFreshness: session.controlPlaneFreshness ?? null,
        // Q2.8H dev-harness proof (Advanced only; never in Dad Mode). The daemon does
        // not know the canonical value itself — it just passes through what this
        // Stadium reported so a dev tool running FROM the canonical repo can compare.
        extensionBuildId: session.extensionBuildId ?? 'unknown'
      })),
      at: Date.now()
    };
  }

  private hashSessionToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private resolvePrincipal(req: http.IncomingMessage): Principal | undefined {
    if (!this.authToken) return { kind: 'local-admin', authenticatedBy: 'bearer' };
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (timingSafeSecretEqual(bearer, this.authToken)) return { kind: 'local-admin', authenticatedBy: 'bearer' };
    const sessionToken = parseCookies(req.headers.cookie).get('sl_local');
    if (!sessionToken) return undefined;
    const key = this.hashSessionToken(sessionToken);
    const expiresAt = this.localSessions.get(key);
    if (!expiresAt || expiresAt <= Date.now()) {
      this.localSessions.delete(key);
      return undefined;
    }
    this.localSessions.set(key, Date.now() + 30 * 24 * 60 * 60 * 1000);
    return { kind: 'local-admin', authenticatedBy: 'cookie' };
  }

  private async serveIndex(res: http.ServerResponse): Promise<void> {
    const candidates = [
      path.resolve(__dirname, '..', 'public', 'index.html'),
      path.resolve(__dirname, '..', '..', 'src', 'public', 'index.html'),
      path.resolve(process.cwd(), 'src', 'public', 'index.html')
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          const content = fs.readFileSync(p, 'utf8');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
          return;
        } catch {}
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('index.html not found.');
  }

  private serveServiceWorker(res: http.ServerResponse): void {
    const candidates = [
      path.resolve(__dirname, '..', 'public', 'sw.js'),
      path.resolve(__dirname, '..', '..', 'src', 'public', 'sw.js'),
      path.resolve(process.cwd(), 'src', 'public', 'sw.js')
    ];
    for (const p of candidates) {
      if (!fs.existsSync(p)) continue;
      try {
        const content = fs.readFileSync(p, 'utf8');
        // no-cache keeps a Developer Refresh from leaving an old worker installed.
        res.writeHead(200, {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff'
        });
        res.end(content);
        return;
      } catch { /* try the next candidate */ }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('sw.js not found.');
  }

  private servePairPage(res: http.ServerResponse): void {
    const candidates = [
      path.resolve(__dirname, '..', 'public', 'pair.html'),
      path.resolve(__dirname, '..', '..', 'src', 'public', 'pair.html'),
      path.resolve(process.cwd(), 'src', 'public', 'pair.html')
    ];
    for (const p of candidates) {
      if (!fs.existsSync(p)) continue;
      try {
        const content = fs.readFileSync(p, 'utf8');
        // Strict CSP pinned to the page's own inline script/style hashes: no external loads, no other inline code.
        const hash = (re: RegExp): string => {
          const m = re.exec(content);
          return m ? `'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'` : `'none'`;
        };
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': `default-src 'none'; script-src ${hash(/<script>([\s\S]*?)<\/script>/)}; style-src ${hash(/<style>([\s\S]*?)<\/style>/)}; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`
        });
        res.end(content);
        return;
      } catch { /* try the next candidate */ }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('pair.html not found.');
  }

  private sendJson(res: http.ServerResponse, status: number, data: unknown): void {
    if (res.headersSent) return;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private readJsonBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer | string) => {
        data += chunk.toString();
        if (data.length > 1000000) {
          req.destroy();
          reject(new Error('Payload too large.'));
        }
      });
      req.on('end', () => {
        if (!data.trim()) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }
}

const ENSURE_ATTENTION_CODES: readonly AttentionCode[] = [
  'missing', 'not-a-folder', 'blocked', 'escapes-game', 'inaccessible', 'name-collision', 'create-failed', 'multiple-case-variants'
];

/** An ensure RPC result crosses a process boundary; a malformed code is never trusted. */
function sanitizeEnsureAttention(raw: unknown): { code: AttentionCode; detail?: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const candidate = raw as { code?: unknown; detail?: unknown };
  if (typeof candidate.code !== 'string' || !ENSURE_ATTENTION_CODES.includes(candidate.code as AttentionCode)) return undefined;
  return { code: candidate.code as AttentionCode, ...(typeof candidate.detail === 'string' ? { detail: candidate.detail } : {}) };
}

const SCOUT_BOOTSTRAP_PHASES = new Set(['credential-required', 'ready-to-find', 'declined', 'holding-tryouts', 'scouts-ready', 'provider-limited', 'no-scouts-ready']);
const SCOUT_BOOTSTRAP_CONSENTS = new Set(['not-decided', 'authorized', 'declined']);

/**
 * Rebuild the bootstrap status from an allowlist. Unknown fields are dropped, and every kept
 * field is type-checked and bounded, so the browser only ever sees this shape.
 */
function shapeScoutBootstrapStatus(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.phase !== 'string' || !SCOUT_BOOTSTRAP_PHASES.has(value.phase)) return undefined;
  const count = (input: unknown): number => (typeof input === 'number' && Number.isFinite(input) ? Math.max(0, Math.min(1_000, Math.trunc(input))) : 0);
  const shaped: Record<string, unknown> = {
    phase: value.phase,
    consent: typeof value.consent === 'string' && SCOUT_BOOTSTRAP_CONSENTS.has(value.consent) ? value.consent : 'not-decided',
    credentialConfigured: value.credentialConfigured === true,
    readyCount: count(value.readyCount),
    providerLimitedCount: count(value.providerLimitedCount),
    holdingTryouts: value.holdingTryouts === true,
    canFind: value.canFind === true,
    canRefresh: value.canRefresh === true,
    maxTryouts: count(value.maxTryouts),
    staleDays: count(value.staleDays)
  };
  const last = value.lastRun as Record<string, unknown> | undefined;
  if (last && typeof last === 'object') {
    shaped.lastRun = {
      endedAt: typeof last.endedAt === 'string' ? last.endedAt.slice(0, 40) : '',
      tryoutsHeld: count(last.tryoutsHeld),
      completed: count(last.completed),
      blocked: count(last.blocked),
      failed: count(last.failed),
      ...(last.stopped === true ? { stopped: true } : {}),
      notes: Array.isArray(last.notes) ? last.notes.filter((note): note is string => typeof note === 'string').slice(0, 5).map((note) => note.slice(0, 200)) : []
    };
  }
  return shaped;
}

function rosterInstanceIds(roster: unknown): string[] {
  if (!Array.isArray(roster)) return [];
  const ids: string[] = [];
  for (const group of roster) {
    const instances = (group as { instances?: unknown }).instances;
    if (!Array.isArray(instances)) continue;
    for (const instance of instances) {
      const id = (instance as { instanceId?: unknown }).instanceId;
      if (typeof id === 'string') ids.push(id);
    }
  }
  return ids;
}

function isHealthEvidence(value: unknown): value is HealthEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const evidence = value as Record<string, unknown>;
  const claude = evidence.provider === 'claude' && evidence.type === 'rate_limit_event';
  const codex = evidence.provider === 'codex' && evidence.type === 'account_rate_limits';
  if (!claude && !codex) return false;
  const allowed = claude ? ['provider', 'type', 'rate_limit_info'] : ['provider', 'type', 'rate_limits'];
  if (Object.keys(evidence).some((key) => !allowed.includes(key))) return false;
  const info = claude ? evidence.rate_limit_info : evidence.rate_limits;
  if (!info || typeof info !== 'object' || Array.isArray(info)) return false;
  let nodes = 0;
  const valid = (input: unknown, depth: number): boolean => {
    if (++nodes > 100 || depth > 4) return false;
    if (input === null || typeof input === 'boolean') return true;
    if (typeof input === 'number') return Number.isFinite(input);
    if (typeof input === 'string') return input.length <= 500;
    if (Array.isArray(input)) return input.length <= 20 && input.every((item) => valid(item, depth + 1));
    if (!input || typeof input !== 'object') return false;
    const entries = Object.entries(input as Record<string, unknown>);
    return entries.length <= 30 && entries.every(([key, item]) => Boolean(key) && key.length <= 100 && valid(item, depth + 1));
  };
  return valid(info, 0);
}

function countRosterInstances(roster: unknown): number {
  return rosterInstanceIds(roster).length;
}

// Allow direct execution: `node daemon.js`
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: DaemonOptions = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      options.port = parseInt(args[++i], 10);
    } else if (args[i] === '--dir' && args[i + 1]) {
      options.dir = args[++i];
    } else if (args[i] === '--idle-timeout-ms' && args[i + 1]) {
      options.idleTimeoutMs = parseInt(args[++i], 10);
    }
  }

  // A detached daemon exits after an owner-verified replacement shutdown.
  options.exitOnShutdown = true;
  // Product relay defaults need no Dad configuration. A complete explicit environment override
  // remains available for development; otherwise the private-beta credential is read from the
  // machine-local Sideline store outside the extension package. Remote Access still defaults OFF.
  const sidelineDir = options.dir ?? process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline');
  const remote = resolveRemoteRelayBootstrap(process.env, sidelineDir);
  if (remote.config) options.remoteRelay = remote.config;
  else if (remote.problems.length > 0) console.error(`Remote Access relay configuration ignored; check: ${remote.problems.join(', ')}`);
  if (remote.config && remote.problems.length > 0) console.error(`Remote Access enrollment credential ignored; check: ${remote.problems.join(', ')}`);
  // Global Claude account usage reader: on by default in the real daemon; SIDELINE_CLAUDE_USAGE=0 disables it.
  // Event-driven Claude freshness (watch Claude Code's transcripts); SIDELINE_CLAUDE_ACTIVITY=0 disables it.
  options.claudeUsage = {
    enabled: process.env.SIDELINE_CLAUDE_USAGE !== '0',
    ...(process.env.SIDELINE_CLAUDE_ACTIVITY !== '0' ? { activityDir: defaultClaudeActivityDir() } : {})
  };
  // Global Codex manual usage reader: on by default in the real daemon; SIDELINE_CODEX_USAGE=0 disables it.
  // Event-driven Codex freshness (local rollout size scan); SIDELINE_CODEX_ACTIVITY=0 disables it.
  options.codexUsage = {
    enabled: process.env.SIDELINE_CODEX_USAGE !== '0',
    ...(process.env.SIDELINE_CODEX_ACTIVITY !== '0' ? { activityDir: defaultCodexSessionsDir() } : {})
  };
  const daemon = new ControlPlaneDaemon(options);
  daemon.start().catch((err: unknown) => {
    console.error('Failed to start Control Plane daemon:', err);
    process.exit(1);
  });
}
