import test from 'node:test';
import assert from 'node:assert/strict';
import { createSleepControl, playbackMatters } from '../js/sleep-control.js';
import { defaults } from '../js/settings.js';

test('playback matters only when it can wake a schedule sleep or restart the idle clock', () => {
  const s = (o) => ({ ...defaults(), sleepEnabled: false, wakeOnPlayback: false, idleSleepHours: 0, ...o });
  assert.equal(playbackMatters(s()), false);
  assert.equal(playbackMatters(s({ sleepEnabled: true })), false, 'a schedule with no wake-on-playback');
  assert.equal(playbackMatters(s({ sleepEnabled: true, wakeOnPlayback: true })), true);
  assert.equal(playbackMatters(s({ idleSleepHours: 2 })), true);
});

function setup(settings, { fail = true, asleep = false } = {}) {
  const logs = [];
  const state = {
    settings: { ...defaults(), sleepEnabled: true, wakeOnPlayback: true, ...settings },
    asleep,
    playing: true,
    pollError: null,
    pollFailures: 0,
    pollFailing: false,
    lastPlaybackAt: 1000,
    sleepClock: { wall: Date.now(), mono: performance.now() },
  };
  const client = { sessions: async () => (fail ? Promise.reject(new Error('refused')) : []) };
  const control = createSleepControl({
    state,
    log: { info: (m) => logs.push(m), warn: (m) => logs.push(m) },
    $: () => ({}),
    tick: () => {},
    syncFirstRun: () => {},
    tv: {},
    reload: { shiftBoot: () => {} },
    brightness: { evaluate: () => {} },
    getClient: () => client,
    getEngine: () => ({ playing: async () => false }),
  });
  return { control, state, logs };
}

test('a poll nobody needs is not made, and clears the playing flag', async () => {
  const { control, state } = setup({ sleepEnabled: false, wakeOnPlayback: false, idleSleepHours: 0 });
  state.pollFailures = 2;
  assert.equal(await control.pollPlayback(), undefined);
  assert.equal(state.playing, false);
  assert.equal(state.pollFailures, 0);
});

test('a failed poll keeps playing for two failures, drops it on the third, and logs once', async () => {
  const { control, state, logs } = setup({});
  for (const [n, playing] of [[1, true], [2, true], [3, false]]) {
    assert.equal(await control.pollPlayback(), undefined);
    assert.equal(state.pollFailures, n);
    assert.equal(state.playing, playing, `after failure ${n}`);
    assert.equal(state.pollError.message, 'refused');
  }
  assert.deepEqual(logs, ['Playback check failed: refused']);
  assert.equal(state.lastPlaybackAt, 1000, 'a failed poll never refreshes the playback time');
});

test('asleep, a failed poll is thrown for handleFailure to retry', async () => {
  const { control } = setup({}, { asleep: true });
  await assert.rejects(control.pollPlayback(), /refused/);
});

test('a clock step moves the stored timestamps by the gap', () => {
  const { control, state } = setup({});
  state.manualWakeUntil = 50_000;
  state.sleepClock = { wall: Date.now() - 20_000, mono: performance.now() }; // the wall clock jumped 20 s ahead
  control.syncSleepClock();
  assert.ok(state.lastPlaybackAt > 19_000 && state.lastPlaybackAt < 21_500 + 1000, `lastPlaybackAt ${state.lastPlaybackAt}`);
  assert.ok(state.manualWakeUntil > 69_000);
});
