// The Emby adapter (js/sources/emby.js) against the mock server in its Emby mode (scripts/mock-jellyfin.mjs), plus stubbed replies for
// what the mock does not hold. Every Emby path and shape here is a (verify) row in docs/validation/real-server-extended.md except the
// sign-in scheme (DEV-EMBY-AUTH, DEV-EMBY-KEY); no real server is used. R-SRC-3, D145.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startMockJellyfin, EMBY_TOKEN, TOKEN, USERNAME, PASSWORD, USER_ID, EMBY_SERVER_ID } from '../scripts/mock-jellyfin.mjs';
import { createSource, serverTypeOf, signInFlow } from '../js/sources/index.js';
import { embyAuthHeader } from '../js/sources/emby.js';
import { createEngine } from '../js/engine.js';
import { allows } from '../js/ratings.js';
import { defaults, load, save, STORAGE_KEY, toExport } from '../js/settings.js';

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
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), keys: () => [...m.keys()], all: () => Object.fromEntries(m) };
};
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
  const source = createSource({ serverType: 'emby', serverUrl: base, plexToken: EMBY_TOKEN, serverUserId: USER_ID, ...extra }, { clientId: 'device-1', version: '9.9.9', fetchImpl: rec.fetchImpl });
  return { source, ...rec };
};
const post = (path) => fetch(`${base}${path}`, { method: 'POST' });
const names = (posters) => posters.map((p) => p.title);
const stub = (table) => async (url) => {
  const u = new URL(url);
  const hit = table[u.pathname];
  if (hit === undefined) return new Response('{}', { status: 404 });
  if (hit instanceof Response) return hit;
  return new Response(JSON.stringify(typeof hit === 'function' ? hit(u) : hit), { status: 200 });
};
const stubbed = (table) => createSource({ serverType: 'emby', serverUrl: 'http://emby.test', plexToken: 't', serverUserId: 'u1' }, { clientId: 'c', version: '1', fetchImpl: stub(table) });

// ---- the headers ----

test('every request carries X-Emby-Authorization (Client, Device, DeviceId, Version, empty UserId) and the token as X-Emby-Token, and no MediaBrowser header', async () => {
  const { source, calls } = connect();
  await source.identity();
  const [movies] = await source.libraries();
  await source.pool({ libraryKey: movies.key });
  await source.sessions();
  assert.ok(calls.length >= 4);
  for (const { init } of calls) {
    const h = init.headers;
    assert.match(h['X-Emby-Authorization'], /^Emby UserId="", Client="Now Showing", Device="Now Showing", DeviceId="device-1", Version="9\.9\.9"$/);
    assert.equal(h['X-Emby-Token'], EMBY_TOKEN);
    assert.equal(h.Authorization, undefined, 'the MediaBrowser scheme is Jellyfin\'s');
    assert.ok(!h['X-Emby-Authorization'].includes(EMBY_TOKEN), 'the token is not in the identity header');
  }
});

test('embyAuthHeader: a quote in a value cannot break out of it, and no token is ever in it', () => {
  const h = embyAuthHeader({ clientId: 'a"b', version: '1"2' });
  assert.equal(h, 'Emby UserId="", Client="Now Showing", Device="Now Showing", DeviceId="ab", Version="12"');
});

test('without a token the X-Emby-Token header is left off, and the mock refuses the request', async () => {
  const { source, calls } = connect({ plexToken: '' });
  await assert.rejects(() => source.identity(), (err) => err.kind === 'auth');
  assert.ok(calls.every(({ init }) => !('X-Emby-Token' in init.headers)));
});

// ---- the libraries path (C1): Emby has GET /Users/{UserId}/Views and no /UserViews ----

test('C1: the libraries and the connection test go to /Users/{UserId}/Views with the id the sign-in returned, and never to /UserViews', async () => {
  const { source, calls } = connect();
  await source.identity();
  const libs = await source.libraries();
  assert.deepEqual(libs.map((l) => l.title), ['Movies', 'Kids Movies', 'Music']);
  const paths = calls.map((c) => c.url.pathname);
  assert.ok(paths.includes(`/Users/${USER_ID}/Views`));
  assert.ok(!paths.includes('/UserViews'), 'Emby does not have /UserViews');
});

test('C1: the sign-in returns the user id that the views route needs, and the whole flow works with it end to end', async () => {
  const flow = signInFlow({ serverType: 'emby', serverUrl: base });
  const { token, userId } = await flow.signInWithPassword('device-1', USERNAME, PASSWORD);
  assert.equal(userId, USER_ID);
  const source = createSource({ serverType: 'emby', serverUrl: base, plexToken: token, serverUserId: userId }, { clientId: 'device-1' });
  assert.equal((await source.libraries()).length, 3);
});

test('C1: with no user id the client asks for a new sign-in (auth) and makes no views request; a wrong id is an http 404', async () => {
  const { source, calls } = connect({ serverUserId: '' });
  await assert.rejects(() => source.libraries(), (err) => err.kind === 'auth' && /Emby/.test(err.message));
  await assert.rejects(() => source.identity(), (err) => err.kind === 'auth');
  assert.ok(calls.every((c) => !/Views$/.test(c.url.pathname)), 'no views request without an id');
  const wrong = connect({ serverUserId: 'ffffffffffffffffffffffffffffffff' });
  await assert.rejects(() => wrong.source.libraries(), (err) => err.kind === 'http' && err.status === 404);
});

test('C1: a user id with characters that need escaping cannot change the path', async () => {
  const { source, calls } = connect({ serverUserId: 'a/../b?x=1' });
  await assert.rejects(() => source.libraries());
  assert.equal(calls[0].url.pathname, '/Users/a%2F..%2Fb%3Fx%3D1/Views');
});

test('C1: firstReachable on the flow uses the id, so a signed-in address is found', async () => {
  const flow = signInFlow({ serverType: 'emby', serverUrl: base, serverUserId: USER_ID });
  assert.equal(await flow.firstReachable([{ uri: base }], EMBY_TOKEN, 'c'), base);
  const noId = signInFlow({ serverType: 'emby', serverUrl: base });
  assert.equal(await noId.firstReachable([{ uri: base }], EMBY_TOKEN, 'c'), null, 'no id: the views call cannot be made');
});

// ---- the label ----

test('the Emby adapter is labelled Emby and says Emby in its errors', async () => {
  const { source } = connect({ plexToken: 'wrong' });
  assert.equal(source.label, 'Emby');
  await assert.rejects(() => source.identity(), (err) => err.kind === 'auth' && /Emby/.test(err.message) && !/Jellyfin/.test(err.message));
  const down = createSource({ serverType: 'emby', serverUrl: 'http://h.test', plexToken: 't', serverUserId: 'u1' }, { clientId: 'c', fetchImpl: async () => Promise.reject(new TypeError('failed')) });
  await assert.rejects(() => down.libraries(), (err) => err.kind === 'network' && /Emby/.test(err.message) && !/Jellyfin/.test(err.message));
});

// ---- libraries, pool, genres, collections, playlists ----

test('identity reads the Emby server name; libraries map movies to movie', async () => {
  const { source } = connect();
  const id = await source.identity();
  assert.equal(id.name, 'Mock Emby');
  const libs = await source.libraries();
  assert.deepEqual(libs.filter((l) => l.type === 'movie').map((l) => l.title), ['Movies', 'Kids Movies']);
});

test('the random pool: Movie items with a poster, the allowed ratings asked for under a limit, genre ids passed on', async () => {
  const { source, calls } = connect();
  const [movies] = await source.libraries();
  const all = await source.pool({ libraryKey: movies.key, unwatchedOnly: false, size: 100 });
  assert.equal(all.length, 8);
  assert.ok(all.every((p) => p.source === 'random'));
  await source.pool({ libraryKey: movies.key, unwatchedOnly: true, maxContentRating: 'PG', size: 10 });
  const q = calls.at(-1).url.searchParams;
  assert.equal(q.get('Filters'), 'IsUnplayed');
  assert.equal(q.get('Limit'), '30');
  assert.ok(q.get('OfficialRatings').split('|').includes('G'));
  assert.ok(!q.get('OfficialRatings').split('|').includes('R'));
  const genres = await source.genres(movies.key);
  const drama = genres.find((g) => g.title === 'Drama');
  const picked = await source.pool({ libraryKey: movies.key, unwatchedOnly: false, genres: [drama.key] });
  assert.ok(picked.length > 0 && picked.every((p) => p.genres.includes('Drama')));
});

test('a BoxSet narrows to its movies and lists every id it held; a playlist is read through /Playlists/{id}/Items', async () => {
  const { source, calls } = connect();
  const [box] = await source.collections();
  assert.equal(box.title, 'Midnight Double Feature');
  const fromBox = await source.sourceItems({ kind: 'collection', key: box.key }, { unwatchedOnly: false });
  assert.deepEqual(names(fromBox).sort(), ['Midnight Projector', 'Neon Matinee']);
  assert.equal(fromBox.listed.length, 2);
  const [list] = await source.playlists();
  const fromList = await source.sourceItems({ kind: 'playlist', key: list.key }, { unwatchedOnly: false });
  assert.deepEqual(names(fromList).sort(), ['Last Reel', 'The Grand Marquee', 'Tiny Lanterns']);
  assert.ok(calls.some((c) => c.url.pathname === `/Playlists/${list.key}/Items`));
});

test('item() and items() return posters as static', async () => {
  const { source } = connect();
  const [movies] = await source.libraries();
  const [first] = await source.pool({ libraryKey: movies.key, unwatchedOnly: false });
  assert.equal((await source.item(first.ratingKey)).source, 'static');
  assert.equal((await source.items([first.ratingKey])).length, 1);
});

// ---- the poster mapping and the rating map are Jellyfin's (D134 3, D145) ----

test('an Emby movie maps to the same poster as a Jellyfin one, and the rating is exact (CustomRating first; 15, NR, pg, null are unknown)', async () => {
  const art = { Primary: 't' };
  const item = (extra) => ({ Id: 'x', Name: 'T', Type: 'Movie', ImageTags: art, ...extra });
  const rated = async (extra) => (await stubbed({ '/Items': { Items: [item(extra)] } }).pool({ libraryKey: 'L' }))[0].contentRating;
  assert.equal(await rated({ OfficialRating: 'PG' }), 'PG');
  assert.equal(await rated({ OfficialRating: 'PG', CustomRating: 'R' }), 'R', 'a CustomRating that tightens');
  assert.equal(await rated({ OfficialRating: 'R', CustomRating: 'PG' }), 'PG', 'a CustomRating that relaxes');
  for (const bad of ['15', 'NR', 'pg', 'PG13', 'US-PG', 'TV-*', null, '']) assert.equal(await rated({ OfficialRating: bad }), '', String(bad));
  assert.equal(allows('PG-13', ''), false);
});

test('an Emby poster above the limit, unrated or unknown is never drawn, though the server returned it despite its filter (D5)', async () => {
  const art = { Primary: 't' };
  const item = (Id, extra) => ({ Id, Name: `T${Id}`, Type: 'Movie', ImageTags: art, ...extra });
  const above = [item('1', { OfficialRating: 'R' }), item('2', {}), item('3', { OfficialRating: '15' }), item('4', { OfficialRating: 'PG', CustomRating: 'R' }), item('5', { OfficialRating: null })];
  const run = async (items) => {
    const source = createSource({ serverType: 'emby', serverUrl: 'http://emby.test', plexToken: 't' }, { clientId: 'c', fetchImpl: async () => new Response(JSON.stringify({ Items: items })) });
    const settings = { ...defaults(), serverType: 'emby', serverUrl: 'http://emby.test', plexToken: 't', libraryKey: 'L', libraryKeys: ['L'], maxContentRating: 'PG', showNowPlaying: false, unwatchedOnly: false };
    const engine = createEngine({ client: source, getSettings: () => settings, storage: memoryStorage() });
    const shown = new Set();
    for (let i = 0; i < 12; i++) {
      try {
        shown.add((await engine.decide({ force: true })).poster.ratingKey);
      } catch (err) {
        assert.equal(err.kind, 'empty');
        shown.add('empty');
      }
    }
    return shown;
  };
  assert.deepEqual([...(await run(above))], ['empty']);
  assert.deepEqual([...(await run([...above, item('7', { OfficialRating: 'PG' })]))].filter((k) => k !== 'empty'), ['7']);
});

test('a reply the adapter does not recognise is a parse error, and so is one with no Items array (D145 3, D147 1)', async () => {
  const garbage = createSource({ serverType: 'emby', serverUrl: 'http://e.test', plexToken: 't', serverUserId: 'u1' }, { clientId: 'c', fetchImpl: async () => new Response('<html>nope') });
  await assert.rejects(() => garbage.libraries(), (err) => err.kind === 'parse' && /Emby/.test(err.message));
  const views = '/Users/u1/Views';
  for (const reply of [{ Elsewhere: [] }, {}, { Items: 'x' }, { Items: null }, { Items: [null] }, { Items: [7] }, [], null]) {
    const emby = stubbed({ [views]: reply, '/Items': reply, '/Genres': reply, '/Playlists/p/Items': reply });
    const why = JSON.stringify(reply);
    await assert.rejects(() => emby.libraries(), (err) => err.kind === 'parse' && /Emby/.test(err.message), `libraries ${why}`);
    await assert.rejects(() => emby.pool({ libraryKey: 'l' }), (err) => err.kind === 'parse', `pool ${why}`);
    await assert.rejects(() => emby.genres('l'), (err) => err.kind === 'parse', `genres ${why}`);
    await assert.rejects(() => emby.collections(), (err) => err.kind === 'parse', `collections ${why}`);
    await assert.rejects(() => emby.playlists(), (err) => err.kind === 'parse', `playlists ${why}`);
    await assert.rejects(() => emby.sourceItems({ kind: 'playlist', key: 'p' }), (err) => err.kind === 'parse', `playlist items ${why}`);
  }
  assert.deepEqual(await stubbed({ [views]: { Items: [] } }).libraries(), [], 'an empty list is a list');
});

test('Emby: a CustomRating or OfficialRating that is present but not a string is unknown, hidden under any limit, never a fallback (D147 1)', async () => {
  const movie = (id, extra) => ({ Id: id, Name: `M${id}`, Type: 'Movie', ImageTags: { Primary: 't' }, ...extra });
  const items = [
    movie('1', { OfficialRating: 'G', CustomRating: ['R'] }),
    movie('2', { OfficialRating: 'G', CustomRating: 7 }),
    movie('3', { OfficialRating: ['G'], CustomRating: 'G' }),
    movie('4', { OfficialRating: { v: 'G' } }),
    movie('5', { OfficialRating: 'G' }),
    movie('6', { OfficialRating: 'G', CustomRating: null }),
  ];
  const posters = await stubbed({ '/Items': { Items: items } }).pool({ libraryKey: 'l', unwatchedOnly: false, size: 100 });
  const rating = Object.fromEntries(posters.map((p) => [p.ratingKey, p.contentRating]));
  assert.deepEqual(rating, { 1: '', 2: '', 3: '', 4: '', 5: 'G', 6: 'G' });
  for (const limit of ['G', 'PG', 'PG-13', 'R']) {
    const shown = posters.filter((p) => allows(limit, p.contentRating)).map((p) => p.ratingKey);
    assert.deepEqual(shown, ['5', '6'], `under ${limit} only the two well-formed G titles show`);
  }
});

test('Emby: sessions that are not a list mean nothing is playing, not an error (D145 4)', async () => {
  for (const reply of [{}, 'x', { Items: [] }]) assert.deepEqual(await stubbed({ '/Sessions': reply }).sessions(), [], JSON.stringify(reply));
});

// ---- the image ----

test('the poster image URL carries the Emby token as api_key and the size, the mock serves it, and no poster holds the token', async () => {
  const { source } = connect();
  const [movies] = await source.libraries();
  const posters = await source.pool({ libraryKey: movies.key, unwatchedOnly: false });
  for (const poster of posters) assert.ok(!JSON.stringify(poster).includes(EMBY_TOKEN));
  const url = new URL(source.imageUrl(posters[0].thumb, { width: 400.4, height: 600 }));
  assert.equal(url.pathname, `/Items/${posters[0].thumb}/Images/Primary`);
  assert.equal(url.searchParams.get('api_key'), EMBY_TOKEN);
  assert.equal(url.searchParams.get('maxWidth'), '400');
  assert.equal((await fetch(url)).status, 200);
});

// ---- now playing ----

test('now playing a movie, from the mock in Emby mode', async () => {
  const { source } = connect();
  await post('/__mock/jellyfin-sessions?kind=movie&user=demo');
  const np = source.nowPlaying(await source.sessions(), {});
  assert.equal(np.source, 'now-playing');
  assert.equal(np.title, 'The Grand Marquee');
  assert.equal(np.contentRating, 'G');
  assert.equal(np.user, 'demo');
  await post('/__mock/jellyfin-sessions?kind=none');
  assert.equal(source.nowPlaying(await source.sessions(), {}), null);
});

test('now playing an episode shows its series with the episode\'s own rating unless the series rating is read (D73, D75)', async () => {
  const { source } = connect();
  await post('/__mock/jellyfin-sessions?kind=episode');
  const np = source.nowPlaying(await source.sessions(), {});
  assert.equal(np.title, 'Harbor Lights');
  assert.equal(np.episodeRating, true);
  assert.equal(allows('PG-13', np.contentRating), false);
  await post('/__mock/jellyfin-sessions?kind=none');
});

test('a /Sessions reply of 401, 403, 404, 500 or one that does not parse is no now-playing, never an error (D145 4)', async () => {
  const { source } = connect();
  await post('/__mock/jellyfin-sessions?kind=movie');
  for (const mode of ['401', '403', '404', '500', 'garbage']) {
    await post(`/__mock/emby-sessions-reply?mode=${mode}`);
    const sessions = await source.sessions();
    assert.deepEqual(sessions, [], mode);
    assert.equal(source.nowPlaying(sessions, {}), null, mode);
  }
  await post('/__mock/emby-sessions-reply?mode=ok');
  assert.equal((await source.sessions()).length, 1);
  await post('/__mock/jellyfin-sessions?kind=none');
});

test('a /Sessions failure of 404 or junk does not stop the engine: the pool poster is drawn, no error', async () => {
  const art = { Primary: 't' };
  const pool = { Items: [{ Id: 'p1', Name: 'Pool', Type: 'Movie', ImageTags: art, OfficialRating: 'PG' }] };
  for (const sessions of [new Response('', { status: 404 }), new Response('<html>', { status: 200 }), new Response('', { status: 403 })]) {
    const source = createSource({ serverType: 'emby', serverUrl: 'http://e.test', plexToken: 't' }, {
      clientId: 'c',
      fetchImpl: async (url) => (new URL(url).pathname === '/Sessions' ? sessions.clone() : new Response(JSON.stringify(pool))),
    });
    const settings = { ...defaults(), serverType: 'emby', serverUrl: 'http://e.test', plexToken: 't', libraryKey: 'L', libraryKeys: ['L'], showNowPlaying: true, unwatchedOnly: false };
    const decision = await createEngine({ client: source, getSettings: () => settings, storage: memoryStorage() }).decide({ force: true });
    assert.equal(decision.poster.source, 'random');
  }
});

test('a /Sessions network error or timeout is still an error (the server is not answering), for the status pill', async () => {
  for (const failure of [new TypeError('failed'), Object.assign(new Error('t'), { name: 'TimeoutError' })]) {
    const source = createSource({ serverType: 'emby', serverUrl: 'http://e.test', plexToken: 't' }, { clientId: 'c', fetchImpl: async () => Promise.reject(failure) });
    await assert.rejects(() => source.sessions(), (err) => err.kind === 'network' || err.kind === 'timeout');
  }
});

test('only /Sessions is soft: the item re-read of a playing item still throws, so no session shows on an unchecked rating', async () => {
  const item = { Id: 'm1', Name: 'Film', Type: 'Movie', OfficialRating: 'PG', ImageTags: { Primary: 'x' } };
  const source = stubbed({ '/Sessions': [{ UserName: 'u', PlayState: {}, NowPlayingItem: item }], '/Items': new Response('', { status: 500 }) });
  await assert.rejects(() => source.sessions(), (err) => err.kind === 'http');
});

test('the Jellyfin adapter keeps its /Sessions failures as errors (the soft rule is Emby\'s alone)', async () => {
  for (const status of [401, 403, 404]) {
    const source = createSource({ serverType: 'jellyfin', serverUrl: 'http://jf.test', plexToken: 't' }, { clientId: 'c', fetchImpl: async () => new Response('', { status }) });
    await assert.rejects(() => source.sessions(), (err) => err.status === status, String(status));
  }
});

// ---- signing in ----

test('the Emby flow has the user name and password sign-in only: no code, no Quick Connect, and it asks the server nothing about it', async () => {
  const { calls, fetchImpl } = recording();
  const flow = signInFlow({ serverType: 'emby', serverUrl: base }, { fetchImpl, version: '1.2.3' });
  assert.equal(flow.label, 'Emby');
  assert.equal(flow.needsAddress, true);
  assert.equal(flow.serverUrl, base);
  assert.equal(flow.createPin, undefined);
  assert.equal(flow.checkPin, undefined);
  assert.equal(await flow.quickConnectEnabled('c'), false);
  assert.equal(calls.length, 0);
  for (const word of ['asking', 'ranOut', 'unreachable', 'httpsBlocked', 'passwordOnly']) assert.match(flow.words[word], /Emby/, word);
  assert.equal(typeof flow.words.couldNotGet('x'), 'string');
  for (const text of Object.values(flow.words).map((w) => (typeof w === 'function' ? w('x') : w))) assert.ok(!/Quick Connect|plex\.tv|Jellyfin/i.test(text), text);
});

test('sign-in: POST /Users/AuthenticateByName with Username and Pw, the Emby identity header and no token; it gives the token and the user id', async () => {
  const { calls, fetchImpl } = recording();
  const flow = signInFlow({ serverType: 'emby', serverUrl: base }, { fetchImpl, version: '1.2.3' });
  const result = await flow.signInWithPassword('device-9', USERNAME, PASSWORD);
  assert.equal(result.token, EMBY_TOKEN);
  assert.match(result.userId, /^[0-9a-f]{32}$/);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(init.method, 'POST');
  assert.equal(url.pathname, '/Users/AuthenticateByName');
  assert.deepEqual(JSON.parse(init.body), { Username: USERNAME, Pw: PASSWORD });
  assert.equal(init.headers['X-Emby-Authorization'], 'Emby UserId="", Client="Now Showing", Device="Now Showing", DeviceId="device-9", Version="1.2.3"');
  assert.equal('X-Emby-Token' in init.headers, false, 'no token before sign-in');
  assert.equal(url.search, '', 'the password is in the body, never the address');
});

test('a wrong password is an auth error that stores nothing; a reply with no AccessToken is a parse error', async () => {
  const flow = signInFlow({ serverType: 'emby', serverUrl: base });
  await assert.rejects(() => flow.signInWithPassword('c', USERNAME, 'nope'), (err) => err.kind === 'auth' && /Emby/.test(err.message));
  const empty = signInFlow({ serverType: 'emby', serverUrl: 'http://e.test' }, { fetchImpl: async () => new Response('{"User":{"Id":"u"}}') });
  await assert.rejects(() => empty.signInWithPassword('c', 'u', 'p'), (err) => err.kind === 'parse');
  await assert.rejects(() => signInFlow({ serverType: 'emby', serverUrl: 'http://e.test' }, { fetchImpl: async () => Promise.reject(new TypeError('x')) }).signInWithPassword('c', 'u', 'p'), (err) => err.kind === 'network');
});

test('discoverServers names the one server at the address; firstReachable accepts it only with a good token', async () => {
  const flow = signInFlow({ serverType: 'emby', serverUrl: base, serverUserId: USER_ID });
  const [sv] = await flow.discoverServers('c', EMBY_TOKEN);
  assert.equal(sv.name, 'Mock Emby');
  assert.equal(sv.accessToken, EMBY_TOKEN);
  assert.equal(await flow.firstReachable(sv.connections, EMBY_TOKEN, 'c'), base);
  assert.equal(await flow.firstReachable(sv.connections, TOKEN, 'c'), null, 'the Jellyfin token is not an Emby token');
  assert.equal(await flow.firstReachable(sv.connections, 'bad', 'c'), null);
});

test('after a sign-in and a Save no storage key holds the password; the token is the only secret and is in SECRET_KEYS (D145 2)', async () => {
  const storage = memoryStorage();
  const globalStore = memoryStorage();
  const keep = globalThis.localStorage;
  globalThis.localStorage = globalStore;
  try {
    const flow = signInFlow({ serverType: 'emby', serverUrl: base });
    const { token, userId } = await flow.signInWithPassword('device-1', USERNAME, PASSWORD);
    assert.deepEqual(globalStore.keys(), [], 'signing in stores nothing by itself');
    const saved = save(storage, { ...defaults(), serverType: 'emby', serverUrl: base, plexToken: token, serverName: 'Mock Emby' });
    assert.equal(saved.plexToken, EMBY_TOKEN);
    const everything = JSON.stringify(storage.all()) + JSON.stringify(globalStore.all()) + JSON.stringify(toExport(saved, { includeSecrets: true }));
    assert.ok(!everything.includes(PASSWORD), 'the password is nowhere');
    assert.ok(!JSON.stringify(toExport(saved)).includes(EMBY_TOKEN), 'an export without secrets has no token');
    assert.ok(!JSON.stringify(storage.all()).includes(userId) || userId === '', 'the user id is not stored by the settings either');
    assert.equal(load(storage).settings.serverType, 'emby');
    assert.ok(storage.keys().includes(STORAGE_KEY));
  } finally {
    globalThis.localStorage = keep;
  }
});

// ---- a switch to Emby ----

test('a Save that changes the type to Emby is a switch from Plex or Jellyfin, and a Save that keeps Emby is not (D134 2, D145 5)', () => {
  assert.notEqual(serverTypeOf({ serverType: 'plex' }), serverTypeOf({ serverType: 'emby' }));
  assert.notEqual(serverTypeOf({}), serverTypeOf({ serverType: 'emby' }), 'an absent type counts as Plex');
  assert.notEqual(serverTypeOf({ serverType: 'jellyfin' }), serverTypeOf({ serverType: 'emby' }));
  assert.equal(serverTypeOf({ serverType: 'emby' }), serverTypeOf({ serverType: 'emby', serverUrl: 'http://other' }));
});

// ---- the token-free identity, and the Emby server's own id (D157 3, D160 1, 2) ----

test('publicIdentity sends the Emby identity header and no X-Emby-Token, and reads the Emby server\'s own Id', async () => {
  const { source, calls } = connect();
  const id = await source.publicIdentity();
  assert.equal(id.name, 'Mock Emby');
  assert.equal(id.machineIdentifier, EMBY_SERVER_ID);
  assert.notEqual(id.machineIdentifier, '90000000000000000000000000000001', 'not the Jellyfin mock\'s id: both can be in one household');
  assert.equal(calls.length, 1);
  const h = calls[0].init.headers;
  assert.ok(h['X-Emby-Authorization']);
  assert.equal('X-Emby-Token' in h, false);
  assert.equal(JSON.stringify(calls[0]).includes(EMBY_TOKEN), false);
});
