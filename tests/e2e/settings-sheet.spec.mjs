// The settings sheet (R-SET-1..4, R-SET-6) and the carried fixes: C8M2 (D28), C8M1 (D38), K30, K31 (D40).
// Every case runs against its own mock Plex (serveArgs: []), so the toggles one case flips (down, empty,
// counts-fail) never reach another, and the cases run side by side. pixelShift is named false in the seed
// (convention 7); the one case that needs pixel shift running (K30) turns it on explicitly.

import assert from 'node:assert/strict';
import { startMockPlex } from '../../scripts/mock-plex.mjs';
import { createPinAuth } from '../../js/kiosk.js';
import { EventEmitter } from 'node:events';
import { freePort, guardNetwork, withApp } from './lib.mjs';

const check = (name) => console.log(`  ok  ${name}`);
const cases = [];
const sheetCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], ...opts }, fn });

const PIN = '2468';
const WRONG = '1111';
const pinAuth = await createPinAuth(PIN);
const withPin = { settingsPinHash: pinAuth.hash, settingsPinSalt: pinAuth.salt };

const seed = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  showNowPlaying: false,
  rotateSeconds: 3600,
  pixelShift: false,
  ...extra,
});

// ---- helpers ----

/** Answers the plex.tv calls the sign-in makes, counting them. Nothing here ever reaches the real plex.tv. */
async function interceptPlexTv(context, { code = 'WXYZ' } = {}) {
  const seen = { pins: 0, polls: 0 };
  await context.route('https://plex.tv/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = { 'access-control-allow-origin': '*' };
    const json = (body) => route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() === 'POST' && url.pathname === '/api/v2/pins') {
      seen.pins++;
      return json({ id: 1, code, expiresIn: 900, expiresAt: new Date(Date.now() + 900_000).toISOString(), authToken: null });
    }
    if (url.pathname.startsWith('/api/v2/pins/')) {
      seen.polls++;
      return json({ id: 1, code, authToken: null });
    }
    return route.fulfill({ status: 404, headers, body: '' });
  });
  return seen;
}

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));
const posterShown = (page) =>
  page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
const emptyShown = (page) => page.waitForFunction(() => !document.getElementById('empty').hidden, null, { timeout: 15000 });

/** Opens Settings the way the controls do (a synthetic click works whether or not the controls are showing, or asleep). */
async function openSettings(page) {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
}
const settleTest = (page) => page.waitForFunction(() => /^[✓✗]/.test(document.getElementById('test-result').textContent), null, { timeout: 15000 });
const save = async (page) => {
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open, null, { timeout: 5000 });
};
const libraryLabels = (page) => page.$$eval('#library-select option', (os) => os.map((o) => o.textContent));
const buttonTexts = (page, selector) => page.$$eval(`${selector} button`, (bs) => bs.map((b) => b.textContent.trim()));
const visible = (page, selector) => page.isVisible(selector);
const pinIs = (page, want) => page.waitForFunction((w) => document.getElementById('pin-dialog').open === w, want, { timeout: 5000 });
/** Types a PIN on the on-screen keypad and presses OK; the entry is cleared once it has been judged. */
async function enterPin(page, pin) {
  await pinIs(page, true);
  for (const d of pin) await page.click(`#pin-dialog [data-key="${d}"]`);
  await page.click('#pin-dialog [data-key="ok"]');
  await page.waitForFunction(() => document.getElementById('pin-dots').textContent === '', null, { timeout: 5000 });
}
const UNWATCHED = 'Turn off "unwatched only"';
const pressFix = (page, container) => page.locator(container).getByRole('button', { name: UNWATCHED }).click();

// ---- U1: the connected card ----

sheetCase('U1 configured: the card names the server and library with a Change button; sign-in waits behind Change', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.waitForFunction(() => /Connected to Mock Plex/.test(document.getElementById('connected-card').textContent), null, { timeout: 10000 });
  const card = await page.textContent('#connected-card');
  assert.match(card, /Connected to Mock Plex/);
  assert.match(card, /Movies/);
  assert.equal(await visible(page, '#connected-card'), true);
  assert.deepEqual(await buttonTexts(page, '#connected-card'), ['Change']);
  assert.equal(await visible(page, '#signin-btn'), false, 'sign-in hidden until Change');
  assert.equal(await visible(page, '#signin-panel'), false);
  assert.equal(await visible(page, '#manual-connection'), true, 'the manual token and server fold stays reachable (the PIN-gated token reveal lives in it)');
  assert.equal(await visible(page, '#first-run-hint'), false);
  await page.click('#connected-change');
  assert.equal(await visible(page, '#signin-btn'), true, 'Change reveals sign-in');
  assert.equal(await visible(page, '#manual-connection'), true);
  assert.equal(await visible(page, '#connected-card'), false, 'the card gives way to it');
  check('U1 connected card, Change reveals sign-in');
});

sheetCase('U1 the stored names are used at once, before the connection test answers', { settings: seed({ serverName: 'Den Server', libraryName: 'Films' }) }, async ({ page, app, mock }) => {
  await mock.down(); // the test cannot answer, so the card can only be showing what was stored
  await page.goto(app.url);
  await emptyShown(page);
  await openSettings(page);
  const card = await page.textContent('#connected-card');
  assert.match(card, /Connected to Den Server/);
  assert.match(card, /Films/);
  check('U1 card from stored names');
});

sheetCase('U1 not configured: sign-in and the first-run hint show, the card does not', { settings: {} }, async ({ page, context, app }) => {
  await interceptPlexTv(context);
  await page.goto(app.url);
  await emptyShown(page);
  await openSettings(page);
  assert.equal(await visible(page, '#connected-card'), false);
  assert.equal(await visible(page, '#signin-btn'), true);
  assert.equal(await visible(page, '#first-run-hint'), true);
  check('U1 first run shows sign-in, not the card');
});

// ---- U4: library counts ----

sheetCase('U4 library options carry their counts and skip Music', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.waitForFunction(() => [...document.querySelectorAll('#library-select option')].some((o) => o.textContent === 'Movies · 8 titles'), null, { timeout: 10000 });
  const labels = await libraryLabels(page);
  assert.ok(labels.includes('Movies · 8 titles'), labels.join(' | '));
  assert.ok(!labels.some((l) => /Music/.test(l)), `Music is not listed: ${labels.join(' | ')}`);
  assert.equal(await page.inputValue('#library-select'), '1', 'the saved library stays selected');
  assert.match(await page.textContent('#test-result'), /^✓/);
  check('U4 "Movies · 8 titles", no Music');
});

sheetCase('U4 a failing count request leaves the plain title and the test still succeeds', { settings: seed() }, async ({ page, app, mock }) => {
  await mock.post('counts-fail');
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settleTest(page);
  // The count request has been made (the mock logged it) and failed; the label stays the title alone.
  await page.waitForFunction(
    async (port) => {
      const log = await (await fetch(`http://127.0.0.1:${port}/__mock/log`)).json();
      return log.requests.some((r) => r.includes('X-Plex-Container-Size=0'));
    },
    app.mockPort,
    { timeout: 10000 },
  );
  await page.waitForTimeout(300);
  const labels = await libraryLabels(page);
  assert.ok(labels.includes('Movies'), labels.join(' | '));
  assert.ok(!labels.some((l) => /titles/.test(l)), labels.join(' | '));
  assert.match(await page.textContent('#test-result'), /^✓/, 'the connection test still succeeds');
  check('U4 count request 500 -> "Movies", test ✓');
});

sheetCase('U4 counts load after the test: a stalled count request never delays the result', { settings: seed() }, async ({ page, context, app }) => {
  let release;
  const gate = new Promise((r) => (release = r));
  await context.route(/X-Plex-Container-Size=0/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settleTest(page);
  assert.match(await page.textContent('#test-result'), /^✓/, 'the test finished while the count was still stalled');
  assert.ok((await libraryLabels(page)).includes('Movies'), 'the list is already there, without the count');
  release();
  await page.waitForFunction(() => [...document.querySelectorAll('#library-select option')].some((o) => o.textContent === 'Movies · 8 titles'), null, { timeout: 10000 });
  check('U4 lazy counts');
});

// ---- U2: minutes ----

sheetCase('U2 the preset buttons save 60 / 300 / 900 / 3600 seconds', { settings: seed({ rotateSeconds: 120 }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  for (const seconds of [60, 300, 900, 3600]) {
    await openSettings(page);
    await page.click(`#rotate-field label:has(input[name="rotatePreset"][value="${seconds}"])`);
    assert.equal(await page.isChecked(`input[name="rotatePreset"][value="${seconds}"]`), true);
    assert.equal(await visible(page, '[name="rotateMinutes"]'), false, 'no custom field for a preset');
    await save(page);
    assert.equal((await stored(page)).rotateSeconds, seconds, `preset ${seconds}`);
    await openSettings(page);
    assert.equal(await page.isChecked(`input[name="rotatePreset"][value="${seconds}"]`), true, `${seconds} is selected when reopened`);
    await page.click('#settings-cancel');
    await page.waitForFunction(() => !document.getElementById('settings').open);
  }
  check('U2 presets save 60/300/900/3600 and reopen selected');
});

sheetCase('U2 Custom takes minutes: 2.5 saves 150, and below the minimum clamps to 10 s', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.equal(await page.isChecked('input[name="rotatePreset"][value="3600"]'), true);
  await page.click('#rotate-field label:has(input[name="rotatePreset"][value="custom"])');
  assert.equal(await visible(page, '[name="rotateMinutes"]'), true, 'Custom shows the minutes field');
  assert.equal(await page.inputValue('[name="rotateMinutes"]'), '60', 'it starts from the current value');
  await page.fill('[name="rotateMinutes"]', '2.5');
  await save(page);
  assert.equal((await stored(page)).rotateSeconds, 150);
  await openSettings(page);
  assert.equal(await page.isChecked('input[name="rotatePreset"][value="custom"]'), true);
  assert.equal(await page.inputValue('[name="rotateMinutes"]'), '2.5');
  await page.fill('[name="rotateMinutes"]', '0.01');
  await save(page);
  assert.equal((await stored(page)).rotateSeconds, 10, 'clamped to the schema minimum');
  await openSettings(page);
  await page.fill('[name="rotateMinutes"]', 'abc');
  await save(page);
  assert.equal((await stored(page)).rotateSeconds, 10, 'text that is not a number leaves the value as it was');
  check('U2 custom 2.5 -> 150; 0.01 -> 10; junk -> unchanged');
});

sheetCase('U2 a stored 420 opens as Custom showing 7, and saving without a change keeps 420', { settings: seed({ rotateSeconds: 420 }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.equal(await page.isChecked('input[name="rotatePreset"][value="custom"]'), true);
  assert.equal(await page.inputValue('[name="rotateMinutes"]'), '7');
  assert.equal(await visible(page, '[name="rotateMinutes"]'), true);
  await save(page);
  assert.equal((await stored(page)).rotateSeconds, 420);
  check('U2 420 s -> Custom 7');
});

sheetCase('U2 a stored 10 s shows what retyping it saves, and an unrelated save leaves it at 10', { settings: seed({ rotateSeconds: 10 }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  const shown = await page.inputValue('[name="rotateMinutes"]');
  assert.equal(shown, '0.17');
  await page.click('input[name="showTitle"]');
  await save(page);
  assert.equal((await stored(page)).rotateSeconds, 10);
  await openSettings(page);
  await page.fill('[name="rotateMinutes"]', shown); // retype exactly what it shows
  await save(page);
  assert.equal((await stored(page)).rotateSeconds, 10, 'retyping what is shown saves the same seconds');
  check('U2 10 s: shown 0.17, retyped 10');
});

sheetCase('SSC4 the Custom field shows exactly what will be saved: 0.25 stays 0.25 and saves 15 s', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.click('#rotate-field label:has(input[name="rotatePreset"][value="custom"])');
  await page.fill('[name="rotateMinutes"]', '0.25');
  await page.press('[name="rotateMinutes"]', 'Tab'); // leaving the field makes it show what will be saved
  assert.equal(await page.inputValue('[name="rotateMinutes"]'), '0.25', 'no rounding to 0.3');
  await save(page);
  assert.equal((await stored(page)).rotateSeconds, 15);
  await openSettings(page);
  const shown = await page.inputValue('[name="rotateMinutes"]');
  assert.equal(shown, '0.25');
  await page.fill('[name="rotateMinutes"]', shown);
  await page.press('[name="rotateMinutes"]', 'Tab');
  await save(page);
  assert.equal((await stored(page)).rotateSeconds, 15, 'retyping what it shows saves the same seconds');
  await openSettings(page);
  await page.fill('[name="rotateMinutes"]', '2.55');
  await page.press('[name="rotateMinutes"]', 'Tab');
  assert.equal(await page.inputValue('[name="rotateMinutes"]'), '2.55');
  await save(page);
  assert.equal((await stored(page)).rotateSeconds, 153);
  check('SSC4 0.25 -> 15 s, 2.55 -> 153 s, no drift');
});

sheetCase('U2 the rotation field no longer says seconds, and storage is still seconds', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  const text = await page.textContent('#rotate-field');
  assert.doesNotMatch(text, /seconds/i, text);
  assert.match(text, /minutes?/i);
  assert.equal(await page.inputValue('input[name="rotateSeconds"]'), '3600', 'the stored seconds are what the form holds for the setting');
  check('U2 label has no "seconds"');
});

// ---- U3: Advanced ----

sheetCase('U3 the Advanced fold is closed, holds the three rare settings, and what is changed in it persists', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.equal(await page.$eval('details#advanced', (d) => d.open), false, 'closed by default');
  for (const name of ['nowPlayingPollSeconds', 'randomPoolSize', 'crossfadeMs']) {
    assert.equal(await page.locator(`details#advanced [name="${name}"]`).count(), 1, `${name} is inside`);
    assert.equal(await visible(page, `[name="${name}"]`), false, `${name} is hidden while closed`);
  }
  assert.equal(await page.locator('details#advanced [name="rotateMinutes"]').count(), 0, 'the rotation time stays out');
  await page.click('details#advanced > summary');
  assert.equal(await page.$eval('details#advanced', (d) => d.open), true);
  await page.fill('[name="nowPlayingPollSeconds"]', '35');
  await page.fill('[name="randomPoolSize"]', '42');
  await page.fill('[name="crossfadeMs"]', '700');
  await save(page);
  const s = await stored(page);
  assert.equal(s.nowPlayingPollSeconds, 35);
  assert.equal(s.randomPoolSize, 42);
  assert.equal(s.crossfadeMs, 700);
  await openSettings(page);
  assert.equal(await page.$eval('details#advanced', (d) => d.open), false, 'closed again on the next open');
  assert.equal(await page.inputValue('[name="randomPoolSize"]'), '42');
  check('U3 Advanced fold');
});

// ---- U14: errors carry their fix ----

sheetCase('U14 token "bad": the empty card offers Sign in again, which starts a pin request', { settings: seed({ plexToken: 'bad' }) }, async ({ page, context, app }) => {
  const tv = await interceptPlexTv(context);
  await page.goto(app.url);
  await emptyShown(page);
  await page.waitForFunction(() => /Sign in again/.test(document.getElementById('empty').textContent), null, { timeout: 10000 });
  assert.match(await page.textContent('#empty-message'), /token/i);
  assert.deepEqual(await buttonTexts(page, '#empty'), ['Sign in again', 'Open settings']);
  assert.equal(tv.pins, 0, 'a configured display makes no pin request by itself');
  await page.click('#empty button:text-is("Sign in again")');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  await page.waitForFunction(() => document.getElementById('signin-code').textContent === 'WXYZ', null, { timeout: 5000 });
  assert.equal(tv.pins, 1, 'exactly one pin request');
  assert.equal(await visible(page, '#signin-panel'), true, 'the code is on show in the sheet');
  check('U14 auth -> Sign in again -> pin request');
});

sheetCase('U14 the connection-test result carries Sign in again for a rejected token', { settings: seed({ plexToken: 'bad' }) }, async ({ page, context, app }) => {
  const tv = await interceptPlexTv(context);
  await page.goto(app.url);
  await emptyShown(page);
  await page.click('#empty button[data-action="settings"]');
  await page.waitForFunction(() => document.getElementById('settings').open);
  await settleTest(page);
  assert.match(await page.textContent('#test-result'), /^✗/);
  assert.deepEqual(await buttonTexts(page, '#test-result'), ['Sign in again']);
  await page.click('#test-result button:text-is("Sign in again")');
  await page.waitForFunction(() => document.getElementById('signin-code').textContent === 'WXYZ', null, { timeout: 5000 });
  assert.equal(tv.pins, 1);
  assert.equal(await visible(page, '#signin-btn'), true, 'the sign-in controls are showing');
  check('U14 test result -> Sign in again');
});

sheetCase('U14 server down: Diagnostics and Test connection appear on the card and work', { settings: seed() }, async ({ page, app, mock }) => {
  await mock.down();
  await page.goto(app.url);
  await emptyShown(page);
  await page.waitForFunction(() => /Diagnostics/.test(document.getElementById('empty').textContent), null, { timeout: 10000 });
  assert.deepEqual(await buttonTexts(page, '#empty'), ['Diagnostics', 'Test connection', 'Open settings']);

  await page.click('#empty button:text-is("Diagnostics")');
  await page.waitForFunction(() => document.getElementById('diagnostics').open, null, { timeout: 5000 });
  await page.click('#diag-close');
  await page.waitForFunction(() => !document.getElementById('diagnostics').open);

  await page.click('#empty button:text-is("Test connection")');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  await settleTest(page);
  assert.match(await page.textContent('#test-result'), /^✗/, 'the test ran and the server is still down');
  assert.deepEqual(await buttonTexts(page, '#test-result'), ['Diagnostics', 'Test connection'], 'the result carries the same buttons');

  await mock.up();
  await page.click('#test-result button:text-is("Test connection")');
  await page.waitForFunction(() => /^✓/.test(document.getElementById('test-result').textContent), null, { timeout: 15000 });
  assert.deepEqual(await buttonTexts(page, '#test-result'), [], 'a good result has no fix buttons');

  await mock.down();
  await page.click('#test-btn');
  await page.waitForFunction(() => /^✗/.test(document.getElementById('test-result').textContent), null, { timeout: 15000 });
  await page.click('#test-result button:text-is("Diagnostics")');
  await page.waitForFunction(() => document.getElementById('diagnostics').open, null, { timeout: 5000 });
  check('U14 network -> Diagnostics + Test connection, on the card and in the result');
});

sheetCase('U14 empty library: Turn off "unwatched only" saves the setting and refreshes', { settings: seed({ unwatchedOnly: true }) }, async ({ page, app, mock }) => {
  await mock.post('empty');
  await page.goto(app.url);
  await emptyShown(page);
  await page.waitForFunction(() => /unwatched only/.test(document.getElementById('empty').textContent), null, { timeout: 10000 });
  assert.deepEqual(await buttonTexts(page, '#empty'), ['Turn off "unwatched only"', 'Open settings']);
  assert.equal((await stored(page)).unwatchedOnly, true);
  await page.click('#empty button:text-is("Turn off \\"unwatched only\\"")');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.settings')).unwatchedOnly === false, null, { timeout: 5000 });
  await posterShown(page);
  assert.equal(await visible(page, '#empty'), false, 'the card is gone once a poster is up');
  check('U14 empty -> Turn off "unwatched only"');
});

// ---- SSC1 / SSC2: the unwatched fix is behind the PIN, and only offered when it can help ----

sheetCase('SSC1 with a PIN set, the empty card\'s unwatched fix asks for it: wrong keeps the setting, right turns it off', { settings: seed({ unwatchedOnly: true, ...withPin }) }, async ({ page, app, mock }) => {
  await mock.post('empty');
  await page.goto(app.url);
  await emptyShown(page);
  await page.waitForFunction(() => /unwatched only/.test(document.getElementById('empty').textContent), null, { timeout: 10000 });
  await pressFix(page, '#empty');
  await pinIs(page, true); // asked, not saved at once
  assert.equal((await stored(page)).unwatchedOnly, true, 'nothing saved while the prompt is up');
  await enterPin(page, WRONG);
  assert.equal(await page.evaluate(() => document.getElementById('pin-dialog').open), true, 'a wrong PIN leaves the prompt up');
  assert.equal((await stored(page)).unwatchedOnly, true, 'a wrong PIN changes nothing');
  await enterPin(page, PIN);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.settings')).unwatchedOnly === false, null, { timeout: 5000 });
  await pinIs(page, false);
  await posterShown(page);
  check('SSC1 empty card fix behind the PIN');
});

sheetCase('SSC1 cancelling the PIN leaves the setting alone', { settings: seed({ unwatchedOnly: true, ...withPin }) }, async ({ page, app, mock }) => {
  await mock.post('empty');
  await page.goto(app.url);
  await emptyShown(page);
  await page.waitForFunction(() => /unwatched only/.test(document.getElementById('empty').textContent), null, { timeout: 10000 });
  await pressFix(page, '#empty');
  await pinIs(page, true);
  await page.click('#pin-cancel');
  await pinIs(page, false);
  await new Promise((r) => setTimeout(r, 500));
  assert.equal((await stored(page)).unwatchedOnly, true);
  assert.equal(await visible(page, '#empty'), true, 'still the empty card');
  check('SSC1 cancel keeps unwatchedOnly');
});

sheetCase('SSC1 the toast\'s unwatched fix is behind the PIN too', { settings: seed({ unwatchedOnly: true, showNowPlaying: true, ...withPin }) }, async ({ page, app, mock }) => {
  await mock.post('empty'); // the pool has no unwatched titles; a title that is playing is what keeps a poster on screen
  await mock.play('3');
  await page.goto(app.url);
  await posterShown(page);
  await mock.stop();
  await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
  await page.waitForFunction(() => !document.getElementById('toast').hidden && /unwatched only/.test(document.getElementById('toast').textContent), null, { timeout: 15000 });
  assert.deepEqual(await buttonTexts(page, '#toast'), [UNWATCHED]);
  await pressFix(page, '#toast');
  await pinIs(page, true);
  assert.equal((await stored(page)).unwatchedOnly, true, 'nothing saved while the prompt is up');
  await enterPin(page, WRONG);
  assert.equal((await stored(page)).unwatchedOnly, true);
  await enterPin(page, PIN);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.settings')).unwatchedOnly === false, null, { timeout: 5000 });
  check('SSC1 toast fix behind the PIN');
});

sheetCase('SSC2 everything above the limit with "unwatched only" off: the card does not offer the unwatched fix', { settings: seed({ unwatchedOnly: false, maxContentRating: 'G' }) }, async ({ page, app, mock }) => {
  for (let key = 1; key <= 8; key++) await mock.post('rate', { ratingKey: String(key), contentRating: 'R' });
  await page.goto(app.url);
  await emptyShown(page);
  await page.waitForFunction(() => /at or below G/.test(document.getElementById('empty-message').textContent), null, { timeout: 10000 });
  assert.deepEqual(await buttonTexts(page, '#empty'), ['Open settings'], 'no fix that cannot help');
  check('SSC2 no unwatched fix with unwatchedOnly off');
});

sheetCase('SSC2 the fix is still offered when "unwatched only" is on, limit or not', { settings: seed({ unwatchedOnly: true, maxContentRating: 'G' }) }, async ({ page, app, mock }) => {
  for (let key = 1; key <= 8; key++) await mock.post('rate', { ratingKey: String(key), contentRating: 'R' });
  await mock.post('empty');
  await page.goto(app.url);
  await emptyShown(page);
  await page.waitForFunction(() => /No posters/.test(document.getElementById('empty-message').textContent), null, { timeout: 10000 });
  assert.deepEqual(await buttonTexts(page, '#empty'), [UNWATCHED, 'Open settings']);
  check('SSC2 fix offered with unwatchedOnly on');
});

sheetCase('U14 the toast carries the fixes too: a refresh that fails with a poster on screen', { settings: seed({ showNowPlaying: true }) }, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  await mock.down();
  await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
  await page.waitForFunction(() => !document.getElementById('toast').hidden && /Plex/.test(document.getElementById('toast').textContent), null, { timeout: 15000 });
  assert.deepEqual(await buttonTexts(page, '#toast'), ['Diagnostics', 'Test connection']);
  await page.click('#toast button:text-is("Diagnostics")');
  await page.waitForFunction(() => document.getElementById('diagnostics').open, null, { timeout: 5000 });
  assert.equal(await visible(page, '#toast'), false, 'pressing a button dismisses the toast');
  check('U14 toast with two actions');
});

// ---- C8M2 (D28): Save wakes the display on the NEW connection ----

sheetCase(
  'C8M2 asleep behind Settings, Save wakes the display and the first poster comes from the NEW server',
  { settings: seed({ idleSleepHours: 1, nowPlayingPollSeconds: 3600, showNowPlaying: false }) },
  async ({ page, context, app, mock }) => {
    const portB = await freePort();
    const serverB = await startMockPlex({ port: portB });
    const logOf = async (port) => (await (await fetch(`http://127.0.0.1:${port}/__mock/log`)).json()).requests;
    try {
      // A page load that follows an automatic reload carries the idle clock: this one arrives two hours into idleness.
      await context.addInitScript(() => sessionStorage.setItem('plexPoster.carry', JSON.stringify({ lastPlaybackAt: Date.now() - 2 * 3600_000, at: Date.now() })));
      await page.goto(app.url);
      await page.waitForFunction(() => document.body.classList.contains('asleep'), null, { timeout: 15000 });
      await openSettings(page); // over the veil
      await settleTest(page);
      await page.waitForFunction(() => [...document.querySelectorAll('#library-select option')].some((o) => /titles/.test(o.textContent)), null, { timeout: 10000 }); // the lazy counts have landed
      // No real pointer or key press from here to Save: any of those would wake the display by themselves (a manual wake).
      await page.evaluate(() => document.getElementById('connected-change').click());
      await page.fill('[name="serverUrl"]', `http://127.0.0.1:${portB}`);
      await mock.post('reset-stats');
      await fetch(`http://127.0.0.1:${portB}/__mock/reset-stats`, { method: 'POST' });
      assert.equal(await page.evaluate(() => document.body.classList.contains('asleep')), true, 'still asleep before Save');

      // Save with no pointer or key press of its own, so Save alone is what wakes the display (the idle clock restarts).
      await page.evaluate(() => document.getElementById('settings-form').requestSubmit());
      await page.waitForFunction(() => !document.getElementById('settings').open);
      await page.waitForFunction(() => !document.body.classList.contains('asleep'), null, { timeout: 5000 });
      await posterShown(page);
      await page.waitForFunction(
        async (port) => (await (await fetch(`http://127.0.0.1:${port}/__mock/log`)).json()).requests.some((r) => r.startsWith('/photo/:/transcode')),
        portB,
        { timeout: 10000 },
      );
      const a = await logOf(app.mockPort);
      const b = await logOf(portB);
      assert.deepEqual(a, [], `the old server was not asked anything after Save: ${a.join(', ')}`);
      assert.ok(b.some((r) => r.startsWith('/library/sections/1/all')), `the new server was asked for the pool: ${b.join(', ')}`);
      assert.equal((await stored(page)).serverUrl, `http://127.0.0.1:${portB}`);
    } finally {
      serverB.close();
    }
    check('C8M2 wake tick uses the new connection');
  },
);

// ---- C8M1 (D38): the household help text ----

sheetCase('C8M1 the household help says what is never shown and the two exceptions', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  const help = (await page.textContent('#household-help')).replace(/\s+/g, ' ');
  assert.match(help, /above the limit are never shown/i);
  assert.match(help, /pinned/i);
  assert.match(help, /playing right now/i);
  assert.match(help, /Apply the limit to what.s playing right now/);
  assert.doesNotMatch(help, /pinned poster is always shown/i, 'the old, wrong promise is gone');
  assert.ok(help.length < 400, `short and plain (${help.length} characters)`);
  check('C8M1 help text');
});

// ---- K30: an unsaved Display protection change does not ride along with a live layout move ----

sheetCase(
  'K30 unticking pixel shift then moving a live field: Cancel leaves it running, Save stops it',
  { settings: seed({ pixelShift: true, pixelShiftMinutes: 1 }), clock: { time: new Date('2026-06-01T12:00:00Z') } },
  async ({ page, app }) => {
    const translate = () => page.evaluate(() => document.getElementById('stage').style.translate);
    const settle = () => page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
    await page.goto(app.url);
    await posterShown(page);
    await settle();
    const t0 = await translate();
    assert.notEqual(t0, '', 'pixel shift is on');

    await openSettings(page);
    await page.uncheck('input[name="pixelShift"]');
    assert.equal(await translate(), t0, 'unticking alone previews nothing');
    await page.fill('input[name="posterScale"]', '90'); // a live field: the preview runs
    await settle();
    assert.equal(await translate(), t0, 'the live move did not carry the unsaved tick');
    await page.clock.runFor(61_000);
    await settle();
    const t1 = await translate();
    assert.notEqual(t1, '', 'pixel shift is still running under the preview');
    assert.notEqual(t1, t0, 'and it stepped');

    await page.click('#settings-cancel');
    await page.waitForFunction(() => !document.getElementById('settings').open);
    await page.waitForTimeout(150); // the sheet's 'close' event (it undoes the preview) is queued for a later task
    assert.equal((await stored(page)).pixelShift, true);
    await page.clock.runFor(61_000);
    await settle();
    const t2 = await translate();
    assert.notEqual(t2, '', 'still running after Cancel');
    assert.notEqual(t2, t1, 'and still stepping');
    await openSettings(page);
    assert.equal(await page.inputValue('input[name="posterScale"]'), '100', 'the live change was undone');
    assert.equal(await page.isChecked('input[name="pixelShift"]'), true, 'and pixel shift is still ticked');
    await page.click('#settings-cancel');
    await page.waitForFunction(() => !document.getElementById('settings').open);
    await page.waitForTimeout(150); // the sheet's 'close' event is queued for a later task

    // The same again, but Save: now it stops.
    await openSettings(page);
    await page.uncheck('input[name="pixelShift"]');
    await page.fill('input[name="posterScale"]', '90');
    await save(page);
    assert.equal((await stored(page)).pixelShift, false);
    await page.waitForFunction(() => document.getElementById('stage').style.translate === '', null, { timeout: 5000 });
    assert.equal(await translate(), '', 'Save stops the shift');
    await page.clock.runFor(61_000);
    await settle();
    assert.equal(await translate(), '', 'and it stays stopped');
    check('K30 pixel shift follows Save, not the live preview');
  },
);

sheetCase(
  'K30 the other Display protection fields (shift interval, daily reload) are not previewed either; brightness still is',
  { settings: seed({ pixelShift: true, pixelShiftMinutes: 1, dailyReload: false }), clock: { time: new Date('2026-06-01T12:00:00Z') } },
  async ({ page, app }) => {
    const translate = () => page.evaluate(() => document.getElementById('stage').style.translate);
    const settle = () => page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
    const dailyReloadRow = async () => {
      await page.evaluate(() => document.querySelector('[data-action="diagnostics"]').click());
      const text = await page.evaluate(() => [...document.querySelectorAll('#diag-list dt')].find((dt) => dt.textContent === 'Daily reload')?.nextElementSibling?.textContent);
      await page.click('#diag-close');
      await page.waitForFunction(() => !document.getElementById('diagnostics').open);
      return text;
    };
    await page.goto(app.url);
    await posterShown(page);
    await settle();
    const t0 = await translate();
    assert.match(await dailyReloadRow(), /turned off in Settings/);

    await openSettings(page);
    await page.check('input[name="dailyReload"]');
    await page.fill('input[name="dailyReloadTime"]', '05:30');
    await page.fill('input[name="pixelShiftMinutes"]', '30');
    await page.fill('input[name="posterOffsetX"]', '3'); // a live field: the preview runs
    assert.match(await dailyReloadRow(), /turned off in Settings/, 'the daily reload tick is not previewed');
    await page.clock.runFor(61_000);
    await settle();
    const t1 = await translate();
    assert.notEqual(t1, t0, 'the shift still steps every minute: the 30-minute interval was not previewed');
    await page.click('#settings-cancel');
    await page.waitForFunction(() => !document.getElementById('settings').open);
    await page.waitForTimeout(150); // the sheet's 'close' event (it undoes the preview) is queued for a later task
    const s = await stored(page);
    assert.equal(s.dailyReload, false);
    assert.equal(s.pixelShiftMinutes, 1);

    // The brightness block is its own live group: it still previews.
    await openSettings(page);
    await page.fill('input[name="frameBrightness"]', '40');
    assert.equal(await page.evaluate(() => document.getElementById('frame').style.filter), 'brightness(0.4)', 'the brightness slider still previews live');
    await page.click('#settings-cancel');
    // (The sheet's own 'close' event, which undoes the preview, is queued for a later task: wait for its effect.)
    await page.waitForFunction(() => !document.getElementById('settings').open && document.getElementById('frame').style.filter === '', null, { timeout: 5000 });
    check('K30 the rest of the fieldset is not live; brightness is');
  },
);

// ---- K31: the brightness slider shows its value; the hint does not wrap ----

sheetCase('K31 Frame brightness shows its value unsigned, and the 10–100 % hint stays on one line', { settings: seed({ frameBrightness: 100 }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.equal((await page.textContent('output[data-for="frameBrightness"]')).trim(), '100%');
  await page.fill('input[name="frameBrightness"]', '55');
  assert.equal((await page.textContent('output[data-for="frameBrightness"]')).trim(), '55%', 'no plus sign, same format as the poster size');
  assert.equal((await page.textContent('output[data-for="posterScale"]')).trim(), '100%');
  const hint = await page.$eval('#brightness-hint', (el) => {
    const r = el.getBoundingClientRect();
    return { text: el.textContent.trim(), lines: el.getClientRects().length, height: r.height, line: parseFloat(getComputedStyle(el).lineHeight) };
  });
  assert.match(hint.text, /^10[–-]100 %$/);
  assert.equal(hint.lines, 1, 'one line box');
  assert.ok(hint.height <= hint.line * 1.2, `one line tall (${hint.height}px against a ${hint.line}px line)`);
  check('K31 brightness output and unwrapped hint');
});

// ---- SSA2: the K48 guard counts a plex.tv request as routed only when a handler answered it ----

/** A stand-in browser context: `route()` collects handlers, `send()` plays one request through them like Playwright does. */
function fakeContext() {
  const context = new EventEmitter();
  const routes = []; // [pattern, handler]
  context.route = async (pattern, handler) => routes.push([pattern, handler]);
  context.send = async (method, url, { handled = true } = {}) => {
    const request = { method: () => method, url: () => url };
    const route = { request: () => request, fulfill: async () => {}, continue: async () => {}, abort: async () => {}, fallback: async () => {} };
    context.emit('request', request);
    for (const [pattern, handler] of routes.toReversed()) {
      if (pattern.test(url) && handled) return handler(route); // the most recent matching route first, as Playwright does
    }
  };
  return context;
}

async function guardSelfTest() {
  const fails = async (context, guard) => {
    try {
      await guard.assertClean();
    } catch (err) {
      return err.message;
    }
    return null;
  };
  // A token-carrying context that routes only the pin paths: the resources request is not routed, so it is flagged.
  let context = fakeContext();
  let guard = guardNetwork(context);
  await context.route(/plex\.tv\/api\/v2\/pins/, (route) => route.fulfill({ status: 200, body: '{}' }));
  await context.send('POST', 'https://plex.tv/api/v2/pins');
  await context.send('GET', 'https://plex.tv/api/v2/resources?X-Plex-Token=t');
  let message = await fails(context, guard);
  assert.ok(message, 'the unrouted /api/v2/resources is flagged');
  assert.match(message, /GET https:\/\/plex\.tv\/api\/v2\/resources/);
  assert.doesNotMatch(message, /\/pins/, 'the routed one is not');

  // A route whose pattern mentions plex.tv but whose handler passes the request on to nobody has answered nothing.
  context = fakeContext();
  guard = guardNetwork(context);
  await context.route(/plex\.tv/, (route) => route.fallback());
  await context.send('GET', 'https://plex.tv/api/v2/user');
  assert.match((await fails(context, guard)) || '', /api\/v2\/user/);

  // continue() sends the request on to the real plex.tv, so it answers nothing (S4A3): flagged, alone and as a catch-all.
  context = fakeContext();
  guard = guardNetwork(context);
  await context.route(/plex\.tv/, (route) => route.continue());
  await context.send('GET', 'https://plex.tv/api/v2/user');
  message = (await fails(context, guard)) || '';
  assert.match(message, /api\/v2\/user/, 'a plex.tv request that was continued is flagged');
  assert.match(message, /plex\.tv/);

  // Fulfilled and aborted: answered. A request to any other outside host is always flagged.
  context = fakeContext();
  guard = guardNetwork(context);
  await context.route(/plex\.tv\/a/, (route) => route.fulfill({ status: 200 }));
  await context.route(/plex\.tv\/c/, (route) => route.abort('failed'));
  for (const path of ['a', 'c']) await context.send('GET', `https://plex.tv/${path}`);
  await context.send('GET', 'http://127.0.0.1:1234/x');
  assert.equal(await fails(context, guard), null, 'answered plex.tv requests and local ones pass');
  await context.send('GET', 'https://example.com/x');
  assert.match((await fails(context, guard)) || '', /example\.com/);
  check('SSA2 the guard flags a plex.tv path no handler answered');
}
await guardSelfTest();

// ---- run ----

const WORKERS = Number(process.env.E2E_SHEET_WORKERS || 4);
const only = process.env.E2E_SHEET_ONLY ? new RegExp(process.env.E2E_SHEET_ONLY) : null;
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
  console.error(`${failures.length} of ${selected.length} settings-sheet cases failed`);
  process.exit(1);
}
console.log(`all ${selected.length} settings-sheet cases passed`);
