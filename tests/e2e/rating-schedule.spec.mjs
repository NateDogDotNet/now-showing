// The household limit by time of day (R-FILT-2, D101): slots such as G from 06:00, PG-13 from 15:00 and no limit from 22:00.
// Random, cached and now-playing posters are all held to the slot in force; the slot changes on screen at its boundary with no
// Save and no reload; an implausible clock gives the strictest limit. The mock's 8 titles carry G, PG, PG-13, R, TV-MA, gb/12,
// gb/15 and no rating (titles 1-8), so at a G slot only title 1 may appear.
//
// The clock is the fake clock: its ISO strings are local times. Nothing here waits for a wall-clock time; every wait is on a
// state (a poster up, a poster gone) with a bound, and the clock is moved only by runFor / setSystemTime.
// Every case runs against its own mock Plex (serveArgs: []) so the cases run side by side.

import assert from 'node:assert/strict';
import { withApp } from './lib.mjs';

const cases = [];
const slotCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], ...opts }, fn });
const check = (name) => console.log(`  ok  ${name}`);

const TITLES = ['The Grand Marquee', 'Midnight Projector', 'Velvet Curtain', 'Popcorn Skies', 'Neon Matinee', 'Last Reel', 'Silver Screen Serenade', 'Encore'];
const titleNo = (alt) => TITLES.indexOf((alt || '').replace(/^Poster: /, '')) + 1; // 0 = nothing recognisable
const ABOVE_G = [2, 3, 4, 5, 6, 7, 8];
const ABOVE_PG13 = [4, 5, 7, 8]; // R, TV-MA, gb/15, unrated
const R_TITLES = [4, 5, 7];

const SLOTS = [
  { start: '06:00', limit: 'G' },
  { start: '15:00', limit: 'PG-13' },
  { start: '22:00', limit: '' },
];

const seed = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  rotateSeconds: 3600,
  showNowPlaying: false,
  maxContentRating: 'PG-13',
  limitSlots: SLOTS,
  ...extra,
});

const activeAlt = (page) => page.evaluate(() => document.querySelector('.poster-layer.active')?.alt || '');
const activeCount = (page) => page.evaluate(() => document.querySelectorAll('.poster-layer.active').length);
const posterShown = (page) => page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
const index = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]'));
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));
const patchSettings = (page, patch) =>
  page.evaluate((p) => localStorage.setItem('plexPoster.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('plexPoster.settings')), ...p })), patch);
const asSorted = (set) => [...set].sort((a, b) => a - b);

/** Click the refresh control and give the tick time to finish (a click during a busy tick is ignored). */
async function showNext(page) {
  await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
  await page.waitForTimeout(250);
}

/** Refreshes `n` times and returns the title numbers on screen after each. */
async function sample(page, n) {
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    await showNext(page);
    seen.add(titleNo(await activeAlt(page)));
  }
  return seen;
}

/** Refreshes until the poster on screen is one of `want` (bounded). */
async function refreshUntil(page, want, max = 120) {
  for (let i = 0; i < max; i++) {
    if (want.includes(titleNo(await activeAlt(page)))) return;
    await showNext(page);
  }
  assert.fail(`none of titles ${want} came up in ${max} refreshes (on screen: ${titleNo(await activeAlt(page))})`);
}

/** Waits (on the state, with a bound) until the poster on screen satisfies `ok`. */
async function waitForTitle(page, ok, what, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (ok(titleNo(await activeAlt(page)), await activeCount(page))) return;
    await page.waitForTimeout(40);
  }
  assert.fail(`${what} did not happen within ${ms} ms (on screen: ${titleNo(await activeAlt(page))}, ${await activeCount(page)} active)`);
}

/** Moves the fake clock forward `ms`, one simulated second at a time, so every one second check runs in between. */
async function advance(page, ms) {
  for (let t = 0; t < ms; t += 1000) await page.clock.runFor(Math.min(1000, ms - t));
}

/** Records the library (pool) requests: `filtered` is true when the request carries the rating filter (a limit was in force). */
const poolRequests = (page) => {
  const seen = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/library/sections/1/all') seen.push({ filtered: u.searchParams.has('contentRating') });
  });
  return seen;
};

const openSettings = async (page) => {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForSelector('#settings[open]');
};
const saveSettings = async (page) => {
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
};
const slotRows = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#slot-list .slot-row')].map((li) => ({
      start: li.querySelector('.slot-start').value,
      limit: li.querySelector('.slot-limit').value,
      days: li.querySelector('.slot-days').value,
    })),
  );

// 1. 07:00, G slot: 30 picks show only title 1.
slotCase('1 07:00 G slot: 30 picks show only G titles', { settings: seed(), clock: { time: '2026-01-05T07:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  const seen = await sample(page, 30);
  assert.deepEqual(asSorted(seen), [1], `titles shown at the G slot: ${asSorted(seen)}`);
  check('07:00 (G slot): 30 picks show only title 1 (the G title)');
});

// 2. 21:59 -> 22:00: the PG-13 slot gives way to "no limit". The poster on screen stays (it is still allowed); at the next rotation
//    an R title can appear, with no reload (D105).
slotCase('2 the clock crosses 22:00: the poster stays, the next rotation lets an R title appear, with no reload', { settings: seed(), clock: { time: '2026-01-05T21:59:00' } }, async ({ page, app }) => {
  const pools = poolRequests(page);
  await page.goto(app.url);
  await posterShown(page);
  await page.evaluate(() => (window.__noReload = true));
  const before = await sample(page, 40);
  for (const t of before) assert.ok(!ABOVE_PG13.includes(t), `title ${t} at 21:59 (PG-13 slot)`);
  assert.ok(pools.length >= 1 && pools.every((p) => p.filtered), 'until 22:00 every pool request carries the rating filter');
  const asked = pools.length;
  await page.clock.setSystemTime(new Date('2026-01-05T21:59:30'));
  const staying = await activeAlt(page);
  await advance(page, 40_000); // 22:00:10
  await page.waitForTimeout(1500);
  assert.equal(await activeAlt(page), staying, 'the boundary did not replace the poster: it is still allowed');
  assert.equal(pools.length, asked, 'a looser boundary loads nothing at once; it waits for the next rotation');
  await page.clock.runFor(3_700_000); // the next rotation (rotateSeconds 3600)
  await posterShown(page);
  await page.waitForTimeout(1500);
  assert.ok(pools.length > asked && pools.slice(asked).some((p) => !p.filtered), 'the rotation after the boundary loaded the pool with no rating filter');
  let seen = new Set();
  for (let i = 0; i < 120 && !R_TITLES.some((t) => seen.has(t)); i++) {
    await showNext(page);
    seen.add(titleNo(await activeAlt(page)));
  }
  assert.ok(R_TITLES.some((t) => seen.has(t)), `an R title appeared after 22:00: ${asSorted(seen)}`);
  assert.equal(await page.evaluate(() => window.__noReload === true), true, 'the page was not reloaded');
  check('21:59 shows only PG-13 or below; the poster stays across 22:00; after the next rotation an R title appears, same page (no reload)');
});

// 3. 05:59 -> 06:00 with an R poster up: it comes off within 2 s and the next poster is G.
slotCase('3 the clock crosses 06:00 with an R poster up: it comes off, the next is G', { settings: seed(), clock: { time: '2026-01-05T05:58:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await refreshUntil(page, R_TITLES); // 05:58 is in the 22:00 "no limit" slot, carried past midnight
  const pools = poolRequests(page);
  await page.evaluate(() => {
    window.__alts = [];
    window.__blocked = false;
    new MutationObserver(() => {
      const on = document.querySelector('.poster-layer.active')?.alt || '';
      if (window.__alts.at(-1) !== on) window.__alts.push(on);
      if (document.body.classList.contains('poster-blocked')) window.__blocked = true;
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'alt'] });
  });
  await advance(page, 60_000); // 05:59:00
  assert.ok(R_TITLES.includes(titleNo(await activeAlt(page))), 'still up before 06:00');
  await advance(page, 62_000); // 06:00:02
  await waitForTitle(page, (n) => !R_TITLES.includes(n), 'the R poster coming off', 2000);
  await waitForTitle(page, (n) => n === 1, 'the next poster (G)');
  assert.equal(await page.evaluate(() => window.__blocked), true, 'the poster was taken off at once (poster-blocked), not only replaced by the next draw');
  assert.ok(pools.some((p) => p.filtered), 'the boundary alone reloaded the pool with the rating filter');
  const seen = await sample(page, 12);
  assert.deepEqual(asSorted(seen), [1], `after 06:00: ${asSorted(seen)}`);
  const alts = await page.evaluate(() => window.__alts);
  const after = alts.map(titleNo).slice(alts.map(titleNo).findIndex((n) => !R_TITLES.includes(n)));
  for (const n of after) assert.ok(n === 0 || n === 1, `from the moment it came off, only nothing or the G title was ever on screen: ${after}`);
  check('R poster on screen at 05:58; after 06:00 it is gone within 2 s and every later poster is G');
});

// 4. Offline at a G slot: nothing cached above G is ever drawn.
slotCase('4 offline at a G slot: no cached poster above G is drawn', { settings: seed({ rotateSeconds: 10 }), clock: { time: '2026-01-05T23:00:00' } }, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  for (let i = 0; i < 200 && (await index(page)).length < 8; i++) await showNext(page); // "no limit" slot: everything is cached
  assert.equal((await index(page)).length, 8, 'all 8 posters are cached');
  await mock.down();
  await page.clock.setSystemTime(new Date('2026-01-06T07:00:00')); // the G slot
  // The fallback must ask the cache for the limit in force (G), not the base limit (PG-13). The poster-on-screen check would hide a
  // fallback that reads the base limit (it refuses what is above G at the draw), so the cache's choice is made certain here:
  // Math.random is fixed so that, among the cached titles at or below PG-13, the one picked first is NOT the G title.
  const belowBase = (await index(page)).map((e) => e.ratingKey).filter((k) => ['1', '2', '3', '6'].includes(k));
  let fixed = null;
  for (const v of [0.1, 0.9]) {
    if ((await page.evaluate(([keys, c]) => keys.slice().sort(() => c - 0.5)[0], [belowBase, v])) !== '1') fixed = v;
  }
  assert.notEqual(fixed, null, 'a fixed Math.random exists that puts a title above G first');
  await page.addInitScript((v) => (Math.random = () => v), fixed);
  await page.reload();
  await waitForTitle(page, (n) => n === 1, 'the first offline tick drawing the cached G title (the fallback asked for the G limit)', 8000);
  const seen = new Set([titleNo(await activeAlt(page))]);
  for (let i = 0; i < 12; i++) {
    await page.clock.runFor(361_000); // past the longest retry backoff: one failed tick per step
    await page.waitForTimeout(300);
    seen.add(titleNo(await activeAlt(page)));
  }
  for (const t of seen) assert.ok(t === 0 || t === 1, `offline at the G slot showed title ${t}`);
  assert.ok(seen.has(1), `the cached G title was shown: ${asSorted(seen)}`);
  for (const t of ABOVE_G) assert.ok(!seen.has(t), `title ${t} was not drawn`);
  check(`Plex down at 07:00 with all 8 cached: only the cached G title is drawn (${asSorted(seen)})`);

  // Nothing cached is at or below G: the empty card says the limit is the reason (the limit in force, not the base PG-13).
  await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('plexPoster.posterIndex')).filter((e) => e.ratingKey !== '1');
    localStorage.setItem('plexPoster.posterIndex', JSON.stringify(list));
  });
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('empty').hidden && /household limit/.test(document.getElementById('empty').textContent), null, { timeout: 15000 });
  assert.equal(await activeCount(page), 0, 'nothing is drawn: the cached PG, PG-13 and R titles are all above the G slot');
  check('offline at the G slot with only titles above G cached: the empty card names the household limit and nothing is drawn');
});

// 5. Offline, an R poster up from the cache in a "no limit" slot; the clock crosses 06:00: it comes off and only G follows.
slotCase('5 offline: the clock crosses into a G slot with an R poster up', { settings: seed({ rotateSeconds: 10 }), clock: { time: '2026-01-05T23:00:00' } }, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  for (let i = 0; i < 200 && (await index(page)).length < 8; i++) await showNext(page);
  await mock.down();
  await page.reload();
  await page.waitForTimeout(1000);
  for (let i = 0; i < 40 && !R_TITLES.includes(titleNo(await activeAlt(page))); i++) {
    await page.clock.runFor(361_000);
    await page.waitForTimeout(300);
  }
  assert.ok(R_TITLES.includes(titleNo(await activeAlt(page))), 'an R poster is up from the cache at 23:xx');
  await page.clock.setSystemTime(new Date('2026-01-06T06:00:30'));
  await advance(page, 3000);
  await waitForTitle(page, (n) => !R_TITLES.includes(n), 'the cached R poster coming off', 2000);
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    await page.clock.runFor(361_000);
    await page.waitForTimeout(300);
    seen.add(titleNo(await activeAlt(page)));
  }
  for (const t of seen) assert.ok(t === 0 || t === 1, `offline after 06:00 showed title ${t}`);
  check(`offline: after the clock crosses 06:00 the cached R poster is gone and only G follows (${asSorted(seen)})`);
});

// 6. Now playing an R title: hidden at a G slot while limitNowPlaying is on; the slot boundary shows or hides it.
slotCase('6 now playing an R title follows the slot', { settings: seed({ showNowPlaying: true, nowPlayingPollSeconds: 5 }), clock: { time: '2026-01-05T07:00:00' } }, async ({ page, app, mock }) => {
  await mock.play('4');
  await page.goto(app.url);
  await posterShown(page);
  const seen = await sample(page, 15);
  assert.ok(!seen.has(4), `title 4 (R) playing at the G slot is hidden: ${asSorted(seen)}`);
  assert.deepEqual(asSorted(seen), [1]);
  await page.clock.setSystemTime(new Date('2026-01-05T21:59:30'));
  await advance(page, 2000); // PG-13 slot: still hidden
  assert.ok(!(await sample(page, 6)).has(4), 'hidden at the PG-13 slot too');
  await advance(page, 40_000); // 22:00:12: "no limit"
  await waitForTitle(page, (n) => n === 4, 'the playing R title showing at 22:00');
  await page.clock.setSystemTime(new Date('2026-01-06T05:59:30'));
  await advance(page, 2000);
  await waitForTitle(page, (n) => n === 4, 'still up at 05:59');
  await advance(page, 40_000); // 06:00:12: G
  await waitForTitle(page, (n) => n !== 4, 'the playing R title coming off at 06:00', 4000);
  await waitForTitle(page, (n) => n === 1, 'a G poster in its place');
  check('now playing an R title: hidden at 07:00; shown from 22:00; hidden again from 06:00');

  await patchSettings(page, { limitNowPlaying: false });
  await page.reload();
  await posterShown(page);
  await waitForTitle(page, (n) => n === 4, 'limitNowPlaying off: the R title shows at a G slot');
  check('limitNowPlaying off: the playing R title is shown even at a G slot');
});

// 7. A clock at 1970 (not set): only G titles, whatever the slots and base limit say.
slotCase('7 clock at 1970: only G titles', { settings: seed({ maxContentRating: 'R' }), clock: { time: '1970-01-01T12:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  const seen = await sample(page, 25);
  assert.deepEqual(asSorted(seen), [1], `titles with the clock at 1970: ${asSorted(seen)}`);
  await page.clock.setSystemTime(new Date('2026-01-05T23:00:00')); // NTP arrives: "no limit"
  await advance(page, 3000);
  const later = new Set();
  for (let i = 0; i < 80 && later.size < 3; i++) {
    await showNext(page);
    later.add(titleNo(await activeAlt(page)));
  }
  assert.ok(later.size >= 3, `once the clock is set the slot applies: ${asSorted(later)}`);
  check('1970 clock: only title 1; once the clock is set the slot in force applies');
});

// 8. The slot editor: add, edit, remove; Save persists, Cancel restores, nothing is live-previewed.
slotCase('8 the slot editor', { settings: seed({ limitSlots: [], maxContentRating: 'R' }), clock: { time: '2026-01-05T12:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.equal(await page.isVisible('#slot-editor'), true);
  assert.equal(await page.isVisible('#slot-empty'), true, 'with no slots it says the limit applies all day');
  assert.equal((await slotRows(page)).length, 0);
  await page.click('#slot-add');
  assert.deepEqual(await slotRows(page), [{ start: '08:00', limit: 'R', days: 'all' }], 'a new slot starts at 08:00 with the current limit');
  assert.equal(await page.isVisible('#slot-empty'), false);
  await page.fill('#slot-list .slot-start', '06:00');
  await page.selectOption('#slot-list .slot-limit', 'G');
  await page.click('#slot-add');
  const second = page.locator('#slot-list .slot-row').nth(1);
  await second.locator('.slot-start').fill('22:00');
  await second.locator('.slot-limit').selectOption('');
  await second.locator('.slot-days').selectOption('weekends');
  await saveSettings(page);
  assert.deepEqual((await stored(page)).limitSlots, [{ start: '06:00', limit: 'G' }, { start: '22:00', limit: '', days: [0, 6] }], 'Save persists the slots');
  check('Add, set the time, the limit and the days: Save persists the slots');

  // The editor says what applies now (the saved settings): Monday 12:00, G since 06:00, the next change is Saturday 22:00.
  await openSettings(page);
  assert.equal(await page.textContent('#slot-status'), 'Saved: in force now: G until Sat 22:00.');
  await page.click('#slot-add'); // an unsaved edit does not change the line
  await page.fill('#slot-list .slot-row:last-child .slot-start', '12:00');
  await page.selectOption('#slot-list .slot-row:last-child .slot-limit', 'NC-17');
  await advance(page, 2000); // the line refreshes every second while the sheet is open
  assert.equal(await page.textContent('#slot-status'), 'Saved: in force now: G until Sat 22:00.', 'the line describes the saved slots, not unsaved edits');
  await page.click('#settings-cancel');
  check('the editor shows "Saved: in force now: G until Sat 22:00." for the saved slots, unchanged by an unsaved edit');

  await openSettings(page);
  assert.deepEqual(await slotRows(page), [{ start: '06:00', limit: 'G', days: 'all' }, { start: '22:00', limit: '', days: 'weekends' }], 'reopened: the saved slots');
  await page.fill('#slot-list .slot-row:first-child .slot-start', '07:30');
  await page.locator('#slot-list .slot-row').nth(1).locator('.slot-remove').click();
  await page.click('#slot-add');
  assert.equal((await slotRows(page)).length, 2);
  await page.click('#settings-cancel');
  assert.deepEqual((await stored(page)).limitSlots, [{ start: '06:00', limit: 'G' }, { start: '22:00', limit: '', days: [0, 6] }], 'Cancel stores nothing');
  await openSettings(page);
  assert.deepEqual(await slotRows(page), [{ start: '06:00', limit: 'G', days: 'all' }, { start: '22:00', limit: '', days: 'weekends' }], 'Cancel restored them');
  check('edit, remove and add, then Cancel: the saved slots are back, nothing stored');

  await page.locator('#slot-list .slot-row').nth(1).locator('.slot-remove').click();
  await page.fill('#slot-list .slot-row:first-child .slot-start', '07:30');
  await saveSettings(page);
  assert.deepEqual((await stored(page)).limitSlots, [{ start: '07:30', limit: 'G' }], 'edit and remove are saved');
  check('edit a slot and remove one: Save persists the change');

  // The household toggle off keeps the saved slots but applies no limit.
  await openSettings(page);
  await page.uncheck('#household-toggle');
  assert.equal(await page.isVisible('#slot-editor'), false, 'the editor lives with the limit');
  await saveSettings(page);
  const off = await stored(page);
  assert.equal(off.maxContentRating, '');
  assert.deepEqual(off.limitSlots, [{ start: '07:30', limit: 'G' }], 'saved slots are kept while the toggle is off');
  const seen = await sample(page, 40);
  assert.ok(seen.size >= 3, `toggle off: no limit applies, whatever the slots say (${asSorted(seen)})`);
  check('household toggle off: slots kept, not applied');
  // With the toggle off the editor is hidden, but the line that says the slots are kept is visible.
  await openSettings(page);
  assert.equal(await page.isVisible('#slot-editor'), false);
  assert.equal(await page.isVisible('#slot-status'), true, 'the status line shows with the toggle off');
  assert.equal(await page.textContent('#slot-status'), 'Saved: no limit applies: the household limit is off (the slots are kept, not applied).');
  await page.click('#settings-cancel');
  check('toggle off: the "kept, not applied" line is visible in Settings');
});

// 9. Slots are never live-previewed: an unsaved slot changes nothing on screen, even while a live field moves.
slotCase('9 an unsaved slot is never previewed', { settings: seed({ limitSlots: [], maxContentRating: 'R' }), clock: { time: '2026-01-05T12:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await refreshUntil(page, R_TITLES);
  const up = titleNo(await activeAlt(page));
  await openSettings(page);
  await page.click('#slot-add');
  await page.fill('#slot-list .slot-start', '00:00');
  await page.selectOption('#slot-list .slot-limit', 'G');
  await page.locator('input[name="posterScale"]').evaluate((el) => {
    el.value = String(Number(el.value) - 5);
    el.dispatchEvent(new Event('input', { bubbles: true })); // a live field: the layout preview runs
  });
  await page.waitForTimeout(400);
  assert.equal(titleNo(await activeAlt(page)), up, 'the unsaved G slot did not take the R poster off');
  assert.equal(await page.evaluate(() => document.body.classList.contains('poster-blocked')), false);
  await page.click('#settings-cancel');
  assert.equal(titleNo(await activeAlt(page)), up, 'Cancel changes nothing either');
  check('an unsaved all-day G slot with the R poster up and a live field moving: the R poster stays; Cancel leaves it');

  await openSettings(page);
  await page.click('#slot-add');
  await page.fill('#slot-list .slot-start', '00:00');
  await page.selectOption('#slot-list .slot-limit', 'G');
  await saveSettings(page);
  await waitForTitle(page, (n) => n === 1, 'Save of the G slot replacing the R poster');
  const seen = await sample(page, 10);
  assert.deepEqual(asSorted(seen), [1]);
  check('Save of the all-day G slot takes the R poster off and only G follows');
});

// 10. The editor fits: 1920x1080, a phone, and rotation 90 (eight slots, the most).
const fitCases = [
  ['1920x1080', { viewport: { width: 1920, height: 1080 } }, {}],
  ['a phone (390x844, touch)', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, {}],
  ['rotation 90', { viewport: { width: 1920, height: 1080 } }, { rotation: 90 }],
];
for (const [label, view, extra] of fitCases) {
  const eight = Array.from({ length: 8 }, (_, i) => ({ start: `${String(i * 3).padStart(2, '0')}:00`, limit: ['G', 'PG', 'PG-13', 'R', 'NC-17', '', 'G', 'PG'][i] }));
  slotCase(`10 the slot editor fits at ${label}`, { ...view, settings: seed({ limitSlots: eight, ...extra }), clock: { time: '2026-01-05T12:00:00' } }, async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    await openSettings(page);
    assert.equal((await slotRows(page)).length, 8);
    assert.equal(await page.isDisabled('#slot-add'), true, 'eight slots is the most: Add is off');
    await page.locator('#slot-list .slot-row').nth(7).locator('.slot-remove').click();
    assert.equal(await page.isDisabled('#slot-add'), false, 'a free place: Add is on');
    await page.click('#slot-add');
    assert.equal(await page.isDisabled('#slot-add'), true);
    await page.locator('#slot-editor').scrollIntoViewIfNeeded();
    const fit = await page.evaluate((rotated) => {
      const within = (inner, outer, slack = 1) => inner.left >= outer.left - slack && inner.right <= outer.right + slack && inner.top >= outer.top - slack && inner.bottom <= outer.bottom + slack;
      const dialog = document.getElementById('settings').getBoundingClientRect();
      const body = document.querySelector('#settings .sheet-body');
      const view = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      const problems = [];
      if (!within(dialog, view, 2)) problems.push(`the sheet leaves the viewport: ${JSON.stringify(dialog)}`);
      const editor = document.getElementById('slot-editor');
      // No limit label is clipped in a slot's limit select: the widest label fits the select's content box less the arrow.
      for (const select of document.querySelectorAll('#slot-list .slot-limit')) {
        const style = getComputedStyle(select);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const room = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 20; // 20 px for the select's arrow
        for (const option of select.options) if (ctx.measureText(option.textContent.trim()).width > room) problems.push(`the limit label "${option.textContent.trim()}" is wider than its select (${Math.round(room)} px)`);
      }
      if (editor.scrollWidth > editor.clientWidth + 1) problems.push(`the slot editor scrolls sideways: ${editor.scrollWidth} > ${editor.clientWidth}`); // (the sheet's own width is not the editor's business)
      const bodyBox = body.getBoundingClientRect();
      const rows = [...document.querySelectorAll('#slot-list .slot-row')];
      for (const [i, row] of rows.entries()) {
        const box = row.getBoundingClientRect();
        if (!rotated && (box.left < bodyBox.left - 1 || box.right > bodyBox.right + 1)) problems.push(`row ${i} leaves the sheet sideways`); // (rows may sit below the fold: the sheet scrolls along its own vertical axis, which is the screen's horizontal one at rotation 90, so there the check is skipped)
        for (const el of row.querySelectorAll('input, select, button')) {
          const r = el.getBoundingClientRect();
          if (r.width < 24 || r.height < 16) problems.push(`row ${i}: a control is ${r.width}x${r.height}`);
          if (!within(r, box)) problems.push(`row ${i}: a control leaves its row`);
        }
      }
      return problems;
    }, Boolean(extra.rotation));
    assert.deepEqual(fit, [], `fit at ${label}`);
    // The Add control and the last row can be scrolled to and pressed.
    await page.locator('#slot-list .slot-row').last().locator('.slot-remove').scrollIntoViewIfNeeded();
    await page.locator('#slot-list .slot-row').last().locator('.slot-remove').click();
    assert.equal((await slotRows(page)).length, 7);
    check(`eight slots fit and work at ${label}`);
  });
}

// 11. A Save that loosens the limit in force redraws at once, and only once; the boundary check does not repeat it.
slotCase('11 Save that changes the slot in force redraws once', { settings: seed({ limitSlots: [] }), clock: { time: '2026-01-05T12:00:00' } }, async ({ page, app }) => {
  const pools = poolRequests(page);
  await page.goto(app.url);
  await posterShown(page);
  const draws = () => page.evaluate(() => window.__draws);
  await page.evaluate(() => {
    window.__draws = 0;
    new MutationObserver((records) => (window.__draws += records.filter((r) => r.target.classList.contains('poster-layer')).length)).observe(document.getElementById('stage'), { attributes: true, subtree: true, attributeFilter: ['src'] });
  });
  await showNext(page);
  await page.waitForTimeout(2500); // the crossfade ends and the old layer's picture is let go: both count as part of one draw
  const perDraw = await draws();
  assert.ok(perDraw >= 1, 'a draw is seen');
  await page.evaluate(() => (window.__draws = 0));
  const asked = pools.length;
  await openSettings(page);
  await page.click('#slot-add');
  await page.fill('#slot-list .slot-start', '00:00');
  await page.selectOption('#slot-list .slot-limit', ''); // no limit all day: looser than PG-13
  await saveSettings(page);
  await page.waitForTimeout(3000);
  assert.ok(pools.length > asked && pools.slice(asked).some((p) => !p.filtered), 'Save reloaded the pool under the slot in force (no filter), with no refresh pressed');
  await advance(page, 4000); // the one second checks run: they must not report the Save\'s own change again
  await page.waitForTimeout(800);
  assert.equal(await draws(), perDraw, 'exactly one draw after the Save');
  check('Save of an all-day "no limit" slot: the pool reloads at once, one draw, and the next checks add none');
});

// 12. A tab brought back to the front catches up with the clock at once (its one second timer may have been slowed).
slotCase('12 returning to the tab applies the slot in force', { settings: seed(), clock: { time: '2026-01-05T05:58:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await refreshUntil(page, R_TITLES);
  await page.clock.pauseAt(new Date('2026-01-05T05:59:00')); // from here no timer runs on its own
  await page.clock.setSystemTime(new Date('2026-01-05T06:00:30')); // the clock moves, no timer fires
  await page.waitForTimeout(500);
  assert.ok(R_TITLES.includes(titleNo(await activeAlt(page))), 'nothing has noticed yet: the one second timer is stopped');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await waitForTitle(page, (n) => !R_TITLES.includes(n), 'the R poster coming off when the tab is shown again', 2000);
  check('timers stopped, clock moved past 06:00: showing the tab takes the R poster off at once');
});

// 13. A tick already running when a STRICTER boundary passes began under the old limit: a forced tick follows it.
slotCase('13 a boundary during a running tick is not lost', { settings: seed(), clock: { time: '2026-01-05T05:59:50' } }, async ({ page, app }) => {
  const pools = poolRequests(page);
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.addInitScript(() => (Math.random = () => 0)); // the busy tick picks the first title (G), which the 06:00 slot also allows
  await page.route('**/library/sections/1/all*', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(app.url);
  await page.waitForTimeout(500);
  assert.equal(pools.length, 1, 'the first tick is waiting for its pool (busy)');
  await advance(page, 15_000); // 06:00:05: the boundary passes while the tick is busy, with nothing on screen yet
  release();
  await posterShown(page);
  await page.waitForTimeout(2000);
  assert.equal(pools[0].filtered, false, 'the running tick began under the "no limit" slot');
  assert.ok(pools.slice(1).some((p) => p.filtered), 'a second pool load under the G slot followed the busy tick');
  check('the stricter boundary passed during a running tick: a forced tick ran after it');
});

// 14. The connection was removed in Settings: a slot boundary makes no request and the first-run card stays up.
slotCase('14 a boundary after the connection was removed changes nothing', { settings: seed(), clock: { time: '2026-01-05T21:59:30' } }, async ({ page, context, app }) => {
  await context.route('https://plex.tv/**', (route) => route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' })); // the first-run card asks plex.tv for a code (K48: answered here)
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.evaluate(() => {
    for (const name of ['plexToken', 'serverUrl']) document.querySelector(`input[name="${name}"]`).value = '';
  });
  await saveSettings(page);
  await page.waitForFunction(() => !document.getElementById('empty').hidden);
  const requests = [];
  page.on('request', (r) => /^http:\/\/127\.0\.0\.1:\d+\/(library|status|identity)/.test(r.url()) && requests.push(r.url()));
  await advance(page, 40_000); // 22:00:10
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => document.getElementById('empty').hidden), false, 'the first-run card is still up');
  assert.deepEqual(requests, [], 'no request was made to a server that is not set up');
  check('connection removed: crossing a slot boundary makes no request; the first-run card stays up');
});

// 15. A weekday set the editor has no preset for is kept as it is when the slots are saved again.
slotCase('15 a custom weekday set survives an edit and Save', { settings: seed({ limitSlots: [{ start: '06:00', limit: 'G', days: [1, 3] }] }), clock: { time: '2026-01-05T12:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.deepEqual(await slotRows(page), [{ start: '06:00', limit: 'G', days: 'custom' }]);
  await page.selectOption('#slot-list .slot-limit', 'PG');
  await saveSettings(page);
  assert.deepEqual((await stored(page)).limitSlots, [{ start: '06:00', limit: 'PG', days: [1, 3] }]);
  await openSettings(page);
  await page.selectOption('#slot-list .slot-days', 'weekdays');
  await saveSettings(page);
  assert.deepEqual((await stored(page)).limitSlots, [{ start: '06:00', limit: 'PG', days: [1, 2, 3, 4, 5] }]);
  check('days Monday and Wednesday: kept through an edit; the preset replaces it when chosen');
});

// 16. A Save that tightens the limit takes the poster off at once even offline, when nothing can replace it.
slotCase('16 offline: Save of a stricter slot takes the poster off', { settings: seed({ rotateSeconds: 10 }), clock: { time: '2026-01-05T23:00:00' } }, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  for (let i = 0; i < 200 && (await index(page)).length < 8; i++) await showNext(page);
  await mock.down();
  await page.reload();
  await page.waitForTimeout(1000);
  for (let i = 0; i < 40 && !R_TITLES.includes(titleNo(await activeAlt(page))); i++) {
    await page.clock.runFor(361_000);
    await page.waitForTimeout(300);
  }
  assert.ok(R_TITLES.includes(titleNo(await activeAlt(page))), 'an R poster is up from the cache at 23:xx');
  await openSettings(page);
  await page.locator('#slot-list .slot-row').nth(2).locator('.slot-limit').selectOption('G'); // the 22:00 slot, in force now
  await saveSettings(page);
  await waitForTitle(page, (n) => !R_TITLES.includes(n), 'the cached R poster coming off at the Save', 2000);
  check('offline with a cached R poster up: Save of a G slot in force takes it off at once');
});

// 17. Save is refused, with a message beside the row, while a slot's time is empty (the review's probe).
slotCase('17 Save is refused while a slot time is empty', { settings: seed(), clock: { time: '2026-01-05T07:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.fill('#slot-list .slot-row:first-child .slot-start', ''); // the 06:00 G row
  await page.click('#settings-save');
  assert.equal(await page.evaluate(() => document.getElementById('settings').open), true, 'the sheet stays open');
  assert.match(await page.textContent('#form-error'), /no start time/);
  const row = page.locator('#slot-list .slot-row').first();
  assert.equal(await row.locator('.slot-error').isVisible(), true, 'a message beside the row');
  assert.match(await row.locator('.slot-error').textContent(), /start time/);
  assert.equal(await row.locator('.slot-start').getAttribute('aria-invalid'), 'true');
  assert.deepEqual((await stored(page)).limitSlots, SLOTS, 'nothing was stored');
  // Mending the time clears the row's message and Save goes through.
  await page.fill('#slot-list .slot-row:first-child .slot-start', '06:30');
  assert.equal(await row.locator('.slot-error').isVisible(), false);
  assert.equal(await page.textContent('#form-error'), '', 'the footer message goes when the time is fixed');
  // The footer message also goes when the bad row is removed.
  await page.fill('#slot-list .slot-row:first-child .slot-start', '');
  await page.click('#settings-save');
  assert.match(await page.textContent('#form-error'), /no start time/);
  await page.locator('#slot-list .slot-row').first().locator('.slot-remove').click();
  assert.equal(await page.textContent('#form-error'), '', 'the footer message goes when the bad row is removed');
  await page.click('#slot-add');
  await page.fill('#slot-list .slot-row:last-child .slot-start', '06:30');
  await page.selectOption('#slot-list .slot-row:last-child .slot-limit', 'G');
  await page.locator('#slot-list .slot-row:last-child').evaluate((li) => li.parentElement.insertBefore(li, li.parentElement.firstElementChild)); // back to the first place
  await saveSettings(page);
  assert.deepEqual((await stored(page)).limitSlots, [{ start: '06:30', limit: 'G' }, SLOTS[1], SLOTS[2]]);
  const seen = await sample(page, 30);
  assert.deepEqual(asSorted(seen), [1], `07:00 stays G after the mended Save: ${asSorted(seen)}`);
  check('an empty slot time: Save refused with a message beside the row and in the footer; mended, it saves');

  // With the household toggle off the rows are hidden; Save is refused all the same and says how to reach the row.
  await openSettings(page);
  await page.fill('#slot-list .slot-row:first-child .slot-start', '');
  await page.uncheck('#household-toggle');
  await page.click('#settings-save');
  assert.equal(await page.evaluate(() => document.getElementById('settings').open), true);
  assert.match(await page.textContent('#form-error'), /Turn on Household with children/);
  await page.click('#settings-cancel');
  check('toggle off with an empty slot time: Save is refused and says to turn the household limit on to see the slot');
});

// 18. A weekend-only slot does not apply on a Monday: the base limit does (D103).
slotCase('18 a weekend-only slot does not apply on a Monday', { settings: seed({ limitSlots: [{ start: '20:00', limit: '', days: [0, 6] }] }), clock: { time: '2026-01-05T12:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  const monday = await sample(page, 30);
  for (const t of monday) assert.ok([1, 2, 3, 6].includes(t), `Monday 12:00 showed title ${t}, above the base PG-13`);
  await openSettings(page);
  assert.equal(await page.textContent('#slot-status'), 'Saved: in force now: PG-13 until Sat 20:00.');
  await page.clock.setSystemTime(new Date('2026-01-10T20:30:00')); // Saturday evening, with the sheet open: the line follows the clock
  await advance(page, 3000);
  assert.equal(await page.textContent('#slot-status'), 'Saved: in force now: No limit until Mon 00:00.');
  await page.clock.setSystemTime(new Date('2026-01-05T12:00:00'));
  await advance(page, 3000);
  assert.equal(await page.textContent('#slot-status'), 'Saved: in force now: PG-13 until Sat 20:00.');
  await page.click('#settings-cancel');
  await page.clock.setSystemTime(new Date('2026-01-05T22:30:00')); // Monday evening: still not applicable
  await advance(page, 3000);
  const evening = await sample(page, 30);
  for (const t of evening) assert.ok([1, 2, 3, 6].includes(t), `Monday 22:30 showed title ${t}`);
  await page.clock.setSystemTime(new Date('2026-01-10T20:30:00')); // Saturday evening: no limit
  await advance(page, 3000);
  const saturday = new Set();
  for (let i = 0; i < 150 && !R_TITLES.some((t) => saturday.has(t)); i++) {
    await showNext(page);
    saturday.add(titleNo(await activeAlt(page)));
  }
  assert.ok(R_TITLES.some((t) => saturday.has(t)), `an R title appears on Saturday evening: ${asSorted(saturday)}`);
  check('weekend-only "no limit from 20:00": Monday noon and Monday evening stay at PG-13; Saturday evening lifts it');
});

// 19. The editor's words and names: the limit labels match the main select, Remove names its slot, the help says what the toggle does.
slotCase('19 slot editor labels, names and help', { settings: seed(), clock: { time: '2026-01-05T12:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  const main = await page.$$eval('select[name="maxContentRating"] option', (os) => os.map((o) => o.textContent.trim()));
  const inRow = await page.$$eval('#slot-list .slot-row:first-child .slot-limit option', (os) => os.map((o) => o.textContent.trim()));
  assert.deepEqual(inRow, [...main, 'No limit'], 'the same labels as the main limit select, then "No limit"');
  assert.ok(main.includes('PG-13 (TV-14)'));
  assert.deepEqual(
    await page.$$eval('#slot-list .slot-remove', (bs) => bs.map((b) => b.getAttribute('aria-label'))),
    ['Remove the 06:00 slot', 'Remove the 15:00 slot', 'Remove the 22:00 slot'],
  );
  await page.fill('#slot-list .slot-row:first-child .slot-start', '07:15');
  assert.equal(await page.getAttribute('#slot-list .slot-row:first-child .slot-remove', 'aria-label'), 'Remove the 07:15 slot', 'the name follows the time');
  assert.match(await page.textContent('#slot-help'), /slots are kept but not applied/);
  assert.match(await page.textContent('#slot-help'), /the line below describes the saved ones/, 'the help points to the status line, which is below it');
  assert.equal(await page.evaluate(() => Boolean(document.getElementById('slot-help').compareDocumentPosition(document.getElementById('slot-status')) & Node.DOCUMENT_POSITION_FOLLOWING)), true, 'and the status line really is below the help');
  check('limit labels match the main select; Remove buttons name their slot; the help says the slots are kept but not applied');
});

// 20. The clock icon inside a time field is a tab stop; while it has focus it shows the accent outline (the other stops do not in that area).
slotCase('20 the time field clock icon shows focus', { settings: seed(), clock: { time: '2026-01-05T12:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  /** How many pixels around the first time field are the accent colour (#e5a00d, the focus outline). */
  const accentPixels = async () => {
    const b = await page.locator('#slot-list .slot-row:first-child .slot-start').boundingBox();
    const png = await page.screenshot({ clip: { x: b.x - 3, y: b.y - 3, width: b.width + 6, height: b.height + 6 } });
    return page.evaluate(async (base64) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      let n = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] > 180 && data[i + 1] > 110 && data[i + 1] < 210 && data[i + 2] < 70) n++;
      return n;
    }, png.toString('base64'));
  };
  await page.focus('#slot-list .slot-row:first-child .slot-start');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab'); // hour, minute, AM/PM, then the icon
  const onIcon = await accentPixels();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'slot-limit', 'the next stop is the limit select');
  const after = await accentPixels();
  assert.ok(onIcon >= 20, `the icon shows an accent outline while it has focus (${onIcon} accent pixels)`);
  assert.equal(after, 0, 'and not once focus has moved on');
  check('the clock icon of a time field shows an accent focus outline');
});

// 21. A paused display keeps an allowed poster across a boundary (D105): the same poster, no draw, no pool load.
slotCase('21 a paused display keeps its poster across a boundary', { settings: seed(), clock: { time: '2026-01-05T21:59:00' } }, async ({ page, app }) => {
  const pools = poolRequests(page);
  await page.goto(app.url);
  await posterShown(page);
  await refreshUntil(page, [1]); // a G poster: allowed under PG-13 and under "no limit"
  await page.evaluate(() => document.querySelector('[data-action="pause"]').click());
  assert.equal(await page.getAttribute('[data-action="pause"]', 'aria-pressed'), 'true', 'paused');
  await page.waitForTimeout(2500); // the last draw's crossfade ends and its old layer is let go
  const asked = pools.length;
  await page.evaluate(() => {
    window.__draws = 0;
    new MutationObserver((records) => (window.__draws += records.length)).observe(document.getElementById('stage'), { attributes: true, subtree: true, attributeFilter: ['src'] });
  });
  await page.clock.setSystemTime(new Date('2026-01-05T21:59:30'));
  await advance(page, 40_000); // 22:00:10: the slot is "no limit" now
  await page.waitForTimeout(2500);
  assert.equal(titleNo(await activeAlt(page)), 1, 'the same poster is still on screen');
  assert.equal(await page.evaluate(() => window.__draws), 0, 'nothing was drawn');
  assert.equal(pools.length, asked, 'no pool was loaded');
  check('paused with a G poster at 21:59: across the 22:00 "no limit" boundary the same poster stays, nothing is drawn');
});

// ---------- run ----------

const WORKERS = Number(process.env.E2E_SCHEDULE_WORKERS || 4);
if (process.env.E2E_SCHEDULE_ONLY) {
  const only = new RegExp(process.env.E2E_SCHEDULE_ONLY);
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
