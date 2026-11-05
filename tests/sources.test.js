import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSource, createSources, needsSources, readServerId, signInFlow, SourceError, SOURCE_MEMBERS, KINDS } from '../js/sources/index.js';
import { startMockPlex, TOKEN as PLEX_TOKEN } from '../scripts/mock-plex.mjs';
import { startMockJellyfin, TOKEN as JF_TOKEN, EMBY_TOKEN, EMBY_SERVER_ID, SERVER_ID as JF_SERVER_ID, USER_ID } from '../scripts/mock-jellyfin.mjs';
import { createEngine } from '../js/engine.js';
import { createPosterCache } from '../js/poster-cache.js';
import { allows } from '../js/ratings.js';
import { defaults, load, sanitize, STORAGE_KEY } from '../js/settings.js';
import { createShownStore, DAY_MS } from '../js/weighting.js';

globalThis.location ??= { origin: 'http://localhost' };

const connection = { serverUrl: 'http://s:32400', plexToken: 'tok' };
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const memoryStorage = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  const writes = [];
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => (writes.push(k), m.set(k, String(v))), removeItem: (k) => m.delete(k), writes };
};

// ---- createSource ----

test('createSource returns the Plex adapter when serverType is absent or plex', () => {
  for (const settings of [{ ...connection }, { ...connection, serverType: 'plex' }, { ...connection, serverType: undefined }]) {
    const source = createSource(settings);
    assert.equal(source.label, 'Plex');
  }
});

test('createSource refuses an unknown serverType with an error of kind config', () => {
  for (const serverType of ['Plex', 'nonsense', 'Emby', 'EMBY']) {
    assert.throws(
      () => createSource({ ...connection, serverType }),
      (err) => err instanceof SourceError && err.kind === 'config' && err.name === 'SourceError',
      serverType,
    );
  }
  assert.throws(() => signInFlow({ serverType: 'nonsense' }), { kind: 'config' });
});

test('the adapter object has exactly the members the interface lists', () => {
  const source = createSource({ ...connection });
  const expected = ['identity', 'publicIdentity', 'libraries', 'libraryCount', 'sessions', 'pool', 'sourceItems', 'genres', 'collections', 'playlists', 'item', 'items', 'imageUrl', 'nowPlaying', 'label'];
  assert.deepEqual(Object.keys(source).sort(), [...expected].sort());
  assert.deepEqual([...SOURCE_MEMBERS].sort(), [...expected].sort());
  for (const name of expected) assert.equal(typeof source[name], name === 'label' ? 'string' : 'function', name);
});

test('createSource builds the adapter from the connection settings and sends them as before', async () => {
  const calls = [];
  const fetchImpl = async (url) => (calls.push(new URL(url)), jsonResponse({ MediaContainer: { friendlyName: 'Den', version: '1.2-x', machineIdentifier: 'm' } }));
  const source = createSource({ ...connection }, { clientId: 'cid', fetchImpl });
  assert.deepEqual(await source.identity(), { name: 'Den', version: '1.2-x', machineIdentifier: 'm' });
  assert.equal(calls[0].origin, 'http://s:32400');
  assert.equal(calls[0].searchParams.get('X-Plex-Token'), 'tok');
  assert.equal(calls[0].searchParams.get('X-Plex-Client-Identifier'), 'cid');
});

test('nowPlaying picks the session by username and includeEpisodes, as the engine used to', () => {
  const source = createSource({ ...connection });
  const sessions = [
    { type: 'movie', ratingKey: '1', title: 'Mine', thumb: '/t/1', User: { title: 'Nate' }, Player: { state: 'playing' } },
    { type: 'episode', ratingKey: '2', grandparentRatingKey: '20', grandparentTitle: 'Show', grandparentThumb: '/t/20', title: 'Ep', User: { title: 'Sam' }, Player: { state: 'playing' } },
  ];
  assert.equal(source.nowPlaying(sessions, { username: 'sam', includeEpisodes: true }).ratingKey, '20');
  assert.equal(source.nowPlaying(sessions, { username: 'sam', includeEpisodes: false }), null);
  assert.equal(source.nowPlaying(sessions, { username: 'nate' }).ratingKey, '1');
  assert.equal(source.nowPlaying([], {}), null);
});

test('the sign-in flow names the server and carries the plex.tv words', () => {
  for (const flow of [signInFlow({}), signInFlow({ serverType: 'plex' }), signInFlow(undefined)]) {
    assert.equal(flow.label, 'Plex');
    for (const fn of ['createPin', 'checkPin', 'discoverServers', 'firstReachable']) assert.equal(typeof flow[fn], 'function', fn);
    assert.equal(flow.words.asking, 'Asking plex.tv for a code…');
    assert.equal(flow.words.ranOut, 'That code ran out. Asking plex.tv for a new one in 5 minutes…');
    assert.equal(flow.words.unreachable, "Can't reach plex.tv. Trying again soon…");
    assert.equal(flow.words.couldNotGet('x'), 'Could not get a sign-in code from plex.tv: x');
    assert.match(flow.words.httpsBlocked, /^This page is https, so the browser will block an http:\/\/ server\. Use the plex\.direct https address/);
  }
});

// ---- the error kinds ----

test('an error from the adapter keeps the kind strings network, timeout, auth, http and parse', async () => {
  const cases = {
    network: async () => { throw new TypeError('Failed to fetch'); },
    timeout: async () => { throw Object.assign(new Error('slow'), { name: 'TimeoutError' }); },
    auth: async () => new Response('', { status: 401 }),
    http: async () => new Response('', { status: 500 }),
    parse: async () => new Response('{not json', { status: 200 }),
  };
  for (const [kind, fetchImpl] of Object.entries(cases)) {
    const source = createSource({ ...connection }, { fetchImpl });
    await assert.rejects(source.libraries(), (err) => err instanceof SourceError && err.kind === kind, kind);
  }
  assert.deepEqual(KINDS, ['network', 'timeout', 'auth', 'http', 'parse', 'config']);
  const gone = createSource({ ...connection }, { fetchImpl: async () => jsonResponse({ MediaContainer: { Metadata: [] } }) });
  await assert.rejects(gone.item('9'), (err) => err.kind === 'http' && err.status === 404);
  assert.equal(new SourceError('x').kind, 'network', 'the default kind is unchanged');
});

// ---- what 2.3.1 stored ----

test('a 2.3.1 settings object loads with serverType plex and is otherwise unchanged', () => {
  const stored = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', libraryKeys: ['1'], libraryNames: [''], staticRatingKey: '42', rotateSeconds: 120 };
  delete stored.serverType; // 2.3.1 had no such key
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(stored) });
  const { settings, source } = load(storage);
  assert.equal(source, 'storage');
  assert.equal(settings.serverType, 'plex');
  const { serverType, ...rest } = settings;
  const { serverType: _absent, ...was } = { ...stored, serverType: undefined };
  assert.deepEqual(rest, was, 'every other key is what 2.3.1 stored');
  assert.equal(rest.staticRatingKey, '42');
  assert.equal(rest.rotateSeconds, 120);
  assert.equal(Object.keys(settings).length, Object.keys(stored).length + 1);
  // A type this build has no adapter for is kept, never turned into Plex (D139 1); a blank or non-text one is the default.
  assert.equal(sanitize({ serverType: 'nonsense' }).serverType, 'nonsense');
  for (const bad of ['', '  ', 7, null, true]) assert.equal(sanitize({ serverType: bad }).serverType, 'plex', String(bad));
});

test('a 2.3.1 poster index is read as Plex entries with no rewrite', async () => {
  const index = [
    { ratingKey: '123', title: 'Velvet Curtain', year: '1972', thumb: '/library/metadata/123/thumb/1', contentRating: 'PG', width: 600, height: 900, savedAt: 5 },
    { ratingKey: '9', title: 'Encore', year: '', thumb: '/t/9', contentRating: '', width: 600, height: 900, savedAt: 4 },
  ];
  const raw = JSON.stringify(index);
  const storage = memoryStorage({ 'plexPoster.posterIndex': raw });
  const blobs = new Map([[new URL('/__posters__/123', 'http://localhost').toString(), 'bytes']]);
  const caches = { open: async () => ({ match: async (url) => (blobs.has(url) ? new Response(blobs.get(url)) : undefined), put: async () => {}, delete: async () => true }), delete: async () => true };
  const cache = createPosterCache({ storage, caches });
  assert.deepEqual(cache.entries(), index);
  const hit = await cache.lookup({ ratingKey: '123', thumb: '/library/metadata/123/thumb/1' }, { width: 600 });
  assert.equal(await hit.text(), 'bytes');
  const random = await cache.random('', 'PG');
  assert.equal(random.poster.ratingKey, '123');
  assert.equal(random.poster.source, 'cache');
  assert.deepEqual(storage.writes, [], 'reading wrote nothing');
  assert.equal(storage.getItem('plexPoster.posterIndex'), raw);
});

test('a 2.3.1 pinned key and no-repeat history are read as Plex ids with no rewrite', async () => {
  const now = 10 * DAY_MS;
  const storage = memoryStorage({ 'plexPoster.shownAt': JSON.stringify({ 77: now - 1000 }) });
  const seen = createShownStore({ storage }).windowed(3, now);
  assert.deepEqual([...seen.keys()], ['77']);
  assert.deepEqual(storage.writes, [], 'reading wrote nothing');

  const asked = [];
  const source = {
    ...createSource({ ...connection }),
    item: async (key) => (asked.push(key), { ratingKey: String(key), title: 'Pinned', thumb: '/t/42', source: 'static', contentRating: '' }),
    sessions: async () => [],
  };
  const settings = { ...defaults(), ...connection, libraryKey: '1', staticRatingKey: '42', showNowPlaying: false };
  const engine = createEngine({ client: source, getSettings: () => settings, storage: memoryStorage() });
  const decision = await engine.decide();
  assert.deepEqual(asked, ['42'], 'the bare key goes to the server as it is');
  assert.equal(decision.poster.ratingKey, '42');
});

// ---- the child-safety path does not move (D5) ----

test('the engine still checks every poster from the adapter against the household limit', async () => {
  const source = {
    ...createSource({ ...connection }),
    sessions: async () => [],
    pool: async () => [{ ratingKey: '1', title: 'Adult', thumb: '/t/1', source: 'random', contentRating: 'R' }],
  };
  const settings = { ...defaults(), ...connection, libraryKey: '1', libraryKeys: ['1'], maxContentRating: 'PG', showNowPlaying: false };
  const engine = createEngine({ client: source, getSettings: () => settings, storage: memoryStorage() });
  await assert.rejects(engine.decide({ force: true }), { kind: 'empty' });
});

// ---- nothing outside js/sources/ imports an adapter ----

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
};
/** The files under js/ (subfolders too, js/sources/ aside) that import any module of js/sources/ other than its index (every file there is found by listing the folder). */
export function adapterImporters(root, files = walk(root)) {
  const sourcesDir = new URL('sources/', root).href;
  const adapters = readdirSync(new URL('sources/', root)).filter((f) => f.endsWith('.js') && f !== 'index.js').map((f) => f.slice(0, -3));
  const re = new RegExp(`(?:from|import)\\s*\\(?\\s*(['"])[^'"]*sources/(?:${adapters.join('|')})(?:\\.js)?\\1|(?:from|import)\\s*\\(?\\s*(['"])\\./(?:${adapters.join('|')})(?:\\.js)?\\2`);
  return files.filter((f) => !f.href.startsWith(sourcesDir)).filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => f.pathname);
}

test('no module outside js/sources imports an adapter module directly (any adapter, either quote, any folder)', () => {
  assert.deepEqual(adapterImporters(new URL('../js/', import.meta.url)), []);
});

test('the import guard catches an adapter import in either quote style, a bare import, a dynamic import and a subfolder', () => {
  const probe = (rel, text) => {
    const dir = mkdtempSync(join(tmpdir(), 'src-guard-'));
    mkdirSync(join(dir, 'sources'), { recursive: true });
    mkdirSync(join(dir, 'sub'), { recursive: true });
    for (const f of ['index', 'plex', 'errors', 'other']) writeFileSync(join(dir, 'sources', f + '.js'), '');
    writeFileSync(join(dir, rel), text);
    const r = adapterImporters(pathToFileURL(dir + '/'));
    rmSync(dir, { recursive: true });
    return r.length;
  };
  assert.equal(probe('a.js', "import { x } from './sources/plex.js';"), 1);
  assert.equal(probe('a.js', 'import { x } from "./sources/plex.js";'), 1);
  assert.equal(probe('a.js', "import { x } from './sources/other.js';"), 1, 'any adapter, not only plex');
  assert.equal(probe('a.js', "import { SourceError } from './sources/errors.js';"), 1);
  assert.equal(probe('sub/b.js', "import { x } from '../sources/plex.js';"), 1);
  assert.equal(probe('a.js', "import './sources/plex.js';"), 1);
  assert.equal(probe('a.js', "const m = await import('./sources/plex.js');"), 1);
  assert.equal(probe('a.js', "import { createSource } from './sources/index.js';"), 0, 'the index is the one way in');
});

// ---- no adapter imports another adapter: the shared HTTP helpers are in http.js, SourceError in errors.js ----

const ADAPTERS = ['plex', 'jellyfin', 'emby'];
// The one exception: the Emby adapter builds on the shared MediaBrowser code that lives in the Jellyfin adapter (R-SRC-3, D145).
const ALLOWED_ADAPTER_IMPORTS = new Set(['emby.js>jellyfin']);
/** The "adapter>adapter" pairs in a folder of adapters: a file there importing another adapter's module (either quote, dynamic import too). */
export function adapterCrossImports(dir) {
  const found = [];
  for (const f of readdirSync(dir).filter((n) => ADAPTERS.includes(n.slice(0, -3)) && n.endsWith('.js'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const other of ADAPTERS.filter((a) => a + '.js' !== f)) {
      if (new RegExp(`(?:from|import)\\s*\\(?\\s*(['"])\\./${other}(?:\\.js)?\\1`).test(src)) found.push(`${f}>${other}`);
    }
  }
  return found.filter((p) => !ALLOWED_ADAPTER_IMPORTS.has(p));
}

test('no adapter imports another adapter (the generic helpers are in http.js)', () => {
  assert.deepEqual(adapterCrossImports(new URL('../js/sources/', import.meta.url)), []);
});

test('the adapter cross-import guard catches a Jellyfin or Plex adapter importing another adapter, in either quote style', () => {
  const probe = (file, text) => {
    const dir = mkdtempSync(join(tmpdir(), 'src-cross-'));
    for (const f of ADAPTERS) writeFileSync(join(dir, f + '.js'), f === file ? text : '');
    const r = adapterCrossImports(pathToFileURL(dir + '/'));
    rmSync(dir, { recursive: true });
    return r;
  };
  assert.deepEqual(probe('jellyfin', "import { buildUrl } from './plex.js';"), ['jellyfin.js>plex']);
  assert.deepEqual(probe('emby', 'import { buildUrl } from "./plex.js";'), ['emby.js>plex']);
  assert.deepEqual(probe('plex', "const m = await import('./emby.js');"), ['plex.js>emby']);
  assert.deepEqual(probe('emby', "import { request } from './jellyfin.js';"), [], 'the one allowed pair');
  assert.deepEqual(probe('jellyfin', "import { buildUrl } from './http.js';"), []);
});

// ---- the sources folder has no import cycle: errors.js is imported by the index and the adapters, and imports nothing ----

test('js/sources/errors.js imports nothing and no adapter imports the index', async () => {
  const dir = new URL('../js/sources/', import.meta.url);
  const text = (f) => readFileSync(new URL(f, dir), 'utf8');
  assert.doesNotMatch(text('errors.js'), /^\s*import\s/m);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js') && n !== 'index.js')) {
    assert.doesNotMatch(text(f), /from\s+['"]\.\/index\.js['"]/, `${f} must not import the index`);
  }
  assert.match(text('plex.js'), /from '\.\/errors\.js'/);
  const errors = await import('../js/sources/errors.js');
  assert.equal(errors.SourceError, SourceError, 'the index re-exports the one class');
  assert.equal(errors.KINDS, KINDS);
});

// ---- the Jellyfin adapter is the second ----

test('createSource returns the Jellyfin adapter for serverType jellyfin, with the members of the interface', () => {
  const source = createSource({ ...connection, serverType: 'jellyfin' });
  assert.equal(source.label, 'Jellyfin');
  assert.deepEqual(Object.keys(source).sort(), [...SOURCE_MEMBERS].sort());
  for (const name of SOURCE_MEMBERS) assert.equal(typeof source[name], name === 'label' ? 'string' : 'function', name);
});

test('signInFlow for jellyfin is bound to the address and has the members of the Plex flow beside its own', () => {
  const plex = signInFlow({ serverType: 'plex' });
  const flow = signInFlow({ serverType: 'jellyfin', serverUrl: 'http://jf:8096' });
  assert.equal(flow.label, 'Jellyfin');
  assert.equal(flow.serverUrl, 'http://jf:8096');
  assert.equal(flow.needsAddress, true);
  assert.equal(plex.needsAddress, undefined, 'the Plex flow does not change');
  for (const member of Object.keys(plex)) assert.ok(member in flow, member);
  for (const member of ['quickConnectEnabled', 'signInWithPassword']) assert.equal(typeof flow[member], 'function');
  assert.deepEqual(Object.keys(plex.words).sort(), Object.keys(flow.words).sort());
});

test('the Jellyfin adapter keeps its token out of the poster and sends nothing to plex.tv', async () => {
  const seen = [];
  const source = createSource({ serverType: 'jellyfin', serverUrl: 'http://jf.test', plexToken: 'sekrit' }, {
    clientId: 'c',
    fetchImpl: async (url) => (seen.push(String(url)), jsonResponse({ Items: [{ Id: '1', Name: 'T', Type: 'Movie', ImageTags: { Primary: 'x' } }] })),
  });
  const posters = await source.pool({ libraryKey: 'L' });
  assert.equal(JSON.stringify(posters).includes('sekrit'), false);
  assert.ok(seen.every((u) => u.startsWith('http://jf.test/')));
});

// ---- several servers (R-SRC-4, D156, D157): one source over a Plex, a Jellyfin and an Emby server, against the mocks ----

const multi = {};

async function startServers() {
  multi.plex = await startMockPlex({ port: 0 });
  multi.jf = await startMockJellyfin({ port: 0 });
  multi.plexUrl = `http://127.0.0.1:${multi.plex.address().port}`;
  multi.jfUrl = `http://127.0.0.1:${multi.jf.address().port}`;
}
const stopServers = () => Promise.all([multi.plex, multi.jf].map((s) => new Promise((r) => s.close(r))));
const mockPlex = (path) => fetch(`${multi.plexUrl}/__mock/${path}`, { method: 'POST' }).then((r) => r.json());
const mockJf = (path) => fetch(`${multi.jfUrl}${path}`, { method: 'POST' }).then((r) => r.json());

const PLEX_ID = 'mock';
const hex = (prefix, n) => prefix + String(n).padStart(31, '0');
const JF_MOVIES = hex('b', 1);
const JF_KIDS = hex('b', 2);

/** Plex (carried, as 2.4.0 had it), Jellyfin and Emby from the one mock (each with its own id) in one list. */
const household = (extra = {}) => ({
  ...defaults(),
  serverType: 'plex',
  serverUrl: multi.plexUrl,
  plexToken: PLEX_TOKEN,
  serverId: PLEX_ID,
  servers: [
    { id: JF_SERVER_ID, type: 'jellyfin', url: multi.jfUrl, token: JF_TOKEN, userId: '', name: 'Den Jellyfin' },
    { id: EMBY_SERVER_ID, type: 'emby', url: multi.jfUrl, token: EMBY_TOKEN, userId: USER_ID, name: 'Den Emby' },
  ],
  ...extra,
});
/** Is `token` in `text` as a whole token? (The mocks' tokens contain each other: `demo-token` is inside `jf-demo-token`.) */
const hasToken = (text, token) => new RegExp(`(?<![\\w-])${token}(?![\\w-])`).test(text);
/** A fetch that passes everything to the mocks and records the origin, the path and every place a token could be. */
const spy = () => {
  const calls = [];
  const fetchImpl = (url, init = {}) => {
    const u = new URL(url);
    calls.push({ origin: u.origin, path: u.pathname, url: u.toString(), headers: JSON.stringify(init.headers || {}) });
    return fetch(url, init);
  };
  return { calls, fetchImpl };
};

test('needsSources: a 2.4.0 household is the plain adapter; two servers, or a first server told apart by its id, are one source over them', () => {
  assert.equal(needsSources(sanitize({ serverUrl: 'http://p:32400', plexToken: 't', libraryKey: '1' })), false);
  assert.equal(needsSources(sanitize({ serverUrl: 'http://p:32400', plexToken: 't', servers: [{ id: 'jf', type: 'jellyfin', url: 'http://j', token: 'x' }] })), true);
  assert.equal(needsSources(sanitize({ serverUrl: 'http://p:32400', plexToken: 't', serverId: 'p1', serverCarried: false })), true);
});

test('the source over several servers has every member of the interface', async () => {
  await startServers();
  try {
    const source = createSources(household());
    for (const name of SOURCE_MEMBERS) assert.equal(typeof source[name], name === 'label' ? 'string' : 'function', name);
    assert.equal(source.multi, true);
  } finally {
    await stopServers();
  }
});

test('each server\'s token goes only to that server (D142 2, D144 1, D157 4)', async () => {
  await startServers();
  try {
    const { calls, fetchImpl } = spy();
    const source = createSources(household(), { clientId: 'cid', version: '1', fetchImpl });
    const libs = await source.libraries();
    await source.sessions();
    for (const lib of libs) {
      await source.libraryCount(lib.key);
      await source.genres(lib.key).catch(() => {});
      await source.collections(lib.key).catch(() => {});
    }
    await source.playlists();
    const jfMovies = libs.find((l) => l.serverType === 'jellyfin' && l.title === 'Movies');
    const posters = await source.pool({ libraryKey: jfMovies.key, size: 3 });
    const plexPosters = await source.pool({ libraryKey: libs.find((l) => l.serverType === 'plex' && l.title === 'Movies').key, size: 3 });
    await source.item(posters[0].ratingKey);
    await source.items([plexPosters[0].ratingKey, posters[0].ratingKey]);
    const images = [source.imageUrl(posters[0].thumb, { width: 100, height: 150 }), source.imageUrl(plexPosters[0].thumb, { width: 100, height: 150 })];
    await Promise.all(images.map((u) => fetch(u)));
    assert.ok(calls.length > 12);
    // The Jellyfin and Emby mocks share one origin: the two tokens there are each other's, never Plex's.
    const jfOrigin = new URL(multi.jfUrl).origin;
    const plexOrigin = new URL(multi.plexUrl).origin;
    for (const c of calls) {
      if (c.origin === plexOrigin) assert.ok(![JF_TOKEN, EMBY_TOKEN].some((t) => hasToken(c.url, t) || hasToken(c.headers, t)), `a Jellyfin or Emby token reached Plex: ${c.path}`);
      if (c.origin === jfOrigin) assert.ok(!hasToken(c.url, PLEX_TOKEN) && !hasToken(c.headers, PLEX_TOKEN), `the Plex token reached the Jellyfin address: ${c.path}`);
    }
    for (const u of images) {
      assert.equal(hasToken(u, PLEX_TOKEN), u.startsWith(plexOrigin), 'the image address carries the token of the server it is at, and no other');
      assert.ok(u.startsWith(plexOrigin) || u.startsWith(jfOrigin));
    }
    // Two servers of one type never share a token: the Jellyfin mock refuses the Emby token on its Jellyfin routes.
    const twoJf = createSources(household({ servers: [{ id: JF_SERVER_ID, type: 'jellyfin', url: multi.jfUrl, token: JF_TOKEN, userId: '', name: 'A' }, { id: 'jf-b', type: 'jellyfin', url: multi.jfUrl, token: 'wrong-token', userId: '', name: 'B' }] }), { fetchImpl });
    const listed = await twoJf.libraries();
    assert.deepEqual([...new Set(listed.map((l) => l.server))], ['Plex', 'A'], 'B, with its own (wrong) token, is refused and A\'s token is not lent to it');
    assert.equal(listed.failed.length, 1);
  } finally {
    await stopServers();
  }
});

test('ids leave the source scoped by their server, except the carried entry\'s, and come back routed by their scope (D156 2, D157 1)', async () => {
  await startServers();
  try {
    const source = createSources(household());
    const libs = await source.libraries();
    const plexLib = libs.find((l) => l.serverType === 'plex' && l.title === 'Kids Movies');
    const jfLib = libs.find((l) => l.serverType === 'jellyfin' && l.title === 'Kids Movies');
    const embyLib = libs.find((l) => l.serverType === 'emby' && l.title === 'Kids Movies');
    assert.equal(plexLib.key, '3', 'the carried entry\'s library key stays as 2.4.0 had it');
    assert.equal(jfLib.key, `@${JF_SERVER_ID}/${JF_KIDS}`);
    assert.equal(embyLib.key, `@${EMBY_SERVER_ID}/${JF_KIDS}`, 'the same library id on the Emby and the Jellyfin mock is two libraries');
    const [fromPlex] = await source.pool({ libraryKey: plexLib.key, size: 2 });
    const [fromJf] = await source.pool({ libraryKey: jfLib.key, size: 2 });
    assert.match(fromPlex.ratingKey, /^\d+$/);
    assert.ok(fromPlex.thumb.startsWith('/library/'), 'a bare thumb');
    assert.ok(fromJf.ratingKey.startsWith(`@${JF_SERVER_ID}/`) && fromJf.thumb.startsWith(`@${JF_SERVER_ID}/`));
    // A bare id goes to the carried entry; a scoped one to its server; an id of a server that is not in the list to none.
    assert.equal((await source.item(fromPlex.ratingKey)).ratingKey, fromPlex.ratingKey, 'the id as asked, so a pin keeps comparing equal');
    assert.equal((await source.item(fromJf.ratingKey)).title, fromJf.title);
    assert.equal((await source.item('13')).title, 'Mini Monster Mash', 'bare 13 is Plex\'s title 13');
    await assert.rejects(() => source.item('@gone-server/13'), (err) => err.kind === 'http' && err.status === 404);
    await assert.rejects(() => source.item(`@${JF_SERVER_ID}/${hex('a', 99)}`), (err) => err.kind === 'http', 'an id the server no longer holds');
    assert.deepEqual(await source.libraryCount('@gone-server/1'), null);
    // After the carried entry is gone, a bare id is nobody's.
    const promoted = createSources(household({ serverType: 'jellyfin', serverUrl: multi.jfUrl, plexToken: JF_TOKEN, serverId: JF_SERVER_ID, serverCarried: false, servers: [] }));
    await assert.rejects(() => promoted.item('13'), (err) => err.kind === 'http' && err.status === 404);
    assert.equal(promoted.label, 'Jellyfin');
  } finally {
    await stopServers();
  }
});

test('a server that does not know its own id is not used, unless it is the carried entry', async () => {
  await startServers();
  try {
    const source = createSources(household({ servers: [{ id: JF_SERVER_ID, type: 'jellyfin', url: multi.jfUrl, token: JF_TOKEN, userId: '', name: 'J' }] }));
    assert.equal(createSources({ ...household(), serverCarried: false, serverId: '' }).multi, true);
    assert.deepEqual([...new Set((await createSources({ ...household(), serverId: '', servers: [] }).libraries()).map((l) => l.serverType))], ['plex'], 'the carried entry needs no id');
    await assert.rejects(() => createSources({ ...household(), serverCarried: false, serverId: '', servers: [] }).libraries(), (err) => err.kind === 'config');
    assert.ok((await source.libraries()).some((l) => l.serverType === 'jellyfin'));
  } finally {
    await stopServers();
  }
});

test('a pool over two servers samples each chosen library in proportion to its title count (D157 10)', async () => {
  await startServers();
  try {
    const source = createSources(household());
    const asked = [];
    const counted = { ...source, pool: async (r) => (asked.push([r.libraryKey, r.size]), source.pool(r)) };
    const engine = createEngine({
      client: counted,
      getSettings: () => ({ ...household({ libraryKey: '3', libraryKeys: ['3', `@${JF_SERVER_ID}/${JF_MOVIES}`], randomPoolSize: 13, unwatchedOnly: false, showNowPlaying: false }) }),
    });
    await engine.decide({ force: true });
    // Plex Kids has 5 titles, the Jellyfin Movies library 8: 13 posters split 5 and 8.
    assert.deepEqual(asked.sort(), [['3', 5], [`@${JF_SERVER_ID}/${JF_MOVIES}`, 8]].sort());
  } finally {
    await stopServers();
  }
});

test('a server that fails leaves the pool to the others, and an empty pool of one is not an empty selection (D157 5, D110 3)', async () => {
  await startServers();
  try {
    const settings = household({ libraryKey: '3', libraryKeys: ['3', `@${JF_SERVER_ID}/${JF_MOVIES}`], unwatchedOnly: false, showNowPlaying: false, servers: [household().servers[0]] });
    const engine = createEngine({ client: createSources(settings), getSettings: () => settings, random: Math.random });
    await mockPlex('down');
    const seen = new Set();
    for (let i = 0; i < 30; i++) {
      engine.invalidate();
      seen.add((await engine.decide({ force: true })).poster.title);
    }
    assert.ok([...seen].every((t) => ['The Grand Marquee', 'Midnight Projector', 'Velvet Curtain', 'Popcorn Skies', 'Neon Matinee', 'Last Reel', 'Silver Screen Serenade', 'Encore'].includes(t)), 'Plex is down: only Jellyfin titles');
    await mockPlex('up');
    const libs = await createSources(settings).libraries();
    assert.equal(libs.failed.length, 0);
    await mockPlex('down');
    const partial = await createSources(settings).libraries();
    assert.deepEqual(partial.failed.map((f) => f.server), ['Plex']);
    assert.ok(partial.length > 0, 'the answering server\'s libraries are still listed');
  } finally {
    await mockPlex('up').catch(() => {});
    await stopServers();
  }
});

test('every poster from every server passes allows() with the limit in force (D5): 80 draws over two servers, none above PG', async () => {
  await startServers();
  try {
    const settings = household({ libraryKey: '1', libraryKeys: ['1', `@${JF_SERVER_ID}/${JF_MOVIES}`], maxContentRating: 'PG', unwatchedOnly: false, showNowPlaying: false, servers: [household().servers[0]] });
    const engine = createEngine({ client: createSources(settings), getSettings: () => settings, random: Math.random });
    const titles = new Map();
    for (let i = 0; i < 80; i++) {
      const { poster } = await engine.decide({ force: true });
      assert.ok(allows('PG', poster.contentRating), `${poster.title} (${poster.contentRating || 'unrated'}) is above PG`);
      titles.set(poster.ratingKey.startsWith('@') ? 'jf' : 'plex', true);
    }
    assert.equal(titles.size, 2, 'both servers were drawn from');
  } finally {
    await stopServers();
  }
});

test('the session that counts is the user filter, then the first one playing, over all servers in list order (D157 8)', async () => {
  await startServers();
  try {
    const source = createSources(household());
    await mockPlex('play?ratingKey=9&user=sam&state=paused'); // Plex: paused, a Kids title
    await mockJf(`/__mock/jellyfin-sessions?kind=movie&id=${hex('a', 2)}&user=demo`); // Jellyfin and Emby: playing Midnight Projector
    let np = source.nowPlaying(await source.sessions(), { username: '', includeEpisodes: true });
    assert.equal(np.title, 'Midnight Projector', 'a playing session beats a paused one that is earlier in the list');
    assert.ok(np.ratingKey.startsWith(`@${JF_SERVER_ID}/`), 'the first server of those that play, in list order, is Jellyfin, not Emby');
    np = source.nowPlaying(await source.sessions(), { username: 'sam', includeEpisodes: true });
    assert.equal(np.title, 'Captain Crayon', 'the user filter picks the one session that is Sam\'s');
    assert.equal(np.ratingKey, '9');
    assert.equal(source.nowPlaying(await source.sessions(), { username: 'nobody' }), null);
    await mockPlex('stop');
    await mockJf('/__mock/jellyfin-sessions?kind=none');
    assert.equal(source.nowPlaying(await source.sessions(), {}), null);
  } finally {
    await stopServers();
  }
});

test('a pin names one server: its id is looked up there only, and the engine says the pin is gone when that server or id is (D122 1)', async () => {
  await startServers();
  try {
    const settings = household({ staticRatingKey: '@gone-server/1', staticTitle: 'Gone', showNowPlaying: false });
    const engine = createEngine({ client: createSources(settings), getSettings: () => settings });
    await assert.rejects(() => engine.decide(), (err) => err.pinGone === true && err.kind === 'http');
    const held = { ...settings, staticRatingKey: `@${JF_SERVER_ID}/${hex('a', 2)}` };
    const ok = await createEngine({ client: createSources(held), getSettings: () => held }).decide();
    assert.equal(ok.poster.title, 'Midnight Projector');
    const missing = { ...settings, staticRatingKey: `@${JF_SERVER_ID}/${hex('a', 77)}` };
    await assert.rejects(() => createEngine({ client: createSources(missing), getSettings: () => missing }).decide(), (err) => err.pinGone === true);
    // One server alone is the adapter itself: its error is not marked, so nothing changes for a one-server household.
    const solo = { ...defaults(), serverUrl: multi.plexUrl, plexToken: PLEX_TOKEN, staticRatingKey: '9999', libraryKey: '1' };
    await assert.rejects(() => createEngine({ client: createSource(solo), getSettings: () => solo }).decide(), (err) => err.pinGone === undefined);
  } finally {
    await stopServers();
  }
});

test('the offline cache re-check asks each server about its own posters, and a server that does not answer leaves its titles unrated (D37)', async () => {
  await startServers();
  try {
    const settings = household({ maxContentRating: 'PG', libraryKey: '3', libraryKeys: ['3', `@${JF_SERVER_ID}/${JF_MOVIES}`], unwatchedOnly: false, showNowPlaying: false, servers: [household().servers[0]] });
    const rated = [];
    const engine = createEngine({
      client: createSources(settings),
      getSettings: () => settings,
      cachedKeys: () => ['9', `@${JF_SERVER_ID}/${hex('a', 2)}`, '@gone-server/1'],
      onRatings: (list) => rated.push(...list),
      random: Math.random,
    });
    await engine.decide({ force: true });
    const byKey = Object.fromEntries(rated.map((p) => [p.ratingKey, p.contentRating]));
    assert.deepEqual(byKey, { 9: 'G', [`@${JF_SERVER_ID}/${hex('a', 2)}`]: 'PG', '@gone-server/1': '' });
  } finally {
    await stopServers();
  }
});

test('genres are matched by title on each server: a genre key of one server means nothing to another', async () => {
  await startServers();
  try {
    const settings = household({ servers: [household().servers[0]] });
    const source = createSources(settings);
    const libs = await source.libraries();
    const jf = libs.find((l) => l.serverType === 'jellyfin' && l.title === 'Movies');
    const plexGenres = await source.genres('1');
    const comedy = plexGenres.find((g) => g.title === 'Comedy');
    assert.match(comedy.key, /^\d+$/, 'Plex lists its genre by a numeric key');
    // The engine sends Plex's key; the Jellyfin side must look the title up in its own list.
    const posters = await source.pool({ libraryKey: jf.key, size: 20, genres: [comedy.key], genreTitles: ['Comedy'], unwatchedOnly: false });
    assert.ok(posters.length > 0 && posters.every((p) => p.genres.includes('Comedy')));
    assert.deepEqual(await source.pool({ libraryKey: jf.key, size: 20, genres: ['99'], genreTitles: ['No Such Genre'], unwatchedOnly: false }), [], 'a server that lists none of the genres contributes nothing');
  } finally {
    await stopServers();
  }
});

// ---- the first server removed, and a first server that is down (D162 1, UX I1) ----

test('a lone server that is not the carried one, or any scoped id in the settings, means the multi-server source, whatever the count (D162 1)', () => {
  const lone = sanitize({ serverType: 'jellyfin', serverUrl: 'http://j', plexToken: 't', serverId: 'jf-1', serverCarried: false, libraryKeys: ['@jf-1/b1'], libraryKey: '@jf-1/b1' });
  assert.equal(needsSources(lone), true);
  assert.equal(needsSources(sanitize({ serverUrl: 'http://p', plexToken: 't', libraryKeys: ['@x-1/5'], libraryKey: '@x-1/5' })), true, 'a carried first server that holds a scoped id');
  assert.equal(needsSources(sanitize({ serverUrl: 'http://p', plexToken: 't', staticRatingKey: '@x-1/5' })), true, 'a scoped pin');
  assert.equal(needsSources(sanitize({ serverUrl: 'http://p', plexToken: 't', libraryKeys: ['1'], libraryKey: '1', staticRatingKey: '42' })), false, 'bare ids: a 2.4.0 household');
});

test('a lone promoted server draws from its own scoped library and finds its scoped pin; a bare id is nobody\'s (D162 1)', async () => {
  await startServers();
  try {
    const settings = { ...defaults(), serverType: 'jellyfin', serverUrl: multi.jfUrl, plexToken: JF_TOKEN, serverId: JF_SERVER_ID, serverCarried: false, libraryKey: `@${JF_SERVER_ID}/${JF_MOVIES}`, libraryKeys: [`@${JF_SERVER_ID}/${JF_MOVIES}`], staticRatingKey: `@${JF_SERVER_ID}/${hex('a', 2)}`, unwatchedOnly: false, showNowPlaying: false };
    assert.equal(needsSources(settings), true);
    const engine = createEngine({ client: createSources(settings), getSettings: () => settings });
    assert.equal((await engine.decide()).poster.title, 'Midnight Projector', 'the pin is found on the server that stayed');
    const free = { ...settings, staticRatingKey: '' };
    const pick = await createEngine({ client: createSources(free), getSettings: () => free }).decide({ force: true });
    assert.ok(pick.poster.ratingKey.startsWith(`@${JF_SERVER_ID}/`), 'a poster is drawn from the library that stayed');
  } finally {
    await stopServers();
  }
});

test('identity is the first server that answers, in list order, so Settings still tests with the first server down; the failed servers say their place (UX I1)', async () => {
  await startServers();
  try {
    const source = createSources(household({ servers: [household().servers[0]] }));
    assert.equal((await source.identity()).slot, 0);
    await mockPlex('down');
    const id = await source.identity();
    assert.deepEqual([id.name, id.slot], ['Mock Jellyfin', 1], 'Plex is down: the Jellyfin server answers');
    const libs = await source.libraries();
    assert.deepEqual(libs.failed.map((f) => [f.server, f.slot]), [['Plex', 0]]);
    assert.ok(libs.length > 0);
    await mockPlex('up');
  } finally {
    await mockPlex('up').catch(() => {});
    await stopServers();
  }
});

test('readServerId is the one token-free id read: the id on success, null on any failure', async () => {
  await startServers();
  try {
    assert.equal(await readServerId('plex', multi.plexUrl), PLEX_ID);
    assert.equal(await readServerId('jellyfin', multi.jfUrl), JF_SERVER_ID);
    assert.equal(await readServerId('emby', multi.jfUrl), EMBY_SERVER_ID);
    assert.equal(await readServerId('plex', 'http://127.0.0.1:1'), null);
    assert.equal(await readServerId('nonsense', multi.jfUrl), null);
    const { calls, fetchImpl } = spy();
    await readServerId('plex', multi.plexUrl, { clientId: 'c', fetchImpl });
    assert.ok(calls.every((c) => !hasToken(c.url, PLEX_TOKEN) && !hasToken(c.headers, PLEX_TOKEN)));
  } finally {
    await stopServers();
  }
});

test('a scoped id in any profile also means the multi-server source (D162 1)', () => {
  const base = { serverUrl: 'http://p', plexToken: 't', libraryKeys: ['1'], libraryKey: '1' };
  assert.equal(needsSources(sanitize({ ...base, profiles: [{ id: 'p1', name: 'Kids', libraryKeys: ['1'] }] })), false);
  assert.equal(needsSources(sanitize({ ...base, profiles: [{ id: 'p1', name: 'Kids', libraryKeys: ['1', '@jf-1/b2'] }] })), true);
  assert.equal(needsSources(sanitize({ ...base, profiles: [{ id: 'p1', name: 'Kids', source: { kind: 'collection', key: '@jf-1/d1', title: 'Box' } }] })), true);
});

test('when every server fails the error names every server, and a single server says its own error', async () => {
  const dead = async () => Promise.reject(new TypeError('failed'));
  const two = createSources({ ...defaults(), serverUrl: 'http://127.0.0.1:1', plexToken: 't', serverId: 'p1', servers: [{ id: 'jf-1', type: 'jellyfin', url: 'http://127.0.0.1:2', token: 'x', userId: '', name: 'Den Jellyfin' }] }, { fetchImpl: dead });
  await assert.rejects(() => two.libraries(), (err) => err.kind === 'network' && /Could not reach Plex/.test(err.message) && /Could not reach Den Jellyfin/.test(err.message) && !/Plex: |Jellyfin: /.test(err.message));
  const one = createSources({ ...defaults(), serverType: 'jellyfin', serverUrl: 'http://127.0.0.1:2', plexToken: 't', serverId: 'jf-1', serverCarried: false }, { fetchImpl: dead });
  await assert.rejects(() => one.libraries(), (err) => err.kind === 'network' && !/Jellyfin: /.test(err.message));
});

test('identity with every server down names every server; one server says its own error', async () => {
  const dead = async () => Promise.reject(new TypeError('failed'));
  const two = createSources({ ...defaults(), serverUrl: 'http://127.0.0.1:1', plexToken: 't', serverId: 'p1', servers: [{ id: 'jf-1', type: 'jellyfin', url: 'http://127.0.0.1:2', token: 'x', userId: '', name: 'Den Jellyfin' }] }, { fetchImpl: dead });
  await assert.rejects(() => two.identity(), (err) => err.kind === 'network' && /Could not reach Plex/.test(err.message) && /Could not reach Den Jellyfin/.test(err.message) && !/Plex: |Jellyfin: /.test(err.message));
});
