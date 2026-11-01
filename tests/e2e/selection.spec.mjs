// The poster selection (R-SEL-1, D107): any chosen movie libraries, narrowed to chosen genres and ratings, or one collection
// (smart or not) or playlist, with the household limit still the ceiling. Against the mock: Movies (titles 1-8) and Kids Movies
// (titles 9-13), the collections 101 and 102, the playlist 201. Every case runs against its own mock Plex (serveArgs: []).
//
// Nothing waits for wall-clock time: a pick is waited for by the poster on screen changing, and the offline cases drive the app's
// own timers with the fake clock.

import assert from 'node:assert/strict';
import { withApp } from './lib.mjs';

const cases = [];
const selCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], ...opts }, fn });
const check = (name) => console.log(`  ok  ${name}`);

const TITLES = [
  'The Grand Marquee', 'Midnight Projector', 'Velvet Curtain', 'Popcorn Skies', 'Neon Matinee', 'Last Reel', 'Silver Screen Serenade', 'Encore',
  'Captain Crayon', 'The Little Lantern', 'Pudding Planet', 'Whisker Wizards', 'Mini Monster Mash',
];
const titleNo = (alt) => TITLES.indexOf((alt || '').replace(/^Poster: /, '')) + 1; // 0 = nothing recognisable
const asSorted = (set) => [...set].sort((a, b) => a - b);

const seed = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  rotateSeconds: 3600,
  showNowPlaying: false,
  ...extra,
});
const BOTH = { libraryKey: '1', libraryKeys: ['1', '3'], libraryNames: ['Movies', 'Kids Movies'] };

const activeAlt = (page) => page.evaluate(() => document.querySelector('.poster-layer.active')?.alt || '');
const posterShown = (page) => page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));
const index = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]'));
const requests = async (mock) => (await mock.get('log')).requests;

/** Asks for the next poster and waits for the one on screen to change (a click during a busy tick is ignored: ask again). */
async function next(page) {
  const was = await activeAlt(page);
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
    const changed = await page
      .waitForFunction((p) => { const a = document.querySelector('.poster-layer.active')?.alt || ''; return a !== '' && a !== p; }, was, { timeout: 2500 })
      .then(() => true, () => false);
    if (changed) return titleNo(await activeAlt(page));
  }
  assert.fail(`the poster never changed from ${was}`);
}
/** The title numbers of `n` successive picks. */
async function picks(page, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await next(page));
  return out;
}

const openSettings = async (page) => {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForSelector('#settings[open]');
};
const saveSettings = async (page) => {
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
};
const labels = (page, list) => page.$$eval(`${list} label`, (ls) => ls.map((l) => l.textContent.trim()));
const settled = (page) => page.waitForFunction(() => /^✓/.test(document.getElementById('test-result').textContent), null, { timeout: 15000 });

// ---------- the pool ----------

selCase('1 Movies + Kids Movies: 200 picks draw from both within 10 points of their title shares', { settings: seed({ ...BOTH, unwatchedOnly: false }) }, async ({ page, app, mock }) => {
  await mock.post('reset-stats');
  await page.goto(app.url);
  await posterShown(page);
  const all = await picks(page, 200);
  const kids = all.filter((n) => n >= 9).length / all.length;
  const movies = all.filter((n) => n >= 1 && n <= 8).length / all.length;
  assert.ok(Math.abs(kids - 5 / 13) <= 0.1, `Kids Movies share ${kids.toFixed(3)} vs ${(5 / 13).toFixed(3)}`);
  assert.ok(Math.abs(movies - 8 / 13) <= 0.1, `Movies share ${movies.toFixed(3)} vs ${(8 / 13).toFixed(3)}`);
  assert.equal(all.includes(0), false, 'every pick is a known title');
  const log = await requests(mock);
  assert.ok(log.some((r) => r.startsWith('/library/sections/1/all?') && !r.includes('Container-Size=0')), 'Movies was asked for posters');
  assert.ok(log.some((r) => r.startsWith('/library/sections/3/all?') && !r.includes('Container-Size=0')), 'Kids Movies was asked for posters');
  assert.ok(log.some((r) => r.startsWith('/library/sections/3/all?') && r.includes('Container-Size=0')), 'the title counts were asked for');
  check(`200 picks: Movies ${(movies * 100).toFixed(0)}%, Kids Movies ${(kids * 100).toFixed(0)}%`);
});

selCase('2 a genre chosen: only titles of that genre, in every chosen library', { settings: seed({ ...BOTH, genres: [{ key: '12', title: 'Comedy' }] }) }, async ({ page, app, mock }) => {
  await mock.post('reset-stats');
  await page.goto(app.url);
  await posterShown(page);
  const seen = new Set(await picks(page, 60));
  // Comedy: Popcorn Skies (4), Last Reel (6), Encore (8), Pudding Planet (11), Mini Monster Mash (13).
  assert.deepEqual(asSorted(seen), [4, 6, 8, 11, 13]);
  assert.ok((await requests(mock)).some((r) => /\/library\/sections\/1\/all\?.*genre=12/.test(r)), 'the genre went to Plex');
  check(`genre Comedy: ${asSorted(seen)}`);
});

selCase('3 ratings G and PG chosen under a PG-13 limit: only G and PG', { settings: seed({ maxContentRating: 'PG-13', ratings: ['G', 'PG'], libraryKeys: ['1'] }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  assert.deepEqual(asSorted(new Set(await picks(page, 40))), [1, 2]);
  check('ratings G + PG under PG-13: titles 1 and 2 only');
});

selCase('3b a chosen rating above the limit adds nothing, and the limit in force wins', { settings: seed({ ...BOTH, maxContentRating: 'PG', ratings: ['G', 'R', 'NC-17'] }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  // G titles: The Grand Marquee (1), Captain Crayon (9), The Little Lantern (10), Whisker Wizards (12). R is above the PG limit.
  assert.deepEqual(asSorted(new Set(await picks(page, 60))), [1, 9, 10, 12]);
  check('ratings G + R under PG: only the G titles');
});

selCase('4 the smart collection as the source: only its items, whatever libraries and genres are also stored', {
  settings: seed({ ...BOTH, genres: [{ key: '16', title: 'Animation' }], source: { kind: 'collection', key: '102', title: 'Top Rated' }, unwatchedOnly: false }),
}, async ({ page, app, mock }) => {
  await mock.post('reset-stats');
  await page.goto(app.url);
  await posterShown(page);
  // Top Rated (smart): audienceRating 7.3 and over in Movies = titles 1, 2, 3, 7.
  assert.deepEqual(asSorted(new Set(await picks(page, 60))), [1, 2, 3, 7]);
  const log = await requests(mock);
  assert.ok(log.some((r) => r.startsWith('/library/collections/102/children')), 'the collection was asked for');
  assert.ok(!log.some((r) => r.startsWith('/library/sections/') && r.includes('/all')), 'no library pool request');
  check('collection 102: titles 1, 2, 3, 7');
});

selCase('4b a collection with "unwatched only" on leaves out the watched titles', { settings: seed({ source: { kind: 'collection', key: '102', title: 'Top Rated' }, unwatchedOnly: true }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  // Titles 1 and 3 have been watched in the mock.
  assert.deepEqual(asSorted(new Set(await picks(page, 30))), [2, 7]);
  check('collection 102, unwatched only: titles 2 and 7');
});

selCase('5 the playlist as the source: only its items, across both libraries', { settings: seed({ ...BOTH, source: { kind: 'playlist', key: '201', title: 'Friday Night Picks' }, unwatchedOnly: false }) }, async ({ page, app, mock }) => {
  await mock.post('reset-stats');
  await page.goto(app.url);
  await posterShown(page);
  assert.deepEqual(asSorted(new Set(await picks(page, 60))), [2, 4, 9, 12]);
  assert.ok((await requests(mock)).some((r) => r.startsWith('/playlists/201/items')));
  check('playlist 201: titles 2, 4, 9, 12');
});

selCase('6 stored 2.2 settings (only libraryKey 1): the same eight-title pool as before, and nothing else is asked for', { settings: seed({ unwatchedOnly: false }) }, async ({ page, app, mock }) => {
  await mock.post('reset-stats');
  await page.goto(app.url);
  await posterShown(page);
  assert.deepEqual(asSorted(new Set(await picks(page, 80))), [1, 2, 3, 4, 5, 6, 7, 8]);
  const log = await requests(mock);
  assert.ok(!log.some((r) => /sections\/3|Container-Size=0|collections|playlists|genre/.test(r)), `only the 2.2 request: ${log.filter((r) => !r.startsWith('/photo')).join(' | ')}`);
  // Opening Settings and saving keeps the choice: one library, nothing narrowing it.
  await openSettings(page);
  await settled(page);
  await mock.post('reset-stats');
  await saveSettings(page);
  const s = await stored(page);
  assert.deepEqual([s.libraryKey, s.libraryKeys, s.genres, s.ratings, s.source], ['1', ['1'], [], [], null]);
  await page.waitForTimeout(600);
  assert.deepEqual((await requests(mock)).filter((r) => r.includes('/all')), [], 'a Save that changes nothing about the pool loads no pool');
  check('2.2 settings: eight titles, one request shape, saved as one library');
});

selCase('7 a selection that matches nothing: the empty card names it', { settings: seed({ ...BOTH, genres: [{ key: '99', title: 'Western' }], ratings: ['G'] }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForFunction(() => !document.getElementById('empty').hidden && /No posters found/.test(document.getElementById('empty-message').textContent), null, { timeout: 15000 });
  const message = await page.textContent('#empty-message');
  assert.match(message, /Movies and Kids Movies, genre Western, rated G/);
  assert.match(message, /unwatched only/);
  assert.match(message, /\(try turning off "unwatched only" or tick fewer genres or ratings\)\.$/);
  check(`empty card: ${message}`);
});

// ---------- offline ----------

selCase('8 offline with a selection: no cached poster outside it, and an old entry with no fields is never drawn', {
  settings: seed({ rotateSeconds: 10, unwatchedOnly: false }),
  clock: { time: '2026-01-05T12:00:00' },
}, async ({ page, app, mock }) => {
  // Online under the 2.2 selection: all eight titles are cached, each recording its library and genres.
  await page.goto(app.url);
  await posterShown(page);
  // (The fake clock stops the page's own timers, so a pick is waited for in real time here, not with waitForFunction.)
  for (let i = 0; i < 200 && (await index(page)).length < 8; i++) {
    await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
    await page.waitForTimeout(250);
  }
  assert.equal((await index(page)).length, 8);
  const entry = (await index(page)).find((e) => e.ratingKey === '6');
  assert.deepEqual([entry.libraryKey, entry.genres], ['1', ['Drama', 'Comedy']], 'a cached entry records where it belongs');
  // Title 4 (Comedy) is made an entry cached before 2.3; the selection becomes Comedy in two libraries.
  await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('plexPoster.posterIndex'));
    for (const e of list) if (e.ratingKey === '4') { delete e.libraryKey; delete e.genres; delete e.members; }
    localStorage.setItem('plexPoster.posterIndex', JSON.stringify(list));
    const s = JSON.parse(localStorage.getItem('plexPoster.settings'));
    localStorage.setItem('plexPoster.settings', JSON.stringify({ ...s, libraryKeys: ['1', '3'], libraryNames: ['Movies', 'Kids Movies'], genres: [{ key: '12', title: 'Comedy' }] }));
  });
  await mock.down();
  await page.reload();
  const seen = new Set();
  for (let i = 0; i < 6; i++) { // each step is one failed tick; the two recorded titles alternate
    await page.clock.runFor(361_000); // past the longest retry backoff
    await page.waitForTimeout(250);
    seen.add(titleNo(await activeAlt(page)));
  }
  seen.delete(0);
  // Comedy among the cached: Last Reel (6) and Encore (8). Popcorn Skies (4) is Comedy too but its entry has no fields.
  for (const t of seen) assert.ok(t === 6 || t === 8, `offline under Comedy showed title ${t}`);
  assert.ok(seen.has(6) && seen.has(8), `both recorded Comedy titles come back: ${asSorted(seen)}`);
  check(`offline under Comedy in two libraries: ${asSorted(seen)}`);
});

// ---------- Settings ----------

selCase('9 Settings: libraries as checkboxes with counts, genres from the server, only ratings at or under the limit; Save applies it', {
  settings: seed({ maxContentRating: 'PG', unwatchedOnly: false }),
}, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  await page.waitForFunction(() => [...document.querySelectorAll('#library-list label')].some((l) => l.textContent === 'Kids Movies · 5 titles'), null, { timeout: 10000 });
  assert.deepEqual(await labels(page, '#library-list'), ['Movies · 8 titles', 'Kids Movies · 5 titles'], 'movie libraries only, with counts');
  assert.equal(await page.isChecked('#library-list input[value="1"]'), true);
  assert.equal(await page.isChecked('#library-list input[value="3"]'), false);
  assert.equal((await page.$$('#library-list input[type="checkbox"]')).length, 2);
  await page.waitForFunction(() => document.querySelectorAll('#genre-list input').length > 0, null, { timeout: 10000 });
  assert.deepEqual(await labels(page, '#genre-list'), ['Adventure', 'Comedy', 'Drama', 'Mystery', 'Thriller'], "the genres of the ticked library");
  assert.deepEqual(await labels(page, '#rating-list'), ['G', 'PG'], 'only ratings at or under the PG limit');
  assert.match(await page.textContent('#rating-help'), /offered up to the loosest of the limit and the time slots/);
  assert.match(await page.textContent('#genre-help'), /A title shows only when it matches a ticked genre and, when ratings are ticked, a ticked rating\./);
  // Tick Kids Movies: its genres join the list.
  await page.check('#library-list input[value="3"]');
  await page.waitForFunction(() => [...document.querySelectorAll('#genre-list label')].some((l) => l.textContent.trim() === 'Animation'), null, { timeout: 10000 });
  assert.deepEqual(await labels(page, '#genre-list'), ['Adventure', 'Animation', 'Comedy', 'Drama', 'Family', 'Fantasy', 'Mystery', 'Thriller']);
  // The source list offers the collections and the playlist.
  await page.waitForFunction(() => document.querySelectorAll('#source-select option').length > 1, null, { timeout: 10000 });
  const sources = await page.$$eval('#source-select option', (os) => os.map((o) => o.textContent));
  assert.deepEqual(sources, ['The libraries above', 'Double Features · Movies', 'Top Rated (smart) · Movies', 'Friday Night Picks']);
  // Animation + G, in both libraries.
  await page.check('#genre-list input[data-title="Animation"]');
  await page.check('#rating-list input[value="G"]');
  assert.match(await page.textContent('#genre-count'), /1 chosen/);
  await saveSettings(page);
  const s = await stored(page);
  assert.deepEqual([s.libraryKey, s.libraryKeys, s.libraryNames, s.genres, s.ratings, s.source], ['1', ['1', '3'], ['Movies', 'Kids Movies'], [{ key: '16', title: 'Animation' }], ['G'], null]);
  // Captain Crayon (G, Animation) and The Little Lantern (G, Animation); Mini Monster Mash is Animation but PG.
  await page.waitForFunction((titles) => titles.includes((document.querySelector('.poster-layer.active')?.alt || '').replace(/^Poster: /, '')), ['Captain Crayon', 'The Little Lantern'], { timeout: 10000 }); // no refresh pressed: the Save itself redraws
  assert.deepEqual(asSorted(new Set(await picks(page, 40))), [9, 10]);
  check('Settings lists, saves and applies the selection');
});

selCase('9b Settings: choosing a collection replaces the libraries and the genres; raising the limit offers more ratings', { settings: seed({ maxContentRating: 'PG', unwatchedOnly: false }) }, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  await page.waitForFunction(() => document.querySelectorAll('#source-select option').length > 1, null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('#genre-list input').length > 0, null, { timeout: 10000 });
  await page.check('#genre-list input[data-title="Comedy"]');
  await mock.post('reset-stats');
  await page.selectOption('#source-select', 'collection:101');
  await page.waitForTimeout(500);
  assert.ok(!(await requests(mock)).some((r) => r.includes('/genre')), 'no genre is asked for while a collection is the source');
  assert.equal(await page.isDisabled('#library-list input[value="1"]'), true, 'the libraries are replaced');
  assert.equal(await page.$$eval('#genre-list input', (b) => b.every((x) => x.disabled)), true, 'a collection takes no genre');
  assert.deepEqual(await labels(page, '#genre-list'), ['Adventure', 'Comedy', 'Drama', 'Mystery', 'Thriller'], 'the genre box is kept as it was, greyed (r2 walk Minor 2)');
  assert.equal(await page.isChecked('#genre-list input[data-title="Comedy"]'), true, 'and the tick stays on it');
  assert.match(await page.textContent('#connected-text'), /Double Features/);
  assert.doesNotMatch(await page.textContent('#connected-text'), /Movies/, 'the Connected line names the source, not the libraries (r2 walk Minor 3)');
  await page.selectOption('[name="maxContentRating"]', 'R');
  assert.deepEqual(await labels(page, '#rating-list'), ['G', 'PG', 'PG-13', 'R'], 'the ratings follow the limit being edited');
  await saveSettings(page);
  const s = await stored(page);
  assert.deepEqual(s.source, { kind: 'collection', key: '101', title: 'Double Features' });
  assert.deepEqual(s.genres.map((g) => g.title), ['Comedy'], 'Save keeps the genre tick the sheet shows under a collection (D112 item 3); the engine ignores it there');
  // Double Features: titles 2, 4, 6 (limit R now allows them all except nothing above R).
  assert.deepEqual(asSorted(new Set(await picks(page, 30))), [2, 4, 6]);
  await openSettings(page);
  await page.selectOption('#source-select', '');
  assert.equal(await page.isChecked('#genre-list input[data-title="Comedy"]'), true, 'back to the libraries, the Comedy tick is there again');
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  check('collection chosen in Settings: saved and applied, the genre tick kept');
});

selCase('10 a library with many genres scrolls in its own box on a phone, and the sheet does not overflow sideways', {
  settings: seed(),
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
}, async ({ page, context, app }) => {
  const many = Array.from({ length: 70 }, (_, i) => ({ key: String(100 + i), title: `Genre number ${i + 1} with a long name` }));
  await context.route(/\/library\/sections\/\d+\/genre/, (route) =>
    route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ MediaContainer: { Directory: many } }) }),
  );
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  await page.waitForFunction(() => document.querySelectorAll('#genre-list input').length === 70, null, { timeout: 10000 });
  const box = await page.$eval('#genre-list', (el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
  assert.ok(box.scroll > box.client && box.client <= 260, `the genre list scrolls inside a bounded box: ${JSON.stringify(box)}`);
  const over = await page.evaluate(() => {
    const fs = document.getElementById('selection-fieldset');
    return fs.scrollWidth - fs.clientWidth;
  });
  assert.ok(over <= 0, `the selection fieldset fits the sheet (${over}px over)`);
  // Ticking a box below the fold by keyboard keeps focus on it and the box where it was scrolled (r2 walk Important 1).
  await page.focus('#genre-list li:nth-child(40) input');
  const before = await page.$eval('#genre-list', (el) => el.scrollTop);
  assert.ok(before > 0, 'the box scrolled to show the focused row');
  await page.keyboard.press('Space');
  assert.match(await page.textContent('#genre-count'), /1 chosen/);
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#genre-list li:nth-child(40) input')), true, 'focus is still on the ticked box');
  assert.equal(await page.$eval('#genre-list', (el) => el.scrollTop), before, 'the box did not jump back to the top');
  assert.equal(await page.isChecked('#genre-list li:nth-child(40) input'), true);
  check('70 genres: bounded scroll box, no sideways overflow at 390 px');
});

selCase('11 a rating ticked and then put above a lowered limit is kept on Save (the engine decides what is shown)', { settings: seed({ maxContentRating: 'R', unwatchedOnly: false }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  assert.deepEqual(await labels(page, '#rating-list'), ['G', 'PG', 'PG-13', 'R']);
  await page.check('#rating-list input[value="R"]');
  await page.check('#rating-list input[value="PG"]');
  await page.selectOption('[name="maxContentRating"]', 'PG');
  assert.deepEqual(await labels(page, '#rating-list'), ['G', 'PG', 'R — above the limit now'], 'the R tick stays, marked');
  await saveSettings(page);
  const s = await stored(page);
  assert.deepEqual([s.maxContentRating, s.ratings], ['PG', ['PG', 'R']], 'the R tick is kept (D110 item 6)');
  await page.waitForFunction(() => document.querySelector('.poster-layer.active')?.alt === 'Poster: Midnight Projector', null, { timeout: 10000 }); // the Save redraws: under PG only the one PG title is in the pool, never an R one
  check('a tick above a lowered limit is kept and never shows an R title');
});

selCase('12 a stored library the server no longer has is replaced by the first movie library once the list loads', { settings: seed({ libraryKey: '99', libraryName: 'Gone' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await openSettings(page);
  await settled(page);
  await page.waitForFunction(() => document.querySelector('#library-list input[value="1"]')?.checked, null, { timeout: 10000 });
  assert.equal(await page.$('#library-list input[value="99"]'), null, 'the missing library is no longer listed');
  assert.deepEqual(await page.$$eval('#library-list input:checked', (b) => b.map((x) => x.value)), ['1']);
  check('a missing stored library becomes the first movie library');
});

selCase('13 the selection is never live-previewed: an unsaved tick changes nothing on screen, and Cancel keeps the saved one', { settings: seed({ unwatchedOnly: false }) }, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  await page.waitForFunction(() => [...document.querySelectorAll('#library-list label')].some((l) => /Kids Movies/.test(l.textContent)), null, { timeout: 10000 });
  await page.check('#library-list input[value="3"]');
  // A live field fires the preview with the whole form in it, the unsaved tick included.
  await page.fill('[name="posterScale"]', '90');
  await page.dispatchEvent('[name="posterScale"]', 'input');
  await mock.post('reset-stats');
  await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
  await page.waitForTimeout(800);
  assert.ok(!(await requests(mock)).some((r) => r.includes('/sections/3/')), 'Kids Movies was not asked for while the tick was unsaved');
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  assert.ok(!((await stored(page)).libraryKeys || []).includes('3'), 'Cancel saved nothing');
  await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
  await page.waitForTimeout(800);
  assert.ok(!(await requests(mock)).some((r) => r.includes('/sections/3/')), 'still not asked for after Cancel');
  check('an unsaved library tick is not previewed');
});

selCase('14 a late genre answer for an earlier set of libraries is ignored', { settings: seed() }, async ({ page, context, app }) => {
  let release;
  const gate = new Promise((r) => (release = r));
  let first = true;
  await context.route(/\/library\/sections\/1\/genre/, async (route) => {
    if (first) {
      first = false;
      await gate; // the first answer, for Movies alone, arrives last
    }
    await route.continue();
  });
  await page.goto(app.url);
  await openSettings(page);
  await settled(page);
  await page.waitForFunction(() => [...document.querySelectorAll('#library-list label')].some((l) => /Kids Movies/.test(l.textContent)), null, { timeout: 10000 });
  await page.check('#library-list input[value="3"]');
  await page.waitForFunction(() => [...document.querySelectorAll('#genre-list label')].some((l) => l.textContent.trim() === 'Animation'), null, { timeout: 10000 });
  release();
  await page.waitForTimeout(600);
  assert.ok((await labels(page, '#genre-list')).includes('Animation'), 'the old answer did not replace the list for both libraries');
  check('a stale genre answer is ignored');
});

selCase('15 "Posters from" still fills when a library is ticked while the collections and playlists are loading', { settings: seed() }, async ({ page, context, app }) => {
  let release;
  const gate = new Promise((r) => (release = r));
  await context.route(/\/library\/sections\/\d+\/collections/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(app.url);
  await openSettings(page);
  await settled(page);
  await page.waitForFunction(() => [...document.querySelectorAll('#library-list label')].some((l) => /Kids Movies/.test(l.textContent)), null, { timeout: 10000 });
  await page.check('#library-list input[value="3"]');
  await page.waitForFunction(() => [...document.querySelectorAll('#genre-list label')].some((l) => l.textContent.trim() === 'Animation'), null, { timeout: 10000 }); // the genre answer is in, the source answer is not
  assert.equal(await page.$$eval('#source-select option', (os) => os.length), 1, 'the source list is still loading');
  release();
  await page.waitForFunction(() => document.querySelectorAll('#source-select option').length > 1, null, { timeout: 10000 });
  assert.ok((await page.$$eval('#source-select option', (os) => os.map((o) => o.textContent))).includes('Friday Night Picks'));
  check('the source list survives ticking a library while it loads');
});

selCase('16 a collection is enough to Save with no library ticked', { settings: seed({ unwatchedOnly: false }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  await page.waitForFunction(() => document.querySelectorAll('#source-select option').length > 1, null, { timeout: 10000 });
  await page.uncheck('#library-list input[value="1"]');
  await page.selectOption('#source-select', 'collection:101');
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open, null, { timeout: 5000 });
  const s = await stored(page);
  assert.deepEqual([s.libraryKey, s.libraryKeys, s.source.key], ['', [], '101']);
  assert.deepEqual(asSorted(new Set(await picks(page, 30))), [2, 4, 6]);
  check('Save with only a collection');
});

selCase('17 a "No limit" night slot (06:00 PG-13, 22:00 none) over a PG-13 base offers every rating, the tick is saved, and at noon an R title is still never drawn', {
  settings: seed({ maxContentRating: 'PG-13', limitSlots: [{ start: '06:00', limit: 'PG-13' }, { start: '22:00', limit: '' }], unwatchedOnly: false }),
  clock: { time: '2026-01-05T12:00:00' },
}, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  assert.deepEqual(await labels(page, '#rating-list'), ['G', 'PG', 'PG-13', 'R', 'NC-17'], 'the slot is looser than the base: everything is offered');
  for (const r of ['G', 'PG', 'R']) await page.check(`#rating-list input[value="${r}"]`);
  await saveSettings(page);
  assert.deepEqual((await stored(page)).ratings, ['G', 'PG', 'R'], 'the R tick is kept');
  await posterShown(page);
  const seen = new Set(await picks(page, 40));
  assert.deepEqual(asSorted(seen), [1, 2], 'at noon the PG-13 base is in force: G and PG only, never an R title (4, 5, 7)');
  check('slot-widened ratings: offered and saved, and the limit in force still wins at noon');
});

selCase('18 the ratings offered follow a time slot as it is added and edited in the sheet', { settings: seed({ maxContentRating: 'PG' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  assert.deepEqual(await labels(page, '#rating-list'), ['G', 'PG']);
  await page.check('#rating-list input[value="PG"]');
  await page.click('#slot-add');
  await page.selectOption('#slot-list .slot-limit', 'R');
  assert.deepEqual(await labels(page, '#rating-list'), ['G', 'PG', 'PG-13', 'R'], 'a looser slot widens it');
  assert.equal(await page.isChecked('#rating-list input[value="PG"]'), true, 'a tick already made stays');
  await page.selectOption('#slot-list .slot-limit', 'G');
  assert.deepEqual(await labels(page, '#rating-list'), ['G', 'PG'], 'a stricter slot does not narrow below the base');
  await page.selectOption('#slot-list .slot-limit', 'R');
  await page.click('#slot-list .slot-remove');
  assert.deepEqual(await labels(page, '#rating-list'), ['G', 'PG'], 'removing the slot takes it back');
  check('ratings follow the slots');
});

selCase('19 loading a collection online takes the membership from a cached title that is no longer in it', {
  settings: seed({ source: { kind: 'collection', key: '101', title: 'Double Features' }, unwatchedOnly: false }),
  localStorage: {
    'plexPoster.posterIndex': JSON.stringify([
      { ratingKey: '9', title: 'Captain Crayon', year: 2011, thumb: '/library/metadata/9/thumb/1700000000', contentRating: 'G', libraryKey: '3', members: ['collection:101', 'playlist:201'], width: 100, height: 150, savedAt: 1 },
      { ratingKey: '2', title: 'Midnight Projector', year: 1961, thumb: '/library/metadata/2/thumb/1700000000', contentRating: 'PG', libraryKey: '1', members: ['collection:101'], width: 100, height: 150, savedAt: 1 },
    ]),
  },
}, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  // Double Features is titles 2, 4, 6: title 9 is not in it any more, title 2 still is.
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('plexPoster.posterIndex')).find((e) => e.ratingKey === '9').members.includes('collection:101'), null, { timeout: 10000 });
  const by = Object.fromEntries((await index(page)).map((e) => [e.ratingKey, e.members]));
  assert.deepEqual(by[9], ['playlist:201'], 'it keeps the playlist it is still in');
  assert.ok(by[2].includes('collection:101'), 'a title still in the collection keeps it');
  check('a collection listed online drops the membership of a title that left it');
});

selCase('20 a Save that matches nothing takes the old poster off and the empty card names the selection, with no reload', { settings: seed({ unwatchedOnly: false }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  await page.uncheck('#household-toggle');
  await page.check('#rating-list input[value="NC-17"]');
  await saveSettings(page);
  await page.waitForFunction(() => !document.getElementById('empty').hidden && /rated NC-17/.test(document.getElementById('empty-message').textContent), null, { timeout: 10000 });
  assert.equal(await page.$$eval('.poster-layer.active', (l) => l.length), 0, 'the old poster is off the screen');
  check('empty card after a Save, no reload: ' + (await page.textContent('#empty-message')));
});

selCase('21 an empty result keeps a poster that still matches the saved selection', { settings: seed({ unwatchedOnly: false }) }, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  const was = await activeAlt(page);
  await mock.post('empty'); // every title now counts as watched: the unwatched pool is empty
  await openSettings(page);
  await settled(page);
  const failed = page.waitForEvent('console', { predicate: (m) => /No posters found/.test(m.text()), timeout: 10000 }); // the app logs the empty result when the forced tick fails
  await page.check('[name="unwatchedOnly"]');
  await saveSettings(page);
  await failed;
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); // let the failure handler finish its synchronous work
  assert.equal(await page.isVisible('#empty'), false, 'no card: the poster on screen is still in the selection');
  assert.equal(await activeAlt(page), was, 'the same poster stays');
  check('a matching poster stays when the pool comes back empty');
});

selCase('22 a stored rating tick above the offered range survives opening Settings and pressing Save', { settings: seed({ maxContentRating: 'PG', ratings: ['PG', 'R'], unwatchedOnly: false }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  assert.deepEqual(await labels(page, '#rating-list'), ['G', 'PG', 'R — above the limit now'], 'R is not offered but its kept tick is shown, marked');
  assert.equal(await page.isChecked('#rating-list input[value="R"]'), true);
  await page.check('#rating-list input[value="G"]'); // ticking another box keeps it
  assert.equal(await page.isChecked('#rating-list input[value="R"]'), true);
  await page.uncheck('#rating-list input[value="G"]');
  await saveSettings(page);
  assert.deepEqual((await stored(page)).ratings, ['PG', 'R']);
  check('a stored R tick under a PG limit is kept');
});

selCase('23 the genre help does not ask for a connection test once it passed', { settings: seed() }, async ({ page, context, app }) => {
  await context.route(/\/library\/sections\/\d+\/genre/, (route) =>
    route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ MediaContainer: { Directory: [] } }) }),
  );
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  await page.waitForFunction(() => /list no genres/.test(document.getElementById('genre-help').textContent), null, { timeout: 10000 });
  assert.doesNotMatch(await page.textContent('#genre-help'), /Test the connection/);
  await page.uncheck('#library-list input[value="1"]');
  assert.match(await page.textContent('#genre-help'), /Tick a library to see its genres\./);
  check('genre help after a passed test');
});

selCase('24 reopening Settings drops the client of the earlier connection test', { settings: seed() }, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  await page.waitForFunction(() => document.querySelectorAll('#genre-list input').length > 0, null, { timeout: 10000 });
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  await mock.down(); // the connection test of the second open cannot succeed
  await openSettings(page);
  await page.waitForFunction(() => /^✗/.test(document.getElementById('test-result').textContent), null, { timeout: 15000 });
  await mock.up();
  const asked = [];
  page.on('request', (r) => /\/genre(\?|$)/.test(r.url()) && asked.push(r.url()));
  await page.uncheck('#library-list input[value="1"]');
  await page.check('#library-list input[value="1"]');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  assert.deepEqual(asked, [], 'no genre request goes to the server of the earlier test');
  check('no stale client after a reopen');
});

selCase('25 a failed request (server down) is not an empty result: the poster stays even if the saved selection no longer matches it', { settings: seed({ unwatchedOnly: false }) }, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  const was = await activeAlt(page);
  await openSettings(page);
  await settled(page);
  await page.uncheck('#household-toggle');
  await page.check('#rating-list input[value="NC-17"]');
  await mock.down();
  const failed = page.waitForEvent('console', { predicate: (m) => /Could not reach Plex|Plex did not respond/.test(m.text()), timeout: 15000 });
  await saveSettings(page);
  await failed;
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  assert.equal(await page.isVisible('#empty'), false, 'no empty card: the server did not answer "nothing matches"');
  assert.equal(await activeAlt(page), was, 'the poster stays');
  check('a network failure keeps the poster');
});

selCase('26 the walk: tick R under an R limit, lower the limit to PG, Save, reopen: the R row is visible and ticked; unticking it brings the PG titles back', { settings: seed({ maxContentRating: 'R', unwatchedOnly: false }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  await page.check('#rating-list input[value="R"]');
  await page.selectOption('[name="maxContentRating"]', 'PG');
  assert.deepEqual(await labels(page, '#rating-list'), ['G', 'PG', 'R — above the limit now'], 'the kept tick is still a row');
  await page.check('#rating-list input[value="PG"]');
  assert.equal(await page.isChecked('#rating-list input[value="R"]'), true, 'ticking another box keeps it');
  await page.uncheck('#rating-list input[value="PG"]');
  assert.equal(await page.isChecked('#rating-list input[value="R"]'), true, 'and so does unticking one');
  await saveSettings(page);
  assert.deepEqual((await stored(page)).ratings, ['R'], 'Save keeps it');
  await page.waitForFunction(() => !document.getElementById('empty').hidden && /rated R/.test(document.getElementById('empty-message').textContent), null, { timeout: 10000 });
  await openSettings(page);
  await settled(page);
  assert.equal(await page.isChecked('#rating-list input[value="R"]'), true, 'reopened: the R row is visible and ticked');
  assert.match((await labels(page, '#rating-list')).join('|'), /R — above the limit now/);
  await page.uncheck('#rating-list input[value="R"]');
  await saveSettings(page);
  assert.deepEqual((await stored(page)).ratings, []);
  await page.waitForFunction(() => document.getElementById('empty').hidden, null, { timeout: 10000 });
  await posterShown(page);
  assert.deepEqual(asSorted(new Set(await picks(page, 30))), [1, 2], 'the PG limit alone: G and PG titles show');
  check('a kept tick above the limit is visible, survives other ticks, and can be unticked');
});

// ---------- run ----------

const WORKERS = Number(process.env.E2E_SELECTION_WORKERS || 4);
if (process.env.E2E_SELECTION_ONLY) {
  const only = new RegExp(process.env.E2E_SELECTION_ONLY);
  cases.splice(0, cases.length, ...cases.filter((c) => only.test(c.name)));
}
const failures = [];
let nextCase = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (nextCase < cases.length) {
      const { name, opts, fn } = cases[nextCase++];
      try {
        await withApp(opts, fn);
        console.log(`PASS case ${name}`);
      } catch (err) {
        failures.push({ name, err });
      }
    }
  }),
);
for (const { name, err } of failures) console.error(`case ${name} failed:\n${err?.stack || err}`);
if (failures.length) process.exit(1);
