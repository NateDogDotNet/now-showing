// Frame brightness and night dim (R-FRM-4, R-PROT-4, D6): a stepped `filter: brightness()` on #frame (or #stage),
// set once a minute. Fake clock; local-time dates so the browser and this process agree on the hour.

import assert from 'node:assert/strict';
import { withApp } from './lib.mjs';

const seedFor = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  pixelShift: false,
  nightDim: true,
  nightDimStart: '22:00',
  nightDimEnd: '07:00',
  nightDimLevel: 60,
  ...extra,
});

const local = (h, m = 0, s = 0) => new Date(2026, 5, 1, h, m, s);

async function ready(page) {
  await page.waitForFunction(
    () => document.getElementById('frame').naturalWidth > 0 && [...document.querySelectorAll('.poster-layer')].some((i) => i.naturalWidth > 0),
    null,
    { timeout: 15000 },
  );
}

const filters = (page) =>
  page.evaluate(() => {
    const f = (el) => getComputedStyle(el).filter;
    return {
      frame: f(document.getElementById('frame')),
      stage: f(document.getElementById('stage')),
      box: f(document.getElementById('poster-box')),
      layers: [...document.querySelectorAll('.poster-layer')].map(f),
    };
  });

/** 'none' -> 1; 'brightness(0.6)' -> 0.6. Anything else fails the test. */
function level(filter) {
  if (filter === 'none') return 1;
  const m = /^brightness\(([\d.]+)\)$/.exec(filter);
  assert.ok(m, `filter is none or brightness(x), got ${filter}`);
  return Number(m[1]);
}
const approx = (got, want, tol, msg) => assert.ok(Math.abs(got - want) <= tol, `${msg}: ${got} vs ${want}`);

async function atTime(name, settings, time, fn, { waitPoster = true, ...extra } = {}) {
  await withApp({ settings, clock: { time }, ...extra }, async (ctx) => {
    await ctx.page.goto(ctx.app.url);
    if (waitPoster) await ready(ctx.page);
    await fn(ctx);
    console.log(`  ok  ${name}`);
  });
}

await Promise.all([
  // Noon, night dim on: full brightness.
  atTime('12:00 night dim on: frame is not dimmed', seedFor(), local(12), async ({ page }) => {
    const f = await filters(page);
    approx(level(f.frame), 1, 0.001, '#frame at noon');
    approx(level(f.stage), 1, 0.001, '#stage at noon');
  }),

  // 23:00, after the ramp: 0.6.
  atTime('23:00 night dim on: brightness(0.6) on #frame only', seedFor(), local(23), async ({ page }) => {
    const f = await filters(page);
    approx(level(f.frame), 0.6, 0.02, '#frame');
    assert.equal(f.stage, 'none', '#stage');
    assert.equal(f.box, 'none', '#poster-box');
    assert.deepEqual(f.layers, ['none', 'none'], 'poster layers');
  }),

  // Manual level.
  atTime('frameBrightness 50 at noon: brightness(0.5)', seedFor({ nightDim: false, frameBrightness: 50 }), local(12), async ({ page }) => {
    const f = await filters(page);
    approx(level(f.frame), 0.5, 0.02, '#frame');
    assert.equal(f.stage, 'none');
  }),

  // min of manual and night.
  atTime('manual 40 and night 60 at 23:00: the lower wins', seedFor({ frameBrightness: 40 }), local(23), async ({ page }) => {
    approx(level((await filters(page)).frame), 0.4, 0.02, '#frame');
  }),

  // Target stage.
  atTime('target stage at 23:00: #stage dimmed, #frame none', seedFor({ nightDimTarget: 'stage' }), local(23), async ({ page }) => {
    const f = await filters(page);
    approx(level(f.stage), 0.6, 0.02, '#stage');
    assert.equal(f.frame, 'none', '#frame');
  }),

  // Night dim off at 23:00.
  atTime('nightDim off at 23:00: not dimmed', seedFor({ nightDim: false }), local(23), async ({ page }) => {
    approx(level((await filters(page)).frame), 1, 0.001, '#frame');
  }),

  // No transition, animation or will-change on filter.
  atTime('no transition or will-change on filter', seedFor(), local(23), async ({ page }) => {
    const r = await page.evaluate(() =>
      ['frame', 'stage'].map((id) => {
        const cs = getComputedStyle(document.getElementById(id));
        return { id, prop: cs.transitionProperty, dur: cs.transitionDuration, willChange: cs.willChange, anims: document.getElementById(id).getAnimations().length };
      }),
    );
    for (const x of r) {
      // The default property is `all`, so what matters is that no listed transition has a duration.
      assert.ok(x.dur.split(',').every((d) => parseFloat(d) === 0) || !/filter|all/.test(x.prop), `${x.id} transition ${x.prop} ${x.dur}`);
      assert.ok(!/filter/.test(x.willChange), `${x.id} will-change ${x.willChange}`);
      assert.equal(x.anims, 0, `${x.id} running animations`);
    }
  }),

  // The ramp, minute by minute, for both ends of the night.
  withApp({ settings: seedFor({ nightDimStart: '22:00', nightDimEnd: '07:00' }), clock: { time: local(21, 58, 30) } }, async ({ page, app }) => {
    await page.goto(app.url);
    await ready(page);
    await page.clock.pauseAt(local(21, 59, 0));
    const read = async () => level((await filters(page)).frame);
    approx(await read(), 1, 0.001, '21:59');
    const values = [];
    await page.clock.runFor(60_000); // 22:00:00
    for (let k = 0; k <= 12; k++) {
      const name = `22:${String(k).padStart(2, '0')}`;
      const v = await read();
      values.push(v);
      approx(v, 1 - (Math.min(k, 10) / 10) * 0.4, 0.001, name);
      await page.clock.runFor(29_000); // :29 - same step
      assert.equal(await read(), v, `${name}:29 equals the minute's step`);
      await page.clock.runFor(30_000); // :59 - still the same step, nothing between ticks
      assert.equal(await read(), v, `${name}:59 equals the minute's step`);
      await page.clock.runFor(1_000); // the next minute boundary
    }
    assert.ok(values[0] > values[5] && values[5] > values[10], 'darker through the ramp');
    assert.equal(new Set(values.slice(0, 11)).size, 11, 'eleven distinct steps 22:00-22:10');
    console.log('  ok  ramp in, minute by minute');
  }),

  withApp({ settings: seedFor(), clock: { time: local(6, 48, 30) } }, async ({ page, app }) => {
    await page.goto(app.url);
    await ready(page);
    await page.clock.pauseAt(local(6, 49, 0));
    const read = async () => level((await filters(page)).frame);
    approx(await read(), 0.6, 0.001, '06:49');
    const values = [];
    for (let m = 50; m <= 59; m++) {
      await page.clock.runFor(60_000);
      values.push(await read());
    }
    // 06:50 still full night level, then brighter every minute.
    approx(values[0], 0.6, 0.001, '06:50');
    for (let i = 1; i < values.length; i++) assert.ok(values[i] > values[i - 1], `brighter at 06:${50 + i}`);
    await page.clock.runFor(60_000);
    approx(await read(), 1, 0.001, '07:00');
    console.log('  ok  ramp out, minute by minute');
  }),

  // Live preview and Save reach the display; the new controls exist in Display protection.
  atTime('settings controls: live preview and Save', seedFor({ nightDim: false }), local(12), async ({ page }) => {
    await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
    await page.waitForSelector('#settings[open]');
    for (const n of ['frameBrightness', 'nightDim', 'nightDimStart', 'nightDimEnd', 'nightDimLevel', 'nightDimTarget']) {
      assert.equal(await page.locator(`fieldset:has(legend:text("Display protection")) [name="${n}"]`).count(), 1, `control ${n} in Display protection`);
    }
    await page.fill('input[name="frameBrightness"]', '30');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('frame')).filter !== 'none');
    approx(level((await filters(page)).frame), 0.3, 0.02, 'preview');
    await page.click('#settings-cancel');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('frame')).filter === 'none');
    await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
    await page.waitForSelector('#settings[open]');
    await page.fill('input[name="frameBrightness"]', '70');
    await page.click('#settings-save');
    await page.waitForFunction(() => !document.getElementById('settings').open);
    approx(level((await filters(page)).frame), 0.7, 0.02, 'saved');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')).frameBrightness);
    assert.equal(saved, 70);
  }),

  // Switching the target on a running page must clear the other element (no double dim).
  atTime('switching nightDimTarget live leaves one element dimmed', seedFor(), local(23), async ({ page }) => {
    const dimmedOnly = async (which, other, msg) => {
      await page.waitForFunction(
        ([a, b]) => getComputedStyle(document.getElementById(a)).filter !== 'none' && getComputedStyle(document.getElementById(b)).filter === 'none',
        [which, other],
        { timeout: 5000 },
      ).catch(() => {});
      const f = await filters(page);
      approx(level(f[which]), 0.6, 0.02, `${msg}: #${which}`);
      assert.equal(f[other], 'none', `${msg}: #${other} is not dimmed a second time`);
    };
    await dimmedOnly('frame', 'stage', 'start');
    await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
    await page.waitForSelector('#settings[open]');
    await page.selectOption('select[name="nightDimTarget"]', 'stage');
    await dimmedOnly('stage', 'frame', 'preview stage');
    await page.selectOption('select[name="nightDimTarget"]', 'frame');
    await dimmedOnly('frame', 'stage', 'preview frame');
    await page.selectOption('select[name="nightDimTarget"]', 'stage');
    await page.click('#settings-save');
    await page.waitForFunction(() => !document.getElementById('settings').open);
    await dimmedOnly('stage', 'frame', 'saved stage');
    await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
    await page.waitForSelector('#settings[open]');
    await page.selectOption('select[name="nightDimTarget"]', 'frame');
    await page.click('#settings-save');
    await page.waitForFunction(() => !document.getElementById('settings').open);
    await dimmedOnly('frame', 'stage', 'saved frame');
  }),

  // A clock jump re-evaluates before the next minute tick.
  atTime('clock jump re-evaluates', seedFor(), local(12), async ({ page }) => {
    approx(level((await filters(page)).frame), 1, 0.001, 'noon');
    await page.clock.setSystemTime(local(23, 30));
    await page.clock.runFor(10_000);
    approx(level((await filters(page)).frame), 0.6, 0.02, 'after the jump');
  }),

  // Asleep: the veil is still black and covers the screen.
  atTime('asleep: the veil is intact', seedFor({ sleepEnabled: true, sleepStart: '22:00', sleepEnd: '07:00' }), local(23), async ({ page }) => {
    await page.waitForFunction(() => document.body.classList.contains('asleep'));
    const v = await page.evaluate(() => {
      const el = document.getElementById('sleep-veil');
      const r = el.getBoundingClientRect();
      return { hidden: el.hidden, bg: getComputedStyle(el).backgroundColor, filter: getComputedStyle(el).filter, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
    });
    assert.equal(v.hidden, false);
    assert.equal(v.bg, 'rgb(0, 0, 0)');
    assert.equal(v.filter, 'none');
    assert.ok(v.w >= v.vw - 1 && v.h >= v.vh - 1, `veil covers the screen ${JSON.stringify(v)}`);
  }, { waitPoster: false }),
]);
