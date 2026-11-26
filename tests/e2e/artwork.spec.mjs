// Poster art from TMDB (R-ART-1, D217) in the browser, against the mock Plex and the mock TMDB (scripts/mock-tmdb.mjs; the e2e helpers route api.themoviedb.org and
// image.tmdb.org to it). Every case has its own mock servers (serveArgs: []).
//
// Plex mock titles with a TMDB id: ratingKey 1 (1001 "Paper Moon Rising"), 2 (1002), 4 (1004), 9, 10; the others (for example 3, "Velvet Curtain") have none. A case pins
// one title so which poster is on screen is known. The mock TMDB gives every title three posters: no language (the best voted), en and fr, each an SVG that says so.
// The Plex mock's own art is an SVG with a play triangle ("M260 260") and no such words. What is on screen is read from the poster layer's blob: the art itself.
//
// Nothing waits for a wall-clock time: every wait is on a state (a poster drawn, a dialog closed, a request seen) with a bound.

import assert from 'node:assert/strict';
import { API_KEY, TOKEN } from '../../scripts/mock-tmdb.mjs';
import { withApp } from './lib.mjs';

const check = (name) => console.log(`  ok  ${name}`);
const cases = [];
const artCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], tmdb: true, ...opts }, fn });

const seed = (extra = {}) => (app) => ({
  serverType: 'plex',
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  libraryKeys: ['1'],
  libraryNames: ['Movies'],
  staticRatingKey: '1', // Paper Moon Rising, TMDB id 1001
  staticTitle: 'Paper Moon Rising',
  tmdbKey: API_KEY,
  posterArt: 'textless',
  posterArtLanguage: 'en',
  rotateSeconds: 3600,
  showNowPlaying: false,
  unwatchedOnly: false,
  pixelShift: false,
  ...extra,
});
const NO_ID = { staticRatingKey: '3', staticTitle: 'Velvet Curtain' };

const posterShown = (page) => page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 20000 });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));
const index = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]'));
const mockGet = (app, path) => fetch(`http://127.0.0.1:${app.tmdbPort}/__mock/${path}`).then((r) => r.json());

/** The words of the SVG the active poster layer shows (it is a same-origin blob: URL, so the page may read it). */
const artOf = (page) =>
  page.evaluate(async () => {
    const img = document.querySelector('.poster-layer.active');
    const text = await (await fetch(img.src)).text();
    return { from: img.src.startsWith('blob:') ? 'blob' : img.src, tmdb: /poster (no language|en|fr)/.test(text), words: (/poster (no language|en|fr)/.exec(text) || [])[0] ?? '', plex: text.includes('M260 260') };
  });

/** Records every request to a TMDB host. */
const watchTmdb = (page) => {
  const seen = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.hostname === 'api.themoviedb.org' || u.hostname === 'image.tmdb.org') seen.push({ host: u.hostname, path: u.pathname, params: Object.fromEntries(u.searchParams), auth: req.headers().authorization ?? '', url: req.url() });
  });
  return seen;
};
const images = (seen) => seen.filter((r) => /\/images$/.test(r.path));

/** Waits until the requests the page has made to TMDB are answered (the network guard flags one a case leaves open). */
const quiet = async (page) => {
  for (let i = 0; i < 3; i++) await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
const openSettings = async (page) => {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForSelector('#settings[open]');
};
const save = async (page) => {
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
};

// ---------- what is shown ----------

artCase('1 Textless, a title with an id: the mock null-language poster, one images request by its id, the file from the image host', { settings: seed() }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  const art = await artOf(page);
  assert.deepEqual([art.from, art.words, art.plex], ['blob', 'poster no language', false], 'the TMDB art, from a same-origin blob');
  assert.deepEqual(images(seen).map((r) => r.path), ['/3/movie/1001/images'], 'by the poster\'s own id and type');
  assert.equal(images(seen)[0].params.include_image_language, 'null');
  assert.equal(images(seen)[0].params.api_key, API_KEY);
  const files = seen.filter((r) => r.host === 'image.tmdb.org');
  assert.equal(files.length, 1);
  assert.match(files[0].path, /^\/t\/p\/w\d+\/mock-poster-1001-xx\.svg$/);
  assert.ok(files.every((r) => !r.url.includes(API_KEY) && !r.auth), 'the image request carries no key');
  assert.ok(!(await index(page)).some((e) => JSON.stringify(e).includes(API_KEY)), 'no key in the offline index');
  await quiet(page);
  check('1 textless: the null-language art of the title\'s own id');
});

artCase('2 Textless, a title with no id: the Plex art and no TMDB request at all', { settings: seed(NO_ID) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  const art = await artOf(page);
  assert.deepEqual([art.plex, art.tmdb], [true, false]);
  await quiet(page);
  assert.deepEqual(seen, [], 'TMDB was not asked');
  check('2 no id: Plex art, no TMDB request');
});

artCase('3 TMDB down (/__mock/down): the Plex art, no error card, and the display carries on', { settings: seed() }, async ({ page, app }) => {
  await mockGet(app, 'down');
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  const art = await artOf(page);
  assert.deepEqual([art.plex, art.tmdb], [true, false]);
  assert.ok(images(seen).length >= 1, 'it did ask');
  assert.equal(await page.evaluate(() => document.getElementById('empty').hidden), true, 'no error card');
  await quiet(page);
  check('3 TMDB down: Plex art, no card');
});

artCase('4 "As the source gives it" with a key and an id asks TMDB nothing', { settings: seed({ posterArt: 'source' }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  assert.equal((await artOf(page)).plex, true);
  await quiet(page);
  assert.deepEqual(seen, []);
  check('4 the default asks nothing');
});

artCase('5 Textless with no key asks TMDB nothing', { settings: seed({ tmdbKey: '' }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  assert.equal((await artOf(page)).plex, true);
  await quiet(page);
  assert.deepEqual(seen, []);
  check('5 no key, no request');
});

artCase('6 a language shows that language\'s poster; a title with none in it shows the Plex art', { settings: seed({ posterArt: 'language', posterArtLanguage: 'fr' }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  assert.equal((await artOf(page)).words, 'poster fr');
  assert.deepEqual(images(seen)[0].params.include_image_language.split(',').sort(), ['fr', 'null']);
  await quiet(page);
  // German: the mock has no German poster.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plexPoster.settings'));
    localStorage.setItem('plexPoster.settings', JSON.stringify({ ...s, posterArtLanguage: 'de' }));
  });
  await page.reload();
  await posterShown(page);
  const art = await artOf(page);
  assert.deepEqual([art.plex, art.tmdb], [true, false], 'no German poster: the source art, not another language');
  await quiet(page);
  check('6 a language, and a language with none');
});

artCase('7 Largest asks for the original size', { settings: seed({ posterArt: 'largest' }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  assert.equal((await artOf(page)).tmdb, true);
  const files = seen.filter((r) => r.host === 'image.tmdb.org');
  assert.equal(files.length, 1);
  assert.match(files[0].path, /^\/t\/p\/original\/mock-poster-1001-/);
  await quiet(page);
  check('7 largest: size original');
});

artCase('8 a read access token travels as the Bearer header and never to the image host', { settings: seed({ tmdbKey: TOKEN }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  assert.equal((await artOf(page)).words, 'poster no language');
  assert.equal(images(seen)[0].auth, `Bearer ${TOKEN}`);
  assert.equal(images(seen)[0].params.api_key, undefined);
  assert.ok(seen.filter((r) => r.host === 'image.tmdb.org').every((r) => !r.auth && !r.url.includes(TOKEN)));
  await quiet(page);
  check('8 the token as Bearer, to the API host only');
});

// ---------- the cache ----------

artCase('9 cache first: after a reload the stored art is shown and TMDB is asked nothing; the entry is named for TMDB and the id', { settings: seed() }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]')).length > 0, null, { timeout: 10000 });
  const [entry] = await index(page);
  assert.equal(entry.ratingKey, '1');
  assert.equal(entry.thumb, 'tmdb-art:movie:1001:textless', 'the cache key names TMDB and the id and is no Plex thumb');
  await quiet(page);
  const before = seen.length;
  await page.reload();
  await posterShown(page);
  assert.equal((await artOf(page)).words, 'poster no language');
  await quiet(page);
  assert.equal(seen.length, before, 'a cached poster keeps the art it was saved with, with no TMDB request');
  check('9 cache first');
});

artCase('10 stored 180 days ago, the art is fetched again; the shown art is stored with a new time', { settings: seed() }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]')).length > 0, null, { timeout: 10000 });
  await quiet(page);
  await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('plexPoster.posterIndex'));
    for (const e of list) e.savedAt = Date.now() - 180 * 86_400_000;
    localStorage.setItem('plexPoster.posterIndex', JSON.stringify(list));
  });
  const before = images(seen).length;
  await page.reload();
  await posterShown(page);
  assert.equal(images(seen).length, before + 1, 'asked again');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex')).every((e) => Date.now() - e.savedAt < 86_400_000), null, { timeout: 10000 });
  await quiet(page);
  check('10 180 days: fetched again');
});

// ---------- the fill still reads the art ----------

artCase('11 the colour matte is drawn from the TMDB art (the canvas is not tainted)', { viewport: { width: 1080, height: 1920 }, settings: seed({ frameId: 'marquee-glow', posterFit: 'contain', gapFill: 'matte', rotation: 0 }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  assert.equal((await artOf(page)).words, 'poster no language');
  await page.waitForFunction(() => document.querySelector('#gap-fill canvas.active'), null, { timeout: 10000 });
  const drawn = await page.evaluate(() => {
    const c = document.querySelector('#gap-fill canvas.active');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; // a tainted canvas throws here
    return { w: c.width, alpha: d[3] };
  });
  assert.ok(drawn.w > 0 && drawn.alpha > 0);
  // The matte is the edge colour of what is on screen: the mock's null-language poster for 1001 is not Plex's.
  const ok = await page.evaluate(async () => {
    const { edgeColour } = await import('/js/fill.js');
    const img = document.querySelector('.poster-layer.active');
    const c = document.createElement('canvas');
    c.width = 48;
    c.height = Math.round((48 * img.naturalHeight) / img.naturalWidth);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const edge = edgeColour(ctx.getImageData(0, 0, c.width, c.height));
    const g = document.querySelector('#gap-fill canvas.active');
    const px = g.getContext('2d').getImageData(0, 0, 1, 1).data;
    return { edge, px: [px[0], px[1], px[2]] };
  });
  const edge = String(ok.edge).match(/\d+/g).slice(0, 3).map(Number);
  assert.ok(edge.every((v, i) => Math.abs(v - ok.px[i]) <= 8), `matte ${ok.px} matches the art's edge ${ok.edge}`);
  check('11 matte from the TMDB art');
});

artCase('12 the dimmed poster backdrop is drawn from the TMDB art', { viewport: { width: 1920, height: 1080 }, settings: seed({ fillMode: 'blur' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  assert.equal((await artOf(page)).words, 'poster no language');
  await page.waitForFunction(() => document.querySelector('#fill-backdrop canvas.active'), null, { timeout: 10000 });
  const drew = await page.evaluate(() => {
    const c = document.querySelector('#fill-backdrop canvas.active');
    if (!c) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    return { w: c.width, lit: d.some((v, i) => i % 4 !== 3 && v > 0) };
  });
  assert.ok(drew && drew.w > 0 && drew.lit, `the backdrop canvas holds the art: ${JSON.stringify(drew)}`);
  check('12 blurred backdrop from the TMDB art');
});

// ---------- Settings ----------

artCase('13 Settings: the Poster art section with its four choices, the language list in its own names, and the key field with Show, Clear and the credit', { settings: seed({ posterArt: 'source' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.equal(await page.isVisible('#art-fieldset'), true);
  assert.equal(await page.textContent('#art-fieldset legend'), 'Poster art');
  assert.deepEqual(await page.$$eval('select[name="posterArt"] option', (o) => o.map((e) => [e.value, e.textContent])), [['source', 'As the source gives it'], ['textless', 'Textless when TMDB has it'], ['language', 'In English when TMDB has it'], ['largest', 'Largest TMDB poster']]);
  assert.equal(await page.isVisible('#art-language-row'), false, 'no language list until a language is chosen');
  await page.selectOption('select[name="posterArt"]', 'language');
  assert.equal(await page.isVisible('#art-language-row'), true);
  assert.equal(await page.isVisible('#art-language-help'), false, 'the Largest help line is for Largest');
  const langs = await page.$$eval('select[name="posterArtLanguage"] option', (o) => o.map((e) => [e.value, e.textContent]));
  assert.ok(langs.length >= 18 && langs.length <= 24);
  assert.ok(langs.some(([v, t]) => v === 'fr' && t === 'Français') && langs.some(([v, t]) => v === 'de' && t === 'Deutsch'));
  assert.equal(await page.inputValue('input[name="tmdbKey"]'), API_KEY, 'the one key field, for a Plex display');
  assert.equal(await page.isVisible('#tmdb-credit'), true, 'the credit shows while a key is set');
  assert.equal(await page.getAttribute('input[name="tmdbKey"]', 'type'), 'password');
  await page.click('#tmdb-key-toggle');
  assert.equal(await page.getAttribute('input[name="tmdbKey"]', 'type'), 'text', 'Show (no PIN is set here)');
  await page.click('#tmdb-key-toggle');
  assert.equal(await page.getAttribute('input[name="tmdbKey"]', 'type'), 'password');
  assert.equal(await page.isVisible('#tmdb-connection'), false, 'the old key block is for TMDB mode only');
  await page.selectOption('select[name="posterArtLanguage"]', 'fr');
  assert.equal(await page.textContent('select[name="posterArt"] option[value="language"]'), 'In Français when TMDB has it', 'R-ART-1: the option names the chosen language in its own name');
  await save(page);
  const s = await stored(page);
  assert.deepEqual([s.posterArt, s.posterArtLanguage, s.tmdbKey], ['language', 'fr', API_KEY]);
  check('13 the section, the language list and the key field');
});

artCase('18 Largest shows the language row, with a help line; each language option carries its own lang; Show and Clear sit outside the key label, whose help is linked', { settings: seed({ posterArt: 'source' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.selectOption('select[name="posterArt"]', 'largest');
  assert.equal(await page.isVisible('#art-language-row'), true, 'D219 3: the row shows for Largest');
  assert.match(await page.textContent('#art-language-help'), /Largest shows textless, English or that language/);
  assert.equal(await page.isVisible('#art-language-help'), true);
  await page.selectOption('select[name="posterArt"]', 'textless');
  assert.equal(await page.isVisible('#art-language-row'), false);
  assert.equal(await page.isVisible('#art-language-help'), false);
  const langs = await page.$$eval('select[name="posterArtLanguage"] option', (o) => o.map((e) => [e.value, e.lang]));
  assert.ok(langs.length >= 18 && langs.every(([v, l]) => l === v), 'lang = the code of each option');
  const key = await page.$eval('input[name="tmdbKey"]', (el) => ({
    labelText: [...el.labels].map((l) => l.textContent.trim()),
    buttonsInLabel: [...el.labels].some((l) => l.querySelector('button')),
    describedBy: (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean).map((id) => document.getElementById(id)?.textContent.trim().slice(0, 14)),
  }));
  assert.deepEqual(key.labelText, ['TMDB key']);
  assert.equal(key.buttonsInLabel, false);
  assert.deepEqual(key.describedBy, ['Paste your TMD']);
  check('18 Largest language row, lang, the key label');
});

artCase('19 the Plex token and the TMDB key have a Show state each: showing one never shows the other', { settings: seed({ posterArt: 'textless' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  const types = () => page.evaluate(() => [document.querySelector('input[name="plexToken"]').type, document.querySelector('input[name="tmdbKey"]').type]);
  const labels = () => page.evaluate(() => [document.getElementById('token-toggle').getAttribute('aria-label'), document.getElementById('tmdb-key-toggle').getAttribute('aria-label')]);
  await page.click('#tmdb-key-toggle');
  assert.deepEqual(await types(), ['password', 'text'], 'the key shown, the token still hidden');
  assert.deepEqual(await labels(), ['Show token', 'Hide key']);
  await page.click('#tmdb-key-toggle');
  await page.evaluate(() => (document.getElementById('manual-connection').open = true));
  await page.click('#token-toggle');
  assert.deepEqual(await types(), ['text', 'password'], 'the token shown, the key still hidden');
  assert.deepEqual(await labels(), ['Hide token', 'Show key']);
  await save(page);
  await openSettings(page);
  assert.deepEqual(await types(), ['password', 'password'], 'the sheet opens with both hidden');
  check('19 one Show state each');
});

// ---------- D219 2: Test key, for every server type ----------

const keyLine = (page) => page.textContent('#art-test-result').then((t) => t.trim());
const keyLineIs = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('art-test-result').textContent), re.source, { timeout: 15000 });

artCase('20 Test key under Plex: connected, refused, TMDB not answering; the key is never in the line; an edit drops the verdict', { settings: seed({ posterArt: 'source' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.equal(await page.isVisible('#art-test-btn'), true, 'a Test key button for a Plex display');
  assert.equal(await page.textContent('#art-test-btn'), 'Test key');
  await page.click('#art-test-btn');
  await keyLineIs(page, /^✓ Connected to TMDB/);
  assert.doesNotMatch(await page.textContent('#test-result'), /TMDB/, 'the connection line is the server\'s own, untouched');
  // an edit drops the earlier verdict
  await page.fill('input[name="tmdbKey"]', `${API_KEY}0`);
  assert.match(await keyLine(page), /not tested yet/i);
  await page.fill('input[name="tmdbKey"]', API_KEY);
  await mockGet(app, 'badkey');
  await page.click('#art-test-btn');
  await keyLineIs(page, /^✗ TMDB rejected the key/);
  assert.ok(!(await keyLine(page)).includes(API_KEY), 'the key is never in the line');
  await page.click('#tmdb-key-clear');
  assert.match(await keyLine(page), /not tested yet/i, 'Clear drops the verdict too');
  await page.click('#art-test-btn');
  await keyLineIs(page, /Enter your TMDB key first/);
  await page.fill('input[name="tmdbKey"]', API_KEY);
  await mockGet(app, 'down');
  await page.click('#art-test-btn');
  await keyLineIs(page, /^✗ TMDB is not answering/);
  assert.ok(!(await keyLine(page)).includes(API_KEY));
  await mockGet(app, 'reset');
  check('20 Test key');
});

artCase('21 in TMDB mode Test connection sits after the key field, and an edit of the key drops its verdict', { settings: (app) => ({ serverType: 'tmdb', tmdbKey: API_KEY, libraryKey: 'movie/popular', libraryKeys: ['movie/popular'], rotateSeconds: 3600, showNowPlaying: false, pixelShift: false, plexToken: '', serverUrl: '', posterArt: 'textless' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.equal(await inLayout(page, '#art-test-btn'), false, 'D220 2: Test connection is the key\'s test in TMDB mode, Test key is hidden');
  assert.equal(await inLayout(page, '#art-test-result'), false, 'and its line');
  assert.equal((await page.textContent('#tmdb-connection p')).trim(), 'TMDB needs only its key. Enter and test it under Poster art, just below.', 'ux N5: the pointer says the test moved too');
  const order = await page.evaluate(() => {
    const after = (a, b) => Boolean(document.querySelector(a).compareDocumentPosition(document.querySelector(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { testAfterKey: after('input[name="tmdbKey"]', '#test-btn'), resultAfterKey: after('input[name="tmdbKey"]', '#test-result'), inSection: document.getElementById('art-fieldset').contains(document.getElementById('test-btn')) };
  });
  assert.deepEqual(order, { testAfterKey: true, resultAfterKey: true, inSection: true });
  await page.click('#test-btn');
  await page.waitForFunction(() => /^✓ Connected to TMDB/.test(document.getElementById('test-result').textContent), null, { timeout: 15000 });
  await page.fill('input[name="tmdbKey"]', `${API_KEY}0`);
  assert.match((await page.textContent('#test-result')).trim(), /not tested yet/i, 'the old Connected is dropped');
  await page.click('#tmdb-key-clear');
  assert.match((await page.textContent('#test-result')).trim(), /not tested yet/i);
  check('21 TMDB mode: Test connection after the key');
});

artCase('21b Test connection goes back above Poster art for a media server', { settings: seed({ posterArt: 'source' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.equal(await page.evaluate(() => document.getElementById('art-fieldset').contains(document.getElementById('test-btn'))), false);
  check('21b media server: Test connection stays in the connection');
});

// ---------- D220 2: one test per mode; a verdict never outlives the sheet; a type switch never leaves Test key disabled ----------

const typeTest = (page) => page.evaluate(() => ({ disabled: document.getElementById('art-test-btn').disabled, line: document.getElementById('art-test-result').textContent.trim() }));
/** Is the control in the layout (no `hidden` ancestor)? An empty line has no size, so a size check cannot tell hidden from empty. */
const inLayout = (page, selector) => page.evaluate((sel) => document.querySelector(sel).closest('[hidden]') === null, selector);
/** Holds the page's TMDB authentication request until `release()`; every other request goes on. */
const holdAuth = async (page) => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route((url) => url.hostname === 'api.themoviedb.org' && url.pathname === '/3/authentication', async (route) => {
    await gate;
    await route.fallback();
  });
  return release;
};

artCase('24 Test key shows under Plex, Jellyfin and Emby, and hides in TMDB mode', { settings: seed({ posterArt: 'source' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  const shown = async () => [await inLayout(page, '#art-test-btn'), await inLayout(page, '#art-test-result')];
  for (const type of ['plex', 'jellyfin', 'emby']) {
    await page.locator(`#settings-form input[name="serverTypePick"][value="${type}"]`).check({ force: true });
    assert.deepEqual(await shown(), [true, true], `Test key under ${type}`);
  }
  await page.locator('#settings-form input[name="serverTypeTmdb"]').check({ force: true });
  assert.deepEqual(await shown(), [false, false], 'hidden in TMDB mode');
  await page.locator('#settings-form input[name="serverTypePick"][value="plex"]').check({ force: true });
  assert.deepEqual(await shown(), [true, true], 'back under Plex');
  check('24 Test key per mode');
});

artCase('25 a Test key verdict is dropped on Cancel and on reopening the sheet', { settings: seed({ posterArt: 'source' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await mockGet(app, 'badkey');
  await openSettings(page);
  await page.click('#art-test-btn');
  await keyLineIs(page, /^✗ TMDB rejected the key/);
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  await page.waitForFunction(() => document.getElementById('art-test-result').textContent === '', null, { timeout: 5000 }); // the dialog's close event runs a task later
  assert.deepEqual(await typeTest(page), { disabled: false, line: '' }, 'dropped at Cancel');
  await mockGet(app, 'reset');
  await openSettings(page);
  assert.deepEqual(await typeTest(page), { disabled: false, line: '' }, 'and the reopened sheet shows none');
  check('25 verdict dropped on Cancel');
});

artCase('25b a Test key verdict is dropped when the sheet is filled again (an import)', { settings: seed({ posterArt: 'source' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.click('#art-test-btn');
  await keyLineIs(page, /^✓ Connected to TMDB/);
  await page.setInputFiles('#import-file', { name: 'art.json', mimeType: 'application/json', buffer: Buffer.from('{"posterArt":"largest"}') });
  await page.waitForFunction(() => document.querySelector('select[name="posterArt"]').value === 'largest');
  assert.deepEqual(await typeTest(page), { disabled: false, line: '' });
  check('25b verdict dropped on import');
});

artCase('26 a server-type switch while Test key runs never leaves the button disabled, and the late answer writes nothing', { settings: seed({ posterArt: 'source' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  const release = await holdAuth(page);
  await page.click('#art-test-btn');
  assert.deepEqual(await typeTest(page), { disabled: true, line: 'Connecting…' });
  await page.locator('#settings-form input[name="serverTypePick"][value="jellyfin"]').check({ force: true });
  assert.deepEqual(await typeTest(page), { disabled: false, line: '' }, 'enabled and empty at once');
  release();
  await quiet(page);
  assert.deepEqual(await typeTest(page), { disabled: false, line: '' }, 'the late answer is ignored');
  await page.click('#art-test-btn');
  await keyLineIs(page, /^✓ Connected to TMDB/);
  check('26 type switch mid-test');
});

artCase('27 the Language select is described by the Largest help only while that help is shown', { settings: seed({ posterArt: 'source' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  const describedBy = () => page.getAttribute('select[name="posterArtLanguage"]', 'aria-describedby');
  for (const [mode, want] of [['source', null], ['language', null], ['largest', 'art-language-help'], ['textless', null], ['largest', 'art-language-help'], ['language', null]]) {
    await page.selectOption('select[name="posterArt"]', mode);
    assert.equal(await describedBy(), want, mode);
  }
  check('27 aria-describedby follows the help');
});

artCase('28 the result lines are written only when their text changes', { settings: seed({ posterArt: 'source' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.click('#art-test-btn');
  await keyLineIs(page, /^✓ Connected to TMDB/);
  await page.evaluate(() => {
    window.__writes = { key: 0, conn: 0 };
    for (const [id, name] of [['art-test-result', 'key'], ['test-result', 'conn']]) new MutationObserver((list) => (window.__writes[name] += list.length)).observe(document.getElementById(id), { childList: true, characterData: true, subtree: true });
  });
  await page.locator('input[name="tmdbKey"]').pressSequentially('a');
  await page.waitForFunction(() => document.getElementById('art-test-result').textContent.includes('not tested yet'));
  assert.equal(await page.evaluate(() => window.__writes.key), 1, 'the first edit rewrites the line (it had a verdict)');
  await page.evaluate(() => (window.__writes = { key: 0, conn: 0 }));
  await page.locator('input[name="tmdbKey"]').pressSequentially('bcd');
  assert.deepEqual(await page.evaluate(() => window.__writes), { key: 0, conn: 0 }, 'three more edits write nothing: the text is the same');
  check('28 live lines written on change only');
});

artCase('28b in TMDB mode the connection line is written only when its text changes', { settings: (app) => ({ serverType: 'tmdb', tmdbKey: API_KEY, libraryKey: 'movie/popular', libraryKeys: ['movie/popular'], rotateSeconds: 3600, showNowPlaying: false, pixelShift: false, plexToken: '', serverUrl: '', posterArt: 'textless' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.click('#test-btn');
  await page.waitForFunction(() => /^✓ Connected to TMDB/.test(document.getElementById('test-result').textContent), null, { timeout: 15000 });
  await page.evaluate(() => {
    window.__writes = 0;
    new MutationObserver((list) => (window.__writes += list.length)).observe(document.getElementById('test-result'), { childList: true, characterData: true, subtree: true });
  });
  await page.locator('input[name="tmdbKey"]').pressSequentially('a');
  await page.waitForFunction(() => /not tested yet/.test(document.getElementById('test-result').textContent));
  assert.equal(await page.evaluate(() => window.__writes), 1, 'the first edit rewrites the line');
  await page.evaluate(() => (window.__writes = 0));
  await page.locator('input[name="tmdbKey"]').pressSequentially('bcd');
  assert.equal(await page.evaluate(() => window.__writes), 0, 'three more edits write nothing');
  check('28b TMDB mode: connection line on change only');
});

// ---------- D219 1: a refused key pauses art for 10 minutes ----------

artCase('22 a refused key: the source art, no error card, and one images request however many posters follow', { settings: seed() }, async ({ page, app }) => {
  await mockGet(app, 'badkey');
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  assert.equal((await artOf(page)).plex, true);
  await quiet(page);
  assert.equal(images(seen).length, 1);
  for (let i = 0; i < 2; i++) {
    await page.click('[data-action="refresh"]');
    await posterShown(page);
    await quiet(page);
  }
  assert.equal(images(seen).length, 1, 'no art is asked for during the pause');
  assert.equal(await page.evaluate(() => document.getElementById('empty').hidden), true, 'no error card');
  check('22 back-off after a refused key');
});

artCase('23 a change of the key ends the pause: the next poster asks TMDB again', { settings: seed() }, async ({ page, app }) => {
  await mockGet(app, 'badkey');
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await quiet(page);
  assert.equal(images(seen).length, 1);
  await mockGet(app, 'reset');
  await openSettings(page);
  await page.selectOption('select[name="posterArt"]', 'largest');
  await save(page);
  await page.click('[data-action="refresh"]');
  await page.waitForFunction(() => document.querySelector('.poster-layer.active')?.src.startsWith('blob:'), null, { timeout: 20000 });
  await quiet(page);
  assert.equal(images(seen).length >= 2, true, 'a changed choice ended the pause');
  check('23 a change of choice ends the pause');
});

artCase('14 Clear empties the one TMDB key, and Save stores it empty: for a Plex display and for TMDB mode alike', { settings: seed({ posterArt: 'textless' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.click('#tmdb-key-clear');
  assert.equal(await page.inputValue('input[name="tmdbKey"]'), '');
  assert.equal(await page.isVisible('#tmdb-credit'), false, 'no key, no credit');
  assert.equal((await stored(page)).tmdbKey, API_KEY, 'nothing is stored before Save');
  await save(page);
  assert.equal((await stored(page)).tmdbKey, '', 'cleared for good');
  check('14 Clear');
});

artCase('15 Clear in TMDB mode clears the TMDB source key too', { settings: (app) => ({ serverType: 'tmdb', tmdbKey: API_KEY, libraryKey: 'movie/popular', libraryKeys: ['movie/popular'], rotateSeconds: 3600, showNowPlaying: false, pixelShift: false, plexToken: '', serverUrl: '', posterArt: 'textless' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.equal(await page.isVisible('#tmdb-connection'), true);
  assert.equal(await page.isVisible('input[name="tmdbKey"]'), true, 'the field is in Poster art for TMDB mode too');
  assert.equal(await page.inputValue('input[name="tmdbKey"]'), API_KEY);
  await page.click('#tmdb-key-clear');
  await save(page);
  const s = await stored(page);
  assert.equal(s.tmdbKey, '');
  assert.equal(s.serverType, 'tmdb');
  check('15 Clear in TMDB mode');
});

artCase('16 a TMDB display with art chosen shows the art of its own titles', { settings: (app) => ({ serverType: 'tmdb', tmdbKey: API_KEY, libraryKey: 'movie/popular', libraryKeys: ['movie/popular'], rotateSeconds: 3600, showNowPlaying: false, pixelShift: false, posterArt: 'textless' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  assert.equal((await artOf(page)).words, 'poster no language');
  await quiet(page);
  check('16 TMDB mode, textless');
});

for (const [label, viewport, extra] of [['a phone', { width: 390, height: 844 }, {}], ['a phone turned (rotation 90)', { width: 390, height: 844 }, { rotation: 90 }], ['a landscape screen', { width: 844, height: 390 }, {}]]) {
  artCase(`17 the Poster art section fits ${label} with no sideways scroll`, { viewport, hasTouch: true, isMobile: true, settings: seed({ posterArt: 'language', ...extra }) }, async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    await openSettings(page);
    for (const id of ['art-fieldset', 'art-language-row', 'art-test-btn', 'tmdb-credit']) assert.equal(await page.isVisible(`#${id}`), true, id);
    const overflow = await page.evaluate(() => {
      const body = document.querySelector('#settings .sheet-body');
      const box = document.getElementById('settings').getBoundingClientRect();
      const wide = [...document.querySelectorAll('#art-fieldset, #art-fieldset label, #art-fieldset select, #art-fieldset input, #art-fieldset .btn, #art-fieldset p, #tmdb-credit')].filter((el) => (el.tagName !== 'INPUT' && el.scrollWidth > el.clientWidth + 1) || el.getBoundingClientRect().right > box.right + 1).map((el) => el.id || el.name || el.className || el.tagName);
      return { sideways: body.scrollWidth - body.clientWidth, wide };
    });
    assert.deepEqual(overflow, { sideways: 0, wide: [] });
    await quiet(page);
    check(`17 ${label}: no sideways scroll`);
  });
}

// ---------- run ----------

const failures = [];
for (const { name, opts, fn } of cases) {
  try {
    await withApp(opts, fn);
    console.log(`PASS case ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.error(`FAIL case ${name}: ${err?.message}`);
  }
}
for (const { name, err } of failures) console.error(`case ${name} failed:\n${err?.stack || err}`);
if (failures.length) process.exit(1);
console.log(`all ${cases.length} artwork cases passed`);
