// The poster selection (R-SEL-1, D60, D107): which movie libraries, genres, ratings, collection or playlist the random
// pool is drawn from. Pure functions, no DOM and no network, so the engine, the poster cache, Settings and the tests share
// one meaning. The household limit in force (R-FILT-2) is always a ceiling over everything here (D5): a rating subset is
// intersected with it and can never add an unrated or above-limit value.

import { LIMITS, allowedValues, allows, ratingRank } from './ratings.js';

const KINDS = ['collection', 'playlist'];
const isText = (v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
const textOf = (v) => (isText(v) ? String(v).trim() : '');
const lower = (s) => s.toLowerCase();

// ---- the stored shapes: each sanitiser turns junk into "nothing chosen" ----

/** Library keys: strings or numbers, trimmed, no blanks, no repeats. */
export function cleanKeys(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(textOf).filter(Boolean))];
}

/** Library names, kept beside the keys only to name the selection on the empty card. Anything else is ''. */
export function cleanNames(v) {
  return Array.isArray(v) ? v.map((n) => (typeof n === 'string' ? n.trim() : '')) : [];
}

/** Genres as `{ key, title }`: the title is required (the reply is checked against it), the key may be ''. One entry per title. */
export function cleanGenres(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  for (const g of v) {
    const title = g && typeof g === 'object' ? textOf(g.title) : '';
    if (!title || seen.has(lower(title))) continue;
    seen.add(lower(title));
    out.push({ key: textOf(g.key), title });
  }
  return out;
}

/** The chosen ratings: ladder values only (G, PG, PG-13, R, NC-17), once each, lowest first. */
export function cleanRatings(v) {
  if (!Array.isArray(v)) return [];
  return LIMITS.filter((r) => v.includes(r));
}

/** One collection or playlist as `{ kind, key, title }`, or null. */
export function cleanSource(v) {
  if (!v || typeof v !== 'object' || !KINDS.includes(v.kind)) return null;
  const key = textOf(v.key);
  return key ? { kind: v.kind, key, title: typeof v.title === 'string' ? v.title.trim() : '' } : null;
}

// ---- reading the settings ----

/**
 * The selection a settings object means. A 2.2 object with only `libraryKey` is one library and nothing else (D107 ruling 2).
 * `libraryKeys` win when present. The source, when set, replaces the libraries in what the pool reads (see `poolSource`).
 */
export function selectionOf(s) {
  const keys = cleanKeys(s.libraryKeys);
  const names = cleanNames(s.libraryNames);
  const libraries = keys.length
    ? keys.map((key, i) => ({ key, name: names[i] || '' }))
    : textOf(s.libraryKey)
      ? [{ key: textOf(s.libraryKey), name: typeof s.libraryName === 'string' ? s.libraryName : '' }]
      : [];
  return { libraries, genres: cleanGenres(s.genres), ratings: cleanRatings(s.ratings), source: cleanSource(s.source) };
}

/** Does the selection narrow the pool beyond one whole library? (More than one library, any genre, any rating subset, a collection or a playlist.) */
export function narrows(sel) {
  return sel.libraries.length > 1 || sel.genres.length > 0 || sel.ratings.length > 0 || sel.source !== null;
}

/** The id a cache entry records for membership of a collection or playlist. */
export const memberId = (source) => `${source.kind}:${source.key}`;

/** Equal when two selections would draw the same pool: names do not count. */
export function selectionKey(sel) {
  return JSON.stringify([
    sel.libraries.map((l) => l.key),
    sel.genres.map((g) => [g.key, lower(g.title)]),
    sel.ratings,
    sel.source ? memberId(sel.source) : '',
  ]);
}

// ---- the pool request ----

/**
 * Splits `total` posters across libraries in proportion to `counts` (their title counts), largest remainder, so the sizes always
 * add up to `total` (D107 ruling 3). A count that is unknown (null), or counts that are all zero, split evenly instead. A library with
 * titles never gets nothing: one that would is given a slot taken from the largest share (D112 item 2), as far as the total allows.
 */
export function libraryShares(total, counts) {
  const n = counts.length;
  if (!n) return [];
  const known = counts.every((c) => typeof c === 'number' && c >= 0) && counts.some((c) => c > 0);
  const weights = known ? counts : counts.map(() => 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const sizes = weights.map((w) => Math.floor((total * w) / sum));
  const order = weights.map((w, i) => [i, (total * w) % sum]).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  for (let left = total - sizes.reduce((a, b) => a + b, 0), k = 0; left > 0; left--, k++) sizes[order[k][0]]++;
  for (let i = 0; i < n; i++) {
    if (weights[i] <= 0 || sizes[i] > 0) continue;
    const donor = sizes.indexOf(Math.max(...sizes));
    if (sizes[donor] < 2) break; // nothing can spare a slot
    sizes[donor]--;
    sizes[i]++;
  }
  return sizes;
}

/**
 * The `contentRating` values to ask Plex for a rating subset: every value on a chosen rung, and only the chosen labels that the
 * limit allows. Empty when none is left: the caller sends no request then, because an empty filter would ask for everything.
 */
export function ratingValues(labels, limit) {
  const rungs = labels.filter((l) => allows(limit, l)).map((l) => LIMITS.indexOf(l));
  return allowedValues('NC-17').filter((v) => rungs.includes(ratingRank(v)));
}

/** What goes in the `genre` parameter: the filter key Plex lists, else the title. */
export const genreRequestValue = (g) => g.key || g.title;

// ---- the gates ----

const hasGenre = (titles, chosen) => Array.isArray(titles) && titles.some((t) => typeof t === 'string' && chosen.some((g) => lower(g.title) === lower(t)));
const onChosenRung = (labels, rating) => {
  const rank = ratingRank(rating);
  return rank !== null && labels.some((l) => LIMITS.indexOf(l) === rank);
};

/** The limit in force and the chosen ratings (none chosen: any), for one rating string. The one place both are read together. */
export const ratingPasses = (limit, ratings, rating) => allows(limit, rating) && (!ratings.length || onChosenRung(ratings, rating));

/**
 * May this poster, from the random pool, be drawn? The limit in force first (D5), then the rating subset, then (library sources
 * only) the genre set, read from the poster's own `genres`: a server that ignored a parameter cannot widen the pool.
 */
export function posterAllowed(sel, limit, poster) {
  if (!ratingPasses(limit, sel.ratings, poster.contentRating)) return false;
  if (!sel.source && sel.genres.length && !hasGenre(poster.genres, sel.genres)) return false;
  return true;
}

/**
 * May this offline-cache entry be drawn? Under the 2.2 selection (not narrowing) every entry may. Under a narrowing one the entry
 * must record that it belongs: its library, one of the genres, or membership of the collection or playlist. An entry without those
 * fields (cached before 2.3) is never drawn (D107 ruling 4). The rating subset is read from the entry's rating, under the limit.
 */
export function entryInSelection(entry, sel, limit) {
  if (!sel || !narrows(sel)) return true;
  if (sel.source) {
    if (!Array.isArray(entry.members) || !entry.members.includes(memberId(sel.source))) return false;
  } else {
    if (typeof entry.libraryKey !== 'string' || !sel.libraries.some((l) => l.key === entry.libraryKey)) return false;
    if (sel.genres.length && !hasGenre(entry.genres, sel.genres)) return false;
  }
  if (sel.ratings.length && !(allows(limit, entry.contentRating) && onChosenRung(sel.ratings, entry.contentRating))) return false;
  return true;
}

// ---- wording ----

const joined = (words, last) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} ${last} ${words[words.length - 1]}`);

/** The selection in words, for the empty card: "Movies and Kids Movies, genre Comedy, rated G or PG". */
export function describeSelection(sel) {
  const parts = [];
  if (sel.source) {
    parts.push(`the ${sel.source.kind}${sel.source.title ? ` "${sel.source.title}"` : ''}`);
  } else {
    parts.push(joined(sel.libraries.map((l) => l.name || `library ${l.key}`), 'and'));
    if (sel.genres.length) parts.push(`${sel.genres.length > 1 ? 'genres' : 'genre'} ${joined(sel.genres.map((g) => g.title), 'or')}`);
  }
  if (sel.ratings.length) parts.push(`rated ${joined(sel.ratings, 'or')}`);
  return parts.join(', ');
}

// ---- what Settings offers ----

/**
 * The ratings Settings offers: every rating up to the loosest limit the base limit or any time slot sets (D109 item 1), so a household
 * can narrow a looser evening slot to its own higher ratings. `base` is '' while the household toggle is off (no limit applies, slots
 * included). Only a choice: the engine still intersects it with the limit in force at draw time, so nothing above that is ever shown.
 */
export function offeredRatings(base, slots) {
  if (!LIMITS.includes(base)) return [...LIMITS];
  let top = LIMITS.indexOf(base);
  for (const slot of Array.isArray(slots) ? slots : []) {
    if (slot?.limit === '') return [...LIMITS]; // a "No limit" slot
    top = Math.max(top, LIMITS.indexOf(slot?.limit));
  }
  return LIMITS.slice(0, top + 1);
}

/**
 * Does the poster on screen still belong to the selection that is saved now? Asked when the saved selection draws nothing: a poster
 * that no longer matches (another library, genre or rating, not in the collection or playlist, above the limit in force) is taken
 * off so the empty card can name the selection (D110 item 1). A pinned or now-playing poster is not the selection's to judge. A
 * poster with no recorded library or membership stays under the 2.2 selection (as before) and fails closed under a narrowing one.
 */
export function posterMatches(sel, limit, poster) {
  if (poster.source !== 'random' && poster.source !== 'cache') return true;
  if (!posterAllowed(sel, limit, poster)) return false;
  if (sel.source) return Array.isArray(poster.members) && poster.members.includes(memberId(sel.source));
  if (typeof poster.libraryKey === 'string') return sel.libraries.some((l) => l.key === poster.libraryKey);
  return !narrows(sel);
}
