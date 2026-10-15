// Device helper in the page (R-HELP-2, D8): power off in sleep once the veil is up, power on at wake before the
// poster fetch, CPU temperature in Diagnostics, and silence when the setting is off or the helper is absent.
// serveArgs ['--helper', '--helper-fake'] records the calls instead of running anything.

import assert from 'node:assert/strict';
import { withApp } from './lib.mjs';

const INSIDE = '2026-01-05T03:00:00'; // inside the default 01:00-07:00 window
const POLL = 5;
const HELPER_ARGS = ['--helper', '--helper-fake'];
const HEADER = { 'X-Poster-Helper': '1' };

const seed = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  showNowPlaying: true,
  nowPlayingPollSeconds: POLL,
  rotateSeconds: 3600,
  pixelShift: false,
  ...extra,
});

const check = (name) => console.log(`  ok  ${name}`);
const helperCalls = async (context, app) => {
  const res = await context.request.get(`${app.url}__helper/calls`, { headers: HEADER });
  assert.equal(res.status(), 200);
  return res.json();
};

/** K37: ONLY Chromium's line for a 404 on /__helper/status (boot probe, no --helper) and the K32 404/403 on /config.json. */
const ignorableConsoleError = (text, url) =>
  (/\/__helper\/status$/.test(url) && /\b404\b/.test(text)) || (/\/config\.json$/.test(url) && /\b(404|403)\b/.test(text));
{
  const base = 'http://x/';
  const ok = [['Failed to load resource: the server responded with a status of 404 (Not Found)', `${base}__helper/status`],
    ['Failed to load resource: the server responded with a status of 404 (Not Found)', `${base}config.json`],
    ['Failed to load resource: the server responded with a status of 403 (Forbidden)', `${base}config.json`]];
  const bad = [['Failed to load resource: 404', `${base}__helper/display`], ['Failed to load resource: 404', `${base}__helper/calls`],
    ['Failed to load resource: 500', `${base}__helper/status`], ['Failed to load resource: 403', `${base}__helper/status`],
    ['Failed to load resource: 500', `${base}config.json`], ['boom', `${base}js/main.js`], ['Failed to load resource: 404', `${base}poster.jpg`]];
  for (const [t, u] of ok) assert.ok(ignorableConsoleError(t, u), `ignored: ${u}`);
  for (const [t, u] of bad) assert.ok(!ignorableConsoleError(t, u), `still an error: ${t} ${u}`);
}

/** Records every /__helper/ and /photo/:/transcode request, in order, and the veil state when each helper call is made. */
async function watch(page) {
  const seen = { order: [], helper: [], errors: [] };
  // Page-side: the state of the veil at the moment fetch() is called for a helper URL.
  await page.addInitScript(() => {
    const real = window.fetch.bind(window);
    window.__helperFetch = [];
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('__helper/')) {
        window.__helperFetch.push({
          url,
          body: init?.body ? String(init.body) : '',
          header: new Headers(init?.headers).get('X-Poster-Helper'),
          at: Date.now(), // the fake clock
          asleep: document.body.classList.contains('asleep'),
          veilHidden: document.getElementById('sleep-veil')?.hidden,
        });
      }
      return real(input, init);
    };
  });
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/__helper/')) {
      seen.helper.push({ url: u, method: r.method() });
      seen.order.push(`helper:${u.split('/__helper/')[1]}:${r.postData() || ''}`);
    }
    if (u.includes('/photo/:/transcode')) seen.order.push('poster');
  });
  // Chromium itself logs a 404 as "Failed to load resource": only the boot probe's own (no --helper) and the
  // absent config.json (K32) are not the app's errors.
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignorableConsoleError(m.text(), m.location().url)) seen.errors.push(m.text());
  });
  page.on('pageerror', (e) => seen.errors.push(String(e)));
  return seen;
}

const waitAsleep = (page, want = true, timeout = 15000) =>
  page.waitForFunction((w) => document.body.classList.contains('asleep') === w && document.getElementById('sleep-veil').hidden !== w, want, { timeout });
const waitAsleepFake = async (page) => advanceUntil(page, () => isAsleep(page), 30000, 1000);
const isAsleep = (page) => page.evaluate(() => document.body.classList.contains('asleep'));

async function advance(page, ms, step = 1000) {
  for (let t = 0; t < ms; t += step) {
    await page.clock.runFor(Math.min(step, ms - t));
    await page.waitForTimeout(30);
  }
}
async function advanceUntil(page, cond, maxMs, step = 1000) {
  for (let t = 0; t <= maxMs; t += step) {
    if (await cond()) return;
    await advance(page, step, step);
  }
  assert.fail(`condition not met within ${maxMs} simulated ms`);
}

/**
 * Stops the fake clock a little ahead of now and checks it, so the power-on time and the poster time that follow are read
 * from a stopped clock (a flowing one can step backwards between reads). Retries a bounded number of times, then fails.
 */
async function freezeClock(page, tries = 8) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    const target = (await page.evaluate(() => Date.now())) + 500;
    await page.clock.pauseAt(target).catch(() => {}); // "Cannot fast-forward to the past" if it overshot
    await page.waitForTimeout(100); // let any in-flight real-time tick finish
    last = await page.evaluate(() => Date.now());
    if (last === target) return;
  }
  throw new Error(`the fake clock would not stop after ${tries} tries (last read ${last})`);
}

const diagRow = (page, key) =>
  page.evaluate((k) => [...document.querySelectorAll('#diag-list dt')].find((dt) => dt.textContent === k)?.nextElementSibling?.textContent, key);
const openDiag = (page) => page.evaluate(() => document.querySelector('[data-action="diagnostics"]').click());
const closeDiag = (page) => page.evaluate(() => document.getElementById('diag-close').click());

// 1. Diagnostics shows the CPU temperature with the helper on; and the Settings checkbox is there.
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true }) }, async ({ page, app }) => {
  const seen = await watch(page);
  await page.goto(app.url);
  await page.waitForFunction(() => document.querySelectorAll('.poster-layer.active').length > 0, null, { timeout: 15000 });
  await openDiag(page);
  await page.waitForFunction(() => [...document.querySelectorAll('#diag-list dt')].some((dt) => dt.textContent === 'CPU temperature'), null, { timeout: 10000 });
  const text = await diagRow(page, 'CPU temperature');
  assert.match(text, /^42\.5 °C/);
  assert.match(text, /thermal_zone0/, 'the source is shown');
  check(`Diagnostics: CPU temperature: ${text}`);
  await closeDiag(page);
  assert.equal(await page.locator('form [name="deviceHelper"]').count(), 1, 'Settings has the checkbox');
  assert.deepEqual(seen.errors, []);
});

// 2. Sleep: power off after the veil is up, power on at wake before the poster fetch.
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true }), clock: { time: INSIDE } }, async ({ page, context, app, mock }) => {
  await mock.stop();
  const seen = await watch(page);
  await page.goto(app.url);
  await waitAsleep(page);
  await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 1, 10000, 500);
  let calls = await helperCalls(context, app);
  assert.deepEqual(calls.map((c) => [c.action, c.on]), [['display', false]], 'power off, once');
  const fetched = await page.evaluate(() => window.__helperFetch.filter((f) => f.url.includes('display')));
  assert.equal(fetched.length, 1);
  assert.equal(fetched[0].asleep, true, 'body.asleep was set when power off was requested');
  assert.equal(fetched[0].veilHidden, false, 'the veil was shown when power off was requested');
  assert.equal(fetched[0].header, '1');
  assert.deepEqual(JSON.parse(fetched[0].body), { on: false });
  assert.ok(!seen.order.includes('poster'), 'no poster while asleep');
  await advance(page, 6000);
  assert.equal((await helperCalls(context, app)).length, 1, 'repeated evaluations do not power off again');
  check('asleep: one power off, after the veil is up, no repeat');

  await mock.play('3');
  await advanceUntil(page, async () => !(await isAsleep(page)), (POLL + 2) * 1000);
  await advanceUntil(page, async () => seen.order.includes('poster'), 15000, 500);
  await page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
  calls = await helperCalls(context, app);
  assert.deepEqual(calls.map((c) => [c.action, c.on]), [['display', false], ['display', true]], 'power off then on');
  const onAt = seen.order.findIndex((o) => o.startsWith('helper:display:') && o.includes('true'));
  const posterAt = seen.order.indexOf('poster');
  assert.ok(onAt >= 0 && posterAt > onAt, `power on (${onAt}) came before the poster fetch (${posterAt}): ${seen.order.join(' | ')}`);
  check('wake: power on, then the poster fetch');
  assert.deepEqual(seen.errors, []);
});

// 3. A failed power call never blocks waking or the poster fetch (fake helper cannot fail, so point the page at a dead route).
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true }), clock: { time: INSIDE } }, async ({ page, app, mock }) => {
  await mock.stop();
  await page.route('**/__helper/display', (route) => route.abort());
  const seen = await watch(page);
  await page.goto(app.url);
  await waitAsleep(page);
  await advance(page, 3000, 500);
  await mock.play('3');
  await advanceUntil(page, async () => !(await isAsleep(page)), (POLL + 2) * 1000);
  await advanceUntil(page, async () => seen.order.includes('poster'), 15000, 500);
  check('power calls failing: the display still wakes and fetches the poster');
});

// 4. deviceHelper off: no /__helper/ request at all, no console error, even through a sleep and a wake.
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: false, sleepEnabled: true }), clock: { time: INSIDE } }, async ({ page, context, app, mock }) => {
  await mock.stop();
  const seen = await watch(page);
  await page.goto(app.url);
  await waitAsleep(page);
  await advance(page, 8000, 500);
  await mock.play('3');
  await advanceUntil(page, async () => !(await isAsleep(page)), (POLL + 2) * 1000);
  await advanceUntil(page, async () => seen.order.includes('poster'), 15000, 500);
  await openDiag(page);
  await advance(page, 12000, 1000);
  assert.equal(await diagRow(page, 'CPU temperature'), undefined);
  await closeDiag(page);
  assert.deepEqual(seen.helper, [], 'no /__helper/ request');
  assert.deepEqual(await helperCalls(context, app), [], 'the server recorded no call');
  assert.deepEqual(seen.errors, []);
  check('deviceHelper:false: no /__helper/ request, no console error');
});

// 5. deviceHelper on but no --helper: one probe at boot, nothing after, no console error.
await withApp({ serveArgs: [], settings: seed({ deviceHelper: true, sleepEnabled: true }), clock: { time: INSIDE } }, async ({ page, app, mock }) => {
  await mock.stop();
  const seen = await watch(page);
  await page.goto(app.url);
  await waitAsleep(page);
  await advance(page, 4000, 500);
  const afterProbe = seen.helper.length;
  assert.equal(afterProbe, 1, `exactly one probe: ${JSON.stringify(seen.helper)}`);
  assert.equal(seen.helper[0].method, 'GET');
  await mock.play('3');
  await advanceUntil(page, async () => !(await isAsleep(page)), (POLL + 2) * 1000);
  await advanceUntil(page, async () => seen.order.includes('poster'), 15000, 500);
  await openDiag(page);
  await advance(page, 12000, 1000);
  assert.equal(await diagRow(page, 'CPU temperature'), undefined);
  await closeDiag(page);
  assert.equal(seen.helper.length, afterProbe, 'no /__helper/ request after the probe');
  assert.deepEqual(seen.errors, []);
  check('no helper: one probe, then silence, no console error');
});

// 6. Temperature refreshes only while Diagnostics is open.
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true }) }, async ({ page, app }) => {
  const seen = await watch(page);
  await page.goto(app.url);
  await page.waitForFunction(() => document.querySelectorAll('.poster-layer.active').length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const statusCount = () => seen.helper.filter((h) => h.url.endsWith('/status')).length;
  const base = statusCount();
  await page.waitForTimeout(6500);
  assert.equal(statusCount(), base, 'no polling while Diagnostics is closed');
  await openDiag(page);
  await page.waitForFunction(() => [...document.querySelectorAll('#diag-list dt')].some((dt) => dt.textContent === 'CPU temperature'), null, { timeout: 10000 });
  const open0 = statusCount();
  await page.waitForTimeout(11000);
  assert.ok(statusCount() > open0, 'refreshes while open');
  await closeDiag(page);
  await page.waitForTimeout(300);
  const closed0 = statusCount();
  await page.waitForTimeout(11000);
  assert.equal(statusCount(), closed0, 'stops when closed');
  check('temperature refreshes only while Diagnostics is open');
});

// 7. Wake timing (fake clock): the first poster fetch is no earlier than the power-on request + TV_WAKE_MS, and within ~2 s after.
const TV_WAKE_MS = 4000; // js/main.js
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true, nowPlayingPollSeconds: 20 }) /* a slow poll: only the wake itself can bring the poster early */, clock: { time: INSIDE } }, async ({ page, context, app, mock }) => {
  await mock.stop();
  const seen = await watch(page);
  await page.goto(app.url);
  await waitAsleep(page);
  await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 1, 10000, 500);
  await freezeClock(page);
  await mock.play('3');
  let onAt = null;
  let posterAt = null;
  for (let t = 0; t < 60000 && posterAt === null; t += 250) {
    await advance(page, 250, 250);
    onAt ??= await page.evaluate(() => window.__helperFetch.find((f) => f.body.includes('"on":true'))?.at ?? null);
    if (seen.order.includes('poster')) posterAt = await page.evaluate(() => Date.now()); // the end of the step the fetch fell in
  }
  assert.notEqual(onAt, null, 'power on was requested');
  assert.notEqual(posterAt, null, 'a poster was fetched');
  assert.ok(posterAt - onAt >= TV_WAKE_MS, `poster ${posterAt - onAt} ms after power on, before TV_WAKE_MS`);
  assert.ok(posterAt - onAt <= TV_WAKE_MS + 2000 + 250, `poster ${posterAt - onAt} ms after power on, more than ~2 s late`);
  check(`wake timing: first poster ${posterAt - onAt} ms after the power-on request`);
});

// 8. deviceHelper switched OFF after it was on (Save, helper present): the setting alone gates every helper call.
const saveSettings = async (page, helperOn) => {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForFunction(() => document.getElementById('settings').open);
  await page.setChecked('input[name="deviceHelper"]', helperOn);
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
};
// No pointer events: a press while asleep is a manual wake (even inside a dialog), which would end the sleep first.
const untickAndSave = async (page) => {
  await page.evaluate(() => {
    document.querySelector('#settings-form [name="deviceHelper"]').checked = false;
    document.getElementById('settings-form').requestSubmit();
  });
  await page.waitForFunction(() => !document.getElementById('settings').open);
};
// 8a. Off while awake, then sleep and wake: no power off, no power on, no temperature refresh, no CPU temperature line.
await withApp(
  { serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true }), clock: { time: '2026-01-05T00:59:40' } },
  async ({ page, context, app, mock }) => {
    await mock.stop();
    const seen = await watch(page);
    await page.goto(app.url);
    await page.waitForFunction(() => document.querySelectorAll('.poster-layer.active').length > 0 || document.body.classList.contains('asleep') === false, null, { timeout: 15000 });
    await openDiag(page);
    await page.waitForFunction(() => [...document.querySelectorAll('#diag-list dt')].some((dt) => dt.textContent === 'CPU temperature'), null, { timeout: 10000 });
    await closeDiag(page);
    await saveSettings(page, false);
    const before = seen.helper.length;
    await openDiag(page);
    await advance(page, 12000, 1000);
    assert.equal(await diagRow(page, 'CPU temperature'), undefined, 'no CPU temperature line');
    await closeDiag(page);
    await waitAsleepFake(page);
    await advance(page, 5000, 500);
    await mock.play('3');
    await advanceUntil(page, async () => !(await isAsleep(page)), (POLL + 2) * 1000);
    await advance(page, TV_WAKE_MS + 3000, 500);
    assert.equal(seen.helper.length, before, `no /__helper/ request after switching off: ${JSON.stringify(seen.helper.slice(before))}`);
    assert.deepEqual((await helperCalls(context, app)).map((c) => c.action), [], 'the server recorded no power call');
    assert.deepEqual(seen.errors, []);
    check('deviceHelper switched off while awake: no power off, no power on, no temperature');
  },
);
// 8b. Off after the TV was switched off (Settings was open as sleep began): the Save sends ONE power on; the wake sends none.
await withApp(
  { serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true }), clock: { time: '2026-01-05T00:59:40' } },
  async ({ page, context, app, mock }) => {
    await mock.stop();
    const seen = await watch(page);
    await page.goto(app.url);
    await page.waitForFunction(() => document.querySelectorAll('.poster-layer.active').length > 0 || document.body.classList.contains('asleep') === false, null, { timeout: 15000 });
    await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
    await page.waitForFunction(() => document.getElementById('settings').open);
    await waitAsleepFake(page);
    await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 1, 10000, 500);
    await untickAndSave(page);
    assert.equal(await isAsleep(page), true, 'still asleep after the save');
    await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 2, 10000, 500);
    const before = seen.helper.length;
    await mock.play('3');
    await advanceUntil(page, async () => !(await isAsleep(page)), (POLL + 2) * 1000);
    await advanceUntil(page, async () => seen.order.includes('poster'), 15000, 500);
    assert.equal(seen.helper.length, before, 'no /__helper/ request after the save');
    assert.deepEqual((await helperCalls(context, app)).map((c) => [c.action, c.on]), [['display', false], ['display', true]], 'the power off, then the one power on at the save');
    check('deviceHelper switched off while asleep: one power on at the save, none at the wake');
  },
);

// 9. Off while the app has the TV powered off: ONE power on at the Save (after the power off), then silence through a
// wake and a second sleep.
await withApp(
  { serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true }), clock: { time: INSIDE } },
  async ({ page, context, app, mock }) => {
    await mock.stop();
    const seen = await watch(page);
    await page.goto(app.url);
    await waitAsleep(page);
    await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 1, 10000, 500);
    await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
    await page.waitForFunction(() => document.getElementById('settings').open);
    await untickAndSave(page);
    await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 2, 10000, 500);
    const shape = async () => (await helperCalls(context, app)).map((c) => [c.action, c.on]);
    assert.deepEqual(await shape(), [['display', false], ['display', true]], 'one power on after the power off');
    const before = seen.helper.length;
    await advance(page, 6000);
    await mock.play('3');
    await advanceUntil(page, async () => !(await isAsleep(page)), (POLL + 2) * 1000);
    await advance(page, TV_WAKE_MS + 3000, 500);
    await mock.stop();
    await waitAsleepFake(page).catch(() => advanceUntil(page, () => isAsleep(page), 300000, 1000));
    await advance(page, 10000, 500);
    assert.deepEqual(await shape(), [['display', false], ['display', true]], 'no helper call through the wake and the second sleep');
    assert.equal(seen.helper.length, before, 'no /__helper/ request after the save');
    assert.deepEqual(seen.errors, []);
    check('deviceHelper switched off with the TV off: one power on, then silence');
  },
);

// 10. A live preview never changes deviceHelper (DHI1, DHI2): the saved value stays in force until Save, so moving a live
// control after ticking or unticking the box neither sends nor withholds a helper call early.
const moveLive = (page, helperOn) =>
  page.evaluate((on) => {
    const form = document.getElementById('settings-form');
    form.querySelector('[name="deviceHelper"]').checked = on;
    const range = form.querySelector('[name="frameBrightness"]');
    range.value = String(Number(range.value) === 80 ? 70 : 80);
    range.dispatchEvent(new Event('input', { bubbles: true })); // a live control: previews the whole form
  }, helperOn);
const submitNow = async (page) => {
  await page.evaluate(() => document.getElementById('settings-form').requestSubmit());
  await page.waitForFunction(() => !document.getElementById('settings').open);
};
// 10a. DHI1: off while asleep with the TV off, with a live control moved before Save: still exactly one power on.
await withApp(
  { serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true }), clock: { time: INSIDE } },
  async ({ page, context, app, mock }) => {
    await mock.stop();
    const seen = await watch(page);
    await page.goto(app.url);
    await waitAsleep(page);
    await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 1, 10000, 500);
    await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
    await page.waitForFunction(() => document.getElementById('settings').open);
    await moveLive(page, false);
    await submitNow(page);
    await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 2, 10000, 500);
    const shape = async () => (await helperCalls(context, app)).map((c) => [c.action, c.on]);
    assert.deepEqual(await shape(), [['display', false], ['display', true]], 'one power on after the power off');
    const before = seen.helper.length;
    await advance(page, 6000);
    await mock.play('3');
    await advanceUntil(page, async () => !(await isAsleep(page)), (POLL + 2) * 1000);
    await advance(page, TV_WAKE_MS + 3000, 500);
    await mock.stop();
    await waitAsleepFake(page).catch(() => advanceUntil(page, () => isAsleep(page), 300000, 1000));
    await advance(page, 10000, 500);
    assert.deepEqual(await shape(), [['display', false], ['display', true]], 'nothing after, through a wake and a second sleep');
    assert.equal(seen.helper.length, before, 'no /__helper/ request after the save');
    assert.deepEqual(seen.errors, []);
    check('DHI1: off with a live control moved: one power on, then silence');
  },
);
// 10b. DHI2: ticked on with a live control moved before Save: the Save probes and Diagnostics shows the CPU temperature.
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: false }) }, async ({ page, app }) => {
  const seen = await watch(page);
  await page.goto(app.url);
  await page.waitForFunction(() => document.querySelectorAll('.poster-layer.active').length > 0, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForFunction(() => document.getElementById('settings').open);
  const before = seen.helper.length;
  await moveLive(page, true);
  assert.equal(seen.helper.length, before, 'the live preview makes no helper request');
  await submitNow(page);
  await advanceUntil(page, async () => seen.helper.length > before, 10000, 500);
  assert.ok(seen.helper.length > before, 'the Save probed the helper');
  await advance(page, 1000, 500); // the probe's answer lands
  await openDiag(page);
  await page.waitForFunction(() => [...document.querySelectorAll('#diag-list dt')].some((dt) => dt.textContent === 'CPU temperature'), null, { timeout: 10000 });
  assert.deepEqual(seen.errors, []);
  check('DHI2: on with a live control moved: probe at Save, CPU temperature shown');
});

// 11. DHM1: the long deviceHelper label does not squeeze its checkbox; it is as wide as the others.
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true }) }, async ({ page, app }) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto(app.url);
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForFunction(() => document.getElementById('settings').open);
  const widths = await page.evaluate(() => ({
    helper: document.querySelector('input[name="deviceHelper"]').getBoundingClientRect().width,
    night: document.querySelector('input[name="nightDim"]').getBoundingClientRect().width,
  }));
  assert.equal(widths.helper, widths.night, `deviceHelper checkbox ${widths.helper}px, nightDim ${widths.night}px`);
  check('DHM1: the deviceHelper checkbox keeps the width of the others');
});

// 12-13. DHM2 (K38): every kind of wake with the helper on shows power on, then TV_WAKE_MS, then the poster fetch.
// Cases 2 and 7 cover the playback wake; these cover a key press while asleep and the end of the schedule.

/** Steps the fake clock until the first poster fetch after a wake; returns { onAt, posterAt } on the page's fake clock. */
async function wakeSequence(page, seen, maxMs) {
  let onAt = null;
  let posterAt = null;
  for (let t = 0; t < maxMs && posterAt === null; t += 250) {
    await advance(page, 250, 250);
    onAt ??= await page.evaluate(() => window.__helperFetch.find((f) => f.body.includes('"on":true'))?.at ?? null);
    if (seen.order.includes('poster')) posterAt = await page.evaluate(() => Date.now()); // the end of the step the fetch fell in
  }
  assert.notEqual(onAt, null, 'power on was requested');
  assert.notEqual(posterAt, null, 'a poster was fetched');
  assert.ok(posterAt - onAt >= TV_WAKE_MS, `poster ${posterAt - onAt} ms after power on, before TV_WAKE_MS`);
  assert.ok(posterAt - onAt <= TV_WAKE_MS + 2000 + 250, `poster ${posterAt - onAt} ms after power on, more than ~2 s late`);
  const order = seen.order.filter((o) => o.startsWith('helper:display:') || o === 'poster');
  assert.deepEqual(order, ['helper:display:{"on":false}', 'helper:display:{"on":true}', 'poster'], `order of calls: ${order.join(' | ')}`);
  return { onAt, posterAt };
}

// 12. A key press while asleep (manual wake).
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true, nowPlayingPollSeconds: 20 }), clock: { time: INSIDE } }, async ({ page, context, app, mock }) => {
  await mock.stop();
  const seen = await watch(page);
  await page.goto(app.url);
  await waitAsleep(page);
  await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 1, 10000, 500);
  assert.ok(!seen.order.includes('poster'), 'no poster while asleep');
  await freezeClock(page);
  await page.keyboard.press('a'); // a manual wake: the display stays awake for 60 s
  await advanceUntil(page, async () => !(await isAsleep(page)), 3000, 250);
  const { onAt, posterAt } = await wakeSequence(page, seen, 20000);
  assert.deepEqual((await helperCalls(context, app)).map((c) => [c.action, c.on]), [['display', false], ['display', true]]);
  assert.deepEqual(seen.errors, []);
  check(`manual wake (key press): power on, then the poster fetch ${posterAt - onAt} ms later`);
});

// 13. The end of the schedule (07:00).
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true, nowPlayingPollSeconds: 20 }), clock: { time: '2026-01-05T06:59:40' } }, async ({ page, context, app, mock }) => {
  await mock.stop();
  const seen = await watch(page);
  await page.goto(app.url);
  await waitAsleep(page);
  await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 1, 10000, 500);
  assert.ok(!seen.order.includes('poster'), 'no poster while asleep');
  await freezeClock(page);
  const { onAt, posterAt } = await wakeSequence(page, seen, 60000);
  assert.equal(await isAsleep(page), false, 'awake after the schedule ended');
  assert.deepEqual((await helperCalls(context, app)).map((c) => [c.action, c.on]), [['display', false], ['display', true]]);
  assert.deepEqual(seen.errors, []);
  check(`schedule-end wake (07:00): power on, then the poster fetch ${posterAt - onAt} ms later`);
});

// 14-17. tv-wake-fixes (D73, D80). One failed helper status read clears helper.available (js/helper.js read()); the TV was
// still switched off by us, so the wake must send power on all the same. The fake helper cannot fail, so one request to
// __helper/status is aborted with a Playwright route (times: 1). The read is made by opening Settings while asleep (it
// probes), through a script click: a pointer press while asleep would be a manual wake.
const openSettings = async (page) => {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForFunction(() => document.getElementById('settings').open);
};
const cancelSettings = async (page) => {
  await page.evaluate(() => document.getElementById('settings-cancel').click());
  await page.waitForFunction(() => !document.getElementById('settings').open);
};
const shapeOf = async (context, app) => (await helperCalls(context, app)).map((c) => [c.action, c.on]);
const cpuRowShown = async (page) => {
  await openDiag(page);
  const row = await diagRow(page, 'CPU temperature');
  await closeDiag(page);
  return row !== undefined;
};

/** Asleep with the TV switched off (one `display off` recorded), then one status read fails; resolves how many were aborted. */
async function failOneStatusRead(page, context, app, { keepSettingsOpen = false } = {}) {
  await page.goto(app.url);
  await waitAsleep(page);
  await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 1, 10000, 500);
  assert.deepEqual(await shapeOf(context, app), [['display', false]], 'the TV was switched off');
  const aborted = { count: 0 };
  await page.route('**/__helper/status', (route) => (aborted.count++, route.abort()), { times: 1 });
  await openSettings(page); // opening Settings probes the helper
  await advanceUntil(page, async () => aborted.count === 1, 5000, 250);
  await advance(page, 500, 250);
  if (!keepSettingsOpen) await cancelSettings(page);
  return aborted;
}

// 14. (a) A failed read while asleep does not strand the TV: the wake still sends power on, once.
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true }), clock: { time: INSIDE } }, async ({ page, context, app, mock }) => {
  await mock.stop();
  const seen = await watch(page);
  await failOneStatusRead(page, context, app);
  assert.equal(await cpuRowShown(page), false, 'after the failed read the helper is reported unavailable (Diagnostics)');
  assert.deepEqual(await shapeOf(context, app), [['display', false]], 'a failed read sends nothing');
  await mock.play('3');
  await advanceUntil(page, async () => !(await isAsleep(page)), (POLL + 2) * 1000);
  await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 2, 3000, 250);
  await advanceUntil(page, async () => seen.order.includes('poster'), 15000, 500);
  assert.deepEqual(await shapeOf(context, app), [['display', false], ['display', true]], 'the calls end with display on, sent once');
  const onAt = seen.order.findIndex((o) => o.startsWith('helper:display:') && o.includes('true'));
  assert.ok(onAt >= 0 && seen.order.indexOf('poster') > onAt, `power on came before the poster fetch: ${seen.order.join(' | ')}`);
  await advance(page, 8000, 500);
  assert.equal((await helperCalls(context, app)).length, 2, 'no further power call');
  check('failed status read while asleep: the wake still powers the TV on (once), then fetches the poster');
});

// 15. (b) The failed read is not permanent: a later successful read reports the helper available again and sends nothing.
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true }), clock: { time: INSIDE } }, async ({ page, context, app, mock }) => {
  await mock.stop();
  await failOneStatusRead(page, context, app);
  assert.equal(await cpuRowShown(page), false, 'unavailable after the failed read');
  await openSettings(page); // the next probe succeeds
  await advance(page, 1000, 250);
  await cancelSettings(page);
  assert.equal(await cpuRowShown(page), true, 'available again after a successful read');
  await advance(page, 6000, 500);
  assert.deepEqual(await shapeOf(context, app), [['display', false]], 'nothing extra was sent: no second power off, no power on while asleep');
  await mock.play('3');
  await advanceUntil(page, async () => !(await isAsleep(page)), (POLL + 2) * 1000);
  await advance(page, TV_WAKE_MS + 2000, 500);
  assert.deepEqual(await shapeOf(context, app), [['display', false], ['display', true]], 'then exactly one power on at the wake');
  check('failed read, then a successful one: helper available again, nothing extra sent');
});

// 16. The setting switched off after a failed read, with the TV still off: the release still sends its one power on.
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true }), clock: { time: INSIDE } }, async ({ page, context, app, mock }) => {
  await mock.stop();
  await failOneStatusRead(page, context, app, { keepSettingsOpen: true }); // the failed read was the last one: the Save finds the helper unavailable
  await untickAndSave(page);
  await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 2, 10000, 500);
  await advance(page, 6000, 500);
  assert.deepEqual(await shapeOf(context, app), [['display', false], ['display', true]], 'exactly one power on at the Save');
  check('failed status read, then the setting switched off with the TV off: one power on');
});

// 17. (c) A tick() inside the TV wake window is honoured after it. The display wakes on playback with a poster still on
// screen (rotation an hour away, now playing off); inside the window a Save changes a limit setting (limitNowPlaying), which asks for a
// forced tick. That tick used to be dropped: the display kept the old poster for the whole rotation. No pointer, touch or
// key input is used after the wake (script clicks and a form submit only).
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true, showNowPlaying: false }), clock: { time: '2026-01-05T00:59:40' } }, async ({ page, context, app, mock }) => {
  await watch(page);
  await page.goto(app.url);
  await page.waitForFunction(() => document.querySelectorAll('.poster-layer.active').length > 0, null, { timeout: 15000 });
  await waitAsleepFake(page);
  await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 1, 10000, 500);
  await freezeClock(page);
  await mock.play('3');
  await advanceUntil(page, async () => !(await isAsleep(page)), (POLL + 2) * 1000, 250);
  const onAt = await page.evaluate(() => window.__helperFetch.find((f) => f.body.includes('"on":true'))?.at ?? null);
  const nowAt = await page.evaluate(() => Date.now());
  assert.notEqual(onAt, null, 'power on was requested');
  assert.ok(nowAt - onAt < TV_WAKE_MS - 1000, `still inside the TV wake window (${nowAt - onAt} ms after power on)`);
  const reason = async () => {
    await openDiag(page);
    const text = await diagRow(page, 'Reason');
    await closeDiag(page);
    return text;
  };
  assert.notEqual(await reason(), 'manual refresh', 'the poster on screen came from the rotation, not a forced tick');
  await openSettings(page);
  await page.evaluate(() => {
    document.querySelector('#settings-form [name="limitNowPlaying"]').checked = false; // a limit setting: applySettings asks for a forced tick, nothing else changes
    document.getElementById('settings-form').requestSubmit();
  });
  await page.waitForFunction(() => !document.getElementById('settings').open);
  assert.ok((await page.evaluate(() => Date.now())) - onAt < TV_WAKE_MS, 'the Save landed inside the window');
  assert.notEqual(await reason(), 'manual refresh', 'no poster is chosen inside the window');
  await advanceUntil(page, async () => (await reason()) === 'manual refresh', TV_WAKE_MS + 8000, 250);
  await page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
  check('a Save inside the TV wake window: its forced tick runs after the window, a new poster appears without input');
});

// 18. Pause inside the TV wake window drops the tick the window queued: after the window nothing is chosen, and the
// display still says paused. Same set-up as case 17 (a forced tick queued by a Save), then a script click on Pause.
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true, showNowPlaying: false }), clock: { time: '2026-01-05T00:59:40' } }, async ({ page, context, app, mock }) => {
  await watch(page);
  await page.goto(app.url);
  await page.waitForFunction(() => document.querySelectorAll('.poster-layer.active').length > 0, null, { timeout: 15000 });
  await waitAsleepFake(page);
  await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 1, 10000, 500);
  await freezeClock(page);
  await mock.play('3');
  await advanceUntil(page, async () => !(await isAsleep(page)), (POLL + 2) * 1000, 250);
  const onAt = await page.evaluate(() => window.__helperFetch.find((f) => f.body.includes('"on":true'))?.at ?? null);
  assert.notEqual(onAt, null, 'power on was requested');
  assert.ok((await page.evaluate(() => Date.now())) - onAt < TV_WAKE_MS - 1000, 'still inside the TV wake window');
  await openSettings(page);
  await page.evaluate(() => {
    document.querySelector('#settings-form [name="limitNowPlaying"]').checked = false; // a forced tick is queued
    document.getElementById('settings-form').requestSubmit();
  });
  await page.waitForFunction(() => !document.getElementById('settings').open);
  await page.evaluate(() => document.querySelector('[data-action="pause"]').click()); // no pointer input
  assert.ok((await page.evaluate(() => Date.now())) - onAt < TV_WAKE_MS, 'the Pause landed inside the window');
  await advance(page, TV_WAKE_MS + 8000, 250);
  await openDiag(page);
  assert.equal(await diagRow(page, 'Reason'), 'rotation', 'the queued tick did not run after Pause: no new poster was chosen');
  assert.equal(await diagRow(page, 'Next check'), 'paused', 'Diagnostics still shows the pause');
  await closeDiag(page);
  assert.equal(await page.evaluate(() => document.querySelector('[data-action="pause"]').getAttribute('aria-pressed')), 'true');
  check('Pause inside the TV wake window: the queued tick does not run after the window, the display stays paused');
});

// 19. The display goes back to sleep inside the TV wake window, with a tick queued: the end of the window still runs it, so
// the playback poll goes on and a later playback wakes the display again with no input. The set-up leaves the queued tick as the
// ONLY thing that can restart the poll: Pause inside the window clears the poll timer, Resume and the Save queue ticks, and the
// Save (sleep end 07:00 -> 08:00) puts the display back to sleep.
await withApp({ serveArgs: HELPER_ARGS, settings: seed({ deviceHelper: true, sleepEnabled: true, showNowPlaying: false }), clock: { time: '2026-01-05T06:59:40' } }, async ({ page, context, app, mock }) => {
  await mock.stop();
  await watch(page);
  await page.goto(app.url);
  await waitAsleep(page);
  await advanceUntil(page, async () => (await helperCalls(context, app)).length >= 1, 10000, 500);
  await freezeClock(page);
  await advanceUntil(page, async () => !(await isAsleep(page)), 30000, 250); // 07:00: the schedule ends, the TV window starts
  const onAt = await page.evaluate(() => window.__helperFetch.find((f) => f.body.includes('"on":true'))?.at ?? null);
  assert.notEqual(onAt, null, 'power on was requested');
  const inWindow = async (what) => assert.ok((await page.evaluate(() => Date.now())) - onAt < TV_WAKE_MS - 250, `${what}: still inside the TV wake window`);
  await inWindow('awake');
  const click = (action) => page.evaluate((a) => document.querySelector(`[data-action="${a}"]`).click(), action); // no pointer input
  await click('pause'); // clears the poll timer
  await click('pause'); // Resume: its tick is queued, not run
  await openSettings(page);
  await page.evaluate(() => {
    document.querySelector('#settings-form [name="sleepEnd"]').value = '08:00'; // 07:00 is inside the window again
    document.getElementById('settings-form').requestSubmit();
  });
  await page.waitForFunction(() => !document.getElementById('settings').open);
  await inWindow('after the Save');
  await waitAsleep(page); // asleep again, still inside the window
  await advance(page, TV_WAKE_MS + 2000, 250); // the window ends
  assert.equal(await isAsleep(page), true, 'still asleep after the window');
  await mock.play('3');
  await advanceUntil(page, async () => !(await isAsleep(page)), (POLL + 3) * 1000, 250);
  check('asleep again inside the TV wake window: the queued tick still runs after it, so a later playback wakes the display');
});
