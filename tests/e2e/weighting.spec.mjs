// Weighting and the no-repeat window (R-SEL-2, D64, D113). Against the mock's eight titles (library 1, keys 1-8, watched by position:
// 1, 3 and 5). Nothing waits for wall-clock time: a pick is waited for by the poster on screen changing, and days pass on the fake
// clock (setSystemTime). The page's Math.random is seeded from this spec by an init script, never in the app, so a run repeats.
// Every case runs against its own mock Plex (serveArgs: []).

import assert from 'node:assert/strict';
import { withApp } from './lib.mjs';

const cases = [];
const wCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], ...opts }, fn });
const check = (name) => console.log(`  ok  ${name}`);

const TITLES = ['The Grand Marquee', 'Midnight Projector', 'Velvet Curtain', 'Popcorn Skies', 'Neon Matinee', 'Last Reel', 'Silver Screen Serenade', 'Encore'];
const titleNo = (alt) => TITLES.indexOf((alt || '').replace(/^Poster: /, '')) + 1; // 0 = nothing recognisable
const DAY = 24 * 60 * 60 * 1000;
const START = '2026-01-05T12:00:00';

const seed = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  rotateSeconds: 3600,
  showNowPlaying: false,
  unwatchedOnly: false,
  ...extra,
});

/** Seeds the page's Math.random (mulberry32) before the app loads; the same seed starts every load the same way. */
const seedRandom = (page, n) =>
  page.addInitScript((s) => {
    let a = s >>> 0;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, n);

const activeAlt = (page) => page.evaluate(() => document.querySelector('.poster-layer.active')?.alt || '');
const posterShown = (page) => page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));
const record = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.shownAt') || 'null'));
const onScreen = async (page) => titleNo(await activeAlt(page));

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
async function picks(page, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await next(page));
  return out;
}
/** Reloads and waits for the poster of the new page; its title number. */
async function reload(page) {
  await page.reload();
  await posterShown(page);
  return onScreen(page);
}

const openSettings = async (page) => {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForSelector('#settings[open]');
};
const saveSettings = async (page) => {
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
};

// 1. The window: eight different titles from eight, a reload keeps it, and after 3 days the titles return.
wCase('1 no-repeat 3 days: eight draws are eight titles, a reload keeps the window, inside 3 days the least recent comes back, after 3 days the record is clear', { settings: seed({ noRepeatDays: 3 }), clock: { time: START } }, async ({ page, app }) => {
  await seedRandom(page, 11);
  await page.goto(app.url);
  await posterShown(page);
  const seen = [await onScreen(page), ...(await picks(page, 3))];
  assert.equal(new Set(seen).size, 4, `four different titles before the reload: ${seen}`);
  const afterReload = await reload(page);
  assert.ok(!seen.includes(afterReload), `the first draw after a reload (${afterReload}) is not one already shown (${seen}): the window was remembered`);
  seen.push(afterReload, ...(await picks(page, 3)));
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6, 7, 8], `eight draws, eight different titles: ${seen}`);
  check('eight draws are eight different titles, with a reload in the middle');

  // Two days on: all eight are inside the 3 day window, so the title shown longest ago (the first) comes back.
  await page.clock.setSystemTime(new Date(new Date(START).getTime() + 2 * DAY));
  assert.equal(await reload(page), seen[0], 'every title inside the window: the least recently shown is drawn');
  assert.equal(await next(page), seen[1], 'and then the next least recent');
  check('inside the window with every title shown, the least recently shown comes back');

  // Past 3 days since everything was first shown (the two draws above refreshed t[0], t[1] two days in): the old ones are outside.
  await page.clock.setSystemTime(new Date(new Date(START).getTime() + 6 * DAY));
  await reload(page);
  const kept = await record(page);
  assert.equal(Object.keys(kept).length, 1, `after 3 days the titles are out of the record, only the one just shown is in it: ${JSON.stringify(kept)}`);
  const later = new Set(await picks(page, 12));
  assert.ok(later.size >= 3, `the titles are back in the draw: ${[...later]}`);
  check('after 3 days the titles return');
});

// 2. "Unwatched first" with four of the eight watched, unwatched only off, window 0 (D113).
wCase('2 unwatched first, 4 of 8 titles watched, unwatched only off: at least 36 of 60 draws are unwatched', { settings: seed({ weighting: 'unwatched', noRepeatDays: 0 }) }, async ({ page, app, mock }) => {
  await mock.post('watch', { ratingKey: '7', viewCount: 1 }); // titles 1, 3, 5 are watched in the mock; now 7 as well
  await seedRandom(page, 20240601);
  await page.goto(app.url);
  await posterShown(page);
  const draws = [await onScreen(page), ...(await picks(page, 59))];
  const unwatched = draws.filter((t) => [2, 4, 6, 8].includes(t)).length;
  console.log(`      unwatched draws: ${unwatched} of ${draws.length}`);
  assert.ok(unwatched >= 36, `${unwatched} of 60 draws were unwatched`);
  assert.equal(await record(page), null, 'window 0 stores nothing');
  check('unwatched first: at least 36 of 60 draws are unwatched');
});

// 3. Defaults behave as before.
wCase('3 defaults (weighting off, window 0): the last ten are avoided as before and nothing is stored', { settings: seed() }, async ({ page, app }) => {
  await seedRandom(page, 5);
  await page.goto(app.url);
  await posterShown(page);
  const s = await stored(page);
  assert.equal(s.weighting ?? 'off', 'off');
  assert.equal(s.noRepeatDays ?? 0, 0);
  const seen = [await onScreen(page), ...(await picks(page, 7))];
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6, 7, 8], `eight draws, eight different titles (the last-10 rule): ${seen}`);
  assert.equal(await record(page), null, 'no record of shown titles is kept');
  check('defaults: eight different titles, nothing stored');
});

// 4. The two controls in Settings.
wCase('4 Settings: the two controls show the saved values, apply on Save, clamp the days, and Cancel keeps the saved ones', { settings: seed({ weighting: 'rated', noRepeatDays: 5 }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.equal(await page.inputValue('[name="weighting"]'), 'rated');
  assert.equal(await page.inputValue('[name="noRepeatDays"]'), '5');
  assert.deepEqual(await page.$$eval('[name="weighting"] option', (o) => o.map((x) => x.value)), ['off', 'unwatched', 'rated']);
  assert.match(await page.textContent('#weighting-help'), /unwatched only/i, 'the help says "unwatched first" does nothing while "unwatched only" is on');
  assert.match(await page.textContent('#weighting-help'), /never lets in one that the household limit, a time slot or the poster selection leaves out/, 'the help says the limit still decides (D115 2)');
  assert.deepEqual(await page.$$eval('[name="weighting"] option', (o) => o.map((x) => x.textContent.trim())), ['Nothing: every title equally', 'Unwatched titles first', 'Best reviewed first (audience score)'], 'the option names (D115 1)');
  for (const name of ['weighting', 'noRepeatDays']) assert.equal(await page.getAttribute(`[name="${name}"]`, 'aria-describedby'), 'weighting-help', `${name} is read with its help (D115 3)`);
  await page.selectOption('[name="weighting"]', 'unwatched');
  await page.fill('[name="noRepeatDays"]', '2');
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  const kept = await stored(page);
  assert.deepEqual([kept.weighting, kept.noRepeatDays], ['rated', 5], 'Cancel saved nothing');
  await openSettings(page);
  assert.equal(await page.inputValue('[name="weighting"]'), 'rated', 'and the sheet shows the saved value again');
  await page.selectOption('[name="weighting"]', 'unwatched');
  await page.fill('[name="noRepeatDays"]', '99');
  await saveSettings(page);
  const saved = await stored(page);
  assert.deepEqual([saved.weighting, saved.noRepeatDays], ['unwatched', 30], 'Save stores the choice, the days clamped to 30');
  await openSettings(page);
  assert.equal(await page.inputValue('[name="noRepeatDays"]'), '30');
  await page.fill('[name="noRepeatDays"]', '0');
  await page.selectOption('[name="weighting"]', 'off');
  await saveSettings(page);
  const off = await stored(page);
  assert.deepEqual([off.weighting, off.noRepeatDays], ['off', 0]);
  check('Settings: both controls load, save, clamp and cancel');
});

// 5. The window set in Settings applies to the next draw with no reload.
wCase('5 a window saved in Settings applies to the next draws, and the record stays out of the exported settings', { settings: seed(), clock: { time: START } }, async ({ page, app }) => {
  await seedRandom(page, 3);
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.fill('[name="noRepeatDays"]', '3');
  await saveSettings(page);
  const first = await onScreen(page);
  const rest = await picks(page, 4);
  assert.equal(new Set([first, ...rest]).size, 5, `five different titles: ${first} ${rest}`);
  const keys = Object.keys((await record(page)) || {});
  assert.ok(keys.length >= 4, `the record holds the titles shown since the Save: ${keys}`);
  assert.ok(!JSON.stringify(await stored(page)).includes('shownAt'), 'the record is not in the settings');
  check('a window saved in Settings applies at once');
});

// ---------- run ----------

const WORKERS = Number(process.env.E2E_WEIGHTING_WORKERS || 4);
if (process.env.E2E_WEIGHTING_ONLY) {
  const only = new RegExp(process.env.E2E_WEIGHTING_ONLY);
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
