// Minimal Plex Media Server + plex.tv client.
//
// Requests deliberately stay CORS-"simple" (GET/POST, only an Accept header, token in
// the query string) so browsers don't send a preflight that some Plex servers reject.

import { allowedValues } from '../ratings.js';
import { ratingPasses, ratingValues } from '../selection.js';
import { SUMMARY_MAX, trimSummary } from '../fill.js';
import { toMs } from '../duration.js';
import { PLAYER_ID_MAX } from '../settings.js';
import { SourceError } from './errors.js';
import { buildUrl, timeoutSignal } from './http.js';

// buildUrl lives in http.js; it is re-exported so that tests/plex.test.js, which imports it from here, is unchanged.
export { buildUrl };

export const PRODUCT = 'Now Showing';
const PLEX_TV = 'https://plex.tv';

/** Converts a Plex XML MediaContainer into the same shape as the JSON API. */
export function xmlToContainer(doc) {
  const root = doc.documentElement;
  if (!root || root.nodeName === 'parsererror' || doc.getElementsByTagName('parsererror').length) {
    throw new SourceError('Could not parse Plex response.', { kind: 'parse' });
  }
  const attrs = (el) => Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value]));
  const container = attrs(root);
  const items = [];
  const dirs = [];
  for (const child of Array.from(root.children)) {
    const obj = attrs(child);
    for (const sub of Array.from(child.children)) {
      if (['User', 'Player', 'Session'].includes(sub.nodeName)) obj[sub.nodeName] = attrs(sub);
      // The genre tags are a list, as in JSON (R-SEL-1): a genre selection reads them from the reply.
      else if (sub.nodeName === 'Genre') (obj.Genre ||= []).push(attrs(sub));
    }
    // JSON puts library sections under Directory and items under Metadata; show
    // libraries return <Directory> items too, so list Directory elements in both.
    if (child.nodeName === 'Directory') dirs.push(obj);
    items.push(obj);
  }
  if (items.length) container.Metadata = items;
  if (dirs.length) container.Directory = dirs;
  return container;
}

/** `ignoreBody`: only whether the server accepted the request matters (Play now's command: the answer is `<Response code="200" status="OK"/>`, which says nothing more). */
async function request(url, { method = 'GET', timeoutMs = 10000, fetchImpl = fetch, ignoreBody = false } = {}) {
  let res;
  try {
    res = await fetchImpl(url, { method, headers: { Accept: 'application/json' }, signal: timeoutSignal(timeoutMs) });
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new SourceError(timedOut ? 'Plex did not respond in time.' : 'Could not reach Plex (network or CORS error).', {
      kind: timedOut ? 'timeout' : 'network',
    });
  }
  if (res.status === 401 || res.status === 403) {
    throw new SourceError('Plex rejected the token (unauthorised).', { status: res.status, kind: 'auth' });
  }
  if (!res.ok) throw new SourceError(`Plex returned HTTP ${res.status}.`, { status: res.status, kind: 'http' });
  if (ignoreBody) return {};

  const text = await res.text();
  if (!text.trim()) return {};
  if (text.trimStart().startsWith('<')) {
    if (typeof DOMParser === 'undefined') throw new SourceError('Unexpected XML response.', { kind: 'parse' });
    return xmlToContainer(new DOMParser().parseFromString(text, 'application/xml'));
  }
  try {
    const json = JSON.parse(text);
    return json.MediaContainer ?? json;
  } catch {
    throw new SourceError('Could not parse Plex response.', { kind: 'parse' });
  }
}

/**
 * Picks the session poster to show from /status/sessions.
 * Prefers the given user's playing (over paused) session; episodes use the show poster.
 */
export function pickNowPlaying(sessions, { username = '', includeEpisodes = true } = {}) {
  const want = username.trim().toLowerCase();
  const candidates = (sessions || [])
    .filter((m) => m.type === 'movie' || (includeEpisodes && m.type === 'episode'))
    .filter((m) => !want || (m.User?.title || '').toLowerCase() === want)
    .map((m) => ({ ...m, _poster: m.type === 'episode' ? m.grandparentThumb || m.parentThumb || m.thumb : m.thumb }))
    .filter((m) => m._poster);
  if (!candidates.length) return null;
  const rank = (m) => (m.Player?.state === 'playing' ? 0 : m.Player?.state === 'buffering' ? 1 : 2);
  candidates.sort((a, b) => rank(a) - rank(b));
  const m = candidates[0];
  return {
    ...toPoster(m, 'now-playing'),
    viewOffset: toMs(m.viewOffset),
    playerTitle: m.Player?.title || '',
    playerState: m.Player?.state || '',
    paused: m.Player?.state === 'paused',
  };
}

/** Normalised poster descriptor used throughout the app. */
export function toPoster(m, source) {
  const isEpisode = m.type === 'episode';
  const thumb = m._poster || m.thumb;
  // contentRating is always the item's own: the live limit reads it (D75). An episode's rating is not its series' (D73): a
  // non-empty grandparentContentRating travels apart as seriesRating, for the offline cache only; without one the poster
  // says its rating is the episode's, so the cache never stores it under the series' key.
  const seriesRating = isEpisode && typeof m.grandparentContentRating === 'string' ? m.grandparentContentRating : '';
  const ownRating = typeof m.contentRating === 'string' ? m.contentRating : '';
  const genres = genresOf(m);
  const viewCount = countOf(m.viewCount);
  const audienceRating = ratingOf(m.audienceRating);
  const rating = ratingOf(m.rating);
  // What Play now needs (R-PLAY-1, D191): the kind of item and its OWN key (an episode's ratingKey above is its series'). Left off when the server sent no
  // type or no key, so such a poster has no Play now and the shape every other reader sees is unchanged.
  const playable = typeof m.type === 'string' && m.type !== '' && m.ratingKey !== undefined && m.ratingKey !== null ? { kind: m.type, playKey: String(m.ratingKey) } : {};
  return {
    ratingKey: String(isEpisode ? m.grandparentRatingKey || m.ratingKey : m.ratingKey),
    title: isEpisode ? m.grandparentTitle || m.title : m.title,
    year: yearOf(isEpisode ? m.grandparentYear : m.year), // an episode shows its series' year, when Plex sends one
    thumb,
    source, // 'now-playing' | 'random' | 'static' | 'cache'
    user: m.User?.title || '',
    contentRating: ownRating, // '' = unrated or missing
    ...(seriesRating ? { seriesRating } : isEpisode ? { episodeRating: true } : {}), // seriesRating: the show's; episodeRating: contentRating is the episode's only
    duration: toMs(m.duration), // ms; the playing item's own length for an episode; 0 = unknown
    summary: trimSummary(m.summary, SUMMARY_MAX), // trimmed here, before it reaches any stored descriptor; '' = none sent (the offline cache never keeps it)
    ...(genres.length ? { genres } : {}), // the item's own genre tags (R-SEL-1): the engine checks a genre selection against these
    // What weighting reads (R-SEL-2): left off when the server sent nothing usable. An unwatched title has no viewCount (a (verify) shape).
    ...(viewCount ? { viewCount } : {}),
    ...(audienceRating !== null ? { audienceRating } : {}),
    ...(rating !== null ? { rating } : {}),
    ...playable,
  };
}

/** A positive whole count from a JSON number or an XML attribute string; anything else is 0. */
const countOf = (v) => Math.floor(toMs(v));

/** A rating from a JSON number or an XML attribute string, or null when there is none to read. */
function ratingOf(v) {
  const n = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** The genre tags an item carries (`Genre: [{ id, tag, filter }]`, a (verify) shape), as titles; anything else is none. */
function genresOf(m) {
  return Array.isArray(m.Genre) ? m.Genre.map((g) => g?.tag).filter((t) => typeof t === 'string' && t.trim() !== '') : [];
}

const yearOf = (y) => (y ? String(y) : '');

let commandId = 0; // the number the next play command carries (the companion call asks for one that counts up)

export function createPlexClient({ serverUrl, token, clientId, fetchImpl = (...a) => fetch(...a) }) {
  const auth = { 'X-Plex-Token': token, 'X-Plex-Client-Identifier': clientId, 'X-Plex-Product': PRODUCT };
  const get = (path, params = {}, opts = {}) => request(buildUrl(serverUrl, path, { ...params, ...auth }), { ...opts, fetchImpl });
  const identity = async () => {
    const c = await get('/', {}, { timeoutMs: 8000 });
    return { name: c.friendlyName || '', version: c.version || '', machineIdentifier: c.machineIdentifier || '' };
  };

  /**
   * The saved position of one library item, in milliseconds (0 when it has none): the `viewOffset` of `/library/metadata/<key>` (R-PLAY-1, D191 9).
   * `key` is the item's own key, the server's (`id`, the poster's scoped id, is for a source over several servers and is not read here). It throws a SourceError when the server does not answer, refuses the sign-in or no longer holds the item.
   */
  const savedPosition = async ({ key }) => {
    const c = await get(`/library/metadata/${encodeURIComponent(key)}`);
    const m = (c.Metadata || [])[0];
    if (!m) throw new SourceError('That library item no longer exists.', { kind: 'http', status: 404 });
    return toMs(m.viewOffset);
  };

  /**
   * The server's own identifier, which the play command carries (`GET /`, an error of kind 'parse' when the server does not say who it is). Read by the caller before
   * it makes its last check and calls `play`.
   */
  const machineIdentifier = async () => {
    const { machineIdentifier: id } = await identity();
    if (!id) throw new SourceError('The server did not say who it is.', { kind: 'parse' });
    return id;
  };

  /**
   * Asks THIS server to play an item on a player (R-PLAY-1, D181 3, D191 8): `GET /player/playback/playMedia`, the call the server forwards to the
   * player named by `target`, the player's client identifier. The shape is the community's description of the companion call, not Plex's own
   * documentation, and none of it is confirmed against a real server (verify): the item's `key` (`/library/metadata/<key>`), `offset` in milliseconds,
   * the server's own `machineIdentifier` (read by `machineIdentifier()` BEFORE the caller's last check, so nothing is awaited between that check and this
   * request: `play` starts the request in the same turn it is called) and its `address`, `port` and `protocol` as the player is to reach it, a
   * `commandID`, and the target as the `X-Plex-Target-Client-Identifier` parameter (a query parameter keeps the request CORS-simple; a header is the
   * documented alternative, (verify)). It goes to this server's own address with this server's sign-in, as every request to it does, and carries no
   * token for the player: the one `X-Plex-Token` in it is the server's. A player's own address is never requested.
   * `key` is the item's own key, `target` the client identifier of an allowed player and `machineIdentifier` this server's own; all three are required (`id`, the poster's scoped id, is for a
   * source over several servers and is not read here).
   */
  const play = async ({ key, offset = 0, target, machineIdentifier }) => {
    if (!key || !target || !machineIdentifier) throw new SourceError('Play now needs an item, a player and the server\'s identifier.', { kind: 'config' });
    let where;
    try {
      where = new URL(serverUrl);
    } catch {
      throw new SourceError('The server address is not usable.', { kind: 'config' });
    }
    const protocol = where.protocol.replace(':', '');
    await get(
      '/player/playback/playMedia',
      {
        providerIdentifier: 'com.plexapp.plugins.library',
        machineIdentifier,
        protocol,
        address: where.hostname,
        port: where.port || (protocol === 'https' ? 443 : 80),
        offset: Math.max(0, Math.round(Number(offset) || 0)),
        key: `/library/metadata/${key}`,
        commandID: ++commandId,
        'X-Plex-Target-Client-Identifier': target,
      },
      { timeoutMs: 15000, ignoreBody: true },
    );
  };

  const client = {
    // Play now's three members (R-PLAY-1, D191, D192 4) belong to the Plex adapter alone: they are in PLEX_ONLY_MEMBERS (js/sources/index.js), not in the common list.
    savedPosition,
    machineIdentifier,
    play,

    /** The server's name as the user reads it: every sentence that names the server uses this. */
    label: 'Plex',

    /** Server identity; succeeds only when the URL and token are good. */
    identity,

    /**
     * Who answers at this address, WITHOUT sending the token (D157 3, D160 1): `GET /identity`, which a Plex Media Server serves with no
     * token (a (verify) row). Only `machineIdentifier` and `version` are read: the server's name is not in that reply. Used before the
     * token is sent to a changed address, so a token never reaches a server that is not the one it was made for.
     */
    async publicIdentity() {
      const c = await request(buildUrl(serverUrl, '/identity', { 'X-Plex-Client-Identifier': clientId, 'X-Plex-Product': PRODUCT }), { timeoutMs: 8000, fetchImpl });
      return { name: '', version: c.version || '', machineIdentifier: c.machineIdentifier || '' };
    },

    async libraries() {
      const c = await get('/library/sections');
      return (c.Directory || []).map((d) => ({ key: String(d.key), title: d.title, type: d.type }));
    },

    /**
     * How many items a library section holds, from the `totalSize` of a request that asks for none (`X-Plex-Container-Size=0`)
     * (verify against a real server). Null on any error or when the attribute is missing or not a count: a label is
     * decoration, so this never throws.
     */
    async libraryCount(key) {
      try {
        const c = await get(`/library/sections/${encodeURIComponent(key)}/all`, { 'X-Plex-Container-Start': 0, 'X-Plex-Container-Size': 0 }, { timeoutMs: 8000 });
        const raw = c.totalSize;
        const n = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '') ? Number(raw) : NaN;
        return Number.isFinite(n) && n >= 0 ? n : null;
      } catch {
        return null;
      }
    },

    async sessions() {
      const c = await get('/status/sessions');
      return c.Metadata || [];
    },

    /**
     * Top-rated items in a library section, used as the random pool. With a `maxContentRating`, or a `ratings` subset, it asks Plex
     * for the allowed ratings only and oversamples (3x, at most 500) because filtering shrinks the pool. `ratings` (R-SEL-1) are
     * ladder labels: only those the limit allows are asked for, and none left means no request (an empty filter would ask for every
     * title). `genres` are the filter values Plex lists, joined by commas (OR). The server filters are a convenience (their syntax
     * is unverified): the engine re-checks every poster against the limit, the rating subset and the item's own genres.
     */
    async pool({ libraryKey, unwatchedOnly = true, size = 100, maxContentRating = '', genres = [], ratings = [] }) {
      const values = ratings.length ? ratingValues(ratings, maxContentRating) : allowedValues(maxContentRating);
      if (ratings.length && !values.length) return [];
      const c = await get(`/library/sections/${encodeURIComponent(libraryKey)}/all`, {
        unwatched: unwatchedOnly ? 1 : '',
        sort: 'rating:desc',
        contentRating: values.join(','),
        genre: genres.join(','),
        'X-Plex-Container-Start': 0,
        'X-Plex-Container-Size': maxContentRating || ratings.length ? Math.min(size * 3, 500) : size,
      });
      return (c.Metadata || []).filter((m) => m.thumb).map((m) => toPoster(m, 'random'));
    },

    /**
     * The movies of one collection (smart or not) or playlist as a pool (R-SEL-1): its items with art that are not episodes, and,
     * when `unwatchedOnly`, not watched (`viewCount` is left off an unwatched title, a (verify) shape). Best rated first, at most `size` (3x, at most 500, under a limit or a rating subset, as `pool()` asks for a library).
     */
    async sourceItems({ kind, key }, { unwatchedOnly = true, size = 100, maxContentRating = '', ratings = [] } = {}) {
      const path = kind === 'playlist' ? `/playlists/${encodeURIComponent(key)}/items` : `/library/collections/${encodeURIComponent(key)}/children`;
      const c = await get(path);
      const all = c.Metadata || [];
      const posters = all
        // What the limit in force or the chosen ratings reject is dropped BEFORE the cut, so many high-scoring rejected titles cannot crowd out the allowed ones.
        .filter((m) => m.thumb && (!m.type || m.type === 'movie') && !(unwatchedOnly && Number(m.viewCount) > 0) && ratingPasses(maxContentRating, ratings, typeof m.contentRating === 'string' ? m.contentRating : ''))
        .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
        .slice(0, maxContentRating || ratings.length ? Math.min(size * 3, 500) : size) // the limit and the rating subset shrink it later, as for a library
        .map((m) => toPoster(m, 'random'));
      // `listed`: every rating key the reply held, whatever the filters dropped, so the offline cache can tell which entries left the list.
      posters.listed = all.filter((m) => m.ratingKey !== undefined && m.ratingKey !== null).map((m) => String(m.ratingKey));
      return posters;
    },

    /** The genres a library lists, as `{ key, title }` (`/library/sections/<id>/genre`, a (verify) shape); a title is required. */
    async genres(libraryKey) {
      const c = await get(`/library/sections/${encodeURIComponent(libraryKey)}/genre`);
      return (c.Directory || []).filter((d) => typeof d.title === 'string' && d.title.trim() !== '').map((d) => ({ key: d.key === undefined || d.key === null ? '' : String(d.key), title: d.title.trim() }));
    },

    /** The collections of a library, as `{ key, title, smart }` (`/library/sections/<id>/collections`, a (verify) shape). */
    async collections(libraryKey) {
      const c = await get(`/library/sections/${encodeURIComponent(libraryKey)}/collections`);
      return (c.Metadata || c.Directory || [])
        .filter((m) => m.ratingKey !== undefined && typeof m.title === 'string')
        .map((m) => ({ key: String(m.ratingKey), title: m.title, smart: m.smart === true || m.smart === 1 || m.smart === '1' }));
    },

    /** The video playlists, as `{ key, title }` (`/playlists?playlistType=video`, a (verify) shape). */
    async playlists() {
      const c = await get('/playlists', { playlistType: 'video' });
      return (c.Metadata || []).filter((m) => m.ratingKey !== undefined && typeof m.title === 'string').map((m) => ({ key: String(m.ratingKey), title: m.title }));
    },

    async item(ratingKey) {
      const c = await get(`/library/metadata/${encodeURIComponent(ratingKey)}`);
      const m = (c.Metadata || [])[0];
      if (!m) throw new SourceError('That library item no longer exists.', { kind: 'http', status: 404 });
      return toPoster(m, 'static');
    },

    /**
     * Several library items in ONE request (`/library/metadata/k1,k2,...`, commas literal), as posters.
     * Keys Plex does not return are simply absent from the result. No keys: no request.
     */
    async items(ratingKeys) {
      if (!ratingKeys.length) return [];
      const c = await get(`/library/metadata/${ratingKeys.map(encodeURIComponent).join(',')}`);
      return (c.Metadata || []).map((m) => toPoster(m, 'static'));
    },

    /** The session poster to show from the `sessions()` list, or null (see `pickNowPlaying`); `username` and `includeEpisodes` come from the settings. */
    nowPlaying(sessions, { username = '', includeEpisodes = true } = {}) {
      return pickNowPlaying(sessions, { username, includeEpisodes });
    },

    /** A resized poster via the Plex photo transcoder — far lighter than the original artwork. */
    imageUrl(thumb, { width, height }) {
      return buildUrl(serverUrl, '/photo/:/transcode', {
        url: thumb,
        width: Math.round(width),
        height: Math.round(height),
        minSize: 1,
        upscale: 1,
        'X-Plex-Token': token,
      });
    },
  };
  return client;
}

// ---- plex.tv sign-in (PIN / plex.tv/link flow) and server discovery ----

function tvParams(clientId, token) {
  return {
    'X-Plex-Product': PRODUCT,
    'X-Plex-Client-Identifier': clientId,
    'X-Plex-Device-Name': PRODUCT,
    'X-Plex-Token': token,
  };
}

/**
 * Creates a short 4-character PIN the user enters at plex.tv/link. `expiresIn` is how long it lives, in seconds, as plex.tv
 * said it (null when it did not say): measured on this device's own clock, so a device with the wrong date does not misread it.
 * A reply with no id or no code is an error, not a pin.
 */
export async function createPin(clientId, { fetchImpl = (...a) => fetch(...a) } = {}) {
  const pin = await request(buildUrl(PLEX_TV, '/api/v2/pins', { strong: 'false', ...tvParams(clientId) }), {
    method: 'POST',
    fetchImpl,
  });
  if (pin.id === undefined || pin.id === null || typeof pin.code !== 'string' || !pin.code) {
    throw new SourceError('plex.tv did not return a sign-in code.', { kind: 'parse' });
  }
  const life = Number(pin.expiresIn);
  return { id: pin.id, code: pin.code, expiresAt: pin.expiresAt, expiresIn: Number.isFinite(life) && life > 0 ? life : null };
}

/** Resolves to the auth token once the PIN is claimed, or null while still pending. */
export async function checkPin(clientId, pinId, { fetchImpl = (...a) => fetch(...a) } = {}) {
  const pin = await request(buildUrl(PLEX_TV, `/api/v2/pins/${pinId}`, tvParams(clientId)), { fetchImpl });
  return pin.authToken || null;
}

/**
 * Lists servers on the account with their connections ordered by preference.
 * On an https page only https connections are usable (browsers block mixed content).
 */
export async function discoverServers(clientId, token, { secureOnly = false, fetchImpl = (...a) => fetch(...a) } = {}) {
  const list = await request(
    buildUrl(PLEX_TV, '/api/v2/resources', { includeHttps: 1, includeRelay: 1, ...tvParams(clientId, token) }),
    { fetchImpl },
  );
  return (Array.isArray(list) ? list : [])
    .filter((r) => String(r.provides || '').split(',').includes('server'))
    .map((r) => ({
      name: r.name,
      owned: Boolean(r.owned),
      accessToken: r.accessToken || token,
      connections: rankConnections(r.connections || [], { secureOnly }),
    }))
    .filter((r) => r.connections.length);
}

/**
 * The players on one Plex account (R-PLAY-1, D181 4, D186, D187, D188): the resources plex.tv lists whose `provides`, split at commas and each part
 * trimmed, has a part equal to `player`, each as `{ id, name, present }`. `id` is the client identifier (a resource with none, or one longer than the
 * store keeps, PLAYER_ID_MAX, is not listed, and an identifier is listed once, the first). This display's own `clientId` is never listed. `name` is
 * the resource's name, else its product, else the identifier (a name of only spaces counts as none). `present` is false only when plex.tv says the
 * player is not present. An answer that is not a list (an empty body, an error object, XML) is a failed read, a SourceError of kind 'parse', never
 * "no players". The token goes to plex.tv only, and a player's own address is never read, let alone requested.
 */
export async function discoverPlayers(clientId, token, { fetchImpl = (...a) => fetch(...a) } = {}) {
  const list = await request(
    buildUrl(PLEX_TV, '/api/v2/resources', { includeHttps: 1, includeRelay: 1, ...tvParams(clientId, token) }),
    { fetchImpl },
  );
  if (!Array.isArray(list)) throw new SourceError('plex.tv answered with something that is not a list of devices.', { kind: 'parse' });
  const seen = new Set(clientId ? [clientId] : []);
  const players = [];
  for (const r of list) {
    if (!r || typeof r !== 'object' || !String(r.provides || '').split(',').some((part) => part.trim() === 'player')) continue;
    const id = typeof r.clientIdentifier === 'string' ? r.clientIdentifier.trim() : '';
    if (!id || id.length > PLAYER_ID_MAX || seen.has(id)) continue;
    seen.add(id);
    const name = [r.name, r.product].map((v) => (typeof v === 'string' ? v.trim() : '')).find(Boolean) || id;
    players.push({ id, name, present: r.presence !== false });
  }
  return players;
}

/**
 * The players one Plex server lists itself (R-PLAY-1, D199): `GET /clients` on the household's own server, the list the server forwards a play
 * command to. Each is `{ id, name, present: true }` (a player the server lists is there now): `id` is the client's `machineIdentifier`, under
 * the rules of `discoverPlayers` (none, too long, repeated and this display's own are not listed), `name` its name, else its product, else the
 * identifier. A client that says what it can do (`protocolCapabilities`) and does not name `playback` is not listed; one that does not say is
 * listed. The shape is the community's description, not Plex's own documentation, and is not confirmed against a real server (verify): JSON
 * puts the clients under `Server`, and an XML answer's children are read the same. The request goes to this server's own address with this
 * server's sign-in, and a player's own address is never read, let alone requested. It throws a SourceError as every server request does; the
 * caller (`readPlayers`) treats that as "this server added nothing".
 */
export async function discoverServerPlayers(serverUrl, token, clientId, { fetchImpl = (...a) => fetch(...a), timeoutMs = 4000 } = {}) {
  const c = await request(
    buildUrl(serverUrl, '/clients', { 'X-Plex-Token': token, 'X-Plex-Client-Identifier': clientId, 'X-Plex-Product': PRODUCT }),
    { fetchImpl, timeoutMs },
  );
  const list = [c?.Server, c?.Metadata].find(Array.isArray) || [];
  const seen = new Set(clientId ? [clientId] : []);
  const players = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const can = typeof r.protocolCapabilities === 'string' ? r.protocolCapabilities.trim() : '';
    if (can && !can.split(',').some((part) => part.trim() === 'playback')) continue;
    const id = typeof r.machineIdentifier === 'string' ? r.machineIdentifier.trim() : '';
    if (!id || id.length > PLAYER_ID_MAX || seen.has(id)) continue;
    seen.add(id);
    const name = [r.name, r.product].map((v) => (typeof v === 'string' ? v.trim() : '')).find(Boolean) || id;
    players.push({ id, name, present: true });
  }
  return players;
}

export function rankConnections(connections, { secureOnly = false } = {}) {
  const score = (c) => (c.local ? 0 : 2) + (c.relay ? 4 : 0) + (c.protocol === 'https' ? 0 : 1);
  return connections
    .filter((c) => !secureOnly || c.protocol === 'https')
    .slice()
    .sort((a, b) => score(a) - score(b))
    .map((c) => ({ uri: c.uri, local: Boolean(c.local), relay: Boolean(c.relay), protocol: c.protocol }));
}

/** Tries each connection in order and returns the first that answers. */
export async function firstReachable(connections, token, clientId, { fetchImpl } = {}) {
  for (const c of connections) {
    try {
      await createPlexClient({ serverUrl: c.uri, token, clientId, fetchImpl }).identity();
      return c.uri;
    } catch {
      // try the next one
    }
  }
  return null;
}

/**
 * How a person signs in to Plex: the plex.tv code, the servers on the account, and the words the sign-in screens use for
 * them. The Settings sheet and the empty card's first run ask the source layer for this and never name plex.tv themselves.
 */
export const plexSignIn = {
  label: 'Plex',
  createPin,
  checkPin,
  discoverServers,
  firstReachable,
  words: {
    asking: 'Asking plex.tv for a code…',
    ranOut: 'That code ran out. Asking plex.tv for a new one in 5 minutes…',
    unreachable: "Can't reach plex.tv. Trying again soon…",
    couldNotGet: (message) => `Could not get a sign-in code from plex.tv: ${message}`,
    httpsBlocked: 'This page is https, so the browser will block an http:// server. Use the plex.direct https address (Sign in finds it) or serve the app over http on your LAN.',
  },
};
