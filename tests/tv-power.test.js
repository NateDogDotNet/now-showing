import test from 'node:test';
import assert from 'node:assert/strict';
import { createTvPower } from '../js/tv-power.js';

function setup({ settings = {}, state = {}, helperOver = {} } = {}) {
  const powered = [];
  const ticks = [];
  const helper = {
    available: true,
    probe: async () => ({ available: true, tempC: 40, temperature: 'zone0' }),
    status: async () => ({ available: true, tempC: 55, temperature: 'zone0' }),
    power: async (on) => (powered.push(on), { ok: true }),
    ...helperOver,
  };
  const st = { settings: { deviceHelper: true, ...settings }, asleep: false, busy: false, paused: false, tvWaking: false, tickAfterWake: null, forceAfter: false, ...state };
  const rendered = [];
  const tv = createTvPower({
    state: st,
    helper,
    tick: (arg) => ticks.push(arg ?? 'plain'),
    diagnosticsOpen: () => true,
    renderDiagnostics: () => rendered.push(1),
  });
  return { tv, st, powered, ticks, rendered };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

const frames = () => {
  const queue = [];
  globalThis.requestAnimationFrame = (fn) => queue.push(fn);
  return () => {
    while (queue.length) queue.shift()();
  };
};

test('afterTvWake runs the queued tick even while asleep, and clears the queue', () => {
  const { tv, st, ticks } = setup({ state: { asleep: true, tickAfterWake: { force: false, notify: true } } });
  tv.afterTvWake();
  assert.deepEqual(ticks, [{ force: false, notify: true }]);
  assert.equal(st.tickAfterWake, null);
});

test('afterTvWake with nothing queued ticks only when awake, idle and running', () => {
  for (const [over, runs] of [[{}, true], [{ asleep: true }, false], [{ busy: true }, false], [{ paused: true }, false]]) {
    const { tv, ticks } = setup({ state: over });
    tv.afterTvWake();
    assert.equal(ticks.length, runs ? 1 : 0, JSON.stringify(over));
  }
});

test('a forced tick queued while one is running asks for another after it', () => {
  const { tv, st, ticks } = setup({ state: { busy: true, tickAfterWake: { force: true, notify: false } } });
  tv.afterTvWake();
  assert.equal(st.forceAfter, true);
  assert.equal(ticks.length, 1);
});

test('power off waits two frames, and only for a display still asleep', async () => {
  const run = frames();
  const { tv, powered } = setup({ state: { asleep: true } });
  await tv.probeHelper(); // the helper is found, so the asleep display is switched off
  assert.equal(tv.isOff, false, 'not before the veil has painted');
  run();
  assert.equal(tv.isOff, true);
  await flush();
  assert.deepEqual(powered, [false]);
  // a wake between the frames cancels it
  const again = setup({ state: { asleep: true } });
  const run2 = frames();
  again.tv.powerOffAfterVeil();
  again.st.asleep = false;
  run2();
  assert.equal(again.tv.isOff, false);
  await flush();
  assert.deepEqual(again.powered, []);
});

test('releaseTv powers on once, and only if we switched the TV off', async () => {
  const run = frames();
  const { tv, powered } = setup({ state: { asleep: true } });
  tv.releaseTv();
  assert.deepEqual(powered, [], 'nothing was switched off');
  await tv.probeHelper();
  run();
  tv.releaseTv();
  tv.releaseTv();
  await flush();
  assert.deepEqual(powered, [false, true]);
  assert.equal(tv.isOff, false);
});

test('wakeTv holds tvWaking through the power-on request and the wake window', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { tv, st, powered } = setup();
  const woke = tv.wakeTv();
  assert.equal(st.tvWaking, true);
  await flush();
  assert.deepEqual(powered, [true]);
  assert.equal(st.tvWaking, true, 'still waking: the window has not ended');
  t.mock.timers.tick(4000);
  await woke;
  assert.equal(st.tvWaking, false);
});

test('probeHelper does nothing when the setting is off; refreshTemperature needs a helper', async () => {
  const off = setup({ settings: { deviceHelper: false } });
  await off.tv.probeHelper();
  assert.equal(off.tv.info.available, false);
  const on = setup();
  assert.equal(on.tv.helperActive(), true);
  await on.tv.refreshTemperature();
  assert.equal(on.tv.info.tempC, 55);
  assert.equal(on.rendered.length, 1, 'Diagnostics is open: it redraws');
  const gone = setup({ helperOver: { available: false } });
  await gone.tv.refreshTemperature();
  assert.equal(gone.tv.info.tempC, null);
});
