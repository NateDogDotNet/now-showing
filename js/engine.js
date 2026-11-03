// Decides which poster should be on screen. Has no DOM access so it can be unit-tested;
// main.js calls `decide()` on a timer and renders whatever it returns.

import { pickNowPlaying } from './plex.js';
import { anyLimitSet, sanitizeSlots } from './limit-schedule.js';
import { anyWindow, resolveSettings } from './profiles.js';
import { allows } from './ratings.js';
import { describeSelection, genreRequestValue, libraryShares, memberId, narrows, posterAllowed, selectionKey, selectionOf } from './selection.js';
import { chooseTitle, cleanDays, cleanWeighting, createShownStore } from './weighting.js';

const POOL_TTL_MS = 30 * 60 * 1000;
const PARTIAL_POOL_TTL_MS = 60 * 1000; // a pool built without a library that failed is kept for a minute, then the full selection is asked for again (D111 item 3)
const HISTORY = 10;
const RECHECK_BATCH = 100; // cached titles asked about per re-rating request (D37)
const RECHECK_REQUESTS = 3; // the poster cache holds at most 300 titles, so one pool load makes at most 3 requests

/** The display's own localStorage, or null where there is none (a unit test, a blocked browser). */
function defaultStorage() {
  try {
    return globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * `cachedKeys()` lists the rating keys in the offline poster cache and `onRatings(posters)` receives their current
 * ratings (D37). Both are optional: without them nothing is re-checked. `onMembers(id, keys)` hears the rating keys a collection or
 * playlist listed when it is loaded online (R-SEL-1), for the offline cache. `storage` keeps when each title was last shown, for the
 * no-repeat window (R-SEL-2): without one the display's localStorage is used, and failing that the record lives in memory.
 */
export function createEngine({ client, getSettings, now = () => Date.now(), random = Math.random, cachedKeys = () => [], onRatings = () => {}, onMembers = () => {}, storage = defaultStorage() }) {
  let current = null;
  let session = null; // the latest now-playing snapshot (what the last decide() saw), null when none
  let lastRotateAt = 0;
  let pool = [];
  let poolKey = '';
  let poolAt = 0;
  let poolPartial = false; // the pool is missing a library whose request failed
  let partialNow = false; // set by fetchSelection while it builds the pool
  const recent = [];
  const shownStore = createShownStore({ storage });

  // The settings as decide() reads them: the resolver's (R-FILT-2, R-PROF-1). `maxContentRating` is the limit in force at this moment
  // and, while a slot names a profile, that profile's selection, weighting, window, now-playing rule and frame are laid over the
  // sheet's, so the pool key, the Plex request, the re-check, the permit test and the empty-card advice below all follow the
  // time-of-day slot, and none of them can read the base limit by mistake. `limitSet` says whether the base limit or any slot (or its
  // profile) sets a limit (the D37 re-check runs then, even in a slot that sets no limit, so the cache's ratings are fresh when a
  // stricter slot starts).
  const inForce = () => {
    const s = getSettings();
    return { ...resolveSettings(s, new Date(now())), limitSet: anyLimitSet(s) };
  };

  /**
   * The posters of the selection (R-SEL-1, D107). A collection or playlist replaces the libraries and takes no genre filter. Otherwise
   * every chosen library is asked for, the pool size split by title count (one library is asked for the whole size and no count). A rating
   * subset is asked for only as far as the limit in force allows, and none left means no request. Posters say where they came from, for
   * the offline cache.
   */
  async function fetchSelection(sel, s) {
    partialNow = false;
    const limit = s.maxContentRating;
    const base = { unwatchedOnly: s.unwatchedOnly, size: s.randomPoolSize };
    const ratings = sel.ratings.filter((r) => allows(limit, r));
    if (sel.ratings.length && !ratings.length) return []; // a subset the limit leaves empty asks for nothing, from a collection or playlist as from a library
    if (sel.source) {
      // The limit and the rating subset go with the request: the client drops what they reject before it cuts the list.
      const opts = { ...base };
      if (limit) opts.maxContentRating = limit;
      if (sel.ratings.length) opts.ratings = ratings;
      const posters = await client.sourceItems({ kind: sel.source.kind, key: sel.source.key }, opts);
      if (posters.listed) onMembers(memberId(sel.source), posters.listed); // the whole listing, for the cache to drop what left it
      return posters.map((p) => ({ ...p, members: [memberId(sel.source)] }));
    }
    const keys = sel.libraries.map((l) => l.key);
    const sizes = keys.length === 1 ? [base.size] : libraryShares(base.size, await Promise.all(keys.map((k) => client.libraryCount(k))));
    const settled = await Promise.allSettled(
      keys.map(async (libraryKey, i) => {
        if (sizes[i] < 1) return [];
        const request = { libraryKey, unwatchedOnly: base.unwatchedOnly, size: sizes[i], maxContentRating: limit };
        if (sel.genres.length) request.genres = sel.genres.map(genreRequestValue);
        if (sel.ratings.length) request.ratings = ratings;
        return (await client.pool(request)).map((p) => ({ ...p, libraryKey }));
      }),
    );
    // One library failing leaves the pool to the others (D110 item 3). When the ones that answered gave nothing, that is a connection
    // problem too, not an empty selection to loosen (D112 item 1): the first rejection is reported, as when every library fails.
    const failed = settled.find((r) => r.status === 'rejected');
    const posters = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (failed && !posters.length) throw failed.reason;
    partialNow = Boolean(failed);
    return posters;
  }

  /** Does the server have a movie library the selection does not tick? A failed or missing answer says no: the advice is only given when it could help. */
  async function hasUntickedLibrary(sel) {
    try {
      const libs = await client.libraries?.();
      return Array.isArray(libs) && libs.some((l) => l.type === 'movie' && !sel.libraries.some((c) => c.key === l.key));
    } catch {
      return false;
    }
  }

  async function loadPool(s, sel) {
    const key = `${selectionKey(sel)}|${s.unwatchedOnly}|${s.randomPoolSize}|${s.maxContentRating}`;
    if (pool.length && key === poolKey && now() - poolAt < (poolPartial ? PARTIAL_POOL_TTL_MS : POOL_TTL_MS)) return pool;
    // The re-check (D37) is fetched alongside the pool request, not after it (D80). Plex is asked only for allowed
    // ratings (`client.pool` passes the limit); the local gate is `permitted()` at pick time, and nothing filters the
    // returned list here before `pool = loaded`. A pool failure rejects the load and applies nothing: with the server
    // unreachable every batch would fail too, and reporting them all unrated would empty the offline cache the caller
    // falls back to.
    // Once the pool request has failed, this load's re-check sends no further batch (D135 3): its results would be discarded.
    const load = { poolFailed: false };
    const [loaded, ratings] = await Promise.all([
      fetchSelection(sel, s).catch((err) => {
        load.poolFailed = true;
        throw err;
      }),
      s.limitSet ? fetchCachedRatings(load) : null,
    ]);
    if (ratings) onRatings(ratings);
    pool = loaded;
    poolKey = key;
    poolAt = now();
    poolPartial = partialNow;
    return pool;
  }

  /**
   * While a household limit is set, every online pool load re-fetches ALL the cached titles' ratings (D37): a title
   * re-rated upward since it was cached must not come back from the offline cache. The keys go in batches of
   * RECHECK_BATCH (`GET /library/metadata/<k1>,<k2>,...`), at most RECHECK_REQUESTS requests. A title the response
   * does not return, a batch that fails, and any key not asked about at all are stored as unrated, which the offline
   * fallback skips under a limit (fails closed). A title merely absent from the random pool says nothing about its rating.
   * `load.poolFailed` is set when this load's pool request fails: the loop then stops sending batches.
   * Returns the list for onRatings, or null when there is nothing cached.
   */
  async function fetchCachedRatings(load) {
    const keys = cachedKeys();
    if (!keys.length) return null;
    const byKey = new Map();
    for (let n = 0; n < RECHECK_REQUESTS && n * RECHECK_BATCH < keys.length; n++) {
      if (load.poolFailed) break;
      try {
        for (const p of await client.items(keys.slice(n * RECHECK_BATCH, (n + 1) * RECHECK_BATCH))) byKey.set(p.ratingKey, p);
      } catch {
        // nothing in this batch is confirmed: its keys are stored as unrated below
      }
    }
    return keys.map((k) => byKey.get(k) ?? { ratingKey: k, contentRating: '' });
  }

  /** The sessions to look at: those already in hand, else a fetch. A refused call (401/403) means nothing is playing (K18). */
  async function sessionList(sessions, sessionsError) {
    if (sessions !== undefined) return sessions;
    try {
      if (sessionsError) throw sessionsError; // the caller's poll already failed this tick: no second request (C8M1)
      return await client.sessions();
    } catch (err) {
      if (err?.kind === 'auth') return [];
      throw err;
    }
  }

  // The one place the limit is enforced for server-supplied posters: random picks and now-playing both
  // go through it, whatever Plex returned. (A pinned poster is exempt and never does.)
  const permitted = (s, poster) => allows(s.maxContentRating, poster.contentRating);
  // A random pick also has to be in the selection's rating subset and genre set, read from the poster's own fields (D107 ruling 6).
  const pickable = (s, sel, poster) => posterAllowed(sel, s.maxContentRating, poster);

  /**
   * One poster from the permitted pool. With weighting off and no window it is the draw the engine always made, with the last 10 shown
   * avoided. Otherwise (R-SEL-2, D113) the last-10 rule gives way: the draw is weighted over the pool minus the poster on screen and
   * minus the titles inside the no-repeat window.
   */
  function pickRandom(items, s) {
    const mode = cleanWeighting(s.weighting);
    const days = cleanDays(s.noRepeatDays);
    if (days === 0 && !anyWindow(getSettings())) shownStore.clear(); // no window anywhere keeps no record (D115 4); one profile's 0 clears nothing (D120 5)
    if (mode === 'off' && days === 0) return pickAvoidingRecent(items);
    const others = items.filter((p) => p.ratingKey !== current?.ratingKey);
    return chooseTitle(others.length ? others : items, { mode, days, shownAt: days > 0 ? shownStore.windowed(days, now()) : new Map(), now: now(), random });
  }

  function pickAvoidingRecent(items) {
    const fresh = items.filter((p) => !recent.includes(p.ratingKey) && p.ratingKey !== current?.ratingKey);
    const from = fresh.length ? fresh : items.filter((p) => p.ratingKey !== current?.ratingKey);
    const list = from.length ? from : items;
    return list[Math.floor(random() * list.length)] || null;
  }

  return {
    get current() {
      return current;
    },

    /**
     * The now-playing session seen by the latest decide(), as a poster descriptor with `viewOffset`, `duration`,
     * `playerTitle` and `paused`; null when nothing is playing, `showNowPlaying` is off, or the limit hides it.
     * Updated even when decide() returns null because the poster is unchanged.
     */
    get session() {
      return session;
    },

    /** Records what is actually displayed (including cached fallbacks). */
    shown(poster) {
      current = { ...poster, shownAt: now() };
      if (poster.source === 'random' || poster.source === 'cache') {
        lastRotateAt = now();
        recent.unshift(poster.ratingKey);
        recent.length = Math.min(recent.length, HISTORY);
        const days = cleanDays(inForce().noRepeatDays);
        if (days > 0) shownStore.record(poster.ratingKey, now(), days); // a poster from the offline cache counts too
        else if (!anyWindow(getSettings())) shownStore.clear();
      }
    },

    invalidate() {
      pool = [];
      poolKey = '';
    },

    /** Forgets every title shown. A Save with the no-repeat window at 0 calls it, so raising the window later starts empty (D116 2). */
    clearShown() {
      shownStore.clear();
    },

    /**
     * The session that counts as playback (honours `username` and `includeEpisodes`, even when
     * `showNowPlaying` is off), or null. Fetches no art and records nothing as shown; sleep mode
     * uses it to watch for playback while the screen is black. Throws PlexError like `decide()`.
     * Pass the `/status/sessions` result already in hand to avoid a second request.
     */
    async playing(sessions) {
      return pickNowPlaying(sessions ?? (await client.sessions()), getSettings());
    },

    /**
     * Returns `{ poster, reason }` when the display should change, or null to keep the
     * current poster. Throws PlexError on connection problems. `sessions` is a `/status/sessions`
     * result the caller already fetched this tick (one request per tick); omitted, it is fetched here.
     * `sessionsError` is the error of the caller's own failed sessions request this tick: it is not asked for again.
     */
    async decide({ force = false, sessions, sessionsError } = {}) {
      const s = inForce();

      // Now playing wins over everything; a pinned poster replaces random rotation.
      session = null;
      if (s.showNowPlaying) {
        let np = pickNowPlaying(await sessionList(sessions, sessionsError), s);
        if (np && s.limitNowPlaying !== false && !permitted(s, np)) np = null; // above the limit or unrated: nothing is playing
        session = np;
        if (np) {
          if (!force && current?.source === 'now-playing' && current.ratingKey === np.ratingKey) return null;
          return { poster: np, reason: np.user ? `now playing for ${np.user}` : 'now playing' };
        }
      }

      if (s.staticRatingKey) {
        if (!force && current?.ratingKey === s.staticRatingKey && current.source !== 'cache') return null;
        return { poster: await client.item(s.staticRatingKey), reason: 'static poster' };
      }

      const sel = selectionOf(s);
      if (!sel.libraries.length && !sel.source) {
        // A profile in force that chooses nothing is said, not left blank (D120 3); the household's own empty selection is as it was.
        if (s.profileName) throw Object.assign(new Error(`The profile \u201c${s.profileName}\u201d has no library or collection chosen. Edit it in Settings.`), { kind: 'empty' });
        return null;
      }
      const playbackEnded = current?.source === 'now-playing';
      const due = now() - lastRotateAt >= s.rotateSeconds * 1000;
      if (!force && !playbackEnded && !due && current) return null;

      const next = pickRandom((await loadPool(s, sel)).filter((p) => pickable(s, sel, p)), s);
      if (!next) {
        // Each piece of advice is given only when it could help: "unwatched only" must be on, a limit must be set (K54).
        // While the selection narrows, the advice also says how to widen it, in the same one sentence (D109 item 3, D110 item 4): "add a
        // library" only when the server has a movie library that is not ticked.
        const widen = !narrows(sel)
          ? []
          : sel.source
            ? [`use the libraries instead of the ${sel.source.kind}`, sel.ratings.length && 'tick fewer ratings']
            : [(await hasUntickedLibrary(sel)) && 'add a library', sel.genres.length && sel.ratings.length ? 'tick fewer genres or ratings' : sel.genres.length ? 'tick fewer genres' : sel.ratings.length && 'tick fewer ratings'];
        const advice = [s.unwatchedOnly && 'try turning off "unwatched only"', s.maxContentRating && (sanitizeSlots(s.limitSlots).length ? 'raise the limit or change the time slots' : 'raise the limit'), ...widen].filter(Boolean).join(' or ');
        const where = `${s.maxContentRating ? ` at or below ${s.maxContentRating}` : ''}${advice ? ` (${advice})` : ''}`;
        throw Object.assign(new Error(`No posters found in ${narrows(sel) ? describeSelection(sel) : 'that library'}${where}.`), { kind: 'empty' });
      }
      return { poster: next, reason: playbackEnded ? 'playback ended' : force ? 'manual refresh' : 'rotation' };
    },
  };
}
