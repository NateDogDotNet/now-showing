// Recommended protection (R-PROT-5, D4, D5, D6, Q20) and the upgrade toast (R-UPG-6).
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
// Sets the marker once per tab (null removes it), so a reload keeps whatever the app wrote since.
const markerOnce = (page, value) =>
  page.addInitScript((v) => {
    if (sessionStorage.getItem('__markerCleared')) return;
    sessionStorage.setItem('__markerCleared', '1');
    if (v === null) localStorage.removeItem('plexPoster.whatsNew');
    else localStorage.setItem('plexPoster.whatsNew', v);
  }, value);
const clearMarkerOnce = (page) => markerOnce(page, null);
const marker = (page) => page.evaluate(() => localStorage.getItem('plexPoster.whatsNew'));
const toastState = (page) => page.evaluate(() => ({ hidden: document.getElementById('toast').hidden, text: document.getElementById('toast').textContent, buttons: [...document.querySelectorAll('#toast button')].map((b) => b.textContent) }));
const waitToast = (page) => page.waitForFunction(() => !document.getElementById('toast').hidden && /What's new in 2\.4\.3/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });

await withApp({ settings: seed() }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  const t = await toastState(page);
  assert.ok(t.buttons.includes('Open settings'), `buttons: ${t.buttons}`);
  assert.ok(t.text.includes("What's new in 2.4.3: Play now sends the poster on screen to a Plex player you allow."), `words: ${t.text}`);
  assert.ok(!t.text.includes('2.4.1') && !t.text.includes('more than one server'), `the 2.4.1 notice is retired: ${t.text}`);
  assert.equal(await page.evaluate(() => localStorage.getItem('plexPoster.whatsNew')), '2.4.3', 'marker written');
  await page.reload();
  await page.waitForFunction(() => [...document.querySelectorAll('.poster-layer')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  assert.ok(!(await toastState(page)).text.includes("What's new"), 'not shown again after a reload');
  check('upgrade toast shows once for a configured install');
});

// A 2.4 install (marker '2.4') and a 2.4.1 install (marker '2.4.1', which 2.4.2 kept) are told about 2.4.3 once, and the marker moves on.
for (const old of ['2.4', '2.4.1']) await withApp({ settings: seed() }, async ({ page, app }) => {
  await markerOnce(page, old);
  await page.goto(app.url);
  await waitToast(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('plexPoster.whatsNew')), '2.4.3', 'marker becomes 2.4.3');
  await page.reload();
  await page.waitForFunction(() => [...document.querySelectorAll('.poster-layer')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  assert.ok(!(await toastState(page)).text.includes("What's new"), 'not shown again after a reload');
  check(`marker '${old}': the 2.4.3 toast shows once and the marker becomes 2.4.3`);
});

// A household with no Plex server among its servers (Play now is for Plex posters only) sees no notice, and its marker is written all the same, so adding
// a Plex server later does not show it. A Jellyfin and an Emby household, from a marker of an earlier release.
for (const type of ['jellyfin', 'emby']) await withApp({ settings: seed({ serverType: type }) }, async ({ page, app }) => {
  await markerOnce(page, '2.4.1');
  await page.goto(app.url);
  await page.waitForFunction(() => localStorage.getItem('plexPoster.whatsNew') === '2.4.3', null, { timeout: 10000 });
  assert.equal((await toastState(page)).hidden, true, `a ${type}-only household: no toast`);
  assert.ok(!(await toastState(page)).text.includes("What's new"), `a ${type}-only household: no notice words`);
  assert.equal(await marker(page), '2.4.3', 'the marker is written');
  // The marker is what keeps the notice away later: add a Plex server to the stored settings and reload, and still nothing shows.
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('plexPoster.settings'));
    st.servers = [{ id: '90000000000000000000000000000003', type: 'plex', url: 'http://127.0.0.1:1', token: 'plex-demo-token', userId: '', name: 'Added Plex' }];
    localStorage.setItem('plexPoster.settings', JSON.stringify(st));
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  const kept = await page.evaluate(() => ({ servers: JSON.parse(localStorage.getItem('plexPoster.settings')).servers?.length, hidden: document.getElementById('toast').hidden, text: document.getElementById('toast').textContent }));
  assert.equal(kept.servers, 1, `the Plex server was added to the stored settings: ${JSON.stringify(kept)}`);
  assert.ok(!kept.text.includes("What's new"), `a Plex server added later does not show the notice: ${JSON.stringify(kept)}`);
  assert.equal(await marker(page), '2.4.3', 'the marker stays');
  check(`a ${type}-only household: no notice, the marker is written as 2.4.3, and a Plex server added later shows none`);
});

// A household whose Plex server is its second server (a Jellyfin first) is a household with a Plex server: it is told.
await withApp({ settings: seed({ serverType: 'jellyfin', servers: [{ id: '90000000000000000000000000000002', type: 'plex', url: 'http://127.0.0.1:1', token: 'plex-demo-token', userId: '', name: 'Mock Plex' }] }) }, async ({ page, app }) => {
  await markerOnce(page, '2.4.1');
  await page.goto(app.url);
  await waitToast(page);
  assert.equal(await marker(page), '2.4.3');
  check('a Jellyfin first server with a Plex second one: the notice shows');
});

// Waits until the Allowed devices section has settled where Open settings put it (D196 3). The connection test and the library, genre and collection
// requests have all answered (the network is idle) and two frames have drawn, so the browser has finished moving the sheet's content; then the
// position is read. The wait is on that state, not on a delay: the sheet is open, "Show allowed devices" has focus and it is inside the sheet body's visible box.
const playersLanded = async (page) => {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.waitForFunction(
    () => {
      const b = document.getElementById('players-open').getBoundingClientRect();
      const body = document.querySelector('#settings .sheet-body').getBoundingClientRect();
      return document.getElementById('settings').open && document.activeElement === document.getElementById('players-open') && b.top >= body.top - 1 && b.bottom <= body.bottom + 1 && b.left >= body.left - 1 && b.right <= body.right + 1;
    },
    null,
    { timeout: 8000 },
  );
};
// Where the section, its button and the sheet body are, for the assertions: the section at the top of the view (or as near as the end of the sheet lets it be,
// the section being the last one) where it and the button both fit; the button in the visible box and not covered where they do not.
const playersWhere = (page) =>
  page.evaluate(() => {
    const f = document.getElementById('players-fieldset').getBoundingClientRect();
    const bodyEl = document.querySelector('#settings .sheet-body');
    const body = bodyEl.getBoundingClientRect();
    const b = document.getElementById('players-open').getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return {
      section: { top: f.top, bottom: f.bottom, left: f.left, right: f.right },
      body: { top: body.top, bottom: body.bottom, left: body.left, right: body.right },
      button: { top: b.top, bottom: b.bottom, left: b.left, right: b.right },
      atEnd: bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 1,
      focused: document.activeElement === document.getElementById('players-open'),
      covered: hit !== document.getElementById('players-open'),
      listOpen: !document.getElementById('players-body').hidden,
      serversFocused: document.activeElement?.closest('#servers-fieldset') !== null,
    };
  });
const buttonInView = (w) => w.button.top >= w.body.top - 1 && w.button.bottom <= w.body.bottom + 1 && w.button.left >= w.body.left - 1 && w.button.right <= w.body.right + 1;
const sectionFits = (w) => w.section.bottom - w.section.top <= w.body.bottom - w.body.top;
// At rotation 0 the section is at the top of the view where it fits (or the sheet ends before it can be); the turned sheets are checked by the button's box only.
const sectionAtTop = (w) => w.section.top >= w.body.top - 1 && (w.section.top < w.body.top + 80 || w.atEnd);

await withApp({ settings: seed() }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  await page.click('#toast button:has-text("Open settings")');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  await playersLanded(page).catch(() => {}); // the assertions below report where it is if it never gets there
  const where = await playersWhere(page);
  assert.equal(where.focused, true, `focus is on "Show allowed devices": ${JSON.stringify(where)}`);
  assert.equal(where.serversFocused, false, 'focus is not in the server list');
  assert.ok(buttonInView(where) && !where.covered, `the focused button is in the sheet body's visible box and not covered: ${JSON.stringify(where)}`);
  assert.ok(!sectionFits(where) || sectionAtTop(where), `the Allowed devices section is at the top of the view: ${JSON.stringify(where)}`);
  assert.equal(where.listOpen, false, 'the notice does not open the list');
  check('Open settings opens Settings at the Allowed devices section, with focus on "Show allowed devices" and the list closed');
});

// D128 1: ticking "Household with children" reveals the limit, the schedule and the profiles. The toggle stays where it was on screen
// (within a few px) and the schedule editor comes into view below it, whether the box is ticked by mouse or by keyboard.
const settled = async (page) => {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
};
const openAtHousehold = async (page, app) => {
  await openSettings(page, app);
  await settled(page);
  await page.evaluate(() => document.getElementById('household-fieldset').scrollIntoView({ block: 'start' }));
};
const togglePlace = (page) =>
  page.evaluate(() => {
    const body = document.querySelector('#settings .sheet-body').getBoundingClientRect();
    const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
    return { body: { top: body.top, bottom: body.bottom }, toggle: box(document.getElementById('household-toggle')), slots: box(document.getElementById('slot-label')) };
  });
for (const how of ['mouse', 'keyboard']) {
  await withApp({ settings: seed({ maxContentRating: '' }) }, async ({ page, app }) => {
    await openAtHousehold(page, app);
    assert.equal(await page.locator('text=The rating limit, the times it changes during the day, and viewer profiles are set here.').isVisible(), true, 'the line under the toggle says what is set here');
    const before = await togglePlace(page);
    if (how === 'mouse') await page.click('#household-toggle');
    else {
      await page.focus('#household-toggle');
      await page.keyboard.press('Space');
    }
    assert.equal(await page.isChecked('#household-toggle'), true, 'the toggle is ticked');
    const after = await togglePlace(page);
    assert.ok(Math.abs(after.toggle.top - before.toggle.top) <= 4, `the toggle stays put when ticked by ${how}: ${JSON.stringify({ before, after })}`);
    assert.ok(after.slots.top >= after.body.top - 1 && after.slots.top < after.body.bottom, `the schedule editor is inside the sheet body's visible box: ${JSON.stringify(after)}`);
    check(`ticking Household with children by ${how}: the toggle stays put and the schedule editor is in view`);
  });
}

// D128 1: a slow server answers the library, collection and playlist lists late. the notice's Open settings still lands at the Allowed devices section once they arrive,
// and a sheet opened with the gear and scrolled by the reader does not move when they arrive.
const slowLists = (page) =>
  page.route(/\/(library\/sections|playlists)/, async (route) => {
    await new Promise((done) => setTimeout(done, 1500));
    await route.continue();
  });
await withApp({ settings: seed() }, async ({ page, app }) => {
  await slowLists(page);
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  await page.click('#toast button:has-text("Open settings")');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  await settled(page);
  await playersLanded(page).catch(() => {});
  const where = await playersWhere(page);
  assert.equal(where.focused, true, `focus is on "Show allowed devices" once the late lists arrived: ${JSON.stringify(where)}`);
  assert.ok(buttonInView(where) && !where.covered, `the button is in view once the late lists arrived: ${JSON.stringify(where)}`);
  assert.ok(!sectionFits(where) || sectionAtTop(where), `the Allowed devices section is at the top once the late lists arrived: ${JSON.stringify(where)}`);
  check('Open settings lands at the Allowed devices section when the lists arrive late');
});
await withApp({ settings: seed() }, async ({ page, app }) => {
  await slowLists(page);
  await openSettings(page, app);
  const place = () => page.evaluate(() => document.getElementById('layout-fieldset').getBoundingClientRect().top);
  await page.evaluate(() => { document.querySelector('#settings .sheet-body').scrollTop = 1200; });
  const before = await place();
  await settled(page);
  const after = await place();
  assert.ok(Math.abs(after - before) <= 4, `a sheet scrolled by the reader does not move when the lists arrive: ${before} -> ${after}`);
  check('a sheet opened with the gear and scrolled does not move when the lists arrive late');
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
  await playersLanded(page).catch(() => {});
  const where = await playersWhere(page);
  assert.equal(where.focused, true, `focus is on "Show allowed devices" after the PIN: ${JSON.stringify(where)}`);
  assert.ok(buttonInView(where) && !where.covered, `the button is in view after the PIN: ${JSON.stringify(where)}`);
  assert.ok(!sectionFits(where) || sectionAtTop(where), `Allowed devices section at the top after the PIN: ${JSON.stringify(where)}`);
  check('Open settings goes through the PIN gate and lands on Allowed devices');
});

// A cancelled PIN opens nothing and moves no focus; a wrong one opens nothing either.
await withApp({ settings: seed({ settingsPinHash: auth.hash, settingsPinSalt: auth.salt }) }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  await page.focus('#toast button:has-text("Open settings")');
  await page.click('#toast button:has-text("Open settings")');
  await page.waitForFunction(() => document.getElementById('pin-dialog').open, null, { timeout: 5000 });
  for (const d of '1357') await page.click(`#pin-dialog [data-key="${d}"]`);
  await page.click('#pin-dialog [data-key="ok"]');
  await page.waitForFunction(() => document.getElementById('pin-dialog').open && document.getElementById('pin-error').textContent.trim() !== '', null, { timeout: 5000 });
  assert.equal(await isOpen(page, 'settings'), false, 'a wrong PIN opens nothing');
  await page.click('#pin-cancel');
  await page.waitForFunction(() => !document.getElementById('pin-dialog').open, null, { timeout: 5000 });
  assert.equal(await isOpen(page, 'settings'), false, 'a cancelled PIN opens nothing');
  assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'players-open', 'no focus moved to "Show allowed devices"');
  assert.equal(await page.evaluate(() => document.getElementById('players-body').hidden), true, 'the list stays closed');
  check('a wrong and a cancelled PIN open nothing and move no focus to Allowed devices');
});

// From two servers the notice still lands on Allowed devices (not on the server list, whatever the household's servers), with focus on "Show allowed devices".
await withApp({ settings: seed({ serverName: 'Mock Plex', servers: [{ id: '90000000000000000000000000000001', type: 'jellyfin', url: 'http://127.0.0.1:1', token: 'jf-demo-token', userId: '', name: 'Mock Jellyfin' }] }) }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  await page.click('#toast button:has-text("Open settings")');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  await playersLanded(page).catch(() => {});
  const where = await playersWhere(page);
  assert.equal(await page.evaluate(() => !document.getElementById('server-list').hidden), true, 'two servers: the list shows');
  assert.equal(where.focused, true, `focus is on "Show allowed devices", not on the first Remove button: ${JSON.stringify(where)}`);
  assert.equal(where.serversFocused, false, 'no focus in the server section');
  assert.ok(!sectionFits(where) || sectionAtTop(where), `Allowed devices section at the top: ${JSON.stringify(where)}`);
  check('Open settings from two servers: Allowed devices at the top, focus on "Show allowed devices"');
});

// D196 3 (the rule of D179 4, carried to the new target): at each rotation the sheet is turned, and "Show allowed devices" must be inside the sheet body's visible box
// with nothing over its centre, at a wide and at a tall screen; where the section fits it is at the top of the view (rotation 0). The wait is on the sheet being
// open and the button focused and in the box, not on a delay.
// The first two sizes are the 2.4.2 ones; the last three are small enough that the section and the button do not both fit the visible part of the sheet at some
// rotation (a short view, or a turned narrow one), which is where the focused button must be brought into view.
const SIZES = [[390, 844], [844, 390], [320, 568], [360, 300], [568, 320]];
for (const [label, viewport, rotation] of SIZES.flatMap(([width, height]) => [0, 90, 180, 270].map((r) => [`${width}x${height} rotation ${r}`, { width, height }, r]))) {
  await withApp({ settings: seed({ rotation, serverName: 'Mock Plex', servers: [{ id: '90000000000000000000000000000001', type: 'jellyfin', url: 'http://127.0.0.1:1', token: 'jf-demo-token', userId: '', name: 'Mock Jellyfin' }] }), viewport }, async ({ page, app }) => {
    await clearMarkerOnce(page);
    await page.goto(app.url);
    await waitToast(page);
    await page.click('#toast button:has-text("Open settings")');
    await page.waitForFunction(() => document.getElementById('settings').open && document.activeElement === document.getElementById('players-open'), null, { timeout: 5000 });
    await playersLanded(page).catch(() => {});
    const where = await playersWhere(page);
    assert.equal(where.focused, true, `focus is on "Show allowed devices" at ${label}`);
    assert.ok(buttonInView(where), `"Show allowed devices" is inside the sheet body's visible box at ${label}: ${JSON.stringify(where)}`);
    assert.equal(where.covered, false, `the element at the button's centre is the button at ${label}: ${JSON.stringify(where)}`);
    if (rotation === 0 && sectionFits(where)) assert.ok(sectionAtTop(where), `the section is at the top of the view at ${label}: ${JSON.stringify(where)}`);
    assert.equal(where.listOpen, false, `the list stays closed at ${label}`);
    check(`Open settings at ${label}: "Show allowed devices" is focused, in view and not covered`);
  });
}

// D196 3, from the other side: where the section and the button both fit, the section is at the TOP of the view (and the button is not centred). Allowed devices is the last
// section of the sheet, so the end of the sheet would stop the scroll short of the top; the case adds room below it (a spacer inside the sheet body, as a longer sheet would have),
// so the top is reachable. Without the section's own scroll it stays where the sheet opened; with the button always centred it sits mid-view: both leave the section off the top.
for (const [width, height] of [[1280, 720], [390, 844]]) {
  await withApp({ settings: seed(), viewport: { width, height } }, async ({ page, app }) => {
    await clearMarkerOnce(page);
    await page.goto(app.url);
    await waitToast(page);
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.style.height = '3000px';
      document.querySelector('#settings .sheet-body').append(spacer);
    });
    await page.click('#toast button:has-text("Open settings")');
    await page.waitForFunction(() => document.getElementById('settings').open && document.activeElement === document.getElementById('players-open'), null, { timeout: 5000 });
    await playersLanded(page).catch(() => {});
    const where = await playersWhere(page);
    assert.ok(sectionFits(where), `at ${width}x${height} the section fits the view: ${JSON.stringify(where)}`);
    assert.ok(Math.abs(where.section.top - where.body.top) <= 2, `at ${width}x${height} the Allowed devices section's top edge is at the top of the sheet body: ${JSON.stringify(where)}`);
    assert.ok(buttonInView(where) && !where.covered && where.focused, `at ${width}x${height} the focused button is in view: ${JSON.stringify(where)}`);
    check(`Open settings at ${width}x${height} with room below: the Allowed devices section is at the top of the view`);
  });
}

// D197 2: with the Allowed devices list already open, "Show allowed devices" is not shown, so the notice's Open settings cannot focus it. The route: the gear, Show allowed
// devices, Position poster (position mode keeps the list open) and then the notice (still up) pressed. Focus must go to a control of the open list (or its status line), inside
// the Allowed devices section and inside the visible sheet body, and not stay on Position poster far above. With a PIN, the notice asks for it again.
// Which control of the open Allowed devices list has focus, by the DOM order of the controls rendered now (never a hard-coded position): the first one is the right one (D197 2).
// `count` shows the list has more than one control, so "the last one" and "the status line" are different answers from the first.
const listFocus = (page) =>
  page.evaluate(() => {
    const controls = [...document.querySelectorAll('#players-body button, #players-body input')].filter((el) => el.getClientRects().length > 0);
    const at = document.activeElement;
    return { count: controls.length, first: controls[0] === at, last: controls.at(-1) === at, status: at === document.getElementById('players-status'), active: at.getAttribute('aria-label') || at.id || at.tagName };
  });

// The small sizes are where the section and the control do not both fit the view, so the control must be brought into view.
for (const [withPin, viewport, rotation] of [[false, undefined, 0], [true, undefined, 0], [false, { width: 360, height: 300 }, 0], [false, { width: 320, height: 568 }, 90], [false, { width: 568, height: 320 }, 0]]) {
  await withApp({ settings: seed({ rotation, ...(withPin ? { settingsPinHash: auth.hash, settingsPinSalt: auth.salt } : {}) }), plexTv: true, ...(viewport ? { viewport } : {}) }, async ({ page, app }) => {
    const enterPin = async () => {
      await page.waitForFunction(() => document.getElementById('pin-dialog').open, null, { timeout: 5000 });
      for (const d of PIN) await page.click(`#pin-dialog [data-key="${d}"]`);
      await page.click('#pin-dialog [data-key="ok"]');
      await page.waitForFunction(() => !document.getElementById('pin-dialog').open, null, { timeout: 5000 });
    };
    await clearMarkerOnce(page);
    await page.goto(app.url);
    await waitToast(page);
    await page.keyboard.press('s');
    if (withPin) await enterPin();
    await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
    await page.click('#players-open');
    if (withPin) await enterPin();
    await page.waitForFunction(() => !document.getElementById('players-body').hidden && document.querySelectorAll('#players-list li').length > 0, null, { timeout: 8000 });
    await page.click('#position-btn');
    await page.waitForFunction(() => !document.getElementById('settings').open, null, { timeout: 5000 });
    assert.equal((await toastState(page)).hidden, false, 'the notice is still up in position mode');
    await page.click('#toast button:has-text("Open settings")');
    if (withPin) await enterPin();
    await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const where = await page.evaluate(() => {
      const el = document.activeElement;
      const body = document.querySelector('#settings .sheet-body').getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        id: el.id || el.tagName,
        inSection: el.closest('#players-fieldset') !== null,
        inBody: r.height > 0 && r.top >= body.top - 1 && r.bottom <= body.bottom + 1 && r.left >= body.left - 1 && r.right <= body.right + 1,
        buttonHidden: document.getElementById('players-open').hidden,
        listOpen: !document.getElementById('players-body').hidden,
      };
    });
    assert.ok(where.buttonHidden && where.listOpen, `the list is still open and its button hidden: ${JSON.stringify(where)}`);
    assert.equal(where.inSection, true, `focus is inside the Allowed devices section${withPin ? ' (with a PIN)' : ''}: ${JSON.stringify(where)}`);
    assert.equal(where.inBody, true, `the focused control is inside the visible sheet body${withPin ? ' (with a PIN)' : ''}: ${JSON.stringify(where)}`);
    const which = await listFocus(page);
    assert.ok(which.count > 1 && which.first && !which.last && !which.status, `focus is on the FIRST rendered control of the list (the first tick), not the last and not the status line: ${JSON.stringify(which)}`);
    check(`Open settings with the Allowed devices list already open (through position mode)${withPin ? ', with a PIN' : ''}${viewport ? ` at ${viewport.width}x${viewport.height} rotation ${rotation}` : ''}: focus is on a control of the list, in view`);
  });
}

// D197 2, which control: a failed read (its first control is "Try again", ahead of the stored entries' Remove buttons) and a read that lists none of the stored entries (their
// Remove buttons only, so the first Remove). The same route; the focus is on the first rendered control by DOM order, not the last and not the status line.
for (const [state, answer] of [['failed read', () => [undefined, { status: 500 }]], ['stored entries only', () => [[], {}]]]) {
  await withApp({ settings: seed({ allowedPlayers: [{ id: 'stored-one', name: 'Stored One' }, { id: 'stored-two', name: 'Stored Two' }] }), plexTv: true }, async ({ page, app, mock }) => {
    await mock.plexTvSet(...answer());
    try {
      await clearMarkerOnce(page);
      await page.goto(app.url);
      await waitToast(page);
      await page.keyboard.press('s');
      await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
      await page.click('#players-open');
      await page.waitForFunction(() => !document.getElementById('players-body').hidden && /(Could not read|lists no players)/.test(document.getElementById('players-status').textContent), null, { timeout: 8000 });
      await page.click('#position-btn');
      await page.waitForFunction(() => !document.getElementById('settings').open, null, { timeout: 5000 });
      await page.click('#toast button:has-text("Open settings")');
      await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const which = await listFocus(page);
      assert.ok(which.count > 1 && which.first && !which.last && !which.status, `${state}: focus is on the first rendered control: ${JSON.stringify(which)}`);
      if (state === 'failed read') assert.equal(await page.evaluate(() => document.activeElement.id), 'players-retry', 'the first control of a failed read is "Try again"');
      else assert.match(which.active, /^Remove /, 'the first control is the first stored entry\'s Remove button');
      check(`Open settings with the list open (${state}): focus is on the first rendered control`);
    } finally {
      await mock.plexTvReset();
    }
  });
}

// D197 2, the list's status line: two states of the open list have no control at all, the read still out with nothing stored ("Reading your players from plex.tv…") and a read
// that answered with no player and nothing stored ("plex.tv lists no players on your account."). A failed read has "Try again" and a stored entry has its Remove, so these are the
// states where the notice's Open settings can only focus the status line. Same route as above; the focus is on the line and the line is inside the visible sheet body.
for (const [state, viewport] of [['loading', undefined], ['empty', undefined], ['loading', { width: 360, height: 300 }], ['empty', { width: 360, height: 300 }]]) {
  await withApp({ settings: seed(), plexTv: true, ...(viewport ? { viewport } : {}) }, async ({ page, app, mock, context }) => {
    let release = () => {};
    if (state === 'loading') {
      const gate = new Promise((resolve) => (release = resolve));
      await context.route(/^https:\/\/plex\.tv\/api\/v2\/resources(\?|$)/, async (route) => {
        await gate;
        await route.fallback(); // answered by the harness route behind this one
      });
    } else await mock.plexTvSet([]);
    try {
      await clearMarkerOnce(page);
      await page.goto(app.url);
      await waitToast(page);
      await page.keyboard.press('s');
      await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
      await page.click('#players-open');
      await page.waitForFunction((want) => !document.getElementById('players-body').hidden && want.test(document.getElementById('players-status').textContent), state === 'loading' ? /^Reading your players/ : /lists no players/, { timeout: 8000 });
      await page.click('#position-btn');
      await page.waitForFunction(() => !document.getElementById('settings').open, null, { timeout: 5000 });
      await page.click('#toast button:has-text("Open settings")');
      await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const where = await page.evaluate(() => {
        const el = document.activeElement;
        const body = document.querySelector('#settings .sheet-body').getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return {
          id: el.id || el.tagName,
          controls: document.querySelectorAll('#players-body button:not([hidden]), #players-body input').length,
          inBody: r.height > 0 && r.top >= body.top - 1 && r.bottom <= body.bottom + 1 && r.left >= body.left - 1 && r.right <= body.right + 1,
        };
      });
      assert.equal(where.controls, 0, `the open list has no control (${state}): ${JSON.stringify(where)}`);
      assert.equal(where.id, 'players-status', `focus is on the list's status line (${state}): ${JSON.stringify(where)}`);
      assert.equal(where.inBody, true, `the status line is inside the visible sheet body (${state}): ${JSON.stringify(where)}`);
      check(`Open settings with the list open and no control in it (${state})${viewport ? ` at ${viewport.width}x${viewport.height}` : ''}: focus is on the status line, in view`);
    } finally {
      // Nothing in the case waits after the release: the held read is answered by the harness route behind the gate, and withApp closes the page and fails the case if a plex.tv
      // request is still unanswered (guardNetwork), so the wait is bounded by the harness, not by a delay here. The empty answer is the shared mock's, so it is put back.
      release();
      if (state === 'empty') await mock.plexTvReset();
    }
  });
}

// U2: without any spacer, on the sheet as built, Allowed devices is the last section, so after Open settings the sheet is scrolled to its end (the section as near the top
// as the sheet allows) and the button is in view. (D197 1)
for (const [width, height] of [[1280, 720], [390, 844]]) {
  await withApp({ settings: seed(), viewport: { width, height } }, async ({ page, app }) => {
    await clearMarkerOnce(page);
    await page.goto(app.url);
    await waitToast(page);
    await page.click('#toast button:has-text("Open settings")');
    await page.waitForFunction(() => document.getElementById('settings').open && document.activeElement === document.getElementById('players-open'), null, { timeout: 5000 });
    await playersLanded(page).catch(() => {});
    const where = await playersWhere(page);
    assert.equal(where.atEnd, true, `at ${width}x${height} the sheet body is scrolled to its end: ${JSON.stringify(where)}`);
    assert.ok(buttonInView(where) && !where.covered && where.focused, `at ${width}x${height} the button is in view: ${JSON.stringify(where)}`);
    check(`Open settings at ${width}x${height} on the sheet as built: scrolled to its end, the button in view`);
  });
}

// D168 2: with two servers and no saved serverName the connection test names the first server a moment after the sheet opens, and the list is redrawn with
// that name. The redraw must leave focus where it was: on the first Remove button. The test's answer is held until the page has been seen with focus on the
// button, so the redraw comes after (a slow server), and the wait is on the redrawn name, not on a delay. The keyboard then goes on from there.
await withApp({ settings: seed({ servers: [{ id: '90000000000000000000000000000001', type: 'jellyfin', url: 'http://127.0.0.1:1', token: 'jf-demo-token', userId: '', name: 'Mock Jellyfin' }] }) }, async ({ page, app }) => {
  let release;
  const held = new Promise((go) => (release = go));
  await page.route((u) => u.port === String(app.mockPort) && u.pathname === '/', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(app.url);
  await page.waitForFunction(() => [...document.querySelectorAll('.poster-layer')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 }); // the held answer is the connection test's, not the poster's
  await page.keyboard.press('s'); // the gear's way in: the notice no longer lands on the server list, this case is about the focus rule after the redraw
  await page.waitForFunction(() => document.getElementById('settings').open && !document.getElementById('server-list').hidden, null, { timeout: 5000 });
  await page.focus('#server-list button');
  const focused = () => page.evaluate(() => ({ label: document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName, first: document.activeElement === document.querySelector('#server-list button') }));
  await page.waitForFunction(() => document.activeElement === document.querySelector('#server-list button'), null, { timeout: 5000 });
  assert.equal((await page.textContent('#server-list .server-name')).trim(), 'Plex', 'before the answer the first row has the type for a name');
  // The household has read on, away from the list, with focus still on the Remove button: the late redraw must not pull the sheet back to it.
  const scrolled = await page.evaluate(() => {
    const b = document.querySelector('#settings .sheet-body');
    b.scrollTop = b.scrollHeight;
    return b.scrollTop;
  });
  assert.ok(scrolled > 300, `the sheet is scrolled well away from the server list: ${scrolled}`);
  assert.equal((await focused()).first, true, 'focus is still on the first Remove button');
  release();
  await page.waitForFunction(() => document.querySelector('#server-list .server-name')?.textContent.trim() === 'Mock Plex', null, { timeout: 15000 });
  const after = await focused();
  assert.equal(after.first, true, `focus is still on the first Remove button after the list was redrawn: ${JSON.stringify(after)}`);
  assert.equal(after.label, 'Remove Mock Plex', 'it is the redrawn button, with the new name');
  const away = await page.evaluate(() => document.querySelector('#server-list').getBoundingClientRect().bottom < document.querySelector('#settings .sheet-body').getBoundingClientRect().top);
  assert.equal(away, true, 'the redraw did not scroll the sheet back to the list (focus is restored without scrolling)');
  await page.keyboard.press('Tab');
  assert.equal((await focused()).label, 'Remove Mock Jellyfin', 'Tab goes on to the second Remove button');
  await page.keyboard.press('Shift+Tab');
  assert.equal((await focused()).label, 'Remove Mock Plex', 'Shift+Tab comes back to the first');
  check('Settings opened with the gear, two servers, no saved serverName: the list redraw keeps focus on the first Remove button (slow server, keyboard)');
});

// D169 2: Settings keeps its scroll position, so a sheet opened with the gear, scrolled away from the Allowed devices section (to the top of the sheet) and cancelled is not
// at the section when the notice's Open settings opens it again; the scroll in the handler is what brings the section back. The toast survives the gear open and Cancel.
await withApp({ settings: seed() }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  await page.keyboard.press('s');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  await settled(page);
  const away = await page.evaluate(() => {
    const b = document.querySelector('#settings .sheet-body');
    b.scrollTop = 0;
    return document.getElementById('players-fieldset').getBoundingClientRect().top - b.getBoundingClientRect().bottom;
  });
  assert.ok(away > 400, `the sheet is scrolled well away from the Allowed devices section (it starts ${away} px below the view): ${away}`);
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open, null, { timeout: 5000 });
  assert.equal((await toastState(page)).hidden, false, 'the toast is still up after the gear open and Cancel');
  await page.click('#toast button:has-text("Open settings")');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  await playersLanded(page).catch(() => {});
  const where = await playersWhere(page);
  assert.equal(where.focused, true, `focus is on "Show allowed devices": ${JSON.stringify(where)}`);
  assert.ok(buttonInView(where) && !where.covered, `the button is in view: ${JSON.stringify(where)}`);
  assert.ok(!sectionFits(where) || sectionAtTop(where), `Allowed devices section at the top after a scrolled gear open and Cancel: ${JSON.stringify(where)}`);
  check('Open settings after a scrolled gear open and Cancel: the Allowed devices section is back at the top');
});

await withApp({ settings: { pixelShift: false, dailyReload: false } }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await page.waitForTimeout(2500);
  assert.ok(!(await toastState(page)).text.includes("What's new"), 'unconfigured: no toast');
  assert.equal(await page.evaluate(() => localStorage.getItem('plexPoster.whatsNew')), '2.4.3', 'unconfigured: marker written');
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
  assert.equal(await marker(page), '2.4.3', 'the marker is written');
  check('K60: a config.json-provisioned first boot writes the marker and shows no toast');
});

// An upgraded install: settings stored by 2.0, no marker, and a config.json present on the server (which must not matter).
await withApp({ settings: seed() }, async ({ page, context, app }) => {
  await context.route('**/config.json', (route) => route.fulfill({ contentType: 'application/json', body: provisionedBody(app) }));
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  assert.equal(await marker(page), '2.4.3');
  check('K60: an upgraded stored install (config.json beside it) still shows the toast');
});
