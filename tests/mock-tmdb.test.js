import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startMockTmdb, tmdbPortFor, TOKEN, API_KEY, COMPANIES } from '../scripts/mock-tmdb.mjs';

let server;
let base;

before(async () => {
  server = await startMockTmdb({ port: 0 });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));
beforeEach(() => fetch(`${base}/__mock/reset`, { method: 'POST' }));

const BEARER = { Authorization: `Bearer ${TOKEN}` };
const raw = (path, init = {}) => fetch(`${base}${path}`, init);
const get = async (path, headers = BEARER) => {
  const res = await raw(path, { headers });
  return { status: res.status, body: await res.json().catch(() => null), res };
};
const ids = (r) => r.body.results.map((m) => m.id);
const A24 = COMPANIES.find((c) => c.name === 'A24').id;
const PIXAR = COMPANIES.find((c) => c.name === 'Pixar').id;
const ACTION = 28;
const DRAMA = 18;
const COMEDY = 35;
const ADULT = 1007;
const ACTION_ONLY = 1008; // genre Action only
const DRAMA_ONLY = 1005; // genre Drama only
const DRAMA_COMEDY = 1003;
const R_MOVIE = 1004;
const NO_LOGO = 1006;

test('port helper: the TMDB mock port follows from the Plex mock port', () => {
  assert.equal(tmdbPortFor(18801), 20801);
  assert.equal(tmdbPortFor(32401), 34401);
  assert.equal(tmdbPortFor(63535), 65535);
  assert.equal(tmdbPortFor(63536), 61536);
  for (const plex of [1024, 32401, 63535, 63536, 65535]) {
    const p = tmdbPortFor(plex);
    assert.ok(Number.isInteger(p) && p >= 1 && p <= 65535 && p !== plex, String(plex));
  }
});

test('the demo key is 32 characters and the token is not', () => {
  assert.equal(API_KEY.length, 32);
  assert.notEqual(TOKEN.length, 32);
});

test('GET /3/authentication: 200 for the demo token as Bearer and the v3 key as api_key, 401 otherwise (D207)', async () => {
  const ok = await get('/3/authentication');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.success, true);
  assert.equal((await get(`/3/authentication?api_key=${API_KEY}`, {})).status, 200);
  for (const [path, headers] of [
    ['/3/authentication', {}],
    ['/3/authentication', { Authorization: 'Bearer wrong-token' }],
    ['/3/authentication', { Authorization: `Basic ${TOKEN}` }],
    [`/3/authentication?api_key=${TOKEN}`, {}], // D207: the token is not a v3 key
    ['/3/authentication', { Authorization: `Bearer ${API_KEY}` }], // nor is the key a token
    ['/3/authentication?api_key=wrong', {}],
    [`/3/authentication?api_key=${API_KEY.replace(/.$/, 'x')}`, {}],
  ]) {
    const r = await get(path, headers);
    assert.equal(r.status, 401, `${path} ${JSON.stringify(headers)}`);
    assert.deepEqual(Object.keys(r.body).sort(), ['status_code', 'status_message', 'success']);
    assert.equal(r.body.status_code, 7);
    assert.equal(r.body.success, false);
  }
});

test('every /3 route needs the key; an unknown route is 404 with the error body; CORS is open', async () => {
  for (const p of ['/3/configuration', '/3/movie/popular', '/3/discover/movie', '/3/movie/1001/images', '/3/search/company?query=a24', '/3/find/tt1']) {
    assert.equal((await get(p, {})).status, 401, p);
  }
  for (const p of ['/3/configuration', '/3/movie/popular', '/3/discover/tv', '/3/movie/1001/images', '/3/search/company?query=a24']) {
    const sep = p.includes('?') ? '&' : '?';
    assert.equal((await get(`${p}${sep}api_key=${TOKEN}`, {})).status, 401, `${p}: the token is no v3 key (D207)`);
    assert.equal((await get(`${p}${sep}api_key=${API_KEY}`, {})).status, 200, p);
  }
  const nope = await get('/3/nothing/here');
  assert.equal(nope.status, 404);
  assert.equal(nope.body.success, false);
  assert.equal((await get('/3/movie/424242/images')).status, 404);
  assert.equal(nope.res.headers.get('access-control-allow-origin'), '*');
  const pre = await raw('/3/configuration', { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-headers'), /authorization/i);
});

test('configuration: secure_base_url and the sizes', async () => {
  const { status, body } = await get('/3/configuration');
  assert.equal(status, 200);
  assert.equal(body.images.secure_base_url, 'https://image.tmdb.org/t/p/');
  for (const k of ['backdrop_sizes', 'logo_sizes', 'poster_sizes', 'profile_sizes', 'still_sizes']) assert.ok(body.images[k].includes('original'), k);
});

test('genre lists: movie and tv', async () => {
  const m = (await get('/3/genre/movie/list')).body.genres;
  const t = (await get('/3/genre/tv/list')).body.genres;
  assert.ok(m.length >= 3 && t.length >= 3);
  for (const g of [...m, ...t]) assert.ok(Number.isInteger(g.id) && typeof g.name === 'string');
  assert.ok(m.some((g) => g.id === ACTION && g.name === 'Action'));
  assert.ok(t.some((g) => g.name === 'Kids'));
});

test('the seven list endpoints answer {page, results, total_pages, total_results} and page', async () => {
  for (const p of ['movie/popular', 'movie/top_rated', 'movie/now_playing', 'movie/upcoming']) {
    const one = (await get(`/3/${p}`)).body;
    assert.deepEqual(Object.keys(one).sort(), ['page', 'results', 'total_pages', 'total_results'], p);
    assert.equal(one.page, 1);
    assert.equal(one.total_pages, 2);
    assert.equal(one.results.length, 20);
    assert.equal(one.total_results, 24);
    const two = (await get(`/3/${p}?page=2`)).body;
    assert.equal(two.page, 2);
    assert.equal(two.results.length, 4);
    assert.equal(new Set([...one.results, ...two.results].map((m) => m.id)).size, 24, `${p}: the two pages hold 24 different movies`);
    for (const k of ['id', 'title', 'poster_path', 'genre_ids', 'adult', 'release_date', 'vote_average']) assert.ok(k in one.results[0], `${p} ${k}`);
  }
  for (const p of ['tv/popular', 'tv/on_the_air', 'tv/airing_today']) {
    const one = (await get(`/3/${p}`)).body;
    assert.equal(one.total_pages, 1, p);
    assert.equal(one.results.length, 4);
    assert.equal(one.total_results, 4);
    for (const k of ['id', 'name', 'poster_path', 'genre_ids', 'first_air_date']) assert.ok(k in one.results[0], `${p} ${k}`);
    assert.deepEqual((await get(`/3/${p}?page=2`)).body.results, []);
  }
  assert.notDeepEqual(ids({ body: (await get('/3/movie/popular')).body }), ids({ body: (await get('/3/movie/top_rated')).body }));
});

test('discover/movie: with_genres comma is AND, pipe is OR', async () => {
  const and = ids(await get(`/3/discover/movie?with_genres=${DRAMA},${COMEDY}`));
  assert.deepEqual(and, [DRAMA_COMEDY]);
  assert.ok(!and.includes(DRAMA_ONLY), 'Drama alone does not satisfy Drama AND Comedy');
  const or = ids(await get(`/3/discover/movie?with_genres=${ACTION}|${COMEDY}`));
  assert.ok(or.includes(ACTION_ONLY), 'Action alone satisfies Action OR Comedy');
  assert.ok(or.includes(DRAMA_COMEDY));
  assert.ok(!or.includes(DRAMA_ONLY), 'Drama alone is neither');
  const single = ids(await get(`/3/discover/movie?with_genres=${ACTION}`));
  assert.deepEqual(single, [ACTION_ONLY]);
});

test('discover/movie: with_companies narrows to the company (OR with a pipe, AND with a comma)', async () => {
  const a24 = ids(await get(`/3/discover/movie?with_companies=${A24}`));
  assert.deepEqual(a24.sort(), [1003, 1004]);
  const pixar = ids(await get(`/3/discover/movie?with_companies=${PIXAR}`));
  assert.deepEqual(pixar.sort(), [1001, 1002]);
  assert.deepEqual(ids(await get(`/3/discover/movie?with_companies=${A24}|${PIXAR}`)).sort(), [1001, 1002, 1003, 1004]);
  assert.deepEqual(ids(await get(`/3/discover/movie?with_companies=${A24},${PIXAR}`)), []);
});

test('discover/movie: certification_country=US with certification.lte', async () => {
  const lte = async (c) => ids(await get(`/3/discover/movie?certification_country=US&certification.lte=${c}&include_adult=true`));
  const pg = await lte('PG');
  assert.ok(pg.includes(1001) && pg.includes(1002), 'G and PG pass');
  assert.ok(!pg.includes(R_MOVIE), 'R is above PG');
  assert.ok(!pg.includes(DRAMA_COMEDY), 'PG-13 is above PG');
  assert.ok(!pg.includes(1005) && !pg.includes(NO_LOGO), 'an empty certification and no US entry never pass');
  const pg13 = await lte('PG-13');
  assert.ok(pg13.includes(DRAMA_COMEDY) && pg13.includes(ACTION_ONLY));
  assert.ok(!pg13.includes(R_MOVIE));
  const r = await lte('R');
  assert.ok(r.includes(R_MOVIE) && r.includes(ADULT));
  assert.ok(!r.includes(1005) && !r.includes(NO_LOGO));
  // without the pair, nothing is filtered by certification
  const all = ids(await get('/3/discover/movie'));
  assert.ok(all.includes(R_MOVIE) && all.includes(1005) && all.includes(NO_LOGO));
});

test('discover/movie: include_adult=false drops the adult title; true brings it back', async () => {
  assert.ok(!ids(await get('/3/discover/movie?include_adult=false')).includes(ADULT));
  assert.ok(!ids(await get('/3/discover/movie')).includes(ADULT), 'TMDB defaults to no adult');
  assert.ok(ids(await get('/3/discover/movie?include_adult=true')).includes(ADULT));
  assert.equal((await get('/3/discover/movie?include_adult=true')).body.results.find((m) => m.id === ADULT).adult, true);
});

test('discover/movie pages like a list', async () => {
  const one = (await get('/3/discover/movie')).body;
  assert.equal(one.results.length, 20);
  assert.equal(one.total_pages, 2);
  assert.equal((await get('/3/discover/movie?page=2')).body.results.length, 3);
});

test('discover/tv: with_genres and with_companies', async () => {
  assert.deepEqual(ids(await get('/3/discover/tv?with_genres=16')), [2001]);
  assert.deepEqual(ids(await get('/3/discover/tv?with_genres=16|35')).sort(), [2001, 2002]);
  assert.deepEqual(ids(await get('/3/discover/tv?with_genres=16,35')), []);
  assert.deepEqual(ids(await get(`/3/discover/tv?with_companies=${A24}`)), [2002]);
  assert.deepEqual(ids(await get(`/3/discover/tv?with_companies=${PIXAR}`)), [2001]);
  assert.equal(ids(await get('/3/discover/tv')).length, 4);
});

test('movie/{id}/release_dates: a US certification, an empty one, none for the US', async () => {
  const us = (id, body) => body.results.find((r) => r.iso_3166_1 === 'US');
  const r = (await get('/3/movie/1004/release_dates')).body;
  assert.equal(r.id, 1004);
  assert.equal(us(1004, r).release_dates.find((d) => d.certification !== '').certification, 'R');
  assert.deepEqual((await get('/3/movie/1001/release_dates')).body.results.find((x) => x.iso_3166_1 === 'US').release_dates.map((d) => d.certification).filter(Boolean), ['G']);
  const empty = us(1005, (await get('/3/movie/1005/release_dates')).body);
  assert.deepEqual(empty.release_dates.map((d) => d.certification), ['']);
  const none = (await get(`/3/movie/${NO_LOGO}/release_dates`)).body;
  assert.equal(us(NO_LOGO, none), undefined);
  assert.ok(none.results.length > 0, 'other countries are still listed');
  const found = new Set();
  for (const id of [1001, 1002, 1003, 1004]) found.add(us(id, (await get(`/3/movie/${id}/release_dates`)).body).release_dates.map((d) => d.certification).find(Boolean));
  assert.deepEqual([...found].sort(), ['G', 'PG', 'PG-13', 'R']);
  assert.equal((await get('/3/movie/9/release_dates')).status, 404);
});

test('tv/{id}/content_ratings: TV-Y7, TV-PG, TV-MA and none for the US', async () => {
  const us = async (id) => (await get(`/3/tv/${id}/content_ratings`)).body.results.find((r) => r.iso_3166_1 === 'US')?.rating;
  assert.equal(await us(2001), 'TV-Y7');
  assert.equal(await us(2002), 'TV-PG');
  assert.equal(await us(2003), 'TV-MA');
  assert.equal(await us(2004), undefined);
  assert.ok((await get('/3/tv/2004/content_ratings')).body.results.length > 0);
  assert.equal((await get('/3/tv/9/content_ratings')).status, 404);
});

test('movie and tv images: posters of null, en and fr; logos; one title has no logo', async () => {
  for (const kind of ['movie', 'tv']) {
    const id = kind === 'movie' ? 1001 : 2001;
    const r = (await get(`/3/${kind}/${id}/images`)).body;
    assert.deepEqual(Object.keys(r).sort(), ['backdrops', 'id', 'logos', 'posters']);
    assert.deepEqual(r.posters.map((p) => p.iso_639_1), [null, 'en', 'fr']);
    for (const p of r.posters) for (const k of ['file_path', 'iso_639_1', 'width', 'height', 'vote_average']) assert.ok(k in p, k);
    assert.ok(r.logos.length > 0 && r.logos.every((l) => typeof l.file_path === 'string'));
    assert.ok(r.backdrops.length > 0);
  }
  assert.deepEqual((await get(`/3/movie/${NO_LOGO}/images`)).body.logos, []);
  assert.ok((await get(`/3/movie/${NO_LOGO}/images`)).body.posters.length === 3);
});

test('images: include_image_language filters posters and logos (null = no language)', async () => {
  const langs = async (q) => (await get(`/3/movie/1001/images?include_image_language=${q}`)).body.posters.map((p) => p.iso_639_1);
  assert.deepEqual(await langs('en,null'), [null, 'en']);
  assert.deepEqual(await langs('fr'), ['fr']);
});

test('search/company finds A24 and Pixar by name', async () => {
  const names = async (q) => (await get(`/3/search/company?query=${q}`)).body.results.map((c) => c.name);
  assert.deepEqual(await names('a24'), ['A24']);
  assert.deepEqual(await names('pix'), ['Pixar']);
  assert.deepEqual(await names('zzz'), []);
  const r = (await get('/3/search/company?query=a24')).body;
  assert.deepEqual(Object.keys(r).sort(), ['page', 'results', 'total_pages', 'total_results']);
  assert.equal(r.results[0].id, A24);
});

test('find/{id}: IMDb and TVDB ids map to a title', async () => {
  const movie = (await get('/3/discover/movie')).body.results[0];
  const imdb = `tt${String(9000000 + movie.id).padStart(7, '0')}`;
  const r = (await get(`/3/find/${imdb}?external_source=imdb_id`)).body;
  assert.deepEqual(Object.keys(r).sort(), ['movie_results', 'person_results', 'tv_episode_results', 'tv_results', 'tv_season_results']);
  assert.deepEqual(r.movie_results.map((m) => m.id), [movie.id]);
  const tv = (await get('/3/find/72001?external_source=tvdb_id')).body;
  assert.deepEqual(tv.tv_results.map((t) => t.id), [2001]);
  assert.deepEqual((await get('/3/find/tt0000001?external_source=imdb_id')).body.movie_results, []);
  assert.deepEqual((await get(`/3/find/${imdb}?external_source=twitter_id`)).body.movie_results, [], 'a listed source with no match');
});

test('find/{id}: a missing or unlisted external_source is an error, never a match', async () => {
  const imdb = `tt${String(9000000 + 1001).padStart(7, '0')}`;
  for (const q of ['', '?external_source=', '?external_source=nope', '?external_source=IMDB_ID']) {
    const r = await get(`/3/find/${imdb}${q}`);
    assert.equal(r.status, 422, q);
    assert.deepEqual(Object.keys(r.body).sort(), ['status_code', 'status_message', 'success']);
    assert.equal(r.body.success, false);
  }
});

test('image files under /t/p/<size>/<file> need no key; an unknown file or size is 404', async () => {
  const poster = (await get('/3/movie/1001/images')).body.posters[1].file_path;
  const logo = (await get('/3/movie/1001/images')).body.logos[0].file_path;
  for (const f of [poster, logo]) {
    const res = await raw(`/t/p/w500${f}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^image\//);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.match(await res.text(), /<svg/);
  }
  assert.equal((await raw(`/t/p/original${poster}`)).status, 200);
  assert.equal((await raw('/t/p/w500/mock-poster-1001-de.svg')).status, 404);
  assert.equal((await raw(`/t/p/w1/${poster.slice(1)}`)).status, 404);
  assert.equal((await raw(`/t/p/w500${poster}`, { headers: { Authorization: 'Bearer wrong' } })).status, 200);
  const noLogo = `/mock-logo-${NO_LOGO}-en.svg`;
  assert.equal((await raw(`/t/p/w500${noLogo}`)).status, 404, 'a file the title does not have');
  const list = (await get('/3/movie/popular')).body.results;
  assert.equal((await raw(`/t/p/w185${list[0].poster_path}`)).status, 200);
});

test('control: /__mock/down answers 503, /__mock/reset restores', async () => {
  assert.equal((await raw('/__mock/down', { method: 'POST' })).status, 200);
  const r = await get('/3/configuration');
  assert.equal(r.status, 503);
  assert.equal(r.body.success, false);
  assert.equal((await raw('/t/p/w500/mock-poster-1001-en.svg')).status, 503);
  await raw('/__mock/reset', { method: 'POST' });
  assert.equal((await get('/3/configuration')).status, 200);
  assert.equal((await raw('/t/p/w500/mock-poster-1001-en.svg')).status, 200);
});

test('control: /__mock/badkey makes the demo token 401 and /__mock/reset gives 200 again', async () => {
  assert.deepEqual(await (await raw('/__mock/badkey')).json(), { mode: 'badkey' });
  for (const [p, h] of [['/3/authentication', BEARER], [`/3/authentication?api_key=${API_KEY}`, {}]]) {
    const r = await get(p, h);
    assert.equal(r.status, 401);
    assert.equal(r.body.status_code, 7);
  }
  assert.equal((await raw(`/t/p/w500/mock-poster-1001-en.svg`)).status, 200, 'images need no key');
  assert.deepEqual(await (await raw('/__mock/reset', { method: 'POST' })).json(), { mode: 'ok' });
  assert.equal((await get('/3/authentication')).status, 200);
  assert.equal((await get(`/3/authentication?api_key=${API_KEY}`, {})).status, 200);
});

test('control: /__mock/ratelimit answers 429 with Retry-After, /__mock/reset restores', async () => {
  await raw('/__mock/ratelimit', { method: 'POST' });
  const r = await get('/3/movie/popular');
  assert.equal(r.status, 429);
  assert.equal(r.body.status_code, 25);
  assert.ok(r.res.headers.get('retry-after'));
  await raw('/__mock/reset', { method: 'POST' });
  assert.equal((await get('/3/movie/popular')).status, 200);
});

test('control: /__mock/empty empties lists, discover, search, find and images; /__mock/reset restores', async () => {
  await raw('/__mock/empty', { method: 'POST' });
  for (const p of ['/3/movie/popular', '/3/tv/popular', '/3/discover/movie', '/3/discover/tv', '/3/search/company?query=a24', '/3/find/tt9001001?external_source=imdb_id']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.deepEqual(r.body.results ?? r.body.movie_results, [], p);
  }
  const img = (await get('/3/movie/1001/images')).body;
  assert.deepEqual([img.posters, img.logos, img.backdrops], [[], [], []]);
  assert.equal((await get('/3/authentication')).status, 200);
  await raw('/__mock/reset', { method: 'POST' });
  assert.equal((await get('/3/movie/popular')).body.results.length, 20);
  assert.equal((await get('/3/movie/1001/images')).body.posters.length, 3);
  assert.ok((await get('/3/search/company?query=a24')).body.results.length === 1);
});

// ---- the years filter (D206 1) and the details route, added by tmdb-source ----

test('discover/movie: primary_release_date.gte and .lte keep the titles of those years, inclusive', async () => {
  // Titles are released on 06-15 of 2000 + i (the filler), 2017 to 2024 (the named ones).
  const from = (await get('/3/discover/movie?primary_release_date.gte=2023-01-01')).body.results;
  assert.deepEqual(from.map((m) => m.release_date.slice(0, 4)).sort(), ['2023', '2024']);
  const upTo = (await get('/3/discover/movie?primary_release_date.lte=2003-12-31')).body.results;
  assert.deepEqual(upTo.map((m) => m.release_date.slice(0, 4)).sort(), ['2001', '2002', '2003']);
  const both = (await get('/3/discover/movie?primary_release_date.gte=2018-01-01&primary_release_date.lte=2019-12-31')).body.results;
  assert.deepEqual(both.map((m) => m.release_date.slice(0, 4)).sort(), ['2018', '2019']);
  assert.deepEqual((await get('/3/discover/movie?primary_release_date.gte=2030-01-01')).body.results, []);
  assert.equal((await get('/3/discover/movie?primary_release_date.gte=&primary_release_date.lte=')).body.total_results, 23, 'an empty bound filters nothing (the adult title is out by default)');
});

test('discover/tv: first_air_date.gte and .lte keep the shows of those years; the movie parameters do not apply to it', async () => {
  assert.deepEqual(ids(await get('/3/discover/tv?first_air_date.gte=2021-01-01')).sort(), [2003, 2004]);
  assert.deepEqual(ids(await get('/3/discover/tv?first_air_date.lte=2019-12-31')), [2002]);
  assert.deepEqual(ids(await get('/3/discover/tv?first_air_date.gte=2020-01-01&first_air_date.lte=2020-12-31')), [2001]);
  assert.equal(ids(await get('/3/discover/tv?primary_release_date.gte=2030-01-01')).length, 4, 'not a TV parameter');
  assert.equal(ids(await get('/3/discover/movie?first_air_date.gte=2030-01-01')).length, 20, 'not a movie parameter');
});

test('movie/{id} and tv/{id}: the details, with the appended certifications; an unknown id is 404', async () => {
  const movie = await get('/3/movie/1004?append_to_response=release_dates');
  assert.equal(movie.status, 200);
  assert.equal(movie.body.title, 'Static Bloom');
  assert.deepEqual(movie.body.genres.map((g) => g.name).sort(), ['Drama', 'Horror']);
  assert.equal(movie.body.release_dates.results.find((r) => r.iso_3166_1 === 'US').release_dates.some((d) => d.certification === 'R'), true);
  assert.ok(!('release_dates' in (await get('/3/movie/1004')).body), 'only when asked for');
  const show = await get('/3/tv/2003?append_to_response=content_ratings');
  assert.equal(show.body.name, 'Harbor Nights');
  assert.equal(show.body.content_ratings.results.find((r) => r.iso_3166_1 === 'US').rating, 'TV-MA');
  assert.equal((await get('/3/movie/424242')).status, 404);
  assert.equal((await get('/3/tv/1004')).status, 404, 'a movie id is no show');
});
