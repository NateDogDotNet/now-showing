import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUrl, createPin, createPlexClient, discoverServers, pickNowPlaying, rankConnections, toPoster, xmlToContainer } from '../js/sources/plex.js';
import { formatRuntime } from '../js/duration.js';
import { allowedValues } from '../js/ratings.js';
import { pinSignIn } from '../js/settings-ui.js';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('buildUrl skips empty params and joins paths', () => {
  const url = buildUrl('http://h:32400', '/library/sections', { a: 1, b: '', c: null, 'X-Plex-Token': 't' });
  assert.equal(url, 'http://h:32400/library/sections?a=1&X-Plex-Token=t');
});

test('pickNowPlaying filters by user and media type, preferring playing sessions', () => {
  const sessions = [
    { type: 'movie', ratingKey: '1', title: 'Paused One', thumb: '/t/1', User: { title: 'Nate' }, Player: { state: 'paused' } },
    { type: 'track', ratingKey: '2', title: 'Song', thumb: '/t/2', User: { title: 'Nate' } },
    { type: 'movie', ratingKey: '3', title: 'Other user', thumb: '/t/3', User: { title: 'Sam' }, Player: { state: 'playing' } },
    { type: 'episode', ratingKey: '4', grandparentRatingKey: '40', grandparentTitle: 'Show', grandparentThumb: '/t/40', title: 'Ep', thumb: '/t/4', User: { title: 'nate' }, Player: { state: 'playing' } },
  ];
  const p = pickNowPlaying(sessions, { username: 'NATE' });
  assert.equal(p.ratingKey, '40');
  assert.equal(p.title, 'Show');
  assert.equal(p.thumb, '/t/40');

  const moviesOnly = pickNowPlaying(sessions, { username: 'nate', includeEpisodes: false });
  assert.equal(moviesOnly.title, 'Paused One');

  assert.equal(pickNowPlaying(sessions, { username: 'nobody' }), null);
  assert.equal(pickNowPlaying(sessions).title, 'Other user');
  assert.equal(pickNowPlaying([]), null);
});

test('client sends token in the query and only an Accept header (no CORS preflight)', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url: new URL(url), opts });
    return jsonResponse({ MediaContainer: { Metadata: [{ ratingKey: '7', title: 'A', thumb: '/thumb/7', year: 1999 }, { ratingKey: '8', title: 'No art' }] } });
  };
  const client = createPlexClient({ serverUrl: 'http://h:32400/', token: 'tok', clientId: 'cid', fetchImpl });
  const pool = await client.pool({ libraryKey: '1', unwatchedOnly: true, size: 50 });
  assert.deepEqual(pool, [{ ratingKey: '7', title: 'A', year: '1999', thumb: '/thumb/7', source: 'random', user: '', contentRating: '', duration: 0, summary: '' }]);
  assert.equal(calls[0].url.searchParams.get('contentRating'), null, 'no limit: no rating filter is sent');
  const { url, opts } = calls[0];
  assert.equal(url.pathname, '/library/sections/1/all');
  assert.equal(url.searchParams.get('X-Plex-Token'), 'tok');
  assert.equal(url.searchParams.get('unwatched'), '1');
  assert.equal(url.searchParams.get('X-Plex-Container-Size'), '50');
  assert.deepEqual(Object.keys(opts.headers), ['Accept']);
});

test('client maps HTTP failures to typed errors', async () => {
  const client401 = createPlexClient({ serverUrl: 'http://h', token: 'bad', clientId: 'c', fetchImpl: async () => new Response('', { status: 401 }) });
  await assert.rejects(client401.sessions(), { kind: 'auth' });

  const clientDown = createPlexClient({ serverUrl: 'http://h', token: 't', clientId: 'c', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(clientDown.sessions(), { kind: 'network' });

  const client500 = createPlexClient({ serverUrl: 'http://h', token: 't', clientId: 'c', fetchImpl: async () => new Response('', { status: 500 }) });
  await assert.rejects(client500.libraries(), { kind: 'http', status: 500 });
});

test('imageUrl uses the photo transcoder with the requested size', () => {
  const client = createPlexClient({ serverUrl: 'http://h:32400', token: 't', clientId: 'c' });
  const url = new URL(client.imageUrl('/library/metadata/7/thumb/123', { width: 600, height: 900 }));
  assert.equal(url.pathname, '/photo/:/transcode');
  assert.equal(url.searchParams.get('url'), '/library/metadata/7/thumb/123');
  assert.equal(url.searchParams.get('width'), '600');
  assert.equal(url.searchParams.get('X-Plex-Token'), 't');
});

test('rankConnections prefers local, direct, https and can require https', () => {
  const conns = [
    { uri: 'https://relay', relay: true, local: false, protocol: 'https' },
    { uri: 'http://lan', local: true, protocol: 'http' },
    { uri: 'https://lan.plex.direct', local: true, protocol: 'https' },
    { uri: 'https://wan.plex.direct', local: false, protocol: 'https' },
  ];
  assert.deepEqual(rankConnections(conns).map((c) => c.uri), ['https://lan.plex.direct', 'http://lan', 'https://wan.plex.direct', 'https://relay']);
  assert.deepEqual(rankConnections(conns, { secureOnly: true }).map((c) => c.uri), ['https://lan.plex.direct', 'https://wan.plex.direct', 'https://relay']);
});

test('discoverServers keeps only servers with usable connections', async () => {
  const fetchImpl = async () =>
    jsonResponse([
      { name: 'Living room TV', provides: 'player', connections: [{ uri: 'http://tv', protocol: 'http' }] },
      { name: 'Home', provides: 'server', owned: true, accessToken: 'srv', connections: [{ uri: 'http://lan', local: true, protocol: 'http' }] },
    ]);
  const servers = await discoverServers('cid', 'user-token', { fetchImpl });
  assert.equal(servers.length, 1);
  assert.equal(servers[0].accessToken, 'srv');
  assert.deepEqual(await discoverServers('cid', 't', { fetchImpl, secureOnly: true }), []);
});

// ---- content rating (R-FILT-1) ----

function poolCalls(items = []) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(new URL(url));
    return jsonResponse({ MediaContainer: { Metadata: items } });
  };
  return { calls, client: createPlexClient({ serverUrl: 'http://h:32400', token: 't', clientId: 'c', fetchImpl }) };
}

test('toPoster carries contentRating (movie, episode, and absent)', () => {
  assert.equal(toPoster({ type: 'movie', ratingKey: '1', title: 'A', thumb: '/t', contentRating: 'PG-13' }, 'random').contentRating, 'PG-13');
  assert.equal(toPoster({ type: 'movie', ratingKey: '1', title: 'A', thumb: '/t', contentRating: 'gb/12A' }, 'random').contentRating, 'gb/12A');
  assert.equal(toPoster({ type: 'episode', ratingKey: '2', grandparentRatingKey: '9', title: 'E', thumb: '/t', contentRating: 'TV-MA' }, 'now-playing').contentRating, 'TV-MA');
  assert.equal(toPoster({ type: 'movie', ratingKey: '1', title: 'A', thumb: '/t' }, 'random').contentRating, '');
});

test('pickNowPlaying and item() keep the rating', async () => {
  const sessions = [{ type: 'movie', ratingKey: '1', title: 'A', thumb: '/t', contentRating: 'R', Player: { state: 'playing' } }];
  assert.equal(pickNowPlaying(sessions).contentRating, 'R');
  const { client } = poolCalls([{ ratingKey: '3', title: 'C', thumb: '/t/3', contentRating: 'PG' }]);
  assert.equal((await client.item('3')).contentRating, 'PG');
});

test('pool(): without a limit the size is as asked and no rating filter is sent', async () => {
  const { calls, client } = poolCalls();
  await client.pool({ libraryKey: '1', size: 40 });
  await client.pool({ libraryKey: '1', size: 40, maxContentRating: '' });
  for (const url of calls) {
    assert.equal(url.searchParams.get('X-Plex-Container-Size'), '40');
    assert.equal(url.searchParams.has('contentRating'), false);
  }
});

test('pool(): with a limit the container size is 3x the pool size, capped at 500', async () => {
  const { calls, client } = poolCalls();
  for (const [size, want] of [[10, '30'], [100, '300'], [166, '498'], [167, '500'], [400, '500'], [1000, '500']]) {
    await client.pool({ libraryKey: '1', size, maxContentRating: 'PG-13' });
    assert.equal(calls.at(-1).searchParams.get('X-Plex-Container-Size'), want, `size ${size}`);
  }
});

test('pool(): the PG-13 request lists every allowed ladder and mapped prefixed value and nothing above', async () => {
  const { calls, client } = poolCalls();
  await client.pool({ libraryKey: '1', size: 100, maxContentRating: 'PG-13' });
  const sent = calls[0].searchParams.get('contentRating').split(',');
  assert.deepEqual(sent, allowedValues('PG-13'));
  for (const v of ['G', 'PG', 'PG-13', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'gb/12', 'gb/12A', 'de/12', 'fr/12', 'au/M', 'ca/14A', 'nl/12']) assert.ok(sent.includes(v), v);
  for (const v of ['R', 'TV-MA', 'NC-17', 'gb/15', 'gb/18', 'au/MA15+']) assert.ok(!sent.includes(v), v);
});

test('pool(): a rating value with a plus sign survives the query string', async () => {
  const { calls, client } = poolCalls();
  await client.pool({ libraryKey: '1', size: 100, maxContentRating: 'R' });
  assert.ok(calls[0].searchParams.get('contentRating').split(',').includes('au/MA15+'));
});

test('pool() returns the rating of each item and does not filter by it (the engine does)', async () => {
  const { client } = poolCalls([
    { ratingKey: '1', title: 'A', thumb: '/t/1', contentRating: 'G' },
    { ratingKey: '2', title: 'B', thumb: '/t/2', contentRating: 'R' },
    { ratingKey: '3', title: 'C', thumb: '/t/3' },
  ]);
  const pool = await client.pool({ libraryKey: '1', size: 10, maxContentRating: 'PG' });
  assert.deepEqual(pool.map((p) => p.contentRating), ['G', 'R', '']);
});

// ---- metadata overlay and playback progress (R-NP-1, R-NP-2) ----

test('toPoster carries contentRating, duration and year for a movie', () => {
  const p = toPoster({ type: 'movie', ratingKey: '3', title: 'Velvet Curtain', year: 1972, thumb: '/t/3', contentRating: 'PG-13', duration: 8040000 }, 'random');
  assert.equal(p.contentRating, 'PG-13');
  assert.equal(p.duration, 8040000);
  assert.equal(p.year, '1972');
});

test('toPoster: an episode carries the series values (Q-mnp2)', () => {
  const ep = { type: 'episode', ratingKey: '2', grandparentRatingKey: '9', grandparentTitle: 'Show', grandparentYear: 2008, year: 2011, title: 'E', thumb: '/t', contentRating: 'TV-14', duration: 2880000 };
  const p = toPoster(ep, 'now-playing');
  assert.equal(p.ratingKey, '9');
  assert.equal(p.title, 'Show');
  assert.equal(p.contentRating, 'TV-14');
  assert.equal(p.year, '2008', "the series' year, not the episode's");
  assert.equal(p.duration, 2880000, "the playing item's own length");
  assert.equal(toPoster({ ...ep, grandparentYear: undefined }, 'now-playing').year, '', 'no series year sent: blank');
});

test('toPoster: missing or junk duration is 0, a numeric string is a number', () => {
  const base = { type: 'movie', ratingKey: '1', title: 'A', thumb: '/t' };
  assert.equal(toPoster(base, 'random').duration, 0);
  assert.equal(toPoster({ ...base, duration: 'abc' }, 'random').duration, 0);
  assert.equal(toPoster({ ...base, duration: -5 }, 'random').duration, 0);
  assert.equal(toPoster({ ...base, duration: '2880000' }, 'random').duration, 2880000);
});

test('formatRuntime: hours and minutes, minutes alone, and empty when unknown', () => {
  assert.equal(formatRuntime(8040000), '2 h 14 m');
  assert.equal(formatRuntime(2880000), '48 m');
  assert.equal(formatRuntime(7200000), '2 h');
  assert.equal(formatRuntime(3600000), '1 h');
  assert.equal(formatRuntime(0), '');
  assert.equal(formatRuntime(undefined), '');
  assert.equal(formatRuntime(null), '');
  assert.equal(formatRuntime(''), '');
  assert.equal(formatRuntime('abc'), '');
  assert.equal(formatRuntime(-1000), '');
  assert.equal(formatRuntime(20000), '', 'under half a minute rounds to nothing');
  assert.equal(formatRuntime('2880000'), '48 m');
});

const SESSION = {
  type: 'movie', ratingKey: '3', title: 'Velvet Curtain', year: 1972, thumb: '/t/3', contentRating: 'PG-13',
  duration: 6000000, viewOffset: 600000, User: { title: 'demo' }, Player: { title: 'Living Room', state: 'playing' },
};

test('pickNowPlaying carries viewOffset, duration, playerTitle and paused state from a JSON session', () => {
  const p = pickNowPlaying([SESSION]);
  assert.equal(p.viewOffset, 600000);
  assert.equal(p.duration, 6000000);
  assert.equal(p.playerTitle, 'Living Room');
  assert.equal(p.playerState, 'playing');
  assert.equal(p.paused, false);
  const paused = pickNowPlaying([{ ...SESSION, Player: { title: 'Living Room', state: 'paused' } }]);
  assert.equal(paused.paused, true);
  assert.equal(paused.playerState, 'paused');
});

test('pickNowPlaying: missing session fields are 0 / empty, never NaN', () => {
  const p = pickNowPlaying([{ type: 'movie', ratingKey: '1', title: 'A', thumb: '/t' }]);
  assert.equal(p.viewOffset, 0);
  assert.equal(p.duration, 0);
  assert.equal(p.playerTitle, '');
  assert.equal(p.paused, false);
});

// A just-enough stand-in for the DOM tree DOMParser builds from /status/sessions XML (node has no DOMParser).
function fakeXml(root) {
  const node = ([name, attrs, kids = []]) => {
    const children = kids.map(node);
    return {
      nodeName: name,
      attributes: Object.entries(attrs).map(([n, value]) => ({ name: n, value })),
      children,
    };
  };
  return { documentElement: node(root), getElementsByTagName: () => [] };
}

test('pickNowPlaying carries the same fields from an XML session (attributes are strings)', () => {
  const doc = fakeXml(['MediaContainer', { size: '1' }, [
    ['Video', { type: 'movie', ratingKey: '3', title: 'Velvet Curtain', year: '1972', thumb: '/t/3', contentRating: 'PG-13', duration: '6000000', viewOffset: '600000' }, [
      ['User', { title: 'demo' }],
      ['Player', { title: 'Living Room', state: 'paused' }],
    ]],
  ]]);
  const p = pickNowPlaying(xmlToContainer(doc).Metadata);
  assert.equal(p.viewOffset, 600000);
  assert.equal(p.duration, 6000000);
  assert.equal(p.playerTitle, 'Living Room');
  assert.equal(p.paused, true);
  assert.equal(p.year, '1972');
  assert.equal(p.contentRating, 'PG-13');
});

test('items(keys) is ONE request with the keys joined by literal commas, and returns each item with its rating', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(new URL(url));
    return jsonResponse({ MediaContainer: { Metadata: [
      { ratingKey: '1', title: 'A', thumb: '/t/1', contentRating: 'G' },
      { ratingKey: '4', title: 'D', thumb: '/t/4', contentRating: 'R' },
    ] } });
  };
  const client = createPlexClient({ serverUrl: 'http://h:32400', token: 't', clientId: 'c', fetchImpl });
  const items = await client.items(['1', '2', '4']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].pathname, '/library/metadata/1,2,4');
  assert.deepEqual(items.map((p) => [p.ratingKey, p.contentRating]), [['1', 'G'], ['4', 'R']]);
  assert.deepEqual(await client.items([]), [], 'no keys: no request');
  assert.equal(calls.length, 1);
});

// ---- library counts (R-SET-4) ----

function countClient(respond) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(new URL(url));
    return respond(url);
  };
  return { calls, client: createPlexClient({ serverUrl: 'http://h:32400', token: 'tok', clientId: 'cid', fetchImpl }) };
}

test('libraryCount reads totalSize from a JSON container, asking for no items', async () => {
  const { calls, client } = countClient(() => jsonResponse({ MediaContainer: { size: 0, totalSize: 1240 } }));
  assert.equal(await client.libraryCount('1'), 1240);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].pathname, '/library/sections/1/all');
  assert.equal(calls[0].searchParams.get('X-Plex-Container-Start'), '0');
  assert.equal(calls[0].searchParams.get('X-Plex-Container-Size'), '0');
  assert.equal(calls[0].searchParams.get('X-Plex-Token'), 'tok');
});

test('libraryCount accepts a numeric string and zero, and encodes the section key', async () => {
  const { calls, client } = countClient(() => jsonResponse({ MediaContainer: { size: 0, totalSize: '8' } }));
  assert.equal(await client.libraryCount('1'), 8);
  assert.equal(await createPlexClient({ serverUrl: 'http://h', token: 't', clientId: 'c', fetchImpl: async () => jsonResponse({ MediaContainer: { totalSize: 0 } }) }).libraryCount('2'), 0);
  await client.libraryCount('a/b');
  assert.equal(calls.at(-1).pathname, '/library/sections/a%2Fb/all');
});

test('libraryCount reads totalSize from an XML container', async () => {
  const saved = globalThis.DOMParser;
  globalThis.DOMParser = class {
    parseFromString() {
      return fakeXml(['MediaContainer', { size: '0', totalSize: '1240' }]);
    }
  };
  try {
    const { client } = countClient(() => new Response('<MediaContainer size="0" totalSize="1240"/>', { status: 200, headers: { 'Content-Type': 'text/xml' } }));
    assert.equal(await client.libraryCount('1'), 1240);
  } finally {
    if (saved === undefined) delete globalThis.DOMParser;
    else globalThis.DOMParser = saved;
  }
});

test('libraryCount is null when the attribute is missing or not a count', async () => {
  for (const container of [{ size: 0 }, { size: 0, totalSize: 'many' }, { size: 0, totalSize: '' }, { size: 0, totalSize: -3 }, { size: 0, totalSize: null }, {}]) {
    const { client } = countClient(() => jsonResponse({ MediaContainer: container }));
    assert.equal(await client.libraryCount('1'), null, JSON.stringify(container));
  }
  const { client } = countClient(() => new Response('', { status: 200 }));
  assert.equal(await client.libraryCount('1'), null, 'an empty body has no count');
});

test('libraryCount is null, never a throw, on an error', async () => {
  for (const respond of [
    () => new Response('', { status: 500 }),
    () => new Response('', { status: 401 }),
    () => new Response('not json', { status: 200 }),
    () => {
      throw new TypeError('Failed to fetch');
    },
  ]) {
    const { client } = countClient(respond);
    assert.equal(await client.libraryCount('1'), null);
  }
});

// ---- the plex.tv code (R-FIRST-1) ----

test('createPin returns the id, code and how long the code lives, from plex.tv\'s own figure', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url: new URL(url), opts });
    return jsonResponse({ id: 77, code: 'AB12', expiresIn: 900, expiresAt: '2026-10-11T12:15:00Z', authToken: null });
  };
  const pin = await createPin('cid', { fetchImpl });
  assert.deepEqual(pin, { id: 77, code: 'AB12', expiresAt: '2026-10-11T12:15:00Z', expiresIn: 900 });
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].url.pathname, '/api/v2/pins');
  assert.equal(calls[0].url.searchParams.get('strong'), 'false');
  assert.equal(calls[0].url.searchParams.get('X-Plex-Client-Identifier'), 'cid');
});

test('createPin: a missing or unusable lifetime is null, not a number made up here', async () => {
  for (const expiresIn of [undefined, null, 0, -5, 'soon']) {
    const pin = await createPin('c', { fetchImpl: async () => jsonResponse({ id: 1, code: 'AB12', expiresIn }) });
    assert.equal(pin.expiresIn, null, String(expiresIn));
  }
});

test('createPin: a reply with no id or no code is an error, never a blank pin', async () => {
  for (const body of [{}, { id: 1 }, { code: 'AB12' }, { id: 1, code: '' }, { id: 1, code: 42 }]) {
    await assert.rejects(createPin('c', { fetchImpl: async () => jsonResponse(body) }), { kind: 'parse' }, JSON.stringify(body));
  }
  await assert.rejects(createPin('c', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), { kind: 'network' });
  await assert.rejects(createPin('c', { fetchImpl: async () => new Response('', { status: 500 }) }), { kind: 'http' });
});

// ---- pinSignIn: the code flow the Settings sheet and the empty card share ----

/** A stand-in for plex.tv: pins are created as `pin`, polls answer from `polls` in turn (an Error is thrown, a value is the authToken). */
function fakePlexTv({ pin = { id: 5, code: 'AB12', expiresIn: 1 }, polls = [null] } = {}) {
  const seen = { pins: 0, polls: 0 };
  const fetchImpl = async (url, opts) => {
    const u = new URL(url);
    if (opts?.method === 'POST') {
      seen.pins++;
      return jsonResponse(pin);
    }
    const next = polls[Math.min(seen.polls++, polls.length - 1)];
    if (next instanceof Error) throw next;
    return jsonResponse({ id: Number(u.pathname.split('/').pop()), authToken: next });
  };
  return { seen, fetchImpl };
}

test('pinSignIn shows the code once and resolves the token when the code is approved', async () => {
  const { seen, fetchImpl } = fakePlexTv({ pin: { id: 5, code: 'AB12', expiresIn: 60 }, polls: [null, null, 'user-token'] });
  const codes = [];
  const token = await pinSignIn('cid', { fetchImpl, pollMs: 5, onCode: (c) => codes.push(c) });
  assert.equal(token, 'user-token');
  assert.deepEqual(codes, ['AB12']);
  assert.equal(seen.pins, 1);
  assert.equal(seen.polls, 3);
});

test('pinSignIn resolves null when the code expires unused', async () => {
  const { seen, fetchImpl } = fakePlexTv({ pin: { id: 5, code: 'AB12', expiresIn: 0.05 }, polls: [null] });
  const t0 = Date.now();
  assert.equal(await pinSignIn('cid', { fetchImpl, pollMs: 5, minLifeMs: 60 }), null);
  assert.ok(Date.now() - t0 >= 50, 'it lived at least the floor');
  assert.equal(seen.pins, 1, 'one call makes one pin; the caller asks again');
});

test('pinSignIn never trusts a lifetime shorter than its floor', async () => {
  const { fetchImpl } = fakePlexTv({ pin: { id: 5, code: 'AB12', expiresIn: 0.001 }, polls: [null] });
  const t0 = Date.now();
  assert.equal(await pinSignIn('cid', { fetchImpl, pollMs: 5, minLifeMs: 80 }), null);
  assert.ok(Date.now() - t0 >= 75, `lived ${Date.now() - t0} ms`);
});

test('pinSignIn: a failing poll is not an error, the code stays good', async () => {
  const { seen, fetchImpl } = fakePlexTv({ pin: { id: 5, code: 'AB12', expiresIn: 60 }, polls: [new TypeError('offline'), new TypeError('offline'), 'tok'] });
  assert.equal(await pinSignIn('cid', { fetchImpl, pollMs: 2 }), 'tok');
  assert.equal(seen.polls, 3);
});

test('pinSignIn throws when no code can be had, and shows no code', async () => {
  const codes = [];
  await assert.rejects(pinSignIn('cid', { fetchImpl: async () => { throw new TypeError('offline'); }, onCode: (c) => codes.push(c) }), { kind: 'network' });
  await assert.rejects(pinSignIn('cid', { fetchImpl: async () => jsonResponse({}), onCode: (c) => codes.push(c) }), { kind: 'parse' });
  assert.deepEqual(codes, []);
});

test('pinSignIn stops at once when aborted, before or during the wait', async () => {
  const { seen, fetchImpl } = fakePlexTv({ pin: { id: 5, code: 'AB12', expiresIn: 60 }, polls: [null] });
  const ctrl = new AbortController();
  const run = pinSignIn('cid', { fetchImpl, pollMs: 10_000, signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 20);
  const t0 = Date.now();
  assert.equal(await run, null);
  assert.ok(Date.now() - t0 < 2000, 'did not sit out the 10 s poll wait');
  assert.equal(seen.polls, 0);
  const done = new AbortController();
  done.abort();
  assert.equal(await pinSignIn('cid', { fetchImpl, signal: done.signal, onCode: () => assert.fail('no code after abort') }), null);
});

// D73/D75 (review finding 1): contentRating is always the item's own (the live limit reads it); a series rating, when Plex sends a non-empty one, is carried apart for the cache.
test('toPoster: an episode keeps its own contentRating and carries a non-empty grandparentContentRating as seriesRating', () => {
  const ep = { type: 'episode', ratingKey: '2', grandparentRatingKey: '9', grandparentTitle: 'Show', title: 'E', thumb: '/t', contentRating: 'TV-MA', grandparentContentRating: 'TV-PG' };
  const p = toPoster(ep, 'now-playing');
  assert.equal(p.contentRating, 'TV-MA', "the episode's own rating: the live limit check reads it");
  assert.equal(p.seriesRating, 'TV-PG');
  assert.notEqual(p.episodeRating, true, 'the show\'s rating is known: the cache may store it');
});

test('toPoster: an episode without a non-empty grandparentContentRating marks its rating as the episode\'s own', () => {
  const ep = { type: 'episode', ratingKey: '2', grandparentRatingKey: '9', grandparentTitle: 'Show', title: 'E', thumb: '/t', contentRating: 'TV-PG' };
  for (const extra of [{}, { grandparentContentRating: '' }, { grandparentContentRating: 7 }]) {
    const p = toPoster({ ...ep, ...extra }, 'now-playing');
    assert.equal(p.episodeRating, true);
    assert.equal(p.seriesRating, undefined);
    assert.equal(p.contentRating, 'TV-PG', 'the live limit check still sees what Plex sent');
  }
  assert.equal(toPoster({ ...ep, contentRating: undefined }, 'now-playing').episodeRating, true);
  const movie = toPoster({ type: 'movie', ratingKey: '1', title: 'A', thumb: '/t', contentRating: 'PG', grandparentContentRating: 'R' }, 'random');
  assert.notEqual(movie.episodeRating, true, 'a movie\'s rating is its own');
  assert.equal(movie.seriesRating, undefined);
});

test('a TV-MA episode of a TV-PG show is refused live under PG and cached as TV-PG', async () => {
  const p = toPoster({ type: 'episode', ratingKey: '2', grandparentRatingKey: '9', grandparentTitle: 'Show', title: 'E', thumb: '/t', contentRating: 'TV-MA', grandparentContentRating: 'TV-PG' }, 'now-playing');
  const { allows } = await import('../js/ratings.js');
  assert.equal(allows('PG', p.contentRating), false, 'refused live: the episode is TV-MA');
  assert.equal(allows('PG', p.seriesRating), true, 'the show itself is TV-PG');
});

// ---- landscape fill: the synopsis (R-FILL-1) ----

test('toPoster carries a summary, trimmed to 300 characters on a word boundary before it is stored anywhere', () => {
  const base = { type: 'movie', ratingKey: '3', title: 'Velvet Curtain', thumb: '/t/3' };
  assert.equal(toPoster({ ...base, summary: 'A short plot.' }, 'random').summary, 'A short plot.');
  const long = toPoster({ ...base, summary: 'Curtains rise on a quiet town. '.repeat(30) }, 'random').summary;
  assert.ok(long.length <= 301, `length ${long.length}`);
  assert.ok(long.endsWith('…'));
  assert.ok(!/ …$/.test(long), 'cut on a word boundary');
  assert.equal(toPoster(base, 'random').summary, '', 'no summary sent: empty');
  assert.equal(toPoster({ ...base, summary: 7 }, 'random').summary, '', 'junk is empty');
});

test('toPoster: an episode carries its own summary', () => {
  const ep = { type: 'episode', ratingKey: '2', grandparentRatingKey: '9', grandparentTitle: 'Show', title: 'E', thumb: '/t', summary: 'The pilot.' };
  assert.equal(toPoster(ep, 'now-playing').summary, 'The pilot.');
});

test('every poster the client lists carries the trimmed summary (pool, item, items, sessions)', async () => {
  const long = 'Lorem ipsum dolor sit amet. '.repeat(40);
  const meta = (k) => ({ type: 'movie', ratingKey: k, title: `T${k}`, thumb: `/t/${k}`, summary: long });
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path === '/status/sessions') return jsonResponse({ MediaContainer: { Metadata: [{ ...meta('3'), User: { title: 'Nate' }, Player: { state: 'playing' } }] } });
    return jsonResponse({ MediaContainer: { Metadata: [meta('1'), meta('2')] } });
  };
  const client = createPlexClient({ serverUrl: 'http://h:32400', token: 't', clientId: 'c', fetchImpl });
  const playing = pickNowPlaying(await client.sessions());
  assert.ok(playing, 'the session is picked');
  assert.equal(playing.source, 'now-playing');
  const lists = [await client.pool({ libraryKey: '1' }), [await client.item('1')], await client.items(['1', '2']), [playing]];
  for (const p of lists.flat()) assert.ok(p.summary.length > 0 && p.summary.length <= 301, `summary ${p.summary.length}`);
});

// ---- the poster selection (R-SEL-1, D107): the requests for libraries, genres, ratings, a collection and a playlist ----

const ask = (url) => Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'X-Plex-Token' && !k.startsWith('X-Plex-Client') && k !== 'X-Plex-Product'));

test('request for one library, nothing else: the 2.2 request, with no genre and no rating filter', async () => {
  const { calls, client } = poolCalls();
  await client.pool({ libraryKey: '1', unwatchedOnly: true, size: 100 });
  assert.equal(calls[0].pathname, '/library/sections/1/all');
  assert.deepEqual(ask(calls[0]), { unwatched: '1', sort: 'rating:desc', 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': '100' });
});

test('request for two libraries: one pool request each, with its own size', async () => {
  const { calls, client } = poolCalls();
  await client.pool({ libraryKey: '1', size: 62 });
  await client.pool({ libraryKey: '3', size: 38 });
  assert.deepEqual(calls.map((u) => [u.pathname, u.searchParams.get('X-Plex-Container-Size')]), [['/library/sections/1/all', '62'], ['/library/sections/3/all', '38']]);
});

test('request for a genre set: genre=<keys joined by a comma>, sized plainly when there is no limit', async () => {
  const { calls, client } = poolCalls();
  await client.pool({ libraryKey: '1', size: 40, genres: ['12', '14'] });
  assert.equal(calls[0].searchParams.get('genre'), '12,14');
  assert.equal(calls[0].searchParams.get('X-Plex-Container-Size'), '40');
  await client.pool({ libraryKey: '1', size: 40, genres: [] });
  assert.equal(calls[1].searchParams.has('genre'), false, 'no genre chosen: no parameter');
});

test('request for a rating set: only the chosen rungs, intersected with the limit, oversampled like a limit', async () => {
  const { calls, client } = poolCalls();
  await client.pool({ libraryKey: '1', size: 100, maxContentRating: 'PG-13', ratings: ['G', 'PG'] });
  const sent = calls[0].searchParams.get('contentRating').split(',');
  assert.deepEqual([...sent].sort(), [...allowedValues('PG')].sort(), 'G and PG values, not the PG-13 ones');
  assert.equal(calls[0].searchParams.get('X-Plex-Container-Size'), '300');
  await client.pool({ libraryKey: '1', size: 100, maxContentRating: '', ratings: ['R'] });
  assert.equal(calls[1].searchParams.get('X-Plex-Container-Size'), '300', 'a rating subset oversamples with no limit too');
  assert.ok(calls[1].searchParams.get('contentRating').split(',').includes('TV-MA'));
  assert.ok(!calls[1].searchParams.get('contentRating').split(',').includes('PG-13'));
});

test('request for a rating set that the limit leaves empty: no request at all, never an unfiltered one', async () => {
  const { calls, client } = poolCalls([{ ratingKey: '1', title: 'A', thumb: '/t/1', contentRating: 'R' }]);
  assert.deepEqual(await client.pool({ libraryKey: '1', size: 100, maxContentRating: 'PG', ratings: ['R', 'NC-17'] }), []);
  assert.equal(calls.length, 0);
});

test('request for a collection and for a playlist: their own paths, no library path', async () => {
  const { calls, client } = poolCalls([{ ratingKey: '2', title: 'B', thumb: '/t/2', type: 'movie' }]);
  assert.deepEqual((await client.sourceItems({ kind: 'collection', key: '101' })).map((p) => p.ratingKey), ['2']);
  assert.equal(calls[0].pathname, '/library/collections/101/children');
  assert.deepEqual((await client.sourceItems({ kind: 'playlist', key: '201' })).map((p) => p.ratingKey), ['2']);
  assert.equal(calls[1].pathname, '/playlists/201/items');
  await client.sourceItems({ kind: 'playlist', key: 'a/b' });
  assert.equal(calls[2].pathname, '/playlists/a%2Fb/items', 'the key is encoded');
});

test('a collection or playlist: items without art, episodes and the watched (when unwatched only) are left out; at most size, best rated first', async () => {
  const items = [
    { ratingKey: '1', type: 'movie', title: 'A', thumb: '/t/1', rating: 5 },
    { ratingKey: '2', type: 'movie', title: 'B', thumb: '/t/2', rating: 9, viewCount: 2 },
    { ratingKey: '3', type: 'movie', title: 'C', title2: 'x' },
    { ratingKey: '4', type: 'episode', title: 'D', thumb: '/t/4' },
    { ratingKey: '5', title: 'E', thumb: '/t/5', rating: 7 },
    { ratingKey: '6', type: 'movie', title: 'F', thumb: '/t/6', rating: 8 },
  ];
  const { client } = poolCalls(items);
  const unwatched = await client.sourceItems({ kind: 'collection', key: '1' }, { unwatchedOnly: true, size: 100 });
  assert.deepEqual(unwatched.map((p) => p.ratingKey), ['6', '5', '1'], 'no art, an episode and a watched title are out; best rated first');
  const all = await client.sourceItems({ kind: 'collection', key: '1' }, { unwatchedOnly: false, size: 100 });
  assert.deepEqual(all.map((p) => p.ratingKey), ['2', '6', '5', '1'], 'a watched title stays when unwatched only is off');
  const capped = await client.sourceItems({ kind: 'collection', key: '1' }, { unwatchedOnly: false, size: 2 });
  assert.deepEqual(capped.map((p) => p.ratingKey), ['2', '6']);
  assert.equal(unwatched[0].source, 'random');
});

test('genres(), collections() and playlists() read the lists Settings offers', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    calls.push(u);
    if (u.pathname.endsWith('/genre')) return jsonResponse({ MediaContainer: { Directory: [{ key: '12', title: 'Comedy', fastKey: '/x' }, { key: 14, title: 'Adventure' }, { title: 'No key' }, { key: '9' }] } });
    if (u.pathname.endsWith('/collections')) return jsonResponse({ MediaContainer: { Metadata: [{ ratingKey: '101', title: 'Double Features', smart: '0' }, { ratingKey: '102', title: 'Top Rated', smart: '1' }, { title: 'broken' }] } });
    return jsonResponse({ MediaContainer: { Metadata: [{ ratingKey: '201', title: 'Friday Night Picks' }] } });
  };
  const client = createPlexClient({ serverUrl: 'http://h:32400', token: 't', clientId: 'c', fetchImpl });
  assert.deepEqual(await client.genres('1'), [{ key: '12', title: 'Comedy' }, { key: '14', title: 'Adventure' }, { key: '', title: 'No key' }]);
  assert.equal(calls[0].pathname, '/library/sections/1/genre');
  assert.deepEqual(await client.collections('1'), [{ key: '101', title: 'Double Features', smart: false }, { key: '102', title: 'Top Rated', smart: true }]);
  assert.equal(calls[1].pathname, '/library/sections/1/collections');
  assert.deepEqual(await client.playlists(), [{ key: '201', title: 'Friday Night Picks' }]);
  assert.equal(calls[2].pathname, '/playlists');
  assert.equal(calls[2].searchParams.get('playlistType'), 'video');
});

test('toPoster carries the title own genre tags, and nothing when there are none', () => {
  const base = { type: 'movie', ratingKey: '1', title: 'A', thumb: '/t' };
  assert.deepEqual(toPoster({ ...base, Genre: [{ id: 12, tag: 'Comedy', filter: 'genre=12' }, { id: 3 }, { tag: 'Drama' }] }, 'random').genres, ['Comedy', 'Drama']);
  assert.equal('genres' in toPoster(base, 'random'), false);
  assert.equal('genres' in toPoster({ ...base, Genre: [] }, 'random'), false);
  assert.equal('genres' in toPoster({ ...base, Genre: 'Comedy' }, 'random'), false);
});

test('collections() also reads a container that lists them as Directory entries (the XML shape)', async () => {
  const fetchImpl = async () => jsonResponse({ MediaContainer: { Directory: [{ ratingKey: '5', title: 'Dir collection', smart: '1' }] } });
  const client = createPlexClient({ serverUrl: 'http://h:32400', token: 't', clientId: 'c', fetchImpl });
  assert.deepEqual(await client.collections('1'), [{ key: '5', title: 'Dir collection', smart: true }]);
});

// ---- r2: the selection through an XML reply, and a curated list asking for the same extra items as a library ----

test('r2 gap 1: an XML reply keeps the Genre tags, so a genre selection and the cached genres work on a server that answers XML', async () => {
  const doc = fakeXml(['MediaContainer', { size: '2' }, [
    ['Video', { type: 'movie', ratingKey: '4', title: 'Popcorn Skies', thumb: '/t/4', contentRating: 'R', viewCount: '2', rating: '6.8' }, [
      ['Genre', { id: '14', tag: 'Adventure', filter: 'genre=14' }],
      ['Genre', { id: '12', tag: 'Comedy', filter: 'genre=12' }],
      ['Player', { title: 'x', state: 'playing' }],
    ]],
    ['Video', { type: 'movie', ratingKey: '5', title: 'Neon Matinee', thumb: '/t/5' }, []],
  ]]);
  const container = xmlToContainer(doc);
  assert.deepEqual(container.Metadata[0].Genre, [{ id: '14', tag: 'Adventure', filter: 'genre=14' }, { id: '12', tag: 'Comedy', filter: 'genre=12' }]);
  assert.equal('Genre' in container.Metadata[1], false, 'an item with no tags has no Genre list');
  assert.equal(container.Metadata[0].Player.state, 'playing', 'the sub-elements that were kept before still are');
  assert.deepEqual(toPoster(container.Metadata[0], 'random').genres, ['Adventure', 'Comedy']);
  assert.equal(container.Metadata[0].viewCount, '2', 'attributes the selection reads survive as strings');
});

test('r2 gap 1: pool() over an XML reply returns posters with their genres', async () => {
  const saved = globalThis.DOMParser;
  globalThis.DOMParser = class {
    parseFromString() {
      return fakeXml(['MediaContainer', { size: '1' }, [['Video', { type: 'movie', ratingKey: '6', title: 'Last Reel', thumb: '/t/6' }, [['Genre', { id: '12', tag: 'Comedy' }]]]]]);
    }
  };
  try {
    const client = createPlexClient({ serverUrl: 'http://h:32400', token: 't', clientId: 'c', fetchImpl: async () => new Response('<MediaContainer size="1"><Video/></MediaContainer>', { status: 200, headers: { 'Content-Type': 'text/xml' } }) });
    assert.deepEqual((await client.pool({ libraryKey: '1', size: 10 }))[0].genres, ['Comedy']);
  } finally {
    if (saved === undefined) delete globalThis.DOMParser;
    else globalThis.DOMParser = saved;
  }
});

test('r2 gap 9: a collection or playlist is cut to 3x the pool size (at most 500) under a limit or a rating subset, as a library is asked for', async () => {
  const items = Array.from({ length: 700 }, (_, i) => ({ ratingKey: String(i), type: 'movie', title: 'T' + i, thumb: '/t/' + i, rating: 700 - i, contentRating: 'G' }));
  const { client } = poolCalls(items);
  const count = async (opts) => (await client.sourceItems({ kind: 'collection', key: '1' }, { unwatchedOnly: false, size: 10, ...opts })).length;
  assert.equal(await count({}), 10, 'no limit: the pool size');
  assert.equal(await count({ maxContentRating: '' }), 10);
  assert.equal(await count({ maxContentRating: 'PG' }), 30, 'a limit: 3x');
  assert.equal(await count({ maxContentRating: '', ratings: ['G'] }), 30, 'a rating subset: 3x');
  assert.equal(await count({ maxContentRating: 'PG', size: 400 }), 500, 'capped at 500');
  assert.equal(await count({ maxContentRating: 'PG', size: 166 }), 498);
});

test('r2 gap 8: sourceItems says every rating key the listing held, filtered out or not, so the cache can tell who left it', async () => {
  const { client } = poolCalls([
    { ratingKey: '1', type: 'movie', title: 'A', thumb: '/t/1' },
    { ratingKey: '2', type: 'movie', title: 'B', thumb: '/t/2', viewCount: 3 },
    { ratingKey: '3', type: 'episode', title: 'C', thumb: '/t/3' },
    { ratingKey: '4', type: 'movie', title: 'D' },
    { title: 'no key' },
  ]);
  const list = await client.sourceItems({ kind: 'collection', key: '1' }, { unwatchedOnly: true, size: 1 });
  assert.deepEqual(list.map((p) => p.ratingKey), ['1']);
  assert.deepEqual(list.listed, ['1', '2', '3', '4']);
});

test('r3 gap 2: what the limit in force or the chosen ratings reject is dropped before a collection is cut, so high-scoring rejected titles cannot crowd out the allowed ones', async () => {
  // 300 R titles that score higher and 100 G titles: under a G limit with a pool of 100 the allowed ones must all come through.
  const items = [
    ...Array.from({ length: 300 }, (_, i) => ({ ratingKey: 'r' + i, type: 'movie', title: 'R' + i, thumb: '/t/r' + i, rating: 9, contentRating: 'R' })),
    ...Array.from({ length: 100 }, (_, i) => ({ ratingKey: 'g' + i, type: 'movie', title: 'G' + i, thumb: '/t/g' + i, rating: 5, contentRating: 'G' })),
  ];
  const { client } = poolCalls(items);
  const list = await client.sourceItems({ kind: 'collection', key: '1' }, { unwatchedOnly: false, size: 100, maxContentRating: 'G' });
  assert.equal(list.length, 100);
  assert.ok(list.every((p) => p.contentRating === 'G'));
  assert.equal(list.listed.length, 400, 'the full listing still feeds the offline memberships');
  const subset = await client.sourceItems({ kind: 'collection', key: '1' }, { unwatchedOnly: false, size: 10, maxContentRating: '', ratings: ['G'] });
  assert.equal(subset.length, 30);
  assert.ok(subset.every((p) => p.contentRating === 'G'), 'a chosen rating also drops the rest before the cut');
  const open = await client.sourceItems({ kind: 'collection', key: '1' }, { unwatchedOnly: false, size: 10 });
  assert.deepEqual(open.map((p) => p.contentRating), Array(10).fill('R'), 'no limit and no subset: the best rated, as before');
  const unrated = poolCalls([{ ratingKey: '1', type: 'movie', title: 'u', thumb: '/t/1' }, { ratingKey: '2', type: 'movie', title: 'g', thumb: '/t/2', contentRating: 'gb/U' }]);
  assert.deepEqual((await unrated.client.sourceItems({ kind: 'playlist', key: '1' }, { unwatchedOnly: false, maxContentRating: 'G' })).map((p) => p.ratingKey), ['2'], 'an unrated title is dropped under a limit; a prefixed rating on the ladder stays');
});

// ---- the fields weighting reads (R-SEL-2, D113) ----

test('toPoster carries viewCount (only when watched), audienceRating and rating, for the weights', () => {
  const base = { type: 'movie', ratingKey: '1', title: 'A', thumb: '/t' };
  const p = toPoster({ ...base, viewCount: 2, audienceRating: 8.4, rating: 7.1 }, 'random');
  assert.equal(p.viewCount, 2);
  assert.equal(p.audienceRating, 8.4);
  assert.equal(p.rating, 7.1);
  const bare = toPoster(base, 'random');
  for (const k of ['viewCount', 'audienceRating', 'rating']) assert.ok(!(k in bare), `${k} is left off when the server sent none`);
  assert.ok(!('viewCount' in toPoster({ ...base, viewCount: 0 }, 'random')), 'viewCount 0 is unwatched: left off');
  const xml = toPoster({ ...base, viewCount: '3', audienceRating: '9.1', rating: '6' }, 'random');
  assert.deepEqual([xml.viewCount, xml.audienceRating, xml.rating], [3, 9.1, 6], 'an XML attribute is a string');
  const junk = toPoster({ ...base, viewCount: 'x', audienceRating: 'high', rating: null }, 'random');
  for (const k of ['viewCount', 'audienceRating', 'rating']) assert.ok(!(k in junk), `junk ${k} is left off`);
});

test('the pool and a collection or playlist hand the weights their fields', async () => {
  const items = [{ type: 'movie', ratingKey: '1', title: 'A', thumb: '/t/1', viewCount: 1, audienceRating: 8, rating: 7 }, { type: 'movie', ratingKey: '2', title: 'B', thumb: '/t/2' }];
  const fetchImpl = async () => jsonResponse({ MediaContainer: { Metadata: items } });
  const client = createPlexClient({ serverUrl: 'http://h:32400', token: 'tok', clientId: 'c', fetchImpl });
  const [a, b] = await client.pool({ libraryKey: '1', unwatchedOnly: false });
  assert.deepEqual([a.viewCount, a.audienceRating, a.rating], [1, 8, 7]);
  assert.ok(!('viewCount' in b));
  const [c] = await client.sourceItems({ kind: 'collection', key: '9' }, { unwatchedOnly: false });
  assert.deepEqual([c.viewCount, c.audienceRating, c.rating], [1, 8, 7]);
});

// ---- the token-free identity (D157 3, D160 1) ----

test('publicIdentity asks GET /identity and sends no token, and reads machineIdentifier and version', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => (seen.push({ url: new URL(url), init }), jsonResponse({ MediaContainer: { machineIdentifier: 'abc123', version: '1.40.1', claimed: true } }));
  const client = createPlexClient({ serverUrl: 'http://plex.test:32400', token: 'SECRET-TOKEN', clientId: 'cid', fetchImpl });
  assert.deepEqual(await client.publicIdentity(), { name: '', version: '1.40.1', machineIdentifier: 'abc123' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url.pathname, '/identity');
  assert.equal(seen[0].url.searchParams.get('X-Plex-Client-Identifier'), 'cid');
  assert.equal(seen[0].url.searchParams.has('X-Plex-Token'), false, 'no token in the query');
  assert.equal(JSON.stringify(seen[0]).includes('SECRET-TOKEN'), false, 'no token anywhere in the request');
});

test('publicIdentity reports an unreachable address and an HTTP error as errors, and an empty reply as no id', async () => {
  const unreachable = createPlexClient({ serverUrl: 'http://x', token: 't', clientId: 'c', fetchImpl: async () => Promise.reject(new TypeError('failed')) });
  await assert.rejects(() => unreachable.publicIdentity(), (err) => err.kind === 'network');
  const refused = createPlexClient({ serverUrl: 'http://x', token: 't', clientId: 'c', fetchImpl: async () => jsonResponse({}, 500) });
  await assert.rejects(() => refused.publicIdentity(), (err) => err.kind === 'http');
  const empty = createPlexClient({ serverUrl: 'http://x', token: 't', clientId: 'c', fetchImpl: async () => jsonResponse({ MediaContainer: {} }) });
  assert.equal((await empty.publicIdentity()).machineIdentifier, '');
});
