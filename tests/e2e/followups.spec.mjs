// The 2.3.1 follow-up fixes (the run-8 follow-ups, D132): the status pill, the unreadable schedule notice, the profile editor's genre
// list and notice, the pinned-poster line, the toast on a phone and a TV, focus after Open settings, and the sheet at 390 px.
// Every case names pixelShift: false and dailyReload: false (convention 7).

import assert from 'node:assert/strict';
import { withApp } from './lib.mjs';

const check = (name) => console.log(`  ok  ${name}`);

const KIDS = { id: 'kids', name: 'Kids', maxContentRating: 'G', limitNowPlaying: true, libraryKeys: ['3'], libraryNames: ['Kids Movies'], genres: [], ratings: [], source: null, weighting: 'off', noRepeatDays: 0, frameId: 'marquee' };

const seed = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  libraryKeys: ['1'],
  libraryNames: ['Movies'],
  rotateSeconds: 3600,
  showNowPlaying: false,
  unwatchedOnly: false,
  pixelShift: false,
  dailyReload: false,
  ...extra,
});

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const posterShown = (page) => page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
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
const tested = (page) => page.waitForFunction(() => /^✓/.test(document.getElementById('test-result').textContent), null, { timeout: 15000 });
const genres = (page) => page.$$eval('#genre-list label', (ls) => ls.map((l) => l.textContent.trim()));

// Sets the What's new marker away once per tab, so the toast shows on the first load only.
const clearMarkerOnce = (page) =>
  page.addInitScript(() => {
    if (sessionStorage.getItem('__markerCleared')) return;
    sessionStorage.setItem('__markerCleared', '1');
    localStorage.removeItem('plexPoster.whatsNew');
  });
const waitToast = (page) => page.waitForFunction(() => !document.getElementById('toast').hidden && /What's new in 2\.3/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });

// ---------- 1. "Can't reach Plex" only when Plex did not answer ----------

await withApp({ settings: seed({ genres: [{ key: '99', title: 'Western' }] }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForFunction(() => !document.getElementById('empty').hidden && /No posters found/.test(document.getElementById('empty-message').textContent), null, { timeout: 15000 });
  await page.mouse.move(200, 200); // the controls (and the pill with them) show
  await page.waitForTimeout(1500); // the pill re-renders once a second
  const status = await page.evaluate(() => ({ pill: document.getElementById('status').textContent, pillHidden: document.getElementById('status').hidden, dotHidden: document.getElementById('status-dot').hidden }));
  assert.doesNotMatch(status.pill, /reach Plex|Offline/, `no connection message when the server answered "nothing matches": ${JSON.stringify(status)}`);
  assert.equal(status.dotHidden, true, 'no status dot either');
  check('an empty result shows the empty card and no "Can\'t reach Plex"');
});

// ---------- 2. An unreadable schedule says so in the editor ----------

await withApp({ settings: seed({ maxContentRating: 'R', limitSlots: [{ start: '07:00', limit: 'PG' }, { start: '25:99', limit: 'R' }] }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.equal(await page.isVisible('#slot-unreadable'), true, 'the notice shows');
  assert.match(await page.textContent('#slot-unreadable'), /could not be read.*G all day/);
  assert.deepEqual(await page.$$eval('#slot-list .slot-start', (els) => els.map((e) => e.value)), ['00:00'], 'the G-all-day stand-in is the one row');
  await page.click('#slot-add');
  assert.equal(await page.isVisible('#slot-unreadable'), false, 'an edit of the slots ends the notice');
  await cancelSettings(page);
  await openSettings(page);
  assert.equal(await page.isVisible('#slot-unreadable'), true, 'Cancel saved nothing: the notice is back on the next open');
  await saveSettings(page);
  await openSettings(page);
  assert.equal(await page.isVisible('#slot-unreadable'), false, 'saved, G all day is the owner\'s schedule: no notice');
  check('an unreadable schedule: the editor says it became G all day, until the slots are edited or saved');
});

await withApp({ settings: seed({ maxContentRating: 'R', limitSlots: [{ start: '07:00', limit: 'PG' }] }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  assert.equal(await page.isVisible('#slot-unreadable'), false);
  check('a readable schedule: no notice');
});

// ---------- 3. The profile editor: the genre list while a profile's load runs, and the "kept" notice ----------

await withApp({ settings: seed({ maxContentRating: 'PG-13', profiles: [KIDS] }) }, async ({ page, app }) => {
  await page.route(/\/library\/sections\/3\/genre/, async (route) => {
    await new Promise((done) => setTimeout(done, 1500));
    await route.continue();
  });
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await tested(page);
  await page.waitForFunction(() => [...document.querySelectorAll('#genre-list label')].some((l) => l.textContent.trim() === 'Drama'), null, { timeout: 10000 });
  await page.click('#profile-list li:nth-child(1) .profile-edit'); // Kids: Kids Movies, answered 1.5 s late
  const during = await genres(page);
  assert.ok(!during.includes('Drama'), `the household's genres are gone while the profile's load: ${during}`);
  assert.equal((await page.textContent('#genre-help')).trim(), 'Loading the genres…');
  await page.waitForFunction(() => [...document.querySelectorAll('#genre-list label')].some((l) => l.textContent.trim() === 'Animation'), null, { timeout: 10000 });
  check('opening a profile clears the household\'s genres at once and says they are loading');

  await page.click('#profile-done');
  assert.match(await page.textContent('#profile-notice'), /Kids kept/);
  await page.click('#profile-list li:nth-child(1) .profile-edit');
  assert.equal(await page.textContent('#profile-notice'), '', 'opening a profile clears the notice');
  await page.click('#profile-done');
  assert.match(await page.textContent('#profile-notice'), /Kids kept/);
  await cancelSettings(page);
  await openSettings(page);
  assert.equal(await page.textContent('#profile-notice'), '', 'Cancel, then open: no notice');
  await page.click('#profile-list li:nth-child(1) .profile-edit');
  await page.click('#profile-done');
  await saveSettings(page);
  await openSettings(page);
  assert.equal(await page.textContent('#profile-notice'), '', 'Save, then open: no notice');
  check('the "kept" notice goes when a profile or the sheet opens');
});

// ---------- 4. The pinned poster: the line under the slots says it stays up ----------

for (const pinned of [true, false]) {
  await withApp({ settings: seed({ maxContentRating: 'G', ...(pinned ? { staticRatingKey: '101', staticTitle: 'Pinned' } : {}) }) }, async ({ page, app }) => {
    await page.goto(app.url);
    await page.waitForTimeout(1500);
    await openSettings(page);
    await page.waitForFunction(() => /^Saved:/.test(document.getElementById('slot-status').textContent), null, { timeout: 5000 });
    const line = await page.textContent('#slot-status');
    if (pinned) assert.match(line, /The pinned poster stays up whatever the limit/, line);
    else assert.doesNotMatch(line, /pinned/, line);
    check(`the status line ${pinned ? 'names' : 'does not name'} the pinned poster (${pinned ? 'pinned' : 'not pinned'})`);
  });
}

// ---------- 5. The toast: full width on a phone, clear of the control bar, a 44 px button, TV-sized text ----------

await withApp({ settings: seed({ controlLabels: 'always' }), ...PHONE }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  await page.evaluate(() => document.getElementById('controls').classList.add('visible')); // as a tap would show them
  await page.waitForTimeout(400); // the bar's slide-in
  const m = await page.evaluate(() => {
    const t = document.getElementById('toast').getBoundingClientRect();
    const c = document.getElementById('controls').getBoundingClientRect();
    const b = document.querySelector('#toast button').getBoundingClientRect();
    return { toast: { left: t.left, right: t.right, width: t.width, bottom: t.bottom }, controlsTop: c.top, button: b.height, font: parseFloat(getComputedStyle(document.getElementById('toast')).fontSize) };
  });
  assert.ok(m.toast.width > 300, `the toast uses the phone's width, not half of it: ${JSON.stringify(m)}`);
  assert.ok(m.toast.left >= 0 && m.toast.right <= 390, `inside the screen: ${JSON.stringify(m)}`);
  assert.ok(m.toast.bottom <= m.controlsTop - 4, `clear of the control bar: ${JSON.stringify(m)}`);
  assert.ok(m.button >= 44, `the button is a 44 px target: ${m.button}`);
  assert.ok(m.font >= 15, `15 px text or more: ${m.font}`);
  check(`the toast on a phone: ${Math.round(m.toast.width)} px wide, ${Math.round(m.controlsTop - m.toast.bottom)} px above the bar, ${m.button} px button`);
});

await withApp({ settings: seed(), viewport: { width: 1920, height: 1080 } }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  const font = await page.evaluate(() => ({ text: parseFloat(getComputedStyle(document.getElementById('toast')).fontSize), button: parseFloat(getComputedStyle(document.querySelector('#toast button')).fontSize) }));
  assert.ok(font.text >= 24 && font.button >= 24, `TV-sized text at 1920x1080: ${JSON.stringify(font)}`);
  check(`the toast at 1920x1080: ${font.text} px text and button`);
});

// ---------- 6. Focus after the toast's Open settings ----------

await withApp({ settings: seed() }, async ({ page, app }) => {
  await clearMarkerOnce(page);
  await page.goto(app.url);
  await waitToast(page);
  await page.click('#toast button:has-text("Open settings")');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'household-toggle', 'focus starts on the Household toggle');
  await page.keyboard.press('Tab');
  const where = await page.evaluate(() => {
    const el = document.activeElement;
    return { inHousehold: Boolean(el?.closest('#household-fieldset')), after: Boolean(document.getElementById('household-toggle').compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING), id: el?.id };
  });
  assert.ok(where.after, `the first Tab moves on from Household, not back to Plex connection: ${JSON.stringify(where)}`);
  check('Open settings puts focus on the Household toggle');
});

// ---------- 7. The Settings sheet at 390 px does not scroll sideways ----------

await withApp({ settings: seed({ maxContentRating: 'PG', limitSlots: [{ start: '08:00', limit: 'G' }] }), ...PHONE }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await openSettings(page);
  await page.waitForTimeout(1000);
  const w = await page.evaluate(() => {
    const body = document.querySelector('#settings .sheet-body');
    return { scroll: body.scrollWidth, client: body.clientWidth };
  });
  assert.ok(w.scroll <= w.client + 1, `no sideways scroll at 390 px: ${JSON.stringify(w)}`);
  check(`the sheet at 390 px: ${w.scroll} <= ${w.client}`);
});
