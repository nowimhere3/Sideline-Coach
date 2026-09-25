import type { Principal } from './request-security';

export type RouteAccess = 'public' | 'local-only' | 'remote-read' | 'remote-mutate';

export interface RoutePolicy {
  readonly methods: readonly string[];
  readonly path: string | RegExp;
  readonly access: RouteAccess;
}

/**
 * Remote Access v1 default-deny route policy. Add every new daemon route here in
 * the same change that adds the handler; the coverage test rejects omissions.
 */
export const DAEMON_ROUTE_POLICIES: readonly RoutePolicy[] = [
  { methods: ['GET'], path: '/', access: 'public' },
  { methods: ['GET'], path: '/index.html', access: 'public' },
  { methods: ['GET'], path: '/pair', access: 'public' },
  { methods: ['GET'], path: '/pair.html', access: 'public' },
  { methods: ['GET'], path: '/api/health', access: 'public' },
  { methods: ['POST'], path: '/api/session', access: 'local-only' },
  { methods: ['POST'], path: /^\/api\/control-plane\//, access: 'local-only' },
  { methods: ['GET'], path: '/api/events', access: 'remote-read' },
  { methods: ['GET'], path: '/api/ai-health', access: 'remote-read' },
  { methods: ['POST'], path: '/api/ai-health/refresh', access: 'remote-mutate' },
  { methods: ['GET'], path: '/api/player-activity', access: 'remote-read' },
  { methods: ['GET'], path: '/api/status', access: 'remote-read' },
  { methods: ['GET'], path: '/api/games/files/browse', access: 'remote-read' },
  { methods: ['POST'], path: '/api/games/files/check', access: 'remote-read' },
  { methods: ['GET'], path: '/api/games/files/search', access: 'remote-read' },
  { methods: ['POST'], path: '/api/games/files/absolute-path', access: 'remote-read' },
  { methods: ['GET'], path: '/api/games/filesystem', access: 'remote-read' },
  { methods: ['POST'], path: /^\/api\/games\/filesystem\/(?:reinspect|choose|restore)$/, access: 'remote-mutate' },
  { methods: ['POST'], path: /^\/api\/games\/filesystem\//, access: 'local-only' },
  { methods: ['GET'], path: '/api/routines', access: 'remote-read' },
  { methods: ['POST'], path: '/api/routines', access: 'remote-mutate' },
  { methods: ['GET', 'POST'], path: '/api/routines/sources/suggest', access: 'remote-read' },
  { methods: ['GET', 'POST'], path: '/api/routines/sources/browse', access: 'remote-read' },
  { methods: ['POST'], path: '/api/routines/sources/check', access: 'remote-read' },
  { methods: ['PATCH'], path: '/api/routines/repository', access: 'remote-mutate' },
  { methods: ['POST', 'PATCH', 'DELETE'], path: /^\/api\/routines\/[^/]+(?:\/due)?$/, access: 'remote-mutate' },
  { methods: ['POST'], path: '/api/routines/delivered', access: 'remote-mutate' },
  { methods: ['GET'], path: '/api/diagnostics', access: 'local-only' },
  { methods: ['GET'], path: '/api/games', access: 'remote-read' },
  { methods: ['POST'], path: '/api/game/select', access: 'remote-mutate' },
  { methods: ['POST'], path: '/api/dispatch', access: 'remote-mutate' },
  { methods: ['GET'], path: '/api/reports', access: 'remote-read' },
  { methods: ['GET'], path: '/api/report', access: 'remote-read' },
  { methods: ['GET'], path: '/api/queue', access: 'remote-read' },
  { methods: ['POST'], path: '/api/work/acknowledge', access: 'remote-mutate' },
  { methods: ['POST'], path: /^\/api\/queue\/[^/]+\/(?:cancel|retry)$/, access: 'remote-mutate' },
  { methods: ['POST'], path: '/api/reports/rescan', access: 'remote-mutate' },
  { methods: ['POST'], path: '/api/route', access: 'remote-mutate' },
  { methods: ['POST'], path: '/api/route/preview', access: 'remote-read' },
  { methods: ['POST'], path: /^\/api\/game\/(?:add|archive|restore)$/, access: 'remote-mutate' },
  { methods: ['GET'], path: '/api/games/archived', access: 'remote-read' },
  { methods: ['POST'], path: '/api/players/discover', access: 'remote-read' },
  { methods: ['POST'], path: '/api/players/add', access: 'remote-mutate' },
  { methods: ['POST'], path: '/api/players/adopt', access: 'remote-mutate' },
  { methods: ['POST'], path: '/api/players/adopt-terminal', access: 'remote-mutate' },
  { methods: ['POST'], path: '/api/players/helper-terminal', access: 'remote-mutate' },
  { methods: ['POST'], path: /^\/api\/players\/instance\/[^/]+\/(?:field|bench|remove|send)$/, access: 'remote-mutate' },
  { methods: ['POST'], path: /^\/api\/players\/[^/]+\/(?:field|instances|controlled-instances)$/, access: 'remote-mutate' },
  { methods: ['POST'], path: /^\/api\/players(?:\/|$)/, access: 'local-only' },
  { methods: ['GET', 'POST', 'DELETE'], path: '/api/scout/openrouter-credential', access: 'local-only' },
  { methods: ['GET', 'POST'], path: '/api/scout/bootstrap', access: 'local-only' },
  { methods: ['GET'], path: '/api/scout/formation-receivers', access: 'remote-read' },
  { methods: ['POST'], path: '/api/scout/formation-run', access: 'remote-mutate' },
  { methods: ['GET'], path: '/api/preferences', access: 'remote-read' },
  { methods: ['POST'], path: '/api/preferences', access: 'remote-mutate' },
  { methods: ['POST'], path: '/api/capabilities/refresh', access: 'remote-mutate' },
  { methods: ['POST'], path: '/api/pairing/create', access: 'local-only' },
  { methods: ['POST'], path: '/api/pairing/exchange', access: 'public' },
  { methods: ['GET', 'DELETE'], path: '/api/devices', access: 'local-only' },
  { methods: ['PATCH', 'DELETE'], path: /^\/api\/devices\/[^/]+$/, access: 'local-only' },
  { methods: ['GET'], path: '/stadium', access: 'local-only' }
];

export function classifyDaemonRoute(method: string, pathname: string): RouteAccess | undefined {
  const upper = method.toUpperCase();
  return DAEMON_ROUTE_POLICIES.find((route) => route.methods.includes(upper)
    && (typeof route.path === 'string' ? route.path === pathname : route.path.test(pathname)))?.access;
}

export function isKnownDaemonRoutePath(pathname: string): boolean {
  return DAEMON_ROUTE_POLICIES.some((route) => typeof route.path === 'string' ? route.path === pathname : route.path.test(pathname));
}

export function principalMayAccess(principal: Principal, access: RouteAccess): boolean {
  if (principal.kind === 'local-admin') return true;
  return access === 'remote-read' || access === 'remote-mutate';
}
