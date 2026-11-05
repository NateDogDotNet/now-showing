// The source-adapter interface (D134): the engine, the display, Settings and the first-run card talk to a media server
// only through the object `createSource(settings)` returns, and never import an adapter module themselves. Plex is the
// first adapter, Jellyfin the second and Emby the third; `serverType` in the settings picks it ('plex', 'jellyfin' or 'emby', and Plex when the setting is absent).
//
// What an adapter object holds (every member below, and nothing else). Items keep their server's own ids: a poster's
// `ratingKey` is the server's id, stored as it is (the offline cache, the pinned poster and the no-repeat history key on it).
//   label                                 the server's name as people read it ("Plex"); the screens read the same word from
//                                         signInFlow(settings).label, because an unconfigured display has no adapter yet
//   identity()                            { name, version, machineIdentifier }; succeeds only when the URL and sign-in are good
//   publicIdentity()                      the same, read WITHOUT the token (D157 3, D160 1): Plex's `GET /identity`, Jellyfin's and Emby's
//                                         public `System/Info/Public`. `machineIdentifier` is the server's own id. It proves nothing about
//                                         the token (and Plex's reply holds no name, so `name` is ''): it says only who answers at an address.
//   libraries()                           [{ key, title, type }]; Settings offers only the libraries whose `type` is 'movie' (and keeps a
//                                         ticked 'show' one). The Plex adapter passes Plex's own types through; the Jellyfin adapter maps
//                                         its CollectionType `movies` to 'movie' and `tvshows` to 'show'
//   libraryCount(key)                     how many items a library holds, or null; never throws
//   sessions()                            what is playing now, in the adapter's own shape; only nowPlaying() reads it
//   pool({ libraryKey, unwatchedOnly, size, maxContentRating, genres, ratings })   posters for the random pool
//   sourceItems({ kind, key }, opts)      the posters of one collection or playlist; the list has `.listed`, every id the reply held
//   genres(libraryKey)                    [{ key, title }]
//   collections(libraryKey)               [{ key, title, smart }]
//   playlists()                           [{ key, title }]
//   item(id)                              one poster, or an error of kind 'http' when it is gone
//   items(ids)                            several posters in one request; ids the server does not return are absent
//   imageUrl(thumb, { width, height })    the address of a resized poster image
//   nowPlaying(sessions, settings)        the poster of the playing session that counts (settings.username, .includeEpisodes), or null;
//                                         it also carries viewOffset, playerTitle, playerState and paused (ms, text, text, boolean)
//
// The poster object an adapter returns (the fields the engine, the display and the offline cache read):
//   ratingKey      the server's id for the title, as a string; an episode carries its series' id
//   title, year    text; year is '' when unknown; an episode carries its series' title and year
//   thumb          what imageUrl() takes
//   source         'random', 'static' or 'now-playing' (js/poster-cache.js sets 'cache' on a poster drawn from the offline cache)
//   user           who is playing it, '' when not a session
//   contentRating  the item's own rating as text, '' when unrated; the household limit reads it (D5, D75)
//   seriesRating   an episode's series rating, kept apart for the offline cache only (D73); episodeRating: true says
//                  contentRating is the episode's own and the cache must not store it under the series' key
//   duration       ms, 0 when unknown
//   summary        text trimmed to the shared length limit (SUMMARY_MAX in js/fill.js), '' when none
//   genres         the item's own genre titles (a genre selection is checked against them); left off when none
//   viewCount, audienceRating, rating    what weighting reads (R-SEL-2); left off when the server sent nothing usable
// The engine adds `libraryKey` and `members` to the pool posters it draws; the adapter does not.
// A server-side rating filter in pool() or sourceItems() is an optimisation only: the engine checks every poster against
// the household limit itself (D5), whatever an adapter returns.
//
// Signing in is per server type, and needs no connection: signInFlow(settings) returns the flow of the settings' server type. The
// Plex flow is { label, createPin, checkPin, discoverServers, firstReachable, words }: a code the user approves at plex.tv/link,
// the servers on the account with their connections, the first connection that answers, and the exact sentences the sign-in
// screens show (words.asking, ranOut, unreachable, couldNotGet(message), httpsBlocked). The Jellyfin flow has the same members,
// bound to the address in `settings.serverUrl` (`needsAddress: true`, and `serverUrl` itself): the code is a Quick Connect code, checkPin gives the access
// token once the code is approved (and throws an error with `expired: true` when the server no longer knows the code), and it adds
// quickConnectEnabled(clientId) and signInWithPassword(clientId, user, password) -> { token, userId }. The Jellyfin flow's screens
// say "Quick Connect is off" when it is; a flow with no code at all adds words.passwordOnly in its place. The Emby flow (Emby has no Quick Connect) is
// { label, needsAddress, serverUrl, quickConnectEnabled (always false), signInWithPassword, discoverServers, firstReachable, words }:
// it has no createPin or checkPin. It is built with `settings.serverUserId` (the id the sign-in returned), which firstReachable's libraries request needs (Emby lists libraries at Users/{UserId}/Views).
//
// Errors an adapter throws are SourceErrors (js/sources/errors.js) whose `kind` is one of KINDS; createSource itself adds 'config'.
// What a kind leads to on screen (js/main.js): 'auth' is an answer, not an outage: with no poster on screen the empty card says what
// is wrong and offers "Sign in again"; with one on screen the card stays away, and only a refresh somebody asked for shows a toast with the button. Every other kind counts as the server not
// answering: the status pill reads "Can't reach <label>" (or "Offline" when the browser is offline) and cached posters rotate; 'network' and 'timeout' also offer Diagnostics and "Test connection"; 'http', 'parse' and 'config' offer no button.
// The kind 'empty' is not a SourceError kind: the engine raises it itself when nothing can be drawn.

import { KINDS, SourceError } from './errors.js';
import { createEmbyClient, embySignIn } from './emby.js';
import { createJellyfinClient, jellyfinSignIn } from './jellyfin.js';
import { createPlexClient, plexSignIn } from './plex.js';
import { belongsTo, cleanServerId, keyFor, splitKey } from '../selection.js';
import { serverList } from '../settings.js';

export { KINDS, SourceError };

/** The members every adapter object has, in the order the list above gives them. */
export const SOURCE_MEMBERS = [
  'label', 'identity', 'publicIdentity', 'libraries', 'libraryCount', 'sessions', 'pool', 'sourceItems', 'genres', 'collections', 'playlists', 'item', 'items', 'imageUrl', 'nowPlaying',
];

/** The server type a settings object names: 'plex' when it names none (a 2.3.1 object). */
export const serverTypeOf = (settings) => settings?.serverType || 'plex';

const unknownType = (type) => new SourceError(`Unknown server type "${type}".`, { kind: 'config' });

/**
 * The adapter for the settings' `serverType`, built from the connection settings (`serverUrl`, and `plexToken`, which holds the access
 * token of either server type). `clientId` names this display to the server and `version` is the app's version (the Jellyfin header
 * carries it); `fetchImpl` stands in for fetch in tests. An unknown type throws a SourceError of kind 'config'.
 */
export function createSource(settings, { clientId, fetchImpl, version } = {}) {
  const type = serverTypeOf(settings);
  if (type === 'plex') return createPlexClient({ serverUrl: settings?.serverUrl, token: settings?.plexToken, clientId, fetchImpl });
  if (type === 'jellyfin') return createJellyfinClient({ serverUrl: settings?.serverUrl, token: settings?.plexToken, clientId, version, fetchImpl });
  if (type === 'emby') return createEmbyClient({ serverUrl: settings?.serverUrl, token: settings?.plexToken, clientId, version, userId: settings?.serverUserId, fetchImpl });
  throw unknownType(type);
}

/**
 * How a person signs in to the settings' server type. The Plex flow is `{ label, createPin, checkPin, discoverServers, firstReachable, words }`;
 * the Jellyfin flow adds `needsAddress`, `serverUrl`, `quickConnectEnabled` and `signInWithPassword`; the Emby flow is `{ label, needsAddress,
 * serverUrl, quickConnectEnabled, signInWithPassword, discoverServers, firstReachable, words }` (no `createPin` or `checkPin`). It needs no connection, so the empty card and the Settings sheet use it before anything is configured.
 */
export function signInFlow(settings, { fetchImpl, version } = {}) {
  const type = serverTypeOf(settings);
  if (type === 'plex') return plexSignIn;
  if (type === 'jellyfin') return jellyfinSignIn({ serverUrl: settings?.serverUrl || '', fetchImpl, version });
  if (type === 'emby') return embySignIn({ serverUrl: settings?.serverUrl || '', fetchImpl, version, userId: settings?.serverUserId || '' });
  throw unknownType(type);
}

// ---- several servers (R-SRC-4, D156, D157) ----

const noServer = () => new SourceError('That server is not in the list any more.', { kind: 'config' });

/**
 * Does the settings object need `createSources`? It does when it names more than one server, or a first server that is not the one
 * carried over from 2.4.0 (its ids are then scoped). Otherwise `createSource` builds the one adapter and nothing differs from 2.4.0.
 */
export const needsSources = (settings) => {
  const list = serverList(settings);
  // Any scoped id in the settings means the multi-server source, whatever the count (D162 1).
  const keysOf = (o) => [...(Array.isArray(o?.libraryKeys) ? o.libraryKeys : []), o?.libraryKey, o?.source?.key];
  const scopedId = [...keysOf(settings), settings?.staticRatingKey, ...(Array.isArray(settings?.profiles) ? settings.profiles.flatMap(keysOf) : [])].some((k) => splitKey(k).serverId);
  return list.length > 1 || !list[0].carried || scopedId;
};

/** Who answers at an address, read WITHOUT a token (D157 3): the server's own id, or null when nothing answers or the reply holds no usable id. The one copy of this read. */
export async function readServerId(type, url, opts = {}) {
  try {
    return cleanServerId((await createSource({ serverType: type, serverUrl: url, plexToken: '' }, opts).publicIdentity()).machineIdentifier) || null;
  } catch {
    return null;
  }
}

/**
 * One source over every server in the list (up to three, any mix of Plex, Jellyfin and Emby, D156 7), with the members of the adapter
 * interface, so the engine, the display and Settings use it as they use one server's adapter. It does three things.
 *  - It tells the servers apart. Every id a server gives (a poster's `ratingKey` and `thumb`, a library, a collection, a playlist) leaves
 *    here scoped by that server's own id, `@<server id>/<id>`, except the ids of the entry carried over from 2.4.0, which stay as 2.4.0
 *    stored them (D157 1). An id coming in is routed by its scope; a bare id goes to the carried entry and to no other.
 *  - It keeps each token with its server: each adapter is built from its own entry's address and token and nothing else (D157 4).
 *  - It lets one server fail without the others (D157 5). A server that does not answer contributes nothing, and a call fails only when
 *    every server fails, with the first error. The household limit is not decided here: the engine checks every poster (D5).
 * `sessions()` returns `[{ server, sessions }]`, one group per server that answered, in list order; only `nowPlaying()` reads it.
 */
export function createSources(settings, opts = {}) {
  const members = serverList(settings).map((entry) => {
    try {
      const source = createSource({ serverType: entry.type, serverUrl: entry.url, plexToken: entry.token, serverUserId: entry.userId }, opts);
      // A server that does not know its own id cannot have its ids scoped (unless it is the carried one): it contributes nothing.
      return { entry, source: entry.carried || entry.id ? source : null };
    } catch {
      return { entry, source: null };
    }
  });
  const usable = members.filter((m) => m.source);
  const keyOf = (m, key) => keyFor(m.entry, key);
  const nameOf = (m) => m.entry.name || m.source.label;
  /** An error's message with the server named once: the adapter's own words ("Could not reach Plex") say the server's label, which becomes the server's name. */
  const named = (m, error) => {
    const message = String(error?.message ?? error);
    return message.includes(m.source.label) ? message.replace(m.source.label, nameOf(m)) : `${nameOf(m)}: ${message}`;
  };
  const owner = (id) => usable.find((m) => belongsTo(id, m.entry)) || null;
  const scoped = (m, p) => (m.entry.carried ? p : { ...p, ratingKey: keyFor(m.entry, p.ratingKey), thumb: keyFor(m.entry, p.thumb) });
  /** The server an id belongs to and the id as that server knows it. */
  const route = (id) => {
    const m = owner(id);
    if (!m) throw noServer();
    return [m, splitKey(id).key];
  };
  /** A call on every server: what answered, in list order, and what failed. It throws the first failure only when nothing answered. */
  const everywhere = async (call) => {
    if (!usable.length) throw noServer();
    const settled = await Promise.allSettled(usable.map((m) => call(m)));
    const ok = settled.map((r, i) => (r.status === 'fulfilled' ? [usable[i], r.value] : null)).filter(Boolean);
    const failed = settled.map((r, i) => (r.status === 'rejected' ? { server: nameOf(usable[i]), slot: members.indexOf(usable[i]), error: r.reason } : null)).filter(Boolean);
    if (!ok.length && failed.length) {
      // Every server failed: one server says its own error; several are all named, so no server is left out of the message.
      if (failed.length === 1) throw failed[0].error;
      const first = failed[0].error;
      throw new SourceError(failed.map((f) => named(members[f.slot], f.error)).join(' '), { kind: first.kind, ...(first.status ? { status: first.status } : {}) });
    }
    return { ok, failed };
  };
  const genreLists = new Map(); // a server's own genre list for a library, asked for once

  /** The server's own genre filter values for these titles: a genre key of one server means nothing to another (a Plex key is not a Jellyfin id). */
  async function ownGenres(m, library, titles) {
    const id = `${m.entry.id}|${m.entry.url}|${library}`;
    if (!genreLists.has(id)) genreLists.set(id, m.source.genres(library).catch((err) => (genreLists.delete(id), Promise.reject(err))));
    const wanted = new Set(titles.map((t) => String(t).toLowerCase()));
    return (await genreLists.get(id)).filter((g) => wanted.has(g.title.toLowerCase())).map((g) => g.key || g.title);
  }

  return {
    multi: true,
    label: usable[0]?.source.label || 'Plex',

    /** The identity of the first server that answers, in list order, with its place in the list as `slot`; it throws the first error only when none answers. */
    async identity() {
      const settled = await Promise.allSettled(usable.map((m) => m.source.identity()));
      const at = settled.findIndex((r) => r.status === 'fulfilled');
      if (at < 0) {
        if (settled.length < 2) throw settled[0]?.reason ?? noServer();
        const first = settled[0].reason;
        throw new SourceError(settled.map((r, i) => named(usable[i], r.reason)).join(' '), { kind: first?.kind, ...(first?.status ? { status: first.status } : {}) }); // every server is named, once
      }
      return { ...settled[at].value, slot: members.indexOf(usable[at]) };
    },
    publicIdentity: () => (usable[0] ? usable[0].source.publicIdentity() : Promise.reject(noServer())),

    async libraries() {
      const { ok, failed } = await everywhere(async (m) => (await m.source.libraries()).map((l) => ({ ...l, key: keyOf(m, l.key), server: nameOf(m), serverType: m.entry.type })));
      return Object.assign(ok.flatMap(([, libs]) => libs), { failed });
    },

    async libraryCount(key) {
      const m = owner(key);
      return m ? m.source.libraryCount(splitKey(key).key) : null;
    },

    async sessions() {
      const { ok } = await everywhere((m) => m.source.sessions());
      return ok.map(([m, sessions]) => ({ server: usable.indexOf(m), sessions }));
    },

    async pool(request) {
      const [m, library] = route(request.libraryKey);
      const { genreTitles = [], genres = [], ...rest } = request;
      let own = genres;
      if (genreTitles.length) {
        own = await ownGenres(m, library, genreTitles);
        if (!own.length) return []; // this server lists none of the genres: no title of its can match
      }
      return (await m.source.pool({ ...rest, libraryKey: library, genres: own })).map((p) => scoped(m, p));
    },

    async sourceItems({ kind, key }, options) {
      const [m, bare] = route(key);
      const posters = await m.source.sourceItems({ kind, key: bare }, options);
      const out = posters.map((p) => scoped(m, p));
      if (posters.listed) out.listed = posters.listed.map((id) => keyOf(m, id));
      return out;
    },

    async genres(libraryKey) {
      const [m, bare] = route(libraryKey);
      return m.source.genres(bare);
    },

    async collections(libraryKey) {
      const [m, bare] = route(libraryKey);
      return (await m.source.collections(bare)).map((c) => ({ ...c, key: keyOf(m, c.key) }));
    },

    async playlists() {
      const { ok } = await everywhere(async (m) => (await m.source.playlists()).map((p) => ({ ...p, key: keyOf(m, p.key), server: nameOf(m) })));
      return ok.flatMap(([, lists]) => lists);
    },

    async item(id) {
      if (!owner(id)) throw new SourceError('That library item no longer exists.', { kind: 'http', status: 404 }); // its server is gone: the same answer as an id the server no longer holds
      const [m, bare] = route(id);
      return { ...scoped(m, await m.source.item(bare)), ratingKey: id }; // the id as it was asked for, so a pin keeps comparing equal to the poster it names
    },

    async items(ids) {
      const asked = new Map(); // server -> bare id -> the ids asked for that map to it
      for (const id of ids) {
        const m = owner(id);
        if (!m) continue; // a server that is gone returns nothing: the engine stores those ids as unrated
        const bare = splitKey(id).key;
        if (!asked.has(m)) asked.set(m, new Map());
        asked.get(m).set(bare, [...(asked.get(m).get(bare) || []), id]);
      }
      if (!asked.size) return [];
      const { ok } = await everywhere(async (m) => (asked.has(m) ? m.source.items([...asked.get(m).keys()]) : []));
      return ok.flatMap(([m, posters]) => posters.flatMap((p) => (asked.get(m)?.get(String(p.ratingKey)) || []).map((id) => ({ ...scoped(m, p), ratingKey: id }))));
    },

    nowPlaying(groups, settings) {
      const rank = (p) => (p.playerState === 'playing' ? 0 : p.playerState === 'buffering' ? 1 : 2);
      const picks = [];
      for (const g of groups || []) {
        const m = usable[g.server];
        const p = m?.source.nowPlaying(g.sessions, settings);
        if (p) picks.push(scoped(m, p));
      }
      return picks.sort((a, b) => rank(a) - rank(b))[0] || null; // each server applied the user filter; then the first one playing, in list order (D157 8)
    },

    imageUrl(thumb, size) {
      const [m, bare] = route(thumb);
      return m.source.imageUrl(bare, size);
    },
  };
}
