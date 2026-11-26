// Poster art from TMDB (R-ART-1, D64, D203, D210 5-6, D217): a poster that has a TMDB id (TMDB mode, or a server poster that carries `tmdbId`) can be shown as TMDB's
// textless poster, its poster in a chosen language, or its largest poster, when the household chose so and a TMDB key is set. Otherwise, and whenever TMDB has no
// such poster or cannot be reached, the source's own art is shown, with no error.
//
// The art is of the poster's own title: it is looked up by the poster's `tmdbId` and `tmdbType`, never by a title search. It is fetched as a blob and stored in the
// poster cache (the cache-first path and the cache limit), under a cache key that names TMDB and the id (`tmdb-art:movie:603:textless`) in the entry's `thumb`, so it
// never equals a server's thumb. The page then shows it from a same-origin object URL, so the fill (js/fill.js), which reads pixels, never meets a tainted canvas.
// The key goes only to api.themoviedb.org (js/sources/tmdb.js); no image address, cache key, message or log line carries it.

import { createSource } from './sources/index.js'; // the one way in to an adapter: the TMDB client is `createSource({ serverType: 'tmdb', tmdbKey })`
import { ART_MODES, defaultArtLanguage, LANGUAGES } from './settings.js'; // the choices live with the settings, which cannot import this module (the adapters it reaches import the settings)
export { ART_MODES, defaultArtLanguage, LANGUAGES };
const CODES = LANGUAGES.map((l) => l.code);

/** The prefix of a cache key of TMDB art. A server's own thumb never starts so (js/poster-cache.js reads it as TMDB data, kept at most 180 days). */
export const ART_KEY_PREFIX = 'tmdb-art:';

const ID = /^[0-9]+$/;
/** Is a key set? A key is what is left of the typed text after trimming and removing a leading `Bearer ` (as js/sources/tmdb.js reads it): nothing left is no key. */
const hasKey = (raw) => typeof raw === 'string' && raw.trim().replace(/^bearer(\s+|$)/i, '').trim() !== '';
const FILE = /^\/[A-Za-z0-9._-]+$/; // a plain file name under the image host: nothing that could change the host, the path or the query
const ORIGINAL = 100000; // a width no size reaches, so the image address names size `original`

/**
 * What to ask TMDB for this poster, or null when the source's own art is to be shown and TMDB is not asked at all (the decision table): no key, the default mode, a poster with
 * no TMDB id and type, a now-playing poster (it keeps the server's art, D217 2), or a language not on the list. Otherwise `{ type, id, mode, language, key, languages }`:
 * `key` is the cache key of this art, `languages` the `include_image_language` codes to ask for.
 */
export function artPlan(poster, settings) {
  const mode = settings?.posterArt;
  if (!ART_MODES.includes(mode) || mode === 'source') return null;
  if (!hasKey(settings.tmdbKey)) return null;
  if (!poster || poster.source === 'now-playing') return null;
  const type = poster.tmdbType;
  const id = String(poster.tmdbId ?? '');
  if ((type !== 'movie' && type !== 'tv') || !ID.test(id)) return null;
  const language = mode === 'language' ? String(settings.posterArtLanguage ?? '') : '';
  if (mode === 'language' && !CODES.includes(language)) return null;
  // Largest also uses the language chosen (D218), so its key names it: a change of language is another key and fetches again (D219 3).
  const chosen = CODES.includes(settings.posterArtLanguage) ? settings.posterArtLanguage : '';
  const part = mode === 'language' ? language : mode === 'largest' && chosen ? `largest-${chosen}` : mode;
  const languages = mode === 'textless' ? ['null'] : mode === 'language' ? ['null', language] : ['null', 'en', ...(chosen ? [chosen] : [])];
  return { type, id, mode, language, key: `${ART_KEY_PREFIX}${type}:${id}:${part}`, languages: [...new Set(languages)] };
}

const widthOf = (p) => (typeof p.width === 'number' && Number.isFinite(p.width) ? p.width : 0);
const voteOf = (p) => (typeof p.vote_average === 'number' && Number.isFinite(p.vote_average) ? p.vote_average : 0);

/**
 * The file (`/abc.jpg`) of the poster to show, from TMDB's list of a title's posters, or null (the source's art stays). Textless: the highest-voted poster whose `iso_639_1` is null.
 * A language: that language's highest-voted poster. Largest: the poster with the greatest width among the `allowed` languages (D218: `null` for no language, then codes; the
 * plan's `languages`), so a poster in a language nobody chose never wins even if TMDB sent it. A tie goes to the better voted, then the first listed. No other poster stands in.
 */
export function choosePoster(posters, mode, language = '', allowed = null) {
  const list = (Array.isArray(posters) ? posters : []).filter((p) => p && typeof p === 'object' && typeof p.file_path === 'string' && FILE.test(p.file_path));
  const pool = mode === 'textless' ? list.filter((p) => p.iso_639_1 === null) : mode === 'language' ? list.filter((p) => typeof language === 'string' && language !== '' && p.iso_639_1 === language) : mode === 'largest' ? (Array.isArray(allowed) ? list.filter((p) => allowed.includes(p.iso_639_1 === null ? 'null' : p.iso_639_1)) : list) : [];
  const rank = mode === 'largest' ? (p) => [widthOf(p), voteOf(p)] : (p) => [voteOf(p), 0];
  let best = null;
  for (const p of pool) {
    const [a1, a2] = rank(p);
    const [b1, b2] = best ? rank(best) : [-1, -1];
    if (!best || a1 > b1 || (a1 === b1 && a2 > b2)) best = p;
  }
  return best ? best.file_path : null;
}

/** D219 1: the art of one poster has this long in all (the images request and the image fetch together); past it the source's art shows. */
export const ART_BUDGET_MS = 4000;
/** D219 1, D220 1: after the TMDB API (the images request) fails by network, timeout or a refused key, no art is asked for this long (a change of the key or of the choice ends the pause at once). */
export const ART_PAUSE_MS = 10 * 60 * 1000;
const DOWN = ['network', 'timeout', 'auth'];

/**
 * The poster art of one display. `cache` is the poster cache, `getSettings()` the settings now, `fetchImpl` stands in for fetch in tests, `timers` ({ set, clear }) and `now` for
 * the clock. `image(poster, size, { skipCache })` resolves `{ blob, cached }` for the art of this poster, or null when the source's art is to be shown (it never rejects, and
 * never takes longer than the budget past a stored-copy lookup). A stored copy is used first, with no TMDB request; an entry older than 180 days is not (js/poster-cache.js),
 * so the art is fetched again.
 */
export function createArtwork({ cache, getSettings, fetchImpl = (...a) => fetch(...a), log = { warn() {} }, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) }, now = () => Date.now() } = {}) {
  let made = null; // { key, client }: the TMDB client of the key now set
  const clientFor = (key) => {
    if (made?.key !== key) made = { key, client: createSource({ serverType: 'tmdb', tmdbKey: key }, { fetchImpl }) };
    return made.client;
  };
  let pause = null; // { until, who }: `who` is the key and the choice it was made under; another key or choice ends it
  const whoOf = (settings) => `${settings.tmdbKey}\n${settings.posterArt}\n${settings.posterArtLanguage}`;

  return {
    async image(poster, size, { skipCache = false } = {}) {
      const settings = getSettings();
      const plan = artPlan(poster, settings);
      if (!plan) return null;
      const stored = { ...poster, thumb: plan.key };
      if (!skipCache) {
        const hit = await cache.lookup(stored, size).catch(() => null);
        if (hit) return { blob: hit, cached: true };
      }
      const who = whoOf(settings);
      const title = String(poster.title ?? '').slice(0, 60);
      if (pause && pause.who === who && now() < pause.until) return null; // TMDB failed a moment ago: the source's art, no request
      const ctrl = new AbortController();
      const over = Symbol('over');
      let timer;
      const budget = new Promise((resolve) => {
        timer = timers.set(() => {
          ctrl.abort();
          resolve(over);
        }, ART_BUDGET_MS);
      });
      let phase = 'images'; // what the budget is waiting on: only TMDB's API (the images request) pauses the art when it fails or overruns (D220 1)
      const work = (async () => {
        try {
          const client = clientFor(settings.tmdbKey);
          const posters = await client.images(plan.type, plan.id, plan.languages, { signal: ctrl.signal });
          if (ctrl.signal.aborted) return null; // the budget ended first: a late reply changes nothing
          phase = 'file';
          const file = choosePoster(posters, plan.mode, plan.language, plan.languages);
          if (!file) return null; // TMDB has no such poster: the source's art
          let res;
          try {
            res = await fetchImpl(client.imageUrl(file, { width: plan.mode === 'largest' ? ORIGINAL : size.width }), { signal: ctrl.signal });
          } catch {
            if (!ctrl.signal.aborted) log.warn(`No TMDB art for "${title}": could not reach the TMDB image host.`); // this poster only: the source's art, no pause
            return null;
          }
          if (!res.ok) return null;
          const blob = await res.blob();
          if (ctrl.signal.aborted) return null;
          cache.put(stored, blob, size).catch((err) => log.warn(`Could not cache poster art: ${err.message}`));
          return { blob, cached: false };
        } catch (err) {
          if (ctrl.signal.aborted) return null; // late: the budget has answered
          if (phase === 'images' && DOWN.includes(err?.kind)) pause = { until: now() + ART_PAUSE_MS, who };
          log.warn(`No TMDB art for "${title}": ${String(err?.message ?? 'failed').replace(/api_key=[^&\s]*/gi, 'api_key=…').slice(0, 120)}`); // the source's art shows
          return null;
        }
      })();
      try {
        const out = await Promise.race([work, budget]);
        if (out !== over) return out;
        if (phase === 'images') {
          pause = { until: now() + ART_PAUSE_MS, who };
          log.warn(`No TMDB art for "${title}": TMDB did not answer in ${ART_BUDGET_MS / 1000} seconds.`);
        } else {
          log.warn(`No TMDB art for "${title}": the image did not download in ${ART_BUDGET_MS / 1000} seconds.`); // this poster only, no pause
        }
        return null;
      } finally {
        timers.clear(timer);
      }
    },
  };
}
