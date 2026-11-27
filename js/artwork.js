// Poster art from TMDB (R-ART-1, D64, D203, D210 5-6, D217): a poster that has a TMDB id (TMDB mode, or a server poster that carries `tmdbId`) can be shown as TMDB's
// textless poster, its poster in a chosen language, or its largest poster, when the household chose so and a TMDB key is set. Otherwise, and whenever TMDB has no
// such poster or cannot be reached, the source's own art is shown, with no error.
//
// Title as logo (R-ART-2, D221) also lives here: the same fetch (budget, pause, cache-first) for a title's logo, by the same id and type, in its own cache index (`logoPlan`, `chooseLogo`, `logo()`).
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

// ---- Title as logo (R-ART-2, D221): the logo of a title, by its own id and type, shown in place of the title line ----

/** The size a logo is stored and asked for at: w500, a logo size TMDB lists (the widest that is not `original`); an SVG is asked for at `original`, where TMDB keeps it. */
export const LOGO_SIZE = { width: 500, height: 200 };
/** The key of a logo's entry in the logo cache (its own index, so the offline poster rotation never meets it). */
const LOGO_ENTRY = (type, id) => `tmdb-logo:${type}:${id}`;

/**
 * What to ask TMDB for this poster's title logo, or null when no request is made at all and the title is text (D221): the setting is off, the title card is off, no key, or
 * the poster has no TMDB id and type. The Poster art choice does not matter. Otherwise `{ type, id, language, key, languages }`: `language` is the Poster art language
 * (D217 3; one not on the list is English), `languages` the `include_image_language` codes (that language, and none), `key` the cache key of the logo (it names the language).
 */
export function logoPlan(poster, settings) {
  if (settings?.titleLogo !== true || settings.showTitle !== true) return null;
  if (!hasKey(settings.tmdbKey)) return null;
  if (!poster || typeof poster !== 'object') return null;
  const type = poster.tmdbType;
  const id = String(poster.tmdbId ?? '');
  if ((type !== 'movie' && type !== 'tv') || !ID.test(id)) return null;
  const language = CODES.includes(settings.posterArtLanguage) ? settings.posterArtLanguage : 'en';
  return { type, id, language, key: `${ART_KEY_PREFIX}${type}:${id}:logo-${language}`, languages: [...new Set([language, 'null'])] };
}

/**
 * The file (`/abc.png`) of the logo to show, from TMDB's list of a title's logos, or null (the title is text): the highest-voted logo in `language`, else the highest-voted logo
 * with no language, else none. A logo in any other language never stands in (D221 1). A tie goes to the first listed.
 */
export function chooseLogo(logos, language = '') {
  const list = (Array.isArray(logos) ? logos : []).filter((p) => p && typeof p === 'object' && typeof p.file_path === 'string' && FILE.test(p.file_path));
  const best = (pool) => pool.reduce((top, p) => (!top || voteOf(p) > voteOf(top) ? p : top), null)?.file_path ?? null;
  return (typeof language === 'string' && language !== '' ? best(list.filter((p) => p.iso_639_1 === language)) : null) ?? best(list.filter((p) => p.iso_639_1 === null));
}

/** D223 1: a logo whose visible pixels have a mean relative luminance under this is not shown (the title card is near black): the title is text. 0.175 is 4.5:1 against black, WCAG's ratio for text. */
export const LOGO_MIN_LUMINANCE = 0.175;
const LINEAR = (byte) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
/**
 * The mean relative luminance (WCAG: linear light, 0 black to 1 white) of the visible pixels of canvas image data (RGBA bytes). A pixel is visible when its alpha is 32 or more, so a
 * transparent background is not ink. Nothing visible is 0.
 */
export function logoLuminance(data) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 32) continue;
    sum += 0.2126 * LINEAR(data[i]) + 0.7152 * LINEAR(data[i + 1]) + 0.0722 * LINEAR(data[i + 2]);
    n++;
  }
  return n ? sum / n : 0;
}

/** The browser's measure of a logo (D222 1): the blob is drawn small on a canvas (it is a same-origin blob, so the canvas is never tainted) and its visible pixels read. Null when it cannot be drawn. */
export async function measureLogo(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = 96;
    const h = Math.max(1, Math.round((w * (img.naturalHeight || 200)) / (img.naturalWidth || 500)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return logoLuminance(ctx.getImageData(0, 0, w, h).data);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The TMDB id and type a cached entry carries (D222 2): a TMDB-mode entry in its rating key (`movie:603`), an entry stored with TMDB art in its thumb (`tmdb-art:movie:603:textless`); else null. */
export function entryTmdb(entry) {
  const m = /^(movie|tv):([0-9]+)$/.exec(String(entry?.ratingKey ?? '')) ?? /^tmdb-art:(movie|tv):([0-9]+):/.exec(String(entry?.thumb ?? ''));
  return m ? { tmdbType: m[1], tmdbId: m[2] } : null;
}

/** The Cache API as the logo cache sees it: its own store, so clearing the posters never deletes a logo blob and clearing the logos never deletes a poster blob. Undefined where there is none. */
export const LOGO_STORE = 'plex-logos-v1';
export const logosIn = (caches) => (caches && typeof caches.open === 'function' ? { open: () => caches.open(LOGO_STORE), delete: () => caches.delete(LOGO_STORE) } : undefined);

/**
 * A fetch that answers the images route with the title's logos where the TMDB client reads posters (Q10): the client keeps the key, the header, the lookup cap and the signal,
 * and this module needs no second way to reach TMDB. Every other request, and every failure, passes through unchanged.
 */
const logosForPosters = (fetchImpl) => async (url, init) => {
  const res = await fetchImpl(url, init);
  if (!res.ok || !/\/images$/.test(new URL(String(url)).pathname)) return res;
  const raw = await res.text();
  try {
    const body = JSON.parse(raw);
    return new Response(JSON.stringify({ ...body, posters: Array.isArray(body?.logos) ? body.logos : [] }), { status: res.status });
  } catch {
    return new Response(raw, { status: res.status });
  }
};

/**
 * The poster art of one display. `cache` is the poster cache, `logoCache` the cache of logos (another index; by default the same cache, whose entries it keys apart), `measure(blob)` the luminance of a logo (D222 1; tests stand in), `getSettings()`
 * the settings now, `fetchImpl` stands in for fetch in tests, `timers` ({ set, clear }) and `now` for the clock. `image(poster, size, { skipCache })` resolves `{ blob, cached }` for
 * the art of this poster, or null when the source's art is to be shown (it never rejects, and never takes longer than the budget past a stored-copy lookup). A stored copy is used
 * first, with no TMDB request; an entry older than 180 days is not (js/poster-cache.js), so the art is fetched again. `logo(poster, { skipCache })` is the same for the title's logo.
 */
export function createArtwork({ cache, logoCache = cache, getSettings, fetchImpl = (...a) => fetch(...a), log = { warn() {} }, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) }, now = () => Date.now(), measure = measureLogo } = {}) {
  const made = { poster: null, logo: null }; // { key, client }: the TMDB client of the key now set, for posters and for logos
  const clientFor = (which, key) => {
    if (made[which]?.key !== key) made[which] = { key, client: createSource({ serverType: 'tmdb', tmdbKey: key }, { fetchImpl: which === 'logo' ? logosForPosters(fetchImpl) : fetchImpl }) };
    return made[which].client;
  };
  const readable = async (blob) => {
    try {
      return (await measure(blob)) >= LOGO_MIN_LUMINANCE;
    } catch {
      return false; // a logo that cannot be measured is not shown
    }
  };
  const logoEntry = (plan, poster) => ({ ratingKey: LOGO_ENTRY(plan.type, plan.id), title: poster.title, thumb: plan.key });
  let pause = null; // { until, who }: `who` is the key and the choice it was made under; another key or choice ends it. One pause for the art and the logo: both ask the same API.
  const whoOf = (settings) => `${settings.tmdbKey}\n${settings.posterArt}\n${settings.posterArtLanguage}`;

  /**
   * One title's image, as the art and the logo both fetch it: a stored copy first, then the pause, then the budget (images request and file together) and the cache. `what` is
   * `{ which, noun, plan, stored, store, size, choose(list), width(file) }`. Null is "nothing to show".
   */
  async function fetchOne(settings, poster, what, skipCache) {
    const { which, noun, plan, stored, store, size } = what;
    if (!skipCache) {
      const hit = await store.lookup(stored, size).catch(() => null);
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
        const client = clientFor(which, settings.tmdbKey);
        const list = await client.images(plan.type, plan.id, plan.languages, { signal: ctrl.signal });
        if (ctrl.signal.aborted) return null; // the budget ended first: a late reply changes nothing
        phase = 'file';
        const file = what.choose(list);
        if (!file) return null; // TMDB has no such image: the source's art, or the title as text
        let res;
        try {
          res = await fetchImpl(client.imageUrl(file, { width: what.width(file) }), { signal: ctrl.signal });
        } catch {
          if (!ctrl.signal.aborted) log.warn(`No TMDB ${noun} for "${title}": could not reach the TMDB image host.`); // this title only, no pause
          return null;
        }
        if (!res.ok) return null;
        const blob = await res.blob();
        if (ctrl.signal.aborted) return null;
        store.put(stored, blob, size).catch((err) => log.warn(`Could not cache poster ${noun}: ${err.message}`));
        return { blob, cached: false };
      } catch (err) {
        if (ctrl.signal.aborted) return null; // late: the budget has answered
        if (phase === 'images' && DOWN.includes(err?.kind)) pause = { until: now() + ART_PAUSE_MS, who };
        log.warn(`No TMDB ${noun} for "${title}": ${String(err?.message ?? 'failed').replace(/api_key=[^&\s]*/gi, 'api_key=…').slice(0, 120)}`); // the source's art shows
        return null;
      }
    })();
    try {
      const out = await Promise.race([work, budget]);
      if (out !== over) return out;
      if (phase === 'images') {
        pause = { until: now() + ART_PAUSE_MS, who };
        log.warn(`No TMDB ${noun} for "${title}": TMDB did not answer in ${ART_BUDGET_MS / 1000} seconds.`);
      } else {
        log.warn(`No TMDB ${noun} for "${title}": the image did not download in ${ART_BUDGET_MS / 1000} seconds.`); // this title only, no pause
      }
      return null;
    } finally {
      timers.clear(timer);
    }
  }

  return {
    async image(poster, size, { skipCache = false } = {}) {
      const settings = getSettings();
      const plan = artPlan(poster, settings);
      if (!plan) return null;
      const what = {
        which: 'poster',
        noun: 'art',
        plan,
        stored: { ...poster, thumb: plan.key },
        store: cache,
        size,
        choose: (posters) => choosePoster(posters, plan.mode, plan.language, plan.languages),
        width: () => (plan.mode === 'largest' ? ORIGINAL : size.width),
      };
      return fetchOne(settings, poster, what, skipCache);
    },

    /**
     * The logo of this poster's title: `{ blob, cached }`, or null (no request was made, TMDB has none, it failed or was slow, or the logo is too dark to read on the title card, D222 1): the title
     * is then text. A dark logo is not replaced by another. It never rejects.
     */
    async logo(poster, { skipCache = false } = {}) {
      const settings = getSettings();
      const plan = logoPlan(poster, settings);
      if (!plan) return null;
      const what = {
        which: 'logo',
        noun: 'logo',
        plan,
        stored: logoEntry(plan, poster),
        store: logoCache,
        size: LOGO_SIZE,
        choose: (logos) => chooseLogo(logos, plan.language),
        width: (file) => (/\.svg$/i.test(file) ? ORIGINAL : LOGO_SIZE.width),
      };
      const got = await fetchOne(settings, poster, what, skipCache);
      return got && (await readable(got.blob)) ? got : null;
    },

    /**
     * The stored logo of a cached entry, offline (D222 2): the entry carries its TMDB id (`entryTmdb`), and the logo index holds a logo for it under the rules in force now. No request is made, ever. Null is text.
     */
    async cachedLogo(entry) {
      const ids = entryTmdb(entry);
      if (!ids) return null;
      const plan = logoPlan({ ...entry, ...ids }, getSettings());
      if (!plan) return null;
      const hit = await logoCache.lookup(logoEntry(plan, entry), LOGO_SIZE).catch(() => null);
      return hit && (await readable(hit)) ? { blob: hit, cached: true } : null;
    },
  };
}
