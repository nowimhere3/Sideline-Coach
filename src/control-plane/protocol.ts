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
}

export interface PlayerActionResult {
  success: boolean;
  message?: string;
  [key: string]: unknown;
}

export interface CapabilityRefreshParams {
  gameId: string;
}

export interface ControlPlaneDiscoveryRecord {
  protocolVersion: number;
  port: number;
  pid: number;
  startedAt: number;
  controlPlaneUrl: string;
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
