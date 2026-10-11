// Pi stability (R-PROT-3, R-PROT-4, R-TOPO-1; D6, D24, D28): the guarded daily self-reload, the overscroll backstop,
// the Diagnostics rows, the no-store path in sw.js, the service-worker update timer (K16) and the idle-sleep clock
// across an automatic reload (C8M3).
//
// Service workers are allowed in this spec (the default blocks them). Every case runs against its own dedicated
// server (serveArgs: []), so a case can stop the APP server (never mock.down(): that stops only the Plex mock) and
// the cases can run side by side: the whole spec has to fit run.mjs's 180 s per-spec limit.
// Local time: the fake clock's ISO strings are wall-clock times in the browser's timezone.

import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { withApp, freePort } from './lib.mjs';

const cases = [];
const piCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], serviceWorkers: 'allow', clock: { time: T0 }, ...opts }, fn });

const check = (name) => console.log(`  ok  ${name}`);
const T0 = '2026-01-05T03:59:30'; // 30 s before the default dailyReloadTime
const ms = (iso) => new Date(iso).getTime();

const seed = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  rotateSeconds: 3600,
  pixelShift: false,
  dailyReload: true,
  dailyReloadTime: '04:00',
  ...extra,
});

/** Counts navigations of this tab in sessionStorage (it survives a reload): call before page.goto. */
const countNavigations = (page) =>
  page.addInitScript(() => sessionStorage.setItem('__navs', String(Number(sessionStorage.getItem('__navs') || 0) + 1)));
const navs = (page) => page.evaluate(() => Number(sessionStorage.getItem('__navs') || 0)).catch(() => null);

const controlled = (page) => page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 });
const loaded = (page) => page.waitForFunction(() => document.readyState === 'complete' && Boolean(document.getElementById('diag-list')), null, { timeout: 20000 });
const posterShown = (page) => page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
/** The page's (fake) clock; retried when a navigation destroys the context under the call. */
async function now(page) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await page.evaluate(() => Date.now());
    } catch (err) {
      if (attempt >= 20) throw err;
      await page.waitForTimeout(100);
    }
  }
}

/** Advance the fake clock in small steps, leaving real time for each step's network round trips. */
async function advance(page, span, step = 1000) {
  for (let t = 0; t < span; t += step) {
    await page.clock.runFor(Math.min(step, span - t)).catch(() => {}); // a navigation may be under way
    await page.waitForTimeout(30);
  }
}

/** Step the fake clock until the tab has navigated `count` times; returns the simulated ms it took. */
async function untilNavigations(page, count, max = 120_000) {
  const t0 = await now(page);
  for (let t = 0; t <= max; t += 1000) {
    if ((await navs(page)) >= count) {
      await loaded(page);
      return (await now(page)) - t0;
    }
    await advance(page, 1000);
  }
  assert.fail(`no reload within ${max} simulated ms (navigations ${await navs(page)})`);
}

/** Step the fake clock `span` ms (and a little real time for the probe) and assert the tab did not navigate. */
async function staysPut(page, count, span, label) {
  await advance(page, span);
  await page.waitForTimeout(1500);
  assert.equal(await navs(page), count, `${label}: the tab navigated`);
}

const pageErrors = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};

/** Diagnostics rows and log, read through the page (opens and closes the dialog). */
async function diagnostics(page) {
  await page.evaluate(() => document.querySelector('[data-action="diagnostics"]').click());
  await page.waitForFunction(() => document.getElementById('diagnostics').open);
  const out = await page.evaluate(() => ({
    rows: Object.fromEntries([...document.querySelectorAll('#diag-list dt')].map((dt) => [dt.textContent, dt.nextElementSibling.textContent])),
    log: [...document.querySelectorAll('#diag-log li')].map((li) => li.textContent),
  }));
  await page.evaluate(() => document.getElementById('diag-close').click());
  await page.waitForFunction(() => !document.getElementById('diagnostics').open);
  return out;
}
const skipLog = (log) => log.filter((l) => /daily reload/i.test(l));

const storedSettings = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));
const lastReload = (page) => page.evaluate(() => Number(localStorage.getItem('plexPoster.lastReload')) || 0);

// 1. The reload: at 04:00, with the page controlled by the service worker and the mock up.
piCase('1 reload at 04:00; lastReload written; no loop; settings persist, paused cleared', { settings: seed({ rotateSeconds: 123 }) }, async ({ page, app }) => {
  const errors = pageErrors(page);
  await countNavigations(page);
  await page.goto(app.url);
  await controlled(page);
  await posterShown(page);
  assert.equal(await navs(page), 1);
  await page.evaluate(() => document.querySelector('[data-action="pause"]').click());
  assert.equal(await page.evaluate(() => document.querySelector('[data-action="pause"]').getAttribute('aria-pressed')), 'true', 'paused before the reload');
  assert.equal(await lastReload(page), 0, 'no reload recorded yet');

  const took = await untilNavigations(page, 2, 60_000);
  assert.ok(took >= 25_000 && took <= 45_000, `reloaded ${took} ms after 03:59:30, not at 04:00`);
  const written = await lastReload(page);
  const nowMs = await now(page);
  assert.ok(written > ms('2026-01-05T03:59:59') && written <= nowMs, `lastReload ${new Date(written).toISOString()} was written at the reload`);
  assert.equal(await page.evaluate(() => document.querySelector('[data-action="pause"]').getAttribute('aria-pressed')), 'false', 'paused is cleared by the reload');
  const s = await storedSettings(page);
  assert.equal(s.rotateSeconds, 123, 'settings persist');
  assert.equal(s.dailyReload, true);
  assert.equal(s.dailyReloadTime, '04:00');
  await staysPut(page, 2, 40_000, 'no second reload (no loop)');
  assert.deepEqual(errors, []);
  check(`reload at 04:00 (${took} ms after 03:59:30), lastReload written, paused cleared, settings persisted, no loop`);
});

// 2. The app server is unreachable at 04:00: no reload and a logged skip reason.
piCase('2 app server stopped before 04:00: no reload, a logged skip', { settings: seed() }, async ({ page, app }) => {
  const errors = pageErrors(page);
  await countNavigations(page);
  await page.goto(app.url);
  await controlled(page);
  await posterShown(page);
  app.stop(); // the app server (serve.mjs), not the Plex mock
  await page.waitForTimeout(500);
  await staysPut(page, 1, 90_000, 'server down at 04:00');
  const d = await diagnostics(page);
  assert.ok(skipLog(d.log).length >= 1, `a skip reason is logged: ${JSON.stringify(d.log)}`);
  assert.match(skipLog(d.log)[0], /skipped/i);
  assert.match(d.rows['Daily reload'], /^skipped \(.+\)$/, d.rows['Daily reload']);
  assert.equal(await lastReload(page), 0, 'lastReload is not written for a skipped reload');
  assert.deepEqual(errors, []);
  check(`server down at 04:00: no reload; log "${skipLog(d.log)[0]}"; Diagnostics "${d.rows['Daily reload']}"`);
});

// 2b. The app server is up but answers the probe with an HTTP error (503): sw.js passes a non-ok navigation response
// through, so a reload would strand the display on an error page. No reload, a logged skip naming the status.
// The probe is `fetch('index.html', { cache: 'no-store' })`, which a controlled page sends straight to the network
// without Playwright's route() seeing it, so the page is opened through a small pass-through proxy in front of the
// dedicated app server. Once `fail` is set the proxy answers any non-navigation request for index.html (the probe: Chromium
// sends no cache headers for cache: 'no-store') with the given status; a navigation, which the worker serves, still passes.
async function flakyFront(app) {
  const front = { fail: 0, probes: 0 };
  const server = createServer((req, res) => {
    if (front.fail && req.headers['sec-fetch-mode'] !== 'navigate' && /^\/index\.html(\?|$)/.test(req.url)) {
      front.probes++;
      res.writeHead(front.fail, { 'content-type': 'text/html' }).end('<h1>Service Unavailable</h1>');
      return;
    }
    const up = httpRequest({ host: '127.0.0.1', port: app.port, path: req.url, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.on('error', () => res.writeHead(502).end());
    req.pipe(up);
  });
  front.port = await freePort();
  await new Promise((resolve) => server.listen(front.port, '127.0.0.1', resolve));
  front.url = `http://127.0.0.1:${front.port}/`;
  front.close = () => server.close();
  return front;
}
for (const status of [503, 404]) {
  piCase(`2b probe answered HTTP ${status}: no reload, a logged skip naming the status`, { settings: seed() }, async ({ page, app }) => {
    const errors = pageErrors(page);
    const front = await flakyFront(app);
    try {
      await countNavigations(page);
      await page.goto(front.url);
      await controlled(page);
      await posterShown(page);
      await page.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith('shell-')), null, { timeout: 15000 });
      assert.equal(front.probes, 0);
      front.fail = status; // from here on the host answers the probe with an error page
      await staysPut(page, 1, 90_000, `probe answered ${status}`);
      assert.ok(front.probes >= 1, `the no-store probe reached the host and was answered ${status} (${front.probes} probes)`);
      const d = await diagnostics(page);
      assert.ok(skipLog(d.log).some((l) => new RegExp(`skipped.*HTTP ${status}`, 'i').test(l)), `a logged skip names the HTTP status: ${JSON.stringify(d.log)}`);
      assert.match(d.rows['Daily reload'], new RegExp(`^skipped \\(.*HTTP ${status}.*\\)$`), d.rows['Daily reload']);
      assert.equal(await lastReload(page), 0, 'lastReload is not written for a skipped reload');
      assert.deepEqual(errors, []);
      check(`probe answered ${status} (${front.probes}x): no reload; log "${skipLog(d.log)[0]}"; Diagnostics "${d.rows['Daily reload']}"`);
    } finally {
      front.close();
    }
  });
}

// 3. sw.js: a no-store request goes to the network; everything else stays cache-backed.
piCase('3 no-store reaches the network; an ordinary fetch and a reload are served from the cached shell', { settings: seed({ dailyReload: false }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await controlled(page);
  await posterShown(page);
  // Wait for the shell to be precached (install finished before it took control, but be explicit).
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith('shell-')), null, { timeout: 15000 });
  const probe = () => page.evaluate(() => fetch('index.html', { cache: 'no-store' }).then((r) => ({ ok: r.ok, status: r.status }), (e) => ({ error: e.name })));
  const ordinary = () => page.evaluate(() => fetch('index.html').then((r) => ({ ok: r.ok, status: r.status }), (e) => ({ error: e.name })));
  assert.deepEqual(await probe(), { ok: true, status: 200 }, 'no-store, server up');
  assert.deepEqual(await ordinary(), { ok: true, status: 200 }, 'ordinary, server up');
  app.stop();
  await page.waitForTimeout(500);
  const down = await probe();
  assert.ok(down.error, `no-store with the server stopped must reject: ${JSON.stringify(down)}`);
  assert.deepEqual(await ordinary(), { ok: true, status: 200 }, 'an ordinary fetch still succeeds from the cached shell');
  const other = await page.evaluate(() => fetch('js/util.js').then((r) => r.ok, () => false));
  assert.equal(other, true, 'another same-origin GET stays cache-backed');
  await page.reload();
  await controlled(page);
  assert.ok(await page.evaluate(() => Boolean(document.getElementById('stage'))), 'a reload succeeds from the cached shell');
  check('no-store rejects with the server stopped, resolves ok with it running; ordinary fetch and reload served from the cache');
});

// 4. Service workers blocked: no controller, no reload, a logged skip, Diagnostics says so.
piCase('4 no service worker control: no reload, a logged skip, Diagnostics rows', { serviceWorkers: 'block', settings: seed() }, async ({ page, app }) => {
  const errors = pageErrors(page);
  await countNavigations(page);
  await page.goto(app.url);
  await posterShown(page);
  await staysPut(page, 1, 90_000, 'no controller');
  const d = await diagnostics(page);
  assert.equal(d.rows['Service worker'], 'none');
  assert.equal(d.rows['Secure context'], 'yes', '127.0.0.1 is a secure context');
  assert.match(d.rows['Daily reload'], /^skipped \(.*service worker.*\)$/i, d.rows['Daily reload']);
  assert.ok(skipLog(d.log).some((l) => /service worker/i.test(l)), `the skip is logged with its reason: ${JSON.stringify(d.log)}`);
  assert.deepEqual(errors, []);
  check(`no controller: no reload; log "${skipLog(d.log)[0]}"`);
});

// 5. Diagnostics rows when everything is in order; and a context that is not secure.
piCase('5 Diagnostics: Daily reload active, Secure context yes, Service worker controlling', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await controlled(page);
  await posterShown(page);
  const d = await diagnostics(page);
  assert.equal(d.rows['Daily reload'], 'active');
  assert.equal(d.rows['Secure context'], 'yes');
  assert.equal(d.rows['Service worker'], 'controlling');
  check('Diagnostics: Daily reload: active · Secure context: yes · Service worker: controlling');
});
piCase('5b Diagnostics: Secure context no', { serviceWorkers: 'block', settings: seed() }, async ({ page, app }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true }));
  await page.goto(app.url);
  await posterShown(page);
  const d = await diagnostics(page);
  assert.equal(d.rows['Secure context'], 'no');
  assert.equal(d.rows['Service worker'], 'none');
  assert.match(d.rows['Daily reload'], /^skipped \(.+\)$/);
  check('Diagnostics: Secure context: no · Service worker: none · Daily reload: skipped (...)');
});

// 6. Never while Settings or Diagnostics is open; it retries after close.
const openAndHold = (opener, opened, closer) => async ({ page, app }) => {
  const errors = pageErrors(page);
  await countNavigations(page);
  await page.goto(app.url);
  await controlled(page);
  await posterShown(page);
  await page.evaluate(opener);
  await page.waitForFunction(opened);
  await staysPut(page, 1, 90_000, 'a dialog is open at 04:00');
  assert.equal(await page.evaluate(opened), true, 'the dialog is still open');
  await page.evaluate(closer);
  await untilNavigations(page, 2, 20_000);
  assert.deepEqual(errors, []);
};
piCase('6a no reload while Settings is open; it reloads after close', { settings: seed() }, async (ctx) => {
  await openAndHold(
    () => document.querySelector('[data-action="settings"]').click(),
    () => document.getElementById('settings').open,
    () => document.getElementById('settings-cancel').click(),
  )(ctx);
  check('Settings open at 04:00: no reload; one after Cancel');
});
piCase('6b no reload while Diagnostics is open; it reloads after close', { settings: seed() }, async (ctx) => {
  await openAndHold(
    () => document.querySelector('[data-action="diagnostics"]').click(),
    () => document.getElementById('diagnostics').open,
    () => document.getElementById('diag-close').click(),
  )(ctx);
  check('Diagnostics open at 04:00: no reload; one after close');
});

// 7. Never while a poster is loading (state.busy): the first poster download is held across 04:00.
piCase('7 no reload while a poster is still loading (busy)', { settings: seed() }, async ({ page, app }) => {
  const errors = pageErrors(page);
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route(/\/photo\/:\/transcode/, async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  await countNavigations(page);
  await page.goto(app.url);
  await controlled(page);
  await staysPut(page, 1, 90_000, 'the poster download is held');
  release();
  await posterShown(page);
  await untilNavigations(page, 2, 30_000);
  assert.deepEqual(errors, []);
  check('04:00 passes with a poster download in flight: no reload until it finishes, then one');
});

// 8. Off, and a clock that is not set.
piCase('8a dailyReload:false -> no reload', { settings: seed({ dailyReload: false }) }, async ({ page, app }) => {
  await countNavigations(page);
  await page.goto(app.url);
  await controlled(page);
  await posterShown(page);
  await staysPut(page, 1, 120_000, 'dailyReload off');
  const d = await diagnostics(page);
  assert.match(d.rows['Daily reload'], /^skipped \(.+\)$/);
  check('dailyReload:false: no reload');
});
piCase('8b a fake clock at 1970 -> no reload', { clock: { time: '1970-01-01T03:59:30' }, settings: seed() }, async ({ page, app }) => {
  await countNavigations(page);
  await page.goto(app.url);
  await controlled(page);
  await staysPut(page, 1, 120_000, 'clock at 1970');
  const d = await diagnostics(page);
  assert.match(d.rows['Daily reload'], /^skipped \(.*clock.*\)$/i, d.rows['Daily reload']);
  check('clock at 1970: no reload');
});

// 9. First wake from sleep with lastReload older than 12 h.
const WAKE_AT = '2026-01-05T06:59:40'; // asleep in the default 01:00-07:00 window; awake at 07:00
const sleepSeed = (extra = {}) => seed({ sleepEnabled: true, ...extra });
const asleep = (page, want) => page.waitForFunction((w) => document.body.classList.contains('asleep') === w, want, { timeout: 15000 });
piCase(
  '9a wake from sleep with lastReload 13 h old -> one reload',
  { clock: { time: WAKE_AT }, settings: sleepSeed(), localStorage: { 'plexPoster.lastReload': ms('2026-01-04T18:00:00') } },
  async ({ page, app }) => {
    await countNavigations(page);
    await page.goto(app.url);
    await controlled(page);
    await asleep(page, true);
    assert.equal(await navs(page), 1);
    await untilNavigations(page, 2, 40_000);
    await asleep(page, false);
    await staysPut(page, 2, 60_000, 'no second reload after the wake');
    assert.ok((await lastReload(page)) > ms('2026-01-05T06:59:00'), 'lastReload was refreshed');
    check('wake with lastReload older than 12 h: one reload, then none');
  },
);
piCase(
  '9b wake from sleep with lastReload 1 h old -> none',
  { clock: { time: WAKE_AT }, settings: sleepSeed(), localStorage: { 'plexPoster.lastReload': ms('2026-01-05T06:00:00') } },
  async ({ page, app }) => {
    await countNavigations(page);
    await page.goto(app.url);
    await controlled(page);
    await asleep(page, true);
    await advance(page, 25_000); // past 07:00
    await asleep(page, false);
    await staysPut(page, 1, 60_000, 'lastReload newer than 12 h');
    check('wake with lastReload newer than 12 h: no reload');
  },
);

// 9c. K39: a MANUAL wake (a key press while asleep) is not a wake that ends sleep: no reload (it would drop the 60 s
// manual wake and the schedule would put the screen straight back to sleep). A wake that ends sleep still reloads.
piCase(
  '9c manual wake with lastReload 13 h old -> no reload and the 60 s wake runs; the schedule end then reloads once',
  { clock: { time: '2026-01-05T05:00:00' }, settings: sleepSeed(), localStorage: { 'plexPoster.lastReload': ms('2026-01-04T16:00:00') } },
  async ({ page, app }) => {
    const errors = pageErrors(page);
    await countNavigations(page);
    await page.goto(app.url);
    await controlled(page);
    await asleep(page, true);
    await page.keyboard.press('a'); // a manual wake
    await asleep(page, false);
    await advance(page, 30_000); // well past the tick that would have asked for the wake reload and its probe
    await page.waitForTimeout(1500);
    assert.equal(await navs(page), 1, 'a manual wake must not reload');
    assert.equal(await isAsleep(page), false, 'the manual wake is still running at +30 s');
    await advance(page, 40_000); // the 60 s are over: asleep again, still no reload
    await asleep(page, true);
    await page.waitForTimeout(1500);
    assert.equal(await navs(page), 1, 'no reload when the manual wake ends');
    assert.equal(await lastReload(page), ms('2026-01-04T16:00:00'), 'lastReload untouched');
    await jumpTo(page, '2026-01-05T07:00:05'); // the schedule ends: a wake that ends sleep
    await untilNavigations(page, 2, 40_000);
    await asleep(page, false);
    await staysPut(page, 2, 30_000, 'one reload only');
    assert.ok((await lastReload(page)) > ms('2026-01-05T06:59:00'), 'lastReload was refreshed by the schedule-end reload');
    assert.deepEqual(errors, []);
    check('manual wake: no reload, 60 s wake ran; schedule end: one reload');
  },
);

// 9d. PSA1: reloadMustWait's waits. (a) A long crossfade that is still running at the reload time holds the reload
// until the fade has ended. (b) With the device helper on, a wake reload waits for the TV wake to finish: power on,
// TV_WAKE_MS, the first poster, and only then the reload.
const FADE_MS = 8000;
piCase(
  '9d a crossfade still running at 04:00 holds the reload until the fade has ended',
  { clock: { time: '2026-01-05T03:59:56' }, settings: seed({ crossfadeMs: FADE_MS }) },
  async ({ page, app }) => {
    const errors = pageErrors(page);
    await countNavigations(page);
    await page.goto(app.url);
    await controlled(page);
    await posterShown(page); // the first poster is drawn now (the fake clock is paused): its fade runs to ~04:00:04
    const drawn = await now(page);
    await staysPut(page, 1, 5000, 'the fade is running at 04:00:01'); // 04:00 has passed
    await untilNavigations(page, 2, 30_000);
    const reloadedAt = await now(page);
    assert.ok(reloadedAt - drawn >= FADE_MS, `reloaded ${reloadedAt - drawn} ms after the poster was drawn, before its ${FADE_MS} ms fade ended`);
    assert.deepEqual(errors, []);
    check(`crossfade ${FADE_MS} ms across 04:00: the reload came ${reloadedAt - drawn} ms after the draw`);
  },
);
piCase(
  '9e helper on: the wake reload waits for the TV wake (power on, TV_WAKE_MS, the first poster)',
  {
    serveArgs: ['--helper', '--helper-fake'],
    clock: { time: WAKE_AT },
    settings: sleepSeed({ deviceHelper: true }),
    localStorage: { 'plexPoster.lastReload': ms('2026-01-04T18:00:00') },
  },
  async ({ page, app, context }) => {
    const errors = pageErrors(page);
    const posters = [];
    page.on('request', (r) => r.url().includes('/photo/:/transcode') && posters.push(r.url()));
    const powerOn = async () => {
      const res = await context.request.get(`${app.url}__helper/calls`, { headers: { 'X-Poster-Helper': '1' } });
      return (await res.json()).some((c) => c.action === 'display' && c.on === true);
    };
    await countNavigations(page);
    await page.goto(app.url);
    await controlled(page);
    await asleep(page, true);
    await page.waitForTimeout(1000);
    assert.equal(posters.length, 0, 'no poster while asleep');
    let onAt = null;
    let postersAtReload = -1;
    let reloadAt = null;
    for (let t = 0; t < 40_000 && reloadAt === null; t += 250) {
      await advance(page, 250, 250);
      if (onAt === null && (await powerOn())) onAt = await now(page);
      if ((await navs(page)) >= 2) {
        reloadAt = await now(page);
        postersAtReload = posters.length;
      }
    }
    assert.notEqual(onAt, null, 'the TV was switched on at the wake');
    assert.notEqual(reloadAt, null, 'the wake reload happened');
    assert.ok(reloadAt - onAt >= 4000, `reloaded ${reloadAt - onAt} ms after power on, before the TV had finished waking (TV_WAKE_MS 4000)`);
    assert.ok(postersAtReload >= 1, 'the first poster was fetched before the reload');
    await loaded(page);
    assert.deepEqual(errors, []);
    check(`helper on: power on, then the reload ${reloadAt - onAt} ms later, after the first poster`);
  },
);

// 9f. PSC1: a scheduled reload that comes due during a manual wake waits for the wake to end (it would cut the 60 s short).
piCase(
  '9f a manual wake spanning 04:00 -> the reload waits until the 60 s are over',
  { clock: { time: '2026-01-05T03:59:20' }, settings: sleepSeed() },
  async ({ page, app }) => {
    const errors = pageErrors(page);
    await countNavigations(page);
    await page.goto(app.url);
    await controlled(page);
    await asleep(page, true);
    await advance(page, 1000);
    await page.keyboard.press('a'); // 03:59:21: awake until 04:00:21
    await asleep(page, false);
    await staysPut(page, 1, 50_000, 'a manual wake is running'); // 04:00:11
    assert.equal(await isAsleep(page), false, 'the manual wake is still running at 04:00:11');
    await untilNavigations(page, 2, 60_000);
    const at = await now(page);
    assert.ok(at >= ms('2026-01-05T04:00:20'), `reloaded at ${new Date(at).toISOString()}, before the 60 s manual wake ended`);
    assert.deepEqual(errors, []);
    check('manual wake across 04:00: no reload until the 60 s were over');
  },
);

// 9g. PSC2: a clock that is set after boot (NTP on a Pi with no RTC) shifts the boot time too: the page did not run for 56 years.
piCase(
  '9g clock set after boot, then the schedule ends -> no wake reload',
  { clock: { time: '1970-01-01T06:58:00' }, settings: sleepSeed() },
  async ({ page, app }) => {
    const errors = pageErrors(page);
    await countNavigations(page);
    await page.goto(app.url);
    await controlled(page);
    await posterShown(page);
    await page.clock.setSystemTime(new Date('2026-01-05T06:59:00')); // NTP arrives: the wall clock moves, the monotonic one does not
    await advance(page, 3000);
    await asleep(page, true);
    await jumpTo(page, '2026-01-05T07:00:05'); // the schedule ends
    await asleep(page, false);
    await staysPut(page, 1, 30_000, 'the page had been up for two minutes');
    assert.equal(await lastReload(page), 0, 'no reload recorded');
    assert.deepEqual(errors, []);
    check('clock set after boot: the wake after the schedule end does not reload');
  },
);

// 10. A second reload within 10 minutes is refused.
piCase(
  '10a lastReload 5 min ago -> the 04:00 reload is refused and logged',
  { settings: seed(), localStorage: { 'plexPoster.lastReload': ms('2026-01-05T03:54:30') } },
  async ({ page, app }) => {
    await countNavigations(page);
    await page.goto(app.url);
    await controlled(page);
    await posterShown(page);
    await staysPut(page, 1, 90_000, 'a reload 5 minutes ago');
    const d = await diagnostics(page);
    assert.ok(skipLog(d.log).some((l) => /skipped/i.test(l)), `refusal logged: ${JSON.stringify(d.log)}`);
    assert.equal(await lastReload(page), ms('2026-01-05T03:54:30'), 'a refused reload does not rewrite lastReload');
    check(`second reload within 10 minutes refused; log "${skipLog(d.log)[0]}"`);
  },
);
piCase(
  '10b lastReload 11 min ago -> the 04:00 reload happens',
  { settings: seed(), localStorage: { 'plexPoster.lastReload': ms('2026-01-05T03:48:00') } },
  async ({ page, app }) => {
    await countNavigations(page);
    await page.goto(app.url);
    await controlled(page);
    await posterShown(page);
    await untilNavigations(page, 2, 60_000);
    check('lastReload 11 minutes ago: the reload happens');
  },
);

// 11. The overscroll backstop.
piCase('11 html and body compute overscroll-behavior: none', { serviceWorkers: 'block', settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  const v = await page.evaluate(() => ({ html: getComputedStyle(document.documentElement).overscrollBehaviorX + '/' + getComputedStyle(document.documentElement).overscrollBehaviorY, body: getComputedStyle(document.body).overscrollBehaviorX + '/' + getComputedStyle(document.body).overscrollBehaviorY }));
  assert.deepEqual(v, { html: 'none/none', body: 'none/none' });
  check('html and body: overscroll-behavior none');
});

// 12. Settings has the controls, and Save persists them.
piCase('12 Settings has dailyReload and dailyReloadTime; Save persists', { serviceWorkers: 'block', settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForFunction(() => document.getElementById('settings').open);
  assert.equal(await page.locator('#settings-form input[name="dailyReload"][type="checkbox"]').count(), 1);
  assert.equal(await page.locator('#settings-form input[name="dailyReloadTime"][type="time"]').count(), 1);
  assert.equal(await page.inputValue('#settings-form [name="dailyReloadTime"]'), '04:00');
  await page.setChecked('#settings-form [name="dailyReload"]', false);
  await page.fill('#settings-form [name="dailyReloadTime"]', '05:30');
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  const s = await storedSettings(page);
  assert.equal(s.dailyReload, false);
  assert.equal(s.dailyReloadTime, '05:30');
  check('Settings: dailyReload checkbox and time, persisted by Save');
});

// 13. K16: the service-worker update timer must not throw under a fake clock past +6 h. With service workers blocked
// Playwright's register() resolves with undefined; the old timer then threw "Cannot read properties of undefined (reading
// 'update')" inside the clock (and so out of clock.fastForward / runFor).
const updateTimer = (blocked) => async ({ page, app }) => {
  const errors = pageErrors(page);
  await page.addInitScript(() => {
    window.__updates = { calls: 0, threw: 0, rejected: 0 };
    const real = ServiceWorkerRegistration.prototype.update;
    ServiceWorkerRegistration.prototype.update = function () {
      window.__updates.calls++;
      try {
        const p = real.apply(this, arguments);
        p.catch(() => window.__updates.rejected++);
        return p;
      } catch (e) {
        window.__updates.threw++;
        throw e;
      }
    };
  });
  await page.goto(app.url);
  if (!blocked) await controlled(page);
  await posterShown(page);
  await page.clock.fastForward(6 * 3600_000 + 60_000); // the 6 h timer fires (once)
  await page.clock.runFor(5000);
  await page.waitForTimeout(1500);
  const u = await page.evaluate(() => window.__updates);
  assert.equal(u.threw, 0, `reg.update() threw synchronously: ${JSON.stringify(u)}`);
  if (!blocked) assert.ok(u.calls >= 1, `the timer ran reg.update() after 6 h: ${JSON.stringify(u)}`);
  assert.deepEqual(errors, [], 'no pageerror at +6 h');
  check(`+6 h 1 min of fake clock, service workers ${blocked ? 'blocked' : 'allowed'}: reg.update() called ${u.calls}x (${u.rejected} rejected), no pageerror`);
};
piCase('13a K16 the update timer survives +6 h (service workers blocked: register() resolves undefined)', { serviceWorkers: 'block', clock: { time: '2026-01-05T10:00:00' }, settings: seed({ dailyReload: false }) }, updateTimer(true));
piCase('13b K16 the update timer survives +6 h (service workers allowed)', { clock: { time: '2026-01-05T10:00:00' }, settings: seed({ dailyReload: false }) }, updateTimer(false));

// 14. C8M3: an automatic reload does not restart the idle-sleep clock. The idle time is an hour (the minimum), so the
// fake clock jumps (fastForward fires every timer once, then runFor lets the 1 s timers run a moment).
const IDLE_START = '2026-01-05T03:50:00';
const idleSeed = (extra = {}) => seed({ showNowPlaying: true, nowPlayingPollSeconds: 60, idleSleepHours: 1, ...extra });
const jumpTo = async (page, iso) => {
  await page.clock.fastForward(Math.max(1, ms(iso) - (await now(page))));
  await page.clock.runFor(3000);
  await page.waitForTimeout(300);
};
const isAsleep = (page) => page.evaluate(() => document.body.classList.contains('asleep')).catch(() => null);
/** Asserts the sleep state; a failure carries what Diagnostics says. */
const expectAsleep = async (page, want, label) => {
  if ((await isAsleep(page)) === want) return;
  const d = await diagnostics(page);
  assert.fail(`${label}: asleep should be ${want}; Sleep "${d.rows.Sleep}", time "${d.rows['Local time']}", log ${JSON.stringify(d.log.slice(0, 8))}`);
};
/** Boots, plays a movie so the idle clock starts at ~03:50, ends playback. */
async function idleBoot({ page, app, mock }, { controlledAtBoot = false } = {}) {
  await countNavigations(page);
  await page.goto(app.url);
  await controlled(page);
  if (controlledAtBoot) {
    await page.reload(); // a page that booted under the worker's control is the one a worker update reloads
    await controlled(page);
  }
  await mock.play('3');
  await page.waitForFunction(() => Boolean(document.querySelector('.poster-layer.active')), null, { timeout: 15000 });
  await advance(page, 6000, 1000); // a poll sees the movie: lastPlaybackAt ~ 03:50:0x
  await mock.stop();
  assert.equal(await isAsleep(page), false);
}
piCase('14a daily reload: the remaining idle time is unchanged', { clock: { time: IDLE_START }, settings: idleSeed({ dailyReloadTime: '04:00' }) }, async (ctx) => {
  const { page } = ctx;
  const errors = pageErrors(page);
  await idleBoot(ctx);
  await jumpTo(page, '2026-01-05T04:00:05'); // the daily reload, ten minutes after the movie
  await untilNavigations(page, 2, 60_000);
  await posterShown(page); // booted: the load event comes before the page's async boot has finished
  await jumpTo(page, '2026-01-05T04:45:00');
  await expectAsleep(page, false, 'not asleep at 04:45');
  // Idle sleep is an hour after playback ended (~03:50): ~04:50. A clock restarted by the reload would sleep at ~05:00.
  await jumpTo(page, '2026-01-05T04:55:00');
  await expectAsleep(page, true, 'asleep at 04:55: the idle time since 03:50 carried across the reload');
  assert.deepEqual(errors, []);
  check('daily reload at 04:00: idle sleep still begins about an hour after the movie (~04:50), not an hour after the reload');
});
piCase('14b service-worker update reload: the remaining idle time is unchanged', { clock: { time: IDLE_START }, settings: idleSeed({ dailyReload: false }) }, async (ctx) => {
  const { page } = ctx;
  await idleBoot(ctx, { controlledAtBoot: true });
  await jumpTo(page, '2026-01-05T04:00:00');
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))).catch(() => {}); // a new version took over: the page reloads under the call
  await untilNavigations(page, 3, 30_000); // (the reload at the start was the second navigation)
  await posterShown(page);
  await jumpTo(page, '2026-01-05T04:45:00');
  await expectAsleep(page, false, 'not asleep at 04:45');
  await jumpTo(page, '2026-01-05T04:55:00');
  await expectAsleep(page, true, 'asleep at 04:55: the idle clock carried across the update reload');
  check('service-worker update reload: the idle clock carries across (asleep ~04:50)');
});
piCase('14c a normal fresh load still starts a fresh idle clock', { clock: { time: IDLE_START }, settings: idleSeed({ dailyReload: false }) }, async (ctx) => {
  const { page } = ctx;
  await idleBoot(ctx);
  await jumpTo(page, '2026-01-05T04:10:00');
  await page.reload(); // the user's own reload: not an automatic one
  await loaded(page);
  await posterShown(page); // booted: a jump before the boot's applySettings would be taken as the load time
  await jumpTo(page, '2026-01-05T04:56:00');
  await expectAsleep(page, false, 'a load restarts the idle clock: not asleep at 04:56 (it would be at 05:10)');
  await jumpTo(page, '2026-01-05T05:15:00');
  await expectAsleep(page, true, 'asleep an hour after the fresh load');
  check('a normal reload restarts the idle clock (K13)');
});

// ---------- run ----------

const WORKERS = Number(process.env.E2E_PI_WORKERS || 4);
if (process.env.E2E_PI_ONLY) {
  const only = new RegExp(process.env.E2E_PI_ONLY); // run just the matching cases, e.g. E2E_PI_ONLY='^1[34]'
  cases.splice(0, cases.length, ...cases.filter((c) => only.test(c.name)));
}
const failures = [];
let nextCase = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (nextCase < cases.length) {
      const { name, opts, fn } = cases[nextCase++];
      try {
        await withApp(opts, fn);
      } catch (err) {
        failures.push({ name, err });
      }
    }
  }),
);
for (const { name, err } of failures) console.error(`case ${name} failed:\n${err?.stack || err}`);
if (failures.length) process.exit(1);
