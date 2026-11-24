// Allowed devices and Play now (R-PLAY-1, R-CTRL-1, D65, D181, D186, D191): Settings, behind the PIN, lists the Plex players on the account and lets the owner allow each one
// for this display (cases P, Q, S, T, G, J below); the Play now control button then starts the title on screen on one of them (cases N, near the end). The list reads from the mock plex.tv (scripts/mock-plex.mjs, served to a context that opts in: withApp({ plexTv: true })), and a Play now's command is read from the mock server's player record (mock.playLog).
//
// Mock players: Living Room TV (mock-player-living-room), Kids Room TV (mock-player-kids-room), Old Tablet (mock-player-old-tablet, not present),
// and the account's server, which is not a player. A player's address is in TEST-NET-1 (192.0.2.x): the display must never request it.
//
// Every case has its own mock servers (serveArgs: []) and names pixelShift: false (convention 7). Nothing waits for a wall-clock time: every wait is on a
// state (a list drawn, a dialog closed, a request seen) with a bound, and a read that must still be loading is held by a route the case releases.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPinAuth } from '../../js/kiosk.js';
import { startMockPlex } from '../../scripts/mock-plex.mjs';
import { freePort, makeMock, withApp } from './lib.mjs';

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

// D199: the household's own Plex server is asked for the players it lists itself (GET /clients), and they join what plex.tv lists.
playCase('a player the Plex server lists itself is listed though plex.tv lists none, and a server that cannot be asked leaves plex.tv\'s list (D199)', { settings: seed() }, async ({ page, app, mock }) => {
  const helpShown = () => page.evaluate(() => !document.getElementById('players-none-help').hidden);
  try {
    await mock.plexTvSet([{ name: 'Hall TV', provides: 'client,player', presence: false, clientIdentifier: 'hall' }]);
    await mock.clientsSet([
      { name: 'Den HTPC', product: 'Plex HTPC', machineIdentifier: 'den-htpc', protocolCapabilities: 'timeline,playback,navigation,playqueues' },
      { name: 'Hall TV as the server names it', machineIdentifier: 'hall', protocolCapabilities: 'playback' },
      { name: 'Cannot play', machineIdentifier: 'nav-only', protocolCapabilities: 'timeline,navigation' },
    ]);
    await load(page, app);
    await openSettings(page);
    await showList(page);
    assert.deepEqual((await rows(page)).map((r) => [r.id, r.name, r.state]), [['den-htpc', 'Den HTPC', ''], ['hall', 'Hall TV', '']], 'the server\'s player is added, and the one plex.tv calls offline is present');
    assert.match(await status(page), /^Tick a player to allow it\./);
    assert.equal(await helpShown(), false, 'the words for an empty list are not shown');
    await cancel(page);
    await mock.plexTvSet([]);
    await mock.clientsSet([], { status: 500 });
    await openSettings(page);
    await showList(page);
    assert.match(await status(page), /lists no players on your account/);
    assert.deepEqual(await rows(page), [], 'a server that cannot be asked adds nothing and fails nothing');
    assert.equal(await helpShown(), true, 'the empty list says which Plex apps can be listed');
    check('D199 the server\'s own players');
  } finally {
    await mock.clientsSet([]);
  }
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

// ================= Play now (R-PLAY-1, R-CTRL-1; D181, D191): the button, the flow and the command =================
//
// The page is the pinned poster "Velvet Curtain" (title 3, PG-13) unless a case says otherwise, so the title on screen is the one the case knows. A case
// presses the real button (a mouse click or the arrow keys and Enter), goes through the real PIN prompt and the real dialog, and reads what the mock Plex's
// players received (mock.playLog). Nothing waits for a wall-clock time: every wait is on a state (a dialog open, a toast, a record) with a bound, a read that
// must still be out is held by a route the case releases, and time that matters (a slot boundary, a rotation) is the fake clock's.

const PLAY = '[data-action="playnow"]';
const JF_MOVIES = 'b' + '0'.repeat(30) + '1';
const SERVER_TOKEN = 'demo-token';
const TITLES = ['The Grand Marquee', 'Midnight Projector', 'Velvet Curtain', 'Popcorn Skies', 'Neon Matinee', 'Last Reel', 'Silver Screen Serenade', 'Encore'];

const playSeed = (extra = {}) => (app) => ({
  plexToken: SERVER_TOKEN,
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  serverId: 'mock',
  libraryKey: '1',
  unwatchedOnly: false,
  showNowPlaying: false,
  rotateSeconds: 3600,
  pixelShift: false,
  staticRatingKey: '3',
  staticTitle: 'Velvet Curtain',
  serverName: 'Mock Plex',
  allowedPlayers: [LIVING],
  ...extra,
});

const buttonShown = (page) => page.evaluate((sel) => document.querySelector(sel) !== null, PLAY); // the button is in the row only while it may be used
const buttonBusy = (page) => page.evaluate((sel) => document.querySelector(sel)?.getAttribute('aria-disabled') === 'true', PLAY);
const idle = (page) => page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('aria-disabled') !== 'true', PLAY, { timeout: 10000 });
const buttonShownWait = (page, want) => page.waitForFunction(([sel, w]) => (document.querySelector(sel) !== null) === w, [PLAY, want], { timeout: 10000 });
const activeAction = (page) => page.evaluate(() => document.activeElement?.dataset?.action ?? '');
const activeTitle = (page) => page.evaluate(() => (document.querySelector('.poster-layer.active')?.alt || '').replace(/^Poster: /, ''));
const toastWait = (page, re) => page.waitForFunction(({ src }) => { const t = document.getElementById('toast'); return !t.hidden && new RegExp(src).test(t.textContent); }, { src: re.source }, { timeout: 10000 });
const toastText = (page) => page.evaluate(() => (document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent));
/** The real button, pressed with the mouse: the pointer wakes the controls, then the click lands on it. */
async function pressPlay(page) {
  await page.evaluate(() => (document.getElementById('toast').hidden = true)); // a toast of an earlier step may sit over the row
  await page.locator(PLAY).click();
}
const dialogIs = (page, want) => page.waitForFunction((w) => document.getElementById('play-now').open === w, want, { timeout: 10000 });
const dialogRows = (page) =>
  page.$$eval('#play-now-devices > li', (lis) =>
    lis.map((li) => {
      const b = li.querySelector('button');
      return { name: b.textContent, disabled: b.getAttribute('aria-disabled') === 'true', label: b.getAttribute('aria-label'), state: li.querySelector('.player-state')?.textContent ?? '', described: b.getAttribute('aria-describedby') ? document.getElementById(b.getAttribute('aria-describedby')).textContent : '' };
    }),
  );
const pickDevice = (page, title, device) => page.getByRole('button', { name: `Play "${title}" on ${device}` }).click();
const commandsOf = async (mock) => (await mock.playLog()).commands;
const plain = (text) => {
  assert.doesNotMatch(text, /\b\d{3}\b/, `no status code: ${text}`);
  assert.doesNotMatch(text, /http|cors|token|:\/\/|127\.0\.0\.1|192\.0\.2|status/i, `no protocol word, address or token: ${text}`);
};
/** Holds the page's plex.tv read until `release()`: the answer is the mock's, as the harness gives it. */
async function holdPlexTv(page, mockPort) {
  let open;
  const gate = new Promise((resolve) => (open = resolve));
  let seen = 0;
  await page.context().route(RESOURCES, async (route) => {
    seen++;
    await gate;
    const params = new URL(route.request().url()).searchParams;
    const q = new URLSearchParams({ token: params.get('X-Plex-Token') || '', client: params.get('X-Plex-Client-Identifier') || '' });
    const answer = await fetch(`http://127.0.0.1:${mockPort}/__mock/plextv-resources?${q}`);
    await route.fulfill({ status: answer.status, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: await answer.text() });
  });
  return { release: open, reads: () => seen };
}
const focusedInView = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    const r = el.getBoundingClientRect();
    const d = document.getElementById('play-now').getBoundingClientRect();
    const dialog = document.getElementById('play-now');
    return {
      inWindow: r.top >= -0.5 && r.left >= -0.5 && r.bottom <= window.innerHeight + 0.5 && r.right <= window.innerWidth + 0.5,
      inDialog: !dialog.open || (r.top >= d.top - 1 && r.left >= d.left - 1 && r.bottom <= d.bottom + 1 && r.right <= d.right + 1),
      what: `${el.tagName} ${el.textContent.trim().slice(0, 30)}`,
    };
  });

// ---- the button ----

playCase('N1 the button is there for a Plex movie while a device is allowed, named for the title, and has no shortcut', { settings: playSeed() }, async ({ page, app, mock }) => {
  await load(page, app);
  assert.equal(await buttonShown(page), true);
  assert.equal(await page.getAttribute(PLAY, 'aria-label'), 'Play "Velvet Curtain" now');
  assert.equal(await page.textContent(`${PLAY} .label`), 'Play now');
  assert.deepEqual(await page.$$eval('#controls button', (bs) => bs.map((b) => b.dataset.action)), ['settings', 'diagnostics', 'refresh', 'pause', 'pin', 'playnow', 'rotate', 'fullscreen'], 'one of the control buttons, between Pin and Rotate');
  // No keyboard shortcut: no key starts it, and the shortcuts dialog does not list it.
  for (const key of ['n', 'l', 'y', 'Enter', 'u', 'm']) await page.keyboard.press(key);
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open || document.getElementById('pin-dialog').open), false);
  await page.keyboard.press('?');
  await page.waitForFunction(() => document.getElementById('shortcuts').open, null, { timeout: 5000 });
  assert.doesNotMatch(await page.textContent('#shortcuts-list'), /play now/i);
  assert.equal((await mock.playLog()).received, 0, 'nothing was asked of the server');
  check('N1 the button, named for the title, no shortcut');
});

playCase('N2 the button is hidden while no device is allowed, and appears when Settings allows one', { settings: playSeed({ allowedPlayers: [] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  assert.equal(await buttonShown(page), false);
  assert.equal(await page.isVisible(PLAY), false);
  assert.equal(await page.$$eval('#controls button', (bs) => bs.length), 7, 'the row is the seven buttons it always was');
  await openSettings(page);
  await showList(page);
  await tick(page, 'Living Room TV');
  await save(page);
  assert.equal(await buttonShown(page), true, 'the allowed device is saved, so the button is there');
  await page.evaluate((s) => { const k = 'plexPoster.settings'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k)), ...s })); }, { allowedPlayers: [] });
  await pressPlay(page); // the button is still drawn until the page next syncs: a press with no device allowed does nothing
  assert.equal((await mock.playLog()).received, 0);
  check('N2 hidden with no device, shown once one is allowed');
});

for (const kind of ['show', 'season']) {
  playCase(`N3 the button is hidden on a ${kind} poster`, { settings: playSeed() }, async ({ page, app, mock }) => {
    await mock.post('kind', { ratingKey: '3', type: kind });
    await load(page, app);
    assert.equal(await activeTitle(page), 'Velvet Curtain');
    assert.equal(await buttonShown(page), false);
    check(`N3 no button on a ${kind}`);
  });
}

playCase('N4 the button is hidden on the now-playing poster and is back when a random poster is shown again', { settings: playSeed({ staticRatingKey: '', staticTitle: '', showNowPlaying: true, nowPlayingPollSeconds: 5, showPlayer: true }) }, async ({ page, app, mock }) => {
  await mock.play('3');
  await load(page, app);
  await page.waitForFunction(() => !document.getElementById('player-label').hidden, null, { timeout: 15000 });
  assert.equal(await buttonShown(page), false, 'the now-playing poster');
  await mock.stop();
  await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
  await page.waitForFunction(() => document.getElementById('player-label').hidden, null, { timeout: 15000 });
  await buttonShownWait(page, true);
  check('N4 no button on the now-playing poster');
});

playCase('N5 the button is hidden on a Jellyfin poster', { plexTv: false, settings: (app) => ({ serverType: 'jellyfin', plexToken: 'jf-demo-token', serverUrl: `http://127.0.0.1:${app.jellyfinPort}`, libraryKey: JF_MOVIES, libraryKeys: [JF_MOVIES], libraryNames: ['Movies'], rotateSeconds: 3600, showNowPlaying: false, unwatchedOnly: false, pixelShift: false, allowedPlayers: [LIVING] }) }, async ({ page, app }) => {
  await load(page, app);
  assert.equal(await buttonShown(page), false);
  check('N5 no button on a Jellyfin poster');
});

playCase('N6 the button is hidden on an Emby poster', { plexTv: false, settings: (app) => ({ serverType: 'emby', plexToken: 'emby-demo-token', serverUserId: '8' + '0'.repeat(30) + '1', serverUrl: `http://127.0.0.1:${app.jellyfinPort}`, libraryKey: JF_MOVIES, libraryKeys: [JF_MOVIES], libraryNames: ['Movies'], rotateSeconds: 3600, showNowPlaying: false, unwatchedOnly: false, pixelShift: false, allowedPlayers: [LIVING] }) }, async ({ page, app }) => {
  await load(page, app);
  assert.equal(await buttonShown(page), false);
  check('N6 no button on an Emby poster');
});

playCase('N7 an episode is played by its own key, not its series\'', { settings: playSeed({ staticRatingKey: '2', staticTitle: 'Midnight Projector' }) }, async ({ page, app, mock }) => {
  await mock.post('episode', { ratingKey: '2' });
  await load(page, app);
  assert.equal(await buttonShown(page), true, 'an episode from a Plex server has the button');
  await pressPlay(page);
  await toastWait(page, /^Playing "Midnight Projector" on Living Room TV\./);
  const [command] = await commandsOf(mock);
  assert.equal(command.key, '/library/metadata/502', 'the episode\'s own key (the series is 2)');
  check('N7 an episode plays by its own key');
});

// ---- the arrow keys, and kiosk mode ----

playCase('N8 the button is reachable by the arrow keys in the row\'s order, and Enter on it starts Play now', { settings: playSeed() }, async ({ page, app, mock }) => {
  await load(page, app);
  const order = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('ArrowRight');
    order.push(await activeAction(page));
  }
  assert.deepEqual(order, ['settings', 'diagnostics', 'refresh', 'pause', 'pin', 'playnow', 'rotate', 'fullscreen']);
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowLeft');
  assert.equal(await activeAction(page), 'playnow', 'and back by ArrowLeft');
  await page.keyboard.press('Enter');
  await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV\./);
  assert.equal((await commandsOf(mock)).length, 1);
  check('N8 arrow keys reach the button; Enter plays');
});

playCase('N9 with no device allowed the arrow keys skip it (it is not there)', { settings: playSeed({ allowedPlayers: [] }) }, async ({ page, app }) => {
  await load(page, app);
  const order = [];
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('ArrowRight');
    order.push(await activeAction(page));
  }
  assert.deepEqual(order, ['settings', 'diagnostics', 'refresh', 'pause', 'pin', 'rotate', 'fullscreen']);
  check('N9 the arrow keys skip a hidden button');
});

playCase('N10 kiosk mode: the button is as unreachable as the other control buttons', { settings: playSeed({ kioskMode: true }) }, async ({ page, app }) => {
  await load(page, app);
  assert.equal(await page.evaluate((sel) => document.querySelector(sel).closest('#controls').inert, PLAY), true);
  await page.keyboard.press('Tab');
  assert.notEqual(await activeAction(page), 'playnow');
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open), false);
  check('N10 kiosk: inert with the other buttons');
});

// ---- the flow ----

playCase('N11 one allowed device, present, nothing saved: one press sends straight to it, with the server\'s own sign-in and no token for the player', { settings: playSeed() }, async ({ page, app, mock }) => {
  const seen = { play: [], players: [], plexTv: 0 };
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/player/playback/playMedia') seen.play.push({ url: u, headers: r.headers() });
    if (/^192\.0\.2\./.test(u.hostname)) seen.players.push(r.url());
    if (u.hostname === 'plex.tv') seen.plexTv++;
  });
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  await load(page, app);
  await mock.post('reset-stats');
  await pressPlay(page);
  await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV\.$/);
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open), false, 'no dialog');
  const { commands, received } = await mock.playLog();
  assert.equal(received, 1);
  assert.equal(commands.length, 1);
  const [c] = commands;
  assert.equal(c.key, '/library/metadata/3');
  assert.equal(c.offset, 0);
  assert.equal(c.machineIdentifier, 'mock', 'the server\'s own identifier');
  assert.equal(c.target, LIVING.id, 'the picked device\'s client identifier');
  assert.equal(c.address, '127.0.0.1');
  assert.equal(c.port, String(app.mockPort));
  assert.equal(c.protocol, 'http');
  assert.equal(c.tokenLike, false, 'nothing token-like went to the player');
  assert.equal(c.tokenParams, 1, 'the one token is the server\'s sign-in');
  assert.equal(JSON.stringify(c).includes(SERVER_TOKEN), false);
  assert.equal(seen.play.length, 1);
  assert.equal(seen.play[0].url.origin, `http://127.0.0.1:${app.mockPort}`, 'to the poster\'s own server');
  assert.equal(seen.play[0].url.searchParams.get('X-Plex-Token'), SERVER_TOKEN);
  assert.equal(seen.play[0].headers['x-plex-token'], undefined);
  assert.deepEqual(seen.players, [], 'no player address was requested');
  assert.equal((await mock.plexTvLog()).length, 1, 'plex.tv was read once for the press');
  const log = (await mock.get('log')).requests;
  assert.equal(log.filter((r) => r.startsWith('/library/metadata/3')).length, 1, 'the saved position was read once');
  assert.equal(logs.some((l) => l.includes(SERVER_TOKEN)), false, 'no token in the page\'s log');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.action ?? ''), 'playnow', 'focus stays on the button');
  check('N11 straight to the one device');
});

playCase('N12 two allowed devices: a menu by name in number order, the title named, and only an allowed device is offered or sent to; the keyboard picks', { settings: playSeed({ allowedPlayers: [KIDS, LIVING] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await pressPlay(page);
  await dialogIs(page, true);
  assert.match(await page.textContent('#play-now-lead'), /^Play "Velvet Curtain" on which device\?$/);
  assert.equal(await page.evaluate(() => document.getElementById('play-now-note').hidden), true, 'plex.tv was read: nothing to say about it');
  assert.equal(await page.isVisible('#play-now-start'), false, 'nothing saved: no choice of where to start');
  const rows = await dialogRows(page);
  assert.deepEqual(rows.map((r) => r.name), ['Kids Room TV', 'Living Room TV'], 'Old Tablet is plex.tv\'s but not allowed: never offered');
  assert.deepEqual(rows.map((r) => r.label), ['Play "Velvet Curtain" on Kids Room TV', 'Play "Velvet Curtain" on Living Room TV']);
  assert.equal(await page.evaluate(() => document.getElementById('play-now').getAttribute('aria-labelledby')), 'play-now-title');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Kids Room TV', 'focus starts on the first device that can be picked');
  assert.deepEqual(await commandsOf(mock), [], 'nothing is sent by opening it');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await dialogIs(page, false);
  await toastWait(page, /^Playing "Velvet Curtain" on Kids Room TV\.$/);
  const commands = await commandsOf(mock);
  assert.deepEqual(commands.map((c) => c.target), [KIDS.id]);
  assert.equal(await activeAction(page), 'playnow', 'focus is back on the button');
  check('N12 the menu, the keyboard, the right device');
});

playCase('N13 an offline or gone device is listed, disabled, with its state and what it means, and cannot be picked', { settings: playSeed({ allowedPlayers: [LIVING, TABLET, GARAGE] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await pressPlay(page);
  await dialogIs(page, true);
  const rows = await dialogRows(page);
  assert.deepEqual(rows.map((r) => [r.name, r.disabled]), [['Garage TV', true], ['Living Room TV', false], ['Old Tablet', true]]);
  assert.match(rows[0].state, /^unavailable: no longer on your Plex account$/);
  assert.match(rows[2].state, /^offline: not connected now/);
  assert.equal(rows[0].described, rows[0].state, 'read out with the control');
  assert.equal(rows[2].described, rows[2].state);
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Living Room TV', 'focus starts on one that can be picked');
  await page.getByRole('button', { name: 'Play "Velvet Curtain" on Old Tablet' }).click({ force: true });
  await page.getByRole('button', { name: 'Play "Velvet Curtain" on Garage TV' }).click({ force: true });
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open), true, 'a press on one that cannot be picked changes nothing');
  assert.deepEqual(await commandsOf(mock), []);
  await pickDevice(page, 'Velvet Curtain', 'Living Room TV');
  await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV\./);
  assert.deepEqual((await commandsOf(mock)).map((c) => c.target), [LIVING.id]);
  check('N13 offline and gone devices cannot be picked');
});

playCase('N14 one allowed device that cannot be picked: the dialog shows it with its reason and Cancel; nothing is sent', { settings: playSeed({ allowedPlayers: [TABLET] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await pressPlay(page);
  await dialogIs(page, true);
  const rows = await dialogRows(page);
  assert.deepEqual(rows.map((r) => [r.name, r.disabled]), [['Old Tablet', true]]);
  assert.match(rows[0].state, /offline/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'play-now-cancel', 'nothing can be picked: focus starts on Cancel');
  await page.click('#play-now-cancel');
  await dialogIs(page, false);
  assert.deepEqual(await commandsOf(mock), []);
  check('N14 a single device that cannot be picked');
});

playCase('N15 a saved position: one step offers resume at that time or play from the start; resume sends the position in ms, from the start sends 0', { settings: playSeed() }, async ({ page, app, mock }) => {
  await mock.post('offset', { ratingKey: '3', viewOffset: 3_723_000 });
  await load(page, app);
  await pressPlay(page);
  await dialogIs(page, true);
  assert.equal(await page.isVisible('#play-now-start'), true);
  assert.equal(await page.getByRole('radio', { name: 'Resume at 1:02:03' }).isChecked(), true, 'resume is the default and is shown as a time');
  assert.equal(await page.getByRole('radio', { name: 'Play from the start' }).isChecked(), false);
  assert.deepEqual((await dialogRows(page)).map((r) => r.name), ['Living Room TV'], 'one device and a saved position: still one step');
  await pickDevice(page, 'Velvet Curtain', 'Living Room TV');
  await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV, from 1:02:03\.$/);
  assert.deepEqual((await commandsOf(mock)).map((c) => c.offset), [3_723_000]);
  await pressPlay(page);
  await dialogIs(page, true);
  await page.getByRole('radio', { name: 'Play from the start' }).check();
  await pickDevice(page, 'Velvet Curtain', 'Living Room TV');
  await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV\.$/);
  assert.deepEqual((await commandsOf(mock)).map((c) => c.offset), [3_723_000, 0]);
  // The next opening starts at the saved position again, whatever was chosen last.
  await pressPlay(page);
  await dialogIs(page, true);
  assert.equal(await page.getByRole('radio', { name: 'Resume at 1:02:03' }).isChecked(), true);
  await page.click('#play-now-cancel');
  await dialogIs(page, false);
  // Nothing saved: no choice is offered.
  await mock.post('offset', { ratingKey: '3', viewOffset: 0 });
  await pressPlay(page);
  await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV\.$/);
  assert.equal((await commandsOf(mock)).length, 3);
  check('N15 resume and play from start');
});

for (const [status, words] of [[500, /^Could not read the players of Mock Plex: plex\.tv had a problem and could not answer\. Try again later\. These devices are not checked, so you can still pick one\.$/], [401, /^Could not read the players of Mock Plex: plex\.tv refused the sign-in\. Sign in to Mock Plex again in Settings\. These devices are not checked, so you can still pick one\.$/], [200, /^Could not read the players of Mock Plex: plex\.tv answered with something that could not be read\. These devices are not checked/]]) {
  playCase(`N16 plex.tv cannot be read (${status === 200 ? 'not a list' : status}): the dialog, the device "not checked" and pickable, even for one device; picking it sends`, { settings: playSeed() }, async ({ page, app, mock }) => {
    if (status === 200) await mock.plexTvSet({ not: 'a list' });
    else await mock.plexTvSet(undefined, { status });
    await load(page, app);
    await pressPlay(page);
    await dialogIs(page, true);
    assert.match(await page.textContent('#play-now-note'), words);
    assert.equal(await page.getAttribute('#play-now-note', 'role'), 'status');
    const [row] = await dialogRows(page);
    assert.deepEqual([row.name, row.disabled, row.state], ['Living Room TV', false, 'not checked: plex.tv could not be read']);
    assert.deepEqual(await commandsOf(mock), [], 'never straight through');
    await pickDevice(page, 'Velvet Curtain', 'Living Room TV');
    await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV\./);
    assert.deepEqual((await commandsOf(mock)).map((c) => c.target), [LIVING.id]);
    check(`N16 plex.tv ${status}: the dialog, not checked, pickable`);
  });
}

// ---- Cancel and Escape ----

for (const how of ['Cancel', 'Escape']) {
  playCase(`N17 ${how} sends nothing and puts focus back on the button`, { settings: playSeed({ allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
    await load(page, app);
    await pressPlay(page);
    await dialogIs(page, true);
    if (how === 'Cancel') await page.click('#play-now-cancel');
    else await page.keyboard.press('Escape');
    await dialogIs(page, false);
    assert.equal(await activeAction(page), 'playnow');
    assert.deepEqual(await commandsOf(mock), []);
    assert.equal(await buttonBusy(page), false, 'the button is free again');
    assert.equal(await toastText(page), '', 'nothing is said');
    // It can be opened again, and picked.
    await pressPlay(page);
    await dialogIs(page, true);
    await pickDevice(page, 'Velvet Curtain', 'Kids Room TV');
    await toastWait(page, /^Playing "Velvet Curtain" on Kids Room TV\./);
    assert.equal((await commandsOf(mock)).length, 1);
    check(`N17 ${how}: nothing sent, focus back`);
  });
}

playCase('N17b focus goes back to the button even when it was not the focused element when the dialog opened (a tap that did not focus it)', { settings: playSeed({ allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app }) => {
  await load(page, app);
  const held = await holdPlexTv(page, app.mockPort);
  await pressPlay(page);
  await page.waitForFunction(() => document.querySelector('[data-action="playnow"]')?.getAttribute('aria-disabled') === 'true', null, { timeout: 5000 });
  await page.mouse.click(8, 8); // a click on the bare stage: the focus leaves the button
  assert.equal(await activeAction(page), '', 'the button no longer has focus');
  held.release();
  await dialogIs(page, true);
  await page.keyboard.press('Escape');
  await dialogIs(page, false);
  assert.equal(await activeAction(page), 'playnow', 'focus is on the button again');
  check('N17b focus back on the button');
});

playCase('N18 the dialog traps focus: Tab and Shift+Tab stay inside, the arrow keys do not move the controls behind it', { settings: playSeed({ allowedPlayers: [LIVING, KIDS, TABLET] }) }, async ({ page, app }) => {
  await load(page, app);
  await pressPlay(page);
  await dialogIs(page, true);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.getElementById('play-now').contains(document.activeElement)), true, `Tab ${i}`);
  }
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.getElementById('play-now').contains(document.activeElement)), true, `Shift+Tab ${i}`);
  }
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.getElementById('play-now').contains(document.activeElement)), true);
  assert.equal(await page.evaluate(() => document.getElementById('play-now').matches(':modal')), true, 'a modal dialog: the controls behind it are out of reach');
  check('N18 focus is trapped');
});

// ---- the PIN ----

playCase('N19 a PIN set: asked first, before any read and before any device is shown; wrong or cancelled sends nothing and shows no device; the right PIN goes on, every time', { settings: playSeed({ ...withPin, allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await mock.post('reset-stats');
  await pressPlay(page);
  await pinIs(page, true);
  assert.equal(await pinOpen(page), true);
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open), false, 'no device is shown before the PIN');
  assert.deepEqual(await mock.plexTvLog(), [], 'plex.tv is not read before the PIN');
  assert.deepEqual((await mock.get('log')).requests, [], 'no request of any kind before the PIN');
  await page.click('#pin-cancel');
  await pinIs(page, false);
  assert.deepEqual([await mock.plexTvLog(), (await mock.get('log')).requests, await commandsOf(mock)], [[], [], []], 'a cancelled PIN: nothing');
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open), false);
  await pressPlay(page);
  await pinIs(page, true);
  await typePin(page, '1111');
  await page.waitForFunction(() => /Wrong PIN/.test(document.getElementById('pin-error').textContent), null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open), false, 'a wrong PIN shows no device');
  assert.deepEqual(await mock.plexTvLog(), []);
  await typePin(page, PIN);
  await pinIs(page, false);
  await dialogIs(page, true);
  assert.deepEqual((await dialogRows(page)).map((r) => r.name), ['Kids Room TV', 'Living Room TV']);
  await pickDevice(page, 'Velvet Curtain', 'Living Room TV');
  await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV\./);
  assert.equal((await commandsOf(mock)).length, 1);
  // Every time.
  await pressPlay(page);
  await pinIs(page, true);
  await page.click('#pin-cancel');
  assert.equal((await commandsOf(mock)).length, 1);
  check('N19 the PIN comes first, every time');
});

playCase('N20 no PIN set, no prompt', { settings: playSeed() }, async ({ page, app, mock }) => {
  await load(page, app);
  await pressPlay(page);
  await toastWait(page, /^Playing "Velvet Curtain"/);
  assert.equal(await pinOpen(page), false);
  assert.equal((await commandsOf(mock)).length, 1);
  check('N20 no PIN, no prompt');
});

// ---- the limit ----

playCase('N21 a title the limit refuses (a pinned one, above the limit): said in words, with no PIN prompt, no plex.tv read and no request at all', { settings: playSeed({ ...withPin, maxContentRating: 'PG', allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  assert.equal(await activeTitle(page), 'Velvet Curtain', 'the pinned PG-13 title is shown above the PG limit (D5)');
  assert.equal(await buttonShown(page), true);
  await mock.post('reset-stats');
  await pressPlay(page);
  await toastWait(page, /^"Velvet Curtain" is rated above this display's limit, so it can't be played from here\.$/);
  assert.equal(await pinOpen(page), false, 'no PIN prompt for a title that cannot be played');
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open), false);
  assert.deepEqual(await mock.plexTvLog(), []);
  assert.deepEqual((await mock.get('log')).requests, [], 'no request to the server');
  assert.deepEqual(await mock.playLog(), { commands: [], received: 0 });
  plain(await toastText(page));
  check('N21 a refused title: nothing at all');
});

playCase('N22 under a limit an unrated title is refused; with no limit it plays', { settings: playSeed({ maxContentRating: 'R', staticRatingKey: '8', staticTitle: 'Encore' }) }, async ({ page, app, mock }) => {
  await load(page, app);
  assert.equal(await activeTitle(page), 'Encore');
  await mock.post('reset-stats');
  await pressPlay(page);
  await toastWait(page, /^"Encore" has no rating this display can read, and a rating limit is set, so it can't be played from here\.$/);
  assert.deepEqual((await mock.get('log')).requests, []);
  assert.equal((await mock.playLog()).received, 0);
  await page.evaluate(() => { const k = 'plexPoster.settings'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k)), maxContentRating: '' })); });
  await page.reload();
  await posterShown(page);
  await pressPlay(page);
  await toastWait(page, /^Playing "Encore" on Living Room TV\./);
  assert.equal((await commandsOf(mock)).length, 1, 'no limit: everything plays');
  check('N22 unrated: refused under a limit, plays without one');
});

playCase('N23 the limit in force is the time slot\'s, not the household\'s own value: a stricter slot refuses, a looser one allows', { settings: playSeed({ staticRatingKey: '4', staticTitle: 'Popcorn Skies', maxContentRating: 'G', limitSlots: [{ start: '06:00', limit: 'G' }, { start: '15:00', limit: 'R' }, { start: '22:00', limit: '' }] }), clock: { time: '2026-01-05T16:00:00' } }, async ({ page, app, mock }) => {
  await load(page, app);
  assert.equal(await activeTitle(page), 'Popcorn Skies');
  await pressPlay(page);
  await toastWait(page, /^Playing "Popcorn Skies" on Living Room TV\./);
  assert.equal((await commandsOf(mock)).length, 1, 'the R slot is in force: an R title plays although the household value is G');
  await page.clock.setSystemTime(new Date('2026-01-06T07:00:00'));
  await page.clock.runFor(2000);
  await page.evaluate(() => (document.getElementById('toast').hidden = true));
  assert.equal(await buttonShown(page), true, 'the pinned poster stays (D5)');
  await pressPlay(page);
  await toastWait(page, /^"Popcorn Skies" is rated above this display's limit/);
  assert.equal((await commandsOf(mock)).length, 1, 'the G slot is in force: refused');
  check('N23 the slot in force decides');
});

playCase('N24 the limit tightens between the press and the send (a slot boundary): nothing is sent', { settings: playSeed({ staticRatingKey: '4', staticTitle: 'Popcorn Skies', maxContentRating: 'PG-13', allowedPlayers: [LIVING, KIDS], limitSlots: [{ start: '06:00', limit: 'G' }, { start: '15:00', limit: 'PG-13' }, { start: '22:00', limit: '' }] }), clock: { time: '2026-01-05T05:59:00' } }, async ({ page, app, mock }) => {
  await load(page, app);
  assert.equal(await activeTitle(page), 'Popcorn Skies');
  await pressPlay(page);
  await dialogIs(page, true);
  await page.clock.setSystemTime(new Date('2026-01-05T06:00:30')); // the G slot begins while the dialog is open
  await pickDevice(page, 'Popcorn Skies', 'Kids Room TV');
  await dialogIs(page, false);
  await toastWait(page, /^"Popcorn Skies" is rated above this display's limit/);
  assert.deepEqual(await commandsOf(mock), [], 'the limit in force when sending refused it');
  assert.equal(await activeAction(page), 'playnow');
  check('N24 the send re-checks the limit in force');
});

// ---- the allowed list, the title pressed, one at a time, late answers ----

playCase('N25 a device removed from the allowed list while the dialog is open is not sent to; the other still is', { settings: playSeed({ allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await pressPlay(page);
  await dialogIs(page, true);
  await page.evaluate((id) => { const k = 'plexPoster.settings'; const s = JSON.parse(localStorage.getItem(k)); s.allowedPlayers = s.allowedPlayers.filter((a) => a.id !== id); localStorage.setItem(k, JSON.stringify(s)); }, LIVING.id);
  await pickDevice(page, 'Velvet Curtain', 'Living Room TV');
  await toastWait(page, /^Living Room TV is no longer on this display's list of allowed devices, so nothing was sent\.$/);
  assert.deepEqual(await commandsOf(mock), []);
  await pressPlay(page);
  await toastWait(page, /^Playing "Velvet Curtain" on Kids Room TV\./);
  assert.deepEqual((await commandsOf(mock)).map((c) => c.target), [KIDS.id], 'now one device allowed: straight to it');
  check('N25 the allowed list as stored at the send');
});

playCase('N26 the title pressed is the title sent and named, whatever the display shows by the time of the send', { settings: playSeed({ staticRatingKey: '', staticTitle: '', allowedPlayers: [LIVING, KIDS], rotateSeconds: 10 }), clock: { time: '2026-01-05T10:00:00' } }, async ({ page, app, mock }) => {
  await load(page, app);
  const pressed = await activeTitle(page);
  const key = TITLES.indexOf(pressed) + 1;
  assert.ok(key > 0, `a known title is on screen: ${pressed}`);
  await pressPlay(page);
  await dialogIs(page, true);
  assert.equal(await page.textContent('#play-now-lead'), `Play "${pressed}" on which device?`);
  // The rotation goes on under the open dialog: another poster is drawn.
  for (let i = 0; i < 40 && (await activeTitle(page)) === pressed; i++) {
    await page.clock.runFor(10_500);
    await page.waitForFunction((was) => (document.querySelector('.poster-layer.active')?.alt || '') !== was, `Poster: ${pressed}`, { timeout: 2000 }).catch(() => {});
  }
  const now = await activeTitle(page);
  assert.notEqual(now, pressed, 'the display moved on');
  assert.equal(await page.textContent('#play-now-lead'), `Play "${pressed}" on which device?`, 'the dialog still names the title pressed');
  await pickDevice(page, pressed, 'Living Room TV');
  await toastWait(page, new RegExp(`^Playing "${pressed}" on Living Room TV`));
  const [command] = await commandsOf(mock);
  assert.equal(command.key, `/library/metadata/${key}`, 'the title pressed was sent');
  check('N26 the title pressed');
});

playCase('N27 one at a time: while a flow is open or sending the button does nothing more, and the button says so', { settings: playSeed() }, async ({ page, app, mock }) => {
  await load(page, app);
  const held = await holdPlexTv(page, app.mockPort);
  await pressPlay(page);
  await page.waitForFunction(() => document.querySelector('[data-action="playnow"]')?.getAttribute('aria-disabled') === 'true', null, { timeout: 5000 });
  assert.equal(await buttonBusy(page), true);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await frames(page, 3);
  assert.equal(held.reads(), 1, 'one read of plex.tv for one flow');
  held.release();
  await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV\./);
  await idle(page);
  assert.equal((await commandsOf(mock)).length, 1, 'one command');
  assert.equal(held.reads(), 1);
  check('N27 one flow at a time');
});

playCase('N28 a late answer after the server changed does nothing: no dialog, no command', { settings: playSeed({ allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  let release;
  const gate = new Promise((r) => (release = r));
  let markHeld;
  const heldSeen = new Promise((r) => (markHeld = r));
  let hold = false;
  let held = false;
  await page.route('**/library/metadata/3?*', async (route) => {
    if (!hold || held) return route.fallback();
    held = true;
    markHeld();
    await gate;
    return route.continue();
  });
  hold = true;
  await pressPlay(page);
  await heldSeen; // the saved position read is out, and the flow waits for it
  assert.equal(await buttonBusy(page), true);
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open), false);
  // The connection settings change (Settings, Save): the source is rebuilt, so the poster's server may be another.
  await openSettings(page);
  await page.locator('#settings [name="unwatchedOnly"]').check();
  await save(page);
  await page.waitForFunction(() => document.querySelector('[data-action="playnow"]')?.getAttribute('aria-disabled') !== 'true', null, { timeout: 3000 }); // the flow ended with the source, long before its held read could time out
  release();
  await frames(page, 6);
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open), false, 'no dialog opened for the flow that ended');
  assert.deepEqual(await commandsOf(mock), []);
  assert.equal((await mock.playLog()).received, 0);
  // A new press afterwards works as usual.
  hold = false;
  await pressPlay(page);
  await dialogIs(page, true);
  await page.click('#play-now-cancel');
  check('N28 a late answer after a change of source does nothing');
});

playCase('N35 a poster the limit takes off the screen takes the button with it, and nothing is left to play', { settings: playSeed({ staticRatingKey: '', staticTitle: '', ratings: ['R'], maxContentRating: 'R', limitSlots: [{ start: '06:00', limit: 'G' }, { start: '15:00', limit: 'PG-13' }, { start: '22:00', limit: '' }] }), clock: { time: '2026-01-05T05:59:00' } }, async ({ page, app, mock }) => {
  await load(page, app);
  const shownTitle = await activeTitle(page);
  assert.match(shownTitle, /^(Popcorn Skies|Neon Matinee|Silver Screen Serenade)$/, `an R title is on screen, the only kind the selection holds (${shownTitle})`);
  assert.equal(await buttonShown(page), true);
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight'); // settings ... pin, playnow
  assert.equal(await activeAction(page), 'playnow');
  await page.clock.setSystemTime(new Date('2026-01-05T06:00:30')); // the G slot: the R selection has no title it allows
  for (let i = 0; i < 4; i++) await page.clock.runFor(1000); // one simulated second at a time, so the one second check of the limit runs
  await buttonShownWait(page, false);
  assert.equal(await activeAction(page), 'pin', 'the focus was on the button that went: it moves to the one before it, and stays in the row');
  assert.equal(await page.evaluate(() => document.querySelector('.poster-layer.active') === null), true, 'no poster is on screen');
  assert.equal((await mock.playLog()).received, 0);
  check('N35 a blocked poster has no button');
});

// ---- failures, in plain words ----

playCase('N29 the server answers that the player could not be reached, or refuses the sign-in: said in words, no code, no address, no token', { settings: playSeed() }, async ({ page, app, mock }) => {
  await load(page, app);
  for (const [mode, words] of [['player', /^Mock Plex could not reach Living Room TV, so "Velvet Curtain" was not started\. Check that Living Room TV is on and on the same network\.$/], ['server', /^Mock Plex had a problem and did not pass "Velvet Curtain" on to Living Room TV\. Try again later\.$/], ['auth', /^Mock Plex refused the sign-in, so "Velvet Curtain" was not sent to Living Room TV\./]]) {
    await mock.playFail(mode);
    await pressPlay(page);
    await toastWait(page, words);
    plain(await toastText(page));
    await idle(page);
  }
  assert.deepEqual(await commandsOf(mock), [], 'no player received anything');
  await mock.playFail('none');
  await pressPlay(page);
  await toastWait(page, /^Playing "Velvet Curtain"/);
  assert.equal((await commandsOf(mock)).length, 1, 'no automatic retry in between: only the press that followed');
  assert.equal((await mock.playLog()).received, 4, 'one request per press, never more');
  check('N29 failures of the forward, in words');
});

playCase('N30 the server does not answer: at the position read, and at the send', { settings: playSeed({ allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await mock.down();
  await pressPlay(page);
  await toastWait(page, /^Could not read where you stopped watching "Velvet Curtain", so nothing was sent\. Mock Plex did not answer\. Try again in a moment\.$/);
  plain(await toastText(page));
  await idle(page);
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open), false, 'nothing is offered when the position cannot be read');
  await mock.up();
  await pressPlay(page);
  await dialogIs(page, true);
  await mock.down();
  await pickDevice(page, 'Velvet Curtain', 'Kids Room TV');
  await toastWait(page, /^Mock Plex did not answer, so nothing was sent to Kids Room TV\. Try again in a moment\.$/); // the identifier read before the check failed: nothing was sent
  plain(await toastText(page));
  await mock.up();
  assert.deepEqual(await commandsOf(mock), []);
  check('N30 the server does not answer');
});

playCase('N31 the saved position is refused: nothing is sent, and the words say the sign-in was refused', { settings: playSeed() }, async ({ page, app, mock }) => {
  await load(page, app);
  await page.route('**/library/metadata/3?*', (route) => route.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{}' }));
  await pressPlay(page);
  await toastWait(page, /^Could not read where you stopped watching "Velvet Curtain", so nothing was sent\. Mock Plex refused the sign-in\./);
  plain(await toastText(page));
  assert.equal((await mock.playLog()).received, 0);
  check('N31 position refused');
});

playCase('N32 the token appears nowhere: not in a message, the log or Diagnostics, and no request leaves for a player', { settings: playSeed() }, async ({ page, app, mock }) => {
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await load(page, app);
  await mock.playFail('player');
  await pressPlay(page);
  await toastWait(page, /could not reach/);
  assert.equal((await toastText(page)).includes(SERVER_TOKEN), false);
  await idle(page);
  await mock.playFail('none');
  await pressPlay(page);
  await toastWait(page, /^Playing/);
  assert.equal((await toastText(page)).includes(SERVER_TOKEN), false);
  await page.evaluate(() => document.querySelector('[data-action="diagnostics"]').click());
  await page.waitForFunction(() => document.getElementById('diagnostics').open, null, { timeout: 5000 });
  const diagnostics = await page.evaluate(() => document.getElementById('diagnostics').textContent);
  assert.equal(diagnostics.includes(SERVER_TOKEN), false, 'not in Diagnostics');
  assert.equal(logs.some((l) => l.includes(SERVER_TOKEN)), false, 'not in the log');
  assert.deepEqual(requests.filter((u) => /192\.0\.2\./.test(u)), [], 'no request to a player');
  assert.deepEqual(requests.filter((u) => u.includes('playMedia') && new URL(u).origin !== `http://127.0.0.1:${app.mockPort}`), [], 'the command went to the poster\'s own server only');
  check('N32 no token anywhere');
});

// ---- round r2: nothing waits between the check and the command, the stored limit, words while waiting, focus, one dialog at a time (D192) ----

/** Holds the first request `match(url)` selects until `release()`; `seen` resolves when it is held. Nothing is unrouted: every other request falls through. */
async function holdRequest(page, match) {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  let markSeen;
  const seen = new Promise((resolve) => (markSeen = resolve));
  let held = false;
  await page.route(match, async (route) => {
    if (held) return route.fallback();
    held = true;
    markSeen();
    await gate;
    return route.continue();
  });
  return { seen, release };
}
const identityRead = (app) => (url) => url.port === String(app.mockPort) && url.pathname === '/';
const playRequest = (url) => url.pathname === '/player/playback/playMedia';
const SLOTS_G = [{ start: '06:00', limit: 'G' }, { start: '15:00', limit: 'PG-13' }, { start: '22:00', limit: '' }];
const rTitle = (extra = {}) => playSeed({ staticRatingKey: '4', staticTitle: 'Popcorn Skies', maxContentRating: 'PG-13', allowedPlayers: [LIVING, KIDS], limitSlots: SLOTS_G, ...extra });
const setStored = (page, patch) => page.evaluate((p) => { const k = 'plexPoster.settings'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k)), ...p })); }, patch);

playCase('N36 the limit tightens while the server\'s identifier is being read (a slot boundary): the title is not sent, although the check had not yet run when the pick was made', { settings: rTitle(), clock: { time: '2026-01-05T05:59:00' } }, async ({ page, app, mock }) => {
  await load(page, app);
  await pressPlay(page);
  await dialogIs(page, true);
  const held = await holdRequest(page, identityRead(app));
  await pickDevice(page, 'Popcorn Skies', 'Kids Room TV');
  await held.seen;
  await page.clock.setSystemTime(new Date('2026-01-05T06:00:30')); // the G slot begins while GET / is out
  held.release();
  await toastWait(page, /^"Popcorn Skies" is rated above this display's limit/);
  assert.deepEqual(await mock.playLog(), { commands: [], received: 0 });
  check('N36 limit tightened during the identifier read');
});

playCase('N37 the device leaves the allowed list while the server\'s identifier is being read: nothing is sent', { settings: rTitle({ maxContentRating: '', limitSlots: [] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await pressPlay(page);
  await dialogIs(page, true);
  const held = await holdRequest(page, identityRead(app));
  await pickDevice(page, 'Popcorn Skies', 'Kids Room TV');
  await held.seen;
  await page.evaluate((id) => { const k = 'plexPoster.settings'; const st = JSON.parse(localStorage.getItem(k)); st.allowedPlayers = st.allowedPlayers.filter((a) => a.id !== id); localStorage.setItem(k, JSON.stringify(st)); }, KIDS.id);
  held.release();
  await toastWait(page, /^Kids Room TV is no longer on this display's list of allowed devices, so nothing was sent\.$/);
  assert.deepEqual(await mock.playLog(), { commands: [], received: 0 });
  check('N37 device removed during the identifier read');
});

playCase('N38 a limit saved from another page while the dialog is open is the limit at the send: the title is refused, in words', { settings: playSeed({ staticRatingKey: '4', staticTitle: 'Popcorn Skies', allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await pressPlay(page);
  await dialogIs(page, true);
  await setStored(page, { maxContentRating: 'G' }); // a second page of the same browser saves a G limit
  await pickDevice(page, 'Popcorn Skies', 'Kids Room TV');
  await toastWait(page, /^"Popcorn Skies" is rated above this display's limit, so it can't be played from here\.$/);
  assert.deepEqual(await mock.playLog(), { commands: [], received: 0 });
  // Loosened again in storage: a press afterwards is judged on what is stored then, and a new press is needed.
  await setStored(page, { maxContentRating: '' });
  await pressPlay(page);
  await dialogIs(page, true);
  await pickDevice(page, 'Popcorn Skies', 'Kids Room TV');
  await toastWait(page, /^Playing "Popcorn Skies" on Kids Room TV/);
  assert.equal((await commandsOf(mock)).length, 1);
  check('N38 the stored limit at the send');
});

playCase('N39 a request already with the server keeps the flow busy until its answer, whatever else happens; a press meanwhile says what it waits for; one command', { settings: playSeed({ unwatchedOnly: false }) }, async ({ page, app, mock }) => {
  await load(page, app);
  const held = await holdRequest(page, playRequest);
  await pressPlay(page);
  await held.seen;
  assert.equal(await buttonBusy(page), true);
  // The source is rebuilt (Settings, Save) while the request is out: the flow is not ended.
  await openSettings(page);
  await page.locator('#settings [name="unwatchedOnly"]').check();
  await save(page);
  assert.equal(await buttonBusy(page), true, 'still busy: the request is with the server');
  await page.locator(PLAY).focus();
  await page.keyboard.press('Enter');
  await toastWait(page, /^Sending "Velvet Curtain" to Living Room TV…$/);
  assert.equal((await mock.playLog()).received, 0, 'the held request has not reached the server, and the press did not start another');
  held.release();
  await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV\.$/);
  await idle(page);
  assert.equal((await commandsOf(mock)).length, 1, 'one command');
  assert.equal((await mock.playLog()).received, 1);
  check('N39 busy until the answer');
});

playCase('N40 the display says what it waits for: checking the devices, then (after a pick) sending; the answer replaces each; a press meanwhile says it again', { settings: playSeed({ allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  assert.equal(await page.getAttribute('#toast', 'role'), 'status', 'announced like the other messages');
  const reads = await holdPlexTv(page, app.mockPort);
  await pressPlay(page);
  await toastWait(page, /^Checking your devices…$/);
  await page.locator(PLAY).focus();
  await page.keyboard.press('Enter');
  await toastWait(page, /^Checking your devices…$/); // a press meanwhile: the same words, not silence
  assert.equal(reads.reads(), 1);
  reads.release();
  await dialogIs(page, true);
  assert.equal(await toastText(page), '', 'the dialog replaced the line');
  const identity = await holdRequest(page, identityRead(app));
  const request = await holdRequest(page, playRequest);
  await pickDevice(page, 'Velvet Curtain', 'Kids Room TV');
  await identity.seen;
  await toastWait(page, /^Checking your devices…$/); // the last check has not passed yet: still checking, not sending
  identity.release();
  await request.seen;
  await toastWait(page, /^Sending "Velvet Curtain" to Kids Room TV…$/); // the request goes: now it is sending
  request.release();
  await toastWait(page, /^Playing "Velvet Curtain" on Kids Room TV\.$/);
  assert.equal((await commandsOf(mock)).length, 1);
  // A Cancel in the dialog leaves no line behind.
  await pressPlay(page);
  await dialogIs(page, true);
  await page.click('#play-now-cancel');
  await dialogIs(page, false);
  assert.equal(await toastText(page), '');
  check('N40 words while waiting');
});

for (const how of ['Escape', 'Cancel', 'pick', 'PIN cancelled']) {
  playCase(`N41 the button leaves the row while the ${how === 'PIN cancelled' ? 'PIN prompt' : 'dialog'} is open: ${how} puts focus on Pin, not on the page`, { settings: playSeed({ ...(how === 'PIN cancelled' ? withPin : {}), staticRatingKey: '', staticTitle: '', showNowPlaying: true, nowPlayingPollSeconds: 5, showPlayer: true, allowedPlayers: [LIVING, KIDS] }), clock: { time: '2026-01-05T10:00:00' } }, async ({ page, app, mock }) => {
    await load(page, app);
    assert.equal(await buttonShown(page), true);
    await pressPlay(page);
    if (how === 'PIN cancelled') await pinIs(page, true);
    else await dialogIs(page, true);
    await mock.play('3'); // a title starts playing on the server: the display shows it, and it has no Play now
    for (let i = 0; i < 6 && (await buttonShown(page)); i++) await page.clock.runFor(5500);
    await buttonShownWait(page, false);
    if (how === 'Escape') await page.keyboard.press('Escape');
    else if (how === 'Cancel') await page.click('#play-now-cancel');
    else if (how === 'pick') await page.getByRole('button', { name: /^Play ".*" on Kids Room TV$/ }).click();
    else await page.click('#pin-cancel');
    await (how === 'PIN cancelled' ? pinIs(page, false) : dialogIs(page, false));
    assert.equal(await activeAction(page), 'pin', 'focus is on Pin, in the row');
    check(`N41 ${how}: focus falls back to Pin`);
  });
}

playCase('N42 a failure stays 15 seconds and a success the toast\'s own five (on the page\'s clock)', { settings: playSeed(), clock: { time: '2026-01-05T10:00:00' } }, async ({ page, app, mock }) => {
  await load(page, app);
  await mock.playFail('player');
  await pressPlay(page);
  await toastWait(page, /could not reach Living Room TV/);
  await page.clock.runFor(14_000);
  assert.notEqual(await toastText(page), '', 'still there after 14 s');
  await page.clock.runFor(1_500);
  assert.equal(await toastText(page), '', 'gone after 15 s');
  await mock.playFail('none');
  await idle(page);
  await pressPlay(page);
  await toastWait(page, /^Playing "Velvet Curtain"/);
  await page.clock.runFor(4_000);
  assert.notEqual(await toastText(page), '');
  await page.clock.runFor(1_500);
  assert.equal(await toastText(page), '');
  check('N42 failures stay');
});

for (const dialog of ['Settings', 'Diagnostics', 'shortcuts']) {
  playCase(`N43 ${dialog} opened while the reads are out ends the Play now: no dialog on top of it, nothing sent, the button free`, { settings: playSeed({ allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
    await load(page, app);
    const reads = await holdPlexTv(page, app.mockPort);
    await pressPlay(page);
    await toastWait(page, /^Checking your devices…$/);
    if (dialog === 'shortcuts') await page.keyboard.press('?');
    else await page.evaluate((name) => document.querySelector(`[data-action="${name}"]`).click(), dialog === 'Settings' ? 'settings' : 'diagnostics');
    const id = dialog === 'Settings' ? 'settings' : dialog === 'Diagnostics' ? 'diagnostics' : 'shortcuts';
    await page.waitForFunction((i) => document.getElementById(i).open, id, { timeout: 5000 });
    await idle(page);
    assert.equal(await toastText(page), '', 'the wait\'s words went with the flow, and the line that says it was stopped waits until the dialog is gone');
    reads.release();
    await frames(page, 6);
    assert.equal(await page.evaluate(() => document.getElementById('play-now').open), false, 'no Play now dialog on top');
    assert.deepEqual(await mock.playLog(), { commands: [], received: 0 });
    await page.click({ Settings: '#settings-cancel', Diagnostics: '#diag-close', shortcuts: '#shortcuts-close' }[dialog]);
    await toastWait(page, /^Play now was stopped, so nothing was sent\.$/); // readable now that the dialog is closed
    check(`N43 ${dialog} ends a Play now`);
  });
}

playCase('N44 Play now does not start while another dialog is open', { settings: playSeed({ allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await openSettings(page);
  await mock.post('reset-stats');
  await page.evaluate((sel) => document.querySelector(sel).click(), PLAY); // the button is behind the sheet: only a script reaches it
  await frames(page, 4);
  assert.equal(await buttonBusy(page), false);
  assert.deepEqual(await mock.plexTvLog(), [], 'plex.tv was not read');
  assert.deepEqual((await mock.get('log')).requests.filter((r) => /^\/(player|\?|library\/metadata)/.test(r)), [], 'no position read, no identifier read, no command (the Settings sheet\'s own library lists are not Play now\'s)');
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open || document.getElementById('pin-dialog').open), false);
  check('N44 nothing starts under an open dialog');
});

// ---- round r3: the rebuild that ends a flow, another action's PIN prompt, both lists at the send, words for a request without an answer (D193) ----

/**
 * Presses Play now on a display with "unwatched only" on and an unpinned title on screen, with the read of the saved position held; then moves the page's clock past the
 * 30 minutes the display keeps its pool, marks every title watched and empties the pool on the server, so the real Refresh button raises the notice with the fix
 * "Turn off unwatched only". Returns the held read and the fix's button.
 */
async function pressThenEmptyPool(page, app, mock) {
  await load(page, app);
  const position = await holdRequest(page, (url) => url.port === String(app.mockPort) && /^\/library\/metadata\/\d+$/.test(url.pathname));
  await pressPlay(page);
  await position.seen;
  assert.equal(await buttonBusy(page), true, 'the flow is open, with a read out');
  for (let k = 1; k <= 8; k++) await mock.post('watch', { ratingKey: String(k), viewCount: 1 }); // every title counts as watched: "unwatched only" finds none
  await page.clock.setSystemTime(new Date('2026-01-05T10:45:00')); // past the 30 minutes the display keeps its pool: the next refresh asks the server again
  await mock.post('empty');
  await page.evaluate(() => (document.getElementById('toast').hidden = true));
  await page.locator('[data-action="refresh"]').click();
  const fix = page.locator('#toast button', { hasText: /unwatched only/ });
  await fix.waitFor({ timeout: 10000 });
  return { position, fix };
}

playCase('N45 the notice\'s fix "Turn off unwatched only" rebuilds the source while a Play now is open and no dialog is: the flow ends, nothing is sent, no chooser opens', { settings: playSeed({ staticRatingKey: '', staticTitle: '', unwatchedOnly: true, allowedPlayers: [LIVING, KIDS] }), clock: { time: '2026-01-05T10:00:00' } }, async ({ page, app, mock }) => {
  const { position, fix } = await pressThenEmptyPool(page, app, mock);
  assert.equal(await page.evaluate(() => document.querySelector('dialog[open]') === null), true, 'no dialog is open: only the rebuild can end the flow');
  await fix.click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.settings')).unwatchedOnly === false, null, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('[data-action="playnow"]')?.getAttribute('aria-disabled') !== 'true', null, { timeout: 3000 }); // the rebuild ended it
  await toastWait(page, /^Play now was stopped, so nothing was sent\.$/);
  position.release();
  await frames(page, 8);
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open), false, 'no chooser for a flow that ended');
  assert.deepEqual(await mock.playLog(), { commands: [], received: 0 });
  check('N45 the rebuild ends the flow');
});

for (const action of ['Settings', 'Diagnostics']) {
  playCase(`N46 with a PIN set, ${action} pressed while a Play now reads: that action's PIN prompt stays open, Play now ends, and the right PIN opens ${action}`, { settings: playSeed({ ...withPin, allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
    await load(page, app);
    const reads = await holdPlexTv(page, app.mockPort);
    await pressPlay(page);
    await pinIs(page, true);
    await typePin(page, PIN);
    await pinIs(page, false);
    await toastWait(page, /^Checking your devices…$/);
    await page.locator(`#controls [data-action="${action.toLowerCase()}"]`).click();
    await pinIs(page, true);
    await idle(page); // the Play now ended
    await frames(page, 8);
    assert.equal(await pinOpen(page), true, "the action's prompt was not closed by the Play now that ended");
    await typePin(page, PIN);
    await page.waitForFunction((id) => document.getElementById(id).open, action.toLowerCase(), { timeout: 5000 });
    if (action === 'Settings') {
      // A PIN prompt opens and closes inside the open sheet: the line that says Play now was stopped is still held, because the sheet still covers the page.
      await page.click('#players-open');
      await pinIs(page, true);
      await page.click('#pin-cancel');
      await pinIs(page, false);
      await frames(page, 4);
      assert.equal(await toastText(page), '', 'held while the sheet is open');
    }
    reads.release();
    await frames(page, 6);
    assert.equal(await page.evaluate(() => document.getElementById('play-now').open), false);
    assert.deepEqual(await mock.playLog(), { commands: [], received: 0 });
    await page.click(action === 'Settings' ? '#settings-cancel' : '#diag-close');
    await toastWait(page, /^Play now was stopped, so nothing was sent\.$/);
    check(`N46 ${action} with a PIN`);
  });
}

playCase('N46c with a PIN set, a notice\'s fix that asks for the PIN keeps its prompt while a Play now reads; the right PIN applies the fix', { settings: playSeed({ ...withPin, staticRatingKey: '', staticTitle: '', unwatchedOnly: true, allowedPlayers: [LIVING, KIDS] }), clock: { time: '2026-01-05T10:00:00' } }, async ({ page, app, mock }) => {
  await load(page, app);
  const position = await holdRequest(page, (url) => url.port === String(app.mockPort) && /^\/library\/metadata\/\d+$/.test(url.pathname));
  await pressPlay(page);
  await pinIs(page, true);
  await typePin(page, PIN);
  await pinIs(page, false);
  await position.seen;
  for (let k = 1; k <= 8; k++) await mock.post('watch', { ratingKey: String(k), viewCount: 1 });
  await page.clock.setSystemTime(new Date('2026-01-05T10:45:00')); // past the 30 minutes the display keeps its pool
  await mock.post('empty');
  await page.evaluate(() => (document.getElementById('toast').hidden = true));
  await page.locator('[data-action="refresh"]').click();
  const fix = page.locator('#toast button', { hasText: /unwatched only/ });
  await fix.waitFor({ timeout: 10000 });
  await fix.click();
  await pinIs(page, true);
  await idle(page);
  await frames(page, 8);
  assert.equal(await pinOpen(page), true, 'the fix\'s prompt stays');
  await typePin(page, PIN);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.settings')).unwatchedOnly === false, null, { timeout: 5000 });
  position.release();
  await frames(page, 6);
  assert.deepEqual(await mock.playLog(), { commands: [], received: 0 });
  check('N46c the fix with a PIN');
});

/** Makes the store refuse every write of the settings, as a full one does: the page keeps what it saves in memory and the store keeps what it held. */
const fullStore = (page) =>
  page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'plexPoster.settings') throw new DOMException('the store is full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });

playCase('N47 a Save the full store did not take (a device removed): the device missing from the page\'s list is not offered, and the send needs both lists', { settings: playSeed({ allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await fullStore(page);
  await openSettings(page);
  await showList(page);
  await tick(page, 'Kids Room TV', false);
  await save(page); // the page now holds [Living Room TV]; the store still holds both
  assert.deepEqual((await stored(page)).allowedPlayers.map((a) => a.id), [LIVING.id, KIDS.id], 'storage was not updated');
  await pressPlay(page);
  await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV\./); // one device on both lists, present, nothing saved: straight to it; Kids Room TV was never offered
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open), false, 'no dialog: only one device is offered');
  assert.deepEqual((await commandsOf(mock)).map((c) => c.target), [LIVING.id]);
  check('N47 both lists, a device removed');
});

playCase('N47b a Save the full store did not take (a device added): the device missing from the stored list is not offered', { settings: playSeed({ allowedPlayers: [LIVING] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  await fullStore(page);
  await openSettings(page);
  await showList(page);
  await tick(page, 'Kids Room TV', true);
  await save(page); // the page now holds both; the store still holds Living Room TV only
  assert.deepEqual((await stored(page)).allowedPlayers.map((a) => a.id), [LIVING.id]);
  await pressPlay(page);
  await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV\./);
  assert.equal(await page.evaluate(() => document.getElementById('play-now').open), false, 'Kids Room TV is not on the stored list: not offered');
  assert.deepEqual((await commandsOf(mock)).map((c) => c.target), [LIVING.id]);
  check('N47b both lists, a device added');
});

playCase('N47d with the stored list empty and the page\'s not, the button is not there either', { settings: playSeed({ allowedPlayers: [] }) }, async ({ page, app }) => {
  await load(page, app);
  await fullStore(page);
  await openSettings(page);
  await showList(page);
  await tick(page, 'Living Room TV', true);
  await save(page); // the page holds Living Room TV; the store still holds none
  assert.deepEqual((await stored(page)).allowedPlayers, []);
  assert.equal(await buttonShown(page), false, 'the page\'s list alone does not show the button');
  check('N47d the page list alone');
});

playCase('N47c with no device on both lists the button is not there', { settings: playSeed({ allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  assert.equal(await buttonShown(page), true);
  await fullStore(page);
  await openSettings(page);
  await showList(page);
  await tick(page, 'Kids Room TV', false);
  await tick(page, 'Living Room TV', false);
  await save(page); // the page holds nothing; the store still holds both
  assert.equal((await stored(page)).allowedPlayers.length, 2);
  assert.equal(await buttonShown(page), false, 'the stored list alone does not show the button');
  assert.deepEqual(await mock.playLog(), { commands: [], received: 0 });
  check('N47c no device on both lists');
});

playCase('N48 a play request whose connection failed says it is not known whether the device started', { settings: playSeed() }, async ({ page, app, mock }) => {
  await load(page, app);
  const refuse = (route) => route.abort('connectionrefused');
  await page.route(playRequest, refuse);
  await pressPlay(page);
  await toastWait(page, /^Mock Plex did not answer in time, so it is not known whether Living Room TV started "Velvet Curtain"\. Look at Living Room TV before you try again\.$/);
  await page.unroute(playRequest, refuse); // the named handler, nothing else
  check('N48 not known, online');
});

playCase('N48b the browser goes offline after the request left and the server took the command: it is not known whether the device started', { settings: playSeed() }, async ({ page, app, mock }) => {
  await load(page, app);
  const lose = async (route) => {
    await route.fetch(); // the server takes the command and forwards it to the player ...
    await page.context().setOffline(true); // ... and then the browser drops offline before the answer reaches the page
    await route.abort('internetdisconnected');
  };
  await page.route(playRequest, lose);
  await pressPlay(page);
  await toastWait(page, /^Mock Plex did not answer in time, so it is not known whether Living Room TV started "Velvet Curtain"\. Look at Living Room TV before you try again\.$/);
  await page.context().setOffline(false);
  await page.unroute(playRequest, lose);
  assert.equal((await commandsOf(mock)).length, 1, 'the player did receive the command: "was not sent" would have been false');
  check('N48b not known, offline after the request left');
});

playCase('N48c a connection cut after the server took the command: the player received it, and the display says it is not known', { settings: playSeed() }, async ({ page, app, mock }) => {
  await load(page, app);
  await mock.playFail('reset'); // the mock records the command for the player and cuts the connection with no answer
  await pressPlay(page);
  await toastWait(page, /^Mock Plex did not answer in time, so it is not known whether Living Room TV started "Velvet Curtain"\./);
  assert.ok((await commandsOf(mock)).length >= 1, 'the command did reach the player (the browser may repeat a GET whose connection was cut): "was not sent" would have been false');
  check('N48c not known, connection reset');
});

playCase('N49 a play request with no answer in time says it is not known whether the device started', { settings: playSeed() }, async ({ page, app }) => {
  await load(page, app);
  const held = await holdRequest(page, playRequest); // never answered: the request times out in the page
  await pressPlay(page);
  await held.seen;
  await page.waitForFunction(() => /not known whether/.test(document.getElementById('toast').textContent), null, { timeout: 40000 });
  assert.equal(await toastText(page), 'Mock Plex did not answer in time, so it is not known whether Living Room TV started "Velvet Curtain". Look at Living Room TV before you try again.');
  plain(await toastText(page));
  held.release();
  check('N49 not known');
});

// ---- round r4: the held lines (D194 2, 3) ----

const openDiagnostics = async (page) => {
  await page.locator('#controls [data-action="diagnostics"]').click();
  await page.waitForFunction(() => document.getElementById('diagnostics').open, null, { timeout: 5000 });
};
const COPY_NOTICE = /^(Diagnostics copied\.|Clipboard not available\.)$/;

playCase('N50 the answer of a request that reached the server, arriving under a dialog, is held and shown when the dialog closes', { settings: playSeed() }, async ({ page, app, mock }) => {
  await load(page, app);
  const request = await holdRequest(page, playRequest);
  await pressPlay(page);
  await request.seen;
  await openDiagnostics(page);
  request.release();
  await idle(page); // the answer arrived: the flow is over
  await frames(page, 6);
  assert.equal(await toastText(page), '', 'nothing is shown behind the sheet, and the "Sending" line is not left up');
  await page.click('#diag-close');
  await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV\.$/);
  assert.equal((await commandsOf(mock)).length, 1);
  check('N50 held answer');
});

playCase('N50b a failure of a request that reached the server is held the same way', { settings: playSeed() }, async ({ page, app, mock }) => {
  await load(page, app);
  await mock.playFail('server');
  const request = await holdRequest(page, playRequest);
  await pressPlay(page);
  await request.seen;
  await openDiagnostics(page);
  request.release();
  await idle(page);
  await frames(page, 6);
  assert.equal(await toastText(page), '');
  await page.click('#diag-close');
  await toastWait(page, /^Mock Plex had a problem and did not pass "Velvet Curtain" on to Living Room TV\. Try again later\.$/);
  check('N50b held failure');
});

playCase('N51 a held answer is shown whatever other notice is up when the last dialog closes', { settings: playSeed() }, async ({ page, app }) => {
  await load(page, app);
  const request = await holdRequest(page, playRequest);
  await pressPlay(page);
  await request.seen;
  await openDiagnostics(page);
  request.release();
  await idle(page);
  await page.click('#diag-copy'); // another notice, while the sheet is open
  await toastWait(page, COPY_NOTICE);
  await page.click('#diag-close');
  await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV\.$/);
  check('N51 the answer wins');
});

playCase('N52 the line that says Play now was stopped yields to a notice that is up when the last dialog closes', { settings: playSeed({ allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  const reads = await holdPlexTv(page, app.mockPort);
  await pressPlay(page);
  await toastWait(page, /^Checking your devices…$/);
  await openDiagnostics(page);
  await idle(page); // stopped by the dialog
  await page.click('#diag-copy');
  await toastWait(page, COPY_NOTICE);
  const notice = await toastText(page);
  await page.click('#diag-close');
  await frames(page, 8);
  assert.equal(await toastText(page), notice, 'the notice stays: the stopped line is dropped, not shown over it');
  reads.release();
  await frames(page, 4);
  assert.deepEqual(await mock.playLog(), { commands: [], received: 0 });
  check('N52 stopped yields');
});

playCase('N53 a new Play now drops a stopped line that is still held: it is never shown over the new flow', { settings: playSeed({ ...withPin, allowedPlayers: [LIVING, KIDS] }) }, async ({ page, app, mock }) => {
  await load(page, app);
  const reads = await holdPlexTv(page, app.mockPort);
  await pressPlay(page);
  await pinIs(page, true);
  await typePin(page, PIN);
  await pinIs(page, false);
  await toastWait(page, /^Checking your devices…$/);
  await page.locator('#controls [data-action="diagnostics"]').click();
  await pinIs(page, true);
  await typePin(page, PIN);
  await page.waitForFunction(() => document.getElementById('diagnostics').open, null, { timeout: 5000 });
  await idle(page); // stopped: its line is held under the sheet
  reads.release();
  // The sheet closes and, in the same instant, Play now is pressed again: its PIN prompt opens before the held line could be shown.
  await page.evaluate(() => {
    document.getElementById('diag-close').click();
    document.querySelector('[data-action="playnow"]').click();
  });
  await pinIs(page, true);
  await page.click('#pin-cancel');
  await pinIs(page, false);
  await frames(page, 8);
  assert.equal(await toastText(page), '', 'the old flow\'s stopped line is not shown after the new flow\'s PIN prompt');
  check('N53 a new flow drops the held line');
});

// ---- the poster's own server, of two ----

for (const [which, pinned, onSecond] of [['the second server', '@mock-b/3', true], ['the first server', '3', false]]) {
  const SECOND_PORT = await freePort();
  playCase(`N33 the command goes to the poster's own server, not the other of two (${which})`, {
    settings: (app) => ({
      plexToken: SERVER_TOKEN, serverUrl: `http://127.0.0.1:${app.mockPort}`, serverId: 'mock', serverName: 'Mock Plex',
      servers: [{ id: 'mock-b', type: 'plex', url: `http://127.0.0.1:${SECOND_PORT}`, token: SERVER_TOKEN, userId: '', name: 'Second Plex' }],
      libraryKey: '1', libraryKeys: ['1', '@mock-b/1'], libraryNames: ['Movies', 'Movies'],
      unwatchedOnly: false, showNowPlaying: false, rotateSeconds: 3600, pixelShift: false,
      staticRatingKey: pinned, staticTitle: 'Velvet Curtain', allowedPlayers: [LIVING],
    }),
  }, async ({ page, app, mock }) => {
    const second = await startMockPlex({ port: SECOND_PORT, machineId: 'mock-b' });
    try {
      const other = makeMock(SECOND_PORT);
      await mock.post('offset', { ratingKey: '3', viewOffset: onSecond ? 0 : 5000 });
      await other.post('offset', { ratingKey: '3', viewOffset: onSecond ? 9000 : 0 });
      await load(page, app);
      assert.equal(await buttonShown(page), true);
      await pressPlay(page);
      await dialogIs(page, true);
      await pickDevice(page, 'Velvet Curtain', 'Living Room TV');
      await toastWait(page, /^Playing "Velvet Curtain" on Living Room TV, from /);
      const [here, there] = onSecond ? [await commandsOf(other), await commandsOf(mock)] : [await commandsOf(mock), await commandsOf(other)];
      assert.deepEqual(there, [], 'the other server received nothing');
      assert.equal(here.length, 1);
      assert.deepEqual([here[0].machineIdentifier, here[0].offset, here[0].target], [onSecond ? 'mock-b' : 'mock', onSecond ? 9000 : 5000, LIVING.id], 'its own identifier and its own saved position');
      assert.equal(here[0].port, String(onSecond ? SECOND_PORT : app.mockPort));
      // The failure names the poster's own server.
      await (onSecond ? other : mock).playFail('player');
      await pressPlay(page);
      await dialogIs(page, true);
      await pickDevice(page, 'Velvet Curtain', 'Living Room TV');
      await toastWait(page, onSecond ? /^Second Plex could not reach Living Room TV/ : /^Mock Plex could not reach Living Room TV/);
      check(`N33 the command goes to ${which}`);
    } finally {
      await new Promise((resolve) => (second.closeAllConnections?.(), second.close(resolve)));
    }
  });
}

// ---- the view: the dialog and the focus at the three screens ----

const DIALOG_PLAYERS = Array.from({ length: 7 }, (_, i) => ({ name: i === 3 ? 'The very long name of the television in the living room at the back of the house' : `Player ${i + 1}`, provides: 'player', presence: i !== 5, clientIdentifier: `many-${i}` }));
for (const [viewport, rotation] of [[{ width: 1280, height: 720 }, 0], [{ width: 390, height: 844 }, 0], [{ width: 844, height: 390 }, 90]]) {
  playCase(`N34 the dialog and the focus stay in the visible part of the screen at ${viewport.width}x${viewport.height} rotation ${rotation}`, { viewport, settings: playSeed({ rotation, allowedPlayers: DIALOG_PLAYERS.map((p) => ({ id: p.clientIdentifier, name: p.name })) }) }, async ({ page, app, mock }) => {
    await mock.plexTvSet(DIALOG_PLAYERS);
    await mock.post('offset', { ratingKey: '3', viewOffset: 600_000 });
    await load(page, app);
    await pressPlay(page);
    await dialogIs(page, true);
    const box = await page.evaluate(() => {
      const d = document.getElementById('play-now');
      const r = d.getBoundingClientRect();
      return { inside: r.top >= -0.5 && r.left >= -0.5 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5, sideways: d.scrollWidth - d.clientWidth };
    });
    assert.equal(box.inside, true, 'the dialog is inside the screen');
    assert.equal(box.sideways <= 0, true, `no sideways scroll (${box.sideways})`);
    const first = await focusedInView(page);
    assert.deepEqual([first.inWindow, first.inDialog], [true, true], `the first focus is in view: ${first.what}`);
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      const at = await focusedInView(page);
      assert.deepEqual([at.inWindow, at.inDialog], [true, true], `Tab ${i}: ${at.what} is in view`);
    }
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Shift+Tab');
      const at = await focusedInView(page);
      assert.deepEqual([at.inWindow, at.inDialog], [true, true], `Shift+Tab ${i}: ${at.what} is in view`);
    }
    await page.keyboard.press('Escape');
    await dialogIs(page, false);
    assert.equal(await activeAction(page), 'playnow');
    const back = await focusedInView(page);
    assert.equal(back.inWindow, true, 'the button the focus came back to is on the screen');
    check(`N34 view ${viewport.width}x${viewport.height} rotation ${rotation}`);
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
