// Page-side client for the opt-in device helper (serve.mjs --helper, R-HELP-2, D8): screen power and the CPU
// temperature. Every request is same-origin and relative, so no CORS is involved, and carries the custom header
// the server insists on. Nothing here throws: a missing or failing helper is reported as a value, and each kind of
// failure is logged once (not on every tick) until a success of that kind re-arms it.

const HEADER = { 'X-Poster-Helper': '1' };
const TIMEOUT_MS = 8000; // the server gives a command 5 s

export function createHelper({ fetchImpl = (...args) => fetch(...args), log } = {}) {
  const failed = new Set();
  let available = false;

  const fail = (kind, message, level = 'warn') => {
    if (failed.has(kind)) return;
    failed.add(kind);
    log?.[level]?.(message);
  };

  /** One request; resolves to the parsed JSON body, or null for any failure. Never rejects. */
  async function request(kind, path, init = {}, failLevel) {
    try {
      const res = await fetchImpl(path, {
        ...init,
        headers: { ...HEADER, ...init.headers },
        cache: 'no-store',
        signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('unexpected reply');
      failed.delete(kind);
      return body;
    } catch (err) {
      fail(kind, `Device helper ${kind} failed: ${err?.message || err}`, failLevel);
      return null;
    }
  }

  async function read(kind, failLevel) {
    const body = await request(kind, '__helper/status', {}, failLevel);
    available = body !== null;
    return {
      available,
      power: available && typeof body.power === 'string' ? body.power : null,
      temperature: available && typeof body.temperature === 'string' ? body.temperature : null,
      tempC: available && Number.isFinite(body.tempC) ? body.tempC : null,
    };
  }

  return {
    get available() {
      return available;
    },
    /** Is there a helper behind this page? 404 (not served with --helper), a network error or bad JSON: no. */
    probe: () => read('probe', 'info'),
    /** The same endpoint, for the CPU temperature. */
    status: () => read('status'),
    /** Switch the screen on or off. Resolves {ok}; a failure never throws. */
    async power(on) {
      const body = await request('power', '__helper/display', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on }),
      });
      return { ok: body !== null };
    },
  };
}
