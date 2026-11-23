// Allowed devices (R-PLAY-1, D65, D181, D186): Settings, behind the PIN, lists the Plex players on the account and lets the owner allow each one
// for this display. The list reads from the mock plex.tv (scripts/mock-plex.mjs, served to a context that opts in: withApp({ plexTv: true })).
//
// Mock players: Living Room TV (mock-player-living-room), Kids Room TV (mock-player-kids-room), Old Tablet (mock-player-old-tablet, not present),
// and the account's server, which is not a player. A player's address is in TEST-NET-1 (192.0.2.x): the display must never request it.
//
// Every case has its own mock servers (serveArgs: []) and names pixelShift: false (convention 7). Nothing waits for a wall-clock time: every wait is on a
// state (a list drawn, a dialog closed, a request seen) with a bound, and a read that must still be loading is held by a route the case releases.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPinAuth } from '../../js/kiosk.js';
import { withApp } from './lib.mjs';

const check = (name) => console.log(`  ok  ${name}`);
const cases = [];
const playCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], plexTv: true, ...opts }, fn });

const PIN = '2468';
const pinAuth = await createPinAuth(PIN);
const withPin = { settingsPinHash: pinAuth.hash, settingsPinSalt: pinAuth.salt };

const LIVING = { id: 'mock-player-living-room', name: 'Living Room TV' };
const KIDS = { id: 'mock-player-kids-room', name: 'Kids Room TV' };
const TABLET = { id: 'mock-player-old-tablet', name: 'Old Tablet' };
const GARAGE = { id: 'gone-garage-tv', name: 'Garage TV' }; // an allowed player the account no longer lists
const RESOURCES = /^https:\/\/plex\.tv\/api\/v2\/resources(\?|$)/;

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

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));
const storedList = async (page) => (await stored(page)).allowedPlayers ?? [];
const posterShown = (page) => page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
const openSettings = async (page) => {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
};
const load = async (page, app) => {
  await page.goto(app.url);
  await posterShown(page);
};
const save = async (page) => {
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open, null, { timeout: 5000 });
};
const cancel = async (page) => {
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open, null, { timeout: 5000 });
};
const clientIdOf = (page) => page.evaluate(() => localStorage.getItem('plexPoster.clientId'));
const pinIs = (page, want) => page.waitForFunction((w) => document.getElementById('pin-dialog').open === w, want, { timeout: 5000 });
const pinOpen = (page) => page.evaluate(() => document.getElementById('pin-dialog').open);
async function typePin(page, pin) {
  for (const d of pin) await page.click(`#pin-dialog [data-key="${d}"]`);
  await page.click('#pin-dialog [data-key="ok"]');
}
/** Opens Settings after the PIN the sheet itself asks for (a PIN set: Settings is behind it too). */
async function openSettingsWithPin(page) {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await pinIs(page, true);
  await typePin(page, PIN);
  await page.waitForFunction(() => document.getElementById('settings').open && !document.getElementById('pin-dialog').open, null, { timeout: 5000 });
}

const listShown = (page) => page.isVisible('#players-body');
/** The rows of the list, as drawn. `box` is null for a row with no tick. */
const rows = (page) =>
  page.$$eval('#players-list > li', (lis) =>
    lis.map((li) => ({
      id: li.dataset.id,
      name: li.querySelector('.player-name').textContent,
      state: li.querySelector('.player-state')?.dataset.state ?? '',
      box: li.querySelector('input[type=checkbox]') ? li.querySelector('input[type=checkbox]').checked : null,
      remove: Boolean(li.querySelector('button.player-remove')),
    })),
  );
const status = (page) => page.textContent('#players-status');
/** Presses "Show allowed devices" and waits until plex.tv has answered (or failed) and the list is drawn. */
async function showList(page) {
  await page.click('#players-open');
  await listDrawn(page);
}
const listDrawn = (page) =>
  page.waitForFunction(() => !document.getElementById('players-body').hidden && document.getElementById('players-status').textContent !== '' && !/^Reading/.test(document.getElementById('players-status').textContent), null, { timeout: 10000 });
const tick = (page, name, on = true) => page.getByRole('checkbox', { name: `Allow ${name}` }).setChecked(on);
/** Waits for `n` animation frames: the page has run what was queued before them. */
const frames = (page, n) => page.evaluate((count) => new Promise((resolve) => { let left = count; const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);

/** What the page asked of plex.tv and of any player address, from the browser's own side. */
function watchNetwork(page) {
  const seen = { plexTv: [], players: [] };
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname === 'plex.tv') seen.plexTv.push(`${r.method()} ${u.pathname}`);
    if (/^192\.0\.2\./.test(u.hostname)) seen.players.push(r.url());
  });
  return seen;
}

// ---- the list shows behind the PIN ----

playCase('P6 with a PIN set the list does not show and cannot be changed until the PIN is given: a cancelled and a wrong PIN show nothing, no request goes out', { settings: seed({ ...withPin, allowedPlayers: [LIVING] }) }, async ({ page, app, mock }) => {
  const net = watchNetwork(page);
  await load(page, app);
  await openSettingsWithPin(page);
  assert.equal(await listShown(page), false, 'the sheet is open (it asked for the PIN) but the list is shut');
  assert.equal(await page.isVisible('#players-open'), true);
  assert.deepEqual(await rows(page), [], 'no stored entry is drawn either');
  assert.equal(await page.isVisible('#players-pin-note'), false, 'a PIN is set: no line about setting one');

  await page.click('#players-open');
  await pinIs(page, true);
  assert.equal(await listShown(page), false, 'shut while the PIN is asked');
  await page.click('#pin-cancel');
  await pinIs(page, false);
  assert.equal(await listShown(page), false, 'a cancelled PIN shows nothing');
  assert.deepEqual(await rows(page), []);

  await page.click('#players-open');
  await pinIs(page, true);
  await typePin(page, '1111');
  await page.waitForFunction(() => /Wrong PIN/.test(document.getElementById('pin-error').textContent), null, { timeout: 5000 });
  assert.equal(await pinOpen(page), true, 'a wrong PIN keeps the question open');
  assert.equal(await listShown(page), false, 'a wrong PIN shows nothing');
  assert.deepEqual(await mock.plexTvLog(), [], 'and plex.tv has not been asked');
  await page.click('#pin-cancel');
  await pinIs(page, false);

  await page.click('#players-open');
  await pinIs(page, true);
  await typePin(page, PIN);
  await pinIs(page, false);
  await listDrawn(page);
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.box]), [[KIDS.id, false], [LIVING.id, true], [TABLET.id, false]], 'the right PIN opens it, with the stored player ticked');
  assert.equal((await mock.plexTvLog()).length, 1);

  // One prompt opens the list: it is read and changed with no further prompt until the sheet closes.
  await tick(page, 'Kids Room TV');
  await tick(page, 'Living Room TV', false);
  assert.equal(await pinOpen(page), false, 'no second prompt for a change');
  await save(page);
  assert.equal(await pinOpen(page), false, 'and none for Save');
  assert.deepEqual(await storedList(page), [KIDS]);

  // A new opening of the sheet asks again.
  await openSettingsWithPin(page);
  assert.equal(await listShown(page), false, 'the list is shut again when the sheet opens afresh');
  await page.click('#players-open');
  await pinIs(page, true);
  await page.click('#pin-cancel');
  assert.deepEqual(net.players, [], 'no player address was ever requested');
  check('P6 the list opens behind the PIN, once');
});

playCase('P6b no PIN set: no prompt opens the list, and one line says a settings PIN keeps others from changing it', { settings: seed() }, async ({ page, app }) => {
  await load(page, app);
  await openSettings(page);
  assert.equal(await page.isVisible('#players-pin-note'), true);
  assert.match(await page.textContent('#players-pin-note'), /settings PIN .* keeps others from changing this list/);
  await page.click('#players-open');
  await listDrawn(page);
  assert.equal(await pinOpen(page), false, 'no prompt');
  assert.equal((await rows(page)).length, 3);
  assert.equal(await page.isVisible('#players-pin-note'), true, 'the line stays while the list is open');
  check('P6b no PIN, no prompt, and the line');
});

playCase('P6d the list stays open, with its changes, while the sheet steps aside for position mode, and asks for no second PIN', { settings: seed(withPin) }, async ({ page, app, mock }) => {
  await load(page, app);
  await openSettingsWithPin(page);
  await page.click('#players-open');
  await pinIs(page, true);
  await typePin(page, PIN);
  await pinIs(page, false);
  await listDrawn(page);
  await tick(page, 'Kids Room TV');
  await page.click('#position-btn');
  await page.waitForFunction(() => !document.getElementById('settings').open, null, { timeout: 5000 });
  await page.click('#position-done');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  assert.equal(await listShown(page), true, 'the same sheet comes back with the list open');
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.box]), [[KIDS.id, true], [LIVING.id, false], [TABLET.id, false]], 'with the change');
  assert.equal(await pinOpen(page), false);
  assert.equal((await mock.plexTvLog()).length, 1, 'and no second read');
  await save(page);
  assert.deepEqual(await storedList(page), [KIDS]);
  check('P6d position mode keeps the list open');
});

// ---- a new display allows nothing; nothing is read until the list is opened ----

playCase('P7 P8 a new display allows nothing, nothing is read at load or when Settings opens, and the list reads plex.tv once when it is opened, never a player', { settings: seed() }, async ({ page, app, mock }) => {
  const net = watchNetwork(page);
  await load(page, app);
  assert.deepEqual(net.plexTv, [], 'no plex.tv request at page load');
  assert.deepEqual(await storedList(page), [], 'a display that has never saved a list allows nothing');
  await openSettings(page);
  assert.deepEqual(net.plexTv, [], 'none when Settings opens');
  assert.deepEqual(await mock.plexTvLog(), []);
  assert.equal(await listShown(page), false);
  assert.deepEqual(await rows(page), []);

  await showList(page);
  assert.deepEqual(await rows(page), [
    { id: KIDS.id, name: KIDS.name, state: '', box: false, remove: false },
    { id: LIVING.id, name: LIVING.name, state: '', box: false, remove: false },
    { id: TABLET.id, name: TABLET.name, state: 'offline', box: false, remove: false },
  ], 'the account\'s three players by name, none allowed, the one plex.tv says is not present marked offline, and the server is not listed');
  const log = await mock.plexTvLog();
  assert.deepEqual(log, [{ token: 'demo-token', client: await clientIdOf(page) }], 'one read, with this display\'s token and client identifier');
  assert.deepEqual(net.plexTv, ['GET /api/v2/resources'], 'the only plex.tv request is the resources read');
  assert.equal(await page.getByRole('checkbox', { name: 'Allow Living Room TV' }).count(), 1, 'each control says which player it allows');

  await save(page);
  assert.deepEqual(await storedList(page), [], 'a Save that ticked nothing allows nothing');
  assert.deepEqual(net.players, [], 'no request to a player');
  check('P7 P8 empty by default, read on opening');
});

playCase('P8b a stored list is not read at load, when Settings opens or on Save: plex.tv is read only when the list is opened', { settings: seed({ allowedPlayers: [LIVING] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await openSettings(page);
  await save(page);
  assert.deepEqual(await mock.plexTvLog(), [], 'a stored list is not read at load, on opening Settings or on Save');
  assert.deepEqual(await storedList(page), [LIVING]);
  check('P8b a stored list is not read until it is opened');
});

// ---- allow, save, reload; Cancel; Reset; Import; Export ----

playCase('allowing and saving survives a reload, and an untick is saved too', { settings: seed() }, async ({ page, app }) => {
  await load(page, app);
  await openSettings(page);
  await showList(page);
  await tick(page, 'Living Room TV');
  await tick(page, 'Old Tablet'); // offline, still allowable
  assert.deepEqual(await storedList(page), [], 'nothing is stored before Save');
  await save(page);
  assert.deepEqual(await storedList(page), [LIVING, TABLET], 'the identifier and the name last seen, nothing else');
  await page.waitForFunction(() => document.getElementById('players-body').hidden, null, { timeout: 5000 }); // the dialog's close event runs a moment after it closes
  assert.equal(await listShown(page), false, 'the list shuts with the sheet');
  assert.deepEqual(await rows(page), [], 'and holds nothing of what it showed');

  await page.reload();
  await posterShown(page);
  assert.deepEqual(await storedList(page), [LIVING, TABLET], 'it survives a reload');
  await openSettings(page);
  assert.equal(await listShown(page), false, 'the list is shut again after a reload');
  await showList(page);
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.box]), [[KIDS.id, false], [LIVING.id, true], [TABLET.id, true]]);

  await tick(page, 'Living Room TV', false);
  await save(page);
  assert.deepEqual(await storedList(page), [TABLET]);
  check('allow, save, reload');
});

playCase('P10 Cancel discards what was allowed and removed in the sheet', { settings: seed({ allowedPlayers: [LIVING, GARAGE] }) }, async ({ page, app }) => {
  await load(page, app);
  await openSettings(page);
  await showList(page);
  await tick(page, 'Kids Room TV');
  await tick(page, 'Living Room TV', false);
  await page.getByRole('button', { name: 'Remove Garage TV from the allowed devices' }).click();
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.box]), [[KIDS.id, true], [LIVING.id, false], [TABLET.id, false]]);
  await cancel(page);
  assert.deepEqual(await storedList(page), [LIVING, GARAGE], 'Cancel stores nothing');

  await openSettings(page);
  assert.equal(await listShown(page), false);
  await showList(page);
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.box, r.state]), [[KIDS.id, false, ''], [LIVING.id, true, ''], [TABLET.id, false, 'offline'], [GARAGE.id, null, 'unavailable']], 'the next opening shows the stored list as it was');
  check('P10 Cancel discards');
});

playCase('P10 Reset everything clears the list', { settings: seed() }, async ({ page, app }) => {
  await load(page, app);
  await openSettings(page);
  await showList(page);
  await tick(page, 'Kids Room TV');
  await save(page);
  assert.deepEqual(await storedList(page), [KIDS]);
  await openSettings(page);
  page.once('dialog', (d) => d.accept());
  await Promise.all([page.waitForEvent('load'), page.click('#reset-btn')]);
  await posterShown(page);
  assert.deepEqual(await storedList(page), [], 'the stored list is gone');
  await openSettings(page);
  await showList(page);
  assert.deepEqual((await rows(page)).map((r) => r.box), [false, false, false], 'and nothing is allowed after the reset');
  check('P10 Reset clears the list');
});

playCase('P2 an import leaves this display\'s list as it is, with no notice, and an export carries no list, with and without the token', { settings: seed({ allowedPlayers: [LIVING] }) }, async ({ page, app }) => {
  await load(page, app);
  await openSettings(page);
  await showList(page);
  await tick(page, 'Kids Room TV'); // a change of the sheet that the import must keep too
  const file = JSON.stringify({ format: 'plex-poster-display/settings', version: 1, settings: { rotateSeconds: 120, allowedPlayers: [TABLET, { id: 'their-tv', name: 'Their TV' }] } });
  await page.setInputFiles('#import-file', { name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await page.waitForFunction(() => document.getElementById('settings-form').elements.namedItem('rotateSeconds').value === '120', null, { timeout: 5000 });
  assert.equal(await page.textContent('#toast'), 'Settings imported — review and press Save.', 'the one notice is the import\'s own: it says nothing about the list');
  assert.equal(await listShown(page), true, 'this file changes no server: the open list stays open (D190)');
  assert.equal(await page.textContent('#players-closed-note'), '', 'and nothing says the servers changed');
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.box]), [[KIDS.id, true], [LIVING.id, true], [TABLET.id, false]], 'with the display\'s own choices and the tick made before the import, not the file\'s');
  await save(page);
  assert.deepEqual(await storedList(page), [LIVING, KIDS], 'saved as the sheet had it');

  await openSettings(page);
  for (const secrets of [false, true]) {
    await page.setChecked('#export-secrets', secrets);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#export-btn')]);
    const text = readFileSync(await dl.path(), 'utf8');
    assert.equal('allowedPlayers' in JSON.parse(text).settings, false, `export with secrets ${secrets}: no list`);
    assert.equal(/mock-player|Living Room/.test(text), false, `export with secrets ${secrets}: no identifier and no name`);
    assert.equal(text.includes('demo-token'), secrets, 'the token is in only when asked for');
  }
  check('P2 import and export leave the list alone');
});

// ---- the three states, and a read that does not answer ----

playCase('P3 P4 a renamed player stays allowed, the stored name follows it on Save, a different player with the old name is not allowed, and a player gone from the account is kept, shown unavailable and removable', { settings: seed({ allowedPlayers: [{ id: LIVING.id, name: 'Old Name Of The Living Room TV' }, { id: 'old-id', name: KIDS.name }, GARAGE] }) }, async ({ page, app }) => {
  await load(page, app);
  await openSettings(page);
  await showList(page);
  assert.deepEqual(await rows(page), [
    { id: KIDS.id, name: KIDS.name, state: '', box: false, remove: false },
    { id: LIVING.id, name: LIVING.name, state: '', box: true, remove: false },
    { id: TABLET.id, name: TABLET.name, state: 'offline', box: false, remove: false },
    { id: 'old-id', name: KIDS.name, state: 'unavailable', box: null, remove: true },
    { id: GARAGE.id, name: GARAGE.name, state: 'unavailable', box: null, remove: true },
  ], 'the renamed one is ticked by its identifier; the one that took the old name of another is not; the gone ones are kept and removable');
  await save(page);
  assert.deepEqual(await storedList(page), [{ id: LIVING.id, name: LIVING.name }, { id: 'old-id', name: KIDS.name }, GARAGE], 'the name follows on Save, and a gone player is not dropped by it');

  await openSettings(page);
  await showList(page);
  await page.getByRole('button', { name: 'Remove Garage TV from the allowed devices' }).click();
  assert.deepEqual((await rows(page)).map((r) => r.id), [KIDS.id, LIVING.id, TABLET.id, 'old-id']);
  await save(page);
  assert.deepEqual((await storedList(page)).map((p) => p.id), [LIVING.id, 'old-id'], 'a removal is stored by Save');
  check('P3 P4 matching by identifier; gone is kept');
});

playCase('P3b a name change that arrives while the sheet is open is followed only by Save: Cancel keeps the stored name', { settings: seed({ allowedPlayers: [{ id: LIVING.id, name: 'Stored Name' }] }) }, async ({ page, app }) => {
  await load(page, app);
  await openSettings(page);
  await showList(page);
  await cancel(page);
  assert.deepEqual(await storedList(page), [{ id: LIVING.id, name: 'Stored Name' }]);
  check('P3b Cancel keeps the stored name');
});

playCase('P11 plex.tv not read (an error, a refused token, no answer): the stored entries show as not checked and removable, and nothing can be added', { settings: seed({ allowedPlayers: [LIVING, GARAGE] }) }, async ({ page, app, mock, context }) => {
  await load(page, app);
  const states = [
    ['a server error', () => mock.plexTvSet(undefined, { status: 500 }), /^Could not read the players of (Mock Plex|Plex): plex\.tv had a problem and could not answer\. Try again later\./],
    ['another server error', () => mock.plexTvSet(undefined, { status: 503 }), /^Could not read the players of (Mock Plex|Plex): plex\.tv had a problem and could not answer\. Try again later\./],
    ['an error that is not the server\'s', () => mock.plexTvSet(undefined, { status: 404 }), /^Could not read the players of (Mock Plex|Plex): plex\.tv answered with something that could not be read\./],
    ['a refused token', () => mock.plexTvSet(undefined, { status: 401 }), /^Could not read the players of (Mock Plex|Plex): plex\.tv refused the sign-in\. Sign in to (Mock Plex|Plex) again/],
    ['an answer that is not a list', () => mock.plexTvSet({}, { status: 200 }), /^Could not read the players of (Mock Plex|Plex): plex\.tv answered with something that could not be read\./],
  ];
  for (const [label, arrange, words] of states) {
    await arrange();
    await openSettings(page);
    await showList(page);
    assert.match(await status(page), words, `${label}: the server and what happened, in words`);
    assert.doesNotMatch(await status(page), /HTTP|CORS|network|unauthori[sz]ed|Plex returned|\b[45]\d\d\b|Close Settings/, `${label}: no status code, no protocol word, no advice to close Settings`);
    assert.equal(await page.isVisible('#players-retry'), true, `${label}: "Try again" is offered`);
    assert.deepEqual(await rows(page), [
      { id: LIVING.id, name: LIVING.name, state: 'not checked', box: null, remove: true },
      { id: GARAGE.id, name: GARAGE.name, state: 'not checked', box: null, remove: true },
    ], `${label}: the stored entries as stored, not checked, removable`);
    assert.equal(await page.locator('#players-list input[type=checkbox]').count(), 0, `${label}: nothing can be added`);
    await save(page); // a Save that touched nothing
    assert.deepEqual(await storedList(page), [LIVING, GARAGE], `${label}: Save drops nothing`);
  }
  // Removing works with the read failed; adding does not exist.
  await openSettings(page);
  await showList(page);
  await page.getByRole('button', { name: 'Remove Living Room TV from the allowed devices' }).click();
  assert.deepEqual((await rows(page)).map((r) => r.id), [GARAGE.id]);
  await save(page);
  assert.deepEqual(await storedList(page), [GARAGE], 'a removal made while plex.tv was not read is stored');

  // plex.tv that does not answer at all: the request fails in the network.
  await mock.plexTvSet(undefined, { status: 200 });
  await context.route(RESOURCES, (route) => route.abort('failed'));
  await openSettings(page);
  await showList(page);
  assert.match(await status(page), /^Could not read the players of (Mock Plex|Plex): plex\.tv did not answer\./);
  assert.doesNotMatch(await status(page), /HTTP|CORS|network/);
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.state, r.box]), [[GARAGE.id, 'not checked', null]]);
  check('P11 not read: stored shown, removable, nothing added');
});

playCase('P5 a Save while the read is still loading keeps every allowed player: the rows on screen are not what is stored', { settings: seed({ allowedPlayers: [LIVING, GARAGE] }) }, async ({ page, app, context }) => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await load(page, app);
  await context.route(RESOURCES, async (route) => {
    await gate;
    await route.fallback();
  });
  const answered = page.waitForResponse((r) => RESOURCES.test(r.url()));
  answered.catch(() => {}); // a case that fails early closes the browser: that rejection is not the failure to report
  await openSettings(page);
  await page.click('#players-open');
  await page.waitForFunction(() => /^Reading/.test(document.getElementById('players-status').textContent), null, { timeout: 5000 });
  assert.deepEqual(await rows(page), [
    { id: LIVING.id, name: LIVING.name, state: 'not checked', box: null, remove: true },
    { id: GARAGE.id, name: GARAGE.name, state: 'not checked', box: null, remove: true },
  ], 'while it loads the stored entries show as not checked and nothing can be ticked');
  await save(page);
  assert.deepEqual(await storedList(page), [LIVING, GARAGE], 'Save while loading drops nothing');
  release();
  await answered; // the late answer lands on a closed sheet and changes nothing
  await frames(page, 2); // the page has had its turn to act on it
  assert.deepEqual(await storedList(page), [LIVING, GARAGE]);
  assert.equal(await listShown(page), false, 'the late answer did not open the list of a sheet that has closed');
  assert.deepEqual(await rows(page), [], 'nor draw into it');
  check('P5 Save while loading keeps the list');
});

playCase('a late failure from plex.tv, after the sheet closed, draws nothing either', { settings: seed({ allowedPlayers: [LIVING] }) }, async ({ page, app, mock, context }) => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await mock.plexTvSet(undefined, { status: 500 });
  await load(page, app);
  await context.route(RESOURCES, async (route) => {
    await gate;
    await route.fallback();
  });
  const answered = page.waitForResponse((r) => RESOURCES.test(r.url()));
  answered.catch(() => {}); // a case that fails early closes the browser: that rejection is not the failure to report
  await openSettings(page);
  await page.click('#players-open');
  await cancel(page);
  release();
  await answered;
  await frames(page, 2);
  assert.equal(await listShown(page), false);
  assert.deepEqual(await rows(page), []);
  check('a late failure draws nothing');
});

playCase('P6c the sheet closing while the PIN is asked: the right PIN afterwards opens nothing and reads nothing', { settings: seed(withPin) }, async ({ page, app, mock }) => {
  await load(page, app);
  await openSettingsWithPin(page);
  await page.click('#players-open');
  await pinIs(page, true);
  await page.evaluate(() => document.getElementById('settings').close()); // the sheet goes away under the question
  await typePin(page, PIN);
  await pinIs(page, false);
  await frames(page, 2);
  assert.deepEqual(await mock.plexTvLog(), [], 'no read for a sheet that is not there');
  assert.equal(await listShown(page), false);
  check('P6c a closed sheet reads nothing');
});

playCase('P12 a Jellyfin household has no players and sends no plex.tv request; its stored entries read not checked, with the reason, and are removable', { settings: (app) => ({ serverType: 'jellyfin', plexToken: 'jf-demo-token', serverUrl: `http://127.0.0.1:${app.jellyfinPort}`, libraryKey: 'b0000000000000000000000000000001', libraryKeys: ['b0000000000000000000000000000001'], libraryNames: ['Movies'], rotateSeconds: 3600, showNowPlaying: false, unwatchedOnly: false, pixelShift: false, allowedPlayers: [LIVING] }) }, async ({ page, app, mock }) => {
  const net = watchNetwork(page);
  await load(page, app);
  await openSettings(page);
  await showList(page);
  assert.match(await status(page), /No Plex server is signed in on this display, so there are no Plex players to list\. Your allowed devices are kept and were not checked\. You can remove one, but not add one\./);
  assert.doesNotMatch(await status(page), /unavailable/);
  assert.deepEqual(await rows(page), [{ id: LIVING.id, name: LIVING.name, state: 'not checked', box: null, remove: true }]);
  assert.deepEqual(await described(page), [{ control: 'Remove Living Room TV from the allowed devices', description: 'not checked: no Plex server is signed in' }], 'the reason is no Plex server, not a player that left the account');
  assert.equal(await page.locator('#players-list input[type=checkbox]').count(), 0, 'nothing can be added');
  assert.deepEqual(net.plexTv, [], 'no plex.tv request');
  assert.deepEqual(await mock.plexTvLog(), []);
  await save(page);
  assert.deepEqual(await storedList(page), [LIVING], 'Save keeps the entry');
  await openSettings(page);
  await showList(page);
  await page.getByRole('button', { name: 'Remove Living Room TV from the allowed devices' }).click();
  assert.deepEqual(await rows(page), []);
  await save(page);
  assert.deepEqual(await storedList(page), []);
  check('P12 Jellyfin: no players, no request');
});

// ---- every Plex account of the household, each identifier once ----

playCase('every Plex account of the household is read once, and an identifier two accounts list is listed once', { settings: seed({ servers: [{ id: 'second-srv', type: 'plex', url: 'http://127.0.0.1:1', token: 'second-token', name: 'Second' }, { id: 'third-srv', type: 'plex', url: 'http://127.0.0.1:2', token: 'demo-token', name: 'Third' }] }) }, async ({ page, app, mock }) => {
  const own = { name: 'Display', provides: 'player', clientIdentifier: 'placeholder', presence: true };
  await mock.plexTvSet([{ ...own, name: 'Shared TV', clientIdentifier: 'shared-tv', presence: false }, { ...own, name: 'First Only', clientIdentifier: 'first-only' }], { token: 'demo-token' });
  await mock.plexTvSet([{ ...own, name: 'Shared TV (second account)', clientIdentifier: 'shared-tv', presence: true }, { ...own, name: 'Second Only', clientIdentifier: 'second-only' }], { token: 'second-token' });
  await load(page, app);
  await openSettings(page);
  await showList(page);
  const log = await mock.plexTvLog();
  assert.deepEqual(log.map((r) => r.token).sort(), ['demo-token', 'second-token'], 'three servers, two accounts: two reads, each token once');
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.name, r.state]), [
    ['first-only', 'First Only', ''],
    ['second-only', 'Second Only', ''],
    ['shared-tv', 'Shared TV', ''], // present, because the second account says so
  ], 'every account\'s players, the shared one once');

  // One account that cannot be read makes the whole list not checked: a list missing an account is never shown as the whole.
  await cancel(page);
  await mock.plexTvSet(undefined, { token: 'second-token', status: 500 });
  await openSettings(page);
  await showList(page);
  assert.match(await status(page), /^Could not read the players of Second: plex\.tv had a problem and could not answer\. Try again later\./, 'the account that failed is named, and only it');
  assert.doesNotMatch(await status(page), /Third|Display/);
  assert.equal(await page.locator('#players-list input[type=checkbox]').count(), 0);
  await cancel(page);
  await mock.plexTvSet(undefined, { token: 'second-token', status: 401 });
  await openSettings(page);
  await showList(page);
  assert.match(await status(page), /^Could not read the players of Second: plex\.tv refused the sign-in\. Sign in to Second again/);
  check('every account, each identifier once');
});

playCase('P9 this display\'s own identifier, a resource with no identifier and a repeated identifier are not listed (or listed once); a server and a look-alike are not players', { settings: seed() }, async ({ page, app, mock }) => {
  await load(page, app);
  const me = await clientIdOf(page);
  const res = (over) => ({ name: 'x', provides: 'client,player', presence: true, clientIdentifier: 'x', ...over });
  await mock.plexTvSet([
    res({ name: 'This display', clientIdentifier: me }),
    res({ name: 'No identifier', clientIdentifier: undefined }),
    res({ name: 'Empty identifier', clientIdentifier: '' }),
    res({ name: 'Den TV', clientIdentifier: 'den' }),
    res({ name: 'Den TV again', clientIdentifier: 'den' }),
    res({ name: 'A server', clientIdentifier: 'srv', provides: 'server' }),
    res({ name: 'A look-alike', clientIdentifier: 'lookalike', provides: 'players-x,mediaplayer' }),
  ]);
  await openSettings(page);
  await showList(page);
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.name]), [['den', 'Den TV']]);
  check('P9 own, no identifier, repeated');
});

playCase('an account with no players says so, and still keeps and shows what is stored', { settings: seed({ allowedPlayers: [GARAGE] }) }, async ({ page, app, mock }) => {
  await mock.plexTvSet([]);
  await load(page, app);
  await openSettings(page);
  await showList(page);
  assert.match(await status(page), /lists no players on your account/);
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.state, r.remove]), [[GARAGE.id, 'unavailable', true]]);
  check('no players on the account');
});

// ---- r2: Try again, a change to the servers, what a state means, where focus goes (D187, D188) ----

/** Holds every plex.tv resources request until `release()`; the held request is then answered by the harness route behind it. */
async function holdReads(context) {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await context.route(RESOURCES, async (route) => {
    await gate;
    await route.fallback();
  });
  return release;
}
const described = (page) =>
  page.$$eval('#players-list > li', (lis) =>
    lis.map((li) => {
      const control = li.querySelector('input, button');
      const ids = (control.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      return { control: control.getAttribute('aria-label'), description: ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ') };
    }),
  );
const activeName = (page) => page.evaluate(() => document.activeElement.getAttribute('aria-label') || document.activeElement.id || document.activeElement.tagName);

playCase('Q8 Q9 "Try again" reads again with no new PIN, and nothing can be added until plex.tv answers', { settings: seed({ ...withPin, allowedPlayers: [LIVING] }) }, async ({ page, app, mock, context }) => {
  await mock.plexTvSet(undefined, { status: 500 });
  await load(page, app);
  await openSettingsWithPin(page);
  await page.click('#players-open');
  await pinIs(page, true);
  await typePin(page, PIN);
  await pinIs(page, false);
  await listDrawn(page);
  assert.match(await status(page), /^Could not read the players of (Mock Plex|Plex): plex\.tv had a problem and could not answer\./);
  assert.equal((await mock.plexTvLog()).length, 1);
  assert.equal(await page.isVisible('#players-retry'), true);

  // Still failing: another read, no prompt, the same line, "Try again" still there.
  await page.click('#players-retry');
  await listDrawn(page);
  assert.equal(await pinOpen(page), false, 'no new PIN while the list is open');
  assert.equal((await mock.plexTvLog()).length, 2, 'one more read');
  assert.match(await status(page), /^Could not read the players of/);
  assert.equal(await page.isVisible('#players-retry'), true);

  // Answered at last, but held on the way: until it lands nothing can be ticked.
  await mock.plexTvSet(undefined, { status: 200 });
  const release = await holdReads(context);
  const answered = page.waitForResponse((r) => RESOURCES.test(r.url()));
  answered.catch(() => {});
  await page.click('#players-retry');
  await page.waitForFunction(() => /^Reading/.test(document.getElementById('players-status').textContent), null, { timeout: 5000 });
  assert.equal(await page.locator('#players-list input[type=checkbox]').count(), 0, 'nothing can be added while the new answer is awaited');
  assert.equal(await page.isVisible('#players-retry'), false);
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.state, r.remove]), [[LIVING.id, 'not checked', true]]);
  release();
  await answered;
  await page.waitForFunction(() => document.querySelectorAll('#players-list input[type=checkbox]').length > 0, null, { timeout: 5000 });
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.box]), [[KIDS.id, false], [LIVING.id, true], [TABLET.id, false]]);
  assert.equal(await page.isVisible('#players-retry'), false, 'no button once plex.tv answered');
  assert.equal(await pinOpen(page), false);
  check('Q8 Q9 Try again');
});

playCase('Q5 Q6 a change to the servers shuts the open list, a change to anything else leaves it open, and the ticks made stay', { settings: seed({ servers: [{ id: 'second-srv', type: 'plex', url: 'http://127.0.0.1:1', token: 'second-token', name: 'Second' }] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await openSettings(page);
  await showList(page);
  await tick(page, 'Kids Room TV');
  assert.equal((await mock.plexTvLog()).length, 2, 'two accounts, two reads');

  // Another control: the list stays open, with its tick.
  await page.setChecked('#settings-form [name="keepAwake"]', false);
  await page.setChecked('#settings-form [name="hideCursor"]', false);
  await page.selectOption('#settings-form [name="weighting"]', 'unwatched');
  assert.equal(await listShown(page), true, 'a change that is not to the servers leaves the list open');
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.box]), [[KIDS.id, true], [LIVING.id, false], [TABLET.id, false]]);
  assert.equal((await mock.plexTvLog()).length, 2, 'and reads nothing');

  // A server's token typed: the list shuts, and the next opening reads the accounts as the sheet now holds them.
  await page.evaluate(() => { document.getElementById('manual-connection').open = true; });
  await page.fill('#settings-form [name="plexToken"]', 'demo-token-2');
  assert.equal(await listShown(page), false, 'a changed token shuts the list');
  assert.deepEqual(await rows(page), [], 'and nothing of the old account stays tickable');
  assert.equal(await page.textContent('#players-closed-note'), 'The servers changed, so the list was closed. Open it again to read the players.', 'and the section says why');
  assert.equal(await page.isVisible('#players-closed-note'), true);
  await showList(page);
  assert.equal(await page.textContent('#players-closed-note'), '', 'the line is gone once the list is open again');
  assert.equal(await page.isVisible('#players-closed-note'), false);
  const tokens = (await mock.plexTvLog()).slice(2).map((r) => r.token).sort();
  assert.deepEqual(tokens, ['demo-token-2', 'second-token'], 'read again, over the accounts as the sheet holds them');
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.box]), [[KIDS.id, true], [LIVING.id, false], [TABLET.id, false]], 'the tick made before the list shut is still there');

  // An address, a server removed, and the type.
  await page.getByRole('checkbox', { name: 'Allow Living Room TV' }).focus();
  await page.evaluate((url) => { // a change event that arrives while a control of the list has focus (the real sign-in flows are the cases below)
    const input = document.querySelector('#settings-form [name="serverUrl"]');
    input.value = url;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, `http://localhost:${app.mockPort}`);
  assert.equal(await listShown(page), false, 'a changed address shuts the list');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'players-open', 'and focus goes to the button that opens it, not to the page body');
  await showList(page);
  await page.getByRole('button', { name: 'Remove Second' }).click();
  assert.equal(await listShown(page), false, 'a removed server shuts the list');
  await showList(page);
  await page.locator('#settings-form input[name="serverTypePick"][value="jellyfin"]').check({ force: true });
  assert.equal(await listShown(page), false, 'a changed server type shuts the list');
  await cancel(page);
  assert.deepEqual(await storedList(page), [], 'and Cancel discards the ticks as ever');
  check('Q5 Q6 a server change shuts the list');
});

playCase('Q5b a server added in the sheet shuts the open list', { settings: seed() }, async ({ page, app }) => {
  await load(page, app);
  await openSettings(page);
  await showList(page);
  await page.evaluate(() => { document.getElementById('server-add').open = true; });
  await page.locator('#settings-form input[name="addTypePick"][value="jellyfin"]').check({ force: true });
  await page.fill('#add-address', `http://127.0.0.1:${app.jellyfinPort}`);
  await page.fill('#add-user', 'demo');
  await page.fill('#add-pass', 'demo-pass');
  await page.click('#add-mb-btn');
  await page.waitForFunction(() => document.getElementById('players-body').hidden, null, { timeout: 15000 });
  assert.deepEqual(await rows(page), []);
  check('Q5b an added server shuts the list');
});

playCase('Q10 each control is described by its state, and the state says what it means', { settings: seed({ allowedPlayers: [GARAGE] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await openSettings(page);
  await showList(page);
  assert.deepEqual(await described(page), [
    { control: 'Allow Kids Room TV', description: '' },
    { control: 'Allow Living Room TV', description: '' },
    { control: 'Allow Old Tablet', description: 'offline: not connected now, but it can still be allowed' },
    { control: 'Remove Garage TV from the allowed devices', description: 'unavailable: no longer on your Plex account' },
  ]);
  await cancel(page);
  await mock.plexTvSet(undefined, { status: 500 });
  await openSettings(page);
  await showList(page);
  assert.deepEqual(await described(page), [{ control: 'Remove Garage TV from the allowed devices', description: 'not checked: plex.tv could not be read' }]);
  assert.equal(await page.getByRole('button', { name: 'Remove Garage TV from the allowed devices' }).evaluate((el) => el.getAttribute('aria-describedby') !== null), true);
  check('Q10 described by state');
});

playCase('Q11 a redraw when plex.tv answers leaves focus on the same player\'s control', { settings: seed({ allowedPlayers: [LIVING, GARAGE] }) }, async ({ page, app, context }) => {
  await load(page, app);
  const release = await holdReads(context);
  const answered = page.waitForResponse((r) => RESOURCES.test(r.url()));
  answered.catch(() => {});
  await openSettings(page);
  await page.click('#players-open');
  await page.waitForFunction(() => /^Reading/.test(document.getElementById('players-status').textContent), null, { timeout: 5000 });
  await page.getByRole('button', { name: 'Remove Garage TV from the allowed devices' }).focus();
  release();
  await answered;
  await page.waitForFunction(() => document.querySelectorAll('#players-list input[type=checkbox]').length > 0, null, { timeout: 5000 });
  assert.equal(await activeName(page), 'Remove Garage TV from the allowed devices', 'focus is on the same player\'s control, not on the page body');

  // Reopened, with the answer listing the player: its row is now a tick, and the redraw keeps focus on that player's control.
  await cancel(page);
  const release2 = await holdReads(context);
  const answered2 = page.waitForResponse((r) => RESOURCES.test(r.url()));
  answered2.catch(() => {});
  await openSettings(page);
  await page.click('#players-open');
  await page.getByRole('button', { name: 'Remove Living Room TV from the allowed devices' }).focus();
  release2();
  await answered2;
  await page.waitForFunction(() => document.querySelectorAll('#players-list input[type=checkbox]').length > 0, null, { timeout: 5000 });
  assert.equal(await activeName(page), 'Allow Living Room TV', 'the same player: its row is now a tick');
  check('Q11 focus survives the redraw');
});

playCase('Q12 the "kept" words about stored devices are said only when something is stored', { settings: (app) => ({ serverType: 'jellyfin', plexToken: 'jf-demo-token', serverUrl: `http://127.0.0.1:${app.jellyfinPort}`, libraryKey: 'b0000000000000000000000000000001', libraryKeys: ['b0000000000000000000000000000001'], libraryNames: ['Movies'], rotateSeconds: 3600, showNowPlaying: false, unwatchedOnly: false, pixelShift: false }) }, async ({ page, app }) => {
  await load(page, app);
  await openSettings(page);
  await showList(page);
  assert.equal(await status(page), 'No Plex server is signed in on this display, so there are no Plex players to list.');
  assert.deepEqual(await rows(page), []);
  check('Q12 nothing stored, nothing said about it');
});

for (const [viewport, rotation] of [[{ width: 390, height: 844 }, 0], [{ width: 390, height: 844 }, 90], [{ width: 844, height: 390 }, 0], [{ width: 844, height: 390 }, 90]]) {
  playCase(`G10 a failure that lands below the fold is brought into the visible sheet at ${viewport.width}x${viewport.height} with the UI rotated ${rotation}`, { viewport, settings: seed({ rotation, allowedPlayers: [GARAGE, LIVING] }) }, async ({ page, app, mock }) => {
    await mock.plexTvSet(undefined, { status: 500 });
    await load(page, app);
    await openSettings(page);
    await page.evaluate(() => {
      const body = document.querySelector('#settings .sheet-body');
      body.scrollTop = body.scrollHeight; // the button at the foot of the sheet: what comes after it is below the fold
    });
    await page.click('#players-open');
    await listDrawn(page);
    await page.waitForFunction(() => !document.getElementById('players-retry').hidden, null, { timeout: 5000 });
    const where = await page.evaluate(() => {
      const body = document.querySelector('#settings .sheet-body').getBoundingClientRect();
      const inside = (el) => {
        const r = el.getBoundingClientRect();
        return r.top >= body.top - 1 && r.bottom <= body.bottom + 1 && r.left >= body.left - 1 && r.right <= body.right + 1;
      };
      return { focused: document.activeElement.id, status: inside(document.getElementById('players-status')), retry: inside(document.getElementById('players-retry')) };
    });
    assert.equal(['players-status', 'players-retry'].includes(where.focused), true, `focus is on the line or the button (${where.focused})`);
    assert.deepEqual([where.status, where.retry], [true, true], 'the line and "Try again" are inside the visible part of the sheet');
    check(`G10 visible at ${viewport.width}x${viewport.height} rotation ${rotation}`);
  });
}

// ---- r5: what an import does to an open list (D190), and a read that ends while focus is elsewhere ----

const MANY_PLAYERS = Array.from({ length: 12 }, (_, i) => ({ name: `Player ${i + 1}`, provides: 'player', presence: true, clientIdentifier: `many-${i + 1}` }));
const importFile = (page, settings) => page.setInputFiles('#import-file', { name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'plex-poster-display/settings', version: 1, settings })) });

playCase('T2 T3 an import that changes a server shuts the open list with the line and asks the PIN to open it again; the display\'s own list is untouched', { settings: seed({ ...withPin, allowedPlayers: [LIVING] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await openSettingsWithPin(page);
  await page.click('#players-open');
  await pinIs(page, true);
  await typePin(page, PIN);
  await pinIs(page, false);
  await listDrawn(page);
  await tick(page, 'Kids Room TV');
  await importFile(page, { serverType: 'plex', serverUrl: 'http://127.0.0.1:1', plexToken: 'imported-token', rotateSeconds: 120, allowedPlayers: [TABLET] });
  await pinIs(page, true); // an import is behind the PIN
  await typePin(page, PIN);
  await pinIs(page, false);
  await page.waitForFunction(() => document.getElementById('settings-form').elements.namedItem('rotateSeconds').value === '120', null, { timeout: 5000 });
  assert.equal(await listShown(page), false, 'the file changes the server: the list shuts');
  assert.deepEqual(await rows(page), [], 'and the old account\'s players cannot be ticked');
  assert.equal(await page.textContent('#players-closed-note'), MESSAGE, 'and the line says why, truly');
  await page.click('#players-open');
  await pinIs(page, true);
  assert.equal(await listShown(page), false, 'opening it again asks the PIN');
  await typePin(page, PIN);
  await pinIs(page, false);
  await listDrawn(page);
  assert.equal((await mock.plexTvLog()).slice(-1)[0].token, 'imported-token', 'and reads the account the file brought');
  await save(page);
  assert.deepEqual(await storedList(page), [LIVING, KIDS], 'saved as the sheet had it: the display\'s own list and the tick made before the import; the file\'s list (Old Tablet) is ignored');
  check('T2 T3 an import that changes a server shuts the list');
});

playCase('T2b an import of the display\'s own export, with the list open, leaves the list open with its ticks and says nothing', { settings: seed({ allowedPlayers: [LIVING] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await openSettings(page);
  await showList(page);
  await tick(page, 'Kids Room TV');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#export-btn')]);
  const own = readFileSync(await dl.path(), 'utf8');
  await page.setInputFiles('#import-file', { name: 'own.json', mimeType: 'application/json', buffer: Buffer.from(own) });
  await page.waitForFunction(() => /Settings imported/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  assert.equal(await listShown(page), true, 'no server changed: the list stays open');
  assert.equal(await page.textContent('#players-closed-note'), '');
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.box]), [[KIDS.id, true], [LIVING.id, true], [TABLET.id, false]], 'with its ticks');
  assert.equal((await mock.plexTvLog()).length, 1, 'and no new read');
  await save(page);
  assert.deepEqual(await storedList(page), [LIVING, KIDS]);
  check('T2b an import that changes nothing leaves the list open');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
  playCase(`J1 a read that ends while focus is on the server controls far above the section moves neither the sheet nor focus, at ${viewport.width}x${viewport.height}`, { viewport, settings: seed({ allowedPlayers: [GARAGE] }) }, async ({ page, app, mock, context }) => {
    await mock.plexTvSet(MANY_PLAYERS);
    await load(page, app);
    for (const [label, status] of [['a successful answer', 200], ['a failed answer', 500]]) {
      const release = await holdReads(context);
      const answered = page.waitForResponse((r) => RESOURCES.test(r.url()));
      answered.catch(() => {});
      await openSettings(page);
      await page.waitForFunction(() => /^✓/.test(document.getElementById('test-result').textContent), null, { timeout: 15000 }); // the connection test the sheet runs when it opens has finished: nothing above moves later
      await page.click('#players-open');
      await page.waitForFunction(() => /^Reading/.test(document.getElementById('players-status').textContent), null, { timeout: 5000 });
      await page.focus('#test-btn'); // at the top of the sheet, a long way above the section
      const before = await page.evaluate(() => ({ top: document.querySelector('#settings .sheet-body').scrollTop, active: document.activeElement.id }));
      assert.equal(before.active, 'test-btn');
      await mock.plexTvSet(status === 200 ? MANY_PLAYERS : undefined, { status });
      release();
      await answered;
      await page.waitForFunction((n) => document.querySelectorAll('#players-list > li').length >= n && !/^Reading/.test(document.getElementById('players-status').textContent), status === 200 ? 13 : 1, { timeout: 5000 });
      await frames(page, 2);
      const after = await page.evaluate(() => ({ top: document.querySelector('#settings .sheet-body').scrollTop, active: document.activeElement.id }));
      assert.deepEqual(after, before, `${label}: the sheet did not scroll and focus did not move`);
      await cancel(page);
    }
    check(`J1 focus elsewhere at ${viewport.width}x${viewport.height}`);
  });
}

// ---- r3: a real sign-in in the sheet, to each of its ends (D187 1, D189 1) ----

const PINS = /^https:\/\/plex\.tv\/api\/v2\/pins/;
const B_DEN = { name: 'B Den TV', provides: 'client,player', clientIdentifier: 'b-den', presence: true };
const serverB = (name, uri) => ({ name, provides: 'server', owned: true, clientIdentifier: `srv-${name}`, accessToken: 'demo-token', presence: true, connections: [{ uri, protocol: 'http', local: true, relay: false }] });
const MESSAGE = 'The servers changed, so the list was closed. Open it again to read the players.';

/**
 * Signs in to a second account (tok-B) in the sheet with the real flow: the plex.tv code is asked for and approved by the harness's pins route,
 * the account's resources come from the mock plex.tv, and the sheet then finds, reaches and tests a server. The list of the first account is
 * open and ticked before the sign-in starts. The pins handler is added here, and is not removed by a pattern the harness also uses.
 */
async function signInToSecondAccount({ page, context, mock }, resources) {
  await mock.plexTvSet(resources, { token: 'tok-B' });
  await context.route(PINS, (route) => {
    const headers = { 'access-control-allow-origin': '*' };
    const json = (body) => route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    return route.request().method() === 'POST' ? json({ id: 7, code: 'ABCD', expiresIn: 900, authToken: null }) : json({ id: 7, code: 'ABCD', authToken: 'tok-B' });
  });
  await page.click('#connected-change');
  await page.click('#signin-btn');
}
const afterSignIn = async (page, signal, timeout = 20000) => page.waitForFunction(signal, null, { timeout });
/** The sign-in has run to its end: the code panel came up (the code was asked for) and was put away again (a server was found, reached and tested). */
async function signInFinished(page) {
  await page.waitForFunction(() => !document.getElementById('signin-panel').hidden, null, { timeout: 20000 });
  await page.waitForFunction(() => document.getElementById('signin-panel').hidden, null, { timeout: 30000 });
}
const closedByTheServers = async (page) => {
  assert.equal(await listShown(page), false, 'the list is shut');
  assert.deepEqual(await rows(page), [], 'nothing of the first account stays tickable');
  assert.equal(await page.locator('#players-list input[type=checkbox]').count(), 0);
  assert.equal(await page.textContent('#players-closed-note'), MESSAGE, 'and it says why');
};
const openedFirst = async (page) => {
  await openSettings(page);
  await showList(page);
  await tick(page, 'Kids Room TV');
  assert.equal(await page.getByRole('checkbox', { name: 'Allow Kids Room TV' }).isChecked(), true);
};

playCase('S1 a sign-in to a second account that ends "no reachable servers" shuts the open list', { settings: seed() }, async (ctx) => {
  const { page, app, mock } = ctx;
  await load(page, app);
  await openedFirst(page);
  await signInToSecondAccount(ctx, [B_DEN]);
  await afterSignIn(page, () => /no reachable servers/.test(document.getElementById('signin-status').textContent));
  assert.equal(await page.inputValue('#settings-form [name="plexToken"]'), 'tok-B', 'the sheet holds the second account now');
  await closedByTheServers(page);
  await showList(page);
  assert.deepEqual((await rows(page)).map((r) => [r.id, r.box, r.state]), [['b-den', false, ''], [KIDS.id, null, 'unavailable']], 'opened again, it lists the second account\'s players, and the first account\'s Kids Room TV, ticked before, is kept as unavailable and cannot be ticked');
  assert.deepEqual((await mock.plexTvLog()).slice(-1).map((r) => r.token), ['tok-B']);
  check('S1 sign-in, no reachable servers');
});

playCase('S1b a sign-in to a second account whose server cannot be reached shuts the open list', { settings: seed() }, async (ctx) => {
  const { page, app } = ctx;
  await load(page, app);
  await openedFirst(page);
  await signInToSecondAccount(ctx, [B_DEN, serverB('Unreachable', 'http://127.0.0.1:1')]);
  await afterSignIn(page, () => /Couldn.t reach Unreachable/.test(document.getElementById('test-result').textContent));
  await closedByTheServers(page);
  check('S1b sign-in, server unreachable');
});

playCase('S2 a sign-in to a second account whose connection test fails shuts the open list', { settings: seed() }, async (ctx) => {
  const { page, app, context } = ctx;
  await load(page, app);
  await openedFirst(page);
  await context.route(new RegExp(`^http://127\\.0\\.0\\.1:${app.mockPort}/library/sections`), (route) => route.abort('failed'));
  await signInToSecondAccount(ctx, [B_DEN, serverB('Broken', `http://127.0.0.1:${app.mockPort}`)]);
  await afterSignIn(page, () => /^✗/.test(document.getElementById('test-result').textContent));
  assert.doesNotMatch(await page.textContent('#test-result'), /Couldn.t reach Broken/, 'the server answered; it is the test that failed');
  await closedByTheServers(page);
  check('S2 sign-in, test fails');
});

playCase('a successful sign-in to a second account shuts the open list, and opening it again reads the account the sheet now holds', { settings: seed() }, async (ctx) => {
  const { page, app, mock } = ctx;
  await load(page, app);
  await openedFirst(page);
  await signInToSecondAccount(ctx, [B_DEN, serverB('Second Plex', `http://127.0.0.1:${app.mockPort}`)]);
  await signInFinished(page);
  await closedByTheServers(page);
  await showList(page);
  assert.deepEqual((await mock.plexTvLog()).map((r) => r.token), ['demo-token', 'tok-B', 'demo-token'], 'the list was read for the first account, the sign-in then found the second account\'s servers, and the list read again for the token the sheet now holds');
  check('sign-in succeeds, the list shuts');
});

playCase('S2b choosing another server of the account whose test then fails shuts the open list', { settings: seed() }, async (ctx) => {
  const { page, app, context } = ctx;
  await load(page, app);
  await openSettings(page);
  await signInToSecondAccount(ctx, [B_DEN, serverB('First of B', `http://127.0.0.1:${app.mockPort}`), serverB('Second of B', `http://localhost:${app.mockPort}`)]);
  await signInFinished(page);
  await showList(page); // reads the account the sheet holds now
  await tick(page, 'Kids Room TV');
  await context.route(new RegExp(`^http://localhost:${app.mockPort}/library/sections`), (route) => route.abort('failed'));
  await page.selectOption('#server-select', '1');
  await afterSignIn(page, () => /^✗/.test(document.getElementById('test-result').textContent));
  assert.equal(await page.inputValue('#settings-form [name="serverUrl"]'), `http://localhost:${app.mockPort}`);
  await closedByTheServers(page);
  check('S2b another server, test fails');
});

// ---- r3: the focused control stays in the visible sheet after a redraw (D188, UX N1) ----

const MANY = Array.from({ length: 12 }, (_, i) => ({ name: `Player ${i + 1}`, provides: 'player', presence: true, clientIdentifier: `many-${i + 1}` }));
for (const [viewport, rotation] of [[{ width: 1280, height: 720 }, 0], [{ width: 390, height: 844 }, 0], [{ width: 390, height: 844 }, 90], [{ width: 844, height: 390 }, 90]]) {
  playCase(`S3 S4 the focused Remove is inside the visible sheet after the answer lands, at ${viewport.width}x${viewport.height} with the UI rotated ${rotation}`, { viewport, settings: seed({ rotation, allowedPlayers: [GARAGE] }) }, async ({ page, app, mock, context }) => {
    await mock.plexTvSet(MANY);
    await load(page, app);
    const inSheetBody = () => page.evaluate(() => {
      const body = document.querySelector('#settings .sheet-body').getBoundingClientRect();
      const r = document.activeElement.getBoundingClientRect();
      return { id: document.activeElement.getAttribute('aria-label') || document.activeElement.id, inside: r.top >= body.top - 1 && r.bottom <= body.bottom + 1 && r.left >= body.left - 1 && r.right <= body.right + 1 };
    });
    const remove = 'Remove Garage TV from the allowed devices';
    for (const [label, status] of [['a successful answer', 200], ['a failed answer', 500]]) {
      const release = await holdReads(context);
      const answered = page.waitForResponse((r) => RESOURCES.test(r.url()));
      answered.catch(() => {});
      await openSettings(page);
      await page.click('#players-open');
      await page.waitForFunction(() => /^Reading/.test(document.getElementById('players-status').textContent), null, { timeout: 5000 });
      await page.getByRole('button', { name: remove }).focus();
      assert.deepEqual(await inSheetBody(), { id: remove, inside: true }, `${label}: in view while it loads`);
      await mock.plexTvSet(status === 200 ? MANY : undefined, { status });
      release();
      await answered;
      await page.waitForFunction((n) => document.querySelectorAll('#players-list > li').length >= n && !/^Reading/.test(document.getElementById('players-status').textContent), status === 200 ? 13 : 1, { timeout: 5000 });
      assert.deepEqual(await inSheetBody(), { id: remove, inside: true }, `${label}: the focused control is inside the visible sheet body after the redraw`);
      await cancel(page);
    }
    check(`S3 S4 focus in view at ${viewport.width}x${viewport.height} rotation ${rotation}`);
  });
}

// ---- keyboard, accessible names, focus ring, fit ----

playCase('every control works from the keyboard, names the player it acts on, and shows a focus ring', { settings: seed({ allowedPlayers: [GARAGE] }) }, async ({ page, app }) => {
  await load(page, app);
  await openSettings(page);
  await page.focus('#players-open');
  const ring = () => page.evaluate(() => {
    const s = getComputedStyle(document.activeElement);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  const focused = () => page.evaluate(() => document.activeElement.getAttribute('aria-label') || document.activeElement.id);
  const showsRing = async () => {
    const r = await ring();
    return r.style !== 'none' && r.width > 0;
  };
  assert.equal(await showsRing(), true, 'the button that opens the list has a focus ring');
  await page.keyboard.press('Enter');
  await listDrawn(page);
  assert.equal(await focused(), 'players-status', 'focus stays in the section when the button goes away');

  await page.keyboard.press('Tab');
  assert.equal(await focused(), 'Allow Kids Room TV');
  assert.equal(await showsRing(), true, 'a tick has a focus ring');
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  assert.equal(await focused(), 'Allow Living Room TV');
  await page.keyboard.press('Tab');
  assert.equal(await focused(), 'Allow Old Tablet');
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  assert.equal(await focused(), 'Remove Garage TV from the allowed devices');
  assert.equal(await showsRing(), true, 'Remove has a focus ring');
  await page.keyboard.press('Enter');
  assert.deepEqual((await rows(page)).map((r) => r.id), [KIDS.id, LIVING.id, TABLET.id], 'Enter removes it');
  assert.equal(await focused(), 'Allow Old Tablet', 'focus goes to a neighbour, not back to the top of the sheet');
  await save(page);
  assert.deepEqual(await storedList(page), [KIDS, TABLET], 'ticked and removed from the keyboard alone, stored in the order allowed');
  check('keyboard, names, focus ring');
});

const LONG = [
  { name: 'The very long name of the television in the living room at the back of the house', provides: 'player', presence: true, clientIdentifier: 'long-1' },
  { name: 'W'.repeat(70), provides: 'player', presence: false, clientIdentifier: 'long-2' },
  { name: 'Den TV', provides: 'player', presence: true, clientIdentifier: 'den' },
];
for (const [viewport, rotation] of [[{ width: 390, height: 844 }, 0], [{ width: 390, height: 844 }, 90], [{ width: 844, height: 390 }, 0], [{ width: 844, height: 390 }, 90]]) {
  playCase(`the section fits the sheet at ${viewport.width}x${viewport.height} with the UI rotated ${rotation}: long names wrap, no sideways scroll`, { viewport, settings: seed({ rotation, allowedPlayers: [{ id: 'gone-long', name: 'G'.repeat(90) }] }) }, async ({ page, app, mock }) => {
    await mock.plexTvSet(LONG);
    await load(page, app);
    await openSettings(page);
    await showList(page);
    await page.locator('#players-fieldset').scrollIntoViewIfNeeded();
    const fit = await page.evaluate(() => {
      const body = document.querySelector('#settings .sheet-body');
      const section = document.getElementById('players-fieldset');
      const inner = [...section.querySelectorAll('.player-row, .player-name, .player-state, button, label')];
      return {
        bodyOverflow: body.scrollWidth - body.clientWidth,
        sectionOverflow: section.scrollWidth - section.clientWidth,
        inner: inner.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className || el.tagName),
        rows: document.querySelectorAll('#players-list > li').length,
      };
    });
    assert.equal(fit.bodyOverflow <= 0, true, `the sheet does not scroll sideways (${fit.bodyOverflow})`);
    assert.equal(fit.sectionOverflow <= 0, true, 'the section fits');
    assert.deepEqual(fit.inner, [], 'no row or control is wider than itself');
    assert.equal(fit.rows, 4);
    check(`fit ${viewport.width}x${viewport.height} rotation ${rotation}`);
  });
}

// ---- run ----

const WORKERS = Number(process.env.E2E_PLAY_WORKERS || 4);
const only = process.env.E2E_PLAY_ONLY ? new RegExp(process.env.E2E_PLAY_ONLY) : null;
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
  console.error(`${failures.length} of ${selected.length} play-now cases failed`);
  process.exit(1);
}
console.log(`all ${selected.length} play-now cases passed`);
