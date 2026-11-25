import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKING_TEXT, PICK_MEANINGS, STILL_WORKING_TEXT, STOPPED_TEXT, acceptedText, chooseStep, clockText, confirmText, createPlayNow, decideSend, failureText, limitVerdict, notCheckedText, onBothLists, playingText, pressDecision, refusalText, sendErrorDetail, sendingText, showsButton } from '../js/play-now.js';
import { createPlexClient, toPoster } from '../js/sources/plex.js';
import { createSource, createSources, PLEX_ONLY_MEMBERS, readPlayers, SourceError } from '../js/sources/index.js';
import { sanitize } from '../js/settings.js';
import { TOKEN, startMockPlex } from '../scripts/mock-plex.mjs';

// ---- fixtures ----

const LIVING = { id: 'tv-living', name: 'Living Room TV' };
const KIDS = { id: 'tv-kids', name: 'Kids Room TV' };
const movie = (extra = {}) => ({ ratingKey: '3', playKey: '3', kind: 'movie', source: 'random', title: 'Velvet Curtain', contentRating: 'PG-13', ...extra });
const present = (p) => ({ ...p, present: true });
const absent = (p) => ({ ...p, present: false });

// ---- which poster has the button (D191 7) ----

test('showsButton: a movie or an episode from a Plex server while a device is allowed', () => {
  const ok = { poster: movie(), serverType: 'plex', allowed: [LIVING] };
  assert.equal(showsButton(ok), true);
  assert.equal(showsButton({ ...ok, poster: movie({ kind: 'episode', playKey: '52' }) }), true);
});

test('showsButton: hidden for every other poster and while no device is allowed', () => {
  const ok = { poster: movie(), serverType: 'plex', allowed: [LIVING] };
  assert.equal(showsButton({ ...ok, allowed: [] }), false, 'no device allowed');
  assert.equal(showsButton({ ...ok, allowed: undefined }), false, 'no list');
  assert.equal(showsButton({ ...ok, poster: null }), false, 'no poster on screen');
  assert.equal(showsButton({ ...ok, poster: movie({ kind: 'show' }) }), false, 'a show');
  assert.equal(showsButton({ ...ok, poster: movie({ kind: 'season' }) }), false, 'a season');
  assert.equal(showsButton({ ...ok, poster: movie({ kind: undefined }) }), false, 'the server named no kind (an offline cached poster)');
  assert.equal(showsButton({ ...ok, poster: movie({ playKey: '' }) }), false, 'no key of its own to play');
  assert.equal(showsButton({ ...ok, poster: movie({ source: 'now-playing' }) }), false, 'the now-playing poster');
  assert.equal(showsButton({ ...ok, serverType: 'jellyfin' }), false, 'a Jellyfin poster');
  assert.equal(showsButton({ ...ok, serverType: 'emby' }), false, 'an Emby poster');
  assert.equal(showsButton({ ...ok, serverType: '' }), false, 'a poster of no known server');
});

test('toPoster: a Plex item carries its kind and its own key, an episode its own key and not its series\'; an item with no type carries neither', () => {
  const m = toPoster({ type: 'movie', ratingKey: '3', title: 'A', thumb: '/t' }, 'random');
  assert.deepEqual([m.kind, m.playKey, m.ratingKey], ['movie', '3', '3']);
  const e = toPoster({ type: 'episode', ratingKey: '52', grandparentRatingKey: '2', grandparentTitle: 'Show', title: 'Pilot', thumb: '/t' }, 'random');
  assert.deepEqual([e.kind, e.playKey, e.ratingKey, e.title], ['episode', '52', '2', 'Show']);
  const show = toPoster({ type: 'show', ratingKey: '9', title: 'S', thumb: '/t' }, 'random');
  assert.deepEqual([show.kind, show.playKey], ['show', '9']);
  const bare = toPoster({ ratingKey: '7', title: 'A', thumb: '/t' }, 'random');
  assert.equal('kind' in bare || 'playKey' in bare, false);
  assert.equal('kind' in toPoster({ type: '', ratingKey: '7', title: 'A', thumb: '/t' }, 'random'), false, 'an empty type is no type');
  assert.equal('playKey' in toPoster({ type: 'movie', title: 'A', thumb: '/t' }, 'random'), false, 'no key: nothing to play');
});

// ---- the limit (D191 1, 2) ----

test('limitVerdict is allows(): a pinned or not, an unrated title is refused under a limit, no limit allows all', () => {
  assert.deepEqual(limitVerdict('', 'R'), { ok: true });
  assert.deepEqual(limitVerdict('', ''), { ok: true }, 'no limit: unrated plays');
  assert.deepEqual(limitVerdict('PG-13', 'PG-13'), { ok: true });
  assert.deepEqual(limitVerdict('PG-13', 'R'), { ok: false, reason: 'limit' });
  assert.deepEqual(limitVerdict('PG-13', ''), { ok: false, reason: 'unrated' });
  assert.deepEqual(limitVerdict('PG-13', 'NR'), { ok: false, reason: 'unrated' }, 'a rating no ladder knows');
  assert.deepEqual(limitVerdict('Nonsense', 'G'), { ok: false, reason: 'limit' }, 'a corrupt limit allows nothing');
});

test('pressDecision: hidden, refused with the reason, or go on', () => {
  const base = { poster: movie(), serverType: 'plex', limit: '', allowed: [LIVING] };
  assert.deepEqual(pressDecision(base), { outcome: 'ask' });
  assert.deepEqual(pressDecision({ ...base, allowed: [] }), { outcome: 'hidden' });
  assert.deepEqual(pressDecision({ ...base, serverType: 'jellyfin' }), { outcome: 'hidden' });
  const refused = pressDecision({ ...base, limit: 'PG' });
  assert.equal(refused.outcome, 'refused');
  assert.equal(refused.reason, 'limit');
  assert.match(refused.message, /Velvet Curtain/);
  assert.equal(pressDecision({ ...base, limit: 'PG', poster: movie({ contentRating: '' }) }).reason, 'unrated');
  // A pinned poster is shown above the limit (D5) but is no exception here: whatever marks it as pinned changes nothing.
  assert.equal(pressDecision({ ...base, limit: 'PG', poster: movie({ source: 'static', pinned: true }) }).outcome, 'refused');
});

// ---- what to ask (D191 5, 6) ----

test('chooseStep: one allowed device that is present and no saved position goes straight to it', () => {
  const step = chooseStep({ allowed: [LIVING], listed: [present(LIVING)], position: 0 });
  assert.equal(step.step, 'send');
  assert.equal(step.device.id, LIVING.id);
});

test('chooseStep: plex.tv not read is a menu, with every allowed device "not checked" and pickable, even for one device', () => {
  const step = chooseStep({ allowed: [LIVING], listed: null, position: 0 });
  assert.equal(step.step, 'menu');
  assert.equal(step.checked, false);
  assert.deepEqual(step.devices.map((d) => [d.id, d.state, d.pickable]), [[LIVING.id, 'not checked', true]]);
  assert.equal(step.devices[0].meaning, 'plex.tv could not be read');
});

test('chooseStep: a saved position is offered as a choice, even for one device', () => {
  const step = chooseStep({ allowed: [LIVING], listed: [present(LIVING)], position: 83_000 });
  assert.equal(step.step, 'menu');
  assert.deepEqual(step.resume, { ms: 83000, text: '1:23' });
  assert.equal(chooseStep({ allowed: [LIVING], listed: [present(LIVING)], position: 0 }).resume, undefined, 'a straight send carries none');
  assert.equal(chooseStep({ allowed: [LIVING, KIDS], listed: [present(LIVING), present(KIDS)], position: 0 }).resume, null);
  assert.equal(chooseStep({ allowed: [LIVING, KIDS], listed: [present(LIVING), present(KIDS)], position: NaN }).resume, null);
  assert.equal(chooseStep({ allowed: [LIVING, KIDS], listed: [present(LIVING), present(KIDS)], position: -5 }).resume, null);
});

test('chooseStep: two or more allowed devices are a menu, by name in number order, each with its state', () => {
  const allowed = [{ id: 'a', name: 'Player 10' }, { id: 'b', name: 'Player 2' }, { id: 'c', name: 'Attic' }, { id: 'd', name: 'Hall' }, { id: 'e', name: 'Gone' }];
  const listed = [present({ id: 'a', name: 'Player 10' }), present({ id: 'b', name: 'Player 2' }), present({ id: 'c', name: 'Attic' }), absent({ id: 'd', name: 'Hall' }), present({ id: 'extra', name: 'Not allowed' })];
  const step = chooseStep({ allowed, listed, position: 0 });
  assert.equal(step.step, 'menu');
  assert.deepEqual(step.devices.map((d) => d.name), ['Attic', 'Gone', 'Hall', 'Player 2', 'Player 10']);
  assert.deepEqual(step.devices.map((d) => [d.state, d.pickable]), [['', true], ['unavailable', false], ['offline', false], ['', true], ['', true]]);
  assert.equal(step.devices.find((d) => d.id === 'extra'), undefined, 'a player plex.tv lists that is not allowed is never offered');
  assert.equal(step.devices.find((d) => d.state === 'offline').meaning, PICK_MEANINGS.offline);
  assert.equal(PICK_MEANINGS.unavailable, 'no longer on your Plex account');
});

test('chooseStep: one allowed device that cannot be picked is a menu with that device disabled and its reason', () => {
  const offline = chooseStep({ allowed: [KIDS], listed: [absent(KIDS)], position: 0 });
  assert.equal(offline.step, 'menu');
  assert.deepEqual(offline.devices.map((d) => [d.state, d.pickable]), [['offline', false]]);
  const gone = chooseStep({ allowed: [KIDS], listed: [], position: 0 });
  assert.equal(gone.step, 'menu');
  assert.deepEqual(gone.devices.map((d) => [d.state, d.pickable]), [['unavailable', false]]);
});

test('chooseStep: the name plex.tv lists now is shown, else the stored one, else the identifier', () => {
  assert.equal(chooseStep({ allowed: [{ id: 'x', name: 'Old name' }], listed: [present({ id: 'x', name: 'New name' })], position: 5 }).devices[0].name, 'New name');
  assert.equal(chooseStep({ allowed: [{ id: 'x', name: 'Old name' }], listed: null, position: 0 }).devices[0].name, 'Old name');
  assert.equal(chooseStep({ allowed: [{ id: 'x', name: '' }], listed: null, position: 0 }).devices[0].name, 'x');
});

// ---- the check at the moment of sending (D191 3) ----

const picked = (over = {}) => ({ id: LIVING.id, name: LIVING.name, state: '', meaning: '', pickable: true, ...over });
const sendBase = { poster: movie(), limit: '', allowed: [LIVING, KIDS], deviceId: LIVING.id, device: picked(), resumeChosen: false, position: 0 };

test('decideSend: the target is the client identifier on the allowed list', () => {
  assert.deepEqual(decideSend(sendBase), { ok: true, target: LIVING.id, offset: 0 });
});

test('decideSend: resume sends the saved position in milliseconds, "Play from start" sends 0', () => {
  assert.equal(decideSend({ ...sendBase, resumeChosen: true, position: 83_456 }).offset, 83_456);
  assert.equal(decideSend({ ...sendBase, resumeChosen: false, position: 83_456 }).offset, 0, 'from the start');
  assert.equal(decideSend({ ...sendBase, resumeChosen: true, position: 0 }).offset, 0, 'nothing saved: the start');
  assert.equal(decideSend({ ...sendBase, resumeChosen: true, position: NaN }).offset, 0);
  assert.equal(decideSend({ ...sendBase, resumeChosen: true, position: 1234.6 }).offset, 1235, 'whole milliseconds');
});

test('decideSend: a title the limit now in force refuses is not sent, an unrated one under a limit either, a looser limit sends', () => {
  const r = decideSend({ ...sendBase, limit: 'PG' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'limit');
  assert.match(r.message, /Velvet Curtain/);
  assert.equal(decideSend({ ...sendBase, limit: 'PG-13', poster: movie({ contentRating: '' }) }).reason, 'unrated');
  assert.equal(decideSend({ ...sendBase, limit: 'R' }).ok, true);
  assert.equal(decideSend({ ...sendBase, limit: 'PG', poster: movie({ source: 'static' }) }).ok, false, 'pinned or not');
});

test('decideSend: a device that is not on the allowed list as stored now is not sent to, whatever the menu showed', () => {
  const r = decideSend({ ...sendBase, allowed: [KIDS] });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'device');
  assert.match(r.message, /Living Room TV is no longer on this display's list/);
  assert.equal(decideSend({ ...sendBase, allowed: [] }).ok, false);
  assert.equal(decideSend({ ...sendBase, allowed: undefined }).ok, false);
  assert.equal(decideSend({ ...sendBase, deviceId: 'tv-other', device: undefined }).message.startsWith('That device is no longer'), true, 'a device with no row is named plainly');
});

test('decideSend: a device that cannot be picked is not sent to, and says why', () => {
  const r = decideSend({ ...sendBase, device: picked({ state: 'offline', meaning: PICK_MEANINGS.offline, pickable: false }) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unpickable');
  assert.match(r.message, /Living Room TV can't be picked \(offline: not connected now, so it cannot be picked\), so nothing was sent\./);
  assert.match(decideSend({ ...sendBase, device: undefined }).message, /can't be picked, so nothing was sent/, 'a device nobody offered');
});

// ---- the words ----

test('every sentence is plain: no status code, no protocol word, no address, no token', () => {
  const errors = [{ kind: 'network' }, { kind: 'timeout' }, { kind: 'auth', status: 401 }, { kind: 'server', status: 500 }, { kind: 'http', status: 404 }, { kind: 'parse' }, { kind: 'config' }, { kind: 'surprise' }, undefined];
  const sentences = [
    refusalText('Velvet Curtain', 'limit'),
    refusalText('Velvet Curtain', 'unrated'),
    playingText('Velvet Curtain', 'Living Room TV', 0),
    playingText('Velvet Curtain', 'Living Room TV', 4_000_000),
    ...errors.flatMap((error) => [
      failureText({ step: 'prepare', error, title: 'Velvet Curtain', device: 'Living Room TV', server: 'Mock Plex' }),
      failureText({ step: 'send', error, title: 'Velvet Curtain', device: 'Living Room TV', server: 'Mock Plex' }),
      failureText({ step: 'position', error, title: 'Velvet Curtain', device: 'Living Room TV', server: 'Mock Plex' }),
      notCheckedText({ failed: [{ kind: error?.kind, slots: [0] }] }, () => 'Mock Plex'),
    ]),
    failureText({ step: 'send', error: { kind: 'http', status: 503 }, title: 'Velvet Curtain', device: 'Living Room TV', server: 'Mock Plex' }),
  ];
  for (const text of sentences) {
    assert.doesNotMatch(text, /\b\d{3}\b/, text);
    assert.doesNotMatch(text, /http|cors|token|:\/\/|status|unauthori[sz]ed|error code/i, text);
    assert.match(text, /[.]$/, 'a sentence');
  }
});

test('the words say which thing happened', () => {
  const say = (step, kind) => failureText({ step, error: { kind }, title: 'T', device: 'D', server: 'S' });
  const known = /^S did not answer in time, so it is not known whether D started "T"\. Look at D before you try again\.$/;
  assert.match(say('send', 'timeout'), known, 'no answer in time: not known');
  assert.match(say('send', 'network'), known, 'a connection that failed while the browser is online: not known (it can be lost after the server took the command)');
  assert.doesNotMatch(say('send', 'timeout'), /was not sent/);
  assert.doesNotMatch(say('send', 'network'), /was not sent|nothing was sent/, 'the browser cannot tell a connection never made from one lost after the server took the command');
  // the reads before the request keep their words: nothing had been sent yet
  assert.match(failureText({ step: 'position', error: { kind: 'network' }, title: 'T', server: 'S' }), /so nothing was sent\. S did not answer/);
  assert.match(failureText({ step: 'prepare', error: { kind: 'network' }, title: 'T', device: 'D', server: 'S' }), /so nothing was sent to D/);
  assert.match(say('send', 'auth'), /S refused the sign-in.*Settings/);
  assert.match(say('send', 'http'), /S could not reach D.*on the same network/);
  const server = (status) => failureText({ step: 'send', error: { kind: 'http', status }, title: 'T', device: 'D', server: 'S' });
  assert.match(server(500), /^S had a problem and did not pass "T" on to D\. Try again later\.$/);
  assert.equal(server(503), server(599));
  assert.match(server(404), /S could not reach D/, 'a refusal that is not 5xx');
  assert.match(server(499), /S could not reach D/);
  assert.match(say('send', 'config'), /S is not available any more/);
  assert.match(say('send', 'parse'), /not known whether D started "T"/);
  // The identifier read before the check: nothing was sent, and it says so (D192 1).
  assert.match(say('prepare', 'network'), /^S did not answer, so nothing was sent to D\. Try again in a moment\.$/);
  assert.equal(say('prepare', 'timeout'), say('prepare', 'network'), 'the identifier read: nothing was sent, whichever failure');
  assert.match(say('prepare', 'auth'), /^S refused the sign-in, so nothing was sent to D\. Sign in to S again in Settings\.$/);
  assert.match(say('prepare', 'config'), /^S is not available any more, so nothing was sent\.$/);
  assert.match(say('prepare', 'parse'), /^S did not say who it is, so nothing was sent to D/);
  for (const kind of ['network', 'timeout', 'auth', 'config', 'parse', 'http']) assert.doesNotMatch(say('prepare', kind), /not known whether/, kind);
  assert.match(say('position', 'network'), /Could not read where you stopped watching "T", so nothing was sent\. S did not answer/);
  assert.match(say('position', 'auth'), /S refused the sign-in/);
  assert.match(say('position', 'config'), /S is not available any more/);
  assert.match(say('position', 'http'), /Try again in a moment/);
  const names = ['Mock Plex', 'Second Plex', 'Third'];
  const nameOf = (slot) => names[slot];
  const read = (kind, slots) => notCheckedText({ failed: [{ kind, slots }] }, nameOf);
  assert.equal(read('auth', [1]), 'Could not read the players of Second Plex: plex.tv refused the sign-in. Sign in to Second Plex again in Settings. These devices are not checked, so you can still pick one.');
  assert.equal(read('timeout', [0]), 'Could not read the players of Mock Plex: plex.tv did not answer. These devices are not checked, so you can still pick one.');
  assert.equal(read('network', [0]), read('timeout', [0]));
  assert.match(read('server', [0]), /^Could not read the players of Mock Plex: plex\.tv had a problem and could not answer\. Try again later\./);
  assert.match(read('parse', [0]), /plex\.tv answered with something that could not be read\./);
  assert.match(read('auth', [0, 1]), /players of Mock Plex and Second Plex: .*Sign in to Mock Plex and Second Plex again/, 'every server of the account, named');
  assert.match(read('auth', [0, 1, 2]), /players of Mock Plex, Second Plex and Third:/);
  assert.match(read('auth', [0, 0]), /players of Mock Plex:/, 'a name once');
  assert.match(notCheckedText({ failed: [{ kind: 'auth', slots: [0] }, { kind: 'timeout', slots: [1] }] }, nameOf), /Mock Plex: plex\.tv refused.*Second Plex: plex\.tv did not answer/, 'one sentence per failed account');
  assert.match(notCheckedText({ kind: 'timeout' }), /^Could not read the players of your Plex account: plex\.tv did not answer\./, 'an error that names no account');
  assert.match(notCheckedText(new Error('x')), /^Could not read the players of your Plex account: plex\.tv answered with something that could not be read\./);
  assert.match(notCheckedText(undefined), /^Could not read the players of your Plex account:/);
  assert.match(read('auth', [5]), /players of your Plex account:/, 'a server no longer in the list is not named');
  assert.match(playingText('T', 'D', 0), /^Playing "T" on D\.$/);
  assert.match(playingText('T', 'D', 4_000_000), /^Playing "T" on D, from 1:06:40\.$/);
  assert.match(refusalText('T', 'unrated'), /no rating this display can read/);
  assert.match(refusalText('T', 'limit'), /rated above this display's limit/);
});

test('clockText: minutes and seconds, hours when there are any', () => {
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(59_999), '0:59');
  assert.equal(clockText(600_000), '10:00');
  assert.equal(clockText(3_599_000), '59:59');
  assert.equal(clockText(3_600_000), '1:00:00');
  assert.equal(clockText(5_025_000), '1:23:45');
  assert.equal(clockText(-5), '0:00');
  assert.equal(clockText('x'), '0:00');
});

// ---- the flow ----

const defer = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const settle = () => new Promise((r) => setImmediate(r));

/** A page that records what it was asked, in order. Every callback is overridable. */
function rig(over = {}) {
  const events = [];
  const said = []; // the answers (what stays: a success, a failure, a refusal), as `text`
  const times = []; // the `ms` each answer was told with
  const waits = []; // the words of a wait (shown until replaced)
  const drops = { count: 0 }; // how often a new flow told the page to forget a held stopped line
  const reacheds = []; // the answers of a request that reached the server
  const laters = []; // the answers that are to be shown when no dialog is open any more
  const sent = [];
  const models = [];
  const page = {
    poster: movie(),
    serverType: 'plex',
    limit: '',
    storedLimit: undefined, // the limit as stored now; follows `limit` until a case sets it
    allowed: [LIVING],
    source: true,
    dialogOpen: false,
    pin: true,
    players: { accounts: 1, players: [present(LIVING), present(KIDS)] },
    position: 0,
    pick: (model) => ({ id: model.devices.find((d) => d.pickable).id, resume: Boolean(model.resume) }),
    ...over,
  };
  const deps = {
    getPoster: () => page.poster,
    serverTypeOf: () => page.serverType,
    serverName: () => 'Mock Plex',
    nameOfSlot: (slot) => ['Mock Plex', 'Second Plex'][slot] ?? '',
    getLimit: () => page.limit,
    getStoredLimit: () => page.storedLimit ?? page.limit,
    getAllowed: () => page.allowed,
    getPageAllowed: () => page.pageAllowed ?? page.allowed,
    dropStopped: () => (drops.count += 1),
    requestPin: async () => (events.push('pin'), page.pin),
    cancelPin: () => events.push('cancelPin'),
    readPlayers: async () => (events.push('players'), page.players),
    savedPosition: async (poster) => (events.push(`position:${poster.playKey}`), page.position),
    prepare: async () => (events.push('prepare'), 'mock'),
    play: async (command) => (events.push('play'), sent.push(command)),
    otherDialogOpen: () => page.dialogOpen,
    hasSource: () => page.source,
    choose: async (model) => (events.push('choose'), models.push(model), page.pick(model)),
    closeChoice: () => events.push('closeChoice'),
    focusBack: () => events.push('focus'),
    say: (text, options = {}) => (options.ms === 0 ? waits.push(text) : (said.push(text), times.push(options.ms), options.later && laters.push(text), options.reached && reacheds.push(text))),
    unsay: (text) => events.push(`unsay:${text}`),
    onChange: () => events.push(`change:${flow.busy}`),
    ...(over.deps || {}),
  };
  const flow = createPlayNow(deps);
  return { flow, page, events, said, times, waits, laters, drops, reacheds, sent, models };
}

test('flow: no device allowed (the button would be hidden): a press does nothing at all', async () => {
  const r = rig({ allowed: [] });
  await r.flow.press();
  assert.deepEqual(r.events, []);
  assert.deepEqual(r.said, []);
});

test('flow: hidden for a poster that has no button, a press does nothing', async () => {
  for (const over of [{ serverType: 'jellyfin' }, { serverType: 'emby' }, { poster: movie({ kind: 'show' }) }, { poster: movie({ source: 'now-playing' }) }, { poster: null }]) {
    const r = rig(over);
    await r.flow.press();
    assert.deepEqual(r.events, [], JSON.stringify(over));
  }
});

test('flow: no source (nothing configured) does nothing, and a poster with no server is not asked about', async () => {
  const r = rig({ source: false });
  await r.flow.press();
  assert.deepEqual(r.events, []);
  const seen = [];
  const none = rig({ poster: null, deps: { serverTypeOf: (p) => (seen.push(p), p.kind) } });
  await none.flow.press();
  assert.deepEqual(seen, [], 'serverTypeOf is not called for no poster');
});

test('flow: one allowed device, present, nothing saved: PIN, one read each, then straight to the send with offset 0', async () => {
  const r = rig({ allowed: [LIVING], players: { accounts: 1, players: [present(LIVING), present(KIDS)] } });
  await r.flow.press();
  assert.deepEqual(r.events, ['change:true', 'pin', 'focus', 'players', 'position:3', 'prepare', 'play', 'change:false'], 'the identifier is read after the reads and before the command');
  assert.deepEqual(r.waits, ['Checking your devices…', 'Sending "Velvet Curtain" to Living Room TV…'], 'what is waited for is said, and the answer replaces it');
  assert.deepEqual(r.times, [undefined], 'a success stays for the toast\'s own time');
  assert.deepEqual(r.sent, [{ poster: { ratingKey: '3', playKey: '3', kind: 'movie', title: 'Velvet Curtain', contentRating: 'PG-13' }, target: LIVING.id, offset: 0, machineIdentifier: 'mock' }]);
  assert.deepEqual(r.said, ['Playing "Velvet Curtain" on Living Room TV.']);
  assert.deepEqual(r.models, [], 'no dialog');
});

test('flow: the saved position is read for the item\'s own key (an episode\'s, not its series\')', async () => {
  const r = rig({ poster: movie({ kind: 'episode', ratingKey: '2', playKey: '52' }) });
  await r.flow.press();
  assert.ok(r.events.includes('position:52'));
  assert.equal(r.sent[0].poster.playKey, '52');
});

test('flow: two allowed devices open the menu with both, nothing is sent until one is picked', async () => {
  const r = rig({ allowed: [LIVING, KIDS], pick: () => ({ id: KIDS.id, resume: false }) });
  await r.flow.press();
  assert.equal(r.models.length, 1);
  assert.equal(r.models[0].title, 'Velvet Curtain');
  assert.deepEqual(r.models[0].devices.map((d) => d.name), ['Kids Room TV', 'Living Room TV']);
  assert.equal(r.models[0].note, '');
  assert.equal(r.sent[0].target, KIDS.id);
  assert.deepEqual(r.said, ['Playing "Velvet Curtain" on Kids Room TV.']);
});

test('flow: a saved position is a choice: resume sends it, "Play from start" sends 0', async () => {
  const resume = rig({ position: 1_500_000, pick: () => ({ id: LIVING.id, resume: true }) });
  await resume.flow.press();
  assert.equal(resume.models[0].resume.text, '25:00');
  assert.equal(resume.sent[0].offset, 1_500_000);
  assert.deepEqual(resume.said, ['Playing "Velvet Curtain" on Living Room TV, from 25:00.']);
  const start = rig({ position: 1_500_000, pick: () => ({ id: LIVING.id, resume: false }) });
  await start.flow.press();
  assert.equal(start.sent[0].offset, 0);
});

test('flow: plex.tv unreadable: the menu, not checked, even for one device; the person can still pick it', async () => {
  const r = rig({ deps: { readPlayers: async () => { throw new SourceError('x', { kind: 'timeout' }); } } });
  await r.flow.press();
  assert.equal(r.models.length, 1, 'never straight through');
  assert.equal(r.models[0].checked, false);
  assert.match(r.models[0].note, /^Could not read the players of your Plex account: plex\.tv did not answer\. These devices are not checked, so you can still pick one\.$/);
  assert.equal(r.sent.length, 1);
});

test('flow: an offline or gone device cannot be picked: a menu that offers it disabled; if it is chosen all the same, nothing is sent and the reason is said', async () => {
  const r = rig({ allowed: [KIDS], players: { accounts: 1, players: [absent(KIDS)] }, pick: () => ({ id: KIDS.id, resume: false }) });
  await r.flow.press();
  assert.equal(r.models[0].devices[0].pickable, false);
  assert.deepEqual(r.sent, []);
  assert.match(r.said[0], /Kids Room TV can't be picked \(offline: /);
  const gone = rig({ allowed: [KIDS], players: { accounts: 1, players: [] }, pick: () => ({ id: KIDS.id, resume: false }) });
  await gone.flow.press();
  assert.deepEqual(gone.sent, []);
  assert.match(gone.said[0], /\(unavailable: /);
});

test('flow: Cancel or Escape (the chooser answers null) sends nothing and says nothing', async () => {
  const r = rig({ allowed: [LIVING, KIDS], pick: () => null });
  await r.flow.press();
  assert.deepEqual(r.sent, []);
  assert.deepEqual(r.said, []);
  assert.equal(r.flow.busy, false, 'the button is free again');
});

// -- the limit (D191 1, 2, 3) --

test('flow: a title the limit refuses: said in words, no PIN, no read, no request', async () => {
  const r = rig({ limit: 'PG' });
  await r.flow.press();
  assert.deepEqual(r.events, [], 'no PIN prompt, no plex.tv read, no position read, no command, not even a flow');
  assert.match(r.said[0], /Velvet Curtain.*above this display's limit/);
  assert.deepEqual(r.times, [15000], 'a refusal stays');
  const unrated = rig({ limit: 'PG-13', poster: movie({ contentRating: '' }) });
  await unrated.flow.press();
  assert.deepEqual(unrated.events, []);
  assert.match(unrated.said[0], /no rating this display can read/);
});

test('flow: a pinned title above the limit is refused as well (the pin is for showing it only)', async () => {
  const r = rig({ limit: 'PG', poster: movie({ source: 'static', contentRating: 'R' }) });
  await r.flow.press();
  assert.deepEqual(r.events, []);
  assert.equal(r.said.length, 1);
});

test('flow: the limit is asked for at the press (the page\'s) and again at the send (the stored one), and the one in force then decides', async () => {
  const asked = { press: 0, send: 0 };
  const r = rig({ deps: { getLimit: () => (asked.press++, r.page.limit), getStoredLimit: () => (asked.send++, r.page.limit) } });
  await r.flow.press();
  assert.deepEqual(asked, { press: 2, send: 1 }, 'the page\'s limit at the press and at the send, the stored one at the send');
  // Tightened between the press and the send (a slot boundary, a profile, another page that saved a limit): nothing is sent.
  const t = rig({ allowed: [LIVING, KIDS], pick: () => ((t.page.storedLimit = 'PG'), { id: LIVING.id, resume: false }) });
  await t.flow.press();
  assert.deepEqual(t.sent, []);
  assert.match(t.said[0], /above this display's limit/);
  assert.deepEqual(t.times, [15000], 'a refusal stays');
  // The page's own limit counts at the send too: the title must pass both (D193 1).
  const m = rig({ storedLimit: '', allowed: [LIVING, KIDS], pick: () => ((m.page.limit = 'G'), { id: LIVING.id, resume: false }) });
  await m.flow.press();
  assert.deepEqual(m.sent, [], 'the page is stricter than storage: refused');
  // Loosened in storage: the limit in force now is followed.
  const l = rig({ limit: 'PG-13', storedLimit: 'PG-13', allowed: [LIVING, KIDS], pick: () => ((l.page.storedLimit = ''), { id: LIVING.id, resume: false }) });
  await l.flow.press();
  assert.equal(l.sent.length, 1);
});

test('flow: a press the limit refused ends there: a limit loosened in storage afterwards sends nothing without a new press', async () => {
  const r = rig({ limit: 'PG', allowed: [LIVING, KIDS] });
  await r.flow.press();
  assert.deepEqual(r.events, []);
  r.page.limit = '';
  r.page.storedLimit = '';
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(r.sent, []);
  assert.equal(r.flow.busy, false);
});

test('flow: the limit tightening while the reads are out also stops a straight send', async () => {
  const players = defer();
  const r = rig({ deps: { readPlayers: () => players.promise } });
  const pressed = r.flow.press();
  await settle();
  r.page.limit = 'G';
  players.resolve({ accounts: 1, players: [present(LIVING)] });
  await pressed;
  assert.deepEqual(r.sent, []);
  assert.match(r.said[0], /above this display's limit/);
});

// -- the PIN (D191 4) --

test('flow: the PIN comes first: before any read and before any device is shown; a wrong or cancelled PIN sends nothing', async () => {
  const r = rig({ pin: false, allowed: [LIVING, KIDS] });
  await r.flow.press();
  assert.deepEqual(r.events, ['change:true', 'pin', 'focus', 'change:false'], 'no plex.tv read, no position read, no dialog');
  assert.deepEqual(r.waits, [], 'and no words about devices');
  assert.deepEqual(r.sent, []);
  assert.deepEqual(r.said, []);
  const ok = rig({ allowed: [LIVING, KIDS] });
  await ok.flow.press();
  assert.deepEqual(ok.events.slice(0, 5), ['change:true', 'pin', 'focus', 'players', 'position:3']);
  assert.ok(ok.events.indexOf('pin') < ok.events.indexOf('choose'));
});

test('flow: the PIN is asked for on every press, and not when the limit refuses', async () => {
  const r = rig({ allowed: [LIVING, KIDS], pick: () => ({ id: LIVING.id, resume: false }) });
  await r.flow.press();
  await r.flow.press();
  assert.equal(r.events.filter((e) => e === 'pin').length, 2);
  assert.equal(r.sent.length, 2);
});

// -- the allowed list (D191 3) --

test('flow: a device removed from the allowed list while the menu is open is not sent to', async () => {
  const r = rig({ allowed: [LIVING, KIDS], pick: () => ((r.page.allowed = [KIDS]), { id: LIVING.id, resume: false }) });
  await r.flow.press();
  assert.deepEqual(r.sent, []);
  assert.match(r.said[0], /Living Room TV is no longer on this display's list of allowed devices/);
});

test('flow: the list emptied while the reads were out: nothing is shown or sent', async () => {
  const players = defer();
  const r = rig({ allowed: [LIVING, KIDS], deps: { readPlayers: () => players.promise } });
  const pressed = r.flow.press();
  await settle();
  r.page.allowed = [];
  players.resolve({ accounts: 1, players: [present(LIVING)] });
  await pressed;
  assert.deepEqual(r.models, []);
  assert.deepEqual(r.sent, []);
  assert.match(r.said[0], /No device is allowed on this display any more/);
});

test('flow: only an allowed device is ever the target, never one only plex.tv lists', async () => {
  const r = rig({ allowed: [LIVING, KIDS], players: { accounts: 1, players: [present(LIVING), present(KIDS), present({ id: 'tv-other', name: 'Other TV' })] }, pick: () => ({ id: 'tv-other', resume: false }) });
  await r.flow.press();
  assert.deepEqual(r.models[0].devices.map((d) => d.id).sort(), [KIDS.id, LIVING.id]);
  assert.deepEqual(r.sent, [], 'an identifier nobody offered is not sent to');
});

// -- the title pressed (D191 3) --

test('flow: the title pressed is the title sent and named, whatever the display shows by then', async () => {
  const r = rig({ allowed: [LIVING, KIDS], pick: () => ((r.page.poster = movie({ ratingKey: '9', playKey: '9', title: 'Popcorn Skies', contentRating: 'R' })), { id: LIVING.id, resume: false }) });
  await r.flow.press();
  assert.equal(r.sent[0].poster.title, 'Velvet Curtain');
  assert.equal(r.sent[0].poster.playKey, '3');
  assert.equal(r.models[0].title, 'Velvet Curtain');
  assert.match(r.said[0], /Velvet Curtain/);
  assert.doesNotMatch(r.said[0], /Popcorn/);
});

test('flow: the limit at the send is judged on the title pressed, not the one on screen then', async () => {
  const r = rig({ limit: 'PG-13', allowed: [LIVING, KIDS], pick: () => ((r.page.poster = movie({ title: 'Popcorn Skies', contentRating: 'R' })), { id: LIVING.id, resume: false }) });
  await r.flow.press();
  assert.equal(r.sent.length, 1, 'the PG-13 title pressed is allowed, the R title now on screen does not matter');
});

// -- one at a time, and late answers (D191 9) --

test('flow: while one is open or sending a press does nothing more, and the button follows', async () => {
  const players = defer();
  const r = rig({ deps: { readPlayers: () => players.promise } });
  const first = r.flow.press();
  await settle();
  assert.equal(r.flow.busy, true);
  await r.flow.press();
  await r.flow.press();
  assert.equal(r.events.filter((e) => e === 'pin').length, 1, 'no second flow began');
  players.resolve({ accounts: 1, players: [present(LIVING)] });
  await first;
  assert.equal(r.sent.length, 1, 'one command');
  assert.equal(r.flow.busy, false);
  // And while the command itself is on its way.
  const slow = defer();
  const s = rig({ deps: { play: () => slow.promise } });
  const one = s.flow.press();
  await settle();
  assert.equal(s.flow.busy, true);
  await s.flow.press();
  assert.equal(s.events.filter((e) => e === 'pin').length, 1);
  slow.resolve();
  await one;
  assert.deepEqual(s.said, ['Playing "Velvet Curtain" on Living Room TV.']);
});

test('flow: a flow that is cancelled while the PIN or a read is out does nothing when the answer comes late: no read, no dialog, no word, no command', async () => {
  for (const when of ['pin', 'players', 'position', 'position fails']) {
    const gate = defer();
    const deps = {
      pin: { requestPin: () => gate.promise },
      players: { readPlayers: () => gate.promise.then(() => ({ accounts: 1, players: [present(LIVING), present(KIDS)] })) },
      position: { savedPosition: () => gate.promise.then(() => 0) },
      'position fails': { savedPosition: () => gate.promise.then(() => Promise.reject(new SourceError('x', { kind: 'network' }))) },
    }[when];
    const r = rig({ allowed: [LIVING, KIDS], deps });
    const pressed = r.flow.press();
    await settle();
    const before = [...r.events];
    r.flow.cancel();
    gate.resolve(true);
    await pressed;
    assert.deepEqual(r.sent, [], when);
    assert.deepEqual(r.models, [], when);
    assert.deepEqual(r.said, [STOPPED_TEXT], `${when}: one line says it was stopped, and nothing else is said`);
    assert.deepEqual(r.events.slice(0, before.length), before, when);
    assert.equal(r.events.some((e) => e === 'choose' || (when === 'pin' && (e === 'players' || e.startsWith('position')))), false, `${when}: nothing further was asked after the cancel`);
    assert.equal(r.events.includes('cancelPin'), when === 'pin', `${when}: the PIN prompt is closed only while the flow waits for its own`);
    assert.equal(r.events.includes('closeChoice'), false, `${when}: no chooser is open, so none is closed`);
    assert.equal(r.flow.busy, false);
  }
});

test('flow: a pick that comes back after the flow ended sends nothing', async () => {
  const gate = defer();
  const r = rig({ allowed: [LIVING, KIDS], deps: { choose: () => gate.promise } });
  const pressed = r.flow.press();
  await settle();
  assert.equal(r.flow.busy, true);
  r.flow.cancel();
  assert.equal(r.events.filter((e) => e === 'closeChoice').length, 1, 'the open chooser is closed');
  gate.resolve({ id: LIVING.id, resume: false });
  await pressed;
  assert.deepEqual(r.sent, []);
  assert.equal(r.events.includes('prepare'), false, 'the server was not even asked for its identifier');
  assert.equal(r.waits.some((w) => w.startsWith('Sending')), false, 'and nothing was said about sending');
});

test('flow: cancel with nothing open does nothing, and a new press after a cancel starts afresh', async () => {
  const r = rig();
  r.flow.cancel();
  r.flow.cancel();
  assert.deepEqual(r.events, []);
  assert.deepEqual([r.said, r.waits], [[], []], 'there is nothing to say was stopped');
  await r.flow.press();
  assert.equal(r.sent.length, 1);
});

// -- failures, in words (D191 9) --

test('flow: the saved position cannot be read: nothing is sent, and it says what happened, whatever plex.tv said', async () => {
  const r = rig({ deps: { savedPosition: async () => { throw new SourceError('Plex returned HTTP 500.', { kind: 'http', status: 500 }); } } });
  await r.flow.press();
  assert.deepEqual(r.sent, []);
  assert.deepEqual(r.models, []);
  assert.match(r.said[0], /^Could not read where you stopped watching "Velvet Curtain", so nothing was sent\./);
  assert.doesNotMatch(r.said[0], /500|HTTP/);
});

test('flow: a failed connection says "nothing was sent" for the reads before the request and "not known" for the request itself', async () => {
  const network = () => new SourceError('Could not reach Plex (network or CORS error).', { kind: 'network' });
  const position = rig({ deps: { savedPosition: async () => { throw network(); } } });
  await position.flow.press();
  assert.match(position.said[0], /so nothing was sent\. Mock Plex did not answer/);
  const identifier = rig({ deps: { prepare: async () => { throw network(); } } });
  await identifier.flow.press();
  assert.match(identifier.said[0], /^Mock Plex did not answer, so nothing was sent to Living Room TV/);
  const request = rig({ deps: { play: async () => { throw network(); } } });
  await request.flow.press();
  assert.match(request.said[0], /^Mock Plex did not answer in time, so it is not known whether Living Room TV started "Velvet Curtain"\. Look at Living Room TV before you try again\.$/);
  assert.doesNotMatch(request.said[0], /was not sent|nothing was sent/);
});

test('flow: the send fails: each failure says which thing happened, with no code', async () => {
  const say = async (error) => {
    const r = rig({ deps: { play: async () => { throw error; } } });
    await r.flow.press();
    assert.equal(r.said.length, 1);
    assert.deepEqual(r.times, [15000], 'a failure stays for 15 seconds');
    assert.equal(r.flow.busy, false);
    return r.said[0];
  };
  assert.match(await say(new SourceError('Plex did not respond in time.', { kind: 'timeout' })), /^Mock Plex did not answer in time, so it is not known whether Living Room TV started "Velvet Curtain"\. Look at Living Room TV before you try again\.$/);
  assert.match(await say(new SourceError('Could not reach Plex (network or CORS error).', { kind: 'network' })), /^Mock Plex did not answer in time, so it is not known whether Living Room TV started "Velvet Curtain"\./);
  assert.match(await say(new SourceError('Plex rejected the token (unauthorised).', { kind: 'auth', status: 401 })), /^Mock Plex refused the sign-in/);
  assert.match(await say(new SourceError('Plex returned HTTP 404.', { kind: 'http', status: 404 })), /^Mock Plex could not reach Living Room TV/);
  assert.match(await say(new SourceError('Plex returned HTTP 500.', { kind: 'http', status: 500 })), /^Mock Plex had a problem and did not pass "Velvet Curtain" on to Living Room TV\. Try again later\.$/);
  assert.doesNotMatch(await say(new SourceError('Plex returned HTTP 500.', { kind: 'http', status: 500 })), /500|HTTP|token/i);
});

test('flow: anything unexpected is said in words, frees the button, and sends nothing more', async () => {
  const r = rig({ deps: { readPlayers: async () => { throw new Error('boom'); }, savedPosition: async () => { throw new Error('boom'); }, requestPin: async () => { throw new Error('boom'); } } });
  await r.flow.press();
  assert.deepEqual(r.sent, []);
  assert.deepEqual(r.said, ['Play now could not finish, so nothing was sent. Try again.']);
  assert.equal(r.flow.busy, false);
  // A flow that was cancelled before it failed says nothing.
  const gate = defer();
  const c = rig({ deps: { requestPin: () => gate.promise } });
  const pressed = c.flow.press();
  await settle();
  c.flow.cancel();
  gate.reject(new Error('late'));
  await pressed;
  assert.deepEqual(c.said, [STOPPED_TEXT], 'only that it was stopped: the late failure is not told');
});

// -- nothing waits between the check and the command (D192 1) --

test('flow: the server\'s identifier is read BEFORE the send-time check, and the request is the next thing after the check: no await between them', async () => {
  const log = [];
  let turns = 0;
  const r = rig({
    deps: {
      prepare: async () => (log.push('prepare'), 'mock'),
      getStoredLimit: () => (log.push('limit'), queueMicrotask(() => turns++), ''),
      getAllowed: () => (log.push('allowed'), [LIVING]),
      play: async (command) => (log.push(`play after ${turns} turns`), r.sent.push(command)),
    },
  });
  await r.flow.press();
  const at = log.lastIndexOf('prepare');
  assert.deepEqual(log.slice(at), ['prepare', 'limit', 'allowed', 'play after 0 turns'], 'the check comes after the read, and no turn of the event loop passes between it and the request');
  assert.equal(r.sent[0].machineIdentifier, 'mock');
});

test('flow: the limit tightens, or the device leaves the allowed list, while the identifier is being read: nothing is sent', async () => {
  for (const change of ['limit', 'device']) {
    const gate = defer();
    const r = rig({ deps: { prepare: () => gate.promise } });
    const pressed = r.flow.press();
    await settle();
    if (change === 'limit') r.page.storedLimit = 'G';
    else r.page.allowed = [KIDS];
    gate.resolve('mock');
    await pressed;
    assert.deepEqual(r.sent, [], change);
    assert.match(r.said[0], change === 'limit' ? /above this display's limit/ : /Living Room TV is no longer on this display's list/, change);
    assert.equal(r.flow.busy, false);
  }
});

test('flow: a cancel before the request left stops it and says nothing; a cancel after it left changes nothing', async () => {
  const gate = defer();
  const r = rig({ deps: { prepare: () => gate.promise } });
  const pressed = r.flow.press();
  await settle();
  r.flow.cancel();
  gate.resolve('mock');
  await pressed;
  assert.deepEqual(r.sent, []);
  assert.deepEqual(r.said, [STOPPED_TEXT]);
  assert.equal(r.flow.busy, false);
  assert.ok(r.events.includes('unsay:Checking your devices…'), 'the wait\'s words went with the flow');
  assert.equal(r.waits.some((w) => w.startsWith('Sending')), false, 'it never said it was sending: the request was never made');
});

test('flow: the identifier cannot be read: nothing was sent, and it says so (not "not known whether it started")', async () => {
  for (const [kind, words] of [['network', /^Mock Plex did not answer, so nothing was sent to Living Room TV\./], ['auth', /^Mock Plex refused the sign-in, so nothing was sent to Living Room TV\./], ['parse', /^Mock Plex did not say who it is, so nothing was sent/]]) {
    const r = rig({ deps: { prepare: async () => { throw new SourceError('x', { kind }); } } });
    await r.flow.press();
    assert.deepEqual(r.sent, [], kind);
    assert.match(r.said[0], words, kind);
    assert.doesNotMatch(r.said[0], /not known whether/);
    assert.deepEqual(r.times, [15000]);
    assert.equal(r.flow.busy, false);
  }
  // A flow that ended meanwhile says nothing about it.
  const gate = defer();
  const c = rig({ deps: { prepare: () => gate.promise } });
  const pressed = c.flow.press();
  await settle();
  c.flow.cancel();
  gate.reject(new SourceError('x', { kind: 'network' }));
  await pressed;
  assert.deepEqual(c.said, [STOPPED_TEXT]);
});

test('flow: once the request is with the server the flow stays busy until its answer, whatever cancels it; the answer is told; a second press starts nothing', async () => {
  const slow = defer();
  const r = rig({ deps: { play: (command) => (r.sent.push(command), slow.promise) } });
  const pressed = r.flow.press();
  await settle();
  assert.equal(r.sent.length, 1);
  r.flow.cancel(); // a source rebuilt, or another dialog opened
  assert.equal(r.flow.busy, true);
  assert.deepEqual(r.events.filter((e) => e === 'closeChoice' || e === 'cancelPin'), [], 'nothing of the flow was closed');
  await r.flow.press();
  assert.equal(r.sent.length, 1, 'no second command');
  assert.equal(r.waits.at(-1), 'Sending "Velvet Curtain" to Living Room TV…', 'the press is answered with what it waits for');
  slow.resolve();
  await pressed;
  assert.deepEqual(r.said, ['Playing "Velvet Curtain" on Living Room TV.']);
  assert.equal(r.flow.busy, false);
  await r.flow.press();
  assert.equal(r.sent.length, 2, 'after the answer a new press starts a new flow');
});

test('flow: a request that fails after a cancel is told as well', async () => {
  const slow = defer();
  const r = rig({ deps: { play: () => slow.promise } });
  const pressed = r.flow.press();
  await settle();
  r.flow.cancel();
  slow.reject(new SourceError('x', { kind: 'http', status: 503 }));
  await pressed;
  assert.match(r.said[0], /had a problem and did not pass "Velvet Curtain" on/);
  assert.equal(r.flow.busy, false);
});

// -- the title and the device must pass both the stored and the page's own settings (D193 1) --

test('flow: at the send the title must pass the limit as stored AND as the page holds it, and the device must be on both lists', async () => {
  const pick = (r) => () => ({ id: LIVING.id, resume: false });
  const run = async (over) => {
    const r = rig({ allowed: [LIVING, KIDS], ...over });
    r.page.pick = pick(r);
    await r.flow.press();
    return r;
  };
  // limits: the press passes on the page's value now, so the other is tightened after the press, in the pick
  const stricterInStorage = rig({ allowed: [LIVING, KIDS], pick: () => ((stricterInStorage.page.storedLimit = 'PG'), { id: LIVING.id, resume: false }) });
  await stricterInStorage.flow.press();
  assert.deepEqual(stricterInStorage.sent, [], 'stricter in storage: refused');
  const stricterOnPage = rig({ storedLimit: '', allowed: [LIVING, KIDS], pick: () => ((stricterOnPage.page.limit = 'PG'), { id: LIVING.id, resume: false }) });
  await stricterOnPage.flow.press();
  assert.deepEqual(stricterOnPage.sent, [], 'stricter on the page: refused');
  assert.match(stricterOnPage.said[0], /above this display's limit/);
  const bothAllow = await run({ limit: 'PG-13', storedLimit: 'R' });
  assert.equal(bothAllow.sent.length, 1, 'both allow it: sent');
  // devices: missing from either list at the send
  const notInStorage = rig({ allowed: [LIVING, KIDS], pick: () => ((notInStorage.page.allowed = [KIDS]), { id: LIVING.id, resume: false }) });
  await notInStorage.flow.press();
  assert.deepEqual(notInStorage.sent, [], 'missing from the stored list: refused');
  const notOnPage = rig({ allowed: [LIVING, KIDS], pick: () => ((notOnPage.page.pageAllowed = [KIDS]), { id: LIVING.id, resume: false }) });
  await notOnPage.flow.press();
  assert.deepEqual(notOnPage.sent, [], 'missing from the page\'s list: refused');
  assert.match(notOnPage.said[0], /Living Room TV is no longer on this display's list/);
  const onBoth = await run({});
  assert.equal(onBoth.sent.length, 1);
});

test('decideSend: each of the four combinations on its own', () => {
  const base = { poster: movie({ contentRating: 'R' }), limit: '', pageLimit: '', allowed: [LIVING], pageAllowed: [LIVING], deviceId: LIVING.id, device: picked(), resumeChosen: false, position: 0 };
  assert.equal(decideSend(base).ok, true);
  assert.equal(decideSend({ ...base, limit: 'PG' }).ok, false, 'stored limit stricter');
  assert.equal(decideSend({ ...base, pageLimit: 'PG' }).ok, false, 'page limit stricter');
  assert.equal(decideSend({ ...base, allowed: [KIDS] }).ok, false, 'device not on the stored list');
  assert.equal(decideSend({ ...base, pageAllowed: [KIDS] }).ok, false, 'device not on the page\'s list');
  assert.equal(decideSend({ ...base, pageAllowed: undefined }).ok, true, 'an absent page value is the stored one');
  assert.equal(decideSend({ ...base, limit: 'PG', pageLimit: undefined }).ok, false, 'and the other way');
  assert.equal(decideSend({ ...base, pageLimit: 'PG', limit: '' }).reason, 'limit');
  assert.equal(decideSend({ ...base, poster: movie({ contentRating: '' }), limit: '', pageLimit: 'PG' }).reason, 'unrated');
});

// -- "Sending" shows when the request goes (D193 2) --

test('flow: "Sending…" is not shown for a send the last check refuses; the checking line stays until then', async () => {
  const gate = defer();
  const r = rig({ deps: { prepare: () => gate.promise } });
  const pressed = r.flow.press();
  await settle();
  assert.deepEqual(r.waits, ['Checking your devices…']);
  r.page.allowed = [KIDS]; // the last check will refuse
  gate.resolve('mock');
  await pressed;
  assert.equal(r.waits.some((w) => w.startsWith('Sending')), false, 'never shown');
  assert.match(r.said[0], /no longer on this display's list/);
  // And when the check passes, "Sending…" is shown in the turn the request goes.
  const order = [];
  const ok = rig({ deps: { play: async () => order.push('play') } });
  const orig = ok.waits.push.bind(ok.waits);
  ok.waits.push = (text) => (order.push(text), orig(text));
  await ok.flow.press();
  assert.deepEqual(order.slice(-2), ['Sending "Velvet Curtain" to Living Room TV…', 'play']);
});

// -- the answer of a request that reached the server is marked, a new flow drops a held stopped line, the device is offered only when on both lists (D194) --

test('flow: the answer of a request that reached the server is marked `reached`; the lines before it are not', async () => {
  const ok = rig();
  await ok.flow.press();
  assert.deepEqual(ok.reacheds, ['Playing "Velvet Curtain" on Living Room TV.']);
  const bad = rig({ deps: { play: async () => { throw new SourceError('x', { kind: 'http', status: 404 }); } } });
  await bad.flow.press();
  assert.equal(bad.reacheds.length, 1, 'a failure of the request itself too');
  for (const over of [{ deps: { prepare: async () => { throw new SourceError('x', { kind: 'network' }); } } }, { limit: 'PG' }, { deps: { savedPosition: async () => { throw new SourceError('x', { kind: 'network' }); } } }]) {
    const r = rig(over);
    await r.flow.press();
    assert.deepEqual(r.reacheds, [], 'nothing was handed to the server: not marked');
  }
});

test('flow: a new Play now makes the page forget a stopped line that is still held; a press that starts nothing does not', async () => {
  const r = rig();
  await r.flow.press();
  assert.equal(r.drops.count, 1);
  const refused = rig({ limit: 'PG' });
  await refused.flow.press();
  assert.equal(refused.drops.count, 0, 'a refused press starts no flow');
  const hidden = rig({ allowed: [] });
  await hidden.flow.press();
  assert.equal(hidden.drops.count, 0);
});

test('onBothLists: the stored list\'s entries that the page\'s list also holds', () => {
  assert.deepEqual(onBothLists([LIVING, KIDS], [KIDS]), [KIDS]);
  assert.deepEqual(onBothLists([LIVING], [KIDS]), []);
  assert.deepEqual(onBothLists([LIVING, KIDS], [KIDS, LIVING]), [LIVING, KIDS], 'in the stored order');
  assert.deepEqual(onBothLists([{ id: 'a', name: 'Stored name' }], [{ id: 'a', name: 'Page name' }]), [{ id: 'a', name: 'Stored name' }]);
  assert.deepEqual(onBothLists(undefined, [LIVING]), []);
  assert.deepEqual(onBothLists([LIVING], undefined), []);
});

test('flow: a device on only one of the two lists is not offered, and with none on both nothing starts', async () => {
  const onlyStored = rig({ allowed: [LIVING, KIDS], pageAllowed: [LIVING] });
  await onlyStored.flow.press();
  assert.deepEqual(onlyStored.models, [], 'one device on both lists, present, nothing saved: straight to it');
  assert.deepEqual(onlyStored.sent.map((c) => c.target), [LIVING.id], 'the device missing from the page\'s list is not offered');
  const onlyPage = rig({ allowed: [LIVING], pageAllowed: [LIVING, KIDS], players: { accounts: 1, players: [present(LIVING), present(KIDS)] } });
  await onlyPage.flow.press();
  assert.deepEqual(onlyPage.sent.map((c) => c.target), [LIVING.id], 'the device missing from the stored list is not offered');
  const two = rig({ allowed: [LIVING, KIDS], pageAllowed: [KIDS, LIVING], pick: (m) => ((two.menu = m.devices.map((d) => d.name)), { id: KIDS.id, resume: false }) });
  await two.flow.press();
  assert.deepEqual(two.menu, ['Kids Room TV', 'Living Room TV'], 'both lists hold both: both offered');
  const none = rig({ allowed: [LIVING], pageAllowed: [KIDS] });
  await none.flow.press();
  assert.deepEqual(none.events, [], 'no device on both: the button is not there, a press starts nothing');
  // emptied between the reads and the menu
  const gate = defer();
  const late = rig({ allowed: [LIVING, KIDS], deps: { readPlayers: () => gate.promise } });
  const pressed = late.flow.press();
  await settle();
  late.page.pageAllowed = [];
  gate.resolve({ accounts: 1, players: [present(LIVING), present(KIDS)] });
  await pressed;
  assert.match(late.said[0], /No device is allowed on this display any more/);
});

// -- a stopped Play now says so (D193 4) --

test('flow: a Play now stopped before its request was handed over says so in one line; one already handed over is not stopped and tells its answer', async () => {
  const gate = defer();
  const r = rig({ deps: { readPlayers: () => gate.promise } });
  const pressed = r.flow.press();
  await settle();
  r.flow.cancel();
  gate.resolve({ accounts: 1, players: [] });
  await pressed;
  assert.deepEqual(r.said, [STOPPED_TEXT]);
  assert.deepEqual(r.laters, [STOPPED_TEXT], 'said where it can be read: the page holds it while a dialog covers it');
  assert.deepEqual(r.times, [15000]);
  const g2 = defer();
  const s = rig({ deps: { readPlayers: () => g2.promise } });
  const p2 = s.flow.press();
  await settle();
  s.flow.cancel();
  g2.resolve({ accounts: 1, players: [] });
  await p2;
  assert.deepEqual([s.said, s.laters], [[STOPPED_TEXT], [STOPPED_TEXT]], 'the same line for a rebuilt connection (no dialog is open then, so the page shows it at once)');
  // Handed over: no stopped line, and the answer is told.
  const slow = defer();
  const h = rig({ deps: { play: () => slow.promise } });
  const p3 = h.flow.press();
  await settle();
  h.flow.cancel();
  h.flow.cancel();
  assert.deepEqual(h.said, [], 'not stopped');
  slow.resolve();
  await p3;
  assert.deepEqual(h.said, ['Playing "Velvet Curtain" on Living Room TV.']);
  assert.equal(h.said.includes(STOPPED_TEXT), false);
});

test('flow: a cancel closes only what the flow opened: its own PIN prompt while it waits for it, its chooser while that is open, nothing else', async () => {
  // reading: neither
  const gate = defer();
  const r = rig({ deps: { readPlayers: () => gate.promise } });
  const a = r.flow.press();
  await settle();
  r.flow.cancel();
  assert.equal(r.events.at(-1), 'change:false', 'the button is free at once, before the late answer');
  assert.equal(r.flow.busy, false);
  gate.resolve({ accounts: 1, players: [] });
  await a;
  assert.equal(r.events.includes('cancelPin'), false);
  assert.equal(r.events.includes('closeChoice'), false);
  // waiting for its own PIN: only the prompt
  const pin = defer();
  const q = rig({ deps: { requestPin: () => pin.promise } });
  const b = q.flow.press();
  await settle();
  q.flow.cancel();
  pin.resolve(false);
  await b;
  assert.equal(q.events.includes('cancelPin'), true);
  assert.equal(q.events.includes('closeChoice'), false);
  // the chooser open: only the chooser
  const pick = defer();
  const c = rig({ allowed: [LIVING, KIDS], deps: { choose: () => pick.promise } });
  const d = c.flow.press();
  await settle();
  c.flow.cancel();
  pick.resolve(null);
  await d;
  assert.equal(c.events.includes('cancelPin'), false, 'the PIN was given long ago: that prompt is not the flow\'s now');
  assert.equal(c.events.includes('closeChoice'), true);
  assert.ok(c.events.includes('change:false'), 'the button is freed');
});

// -- what is said while waiting (D192 3) --

test('flow: it says it is checking the devices after the press and the PIN, and that it is sending after a pick; each line is replaced by the answer', async () => {
  const players = defer();
  const r = rig({ allowed: [LIVING, KIDS], deps: { readPlayers: () => players.promise }, pick: () => ({ id: KIDS.id, resume: false }) });
  const pressed = r.flow.press();
  await settle();
  assert.deepEqual(r.waits, ['Checking your devices…']);
  players.resolve({ accounts: 1, players: [present(LIVING), present(KIDS)] });
  await pressed;
  assert.deepEqual(r.waits, ['Checking your devices…', 'Checking your devices…', 'Sending "Velvet Curtain" to Kids Room TV…'], 'after the pick it is checking again (the identifier, the last check); sending only when the request goes');
  assert.ok(r.events.indexOf('unsay:Checking your devices…') < r.events.indexOf('choose'), 'the dialog takes over from the first line');
  assert.deepEqual(r.said, ['Playing "Velvet Curtain" on Kids Room TV.']);
  // Not before the PIN: no words while the prompt is up.
  const pin = defer();
  const q = rig({ deps: { requestPin: () => pin.promise } });
  const asked = q.flow.press();
  await settle();
  assert.deepEqual(q.waits, []);
  pin.resolve(true);
  await asked;
  assert.equal(q.waits[0], 'Checking your devices…');
});

test('flow: words of a wait that nothing replaced are taken off when the flow ends (Cancel, a failed PIN is none, a cancel during the reads)', async () => {
  const c = rig({ allowed: [LIVING, KIDS], pick: () => null });
  await c.flow.press();
  assert.ok(c.events.includes('unsay:Checking your devices…'), 'the dialog replaced the line');
  const gate = defer();
  const r = rig({ deps: { readPlayers: () => gate.promise } });
  const pressed = r.flow.press();
  await settle();
  r.flow.cancel();
  assert.ok(r.events.includes('unsay:Checking your devices…'));
  gate.resolve({ accounts: 1, players: [] });
  await pressed;
  assert.deepEqual(r.said, [STOPPED_TEXT]);
});

test('flow: a press while it waits says what it waits for (Play now is still working) and never does nothing silently', async () => {
  const players = defer();
  const r = rig({ deps: { readPlayers: () => players.promise } });
  const pressed = r.flow.press();
  await settle();
  await r.flow.press();
  assert.deepEqual(r.waits, ['Checking your devices…', 'Checking your devices…']);
  // With no line to repeat (a flow that has said nothing yet) it says that it is still working.
  const pin = defer();
  const q = rig({ deps: { requestPin: () => pin.promise } });
  const asked = q.flow.press();
  await settle();
  await q.flow.press();
  assert.deepEqual(q.waits, ['Play now is still working…']);
  pin.resolve(false);
  await asked;
  assert.ok(q.events.includes('unsay:Play now is still working…'), 'and it goes with the flow');
  players.resolve({ accounts: 1, players: [present(LIVING)] });
  await pressed;
});

test('the words of a wait are plain', () => {
  for (const text of [CHECKING_TEXT, sendingText('Velvet Curtain', 'Living Room TV'), STILL_WORKING_TEXT]) {
    assert.doesNotMatch(text, /\b\d{3}\b|http|cors|token|:\/\//i, text);
    assert.match(text, /…$/);
  }
  assert.equal(sendingText('T', 'D'), 'Sending "T" to D…');
});

// -- one dialog at a time (D192 5), and where focus goes (D192 / K7) --

test('flow: it does not start while another dialog is open, and the PIN prompt it asked for is its own', async () => {
  const r = rig({ dialogOpen: true });
  await r.flow.press();
  assert.deepEqual(r.events, []);
  assert.deepEqual(r.waits, []);
  const pin = defer();
  const q = rig({ deps: { requestPin: () => pin.promise } });
  const asked = q.flow.press();
  await settle();
  assert.equal(q.flow.awaitingPin, true);
  pin.resolve(true);
  await asked;
  assert.equal(q.flow.awaitingPin, false);
  const idle = rig();
  assert.equal(idle.flow.awaitingPin, false);
});

test('flow: a dialog that opens while the reads are out ends the flow: nothing is shown or sent; the same for the PIN prompt', async () => {
  const gate = defer();
  const r = rig({ allowed: [LIVING, KIDS], deps: { readPlayers: () => gate.promise } });
  const pressed = r.flow.press();
  await settle();
  r.flow.cancel(); // what the page does when Settings, Diagnostics or any other dialog opens
  gate.resolve({ accounts: 1, players: [present(LIVING), present(KIDS)] });
  await pressed;
  assert.deepEqual([r.models, r.sent, r.said], [[], [], [STOPPED_TEXT]]);
  assert.deepEqual(r.laters, [STOPPED_TEXT], 'said where it can be read: when the dialog is gone');
  assert.equal(r.events.includes('cancelPin'), false, 'a PIN prompt that is another action\'s is not the flow\'s to close');
  assert.equal(r.events.includes('closeChoice'), false, 'no chooser was open');
  const pin = defer();
  const q = rig({ deps: { requestPin: () => pin.promise } });
  const asked = q.flow.press();
  await settle();
  q.flow.cancel();
  assert.ok(q.events.includes('cancelPin'), 'the flow\'s own PIN question is closed');
  pin.resolve(true);
  await asked;
  assert.deepEqual(q.sent, []);
});

test('flow: focus is put back after the PIN prompt, whatever it answered', async () => {
  for (const pin of [true, false]) {
    const r = rig({ pin });
    await r.flow.press();
    assert.equal(r.events.filter((e) => e === 'focus').length, 1, String(pin));
    assert.ok(r.events.indexOf('focus') > r.events.indexOf('pin'));
  }
});

// ---- the source layer: the command ----

const startPlex = async (machineId) => {
  const server = await startMockPlex({ port: 0, machineId });
  return { server, url: `http://127.0.0.1:${server.address().port}`, port: server.address().port };
};
/** The play command as the page sends it: the server's identifier is read first (`machineIdentifier`), then `play` is called. */
const playOn = async (client, command) => client.play({ machineIdentifier: await client.machineIdentifier(), ...command });
const logOf = async (url) => (await (await fetch(`${url}/__mock/player-log`)).json());
const stop = (...servers) => Promise.all(servers.map((s) => new Promise((r) => (s.closeAllConnections?.(), s.close(r)))));

test('the Plex client\'s play asks its own server, with its own sign-in, to forward to the target player: key, offset, machine identifier, address, port, protocol, target', async () => {
  const a = await startPlex('mock-a');
  try {
    const calls = [];
    const fetchImpl = (url, init) => (calls.push({ url: new URL(url), init }), fetch(url, init));
    const client = createPlexClient({ serverUrl: a.url, token: TOKEN, clientId: 'display-1', fetchImpl });
    await playOn(client, { key: '3', offset: 83456, target: 'tv-living' });
    const { commands, received, queues } = await logOf(a.url);
    assert.equal(received, 1);
    assert.deepEqual(queues, [{ type: 'video', uri: 'server://mock-a/com.plexapp.plugins.library/library/metadata/3' }], 'D200: a play queue of the one item is made first');
    assert.deepEqual(commands.map(({ commandID: _c, forwarded: _f, ...rest }) => rest), [
      { key: '/library/metadata/3', offset: 83456, machineIdentifier: 'mock-a', address: '127.0.0.1', port: String(a.port), protocol: 'http', providerIdentifier: 'com.plexapp.plugins.library', type: 'video', containerKey: '/playQueues/9001?window=100&own=1', target: 'tv-living', playerToken: 'transient-mock-1', tokenLike: false, tokenParams: 1 },
    ]);
    assert.ok(Number(commands[0].commandID) > 0);
    const playCall = calls.find((c) => c.url.pathname === '/player/playback/playMedia');
    assert.equal(playCall.url.origin, a.url, 'to the server\'s own address');
    assert.equal(playCall.url.searchParams.get('X-Plex-Token'), TOKEN);
    assert.deepEqual(Object.keys(playCall.init.headers), ['Accept'], 'CORS-simple: no custom header');
    assert.deepEqual(calls.map((c) => [c.url.origin, c.url.pathname, c.init.method]), [[a.url, '/', 'GET'], [a.url, '/playQueues', 'POST'], [a.url, '/security/token', 'GET'], [a.url, '/player/playback/playMedia', 'GET']], 'the identity read, the play queue, the token for the player (D201) and the command, all to this server');
    assert.ok(calls.every((c) => Object.keys(c.init.headers).join() === 'Accept' && c.url.searchParams.getAll('X-Plex-Token').join() === TOKEN), 'each CORS-simple, each with this server\'s sign-in');
    assert.ok(calls.every((c) => !/192\.0\.2\./.test(c.url.hostname)), 'no player address');
    assert.deepEqual(commands[0].forwarded.filter((n) => /token/i.test(n)), ['token'], 'the one token the player gets is the short-lived one (D201), not this display\'s sign-in');
  } finally {
    await stop(a.server);
  }
});

test('the play command counts up its command id, sends offset 0 as 0, and clamps or rounds a bad offset', async () => {
  const a = await startPlex('mock-a');
  try {
    const client = createPlexClient({ serverUrl: a.url, token: TOKEN, clientId: 'd' });
    for (const offset of [0, -5, NaN, undefined, 99.6]) await playOn(client, { key: '3', offset, target: 'tv' });
    const { commands } = await logOf(a.url);
    assert.deepEqual(commands.map((c) => c.offset), [0, 0, 0, 0, 100]);
    const ids = commands.map((c) => Number(c.commandID));
    assert.deepEqual(ids, [...ids].sort((x, y) => x - y));
    assert.equal(new Set(ids).size, ids.length);
  } finally {
    await stop(a.server);
  }
});

test('play: no item, no target or no identifier is not sent; an address that is no address is not sent; a server that does not say who it is has no identifier to read', async () => {
  const calls = [];
  const fetchImpl = async (url) => (calls.push(url), new Response(JSON.stringify({ MediaContainer: { friendlyName: 'x' } }), { status: 200 }));
  const client = createPlexClient({ serverUrl: 'http://h:32400', token: 't', clientId: 'd', fetchImpl });
  await assert.rejects(client.play({ key: '', target: 'tv', machineIdentifier: 'm' }), { kind: 'config' });
  await assert.rejects(client.play({ key: '3', target: '', machineIdentifier: 'm' }), { kind: 'config' });
  await assert.rejects(client.play({ key: '3', target: 'tv' }), { kind: 'config' });
  assert.deepEqual(calls, [], 'no request');
  await assert.rejects(client.machineIdentifier(), { kind: 'parse' });
  assert.equal(calls.length, 1, 'only the identity read');
  await assert.rejects(createPlexClient({ serverUrl: 'not an address', token: 't', clientId: 'd', fetchImpl }).play({ key: '3', target: 'tv', machineIdentifier: 'm' }), { kind: 'config' });
  assert.equal(calls.length, 1, 'and no command');
});

test('play starts its first requests, the play queue\'s and the player token\'s, in the turn it is called: nothing waits between a caller\'s last check and the send (D200, D201)', () => {
  const calls = [];
  const fetchImpl = (url) => (calls.push(new URL(url).pathname), new Promise(() => {}));
  const client = createPlexClient({ serverUrl: 'http://h:32400', token: 't', clientId: 'd', fetchImpl });
  client.play({ key: '3', target: 'tv', machineIdentifier: 'm' });
  assert.deepEqual(calls, ['/playQueues', '/security/token'], 'the requests left before any await of the caller');
});

test('play: a server that makes no play queue still gets the command, without one; a server that does not answer or refuses gets none (D200)', async () => {
  const run = async (queueAnswer) => {
    const calls = [];
    const fetchImpl = async (url) => {
      const u = new URL(url);
      calls.push(u);
      if (u.pathname === '/playQueues') return queueAnswer();
      return new Response('', { status: 200 });
    };
    const error = await createPlexClient({ serverUrl: 'http://h:32400', token: 't', clientId: 'd', fetchImpl }).play({ key: '3', target: 'tv', machineIdentifier: 'm' }).then(() => null, (e) => e);
    const command = calls.find((u) => u.pathname === '/player/playback/playMedia');
    return { kind: error?.kind ?? null, sent: Boolean(command), containerKey: command?.searchParams.get('containerKey') ?? null, type: command?.searchParams.get('type') ?? null };
  };
  const json = (body, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  assert.deepEqual(await run(json({ MediaContainer: { playQueueID: 42 } })), { kind: null, sent: true, containerKey: '/playQueues/42?window=100&own=1', type: 'video' });
  for (const [label, answer] of [['HTTP 404', json({}, 404)], ['HTTP 500', json({}, 500)], ['no id', json({ MediaContainer: {} })], ['an id that is not a number', json({ MediaContainer: { playQueueID: '7?x=1&own=0' } })], ['not JSON', () => new Response('nope', { status: 200 })]]) {
    assert.deepEqual(await run(answer), { kind: null, sent: true, containerKey: null, type: 'video' }, label);
  }
  assert.deepEqual(await run(json({}, 401)), { kind: 'auth', sent: false, containerKey: null, type: null });
  assert.deepEqual(await run(() => { throw new TypeError('Failed to fetch'); }), { kind: 'network', sent: false, containerKey: null, type: null });
  assert.deepEqual(await run(() => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); }), { kind: 'timeout', sent: false, containerKey: null, type: null });
});

test('play: a request that got no answer in time is an error of kind timeout (it may have arrived), one that could not be made is kind network', async () => {
  const make = (error) => createPlexClient({ serverUrl: 'http://h:32400', token: 't', clientId: 'd', fetchImpl: async () => { throw error; } });
  const timedOut = await make(Object.assign(new Error('x'), { name: 'TimeoutError' })).play({ key: '3', target: 'tv', machineIdentifier: 'm' }).catch((e) => e);
  assert.equal(timedOut.kind, 'timeout');
  const refused = await make(new TypeError('Failed to fetch')).play({ key: '3', target: 'tv', machineIdentifier: 'm' }).catch((e) => e);
  assert.equal(refused.kind, 'network');
});

test('play: the port is the server\'s own, 443 for an https address with none and 80 for http', async () => {
  const urls = [];
  const fetchImpl = async (url) => (urls.push(new URL(url)), new Response(JSON.stringify({ MediaContainer: { machineIdentifier: 'm' } }), { status: 200 }));
  await playOn(createPlexClient({ serverUrl: 'https://plex.example.com', token: 't', clientId: 'd', fetchImpl }), { key: '3', target: 'tv' });
  await playOn(createPlexClient({ serverUrl: 'http://192.168.1.5', token: 't', clientId: 'd', fetchImpl }), { key: '3', target: 'tv' });
  const plays = urls.filter((u) => u.pathname === '/player/playback/playMedia');
  assert.deepEqual(plays.map((u) => [u.searchParams.get('protocol'), u.searchParams.get('address'), u.searchParams.get('port')]), [['https', 'plex.example.com', '443'], ['http', '192.168.1.5', '80']]);
});

test('play: the server answering with an error, a refused sign-in or nothing is an error of that kind, with no token in its message', async () => {
  const a = await startPlex('mock-a');
  try {
    const client = createPlexClient({ serverUrl: a.url, token: TOKEN, clientId: 'd' });
    for (const [mode, kind, status] of [['player', 'http', 404], ['server', 'http', 503], ['auth', 'auth', 401]]) {
      await fetch(`${a.url}/__mock/player-fail?mode=${mode}`, { method: 'POST' });
      const error = await playOn(client, { key: '3', target: 'tv' }).then(() => null, (e) => e);
      assert.deepEqual([error.kind, error.status], [kind, status], mode);
      assert.doesNotMatch(error.message, new RegExp(TOKEN));
    }
    const { commands, received } = await logOf(a.url);
    assert.deepEqual([commands.length, received], [0, 3], 'a failed forward reaches no player');
    await fetch(`${a.url}/__mock/player-reset`, { method: 'POST' });
    await playOn(client, { key: '3', target: 'tv' });
    assert.equal((await logOf(a.url)).commands.length, 1, 'normal again after the reset');
  } finally {
    await stop(a.server);
  }
  const dead = createPlexClient({ serverUrl: a.url, token: TOKEN, clientId: 'd' });
  await assert.rejects(playOn(dead, { key: '3', target: 'tv' }), { kind: 'network' });
});

test('savedPosition: the item\'s viewOffset in ms, 0 when it has none, an error when the item is gone or the server refuses', async () => {
  const a = await startPlex('mock-a');
  try {
    const client = createPlexClient({ serverUrl: a.url, token: TOKEN, clientId: 'd' });
    assert.equal(await client.savedPosition({ key: '3' }), 0);
    await fetch(`${a.url}/__mock/offset?ratingKey=3&viewOffset=1234567`, { method: 'POST' });
    assert.equal(await client.savedPosition({ key: '3' }), 1234567);
    await fetch(`${a.url}/__mock/offset?ratingKey=3&viewOffset=0`, { method: 'POST' });
    assert.equal(await client.savedPosition({ key: '3' }), 0);
    await assert.rejects(client.savedPosition({ key: '999' }), { kind: 'http' });
    await assert.rejects(createPlexClient({ serverUrl: a.url, token: 'wrong', clientId: 'd' }).savedPosition({ key: '3' }), { kind: 'auth' });
    const odd = createPlexClient({ serverUrl: 'http://h:1', token: 't', clientId: 'd', fetchImpl: async () => new Response(JSON.stringify({ MediaContainer: { Metadata: [] } })) });
    await assert.rejects(odd.savedPosition({ key: '3' }), { kind: 'http', status: 404 });
  } finally {
    await stop(a.server);
  }
});

test('the mock lists a title as an episode on request: the poster carries the series\' key and title, the episode\'s own key to play and read', async () => {
  const a = await startPlex('mock-a');
  try {
    await fetch(`${a.url}/__mock/episode?ratingKey=2`, { method: 'POST' });
    await fetch(`${a.url}/__mock/offset?ratingKey=2&viewOffset=42000`, { method: 'POST' });
    const client = createPlexClient({ serverUrl: a.url, token: TOKEN, clientId: 'd' });
    const posters = await client.pool({ libraryKey: '1', unwatchedOnly: false, size: 20 });
    const episode = posters.find((p) => p.kind === 'episode');
    assert.deepEqual([episode.ratingKey, episode.playKey, episode.title], ['2', '502', 'Midnight Projector']);
    assert.equal(await client.savedPosition({ key: episode.playKey }), 42000);
    await playOn(client, { key: episode.playKey, target: 'tv' });
    assert.equal((await logOf(a.url)).commands[0].key, '/library/metadata/502');
  } finally {
    await stop(a.server);
  }
});

test('the Plex client has Play now\'s members as ordinary members, the Jellyfin and Emby clients none of them', () => {
  const plex = createPlexClient({ serverUrl: 'http://h', token: 't', clientId: 'd' });
  for (const name of PLEX_ONLY_MEMBERS) assert.equal(typeof plex[name], 'function', name);
  assert.deepEqual(PLEX_ONLY_MEMBERS, ['savedPosition', 'machineIdentifier', 'play']);
  for (const type of ['jellyfin', 'emby']) {
    const other = createSource({ serverType: type, serverUrl: 'http://h', plexToken: 't', serverUserId: 'u' });
    for (const name of PLEX_ONLY_MEMBERS) assert.equal(name in other, false, `${type} has no ${name}`);
  }
});

test('a source over several servers sends the command to the poster\'s own server, by its scoped id, and to no other', async () => {
  const a = await startPlex('mock-a');
  const b = await startPlex('mock-b');
  try {
    const settings = sanitize({
      serverType: 'plex', serverUrl: a.url, plexToken: TOKEN, serverId: 'mock-a',
      servers: [{ id: 'mock-b', type: 'plex', url: b.url, token: TOKEN, userId: '', name: 'Second' }],
    });
    const source = createSources(settings, { clientId: 'display-1' });
    await fetch(`${b.url}/__mock/offset?ratingKey=3&viewOffset=7000`, { method: 'POST' });
    // The poster of the second server carries its scoped id; the first server's is bare.
    assert.equal(await source.savedPosition({ id: '@mock-b/3', key: '3' }), 7000);
    assert.equal(await source.savedPosition({ id: '3', key: '3' }), 0);
    const [idB, idA] = [await source.machineIdentifier({ id: '@mock-b/3' }), await source.machineIdentifier({ id: '3' })];
    assert.deepEqual([idB, idA], ['mock-b', 'mock-a'], 'each poster is asked who its own server is');
    await source.play({ id: '@mock-b/3', key: '3', offset: 7000, target: 'tv-b', machineIdentifier: idB });
    await source.play({ id: '3', key: '3', offset: 0, target: 'tv-a', machineIdentifier: idA });
    const [onA, onB] = [await logOf(a.url), await logOf(b.url)];
    assert.deepEqual(onA.commands.map((c) => [c.machineIdentifier, c.target, c.offset]), [['mock-a', 'tv-a', 0]]);
    assert.deepEqual(onB.commands.map((c) => [c.machineIdentifier, c.target, c.offset]), [['mock-b', 'tv-b', 7000]]);
    await assert.rejects(source.play({ id: '@gone/3', key: '3', target: 'tv', machineIdentifier: 'm' }), { kind: 'config' });
    await assert.rejects(source.machineIdentifier({ id: '@gone/3' }), { kind: 'config' });
    await assert.rejects(source.savedPosition({ id: '@gone/3', key: '3' }), { kind: 'config' });
  } finally {
    await stop(a.server, b.server);
  }
});

test('a source over several servers has no play command for a Jellyfin or an Emby poster', async () => {
  const a = await startPlex('mock-a');
  try {
    const settings = sanitize({
      serverType: 'plex', serverUrl: a.url, plexToken: TOKEN, serverId: 'mock-a',
      servers: [{ id: 'jf-1', type: 'jellyfin', url: 'http://127.0.0.1:1', token: 'jf', userId: '', name: 'Den' }],
    });
    const source = createSources(settings, { clientId: 'display-1' });
    await assert.rejects(source.play({ id: '@jf-1/abc', key: 'abc', target: 'tv', machineIdentifier: 'm' }), { kind: 'config', message: /Jellyfin cannot start a title on a player/ });
    await assert.rejects(source.machineIdentifier({ id: '@jf-1/abc' }), { kind: 'config' });
    await assert.rejects(source.savedPosition({ id: '@jf-1/abc', key: 'abc' }), { kind: 'config' });
    assert.equal((await logOf(a.url)).received, 0, 'nothing reached the Plex server either');
  } finally {
    await stop(a.server);
  }
});

test('play: the command carries a short-lived token for the player when the server gives one, and goes without when it does not; it reports what was sent and what the server shows afterwards (D201)', async () => {
  const run = async ({ tokenAnswer, sessions = { MediaContainer: {} }, reply = '<Response code="200" status="OK"/>' }) => {
    const calls = [];
    const fetchImpl = async (url) => {
      const u = new URL(url);
      calls.push(u);
      if (u.pathname === '/playQueues') return new Response(JSON.stringify({ MediaContainer: { playQueueID: 7 } }), { status: 200 });
      if (u.pathname === '/security/token') return tokenAnswer();
      if (u.pathname === '/status/sessions') return typeof sessions === 'function' ? sessions() : new Response(JSON.stringify(sessions), { status: 200 });
      return new Response(reply, { status: 200 });
    };
    const sent = await createPlexClient({ serverUrl: 'http://h:32400', token: 'server-secret', clientId: 'd', fetchImpl }).play({ key: '3', target: 'tv', machineIdentifier: 'm' });
    const command = calls.find((u) => u.pathname === '/player/playback/playMedia');
    const { confirm, ...report } = sent;
    return { token: command.searchParams.get('token'), report, state: await confirm({ waitMs: 0 }), text: JSON.stringify(report) };
  };
  const json = (body, status = 200) => () => new Response(JSON.stringify(body), { status });
  const ok = await run({ tokenAnswer: json({ MediaContainer: { token: 'transient-abc' } }), sessions: { MediaContainer: { Metadata: [{ Player: { machineIdentifier: 'other', state: 'playing' } }, { Player: { machineIdentifier: 'tv', state: 'paused' } }] } } });
  assert.deepEqual(ok, { token: 'transient-abc', report: { queue: true, token: true, reply: '200 OK', started: false }, state: 'paused', text: ok.text });
  assert.equal(/transient-abc|server-secret|h:32400/.test(ok.text), false, 'the report for Diagnostics holds no token and no address');
  for (const [label, tokenAnswer] of [['HTTP 403', json({}, 403)], ['HTTP 500', json({}, 500)], ['no token', json({ MediaContainer: {} })], ['not JSON', () => new Response('nope', { status: 200 })], ['no answer', () => { throw new TypeError('Failed to fetch'); }]]) {
    const none = await run({ tokenAnswer, reply: '' });
    assert.deepEqual([none.token, none.report, none.state], [null, { queue: true, token: false, reply: '', started: false }, 'nothing'], label);
  }
  assert.equal((await run({ tokenAnswer: json({}), sessions: () => new Response('{}', { status: 500 }) })).state, 'unknown');
});

test('play: a player that starts the item while the command is unanswered is a success, not a timeout (D202)', async () => {
  const run = async ({ sessions, command }) => {
    let polls = 0;
    const fetchImpl = async (url, init) => {
      const u = new URL(url);
      if (u.pathname === '/playQueues') return new Response(JSON.stringify({ MediaContainer: { playQueueID: 7 } }), { status: 200 });
      if (u.pathname === '/security/token') return new Response(JSON.stringify({ MediaContainer: { token: 'x' } }), { status: 200 });
      if (u.pathname === '/status/sessions') return new Response(JSON.stringify({ MediaContainer: { Metadata: sessions(++polls) } }), { status: 200 });
      return command(init);
    };
    const result = await createPlexClient({ serverUrl: 'http://h:32400', token: 't', clientId: 'd', fetchImpl }).play({ key: '3', target: 'tv', machineIdentifier: 'm', pollMs: 5 }).then(({ confirm: _c, ...r }) => r, (e) => ({ kind: e.kind }));
    return { result, polls };
  };
  const mine = [{ ratingKey: '3', Player: { machineIdentifier: 'tv', state: 'playing' } }];
  const never = () => new Promise(() => {});
  const timeout = async () => { await new Promise((r) => setTimeout(r, 30)); throw Object.assign(new Error('x'), { name: 'TimeoutError' }); };
  // The command hangs; the second look finds the session.
  const hung = await run({ sessions: (n) => (n >= 2 ? mine : []), command: never });
  assert.deepEqual(hung.result, { queue: true, token: true, reply: 'none yet, and the server shows the player playing', started: true });
  // Another title on that player, or this title on another player, is not it: the command times out and that is what is said.
  for (const other of [[{ ratingKey: '9', Player: { machineIdentifier: 'tv', state: 'playing' } }], [{ ratingKey: '3', Player: { machineIdentifier: 'phone', state: 'playing' } }], []]) {
    assert.deepEqual((await run({ sessions: () => other, command: timeout })).result, { kind: 'timeout' });
  }
  // The session shows only at the last look, after the timeout.
  let late = false;
  const atLast = await run({ sessions: () => (late ? mine : []), command: async () => { await new Promise((r) => setTimeout(r, 12)); late = true; throw Object.assign(new Error('x'), { name: 'TimeoutError' }); } });
  assert.deepEqual(atLast.result, { queue: true, token: true, reply: 'none in time, and the server shows the player playing', started: true });
  // A refused command is refused, whatever the sessions say afterwards.
  assert.deepEqual((await run({ sessions: () => [], command: async () => new Response('', { status: 404 }) })).result, { kind: 'http' });
  assert.equal(acceptedText({ title: 'Heat', device: 'TV', server: 'Castle', sent: hung.result }), 'Play now: Castle shows TV playing "Heat" before it answered the command (play queue: yes, token for the player: yes, the answer: none yet, and the server shows the player playing).');
});

test('flow: a Play now is written to Diagnostics: the accepted command with what it carried, what the server shows afterwards, and every failure or refusal (D201)', async () => {
  assert.equal(acceptedText({ title: 'Heat', device: 'TV', server: 'Castle', sent: { queue: true, token: false, reply: '200 OK' } }), 'Play now: Castle accepted the command to play "Heat" on TV (play queue: yes, token for the player: no, the answer: 200 OK).');
  assert.equal(acceptedText({ title: 'Heat', device: 'TV', server: 'Castle', sent: undefined }), 'Play now: Castle accepted the command to play "Heat" on TV.');
  assert.match(confirmText({ device: 'TV', server: 'Castle', state: 'nothing' }), /shows nothing playing on TV\. The player took the command and did not start\./);
  assert.equal(confirmText({ device: 'TV', server: 'Castle', state: 'playing' }), 'Play now: a few seconds later Castle shows TV playing.');
  assert.match(confirmText({ device: 'TV', server: 'Castle', state: 'unknown' }), /could not be asked/);
  assert.equal(sendErrorDetail({ kind: 'http', status: 404 }), 'http, HTTP 404');
  assert.equal(sendErrorDetail({ kind: 'timeout' }), 'timeout');
  assert.equal(sendErrorDetail(new Error('x')), 'unexpected');
  // The flow writes them: an accepted command and its check, a failed send with its kind, a refusal before any send.
  const notes = [];
  const note = (level, text) => notes.push([level, text]);
  const ok = rig({ deps: { note, play: async () => ({ queue: true, token: true, reply: '200 OK', confirm: async () => 'nothing' }) } });
  await ok.flow.press();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(notes.map(([level]) => level), ['info', 'warn']);
  assert.match(notes[0][1], /^Play now: Mock Plex accepted the command to play "Velvet Curtain" on Living Room TV \(play queue: yes, token for the player: yes, the answer: 200 OK\)\.$/);
  assert.match(notes[1][1], /shows nothing playing on Living Room TV/);
  notes.length = 0;
  const bad = rig({ deps: { note, play: async () => { throw new SourceError('Plex returned HTTP 404.', { kind: 'http', status: 404 }); } } });
  await bad.flow.press();
  assert.equal(notes.length, 1);
  assert.equal(notes[0][0], 'warn');
  assert.ok(notes[0][1].startsWith(bad.said[0]) && notes[0][1].endsWith('(http, HTTP 404)'), notes[0][1]);
  notes.length = 0;
  const old = rig({ deps: { note, play: async () => undefined } }); // a play that reports nothing still gets its line
  await old.flow.press();
  assert.deepEqual(notes, [['info', 'Play now: Mock Plex accepted the command to play "Velvet Curtain" on Living Room TV.']]);
});

test('the token goes to the server alone: not in the command the player receives, and the players read goes to plex.tv and the server only (D199)', async () => {
  const a = await startPlex('mock-a');
  try {
    const calls = [];
    const fetchImpl = (url, init) => (calls.push(String(url)), fetch(url, init));
    const client = createPlexClient({ serverUrl: a.url, token: TOKEN, clientId: 'd', fetchImpl });
    await playOn(client, { key: '3', offset: 5, target: 'tv-living' });
    const command = (await logOf(a.url)).commands[0];
    assert.equal(command.tokenLike, false);
    assert.equal(command.tokenParams, 1, 'one X-Plex-Token: the server\'s');
    assert.equal(JSON.stringify(command).includes(TOKEN), false, 'the record of what the player received holds no token');
    const read = [];
    await readPlayers(sanitize({ serverUrl: a.url, plexToken: 'tok', serverId: 'm' }), { clientId: 'd', fetchImpl: async (url) => (read.push(String(url)), new Response('[]', { status: 200 })) });
    assert.deepEqual([...new Set(read.map((u) => new URL(u).origin))].sort(), ['https://plex.tv', new URL(a.url).origin].sort(), 'plex.tv and the household\'s own server, nowhere else');
  } finally {
    await stop(a.server);
  }
});
