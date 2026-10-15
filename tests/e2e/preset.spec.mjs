// Recommended protection (R-PROT-5, D4, D5, D6, Q20) and the upgrade toast (R-UPG-1).
// Every case names pixelShift: false and dailyReload: false (convention 7) unless it tests them.

import assert from 'node:assert/strict';
import { createPinAuth } from '../../js/kiosk.js';
import { withApp } from './lib.mjs';

const check = (name) => console.log(`  ok  ${name}`);
const PIN = '2468';
const auth = await createPinAuth(PIN);

const seed = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  pixelShift: false,
  dailyReload: false,
  sleepEnabled: false,
  nightDim: false,
  nightDimLevel: 30,
  nightDimTarget: 'frame',
  ...extra,
});

const KEYS = ['sleepEnabled', 'sleepStart', 'sleepEnd', 'nightDim', 'nightDimLevel', 'nightDimTarget', 'pixelShift', 'dailyReload'];
const PRESET = { sleepEnabled: true, sleepStart: '01:00', sleepEnd: '07:00', nightDim: true, nightDimLevel: 60, nightDimTarget: 'stage', pixelShift: true, dailyReload: true };

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));
const isOpen = (page, id) => page.evaluate((i) => document.getElementById(i).open, id);
const formValue = (page, name) =>
  page.evaluate((n) => {
    const el = document.getElementById('settings-form').elements.namedItem(n);
    return el.type === 'checkbox' ? el.checked : el.value;
  }, name);

async function openSettings(page, app) {
  await page.goto(app.url);
  await page.waitForFunction(() => [...document.querySelectorAll('.poster-layer')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
  await page.keyboard.press('s');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
}

const rowKeys = (page) => page.$$eval('#preset-list [data-preset-key]', (rows) => rows.map((r) => r.dataset.presetKey));

// ---- the confirm list and Cancel ----
await withApp({ settings: seed() }, async ({ page, app }) => {
  await openSettings(page, app);
  assert.equal(await page.locator('#preset-panel').isVisible(), false, 'no list before the button is pressed');
  assert.ok(await page.locator('#preset-btn').isVisible());
  assert.equal((await page.textContent('#preset-btn')).trim(), 'Recommended protection');
  const formBefore = {};
  for (const k of KEYS) formBefore[k] = await formValue(page, k);
  await page.click('#preset-btn');
  assert.equal(await page.locator('#preset-panel').isVisible(), true);
  assert.deepEqual(await rowKeys(page), KEYS, 'exactly the preset keys, nothing else');
  // The stage row is shown but cannot be unticked (Q20); every other row has a tick box.
  const boxes = await page.$$eval('#preset-list [data-preset-key] input[type=checkbox]', (b) => b.map((x) => ({ key: x.closest('[data-preset-key]').dataset.presetKey, checked: x.checked, disabled: x.disabled })));
  assert.equal(boxes.length, KEYS.length);
  for (const b of boxes) assert.equal(b.checked, true, `${b.key} starts ticked`);
  assert.deepEqual(boxes.filter((b) => b.disabled).map((b) => b.key), ['nightDimTarget']);
  const text = await page.textContent('#preset-list');
  for (const word of ['01:00', '07:00', '60']) assert.ok(text.includes(word), `list shows ${word}`);

  await page.click('#preset-cancel');
  assert.equal(await page.locator('#preset-panel').isVisible(), false);
  for (const k of KEYS) assert.equal(await formValue(page, k), formBefore[k], `${k} untouched in the form after Cancel`);
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  const after = await stored(page);
  for (const k of KEYS) assert.equal(String(after[k]), String(formBefore[k]), `${k} unchanged after Cancel then Save`);
  assert.equal(after.sleepEnabled, false);
  assert.equal(after.nightDimTarget, 'frame');
  check('list of the keys, stage row untickable, Cancel changes nothing');
});

// ---- the list shows a select's label, not its stored value (hint too) ----
for (const target of ['frame', 'stage']) {
  await withApp({ settings: seed({ nightDimTarget: target }) }, async ({ page, app }) => {
    await openSettings(page, app);
    await page.click('#preset-btn');
    const label = await page.evaluate(() => document.querySelector('#settings-form [name="nightDimTarget"] option[value="stage"]').textContent.trim());
    assert.equal(label, 'The whole picture');
    const rows = await page.$$eval('#preset-list [data-preset-key]', (rs) => rs.map((r) => ({ key: r.dataset.presetKey, text: r.textContent })));
    const dim = rows.find((r) => r.key === 'nightDimTarget');
    assert.ok(dim.text.startsWith(`Dim the whole picture: ${label}`), `row text: ${dim.text}`);
    for (const r of rows) assert.ok(!/\bstage\b/.test(r.text), `${r.key} row shows the raw value: ${r.text}`);
    if (target === 'stage') assert.ok(dim.text.endsWith('already set'), dim.text);
    else {
      const frameLabel = await page.evaluate(() => document.querySelector('#settings-form [name="nightDimTarget"] option[value="frame"]').textContent.trim());
      assert.ok(dim.text.endsWith(`now ${frameLabel}`), `hint shows the label: ${dim.text}`);
    }
    check(`preset list shows the Dim option label (form value ${target})`);
  });
}

// ---- Apply then Save ----
for (const rating of ['R', '']) {
  await withApp({ settings: seed({ maxContentRating: rating, limitNowPlaying: true, idleSleepHours: 0, sleepStart: '22:00', sleepEnd: '06:00' }) }, async ({ page, app }) => {
    await openSettings(page, app);
    const before = await stored(page);
    await page.click('#preset-btn');
    await page.click('#preset-apply');
    assert.equal(await page.locator('#preset-panel').isVisible(), false);
    // Apply fills the form; nothing is stored until Save.
    for (const [k, v] of Object.entries(PRESET)) assert.equal(await formValue(page, k), k === 'nightDimLevel' ? String(v) : v, `${k} in the form`);
    assert.equal((await stored(page)).sleepEnabled, false, 'not saved by Apply');
    await page.click('#settings-save');
    await page.waitForFunction(() => !document.getElementById('settings').open);
    const s = await stored(page);
    for (const [k, v] of Object.entries(PRESET)) assert.equal(s[k], v, `${k} persisted`);
    assert.equal(s.idleSleepHours, 0);
    assert.equal(s.maxContentRating, rating, 'content limit untouched');
    assert.equal(s.limitNowPlaying, true);
    for (const k of ['plexToken', 'serverUrl', 'libraryKey']) assert.equal(s[k], before[k], `${k} unchanged`);
    check(`Apply then Save persists the preset (maxContentRating '${rating}')`);
  });
}

// ---- unticking a row ----
await withApp({ settings: seed({ sleepStart: '22:00', sleepEnd: '06:00', nightDimLevel: 30 }) }, async ({ page, app }) => {
  await openSettings(page, app);
  await page.click('#preset-btn');
  await page.uncheck('#preset-list [data-preset-key="sleepStart"] input');
  await page.uncheck('#preset-list [data-preset-key="nightDimLevel"] input');
  await page.click('#preset-apply');
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  const s = await stored(page);
  assert.equal(s.sleepStart, '22:00');
  assert.equal(s.nightDimLevel, 30);
  assert.equal(s.sleepEnd, '07:00');
  assert.equal(s.sleepEnabled, true);
  assert.equal(s.nightDimTarget, 'stage');
  check('an unticked row keeps its value');
});

// ---- the preset lives in the Display protection fieldset ----
await withApp({ settings: seed() }, async ({ page, app }) => {
  await openSettings(page, app);
  assert.equal(await page.locator('#protection-fieldset #preset-btn').count(), 1);
  assert.match(await page.textContent('#protection-fieldset legend'), /Display protection/);
  check('button sits in Display protection');
});

// ---- the upgrade toast ----
const clearMarkerOnce = (page) =>
  page.addInitScript(() => {
    if (sessionStorage.getItem('__markerCleared')) return;
    sessionStorage.setItem('__markerCleared', '1');
    localStorage.removeItem('plexPoster.whatsNew');
  });
const toastState = (page) => page.evaluate(() => ({ hidden: document.getElementById('toast').hidden, text: document.getElementById('toast').textContent, buttons: [...document.querySelectorAll('#toast button')].map((b) => b.textContent) }));
const waitToast = (page) => page.waitForFunction(() => !document.getElementById('toast').hidden && /What's new in 2\.1/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });

await withApp({ settings: seed() }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  const t = await toastState(page);
  assert.ok(t.buttons.includes('Open settings'), `buttons: ${t.buttons}`);
  assert.notEqual(await page.evaluate(() => localStorage.getItem('plexPoster.whatsNew')), null, 'marker written');
  await page.reload();
  await page.waitForFunction(() => [...document.querySelectorAll('.poster-layer')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  assert.ok(!(await toastState(page)).text.includes("What's new"), 'not shown again after a reload');
  check('upgrade toast shows once for a configured install');
});

await withApp({ settings: seed() }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  await page.click('#toast button:has-text("Open settings")');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  const where = await page.evaluate(() => {
    const f = document.getElementById('protection-fieldset').getBoundingClientRect();
    const body = document.querySelector('#settings .sheet-body').getBoundingClientRect();
    return { top: f.top, bottom: f.bottom, bodyTop: body.top, bodyBottom: body.bottom };
  });
  assert.ok(where.top >= where.bodyTop - 1 && where.top < where.bodyBottom, `fieldset scrolled into view: ${JSON.stringify(where)}`);
  assert.equal(await page.locator('#preset-btn').isVisible(), true);
  check('Open settings opens Settings at Display protection');
});

await withApp({ settings: seed({ settingsPinHash: auth.hash, settingsPinSalt: auth.salt }) }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  await page.click('#toast button:has-text("Open settings")');
  await page.waitForFunction(() => document.getElementById('pin-dialog').open, null, { timeout: 5000 });
  assert.equal(await isOpen(page, 'settings'), false, 'Settings waits for the PIN');
  for (const d of PIN) await page.click(`#pin-dialog [data-key="${d}"]`);
  await page.click('#pin-dialog [data-key="ok"]');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  check('Open settings goes through the PIN gate');
});

await withApp({ settings: { pixelShift: false, dailyReload: false } }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await page.waitForTimeout(2500);
  assert.ok(!(await toastState(page)).text.includes("What's new"), 'unconfigured: no toast');
  assert.ok(!(await page.evaluate(() => document.querySelector('#toast button'))) || (await toastState(page)).hidden);
  check('unconfigured install never shows the toast');
});

// The harness default (marker present) shows nothing.
await withApp({ settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForTimeout(2000);
  assert.ok(!(await toastState(page)).text.includes("What's new"));
  check('marker present: no toast');
});

// ---- K60 (D73, review finding 5): a config.json-provisioned first boot is a fresh install, not an upgrade ----
const provisionedBody = (app) => JSON.stringify({ plexToken: 'demo-token', serverUrl: `http://127.0.0.1:${app.mockPort}`, libraryKey: '1', showNowPlaying: false, pixelShift: false, dailyReload: false });
const marker = (page) => page.evaluate(() => localStorage.getItem('plexPoster.whatsNew'));

// Opts out of the harness seed: no stored settings and no marker, so config.json is what configures the display.
await withApp({ settings: {} }, async ({ page, context, app }) => {
  await context.addInitScript(() => {
    localStorage.removeItem('plexPoster.settings');
    localStorage.removeItem('plexPoster.whatsNew');
  });
  await context.route('**/config.json', (route) => route.fulfill({ contentType: 'application/json', body: provisionedBody(app) }));
  await page.goto(app.url);
  await page.waitForFunction(() => [...document.querySelectorAll('.poster-layer')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  assert.ok(!(await toastState(page)).text.includes("What's new"), 'a fresh config.json install shows no upgrade toast');
  assert.equal(await marker(page), '2.1', 'the marker is written');
  check('K60: a config.json-provisioned first boot writes the marker and shows no toast');
});

// An upgraded install: settings stored by 2.0, no marker, and a config.json present on the server (which must not matter).
await withApp({ settings: seed() }, async ({ page, context, app }) => {
  await context.route('**/config.json', (route) => route.fulfill({ contentType: 'application/json', body: provisionedBody(app) }));
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  assert.equal(await marker(page), '2.1');
  check('K60: an upgraded stored install (config.json beside it) still shows the toast');
});
