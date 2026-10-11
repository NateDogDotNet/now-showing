import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  CORNER_SIZE,
  HOLD_MOVE_PX,
  LOCK_BASE_MS,
  LOCK_MAX_MS,
  PIN_NOTE,
  clampLock,
  cornerZone,
  createHold,
  createPinAuth,
  createPinPrompt,
  hashPin,
  inZone,
  isValidPin,
  lockRemainingMs,
  noLock,
  parseLock,
  randomSalt,
  recordFailure,
  recordSuccess,
  sha256,
  sha256Fallback,
  shouldResetPin,
  verifyPin,
} from '../js/kiosk.js';

// ---------- SHA-256 ----------

const VECTORS = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
];

test('the pure-JS SHA-256 matches the known vectors', () => {
  for (const [input, want] of VECTORS) assert.equal(sha256Fallback(input), want, JSON.stringify(input));
});

test('the pure-JS SHA-256 matches node for lengths around the block boundaries and for non-ASCII', () => {
  for (const n of [1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
    const s = 'x'.repeat(n);
    assert.equal(sha256Fallback(s), createHash('sha256').update(s).digest('hex'), `length ${n}`);
  }
  const u = 'pin ✓ ключ 日本語 😀';
  assert.equal(sha256Fallback(u), createHash('sha256').update(u, 'utf8').digest('hex'));
});

test('sha256 uses Web Crypto when crypto.subtle exists', async () => {
  let calls = 0;
  const crypto = {
    subtle: {
      digest: async (alg, data) => {
        calls++;
        assert.equal(alg, 'SHA-256');
        return createHash('sha256').update(Buffer.from(data)).digest().buffer;
      },
    },
  };
  assert.equal(await sha256('abc', { crypto }), VECTORS[1][1]);
  assert.equal(calls, 1);
});

test('the fallback hasher is used when crypto.subtle is missing', async () => {
  for (const crypto of [{}, { subtle: undefined }, { subtle: {} }, null]) {
    assert.equal(await sha256('abc', { crypto }), VECTORS[1][1]);
  }
  // Same hash with or without Web Crypto, so a PIN set on https still verifies on a plain-http origin.
  const withSubtle = await createPinAuth('4321', { crypto: globalThis.crypto });
  assert.equal(await verifyPin('4321', withSubtle, { crypto: {} }), true);
  assert.equal(await verifyPin('4322', withSubtle, { crypto: {} }), false);
});

test('a subtle.digest that throws falls back to the pure-JS hasher', async () => {
  const crypto = { subtle: { digest: async () => { throw new Error('insecure'); } } };
  assert.equal(await sha256('abc', { crypto }), VECTORS[1][1]);
});

// ---------- PIN hash and verify ----------

test('a PIN round-trips with its salt and a wrong PIN fails', async () => {
  const auth = await createPinAuth('2468');
  assert.match(auth.hash, /^[0-9a-f]{64}$/);
  assert.match(auth.salt, /^[0-9a-f]{32}$/);
  assert.equal(await verifyPin('2468', auth), true);
  assert.equal(await verifyPin('2469', auth), false);
  assert.equal(await verifyPin('', auth), false);
  assert.equal(await verifyPin('24680', auth), false);
});

test('the salt matters: same PIN, different salts, different hashes; the wrong salt fails', async () => {
  const a = await createPinAuth('1111');
  const b = await createPinAuth('1111');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.equal(await verifyPin('1111', { hash: a.hash, salt: b.salt }), false);
  assert.equal(a.hash, await hashPin('1111', a.salt));
  assert.ok(!a.hash.includes('1111'));
});

test('nothing verifies against a missing hash', async () => {
  assert.equal(await verifyPin('1234', { hash: '', salt: '' }), false);
  assert.equal(await verifyPin('1234', { hash: '', salt: 'ab' }), false);
});

test('randomSalt works with and without getRandomValues', () => {
  assert.match(randomSalt({ crypto: globalThis.crypto }), /^[0-9a-f]{32}$/);
  assert.match(randomSalt({ crypto: {} }), /^[0-9a-f]{32}$/);
});

test('a PIN is 4 to 8 digits', () => {
  for (const ok of ['1234', '00000', '12345678']) assert.equal(isValidPin(ok), true, ok);
  for (const bad of ['', '123', '123456789', '12a4', ' 1234', '12.4', 1234, null, undefined]) assert.equal(isValidPin(bad), false, String(bad));
});

test('the PIN note says the PIN is a deterrent', () => {
  assert.match(PIN_NOTE, /deterrent/);
});

// ---------- Lockout ----------

const T0 = 1_000_000;

test('four failures do not lock; the fifth locks for 60 s', () => {
  let lock = noLock();
  for (let i = 1; i <= 4; i++) {
    lock = recordFailure(lock, T0);
    assert.equal(lockRemainingMs(lock, T0), 0, `failure ${i}`);
  }
  lock = recordFailure(lock, T0);
  assert.equal(LOCK_BASE_MS, 60_000);
  assert.equal(lockRemainingMs(lock, T0), 60_000);
  assert.equal(lockRemainingMs(lock, T0 + 59_999), 1);
  assert.equal(lockRemainingMs(lock, T0 + 60_000), 0);
});

test('each further failure doubles the lock, up to 15 minutes', () => {
  let lock = noLock();
  const seen = [];
  let now = T0;
  for (let i = 1; i <= 11; i++) {
    lock = recordFailure(lock, now);
    seen.push(lockRemainingMs(lock, now));
    now += lockRemainingMs(lock, now); // wait it out
  }
  assert.deepEqual(seen, [0, 0, 0, 0, 60_000, 120_000, 240_000, 480_000, LOCK_MAX_MS, LOCK_MAX_MS, LOCK_MAX_MS]);
  assert.equal(LOCK_MAX_MS, 15 * 60_000);
});

test('a success clears the failures and the lock', () => {
  let lock = noLock();
  for (let i = 0; i < 7; i++) lock = recordFailure(lock, T0);
  assert.ok(lockRemainingMs(lock, T0) > 0);
  lock = recordSuccess(lock);
  assert.deepEqual(lock, noLock());
  for (let i = 0; i < 4; i++) lock = recordFailure(lock, T0);
  assert.equal(lockRemainingMs(lock, T0), 0, 'the count starts again from zero');
});

test('a lock that lies far in the future (clock stepped back) is capped at 15 minutes', () => {
  const lock = { failures: 5, lockedUntil: T0 + 24 * 3600_000 };
  assert.equal(lockRemainingMs(lock, T0), LOCK_MAX_MS);
});

test('after many wrong PINs the stored lock itself ends within 15 minutes, also after a reload', async () => {
  const auth = await createPinAuth('4321');
  for (const wrong of [10, 20, 50]) {
    let lock = noLock();
    let now = T0;
    for (let i = 1; i <= wrong; i++) {
      lock = recordFailure(lock, now);
      assert.ok(lock.lockedUntil - now <= LOCK_MAX_MS, `wrong PIN ${i}: lockedUntil is at most 15 min ahead`);
      now += 1000; // hammering the PIN as soon as the keypad allows
    }
    const last = now - 1000; // the moment of the last wrong PIN
    assert.ok(lock.lockedUntil - last <= LOCK_MAX_MS, `${wrong} wrong PINs`);
    for (const stored of [lock, parseLock(JSON.stringify(lock))]) {
      assert.ok(stored.lockedUntil - last <= LOCK_MAX_MS, 'the stored value, not just the displayed wait');
      assert.ok(lockRemainingMs(stored, last + LOCK_MAX_MS - 1) > 0, 'still locked just before 15 min');
      assert.equal(lockRemainingMs(stored, last + LOCK_MAX_MS), 0, `${wrong} wrong PINs: free after 15 min`);
      assert.equal(lockRemainingMs(stored, last + LOCK_MAX_MS + 1), 0);
      assert.equal(await verifyPin('4321', auth), true, 'the right PIN is accepted again');
    }
  }
});

test('a stored lock a day ahead is clamped to 15 minutes ahead when read, so it expires 15 minutes later', () => {
  const raw = JSON.stringify({ failures: 9, lockedUntil: T0 + 24 * 3600_000 });
  const lock = parseLock(raw, T0);
  assert.equal(lock.failures, 9);
  assert.equal(lock.lockedUntil, T0 + LOCK_MAX_MS, 'clamped to now + 15 min');
  assert.equal(lockRemainingMs(lock, T0), LOCK_MAX_MS);
  assert.ok(lockRemainingMs(lock, T0 + LOCK_MAX_MS - 1) > 0, 'still locked just before 15 min');
  assert.equal(lockRemainingMs(lock, T0 + LOCK_MAX_MS), 0, 'expired 15 min later, not a day later');
  // The clamp is measured from the moment of reading: a lock within 15 min is left as it was.
  const near = { failures: 6, lockedUntil: T0 + 5000 };
  assert.deepEqual(parseLock(JSON.stringify(near), T0), near);
  assert.equal(parseLock(raw, T0 + 3600_000).lockedUntil, T0 + 3600_000 + LOCK_MAX_MS);
});

test('clampLock caps a lock to 15 minutes ahead and leaves nearer and unlocked ones alone', () => {
  assert.deepEqual(clampLock({ failures: 7, lockedUntil: T0 + 3 * 3600_000 }, T0), { failures: 7, lockedUntil: T0 + LOCK_MAX_MS });
  assert.deepEqual(clampLock({ failures: 5, lockedUntil: T0 + 1000 }, T0), { failures: 5, lockedUntil: T0 + 1000 });
  assert.deepEqual(clampLock(noLock(), T0), noLock());
});

test('parseLock survives junk and round-trips what is stored', () => {
  for (const raw of [null, '', 'nope', '[]', '{"failures":"x"}', '{"failures":-3,"lockedUntil":-1}', '42']) {
    assert.deepEqual(parseLock(raw), noLock(), String(raw));
  }
  const lock = { failures: 6, lockedUntil: T0 + 5000 };
  assert.deepEqual(parseLock(JSON.stringify(lock)), lock);
});

// ---------- The PIN prompt keeps no lock state of its own ----------
// createPinPrompt against a stand-in dialog: the lock is read from storage, against the clock, at every attempt.

const BASE = Date.UTC(2030, 0, 1);
const YEAR = 365 * 24 * 3600_000;
const LOCK_KEY = 'plexPoster.pinLock';

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** A prompt on a stand-in #pin-dialog. `clock.t` is the prompt's now(). */
function fakePrompt({ auth, storage = fakeStorage(), clock = { t: BASE } }) {
  globalThis.document ??= { activeElement: null };
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      const listeners = {};
      els.set(id, { textContent: '', listeners, focus() {}, addEventListener: (type, fn) => (listeners[type] ??= []).push(fn) });
    }
    return els.get(id);
  };
  const dialog = {
    open: false,
    listeners: {},
    querySelector: (sel) => el(sel),
    addEventListener(type, fn) {
      (this.listeners[type] ??= []).push(fn);
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    contains: () => false,
  };
  const prompt = createPinPrompt({ dialog, storage, now: () => clock.t, getAuth: () => auth });
  const tap = (key) => dialog.listeners.click.forEach((fn) => fn({ target: { closest: () => ({ dataset: { key } }) } }));
  const error = () => el('#pin-error').textContent;
  /** Types `pin`, presses OK and waits until it has been judged (the dialog closed, or a message shown). */
  async function attempt(pin) {
    for (const d of pin) tap(d);
    tap('ok');
    for (let i = 0; i < 500 && dialog.open && error() === ''; i++) await new Promise((r) => setTimeout(r, 1));
  }
  const cancel = () => el('#pin-cancel').listeners.click.forEach((fn) => fn());
  return { prompt, dialog, storage, clock, attempt, error, cancel, stored: () => JSON.parse(storage.getItem(LOCK_KEY)) };
}

test('five wrong PINs, the clock stepped back a year: the right PIN is accepted 16 minutes later, in the same page', async () => {
  const auth = await createPinAuth('2468');
  const h = fakePrompt({ auth });
  const answer = h.prompt.verify();
  for (let i = 0; i < 5; i++) await h.attempt('1111');
  assert.equal(h.stored().failures, 5);
  assert.match(h.error(), /try again in 60 s/i);
  h.clock.t = BASE - YEAR; // an RTC that ran ahead is corrected
  await h.attempt('2468');
  assert.match(h.error(), /try again in 15 min/i, 'refused, and told 15 min at most');
  assert.equal(h.dialog.open, true);
  h.clock.t += 16 * 60_000;
  await h.attempt('2468');
  assert.equal(h.dialog.open, false, `accepted 16 min later, not when the old clock catches up (${h.error()})`);
  assert.equal(await answer, true);
  assert.equal(h.storage.getItem(LOCK_KEY), null, 'a success clears the lock');
});

test('the clock stepped back a year with the dialog closed in between: opening it again clamps, and 16 minutes on the PIN works', async () => {
  const auth = await createPinAuth('2468');
  const h = fakePrompt({ auth });
  const first = h.prompt.verify();
  for (let i = 0; i < 5; i++) await h.attempt('1111');
  h.cancel();
  assert.equal(await first, false);
  h.clock.t = BASE - YEAR;
  const answer = h.prompt.verify();
  assert.match(h.error(), /try again in 15 min/i, 'the lock shown is the clamped one');
  h.clock.t += 16 * 60_000;
  await h.attempt('2468');
  assert.equal(h.dialog.open, false, `accepted (${h.error()})`);
  assert.equal(await answer, true);
});

test('a lock stored a day ahead is pulled in and written back when the prompt reads it, so it does not slide on', async () => {
  const auth = await createPinAuth('2468');
  const storage = fakeStorage({ [LOCK_KEY]: JSON.stringify({ failures: 9, lockedUntil: BASE + 24 * 3600_000 }) });
  const h = fakePrompt({ auth, storage });
  h.prompt.verify();
  assert.deepEqual(h.stored(), { failures: 9, lockedUntil: BASE + LOCK_MAX_MS }, 'written back clamped');
  h.cancel();
  // A reload every 10 minutes (a new prompt on the same storage) never pushes the end further out.
  for (let i = 1; i <= 3; i++) {
    h.clock.t = BASE + i * 10 * 60_000;
    const again = fakePrompt({ auth, storage, clock: h.clock });
    again.prompt.verify();
    assert.equal(again.stored().lockedUntil, BASE + LOCK_MAX_MS, `reload ${i}: still ends 15 min after the first look`);
    again.cancel();
  }
  h.clock.t = BASE + LOCK_MAX_MS + 1;
  const late = fakePrompt({ auth, storage, clock: h.clock });
  const answer = late.prompt.verify();
  await late.attempt('2468');
  assert.equal(late.dialog.open, false, `free 15 min after the first look (${late.error()})`);
  assert.equal(await answer, true);
});

test('a wrong PIN after a lock was cleared elsewhere (another tab, a reset) counts from zero', async () => {
  const auth = await createPinAuth('2468');
  const h = fakePrompt({ auth });
  h.prompt.verify();
  for (let i = 0; i < 5; i++) await h.attempt('1111');
  h.prompt.resetLock();
  assert.equal(h.storage.getItem(LOCK_KEY), null);
  h.clock.t += 61_000;
  await h.attempt('1111');
  assert.equal(h.stored().failures, 1, 'one failure, not six');
  assert.doesNotMatch(h.error(), /too many/i);
});

test('cancelVerify ends an open PIN question with false and counts nothing', async () => {
  const auth = await createPinAuth('2468');
  const h = fakePrompt({ auth });
  const answer = h.prompt.verify();
  h.prompt.cancelVerify();
  assert.equal(h.dialog.open, false, 'the question is gone');
  assert.equal(await answer, false);
  assert.equal(h.storage.getItem(LOCK_KEY), null);
  h.prompt.cancelVerify(); // nothing open: harmless
});

// ---------- Corner zone ----------

test('cornerZone is the viewer bottom-right 96x96 at each rotation', () => {
  const vp = { width: 1280, height: 720 };
  assert.equal(CORNER_SIZE, 96);
  // The UI is rotated clockwise about the centre, so the viewer's bottom-right lands here on the screen.
  assert.deepEqual(cornerZone(0, vp), { left: 1184, top: 624, width: 96, height: 96 }); // bottom-right
  assert.deepEqual(cornerZone(90, vp), { left: 0, top: 624, width: 96, height: 96 }); // bottom-left
  assert.deepEqual(cornerZone(180, vp), { left: 0, top: 0, width: 96, height: 96 }); // top-left
  assert.deepEqual(cornerZone(270, vp), { left: 1184, top: 0, width: 96, height: 96 }); // top-right
});

test('cornerZone accepts "90deg"-style and out-of-range rotations', () => {
  const vp = { width: 800, height: 600 };
  assert.deepEqual(cornerZone('90deg', vp), cornerZone(90, vp));
  assert.deepEqual(cornerZone(360, vp), cornerZone(0, vp));
  assert.deepEqual(cornerZone(-90, vp), cornerZone(270, vp));
  assert.deepEqual(cornerZone(45, vp), cornerZone(0, vp));
});

test('cornerZone never leaves the screen', () => {
  const z = cornerZone(0, { width: 50, height: 40 });
  assert.deepEqual(z, { left: 0, top: 0, width: 96, height: 96 });
});

test('inZone is inclusive of the top-left edge and exclusive of the far edge', () => {
  const z = { left: 100, top: 200, width: 96, height: 96 };
  assert.equal(inZone(z, 100, 200), true);
  assert.equal(inZone(z, 195, 295), true);
  assert.equal(inZone(z, 196, 295), false);
  assert.equal(inZone(z, 99, 250), false);
  assert.equal(inZone(z, 150, 296), false);
});

// ---------- Hold timer ----------

function fakeTimers() {
  let now = 0;
  let next = 1;
  const pending = new Map();
  return {
    setTimer: (fn, ms) => {
      const id = next++;
      pending.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimer: (id) => pending.delete(id),
    advance(ms) {
      now += ms;
      for (const [id, t] of [...pending]) {
        if (t.at <= now) {
          pending.delete(id);
          t.fn();
        }
      }
    },
    get pending() {
      return pending.size;
    },
  };
}

function holdWith(ms = 3000) {
  const timers = fakeTimers();
  let fired = 0;
  const hold = createHold({ ms, onHold: () => fired++, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
  return { hold, timers, fired: () => fired };
}

test('a hold fires once after the full time', () => {
  const { hold, timers, fired } = holdWith();
  hold.start(10, 10);
  assert.equal(hold.active, true);
  timers.advance(2999);
  assert.equal(fired(), 0);
  timers.advance(1);
  assert.equal(fired(), 1);
  assert.equal(hold.active, false);
  timers.advance(10_000);
  assert.equal(fired(), 1);
});

test('releasing early cancels the hold', () => {
  const { hold, timers, fired } = holdWith();
  hold.start(10, 10);
  timers.advance(2999);
  hold.end();
  assert.equal(hold.active, false);
  assert.equal(timers.pending, 0);
  timers.advance(5000);
  assert.equal(fired(), 0);
});

test('moving more than 12 px cancels the hold; 12 px or less does not', () => {
  assert.equal(HOLD_MOVE_PX, 12);
  const a = holdWith();
  a.hold.start(100, 100);
  a.hold.move(112, 100); // exactly 12
  a.hold.move(100, 88);
  a.hold.move(107, 109); // sqrt(49 + 81) = 11.4
  a.timers.advance(3000);
  assert.equal(a.fired(), 1);

  const b = holdWith();
  b.hold.start(100, 100);
  b.hold.move(113, 100); // 13
  assert.equal(b.hold.active, false);
  b.timers.advance(3000);
  assert.equal(b.fired(), 0);

  const c = holdWith();
  c.hold.start(100, 100);
  c.hold.move(109, 109); // diagonal: 12.7
  c.timers.advance(3000);
  assert.equal(c.fired(), 0);
});

test('the distance is measured from where the press began, not from the last move', () => {
  const { hold, timers, fired } = holdWith();
  hold.start(0, 0);
  for (let x = 4; x <= 16; x += 4) hold.move(x, 0); // each step is small; the drift is 16
  timers.advance(3000);
  assert.equal(fired(), 0);
});

test('a second start while a hold runs does not restart or double it (key repeat)', () => {
  const { hold, timers, fired } = holdWith();
  hold.start();
  timers.advance(2000);
  hold.start();
  timers.advance(1000);
  assert.equal(fired(), 1);
});

test('a hold with no coordinates (a key) ignores moves, and end() with nothing running is harmless', () => {
  const { hold, timers, fired } = holdWith();
  hold.end();
  hold.start();
  hold.move(500, 500);
  timers.advance(3000);
  assert.equal(fired(), 1);
  hold.end();
});

test('a hold can be started again after it fired or was cancelled', () => {
  const { hold, timers, fired } = holdWith();
  hold.start(0, 0);
  hold.end();
  hold.start(0, 0);
  timers.advance(3000);
  hold.start(0, 0);
  timers.advance(3000);
  assert.equal(fired(), 2);
});

// ---------- PIN reset flag ----------

test('shouldResetPin is true only for resetPin: true', () => {
  assert.equal(shouldResetPin({ resetPin: true }), true);
  assert.equal(shouldResetPin({ resetPin: true, plexToken: 'x' }), true);
  for (const bad of [
    {},
    { resetPin: false },
    { resetPin: 'true' },
    { resetPin: 1 },
    { resetPin: null },
    { resetpin: true },
    { reset_pin: true },
    { settings: { resetPin: true } },
    [],
    [{ resetPin: true }],
    null,
    undefined,
    true,
    'resetPin',
    42,
  ]) {
    assert.equal(shouldResetPin(bad), false, JSON.stringify(bad));
  }
});
