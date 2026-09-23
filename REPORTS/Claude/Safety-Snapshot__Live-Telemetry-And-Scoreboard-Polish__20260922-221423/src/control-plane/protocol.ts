/**
 * Control Plane Protocol
 * Versioned typed JSON-RPC 2.0 frames for communication between the detached
 * Control Plane daemon and Stadium extension clients.
 */

import type { FolderState, ReportLaneRecord } from '../game-filesystem-contract';

export const CONTROL_PLANE_PROTOCOL_VERSION = 1;

export interface JsonRpcRequest<T = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params: T;
}

export interface JsonRpcNotification<T = unknown> {
  jsonrpc: '2.0';
  method: string;
  params: T;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  result: T;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: JsonRpcErrorObject;
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse
  | JsonRpcErrorResponse;

export interface StadiumHelloParams {
  protocolVersion: number;
  stadiumId: string;
  instanceId: string;
  name: string;
  platform: string;
  token: string;
  game?: GameIdentityPayload;
  rootFsPath?: string;
  /** Control Plane build this Stadium loaded (Freshness Guard). */
  controlPlaneBuildId?: string;
  controlPlaneFreshness?: ControlPlaneFreshness;
  /**
   * Q2.8H dev-harness proof: the SAME content-hash identity Freshness Guard already
   * uses (computeControlPlaneBuild), but over THIS Stadium's own extension entrypoint
   * (out/extension.js) rather than the daemon's. Proves which extension SOURCE TREE
   * is actually running this Extension Development Host — independent of, and never
   * inferred from, the Game workspace it happens to be pointed at. Development-only;
   * never surfaced in Dad Mode.
   */
  extensionBuildId?: string;
  /** Additive Stadium capabilities used to handle mixed-version windows safely. */
  features?: string[];
}

export interface StadiumWelcomeResult {
  protocolVersion: number;
  controlPlaneId: string;
  heartbeatIntervalMs: number;
}

export interface StadiumHeartbeatParams {
  instanceId: string;
  timestamp: number;
}

export interface GameIdentityPayload {
  gameId: string;
  displayName: string;
  fingerprintSource: string;
  repoUri?: string;
}

export interface GameConnectedParams {
  stadiumId: string;
  instanceId: string;
  game: GameIdentityPayload;
  rootFsPath?: string;
}

export interface GameDisconnectedParams {
  stadiumId: string;
  instanceId: string;
  gameId: string;
}

export interface RosterSnapshotParams {
  stadiumId: string;
  instanceId: string;
  gameId: string;
  roster: unknown[];
}

export interface CapabilitySnapshotParams {
  stadiumId: string;
  instanceId: string;
  gameId: string;
  capabilities: unknown[];
}

export interface PlayerDiscoverySnapshotParams {
  stadiumId: string;
  instanceId: string;
  gameId: string;
  discovery: unknown;
}

export interface ReportSnapshotParams {
  stadiumId: string;
  instanceId: string;
  gameId: string;
  reports: unknown[];
}

export interface TurnChangedParams {
  stadiumId: string;
  instanceId: string;
  gameId: string;
  turn: unknown;
}

/** Sanitized exact-Player activity (Live Player Terminal). `instanceId` is the Stadium session; the Player is `activity.instanceId`. */
export interface PlayerActivityParams {
  stadiumId: string;
  instanceId: string;
  gameId: string;
  activity: unknown;
}

/** Bounded, provider-native evidence only. Interpretation belongs to Health Authority. */
export interface ClaudeHealthEvidence {
  provider: 'claude';
  type: 'rate_limit_event';
  rate_limit_info: Record<string, unknown>;
}

export interface CodexHealthEvidence {
  provider: 'codex';
  type: 'account_rate_limits';
  rate_limits: Record<string, unknown>;
}

export type HealthEvidence = ClaudeHealthEvidence | CodexHealthEvidence;

export interface HealthEvidenceParams {
  stadiumId: string;
  instanceId: string;
  gameId: string;
  playerInstanceId: string;
  evidence: HealthEvidence;
}

// 'retained': the read succeeded but the authority did not accept all of it, so the
// card still shows older values for the windows named in `notReflected`.
export type ClaudeRefreshOutcome = 'changed' | 'unchanged' | 'retained' | 'rate_limited' | 'auth_rejected' | 'unavailable' | 'failed';
export type CodexRefreshOutcome = 'changed' | 'unchanged' | 'unavailable' | 'failed';

export interface AiHealthAcquisitionStatus {
  claude?: {
    outcome: ClaudeRefreshOutcome;
    reason?: string;
    code?: string;
    notReflected?: string[];
    checkedAt: string;
  };
  codex?: {
    outcome: CodexRefreshOutcome;
    reason?: string;
    code?: string;
    checkedAt: string;
  };
}

const REFRESH_PROVIDER_LABELS = { claude: 'Claude', codex: 'Codex' } as const;
const REFRESH_PROBLEM_LABELS: Record<string, string> = { rate_limited: 'rate-limited', unavailable: 'unavailable', retained: 'not updated' };

/**
 * Refresh button label. "Refreshed ✓" ONLY when every provider's read succeeded and
 * is what the card now shows; any other provider is named with why its data is not
 * current. Mirrored by aiScoreboardRefreshStatus in src/public/index.html.
 */
export function formatRefreshFeedback(acquisition?: AiHealthAcquisitionStatus): string {
  if (!acquisition) return 'Refresh failed';
  const providers = (['claude', 'codex'] as const).filter((p) => acquisition[p]);
  const good = (p: 'claude' | 'codex') => acquisition[p]?.outcome === 'changed' || acquisition[p]?.outcome === 'unchanged';
  const problem = (p: 'claude' | 'codex') => REFRESH_PROBLEM_LABELS[acquisition[p]?.outcome ?? ''] ?? 'failed';
  const bad = providers.filter((p) => !good(p));
  if (providers.length === 0) return 'Refresh failed';
  if (bad.length === 0) return 'Refreshed ✓';
  if (bad.length === providers.length && bad.every((p) => problem(p) === 'failed')) return 'Refresh failed';
  return [
    ...providers.filter(good).map((p) => `${REFRESH_PROVIDER_LABELS[p]} refreshed`),
    ...bad.map((p) => `${REFRESH_PROVIDER_LABELS[p]} ${problem(p)}`)
  ].join(' · ');
}


export interface DispatchRequestParams {
  clientRef: string;
  stadiumId: string;
  gameId: string;
  playerInstanceId?: string;
  terminalName?: string;
  prompt: string;
  modelSwitch?: string;
  routingMode?: string;
  model?: string;
  effort?: string;
}

export interface DispatchAcceptedParams {
  clientRef: string;
  stadiumId: string;
  gameId: string;
  playerInstanceId: string;
  turnRef?: string;
  acceptedAt: number;
}

export interface DispatchRejectedParams {
  clientRef: string;
  stadiumId: string;
  gameId: string;
  playerInstanceId: string;
  error: {
    code: number;
    message: string;
  };
}

export interface PlayerActionParams {
  action: 'field' | 'instance' | 'controlled';
  playerId: string;
  gameId: string;
  /** The human explicitly chose to start another copy of an already-running Player. */
  allowDuplicate?: boolean;
}

export interface PlayerActionResult {
  success: boolean;
  message?: string;
  [key: string]: unknown;
}

export interface CapabilityRefreshParams {
  gameId: string;
}

export interface ScoutOpenRouterCredentialParams {
  gameId: string;
  apiKey?: string;
}

/** Safe projection only. The stored credential is never an RPC response. */
export interface ScoutOpenRouterCredentialResult {
  success: boolean;
  gameId: string;
  configured: boolean;
  available: boolean;
  message?: string;
}

export interface GameFilesBrowseParams {
  gameId: string;
  dir?: string;
}

export interface GameFilesCheckParams {
  gameId: string;
  paths: string[];
}

export interface GameFilesSearchParams {
  gameId: string;
  query: string;
  limit?: number;
  searchId: string;
  /** S4: only explicit Enter may opt a one-character query into the bounded Search. */
  allowSingleCharacter?: boolean;
}

export interface GameFilesResolveAbsoluteParams {
  gameId: string;
  path: string;
}

export interface GameFilesBrowseResult {
  success: boolean;
  gameId?: string;
  dir?: string;
  entries?: Array<{ name: string; path: string; kind: 'file' | 'folder' }>;
  truncated?: boolean;
  message?: string;
}

export interface GameFilesCheckResult {
  success: boolean;
  gameId?: string;
  checkedAt?: number;
  checks?: Array<{ path: string; state: 'file' | 'folder' | 'missing' | 'blocked' | 'unknown' }>;
  message?: string;
}

export interface GameFilesSearchResult {
  success: boolean;
  gameId?: string;
  query?: string;
  searchId?: string;
  results?: Array<{ name: string; path: string; kind: 'file' | 'folder' }>;
  truncated?: boolean;
  limitReason?: 'entries' | 'directories' | 'depth' | 'time';
  moreMatches?: boolean;
  superseded?: boolean;
  message?: string;
}

/** S6: read-only Game filesystem evidence for the GameFilesystemContract. */
export interface GameFilesystemInspectParams {
  gameId: string;
  /** Contract paths whose current state the Stadium must confirm. */
  checkPaths?: string[];
}

export interface GameFilesystemInspectResult {
  success: boolean;
  gameId?: string;
  evidence?: unknown;
  message?: string;
}

/** S7: minimal durable contract projection from Control Plane to the exact Stadium. */
export interface GameFilesystemApplyParams {
  gameId: string;
  revision: number;
  reports: { path?: string; state: FolderState };
  lanes: Record<string, ReportLaneRecord>;
}

export interface GameFilesystemApplyResult {
  success: boolean;
  gameId?: string;
  revision?: number;
  applied?: boolean;
  stale?: boolean;
  reportsChanged?: boolean;
  message?: string;
}

/**
 * S8.0: the one narrow mutation request. `root` creates at most one exact
 * Game-root folder; `lanes` ensures at most `lanesRoot`-relative child
 * folders. Both are optional and independent — a request may ensure lanes
 * only, under a root that already exists.
 */
export interface GameFilesystemEnsureParams {
  gameId: string;
  revision: number;
  root?: { name: string };
  lanesRoot?: string;
  lanes?: string[];
}

export interface GameFilesystemEnsureFolderResult {
  folder: string;
  created: boolean;
  state: 'ready' | 'needs-attention';
  attention?: { code: string; detail?: string };
}

export interface GameFilesystemEnsureResult {
  success: boolean;
  gameId?: string;
  revision?: number;
  root?: GameFilesystemEnsureFolderResult & { name: string };
  lanes?: Record<string, GameFilesystemEnsureFolderResult>;
  message?: string;
}

export interface GameFilesResolveAbsoluteResult {
  success: boolean;
  gameId?: string;
  path?: string;
  available?: boolean;
  absolutePath?: string;
  reason?: 'missing' | 'blocked' | 'unknown' | 'virtual-workspace';
  pathStyle?: 'windows' | 'posix';
  environment?: 'local' | 'remote';
  remoteLabel?: 'WSL' | 'SSH' | 'Dev Container' | 'Remote';
  message?: string;
}

// --- Q2.9 Game lifecycle ---------------------------------------------------

/** Stadium -> Control Plane: the repository the human chose in the native picker. */
export interface GamePickResult {
  success: boolean;
  cancelled?: boolean;
  folderPath?: string;
  game?: GameIdentityPayload;
  message?: string;
}

/** Control Plane -> Stadium: open a window on this Game. */
export interface GameOpenParams {
  gameId: string;
  folderPath: string;
  displayName?: string;
}

export interface GameOpenResult {
  success: boolean;
  /** 'opened' a new window, 'focused' an existing one, or 'failed'. */
  outcome?: 'opened' | 'focused' | 'failed';
  message?: string;
}

// --- Q2.9 Player lifecycle -------------------------------------------------

export interface PlayerDiscoverParams {
  gameId: string;
}

/** Coach never runs an install or sign-in command silently; it only opens the terminal. */
export interface PlayerHelperTerminalParams {
  gameId: string;
  playerType: string;
  purpose: 'install' | 'authenticate';
}

export interface PlayerLifecycleParams {
  gameId: string;
  /** Exactly one of these identifies the target. */
  playerInstanceId?: string;
  playerType?: string;
  /** Adoption targets a shell by pid, never by terminal name. */
  shellPid?: number;
}

export interface TerminalSendParams {
  gameId: string;
  playerInstanceId: string;
  text: string;
  enter?: boolean;
}

export interface PlayerLifecycleResult {
  success: boolean;
  message?: string;
  instanceId?: string;
  ownership?: string;
  [key: string]: unknown;
}

export interface ControlPlaneDiscoveryRecord {
  protocolVersion: number;
  port: number;
  pid: number;
  startedAt: number;
  controlPlaneUrl: string;
  /** Freshness Guard (P0.1). Absent on daemons built before the guard existed. */
  service?: string;
  instanceId?: string;
  buildId?: string;
  daemonScriptPath?: string;
  supersedes?: string[];
}

/** How a Stadium's launcher judged the Control Plane it connected to. */
export interface ControlPlaneFreshness {
  verdict: 'current' | 'stale' | 'stadium-outdated' | 'unknown';
  expectedBuildId?: string;
  runningBuildId?: string;
  replaced: boolean;
  reason: string;
}

// Helpers

export function buildRpcRequest<T>(id: string | number, method: string, params: T): JsonRpcRequest<T> {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params
  };
}

export function buildRpcNotification<T>(method: string, params: T): JsonRpcNotification<T> {
  return {
    jsonrpc: '2.0',
    method,
    params
  };
}

export function buildRpcResponse<T>(id: string | number, result: T): JsonRpcResponse<T> {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

export function buildRpcError(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data
    }
  };
}

export function isJsonRpcRequest(obj: unknown): obj is JsonRpcRequest {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
    'id' in obj &&
    typeof (obj as { method?: unknown }).method === 'string'
  );
}

export function isJsonRpcNotification(obj: unknown): obj is JsonRpcNotification {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
    !('id' in obj) &&
    typeof (obj as { method?: unknown }).method === 'string'
  );
}

export function isJsonRpcResponse(obj: unknown): obj is JsonRpcResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
    'id' in obj &&
    'result' in obj
  );
}

export function isJsonRpcError(obj: unknown): obj is JsonRpcErrorResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
    'error' in obj &&
    typeof (obj as { error?: { code?: unknown; message?: unknown } }).error?.code === 'number'
  );
}
