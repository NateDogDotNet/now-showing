// The Jellyfin source (R-SRC-2, D134, D141) in the browser, against the mock Jellyfin server that serve.mjs --mock starts beside the
// mock Plex server (scripts/mock-jellyfin.mjs, reached through app.jellyfinPort: this spec is also the check of that wiring, D136).
//
// Mock users: `demo` / `demo-pass`, token `jf-demo-token`. Libraries: Movies (b..1: 8 titles), Kids Movies (b..2: 5 titles).
// Ratings: G 1 Grand Marquee, PG 2 Midnight Projector, PG-13 3 Velvet Curtain, R 4 Popcorn Skies, TV-MA 5 Neon Matinee, "15" 6 Last Reel,
// R 7 Silver Screen Serenade, unrated 8 Encore; Kids: Tiny Lanterns G, The Paper Kite G, Pocket Dragons PG, Moonlit Meadow G, Captain Pudding PG.
//
// Every case has its own mock servers (serveArgs: []) and names pixelShift: false (convention 7). Nothing waits for a wall-clock time:
// every wait is on a state (a poster drawn, a dialog closed, a request seen) with a bound.

import assert from 'node:assert/strict';
import { withApp, shot } from './lib.mjs';

const cases = [];
const jfCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], ...opts }, fn });
const check = (name) => console.log(`  ok  ${name}`);

const TOKEN = 'jf-demo-token';
const hex = (prefix, n) => prefix + String(n).padStart(31, '0');
const MOVIES = hex('b', 1);
const KIDS_LIB = hex('b', 2);
const T = {
  G: ['The Grand Marquee', 'Tiny Lanterns', 'The Paper Kite', 'Moonlit Meadow'],
  PG: ['Midnight Projector', 'Pocket Dragons', 'Captain Pudding'],
  PG13: ['Velvet Curtain'],
  NOT_ALLOWED_AT_PG13: ['Popcorn Skies', 'Neon Matinee', 'Last Reel', 'Silver Screen Serenade', 'Encore'],
};
const ALL_MOVIES = ['The Grand Marquee', 'Midnight Projector', 'Velvet Curtain', 'Popcorn Skies', 'Neon Matinee', 'Last Reel', 'Silver Screen Serenade', 'Encore'];
const name = (alt) => (alt || '').replace(/^Poster: /, '');

const jf = (app) => `http://127.0.0.1:${app.jellyfinPort}`;
const seed = (extra = {}) => (app) => ({
  serverType: 'jellyfin',
  plexToken: TOKEN,
  serverUrl: jf(app),
  libraryKey: MOVIES,
  libraryKeys: [MOVIES],
  libraryNames: ['Movies'],
  rotateSeconds: 3600,
  showNowPlaying: false,
  unwatchedOnly: false,
  pixelShift: false,
  ...extra,
});
const mockPost = (app, path) => fetch(`${jf(app)}${path}`, { method: 'POST' }).then((r) => r.json());
const approve = (app) => mockPost(app, '/__mock/quickconnect-approve');

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

// ---------- first run ----------

jfCase('1 first run with Jellyfin chosen: a large upright Quick Connect code; approving it signs in and lists the movie libraries', { settings: { pixelShift: false }, viewport: { width: 1920, height: 1080 } }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForSelector('#firstrun:not([hidden])');
  assert.match(await page.textContent('#firstrun-lead'), /plex\.tv\/link/, 'Plex words until Jellyfin is chosen');
  assert.match(await page.textContent('#empty-message'), /Plex server/);
  assert.equal((await page.textContent('#firstrun-type-label')).trim(), 'Your media server', 'the choice carries a visible question');
  assert.equal(await page.isVisible('#firstrun-type-label'), true);
  await page.check('input[name="firstrunType"][value="jellyfin"]');
  assert.equal(await page.isVisible('#firstrun-address'), true, 'Jellyfin needs the address first');
  assert.match(await page.textContent('#empty-message'), /Jellyfin server/, 'the words follow the choice');
  await page.fill('#firstrun-url', `${jf(app)}/`);
  await page.click('#firstrun-address input[type="submit"]');
  const code = await (await page.waitForFunction(() => { const t = document.getElementById('signin-code-large').textContent; return /^\d{6}$/.test(t) ? t : false; }, null, { timeout: 20000 })).jsonValue();
  assert.match((await page.textContent('#firstrun-lead')).replace(/\s+/g, ' '), /open your user menu, choose Quick Connect and enter this code/, 'the card says where Quick Connect is');
  assert.doesNotMatch(await page.textContent('#firstrun-lead'), /plex/i);
  const box = await page.$eval('#signin-code-large', (el) => {
    const r = el.getBoundingClientRect();
    const card = el.closest('.empty-card').getBoundingClientRect();
    let angle = 0; // the turn of the nearest transformed ancestor; 0 is upright
    for (let node = el; node; node = node.parentElement) {
      const t = getComputedStyle(node).transform;
      if (t === 'none') continue;
      const [a, b] = t.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
      angle = ((Math.round((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360;
      break;
    }
    return { fontPx: parseFloat(getComputedStyle(el).fontSize), width: r.width, height: r.height, inside: r.left >= card.left && r.right <= card.right, upright: angle === 0, scrollFits: el.scrollWidth <= el.clientWidth };
  });
  assert.ok(box.fontPx >= 64, `code font ${box.fontPx}px`);
  assert.ok(box.inside && box.scrollFits, 'the six digits fit the card');
  assert.equal(box.upright, true, 'upright at rotation 0');
  assert.equal((await stored(page)).serverType ?? 'plex', 'plex', 'choosing on the card stores nothing');
  check(`the card shows Quick Connect code ${code} at ${box.fontPx}px, upright, inside the card; nothing stored yet`);

  await approve(app);
  await page.waitForSelector('#settings[open]', { timeout: 30000 });
  await testOk(page);
  assert.deepEqual((await libraryTitles(page)).sort(), ['Kids Movies', 'Movies'], 'the movie libraries; Music is not offered');
  assert.equal(await page.$eval('input[name="serverType"]', (el) => el.value), 'jellyfin');
  assert.match(await page.textContent('#settings legend[data-srv="legend"]'), /Jellyfin connection/);
  await save(page);
  await posterShown(page);
  const s = await stored(page);
  assert.equal(s.serverType, 'jellyfin');
  assert.equal(s.plexToken, TOKEN);
  assert.equal(s.serverUrl, jf(app), 'the trailing slash is dropped');
  assert.ok(!(await allStorage(page)).includes('demo-pass'));
  check('approving the code on the mock signs in, lists Movies and Kids Movies, and Save draws a poster');
});

jfCase('2 first run, Quick Connect off: the user name and password form signs in; the password is never stored', { settings: { pixelShift: false } }, async ({ page, context, app }) => {
  await context.route('**/QuickConnect/Enabled', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: 'false' }),
  );
  await page.goto(app.url);
  await page.waitForSelector('#firstrun:not([hidden])');
  await page.check('input[name="firstrunType"][value="jellyfin"]');
  await page.fill('#firstrun-url', jf(app));
  await page.click('#firstrun-address input[type="submit"]');
  await page.waitForSelector('#firstrun-login:not([hidden])', { timeout: 20000 });
  assert.match(await page.textContent('#firstrun-status'), /Quick Connect is off/);
  await page.fill('#firstrun-user', 'demo');
  await page.fill('#firstrun-pass', 'wrong');
  await page.click('#firstrun-login input[type="submit"]');
  await page.waitForFunction(() => /not accepted/.test(document.getElementById('firstrun-status').textContent));
  assert.equal(await page.inputValue('#firstrun-pass'), '', 'the password field is emptied after an attempt');
  await page.fill('#firstrun-pass', 'demo-pass');
  await page.click('#firstrun-login input[type="submit"]');
  await page.waitForSelector('#settings[open]', { timeout: 30000 });
  await testOk(page);
  await save(page);
  await posterShown(page);
  const everything = await allStorage(page);
  assert.ok(!everything.includes('demo-pass') && !everything.includes('wrong'), 'no password in storage');
  assert.equal((await stored(page)).plexToken, TOKEN);
  check('Quick Connect off: the form signs in after a wrong attempt, and no password is stored');
});

jfCase('2b first run: a Quick Connect code the server no longer knows is replaced by a new one', { settings: { pixelShift: false } }, async ({ page, context, app }) => {
  let initiates = 0;
  let connects = 0;
  await context.route('**/QuickConnect/Initiate', (route) => (initiates++, route.fallback()));
  await context.route('**/QuickConnect/Connect*', (route) => (connects++, route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' })));
  await page.goto(app.url);
  await page.waitForSelector('#firstrun:not([hidden])');
  await page.check('input[name="firstrunType"][value="jellyfin"]');
  await page.fill('#firstrun-url', jf(app));
  await page.click('#firstrun-address input[type="submit"]');
  // The first poll answers 404 (an expired or unknown code): the round ends and a second code is asked for, long before the first code's ten minutes are up.
  await waitUntil('a second Quick Connect code', () => initiates >= 2, 30000);
  assert.ok(connects >= 1 && connects <= initiates, `polls ${connects}, codes ${initiates}`);
  check(`a code the server forgot (404) was replaced by a new one: ${initiates} codes, ${connects} polls`);
});

jfCase('3 Settings: Sign in with Quick Connect (a revoked token offers Sign in again), and a user name and password also sign in', { settings: seed({ plexToken: 'revoked' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForSelector('#empty:not([hidden])');
  await page.waitForFunction(() => /rejected the token/.test(document.getElementById('empty-message').textContent), null, { timeout: 20000 });
  const again = page.locator('#empty-actions button', { hasText: 'Sign in again' });
  await again.waitFor({ timeout: 10000 });
  await again.click();
  await page.waitForSelector('#settings[open]');
  const code = await (await page.waitForFunction(() => { const t = document.getElementById('signin-code').textContent; return /^\d{6}$/.test(t) ? t : false; }, null, { timeout: 20000 })).jsonValue();
  assert.match((await page.textContent('#signin-panel')).replace(/\s+/g, ' '), /open your user menu, choose Quick Connect and enter this code/, 'the sheet gives the card\'s instruction');
  assert.equal(await page.isVisible('#signin-btn'), true);
  assert.equal(await page.textContent('#signin-btn'), 'Sign in with Quick Connect');
  await approve(app);
  await testOk(page);
  assert.equal(await page.inputValue('input[name="plexToken"]'), TOKEN);
  await save(page);
  await posterShown(page);
  check(`a revoked token shows "Sign in again"; the sheet's Quick Connect code ${code} signs in`);

  await openSettings(page);
  await page.click('#connected-change');
  await page.evaluate(() => (document.querySelector('input[name="plexToken"]').value = 'junk'));
  await page.click('#jf-password summary');
  await page.fill('#jf-user', 'demo');
  await page.fill('#jf-pass', 'demo-pass');
  await page.click('#jf-login');
  await page.waitForFunction((t) => document.querySelector('input[name="plexToken"]').value === t, TOKEN, { timeout: 20000 });
  await testOk(page);
  assert.equal(await page.inputValue('#jf-pass'), '', 'the password is cleared once used');
  await save(page);
  assert.ok(!(await allStorage(page)).includes('demo-pass'));
  check('a user name and password sign in from the sheet; the password is gone from the field and from storage');
});

// ---------- the limit ----------

jfCase('4 thirty picks under PG show only G and PG titles', { settings: seed({ maxContentRating: 'PG', libraryKeys: [MOVIES, KIDS_LIB], libraryNames: ['Movies', 'Kids Movies'] }) }, async ({ page, app }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  const shown = new Set(await picks(page, 30));
  const allowed = [...T.G, ...T.PG];
  for (const t of shown) assert.ok(allowed.includes(t), `${t} is above PG, or unrated`);
  for (const t of ['Velvet Curtain', ...T.NOT_ALLOWED_AT_PG13]) assert.ok(!shown.has(t), `${t} was shown`);
  assert.ok(shown.size >= 3, `only ${[...shown]} came up`);
  check(`30 picks under PG: ${[...shown].sort().join(', ')}; never the 15, TV-MA, R or unrated titles`);
});

jfCase('5 thirty picks under PG-13 show only G, PG and PG-13 titles', { settings: seed({ maxContentRating: 'PG-13', libraryKeys: [MOVIES, KIDS_LIB], libraryNames: ['Movies', 'Kids Movies'] }) }, async ({ page, app }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  const shown = new Set(await picks(page, 30));
  const allowed = [...T.G, ...T.PG, ...T.PG13];
  for (const t of shown) assert.ok(allowed.includes(t), `${t} is above PG-13, or unrated`);
  for (const t of T.NOT_ALLOWED_AT_PG13) assert.ok(!shown.has(t), `${t} was shown`);
  check(`30 picks under PG-13: ${[...shown].sort().join(', ')}; never R, TV-MA, 15 or unrated`);
});

jfCase('6 a rating-schedule slot and a profile apply to Jellyfin posters as to Plex', { settings: seed({ maxContentRating: 'R', limitSlots: [{ start: '00:00', limit: 'G' }], libraryKeys: [MOVIES, KIDS_LIB], libraryNames: ['Movies', 'Kids Movies'] }) }, async ({ page, app }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  const shown = new Set(await picks(page, 24));
  for (const t of shown) assert.ok(T.G.includes(t), `${t} is above G, the slot's limit`);
  check(`a slot from 00:00 up to G beats the base limit R: ${[...shown].sort().join(', ')}`);
});

const KIDS_PROFILE = { id: 'kids', name: 'Kids', maxContentRating: 'G', limitNowPlaying: true, libraryKeys: [KIDS_LIB], libraryNames: ['Kids Movies'], genres: [], ratings: [], source: null, weighting: 'off', noRepeatDays: 0, frameId: 'marquee' };
jfCase('7 a profile in force replaces the selection and the limit', { settings: seed({ maxContentRating: 'R', profiles: [KIDS_PROFILE], limitSlots: [{ start: '00:00', profile: 'kids' }] }) }, async ({ page, app }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  const shown = new Set(await picks(page, 24));
  for (const t of shown) assert.ok(['Tiny Lanterns', 'The Paper Kite', 'Moonlit Meadow'].includes(t), `${t} is not a G title of Kids Movies`);
  check(`the Kids profile (G, Kids Movies) in force: ${[...shown].sort().join(', ')}`);
});

// ---------- the selection ----------

jfCase('8 a genre, a BoxSet and a playlist each narrow the pool', { settings: seed({ maxContentRating: '', libraryKeys: [MOVIES, KIDS_LIB], libraryNames: ['Movies', 'Kids Movies'] }) }, async ({ page, app }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  const patch = (extra) => page.evaluate((x) => localStorage.setItem('plexPoster.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('plexPoster.settings')), ...x })), extra);
  const seen = async (extra, n) => {
    await patch(extra);
    await page.reload();
    await posterShown(page);
    return new Set(await picks(page, n));
  };

  const animation = await seen({ genres: [{ key: hex('c', 6), title: 'Animation' }] }, 20);
  for (const t of animation) assert.ok(['Tiny Lanterns', 'The Paper Kite', 'Captain Pudding'].includes(t), `${t} is not Animation`);
  check(`genre Animation narrows the pool: ${[...animation].sort().join(', ')}`);

  const box = await seen({ genres: [], source: { kind: 'collection', key: hex('d', 1), title: 'Midnight Double Feature' } }, 16);
  for (const t of box) assert.ok(['Midnight Projector', 'Neon Matinee'].includes(t), `${t} is not in the BoxSet`);
  assert.ok(box.size === 2, `both BoxSet titles come up: ${[...box]}`);
  check(`the BoxSet replaces the libraries: ${[...box].sort().join(', ')}`);

  const list = await seen({ source: { kind: 'playlist', key: hex('e', 1), title: 'Weekend Picks' } }, 20);
  for (const t of list) assert.ok(['The Grand Marquee', 'Tiny Lanterns', 'Last Reel'].includes(t), `${t} is not in the playlist`);
  assert.ok(list.size >= 2);
  check(`the playlist replaces the libraries (Kids Movies is in it too): ${[...list].sort().join(', ')}`);
});

jfCase('9 Settings lists the genres, the BoxSet and the playlist of the Jellyfin server', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  await page.waitForFunction(() => document.querySelectorAll('#genre-list li').length >= 5, null, { timeout: 20000 });
  const genres = await page.$$eval('#genre-list li', (els) => els.map((e) => e.textContent.replace(/\s*\(.*$/, '').trim()));
  assert.ok(genres.includes('Drama') && genres.includes('Mystery'), genres.join(','));
  await page.waitForFunction(() => document.querySelectorAll('#source-select option').length >= 3, null, { timeout: 20000 });
  const sources = await page.$$eval('#source-select option', (els) => els.map((e) => e.textContent.trim()));
  assert.ok(sources.filter((t) => t === 'Midnight Double Feature').length === 1 && sources.some((t) => t.includes('Weekend Picks')), sources.join(','));
  assert.equal(await page.isVisible('#settings legend[data-srv="legend"]'), true);
  check(`genres (${genres.length}) and sources (${sources.join(' | ')}) come from the Jellyfin server`);
});

// ---------- now playing ----------

const npSeed = (extra = {}) => seed({ showNowPlaying: true, nowPlayingPollSeconds: 5, ...extra });
const sessionsRequests = (page) => {
  const seen = { n: 0 };
  page.on('request', (r) => new URL(r.url()).pathname === '/Sessions' && seen.n++);
  return seen;
};

jfCase('10 now playing a movie, and an episode that shows its series poster', { settings: npSeed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await mockPost(app, `/__mock/jellyfin-sessions?kind=movie&id=${hex('a', 3)}&user=demo`);
  await page.waitForFunction(() => document.querySelector('.poster-layer.active')?.alt === 'Poster: Velvet Curtain', null, { timeout: 30000 });
  check('a movie playing on the server is the poster on screen');
  await mockPost(app, '/__mock/jellyfin-sessions?kind=episode');
  await page.waitForFunction(() => document.querySelector('.poster-layer.active')?.alt === 'Poster: Harbor Lights', null, { timeout: 30000 });
  check('an episode playing shows its series poster (Harbor Lights)');
  await mockPost(app, '/__mock/jellyfin-sessions?kind=none');
});

jfCase('11 now playing under a limit: an unrated series and a "15" movie count as nothing playing', { settings: npSeed({ maxContentRating: 'PG', limitNowPlaying: true }) }, async ({ page, app }) => {
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
  check('under PG, the 15-rated movie and the unrated episode are never put on screen');
});

// ---------- upgrade and switch ----------

const SEED_ENTRY = { ratingKey: 'seed-1', title: 'Seeded', year: '2001', thumb: '/t/1', contentRating: 'G', width: 600, height: 900, savedAt: Date.now() };
const withHistory = (extra = {}) => (app) => ({
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
  ...extra,
});
const HISTORY_LS = { 'plexPoster.posterIndex': JSON.stringify([SEED_ENTRY]), 'plexPoster.shownAt': JSON.stringify({ 'seed-1': Date.now() }) };

jfCase('12 an upgrade from 2.3.1 (no serverType) keeps the poster cache, the pin and the history, also after a Save', { settings: withHistory(), localStorage: HISTORY_LS }, async ({ page, app }) => {
  assert.equal('serverType' in (await withHistory()(app)), false, 'the seed is a 2.3.1 object');
  await page.goto(app.url);
  await posterShown(page);
  const kept = async (when) => {
    assert.equal((await stored(page)).staticRatingKey, '3', `${when}: the pin`);
    assert.ok((await index(page)).some((e) => e.ratingKey === 'seed-1'), `${when}: the cache`);
    assert.ok('seed-1' in (await history(page)), `${when}: the history`);
  };
  await kept('after boot');
  await openSettings(page);
  await testOk(page);
  await save(page);
  assert.equal((await stored(page)).serverType, 'plex', 'a Save writes the type Plex');
  assert.equal((await page.textContent('#toast')).trim(), 'Settings saved.', 'a Save that changes no server type says what it always said');
  await kept('after a Save');
  check('absent serverType reads as plex: boot and a Save keep the cache, the pin and the history');
});

async function signInWithPassword(page, app) {
  await page.fill('#jf-address', jf(app));
  await page.click('#jf-password summary');
  await page.fill('#jf-user', 'demo');
  await page.fill('#jf-pass', 'demo-pass');
  await page.click('#jf-login');
  await testOk(page);
}

jfCase('13 choosing a type, signing in or pressing Cancel clears nothing; Save of a switch clears the cache, the pin and the history; switching back does too', { settings: withHistory(), localStorage: HISTORY_LS }, async ({ page, app }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);

  // Cancel: nothing is cleared, nothing is stored.
  await openSettings(page);
  await page.check('input[name="serverTypePick"][value="jellyfin"]');
  assert.equal(await page.inputValue('input[name="plexToken"]'), '', 'a Plex token is never left in a Jellyfin form');
  await signInWithPassword(page, app);
  assert.deepEqual((await libraryTitles(page)).sort(), ['Kids Movies', 'Movies']);
  assert.ok((await index(page)).some((e) => e.ratingKey === 'seed-1'), 'signing in cleared nothing');
  assert.equal((await stored(page)).serverType ?? 'plex', 'plex');
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  assert.equal((await stored(page)).serverType ?? 'plex', 'plex');
  assert.equal((await stored(page)).staticRatingKey, '3');
  assert.ok((await index(page)).some((e) => e.ratingKey === 'seed-1') && 'seed-1' in (await history(page)));
  check('choosing Jellyfin and signing in, then Cancel: the type, the pin, the cache and the history are as before');

  // Save: the switch.
  await openSettings(page);
  await page.check('input[name="serverTypePick"][value="jellyfin"]');
  await signInWithPassword(page, app);
  // A live control moves while the new type is only chosen: its preview must not take the type early, or Save would not see a switch.
  await page.evaluate(() => {
    const el = document.querySelector('input[name="posterScale"]');
    el.value = '90';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal((await stored(page)).serverType ?? 'plex', 'plex', 'a preview stores nothing');
  await save(page);
  await page.waitForFunction(() => /Now showing posters from Jellyfin/.test(document.getElementById('toast').textContent));
  assert.equal((await page.textContent('#toast')).trim(), 'Now showing posters from Jellyfin. The offline posters, the pinned poster and the no-repeat history were cleared.');
  await waitUntil('the cache to be cleared of the Plex entry', async () => !(await index(page)).some((e) => e.ratingKey === 'seed-1'));
  const s = await stored(page);
  assert.equal(s.serverType, 'jellyfin');
  assert.equal(s.staticRatingKey, '', 'the pin is cleared');
  assert.ok(!('seed-1' in (await history(page))), 'the history is cleared');
  await waitUntil('a Jellyfin poster in the cache', async () => (await index(page)).some((e) => /^[0-9a-f]{32}$/.test(e.ratingKey)));
  await posterShown(page);
  check('Save of Plex -> Jellyfin clears the cache, the pin and the history');

  // Back: pin a Jellyfin poster, let the cache and history fill, then switch to Plex.
  await page.click('[data-action="pin"]');
  const pinned = await waitUntil('the pin', async () => (await stored(page)).staticRatingKey);
  assert.match(pinned, /^[0-9a-f]{32}$/, 'a Jellyfin id is kept as the server wrote it');
  await openSettings(page);
  await page.check('input[name="serverTypePick"][value="plex"]');
  await page.evaluate(() => (document.getElementById('manual-connection').open = true));
  await page.fill('input[name="plexToken"]', 'demo-token');
  await page.fill('input[name="serverUrl"]', `http://127.0.0.1:${app.mockPort}`);
  await page.click('#test-btn');
  await testOk(page);
  await save(page);
  await waitUntil('the Jellyfin cache entries to go', async () => !(await index(page)).some((e) => /^[0-9a-f]{32}$/.test(e.ratingKey)));
  const back = await stored(page);
  assert.equal(back.serverType, 'plex');
  assert.equal(back.staticRatingKey, '', 'the Jellyfin pin is cleared');
  assert.deepEqual(Object.keys(await history(page)).filter((k) => /^[0-9a-f]{32}$/.test(k)), [], 'the Jellyfin history is cleared');
  await posterShown(page);
  check('Save of Jellyfin -> Plex clears the cache, the pin and the history again');
});

jfCase('13b an imported file that changes only serverType is a Save: the client is rebuilt and the cache, the pin and the history are cleared', { settings: seed({ noRepeatDays: 3, staticRatingKey: hex('a', 3), staticTitle: 'Velvet Curtain' }), localStorage: HISTORY_LS }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  assert.ok((await index(page)).some((e) => e.ratingKey === 'seed-1'));
  await openSettings(page);
  await testOk(page);
  // The connection (address and token) is the same: only the type differs, so only the type's own change can rebuild the client.
  await page.setInputFiles('#import-file', { name: 'later-build.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ serverType: 'kodi', plexToken: TOKEN, serverUrl: jf(app) })) });
  await page.waitForFunction(() => document.querySelector('input[name="serverType"]').value === 'kodi');
  await save(page);
  await page.waitForFunction(() => /Unknown server type "kodi"/.test(document.getElementById('empty-message').textContent), null, { timeout: 15000 });
  await waitUntil('the cache to be cleared', async () => !(await index(page)).some((e) => e.ratingKey === 'seed-1'));
  const s = await stored(page);
  assert.equal(s.serverType, 'kodi');
  assert.equal(s.staticRatingKey, '');
  assert.ok(!('seed-1' in (await history(page))));
  assert.equal(s.plexToken, TOKEN, 'the token and address are as they were');
  check('an import that names another type is a Save: the card names the type, and the cache, the pin and the history are cleared');
});

// ---------- a token never goes to the other type's server (D142 2) ----------

/** Records, per server, every request that carries `secret` in the Authorization header, an X-Plex-Token parameter or any URL. */
const watchSecret = (page, app, secret) => {
  const hits = { jellyfin: [], plex: [] };
  page.on('request', (r) => {
    const u = new URL(r.url());
    const carries = r.url().includes(secret) || (r.headers().authorization || '').includes(secret) || (r.headers()['x-plex-token'] || '').includes(secret);
    if (!carries) return;
    if (u.port === String(app.jellyfinPort)) hits.jellyfin.push(u.pathname);
    if (u.port === String(app.mockPort)) hits.plex.push(u.pathname);
  });
  return hits;
};
const importFile = (page, body) => page.setInputFiles('#import-file', { name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(body)) });

jfCase('18 a Jellyfin file imported onto a Plex display brings no Plex token to the Jellyfin server', { settings: withHistory({ staticRatingKey: '' }) }, async ({ page, app }) => {
  const hits = watchSecret(page, app, 'demo-token');
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  await importFile(page, { serverType: 'jellyfin', serverUrl: jf(app), libraryKey: MOVIES });
  await page.waitForFunction(() => document.querySelector('input[name="serverType"]').value === 'jellyfin');
  assert.equal(await page.inputValue('input[name="plexToken"]'), '', 'the Plex token stays behind');
  assert.equal(await page.inputValue('#jf-address'), jf(app));
  await save(page);
  await page.waitForSelector('#empty:not([hidden])');
  const s = await stored(page);
  assert.deepEqual([s.serverType, s.plexToken, s.serverUrl], ['jellyfin', '', jf(app)]);
  assert.deepEqual(hits.jellyfin, [], `the Plex token reached the Jellyfin server: ${hits.jellyfin}`);
  check('import of a Jellyfin file onto Plex: the form holds no token, the Save stores none, no request to Jellyfin carried the Plex token');
});

for (const [label, file] of [
  ['a Plex export without secrets', (app) => ({ serverType: 'plex', serverUrl: `http://127.0.0.1:${app.mockPort}`, libraryKey: '1' })],
  ['a 2.3.1 file with no server type', (app) => ({ serverUrl: `http://127.0.0.1:${app.mockPort}`, libraryKey: '1' })],
]) {
  jfCase(`19 ${label} imported onto a Jellyfin display brings no Jellyfin token to the Plex server`, { settings: seed() }, async ({ page, context, app }) => {
    // The display ends unconfigured on Plex and asks plex.tv for a code: answered here, never reaching the real service (K48).
    await context.route('https://plex.tv/**', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: route.request().url().includes('/resources') ? '[]' : JSON.stringify({ id: 1, code: 'STUB', expiresIn: 900, authToken: null }) }));
    const hits = watchSecret(page, app, TOKEN);
    await page.goto(app.url);
    await posterShown(page);
    await openSettings(page);
    await testOk(page);
    await importFile(page, file(app));
    await page.waitForFunction(() => document.querySelector('input[name="serverType"]').value === 'plex');
    assert.equal(await page.inputValue('input[name="plexToken"]'), '', 'the Jellyfin token stays behind');
    await save(page);
    await page.waitForSelector('#empty:not([hidden])');
    const s = await stored(page);
    assert.deepEqual([s.serverType, s.plexToken], ['plex', '']);
    assert.deepEqual(hits.plex, [], `the Jellyfin token reached the Plex server: ${hits.plex}`);
    check(`${label} onto Jellyfin: no token left behind in the form, none stored, none sent to the Plex server`);
  });
}

jfCase('20 first run: the card\'s Plex choice over a stored Jellyfin type reaches the sheet as Plex, with no Plex token sent to the Jellyfin address', { settings: { pixelShift: false, serverType: 'jellyfin', serverUrl: 'JF' } }, async ({ page, context, app }) => {
  const hits = watchSecret(page, app, 'PLEXSECRET');
  let polls = 0;
  await context.route('https://plex.tv/**', (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    const headers = { 'access-control-allow-origin': '*' };
    const json = (body) => route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() === 'POST' && pathname === '/api/v2/pins') return json({ id: 7, code: 'ABCD', expiresIn: 900, expiresAt: new Date(Date.now() + 900_000).toISOString(), authToken: null });
    if (pathname.startsWith('/api/v2/pins/')) return json({ id: 7, authToken: ++polls >= 1 ? 'PLEXSECRET' : null });
    if (pathname === '/api/v2/resources') return json([]);
    return route.fulfill({ status: 404, headers, body: '' });
  });
  // The stored address is the app's own Jellyfin mock (the seed cannot name the port, so it is written before the first load).
  await page.addInitScript((url) => {
    const s = JSON.parse(localStorage.getItem('plexPoster.settings'));
    if (s.serverUrl === 'JF') localStorage.setItem('plexPoster.settings', JSON.stringify({ ...s, serverUrl: url }));
  }, jf(app));
  await page.goto(app.url);
  await page.waitForSelector('#firstrun:not([hidden])');
  assert.equal(await page.isChecked('input[name="firstrunType"][value="jellyfin"]'), true, 'the card starts on the stored type');
  await page.check('input[name="firstrunType"][value="plex"]');
  await page.waitForSelector('#settings[open]', { timeout: 30000 });
  await page.waitForFunction(() => /Signed in|servers/.test(document.getElementById('signin-status').textContent));
  assert.equal(await page.$eval('input[name="serverType"]', (el) => el.value), 'plex', 'the sheet shows the card\'s type');
  assert.match(await page.textContent('#settings legend[data-srv="legend"]'), /Plex connection/);
  assert.deepEqual(hits.jellyfin, [], `the Plex token reached the Jellyfin server: ${hits.jellyfin}`);
  check('the card\'s Plex choice reaches the sheet as Plex; the Jellyfin address saw no Plex token');
});

// ---------- the sheet and the card tell the truth about a server that does not answer (D143 1) ----------

jfCase('21 first run: an address that does not answer is named, can be changed on the card, and Open settings keeps the choice', { settings: { pixelShift: false } }, async ({ page, app }) => {
  const dead = 'http://127.0.0.1:1';
  await page.goto(app.url);
  await page.waitForSelector('#firstrun:not([hidden])');
  await page.check('input[name="firstrunType"][value="jellyfin"]');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'firstrun-url', 'focus is on the address field');
  await page.fill('#firstrun-url', dead);
  await page.click('#firstrun-address input[type="submit"]');
  await page.waitForFunction((a) => document.getElementById('firstrun-status').textContent.includes(a), dead, { timeout: 20000 });
  const status = await page.textContent('#firstrun-status');
  assert.match(status, /Couldn't reach Jellyfin at http:\/\/127\.0\.0\.1:1/);
  assert.doesNotMatch(status, /Quick Connect is off/);
  assert.equal(await page.isVisible('#firstrun-login'), false, 'no password form for an address that did not answer');
  assert.equal(await page.isVisible('#firstrun-address'), true, 'the address can be changed');
  assert.equal(await page.inputValue('#firstrun-url'), dead);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'firstrun-url');
  check('an unreachable address: "Couldn\'t reach Jellyfin at <address>", the address form again, no password form');

  await page.click('#empty [data-action="settings"]');
  await page.waitForSelector('#settings[open]');
  assert.equal(await page.$eval('input[name="serverType"]', (el) => el.value), 'jellyfin', 'Open settings keeps the Jellyfin choice');
  assert.equal(await page.inputValue('#jf-address'), dead, 'and the address');
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  await page.waitForSelector('#firstrun-address:not([hidden])');

  await page.fill('#firstrun-url', jf(app));
  await page.click('#firstrun-address input[type="submit"]');
  await page.waitForFunction(() => /^\d{6}$/.test(document.getElementById('signin-code-large').textContent), null, { timeout: 20000 });
  check('the corrected address on the card gets a Quick Connect code');
});

jfCase('22 Settings: a server that does not answer is named (not "Quick Connect is off"), and a stale "enter the address" line goes when a code shows', { settings: { pixelShift: false, serverType: 'jellyfin' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForSelector('#firstrun:not([hidden])');
  await page.click('#empty [data-action="settings"]');
  await page.waitForSelector('#settings[open]');
  assert.equal(await page.$eval('input[name="serverType"]', (el) => el.value), 'jellyfin');
  await page.click('#signin-btn');
  await page.waitForFunction(() => /Enter the server address first/.test(document.getElementById('test-result').textContent));
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'jf-address', 'focus moves to the address');
  await page.fill('#jf-address', 'http://127.0.0.1:1');
  await page.click('#signin-btn');
  await page.waitForFunction(() => /Couldn't reach Jellyfin at http:\/\/127\.0\.0\.1:1/.test(document.getElementById('test-result').textContent), null, { timeout: 20000 });
  assert.doesNotMatch(await page.textContent('#jf-status'), /Quick Connect is off/);
  assert.equal(await page.$eval('#jf-password', (el) => el.open), false, 'the password form is not opened for an address that did not answer');
  await page.fill('#jf-address', jf(app));
  await page.click('#signin-btn');
  await page.waitForFunction(() => /^\d{6}$/.test(document.getElementById('signin-code').textContent), null, { timeout: 20000 });
  assert.equal((await page.textContent('#test-result')).trim(), '', 'the old line is gone once a code shows');
  check('the sheet names an address that did not answer, focuses the field, and clears the old line when a code shows');
});

jfCase('23 a connection test begun for one server type shows nothing after the type changed', { settings: seed() }, async ({ page, context, app }) => {
  let release;
  const gate = new Promise((r) => (release = r));
  let held = 0;
  await context.route(`${jf(app)}/System/Info/Public`, async (route) => {
    held++;
    await gate;
    await route.continue();
  });
  const userViews = [];
  page.on('request', (r) => new URL(r.url()).pathname === '/UserViews' && new URL(r.url()).port === String(app.jellyfinPort) && userViews.push(r.url()));
  await page.goto(app.url);
  await posterShown(page);
  const before = userViews.length;
  await openSettings(page); // the saved connection is tested at once: its first request is held
  await waitUntil('the test to be in flight', () => held >= 1);
  await page.check('input[name="serverTypePick"][value="plex"]');
  assert.equal((await page.textContent('#test-result')).trim(), '');
  release();
  // The held test goes on to ask /UserViews: once that request is made its answer is on its way to the sheet.
  await waitUntil('the late test to finish its requests', () => userViews.length > before);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await page.waitForTimeout(0);
  assert.equal((await page.textContent('#test-result')).trim(), '', 'no verdict from the server the household left');
  assert.ok(!(await libraryTitles(page)).includes('Kids Movies'), 'the libraries the late test would have offered are not on show');
  assert.doesNotMatch(await page.textContent('#connected-text'), /Mock Jellyfin/);
  assert.equal(await page.$eval('input[name="plexToken"]', (el) => el.value), '');
  assert.equal(await page.$eval('#test-btn', (el) => el.disabled), false);
  check('a connection test answered after the switch to Plex is ignored: no verdict, no libraries, no connected line');
});

// ---------- offline, the token, a type this build lacks ----------

jfCase('14 the mock down: cached posters within the limit, "Can\'t reach Jellyfin", and no token in the cache', { settings: seed({ rotateSeconds: 10, libraryKeys: [MOVIES, KIDS_LIB], libraryNames: ['Movies', 'Kids Movies'] }), clock: { time: '2026-01-05T12:00:00' } }, async ({ page, context, app }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  for (let i = 0; i < 80 && (await index(page)).length < 10; i++) await picks(page, 1);
  const cached = await index(page);
  assert.ok(cached.length >= 8, `cached ${cached.length}`);
  assert.ok(cached.every((e) => /^[0-9a-f]{32}$/.test(e.ratingKey)), 'the Jellyfin id is the key');
  const blobUrls = await page.evaluate(async () => (await (await caches.open('plex-posters-v1')).keys()).map((r) => r.url));
  assert.ok(!(JSON.stringify(cached) + blobUrls.join(' ')).includes(TOKEN), 'the offline cache holds no token');
  assert.ok(cached.some((e) => e.contentRating === '' || e.contentRating === 'R'), 'titles above the limit are in the cache');
  check(`${cached.length} posters cached; neither the index nor the cache keys hold the token`);

  // The limit tightens to PG, then the server goes away.
  await page.evaluate(() => localStorage.setItem('plexPoster.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('plexPoster.settings')), maxContentRating: 'PG' })));
  await context.route(`http://127.0.0.1:${app.jellyfinPort}/**`, (route) => route.abort('connectionrefused'));
  await page.reload();
  await posterShown(page);
  const offline = new Set([name(await activeAlt(page))]);
  for (let i = 0; i < 20; i++) {
    const had = await page.evaluate(() => window.__draws.length);
    await page.clock.runFor(361_000); // past the longest retry backoff, so one failed tick per step
    await page.waitForFunction((n) => window.__draws.length > n, had, { timeout: 10000 });
    offline.add(name(await activeAlt(page)));
  }
  const allowed = [...T.G, ...T.PG];
  for (const t of offline) assert.ok(allowed.includes(t), `${t} shown offline above PG`);
  assert.ok(offline.size >= 2, `the offline rotation rotated: ${[...offline]}`);
  assert.match(await page.evaluate(() => document.getElementById('status').textContent), /Can't reach Jellyfin · showing cached posters/, 'the pill names the server');
  check(`20 offline rotations under PG: ${[...offline].sort().join(', ')}`);
});

jfCase('15 a stored server type this build lacks shows a connection error that names it, and connects to no Plex server', { settings: seed({ serverType: 'kodi' }) }, async ({ page, app }) => {
  const asked = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.port === String(app.mockPort) || u.port === String(app.jellyfinPort)) asked.push(r.url());
  });
  await page.goto(app.url);
  await page.waitForSelector('#empty:not([hidden])');
  const message = await page.textContent('#empty-message');
  assert.match(message, /"kodi"/);
  assert.equal((await stored(page)).serverType, 'kodi', 'the stored type is not rewritten');
  assert.deepEqual(asked, [], 'no server was asked');
  check(`the card says: ${message}`);
});

// ---------- layouts ----------

for (const [label, opts, settings] of [
  ['1920x1080', { viewport: { width: 1920, height: 1080 } }, {}],
  ['a phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, {}],
  ['rotation 90', { viewport: { width: 1280, height: 720 } }, { rotation: 90 }],
]) {
  jfCase(`16 Settings at ${label}`, { settings: seed(settings), ...opts }, async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    await openSettings(page);
    await testOk(page);
    await page.click('#connected-change');
    const fit = await page.evaluate(() => {
      const dialog = document.getElementById('settings');
      const within = (sel) => {
        const el = document.querySelector(sel);
        const r = el.getBoundingClientRect();
        return { sel, visible: !el.closest('[hidden]') && r.width > 0 && r.height > 0, inside: r.left >= -0.5 && r.right <= innerWidth + 0.5, height: r.height };
      };
      return {
        sideways: document.documentElement.scrollWidth - innerWidth,
        sheetSideways: dialog.scrollWidth - dialog.clientWidth,
        parts: ['.server-type', '#jf-address', '#signin-btn', '#jf-password summary', '#test-btn'].map(within),
        typeButtons: [...document.querySelectorAll('.server-type .seg-opt span')].map((e) => e.getBoundingClientRect().height),
      };
    });
    assert.ok(fit.sideways <= 1, `page scrolls sideways by ${fit.sideways}`);
    assert.ok(fit.sheetSideways <= 1, `sheet scrolls sideways by ${fit.sheetSideways}`);
    for (const p of fit.parts) assert.ok(p.visible && p.inside, `${p.sel} visible ${p.visible} inside ${p.inside}`);
    assert.ok(fit.parts[3].height >= 44, `the password summary is ${fit.parts[3].height}px tall`);
    assert.ok(fit.typeButtons.every((h) => h >= 40), `server type buttons ${fit.typeButtons}`);
    await shot(page, `jellyfin-settings-${label.replace(/\W+/g, '-')}`);
    check(`Settings at ${label}: the type choice, address, Quick Connect and password fit without sideways scroll`);
  });

  jfCase(`17 the first-run card with a Quick Connect code at ${label}`, { settings: { pixelShift: false, ...settings }, ...opts }, async ({ page, app }) => {
    await page.goto(app.url);
    await page.waitForSelector('#firstrun:not([hidden])');
    await page.check('input[name="firstrunType"][value="jellyfin"]');
    await page.fill('#firstrun-url', jf(app));
    await page.click('#firstrun-address input[type="submit"]');
    await page.waitForFunction(() => /^\d{6}$/.test(document.getElementById('signin-code-large').textContent), null, { timeout: 20000 });
    await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
    const m = await page.$eval('#signin-code-large', (el) => {
      const r = el.getBoundingClientRect();
      let node = el;
      while (node && getComputedStyle(node).transform === 'none') node = node.parentElement;
      let angle = 0;
      if (node) {
        const [a, b] = getComputedStyle(node).transform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
        angle = ((Math.round((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360;
      }
      return { fontPx: parseFloat(getComputedStyle(el).fontSize), fits: el.scrollWidth <= el.clientWidth, angle, onScreen: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5 };
    });
    assert.ok(m.fontPx >= 40, `code font ${m.fontPx}px`);
    assert.ok(m.fits && m.onScreen, `fits ${m.fits}, on screen ${m.onScreen}`);
    assert.equal(m.angle, settings.rotation ?? 0, 'the block is turned with the UI');
    await shot(page, `jellyfin-firstrun-${label.replace(/\W+/g, '-')}`);
    check(`the card at ${label}: the code is ${m.fontPx}px, on screen, turned ${m.angle} degrees`);
  });
}

// ---------- run ----------

const WORKERS = Number(process.env.E2E_JELLYFIN_WORKERS || 3);
if (process.env.E2E_JELLYFIN_ONLY) {
  const only = new RegExp(process.env.E2E_JELLYFIN_ONLY);
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
console.log(`all ${cases.length} jellyfin cases passed`);
