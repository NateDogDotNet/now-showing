// The source-adapter interface (D134): the engine, the display, Settings and the first-run card talk to a media server
// only through the object `createSource(settings)` returns, and never import an adapter module themselves. Plex is the
// first adapter; `serverType` in the settings picks it ('plex', and Plex also when the setting is absent).
//
// What an adapter object holds (every member below, and nothing else). Items keep their server's own ids: a poster's
// `ratingKey` is the server's id, stored as it is (the offline cache, the pinned poster and the no-repeat history key on it).
//   label                                 the server's name as people read it ("Plex"): every sentence that names the server
//   identity()                            { name, version, machineIdentifier }; succeeds only when the URL and sign-in are good
//   libraries()                           [{ key, title, type }]; `type` is 'movie' or 'show': Settings offers the 'movie' libraries
//                                         (and keeps a ticked 'show' one), so an adapter maps its own library types onto these two
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
//   source         'random', 'static' or 'now-playing' (the display adds 'cache' for a poster drawn from the offline cache)
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
// screens show (words.asking, ranOut, unreachable, couldNotGet(message), httpsBlocked).
//
// Errors an adapter throws are SourceErrors (js/sources/errors.js) whose `kind` is one of KINDS; createSource itself adds 'config'.
// What a kind leads to on screen (js/main.js): 'auth' is an answer, not an outage: the empty card says what is wrong and offers
// "Sign in again". Every other kind counts as the server not answering: the status pill reads "Can't reach <label>" and cached
// posters rotate; 'network' and 'timeout' also offer Diagnostics and "Test connection"; 'http', 'parse' and 'config' offer no button.
// The kind 'empty' is not a SourceError kind: the engine raises it itself when nothing can be drawn.

import { KINDS, SourceError } from './errors.js';
import { createPlexClient, plexSignIn } from './plex.js';

export { KINDS, SourceError };

/** The members every adapter object has, in the order the list above gives them. */
export const SOURCE_MEMBERS = [
  'label', 'identity', 'libraries', 'libraryCount', 'sessions', 'pool', 'sourceItems', 'genres', 'collections', 'playlists', 'item', 'items', 'imageUrl', 'nowPlaying',
];

/** The server type a settings object names: 'plex' when it names none (a 2.3.1 object). */
export const serverTypeOf = (settings) => settings?.serverType || 'plex';

const unknownType = (type) => new SourceError(`Unknown server type "${type}".`, { kind: 'config' });

/**
 * The adapter for the settings' `serverType`, built from the connection settings (`serverUrl`, `plexToken`). `clientId` names this
 * display to the server; `fetchImpl` stands in for fetch in tests. An unknown type throws a SourceError of kind 'config'.
 */
export function createSource(settings, { clientId, fetchImpl } = {}) {
  const type = serverTypeOf(settings);
  if (type === 'plex') return createPlexClient({ serverUrl: settings?.serverUrl, token: settings?.plexToken, clientId, fetchImpl });
  throw unknownType(type);
}

/**
 * How a person signs in to the settings' server type: `{ label, createPin, checkPin, discoverServers, firstReachable, words }`.
 * It needs no connection, so the empty card and the Settings sheet use it before anything is configured.
 */
export function signInFlow(settings) {
  const type = serverTypeOf(settings);
  if (type === 'plex') return plexSignIn;
  throw unknownType(type);
}
