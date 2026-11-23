// The settings sheet (R-SET-1..4, R-SET-6) and the carried fixes: C8M2 (D28), C8M1 (D38), K30, K31 (D40).
// Every case runs against its own mock Plex (serveArgs: []), so the toggles one case flips (down, empty,
// counts-fail) never reach another, and the cases run side by side. pixelShift is named false in the seed
// (convention 7); the one case that needs pixel shift running (K30) turns it on explicitly.

import assert from 'node:assert/strict';
import { startMockPlex } from '../../scripts/mock-plex.mjs';
import { createPinAuth } from '../../js/kiosk.js';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaults } from '../../js/settings.js';
import { freePort, guardNetwork, ROOT, withApp } from './lib.mjs';

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
const libraryLabels = (page) => page.$$eval('#library-list label', (ls) => ls.map((l) => l.textContent));
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
  await page.waitForFunction(() => [...document.querySelectorAll('#library-list label')].some((o) => o.textContent === 'Movies · 8 titles'), null, { timeout: 10000 });
  const labels = await libraryLabels(page);
  assert.ok(labels.includes('Movies · 8 titles'), labels.join(' | '));
  assert.ok(!labels.some((l) => /Music/.test(l)), `Music is not listed: ${labels.join(' | ')}`);
  assert.equal(await page.isChecked('#library-list input[value="1"]'), true, 'the saved library stays ticked');
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
  await page.waitForFunction(() => [...document.querySelectorAll('#library-list label')].some((o) => o.textContent === 'Movies · 8 titles'), null, { timeout: 10000 });
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
      await page.waitForFunction(() => [...document.querySelectorAll('#library-list label')].some((o) => /titles/.test(o.textContent)), null, { timeout: 10000 }); // the lazy counts have landed
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

// ---- D177: the sheet sets the old sign-in aside on a change of type, in a household of one server (D142 2, D163) ----

sheetCase('D177 Test connection after the first server is retyped to Jellyfin, with the Plex sign-in still in the sheet, sets the sign-in aside and sends it to no Jellyfin address', { settings: seed() }, async ({ page, app }) => {
  const jellyfin = `http://127.0.0.1:${app.jellyfinPort}`;
  const toJellyfin = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.port === String(app.jellyfinPort)) toJellyfin.push(`${r.method()} ${u.pathname}${u.search} ${JSON.stringify(r.headers())} ${r.postData() || ''}`);
  });
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  // The type is retyped the way an imported file retypes it (jellyfin.spec 13b): the token field is not emptied, as the type buttons would.
  await page.evaluate((url) => {
    for (const [name, value] of [['serverType', 'jellyfin'], ['serverUrl', url]]) {
      const el = document.querySelector(`input[name="${name}"]`);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, jellyfin);
  assert.equal(await page.inputValue('input[name="plexToken"]'), 'demo-token', 'the old sign-in is still in the sheet');
  await page.click('#test-btn');
  await settleTest(page);
  const result = await page.textContent('#test-result');
  assert.match(result, /not the server your sign-in was made for/, 'the sheet says the sign-in was not sent');
  assert.match(result, /Sign in to Jellyfin/, 'and asks to sign in to Jellyfin');
  assert.equal(await page.inputValue('input[name="plexToken"]'), '', 'the sheet set the token aside');
  assert.ok(!toJellyfin.some((line) => line.includes('demo-token')), 'no request to the Jellyfin address carried the Plex sign-in');
  await page.click('#settings-cancel');
  check('D177 a retype to Jellyfin with the old sign-in: it is set aside and sent nowhere');
});

// ---- LP: a live preview is the saved settings plus the live keys, as the sheet holds them, and nothing else (D181 2, D185) ----
//
// Nothing here passes or fails by elapsed time: every wait is on the state it names (a probe of the display, a poster drawn, a dialog closed).
// The 10000 ms and 2500 ms timeouts in this section are only upper bounds on a wait for such a state, so a case that never reaches it fails
// instead of hanging; reaching the state sooner or later changes nothing, and no assertion compares a duration.
// "In force" is read off the display (the probe below) or off Diagnostics, which prints the settings the page is running on.

/** The live keys the preview carries: the array named LIVE_KEYS in js/main.js, read from the file (main.js cannot be imported in node). */
const liveKeysInMain = () => {
  const text = readFileSync(join(ROOT, 'js', 'main.js'), 'utf8');
  const body = /const LIVE_KEYS = \[([^\]]*)\]/.exec(text)?.[1];
  assert.ok(body, 'js/main.js names its live keys in `const LIVE_KEYS = [...]`');
  return [...body.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
};

/** Installs `window.__probe()`: what the display shows of the live controls, as one comparable object. */
const installProbe = (page) =>
  page.evaluate(() => {
    const $ = (id) => document.getElementById(id);
    window.__probe = () => {
      const box = $('poster-box').getBoundingClientRect();
      const r = (v) => Math.round(v * 10) / 10;
      return {
        box: [box.left, box.top, box.width, box.height].map(r),
        fit: $('poster-box').style.getPropertyValue('--poster-fit'),
        rotation: $('stage').style.getPropertyValue('--rotation'),
        labels: $('controls').dataset.labels,
        frameHidden: $('frame').hidden,
        frameSrc: $('frame').getAttribute('src') || '',
        frameFilter: getComputedStyle($('frame')).filter,
        stageFilter: getComputedStyle($('stage')).filter,
        title: $('title-card').hidden ? '' : $('title-card').textContent,
        backdropHidden: $('fill-backdrop').hidden,
        gapHidden: $('gap-fill').hidden,
        fade: document.documentElement.style.getPropertyValue('--fade-ms'),
        transition: getComputedStyle(document.querySelector('.poster-layer')).transitionDuration,
      };
    };
  });
const probe = (page) => page.evaluate(() => window.__probe());
/** Waits until the probe holds the stated values (a field, optionally one index of it, `eq` or `ne` to the value, or `lt` for a number, or `has` for a substring). */
const probeIs = (page, field, op, value, index, ms = 10000) =>
  page
    .waitForFunction(
      ({ field, op, value, index }) => {
        const v = window.__probe()[field];
        const got = index === undefined ? v : v[index];
        return op === 'eq' ? got === value : op === 'ne' ? got !== value : op === 'lt' ? got < value : op === 'has' ? got.includes(value) : false;
      },
      { field, op, value, index },
      { timeout: ms },
    )
    .catch(async () => assert.fail(`the display never showed ${field}${index === undefined ? '' : `[${index}]`} ${op} ${JSON.stringify(value)} (it shows ${JSON.stringify((await probe(page))[field])})`));
const probeBack = (page, base) =>
  page
    .waitForFunction((want) => JSON.stringify(window.__probe()) === want, JSON.stringify(base), { timeout: 10000 })
    .catch(async () => assert.fail(`the display did not return to the saved one:\n  was ${JSON.stringify(base)}\n  now ${JSON.stringify(await probe(page))}`));
const openAdvanced = (page) => page.evaluate(() => (document.getElementById('advanced').open = true));
/** A live change that is the same for every case: it shrinks the poster, and the wait is on that. */
async function nudge(page, base) {
  await page.fill('input[name="posterScale"]', '90');
  await probeIs(page, 'box', 'lt', base.box[2], 2);
}

sheetCase('LP1 an unsaved Cross-fade is not previewed by a live change: the saved fade stays, Cancel restores, Save applies it', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await installProbe(page);
  const base = await probe(page);
  assert.equal(base.fade, '1200ms');
  assert.equal(base.transition, '1.2s', 'the poster layers fade over the saved 1200 ms');
  await openSettings(page);
  await openAdvanced(page);
  await page.fill('input[name="crossfadeMs"]', '4000'); // not a live control: nothing previews
  await nudge(page, base); // a live control: the preview runs
  const during = await probe(page);
  assert.equal(during.fade, '1200ms', '--fade-ms stays at the saved value under the preview');
  assert.equal(during.transition, '1.2s', 'and so does the fade the poster layers really use');
  await page.click('#settings-cancel');
  await probeBack(page, base);
  assert.equal((await stored(page)).crossfadeMs ?? 1200, 1200);

  await openSettings(page);
  await openAdvanced(page);
  await page.fill('input[name="crossfadeMs"]', '4000');
  await nudge(page, base);
  await save(page);
  await probeIs(page, 'fade', 'eq', '4000ms');
  await probeIs(page, 'transition', 'eq', '4s');
  assert.equal((await stored(page)).crossfadeMs, 4000, 'Save applies it');
  check('LP1 an unsaved Cross-fade stays out of the display; Cancel restores; Save applies it');
});

sheetCase('LP2 Cancel restores every live value the preview changed', { settings: seed({ pixelShift: false }), viewport: { width: 1920, height: 1080 } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await installProbe(page);
  const base = await probe(page);
  await openSettings(page);
  const set = async (name, value) => {
    if (typeof value === 'boolean') await page.setChecked(`input[name="${name}"]`, value);
    else if ((await page.$eval(`[name="${name}"]`, (el) => el.tagName)) === 'SELECT') await page.selectOption(`select[name="${name}"]`, value);
    else await page.fill(`input[name="${name}"]`, value);
  };
  for (const [name, value] of [['posterScale', '80'], ['posterOffsetX', '7'], ['posterOffsetY', '-6'], ['posterFit', 'contain'], ['rotation', '180'], ['frameId', 'none'], ['frameBrightness', '70'], ['controlLabels', 'always'], ['fillMode', 'blur'], ['showTitle', true], ['showMeta', true]]) await set(name, value);
  const previewed = await probe(page);
  for (const field of ['box', 'fit', 'rotation', 'labels', 'frameHidden', 'frameFilter', 'title', 'backdropHidden']) assert.notDeepEqual(previewed[field], base[field], `${field} previewed`);
  await page.click('#settings-cancel');
  await probeBack(page, base);
  assert.equal((await stored(page)).posterScale ?? 100, 100, 'nothing was saved');
  check('LP2 Cancel puts every previewed live value back');
});

sheetCase('LP3 every live value the sheet holds shows, whatever was touched last, and a non-live change between two live ones does not', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await installProbe(page);
  const base = await probe(page);
  await openSettings(page);
  await openAdvanced(page);
  await page.fill('input[name="posterScale"]', '80'); // live change A
  await probeIs(page, 'box', 'lt', base.box[2], 2);
  const afterA = await probe(page);
  await page.fill('input[name="crossfadeMs"]', '4000'); // a non-live change
  await page.check('input[name="showTitle"]'); // live change B
  await probeIs(page, 'title', 'ne', '');
  const afterB = await probe(page);
  assert.deepEqual(afterB.box, afterA.box, 'A is still showing after B');
  assert.equal(afterB.fade, '1200ms', 'the non-live change between them is not');
  await page.click('#settings-cancel');
  await probeBack(page, base);
  check('LP3 live change A, a non-live change, live change B: A and B show, the non-live does not');
});

sheetCase('LP4a each live control of Frame & layout previews its own value', { settings: seed(), viewport: { width: 1920, height: 1080 } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await installProbe(page);
  const base = await probe(page);
  await openSettings(page);
  const sel = (name, value) => page.selectOption(`select[name="${name}"]`, value);
  await sel('frameId', 'none');
  await probeIs(page, 'frameHidden', 'eq', true);
  await sel('frameId', 'custom');
  await page.fill('input[name="customFrameUrl"]', 'assets/frames/marquee-glow.png');
  await probeIs(page, 'frameSrc', 'has', 'marquee-glow.png');
  await sel('posterFit', 'contain');
  await probeIs(page, 'fit', 'eq', 'contain');
  const was = await probe(page);
  await page.fill('input[name="posterScale"]', '80');
  await probeIs(page, 'box', 'lt', was.box[2], 2);
  const scaled = await probe(page);
  await page.fill('input[name="posterOffsetX"]', '7');
  await probeIs(page, 'box', 'ne', scaled.box[0], 0);
  await page.fill('input[name="posterOffsetY"]', '-6');
  await probeIs(page, 'box', 'ne', scaled.box[1], 1);
  await sel('fillMode', 'blur');
  await probeIs(page, 'backdropHidden', 'eq', false);
  await sel('controlLabels', 'always');
  await probeIs(page, 'labels', 'eq', 'always');
  await page.check('input[name="showTitle"]');
  await probeIs(page, 'title', 'ne', '');
  const titled = (await probe(page)).title;
  assert.notEqual(titled, '', 'showTitle: the poster title shows');
  await page.check('input[name="showMeta"]');
  await probeIs(page, 'title', 'ne', titled);
  await sel('rotation', '180');
  await probeIs(page, 'rotation', 'eq', '180deg');
  await page.click('#settings-cancel');
  await probeBack(page, base);
  check('LP4a frame, custom frame, fit, size, offsets, landscape fill, labels, title, meta and rotation each preview');
});

sheetCase(
  'LP4b the gap fill previews',
  { settings: seed({ staticRatingKey: '3', staticTitle: 'Velvet Curtain', frameId: 'marquee-glow', posterFit: 'contain' }), viewport: { width: 1080, height: 1920 } },
  async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    await installProbe(page);
    const base = await probe(page);
    assert.equal(base.gapHidden, true);
    await openSettings(page);
    await page.selectOption('select[name="gapFill"]', 'blur');
    await probeIs(page, 'gapHidden', 'eq', false);
    await page.click('#settings-cancel');
    await probeBack(page, base);
    check('LP4b gapFill previews, and Cancel restores it');
  },
);

sheetCase('LP4c the night dim controls preview their own values', { settings: seed({ nightDim: false }), clock: { time: '2026-06-01T12:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await installProbe(page);
  const base = await probe(page);
  assert.equal(base.frameFilter, 'none');
  await openSettings(page);
  await page.check('input[name="nightDim"]'); // saved window 22:00-07:00: it is noon, so no dimming yet
  await page.fill('input[name="nightDimLevel"]', '40');
  await page.fill('input[name="nightDimStart"]', '11:00');
  await page.fill('input[name="nightDimEnd"]', '13:00'); // noon is inside the previewed window
  await probeIs(page, 'frameFilter', 'eq', 'brightness(0.4)');
  await page.selectOption('select[name="nightDimTarget"]', 'stage');
  await probeIs(page, 'stageFilter', 'eq', 'brightness(0.4)');
  await probeIs(page, 'frameFilter', 'eq', 'none');
  await page.fill('input[name="nightDimLevel"]', '70');
  await probeIs(page, 'stageFilter', 'eq', 'brightness(0.7)');
  await page.fill('input[name="nightDimEnd"]', '11:30'); // noon is now past the window's end
  await probeIs(page, 'stageFilter', 'eq', 'none');
  await page.fill('input[name="nightDimEnd"]', '13:00');
  await probeIs(page, 'stageFilter', 'eq', 'brightness(0.7)');
  await page.fill('input[name="nightDimStart"]', '12:30'); // noon is now before the window's start
  await probeIs(page, 'stageFilter', 'eq', 'none');
  await page.click('#settings-cancel');
  await probeBack(page, base);
  check('LP4c nightDim, its window, its level and its target each preview');
});

sheetCase('LP5 the live keys in js/main.js are exactly the named controls inside the sheet\'s data-live sections', { settings: seed() }, async ({ page, app }) => {
  const listed = liveKeysInMain();
  assert.equal(new Set(listed).size, listed.length, 'no key is listed twice');
  await page.goto(app.url);
  await posterShown(page);
  const { inLive, all } = await page.evaluate(() => {
    const named = [...document.getElementById('settings-form').elements].filter((el) => el.name);
    return { inLive: [...new Set(named.filter((el) => el.closest('[data-live]')).map((el) => el.name))], all: [...new Set(named.map((el) => el.name))] };
  });
  assert.deepEqual([...listed].sort(), [...inLive].sort(), 'the list and the data-live controls agree');
  assert.ok(inLive.length > 0 && all.length > inLive.length, 'the sheet has live and non-live controls');
  for (const key of listed) assert.ok(key in defaults(), `${key} is a setting`);
  assert.ok(!listed.includes('crossfadeMs'), 'Cross-fade is not live');
  check(`LP5 ${listed.length} live keys: the list and the data-live controls agree`);
});

// What the sheet holds that is not live never reaches the display, even while a live control moves (D181 2, D185 2).
const TITLE_NAMES = ['The Grand Marquee', 'Midnight Projector', 'Velvet Curtain', 'Popcorn Skies', 'Neon Matinee', 'Last Reel', 'Silver Screen Serenade', 'Encore'];
const titleNo = (alt) => TITLE_NAMES.indexOf((alt || '').replace(/^Poster: /, '')) + 1;
const PG13_TITLES = [1, 2, 3, 6]; // what a PG-13 limit allows in the mock
/** Records every poster that is ever active, and how many draws there were. */
const watchDraws = (page) =>
  page.evaluate(() => {
    window.__ever = new Set();
    window.__draws = 0;
    let last = '';
    const record = () => {
      const alt = document.querySelector('.poster-layer.active')?.alt || '';
      if (alt) window.__ever.add(alt);
      if (alt && alt !== last) window.__draws++;
      last = alt || last;
    };
    new MutationObserver(record).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'alt'] });
    record();
  });
const everShown = async (page) => (await page.evaluate(() => [...window.__ever])).map(titleNo);
/**
 * Asks for `n` more posters, each wait on the draw itself, and returns how many were drawn. It gives up at the first draw that never comes (a
 * poster pinned or playing keeps the same title on screen); the caller's check of what was shown is what fails then.
 */
async function drawMore(page, n) {
  const start = await page.evaluate(() => window.__draws);
  for (let want = start + 1; want <= start + n; want++) {
    let drew = false;
    for (let tries = 0; tries < 4 && !drew; tries++) {
      await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
      drew = await page.waitForFunction((w) => window.__draws >= w, want, { timeout: 2500 }).then(() => true, () => false);
    }
    if (!drew) break;
  }
  return (await page.evaluate(() => window.__draws)) - start;
}
const DRAWS = 16;
const PG13 = { maxContentRating: 'PG-13' };

sheetCase('LP6 an unsaved looser limit is not previewed by a live change: only what the saved limit allows is drawn', { settings: seed(PG13) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await installProbe(page);
  await watchDraws(page);
  const base = await probe(page);
  await openSettings(page);
  await page.selectOption('select[name="maxContentRating"]', 'NC-17');
  await nudge(page, base);
  assert.equal(await drawMore(page, DRAWS), DRAWS, 'the draws happened');
  const ever = await everShown(page);
  assert.deepEqual([...new Set(ever)].filter((t) => !PG13_TITLES.includes(t)), [], `only titles within PG-13 were drawn: ${[...new Set(ever)].sort()}`);
  assert.equal((await stored(page)).maxContentRating, 'PG-13');
  await page.click('#settings-cancel');
  check(`LP6 an unsaved NC-17 under a saved PG-13: ${DRAWS} draws, all within PG-13`);
});

sheetCase(
  'LP6b an unsaved all-day time slot with a looser limit is not previewed by a live change',
  { settings: seed({ ...PG13, limitSlots: [] }), clock: { time: '2026-01-05T12:00:00' } },
  async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    await installProbe(page);
    await watchDraws(page);
    const base = await probe(page);
    await openSettings(page);
    await page.click('#slot-add');
    await page.fill('#slot-list .slot-start', '00:00');
    await page.selectOption('#slot-list .slot-limit', 'NC-17');
    await nudge(page, base);
    assert.equal(await drawMore(page, DRAWS), DRAWS, 'the draws happened');
    const ever = await everShown(page);
    assert.deepEqual([...new Set(ever)].filter((t) => !PG13_TITLES.includes(t)), [], `only titles within the saved PG-13 were drawn: ${[...new Set(ever)].sort()}`);
    await page.click('#settings-cancel');
    check(`LP6b an unsaved NC-17 all-day slot under a saved PG-13: ${DRAWS} draws, all within PG-13`);
  },
);

sheetCase('LP6c an unsaved untick of "Apply the limit to what\'s playing" is not previewed by a live change', { settings: seed({ ...PG13, showNowPlaying: true, nowPlayingPollSeconds: 5 }) }, async ({ page, app, mock }) => {
  await mock.play('4'); // an R title playing under PG-13
  await page.goto(app.url);
  await posterShown(page);
  await installProbe(page);
  await watchDraws(page);
  const base = await probe(page);
  await openSettings(page);
  await page.uncheck('input[name="limitNowPlaying"]');
  await nudge(page, base);
  const drawn = await drawMore(page, DRAWS);
  const ever = await everShown(page);
  assert.ok(!ever.includes(4), `the R title playing was not drawn while the untick was unsaved: ${[...new Set(ever)].sort()}`);
  assert.equal(drawn, DRAWS, 'the draws happened (random posters keep coming while the R title plays)');
  await page.click('#settings-cancel');
  check('LP6c an unsaved untick of the now-playing limit: the R title playing is never drawn');
});

sheetCase('LP7 an unsaved library tick is not previewed by a live change', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await installProbe(page);
  await watchDraws(page);
  const base = await probe(page);
  await openSettings(page);
  await page.waitForFunction(() => [...document.querySelectorAll('#library-list label')].some((l) => /Kids Movies/.test(l.textContent)), null, { timeout: 10000 });
  await page.check('#library-list input[value="3"]');
  await nudge(page, base);
  const drawn = await drawMore(page, DRAWS);
  const ever = await everShown(page);
  assert.ok(ever.every((t) => t >= 1 && t <= 8), `only Movies titles were drawn, none of Kids Movies (0 is not a Movies title): ${[...new Set(ever)].sort()}`);
  assert.equal(drawn, DRAWS, 'the draws happened');
  await page.click('#settings-cancel');
  check('LP7 an unsaved library tick: no poster from it is drawn');
});

sheetCase('LP8 an unsaved server address and token are not previewed by a live change: Diagnostics shows the saved ones', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await installProbe(page);
  const base = await probe(page);
  await openSettings(page);
  await page.evaluate(() => {
    for (const [name, value] of [['serverUrl', 'http://127.0.0.1:9'], ['plexToken', 'other-token']]) {
      const el = document.querySelector(`input[name="${name}"]`);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await nudge(page, base);
  await page.evaluate(() => document.querySelector('[data-action="diagnostics"]').click());
  await page.waitForFunction(() => document.getElementById('diagnostics').open, null, { timeout: 5000 });
  const rows = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#diag-list dt')].map((dt) => [dt.textContent, dt.nextElementSibling.textContent])));
  assert.ok(rows.Server.includes(`127.0.0.1:${app.mockPort}`), `the saved address is in force: ${rows.Server}`);
  assert.ok(rows.Token.startsWith('demo'), `the saved token is in force: ${rows.Token}`);
  await page.click('#diag-close');
  await page.click('#settings-cancel');
  check('LP8 an unsaved address and token: Diagnostics shows the saved ones under a live preview');
});

sheetCase('LP8b an unsaved kiosk tick is not previewed by a live change: the page still lets a context menu through', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await installProbe(page);
  const base = await probe(page);
  const menuAllowed = () => page.evaluate(() => document.body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))); // false: kiosk mode stopped it
  assert.equal(await menuAllowed(), true, 'the saved settings are not kiosk');
  await openSettings(page);
  await page.check('input[name="kioskMode"]');
  await nudge(page, base);
  assert.equal(await menuAllowed(), true, 'the unsaved kiosk tick is not in force');
  await page.click('#settings-cancel');
  check('LP8b an unsaved kiosk tick: not in force under a live preview');
});

sheetCase('LP9 an import previews only its live values: its Cross-fade, limit and pin wait for Save', { settings: seed(PG13) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await installProbe(page);
  await watchDraws(page);
  const base = await probe(page);
  await openSettings(page);
  const file = { crossfadeMs: 4000, maxContentRating: 'NC-17', posterScale: 70, showTitle: true, staticRatingKey: '4', staticTitle: 'Popcorn Skies' };
  await page.setInputFiles('#import-file', { name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.waitForFunction(() => document.getElementById('pinned-title').textContent === 'Popcorn Skies', null, { timeout: 10000 });
  await probeIs(page, 'box', 'lt', base.box[2], 2); // the live values show
  await probeIs(page, 'title', 'ne', '');
  assert.equal((await probe(page)).fade, '1200ms', 'the imported Cross-fade is not in force');
  const drawn = await drawMore(page, DRAWS);
  const ever = await everShown(page);
  assert.deepEqual([...new Set(ever)].filter((t) => !PG13_TITLES.includes(t)), [], `the imported limit and pin are not in force: ${[...new Set(ever)].sort()}`);
  assert.equal(drawn, DRAWS, 'the draws happened');
  await page.click('#settings-cancel');
  await probeBack(page, base);
  check('LP9 an import: its live values show; its Cross-fade, limit and pin do not');
});

// LP10: an unsaved weighting is not previewed (D114 1, D116 1). Off with no window, the engine's draw avoids the last ten shown, so eight draws are eight
// different titles; "Unwatched first" would draw by weight from everything but the poster on screen, and eight draws from the seeded random below repeat.
// The page's Math.random is seeded by an init script (as weighting.spec.mjs does), so a run repeats; each draw is waited for by the poster changing.
const seedRandom = (page, n) =>
  page.addInitScript((seedValue) => {
    let a = seedValue >>> 0;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, n);
const activeTitle = (page) => page.evaluate(() => (document.querySelector('.poster-layer.active')?.alt || '').replace(/^Poster: /, ''));
/** Asks for the next poster and waits for the one on screen to change (a click during a busy tick is ignored: ask again). */
async function nextTitle(page) {
  const was = await activeTitle(page);
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
    const changed = await page.waitForFunction((p) => { const a = (document.querySelector('.poster-layer.active')?.alt || '').replace(/^Poster: /, ''); return a !== '' && a !== p; }, was, { timeout: 2500 }).then(() => true, () => false);
    if (changed) return activeTitle(page);
  }
  assert.fail(`the poster never changed from ${was}`);
}

sheetCase('LP10 an unsaved weighting is not previewed by a live change: eight draws with the sheet open are eight different titles', { settings: seed({ weighting: 'off', noRepeatDays: 0 }) }, async ({ page, app }) => {
  await seedRandom(page, 20240601);
  await page.goto(app.url);
  await posterShown(page);
  await installProbe(page);
  const base = await probe(page);
  const seen = [await activeTitle(page)];
  await openSettings(page);
  await page.selectOption('select[name="weighting"]', 'unwatched'); // unsaved
  await nudge(page, base); // a live change: the preview runs
  for (let i = 0; i < 7; i++) seen.push(await nextTitle(page));
  assert.equal(new Set(seen).size, 8, `the saved weighting (off, last ten avoided) is in force: eight draws, eight titles: ${seen}`);
  assert.equal((await stored(page)).weighting ?? 'off', 'off');
  await page.click('#settings-cancel');
  check('LP10 an unsaved weighting under a live preview: eight draws, eight different titles');
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
