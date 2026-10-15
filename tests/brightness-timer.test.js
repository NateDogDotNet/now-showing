import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIGHTNESS_JUMP_MS, createBrightnessTimer } from '../js/brightness-timer.js';
import { defaults } from '../js/settings.js';

test('evaluate sets the level for now and re-arms for the next minute, once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const settings = { ...defaults(), nightDim: false, frameBrightness: 70, nightDimTarget: 'frame' };
  const timer = createBrightnessTimer({ display: { setBrightness: (...a) => calls.push(a) }, getSettings: () => settings });
  timer.evaluate();
  assert.deepEqual(calls, [[0.7, 'frame']]);
  timer.evaluate(); // the earlier timer is replaced, not stacked
  t.mock.timers.tick(60_000);
  assert.equal(calls.length, 3, 'two direct calls and one from the single pending timer');
  timer.evaluate();
  t.mock.timers.reset();
});

test('the settings are read live on every evaluation', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  let settings = { ...defaults(), nightDim: false, frameBrightness: 100 };
  const timer = createBrightnessTimer({ display: { setBrightness: (...a) => calls.push(a[0]) }, getSettings: () => settings });
  timer.evaluate();
  settings = { ...settings, frameBrightness: 40 };
  timer.evaluate();
  assert.deepEqual(calls, [1, 0.4]);
  t.mock.timers.reset();
  assert.equal(BRIGHTNESS_JUMP_MS, 120_000);
});
