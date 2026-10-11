import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUrl, createPin, createPlexClient, discoverServers, formatRuntime, pickNowPlaying, rankConnections, toPoster, xmlToContainer } from '../js/plex.js';
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
  assert.deepEqual(pool, [{ ratingKey: '7', title: 'A', year: '1999', thumb: '/thumb/7', source: 'random', user: '', contentRating: '', duration: 0 }]);
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
