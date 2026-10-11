// The keyboardless first run (R-FIRST-1, D3): an unconfigured display starts the plex.tv code flow by itself and
// shows the code large and upright on the empty-state card. plex.tv is intercepted with context.route in every case,
// so nothing here reaches the real service. Every case names pixelShift: false (convention 7).

import assert from 'node:assert/strict';
import { createPinAuth } from '../../js/kiosk.js';
import { withApp } from './lib.mjs';

const check = (name) => console.log(`  ok  ${name}`);
const cases = [];
const firstRunCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], ...opts }, fn });

const PIN = '2468';
const pinAuth = await createPinAuth(PIN);
const withPin = { settingsPinHash: pinAuth.hash, settingsPinSalt: pinAuth.salt };

const unconfigured = (extra = {}) => ({ pixelShift: false, ...extra });
const configured = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  showNowPlaying: false,
  rotateSeconds: 3600,
  pixelShift: false,
  ...extra,
});

/**
 * Stands in for plex.tv. `codes` and `lifetimes` (seconds) are per pin, in order, the last one repeating.
 * `seen.mode` can be flipped mid-test: 'ok' | 'abort' (network failure) | 'junk' (a reply with no code).
 * `approveAfterPolls` makes the pin claimable: that many polls later it answers with `authToken`. `seen.hold = true`
 * keeps it unapproved however many polls come, until the test lets go.
 */
async function interceptPlexTv(context, { codes = ['WXYZ'], lifetimes = [900], authToken = null, approveAfterPolls = 1, resources = [] } = {}) {
  const seen = { pins: 0, polls: 0, resources: 0, resourceTokens: [], mode: 'ok', hold: false, bodies: [] };
  const pick = (list, n) => list[Math.min(n, list.length - 1)];
  await context.route('https://plex.tv/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = { 'access-control-allow-origin': '*' };
    const json = (body) => route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() === 'POST' && url.pathname === '/api/v2/pins') {
      const n = seen.pins++;
      if (seen.mode === 'abort') return route.abort('failed');
      if (seen.mode === 'junk') return json({});
      const life = pick(lifetimes, n);
      return json({ id: 100 + n, code: pick(codes, n), expiresIn: life, expiresAt: new Date(Date.now() + life * 1000).toISOString(), authToken: null });
    }
    if (url.pathname.startsWith('/api/v2/pins/')) {
      seen.polls++;
      return json({ id: 100, authToken: authToken && !seen.hold && seen.polls >= approveAfterPolls ? authToken : null });
    }
    if (url.pathname === '/api/v2/resources') {
      seen.resources++;
      seen.resourceTokens.push(url.searchParams.get('X-Plex-Token')); // the token the server list was asked with
      return json(resources);
    }
    return route.fulfill({ status: 404, headers, body: '' });
  });
  return seen;
}

const posterShown = (page) =>
  page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
const codeIs = (page, code, timeout = 15000) => page.waitForFunction((c) => document.getElementById('signin-code-large').textContent === c, code, { timeout });
const settingsOpen = (page) => page.evaluate(() => document.getElementById('settings').open);
const until = async (fn, what, timeout = 5000) => {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > timeout) assert.fail(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pinIs = (page, want) => page.waitForFunction((w) => document.getElementById('pin-dialog').open === w, want, { timeout: 5000 });
/** Types a PIN on the on-screen keypad and presses OK; the entry is cleared once it has been judged. */
async function enterPin(page, pin) {
  await pinIs(page, true);
  for (const d of pin) await page.click(`#pin-dialog [data-key="${d}"]`);
  await page.click('#pin-dialog [data-key="ok"]');
  await page.waitForFunction(() => document.getElementById('pin-dots').textContent === '', null, { timeout: 5000 });
}
/**
 * Stops the fake clock at `time` and checks it. A flowing Playwright clock keeps time with the real one, so under load a
 * spec that counts requests over simulated time would see real seconds added to its steps. Pause before the page loads and
 * every later step is exactly what runFor/fastForward say. Re-pauses until the page reads `time`, and gives up with a clear
 * error rather than loop forever (the same checked pause as brightness.spec.mjs).
 */
async function pauseAtChecked(page, time, tries = 8) {
  const want = time.getTime();
  let last = null;
  for (let i = 0; i < tries; i++) {
    await page.clock.pauseAt(time).catch(() => {}); // "Cannot fast-forward to the past" if it overshot
    await page.waitForTimeout(100); // let any in-flight real-time tick finish
    last = await page.evaluate(() => Date.now());
    if (last === want) return;
  }
  throw new Error(`the fake clock would not pause at ${time.toISOString()} after ${tries} tries (last read ${last === null ? 'none' : new Date(last).toISOString()})`);
}
/** For a case installed with `clock: { time: start }`: stand the clock still one second after `start`, before goto. */
const freezeClock = (page, start) => pauseAtChecked(page, new Date(start.getTime() + 1000));

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));

// ---- the code appears by itself ----

firstRunCase('unconfigured: the code is on the card without a click, large, one pin, Settings not open', { settings: unconfigured() }, async ({ page, context, app }) => {
  const tv = await interceptPlexTv(context);
  await page.goto(app.url);
  await codeIs(page, 'WXYZ');
  assert.equal(await page.isVisible('#empty'), true, 'the empty card carries it');
  assert.equal(await page.isVisible('#signin-code-large'), true);
  const m = await page.$eval('#signin-code-large', (el) => {
    const r = el.getBoundingClientRect();
    return { size: parseFloat(getComputedStyle(el).fontSize), width: r.width, height: r.height };
  });
  assert.ok(m.size >= 64, `code font ${m.size}px is at least 64`);
  assert.ok(m.width > m.height, 'upright: wider than tall');
  assert.match(await page.textContent('#empty'), /plex\.tv\/link/);
  await until(() => tv.polls >= 1, 'the first poll of the pin', 8000);
  assert.equal(tv.pins, 1, 'exactly one POST /api/v2/pins');
  assert.ok(tv.polls >= 1, 'and the pin is being watched');
  assert.equal(await settingsOpen(page), false, 'Settings is not forced open');
  assert.equal(await page.isVisible('#empty button[data-action="settings"]'), true, 'the card keeps Open settings');
  check('first run: code on the card, >= 64 px, one pin, Settings closed');
});

firstRunCase('when the pin expires, a new code replaces it and exactly one new pin is created', { settings: unconfigured() }, async ({ page, context, app }) => {
  const tv = await interceptPlexTv(context, { codes: ['AAAA', 'BBBB', 'CCCC'], lifetimes: [5, 900] });
  await page.goto(app.url);
  await codeIs(page, 'AAAA');
  assert.equal(tv.pins, 1);
  await codeIs(page, 'BBBB', 20000);
  assert.equal(tv.pins, 2, 'one new pin');
  await wait(3000);
  assert.equal(tv.pins, 2, 'and no more while the new one lives');
  assert.equal(await page.textContent('#signin-code-large'), 'BBBB');
  check('expiry: AAAA -> BBBB, two pins');
});

firstRunCase('a lifetime the clocks disagree about cannot make a pin loop', { settings: unconfigured() }, async ({ page, context, app }) => {
  // plex.tv says the pin has already expired (a Pi with no clock): that must not become a request every instant.
  const tv = await interceptPlexTv(context, { codes: ['AAAA', 'BBBB'], lifetimes: [-3600] });
  await page.goto(app.url);
  await codeIs(page, 'AAAA');
  await wait(3500);
  assert.ok(tv.pins <= 2, `${tv.pins} pins in 3.5 s`);
  check('an already-expired pin is not a hot loop');
});

for (const rotation of [90, 180, 270]) {
  firstRunCase(`at rotation ${rotation} the code block is turned by ${rotation} degrees`, { settings: unconfigured({ rotation }), viewport: { width: 1920, height: 1080 } }, async ({ page, context, app }) => {
    await interceptPlexTv(context);
    await page.goto(app.url);
    await codeIs(page, 'WXYZ');
    await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
    const angle = await page.$eval('#signin-code-large', (el) => {
      let node = el;
      while (node && getComputedStyle(node).transform === 'none') node = node.parentElement;
      if (!node) return 0;
      const [a, b] = getComputedStyle(node).transform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
      return (((Math.round((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360);
    });
    assert.equal(angle, rotation);
    check(`rotation ${rotation}: block angle ${angle}`);
  });
}

// ---- it must not start when it is not wanted ----

firstRunCase('a configured display makes no pin request', { settings: configured() }, async ({ page, context, app }) => {
  const tv = await interceptPlexTv(context);
  await page.goto(app.url);
  await posterShown(page);
  await wait(2500);
  assert.equal(tv.pins, 0);
  assert.equal(tv.polls, 0);
  assert.equal(await page.isVisible('#signin-code-large'), false);
  check('configured: no pin request');
});

firstRunCase('a display provisioned by config.json makes no pin request', { settings: {} }, async ({ page, context, app }) => {
  const tv = await interceptPlexTv(context);
  await context.addInitScript(() => localStorage.removeItem('plexPoster.settings')); // a true first run, so config.json seeds it
  await context.route('**/config.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ plexToken: 'demo-token', serverUrl: `http://127.0.0.1:${app.mockPort}`, libraryKey: '1', showNowPlaying: false, pixelShift: false }) }),
  );
  await page.goto(app.url);
  await posterShown(page);
  await wait(2500);
  assert.equal(tv.pins, 0, 'config.json settled it before any pin was asked for');
  assert.equal(await page.isVisible('#signin-code-large'), false);
  check('config.json provisioned: no pin request');
});

// ---- failures back off ----

const FAILURE_START = new Date('2026-06-01T12:00:00Z');
firstRunCase('a plex.tv network failure retries at most once per 30 s and does not spam the console', { settings: unconfigured(), clock: { time: FAILURE_START } }, async ({ page, context, app }) => {
  const tv = await interceptPlexTv(context);
  await freezeClock(page, FAILURE_START); // simulated time only: load cannot add real seconds to the 29 s step
  tv.mode = 'abort';
  const errors = [];
  const pageErrors = [];
  page.on('console', (m) => m.type() === 'error' && !m.location().url.endsWith('/config.json') && errors.push(m.text()));
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(app.url);
  await until(() => tv.pins >= 1, 'the first attempt');
  await wait(300);
  assert.equal(tv.pins, 1);
  assert.match(await page.textContent('#empty'), /plex\.tv/i, 'the card says what is wrong');

  let elapsed = 0;
  const runFor = async (ms) => {
    await page.clock.runFor(ms);
    elapsed += ms;
    await wait(250);
    assert.ok(tv.pins <= 1 + Math.floor(elapsed / 30_000), `${tv.pins} pins after ${elapsed / 1000} s`);
  };
  await runFor(29_000);
  assert.equal(tv.pins, 1, 'nothing before 30 s');
  await runFor(2_000);
  await until(() => tv.pins === 2, 'the retry after 30 s');
  for (let i = 0; i < 6; i++) await runFor(15_000); // 90 s more
  assert.ok(tv.pins >= 2 && tv.pins <= 4, `${tv.pins} pins in ${elapsed / 1000} s`);
  assert.ok(errors.length <= tv.pins, `${errors.length} console errors for ${tv.pins} failed requests: ${errors.join(' | ')}`);
  assert.deepEqual(pageErrors, []);

  // plex.tv comes back: the next retry produces the code and the complaint goes away.
  tv.mode = 'ok';
  for (let i = 0; i < 12 && !(await page.isVisible('#signin-code-large:text("WXYZ")')); i++) {
    await page.clock.runFor(30_000);
    await wait(250);
  }
  await codeIs(page, 'WXYZ', 5000);
  assert.doesNotMatch(await page.textContent('#firstrun-status'), /can.?t reach/i);
  check(`network failure: ${tv.pins} attempts in ${elapsed / 1000} s, ${errors.length} console errors, then recovers`);
});

firstRunCase('a pin reply with no code is a failure, not a blank card or a loop', { settings: unconfigured() }, async ({ page, context, app }) => {
  const tv = await interceptPlexTv(context);
  tv.mode = 'junk';
  await page.goto(app.url);
  await until(() => tv.pins >= 1, 'the attempt');
  await wait(3000);
  assert.equal(tv.pins, 1, 'one attempt, then it waits');
  assert.equal(await page.isVisible('#signin-code-large:text-matches("[A-Za-z0-9]")'), false, 'no made-up code');
  check('junk pin reply backs off');
});

// ---- the card keeps Open settings ----

firstRunCase('the empty card\'s Open settings still works, and the code flow steps aside while Settings is open', { settings: unconfigured() }, async ({ page, context, app }) => {
  const tv = await interceptPlexTv(context);
  await page.goto(app.url);
  await codeIs(page, 'WXYZ');
  await page.click('#empty button[data-action="settings"]');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  assert.equal(await page.isVisible('#signin-btn'), true);
  assert.equal(await page.isVisible('#first-run-hint'), true);
  const pins = tv.pins;
  await wait(1500);
  assert.equal(tv.pins, pins, 'no second code is requested behind the sheet');
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  await codeIs(page, 'WXYZ', 5000);
  await until(() => tv.pins === pins + 1, 'a fresh code after the sheet closes');
  check('Open settings works; the card\'s flow pauses and resumes');
});

// ---- approval ----

firstRunCase('approving the code signs in: the sheet opens with the server and library filled in, and Save finishes', { settings: unconfigured() }, async ({ page, context, app }) => {
  const resources = [{ name: 'Mock Plex', provides: 'server', owned: true, accessToken: 'demo-token', connections: [{ uri: `http://127.0.0.1:${app.mockPort}`, local: true, relay: false, protocol: 'http' }] }];
  const tv = await interceptPlexTv(context, { authToken: 'user-token-123', resources });
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto(app.url);
  await codeIs(page, 'WXYZ');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 15000 });
  await page.waitForFunction(() => /^✓/.test(document.getElementById('test-result').textContent), null, { timeout: 15000 });
  assert.equal(await page.inputValue('[name="serverUrl"]'), `http://127.0.0.1:${app.mockPort}`);
  assert.equal(await page.inputValue('#library-select'), '1', 'the movie library is chosen');
  assert.equal(await page.getAttribute('[name="plexToken"]', 'type'), 'password', 'the token stays masked');
  assert.equal(tv.pins, 1);
  assert.equal(tv.resources, 1);
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  await posterShown(page);
  assert.equal(await page.isVisible('#empty'), false);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')).libraryKey), '1');
  await wait(500);
  assert.equal(tv.pins, 1, 'configured now: no further pin');
  assert.ok(!logs.some((l) => l.includes('user-token-123') || l.includes('demo-token')), 'no token in the console');
  assert.equal(await page.evaluate(() => document.documentElement.outerHTML.includes('user-token-123')), false, 'no token in the page');
  check('approval -> Settings filled in -> Save -> poster');
});

// ---- SSC3: a code approved while a PIN prompt is open is kept, never lost and never saved without the PIN ----

const resourcesFor = (app) => [{ name: 'Mock Plex', provides: 'server', owned: true, accessToken: 'demo-token', connections: [{ uri: `http://127.0.0.1:${app.mockPort}`, local: true, relay: false, protocol: 'http' }] }];
const approved = (logs) => () => logs.some((l) => l.includes('Sign-in code approved'));

firstRunCase('SSC3 a code approved while the PIN prompt is open: the right PIN opens Settings filled in with it', { settings: unconfigured(withPin) }, async ({ page, context, app }) => {
  const tv = await interceptPlexTv(context, { authToken: 'user-token-123', resources: resourcesFor(app) });
  tv.hold = true;
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto(app.url);
  await codeIs(page, 'WXYZ');
  await page.keyboard.press('s');
  await pinIs(page, true);
  tv.hold = false; // the owner approves the card's code on the phone while the prompt is up
  await until(approved(logs), 'the approval to arrive', 20000);
  assert.equal(await settingsOpen(page), false, 'not open before the PIN');
  assert.ok(!(await stored(page)).plexToken, 'nothing is saved without the PIN');
  await enterPin(page, PIN);
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  await page.waitForFunction(() => /^✓/.test(document.getElementById('test-result').textContent), null, { timeout: 15000 });
  assert.deepEqual(tv.resourceTokens, ['user-token-123'], 'the sheet went on from the approved token');
  assert.equal(await page.inputValue('[name="serverUrl"]'), `http://127.0.0.1:${app.mockPort}`, 'and found the server');
  assert.ok(!(await stored(page)).plexToken, 'still not saved until Save');
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  await posterShown(page);
  assert.equal((await stored(page)).plexToken, 'demo-token');
  check('SSC3 approved during the prompt -> PIN -> Settings filled in');
});

firstRunCase('SSC3 the same through the card\'s Open settings button', { settings: unconfigured(withPin) }, async ({ page, context, app }) => {
  const tv = await interceptPlexTv(context, { authToken: 'user-token-123', resources: resourcesFor(app) });
  tv.hold = true;
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto(app.url);
  await codeIs(page, 'WXYZ');
  await page.click('#empty button[data-action="settings"]');
  await pinIs(page, true);
  tv.hold = false;
  await until(approved(logs), 'the approval to arrive', 20000);
  await enterPin(page, PIN);
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  await page.waitForFunction(() => /^✓/.test(document.getElementById('test-result').textContent), null, { timeout: 15000 });
  assert.deepEqual(tv.resourceTokens, ['user-token-123']);
  check('SSC3 Open settings variant');
});

firstRunCase('SSC3 cancelling the PIN keeps the approved token for the next open, unsaved and with no new code asked for', { settings: unconfigured(withPin) }, async ({ page, context, app }) => {
  const tv = await interceptPlexTv(context, { authToken: 'user-token-123', resources: resourcesFor(app) });
  tv.hold = true;
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto(app.url);
  await codeIs(page, 'WXYZ');
  await page.keyboard.press('s');
  await pinIs(page, true);
  tv.hold = false;
  await until(approved(logs), 'the approval to arrive', 20000);
  // The baseline is read BEFORE the cancel (S4A1): once the prompt closes, a flow that wrongly restarts asks for a new
  // code at once, and a count read after the click would already include it.
  const pins = tv.pins;
  await page.click('#pin-cancel');
  await pinIs(page, false);
  assert.equal(await settingsOpen(page), false);
  assert.ok(!(await stored(page)).plexToken, 'cancelled: nothing saved');
  await wait(1500);
  assert.equal(tv.pins, pins, 'the token is waiting: no new code is asked for');
  // The card says the sign-in worked and what is left (S4A4), with Open settings to do it.
  assert.equal(await page.isVisible('#empty'), true);
  assert.equal(await page.isVisible('#signin-code-large'), false, 'no code to enter any more');
  const card = await page.innerText('#empty');
  assert.match(card, /signed in/i, 'the card says the sign-in worked');
  assert.match(card, /open settings to finish/i, 'and what to do next');
  assert.doesNotMatch(card, /get started|enter this code/i, 'not the first-run invitation');
  assert.equal(await page.isVisible('#empty button[data-action="settings"]'), true, 'with the Open settings button');
  // The next successful open picks it up.
  await page.keyboard.press('s');
  await enterPin(page, PIN);
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  await page.waitForFunction(() => /^✓/.test(document.getElementById('test-result').textContent), null, { timeout: 15000 });
  assert.deepEqual(tv.resourceTokens, ['user-token-123'], 'the sheet went on from the approved token');
  assert.ok(!(await stored(page)).plexToken, 'still not saved until Save');
  assert.equal(await page.getAttribute('[name="plexToken"]', 'type'), 'password');
  assert.ok(!logs.some((l) => l.includes('user-token-123')), 'no token in the console');
  check('SSC3 cancel keeps the token pending; the next open has it');
});

// ---- K50 (SSC5): how often the display asks plex.tv ----

const HOUR_START = new Date('2026-06-01T12:00:00');
firstRunCase(
  'K50 an unanswered code is polled every 5 s while fresh; after 3 expire unused it waits 5 minutes; an hour stays small',
  { settings: unconfigured(), clock: { time: HOUR_START } },
  async ({ page, context, app }) => {
    const tv = await interceptPlexTv(context, { lifetimes: [900] });
    await freezeClock(page, HOUR_START); // every second below is a simulated one: runFor is the only thing that moves time
    await page.goto(app.url);
    await until(() => tv.pins >= 1, 'the first code');
    const requests = () => tv.pins + tv.polls;
    let at = 0; // fake seconds since the first code
    // The fake clock stands still between steps, so a timer the page sets after a reply is measured from the same instant.
    const settle = async () => {
      await page.evaluate(() => 0);
      await wait(30);
    };
    await settle();
    // What the card shows. A live code asks to be entered; a resting display shows only why it is quiet (S4A4).
    const codeCard = async (when) => {
      assert.equal(await page.isVisible('#empty .firstrun-lead'), true, `${when}: the instruction is shown`);
      assert.equal(await page.isVisible('#signin-code-large'), true, `${when}: the code is shown`);
      assert.match(await page.innerText('#empty-message'), /Connect to your Plex server to get started/i, `${when}: the general line is shown with a live code`);
    };
    const restCard = async (when) => {
      assert.equal(await page.isVisible('#empty .firstrun-lead'), false, `${when}: no instruction to enter a code`);
      assert.equal(await page.isVisible('#signin-code-large'), false, `${when}: no code and no placeholder squares`);
      const text = await page.innerText('#empty');
      assert.doesNotMatch(text, /enter this code/i, `${when}: it must not ask for a code that is not there`);
      assert.doesNotMatch(text, /····/, `${when}: no placeholder squares`);
      assert.match(await page.innerText('#firstrun-status'), /ran out.*5 minutes/i, `${when}: the rest message is what is shown`);
      // K53 (D43): the general invitation steps aside, so the rest message is the only line that speaks.
      assert.equal(await page.isVisible('#empty-message'), false, `${when}: the general line is hidden`);
      assert.doesNotMatch(text, /Connect to your Plex server to get started/i, `${when}: only the rest message is shown`);
      assert.equal(await page.isVisible('#firstrun-status'), true, `${when}: the rest message is visible`);
    };
    // S6C1: once the rest is over the card is a code card again (no resting class, a new status, the general line back).
    const restOver = async (when) => {
      await page.waitForFunction(() => !document.getElementById('firstrun').classList.contains('resting'), null, { timeout: 10000 });
      assert.doesNotMatch(await page.innerText('#firstrun-status'), /ran out/i, `${when}: the status has changed`);
      assert.match(await page.innerText('#firstrun-status'), /Asking plex\.tv for a code|Waiting for you to approve/i, `${when}: it says it is asking or waiting`);
      assert.equal(await page.isVisible('#empty-message'), true, `${when}: the general line is back`);
    };
    await codeCard('first code');
    // A fresh code: one step of 5 s is one poll (two on the step where the code runs out and its replacement is asked for).
    const freshUntil = async (done) => {
      for (let i = 0; i < 400 && !done(); i++) {
        const before = requests();
        await page.clock.runFor(5000);
        at += 5;
        await until(() => requests() > before, `a request at ${at} s`, 30_000); // real time: generous, so six copies of this spec in parallel cannot starve it (S6C2)
        await settle();
        assert.ok(requests() - before <= 2, `${requests() - before} requests in one 5 s step at ${at} s`);
      }
    };
    await freshUntil(() => at >= 60);
    assert.equal(tv.pins, 1);
    assert.equal(tv.polls, 12, 'twelve polls in the first minute');

    await freshUntil(() => tv.pins === 2); // the first code runs out unused: the second is asked for at once
    await freshUntil(() => tv.pins === 3);
    assert.ok(at >= 29 * 60 && at <= 31 * 60, `two 15 minute codes took ${at} s`);
    await freshUntil(() => at >= 44 * 60); // the third is on screen
    assert.equal(tv.pins, 3);
    await codeCard('third code');
    // Its last minute: it runs out, and nothing replaces it for 5 minutes.
    while (at < 45 * 60 + 10) {
      await page.clock.runFor(5000);
      at += 5;
      await settle();
    }
    const quiet = requests();
    for (let i = 0; i < 9; i++) {
      await page.clock.runFor(30_000);
      at += 30;
      await settle();
      assert.equal(requests(), quiet, `no request while it rests, at ${at} s`);
      await restCard(`rest at ${at} s`);
    }
    assert.equal(tv.pins, 3);
    await page.clock.runFor(60_000); // 5 minutes and a bit after it ran out
    at += 60;
    await until(() => tv.pins === 4, 'the next code after the rest');
    await settle();
    await restOver('after the first rest');
    assert.ok(at >= 50 * 60 && at <= 52 * 60, `the rest ended at ${at} s`);
    await codeCard('fourth code');
    await freshUntil(() => at >= 60 * 60);
    assert.ok(requests() <= 700, `${requests()} requests to plex.tv in an hour (it was about 1,800)`);

    // K51: the count of unused codes stays spent, so the 4th code that runs out is followed by a rest too (not by an
    // instant 5th). It runs out 15 minutes after it was asked for, a little after 65 minutes.
    let ranOut = false;
    while (!ranOut && at < 70 * 60) {
      await page.clock.runFor(5000);
      at += 5;
      await settle();
      ranOut = /ran out/i.test(await page.innerText('#firstrun-status'));
    }
    assert.ok(ranOut, `the 4th code ran out unused and a rest started (none by ${at} s, ${tv.pins} codes asked for)`);
    assert.ok(at >= 64 * 60 && at <= 67 * 60, `the 4th code ran out at ${at} s`);
    assert.equal(tv.pins, 4, 'no 5th code is asked for the moment the 4th runs out');
    const quiet4 = requests();
    for (let i = 0; i < 9; i++) {
      await page.clock.runFor(30_000);
      at += 30;
      await settle();
      assert.equal(requests(), quiet4, `no request in the 5 quiet minutes after the 4th code, at ${at} s`);
      await restCard(`4th rest at ${at} s`);
    }
    await page.clock.runFor(60_000);
    at += 60;
    await until(() => tv.pins === 5, 'the 5th code after the second rest');
    await settle();
    await restOver('after the second rest');
    check(`K50 ${tv.pins} codes and ${tv.polls} polls in ${Math.round(at / 60)} min`);
  },
);

const ASLEEP_START = new Date('2026-06-01T03:00:00');
firstRunCase(
  'K50 an asleep display does not ask plex.tv for anything, and gets a code when it wakes',
  { settings: unconfigured({ sleepEnabled: true, sleepStart: '01:00', sleepEnd: '07:00' }), clock: { time: ASLEEP_START } },
  async ({ page, context, app }) => {
    const tv = await interceptPlexTv(context);
    await freezeClock(page, ASLEEP_START);
    await page.goto(app.url);
    await page.waitForFunction(() => document.body.classList.contains('asleep'), null, { timeout: 10000 });
    for (let i = 0; i < 20; i++) {
      await page.clock.runFor(30_000);
      await wait(30);
    }
    assert.equal(tv.pins, 0, 'no code is asked for while asleep');
    assert.equal(tv.polls, 0, 'and nothing is polled');
    await page.clock.fastForward(5 * 3600_000); // past 07:00
    await page.waitForFunction(() => !document.body.classList.contains('asleep'), null, { timeout: 10000 });
    await codeIs(page, 'WXYZ', 10000);
    assert.equal(tv.pins, 1, 'awake: one code');
    check('K50 asleep: no requests; awake: a code');
  },
);

const FALLING_ASLEEP_START = new Date('2026-06-01T00:59:00');
firstRunCase(
  'K50 a code on screen stops being polled when the display goes to sleep',
  { settings: unconfigured({ sleepEnabled: true, sleepStart: '01:00', sleepEnd: '07:00' }), clock: { time: FALLING_ASLEEP_START } },
  async ({ page, context, app }) => {
    const tv = await interceptPlexTv(context);
    await freezeClock(page, FALLING_ASLEEP_START);
    await page.goto(app.url);
    await codeIs(page, 'WXYZ');
    await page.clock.runFor(30_000);
    await wait(100);
    assert.ok(tv.polls >= 1, 'it was being polled');
    await page.clock.runFor(40_000); // past 01:00
    await page.waitForFunction(() => document.body.classList.contains('asleep'), null, { timeout: 10000 });
    await wait(300);
    const before = tv.pins + tv.polls;
    for (let i = 0; i < 10; i++) {
      await page.clock.runFor(30_000);
      await wait(30);
    }
    assert.equal(tv.pins + tv.polls, before, 'nothing asked of plex.tv while asleep');
    check('K50 falling asleep stops the polling');
  },
);

// ---- run ----

const WORKERS = Number(process.env.E2E_FIRSTRUN_WORKERS || 4);
const only = process.env.E2E_FIRSTRUN_ONLY ? new RegExp(process.env.E2E_FIRSTRUN_ONLY) : null;
const selected = only ? cases.filter((c) => only.test(c.name)) : cases;
const failures = [];
let next = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (next < selected.length) {
      const { name, opts, fn } = selected[next++];
      try {
        await withApp(opts, fn);
      } catch (err) {
        failures.push({ name, err });
      }
    }
  }),
);
for (const { name, err } of failures) console.error(`case ${name} failed:\n${err?.stack || err}`);
if (failures.length) {
  console.error(`${failures.length} of ${selected.length} first-run cases failed`);
  process.exit(1);
}
console.log(`all ${selected.length} first-run cases passed`);
