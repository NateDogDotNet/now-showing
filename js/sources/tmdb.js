// TMDB source adapter (R-TMDB-1, R-TMDB-2, D203, D209, D210): the same interface as the media-server adapters (js/sources/index.js), spoken in TMDB's v3 API,
// for a household with no media server. Everything it was run against is the mock in scripts/mock-tmdb.mjs; every request and field the mock invents is a
// (verify) row in docs/validation/real-server-extended.md.
//
// What the display is shown, and what decides it:
//  - A "library" is a choice of pool, held in the settings' `libraryKey` as a plain string (so the selection, the pool key, the offline cache and the profiles
//    need nothing new): one of the seven lists (`movie/popular`, `movie/top_rated`, `movie/now_playing`, `movie/upcoming`, `tv/popular`, `tv/on_the_air`,
//    `tv/airing_today`), or Discover for movies or shows, `discover/movie` or `discover/tv`, with `?mode=and&from=2010&to=2020` when the household chose them.
//  - The household limit is decided by the US certification of each title, read from TMDB for every title before it can be shown (D210 3): a movie's
//    `release_dates`, a show's `content_ratings`, the US entries only. Several US entries: the strictest counts (D210 1). None, an empty or an unknown string
//    is unrated, which `allows()` refuses while a limit is set (D209 1); never TMDB's `adult` flag alone, never another country's entry, never the server-side
//    `certification.lte` (it only narrows the request). A lookup that fails hides its title while a limit is set and marks the pool partial (D210 2).
//  - Nothing is ever playing: `sessions()` is `[]` and `nowPlaying()` is null, with no request (D209 9).
//
// The key (D203 3, D210 4): after trimming and removing a leading `Bearer ` (any case), exactly 32 hex characters is a v3 key and goes in the `api_key` query
// of an API request; anything else is the read access token and goes in the `Authorization: Bearer` header. An image request carries no key, and the key is in
// no cache key or error message.

import { ratingRank } from '../ratings.js';
import { SUMMARY_MAX, trimSummary } from '../fill.js';
import { ratingPasses } from '../selection.js';
import { SourceError } from './errors.js';
import { buildUrl, timeoutSignal } from './http.js';

export const API_BASE = 'https://api.themoviedb.org/3/';
export const IMAGE_BASE = 'https://image.tmdb.org/t/p/';
/** TMDB's own sentence (D203 1, D209 11): shown in Settings' TMDB section and in the README, never on the display. */
export const CREDIT = 'This application uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.';
/** At most this many pages of a list or Discover answer fill one pool (D210 11). */
export const MAX_PAGES = 5;
/** At most this many certification lookups are in flight at once (D210 11). */
export const MAX_LOOKUPS = 4;
const LANGUAGE = 'en-US';
const REGION = 'US';

/** The lists a household can choose, with the endpoint each one asks. The key is the endpoint path and the `libraryKey` stored. */
export const LISTS = [
  { key: 'movie/popular', title: 'Popular', type: 'movie' },
  { key: 'movie/top_rated', title: 'Top rated', type: 'movie' },
  { key: 'movie/now_playing', title: 'Now playing in theatres', type: 'movie' },
  { key: 'movie/upcoming', title: 'Upcoming', type: 'movie' },
  { key: 'tv/popular', title: 'TV: Popular', type: 'tv' },
  { key: 'tv/on_the_air', title: 'TV: On the air', type: 'tv' },
  { key: 'tv/airing_today', title: 'TV: Airing today', type: 'tv' },
];
export const DEFAULT_LIBRARY = LISTS[0].key;
const REGION_LISTS = new Set(['movie/now_playing', 'movie/upcoming']); // the movie lists that take `region`

// ---- the choice of pool: the libraryKey ----

/** A year Discover takes: four digits, 1800 to 2200, as text; anything else is '' (the Settings sheet says so beside the field). */
export const validYear = (v) => (/^\d{4}$/.test(String(v ?? '').trim()) && Number(v) >= 1800 && Number(v) <= 2200 ? String(v).trim() : '');

/**
 * What a `libraryKey` asks: `{ kind: 'list', type, path }` or `{ kind: 'discover', type, path, mode, from, to }`, or null for a key that is neither (a
 * stored key of another server type). `mode` is 'or' (any ticked genre, the default) or 'and'; `from` and `to` are four-digit years or ''; From later than To is swapped (D210 9).
 */
export function sourceOf(libraryKey) {
  const text = typeof libraryKey === 'string' ? libraryKey.trim() : '';
  const [path, query = ''] = text.split('?');
  const list = LISTS.find((l) => l.key === path);
  if (list) return query ? null : { kind: 'list', type: list.type, path };
  if (path !== 'discover/movie' && path !== 'discover/tv') return null;
  const params = new URLSearchParams(query);
  let [from, to] = [validYear(params.get('from')), validYear(params.get('to'))];
  if (from && to && Number(from) > Number(to)) [from, to] = [to, from];
  return { kind: 'discover', type: path.endsWith('movie') ? 'movie' : 'tv', path, mode: params.get('mode') === 'and' ? 'and' : 'or', from, to };
}

/** The `libraryKey` of a Discover choice (the form the Settings sheet writes): `discover/movie`, or with `?mode=and&from=2010&to=2020` when chosen. */
export function discoverKey({ type = 'movie', mode = 'or', from = '', to = '' } = {}) {
  const query = new URLSearchParams();
  if (mode === 'and') query.set('mode', 'and');
  if (validYear(from)) query.set('from', validYear(from));
  if (validYear(to)) query.set('to', validYear(to));
  const text = query.toString();
  return `discover/${type === 'tv' ? 'tv' : 'movie'}${text ? `?${text}` : ''}`;
}

/** The choices `libraries()` offers: the seven lists and the two Discover choices (their `type` is 'movie' or 'show', as the libraries of a server). */
export const libraryChoices = () => [
  ...LISTS.map((l) => ({ key: l.key, title: l.title, type: l.type === 'tv' ? 'show' : 'movie' })),
  { key: 'discover/movie', title: 'Discover movies', type: 'movie' },
  { key: 'discover/tv', title: 'Discover TV', type: 'show' },
];

// ---- the key ----

/** `{ kind, value }` of a typed key: kind 'v3' (32 hex characters: the `api_key` query), 'token' (the read access token: the Bearer header) or '' (none). */
export function keyForm(raw) {
  const value = (typeof raw === 'string' ? raw.trim() : '').replace(/^bearer(\s+|$)/i, '').trim();
  if (!value) return { kind: '', value: '' };
  return { kind: /^[0-9a-f]{32}$/i.test(value) ? 'v3' : 'token', value };
}

/**
 * Can this key be a header value? A fetch refuses a header value with a control character (a newline, NUL) or a character above U+00FF, and says only that the
 * request failed, which would read as a network error. Only the token form travels in a header; a v3 key is hex.
 */
export const headerSafe = (value) => !/[^\t\x20-\x7e\x80-\xff]/.test(String(value ?? ''));

// ---- reading the answers ----

/**
 * The certification that counts for a title, from `release_dates` (a movie) or `content_ratings` (a show) (D203 4, D210 1): the US entries only; of the
 * non-empty values the strictest, and an unknown value (not on the ladder) beats them all, so it is refused under any limit. '' when there is none.
 */
export function certificationOf(type, reply) {
  const results = Array.isArray(reply?.results) ? reply.results : [];
  const values = results
    .filter((r) => r && typeof r === 'object' && r.iso_3166_1 === REGION)
    .flatMap((r) => (type === 'movie' ? (Array.isArray(r.release_dates) ? r.release_dates.map((d) => d?.certification) : []) : [r.rating]))
    .filter((v) => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
  const unknown = values.find((v) => ratingRank(v) === null);
  if (unknown !== undefined) return unknown;
  return values.reduce((top, v) => (top === '' || ratingRank(v) > ratingRank(top) ? v : top), '');
}

const KEY_FORM = /^(movie|tv):([0-9]+)$/;
/** `{ type, id }` of a poster's `ratingKey` (`movie:603`, `tv:1399`), or null. */
export function parseRatingKey(ratingKey) {
  const m = KEY_FORM.exec(String(ratingKey ?? ''));
  return m ? { type: m[1], id: m[2] } : null;
}

const POSTER_PATH = /^\/[A-Za-z0-9._-]+$/;
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const number = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A TMDB title (a list or Discover result, or a details reply) as the poster the engine reads (js/sources/index.js). `names` maps a genre id to its name. */
export function toPoster(item, type, { rating = '', names = new Map(), source = 'random' } = {}) {
  const id = String(item.id);
  const date = text(type === 'movie' ? item.release_date : item.first_air_date);
  const genres = (Array.isArray(item.genre_ids) ? item.genre_ids.map((g) => names.get(String(g))) : Array.isArray(item.genres) ? item.genres.map((g) => g?.name) : []).filter((g) => typeof g === 'string' && g.trim() !== '');
  const audience = number(item.vote_average);
  return {
    ratingKey: `${type}:${id}`,
    title: text(type === 'movie' ? item.title : item.name) || text(item.original_title ?? item.original_name),
    year: /^\d{4}/.test(date) ? date.slice(0, 4) : '',
    thumb: item.poster_path,
    source,
    user: '',
    contentRating: rating,
    duration: 0,
    summary: trimSummary(item.overview, SUMMARY_MAX),
    ...(genres.length ? { genres } : {}),
    ...(audience ? { audienceRating: audience } : {}),
    tmdbId: id,
    tmdbType: type,
  };
}

/** A result this adapter may show: an object with an id and a poster file, not marked adult (D203, a belt over `include_adult=false`), and not of the other type. */
const showable = (item, type) =>
  item && typeof item === 'object' && !Array.isArray(item) && item.adult !== true && /^[0-9]+$/.test(String(item.id)) && POSTER_PATH.test(String(item.poster_path ?? '')) && (item.media_type === undefined || item.media_type === type);

/** Runs at most `max` calls at once; the rest wait their turn. */
function limiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    while (active < max && queue.length) {
      const run = queue.shift();
      active++;
      run();
    }
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push(() =>
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          }),
      );
      next();
    });
}

/** One JSON request. Messages name TMDB and never the address (it carries the key in the v3 form). */
async function request(url, { headers, fetchImpl, timeoutMs = 10000 }) {
  let res;
  try {
    res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json', ...headers }, signal: timeoutSignal(timeoutMs) });
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new SourceError(timedOut ? 'TMDB did not respond in time.' : 'Could not reach TMDB (network or CORS error).', { kind: timedOut ? 'timeout' : 'network' });
  }
  if (res.status === 401 || res.status === 403) throw new SourceError('TMDB rejected the key (unauthorised).', { status: res.status, kind: 'auth' });
  if (!res.ok) throw new SourceError(`TMDB returned HTTP ${res.status}.`, { status: res.status, kind: 'http' });
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new SourceError('Could not parse TMDB response.', { kind: 'parse' });
  }
}

const noSource = (key) => new SourceError(`TMDB has no list "${String(key).slice(0, 60)}". Choose a list in Settings.`, { kind: 'config' });
const noCollections = () => new SourceError('TMDB has no collections or playlists.', { kind: 'config' });
const gone = () => new SourceError('That title is no longer on TMDB.', { kind: 'http', status: 404 });
const imageSize = (width) => ['w92', 'w154', 'w185', 'w342', 'w500', 'w780'].find((s) => Number(s.slice(1)) >= width) || 'original';

/**
 * The TMDB adapter. `key` is what the household typed (a read access token or a v3 key); `fetchImpl` stands in for fetch in tests. It takes no address:
 * the host is TMDB's.
 */
export function createTmdbClient({ key, fetchImpl = (...a) => fetch(...a) } = {}) {
  const form = keyForm(key);
  const headers = form.kind === 'token' ? { Authorization: `Bearer ${form.value}` } : {};
  const lookups = limiter(MAX_LOOKUPS);

  const get = (path, params = {}) => {
    if (!form.kind) return Promise.reject(new SourceError('Enter your TMDB key in Settings.', { kind: 'auth' }));
    // The message is about the key and holds none of it. Kind `auth`: the card and the test line then offer Sign in again, which goes to the key field.
    if (form.kind === 'token' && !headerSafe(form.value)) return Promise.reject(new SourceError('The TMDB key holds a character a key never has. Paste it again, whole, from your TMDB account.', { kind: 'auth' }));
    return request(buildUrl(API_BASE, path, { ...params, ...(form.kind === 'v3' ? { api_key: form.value } : {}) }), { headers, fetchImpl });
  };
  const results = (reply) => {
    if (!reply || !Array.isArray(reply.results)) throw new SourceError('Could not read the TMDB reply: it holds no list of titles.', { kind: 'parse' });
    return reply.results;
  };

  /**
   * The US certification of one title, through the limiter: `{ rating }`, or `{ error }` when the lookup failed (it never throws). A title TMDB holds no
   * certification record for (a 404) is unrated, not a failure: asking again would not change the answer.
   */
  const certify = (type, id) =>
    lookups(() => get(type === 'movie' ? `movie/${id}/release_dates` : `tv/${id}/content_ratings`)).then(
      (reply) => ({ rating: certificationOf(type, reply) }),
      (error) => (error?.kind === 'http' && error.status === 404 ? { rating: '' } : { error }),
    );

  const genreLists = new Map(); // type -> the promise of its { id -> name } map, asked for once
  const genreNames = (type) => {
    if (!genreLists.has(type)) {
      genreLists.set(
        type,
        get(`genre/${type}/list`, { language: LANGUAGE }).then(
          (reply) => new Map((Array.isArray(reply?.genres) ? reply.genres : []).filter((g) => g && g.id !== undefined && typeof g.name === 'string').map((g) => [String(g.id), g.name])),
          (err) => (genreLists.delete(type), Promise.reject(err)),
        ),
      );
    }
    return genreLists.get(type);
  };

  /** The parameters of one page of a list or of Discover (D210 8 to 10). `include_adult=false` goes on every one. */
  function pageParams(src, page, limit, genres) {
    const base = { language: LANGUAGE, include_adult: 'false', page };
    if (src.kind === 'list') return { ...base, ...(REGION_LISTS.has(src.path) ? { region: REGION } : {}) };
    const dates = src.type === 'movie' ? 'primary_release_date' : 'first_air_date';
    return {
      ...base,
      sort_by: 'popularity.desc',
      region: REGION,
      with_genres: genres.join(src.mode === 'and' ? ',' : '|'),
      [`${dates}.gte`]: src.from ? `${src.from}-01-01` : '',
      [`${dates}.lte`]: src.to ? `${src.to}-12-31` : '',
      // The server-side certification filter only narrows the request (D210 3); every title is still read and checked below. Movies only: discover/tv has none.
      ...(src.type === 'movie' && limit ? { certification_country: REGION, 'certification.lte': limit } : {}),
    };
  }

  return {
    label: 'TMDB',

    /** Test connection (D210 4): 200 with `success: true` is connected; 401, 403 or `success: false` is kind `auth`; anything else is what `request` says. */
    async identity() {
      const reply = await get('authentication');
      if (reply?.success !== true) throw new SourceError('TMDB rejected the key (unauthorised).', { kind: 'auth' });
      return { name: 'TMDB', version: '', machineIdentifier: '' };
    },

    /** TMDB has no sign-in-free identity. */
    publicIdentity: () => Promise.reject(new SourceError('TMDB has no public identity.', { kind: 'config' })),

    async libraries() {
      return libraryChoices();
    },

    async libraryCount() {
      return null;
    },

    async sessions() {
      return [];
    },

    nowPlaying() {
      return null;
    },

    /**
     * The pool of one list or Discover choice (`libraryKey`): at most MAX_PAGES pages, the titles that pass the limit and the rating subset after their
     * own certification is read, duplicates (`type:id`) dropped, until `size` are in. A failed certification lookup hides its title while a limit or a
     * rating subset is set and marks the pool partial (`.partial`), so the engine asks again soon (D210 2); every lookup failing, with nothing to show,
     * throws the first one. A page after the first that fails ends the pool there, partial.
     */
    async pool({ libraryKey, size = 100, maxContentRating = '', genres = [], ratings = [] } = {}) {
      const src = sourceOf(libraryKey);
      if (!src) throw noSource(libraryKey);
      const wanted = genres.map(String).filter(Boolean);
      const names = wanted.length ? await genreNames(src.type) : new Map(); // a pool that cannot tell its titles' genres cannot honour a genre choice: it fails whole
      const found = [];
      const seen = new Set();
      let partial = false;
      let firstFailure = null;
      for (let page = 1; page <= MAX_PAGES; page++) {
        let reply;
        try {
          reply = await get(src.path, pageParams(src, page, maxContentRating, wanted));
          results(reply);
        } catch (err) {
          if (page === 1) throw err;
          partial = true;
          break;
        }
        const candidates = reply.results.filter((item) => {
          if (!showable(item, src.type)) return false;
          const id = `${src.type}:${item.id}`;
          if (seen.has(id)) return false;
          seen.add(id);
          // A list takes no genre filter: its titles are narrowed here, before their certifications are read. Discover narrowed them already.
          return src.kind !== 'list' || !wanted.length || (Array.isArray(item.genre_ids) && item.genre_ids.some((g) => wanted.includes(String(g))));
        });
        const certs = await Promise.all(candidates.map((item) => certify(src.type, item.id)));
        candidates.forEach((item, i) => {
          const { rating, error } = certs[i];
          if (error) {
            partial = true;
            firstFailure ??= error;
          }
          // A title whose lookup failed is unrated (''): with a limit or a rating subset set it does not pass, so it is not shown (D210 2); with neither it is.
          if (ratingPasses(maxContentRating, ratings, rating ?? '')) found.push(toPoster(item, src.type, { rating: rating ?? '', names }));
        });
        if (found.length >= size || page >= (Number(reply.total_pages) || 1)) break;
      }
      if (!found.length && firstFailure) throw firstFailure;
      return Object.assign(found.slice(0, size), { partial });
    },

    /** A TMDB list has no collections or playlists: the selection never sets one. */
    async sourceItems() {
      throw noCollections();
    },

    /** The genres of the type this list or Discover choice shows, `{ key (the TMDB genre id), title }`. */
    async genres(libraryKey) {
      const names = await genreNames(sourceOf(libraryKey)?.type || 'movie');
      return [...names].map(([id, name]) => ({ key: id, title: name }));
    },

    async collections() {
      return [];
    },

    async playlists() {
      return [];
    },

    /** One title by its `ratingKey` (for the pin): its details with its certifications in the one request. A title TMDB no longer has is an `http` 404. */
    async item(ratingKey) {
      const id = parseRatingKey(ratingKey);
      if (!id) throw gone();
      const reply = await get(`${id.type}/${id.id}`, { language: LANGUAGE, append_to_response: id.type === 'movie' ? 'release_dates' : 'content_ratings' });
      if (!reply || typeof reply !== 'object' || !POSTER_PATH.test(String(reply.poster_path ?? ''))) throw gone();
      const names = new Map((Array.isArray(reply.genres) ? reply.genres : []).map((g) => [String(g?.id), g?.name]));
      return toPoster({ ...reply, genre_ids: [...names.keys()] }, id.type, { rating: certificationOf(id.type, id.type === 'movie' ? reply.release_dates : reply.content_ratings), names, source: 'static' });
    },

    /**
     * The certifications of several titles, for the cached titles' re-rating (D37): `{ ratingKey, contentRating }` of each title whose lookup answered.
     * One that failed is absent, which the caller stores as unrated (hidden under a limit). Not full posters: nothing else reads them.
     */
    async items(ratingKeys = []) {
      const wanted = [...new Set(ratingKeys.map((k) => String(k)))].map((k) => [k, parseRatingKey(k)]).filter(([, id]) => id);
      const certs = await Promise.all(wanted.map(([, id]) => certify(id.type, id.id)));
      return wanted.flatMap(([ratingKey, id], i) => (certs[i].error ? [] : [{ ratingKey, contentRating: certs[i].rating, source: 'static', tmdbId: id.id, tmdbType: id.type }]));
    },

    /** A poster file at about this width. No key: the image host needs none, and a key must never reach a URL (D210 4). */
    imageUrl(thumb, { width = 500 } = {}) {
      return `${IMAGE_BASE}${imageSize(Number(width) || 500)}${POSTER_PATH.test(String(thumb)) ? thumb : '/'}`;
    },
  };
}

/**
 * What the screens read of the TMDB "sign-in" (js/sources/index.js signInFlow): it has no code and no address, only the key typed in Settings, so it
 * has the label and the sentences, and none of the code flow's members.
 */
export const tmdbSignIn = {
  label: 'TMDB',
  needsAddress: false,
  needsKey: true,
  discoverServers: async () => [],
  firstReachable: async () => null,
  words: {
    asking: 'Enter your TMDB key in Settings.',
    ranOut: 'Enter your TMDB key in Settings.',
    unreachable: "Can't reach TMDB.",
    couldNotGet: (message) => `Could not reach TMDB: ${message}`,
    httpsBlocked: 'This page is https, so the browser will block an http:// server.',
  },
};
