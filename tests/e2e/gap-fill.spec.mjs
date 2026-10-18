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
    await page.waitForTimeout(500);
    const mid = await page.evaluate(() => {
      const o = (id) => Number(getComputedStyle(document.getElementById(id)).opacity);
      return { poster: [o('poster-a'), o('poster-b')], gap: [o('gap-a'), o('gap-b')] };
    });
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
  assert.deepEqual(options, ['none', 'blur', 'matte']);
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
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#gap-fill .gap-tint')).opacity) <= 0.25 * 0.6, null, { timeout: 8000 });
  // Freeze the fades where they are, so the two readings below see one picture.
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  // The band pixel as it is, and the same pixel with the gap layer taken away: the difference is what the layer still gives.
  const [bandMid] = await pixels(page, [band15]);
  await page.evaluate(() => { document.getElementById('gap-fill').style.visibility = 'hidden'; });
  const [bandBare] = await pixels(page, [band15]);
  await page.evaluate(() => { document.getElementById('gap-fill').style.visibility = ''; });
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
  const out = { layer: await layerOpacity(), posters: await page.evaluate(() => ['poster-a', 'poster-b'].map((id) => Number(getComputedStyle(document.getElementById(id)).opacity))) };
  assert.ok(out.layer > 0.02 && out.layer < 0.98, `mid-fade the gap layer is between 0 and 1 (${out.layer}), not switched at once`);
  assert.ok(out.posters.some((v) => v > 0.02 && v < 0.98), `while the posters are mid-fade ${out.posters}`);
  // A snap to black puts an opaque box over the layer, so the two readings are then exactly equal; any difference is the layer showing.
  assert.ok(sum(bandMid) > sum(bandBare), `mid-fade the gap layer still lights the band pixel, it has not snapped to black: ${bandMid} with the layer, ${bandBare} without (start ${bandStart})`);
  await settled(page);
  assert.equal(await layerOpacity(), 0, 'it ends gone: title 2 has no band');
  assert.ok(sum((await pixels(page, [band15]))[0]) <= 6, 'and the band ends black');
  assert.equal(await gapOn(page), false);
  // 2 -> 1: it fades in.
  await refreshUntil(page, (alt) => alt === 'Poster: The Grand Marquee', 'title 1 again');
  await page.waitForTimeout(1500);
  const into = await layerOpacity();
  assert.ok(into > 0.02 && into < 0.98, `fading in with title 1 (${into})`);
  await settled(page);
  assert.equal(await layerOpacity(), 1);
  check(`gap layer opacity ${out.layer.toFixed(2)} while fading out and ${into.toFixed(2)} while fading in (posters ${out.posters.map((v) => v.toFixed(2))})`);
});

// 16. The blurred copy continues the poster: placed on the poster's centre, in its aspect, scaled just to cover the window, so the
//     band beside the poster's edge takes that edge's colour (not the poster's middle stretched over the window).
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

// ---------- run ----------

const WORKERS = Number(process.env.E2E_GAP_WORKERS || 3);
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
