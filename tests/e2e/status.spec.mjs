// Quiet status indicator (F5, R-STAT-1, D6): a controls-bound pill plus a tiny drifting dot.
// Every case names pixelShift: false (convention 7).

import assert from 'node:assert/strict';
import { withApp } from './lib.mjs';

const check = (name) => console.log(`  ok  ${name}`);

const seed = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  rotateSeconds: 3600,
  pixelShift: false,
  ...extra,
});

const posterShown = (page) =>
  page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
const idleHidden = (page, timeout = 15000) => page.waitForFunction(() => document.body.classList.contains('idle'), null, { timeout });
const visible = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el || el.hidden) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0 && r.width > 0 && r.height > 0;
  }, sel);

async function boot(page, app, mock) {
  await page.goto(app.url);
  await posterShown(page);
  await mock.down();
  await page.keyboard.press('r');
  await page.waitForFunction(() => /reach Plex|Offline/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
}

const cases = [];
const statusCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], ...opts }, fn });

statusCase('offline + idle: pill hidden, dot visible, small and dim; waking shows the retry countdown', { settings: seed() }, async ({ page, app, mock }) => {
  await boot(page, app, mock);
  assert.match(await page.textContent('#status'), /retrying in/);
  assert.equal(await visible(page, '#status'), true, 'pill visible while the controls are');
  await idleHidden(page);
  await page.waitForTimeout(600);
  assert.equal(await visible(page, '#status'), false, 'pill hidden while idle');
  assert.equal(await visible(page, '#status-dot'), true, 'dot visible while idle');
  const dot = await page.evaluate(() => {
    const r = document.getElementById('status-dot').getBoundingClientRect();
    return { w: r.width, h: r.height, opacity: Number(getComputedStyle(document.getElementById('status-dot')).opacity) };
  });
  assert.ok(dot.w <= 8 && dot.h <= 8, `dot ${dot.w}x${dot.h} <= 8x8`);
  assert.ok(dot.opacity <= 0.4, `dot opacity ${dot.opacity} <= 0.4`);
  await page.mouse.move(100, 100);
  await page.waitForFunction(() => document.getElementById('controls').classList.contains('visible'));
  await page.waitForTimeout(600);
  assert.equal(await visible(page, '#status'), true, 'pill back on wake');
  assert.match(await page.textContent('#status'), /retrying in/);
  assert.equal(await visible(page, '#status-dot'), false, 'dot yields to the pill while controls show');
  check('offline: idle dot, awake pill with countdown');
});

statusCase('healthy + idle: neither visible', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await idleHidden(page);
  await page.waitForTimeout(600);
  assert.equal(await visible(page, '#status'), false);
  assert.equal(await visible(page, '#status-dot'), false);
  check('healthy idle: neither visible');
});

statusCase('no #status mutations over 3 s while the controls are hidden', { settings: seed() }, async ({ page, app, mock }) => {
  await boot(page, app, mock);
  await idleHidden(page);
  await page.waitForTimeout(300);
  const mutations = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const mo = new MutationObserver((list) => (n += list.length));
        mo.observe(document.getElementById('status'), { subtree: true, childList: true, characterData: true, attributes: true });
        setTimeout(() => (mo.disconnect(), resolve(n)), 3000);
      }),
  );
  assert.equal(mutations, 0);
  check('0 mutations over 3 s while hidden');
});

statusCase('statusIndicator off hides the dot', { settings: seed({ statusIndicator: 'off' }) }, async ({ page, app, mock }) => {
  await boot(page, app, mock);
  await idleHidden(page);
  await page.waitForTimeout(600);
  assert.equal(await visible(page, '#status-dot'), false);
  check('statusIndicator off: no dot');
});

statusCase('dot moves to another corner every 5 min, always inside the viewport', { settings: seed(), clock: { time: new Date('2026-01-05T12:00:00') } }, async ({ page, app, mock }) => {
  await boot(page, app, mock);
  await page.clock.runFor(5000); // idle timer
  await idleHidden(page);
  const rect = () =>
    page.evaluate(() => {
      const r = document.getElementById('status-dot').getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), vw: innerWidth, vh: innerHeight, l: r.left, t: r.top, r: r.right, b: r.bottom };
    });
  const seen = new Set();
  let prev = await rect();
  seen.add(`${prev.x},${prev.y}`);
  for (let i = 0; i < 4; i++) {
    for (let t = 0; t < 300; t += 10) {
      await page.clock.runFor(10000);
      await page.waitForTimeout(5);
    }
    await page.waitForTimeout(300);
    const cur = await rect();
    assert.ok(cur.l >= 0 && cur.t >= 0 && cur.r <= cur.vw && cur.b <= cur.vh, `dot inside viewport: ${JSON.stringify(cur)}`);
    assert.notEqual(`${cur.x},${cur.y}`, `${prev.x},${prev.y}`, 'dot moved');
    seen.add(`${cur.x},${cur.y}`);
    prev = cur;
  }
  assert.equal(seen.size, 4, 'visits all four corners');
  check('dot cycles through the corners');
});

statusCase(
  'dot follows --ui-rotation (90 with rotateUi)',
  { settings: seed({ rotation: 90, rotateUi: true }), viewport: { width: 1920, height: 1080 } },
  async ({ page, app, mock }) => {
    await boot(page, app, mock);
    await idleHidden(page);
    await page.waitForTimeout(600);
    const angle = await page.evaluate(() => {
      const t = getComputedStyle(document.getElementById('status-dot')).transform;
      const [a, b] = t.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
      return Math.round((Math.atan2(b, a) * 180) / Math.PI);
    });
    assert.equal(angle, 90);
    check('dot rotated 90');
  },
);

statusCase(
  'asleep hides the dot even when there is something to report',
  { settings: seed({ sleepEnabled: true, sleepStart: '12:30', sleepEnd: '13:30' }), clock: { time: new Date('2026-01-05T12:00:00') } },
  async ({ page, app, mock }) => {
    await boot(page, app, mock);
    await page.clock.runFor(5000); // idle timer
    await idleHidden(page);
    await page.waitForTimeout(300);
    assert.equal(await visible(page, '#status-dot'), true, 'awake, offline and idle: the dot shows');
    await page.clock.fastForward('31:00'); // into the sleep window
    await page.waitForFunction(() => document.body.classList.contains('asleep'), null, { timeout: 15000 });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.getElementById('status-dot').hidden), false, 'the dot still has something to report');
    assert.equal(await visible(page, '#status-dot'), false, 'asleep hides it');
    check('asleep: no dot');
  },
);

statusCase('waking brings the pill text current at once (no wait for the 1 s tick)', { settings: seed() }, async ({ page, app, mock }) => {
  await boot(page, app, mock);
  await idleHidden(page);
  await page.waitForTimeout(2200); // the hidden pill keeps its old countdown
  const { stale, fresh, hiddenAfter } = await page.evaluate(() => {
    const pill = document.getElementById('status');
    const stale = pill.textContent;
    document.dispatchEvent(new Event('pointermove')); // wake(), then read in the same task: no interval tick can run between
    return { stale, fresh: pill.textContent, hiddenAfter: pill.hidden };
  });
  assert.match(fresh, /retrying in/);
  assert.notEqual(fresh, stale, 'pill text refreshed by the wake itself');
  assert.equal(hiddenAfter, false);
  check('wake: pill current immediately');
});

// D73 (review finding 6): the empty card blames the household limit only when the limit is what emptied it.
const stallPlex = (page, mockPort) => page.route(new RegExp(`127\\.0\\.0\\.1:${mockPort}/`), () => {}); // never answered: the 10 s request timeout fires
const emptyMessage = async (page) => {
  await page.waitForFunction(() => !document.getElementById('empty').hidden && /respond in time|household limit/.test(document.getElementById('empty-message').textContent), null, { timeout: 30000 });
  return page.textContent('#empty-message');
};

statusCase('limit set, nothing cached, Plex times out: the card gives the timeout, not the limit', { settings: seed({ maxContentRating: 'PG' }) }, async ({ page, app }) => {
  await stallPlex(page, app.mockPort);
  await page.goto(app.url);
  const message = await emptyMessage(page);
  assert.match(message, /did not respond in time/);
  assert.doesNotMatch(message, /household limit/);
  check('limit PG, empty cache, Plex timeout: the empty card shows the timeout message');
});

const aboveLimit = JSON.stringify([
  { ratingKey: '4', title: 'Popcorn Skies', year: 1985, thumb: '/library/metadata/4/thumb/1700000000', contentRating: 'R', width: 600, height: 900, savedAt: 1 },
  { ratingKey: '5', title: 'Neon Matinee', year: 1993, thumb: '/library/metadata/5/thumb/1700000000', contentRating: 'TV-MA', width: 600, height: 900, savedAt: 2 },
]);
statusCase('limit set, every cached poster above it, Plex times out: the card gives the limit wording', { settings: seed({ maxContentRating: 'PG' }), localStorage: { 'plexPoster.posterIndex': aboveLimit } }, async ({ page, app }) => {
  await stallPlex(page, app.mockPort);
  await page.goto(app.url);
  assert.match(await emptyMessage(page), /household limit/);
  check('limit PG, cached posters all above it, Plex timeout: the empty card shows the household-limit wording');
});

let failed = 0;
for (const c of cases) {
  try {
    await withApp(c.opts, c.fn);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${c.name}\n${e.stack || e}`);
  }
}
if (failed) process.exit(1);
