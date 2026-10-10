// Kiosk mode, the settings PIN and PIN recovery (R-KIOSK-1, R-KIOSK-2, D10, D16).
// Every case names pixelShift: false (convention 7). The PIN is a deterrent, not security (D16).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPinAuth } from '../../js/kiosk.js';
import { withApp } from './lib.mjs';

const check = (name) => console.log(`  ok  ${name}`);
const cases = [];
const kioskCase = (name, opts, fn) => cases.push({ name, opts, fn });

const PIN = '2468';
const WRONG = '1111';
const auth = await createPinAuth(PIN);
const withPin = { settingsPinHash: auth.hash, settingsPinSalt: auth.salt };

const seed = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  showNowPlaying: false,
  rotateSeconds: 3600,
  pixelShift: false,
  ...extra,
});

const T0 = '2026-06-01T12:00:00';
const T1 = '2026-06-01T12:01:00';

const posterShown = (page) =>
  page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });

/** Load the app and, when asked, freeze the fake clock so holds and the 15 s reveal are exact. */
async function open(page, app, { pause = false } = {}) {
  await page.goto(app.url);
  await posterShown(page);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  if (pause) await page.clock.pauseAt(new Date(T1));
}

const controls = (page) =>
  page.evaluate(() => {
    const el = document.getElementById('controls');
    return { visible: el.classList.contains('visible'), inert: el.inert };
  });
const isOpen = (page, id) => page.evaluate((i) => document.getElementById(i).open, id);
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings') || 'null'));
/** The stored PIN hash ('' when none; a seeded blob that was never saved has no such key). */
const storedHash = async (page) => (await stored(page))?.settingsPinHash || '';

/** The centre of the viewer's bottom-right 96x96 zone in screen pixels, per rotation (viewport 1280x720). */
const ZONE_CENTRE = { 0: [1232, 672], 90: [48, 672], 180: [48, 48], 270: [1232, 48] };

async function cornerHold(page, rotation, { ms = 3000, dx = 0, dy = 0 } = {}) {
  const [x, y] = ZONE_CENTRE[rotation];
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (dx || dy) await page.mouse.move(x + dx, y + dy);
  await page.clock.runFor(ms);
}

const pinDialog = (page) =>
  page.evaluate(() => {
    const el = document.getElementById('pin-dialog');
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    let angle = 0;
    const m = cs.transform.match(/matrix\(([^)]+)\)/);
    if (m) {
      const [a, b] = m[1].split(',').map(Number);
      angle = (((Math.round((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360);
    }
    return {
      open: el.open,
      angle,
      box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      error: document.getElementById('pin-error').textContent,
      title: document.getElementById('pin-title').textContent,
    };
  });
const pinOpen = (page) => isOpen(page, 'pin-dialog');
const waitPin = (page, want = true) => page.waitForFunction((w) => document.getElementById('pin-dialog').open === w, want, { timeout: 5000 });

/** Types a PIN on the on-screen keypad (clicks, or taps when the context has touch) and presses OK. */
async function enterPin(page, pin, { tap = false, ok = true } = {}) {
  await waitPin(page);
  for (const d of pin) await page[tap ? 'tap' : 'click'](`#pin-dialog [data-key="${d}"]`);
  if (ok) {
    await page[tap ? 'tap' : 'click']('#pin-dialog [data-key="ok"]');
    // Whatever the answer, the entry is cleared once it has been judged.
    await page.waitForFunction(() => document.getElementById('pin-dots').textContent === '', null, { timeout: 5000 });
  }
}

const settingsOpenAfterPin = async (page, pin = PIN) => {
  await page.keyboard.press('s');
  await enterPin(page, pin);
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
};

const inside = (b, w, h) => b.left >= -1 && b.top >= -1 && b.right <= w + 1 && b.bottom <= h + 1;

// ---------------------------------------------------------------- kiosk: hidden, unfocusable

kioskCase('kioskMode: pointer move, tap, click and key presses never show the controls, which stay inert', { settings: seed({ kioskMode: true }), clock: { time: T0 } }, async ({ page, app }) => {
  await open(page, app);
  assert.deepEqual(await controls(page), { visible: false, inert: true }, 'hidden and inert at load');

  await page.mouse.move(300, 300);
  await page.mouse.move(640, 360, { steps: 8 });
  await page.mouse.click(640, 360);
  await page.mouse.click(1232, 672); // a quick click in the corner is not a hold
  for (const key of ['a', 'Shift', 'ArrowDown', 'Enter', 'Escape', 'Tab']) await page.keyboard.press(key);
  await page.waitForTimeout(300);
  assert.deepEqual(await controls(page), { visible: false, inert: true }, 'after pointer and key input');

  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('#controls'))), false, `Tab ${i} reaches the controls`);
  }
  for (const key of ['Tab', 'Shift+Tab']) await page.keyboard.press(key);
  assert.equal(await page.evaluate(() => document.getElementById('controls').matches(':focus-within')), false);
  assert.equal(await page.evaluate(() => document.body.classList.contains('idle')), true, 'the status pill stays down too');
  check('kiosk: input never shows the controls; Tab never reaches them');
});

kioskCase('kioskMode: a touch tap does not show the controls', { settings: seed({ kioskMode: true }), hasTouch: true, clock: { time: T0 } }, async ({ page, app }) => {
  await open(page, app);
  await page.touchscreen.tap(640, 360);
  await page.touchscreen.tap(1232, 672);
  await page.waitForTimeout(300);
  assert.deepEqual(await controls(page), { visible: false, inert: true });
  check('kiosk: touch taps leave the controls hidden');
});

// ---------------------------------------------------------------- kiosk: the corner hold

for (const rotation of [0, 90]) {
  kioskCase(`kioskMode: a 3 s press in the corner shows the controls for 15 s (rotation ${rotation})`, { settings: seed({ kioskMode: true, rotation }), clock: { time: T0 } }, async ({ page, app }) => {
    await open(page, app, { pause: true });
    const [x, y] = ZONE_CENTRE[rotation];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.clock.runFor(2900);
    assert.equal((await controls(page)).visible, false, 'not before 3 s');
    await page.clock.runFor(200);
    assert.deepEqual(await controls(page), { visible: true, inert: false }, 'shown at 3 s');
    await page.mouse.up();
    await page.clock.runFor(13900); // 14.0 s after they showed
    assert.equal((await controls(page)).visible, true, 'still there at 14 s');
    await page.clock.runFor(1100); // 15.1 s
    assert.deepEqual(await controls(page), { visible: false, inert: true }, 'gone after 15 s');
    check(`kiosk: corner hold shows the controls for 15 s at rotation ${rotation}`);
  });
}

kioskCase('kioskMode: the corner hold is the viewer\'s corner at 180 and 270 too, and the wrong corner does nothing', { settings: seed({ kioskMode: true, rotation: 270 }), clock: { time: T0 } }, async ({ page, app }) => {
  await open(page, app, { pause: true });
  await page.mouse.move(1232, 672); // the unrotated corner: not the viewer's at 270
  await page.mouse.down();
  await page.clock.runFor(3500);
  await page.mouse.up();
  assert.equal((await controls(page)).visible, false, 'wrong corner');
  await cornerHold(page, 270, { ms: 3100 });
  await page.mouse.up();
  assert.equal((await controls(page)).visible, true, 'viewer corner at 270');
  check('kiosk: zone follows --ui-rotation');
});

kioskCase('kioskMode: an early release, movement over 12 px, or a press outside the zone does not reveal', { settings: seed({ kioskMode: true }), clock: { time: T0 } }, async ({ page, app }) => {
  await open(page, app, { pause: true });
  await cornerHold(page, 0, { ms: 2900 });
  await page.mouse.up();
  await page.clock.runFor(1000);
  assert.equal((await controls(page)).visible, false, 'released at 2.9 s');

  await cornerHold(page, 0, { ms: 3500, dx: -20 });
  await page.mouse.up();
  assert.equal((await controls(page)).visible, false, 'moved 20 px');

  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.clock.runFor(4000);
  await page.mouse.up();
  assert.equal((await controls(page)).visible, false, 'outside the zone');

  await cornerHold(page, 0, { ms: 3100, dx: 8, dy: 8 }); // 11.3 px: within tolerance
  await page.mouse.up();
  assert.equal((await controls(page)).visible, true, 'a small wobble is fine');
  check('kiosk: hold cancels on release and on movement');
});

kioskCase('kioskMode: touch and pen holds work, and a pointercancel ends the hold', { settings: seed({ kioskMode: true }), clock: { time: T0 } }, async ({ page, app }) => {
  await open(page, app, { pause: true });
  const fire = (type, pointerType, id, x = 1232, y = 672) =>
    page.evaluate(
      ([t, pt, i, cx, cy]) => document.dispatchEvent(new PointerEvent(t, { pointerType: pt, pointerId: i, isPrimary: true, clientX: cx, clientY: cy, bubbles: true })),
      [type, pointerType, id, x, y],
    );
  await fire('pointerdown', 'touch', 5);
  await page.clock.runFor(2000);
  await fire('pointercancel', 'touch', 5);
  await page.clock.runFor(3000);
  assert.equal((await controls(page)).visible, false, 'pointercancel ends the hold');

  await fire('pointerdown', 'touch', 6);
  await page.clock.runFor(1000);
  await fire('pointerup', 'touch', 99); // another finger lifting does not end this one
  await page.clock.runFor(2100);
  assert.equal((await controls(page)).visible, true, 'touch hold');
  await page.clock.runFor(16000);
  assert.equal((await controls(page)).visible, false);

  await fire('pointerdown', 'pen', 7);
  await page.clock.runFor(3100);
  assert.equal((await controls(page)).visible, true, 'pen hold');
  check('kiosk: touch/pen holds, pointercancel');
});

// ---------------------------------------------------------------- kiosk: the Enter hold

for (const disableShortcuts of [false, true]) {
  kioskCase(`kioskMode: holding Enter for 3 s shows the controls for 15 s (disableShortcuts ${disableShortcuts})`, { settings: seed({ kioskMode: true, disableShortcuts }), clock: { time: T0 } }, async ({ page, app }) => {
    await open(page, app, { pause: true });
    await page.keyboard.press('Enter'); // a tap is nothing
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter'); // auto-repeat does not restart the timer
    await page.clock.runFor(1500);
    await page.keyboard.up('Enter'); // released early
    await page.clock.runFor(4000);
    assert.equal((await controls(page)).visible, false, 'early release');

    await page.keyboard.down('Enter');
    await page.clock.runFor(1500);
    await page.keyboard.down('Enter');
    await page.clock.runFor(1400);
    assert.equal((await controls(page)).visible, false, 'not before 3 s');
    await page.clock.runFor(200);
    assert.deepEqual(await controls(page), { visible: true, inert: false }, 'shown at 3 s');
    await page.keyboard.up('Enter');
    await page.clock.runFor(14000);
    assert.equal((await controls(page)).visible, true);
    await page.clock.runFor(1100);
    assert.deepEqual(await controls(page), { visible: false, inert: true });
    check(`kiosk: Enter hold (disableShortcuts ${disableShortcuts})`);
  });
}

// The fake clock is paused here, so the 3.5 s "controls show for a moment" window cannot lapse by itself: every
// assertion is about state, never about a wall-clock window that a starved browser could overrun (a window that
// expires is not something to poll for). Time moves only when the case calls runFor.
kioskCase('kioskMode: the context menu is suppressed on the stage but not inside an open dialog (long-press paste in Settings)', { settings: seed({ kioskMode: true }) }, async ({ page, app }) => {
  await open(page, app);
  /** Fires a cancelable contextmenu on `sel`; true when something called preventDefault. */
  const prevented = (sel) =>
    page.evaluate((q) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      document.querySelector(q).dispatchEvent(e);
      return e.defaultPrevented;
    }, sel);
  assert.equal(await prevented('#stage'), true, 'on the stage');
  await page.keyboard.press('s');
  await page.waitForFunction(() => document.getElementById('settings').open);
  assert.equal(await prevented('#settings-form [name="serverUrl"]'), false, 'in a Settings field');
  assert.equal(await prevented('#settings-form [name="plexToken"]'), false, 'in the token field');
  assert.equal(await prevented('#settings'), false, 'on the sheet itself');
  assert.equal(await prevented('#stage'), true, 'the stage behind an open sheet is still covered');
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  assert.equal(await prevented('#stage'), true, 'after the sheet closes');
  check('kiosk: contextmenu suppressed outside dialogs only');
});

kioskCase('kioskMode: turning it on in Settings hides the controls at once; turning it off brings the normal behaviour back', { settings: seed(), clock: { time: T0 } }, async ({ page, app }) => {
  await open(page, app, { pause: true });
  await page.mouse.move(300, 300);
  assert.deepEqual(await controls(page), { visible: true, inert: false }, 'normal mode: pointer shows them');
  await page.keyboard.press('s');
  await page.waitForFunction(() => document.getElementById('settings').open);
  await page.check('#settings-form [name="kioskMode"]');
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  assert.deepEqual(await controls(page), { visible: false, inert: true }, 'hidden on save');
  await page.mouse.move(400, 400);
  await page.mouse.move(500, 300);
  assert.deepEqual(await controls(page), { visible: false, inert: true }, 'pointer no longer shows them');

  await page.keyboard.press('s'); // no PIN: the shortcut still opens Settings
  await page.waitForFunction(() => document.getElementById('settings').open);
  await page.uncheck('#settings-form [name="kioskMode"]');
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  assert.deepEqual(await controls(page), { visible: true, inert: false }, 'shown on save, focusable again');
  await page.mouse.move(640, 360); // off the controls: a pointer resting on them keeps them up
  await page.clock.runFor(3600);
  assert.deepEqual(await controls(page), { visible: false, inert: false }, 'and they idle away as before');
  await page.mouse.move(100, 100);
  await page.mouse.move(300, 200);
  assert.deepEqual(await controls(page), { visible: true, inert: false }, 'pointer shows them again');
  check('kiosk: toggled from Settings');
});

// ---------------------------------------------------------------- shortcuts

kioskCase('disableShortcuts ignores s, d, r, p, o, f and space (and the same keys work without it)', { settings: seed({ disableShortcuts: true }) }, async ({ page, app }) => {
  let shown = 0; // "Showing ..." is logged each time a poster is drawn; r draws a new one
  page.on('console', (m) => /\[poster\] Showing "/.test(m.text()) && shown++);
  await open(page, app);
  const probe = async (keys) => {
    await page.evaluate(() => {
      window.__fs = 0;
      document.documentElement.requestFullscreen = () => {
        window.__fs++;
        return Promise.resolve();
      };
    });
    const before = shown;
    for (const k of keys) await page.keyboard.press(k);
    await page.waitForTimeout(1200);
    return {
      ...(await page.evaluate(() => ({
        settings: document.getElementById('settings').open,
        diagnostics: document.getElementById('diagnostics').open,
        paused: document.querySelector('[data-action="pause"]').getAttribute('aria-pressed') === 'true',
        rotation: JSON.parse(localStorage.getItem('plexPoster.settings')).rotation ?? 0,
        fullscreen: window.__fs,
      }))),
      drawn: shown - before,
    };
  };
  const idle = await probe(['s', 'd', 'p', ' ', 'o', 'f', 'r', 'S', 'D', 'R', 'P', 'O', 'F']);
  assert.deepEqual(idle, { settings: false, diagnostics: false, paused: false, rotation: 0, fullscreen: 0, drawn: 0 });

  // Positive control: the very same keys do something when the setting is off.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plexPoster.settings'));
    s.disableShortcuts = false;
    localStorage.setItem('plexPoster.settings', JSON.stringify(s));
  });
  await page.reload();
  await posterShown(page);
  let drawn = 0;
  for (let i = 0; i < 20 && !drawn; i++) {
    drawn = (await probe(['r'])).drawn; // ignored while the first poster is still being drawn, so press until one is
  }
  assert.ok(drawn > 0, 'r draws a poster when shortcuts are on');
  await page.keyboard.press('f');
  assert.equal(await page.evaluate(() => window.__fs), 1, 'f goes full screen when shortcuts are on');
  await page.keyboard.press('o');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.settings')).rotation === 90);
  await page.keyboard.press('p');
  assert.equal(await page.evaluate(() => document.querySelector('[data-action="pause"]').getAttribute('aria-pressed')), 'true');
  await page.keyboard.press('d');
  await page.waitForFunction(() => document.getElementById('diagnostics').open);
  check('disableShortcuts: all seven keys ignored; positive control works');
});

// ---------------------------------------------------------------- the PIN gate

kioskCase('with a PIN set, s and the Settings button ask for it; wrong PIN keeps Settings closed; the right one opens it', { settings: seed(withPin) }, async ({ page, app }) => {
  await open(page, app);
  await page.keyboard.press('s');
  await waitPin(page);
  assert.equal(await isOpen(page, 'settings'), false, 'Settings is not open behind the PIN dialog');
  await enterPin(page, WRONG);
  await page.waitForFunction(() => document.getElementById('pin-error').textContent.length > 0);
  assert.equal(await isOpen(page, 'settings'), false, 'wrong PIN');
  assert.equal(await pinOpen(page), true, 'the dialog stays for another try');
  await page.click('#pin-cancel');
  await waitPin(page, false);
  assert.equal(await isOpen(page, 'settings'), false, 'cancel');

  await page.mouse.move(300, 300);
  await page.waitForFunction(() => document.getElementById('controls').classList.contains('visible'));
  await page.click('#controls [data-action="settings"]');
  await waitPin(page);
  assert.equal(await isOpen(page, 'settings'), false);
  await page.keyboard.press('Escape');
  await waitPin(page, false);
  assert.equal(await isOpen(page, 'settings'), false, 'Escape');

  await page.keyboard.press('s');
  await enterPin(page, PIN);
  await page.waitForFunction(() => document.getElementById('settings').open);
  assert.equal(await pinOpen(page), false);
  check('PIN gate: s, Settings button, wrong, cancel, Escape, correct');
});

kioskCase('every other way in asks for the PIN: d, synthetic data-action clicks, the empty-card button, the refresh button', { settings: seed(withPin) }, async ({ page, app }) => {
  await open(page, app);
  await page.keyboard.press('d');
  await waitPin(page);
  assert.equal(await isOpen(page, 'diagnostics'), false);
  await page.click('#pin-cancel');
  await waitPin(page, false);

  for (const action of ['settings', 'diagnostics']) {
    await page.evaluate((a) => document.querySelector(`#controls [data-action="${a}"]`).click(), action);
    await waitPin(page);
    assert.equal(await isOpen(page, action), false, `synthetic ${action} click`);
    await page.click('#pin-cancel');
    await waitPin(page, false);
    await page.evaluate((a) => document.querySelector(`#controls [data-action="${a}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true })), action);
    await waitPin(page);
    assert.equal(await isOpen(page, action), false, `dispatched ${action} click`);
    await page.click('#pin-cancel');
    await waitPin(page, false);
  }
  await page.evaluate(() => document.querySelector('#empty [data-action="settings"]').click());
  await waitPin(page);
  assert.equal(await isOpen(page, 'settings'), false, 'empty-card button');
  await page.click('#pin-cancel');
  await waitPin(page, false);

  // Two requests at once share one dialog.
  await page.evaluate(() => {
    document.querySelector('#controls [data-action="settings"]').click();
    document.querySelector('#controls [data-action="diagnostics"]').click();
    document.querySelector('#controls [data-action="settings"]').click();
  });
  await waitPin(page);
  await enterPin(page, PIN);
  await page.waitForFunction(() => document.getElementById('settings').open || document.getElementById('diagnostics').open);
  assert.equal(await pinOpen(page), false);
  check('PIN gate: d, synthetic clicks, empty card, concurrent requests');
});

kioskCase('kiosk + PIN at rotation 90: the corner hold, then the Settings button, shows a rotated PIN dialog inside the screen', { settings: seed({ kioskMode: true, rotation: 90, ...withPin }), clock: { time: T0 } }, async ({ page, app }) => {
  await open(page, app, { pause: true });
  await cornerHold(page, 90, { ms: 3100 });
  await page.mouse.up();
  assert.equal((await controls(page)).visible, true);
  await page.click('#controls [data-action="settings"]');
  await waitPin(page);
  const d = await pinDialog(page);
  assert.equal(d.angle, 90, `pin dialog angle ${d.angle}`);
  assert.ok(inside(d.box, 1280, 720), `pin dialog inside the viewport ${JSON.stringify(d.box)}`);
  assert.equal(await isOpen(page, 'settings'), false);
  // The keypad works at the rotated angle.
  await enterPin(page, WRONG);
  await page.waitForFunction(() => document.getElementById('pin-error').textContent.length > 0);
  await enterPin(page, PIN);
  await page.waitForFunction(() => document.getElementById('settings').open);
  check('PIN dialog rotates with the UI (90deg) and stays on screen');
});

kioskCase('the PIN dialog rotates (270) and stays on screen on a short landscape screen', { settings: seed({ rotation: 270, ...withPin }), viewport: { width: 844, height: 390 } }, async ({ page, app }) => {
  await open(page, app);
  await page.keyboard.press('s');
  await waitPin(page);
  const d = await pinDialog(page);
  assert.equal(d.angle, 270);
  assert.ok(inside(d.box, 844, 390), `inside the viewport ${JSON.stringify(d.box)}`);
  check('PIN dialog fits a short rotated screen');
});

kioskCase('the PIN dialog has an on-screen keypad that works by touch', { settings: seed(withPin), hasTouch: true }, async ({ page, app }) => {
  await open(page, app);
  await page.keyboard.press('s');
  await waitPin(page);
  for (const k of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', 'ok']) assert.equal(await page.locator(`#pin-dialog [data-key="${k}"]`).count(), 1, `key ${k}`);
  const size = await page.evaluate(() => {
    const r = document.querySelector('#pin-dialog [data-key="5"]').getBoundingClientRect();
    return Math.min(r.width, r.height);
  });
  assert.ok(size >= 44, `keys are at least 44 px (${size})`);
  await enterPin(page, '99', { tap: true, ok: false });
  await page.tap('#pin-dialog [data-key="back"]');
  await page.tap('#pin-dialog [data-key="back"]');
  await enterPin(page, WRONG, { tap: true });
  await page.waitForFunction(() => document.getElementById('pin-error').textContent.length > 0);
  assert.equal(await isOpen(page, 'settings'), false);
  await enterPin(page, PIN, { tap: true });
  await page.waitForFunction(() => document.getElementById('settings').open);
  check('PIN keypad by touch');
});

kioskCase('a lock stored a day ahead ends 15 minutes after it was first looked at, and a reload does not restart it', { settings: seed(withPin), clock: { time: T0 }, localStorage: { 'plexPoster.pinLock': JSON.stringify({ failures: 9, lockedUntil: new Date(T0).getTime() + 24 * 3600_000 }) } }, async ({ page, app }) => {
  const minutes = (n) => page.clock.fastForward(n * 60_000);
  const lockedUntil = async () => JSON.parse(await pinLockStored(page)).lockedUntil;
  await open(page, app);
  const first = await page.evaluate(() => Date.now());
  await page.keyboard.press('s');
  await waitPin(page);
  const seen = await page.evaluate(() => Date.now()); // the first look was between `first` and `seen`
  assert.match((await pinDialog(page)).error, /try again in 15 min/i);
  assert.ok((await lockedUntil()) <= seen + 15 * 60_000, 'the stored value was pulled in when first read');
  await page.click('#pin-cancel');

  await minutes(10); // a reload 10 minutes in: a power cycle, or a service-worker update
  await page.reload();
  await posterShown(page);
  assert.ok((await page.evaluate(() => Date.now())) >= first + 10 * 60_000, 'the clock went on across the reload');
  await page.keyboard.press('s');
  await waitPin(page);
  assert.match((await pinDialog(page)).error, /try again in \d+ min/i, 'still locked 10 minutes in');
  assert.ok((await lockedUntil()) <= seen + 15 * 60_000, 'the reload did not start a new 15 minutes');
  await page.click('#pin-cancel');
  await waitPin(page, false);

  await minutes(6); // 16 minutes after the first look: the lock is over, a reload did not restart it
  await page.keyboard.press('s');
  await enterPin(page, PIN);
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  check('a far-future stored lock ends 15 minutes after it was first read');
});

kioskCase('a physical keyboard types into the PIN dialog; the PIN dots never show the digits', { settings: seed(withPin) }, async ({ page, app }) => {
  await open(page, app);
  await page.keyboard.press('s');
  await waitPin(page);
  await page.keyboard.type('24');
  assert.equal(await page.evaluate(() => document.getElementById('pin-dots').textContent.replace(/\s/g, '').length), 2);
  assert.ok(!(await page.evaluate(() => document.getElementById('pin-dots').textContent)).match(/[0-9]/), 'dots hide the digits');
  await page.keyboard.type('68');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('settings').open);
  check('PIN by keyboard');
});

kioskCase('five wrong PINs lock the dialog; the lock survives a reload', { settings: seed(withPin) }, async ({ page, app }) => {
  await open(page, app);
  await page.keyboard.press('s');
  await waitPin(page);
  for (let i = 0; i < 5; i++) await enterPin(page, WRONG);
  const lock = await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.pinLock')));
  assert.equal(lock.failures, 5);
  assert.ok(lock.lockedUntil - Date.now() > 55_000 && lock.lockedUntil - Date.now() <= 60_000, `locked for ~60 s (${lock.lockedUntil - Date.now()})`);
  await enterPin(page, PIN); // the right PIN is refused while locked
  await page.waitForFunction(() => /try again|locked|wait/i.test(document.getElementById('pin-error').textContent));
  assert.equal(await isOpen(page, 'settings'), false, 'locked');

  await page.reload();
  await posterShown(page);
  await page.keyboard.press('s');
  await enterPin(page, PIN);
  await page.waitForFunction(() => /try again|locked|wait/i.test(document.getElementById('pin-error').textContent));
  assert.equal(await isOpen(page, 'settings'), false, 'still locked after reload');
  check('lockout persists across a reload');
});

kioskCase('a success clears the failures', { settings: seed(withPin) }, async ({ page, app }) => {
  await open(page, app);
  await page.keyboard.press('s');
  for (let i = 0; i < 3; i++) {
    await enterPin(page, WRONG);
    await page.waitForFunction(() => document.getElementById('pin-error').textContent.length > 0);
  }
  await enterPin(page, PIN);
  await page.waitForFunction(() => document.getElementById('settings').open);
  assert.equal(await page.evaluate(() => localStorage.getItem('plexPoster.pinLock')), null, 'lock record removed');
  check('lockout clears on success');
});

const pinLockStored = (page) => page.evaluate(() => localStorage.getItem('plexPoster.pinLock'));

kioskCase('a held Enter (key auto-repeat) that opens the PIN dialog, or an empty or short entry, is never counted as a wrong PIN', { settings: seed(withPin) }, async ({ page, app }) => {
  await open(page, app);
  await page.focus('#controls [data-action="settings"]');
  await page.keyboard.down('Enter'); // activates the focused Settings button, which opens the PIN dialog
  await waitPin(page);
  for (let i = 0; i < 8; i++) await page.keyboard.down('Enter'); // the rest of a held key: auto-repeat
  await page.keyboard.up('Enter');
  await page.waitForTimeout(200);
  assert.equal(await pinLockStored(page), null, 'a held Enter records no failure');
  assert.equal(await pinOpen(page), true, 'the dialog is still waiting for the PIN');
  assert.doesNotMatch((await pinDialog(page)).error, /too many|wrong/i);

  await page.keyboard.down('2'); // a held digit types one digit, not a stream
  for (let i = 0; i < 3; i++) await page.keyboard.down('2');
  await page.keyboard.up('2');
  assert.equal(await page.evaluate(() => document.getElementById('pin-dots').textContent.replace(/\s/g, '').length), 1, 'key auto-repeat is ignored in the dialog');
  await page.keyboard.press('Backspace');

  // OK with nothing typed, or fewer digits than a PIN can have, is a hint and not an attempt.
  for (let i = 0; i < 6; i++) await enterPin(page, '', { ok: true });
  await enterPin(page, '12');
  assert.match(await page.textContent('#pin-error'), /4 to 8 digits/i, 'a hint, not a verdict');
  assert.equal(await pinLockStored(page), null, 'empty and short entries record no failure');

  await enterPin(page, PIN);
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  assert.equal(await pinLockStored(page), null);
  check('a held Enter and empty or short entries never lock the PIN out');
});

kioskCase('the PIN dialog Cancel button is at least 48 px tall (a touch target)', { settings: seed(withPin), hasTouch: true }, async ({ page, app }) => {
  await open(page, app);
  await page.keyboard.press('s');
  await waitPin(page);
  const h = await page.evaluate(() => document.getElementById('pin-cancel').getBoundingClientRect().height);
  assert.ok(h >= 48, `Cancel is ${h} px tall`);
  await page.tap('#pin-cancel');
  await waitPin(page, false);
  check('PIN dialog Cancel is 48 px');
});

// ---------------------------------------------------------------- the token, import, export, reset

kioskCase('#token-toggle asks for the PIN and the field re-hides when the sheet closes', { settings: seed(withPin) }, async ({ page, app }) => {
  await open(page, app);
  await settingsOpenAfterPin(page);
  await page.evaluate(() => (document.getElementById('manual-connection').open = true));
  const type = () => page.$eval('#settings-form [name="plexToken"]', (e) => e.type);
  assert.equal(await type(), 'password');

  await page.click('#token-toggle');
  await waitPin(page);
  assert.equal(await type(), 'password', 'hidden while the PIN is asked');
  await page.click('#pin-cancel');
  await waitPin(page, false);
  assert.equal(await type(), 'password', 'cancel keeps it hidden');

  await page.click('#token-toggle');
  await enterPin(page, WRONG);
  await page.waitForFunction(() => document.getElementById('pin-error').textContent.length > 0);
  assert.equal(await type(), 'password', 'wrong PIN');
  await page.click('#pin-cancel');
  await waitPin(page, false);

  await page.evaluate(() => document.getElementById('token-toggle').click()); // synthetic click asks too
  await enterPin(page, PIN);
  await waitPin(page, false);
  assert.equal(await type(), 'text', 'revealed');
  assert.equal(await page.textContent('#token-toggle'), 'Hide');
  await page.click('#token-toggle'); // hiding needs no PIN
  assert.equal(await type(), 'password');
  assert.equal(await pinOpen(page), false);

  await page.click('#token-toggle');
  await enterPin(page, PIN);
  await waitPin(page, false);
  assert.equal(await type(), 'text');
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  assert.equal(await type(), 'password', 're-hidden on close');
  assert.equal(await page.textContent('#token-toggle'), 'Show');
  check('token reveal is gated and re-hides on close');
});

kioskCase('without a PIN the token toggle just works', { settings: seed() }, async ({ page, app }) => {
  await open(page, app);
  await page.keyboard.press('s');
  await page.waitForFunction(() => document.getElementById('settings').open);
  await page.evaluate(() => (document.getElementById('manual-connection').open = true));
  await page.click('#token-toggle');
  assert.equal(await page.$eval('#settings-form [name="plexToken"]', (e) => e.type), 'text');
  assert.equal(await pinOpen(page), false);
  check('no PIN, no prompt');
});

kioskCase('export never carries PIN material (also with the token); the token export asks for the PIN', { settings: seed(withPin) }, async ({ page, app }) => {
  await open(page, app);
  await settingsOpenAfterPin(page);

  const download = async (trigger) => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), trigger()]);
    return readFileSync(await dl.path(), 'utf8');
  };
  const plain = await download(() => page.click('#export-btn'));
  assert.equal(await pinOpen(page), false, 'a plain export needs no PIN');

  await page.check('#export-secrets');
  await page.click('#export-btn');
  await waitPin(page);
  await page.click('#pin-cancel');
  await waitPin(page, false);
  const withToken = await download(async () => {
    await page.click('#export-btn');
    await enterPin(page, PIN);
  });
  for (const [name, text] of [['plain', plain], ['with token', withToken]]) {
    const data = JSON.parse(text);
    assert.ok(!('settingsPinHash' in data.settings) && !('settingsPinSalt' in data.settings), `${name}: no PIN keys`);
    assert.ok(!text.includes(auth.hash) && !text.includes(auth.salt), `${name}: no PIN material anywhere`);
  }
  assert.equal(JSON.parse(withToken).settings.plexToken, 'demo-token');
  assert.equal(JSON.parse(plain).settings.plexToken, undefined);
  check('export has no PIN material; the token export is gated');
});

const importFile = (settings, extra = {}) => ({
  name: 'settings.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({ format: 'plex-poster-display/settings', version: 1, settings, ...extra })),
});
const FOREIGN = { settingsPinHash: 'ab'.repeat(32), settingsPinSalt: 'cd'.repeat(16) };

kioskCase('import asks for the PIN and ignores any PIN material in the file', { settings: seed(withPin) }, async ({ page, app }) => {
  await open(page, app);
  await settingsOpenAfterPin(page);
  const field = () => page.$eval('#settings-form [name="rotateSeconds"]', (e) => e.value);
  const before = await field();

  await page.setInputFiles('#import-file', importFile({ rotateSeconds: 123, ...FOREIGN }));
  await waitPin(page);
  assert.equal(await field(), before, 'nothing applied before the PIN');
  await page.click('#pin-cancel');
  await waitPin(page, false);
  assert.equal(await field(), before, 'cancelled import changes nothing');

  await page.setInputFiles('#import-file', importFile({ rotateSeconds: 123, ...FOREIGN }));
  await enterPin(page, PIN);
  await page.waitForFunction(() => document.querySelector('#settings-form [name="rotateSeconds"]').value === '123');
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  const s = await stored(page);
  assert.equal(s.rotateSeconds, 123, 'the rest of the file was imported');
  assert.equal(s.settingsPinHash, auth.hash, 'the PIN hash is still ours');
  assert.equal(s.settingsPinSalt, auth.salt, 'the PIN salt is still ours');

  await page.keyboard.press('s'); // and our PIN still opens Settings
  await enterPin(page, PIN);
  await page.waitForFunction(() => document.getElementById('settings').open);

  // A file that is only PIN material imports nothing.
  await page.setInputFiles('#import-file', importFile({ ...FOREIGN }));
  await enterPin(page, PIN);
  await page.waitForFunction(() => /Import failed/.test(document.getElementById('form-error').textContent));
  check('import is gated and its PIN material is ignored');
});

kioskCase('with no PIN set, an imported file cannot plant one', { settings: seed() }, async ({ page, app }) => {
  await open(page, app);
  await page.keyboard.press('s');
  await page.waitForFunction(() => document.getElementById('settings').open);
  await page.setInputFiles('#import-file', importFile({ rotateSeconds: 321, ...FOREIGN }));
  await page.waitForFunction(() => document.querySelector('#settings-form [name="rotateSeconds"]').value === '321');
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  const s = await stored(page);
  assert.equal(s.rotateSeconds, 321);
  assert.equal(s.settingsPinHash, '');
  assert.equal(s.settingsPinSalt, '');
  await page.keyboard.press('s');
  await page.waitForFunction(() => document.getElementById('settings').open);
  assert.equal(await pinOpen(page), false);
  check('imported PIN material ignored when no PIN is set');
});

kioskCase('Reset everything asks for the PIN first', { settings: seed(withPin) }, async ({ page, app }) => {
  await open(page, app);
  await settingsOpenAfterPin(page);
  let confirms = 0;
  page.on('dialog', (d) => {
    confirms++;
    d.dismiss();
  });
  await page.evaluate(() => document.getElementById('reset-btn').click());
  await waitPin(page);
  await page.click('#pin-cancel');
  await waitPin(page, false);
  assert.equal(confirms, 0, 'no confirm before the PIN');
  await page.click('#reset-btn');
  await enterPin(page, PIN);
  await page.waitForTimeout(300);
  assert.equal(confirms, 1, 'the confirm follows the PIN');
  assert.ok((await stored(page)).settingsPinHash, 'a dismissed confirm resets nothing');
  check('reset is gated');
});

// ---------------------------------------------------------------- setting, changing and removing the PIN

kioskCase('a PIN is set, changed and removed in Settings, and Settings says it is a deterrent', { settings: seed() }, async ({ page, app }) => {
  await open(page, app);
  await page.keyboard.press('s');
  await page.waitForFunction(() => document.getElementById('settings').open);
  assert.match(await page.textContent('#settings'), /deterrent/i);

  await page.click('#pin-set-btn');
  await enterPin(page, '12'); // too short
  await page.waitForFunction(() => document.getElementById('pin-error').textContent.length > 0);
  await page.click('#pin-cancel');
  await waitPin(page, false);

  await page.click('#pin-set-btn');
  await enterPin(page, '1357');
  await page.waitForFunction(() => /again|confirm/i.test(document.getElementById('pin-title').textContent));
  await enterPin(page, '1358'); // mismatch
  await page.waitForFunction(() => document.getElementById('pin-error').textContent.length > 0);
  assert.equal(await storedHash(page), '', 'nothing stored yet');
  await page.click('#pin-cancel');
  await waitPin(page, false);

  await page.click('#pin-set-btn');
  await enterPin(page, '1357');
  await page.waitForFunction(() => /again|confirm/i.test(document.getElementById('pin-title').textContent));
  await enterPin(page, '1357');
  await waitPin(page, false);
  assert.equal(await storedHash(page), '', 'applied on Save, not before');
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  const s = await stored(page);
  assert.match(s.settingsPinHash, /^[0-9a-f]{64}$/);
  assert.match(s.settingsPinSalt, /^[0-9a-f]{32}$/);
  assert.ok(!JSON.stringify(s).includes('1357'), 'the PIN itself is not stored');

  await page.keyboard.press('s');
  await enterPin(page, '1357');
  await page.waitForFunction(() => document.getElementById('settings').open);
  await page.click('#pin-clear-btn');
  await page.click('#settings-cancel'); // cancelled: the PIN stays
  await page.waitForFunction(() => !document.getElementById('settings').open);
  assert.ok((await stored(page)).settingsPinHash, 'Cancel keeps the PIN');

  await page.keyboard.press('s');
  await enterPin(page, '1357');
  await page.waitForFunction(() => document.getElementById('settings').open);
  await page.click('#pin-clear-btn');
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  assert.equal((await stored(page)).settingsPinHash, '');
  await page.keyboard.press('s');
  await page.waitForFunction(() => document.getElementById('settings').open);
  assert.equal(await pinOpen(page), false, 'no PIN, no prompt');
  check('PIN set / mismatch / too short / cancel / remove');
});

kioskCase('the live preview never changes the PIN or kiosk settings in force', { settings: seed(withPin) }, async ({ page, app }) => {
  await open(page, app);
  await settingsOpenAfterPin(page);
  await page.check('#settings-form [name="disableShortcuts"]');
  await page.click('#pin-clear-btn');
  await page.fill('#settings-form [name="posterScale"]', '90'); // a live control: previews the unsaved form
  await page.dispatchEvent('#settings-form [name="posterScale"]', 'input');
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  await page.keyboard.press('s'); // the saved PIN and shortcuts still apply
  await waitPin(page);
  assert.equal((await stored(page)).settingsPinHash, auth.hash);
  check('preview leaves the PIN alone');
});

// ---------------------------------------------------------------- recovery

const resetRoute = (context, body, status = 200) =>
  context.route('**/config.json', (route) => route.fulfill({ status, contentType: 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) }));

kioskCase('config.json {"resetPin": true} clears the PIN; Settings opens without it; Diagnostics warns', { settings: seed(withPin) }, async ({ page, context, app }) => {
  await resetRoute(context, { resetPin: true });
  await open(page, app);
  const s = await stored(page);
  assert.equal(s.settingsPinHash, '', 'hash cleared');
  assert.equal(s.settingsPinSalt, '', 'salt cleared');
  assert.ok(!(await page.evaluate(() => localStorage.getItem('plexPoster.settings'))).includes(auth.hash));
  await page.keyboard.press('s');
  await page.waitForFunction(() => document.getElementById('settings').open);
  assert.equal(await pinOpen(page), false, 'no PIN dialog');
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  await page.keyboard.press('d');
  await page.waitForFunction(() => document.getElementById('diagnostics').open);
  assert.match(await page.textContent('#diag-list'), /PIN reset flag present/);
  check('resetPin served: PIN cleared, Settings open, Diagnostics warns');
});

kioskCase('the reset flag is read on every load and honoured while it is served; Diagnostics stops warning when it is gone', { settings: seed(withPin) }, async ({ page, context, app }) => {
  let flag = false;
  await context.route('**/config.json', (route) =>
    flag ? route.fulfill({ contentType: 'application/json', body: '{"resetPin": true}' }) : route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }),
  );
  await open(page, app);
  assert.equal((await stored(page)).settingsPinHash, auth.hash, 'no flag: the PIN stays');
  await page.keyboard.press('s');
  await waitPin(page);
  await page.click('#pin-cancel');

  flag = true;
  await page.reload();
  await posterShown(page);
  assert.equal((await stored(page)).settingsPinHash, '', 'flag served on a later load (not the first run)');
  // A PIN that appears while the flag is served is cleared again by the next load.
  const fresh = await createPinAuth('9999');
  await page.evaluate(
    ([h, salt]) => {
      const s = JSON.parse(localStorage.getItem('plexPoster.settings'));
      localStorage.setItem('plexPoster.settings', JSON.stringify({ ...s, settingsPinHash: h, settingsPinSalt: salt }));
    },
    [fresh.hash, fresh.salt],
  );
  await page.reload();
  await posterShown(page);
  assert.equal((await stored(page)).settingsPinHash, '', 'cleared again while served');

  flag = false;
  await page.reload();
  await posterShown(page);
  await page.keyboard.press('d');
  await page.waitForFunction(() => document.getElementById('diagnostics').open);
  assert.doesNotMatch(await page.textContent('#diag-list'), /PIN reset flag/);
  check('reset flag: every load, while served');
});

kioskCase('the PIN stays without a true flag: {resetPin:false}, "true", 1, a 403 or 500 carrying the flag, a query string', { settings: seed(withPin) }, async ({ page, context, app }) => {
  const variants = [
    ['{"resetPin": false}', 200],
    ['{"resetPin": "true"}', 200],
    ['{"resetPin": 1}', 200],
    ['[{"resetPin": true}]', 200],
    ['not json', 200],
    ['{"resetPin": true}', 403],
    ['{"resetPin": true}', 500],
    ['', 404],
  ];
  let current = variants[0];
  await context.route('**/config.json', (route) => route.fulfill({ status: current[1], contentType: 'application/json', body: current[0] }));
  for (const v of variants) {
    current = v;
    await page.goto(app.url);
    await posterShown(page);
    assert.equal((await stored(page)).settingsPinHash, auth.hash, `kept for ${JSON.stringify(v)}`);
    await page.keyboard.press('s');
    await waitPin(page);
    assert.equal(await isOpen(page, 'settings'), false);
    await page.click('#pin-cancel');
    await waitPin(page, false);
  }
  current = variants[7];
  await page.goto(`${app.url}?resetPin=true&resetpin=1#resetPin`);
  await posterShown(page);
  assert.equal((await stored(page)).settingsPinHash, auth.hash, 'a URL cannot reset the PIN');
  await page.keyboard.press('d');
  await waitPin(page);
  await enterPin(page, PIN);
  await page.waitForFunction(() => document.getElementById('diagnostics').open);
  assert.doesNotMatch(await page.textContent('#diag-list'), /PIN reset flag/);
  check('no PIN reset without {"resetPin": true} from a 2xx config.json');
});

kioskCase('after a resetPin load the lockout is cleared for the session: a new PIN works at once and the failure count starts again', { settings: seed(withPin), localStorage: { 'plexPoster.pinLock': JSON.stringify({ failures: 9, lockedUntil: Date.now() + 14 * 60_000 }) } }, async ({ page, context, app }) => {
  await resetRoute(context, { resetPin: true });
  await open(page, app);
  assert.equal(await pinLockStored(page), null, 'the stored lock is gone');
  await page.keyboard.press('s');
  await page.waitForFunction(() => document.getElementById('settings').open);
  assert.equal(await pinOpen(page), false, 'no PIN while the flag is served');
  await page.click('#pin-set-btn');
  await enterPin(page, '1357');
  await page.waitForFunction(() => /again|confirm/i.test(document.getElementById('pin-title').textContent));
  await enterPin(page, '1357');
  await waitPin(page, false);
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);

  await page.keyboard.press('s');
  await enterPin(page, WRONG); // one wrong PIN: the old 9 failures and 14 min are gone
  await page.waitForFunction(() => document.getElementById('pin-error').textContent.length > 0);
  const err = await page.textContent('#pin-error');
  assert.match(err, /wrong pin/i);
  assert.doesNotMatch(err, /too many/i, 'one wrong PIN does not lock');
  assert.equal(JSON.parse(await pinLockStored(page)).failures, 1, 'the failure count restarted');
  await enterPin(page, '1357');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  check('resetPin: the lockout is cleared for the session');
});

kioskCase('a PIN prompt open while the boot reset clears the PIN is cancelled: nothing counted, and Settings opens without a PIN', { settings: seed(withPin) }, async ({ page, context, app }) => {
  let release;
  const gate = new Promise((r) => (release = r));
  await context.route('**/config.json', async (route) => {
    await gate; // config.json is slow: the boot is still waiting for it
    await route.fulfill({ contentType: 'application/json', body: '{"resetPin": true}' });
  });
  await page.goto(app.url);
  await page.keyboard.press('s');
  await waitPin(page);
  await page.click('#pin-dialog [data-key="1"]'); // an entry in progress
  assert.ok((await stored(page)).settingsPinHash, 'the PIN is still set while config.json is awaited');
  release();
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('plexPoster.settings')).settingsPinHash, null, { timeout: 8000 });
  await waitPin(page, false); // the prompt is cancelled, not left asking for a PIN that no longer exists
  assert.equal(await pinLockStored(page), null, 'no failure counted');
  assert.equal(await isOpen(page, 'settings'), false, 'a cancelled prompt opens nothing');
  await posterShown(page);
  await page.keyboard.press('s');
  await page.waitForFunction(() => document.getElementById('settings').open, null, { timeout: 5000 });
  assert.equal(await pinOpen(page), false, 'no PIN dialog');
  assert.equal(await pinLockStored(page), null);
  check('resetPin cancels an open PIN prompt');
});

kioskCase('a first run still takes its settings from config.json', { settings: () => ({}) }, async ({ page, context, app }) => {
  await context.addInitScript(() => localStorage.removeItem('plexPoster.settings'));
  await resetRoute(context, { resetPin: true, serverName: 'Provisioned', rotateSeconds: 777 });
  await page.goto(app.url);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('plexPoster.settings') || 'null')?.rotateSeconds === 777, null, { timeout: 8000 });
  check('first-run provisioning is unchanged');
});

// ---------------------------------------------------------------- sleep keeps swallowing the waking press

kioskCase('a press that wakes the display is swallowed, PIN or not; the next one reaches the gate', { settings: seed({ sleepEnabled: true, ...withPin }), clock: { time: '2026-01-05T03:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForFunction(() => document.body.classList.contains('asleep'), null, { timeout: 15000 });
  await page.keyboard.press('s');
  await page.waitForFunction(() => !document.body.classList.contains('asleep'));
  assert.equal(await pinOpen(page), false, 'the waking key press was swallowed');
  await page.keyboard.press('s');
  await waitPin(page);
  check('sleep swallowing still holds with the PIN gate');
});

kioskCase('an Enter held through a wake from sleep does not reveal the controls; a fresh hold afterwards does', { settings: seed({ kioskMode: true, sleepEnabled: true }), clock: { time: '2026-01-05T03:00:00' } }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForFunction(() => document.body.classList.contains('asleep'), null, { timeout: 15000 });
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 1000));
  await page.keyboard.down('Enter'); // wakes the display and is swallowed
  await page.waitForFunction(() => !document.body.classList.contains('asleep'));
  await page.keyboard.down('Enter'); // the rest of the held key: auto-repeat
  await page.clock.runFor(1500);
  await page.keyboard.down('Enter');
  await page.clock.runFor(2000);
  assert.equal((await controls(page)).visible, false, 'a hold that began asleep reveals nothing');
  await page.keyboard.up('Enter');

  await page.keyboard.down('Enter'); // a hold that begins awake still works
  await page.clock.runFor(3100);
  assert.deepEqual(await controls(page), { visible: true, inert: false });
  await page.keyboard.up('Enter');
  check('Enter held through a wake does not reveal the controls');
});

// ---------------------------------------------------------------- run

async function runPool(list, size) {
  const queue = [...list];
  const failures = [];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) {
        const c = queue.shift();
        try {
          await withApp(c.opts, c.fn);
          console.log(`PASS ${c.name}`);
        } catch (e) {
          console.log(`FAIL ${c.name}\n${e.stack || e}`);
          failures.push(c.name);
        }
      }
    }),
  );
  return failures;
}

// KIOSK_ONLY=<substring> runs just the matching cases; KIOSK_POOL=<n> sets how many run side by side.
const only = process.env.KIOSK_ONLY;
const selected = only ? cases.filter((c) => c.name.includes(only)) : cases;
const failures = await runPool(selected, Number(process.env.KIOSK_POOL || 4));
if (failures.length) {
  console.log(`${failures.length} of ${selected.length} kiosk cases failed`);
  process.exit(1);
}
console.log(`all ${selected.length} kiosk cases passed`);
