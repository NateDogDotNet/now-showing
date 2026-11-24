// A tiny fake Plex Media Server for demos and browser tests. Implements just the
// endpoints the app uses and returns generated SVG "posters".
//
// Control endpoints (no token needed):
// Public (no token): GET /identity (D160 1) and the /__mock control routes. Every other route needs the token.
//   POST /__mock/play?ratingKey=3&user=demo&offset=600000&duration=6000000&player=Living%20Room&state=paused
//                                             start a fake session (offset/duration in ms, default 0 and the title's
//                                             runtime; player is Player.title, default "Mock Player"; state default playing)
//   POST /__mock/stop                         end it
//   POST /__mock/rate?ratingKey=4&contentRating=R   re-rate a title from now on ("none" = unrated)
//   POST /__mock/sessions-status?status=403   answer /status/sessions with that HTTP status (200 = normal again)
//   GET  /__mock/plextv-resources?token=T&client=C   what plex.tv would answer to GET /api/v2/resources for token T and this display's client
//                                             identifier C (the e2e harness fulfils the page's plex.tv request from it, tests/e2e/lib.mjs `plexTv`): the list
//                                             set for T, else the list set for every token, else PLEX_TV_RESOURCES; the status set the same way (200 = normal).
//                                             It records {token, client} in the plex.tv log. It is not a Plex Media Server route and needs no token.
//   POST /__mock/plextv-set?token=T&status=500   answer token T (no token = every token) with that status (200 = normal again); a JSON array in the body
//                                             replaces the resource list for T. Either part may be left out.
//   GET  /__mock/plextv-log                   {requests}: every plextv-resources request since the last plextv-reset
//   POST /__mock/plextv-reset                 forget every list, status and log entry of the plex.tv side
//   GET  /clients                             the players this server lists itself (D199): {MediaContainer: {size, Server: [...]}}, empty until clients-set. Needs the token.
//                                             (verify) The shape is the community's description, not confirmed against a real server.
//   POST /__mock/clients-set                  a JSON array in the body replaces the list /clients answers (no body = none again); ?status=500 answers /clients with that status (200 = normal again)
//   GET  /player/playback/playMedia?key=/library/metadata/3&offset=0&machineIdentifier=..&address=..&port=..&protocol=..&commandID=1&X-Plex-Target-Client-Identifier=<player>
//                                             Play now (R-PLAY-1, D191): the server forwards the command to the player named by the target (the parameter, or the header of the
//                                             same name) and the mock records what the player would receive. (verify) The shape is the community's description of the companion
//                                             call, not confirmed against a real server. Needs the token, which is the SERVER's: it is not part of what is forwarded.
//   GET  /__mock/player-log                   {commands, received}: what the players received since the last player-reset, one entry each {key, offset, machineIdentifier, address,
//                                             port, protocol, commandID, providerIdentifier, target, forwarded (the names of what was forwarded), tokenLike (anything token-like in
//                                             what was forwarded), tokenParams (how many X-Plex-Token parameters the request held)}; `received` counts every playMedia request the
//                                             server got, a failed forward included (a failed one is not in `commands`)
//   POST /__mock/player-reset                 forget the player record and the failure mode
//   POST /__mock/player-fail?mode=player      make the forward fail: mode=player (the player cannot be reached: the server answers 404, a (verify) status), mode=server (the server has a problem: it answers 503),
//                                             mode=auth (the server refuses the sign-in: 401); mode=reset (the player receives the command and is recorded, and then the connection to the page is cut with no answer); mode=none (or no mode) is normal again
//   POST /__mock/offset?ratingKey=3&viewOffset=600000   give a title a saved position in ms (0 removes it); every endpoint that lists the title carries `viewOffset`
//   POST /__mock/kind?ratingKey=3&type=show   the title is listed with that type (show, season, ...) instead of movie, as Plex lists other kinds of item
//   POST /__mock/episode?ratingKey=3          the title is listed as an episode whose series is that title (type episode, its own key 500 + the series key, the series' title
//                                             and key as grandparent*, as Plex sends them); /library/metadata/<own key> answers it
//   GET  /__mock/stats                        {transcode, other}: image requests vs other Plex requests
//   GET  /__mock/log                          {requests}: every Plex request since the last reset, "path?query" without the token
//   POST /__mock/reset-stats                  zero the counters and clear that log
//   POST /__mock/down  /  POST /__mock/up      simulate the server going offline
//   POST /__mock/counts-fail[?status=500]      answer the library count request (X-Plex-Container-Size=0) with that HTTP
//                                             status; status=0 is normal again
//   POST /__mock/empty  /  POST /__mock/nonempty   a pool request for unwatched titles (unwatched=1) finds none / finds them
//                                             again (a library whose titles were all watched); watched titles are still listed
//   POST /__mock/watch?ratingKey=3&viewCount=2   set a title's watch state: viewCount>0 adds viewCount and lastViewedAt, 0 removes
//                                             both (an unwatched title carries neither); unwatched=1 is not affected, only /__mock/empty is
//
// Libraries: 1 Movies (the 8 titles below), 2 Music (type artist, no /all), 3 Kids Movies (5 invented titles, keys 9-13). Every movie
// carries Genre [{id, tag, filter}], audienceRating and originallyAvailableAt; some carry viewCount and lastViewedAt (watched).
// /library/sections/<1|3>/all also honours genre=<id or tag>[,<id or tag>] (a comma list is OR); /genre lists the library's genres;
// /library/sections/1/collections and /library/collections/<id>/children serve one regular and one smart collection;
// /playlists?playlistType=video and /playlists/<id>/items serve one playlist across both movie libraries.
//
// The 8 titles carry contentRating G, PG, PG-13, R, TV-MA, gb/12, gb/15 and none (title 8, as an unrated
// Plex item has no attribute), and a runtime (`duration`, ms): item 3 is PG-13, 8,040,000 ms, 1972; the unrated item 8 has no
// runtime either. Every title carries a `summary` (title 3's is over 300 characters). /library/sections/1/all honours `contentRating=a,b,c` strictly: a title whose
// rating is not in the list, or that has none, is dropped before paging. Other unknown parameters are ignored.
// With X-Plex-Container-Size=0 it answers { MediaContainer: { size: 0, totalSize: 8 } }, as Plex does for a count.

import { createServer } from 'node:http';

export const TOKEN = 'demo-token';
const MACHINE_ID = 'mock'; // what GET / and the token-free GET /identity both report

// What the mock plex.tv answers to GET /api/v2/resources (R-PLAY-1, D186): the account's server and three players, one of them not present. A player's
// connection is an address in TEST-NET-1 (RFC 5737): the display must never request it, and a request that tried would leave the machine (K48).
// (verify) The resource shape (name, product, clientIdentifier, provides, presence, connections) is what plex.tv sends; not confirmed against a real account here.
export const PLEX_TV_RESOURCES = [
  { name: 'Mock Plex', product: 'Plex Media Server', clientIdentifier: MACHINE_ID, provides: 'server', owned: true, presence: true, connections: [{ uri: 'http://127.0.0.1:32400', protocol: 'http', local: true, relay: false }] },
  { name: 'Living Room TV', product: 'Plex for Android (TV)', clientIdentifier: 'mock-player-living-room', provides: 'client,player,pubsub-player', owned: true, presence: true, connections: [{ uri: 'http://192.0.2.10:32500', protocol: 'http', local: true, relay: false }] },
  { name: 'Kids Room TV', product: 'Plex for Android (TV)', clientIdentifier: 'mock-player-kids-room', provides: 'client,player,pubsub-player', owned: true, presence: true, connections: [{ uri: 'http://192.0.2.11:32500', protocol: 'http', local: true, relay: false }] },
  { name: 'Old Tablet', product: 'Plex for Android', clientIdentifier: 'mock-player-old-tablet', provides: 'client,player,pubsub-player', owned: true, presence: false, connections: [{ uri: 'http://192.0.2.12:32500', protocol: 'http', local: true, relay: false }] },
];

const LIB1 = [
  ['The Grand Marquee', 1954, '#8b1e3f', 'G', 5_400_000, 'On the last night of the season, the owner of a failing picture palace stages one grand show to save it.'],
  ['Midnight Projector', 1961, '#1e4f8b', 'PG', 6_300_000, 'A projectionist finds a reel that was never catalogued and starts to screen it after closing time.'],
  // Long on purpose (over 300 characters): the app trims a summary before it is stored or shown.
  ['Velvet Curtain', 1972, '#5b2a86', 'PG-13', 8_040_000, 'When the curtain rises on opening night, the lead actress is missing and the understudy has never seen the script. Over one long evening the cast, the stagehands and a critic who came to be unkind discover that the theatre keeps its own secrets, and that every one of them is written into the third act. Nobody leaves before the final bow.'],
  ['Popcorn Skies', 1985, '#b5651d', 'R', 6_900_000, 'Two drive-in owners race a rival chain across three states to land the last print of a banned film.'],
  ['Neon Matinee', 1993, '#127a6b', 'TV-MA', 7_200_000, 'A city of glass and neon, a detective with one free afternoon, and a double feature that may predict the crime.'],
  ['Last Reel', 2004, '#6b6b12', 'gb/12', 5_880_000, 'The final film of a retiring director is lost in the post, and his editor sets out to find it.'],
  ['Silver Screen Serenade', 2016, '#3a3a3a', 'gb/15', 9_000_000, 'A silent-film pianist keeps a dying cinema open by playing a score no one has heard before.'],
  ['Encore', 2023, '#a12828', undefined, undefined, 'One more night, one more show.'], // unrated, no runtime: no contentRating or duration attribute
];

// Genre ids are server-wide, as in Plex's filter list; a library lists only the genres its titles use.
const GENRES = ['Drama', 'Comedy', 'Mystery', 'Adventure', 'Thriller', 'Animation', 'Family', 'Fantasy'];
const genreTag = (name) => ({ id: 11 + GENRES.indexOf(name), tag: name, filter: `genre=${11 + GENRES.indexOf(name)}` });

// Extra fields for library 1's titles, by position: genres, audienceRating, originallyAvailableAt, viewCount (0 = unwatched), lastViewedAt.
const LIB1_EXTRA = [
  [['Drama'], 7.9, '1954-03-12', 2, 1_700_100_000],
  [['Mystery', 'Thriller'], 7.4, '1961-10-27', 0, 0],
  [['Drama', 'Mystery'], 8.1, '1972-05-19', 1, 1_700_200_000],
  [['Adventure', 'Comedy'], 6.8, '1985-07-04', 0, 0],
  [['Thriller', 'Mystery'], 7.2, '1993-11-05', 1, 1_700_300_000],
  [['Drama', 'Comedy'], 6.5, '2004-02-20', 0, 0],
  [['Drama'], 8.4, '2016-09-09', 0, 0],
  [['Comedy'], 5.9, '2023-12-01', 0, 0],
];

// Library 3, invented. Columns: title, year, color, contentRating, duration, summary, then the LIB1_EXTRA columns.
const KIDS = [
  ['Captain Crayon', 2011, '#d98a1e', 'G', 4_800_000, 'A box of crayons comes alive and sails a bathtub sea to find the lost blue.', ['Animation', 'Adventure'], 8.0, '2011-06-10', 3, 1_700_400_000],
  ['The Little Lantern', 2015, '#2a8f5a', 'G', 4_500_000, 'A lantern too small to light a street learns to light a friend.', ['Animation', 'Family'], 7.6, '2015-11-20', 0, 0],
  ['Pudding Planet', 2019, '#c2417a', 'PG', 5_100_000, 'Two cousins land on a planet made of pudding and have until bedtime to bake their way home.', ['Comedy', 'Family'], 6.9, '2019-03-15', 0, 0],
  ['Whisker Wizards', 2021, '#4a3fa0', 'G', 5_400_000, 'The cats of a small town secretly run its tiny school of magic.', ['Fantasy', 'Family'], 7.3, '2021-08-06', 1, 1_700_450_000],
  ['Mini Monster Mash', 2022, '#3c8d2f', 'PG', 4_680_000, 'The monsters under the bed throw a party and invite the child above it.', ['Comedy', 'Animation'], 6.4, '2022-10-14', 0, 0],
];

const movie = ([title, year, color, contentRating, duration, summary], n, lib, extra) => ({
  ratingKey: String(n),
  key: `/library/metadata/${n}`,
  type: 'movie',
  lib,
  title,
  year,
  color,
  summary,
  ...(contentRating ? { contentRating } : {}),
  ...(duration ? { duration } : {}),
  rating: 9 - (n - 1) * 0.4,
  ...withExtra(extra),
  thumb: `/library/metadata/${n}/thumb/1700000000`,
});
function withExtra([genres, audienceRating, originallyAvailableAt, viewCount, lastViewedAt]) {
  return {
    Genre: genres.map(genreTag),
    audienceRating,
    originallyAvailableAt,
    ...(viewCount ? { viewCount, lastViewedAt } : {}),
  };
}
const MOVIES = [...LIB1.map((row, i) => movie(row, i + 1, 1, LIB1_EXTRA[i])), ...KIDS.map((row, i) => movie(row, i + 9, 3, row.slice(6)))];
const MOVIE_LIBRARIES = new Set(['1', '3']);
const WATCHED_AT = 1_700_500_000; // lastViewedAt for a title /__mock/watch marks watched

export async function startMockPlex({ port = 32401, host = '127.0.0.1', machineId = MACHINE_ID } = {}) {
  const state = { session: null, down: false };
  const stats = { transcode: 0, other: 0 };
  const log = []; // "path?query" of every Plex request, token left out
  const watches = new Map(); // ratingKey -> viewCount set by /__mock/watch (0 = unwatched)
  const ratings = new Map(); // ratingKey -> contentRating set by /__mock/rate ('' = unrated)
  const offsets = new Map(); // ratingKey -> viewOffset (ms) set by /__mock/offset (a saved position)
  const kinds = new Map(); // ratingKey -> the `type` set by /__mock/kind
  const episodes = new Map(); // ratingKey -> the key of the episode that title is listed as, set by /__mock/episode
  const clients = { list: [], status: 200 }; // what GET /clients answers (D199): the players this server lists itself
  const player = { commands: [], received: 0, fail: 'none' }; // what the players received (Play now), and how the forward fails
  let sessionsStatus = 200;
  let countsStatus = 200; // the library count request (/library/sections/1/all with X-Plex-Container-Size=0)
  const plexTv = { lists: new Map(), statuses: new Map(), log: [] }; // the plex.tv side: per token ('*' = every token), what /__mock/plextv-resources answers
  let emptyUnwatched = false; // every title counts as watched: pool requests that ask for unwatched ones find none
  // A title as Plex would send it now: a re-rating applies to every endpoint.
  const current = (m) => {
    if (!m) return m;
    let out = m;
    if (ratings.has(m.ratingKey)) {
      const { contentRating: _old, ...rest } = out;
      out = ratings.get(m.ratingKey) ? { ...rest, contentRating: ratings.get(m.ratingKey) } : rest;
    }
    if (watches.has(m.ratingKey)) {
      const { viewCount: _count, lastViewedAt: _at, ...rest } = out;
      const count = watches.get(m.ratingKey);
      out = count > 0 ? { ...rest, viewCount: count, lastViewedAt: WATCHED_AT } : rest;
    }
    if (offsets.has(m.ratingKey)) {
      const { viewOffset: _at, ...rest } = out;
      out = offsets.get(m.ratingKey) > 0 ? { ...rest, viewOffset: offsets.get(m.ratingKey) } : rest;
    }
    if (kinds.has(m.ratingKey)) out = { ...out, type: kinds.get(m.ratingKey) };
    if (episodes.has(m.ratingKey)) {
      const own = episodes.get(m.ratingKey);
      out = { ...out, type: 'episode', ratingKey: own, key: `/library/metadata/${own}`, title: 'Pilot', grandparentRatingKey: m.ratingKey, grandparentTitle: m.title, grandparentYear: m.year, grandparentThumb: m.thumb };
    }
    return out;
  };
  const inLibrary = (id) => MOVIES.filter((m) => m.lib === Number(id));
  const byKeys = (keys) => keys.map((k) => MOVIES.find((m) => m.ratingKey === k));
  // (verify) Collection shape: /library/sections/<id>/collections and /library/collections/<id>/children are not confirmed against Plex.
  const COLLECTIONS = [
    { ratingKey: '101', title: 'Double Features', smart: '0', section: '1', items: () => byKeys(['2', '4', '6']) },
    { ratingKey: '102', title: 'Top Rated', smart: '1', section: '1', items: () => inLibrary(1).filter((m) => m.audienceRating >= 7.3) },
  ];
  // (verify) Playlist shape: /playlists?playlistType=video and /playlists/<id>/items are not confirmed against Plex.
  const PLAYLISTS = [{ ratingKey: '201', title: 'Friday Night Picks', items: () => byKeys(['2', '4', '9', '12']) }];

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const cors = { 'Access-Control-Allow-Origin': '*' };
    const json = (status, body) => {
      res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (url.pathname.startsWith('/__mock/')) {
      const action = url.pathname.slice(8);
      if (action === 'plextv-resources') {
        const token = url.searchParams.get('token') || '';
        plexTv.log.push({ token, client: url.searchParams.get('client') || '' });
        const status = plexTv.statuses.get(token) ?? plexTv.statuses.get('*') ?? 200;
        if (status !== 200) return json(status, { error: `Mock plex.tv: resources answer ${status}` });
        return json(200, plexTv.lists.get(token) ?? plexTv.lists.get('*') ?? PLEX_TV_RESOURCES);
      }
      if (action === 'player-log') return json(200, { commands: [...player.commands], received: player.received });
      if (action === 'player-reset') {
        player.commands.length = 0;
        player.received = 0;
        player.fail = 'none';
        return json(200, { ok: true });
      }
      if (action === 'player-fail') {
        player.fail = url.searchParams.get('mode') || 'none';
        return json(200, { ok: true });
      }
      if (action === 'offset') offsets.set(url.searchParams.get('ratingKey'), Number(url.searchParams.get('viewOffset') || 0));
      if (action === 'kind') kinds.set(url.searchParams.get('ratingKey'), url.searchParams.get('type') || 'movie');
      if (action === 'episode') episodes.set(url.searchParams.get('ratingKey'), String(500 + Number(url.searchParams.get('ratingKey'))));
      if (action === 'plextv-log') return json(200, { requests: [...plexTv.log] });
      if (action === 'plextv-reset') {
        for (const part of [plexTv.lists, plexTv.statuses]) part.clear();
        plexTv.log.length = 0;
        return json(200, { ok: true });
      }
      if (action === 'clients-set') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          clients.status = Number(url.searchParams.get('status')) || 200;
          try {
            clients.list = body.trim() ? JSON.parse(body) : [];
          } catch {
            return json(400, { error: 'the body is not JSON' });
          }
          json(200, { ok: true });
        });
        return;
      }
      if (action === 'plextv-set') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          const token = url.searchParams.get('token') || '*';
          if (url.searchParams.has('status')) plexTv.statuses.set(token, Number(url.searchParams.get('status')) || 200);
          try {
            if (body.trim()) plexTv.lists.set(token, JSON.parse(body));
          } catch {
            return json(400, { error: 'the body is not JSON' });
          }
          json(200, { ok: true });
        });
        return;
      }
      if (action === 'play') {
        const movie = current(MOVIES.find((m) => m.ratingKey === (url.searchParams.get('ratingKey') || '1')));
        const num = (name, fallback) => (url.searchParams.has(name) ? Number(url.searchParams.get(name)) : fallback);
        const duration = num('duration', movie?.duration);
        state.session = {
          ...movie,
          ...(duration ? { duration } : {}),
          viewOffset: num('offset', 0),
          User: { title: url.searchParams.get('user') || 'demo' },
          Player: { title: url.searchParams.get('player') || 'Mock Player', state: url.searchParams.get('state') || 'playing' },
        };
        // episode=1: the session is an episode of that title taken as a series (D73). episodeRating is the episode's own
        // contentRating ("none" or absent = none sent); grandparentRating, when given, is the series' (grandparentContentRating).
        if (url.searchParams.get('episode') === '1' && movie) {
          const own = url.searchParams.get('episodeRating');
          const series = url.searchParams.get('grandparentRating');
          const { contentRating: _own, ...rest } = state.session;
          state.session = {
            ...rest,
            type: 'episode',
            ratingKey: `e${movie.ratingKey}`,
            title: 'Pilot',
            grandparentRatingKey: movie.ratingKey,
            grandparentTitle: movie.title,
            grandparentYear: movie.year,
            grandparentThumb: movie.thumb,
            ...(own && own !== 'none' ? { contentRating: own } : {}),
            ...(series ? { grandparentContentRating: series } : {}),
          };
        }
      }
      if (action === 'watch') watches.set(url.searchParams.get('ratingKey'), Number(url.searchParams.get('viewCount') || 0));
      if (action === 'rate') {
        const rating = url.searchParams.get('contentRating') || '';
        ratings.set(url.searchParams.get('ratingKey'), rating === 'none' ? '' : rating);
      }
      if (action === 'sessions-status') sessionsStatus = Number(url.searchParams.get('status') || 200);
      if (action === 'counts-fail') countsStatus = url.searchParams.has('status') ? Number(url.searchParams.get('status')) || 200 : 500;
      if (action === 'empty') emptyUnwatched = true;
      if (action === 'nonempty') emptyUnwatched = false;
      if (action === 'stop') state.session = null;
      if (action === 'down') state.down = true;
      if (action === 'up') state.down = false;
      if (action === 'stats') return json(200, { ...stats });
      if (action === 'log') return json(200, { requests: [...log] });
      if (action === 'reset-stats') {
        stats.transcode = 0;
        stats.other = 0;
        log.length = 0;
        return json(200, { ok: true });
      }
      return json(200, { ok: true, ...state });
    }

    if (state.down) {
      req.socket.destroy();
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Headers': '*' });
      return res.end();
    }
    // (verify) Real Plex serves GET /identity without a token (machineIdentifier, version, claimed); the mock answers it with the same machineIdentifier as GET / (D160 1).
    if (url.pathname === '/identity') return json(200, { MediaContainer: { size: 0, claimed: true, machineIdentifier: machineId, version: '1.40.0.0000-mock' } });
    if (url.searchParams.get('X-Plex-Token') !== TOKEN) return json(401, { error: 'Unauthorized' });
    stats[url.pathname === '/photo/:/transcode' ? 'transcode' : 'other']++;
    const query = new URLSearchParams(url.searchParams);
    query.delete('X-Plex-Token');
    log.push(url.pathname + (query.size ? `?${query}` : ''));

    const strip = (m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'color' && k !== 'lib'));
    const path = url.pathname;
    if (path === '/') return json(200, { MediaContainer: { friendlyName: 'Mock Plex', version: '1.40.0.0000-mock', machineIdentifier: machineId } });
    if (path === '/library/sections') {
      return json(200, { MediaContainer: { Directory: [{ key: '1', title: 'Movies', type: 'movie' }, { key: '2', title: 'Music', type: 'artist' }, { key: '3', title: 'Kids Movies', type: 'movie' }] } });
    }
    if (path === '/clients') {
      if (clients.status !== 200) return json(clients.status, { error: `Mock: clients answer ${clients.status}` });
      return json(200, { MediaContainer: { size: clients.list.length, Server: clients.list } });
    }
    if (path === '/player/playback/playMedia') {
      // The server forwards the command to the player it names; what the player would receive is every parameter but the server's own sign-in and the target.
      player.received++;
      if (player.fail === 'auth') return json(401, { error: 'Mock: the sign-in was refused' });
      if (player.fail === 'player') return json(404, { error: 'Mock: the player could not be reached' }); // (verify) the status a real server gives for a player it cannot reach
      if (player.fail === 'server') return json(503, { error: 'Mock: the server could not forward the command' });
      const target = url.searchParams.get('X-Plex-Target-Client-Identifier') || req.headers['x-plex-target-client-identifier'] || '';
      if (!target) return json(400, { error: 'Mock: no target player' });
      const own = new Set(['X-Plex-Token', 'X-Plex-Client-Identifier', 'X-Plex-Product', 'X-Plex-Target-Client-Identifier']);
      const forwarded = [...url.searchParams].filter(([name]) => !own.has(name));
      const get = (name) => url.searchParams.get(name);
      player.commands.push({
        key: get('key'),
        offset: Number(get('offset')),
        machineIdentifier: get('machineIdentifier'),
        address: get('address'),
        port: get('port'),
        protocol: get('protocol'),
        commandID: get('commandID'),
        providerIdentifier: get('providerIdentifier'),
        target,
        forwarded: forwarded.map(([name]) => name),
        tokenLike: forwarded.some(([name, value]) => /token/i.test(name) || value.includes(TOKEN)),
        tokenParams: url.searchParams.getAll('X-Plex-Token').length,
      });
      if (player.fail === 'reset') return req.socket.destroy(); // the server took the command and forwarded it, then the connection to the page was lost
      res.writeHead(200, { ...cors, 'Content-Type': 'application/xml' });
      return res.end('<?xml version="1.0" encoding="UTF-8"?>\n<Response code="200" status="OK"/>');
    }
    if (path === '/status/sessions') {
      if (sessionsStatus !== 200) return json(sessionsStatus, { error: `Mock: sessions answer ${sessionsStatus}` });
      return json(200, { MediaContainer: { size: state.session ? 1 : 0, Metadata: state.session ? [strip(state.session)] : [] } });
    }
    const section = path.match(/^\/library\/sections\/(\d+)\/(all|genre|collections)$/);
    if (section && MOVIE_LIBRARIES.has(section[1])) {
      const [, id, what] = section;
      if (what === 'genre') {
        // (verify) Genre list shape: Directory entries { key, title, fastKey } are not confirmed against Plex.
        const used = new Set(inLibrary(id).flatMap((m) => m.Genre.map((g) => g.tag)));
        const Directory = GENRES.filter((g) => used.has(g)).map((g) => ({ key: String(genreTag(g).id), title: g, fastKey: `/library/sections/${id}/all?genre=${genreTag(g).id}` }));
        return json(200, { MediaContainer: { size: Directory.length, Directory } });
      }
      if (what === 'collections') {
        const Metadata = COLLECTIONS.filter((c) => c.section === id).map((c) => ({
          ratingKey: c.ratingKey, key: `/library/collections/${c.ratingKey}/children`, type: 'collection', subtype: 'movie',
          title: c.title, smart: c.smart, childCount: c.items().length,
        }));
        return json(200, { MediaContainer: { size: Metadata.length, Metadata } });
      }
      if (url.searchParams.get('X-Plex-Container-Size') === '0') {
        if (countsStatus !== 200) return json(countsStatus, { error: `Mock: counts answer ${countsStatus}` });
        return json(200, { MediaContainer: { size: 0, totalSize: inLibrary(id).length } });
      }
      const size = Number(url.searchParams.get('X-Plex-Container-Size') || MOVIES.length);
      const wanted = url.searchParams.get('contentRating');
      const allowed = wanted === null ? null : wanted.split(',');
      const genres = url.searchParams.get('genre');
      const genreWanted = genres === null ? null : genres.toLowerCase().split(',');
      const hasGenre = (m) => m.Genre.some((g) => genreWanted.includes(String(g.id)) || genreWanted.includes(g.tag.toLowerCase()));
      let items = inLibrary(id).map(current);
      if (allowed) items = items.filter((m) => m.contentRating && allowed.includes(m.contentRating));
      if (genreWanted) items = items.filter(hasGenre);
      const listed = emptyUnwatched && url.searchParams.get('unwatched') === '1' ? [] : items;
      return json(200, { MediaContainer: { Metadata: listed.slice(0, size).map(strip) } });
    }
    const children = path.match(/^\/library\/collections\/(\d+)\/children$/);
    if (children) {
      const c = COLLECTIONS.find((x) => x.ratingKey === children[1]);
      if (!c) return json(404, {});
      const Metadata = c.items().map((m) => strip(current(m)));
      return json(200, { MediaContainer: { size: Metadata.length, Metadata } });
    }
    if (path === '/playlists') {
      const type = url.searchParams.get('playlistType');
      const Metadata = (type === null || type === 'video' ? PLAYLISTS : []).map((p) => ({
        ratingKey: p.ratingKey, key: `/playlists/${p.ratingKey}/items`, type: 'playlist', playlistType: 'video', smart: '0',
        title: p.title, leafCount: p.items().length,
      }));
      return json(200, { MediaContainer: { size: Metadata.length, Metadata } });
    }
    const playlistItems = path.match(/^\/playlists\/(\d+)\/items$/);
    if (playlistItems) {
      const p = PLAYLISTS.find((x) => x.ratingKey === playlistItems[1]);
      if (!p) return json(404, {});
      const Metadata = p.items().map((m) => strip(current(m)));
      return json(200, { MediaContainer: { size: Metadata.length, Metadata } });
    }
    // One key, or several joined by commas (a batched lookup): the ones that exist, in the order asked. A single
    // unknown key is a 404; unknown keys in a list are just absent.
    const meta = path.match(/^\/library\/metadata\/(\d+(?:,\d+)*)$/);
    if (meta) {
      // An episode's own key (set by /__mock/episode) answers with that episode; any other key is a title as before.
      const titleFor = (k) => MOVIES.find((x) => x.ratingKey === k) ?? MOVIES.find((x) => episodes.get(x.ratingKey) === k);
      const found = meta[1].split(',').map(titleFor).filter(Boolean);
      return found.length || meta[1].includes(',') ? json(200, { MediaContainer: { Metadata: found.map((m) => strip(current(m))) } }) : json(404, {});
    }
    if (path === '/photo/:/transcode') {
      const thumb = url.searchParams.get('url') || '';
      const m = MOVIES.find((x) => thumb.startsWith(x.key + '/')) || MOVIES[0];
      res.writeHead(200, { ...cors, 'Content-Type': 'image/svg+xml' });
      return res.end(posterSvg(m));
    }
    json(404, { error: 'Not found' });
  });

  await new Promise((r) => server.listen(port, host, r));
  return server;
}

function posterSvg(m) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const words = m.title.split(' ');
  const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [m.title];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m.color}"/><stop offset="1" stop-color="#050505"/></linearGradient></defs>
  <rect width="600" height="900" fill="url(#g)"/>
  <circle cx="300" cy="330" r="150" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="18"/>
  <path d="M260 260 L380 330 L260 400 Z" fill="#fff" fill-opacity=".8"/>
  ${lines.map((l, i) => `<text x="300" y="${640 + i * 70}" font-family="Georgia, serif" font-size="58" font-weight="bold" fill="#fff" text-anchor="middle">${esc(l)}</text>`).join('\n  ')}
  <text x="300" y="830" font-family="Georgia, serif" font-size="34" fill="#ddd" text-anchor="middle">${m.year}</text>
</svg>`;
}
