import test from 'node:test';
import assert from 'node:assert/strict';
import { posterBox, requestSize, shiftOffset, stageSize } from '../js/layout.js';
import { detectWindow } from '../js/frames.js';
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
