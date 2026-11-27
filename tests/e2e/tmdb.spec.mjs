// The TMDB source (R-TMDB-1, R-TMDB-2, D203, D209, D210) in the browser, against the mock TMDB (scripts/mock-tmdb.mjs, which serve.mjs --mock starts beside the
// mock Plex and Jellyfin servers and the e2e helpers route api.themoviedb.org and image.tmdb.org to). Every case has its own mock servers (serveArgs: []).
//
// Mock TMDB: the demo read access token (Bearer only) and the 32-character v3 key (api_key only). 24 movies: 1001 Paper Moon Rising G, 1002 Lantern Road PG,
// 1003 Northern Lights Cafe PG-13 (Drama, Comedy; 2022), 1004 Static Bloom R, 1005 Quiet Harbour "" (empty), 1006 Unrated Wanderer (no US entry), 1007 After Dark
// Reel (adult), 1008 Action Only PG-13 (Action; 2024), and 16 "Mock Feature n" PG (Comedy, Family; 2001 to 2016). 4 shows: Tiny Explorers TV-Y7 (Animation, Kids),
// Sunday Sketch TV-PG, Harbor Nights TV-MA, Unrated Frontier (no US rating).
//
// Nothing waits for a wall-clock time: every wait is on a state (a poster drawn, a dialog closed, a request seen) with a bound.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { API_KEY, TOKEN } from '../../scripts/mock-tmdb.mjs';
import { withApp } from './lib.mjs';

const cases = [];
const only = (process.env.E2E_TMDB_ONLY || '').split(',').filter(Boolean); // case numbers to run, for a probe of one rule ("2,15"); none means all
const tmdbCase = (name, opts, fn) => (only.length && !only.includes(name.split(' ')[0]) ? undefined : cases.push({ name, opts: { serveArgs: [], tmdb: true, ...opts }, fn }));
const check = (name) => console.log(`  ok  ${name}`);

const CREDIT = 'uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB';
const FILLER = Array.from({ length: 16 }, (_, i) => `Mock Feature ${i + 1}`);
const NAMES = {
  G: ['Paper Moon Rising'],
  PG: ['Lantern Road', ...FILLER],
  PG13: ['Northern Lights Cafe', 'Action Only'],
  R: ['Static Bloom'],
  UNRATED: ['Quiet Harbour', 'Unrated Wanderer'],
  ADULT: ['After Dark Reel'],
};
const ALL_MOVIES = Object.values(NAMES).flat();
const name = (alt) => (alt || '').replace(/^Poster: /, '');

const seed = (extra = {}) => ({
  serverType: 'tmdb',
  tmdbKey: TOKEN,
  libraryKey: 'movie/popular',
  libraryKeys: ['movie/popular'],
  libraryNames: ['Popular'],
  rotateSeconds: 3600,
  showNowPlaying: false,
  unwatchedOnly: false,
  pixelShift: false,
  ...extra,
});
const mockGet = (app, path) => fetch(`http://127.0.0.1:${app.tmdbPort}/__mock/${path}`).then((r) => r.json());
const posterShown = (page) => page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 20000 });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));
const index = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]'));
const history = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.shownAt') || '{}'));
const activeAlt = (page) => page.evaluate(() => document.querySelector('.poster-layer.active')?.alt || '');
const cardText = (page) => page.evaluate(() => document.getElementById('empty').textContent);

/** Records every request to a TMDB host: its path, parameters and whether it carried an Authorization header. */
const watchTmdb = (page) => {
  const seen = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname === 'api.themoviedb.org' || u.hostname === 'image.tmdb.org') seen.push({ host: u.hostname, path: u.pathname, params: Object.fromEntries(u.searchParams), bearer: req.headers().authorization ?? '', url: req.url() });
  });
  return seen;
};

/**
 * Counts the TMDB requests of a page that have been sent and not yet finished. `idle()` resolves when none is, seen twice with a round trip through the
 * page's frames between (a request the page issued in the same turn has then reached the count). The network guard (tests/e2e/lib.mjs) calls a request
 * that no route has answered when the case ends a request that left the machine, so a case ends only when every request has been answered (K48).
 */
const trackPending = (page) => {
  const open = new Set(); // the requests sent and not finished or failed, of the document now on the page
  const ours = (req) => ['api.themoviedb.org', 'image.tmdb.org'].includes(new URL(req.url()).hostname);
  let pending = 0;
  const count = () => (pending = open.size);
  page.on('request', (req) => ours(req) && (open.add(req), count()));
  page.on('requestfinished', (req) => (open.delete(req), count()));
  page.on('requestfailed', (req) => (open.delete(req), count()));
  // A reload drops what the old document had in flight, and the browser need not say so for each request: the new document starts from none.
  page.on('framenavigated', (frame) => frame === page.mainFrame() && (open.clear(), count()));
  const turn = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))).catch(() => {});
  return async () => {
    for (let quiet = 0; quiet < 2; ) {
      await waitUntil(`${pending} TMDB request(s) answered`, async () => pending === 0);
      await turn();
      quiet = pending === 0 ? quiet + 1 : 0;
    }
  };
};

/** Keeps what a failing case needs to be understood: the last requests of the page (path only), its console errors and uncaught errors. `trail()` words them with the card, the pill and the notice. */
const trailOf = (page) => {
  const requests = [];
  const problems = [];
  page.on('request', (req) => !/^\/(js|css|assets)\//.test(new URL(req.url()).pathname) && requests.push(`${req.method()} ${new URL(req.url()).host}${new URL(req.url()).pathname}`)); // the page's own files are not the story
  page.on('console', (msg) => msg.type() === 'error' && problems.push(msg.text().slice(0, 200)));
  page.on('pageerror', (err) => problems.push(String(err).slice(0, 200)));
  return async () => {
    const shown = await page
      .evaluate(() => ({
        card: document.getElementById('empty')?.hidden ? '(hidden)' : document.getElementById('empty')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 300),
        status: document.getElementById('status')?.textContent,
        toast: document.getElementById('toast')?.hidden ? '(none)' : document.getElementById('toast')?.textContent,
        settingsOpen: document.getElementById('settings')?.open,
        poster: document.querySelector('.poster-layer.active')?.alt || '(none)',
      }))
      .catch(() => ({ page: 'closed' }));
    return `page: ${JSON.stringify(shown)}\nlast requests: ${JSON.stringify(requests.slice(-40))}\nconsole: ${JSON.stringify(problems.slice(-10))}`;
  };
};

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

const openSettings = async (page) => {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForSelector('#settings[open]');
};
const save = async (page) => {
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
};
const testText = (page) => page.evaluate(() => document.getElementById('test-result').textContent);
const testOk = (page) => page.waitForFunction(() => document.getElementById('test-result').textContent.startsWith('✓'), null, { timeout: 20000 });
const dayMs = 86_400_000;

// ---------- the choice, the key, Test connection ----------

tmdbCase('1 a display with nothing set: choose TMDB, enter the demo token, Test connection says connected, and Popular shows posters from the mock', { settings: { pixelShift: false, showNowPlaying: false } }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await recordDraws(page);
  await page.goto(app.url);
  await page.waitForSelector('#empty:not([hidden])');
  await openSettings(page);
  assert.deepEqual(await page.$$eval('input[name="serverTypePick"]', (els) => els.map((e) => e.value)), ['plex', 'jellyfin', 'emby'], 'the three media servers are as they were');
  assert.equal(await page.isVisible('#tmdb-connection'), false, 'no key field before TMDB is chosen');
  assert.equal(await page.isVisible('#tmdb-credit'), false, 'and no credit while TMDB is neither the type nor has a key');
  await page.check('input[name="serverTypeTmdb"]');
  assert.equal(await page.$eval('input[name="serverType"]', (el) => el.value), 'tmdb');
  assert.equal(await page.isChecked('input[name="serverTypePick"][value="plex"]'), false, 'the media servers are unchecked');
  assert.equal(await page.isVisible('#tmdb-connection'), true);
  assert.equal(await page.isVisible('#signin-btn'), false, 'no sign-in code');
  assert.equal(await page.isVisible('#server-add'), false, 'TMDB cannot be added as a server, and no server is added to it');
  assert.equal(await page.isVisible('#library-list'), false);
  assert.equal(await page.inputValue('#tmdb-list'), 'movie/popular', 'Popular is chosen to begin with');
  assert.equal((await stored(page)).serverType ?? 'plex', 'plex', 'choosing stores nothing');
  await page.fill('input[name="tmdbKey"]', TOKEN);
  await page.click('#test-btn');
  await testOk(page);
  assert.equal(await testText(page), '✓ Connected to TMDB');
  const auth = seen.filter((r) => r.path === '/3/authentication');
  assert.equal(auth.length, 1, 'Test connection asks GET /3/authentication');
  assert.equal(auth[0].bearer, `Bearer ${TOKEN}`);
  assert.equal(auth[0].params.api_key, undefined);
  await save(page);
  await posterShown(page);
  const picked = await picks(page, 10);
  for (const title of picked) assert.ok(ALL_MOVIES.includes(title) && !NAMES.ADULT.includes(title), `${title} is a mock movie and not the adult one`);
  const s = await stored(page);
  assert.deepEqual([s.serverType, s.tmdbKey, s.libraryKey, s.libraryKeys], ['tmdb', TOKEN, 'movie/popular', ['movie/popular']]);
  const lists = seen.filter((r) => r.path === '/3/movie/popular');
  assert.ok(lists.length > 0);
  for (const r of lists) assert.deepEqual([r.params.include_adult, r.params.language, r.bearer, r.params.api_key], ['false', 'en-US', `Bearer ${TOKEN}`, undefined]);
  for (const r of seen.filter((x) => x.host === 'image.tmdb.org')) assert.ok(!r.url.includes(TOKEN) && !r.url.includes('api_key') && r.bearer === '', 'an image request carries no key');
  assert.ok(seen.some((r) => r.host === 'image.tmdb.org'), 'posters came from the image host');
  assert.equal(await page.locator('[data-action="playnow"]').count(), 0, 'Play now is not offered for a TMDB poster');
  check('1 choose TMDB, the demo token, connected, Popular posters from the mock; Bearer on the API, no key on an image');
});

tmdbCase('2 the 32-character v3 key goes as api_key and no Authorization header; a pasted "Bearer <token>" goes as one Bearer header', { settings: { pixelShift: false, showNowPlaying: false } }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await recordDraws(page);
  await page.goto(app.url);
  await page.waitForSelector('#empty:not([hidden])');
  await openSettings(page);
  await page.check('input[name="serverTypeTmdb"]');
  await page.fill('input[name="tmdbKey"]', `  ${API_KEY}  `);
  await page.click('#test-btn');
  await testOk(page);
  assert.deepEqual(seen.filter((r) => r.host === 'api.themoviedb.org').map((r) => [r.path, r.params.api_key, r.bearer]).sort(), [['/3/authentication', API_KEY, ''], ['/3/genre/movie/list', API_KEY, '']], 'Test connection, then the genres of the list');
  await save(page);
  await posterShown(page);
  const api = seen.filter((r) => r.host === 'api.themoviedb.org');
  assert.ok(api.length > 2);
  for (const r of api) assert.deepEqual([r.params.api_key, r.bearer], [API_KEY, ''], r.path);
  for (const r of seen.filter((x) => x.host === 'image.tmdb.org')) assert.ok(!r.url.includes(API_KEY), 'a v3 key is never in an image address');
  assert.equal((await stored(page)).tmdbKey, API_KEY, 'the key is stored trimmed');
  await openSettings(page);
  await testOk(page); // opening the sheet tests the saved connection by itself
  seen.length = 0;
  await page.fill('input[name="tmdbKey"]', `Bearer ${TOKEN}`);
  await page.click('#test-btn');
  await testOk(page);
  assert.deepEqual(seen.filter((r) => r.path === '/3/authentication').map((r) => [r.bearer, r.params.api_key]), [[`Bearer ${TOKEN}`, undefined]], 'one Bearer prefix');
  // A Save of only the key rebuilds the source: the next list request uses the new key's form.
  seen.length = 0;
  const drawn = await page.evaluate(() => window.__draws.length);
  await save(page);
  // The forced draw after the Save ends the pool build (every page and lookup of it is answered before a poster is picked): the case ends on that state.
  await page.waitForFunction((n) => window.__draws.length > n, drawn, { timeout: 20000 });
  assert.ok(seen.some((r) => r.path === '/3/movie/popular'));
  for (const r of seen.filter((x) => x.host === 'api.themoviedb.org')) assert.deepEqual([r.bearer, r.params.api_key], [`Bearer ${TOKEN}`, undefined], r.path);
  assert.equal((await stored(page)).tmdbKey, `Bearer ${TOKEN}`, 'stored as typed');
  check('2 a v3 key is api_key with no header; "Bearer <token>" is one Bearer header');
});

tmdbCase('3 a key TMDB refuses: Test connection says so with Sign in again; any other string is the token, and the token sent as api_key would be 401', { settings: { pixelShift: false, showNowPlaying: false } }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForSelector('#empty:not([hidden])');
  await openSettings(page);
  await page.check('input[name="serverTypeTmdb"]');
  await page.click('#test-btn');
  assert.equal(await testText(page), 'Enter your TMDB key first.');
  await page.fill('input[name="tmdbKey"]', 'not-a-key');
  await page.click('#test-btn');
  await page.waitForFunction(() => document.getElementById('test-result').textContent.startsWith('✗'), null, { timeout: 20000 });
  assert.match(await testText(page), /TMDB rejected the key/);
  assert.deepEqual(await page.$$eval('#test-result button', (els) => els.map((e) => e.textContent.trim())), ['Sign in again']);
  await page.click('#test-result button');
  await page.waitForFunction(() => /did not accept the key/.test(document.getElementById('test-result').textContent));
  assert.equal(await page.evaluate(() => document.activeElement?.name), 'tmdbKey', 'Sign in again puts the cursor in the key field');
  check('3 a refused key: the verdict names TMDB, and Sign in again goes to the key');
});

// ---------- what is drawn ----------

tmdbCase('4 Discover with a genre shows only that genre; AND needs every ticked genre, OR any; the years are inclusive and a From later than To is turned round', { settings: seed({ libraryKey: 'discover/movie', libraryKeys: ['discover/movie'], libraryNames: ['Discover movies'], genres: [{ key: '28', title: 'Action' }] }) }, async ({ page, app }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  for (const title of await picks(page, 4)) assert.equal(title, 'Action Only', 'Action is the one genre ticked');
  const set = async (patch) => {
    await openSettings(page);
    await page.evaluate((p) => {
      document.getElementById('tmdb-list').value = p.list ?? document.getElementById('tmdb-list').value;
      document.getElementById('tmdb-mode').value = p.mode ?? 'or';
      document.getElementById('tmdb-from').value = p.from ?? '';
      document.getElementById('tmdb-to').value = p.to ?? '';
      for (const id of ['tmdb-list', 'tmdb-mode', 'tmdb-from', 'tmdb-to']) document.getElementById(id).dispatchEvent(new Event('change', { bubbles: true }));
    }, patch);
    await save(page);
  };
  // The sheet lists the genres of movies; tick Drama and Comedy with "every".
  await openSettings(page);
  await page.waitForFunction(() => document.querySelectorAll('#genre-list input').length > 3);
  assert.deepEqual(await page.$$eval('#genre-list li span', (els) => els.map((e) => e.textContent.trim()).sort()), ['Action', 'Animation', 'Comedy', 'Drama', 'Family', 'Horror']);
  await page.uncheck('#genre-list input[data-title="Action"]');
  await page.check('#genre-list input[data-title="Drama"]');
  await page.check('#genre-list input[data-title="Comedy"]');
  await page.evaluate(() => {
    document.getElementById('tmdb-mode').value = 'and';
    document.getElementById('tmdb-mode').dispatchEvent(new Event('change', { bubbles: true }));
  });
  await save(page);
  await posterShown(page);
  assert.equal((await stored(page)).libraryKey, 'discover/movie?mode=and', 'the choice is the library key');
  for (const title of await picks(page, 4)) assert.equal(title, 'Northern Lights Cafe', 'Drama AND Comedy is the one title with both');
  // Animation or Action: three titles, and every one of them is drawn.
  await openSettings(page);
  await page.uncheck('#genre-list input[data-title="Drama"]');
  await page.uncheck('#genre-list input[data-title="Comedy"]');
  await page.check('#genre-list input[data-title="Animation"]');
  await page.check('#genre-list input[data-title="Action"]');
  await save(page);
  assert.equal((await stored(page)).libraryKey, 'discover/movie?mode=and');
  await set({ list: 'discover/movie', mode: 'or' });
  assert.equal((await stored(page)).libraryKey, 'discover/movie');
  assert.deepEqual([...new Set(await picks(page, 9))].sort(), ['Action Only', 'Lantern Road', 'Paper Moon Rising'], 'Animation OR Action');
  // The years: 2023 to 2024 are two titles (Static Bloom, 2023, and Action Only, 2024); the genres are ticked off.
  await openSettings(page);
  await page.uncheck('#genre-list input[data-title="Animation"]');
  await page.uncheck('#genre-list input[data-title="Action"]');
  await save(page);
  await set({ list: 'discover/movie', from: '2024', to: '2023' });
  assert.equal((await stored(page)).libraryKey, 'discover/movie?from=2024&to=2023');
  assert.deepEqual([...new Set(await picks(page, 6))].sort(), ['Action Only', 'Static Bloom'], 'From 2024 To 2023 is 2023 to 2024');
  await set({ list: 'discover/movie', from: '2024', to: '2024' });
  assert.deepEqual([...new Set(await picks(page, 4))], ['Action Only'], 'a single year is inclusive');
  check('4 Discover: a genre, AND and OR, the years inclusive and turned round');
});

tmdbCase('5 Discover TV shows shows, with TV genres; a list of TV shows shows shows', { settings: seed({ libraryKey: 'discover/tv', libraryKeys: ['discover/tv'], libraryNames: ['Discover TV'], genres: [{ key: '16', title: 'Animation' }] }) }, async ({ page, app }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  for (const title of await picks(page, 3)) assert.equal(title, 'Tiny Explorers');
  await openSettings(page);
  await page.waitForFunction(() => [...document.querySelectorAll('#genre-list li span')].some((e) => e.textContent.trim() === 'Kids'));
  assert.deepEqual(await page.$$eval('#genre-list li span', (els) => els.map((e) => e.textContent.trim()).sort()), ['Animation', 'Comedy', 'Drama', 'Kids', 'Sci-Fi & Fantasy'], 'the genre list of shows');
  await page.selectOption('#tmdb-list', 'movie/popular');
  assert.equal(await page.$$eval('#genre-list input:checked', (els) => els.length), 0, 'a show genre id is not a movie\'s: moving between types clears the genres');
  await page.selectOption('#tmdb-list', 'tv/popular');
  await page.waitForFunction(() => [...document.querySelectorAll('#genre-list li span')].some((e) => e.textContent.trim() === 'Kids'));
  assert.equal(await page.$$eval('#genre-list input:checked', (els) => els.length), 0);
  await save(page);
  await posterShown(page);
  const shows = new Set(await picks(page, 12));
  assert.deepEqual([...shows].sort(), ['Harbor Nights', 'Sunday Sketch', 'Tiny Explorers', 'Unrated Frontier']);
  check('5 Discover TV and a TV list');
});

tmdbCase('6 with the limit PG an R-certified movie, an uncertified movie and a TV-MA show never appear; every title is read before it can be shown', { settings: seed({ maxContentRating: 'PG' }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  const drawn = new Set(await picks(page, 40));
  const allowed = new Set([...NAMES.G, ...NAMES.PG]);
  for (const title of drawn) assert.ok(allowed.has(title), `${title} is within PG`);
  assert.ok(drawn.size > 4, 'the pool is the PG titles');
  for (const id of [1003, 1004, 1005, 1006, 1008]) assert.ok(seen.some((r) => r.path === `/3/movie/${id}` && r.params.append_to_response === 'release_dates'), `title ${id} was read before it could be shown`);
  assert.ok(!seen.some((r) => /\/(release_dates|content_ratings)$/.test(r.path)), 'a certification is read through the details request, never its own (D215 1)');
  assert.ok(!seen.some((r) => r.path === '/3/movie/1007'), 'an adult title is dropped before any lookup');
  // The same household on TV: TV-Y7 and TV-PG pass PG; TV-MA and the unrated show do not.
  await openSettings(page);
  await page.selectOption('#tmdb-list', 'tv/popular');
  await save(page);
  await posterShown(page);
  const shows = new Set(await picks(page, 20));
  assert.deepEqual([...shows].sort(), ['Sunday Sketch', 'Tiny Explorers']);
  assert.ok(seen.some((r) => r.path === '/3/tv/2003' && r.params.append_to_response === 'content_ratings') && seen.some((r) => r.path === '/3/tv/2004' && r.params.append_to_response === 'content_ratings'), 'every show is read at its details with content_ratings');
  // Lowering the limit to G hides the rest at once, with the screen re-checked.
  await openSettings(page);
  await page.selectOption('#tmdb-list', 'movie/popular');
  await page.selectOption('select[name="maxContentRating"]', 'G');
  await save(page);
  await posterShown(page);
  for (const title of await picks(page, 3)) assert.equal(title, 'Paper Moon Rising', 'at G only the G title');
  check('6 limit PG: no R, no uncertified, no TV-MA; each title read; G leaves one');
});

tmdbCase('7 a movie with a PG-13 and an R US entry is refused at PG-13 (D210 1); with the R entry away it is shown', { settings: seed({ maxContentRating: 'PG-13', libraryKey: 'discover/movie?from=2022&to=2022', libraryKeys: ['discover/movie?from=2022&to=2022'], genres: [{ key: '18', title: 'Drama' }] }) }, async ({ page, app }) => {
  const dates = (...certs) => ({ id: 1003, results: [{ iso_3166_1: 'GB', release_dates: [{ certification: '15' }] }, { iso_3166_1: 'US', release_dates: certs.map((certification) => ({ certification, type: 3 })) }] });
  let answer = dates('PG-13', 'R');
  await page.route(/\/3\/movie\/1003(\?|$)/, (route) =>
    route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ id: 1003, release_dates: { results: answer.results } }) }),
  );
  await recordDraws(page);
  await page.goto(app.url);
  await page.waitForSelector('#empty:not([hidden])');
  assert.match(await cardText(page), /No posters found/, 'the only title of 2022 has an R entry: nothing is shown');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.poster-layer.active')].length), 0);
  answer = dates('PG-13');
  await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
  await posterShown(page);
  assert.equal(name(await activeAlt(page)), 'Northern Lights Cafe', 'with PG-13 alone it is shown');
  check('7 PG-13 and R US entries: refused at PG-13; PG-13 alone is shown');
});

// ---------- failures ----------

tmdbCase('8 /__mock/badkey shows the Sign in again card, and Sign in again goes to the key field', { settings: seed() }, async ({ page, app }) => {
  await mockGet(app, 'badkey');
  await page.goto(app.url);
  await page.waitForSelector('#empty:not([hidden])');
  assert.match(await cardText(page), /TMDB rejected the key/);
  assert.deepEqual(await page.$$eval('#empty-actions button', (els) => els.map((e) => e.textContent.trim())), ['Sign in again']);
  assert.equal(await page.evaluate(() => document.querySelector('#empty [data-action="settings"]').textContent.trim()), 'Open settings');
  await page.click('#empty button:text-is("Sign in again")');
  await page.waitForSelector('#settings[open]');
  await page.waitForFunction(() => /did not accept the key/.test(document.getElementById('test-result').textContent), null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => document.activeElement?.name), 'tmdbKey');
  check('8 badkey: the Sign in again card');
});

tmdbCase('9 /__mock/down shows the server-down card naming TMDB, and the status pill says so; a refresh recovers', { settings: seed() }, async ({ page, app }) => {
  await mockGet(app, 'down');
  await page.goto(app.url);
  await page.waitForSelector('#empty:not([hidden])');
  assert.match(await cardText(page), /TMDB returned HTTP 503/);
  assert.deepEqual(await page.$$eval('#empty-actions button', (els) => els.map((e) => e.textContent.trim())), []);
  await page.waitForFunction(() => /Can't reach TMDB/.test(document.getElementById('status').textContent), null, { timeout: 10000 });
  await mockGet(app, 'reset');
  await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
  await posterShown(page);
  check('9 down: the card and the pill name TMDB, and a refresh recovers');
});

tmdbCase('10 a rate limit (429) on the certification lookups hides the titles, the card does not claim the key is bad, and the next pool build asks again', { settings: seed({ maxContentRating: 'PG' }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  let rateLimited = true; // the page's own route answers the lookups until the spec lets the mock answer them (route.fallback)
  await page.route(/\/3\/(movie|tv)\/\d+(\?|$)/, (route) => (rateLimited ? route.fulfill({ status: 429, headers: { 'access-control-allow-origin': '*', 'retry-after': '1' }, contentType: 'application/json', body: '{"status_code":25}' }) : route.fallback()));
  await page.goto(app.url);
  await page.waitForSelector('#empty:not([hidden])');
  assert.doesNotMatch(await cardText(page), /rejected the key/);
  assert.match(await cardText(page), /TMDB returned HTTP 429/);
  assert.deepEqual(await page.$$eval('#empty-actions button', (els) => els.map((e) => e.textContent.trim())), [], 'a 429 is not an auth error: no Sign in again');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.poster-layer.active')].length), 0, 'no title is shown on a certification that was not read');
  const asked = seen.filter((r) => /^\/3\/(movie|tv)\/\d+$/.test(r.path)).length;
  assert.ok(asked > 0);
  rateLimited = false;
  await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
  await posterShown(page);
  assert.ok(seen.filter((r) => /^\/3\/(movie|tv)\/\d+$/.test(r.path)).length > asked, 'the lookups were made again');
  check('10 429 on the lookups hides the titles, is not auth, and recovers');
});

tmdbCase('11 online again after the mock was down, the cached posters stop; offline, a cached TMDB poster shows until it is 180 days old and not after: only expired posters show the server-down card (D210 7)', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await waitUntil('a cached poster', async () => (await index(page)).length > 0);
  const before = await index(page);
  assert.ok(before.every((e) => /^(movie|tv):\d+$/.test(e.ratingKey) && typeof e.savedAt === 'number'));
  await mockGet(app, 'down');
  await page.reload();
  await page.waitForFunction(() => /showing cached posters/.test(document.getElementById('status').textContent), null, { timeout: 20000 });
  await posterShown(page);
  assert.ok(ALL_MOVIES.includes(name(await activeAlt(page))), 'offline, a fresh cached poster shows');
  // Make every cached entry 180 days old exactly: expired, whatever was drawn before.
  await page.evaluate((day) => {
    const list = JSON.parse(localStorage.getItem('plexPoster.posterIndex'));
    for (const e of list) e.savedAt = Date.now() - 180 * day;
    localStorage.setItem('plexPoster.posterIndex', JSON.stringify(list));
  }, dayMs);
  await page.reload();
  await page.waitForSelector('#empty:not([hidden])');
  assert.match(await cardText(page), /TMDB returned HTTP 503/);
  await page.waitForFunction(() => /Can't reach TMDB/.test(document.getElementById('status').textContent), null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.poster-layer.active')].length), 0, 'no expired poster is shown, offline included');
  // A day inside the limit is still served.
  await page.evaluate((day) => {
    const list = JSON.parse(localStorage.getItem('plexPoster.posterIndex'));
    for (const e of list) e.savedAt = Date.now() - 179 * day;
    localStorage.setItem('plexPoster.posterIndex', JSON.stringify(list));
  }, dayMs);
  await page.reload();
  await posterShown(page);
  // Online again: an expired image is fetched again and stored with a new time.
  await mockGet(app, 'reset');
  await page.evaluate((day) => {
    const list = JSON.parse(localStorage.getItem('plexPoster.posterIndex'));
    for (const e of list) e.savedAt = Date.now() - 200 * day;
    localStorage.setItem('plexPoster.posterIndex', JSON.stringify(list));
  }, dayMs);
  await page.reload();
  await posterShown(page);
  const shown = name(await activeAlt(page));
  await waitUntil('the shown poster stored again', async () => (await index(page)).some((e) => e.title === shown && Date.now() - e.savedAt < dayMs));
  check('11 offline: fresh cached shows, 180 days exactly is the server-down card, 179 shows, online it is fetched again');
});

// ---------- the key and the credit ----------

tmdbCase('12 Settings\' TMDB section shows the credit sentence and the logo; the display shows no TMDB mark; Diagnostics shows the key\'s first four characters only', { settings: seed({ showNowPlaying: true }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  const outside = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('dialog')];
    const inDialog = (el) => dialogs.some((d) => d.contains(el));
    const texts = [...document.querySelectorAll('body *')].filter((el) => !inDialog(el) && el.childElementCount === 0 && /TMDB|themoviedb/i.test(el.textContent) && !/^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName) && el.getClientRects().length > 0);
    const marks = [...document.images].filter((i) => !inDialog(i) && /tmdb/i.test(`${i.currentSrc} ${i.alt}`) && !i.classList.contains('poster-layer'));
    return { texts: texts.map((e) => e.textContent.trim().slice(0, 60)), marks: marks.map((i) => i.src) };
  });
  assert.deepEqual(outside, { texts: [], marks: [] }, 'the display carries no TMDB mark, text or logo');
  await openSettings(page);
  assert.equal(await page.isVisible('#tmdb-credit'), true);
  assert.match(await page.textContent('#tmdb-credit'), new RegExp(CREDIT));
  const logo = await page.$eval('#tmdb-credit img', (img) => ({ ok: img.complete && img.naturalWidth > 0, alt: img.alt, w: img.getBoundingClientRect().width, src: img.getAttribute('src') }));
  assert.deepEqual([logo.ok, logo.alt, logo.src], [true, 'TMDB', 'assets/tmdb/tmdb-logo.svg']);
  assert.ok(logo.w > 0 && logo.w < 120, 'the logo is small');
  assert.equal(await page.isVisible('input[name="showNowPlaying"]'), false, 'the media-server rows are not offered');
  assert.equal(await page.isVisible('input[name="unwatchedOnly"]'), false);
  assert.equal(await page.inputValue('input[name="tmdbKey"]'), TOKEN);
  assert.equal(await page.getAttribute('input[name="tmdbKey"]', 'type'), 'password');
  await page.click('#tmdb-key-toggle');
  assert.equal(await page.getAttribute('input[name="tmdbKey"]', 'type'), 'text', 'Show (no PIN is set here)');
  await page.click('#tmdb-key-toggle');
  assert.equal(await page.getAttribute('input[name="tmdbKey"]', 'type'), 'password');
  await page.click('#settings-cancel');
  await page.evaluate(() => document.querySelector('[data-action="diagnostics"]').click());
  await page.waitForSelector('#diagnostics[open]');
  const diag = await page.evaluate(() => document.getElementById('diagnostics').textContent);
  assert.ok(diag.includes(`${TOKEN.slice(0, 4)}…`) && !diag.includes(TOKEN.slice(0, 5)), 'the first 4 characters of the key and no more');
  assert.match(diag, /Server\s*TMDB/);
  assert.match(diag, /Poster.* — random/, 'a TMDB poster is a random pick: nothing is now playing');
  check('12 the credit and logo in Settings only; Diagnostics shows 4 characters; nothing is now playing');
});

tmdbCase('13 the credit is in Settings for a media-server household only when a TMDB key is set', { settings: (app) => ({ serverType: 'plex', plexToken: 'demo-token', serverUrl: `http://127.0.0.1:${app.mockPort}`, libraryKey: '1', libraryKeys: ['1'], rotateSeconds: 3600, showNowPlaying: false, pixelShift: false }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.equal(await page.isVisible('#tmdb-credit'), false, 'no TMDB key, not TMDB: no credit');
  await page.evaluate(() => (document.getElementById('manual-connection').open = true));
  await page.evaluate((key) => {
    const el = document.querySelector('input[name="tmdbKey"]');
    el.value = key;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, TOKEN);
  assert.equal(await page.isVisible('#tmdb-credit'), true, 'a TMDB key is set: the credit shows');
  check('13 the credit follows the type or the key');
});

tmdbCase('14 the key is kept out of an export unless the PIN is given; an import of a file with TMDB as an extra server drops it with a toast', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  const exportFile = async (withSecrets) => {
    if (withSecrets !== (await page.isChecked('#export-secrets'))) await page.evaluate(() => document.getElementById('export-secrets').click());
    const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('export-btn').click())]);
    return readFileSync(await download.path(), 'utf8');
  };
  const plain = await exportFile(false);
  assert.ok(!plain.includes(TOKEN) && !('tmdbKey' in JSON.parse(plain).settings), 'no key in the file without the PIN step');
  const secret = await exportFile(true);
  assert.equal(JSON.parse(secret).settings.tmdbKey, TOKEN, 'with the secrets box, the key is in the file as plain text');
  const file = { format: 'plex-poster-display/settings', version: 1, settings: { serverType: 'plex', serverUrl: 'http://127.0.0.1:1', servers: [{ id: 'x', type: 'tmdb', url: 'http://x.test', token: 't', name: 'TMDB' }] } };
  await page.setInputFiles('#import-file', { name: 'f.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.waitForFunction(() => /TMDB cannot be one of several servers/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });
  assert.equal(await page.isVisible('#server-list'), false, 'no extra server came of it');
  check('14 export without the key unless asked; an import with TMDB as an extra server drops it with a toast');
});

// ---------- the type switch (R-SRC-2, D210 5) ----------

tmdbCase('15 Plex to TMDB and back clears the offline cache, the pin and the history each way, and the TMDB key survives', {
  settings: (app) => ({ serverType: 'plex', plexToken: 'demo-token', serverUrl: `http://127.0.0.1:${app.mockPort}`, libraryKey: '1', libraryKeys: ['1'], libraryNames: ['Movies'], tmdbKey: TOKEN, rotateSeconds: 3600, showNowPlaying: false, unwatchedOnly: false, noRepeatDays: 7, weighting: 'rated', pixelShift: false }),
}, async ({ page, app }) => {
  const plexKeys = (list) => list.every((k) => /^\d+$/.test(k));
  const tmdbKeys = (list) => list.every((k) => /^(movie|tv):\d+$/.test(k));
  await page.goto(app.url);
  await posterShown(page);
  await page.evaluate(() => document.querySelector('[data-action="pin"]').click());
  await waitUntil('a pin', async () => (await stored(page)).staticRatingKey);
  await waitUntil('a cached Plex poster', async () => (await index(page)).length > 0);
  await waitUntil('a history entry', async () => Object.keys(await history(page)).length > 0);
  assert.ok(plexKeys((await index(page)).map((e) => e.ratingKey)) && plexKeys(Object.keys(await history(page))) && /^\d+$/.test((await stored(page)).staticRatingKey), 'Plex ids to begin with');

  // To TMDB.
  await openSettings(page);
  await page.check('input[name="serverTypeTmdb"]');
  assert.equal(await page.inputValue('input[name="tmdbKey"]'), TOKEN, 'the key typed earlier is in the field');
  await page.click('#test-btn');
  await testOk(page);
  await save(page);
  await posterShown(page);
  await waitUntil('a cached TMDB poster', async () => (await index(page)).length > 0);
  let s = await stored(page);
  assert.deepEqual([s.serverType, s.staticRatingKey, s.tmdbKey, s.libraryKey], ['tmdb', '', TOKEN, 'movie/popular'], 'the pin is cleared and the key kept');
  assert.ok(tmdbKeys((await index(page)).map((e) => e.ratingKey)), 'the offline cache holds no Plex poster');
  await waitUntil('a TMDB history', async () => Object.keys(await history(page)).length > 0);
  assert.ok(tmdbKeys(Object.keys(await history(page))), 'the history holds no Plex title');

  // A TMDB pin, then back to Plex.
  await page.evaluate(() => document.querySelector('[data-action="pin"]').click());
  await waitUntil('a TMDB pin', async () => /^(movie|tv):\d+$/.test((await stored(page)).staticRatingKey));
  await page.waitForSelector('[data-action="pin"][aria-pressed="true"]'); // the pin is applied: the button says so
  const pinned = name(await activeAlt(page));
  const pinKey = (await stored(page)).staticRatingKey;
  const seen = watchTmdb(page);
  await page.reload();
  // The state that proves it: the poster layer on show is the pinned title's and has decoded (its details were read by id, then its image).
  await page
    .waitForFunction((title) => {
      const layer = document.querySelector('.poster-layer.active');
      return layer?.alt === `Poster: ${title}` && layer.naturalWidth > 0;
    }, pinned, { timeout: 20000 })
    .catch(async (err) => assert.fail(`the pinned poster "${pinned}" (${pinKey}) did not come back after a reload: ${err.message}\nrequests: ${JSON.stringify(seen.map((r) => r.path))}\ncard: ${await cardText(page)}\nstatus: ${await page.evaluate(() => document.getElementById('status').textContent)}`));
  assert.ok(seen.some((r) => r.path === `/3/${pinKey.replace(':', '/')}`), 'it was read again by its id');
  await openSettings(page);
  await page.check('input[name="serverTypePick"][value="plex"]');
  assert.equal(await page.isVisible('#tmdb-connection'), false);
  assert.equal(await page.inputValue('input[name="tmdbKey"]'), TOKEN, 'the key is still in the form behind it');
  await page.evaluate(() => (document.getElementById('manual-connection').open = true));
  await page.fill('input[name="plexToken"]', 'demo-token');
  await page.fill('input[name="serverUrl"]', `http://127.0.0.1:${app.mockPort}`);
  await page.click('#test-btn');
  await testOk(page);
  await save(page);
  await posterShown(page);
  await waitUntil('a cached Plex poster again', async () => (await index(page)).length > 0);
  s = await stored(page);
  assert.deepEqual([s.serverType, s.staticRatingKey, s.tmdbKey], ['plex', '', TOKEN], 'the pin is cleared again and the key survived the switch back');
  assert.ok(plexKeys((await index(page)).map((e) => e.ratingKey)), 'no TMDB poster is left in the cache');
  assert.ok(plexKeys(Object.keys(await history(page))), 'no TMDB title is left in the history');
  check('15 Plex to TMDB and back: cache, pin and history cleared each way; the key kept');
});

tmdbCase('16 TMDB is not offered as an extra server, and cannot be chosen while other servers are in the list', {
  settings: (app) => ({ serverType: 'plex', plexToken: 'demo-token', serverUrl: `http://127.0.0.1:${app.mockPort}`, serverId: 'mock', libraryKey: '1', libraryKeys: ['1'], rotateSeconds: 3600, showNowPlaying: false, pixelShift: false, servers: [{ id: `9${'1'.padStart(31, '0')}`, type: 'jellyfin', url: `http://127.0.0.1:${app.jellyfinPort}`, token: 'jf-demo-token', userId: '', name: 'Mock Jellyfin' }] }),
}, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.deepEqual(await page.$$eval('input[name="addTypePick"]', (els) => els.map((e) => e.value)), ['plex', 'jellyfin', 'emby'], 'Add a server offers no TMDB');
  // The sheet is drawn as it opens, and again when its connection test answers: wait for the state, then assert it.
  await page.waitForFunction(() => document.querySelector('input[name="serverTypeTmdb"]').disabled && /cannot be one of several servers/.test(document.getElementById('tmdb-pick-help').textContent), null, { timeout: 20000 });
  assert.equal(await page.isDisabled('input[name="serverTypeTmdb"]'), true, 'TMDB is not offered while there are two servers');
  assert.match(await page.textContent('#tmdb-pick-help'), /cannot be one of several servers/);
  check('16 no route makes TMDB one of several servers');
});

tmdbCase('18 moving to TMDB sets the media server\'s selection aside and moving back restores it; nothing is stored until Save', {
  settings: (app) => ({ serverType: 'plex', plexToken: 'demo-token', serverUrl: `http://127.0.0.1:${app.mockPort}`, libraryKey: '3', libraryKeys: ['3'], libraryNames: ['Kids Movies'], genres: [{ key: 'action', title: 'Action' }], ratings: ['G'], rotateSeconds: 3600, showNowPlaying: false, pixelShift: false }),
}, async ({ page, app }) => {
  await page.goto(app.url);
  await openSettings(page);
  await page.waitForFunction(() => document.querySelectorAll('#library-list input').length > 0);
  assert.deepEqual(await page.$$eval('#library-list input:checked', (els) => els.map((e) => e.value)), ['3']);
  assert.deepEqual(await page.$$eval('#genre-list input:checked', (els) => els.map((e) => e.dataset.title)), ['Action']);
  await page.check('input[name="serverTypeTmdb"]');
  assert.equal(await page.inputValue('#tmdb-list'), 'movie/popular', 'a library of the media server is no TMDB list: the default list');
  assert.equal(await page.$$eval('#genre-list input', (els) => els.length), 0, 'and its genres are not carried over');
  assert.deepEqual(await page.$$eval('#rating-list input:checked', (els) => els.map((e) => e.value)), ['G'], 'a rating means the same everywhere');
  await page.check('input[name="serverTypePick"][value="plex"]');
  assert.deepEqual(await page.$$eval('#library-list input:checked', (els) => els.map((e) => e.value)), ['3'], 'back: the library is as it was');
  assert.deepEqual(await page.$$eval('#genre-list input:checked', (els) => els.map((e) => e.dataset.title)), ['Action']);
  assert.equal(await page.inputValue('input[name="plexToken"]'), 'demo-token', 'and so is the sign-in');
  await page.check('input[name="serverTypeTmdb"]');
  await page.click('#settings-cancel');
  const s = await stored(page);
  assert.deepEqual([s.serverType, s.libraryKey, s.genres.map((g) => g.title)], ['plex', '3', ['Action']], 'Cancel stored nothing');
  check('18 the selection moves with the type, and Cancel keeps the media server\'s');
});

tmdbCase('19 a TMDB display with no key asks for it in Settings: no plex.tv code, and a Save without a key says so', { settings: { pixelShift: false, showNowPlaying: false } }, async ({ page, app }) => {
  const outside = [];
  page.on('request', (req) => new URL(req.url()).hostname === 'plex.tv' && outside.push(req.url()));
  await page.goto(app.url);
  await page.waitForSelector('#empty:not([hidden])');
  await openSettings(page);
  await page.check('input[name="serverTypeTmdb"]');
  await page.evaluate(() => document.getElementById('settings-form').requestSubmit());
  await page.waitForFunction(() => !document.getElementById('settings').open);
  await page.waitForFunction(() => /Enter your TMDB key to show its posters/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });
  assert.match(await cardText(page), /Enter your TMDB key in Settings to get started/);
  assert.equal(await page.isVisible('#firstrun'), false, 'no code on the card');
  assert.equal(await page.isVisible('#signin-code-large'), false);
  const before = outside.length;
  await page.reload();
  await page.waitForSelector('#empty:not([hidden])');
  assert.match(await cardText(page), /Enter your TMDB key in Settings to get started/);
  assert.equal(outside.length, before, 'a reload asks plex.tv for nothing');
  assert.equal((await stored(page)).serverType, 'tmdb');
  check('19 a display of type TMDB with no key: the card asks for the key and never starts a plex.tv code');
});

// ---------- round 2: the empty card, the genre mode, the years, the key toggle, a key a header cannot carry ----------

tmdbCase('20 the empty card of a TMDB display (unwatched only still stored on) says "that list", offers no "unwatched only" fix and no toast for one; the sheet hides "Unwatched titles first"', {
  settings: seed({ libraryKey: 'tv/popular', libraryKeys: ['tv/popular'], libraryNames: ['TV: Popular'], maxContentRating: 'G', unwatchedOnly: true, weighting: 'unwatched' }),
}, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForSelector('#empty:not([hidden])');
  assert.match(await cardText(page), /No posters found in that list at or below G \(raise the limit\)\./);
  assert.doesNotMatch(await cardText(page), /unwatched|library/i);
  assert.deepEqual(await page.$$eval('#empty-actions button', (els) => els.map((e) => e.textContent.trim())), [], 'no "Turn off unwatched only"');
  assert.equal((await stored(page)).unwatchedOnly, true, 'the stored setting is as it was; only the advice and the fix are gone');
  await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
  await page.waitForFunction(() => /No posters found/.test(document.getElementById('empty').textContent));
  assert.equal(await page.evaluate(() => /unwatched/i.test(document.getElementById('toast').textContent)), false, 'and no toast offers it');
  await openSettings(page);
  const choice = () => page.$eval('select[name="weighting"] option[value="unwatched"]', (o) => ({ hidden: o.hidden, disabled: o.disabled }));
  assert.deepEqual(await choice(), { hidden: true, disabled: true }, 'not offered for TMDB');
  assert.equal(await page.inputValue('select[name="weighting"]'), 'off', 'a stored "unwatched" reads as Nothing in the TMDB sheet');
  assert.deepEqual(await page.$$eval('select[name="weighting"] option:not([hidden])', (os) => os.map((o) => o.value)), ['off', 'rated']);
  await page.check('input[name="serverTypePick"][value="plex"]');
  assert.deepEqual(await choice(), { hidden: false, disabled: false }, 'offered again for a media server');
  await page.click('#settings-cancel');
  check('20 TMDB empty card: that list, no unwatched advice, fix or toast; the weighting choice is hidden for TMDB only');
});

tmdbCase('21 the genre help follows "every" and "any"; a year that is not a year says it is ignored; the key toggle names its action; a key a header cannot carry is a message about the key', {
  viewport: { width: 360, height: 740 },
  settings: seed({ libraryKey: 'discover/tv?mode=and', libraryKeys: ['discover/tv?mode=and'], libraryNames: ['Discover TV'], genres: [{ key: '16', title: 'Animation' }] }),
}, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.waitForFunction(() => document.querySelectorAll('#genre-list input').length > 3);
  const help = () => page.textContent('#genre-help');
  assert.match(await help(), /has every ticked genre/);
  await page.selectOption('#tmdb-mode', 'or');
  assert.match(await help(), /matches a ticked genre/);
  assert.doesNotMatch(await help(), /every ticked genre/);
  await page.selectOption('#tmdb-mode', 'and');
  assert.match(await help(), /has every ticked genre/);

  // R8: the mode choice reads in full in the closed select at a phone width.
  assert.deepEqual(await page.$$eval('#tmdb-mode option', (os) => os.map((o) => o.textContent.trim())), ['Any ticked genre', 'Every ticked genre']);
  for (const value of ['or', 'and']) {
    await page.selectOption('#tmdb-mode', value);
    const room = await page.$eval('#tmdb-mode', (el) => {
      const style = getComputedStyle(el);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const text = el.selectedOptions[0].textContent.trim();
      return { need: ctx.measureText(text).width, have: el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 24 };
    });
    assert.ok(room.need <= room.have, `${value}: the text needs ${room.need}px of ${room.have}px`);
  }

  // R5: a year that Discover would drop is said to be ignored, beside the field.
  const note = () => page.evaluate(() => ({ hidden: document.getElementById('tmdb-years-note').hidden, text: document.getElementById('tmdb-years-note').textContent, from: document.getElementById('tmdb-from').hasAttribute('aria-invalid'), to: document.getElementById('tmdb-to').hasAttribute('aria-invalid') }));
  assert.deepEqual(await note(), { hidden: true, text: '', from: false, to: false });
  await page.fill('#tmdb-from', '20201');
  let n = await note();
  assert.deepEqual([n.hidden, n.from, n.to], [false, true, false]);
  assert.match(n.text, /From year "20201" is not a year from 1800 to 2200, so it is ignored\./);
  await page.fill('#tmdb-to', '1799');
  n = await note();
  assert.match(n.text, /From year "20201".*To year "1799" is not a year from 1800 to 2200, so it is ignored\./);
  assert.deepEqual([n.from, n.to], [true, true]);
  await page.fill('#tmdb-from', '2020');
  n = await note();
  assert.deepEqual([n.hidden, n.from, n.to], [false, false, true]);
  assert.doesNotMatch(n.text, /From/);
  await page.fill('#tmdb-to', '2021');
  assert.deepEqual(await note(), { hidden: true, text: '', from: false, to: false });
  await page.fill('#tmdb-from', '');
  await page.fill('#tmdb-to', '');
  assert.equal((await note()).hidden, true, 'a blank year is "any", not a mistake');

  // R6: the key's toggle says what it does.
  const toggle = () => page.$eval('#tmdb-key-toggle', (b) => [b.textContent.trim(), b.getAttribute('aria-label')]);
  assert.deepEqual(await toggle(), ['Show', 'Show key']);
  await page.click('#tmdb-key-toggle');
  assert.deepEqual(await toggle(), ['Hide', 'Hide key']);
  await page.click('#tmdb-key-toggle');
  assert.deepEqual(await toggle(), ['Show', 'Show key']);

  // R7: a key with a character a header cannot carry is about the key; nothing is sent.
  for (const bad of ['тест-token', 'tok☃en', 'tok\u0000en']) {
    seen.length = 0;
    await page.fill('input[name="tmdbKey"]', bad);
    await page.click('#test-btn');
    await page.waitForFunction(() => document.getElementById('test-result').textContent.startsWith('✗'), null, { timeout: 20000 });
    const line = await testText(page);
    assert.match(line, /The TMDB key holds a character a key never has/, JSON.stringify(bad));
    assert.doesNotMatch(line, /Could not reach|network|CORS/);
    assert.ok(!line.includes(bad));
    assert.deepEqual(await page.$$eval('#test-result button', (els) => els.map((e) => e.textContent.trim())), ['Sign in again']);
    assert.equal(seen.filter((r) => r.path === '/3/authentication').length, 0, 'the key was not sent');
  }
  await page.click('#settings-cancel');
  check('21 genre help, the years note, the toggle label, the key a header cannot carry');
});

// ---------- round 3 (D211): the first-run link, the import that leaves servers out ----------

tmdbCase('22 the first-run card\'s "No media server? Use TMDB" link opens Settings with TMDB chosen and the cursor in the key field; the card still offers the three media servers', { settings: { pixelShift: false, showNowPlaying: false } }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await page.waitForSelector('#firstrun:not([hidden])');
  assert.deepEqual(await page.$$eval('input[name="firstrunType"]', (els) => els.map((e) => e.value)), ['plex', 'jellyfin', 'emby'], 'TMDB is no fourth button on the card');
  assert.equal(await page.isVisible('#firstrun-tmdb'), true);
  assert.equal((await page.textContent('#firstrun-tmdb')).trim(), 'No media server? Use TMDB');
  assert.equal(await page.$eval('#firstrun-tmdb', (el) => el.tagName), 'A', 'a link, not one more button on the card');
  const box = await page.$eval('#firstrun-tmdb', (el) => el.getBoundingClientRect().height);
  assert.ok(box >= 40, `a touch-sized target (${box}px)`);
  const open = async () => {
    await page.click('#firstrun-tmdb');
    await page.waitForSelector('#settings[open]');
  };
  await open();
  assert.equal(await page.$eval('input[name="serverType"]', (el) => el.value), 'tmdb');
  assert.equal(await page.isChecked('input[name="serverTypeTmdb"]'), true);
  assert.equal(await page.isVisible('#tmdb-connection'), true);
  assert.equal(await page.evaluate(() => document.activeElement?.name), 'tmdbKey', 'the key field is ready');
  assert.equal(await page.isVisible('#firstrun'), false, 'the card\'s plex.tv code steps aside, as for any open Settings');
  assert.equal((await stored(page)).serverType ?? 'plex', 'plex', 'nothing is stored until Save');
  await page.click('#settings-cancel');
  // The card's own choice of a media server does not change what the link opens.
  await page.waitForSelector('#firstrun:not([hidden])');
  await page.check('input[name="firstrunType"][value="jellyfin"]');
  await open();
  assert.deepEqual([await page.$eval('input[name="serverType"]', (el) => el.value), await page.isChecked('input[name="serverTypePick"][value="jellyfin"]')], ['tmdb', false]);
  assert.equal(await page.evaluate(() => document.activeElement?.name), 'tmdbKey');
  // And the rest is Settings: key, Test connection, Save, posters.
  await page.fill('input[name="tmdbKey"]', TOKEN);
  await page.click('#test-btn');
  await testOk(page);
  await save(page);
  await posterShown(page);
  assert.deepEqual([(await stored(page)).serverType, (await stored(page)).tmdbKey], ['tmdb', TOKEN]);
  assert.ok(seen.some((r) => r.path === '/3/movie/popular'));
  check('22 first run: the TMDB link opens Settings with TMDB chosen and the key field ready');
});

tmdbCase('23 an import that makes TMDB the first server names each server it leaves out, before Save, with no key in the words; Cancel keeps them', {
  settings: (app) => ({
    serverType: 'plex',
    plexToken: 'demo-token',
    serverUrl: `http://127.0.0.1:${app.mockPort}`,
    serverId: 'mock',
    libraryKey: '1',
    libraryKeys: ['1'],
    rotateSeconds: 3600,
    showNowPlaying: false,
    pixelShift: false,
    servers: [
      { id: `9${'1'.padStart(31, '0')}`, type: 'jellyfin', url: `http://127.0.0.1:${app.jellyfinPort}`, token: 'jf-secret-token', userId: '', name: 'Den Jellyfin' },
      { id: 'emby-mock-1', type: 'emby', url: `http://127.0.0.1:${app.jellyfinPort}`, token: 'emby-secret-token', userId: 'u1', name: '' },
    ],
  }),
}, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  const file = { format: 'plex-poster-display/settings', version: 1, settings: { serverType: 'tmdb', tmdbKey: TOKEN, libraryKey: 'movie/popular', libraryKeys: ['movie/popular'] } };
  await page.setInputFiles('#import-file', { name: 'tmdb.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.waitForFunction(() => /would be left out/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });
  const words = await page.textContent('#toast');
  assert.match(words, /Den Jellyfin and Emby would be left out\. Cancel keeps them\./, 'each server, by its name, or by its type when it has none');
  assert.match(words, /Settings imported/);
  assert.ok(!/secret|eyJ|api_key/.test(words), 'no token or key in the words');
  assert.equal(await page.$eval('input[name="serverType"]', (el) => el.value), 'tmdb', 'the sheet shows TMDB; nothing is saved');
  const kept = await stored(page);
  assert.deepEqual([kept.serverType, kept.servers.map((e) => e.name)], ['plex', ['Den Jellyfin', '']], 'before Save the display still has its servers');
  await page.click('#settings-cancel');
  const after = await stored(page);
  assert.deepEqual([after.serverType, after.servers.map((e) => e.id), after.tmdbKey ?? ''], ['plex', [`9${'1'.padStart(31, '0')}`, 'emby-mock-1'], ''], 'Cancel keeps both servers and takes in nothing of the file');
  await openSettings(page);
  assert.equal(await page.locator('#server-list li').count(), 3, 'the sheet lists all three again');
  await page.click('#settings-cancel');
  check('23 an import that leaves servers out: each named before Save, Cancel keeps them');
});

// ---------- production house (Run 13, production-house-filter) ----------
// The mock gives each title one company: Pixar (3) has Paper Moon Rising G, Lantern Road PG and Tiny Explorers; A24 (41077) has Northern Lights Cafe PG-13, Static Bloom R
// and Sunday Sketch; the rest are Mock Studios (9999).

tmdbCase('24 search "A24", tick it, Save: only A24 titles show; Pixar added is OR; the company is sent by id and no key is stored with it', { settings: seed({ libraryKey: 'discover/movie', libraryKeys: ['discover/movie'], libraryNames: ['Discover movies'] }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  assert.equal(await page.isVisible('#house-search-row'), true, 'TMDB has a company search');
  assert.equal(await page.$$eval('#house-list input', (b) => b.length), 0, 'nothing is listed before a search');
  await page.fill('#house-search', 'A24');
  await page.click('#house-search-btn');
  await page.waitForSelector('#house-list input[data-title="A24"]');
  assert.deepEqual(await page.$$eval('#house-list li span', (els) => els.map((e) => e.textContent.trim())), ['A24'], 'the search names the company');
  await page.check('#house-list input[data-title="A24"]');
  assert.match(await page.textContent('#house-count'), /1 chosen/);
  await save(page);
  assert.deepEqual((await stored(page)).houses, [{ key: '41077', title: 'A24' }], 'the id and the name, nothing else');
  assert.ok(!JSON.stringify((await stored(page)).houses).includes(TOKEN));
  await posterShown(page);
  assert.deepEqual([...new Set(await picks(page, 16))].sort(), ['Northern Lights Cafe', 'Static Bloom'], 'only the A24 titles');
  assert.ok(seen.some((r) => r.path === '/3/discover/movie' && r.params.with_companies === '41077'), 'Discover was asked for the company by id');
  assert.ok(seen.some((r) => r.path === '/3/search/company' && r.params.query === 'A24'));
  // Pixar too: the houses are OR.
  await openSettings(page);
  await testOk(page);
  assert.equal(await page.isChecked('#house-list input[data-title="A24"]'), true, 'reopened: the chosen company is a ticked row');
  await page.fill('#house-search', 'pixar');
  await page.click('#house-search-btn');
  await page.waitForSelector('#house-list input[data-title="Pixar"]');
  await page.check('#house-list input[data-title="Pixar"]');
  await save(page);
  assert.deepEqual((await stored(page)).houses.map((h) => h.title).sort(), ['A24', 'Pixar']);
  await posterShown(page);
  assert.deepEqual([...new Set(await picks(page, 40))].sort(), ['Lantern Road', 'Northern Lights Cafe', 'Paper Moon Rising', 'Static Bloom'], 'A24 or Pixar');
  assert.ok(seen.some((r) => r.path === '/3/discover/movie' && r.params.with_companies === '41077|3'), 'several houses are joined by a pipe');
  check('24 TMDB: a company searched by name, ticked, saved by id, sent as with_companies, OR');
});

tmdbCase('25 with the limit PG, Pixar and A24 together show Pixar\'s G and PG titles and no PG-13 or R title; a list (Popular) reads each title\'s companies', { settings: seed({ maxContentRating: 'PG', houses: [{ key: '3', title: 'Pixar' }, { key: '41077', title: 'A24' }] }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  assert.deepEqual([...new Set(await picks(page, 12))].sort(), ['Lantern Road', 'Paper Moon Rising'], 'Static Bloom (R) and Northern Lights Cafe (PG-13) are A24 titles the limit refuses');
  assert.ok(seen.some((r) => /^\/3\/movie\/1001$/.test(r.path) && r.params.append_to_response === 'release_dates'), 'a list result has no companies: each title is read with them');
  assert.ok(!seen.some((r) => r.path === '/3/movie/popular' && 'with_companies' in r.params), 'a list takes no company parameter');
  check('25 TMDB: the limit stays the ceiling over a house list; a list is narrowed by each title\'s companies');
});

tmdbCase('26 a house list that no title has is the empty card, which names it', { settings: seed({ houses: [{ key: '9999', title: 'Mock Studios' }, { key: '3', title: 'Pixar' }], maxContentRating: 'G' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  await page.uncheck('#house-list input[data-title="Pixar"]');
  await page.uncheck('#house-list input[data-title="Mock Studios"]');
  await page.fill('#house-search', 'A24');
  await page.click('#house-search-btn');
  await page.waitForSelector('#house-list input[data-title="A24"]');
  await page.check('#house-list input[data-title="A24"]');
  await save(page);
  await waitUntil('the empty card names the house', async () => /production house A24/.test(await cardText(page)));
  assert.match(await cardText(page), /\(raise the limit or tick fewer production houses or choose Discover to find every title from those houses\)/, 'and says how to widen it, Discover included (ux F1, D216)');
  check('26 the empty card names the production house');
});

tmdbCase('27 the company search keeps TMDB\'s order, tells same-named companies apart by country, keeps the Search button focused, ignores a repeat of a search under way, and is announced (ux F5, F6)', { settings: seed({ libraryKey: 'discover/movie', libraryKeys: ['discover/movie'], libraryNames: ['Discover movies'] }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  assert.equal(await page.getAttribute('#house-status', 'aria-live'), 'polite', 'the short status line is the live region');
  assert.equal(await page.getAttribute('#house-help', 'aria-live'), null, 'the static help is not live, so a library tick never has it re-read (ux r2 N1)');
  await page.fill('#house-search', 'i'); // Pixar, then Mock Studios twice: TMDB's order, not A to Z
  await page.focus('#house-search-btn');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#house-list input[data-title="Pixar"]');
  const rows = () => page.$$eval('#house-list li span', (els) => els.map((e) => e.textContent.trim()));
  assert.deepEqual(await rows(), ['Pixar', 'Mock Studios (US)', 'Mock Studios (FR)'], "TMDB's order, and the two companies of one name told apart by country");
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'house-search-btn', 'the Search button keeps keyboard focus');
  assert.equal(await page.textContent('#house-status'), '3 companies found.', 'the outcome is in the live status, not in the help');
  // A ticked company stays on top; a second press of the same search while it is under way sends one request.
  await page.check('#house-list input[data-key="9998"]');
  assert.deepEqual(await rows(), ['Pixar', 'Mock Studios (US)', 'Mock Studios (FR)'], 'ticking rebuilds nothing');
  const before = seen.filter((r) => r.path === '/3/search/company').length;
  await page.evaluate(() => {
    const btn = document.getElementById('house-search-btn');
    btn.click();
    btn.click();
  });
  await waitUntil('the search answered', async () => (await page.textContent('#house-status')) === '3 companies found.' && seen.filter((r) => r.path === '/3/search/company').length > before);
  assert.equal(seen.filter((r) => r.path === '/3/search/company').length - before, 1, 'two presses of one search in the same turn: one request');
  assert.deepEqual(await rows(), ['Mock Studios (FR)', 'Pixar', 'Mock Studios (US)'], 'the ticked company is on top, the others in TMDB\'s order');
  assert.equal(await page.$eval('#house-search-btn', (b) => b.disabled), false, 'the button is never disabled by a search');
  await page.fill('#house-search', 'zzz');
  await page.click('#house-search-btn');
  await waitUntil('no company found', async () => (await page.textContent('#house-status')) === 'No company found for "zzz".');
  check("27 company search: TMDB's order, countries, focus kept, one request per search, announced");
});

tmdbCase('28 D216: a house list on a TMDB list says the list is only narrowed and Discover finds every title; Discover and no houses say nothing of it', { settings: seed({ houses: [{ key: '41077', title: 'A24' }] }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  const help = () => page.textContent('#house-help');
  assert.match(await help(), /only narrowed to those houses; Discover finds every title from them\./, 'Popular with a house ticked');
  await page.selectOption('#tmdb-list', 'tv/popular');
  assert.match(await help(), /Discover finds every title/, 'a TV list too');
  await page.selectOption('#tmdb-list', 'discover/movie');
  assert.doesNotMatch(await help(), /Discover/, 'Discover itself');
  await page.selectOption('#tmdb-list', 'movie/top_rated');
  assert.match(await help(), /Discover finds every title/, 'back on a list');
  await page.fill('#house-search', 'a24');
  await page.click('#house-search-btn');
  await page.waitForSelector('#house-list input[data-title="A24"]');
  await page.uncheck('#house-list input[data-title="A24"]');
  assert.doesNotMatch(await help(), /Discover/, 'no house ticked: the list is not narrowed');
  await page.check('#house-list input[data-title="A24"]');
  assert.match(await help(), /Discover finds every title/, 'ticked again');
  check('28 the help says a list is only narrowed and Discover finds every title, only on a list with a house ticked');
});

tmdbCase('29 ux r2 N2: a ticked company keeps its country tag when a later search shows a company of the same name', { settings: seed({ libraryKey: 'discover/movie', libraryKeys: ['discover/movie'], libraryNames: ['Discover movies'] }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  const rows = () => page.$$eval('#house-list li span', (els) => els.map((e) => e.textContent.trim()));
  await page.fill('#house-search', 'mock studios fr');
  await page.click('#house-search-btn');
  await page.waitForSelector('#house-list input[data-key="9998"]');
  assert.deepEqual(await rows(), ['Mock Studios'], 'one company of the name: no tag');
  await page.check('#house-list input[data-key="9998"]');
  await page.fill('#house-search', 'mock studios us');
  await page.click('#house-search-btn');
  await page.waitForSelector('#house-list input[data-key="9999"]');
  assert.deepEqual(await rows(), ['Mock Studios (FR)', 'Mock Studios (US)'], 'the ticked company is still told apart by the country the first search gave');
  check('29 a ticked company keeps its country tag across searches');
});

// ---------- the sheet fits ----------

for (const [label, viewport, extra] of [['a phone', { width: 390, height: 844 }, {}], ['a phone turned (rotation 90)', { width: 390, height: 844 }, { rotation: 90 }], ['a landscape screen', { width: 844, height: 390 }, {}]]) {
  tmdbCase(`17 the TMDB sections fit ${label} with no sideways scroll`, { viewport, hasTouch: true, isMobile: true, settings: seed({ libraryKey: 'discover/movie?mode=and&from=2000&to=2020', libraryKeys: ['discover/movie?mode=and&from=2000&to=2020'], ...extra }) }, async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    await openSettings(page);
    await page.waitForFunction(() => document.querySelectorAll('#genre-list input').length > 3);
    for (const id of ['tmdb-connection', 'tmdb-credit', 'tmdb-source-group', 'tmdb-discover', 'house-group', 'house-search-row']) assert.equal(await page.isVisible(`#${id}`), true, id);
    const overflow = await page.evaluate(() => {
      const body = document.querySelector('#settings .sheet-body');
      const box = document.getElementById('settings').getBoundingClientRect();
      const wide = [...document.querySelectorAll('#tmdb-connection, #tmdb-credit, #tmdb-source-group, #tmdb-discover, .tmdb-type, #house-group, #house-search-row, #house-search')].filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > box.right + 1).map((el) => el.id || el.className);
      return { sideways: body.scrollWidth - body.clientWidth, wide };
    });
    assert.deepEqual(overflow, { sideways: 0, wide: [] });
    check(`17 ${label}: no sideways scroll`);
  });
}

// ---------- run ----------

const WORKERS = Number(process.env.E2E_TMDB_WORKERS || 2);
const failures = [];
let nextCase = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (nextCase < cases.length) {
      const { name: caseName, opts, fn } = cases[nextCase++];
      try {
        await withApp(opts, async (ctx) => {
          const idle = trackPending(ctx.page);
          const trail = trailOf(ctx.page);
          try {
            await fn(ctx);
            await idle(); // no request of the case is still in flight when its page is torn down
          } catch (err) {
            // Whatever failed, the failure says what the page was doing: the requests, the card, the pill, the notice, and what the console said.
            const evidence = await trail();
            err.message = `${err.message}\n${evidence}`;
            err.stack = `${err.stack}\n${evidence}`; // the runner prints the stack, which was written before this line
            throw err;
          }
        });
        console.log(`PASS case ${caseName}`);
      } catch (err) {
        failures.push({ name: caseName, err });
      }
    }
  }),
);
for (const { name: caseName, err } of failures) console.error(`case ${caseName} failed:\n${err?.stack || err}`);
if (failures.length) process.exit(1);
console.log(`all ${cases.length} TMDB cases passed`);
