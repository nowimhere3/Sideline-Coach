/**
 * Control Plane Protocol
 * Versioned typed JSON-RPC 2.0 frames for communication between the detached
 * Control Plane daemon and Stadium extension clients.
 */

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
