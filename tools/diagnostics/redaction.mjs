const TOKEN_PREFIXES = ['ghp_', 'github_pat_', 'ya29.', 'sk-', 'AIza', 'xoxb-', 'Bearer ', 'eyJ'];

export function redactPath(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/^([A-Za-z]:\\Users\\)[^\\/]+/i, '$1<user>');
}

export function tokenShape(value) {
  if (typeof value !== 'string') return false;
  return TOKEN_PREFIXES.some((prefix) => value.startsWith(prefix))
    || /[A-Za-z0-9+/_=-]{20,}/.test(value);
}

export function safeText(value, { path = false, filename = false, maxLength = 512 } = {}) {
  if (value === undefined || value === null) return 'unknown';
  let result = String(value);
  if (path) result = redactPath(result);
  if (!path && !filename && tokenShape(result)) return '<redacted:shape>';
  if (filename && (TOKEN_PREFIXES.some((prefix) => result.includes(prefix)) || /^[a-f0-9]{32,}$/i.test(result.replace(/\.[^.]+$/, '')))) return '<redacted:shape>';
  if (result.length > maxLength) return `${result.slice(0, maxLength)}… [truncated; see Diagnostics/local/CURRENT.md]`;
  return result;
}

export function publicUrlClassification(value) {
  if (!value) return { state: 'unset', scheme: 'unknown' };
  try {
    return { state: 'set', scheme: new URL(value).protocol.replace(':', '') || 'unknown' };
  } catch {
    return { state: 'set', scheme: 'unknown' };
  }
}
