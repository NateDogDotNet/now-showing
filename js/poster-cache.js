// Keeps the most recently shown posters (image + metadata) in the Cache API so the
// display keeps cycling real artwork while the media server is unreachable. Entries are keyed by the server's own id (`ratingKey`);
// an index written by 2.3.1 has bare keys, which read as Plex entries: nothing is rewritten or migrated (D134 ruling 2).

import { allows } from './ratings.js';
import { belongsTo, entryInSelection } from './selection.js';

const CACHE_NAME = 'plex-posters-v1';
const INDEX_KEY = 'plexPoster.posterIndex';
const PREFIX = '/__posters__/';

const DEFAULT_LIMIT = 100;

/** How long a TMDB image or reply may be kept (D203 8, D210 6): 180 days, counted from the time the entry was stored on this display. */
export const TMDB_MAX_AGE_MS = 180 * 86_400_000;
/** A TMDB poster's `ratingKey` (`movie:603`, `tv:1399`): no other source's id has this form. */
const TMDB_KEY = /^(movie|tv):[0-9]+$/;
/** The `thumb` of an entry that holds TMDB art (js/artwork.js): `tmdb-art:movie:603:textless`. A server's own thumb never has this form. */
const TMDB_ART = /^tmdb-art:(movie|tv):[0-9]+:/;

/**
 * Is this entry too old to serve (D210 6, 7)? Only a TMDB entry can be, and so can an entry that holds TMDB art (a server's poster shown from TMDB, whatever its own id): the age is `now - savedAt`, and 180 days exactly is expired; an entry with no stored time
 * (or one that is not a finite number) or with a time in the future is expired too. The other sources' entries never are (their behaviour is as it was).
 */
export function expired(entry, now) {
  if (!TMDB_KEY.test(String(entry?.ratingKey ?? '')) && !TMDB_ART.test(String(entry?.thumb ?? ''))) return false;
  const saved = entry.savedAt;
  return typeof saved !== 'number' || !Number.isFinite(saved) || saved > now || now - saved >= TMDB_MAX_AGE_MS;
}

/** The fields that say where a poster belongs: its library, its own genres, its studios or company ids, the collections or playlists it was listed in. */
function recorded(p) {
  return {
    ...(typeof p?.libraryKey === 'string' && p.libraryKey ? { libraryKey: p.libraryKey } : {}),
    ...(Array.isArray(p?.genres) && p.genres.length ? { genres: p.genres } : {}),
    ...(Array.isArray(p?.members) && p.members.length ? { members: p.members } : {}),
    ...(Array.isArray(p?.studios) && p.studios.length ? { studios: p.studios } : {}), // a server's studio names (Run 13), so a house list can narrow offline
    ...(Array.isArray(p?.companyIds) && p.companyIds.length ? { companyIds: p.companyIds } : {}), // a TMDB title's company ids
  };
}

/** The memberships an entry already has plus the poster's, once each: a title can be in several collections and playlists. */
function joined(before, poster) {
  const have = Array.isArray(before?.members) ? before.members : [];
  const add = Array.isArray(poster?.members) ? poster.members : [];
  const all = [...new Set([...have, ...add])];
  return all.length ? { members: all } : {};
}

// `limit` is a number or a function returning one, re-read on every put so a settings change applies.
export function createPosterCache({ storage, limit = DEFAULT_LIMIT, caches = globalThis.caches, now = () => Date.now() } = {}) {
  const maxEntries = () => {
    const v = typeof limit === 'function' ? limit() : limit;
    const numeric = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '');
    const n = numeric ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 1 ? n : DEFAULT_LIMIT; // junk or < 1 falls back to the default, never empties the cache
  };
  const available = Boolean(caches && typeof caches.open === 'function');

  const readIndex = () => {
    try {
      const list = JSON.parse(storage.getItem(INDEX_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };
  const writeIndex = (list) => {
    try {
      storage.setItem(INDEX_KEY, JSON.stringify(list));
    } catch {
      // storage full or blocked — cache still works for this session
    }
  };
  const keyUrl = (ratingKey) => new URL(PREFIX + encodeURIComponent(ratingKey), location.origin).toString();

  return {
    available,

    entries() {
      return readIndex();
    },

    /** Stores a poster blob (rendered at `size`), most recent first, evicting beyond `limit`. */
    async put(poster, blob, size = {}) {
      if (!available) return;
      const cache = await caches.open(CACHE_NAME);
      await cache.put(keyUrl(poster.ratingKey), new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } }));
      // An episode's own rating is not its show's (D73): keep the show's stored rating; a show never seen stays unrated (hidden under a limit).
      const before = readIndex().find((e) => e.ratingKey === poster.ratingKey);
      const stored = before?.contentRating;
      const contentRating = poster.seriesRating || (poster.episodeRating ? stored || '' : poster.contentRating || '');
      // Where it belongs (R-SEL-1): the library and genres the poster says replace what the entry recorded (a poster that says nothing, the playing title or a pin, keeps it); memberships accumulate.
      const membership = { ...recorded(before), ...recorded(poster), ...joined(before, poster) };
      // A TMDB title also records when its rating was last read (`checkedAt`, D211 3): what it was stored with was read just now.
      const meta = { ratingKey: poster.ratingKey, title: poster.title, year: poster.year, thumb: poster.thumb, contentRating, ...(poster.duration ? { duration: poster.duration } : {}), ...membership, width: size.width, height: size.height, savedAt: now(), ...(TMDB_KEY.test(String(poster.ratingKey)) ? { checkedAt: now() } : {}) };
      const list = [meta, ...readIndex().filter((e) => e.ratingKey !== poster.ratingKey)];
      const evicted = list.splice(maxEntries());
      writeIndex(list);
      await Promise.all(evicted.map((e) => cache.delete(keyUrl(e.ratingKey))));
    },

    /**
     * Posters seen online carry their current ratings: store them, so a re-rated title does not keep its old rating
     * for the offline fallback. One index read and at most one index write for the whole list. Only the rating of an
     * existing entry changes (no re-order, no blob write); nothing is written when every rating already matches or
     * no poster is cached. An episode's own rating is not its show's (D73): without a series rating it changes nothing (D75).
     * `checked` (a Set of rating keys, D211 3) names the titles whose rating was really read just now: a TMDB entry among them records the time (`checkedAt`);
     * the engine asks for the TMDB entries checked longest ago first, and one with no `checkedAt` counts as checked longest ago. Other sources' entries record nothing.
     */
    refreshRatings(posters, { checked } = {}) {
      const list = readIndex();
      let changed = false;
      for (const poster of posters) {
        if (poster.episodeRating && !poster.seriesRating) continue; // its rating is the episode's, not the show's (D73)
        const entry = list.find((e) => e.ratingKey === poster.ratingKey);
        if (!entry) continue;
        const contentRating = poster.seriesRating || poster.contentRating || '';
        if (entry.contentRating !== contentRating) {
          entry.contentRating = contentRating;
          changed = true;
        }
        if (checked?.has(poster.ratingKey) && TMDB_KEY.test(entry.ratingKey) && entry.checkedAt !== now()) {
          entry.checkedAt = now();
          changed = true;
        }
        // An entry cached before 2.3 learns where it belongs the first time it is seen online under a selection.
        for (const [field, value] of Object.entries({ ...recorded(poster), ...joined(entry, poster) })) {
          if (JSON.stringify(entry[field]) === JSON.stringify(value)) continue;
          entry[field] = value;
          changed = true;
        }
      }
      if (changed) writeIndex(list);
    },

    /**
     * A collection's or playlist's whole listing was just loaded online (`id` is `collection:<id>` or `playlist:<id>`, `listedKeys` every
     * rating key it listed): cached entries that recorded that membership but are no longer listed lose it, so offline never draws a title
     * that left the list. Entries of other sources and entries with no membership are untouched; nothing is written when nothing changes.
     */
    syncMembers(id, listedKeys) {
      const listed = new Set(listedKeys.map(String));
      const list = readIndex();
      let changed = false;
      for (const entry of list) {
        if (!Array.isArray(entry.members) || !entry.members.includes(id) || listed.has(entry.ratingKey)) continue;
        entry.members = entry.members.filter((m) => m !== id);
        if (!entry.members.length) delete entry.members;
        changed = true;
      }
      if (changed) writeIndex(list);
    },

    /**
     * Drops everything that belongs to one server entry `{ id, carried }` (D157 1, 2): its index entries and their blobs, and no entry of any
     * other server. An id stored by 2.4.0 (no server id) is the carried entry's. Used when a server is removed or turns out to be another server.
     */
    async clearServer(server) {
      const list = readIndex();
      const gone = list.filter((e) => belongsTo(e.ratingKey, server));
      if (!gone.length) return;
      writeIndex(list.filter((e) => !belongsTo(e.ratingKey, server)));
      if (!available) return;
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(gone.map((e) => cache.delete(keyUrl(e.ratingKey))));
    },

    /** Drops one poster (blob and index entry), e.g. when its stored blob proves undecodable. */
    async delete(ratingKey) {
      writeIndex(readIndex().filter((e) => e.ratingKey !== ratingKey));
      if (!available) return;
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(keyUrl(ratingKey));
    },

    async get(ratingKey) {
      if (!available) return null;
      const cache = await caches.open(CACHE_NAME);
      const res = await cache.match(keyUrl(ratingKey));
      return res ? res.blob() : null;
    },

    /**
     * The stored blob when it is still valid for `poster` at `size`: same thumb and a stored width at
     * least as large as requested. Any other outcome, including an error, is a miss (null). Read-only:
     * no cache write and no index re-order, so a hit costs no flash/SD writes.
     */
    async lookup(poster, size) {
      if (!available) return null;
      const entry = readIndex().find((e) => e.ratingKey === poster.ratingKey);
      if (!entry || entry.thumb !== poster.thumb || !(entry.width >= size.width) || expired(entry, now())) return null; // an expired TMDB image is fetched again (D210 6)
      try {
        return await this.get(poster.ratingKey);
      } catch {
        return null;
      }
    },

    /**
     * A random cached poster other than `excludeKey`, with its blob. While `maxContentRating` is set, entries
     * above it and entries with no stored rating (cached before 2.1) are never returned. While `selection` narrows the pool
     * (js/selection.js), only entries that record belonging to it are (D107 ruling 4); an entry without the fields never is.
     * `known(ratingKey)` says whether the entry's server is still in the household's list (default: yes), so an entry left by a server that
     * is gone is never drawn, however it got there. A server that is only down is still in the list: its entries are drawn.
     */
    async random(excludeKey, maxContentRating = '', selection = null, known = () => true) {
      const at = now();
      const list = readIndex().filter((e) => known(e.ratingKey) && !expired(e, at) && allows(maxContentRating, e.contentRating) && entryInSelection(e, selection, maxContentRating)); // an expired TMDB entry is never shown, offline included (D210 7)
      const pool = list.length > 1 ? list.filter((e) => e.ratingKey !== excludeKey) : list;
      for (const meta of pool.sort(() => Math.random() - 0.5)) {
        const blob = await this.get(meta.ratingKey);
        if (blob) return { poster: { ...meta, source: 'cache' }, blob };
      }
      return null;
    },

    async clear() {
      writeIndex([]);
      if (available) await caches.delete(CACHE_NAME);
    },
  };
}
