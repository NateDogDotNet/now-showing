import test from 'node:test';
import assert from 'node:assert/strict';
import { createReload, takeCarriedPlayback } from '../js/reload.js';
import { defaults } from '../js/settings.js';

function fakeStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    persistent: true,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function withGlobals(t, session) {
  const saved = Object.fromEntries(['sessionStorage', 'document', 'location'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const reloads = [];
  Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'document', { value: { querySelector: () => null }, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'location', { value: { reload: () => reloads.push(1) }, configurable: true, writable: true });
  t.after(() => {
    for (const [k, d] of Object.entries(saved)) d ? Object.defineProperty(globalThis, k, d) : delete globalThis[k];
  });
  return reloads;
}

test('a carried playback time is read once and only while it is fresh', (t) => {
  const session = fakeStore();
  withGlobals(t, session);
  const now = Date.now();
  session.setItem('plexPoster.carry', JSON.stringify({ lastPlaybackAt: now - 5000, at: now - 1000 }));
  assert.equal(takeCarriedPlayback(), now - 5000);
  assert.equal(session.getItem('plexPoster.carry'), null, 'taken');
  assert.equal(takeCarriedPlayback(), null);
  session.setItem('plexPoster.carry', JSON.stringify({ lastPlaybackAt: now - 5000, at: now - 3 * 60_000 }));
  assert.equal(takeCarriedPlayback(), null, 'older than two minutes');
  session.setItem('plexPoster.carry', 'not json');
  assert.equal(takeCarriedPlayback(), null);
  session.setItem('plexPoster.carry', JSON.stringify({ lastPlaybackAt: now + 99_000, at: now - 10 }));
  const before = Date.now();
  const clamped = takeCarriedPlayback();
  const after = Date.now();
  assert.ok(clamped >= before && clamped <= after, 'never from the future');
});

test('without sessionStorage a load is a fresh clock', (t) => {
  withGlobals(t, undefined);
  delete globalThis.sessionStorage;
  assert.equal(takeCarriedPlayback(), null);
});

function setup(settings = {}, state = {}) {
  const logs = [];
  const st = { settings: { ...defaults(), ...settings }, busy: false, tvWaking: false, manualWakeUntil: 0, lastPlaybackAt: 1234, ...state };
  const storage = fakeStore();
  const log = { info: (m) => logs.push(m), warn: (m) => logs.push(m) };
  return { reload: createReload({ state: st, storage, log, getLastDrawAt: () => -Infinity }), st, storage, logs };
}

test('the Diagnostics row says why the daily reload is not active', () => {
  const { reload } = setup({ dailyReload: false });
  assert.equal(reload.dailyReloadRow(), 'skipped (turned off in Settings)');
});

test('a new service worker reloads into it at the next tick, carrying the idle clock', async (t) => {
  const session = fakeStore();
  const reloads = withGlobals(t, session);
  const { reload, logs } = setup({ dailyReload: false });
  reload.dailyReloadTick();
  assert.equal(reloads.length, 0, 'nothing wanted yet');
  reload.requestUpdateReload();
  reload.dailyReloadTick();
  await Promise.resolve();
  assert.equal(reloads.length, 1);
  assert.deepEqual(logs, ['Reloading into the new version']);
  assert.equal(JSON.parse(session.getItem('plexPoster.carry')).lastPlaybackAt, 1234);
  reload.dailyReloadTick();
  await Promise.resolve();
  assert.equal(reloads.length, 1, 'once the page is reloading it does not ask again');
});

test('a wanted update reload waits while a dialog is open or a poster is loading', async (t) => {
  const reloads = withGlobals(t, fakeStore());
  const { reload, st } = setup({ dailyReload: false });
  reload.requestUpdateReload();
  globalThis.document.querySelector = () => ({});
  reload.dailyReloadTick();
  await Promise.resolve();
  globalThis.document.querySelector = () => null;
  st.busy = true;
  reload.dailyReloadTick();
  await Promise.resolve();
  assert.equal(reloads.length, 0);
  st.busy = false;
  reload.dailyReloadTick();
  await Promise.resolve();
  assert.equal(reloads.length, 1);
});

test('a wanted reload waits while the poster is being positioned and goes once it is not (D86)', async (t) => {
  const reloads = withGlobals(t, fakeStore());
  let positioning = true;
  globalThis.document.body = { classList: { contains: (c) => c === 'positioning' && positioning } };
  const { reload } = setup({ dailyReload: false });
  reload.requestUpdateReload();
  reload.dailyReloadTick();
  await Promise.resolve();
  assert.equal(reloads.length, 0, 'an unsaved placement is not dropped');
  positioning = false;
  reload.dailyReloadTick();
  await Promise.resolve();
  assert.equal(reloads.length, 1);
});
