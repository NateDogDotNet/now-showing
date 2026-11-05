// The HTTP helpers every source adapter uses. Their own module so that no adapter imports another adapter for them
// (js/sources/errors.js states the same design for SourceError).

/** Builds a URL with query params; values that are '' / null / undefined are skipped. */
export function buildUrl(base, path, params = {}) {
  const url = new URL(path, base.endsWith('/') ? base : base + '/');
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v !== null && v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
