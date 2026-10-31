import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockPlex, TOKEN } from '../scripts/mock-plex.mjs';

let server;
let base;

before(async () => {
  server = await startMockPlex({ port: 0 });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

const get = async (path, headers = {}) => {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${base}${path}${sep}X-Plex-Token=${TOKEN}`, { headers });
  return { status: res.status, body: await res.json() };
};
const post = (path) => fetch(`${base}${path}`, { method: 'POST' });
const all = async (id, query = '') => (await get(`/library/sections/${id}/all${query}`)).body.MediaContainer.Metadata;
const titles = (items) => items.map((m) => m.title);

test('sections list Movies and Music first, then Kids Movies', async () => {
  const { Directory } = (await get('/library/sections')).body.MediaContainer;
  assert.deepEqual(Directory.map((d) => [d.key, d.title, d.type]), [['1', 'Movies', 'movie'], ['2', 'Music', 'artist'], ['3', 'Kids Movies', 'movie']]);
});

test('library 1 keeps its eight titles, keys, ratings and order', async () => {
  const items = await all(1);
  assert.deepEqual(items.map((m) => [m.ratingKey, m.title]), [
    ['1', 'The Grand Marquee'], ['2', 'Midnight Projector'], ['3', 'Velvet Curtain'], ['4', 'Popcorn Skies'],
    ['5', 'Neon Matinee'], ['6', 'Last Reel'], ['7', 'Silver Screen Serenade'], ['8', 'Encore'],
  ]);
  assert.deepEqual(items.map((m) => m.rating.toFixed(1)), ['9.0', '8.6', '8.2', '7.8', '7.4', '7.0', '6.6', '6.2']);
  assert.deepEqual(items.map((m) => m.contentRating), ['G', 'PG', 'PG-13', 'R', 'TV-MA', 'gb/12', 'gb/15', undefined]);
});

test('library 2 is Music with no /all route', async () => {
  assert.equal((await get('/library/sections/2/all')).status, 404);
});

test('library 3 lists at least four titles with their own keys', async () => {
  const items = await all(3);
  assert.ok(items.length >= 4);
  const one = new Set((await all(1)).map((m) => m.ratingKey));
  for (const m of items) assert.ok(!one.has(m.ratingKey));
  assert.ok(items.every((m) => m.type === 'movie'));
});

test('every movie in both movie libraries carries genres, audienceRating and originallyAvailableAt', async () => {
  for (const id of [1, 3]) {
    for (const m of await all(id)) {
      assert.ok(Array.isArray(m.Genre) && m.Genre.length > 0, `${m.title} genres`);
      for (const g of m.Genre) {
        assert.equal(typeof g.tag, 'string');
        assert.equal(typeof g.id, 'number');
        assert.equal(g.filter, `genre=${g.id}`);
      }
      assert.equal(typeof m.audienceRating, 'number');
      assert.match(m.originallyAvailableAt, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(m.originallyAvailableAt.slice(0, 4), String(m.year));
      assert.equal('color' in m, false);
      assert.equal('lib' in m, false);
    }
  }
});

test('watched titles carry viewCount and lastViewedAt, unwatched ones omit both', async () => {
  for (const id of [1, 3]) {
    const items = await all(id);
    const watched = items.filter((m) => 'viewCount' in m);
    const unwatched = items.filter((m) => !('viewCount' in m));
    assert.ok(watched.length > 0 && unwatched.length > 0, `library ${id} has both`);
    for (const m of watched) {
      assert.ok(Number.isInteger(m.viewCount) && m.viewCount >= 1);
      assert.ok(Number.isInteger(m.lastViewedAt) && m.lastViewedAt > 1_000_000_000);
    }
    for (const m of unwatched) assert.equal('lastViewedAt' in m, false);
  }
});

test('/genre lists that library\'s genres as Directory entries with a fastKey', async () => {
  const one = (await get('/library/sections/1/genre')).body.MediaContainer.Directory;
  const three = (await get('/library/sections/3/genre')).body.MediaContainer.Directory;
  for (const [id, list] of [[1, one], [3, three]]) {
    for (const d of list) {
      assert.match(d.key, /^\d+$/);
      assert.equal(d.fastKey, `/library/sections/${id}/all?genre=${d.key}`);
    }
  }
  const tags = (list) => list.map((d) => d.title);
  assert.ok(tags(one).includes('Drama') && !tags(three).includes('Drama'));
  assert.ok(tags(three).includes('Animation') && !tags(one).includes('Animation'));
  // Each listed genre is used by at least one title of that library, and each title's genres are listed.
  for (const [id, list] of [[1, one], [3, three]]) {
    const used = new Set((await all(id)).flatMap((m) => m.Genre.map((g) => g.tag)));
    assert.deepEqual([...used].sort(), tags(list).slice().sort());
  }
  assert.equal((await get('/library/sections/2/genre')).status, 404);
});

test('genre= filters by id or by tag, case-insensitively, and a comma list is OR', async () => {
  const dramaKey = (await get('/library/sections/1/genre')).body.MediaContainer.Directory.find((d) => d.title === 'Drama').key;
  const everything = await all(1);
  const expected = titles(everything.filter((m) => m.Genre.some((g) => g.tag === 'Drama')));
  assert.ok(expected.length > 0 && expected.length < everything.length);
  assert.deepEqual(titles(await all(1, `?genre=${dramaKey}`)), expected);
  assert.deepEqual(titles(await all(1, '?genre=Drama')), expected);
  assert.deepEqual(titles(await all(1, '?genre=drama')), expected);

  const mystery = titles(everything.filter((m) => m.Genre.some((g) => g.tag === 'Mystery')));
  const either = titles(everything.filter((m) => m.Genre.some((g) => g.tag === 'Drama' || g.tag === 'Mystery')));
  assert.ok(either.length > expected.length && either.length > mystery.length);
  assert.deepEqual(titles(await all(1, '?genre=Drama,Mystery')), either);
  assert.deepEqual(titles(await all(1, `?genre=${dramaKey},Mystery`)), either);

  assert.deepEqual(await all(1, '?genre=NoSuchGenre'), []);
  const kids = await all(3, '?genre=Animation');
  assert.ok(kids.length > 0 && kids.every((m) => m.Genre.some((g) => g.tag === 'Animation')));
  // A genre of another library finds nothing here.
  assert.deepEqual(await all(3, '?genre=Drama'), []);
});

test('the genre filter combines with contentRating and the container size', async () => {
  const drama = await all(1, '?genre=Drama');
  assert.equal(drama.length > 1, true);
  assert.deepEqual(titles(await all(1, '?genre=Drama&X-Plex-Container-Size=1')), titles(drama).slice(0, 1));
  const rated = await all(1, `?genre=Drama&contentRating=${drama[0].contentRating}`);
  assert.ok(rated.length >= 1 && rated.every((m) => m.contentRating === drama[0].contentRating));
});

test('X-Plex-Container-Size=0 answers totalSize per library', async () => {
  const q = async (id) => (await get(`/library/sections/${id}/all?X-Plex-Container-Size=0`)).body.MediaContainer;
  assert.deepEqual(await q(1), { size: 0, totalSize: 8 });
  assert.deepEqual(await q(3), { size: 0, totalSize: (await all(3)).length });
  assert.notEqual((await q(3)).totalSize, 8);
});

test('collections: one regular and one smart, with their items', async () => {
  const cols = (await get('/library/sections/1/collections')).body.MediaContainer.Metadata;
  assert.equal(cols.length, 2);
  const smart = cols.filter((c) => c.smart === '1');
  const regular = cols.filter((c) => c.smart !== '1');
  assert.equal(smart.length, 1);
  assert.equal(regular.length, 1);
  for (const c of cols) {
    assert.equal(c.type, 'collection');
    assert.equal(c.key, `/library/collections/${c.ratingKey}/children`);
    const items = (await get(c.key)).body.MediaContainer.Metadata;
    assert.ok(items.length > 0);
    assert.equal(c.childCount, items.length);
    assert.ok(items.every((m) => m.type === 'movie' && Array.isArray(m.Genre)));
  }
  assert.deepEqual((await get('/library/sections/3/collections')).body.MediaContainer.Metadata, []);
  assert.equal((await get('/library/sections/2/collections')).status, 404);
  assert.equal((await get('/library/collections/999/children')).status, 404);
});

test('playlists: one video playlist and its items', async () => {
  const lists = (await get('/playlists?playlistType=video')).body.MediaContainer.Metadata;
  assert.equal(lists.length, 1);
  const [pl] = lists;
  assert.equal(pl.type, 'playlist');
  assert.equal(pl.playlistType, 'video');
  assert.equal(pl.key, `/playlists/${pl.ratingKey}/items`);
  const items = (await get(pl.key)).body.MediaContainer.Metadata;
  assert.ok(items.length >= 2);
  assert.equal(pl.leafCount, items.length);
  assert.ok(items.some((m) => Number(m.ratingKey) <= 8) && items.some((m) => Number(m.ratingKey) > 8), 'spans both movie libraries');
  assert.deepEqual((await get('/playlists?playlistType=audio')).body.MediaContainer.Metadata, []);
  assert.equal((await get('/playlists/999/items')).status, 404);
});

test('POST /__mock/watch sets and clears watch state on every endpoint', async () => {
  const find = async (k) => (await all(1)).find((m) => m.ratingKey === k);
  const before8 = await find('8');
  assert.equal('viewCount' in before8, false);
  await post('/__mock/watch?ratingKey=8&viewCount=3');
  const set = await find('8');
  assert.equal(set.viewCount, 3);
  assert.ok(Number.isInteger(set.lastViewedAt));
  const viaMeta = (await get('/library/metadata/8')).body.MediaContainer.Metadata[0];
  assert.equal(viaMeta.viewCount, 3);
  await post('/__mock/watch?ratingKey=8&viewCount=0');
  const cleared = await find('8');
  assert.equal('viewCount' in cleared, false);
  assert.equal('lastViewedAt' in cleared, false);
  // A title that started watched can be cleared too, and a new-library title can be watched.
  const started = (await all(1)).find((m) => 'viewCount' in m);
  await post(`/__mock/watch?ratingKey=${started.ratingKey}&viewCount=0`);
  assert.equal('viewCount' in (await all(1)).find((m) => m.ratingKey === started.ratingKey), false);
  await post(`/__mock/watch?ratingKey=${started.ratingKey}&viewCount=${started.viewCount}`);
  const kid = (await all(3)).find((m) => !('viewCount' in m));
  await post(`/__mock/watch?ratingKey=${kid.ratingKey}&viewCount=2`);
  assert.equal((await all(3)).find((m) => m.ratingKey === kid.ratingKey).viewCount, 2);
  await post(`/__mock/watch?ratingKey=${kid.ratingKey}&viewCount=0`);
});

test('watch fields do not change what unwatched=1 returns; only /__mock/empty does', async () => {
  const plain = titles(await all(1));
  assert.deepEqual(titles(await all(1, '?unwatched=1')), plain);
  assert.deepEqual(titles(await all(3, '?unwatched=1')), titles(await all(3)));
  await post('/__mock/empty');
  try {
    assert.deepEqual(await all(1, '?unwatched=1'), []);
    assert.deepEqual(await all(3, '?unwatched=1'), []);
    assert.equal((await all(1)).length, 8);
  } finally {
    await post('/__mock/nonempty');
  }
  assert.deepEqual(titles(await all(1, '?unwatched=1')), plain);
});

test('rating a title and the poster route still work for the new library', async () => {
  const kid = (await all(3))[0];
  const res = await fetch(`${base}/photo/:/transcode?url=${encodeURIComponent(kid.thumb)}&X-Plex-Token=${TOKEN}`);
  assert.equal(res.headers.get('content-type'), 'image/svg+xml');
  assert.ok((await res.text()).includes(kid.title));
  await post(`/__mock/rate?ratingKey=${kid.ratingKey}&contentRating=R`);
  assert.equal((await all(3))[0].contentRating, 'R');
  await post(`/__mock/rate?ratingKey=${kid.ratingKey}&contentRating=none`);
  assert.equal('contentRating' in (await all(3))[0], false);
});

test('counts-fail answers the count request with that status for each movie library, and recovers', async () => {
  await post('/__mock/counts-fail?status=503');
  try {
    for (const id of [1, 3]) assert.equal((await get(`/library/sections/${id}/all?X-Plex-Container-Size=0`)).status, 503);
    assert.equal((await get('/library/sections/1/all')).status, 200);
  } finally {
    await post('/__mock/counts-fail?status=0');
  }
  assert.equal((await get('/library/sections/3/all?X-Plex-Container-Size=0')).status, 200);
});
