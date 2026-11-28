// Gap fill inside the frame window (R-FILL-1, D67): what shows in the empty bands between the poster and the frame's window.
//
// The mock serves only 600x900 (2:3) posters, so the bands come from three arrangements (conductor ruling Q1, 2026-10-16):
//   - frame 'marquee-glow' at fit 'contain': a 2:3 poster in its near-square window leaves a pillarbox pair (about 56 px each),
//   - posterScale 80: a band on all four sides of the window, at any frame and either fit,
//   - frame 'marquee' at fit 'contain': bands of about 7.6 px, above the 4 px rule (so filled).
// A gap of 1-3 px comes from a computed posterScale that leaves it. Every case names pixelShift: false (convention 7) except the
// glide case; each runs against its own mock Plex (serveArgs: []), at 1080x1920 unless it says otherwise.

import assert from 'node:assert/strict';
import { withApp } from './lib.mjs';

const cases = [];
const gapCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], viewport: { width: 1080, height: 1920 }, ...opts }, fn });
const check = (name) => console.log(`  ok  ${name}`);

const seed = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  rotateSeconds: 3600,
  showNowPlaying: false,
  pixelShift: false,
  staticRatingKey: '3',
  staticTitle: 'Velvet Curtain',
  frameId: 'marquee-glow',
  posterFit: 'contain',
  rotation: 0,
  ...extra,
});

const posterShown = (page) => page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
const settled = (page) => page.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 15000 });
const prepare = async (page, app) => {
  await page.goto(app.url);
  await posterShown(page);
  await settled(page);
  await page.waitForTimeout(150);
};
const visible = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
}, sel);

/** Whether the gap fill is on screen now: in the page, not hidden, and its tint faded in (it fades with the poster, so a poster with no band leaves it at 0). */
const gapOn = (page) => page.evaluate(() => {
  const el = document.getElementById('gap-fill');
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(getComputedStyle(el.firstElementChild).opacity) > 0.1 && r.width > 0 && r.height > 0;
});

/** Every element whose computed filter or backdrop-filter is anything but none (criterion 2: not even a brightness()). */
const filtered = (page) => page.evaluate(() =>
  [...document.querySelectorAll('*')].filter((el) => {
    const cs = getComputedStyle(el);
    const bf = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
    return cs.filter !== 'none' || bf !== 'none';
  }).map((el) => el.id || el.tagName));

/** opacity of every ancestor multiplied, times any brightness() filter on the way up. */
const effectiveBrightness = (page, sel) => page.evaluate((sel) => {
  let v = 1;
  for (let el = document.querySelector(sel); el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    v *= Number(cs.opacity);
    const m = /brightness\(([\d.]+)\)/.exec(cs.filter);
    if (m) v *= Number(m[1]);
  }
  return v;
}, sel);

/** Sizes and positions, in screen pixels, of what the gap fill is measured against. */
const geometry = (page) => page.evaluate(async () => {
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
  };
  const { findFrame } = await import('/js/frames.js');
  const { loadSettings } = { loadSettings: () => JSON.parse(localStorage.getItem('plexPoster.settings') || '{}') };
  const s = loadSettings();
  const layer = document.querySelector('.poster-layer.active');
  const stage = r(document.getElementById('stage'));
  const w = findFrame(s.frameId || 'marquee')?.window ?? { x: 7.3, y: 14.6, w: 85.6, h: 80.8 };
  return {
    gap: r(document.getElementById('gap-fill')),
    gapShown: !document.getElementById('gap-fill').hidden && Number(getComputedStyle(document.querySelector('#gap-fill .gap-tint')).opacity) > 0.1,
    box: r(document.getElementById('poster-box')),
    stage,
    aspect: layer && layer.naturalWidth > 0 ? layer.naturalWidth / layer.naturalHeight : 2 / 3,
    fit: getComputedStyle(layer || document.getElementById('poster-a')).objectFit,
    // the frame's window on screen (valid for rotation 0 and 180 only: the stage is axis-aligned)
    win: {
      left: stage.left + (stage.width * w.x) / 100,
      top: stage.top + (stage.height * w.y) / 100,
      width: (stage.width * w.w) / 100,
      height: (stage.height * w.h) / 100,
    },
    vw: window.innerWidth,
    vh: window.innerHeight,
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
  };
});

/** The gaps, in screen px, between the window and the image drawn in the poster box (what is really left unpainted). */
function bandsOf(g) {
  const { win, box, aspect, fit } = g;
  let img = { left: box.left, top: box.top, width: box.width, height: box.height };
  if (fit === 'contain') {
    let width = box.width;
    let height = width / aspect;
    if (height > box.height) {
      height = box.height;
      width = height * aspect;
    }
    img = { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
  }
  const right = win.left + win.width;
  const bottom = win.top + win.height;
  const gaps = {
    left: Math.max(0, img.left - win.left),
    right: Math.max(0, right - (img.left + img.width)),
    top: Math.max(0, img.top - win.top),
    bottom: Math.max(0, bottom - (img.top + img.height)),
  };
  return { img, gaps, widest: Math.max(...Object.values(gaps)) };
}

/** The screen's own pixels: a screenshot decoded in the page, sampled at [x, y] points. */
const pixels = async (page, points) => {
  const png = (await page.screenshot({ type: 'png' })).toString('base64');
  return page.evaluate(async ({ png, points }) => {
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    return points.map(([x, y]) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3));
  }, { png, points });
};
const sum = (px) => px[0] + px[1] + px[2];

/** edgeColour of the poster on screen, from the app's own module, read at 48 px like the matte does. */
const expectedEdge = (page) => page.evaluate(async () => {
  const { edgeColour } = await import('/js/fill.js');
  const img = document.querySelector('.poster-layer.active');
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = Math.round((48 * img.naturalHeight) / img.naturalWidth);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return edgeColour(ctx.getImageData(0, 0, c.width, c.height));
});
const rgbOf = (text) => text.match(/\d+/g).slice(0, 3).map(Number);

/** The colour(s) held by the active gap canvas: every pixel, so a "solid colour" is proven rather than assumed. */
const canvasColours = (page) => page.evaluate(() => {
  const c = document.querySelector('#gap-fill canvas.active');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
  return { width: c.width, height: c.height, colours: [...seen] };
});

const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const within = (inner, outer, tol = 1.5) => inner.left >= outer.left - tol && inner.top >= outer.top - tol && inner.right <= outer.right + tol && inner.bottom <= outer.bottom + tol;
const rectOf = (win) => ({ left: win.left, top: win.top, right: win.left + win.width, bottom: win.top + win.height });

// 1. blur, pillarbox bands (marquee-glow, contain): a tiny canvas, dimmer than the poster, no filter on any element.
gapCase('1 blur in the pillarbox bands', { settings: seed({ gapFill: 'blur' }) }, async ({ page, app }) => {
  await prepare(page, app);
  assert.equal(await gapOn(page), true, '#gap-fill is shown');
  const widths = await page.evaluate(() => [...document.querySelectorAll('#gap-fill canvas')].map((c) => c.width));
  assert.ok(widths.length >= 1);
  for (const w of widths) assert.ok(w > 0 && w <= 64, `canvas intrinsic width ${w} is at most 64`);
  assert.equal(await page.locator('#gap-fill canvas.active').count(), 1, 'one canvas is current');
  const eff = await effectiveBrightness(page, '#gap-fill canvas.active');
  const poster = await effectiveBrightness(page, '.poster-layer.active');
  assert.ok(eff > 0 && eff <= 0.25 + 1e-9, `effective brightness ${eff} is at most 0.25`);
  assert.ok(eff < poster, `below the poster (${eff} vs ${poster})`);
  assert.deepEqual(await filtered(page), [], 'no element has a filter or backdrop-filter');
  const g = await geometry(page);
  const { gaps, img } = bandsOf(g);
  assert.ok(gaps.left > 50 && gaps.left < 62 && gaps.right > 50 && gaps.right < 62, `about 56 px a side: ${JSON.stringify(gaps)}`);
  assert.ok(gaps.top < 1 && gaps.bottom < 1, 'and no letterbox');
  // The gap layer is the frame window, nothing more.
  assert.ok(within(rectOf(g.gap), rectOf(g.win)) && within(rectOf(g.win), rectOf(g.gap)), `#gap-fill is the window: ${JSON.stringify(g.gap)} vs ${JSON.stringify(g.win)}`);
  // Pixels: lit, and dimmer than the poster beside it.
  const midY = g.win.top + g.win.height / 2;
  const [left, right, beside] = await pixels(page, [[g.win.left + gaps.left / 2, midY], [g.win.left + g.win.width - gaps.right / 2, midY], [img.left + 6, midY]]);
  assert.ok(sum(left) > 0 && sum(right) > 0, `the bands are lit: ${left} ${right}`);
  assert.ok(sum(left) < sum(beside) && sum(right) < sum(beside), `and dimmer than the poster (${left} / ${right} vs ${beside})`);
  check(`blur: canvas ${widths.join('/')} px wide, effective ${eff.toFixed(3)} vs poster ${poster}; band pixels ${left} vs poster ${beside}; no filter anywhere`);
});

// 2. matte: one solid colour, the poster's edge colour (within 8 per channel), at the same 0.25 cap.
gapCase('2 matte in the pillarbox bands', { settings: seed({ gapFill: 'matte' }) }, async ({ page, app }) => {
  await prepare(page, app);
  assert.equal(await gapOn(page), true);
  const held = await canvasColours(page);
  assert.equal(held.colours.length, 1, `the canvas is one solid colour: ${held.colours.length} found`);
  const expected = rgbOf(await expectedEdge(page));
  const got = held.colours[0].split(',').map(Number);
  assert.ok(near(got, expected, 8), `matte ${got} matches edgeColour ${expected} within 8`);
  const eff = await effectiveBrightness(page, '#gap-fill canvas.active');
  const poster = await effectiveBrightness(page, '.poster-layer.active');
  assert.ok(eff > 0 && eff <= 0.25 + 1e-9 && eff < poster, `matte effective ${eff} <= 0.25 and below the poster ${poster}`);
  assert.deepEqual(await filtered(page), []);
  const g = await geometry(page);
  const { gaps } = bandsOf(g);
  const midY = g.win.top + g.win.height / 2;
  const top = g.win.top + g.win.height * 0.2;
  const [a, b, c] = await pixels(page, [[g.win.left + gaps.left / 2, midY], [g.win.left + gaps.left / 2, top], [g.win.left + g.win.width - gaps.right / 2, midY]]);
  assert.ok(near(a, b, 2) && near(a, c, 2), `the bands are a solid colour on screen: ${a} ${b} ${c}`);
  assert.ok(near(a, got.map((v) => v * eff), 8), `and it is the matte at its cap: ${a} vs ${got.map((v) => Math.round(v * eff))}`);
  check(`matte: ${held.width}x${held.height} canvas of ${held.colours[0]} (edgeColour ${expected}); on screen ${a} in both bands, top to bottom`);
});

// 3. gapFill none (the default) is today's screen: black bands, nothing drawn.
for (const extra of [{ gapFill: 'none' }, {}]) {
  gapCase(`3 none${Object.keys(extra).length ? ' (explicit)' : ' (default)'}`, { settings: seed(extra) }, async ({ page, app }) => {
    await prepare(page, app);
    assert.equal(await gapOn(page), false);
    const state = await page.evaluate(() => ({
      open: document.getElementById('poster-box').classList.contains('gap-open'),
      bg: getComputedStyle(document.getElementById('poster-box')).backgroundColor,
      active: document.querySelectorAll('#gap-fill canvas.active').length,
      taking: [...document.querySelectorAll('#gap-fill, #gap-fill *')].filter((el) => el.getBoundingClientRect().width > 0).length,
    }));
    assert.deepEqual(state, { open: false, bg: 'rgb(0, 0, 0)', active: 0, taking: 0 }, 'the poster box is black and the gap layer takes no space');
    const g = await geometry(page);
    const { gaps } = bandsOf(g);
    assert.ok(gaps.left > 50, 'the pillarbox bands are there');
    const [band] = await pixels(page, [[g.win.left + gaps.left / 2, g.win.top + g.win.height / 2]]);
    assert.ok(sum(band) <= 6, `and black: ${band}`);
    assert.deepEqual(await filtered(page), []);
    check(`gapFill ${extra.gapFill || 'default'}: bands ${band} (black), box background ${state.bg}, no gap element on screen`);
  });
}

// 4. At fit cover and 100 percent the poster covers the window: nothing shows, for both styles.
for (const gapFill of ['blur', 'matte']) {
  gapCase(`4 cover covers the window (${gapFill})`, { settings: seed({ gapFill, posterFit: 'cover' }) }, async ({ page, app }) => {
    await prepare(page, app);
    assert.equal(await gapOn(page), false);
    assert.equal(await page.evaluate(() => document.getElementById('poster-box').classList.contains('gap-open')), false);
    const g = await geometry(page);
    assert.ok(bandsOf(g).widest < 1, 'no gap is left');
    check(`${gapFill} at cover: no gap fill shown`);
  });
}

// 5. Scale below 100 leaves a band on every side, at either fit; the fill is the window and the poster sits over it.
for (const [fit, gapFill] of [['cover', 'blur'], ['contain', 'blur'], ['cover', 'matte']]) {
  gapCase(`5 poster scale 80 at ${fit} (${gapFill})`, { settings: seed({ gapFill, posterFit: fit, posterScale: 80 }) }, async ({ page, app }) => {
    await prepare(page, app);
    assert.equal(await gapOn(page), true);
    const g = await geometry(page);
    const { gaps, img } = bandsOf(g);
    for (const side of ['left', 'right', 'top', 'bottom']) assert.ok(gaps[side] > 20, `a band on the ${side}: ${JSON.stringify(gaps)}`);
    assert.ok(within(rectOf(g.gap), rectOf(g.win)) && within(rectOf(g.win), rectOf(g.gap)));
    const mid = [g.win.left + g.win.width / 2, g.win.top + g.win.height / 2];
    const points = [
      [g.win.left + gaps.left / 2, mid[1]],
      [g.win.left + g.win.width - gaps.right / 2, mid[1]],
      [mid[0], g.win.top + gaps.top / 2],
      [mid[0], g.win.top + g.win.height - gaps.bottom / 2],
    ];
    const px = await pixels(page, points);
    px.forEach((p, i) => assert.ok(sum(p) > 0, `band ${i} is lit: ${p}`));
    const eff = await effectiveBrightness(page, '#gap-fill canvas.active');
    assert.ok(eff > 0 && eff <= 0.25 + 1e-9);
    check(`scale 80, ${fit}, ${gapFill}: bands ${Object.values(gaps).map((v) => v.toFixed(0))} px, band pixels ${px.map((p) => sum(p))}`);
  });
}

// 6. A thin band is filled above 4 px (marquee at contain, about 7.6 px) and a gap under 4 px is closed by scaling the poster.
gapCase('6 marquee at contain: bands of about 7.6 px are filled', { settings: seed({ gapFill: 'blur', frameId: 'marquee' }) }, async ({ page, app }) => {
  await prepare(page, app);
  const g = await geometry(page);
  const { gaps } = bandsOf(g);
  assert.ok(gaps.left > 5 && gaps.left < 10, `about 7.6 px: ${gaps.left}`);
  assert.equal(await gapOn(page), true, 'and above the 4 px rule, so filled');
  check(`marquee contain: ${gaps.left.toFixed(1)} px bands filled`);
});

for (const gapFill of ['blur', 'matte']) {
  // The window is 924 x 1218 (marquee-glow at 1080 x 1920): scale 99.4 leaves 2.8 px each side and 3.7 px top and bottom.
  gapCase(`6b a gap under 4 px is closed by scaling the poster (${gapFill})`, { settings: seed({ gapFill, posterFit: 'cover', posterScale: 99.4 }) }, async ({ page, app }) => {
    await prepare(page, app);
    const g = await geometry(page);
    assert.equal(await gapOn(page), false, 'nothing is filled');
    assert.ok(g.box.left <= g.win.left + 0.6 && g.box.top <= g.win.top + 0.6 && g.box.right >= g.win.left + g.win.width - 0.6 && g.box.bottom >= g.win.top + g.win.height - 0.6,
      `the poster box grew to the window: box ${JSON.stringify(g.box)} window ${JSON.stringify(g.win)}`);
    check(`scale 99.4 (${gapFill}): poster box ${g.box.width.toFixed(1)} x ${g.box.height.toFixed(1)} covers the ${g.win.width.toFixed(1)} x ${g.win.height.toFixed(1)} window; nothing filled`);
  });
}
gapCase('6c with the gap fill off the same poster is left 99.4 percent (today)', { settings: seed({ gapFill: 'none', posterFit: 'cover', posterScale: 99.4 }) }, async ({ page, app }) => {
  await prepare(page, app);
  const g = await geometry(page);
  assert.ok(g.win.width - g.box.width > 4, `the box stays at 99.4 percent: ${g.box.width} of ${g.win.width}`);
  check(`gapFill none, scale 99.4: box ${g.box.width.toFixed(1)} of ${g.win.width.toFixed(1)}, as before`);
});

// 7. The gap fill cross-fades in step with the poster, and follows the new poster.
for (const gapFill of ['blur', 'matte']) {
  gapCase(`7 cross-fade in step (${gapFill})`, { settings: seed({ gapFill, staticRatingKey: undefined, staticTitle: undefined, crossfadeMs: 4000, randomPoolSize: 8 }) }, async ({ page, app }) => {
    await prepare(page, app);
    const alt = () => page.evaluate(() => document.querySelector('.poster-layer.active')?.alt || '');
    const before = await alt();
    let changed = false;
    for (let i = 0; i < 40 && !changed; i++) {
      await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
      for (let j = 0; j < 12 && !changed; j++) {
        await page.waitForTimeout(60);
        changed = (await alt()) !== before;
      }
    }
    assert.ok(changed, 'a different poster came up');
    // Read the opacities the moment a poster is mid-fade, and freeze the fades in that same task, so a slow machine cannot move them on
    // between the wait and the reading (nothing here depends on how much wall time has passed).
    const mid = await (await page.waitForFunction(() => {
      const o = (id) => Number(getComputedStyle(document.getElementById(id)).opacity);
      const read = { poster: [o('poster-a'), o('poster-b')], gap: [o('gap-a'), o('gap-b')] };
      if (!read.poster.some((v) => v > 0.02 && v < 0.98)) return null;
      document.getAnimations().forEach((an) => an.pause());
      return read;
    }, null, { timeout: 8000 })).jsonValue();
    await page.evaluate(() => document.getAnimations().forEach((an) => an.play()));
    for (let i = 0; i < 2; i++) assert.ok(Math.abs(mid.poster[i] - mid.gap[i]) <= 0.1, `layer ${i}: poster ${mid.poster[i]} vs gap fill ${mid.gap[i]} in step`);
    assert.ok(mid.poster.some((v) => v > 0.02 && v < 0.98), `sampled mid-fade: ${JSON.stringify(mid)}`);
    await settled(page);
    if (gapFill === 'matte') {
      const held = await canvasColours(page);
      const expected = rgbOf(await expectedEdge(page));
      assert.ok(near(held.colours[0].split(',').map(Number), expected, 8), `the matte follows the new poster: ${held.colours[0]} vs ${expected}`);
    }
    const eff = await effectiveBrightness(page, '#gap-fill canvas.active');
    assert.ok(eff > 0.2 && eff <= 0.25 + 1e-9, `finished its fade (effective ${eff})`);
    check(`${gapFill}: mid-fade poster ${mid.poster.map((v) => v.toFixed(2))} vs gap fill ${mid.gap.map((v) => v.toFixed(2))}`);
  });
}

// 8. Night dim to the stage dims the gap fill with the poster: still at most a quarter bright and under the poster.
for (const gapFill of ['blur', 'matte']) {
  gapCase(`8 stage night dim (${gapFill})`, {
    settings: seed({ gapFill, nightDim: true, nightDimStart: '22:00', nightDimEnd: '07:00', nightDimLevel: 60, nightDimTarget: 'stage' }),
    clock: { time: new Date(2026, 5, 1, 23, 0, 0) },
  }, async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    await page.waitForFunction(() => /brightness\(/.test(getComputedStyle(document.getElementById('stage')).filter), null, { timeout: 15000 });
    await settled(page);
    const gap = await effectiveBrightness(page, '#gap-fill canvas.active');
    const poster = await effectiveBrightness(page, '.poster-layer.active');
    assert.ok(poster > 0.5 && poster < 0.7, `the stage is dimmed to about 0.6: poster ${poster}`);
    assert.ok(gap > 0 && gap <= 0.25 * 0.6 + 1e-6, `the gap fill is dimmed with it: ${gap} (0.25 x 0.6)`);
    assert.ok(gap < poster);
    const stageOwns = await page.evaluate(() => document.getElementById('stage').contains(document.getElementById('gap-fill')));
    assert.equal(stageOwns, true, 'the gap fill lives inside the stage, so its filter reaches it');
    check(`${gapFill}, stage dim 0.6: poster ${poster.toFixed(2)}, gap fill ${gap.toFixed(3)}`);
  });
}

// 9. Pixel shift moves the gap fill with the stage: its place inside the stage never changes, the stage's does.
gapCase('9 the gap fill moves with the stage under pixel shift', {
  settings: seed({ gapFill: 'blur', pixelShift: true, pixelShiftMinutes: 3 }),
  clock: { time: new Date('2026-06-01T12:00:00Z') },
}, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  const settle = () => page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
  const rel = async () => {
    await settle();
    const g = await geometry(page);
    return { dx: +(g.gap.left - g.stage.left).toFixed(2), dy: +(g.gap.top - g.stage.top).toFixed(2), stage: `${g.stage.left.toFixed(1)},${g.stage.top.toFixed(1)}`, shown: g.gapShown };
  };
  const first = await rel();
  const stages = new Set([first.stage]);
  for (let i = 0; i < 5; i++) {
    await page.clock.runFor(3 * 60 * 1000);
    const now = await rel();
    stages.add(now.stage);
    assert.equal(now.shown, true);
    assert.deepEqual([now.dx, now.dy], [first.dx, first.dy], `step ${i}: the gap fill keeps its place in the stage`);
  }
  assert.ok(stages.size >= 3, `the stage did move (${stages.size} positions)`);
  check(`pixel shift: the stage took ${stages.size} positions, the gap fill stayed at ${first.dx},${first.dy} inside it`);
});

// 10. The Settings control: three choices, off by default, help text, and each previewed live.
gapCase('10 the Settings control', { settings: seed() }, async ({ page, app }) => {
  await prepare(page, app);
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForSelector('#settings[open]');
  const options = await page.evaluate(() => [...document.querySelectorAll('#settings-form select[name="gapFill"] option')].map((o) => o.value));
  assert.deepEqual(options, ['none', 'blur', 'matte', 'backdrop']);
  assert.equal(await page.evaluate(() => document.querySelector('select[name="gapFill"] option[value="backdrop"]').textContent), 'Backdrop art');
  assert.equal(await page.inputValue('select[name="gapFill"]'), 'none', 'off by default');
  const help = await page.evaluate(() => document.getElementById('gap-help').textContent);
  assert.match(help, /scaling or cropping/);
  assert.ok(help.length < 330, `a short help (${help.length} characters)`);
  const sameFieldset = await page.evaluate(() => document.querySelector('select[name="gapFill"]').closest('fieldset') === document.querySelector('select[name="fillMode"]').closest('fieldset'));
  assert.equal(sameFieldset, true, 'beside Landscape fill, in Frame & layout');
  await page.selectOption('select[name="gapFill"]', 'blur');
  await page.waitForFunction(() => !document.getElementById('gap-fill').hidden, null, { timeout: 5000 });
  await page.selectOption('select[name="gapFill"]', 'matte');
  await page.waitForFunction(() => document.querySelector('#gap-fill canvas.active')?.width === 1, null, { timeout: 5000 });
  await page.selectOption('select[name="gapFill"]', 'backdrop');
  await page.waitForFunction(() => { // the art of the pinned title (3) replaces the matte: a canvas of more than one pixel, bright across its top
    const c = [...document.querySelectorAll('#gap-fill canvas.active')].pop();
    return Boolean(c) && c.width > 1 && c.getContext('2d').getImageData(Math.floor(c.width / 2), 2, 1, 1).data[0] > 200;
  }, null, { timeout: 10000 });
  await page.selectOption('select[name="gapFill"]', 'none');
  await page.waitForFunction(() => document.getElementById('gap-fill').hidden, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.querySelectorAll('#gap-fill canvas.active').length), 0, 'nothing is left drawn');
  // Save keeps it.
  await page.selectOption('select[name="gapFill"]', 'matte');
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')).gapFill), 'matte');
  check('Settings: none, blur, matte each previewed live; Save stores matte; help text says what the gap is');
});

// Household limit, driven through the app's own code (as fill.spec.mjs): the pool is the two best-rated titles, 1 and 2, and
// title 1 ("The Grand Marquee") is re-rated R, so PG-13 disallows it and allows title 2 ("Midnight Projector").
const limitPool = (extra = {}) => seed({ staticRatingKey: undefined, staticTitle: undefined, randomPoolSize: 2, ...extra });
const altOf = (page) => page.evaluate(() => document.querySelector('.poster-layer.active')?.alt || '');
const clickRefresh = (page) => page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
const setHouseholdLimit = async (page) => {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForSelector('#settings[open]');
  await page.check('#household-toggle');
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
};
async function refreshUntil(page, want, what) {
  for (let i = 0; i < 60; i++) {
    if (want(await altOf(page))) return;
    await clickRefresh(page);
    for (let j = 0; j < 10 && !want(await altOf(page)); j++) await page.waitForTimeout(60);
  }
  assert.fail(`${what} never came up (now ${await altOf(page)})`);
}

// 11. A poster cut while it fades out takes its gap fill with it, at once (K20, C7M1); the incoming pair keeps fading in step.
for (const gapFill of ['blur', 'matte']) {
  gapCase(`11 a poster cut mid-crossfade takes its gap fill with it (${gapFill})`, { settings: limitPool({ gapFill, crossfadeMs: 6000 }) }, async ({ page, app, mock }) => {
    await mock.post('rate', { ratingKey: '1', contentRating: 'R' });
    await page.goto(app.url);
    await posterShown(page);
    await refreshUntil(page, (alt) => alt === 'Poster: The Grand Marquee', 'title 1 (R)');
    await settled(page);
    await refreshUntil(page, (alt) => alt === 'Poster: Midnight Projector', 'title 2 (PG)');
    // Hold the incoming fade part-way (frozen in the same task that sees it there), so the cut below always lands mid-fade however slow the
    // machine is; the cut itself ends the outgoing fade.
    await page.waitForFunction(() => {
      const v = Number(getComputedStyle(document.querySelector('.poster-layer.active')).opacity);
      if (!(v > 0.1 && v < 0.9)) return false;
      document.getAnimations().forEach((an) => an.pause());
      return true;
    }, null, { timeout: 8000 });
    await page.evaluate(() => {
      window.__cuts = [];
      const op = (el) => Number(getComputedStyle(el).opacity);
      const canvasOf = (layer) => document.getElementById(layer.id.replace('poster-', 'gap-'));
      new MutationObserver((records) => {
        for (const { target: layer } of records) {
          if (!layer.classList.contains('cut') || layer.classList.contains('active')) continue;
          const inn = document.querySelector('.poster-layer.active');
          window.__cuts.push({
            poster: op(layer),
            canvas: op(canvasOf(layer)),
            canvasTransition: getComputedStyle(canvasOf(layer)).transitionDuration,
            inPoster: inn ? op(inn) : null,
            inCanvas: inn ? op(canvasOf(inn)) : null,
          });
        }
      }).observe(document.getElementById('poster-box'), { attributes: true, subtree: true, attributeFilter: ['class'] });
    });
    await setHouseholdLimit(page);
    await page.waitForFunction(() => window.__cuts.length > 0, null, { timeout: 5000 });
    const m = (await page.evaluate(() => window.__cuts))[0];
    assert.equal(m.poster, 0, 'the outgoing poster is gone at once');
    assert.equal(m.canvas, 0, `the outgoing gap fill is gone with it, in the same task (opacity ${m.canvas})`);
    assert.ok(/^0s(, 0s)*$/.test(m.canvasTransition), `with no fade: ${m.canvasTransition}`);
    assert.ok(m.inPoster > 0 && m.inPoster < 0.98 && Math.abs(m.inPoster - m.inCanvas) <= 0.1, `the incoming pair keeps fading in step: poster ${m.inPoster} vs gap fill ${m.inCanvas}`);
    check(`${gapFill}: R poster cut mid-fade: outgoing poster ${m.poster}, outgoing gap fill ${m.canvas}`);
  });
}

// 12. A real block (D37: fail closed) takes the gap fill off the screen with the poster.
for (const gapFill of ['blur', 'matte']) {
  gapCase(`12 a real block hides the ${gapFill} gap fill`, { settings: limitPool({ gapFill, randomPoolSize: 1 }) }, async ({ page, app, mock }) => {
    await mock.post('rate', { ratingKey: '1', contentRating: 'R' });
    await page.goto(app.url);
    await posterShown(page);
    await settled(page);
    assert.equal(await gapOn(page), true, 'the gap fill is up before the block');
    for (let i = 0; i < 100; i++) {
      if ((await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]'))).length) break;
      await page.waitForTimeout(100);
    }
    await mock.down();
    await setHouseholdLimit(page);
    await page.waitForFunction(() => document.body.classList.contains('poster-blocked'), null, { timeout: 5000 });
    assert.equal(await gapOn(page), false, 'the gap layer is hidden');
    const hidden = await page.evaluate(() => [...document.querySelectorAll('#gap-fill canvas')].every((c) => getComputedStyle(c).visibility === 'hidden'));
    assert.equal(hidden, true, 'and every gap canvas with it');
    check(`${gapFill}: poster-blocked took the gap fill off the screen`);
  });
}

// 13. Viewports, frames, fits and scales: the fill is the frame's window and nothing else, shown exactly when a band of 4 px or more exists,
//     never outside the stage or the screen, with no scrollbars. The landscape fill and the gap fill coexist.
const reconfigure = async (page, patch) => {
  await page.evaluate((patch) => {
    const s = JSON.parse(localStorage.getItem('plexPoster.settings'));
    localStorage.setItem('plexPoster.settings', JSON.stringify({ ...s, ...patch }));
  }, patch);
  await page.reload();
  await posterShown(page);
  await settled(page);
  await page.waitForTimeout(100);
};

async function sweepOne(page, label, rotated) {
  const g = await geometry(page);
  const screen = { left: 0, top: 0, right: g.vw, bottom: g.vh };
  assert.ok(g.scrollW <= g.vw && g.scrollH <= g.vh, `${label}: nothing overflows the window (${g.scrollW}x${g.scrollH} in ${g.vw}x${g.vh})`);
  if (!g.gapShown) {
    if (!rotated) assert.ok(bandsOf(g).widest < 4.6, `${label}: hidden, so no band of 4 px or more should be left (${bandsOf(g).widest.toFixed(2)})`);
    return 'hidden';
  }
  assert.ok(within(g.gap, screen), `${label}: the fill is on the screen ${JSON.stringify(g.gap)}`);
  assert.ok(within(g.gap, g.stage), `${label}: and inside the stage`);
  if (!rotated) {
    assert.ok(within(rectOf(g.gap), rectOf(g.win)) && within(rectOf(g.win), rectOf(g.gap)), `${label}: and exactly the frame window ${JSON.stringify(g.gap)} vs ${JSON.stringify(g.win)}`);
    const { gaps, widest } = bandsOf(g);
    assert.ok(widest >= 3.4, `${label}: shown, so a band of about 4 px or more exists (${widest.toFixed(2)})`);
    const side = Object.entries(gaps).sort((a, b) => b[1] - a[1])[0][0];
    const at = {
      left: [g.win.left + gaps.left / 2, g.win.top + g.win.height / 2],
      right: [g.win.left + g.win.width - gaps.right / 2, g.win.top + g.win.height / 2],
      top: [g.win.left + g.win.width / 2, g.win.top + gaps.top / 2],
      bottom: [g.win.left + g.win.width / 2, g.win.top + g.win.height - gaps.bottom / 2],
    }[side];
    const [px] = await pixels(page, [at]);
    assert.ok(sum(px) > 0, `${label}: the ${side} band is lit (${px})`);
  }
  return 'shown';
}

gapCase('13a the four frames, both fits, scales 50 to 200 at 1080x1920', { settings: seed({ gapFill: 'blur' }) }, async ({ page, app }) => {
  await prepare(page, app);
  const tally = { shown: 0, hidden: 0 };
  let n = 0;
  for (const frameId of ['marquee', 'marquee-narrow', 'marquee-glow', 'none']) {
    for (const [posterFit, posterScale, posterOffsetX, posterOffsetY] of [['contain', 100, 0, 0], ['cover', 100, 0, 0], ['cover', 80, 0, 0], ['cover', 50, 0, 0], ['contain', 200, 0, 0], ['cover', 90, 6, -4]]) {
      const gapFill = n++ % 2 ? 'matte' : 'blur';
      await reconfigure(page, { frameId, posterFit, posterScale, posterOffsetX, posterOffsetY, gapFill });
      tally[await sweepOne(page, `${frameId}/${posterFit}/${posterScale}/${posterOffsetX},${posterOffsetY}/${gapFill}`, false)]++;
    }
  }
  assert.ok(tally.shown >= 10 && tally.hidden >= 4, `a spread of shown and hidden: ${JSON.stringify(tally)}`);
  check(`${n} frame x fit x scale x offset configurations: ${tally.shown} shown, ${tally.hidden} hidden, all inside the window`);
});

for (const vp of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 1080, height: 1080 }]) {
  gapCase(`13b ${vp.width}x${vp.height}`, { viewport: vp, settings: seed({ gapFill: 'blur' }) }, async ({ page, app }) => {
    await prepare(page, app);
    const seen = [];
    for (const patch of [{ posterFit: 'contain', posterScale: 100 }, { posterFit: 'cover', posterScale: 80 }, { posterFit: 'cover', posterScale: 50 }, { posterFit: 'contain', posterScale: 100, frameId: 'marquee', gapFill: 'matte' }]) {
      await reconfigure(page, patch);
      seen.push(await sweepOne(page, `${vp.width}x${vp.height} ${JSON.stringify(patch)}`, false));
    }
    assert.equal(seen[0], 'shown');
    assert.equal(seen[2], 'shown');
    check(`${vp.width}x${vp.height}: ${seen.join(', ')}; inside the window, no overflow`);
  });
}

gapCase('13c a resize keeps the fill in the window', { settings: seed({ gapFill: 'blur' }) }, async ({ page, app }) => {
  await prepare(page, app);
  for (const [width, height] of [[1280, 720], [1080, 1080], [1080, 1920]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    await settled(page);
    await sweepOne(page, `after a resize to ${width}x${height}`, false);
  }
  check('resized through 1280x720, 1080x1080 and back: the fill follows the window each time');
});

gapCase('13d rotation 90 on 1080x1920 (the screen as the viewer sees it is landscape)', { settings: seed({ gapFill: 'blur', rotation: 90 }) }, async ({ page, app }) => {
  await prepare(page, app);
  for (const patch of [{ posterFit: 'contain', posterScale: 100 }, { posterFit: 'cover', posterScale: 80 }, { posterFit: 'cover', posterScale: 100 }]) {
    await reconfigure(page, patch);
    const state = await sweepOne(page, `rotation 90 ${JSON.stringify(patch)}`, true);
    assert.equal(state, patch.posterScale === 100 && patch.posterFit === 'cover' ? 'hidden' : 'shown');
  }
  check('rotation 90: shown with bands, hidden when the poster covers; always on screen and inside the stage');
});

gapCase('13e the landscape fill and the gap fill coexist at 1920x1080', { viewport: { width: 1920, height: 1080 }, settings: seed({ gapFill: 'blur', fillMode: 'blur' }) }, async ({ page, app }) => {
  await prepare(page, app);
  assert.equal(await visible(page, '#fill-backdrop'), true, 'the landscape backdrop is up');
  assert.equal(await gapOn(page), true, 'and so is the gap fill');
  const g = await geometry(page);
  assert.ok(within(rectOf(g.gap), g.stage), 'the gap fill stays inside the stage');
  const { gaps } = bandsOf(g);
  const [side, band] = await pixels(page, [[g.stage.left / 2, g.vh / 2], [g.win.left + gaps.left / 2, g.win.top + g.win.height / 2]]);
  assert.ok(sum(side) > 0 && sum(band) > 0, `both are lit: side ${side}, band ${band}`);
  const a = await effectiveBrightness(page, '#fill-backdrop canvas.active');
  const b = await effectiveBrightness(page, '#gap-fill canvas.active');
  assert.ok(a <= 0.25 + 1e-9 && b <= 0.25 + 1e-9);
  assert.deepEqual(await filtered(page), []);
  check(`landscape fill (sides ${side}) and gap fill (bands ${band}) side by side; each at most 0.25`);
});

// ---------- r2 ----------

// 14. I1 (D67): a contained poster scaled just over 100 percent overhangs the window while its own bands are wide. The strip left
//     inside the window is under 4 px, so it is closed by scaling the poster a few px (still contain, nothing cropped), not left
//     as a black hairline. 2:3 in marquee-glow's 0.76 window leaves about 2 px at scale 113.3 (the real stage's number).
for (const gapFill of ['blur', 'matte']) {
  gapCase(`14 contain at a scale that leaves a thin strip inside the window (${gapFill})`, { settings: seed({ gapFill, posterFit: 'contain', posterScale: 113.3 }) }, async ({ page, app }) => {
    await prepare(page, app);
    const g = await geometry(page);
    const { gaps, img } = bandsOf(g);
    const fit = await page.evaluate(() => getComputedStyle(document.querySelector('.poster-layer.active')).objectFit);
    assert.equal(fit, 'contain', 'the poster stays contained: nothing is cropped');
    assert.equal(await gapOn(page), false, 'and nothing is filled');
    assert.ok(gaps.left < 0.6 && gaps.right < 0.6 && gaps.top < 0.6 && gaps.bottom < 0.6, `no strip is left: ${JSON.stringify(gaps)}`);
    // Where the image would have been at this scale without the gap fill: the same box about the same centre, no growth.
    const scale = 1.133;
    const plain = { width: g.win.width * scale, height: g.win.height * scale };
    const h = plain.height;
    const w = h * g.aspect;
    const move = Math.max(Math.abs(img.width - w) / 2, Math.abs(img.height - h) / 2);
    assert.ok(move <= 8, `no image edge moved more than 8 px (${move.toFixed(2)})`);
    check(`${gapFill}: contain, strip ${Math.max(...Object.values(gaps)).toFixed(2)} px, image edges moved ${move.toFixed(2)} px`);
  });
}
gapCase('14b with the gap fill off the same poster keeps its strip (today)', { settings: seed({ gapFill: 'none', posterFit: 'contain', posterScale: 113.3 }) }, async ({ page, app }) => {
  await prepare(page, app);
  const { gaps } = bandsOf(await geometry(page));
  assert.ok(gaps.left > 1 && gaps.left < 4, `the strip is there: ${gaps.left}`);
  check(`none: strip ${gaps.left.toFixed(2)} px per side, as before`);
});

// 15. M1: the gap layer fades with the poster when consecutive posters differ in shape. The mock has only 2:3 posters, so title 2's
//     image is answered here with one in the window's own shape (759 x 1000, no band at contain; all but a faint patch of it is transparent, so a pixel in the title-1 band shows only the layer or the black box under it); title 1 leaves a pillarbox.
const WINDOW_SHAPED = '<svg xmlns="http://www.w3.org/2000/svg" width="759" height="1000" viewBox="0 0 759 1000"><rect x="300" y="450" width="160" height="100" fill="#2a4a6a" fill-opacity=".02"/></svg>';
gapCase('15 the gap layer fades in and out with the poster when the next one is shaped differently', {
  settings: seed({ gapFill: 'blur', staticRatingKey: undefined, staticTitle: undefined, randomPoolSize: 2, crossfadeMs: 6000 }),
}, async ({ page, app }) => {
  await page.route('**/photo/:/transcode*', (route) => {
    const thumb = new URL(route.request().url()).searchParams.get('url') || '';
    if (thumb.startsWith('/library/metadata/2/')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: WINDOW_SHAPED });
    return route.fallback();
  });
  // The app's fallback for a missed transitionend (crossfadeMs + 500 ms of wall time, display.js) hands the poster box its black back. The
  // readings below freeze the fades but not that wall clock, so on a slow machine it fired mid-reading and both readings came out black.
  // Hold that one timer until the readings are taken; the end of the fade (transitionend) is still what the case waits for after that.
  await page.addInitScript(() => {
    const real = window.setTimeout.bind(window);
    window.__holdFallback = true;
    window.__held = [];
    window.setTimeout = (fn, ms, ...rest) => (ms === 6500 ? real(() => (window.__holdFallback ? window.__held.push(fn) : fn(...rest)), ms) : real(fn, ms, ...rest));
  });
  await page.goto(app.url);
  await posterShown(page);
  await refreshUntil(page, (alt) => alt === 'Poster: The Grand Marquee', 'title 1 (pillarbox)');
  await settled(page);
  assert.equal(await gapOn(page), true, 'title 1 leaves bands');
  const g15 = await geometry(page);
  const band15 = [g15.win.left + bandsOf(g15).gaps.left / 2, g15.win.top + g15.win.height / 2];
  const [bandStart] = await pixels(page, [band15]);
  assert.ok(sum(bandStart) > 6, `the band is lit before the fade: ${bandStart}`);
  const layerOpacity = () => page.evaluate(() => Number(getComputedStyle(document.querySelector('#gap-fill .gap-tint')).opacity) / 0.25);
  // 1 -> 2: the layer fades out while the posters cross-fade.
  await refreshUntil(page, (alt) => alt === 'Poster: Midnight Projector', 'title 2 (no band)');
  // Freeze the fades in the very task that sees the layer part-way (0.3 to 0.6 of its cap), so the pause cannot land late on a loaded machine.
  await page.waitForFunction(() => {
    const v = Number(getComputedStyle(document.querySelector('#gap-fill .gap-tint')).opacity) / 0.25;
    if (!(v > 0.3 && v < 0.6)) return false;
    document.getAnimations().forEach((a) => a.pause());
    return true;
  }, null, { timeout: 8000 });
  // Both poster layers are hidden for both readings (the outgoing poster is drawn at cover over the band pixel while it fades, and would hide the layer's share),
  // so the pixel shows only the gap layer or what lies under it. The band pixel as it is, and the same pixel with the gap layer taken away.
  await page.evaluate(() => document.querySelectorAll('.poster-layer').forEach((l) => { l.style.visibility = 'hidden'; }));
  const [bandMid] = await pixels(page, [band15]);
  await page.evaluate(() => { document.getElementById('gap-fill').style.visibility = 'hidden'; });
  const [bandBare] = await pixels(page, [band15]);
  await page.evaluate(() => {
    document.getElementById('gap-fill').style.visibility = '';
    document.querySelectorAll('.poster-layer').forEach((l) => { l.style.visibility = ''; });
    document.getAnimations().forEach((a) => a.play());
  });
  await page.evaluate(() => { window.__holdFallback = false; window.__held.splice(0).forEach((fn) => fn()); }); // the readings are taken: the fallback may fire now
  const out = { layer: await layerOpacity(), posters: await page.evaluate(() => ['poster-a', 'poster-b'].map((id) => Number(getComputedStyle(document.getElementById(id)).opacity))) };
  assert.ok(out.layer > 0.02 && out.layer < 0.98, `mid-fade the gap layer is between 0 and 1 (${out.layer}), not switched at once`);
  assert.ok(out.posters.some((v) => v > 0.02 && v < 0.98), `while the posters are mid-fade ${out.posters}`);
  // A snap to black puts an opaque box over the layer, so the two readings are then exactly equal; the layer at 0.3 to 0.6 of a start of 30 or so levels gives well over 3.
  assert.ok(sum(bandMid) >= sum(bandBare) + 3, `mid-fade the gap layer still lights the band pixel, it has not snapped to black (by at least 3 levels): ${bandMid} with the layer, ${bandBare} without (start ${bandStart})`);
  await settled(page);
  assert.equal(await layerOpacity(), 0, 'it ends gone: title 2 has no band');
  assert.ok(sum((await pixels(page, [band15]))[0]) <= 6, 'and the band ends black');
  assert.equal(await gapOn(page), false);
  // 2 -> 1: it fades in.
  await refreshUntil(page, (alt) => alt === 'Poster: The Grand Marquee', 'title 1 again');
  // Read it the moment the layer is part-way, freezing the fades in that same task (no wait on wall time).
  const into = await (await page.waitForFunction(() => {
    const v = Number(getComputedStyle(document.querySelector('#gap-fill .gap-tint')).opacity) / 0.25;
    if (!(v > 0.02 && v < 0.98)) return null;
    document.getAnimations().forEach((an) => an.pause());
    return v;
  }, null, { timeout: 8000 })).jsonValue();
  await page.evaluate(() => document.getAnimations().forEach((an) => an.play()));
  assert.ok(into > 0.02 && into < 0.98, `fading in with title 1 (${into})`);
  await settled(page);
  assert.equal(await layerOpacity(), 1);
  check(`gap layer opacity ${out.layer.toFixed(2)} while fading out and ${into.toFixed(2)} while fading in (posters ${out.posters.map((v) => v.toFixed(2))})`);
});

// 16. The blurred copy continues the poster: its canvas covers the window with the poster on its own tile, and the poster's edge
//     rows and columns stretched outward (D95), so the band beside the poster's edge takes that edge's colour (not the poster's middle
//     stretched over the window). Case 18 checks that the band shows nothing from inside the poster.
gapCase('16 the blur is lined up with the poster', { settings: seed({ gapFill: 'blur', posterFit: 'cover', posterScale: 80 }) }, async ({ page, app }) => {
  await prepare(page, app);
  const g = await geometry(page);
  const canvas = await page.evaluate(() => {
    const b = document.querySelector('#gap-fill canvas.active').getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height, cw: document.querySelector('#gap-fill canvas.active').width, ch: document.querySelector('#gap-fill canvas.active').height };
  });
  const bx = canvas.left + canvas.width / 2;
  const by = canvas.top + canvas.height / 2;
  assert.ok(Math.abs(bx - (g.box.left + g.box.width / 2)) <= 1 && Math.abs(by - (g.box.top + g.box.height / 2)) <= 1, `centred on the poster: canvas ${bx},${by} vs poster ${g.box.left + g.box.width / 2},${g.box.top + g.box.height / 2}`);
  assert.ok(Math.abs(canvas.width / canvas.height - canvas.cw / canvas.ch) < 0.01, 'in the poster canvas\'s own aspect, not stretched');
  assert.ok(canvas.left <= g.win.left + 1 && canvas.top <= g.win.top + 1 && canvas.left + canvas.width >= g.win.left + g.win.width - 1 && canvas.top + canvas.height >= g.win.top + g.win.height - 1, 'and it covers the window');
  assert.ok(canvas.width < g.win.width * 1.6, `without being scaled up more than it must be (${canvas.width.toFixed(0)} for a ${g.win.width.toFixed(0)} window)`);
  // The band's hue beside the poster's left edge, undimmed by the layer's 0.25, is close to the edge's own: within 20 per channel.
  // (The mock poster is a vertical gradient; a canvas scaled 1.25 x about the centre drifts the row by a few percent of the gradient,
  // about 8 per channel here, and the 0.25 dimming rounds each reading by up to 2 x 4.)
  const { gaps } = bandsOf(g);
  const rows = [0.3, 0.5, 0.7].map((f) => g.box.top + g.box.height * f);
  const points = rows.flatMap((y) => [[g.win.left + gaps.left / 2, y], [g.box.left + 3, y]]);
  const px = await pixels(page, points);
  for (let i = 0; i < rows.length; i++) {
    const band = px[i * 2].map((v) => v * 4);
    const edge = px[i * 2 + 1];
    assert.ok(near(band, edge, 20), `row ${i}: band ${band} (x4) is close to the poster's edge ${edge}`);
  }
  check(`blur centred on the poster (${bx.toFixed(0)},${by.toFixed(0)}), ${canvas.width.toFixed(0)} x ${canvas.height.toFixed(0)}; band hue x4 ${px.filter((_, i) => i % 2 === 0).map((p) => p.map((v) => v * 4))} vs edge ${px.filter((_, i) => i % 2 === 1)}`);
});

// 17. N2: turning the gap fill off on a landscape screen with the blurred landscape fill on. The window stays opaque black until the
//     gap layer has faded, so the landscape backdrop never shows through the bands; it ends as today's black bands.
gapCase('17 gap fill off mid-fade never lets the landscape backdrop through the window', {
  viewport: { width: 1920, height: 1080 },
  settings: seed({ gapFill: 'matte', fillMode: 'blur', crossfadeMs: 4000 }),
}, async ({ page, app }) => {
  await prepare(page, app);
  const g = await geometry(page);
  const { gaps } = bandsOf(g);
  const at = [g.win.left + gaps.left / 2, g.win.top + g.win.height / 2];
  const [start] = await pixels(page, [at]);
  assert.ok(sum(start) > 0, `the matte is up: ${start}`);
  const state = () => page.evaluate(() => {
    const gap = document.getElementById('gap-fill');
    const cs = getComputedStyle(gap);
    return {
      hidden: gap.hidden,
      display: cs.display,
      background: cs.backgroundColor,
      opacity: Number(cs.opacity),
      tint: Number(getComputedStyle(gap.firstElementChild).opacity),
      box: getComputedStyle(document.getElementById('poster-box')).backgroundColor,
    };
  });
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForSelector('#settings[open]');
  // Real time, not a count of sleeps: a loaded host stretches every sample, so each one carries the page's own clock.
  const crossfadeMs = 4000;
  const seen = [];
  const t0 = await page.evaluate(() => {
    const t = performance.now();
    return t;
  });
  await page.selectOption('select[name="gapFill"]', 'none');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(300);
    const st = await state();
    const now = await page.evaluate(() => performance.now());
    const [px] = await pixels(page, [at]);
    const elapsed = now - t0;
    seen.push({ ...st, px, elapsed });
    const gone = st.hidden || st.display === 'none';
    if (st.tint > 0 || elapsed < crossfadeMs) {
      assert.ok(!gone, `t=${(elapsed / 1000).toFixed(2)}s (tint ${st.tint.toFixed(2)}): the window layer is still in the page`);
      assert.equal(st.background, 'rgb(0, 0, 0)', 'and opaque black');
      assert.equal(st.opacity, 1);
      assert.equal(st.box, 'rgba(0, 0, 0, 0)', 'with the poster box transparent over it, so nothing behind the window shows');
    }
    if (gone) assert.ok(elapsed >= crossfadeMs - 100, `t=${(elapsed / 1000).toFixed(2)}s: the layer went before the fade could have ended`);
    assert.ok(sum(px) <= sum(start) + 3, `the band is never brighter than the matte it started as (${px} vs ${start})`);
    if (gone) break;
  }
  assert.ok(seen.at(-1).hidden, `the layer is gone after the fade (last sample at ${(seen.at(-1).elapsed / 1000).toFixed(2)}s)`);
  assert.ok(seen.some((s) => s.tint > 0.02 && s.tint < 0.24), `sampled mid-fade: ${seen.map((s) => s.tint.toFixed(2))}`);
  await settled(page);
  const [end] = await pixels(page, [at]);
  assert.ok(sum(end) <= 6, `and it ends as today's black band: ${end}`);
  assert.equal((await state()).box, 'rgb(0, 0, 0)');
  check(`matte to none at 1920x1080 with the landscape fill: tint ${seen.map((s) => s.tint.toFixed(2))} at ${seen.map((s) => (s.elapsed / 1000).toFixed(1))}s, band ${seen.map((s) => sum(s.px))} (start ${sum(start)}), end ${end}`);
});

// 18. No ghost (D95; D89 item 4): a band shows the poster's edge colours continued outward and nothing from inside the poster. The
//     mock poster has a year (#ddd, at 92 % of its height) and a ring (white at .25, around 37 %); a copy of the poster scaled past
//     its own edge would put a smudge of each into a band. Walking out from the poster's edge, the band must not change.
//     The tolerance: the layer is drawn at 0.25, so a level of the poster's own colour is a quarter of a level on screen, and the
//     screenshot rounds each channel (a flat band reads 1 level apart at most). The old blur's smudges ran 5 to 8 levels from the
//     band next to the edge at this brightness, and the poster's own features are larger still, so 2 is above the rounding and
//     below anything the poster draws.
const NO_GHOST_TOLERANCE = 2;
const NEAR_EDGE_PX = 4; // the reference sample: this far outside the poster's edge
const GHOST_MIN_PX = 24; // the samples that must match it start this far outside the edge, then every 24 px

for (const [ox, oy] of [[0, 0], [10, 0], [0, 10]]) {
  gapCase(`18 no ghost: a blurred band shows no inner detail of the poster (posterScale 80, offset ${ox},${oy})`, {
    settings: seed({ gapFill: 'blur', posterFit: 'cover', posterScale: 80, posterOffsetX: ox, posterOffsetY: oy }),
  }, async ({ page, app }) => {
    await prepare(page, app);
    const g = await geometry(page);
    const { img, gaps } = bandsOf(g);
    const win = rectOf(g.win);
    const lo = (a, b) => Math.max(a, b);
    const hi = (a, b) => Math.min(a, b);
    // Each side: its band's depth on screen, and the positions along the poster's edge to walk out from.
    const along = (from, to, n) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 0.5)) / n);
    const sides = [
      { name: 'left', depth: hi(gaps.left, img.left), at: (d, t) => [img.left - d, t], lateral: along(lo(win.top, 0), hi(win.bottom, g.vh), 24) },
      { name: 'right', depth: hi(gaps.right, g.vw - (img.left + img.width)), at: (d, t) => [img.left + img.width + d, t], lateral: along(lo(win.top, 0), hi(win.bottom, g.vh), 24) },
      { name: 'top', depth: hi(gaps.top, img.top), at: (d, t) => [t, img.top - d], lateral: along(lo(img.left, lo(win.left, 0)), hi(img.left + img.width, hi(win.right, g.vw)), 24) },
      { name: 'bottom', depth: hi(gaps.bottom, g.vh - (img.top + img.height)), at: (d, t) => [t, img.top + img.height + d], lateral: along(lo(img.left, lo(win.left, 0)), hi(img.left + img.width, hi(win.right, g.vw)), 24) },
    ].filter((s) => s.depth > GHOST_MIN_PX + NEAR_EDGE_PX);
    assert.ok(sides.length >= 2, `bands to look at: ${JSON.stringify(gaps)}`);
    const points = [];
    const plan = [];
    for (const s of sides) {
      const distances = [];
      for (let d = GHOST_MIN_PX; d <= s.depth - 2; d += GHOST_MIN_PX) distances.push(d);
      distances.push(s.depth - 2);
      for (const t of s.lateral) {
        plan.push({ side: s.name, t, near: points.length, far: distances.map((d, i) => ({ d, index: points.length + 1 + i })) });
        points.push(s.at(NEAR_EDGE_PX, t), ...distances.map((d) => s.at(d, t)));
      }
    }
    const px = await pixels(page, points);
    let compared = 0;
    let worst = 0;
    for (const p of plan) {
      const near = px[p.near];
      for (const f of p.far) {
        const spread = Math.max(...px[f.index].map((v, c) => Math.abs(v - near[c])));
        worst = Math.max(worst, spread);
        compared++;
        assert.ok(spread <= NO_GHOST_TOLERANCE, `${p.side} band, ${f.d} px out at ${Math.round(p.t)}: ${px[f.index]} differs from ${near} next to the edge by ${spread} (more than ${NO_GHOST_TOLERANCE})`);
      }
    }
    assert.ok(sides.some((s) => s.name === 'bottom' || s.name === 'top'), 'a top or bottom band, where the year would show');
    check(`no ghost at offset ${ox},${oy}: ${sides.map((s) => `${s.name} ${Math.round(s.depth)} px`).join(', ')}; ${compared} samples, widest spread ${worst} (tolerance ${NO_GHOST_TOLERANCE})`);
  });
}

// 19. D89 ("the matte is unchanged"): the active gap canvas covers the whole window whatever style came before it. A blurred canvas
//     has a rectangle of its own; the matte's one pixel must not keep it after a switch, a resize or a rotation (a stale rectangle
//     leaves part of the bands black).
const coversWindow = (page) => page.evaluate(() => {
  const c = document.querySelector('#gap-fill canvas.active')?.getBoundingClientRect();
  const w = document.getElementById('gap-fill').getBoundingClientRect();
  return Boolean(c) && c.left <= w.left + 1.5 && c.top <= w.top + 1.5 && c.right >= w.right - 1.5 && c.bottom >= w.bottom - 1.5;
});
const openSettings = async (page) => {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForSelector('#settings[open]');
};
gapCase('19 the matte covers the window after a blur, through a resize and a rotation', { settings: seed({ gapFill: 'blur', posterFit: 'cover', posterScale: 80 }) }, async ({ page, app }) => {
  await prepare(page, app);
  assert.equal(await coversWindow(page), true, 'the blur covers the window to begin with');
  await openSettings(page);
  await page.selectOption('select[name="gapFill"]', 'matte');
  await page.waitForFunction(() => document.querySelector('#gap-fill canvas.active')?.width === 1, null, { timeout: 5000 });
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  assert.equal(await coversWindow(page), true, 'the matte covers the window right after the switch');
  await page.setViewportSize({ width: 1600, height: 2400 });
  await page.waitForFunction(() => Math.abs(document.getElementById('gap-fill').getBoundingClientRect().width - 924) > 20, null, { timeout: 5000 });
  await settled(page);
  assert.equal(await coversWindow(page), true, 'and after a resize');
  await openSettings(page);
  await page.selectOption('select[name="rotation"]', '90');
  await page.waitForFunction(() => document.getElementById('stage').style.getPropertyValue('--rotation') === '90deg', null, { timeout: 5000 });
  await settled(page);
  assert.equal(await coversWindow(page), true, 'and after a rotation');
  check('blur, then matte, resized to 1600x2400, rotated 90: the active canvas covers #gap-fill each time');
});

// 20. D95: at fit "cover" the tile shows what the screen shows of the poster (the cover crop), so the band beside an edge continues
//     the edge that is visible, not the row the crop cut off. The check is relative, so it does not hang on how the 0.25 tint rounds:
//     the band, times 4, is nearer to the poster just inside its edge (what the screen shows) than to the image's own outer row (what
//     the crop cut off), and never farther. The mock poster's top rows are flat, so there the two can tie; at the bottom the crop
//     cut off a row that differs, so the band must be strictly nearer to the visible edge on at least one side.
const dist = (a, b) => Math.max(...a.map((v, c) => Math.abs(v - b[c])));
gapCase('20 cover at 80 %: the band continues the poster\'s visible edge, not the row the crop cut off', { settings: seed({ gapFill: 'blur', posterFit: 'cover', posterScale: 80 }) }, async ({ page, app }) => {
  await prepare(page, app);
  const g = await geometry(page);
  const { img, gaps } = bandsOf(g);
  assert.ok(gaps.top > 30 && gaps.bottom > 30, `top and bottom bands: ${JSON.stringify(gaps)}`);
  const fractions = [0.3, 0.5, 0.7];
  // The image's own outer rows, read from the decoded poster at the columns the samples sit over (cover crops the height here).
  const outer = await page.evaluate((fractions) => {
    const im = document.querySelector('.poster-layer.active');
    const c = document.createElement('canvas');
    c.width = im.naturalWidth;
    c.height = im.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(im, 0, 0);
    const at = (f, y) => [...ctx.getImageData(Math.round(f * (c.width - 1)), y, 1, 1).data].slice(0, 3);
    return { top: fractions.map((f) => at(f, 0)), bottom: fractions.map((f) => at(f, c.height - 1)) };
  }, fractions);
  const spots = [
    { name: 'top', edge: (x) => [x, img.top + 3], band: (x) => [x, img.top - 6] },
    { name: 'bottom', edge: (x) => [x, img.top + img.height - 4], band: (x) => [x, img.top + img.height + 6] },
  ];
  let strictly = 0;
  for (const spot of spots) {
    const xs = fractions.map((f) => img.left + img.width * f);
    const px = await pixels(page, xs.flatMap((x) => [spot.edge(x), spot.band(x)]));
    xs.forEach((x, i) => {
      const visible = px[i * 2];
      const band = px[i * 2 + 1].map((v) => v * 4);
      const cropped = outer[spot.name][i];
      const toVisible = dist(band, visible);
      const toCropped = dist(band, cropped);
      assert.ok(toVisible <= toCropped, `${spot.name} band at ${Math.round(x)}: ${band} (x4) is nearer the cropped-off row ${cropped} than the visible edge ${visible}`);
      if (toVisible < toCropped) strictly++;
      check(`cover 80 %, ${spot.name} at ${Math.round(x)}: band x4 ${band}, visible edge ${visible} (off ${toVisible}), cropped-off row ${cropped} (off ${toCropped})`);
    });
  }
  assert.ok(strictly > 0, 'the band is strictly nearer the visible edge somewhere (the bottom, where the crop cut off a different row)');
});

// 21 to 23. D95: the blur is only ever drawn from its plan once the layout is known. Drawn on its own (the whole poster at 48 px) it
//     would put the poster's inside over the bands, for as long as a later layout took to repaint it, and a canvas cleared after the
//     plan drew it would leave the bands black. A second layout() in the same task hides either, so these watch the writes themselves:
//     every size written to a gap canvas, and every change of a gap canvas's class, recorded as they happen.
const watchGapCanvases = (page) => page.evaluate(() => {
  window.__gapSizes = [];
    for (const dim of ['width', 'height']) {
    const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, dim);
    Object.defineProperty(HTMLCanvasElement.prototype, dim, {
      ...d,
      set(v) {
        if (this.closest?.('#gap-fill')) window.__gapSizes.push(`${dim}=${v}`);
        d.set.call(this, v);
      },
    });
  }
  // A record holds the class before the change; the class after it is the next record's "before" for that canvas, or what it is now.
  window.__gapRecords = [];
  new MutationObserver((records) => {
    for (const r of records) window.__gapRecords.push({ id: r.target.id, before: r.oldValue || '' });
  }).observe(document.getElementById('gap-fill'), { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
});
const gapLog = (page) => page.evaluate(() => {
  const records = window.__gapRecords.splice(0);
  const classes = records.map((r, i) => {
    const next = records.slice(i + 1).find((n) => n.id === r.id);
    const after = next ? next.before : document.getElementById(r.id).className;
    const was = /\bactive\b/.test(r.before);
    const now = /\bactive\b/.test(after);
    return `${r.id}:${was ? 'active' : 'inactive'}>${now ? 'active' : 'inactive'}`;
  });
  return { sizes: window.__gapSizes.splice(0), classes };
});

// 21. Switching the style in Settings: none -> blur -> matte -> blur.
gapCase('21 switching to the blur never draws the whole poster over the bands', { settings: seed({ gapFill: 'none', posterFit: 'cover', posterScale: 80 }) }, async ({ page, app }) => {
  await prepare(page, app);
  await watchGapCanvases(page);
  await openSettings(page);
  for (const style of ['blur', 'matte', 'blur']) {
    await page.selectOption('select[name="gapFill"]', style);
    await page.waitForFunction((style) => (style === 'matte' ? document.querySelector('#gap-fill canvas.active')?.width === 1 : (document.querySelector('#gap-fill canvas.active')?.width || 0) > 1), style, { timeout: 5000 });
    const { sizes } = await gapLog(page);
    if (style === 'matte') continue; // the matte reads the poster at 48 px on its way to one pixel; that is not the blur
    assert.ok(sizes.length > 0, `the canvases were drawn for the ${style}`);
    assert.ok(!sizes.includes('width=48') && !sizes.includes('height=72'), `a plain 48 x 72 draw reached a gap canvas: ${sizes.join(' ')}`);
    check(`switch to blur: only the plan's size was written to the gap canvases (${sizes.join(' ')})`);
  }
});

// 22. A poster change under the blur: the incoming canvas is drawn from the plan, never the whole poster first.
gapCase('22 a poster change under the blur never draws the whole poster over the bands', { settings: limitPool({ gapFill: 'blur', posterFit: 'cover', posterScale: 80 }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await settled(page);
  const first = await altOf(page);
  await watchGapCanvases(page);
  await refreshUntil(page, (alt) => alt !== first && alt !== '', 'the other title');
  await settled(page);
  const { sizes, classes } = await gapLog(page);
  assert.ok(sizes.length > 0, 'the incoming canvas was drawn');
  assert.ok(!sizes.includes('width=48') && !sizes.includes('height=72'), `a plain 48 x 72 draw reached a gap canvas on a poster change: ${sizes.join(' ')}`);
  assert.ok(await page.evaluate(() => (document.querySelector('#gap-fill canvas.active')?.width || 0) > 1), 'and the active canvas holds the plan');
  check(`poster change under blur: sizes written ${sizes.join(' ')}; class changes ${classes.join(' ')}`);
});

// 23. Matte -> blur: the canvas the matte filled is drawn from the plan and keeps its class. It is not cleared first and drawn again.
gapCase('23 matte to blur keeps the active gap canvas active', { settings: seed({ gapFill: 'matte', posterFit: 'cover', posterScale: 80 }) }, async ({ page, app }) => {
  await prepare(page, app);
  const activeId = await page.evaluate(() => document.querySelector('#gap-fill canvas.active')?.id);
  assert.ok(activeId, 'the matte is on a canvas');
  await watchGapCanvases(page);
  await openSettings(page);
  await page.selectOption('select[name="gapFill"]', 'blur');
  await page.waitForFunction(() => (document.querySelector('#gap-fill canvas.active')?.width || 0) > 1, null, { timeout: 5000 });
  const { classes } = await gapLog(page);
  assert.deepEqual(classes.filter((c) => c.startsWith(`${activeId}:active>inactive`)), [], `the active canvas never lost its class on the switch: ${classes.join(' ')}`);
  assert.equal(await page.evaluate(() => document.querySelector('#gap-fill canvas.active')?.id), activeId, 'and is still the active one');
  check(`matte to blur: ${activeId} stayed active (class changes: ${classes.join(' ') || 'none'})`);
});

// 24. Probe: the blur with no plan to draw (a poster taken off the screen by a block, then a resize; a poster that never loads). No
//     stale copy of an earlier poster shows in the window.
gapCase('24 a blocked poster leaves no stale blur in the window after a resize', { settings: limitPool({ gapFill: 'blur', randomPoolSize: 1 }) }, async ({ page, app, mock }) => {
  await mock.post('rate', { ratingKey: '1', contentRating: 'R' });
  await page.goto(app.url);
  await posterShown(page);
  await settled(page);
  for (let i = 0; i < 100; i++) {
    if ((await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]'))).length) break;
    await page.waitForTimeout(100);
  }
  await mock.down();
  await setHouseholdLimit(page);
  await page.waitForFunction(() => document.body.classList.contains('poster-blocked'), null, { timeout: 5000 });
  await page.setViewportSize({ width: 1600, height: 2400 });
  await page.waitForFunction(() => Math.abs(document.getElementById('gap-fill').getBoundingClientRect().width - 924) > 20 || document.getElementById('gap-fill').hidden, null, { timeout: 5000 });
  await settled(page);
  assert.equal(await gapOn(page), false, 'the gap layer is hidden');
  const shown = await page.evaluate(() => [...document.querySelectorAll('#gap-fill canvas')].map((c) => [c.id, getComputedStyle(c).visibility, getComputedStyle(c).opacity]));
  assert.ok(shown.every(([, vis, op]) => vis === 'hidden' || Number(op) === 0), `every gap canvas is out of sight: ${JSON.stringify(shown)}`);
  const g = await geometry(page);
  const [inside] = await pixels(page, [[g.win.left + 15, g.win.top + g.win.height * 0.3]]); // a band's place, clear of the card's text
  assert.ok(sum(inside) <= 6, `the window is black where the bands were: ${inside}`);
  check(`blocked, then resized to 1600x2400: gap canvases ${JSON.stringify(shown)}, band place ${inside}`);
});

// ---------- Backdrop art (R-FILL-3, D232) ----------
// The Plex mock gives titles 1, 3, 4, 5 and 7 background art (a bright SVG: #ffe066 across the top, the title's colour mixed with white across the bottom);
// titles 2, 6 and 8 have none. Marquee-glow at fit 'contain' leaves a pillarbox pair, as above.

const ART_TOP = [255, 224, 102];
const ART_BOTTOM_TITLE_3 = [200, 184, 215]; // #5b2a86 mixed with white, the mock's formula

/** What the active gap canvas holds: its size and the colours of its top and bottom rows (the art's two flat ends). */
const activeCanvas = (page) => page.evaluate(() => {
  const c = [...document.querySelectorAll('#gap-fill canvas.active')].pop(); // the art's canvas lies over the blur's, so the last current one is what shows on top
  if (!c) return null;
  const ctx = c.getContext('2d');
  const at = (y) => [...ctx.getImageData(Math.floor(c.width / 2), Math.max(0, Math.min(c.height - 1, y)), 1, 1).data].slice(0, 3);
  return { id: c.id, width: c.width, height: c.height, top: at(2), bottom: at(c.height - 3) };
});
const isArt = (c) => Boolean(c) && near(c.top, ART_TOP, 8);

/** Every gap canvas that can be seen (the product of its opacities over 1 %) and holds the art. Empty when no art is on screen. */
const artOnScreen = (page) => page.evaluate((top) => {
  const out = [];
  for (const c of document.querySelectorAll('#gap-fill canvas')) {
    let v = 1;
    for (let el = c; el; el = el.parentElement) v *= Number(getComputedStyle(el).opacity);
    if (c.width <= 1 || v <= 0.01 || getComputedStyle(c).visibility === 'hidden') continue;
    const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), 2, 1, 1).data;
    if (Math.abs(d[0] - top[0]) <= 8 && Math.abs(d[1] - top[1]) <= 8 && Math.abs(d[2] - top[2]) <= 8) out.push(c.id);
  }
  return out;
}, ART_TOP);

const waitArt = (page) => page.waitForFunction((top) => {
  const c = [...document.querySelectorAll('#gap-fill canvas.active')].pop();
  if (!c || c.width <= 1) return false;
  const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), 2, 1, 1).data;
  return Math.abs(d[0] - top[0]) <= 8 && Math.abs(d[1] - top[1]) <= 8 && Math.abs(d[2] - top[2]) <= 8;
}, ART_TOP, { timeout: 15000 });

/**
 * Counts, in the page, the art's own events so a check that something was dropped can wait on the event and not on time: `__artBlobs` (an image body that
 * finished downloading through fetch) and `__decStart` / `__decEnd` (decodes of an image that is not in the page, which is how the display decodes art).
 */
const hookArt = (page) => page.addInitScript(() => {
  // The app gives up on a request after 20 s (AbortSignal.timeout). A case that holds art while it drives posters can take longer than that on a loaded
  // machine, and an abandoned request would never produce the body the case waits for; so the app's 20 s limit is lifted here, and only here.
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  AbortSignal.timeout = (ms) => (ms === 20000 ? new AbortController().signal : timeout(ms));
  window.__artBlobs = 0;
  window.__decStart = 0;
  window.__decEnd = 0;
  const blob = Response.prototype.blob;
  Response.prototype.blob = function () {
    const p = blob.call(this);
    if (decodeURIComponent(this.url).includes('/art/')) p.then(() => window.__artBlobs++).catch(() => {});
    return p;
  };
  const decode = HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode = function () {
    const p = decode.call(this);
    if (!this.id) {
      window.__decStart++;
      p.then(() => window.__decEnd++, () => window.__decEnd++);
    }
    return p;
  };
});
/** Waits until `n` image bodies have arrived and every decode that started has ended: whatever the display was going to do with them is done. */
const artHandled = (page, n) => page.waitForFunction((n) => window.__artBlobs >= n && window.__decStart === window.__decEnd, n, { timeout: 15000 });

/** The art requests the page makes (the transcoder with an /art/ path), noted when they are issued, whether or not the server answers. */
const watchArt = (page) => {
  const seen = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.pathname === '/photo/:/transcode' && /\/art\//.test(u.searchParams.get('url') || '')) seen.push({ art: u.searchParams.get('url'), width: Number(u.searchParams.get('width')), height: Number(u.searchParams.get('height')) });
  });
  return seen;
};
const consoleOf = (page) => {
  const lines = [];
  page.on('console', (m) => lines.push(m.text()));
  return lines;
};
const backdropSettings = (extra = {}) => seed({ gapFill: 'backdrop', ...extra });

// 25. The bands show the mock's backdrop for a title that has one: dimmed to at most 0.25, no filter, a small canvas, one small request.
gapCase('25 backdrop: a title with art shows it in the bands, dimmed, from one small request', { settings: backdropSettings() }, async ({ page, app, mock }) => {
  const asked = watchArt(page);
  const lines = consoleOf(page);
  await page.goto(app.url);
  await posterShown(page);
  await waitArt(page);
  await settled(page);
  const held = await activeCanvas(page);
  assert.ok(isArt(held), `the active gap canvas holds the art: ${JSON.stringify(held)}`);
  assert.ok(near(held.bottom, ART_BOTTOM_TITLE_3, 10), `and it is title 3's art (bottom ${held.bottom})`);
  assert.ok(held.width > 1 && held.height > 1 && Math.max(held.width, held.height) <= 256, `the canvas is at most 256 px on its longer side: ${held.width}x${held.height}`);
  assert.equal(await gapOn(page), true);
  const eff = await effectiveBrightness(page, '#gap-art-a.active, #gap-art-b.active');
  assert.ok(eff > 0 && eff <= 0.25 + 1e-9, `brightness ${eff} is at most 0.25`);
  assert.deepEqual(await filtered(page), [], 'no element has a filter or backdrop-filter');
  const images = await page.evaluate(() => [...document.images].map((i) => ({ id: i.id, w: i.naturalWidth, src: i.currentSrc.slice(0, 5) })));
  assert.ok(images.every((i) => i.w < 1000), `no full-size art in an image element: ${JSON.stringify(images)}`);
  const g = await geometry(page);
  const { gaps } = bandsOf(g);
  const x = g.win.left + gaps.left / 2;
  const [topPx, bottomPx] = await pixels(page, [[x, g.win.top + g.win.height * 0.06], [x, g.win.top + g.win.height * 0.94]]);
  assert.ok(near(topPx, ART_TOP.map((v) => v * 0.25), 12), `the band's top is the art at a quarter: ${topPx}`);
  assert.ok(near(bottomPx, ART_BOTTOM_TITLE_3.map((v) => v * 0.25), 12), `and its bottom: ${bottomPx}`);
  assert.equal(asked.length, 1, `one backdrop request: ${JSON.stringify(asked)}`);
  assert.match(asked[0].art, /^\/library\/metadata\/3\/art\//, "the poster's own art");
  assert.ok(asked[0].width > 0 && asked[0].width <= 480, `asked at width ${asked[0].width}, never the full size`);
  const log = (await mock.get('log')).requests.filter((r) => /\/art\//.test(decodeURIComponent(r)));
  assert.equal(log.length, 1, 'and the server saw one');
  assert.ok(!lines.some((l) => l.includes('demo-token')), 'the token is in no console line');
  assert.equal(await page.isVisible('#empty'), false, 'no error card');
  check(`backdrop: ${held.width}x${held.height} canvas, top ${held.top} bottom ${held.bottom}, on screen ${topPx} / ${bottomPx}, effective ${eff.toFixed(3)}, one request at width ${asked[0].width}`);
});

// 26. A title without art shows the blur and asks nothing.
gapCase('26 backdrop: a title with no art shows the blur and makes no request', { settings: backdropSettings({ staticRatingKey: '2', staticTitle: 'Midnight Projector' }) }, async ({ page, app }) => {
  const asked = watchArt(page);
  await prepare(page, app);
  assert.equal(await gapOn(page), true);
  const held = await activeCanvas(page);
  assert.ok(held && !isArt(held), `the gap canvas is the blur, not art: ${JSON.stringify(held)}`);
  assert.deepEqual(await artOnScreen(page), []);
  const g = await geometry(page);
  const { gaps } = bandsOf(g);
  const [band] = await pixels(page, [[g.win.left + gaps.left / 2, g.win.top + g.win.height / 2]]);
  assert.ok(sum(band) > 0, `the band is lit: ${band}`);
  assert.deepEqual(asked, [], 'nothing is asked of the server');
  check(`backdrop, no art: blur ${held.width}x${held.height}, band ${band}, no request`);
});

// 27. With the request failing the blur shows, there is no error card, and the token is not in the console.
gapCase('27 backdrop: a failing backdrop request leaves the blur, no error card, no token in the console', { settings: backdropSettings() }, async ({ page, app, mock }) => {
  await mock.post('art-fail', { status: 500 });
  const asked = watchArt(page);
  const lines = consoleOf(page);
  const warned = page.waitForEvent('console', { predicate: (m) => /backdrop art/.test(m.text()), timeout: 15000 });
  await page.goto(app.url);
  await posterShown(page);
  await warned;
  await settled(page);
  assert.equal(asked.length, 1, 'it was asked once');
  const held = await activeCanvas(page);
  assert.ok(held && !isArt(held), `the blur shows: ${JSON.stringify(held)}`);
  assert.equal(await gapOn(page), true);
  assert.equal(await page.isVisible('#empty'), false, 'no error card');
  assert.ok(!lines.some((l) => l.includes('demo-token') || l.includes('X-Plex-Token') || l.includes('/photo/')), `no address or token in the console: ${lines.filter((l) => /backdrop/.test(l)).join(' | ')}`);
  check(`backdrop request failing: blur ${held.width}x${held.height} stays, no error card, console clean`);
});

// 28. Art that finishes loading while its poster is on screen replaces the blur (D232 1).
gapCase('28 backdrop: art that arrives late replaces the blur of its own poster', { settings: backdropSettings() }, async ({ page, app, mock }) => {
  await hookArt(page);
  await mock.post('art-hold');
  const requested = page.waitForRequest((req) => decodeURIComponent(req.url()).includes('/art/'), { timeout: 15000 });
  await page.goto(app.url);
  await posterShown(page);
  await requested;
  await settled(page);
  const before = await activeCanvas(page);
  assert.ok(before && !isArt(before), `the blur shows while the art is held: ${JSON.stringify(before)}`);
  await mock.post('art-release');
  await waitArt(page);
  await settled(page);
  assert.ok(isArt(await activeCanvas(page)), 'the art replaced the blur');
  check('backdrop, late: blur first, then the art of the same poster');
});

// ---- D234 1: late art fades in over the blur, never from black ----
/**
 * Starts a per-animation-frame trace in the page. Each frame records `level`: the band's composited level (0 to 255), modelled from what the browser
 * reports for the gap layer (the tint's opacity chain times the canvases composed over black in document order, each canvas being its own opacity
 * times the colour of its left column at mid height), and `art`: for each art canvas its own opacity and whether it is current.
 */
const startTrace = (page) => page.evaluate(() => {
  window.__trace = [];
  window.__tracing = true;
  const colour = (c) => {
    if (c.width < 1 || c.height < 1) return 0;
    const d = c.getContext('2d').getImageData(0, Math.floor(c.height / 2), 1, 1).data;
    return (d[0] + d[1] + d[2]) / 3;
  };
  const frame = () => {
    const tint = document.querySelector('.gap-tint');
    let level = 0;
    for (const c of tint.children) {
      const op = Number(getComputedStyle(c).opacity);
      level = op * colour(c) + (1 - op) * level;
    }
    for (let el = tint; el; el = el.parentElement) level *= Number(getComputedStyle(el).opacity);
    const art = {};
    for (const id of ['gap-art-a', 'gap-art-b']) {
      const c = document.getElementById(id);
      art[id] = { op: Number(getComputedStyle(c).opacity), active: c.classList.contains('active') };
    }
    const shown = document.querySelector('.poster-layer.active');
    window.__trace.push({ level, art, poster: shown ? Number(getComputedStyle(shown).opacity) : 1 });
    if (window.__tracing) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});
const stopTrace = (page) => page.evaluate(() => {
  window.__tracing = false;
  return window.__trace;
});
const twoFrames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(document.getAnimations().length)))));
const artCurrent = (page) => page.waitForFunction(() => {
  const c = document.querySelector('#gap-art-a.active, #gap-art-b.active');
  return Boolean(c) && c.width > 1;
}, null, { timeout: 15000 });
/** Waits until the server holds `n` art requests (they are in its log at once), so the test releases them when it chooses. */
const artAtServer = async (mock, n = 1) => {
  for (let i = 0; i < 300; i++) {
    if ((await mock.get('log')).requests.filter((r) => decodeURIComponent(r).includes('/art/')).length >= n) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('the art request never reached the server');
};

// 35. Art that lands after its poster is up never darkens the band: it fades in over the blur, and the band does not dip toward black (D234 1 a, D235 3).
gapCase('35 backdrop: late art never takes the band below the blur\'s level', { settings: backdropSettings({ crossfadeMs: 1200 }) }, async ({ page, app, mock }) => {
  await mock.post('art-hold');
  await page.goto(app.url);
  await posterShown(page);
  await artAtServer(mock);
  await settled(page);
  await startTrace(page);
  await page.waitForFunction(() => window.__trace.length >= 3, null, { timeout: 15000 }); // the trace is running before anything is released
  await twoFrames(page);
  await mock.post('art-release');
  await artCurrent(page);
  await settled(page);
  await twoFrames(page);
  const trace = await stopTrace(page);
  const base = trace[0].level;
  assert.ok(base > 4, `the blur is lit before the release (level ${base.toFixed(1)})`);
  const min = Math.min(...trace.map((f) => f.level));
  const last = trace[trace.length - 1].level;
  assert.ok(min >= base - 1, `through the change the band does not dip below the blur's level (it goes from the blur to the art without passing under the lower of the two; the mock's art is the brighter): blur ${base.toFixed(1)}, lowest ${min.toFixed(1)}, ${trace.length} frames`);
  assert.ok(isArt(await activeCanvas(page)), 'and the art is what shows at the end');
  const g = await geometry(page);
  const { gaps } = bandsOf(g);
  const [px] = await pixels(page, [[g.win.left + gaps.left / 2, g.win.top + g.win.height / 2]]);
  const seen = (px[0] + px[1] + px[2]) / 3;
  assert.ok(Math.abs(seen - last) <= 8, `the trace's model matches the screen: model ${last.toFixed(1)}, screen ${seen.toFixed(1)}`);
  check(`backdrop, late art over blur: blur level ${base.toFixed(1)}, lowest ${min.toFixed(1)}, end ${last.toFixed(1)} (screen ${seen.toFixed(1)}), ${trace.length} frames`);
});

// 36. Art that lands while its poster is still cross-fading in does not pull the band back: the level only rises (D234 1 b).
gapCase('36 backdrop: art that lands mid cross-fade does not pull the band back', { settings: backdropSettings({ crossfadeMs: 4000 }) }, async ({ page, app, mock }) => {
  await mock.post('art-hold');
  await page.goto(app.url);
  await posterShown(page);
  await artAtServer(mock);
  await startTrace(page);
  await page.waitForFunction(() => window.__trace.length >= 3, null, { timeout: 15000 }); // the trace is running before anything is released
  await page.waitForFunction(() => {
    const v = Number(getComputedStyle(document.querySelector('.poster-layer.active')).opacity);
    return v > 0.35 && v < 0.65; // the poster is well into its 4 s fade, and has time left
  }, null, { timeout: 15000 });
  await mock.post('art-release');
  await artCurrent(page);
  await settled(page);
  await twoFrames(page);
  const trace = await stopTrace(page);
  let peak = 0;
  let worst = 0;
  for (const f of trace) {
    peak = Math.max(peak, f.level);
    worst = Math.max(worst, peak - f.level);
  }
  const first = trace[0].level;
  const last = trace[trace.length - 1].level;
  const landed = trace.findIndex((f) => f.art['gap-art-a'].active || f.art['gap-art-b'].active);
  assert.ok(landed > 0 && trace[landed - 1].level > 3, `the art landed with the band part-way up (level ${trace[landed - 1]?.level.toFixed(1)} at frame ${landed})`);
  assert.ok(trace[landed].poster < 0.95, `the art landed while the poster's cross-fade was still running (poster opacity ${trace[landed].poster.toFixed(2)} at frame ${landed})`);
  assert.ok(last > first + 4, `the band rose over the change (${first.toFixed(1)} to ${last.toFixed(1)})`);
  assert.ok(worst <= 1, `the band's level never fell back after the art landed: largest fall ${worst.toFixed(2)} over ${trace.length} frames`);
  assert.ok(isArt(await activeCanvas(page)), 'and the art shows at the end');
  check(`backdrop, art mid cross-fade: level ${first.toFixed(1)} to ${last.toFixed(1)}, largest fall ${worst.toFixed(2)}, ${trace.length} frames`);
});

// 37. The next poster comes while the art is still fading in: the art leaves with its own poster, by fading out, and none of it is left (D234 1 c).
gapCase('37 backdrop: art that is still fading in leaves with its poster', { settings: limitPool({ gapFill: 'backdrop', randomPoolSize: 3, crossfadeMs: 4000 }) }, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  await refreshUntil(page, (alt) => alt === 'Poster: Midnight Projector', 'title 2 (no art)');
  await settled(page);
  await mock.post('art-hold');
  await refreshUntil(page, (alt) => alt === 'Poster: The Grand Marquee', 'title 1 (art held)');
  await artAtServer(mock, 1);
  await settled(page);
  await startTrace(page);
  await page.waitForFunction(() => window.__trace.length >= 3, null, { timeout: 15000 }); // the trace is running before anything is released
  await mock.post('art-release', { match: '/metadata/1/' });
  // The poster is changed in the very task that sees the art part-way in (a 4 s fade, the fade back out then takes the same share of it), so the change always lands mid-fade however slow the machine is.
  const id = await (await page.waitForFunction(() => {
    const c = document.querySelector('#gap-art-a.active, #gap-art-b.active');
    const v = c ? Number(getComputedStyle(c).opacity) : 0;
    if (!(v > 0.35 && v < 0.7)) return false;
    document.querySelector('[data-action="refresh"]').click();
    return c.id;
  }, null, { timeout: 15000 })).jsonValue();
  await page.waitForFunction(() => document.querySelector('.poster-layer.active')?.alt !== 'Poster: The Grand Marquee', null, { timeout: 15000 });
  await settled(page);
  await twoFrames(page);
  const trace = await stopTrace(page);
  const mine = trace.map((f) => f.art[id]);
  const up = mine.findIndex((a) => a.active);
  const at = up < 0 ? -1 : up + mine.slice(up).findIndex((a) => !a.active);
  assert.ok(up >= 0 && at > up, `the art's layer was taken off its poster at the change (frame ${at} of ${trace.length})`);
  const before = mine[at - 1].op;
  const after = mine.slice(at);
  assert.ok(before > 0.25 && before < 0.9, `it was part-way in when the poster changed: ${before.toFixed(2)}`);
  assert.ok(after.slice(0, 2).every((a) => a.op > 0 && a.op <= before + 0.2), `no jump to 0 and no jump to 1 at the change: ${after.slice(0, 2).map((a) => a.op.toFixed(2))} after ${before.toFixed(2)}`);
  let worst = 0;
  for (let i = 1; i < after.length; i++) worst = Math.max(worst, after[i].op - after[i - 1].op);
  assert.ok(worst <= 0.01, `it only fades down from there (largest rise ${worst.toFixed(3)})`);
  assert.equal(after[after.length - 1].op, 0, 'and it ends at 0');
  assert.deepEqual(await artOnScreen(page), [], "none of title 1's art is on screen once the change ends");
  check(`backdrop, art leaves with its poster: ${before.toFixed(2)} then ${after.slice(0, 2).map((a) => a.op.toFixed(2))} ... 0 over ${after.length} frames`);
});

// 38. A slot reused by a second change inside one cross-fade holds no art of the title two posters back (D235 2). Art is held at the server after title 1's has been drawn,
//     so any art found on screen after the second change is title 1's.
gapCase('38 backdrop: a slot taken again by a quick second change shows nothing of the title before', { settings: limitPool({ gapFill: 'backdrop', randomPoolSize: 3, crossfadeMs: 4000 }) }, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  await refreshUntil(page, (alt) => alt === 'Poster: The Grand Marquee', 'title 1 (has art)');
  await waitArt(page);
  await settled(page);
  assert.equal((await artOnScreen(page)).length, 1, 'title 1 shows its art first');
  await mock.post('art-hold');
  await page.evaluate(() => { window.__q = { slot: document.querySelector('.poster-layer.active').id, step: 0 }; });
  await clickRefresh(page);
  // The second change is asked for in the very task that sees the first one, and read in the task that sees the slot taken again.
  const out = await (await page.waitForFunction((top) => {
    const q = window.__q;
    const act = document.querySelector('.poster-layer.active');
    if (q.step === 0) {
      if (act.id === q.slot) return false;
      q.step = 1;
      document.querySelector('[data-action="refresh"]').click();
      return false;
    }
    if (act.id !== q.slot) return false;
    const seen = [];
    for (const c of document.querySelectorAll('#gap-fill canvas')) {
      let v = 1;
      for (let e = c; e; e = e.parentElement) v *= Number(getComputedStyle(e).opacity);
      if (c.width <= 1 || v <= 0.01 || getComputedStyle(c).visibility === 'hidden') continue;
      const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), 2, 1, 1).data;
      if (Math.abs(d[0] - top[0]) <= 8 && Math.abs(d[1] - top[1]) <= 8 && Math.abs(d[2] - top[2]) <= 8) seen.push(c.id);
    }
    return { alt: act.alt, seen };
  }, ART_TOP, { timeout: 20000 })).jsonValue();
  assert.deepEqual(out.seen, [], `after the second change (${out.alt}) no gap canvas that shows anything holds title 1's art`);
  check(`backdrop, quick second change: slot reused for ${out.alt}, no art of title 1 on screen`);
});

// 29. After the next poster the earlier title's backdrop is gone (title 1 has art, title 2 has none).
gapCase('29 backdrop: after the next poster the earlier title\'s backdrop is gone', { settings: limitPool({ gapFill: 'backdrop', crossfadeMs: 300 }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await refreshUntil(page, (alt) => alt === 'Poster: The Grand Marquee', 'title 1 (has art)');
  await waitArt(page);
  await settled(page);
  assert.deepEqual((await artOnScreen(page)).length, 1, 'title 1 shows its art');
  await refreshUntil(page, (alt) => alt === 'Poster: Midnight Projector', 'title 2 (no art)');
  await settled(page);
  assert.deepEqual(await artOnScreen(page), [], 'no gap canvas that shows anything holds title 1\'s art');
  const held = await activeCanvas(page);
  assert.ok(held && !isArt(held), `title 2 shows its blur: ${JSON.stringify(held)}`);
  check('backdrop: title 1 art, then title 2 (none): only the blur is left on screen');
});

// 30. A backdrop that finishes loading after the poster changed is dropped, not drawn for the new poster (D232 1). Title 3 has art of its own, still held.
// Which requests are held is not assumed: the poster shown first may have asked for art too, and the engine may show a title more than once on the way. So the
// test waits until nothing is in flight, holds, and then releases exactly title 1's requests by path (mock `art-release?match=`), once the server has them all.
gapCase('30 backdrop: a late load for the poster before is dropped, even for a poster that has art of its own', { settings: limitPool({ gapFill: 'backdrop', randomPoolSize: 3 }) }, async ({ page, app, mock }) => {
  await hookArt(page);
  const asked = watchArt(page);
  await page.goto(app.url);
  await posterShown(page);
  await refreshUntil(page, (alt) => alt === 'Poster: Midnight Projector', 'title 2 (no art)');
  await settled(page);
  await artHandled(page, asked.length); // every request made so far has been answered and handled: none is in flight when the hold starts
  const before = asked.length;
  const blobsBefore = await page.evaluate(() => window.__artBlobs);
  const atServer = async () => (await mock.get('log')).requests.filter((r) => decodeURIComponent(r).includes('/metadata/1/art/')).length;
  const serverBefore = await atServer(); // title 1's art may have been asked for before the hold, on the way to title 2
  await mock.post('art-hold');
  await refreshUntil(page, (alt) => alt === 'Poster: The Grand Marquee', 'title 1 (art held)');
  await refreshUntil(page, (alt) => alt === 'Poster: Velvet Curtain', 'title 3 (art held too)');
  await settled(page);
  const titleOne = asked.slice(before).filter((a) => a.art.includes('/metadata/1/')).length;
  assert.ok(titleOne >= 1, 'title 1 asked for its art');
  while ((await atServer()) - serverBefore < titleOne) await new Promise((resolve) => setTimeout(resolve, 20)); // until the server holds them all
  await mock.post('art-release', { match: '/metadata/1/' });
  await artHandled(page, blobsBefore + titleOne);
  await settled(page);
  assert.deepEqual(await artOnScreen(page), [], "title 1's art is not drawn for title 3");
  const held = await activeCanvas(page);
  assert.ok(held && !isArt(held), `the blur of title 3 shows: ${JSON.stringify(held)}`);
  await mock.post('art-release');
  await waitArt(page);
  await settled(page);
  const own = await activeCanvas(page);
  assert.ok(near(own.bottom, ART_BOTTOM_TITLE_3, 10), `then title 3's own art: ${own.bottom}`);
  check(`backdrop: title 1's art arrived after title 3 was up and was dropped; title 3's own then showed (${own.bottom})`);
});

// 31. A poster the household limit blocks keeps no backdrop on screen, whether its art was already drawn or arrives later.
for (const late of [false, true]) {
  gapCase(`31 backdrop: a blocked poster keeps no backdrop (${late ? 'its art arrives after the block' : 'its art was drawn'})`, { settings: limitPool({ gapFill: 'backdrop', randomPoolSize: 1 }) }, async ({ page, app, mock }) => {
    await hookArt(page);
    await mock.post('rate', { ratingKey: '1', contentRating: 'R' });
    if (late) await mock.post('art-hold');
    await page.goto(app.url);
    await posterShown(page);
    await settled(page);
    if (!late) await waitArt(page);
    for (let i = 0; i < 100; i++) {
      if ((await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]'))).length) break;
      await page.waitForTimeout(100);
    }
    await mock.down();
    await setHouseholdLimit(page);
    await page.waitForFunction(() => document.body.classList.contains('poster-blocked'), null, { timeout: 5000 });
    if (late) {
      await mock.up();
      await mock.post('art-release');
      await artHandled(page, 1);
    }
    await settled(page);
    const state = await page.evaluate(() => ({ active: document.querySelectorAll('#gap-fill canvas.active').length, widths: [...document.querySelectorAll('#gap-fill canvas')].map((c) => c.width) }));
    if (!late) assert.equal(state.active, 0, `the art that was drawn is taken off with its poster: ${JSON.stringify(state)}`); // a blur is hidden by poster-blocked, as before
    assert.ok(state.widths.every((w) => w <= 64), `and no art is held (canvas widths ${state.widths})`);
    if (late) assert.ok(state.widths.some((w) => w > 1), `a blur that was never replaced by art is left as it was (canvas widths ${state.widths})`);
    assert.deepEqual(await artOnScreen(page), []);
    assert.equal(await gapOn(page), false);
    check(`backdrop, blocked (${late ? 'late art' : 'art drawn'}): no gap canvas current, widths ${state.widths}`);
  });
}

// 31b. The art of the poster before is never shown for one that has art of its own which has not loaded: the blur shows until its own arrives.
gapCase('31b backdrop: a poster whose art is still loading does not show the last poster\'s art', { settings: limitPool({ gapFill: 'backdrop', randomPoolSize: 3 }) }, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  await refreshUntil(page, (alt) => alt === 'Poster: The Grand Marquee', 'title 1 (has art)');
  await waitArt(page);
  await settled(page);
  const first = await activeCanvas(page);
  await mock.post('art-hold');
  await refreshUntil(page, (alt) => alt === 'Poster: Velvet Curtain', 'title 3 (has art, held)');
  await settled(page);
  assert.deepEqual(await artOnScreen(page), [], 'title 1\'s art is not on screen for title 3');
  await mock.post('art-release');
  await waitArt(page);
  await settled(page);
  const second = await activeCanvas(page);
  assert.ok(near(second.bottom, ART_BOTTOM_TITLE_3, 10) && !near(first.bottom, ART_BOTTOM_TITLE_3, 10), `title 3's own art arrived: ${first.bottom} then ${second.bottom}`);
  check(`backdrop: title 1 art (${first.bottom}), blur while title 3's art loaded, then title 3's own (${second.bottom})`);
});

// 31c. Art that has faded in does not fade in again when the layout runs again (a resize, a pixel-shift step).
gapCase('31c backdrop: a new layout does not restart the art\'s fade', { settings: backdropSettings() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await waitArt(page);
  await settled(page);
  await page.setViewportSize({ width: 1100, height: 1920 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const running = await page.evaluate(() => document.getAnimations().map((a) => `${a.effect?.target?.id || a.effect?.target?.className}:${a.animationName || a.transitionProperty}`));
  assert.deepEqual(running.filter((r) => r.endsWith(':gap-arrive')), [], `the art does not fade in again after a resize (running: ${running})`);
  assert.ok(isArt(await activeCanvas(page)), 'and the art is still there');
  check('backdrop: a resize leaves the art as it was, with no new fade');
});

// 32. The art is asked for only while a band shows (a poster that fills the window asks nothing), and then only once.
gapCase('32 backdrop: no band, no request; a band, one request', { settings: backdropSettings({ posterFit: 'cover' }) }, async ({ page, app }) => {
  const asked = watchArt(page);
  await prepare(page, app);
  assert.equal(await gapOn(page), false, 'cover leaves no band');
  assert.deepEqual(asked, [], 'and nothing is asked for');
  await reconfigure(page, { posterScale: 80 });
  assert.equal(await gapOn(page), true, 'a scale of 80 leaves bands');
  await waitArt(page);
  assert.equal(asked.length, 1, `one request once a band shows: ${JSON.stringify(asked)}`);
  check('backdrop: cover, no request; scale 80, one request');
});

// 33. A poster drawn from the offline cache shows the blur and asks no backdrop.
gapCase('33 backdrop: a poster from the offline cache shows the blur and asks no backdrop', { settings: limitPool({ gapFill: 'backdrop', randomPoolSize: 1 }) }, async ({ page, app, mock }) => {
  await page.goto(app.url);
  await posterShown(page);
  await waitArt(page);
  await settled(page);
  for (let i = 0; i < 100; i++) {
    if ((await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]'))).length) break;
    await page.waitForTimeout(100);
  }
  const stored = await page.evaluate(() => localStorage.getItem('plexPoster.posterIndex') || '');
  assert.ok(!/art|backdrop/.test(stored), 'the offline index holds no art');
  await mock.down();
  const asked = watchArt(page);
  await page.reload();
  await posterShown(page);
  await settled(page);
  assert.deepEqual(asked, [], 'a cached poster asks for no backdrop');
  assert.deepEqual(await artOnScreen(page), [], 'and shows none');
  const held = await activeCanvas(page);
  assert.ok(held && !isArt(held), `the blur of the cached poster shows: ${JSON.stringify(held)}`);
  check('backdrop, offline cache: blur only, no request');
});

// 34. The other styles are as before: none, blur and matte make no backdrop request, and the select offers Backdrop art.
for (const gapFill of ['none', 'blur', 'matte']) {
  gapCase(`34 ${gapFill} asks for no backdrop`, { settings: seed({ gapFill }) }, async ({ page, app }) => {
    const asked = watchArt(page);
    await prepare(page, app);
    assert.deepEqual(asked, []);
    assert.deepEqual(await artOnScreen(page), []);
    check(`${gapFill}: no backdrop request, no art on screen`);
  });
}

// ---------- run ----------

const WORKERS = Number(process.env.E2E_GAP_WORKERS || 8);
if (process.env.E2E_GAP_ONLY) {
  const only = new RegExp(process.env.E2E_GAP_ONLY);
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
