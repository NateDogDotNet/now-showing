import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_GAP_PX, blurRect, closeGap, gapBands, imageRect, posterBox, requestSize, shiftOffset, shiftRoom, shiftSteps, stageSize } from '../js/layout.js';
import { detectWindow, findFrame } from '../js/frames.js';
import { createBackoff } from '../js/backoff.js';

test('stageSize fits the viewport, swapping axes when rotated sideways', () => {
  assert.deepEqual(stageSize({ viewportW: 1080, viewportH: 1920, aspect: 0.64 }), { width: 1080, height: 1687 });
  assert.deepEqual(stageSize({ viewportW: 1920, viewportH: 1080, aspect: 0.64 }), { width: 691, height: 1080 });
  // Landscape screen mounted sideways: stage fills the long side.
  assert.deepEqual(stageSize({ viewportW: 1920, viewportH: 1080, aspect: 0.64, rotation: 90 }), { width: 1080, height: 1687 });
});

test('posterBox centres the poster in the frame window, then scales and offsets', () => {
  const win = { x: 10, y: 20, w: 80, h: 70 };
  assert.deepEqual(posterBox({ stageW: 1000, stageH: 1000, win }), { left: 100, top: 200, width: 800, height: 700 });
  assert.deepEqual(posterBox({ stageW: 1000, stageH: 1000, win, scale: 50, offsetX: 5, offsetY: -10 }), {
    left: 350,
    top: 275,
    width: 400,
    height: 350,
  });
});

test('requestSize rounds up to 100px steps and caps DPR', () => {
  assert.deepEqual(requestSize({ width: 610, height: 905 }), { width: 700, height: 1000 });
  assert.deepEqual(requestSize({ width: 100, height: 100 }, 10), { width: 300, height: 300 });
});

test('detectWindow finds the transparent opening in a frame', () => {
  const width = 100, height = 200;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 40; y < 180; y++) for (let x = 10; x < 90; x++) data[(y * width + x) * 4 + 3] = 0;
  assert.deepEqual(detectWindow({ width, height, data }), { x: 10, y: 20, w: 80, h: 70 });
  assert.equal(detectWindow({ width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) }), null);
});

test('backoff grows exponentially to a cap and resets', () => {
  const b = createBackoff({ baseMs: 1000, maxMs: 5000, jitter: 0, random: () => 0.5 });
  assert.deepEqual([b.next(), b.next(), b.next(), b.next()], [1000, 2000, 4000, 5000]);
  b.reset();
  assert.equal(b.next(), 1000);
});

test('stageSize with a margin is 97% of the margin-less size on the limiting axis', () => {
  const a = stageSize({ viewportW: 1920, viewportH: 1080, aspect: 0.64 });
  const b = stageSize({ viewportW: 1920, viewportH: 1080, aspect: 0.64, margin: 0.015 });
  assert.ok(Math.abs(b.height - a.height * 0.97) <= 1);
  assert.ok(Math.abs(b.width - a.width * 0.97) <= 1);
  const c = stageSize({ viewportW: 1920, viewportH: 1080, aspect: 0.64, rotation: 90, margin: 0.015 });
  assert.ok(Math.abs(c.width - Math.floor(1080 * 0.97)) <= 1);
  assert.deepEqual(stageSize({ viewportW: 1920, viewportH: 1080, aspect: 0.64, margin: 0 }), a);
});

test('shiftOffset is bounded, never repeats back to back, covers 9 points in 9 steps and is deterministic', () => {
  const m = 16;
  const pts = Array.from({ length: 60 }, (_, i) => shiftOffset(i, m));
  for (const p of pts) assert.ok(Math.abs(p.x) <= m && Math.abs(p.y) <= m, JSON.stringify(p));
  for (let i = 1; i < pts.length; i++) assert.notDeepEqual(pts[i], pts[i - 1], `step ${i}`);
  const key = (p) => `${p.x},${p.y}`;
  assert.equal(new Set(pts.slice(0, 9).map(key)).size, 9);
  assert.deepEqual(pts.map(key), Array.from({ length: 60 }, (_, i) => key(shiftOffset(i, m))));
  assert.notEqual(key(pts[8]), key(pts[9])); // the wrap-around step also moves
});

test('shiftRoom is what display.js leaves around the stage with the 1.5 % margin, on the tighter axis', () => {
  // Stage sizes come from stageSize() with aspect 1.5 and margin 0.015, the way display.js lays out.
  assert.equal(shiftRoom({ viewportW: 1920, viewportH: 1080, stageW: 1571, stageH: 1047 }), 16);
  assert.equal(shiftRoom({ viewportW: 1080, viewportH: 1920, stageW: 1047, stageH: 698 }), 16);
  assert.equal(shiftRoom({ viewportW: 1280, viewportH: 720, stageW: 1047, stageH: 698 }), 11);
  assert.equal(shiftRoom({ viewportW: 1920, viewportH: 1080, stageW: 1047, stageH: 698, rotation: 90 }), 16);
  assert.equal(shiftRoom({ viewportW: 1920, viewportH: 1080, stageW: 3000, stageH: 3000 }), 0);
});

test('shiftRoom swaps the stage axes when sideways', () => {
  assert.equal(shiftRoom({ viewportW: 1920, viewportH: 1080, stageW: 1048, stageH: 1888, rotation: 270 }), 16);
});

test('shiftSteps is the length of the glide path', () => {
  assert.equal(shiftSteps(), 9);
  const seen = new Set();
  for (let i = 0; i < shiftSteps(); i++) seen.add(JSON.stringify(shiftOffset(i, 5)));
  assert.equal(seen.size, shiftSteps());
});

// ---- gap fill inside the frame window (D67) ----

const WIN = { left: 100, top: 100, width: 800, height: 1000 }; // the window, in stage pixels
const same = (a, b) => Math.abs(a - b) < 1e-9;
const rectEq = (r, e, msg) => { for (const k of ['left', 'top', 'width', 'height']) assert.ok(same(r[k], e[k]), `${msg}: ${k} ${r[k]} vs ${e[k]}`); };
const area = (bands) => bands.reduce((sum, b) => sum + b.width * b.height, 0);

test('imageRect: contain keeps the aspect inside the box; cover, fill and an unknown aspect take the whole box', () => {
  const box = { left: 100, top: 100, width: 800, height: 1000 };
  rectEq(imageRect({ box, aspect: 2 / 3, fit: 'contain' }), { left: 100 + (800 - 1000 * 2 / 3) / 2, top: 100, width: 1000 * 2 / 3, height: 1000 }, 'pillarbox');
  rectEq(imageRect({ box, aspect: 16 / 9, fit: 'contain' }), { left: 100, top: 100 + (1000 - 450) / 2, width: 800, height: 450 }, 'letterbox');
  for (const fit of ['cover', 'fill']) rectEq(imageRect({ box, aspect: 16 / 9, fit }), box, fit);
  rectEq(imageRect({ box, fit: 'contain' }), box, 'no aspect');
});

test('gapBands: a poster that covers the window leaves no band (cover, fill, exact fit, a larger box)', () => {
  assert.deepEqual(gapBands({ win: WIN, box: WIN, aspect: 2 / 3, fit: 'cover' }), []);
  assert.deepEqual(gapBands({ win: WIN, box: WIN, aspect: 16 / 9, fit: 'fill' }), []);
  assert.deepEqual(gapBands({ win: WIN, box: { left: 50, top: 50, width: 900, height: 1100 }, aspect: 2 / 3, fit: 'cover' }), []);
  assert.deepEqual(gapBands({ win: WIN, box: WIN }), [], 'the plain { win, box } call');
});

test('gapBands at contain: a 16:9 image in a 4:5 window leaves a letterbox pair, clipped to the window', () => {
  const bands = gapBands({ win: WIN, box: WIN, aspect: 16 / 9, fit: 'contain' });
  assert.equal(bands.length, 2);
  rectEq(bands[0], { left: 100, top: 100, width: 800, height: 275 }, 'top');
  rectEq(bands[1], { left: 100, top: 825, width: 800, height: 275 }, 'bottom');
});

test('gapBands at contain: a 2:3 poster in a near-square window leaves a pillarbox pair', () => {
  const win = { left: 0, top: 0, width: 924, height: 1218 }; // marquee-glow at 1080 x 1920
  const bands = gapBands({ win, box: win, aspect: 2 / 3, fit: 'contain' });
  assert.equal(bands.length, 2);
  const gap = (924 - 1218 * 2 / 3) / 2;
  assert.ok(gap > 50 && gap < 60, `about 56 px a side (${gap})`);
  rectEq(bands[0], { left: 0, top: 0, width: gap, height: 1218 }, 'left');
  rectEq(bands[1], { left: 924 - gap, top: 0, width: gap, height: 1218 }, 'right');
});

test('gapBands: a poster scaled below 100 percent leaves bands on all four sides that, with the image, tile the window', () => {
  const box = posterBox({ stageW: 1000, stageH: 1000, win: { x: 10, y: 20, w: 80, h: 70 }, scale: 80 });
  const win = posterBox({ stageW: 1000, stageH: 1000, win: { x: 10, y: 20, w: 80, h: 70 } });
  const bands = gapBands({ win, box, aspect: 2 / 3, fit: 'cover' });
  assert.equal(bands.length, 4);
  assert.ok(Math.abs(area(bands) + box.width * box.height - win.width * win.height) < 1e-6, 'bands plus poster equal the window, no overlap');
  for (const b of bands) assert.ok(b.left >= win.left && b.top >= win.top && b.left + b.width <= win.left + win.width + 1e-9 && b.top + b.height <= win.top + win.height + 1e-9, 'inside the window');
});

test('gapBands: an offset leaves a band on the far side only, and the part of the box outside the window is clipped away', () => {
  const box = { left: WIN.left + 60, top: WIN.top, width: 800, height: 1000 }; // pushed 60 px right
  const bands = gapBands({ win: WIN, box, aspect: 2 / 3, fit: 'cover' });
  assert.equal(bands.length, 1);
  rectEq(bands[0], { left: 100, top: 100, width: 60, height: 1000 }, 'left band');
});

test('gapBands: a poster nowhere near the window leaves the whole window; an empty window leaves nothing', () => {
  const far = { left: 5000, top: 5000, width: 10, height: 10 };
  assert.deepEqual(gapBands({ win: WIN, box: far, aspect: 2 / 3, fit: 'cover' }), [WIN]);
  assert.deepEqual(gapBands({ win: { left: 0, top: 0, width: 0, height: 10 }, box: far }), []);
});

test('gapBands: a gap under 4 px on both axes is no band; one wide axis still reports its pair only', () => {
  assert.equal(MIN_GAP_PX, 4);
  const three = { left: WIN.left + 3, top: WIN.top + 3, width: WIN.width - 6, height: WIN.height - 6 };
  assert.deepEqual(gapBands({ win: WIN, box: three, aspect: 2 / 3, fit: 'cover' }), [], '3 px all round');
  const four = { left: WIN.left + 4, top: WIN.top + 4, width: WIN.width - 8, height: WIN.height - 8 };
  assert.equal(gapBands({ win: WIN, box: four, aspect: 2 / 3, fit: 'cover' }).length, 4, '4 px is filled');
  const mixed = { left: WIN.left + 30, top: WIN.top + 2, width: WIN.width - 60, height: WIN.height - 4 };
  const bands = gapBands({ win: WIN, box: mixed, aspect: 2 / 3, fit: 'cover' });
  assert.equal(bands.length, 2);
  assert.ok(bands.every((b) => b.width === 30 && b.height === 1000), 'only the left and right bands');
});

test('closeGap: a 3 px gap is closed by growing the box to the window edge; a 4 px gap is left alone', () => {
  const three = { left: WIN.left + 3, top: WIN.top, width: WIN.width - 3, height: WIN.height };
  const r = closeGap({ win: WIN, box: three, aspect: 2 / 3, fit: 'cover' });
  assert.equal(r.closed, true);
  rectEq(r.box, WIN, 'grown');
  assert.deepEqual(gapBands({ win: WIN, box: r.box, aspect: 2 / 3, fit: r.fit }), []);
  const four = { left: WIN.left + 4, top: WIN.top, width: WIN.width - 4, height: WIN.height };
  const k = closeGap({ win: WIN, box: four, aspect: 2 / 3, fit: 'cover' });
  assert.equal(k.closed, false);
  assert.deepEqual(k.box, four);
  const exact = closeGap({ win: WIN, box: WIN, aspect: 2 / 3, fit: 'cover' });
  assert.equal(exact.closed, false);
});

test('closeGap: grows on every side, and never shrinks a box that overshoots', () => {
  const inner = { left: WIN.left + 2, top: WIN.top + 1, width: WIN.width - 5, height: WIN.height - 3 };
  rectEq(closeGap({ win: WIN, box: inner, fit: 'cover' }).box, WIN, 'all four sides');
  const over = { left: WIN.left - 20, top: WIN.top - 20, width: WIN.width + 40, height: WIN.height + 40 };
  const r = closeGap({ win: WIN, box: over, fit: 'cover' });
  assert.equal(r.closed, false);
  assert.deepEqual(r.box, over);
});

test('closeGap: a contained image whose own bands are all under 4 px is cropped (cover); a wide band stays contained', () => {
  const nearly = { left: 0, top: 0, width: 1000, height: 1500 };
  const slim = closeGap({ win: nearly, box: nearly, aspect: 1000 / 1498, fit: 'contain' });
  assert.equal(slim.fit, 'cover');
  assert.equal(slim.closed, true);
  const wide = closeGap({ win: nearly, box: nearly, aspect: 16 / 9, fit: 'contain' });
  assert.equal(wide.fit, 'contain');
  assert.equal(wide.closed, false);
  const exact = closeGap({ win: nearly, box: nearly, aspect: 1000 / 1500, fit: 'contain' });
  assert.equal(exact.closed, false);
});

// ---- r2: a thin strip inside the window when the box overhangs it (I1), and the blur placed like the poster ----

/** The stage and window the reviewer's probes use: 1080x1920 viewport, a 2:3 stage. */
function frameGeometry(frameId, { viewportW = 1080, viewportH = 1920, aspect = 2 / 3 } = {}) {
  const st = stageSize({ viewportW, viewportH, aspect });
  const frame = findFrame(frameId);
  const win = posterBox({ stageW: st.width, stageH: st.height, win: frame.window });
  return { st, frame, win, boxAt: (scale, offsetX = 0, offsetY = 0) => posterBox({ stageW: st.width, stageH: st.height, win: frame.window, scale, offsetX, offsetY }) };
}

/** What really lies unpainted inside the window once closeGap has run: the image's gap on each side, and the bands gapBands reports. */
function unpainted({ win, box, aspect, fit }) {
  const r = closeGap({ win, box, aspect, fit });
  const img = imageRect({ box: r.box, aspect, fit: r.fit });
  const gaps = [img.left - win.left, win.left + win.width - (img.left + img.width), img.top - win.top, win.top + win.height - (img.top + img.height)].map((g) => Math.max(0, g));
  return { gaps, bands: gapBands({ win, box: r.box, aspect, fit: r.fit }), fit: r.fit, closed: r.closed };
}

/** The most any edge of the drawn image moves between the poster as placed and after closeGap, in px. */
function edgeMove({ box, aspect, closedBox, closedFit }) {
  const a = imageRect({ box, aspect, fit: 'contain' });
  const b = imageRect({ box: closedBox, aspect, fit: closedFit });
  return Math.max(Math.abs(b.left - a.left), Math.abs(b.top - a.top), Math.abs(b.left + b.width - a.left - a.width), Math.abs(b.top + b.height - a.top - a.height));
}

test('closeGap measures a contained image against the window: at scale 108 the box overhangs and a 2 px strip is closed, a few px, no crop', () => {
  const { win, boxAt } = frameGeometry('marquee-glow');
  const box = boxAt(108);
  assert.ok(box.width > win.width, 'the box overhangs the window');
  const before = imageRect({ box, aspect: 2 / 3, fit: 'contain' });
  const strip = before.left - win.left;
  assert.ok(strip > 1.5 && strip < 3, `the image stops about 2 px short of the window (${strip.toFixed(2)})`);
  const r = closeGap({ win, box, aspect: 2 / 3, fit: 'contain' });
  assert.equal(r.closed, true);
  assert.equal(r.fit, 'contain', 'it stays contained: the poster is not cropped');
  assert.deepEqual(gapBands({ win, box: r.box, aspect: 2 / 3, fit: r.fit }), []);
  const after = imageRect({ box: r.box, aspect: 2 / 3, fit: r.fit });
  assert.ok(after.left <= win.left + 1e-6 && after.left + after.width >= win.left + win.width - 1e-6, 'and now reaches the window');
  const move = edgeMove({ box, aspect: 2 / 3, closedBox: r.box, closedFit: r.fit });
  assert.ok(move > 0 && move <= 8, `no edge moves more than 8 px (${move.toFixed(2)})`);
});

test('closeGap leaves a contained image alone when the strip inside the window is 4 px or more, or when it already covers', () => {
  const { win, boxAt } = frameGeometry('marquee-glow');
  assert.equal(closeGap({ win, box: boxAt(100), aspect: 2 / 3, fit: 'contain' }).fit, 'contain', 'the 56 px pillarbox');
  assert.equal(closeGap({ win, box: boxAt(104), aspect: 2 / 3, fit: 'contain' }).fit, 'contain', 'still more than 4 px');
  assert.equal(closeGap({ win, box: boxAt(200), aspect: 2 / 3, fit: 'contain' }).closed, false, 'the image overflows the window');
});

test('no strip under 4 px survives at contain and no image edge moves more than 10 px: scales 100-130, every frame, offsets', () => {
  let acted = 0;
  for (const frameId of ['marquee', 'marquee-narrow', 'marquee-glow']) {
    const { win, boxAt } = frameGeometry(frameId);
    for (const aspect of [2 / 3, 0.675]) {
      for (let scale = 100; scale <= 130; scale += 0.25) {
        for (const offsetX of [-0.4, -0.1, 0, 0.1, 0.4]) {
          for (const offsetY of [-0.4, -0.1, 0, 0.1, 0.4]) {
            const box = boxAt(scale, offsetX, offsetY);
            const r = unpainted({ win, box, aspect, fit: 'contain' });
            const label = `${frameId} aspect ${aspect.toFixed(3)} scale ${scale} offset ${offsetX},${offsetY}`;
            if (r.bands.length === 0) for (const g of r.gaps) assert.ok(g < 0.001, `${label}: no band, yet a ${g.toFixed(2)} px strip is left`);
            if (r.closed) {
              acted++;
              const closed = closeGap({ win, box, aspect, fit: 'contain' });
              const move = edgeMove({ box, aspect, closedBox: closed.box, closedFit: closed.fit });
              // 10 px is the measured worst (9.71 px) plus a margin: a regression guard, not a plan number.
              assert.ok(move <= 10, `${label}: an image edge moved ${move.toFixed(2)} px`);
            }
          }
        }
      }
    }
  }
  assert.ok(acted > 100, `the sweep reached the closing path (${acted} times)`);
});

test('blurRect: centred on the poster, its aspect, just big enough to cover the window, never smaller than the poster', () => {
  const win = { left: 100, top: 200, width: 800, height: 1000 };
  const centre = { x: 500, y: 700 };
  const r = blurRect({ win, centre, aspect: 2 / 3 });
  assert.ok(same(r.left + r.width / 2 + win.left, centre.x) && same(r.top + r.height / 2 + win.top, centre.y), 'same centre');
  assert.ok(same(r.width / r.height, 2 / 3), 'same aspect');
  assert.ok(r.left <= 0 + 1e-9 && r.top <= 0 + 1e-9 && r.left + r.width >= win.width - 1e-9 && r.top + r.height >= win.height - 1e-9, `covers the window ${JSON.stringify(r)}`);
  assert.ok(same(r.width, Math.max(800, 1000 * 2 / 3)), 'and no bigger than it must be');
  const big = blurRect({ win, centre, aspect: 2 / 3, minWidth: 2000 });
  assert.equal(big.width, 2000, 'the poster itself is the floor');
  const off = blurRect({ win, centre: { x: 300, y: 700 }, aspect: 2 / 3 });
  assert.ok(off.left + win.left + off.width / 2 === 300, 'an off-centre poster keeps the centre');
  assert.ok(off.left + off.width >= win.width, 'and the far side is still covered');
  assert.ok(blurRect({ win, centre, aspect: 0 }).width > 0, 'an unknown aspect falls back to 2:3');
});
