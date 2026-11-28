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

// ---------- Title as logo (R-ART-2, D221) ----------
//
// The mock TMDB's logos: 1001 (Plex ratingKey 1, "The Grand Marquee") has an English logo, 1002 (ratingKey 2, "Midnight Projector") only a logo with no language, 1004 (ratingKey 4,
// "Popcorn Skies") an English and a French one; 1006 has none, and `/__mock/empty` takes all of them away. The card is read by structure, never by a wait on time.

const MARQUEE = 'The Grand Marquee';
const PROJECTOR = 'Midnight Projector';
const POPCORN = 'Popcorn Skies';
const logoSeed = (extra = {}) => seed({ posterArt: 'source', showTitle: true, showMeta: true, titleLogo: true, ...extra });
const withKey = (key, title, extra = {}) => logoSeed({ staticRatingKey: key, staticTitle: title, ...extra });

const logoShown = (page) => page.waitForFunction(() => { const i = document.querySelector('#title-card img.title-logo'); return Boolean(i && i.naturalWidth > 0); }, null, { timeout: 20000 });
const cardShown = (page) => page.waitForSelector('#title-card:not([hidden])', { timeout: 20000 });
/** What the title card holds: its lines, whether each is a logo or text, the `alt`, where the image came from and the boxes. */
const cardOf = (page) =>
  page.evaluate(() => {
    const card = document.getElementById('title-card');
    const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const img = card.querySelector('img');
    return {
      hidden: card.hidden,
      text: card.textContent,
      lines: [...card.children].map((c) => (c.querySelector('img') ? 'logo' : c.textContent)),
      images: card.querySelectorAll('img').length,
      svgs: card.querySelectorAll('svg, object, embed').length,
      alt: img?.alt ?? null,
      from: img ? (img.src.startsWith('blob:') ? 'blob' : img.src) : null,
      boxes: img ? { img: box(img), line: box(img.parentElement), card: box(card), poster: box(document.getElementById('poster-box')) } : null,
    };
  });
const inside = (a, b) => a.l >= b.l - 0.5 && a.t >= b.t - 0.5 && a.r <= b.r + 0.5 && a.b <= b.b + 0.5;
const logoRequests = (seen) => images(seen).filter((r) => r.params.include_image_language !== 'null');

for (const [label, viewport] of [['portrait 1080x1920', { width: 1080, height: 1920 }], ['landscape 1920x1080', { width: 1920, height: 1080 }]]) {
  artCase(`30 Title as logo at ${label}: an img in the title card, alt the title, the box inside the title line's, from a blob, one request by the title's own id; the meta line unchanged`, { viewport, settings: withKey('1', MARQUEE) }, async ({ page, app }) => {
    const seen = watchTmdb(page);
    await page.goto(app.url);
    await posterShown(page);
    await logoShown(page);
    const c = await cardOf(page);
    assert.equal(c.images, 1);
    assert.equal(c.alt, MARQUEE, 'the title is the alt');
    assert.equal(c.from, 'blob', 'drawn from a same-origin object URL');
    assert.equal(c.svgs, 0, 'never inlined');
    assert.equal(c.lines.length, 2);
    assert.equal(c.lines[0], 'logo');
    assert.match(c.lines[1], /\d{4}/, 'the rating, runtime and year line is still text');
    assert.ok(!c.text.includes(MARQUEE), 'the title line is not text');
    assert.ok(c.boxes.img.b - c.boxes.img.t >= 20, 'the logo has a size');
    assert.ok(inside(c.boxes.img, c.boxes.line), `the logo box is inside the title line's box: ${JSON.stringify(c.boxes)}`);
    assert.ok(inside(c.boxes.line, c.boxes.card) && inside(c.boxes.card, c.boxes.poster), 'and the line inside the card, the card inside the poster');
    assert.deepEqual(logoRequests(seen).map((r) => [r.path, r.params.include_image_language]), [['/3/movie/1001/images', 'en,null']], 'one request, by the title\'s own id and type');
    const files = seen.filter((r) => r.host === 'image.tmdb.org');
    assert.deepEqual(files.map((r) => r.path), ['/t/p/original/mock-logo-1001-en.svg'], 'an SVG logo is asked for at its own size');
    assert.ok(files.every((r) => !r.url.includes(API_KEY)));
    assert.equal((await artOf(page)).plex, true, 'the poster itself is still the source\'s');
    await quiet(page);
    check(`30 ${label}: the logo is an img inside the title line`);
  });
}

artCase('31 a title with no logo at TMDB shows its title as text, with no img and no error card', { settings: logoSeed({ staticRatingKey: '1' }) }, async ({ page, app }) => {
  await mockGet(app, 'empty');
  await page.goto(app.url);
  await posterShown(page);
  await cardShown(page);
  const c = await cardOf(page);
  assert.equal(c.images, 0, 'no image at all (not an empty one)');
  assert.ok(c.lines[0].startsWith(MARQUEE), c.lines[0]);
  assert.equal(c.lines.length, 2);
  assert.equal(await page.evaluate(() => document.getElementById('empty').hidden), true, 'no error card');
  await quiet(page);
  check('31 no logo: the title is text');
});

artCase('32 TMDB down: the title stays text, no error card, and the display carries on', { settings: logoSeed({ staticRatingKey: '1' }) }, async ({ page, app }) => {
  await mockGet(app, 'down');
  await page.goto(app.url);
  await posterShown(page);
  await cardShown(page);
  const c = await cardOf(page);
  assert.deepEqual([c.images, c.lines[0].startsWith(MARQUEE)], [0, true]);
  assert.equal(await page.evaluate(() => document.getElementById('empty').hidden), true);
  await quiet(page);
  check('32 TMDB down: text');
});

artCase('33 the title card off: no logo and no title, and TMDB is not asked at all', { settings: logoSeed({ showTitle: false }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await cardShown(page); // the meta line keeps the card
  const c = await cardOf(page);
  assert.deepEqual([c.images, c.lines.length, c.text.includes(MARQUEE)], [0, 1, false], 'neither the logo nor the title');
  await quiet(page);
  assert.deepEqual(seen, [], 'no logo request at all (L5)');
  check('33 title card off: neither, no request');
});

artCase('34 no key asks TMDB nothing and shows the title as text', { settings: logoSeed({ tmdbKey: '' }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await cardShown(page);
  const c = await cardOf(page);
  assert.deepEqual([c.images, c.lines[0].startsWith(MARQUEE)], [0, true]);
  await quiet(page);
  assert.deepEqual(seen, [], 'L6');
  check('34 no key: text, no request');
});

artCase('35 a title with no TMDB id, and the setting off, ask TMDB nothing', { settings: logoSeed(NO_ID) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await cardShown(page);
  assert.equal((await cardOf(page)).images, 0);
  await quiet(page);
  assert.deepEqual(seen, [], 'no id: no request');
  check('35 no id: text, no request');
});

artCase('36 Title as logo off (the default) asks TMDB nothing, whatever the key', { settings: logoSeed({ titleLogo: false }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await cardShown(page);
  const c = await cardOf(page);
  assert.deepEqual([c.images, c.lines[0].startsWith(MARQUEE)], [0, true]);
  await quiet(page);
  assert.deepEqual(seen, []);
  check('36 setting off: text, no request');
});

artCase('37 the logo language is the Poster art language: fr takes a French logo, falls back to the logo with no language, and is text when there is neither', { settings: logoSeed({ posterArtLanguage: 'fr', staticRatingKey: '4', staticTitle: POPCORN }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await logoShown(page);
  assert.equal((await cardOf(page)).alt, POPCORN);
  assert.deepEqual(seen.filter((r) => r.host === 'image.tmdb.org').map((r) => r.path), ['/t/p/original/mock-logo-1004-fr.svg'], 'the French logo, not the English one (L1)');
  assert.equal(logoRequests(seen)[0].params.include_image_language, 'fr,null');
  await quiet(page);
  check('37 fr: the French logo');
});

artCase('38 fr with a title that has only an English logo: text (never the English logo)', { settings: logoSeed({ posterArtLanguage: 'fr' }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await cardShown(page);
  await quiet(page);
  const c = await cardOf(page);
  assert.deepEqual([c.images, c.lines[0].startsWith(MARQUEE)], [0, true]);
  assert.deepEqual(seen.filter((r) => r.host === 'image.tmdb.org'), [], 'no logo file fetched');
  check('38 fr, an English logo only: text');
});

artCase('39 a title with only a logo with no language shows that logo (the fallback)', { settings: withKey('2', PROJECTOR) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await logoShown(page);
  const c = await cardOf(page);
  assert.equal(c.alt, PROJECTOR);
  assert.deepEqual(seen.filter((r) => r.host === 'image.tmdb.org').map((r) => r.path), ['/t/p/original/mock-logo-1002-xx.svg']);
  await quiet(page);
  check('39 a logo with no language is the fallback');
});

artCase('40 the Poster art choice does not matter: textless art and the logo together, each by its own request', { settings: withKey('1', MARQUEE, { posterArt: 'textless' }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await logoShown(page);
  assert.equal((await artOf(page)).words, 'poster no language');
  assert.deepEqual(images(seen).map((r) => r.params.include_image_language).sort(), ['en,null', 'null']);
  await quiet(page);
  check('40 textless art with the logo');
});

artCase('41 cache first: after a reload the logo is drawn from the store and TMDB is asked nothing; it is in its own index, not the poster index', { settings: withKey('1', MARQUEE) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await logoShown(page);
  await quiet(page);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.logoIndex') || '[]').length === 1, null, { timeout: 10000 });
  const logos = await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.logoIndex')));
  assert.match(logos[0].thumb, /^tmdb-art:movie:1001:logo-en$/);
  assert.ok(!(await index(page)).some((e) => /logo/.test(JSON.stringify(e))), 'no logo in the poster index (offline never draws it as a poster)');
  const seen = watchTmdb(page);
  await page.reload();
  await posterShown(page);
  await logoShown(page);
  await quiet(page);
  assert.deepEqual(seen.filter((r) => /\/images$|mock-logo/.test(r.path)), [], 'the logo came from the store');
  check('41 the logo is cached on its own');
});

artCase('42 turned on in Settings it shows when saved, and off again it is text; one logo request for the title', { settings: logoSeed({ titleLogo: false }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await cardShown(page);
  assert.equal((await cardOf(page)).images, 0);
  await openSettings(page);
  await page.check('input[name="titleLogo"]');
  await save(page); // not a live control: the sheet's TMDB key and choices are used when it is saved
  assert.equal((await stored(page)).titleLogo, true);
  await logoShown(page);
  assert.equal((await cardOf(page)).alt, MARQUEE);
  assert.equal(logoRequests(seen).length, 1, 'one logo request for the one title');
  await openSettings(page);
  await page.uncheck('input[name="titleLogo"]');
  await save(page);
  assert.equal((await stored(page)).titleLogo, false);
  await page.waitForFunction(() => !document.querySelector('#title-card img'), null, { timeout: 10000 });
  assert.ok((await cardOf(page)).lines[0].startsWith(MARQUEE));
  await quiet(page);
  check('42 turned on and off from Settings');
});

for (const [label, viewport, extra] of [['a phone', { width: 390, height: 844 }, {}], ['a phone turned (rotation 90)', { width: 390, height: 844 }, { rotation: 90 }], ['a landscape screen', { width: 844, height: 390 }, {}]]) {
  artCase(`43 the Title as logo control fits ${label}: its row and help show, the Language row shows with it, no sideways scroll; the logo fits the card`, { viewport, hasTouch: true, isMobile: true, settings: logoSeed({ titleLogo: true, ...extra }) }, async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    await logoShown(page);
    const c = await cardOf(page);
    assert.ok(inside(c.boxes.img, c.boxes.line) && inside(c.boxes.line, c.boxes.card), 'the logo fits its line in the card');
    await openSettings(page);
    assert.equal(await page.isVisible('input[name="titleLogo"]'), true);
    assert.equal(await page.isVisible('#title-logo-help'), true);
    assert.equal(await page.isVisible('#art-language-row'), true, 'the logo uses the Poster art language, so the choice shows even for "As the source gives it"');
    const overflow = await page.evaluate(() => {
      const body = document.querySelector('#settings .sheet-body');
      const box = document.getElementById('settings').getBoundingClientRect();
      const wide = [...document.querySelectorAll('#art-fieldset label, #title-logo-help, input[name="titleLogo"]')].filter((el) => (el.tagName !== 'INPUT' && el.scrollWidth > el.clientWidth + 1) || el.getBoundingClientRect().right > box.right + 1).map((el) => el.id || el.name || el.className || el.tagName);
      return { sideways: body.scrollWidth - body.clientWidth, wide };
    });
    assert.deepEqual(overflow, { sideways: 0, wide: [] });
    await page.uncheck('input[name="titleLogo"]');
    assert.equal(await page.isVisible('#art-language-row'), false, 'unticked, with "As the source gives it", the language row hides again');
    await quiet(page);
    check(`43 ${label}: the control fits`);
  });
}

// The logo is inside the title card, so night dim (a filter on #stage or #frame) and every display filter reach it as they reach the text.
const dimOf = (page) =>
  page.evaluate(() => {
    const chain = (el) => {
      let level = 1;
      for (let e = el; e; e = e.parentElement) {
        const m = /brightness\(([\d.]+)\)/.exec(getComputedStyle(e).filter);
        if (m) level *= Number(m[1]);
      }
      return Math.round(level * 1000) / 1000;
    };
    const card = document.getElementById('title-card');
    const img = card.querySelector('img');
    return { logo: chain(img), text: chain(card.lastElementChild), card: chain(card), inCard: card.contains(img), inStage: document.getElementById('stage').contains(img) };
  });
for (const target of ['stage', 'frame']) {
  artCase(`44 night dim (target ${target}): the logo is dimmed exactly as the text is`, { clock: { time: new Date(2026, 5, 1, 23, 0, 0) }, settings: withKey('1', MARQUEE, { nightDim: true, nightDimStart: '22:00', nightDimEnd: '07:00', nightDimLevel: 60, nightDimTarget: target }) }, async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    await logoShown(page);
    const d = await dimOf(page);
    assert.equal(d.inCard && d.inStage, true);
    assert.equal(d.logo, d.text, 'the logo and the meta line text are under the same filters');
    assert.equal(d.logo, d.card);
    assert.equal(d.logo, target === 'stage' ? 0.6 : 1, `the stage is dimmed to 0.6 when it is the target (${target})`);
    await quiet(page);
    check(`44 ${target}: the logo follows the text's dim`);
  });
}

artCase('45 TMDB mode: a title with an id of its own gets its logo too', { settings: (app) => ({ serverType: 'tmdb', tmdbKey: API_KEY, libraryKey: 'movie/popular', libraryKeys: ['movie/popular'], staticRatingKey: 'movie:1001', staticTitle: 'Paper Moon Rising', rotateSeconds: 3600, showNowPlaying: false, pixelShift: false, posterArt: 'source', showTitle: true, showMeta: true, titleLogo: true }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await logoShown(page);
  assert.equal((await cardOf(page)).alt, 'Paper Moon Rising');
  await quiet(page);
  check('45 TMDB mode: the logo');
});

// ---------- Title as logo, round 2 (D222): readable logos only, offline from the cache, clearing, and a change of settings ----------

const TMDB_LOGO_MODE = (extra = {}) => (app) => ({ serverType: 'tmdb', tmdbKey: API_KEY, libraryKey: 'movie/popular', libraryKeys: ['movie/popular'], rotateSeconds: 3600, showNowPlaying: false, pixelShift: false, plexToken: '', serverUrl: '', posterArt: 'source', showTitle: true, showMeta: true, titleLogo: true, ...extra });
const logoIndexOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.logoIndex') || '[]'));
const blobCount = (page, store) => page.evaluate(async (name) => (await (await caches.open(name)).keys()).length, store);
/** The words of the SVG the title card's logo shows (`logo en`, `logo fr`, `logo no language`), or null when the card holds no logo. */
const logoWords = (page) =>
  page.evaluate(async () => {
    const i = document.querySelector('#title-card img.title-logo');
    return i ? (/logo (no language|en|fr)/.exec(await (await fetch(i.src)).text()) || [''])[0] : null;
  });
/** Waits, on the state itself, until the logo on screen says `words` (a bound on tries, not on time: a predicate in `waitForFunction` cannot await a fetch). */
const logoWordsAre = async (page, words) => {
  for (let i = 0; i < 300 && (await logoWords(page)) !== words; i++) await quiet(page);
  assert.equal(await logoWords(page), words);
};

artCase('46 D222 1: a dark logo (dark lettering on a card that is near black) is text, and no other logo is tried; a light one is the logo', { settings: TMDB_LOGO_MODE({ staticRatingKey: 'movie:1003', staticTitle: 'Northern Lights Cafe' }) }, async ({ page, app }) => {
  const seen = watchTmdb(page);
  await page.goto(app.url);
  await posterShown(page);
  await cardShown(page);
  await quiet(page);
  const c = await cardOf(page);
  assert.equal(c.images, 0, 'no image: the title is text');
  assert.ok(c.lines[0].startsWith('Northern Lights Cafe'), c.lines[0]);
  assert.equal(c.lines.length, 2);
  assert.deepEqual(logoRequests(seen).map((r) => r.path), ['/3/movie/1003/images'], 'one logo request');
  assert.deepEqual(seen.filter((r) => /mock-logo/.test(r.path)).map((r) => r.path), ['/t/p/original/mock-logo-1003-en.svg'], 'the one logo was fetched, no other tried');
  assert.equal(await page.evaluate(() => document.getElementById('empty').hidden), true, 'no error card');
  check('46 a dark logo is text');
});

artCase('47 D222 2: offline, a cached TMDB title shows its cached logo with no request; with none in the logo index it is text', { settings: TMDB_LOGO_MODE({ staticRatingKey: 'movie:1001', staticTitle: 'Paper Moon Rising' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await logoShown(page);
  await quiet(page);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.logoIndex') || '[]').length === 1 && JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]').length === 1, null, { timeout: 10000 });
  await mockGet(app, 'down');
  const seen = watchTmdb(page);
  await page.reload();
  await posterShown(page);
  await logoShown(page);
  const c = await cardOf(page);
  assert.equal(c.alt, 'Paper Moon Rising', 'offline: the cached logo, alt the title');
  assert.equal(c.from, 'blob');
  await quiet(page);
  assert.deepEqual(seen.filter((r) => /\/images$|mock-logo/.test(r.path)), [], 'no logo request offline');
  // Nothing in the logo index: the same cached title is text, and still no logo request.
  await page.evaluate(() => localStorage.removeItem('plexPoster.logoIndex'));
  seen.length = 0;
  await page.reload();
  await posterShown(page);
  await cardShown(page);
  await quiet(page);
  const t = await cardOf(page);
  assert.equal(t.images, 0);
  assert.ok(t.lines[0].startsWith('Paper Moon Rising'), t.lines[0]);
  assert.deepEqual(seen.filter((r) => /\/images$|mock-logo/.test(r.path)), []);
  check('47 offline: the cached logo, else text, no request');
});

artCase('48 F1: a server type switch empties the logo index and its blobs together; the poster blobs go with theirs', { settings: logoSeed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await logoShown(page);
  await quiet(page);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.logoIndex') || '[]').length === 1, null, { timeout: 10000 });
  assert.equal(await blobCount(page, 'plex-logos-v1'), 1, 'the logo blob is in the logo store');
  assert.equal(await blobCount(page, 'plex-posters-v1'), 1, 'and the poster blob in the poster store');
  await openSettings(page);
  await page.uncheck('input[name="titleLogo"]'); // so the new title does not store a logo again
  await page.locator('#settings-form input[name="serverTypeTmdb"]').check({ force: true });
  await save(page);
  assert.equal((await stored(page)).serverType, 'tmdb');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.logoIndex') || '[]').length === 0, null, { timeout: 10000 });
  assert.equal(await blobCount(page, 'plex-logos-v1'), 0, 'no logo blob is left');
  await quiet(page);
  check('48 a type switch clears the logos');
});

artCase('49 F1: Clear poster cache empties the logo index and the logo blobs, and the poster ones', { settings: logoSeed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await logoShown(page);
  await quiet(page);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.logoIndex') || '[]').length === 1, null, { timeout: 10000 });
  await openSettings(page);
  await page.click('#clear-cache-btn');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.logoIndex') || '[]').length === 0, null, { timeout: 10000 });
  assert.equal(await blobCount(page, 'plex-logos-v1'), 0);
  assert.deepEqual(await index(page), []);
  assert.equal(await blobCount(page, 'plex-posters-v1'), 0);
  check('49 Clear poster cache clears the logos');
});

artCase('50 F2: a cached poster that will not decode is fetched again and the title still shows its logo', { settings: logoSeed() }, async ({ page, app }) => {
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto(app.url);
  await posterShown(page);
  await logoShown(page);
  await quiet(page);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]').length === 1 && JSON.parse(localStorage.getItem('plexPoster.logoIndex') || '[]').length === 1, null, { timeout: 10000 });
  await page.evaluate(async () => {
    const cache = await caches.open('plex-posters-v1');
    await cache.put(new URL('/__posters__/1', location.origin).toString(), new Response('garbage', { headers: { 'Content-Type': 'image/jpeg' } }));
  });
  await page.reload();
  await posterShown(page);
  await logoShown(page);
  assert.ok(logs.some((t) => t.includes('is unreadable; downloading it again')), 'the retry path ran');
  assert.equal((await cardOf(page)).alt, MARQUEE, 'the retry draw kept the logo');
  await quiet(page);
  check('50 the decode retry keeps the logo');
});

artCase('51 F3: a change of Poster art language asks for the logo again at once, and a cleared key takes it away at once', { settings: withKey('4', POPCORN) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await logoShown(page);
  await logoWordsAre(page, 'logo en');
  await openSettings(page);
  await page.selectOption('select[name="posterArtLanguage"]', 'fr');
  await save(page); // a language is no connection change: nothing draws the title again, so only the settings change can alter the logo on screen
  await logoWordsAre(page, 'logo fr'); // not the English one until the next title
  assert.equal((await cardOf(page)).alt, POPCORN);
  // A cleared key draws the title again too (a connection change); what comes first on screen is the logo going, or the poster being drawn. Only the settings change takes the logo away before a redraw.
  await page.evaluate(() => {
    window.__order = [];
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes' && r.target.classList.contains('poster-layer')) window.__order.push('poster drawn');
        if (r.type === 'childList' && r.target.id === 'title-card' && [...r.removedNodes].some((n) => n.querySelector?.('img')) && !r.target.querySelector('img')) window.__order.push('logo gone'); // gone, not drawn again at once
      }
    }).observe(document.getElementById('stage'), { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  });
  await openSettings(page);
  await page.click('#tmdb-key-clear');
  await save(page);
  await page.waitForFunction(() => !document.querySelector('#title-card img'), null, { timeout: 10000 });
  const c = await cardOf(page);
  assert.ok(c.lines[0].startsWith(POPCORN), 'the title is text again');
  assert.equal(await logoWords(page), null);
  assert.equal((await page.evaluate(() => window.__order))[0], 'logo gone', 'the logo goes at the save, before the poster is drawn again');
  await quiet(page);
  check('51 language change and cleared key apply at once');
});

artCase('52 UX F4-F6: the help no longer says art never changes the title; ticking Title as logo never moves it; the Language row names the logo; a muted line names what is missing', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, settings: logoSeed({ titleLogo: false, posterArt: 'source' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  const art = await page.textContent('#art-help');
  assert.ok(!/never the title/i.test(art), art);
  assert.match(art, /not its title/);
  assert.match(await page.textContent('#title-logo-help'), /a logo in the Poster art language, or one with no language/);
  assert.ok(!/language below/.test(await page.textContent('#title-logo-help')), 'ux N5: the help does not point at a row that may be hidden');
  const top = () => page.evaluate(() => document.querySelector('input[name="titleLogo"]').getBoundingClientRect().top - document.getElementById('art-fieldset').getBoundingClientRect().top); // in the fieldset, whatever the sheet is scrolled to
  const label = () => page.textContent('#art-language-label');
  const status = async () => ((await page.isVisible('#title-logo-status')) ? (await page.textContent('#title-logo-status')).trim() : null);
  const before = await top();
  await page.check('input[name="titleLogo"]');
  assert.equal(await top(), before, 'ticking never moves the checkbox (F5)');
  assert.equal(await page.isVisible('#art-language-row'), true);
  assert.equal(await label(), 'Language (title logo)', 'only the logo uses the language');
  assert.equal(await status(), null, 'a key and the title card on: nothing is missing');
  await page.selectOption('select[name="posterArt"]', 'largest');
  assert.equal(await label(), 'Language (poster art and title logo)');
  await page.selectOption('select[name="posterArt"]', 'language');
  assert.equal(await label(), 'Language (poster art and title logo)');
  await page.uncheck('input[name="titleLogo"]');
  assert.equal(await label(), 'Language', 'poster art alone: as it was');
  assert.equal(await status(), null, 'unticked: no line');
  await page.selectOption('select[name="posterArt"]', 'source');
  await page.check('input[name="titleLogo"]');
  await page.fill('#tmdb-key-input', '');
  assert.equal(await status(), 'No logo will show until you add a TMDB key (below).');
  await page.uncheck('input[name="showTitle"]');
  assert.equal(await status(), 'No logo will show until you add a TMDB key (below) and turn on "Show title below poster" (under Frame & layout).', 'ux N4');
  assert.equal(await page.textContent('#layout-fieldset > legend'), 'Frame & layout', 'the fieldset the line names is the one that holds the checkbox');
  assert.equal(await page.evaluate(() => document.querySelector('input[name="showTitle"]').closest('fieldset').id), 'layout-fieldset');
  await page.fill('#tmdb-key-input', API_KEY);
  assert.equal(await status(), 'No logo will show until you turn on "Show title below poster" (under Frame & layout).');
  await page.check('input[name="showTitle"]');
  assert.equal(await status(), null, 'both there: no line');
  await page.fill('#tmdb-key-input', 'Bearer ');
  assert.equal(await status(), 'No logo will show until you add a TMDB key (below).', 'a "Bearer" with nothing after it is no key');
  const sideways = await page.evaluate(() => {
    const body = document.querySelector('#settings .sheet-body');
    return body.scrollWidth - body.clientWidth;
  });
  assert.equal(sideways, 0);
  await quiet(page);
  check('52 the control copy, order and status line');
});

artCase('53 D223 1 (M8): a pure red logo (#ff0000, 5.3:1 against black) is readable on the card: it shows, with the title as alt', { settings: TMDB_LOGO_MODE({ staticRatingKey: 'movie:1008', staticTitle: 'Action Only' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await logoShown(page);
  const c = await cardOf(page);
  assert.equal(c.images, 1, 'the red logo is drawn, not text');
  assert.equal(c.alt, 'Action Only');
  assert.equal(c.from, 'blob');
  assert.equal(await page.evaluate(() => document.getElementById('empty').hidden), true);
  await quiet(page);
  check('53 a readable red logo shows');
});

artCase('54 anchored F1 (M7): a language saved while the title logo is still being fetched: the new language logo shows at once, not the one asked under the old settings', { settings: withKey('4', POPCORN) }, async ({ page, app }) => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  let held;
  const heldOnce = new Promise((resolve) => (held = resolve));
  await page.route((url) => url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/1004/images', async (route) => {
    held();
    await gate;
    await route.fallback();
  });
  await page.goto(app.url);
  await heldOnce; // the logo request is on the wire; no poster is drawn yet
  assert.equal(await page.evaluate(() => document.querySelectorAll('.poster-layer.active').length), 0, 'nothing drawn while the logo is asked');
  await openSettings(page);
  await page.selectOption('select[name="posterArtLanguage"]', 'fr');
  await save(page); // no poster on screen yet, so the save asks for nothing
  release();
  await posterShown(page);
  await logoShown(page);
  await logoWordsAre(page, 'logo fr'); // not the English one the held request was planned under, until the next title
  assert.equal((await cardOf(page)).alt, POPCORN);
  await quiet(page);
  check('54 a language saved during the logo fetch applies');
});

artCase('55 ux N1 (M9): the status line is written only when its words change: typing in the key field with the text unchanged leaves the node untouched', { viewport: { width: 390, height: 844 }, settings: logoSeed({ showTitle: false }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.check('input[name="titleLogo"]');
  const status = () => page.evaluate(() => document.getElementById('title-logo-status').textContent);
  assert.match(await status(), /^No logo will show until you turn on "Show title below poster"/, 'a key is set, the title card is off');
  await page.evaluate(() => {
    window.__writes = 0;
    new MutationObserver((records) => (window.__writes += records.length)).observe(document.getElementById('title-logo-status'), { childList: true, characterData: true, subtree: true });
  });
  const before = await status();
  await page.focus('#tmdb-key-input');
  await page.keyboard.type('abc'); // three input events, the same words
  assert.equal(await status(), before);
  await quiet(page);
  assert.equal(await page.evaluate(() => window.__writes), 0, 'the live region was not written');
  await page.check('input[name="showTitle"]'); // control: a change of words is written (the line goes empty)
  await quiet(page);
  assert.ok((await page.evaluate(() => window.__writes)) > 0, 'a change of words is written');
  check('55 the status line is written on a change only');
});

artCase('56 anchored F1 (M7c): the offline rotation too: a language saved while the cached logo is being read applies at once (the logo asked under the old language is not kept)', { settings: TMDB_LOGO_MODE({ staticRatingKey: 'movie:1001', staticTitle: 'Paper Moon Rising' }) }, async ({ page, app }) => {
  // Holds the read of the logo store (the lookup of a cached logo) while sessionStorage says so: the page's own Cache API, wrapped, with nothing else changed.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('hold-logo-lookup')) window.__logoGate = new Promise((resolve) => (window.__releaseLogo = resolve));
    const open = CacheStorage.prototype.open;
    CacheStorage.prototype.open = async function (name) {
      const cache = await open.call(this, name);
      if (name !== 'plex-logos-v1') return cache;
      return new Proxy(cache, {
        get(target, key) {
          const value = target[key];
          if (typeof value !== 'function') return value;
          if (key !== 'match') return value.bind(target);
          return async (...args) => {
            if (window.__logoGate) {
              window.__logoHeld = true;
              await window.__logoGate;
            }
            return value.apply(target, args);
          };
        },
      });
    };
  });
  await page.goto(app.url);
  await posterShown(page);
  await logoShown(page);
  await quiet(page);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.logoIndex') || '[]').length === 1 && JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]').length === 1, null, { timeout: 10000 });
  await mockGet(app, 'down');
  await page.evaluate(() => sessionStorage.setItem('hold-logo-lookup', '1'));
  await page.reload();
  await page.waitForFunction(() => window.__logoHeld === true, null, { timeout: 20000 }); // offline: the cached poster is chosen, its logo is being read
  await openSettings(page);
  await page.selectOption('select[name="posterArtLanguage"]', 'fr'); // no French logo is stored
  await save(page);
  await page.evaluate(() => window.__releaseLogo());
  await posterShown(page);
  await cardShown(page);
  for (let i = 0; i < 300 && (await cardOf(page)).images !== 0; i++) await quiet(page);
  const c = await cardOf(page);
  assert.equal(c.images, 0, 'the English logo the read was planned under is gone: French has none stored, so the title is text');
  assert.ok(c.lines[0].startsWith('Paper Moon Rising'), c.lines[0]);
  await quiet(page);
  check('56 offline: a language saved during the cached logo read applies');
});

artCase('57 anchored F1 (M11): English saved again while the French logo is still being fetched: the logo ends English, and the late French reply draws nothing', { settings: withKey('4', POPCORN) }, async ({ page, app }) => {
  // Holds the French logo's images request only (the English one is asked at the first draw, and the English logo is stored, so the second save asks TMDB nothing).
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  let held;
  const heldOnce = new Promise((resolve) => (held = resolve));
  await page.route((url) => url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/1004/images' && url.searchParams.get('include_image_language').startsWith('fr'), async (route) => {
    held();
    await gate;
    await route.fallback();
  });
  await page.goto(app.url);
  await posterShown(page);
  await logoShown(page);
  await logoWordsAre(page, 'logo en');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.logoIndex') || '[]').some((e) => /logo-en$/.test(e.thumb)), null, { timeout: 10000 }); // the English logo is stored: the second save is a store hit
  await openSettings(page);
  await page.selectOption('select[name="posterArtLanguage"]', 'fr');
  await save(page);
  await heldOnce; // the French logo is asked and held; the English one is still on screen
  await logoWordsAre(page, 'logo en');
  const srcBefore = await page.getAttribute('#title-card img.title-logo', 'src');
  await openSettings(page);
  await page.selectOption('select[name="posterArtLanguage"]', 'en');
  await save(page); // newer than the French save: the French reply, when it comes, is not wanted
  // The English redraw reads the stored English logo (index, then blob) and draws it from a new object URL. Wait for that draw before the French
  // reply is let go: stored first, the French entry would replace the English one under the redraw's read (clear-logo-title anchored r4 F1).
  await page.waitForFunction((before) => { const i = document.querySelector('#title-card img.title-logo'); return Boolean(i && i.src !== before && i.naturalWidth > 0); }, srcBefore, { timeout: 20000 });
  await logoWordsAre(page, 'logo en');
  const lateFile = page.waitForResponse((r) => new URL(r.url()).pathname === '/t/p/original/mock-logo-1004-fr.svg', { timeout: 20000 });
  release();
  await lateFile; // the French logo did come back
  // The French logo is stored when it comes back (its entry replaces the English one); that is on the state, not a wait. Then its late draw, were there one, has had every turn of the page to run: poll the state, bounded in tries.
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.logoIndex') || '[]').some((e) => /logo-fr$/.test(e.thumb)), null, { timeout: 20000 });
  for (let i = 0; i < 30; i++) {
    await quiet(page);
    assert.equal(await logoWords(page), 'logo en', 'the French logo asked under the older save is not drawn');
  }
  assert.equal((await cardOf(page)).alt, POPCORN);
  check('57 English saved again during the French fetch: the logo stays English');
});

// ---------- run ----------

if (process.env.E2E_ART_ONLY) {
  const only = new RegExp(process.env.E2E_ART_ONLY); // a few cases while working: E2E_ART_ONLY='^5[345] '
  cases.splice(0, cases.length, ...cases.filter((c) => only.test(c.name)));
}
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
