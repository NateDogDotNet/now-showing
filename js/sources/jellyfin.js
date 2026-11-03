// Jellyfin source adapter (R-SRC-2, D134, D141): the same interface as the Plex adapter (js/sources/index.js), spoken in
// Jellyfin's API. The mock server in scripts/mock-jellyfin.mjs is the only server this was run against; every request and
// field it invents is a (verify) row in docs/validation/real-server-extended.md. Shared MediaBrowser code (the header, the
// item mapping, the rating pick, the client and the request) is exported for the Emby adapter (js/sources/emby.js) to import.
//
// Requests carry the token in the `Authorization: MediaBrowser ...` header; the poster image URL carries it as `api_key`
// (an <img> cannot send a header), as the Plex image URL carries X-Plex-Token. The offline cache stores no token.
// Jellyfin's own parental controls are not relied on: the engine's allows() is the gate, and the OfficialRatings filter
// below is only an optimisation.

import { allowedValues, exactRating } from '../ratings.js';
import { ratingPasses, ratingValues } from '../selection.js';
import { SUMMARY_MAX, trimSummary } from '../fill.js';
import { toMs } from '../duration.js';
import { SourceError } from './errors.js';
import { buildUrl, timeoutSignal } from './http.js';

export const CLIENT_NAME = 'Now Showing';
const TICKS_PER_MS = 10_000; // RunTimeTicks and PositionTicks are 100 ns ticks (a (verify) row)
const FIELDS = 'CustomRating,Overview,Genres,GenreItems'; // not in a default item reply (a (verify) row)
const QUICK_CONNECT_LIFE_S = 10 * 60; // Jellyfin's Quick Connect code lasts 10 minutes (D134)

/** The `Authorization` header value: the client's identity, and the token once there is one. */
export function authHeader({ clientId = '', version = '', token = '' } = {}) {
  const q = (v) => String(v ?? '').replace(/"/g, '');
  const parts = [`Client="${q(CLIENT_NAME)}"`, `Device="${q(CLIENT_NAME)}"`, `DeviceId="${q(clientId)}"`, `Version="${q(version)}"`];
  if (token) parts.push(`Token="${q(token)}"`);
  return `MediaBrowser ${parts.join(', ')}`;
}

const text = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * The rating that counts for an item (D141 1): its `CustomRating` when that is not empty, else its `OfficialRating`, else ''.
 * It counts only when it is exactly a US film or TV value (exactRating in js/ratings.js, D141 5); anything else, `15` or `NR` or `pg` too, is '' (unknown).
 * A rating field that is present (not null, not left out) but is not a string is a reply this adapter does not read: the item is unrated, whatever
 * the other field holds, so it is hidden under any limit and never falls back to the other field (D147 1, D5).
 */
export function ratingOf(item) {
  if (!item || typeof item !== 'object') return '';
  const { CustomRating: custom, OfficialRating: official } = item;
  if ((custom != null && typeof custom !== 'string') || (official != null && typeof official !== 'string')) return '';
  return exactRating(text(custom) ? custom : official);
}

const number = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** Watched: the server's played flag, or, when it sends none, a play count above 0 (one rule for a collection, a playlist and, with the server's own IsUnplayed filter, the library pool; D143 5). */
const watched = (item) => (typeof item?.UserData?.Played === 'boolean' ? item.UserData.Played : number(item?.UserData?.PlayCount) > 0);
const hasImage = (item) => Boolean(text(item?.ImageTags?.Primary));
const genresOf = (item) => (Array.isArray(item?.Genres) ? item.Genres.filter((g) => typeof g === 'string' && g.trim() !== '').map((g) => g.trim()) : []);

/**
 * A Jellyfin item as the poster the engine reads (the interface comment in js/sources/index.js). An episode shows its series: the
 * series' id, title and poster, with its own rating as `contentRating` (D75) and the series' rating, when the caller could read one
 * (`seriesRating`, a string), apart for the offline cache (D73); without one the poster says its rating is the episode's.
 */
export function toPoster(item, source, { seriesRating } = {}) {
  const isEpisode = item.Type === 'Episode';
  const own = ratingOf(item);
  const plays = number(item.UserData?.PlayCount);
  const audience = number(item.CommunityRating);
  const genres = genresOf(item);
  const series = isEpisode && typeof seriesRating === 'string' && text(seriesRating) ? seriesRating : '';
  const id = String(isEpisode ? item.SeriesId : item.Id);
  return {
    ratingKey: id,
    title: (isEpisode ? item.SeriesName : item.Name) || item.Name || '',
    year: !isEpisode && item.ProductionYear ? String(item.ProductionYear) : '',
    thumb: id,
    source,
    user: '',
    contentRating: own,
    ...(series ? { seriesRating: series } : isEpisode ? { episodeRating: true } : {}),
    duration: Math.round(toMs(item.RunTimeTicks) / TICKS_PER_MS),
    summary: trimSummary(item.Overview, SUMMARY_MAX),
    ...(genres.length ? { genres } : {}),
    ...(plays ? { viewCount: Math.floor(plays) } : {}),
    ...(audience !== null ? { audienceRating: audience } : {}),
  };
}

/**
 * Picks the session poster to show from `sessions()`: the user filter, then the first playing one (a paused session after a
 * playing one), as Plex's pickNowPlaying does (D141 6). A movie, or an episode when `includeEpisodes`, with a poster to draw.
 */
export function pickNowPlaying(sessions, { username = '', includeEpisodes = true } = {}) {
  const want = username.trim().toLowerCase();
  const candidates = (sessions || [])
    .filter((s) => s?.NowPlayingItem)
    .filter((s) => s.NowPlayingItem.Type === 'Movie' ? hasImage(s.NowPlayingItem) : includeEpisodes && s.NowPlayingItem.Type === 'Episode' && text(s.NowPlayingItem.SeriesId) !== '')
    .filter((s) => !want || text(s.UserName).toLowerCase() === want);
  if (!candidates.length) return null;
  const rank = (s) => (s.PlayState?.IsPaused ? 2 : 0);
  candidates.sort((a, b) => rank(a) - rank(b));
  const s = candidates[0];
  const paused = Boolean(s.PlayState?.IsPaused);
  return {
    ...toPoster(s.NowPlayingItem, 'now-playing', { seriesRating: s.SeriesRating }),
    user: text(s.UserName),
    viewOffset: Math.round(toMs(s.PlayState?.PositionTicks) / TICKS_PER_MS),
    playerTitle: text(s.DeviceName),
    playerState: paused ? 'paused' : 'playing',
    paused,
  };
}

/** One JSON request. Every message names the server by `label` ('Jellyfin' or 'Emby'). Shared with the Emby adapter. */
export async function request(url, { method = 'GET', body, headers = {}, timeoutMs = 10000, fetchImpl = (...a) => fetch(...a), badLogin = false, label = 'Jellyfin' } = {}) {
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: timeoutSignal(timeoutMs),
    });
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new SourceError(timedOut ? `${label} did not respond in time.` : `Could not reach ${label} (network or CORS error).`, { kind: timedOut ? 'timeout' : 'network' });
  }
  if (res.status === 401 || res.status === 403) {
    throw new SourceError(badLogin ? `${label} did not accept that sign-in.` : `${label} rejected the token (unauthorised).`, { status: res.status, kind: 'auth' });
  }
  if (!res.ok) throw new SourceError(`${label} returned HTTP ${res.status}.`, { status: res.status, kind: 'http' });
  const raw = await res.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new SourceError(`Could not parse ${label} response.`, { kind: 'parse' });
  }
}

/**
 * The `Items` list of a reply. A reply with no `Items` array, or one whose entries are not objects, is not one this adapter recognises:
 * a SourceError of kind `parse` (D145 3, D147 1), never an empty list. Shared with the Emby adapter.
 */
export function itemsOf(reply, label = 'Jellyfin') {
  if (!reply || !Array.isArray(reply.Items) || reply.Items.some((i) => !i || typeof i !== 'object' || Array.isArray(i))) {
    throw new SourceError(`Could not read the ${label} reply: it holds no list of items.`, { kind: 'parse' });
  }
  return reply.Items;
}
const listParam = (values, sep = ',') => values.join(sep);

/** The server-side OfficialRatings filter values: only plain US values, which are what Jellyfin carries (an optimisation, not the gate). */
const serverRatings = (values) => values.filter((v) => !v.includes('/'));

export function createJellyfinClient({ serverUrl, token, clientId, version = '', fetchImpl = (...a) => fetch(...a) }) {
  return createMediaBrowserClient({ label: 'Jellyfin', serverUrl, token, headers: { Authorization: authHeader({ clientId, version, token }) }, fetchImpl, viewsPath: 'UserViews' });
}

/**
 * The adapter both servers share: the same paths, items and rating map (D134 3, D145). `label` names the server in messages, `headers`
 * carry its sign-in scheme, and `softSessions` makes a /Sessions failure other than a network error or a timeout mean "nothing playing"
 * (the Emby adapter: a 401, 403, 404 or an unreadable reply, D145 4) instead of an error. `viewsPath` is the route that lists a user's
 * libraries: Jellyfin's `UserViews`, Emby's `Users/{UserId}/Views`; `null` (an Emby display with no user id) is an `auth` error that asks for a new sign-in.
 */
export function createMediaBrowserClient({ label, serverUrl, token, headers, fetchImpl, softSessions = false, viewsPath = 'UserViews' }) {
  const get = (path, params = {}, opts = {}) => request(buildUrl(serverUrl, path, params), { ...opts, headers, fetchImpl, label });
  const items = (reply) => itemsOf(reply, label);
  const views = (opts = {}) => {
    if (!viewsPath) throw new SourceError(`${label} needs a new sign-in to list its libraries.`, { kind: 'auth' });
    return get(viewsPath, {}, opts);
  };
  const movies = (list) => list.filter((m) => m.Type === 'Movie' && hasImage(m));

  /** The items with these ids, with the fields a poster needs. */
  const byIds = async (ids) => (ids.length ? items(await get('Items', { Ids: listParam(ids), Recursive: 'true', Fields: FIELDS })) : []);

  return {
    label,

    /** Server identity; succeeds only when the address and the token are good (the public info alone would not prove the token). */
    async identity() {
      const info = await request(buildUrl(serverUrl, 'System/Info/Public'), { headers, fetchImpl, timeoutMs: 8000, label });
      if (!info || typeof info !== 'object' || Array.isArray(info)) throw new SourceError(`Could not read the ${label} reply: it is not server information.`, { kind: 'parse' });
      await views({ timeoutMs: 8000 });
      return { name: text(info.ServerName), version: text(info.Version), machineIdentifier: text(info.Id) };
    },

    async libraries() {
      const typeOf = { movies: 'movie', tvshows: 'show' };
      return items(await views())
        .filter((v) => typeof v.Id === 'string' && typeof v.Name === 'string')
        .map((v) => ({ key: v.Id, title: v.Name, type: typeOf[v.CollectionType] || String(v.CollectionType || '') }));
    },

    /** How many movies a library holds, from the TotalRecordCount of a request that asks for none; null on any error. */
    async libraryCount(key) {
      try {
        const n = (await get('Items', { ParentId: key, IncludeItemTypes: 'Movie', Recursive: 'true', Limit: 0 }, { timeoutMs: 8000 })).TotalRecordCount;
        return Number.isFinite(n) && n >= 0 ? n : null;
      } catch {
        return null;
      }
    },

    /**
     * What is playing: the sessions that hold an item. The playing items are read again as items, because a session's own item may
     * lack the `CustomRating` (D141 1), and an episode's series is read for its rating (D73). A series that cannot be read leaves
     * `SeriesRating` off, and its episode is treated as unrated for the cache. When the item request fails this throws, so no
     * session is shown on a rating that was not checked. A playing item the reply leaves out is rated unknown, not on the session's own rating.
     */
    async sessions() {
      let all;
      try {
        all = await get('Sessions');
      } catch (err) {
        if (!softSessions || err.kind === 'network' || err.kind === 'timeout') throw err;
        return []; // D145 4: any other /Sessions failure means no now-playing, never an error card
      }
      if (!Array.isArray(all)) {
        if (softSessions) return []; // an Emby reply that is not a list of sessions is the same as one that does not parse (D145 4)
        throw new SourceError(`Could not read the ${label} reply: sessions are not a list.`, { kind: 'parse' });
      }
      const live = all.filter((s) => s?.NowPlayingItem && typeof s.NowPlayingItem.Id === 'string');
      if (!live.length) return [];
      const ids = [...new Set(live.flatMap((s) => [s.NowPlayingItem.Id, s.NowPlayingItem.Type === 'Episode' ? s.NowPlayingItem.SeriesId : null]).filter((i) => typeof i === 'string' && i))];
      const found = new Map((await byIds(ids)).map((i) => [i.Id, i]));
      return live.map((s) => {
        // An item the re-read did not return was not checked: its own rating (and any CustomRating the session lacks) is not trusted, so it is unrated and hidden under any limit.
        const read = found.get(s.NowPlayingItem.Id);
        const item = read ? { ...s.NowPlayingItem, ...read } : { ...s.NowPlayingItem, OfficialRating: '', CustomRating: '' };
        const series = item.Type === 'Episode' ? found.get(item.SeriesId) : null;
        return { ...s, NowPlayingItem: item, ...(series ? { SeriesRating: ratingOf(series) } : {}) };
      });
    },

    /**
     * A random pool from one library: unwatched titles when asked, narrowed by genre ids, and, under a limit or a rating subset, by the
     * OfficialRatings the limit allows, oversampled 3x (at most 500). The filter is a convenience: the engine checks every poster.
     */
    async pool({ libraryKey, unwatchedOnly = true, size = 100, maxContentRating = '', genres = [], ratings = [] }) {
      const values = serverRatings(ratings.length ? ratingValues(ratings, maxContentRating) : allowedValues(maxContentRating));
      if (ratings.length && !values.length) return [];
      const reply = await get('Items', {
        ParentId: libraryKey,
        IncludeItemTypes: 'Movie',
        Recursive: 'true',
        SortBy: 'Random',
        Filters: unwatchedOnly ? 'IsUnplayed' : '',
        GenreIds: listParam(genres),
        OfficialRatings: listParam(values, '|'),
        Limit: maxContentRating || ratings.length ? Math.min(size * 3, 500) : size,
        Fields: FIELDS,
      });
      return movies(items(reply)).map((m) => toPoster(m, 'random'));
    },

    /** The movies of one collection (a BoxSet) or playlist: best scored first, at most `size` (3x under a limit or a rating subset). Only Movie items count (D141 7). */
    async sourceItems({ kind, key }, { unwatchedOnly = true, size = 100, maxContentRating = '', ratings = [] } = {}) {
      const reply = kind === 'playlist' ? await get(`Playlists/${encodeURIComponent(key)}/Items`, { Fields: FIELDS }) : await get('Items', { ParentId: key, Fields: FIELDS });
      const all = items(reply);
      const posters = movies(all)
        .filter((m) => !(unwatchedOnly && watched(m)) && ratingPasses(maxContentRating, ratings, ratingOf(m)))
        .sort((a, b) => (number(b.CommunityRating) ?? 0) - (number(a.CommunityRating) ?? 0))
        .slice(0, maxContentRating || ratings.length ? Math.min(size * 3, 500) : size)
        .map((m) => toPoster(m, 'random'));
      posters.listed = all.filter((m) => typeof m.Id === 'string').map((m) => m.Id);
      return posters;
    },

    /** The genres a library lists, as `{ key (the genre's id), title }`. */
    async genres(libraryKey) {
      return items(await get('Genres', { ParentId: libraryKey, IncludeItemTypes: 'Movie' }))
        .filter((g) => typeof g.Name === 'string' && g.Name.trim() !== '')
        .map((g) => ({ key: typeof g.Id === 'string' ? g.Id : '', title: g.Name.trim() }));
    },

    /** The collections (BoxSets) of the server; a BoxSet is not a child of a library, so the library does not narrow them and none is named (`library: ''`). */
    async collections() {
      return items(await get('Items', { IncludeItemTypes: 'BoxSet', Recursive: 'true' }))
        .filter((c) => typeof c.Id === 'string' && typeof c.Name === 'string')
        .map((c) => ({ key: c.Id, title: c.Name, smart: false, library: '' }));
    },

    async playlists() {
      return items(await get('Items', { IncludeItemTypes: 'Playlist', MediaTypes: 'Video', Recursive: 'true' }))
        .filter((p) => typeof p.Id === 'string' && typeof p.Name === 'string')
        .map((p) => ({ key: p.Id, title: p.Name }));
    },

    async item(id) {
      const m = (await byIds([id]))[0];
      if (!m || (m.Type === 'Movie' && !hasImage(m))) throw new SourceError('That library item no longer exists.', { kind: 'http', status: 404 });
      return toPoster(m, 'static');
    },

    /** Several items in ONE request; ids the server does not return are absent. No ids: no request. */
    async items(ids) {
      return (await byIds(ids)).map((m) => toPoster(m, 'static'));
    },

    nowPlaying(sessions, { username = '', includeEpisodes = true } = {}) {
      return pickNowPlaying(sessions, { username, includeEpisodes });
    },

    /** A resized poster; the token is the `api_key` query, as an <img> cannot send a header. */
    imageUrl(thumb, { width, height }) {
      return buildUrl(serverUrl, `Items/${encodeURIComponent(thumb)}/Images/Primary`, { maxWidth: Math.round(width), maxHeight: Math.round(height), quality: 90, api_key: token });
    },
  };
}

// ---- sign-in: Quick Connect, or a user name and password ----

/**
 * How a person signs in to the Jellyfin server at `serverUrl` (the shape js/sources/index.js documents for a flow). The code
 * members share the Plex flow's names, so the sheet and the first-run card poll them the same way: `createPin` asks for a Quick
 * Connect code, `checkPin` resolves to the access token once the code is approved and to null while it is pending, and throws an
 * error with `expired: true` once the server no longer knows the code. The password is sent once and never kept (D141 8).
 */
export function jellyfinSignIn({ serverUrl = '', fetchImpl = (...a) => fetch(...a), version = '' } = {}) {
  const call = (clientId, path, params, opts = {}) =>
    request(buildUrl(serverUrl, path, params), { ...opts, headers: { Authorization: authHeader({ clientId, version }) }, fetchImpl });
  const signedIn = (reply) => {
    if (typeof reply?.AccessToken !== 'string' || !reply.AccessToken) throw new SourceError('Jellyfin did not return an access token.', { kind: 'parse' });
    return { token: reply.AccessToken, userId: typeof reply.User?.Id === 'string' ? reply.User.Id : '' };
  };
  return {
    label: 'Jellyfin',
    needsAddress: true,
    serverUrl,

    /**
     * Is Quick Connect on? The server's answer: true or false (anything that is not `true` reads as off). A server that does not answer,
     * or answers with an error (network, timeout, http, parse), throws that SourceError: the address is wrong, which is not "off" (D143 1).
     */
    async quickConnectEnabled(clientId) {
      return (await call(clientId, 'QuickConnect/Enabled', {}, { timeoutMs: 8000 })) === true;
    },

    async createPin(clientId) {
      const r = await call(clientId, 'QuickConnect/Initiate', {}, { method: 'POST' });
      if (typeof r.Secret !== 'string' || !r.Secret || typeof r.Code !== 'string' || !r.Code) {
        throw new SourceError('Jellyfin did not return a Quick Connect code.', { kind: 'parse' });
      }
      return { id: r.Secret, code: r.Code, expiresIn: QUICK_CONNECT_LIFE_S };
    },

    async checkPin(clientId, secret) {
      let r;
      try {
        r = await call(clientId, 'QuickConnect/Connect', { secret });
      } catch (err) {
        if (err.status === 404) throw Object.assign(new SourceError('That Quick Connect code ran out.', { status: 404, kind: 'http' }), { expired: true });
        throw err;
      }
      if (r.Authenticated !== true) return null;
      return signedIn(await call(clientId, 'Users/AuthenticateWithQuickConnect', {}, { method: 'POST', body: { Secret: secret }, badLogin: true })).token;
    },

    /** Signs in with a user name and password: `{ token, userId }`. A wrong pair is an `auth` error. */
    async signInWithPassword(clientId, username, password) {
      return signedIn(await call(clientId, 'Users/AuthenticateByName', {}, { method: 'POST', body: { Username: username, Pw: password }, badLogin: true }));
    },

    /** The one server there is, at the address entered. */
    async discoverServers(clientId, token) {
      let name = '';
      try {
        name = text((await call(clientId, 'System/Info/Public', {}, { timeoutMs: 8000 })).ServerName);
      } catch {
        // the connection test reports an address that does not answer
      }
      return [{ name: name || 'Jellyfin', owned: true, accessToken: token, connections: [{ uri: serverUrl, local: true, relay: false, protocol: serverUrl.startsWith('https:') ? 'https' : 'http' }] }];
    },

    async firstReachable(connections, token, clientId) {
      for (const c of connections) {
        try {
          await createJellyfinClient({ serverUrl: c.uri, token, clientId, version, fetchImpl }).identity();
          return c.uri;
        } catch {
          // try the next one
        }
      }
      return null;
    },

    words: {
      asking: 'Asking Jellyfin for a Quick Connect code…',
      ranOut: 'That code ran out. Asking Jellyfin for a new one in 5 minutes…',
      unreachable: "Can't reach Jellyfin. Trying again soon…",
      couldNotGet: (message) => `Could not get a Quick Connect code from Jellyfin: ${message}`,
      httpsBlocked: 'This page is https, so the browser will block an http:// server. Use an https address for your Jellyfin server or serve the app over http on your LAN.',
    },
  };
}
