// Keeps the most recently shown posters (image + metadata) in the Cache API so the
// display keeps cycling real artwork while the Plex server is unreachable.

import { allows } from './ratings.js';
import { entryInSelection } from './selection.js';

const CACHE_NAME = 'plex-posters-v1';
const INDEX_KEY = 'plexPoster.posterIndex';
const PREFIX = '/__posters__/';

const DEFAULT_LIMIT = 100;

/** The fields that say where a poster belongs: its library, its own genres, the collections or playlists it was listed in. */
function recorded(p) {
  return {
    ...(typeof p?.libraryKey === 'string' && p.libraryKey ? { libraryKey: p.libraryKey } : {}),
    ...(Array.isArray(p?.genres) && p.genres.length ? { genres: p.genres } : {}),
    ...(Array.isArray(p?.members) && p.members.length ? { members: p.members } : {}),
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
export function createPosterCache({ storage, limit = DEFAULT_LIMIT, caches = globalThis.caches } = {}) {
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
      const meta = { ratingKey: poster.ratingKey, title: poster.title, year: poster.year, thumb: poster.thumb, contentRating, ...(poster.duration ? { duration: poster.duration } : {}), ...membership, width: size.width, height: size.height, savedAt: Date.now() };
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
     */
    refreshRatings(posters) {
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
      if (!entry || entry.thumb !== poster.thumb || !(entry.width >= size.width)) return null;
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
     */
    async random(excludeKey, maxContentRating = '', selection = null) {
      const list = readIndex().filter((e) => allows(maxContentRating, e.contentRating) && entryInSelection(e, selection, maxContentRating));
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
