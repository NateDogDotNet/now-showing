import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../js/engine.js';
import { defaults } from '../js/settings.js';
import { createSource } from '../js/sources/index.js';

// The fake stands in for an adapter: reading a session is the Plex adapter's own nowPlaying, so these cases keep their Plex session shapes.
const { nowPlaying } = createSource({ serverUrl: 'http://s', plexToken: 't' });

function fakeClient({ sessions = [], pool = [], itemRating = '' } = {}) {
  const calls = { pool: 0, sessions: 0, item: 0, poolArgs: [] };
  return {
    calls,
    sessions: async () => (calls.sessions++, sessions),
    nowPlaying,
    pool: async (args) => (calls.pool++, calls.poolArgs.push(args), pool),
    item: async (key) => (calls.item++, { ratingKey: key, title: `Item ${key}`, thumb: `/t/${key}`, source: 'static', contentRating: itemRating }),
  };
}

const poster = (k) => ({ ratingKey: k, title: `Movie ${k}`, thumb: `/t/${k}`, source: 'random' });

function setup(overrides = {}, clientOpts = {}, random = () => 0) {
  let t = 1_000_000;
  const settings = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', ...overrides };
  const client = fakeClient(clientOpts);
  const engine = createEngine({ client, getSettings: () => settings, now: () => t, random });
  return { engine, client, settings, advance: (ms) => (t += ms) };
}

test('first decision picks a random poster; later ones wait for the rotation interval', async () => {
  const { engine, advance } = setup({ rotateSeconds: 60 }, { pool: [poster('a'), poster('b')] });
  const first = await engine.decide();
  assert.equal(first.reason, 'rotation');
  engine.shown(first.poster);

  advance(30_000);
  assert.equal(await engine.decide(), null);

  advance(31_000);
  const next = await engine.decide();
  assert.notEqual(next.poster.ratingKey, first.poster.ratingKey);
});

test('force always produces a new poster', async () => {
  const { engine } = setup({}, { pool: [poster('a'), poster('b')] });
  engine.shown((await engine.decide()).poster);
  const forced = await engine.decide({ force: true });
  assert.equal(forced.reason, 'manual refresh');
});

test('now playing takes over and rotation resumes when playback ends', async () => {
  const sessions = [{ type: 'movie', ratingKey: 'np', title: 'Playing', thumb: '/t/np', User: { title: 'me' }, Player: { state: 'playing' } }];
  const { engine, client } = setup({}, { sessions, pool: [poster('a')] });
  const d = await engine.decide();
  assert.equal(d.poster.source, 'now-playing');
  engine.shown(d.poster);
  assert.equal(await engine.decide(), null, 'same session does not re-render');

  sessions.length = 0;
  const after = await engine.decide();
  assert.equal(after.reason, 'playback ended');
  assert.equal(client.calls.pool, 1);
});

test('the random pool is cached between rotations', async () => {
  const { engine, client, advance } = setup({ rotateSeconds: 10 }, { pool: [poster('a'), poster('b')] });
  for (let i = 0; i < 4; i++) {
    engine.shown((await engine.decide({ force: true })).poster);
    advance(11_000);
  }
  assert.equal(client.calls.pool, 1);
});

test('recent posters are avoided', async () => {
  const pool = ['a', 'b', 'c'].map(poster);
  const { engine } = setup({}, { pool });
  const seen = [];
  for (let i = 0; i < 3; i++) {
    const d = await engine.decide({ force: true });
    engine.shown(d.poster);
    seen.push(d.poster.ratingKey);
  }
  assert.deepEqual([...seen].sort(), ['a', 'b', 'c']);
});

test('a pinned poster replaces rotation but not now playing', async () => {
  const sessions = [];
  const { engine, client, advance } = setup({ staticRatingKey: '42', rotateSeconds: 10 }, { sessions, pool: [poster('a')] });
  const d = await engine.decide();
  assert.equal(d.poster.ratingKey, '42');
  engine.shown(d.poster);
  advance(60_000);
  assert.equal(await engine.decide(), null);
  assert.equal(client.calls.pool, 0);

  sessions.push({ type: 'movie', ratingKey: 'np', title: 'Playing', thumb: '/t/np' });
  assert.equal((await engine.decide()).poster.source, 'now-playing');
});

test('an empty library is reported', async () => {
  const { engine } = setup({}, { pool: [] });
  await assert.rejects(engine.decide(), { kind: 'empty' });
});

test('playing() returns the session without fetching art or touching the pool', async () => {
  const sessions = [{ type: 'movie', ratingKey: 'np', title: 'Playing', thumb: '/t/np', User: { title: 'me' }, Player: { state: 'playing' } }];
  const { engine, client } = setup({}, { sessions, pool: [poster('a')] });
  const np = await engine.playing();
  assert.equal(np.ratingKey, 'np');
  assert.equal(np.source, 'now-playing');
  assert.equal(client.calls.sessions, 1);
  assert.equal(client.calls.pool, 0);
  assert.equal(client.calls.item, 0);
  assert.equal(engine.current, null, 'playing() does not record anything as shown');
});

test('playing() returns null when nothing is playing', async () => {
  const { engine } = setup({}, { sessions: [] });
  assert.equal(await engine.playing(), null);
});

test('playing() works with showNowPlaying off', async () => {
  const sessions = [{ type: 'movie', ratingKey: 'np', title: 'Playing', thumb: '/t/np' }];
  const { engine } = setup({ showNowPlaying: false }, { sessions });
  assert.equal((await engine.playing())?.ratingKey, 'np');
});

test('playing() honours username and includeEpisodes', async () => {
  const sessions = [
    { type: 'episode', ratingKey: 'e1', grandparentRatingKey: 'show', grandparentTitle: 'Show', title: 'Ep', grandparentThumb: '/t/show', User: { title: 'Kid' } },
  ];
  assert.equal((await setup({ username: 'someone else' }, { sessions }).engine.playing()), null);
  assert.equal((await setup({ username: 'kid' }, { sessions }).engine.playing())?.ratingKey, 'show');
  assert.equal(await setup({ includeEpisodes: false }, { sessions }).engine.playing(), null);
});

test('playing() propagates a connection error', async () => {
  const client = { ...fakeClient(), sessions: async () => { throw Object.assign(new Error('down'), { kind: 'network' }); } };
  const engine = createEngine({ client, getSettings: () => ({ ...defaults(), libraryKey: '1' }) });
  await assert.rejects(engine.playing(), { kind: 'network' });
});

// One /status/sessions request per tick: main.js fetches the sessions once and hands them to both.
const NP = [{ type: 'movie', ratingKey: 'np', title: 'Playing', thumb: '/t/np', User: { title: 'me' }, Player: { state: 'playing' } }];

test('playing(sessions) uses the sessions it is given and fetches nothing', async () => {
  const { engine, client } = setup({}, { sessions: [], pool: [poster('a')] });
  assert.equal((await engine.playing(NP))?.ratingKey, 'np');
  assert.equal(await engine.playing([]), null);
  assert.equal(client.calls.sessions, 0);
});

test('decide({ sessions }) shows the given now-playing session without a second sessions request', async () => {
  const { engine, client } = setup({}, { sessions: [], pool: [poster('a')] });
  const d = await engine.decide({ sessions: NP });
  assert.equal(d.poster.source, 'now-playing');
  assert.equal(d.reason, 'now playing for me');
  assert.equal(client.calls.sessions, 0);
});

test('decide({ sessions: [] }) means nothing is playing: rotation, and still no sessions request', async () => {
  const { engine, client } = setup({}, { sessions: NP, pool: [poster('a')] });
  const d = await engine.decide({ sessions: [] });
  assert.equal(d.poster.source, 'random');
  assert.equal(client.calls.sessions, 0);
});

test('decide() without sessions still fetches them itself', async () => {
  const { engine, client } = setup({}, { sessions: NP, pool: [poster('a')] });
  assert.equal((await engine.decide()).poster.source, 'now-playing');
  assert.equal(client.calls.sessions, 1);
});

// ---- content rating (R-FILT-1, D5): the client-side ladder is the guarantee ----

const rated = (k, contentRating) => ({ ...poster(k), contentRating });
const MIXED = [rated('g', 'G'), rated('pg13', 'PG-13'), rated('r', 'R'), rated('tvma', 'TV-MA'), rated('nc', 'NC-17'), rated('gb15', 'gb/15'), rated('gbxx', 'gb/XX'), rated('blank', ''), poster('missing')];
const playingRated = (contentRating, extra = {}) => [{ type: 'movie', ratingKey: 'np', title: 'Playing', thumb: '/t/np', contentRating, User: { title: 'me' }, Player: { state: 'playing' }, ...extra }];

async function everyPick(engine, rounds = 60) {
  const seen = new Set();
  for (let i = 0; i < rounds; i++) {
    const d = await engine.decide({ force: true });
    seen.add(d.poster.ratingKey);
    engine.shown(d.poster);
  }
  return seen;
}

// A small deterministic generator, so every allowed poster gets picked within a few rounds.
const spread = () => {
  let n = 7;
  return () => ((n = (n * 37 + 11) % 101) / 101);
};

test('with a limit, only posters at or below it are ever picked, even when the server returns everything', async () => {
  const { engine } = setup({ maxContentRating: 'PG-13' }, { pool: MIXED }, spread());
  assert.deepEqual([...(await everyPick(engine))].sort(), ['g', 'pg13']);
});

test('under R the same rung (TV-MA, gb/15) is allowed but NC-17, unmapped and unrated are not', async () => {
  const { engine } = setup({ maxContentRating: 'R' }, { pool: MIXED }, spread());
  assert.deepEqual([...(await everyPick(engine, 120))].sort(), ['g', 'gb15', 'pg13', 'r', 'tvma']);
});

test('under NC-17 every mapped rating is allowed but unrated and unmapped still are not', async () => {
  const { engine } = setup({ maxContentRating: 'NC-17' }, { pool: MIXED }, spread());
  assert.deepEqual([...(await everyPick(engine, 150))].sort(), ['g', 'gb15', 'nc', 'pg13', 'r', 'tvma']);
});

test('with no limit nothing is filtered, unrated included', async () => {
  const { engine } = setup({ maxContentRating: '' }, { pool: MIXED }, spread());
  assert.equal((await everyPick(engine, 200)).size, MIXED.length);
});

test('pool() is asked for the limit and the pool size', async () => {
  const { engine, client } = setup({ maxContentRating: 'PG', randomPoolSize: 77, libraryKey: '1', unwatchedOnly: false }, { pool: MIXED });
  await engine.decide();
  assert.deepEqual(client.calls.poolArgs, [{ libraryKey: '1', unwatchedOnly: false, size: 77, maxContentRating: 'PG' }]);
});

test('the pool cache key includes the limit', async () => {
  const { engine, client, settings } = setup({ maxContentRating: 'PG-13' }, { pool: MIXED });
  await engine.decide({ force: true });
  await engine.decide({ force: true });
  assert.equal(client.calls.pool, 1, 'same limit: cached');
  settings.maxContentRating = 'R';
  const d = await engine.decide({ force: true });
  assert.equal(client.calls.pool, 2, 'new limit: reloaded');
  assert.equal(client.calls.poolArgs[1].maxContentRating, 'R');
  settings.maxContentRating = '';
  await engine.decide({ force: true });
  assert.equal(client.calls.pool, 3);
  assert.ok(d);
});

test('lowering the limit takes effect at once even from a pool loaded under a higher one', async () => {
  const { engine, settings } = setup({ maxContentRating: 'NC-17' }, { pool: MIXED });
  await engine.decide({ force: true });
  settings.maxContentRating = 'G';
  assert.deepEqual([...(await everyPick(engine))], ['g']);
});

test('an empty result throws the empty error with a hint to raise the limit', async () => {
  const { engine } = setup({ maxContentRating: 'G' }, { pool: [rated('r', 'R'), rated('x', '')] });
  await assert.rejects(engine.decide(), (err) => err.kind === 'empty' && /raise the limit/.test(err.message));
});

test('no limit: an empty library keeps the plain empty error', async () => {
  const { engine } = setup({}, { pool: [] });
  await assert.rejects(engine.decide(), (err) => err.kind === 'empty' && !/raise the limit/.test(err.message));
});

// K54: the empty-library message only suggests turning off "unwatched only" when that setting is on.
const emptyMessage = async (overrides) => {
  const { engine } = setup(overrides, { pool: overrides.maxContentRating ? [rated('r', 'R')] : [] }); // nothing allowed through
  const err = await engine.decide().then(
    () => assert.fail('expected the empty error'),
    (e) => e,
  );
  assert.equal(err.kind, 'empty');
  return err.message;
};

test('empty hint without a limit: "unwatched only" is suggested only while it is on', async () => {
  const on = await emptyMessage({ unwatchedOnly: true, maxContentRating: '' });
  assert.match(on, /try turning off "unwatched only"/);
  assert.doesNotMatch(on, /raise the limit/);
  const off = await emptyMessage({ unwatchedOnly: false, maxContentRating: '' });
  assert.doesNotMatch(off, /unwatched only/);
  assert.doesNotMatch(off, /raise the limit/);
  assert.match(off, /^No posters found in that library\.$/);
});

test('empty hint with a limit: "unwatched only" is suggested only while it is on, the limit always', async () => {
  const on = await emptyMessage({ unwatchedOnly: true, maxContentRating: 'G' });
  assert.match(on, /at or below G/);
  assert.match(on, /try turning off "unwatched only"/);
  assert.match(on, /raise the limit/);
  const off = await emptyMessage({ unwatchedOnly: false, maxContentRating: 'G' });
  assert.match(off, /at or below G/);
  assert.doesNotMatch(off, /unwatched only/);
  assert.match(off, /raise the limit/);
});

test('now playing above the limit is treated as nothing playing: a random allowed poster is shown', async () => {
  const { engine } = setup({ maxContentRating: 'PG-13' }, { sessions: playingRated('R'), pool: MIXED });
  const d = await engine.decide();
  assert.equal(d.poster.source, 'random');
  assert.ok(['g', 'pg13'].includes(d.poster.ratingKey));
});

test('now playing that is unrated, empty or unmapped is nothing playing while a limit is set', async () => {
  for (const sessions of [playingRated(undefined), playingRated(''), playingRated('gb/XX'), playingRated('TV-MA'), playingRated('gb/15')]) {
    const { engine } = setup({ maxContentRating: 'PG-13' }, { sessions, pool: MIXED });
    assert.equal((await engine.decide()).poster.source, 'random', JSON.stringify(sessions[0].contentRating));
  }
});

test('now playing at or below the limit is shown', async () => {
  for (const rating of ['PG-13', 'TV-14', 'G', 'gb/12']) {
    const { engine } = setup({ maxContentRating: 'PG-13' }, { sessions: playingRated(rating), pool: MIXED });
    assert.equal((await engine.decide()).poster.source, 'now-playing', rating);
  }
});

test('limitNowPlaying:false shows any playing title under a limit', async () => {
  for (const rating of ['R', undefined, 'gb/XX']) {
    const { engine } = setup({ maxContentRating: 'PG-13', limitNowPlaying: false }, { sessions: playingRated(rating), pool: MIXED });
    assert.equal((await engine.decide()).poster.source, 'now-playing');
  }
});

test('limitNowPlaying absent or undefined behaves as on: a playing title above the limit is hidden', async () => {
  const cases = [{ limitNowPlaying: undefined }, {}];
  for (const extra of cases) {
    for (const rating of ['R', undefined, 'gb/XX']) {
      const { engine, settings } = setup({ maxContentRating: 'PG-13', ...extra }, { sessions: playingRated(rating), pool: MIXED });
      if (!('limitNowPlaying' in extra)) delete settings.limitNowPlaying; // truly absent, not the default
      assert.equal(settings.limitNowPlaying, undefined);
      assert.equal((await engine.decide()).poster.source, 'random', `${JSON.stringify(extra)} ${rating}`);
    }
  }
});

test('with no limit, limitNowPlaying makes no difference and unrated playback shows', async () => {
  for (const limitNowPlaying of [true, false]) {
    const { engine } = setup({ maxContentRating: '', limitNowPlaying }, { sessions: playingRated(undefined), pool: MIXED });
    assert.equal((await engine.decide()).poster.source, 'now-playing');
  }
});

test('an above-limit episode is hidden by its own rating', async () => {
  const sessions = [{ type: 'episode', ratingKey: 'e1', grandparentRatingKey: 'show', grandparentTitle: 'Show', title: 'Ep', grandparentThumb: '/t/show', contentRating: 'TV-MA', Player: { state: 'playing' } }];
  const { engine } = setup({ maxContentRating: 'PG-13' }, { sessions, pool: MIXED });
  assert.equal((await engine.decide()).poster.source, 'random');
});

test('playing() still reports playback of an above-limit title (sleep mode needs to know)', async () => {
  const { engine } = setup({ maxContentRating: 'G' }, { sessions: playingRated('R'), pool: MIXED });
  assert.equal((await engine.playing())?.ratingKey, 'np');
});

test('an owner-pinned poster is exempt from the limit', async () => {
  const { engine, client } = setup({ maxContentRating: 'G', staticRatingKey: '42' }, { pool: MIXED, itemRating: 'NC-17' });
  const d = await engine.decide();
  assert.equal(d.poster.ratingKey, '42');
  assert.equal(d.poster.contentRating, 'NC-17');
  assert.equal(client.calls.pool, 0);
});

test('a pinned poster still stands in for an above-limit now-playing title', async () => {
  const { engine } = setup({ maxContentRating: 'PG', staticRatingKey: '42' }, { sessions: playingRated('R'), pool: MIXED, itemRating: 'R' });
  const d = await engine.decide();
  assert.equal(d.poster.ratingKey, '42');
  assert.equal(d.poster.source, 'static');
});

// ---- latest session snapshot (R-NP-1) ----

const SNAP = (viewOffset, state = 'playing', extra = {}) => [{
  type: 'movie', ratingKey: 'np', title: 'Playing', thumb: '/t/np', contentRating: 'PG', duration: 6000000, viewOffset,
  User: { title: 'me' }, Player: { title: 'Den', state }, ...extra,
}];

test('the engine exposes the latest session snapshot even when decide() returns null for an unchanged poster', async () => {
  const { engine } = setup({}, { pool: [poster('a')] });
  assert.equal(engine.session, null, 'nothing polled yet');
  const d = await engine.decide({ sessions: SNAP(600000) });
  assert.equal(engine.session.viewOffset, 600000);
  engine.shown(d.poster);
  assert.equal(await engine.decide({ sessions: SNAP(1200000) }), null, 'same poster: nothing to redraw');
  assert.equal(engine.session.viewOffset, 1200000, 'but the snapshot moved on');
  assert.equal(engine.session.playerTitle, 'Den');
  assert.equal(engine.session.duration, 6000000);
  await engine.decide({ sessions: SNAP(1200000, 'paused') });
  assert.equal(engine.session.paused, true);
});

test('the snapshot is null when nothing is playing, when showNowPlaying is off, and when the filter hides the title', async () => {
  const { engine } = setup({}, { pool: [poster('a')] });
  await engine.decide({ sessions: SNAP(1) });
  assert.ok(engine.session);
  await engine.decide({ sessions: [] });
  assert.equal(engine.session, null);

  const off = setup({ showNowPlaying: false }, { pool: [poster('a')] });
  await off.engine.decide({ sessions: SNAP(1) });
  assert.equal(off.engine.session, null);

  const limited = setup({ maxContentRating: 'G' }, { pool: [rated('g', 'G')] });
  await limited.engine.decide({ sessions: SNAP(1) }); // PG title under a G limit
  assert.equal(limited.engine.session, null, 'a blocked title leaves no snapshot to draw');
});

// ---- K18 (D24) and C8M1 (D28): a refused or failed sessions call ----

const refused = (status) => Object.assign(new Error(`Plex rejected the token (${status}).`), { kind: 'auth', status });

test('K18: a 401/403 on the engine\'s own /status/sessions fetch means nothing is playing and rotation carries on', async () => {
  for (const status of [401, 403]) {
    const client = { ...fakeClient({ pool: [poster('a')] }), sessions: async () => { throw refused(status); } };
    const engine = createEngine({ client, getSettings: () => ({ ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1' }) });
    const d = await engine.decide();
    assert.equal(d.poster.source, 'random', String(status));
    assert.equal(engine.session, null);
  }
});

test('K18: other errors from the sessions fetch still propagate', async () => {
  const client = { ...fakeClient({ pool: [poster('a')] }), sessions: async () => { throw Object.assign(new Error('down'), { kind: 'network' }); } };
  const engine = createEngine({ client, getSettings: () => ({ ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1' }) });
  await assert.rejects(engine.decide(), { kind: 'network' });
});

test('C8M1: decide({ sessionsError }) does not fetch /status/sessions again; a refused poll is nothing playing', async () => {
  const { engine, client } = setup({}, { sessions: NP, pool: [poster('a')] });
  const d = await engine.decide({ sessionsError: refused(403) });
  assert.equal(d.poster.source, 'random');
  assert.equal(client.calls.sessions, 0);
});

test('C8M1: decide({ sessionsError }) rethrows any other failed poll, still without a second request', async () => {
  const { engine, client } = setup({}, { sessions: NP, pool: [poster('a')] });
  await assert.rejects(engine.decide({ sessionsError: Object.assign(new Error('down'), { kind: 'network' }) }), { kind: 'network' });
  assert.equal(client.calls.sessions, 0);
});

test('C8M1: with showNowPlaying off a poll error is ignored (nothing asks for sessions)', async () => {
  const { engine, client } = setup({ showNowPlaying: false }, { sessions: NP, pool: [poster('a')] });
  const d = await engine.decide({ sessionsError: Object.assign(new Error('down'), { kind: 'network' }) });
  assert.equal(d.poster.source, 'random');
  assert.equal(client.calls.sessions, 0);
});

// ---- D37: re-rate the cached titles on each online pool load while a limit is set ----

function ratedSetup(overrides, { returned = [], cached = ['1', '2', '3'], pool = [rated('g', 'G')], fail = false, answer = null } = {}) {
  const base = setup(overrides, { pool });
  const asked = [];
  base.client.items = async (keys) => {
    asked.push(keys);
    if (answer) return answer(keys, asked.length - 1); // may throw for one batch
    if (fail) throw Object.assign(new Error('boom'), { kind: 'http' });
    return returned;
  };
  const applied = [];
  let t = 1_000_000;
  const engine = createEngine({
    client: base.client,
    getSettings: () => base.settings,
    now: () => t,
    random: () => 0,
    cachedKeys: () => cached,
    onRatings: (list) => applied.push(list),
  });
  return { engine, asked, applied, advance: (ms) => (t += ms), settings: base.settings };
}

test('D37: with a limit, a pool load asks ONE batched request for the cached keys and applies every returned rating', async () => {
  const { engine, asked, applied } = ratedSetup(
    { maxContentRating: 'PG-13' },
    { returned: [{ ratingKey: '1', contentRating: 'G' }, { ratingKey: '2', contentRating: 'R' }, { ratingKey: '3', contentRating: 'PG' }] },
  );
  await engine.decide();
  assert.deepEqual(asked, [['1', '2', '3']]);
  assert.deepEqual(applied[0].map((p) => [p.ratingKey, p.contentRating]), [['1', 'G'], ['2', 'R'], ['3', 'PG']]);
});

test('D37: a cached key the response does not return is stored as unrated (fails closed)', async () => {
  const { engine, applied } = ratedSetup({ maxContentRating: 'PG-13' }, { returned: [{ ratingKey: '1', contentRating: 'G' }] });
  await engine.decide();
  assert.deepEqual(applied[0].map((p) => [p.ratingKey, p.contentRating]), [['1', 'G'], ['2', ''], ['3', '']]);
});

test('D37: a title that is merely absent from the random pool is not treated as re-rated', async () => {
  const { engine, applied } = ratedSetup({ maxContentRating: 'PG-13' }, { returned: [{ ratingKey: '1', contentRating: 'PG' }], pool: [rated('g', 'G')], cached: ['1'] });
  await engine.decide();
  assert.deepEqual(applied[0].map((p) => [p.ratingKey, p.contentRating]), [['1', 'PG']], 'only what the metadata response said');
});

const keysOf = (n) => Array.from({ length: n }, (_, i) => String(i + 1));
const pairs = (list) => list.map((p) => [p.ratingKey, p.contentRating]);

test('D37 (MCI1): 250 cached keys are asked about in batches of 100 and every one is reported', async () => {
  const cached = keysOf(250);
  const { engine, asked, applied } = ratedSetup({ maxContentRating: 'PG-13' }, { cached, answer: (keys) => keys.map((k) => ({ ratingKey: k, contentRating: Number(k) === 250 ? 'R' : 'PG' })) });
  await engine.decide();
  assert.deepEqual(asked.map((b) => b.length), [100, 100, 50]);
  assert.deepEqual(asked.flat(), cached, 'each key asked exactly once, in cache order');
  assert.equal(applied.length, 1);
  assert.deepEqual(applied[0].map((p) => p.ratingKey), cached, 'all 250 reported');
  assert.equal(applied[0][249].contentRating, 'R', 'a key past the 100th is re-rated too');
  assert.equal(applied[0][0].contentRating, 'PG');
});

test('D37 (MCI1): a key whose batch fails is stored as unrated; the other batches still apply', async () => {
  const cached = keysOf(250);
  const { engine, applied } = ratedSetup(
    { maxContentRating: 'PG-13' },
    {
      cached,
      answer: (keys, n) => {
        if (n === 1) throw Object.assign(new Error('boom'), { kind: 'http' });
        return keys.map((k) => ({ ratingKey: k, contentRating: 'PG' }));
      },
    },
  );
  const d = await engine.decide();
  assert.equal(d.poster.ratingKey, 'g', 'the pool load still succeeds');
  const byKey = new Map(pairs(applied[0]));
  assert.equal(byKey.size, 250);
  for (const k of cached) assert.equal(byKey.get(k), Number(k) >= 101 && Number(k) <= 200 ? '' : 'PG', `key ${k}`);
});

test('D37 (MCI1): a key a batch leaves out is unrated, in any batch', async () => {
  const cached = keysOf(150);
  const { engine, applied } = ratedSetup({ maxContentRating: 'PG-13' }, { cached, answer: (keys) => keys.filter((k) => k !== '120').map((k) => ({ ratingKey: k, contentRating: 'G' })) });
  await engine.decide();
  const byKey = new Map(pairs(applied[0]));
  assert.equal(byKey.get('120'), '');
  assert.equal(byKey.get('119'), 'G');
  assert.equal(byKey.size, 150);
});

test('D37 (MCI1): keys beyond what three requests cover are never asked about and are stored as unrated', async () => {
  const cached = keysOf(350);
  const { engine, asked, applied } = ratedSetup({ maxContentRating: 'PG-13' }, { cached, answer: (keys) => keys.map((k) => ({ ratingKey: k, contentRating: 'G' })) });
  await engine.decide();
  assert.equal(asked.length, 3, 'at most 3 requests per pool load');
  const byKey = new Map(pairs(applied[0]));
  assert.equal(byKey.size, 350);
  assert.equal(byKey.get('300'), 'G');
  assert.equal(byKey.get('301'), '');
  assert.equal(byKey.get('350'), '');
});

test('D37: no limit, no cached keys, or a cached pool: no request', async () => {
  const none = ratedSetup({ maxContentRating: '' });
  await none.engine.decide();
  assert.equal(none.asked.length, 0);

  const empty = ratedSetup({ maxContentRating: 'PG' }, { cached: [] });
  await empty.engine.decide();
  assert.equal(empty.asked.length, 0);

  const again = ratedSetup({ maxContentRating: 'PG' });
  await again.engine.decide({ force: true });
  await again.engine.decide({ force: true });
  assert.equal(again.asked.length, 1, 'the second decide reuses the pool: no new load, no new re-check');
  again.advance(31 * 60 * 1000);
  await again.engine.decide({ force: true });
  assert.equal(again.asked.length, 2, 'each online pool load re-checks');
});

test('D37: a failed batched request stores unrated for every key it asked about, and the pool load still succeeds (Q-mnp1)', async () => {
  const { engine, applied } = ratedSetup({ maxContentRating: 'PG-13' }, { fail: true });
  const d = await engine.decide();
  assert.equal(d.poster.ratingKey, 'g');
  assert.deepEqual(applied[0].map((p) => [p.ratingKey, p.contentRating]), [['1', ''], ['2', ''], ['3', '']]);
});

// ---- rating-recheck-batch (D80): the re-check runs alongside the pool, not after it ----

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

// A client whose pool() and items() park until the test releases them, logging when each is called and settled.
function gatedSetup(overrides, { cached = ['1', '2', '3'] } = {}) {
  const events = [];
  const poolGate = deferred();
  const itemGates = [];
  const applied = [];
  const settings = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', ...overrides };
  const client = {
    calls: { items: 0 },
    sessions: async () => [],
    nowPlaying,
    pool: () => (events.push('pool:start'), poolGate.promise.then((v) => (events.push('pool:end'), v))),
    items: (keys) => {
      client.calls.items++;
      events.push(`items:start:${keys.length}`);
      const gate = deferred();
      itemGates.push(gate);
      return gate.promise.then((v) => (events.push('items:end'), v));
    },
  };
  const engine = createEngine({ client, getSettings: () => settings, now: () => 1_000_000, random: () => 0, cachedKeys: () => cached, onRatings: (list) => (events.push('onRatings'), applied.push(list)) });
  return { engine, client, events, poolGate, itemGates, applied };
}
const tick = () => new Promise((r) => setImmediate(r));

test('D80: with a limit set, client.pool and the first client.items batch are both in flight before either resolves', async () => {
  const { engine, events, poolGate, itemGates, applied } = gatedSetup({ maxContentRating: 'PG-13' });
  const deciding = engine.decide();
  await tick();
  assert.deepEqual(events, ['pool:start', 'items:start:3'], 'both requests are out, neither has settled');
  assert.equal(applied.length, 0);
  itemGates[0].resolve([{ ratingKey: '1', contentRating: 'G' }]);
  await tick();
  poolGate.resolve([rated('g', 'G')]);
  const d = await deciding;
  assert.equal(d.poster.ratingKey, 'g');
  assert.equal(applied.length, 1, 'onRatings is called once per pool load');
});

test('D80: the pool resolving first still waits for the re-check, and onRatings is called once with every cached key', async () => {
  const cached = keysOf(250);
  const { engine, events, poolGate, itemGates, applied } = gatedSetup({ maxContentRating: 'PG-13' }, { cached });
  const deciding = engine.decide();
  await tick();
  assert.deepEqual(events, ['pool:start', 'items:start:100']);
  poolGate.resolve([rated('g', 'G')]);
  await tick();
  assert.equal(applied.length, 0, 'the pool is not handed back before the re-check has finished');
  for (const n of [0, 1, 2]) {
    itemGates[n].resolve(n === 1 ? Promise.reject(Object.assign(new Error('boom'), { kind: 'http' })) : []);
    await tick();
  }
  await deciding;
  assert.equal(applied.length, 1);
  assert.deepEqual(applied[0].map((p) => p.ratingKey), cached, 'all 250 cached keys reported');
  assert.ok(applied[0].every((p) => p.contentRating === ''), 'a failed batch and keys the response left out report ""');
});

test('D80: with no limit set client.items is not called, and the pool is not delayed', async () => {
  const { engine, client, events, poolGate, applied } = gatedSetup({ maxContentRating: '' });
  const deciding = engine.decide();
  await tick();
  poolGate.resolve([poster('a')]);
  await deciding;
  assert.equal(client.calls.items, 0);
  assert.equal(applied.length, 0);
  assert.deepEqual(events, ['pool:start', 'pool:end']);
});

test('D80: a pool failure still rejects the load, even when the re-check succeeded, and applies nothing', async () => {
  const { engine, poolGate, itemGates, applied } = gatedSetup({ maxContentRating: 'PG-13' });
  const deciding = engine.decide();
  const outcome = deciding.then(() => 'resolved', (err) => err);
  await tick();
  itemGates[0].resolve([{ ratingKey: '1', contentRating: 'G' }]);
  await tick();
  poolGate.reject(Object.assign(new Error('pool down'), { kind: 'network' }));
  const err = await outcome;
  assert.equal(err.message, 'pool down');
  assert.equal(applied.length, 0, 'no ratings applied when the load failed');
});

test('D135 3: after a pool failure the re-check sends no further batch; the next pool load re-checks again', async () => {
  const { engine, client, poolGate, itemGates, applied } = gatedSetup({ maxContentRating: 'PG-13' }, { cached: keysOf(250) });
  const outcome = engine.decide().then(() => 'resolved', (err) => err);
  await tick();
  assert.equal(client.calls.items, 1, 'the first batch is out alongside the pool request');
  poolGate.reject(Object.assign(new Error('pool down'), { kind: 'network' }));
  assert.equal((await outcome).message, 'pool down');
  itemGates[0].resolve([]); // the batch already in flight settles; its result is discarded
  await tick();
  await tick();
  assert.equal(client.calls.items, 1, 'no second batch after the pool failure');
  assert.deepEqual(applied, []);
  // the next pool load is a fresh load: it re-checks as usual
  client.pool = async () => [rated('g', 'G')]; // the server is back
  const again = engine.decide();
  await tick();
  assert.equal(client.calls.items, 2, 'the next load sends its first batch again');
  itemGates[1].resolve([]);
  await tick();
  assert.equal(client.calls.items, 3, 'and goes on to its next batch while its pool has not failed');
  itemGates[2].resolve([]);
  await tick();
  itemGates[3].resolve([]);
  await again;
  assert.equal(applied.length, 1);
});

test('D80: with the server down (pool and every batch fail) nothing is reported, so the offline cache keeps its ratings', async () => {
  const { engine, poolGate, itemGates, applied } = gatedSetup({ maxContentRating: 'PG-13' });
  const outcome = engine.decide().then(() => 'resolved', (err) => err);
  await tick();
  itemGates[0].reject(Object.assign(new Error('down'), { kind: 'network' }));
  poolGate.reject(Object.assign(new Error('down'), { kind: 'network' }));
  assert.equal((await outcome).message, 'down');
  assert.deepEqual(applied, [], 'no "" for any key');
});

test('D80: a pool failure while the re-check is still running rejects without an unhandled rejection', async () => {
  const { engine, poolGate, itemGates } = gatedSetup({ maxContentRating: 'PG-13' });
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  try {
    const outcome = engine.decide().then(() => 'resolved', (err) => err);
    await tick();
    poolGate.reject(Object.assign(new Error('pool down'), { kind: 'network' }));
    assert.equal((await outcome).message, 'pool down');
    itemGates[0].reject(Object.assign(new Error('late'), { kind: 'http' }));
    await tick();
    await tick();
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

// ---- R-FILT-2 (D101): the engine holds every pick to the slot in force, failing closed ----

const SLOTS = [{ start: '06:00', limit: 'G' }, { start: '15:00', limit: 'PG-13' }, { start: '22:00', limit: '' }];
const MIXED_RATED = [rated('g', 'G'), rated('pg13', 'PG-13'), rated('r', 'R'), rated('tvma', 'TV-MA'), rated('nc', 'NC-17'), rated('blank', ''), poster('missing')];

/** An engine on a clock the test sets: `clock.at` is a Date, read at every decide(). */
function scheduled(overrides = {}, clientOpts = {}, start = new Date(2026, 0, 5, 7, 0)) {
  const clock = { at: start };
  const settings = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', maxContentRating: 'PG-13', limitSlots: SLOTS, ...overrides };
  const client = fakeClient({ pool: MIXED_RATED, ...clientOpts });
  const engine = createEngine({ client, getSettings: () => settings, now: () => clock.at.getTime(), random: spread() });
  return { engine, client, settings, clock };
}

test('R-FILT-2: at a G slot only G titles are picked; at PG-13 up to PG-13; at "no limit" everything, unrated too', async () => {
  const { engine, clock } = scheduled();
  assert.deepEqual([...(await everyPick(engine))], ['g']);
  clock.at = new Date(2026, 0, 5, 16, 0);
  assert.deepEqual([...(await everyPick(engine))].sort(), ['g', 'pg13']);
  clock.at = new Date(2026, 0, 5, 22, 30);
  assert.equal((await everyPick(engine, 200)).size, MIXED_RATED.length);
  clock.at = new Date(2026, 0, 6, 3, 0);
  assert.equal((await everyPick(engine, 200)).size, MIXED_RATED.length, 'after midnight the 22:00 slot is still in force');
});

test('R-FILT-2: the pool is asked for the limit in force, and the pool cache key changes when the slot does', async () => {
  const { engine, client, clock } = scheduled({}, {}, new Date(2026, 0, 5, 14, 50));
  await engine.decide({ force: true });
  await engine.decide({ force: true });
  assert.equal(client.calls.pool, 1, 'same slot: cached');
  clock.at = new Date(2026, 0, 5, 14, 59);
  await engine.decide({ force: true });
  assert.equal(client.calls.pool, 1, 'a minute before the boundary: still cached');
  clock.at = new Date(2026, 0, 5, 15, 5); // 15 minutes after the first load: inside the 30 minute pool lifetime
  const d = await engine.decide({ force: true });
  assert.equal(client.calls.pool, 2, 'the slot changed: the pool is reloaded, not served from the old key');
  assert.deepEqual(client.calls.poolArgs.map((a) => a.maxContentRating), ['G', 'PG-13']);
  assert.ok(['g', 'pg13'].includes(d.poster.ratingKey));
  clock.at = new Date(2026, 0, 5, 22, 0);
  await engine.decide({ force: true });
  assert.deepEqual(client.calls.poolArgs.map((a) => a.maxContentRating), ['G', 'PG-13', ''], 'no limit is asked for as "no limit"');
});

test('R-FILT-2: a stricter slot holds a pool that was loaded under a looser one (the server returns everything)', async () => {
  const slots = [{ start: '10:00', limit: '' }, { start: '10:20', limit: 'G' }];
  const { engine, client, clock } = scheduled({ limitSlots: slots }, {}, new Date(2026, 0, 5, 10, 5));
  assert.ok((await everyPick(engine, 200)).size > 2, 'no limit');
  clock.at = new Date(2026, 0, 5, 10, 25);
  assert.deepEqual([...(await everyPick(engine))], ['g']);
  assert.equal(client.calls.pool, 2);
});

test('R-FILT-2: an implausible clock holds the picks to the strictest of the slots and the base limit', async () => {
  const { engine, client, clock } = scheduled({ maxContentRating: 'R' }, {}, new Date(1970, 0, 1, 23, 0));
  assert.deepEqual([...(await everyPick(engine))], ['g']);
  assert.equal(client.calls.poolArgs[0].maxContentRating, 'G');
  clock.at = new Date(2026, 0, 5, 23, 0);
  assert.equal((await everyPick(engine, 200)).size, MIXED_RATED.length, 'a clock that is set follows the slot');
});

test('R-FILT-2: with the household toggle off (base limit "") the slots are not applied', async () => {
  const { engine, client } = scheduled({ maxContentRating: '' });
  assert.equal((await everyPick(engine, 200)).size, MIXED_RATED.length);
  assert.equal(client.calls.poolArgs[0].maxContentRating, '');
});

test('R-FILT-2: no slots behaves exactly as the base limit', async () => {
  const { engine, client } = scheduled({ limitSlots: [] }, {}, new Date(1970, 0, 1));
  assert.deepEqual([...(await everyPick(engine))].sort(), ['g', 'pg13']);
  assert.equal(client.calls.poolArgs[0].maxContentRating, 'PG-13');
});

test('R-FILT-2: now playing is held to the slot in force when limitNowPlaying is on, and not when it is off', async () => {
  const sessions = playingRated('R');
  const on = scheduled({ showNowPlaying: true, limitNowPlaying: true }, { sessions });
  assert.equal((await on.engine.decide()).poster.source, 'random', 'an R title at a G slot is hidden');
  assert.equal(on.engine.session, null);
  on.clock.at = new Date(2026, 0, 5, 22, 0);
  assert.equal((await on.engine.decide({ force: true })).poster.source, 'now-playing', 'at "no limit" it shows');
  const off = scheduled({ showNowPlaying: true, limitNowPlaying: false }, { sessions });
  assert.equal((await off.engine.decide()).poster.source, 'now-playing', 'limitNowPlaying off: not held to the slot');
  const unrated = scheduled({ showNowPlaying: true, limitNowPlaying: true }, { sessions: playingRated('') });
  assert.equal((await unrated.engine.decide()).poster.source, 'random', 'unrated stays hidden in a slot that sets a limit');
});

test('R-FILT-2: the empty-card advice follows the slot in force', async () => {
  const { engine } = scheduled({}, { pool: [rated('r', 'R')] });
  await assert.rejects(engine.decide(), (err) => err.kind === 'empty' && /at or below G/.test(err.message) && /raise the limit/.test(err.message));
});

test('R-FILT-2 / D103: cached titles are re-rated whenever the base limit or any slot sets a limit, also in a "no limit" slot', async () => {
  const { client, clock, settings } = scheduled();
  const asked = [];
  client.items = async (keys) => (asked.push(keys), []);
  const engine = createEngine({ client, getSettings: () => settings, now: () => clock.at.getTime(), random: () => 0, cachedKeys: () => ['1'], onRatings: () => {} });
  await engine.decide({ force: true });
  assert.deepEqual(asked, [['1']], 'a G slot re-rates the cache');
  clock.at = new Date(2026, 0, 5, 22, 0);
  await engine.decide({ force: true });
  assert.equal(asked.length, 2, 'a no-limit slot re-rates too: the base limit is set, so a stricter slot may follow');
  clock.at = new Date(2026, 0, 6, 6, 0);
  await engine.decide({ force: true });
  assert.equal(asked.length, 3, 'the next G slot re-rates again');
});

test('D103: no re-check when neither the base limit nor any slot sets a limit; a slot that sets a limit is enough', async () => {
  const noLimits = [{ start: '06:00', limit: '' }, { start: '22:00', limit: '' }];
  const run = async (overrides) => {
    const { client, clock, settings } = scheduled(overrides, {}, new Date(2026, 0, 5, 12, 0));
    const asked = [];
    client.items = async (keys) => (asked.push(keys), []);
    const engine = createEngine({ client, getSettings: () => settings, now: () => clock.at.getTime(), random: () => 0, cachedKeys: () => ['1'], onRatings: () => {} });
    await engine.decide({ force: true });
    return asked.length;
  };
  assert.equal(await run({ maxContentRating: '', limitSlots: noLimits }), 0, 'toggle off and no slot sets a limit');
  assert.equal(await run({ maxContentRating: '', limitSlots: [] }), 0);
  assert.equal(await run({ maxContentRating: 'R', limitSlots: noLimits }), 1, 'the base limit sets one');
  assert.equal(await run({ maxContentRating: '', limitSlots: SLOTS }), 1, 'a slot sets one (saved slots, toggle off)');
});

test('D103: the online empty-card advice names the time slots while slots exist, and only "raise the limit" without them', async () => {
  const withSlotsAdvice = scheduled({}, { pool: [rated('r', 'R')] });
  await assert.rejects(withSlotsAdvice.engine.decide(), (err) => /raise the limit or change the time slots/.test(err.message));
  const plain = scheduled({ limitSlots: [] }, { pool: [rated('r', 'R')] }, new Date(2026, 0, 5, 12, 0));
  await assert.rejects(plain.engine.decide(), (err) => /raise the limit\)/.test(err.message) && !/time slots/.test(err.message));
});

// ---- the poster selection (R-SEL-1, D107): libraries, genres, ratings, a collection or a playlist ----

const gp = (k, contentRating, genres, over = {}) => ({ ...poster(k), contentRating, genres, ...over });
const LIB_A = [gp('a1', 'G', ['Comedy']), gp('a2', 'PG', ['Drama']), gp('a3', 'PG-13', ['Comedy', 'Drama']), gp('a4', 'R', ['Comedy']), gp('a5', '', ['Comedy'])];
const LIB_B = [gp('b1', 'G', ['Animation']), gp('b2', 'PG', ['Comedy']), gp('b3', 'R', ['Animation'])];

/** A client that answers each library from its own list (and ignores the filters, as a server that does not honour them would). */
function selectionClient({ counts = { 1: 8, 3: 5 }, libs = { 1: LIB_A, 3: LIB_B }, sources = {}, allLibraries } = {}) {
  const calls = { pool: [], count: [], source: [] };
  return {
    calls,
    ...(allLibraries ? { libraries: async () => allLibraries } : {}),
    sessions: async () => [],
    nowPlaying,
    items: async () => [],
    libraryCount: async (key) => (calls.count.push(key), counts[key] ?? null),
    pool: async (args) => (calls.pool.push(args), libs[args.libraryKey].map((p) => ({ ...p }))),
    sourceItems: async (src, opts) => (calls.source.push({ src, opts }), (sources[`${src.kind}:${src.key}`] || []).map((p) => ({ ...p }))),
  };
}

function selecting(overrides = {}, clientOpts = {}, random = spread()) {
  const settings = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', libraryName: 'Movies', ...overrides };
  const client = selectionClient(clientOpts);
  const engine = createEngine({ client, getSettings: () => settings, now: () => 1_000_000, random });
  return { engine, client, settings };
}

const TWO = { libraryKeys: ['1', '3'], libraryNames: ['Movies', 'Kids Movies'] };

test('a 2.2 selection (one library, nothing else) makes the same single request as before and asks for no count', async () => {
  const { engine, client } = selecting({ randomPoolSize: 77, unwatchedOnly: false, maxContentRating: 'PG' });
  await engine.decide();
  assert.deepEqual(client.calls.pool, [{ libraryKey: '1', unwatchedOnly: false, size: 77, maxContentRating: 'PG' }]);
  assert.deepEqual(client.calls.count, []);
});

test('two libraries: one request each, the pool size split by title count, and every poster says which library it came from', async () => {
  const { engine, client } = selecting({ ...TWO, randomPoolSize: 100 });
  const d = await engine.decide();
  assert.deepEqual(client.calls.count.sort(), ['1', '3']);
  assert.deepEqual(client.calls.pool.map((a) => [a.libraryKey, a.size]), [['1', 62], ['3', 38]]);
  const seen = new Map();
  for (let i = 0; i < 120; i++) {
    const p = (await engine.decide({ force: true })).poster;
    engine.shown(p);
    seen.set(p.ratingKey, p.libraryKey);
  }
  assert.ok(d);
  assert.deepEqual(Object.fromEntries([...seen].sort()), { a1: '1', a2: '1', a3: '1', a4: '1', a5: '1', b1: '3', b2: '3', b3: '3' });
});

test('two libraries: an unknown count splits the pool evenly; a library with no titles is not asked for posters', async () => {
  const unknown = selecting({ ...TWO, randomPoolSize: 100 }, { counts: { 1: 8 } });
  await unknown.engine.decide();
  assert.deepEqual(unknown.client.calls.pool.map((a) => a.size), [50, 50]);
  const empty = selecting({ ...TWO, randomPoolSize: 100 }, { counts: { 1: 0, 3: 5 } });
  await empty.engine.decide();
  assert.deepEqual(empty.client.calls.pool.map((a) => [a.libraryKey, a.size]), [['3', 100]]);
});

test('a genre set is sent as filter values, and a server that ignores it cannot widen the pool', async () => {
  const { engine, client } = selecting({ ...TWO, genres: [{ key: '12', title: 'Comedy' }, { key: '', title: 'Fantasy' }] });
  assert.deepEqual([...(await everyPick(engine, 200))].sort(), ['a1', 'a3', 'a4', 'a5', 'b2']);
  assert.deepEqual(client.calls.pool.map((a) => a.genres), [['12', 'Fantasy'], ['12', 'Fantasy']]);
});

test('a genre set drops a reply item that carries no genres', async () => {
  const { engine } = selecting({ genres: [{ key: '12', title: 'Comedy' }] }, { libs: { 1: [gp('x', 'G', undefined), gp('y', 'G', ['Comedy'])] } });
  assert.deepEqual([...(await everyPick(engine))], ['y']);
});

test('no genre chosen: the request carries no genres and titles without genres are fine', async () => {
  const { engine, client } = selecting({}, { libs: { 1: [gp('x', 'G', undefined)] } });
  assert.deepEqual([...(await everyPick(engine, 3))], ['x']);
  assert.ok(!('genres' in client.calls.pool[0]));
});

test('a rating set is intersected with the limit in force, in the request and in every pick', async () => {
  const { engine, client } = selecting({ maxContentRating: 'PG-13', ratings: ['G', 'PG-13', 'R'] });
  assert.deepEqual([...(await everyPick(engine, 100))].sort(), ['a1', 'a3']);
  assert.deepEqual(client.calls.pool[0].ratings, ['G', 'PG-13'], 'R is above the limit and is not asked for');
  assert.equal(client.calls.pool[0].maxContentRating, 'PG-13');
});

test('a rating set can never add an unrated or above-limit title, whatever the server returns', async () => {
  const { engine } = selecting({ maxContentRating: 'PG', ratings: ['PG', 'R', 'NC-17'] });
  assert.deepEqual([...(await everyPick(engine, 100))], ['a2']);
  const none = selecting({ maxContentRating: '', ratings: ['R'] });
  assert.deepEqual([...(await everyPick(none.engine, 100))], ['a4'], 'no limit: the chosen R, and not the unrated');
});

test('a rating set follows the slot in force, not the base limit', async () => {
  const slots = [{ start: '06:00', limit: 'G' }, { start: '15:00', limit: 'PG-13' }];
  const { engine, client, settings } = selecting({ maxContentRating: 'R', limitSlots: slots, ratings: ['G', 'PG', 'R'] });
  let at = new Date(2026, 0, 5, 7, 0);
  const clocked = createEngine({ client, getSettings: () => settings, now: () => at.getTime(), random: spread() });
  assert.deepEqual([...(await everyPick(clocked, 100))], ['a1'], 'G slot: only G, though the base limit is R');
  at = new Date(2026, 0, 5, 16, 0);
  assert.deepEqual([...(await everyPick(clocked, 100))].sort(), ['a1', 'a2'], 'PG-13 slot: G and PG, R still out');
  assert.deepEqual(client.calls.pool.map((a) => a.ratings), [['G'], ['G', 'PG']]);
  assert.ok(engine);
});

test('a rating set that the limit leaves empty asks for no posters and shows the empty card naming the selection', async () => {
  const { engine, client } = selecting({ maxContentRating: 'PG', ratings: ['R'] });
  await assert.rejects(engine.decide(), (err) => err.kind === 'empty' && /rated R/.test(err.message) && /at or below PG/.test(err.message));
  assert.deepEqual(client.calls.pool, []);
});

test('a collection replaces the libraries and takes no genre filter; its items are tagged with it', async () => {
  const sources = { 'collection:101': [gp('c1', 'G', ['Drama']), gp('c2', 'PG', ['Horror'])] };
  const { engine, client } = selecting({ ...TWO, genres: [{ key: '12', title: 'Comedy' }], source: { kind: 'collection', key: '101', title: 'Double Features' }, randomPoolSize: 55, unwatchedOnly: false }, { sources });
  const seen = new Map();
  for (let i = 0; i < 20; i++) {
    const p = (await engine.decide({ force: true })).poster;
    engine.shown(p);
    seen.set(p.ratingKey, p.members);
  }
  assert.deepEqual([...seen.keys()].sort(), ['c1', 'c2']);
  assert.deepEqual([...seen.values()], [['collection:101'], ['collection:101']]);
  assert.deepEqual(client.calls.pool, [], 'no library request');
  assert.deepEqual(client.calls.count, [], 'no count request');
  assert.deepEqual(client.calls.source, [{ src: { kind: 'collection', key: '101' }, opts: { unwatchedOnly: false, size: 55 } }]);
});

test('a playlist is asked for as a playlist, and the limit and the rating set still apply to it', async () => {
  const sources = { 'playlist:201': [gp('p1', 'G', []), gp('p2', 'PG', []), gp('p3', 'R', []), gp('p4', '', [])] };
  const { engine, client } = selecting({ source: { kind: 'playlist', key: '201', title: 'Friday' }, maxContentRating: 'PG-13', ratings: ['PG', 'R'] }, { sources });
  assert.deepEqual([...(await everyPick(engine, 60))], ['p2']);
  assert.deepEqual(client.calls.source[0].src, { kind: 'playlist', key: '201' });
  const plain = selecting({ source: { kind: 'playlist', key: '201', title: 'Friday' }, maxContentRating: 'PG-13' }, { sources });
  assert.deepEqual([...(await everyPick(plain.engine, 60))].sort(), ['p1', 'p2'], 'the limit alone: R and unrated stay out');
  assert.deepEqual(client.calls.pool, []);
});

test('a source with no libraries chosen still draws', async () => {
  const { engine } = selecting({ libraryKey: '', libraryName: '', source: { kind: 'playlist', key: '201', title: 'P' } }, { sources: { 'playlist:201': [gp('p1', 'G', [])] } });
  assert.equal((await engine.decide()).poster.ratingKey, 'p1');
});

test('nothing chosen at all draws nothing', async () => {
  const { engine } = selecting({ libraryKey: '', libraryName: '' });
  assert.equal(await engine.decide(), null);
});

test('the pool is reloaded when any selection setting changes, and kept when only a name does', async () => {
  const sources = { 'collection:101': [gp('c1', 'G', [])], 'playlist:101': [gp('p1', 'G', [])] };
  const { engine, client, settings } = selecting({}, { sources });
  const loads = () => client.calls.pool.length + client.calls.source.length;
  await engine.decide({ force: true });
  await engine.decide({ force: true });
  assert.equal(loads(), 1, 'cached');
  const steps = [
    ['libraryKeys', ['1', '3']],
    ['genres', [{ key: '12', title: 'Comedy' }]],
    ['ratings', ['G']],
    ['source', { kind: 'collection', key: '101', title: 'x' }],
    ['source', { kind: 'playlist', key: '101', title: 'x' }],
  ];
  let expected = 1;
  for (const [key, value] of steps) {
    settings[key] = value;
    await engine.decide({ force: true });
    expected += key === 'source' ? 1 : 2; // two libraries are two requests; a source is one
    assert.equal(loads(), expected, `${key} changed: reloaded`);
  }
  const before = loads();
  settings.libraryNames = ['Renamed', 'Again'];
  settings.source = { kind: 'playlist', key: '101', title: 'renamed' };
  await engine.decide({ force: true });
  assert.equal(loads(), before, 'a rename is the same selection');
});

test('the empty card names a selection that matches nothing, and keeps "that library" for the 2.2 selection', async () => {
  const none = selecting({ ...TWO, genres: [{ key: '1', title: 'Western' }], ratings: ['G', 'PG'] }, { libs: { 1: [], 3: [] } });
  await assert.rejects(none.engine.decide(), (err) => err.kind === 'empty' && /^No posters found in Movies and Kids Movies, genre Western, rated G or PG \(try turning off "unwatched only" or tick fewer genres or ratings\)\.$/.test(err.message));
  const src = selecting({ source: { kind: 'collection', key: '1', title: 'Top Rated' }, unwatchedOnly: true, maxContentRating: 'PG' }, { sources: {} });
  await assert.rejects(src.engine.decide(), (err) => /^No posters found in the collection "Top Rated" at or below PG \(try turning off "unwatched only" or raise the limit or use the libraries instead of the collection\)\.$/.test(err.message));
  const plain = selecting({}, { libs: { 1: [] } });
  await assert.rejects(plain.engine.decide(), (err) => /^No posters found in that library/.test(err.message));
});

test('the cached-rating re-check still runs once per pool load under a selection', async () => {
  const { client, settings } = selecting({ ...TWO, maxContentRating: 'PG-13' });
  const asked = [];
  client.items = async (keys) => (asked.push(keys), []);
  const engine = createEngine({ client, getSettings: () => settings, now: () => 1_000_000, random: () => 0, cachedKeys: () => ['9'], onRatings: () => {} });
  await engine.decide({ force: true });
  await engine.decide({ force: true });
  assert.deepEqual(asked, [['9']]);
});

// ---- r2: a curated list asks for the same extra items as a library, and the empty card suggests widening a narrowing selection ----

test('r2 gap 9: a collection is asked for under the limit in force and the rating subset the limit leaves, so it can be cut like a library', async () => {
  const sources = { 'collection:101': [gp('c1', 'G', [])] };
  const { engine, client } = selecting({ source: { kind: 'collection', key: '101', title: 'x' }, maxContentRating: 'PG-13', ratings: ['G', 'R'], randomPoolSize: 40, unwatchedOnly: false }, { sources });
  await engine.decide();
  assert.deepEqual(client.calls.source[0].opts, { unwatchedOnly: false, size: 40, maxContentRating: 'PG-13', ratings: ['G'] });
  const plain = selecting({ source: { kind: 'playlist', key: '2', title: 'x' }, unwatchedOnly: false, randomPoolSize: 40 }, { sources: { 'playlist:2': [gp('p', 'G', [])] } });
  await plain.engine.decide();
  assert.deepEqual(plain.client.calls.source[0].opts, { unwatchedOnly: false, size: 40 }, 'no limit and no subset: nothing extra');
});

test('r2 D109 item 3 / r3 D110 item 4: the empty card suggests widening only while the selection narrows, in one sentence with no nested brackets, and "add a library" only when a movie library is unticked', async () => {
  const msg = async (overrides, clientOpts) => {
    const { engine } = selecting({ unwatchedOnly: false, ...overrides }, clientOpts);
    try {
      await engine.decide();
    } catch (e) {
      return e.message;
    }
    return '';
  };
  const all = [{ key: '1', type: 'movie', title: 'Movies' }, { key: '3', type: 'movie', title: 'Kids Movies' }, { key: '2', type: 'artist', title: 'Music' }];
  assert.equal(await msg({ genres: [{ key: '1', title: 'Western' }] }, { libs: { 1: [] }, allLibraries: all }), 'No posters found in Movies, genre Western (add a library or tick fewer genres).', 'Kids Movies is not ticked');
  assert.equal(await msg({ ...TWO, genres: [{ key: '1', title: 'Western' }] }, { libs: { 1: [], 3: [] }, allLibraries: all }), 'No posters found in Movies and Kids Movies, genre Western (tick fewer genres).', 'every movie library is ticked: no "add a library"');
  assert.equal(await msg({ ...TWO, genres: [{ key: '1', title: 'Western' }] }, { libs: { 1: [], 3: [] } }), 'No posters found in Movies and Kids Movies, genre Western (tick fewer genres).', 'a client that cannot list libraries: none suggested');
  assert.equal(await msg({ genres: [{ key: '1', title: 'Western' }] }, { libs: { 1: [] }, allLibraries: [{ key: '1', type: 'movie', title: 'Movies' }, { key: '2', type: 'artist', title: 'Music' }] }), 'No posters found in Movies, genre Western (tick fewer genres).', 'a Music library is not a movie library');
  const failing = selecting({ unwatchedOnly: false, genres: [{ key: '1', title: 'Western' }] }, { libs: { 1: [] } });
  failing.client.libraries = async () => { throw new Error('down'); };
  await assert.rejects(failing.engine.decide(), { message: 'No posters found in Movies, genre Western (tick fewer genres).' });
  assert.match(await msg({ ratings: ['R'], maxContentRating: 'PG' }, { allLibraries: all }), /\(raise the limit or add a library or tick fewer ratings\)\.$/);
  assert.equal(await msg({ ...TWO, genres: [{ key: '1', title: 'Western' }], ratings: ['G'] }, { libs: { 1: [], 3: [] } }), 'No posters found in Movies and Kids Movies, genre Western, rated G (tick fewer genres or ratings).');
  assert.match(await msg({ source: { kind: 'playlist', key: '9', title: 'P' } }, { sources: {}, allLibraries: all }), /\(use the libraries instead of the playlist\)\.$/);
  assert.equal(await msg({}, { libs: { 1: [] }, allLibraries: all }), 'No posters found in that library.', 'the 2.2 selection gets no such advice');
  for (const m of [await msg({ genres: [{ key: '1', title: 'Western' }], ratings: ['R'], maxContentRating: 'PG' }, { allLibraries: all })]) assert.ok(!/\([^)]*\(/.test(m), 'no nested brackets: ' + m);
});

test('r2 gap 8: loading a collection or playlist online tells the cache which titles the listing held; a library load does not', async () => {
  const sources = { 'collection:101': Object.assign([gp('c1', 'G', [])], { listed: ['c1', 'c2'] }) };
  const told = [];
  const { client, settings } = selecting({ source: { kind: 'collection', key: '101', title: 'x' }, unwatchedOnly: false }, { sources });
  client.sourceItems = async () => sources['collection:101'];
  const engine = createEngine({ client, getSettings: () => settings, now: () => 1_000_000, random: () => 0, onMembers: (id, keys) => told.push([id, keys]) });
  await engine.decide({ force: true });
  await engine.decide({ force: true });
  assert.deepEqual(told, [['collection:101', ['c1', 'c2']]], 'once per pool load');
  const lib = selecting({}, {});
  const heard = [];
  const libEngine = createEngine({ client: lib.client, getSettings: () => lib.settings, now: () => 1_000_000, random: () => 0, onMembers: (...a) => heard.push(a) });
  await libEngine.decide({ force: true });
  assert.deepEqual(heard, []);
  const bare = createEngine({ client, getSettings: () => settings, now: () => 1_000_000, random: () => 0 });
  assert.ok(await bare.decide({ force: true }), 'no callback is fine');
});

test('r3 gap 3: a rating subset the limit leaves empty requests no collection or playlist, and the empty card says so', async () => {
  for (const source of [{ kind: 'collection', key: '1', title: 'C' }, { kind: 'playlist', key: '2', title: 'P' }]) {
    const { engine, client } = selecting({ source, maxContentRating: 'PG', ratings: ['R', 'NC-17'], unwatchedOnly: false }, { sources: { 'collection:1': [gp('c', 'R', [])], 'playlist:2': [gp('p', 'R', [])] } });
    await assert.rejects(engine.decide(), (err) => err.kind === 'empty' && /rated R or NC-17/.test(err.message));
    assert.deepEqual(client.calls.source, [], source.kind);
  }
  const ok = selecting({ source: { kind: 'collection', key: '1', title: 'C' }, maxContentRating: 'PG', ratings: ['G', 'R'], unwatchedOnly: false }, { sources: { 'collection:1': [gp('c', 'G', [])] } });
  assert.equal((await ok.engine.decide()).poster.ratingKey, 'c');
  assert.equal(ok.client.calls.source.length, 1, 'a subset the limit leaves non-empty is still requested');
});

test('r3 gap 4: with several libraries chosen and one failing the pool comes from the others; only all failing fails', async () => {
  const { engine, client } = selecting({ ...TWO });
  const real = client.pool;
  client.pool = async (args) => {
    if (args.libraryKey === '3') throw Object.assign(new Error('Plex did not respond in time.'), { kind: 'timeout' });
    return real(args);
  };
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add((await engine.decide({ force: true })).poster.libraryKey);
  assert.deepEqual([...seen], ['1'], 'Movies only');
  client.pool = async () => {
    throw Object.assign(new Error('Could not reach Plex (network or CORS error).'), { kind: 'network' });
  };
  engine.invalidate();
  await assert.rejects(engine.decide({ force: true }), { kind: 'network' });
  const one = selecting({ libraryKey: '1' });
  one.client.pool = async () => {
    throw Object.assign(new Error('boom'), { kind: 'http' });
  };
  await assert.rejects(one.engine.decide(), { kind: 'http' }, 'one library failing is all failing');
});

// ---- r4 (D111): empty-card advice under a source with ratings, and a reduced pool is kept only briefly ----

test('r4 gap 2: under a collection or playlist with ratings ticked the empty card also says to tick fewer ratings', async () => {
  const msg = async (source, ratings) => {
    const { engine } = selecting({ source, ratings, unwatchedOnly: false }, { sources: {} });
    try { await engine.decide(); } catch (e) { return e.message; }
    return '';
  };
  assert.equal(await msg({ kind: 'collection', key: '1', title: 'C' }, ['G']), 'No posters found in the collection "C", rated G (use the libraries instead of the collection or tick fewer ratings).');
  assert.equal(await msg({ kind: 'playlist', key: '2', title: 'P' }, []), 'No posters found in the playlist "P" (use the libraries instead of the playlist).', 'no ratings ticked: nothing to untick');
});

test('r4 gap 3: a pool reduced by a failing library is kept for a minute, not 30; the full selection is asked for again then', async () => {
  let t = 1_000_000;
  const settings = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', ...TWO, rotateSeconds: 10 };
  const client = selectionClient();
  let kidsDown = true;
  const real = client.pool;
  client.pool = async (args) => {
    if (args.libraryKey === '3' && kidsDown) throw Object.assign(new Error('timeout'), { kind: 'timeout' });
    return real(args);
  };
  const engine = createEngine({ client, getSettings: () => settings, now: () => t, random: spread() });
  const keysOf = async (n) => {
    const seen = new Set();
    for (let i = 0; i < n; i++) seen.add((await engine.decide({ force: true })).poster.libraryKey);
    return [...seen];
  };
  assert.deepEqual(await keysOf(20), ['1'], 'Kids Movies failed: the pool is Movies');
  const loads = () => client.calls.pool.length;
  const before = loads();
  t += 30_000;
  await keysOf(5);
  assert.equal(loads(), before, 'within a minute the reduced pool is reused, with no new requests');
  kidsDown = false; // it recovers
  t += 40_000; // 70 s after the load
  assert.deepEqual((await keysOf(60)).sort(), ['1', '3'], 'the next pool load asks for the full selection again');
  const full = loads();
  t += 5 * 60_000;
  await keysOf(5);
  assert.equal(loads(), full, 'a complete pool is kept as before (30 minutes)');
});

test('r4 gap 3: the "reduced" mark belongs to one pool load; a later complete load (a collection) is kept the full time', async () => {
  let t = 1_000_000;
  const settings = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', ...TWO };
  const client = selectionClient({ sources: { 'collection:1': [gp('c1', 'G', [])] } });
  const real = client.pool;
  client.pool = async (args) => {
    if (args.libraryKey === '3') throw Object.assign(new Error('timeout'), { kind: 'timeout' });
    return real(args);
  };
  const engine = createEngine({ client, getSettings: () => settings, now: () => t, random: () => 0 });
  await engine.decide({ force: true }); // reduced
  settings.source = { kind: 'collection', key: '1', title: 'C' };
  await engine.decide({ force: true }); // a complete pool from the collection
  const asked = client.calls.source.length;
  t += 5 * 60_000;
  await engine.decide({ force: true });
  assert.equal(client.calls.source.length, asked, 'kept for the full time');
});

// ---- weighting and the no-repeat window (R-SEL-2, D113) and the last poster-selection gaps (D112) ----

const DAY = 24 * 60 * 60 * 1000;
const memStorage = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = String(v)) };
};
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const wp = (k, extra = {}) => ({ ...poster(k), ...extra });
const wPool = (n, extra = () => ({})) => Array.from({ length: n }, (_, i) => wp(`t${i + 1}`, extra(i + 1)));

/** An engine over a pool, with its own clock and storage; `reload()` is a second engine on the same storage and clock (a page reload). */
function weighed(overrides = {}, pool = wPool(8), { random = () => 0, storage = memStorage() } = {}) {
  const clock = { at: 1_000_000_000 };
  const settings = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', unwatchedOnly: false, ...overrides };
  const make = () => createEngine({ client: fakeClient({ pool }), getSettings: () => settings, now: () => clock.at, random, storage });
  const out = { engine: make(), settings, clock, storage, reload() { out.engine = make(); return out.engine; } };
  out.draw = async () => {
    const d = await out.engine.decide({ force: true });
    out.engine.shown(d.poster);
    clock.at += 1000; // a second passes between draws, so no two titles are shown at the same instant
    return d.poster.ratingKey;
  };
  return out;
}
const draws = async (w, n) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await w.draw());
  return out;
};

test('weighting off and window 0 draw exactly as the engine always did (the last 10 are avoided), for the same random numbers', async () => {
  // The reference: the engine's draw before weighting existed, written out here.
  const keys = 'abcdefghijkl'.split('');
  const numbers = seededRandom(11);
  const script = Array.from({ length: 60 }, () => numbers());
  const reference = [];
  const recent = [];
  let current = null;
  for (const r of script) {
    const fresh = keys.filter((k) => !recent.includes(k) && k !== current);
    const from = fresh.length ? fresh : keys.filter((k) => k !== current);
    const pick = from[Math.floor(r * from.length)];
    reference.push(pick);
    recent.unshift(pick);
    recent.length = Math.min(recent.length, 10);
    current = pick;
  }
  let i = 0;
  const w = weighed({}, keys.map((k) => wp(k)), { random: () => script[i++] });
  assert.deepEqual(await draws(w, 60), reference);
  assert.deepEqual(w.storage.data, {}, 'and nothing is stored: the no-repeat record is only kept while the window is above 0');
});

test('weighting off and window 0 change nothing on a settings object that has neither key (an upgrade)', async () => {
  const settings = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1' };
  delete settings.weighting;
  delete settings.noRepeatDays;
  const engine = createEngine({ client: fakeClient({ pool: wPool(3) }), getSettings: () => settings, now: () => 1, random: () => 0 });
  const seen = [];
  for (let i = 0; i < 3; i++) {
    const d = await engine.decide({ force: true });
    engine.shown(d.poster);
    seen.push(d.poster.ratingKey);
  }
  assert.deepEqual(seen, ['t1', 't2', 't3']);
});

test('unwatched first: over 2,000 picks an unwatched title is drawn at least twice as often as a watched one', async () => {
  const pool = wPool(8, (n) => (n % 2 ? {} : { viewCount: 2 }));
  const w = weighed({ weighting: 'unwatched' }, pool, { random: seededRandom(5) });
  const count = {};
  for (const k of await draws(w, 2000)) count[k] = (count[k] || 0) + 1;
  const unwatched = ['t1', 't3', 't5', 't7'].map((k) => count[k]);
  const watched = ['t2', 't4', 't6', 't8'].map((k) => count[k]);
  assert.ok(Math.min(...unwatched) >= 2 * Math.max(...watched), JSON.stringify(count));
});

test('best reviewed first: the draw frequency rises with audienceRating, and with rating when audienceRating is absent', async () => {
  const run = async (extra) => {
    const w = weighed({ weighting: 'rated' }, [2, 4, 6, 8].map((r) => wp(`r${r}`, extra(r))), { random: seededRandom(9) });
    const count = { r2: 0, r4: 0, r6: 0, r8: 0 };
    for (const k of await draws(w, 2000)) count[k]++;
    return count;
  };
  for (const extra of [(r) => ({ audienceRating: r }), (r) => ({ rating: r })]) {
    const c = await run(extra);
    assert.ok(c.r2 < c.r4 && c.r4 < c.r6 && c.r6 < c.r8, JSON.stringify(c));
  }
});

test('with weighting on the last-10 rule does not apply: only the poster on screen is left out', async () => {
  const on = weighed({ weighting: 'unwatched' }, wPool(3));
  assert.deepEqual(await draws(on, 4), ['t1', 't2', 't1', 't2'], 'random 0 takes the first title that is not on screen');
  const off = weighed({}, wPool(3));
  assert.deepEqual(await draws(off, 4), ['t1', 't2', 't3', 't1'], 'weighting off keeps the last-10 rule');
});

test('the poster on screen is never drawn again by a weighted draw while another title is in the pool', async () => {
  const w = weighed({ weighting: 'rated' }, [wp('big', { audienceRating: 10 }), wp('small', { audienceRating: 1 })], { random: seededRandom(2) });
  const seen = await draws(w, 40);
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1]);
});

test('a one-title pool still draws its title, weighted or windowed', async () => {
  for (const over of [{ weighting: 'unwatched' }, { noRepeatDays: 3 }, { weighting: 'rated', noRepeatDays: 3 }]) {
    const w = weighed(over, wPool(1));
    assert.deepEqual(await draws(w, 3), ['t1', 't1', 't1'], JSON.stringify(over));
  }
});

test('weighting never lets in a title the limit, the rating subset or the genres exclude (D5)', async () => {
  const pool = [
    wp('g', { contentRating: 'G', audienceRating: 1, genres: ['Comedy'] }),
    wp('r', { contentRating: 'R', audienceRating: 10, genres: ['Comedy'] }),
    wp('pg', { contentRating: 'PG', audienceRating: 2, genres: ['Drama'] }),
    wp('un', { contentRating: '', audienceRating: 10, genres: ['Comedy'] }),
  ];
  const limited = weighed({ weighting: 'rated', maxContentRating: 'PG' }, pool, { random: seededRandom(4) });
  assert.deepEqual([...new Set(await draws(limited, 200))].sort(), ['g', 'pg'], 'R and unrated stay out under a PG limit');
  const genre = weighed({ weighting: 'rated', genres: [{ key: '', title: 'Drama' }] }, pool, { random: seededRandom(4) });
  assert.deepEqual([...new Set(await draws(genre, 40))], ['pg'], 'a genre selection holds');
  const subset = weighed({ weighting: 'rated', ratings: ['G'] }, pool, { random: seededRandom(4) });
  assert.deepEqual([...new Set(await draws(subset, 40))], ['g'], 'a rating subset holds');
});

test('the window: the first eight draws from eight titles are eight different titles, even when the random numbers want the same one', async () => {
  const w = weighed({ noRepeatDays: 3 }, wPool(8), { random: () => 0 });
  assert.deepEqual(await draws(w, 8), ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8']);
});

test('the window survives a reload: a new engine on the same storage keeps the shown titles out', async () => {
  const w = weighed({ noRepeatDays: 3 }, wPool(8), { random: () => 0 });
  assert.deepEqual(await draws(w, 4), ['t1', 't2', 't3', 't4']);
  w.reload();
  assert.deepEqual(await draws(w, 4), ['t5', 't6', 't7', 't8']);
});

test('the window with weighting off or on keeps a shown title out for N days, then lets it back', async () => {
  for (const weighting of ['off', 'unwatched']) {
    const w = weighed({ noRepeatDays: 3, weighting }, wPool(3), { random: () => 0 });
    await draws(w, 3);
    w.clock.at += 3 * DAY - 1;
    assert.equal(await w.draw(), 't1', `${weighting}: all three are inside the window, so the least recently shown (the first) comes back`);
    w.clock.at += 1;
    w.reload();
    w.clock.at += 3 * DAY;
    assert.equal(await w.draw(), 't1', weighting);
  }
});

test('the window replaces the last-10 rule: an old, outside-the-window title in the in-memory history is drawn', async () => {
  const w = weighed({ noRepeatDays: 1 }, wPool(3), { random: () => 0 });
  await w.draw(); // t1 at day 0
  w.clock.at += 2 * DAY;
  assert.equal(await w.draw(), 't2', 't1 is outside the window but is the poster on screen, so t2');
  w.clock.at += 2 * DAY;
  // t1 was shown 4 days ago and is among the last 10 in memory; t2 is on screen. Random 0 takes t1.
  assert.equal(await w.draw(), 't1');
});

test('when every permitted title is inside the window, the one shown least recently is drawn', async () => {
  const w = weighed({ noRepeatDays: 5 }, wPool(3), { random: () => 0.99 });
  assert.deepEqual(await draws(w, 3), ['t3', 't2', 't1']);
  w.clock.at += 1000;
  // shown order: t3 (oldest), t2, t1 (on screen). The fallback skips the poster on screen.
  assert.equal(await w.draw(), 't3');
  assert.equal(await w.draw(), 't2');
});

test('the shown record is pruned past the window as new titles are recorded', async () => {
  const w = weighed({ noRepeatDays: 2 }, wPool(4), { random: () => 0 });
  await draws(w, 2);
  assert.deepEqual(Object.keys(JSON.parse(w.storage.data['plexPoster.shownAt'])).sort(), ['t1', 't2']);
  w.clock.at += 3 * DAY;
  await w.draw();
  assert.deepEqual(Object.keys(JSON.parse(w.storage.data['plexPoster.shownAt'])), ['t1'], 't1 and t2 were 3 days old, past the 2 day window; only the title just shown is kept');
});

test('a corrupt shown record starts empty and the draw carries on', async () => {
  for (const bad of ['{nope', '[1]', 'null', '"x"']) {
    const w = weighed({ noRepeatDays: 3 }, wPool(3), { random: () => 0, storage: memStorage({ 'plexPoster.shownAt': bad }) });
    assert.deepEqual(await draws(w, 3), ['t1', 't2', 't3'], bad);
    assert.deepEqual(Object.keys(JSON.parse(w.storage.data['plexPoster.shownAt'])).sort(), ['t1', 't2', 't3'], `${bad}: replaced by a good record`);
  }
});

test('a poster drawn from the offline cache is recorded as shown; a now-playing or pinned one is not', async () => {
  const w = weighed({ noRepeatDays: 3 }, wPool(3));
  w.engine.shown({ ratingKey: 'c1', source: 'cache' });
  w.engine.shown({ ratingKey: 'np', source: 'now-playing' });
  w.engine.shown({ ratingKey: 'st', source: 'static' });
  assert.deepEqual(Object.keys(JSON.parse(w.storage.data['plexPoster.shownAt'])), ['c1']);
});

test('D115 4: a window set to 0 clears the shown record, so raising it again starts empty', async () => {
  const w = weighed({ noRepeatDays: 3 }, wPool(2), { random: () => 0 });
  w.storage.removeItem = (k) => delete w.storage.data[k];
  assert.equal(await w.draw(), 't1');
  assert.ok('plexPoster.shownAt' in w.storage.data);
  w.settings.noRepeatDays = 0;
  assert.equal(await w.draw(), 't2');
  assert.ok(!('plexPoster.shownAt' in w.storage.data), 'the record is gone once a poster is shown with the window at 0');
  w.settings.noRepeatDays = 3;
  assert.equal(await w.draw(), 't1', 't1 was shown before the window was set to 0: it is drawable again (t2 is on screen)');
  w.settings.noRepeatDays = 0;
  await w.engine.decide({ force: true });
  assert.ok(!('plexPoster.shownAt' in w.storage.data), 'and a draw with the window at 0 clears it too');
});

test('D115 4: a poster shown (a cached one, say) with the window at 0 clears the record without a draw', async () => {
  const w = weighed({ noRepeatDays: 3 }, wPool(2));
  w.storage.removeItem = (k) => delete w.storage.data[k];
  await w.draw();
  assert.ok('plexPoster.shownAt' in w.storage.data);
  w.settings.noRepeatDays = 0;
  w.engine.shown({ ratingKey: 'c1', source: 'cache' });
  assert.ok(!('plexPoster.shownAt' in w.storage.data));
});

test('nothing is recorded while the window is 0, whatever the weighting', async () => {
  const w = weighed({ weighting: 'rated', noRepeatDays: 0 }, wPool(3));
  await draws(w, 3);
  assert.deepEqual(w.storage.data, {});
});

test('the window never shows a title the limit excludes, even when it is the only one outside the window', async () => {
  const pool = [wp('g', { contentRating: 'G' }), wp('r', { contentRating: 'R' })];
  const w = weighed({ noRepeatDays: 3, maxContentRating: 'PG' }, pool, { random: () => 0 });
  assert.deepEqual(await draws(w, 4), ['g', 'g', 'g', 'g']);
});

test('weighting and the window read the settings live: a changed setting applies to the next draw', async () => {
  const w = weighed({}, wPool(3), { random: () => 0 });
  assert.deepEqual(await draws(w, 2), ['t1', 't2']);
  w.settings.weighting = 'unwatched';
  assert.equal(await w.draw(), 't1', 'the last-10 rule has stopped: t1 is not on screen');
  w.settings.weighting = 'off';
  w.settings.noRepeatDays = 3;
  assert.deepEqual(await draws(w, 3), ['t2', 't1', 't3'], 'the window is on: what was shown before it was set is not in the record, what is shown now is');
  assert.deepEqual(Object.keys(JSON.parse(w.storage.data['plexPoster.shownAt'])).sort(), ['t1', 't2', 't3']);
});

test('D112 item 1: a library that fails while the others answer with nothing is a connection failure, not the empty card', async () => {
  const { engine, client } = selecting({ ...TWO });
  const real = client.pool;
  client.pool = async (args) => {
    if (args.libraryKey === '3') throw Object.assign(new Error('Plex did not respond in time.'), { kind: 'timeout' });
    return args.libraryKey === '1' ? [] : real(args);
  };
  await assert.rejects(engine.decide({ force: true }), (err) => err.kind === 'timeout' && err.message === 'Plex did not respond in time.');
});

test('D112 item 1: the first rejection is the one reported, and a failure beside posters still leaves the pool to the others', async () => {
  const { engine, client } = selecting({ ...TWO, libraryKeys: ['1', '3', '5'], libraryNames: ['A', 'B', 'C'] }, { counts: { 1: 4, 3: 4, 5: 4 }, libs: { 1: [], 3: [], 5: [] } });
  client.pool = async (args) => {
    if (args.libraryKey === '1') return [];
    throw Object.assign(new Error(`down ${args.libraryKey}`), { kind: 'network' });
  };
  await assert.rejects(engine.decide({ force: true }), { message: 'down 3' });
  const ok = selecting({ ...TWO });
  const real = ok.client.pool;
  ok.client.pool = async (args) => {
    if (args.libraryKey === '3') throw Object.assign(new Error('timeout'), { kind: 'timeout' });
    return real(args);
  };
  assert.equal((await ok.engine.decide({ force: true })).poster.libraryKey, '1');
});

test('D112 item 1: libraries that all answer with nothing are still the empty card', async () => {
  const { engine, client } = selecting({ ...TWO });
  client.pool = async () => [];
  await assert.rejects(engine.decide({ force: true }), { kind: 'empty' });
});

// ---- viewer-profiles: the engine reads the settings in force (R-PROF-1, D117 4) ----

const PROFILE_KIDS = { id: 'k', name: 'Kids', maxContentRating: 'G', limitNowPlaying: true, libraryKeys: ['3'], libraryNames: ['Kids Movies'], genres: [], ratings: [], source: null, weighting: 'off', noRepeatDays: 3, frameId: 'marquee' };
const PROFILE_ADULTS = { id: 'a', name: 'Adults', maxContentRating: '', limitNowPlaying: false, libraryKeys: ['1'], libraryNames: ['Movies'], genres: [], ratings: [], source: null, weighting: 'off', noRepeatDays: 0, frameId: 'none' };

const eraseable = () => {
  const m = memStorage();
  m.removeItem = (k) => void delete m.data[k];
  return m;
};

function profiled(overrides = {}, { clientOpts = {}, storage = eraseable(), sessions = [] } = {}) {
  const clock = { at: new Date(2026, 0, 5, 7, 0).getTime() }; // Monday 07:00 local
  const settings = {
    ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', libraryKeys: ['1'], libraryNames: ['Movies'], maxContentRating: 'PG-13', unwatchedOnly: false,
    profiles: [PROFILE_KIDS, PROFILE_ADULTS], limitSlots: [{ start: '06:00', profile: 'k' }, { start: '21:00', profile: 'a' }], ...overrides,
  };
  const client = selectionClient(clientOpts);
  client.sessions = async () => sessions;
  const engine = createEngine({ client, getSettings: () => settings, now: () => clock.at, random: () => 0, storage });
  return { engine, client, settings, clock, storage };
}

test('a slot naming a profile: the pool request carries that profile\'s library and limit; the next slot\'s profile changes both', async () => {
  const w = profiled();
  const d = await w.engine.decide();
  assert.deepEqual(w.client.calls.pool, [{ libraryKey: '3', unwatchedOnly: false, size: 100, maxContentRating: 'G' }]);
  assert.equal(d.poster.libraryKey, '3');
  w.clock.at = new Date(2026, 0, 5, 22, 0).getTime();
  const e = await w.engine.decide({ force: true });
  assert.equal(w.client.calls.pool.at(-1).libraryKey, '1', 'the Adults profile reads the Movies library');
  assert.equal(w.client.calls.pool.at(-1).maxContentRating, '', 'and no limit');
  assert.equal(e.poster.libraryKey, '1');
});

test('with no profiles and no profile slots the engine draws exactly as before', async () => {
  const a = profiled({ profiles: [], limitSlots: [] });
  const b = selecting({ libraryKey: '1', libraryKeys: ['1'], libraryNames: ['Movies'], maxContentRating: 'PG-13', unwatchedOnly: false }, {}, () => 0);
  await a.engine.decide();
  await b.engine.decide();
  assert.deepEqual(a.client.calls.pool, b.client.calls.pool);
});

test('a missing profile: the strictest limit among all decides the request, and the sheet\'s library is read', async () => {
  const w = profiled({ limitSlots: [{ start: '06:00', profile: 'gone' }], maxContentRating: 'R' });
  await w.engine.decide();
  assert.deepEqual(w.client.calls.pool.map((a) => [a.libraryKey, a.maxContentRating]), [['1', 'G']], 'Kids (G) is the strictest profile; the library is the sheet\'s');
});

test('the profile\'s now-playing rule decides whether the limit hides what is playing', async () => {
  const session = [{ type: 'movie', ratingKey: 'np', title: 'Playing', thumb: '/t/np', contentRating: 'R', User: { title: 'me' }, Player: { state: 'playing' } }];
  const kids = profiled({}, { sessions: session });
  const hidden = await kids.engine.decide();
  assert.notEqual(hidden.poster.source, 'now-playing', 'Kids applies the limit to what is playing');
  const loose = profiled({ profiles: [{ ...PROFILE_KIDS, limitNowPlaying: false }, PROFILE_ADULTS] }, { sessions: session });
  assert.equal((await loose.engine.decide()).poster.source, 'now-playing', 'this profile does not: the title playing is shown');
  const none = profiled({ profiles: [], limitSlots: [], limitNowPlaying: true }, { sessions: session });
  assert.notEqual((await none.engine.decide()).poster.source, 'now-playing');
});

test('one shown-titles record serves every profile: a profile with window 0 records nothing and clears nothing (D120 5)', async () => {
  const w = profiled();
  w.engine.shown((await w.engine.decide()).poster); // Kids: window 3, recorded
  const kept = w.storage.data['plexPoster.shownAt'];
  assert.ok(kept, 'Kids has a 3 day window');
  w.clock.at = new Date(2026, 0, 5, 22, 0).getTime();
  await w.engine.decide({ force: true }); // a draw under Adults (window 0)
  w.engine.shown((await w.engine.decide({ force: true })).poster);
  assert.equal(w.storage.data['plexPoster.shownAt'], kept, 'Adults (window 0) neither recorded nor cleared');
});

test('the record is cleared when the household\'s own window is 0 and no profile has a window above 0', async () => {
  const w = profiled({ profiles: [{ ...PROFILE_KIDS, noRepeatDays: 0 }, PROFILE_ADULTS] });
  w.storage.data['plexPoster.shownAt'] = JSON.stringify({ x: w.clock.at - 1000 });
  w.engine.shown((await w.engine.decide()).poster);
  assert.ok(!('plexPoster.shownAt' in w.storage.data), 'no window anywhere: a shown poster clears it');
  w.storage.data['plexPoster.shownAt'] = JSON.stringify({ x: w.clock.at - 1000 });
  await w.engine.decide({ force: true });
  assert.ok(!('plexPoster.shownAt' in w.storage.data), 'and so does a draw');
  const house = profiled({ noRepeatDays: 2, profiles: [{ ...PROFILE_KIDS, noRepeatDays: 0 }, PROFILE_ADULTS] });
  house.storage.data['plexPoster.shownAt'] = JSON.stringify({ x: house.clock.at - 1000 });
  await house.engine.decide({ force: true });
  assert.ok('plexPoster.shownAt' in house.storage.data, 'the household window is above 0: kept');
});

test('the household toggle off: no profile switches anything, and no limit applies (D120 4)', async () => {
  const w = profiled({ maxContentRating: '' });
  await w.engine.decide();
  assert.deepEqual(w.client.calls.pool, [{ libraryKey: '1', unwatchedOnly: false, size: 100, maxContentRating: '' }], 'the sheet\'s library, no limit');
});

test('a profile in force that ticks no library and has no source reports an empty card naming it, never a silent blank (D120 3)', async () => {
  const w = profiled({ profiles: [{ ...PROFILE_KIDS, libraryKeys: [], libraryNames: [] }, PROFILE_ADULTS] });
  await assert.rejects(w.engine.decide(), (err) => err.kind === 'empty' && /Kids/.test(err.message));
  assert.equal(w.client.calls.pool.length, 0, 'nothing was asked of the server');
  const plain = selecting({ libraryKey: '', libraryKeys: [] });
  assert.equal(await plain.engine.decide(), null, 'the household\'s own empty selection still returns null, as before');
});

test('the profile\'s weighting is the one drawn with', async () => {
  const pool = [{ ...poster('w'), viewCount: 1 }, { ...poster('u'), viewCount: 0 }];
  const settings = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', unwatchedOnly: false, profiles: [{ ...PROFILE_KIDS, weighting: 'unwatched', libraryKeys: ['1'], maxContentRating: '' }], limitSlots: [{ start: '06:00', profile: 'k' }] };
  const at7 = new Date(2026, 0, 5, 7, 0).getTime();
  const picks = [];
  for (const r of [0.1, 0.5, 0.7, 0.99]) {
    const engine = createEngine({ client: fakeClient({ pool }), getSettings: () => settings, now: () => at7, random: () => r, storage: memStorage() });
    picks.push((await engine.decide()).poster.ratingKey);
  }
  assert.deepEqual(picks, ['w', 'u', 'u', 'u'], 'weights w:1 u:3 over [0,4): 0.1 -> w, the rest -> u');
});

test('D116 2: clearShown forgets the record', async () => {
  const w = profiled();
  w.engine.shown((await w.engine.decide()).poster);
  assert.ok('plexPoster.shownAt' in w.storage.data);
  w.engine.clearShown();
  assert.ok(!('plexPoster.shownAt' in w.storage.data));
});

test('limitSet is true when only a profile slot sets a limit (the D37 re-check still runs)', async () => {
  const w = profiled({ maxContentRating: '' });
  let rechecks = 0;
  const client = selectionClient();
  client.items = async () => (rechecks++, []);
  const engine = createEngine({ client, getSettings: () => w.settings, now: () => w.clock.at, random: () => 0, cachedKeys: () => ['x'], onRatings: () => {}, storage: memStorage() });
  await engine.decide();
  assert.equal(rechecks, 1);
  const off = createEngine({ client, getSettings: () => ({ ...w.settings, limitSlots: [{ start: '06:00', profile: 'a' }] }), now: () => w.clock.at, random: () => 0, cachedKeys: () => ['x'], onRatings: () => {}, storage: memStorage() });
  await off.decide();
  assert.equal(rechecks, 1, 'a profile with no limit: no re-check');
});

// ---- the engine hands the settings in force to the adapter's nowPlaying, at both call sites ----

test('decide() and playing() give nowPlaying the username rule and include-episodes in force', async () => {
  const seen = [];
  const client = { ...fakeClient({ pool: [poster('a')] }), nowPlaying: (sessions, s) => (seen.push({ sessions, username: s.username, includeEpisodes: s.includeEpisodes }), null) };
  const settings = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', username: 'kid', includeEpisodes: false };
  const engine = createEngine({ client, getSettings: () => settings, now: () => 1_000_000, random: () => 0 });
  const given = [{ type: 'movie' }];
  await engine.decide({ sessions: given });
  await engine.playing(given);
  assert.deepEqual(seen, [
    { sessions: given, username: 'kid', includeEpisodes: false },
    { sessions: given, username: 'kid', includeEpisodes: false },
  ]);
});

test('decide() with a username set ignores another viewer\'s session (the real adapter reads the settings)', async () => {
  const NPS = [{ type: 'movie', ratingKey: 'np', title: 'Playing', thumb: '/t/np', User: { title: 'someone' }, Player: { state: 'playing' } }];
  const other = setup({ username: 'kid' }, { sessions: NPS, pool: [poster('a')] });
  assert.equal((await other.engine.decide({ sessions: NPS })).poster.source, 'random');
  const mine = setup({ username: 'someone' }, { sessions: NPS, pool: [poster('a')] });
  assert.equal((await mine.engine.decide({ sessions: NPS })).poster.source, 'now-playing');
});

// ---- several servers (R-SRC-4, D157) ----

const SCOPED = (n) => `@jf-1/${n}`;

test('a poster above the limit from the second server never passes, however the server filtered (D5)', async () => {
  const pool = [
    { ...poster('1'), contentRating: 'G' },
    { ...poster(SCOPED('2')), contentRating: 'R' },
    { ...poster(SCOPED('3')), contentRating: '' },
    { ...poster(SCOPED('4')), contentRating: 'PG' },
  ];
  const { engine, client } = setup({ maxContentRating: 'PG', libraryKeys: ['1', SCOPED('b1')], libraryKey: '1', randomPoolSize: 10, servers: [{ id: 'jf-1', type: 'jellyfin', url: 'http://j', token: '' }] }, { pool }, Math.random);
  client.libraryCount = async () => 5;
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add((await engine.decide({ force: true })).poster.ratingKey);
  assert.deepEqual([...seen].sort(), ['1', SCOPED('4')]);
});

test('each chosen library of each server is asked for in proportion to its title count, and a genre goes by its title too', async () => {
  const asked = [];
  const client = { ...fakeClient({ pool: [poster('a')] }), libraryCount: async (k) => ({ 1: 30, [SCOPED('b1')]: 10 })[k], pool: async (r) => (asked.push(r), [{ ...poster(`${r.libraryKey}-x`), libraryKey: undefined }]) };
  const settings = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', libraryKeys: ['1', SCOPED('b1')], randomPoolSize: 40, genres: [{ key: '11', title: 'Drama' }], servers: [{ id: 'jf-1', type: 'jellyfin', url: 'http://j', token: '' }] };
  const engine = createEngine({ client, getSettings: () => settings });
  await engine.decide({ force: true }).catch(() => {});
  assert.deepEqual(asked.map((r) => [r.libraryKey, r.size]).sort(), [['1', 30], [SCOPED('b1'), 10]].sort());
  for (const r of asked) assert.deepEqual([r.genres, r.genreTitles], [['11'], ['Drama']]);
});

test('with several servers a pin whose server or id is gone is marked gone; with one server nothing changes (D122 1)', async () => {
  const gone = Object.assign(new Error('That library item no longer exists.'), { kind: 'http', status: 404 });
  const settings = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', staticRatingKey: SCOPED('9'), showNowPlaying: false };
  const several = { ...fakeClient(), multi: true, item: async () => Promise.reject(gone) };
  await assert.rejects(() => createEngine({ client: several, getSettings: () => settings }).decide(), (err) => err.pinGone === true);
  const one = { ...fakeClient(), item: async () => Promise.reject(Object.assign(new Error('x'), { kind: 'http', status: 404 })) };
  await assert.rejects(() => createEngine({ client: one, getSettings: () => settings }).decide(), (err) => err.pinGone === undefined);
  const other = { ...fakeClient(), multi: true, item: async () => Promise.reject(Object.assign(new Error('down'), { kind: 'network' })) };
  await assert.rejects(() => createEngine({ client: other, getSettings: () => settings }).decide(), (err) => err.pinGone === undefined, 'a server that is only down keeps the pin');
});

test('with several servers a pool that fails everywhere names every server in its error, and a single server\'s error is its own (D157 5)', async () => {
  const err = (message, kind = 'network') => Object.assign(new Error(message), { kind });
  const make = (multi) => ({
    ...fakeClient(),
    multi,
    libraryCount: async () => 5,
    pool: async (r) => Promise.reject(r.libraryKey === '1' ? err('Could not reach Plex (network or CORS error).') : err('Could not reach Jellyfin (network or CORS error).')),
  });
  const settings = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', libraryKeys: ['1', '@jf-1/b1'], showNowPlaying: false, servers: [{ id: 'jf-1', type: 'jellyfin', url: 'http://j', token: '' }] };
  await assert.rejects(() => createEngine({ client: make(true), getSettings: () => settings }).decide({ force: true }), (e) => e.kind === 'network' && /Plex/.test(e.message) && /Jellyfin/.test(e.message));
  await assert.rejects(() => createEngine({ client: make(false), getSettings: () => settings }).decide({ force: true }), (e) => /Plex/.test(e.message) && !/Jellyfin/.test(e.message), 'without the multi source the first error is the error, as in 2.4.0');
});

test('with several servers a pool that fails everywhere names each server by its own name, once; an error that names no server keeps its words (D165 4)', async () => {
  const err = (message, serverMessage) => Object.assign(new Error(message), { kind: 'network', ...(serverMessage ? { serverMessage } : {}) });
  const make = (plex, jelly) => ({ ...fakeClient(), multi: true, libraryCount: async () => 5, pool: async (r) => Promise.reject(r.libraryKey === '1' ? plex : jelly) });
  const settings = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', libraryKeys: ['1', '@jf-1/b1'], showNowPlaying: false, servers: [{ id: 'jf-1', type: 'jellyfin', url: 'http://j', token: '' }] };
  const failure = (client) => createEngine({ client, getSettings: () => settings }).decide({ force: true }).then(() => null, (e) => e.message);
  const named = make(err('Could not reach Plex (network or CORS error).', 'Could not reach Home Plex (network or CORS error).'), err('Could not reach Jellyfin (network or CORS error).', 'Could not reach Mock Jellyfin (network or CORS error).'));
  assert.equal(await failure(named), 'Could not reach Home Plex (network or CORS error). Could not reach Mock Jellyfin (network or CORS error).');
  const plain = make(err('Could not reach Plex (network or CORS error).'), err('Could not reach Jellyfin (network or CORS error).'));
  assert.equal(await failure(plain), 'Could not reach Plex (network or CORS error). Could not reach Jellyfin (network or CORS error).', 'an error that names no server is joined as it is');
});
