import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinGate } from '../js/pin-gate.js';
import { createPosterPin } from '../js/poster-pin.js';

// A dialog stand-in: the prompt only looks elements up and sets text on them while it is built.
const fakeDialog = () => ({ querySelector: () => ({ textContent: '', addEventListener() {}, append() {}, replaceChildren() {} }), addEventListener() {} });
const storage = { getItem: () => null, setItem() {}, removeItem() {} };

test('with no PIN set the gate lets everything through without asking', async () => {
  const settings = { settingsPinHash: '', settingsPinSalt: '' };
  const gate = createPinGate({ dialog: fakeDialog(), storage, getSettings: () => settings });
  assert.equal(await gate.requestPin(), true);
});

test('the gate reads the PIN from the settings at the moment of the check', async () => {
  let settings = { settingsPinHash: '', settingsPinSalt: '' };
  const gate = createPinGate({ dialog: fakeDialog(), storage, getSettings: () => settings });
  let asked = 0;
  gate.prompt.verify = () => (asked++, Promise.resolve(false));
  assert.equal(await gate.requestPin(), true);
  settings = { settingsPinHash: 'abc', settingsPinSalt: 'xyz' };
  assert.equal(await gate.requestPin(), false, 'a PIN set later is asked for');
  assert.equal(asked, 1);
});

test('Pin pins the poster on screen, Unpin lets go, and nothing on screen says so', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); // toast() arms a 5 s hide timer
  const toasts = [];
  const el = { hidden: true, replaceChildren: (...n) => toasts.push(n[0].data) };
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: { getElementById: () => el, createTextNode: (data) => ({ data }) }, configurable: true, writable: true });
  t.after(() => (saved ? Object.defineProperty(globalThis, 'document', saved) : delete globalThis.document));
  const applied = [];
  let settings = { staticRatingKey: '', staticTitle: '', other: 1 };
  let current = { ratingKey: '42', title: 'Alien' };
  const pin = createPosterPin({ getSettings: () => settings, getCurrent: () => current, applySettings: (next) => applied.push(next) });
  pin.togglePin();
  assert.deepEqual(applied.pop(), { staticRatingKey: '42', staticTitle: 'Alien', other: 1 });
  settings = { staticRatingKey: '42', staticTitle: 'Alien', other: 1 };
  pin.togglePin();
  assert.deepEqual(applied.pop(), { staticRatingKey: '', staticTitle: '', other: 1 });
  settings = { staticRatingKey: '', staticTitle: '', other: 1 };
  current = null;
  pin.togglePin();
  assert.equal(applied.length, 0);
  assert.deepEqual(toasts, ['Pinned "Alien".', 'Unpinned — rotating posters again.', 'Nothing to pin yet.']);
});
