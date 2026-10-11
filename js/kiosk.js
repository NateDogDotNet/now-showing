// Kiosk mode helpers: the settings PIN (salted SHA-256, lockout), the corner zone, the 3 s hold timer, the
// loopback PIN-reset flag and the on-screen PIN prompt. Everything but createPinPrompt() is pure (no DOM, no
// clock reads) so it runs under `node --test`.
//
// The PIN is a deterrent, not security (D16): it keeps casual hands out of Settings, Diagnostics, import, reset
// and the token. It lives in this browser, so anyone who controls the device can get around it.

export const PIN_NOTE =
  'The PIN is a deterrent, not security: it keeps casual hands out of Settings, Diagnostics, import, reset and the token, but it is stored on this device and anyone who controls the device can get around it.';

export const PIN_MIN = 4;
export const PIN_MAX = 8;
export const LOCK_AFTER = 5; // wrong PINs before the first lock
export const LOCK_BASE_MS = 60_000; // the first lock; every further wrong PIN doubles it
export const LOCK_MAX_MS = 15 * 60_000;
export const LOCK_KEY = 'plexPoster.pinLock';
export const CORNER_SIZE = 96; // px, the viewer's bottom-right square that a hold must start in
export const HOLD_MS = 3000; // press or Enter held this long reveals the controls
export const HOLD_MOVE_PX = 12; // a press that drifts further than this is not a hold
export const REVEAL_MS = 15_000; // how long a reveal keeps the controls up

export const isValidPin = (pin) => typeof pin === 'string' && new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);

// ---------- SHA-256 ----------

// The constants are the first 32 bits of the fractional parts of the cube roots (K) and square roots (H0)
// of the first primes; the known-answer tests in tests/kiosk.test.js check them all.
const PRIMES = [];
for (let n = 2; PRIMES.length < 64; n++) if (PRIMES.every((p) => n % p)) PRIMES.push(n);
const frac32 = (x) => Math.floor((x - Math.floor(x)) * 2 ** 32);
const K = PRIMES.map((p) => frac32(Math.cbrt(p)));
const H0 = PRIMES.slice(0, 8).map((p) => frac32(Math.sqrt(p)));
const rotr = (x, n) => (x >>> n) | (x << (32 - n));
const hex32 = (x) => (x >>> 0).toString(16).padStart(8, '0');

/** Pure-JS SHA-256 of a string (UTF-8) as lowercase hex: for plain-http origins, where crypto.subtle is missing. */
export function sha256Fallback(text) {
  const bytes = new TextEncoder().encode(text);
  const size = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(size);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(size - 8, Math.floor(bytes.length / 0x20000000)); // the bit length, big-endian
  view.setUint32(size - 4, (bytes.length << 3) >>> 0);
  const h = Int32Array.from(H0);
  const w = new Int32Array(64);
  for (let off = 0; off < size; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((x, i) => (h[i] = (h[i] + x) | 0));
  }
  return Array.from(h, hex32).join('');
}

/** SHA-256 as hex: Web Crypto when `crypto.subtle` exists (https, localhost), the pure-JS hasher otherwise. */
export async function sha256(text, { crypto = globalThis.crypto } = {}) {
  if (crypto?.subtle?.digest) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // fall through to the pure-JS hasher
    }
  }
  return sha256Fallback(text);
}

// ---------- PIN hash and verify ----------

export function randomSalt({ crypto = globalThis.crypto } = {}) {
  const bytes = new Uint8Array(16);
  if (crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const hashPin = (pin, salt, opts) => sha256(`${salt}:${pin}`, opts);

/** A new { hash, salt } for `pin`. */
export async function createPinAuth(pin, opts) {
  const salt = randomSalt(opts);
  return { hash: await hashPin(pin, salt, opts), salt };
}

/** Does `pin` match the stored { hash, salt }? Nothing matches a missing hash. */
export async function verifyPin(pin, { hash, salt }, opts) {
  if (!hash || typeof pin !== 'string') return false;
  const got = await hashPin(pin, salt, opts);
  let diff = got.length ^ hash.length;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ (hash.charCodeAt(i) || 0);
  return diff === 0;
}

// ---------- Lockout ----------
// { failures, lockedUntil (ms) }. From the 5th wrong PIN on, each wrong PIN locks for 60 s doubled per extra failure,
// up to 15 minutes. A right PIN clears it. Kept in localStorage only (the prompt reads it afresh each time); not a security boundary.

export const noLock = () => ({ failures: 0, lockedUntil: 0 });

export function recordFailure(lock, now) {
  const failures = lock.failures + 1;
  if (failures < LOCK_AFTER) return { failures, lockedUntil: 0 };
  return { failures, lockedUntil: now + Math.min(LOCK_BASE_MS * 2 ** (failures - LOCK_AFTER), LOCK_MAX_MS) };
}

export const recordSuccess = () => noLock();

/** Milliseconds still locked (0 = free). Capped, so a clock stepped backwards cannot lock for days. */
export const lockRemainingMs = (lock, now) => Math.min(Math.max(0, lock.lockedUntil - now), LOCK_MAX_MS);

/** A lock that ends no more than 15 minutes after `now`: a far-future `lockedUntil` (clock stepped back, edited storage) is pulled in. */
export const clampLock = (lock, now) => ({ ...lock, lockedUntil: Math.min(lock.lockedUntil, now + LOCK_MAX_MS) });

/** Reads the stored lock; anything unreadable is "no lock". Given `now`, a `lockedUntil` beyond now + 15 min is clamped to it. */
export function parseLock(raw, now) {
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    return noLock();
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return noLock();
  const lock = {
    failures: Number.isInteger(v.failures) && v.failures > 0 ? Math.min(v.failures, 1000) : 0,
    lockedUntil: Number.isFinite(v.lockedUntil) && v.lockedUntil > 0 ? v.lockedUntil : 0,
  };
  return Number.isFinite(now) ? clampLock(lock, now) : lock;
}

// ---------- The corner zone and the hold ----------

/**
 * The viewer's bottom-right CORNER_SIZE square as a screen rectangle. The UI is rotated clockwise by `rotation`
 * (the --ui-rotation the shell uses), so that corner sits at the screen's bottom-right, bottom-left, top-left
 * and top-right for 0, 90, 180 and 270.
 */
export function cornerZone(rotation, { width, height }) {
  const turn = ((Number.parseFloat(rotation) % 360) + 360) % 360;
  const r = [90, 180, 270].includes(turn) ? turn : 0;
  const right = r === 0 || r === 270;
  const bottom = r === 0 || r === 90;
  return {
    left: right ? Math.max(0, width - CORNER_SIZE) : 0,
    top: bottom ? Math.max(0, height - CORNER_SIZE) : 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  };
}

export const inZone = (z, x, y) => x >= z.left && x < z.left + z.width && y >= z.top && y < z.top + z.height;

/**
 * A press-and-hold timer. start(x, y) arms it (a second start while armed is ignored, so key auto-repeat does
 * not restart it); end() or move(x, y) farther than `tolerance` from where it started cancels; otherwise
 * onHold() runs once after `ms`. start() without coordinates (a key) ignores move().
 */
export function createHold({ ms = HOLD_MS, tolerance = HOLD_MOVE_PX, onHold, setTimer = (fn, t) => setTimeout(fn, t), clearTimer = (id) => clearTimeout(id) }) {
  let timer = null;
  let origin = null;
  const end = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    origin = null;
  };
  return {
    get active() {
      return timer !== null;
    },
    start(x, y) {
      if (timer !== null) return;
      origin = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
      timer = setTimer(() => {
        timer = null;
        origin = null;
        onHold();
      }, ms);
    },
    move(x, y) {
      if (timer !== null && origin && Math.hypot(x - origin.x, y - origin.y) > tolerance) end();
    },
    end,
  };
}

// ---------- PIN recovery ----------

/** The loopback-only config.json flag: only a boolean `resetPin: true` counts (D10, Q21). */
export const shouldResetPin = (config) => Boolean(config) && typeof config === 'object' && !Array.isArray(config) && config.resetPin === true;

// ---------- The on-screen PIN prompt ----------

const lockMessage = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `Too many wrong PINs. Try again in ${s < 90 ? `${s} s` : `${Math.ceil(s / 60)} min`}.`;
};

/**
 * Drives the #pin-dialog markup (a title, a dot display, an error line, a [data-key] keypad and a cancel button).
 *   verify()  asks for the current PIN; resolves true only when it is right (false on cancel or Escape)
 *   choose()  asks for a new PIN twice; resolves { hash, salt }, or null on cancel
 *   resetLock()  forgets the lockout (the PIN reset): the lock lives in storage only, so that is all there is to clear
 *   cancelVerify()  ends an open verify() with false, counting nothing (the PIN it asks for was just reset)
 * One question at a time: a second verify() while one is open shares it; anything else while busy answers no.
 */
export function createPinPrompt({ dialog, getAuth, storage, now = () => Date.now(), crypto = globalThis.crypto }) {
  const $ = (sel) => dialog.querySelector(sel);
  const title = $('#pin-title');
  const dots = $('#pin-dots');
  const error = $('#pin-error');
  $('#pin-note').textContent = PIN_NOTE;
  let session = null;

  // The lock lives in storage only (the app's storage falls back to memory when localStorage is blocked), so there is
  // no copy to go stale: every attempt reads it afresh against now() and writes it back. A stored end more than 15 min
  // ahead (the clock was stepped back, or the value was edited) is pulled in and written back, so it ends 15 min after
  // it was first looked at and a reload does not start the wait again.
  const writeLock = (lock) => storage.setItem(LOCK_KEY, JSON.stringify(clampLock(lock, now())));
  const readLock = () => {
    const stored = parseLock(storage.getItem(LOCK_KEY));
    const lock = clampLock(stored, now());
    if (lock.lockedUntil !== stored.lockedUntil) writeLock(lock);
    return lock;
  };

  const render = () => {
    dots.textContent = '●'.repeat(session?.entry.length ?? 0);
  };
  const clearEntry = (message = '') => {
    session.entry = '';
    error.textContent = message;
    render();
  };

  function finish(result) {
    const s = session;
    session = null; // before close(), so the close handler below sees no open question
    if (dialog.open) dialog.close();
    // Focus left on a keypad button would be remembered by the next modal (Settings) as the place to return to.
    if (dialog.contains(document.activeElement)) document.activeElement.blur();
    dots.textContent = '';
    error.textContent = '';
    s.resolve(result);
  }

  function ask(mode, heading) {
    return new Promise((resolve) => {
      session = { mode, entry: '', first: '', busy: false, resolve, shared: null };
      title.textContent = heading;
      error.textContent = '';
      render();
      const wait = mode === 'verify' ? lockRemainingMs(readLock(), now()) : 0;
      if (wait > 0) error.textContent = lockMessage(wait);
      dialog.showModal();
      dots.focus();
    });
  }

  async function submit() {
    const s = session;
    if (!s || s.busy) return;
    if (s.mode === 'verify') {
      const wait = lockRemainingMs(readLock(), now());
      if (wait > 0) return clearEntry(lockMessage(wait));
      // A held key or an OK with nothing typed is not an attempt, and no PIN is shorter than PIN_MIN.
      if (s.entry.length < PIN_MIN) return clearEntry(`Enter your PIN (${PIN_MIN} to ${PIN_MAX} digits).`);
      s.busy = true;
      const ok = await verifyPin(s.entry, getAuth(), { crypto });
      s.busy = false;
      if (session !== s) return;
      if (ok) {
        storage.removeItem(LOCK_KEY); // recordSuccess(): no failures, no lock
        return finish(true);
      }
      const lock = recordFailure(readLock(), now());
      writeLock(lock);
      const left = lockRemainingMs(lock, now());
      return clearEntry(left > 0 ? lockMessage(left) : 'Wrong PIN. Try again.');
    }
    // choose: a new PIN, then the same again
    if (!isValidPin(s.entry)) return clearEntry(`Use ${PIN_MIN} to ${PIN_MAX} digits.`);
    if (!s.first) {
      s.first = s.entry;
      title.textContent = 'Confirm the new PIN';
      return clearEntry();
    }
    if (s.entry !== s.first) {
      s.first = '';
      title.textContent = 'New PIN';
      return clearEntry('The PINs did not match. Start again.');
    }
    s.busy = true;
    const auth = await createPinAuth(s.entry, { crypto });
    if (session === s) finish(auth);
  }

  function press(key) {
    if (!session || session.busy) return;
    if (key === 'ok') return submit();
    if (key === 'back') session.entry = session.entry.slice(0, -1);
    else if (/^\d$/.test(key) && session.entry.length < PIN_MAX) session.entry += key;
    error.textContent = '';
    render();
  }

  dialog.addEventListener('click', (e) => {
    const key = e.target.closest?.('[data-key]');
    if (key) press(key.dataset.key);
  });
  const cancel = () => session && finish(session.mode === 'verify' ? false : null);
  $('#pin-cancel').addEventListener('click', cancel);
  // Escape. A late 'close' event from an earlier question must not end the one that is open now.
  dialog.addEventListener('close', () => dialog.open || cancel());
  dialog.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const onButton = e.target.closest?.('button');
    if (e.repeat) {
      // A held key sends one press, not a stream of them (and a held Enter on a button must not click it again).
      if (/^\d$/.test(e.key) || e.key === 'Backspace' || e.key === 'Enter') e.preventDefault();
      return;
    }
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('back');
    else if (e.key === 'Enter' && !onButton) press('ok');
    else return;
    e.preventDefault();
  });

  return {
    resetLock() {
      storage.removeItem(LOCK_KEY);
    },
    cancelVerify() {
      if (session?.mode === 'verify') cancel();
    },
    verify() {
      if (session && !dialog.open) cancel(); // closed by Escape, its 'close' event still on the way
      if (session?.mode === 'verify') return session.shared;
      if (session) return Promise.resolve(false);
      const p = ask('verify', 'Enter PIN');
      session.shared = p;
      return p;
    },
    choose() {
      if (session && !dialog.open) cancel();
      return session ? Promise.resolve(null) : ask('choose', 'New PIN');
    },
  };
}
