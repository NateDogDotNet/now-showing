// Pixel shift (R-PROT-2, D6): the stage steps a few pixels inside a 1.5% margin and glides over 1.5 s.
// Fake clock; "settled" is reached by finishing the running animations (the glide itself is checked
// through the computed transition).

import assert from 'node:assert/strict';
import { withApp } from './lib.mjs';

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1080, height: 1920 },
];
const ROTATIONS = [0, 90];
const STEPS = 20;

const seedFor = (rotation, extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  rotation,
  pixelShift: true,
  pixelShiftMinutes: 3,
  ...extra,
});

async function ready(page) {
  await page.waitForFunction(
    () => document.getElementById('frame').naturalWidth > 0 && [...document.querySelectorAll('.poster-layer')].some((i) => i.naturalWidth > 0),
    null,
    { timeout: 15000 },
  );
}

const settle = (page) => page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));

const measure = (page) =>
  page.evaluate(() => {
    const box = (id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const cs = getComputedStyle(document.getElementById('stage'));
    return { vw: window.innerWidth, vh: window.innerHeight, stage: box('stage'), frame: box('frame'), translate: cs.translate };
  });

const inside = (b, m) => b.left >= -0.5 && b.top >= -0.5 && b.right <= m.vw + 0.5 && b.bottom <= m.vh + 0.5;

const cases = [];
for (const viewport of VIEWPORTS) for (const rotation of ROTATIONS) cases.push({ viewport, rotation });

await Promise.all(
  cases.map(({ viewport, rotation }) =>
    withApp({ settings: seedFor(rotation), viewport, clock: { time: new Date('2026-06-01T12:00:00Z') } }, async ({ page, app }) => {
      const name = `${viewport.width}x${viewport.height} rotation ${rotation}`;
      await page.goto(app.url);
      await ready(page);
      await settle(page);
      const seen = new Set();
      for (let i = 0; i <= STEPS; i++) {
        if (i > 0) await page.clock.runFor(3 * 60 * 1000);
        await settle(page);
        const m = await measure(page);
        seen.add(m.translate);
        assert.ok(inside(m.stage, m), `${name} step ${i}: stage inside viewport ${JSON.stringify(m.stage)}`);
        assert.ok(inside(m.frame, m), `${name} step ${i}: frame inside viewport ${JSON.stringify(m.frame)}`);
      }
      assert.ok(seen.size >= 9, `${name}: >= 9 distinct translate values, saw ${seen.size}: ${[...seen]}`);
      const t = await page.evaluate(() => {
        const cs = getComputedStyle(document.getElementById('stage'));
        return { prop: cs.transitionProperty, dur: cs.transitionDuration };
      });
      const props = t.prop.split(',').map((s) => s.trim());
      const durs = t.dur.split(',').map((s) => parseFloat(s));
      const at = props.indexOf('translate');
      assert.ok(at >= 0, `${name}: transition-property includes translate (${t.prop})`);
      assert.ok(durs[at] >= 1 && durs[at] <= 2, `${name}: translate duration 1-2 s (${t.dur})`);
      console.log(`  ok  ${name} (${seen.size} distinct positions)`);
    }),
  ),
);

// Reduced motion: the translate transition is gone.
await withApp({ settings: seedFor(0), viewport: VIEWPORTS[0] }, async ({ page, app }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(app.url);
  await ready(page);
  const t = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('stage'));
    return { prop: cs.transitionProperty, dur: cs.transitionDuration };
  });
  assert.ok(t.prop === 'none' || parseFloat(t.dur) === 0, `reduced motion: no translate transition (${t.prop} / ${t.dur})`);
  assert.ok(!t.prop.split(',').some((p, i) => p.trim() === 'translate' && parseFloat(t.dur.split(',')[i]) > 0), 'reduced motion: translate does not glide');
  console.log('  ok  reduced motion');
});

// Off: today's layout, no translate, stage equals stageSize() without a margin.
for (const viewport of VIEWPORTS) {
  await withApp({ settings: seedFor(0, { pixelShift: false }), viewport }, async ({ page, app }) => {
    await page.goto(app.url);
    await ready(page);
    await settle(page);
    const m = await page.evaluate(() => {
      const stage = document.getElementById('stage');
      return { translate: getComputedStyle(stage).translate, inline: stage.style.translate, w: stage.offsetWidth, h: stage.offsetHeight, vw: window.innerWidth, vh: window.innerHeight, aspect: document.getElementById('frame').naturalWidth / document.getElementById('frame').naturalHeight };
    });
    assert.ok(m.translate === 'none' || m.translate === '', `off: no translate (${m.translate})`);
    assert.equal(m.inline, '');
    const { stageSize } = await import('../../js/layout.js');
    const want = stageSize({ viewportW: m.vw, viewportH: m.vh, aspect: m.aspect });
    assert.deepEqual({ w: m.w, h: m.h }, { w: want.width, h: want.height }, `off: stage is the margin-less size at ${viewport.width}x${viewport.height}`);
    console.log(`  ok  off ${viewport.width}x${viewport.height}`);
  });
}
