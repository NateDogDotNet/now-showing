// Recommended protection (R-PROT-5, D4, D5, D6, Q20) and the upgrade toast (R-UPG-5).
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
const toastState = (page) => page.evaluate(() => ({ hidden: document.getElementById('toast').hidden, text: document.getElementById('toast').textContent, buttons: [...document.querySelectorAll('#toast button')].map((b) => b.textContent) }));
const waitToast = (page) => page.waitForFunction(() => !document.getElementById('toast').hidden && /What's new in 2\.4\.1/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });

await withApp({ settings: seed() }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  const t = await toastState(page);
  assert.ok(t.buttons.includes('Open settings'), `buttons: ${t.buttons}`);
  assert.ok(t.text.includes("What's new in 2.4.1: choose posters from more than one server."), `words: ${t.text}`);
  assert.equal(await page.evaluate(() => localStorage.getItem('plexPoster.whatsNew')), '2.4.1', 'marker written');
  await page.reload();
  await page.waitForFunction(() => [...document.querySelectorAll('.poster-layer')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  assert.ok(!(await toastState(page)).text.includes("What's new"), 'not shown again after a reload');
  check('upgrade toast shows once for a configured install');
});

// A 2.4 install (marker '2.4') is told about 2.4.1 once, and the marker moves on.
await withApp({ settings: seed() }, async ({ page, app }) => {
  await markerOnce(page, '2.4');
  await page.goto(app.url);
  await waitToast(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('plexPoster.whatsNew')), '2.4.1', 'marker becomes 2.4.1');
  await page.reload();
  await page.waitForFunction(() => [...document.querySelectorAll('.poster-layer')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  assert.ok(!(await toastState(page)).text.includes("What's new"), 'not shown again after a reload');
  check("marker '2.4': the 2.4.1 toast shows once and the marker becomes 2.4.1");
});

// Waits until the server section is at the top of the sheet body. The connection test and the library, genre and collection requests have all
// answered (the network is idle) and two frames have drawn, so the browser has finished moving the sheet's content; then the position
// is read. The wait is on that state, not on a delay.
const serverChoiceAtTop = async (page) => {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.waitForFunction(
    () => {
      const f = document.getElementById('servers-fieldset').closest('fieldset').getBoundingClientRect();
      const body = document.querySelector('#settings .sheet-body').getBoundingClientRect();
      return document.getElementById('settings').open && f.top >= body.top - 1 && f.top < body.top + 80;
    },
    null,
    { timeout: 8000 },
  );
};

await withApp({ settings: seed() }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  await page.click('#toast button:has-text("Open settings")');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  await serverChoiceAtTop(page).catch(() => {}); // the assertion below reports where it is if it never gets there
  const where = await page.evaluate(() => {
    const f = document.getElementById('servers-fieldset').closest('fieldset').getBoundingClientRect();
    const body = document.querySelector('#settings .sheet-body').getBoundingClientRect();
    const inView = (el) => { const r = el.getBoundingClientRect(); return r.top >= body.top - 1 && r.bottom <= body.bottom + 1; };
    return { top: f.top, bottom: f.bottom, bodyTop: body.top, bodyBottom: body.bottom, headingInView: inView(document.querySelector('legend[data-srv="legend"]')), cardInView: inView(document.getElementById('connected-card')), addInView: inView(document.querySelector('#server-add summary')) };
  });
  assert.ok(where.top >= where.bodyTop - 1 && where.top < where.bodyTop + 80, `server section at the top: ${JSON.stringify(where)}`);
  assert.ok(where.headingInView && where.cardInView && where.addInView, `one server: the heading, the Connected card and Add a server are in view: ${JSON.stringify(where)}`);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#servers-fieldset') !== null && document.activeElement.matches('summary')), true, 'focus is on the first control of the server list: Add a server');
  check('Open settings opens Settings at the server section, with focus on the first control of its server list');
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

// D128 1: a slow server answers the library, collection and playlist lists late. the notice's Open settings still lands at the server section once they arrive,
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
  const where = await page.evaluate(() => ({ top: document.getElementById('servers-fieldset').closest('fieldset').getBoundingClientRect().top, bodyTop: document.querySelector('#settings .sheet-body').getBoundingClientRect().top }));
  assert.ok(where.top >= where.bodyTop - 1 && where.top < where.bodyTop + 80, `the server section is at the top once the late lists arrived: ${JSON.stringify(where)}`);
  check('Open settings lands at the server section when the lists arrive late');
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
  await serverChoiceAtTop(page).catch(() => {});
  const where = await page.evaluate(() => {
    const f = document.getElementById('servers-fieldset').closest('fieldset').getBoundingClientRect();
    const body = document.querySelector('#settings .sheet-body').getBoundingClientRect();
    return { top: f.top, bottom: f.bottom, bodyTop: body.top, bodyBottom: body.bottom };
  });
  assert.ok(where.top >= where.bodyTop - 1 && where.top < where.bodyTop + 80, `server section at the top after the PIN: ${JSON.stringify(where)}`);
  check('Open settings goes through the PIN gate');
});

// From two servers the list shows, and its first control is the first server's Remove button: Open settings lands on the list with focus there.
await withApp({ settings: seed({ serverName: 'Mock Plex', servers: [{ id: '90000000000000000000000000000001', type: 'jellyfin', url: 'http://127.0.0.1:1', token: 'jf-demo-token', userId: '', name: 'Mock Jellyfin' }] }) }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  await page.click('#toast button:has-text("Open settings")');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  await serverChoiceAtTop(page).catch(() => {});
  const where = await page.evaluate(() => {
    const f = document.getElementById('servers-fieldset').closest('fieldset').getBoundingClientRect();
    const body = document.querySelector('#settings .sheet-body').getBoundingClientRect();
    return { top: f.top, bodyTop: body.top, listShown: !document.getElementById('server-list').hidden, onRemove: document.activeElement === document.querySelector('#server-list button') };
  });
  assert.ok(where.listShown, 'two servers: the list shows');
  assert.ok(where.top >= where.bodyTop - 1 && where.top < where.bodyTop + 80, `server section at the top: ${JSON.stringify(where)}`);
  assert.equal(where.onRemove, true, 'focus is on the first control of the server list: the first Remove button');
  check('Open settings from two servers: the list at the top, focus on the first Remove button');
});

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
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  await page.click('#toast button:has-text("Open settings")');
  await page.waitForFunction(() => document.getElementById('settings').open && !document.getElementById('server-list').hidden, null, { timeout: 5000 });
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
  check('Open settings from two servers, no saved serverName: the list redraw keeps focus on the first Remove button (slow server, keyboard)');
});

// D169 2: Settings keeps its scroll position, so a sheet opened with the gear, scrolled past the server section and cancelled is not at the section when the
// notice's Open settings opens it again; the scroll in the handler is what brings the section back. The toast survives the gear open and Cancel.
await withApp({ settings: seed() }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  await page.keyboard.press('s');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  await settled(page);
  const scrolled = await page.evaluate(() => {
    const b = document.querySelector('#settings .sheet-body');
    b.scrollTop = b.scrollHeight;
    return b.scrollTop;
  });
  assert.ok(scrolled > 400, `the sheet is scrolled well past the server section: ${scrolled}`);
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open, null, { timeout: 5000 });
  assert.equal((await toastState(page)).hidden, false, 'the toast is still up after the gear open and Cancel');
  await page.click('#toast button:has-text("Open settings")');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  await serverChoiceAtTop(page).catch(() => {});
  const where = await page.evaluate(() => {
    const f = document.getElementById('servers-fieldset').closest('fieldset').getBoundingClientRect();
    const body = document.querySelector('#settings .sheet-body').getBoundingClientRect();
    const inView = (el) => { const r = el.getBoundingClientRect(); return r.top >= body.top - 1 && r.bottom <= body.bottom + 1; };
    return { top: f.top, bodyTop: body.top, headingInView: inView(document.querySelector('legend[data-srv="legend"]')), cardInView: inView(document.getElementById('connected-card')), addInView: inView(document.querySelector('#server-add summary')) };
  });
  assert.ok(where.top >= where.bodyTop - 1 && where.top < where.bodyTop + 80, `server section at the top after a scrolled gear open and Cancel: ${JSON.stringify(where)}`);
  assert.ok(where.headingInView && where.cardInView && where.addInView, `the heading, the Connected card and Add a server are in view: ${JSON.stringify(where)}`);
  check('Open settings after a scrolled gear open and Cancel: the server section is back at the top');
});

await withApp({ settings: { pixelShift: false, dailyReload: false } }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await page.waitForTimeout(2500);
  assert.ok(!(await toastState(page)).text.includes("What's new"), 'unconfigured: no toast');
  assert.equal(await page.evaluate(() => localStorage.getItem('plexPoster.whatsNew')), '2.4.1', 'unconfigured: marker written');
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
  assert.equal(await marker(page), '2.4.1', 'the marker is written');
  check('K60: a config.json-provisioned first boot writes the marker and shows no toast');
});

// An upgraded install: settings stored by 2.0, no marker, and a config.json present on the server (which must not matter).
await withApp({ settings: seed() }, async ({ page, context, app }) => {
  await context.route('**/config.json', (route) => route.fulfill({ contentType: 'application/json', body: provisionedBody(app) }));
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  assert.equal(await marker(page), '2.4.1');
  check('K60: an upgraded stored install (config.json beside it) still shows the toast');
});
