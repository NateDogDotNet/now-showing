// Poster selection across more than one server (R-SRC-4, D156, D157) in the browser, against the Plex mock and the Jellyfin mock at once
// (serve.mjs --mock starts both; the Jellyfin mock's port is app.jellyfinPort). Every case has its own dedicated mock servers.
//
// Plex mock: token `demo-token`, server id `mock`; library 3 "Kids Movies" (keys 9-13, titles all G or PG), library 1 "Movies".
// Jellyfin mock: `demo` / `demo-pass`, token `jf-demo-token`, server id 9...01; Movies (b..1) holds G, PG, PG-13, R, TV-MA and unrated titles.
// With the Plex Kids library and the Jellyfin Movies library chosen, a title seen under a PG limit is from Plex when it is a Kids title and from
// Jellyfin when it is one of the two G/PG Jellyfin titles, and anything else is a leak.
//
// Nothing waits for a wall-clock time: every wait is on a state (a poster drawn, a dialog closed, a request seen) with a bound.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { withApp, shot } from './lib.mjs';

const cases = [];
const msCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], ...opts }, fn });
const check = (name) => console.log(`  ok  ${name}`);

const hex = (prefix, n) => prefix + String(n).padStart(31, '0');
const JF_ID = hex('9', 1); // the Jellyfin mock's server id
const JF_MOVIES = hex('b', 1);
const PLEX_KIDS = ['Captain Crayon', 'The Little Lantern', 'Pudding Planet', 'Whisker Wizards', 'Mini Monster Mash'];
const JF_WITHIN_PG = ['The Grand Marquee', 'Midnight Projector'];
const JF_ABOVE_PG = ['Velvet Curtain', 'Popcorn Skies', 'Neon Matinee', 'Last Reel', 'Silver Screen Serenade', 'Encore'];
const name = (alt) => (alt || '').replace(/^Poster: /, '');

const plexUrl = (app) => `http://127.0.0.1:${app.mockPort}`;
const jfUrl = (app) => `http://127.0.0.1:${app.jellyfinPort}`;
const jfEntry = (app, extra = {}) => ({ id: JF_ID, type: 'jellyfin', url: jfUrl(app), token: 'jf-demo-token', userId: '', name: 'Mock Jellyfin', ...extra });
/** Plex first (the library Kids Movies), Jellyfin second (Movies): the household's two servers. */
const twoServers = (extra = {}) => (app) => ({
  serverType: 'plex',
  plexToken: 'demo-token',
  serverUrl: plexUrl(app),
  serverId: 'mock',
  libraryKey: '3',
  libraryKeys: ['3', `@${JF_ID}/${JF_MOVIES}`],
  libraryNames: ['Kids Movies', 'Movies'],
  servers: [jfEntry(app)],
  rotateSeconds: 3600,
  showNowPlaying: false,
  unwatchedOnly: false,
  pixelShift: false,
  ...extra,
});
const oneServer = (extra = {}) => (app) => ({
  serverType: 'plex',
  plexToken: 'demo-token',
  serverUrl: plexUrl(app),
  libraryKey: '3',
  libraryKeys: ['3'],
  libraryNames: ['Kids Movies'],
  rotateSeconds: 3600,
  showNowPlaying: false,
  unwatchedOnly: false,
  pixelShift: false,
  ...extra,
});

const posterShown = (page) => page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 20000 });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));
const index = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]'));
const history = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.shownAt') || '{}'));

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
const testOk = (page) => page.waitForFunction(() => document.getElementById('test-result').textContent.startsWith('✓'), null, { timeout: 20000 });
const libraryRows = (page) => page.$$eval('#library-list li label span', (els) => els.map((e) => e.textContent.trim()));
const jfPost = (app, path) => fetch(`${jfUrl(app)}${path}`, { method: 'POST' }).then((r) => r.json());

/** Adds the Jellyfin mock as a second server through the sheet, the way a person does. */
async function addJellyfin(page, app) {
  await page.click('#server-add > summary');
  await page.check('input[name="addTypePick"][value="jellyfin"]');
  await page.fill('#add-address', jfUrl(app));
  await page.fill('#add-user', 'demo');
  await page.fill('#add-pass', 'demo-pass');
  await page.click('#add-mb-btn');
  await page.waitForFunction(() => document.querySelectorAll('#server-list li').length === 2, null, { timeout: 20000 });
}

// ---------- adding a server, and choosing libraries from both ----------

msCase('1 Settings adds a second server and offers the libraries of both; the choice from both is saved', { settings: oneServer(), viewport: { width: 1920, height: 1080 } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  assert.equal(await page.$$eval('#server-list li', (l) => l.length), 1, 'one server to start with');
  await addJellyfin(page, app);
  await testOk(page);
  assert.match(await page.textContent('#add-status'), /^Added Mock Jellyfin\. Tick its libraries below to show its posters\.$/, 'the sheet confirms the add and says what to do next');
  const rows = await libraryRows(page);
  assert.ok(rows.some((r) => /^Kids Movies/.test(r)) && rows.some((r) => /^Movies/.test(r)), `libraries of both servers are offered: ${rows.join(' | ')}`);
  // Each server's libraries sit under that server's name (D162 4).
  const groups = await page.$$eval('#library-list li', (els) => els.map((e) => (e.classList.contains('server-heading') ? `# ${e.textContent.trim()}` : e.textContent.trim().replace(/\s*·.*$/, ''))));
  assert.deepEqual(groups.filter((g) => g.startsWith('# ')), ['# Mock Plex', '# Mock Jellyfin']);
  assert.ok(groups.indexOf('Kids Movies') > groups.indexOf('# Mock Plex') && groups.indexOf('Kids Movies') < groups.indexOf('# Mock Jellyfin'), `Kids Movies is under Plex: ${groups.join(' | ')}`);
  // Plex Kids Movies is ticked already (it was saved); the Jellyfin Movies library is ticked too.
  await page.evaluate(() => {
    const tick = (value) => {
      const box = document.querySelector(`#library-list input[value="${value}"]`);
      if (!box.checked) box.click();
    };
    tick('3');
    tick('@90000000000000000000000000000001/b0000000000000000000000000000001');
  });
  await save(page);
  const s = await waitUntil('the second server to be stored', async () => (await stored(page)).servers?.length === 1 && (await stored(page)));
  assert.equal(s.servers[0].id, JF_ID);
  assert.equal(s.servers[0].token, 'jf-demo-token', "the new server's token is its own");
  assert.equal(s.plexToken, 'demo-token');
  assert.equal(s.serverId, 'mock', "the first server's id is recorded when a second is added");
  assert.equal(s.serverCarried, true, 'the first server is still the one carried over');
  assert.deepEqual([...s.libraryKeys].sort(), ['3', `@${JF_ID}/${JF_MOVIES}`].sort());
  await waitUntil('the toast that names the added server', async () => ((await page.textContent('#toast')) || '').trim() === 'Added Mock Jellyfin.'); // its libraries are chosen, so it asks for nothing more
  check('a second server is added in Settings and a library of each is saved, under its own id');
});

msCase('2 a server already in the list is refused with its name', { settings: twoServers(), viewport: { width: 1280, height: 720 } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.click('#server-add > summary').catch(() => {});
  // A third server would be allowed; the same Jellyfin server again is not.
  await page.evaluate(() => (document.getElementById('server-add').open = true));
  await page.check('input[name="addTypePick"][value="jellyfin"]');
  await page.fill('#add-address', `http://localhost:${app.jellyfinPort}`);
  await page.fill('#add-user', 'demo');
  await page.fill('#add-pass', 'demo-pass');
  await page.click('#add-mb-btn');
  await page.waitForFunction(() => /already in the list/.test(document.getElementById('add-status').textContent), null, { timeout: 20000 });
  assert.match(await page.textContent('#add-status'), /Mock Jellyfin is already in the list/);
  assert.equal(await page.$$eval('#server-list li', (l) => l.length), 2);
  check('the same server at another address is refused, naming it');
});

// ---------- one pool, one limit ----------

msCase('3 30 picks under a PG limit show only G and PG titles, from both servers', { settings: twoServers({ maxContentRating: 'PG' }) }, async ({ page, app }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  const titles = await picks(page, 30);
  const allowed = new Set([...PLEX_KIDS, ...JF_WITHIN_PG]);
  for (const t of titles) assert.ok(allowed.has(t), `"${t}" is above PG or from nowhere`);
  for (const t of titles) assert.ok(!JF_ABOVE_PG.includes(t), `${t} is above PG`);
  assert.ok(titles.some((t) => PLEX_KIDS.includes(t)), 'a Plex title was drawn');
  assert.ok(titles.some((t) => JF_WITHIN_PG.includes(t)), 'a Jellyfin title was drawn');
  const keys = (await index(page)).map((e) => e.ratingKey);
  assert.ok(keys.some((k) => k.startsWith(`@${JF_ID}/`)), "the Jellyfin posters are cached under that server's id");
  assert.ok(keys.some((k) => /^\d+$/.test(k)), "the Plex posters are cached under the first server's bare key");
  check('30 picks under PG: G and PG only, Plex and Jellyfin both drawn');
});

// ---------- now playing ----------

msCase('4 now playing comes from either server', { settings: twoServers({ showNowPlaying: true, nowPlayingPollSeconds: 5 }) }, async ({ page, app, mock }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  await mock.play('11', { user: 'demo' }); // Plex Kids title 11: Pudding Planet
  await waitUntil('Plex now playing', async () => name(await page.evaluate(() => document.querySelector('.poster-layer.active')?.alt)) === 'Pudding Planet');
  await mock.stop();
  await jfPost(app, `/__mock/jellyfin-sessions?kind=movie&id=${hex('a', 2)}&user=demo`); // Jellyfin: Midnight Projector
  await waitUntil('Jellyfin now playing', async () => name(await page.evaluate(() => document.querySelector('.poster-layer.active')?.alt)) === 'Midnight Projector');
  check('now playing from Plex, then from Jellyfin');
});

// ---------- one server down ----------

msCase('5 one server down leaves the other\'s posters and the offline cache, within the limit', { settings: twoServers({ maxContentRating: 'PG' }) }, async ({ page, app, mock }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  await picks(page, 12); // the pool is cached from both servers
  await mock.down(); // Plex is down
  const titles = await picks(page, 12);
  const allowed = new Set([...PLEX_KIDS, ...JF_WITHIN_PG]);
  for (const t of titles) assert.ok(allowed.has(t), `"${t}" is above PG`);
  assert.ok(titles.some((t) => JF_WITHIN_PG.includes(t)), 'Jellyfin posters are still drawn while Plex is down');
  assert.ok((await index(page)).some((e) => /^\d+$/.test(e.ratingKey)), "Plex's cached posters stay while it is down");
  await mock.up();
  check('Plex down: Jellyfin posters keep coming, only G and PG, and the cache keeps Plex entries');
});

// ---------- removing a server ----------

msCase('6 removing a server takes its posters, pin and history away and nothing of the other', { settings: twoServers({ maxContentRating: 'PG', noRepeatDays: 7 }) }, async ({ page, app }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  await picks(page, 16);
  const before = await index(page);
  assert.ok(before.some((e) => e.ratingKey.startsWith(`@${JF_ID}/`)) && before.some((e) => /^\d+$/.test(e.ratingKey)), 'both servers are cached');
  // Pin a Jellyfin poster (a PG title).
  await page.evaluate((s) => localStorage.setItem('plexPoster.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('plexPoster.settings')), ...s })), { staticRatingKey: `@${JF_ID}/${hex('a', 2)}`, staticTitle: 'Midnight Projector' });
  await page.reload();
  await posterShown(page);
  await openSettings(page);
  await page.click('#server-list li:nth-child(2) button');
  assert.equal(await page.$$eval('#server-list li', (l) => l.length), 1);
  await save(page);
  await waitUntil('the removal to be stored', async () => (await stored(page)).servers.length === 0);
  const s = await stored(page);
  assert.deepEqual([s.staticRatingKey, s.staticTitle], ['', ''], "the removed server's pin is cleared");
  assert.deepEqual(s.libraryKeys, ['3'], "the removed server's library is gone from the selection");
  await waitUntil("the removed server's cache entries to be cleared", async () => !(await index(page)).some((e) => e.ratingKey.startsWith(`@${JF_ID}/`)));
  const after = await index(page);
  assert.ok(after.length > 0 && after.every((e) => /^\d+$/.test(e.ratingKey)), "the other server's cache entries stay");
  assert.ok(!Object.keys(await history(page)).some((k) => k.startsWith(`@${JF_ID}/`)), "the removed server's history is cleared");
  assert.ok(Object.keys(await history(page)).length > 0, "the other server's history stays");
  check('removing the Jellyfin server clears its cache, pin, history and library; Plex keeps its own');
});

// ---------- a token goes only to its own server (D157 3) ----------

msCase('8 a typed address that is not the saved server never receives the saved token, and Save sets the token aside and clears that server\'s entries', { settings: oneServer({ libraryKey: '3' }) }, async ({ page, app }) => {
  const toJellyfin = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.port === String(app.jellyfinPort)) toJellyfin.push(`${r.method()} ${u.pathname}${u.search} ${JSON.stringify(r.headers())}`);
  });
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  await picks(page, 4);
  assert.ok((await index(page)).length > 0, 'something is cached for the saved server');
  await openSettings(page);
  await testOk(page);
  await page.evaluate((u) => {
    const el = document.querySelector('input[name="serverUrl"]');
    el.value = u;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, jfUrl(app));
  await page.click('#test-btn');
  await page.waitForFunction(() => /not the server your sign-in was made for/.test(document.getElementById('test-result').textContent), null, { timeout: 20000 });
  assert.equal(await page.inputValue('input[name="plexToken"]'), '', 'the sheet set the token aside');
    assert.ok(!toJellyfin.some((l) => /X-Plex-Token=demo-token/.test(l)), 'no request to the other address carried the Plex token');
  await page.click('#settings-cancel');
  check('a typed address that is another server is never sent the saved token');
});

msCase('9 a Save that moves the first server to another server clears its cached posters and history and drops its token', { settings: oneServer({ libraryKey: '3', noRepeatDays: 7 }) }, async ({ page, context, app }) => {
  // With no token the display asks plex.tv for a sign-in code: answer it here (K48).
  await context.route('https://plex.tv/**', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: route.request().url().includes('/resources') ? '[]' : JSON.stringify({ id: 1, code: 'STUB', expiresIn: 900, authToken: null }) }));
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  await picks(page, 6);
  assert.ok((await index(page)).length > 0 && Object.keys(await history(page)).length > 0);
  await openSettings(page);
  await testOk(page);
  await page.evaluate((u) => {
    const el = document.querySelector('input[name="serverUrl"]');
    el.value = u;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, jfUrl(app));
  await save(page);
  const s = await waitUntil('the new address to be stored', async () => (await stored(page)).serverUrl === jfUrl(app) && (await stored(page)));
  assert.equal(s.plexToken, '', 'the token of the old server is not kept for another server');
  await waitUntil('the old server\'s cache to be cleared', async () => (await index(page)).length === 0);
  await waitUntil('and its history to be cleared', async () => Object.keys(await history(page)).length === 0);
  check('Save to another server sets the token aside and clears the old server\'s entries');
});

// ---------- removing the FIRST server, a lowered limit at Save, a first server that is down ----------

msCase('10 removing the first of two servers: the display draws from the server that stays and its pin still shows, and the toast says what was cleared', { settings: twoServers({ staticRatingKey: `@${JF_ID}/${hex('a', 2)}`, staticTitle: 'Midnight Projector' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  assert.equal(name(await page.evaluate(() => document.querySelector('.poster-layer.active')?.alt)), 'Midnight Projector', 'the Jellyfin pin shows');
  await openSettings(page);
  await page.click('#server-list li:nth-child(1) button');
  assert.equal(await page.$$eval('#server-list li', (l) => l.length), 1);
  await save(page);
  const s = await waitUntil('the removal to be stored', async () => (await stored(page)).serverType === 'jellyfin' && (await stored(page)));
  assert.deepEqual([s.serverCarried, s.serverId, s.servers, s.libraryKeys, s.plexToken], [false, JF_ID, [], [`@${JF_ID}/${JF_MOVIES}`], 'jf-demo-token'], 'the server that stays keeps its scoped ids and its own token');
  assert.equal(s.staticRatingKey, `@${JF_ID}/${hex('a', 2)}`, 'its pin is kept');
  await waitUntil('the toast', async () => /^Removed Mock Plex\./.test(((await page.textContent('#toast')) || '').trim()));
  assert.match(await page.textContent('#toast'), /Posters now come from Mock Jellyfin\./);
  await page.reload();
  await posterShown(page);
  assert.equal(name(await page.evaluate(() => document.querySelector('.poster-layer.active')?.alt)), 'Midnight Projector', 'the pin still shows after a reload');
  // Unpinned, a poster is drawn from the library that stayed.
  await openSettings(page);
  await page.click('#unpin-btn');
  await save(page);
  await recordDraws(page);
  await page.reload();
  await posterShown(page);
  const titles = await picks(page, 6);
  const jf = ['The Grand Marquee', 'Midnight Projector', 'Velvet Curtain', 'Popcorn Skies', 'Neon Matinee', 'Last Reel', 'Silver Screen Serenade', 'Encore'];
  for (const t of titles) assert.ok(jf.includes(t), `"${t}" is a Jellyfin Movies title`);
  assert.equal(await page.isVisible('#empty'), false, 'no empty card');
  check('remove the first of two: posters and pin from the server that stays');
});

msCase('11 a limit lowered in a Save whose address change cannot be answered takes effect at once, before the identity is read', { settings: oneServer({ libraryKey: '3', libraryKeys: ['3'], ratings: ['PG'] }) }, async ({ page, app }) => {
  let held = true;
  await page.route(/\/identity/, async (route) => {
    await new Promise((done) => setTimeout(done, 6000));
    held = false;
    await route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{}' });
  });
  await page.goto(app.url);
  await posterShown(page);
  assert.ok(['Pudding Planet', 'Mini Monster Mash'].includes(name(await page.evaluate(() => document.querySelector('.poster-layer.active')?.alt))), 'a PG poster is up');
  await openSettings(page);
  await testOk(page);
  await page.check('#household-toggle');
  await page.selectOption('select[name="maxContentRating"]', 'G');
  await page.evaluate((u) => {
    const el = document.querySelector('input[name="serverUrl"]');
    el.value = u;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, jfUrl(app));
  await page.click('#settings-save');
  await page.waitForFunction(() => document.body.classList.contains('poster-blocked'), null, { timeout: 4000 });
  assert.equal(held, true, 'the poster was taken off before the identity read answered');
  check('the lowered limit took the PG poster off while the address check was still waiting');
});

msCase('12 Test connection with the first server down says which server answered and offers the libraries of the others', { settings: twoServers() }, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  await mock.down(); // Plex, the first server, is down
  await openSettings(page);
  await testOk(page);
  const line = await page.textContent('#test-result');
  assert.match(line, /Mock Jellyfin — \d+ libraries/);
  assert.match(line, /Couldn't reach Plex: the others still show posters\./);
  const groups = await page.$$eval('#library-list li.server-heading', (els) => els.map((e) => e.textContent.trim()));
  assert.ok(groups.includes('Mock Jellyfin'), `the Jellyfin libraries are offered: ${groups.join(', ')}`);
  await mock.up();
  check('first server down: the test line names both, and the other server\'s libraries are offered');
});

// ---------- Remove the first server, then retype the promoted server's address (D162 1, 2, 3; D157 3) ----------

msCase('13 Remove the first server, then retype the promoted server\'s address: its token goes nowhere before the id matches, it is not carried, and no profile keeps the removed server\'s keys', {
  settings: twoServers({ profiles: [{ id: 'p1', name: 'Kids', maxContentRating: 'PG', libraryKeys: ['3'], libraryNames: ['Kids Movies'] }] }),
}, async ({ page, context, app }) => {
  // Another server the household types in: it records every request and the credentials that came with it.
  const seen = [];
  const other = createServer((req, res) => {
    seen.push(`${req.method} ${req.url} auth=${req.headers.authorization || ''} xemby=${req.headers['x-emby-token'] || ''}`);
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ Id: 'ffffffffffffffffffffffffffffffff', ServerName: 'Other', Version: '10.10.0', Items: [] }));
  });
  await new Promise((r) => other.listen(0, '127.0.0.1', r));
  const otherUrl = `http://127.0.0.1:${other.address().port}`;
  try {
    await context.route('https://plex.tv/**', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: route.request().url().includes('/resources') ? '[]' : JSON.stringify({ id: 1, code: 'STUB', expiresIn: 900, authToken: null }) }));
    await page.goto(app.url);
    await posterShown(page);
    await openSettings(page);
    await testOk(page);
    await page.click('#server-list li:nth-child(1) button'); // Remove Plex: Jellyfin moves into the first place with its own token
    await testOk(page);
    await page.evaluate(() => {
      const change = document.getElementById('connected-change');
      if (change && change.offsetParent) change.click();
    });
    await page.evaluate((u) => {
      const el = document.querySelector('input[name="serverUrl"]');
      el.value = u;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, otherUrl);
    await page.click('#test-btn');
    await page.waitForFunction(() => /not the server your sign-in was made for/.test(document.getElementById('test-result').textContent), null, { timeout: 20000 });
    assert.ok(!seen.some((l) => l.includes('jf-demo-token')), `no request to the typed address carried the token:\n ${seen.join('\n ')}`);
    assert.equal(await page.inputValue('input[name="plexToken"]'), '', 'the sheet set the token aside');
    assert.equal(await page.$$eval('#library-list input:checked', (l) => l.length), 0, 'the library ticked for the old server is not left ticked');
    // Saving the typed address (with the token set aside) stores the entry as no carried server and no profile keeps the removed server's key.
    await save(page);
    const st = await waitUntil('the retyped server to be stored', async () => (await stored(page)).serverUrl === otherUrl && (await stored(page)));
    assert.equal(st.serverCarried, false, 'the retyped server is not carried');
    assert.equal(st.plexToken, '', 'its token was set aside');
    assert.ok(!(st.profiles[0]?.libraryKeys || []).includes('3'), 'the profile keeps no key of the removed first server');
    await waitUntil('the toast to name the real next step', async () => /Sign in to .* in Settings/.test(((await page.textContent('#toast')) || '')));
    assert.doesNotMatch(await page.textContent('#toast'), /Posters now come from/, 'the toast does not say posters come from a server whose sign-in was set aside');
    assert.ok(!seen.some((l) => l.includes('jf-demo-token')), 'the token never reached the typed address');
  } finally {
    other.close();
  }
  check('Remove the first, retype the promoted address: the token is not sent, and the server is not carried');
});

// ---------- an unchanged Save with one server down keeps that server's chosen libraries ----------

msCase('14 an unchanged Save while Plex is down keeps its chosen library, and its posters return with it', { settings: twoServers({ maxContentRating: 'PG' }) }, async ({ page, app, mock }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  await mock.down();
  await openSettings(page);
  await testOk(page);
  await save(page);
  const st = await stored(page);
  assert.deepEqual([...st.libraryKeys].sort(), ['3', `@${JF_ID}/${JF_MOVIES}`].sort(), 'both servers\' chosen libraries are kept');
  await mock.up();
  await page.reload();
  await posterShown(page);
  const titles = await picks(page, 24);
  assert.ok(titles.some((t) => PLEX_KIDS.includes(t)), 'Plex posters show again once it is back');
});

msCase('15 an unchanged Save while the extra server is down keeps its chosen library, and its posters return with it', { settings: twoServers({ maxContentRating: 'PG' }) }, async ({ page, context, app }) => {
  await recordDraws(page);
  await page.goto(app.url);
  await posterShown(page);
  await page.route(`http://127.0.0.1:${app.jellyfinPort}/**`, (route) => route.abort()); // the Jellyfin server is down
  await openSettings(page);
  await testOk(page);
  await save(page);
  const st = await stored(page);
  assert.deepEqual([...st.libraryKeys].sort(), ['3', `@${JF_ID}/${JF_MOVIES}`].sort(), 'both servers\' chosen libraries are kept');
  assert.equal(st.servers.length, 1);
  await page.unroute(`http://127.0.0.1:${app.jellyfinPort}/**`);
  await page.reload();
  await posterShown(page);
  const titles = await picks(page, 30);
  assert.ok(titles.some((t) => JF_WITHIN_PG.includes(t)), 'Jellyfin posters show again once it is back');
});

// ---------- the pin and the selection do not wait for an identity read ----------

msCase('16 an unpin at a slow Save takes effect at once, before the identity is read', { settings: oneServer({ libraryKey: '3', libraryKeys: ['3'], staticRatingKey: '11', staticTitle: 'Pudding Planet' }) }, async ({ page, app }) => {
  let held = true;
  await page.route(/\/identity/, async (route) => {
    await new Promise((done) => setTimeout(done, 6000));
    held = false;
    await route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{}' });
  });
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  await page.click('#unpin-btn');
  await page.evaluate((u) => {
    const el = document.querySelector('input[name="serverUrl"]');
    el.value = u;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, jfUrl(app));
  await page.click('#settings-save');
  await waitUntil('the unpin to be stored', async () => (await stored(page)).staticRatingKey === '', 4000);
  assert.equal(held, true, 'the pin was dropped before the identity read answered');
  check('the unpin took effect while the address check was still waiting');
});

// ---------- a one-server household sees no gap ----------

msCase('17 a one-server household\'s Add a server line takes no space of its own', { settings: oneServer(), viewport: { width: 1920, height: 1080 } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  const status = await page.$eval('#add-status', (el) => ({ shown: getComputedStyle(el).display !== 'none', height: el.getBoundingClientRect().height }));
  assert.deepEqual(status, { shown: false, height: 0 }, 'the empty status line is not laid out');
  check('the empty add-status line takes no space');
});

// ---------- the first-run card never opens for a Save that is still settling ----------

msCase('18 Remove the first server, retype its address, Save: no first-run card opens while the Save settles, and afterwards the card is for the settled server, with no plex.tv request', {
  settings: twoServers(),
}, async ({ page, context, app }) => {
  const plexTv = [];
  await context.route('https://plex.tv/**', (route) => {
    plexTv.push(`${route.request().method()} ${route.request().url()}`);
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: route.request().url().includes('/resources') ? '[]' : JSON.stringify({ id: 1, code: 'STUB', expiresIn: 900, authToken: null }) });
  });
  const slow = createServer((req, res) => {
    const answer = () => {
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' });
      res.end(JSON.stringify(req.url.includes('QuickConnect') ? false : { Id: 'ffffffffffffffffffffffffffffffff', ServerName: 'Other', Version: '10.10.0', Items: [] }));
    };
    if (req.url.includes('System/Info/Public')) setTimeout(answer, 2500);
    else answer();
  });
  await new Promise((r) => slow.listen(0, '127.0.0.1', r));
  const otherUrl = `http://127.0.0.1:${slow.address().port}`;
  try {
    await page.goto(app.url);
    await posterShown(page);
    await openSettings(page);
    await testOk(page);
    await page.click('#server-list li:nth-child(1) button'); // Remove Plex: Jellyfin moves into the first place
    await testOk(page);
    await page.evaluate(() => {
      const change = document.getElementById('connected-change');
      if (change && change.offsetParent) change.click();
    });
    await page.evaluate((u) => {
      const el = document.querySelector('input[name="serverUrl"]');
      el.value = u;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, otherUrl);
    await page.click('#test-btn');
    await page.waitForFunction(() => /not the server your sign-in was made for/.test(document.getElementById('test-result').textContent), null, { timeout: 20000 });
    plexTv.length = 0; // from here on, plex.tv must hear nothing
    await page.click('#settings-save');
    // While the identity read is held for 2.5 s the display is still the configured one: the first-run card stays away.
    for (let i = 0; i < 6; i++) {
      assert.equal(await page.evaluate(() => document.getElementById('firstrun').hidden), true, 'the first-run card is not open while the Save settles');
      await new Promise((r) => setTimeout(r, 300));
    }
    await waitUntil('the retyped server to be stored', async () => (await stored(page)).serverUrl === otherUrl);
    await page.waitForFunction(() => !document.getElementById('firstrun').hidden, null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => document.querySelector('input[name="firstrunType"]:checked')?.value), 'jellyfin', 'the card is for the settled server type');
    const words = await page.evaluate(() => `${document.getElementById('firstrun-status').textContent} ${document.querySelector('#firstrun [data-srv="panel-lead"]')?.textContent || ''} ${document.querySelector('#firstrun-address label')?.textContent || ''}`);
    assert.ok(!/plex/i.test(words) && /jellyfin/i.test(words), `the card's words are the settled server's, not Plex's: ${words.replace(/\s+/g, ' ').trim()}`);
    assert.deepEqual(plexTv, [], 'no plex.tv request was made');
  } finally {
    slow.close();
  }
  check('no first-run card while the Save settles; afterwards the card is for Jellyfin; plex.tv heard nothing');
});

// ---------- a limit-only Save does not wait for the first server's id read ----------

msCase('19 a Save that only lowers the limit, with extra servers and an unread first id, applies the limit before the read answers', { settings: twoServers({ ratings: ['PG'], serverId: '' }) }, async ({ page, app }) => {
  // Until Save the first server's id read fails (the display reads it at boot, and would record it); at Save it is held for 6 s.
  let mode = 'fail';
  let held = false;
  let asked = 0;
  await page.route(/\/identity/, async (route) => {
    if (mode === 'fail') return route.abort();
    if (mode !== 'hold') return route.continue();
    asked++;
    held = true;
    await new Promise((done) => setTimeout(done, 6000));
    held = false;
    await route.continue();
  });
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await testOk(page);
  assert.equal((await stored(page)).serverId || '', '', 'the first server\'s id is still unread');
  mode = 'hold';
  await page.check('#household-toggle');
  await page.selectOption('select[name="maxContentRating"]', 'G');
  await page.click('#settings-save');
  await page.waitForFunction(() => document.body.classList.contains('poster-blocked'), null, { timeout: 4000 });
  await waitUntil('the id read to start', async () => asked >= 1, 4000);
  assert.equal(held, true, 'the limit took effect while the first server\'s id read was still held');
  check('a limit-only Save applied the limit before the id read');
});

// ---------- the views ----------

for (const [label, viewport, extra, touch] of [
  ['1920x1080', { width: 1920, height: 1080 }, {}, {}],
  ['a phone (390x844)', { width: 390, height: 844 }, {}, { hasTouch: true, isMobile: true }],
  ['rotation 90', { width: 1280, height: 720 }, { rotation: 90 }, {}],
]) {
  msCase(`7 the server list and the Add form fit at ${label}`, { settings: twoServers(extra), viewport, ...touch }, async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    await openSettings(page);
    await page.evaluate(() => (document.getElementById('server-add').hidden = false));
    await page.evaluate(() => document.getElementById('servers-fieldset').scrollIntoView({ block: 'start' }));
    await page.evaluate(() => (document.getElementById('server-add').open = true));
    await page.check('input[name="addTypePick"][value="emby"]');
    const m = await page.evaluate(() => {
      const box = document.getElementById('settings').getBoundingClientRect();
      const inside = (sel) => {
        const el = document.querySelector(sel);
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const r = el.getBoundingClientRect();
        return { sel, ok: r.width > 0 && r.left >= box.left - 0.5 && r.right <= box.right + 0.5 };
      };
      const rows = [...document.querySelectorAll('#server-list li')].map((li, i) => inside(`#server-list li:nth-child(${i + 1})`));
      const buttons = [...document.querySelectorAll('#server-list button')].map((b, i) => inside(`#server-list li:nth-child(${i + 1}) button`));
      return [...rows, ...buttons, ...['#server-add > summary', '#add-address', '#add-user', '#add-pass', '#add-mb-btn'].map(inside)];
    });
    await shot(page, `multi-server-${label.replace(/\W+/g, '-')}`);
    assert.equal(m.filter((p) => p.sel.startsWith('#server-list li')).length >= 4, true, 'two rows and their Remove buttons');
    for (const p of m) assert.ok(p.ok, `${p.sel} is outside the sheet at ${label}`);
    check(`the server list, Remove buttons and the Add form are inside the sheet at ${label}`);
  });
}

// ---------- run ----------

const WORKERS = Number(process.env.E2E_MULTI_WORKERS || 3);
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
console.log(`all ${cases.length} multi-server cases passed`);
