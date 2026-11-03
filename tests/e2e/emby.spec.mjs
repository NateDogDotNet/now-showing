// The Emby source (R-SRC-3, D134, D145) in the browser, against the mock server in its Emby mode (scripts/mock-jellyfin.mjs, which
// serve.mjs --mock starts beside the mock Plex server; an Emby request is told by its X-Emby-Authorization header). It also carries the
// three Minors D144 moved here (a token never goes to another server on import, the sheet is never left on "Connecting…", the switch
// toast when nothing can show yet), for each server type.
//
// Mock users: `demo` / `demo-pass`, Emby token `emby-demo-token`, Jellyfin token `jf-demo-token`, Plex mock token `demo-token`. The titles
// and ratings are the Jellyfin spec's: Movies (b..1: 8 titles), Kids Movies (b..2: 5 titles).
//
// Every case has its own mock servers (serveArgs: []) and names pixelShift: false (convention 7). Nothing waits for a wall-clock time:
// every wait is on a state (a poster drawn, a dialog closed, a request seen) with a bound.

import assert from 'node:assert/strict';
import { withApp, shot } from './lib.mjs';

const cases = [];
const emCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], ...opts }, fn });
const check = (name) => console.log(`  ok  ${name}`);

const EMBY_TOKEN = 'emby-demo-token';
const JF_TOKEN = 'jf-demo-token';
const hex = (prefix, n) => prefix + String(n).padStart(31, '0');
const MOVIES = hex('b', 1);
const KIDS_LIB = hex('b', 2);
const T = {
  G: ['The Grand Marquee', 'Tiny Lanterns', 'The Paper Kite', 'Moonlit Meadow'],
  PG: ['Midnight Projector', 'Pocket Dragons', 'Captain Pudding'],
};
const name = (alt) => (alt || '').replace(/^Poster: /, '');

const em = (app) => `http://127.0.0.1:${app.jellyfinPort}`; // the mock's one web port serves both types
const seed = (extra = {}) => (app) => ({
  serverType: 'emby',
  plexToken: EMBY_TOKEN,
  serverUserId: hex('8', 1), // the id the mock's sign-in returns (Emby lists libraries at /Users/{UserId}/Views)
  serverUrl: em(app),
  libraryKey: MOVIES,
  libraryKeys: [MOVIES],
  libraryNames: ['Movies'],
  rotateSeconds: 3600,
  showNowPlaying: false,
  unwatchedOnly: false,
  pixelShift: false,
  ...extra,
});
const mockPost = (app, path) => fetch(`${em(app)}${path}`, { method: 'POST' }).then((r) => r.json());

const activeAlt = (page) => page.evaluate(() => document.querySelector('.poster-layer.active')?.alt || '');
const posterShown = (page) => page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 20000 });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));
const index = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]'));
const history = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.shownAt') || '{}'));
const allStorage = (page) => page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));

/** Records every poster that becomes the active layer, by title, into window.__draws (one entry per draw, repeats included). */
const recordDraws = (page) =>
  page.addInitScript(() => {
    window.__draws = [];
    const was = new WeakMap();
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target;
        if (!el.classList?.contains('poster-layer')) continue;
        const on = el.classList.contains('active');
        if (on && !was.get(el)) window.__draws.push((el.alt || '').replace(/^Poster: /, ''));
        was.set(el, on);
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });

/** Asks for the next poster `n` times and returns the title drawn each time (a click during a busy tick is ignored: it asks again). */
async function picks(page, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const had = await page.evaluate(() => window.__draws.length);
    let drawn = false;
    for (let attempt = 0; attempt < 12 && !drawn; attempt++) {
      await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
      drawn = await page.waitForFunction((n0) => window.__draws.length > n0, had, { timeout: 2500 }).then(() => true, () => false);
    }
    assert.ok(drawn, `no poster was drawn for pick ${i + 1}`);
    out.push(await page.evaluate((n0) => window.__draws[n0], had));
  }
  return out;
}

const openSettings = async (page) => {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForSelector('#settings[open]');
};
const save = async (page) => {
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
};
const testOk = (page) => page.waitForFunction(() => document.getElementById('test-result').textContent.startsWith('✓'), null, { timeout: 20000 });
const libraryTitles = (page) => page.$$eval('#library-list li label span', (els) => els.map((e) => e.textContent.replace(/\s*[·(].*$/, '').trim()));
const patchSettings = (page, extra) => page.evaluate((x) => localStorage.setItem('plexPoster.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('plexPoster.settings')), ...x })), extra);

async function waitUntil(what, fn, ms = 20000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < ms) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`${what} did not happen within ${ms} ms`);
}

/** Every request the page makes to the mock's web port, with the headers that show how it signed in. */
const watchEmby = (page, app) => {
  const seen = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.port !== String(app.jellyfinPort)) return;
    const h = r.headers();
    seen.push({ path: u.pathname, search: u.search, emby: h['x-emby-authorization'] || '', token: h['x-emby-token'] || '', authorization: h.authorization || '', method: r.method() });
  });
  return seen;
};

async function signInInSheet(page, app, password = 'demo-pass') {
  await page.fill('#jf-address', em(app));
  await page.fill('#jf-user', 'demo');
  await page.fill('#jf-pass', password);
  await page.click('#jf-login');
}

// ---------- the choice and the sign-in ----------

emCase('1 Settings offers Emby beside Plex and Jellyfin; with Emby chosen there is no Quick Connect, only the user name and password', { settings: { pixelShift: false }, viewport: { width: 1920, height: 1080 } }, async ({ page, app }) => {
  const seen = watchEmby(page, app);
  await page.goto(app.url);
  await page.waitForSelector('#firstrun:not([hidden])');
  assert.deepEqual(await page.$$eval('input[name="firstrunType"]', (els) => els.map((e) => e.value)), ['plex', 'jellyfin', 'emby'], 'the card offers the three');
  await openSettings(page);
  assert.deepEqual(await page.$$eval('input[name="serverTypePick"]', (els) => els.map((e) => e.value)), ['plex', 'jellyfin', 'emby'], 'Settings offers the three');
  assert.deepEqual(await page.$$eval('.server-type .seg-opt span', (els) => els.map((e) => e.textContent.trim())), ['Plex', 'Jellyfin', 'Emby']);
  await page.check('input[name="serverTypePick"][value="emby"]');
  assert.equal(await page.$eval('input[name="serverType"]', (el) => el.value), 'emby');
  assert.match(await page.textContent('#settings legend[data-srv="legend"]'), /Emby connection/);
  assert.equal(await page.isVisible('#jf-address'), true);
  assert.equal(await page.isVisible('#signin-btn'), false, 'no Quick Connect button');
  assert.equal(await page.$eval('#jf-password', (el) => el.open), true, 'the user name and password form is open');
  assert.equal(await page.isVisible('#jf-user'), true);
  assert.equal((await stored(page)).serverType ?? 'plex', 'plex', 'choosing stores nothing');

  await signInInSheet(page, app, 'wrong');
  await page.waitForFunction(() => /not accepted/.test(document.getElementById('jf-status').textContent));
  assert.equal(await page.inputValue('#jf-pass'), '', 'the password field is emptied after an attempt');
  assert.equal(await page.inputValue('input[name="plexToken"]'), '', 'a failed sign-in stores nothing new');
  await page.fill('#jf-pass', 'demo-pass');
  await page.click('#jf-login');
  await testOk(page);
  assert.deepEqual((await libraryTitles(page)).sort(), ['Kids Movies', 'Movies'], 'the movie libraries; Music is not offered');
  assert.equal(await page.inputValue('input[name="plexToken"]'), EMBY_TOKEN);
  assert.equal(await page.inputValue('#jf-pass'), '');
  assert.equal(await page.isVisible('#signin-panel'), false, 'no code panel');
  assert.ok(!seen.some((r) => r.path.startsWith('/QuickConnect')), 'no Quick Connect request');
  const signIns = seen.filter((r) => r.path === '/Users/AuthenticateByName');
  assert.equal(signIns.length, 2);
  for (const r of signIns) {
    assert.match(r.emby, /^Emby UserId="", Client="Now Showing", Device="Now Showing", DeviceId="[^"]+", Version="[^"]*"$/);
    assert.equal(r.token, '', 'no token before sign-in');
    assert.equal(r.authorization, '');
  }
  const viewsPath = `/Users/${hex('8', 1)}/Views`;
  assert.ok(seen.some((r) => r.path === viewsPath), 'the libraries are asked for at /Users/{UserId}/Views, with the id the sign-in returned');
  assert.ok(!seen.some((r) => r.path === '/UserViews'), 'Emby has no /UserViews (C1)');
  const later = seen.filter((r) => r.path === viewsPath || r.path === '/Items');
  assert.ok(later.length > 0 && later.every((r) => r.token === EMBY_TOKEN && r.emby.startsWith('Emby ') && r.authorization === ''), 'every later request carries X-Emby-Token and X-Emby-Authorization');
  await save(page);
  await posterShown(page);
  const s = await stored(page);
  assert.deepEqual([s.serverType, s.plexToken, s.serverUrl, s.serverUserId], ['emby', EMBY_TOKEN, em(app), hex('8', 1)], 'the user id the sign-in returned is stored with the token (not a secret)');
  const everything = await allStorage(page);
  assert.ok(!everything.includes('demo-pass') && !everything.includes('wrong'), 'no password in storage');
  const images = seen.filter((r) => /\/Images\/Primary$/.test(r.path));
  assert.ok(images.length > 0 && images.every((r) => r.search.includes(`api_key=${EMBY_TOKEN}`)), 'the poster image carries the token as api_key');
  await shot(page, 'emby-settings-1920x1080');
  check('Emby is offered beside Plex and Jellyfin; the password form signs in after a wrong try, lists both movie libraries, shows no Quick Connect, and no password is stored');
});

emCase('2 first run with Emby chosen: no code, no Quick Connect, the user name and password form on the card; it hands the token to Settings', { settings: { pixelShift: false }, viewport: { width: 1920, height: 1080 } }, async ({ page, app }) => {
  const seen = watchEmby(page, app);
  await page.goto(app.url);
  await page.waitForSelector('#firstrun:not([hidden])');
  await page.check('input[name="firstrunType"][value="emby"]');
  assert.equal(await page.isVisible('#firstrun-address'), true, 'Emby needs the address first');
  assert.match(await page.textContent('#empty-message'), /Emby server/, 'the words follow the choice');
  assert.equal(await page.isVisible('#signin-code-large'), false, 'no code is shown');
  assert.equal(await page.isVisible('#firstrun-lead'), false);
  assert.equal(await page.getAttribute('#firstrun-address input[type="submit"]', 'value'), 'Continue');
  assert.match(await page.textContent('#firstrun-address label'), /Emby server address/);
  assert.equal((await stored(page)).serverType ?? 'plex', 'plex', 'choosing on the card stores nothing');
  await page.fill('#firstrun-url', `${em(app)}/`);
  await page.click('#firstrun-address input[type="submit"]');
  await page.waitForSelector('#firstrun-login:not([hidden])', { timeout: 20000 });
  assert.match(await page.textContent('#firstrun-status'), /Emby signs in with a user name and password/);
  assert.doesNotMatch(await page.textContent('#firstrun'), /Quick Connect|plex\.tv/i);
  await page.fill('#firstrun-user', 'demo');
  await page.fill('#firstrun-pass', 'wrong');
  await page.click('#firstrun-login input[type="submit"]');
  await page.waitForFunction(() => /not accepted/.test(document.getElementById('firstrun-status').textContent));
  assert.equal(await page.inputValue('#firstrun-pass'), '');
  await page.fill('#firstrun-pass', 'demo-pass');
  await page.click('#firstrun-login input[type="submit"]');
  await page.waitForSelector('#settings[open]', { timeout: 30000 });
  await testOk(page);
  assert.equal(await page.$eval('input[name="serverType"]', (el) => el.value), 'emby');
  assert.equal(await page.inputValue('#jf-address'), em(app), 'the trailing slash is dropped');
  await save(page);
  await posterShown(page);
  const s = await stored(page);
  assert.deepEqual([s.serverType, s.plexToken, s.serverUserId], ['emby', EMBY_TOKEN, hex('8', 1)], 'the card hands the user id to Settings with the token');
  assert.ok(!(await allStorage(page)).includes('demo-pass'));
  assert.ok(!seen.some((r) => r.path.startsWith('/QuickConnect')), 'no Quick Connect request');
  check('the card for Emby shows no code, takes a user name and password, and hands the token to Settings, which lists the libraries and saves');
});

emCase('2b the card, back to Plex and Jellyfin: the code and the lead come back', { settings: { pixelShift: false } }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForSelector('#firstrun:not([hidden])');
  await page.check('input[name="firstrunType"][value="emby"]');
  await page.check('input[name="firstrunType"][value="jellyfin"]');
  const hidden = (sel) => page.$eval(sel, (el) => el.hidden);
  assert.equal(await hidden('#signin-code-large'), false);
  assert.equal(await hidden('#firstrun-lead'), false);
  assert.equal(await page.getAttribute('#firstrun-address input[type="submit"]', 'value'), 'Get a code');
  assert.match(await page.textContent('#firstrun-address label'), /Jellyfin server address/);
  await page.check('input[name="firstrunType"][value="plex"]');
  assert.equal(await hidden('#signin-code-large'), false);
  assert.equal(await hidden('#firstrun-lead'), false);
  assert.match(await page.textContent('#firstrun-lead'), /plex\.tv\/link/);
  check('choosing Emby and then Jellyfin or Plex restores the code and the words');
});

emCase('3 a revoked Emby token offers Sign in again, and the sheet opens the user name and password form', { settings: seed({ plexToken: 'revoked' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForSelector('#empty:not([hidden])');
  await page.waitForFunction(() => /Emby rejected the token/.test(document.getElementById('empty-message').textContent), null, { timeout: 20000 });
  await page.locator('#empty-actions button', { hasText: 'Sign in again' }).click();
  await page.waitForSelector('#settings[open]');
  await page.waitForFunction(() => /Emby signs in with a user name and password/.test(document.getElementById('jf-status').textContent), null, { timeout: 20000 });
  assert.equal(await page.$eval('#jf-password', (el) => el.open), true);
  await page.fill('#jf-user', 'demo');
  await page.fill('#jf-pass', 'demo-pass');
  await page.click('#jf-login');
  await page.waitForFunction((t) => document.querySelector('input[name="plexToken"]').value === t, EMBY_TOKEN, { timeout: 20000 });
  await testOk(page);
  await save(page);
  await posterShown(page);
  check('"Sign in again" opens the password form for Emby; signing in replaces the token');
});

// ---------- the limit and the selection ----------

emCase('4 thirty picks under a PG limit show only G and PG titles', { settings: seed({ maxContentRating: 'PG', libraryKeys: [MOVIES, KIDS_LIB], libraryNames: ['Movies', 'Kids Movies'] }) }, async ({ page, app }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  const shown = new Set(await picks(page, 30));
  const allowed = [...T.G, ...T.PG];
  for (const t of shown) assert.ok(allowed.includes(t), `${t} is above PG, or unrated`);
  for (const t of ['Velvet Curtain', 'Popcorn Skies', 'Neon Matinee', 'Last Reel', 'Silver Screen Serenade', 'Encore']) assert.ok(!shown.has(t), `${t} was shown`);
  assert.ok(shown.size >= 3, `only ${[...shown]} came up`);
  check(`30 picks under PG on Emby: ${[...shown].sort().join(', ')}; never the 15, TV-MA, R, PG-13 or unrated titles`);
});

emCase('5 a genre, a BoxSet and a playlist each narrow the pool', { settings: seed({ libraryKeys: [MOVIES, KIDS_LIB], libraryNames: ['Movies', 'Kids Movies'] }) }, async ({ page, app }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  const seen = async (extra, n) => {
    await patchSettings(page, extra);
    await page.reload();
    await posterShown(page);
    return new Set(await picks(page, n));
  };
  const animation = await seen({ genres: [{ key: hex('c', 6), title: 'Animation' }] }, 20);
  for (const t of animation) assert.ok(['Tiny Lanterns', 'The Paper Kite', 'Captain Pudding'].includes(t), `${t} is not Animation`);
  check(`genre Animation narrows the pool: ${[...animation].sort().join(', ')}`);
  const box = await seen({ genres: [], source: { kind: 'collection', key: hex('d', 1), title: 'Midnight Double Feature' } }, 16);
  for (const t of box) assert.ok(['Midnight Projector', 'Neon Matinee'].includes(t), `${t} is not in the BoxSet`);
  assert.equal(box.size, 2, `both BoxSet titles come up: ${[...box]}`);
  check(`the BoxSet replaces the libraries: ${[...box].sort().join(', ')}`);
  const list = await seen({ source: { kind: 'playlist', key: hex('e', 1), title: 'Weekend Picks' } }, 20);
  for (const t of list) assert.ok(['The Grand Marquee', 'Tiny Lanterns', 'Last Reel'].includes(t), `${t} is not in the playlist`);
  assert.ok(list.size >= 2);
  check(`the playlist replaces the libraries: ${[...list].sort().join(', ')}`);
});

emCase('6 Settings lists the genres, the BoxSet and the playlist of the Emby server', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  await page.waitForFunction(() => document.querySelectorAll('#genre-list li').length >= 5, null, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('#source-select option').length >= 3, null, { timeout: 20000 });
  const sources = await page.$$eval('#source-select option', (els) => els.map((e) => e.textContent.trim()));
  assert.ok(sources.filter((t) => t === 'Midnight Double Feature').length === 1 && sources.some((t) => t.includes('Weekend Picks')), sources.join(','));
  assert.match(await page.textContent('#connected-text'), /Mock Emby/);
  check(`the genres and the sources (${sources.join(' | ')}) come from the Emby server`);
});

// ---------- now playing ----------

const npSeed = (extra = {}) => seed({ showNowPlaying: true, nowPlayingPollSeconds: 5, ...extra });
const sessionsRequests = (page) => {
  const seen = { n: 0 };
  page.on('request', (r) => new URL(r.url()).pathname === '/Sessions' && seen.n++);
  return seen;
};

emCase('7 now playing a movie, and an episode that shows its series poster', { settings: npSeed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await mockPost(app, `/__mock/jellyfin-sessions?kind=movie&id=${hex('a', 3)}&user=demo`);
  await page.waitForFunction(() => document.querySelector('.poster-layer.active')?.alt === 'Poster: Velvet Curtain', null, { timeout: 30000 });
  check('a movie playing on the Emby server is the poster on screen');
  await mockPost(app, '/__mock/jellyfin-sessions?kind=episode');
  await page.waitForFunction(() => document.querySelector('.poster-layer.active')?.alt === 'Poster: Harbor Lights', null, { timeout: 30000 });
  check('an episode playing shows its series poster (Harbor Lights)');
  await mockPost(app, '/__mock/jellyfin-sessions?kind=none');
});

emCase('8 now playing under a limit: a "15" movie and an unrated series count as nothing playing', { settings: npSeed({ maxContentRating: 'PG', limitNowPlaying: true }) }, async ({ page, app }) => {
  const polls = sessionsRequests(page);
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  for (const session of [`kind=movie&id=${hex('a', 6)}`, 'kind=episode']) {
    await mockPost(app, `/__mock/jellyfin-sessions?${session}`);
    const before = polls.n;
    await waitUntil('two more polls', () => polls.n >= before + 2, 30000);
    const draws = await page.evaluate(() => window.__draws);
    assert.ok(!draws.includes('Last Reel') && !draws.includes('Harbor Lights'), `drawn: ${draws}`);
  }
  check('under PG, the 15-rated movie and the unrated series are never put on screen');
});

for (const mode of ['401', '403', '404', 'garbage']) {
  emCase(`9 a /Sessions reply of ${mode} is no now-playing: no error card, no toast, the poster stays`, { settings: npSeed() }, async ({ page, app }) => {
    await mockPost(app, `/__mock/emby-sessions-reply?mode=${mode}`);
    await mockPost(app, '/__mock/jellyfin-sessions?kind=movie');
    const polls = sessionsRequests(page);
    await recordDraws(page);
    await page.goto(app.url);
    await posterShown(page);
    const shownBefore = await activeAlt(page);
    await waitUntil('three polls', () => polls.n >= 3, 40000);
    assert.equal(await page.isVisible('#empty'), false, 'no empty card');
    assert.equal(await page.isVisible('#toast'), false, 'no toast');
    assert.doesNotMatch((await page.textContent('#status')) || '', /Can't reach|Offline|rejected/);
    assert.ok(!(await page.evaluate(() => window.__draws)).includes('The Grand Marquee') || shownBefore === 'Poster: The Grand Marquee', 'the playing movie was not shown');
    await mockPost(app, '/__mock/emby-sessions-reply?mode=ok');
    await page.waitForFunction(() => document.querySelector('.poster-layer.active')?.alt === 'Poster: The Grand Marquee', null, { timeout: 30000 });
    check(`/Sessions ${mode}: nothing playing and no error; the session shows once the server answers`);
  });
}

// ---------- switching ----------

const SEED_ENTRY = { ratingKey: 'seed-1', title: 'Seeded', year: '2001', thumb: '/t/1', contentRating: 'G', width: 600, height: 900, savedAt: Date.now() };
const HISTORY_LS = { 'plexPoster.posterIndex': JSON.stringify([SEED_ENTRY]), 'plexPoster.shownAt': JSON.stringify({ 'seed-1': Date.now() }) };
const plexSeed = (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  libraryKeys: ['1'],
  libraryNames: ['Movies'],
  rotateSeconds: 3600,
  showNowPlaying: false,
  noRepeatDays: 3,
  staticRatingKey: '3',
  staticTitle: 'Velvet Curtain',
  pixelShift: false,
});
const jellyfinSeed = (app) => ({ ...plexSeed(app), serverType: 'jellyfin', plexToken: JF_TOKEN, serverUrl: em(app), libraryKey: MOVIES, libraryKeys: [MOVIES], staticRatingKey: hex('a', 3) });

for (const [from, settings] of [['Plex', plexSeed], ['Jellyfin', jellyfinSeed]]) {
  emCase(`10 switching ${from} to Emby: choosing and signing in clear nothing, Save clears the cache, the pin and the history`, { settings, localStorage: HISTORY_LS }, async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    await openSettings(page);
    await page.check('input[name="serverTypePick"][value="emby"]');
    assert.equal(await page.inputValue('input[name="plexToken"]'), '', `a ${from} token is never left in an Emby form`);
    await signInInSheet(page, app);
    await testOk(page);
    assert.ok((await index(page)).some((e) => e.ratingKey === 'seed-1'), 'signing in cleared nothing');
    await page.click('#settings-cancel');
    await page.waitForFunction(() => !document.getElementById('settings').open);
    assert.equal((await stored(page)).serverType ?? 'plex', from.toLowerCase());
    assert.ok((await index(page)).some((e) => e.ratingKey === 'seed-1') && 'seed-1' in (await history(page)) && (await stored(page)).staticRatingKey, 'Cancel leaves the cache, the history and the pin');

    await openSettings(page);
    await page.check('input[name="serverTypePick"][value="emby"]');
    await signInInSheet(page, app);
    await testOk(page);
    await save(page);
    await page.waitForFunction(() => /Now showing posters from Emby/.test(document.getElementById('toast').textContent));
    assert.equal((await page.textContent('#toast')).trim(), 'Now showing posters from Emby. The offline posters, the pinned poster and the no-repeat history were cleared.');
    await waitUntil('the cache to be cleared of the old entry', async () => !(await index(page)).some((e) => e.ratingKey === 'seed-1'));
    const s = await stored(page);
    assert.equal(s.serverType, 'emby');
    assert.equal(s.staticRatingKey, '', 'the pin is cleared');
    assert.ok(!('seed-1' in (await history(page))), 'the history is cleared');
    await waitUntil('an Emby poster in the cache', async () => (await index(page)).some((e) => /^[0-9a-f]{32}$/.test(e.ratingKey)));
    await posterShown(page);
    assert.ok(!(await allStorage(page)).includes('demo-pass'));
    check(`Save of ${from} -> Emby clears the cache, the pin and the history, and says so`);
  });
}

emCase('11 a Save that switches to Emby and leaves no token says the type changed and asks to sign in (D144 3)', { settings: jellyfinSeed, localStorage: HISTORY_LS }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.check('input[name="serverTypePick"][value="emby"]');
  assert.equal(await page.inputValue('input[name="plexToken"]'), '');
  await page.fill('#jf-address', em(app));
  await save(page);
  await page.waitForFunction(() => /server type is now Emby/.test(document.getElementById('toast').textContent));
  const toast = (await page.textContent('#toast')).trim();
  assert.match(toast, /^The server type is now Emby\. Sign in to Emby to show its posters\./);
  assert.doesNotMatch(toast, /Now showing posters from/);
  assert.equal((await stored(page)).plexToken, '');
  await waitUntil('the cache to be cleared', async () => !(await index(page)).some((e) => e.ratingKey === 'seed-1'));
  check(`no token after the switch: "${toast}"`);
});

// ---------- an import never sends this display's token to another server (D144 1), for each type ----------

const importFile = (page, body) => page.setInputFiles('#import-file', { name: 'friend.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(body)) });
/** Every request that carries `secret` in a header or its address, by the port it went to. */
const watchSecret = (page, secret) => {
  const hits = [];
  page.on('request', (r) => {
    const h = r.headers();
    const carries = r.url().includes(secret) || Object.values(h).some((v) => String(v).includes(secret));
    if (carries) hits.push(`${new URL(r.url()).port}${new URL(r.url()).pathname}`);
  });
  return hits;
};

for (const [type, seedFn, secret, friendPort] of [
  ['plex', (app) => ({ ...plexSeed(app), staticRatingKey: '' }), 'demo-token', (app) => app.jellyfinPort],
  ['jellyfin', (app) => seed({ serverType: 'jellyfin', plexToken: JF_TOKEN })(app), JF_TOKEN, (app) => app.mockPort],
  ['emby', seed(), EMBY_TOKEN, (app) => app.mockPort],
]) {
  emCase(`12 ${type}: a file naming another server address of the same type brings no token; this display's token is set aside and the sheet asks to sign in`, { settings: seedFn }, async ({ page, context, app }) => {
    // A Plex display left without a token asks plex.tv for a code: answered here, never reaching the real service (K48).
    await context.route('https://plex.tv/**', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: route.request().url().includes('/resources') ? '[]' : JSON.stringify({ id: 1, code: 'STUB', expiresIn: 900, authToken: null }) }));
    const hits = watchSecret(page, secret);
    await page.goto(app.url);
    await posterShown(page);
    await openSettings(page);
    await testOk(page);
    const friend = `http://127.0.0.1:${friendPort(app)}`;
    const before = hits.length;
    await importFile(page, { serverType: type, serverUrl: friend, libraryKey: type === 'plex' ? '1' : MOVIES });
    await page.waitForFunction((u) => document.querySelector('input[name="serverUrl"]').value === u, friend);
    assert.equal(await page.inputValue('input[name="plexToken"]'), '', 'the token stays behind');
    assert.equal(await page.isVisible('#signin-controls'), true, 'the sheet asks to sign in');
    assert.equal(await page.isVisible('#connected-card'), false);
    // D147 3: the connection line says the connection is not tested; it never keeps the old server's "✓ ... libraries".
    const line = (await page.textContent('#test-result')).trim();
    assert.match(line, /^Connection not tested yet\./, `the connection line after the import: ${line}`);
    assert.doesNotMatch(line, /✓|libraries/);
    assert.equal(await page.$eval('input[name="serverUserId"]', (el) => el.value), '', "the old server's user id is set aside with its token");
    await save(page);
    await page.waitForSelector('#empty:not([hidden])');
    const s = await stored(page);
    assert.deepEqual([s.serverType, s.plexToken, s.serverUrl, s.serverUserId ?? ''], [type, '', friend, '']);
    const sent = hits.slice(before).filter((h) => h.startsWith(String(friendPort(app))));
    assert.deepEqual(sent, [], `the token reached the other address: ${sent}`);
    check(`${type}: the import's address got no token, none is stored, and the sheet asks to sign in`);
  });
}

emCase('12b an import that brings its own token for another address keeps that token, and one for the same address changes nothing', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  await importFile(page, { serverType: 'emby', serverUrl: em(app), rotation: 90 });
  assert.equal(await page.inputValue('input[name="plexToken"]'), EMBY_TOKEN, 'the same address keeps this display\'s token');
  await importFile(page, { serverType: 'emby', serverUrl: 'http://127.0.0.1:1', plexToken: 'their-token' });
  await page.waitForFunction(() => document.querySelector('input[name="serverUrl"]').value === 'http://127.0.0.1:1');
  assert.equal(await page.inputValue('input[name="plexToken"]'), 'their-token', 'the file\'s own token is used');
  check('same address: the token stays; another address with its own token: that token is used');
});

// ---------- an import during the opening connection test (D144 2) ----------

emCase('13 an import made while the opening connection test runs leaves the connection section in a final state, never "Connecting…"', { settings: seed() }, async ({ page, context, app }) => {
  let release;
  const gate = new Promise((r) => (release = r));
  let held = 0;
  await context.route(`${em(app)}/System/Info/Public`, async (route) => {
    held++;
    await gate;
    await route.continue();
  });
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page); // the saved connection is tested at once: its first request is held
  await waitUntil('the test to be in flight', () => held >= 1);
  assert.equal((await page.textContent('#test-result')).trim(), 'Connecting…');
  await importFile(page, { serverType: 'emby', serverUrl: em(app), rotation: 90 });
  await waitUntil('the import to settle the line', async () => (await page.textContent('#test-result')).trim() !== 'Connecting…', 10000);
  release();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  const line = (await page.textContent('#test-result')).trim();
  assert.notEqual(line, 'Connecting…');
  assert.match(line, /Press Test connection/, 'a prompt, not a spinner');
  assert.equal(await page.$eval('#test-btn', (el) => el.disabled), false);
  await page.click('#test-btn');
  await testOk(page);
  check(`the line reads "${line}" after the import, and the Test button works`);
});

// ---------- a server that does not answer (D143 1, D145 8) ----------

const DEAD = 'http://127.0.0.1:1'; // nothing listens there: the connection is refused at once, as a server that refuses a cross-origin request looks to the page

emCase('16 an Emby address that does not answer: the card names it and offers the address field to change; Settings names it too', { settings: { pixelShift: false }, viewport: { width: 1920, height: 1080 } }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForSelector('#firstrun:not([hidden])');
  await page.check('input[name="firstrunType"][value="emby"]');
  await page.fill('#firstrun-url', DEAD);
  await page.click('#firstrun-address input[type="submit"]');
  await page.waitForSelector('#firstrun-login:not([hidden])', { timeout: 20000 });
  await page.fill('#firstrun-user', 'demo');
  await page.fill('#firstrun-pass', 'demo-pass');
  await page.click('#firstrun-login input[type="submit"]');
  await page.waitForFunction((u) => document.getElementById('firstrun-status').textContent.includes(`Couldn't reach Emby at ${u}. Check the address and try again.`), DEAD, { timeout: 20000 });
  assert.equal(await page.isVisible('#firstrun-address'), true, 'the address field is on the card');
  assert.equal(await page.inputValue('#firstrun-url'), DEAD);
  assert.equal(await page.$eval('#firstrun-url', (el) => el === document.activeElement), true, 'and has the focus');
  assert.equal(await page.isVisible('#firstrun-login'), false, 'the password form waits for a working address');
  assert.equal(await page.inputValue('#firstrun-pass'), '', 'the password is not kept');
  await shot(page, 'emby-firstrun-unreachable');
  // The address can be changed here, and the sign-in then works.
  await page.fill('#firstrun-url', em(app));
  await page.click('#firstrun-address input[type="submit"]');
  await page.waitForSelector('#firstrun-login:not([hidden])', { timeout: 20000 });
  await page.fill('#firstrun-user', 'demo');
  await page.fill('#firstrun-pass', 'demo-pass');
  await page.click('#firstrun-login input[type="submit"]');
  await page.waitForSelector('#settings[open]', { timeout: 30000 });
  await testOk(page);
  assert.equal(await page.inputValue('#jf-address'), em(app));
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);

  // The same in Settings: the line names the address and the field stays editable.
  await openSettings(page);
  await page.check('input[name="serverTypePick"][value="emby"]');
  await page.fill('#jf-address', DEAD);
  await page.fill('#jf-user', 'demo');
  await page.fill('#jf-pass', 'demo-pass');
  await page.click('#jf-login');
  await page.waitForFunction((u) => document.getElementById('test-result').textContent.includes(`Couldn't reach Emby at ${u}. Check the address and try again.`), DEAD, { timeout: 20000 });
  assert.equal(await page.$eval('#jf-address', (el) => el === document.activeElement), true, 'the address field has the focus');
  assert.equal(await page.$eval('#jf-address', (el) => !el.disabled && !el.readOnly), true);
  assert.equal(await page.inputValue('input[name="plexToken"]'), '', 'a failed sign-in stores nothing');
  assert.equal(await page.inputValue('#jf-pass'), '');
  check('an Emby server that does not answer is named on the card (with its address field) and in Settings');
});

// ---------- a slow sign-in shows no code (UX M1) ----------

emCase('17 an Emby sign-in in Settings shows no code placeholder and no Quick Connect line while the servers are found', { settings: { pixelShift: false }, viewport: { width: 1920, height: 1080 } }, async ({ page, context, app }) => {
  let release;
  const gate = new Promise((r) => (release = r));
  let held = 0;
  await context.route(`${em(app)}/System/Info/Public`, async (route) => {
    held++;
    await gate;
    await route.continue();
  });
  await page.goto(app.url);
  await page.waitForSelector('#firstrun:not([hidden])');
  await openSettings(page);
  await page.check('input[name="serverTypePick"][value="emby"]');
  await signInInSheet(page, app);
  await waitUntil('the server lookup to be held', () => held >= 1);
  await page.waitForFunction(() => /Signed in\. Finding your servers/.test(document.getElementById('signin-status').textContent));
  assert.equal(await page.isVisible('#signin-code'), false, 'no "····" placeholder');
  assert.equal(await page.isVisible('#signin-panel [data-srv="panel-lead"]'), false, 'no line about entering a code');
  const shown = await page.$eval('#signin-panel', (el) => [...el.querySelectorAll('*')].filter((e) => e.offsetParent !== null).map((e) => e.textContent).join(' '));
  assert.doesNotMatch(shown, /····|Quick Connect|plex\.tv/);
  await shot(page, 'emby-settings-slow-signin');
  release();
  await testOk(page);
  check("while Emby's servers are found, the sheet shows only its status");
});

// ---------- another address clears the pin (D147 2) ----------

for (const [type, seedFn] of [
  ['Emby', (app) => seed({ staticRatingKey: hex('a', 3), staticTitle: 'Velvet Curtain', noRepeatDays: 3 })(app)],
  ['Jellyfin', (app) => ({ ...jellyfinSeed(app), libraryKey: MOVIES })],
]) {
  emCase(`18 ${type}: a Save that stores another address of the same type clears the pin and keeps the cache and the history; the same address keeps the pin`, { settings: seedFn, localStorage: HISTORY_LS }, async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    assert.ok((await stored(page)).staticRatingKey, 'the pin is there');
    // The same address (a trailing slash is no other address): nothing is cleared.
    await openSettings(page);
    await testOk(page);
    await page.click('#connected-change');
    await page.fill('#jf-address', `${em(app)}/`);
    await save(page);
    assert.ok((await stored(page)).staticRatingKey, 'the same address keeps the pin');
    // Another address of the same server type: the pinned id means nothing there.
    const other = `http://localhost:${app.jellyfinPort}`;
    await openSettings(page);
    await testOk(page);
    await page.click('#connected-change');
    await page.fill('#jf-address', other);
    await save(page);
    await waitUntil('the pin to be cleared', async () => !(await stored(page)).staticRatingKey);
    const s = await stored(page);
    assert.deepEqual([s.serverUrl, s.staticRatingKey, s.staticTitle], [other, '', '']);
    assert.ok((await index(page)).some((e) => e.ratingKey === 'seed-1'), 'the offline cache stays (D143 6)');
    assert.ok('seed-1' in (await history(page)), 'the no-repeat history stays');
    check(`${type}: another address clears the pin, the cache and the history stay`);
  });
}

// ---------- the pin goes on every route to another server (D149 1) ----------
// A live preview (after an import, and on a layout field) must not leave the new address in force: the Save compares with the stored one.

const pinSeeds = [
  ['Emby', (app) => seed({ staticRatingKey: hex('a', 3), staticTitle: 'Velvet Curtain' })(app), (app) => `http://localhost:${app.jellyfinPort}`, 'emby'],
  ['Jellyfin', (app) => ({ ...jellyfinSeed(app), noRepeatDays: 0 }), (app) => `http://localhost:${app.jellyfinPort}`, 'jellyfin'],
  ['Plex', (app) => plexSeed(app), (app) => `http://localhost:${app.mockPort}`, 'plex'],
];
/** Sets the address field the way typing does, whatever the sheet shows (a signed-in card hides the field behind "Change"). */
const typeAddress = (page, url) =>
  page.evaluate((u) => {
    const el = document.querySelector('input[name="serverUrl"]');
    el.value = u;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, url);

for (const [label, seedFn, otherFn, type] of pinSeeds) {
  emCase(`20 ${label}: an import for another address, then Save, clears the pin`, { settings: seedFn }, async ({ page, context, app }) => {
    await context.route('https://plex.tv/**', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: route.request().url().includes('/resources') ? '[]' : JSON.stringify({ id: 1, code: 'STUB', expiresIn: 900, authToken: null }) }));
    await page.goto(app.url);
    await posterShown(page);
    assert.ok((await stored(page)).staticRatingKey, 'the pin is there');
    const other = otherFn(app);
    await openSettings(page);
    await testOk(page);
    await importFile(page, { serverType: type, serverUrl: other });
    await page.waitForFunction((u) => document.querySelector('input[name="serverUrl"]').value === u, other);
    assert.ok((await stored(page)).staticRatingKey, 'the import alone stores nothing: the pin is still stored');
    await save(page);
    await waitUntil('the pin to be cleared', async () => !(await stored(page)).staticRatingKey);
    const s = await stored(page);
    assert.deepEqual([s.serverUrl, s.staticRatingKey, s.staticTitle], [other, '', '']);
    check(`${label}: an import for another address, then Save, clears the pin`);
  });

  emCase(`21 ${label}: a typed address, then a layout field, then Save, clears the pin`, { settings: seedFn }, async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    assert.ok((await stored(page)).staticRatingKey, 'the pin is there');
    const other = otherFn(app);
    await openSettings(page);
    await testOk(page);
    await typeAddress(page, other);
    await page.selectOption('select[name="posterFit"]', 'contain'); // a live field: the preview runs with the typed address in the form
    await save(page);
    await waitUntil('the pin to be cleared', async () => !(await stored(page)).staticRatingKey);
    const s = await stored(page);
    assert.deepEqual([s.serverUrl, s.staticRatingKey, s.staticTitle, s.posterFit], [other, '', '', 'contain']);
    check(`${label}: a typed address, a layout change, then Save, clears the pin`);
  });
}

emCase('22 an import that changes the address or the token rebuilds the server connection on Save', { settings: seed() }, async ({ page, app }) => {
  const seen = watchEmby(page, app);
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  // Another address (the same mock under another host name) with the file's own token and user id.
  const other = `http://localhost:${app.jellyfinPort}`;
  await importFile(page, { serverType: 'emby', serverUrl: other, plexToken: EMBY_TOKEN, serverUserId: hex('8', 1) });
  await page.waitForFunction((u) => document.querySelector('input[name="serverUrl"]').value === u, other);
  await save(page);
  await waitUntil('the pool to be asked from the new address', () => page.evaluate(() => performance.getEntriesByType('resource').some((e) => e.name.startsWith('http://localhost:') && e.name.includes('/Items'))));
  // Another token for the same address: the connection is rebuilt with it.
  await openSettings(page);
  const mark = seen.length;
  await importFile(page, { serverType: 'emby', serverUrl: other, plexToken: 'other-token', serverUserId: hex('8', 1) });
  await page.waitForFunction(() => document.querySelector('input[name="plexToken"]').value === 'other-token');
  await save(page);
  await waitUntil('a request signed with the new token', () => seen.slice(mark).some((r) => r.token === 'other-token' || r.emby.includes('other-token')));
  check('an import that changes the address or the token rebuilds the connection on Save');
});

// ---------- the user id goes with its token ----------

emCase('19 the user id is set aside with the token on a change of type or an import, and comes back with it when Emby is chosen again', { settings: seed() }, async ({ page, app }) => {
  const userId = hex('8', 1);
  const idField = () => page.$eval('input[name="serverUserId"]', (el) => el.value);
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  assert.equal(await idField(), userId);
  await page.check('input[name="serverTypePick"][value="jellyfin"]');
  assert.deepEqual([await page.inputValue('input[name="plexToken"]'), await idField()], ['', ''], 'another type gets neither the token nor the id');
  await page.check('input[name="serverTypePick"][value="emby"]');
  assert.deepEqual([await page.inputValue('input[name="plexToken"]'), await idField()], [EMBY_TOKEN, userId], 'choosing Emby again brings both back');
  // An import for another type sets both aside too, and the same choice brings them back.
  await importFile(page, { serverType: 'jellyfin', serverUrl: em(app) });
  await page.waitForFunction(() => document.querySelector('input[name="serverType"]').value === 'jellyfin');
  assert.deepEqual([await page.inputValue('input[name="plexToken"]'), await idField()], ['', '']);
  await page.check('input[name="serverTypePick"][value="emby"]');
  assert.deepEqual([await page.inputValue('input[name="plexToken"]'), await idField()], [EMBY_TOKEN, userId], 'the import set both aside, and they return together');
  check('the user id travels with its token: a type change and an import set both aside, choosing Emby again returns both');
});

// ---------- layouts ----------

for (const [label, opts, settings] of [
  ['1920x1080', { viewport: { width: 1920, height: 1080 } }, {}],
  ['a phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, {}],
  ['rotation 90', { viewport: { width: 1280, height: 720 } }, { rotation: 90 }],
  ['a phone at rotation 90', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, { rotation: 90 }],
]) {
  emCase(`14 Settings with Emby at ${label}`, { settings: seed(settings), ...opts }, async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    await openSettings(page);
    await testOk(page);
    await page.click('#connected-change');
    const fit = await page.evaluate(() => {
      const dialog = document.getElementById('settings');
      const within = (sel) => {
        const el = document.querySelector(sel);
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // the sheet scrolls; on a rotated screen its scroll runs sideways, so a part is measured where the scroll brings it
        const r = el.getBoundingClientRect();
        return { sel, visible: !el.closest('[hidden]') && r.width > 0 && r.height > 0, inside: r.left >= -0.5 && r.right <= innerWidth + 0.5, height: r.height };
      };
      return {
        sideways: document.documentElement.scrollWidth - innerWidth,
        sheetSideways: dialog.scrollWidth - dialog.clientWidth,
        parts: ['.server-type', '#jf-address', '#jf-password', '#jf-user', '#jf-login', '#test-btn'].map(within),
        passwordOpen: document.getElementById('jf-password').open,
        summaryShown: !document.querySelector('#jf-password summary').hidden,
        loginPrimary: document.getElementById('jf-login').classList.contains('primary'),
        typeButtons: [...document.querySelectorAll('.server-type .seg-opt span')].map((e) => e.getBoundingClientRect().height),
        signInButton: document.getElementById('signin-btn').getBoundingClientRect().width,
      };
    });
    assert.ok(fit.sideways <= 1, `page scrolls sideways by ${fit.sideways}`);
    assert.ok(fit.sheetSideways <= 1, `sheet scrolls sideways by ${fit.sheetSideways}`);
    for (const p of fit.parts) assert.ok(p.visible && p.inside, `${p.sel} visible ${p.visible} inside ${p.inside}`);
    assert.equal(fit.signInButton, 0, 'no Quick Connect button takes room');
    // D147 4: Emby's only sign-in is open, not under a heading that folds it away, and its button is the primary one.
    assert.equal(fit.passwordOpen, true, 'the user name and password form is open');
    assert.equal(fit.summaryShown, false, 'no collapsible heading over the form');
    assert.equal(fit.loginPrimary, true, 'the Sign in button uses the primary style');
    assert.ok(fit.typeButtons.length === 3 && fit.typeButtons.every((h) => h >= 40), `server type buttons ${fit.typeButtons}`);
    await shot(page, `emby-settings-${label.replace(/\W+/g, '-')}`);
    check(`Settings with Emby at ${label}: the three-way choice, address and password form fit without sideways scroll`);
  });

  emCase(`15 the first-run card with Emby at ${label}`, { settings: { pixelShift: false, ...settings }, ...opts }, async ({ page, app }) => {
    await page.goto(app.url);
    await page.waitForSelector('#firstrun:not([hidden])');
    await page.check('input[name="firstrunType"][value="emby"]');
    await page.fill('#firstrun-url', em(app));
    await page.click('#firstrun-address input[type="submit"]');
    await page.waitForSelector('#firstrun-login:not([hidden])', { timeout: 20000 });
    await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
    const m = await page.evaluate(() => {
      const on = (sel) => {
        const el = document.querySelector(sel);
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // the card scrolls when it is taller than the screen (D147 4): every part must be reachable by that scroll
        const r = el.getBoundingClientRect();
        return { sel, ok: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5 };
      };
      return ['.firstrun-type', '#firstrun-status', '#firstrun-user', '#firstrun-pass', '#firstrun-login input[type="submit"]', '.empty-card [data-action="settings"]'].map(on);
    });
    await shot(page, `emby-firstrun-${label.replace(/\W+/g, '-')}`);
    for (const p of m) assert.ok(p.ok, `${p.sel} is off screen`);
    check(`the card with Emby at ${label}: the choice, the status and the form are on screen`);
  });
}

// ---------- run ----------

const WORKERS = Number(process.env.E2E_EMBY_WORKERS || 3);
if (process.env.E2E_EMBY_ONLY) {
  const only = new RegExp(process.env.E2E_EMBY_ONLY);
  cases.splice(0, cases.length, ...cases.filter((c) => only.test(c.name)));
}
const failures = [];
let nextCase = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (nextCase < cases.length) {
      const { name: caseName, opts, fn } = cases[nextCase++];
      try {
        await withApp(opts, fn);
        console.log(`PASS case ${caseName}`);
      } catch (err) {
        failures.push({ name: caseName, err });
      }
    }
  }),
);
for (const { name: caseName, err } of failures) console.error(`case ${caseName} failed:\n${err?.stack || err}`);
if (failures.length) process.exit(1);
console.log(`all ${cases.length} emby cases passed`);
