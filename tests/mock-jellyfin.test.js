import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockJellyfin, jellyfinPortFor, TOKEN, USERNAME, PASSWORD } from '../scripts/mock-jellyfin.mjs';

let server;
let base;

before(async () => {
  server = await startMockJellyfin({ port: 0 });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

const AUTH = { Authorization: `MediaBrowser Client="Test", Device="Test", DeviceId="t1", Version="1", Token="${TOKEN}"` };
const raw = (path, init = {}) => fetch(`${base}${path}`, init);
const get = async (path, headers = AUTH) => {
  const res = await raw(path, { headers });
  return { status: res.status, body: await res.json().catch(() => null), res };
};
const post = async (path, body, headers = {}) => {
  const res = await raw(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null), res };
};
const items = async (query) => (await get(`/Items?${query}`)).body;
const names = (r) => r.Items.map((i) => i.Name);
const movies = async (extra = '') => items(`IncludeItemTypes=Movie&Recursive=true${extra ? `&${extra}` : ''}`);
const views = async () => (await get('/UserViews')).body.Items;

test('port helper: the Jellyfin mock port follows from the Plex mock port', () => {
  assert.equal(jellyfinPortFor(18901), 19901);
  assert.equal(jellyfinPortFor(32401), 33401);
  assert.equal(jellyfinPortFor(64535), 65535);
  // Above 64535 the port steps down, so the result is always a valid port and never the Plex mock's own.
  assert.equal(jellyfinPortFor(64536), 63536);
  assert.equal(jellyfinPortFor(65535), 64535);
  for (const plex of [1024, 32401, 64535, 64536, 65535]) {
    const jf = jellyfinPortFor(plex);
    assert.ok(Number.isInteger(jf) && jf >= 1 && jf <= 65535 && jf !== plex, String(plex));
  }
});

test('GET /System/Info/Public answers without a token', async () => {
  const { status, body } = await get('/System/Info/Public', {});
  assert.equal(status, 200);
  assert.equal(typeof body.ServerName, 'string');
  assert.match(body.Id, /^[0-9a-f]{32}$/);
});

test('every reply carries Access-Control-Allow-Origin: *, including errors and the image', async () => {
  const a = await get('/System/Info/Public', {});
  const b = await get('/UserViews', {});
  const c = await get('/Nope');
  const d = await raw(`/Items/${(await movies()).Items[0].Id}/Images/Primary`, { headers: AUTH });
  const e = await raw('/UserViews', { method: 'OPTIONS' });
  for (const r of [a.res, b.res, c.res, d, e]) assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.equal(e.status, 204);
});

test('401 without a valid Authorization header or api_key; either valid form is accepted', async () => {
  assert.equal((await get('/UserViews', {})).status, 401);
  assert.equal((await get('/UserViews', { Authorization: 'MediaBrowser Client="x", Token="wrong"' })).status, 401);
  assert.equal((await get('/UserViews', { Authorization: 'MediaBrowser Client="x"' })).status, 401);
  assert.equal((await get('/UserViews', { Authorization: `Basic Token="${TOKEN}"` })).status, 401);
  assert.equal((await get('/UserViews', { Authorization: `MediaBrowser Token="${TOKEN}"` })).status, 200);
  assert.equal((await get(`/UserViews?api_key=${TOKEN}`, {})).status, 200);
  assert.equal((await get('/UserViews?api_key=wrong', {})).status, 401);
  assert.equal((await get(`/UserViews?ApiKey=${TOKEN}`, {})).status, 200);
  assert.equal((await get('/UserViews?ApiKey=wrong', {})).status, 401);
  assert.equal((await get('/UserViews', { 'X-Emby-Token': TOKEN })).status, 200);
  assert.equal((await get('/UserViews', { 'X-Emby-Token': 'wrong' })).status, 401);
  for (const p of ['/Items', '/Genres', '/Sessions']) assert.equal((await get(p, {})).status, 401, p);
  const id = (await movies()).Items[0].Id;
  assert.equal((await raw(`/Items/${id}/Images/Primary`)).status, 401);
  assert.equal((await raw(`/Items/${id}/Images/Primary?api_key=${TOKEN}`)).status, 200);
});

test('Quick Connect: Enabled, Initiate, Authenticated stays false until approved, then the secret signs in', async () => {
  assert.equal((await get('/QuickConnect/Enabled', {})).body, true);
  const init = await post('/QuickConnect/Initiate');
  assert.equal(init.status, 200);
  const { Code, Secret } = init.body;
  assert.match(Code, /^\d{6}$/);
  assert.match(Secret, /^[0-9a-f]{64}$/);
  assert.equal(init.body.Authenticated, false);
  assert.equal((await get(`/QuickConnect/Connect?secret=${Secret}`, {})).body.Authenticated, false);
  assert.equal((await post('/Users/AuthenticateWithQuickConnect', { Secret })).status, 401);
  assert.equal((await get('/QuickConnect/Connect?secret=nope', {})).status, 404);
  assert.equal((await post('/__mock/quickconnect-approve')).status, 200);
  const state = (await get(`/QuickConnect/Connect?secret=${Secret}`, {})).body;
  assert.equal(state.Authenticated, true);
  assert.equal(state.Code, Code);
  const auth = await post('/Users/AuthenticateWithQuickConnect', { Secret });
  assert.equal(auth.status, 200);
  assert.equal(auth.body.AccessToken, TOKEN);
  assert.match(auth.body.User.Id, /^[0-9a-f]{32}$/);
  assert.equal((await post('/Users/AuthenticateWithQuickConnect', { Secret: 'unknown' })).status, 401);
});

test('AuthenticateByName accepts the mock user and password only', async () => {
  const ok = await post('/Users/AuthenticateByName', { Username: USERNAME, Pw: PASSWORD });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.AccessToken, TOKEN);
  assert.equal(ok.body.User.Name, USERNAME);
  assert.match(ok.body.User.Id, /^[0-9a-f]{32}$/);
  assert.equal((await post('/Users/AuthenticateByName', { Username: USERNAME, Pw: 'bad' })).status, 401);
  assert.equal((await post('/Users/AuthenticateByName', { Username: 'someone', Pw: PASSWORD })).status, 401);
});

test('/UserViews lists two movie libraries and one music library', async () => {
  const v = await views();
  assert.deepEqual(v.map((x) => x.CollectionType), ['movies', 'movies', 'music']);
  assert.equal(new Set(v.map((x) => x.Id)).size, 3);
  assert.equal((await get('/UserViews')).body.TotalRecordCount, 3);
});

test('every movie carries the fields the source reads, and the ratings cover G to unrated', async () => {
  const r = await movies();
  assert.ok(r.Items.length >= 10);
  for (const m of r.Items) {
    assert.match(m.Id, /^[0-9a-f]{32}$/);
    assert.equal(m.Type, 'Movie');
    assert.equal(typeof m.Name, 'string');
    assert.equal(typeof m.ProductionYear, 'number');
    assert.equal(typeof m.CommunityRating, 'number');
    assert.ok(m.Genres.length > 0);
    assert.deepEqual(m.GenreItems.map((g) => g.Name), m.Genres);
    for (const g of m.GenreItems) assert.match(g.Id, /^[0-9a-f]{32}$/);
    assert.equal(typeof m.Overview, 'string');
    assert.equal(typeof m.UserData.PlayCount, 'number');
    assert.equal(typeof m.ImageTags.Primary, 'string');
    assert.equal(typeof m.RunTimeTicks, 'number', m.Name);
  }
  const ratings = r.Items.map((m) => m.OfficialRating);
  for (const want of ['G', 'PG', 'PG-13', 'R', 'TV-MA', '15']) assert.ok(ratings.includes(want), want);
  assert.ok(ratings.includes(undefined), 'an unrated movie has no OfficialRating');
  // Ticks are 10,000,000 per second: The Grand Marquee runs 90 minutes.
  assert.equal(r.Items.find((m) => m.Name === 'The Grand Marquee').RunTimeTicks, 5400 * 10_000_000);
});

test('ParentId scopes /Items to one library', async () => {
  const [one, two] = await views();
  const a = await items(`ParentId=${one.Id}`);
  const b = await items(`ParentId=${two.Id}`);
  assert.ok(a.Items.length >= 5 && b.Items.length >= 4);
  assert.ok(a.Items.every((m) => m.Type === 'Movie'));
  assert.equal(new Set([...a.Items, ...b.Items].map((m) => m.Id)).size, a.Items.length + b.Items.length);
  assert.equal(a.Items.length + b.Items.length, (await movies()).Items.length);
  assert.equal(a.TotalRecordCount, a.Items.length);
});

test('Recursive: without it the root lists the libraries, not the movies', async () => {
  const flat = await items('IncludeItemTypes=Movie');
  assert.equal(flat.Items.length, 0);
  assert.equal(flat.TotalRecordCount, 0);
  const root = await items('');
  assert.ok(root.Items.some((i) => i.CollectionType === 'movies'));
  assert.ok(!root.Items.some((i) => i.Type === 'Movie'));
  const all = await items('Recursive=true');
  assert.ok(all.Items.some((i) => i.Type === 'Movie'));
});

test('IncludeItemTypes narrows by type (comma list)', async () => {
  const m = await items('Recursive=true&IncludeItemTypes=Movie');
  assert.ok(m.Items.every((i) => i.Type === 'Movie'));
  const b = await items('Recursive=true&IncludeItemTypes=BoxSet');
  assert.deepEqual(b.Items.map((i) => i.Type), ['BoxSet']);
  const both = await items('Recursive=true&IncludeItemTypes=BoxSet,Playlist');
  assert.deepEqual(both.Items.map((i) => i.Type).sort(), ['BoxSet', 'Playlist']);
});

test('SortBy=Random reorders; the default order is stable', async () => {
  const plain = names(await movies());
  assert.deepEqual(names(await movies()), plain);
  const seen = new Set();
  for (let i = 0; i < 12; i++) seen.add(names(await movies('SortBy=Random')).join('|'));
  assert.ok(seen.size > 1);
  for (const order of seen) assert.deepEqual(order.split('|').sort(), [...plain].sort());
});

test('StartIndex and Limit page the list, and TotalRecordCount is the count before paging', async () => {
  const full = await movies();
  const total = full.Items.length;
  const page = await movies('StartIndex=2&Limit=3');
  assert.deepEqual(names(page), names(full).slice(2, 5));
  assert.equal(page.TotalRecordCount, total);
  assert.equal(page.StartIndex, 2);
  const limited = await movies('Limit=4');
  assert.equal(limited.Items.length, 4);
  assert.equal(limited.TotalRecordCount, total);
  const past = await movies(`StartIndex=${total}`);
  assert.equal(past.Items.length, 0);
  assert.equal(past.TotalRecordCount, total);
  assert.equal((await movies(`StartIndex=${total - 1}&Limit=5`)).Items.length, 1);
  assert.equal((await movies('Limit=')).Items.length, total, 'an empty Limit is absent');
});

test('GenreIds keeps movies with any of the listed genres', async () => {
  const [one] = await views();
  const { Items: genres } = (await get(`/Genres?ParentId=${one.Id}`)).body;
  const byName = Object.fromEntries(genres.map((g) => [g.Name, g.Id]));
  const mystery = await movies(`GenreIds=${byName.Mystery}`);
  assert.ok(mystery.Items.length >= 2 && mystery.Items.length < (await movies()).Items.length);
  assert.ok(mystery.Items.every((m) => m.Genres.includes('Mystery')));
  assert.equal(mystery.TotalRecordCount, mystery.Items.length);
  const either = await movies(`GenreIds=${byName.Mystery},${byName.Comedy}`);
  assert.ok(either.Items.length > mystery.Items.length);
  assert.ok(either.Items.every((m) => m.Genres.includes('Mystery') || m.Genres.includes('Comedy')));
  assert.equal((await movies('GenreIds=00000000000000000000000000000000')).Items.length, 0);
});

test('OfficialRatings is a pipe-separated list and drops unrated movies', async () => {
  const one = await movies('OfficialRatings=PG-13');
  assert.ok(one.Items.length >= 1 && one.Items.every((m) => m.OfficialRating === 'PG-13'));
  const list = await movies(`OfficialRatings=${encodeURIComponent('G|TV-MA|15')}`);
  assert.deepEqual([...new Set(list.Items.map((m) => m.OfficialRating))].sort(), ['15', 'G', 'TV-MA']);
  assert.ok(list.Items.length > one.Items.length);
  assert.equal(list.TotalRecordCount, list.Items.length);
  assert.ok(!list.Items.some((m) => m.OfficialRating === undefined));
});

test('Filters=IsUnplayed drops movies that have a play count', async () => {
  const all = await movies();
  const unplayed = await movies('Filters=IsUnplayed');
  assert.ok(unplayed.Items.length > 0 && unplayed.Items.length < all.Items.length);
  assert.ok(unplayed.Items.every((m) => m.UserData.PlayCount === 0));
  assert.ok(all.Items.some((m) => m.UserData.PlayCount > 0));
  assert.equal(unplayed.TotalRecordCount, unplayed.Items.length);
});

test('Ids returns just those items', async () => {
  const all = (await movies()).Items;
  const want = [all[3], all[1]];
  const r = await items(`Ids=${want.map((m) => m.Id).join(',')}`);
  assert.deepEqual(r.Items.map((m) => m.Id).sort(), want.map((m) => m.Id).sort());
  assert.equal(r.TotalRecordCount, 2);
});

test('/Genres?ParentId= lists the genres that library uses', async () => {
  const [one, two] = await views();
  const a = (await get(`/Genres?ParentId=${one.Id}`)).body;
  const b = (await get(`/Genres?ParentId=${two.Id}`)).body;
  assert.ok(a.Items.length >= 4 && b.Items.length >= 3);
  assert.equal(a.TotalRecordCount, a.Items.length);
  assert.ok(a.Items.every((g) => g.Type === 'Genre' && typeof g.Name === 'string' && /^[0-9a-f]{32}$/.test(g.Id)));
  const mine = new Set((await items(`ParentId=${two.Id}`)).Items.flatMap((m) => m.Genres));
  assert.deepEqual(new Set(b.Items.map((g) => g.Name)), mine);
  assert.notDeepEqual(a.Items.map((g) => g.Name).sort(), b.Items.map((g) => g.Name).sort());
  assert.ok((await get('/Genres')).body.Items.length >= a.Items.length);
});

test('one BoxSet and one playlist list their items through ParentId', async () => {
  const [box] = (await items('Recursive=true&IncludeItemTypes=BoxSet')).Items;
  const [list] = (await items('Recursive=true&IncludeItemTypes=Playlist')).Items;
  assert.ok(box && list);
  const boxItems = await items(`ParentId=${box.Id}`);
  assert.ok(boxItems.Items.length >= 2 && boxItems.Items.every((m) => m.Type === 'Movie'));
  assert.equal(boxItems.TotalRecordCount, boxItems.Items.length);
  const listItems = await items(`ParentId=${list.Id}`);
  assert.ok(listItems.Items.length >= 3);
  const [one, two] = await views();
  const libs = new Set();
  for (const lib of [one, two]) {
    const ids = new Set((await items(`ParentId=${lib.Id}`)).Items.map((m) => m.Id));
    if (listItems.Items.some((m) => ids.has(m.Id))) libs.add(lib.Id);
  }
  assert.equal(libs.size, 2, 'the playlist spans both movie libraries');
});

test('/Sessions is empty until /__mock/jellyfin-sessions sets a movie or an episode', async () => {
  assert.deepEqual((await get('/Sessions')).body, []);
  const movie = (await movies()).Items[2];
  assert.equal((await post(`/__mock/jellyfin-sessions?kind=movie&id=${movie.Id}&user=viewer&paused=1`)).status, 200);
  const [s] = (await get('/Sessions')).body;
  assert.equal(s.NowPlayingItem.Id, movie.Id);
  assert.equal(s.NowPlayingItem.Type, 'Movie');
  assert.equal(s.UserName, 'viewer');
  assert.equal(s.PlayState.IsPaused, true);
  await post('/__mock/jellyfin-sessions?kind=episode');
  const [e] = (await get('/Sessions')).body;
  assert.equal(e.NowPlayingItem.Type, 'Episode');
  assert.match(e.NowPlayingItem.SeriesId, /^[0-9a-f]{32}$/);
  assert.equal(e.PlayState.IsPaused, false);
  await post('/__mock/jellyfin-sessions?kind=none');
  assert.deepEqual((await get('/Sessions')).body, []);
});

test('/Items/{id}/Images/Primary returns an image; an unknown id is 404', async () => {
  const m = (await movies()).Items[0];
  const res = await raw(`/Items/${m.Id}/Images/Primary?tag=${m.ImageTags.Primary}`, { headers: AUTH });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^image\//);
  assert.match(await res.text(), /<svg/);
  assert.equal((await raw('/Items/00000000000000000000000000000000/Images/Primary', { headers: AUTH })).status, 404);
});

test('GET /Playlists/{id}/Items lists the playlist, pages it, and needs the token', async () => {
  const [list] = (await items('Recursive=true&IncludeItemTypes=Playlist')).Items;
  const viaParent = (await items(`ParentId=${list.Id}`)).Items.map((m) => m.Id);
  const r = await get(`/Playlists/${list.Id}/Items`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.Items.map((m) => m.Id), viaParent);
  assert.equal(r.body.TotalRecordCount, viaParent.length);
  assert.equal(r.body.StartIndex, 0);
  const paged = (await get(`/Playlists/${list.Id}/Items?StartIndex=1&Limit=1`)).body;
  assert.deepEqual(paged.Items.map((m) => m.Id), viaParent.slice(1, 2));
  assert.equal(paged.TotalRecordCount, viaParent.length);
  assert.equal(paged.StartIndex, 1);
  assert.equal((await get(`/Playlists/${list.Id}/Items`, {})).status, 401);
  assert.equal((await get('/Playlists/00000000000000000000000000000000/Items')).status, 404);
});
