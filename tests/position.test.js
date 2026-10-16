import test from 'node:test';
import assert from 'node:assert/strict';
import { dragToOffset, keyToChange, nudge, screenToStage } from '../js/position.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ''} ${a} vs ${b}`);

test('100 px on a 1000 px stage is 10 percent at rotation 0', () => {
  const r = dragToOffset({ dx: 100, dy: 0, stageW: 1000, stageH: 500, rotation: 0 });
  near(r.x, 10);
  near(r.y, 0);
  const v = dragToOffset({ dx: 0, dy: 100, stageW: 1000, stageH: 500, rotation: 0 });
  near(v.x, 0);
  near(v.y, 20, 'y is a percent of the stage height');
});

test('the same screen drag maps to the rotated stage axes at 90, 180 and 270', () => {
  // The stage is rotate(t) clockwise: at 90 its x axis points down the screen and its y axis points left.
  const at = (rotation, dx, dy) => dragToOffset({ dx, dy, stageW: 1000, stageH: 500, rotation });
  // 90: dragging right moves the poster up the stage's y axis (negative), dragging down moves it along +x.
  near(at(90, 100, 0).x, 0); near(at(90, 100, 0).y, -20);
  near(at(90, 0, 100).x, 10); near(at(90, 0, 100).y, 0);
  // 180: both axes flip.
  near(at(180, 100, 0).x, -10); near(at(180, 100, 0).y, 0);
  near(at(180, 0, 100).x, 0); near(at(180, 0, 100).y, -20);
  // 270: dragging right moves along +y, dragging down along -x.
  near(at(270, 100, 0).x, 0); near(at(270, 100, 0).y, 20);
  near(at(270, 0, 100).x, -10); near(at(270, 0, 100).y, 0);
});

test('screenToStage is exact, with no negative zero', () => {
  assert.deepEqual(screenToStage({ dx: 1, dy: 0, rotation: 90 }), { x: 0, y: -1 });
  assert.ok(Object.is(screenToStage({ dx: 1, dy: 0, rotation: 90 }).x, 0));
  assert.deepEqual(screenToStage({ dx: 3, dy: 4, rotation: 0 }), { x: 3, y: 4 });
  assert.deepEqual(screenToStage({ dx: 3, dy: 4, rotation: 360 }), { x: 3, y: 4 });
});

test('a stage with no size gives no movement', () => {
  assert.deepEqual(dragToOffset({ dx: 50, dy: 50, stageW: 0, stageH: 0, rotation: 0 }), { x: 0, y: 0 });
});

test('nudge adds the step and clamps to [-100, 100]', () => {
  near(nudge(0, 0.1), 0.1);
  near(nudge(5, -0.1), 4.9);
  assert.equal(nudge(99.95, 0.1), 100);
  assert.equal(nudge(100, 0.1), 100);
  assert.equal(nudge(-99.95, -0.1), -100);
  assert.equal(nudge(-100, -1), -100);
});

test('Shift multiplies the step by 10', () => {
  near(nudge(0, 0.1, { shift: true }), 1);
  near(nudge(0, -0.1, { shift: true }), -1);
  assert.equal(nudge(95, 0.1, { shift: true, min: -100, max: 100 }), 96);
  assert.equal(nudge(99.5, 0.1, { shift: true }), 100, 'Shift still clamps');
});

test('a size nudge clamps at 50 and 150', () => {
  const range = { min: 50, max: 150 };
  assert.equal(nudge(149.5, 1, range), 150);
  assert.equal(nudge(150, 1, range), 150);
  assert.equal(nudge(50.5, -1, range), 50);
  assert.equal(nudge(50, -1, { ...range, shift: true }), 50);
  assert.equal(nudge(100, 1, { ...range, shift: true }), 110, 'nudge itself still takes shift (the arrows use it)');
});

test('arrow keys nudge 0.1, Shift 1.0, in the on-screen direction', () => {
  const cur = { offsetX: 0, offsetY: 0, scale: 100 };
  assert.deepEqual(keyToChange('ArrowRight', false, cur, 0), { offsetX: 0.1, offsetY: 0 });
  assert.deepEqual(keyToChange('ArrowRight', true, cur, 0), { offsetX: 1, offsetY: 0 });
  assert.deepEqual(keyToChange('ArrowUp', false, cur, 0), { offsetX: 0, offsetY: -0.1 });
  assert.deepEqual(keyToChange('ArrowLeft', false, cur, 0), { offsetX: -0.1, offsetY: 0 });
  assert.deepEqual(keyToChange('ArrowDown', true, cur, 0), { offsetX: 0, offsetY: 1 });
  // At 90 the stage's x axis points down the screen, so ArrowDown is +x and ArrowRight is -y.
  assert.deepEqual(keyToChange('ArrowDown', false, cur, 90), { offsetX: 0.1, offsetY: 0 });
  assert.deepEqual(keyToChange('ArrowRight', false, cur, 90), { offsetX: 0, offsetY: -0.1 });
  assert.deepEqual(keyToChange('ArrowRight', false, cur, 180), { offsetX: -0.1, offsetY: 0 });
  assert.deepEqual(keyToChange('ArrowRight', false, cur, 270), { offsetX: 0, offsetY: 0.1 });
});

test('arrow keys clamp at the stored range', () => {
  assert.deepEqual(keyToChange('ArrowRight', true, { offsetX: 99.5, offsetY: 0, scale: 100 }, 0), { offsetX: 100, offsetY: 0 });
});

test('+ and = grow, - and _ shrink, always by 1 (Shift does not multiply a size key), inside 50..150', () => {
  const cur = { offsetX: 0, offsetY: 0, scale: 100 };
  assert.deepEqual(keyToChange('+', false, cur), { scale: 101 });
  assert.deepEqual(keyToChange('=', false, cur), { scale: 101 });
  assert.deepEqual(keyToChange('-', false, cur), { scale: 99 });
  assert.deepEqual(keyToChange('-', true, cur), { scale: 99 }, 'Shift does not multiply a size key');
  assert.deepEqual(keyToChange('+', true, cur), { scale: 101 }, 'the + a US keyboard types with Shift steps 1');
  assert.deepEqual(keyToChange('_', true, cur), { scale: 99 });
  assert.deepEqual(keyToChange('ArrowRight', true, cur), { offsetX: 1, offsetY: 0 }, 'Shift still multiplies an arrow');
  assert.deepEqual(keyToChange('+', true, { ...cur, scale: 149.5 }), { scale: 150 });
  assert.deepEqual(keyToChange('-', false, { ...cur, scale: 50.5 }), { scale: 50 });
});

test('other keys do nothing', () => {
  for (const k of ['o', 's', 'r', 'p', ' ', 'Enter', 'a']) assert.equal(keyToChange(k, false, { offsetX: 0, offsetY: 0, scale: 100 }), null);
});

test('shiftOrbit covers every point the glide visits', async () => {
  const { shiftOrbit } = await import('../js/position.js');
  assert.deepEqual(shiftOrbit(16), { minX: -16, maxX: 16, minY: -16, maxY: 16 });
  assert.deepEqual(shiftOrbit(0), { minX: 0, maxX: 0, minY: 0, maxY: 0 });
});

test('the orbit follows the length of SHIFT_PATH in js/layout.js, not a literal', async () => {
  const { shiftOrbit } = await import('../js/position.js');
  const { shiftOffset, shiftSteps } = await import('../js/layout.js');
  // Independent expectation: walk two laps of the path (the offsets wrap), so a loop bound hard-coded in position.js that
  // is shorter than the path misses a point this still sees.
  const seen = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  for (let step = 0; step < 2 * shiftSteps(); step++) {
    const { x, y } = shiftOffset(step, 7);
    seen.minX = Math.min(seen.minX, x); seen.maxX = Math.max(seen.maxX, x);
    seen.minY = Math.min(seen.minY, y); seen.maxY = Math.max(seen.maxY, y);
  }
  assert.deepEqual(shiftOrbit(7), { minX: seen.minX + 0, maxX: seen.maxX + 0, minY: seen.minY + 0, maxY: seen.maxY + 0 });
});
