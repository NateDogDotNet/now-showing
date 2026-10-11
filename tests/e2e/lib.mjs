// Shared helpers for the browser specs (tests/e2e/*.spec.mjs).
//
//   await withApp({ settings, viewport, hasTouch, isMobile, clock, serviceWorkers,
//                   serveArgs, localStorage }, async ({ page, context, app, mock }) => { ... });
//
// app = { url, port, mockPort, argv, stop() }. Without serveArgs the spec uses the shared server
// that run.mjs started on E2E_PORT / E2E_MOCK_PORT. Passing serveArgs (even []) starts a dedicated
// `serve.mjs --mock` child on freshly probed ports, which is killed when the callback returns.

import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const SERVE = join(ROOT, 'scripts', 'serve.mjs');
export const E2E_PORT = Number(process.env.E2E_PORT || 18080);
export const E2E_MOCK_PORT = Number(process.env.E2E_MOCK_PORT || 18401);

// Prefer the local devDependency; fall back to the global install (a bare ESM import does not find it).
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const mod = createRequire(`${execSync('npm root -g').toString().trim()}/`)('playwright');
    return mod.default || mod;
  }
}
const pw = await loadPlaywright();
const chromium = pw.chromium || pw.default?.chromium;

// Defaults every spec starts from (convention 7): geometry specs must not see pixel shift,
// and the upgrade toast must not interfere.
const DEFAULT_SETTINGS = { pixelShift: false, dailyReload: false };
const WHATS_NEW_MARKER = 'e2e';

// K48: no spec reaches the real plex.tv. A page with no Plex token asks plex.tv for a sign-in code on load, so such a
// context answers plex.tv itself: a code that is never approved and an empty resource list. A spec that tests the
// sign-in installs its own context.route after this one (Playwright tries the most recent route first), so it wins.
// A context that has a token never reaches plex.tv on load and gets no route at all: any route turns on Playwright's
// request interception, which changes cache and service-worker behaviour (pi-stability depends on neither changing).
const STUB_HOST = 'plex.tv';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

async function stubPlexTv(context) {
  await context.route(`https://${STUB_HOST}/**`, (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    const headers = { 'access-control-allow-origin': '*' };
    const json = (body) => route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() === 'POST' && pathname === '/api/v2/pins') {
      return json({ id: 1, code: 'STUB', expiresIn: 900, expiresAt: new Date(Date.now() + 900_000).toISOString(), authToken: null });
    }
    if (pathname.startsWith('/api/v2/pins/')) return json({ id: 1, code: 'STUB', authToken: null });
    if (pathname === '/api/v2/resources') return json([]);
    return route.fulfill({ status: 404, headers, body: '' });
  });
}

/**
 * Records every request that leaves the machine: any host that is not local, and any plex.tv request that no route
 * handler fulfilled or aborted (the default stub, or the spec's own). A route that merely matches a plex.tv pattern proves
 * nothing: a spec that answers `/api/v2/pins` and nothing else must have its `/api/v2/resources` flagged, and a handler
 * that passes a request on with `route.fallback()` to nobody leaves it unanswered too. `route.continue()` is no answer
 * either: it sends the request on to the real plex.tv, which is exactly what K48 forbids. `assertClean()`
 * throws if there was one, so the spec fails and the suite cannot silently reach out again.
 */
export function guardNetwork(context) {
  const outside = new Set();
  const plexTv = new Map(); // request -> "METHOD url"
  const answered = new WeakSet(); // requests a route handler fulfilled or aborted; continue() reaches the real service and does not count
  const track = (route) => {
    if (route.__guarded) return; // one Route object travels through every handler that falls back to the next
    route.__guarded = true;
    for (const method of ['fulfill', 'abort']) {
      const original = route[method].bind(route);
      route[method] = (...args) => {
        answered.add(route.request());
        return original(...args);
      };
    }
  };
  const watch = (owner) => {
    const original = owner.route.bind(owner);
    owner.route = (url, handler, ...rest) => original(url, typeof handler === 'function' ? (route, ...args) => (track(route), handler(route, ...args)) : handler, ...rest);
  };
  watch(context);
  context.on?.('page', watch);
  context.on('request', (req) => {
    const { protocol, hostname } = new URL(req.url());
    if (!/^https?:$/.test(protocol)) return; // data:, blob:, about:
    if (LOCAL_HOSTS.has(hostname)) return;
    if (hostname === STUB_HOST) plexTv.set(req, `${req.method()} ${req.url()}`);
    else outside.add(`${req.method()} ${req.url()}`);
  });
  return {
    async assertClean() {
      await new Promise((resolve) => setTimeout(resolve, 150)); // a request made just now may not have reached its handler yet
      const unanswered = [...plexTv].filter(([req]) => !answered.has(req)).map(([, label]) => `${label} (plex.tv, no route answered it: fulfill or abort it, continue() reaches the real service)`);
      const found = [...outside, ...unanswered];
      if (found.length) throw new Error(`the spec reached beyond the local servers (K48):\n  ${found.join('\n  ')}`);
    },
  };
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Spawn serve.mjs and resolve once both servers print their banner. Rejects if it exits first. */
export function spawnServe(argv) {
  const child = spawn(process.execPath, [SERVE, ...argv], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  const ready = new Promise((resolve, reject) => {
    const onData = (d) => {
      out += d;
      if (/Mock Plex server/.test(out)) resolve();
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => (out += d));
    child.once('exit', (code) => reject(Object.assign(new Error(`serve.mjs exited ${code}: ${out}`), { output: out })));
  });
  return { child, ready };
}

async function startDedicated(serveArgs) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    const port = await freePort();
    let mockPort = await freePort();
    while (mockPort === port) mockPort = await freePort();
    const argv = ['--mock', '--port', String(port), '--mock-port', String(mockPort), ...serveArgs];
    const { child, ready } = spawnServe(argv);
    try {
      await ready;
      return { child, port, mockPort, argv: ['--mock', ...serveArgs], spawned: argv };
    } catch (e) {
      child.kill();
      if (!/EADDRINUSE/.test(e.output || '')) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

function makeMock(mockPort) {
  const base = `http://127.0.0.1:${mockPort}/__mock/`;
  const call = async (method, action, params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await fetch(`${base}${action}${q ? `?${q}` : ''}`, { method });
    return res.json();
  };
  return {
    get: (action) => call('GET', action),
    post: (action, params) => call('POST', action, params),
    play: (ratingKey, params = {}) => call('POST', 'play', { ratingKey, ...params }),
    stop: () => call('POST', 'stop'),
    down: () => call('POST', 'down'),
    up: () => call('POST', 'up'),
    stats: () => call('GET', 'stats'),
  };
}

export async function withApp(opts, fn) {
  const { settings = {}, viewport, hasTouch = false, isMobile = false, clock, serviceWorkers = 'block', serveArgs, localStorage = {} } = opts;

  let dedicated = null;
  let app;
  if (serveArgs) {
    dedicated = await startDedicated(serveArgs);
    app = { url: `http://127.0.0.1:${dedicated.port}/`, port: dedicated.port, mockPort: dedicated.mockPort, argv: dedicated.argv, spawned: dedicated.spawned };
    app.stop = () => dedicated.child.kill();
  } else {
    app = { url: `http://127.0.0.1:${E2E_PORT}/`, port: E2E_PORT, mockPort: E2E_MOCK_PORT, argv: ['--mock'], stop() {} };
  }

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({
      viewport: viewport || { width: 1280, height: 720 },
      hasTouch,
      isMobile,
      serviceWorkers: serviceWorkers === 'allow' ? 'allow' : 'block',
    });
    // `settings` may be a function of app so a dedicated server's mock port can be used in the seed.
    const seed = { ...DEFAULT_SETTINGS, ...(typeof settings === 'function' ? settings(app) : settings) };
    const guard = guardNetwork(context);
    if (!seed.plexToken) await stubPlexTv(context);
    const page = await context.newPage();

    await context.addInitScript(
      ({ seed, extra, marker }) => {
        // Seed only when absent so a reload keeps whatever the app saved since.
        const put = (k, v) => localStorage.getItem(k) === null && localStorage.setItem(k, v);
        put('plexPoster.settings', JSON.stringify(seed));
        put('plexPoster.whatsNew', marker);
        for (const [k, v] of Object.entries(extra)) put(k, String(v));
        // Headless Chromium has no usable wake lock: count requests instead.
        const wl = (window.__wakeLock = { held: 0, requests: 0, releases: 0 });
        Object.defineProperty(navigator, 'wakeLock', {
          configurable: true,
          value: {
            request: async () => {
              wl.requests++;
              wl.held++;
              const listeners = [];
              const sentinel = {
                released: false,
                type: 'screen',
                addEventListener: (type, fn) => type === 'release' && listeners.push(fn),
                removeEventListener: (type, fn) => {
                  const i = listeners.indexOf(fn);
                  if (type === 'release' && i >= 0) listeners.splice(i, 1);
                },
                release: async () => {
                  if (sentinel.released) return;
                  sentinel.released = true;
                  wl.held--;
                  wl.releases++;
                  for (const fn of [...listeners]) fn.call(sentinel, { type: 'release', target: sentinel });
                  sentinel.onrelease?.({ type: 'release', target: sentinel });
                },
              };
              return sentinel;
            },
          },
        });
      },
      { seed, extra: localStorage, marker: WHATS_NEW_MARKER },
    );
    if (clock) await page.clock.install(clock);

    const result = await fn({ page, context, app, mock: makeMock(app.mockPort) });
    await guard.assertClean();
    return result;
  } finally {
    await browser.close().catch(() => {});
    if (dedicated) dedicated.child.kill();
  }
}

/** Save a PNG into $E2E_SHOTS when it is set; a no-op otherwise. */
export async function shot(page, name) {
  const dir = process.env.E2E_SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
}
