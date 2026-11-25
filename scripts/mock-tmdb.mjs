// A tiny fake TMDB (The Movie Database) v3 server for demos and browser tests, beside the fake Plex and Jellyfin servers. Every title, company,
// id and token below is invented. Shapes follow the research note (.orchestrator/artifacts/research--tmdb-api-r1.md); whatever the mock invents
// (page size 20, the TV certification list, the file types of logos, the text of the error messages) is a (verify) row for a real TMDB.
//
// One server stands for both real hosts: api.themoviedb.org (/3/...) and image.tmdb.org (/t/p/<size>/<file>). The e2e helpers (tests/e2e/lib.mjs)
// route both hosts to it.
//
// Sign-in: a request to /3/... needs the demo read access token as `Authorization: Bearer <TOKEN>`, or as the `api_key` query parameter the
// 32-character v3 key (API_KEY); the token as `api_key` and the v3 key as Bearer are 401 (D207). Anything else (none, an unknown token, a wrong key) is 401 with TMDB's error body
// `{status_code: 7, status_message, success: false}`. Image files and the /__mock control routes need no key.
//
// (verify) list, besides what the shapes above say: the file types of posters and backdrops (the mock serves SVG, a real TMDB JPEG); the file types
// of logos; whether a browser can read `Retry-After` on a 429 (the mock sends no Access-Control-Expose-Headers); how `language` and
// `include_image_language` combine on the images route (the mock reads only include_image_language); the status and body of find/{id} with a
// missing or unknown external_source (the mock answers 422, status_code 22).
//
// Control routes (no key; GET or POST), each answers `{ mode }`:
//   /__mock/down        every /3 request answers 503 (status_code 11)
//   /__mock/badkey      every /3 request answers 401, even with the demo token
//   /__mock/ratelimit   every /3 request answers 429 (status_code 25) with a Retry-After header
//   /__mock/empty       lists, discover, search and find answer with no results; images answer with empty lists
//   /__mock/reset       back to normal
//
// Titles: 24 movies (page size 20, so the lists have two pages) and 4 TV shows. Movies carry a US certification G, PG, PG-13 or R, one carries
// an empty `""` one, one has no US entry at all and one is `adult: true`. Shows carry TV-Y7, TV-PG, TV-MA and one has no US rating. The
// mock port is the Plex mock's port plus 2000 (tmdbPortFor); above 63535 that would pass 65535, so it is the Plex mock's port minus 2000.

import { createServer } from 'node:http';

export const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJtb2NrLXRtZGIifQ.mock-tmdb-demo-read-access-token';
export const API_KEY = '0123456789abcdef0123456789abcdef'; // a v3 key is 32 hex characters

export const tmdbPortFor = (plexMockPort) => (Number(plexMockPort) + 2000 > 65535 ? Number(plexMockPort) - 2000 : Number(plexMockPort) + 2000);

const PAGE_SIZE = 20;
const NO_LANGUAGE = null; // iso_639_1 of an image with no language

const MOVIE_GENRES = [
  { id: 28, name: 'Action' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 18, name: 'Drama' },
  { id: 27, name: 'Horror' },
  { id: 10751, name: 'Family' },
];
const TV_GENRES = [
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 18, name: 'Drama' },
  { id: 10762, name: 'Kids' },
  { id: 10765, name: 'Sci-Fi & Fantasy' },
];
export const COMPANIES = [
  { id: 41077, name: 'A24', logo_path: null, origin_country: 'US' },
  { id: 3, name: 'Pixar', logo_path: null, origin_country: 'US' },
  { id: 9999, name: 'Mock Studios', logo_path: null, origin_country: 'US' },
];
const [A24, PIXAR, MOCK] = COMPANIES.map((c) => c.id);

// The US certification ladder of a movie, lowest first (a certification outside it never passes certification.lte).
const MOVIE_LADDER = ['G', 'PG', 'PG-13', 'R', 'NC-17'];

// id, title, year, genre ids, US certification (undefined = no US entry, '' = an empty one), company, adult, vote average, popularity, original language
const MOVIE_ROWS = [
  [1001, 'Paper Moon Rising', 2019, [16, 10751], 'G', PIXAR, false, 8.1, 95],
  [1002, 'Lantern Road', 2021, [16], 'PG', PIXAR, false, 7.6, 88],
  [1003, 'Northern Lights Cafe', 2022, [18, 35], 'PG-13', A24, false, 7.9, 84],
  [1004, 'Static Bloom', 2023, [18, 27], 'R', A24, false, 7.2, 80],
  [1005, 'Quiet Harbour', 2018, [18], '', MOCK, false, 6.9, 70],
  [1006, 'Unrated Wanderer', 2020, [35], undefined, MOCK, false, 6.4, 66],
  [1007, 'After Dark Reel', 2017, [27], 'R', MOCK, true, 5.8, 60],
  [1008, 'Action Only', 2024, [28], 'PG-13', MOCK, false, 6.6, 76],
];
for (let i = 1; i <= 16; i++) MOVIE_ROWS.push([1100 + i, `Mock Feature ${i}`, 2000 + i, [35, 10751], 'PG', MOCK, false, 5 + (i % 5) / 2, 50 - i]);

// id, name, year, genre ids, US rating (undefined = none), company, vote average, popularity
const TV_ROWS = [
  [2001, 'Tiny Explorers', 2020, [16, 10762], 'TV-Y7', PIXAR, 7.8, 90],
  [2002, 'Sunday Sketch', 2019, [35], 'TV-PG', A24, 7.1, 82],
  [2003, 'Harbor Nights', 2022, [18], 'TV-MA', MOCK, 8.3, 78],
  [2004, 'Unrated Frontier', 2021, [10765], undefined, MOCK, 6.7, 64],
];

const imdb = (id) => `tt${String(9000000 + id).padStart(7, '0')}`;
const posterFile = (kind, id, lang) => `/mock-${kind}-${id}-${lang ?? 'xx'}.svg`;
const COLORS = ['#8b1e3f', '#1e4f8b', '#5b2a86', '#b5651d', '#127a6b', '#6b6b12', '#a12828', '#3a3a3a'];

const MOVIES = MOVIE_ROWS.map(([id, title, year, genres, cert, company, adult, vote, popularity], i) => ({
  kind: 'movie',
  id,
  title,
  genres,
  company,
  adult,
  vote,
  popularity,
  imdb: imdb(id),
  color: COLORS[i % COLORS.length],
  releaseDate: `${year}-06-15`,
  releases: [
    ...(cert === undefined ? [] : [{ iso_3166_1: 'US', release_dates: cert === '' ? [rel('')] : [rel('', 1), rel(cert, 3)] }]),
    { iso_3166_1: 'GB', release_dates: [rel('12A')] },
  ],
  noLogo: id === 1006,
}));
function rel(certification, type = 3) {
  return { certification, descriptors: [], iso_639_1: '', note: '', release_date: '2020-01-01T00:00:00.000Z', type };
}
const SHOWS = TV_ROWS.map(([id, name, year, genres, rating, company, vote, popularity], i) => ({
  kind: 'tv',
  id,
  title: name,
  genres,
  company,
  adult: false,
  vote,
  popularity,
  tvdb: 70000 + id,
  imdb: imdb(id),
  color: COLORS[(i + 3) % COLORS.length],
  releaseDate: `${year}-03-01`,
  ratings: [...(rating === undefined ? [] : [{ descriptors: [], iso_3166_1: 'US', rating }]), { descriptors: [], iso_3166_1: 'GB', rating: '12' }],
  noLogo: false,
}));
const certOf = (movie) => {
  const us = movie.releases.find((r) => r.iso_3166_1 === 'US');
  return us?.release_dates.map((d) => d.certification).find((c) => c !== '') ?? '';
};

const listItem = (t) =>
  t.kind === 'movie'
    ? {
        adult: t.adult,
        backdrop_path: posterFile('backdrop', t.id, NO_LANGUAGE),
        genre_ids: t.genres,
        id: t.id,
        original_language: 'en',
        original_title: t.title,
        overview: `The invented story of ${t.title}.`,
        popularity: t.popularity,
        poster_path: posterFile('poster', t.id, 'en'),
        release_date: t.releaseDate,
        title: t.title,
        video: false,
        vote_average: t.vote,
        vote_count: 100 + t.id,
      }
    : {
        backdrop_path: posterFile('backdrop', t.id, NO_LANGUAGE),
        first_air_date: t.releaseDate,
        genre_ids: t.genres,
        id: t.id,
        name: t.title,
        origin_country: ['US'],
        original_language: 'en',
        original_name: t.title,
        overview: `The invented story of ${t.title}.`,
        popularity: t.popularity,
        poster_path: posterFile('poster', t.id, 'en'),
        vote_average: t.vote,
        vote_count: 100 + t.id,
      };

const byPopularity = (a, b) => b.popularity - a.popularity || a.id - b.id;
const byVote = (a, b) => b.vote - a.vote || a.id - b.id;
const byDate = (a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.id - b.id;
const byIdDesc = (a, b) => b.id - a.id;
const LISTS = {
  'movie/popular': [MOVIES, byPopularity],
  'movie/top_rated': [MOVIES, byVote],
  'movie/now_playing': [MOVIES, byDate],
  'movie/upcoming': [MOVIES, byIdDesc],
  'tv/popular': [SHOWS, byPopularity],
  'tv/on_the_air': [SHOWS, byVote],
  'tv/airing_today': [SHOWS, byDate],
};

const imageEntry = (file, lang, w, h, vote) => ({ aspect_ratio: w / h, height: h, iso_639_1: lang, file_path: file, vote_average: vote, vote_count: 5, width: w });
const imagesOf = (t, languages) => {
  const keep = (e) => !languages || languages.includes(e.iso_639_1 === null ? 'null' : e.iso_639_1);
  return {
    id: t.id,
    backdrops: [imageEntry(posterFile('backdrop', t.id, NO_LANGUAGE), NO_LANGUAGE, 1920, 1080, 5.5)].filter(keep),
    logos: t.noLogo ? [] : [imageEntry(posterFile('logo', t.id, 'en'), 'en', 500, 200, 5.3)].filter(keep),
    posters: [
      imageEntry(posterFile('poster', t.id, NO_LANGUAGE), NO_LANGUAGE, 1000, 1500, 5.4),
      imageEntry(posterFile('poster', t.id, 'en'), 'en', 1000, 1500, 5.2),
      imageEntry(posterFile('poster', t.id, 'fr'), 'fr', 1000, 1500, 5.0),
    ].filter(keep),
  };
};

const EXTERNAL_SOURCES = ['imdb_id', 'tvdb_id', 'facebook_id', 'instagram_id', 'tiktok_id', 'twitter_id', 'wikidata_id', 'youtube_id'];
const IMAGE_SIZES = new Set(['w45', 'w92', 'w154', 'w185', 'w300', 'w342', 'w500', 'w780', 'w1280', 'h632', 'original']);
const CONFIGURATION = {
  images: {
    base_url: 'http://image.tmdb.org/t/p/',
    secure_base_url: 'https://image.tmdb.org/t/p/',
    backdrop_sizes: ['w300', 'w780', 'w1280', 'original'],
    logo_sizes: ['w45', 'w92', 'w154', 'w185', 'w300', 'w500', 'original'],
    poster_sizes: ['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original'],
    profile_sizes: ['w45', 'w185', 'h632', 'original'],
    still_sizes: ['w92', 'w185', 'w300', 'original'],
  },
  change_keys: ['adult', 'genres', 'images', 'overview', 'title'],
};

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
// The body of an image file: an SVG (a real TMDB sends JPEG or PNG), named after the title and the language of the file.
function imageSvg(file) {
  const m = /^\/mock-(poster|backdrop|logo)-(\d+)-([a-z]+)\.svg$/.exec(file);
  if (!m) return null;
  const t = [...MOVIES, ...SHOWS].find((x) => x.id === Number(m[2]));
  if (!t || !imagesOf(t).posters.concat(imagesOf(t).backdrops, imagesOf(t).logos).some((e) => e.file_path === file)) return null;
  const [w, h] = m[1] === 'poster' ? [500, 750] : m[1] === 'backdrop' ? [780, 439] : [500, 200];
  const fill = m[1] === 'logo' ? 'none' : t.color;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${fill}"/>
  <text x="${w / 2}" y="${h / 2}" font-family="Georgia, serif" font-size="${m[1] === 'poster' ? 40 : 34}" font-weight="bold" fill="${m[1] === 'logo' ? '#222' : '#fff'}" text-anchor="middle">${esc(t.title)}</text>
  <text x="${w / 2}" y="${h / 2 + 44}" font-family="sans-serif" font-size="24" fill="${m[1] === 'logo' ? '#222' : '#fff'}" text-anchor="middle">${m[1]} ${m[3] === 'xx' ? 'no language' : m[3]}</text>
</svg>`;
}

const ERRORS = {
  401: { status_code: 7, status_message: 'Invalid API key: You must be granted a valid key.', success: false },
  422: { status_code: 22, status_message: 'Invalid external_source: it must be one of the sources TMDB lists.', success: false },
  404: { status_code: 34, status_message: 'The resource you requested could not be found.', success: false },
  429: { status_code: 25, status_message: 'Your request count (#) is over the allowed limit of (40).', success: false },
  503: { status_code: 11, status_message: 'Internal error: Something went wrong, contact TMDb.', success: false },
};

// with_genres / with_companies: a comma is AND (all of them), a pipe is OR (any of them). An empty value filters nothing.
function idFilter(value, have) {
  if (!value) return true;
  const mine = new Set(have);
  const or = value.includes('|');
  const wanted = value.split(or ? '|' : ',').map(Number);
  return or ? wanted.some((id) => mine.has(id)) : wanted.every((id) => mine.has(id));
}

const page = (items, pageParam) => {
  const n = Math.max(1, Math.floor(Number(pageParam)) || 1);
  return { page: n, results: items.slice((n - 1) * PAGE_SIZE, n * PAGE_SIZE).map(listItem), total_pages: Math.max(1, Math.ceil(items.length / PAGE_SIZE)), total_results: items.length };
};

export async function startMockTmdb({ port = 0, host = '127.0.0.1' } = {}) {
  let mode = 'ok'; // ok | down | badkey | ratelimit | empty

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const q = url.searchParams;
    const cors = { 'Access-Control-Allow-Origin': '*' };
    const send = (status, body, extra = {}) => {
      res.writeHead(status, { ...cors, 'Content-Type': 'application/json;charset=utf-8', ...extra });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
      return res.end();
    }

    // Control routes.
    const control = /^\/__mock\/(down|badkey|ratelimit|empty|reset)$/.exec(path);
    if (control) {
      mode = control[1] === 'reset' ? 'ok' : control[1];
      return send(200, { mode });
    }

    // Image files (public).
    const image = /^\/t\/p\/([^/]+)(\/.+)$/.exec(path);
    if (image) {
      const svg = IMAGE_SIZES.has(image[1]) ? imageSvg(image[2]) : null;
      if (!svg || mode === 'down') return send(mode === 'down' ? 503 : 404, ERRORS[mode === 'down' ? 503 : 404]);
      res.writeHead(200, { ...cors, 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
      return res.end(svg);
    }

    if (!path.startsWith('/3/')) return send(404, ERRORS[404]);

    if (mode === 'down') return send(503, ERRORS[503]);
    if (mode === 'ratelimit') return send(429, ERRORS[429], { 'Retry-After': '1' });
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
    const key = q.get('api_key');
    const authorised = bearer === TOKEN || key === API_KEY;
    if (mode === 'badkey' || !authorised) return send(401, ERRORS[401]);

    const route = path.slice(3);
    const empty = mode === 'empty';
    const emptyPage = { page: 1, results: [], total_pages: 1, total_results: 0 };
    const find = (items, id) => items.find((t) => String(t.id) === id);

    if (route === 'authentication') return send(200, { success: true, status_code: 1, status_message: 'Success.' });
    if (route === 'configuration') return send(200, CONFIGURATION);
    if (route === 'genre/movie/list') return send(200, { genres: MOVIE_GENRES });
    if (route === 'genre/tv/list') return send(200, { genres: TV_GENRES });

    if (LISTS[route]) {
      const [all, order] = LISTS[route];
      return send(200, empty ? emptyPage : page([...all].sort(order), q.get('page')));
    }

    if (route === 'discover/movie' || route === 'discover/tv') {
      const movie = route === 'discover/movie';
      let items = [...(movie ? MOVIES : SHOWS)].filter((t) => idFilter(q.get('with_genres'), t.genres) && idFilter(q.get('with_companies'), [t.company]));
      if (movie) {
        if (q.get('include_adult') !== 'true') items = items.filter((t) => !t.adult);
        if (q.get('certification_country') === 'US' && q.get('certification.lte')) {
          const top = MOVIE_LADDER.indexOf(q.get('certification.lte'));
          items = items.filter((t) => MOVIE_LADDER.indexOf(certOf(t)) !== -1 && MOVIE_LADDER.indexOf(certOf(t)) <= top);
        }
      }
      return send(200, empty ? emptyPage : page(items.sort(byPopularity), q.get('page')));
    }

    let m;
    if ((m = /^(movie|tv)\/(\d+)\/images$/.exec(route))) {
      const t = find(m[1] === 'movie' ? MOVIES : SHOWS, m[2]);
      if (!t) return send(404, ERRORS[404]);
      if (empty) return send(200, { id: t.id, backdrops: [], logos: [], posters: [] });
      const languages = q.get('include_image_language')?.split(',');
      return send(200, imagesOf(t, languages));
    }
    if ((m = /^movie\/(\d+)\/release_dates$/.exec(route))) {
      const t = find(MOVIES, m[1]);
      return t ? send(200, { id: t.id, results: empty ? [] : t.releases }) : send(404, ERRORS[404]);
    }
    if ((m = /^tv\/(\d+)\/content_ratings$/.exec(route))) {
      const t = find(SHOWS, m[1]);
      return t ? send(200, { id: t.id, results: empty ? [] : t.ratings }) : send(404, ERRORS[404]);
    }
    if (route === 'search/company') {
      const needle = (q.get('query') || '').toLowerCase();
      const found = empty || !needle ? [] : COMPANIES.filter((c) => c.name.toLowerCase().includes(needle));
      return send(200, { page: 1, results: found, total_pages: 1, total_results: found.length });
    }
    if ((m = /^find\/(.+)$/.exec(route))) {
      const source = q.get('external_source');
      if (!EXTERNAL_SOURCES.includes(source)) return send(422, ERRORS[422]); // (verify) status and body
      const hit = (t) => (source === 'tvdb_id' ? t.tvdb !== undefined && `${t.tvdb}` === m[1] : source === 'imdb_id' && t.imdb === m[1]);
      const pick = (items) => (empty ? [] : items.filter(hit).map(listItem));
      return send(200, { movie_results: pick(MOVIES), person_results: [], tv_results: pick(SHOWS), tv_episode_results: [], tv_season_results: [] });
    }

    return send(404, ERRORS[404]);
  });

  await new Promise((r) => server.listen(port, host, r));
  return server;
}
