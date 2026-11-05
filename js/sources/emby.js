// Emby source adapter (R-SRC-3, D134, D145): the same interface as the Jellyfin adapter (js/sources/index.js), and the same items,
// rating map and poster mapping (D134 3), spoken with Emby's sign-in scheme. The mock server in scripts/mock-jellyfin.mjs (its Emby
// mode) is the only server this was run against.
//
// What is sourced and what is not. Primary source: Emby's REST reference, dev.emby.media/reference/RestAPI.html and its service pages
// (read 2026-11-03; the R-SRC-3 rows V1-M01..M14 in docs/validation/real-server-extended.md say the same). Each path the adapter calls:
//   * `POST /Users/AuthenticateByName` with a user name and a plain-text `Pw`, and the `X-Emby-Authorization: Emby UserId=..., Client=...,
//     Device=..., DeviceId=..., Version=...` header: UserService, and dev.emby.media "User Authentication" (DEV-EMBY-AUTH).
//   * the `X-Emby-Token` header and the `api_key` query for a signed-in request: DEV-EMBY-KEY.
//   * `GET /Users/{UserId}/Views` (UserViewsService.html): the libraries. Emby has NO `/UserViews` (that route is Jellyfin's, added after the
//     fork), and no `/Users/Me`, so the sign-in's user id is kept (the `serverUserId` setting, D145 2) and passed to this client.
//   * `GET /Items` (ItemsService.html: a user-less `/Items` and a `/Users/{UserId}/Items` both exist; the user-less one is used for the pool,
//     counts, BoxSets, playlists and the Ids re-read), `GET /Genres` (GenresService.html), `GET /Playlists/{Id}/Items` (PlaylistService.html),
//     `GET /Sessions` (SessionsService.html), `GET /System/Info/Public` (SystemService.html) and `GET /Items/{Id}/Images/{Type}` (ImageService.html):
//     each is listed there by its bare path.
// What stays (verify), because the reference lists a route but not what a real server does with it: that a user-less `/Items` honours the user's
// library access, the query parameter names and Fields values, the BoxSet and playlist item types, the field names (`CustomRating`, `OfficialRating`),
// `UserId=""` before sign-in, and a server's CORS default. Emby also answers under an `/emby` prefix; the bare paths are used here (verify).
//
// Emby has no Quick Connect: the sign-in flow offers only the user name and password form. A /Sessions failure of any kind but a network
// error or a timeout (a 401 or 403 for a user who may not list sessions, a 404, a reply that does not parse) means nothing is playing and
// never an error card (D145 4). The password is sent once and never kept (D141 8, D145 2).

import { buildUrl } from './http.js';
import { SourceError } from './errors.js';
import { CLIENT_NAME, createMediaBrowserClient, request } from './jellyfin.js';

/**
 * The `X-Emby-Authorization` header value: the client's identity. Before sign-in it carries `UserId=""` and no token; the token goes in
 * the `X-Emby-Token` header (embyHeaders). (verify) The quoting and the empty UserId are the documented form read from DEV-EMBY-AUTH.
 */
export function embyAuthHeader({ clientId = '', version = '' } = {}) {
  const q = (v) => String(v ?? '').replace(/"/g, '');
  return `Emby UserId="", Client="${q(CLIENT_NAME)}", Device="${q(CLIENT_NAME)}", DeviceId="${q(clientId)}", Version="${q(version)}"`;
}

/** The headers of an Emby request: the client's identity, and the access token once there is one. */
export function embyHeaders({ clientId, version, token }) {
  return { 'X-Emby-Authorization': embyAuthHeader({ clientId, version }), ...(token ? { 'X-Emby-Token': token } : {}) };
}

/**
 * `userId` is the id the sign-in returned (the `serverUserId` setting). Emby lists libraries only at `Users/{UserId}/Views`; with no id the
 * client cannot list them and says (an `auth` error) that a new sign-in is needed.
 */
export function createEmbyClient({ serverUrl, token, clientId, version = '', userId = '', fetchImpl = (...a) => fetch(...a) }) {
  const viewsPath = typeof userId === 'string' && userId.trim() ? `Users/${encodeURIComponent(userId.trim())}/Views` : null;
  return createMediaBrowserClient({ label: 'Emby', serverUrl, token, headers: embyHeaders({ clientId, version, token }), publicHeaders: embyHeaders({ clientId, version }), fetchImpl, softSessions: true, viewsPath });
}

/**
 * How a person signs in to the Emby server at `serverUrl` (the shape js/sources/index.js documents for a flow). There is no code to
 * approve: `quickConnectEnabled` answers false without asking the server, so the sheet and the first-run card show the user name and
 * password form. `signInWithPassword` gives `{ token, userId }`; a wrong pair is an `auth` error, and nothing is stored here.
 */
export function embySignIn({ serverUrl = '', fetchImpl = (...a) => fetch(...a), version = '', userId = '' } = {}) {
  const call = (clientId, path, opts = {}) =>
    request(buildUrl(serverUrl, path), { ...opts, headers: embyHeaders({ clientId, version }), fetchImpl, label: 'Emby' });
  return {
    label: 'Emby',
    needsAddress: true,
    serverUrl,

    /** Emby has no Quick Connect (D134). */
    async quickConnectEnabled() {
      return false;
    },

    async signInWithPassword(clientId, username, password) {
      const reply = await call(clientId, 'Users/AuthenticateByName', { method: 'POST', body: { Username: username, Pw: password }, badLogin: true });
      if (typeof reply?.AccessToken !== 'string' || !reply.AccessToken) throw new SourceError('Emby did not return an access token.', { kind: 'parse' });
      return { token: reply.AccessToken, userId: typeof reply.User?.Id === 'string' ? reply.User.Id : '' };
    },

    /** The one server there is, at the address entered. */
    async discoverServers(clientId, token) {
      let name = '';
      try {
        const info = await call(clientId, 'System/Info/Public', { timeoutMs: 8000 });
        name = typeof info?.ServerName === 'string' ? info.ServerName.trim() : '';
      } catch {
        // the connection test reports an address that does not answer
      }
      return [{ name: name || 'Emby', owned: true, accessToken: token, connections: [{ uri: serverUrl, local: true, relay: false, protocol: serverUrl.startsWith('https:') ? 'https' : 'http' }] }];
    },

    async firstReachable(connections, token, clientId) {
      for (const c of connections) {
        try {
          await createEmbyClient({ serverUrl: c.uri, token, clientId, version, userId, fetchImpl }).identity();
          return c.uri;
        } catch {
          // try the next one
        }
      }
      return null;
    },

    words: {
      asking: 'Sign in with your Emby user name and password.',
      ranOut: 'Sign in with your Emby user name and password.',
      unreachable: "Can't reach Emby. Trying again soon…",
      couldNotGet: (message) => `Could not sign in to Emby: ${message}`,
      passwordOnly: 'Emby signs in with a user name and password. Enter yours below.',
      httpsBlocked: 'This page is https, so the browser will block an http:// server. Use an https address for your Emby server or serve the app over http on your LAN.',
    },
  };
}
