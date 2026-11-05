// Weighting and the no-repeat window (R-SEL-2, D64, D113). Pure functions plus one small store, no DOM and no network, so the
// engine, Settings and the tests share one meaning. Weighting only reorders chances inside the pool the engine has already
// filtered (the limit in force, the rating subset, the genres: D5); nothing here can let a title in.

import { belongsTo } from './selection.js';

export const WEIGHTINGS = ['off', 'unwatched', 'rated'];
export const MAX_DAYS = 30;
export const DAY_MS = 24 * 60 * 60 * 1000;
/** The display's own storage key for when each title was last shown. Not part of the settings, so it is never exported. */
export const HISTORY_KEY = 'plexPoster.shownAt';

const UNWATCHED_WEIGHT = 3;
const MAX_RATING = 10;

/** One of off / unwatched / rated; anything else is the default. */
export const cleanWeighting = (v, d = 'off') => (WEIGHTINGS.includes(v) ? v : d);

/** Whole days, 0 to 30 (0 = no window). Junk (non-numbers, booleans, arrays, blanks) gives the default. */
export function cleanDays(v, d = 0) {
  if (typeof v !== 'number' && !(typeof v === 'string' && v.trim() !== '')) return d;
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.min(MAX_DAYS, Math.max(0, Math.round(n)));
}

const finite = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN);

/** The rating a title is weighted by: `audienceRating`, else `rating`, else none (null). */
function ratingOf(p) {
  for (const v of [p.audienceRating, p.rating]) {
    const n = finite(v);
    if (Number.isFinite(n)) return Math.min(MAX_RATING, Math.max(0, n));
  }
  return null;
}

/**
 * How much chance a title has. Off: every title 1. Unwatched first: 3 for a title with no `viewCount` (or 0), 1 for a watched one.
 * Best reviewed first (audience score): 1 plus the rating (0 to 10), so a higher rating is drawn more often; a title with no rating gets 1, the lowest.
 */
export function weightOf(mode, p) {
  if (mode === 'unwatched') return Number(p.viewCount) > 0 ? 1 : UNWATCHED_WEIGHT;
  if (mode === 'rated') return 1 + (ratingOf(p) ?? 0);
  return 1;
}

/** One title drawn by weight with `random()`. Off, it is `floor(random() * length)`, the draw the engine always made. Null for no titles. */
export function drawWeighted(items, mode, random) {
  if (!items.length) return null;
  if (mode === 'off') return items[Math.floor(random() * items.length)] || null;
  const weights = items.map((p) => weightOf(mode, p));
  let left = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    left -= weights[i];
    if (left < 0) return items[i];
  }
  return items[items.length - 1];
}

const inside = (t, days, now) => now - t < days * DAY_MS;

/**
 * The store of when each title was last shown, kept in the display's own storage: `{ ratingKey: ms }` as JSON. A value that
 * does not parse as an object starts it empty; a single entry that is not a time is dropped. Storage that throws, or none, keeps
 * the record in memory for the session.
 */
export function createShownStore({ storage = null } = {}) {
  let mem = {};

  function read() {
    let raw;
    try {
      if (!storage) throw new Error('no storage');
      raw = storage.getItem(HISTORY_KEY);
    } catch {
      return { ...mem };
    }
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, t]) => typeof t === 'number' && Number.isFinite(t) && t >= 0));
  }

  function write(map) {
    mem = map;
    try {
      storage?.setItem(HISTORY_KEY, JSON.stringify(map));
    } catch {
      // full or blocked: the session keeps it in memory
    }
  }

  const keep = (map, days, now) => Object.fromEntries(Object.entries(map).filter(([, t]) => inside(t, days, now)));

  return {
    /** A title was shown at `now`: remember it, and forget what is past the `days` window. */
    record(ratingKey, now, days) {
      write(keep({ ...read(), [ratingKey]: now }, days, now));
    },
    /** Forgets every title shown: the window is 0, so the record is removed (storage is touched only when the key is there). */
    clear() {
      mem = {};
      try {
        if (storage && storage.getItem(HISTORY_KEY) !== null) storage.removeItem?.(HISTORY_KEY);
      } catch {
        // blocked: nothing more to do
      }
    },
    /** Forgets the titles that came from one server entry `{ id, carried }` and no others (D157 1, 2); a bare key is the carried entry's. */
    clearServer(server) {
      const all = read();
      const kept = Object.fromEntries(Object.entries(all).filter(([key]) => !belongsTo(key, server)));
      if (Object.keys(kept).length !== Object.keys(all).length) write(kept);
    },
    /** The titles shown within the last `days` days, as a Map of rating key to time shown. What is older is pruned from storage. */
    windowed(days, now) {
      const all = read();
      const kept = keep(all, days, now);
      if (Object.keys(kept).length !== Object.keys(all).length) write(kept);
      return new Map(Object.entries(kept));
    },
  };
}

/**
 * Draws one title from `items` (already filtered to the permitted pool, minus the poster on screen). With a window above 0, a title
 * shown inside it (per `shownAt`, a Map of rating key to time) is left out; when every title is inside it, the one shown least
 * recently is drawn, unweighted. Then the weights.
 */
export function chooseTitle(items, { mode, days, shownAt, now, random }) {
  if (!items.length) return null;
  let from = items;
  if (days > 0) {
    from = items.filter((p) => !(shownAt.has(p.ratingKey) && inside(shownAt.get(p.ratingKey), days, now)));
    if (!from.length) return items.reduce((best, p) => (shownAt.get(p.ratingKey) < shownAt.get(best.ratingKey) ? p : best));
  }
  return drawWeighted(from, mode, random);
}
