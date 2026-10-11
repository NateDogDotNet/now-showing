import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { effectiveBrightness } from '../js/brightness.js';
import { defaults } from '../js/settings.js';

const at = (h, m = 0, day = 5) => new Date(2026, 0, day, h, m);
// Night dim on, 22:00-07:00, level 60, manual 100 unless overridden.
const cfg = (o = {}) => ({ ...defaults(), nightDim: true, nightDimStart: '22:00', nightDimEnd: '07:00', nightDimLevel: 60, frameBrightness: 100, ...o });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('manual level alone: full is 1, 50 is 0.5, and the floor is 0.1', () => {
  near(effectiveBrightness(at(12), cfg({ nightDim: false })), 1);
  near(effectiveBrightness(at(12), cfg({ nightDim: false, frameBrightness: 50 })), 0.5);
  near(effectiveBrightness(at(12), cfg({ nightDim: false, frameBrightness: 10 })), 0.1);
  near(effectiveBrightness(at(12), cfg({ nightDim: false, frameBrightness: 1 })), 0.1);
  near(effectiveBrightness(at(12), cfg({ nightDim: false, frameBrightness: 500 })), 1);
});

test('outside the night window nothing dims, inside (after the ramp) it is the night level', () => {
  near(effectiveBrightness(at(12), cfg()), 1);
  near(effectiveBrightness(at(21, 59), cfg()), 1);
  near(effectiveBrightness(at(23), cfg()), 0.6);
  near(effectiveBrightness(at(3), cfg()), 0.6); // after midnight, same window
  near(effectiveBrightness(at(7, 0), cfg()), 1); // the end is exclusive
});

test('ramp in: whole-minute steps over the 10 minutes after nightDimStart', () => {
  near(effectiveBrightness(at(22, 0), cfg()), 1);
  const seen = [];
  for (let m = 0; m <= 10; m++) seen.push(effectiveBrightness(at(22, m), cfg()));
  near(seen[5], 1 - 0.5 * 0.4);
  near(seen[10], 0.6);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] < seen[i - 1], `strictly darker at minute ${i}`);
  near(effectiveBrightness(at(22, 11), cfg()), 0.6);
});

test('the value is constant within a minute (no seconds)', () => {
  const a = new Date(2026, 0, 5, 22, 4, 0, 0);
  const b = new Date(2026, 0, 5, 22, 4, 59, 999);
  assert.equal(effectiveBrightness(a, cfg()), effectiveBrightness(b, cfg()));
});

test('ramp out: whole-minute steps over the 10 minutes before nightDimEnd', () => {
  near(effectiveBrightness(at(6, 49), cfg()), 0.6);
  near(effectiveBrightness(at(6, 50), cfg()), 0.6);
  const seen = [];
  for (let m = 50; m <= 59; m++) seen.push(effectiveBrightness(at(6, m), cfg()));
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] > seen[i - 1], `strictly brighter at 06:${50 + i}`);
  near(effectiveBrightness(at(6, 55), cfg()), 1 - 0.5 * 0.4);
  assert.ok(effectiveBrightness(at(6, 59), cfg()) > 0.95);
  near(effectiveBrightness(at(7, 0), cfg()), 1);
});

test('a window crossing midnight ramps at both ends and a same-day window works too', () => {
  near(effectiveBrightness(at(23, 55), cfg({ nightDimStart: '23:50', nightDimEnd: '01:00' })), 1 - 0.5 * 0.4);
  near(effectiveBrightness(at(0, 30), cfg({ nightDimStart: '23:50', nightDimEnd: '01:00' })), 0.6);
  near(effectiveBrightness(at(13), cfg({ nightDimStart: '12:00', nightDimEnd: '14:00' })), 0.6);
  near(effectiveBrightness(at(15), cfg({ nightDimStart: '12:00', nightDimEnd: '14:00' })), 1);
});

test('a window shorter than 20 minutes peaks below the night level; 20 minutes just reaches it', () => {
  const peak = (len) => {
    const s = cfg({ nightDimStart: '22:00', nightDimEnd: `22:${String(len).padStart(2, '0')}` });
    let min = 1;
    for (let m = 0; m < len; m++) min = Math.min(min, effectiveBrightness(at(22, m), s));
    return min;
  };
  assert.ok(peak(10) > 0.6 + 1e-9, `10 min window peak ${peak(10)}`);
  assert.ok(peak(19) > 0.6 + 1e-9, `19 min window peak ${peak(19)}`);
  assert.ok(peak(10) < 1, 'still dims a little');
  near(peak(20), 0.6);
});

test('the effective value is the lower of the manual level and the night level', () => {
  near(effectiveBrightness(at(23), cfg({ frameBrightness: 80 })), 0.6);
  near(effectiveBrightness(at(23), cfg({ frameBrightness: 40 })), 0.4);
  near(effectiveBrightness(at(12), cfg({ frameBrightness: 40 })), 0.4);
  near(effectiveBrightness(at(22, 5), cfg({ frameBrightness: 90 })), 0.8);
});

test('nightDim:false never dims at night', () => {
  near(effectiveBrightness(at(23), cfg({ nightDim: false })), 1);
  near(effectiveBrightness(at(23), cfg({ nightDim: false, frameBrightness: 70 })), 0.7);
});

test('an implausible clock gives no night dim but keeps the manual level', () => {
  const early = new Date(1970, 0, 1, 23, 0);
  near(effectiveBrightness(early, cfg()), 1);
  near(effectiveBrightness(early, cfg({ frameBrightness: 70 })), 0.7);
  near(effectiveBrightness(new Date(NaN), cfg()), 1);
});

test('the night level is clamped to [0.1, 1]', () => {
  near(effectiveBrightness(at(23), cfg({ nightDimLevel: 0 })), 0.1);
  near(effectiveBrightness(at(23), cfg({ nightDimLevel: 100 })), 1);
});

test('an empty window (start == end) and bad times never dim', () => {
  near(effectiveBrightness(at(23), cfg({ nightDimStart: '22:00', nightDimEnd: '22:00' })), 1);
  near(effectiveBrightness(at(23), cfg({ nightDimStart: 'x' })), 1);
});

test('DST night under America/New_York follows wall-clock minutes', () => {
  const script = `
    import { effectiveBrightness } from ${JSON.stringify(new URL('../js/brightness.js', import.meta.url).href)};
    const s = { frameBrightness: 100, nightDim: true, nightDimStart: '22:00', nightDimEnd: '07:00', nightDimLevel: 60 };
    const out = {};
    // Spring forward 2026-03-08: 02:00 EST -> 03:00 EDT. Fall back 2026-11-01: 02:00 EDT -> 01:00 EST.
    out.offset = new Date(2026, 2, 8, 12).getTimezoneOffset();
    out.springBefore = effectiveBrightness(new Date(2026, 2, 8, 1, 59), s);
    out.springAfter = effectiveBrightness(new Date(2026, 2, 8, 3, 0), s);
    out.springRampOut = effectiveBrightness(new Date(2026, 2, 8, 6, 55), s);
    out.springEnd = effectiveBrightness(new Date(2026, 2, 8, 7, 0), s);
    const first = new Date('2026-11-01T05:30:00Z'); // 01:30 EDT
    const second = new Date('2026-11-01T06:30:00Z'); // 01:30 EST
    out.fallFirst = effectiveBrightness(first, s);
    out.fallSecond = effectiveBrightness(second, s);
    out.fallHours = [first.getHours(), second.getHours()];
    out.fallRamp = effectiveBrightness(new Date('2026-11-01T11:55:00Z'), s); // 06:55 EST
    console.log(JSON.stringify(out));
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  assert.equal(o.offset, 240);
  near(o.springBefore, 0.6);
  near(o.springAfter, 0.6);
  near(o.springRampOut, 1 - 0.5 * 0.4);
  near(o.springEnd, 1);
  near(o.fallFirst, 0.6);
  near(o.fallSecond, 0.6);
  assert.deepEqual(o.fallHours, [1, 1]);
  near(o.fallRamp, 1 - 0.5 * 0.4);
});
