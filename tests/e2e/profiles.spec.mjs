// Viewer profiles (R-PROF-1, D117): Kids (G, Kids Movies, marquee frame) from 06:00 and Adults (no limit, Movies, no frame) from 21:00.
// The mock: library 1 Movies (titles 1-8, mixed ratings), library 3 Kids Movies (keys 9-13; G: Captain Crayon, The Little Lantern,
// Whisker Wizards; PG: Pudding Planet, Mini Monster Mash).
//
// The clock is the fake clock: its ISO strings are local times. Nothing here waits for a wall-clock time or samples on a cadence: every
// wait is on a state (a poster up, a frame hidden, a poster gone) with a bound, and the "within 2 s" checks read the page's own fake
// clock (what Date.now() says in the page), which moves only when this spec runs it. Every case has its own mock Plex (serveArgs: []).

import assert from 'node:assert/strict';
import { withApp } from './lib.mjs';

const cases = [];
const pCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], ...opts }, fn });
const check = (name) => console.log(`  ok  ${name}`);

const TITLES = ['The Grand Marquee', 'Midnight Projector', 'Velvet Curtain', 'Popcorn Skies', 'Neon Matinee', 'Last Reel', 'Silver Screen Serenade', 'Encore'];
const KIDS_TITLES = ['Captain Crayon', 'The Little Lantern', 'Pudding Planet', 'Whisker Wizards', 'Mini Monster Mash'];
const KIDS_G = ['Captain Crayon', 'The Little Lantern', 'Whisker Wizards'];
const name = (alt) => (alt || '').replace(/^Poster: /, '');
const isMovies = (alt) => TITLES.includes(name(alt));
const isKids = (alt) => KIDS_TITLES.includes(name(alt));

const KIDS = { id: 'kids', name: 'Kids', maxContentRating: 'G', limitNowPlaying: true, libraryKeys: ['3'], libraryNames: ['Kids Movies'], genres: [], ratings: [], source: null, weighting: 'off', noRepeatDays: 0, frameId: 'marquee' };
const ADULTS = { id: 'adults', name: 'Adults', maxContentRating: '', limitNowPlaying: false, libraryKeys: ['1'], libraryNames: ['Movies'], genres: [], ratings: [], source: null, weighting: 'off', noRepeatDays: 0, frameId: 'none' };
const SLOTS = [{ start: '06:00', profile: 'kids' }, { start: '21:00', profile: 'adults' }];

const seed = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  libraryKeys: ['1'],
  libraryNames: ['Movies'],
  rotateSeconds: 3600,
  showNowPlaying: false,
  unwatchedOnly: false,
  maxContentRating: 'PG-13',
  profiles: [KIDS, ADULTS],
  limitSlots: SLOTS,
  ...extra,
});

const activeAlt = (page) => page.evaluate(() => document.querySelector('.poster-layer.active')?.alt || '');
const activeCount = (page) => page.evaluate(() => document.querySelectorAll('.poster-layer.active').length);
const posterShown = (page) => page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));
const frameHidden = (page) => page.evaluate(() => document.getElementById('frame').hidden);

/** Click the refresh control and wait for the poster on screen to be a different, recognised one (a click during a busy tick is ignored: ask again). */
async function next(page) {
  const was = await activeAlt(page);
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
    const changed = await page
      .waitForFunction((p) => { const a = document.querySelector('.poster-layer.active')?.alt || ''; return a !== '' && a !== p; }, was, { timeout: 2500 })
      .then(() => true, () => false);
    if (changed) return name(await activeAlt(page));
  }
  assert.fail(`the poster never changed from ${was}`);
}
async function picks(page, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await next(page));
  return out;
}

/** Asks for the next poster `n` times (a pool of one title never changes, so this waits for the tick to end, not for a change) and returns the titles seen. */
async function sampleRefresh(page, n) {
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
    await page.waitForTimeout(250);
    seen.add(name(await activeAlt(page)));
  }
  return seen;
}

/** Waits (on the state, with a bound) for `ok(alt, activeCount)` to hold. */
async function waitFor(page, ok, what, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    if (ok(await activeAlt(page), await activeCount(page))) return;
    if (Date.now() - t0 > ms) assert.fail(`${what} did not happen (on screen: "${await activeAlt(page)}", ${await activeCount(page)} active)`);
    await page.waitForTimeout(40);
  }
}

/** Moves the fake clock forward `ms`, one simulated second at a time, so every one second check runs in between. */
async function advance(page, ms) {
  for (let t = 0; t < ms; t += 1000) await page.clock.runFor(Math.min(1000, ms - t));
}

const openSettings = async (page) => {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForSelector('#settings[open]');
};
const saveSettings = async (page) => {
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
};
const cancelSettings = async (page) => {
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
};
const profileNames = (page) => page.$$eval('#profile-list .profile-rename', (els) => els.map((e) => e.value));
const addProfile = async (page, label) => {
  await page.fill('#profile-name', label);
  await page.click('#profile-add');
};
const index = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]'));
const settled = (page) => page.waitForFunction(() => /^✓/.test(document.getElementById('test-result').textContent), null, { timeout: 15000 });

/**
 * Stamps, with the PAGE's clock (Date.now() in the page is the fake clock), when the poster comes off ("off") and every request the page makes
 * ("fetch"): how long a removal takes, and whether it came before the next request, are read off a clock that moves only when this spec runs it.
 */
const watchOff = (page) =>
  page.evaluate(() => {
    window.__events = [];
    new MutationObserver(() => {
      const gone = document.body.classList.contains('poster-blocked') || !document.querySelector('.poster-layer.active')?.alt;
      if (gone && !window.__events.some((e) => e.kind === 'off')) window.__events.push({ kind: 'off', t: Date.now() });
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'alt'] });
    const realFetch = window.fetch.bind(window);
    window.fetch = (...args) => (window.__events.push({ kind: 'fetch', t: Date.now() }), realFetch(...args));
  });
async function assertOffWithin2sBeforeNextRequest(page, boundaryIso) {
  const boundary = new Date(boundaryIso).getTime();
  const events = await page.evaluate(() => window.__events);
  const off = events.find((e) => e.kind === 'off' && e.t >= boundary);
  assert.ok(off && off.t - boundary <= 2000, `the poster came off ${off ? off.t - boundary : 'never'} ms after the boundary on the page clock (at most 2000)`);
  const next = events.find((e) => e.kind === 'fetch' && e.t >= boundary);
  assert.ok(next && events.indexOf(off) < events.indexOf(next), 'the poster came off BEFORE the page asked for anything: remove first, then reload (D104)');
}

/** Holds every poster image request until `release()`; returns { hold, release, held }. */
async function holdImages(page) {
  let open = true;
  const waiting = [];
  await page.route('**/photo/**', async (route) => {
    if (!open) return route.continue();
    await new Promise((resolve) => waiting.push(resolve));
    return route.continue();
  });
  return {
    hold: () => (open = true),
    release: () => {
      open = false;
      waiting.splice(0).forEach((r) => r());
    },
    heldCount: () => waiting.length,
  };
}

/** Creates a profile through the editor: names it, opens it, sets what `setup` sets, and presses Done. */
async function makeProfile(page, label, setup = async () => {}) {
  await page.fill('#profile-name', label);
  await page.click('#profile-add');
  await page.waitForSelector('#profile-banner:not([hidden])');
  await setup();
  await page.click('#profile-done');
  await page.waitForSelector('#profile-banner', { state: 'hidden' });
}

// 1. 07:00: only Kids Movies titles rated G, and the Kids frame.
pCase('1 07:00: only Kids Movies titles rated G, and the Kids frame', { settings: seed(), clock: { time: '2026-01-05T07:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  const seen = new Set(await picks(page, 30));
  assert.deepEqual([...seen].sort(), [...KIDS_G].sort(), `titles at 07:00: ${[...seen]}`);
  assert.equal(await frameHidden(page), false, 'the Kids frame (marquee) is up');
  assert.match(await page.evaluate(() => document.getElementById('frame').getAttribute('src')), /marquee/);
  check('07:00: 30 picks are G titles of Kids Movies only; the marquee frame shows');
});

// 2. Across 21:00 the Adults bundle applies with no reload: the frame goes, the Kids poster (not in Movies) comes off, a Movies title follows.
pCase('2 the clock crosses 21:00: the Adults bundle applies with no reload', { settings: seed(), clock: { time: '2026-01-05T20:58:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await page.evaluate(() => (window.__noReload = true));
  assert.equal(isKids(await activeAlt(page)), true, 'a Kids Movies poster before 21:00');
  assert.equal(await frameHidden(page), false);
  await advance(page, 62_000); // 20:59:02
  assert.equal(await frameHidden(page), false, 'still the Kids frame a minute before');
  await advance(page, 60_000); // 21:00:02
  await waitFor(page, (alt) => isMovies(alt), 'a Movies title replacing the Kids poster');
  assert.equal(await frameHidden(page), true, 'the Adults profile has no frame');
  assert.equal(await page.evaluate(() => window.__noReload === true), true, 'the page was not reloaded');
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(await next(page));
  assert.ok(seen.has('Popcorn Skies') || seen.has('Neon Matinee') || seen.has('Silver Screen Serenade'), `an R or unrated title appears with no limit: ${[...seen]}`);
  for (const t of seen) assert.ok(TITLES.includes(t), `only Movies titles after 21:00, got ${t}`);
  check('21:00: the frame is gone, a Movies title is up, R titles appear, same page (no reload)');
});

// 3. Across 06:00 a poster only the Adults selection allows leaves within 2 s, before the next request. The 2 s are read on the page's clock.
pCase('3 the clock crosses 06:00 with a poster only the Adults selection allows up: it leaves within 2 s of the boundary', { settings: seed(), clock: { time: '2026-01-05T05:58:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await refreshTo(page, 'The Grand Marquee'); // rated G: Kids' limit allows it, so only Kids' selection (Kids Movies) can take it off
  assert.equal(isMovies(await activeAlt(page)), true, '05:58 is the Adults profile, carried past midnight');
  await watchOff(page);
  await advance(page, 60_000); // 05:59:00
  assert.equal(await page.evaluate(() => window.__events.some((e) => e.kind === 'off')), false, 'still up before 06:00');
  await advance(page, 62_000); // 06:00:02
  await waitFor(page, (alt) => !isMovies(alt), 'the Adults-only poster coming off');
  await assertOffWithin2sBeforeNextRequest(page, '2026-01-05T06:00:00');
  await waitFor(page, (alt) => KIDS_G.includes(name(alt)), 'a Kids G poster');
  check('a poster only the Adults selection allows leaves within 2 s of 06:00 and before the next request; a Kids G one follows');
});

// 3b. The limit alone takes a poster off: both profiles read Movies, Kids is G, Adults has no limit.
pCase('3b a poster above the new profile\'s limit leaves within 2 s even when the selection is the same', {
  settings: seed({ profiles: [{ ...KIDS, libraryKeys: ['1'], libraryNames: ['Movies'] }, ADULTS] }),
  clock: { time: '2026-01-05T05:58:00' },
}, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await refreshTo(page, 'Popcorn Skies'); // rated R
  await watchOff(page);
  await advance(page, 122_000); // 06:00:02
  await waitFor(page, (alt) => name(alt) !== 'Popcorn Skies', 'the R poster coming off');
  await assertOffWithin2sBeforeNextRequest(page, '2026-01-05T06:00:00');
  await waitFor(page, (alt) => name(alt) === 'The Grand Marquee', 'the only G title in Movies');
  check('the limit alone takes an R poster off within 2 s and before the next request');
});

// 4. A poster both profiles allow stays across the boundary.
pCase('4 a poster the next profile also allows stays', {
  settings: seed({ profiles: [KIDS, { ...ADULTS, libraryKeys: ['3'], libraryNames: ['Kids Movies'] }] }),
  clock: { time: '2026-01-05T20:58:00' },
}, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await refreshToGKids(page);
  const staying = await activeAlt(page);
  await advance(page, 5 * 60_000); // 21:03: Adults (no limit, the same library)
  assert.equal(await activeAlt(page), staying, 'allowed under the new profile: it stays');
  assert.equal(await frameHidden(page), true, 'but the new frame applies');
  check('an allowed poster stays across the boundary; the new frame applies');
});
/** Asks for posters until `title` is the one on screen (bounded). */
async function refreshTo(page, title) {
  for (let i = 0; i < 120 && name(await activeAlt(page)) !== title; i++) await next(page);
  assert.equal(name(await activeAlt(page)), title);
}
async function refreshToGKids(page) {
  for (let i = 0; i < 40 && !KIDS_G.includes(name(await activeAlt(page))); i++) await next(page);
  assert.ok(KIDS_G.includes(name(await activeAlt(page))));
}

// 5. Profiles are edited apart from the household's own values (D120 1): household PG, Kids G and Adults No limit, Save: the household is still PG.
pCase('5 a profile is built apart from the household values: household PG, Kids G, Adults No limit, Save, and the household is still PG', {
  settings: seed({ profiles: [], limitSlots: [], maxContentRating: 'PG' }),
  clock: { time: '2026-01-05T12:00:00' },
}, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  assert.equal(await page.isVisible('#profile-empty'), true);
  await page.fill('#profile-name', '  Kids  ');
  await page.click('#profile-add');
  await page.waitForSelector('#profile-banner:not([hidden])');
  const banner = await page.textContent('#profile-banner-text');
  assert.match(banner, /Kids/);
  for (const word of [/limit/, /now-playing|playing/, /selection/, /weighting/, /days/, /frame/]) assert.match(banner, word, 'the banner names everything the profile holds');
  assert.deepEqual(await page.evaluate(() => [document.getElementById('profile-editor').inert, document.getElementById('household-toggle').disabled, document.getElementById('position-btn').disabled]), [true, true, true], 'the rows, the household toggle and position mode are off while a profile is open');
  assert.equal(await page.isVisible('#settings-save'), false, 'Save is not offered while a profile is open');
  assert.equal(await page.isVisible('#settings-cancel'), false, 'nor Cancel');
  assert.equal(await page.isVisible('#profile-done') && (await page.isVisible('#profile-discard')), true);
  assert.deepEqual(await page.$$eval('[name="maxContentRating"] option', (os) => os.map((o) => o.value)), ['G', 'PG', 'PG-13', 'R', 'NC-17', ''], 'a profile\'s limit list also offers No limit');
  assert.equal(await page.inputValue('[name="maxContentRating"]'), 'PG', 'a new profile starts from what the sheet shows');
  await page.selectOption('[name="maxContentRating"]', 'G');
  await page.check('#library-list input[value="3"]');
  await page.uncheck('#library-list input[value="1"]');
  await page.selectOption('[name="frameId"]', 'marquee-glow');
  assert.match(await page.evaluate(() => document.getElementById('frame').getAttribute('src')), /marquee\.png/, 'the profile\'s frame is not previewed on the display');
  await page.click('#profile-done');
  await page.waitForSelector('#profile-banner', { state: 'hidden' });
  assert.equal(await page.isVisible('#settings-save'), true);
  assert.deepEqual([await page.inputValue('[name="maxContentRating"]'), await page.inputValue('[name="frameId"]'), await page.isChecked('#library-list input[value="1"]'), await page.isChecked('#library-list input[value="3"]')], ['PG', 'marquee', true, false], 'the household values are back');
  assert.deepEqual(await page.$$eval('[name="maxContentRating"] option', (os) => os.map((o) => o.value)), ['G', 'PG', 'PG-13', 'R', 'NC-17'], 'No limit is offered only while a profile is open');
  assert.match(await page.textContent('#profile-list .profile-summary'), /^G · Kids Movies · /);
  assert.equal(await page.textContent('#profile-notice'), 'Kids kept; it applies when you press Save.', 'Done says so in a polite live region');
  assert.equal(await page.getAttribute('#profile-notice', 'aria-live'), 'polite');
  const help = await page.textContent('#profile-help');
  assert.match(help, /limit too/);
  assert.match(help, /looser/);
  assert.match(help, /status line/);
  assert.equal(await page.inputValue('#profile-name'), '', 'the name box is empty again');
  await makeProfile(page, 'Adults', () => page.selectOption('[name="maxContentRating"]', ''));
  assert.match(await page.textContent('#profile-list li:nth-child(2) .profile-summary'), /^No limit · Movies · /);
  assert.deepEqual((await stored(page)).profiles ?? [], [], 'nothing is stored before Save');
  await saveSettings(page);
  const saved = await stored(page);
  assert.deepEqual([saved.maxContentRating, saved.libraryKeys, saved.frameId], ['PG', ['1'], 'marquee'], 'the household is still PG, Movies, marquee');
  assert.deepEqual(saved.profiles.map((p) => [p.name, p.maxContentRating, p.libraryKeys, p.frameId]), [['Kids', 'G', ['3'], 'marquee-glow'], ['Adults', '', ['1'], 'marquee']]);
  check('a profile is built apart from the household values; Save leaves the household as it was');
});

// 5b. Discard, the empty-selection refusal, a whole-sheet Cancel, rename, duplicates, the slot refusal, the cap.
pCase('5b the editor: Discard and Done, a profile with no library, Cancel, rename, duplicates, deleting a slot\'s profile, the cap', {
  settings: seed({ profiles: [KIDS, ADULTS], limitSlots: [], maxContentRating: 'PG' }),
  clock: { time: '2026-01-05T12:00:00' },
}, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  assert.deepEqual(await profileNames(page), ['Kids', 'Adults']);
  // Discard puts the household back and changes nothing.
  await page.click('#profile-list li:nth-child(1) .profile-edit');
  await page.waitForSelector('#profile-banner:not([hidden])');
  assert.equal(await page.inputValue('[name="maxContentRating"]'), 'G', 'Edit shows the profile\'s values');
  assert.equal(await page.isChecked('#library-list input[value="3"]'), true);
  await page.selectOption('[name="maxContentRating"]', 'R');
  await page.click('#profile-discard');
  await page.waitForSelector('#profile-banner', { state: 'hidden' });
  assert.equal(await page.inputValue('[name="maxContentRating"]'), 'PG');
  assert.match(await page.textContent('#profile-list li:nth-child(1) .profile-summary'), /^G · Kids Movies/, 'the profile is unchanged');
  // Done is refused while no library or source is ticked.
  await page.click('#profile-list li:nth-child(1) .profile-edit');
  await page.waitForSelector('#profile-banner:not([hidden])');
  await page.press('[name="noRepeatDays"]', 'Enter'); // Enter in a field must not save the sheet while a profile is open
  assert.deepEqual(await page.evaluate(() => [document.getElementById('settings').open, !document.getElementById('profile-banner').hidden]), [true, true]);
  await page.uncheck('#library-list input[value="3"]');
  await page.click('#profile-done');
  assert.match(await page.textContent('#profile-banner-error'), /library/);
  assert.equal(await page.isVisible('#profile-banner'), true, 'the profile stays open');
  await page.click('#profile-discard');
  // A whole-sheet Cancel (Escape) while a profile is open restores everything.
  await page.click('#profile-list li:nth-child(1) .profile-edit');
  await page.waitForSelector('#profile-banner:not([hidden])');
  await page.selectOption('[name="maxContentRating"]', 'R');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  assert.equal((await stored(page)).maxContentRating, 'PG');
  assert.equal((await stored(page)).profiles[0].maxContentRating, 'G');
  await openSettings(page);
  assert.equal(await page.isVisible('#profile-banner'), false, 'reopened with no profile open');
  assert.deepEqual([await page.inputValue('[name="maxContentRating"]'), await page.isVisible('#settings-save')], ['PG', true]);
  // Rename, duplicates and empty names.
  await page.fill('#profile-name', 'kids');
  await page.click('#profile-add');
  assert.match(await page.textContent('#profile-error'), /already/);
  assert.equal(await page.isVisible('#profile-banner'), false, 'a refused name opens nothing');
  await page.fill('#profile-name', '   ');
  await page.click('#profile-add');
  assert.match(await page.textContent('#profile-error'), /name/);
  await page.fill('#profile-list li:nth-child(1) .profile-rename', 'Little ones');
  await page.press('#profile-list li:nth-child(1) .profile-rename', 'Enter');
  assert.equal(await page.evaluate(() => document.getElementById('settings').open), true, 'Enter in a name box does not save the sheet');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'profile-rename', 'focus stays in the renamed box');
  assert.deepEqual(await profileNames(page), ['Little ones', 'Adults']);
  await page.fill('#profile-list li:nth-child(1) .profile-rename', 'ADULTS');
  await page.press('#profile-list li:nth-child(1) .profile-rename', 'Enter');
  assert.match(await page.textContent('#profile-error'), /already/);
  assert.deepEqual(await profileNames(page), ['Little ones', 'Adults'], 'a clashing rename is put back');
  // A click on another row's button right after typing a new name is not lost.
  await page.fill('#profile-list li:nth-child(1) .profile-rename', 'Kids again');
  await page.click('#profile-list li:nth-child(2) .profile-edit');
  await page.waitForSelector('#profile-banner:not([hidden])');
  assert.match(await page.textContent('#profile-banner-text'), /Adults/, 'the click opened the other profile');
  await page.click('#profile-discard');
  assert.deepEqual(await profileNames(page), ['Kids again', 'Adults'], 'and the rename was kept');
  // A rename followed by that row's own Edit: the banner names the profile as it is now, with its bundle.
  await page.fill('#profile-list li:nth-child(1) .profile-rename', 'Kids final');
  await page.click('#profile-list li:nth-child(1) .profile-edit');
  await page.waitForSelector('#profile-banner:not([hidden])');
  assert.match(await page.textContent('#profile-banner-text'), /Kids final/);
  assert.equal(await page.inputValue('[name="maxContentRating"]'), 'G');
  await page.click('#profile-discard');
  await page.fill('#profile-list li:nth-child(1) .profile-rename', 'Kids again');
  await page.press('#profile-list li:nth-child(1) .profile-rename', 'Enter');
  assert.equal(await page.$eval('#profile-list li:nth-child(1) .profile-rename', (el) => el.labels[0].textContent.trim()), 'Profile name');
  assert.equal(await page.$eval('#profile-list li:nth-child(1) .profile-rename', (el) => el.getAttribute('aria-describedby').includes('profile-help')), true);
  // A slot uses a profile; deleting it is refused, naming the slot.
  await page.click('#slot-add');
  await page.fill('#slot-list .slot-start', '06:00');
  assert.deepEqual(await page.$$eval('#slot-list .slot-limit optgroup option', (os) => os.map((o) => o.textContent)), ['Profile: Kids again', 'Profile: Adults']);
  await page.selectOption('#slot-list .slot-limit', { label: 'Profile: Kids again' });
  await page.click('#profile-list li:nth-child(1) .profile-remove');
  assert.match(await page.textContent('#profile-error'), /Kids again.*the 06:00 slot/);
  assert.deepEqual(await profileNames(page), ['Kids again', 'Adults']);
  await saveSettings(page);
  const saved = await stored(page);
  assert.deepEqual(saved.profiles.map((p) => p.name), ['Kids again', 'Adults']);
  assert.deepEqual(saved.limitSlots, [{ start: '06:00', profile: saved.profiles[0].id }]);
  // The cap: deleting one, adding up to six, the seventh refused.
  await openSettings(page);
  await page.click('#profile-list li:nth-child(2) .profile-remove');
  assert.deepEqual(await page.$$eval('#slot-list .slot-limit optgroup option', (os) => os.map((o) => o.textContent)), ['Profile: Kids again'], 'the slot choices follow the deletion');
  for (const n of ['B', 'C', 'D', 'E', 'F']) await makeProfile(page, n);
  assert.equal((await profileNames(page)).length, 6);
  assert.equal(await page.isDisabled('#profile-add'), true, 'the 7th is refused: the button is off at 6');
  await page.fill('#profile-name', 'G7');
  await page.press('#profile-name', 'Enter');
  assert.equal((await profileNames(page)).length, 6);
  assert.match(await page.textContent('#profile-error'), /6 profiles/);
  await cancelSettings(page);
  assert.equal((await stored(page)).profiles.length, 2, 'Cancel kept the saved two');
  check('the editor: Discard, Done refused with no library, Escape restores, rename keeps focus, nothing lost, refusals, cap');
});

// 6. A slot naming a missing profile gives G while it is in force (D120 2), and the sheet says so.
pCase('6 a slot naming a missing profile shows only G titles and the sheet says so', { settings: seed({ profiles: [KIDS], limitSlots: [{ start: '06:00', profile: 'ghost' }], maxContentRating: 'R' }), clock: { time: '2026-01-05T07:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  const seen = await sampleRefresh(page, 12);
  for (const t of seen) assert.equal(t, 'The Grand Marquee', `only the G title of the sheet's library: ${t}`);
  await openSettings(page);
  assert.match(await page.textContent('#slot-status'), /names a profile that does not exist, so G applies/);
  assert.equal(await page.$eval('#slot-list .slot-limit', (s) => s.selectedOptions[0].textContent), 'Profile: missing');
  await cancelSettings(page);
  check('a missing profile gives G and the status line says why');
});

// 7. An upgrade with no profiles changes nothing.
pCase('7 an upgrade with no profiles: the same posters, the same frame, nothing added to the settings but an empty list', {
  settings: (app) => ({ plexToken: 'demo-token', serverUrl: `http://127.0.0.1:${app.mockPort}`, libraryKey: '1', rotateSeconds: 3600, showNowPlaying: false, unwatchedOnly: false, maxContentRating: 'PG', limitSlots: [{ start: '06:00', limit: 'G' }] }),
  clock: { time: '2026-01-05T12:00:00' },
}, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  const seen = await sampleRefresh(page, 12);
  assert.deepEqual([...seen].sort(), ['The Grand Marquee'], 'the G slot at noon: title 1 only');
  assert.equal(await frameHidden(page), false);
  await openSettings(page);
  assert.equal(await page.isVisible('#profile-empty'), true);
  assert.equal(await page.$eval('#slot-list .slot-limit', (s) => s.querySelectorAll('optgroup').length), 0, 'no profile choices when there are no profiles');
  await saveSettings(page);
  const s = await stored(page);
  assert.deepEqual([s.profiles, s.limitSlots, s.frameId, s.maxContentRating], [[], [{ start: '06:00', limit: 'G' }], 'marquee', 'PG']);
  check('upgrade: no profiles, the slots and the frame are as they were');
});

// 8. The household toggle off: slots and profiles are kept and not applied; no profile switches anything (D120 4).
pCase('8 with the household toggle off no profile switches anything: the sheet\'s library, no limit, the sheet\'s frame', { settings: seed({ maxContentRating: '' }), clock: { time: '2026-01-05T07:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  const seen = new Set(await picks(page, 40));
  for (const t of seen) assert.ok(TITLES.includes(t), `the sheet's library (Movies), not Kids Movies: ${t}`);
  assert.ok(['Popcorn Skies', 'Neon Matinee', 'Silver Screen Serenade', 'Encore'].some((t) => seen.has(t)), `no limit applies: an R or unrated title appears: ${[...seen]}`);
  assert.equal(await frameHidden(page), false, 'the sheet\'s own frame (marquee)');
  await page.clock.setSystemTime(new Date('2026-01-05T21:30:00')); // the Adults slot: its frame (none) must not switch in
  await advance(page, 3000);
  assert.equal(await frameHidden(page), false, 'still the sheet\'s frame at 21:30');
  assert.ok(TITLES.includes(await next(page)), 'and still Movies');
  await openSettings(page);
  assert.match(await page.textContent('#slot-status'), /household limit is off \(the slots and profiles are kept, not applied\)/);
  await cancelSettings(page);
  check('toggle off: nothing is applied from any slot or profile, and the status line says so');
});

// 9. Profiles are not live-previewed: an edit to a profile stays out of sight while the sheet is open, even when another live control
//    sends the sheet's values to the display; Save applies it, Cancel drops it.
pCase('9 an unsaved profile edit is not previewed through another control, and Save applies it', { settings: seed(), clock: { time: '2026-01-05T07:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  assert.equal(await frameHidden(page), false, 'Kids has the marquee frame');
  await openSettings(page);
  await page.click('#profile-list li:nth-child(1) .profile-edit');
  await page.waitForSelector('#profile-banner:not([hidden])');
  await page.selectOption('[name="frameId"]', 'none');
  await page.click('#profile-done'); // Kids now holds "No frame" (unsaved)
  await page.fill('[name="posterScale"]', '95'); // another live control: its preview sends the sheet's values, profiles included
  assert.equal(await frameHidden(page), false, 'the unsaved Kids frame is not in force');
  await cancelSettings(page);
  assert.equal(await frameHidden(page), false);
  assert.equal((await stored(page)).profiles[0].frameId, 'marquee', 'Cancel kept the saved profile');
  await openSettings(page);
  await page.click('#profile-list li:nth-child(1) .profile-edit');
  await page.waitForSelector('#profile-banner:not([hidden])');
  await page.selectOption('[name="frameId"]', 'none');
  await page.click('#profile-done');
  await saveSettings(page);
  await page.waitForFunction(() => document.getElementById('frame').hidden, null, { timeout: 10000 });
  assert.equal((await stored(page)).profiles[0].frameId, 'none');
  assert.equal((await stored(page)).frameId, 'marquee', 'the household\'s own frame is untouched');
  check('profile edits wait for Save: not previewed through another control, dropped by Cancel, applied by Save');
});

// 9b. Done and Discard preview nothing (D134 ruling 5, D135 5; supersedes D123 1 and "Done and Discard send one preview" in D122 4). The control that
//     does not preview live is "Cross-fade" (Advanced): the display carries it as --fade-ms on the root. The page records every value the display is
//     given. The settle point is the page's own clock run for 2 s after the last click, so nothing waits on wall time.
const FADE_X = 2500;
const fadeSeen = (page) => page.evaluate(() => window.__fade);
const watchFade = (page) =>
  page.evaluate(() => {
    const read = () => document.documentElement.style.getPropertyValue('--fade-ms');
    window.__fade = [read()];
    new MutationObserver(() => {
      const v = read();
      if (window.__fade[window.__fade.length - 1] !== v) window.__fade.push(v);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  });
/**
 * Opens profile `nth`, makes one edit in it, and ends it with `button` (#profile-done or #profile-discard). The edit in Adults is its no-repeat days, a
 * control that does not preview: a live control (the frame) would send the sheet's household values, X included, which D122 4 rules.
 */
async function editProfileThen(page, nth, edit, button) {
  await page.click(`#profile-list li:nth-child(${nth}) .profile-edit`);
  await page.waitForSelector('#profile-banner:not([hidden])');
  await edit();
  if (button === '#profile-done') await page.fill('[name="crossfadeMs"]', String(FADE_X)); // the household control X, editable while a profile is open
  await page.click(button);
  await page.waitForSelector('#profile-banner', { state: 'hidden' });
}
async function runSequence(page, app) {
  await page.goto(app.url);
  await posterShown(page);
  await watchFade(page);
  await openSettings(page);
  await page.click('#advanced > summary');
  await editProfileThen(page, 1, () => page.fill('[name="noRepeatDays"]', '4'), '#profile-done'); // an edit in Kids (no-repeat days), X changed, Done
  await editProfileThen(page, 2, () => page.fill('[name="noRepeatDays"]', '5'), '#profile-discard'); // an edit in Adults, Discard
  await advance(page, 2000); // the named settle point
  assert.equal(await frameHidden(page), false, 'Kids still shows its saved frame');
  assert.deepEqual(await fadeSeen(page), ['1200ms'], 'neither Done nor Discard put the household cross-fade on the display');
}
pCase('9b Done and Discard send no preview: the unsaved household control waits for Save', { settings: seed(), clock: { time: '2026-01-05T07:00:00' } }, async ({ page, app }) => {
  await runSequence(page, app);
  await saveSettings(page);
  await page.waitForFunction((x) => document.documentElement.style.getPropertyValue('--fade-ms') === `${x}ms`, FADE_X, { timeout: 10000 });
  assert.equal((await stored(page)).crossfadeMs, FADE_X, 'Save applies it');
  check('Done and Discard send no preview; Save applies the unsaved household control');
});
pCase('9c the same sequence ended by a whole-sheet Cancel leaves the display and the stored value as before', { settings: seed(), clock: { time: '2026-01-05T07:00:00' } }, async ({ page, app }) => {
  await runSequence(page, app);
  await cancelSettings(page);
  await advance(page, 2000);
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--fade-ms')), '1200ms');
  assert.equal((await stored(page)).crossfadeMs ?? 1200, 1200, 'the stored cross-fade is as before');
  assert.equal(await frameHidden(page), false);
  assert.equal((await stored(page)).profiles[0].frameId, 'marquee', 'Cancel kept the saved profile');
  check('a whole-sheet Cancel after Done and Discard restores the display and the stored value');
});

// 10. A Save that changes the selection of the profile in force draws again at once (the pool follows the selection in force).
pCase('10 a Save that changes the selection in force redraws at once', { settings: seed({ maxContentRating: 'G' }), clock: { time: '2026-01-05T07:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  assert.equal(isKids(await activeAlt(page)), true, 'Kids Movies at 07:00');
  await openSettings(page);
  await settled(page);
  await page.click('#profile-list li:nth-child(1) .profile-edit');
  await page.waitForSelector('#profile-banner:not([hidden])');
  await page.check('#library-list input[value="1"]');
  await page.uncheck('#library-list input[value="3"]'); // Kids now reads Movies (its limit stays G, the household's G is untouched)
  await page.click('#profile-done');
  await saveSettings(page);
  await waitFor(page, (alt) => isMovies(alt), 'a Movies title: the Kids poster is not in the new Kids selection');
  check('a Save that changes the selection in force redraws from the new selection');
});

// 11. The profile's now-playing rule: Kids (G) hides an R title playing; a profile that does not apply the limit shows it.
pCase('11 the profile\'s now-playing rule decides whether an R title playing is shown', {
  settings: seed({ showNowPlaying: true, nowPlayingPollSeconds: 5, profiles: [{ ...KIDS, limitNowPlaying: false }, ADULTS] }),
  clock: { time: '2026-01-05T07:00:00' },
}, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  await mock.play(4); // Popcorn Skies, rated R
  await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
  await waitFor(page, (alt) => name(alt) === 'Popcorn Skies', 'the R title playing, shown: this Kids profile does not apply the limit to what is playing');
  check('limitNowPlaying false in the profile in force shows the title playing');
});
pCase('11b a profile that applies the limit to what is playing hides an R title playing', {
  settings: seed({ showNowPlaying: true, nowPlayingPollSeconds: 5 }),
  clock: { time: '2026-01-05T07:00:00' },
}, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  await mock.play(4);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
    await page.waitForTimeout(250);
    assert.notEqual(name(await activeAlt(page)), 'Popcorn Skies', 'Kids applies the limit to what is playing');
  }
  check('limitNowPlaying true in the profile in force hides the R title playing');
});

// 12. A profile in force that ticks no library and has no source shows the empty card naming it (D120 3).
pCase('12 a profile with no library in force shows the empty card naming it', { settings: seed({ profiles: [{ ...KIDS, libraryKeys: [], libraryNames: [] }, ADULTS] }), clock: { time: '2026-01-05T07:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForFunction(() => !document.getElementById('empty').hidden && /Kids/.test(document.getElementById('empty').textContent), null, { timeout: 15000 });
  assert.equal(await activeCount(page), 0, 'no poster behind it');
  check('the empty card names the profile that chooses nothing');
});

// 13. The offline fallback reads the selection in force: under Kids (Kids Movies, rated G) no cached Movies poster is drawn, though The Grand
//     Marquee (G, Movies) is cached and the household's own selection reads Movies.
pCase('13 offline under a profile slot only cached posters of the profile\'s selection are drawn', {
  settings: seed({ profiles: [{ ...KIDS, ratings: ['G'] }, ADULTS], rotateSeconds: 10 }),
  clock: { time: '2026-01-05T07:00:00' },
}, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  const cached = async (keys) => (await index(page)).map((e) => e.ratingKey).filter((k) => keys.includes(k)).length;
  for (let i = 0; i < 150 && (await cached(['9', '10', '12'])) < 3; i++) await next(page); // Kids G titles cached
  assert.equal(await cached(['9', '10', '12']), 3);
  await page.clock.setSystemTime(new Date('2026-01-05T22:00:00')); // Adults: Movies, no limit
  await advance(page, 3000);
  for (let i = 0; i < 200 && (await cached(['1'])) < 1; i++) await next(page);
  assert.equal(await cached(['1']), 1, 'The Grand Marquee (G, Movies) is cached too');
  await mock.down();
  await page.clock.setSystemTime(new Date('2026-01-06T07:00:00')); // Kids again, offline
  // Math.random is fixed to the first and then the last position, so whichever cached title the household's own selection would put there is
  // the one asked for; the cache must not offer the Movies poster at all (a poster it offered and the screen refused would still cost the attempt).
  for (const v of [0, 0.999]) {
    await page.addInitScript((value) => (Math.random = () => value), v);
    await page.reload();
    await waitFor(page, (alt) => KIDS_G.includes(name(alt)), `a cached Kids G poster (random ${v})`, 20000);
    for (let i = 0; i < 3; i++) {
      await page.clock.runFor(361_000);
      await waitFor(page, (alt) => KIDS_G.includes(name(alt)), `a cached Kids G poster after tick ${i + 1} (random ${v})`, 20000);
    }
  }
  check('offline under Kids: only cached Kids Movies G posters are drawn, never the cached Movies one');
});

// 14. A pinned poster stays across a profile boundary (D5): it is exempt from the limit and the selection.
pCase('14 a pinned poster stays across a profile boundary while the frame follows', {
  settings: seed({ staticRatingKey: '4', staticTitle: 'Popcorn Skies' }),
  clock: { time: '2026-01-05T05:58:00' },
}, async ({ page, app }) => {
  await page.goto(app.url);
  await waitFor(page, (alt) => name(alt) === 'Popcorn Skies', 'the pinned R poster');
  assert.equal(await frameHidden(page), true, 'Adults: no frame');
  await advance(page, 125_000); // 06:00:05: Kids (G, Kids Movies)
  await page.waitForFunction(() => !document.getElementById('frame').hidden, null, { timeout: 10000 });
  assert.equal(name(await activeAlt(page)), 'Popcorn Skies', 'the pinned poster is exempt from both the limit and the selection');
  assert.equal(await activeCount(page), 1);
  check('a pinned poster stays across a boundary');
});

// 14b. The Pin button's poster stays across a boundary into Kids, online and offline: no poster is taken off (D5, D122 1).
for (const offline of [false, true]) {
  pCase(`14b a poster pinned with the button stays across a boundary into Kids, ${offline ? 'offline' : 'online'}`, { settings: seed(), clock: { time: '2026-01-05T05:58:00' } }, async ({ page, app, mock }) => {
    await page.goto(app.url);
    await posterShown(page);
    await refreshTo(page, 'Popcorn Skies'); // an R title of Movies: neither Kids' limit nor Kids' selection allows it
    await page.evaluate(() => document.querySelector('[data-action="pin"]').click());
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.settings') || '{}').staticRatingKey === '4', null, { timeout: 10000 });
    if (offline) await mock.down();
    await watchOff(page);
    await advance(page, 125_000); // 06:00:05
    await page.waitForFunction(() => !document.getElementById('frame').hidden, null, { timeout: 10000 }); // the boundary was processed: Kids' frame
    assert.deepEqual(await page.evaluate(() => window.__events.filter((e) => e.kind === 'off')), [], 'no poster was taken off');
    assert.equal(name(await activeAlt(page)), 'Popcorn Skies');
    check(`the pinned poster stays across the boundary, ${offline ? 'offline' : 'online'}`);
  });
}

// 14c. The genre list follows the open profile's libraries (D122 3).
pCase('14c the genre list shows the open profile\'s libraries, not the household\'s', { settings: seed({ limitSlots: [] }), clock: { time: '2026-01-05T12:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await settled(page);
  const genres = () => page.$$eval('#genre-list label', (ls) => ls.map((l) => l.textContent.trim()));
  const waitGenres = (has, hasNot, what) => page.waitForFunction(([a, b]) => { const t = [...document.querySelectorAll('#genre-list label')].map((l) => l.textContent.trim()); return t.includes(a) && !t.includes(b); }, [has, hasNot], { timeout: 10000 }).catch(async () => assert.fail(`${what}: ${await genres()}`));
  await waitGenres('Drama', 'Animation', 'the household (Movies) genres');
  await page.click('#profile-list li:nth-child(1) .profile-edit'); // Kids: Kids Movies
  await waitGenres('Animation', 'Drama', 'the open profile\'s (Kids Movies) genres');
  await page.click('#profile-discard');
  await waitGenres('Drama', 'Animation', 'the household genres again after Discard');
  await page.click('#profile-list li:nth-child(1) .profile-edit');
  await waitGenres('Animation', 'Drama', 'Kids Movies genres again');
  await page.click('#profile-done');
  await waitGenres('Drama', 'Animation', 'the household genres again after Done');
  check('the genre list follows the libraries shown: the profile\'s while it is open, the household\'s after Done and Discard');
});

// 14d. The household's live controls keep previewing while a profile is open; the profile's own frame is not previewed (D122 4).
pCase('14d while a profile is open a live control still previews, and its frame is not previewed', { settings: seed({ frameId: 'none', limitSlots: [] }), clock: { time: '2026-01-05T12:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  assert.equal(await frameHidden(page), true, 'the household frame is none');
  const width = () => page.evaluate(() => document.getElementById('poster-box').getBoundingClientRect().width);
  const before = await width();
  await openSettings(page);
  await page.click('#profile-list li:nth-child(1) .profile-edit'); // Kids: marquee
  await page.waitForSelector('#profile-banner:not([hidden])');
  assert.equal(await page.inputValue('[name="frameId"]'), 'marquee');
  await page.fill('[name="posterScale"]', '60');
  await page.waitForFunction((w) => document.getElementById('poster-box').getBoundingClientRect().width < w - 20, before, { timeout: 10000 }).catch(() => assert.fail('the poster size did not follow the slider while a profile was open'));
  assert.equal(await frameHidden(page), true, 'the profile\'s frame is not previewed while it is open (read after the preview that moved the poster)');
  await page.click('#profile-done');
  assert.equal(await frameHidden(page), true, 'still the household frame after Done');
  await cancelSettings(page);
  await page.waitForFunction((w) => Math.abs(document.getElementById('poster-box').getBoundingClientRect().width - w) < 2, before, { timeout: 10000 });
  check('a live control previews while a profile is open; the profile\'s own frame does not');
});

// 15. A draw that finishes after a boundary meets the selection in force then (D120 6): the Kids poster held until after 21:00 is not shown.
pCase('15 a poster whose draw finishes after a boundary is checked against the new selection', { settings: seed(), clock: { time: '2026-01-05T20:58:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  assert.equal(isKids(await activeAlt(page)), true);
  const images = await holdImages(page);
  await page.evaluate(() => document.querySelector('[data-action="refresh"]').click()); // a Kids poster is drawn, its image held
  for (let i = 0; i < 300 && images.heldCount() < 1; i++) await page.waitForTimeout(40);
  assert.ok(images.heldCount() >= 1, 'the image request is held');
  await advance(page, 125_000); // 21:00:05: Adults (Movies, no limit); the Kids poster on screen is off
  await page.evaluate(() => {
    window.__alts = [];
    new MutationObserver(() => {
      const on = document.querySelector('.poster-layer.active')?.alt || '';
      if (on && window.__alts.at(-1) !== on) window.__alts.push(on);
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'alt'] });
  });
  images.release();
  await waitFor(page, (alt) => isMovies(alt), 'a Movies title after the held draw finished');
  const alts = await page.evaluate(() => window.__alts);
  for (const a of alts) assert.ok(!isKids(a), `the held Kids poster was never shown after the boundary: ${alts}`);
  check('a draw that finished after the boundary was not shown');
});

// 16. A Save that changes only the in-force profile's now-playing rule redraws at once, even while a tick is running.
pCase('16 a Save that changes only the profile\'s now-playing rule shows the title playing at once', {
  settings: seed({ showNowPlaying: true, nowPlayingPollSeconds: 3600 }),
  clock: { time: '2026-01-05T07:00:00' },
}, async ({ page, app, mock }) => {
  await mock.play(4); // Popcorn Skies, rated R: Kids applies the limit to it
  await page.goto(app.url);
  await posterShown(page);
  assert.notEqual(name(await activeAlt(page)), 'Popcorn Skies');
  const images = await holdImages(page);
  await page.evaluate(() => document.querySelector('[data-action="refresh"]').click()); // a tick is running, its image held
  for (let i = 0; i < 300 && images.heldCount() < 1; i++) await page.waitForTimeout(40);
  assert.ok(images.heldCount() >= 1);
  await openSettings(page);
  await page.click('#profile-list li:nth-child(1) .profile-edit');
  await page.waitForSelector('#profile-banner:not([hidden])');
  await page.uncheck('[name="limitNowPlaying"]');
  await page.click('#profile-done');
  await saveSettings(page); // only the in-force profile's rule changed; the household's own values did not
  images.release();
  await waitFor(page, (alt) => name(alt) === 'Popcorn Skies', 'the title playing, shown once the running tick ends');
  check('a Save of only the profile\'s now-playing rule redraws at once');
});

// 17. The editor and the slot's profile choice fit: 1920x1080, a phone (390x844, touch) and rotation 90 (D120 9).
for (const [label, vp, extra] of [
  ['1920x1080', { width: 1920, height: 1080 }, {}],
  ['390x844 touch', { width: 390, height: 844 }, { hasTouch: true, isMobile: true }],
  ['rotation 90', { width: 1920, height: 1080 }, { settings: { rotation: 90 } }],
]) {
  pCase(`17 the profile editor and the slot's profile choice fit at ${label}`, {
    settings: (app) => ({ ...seed({ profiles: [KIDS, ADULTS, { ...KIDS, id: 'p3', name: 'A name of twenty-four chrs' }], limitSlots: SLOTS })(app), ...(extra.settings || {}) }),
    viewport: vp,
    hasTouch: Boolean(extra.hasTouch),
    isMobile: Boolean(extra.isMobile),
    clock: { time: '2026-01-05T12:00:00' },
  }, async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    await openSettings(page);
    const rotated = Boolean(extra.settings?.rotation);
    const measure = () =>
      page.evaluate((rotated) => {
        const dialog = document.getElementById('settings');
        const box = dialog.getBoundingClientRect();
        const bad = [];
        for (const sel of ['#profile-editor', '#slot-editor', '#profile-banner']) {
          const root = document.querySelector(sel);
          if (!root || root.hidden) continue;
          for (const el of [root, ...root.querySelectorAll('*')]) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            // The sheet scrolls along its own height; turned a quarter, that is the screen's width, so only the other axis says "too wide".
            const out = rotated ? r.bottom > box.bottom + 1 || r.top < box.top - 1 : r.right > box.right + 1 || r.left < box.left - 1;
            if (out) bad.push(`${sel} ${el.tagName}.${el.className} ${Math.round(r.left)}-${Math.round(r.right)} outside ${Math.round(box.left)}-${Math.round(box.right)}`);
            if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && el.clientWidth > 0 && el.tagName !== 'LABEL') bad.push(`${sel} ${el.tagName}.${el.className} clips: scroll ${el.scrollWidth} > client ${el.clientWidth}`);
          }
        }
        const tall = [...document.querySelectorAll('#profile-editor button, #profile-banner button, .slot-limit')].filter((b) => b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 40).map((b) => b.textContent.trim() || b.className);
        return { bad, tall, sideways: dialog.scrollWidth - dialog.clientWidth };
      }, rotated);
    await page.evaluate(() => document.getElementById('profile-editor').scrollIntoView({ block: 'start' }));
    let m = await measure();
    assert.deepEqual(m.bad, [], 'nothing from the editor leaves the sheet or clips');
    assert.ok(m.sideways <= 1, `the sheet does not scroll sideways (${m.sideways})`);
    if (extra.hasTouch) assert.deepEqual(m.tall, [], 'every control in the editor is at least 40 px tall on a phone');
    await page.click('#profile-list li:nth-child(3) .profile-edit'); // the 24 character name, in the banner too
    await page.waitForSelector('#profile-banner:not([hidden])');
    m = await measure();
    assert.deepEqual(m.bad, [], 'the banner fits');
    assert.ok(m.sideways <= 1);
    if (extra.hasTouch) assert.deepEqual(m.tall, []);
    check(`the editor, the banner and the slot choice fit at ${label}`);
  });
}

// ---------- run ----------

const WORKERS = Number(process.env.E2E_PROFILES_WORKERS || 4);
if (process.env.E2E_PROFILES_ONLY) {
  const only = new RegExp(process.env.E2E_PROFILES_ONLY);
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
