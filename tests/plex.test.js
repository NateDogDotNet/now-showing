import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUrl, createPin, createPlexClient, discoverPlayers, discoverServerPlayers, discoverServers, pickNowPlaying, rankConnections, toPoster, xmlToContainer } from '../js/sources/plex.js';
import { formatRuntime } from '../js/duration.js';
import { allowedValues } from '../js/ratings.js';
import { pinSignIn } from '../js/settings-ui.js';
import { createSources, readPlayers } from '../js/sources/index.js';
import { cleanPlayer, defaults, PLAYER_ID_MAX, sanitize } from '../js/settings.js';
import { PLEX_TV_RESOURCES, startMockPlex } from '../scripts/mock-plex.mjs';

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

// ---- the players on the account (R-PLAY-1, D181 4, D186) ----

const player = (over = {}) => ({ name: 'Living Room TV', product: 'Plex for Android (TV)', clientIdentifier: 'tv-1', provides: 'client,player,pubsub-player', presence: true, connections: [{ uri: 'http://192.0.2.10:32500', protocol: 'http' }], ...over });
/**
 * A fetch that answers plex.tv with `body` (or by `byToken`, token -> body or a Response) and records every plex.tv request in `calls`. A request to
 * any other address is one to a household server (its own client list, D199): it is recorded in `serverCalls` and answered from `servers`
 * (origin -> body or a Response), with an empty container when the origin is not there.
 */
function plexTv(body, { byToken = {}, servers = {} } = {}) {
  const calls = [];
  const serverCalls = [];
  const fetchImpl = async (url, opts) => {
    const u = new URL(url);
    const call = { url: u, opts, token: u.searchParams.get('X-Plex-Token') };
    if (u.hostname !== 'plex.tv') {
      serverCalls.push(call);
      const said = servers[u.origin] ?? { MediaContainer: { size: 0 } };
      return said instanceof Response ? said : jsonResponse(said);
    }
    calls.push(call);
    const answer = byToken[u.searchParams.get('X-Plex-Token')] ?? body;
    return answer instanceof Response ? answer : jsonResponse(answer);
  };
  return { fetchImpl, calls, serverCalls };
}

test('discoverPlayers keeps the resources whose provides names player, as a part equal to it and nothing looser (P1)', async () => {
  const resources = [
    player({ name: 'A', clientIdentifier: 'a', provides: 'player' }),
    player({ name: 'B', clientIdentifier: 'b', provides: 'client,player,pubsub-player' }),
    player({ name: 'Both', clientIdentifier: 'both', provides: 'server,player' }),
    player({ name: 'Server', clientIdentifier: 'srv', provides: 'server' }),
    player({ name: 'Substring', clientIdentifier: 'sub', provides: 'players-x' }),
    player({ name: 'Mediaplayer', clientIdentifier: 'mp', provides: 'mediaplayer' }),
    player({ name: 'Prefix', clientIdentifier: 'pre', provides: 'player-x,client' }),
    player({ name: 'Upper', clientIdentifier: 'up', provides: 'Player' }),
    player({ name: 'None', clientIdentifier: 'none', provides: '' }),
    player({ name: 'Missing', clientIdentifier: 'missing', provides: undefined }),
    null,
    'x',
  ];
  const { fetchImpl } = plexTv(resources);
  assert.deepEqual((await discoverPlayers('me', 'tok', { fetchImpl })).map((p) => p.id), ['a', 'b', 'both']);
  assert.deepEqual(await discoverPlayers('me', 'tok', { fetchImpl: plexTv([]).fetchImpl }), []);
});

test('discoverPlayers lists each player as { id, name, present } by its client identifier (P9)', async () => {
  const { fetchImpl } = plexTv([
    player({ name: 'Den TV', clientIdentifier: ' tv-den ' }),
    player({ name: 'Away', clientIdentifier: 'tv-away', presence: false }),
    player({ name: 'No presence said', clientIdentifier: 'tv-quiet', presence: undefined }),
    player({ name: '', product: 'Plex for Roku', clientIdentifier: 'tv-roku' }),
    player({ name: '', product: '', clientIdentifier: 'tv-bare' }),
  ]);
  assert.deepEqual(await discoverPlayers('me', 'tok', { fetchImpl }), [
    { id: 'tv-den', name: 'Den TV', present: true },
    { id: 'tv-away', name: 'Away', present: false },
    { id: 'tv-quiet', name: 'No presence said', present: true },
    { id: 'tv-roku', name: 'Plex for Roku', present: true },
    { id: 'tv-bare', name: 'tv-bare', present: true },
  ]);
});

test('discoverPlayers never lists a resource with no client identifier, this display\'s own identifier, or an identifier a second time (P9)', async () => {
  const { fetchImpl } = plexTv([
    player({ name: 'No id', clientIdentifier: undefined }),
    player({ name: 'Empty id', clientIdentifier: '' }),
    player({ name: 'Blank id', clientIdentifier: '   ' }),
    player({ name: 'Number id', clientIdentifier: 42 }),
    player({ name: 'This display', clientIdentifier: 'me' }),
    player({ name: 'First', clientIdentifier: 'tv-1' }),
    player({ name: 'Second', clientIdentifier: 'tv-1' }),
    player({ name: 'Other', clientIdentifier: 'tv-2' }),
  ]);
  assert.deepEqual((await discoverPlayers('me', 'tok', { fetchImpl })).map((p) => [p.id, p.name]), [['tv-1', 'First'], ['tv-2', 'Other']]);
  assert.deepEqual((await discoverPlayers('', 'tok', { fetchImpl })).map((p) => p.id), ['me', 'tv-1', 'tv-2'], 'with no identifier of its own nothing is excluded for it');
});

test('discoverPlayers: an answer that is not a list is a failed read of kind parse, never "no players" (Q1, D187 4)', async () => {
  const answers = { 'an empty body': () => new Response('', { status: 200 }), 'an empty object': () => jsonResponse({}), 'an error object': () => jsonResponse({ errors: [{ code: 1001, message: 'x' }] }), 'a MediaContainer of one': () => jsonResponse({ MediaContainer: { size: 0 } }), 'a string': () => jsonResponse('no') };
  for (const [label, answer] of Object.entries(answers)) {
    await assert.rejects(() => discoverPlayers('me', 't', { fetchImpl: async () => answer() }), (e) => e.kind === 'parse', label);
  }
  assert.deepEqual(await discoverPlayers('me', 't', { fetchImpl: plexTv([]).fetchImpl }), [], 'a real list with nothing in it is still no players');
});

test('discoverPlayers: a name of only spaces falls back to the product, else the identifier, and is never empty (Q2, D187 4)', async () => {
  const { fetchImpl } = plexTv([
    player({ name: '   ', product: ' Plex for Roku ', clientIdentifier: 'a' }),
    player({ name: '  ', product: '  ', clientIdentifier: 'b' }),
    player({ name: undefined, product: undefined, clientIdentifier: 'c' }),
    player({ name: '\t', product: undefined, clientIdentifier: 'd' }),
    player({ name: ' Den TV ', product: 'Ignored', clientIdentifier: 'e' }),
  ]);
  assert.deepEqual((await discoverPlayers('me', 't', { fetchImpl })).map((p) => p.name), ['Plex for Roku', 'b', 'c', 'd', 'Den TV']);
});

test('discoverPlayers and the store share one bound on the identifier: a player that can be ticked can be stored (Q3, D187 3)', async () => {
  const exact = 'x'.repeat(PLAYER_ID_MAX);
  const { fetchImpl } = plexTv([player({ clientIdentifier: exact }), player({ clientIdentifier: `${exact}y`, name: 'Too long' }), player({ clientIdentifier: ` ${exact} `, name: 'Padded, then the same' })]);
  const listed = await discoverPlayers('me', 't', { fetchImpl });
  assert.deepEqual(listed.map((p) => p.id), [exact], 'the longest identifier the store keeps is listed once; one longer is not');
  for (const p of listed) assert.deepEqual(cleanPlayer(p)?.id, p.id, 'whatever is listed, the store keeps');
  assert.equal(cleanPlayer({ id: `${exact}y`, name: 'n' }), null);
  assert.equal(PLAYER_ID_MAX, 200);
});

test('discoverPlayers trims each part of provides before it compares it with player (Q4, D188 4)', async () => {
  const { fetchImpl } = plexTv([
    player({ clientIdentifier: 'a', provides: 'client, player' }),
    player({ clientIdentifier: 'b', provides: ' player ,client' }),
    player({ clientIdentifier: 'c', provides: 'client,\tplayer\n,pubsub-player' }),
    player({ clientIdentifier: 'd', provides: 'client, players' }),
    player({ clientIdentifier: 'e', provides: 'client, pla yer' }),
    player({ clientIdentifier: 'f', provides: 'server, ' }),
  ]);
  assert.deepEqual((await discoverPlayers('me', 't', { fetchImpl })).map((p) => p.id), ['a', 'b', 'c']);
});

test('discoverPlayers asks plex.tv once, with the token and only an Accept header, and never requests a player\'s own address (P8)', async () => {
  const { fetchImpl, calls } = plexTv([player(), player({ clientIdentifier: 'tv-2', connections: [{ uri: 'https://203-0-113-9.abc.plex.direct:32500', protocol: 'https' }] })]);
  await discoverPlayers('me', 'user-token', { fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, 'https://plex.tv');
  assert.equal(calls[0].url.pathname, '/api/v2/resources');
  assert.equal(calls[0].url.searchParams.get('X-Plex-Token'), 'user-token');
  assert.equal(calls[0].url.searchParams.get('X-Plex-Client-Identifier'), 'me');
  assert.deepEqual(calls[0].opts.headers, { Accept: 'application/json' });
  assert.equal(calls[0].opts.method, 'GET');
});

test('discoverPlayers fails as plex.tv failed: a refused token, an error status, a network error and a reply that is not JSON are errors, never an empty list', async () => {
  const status = (code) => async () => new Response('', { status: code });
  await assert.rejects(() => discoverPlayers('me', 't', { fetchImpl: status(401) }), (e) => e.kind === 'auth');
  await assert.rejects(() => discoverPlayers('me', 't', { fetchImpl: status(403) }), (e) => e.kind === 'auth');
  await assert.rejects(() => discoverPlayers('me', 't', { fetchImpl: status(500) }), (e) => e.kind === 'http');
  await assert.rejects(() => discoverPlayers('me', 't', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), (e) => e.kind === 'network');
  await assert.rejects(() => discoverPlayers('me', 't', { fetchImpl: async () => new Response('not json', { status: 200 }) }), (e) => e.kind === 'parse');
});

const household = (extra = {}) => sanitize({ serverUrl: 'http://p:32400', plexToken: 'tok-a', serverId: 'p1', ...extra });
const PLEX_SERVER = (over = {}) => ({ id: 'p2', type: 'plex', url: 'http://q:32400', token: 'tok-b', name: 'Q', ...over });

test('readPlayers reads plex.tv once per different Plex token among the household\'s servers, and lists each identifier once (D186 3)', async () => {
  const { fetchImpl, calls } = plexTv([], {
    byToken: {
      'tok-a': [player({ name: 'Shared', clientIdentifier: 'shared', presence: false }), player({ name: 'A only', clientIdentifier: 'a-only' })],
      'tok-b': [player({ name: 'Shared again', clientIdentifier: 'shared', presence: true }), player({ name: 'B only', clientIdentifier: 'b-only' })],
    },
  });
  const sameAccount = household({ servers: [PLEX_SERVER({ id: 'p3', token: 'tok-a' })] });
  const one = await readPlayers(sameAccount, { clientId: 'me', fetchImpl });
  assert.equal(calls.length, 1, 'two servers of one account are one read');
  assert.deepEqual([one.accounts, one.players.map((p) => p.id)], [1, ['shared', 'a-only']]);
  calls.length = 0;
  const two = await readPlayers(household({ servers: [PLEX_SERVER()] }), { clientId: 'me', fetchImpl });
  assert.deepEqual(calls.map((c) => c.token).sort(), ['tok-a', 'tok-b'], 'two accounts, two reads');
  assert.deepEqual([two.accounts, two.players.map((p) => p.id).sort()], [2, ['a-only', 'b-only', 'shared']], 'the identifier both accounts list is listed once');
  assert.equal(two.players.find((p) => p.id === 'shared').present, true, 'present when any account says it is');
  assert.equal(calls.every((c) => c.url.origin === 'https://plex.tv'), true, 'every account token is read at plex.tv');
});

const clients = (...list) => ({ MediaContainer: { size: list.length, Server: list } });
const client = (over = {}) => ({ name: 'Den HTPC', product: 'Plex HTPC', machineIdentifier: 'htpc-1', host: '192.168.1.50', address: '192.168.1.50', port: 32500, protocolCapabilities: 'timeline,playback,navigation,playqueues', ...over });

test('discoverServerPlayers lists the clients the server lists as { id, name, present: true }, under the rules of discoverPlayers (D199)', async () => {
  const { fetchImpl, serverCalls } = plexTv([], {
    servers: {
      'http://p:32400': clients(
        client(),
        client({ name: '  ', machineIdentifier: 'amp-1', product: 'Plexamp' }),
        client({ name: '', product: '', machineIdentifier: 'bare' }),
        client({ name: 'Says nothing', machineIdentifier: 'quiet', protocolCapabilities: undefined }),
        client({ name: 'Cannot play', machineIdentifier: 'nav', protocolCapabilities: 'timeline,navigation' }),
        client({ name: 'A look-alike', machineIdentifier: 'look', protocolCapabilities: 'playbacks, xplayback' }),
        client({ name: 'Spaced', machineIdentifier: 'spaced', protocolCapabilities: 'timeline, playback' }),
        client({ name: 'Again', machineIdentifier: 'htpc-1' }),
        client({ name: 'No id', machineIdentifier: '' }),
        client({ name: 'Long', machineIdentifier: 'x'.repeat(201) }),
        client({ name: 'Me', machineIdentifier: 'me' }),
        null,
      ),
    },
  });
  assert.deepEqual(await discoverServerPlayers('http://p:32400', 'tok-a', 'me', { fetchImpl }), [
    { id: 'htpc-1', name: 'Den HTPC', present: true },
    { id: 'amp-1', name: 'Plexamp', present: true },
    { id: 'bare', name: 'bare', present: true },
    { id: 'quiet', name: 'Says nothing', present: true },
    { id: 'spaced', name: 'Spaced', present: true },
  ]);
  assert.equal(serverCalls.length, 1);
  const { url } = serverCalls[0];
  assert.deepEqual([url.origin, url.pathname, url.searchParams.get('X-Plex-Token'), url.searchParams.get('X-Plex-Client-Identifier')], ['http://p:32400', '/clients', 'tok-a', 'me']);
  assert.deepEqual(serverCalls[0].opts.headers, { Accept: 'application/json' }, 'no header but Accept: the request stays CORS-simple');
});

test('discoverServerPlayers: an answer with no client list is no players, and a server that fails is an error for the caller to drop (D199)', async () => {
  for (const body of [{ MediaContainer: { size: 0 } }, {}, { MediaContainer: { Server: 'x' } }]) {
    assert.deepEqual(await discoverServerPlayers('http://p:32400', 't', 'me', { fetchImpl: async () => jsonResponse(body) }), []);
  }
  assert.deepEqual(await discoverServerPlayers('http://p:32400', 't', 'me', { fetchImpl: async () => new Response('', { status: 200 }) }), [], 'an empty body');
  await assert.rejects(() => discoverServerPlayers('http://p:32400', 't', 'me', { fetchImpl: async () => new Response('', { status: 401 }) }), (e) => e.kind === 'auth');
  await assert.rejects(() => discoverServerPlayers('http://p:32400', 't', 'me', { fetchImpl: async () => new Response('', { status: 404 }) }), (e) => e.kind === 'http');
  await assert.rejects(() => discoverServerPlayers('http://p:32400', 't', 'me', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), (e) => e.kind === 'network');
});

test('readPlayers adds the players each Plex server lists itself: one plex.tv does not list is added, and one it calls offline is present (D199)', async () => {
  const { fetchImpl, calls, serverCalls } = plexTv([player({ name: 'Bedroom', clientIdentifier: 'bed', presence: false }), player({ name: 'Hall', clientIdentifier: 'hall', presence: false })], {
    servers: {
      'http://p:32400': clients(client(), client({ name: 'Bedroom as the server names it', machineIdentifier: 'bed' })),
      'http://q:32400': clients(client({ name: 'Den again', machineIdentifier: 'htpc-1' }), client({ name: 'Shop', machineIdentifier: 'shop' })),
    },
  });
  const out = await readPlayers(household({ servers: [PLEX_SERVER({ token: 'tok-a' }), PLEX_SERVER({ id: 'p3', token: 'tok-a' })] }), { clientId: 'me', fetchImpl });
  assert.deepEqual(out, {
    accounts: 1,
    players: [
      { id: 'bed', name: 'Bedroom', present: true },
      { id: 'hall', name: 'Hall', present: false },
      { id: 'htpc-1', name: 'Den HTPC', present: true },
      { id: 'shop', name: 'Shop', present: true },
    ],
  }, 'plex.tv\'s name is kept, the server makes a player present, and a player is listed once');
  assert.equal(calls.length, 1, 'one account, one plex.tv read');
  assert.deepEqual(serverCalls.map((c) => `${c.url.origin}${c.url.pathname} ${c.token}`).sort(), ['http://p:32400/clients tok-a', 'http://q:32400/clients tok-a'], 'each different server address is asked once, with its own sign-in');
});

test('readPlayers: a token goes only to plex.tv and to the server it signs in, and a Jellyfin or Emby server is not asked for players (D199)', async () => {
  const { fetchImpl, calls, serverCalls } = plexTv([player()]);
  const mixed = household({ servers: [PLEX_SERVER(), { id: 'jf1', type: 'jellyfin', url: 'http://jf:8096', token: 'jf-token' }] });
  await readPlayers(mixed, { clientId: 'me', fetchImpl });
  assert.deepEqual(serverCalls.map((c) => `${c.url.origin} ${c.token}`).sort(), ['http://p:32400 tok-a', 'http://q:32400 tok-b']);
  assert.deepEqual(calls.map((c) => c.token).sort(), ['tok-a', 'tok-b']);
  assert.equal([...calls, ...serverCalls].some((c) => c.url.href.includes('jf-token') || c.url.hostname === 'jf'), false);
});

test('readPlayers: a server that cannot be asked adds nothing and fails nothing, and a failed plex.tv read still fails whatever the servers said (D199)', async () => {
  const down = plexTv([player()], { servers: { 'http://p:32400': new Response('', { status: 500 }), 'http://q:32400': new Response('not json', { status: 200 }) } });
  assert.deepEqual(await readPlayers(household({ servers: [PLEX_SERVER({ token: 'tok-a' })] }), { clientId: 'me', fetchImpl: down.fetchImpl }), { accounts: 1, players: [{ id: 'tv-1', name: 'Living Room TV', present: true }] });
  const unreachable = async (url, opts) => {
    if (new URL(url).hostname !== 'plex.tv') throw new TypeError('Failed to fetch');
    return down.fetchImpl(url, opts);
  };
  assert.equal((await readPlayers(household(), { clientId: 'me', fetchImpl: unreachable })).players.length, 1);
  const refused = plexTv(new Response('', { status: 401 }), { servers: { 'http://p:32400': clients(client()) } });
  await assert.rejects(() => readPlayers(household(), { clientId: 'me', fetchImpl: refused.fetchImpl }), (e) => e.kind === 'auth');
});

test('readPlayers: a Jellyfin or Emby household has no players and sends no request; its tokens never go to plex.tv (D181 1, P12)', async () => {
  const { fetchImpl, calls, serverCalls } = plexTv([player()]);
  const jf = sanitize({ serverType: 'jellyfin', serverUrl: 'http://jf:8096', plexToken: 'jf-token', serverId: 'jf1', serverCarried: false, servers: [{ id: 'em1', type: 'emby', url: 'http://em:8096', token: 'em-token' }] });
  assert.deepEqual(await readPlayers(jf, { clientId: 'me', fetchImpl }), { accounts: 0, players: [] });
  assert.equal(calls.length, 0);
  assert.equal(serverCalls.length, 0, 'and no server is asked for players');
  const mixed = sanitize({ serverType: 'jellyfin', serverUrl: 'http://jf:8096', plexToken: 'jf-token', serverId: 'jf1', serverCarried: false, servers: [PLEX_SERVER()] });
  const out = await readPlayers(mixed, { clientId: 'me', fetchImpl });
  assert.deepEqual(calls.map((c) => c.token), ['tok-b'], 'only the Plex server\'s token is sent');
  assert.equal(out.accounts, 1);
  assert.deepEqual(await readPlayers(sanitize({}), { clientId: 'me', fetchImpl }), { accounts: 0, players: [] }, 'a display with no server');
  assert.equal(calls.length, 1);
  assert.deepEqual(await readPlayers(sanitize({ serverUrl: 'http://p:32400' }), { clientId: 'me', fetchImpl }), { accounts: 0, players: [] }, 'a Plex server with no token is not an account');
});

test('readPlayers fails when any account\'s read fails: a household is never shown a list that is missing an account (D186 2)', async () => {
  const { fetchImpl } = plexTv([player()], { byToken: { 'tok-b': new Response('', { status: 401 }) } });
  await assert.rejects(() => readPlayers(household({ servers: [PLEX_SERVER()] }), { clientId: 'me', fetchImpl }), (e) => e.kind === 'auth');
});

test('readPlayers says which accounts could not be read, by their place in the household and by what happened (D187 2, D188 2)', async () => {
  const { fetchImpl } = plexTv([player()], { byToken: { 'tok-b': new Response('', { status: 401 }), 'tok-c': new Response('', { status: 500 }), 'tok-d': new Response('{}', { status: 200 }) } });
  const three = household({ servers: [PLEX_SERVER(), PLEX_SERVER({ id: 'p3', token: 'tok-b' })] });
  await assert.rejects(() => readPlayers(three, { clientId: 'me', fetchImpl }), (e) => e.kind === 'auth' && JSON.stringify(e.failed) === JSON.stringify([{ kind: 'auth', slots: [1, 2] }]));
  const mixed = household({ servers: [PLEX_SERVER({ token: 'tok-c' }), PLEX_SERVER({ id: 'p3', token: 'tok-d' })] });
  await assert.rejects(() => readPlayers(mixed, { clientId: 'me', fetchImpl }), (e) => JSON.stringify(e.failed) === JSON.stringify([{ kind: 'server', slots: [1] }, { kind: 'parse', slots: [2] }]));
  // Only a server error (5xx) is told apart; any other status stays an answer that could not be read (S7, D189 3).
  const statuses = async (code) => readPlayers(household(), { clientId: 'me', fetchImpl: async () => new Response('', { status: code }) }).catch((e) => e.failed[0].kind);
  assert.deepEqual([await statuses(500), await statuses(503), await statuses(599)], ['server', 'server', 'server']);
  assert.deepEqual([await statuses(404), await statuses(400), await statuses(499), await statuses(429)], ['http', 'http', 'http', 'http']);
  assert.deepEqual([await statuses(401), await statuses(403)], ['auth', 'auth']);
  const down = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(() => readPlayers(household(), { clientId: 'me', fetchImpl: down }), (e) => JSON.stringify(e.failed) === JSON.stringify([{ kind: 'network', slots: [0] }]));
});

test('the mock plex.tv serves the players the e2e specs read, and the one it lists with this display\'s identifier is left out (D186 7)', async () => {
  const mock = await startMockPlex({ port: 0 });
  const base = `http://127.0.0.1:${mock.address().port}/__mock/`;
  try {
    const fetchImpl = (url) => fetch(`${base}plextv-resources?${new URLSearchParams({ token: new URL(url).searchParams.get('X-Plex-Token'), client: new URL(url).searchParams.get('X-Plex-Client-Identifier') })}`);
    const found = await discoverPlayers('mock-player-kids-room', 'any-token', { fetchImpl });
    assert.deepEqual(found.map((p) => [p.id, p.name, p.present]), [['mock-player-living-room', 'Living Room TV', true], ['mock-player-old-tablet', 'Old Tablet', false]]);
    assert.equal(PLEX_TV_RESOURCES.some((r) => r.provides === 'server'), true, 'the account also has a server, which is not a player');
    await fetch(`${base}plextv-set?token=bad&status=401`, { method: 'POST' });
    await assert.rejects(() => discoverPlayers('me', 'bad', { fetchImpl }), (e) => e.kind === 'auth');
    assert.equal((await discoverPlayers('me', 'good', { fetchImpl })).length, 3, 'a status set for one token reaches that token only');
    await fetch(`${base}plextv-set?token=tok`, { method: 'POST', body: JSON.stringify([player({ clientIdentifier: 'only' })]) });
    assert.deepEqual((await discoverPlayers('me', 'tok', { fetchImpl })).map((p) => p.id), ['only']);
    const log = (await (await fetch(`${base}plextv-log`)).json()).requests;
    assert.deepEqual(log.map((r) => r.token), ['any-token', 'bad', 'good', 'tok']);
    assert.equal(log[0].client, 'mock-player-kids-room');
    await fetch(`${base}plextv-reset`, { method: 'POST' });
    assert.equal((await discoverPlayers('me', 'tok', { fetchImpl })).length, 3, 'a reset forgets the lists');
    assert.equal((await (await fetch(`${base}plextv-log`)).json()).requests.length, 1, 'and the log');
  } finally {
    await new Promise((r) => mock.close(r));
  }
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
  assert.deepEqual(ask(calls[0]), { unwatched: '1', sort: 'rating:desc', 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': '100', includeGuids: '1' });
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

// ---- a poster's TMDB id (Run 13, tmdb-ids): includeGuids=1 and the Guid entries ----

const withGuids = (...ids) => ({ type: 'movie', ratingKey: '1', title: 'A', thumb: '/t', Guid: ids.map((id) => ({ id })) });

test('tmdb ids: the pool, sourceItems, item and items requests each carry includeGuids=1', async () => {
  const { calls, client } = poolCalls([{ ratingKey: '2', title: 'B', thumb: '/t/2', type: 'movie' }]);
  await client.pool({ libraryKey: '1', size: 10 });
  await client.sourceItems({ kind: 'collection', key: '101' });
  await client.sourceItems({ kind: 'playlist', key: '201' });
  await client.item('2');
  await client.items(['2', '3']);
  assert.equal(calls.length, 5);
  for (const url of calls) assert.equal(url.searchParams.get('includeGuids'), '1', url.pathname);
});

test('tmdb ids: a movie takes the one TMDB Guid among its others, as tmdbId with tmdbType movie', () => {
  const p = toPoster(withGuids('imdb://tt0111161', 'tmdb://278', 'tvdb://81189'), 'random');
  assert.equal(p.tmdbId, '278');
  assert.equal(p.tmdbType, 'movie');
  assert.equal(toPoster({ ...withGuids('tmdb://5'), type: 'show' }, 'random').tmdbType, 'tv');
});

test('tmdb ids: no Guid, no TMDB Guid, or an unusable Guid list gives neither field', () => {
  for (const m of [{ type: 'movie', ratingKey: '1', title: 'A', thumb: '/t' }, withGuids(), withGuids('imdb://tt1'), { ...withGuids(), Guid: 'tmdb://5' }, { ...withGuids(), Guid: [null, {}, { id: 5 }] }]) {
    const p = toPoster(m, 'random');
    assert.ok(!('tmdbId' in p) && !('tmdbType' in p), JSON.stringify(m.Guid));
  }
});

test('tmdb ids: two different TMDB Guids give no id; the same one listed twice is one id', () => {
  assert.ok(!('tmdbId' in toPoster(withGuids('tmdb://11', 'tmdb://12'), 'random')));
  assert.ok(!('tmdbType' in toPoster(withGuids('tmdb://11', 'tmdb://12'), 'random')));
  assert.equal(toPoster(withGuids('tmdb://11', 'tmdb://11'), 'random').tmdbId, '11');
});

test('tmdb ids: a TMDB Guid that is not plain digits gives no id, alone or beside a good one', () => {
  for (const bad of ['tmdb://12a', 'tmdb://', 'tmdb://-5', 'tmdb://+5', 'tmdb:// 5', 'tmdb://5/', 'tmdb://1.5']) {
    assert.ok(!('tmdbId' in toPoster(withGuids(bad), 'random')), bad);
    assert.ok(!('tmdbId' in toPoster(withGuids('tmdb://9', bad), 'random')), `9 + ${bad}`);
  }
});

test('tmdb ids: an episode never takes its own TMDB Guid and gets no tmdbType without an id', () => {
  const ep = toPoster({ type: 'episode', ratingKey: '500', grandparentRatingKey: '3', grandparentTitle: 'Show', title: 'Pilot', thumb: '/t', Guid: [{ id: 'tmdb://999' }] }, 'now-playing');
  assert.ok(!('tmdbId' in ep));
  assert.ok(!('tmdbType' in ep));
  assert.equal(ep.ratingKey, '3');
});

test('tmdb ids: an item of another kind (a season, a collection) takes none', () => {
  assert.ok(!('tmdbId' in toPoster({ ...withGuids('tmdb://5'), type: 'season' }, 'random')));
});

test('tmdb ids: every other poster field is unchanged by a TMDB Guid', () => {
  const plain = toPoster({ type: 'movie', ratingKey: '1', title: 'A', thumb: '/t', year: 1999, contentRating: 'PG' }, 'random');
  const { tmdbId, tmdbType, ...rest } = toPoster({ type: 'movie', ratingKey: '1', title: 'A', thumb: '/t', year: 1999, contentRating: 'PG', Guid: [{ id: 'tmdb://7' }] }, 'random');
  assert.equal(tmdbId, '7');
  assert.equal(tmdbType, 'movie');
  assert.deepEqual(rest, plain);
});

// ---- a poster's production house (Run 13, production-house-filter): the studio Plex stores ----

test('houses: a Plex item studio becomes the poster studios, and nothing when there is none', () => {
  const base = { type: 'movie', ratingKey: '1', title: 'A', thumb: '/t' };
  assert.deepEqual(toPoster({ ...base, studio: 'Pixar' }, 'random').studios, ['Pixar']);
  assert.deepEqual(toPoster({ ...base, studio: '  Pixar  ' }, 'random').studios, ['Pixar']);
  for (const studio of [undefined, '', '   ', 5, null, ['Pixar'], {}]) assert.equal('studios' in toPoster({ ...base, studio }, 'random'), false, JSON.stringify(studio));
});

test('houses: pool sends studio=<names joined by a comma> and asks for 3x as many, and no studio parameter when none is chosen', async () => {
  const { calls, client } = poolCalls();
  await client.pool({ libraryKey: '1', size: 40, houses: ['Pixar', 'A24'] });
  assert.equal(calls[0].searchParams.get('studio'), 'Pixar,A24');
  assert.equal(calls[0].searchParams.get('X-Plex-Container-Size'), '120');
  await client.pool({ libraryKey: '1', size: 40, houses: [] });
  assert.equal(calls[1].searchParams.has('studio'), false);
  assert.equal(calls[1].searchParams.get('X-Plex-Container-Size'), '40', 'no house list: the plain size, as before');
});

test('houses: houses(library) lists the studios a library holds, by name; genres() ignores a houses switch (D214 2)', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(new URL(url));
    return jsonResponse({ MediaContainer: { Directory: [{ key: 'Pixar', title: 'Pixar' }, { key: 'x', title: ' A24 ' }, { title: 'Pixar' }, { key: '9' }, { title: '' }] } });
  };
  const client = createPlexClient({ serverUrl: 'http://h:32400', token: 't', clientId: 'c', fetchImpl });
  assert.deepEqual(await client.houses('1'), [{ key: '', title: 'Pixar' }, { key: '', title: 'A24' }]);
  assert.equal(calls[0].pathname, '/library/sections/1/studio');
  await client.genres('1', { houses: true });
  assert.equal(calls[1].pathname, '/library/sections/1/genre', 'genres() has no houses switch');
});

test('D211 4: a Plex item with no type gets no tmdbId (P1)', () => {
  const noType = { ratingKey: '1', title: 'A', thumb: '/t', Guid: [{ id: 'tmdb://11' }] };
  const p = toPoster(noType, 'random');
  assert.ok(!('tmdbId' in p) && !('tmdbType' in p));
  assert.equal(toPoster({ ...noType, type: 'movie' }, 'random').tmdbId, '11', 'a movie still has its id');
  assert.equal(toPoster({ ...noType, type: 'show' }, 'random').tmdbType, 'tv');
});

test('houses: over several servers the house names reach each server, and the studio list is asked of the server a library is on', async () => {
  const server = await startMockPlex({ port: 0 });
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const seen = [];
    const fetchImpl = (u, init) => (seen.push(new URL(u)), fetch(u, init));
    const household = { ...defaults(), serverType: 'plex', serverUrl: url, plexToken: 'demo-token', serverId: 'mock', servers: [{ id: 'plex-b', type: 'plex', url, token: 'demo-token', userId: '', name: 'B' }] };
    const source = createSources(household, { clientId: 'c', version: '1', fetchImpl });
    const libs = await source.libraries();
    const second = libs.find((l) => l.server === 'B' && l.title === 'Movies');
    const posters = await source.pool({ libraryKey: second.key, size: 20, houses: ['Pixar'] });
    assert.ok(seen.some((u) => u.pathname === '/library/sections/1/all' && u.searchParams.get('studio') === 'Pixar'), 'the house name went to the server');
    assert.ok(posters.length > 0 && posters.every((p) => p.studios.includes('Pixar')), 'and the mock returned its Pixar titles');
    assert.deepEqual((await source.houses(second.key)).map((h) => h.title), ['A24', 'Mock Pictures', 'Pixar'], 'the option reaches the server of that library');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('D215 2: a studio name holding a comma is not sent in studio=; the request keeps its 3x size and the client check narrows (K4)', async () => {
  const { calls, client } = poolCalls();
  await client.pool({ libraryKey: '1', size: 40, houses: ['Lucasfilm Ltd., LLC'] });
  assert.equal(calls[0].searchParams.has('studio'), false, 'no studio parameter');
  assert.equal(calls[0].searchParams.get('X-Plex-Container-Size'), '120', 'still asks for 3x as many titles');
  await client.pool({ libraryKey: '1', size: 40, houses: ['Pixar', 'Lucasfilm Ltd., LLC'] });
  assert.equal(calls[1].searchParams.has('studio'), false, 'one such name in the list leaves the parameter off for the whole request');
  await client.pool({ libraryKey: '1', size: 40, houses: ['Pixar', 'A24'] });
  assert.equal(calls[2].searchParams.get('studio'), 'Pixar,A24', 'names without a comma are sent as before');
});

// ---- background art for the Backdrop art gap fill (R-FILL-3, D232) ----

test('toPoster carries `backdrop` only when Plex names art: a movie its `art`, never an empty or non-text value', () => {
  assert.equal(toPoster({ type: 'movie', ratingKey: '1', title: 'A', thumb: '/t', art: '/library/metadata/1/art/9' }, 'random').backdrop, '/library/metadata/1/art/9');
  for (const art of [undefined, null, '', '   ', 7, {}, ['/a']]) {
    assert.equal('backdrop' in toPoster({ type: 'movie', ratingKey: '1', title: 'A', thumb: '/t', art }, 'random'), false, `art ${JSON.stringify(art)}: the field is absent`);
  }
});

test('an episode takes its series\' art (`grandparentArt`) and never its own `art`', () => {
  const episode = { type: 'episode', ratingKey: '501', grandparentRatingKey: '5', title: 'Pilot', grandparentTitle: 'Show', thumb: '/t/e', grandparentThumb: '/t/s', art: '/library/metadata/501/art/2' };
  assert.equal('backdrop' in toPoster(episode, 'now-playing'), false, 'an episode with no series art has none (its own is not used)');
  assert.equal(toPoster({ ...episode, grandparentArt: '/library/metadata/5/art/1' }, 'now-playing').backdrop, '/library/metadata/5/art/1');
  assert.equal(toPoster({ ...episode, grandparentArt: '' }, 'now-playing').backdrop, undefined);
  const np = pickNowPlaying([{ ...episode, grandparentArt: '/library/metadata/5/art/1', Player: { state: 'playing' } }]);
  assert.equal(np.backdrop, '/library/metadata/5/art/1', 'a now-playing poster carries it (D232 8)');
  const movie = pickNowPlaying([{ type: 'movie', ratingKey: '1', title: 'A', thumb: '/t', art: '/library/metadata/1/art/9', Player: { state: 'playing' } }]);
  assert.equal(movie.backdrop, '/library/metadata/1/art/9');
});

test('pool and item carry `backdrop` for a title with art and leave it off for one without', async () => {
  assert.equal((await poolCalls([{ ratingKey: '3', title: 'C', thumb: '/t/3', art: '/a/3' }]).client.item('3')).backdrop, '/a/3');
  assert.equal('backdrop' in (await poolCalls([{ ratingKey: '4', title: 'D', thumb: '/t/4' }]).client.item('4')), false);
});

test('a backdrop is asked through imageUrl at the size given, with the token like a poster', () => {
  const client = createPlexClient({ serverUrl: 'http://h:32400', token: 'tok', clientId: 'c' });
  const url = new URL(client.imageUrl('/library/metadata/7/art/123', { width: 256, height: 144, backdrop: true }));
  assert.equal(url.pathname, '/photo/:/transcode');
  assert.equal(url.searchParams.get('url'), '/library/metadata/7/art/123');
  assert.equal(url.searchParams.get('width'), '256');
  assert.equal(url.searchParams.get('X-Plex-Token'), 'tok');
});
