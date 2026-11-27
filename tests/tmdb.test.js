// The TMDB adapter (js/sources/tmdb.js, R-TMDB-1, R-TMDB-2, D203, D209, D210) against a stubbed TMDB: a table of what each request answers, with every request
// recorded. Nothing here reaches a real TMDB; the browser specs (tests/e2e/tmdb.spec.mjs) use the mock server in scripts/mock-tmdb.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { allows } from '../js/ratings.js';
import { createSource, createSources, signInFlow, SourceError } from '../js/sources/index.js';
import {
  CREDIT,
  DEFAULT_LIBRARY,
  LISTS,
  MAX_LOOKUPS,
  MAX_PAGES,
  certificationOf,
  createTmdbClient,
  discoverKey,
  headerSafe,
  keyForm,
  libraryChoices,
  parseRatingKey,
  sourceOf,
  validYear,
} from '../js/sources/tmdb.js';

const V3 = '0123456789abcdef0123456789abcdef';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ0ZXN0In0.read-access-token';

// ---- a stubbed TMDB ----

const movie = (id, extra = {}) => ({ id, title: `Movie ${id}`, poster_path: `/p${id}.jpg`, release_date: '2020-05-01', genre_ids: [35], overview: 'A story.', vote_average: 7.1, adult: false, ...extra });
const show = (id, extra = {}) => ({ id, name: `Show ${id}`, poster_path: `/s${id}.jpg`, first_air_date: '2021-02-01', genre_ids: [18], overview: 'A series.', vote_average: 6.2, ...extra });
/** A US entry of a movie's `release_dates`: one date per certification given. */
const usDates = (...certs) => ({ iso_3166_1: 'US', release_dates: certs.map((certification) => ({ certification, type: 3, descriptors: [], iso_639_1: '', note: '', release_date: '2020-01-01T00:00:00.000Z' })) });
const gbDates = (...certs) => ({ ...usDates(...certs), iso_3166_1: 'GB' });
const usRating = (rating) => ({ iso_3166_1: 'US', rating, descriptors: [] });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

/**
 * A fetch stand-in. `pages` is `{ 'movie/popular': [[item, ...], [item, ...]] }` (a page each), `certs` is `{ 'movie:1': [entries], 'tv:2': [entries] }`, `fail` is
 * `{ 'movie:3': 429 | 'network' }` for a certification lookup, and `when(path, params)` may answer a request first (a Response, or undefined to carry on).
 */
function stubTmdb({ pages = {}, certs = {}, fail = {}, genres = {}, companies = {}, found = {}, when = () => undefined, auth = true } = {}) {
  const calls = [];
  let inFlight = 0;
  let peak = 0;
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/3\//, '');
    const params = Object.fromEntries(u.searchParams);
    const headers = init.headers || {};
    calls.push({ url: u.toString(), host: u.host, path, params, headers, method: init.method });
    const answered = when(path, params, headers);
    if (answered !== undefined) return answered;
    if (path === 'authentication') return json({ success: true, status_code: 1 });
    const genre = /^genre\/(movie|tv)\/list$/.exec(path);
    if (genre) return json({ genres: genres[genre[1]] ?? [{ id: 35, name: 'Comedy' }, { id: 18, name: 'Drama' }, { id: 28, name: 'Action' }] });
    const detail = /^(movie|tv)\/(\d+)$/.exec(path);
    // Every title's details (D215 1): its certifications ride along and, with `companies` (`{ 'movie:1': [3, 41077] }`, or null for a reply that names none), its production companies. A title in none of `certs`, `companies`, `fail` is a 404.
    const readable = detail && ((`${detail[1]}:${detail[2]}` in companies) || Array.isArray(certs[`${detail[1]}:${detail[2]}`]) || `${detail[1]}:${detail[2]}` in fail);
    if (readable) {
      const id = `${detail[1]}:${detail[2]}`;
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (fail[id] === 'network') throw new TypeError('Failed to fetch');
      if (fail[id]) return json({ status_code: 25 }, fail[id]);
      const own = companies[id];
      return json({ id: Number(detail[2]), ...(own ? { production_companies: own.map((c) => ({ id: c, name: `Company ${c}` })) } : {}), ...(id in certs ? { [detail[1] === 'movie' ? 'release_dates' : 'content_ratings']: { results: certs[id] } } : {}) });
    }
    if (path === 'search/company') return json({ page: 1, results: found[params.query] ?? [], total_pages: 1, total_results: (found[params.query] ?? []).length });
    if (detail) return certs[`${detail[1]}:${detail[2]}`]?.details ? json(certs[`${detail[1]}:${detail[2]}`].details) : json({ status_code: 34 }, 404);
    const list = pages[path];
    if (list) {
      const n = Math.max(1, Number(params.page) || 1);
      return json({ page: n, results: list[n - 1] ?? [], total_pages: list.length, total_results: list.flat().length });
    }
    return json({ status_code: 34 }, 404);
  };
  return { fetchImpl, calls, get peak() { return peak; }, listCalls: () => calls.filter((c) => !/^(movie|tv)\/\d+/.test(c.path) && !c.path.startsWith('genre/') && !c.path.startsWith('search/') && c.path !== 'authentication'), lookups: () => calls.filter((c) => /^(movie|tv)\/\d+$/.test(c.path)) };
}
const client = (stub, ...key) => createTmdbClient({ key: key.length ? key[0] : TOKEN, fetchImpl: stub.fetchImpl }); // an explicit undefined is no key
const keys = (posters) => posters.map((p) => p.ratingKey);

// ---- the key (D203 3, D210 4) ----

test('keyForm: 32 hex characters after trim and a leading Bearer is a v3 key; anything else is the read access token', () => {
  const table = [
    [V3, 'v3', V3],
    [`  ${V3}\n`, 'v3', V3],
    [V3.toUpperCase(), 'v3', V3.toUpperCase()],
    [`Bearer ${V3}`, 'v3', V3],
    [`bearer   ${V3}`, 'v3', V3],
    [`  Bearer ${TOKEN}`, 'token', TOKEN], // the space before Bearer goes first, or the prefix would stay
    [`\t Bearer ${V3} \n`, 'v3', V3],
    [TOKEN, 'token', TOKEN],
    [`Bearer ${TOKEN}`, 'token', TOKEN],
    [`BEARER ${TOKEN}  `, 'token', TOKEN],
    [V3.slice(1), 'token', V3.slice(1)], // 31 characters
    [`${V3}0`, 'token', `${V3}0`], // 33 characters
    [`${V3.slice(1)}g`, 'token', `${V3.slice(1)}g`], // 32 characters, one not hex
    ['Bearerx', 'token', 'Bearerx'],
    ['', '', ''],
    ['   ', '', ''],
    ['Bearer ', '', ''],
    [undefined, '', ''],
    [42, '', ''],
  ];
  for (const [raw, kind, value] of table) assert.deepEqual(keyForm(raw), { kind, value }, JSON.stringify(raw));
});

test('the key goes as Authorization: Bearer for a token and as api_key for a v3 key, on every API request, with one Bearer prefix and no other form', async () => {
  const table = [
    [TOKEN, { header: `Bearer ${TOKEN}` }],
    [`Bearer ${TOKEN}`, { header: `Bearer ${TOKEN}` }],
    [` ${TOKEN} `, { header: `Bearer ${TOKEN}` }],
    ['some other string', { header: 'Bearer some other string' }],
    [V3, { apiKey: V3 }],
    [`  ${V3}  `, { apiKey: V3 }],
    [`Bearer ${V3}`, { apiKey: V3 }],
  ];
  for (const [typed, want] of table) {
    const stub = stubTmdb({ pages: { 'movie/popular': [[movie(1)]] }, certs: { 'movie:1': [usDates('PG')] } });
    const source = client(stub, typed);
    await source.identity();
    await source.pool({ libraryKey: 'movie/popular' });
    await source.genres('movie/popular').catch(() => {});
    assert.ok(stub.calls.length >= 3, typed);
    for (const call of stub.calls) {
      assert.equal(call.host, 'api.themoviedb.org', 'only TMDB is asked');
      assert.equal(call.headers.Authorization, want.header, `${typed}: ${call.path}`);
      assert.equal(call.params.api_key, want.apiKey, `${typed}: ${call.path}`);
      assert.ok(!('Authorization' in call.headers) || !('api_key' in call.params), 'never both');
      assert.ok(!call.url.includes(want.header ?? '\0'), 'a token is never in an address');
    }
  }
});

test('with no key the adapter asks nothing and says auth', async () => {
  for (const key of [undefined, '', '  ', 'Bearer ']) {
    const stub = stubTmdb();
    await assert.rejects(client(stub, key).identity(), (e) => e instanceof SourceError && e.kind === 'auth');
    await assert.rejects(client(stub, key).pool({ libraryKey: DEFAULT_LIBRARY }), (e) => e.kind === 'auth');
    assert.equal(stub.calls.length, 0);
  }
});

// ---- Test connection (D210 4) ----

test('Test connection asks GET /3/authentication; 200 with success true is connected', async () => {
  const stub = stubTmdb();
  const id = await client(stub).identity();
  assert.equal(id.name, 'TMDB');
  assert.deepEqual(stub.calls.map((c) => [c.method, c.path]), [['GET', 'authentication']]);
});

test('Test connection: 401, 403 and success:false are kind auth; 429, a server error, a network failure and a timeout are not', async () => {
  const answer = (status, body = { success: false }) => stubTmdb({ when: () => json(body, status) });
  for (const status of [401, 403]) await assert.rejects(client(answer(status)).identity(), (e) => e.kind === 'auth' && e.status === status, String(status));
  await assert.rejects(client(answer(200, { success: false })).identity(), (e) => e.kind === 'auth');
  await assert.rejects(client(answer(200, {})).identity(), (e) => e.kind === 'auth', 'a 200 that does not say success is no connection');
  for (const status of [429, 500, 503, 404]) await assert.rejects(client(answer(status)).identity(), (e) => e.kind === 'http' && e.status === status && e.kind !== 'auth', String(status));
  const down = createTmdbClient({ key: TOKEN, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(down.identity(), (e) => e.kind === 'network');
  const slow = createTmdbClient({ key: TOKEN, fetchImpl: async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); } });
  await assert.rejects(slow.identity(), (e) => e.kind === 'timeout');
  await assert.rejects(client(stubTmdb({ when: () => new Response('<html>', { status: 200 }) })).identity(), (e) => e.kind === 'parse');
});

test('an error names TMDB and never carries the key or an address', async () => {
  for (const key of [TOKEN, V3]) {
    for (const status of [401, 429, 503]) {
      const e = await client(stubTmdb({ when: () => json({}, status) }), key).identity().catch((err) => err);
      assert.match(e.message, /TMDB/);
      assert.ok(!e.message.includes(key) && !e.message.includes('api_key') && !e.message.includes('http'), e.message);
    }
  }
});

// ---- each list choice maps to its endpoint; include_adult=false on every request (D203, D210 8, 10) ----

test('each list choice asks its own endpoint, with include_adult=false, language en-US, and region US only on now_playing and upcoming', async () => {
  const want = {
    'movie/popular': 'movie/popular',
    'movie/top_rated': 'movie/top_rated',
    'movie/now_playing': 'movie/now_playing',
    'movie/upcoming': 'movie/upcoming',
    'tv/popular': 'tv/popular',
    'tv/on_the_air': 'tv/on_the_air',
    'tv/airing_today': 'tv/airing_today',
  };
  assert.deepEqual(LISTS.map((l) => l.key), Object.keys(want));
  assert.equal(DEFAULT_LIBRARY, 'movie/popular');
  for (const [key, path] of Object.entries(want)) {
    const stub = stubTmdb({ pages: { [path]: [[key.startsWith('tv') ? show(5) : movie(5)]] }, certs: { [`${key.startsWith('tv') ? 'tv' : 'movie'}:5`]: [key.startsWith('tv') ? usRating('TV-PG') : usDates('PG')] } });
    const posters = await client(stub).pool({ libraryKey: key });
    assert.deepEqual(keys(posters), [`${key.startsWith('tv') ? 'tv' : 'movie'}:5`], key);
    const [asked] = stub.listCalls();
    assert.equal(asked.path, path);
    assert.equal(asked.params.include_adult, 'false', `${key}: include_adult=false`);
    assert.equal(asked.params.language, 'en-US');
    assert.equal(asked.params.page, '1');
    assert.equal(asked.params.region, key === 'movie/now_playing' || key === 'movie/upcoming' ? 'US' : undefined, key);
  }
});

test('a key that is no list or Discover choice is a config error and asks nothing', async () => {
  for (const key of ['1', '', undefined, 'movie/popular?x=1', 'discover/person', '@abc/1', 'tv/top_rated']) {
    const stub = stubTmdb();
    await assert.rejects(client(stub).pool({ libraryKey: key }), (e) => e.kind === 'config', String(key));
    assert.equal(stub.calls.length, 0);
  }
});

test('a result with adult: true is dropped, whatever its certification, and so is one with no poster file or of the other type', async () => {
  const stub = stubTmdb({
    pages: { 'movie/popular': [[movie(1, { adult: true }), movie(2), movie(3, { poster_path: null }), movie(4, { poster_path: '' }), movie(5, { poster_path: 'p.jpg' }), movie(6, { media_type: 'tv' }), movie(7, { adult: 'yes' }), 'x', null, movie('a')]] },
    certs: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((id) => [`movie:${id}`, [usDates('PG')]])),
  });
  const posters = await client(stub).pool({ libraryKey: 'movie/popular', maxContentRating: 'PG' });
  assert.deepEqual(keys(posters), ['movie:2', 'movie:7'], 'adult:true is gone; adult: "yes" is not the flag and the PG title stays');
  assert.ok(!stub.lookups().some((c) => c.path === 'movie/1'), 'no lookup is spent on an adult title');
});

// ---- Discover (D210 8, 9, 10) ----

const discoverStub = (type = 'movie') => stubTmdb({ pages: { [`discover/${type}`]: [[type === 'movie' ? movie(1) : show(1)]] }, certs: { [`${type}:1`]: [type === 'movie' ? usDates('PG') : usRating('TV-PG')] } });
const discoverCall = async (key, request = {}, type = 'movie') => {
  const stub = discoverStub(type);
  await client(stub).pool({ libraryKey: key, ...request });
  return stub.listCalls()[0];
};

test('Discover movies: popularity.desc, region US, language en-US, include_adult=false, no genre or year parameter when none is chosen', async () => {
  const call = await discoverCall('discover/movie');
  assert.equal(call.path, 'discover/movie');
  assert.deepEqual(call.params, { language: 'en-US', include_adult: 'false', page: '1', sort_by: 'popularity.desc', region: 'US' });
});

test('Discover maps the ticked genres (TMDB genre ids): a pipe for OR (the default), a comma for AND', async () => {
  assert.equal((await discoverCall('discover/movie', { genres: ['35', '18'] })).params.with_genres, '35|18');
  assert.equal((await discoverCall('discover/movie?mode=or', { genres: ['35', '18'] })).params.with_genres, '35|18');
  assert.equal((await discoverCall('discover/movie?mode=and', { genres: ['35', '18'] })).params.with_genres, '35,18');
  assert.equal((await discoverCall('discover/tv?mode=and', { genres: ['35', '18'] }, 'tv')).params.with_genres, '35,18');
  assert.equal((await discoverCall('discover/movie?mode=and', { genres: ['35'] })).params.with_genres, '35');
  assert.ok(!('with_genres' in (await discoverCall('discover/movie?mode=and', { genres: [] })).params), 'no genre ticked sends none (D209 3)');
});

test('Discover maps the years, inclusive, on primary_release_date for movies and first_air_date for shows, from YYYY-01-01 to YYYY-12-31', async () => {
  const movies = (await discoverCall('discover/movie?from=2010&to=2020')).params;
  assert.equal(movies['primary_release_date.gte'], '2010-01-01');
  assert.equal(movies['primary_release_date.lte'], '2020-12-31');
  const shows = (await discoverCall('discover/tv?from=2010&to=2020', {}, 'tv')).params;
  assert.equal(shows['first_air_date.gte'], '2010-01-01');
  assert.equal(shows['first_air_date.lte'], '2020-12-31');
  assert.ok(!('primary_release_date.gte' in shows) && !('first_air_date.gte' in movies));
  const onlyFrom = (await discoverCall('discover/movie?from=2015')).params;
  assert.equal(onlyFrom['primary_release_date.gte'], '2015-01-01');
  assert.ok(!('primary_release_date.lte' in onlyFrom));
  const onlyTo = (await discoverCall('discover/movie?to=2015')).params;
  assert.equal(onlyTo['primary_release_date.lte'], '2015-12-31');
  assert.ok(!('primary_release_date.gte' in onlyTo));
  const same = (await discoverCall('discover/movie?from=2015&to=2015')).params;
  assert.deepEqual([same['primary_release_date.gte'], same['primary_release_date.lte']], ['2015-01-01', '2015-12-31']);
});

test('Discover: From later than To is swapped (From 2020, To 2010 is 2010 to 2020), for movies and for shows', async () => {
  const movies = (await discoverCall('discover/movie?from=2020&to=2010')).params;
  assert.equal(movies['primary_release_date.gte'], '2010-01-01');
  assert.equal(movies['primary_release_date.lte'], '2020-12-31');
  const shows = (await discoverCall('discover/tv?from=2020&to=2010', {}, 'tv')).params;
  assert.equal(shows['first_air_date.gte'], '2010-01-01');
  assert.equal(shows['first_air_date.lte'], '2020-12-31');
});

test('Discover: a year that is not four digits is no year; the key round-trips', () => {
  for (const bad of ['', '20', '20100', 'abcd', '2010x', '-2010', '1799', '2201']) assert.deepEqual([sourceOf(`discover/movie?from=${bad}`).from, sourceOf(`discover/movie?to=${bad}`).to], ['', ''], bad);
  assert.deepEqual(sourceOf('discover/movie'), { kind: 'discover', type: 'movie', path: 'discover/movie', mode: 'or', from: '', to: '' });
  assert.deepEqual(sourceOf('discover/tv?mode=and&from=2001&to=2005'), { kind: 'discover', type: 'tv', path: 'discover/tv', mode: 'and', from: '2001', to: '2005' });
  assert.equal(sourceOf('discover/movie?mode=nonsense').mode, 'or');
  for (const choice of [{ type: 'movie' }, { type: 'tv', mode: 'and' }, { type: 'movie', from: '2010', to: '2020' }, { type: 'tv', mode: 'and', from: '1990' }, { type: 'movie', to: '2000' }]) {
    const key = discoverKey(choice);
    const back = sourceOf(key);
    assert.equal(back.type, choice.type);
    assert.equal(back.mode, choice.mode ?? 'or');
    assert.equal(back.from, choice.from ?? '');
    assert.equal(back.to, choice.to ?? '');
  }
  assert.equal(discoverKey(), 'discover/movie');
  assert.equal(discoverKey({ type: 'tv', mode: 'and', from: '2000', to: 'x' }), 'discover/tv?mode=and&from=2000');
});

test('Discover narrows movies server-side by certification.lte under a limit, and only movies; the narrowing alone decides nothing', async () => {
  assert.deepEqual([(await discoverCall('discover/movie', { maxContentRating: 'PG' })).params.certification_country, (await discoverCall('discover/movie', { maxContentRating: 'PG' })).params['certification.lte']], ['US', 'PG']);
  assert.ok(!('certification.lte' in (await discoverCall('discover/movie')).params), 'no limit, no narrowing');
  assert.ok(!('certification.lte' in (await discoverCall('discover/tv', { maxContentRating: 'PG' }, 'tv')).params), 'discover/tv has none');
  // The server lets an R title through (a server that ignored the parameter): it is read and refused all the same.
  const stub = stubTmdb({ pages: { 'discover/movie': [[movie(1), movie(2)]] }, certs: { 'movie:1': [usDates('PG')], 'movie:2': [usDates('R')] } });
  assert.deepEqual(keys(await client(stub).pool({ libraryKey: 'discover/movie', maxContentRating: 'PG' })), ['movie:1']);
});

test('Discover genre ids work for TV as for movies: the show list is asked for its own genres', async () => {
  const stub = stubTmdb({ genres: { tv: [{ id: 16, name: 'Animation' }] } });
  assert.deepEqual(await client(stub).genres('discover/tv'), [{ key: '16', title: 'Animation' }]);
  assert.equal(stub.calls[0].path, 'genre/tv/list');
  const movies = stubTmdb();
  assert.deepEqual((await client(movies).genres('discover/movie')).map((g) => g.title), ['Comedy', 'Drama', 'Action']);
  assert.equal(movies.calls[0].path, 'genre/movie/list');
  assert.equal(movies.calls[0].params.language, 'en-US');
});

test('Discover with genres: the posters carry their genre names, and a genre list that cannot be read fails the pool', async () => {
  const stub = stubTmdb({ pages: { 'discover/movie': [[movie(1, { genre_ids: [35, 18] })]] }, certs: { 'movie:1': [usDates('PG')] } });
  const [p] = await client(stub).pool({ libraryKey: 'discover/movie', genres: ['35'] });
  assert.deepEqual(p.genres, ['Comedy', 'Drama']);
  const broken = stubTmdb({ pages: { 'discover/movie': [[movie(1)]] }, certs: { 'movie:1': [usDates('PG')] }, when: (path) => (path.startsWith('genre/') ? json({}, 500) : undefined) });
  await assert.rejects(client(broken).pool({ libraryKey: 'discover/movie', genres: ['35'] }), (e) => e.kind === 'http');
});

test('a list takes the ticked genres client-side, before any certification is read', async () => {
  const stub = stubTmdb({
    pages: { 'movie/popular': [[movie(1, { genre_ids: [35] }), movie(2, { genre_ids: [28] }), movie(3, { genre_ids: [28, 35] }), movie(4, { genre_ids: [] }), movie(5, {})]] },
    certs: Object.fromEntries([1, 2, 3, 4, 5].map((id) => [`movie:${id}`, [usDates('PG')]])),
  });
  const posters = await client(stub).pool({ libraryKey: 'movie/popular', genres: ['35'] });
  assert.deepEqual(keys(posters), ['movie:1', 'movie:3', 'movie:5']);
  assert.ok(!('with_genres' in stub.listCalls()[0].params), 'a list has no genre parameter');
  assert.deepEqual(stub.lookups().map((c) => c.path).sort(), ['movie/1', 'movie/3', 'movie/5']);
});

// ---- the certification (D203 4, D209 1, D210 1, 3) ----

test('certificationOf: a movie reads the US release_dates only, a show the US content_ratings only; the strictest non-empty value counts', () => {
  const movieTable = [
    [[usDates('PG')], 'PG'],
    [[gbDates('15'), usDates('R')], 'R'], // T1: a GB entry listed first is not read
    [[gbDates('U'), usDates('PG-13')], 'PG-13'],
    [[gbDates('18')], ''], // no US entry
    [[], ''],
    [[usDates('')], ''],
    [[usDates('', '')], ''],
    [[usDates('PG-13', 'R')], 'R'], // D210 1, theatrical first
    [[usDates('R', 'PG-13')], 'R'], // and last
    [[usDates('PG-13'), usDates('R')], 'R'], // in two US entries
    [[usDates('', 'PG', '', 'PG-13')], 'PG-13'],
    [[usDates('G', 'PG', 'NC-17', 'R')], 'NC-17'],
    [[usDates('PG', 'NR')], 'NR'], // an unknown value beats the ladder: refused under any limit
    [[usDates('R', 'Unrated')], 'Unrated'],
    [[usDates(' PG ')], 'PG'],
    [[usDates('TV-MA')], 'TV-MA'],
    [[usDates(null, undefined, 5, 'PG')], 'PG'],
  ];
  for (const [results, want] of movieTable) assert.equal(certificationOf('movie', { results }), want, JSON.stringify(results));
  const tvTable = [
    [[usRating('TV-14')], 'TV-14'],
    [[{ iso_3166_1: 'GB', rating: '15' }, usRating('TV-MA')], 'TV-MA'],
    [[{ iso_3166_1: 'GB', rating: '15' }], ''],
    [[usRating('')], ''],
    [[], ''],
    [[usRating('TV-PG'), usRating('TV-MA')], 'TV-MA'],
    [[usRating('TV-Y7-FV')], 'TV-Y7-FV'], // unknown
    [[usRating(undefined)], ''],
  ];
  for (const [results, want] of tvTable) assert.equal(certificationOf('tv', { results }), want, JSON.stringify(results));
  for (const bad of [undefined, null, {}, { results: 'x' }, { results: [null, 5, 'US'] }]) assert.equal(certificationOf('movie', bad), '');
});

test('a title on the ladder is allowed or refused by allows(); "", a missing US entry and an unknown string are unrated and refused while a limit is set', async () => {
  const table = [
    ['G', 'G', true], ['PG', 'PG', true], ['PG-13', 'PG', false], ['R', 'PG-13', false], ['NC-17', 'R', false], ['TV-MA', 'PG', false], // a movie whose only US value is TV-MA is R
    ['', 'NC-17', false], [undefined, 'NC-17', false], ['NR', 'NC-17', false], ['Not Rated', 'NC-17', false], ['PG13', 'NC-17', false], ['X', 'NC-17', false],
  ];
  for (const [cert, limit, shown] of table) {
    const stub = stubTmdb({ pages: { 'movie/popular': [[movie(1)]] }, certs: { 'movie:1': [cert === undefined ? gbDates('PG') : usDates(cert)] } });
    const [p] = await client(stub).pool({ libraryKey: 'movie/popular' });
    assert.equal(p.contentRating, cert ?? '', `${cert}: the poster says what TMDB gave`);
    assert.equal(allows(limit, p.contentRating), shown, `${cert} at ${limit}`);
    const under = await client(stub).pool({ libraryKey: 'movie/popular', maxContentRating: limit });
    assert.equal(under.length, shown ? 1 : 0, `${cert} at ${limit}: the pool agrees`);
  }
});

test('a show: its US content_ratings rating on the TV ladder; TV-MA at limit PG is refused (T15), TV-14 is PG-13, an unrated show is refused', async () => {
  const stub = stubTmdb({
    pages: { 'tv/popular': [[show(1), show(2), show(3), show(4), show(5)]] },
    certs: { 'tv:1': [usRating('TV-Y7')], 'tv:2': [usRating('TV-MA')], 'tv:3': [usRating('TV-14')], 'tv:4': [{ iso_3166_1: 'GB', rating: '12' }], 'tv:5': [usRating('')] },
  });
  assert.deepEqual(keys(await client(stub).pool({ libraryKey: 'tv/popular', maxContentRating: 'PG' })), ['tv:1']);
  assert.deepEqual(keys(await client(stub).pool({ libraryKey: 'tv/popular', maxContentRating: 'PG-13' })), ['tv:1', 'tv:3']);
  assert.deepEqual(keys(await client(stub).pool({ libraryKey: 'tv/popular', maxContentRating: 'NC-17' })), ['tv:1', 'tv:2', 'tv:3']);
  assert.equal((await client(stub).pool({ libraryKey: 'tv/popular' })).length, 5, 'no limit: everything, rated or not');
  assert.ok(stub.lookups().every((c) => /^tv\/\d+$/.test(c.path) && c.params.append_to_response === 'content_ratings'), 'a show is read at its details with content_ratings appended');
});

test('every list and Discover title is read before it can be shown: the lookup is made for each, movie or show (D210 3)', async () => {
  for (const [key, type, make, cert] of [['movie/top_rated', 'movie', movie, usDates('PG')], ['discover/movie', 'movie', movie, usDates('PG')], ['tv/airing_today', 'tv', show, usRating('TV-Y')], ['discover/tv', 'tv', show, usRating('TV-Y')]]) {
    const stub = stubTmdb({ pages: { [key]: [[make(1), make(2), make(3)]] }, certs: { [`${type}:1`]: [cert], [`${type}:2`]: [cert], [`${type}:3`]: [cert] } });
    await client(stub).pool({ libraryKey: key });
    assert.deepEqual(stub.lookups().map((c) => c.path).sort(), [1, 2, 3].map((id) => `${type}/${id}`), key);
    assert.ok(stub.lookups().every((c) => c.params.append_to_response === (type === 'movie' ? 'release_dates' : 'content_ratings')), key);
    assert.ok(!stub.calls.some((c) => /\/(release_dates|content_ratings)$/.test(c.path)), 'no separate certification request');
  }
});

test('T1 US only: GB 15 listed before US R at limit PG-13 is refused; the GB entry never decides', async () => {
  const stub = stubTmdb({ pages: { 'movie/popular': [[movie(1), movie(2)]] }, certs: { 'movie:1': [gbDates('15'), usDates('R')], 'movie:2': [gbDates('18'), usDates('PG')] } });
  assert.deepEqual(keys(await client(stub).pool({ libraryKey: 'movie/popular', maxContentRating: 'PG-13' })), ['movie:2']);
});

test('T7 strictest: US PG-13 and R at limit PG-13 is refused, in either order and across entries', async () => {
  const stub = stubTmdb({
    pages: { 'movie/popular': [[movie(1), movie(2), movie(3), movie(4)]] },
    certs: { 'movie:1': [usDates('PG-13', 'R')], 'movie:2': [usDates('R', 'PG-13')], 'movie:3': [usDates('PG-13'), usDates('R')], 'movie:4': [usDates('', 'PG-13', 'PG')] },
  });
  assert.deepEqual(keys(await client(stub).pool({ libraryKey: 'movie/popular', maxContentRating: 'PG-13' })), ['movie:4']);
  assert.deepEqual(keys(await client(stub).pool({ libraryKey: 'movie/popular', maxContentRating: 'R' })), ['movie:1', 'movie:2', 'movie:3', 'movie:4']);
});

test('the rating subset keeps the ticked rungs under the limit; none ticked is no subset', async () => {
  const stub = stubTmdb({ pages: { 'movie/popular': [[movie(1), movie(2), movie(3)]] }, certs: { 'movie:1': [usDates('G')], 'movie:2': [usDates('PG')], 'movie:3': [usDates('R')] } });
  assert.deepEqual(keys(await client(stub).pool({ libraryKey: 'movie/popular', ratings: ['PG', 'R'] })), ['movie:2', 'movie:3']);
  assert.deepEqual(keys(await client(stub).pool({ libraryKey: 'movie/popular', ratings: ['PG', 'R'], maxContentRating: 'PG' })), ['movie:2'], 'the limit is a ceiling over the subset');
  assert.deepEqual(keys(await client(stub).pool({ libraryKey: 'movie/popular', ratings: [] })), ['movie:1', 'movie:2', 'movie:3']);
});

// ---- a failed lookup (D210 2) ----

test('T8 a failed certification lookup (429, a server error, a network failure) hides its title while a limit is set; the rest of the pool is kept and marked partial', async () => {
  for (const failure of [429, 500, 503, 'network']) {
    const stub = stubTmdb({ pages: { 'movie/popular': [[movie(1), movie(2), movie(3)]] }, certs: { 'movie:1': [usDates('PG')], 'movie:2': [usDates('PG')], 'movie:3': [usDates('PG')] }, fail: { 'movie:2': failure } });
    const limited = await client(stub).pool({ libraryKey: 'movie/popular', maxContentRating: 'PG' });
    assert.deepEqual(keys(limited), ['movie:1', 'movie:3'], String(failure));
    assert.equal(limited.partial, true, 'the pool says it is incomplete, so it is asked for again soon');
    assert.deepEqual(keys(await client(stub).pool({ libraryKey: 'movie/popular', ratings: ['PG'] })), ['movie:1', 'movie:3'], 'a rating subset hides it too');
  }
});

test('a failed lookup with no limit set still shows the title, unrated, and marks the pool partial; it is read again at the next build', async () => {
  const fail = { 'movie:2': 429 };
  const stub = stubTmdb({ pages: { 'movie/popular': [[movie(1), movie(2)]] }, certs: { 'movie:1': [usDates('PG')], 'movie:2': [usDates('R')] }, fail });
  const first = await client(stub).pool({ libraryKey: 'movie/popular' });
  assert.deepEqual(first.map((p) => [p.ratingKey, p.contentRating]), [['movie:1', 'PG'], ['movie:2', '']]);
  assert.equal(first.partial, true);
  delete fail['movie:2'];
  const again = await client(stub).pool({ libraryKey: 'movie/popular', maxContentRating: 'R' });
  assert.deepEqual(keys(again), ['movie:1', 'movie:2'], 'looked up again, it is rated now');
  assert.equal(again.partial, false);
});

test('a pool with every certification lookup failing and nothing to show throws the first failure; a title with no certification record (404) is unrated, not a failure', async () => {
  const stub = stubTmdb({ pages: { 'movie/popular': [[movie(1), movie(2)]] }, certs: { 'movie:1': [usDates('PG')], 'movie:2': [usDates('PG')] }, fail: { 'movie:1': 429, 'movie:2': 429 } });
  await assert.rejects(client(stub).pool({ libraryKey: 'movie/popular', maxContentRating: 'PG' }), (e) => e.kind === 'http' && e.status === 429);
  const none = stubTmdb({ pages: { 'movie/popular': [[movie(1)]] }, certs: {} });
  const unrated = await client(none).pool({ libraryKey: 'movie/popular', maxContentRating: 'PG' });
  assert.deepEqual([unrated.length, unrated.partial], [0, false], 'no record: unrated and refused, and asking again would not help');
  assert.equal((await client(none).pool({ libraryKey: 'movie/popular' })).partial, false);
});

test('a list page that fails after the first ends the pool there, partial; the first page failing throws', async () => {
  const pages = { 'movie/popular': [[movie(1)], [movie(2)]] };
  const certs = { 'movie:1': [usDates('PG')], 'movie:2': [usDates('PG')] };
  const second = stubTmdb({ pages, certs, when: (path, params) => (path === 'movie/popular' && params.page === '2' ? json({}, 503) : undefined) });
  const kept = await client(second).pool({ libraryKey: 'movie/popular', size: 10 });
  assert.deepEqual([keys(kept), kept.partial], [['movie:1'], true]);
  await assert.rejects(client(stubTmdb({ pages, certs, when: (path) => (path === 'movie/popular' ? json({}, 503) : undefined) })).pool({ libraryKey: 'movie/popular' }), (e) => e.kind === 'http' && e.status === 503);
  await assert.rejects(client(stubTmdb({ pages, certs, when: (path) => (path === 'movie/popular' ? json({}, 401) : undefined) })).pool({ libraryKey: 'movie/popular' }), (e) => e.kind === 'auth');
  await assert.rejects(client(stubTmdb({ pages, certs, when: (path) => (path === 'movie/popular' ? json({ page: 1 }) : undefined) })).pool({ libraryKey: 'movie/popular' }), (e) => e.kind === 'parse');
});

// ---- the pool: pages, duplicates, lookups at once (D210 11) ----

test('T13 at most five pages are fetched for a pool of 1000, and an id on two pages is counted once', async () => {
  assert.equal(MAX_PAGES, 5);
  const page = (n) => Array.from({ length: 20 }, (_, i) => movie(n * 100 + i));
  const pages = { 'movie/popular': Array.from({ length: 40 }, (_, n) => (n === 1 ? [movie(5), ...page(1).slice(1)] : page(n))) }; // page 2 repeats id 5 of page 1
  const certs = Object.fromEntries(Array.from({ length: 40 }, (_, n) => page(n)).flat().map((m) => [`movie:${m.id}`, [usDates('PG')]]));
  const stub = stubTmdb({ pages, certs });
  const posters = await client(stub).pool({ libraryKey: 'movie/popular', size: 1000 });
  assert.deepEqual(stub.listCalls().map((c) => c.params.page), ['1', '2', '3', '4', '5'], 'five pages and no sixth');
  assert.equal(posters.length, 99, '100 candidates, one repeated');
  assert.equal(new Set(keys(posters)).size, posters.length);
  assert.equal(stub.lookups().filter((c) => c.path === 'movie/5').length, 1, 'the repeat is not read twice');
});

test('the pool is filled to the size asked from as few pages as needed, and cut to it', async () => {
  const page = (n) => Array.from({ length: 20 }, (_, i) => movie(n * 100 + i));
  const pages = { 'movie/popular': [page(0), page(1), page(2)] };
  const certs = Object.fromEntries([0, 1, 2].flatMap((n) => page(n)).map((m) => [`movie:${m.id}`, [usDates('PG')]]));
  const small = stubTmdb({ pages, certs });
  assert.equal((await client(small).pool({ libraryKey: 'movie/popular', size: 15 })).length, 15);
  assert.equal(small.listCalls().length, 1);
  const more = stubTmdb({ pages, certs });
  assert.equal((await client(more).pool({ libraryKey: 'movie/popular', size: 30 })).length, 30);
  assert.equal(more.listCalls().length, 2);
  const short = stubTmdb({ pages, certs });
  assert.equal((await client(short).pool({ libraryKey: 'movie/popular', size: 500 })).length, 60, 'the list ends at its last page');
  assert.equal(short.listCalls().length, 3);
});

test('titles the limit refuses do not fill the pool: more pages are read until enough pass or the pages run out', async () => {
  const page = (n) => Array.from({ length: 20 }, (_, i) => movie(n * 100 + i));
  const certs = Object.fromEntries([0, 1].flatMap((n) => page(n)).map((m) => [`movie:${m.id}`, [usDates(m.id < 100 ? 'R' : 'PG')]]));
  const stub = stubTmdb({ pages: { 'movie/popular': [page(0), page(1)] }, certs });
  const posters = await client(stub).pool({ libraryKey: 'movie/popular', size: 10, maxContentRating: 'PG' });
  assert.equal(posters.length, 10);
  assert.ok(posters.every((p) => Number(p.tmdbId) >= 100));
  assert.equal(stub.listCalls().length, 2);
});

test('T11 at most four certification lookups are in flight at once, for 20 candidates, and all 20 are read', async () => {
  assert.equal(MAX_LOOKUPS, 4);
  const items = Array.from({ length: 20 }, (_, i) => movie(i + 1));
  const stub = stubTmdb({ pages: { 'movie/popular': [items] }, certs: Object.fromEntries(items.map((m) => [`movie:${m.id}`, [usDates('PG')]])) });
  const posters = await client(stub).pool({ libraryKey: 'movie/popular' });
  assert.equal(posters.length, 20);
  assert.equal(stub.lookups().length, 20);
  assert.ok(stub.peak <= 4, `peak ${stub.peak}`);
  assert.ok(stub.peak >= 2, 'the lookups do run side by side (the cap is a cap, not a queue of one)');
});

test('the four lookups at once are shared by the pool and the re-rating of cached titles on one adapter', async () => {
  const items = Array.from({ length: 12 }, (_, i) => movie(i + 1));
  const certs = Object.fromEntries(items.map((m) => [`movie:${m.id}`, [usDates('PG')]]));
  const stub = stubTmdb({ pages: { 'movie/popular': [items] }, certs });
  const source = client(stub);
  await Promise.all([source.pool({ libraryKey: 'movie/popular' }), source.items(items.map((m) => `movie:${m.id}`))]);
  assert.ok(stub.peak <= 4, `peak ${stub.peak}`);
});

// ---- the poster ----

test('a poster has the shape the engine and the cache read, with the TMDB id, and no key anywhere', async () => {
  const stub = stubTmdb({ pages: { 'movie/popular': [[movie(603, { title: 'The Matrix', release_date: '1999-03-30', overview: 'x'.repeat(400), vote_average: 8.2, genre_ids: [28, 35] })]] }, certs: { 'movie:603': [usDates('R')] } });
  const [p] = await client(stub, V3).pool({ libraryKey: 'movie/popular', genres: ['28'] });
  assert.equal(p.ratingKey, 'movie:603');
  assert.equal(p.title, 'The Matrix');
  assert.equal(p.year, '1999');
  assert.equal(p.thumb, '/p603.jpg');
  assert.equal(p.source, 'random');
  assert.equal(p.user, '');
  assert.equal(p.contentRating, 'R');
  assert.equal(p.duration, 0);
  assert.ok(p.summary.length <= 301 && p.summary.endsWith('…'));
  assert.deepEqual(p.genres, ['Action', 'Comedy']);
  assert.equal(p.audienceRating, 8.2);
  assert.equal(p.tmdbId, '603');
  assert.equal(p.tmdbType, 'movie');
  assert.ok(!JSON.stringify(p).includes(V3), 'the key is in no field of a poster, so in no cache entry');
  const [s] = await client(stubTmdb({ pages: { 'tv/popular': [[show(7, { name: 'Dark', first_air_date: '2017-12-01' })]] }, certs: { 'tv:7': [usRating('TV-MA')] } })).pool({ libraryKey: 'tv/popular' });
  assert.deepEqual([s.ratingKey, s.title, s.year, s.thumb, s.contentRating, s.tmdbType, s.tmdbId], ['tv:7', 'Dark', '2017', '/s7.jpg', 'TV-MA', 'tv', '7']);
});

test('T10 a poster image request carries no key: the address is TMDB\'s image host, the size follows the width, and the key is nowhere in it', () => {
  for (const key of [TOKEN, V3, `Bearer ${TOKEN}`]) {
    const source = createTmdbClient({ key, fetchImpl: async () => assert.fail('no request') });
    for (const [width, size] of [[50, 'w92'], [92, 'w92'], [93, 'w154'], [300, 'w342'], [500, 'w500'], [501, 'w780'], [780, 'w780'], [781, 'original'], [4000, 'original']]) {
      const url = source.imageUrl('/abc.jpg', { width, height: width * 1.5 });
      assert.equal(url, `https://image.tmdb.org/t/p/${size}/abc.jpg`, String(width));
      assert.ok(!url.includes(key) && !url.includes('api_key') && !url.includes('?'), url);
    }
  }
  const source = createTmdbClient({ key: V3 });
  assert.equal(source.imageUrl('/abc.jpg', {}), 'https://image.tmdb.org/t/p/w500/abc.jpg');
  for (const bad of ['//evil.test/x.jpg', '/../x.jpg', 'abc.jpg', '', undefined, '/a b.jpg', '/a?api_key=1']) assert.ok(!source.imageUrl(bad, { width: 300 }).includes(bad || '\0') || bad === '', `${bad} is not put in an address`);
});

test('the key is in no cache key: a poster\'s ratingKey and thumb are TMDB ids and files, whatever the key', async () => {
  for (const key of [TOKEN, V3]) {
    const stub = stubTmdb({ pages: { 'movie/popular': [[movie(1)]] }, certs: { 'movie:1': [usDates('PG')] } });
    const [p] = await client(stub, key).pool({ libraryKey: 'movie/popular' });
    assert.match(p.ratingKey, /^movie:\d+$/);
    assert.match(p.thumb, /^\/[A-Za-z0-9._-]+$/);
    assert.ok(!p.ratingKey.includes(key) && !p.thumb.includes(key));
  }
  assert.deepEqual(parseRatingKey('movie:603'), { type: 'movie', id: '603' });
  assert.deepEqual(parseRatingKey('tv:1'), { type: 'tv', id: '1' });
  for (const bad of ['603', 'movie:', 'movie:1a', 'person:1', '@x/movie:1', '', undefined, 'movie:1/../2']) assert.equal(parseRatingKey(bad), null, String(bad));
});

// ---- nothing is playing (D209 9) ----

test('nowPlaying and sessions say nothing is playing, and ask TMDB nothing', async () => {
  const stub = stubTmdb();
  const source = client(stub);
  assert.deepEqual(await source.sessions(), []);
  assert.equal(source.nowPlaying([], { username: '', includeEpisodes: true }), null);
  assert.equal(source.nowPlaying([{ NowPlayingItem: { Type: 'Movie' } }], {}), null);
  assert.equal(source.nowPlaying(undefined, undefined), null);
  assert.equal(stub.calls.length, 0);
  assert.equal(await source.libraryCount('movie/popular'), null);
  assert.deepEqual(await source.collections('movie/popular'), []);
  assert.deepEqual(await source.playlists(), []);
  await assert.rejects(source.sourceItems({ kind: 'collection', key: '1' }), (e) => e.kind === 'config');
  assert.equal(stub.calls.length, 0);
});

// ---- the choices, the adapter's wiring ----

test('libraries() offers the seven lists and the two Discover choices, as movie or show libraries', async () => {
  const libs = await client(stubTmdb()).libraries();
  assert.deepEqual(libs.map((l) => l.key), [...LISTS.map((l) => l.key), 'discover/movie', 'discover/tv']);
  assert.deepEqual(libs.map((l) => l.title).slice(0, 4), ['Popular', 'Top rated', 'Now playing in theatres', 'Upcoming']);
  assert.deepEqual(libs.filter((l) => l.type === 'show').map((l) => l.key), ['tv/popular', 'tv/on_the_air', 'tv/airing_today', 'discover/tv']);
  assert.deepEqual(libs, libraryChoices());
  for (const l of libs) assert.ok(sourceOf(l.key), l.key);
});

test('createSource and signInFlow build the TMDB adapter for serverType tmdb from tmdbKey alone', async () => {
  const stub = stubTmdb();
  const source = createSource({ serverType: 'tmdb', tmdbKey: V3, plexToken: 'plex-token-is-not-used', serverUrl: 'http://plex.test' }, { fetchImpl: stub.fetchImpl });
  assert.equal(source.label, 'TMDB');
  await source.identity();
  assert.equal(stub.calls[0].params.api_key, V3);
  assert.ok(!stub.calls[0].url.includes('plex'), 'the Plex token and address are not TMDB\'s');
  const flow = signInFlow({ serverType: 'tmdb' });
  assert.equal(flow.label, 'TMDB');
  assert.equal(flow.needsAddress, false);
  assert.equal(typeof flow.words.couldNotGet('x'), 'string');
  for (const m of ['label', 'identity', 'publicIdentity', 'libraries', 'libraryCount', 'sessions', 'pool', 'sourceItems', 'genres', 'houses', 'collections', 'playlists', 'item', 'items', 'imageUrl', 'nowPlaying']) assert.ok(m in source, m);
});

test('TMDB is never one of several servers: createSources builds no member for a tmdb entry', async () => {
  const stub = stubTmdb();
  const many = createSources({ serverType: 'plex', serverUrl: 'http://plex.test', plexToken: 't', serverId: 'abc', servers: [{ id: 'xyz', type: 'tmdb', url: 'http://x.test', token: V3, name: 'TMDB' }] }, { fetchImpl: stub.fetchImpl });
  await assert.rejects(many.libraries(), () => true);
  assert.ok(!stub.calls.some((c) => c.host === 'api.themoviedb.org'));
});

test('the credit sentence is TMDB\'s own wording (D203 1)', () => {
  assert.match(CREDIT, /uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB/);
});

// ---- item() and items() ----

test('item() reads one title\'s details and certifications in one request, for the pin', async () => {
  const details = { id: 603, title: 'The Matrix', poster_path: '/m.jpg', release_date: '1999-03-30', overview: 'A hacker.', vote_average: 8.2, adult: false, genres: [{ id: 28, name: 'Action' }], release_dates: { results: [gbDates('15'), usDates('R')] } };
  const stub = stubTmdb({ certs: { 'movie:603': { details } } });
  const p = await client(stub).item('movie:603');
  assert.deepEqual([p.ratingKey, p.title, p.year, p.thumb, p.contentRating, p.source, p.genres, p.tmdbId], ['movie:603', 'The Matrix', '1999', '/m.jpg', 'R', 'static', ['Action'], '603']);
  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].path, 'movie/603');
  assert.equal(stub.calls[0].params.append_to_response, 'release_dates');
  const tv = stubTmdb({ certs: { 'tv:5': { details: { id: 5, name: 'Dark', poster_path: '/d.jpg', first_air_date: '2017-12-01', content_ratings: { results: [usRating('TV-MA')] }, genres: [] } } } });
  const s = await client(tv).item('tv:5');
  assert.deepEqual([s.ratingKey, s.contentRating, tv.calls[0].params.append_to_response], ['tv:5', 'TV-MA', 'content_ratings']);
});

test('item() of a title TMDB no longer has, or one with no poster, or an id that is not ours, is an http 404 (a pin that ends)', async () => {
  const stub = stubTmdb({ certs: { 'movie:1': { details: { id: 1, title: 'No art', poster_path: null } } } });
  for (const id of ['movie:404', 'movie:1', 'plex-key', '603', 'tv:']) await assert.rejects(client(stub).item(id), (e) => e.kind === 'http' && e.status === 404, id);
  assert.equal(stub.calls.filter((c) => c.path === 'movie/404').length, 1);
  assert.equal(stub.calls.filter((c) => c.path.includes('plex')).length, 0, 'an id that is not ours is not asked about');
});

test('items() gives the current certification of each cached title; a title whose lookup failed is absent (stored unrated by the caller)', async () => {
  const stub = stubTmdb({ certs: { 'movie:1': [gbDates('18'), usDates('PG')], 'movie:2': [usDates('R')], 'movie:3': [usDates('PG')], 'tv:4': [usRating('TV-MA')], 'movie:5': [gbDates('PG')] }, fail: { 'movie:3': 429 } });
  const got = await client(stub).items(['movie:1', 'movie:2', 'movie:3', 'tv:4', 'movie:5', 'movie:1', 'junk', '77']);
  assert.deepEqual(got.map((p) => [p.ratingKey, p.contentRating]), [['movie:1', 'PG'], ['movie:2', 'R'], ['tv:4', 'TV-MA'], ['movie:5', '']]);
  assert.equal(stub.lookups().filter((c) => c.path === 'movie/1').length, 1, 'a repeated id is asked once');
  assert.deepEqual(await client(stubTmdb()).items([]), []);
});

// ---- r2: a key a header cannot carry (R7), the years Discover takes (R5) ----

test('r2 R7 a token with a character a header cannot carry is a message about the key (kind auth), asks nothing, and the message holds none of the key', async () => {
  const bad = [
    'abc\ndef',
    'abc\r\nX-Injected: 1',
    'tok\u0000en',
    'tok\u0007en',
    'tok\u007fen',
    'tokĀen',
    'tok☃en',
    '中文-token',
    'tok\u{1F600}en',
    `${TOKEN} x`,
  ];
  for (const key of bad) {
    const stub = stubTmdb();
    const source = client(stub, key);
    for (const call of [() => source.identity(), () => source.pool({ libraryKey: 'movie/popular' }), () => source.genres('movie/popular'), () => source.items(['movie:1']), () => source.item('movie:1')]) {
      const e = await call().then(() => null, (err) => err);
      if (e === null) continue; // items() asks nothing when a lookup fails: an empty list
      assert.ok(e instanceof SourceError && e.kind === 'auth', `${JSON.stringify(key)}: ${e}`);
      assert.match(e.message, /TMDB key/);
      assert.ok(!e.message.includes(key.trim()) && !/Could not reach|network|CORS/.test(e.message), e.message);
    }
    assert.equal(stub.calls.length, 0, `${JSON.stringify(key)} is never sent`);
  }
  // The real fetch refuses such a header with a TypeError, which would have read "Could not reach TMDB (network or CORS error)".
  const refusing = createTmdbClient({ key: 'a\nb', fetchImpl: async (url, init) => (new Headers(init.headers), json({ success: true })) }); // Headers throws on such a value, as fetch does
  await assert.rejects(refusing.identity(), (e) => e.kind === 'auth');
  assert.equal(headerSafe('a\nb'), false);
});

test('r2 R7 a token a header can carry is sent: spaces inside, tabs, Latin-1 letters and every printable ASCII character; a v3 key is not checked as a header', async () => {
  for (const key of ['some other string', 'a\tb', 'café-token', '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~abc', TOKEN, V3]) {
    assert.equal(headerSafe(key), true, JSON.stringify(key));
    const stub = stubTmdb();
    await client(stub, key).identity();
    assert.equal(stub.calls.length, 1, JSON.stringify(key));
  }
  assert.equal(headerSafe(''), true);
  assert.equal(headerSafe(undefined), true);
});

test('r2 R5 validYear: four digits from 1800 to 2200 as text, anything else is empty', () => {
  for (const ok of ['1800', '1999', '2020', '2200', ' 2020 ']) assert.equal(validYear(ok), ok.trim(), ok);
  assert.equal(validYear(2020), '2020');
  for (const bad of ['', ' ', '20', '202', '20201', '1799', '2201', '0000', 'abcd', '2020.5', '2e3', '-2020', '+2020', '2020a', null, undefined, {}, [], NaN]) assert.equal(validYear(bad), '', String(bad));
});

// ---- production house (Run 13, production-house-filter; R-TMDB-2, D203 6, D210, D211, D212) ----

const P3 = 3; // Pixar
const A24 = 41077;
const housesStub = (companies, extra = {}) =>
  stubTmdb({
    pages: { 'movie/popular': [[movie(1), movie(2), movie(3), movie(4)]], 'discover/movie': [[movie(1), movie(2), movie(3), movie(4)]] },
    certs: { 'movie:1': [usDates('G')], 'movie:2': [usDates('PG')], 'movie:3': [usDates('R')], 'movie:4': [usDates('PG')] },
    companies,
    ...extra,
  });

test('houses: Discover sends with_companies joined by a pipe (H4), whatever the genre mode, and nothing when none is chosen', async () => {
  const send = async (key, houses) => (await discoverCall(key, { houses })).params.with_companies;
  assert.equal(await send('discover/movie', ['3', '41077']), '3|41077');
  assert.equal(await send('discover/movie?mode=and', ['3', '41077']), '3|41077', 'every-genre mode does not make houses AND');
  assert.equal(await send('discover/movie', ['3']), '3');
  assert.equal((await discoverCall('discover/tv', { houses: ['3', '9'] }, 'tv')).params.with_companies, '3|9');
  assert.ok(!('with_companies' in (await discoverCall('discover/movie', { houses: [] })).params), 'none chosen: no parameter');
  assert.ok(!('with_companies' in (await discoverCall('discover/movie', {})).params));
});

test('houses: a list takes no company parameter, the titles are narrowed after their companies are read', async () => {
  const stub = housesStub({ 'movie:1': [P3], 'movie:2': [A24], 'movie:3': [P3, 9], 'movie:4': [9] });
  const posters = await client(stub).pool({ libraryKey: 'movie/popular', houses: [String(P3)] });
  assert.ok(!('with_companies' in stub.listCalls()[0].params));
  assert.deepEqual(keys(posters), ['movie:1', 'movie:3'], 'only the titles whose companies include Pixar');
  assert.deepEqual(posters[0].companyIds, ['3']);
  assert.deepEqual(posters[1].companyIds, ['3', '9']);
});

test('houses: several houses are OR', async () => {
  const stub = housesStub({ 'movie:1': [P3], 'movie:2': [A24], 'movie:3': [9], 'movie:4': [8] });
  assert.deepEqual(keys(await client(stub).pool({ libraryKey: 'movie/popular', houses: ['3', '41077'] })), ['movie:1', 'movie:2']);
});

test('houses: a title is read with its companies in one details request (the certification rides along) and no separate lookup', async () => {
  const stub = housesStub({ 'movie:1': [P3], 'movie:2': [P3], 'movie:3': [P3], 'movie:4': [P3] });
  const posters = await client(stub).pool({ libraryKey: 'movie/popular', houses: ['3'], maxContentRating: 'PG' });
  assert.deepEqual(keys(posters), ['movie:1', 'movie:2', 'movie:4'], 'the R title is out under the limit');
  const detail = stub.calls.filter((c) => /^movie\/\d+$/.test(c.path));
  assert.equal(detail.length, 4);
  for (const c of detail) assert.equal(c.params.append_to_response, 'release_dates', c.path);
  assert.equal(stub.lookups().length, 4, 'one request per title: the details, and no second');
  assert.deepEqual(posters.map((p) => p.contentRating), ['G', 'PG', 'PG']);
});

test('houses: a TV title is read with content_ratings and its companies', async () => {
  const stub = stubTmdb({ pages: { 'tv/popular': [[show(7), show(8)]] }, certs: { 'tv:7': [usRating('TV-PG')], 'tv:8': [usRating('TV-PG')] }, companies: { 'tv:7': [P3], 'tv:8': [9] } });
  const posters = await client(stub).pool({ libraryKey: 'tv/popular', houses: ['3'], maxContentRating: 'PG' });
  assert.deepEqual(keys(posters), ['tv:7']);
  assert.equal(stub.calls.find((c) => c.path === 'tv/7').params.append_to_response, 'content_ratings');
});

test('houses: a house list never lets in a title the limit refuses, nor an unrated one (D5, H5)', async () => {
  const stub = housesStub({ 'movie:1': [A24], 'movie:2': [A24], 'movie:3': [A24], 'movie:4': [A24] }, { certs: { 'movie:1': [usDates('R')], 'movie:2': [usDates('PG')], 'movie:3': [], 'movie:4': [usDates('PG-13')] } });
  assert.deepEqual(keys(await client(stub).pool({ libraryKey: 'discover/movie', houses: ['41077'], maxContentRating: 'PG' })), ['movie:2']);
});

test('houses: a title whose companies are unknown is refused while a house list is set (H7)', async () => {
  const stub = housesStub({ 'movie:1': null, 'movie:2': [P3], 'movie:3': [], 'movie:4': [P3] });
  assert.deepEqual(keys(await client(stub).pool({ libraryKey: 'movie/popular', houses: ['3'] })), ['movie:2', 'movie:4'], 'no production_companies, or an empty list, matches no house');
});

test('houses: a failed details lookup hides its title, marks the pool partial, and every one failing throws the first', async () => {
  const stub = housesStub({ 'movie:1': [P3], 'movie:2': [P3], 'movie:3': [P3], 'movie:4': [P3] }, { fail: { 'movie:2': 429 } });
  const posters = await client(stub).pool({ libraryKey: 'movie/popular', houses: ['3'] });
  assert.deepEqual(keys(posters), ['movie:1', 'movie:3', 'movie:4']);
  assert.equal(posters.partial, true);
  const all = housesStub({ 'movie:1': [P3], 'movie:2': [P3], 'movie:3': [P3], 'movie:4': [P3] }, { fail: { 'movie:1': 429, 'movie:2': 429, 'movie:3': 429, 'movie:4': 429 } });
  await assert.rejects(() => client(all).pool({ libraryKey: 'movie/popular', houses: ['3'] }), (err) => err.kind === 'http' && err.status === 429);
});

test('houses: a title TMDB holds no record of (404) is refused, and is not a failure', async () => {
  const stub = housesStub({ 'movie:2': [P3] });
  const posters = await client(stub).pool({ libraryKey: 'movie/popular', houses: ['3'] });
  assert.deepEqual(keys(posters), ['movie:2']);
  assert.equal(posters.partial, false);
});

test('houses: no more than 4 details lookups are in flight at once, and a list is read for at most 5 pages (D210)', async () => {
  const many = Array.from({ length: 12 }, (_, i) => movie(i + 1));
  const stub = stubTmdb({
    pages: { 'movie/popular': [many, [movie(13)], [movie(14)], [movie(15)], [movie(16)], [movie(17)], [movie(18)]] },
    certs: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`movie:${i + 1}`, [usDates('PG')]])),
    companies: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`movie:${i + 1}`, [99]])),
  });
  await client(stub).pool({ libraryKey: 'movie/popular', houses: ['3'], size: 100 });
  assert.ok(stub.peak <= MAX_LOOKUPS && stub.peak > 1, `peak ${stub.peak}`);
  assert.equal(stub.listCalls().length, MAX_PAGES);
});

test('D215 1: with no house list a Popular title is read through its details request and carries its company ids; one request per title', async () => {
  const stub = housesStub({ 'movie:1': [P3], 'movie:2': [P3, 9], 'movie:3': null, 'movie:4': [A24] });
  const posters = await client(stub).pool({ libraryKey: 'movie/popular' });
  assert.deepEqual(stub.lookups().map((c) => c.path).sort(), ['movie/1', 'movie/2', 'movie/3', 'movie/4']);
  assert.ok(!stub.calls.some((c) => /\/(release_dates|content_ratings)$/.test(c.path)), 'the old certification request is not made');
  assert.deepEqual(posters.map((p) => p.companyIds ?? null), [['3'], ['3', '9'], null, ['41077']]);
  assert.deepEqual(posters.map((p) => p.contentRating), ['G', 'PG', 'R', 'PG'], 'the certification is the same one, read in the same request');
  assert.ok(!stub.calls.some((c) => 'with_companies' in c.params), 'and no company parameter is sent');
});

test("D215 1: a cached title's re-rating (items) reads its details and returns the company ids it read", async () => {
  const stub = stubTmdb({ certs: { 'movie:1': [usDates('PG')], 'tv:4': [usRating('TV-MA')] }, companies: { 'movie:1': [P3, 9], 'tv:4': null } });
  const got = await client(stub).items(['movie:1', 'tv:4', 'movie:6']);
  assert.deepEqual(got.map((p) => [p.ratingKey, p.contentRating, p.companyIds ?? null]), [['movie:1', 'PG', ['3', '9']], ['tv:4', 'TV-MA', null], ['movie:6', '', null]]);
  assert.ok(!stub.calls.some((c) => /\/(release_dates|content_ratings)$/.test(c.path)), 'one details request per title');
});

test('houses: companies are searched by name (search/company), as { key (the id), title }; a blank name asks nothing; genres() has no houses switch (D214 2)', async () => {
  const stub = stubTmdb({ found: { A24: [{ id: 41077, name: 'A24', logo_path: null }, { id: 9, name: ' ' }, { id: 'x', name: 'Bad' }, { name: 'No id' }, null] } });
  const c = client(stub);
  assert.deepEqual(await c.houses('discover/movie', { query: ' A24 ' }), [{ key: '41077', title: 'A24' }]);
  const call = stub.calls.find((x) => x.path === 'search/company');
  assert.equal(call.params.query, 'A24');
  assert.deepEqual(await c.houses('discover/movie', { query: '   ' }), []);
  assert.equal(stub.calls.filter((x) => x.path === 'search/company').length, 1, 'a blank name sends no request');
  assert.deepEqual(await c.houses('discover/movie', { query: 'nothing' }), []);
  assert.ok((await c.genres('discover/movie', { houses: true, query: 'A24' })).some((g) => g.title === 'Comedy'), 'genres() is the genre list whatever the options');
  assert.equal(stub.calls.filter((x) => x.path === 'search/company').length, 2, 'and sends no company search');
});

test('houses: the pinned title (item) carries its company ids', async () => {
  const stub = stubTmdb({ when: (path) => (path === 'movie/5' ? json({ id: 5, title: 'Five', poster_path: '/p5.jpg', genres: [{ id: 35, name: 'Comedy' }], production_companies: [{ id: 3, name: 'Pixar' }, { id: 9, name: 'Other' }], release_dates: { results: [usDates('G')] } }) : undefined) });
  const p = await client(stub).item('movie:5');
  assert.deepEqual(p.companyIds, ['3', '9']);
});

test('houses: a company result keeps its origin country when TMDB names one, and TMDB order (D214 2, ux F6)', async () => {
  const stub = stubTmdb({ found: { univ: [{ id: 33, name: 'Universal Pictures', origin_country: 'US' }, { id: 7, name: 'Universal Pictures', origin_country: 'FR' }, { id: 5, name: 'A', origin_country: '' }, { id: 6, name: 'B' }] } });
  assert.deepEqual(await client(stub).houses('discover/movie', { query: 'univ' }), [
    { key: '33', title: 'Universal Pictures', country: 'US' },
    { key: '7', title: 'Universal Pictures', country: 'FR' },
    { key: '5', title: 'A' },
    { key: '6', title: 'B' },
  ]);
});
