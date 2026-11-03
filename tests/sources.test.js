import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSource, signInFlow, SourceError, SOURCE_MEMBERS, KINDS } from '../js/sources/index.js';
import { createEngine } from '../js/engine.js';
import { createPosterCache } from '../js/poster-cache.js';
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
  for (const serverType of ['Plex', 'nonsense', 'emby']) {
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
  const expected = ['identity', 'libraries', 'libraryCount', 'sessions', 'pool', 'sourceItems', 'genres', 'collections', 'playlists', 'item', 'items', 'imageUrl', 'nowPlaying', 'label'];
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
