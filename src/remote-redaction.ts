import type { Principal } from './control-plane/request-security';

/**
 * Remote Access boundary ownership:
 * - these shared patterns protect remote report/file/terminal presentation;
 * - local trusted product views remain verbatim unless their existing feature sanitizes them;
 * - only a call explicitly marked `terminalActivity` may honor the Dev terminal override;
 * - hard secret patterns run even under that override, while route/file/credential policy
 *   is also enforced upstream and never bypassed here.
 */

const REDACTED = '[redacted]';
const SECRET_NAME = '(?:api[_-]?key|apikey|token|secret|passw(?:or)?d|pwd|credential|private[_-]?key|access[_-]?key|client[_-]?secret|auth(?:orization)?(?![a-z])|cookie|bearer)';

const REDACTION_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, REDACTED],
  [/\b((?:Proxy-)?Authorization)\s*[:=]\s*(?:(?:Bearer|Basic|Token)\s+)?[^\s"',;]+/gi, `$1: ${REDACTED}`],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED}`],
  [/\b(?:sk|pk|rk)-(?:ant-|or-v1-|proj-)?[A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, REDACTED],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, REDACTED],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, REDACTED],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, REDACTED],
  [/\bnpm_[A-Za-z0-9]{30,}/g, REDACTED],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, `$1${REDACTED}@`],
  [/([?&](?:access_token|api[_-]?key|apikey|token|key|secret|password|sig|signature|auth|code)=)[^&\s"']+/gi, `$1${REDACTED}`],
  [new RegExp(`(--?${SECRET_NAME}(?:=|\\s+))(?:"[^"]*"|'[^']*'|[^\\s"']+)`, 'gi'), `$1${REDACTED}`],
  [new RegExp(`\\b([A-Za-z0-9_.$:-]*${SECRET_NAME}[A-Za-z0-9_.-]*)(["']?\\s*[=:]\\s*)("[^"]*"|'[^']*'|[^\\s"',;]+)`, 'gi'), `$1$2${REDACTED}`],
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{40,}\b/g, REDACTED]
];

export function redactSecrets(text: string): string {
  let out = String(text);
  for (const [pattern, replacement] of REDACTION_RULES) out = out.replace(pattern, replacement);
  return out;
}

function redactRemoteTerminalDetails(text: string): string {
  return text
    .replace(/\b[A-Za-z]:\\(?:Users|Documents and Settings)\\[^\s"'|<>]+/gi, '[redacted path]')
    .replace(/\/(?:Users|home)\/[^\s"'|<>]+/g, '[redacted path]');
}

export function redactForPrincipal<T>(value: T, principal: Principal, options: { terminalActivity?: boolean; allowSensitiveTerminalOutput?: boolean } = {}): T {
  if (principal.kind === 'local-admin') return value;
  const visit = (input: unknown): unknown => {
    if (typeof input === 'string') {
      const hardSafe = redactSecrets(input);
      return options.terminalActivity && !options.allowSensitiveTerminalOutput
        ? redactRemoteTerminalDetails(hardSafe)
        : hardSafe;
    }
    if (Array.isArray(input)) return input.map(visit);
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([key, nested]) => [key, visit(nested)]));
    return input;
  };
  return visit(value) as T;
}
