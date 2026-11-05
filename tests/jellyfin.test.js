// The Jellyfin adapter (js/sources/jellyfin.js) against the mock server (scripts/mock-jellyfin.mjs), plus stubbed replies for
// what the mock does not hold (an episode's series, a CustomRating). Every Jellyfin shape here is a (verify) row in
// docs/validation/real-server-extended.md; no real server is used.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startMockJellyfin, TOKEN, USERNAME, PASSWORD } from '../scripts/mock-jellyfin.mjs';
import { createSource, signInFlow, SourceError } from '../js/sources/index.js';
import { authHeader, jellyfinSignIn, pickNowPlaying, ratingOf, toPoster } from '../js/sources/jellyfin.js';
import { createEngine } from '../js/engine.js';
import { allows, ratingRank } from '../js/ratings.js';
import { defaults } from '../js/settings.js';

globalThis.location ??= { origin: 'http://localhost' };

let server;
let base;
before(async () => {
  server = await startMockJellyfin({ port: 0 });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
/** A fetch that records every request and passes it to the mock. */
const recording = () => {
  const calls = [];
  const fetchImpl = (url, init = {}) => {
    calls.push({ url: new URL(url), init });
    return fetch(url, init);
  };
  return { calls, fetchImpl };
};
const connect = (extra = {}) => {
  const rec = recording();
  const source = createSource({ serverType: 'jellyfin', serverUrl: base, plexToken: TOKEN, ...extra }, { clientId: 'device-1', version: '9.9.9', fetchImpl: rec.fetchImpl });
  return { source, ...rec };
};
const post = (path) => fetch(`${base}${path}`, { method: 'POST' });
const names = (posters) => posters.map((p) => p.title);
/** A fetch that answers from a table of path -> body (a function gets the URL), 404 otherwise. */
const stub = (table) => async (url) => {
  const u = new URL(url);
  const hit = table[u.pathname];
  if (hit === undefined) return new Response('{}', { status: 404 });
  if (hit instanceof Response) return hit;
  return new Response(JSON.stringify(typeof hit === 'function' ? hit(u) : hit), { status: 200 });
};
const stubbed = (table) => createSource({ serverType: 'jellyfin', serverUrl: 'http://jf.test', plexToken: 't' }, { clientId: 'c', version: '1', fetchImpl: stub(table) });

// ---- the Authorization header ----

test('every request carries Client, Device, DeviceId, Version and Token in the Authorization header', async () => {
  const { source, calls } = connect();
  await source.identity();
  await source.libraries();
  await source.pool({ libraryKey: (await source.libraries())[0].key });
  assert.ok(calls.length >= 4);
  for (const { url, init } of calls) {
    const header = init.headers.Authorization;
    assert.match(header, /^MediaBrowser /, url.pathname);
    for (const [key, value] of [['Client', 'Now Showing'], ['Device', 'Now Showing'], ['DeviceId', 'device-1'], ['Version', '9.9.9'], ['Token', TOKEN]]) {
      assert.ok(header.includes(`${key}="${value}"`), `${url.pathname} lacks ${key}`);
    }
  }
});

test('authHeader: Token is left off before there is one, and a quote in a value cannot break out of it', () => {
  assert.equal(authHeader({ clientId: 'a', version: '1' }), 'MediaBrowser Client="Now Showing", Device="Now Showing", DeviceId="a", Version="1"');
  assert.ok(!authHeader({ clientId: 'a"b', version: '1', token: 't"x' }).includes('a"b'));
});

// ---- libraries, counts, identity ----

test('libraries maps CollectionType movies to movie, and keeps other types out of the movie choice', async () => {
  const { source } = connect();
  assert.deepEqual((await source.libraries()).map((l) => [l.title, l.type]), [['Movies', 'movie'], ['Kids Movies', 'movie'], ['Music', 'music']]);
  const lib = stubbed({ '/UserViews': { Items: [{ Id: 'a', Name: 'Shows', CollectionType: 'tvshows' }, { Id: 'b', Name: 'Mixed' }] } });
  assert.deepEqual((await lib.libraries()).map((l) => l.type), ['show', '']);
});

test('libraryCount asks for no items and reads TotalRecordCount; any failure is null', async () => {
  const { source, calls } = connect();
  const [movies, kids] = await source.libraries();
  assert.equal(await source.libraryCount(movies.key), 8);
  assert.equal(await source.libraryCount(kids.key), 5);
  assert.equal(calls.at(-1).url.searchParams.get('Limit'), '0');
  assert.equal(await stubbed({}).libraryCount('x'), null);
});

test('identity reads the server name and checks the token; a wrong token is an auth error', async () => {
  const { source } = connect();
  assert.deepEqual(await source.identity(), { name: 'Mock Jellyfin', version: '10.10.0', machineIdentifier: '90000000000000000000000000000001' });
  const bad = createSource({ serverType: 'jellyfin', serverUrl: base, plexToken: 'wrong' }, { clientId: 'c' });
  await assert.rejects(bad.identity(), (err) => err instanceof SourceError && err.kind === 'auth' && err.status === 401);
});

// ---- the requests built for the pool ----

test('one library: its id as ParentId, Movie items, random order, unwatched filter, no rating or genre filter', async () => {
  const { source, calls } = connect();
  const [movies] = await source.libraries();
  calls.length = 0;
  const posters = await source.pool({ libraryKey: movies.key, unwatchedOnly: true, size: 50 });
  const q = calls[0].url.searchParams;
  assert.equal(calls[0].url.pathname, '/Items');
  assert.equal(q.get('ParentId'), movies.key);
  assert.equal(q.get('IncludeItemTypes'), 'Movie');
  assert.equal(q.get('Recursive'), 'true');
  assert.equal(q.get('SortBy'), 'Random');
  assert.equal(q.get('Filters'), 'IsUnplayed');
  assert.equal(q.get('Limit'), '50');
  assert.equal(q.has('OfficialRatings'), false);
  assert.equal(q.has('GenreIds'), false);
  assert.deepEqual(names(posters).sort(), ['Encore', 'Last Reel', 'Midnight Projector', 'Popcorn Skies', 'Silver Screen Serenade'].sort(), 'unwatched titles of the Movies library only');
  const all = await source.pool({ libraryKey: movies.key, unwatchedOnly: false, size: 50 });
  assert.equal(all.length, 8);
  assert.equal(calls.at(-1).url.searchParams.has('Filters'), false);
});

test('two libraries: the engine asks each for its share of the pool, by its id', async () => {
  const { source, calls } = connect();
  const [movies, kids] = await source.libraries();
  const settings = { ...defaults(), serverType: 'jellyfin', serverUrl: base, plexToken: TOKEN, libraryKey: movies.key, libraryKeys: [movies.key, kids.key], libraryNames: ['Movies', 'Kids Movies'], showNowPlaying: false, unwatchedOnly: false, randomPoolSize: 40 };
  const engine = createEngine({ client: source, getSettings: () => settings, storage: memoryStorage() });
  calls.length = 0;
  const decision = await engine.decide({ force: true });
  assert.ok(decision.poster.title);
  const asks = calls.filter((c) => c.url.pathname === '/Items' && c.url.searchParams.get('SortBy') === 'Random');
  assert.deepEqual(asks.map((c) => c.url.searchParams.get('ParentId')).sort(), [movies.key, kids.key].sort());
  assert.equal(asks.reduce((n, c) => n + Number(c.url.searchParams.get('Limit')), 0), 40, 'the shares add up to the pool size');
  const counts = calls.filter((c) => c.url.searchParams.get('Limit') === '0');
  assert.equal(counts.length, 2, 'one count per library');
});

test('a genre set: the genre ids go to the server and the posters carry the genre', async () => {
  const { source, calls } = connect();
  const [movies] = await source.libraries();
  const genres = await source.genres(movies.key);
  assert.ok(genres.length >= 5);
  const drama = genres.find((g) => g.title === 'Drama');
  assert.match(drama.key, /^[0-9a-f]{32}$/);
  calls.length = 0;
  const posters = await source.pool({ libraryKey: movies.key, unwatchedOnly: false, genres: [drama.key] });
  assert.equal(calls[0].url.searchParams.get('GenreIds'), drama.key);
  assert.ok(posters.length >= 4);
  assert.ok(posters.every((p) => p.genres.includes('Drama')));
});

test('a limit asks for the allowed US ratings only (3x the size), and a rating set asks for its rungs only', async () => {
  const { source, calls } = connect();
  const [movies] = await source.libraries();
  calls.length = 0;
  const pg = await source.pool({ libraryKey: movies.key, unwatchedOnly: false, size: 10, maxContentRating: 'PG' });
  const q = calls[0].url.searchParams;
  assert.deepEqual(q.get('OfficialRatings').split('|').sort(), ['G', 'PG', 'TV-G', 'TV-PG', 'TV-Y', 'TV-Y7']);
  assert.equal(q.get('Limit'), '30');
  assert.deepEqual(names(pg).sort(), ['Midnight Projector', 'The Grand Marquee']);
  const set = await source.pool({ libraryKey: movies.key, unwatchedOnly: false, size: 10, maxContentRating: 'R', ratings: ['PG-13'] });
  assert.deepEqual(calls.at(-1).url.searchParams.get('OfficialRatings').split('|').sort(), ['PG-13', 'TV-14']);
  assert.deepEqual(names(set), ['Velvet Curtain']);
  // Nothing the limit allows: no request at all (an empty filter would ask for everything).
  const before = calls.length;
  assert.deepEqual(await source.pool({ libraryKey: movies.key, maxContentRating: 'G', ratings: ['R'] }), []);
  assert.equal(calls.length, before);
});

test('pool returns Movie items that have a poster image; an item without ImageTags.Primary is not drawn', async () => {
  const item = (Id, extra = {}) => ({ Id, Name: `T${Id}`, Type: 'Movie', ImageTags: { Primary: 't' }, ...extra });
  const source = stubbed({ '/Items': { Items: [item('1'), item('2', { ImageTags: {} }), item('3', { ImageTags: undefined }), item('4', { Type: 'Episode' }), item('5')] } });
  assert.deepEqual((await source.pool({ libraryKey: 'x' })).map((p) => p.ratingKey), ['1', '5']);
});

// ---- a collection and a playlist ----

test('a BoxSet: listed by ParentId, only its Movie items become posters, and every id it held is listed', async () => {
  const { source, calls } = connect();
  const [movies] = await source.libraries();
  const boxes = await source.collections(movies.key);
  assert.deepEqual(boxes.map((b) => [b.title, b.smart, b.library]), [['Midnight Double Feature', false, '']]);
  calls.length = 0;
  const posters = await source.sourceItems({ kind: 'collection', key: boxes[0].key }, { unwatchedOnly: false });
  assert.equal(calls[0].url.searchParams.get('ParentId'), boxes[0].key);
  assert.deepEqual(names(posters).sort(), ['Midnight Projector', 'Neon Matinee']);
  assert.equal(posters.listed.length, 2);
  assert.ok(posters.every((p) => p.source === 'random'));
});

test('a playlist: read through /Playlists/{id}/Items; the limit and unwatched filters apply before the cut', async () => {
  const { source, calls } = connect();
  const lists = await source.playlists();
  assert.deepEqual(lists.map((l) => l.title), ['Weekend Picks']);
  calls.length = 0;
  const all = await source.sourceItems({ kind: 'playlist', key: lists[0].key }, { unwatchedOnly: false });
  assert.equal(calls[0].url.pathname, `/Playlists/${lists[0].key}/Items`);
  assert.deepEqual(names(all).sort(), ['Last Reel', 'The Grand Marquee', 'Tiny Lanterns']);
  assert.equal(all.listed.length, 3);
  const unwatched = await source.sourceItems({ kind: 'playlist', key: lists[0].key }, { unwatchedOnly: true });
  assert.deepEqual(names(unwatched), ['Last Reel'], 'the two watched titles are left out');
  const pg = await source.sourceItems({ kind: 'playlist', key: lists[0].key }, { unwatchedOnly: false, maxContentRating: 'PG' });
  assert.deepEqual(names(pg).sort(), ['The Grand Marquee', 'Tiny Lanterns'], 'Last Reel is rated 15: unknown, left out');
  assert.equal(pg.listed.length, 3, 'the listing still holds what the filters dropped');
});

test('only Movie items become posters from a collection or a playlist (D141 7)', async () => {
  const source = stubbed({
    '/Items': { Items: [{ Id: '1', Name: 'M', Type: 'Movie', ImageTags: { Primary: 'x' } }, { Id: '2', Name: 'E', Type: 'Episode', ImageTags: { Primary: 'x' } }, { Id: '3', Name: 'S', Type: 'Series', ImageTags: { Primary: 'x' } }] },
  });
  const posters = await source.sourceItems({ kind: 'collection', key: 'b' }, { unwatchedOnly: false });
  assert.deepEqual(posters.map((p) => p.ratingKey), ['1']);
  assert.deepEqual(posters.listed, ['1', '2', '3']);
});

// ---- the item mapping ----

test('a Jellyfin movie maps to the poster shape the engine reads', async () => {
  const { source } = connect();
  const [movies] = await source.libraries();
  const all = await source.pool({ libraryKey: movies.key, unwatchedOnly: false, size: 20 });
  const marquee = all.find((p) => p.title === 'The Grand Marquee');
  assert.deepEqual(marquee, {
    ratingKey: 'a0000000000000000000000000000001',
    title: 'The Grand Marquee',
    year: '1954',
    thumb: 'a0000000000000000000000000000001',
    source: 'random',
    user: '',
    contentRating: 'G',
    duration: 90 * 60 * 1000,
    summary: 'On the last night of the season, the owner of a failing picture palace stages one grand show to save it.',
    genres: ['Drama'],
    viewCount: 2,
    audienceRating: 7.9,
  });
  const fresh = all.find((p) => p.title === 'Midnight Projector');
  assert.equal('viewCount' in fresh, false, 'a play count of 0 is left off');
  assert.equal(all.find((p) => p.title === 'Encore').contentRating, '', 'no OfficialRating: unrated');
  assert.equal(all.find((p) => p.title === 'Last Reel').contentRating, '', 'OfficialRating 15 is not a US value: unknown');
  assert.equal(all.find((p) => p.title === 'Neon Matinee').contentRating, 'TV-MA');
});

test('item() and items() return posters as static; an id the server lacks is an http error, and no ids make no request', async () => {
  const { source, calls } = connect();
  const [movies] = await source.libraries();
  const [first, second] = await source.pool({ libraryKey: movies.key, unwatchedOnly: false, size: 20 });
  const one = await source.item(first.ratingKey);
  assert.equal(one.source, 'static');
  assert.equal(one.ratingKey, first.ratingKey);
  calls.length = 0;
  const two = await source.items([first.ratingKey, second.ratingKey, '00000000000000000000000000000000']);
  assert.equal(calls.length, 1, 'one request');
  assert.deepEqual(two.map((p) => p.ratingKey).sort(), [first.ratingKey, second.ratingKey].sort());
  await assert.rejects(source.item('00000000000000000000000000000000'), (err) => err.kind === 'http' && err.status === 404);
  calls.length = 0;
  assert.deepEqual(await source.items([]), []);
  assert.equal(calls.length, 0);
});

test('missing fields: a missing play count is 0 (left off), a missing runtime, score or year is left empty', () => {
  const bare = toPoster({ Id: '1', Name: 'Bare', Type: 'Movie' }, 'random');
  assert.deepEqual(bare, { ratingKey: '1', title: 'Bare', year: '', thumb: '1', source: 'random', user: '', contentRating: '', duration: 0, summary: '' });
  const odd = toPoster({ Id: '2', Name: 'Odd', Type: 'Movie', RunTimeTicks: 'x', CommunityRating: 'high', UserData: { PlayCount: 'many' }, Genres: ['', 5, ' Drama '] }, 'random');
  assert.equal(odd.duration, 0);
  assert.equal('audienceRating' in odd, false);
  assert.equal('viewCount' in odd, false);
  assert.deepEqual(odd.genres, ['Drama']);
});

// ---- ratings (D141 1, 5) ----

test('the rating that counts is CustomRating when it is not empty, else OfficialRating', () => {
  assert.equal(ratingOf({ OfficialRating: 'PG', CustomRating: 'R' }), 'R', 'a custom rating that tightens');
  assert.equal(ratingOf({ OfficialRating: 'R', CustomRating: 'PG' }), 'PG', 'a custom rating that relaxes');
  assert.equal(allows('PG', ratingOf({ OfficialRating: 'PG', CustomRating: 'R' })), false);
  assert.equal(allows('PG', ratingOf({ OfficialRating: 'R', CustomRating: 'PG' })), true);
  for (const empty of ['', '   ', null, undefined]) assert.equal(ratingOf({ OfficialRating: 'PG-13', CustomRating: empty }), 'PG-13', String(empty));
  assert.equal(ratingOf({ OfficialRating: 'G', CustomRating: '15' }), '', 'a custom rating wins even when it is not one we read: unknown');
  assert.equal(ratingOf({ CustomRating: 'PG' }), 'PG');
  assert.equal(ratingOf({}), '');
  assert.equal(ratingOf(null), '');
});

test('a rating field that is present but not a string makes the rating unknown, never a fallback to the other field (D147 1)', () => {
  for (const bad of [4, true, ['R'], { v: 'R' }]) {
    assert.equal(ratingOf({ OfficialRating: 'G', CustomRating: bad }), '', `CustomRating ${JSON.stringify(bad)} over OfficialRating G`);
    assert.equal(ratingOf({ OfficialRating: bad, CustomRating: 'PG' }), '', `OfficialRating ${JSON.stringify(bad)} under CustomRating PG`);
    assert.equal(ratingOf({ OfficialRating: bad }), '', `OfficialRating ${JSON.stringify(bad)} alone`);
    assert.equal(ratingOf({ CustomRating: bad }), '', `CustomRating ${JSON.stringify(bad)} alone`);
  }
  for (const limit of ['G', 'PG', 'PG-13', 'R', 'NC-17']) assert.equal(allows(limit, ratingOf({ OfficialRating: 'G', CustomRating: ['R'] })), false, `OfficialRating G with CustomRating ['R'] under ${limit}`);
});

test('a pool, a genre list, a collection list or a library list with no Items array, or entries that are not objects, is a parse error (D147 1)', async () => {
  const bad = [{}, { Items: 'x' }, { Items: null }, { Items: { a: 1 } }, { Items: [null] }, { Items: ['x'] }, { Items: [[]] }, { Items: [{ Id: 'a' }, 7] }, [], null];
  for (const reply of bad) {
    const jf = stubbed({ '/Items': reply, '/UserViews': reply, '/Genres': reply, '/Playlists/p/Items': reply });
    const why = JSON.stringify(reply);
    await assert.rejects(() => jf.pool({ libraryKey: 'l' }), (err) => err.kind === 'parse' && /Jellyfin/.test(err.message), `pool ${why}`);
    await assert.rejects(() => jf.libraries(), (err) => err.kind === 'parse', `libraries ${why}`);
    await assert.rejects(() => jf.genres('l'), (err) => err.kind === 'parse', `genres ${why}`);
    await assert.rejects(() => jf.collections(), (err) => err.kind === 'parse', `collections ${why}`);
    await assert.rejects(() => jf.playlists(), (err) => err.kind === 'parse', `playlists ${why}`);
    await assert.rejects(() => jf.sourceItems({ kind: 'playlist', key: 'p' }), (err) => err.kind === 'parse', `playlist items ${why}`);
    await assert.rejects(() => jf.items(['a']), (err) => err.kind === 'parse', `items ${why}`);
  }
  assert.deepEqual(await stubbed({ '/Items': { Items: [] } }).pool({ libraryKey: 'l' }), [], 'an empty list is a list');
});

test('sessions that are not a list, and server information that is not an object, are parse errors for Jellyfin (D147 1)', async () => {
  for (const reply of [{}, { Items: [] }, 'x', 7]) {
    await assert.rejects(() => stubbed({ '/Sessions': reply }).sessions(), (err) => err.kind === 'parse', JSON.stringify(reply));
  }
  assert.deepEqual(await stubbed({ '/Sessions': [] }).sessions(), []);
  for (const info of [null, [], 'x']) {
    await assert.rejects(() => stubbed({ '/System/Info/Public': info, '/UserViews': { Items: [] } }).identity(), (err) => err.kind === 'parse', JSON.stringify(info));
  }
});

test('the US film and TV values map as for Plex; every other spelling is unknown and hidden under any limit', () => {
  const ladder = { G: 0, 'TV-Y': 0, 'TV-G': 0, PG: 1, 'TV-Y7': 1, 'TV-PG': 1, 'PG-13': 2, 'TV-14': 2, R: 3, 'TV-MA': 3, 'NC-17': 4 };
  for (const [value, rung] of Object.entries(ladder)) {
    assert.equal(ratingOf({ OfficialRating: value }), value);
    assert.equal(ratingRank(ratingOf({ OfficialRating: value })), rung, value);
  }
  for (const value of ['15', '12A', '', 'NR', 'PG13', 'US-PG', 'pg', 'Pg', 'tv-ma', 'g', 'gb/12A', 'de/16', 'TV-*', 'TV-', 'TV-Z', 'Not Rated', 'Unrated', '18+']) {
    const rating = ratingOf({ OfficialRating: value });
    assert.equal(rating, '', value);
    for (const limit of ['G', 'PG', 'PG-13', 'R', 'NC-17']) assert.equal(allows(limit, rating), false, `${value} under ${limit}`);
  }
  assert.equal(ratingOf({ OfficialRating: ' PG-13 ' }), 'PG-13', 'surrounding spaces are not part of the value, as for Plex');
});

// ---- now playing ----

const movieItem = { Id: 'm1', Name: 'Film', Type: 'Movie', OfficialRating: 'PG', ImageTags: { Primary: 'x' }, ProductionYear: 2001 };
const session = (item, extra = {}) => ({ Id: 's', UserName: 'demo', DeviceName: 'Living Room', PlayState: { IsPaused: false, PositionTicks: 600_000_000 }, NowPlayingItem: item, ...extra });
const episodeItem = { Id: 'e1', Name: 'The Long Tide', Type: 'Episode', SeriesId: 'sr1', SeriesName: 'Harbor Lights', OfficialRating: 'TV-14', RunTimeTicks: 30 * 60 * 10_000_000, Overview: 'Episode synopsis.' };

test('now playing a movie, from the mock: the poster carries the session user, position, player and paused state', async () => {
  const { source } = connect();
  await post('/__mock/jellyfin-sessions?kind=movie&user=demo');
  const np = source.nowPlaying(await source.sessions(), { username: '', includeEpisodes: true });
  assert.equal(np.source, 'now-playing');
  assert.equal(np.title, 'The Grand Marquee');
  assert.equal(np.user, 'demo');
  assert.equal(np.playerTitle, 'Living Room');
  assert.equal(np.playerState, 'playing');
  assert.equal(np.paused, false);
  assert.equal(np.viewOffset, 0);
  await post('/__mock/jellyfin-sessions?kind=movie&paused=1');
  const paused = source.nowPlaying(await source.sessions(), {});
  assert.equal(paused.paused, true);
  assert.equal(paused.playerState, 'paused');
  await post('/__mock/jellyfin-sessions?kind=none');
  assert.equal(source.nowPlaying(await source.sessions(), {}), null);
});

test('now playing an episode, from the mock: the series poster, the series id, and an unreadable series rating is treated as unrated (D73)', async () => {
  const { source } = connect();
  await post('/__mock/jellyfin-sessions?kind=episode');
  const np = source.nowPlaying(await source.sessions(), {});
  assert.equal(np.title, 'Harbor Lights');
  assert.equal(np.ratingKey, 'f0000000000000000000000000000001', 'the series id');
  assert.equal(np.thumb, np.ratingKey);
  assert.equal(np.episodeRating, true);
  assert.equal('seriesRating' in np, false);
  assert.equal(np.contentRating, '');
  assert.equal(allows('PG-13', np.contentRating), false, 'unrated: hidden under a limit');
  assert.equal(source.nowPlaying(await source.sessions(), { includeEpisodes: false }), null);
  await post('/__mock/jellyfin-sessions?kind=none');
});

test('an episode shows its series poster with the series\' own rating beside the episode\'s own (D73, D75)', async () => {
  const source = stubbed({
    '/Sessions': [session(episodeItem)],
    '/Items': (u) => {
      assert.deepEqual(u.searchParams.get('Ids').split(',').sort(), ['e1', 'sr1']);
      return { Items: [episodeItem, { Id: 'sr1', Name: 'Harbor Lights', Type: 'Series', OfficialRating: 'TV-MA' }] };
    },
  });
  const np = source.nowPlaying(await source.sessions(), {});
  assert.equal(np.ratingKey, 'sr1');
  assert.equal(np.title, 'Harbor Lights');
  assert.equal(np.thumb, 'sr1');
  assert.equal(np.contentRating, 'TV-14', 'the live check reads the episode\'s own rating');
  assert.equal(np.seriesRating, 'TV-MA', 'the series\' rating travels apart, for the offline cache');
  assert.equal('episodeRating' in np, false);
  assert.equal(np.duration, 30 * 60 * 1000);
  assert.equal(np.summary, 'Episode synopsis.');
});

test('a series whose rating cannot be read (absent, empty or not a rating we read) leaves the episode as its own rating only', async () => {
  for (const series of [{}, { OfficialRating: '' }, { OfficialRating: '15' }, { OfficialRating: 'NR' }]) {
    const source = stubbed({ '/Sessions': [session(episodeItem)], '/Items': { Items: [episodeItem, { Id: 'sr1', Type: 'Series', ...series }] } });
    const np = source.nowPlaying(await source.sessions(), {});
    assert.equal(np.episodeRating, true, JSON.stringify(series));
    assert.equal('seriesRating' in np, false);
  }
  const failing = stubbed({ '/Sessions': [session(episodeItem)], '/Items': new Response('', { status: 500 }) });
  await assert.rejects(failing.sessions(), { kind: 'http' }, 'a failed item request shows nothing rather than an unchecked rating');
});

test('the playing item is read again, so a CustomRating the session lacks still counts (D141 1)', async () => {
  const source = stubbed({ '/Sessions': [session(movieItem)], '/Items': { Items: [{ ...movieItem, CustomRating: 'R' }] } });
  const np = source.nowPlaying(await source.sessions(), {});
  assert.equal(np.contentRating, 'R');
  assert.equal(allows('PG', np.contentRating), false);
});

test('which session counts: the user filter, then the first playing one; only a movie or (when asked) an episode', () => {
  const a = session({ ...movieItem, Id: 'a', Name: 'A' }, { UserName: 'Ann', PlayState: { IsPaused: true } });
  const b = session({ ...movieItem, Id: 'b', Name: 'B' }, { UserName: 'Bob', PlayState: { IsPaused: false } });
  assert.equal(pickNowPlaying([a, b], {}).title, 'B', 'a playing session before a paused one');
  assert.equal(pickNowPlaying([a, b], { username: ' ann ' }).title, 'A', 'the user filter, case-insensitive');
  assert.equal(pickNowPlaying([a, b], { username: 'nobody' }), null);
  const music = session({ Id: 'x', Name: 'Song', Type: 'Audio', ImageTags: { Primary: 'x' } });
  assert.equal(pickNowPlaying([music], {}), null, 'neither a movie nor an episode');
  const noArt = session({ ...movieItem, ImageTags: {} });
  assert.equal(pickNowPlaying([noArt], {}), null, 'a movie without a poster image is not drawn');
  const ep = session(episodeItem);
  assert.equal(pickNowPlaying([ep], { includeEpisodes: false }), null);
  assert.equal(pickNowPlaying([ep], { includeEpisodes: true }).ratingKey, 'sr1');
  assert.equal(pickNowPlaying([session({ ...episodeItem, SeriesId: '' })], {}), null, 'an episode with no series id has no series poster');
  assert.equal(pickNowPlaying([], {}), null);
  assert.equal(pickNowPlaying(undefined, {}), null);
});

// ---- the token and the image ----

test('the poster image URL carries the token as api_key and the size; no poster object holds the token', async () => {
  const { source } = connect();
  const url = new URL(source.imageUrl('abc', { width: 400.4, height: 600 }));
  assert.equal(url.pathname, '/Items/abc/Images/Primary');
  assert.equal(url.searchParams.get('api_key'), TOKEN);
  assert.equal(url.searchParams.get('maxWidth'), '400');
  assert.equal(url.searchParams.get('maxHeight'), '600');
  const res = await fetch(url);
  assert.equal(res.status, 404, 'the mock has no image for this id, but the token was accepted (not 401)');
  const [movies] = await source.libraries();
  for (const poster of await source.pool({ libraryKey: movies.key, unwatchedOnly: false })) assert.ok(!JSON.stringify(poster).includes(TOKEN));
});

test('a server under a path keeps its path in every request and in the image URL', async () => {
  const seen = [];
  const source = createSource({ serverType: 'jellyfin', serverUrl: 'http://h.test/jf', plexToken: 't' }, { clientId: 'c', fetchImpl: async (url) => (seen.push(url), new Response('{"Items":[]}')) });
  await source.libraries();
  assert.equal(seen[0], 'http://h.test/jf/UserViews');
  assert.ok(source.imageUrl('i', { width: 1, height: 1 }).startsWith('http://h.test/jf/Items/i/Images/Primary'));
});

test('errors: 401 and 403 are auth, other statuses http, a dead server network, junk parse', async () => {
  const kinds = async (response) => {
    const source = createSource({ serverType: 'jellyfin', serverUrl: 'http://h.test', plexToken: 't' }, { clientId: 'c', fetchImpl: async () => response() });
    return source.libraries().then(() => 'ok', (err) => err.kind);
  };
  assert.equal(await kinds(() => new Response('', { status: 401 })), 'auth');
  assert.equal(await kinds(() => new Response('', { status: 403 })), 'auth');
  assert.equal(await kinds(() => new Response('', { status: 500 })), 'http');
  assert.equal(await kinds(() => new Response('not json')), 'parse');
  assert.equal(await kinds(() => Promise.reject(new TypeError('failed'))), 'network');
});

// ---- signing in ----

test('Quick Connect: a six-digit code, pending until approved, then the access token; the user id comes with a password sign-in', async () => {
  const flow = signInFlow({ serverType: 'jellyfin', serverUrl: base });
  assert.equal(flow.label, 'Jellyfin');
  assert.equal(await flow.quickConnectEnabled('device-1'), true);
  const pin = await flow.createPin('device-1');
  assert.match(pin.code, /^\d{6}$/);
  assert.equal(pin.expiresIn, 600);
  assert.equal(await flow.checkPin('device-1', pin.id), null, 'not approved yet');
  await post('/__mock/quickconnect-approve');
  assert.equal(await flow.checkPin('device-1', pin.id), TOKEN);
  const signed = await flow.signInWithPassword('device-1', USERNAME, PASSWORD);
  assert.deepEqual(signed, { token: TOKEN, userId: '80000000000000000000000000000001' });
});

test('an expired or unknown Quick Connect code throws an error marked expired; a wrong password is an auth error', async () => {
  const flow = jellyfinSignIn({ serverUrl: base });
  await assert.rejects(flow.checkPin('d', 'no-such-secret'), (err) => err.expired === true && err.kind === 'http' && err.status === 404);
  await assert.rejects(flow.signInWithPassword('d', USERNAME, 'wrong'), (err) => err.kind === 'auth');
  await assert.rejects(flow.signInWithPassword('d', 'nobody', PASSWORD), (err) => err.kind === 'auth');
  const noToken = jellyfinSignIn({ serverUrl: 'http://h.test', fetchImpl: async () => new Response('{}') });
  await assert.rejects(noToken.signInWithPassword('d', 'u', 'p'), { kind: 'parse' });
  await assert.rejects(noToken.createPin('d'), { kind: 'parse' });
});

test('a code the server answers 5xx for is not marked expired (the poll just tries again)', async () => {
  const flow = jellyfinSignIn({ serverUrl: 'http://h.test', fetchImpl: async () => new Response('', { status: 500 }) });
  await assert.rejects(flow.checkPin('d', 's'), (err) => err.expired !== true && err.kind === 'http');
});

test('Quick Connect: only an answer of false (or anything but true) is "off"; a server that does not answer throws, so the address is reported, not the password form (D143 1)', async () => {
  for (const fetchImpl of [async () => new Response('false'), async () => new Response('"true"'), async () => new Response('null')]) {
    assert.equal(await jellyfinSignIn({ serverUrl: 'http://h.test', fetchImpl }).quickConnectEnabled('d'), false);
  }
  assert.equal(await jellyfinSignIn({ serverUrl: 'http://h.test', fetchImpl: async () => new Response('true') }).quickConnectEnabled('d'), true);
  const throws = async (fetchImpl) => jellyfinSignIn({ serverUrl: 'http://h.test', fetchImpl }).quickConnectEnabled('d').then(() => 'answered', (err) => err.kind);
  assert.equal(await throws(async () => Promise.reject(new TypeError('x'))), 'network');
  assert.equal(await throws(async () => Promise.reject(Object.assign(new Error('t'), { name: 'TimeoutError' }))), 'timeout');
  assert.equal(await throws(async () => new Response('<html>')), 'parse');
  assert.equal(await throws(async () => new Response('', { status: 500 })), 'http');
});

test('the sign-in requests carry the device identity but no token, and the password goes only in the POST body', async () => {
  const rec = recording();
  const flow = jellyfinSignIn({ serverUrl: base, fetchImpl: rec.fetchImpl, version: '2.4' });
  await flow.signInWithPassword('device-1', USERNAME, PASSWORD);
  const { url, init } = rec.calls[0];
  assert.equal(url.pathname, '/Users/AuthenticateByName');
  assert.equal(init.method, 'POST');
  assert.ok(init.headers.Authorization.includes('DeviceId="device-1"') && init.headers.Authorization.includes('Version="2.4"'));
  assert.ok(!init.headers.Authorization.includes('Token='));
  assert.ok(!url.href.includes(PASSWORD));
  assert.deepEqual(JSON.parse(init.body), { Username: USERNAME, Pw: PASSWORD });
});

test('discoverServers names the one server at the address, and firstReachable accepts it only with a good token', async () => {
  const flow = jellyfinSignIn({ serverUrl: base });
  const [server1] = await flow.discoverServers('d', TOKEN);
  assert.deepEqual([server1.name, server1.accessToken, server1.connections[0].uri], ['Mock Jellyfin', TOKEN, base]);
  assert.equal(await flow.firstReachable(server1.connections, TOKEN, 'd'), base);
  assert.equal(await flow.firstReachable(server1.connections, 'wrong', 'd'), null);
  assert.equal(await flow.firstReachable([{ uri: 'http://127.0.0.1:1' }], TOKEN, 'd'), null);
  assert.equal((await jellyfinSignIn({ serverUrl: 'http://127.0.0.1:1' }).discoverServers('d', 't'))[0].name, 'Jellyfin');
});

test('the Jellyfin words name Jellyfin and Quick Connect, not plex.tv', () => {
  const { words } = signInFlow({ serverType: 'jellyfin', serverUrl: 'http://x' });
  for (const text of [words.asking, words.ranOut, words.unreachable, words.couldNotGet('boom'), words.httpsBlocked]) {
    assert.ok(!/plex/i.test(text), text);
  }
  assert.match(words.asking, /Quick Connect/);
  assert.match(words.couldNotGet('boom'), /boom/);
});

// ---- the shared code poll (js/settings-ui.js pinSignIn) with a Jellyfin flow ----

import { pinSignIn } from '../js/settings-ui.js';

test('pinSignIn with a Jellyfin flow: a code the server forgets ends the round at once (a fresh code is asked for); a pending code is polled until approved', async () => {
  let polls = 0;
  const forgets = async (url) => {
    const { pathname } = new URL(url);
    if (pathname === '/QuickConnect/Initiate') return new Response(JSON.stringify({ Secret: 's', Code: '123456' }));
    if (++polls >= 4) ctl.abort(); // a round that does not end on the 404 is stopped here, so it fails the count below instead of polling to the end of the code's life
    return new Response('{}', { status: 404 });
  };
  const ctl = new AbortController();
  const codes = [];
  const token = await pinSignIn('d', { settings: { serverType: 'jellyfin', serverUrl: 'http://h.test' }, fetchImpl: forgets, pollMs: 1, minLifeMs: 1, signal: ctl.signal, onCode: (c) => codes.push(c) });
  assert.equal(token, null);
  assert.deepEqual(codes, ['123456']);
  assert.equal(polls, 1, 'one poll, then the round ended: the code was not polled to the end of its life');

  let pending = 0;
  const approves = async (url) => {
    const { pathname } = new URL(url);
    if (pathname === '/QuickConnect/Initiate') return new Response(JSON.stringify({ Secret: 's', Code: '654321' }));
    if (pathname === '/QuickConnect/Connect') return new Response(JSON.stringify({ Authenticated: ++pending >= 3 }));
    return new Response(JSON.stringify({ AccessToken: 'tok', User: { Id: 'u' } }));
  };
  assert.equal(await pinSignIn('d', { settings: { serverType: 'jellyfin', serverUrl: 'http://h.test' }, fetchImpl: approves, pollMs: 1 }), 'tok');
  assert.equal(pending, 3);
});

test('an episode carries no year of its own (the series\' year is not on the item), and a pinned movie with no poster image is gone', async () => {
  assert.equal(toPoster({ ...episodeItem, ProductionYear: 2010 }, 'now-playing').year, '');
  assert.equal(toPoster({ ...movieItem, ProductionYear: 2010 }, 'random').year, '2010');
  const source = stubbed({ '/Items': { Items: [{ Id: '1', Name: 'No art', Type: 'Movie', ImageTags: {} }] } });
  await assert.rejects(source.item('1'), (err) => err.kind === 'http' && err.status === 404);
});

// ---- the engine is the gate, whatever the server returns (D5, D141 1) ----

test('a Jellyfin poster above the limit, unrated, unknown or with a CustomRating above it is never drawn, though the server returned it despite the filter', async () => {
  const art = { Primary: 't' };
  const item = (Id, extra) => ({ Id, Name: `T${Id}`, Type: 'Movie', ImageTags: art, ...extra });
  const above = [
    item('1', { OfficialRating: 'R' }),
    item('2', { OfficialRating: 'TV-MA' }),
    item('3', {}), // unrated
    item('4', { OfficialRating: '15' }), // not a US value
    item('5', { OfficialRating: 'PG', CustomRating: 'R' }), // the household's own tightening
    item('6', { OfficialRating: 'pg' }), // a spelling that is not exact
  ];
  const run = async (items) => {
    // The stub ignores every filter, as a server that does not honour OfficialRatings would.
    const source = createSource({ serverType: 'jellyfin', serverUrl: 'http://jf.test', plexToken: 't' }, { clientId: 'c', fetchImpl: async () => new Response(JSON.stringify({ Items: items })) });
    const settings = { ...defaults(), serverType: 'jellyfin', serverUrl: 'http://jf.test', plexToken: 't', libraryKey: 'L', libraryKeys: ['L'], maxContentRating: 'PG', showNowPlaying: false, unwatchedOnly: false };
    const engine = createEngine({ client: source, getSettings: () => settings, storage: memoryStorage() });
    const shown = [];
    for (let i = 0; i < 12; i++) {
      try {
        shown.push((await engine.decide({ force: true })).poster.ratingKey);
      } catch (err) {
        assert.equal(err.kind, 'empty');
        shown.push('empty');
      }
    }
    return new Set(shown);
  };
  assert.deepEqual([...(await run(above))], ['empty'], 'nothing above the limit is ever drawn');
  const mixed = await run([...above, item('7', { OfficialRating: 'PG' }), item('8', { OfficialRating: 'R', CustomRating: 'G' })]);
  assert.deepEqual([...mixed].filter((k) => k !== 'empty').sort(), ['7', '8'], 'only the PG title and the one a CustomRating relaxes to G come up');
});

test('now playing above the limit, unrated or unknown, or with a CustomRating above it, counts as nothing playing: the engine is the gate (D5, D75, D141 1)', async () => {
  const art = { Primary: 't' };
  const playing = (extra) => ({ Id: 'p1', Name: 'Playing', Type: 'Movie', ImageTags: art, ...extra });
  const safe = { Id: 's1', Name: 'Safe', Type: 'Movie', ImageTags: art, OfficialRating: 'PG' };
  const decideWith = async (item, extraSettings = {}) => {
    const fetchImpl = async (url) => {
      const { pathname, searchParams } = new URL(url);
      if (pathname === '/Sessions') return new Response(JSON.stringify([{ UserName: 'u', DeviceName: 'd', PlayState: {}, NowPlayingItem: item }]));
      if (searchParams.get('Ids')) return new Response(JSON.stringify({ Items: [item] })); // the playing item, read again
      return new Response(JSON.stringify({ Items: [safe] })); // the pool
    };
    const source = createSource({ serverType: 'jellyfin', serverUrl: 'http://jf.test', plexToken: 't' }, { clientId: 'c', fetchImpl });
    const settings = { ...defaults(), serverType: 'jellyfin', serverUrl: 'http://jf.test', plexToken: 't', libraryKey: 'L', libraryKeys: ['L'], maxContentRating: 'PG', limitNowPlaying: true, showNowPlaying: true, unwatchedOnly: false, ...extraSettings };
    return (await createEngine({ client: source, getSettings: () => settings, storage: memoryStorage() }).decide({ force: true })).poster;
  };
  for (const [what, extra] of [['R', { OfficialRating: 'R' }], ['unrated', {}], ['15', { OfficialRating: '15' }], ['a CustomRating of R over PG', { OfficialRating: 'PG', CustomRating: 'R' }]]) {
    assert.equal((await decideWith(playing(extra))).source, 'random', `${what} playing is not shown`);
  }
  const ok = await decideWith(playing({ OfficialRating: 'R', CustomRating: 'PG' }));
  assert.equal(ok.source, 'now-playing', 'a CustomRating that relaxes to PG is shown');
  assert.equal((await decideWith(playing({ OfficialRating: 'R' }), { limitNowPlaying: false })).source, 'now-playing', 'with the now-playing limit off it is shown (as for Plex)');
});

test('a playing item the re-read does not return is unrated (hidden under any limit), never judged on the session\'s own rating (D141 1, D5)', async () => {
  const withReply = (reply, item) => stubbed({ '/Sessions': [session(item)], '/Items': reply });
  for (const item of [{ ...movieItem, OfficialRating: 'PG' }, { ...movieItem, OfficialRating: 'G', CustomRating: 'G' }, episodeItem]) {
    const source = withReply({ Items: [] }, item);
    const np = source.nowPlaying(await source.sessions(), {});
    assert.equal(np.contentRating, '', `${item.Type} ${item.OfficialRating}: unrated`);
    assert.equal(allows('NC-17', np.contentRating), false);
    assert.equal(allows('PG', np.contentRating), false);
  }
  const read = withReply({ Items: [{ ...movieItem, OfficialRating: 'PG', CustomRating: 'R' }] }, movieItem);
  assert.equal(read.nowPlaying(await read.sessions(), {}).contentRating, 'R', 'an item that is returned is rated on what the re-read says');
});

test('watched is one rule in a collection and a playlist: UserData.Played, else PlayCount above 0 (D143 5)', async () => {
  const art = { Primary: 't' };
  const item = (Id, UserData) => ({ Id, Name: Id, Type: 'Movie', ImageTags: art, ...(UserData ? { UserData } : {}) });
  const reply = { Items: [item('playedFlag', { Played: true, PlayCount: 0 }), item('countOnly', { PlayCount: 2 }), item('flagFalseCount', { Played: false, PlayCount: 3 }), item('fresh', { Played: false, PlayCount: 0 }), item('none')] };
  for (const kind of ['collection', 'playlist']) {
    const source = stubbed({ '/Items': reply, '/Playlists/k/Items': reply });
    const got = (await source.sourceItems({ kind, key: 'k' }, { unwatchedOnly: true })).map((p) => p.ratingKey).sort();
    assert.deepEqual(got, ['flagFalseCount', 'fresh', 'none'], `${kind}: the flag wins over a count; a count counts when there is no flag`);
    assert.equal((await source.sourceItems({ kind, key: 'k' }, { unwatchedOnly: false })).length, 5);
  }
});

// ---- the token-free identity (D157 3, D160 1) ----

test('publicIdentity reads the public System/Info/Public and sends no token, and the id is the server Id', async () => {
  const { source, calls } = connect();
  assert.deepEqual(await source.publicIdentity(), { name: 'Mock Jellyfin', version: '10.10.0', machineIdentifier: '90000000000000000000000000000001' });
  assert.equal(calls.length, 1, 'one request: the libraries are not asked for');
  assert.equal(calls[0].url.pathname, '/System/Info/Public');
  const header = calls[0].init.headers.Authorization;
  assert.match(header, /^MediaBrowser Client="Now Showing"/);
  assert.equal(header.includes('Token='), false, 'the Authorization header carries no token');
  assert.equal(JSON.stringify(calls[0]).includes(TOKEN), false);
  assert.equal(calls[0].url.search, '');
});

test('publicIdentity answers for a wrong token too, since it proves nothing about the token, and refuses a reply that is not server information', async () => {
  const { source } = connect({ plexToken: 'wrong' });
  assert.equal((await source.publicIdentity()).machineIdentifier, '90000000000000000000000000000001');
  const bad = createSource({ serverType: 'jellyfin', serverUrl: 'http://j.test', plexToken: 't' }, { fetchImpl: async () => new Response('[]', { status: 200 }) });
  await assert.rejects(() => bad.publicIdentity(), (err) => err.kind === 'parse');
});
