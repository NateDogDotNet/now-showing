// A tiny fake Jellyfin server for demos and browser tests, beside the fake Plex server. Every title, name, user, password and
// token below is invented. Shapes follow the research note (.orchestrator/artifacts/research--jellyfin-api-r1.md); where that
// note marks a shape inferred or unconfirmed, a `// (verify)` comment above the route or field says so.
//
// Sign-in: user `demo`, password `demo-pass`, or Quick Connect. Both give the one token below. A request needs it as
// `Authorization: MediaBrowser ... Token="<token>"` or as `api_key=<token>`; without it the answer is 401. Public (no token):
// /System/Info/Public, /QuickConnect/Enabled, /QuickConnect/Initiate, /QuickConnect/Connect, /Users/AuthenticateByName,
// /Users/AuthenticateWithQuickConnect, the /__mock control routes and OPTIONS.
//
// Control endpoints (no token needed):
//   POST /__mock/quickconnect-approve         approve every pending Quick Connect request
//   POST /__mock/jellyfin-sessions?kind=movie&id=<movie id>&user=demo&paused=1
//                                             set what GET /Sessions reports: kind=movie (id defaults to the first movie),
//                                             kind=episode (an episode of an invented series, with SeriesId), kind=none clears it
//
// Libraries: Movies (8 titles), Kids Movies (5 titles), Music (no items). Movies carry OfficialRating G, PG, PG-13, R, TV-MA, 15
// and one unrated title (no OfficialRating key). One BoxSet and one playlist (it spans
// both movie libraries) list their items through ParentId. The web port is the Plex mock's port plus 1000 (jellyfinPortFor).

import { createServer } from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';

export const TOKEN = 'jf-demo-token';
export const USERNAME = 'demo';
export const PASSWORD = 'demo-pass';

// The Jellyfin mock listens on the Plex mock's port plus 1000, so serve.mjs and the e2e harness agree from one number.
// A Plex mock port above 64535 would push it past 65535, so those ports step down by 1000 instead.
export const jellyfinPortFor = (plexMockPort) => (Number(plexMockPort) + 1000 > 65535 ? Number(plexMockPort) - 1000 : Number(plexMockPort) + 1000);

const hex = (prefix, n) => prefix + String(n).padStart(31, '0'); // a 32-hex-digit id, as Jellyfin writes a Guid with no dashes
const SERVER_ID = hex('9', 1);
const USER_ID = hex('8', 1);
const SERIES_ID = hex('f', 1);
const EPISODE_ID = hex('f', 2);
const ROOT = 'root';
// (verify) RunTimeTicks unit: 10,000,000 ticks per second is the .NET convention, inferred; the research did not read it.
const TICKS = 10_000_000;

const GENRES = ['Drama', 'Comedy', 'Mystery', 'Adventure', 'Thriller', 'Animation', 'Family', 'Fantasy'];
const genreItem = (name) => ({ Name: name, Id: hex('c', GENRES.indexOf(name) + 1) });

// (verify) CollectionType values `movies` and `music` were not read from the enum (research section 4).
const LIBS = [
  { Id: hex('b', 1), Name: 'Movies', CollectionType: 'movies' },
  { Id: hex('b', 2), Name: 'Kids Movies', CollectionType: 'movies' },
  { Id: hex('b', 3), Name: 'Music', CollectionType: 'music' },
];

// name, year, color, rating, minutes, community rating, genres, play count, overview, library index
const MOVIE_ROWS = [
  ['The Grand Marquee', 1954, '#8b1e3f', 'G', 90, 7.9, ['Drama'], 2, 'On the last night of the season, the owner of a failing picture palace stages one grand show to save it.', 0],
  ['Midnight Projector', 1961, '#1e4f8b', 'PG', 105, 7.4, ['Mystery', 'Thriller'], 0, 'A projectionist finds a reel that was never catalogued and starts to screen it after closing time.', 0],
  ['Velvet Curtain', 1972, '#5b2a86', 'PG-13', 134, 8.1, ['Drama', 'Mystery'], 1, 'When the curtain rises on opening night, the lead actress is missing and the understudy has never seen the script.', 0],
  ['Popcorn Skies', 1985, '#b5651d', 'R', 115, 6.8, ['Adventure', 'Comedy'], 0, 'Two drive-in owners race a rival chain across three states to land the last print of a banned film.', 0],
  ['Neon Matinee', 1993, '#127a6b', 'TV-MA', 120, 7.2, ['Thriller', 'Mystery'], 1, 'A city of glass and neon, a detective with one free afternoon, and a double feature that may predict the crime.', 0],
  ['Last Reel', 2004, '#6b6b12', '15', 98, 7.0, ['Drama'], 0, 'The final film of a retiring director is lost in the post, and his editor sets out to find it.', 0],
  ['Silver Screen Serenade', 2016, '#3a3a3a', 'R', 150, 6.6, ['Drama', 'Comedy'], 0, 'A silent-film pianist keeps a dying cinema open by playing a score no one has heard before.', 0],
  ['Encore', 2023, '#a12828', undefined, 85, 6.2, ['Drama', 'Comedy'], 0, 'One more night, one more show.', 0],
  ['Tiny Lanterns', 2011, '#c27a1a', 'G', 82, 7.7, ['Animation', 'Family'], 3, 'A village of paper lanterns learns to glow on its own before the festival night.', 1],
  ['The Paper Kite', 2015, '#2a7fb5', 'G', 76, 7.5, ['Animation', 'Fantasy'], 0, 'A kite cut from a map takes two children to every place printed on it.', 1],
  ['Pocket Dragons', 2018, '#4c9a2a', 'PG', 94, 6.9, ['Adventure', 'Family'], 0, 'A boy finds three dragons small enough for his coat pockets, and a rule that they must stay secret.', 1],
  ['Moonlit Meadow', 2020, '#6a4c93', 'G', 70, 7.1, ['Family'], 1, 'Night falls on the meadow and its animals start the one party they hold each year.', 1],
  ['Captain Pudding', 2022, '#b8336a', 'PG', 88, 6.5, ['Animation', 'Comedy'], 0, 'A pudding who thinks he is a sea captain sets sail across the kitchen table.', 1],
];

// (verify) Item Type strings (Movie, BoxSet, Playlist, CollectionFolder, Episode) are not confirmed; BoxSet is flagged unconfirmed in the research.
// (verify) UserData.PlayCount and UserData.Played: the UserItemDataDto fields were not read (research section 5).
// (verify) A null field is left out of the reply (an unrated movie has no OfficialRating key); the research does not say Jellyfin does this.
// (verify) ImageTags.Primary values (tag1, ...) are invented, and the image body is an SVG where a real server sends JPEG or WebP.
const MOVIES = MOVIE_ROWS.map(([Name, year, color, rating, minutes, community, genres, plays, Overview, lib], i) => ({
  Id: hex('a', i + 1),
  Name,
  Type: 'Movie',
  ServerId: SERVER_ID,
  ProductionYear: year,
  ...(rating ? { OfficialRating: rating } : {}),
  CommunityRating: community,
  Genres: genres,
  GenreItems: genres.map(genreItem),
  ...(minutes ? { RunTimeTicks: minutes * 60 * TICKS } : {}),
  Overview,
  UserData: { PlayCount: plays, Played: plays > 0 },
  ImageTags: { Primary: `tag${i + 1}` },
  ParentId: LIBS[lib].Id,
  color,
}));
const movieNamed = (name) => MOVIES.find((m) => m.Name === name);

const BOXSET = { Id: hex('d', 1), Name: 'Midnight Double Feature', Type: 'BoxSet', ServerId: SERVER_ID, ParentId: ROOT, UserData: { PlayCount: 0, Played: false }, ImageTags: { Primary: 'tagbox' }, color: '#444466', members: [movieNamed('Midnight Projector'), movieNamed('Neon Matinee')] };
const PLAYLIST = { Id: hex('e', 1), Name: 'Weekend Picks', Type: 'Playlist', ServerId: SERVER_ID, ParentId: ROOT, UserData: { PlayCount: 0, Played: false }, ImageTags: { Primary: 'tagplay' }, color: '#446644', members: [movieNamed('The Grand Marquee'), movieNamed('Tiny Lanterns'), movieNamed('Last Reel')] };
const VIEWS = LIBS.map((l) => ({ ...l, Type: 'CollectionFolder', ServerId: SERVER_ID, ParentId: ROOT, ImageTags: {}, color: '#333333' }));
const EVERYTHING = [...VIEWS, BOXSET, PLAYLIST, ...MOVIES];

// Wire form of an item: the internal fields (color, members) stay out.
const wire = ({ color: _c, members: _m, ...item }) => item;
const poster = (item) => {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <rect width="600" height="900" fill="${item.color || '#333'}"/>
  <text x="300" y="450" font-family="Georgia, serif" font-size="52" font-weight="bold" fill="#fff" text-anchor="middle">${esc(item.Name)}</text>
</svg>`;
};

const quickConnectResult = (r) => ({
  Authenticated: r.approved,
  Secret: r.secret,
  Code: r.code,
  DeviceId: 'mock-device',
  DeviceName: 'Mock Device',
  AppName: 'Now Showing',
  AppVersion: '1.0',
  DateAdded: r.added,
});

export async function startMockJellyfin({ port = 8096, host = '127.0.0.1' } = {}) {
  const pending = new Map(); // secret -> { secret, code, approved, added }
  let sessions = [];

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    // Query names are matched case-insensitively here (ParentId, parentId); api_key and ApiKey are two different names and both are read below.
    const q = new Map([...url.searchParams].map(([k, v]) => [k.toLowerCase(), v]));
    const list = (name, sep = ',') => (q.has(name) && q.get(name) !== '' ? q.get(name).split(sep) : null);
    const cors = { 'Access-Control-Allow-Origin': '*' };
    const json = (status, body) => {
      res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const body = async () => {
      let text = '';
      for await (const chunk of req) text += chunk;
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    };

    // (verify) CORS: the research note could not settle Jellyfin's default policy; the mock answers every request, preflight included, with allow-all.
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
      return res.end();
    }

    // Control routes (the mock's own, no token).
    if (req.method === 'POST' && path === '/__mock/quickconnect-approve') {
      for (const r of pending.values()) r.approved = true;
      return json(200, { ok: true });
    }
    // (verify) /Sessions shape: SessionInfoDto fields are read from source, PlayState.IsPaused is the expected name, not confirmed.
    if (req.method === 'POST' && path === '/__mock/jellyfin-sessions') {
      const kind = q.get('kind') || 'movie';
      if (kind === 'none') sessions = [];
      else {
        const nowPlaying =
          kind === 'episode'
            ? // (verify) Episode fields SeriesName, ParentIndexNumber and IndexNumber: only SeriesId is named; NowPlayingItem is a BaseItemDto.
              { Id: EPISODE_ID, Name: 'The Long Tide', Type: 'Episode', SeriesId: SERIES_ID, SeriesName: 'Harbor Lights', ParentIndexNumber: 1, IndexNumber: 3, ServerId: SERVER_ID }
            : wire(MOVIES.find((m) => m.Id === q.get('id')) || MOVIES[0]);
        sessions = [
          {
            Id: hex('7', 1),
            UserId: USER_ID,
            UserName: q.get('user') || USERNAME,
            Client: 'Mock Client',
            DeviceName: 'Living Room',
            DeviceId: 'mock-session-device',
            IsActive: true,
            PlayState: { IsPaused: q.get('paused') === '1' },
            NowPlayingItem: nowPlaying,
            ServerId: SERVER_ID,
          },
        ];
      }
      return json(200, { ok: true });
    }

    // Public routes (no token).
    if (req.method === 'GET' && path === '/System/Info/Public') {
      // (verify) the /System route prefix is inferred, and Version 10.10.0 is invented.
      return json(200, { ServerName: 'Mock Jellyfin', Id: SERVER_ID, Version: '10.10.0', ProductName: 'Jellyfin Server', StartupWizardCompleted: true });
    }
    if (req.method === 'GET' && path === '/QuickConnect/Enabled') return json(200, true);
    // (verify) Quick Connect flow: the three routes and the field names are read from source, the flow end to end is inferred.
    // (verify) The real status codes for an unknown secret (404 here) and an unapproved sign-in (401 here) are not in the research; whether Initiate and AuthenticateByName need the device-identity header is unconfirmed (the mock does not ask).
    if (req.method === 'POST' && path === '/QuickConnect/Initiate') {
      const r = { secret: randomBytes(32).toString('hex'), code: String(randomInt(0, 1_000_000)).padStart(6, '0'), approved: false, added: new Date().toISOString() };
      pending.set(r.secret, r);
      return json(200, quickConnectResult(r));
    }
    if (req.method === 'GET' && path === '/QuickConnect/Connect') {
      const r = pending.get(q.get('secret'));
      return r ? json(200, quickConnectResult(r)) : json(404, { error: 'Unknown secret' });
    }
    // (verify) AuthenticationResult: AccessToken and User.Id are the expected names; the class was not read.
    const signedIn = () => ({ User: { Id: USER_ID, Name: USERNAME, ServerId: SERVER_ID }, AccessToken: TOKEN, ServerId: SERVER_ID });
    if (req.method === 'POST' && path === '/Users/AuthenticateWithQuickConnect') {
      const r = pending.get((await body()).Secret);
      return r?.approved ? json(200, signedIn()) : json(401, { error: 'Not approved' });
    }
    if (req.method === 'POST' && path === '/Users/AuthenticateByName') {
      const b = await body();
      return b.Username === USERNAME && b.Pw === PASSWORD ? json(200, signedIn()) : json(401, { error: 'Invalid user or password' });
    }

    // Everything else needs the token.
    // (verify) Authorization header quoting: `MediaBrowser Key="value", ...` is inferred from the parser keys, not from a quoted example.
    // (verify) Token transports: the research reads the Authorization MediaBrowser Token, the X-Emby-Token header and the ApiKey query as current, and the api_key query as legacy; which a default server accepts, and whether the legacy Emby scheme works, is unconfirmed (the mock refuses that scheme).
    const header = /^MediaBrowser\s.*\bToken="?([^",]*)"?/i.exec(req.headers.authorization || '');
    const token = header ? header[1] : (req.headers['x-emby-token'] ?? q.get('apikey') ?? q.get('api_key'));
    if (token !== TOKEN) return json(401, { error: 'Unauthorized' });

    if (req.method === 'GET' && path === '/UserViews') return json(200, { Items: VIEWS.map(wire), TotalRecordCount: VIEWS.length });

    // Page a list the way /Items does: TotalRecordCount is the count before paging; an empty Limit is absent.
    const page = (pool) => {
      const start = Math.max(0, Number(q.get('startindex')) || 0);
      const limit = q.get('limit') ? Math.max(0, Number(q.get('limit'))) : Infinity;
      return { Items: pool.slice(start, start + limit).map(wire), TotalRecordCount: pool.length, StartIndex: start };
    };

    if (req.method === 'GET' && path === '/Items') {
      // (verify) /Items: the response field names Items, TotalRecordCount and StartIndex are expected, not read; ParentId on a BoxSet or a
      // playlist (children listed by its id) is inferred (the confirmed playlist route is /Playlists/{id}/Items); the Random and IsUnplayed wire strings are expected.
      const parentId = q.get('parentid');
      const parent = EVERYTHING.find((i) => i.Id === parentId);
      let pool;
      if (parentId) pool = parent?.members || EVERYTHING.filter((i) => i.ParentId === parentId);
      else if (q.get('recursive') === 'true' || q.get('ids')) pool = EVERYTHING; // (verify) Ids looks across the whole tree without Recursive
      else pool = EVERYTHING.filter((i) => i.ParentId === ROOT);
      const types = list('includeitemtypes');
      if (types) pool = pool.filter((i) => types.includes(i.Type));
      const ids = list('ids');
      if (ids) pool = pool.filter((i) => ids.includes(i.Id));
      const genreIds = list('genreids');
      if (genreIds) pool = pool.filter((i) => i.GenreItems?.some((g) => genreIds.includes(g.Id)));
      const ratings = list('officialratings', '|');
      if (ratings) pool = pool.filter((i) => ratings.includes(i.OfficialRating));
      if (list('filters')?.includes('IsUnplayed')) pool = pool.filter((i) => !(i.UserData?.PlayCount > 0));
      if (list('sortby')?.includes('Random')) {
        pool = [...pool];
        for (let i = pool.length - 1; i > 0; i--) {
          const j = randomInt(0, i + 1);
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
      }
      return json(200, page(pool));
    }

    // The route the research confirms for a playlist's items (PlaylistsController); the /Playlists base and the reply wrapper are expected, not read.
    const playlistItems = /^\/Playlists\/([0-9a-f]+)\/Items$/.exec(path);
    if (req.method === 'GET' && playlistItems) {
      return PLAYLIST.Id === playlistItems[1] ? json(200, page(PLAYLIST.members)) : json(404, { error: 'Not found' });
    }

    // (verify) /Genres: the route base was not read; the {Items, TotalRecordCount} wrapper and Type "Genre" are expected.
    if (req.method === 'GET' && path === '/Genres') {
      const parentId = q.get('parentid');
      const used = new Set((parentId ? MOVIES.filter((m) => m.ParentId === parentId) : MOVIES).flatMap((m) => m.Genres));
      const out = GENRES.filter((g) => used.has(g)).map((g) => ({ ...genreItem(g), Type: 'Genre', ServerId: SERVER_ID }));
      return json(200, { Items: out, TotalRecordCount: out.length });
    }

    if (req.method === 'GET' && path === '/Sessions') return json(200, sessions);

    // (verify) Image auth: the research note could not confirm whether an anonymous request succeeds; the mock asks for the token (api_key works, as an <img> cannot send headers).
    const image = /^\/Items\/([0-9a-f]+)\/Images\/Primary$/.exec(path);
    if (req.method === 'GET' && image) {
      const item = EVERYTHING.find((i) => i.Id === image[1]);
      if (!item) return json(404, { error: 'Not found' });
      res.writeHead(200, { ...cors, 'Content-Type': 'image/svg+xml' });
      return res.end(poster(item));
    }

    json(404, { error: 'Not found' });
  });

  await new Promise((r) => server.listen(port, host, r));
  return server;
}
