// Poster art from TMDB (R-ART-1, D64, D203, D210 5-6, D217): the decision table, the choice among a title's posters, the cache-first fetch and its rules.
// Everything runs against a stub of fetch: no host is contacted, and no key here is a real one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createPosterCache, TMDB_MAX_AGE_MS } from '../js/poster-cache.js';
import { ART_MODES, artPlan, chooseLogo, choosePoster, createArtwork, defaultArtLanguage, entryTmdb, LANGUAGES, LOGO_MIN_LUMINANCE, logoLuminance, logoPlan, logosIn } from '../js/artwork.js';
import { defaults, sanitize } from '../js/settings.js';

globalThis.location ??= { origin: 'http://localhost' };

const V3 = '0123456789abcdef0123456789abcdef';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ0ZXN0In0.test-read-access-token';
const DAY = 86_400_000;

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function fakeCaches() {
  const store = new Map();
  const cache = {
    async put(url, res) {
      store.set(url, res);
    },
    async match(url) {
      const res = store.get(url);
      return res ? res.clone() : undefined;
    },
    async delete(url) {
      return store.delete(url);
    },
  };
  return { caches: { open: async () => cache, delete: async () => true }, store };
}

const img = (file, lang, vote, width = 1000) => ({ file_path: file, iso_639_1: lang, vote_average: vote, vote_count: 5, width, height: Math.round(width * 1.5) });
const POSTERS = [img('/en.jpg', 'en', 6), img('/null-low.jpg', null, 4), img('/fr.jpg', 'fr', 5), img('/null-high.jpg', null, 5.5)];

/** A stub of fetch: the images route answers `posters` (or fails as told), the image host answers a blob named after the path. `calls` lists every request. */
function stub({ posters = POSTERS, logos = [], images = 'ok', file = 'ok' } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push({ host: u.hostname, path: u.pathname, params: Object.fromEntries(u.searchParams), headers: init.headers ?? {}, url: String(url) });
    if (u.hostname === 'api.themoviedb.org') {
      if (images === 'throw') throw new TypeError('Failed to fetch');
      if (images === 'http') return new Response('{}', { status: 503 });
      if (images === 'junk') return new Response('<html>', { status: 200 });
      if (images === 'auth') return new Response('{}', { status: 401 });
      return new Response(JSON.stringify({ id: 603, posters, logos }), { status: 200 });
    }
    if (u.hostname === 'image.tmdb.org') {
      if (file === 'http') return new Response('', { status: 404 });
      if (file === 'throw') throw new TypeError('Failed to fetch');
      return new Response(new Blob([`IMAGE ${u.pathname}`], { type: 'image/jpeg' }));
    }
    throw new Error(`unexpected host ${u.hostname}`);
  };
  return { calls, fetchImpl, api: () => calls.filter((c) => c.host === 'api.themoviedb.org'), files: () => calls.filter((c) => c.host === 'image.tmdb.org') };
}

const SERVER_POSTER = { ratingKey: '41', title: 'The Matrix', year: 1999, thumb: '/library/metadata/41/thumb/1700', source: 'random', tmdbId: '603', tmdbType: 'movie' };
const TMDB_POSTER = { ratingKey: 'movie:603', title: 'The Matrix', year: 1999, thumb: '/en.jpg', source: 'random', tmdbId: '603', tmdbType: 'movie' };
const SIZE = { width: 500, height: 750 };
const read = (blob) => blob.text();

/** Timers the test fires itself: `set` records the delay it was asked for, `fire()` runs every timer still waiting. Nothing here waits for real time. */
function fakeTimers() {
  const waiting = new Map();
  let n = 0;
  return {
    asked: [],
    waiting,
    set(fn, ms) {
      this.asked.push(ms);
      waiting.set(++n, fn);
      return n;
    },
    clear(h) {
      waiting.delete(h);
    },
    fire() {
      for (const [h, fn] of [...waiting]) {
        waiting.delete(h);
        fn();
      }
    },
  };
}
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
};

function rig({ settings = {}, stubOpts = {}, limit = 100, start = 1_000_000, measure = async () => 0.9 } = {}) {
  const clock = { t: start };
  const timers = fakeTimers();
  const s = stub(stubOpts);
  const c = fakeCaches();
  const cache = createPosterCache({ storage: memoryStorage(), limit: () => limit, caches: c.caches, now: () => clock.t });
  const cfg = { posterArt: 'textless', posterArtLanguage: 'fr', tmdbKey: V3, ...settings };
  const art = createArtwork({ cache, getSettings: () => cfg, fetchImpl: s.fetchImpl, log: { warn() {} }, timers, now: () => clock.t, measure: (blob) => measure(blob) }); // a light logo, unless a test says otherwise (the browser measures a real one)
  return { clock, s, c, cache, art, cfg, timers };
}

// ---- the decision table: when TMDB is asked at all ----

test('artPlan: no key, no TMDB id, a now-playing poster or the default mode: no plan', () => {
  const on = { posterArt: 'textless', tmdbKey: V3 };
  assert.ok(artPlan(SERVER_POSTER, on));
  assert.equal(artPlan(SERVER_POSTER, { ...on, tmdbKey: '' }), null, 'no key');
  assert.equal(artPlan(SERVER_POSTER, { ...on, tmdbKey: '   ' }), null, 'a blank key');
  assert.equal(artPlan(SERVER_POSTER, { ...on, tmdbKey: 'Bearer ' }), null, 'a "Bearer" with nothing after it');
  assert.equal(artPlan(SERVER_POSTER, { ...on, tmdbKey: undefined }), null);
  assert.equal(artPlan({ ...SERVER_POSTER, tmdbId: undefined }, on), null, 'no id');
  assert.equal(artPlan({ ...SERVER_POSTER, tmdbId: '' }, on), null);
  assert.equal(artPlan({ ...SERVER_POSTER, tmdbId: '60 3' }, on), null, 'an id that is not digits');
  assert.equal(artPlan({ ...SERVER_POSTER, tmdbType: undefined }, on), null, 'no type');
  assert.equal(artPlan({ ...SERVER_POSTER, tmdbType: 'person' }, on), null, 'a type that is neither movie nor tv');
  assert.equal(artPlan({ ...SERVER_POSTER, source: 'now-playing' }, on), null, 'the now-playing poster keeps the server art (D217 2)');
  for (const mode of ['source', '', undefined, 'nonsense']) assert.equal(artPlan(SERVER_POSTER, { ...on, posterArt: mode }), null, `mode ${mode}`);
  assert.deepEqual(ART_MODES, ['source', 'textless', 'language', 'largest']);
});

test('artPlan: the title is the poster own (its tmdbId and tmdbType), the cache key names TMDB and the id and is no server thumb', () => {
  const t = artPlan(SERVER_POSTER, { posterArt: 'textless', tmdbKey: V3 });
  assert.equal(t.type, 'movie');
  assert.equal(t.id, '603');
  assert.match(t.key, /tmdb/i);
  assert.ok(t.key.includes('603'));
  assert.notEqual(t.key, SERVER_POSTER.thumb);
  const l = artPlan({ ...SERVER_POSTER, tmdbType: 'tv', tmdbId: '1399' }, { posterArt: 'language', posterArtLanguage: 'fr', tmdbKey: V3 });
  assert.equal(l.type, 'tv');
  assert.ok(l.key.includes('1399') && l.key.includes('fr'));
  const keys = new Set([t.key, l.key, artPlan(SERVER_POSTER, { posterArt: 'largest', tmdbKey: V3 }).key, artPlan(SERVER_POSTER, { posterArt: 'largest', posterArtLanguage: 'fr', tmdbKey: V3 }).key, artPlan(SERVER_POSTER, { posterArt: 'language', posterArtLanguage: 'de', tmdbKey: V3 }).key, artPlan(SERVER_POSTER, { posterArt: 'language', posterArtLanguage: 'fr', tmdbKey: V3 }).key]);
  assert.equal(keys.size, 6, 'each mode, language and title has a key of its own');
  assert.equal(artPlan(SERVER_POSTER, { posterArt: 'language', posterArtLanguage: 'zz', tmdbKey: V3 }), null, 'a language not on the list asks nothing');
  assert.equal(artPlan(SERVER_POSTER, { posterArt: 'language', posterArtLanguage: '', tmdbKey: V3 }), null);
});

// ---- the choice among a title's posters ----

test('Textless takes the highest-voted poster with no language, else nothing (so the source art shows)', () => {
  assert.equal(choosePoster(POSTERS, 'textless'), '/null-high.jpg', 'a higher-voted poster of a language does not win');
  assert.equal(choosePoster([img('/a.jpg', 'en', 9), img('/b.jpg', 'fr', 9)], 'textless'), null, 'no poster without a language: no other language stands in');
  assert.equal(choosePoster([img('/a.jpg', null, 3), img('/b.jpg', null, 3)], 'textless'), '/a.jpg', 'a tie keeps the first');
  assert.equal(choosePoster([img('/a.jpg', undefined, 9)], 'textless'), null, 'an entry with no iso_639_1 at all is not "no language"');
});

test('a language takes that language highest-voted poster; a language with none falls back to nothing, not to another language', () => {
  assert.equal(choosePoster(POSTERS, 'language', 'fr'), '/fr.jpg');
  assert.equal(choosePoster([img('/f1.jpg', 'fr', 4), img('/f2.jpg', 'fr', 7), img('/e.jpg', 'en', 9)], 'language', 'fr'), '/f2.jpg');
  assert.equal(choosePoster(POSTERS, 'language', 'de'), null, 'German has none: the source art, not English and not the textless one');
  assert.equal(choosePoster(POSTERS, 'language', ''), null);
  assert.equal(choosePoster(POSTERS, 'language', undefined), null);
});

test('Largest takes the poster with the greatest width, the highest-voted of equal ones, not the first', () => {
  assert.equal(choosePoster([img('/a.jpg', 'en', 9, 1000), img('/b.jpg', 'en', 1, 2000), img('/c.jpg', 'fr', 5, 1500)], 'largest'), '/b.jpg');
  assert.equal(choosePoster([img('/a.jpg', 'en', 2, 2000), img('/b.jpg', 'en', 8, 2000), img('/c.jpg', 'en', 9, 1999)], 'largest'), '/b.jpg', 'equal widths: the better voted');
  assert.equal(choosePoster([img('/a.jpg', 'en', 2, 2000), img('/b.jpg', 'en', 2, 2000)], 'largest'), '/a.jpg', 'still equal: the first');
  assert.equal(choosePoster([img('/a.jpg', 'en', 2, 'wide'), img('/b.jpg', 'en', 2, 10)], 'largest'), '/b.jpg', 'a width that is no number counts as none');
});

test('a poster file that is no plain path, or an answer that is no list, is never chosen', () => {
  const bad = ['https://evil.example/x.jpg', '//evil.example/x.jpg', '/a/../b.jpg', '/a b.jpg', '', null, 7, '/a.jpg?key=1'];
  for (const file_path of bad) for (const mode of ['textless', 'language', 'largest']) assert.equal(choosePoster([{ ...img('/ok.jpg', null, 9, 9000), iso_639_1: mode === 'language' ? 'fr' : null, file_path }], mode, 'fr'), null, `${mode} ${String(file_path)}`);
  for (const junk of [undefined, null, {}, 'x', 5, [null, 4, 'x']]) assert.equal(choosePoster(junk, 'largest'), null);
  assert.equal(choosePoster(POSTERS, 'source'), null);
});

// ---- the fetch: cache first, then TMDB ----

test('no key, or no TMDB id: the source art and not one TMDB request (no key is ever needed to ask)', async () => {
  const r1 = rig({ settings: { tmdbKey: '' } });
  assert.equal(await r1.art.image(SERVER_POSTER, SIZE), null);
  const r2 = rig();
  assert.equal(await r2.art.image({ ...SERVER_POSTER, tmdbId: undefined, tmdbType: undefined }, SIZE), null);
  for (const r of [r1, r2]) assert.equal(r.s.calls.length, 0, 'no request of any kind');
});

test('"As the source gives it" asks TMDB nothing, even with a key and an id', async () => {
  const r = rig({ settings: { posterArt: 'source' } });
  assert.equal(await r.art.image(SERVER_POSTER, SIZE), null);
  assert.equal(await r.art.image(TMDB_POSTER, SIZE), null);
  assert.equal(r.s.calls.length, 0);
});

test('the now-playing poster keeps the server art and asks TMDB nothing', async () => {
  const r = rig();
  assert.equal(await r.art.image({ ...SERVER_POSTER, source: 'now-playing' }, SIZE), null);
  assert.equal(r.s.calls.length, 0);
});

test('Textless: one images request by the poster own id and type, then the file; the blob is stored under a TMDB key, not the thumb', async () => {
  const r = rig();
  const got = await r.art.image(SERVER_POSTER, SIZE);
  assert.equal(got.cached, false);
  assert.equal(await read(got.blob), 'IMAGE /t/p/w500/null-high.jpg');
  assert.deepEqual(r.s.api().map((c) => c.path), ['/3/movie/603/images'], 'by id and type, never a search');
  assert.deepEqual(r.s.calls.map((c) => c.host), ['api.themoviedb.org', 'image.tmdb.org']);
  assert.deepEqual(r.s.api()[0].params.include_image_language.split(','), ['null']);
  await new Promise((resolve) => setImmediate(resolve)); // the store is not waited for
  const [entry] = r.cache.entries();
  assert.equal(entry.ratingKey, '41', 'the entry is still the server poster');
  assert.notEqual(entry.thumb, SERVER_POSTER.thumb, 'the cache key of the art is not the server thumb');
  assert.match(entry.thumb, /tmdb/i);
  assert.ok(entry.thumb.includes('603'));
});

test('a language asks for that language and no-language posters, and shows the language one', async () => {
  const r = rig({ settings: { posterArt: 'language', posterArtLanguage: 'fr' } });
  const got = await r.art.image(SERVER_POSTER, SIZE);
  assert.equal(await read(got.blob), 'IMAGE /t/p/w500/fr.jpg');
  assert.deepEqual(r.s.api()[0].params.include_image_language.split(',').sort(), ['fr', 'null']);
});

test('a language the title has no poster in: the source art, and no file is fetched', async () => {
  const r = rig({ settings: { posterArt: 'language', posterArtLanguage: 'de' } });
  assert.equal(await r.art.image(SERVER_POSTER, SIZE), null);
  assert.equal(r.s.files().length, 0);
});

test('Largest fetches the file at size original and takes the widest poster', async () => {
  const r = rig({ settings: { posterArt: 'largest' }, stubOpts: { posters: [img('/small.jpg', 'en', 9, 500), img('/big.jpg', null, 1, 4000), img('/mid.jpg', 'fr', 5, 2000)] } });
  const got = await r.art.image(SERVER_POSTER, SIZE);
  assert.equal(await read(got.blob), 'IMAGE /t/p/original/big.jpg');
});

// D218 (Q9): Largest chooses among textless, English and the chosen language, asks for those and no others, and its cached art is keyed by the language it used.
const asked = (r, i = 0) => r.s.api()[i].params.include_image_language.split(',').sort();

test('Largest asks for exactly null, en and the chosen language: never all twenty, never without the chosen one', async () => {
  const r = rig({ settings: { posterArt: 'largest', posterArtLanguage: 'fr' } });
  await r.art.image(SERVER_POSTER, SIZE);
  assert.deepEqual(asked(r), ['en', 'fr', 'null']);
  const en = rig({ settings: { posterArt: 'largest', posterArtLanguage: 'en' } });
  await en.art.image(SERVER_POSTER, SIZE);
  assert.deepEqual(asked(en), ['en', 'null'], 'English chosen: no code twice');
  const ja = rig({ settings: { posterArt: 'largest', posterArtLanguage: 'ja' } });
  await ja.art.image(SERVER_POSTER, SIZE);
  assert.deepEqual(asked(ja), ['en', 'ja', 'null']);
});

test('Largest filters by language itself too: a wider poster in a language nobody chose never wins, even if TMDB sent it', () => {
  const posters = [img('/ja.jpg', 'ja', 9, 5000), img('/de.jpg', 'de', 9, 4000), img('/fr.jpg', 'fr', 5, 3000), img('/en.jpg', 'en', 5, 2000), img('/null.jpg', null, 1, 1000), img('/undef.jpg', undefined, 9, 9000)];
  assert.equal(choosePoster(posters, 'largest', 'fr', ['null', 'en', 'fr']), '/fr.jpg');
  assert.equal(choosePoster(posters, 'largest', 'en', ['null', 'en']), '/en.jpg');
  assert.equal(choosePoster([img('/ja.jpg', 'ja', 9, 5000)], 'largest', 'fr', ['null', 'en', 'fr']), null, 'only a language nobody chose: the source art');
});

test('Largest through image(): a TMDB that ignores include_image_language does not put a foreign poster on screen', async () => {
  const r = rig({ settings: { posterArt: 'largest', posterArtLanguage: 'fr' }, stubOpts: { posters: [img('/ja.jpg', 'ja', 9, 5000), img('/fr.jpg', 'fr', 5, 3000)] } });
  assert.equal(await read((await r.art.image(SERVER_POSTER, SIZE)).blob), 'IMAGE /t/p/original/fr.jpg');
});

test('Largest: a change of the Poster art language fetches again (the key names the language it used)', async () => {
  const r = rig({ settings: { posterArt: 'largest', posterArtLanguage: 'fr' }, stubOpts: { posters: [img('/fr.jpg', 'fr', 5, 4000), img('/de.jpg', 'de', 5, 3000), img('/en.jpg', 'en', 5, 1000)] } });
  assert.equal(await read((await r.art.image(SERVER_POSTER, SIZE)).blob), 'IMAGE /t/p/original/fr.jpg');
  await settle();
  r.cfg.posterArtLanguage = 'de';
  const de = await r.art.image(SERVER_POSTER, SIZE);
  assert.equal(de.cached, false, 'a new request, not the French art from the cache');
  assert.equal(r.s.api().length, 2);
  assert.deepEqual(asked(r, 1), ['de', 'en', 'null']);
  assert.equal(await read(de.blob), 'IMAGE /t/p/original/de.jpg');
});

test('a title with a TMDB id in TMDB mode gets art too (its source art is TMDB poster_path)', async () => {
  const r = rig();
  assert.equal(await read((await r.art.image(TMDB_POSTER, SIZE)).blob), 'IMAGE /t/p/w500/null-high.jpg');
});

test('a failed images request is the source art, never an error: a 503, a 401, junk, a dead network, an empty list', async () => {
  for (const images of ['http', 'auth', 'junk', 'throw']) {
    const r = rig({ stubOpts: { images } });
    assert.equal(await r.art.image(SERVER_POSTER, SIZE), null, images);
    assert.equal(r.s.files().length, 0);
  }
  assert.equal(await rig({ stubOpts: { posters: [] } }).art.image(SERVER_POSTER, SIZE), null, 'no posters');
  const padded = rig({ settings: { tmdbKey: `  ${V3}\n` } }); // trimmed: still a v3 key
  assert.ok(await padded.art.image(SERVER_POSTER, SIZE));
});

test('a failed image file is the source art too', async () => {
  for (const file of ['http', 'throw']) assert.equal(await rig({ stubOpts: { file } }).art.image(SERVER_POSTER, SIZE), null, file);
});

test('a read access token with a character no header may hold is the source art, with no error', async () => {
  const r = rig({ settings: { tmdbKey: 'abc\ndef' } });
  assert.equal(await r.art.image(SERVER_POSTER, SIZE), null);
  assert.equal(r.s.calls.length, 0);
});

test('the key goes only to the API host, as api_key or as Bearer: never in an image address, a cache key or the stored index', async () => {
  for (const [key, where] of [[V3, 'query'], [TOKEN, 'header']]) {
    const r = rig({ settings: { tmdbKey: key } });
    await r.art.image(SERVER_POSTER, SIZE);
    await new Promise((resolve) => setImmediate(resolve));
    const [api] = r.s.api();
    assert.equal(api.params.api_key, where === 'query' ? key : undefined);
    assert.equal(api.headers.Authorization, where === 'header' ? `Bearer ${key}` : undefined);
    for (const c of r.s.files()) assert.ok(!c.url.includes(key) && !('api_key' in c.params) && !c.headers.Authorization, 'the image request carries no key');
    assert.ok(!JSON.stringify(r.cache.entries()).includes(key), 'no key in the index');
    assert.ok(![...r.c.store.keys()].some((u) => u.includes(key)), 'no key in a cache address');
  }
});

test('a failed images request leaves the error message free of the key', async () => {
  const logged = [];
  const r = rig({ stubOpts: { images: 'http' } });
  const art = createArtwork({ cache: r.cache, getSettings: () => r.cfg, fetchImpl: r.s.fetchImpl, log: { warn: (m) => logged.push(m) } });
  await art.image(SERVER_POSTER, SIZE);
  assert.ok(logged.every((m) => !m.includes(V3) && !m.includes('api_key')), JSON.stringify(logged));
});

test('cache first: the second time is a hit and TMDB is not asked; a changed mode or language is a miss', async () => {
  const r = rig();
  await r.art.image(SERVER_POSTER, SIZE);
  await new Promise((resolve) => setImmediate(resolve));
  const before = r.s.calls.length;
  const hit = await r.art.image(SERVER_POSTER, SIZE);
  assert.equal(hit.cached, true);
  assert.equal(await read(hit.blob), 'IMAGE /t/p/w500/null-high.jpg');
  assert.equal(r.s.calls.length, before, 'no TMDB request on a hit');
  r.cfg.posterArt = 'language';
  const lang = await r.art.image(SERVER_POSTER, SIZE);
  assert.equal(lang.cached, false);
  assert.equal(await read(lang.blob), 'IMAGE /t/p/w500/fr.jpg');
});

test('skipCache fetches again even when the art is stored (an undecodable stored copy)', async () => {
  const r = rig();
  await r.art.image(SERVER_POSTER, SIZE);
  await new Promise((resolve) => setImmediate(resolve));
  const before = r.s.api().length;
  assert.equal((await r.art.image(SERVER_POSTER, SIZE, { skipCache: true })).cached, false);
  assert.equal(r.s.api().length, before + 1);
});

test('the art counts against posterCacheLimit: the oldest entry and its blob go', async () => {
  const r = rig({ limit: 2 });
  for (const n of [1, 2, 3]) {
    await r.art.image({ ...SERVER_POSTER, ratingKey: String(n), tmdbId: String(600 + n) }, SIZE);
    await new Promise((resolve) => setImmediate(resolve));
    r.clock.t += 1000;
  }
  assert.deepEqual(r.cache.entries().map((e) => e.ratingKey), ['3', '2']);
  assert.equal(r.c.store.size, 2, 'the evicted blob is gone from the Cache API');
});

test('TMDB art older than 180 days is fetched again; one day younger is reused', async () => {
  const r = rig();
  await r.art.image(SERVER_POSTER, SIZE);
  await new Promise((resolve) => setImmediate(resolve));
  const asked = () => r.s.api().length;
  r.clock.t += TMDB_MAX_AGE_MS - DAY;
  assert.equal((await r.art.image(SERVER_POSTER, SIZE)).cached, true, '179 days');
  assert.equal(asked(), 1);
  r.clock.t += DAY;
  assert.equal((await r.art.image(SERVER_POSTER, SIZE)).cached, false, '180 days exactly is expired');
  assert.equal(asked(), 2);
});

test('the same holds for a TMDB-mode poster', async () => {
  const r = rig();
  await r.art.image(TMDB_POSTER, SIZE);
  await new Promise((resolve) => setImmediate(resolve));
  r.clock.t += 181 * DAY;
  assert.equal((await r.art.image(TMDB_POSTER, SIZE)).cached, false);
});

test('a request that finds no TMDB art leaves the source art unstored by this module and asks again next time', async () => {
  const r = rig({ stubOpts: { posters: [img('/en.jpg', 'en', 9)] } });
  assert.equal(await r.art.image(SERVER_POSTER, SIZE), null);
  assert.equal(await r.art.image(SERVER_POSTER, SIZE), null);
  assert.equal(r.s.api().length, 2);
  assert.equal(r.cache.entries().length, 0);
});

test('lookups are capped at four at once', async () => {
  let open = 0;
  let peak = 0;
  const gate = [];
  const fetchImpl = async (url) => {
    const u = new URL(String(url));
    if (u.hostname === 'image.tmdb.org') return new Response(new Blob(['x'], { type: 'image/jpeg' }));
    open++;
    peak = Math.max(peak, open);
    await new Promise((resolve) => gate.push(resolve));
    open--;
    return new Response(JSON.stringify({ posters: POSTERS }));
  };
  const cfg = { posterArt: 'textless', tmdbKey: V3 };
  const art = createArtwork({ cache: createPosterCache({ storage: memoryStorage(), caches: fakeCaches().caches }), getSettings: () => cfg, fetchImpl, log: { warn() {} } });
  const all = [1, 2, 3, 4, 5, 6, 7].map((n) => art.image({ ...SERVER_POSTER, ratingKey: String(n), tmdbId: String(n) }, SIZE));
  for (let i = 0; i < 50; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(peak, 4, 'seven asked, four at once');
  let done = false;
  const finished = Promise.all(all).then(() => (done = true));
  while (!done) {
    while (gate.length) gate.shift()();
    await new Promise((resolve) => setImmediate(resolve));
  }
  await finished;
  assert.equal(peak, 4);
});

// ---- D219 1: the art of one poster has 4 seconds in all; a network error, a timeout or a refused key pauses art for 10 minutes ----

const NEVER = new Promise(() => {});
const PAUSE = 10 * 60 * 1000;
const other = (n) => ({ ...SERVER_POSTER, ratingKey: String(n), tmdbId: String(n) });
/** The same rig with another fetch: `via(url)` answers for the hosts it takes, the rest goes to the rig's stub. */
const withFetch = (r, via) => createArtwork({ cache: r.cache, getSettings: () => r.cfg, fetchImpl: (url, init) => via(new URL(String(url))) ?? r.s.fetchImpl(url, init), log: { warn() {} }, timers: r.timers, now: () => r.clock.t });

test('the budget is 4 seconds: a TMDB that never answers shows the source art when it runs out', async () => {
  const r = rig();
  const art = withFetch(r, () => NEVER);
  const out = art.image(SERVER_POSTER, SIZE);
  await settle();
  assert.deepEqual(r.timers.asked, [4000], 'one timer, of 4 seconds');
  r.timers.fire();
  assert.equal(await out, null, 'the source art, no error');
  assert.equal(r.timers.waiting.size, 0);
});

test('the budget covers the image file too: the images request answers, the file never does', async () => {
  const r = rig();
  const art = withFetch(r, (u) => (u.hostname === 'image.tmdb.org' ? NEVER : null));
  const out = art.image(SERVER_POSTER, SIZE);
  await settle();
  assert.equal(r.s.api().length, 1, 'the images request was answered');
  assert.deepEqual(r.timers.asked, [4000], 'one budget for both');
  r.timers.fire();
  assert.equal(await out, null);
});

test('an answer inside the budget is shown, and its timer is cleared', async () => {
  const r = rig();
  assert.ok(await r.art.image(SERVER_POSTER, SIZE));
  assert.equal(r.timers.waiting.size, 0, 'nothing left to fire');
});

test('after a timeout no art is asked for until 10 minutes have passed', async () => {
  const r = rig();
  let asks = 0;
  const art = withFetch(r, () => (asks++, NEVER));
  const first = art.image(SERVER_POSTER, SIZE);
  await settle();
  r.timers.fire();
  assert.equal(await first, null);
  assert.equal(asks, 1);
  assert.equal(await art.image(other(604), SIZE), null);
  assert.equal(asks, 1, 'no request while the pause lasts');
  assert.equal(r.timers.asked.length, 1, 'and no budget started');
  r.clock.t += PAUSE;
  const again = art.image(other(605), SIZE);
  await settle();
  assert.equal(asks, 2, 'asked again after 10 minutes');
  r.timers.fire();
  assert.equal(await again, null);
});

for (const [images, what] of [['throw', 'a network error'], ['auth', 'a refused key']]) {
  test(`after ${what}: one art attempt in 10 minutes, the source art for the others, then TMDB is asked again`, async () => {
    const r = rig({ stubOpts: { images } });
    assert.equal(await r.art.image(SERVER_POSTER, SIZE), null);
    assert.equal(r.s.api().length, 1);
    assert.equal(await r.art.image(other(604), SIZE), null, 'no error, the source art');
    assert.equal(await r.art.image(other(605), SIZE), null);
    assert.equal(r.s.api().length, 1, 'two poster changes, no further request');
    r.clock.t += PAUSE - 1;
    await r.art.image(other(606), SIZE);
    assert.equal(r.s.api().length, 1, 'one millisecond short of 10 minutes');
    r.clock.t += 1;
    await r.art.image(other(607), SIZE);
    assert.equal(r.s.api().length, 2, '10 minutes: asked again');
  });
}

test('D220 1: a file host that cannot be reached shows the source art for that poster only: the next poster is asked, no pause', async () => {
  const r = rig({ stubOpts: { file: 'throw' } });
  assert.equal(await r.art.image(SERVER_POSTER, SIZE), null);
  await r.art.image(other(604), SIZE);
  assert.equal(r.s.api().length, 2, 'asked again at once');
});

test('D220 1: a poster file that overruns the budget shows the source art for that poster only, and the next poster asks TMDB again', async () => {
  const r = rig();
  const art = withFetch(r, (u) => (u.hostname === 'image.tmdb.org' ? NEVER : null));
  const out = art.image(SERVER_POSTER, SIZE);
  await settle();
  r.timers.fire();
  assert.equal(await out, null);
  const next = art.image(other(604), SIZE);
  await settle();
  assert.equal(r.s.api().length, 2, 'no pause: TMDB is asked for the next poster');
  assert.equal(r.timers.asked.length, 2, 'a budget started for it');
  r.timers.fire();
  await next;
});

test('D220 1: an images request that overruns the budget still pauses (it is the TMDB API that does not answer)', async () => {
  const r = rig();
  let asks = 0;
  const art = withFetch(r, (u) => (u.hostname === 'api.themoviedb.org' ? (asks++, NEVER) : null));
  const out = art.image(SERVER_POSTER, SIZE);
  await settle();
  r.timers.fire();
  assert.equal(await out, null);
  await art.image(other(604), SIZE);
  assert.equal(asks, 1, 'paused');
});

/** A rig whose images request is held by the test: `waiting[i].resolve/reject` answers it, `signals` lists the signal each request carried, `lines` the log. */
function held() {
  const r = rig();
  const lines = [];
  const signals = [];
  const waiting = [];
  const fetchImpl = (url, init = {}) => {
    const u = new URL(String(url));
    if (u.hostname !== 'api.themoviedb.org') return r.s.fetchImpl(url, init);
    signals.push(init.signal);
    return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
  };
  const art = createArtwork({ cache: r.cache, getSettings: () => r.cfg, fetchImpl, log: { warn: (m) => lines.push(m) }, timers: r.timers, now: () => r.clock.t });
  return { r, art, lines, signals, waiting };
}

test('D220 1: the images request carries a signal that the budget aborts', async () => {
  const h = held();
  const out = h.art.image(SERVER_POSTER, SIZE);
  await settle();
  assert.equal(h.signals.length, 1);
  assert.ok(h.signals[0], 'the request has a signal');
  assert.equal(h.signals[0].aborted, false);
  h.r.timers.fire();
  assert.equal(h.signals[0].aborted, true, 'abandoned when the budget ends');
  assert.equal(await out, null);
});

test('D220 1: a late images failure after the budget writes no second log line and sets no later pause', async () => {
  const h = held();
  const out = h.art.image(SERVER_POSTER, SIZE);
  await settle();
  h.r.timers.fire();
  assert.equal(await out, null);
  assert.equal(h.lines.length, 1, 'the budget line');
  h.r.clock.t += PAUSE - 1; // the pause the budget made ends in 1 ms
  h.waiting[0].reject(new TypeError('Failed to fetch')); // the reply comes late
  await settle();
  assert.equal(h.lines.length, 1, 'no second line');
  h.r.clock.t += 1;
  const again = h.art.image(other(604), SIZE);
  await settle();
  assert.equal(h.waiting.length, 2, 'the late failure did not start a newer pause: TMDB is asked at 10 minutes');
  h.r.timers.fire();
  await again;
});

test('D220 1: a late images answer after the budget fetches no file and writes nothing', async () => {
  const h = held();
  const out = h.art.image(SERVER_POSTER, SIZE);
  await settle();
  h.r.timers.fire();
  await out;
  h.waiting[0].resolve(new Response(JSON.stringify({ posters: POSTERS }), { status: 200 }));
  await settle();
  assert.equal(h.r.s.files().length, 0, 'no image request');
  assert.equal(h.lines.length, 1);
});

test('D220 1: lookups queued behind the cap of four never start once the budget has ended', async () => {
  const h = held();
  const all = [1, 2, 3, 4, 5, 6, 7].map((n) => h.art.image(other(n), SIZE));
  await settle();
  assert.equal(h.waiting.length, 4, 'four at once');
  h.r.timers.fire();
  await Promise.all(all);
  for (const w of h.waiting) w.reject(new TypeError('Failed to fetch'));
  await settle();
  assert.equal(h.waiting.length, 4, 'the other three were never sent');
});

test('a 503, a junk reply, no poster or a missing file do not pause: the next poster is asked', async () => {
  for (const stubOpts of [{ images: 'http' }, { images: 'junk' }, { posters: [] }, { file: 'http' }]) {
    const r = rig({ stubOpts });
    await r.art.image(SERVER_POSTER, SIZE);
    await r.art.image(other(604), SIZE);
    assert.equal(r.s.api().length, 2, JSON.stringify(stubOpts));
  }
});

test('a change of the key or of the Poster art choice ends the pause at once', async () => {
  for (const change of [{ tmdbKey: TOKEN }, { posterArt: 'language' }, { posterArt: 'language', posterArtLanguage: 'de' }]) {
    const r = rig({ stubOpts: { images: 'auth' } });
    await r.art.image(SERVER_POSTER, SIZE);
    await r.art.image(other(604), SIZE);
    assert.equal(r.s.api().length, 1, 'paused');
    Object.assign(r.cfg, change);
    await r.art.image(other(605), SIZE);
    assert.equal(r.s.api().length, 2, JSON.stringify(change));
  }
});

test('during a pause a stored copy is still shown (it needs no request)', async () => {
  const r = rig();
  await r.art.image(SERVER_POSTER, SIZE);
  await settle();
  const down = withFetch(r, (u) => (u.hostname === 'api.themoviedb.org' ? Promise.reject(new TypeError('Failed to fetch')) : null));
  assert.equal(await down.image(other(604), SIZE), null, 'a pause starts');
  const hit = await down.image(SERVER_POSTER, SIZE);
  assert.equal(hit.cached, true, 'what is stored is still drawn');
});

// ---- the language list and the settings ----

test('the language list is about 20 ISO 639-1 codes in their own names', () => {
  assert.ok(LANGUAGES.length >= 18 && LANGUAGES.length <= 24, String(LANGUAGES.length));
  assert.equal(new Set(LANGUAGES.map((l) => l.code)).size, LANGUAGES.length);
  for (const l of LANGUAGES) assert.match(l.code, /^[a-z]{2}$/);
  const name = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.name]));
  assert.equal(name.fr, 'Français');
  assert.equal(name.de, 'Deutsch');
  assert.equal(name.es, 'Español');
  assert.equal(name.en, 'English');
});

test('the default language is the display own when listed, else English', () => {
  assert.equal(defaultArtLanguage('fr-CA'), 'fr');
  assert.equal(defaultArtLanguage('DE'), 'de');
  assert.equal(defaultArtLanguage('pt_BR'), 'pt');
  assert.equal(defaultArtLanguage('xx-YY'), 'en', 'not in the list');
  assert.equal(defaultArtLanguage(''), 'en');
  assert.equal(defaultArtLanguage(undefined), 'en');
  assert.equal(defaultArtLanguage(42), 'en');
});

test('the settings carry posterArt (default: as the source gives it) and a listed language', () => {
  const d = defaults();
  assert.equal(d.posterArt, 'source');
  assert.ok(LANGUAGES.some((l) => l.code === d.posterArtLanguage));
  for (const mode of ART_MODES) assert.equal(sanitize({ posterArt: mode }).posterArt, mode);
  assert.equal(sanitize({ posterArt: 'huge' }).posterArt, 'source');
  assert.equal(sanitize({ posterArt: 5 }).posterArt, 'source');
  assert.equal(sanitize({ posterArtLanguage: 'fr' }).posterArtLanguage, 'fr');
  assert.equal(sanitize({ posterArtLanguage: 'zz' }).posterArtLanguage, d.posterArtLanguage);
  assert.equal(sanitize({ posterArtLanguage: 'FR' }).posterArtLanguage, d.posterArtLanguage);
});

// ---- Title as logo (R-ART-2, D221): the logo of the poster's own title, by its id, in the Poster art language, else with no language, else none ----

const LOGOS = [img('/logo-en-low.png', 'en', 4, 500), img('/logo-en.png', 'en', 6, 500), img('/logo-fr.png', 'fr', 5, 500), img('/logo-null.png', null, 5.5, 500)];
const ON = { titleLogo: true, showTitle: true };
const logoRig = (settings = {}, stubOpts = {}, measure) => rig({ settings: { ...ON, posterArt: 'source', posterArtLanguage: 'en', ...settings }, stubOpts: { logos: LOGOS, ...stubOpts }, measure });

test('chooseLogo: the language first (the best voted), else a logo with no language, else none; a file that is no plain path is never chosen', () => {
  assert.equal(chooseLogo(LOGOS, 'en'), '/logo-en.png');
  assert.equal(chooseLogo(LOGOS, 'fr'), '/logo-fr.png');
  assert.equal(chooseLogo(LOGOS.filter((l) => l.iso_639_1 !== 'fr'), 'fr'), '/logo-null.png', 'no logo in the language: the one with no language');
  assert.equal(chooseLogo([img('/logo-en.png', 'en', 6, 500)], 'fr'), null, 'a logo in another language never stands in (L1)');
  assert.equal(chooseLogo([img('/n1.png', null, 3, 500), img('/n2.png', null, 7, 500)], 'fr'), '/n2.png', 'the best voted of those with no language');
  assert.equal(chooseLogo([img('/n.png', null, 3, 500), img('/x.png', 'en', 1, 500)], 'en'), '/x.png', 'a poorly voted logo in the language still beats a well voted one with none');
  assert.equal(chooseLogo([img('/only-null.svg', null, 1, 500)], 'en'), '/only-null.svg', 'only a null-language logo (L2)');
  assert.equal(chooseLogo([img('//evil.example/x.png', 'en', 9, 500), { file_path: '/a b.png', iso_639_1: 'en' }, null, 'x'], 'en'), null);
  assert.equal(chooseLogo('junk', 'en'), null);
  assert.equal(chooseLogo([], 'en'), null);
  assert.equal(chooseLogo(LOGOS, ''), '/logo-null.png', 'no language named: the null-language one');
});

test('logoPlan: a plan only with the setting on, the title card on, a key, and the poster own id and type; the Poster art choice does not matter', () => {
  const base = { ...ON, tmdbKey: V3, posterArt: 'source', posterArtLanguage: 'fr' };
  const plan = logoPlan(SERVER_POSTER, base);
  assert.deepEqual([plan.type, plan.id, plan.language], ['movie', '603', 'fr']);
  assert.deepEqual([...plan.languages].sort(), ['fr', 'null']);
  assert.match(plan.key, /^tmdb-art:movie:603:logo/);
  assert.ok(plan.key.includes('fr'), 'a change of language is another key');
  for (const mode of ART_MODES) assert.ok(logoPlan(SERVER_POSTER, { ...base, posterArt: mode }), `Poster art ${mode}`);
  assert.equal(logoPlan(SERVER_POSTER, { ...base, titleLogo: false }), null, 'the setting off');
  assert.equal(logoPlan(SERVER_POSTER, { ...base, showTitle: false }), null, 'the title card off (L5)');
  assert.equal(logoPlan(SERVER_POSTER, { ...base, tmdbKey: '' }), null, 'no key (L6)');
  assert.equal(logoPlan(SERVER_POSTER, { ...base, tmdbKey: 'Bearer  ' }), null, 'a key that is only "Bearer"');
  assert.equal(logoPlan({ ...SERVER_POSTER, tmdbId: undefined }, base), null, 'no id');
  assert.equal(logoPlan({ ...SERVER_POSTER, tmdbType: 'person' }, base), null, 'no movie or tv type');
  assert.equal(logoPlan({ ...SERVER_POSTER, tmdbId: '6/../x' }, base), null, 'an id that is not digits');
  assert.equal(logoPlan(null, base), null);
  assert.equal(logoPlan(SERVER_POSTER, { ...base, posterArtLanguage: 'zz' }).language, 'en', 'a language not on the list is English');
  assert.equal(logoPlan(SERVER_POSTER, null), null);
});

test('logo(): one images request by the poster own id and type, the language and no-language logos asked for, then the file; the title is never searched', async () => {
  const r = logoRig();
  const got = await r.art.logo(SERVER_POSTER);
  assert.equal(got.cached, false);
  assert.equal(await read(got.blob), 'IMAGE /t/p/w500/logo-en.png');
  assert.deepEqual(r.s.api().map((c) => c.path), ['/3/movie/603/images']);
  assert.deepEqual(asked(r), ['en', 'null']);
  assert.deepEqual(r.s.calls.map((c) => c.host), ['api.themoviedb.org', 'image.tmdb.org']);
});

test('L1: the logo language is the Poster art language, whatever the Poster art choice: fr, with en logos only, is no logo (not the en logo)', async () => {
  const r = logoRig({ posterArtLanguage: 'fr' }, { logos: [img('/logo-en.png', 'en', 6, 500)] });
  assert.equal(await r.art.logo(SERVER_POSTER), null);
  assert.deepEqual(r.s.files(), [], 'no file was fetched');
  const r2 = logoRig({ posterArtLanguage: 'fr' }, { logos: LOGOS });
  assert.equal(await read((await r2.art.logo(SERVER_POSTER)).blob), 'IMAGE /t/p/w500/logo-fr.png');
  const r3 = logoRig({ posterArtLanguage: 'fr', posterArt: 'textless' }, { logos: LOGOS.filter((l) => l.iso_639_1 !== 'fr') });
  assert.equal(await read((await r3.art.logo(SERVER_POSTER)).blob), 'IMAGE /t/p/w500/logo-null.png', 'with no logo in fr: the one with no language');
});

test('L2: a title with only a no-language logo shows that logo; a title with none shows none (and fetches no file)', async () => {
  const r = logoRig({}, { logos: [img('/only-null.png', null, 2, 500)] });
  assert.equal(await read((await r.art.logo(SERVER_POSTER)).blob), 'IMAGE /t/p/w500/only-null.png');
  const none = logoRig({}, { logos: [] });
  assert.equal(await none.art.logo(SERVER_POSTER), null);
  assert.deepEqual(none.s.files(), []);
});

test('an SVG logo is asked for at size original, a PNG at w500 (a logo size TMDB lists)', async () => {
  const r = logoRig({}, { logos: [img('/mark.svg', 'en', 5, 500)] });
  await r.art.logo(SERVER_POSTER);
  assert.equal(r.s.files()[0].path, '/t/p/original/mark.svg');
});

test('L5, L6: the title card off, the setting off, or no key asks TMDB nothing at all; nor does a poster with no id', async () => {
  for (const [label, settings, poster] of [
    ['title card off', { showTitle: false }, SERVER_POSTER],
    ['setting off', { titleLogo: false }, SERVER_POSTER],
    ['no key', { tmdbKey: '' }, SERVER_POSTER],
    ['no id', {}, { ...SERVER_POSTER, tmdbId: undefined }],
    ['now playing', {}, { ...SERVER_POSTER, source: 'now-playing', tmdbId: undefined }],
  ]) {
    const r = logoRig(settings);
    assert.equal(await r.art.logo(poster), null, label);
    assert.deepEqual(r.s.calls, [], `${label}: no request`);
  }
});

test('a failed, junk or empty logo request is no logo and no error: a 503, a 401, junk, a dead network, an unreachable file host, an empty list', async () => {
  for (const stubOpts of [{ images: 'http' }, { images: 'auth' }, { images: 'junk' }, { images: 'throw' }, { file: 'http' }, { file: 'throw' }, { logos: [] }]) {
    const r = logoRig({}, stubOpts);
    assert.equal(await r.art.logo(SERVER_POSTER), null, JSON.stringify(stubOpts));
  }
});

test('the logo of a title is stored in its own entry (never the poster entry) and the second time is a hit: TMDB is not asked', async () => {
  const r = logoRig();
  await r.art.logo(SERVER_POSTER);
  await settle();
  const keys = r.cache.entries().map((e) => e.ratingKey);
  assert.ok(!keys.includes(SERVER_POSTER.ratingKey), 'the poster entry is not the logo entry');
  assert.equal(keys.length, 1);
  const [entry] = r.cache.entries();
  assert.match(entry.thumb, /^tmdb-art:movie:603:logo/);
  const again = await r.art.logo(SERVER_POSTER);
  assert.equal(again.cached, true);
  assert.equal(r.s.api().length, 1, 'no second images request');
  r.cfg.posterArtLanguage = 'fr';
  await r.art.logo(SERVER_POSTER);
  assert.equal(r.s.api().length, 2, 'another language is another key: fetched again');
});

test('a logo older than 180 days is fetched again; one day younger is reused', async () => {
  const r = logoRig();
  await r.art.logo(SERVER_POSTER);
  await settle();
  r.clock.t += TMDB_MAX_AGE_MS - DAY;
  assert.equal((await r.art.logo(SERVER_POSTER)).cached, true);
  r.clock.t += DAY;
  assert.equal((await r.art.logo(SERVER_POSTER)).cached, false);
  assert.equal(r.s.api().length, 2);
});

test('a logo kept in a cache of its own never lands in the poster cache, and counts against the limit there', async () => {
  const c = fakeCaches();
  const clock = { t: 1_000_000 };
  const s = stub({ logos: LOGOS });
  const posters = createPosterCache({ storage: memoryStorage(), limit: () => 100, caches: c.caches, now: () => clock.t });
  const logos = createPosterCache({ storage: memoryStorage(), limit: () => 1, caches: c.caches, now: () => clock.t });
  const art = createArtwork({ cache: posters, logoCache: logos, getSettings: () => ({ ...ON, posterArt: 'source', posterArtLanguage: 'en', tmdbKey: V3 }), fetchImpl: s.fetchImpl, log: { warn() {} }, timers: fakeTimers(), now: () => clock.t, measure: async () => 0.9 });
  await art.logo(SERVER_POSTER);
  await art.logo({ ...SERVER_POSTER, ratingKey: '42', tmdbId: '604' });
  await settle();
  assert.deepEqual(posters.entries(), [], 'the poster cache holds no logo (offline never draws one as a poster)');
  assert.equal(logos.entries().length, 1, 'the limit of the logo cache evicted the oldest');
});

test('the logo has the same 4 second budget and the same pause as the art: a TMDB that never answers is no logo, then none is asked for 10 minutes', async () => {
  const r = logoRig();
  const art = createArtwork({ cache: r.cache, getSettings: () => r.cfg, fetchImpl: (url) => (new URL(String(url)).hostname === 'api.themoviedb.org' ? NEVER : r.s.fetchImpl(url)), log: { warn() {} }, timers: r.timers, now: () => r.clock.t, measure: async () => 0.9 });
  const pending = art.logo(SERVER_POSTER);
  await settle();
  assert.deepEqual(r.timers.asked, [4000]);
  r.timers.fire();
  assert.equal(await pending, null);
  const second = { ...SERVER_POSTER, ratingKey: '99', tmdbId: '99' };
  assert.equal(await art.logo(second), null, 'paused: no request');
  assert.equal(r.timers.asked.length, 1, 'no second request was started');
  r.clock.t += PAUSE;
  const again = art.logo(second);
  await settle();
  assert.equal(r.timers.asked.length, 2, 'asked again after the pause');
  r.timers.fire();
  await again;
});

test('one pause for the art and the logo: a failed poster images request pauses the logo too, and a change of the key ends it', async () => {
  const r = logoRig({ posterArt: 'textless' }, { images: 'throw' });
  assert.equal(await r.art.image(SERVER_POSTER, SIZE), null);
  assert.equal(r.s.api().length, 1);
  assert.equal(await r.art.logo(SERVER_POSTER), null);
  assert.equal(r.s.api().length, 1, 'the logo is not asked for during the pause');
  r.cfg.tmdbKey = TOKEN;
  await r.art.logo(SERVER_POSTER);
  assert.equal(r.s.api().length, 2, 'a changed key ends it');
});

test('the key goes only to the API host for a logo too, and no cache key, entry or file address carries it', async () => {
  const r = logoRig();
  await r.art.logo(SERVER_POSTER);
  await settle();
  assert.ok(r.s.files().every((c) => !c.url.includes(V3)));
  assert.ok(!JSON.stringify(r.cache.entries()).includes(V3));
  const t = logoRig({ tmdbKey: TOKEN });
  await t.art.logo(SERVER_POSTER);
  assert.match(t.s.api()[0].headers.Authorization, /^Bearer /);
  assert.ok(t.s.files().every((c) => !c.url.includes(TOKEN) && !c.headers.Authorization));
});

test('the logo does not change the poster art: image() still takes the posters, and a logo request is its own', async () => {
  const r = logoRig({ posterArt: 'textless' });
  assert.equal(await read((await r.art.image(SERVER_POSTER, SIZE)).blob), 'IMAGE /t/p/w500/null-high.jpg');
  assert.equal(await read((await r.art.logo(SERVER_POSTER)).blob), 'IMAGE /t/p/w500/logo-en.png');
});

// ---- D222: a logo is shown only when it can be read; offline it comes from the cache ----

/** `n` pixels of one colour as canvas image data (RGBA bytes). */
const px = (n, [r, g, b], a = 255) => Array.from({ length: n }, () => [r, g, b, a]).flat();

test('logoLuminance: the mean relative luminance of the visible pixels only: black 0, white 1, mid grey about 0.21, transparent pixels left out, nothing visible 0', () => {
  assert.equal(logoLuminance(px(10, [0, 0, 0])), 0);
  assert.equal(logoLuminance(px(10, [255, 255, 255])), 1);
  assert.ok(Math.abs(logoLuminance(px(10, [128, 128, 128])) - 0.2158) < 0.001, 'WCAG relative luminance: linear light, not the raw byte');
  assert.equal(logoLuminance([...px(10, [255, 255, 255]), ...px(90, [0, 0, 0], 0)]), 1, 'a transparent background is not ink');
  assert.equal(logoLuminance(px(10, [255, 255, 255], 0)), 0, 'nothing visible: not readable');
  assert.equal(logoLuminance([]), 0);
  assert.ok(Math.abs(logoLuminance([...px(5, [255, 255, 255]), ...px(5, [0, 0, 0])]) - 0.5) < 1e-9, 'a mean of the visible pixels');
  assert.equal(LOGO_MIN_LUMINANCE, 0.175, 'D223 1: 4.5:1 against black (WCAG text), not 0.35');
  assert.ok(logoLuminance(px(10, [255, 0, 0])) >= LOGO_MIN_LUMINANCE, 'pure red (0.2126) is readable on the near-black card');
  assert.ok(Math.abs(logoLuminance(px(10, [255, 0, 0])) - 0.2126) < 1e-4);
  assert.ok(logoLuminance(px(10, [17, 17, 17])) < LOGO_MIN_LUMINANCE, 'the mock dark ink (#111) stays text');
});

test('D222 1, D223 1 (M1, M2, M8): a logo whose visible pixels have a mean luminance under 0.175 is no logo (text), one at 0.175 or over is the logo; no other logo is tried', async () => {
  for (const [lum, shown] of [[0, false], [0.1, false], [0.1749, false], [0.175, true], [0.2126, true], [0.3499, true], [0.35, true], [0.6, true], [0.95, true]]) {
    const r = logoRig({}, {}, async () => lum);
    const got = await r.art.logo(SERVER_POSTER);
    assert.equal(Boolean(got), shown, `luminance ${lum}`);
    assert.equal(r.s.api().length, 1, `${lum}: one images request`);
    assert.equal(r.s.files().length, 1, `${lum}: one logo file, no other logo tried`);
  }
  const unreadable = logoRig({}, {}, async () => null);
  assert.equal(await unreadable.art.logo(SERVER_POSTER), null, 'a logo that cannot be measured is text');
  const throws = logoRig({}, {}, async () => {
    throw new Error('canvas');
  });
  assert.equal(await throws.art.logo(SERVER_POSTER), null, 'a measure that fails is text, not an error');
});

test('D222 1: the blob measured is the one fetched, and a stored dark logo is text too', async () => {
  const seen = [];
  const r = logoRig({}, {}, async (blob) => {
    seen.push(await blob.text());
    return 0.1;
  });
  assert.equal(await r.art.logo(SERVER_POSTER), null);
  assert.deepEqual(seen, ['IMAGE /t/p/w500/logo-en.png']);
  await settle();
  assert.equal(await r.art.logo(SERVER_POSTER), null, 'from the cache: still dark');
  assert.equal(r.s.api().length, 1, 'the stored copy was used: no second request');
  assert.equal(seen.length, 2);
});

test('entryTmdb: a cached entry carries its TMDB id in its rating key (TMDB mode) or in the thumb of TMDB art; a server entry with its own art carries none', () => {
  assert.deepEqual(entryTmdb({ ratingKey: 'movie:603', thumb: '/en.jpg' }), { tmdbType: 'movie', tmdbId: '603' });
  assert.deepEqual(entryTmdb({ ratingKey: 'tv:1399', thumb: '/x' }), { tmdbType: 'tv', tmdbId: '1399' });
  assert.deepEqual(entryTmdb({ ratingKey: '41', thumb: 'tmdb-art:movie:603:textless' }), { tmdbType: 'movie', tmdbId: '603' });
  assert.deepEqual(entryTmdb({ ratingKey: '41', thumb: 'tmdb-art:tv:1399:largest-fr' }), { tmdbType: 'tv', tmdbId: '1399' });
  for (const e of [{ ratingKey: '41', thumb: '/library/metadata/41/thumb/1700' }, { ratingKey: 'movie:6x', thumb: '' }, { ratingKey: 'person:5', thumb: '' }, { ratingKey: '41', thumb: 'tmdb-art:person:5:x' }, {}, null, undefined]) assert.equal(entryTmdb(e), null, JSON.stringify(e));
});

test('D222 2 (M3): cachedLogo: a cached TMDB title shows its stored logo, with no request of any kind; none stored is none', async () => {
  const r = logoRig();
  await r.art.logo(TMDB_POSTER); // online: the logo is fetched and stored
  await settle();
  r.s.calls.length = 0;
  const offline = { ratingKey: 'movie:603', title: 'The Matrix', thumb: '/en.jpg', source: 'cache' }; // a cache entry carries no tmdbId field
  const got = await r.art.cachedLogo(offline);
  assert.equal(await read(got.blob), 'IMAGE /t/p/w500/logo-en.png');
  assert.equal(got.cached, true);
  const withArt = await r.art.cachedLogo({ ratingKey: '41', title: 'The Matrix', thumb: 'tmdb-art:movie:603:textless', source: 'cache' });
  assert.ok(withArt, 'a server title stored with TMDB art carries its id in the thumb');
  assert.equal(await r.art.cachedLogo({ ratingKey: '41', title: 'The Matrix', thumb: '/library/metadata/41/thumb/1700', source: 'cache' }), null, 'a server poster with its own art carries no id: text');
  assert.equal(await r.art.cachedLogo({ ratingKey: 'movie:999', title: 'Other', thumb: '/x.jpg', source: 'cache' }), null, 'no logo stored for this title');
  assert.deepEqual(r.s.calls, [], 'offline: no request at all');
});

test('D222 2, D223 2 (M10): cachedLogo follows the same rules as the fetch: the setting, the title card, the key (offline needs it too), the language and the age, and a dark one is text', async () => {
  const entry = { ratingKey: 'movie:603', title: 'The Matrix', thumb: '/en.jpg', source: 'cache' };
  const ready = async () => {
    const r = logoRig();
    await r.art.logo(TMDB_POSTER);
    await settle();
    r.s.calls.length = 0;
    return r;
  };
  for (const [label, change] of [['setting off', { titleLogo: false }], ['title card off', { showTitle: false }], ['no key', { tmdbKey: '' }], ['another language', { posterArtLanguage: 'fr' }]]) {
    const r = await ready();
    Object.assign(r.cfg, change);
    assert.equal(await r.art.cachedLogo(entry), null, label);
    assert.deepEqual(r.s.calls, [], `${label}: no request`);
  }
  const old = await ready();
  old.clock.t += TMDB_MAX_AGE_MS;
  assert.equal(await old.art.cachedLogo(entry), null, '180 days old: not served');
  const dark = await ready();
  const darkArt = createArtwork({ cache: dark.cache, getSettings: () => dark.cfg, fetchImpl: dark.s.fetchImpl, log: { warn() {} }, timers: dark.timers, now: () => dark.clock.t, measure: async () => 0.1 });
  assert.equal(await darkArt.cachedLogo(entry), null, 'a dark logo from the store is text');
  assert.deepEqual(dark.s.calls, []);
});

test('D223 2 (M10): offline needs the TMDB key too: a stored logo is not shown once the key is cleared, and is again when it is back', async () => {
  const entry = { ratingKey: 'movie:603', title: 'The Matrix', thumb: '/en.jpg', source: 'cache' };
  const r = logoRig();
  await r.art.logo(TMDB_POSTER);
  await settle();
  r.s.calls.length = 0;
  assert.ok(await r.art.cachedLogo(entry), 'the key is set: the stored logo');
  const key = r.cfg.tmdbKey;
  r.cfg.tmdbKey = '';
  assert.equal(await r.art.cachedLogo(entry), null, 'the key cleared: text offline, as online');
  r.cfg.tmdbKey = 'Bearer ';
  assert.equal(await r.art.cachedLogo(entry), null, 'a "Bearer" with nothing after it is no key');
  r.cfg.tmdbKey = key;
  assert.ok(await r.art.cachedLogo(entry), 'the key back: the stored logo again');
  assert.deepEqual(r.s.calls, [], 'no request at any step');
});

/** A fake Cache API with named stores, as a browser has: `open(name)`, `delete(name)`. */
function namedCaches() {
  const stores = new Map();
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return { put: async (url, res) => void m.set(url, res), match: async (url) => m.get(url)?.clone(), delete: async (url) => m.delete(url) };
  };
  return { caches: { open, delete: async (name) => stores.delete(name) }, stores };
}

test('F1: the logos live in a store of their own: clearing either cache never deletes the other cache blobs', async () => {
  const n = namedCaches();
  const posters = createPosterCache({ storage: memoryStorage(), caches: n.caches });
  const logos = createPosterCache({ storage: memoryStorage(), caches: logosIn(n.caches) });
  assert.equal(logos.available, true);
  const put = async () => {
    await posters.put({ ratingKey: '41', title: 'A', thumb: '/a' }, new Blob(['poster']), SIZE);
    await logos.put({ ratingKey: 'tmdb-logo:movie:603', title: 'A', thumb: 'tmdb-art:movie:603:logo-en' }, new Blob(['logo']), SIZE);
  };
  await put();
  await logos.clear();
  assert.deepEqual([posters.entries().length, logos.entries().length], [1, 0]);
  assert.equal(await read(await posters.get('41')), 'poster', 'the poster blob stays when the logos are cleared');
  await put();
  await posters.clear();
  assert.deepEqual([posters.entries().length, logos.entries().length], [0, 1]);
  assert.equal(await read(await logos.get('tmdb-logo:movie:603')), 'logo', 'the logo blob stays when the posters are cleared');
  assert.notEqual(logosIn(n.caches), n.caches);
  assert.equal(logosIn(undefined), undefined, 'no Cache API: the logo cache is as unavailable as the poster cache');
});
