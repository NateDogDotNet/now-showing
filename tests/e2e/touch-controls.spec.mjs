// Touch controls, labels and the shortcuts overlay (R-CTRL-1..3, U11-U13).
//   - the first touch on hidden controls only wakes them; a second tap acts (U12), and the rule never reaches
//     Settings or other dialogs, the empty card's buttons, a mouse, or the sleep veil's wake;
//   - control labels: a text label under each icon on `(hover: none)`, a tooltip on hover/focus on desktop, `always` / `never`;
//   - `?` opens a dialog generated from js/shortcuts.js; Esc closes it; `disableShortcuts` silences it;
//   - K36: in kiosk mode the long-press menu stays suppressed on the PIN keypad and other dialogs, but not in text fields.
// Every case names pixelShift: false (convention 7) and runs against its own mock server. A tap on a hidden control
// uses page.touchscreen.tap(x, y): page.tap(selector) waits for a hit target, and a hidden control has none.

import assert from 'node:assert/strict';
import { createPinAuth } from '../../js/kiosk.js';
import { defaults } from '../../js/settings.js';
import { listShortcuts } from '../../js/shortcuts.js';
import { withApp } from './lib.mjs';

const check = (name) => console.log(`  ok  ${name}`);
const cases = [];
const touchCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], ...opts }, fn });

const PHONE = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };
const TOUCH = { hasTouch: true, isMobile: true, viewport: PHONE };
const ACTIONS = ['settings', 'diagnostics', 'refresh', 'pause', 'pin', 'rotate', 'fullscreen'];

const seed =
  (extra = {}) =>
  (app) => ({
    plexToken: 'demo-token',
    serverUrl: `http://127.0.0.1:${app.mockPort}`,
    libraryKey: '1',
    showNowPlaying: false,
    rotateSeconds: 3600,
    pixelShift: false,
    ...extra,
  });

const posterShown = (page) =>
  page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
const animationsDone = (page) => page.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 15000 });

/** The boot wake has run and the controls have gone idle again (body.idle is only ever added by hideControls). */
const waitIdle = (page) =>
  page.waitForFunction(() => document.body.classList.contains('idle') && !document.getElementById('controls').classList.contains('visible'), null, { timeout: 15000 });
const controlsVisible = (page) => page.evaluate(() => document.getElementById('controls').classList.contains('visible'));
const isOpen = (page, id) => page.evaluate((i) => document.getElementById(i).open, id);
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings') || '{}'));
const until = async (fn, what, timeout = 6000) => {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > timeout) assert.fail(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 40));
  }
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** The centre of a control button on screen (works while the controls are hidden: only pointer-events are off). */
const centreOf = (page, selector) =>
  page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
const tapAt = async (page, selector) => {
  const { x, y } = await centreOf(page, selector);
  await page.touchscreen.tap(x, y);
};

/** Loads a configured display and waits until its controls have hidden themselves. */
async function openIdle(page, app) {
  await page.goto(app.url);
  await posterShown(page);
  await waitIdle(page);
}

const angleOf = (page, selector) =>
  page.$eval(selector, (el) => {
    const m = getComputedStyle(el).transform.match(/matrix\(([^)]+)\)/);
    if (!m) return 0;
    const [a, b] = m[1].split(',').map(Number);
    return ((Math.round((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360;
  });
const boxOf = (page, selector) =>
  page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
const inside = (b, w, h) => b.left >= -1 && b.top >= -1 && b.right <= w + 1 && b.bottom <= h + 1;

// ---------------------------------------------------------------- U12: the first tap only wakes the controls

const effects = {
  settings: { done: (page) => isOpen(page, 'settings'), expect: true },
  pin: { done: async (page) => Boolean((await stored(page)).staticRatingKey), expect: true },
  rotate: { done: async (page) => (await stored(page)).rotation ?? 0, expect: 90 },
};
for (const action of ['settings', 'pin', 'rotate']) {
  touchCase(`U12 a touch tap on the hidden ${action} button only reveals the controls; the second tap acts`, { ...TOUCH, settings: seed() }, async ({ page, app }) => {
    await openIdle(page, app);
    const effect = effects[action];
    const before = await effect.done(page);
    await tapAt(page, `#controls [data-action="${action}"]`);
    await until(() => controlsVisible(page), 'the first tap to reveal the controls');
    await pause(400); // a swallowed click must stay swallowed: give a wrongly delivered one time to land
    assert.equal(await effect.done(page), before, `the first tap did not ${action}`);
    assert.equal(await controlsVisible(page), true, 'the controls are showing');
    await animationsDone(page);
    await page.tap(`#controls [data-action="${action}"]`);
    await until(async () => (await effect.done(page)) === effect.expect, `the second tap to ${action}`);
    check(`U12 ${action}: first tap reveals only, second tap acts`);
  });
}

touchCase('U12 a tap on the bare stage reveals the controls and nothing else happens; the next tap on a visible control acts', { ...TOUCH, settings: seed() }, async ({ page, app }) => {
  await openIdle(page, app);
  await page.touchscreen.tap(PHONE.width / 2, 200);
  await until(() => controlsVisible(page), 'the stage tap to reveal the controls');
  await animationsDone(page);
  assert.equal(await isOpen(page, 'settings'), false);
  await page.tap('#controls [data-action="settings"]');
  await until(() => isOpen(page, 'settings'), 'Settings to open on the tap after the reveal');
  check('U12 stage tap reveals; the next tap acts');
});

// ---------------------------------------------------------------- U12: no swallow outside the rule

touchCase('U12 Settings open for longer than the hide delay: a touch tap on Save works on the first tap', { ...TOUCH, settings: seed() }, async ({ page, app }) => {
  await openIdle(page, app);
  await page.keyboard.press('s'); // opens Settings; its key press wakes the controls, which then hide again behind the sheet
  await until(() => isOpen(page, 'settings'), 'Settings to open');
  await waitIdle(page);
  await page.tap('#settings-save');
  await until(async () => !(await isOpen(page, 'settings')), 'Save to close Settings on the first tap');
  assert.equal((await stored(page)).libraryKey, '1', 'the save went through');
  check('U12 Save works on the first tap with the controls hidden');
});

touchCase('U12 a dialog other than Settings keeps its first tap too (Diagnostics Close)', { ...TOUCH, settings: seed() }, async ({ page, app }) => {
  await openIdle(page, app);
  await page.keyboard.press('d');
  await until(() => isOpen(page, 'diagnostics'), 'Diagnostics to open');
  await waitIdle(page);
  await page.tap('#diag-close');
  await until(async () => !(await isOpen(page, 'diagnostics')), 'Close to work on the first tap');
  check('U12 Diagnostics Close works on the first tap');
});

touchCase("U12 the empty-state card's Open settings works on the first tap", { ...TOUCH, settings: { pixelShift: false } }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForFunction(() => !document.getElementById('empty').hidden, null, { timeout: 15000 });
  await waitIdle(page);
  assert.equal(await controlsVisible(page), false);
  await page.tap('#empty [data-action="settings"]');
  await until(() => isOpen(page, 'settings'), 'Settings to open on the first tap');
  check('U12 Open settings works on the first tap');
});

touchCase('U12 a mouse click on a visible button works on the first click', { settings: seed() }, async ({ page, app }) => {
  await openIdle(page, app);
  await page.mouse.move(600, 300);
  await until(() => controlsVisible(page), 'the mouse to reveal the controls');
  await animationsDone(page);
  await page.click('#controls [data-action="settings"]');
  await until(() => isOpen(page, 'settings'), 'Settings to open on the first click');
  check('U12 a mouse click acts at once');
});

touchCase('U12 a keyboard activation of a control is never swallowed', { settings: seed() }, async ({ page, app }) => {
  await openIdle(page, app);
  await page.keyboard.press('Tab'); // wakes the controls and focuses the first button
  await until(() => controlsVisible(page), 'a key to reveal the controls');
  await page.keyboard.press('Enter');
  await until(() => isOpen(page, 'settings'), 'Enter on the focused Settings button');
  check('U12 keyboard activation unaffected');
});

const SLEEP_START = '2026-01-05T03:00:00'; // inside the default 01:00-07:00 window
touchCase('U12 a tap while the sleep veil is up wakes the display and triggers no control', { ...TOUCH, settings: seed({ sleepEnabled: true }), clock: { time: SLEEP_START } }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForFunction(() => document.body.classList.contains('asleep') && !document.getElementById('sleep-veil').hidden, null, { timeout: 15000 });
  const { x, y } = await centreOf(page, '#controls [data-action="settings"]');
  await page.touchscreen.tap(x, y);
  await page.waitForFunction(() => !document.body.classList.contains('asleep'), null, { timeout: 5000 });
  await pause(600);
  assert.equal(await page.isVisible('#sleep-veil'), false, 'the veil is gone');
  assert.equal(await isOpen(page, 'settings'), false, 'the tap did not open Settings');
  assert.equal(await page.getAttribute('#controls [data-action="pause"]', 'aria-pressed'), 'false');
  check('U12 sleep: the waking tap only wakes');
});

// ---------------------------------------------------------------- U11: labels

const labelsOf = (page) =>
  page.$$eval('#controls button', (buttons) =>
    buttons.map((b) => {
      const label = b.querySelector('.label');
      const svg = b.querySelector('svg').getBoundingClientRect();
      const r = label ? label.getBoundingClientRect() : null;
      return {
        action: b.dataset.action,
        aria: b.getAttribute('aria-label'),
        text: label ? label.textContent.trim() : null,
        display: label ? getComputedStyle(label).display : null,
        top: r?.top,
        left: r?.left,
        right: r?.right,
        bottom: r?.bottom,
        svgBottom: svg.bottom,
        svgCentre: svg.x + svg.width / 2,
        shown: Boolean(label && getComputedStyle(label).display !== 'none' && r.width > 0 && r.height > 0),
      };
    }),
  );
const revealControls = async (page) => {
  await page.mouse.move(600, 300);
  await until(() => controlsVisible(page), 'the controls to show');
  await animationsDone(page);
};

/** Every one of the 7 buttons shows a text label below its icon, centred under it, and the label is part of the accessible name. */
function assertStacked(rows, where) {
  assert.deepEqual(rows.map((r) => r.action), ACTIONS, `${where}: seven buttons`);
  for (const r of rows) {
    assert.equal(r.shown, true, `${where}: ${r.action} shows a label`);
    assert.ok(r.text, `${where}: ${r.action} label has text`);
    assert.ok(r.top >= r.svgBottom - 1, `${where}: ${r.action} label (${r.top}) is under the icon (${r.svgBottom})`);
    assert.ok(Math.abs((r.left + r.right) / 2 - r.svgCentre) <= 2, `${where}: ${r.action} label is centred under the icon`);
    assert.ok(r.aria.toLowerCase().includes(r.text.toLowerCase()), `${where}: label "${r.text}" is part of the accessible name "${r.aria}"`);
  }
}

touchCase('U11 (hover: none): a text label under each of the 7 icons, and the bar fits a phone', { ...TOUCH, settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  assert.equal(await page.evaluate(() => matchMedia('(hover: none)').matches), true, 'the context really is (hover: none)');
  await page.touchscreen.tap(PHONE.width / 2, 200);
  await until(() => controlsVisible(page), 'the controls to show');
  await animationsDone(page);
  assertStacked(await labelsOf(page), 'phone');
  const bar = await boxOf(page, '#controls');
  assert.ok(inside(bar, PHONE.width, PHONE.height), `the bar fits the phone: ${JSON.stringify(bar)}`);
  for (const sel of ['#controls button']) {
    for (const b of await page.$$eval(sel, (els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
      assert.ok(inside(b, PHONE.width, PHONE.height), `each button fits: ${JSON.stringify(b)}`);
      assert.ok(b.width >= 44 && b.height >= 44, `each button is at least 44 px: ${b.width}x${b.height}`);
    }
  }
  check('U11 touch: labels under all 7 icons; the bar wraps inside the phone');
});

touchCase('U11 (hover: none) at rotation 90 on a landscape phone: labels shown, bar inside the screen', { hasTouch: true, isMobile: true, viewport: PHONE_LANDSCAPE, settings: seed({ rotation: 90 }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await page.touchscreen.tap(PHONE_LANDSCAPE.width / 2, 100);
  await until(() => controlsVisible(page), 'the controls to show');
  await animationsDone(page);
  assert.equal(await angleOf(page, '#controls'), 90, 'the bar rotates with the UI');
  const bar = await boxOf(page, '#controls');
  assert.ok(inside(bar, PHONE_LANDSCAPE.width, PHONE_LANDSCAPE.height), `the bar is inside the screen at rotation 90: ${JSON.stringify(bar)}`);
  const rows = await labelsOf(page);
  for (const r of rows) assert.equal(r.shown, true, `${r.action} label shown`);
  check('U11 rotation 90: labels and bar inside the screen');
});

touchCase('U11 desktop: no persistent label; a tooltip on hover and on keyboard focus', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  assert.equal(await page.evaluate(() => matchMedia('(hover: none)').matches), false);
  await revealControls(page);
  let rows = await labelsOf(page);
  assert.deepEqual(rows.map((r) => r.action), ACTIONS);
  for (const r of rows) {
    assert.equal(r.shown, false, `${r.action}: no persistent label at rest`);
    assert.ok(r.text, `${r.action} still has its label text for the tooltip`);
  }
  // Hover: that button's tooltip, and only that one.
  await page.hover('#controls [data-action="diagnostics"]');
  rows = await labelsOf(page);
  assert.deepEqual(rows.filter((r) => r.shown).map((r) => r.action), ['diagnostics'], 'hover shows exactly one tooltip');
  const tip = rows.find((r) => r.action === 'diagnostics');
  assert.match(tip.text, /Diagnostics/i);
  const bar = await boxOf(page, '#controls');
  assert.ok(tip.bottom <= bar.top + 1, 'the tooltip sits above the bar, not inside the layout of the buttons');
  assert.ok(tip.right <= 1280 && tip.left >= 0, 'and on screen');
  // Away from the buttons: gone again.
  await page.mouse.move(600, 300);
  await pause(100);
  assert.equal((await labelsOf(page)).filter((r) => r.shown).length, 0, 'the tooltip goes with the pointer');
  // Keyboard focus: Tab to a button.
  let focused = '';
  for (let i = 0; i < 4 && !focused; i++) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => document.activeElement?.closest('#controls') && document.activeElement.dataset.action);
  }
  assert.ok(focused, 'Tab reached a control');
  rows = await labelsOf(page);
  assert.deepEqual(rows.filter((r) => r.shown).map((r) => r.action), [focused], 'focus shows that button\'s tooltip');
  check('U11 desktop: tooltip on hover and focus, no persistent label');
});

touchCase("U11 controlLabels 'always' shows the labels on desktop too", { settings: seed({ controlLabels: 'always' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await revealControls(page);
  assertStacked(await labelsOf(page), 'desktop always');
  check("U11 'always' shows labels on desktop");
});

touchCase("U11 controlLabels 'never' shows no label on touch and no tooltip on desktop", { ...TOUCH, settings: seed({ controlLabels: 'never' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await page.touchscreen.tap(PHONE.width / 2, 200);
  await until(() => controlsVisible(page), 'the controls to show');
  await animationsDone(page);
  assert.equal((await labelsOf(page)).filter((r) => r.shown).length, 0, "no label on touch with 'never'");
  const bar = await boxOf(page, '#controls');
  assert.ok(inside(bar, PHONE.width, PHONE.height));
  check("U11 'never' on touch");
});

touchCase("U11 controlLabels 'never' shows no tooltip on desktop", { settings: seed({ controlLabels: 'never' }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await revealControls(page);
  await page.hover('#controls [data-action="settings"]');
  assert.equal((await labelsOf(page)).filter((r) => r.shown).length, 0, "no tooltip with 'never'");
  check("U11 'never' on desktop");
});

// ---------------------------------------------------------------- U13: the shortcuts overlay

const shortcutRows = (page) =>
  page.$$eval('#shortcuts [data-shortcut]', (rows) => rows.map((r) => ({ key: r.dataset.shortcut, text: r.textContent.replace(/\s+/g, ' ').trim() })));

touchCase('U13 ? opens the shortcuts dialog listing the table; Esc closes it', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  assert.equal(await isOpen(page, 'shortcuts'), false);
  await page.keyboard.press('?');
  await until(() => isOpen(page, 'shortcuts'), 'the dialog to open');
  const rows = await shortcutRows(page);
  const table = listShortcuts(defaults());
  assert.ok(rows.length >= 8, `${rows.length} entries`);
  assert.deepEqual(rows.map((r) => r.key), table.map((s) => s.key), 'one row per table entry, in table order');
  for (const s of table) {
    const row = rows.find((r) => r.key === s.key);
    assert.ok(row.text.includes(s.label), `row ${s.key} shows "${s.label}": "${row.text}"`);
  }
  assert.equal(await page.evaluate(() => document.querySelector('#shortcuts').matches(':modal')), true, 'a modal dialog (top layer)');
  await page.keyboard.press('Escape');
  await until(async () => !(await isOpen(page, 'shortcuts')), 'Esc to close it');
  // The keys the table lists still work (KEYS is built from it).
  await page.keyboard.press(' ');
  await until(async () => (await page.getAttribute('#controls [data-action="pause"]', 'aria-pressed')) === 'true', 'space to pause');
  await page.keyboard.press('p');
  await until(async () => (await page.getAttribute('#controls [data-action="pause"]', 'aria-pressed')) === 'false', 'p to resume');
  check(`U13 ? lists ${rows.length} shortcuts from the table; Esc closes; space and p still pause`);
});

for (const [rotation, viewport] of [
  [90, { width: 1280, height: 720 }],
  [270, { width: 1280, height: 720 }],
  [0, PHONE],
]) {
  touchCase(`U13 the shortcuts dialog at rotation ${rotation} (${viewport.width}x${viewport.height}) is rotated with the UI and inside the screen`, { viewport, settings: seed({ rotation }) }, async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    await animationsDone(page);
    await page.keyboard.press('?');
    await until(() => isOpen(page, 'shortcuts'), 'the dialog to open');
    await animationsDone(page);
    assert.equal(await angleOf(page, '#shortcuts'), rotation, 'computed transform angle');
    const box = await boxOf(page, '#shortcuts');
    assert.ok(inside(box, viewport.width, viewport.height), `inside the viewport: ${JSON.stringify(box)}`);
    assert.ok(box.width > 100 && box.height > 100, 'and has a real size');
    check(`U13 rotation ${rotation}: angle and bounds`);
  });
}

touchCase('U13 with disableShortcuts ? does nothing', { settings: seed({ disableShortcuts: true }) }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await page.keyboard.press('?');
  await pause(400);
  assert.equal(await isOpen(page, 'shortcuts'), false, 'the dialog stays closed');
  assert.equal(await page.evaluate(() => document.querySelector('dialog[open]') === null), true, 'no dialog opened at all');
  check('U13 disableShortcuts: ? does nothing');
});

/** Opens Diagnostics by touch (first tap reveals the controls, second opens), so it works with the shortcuts off. */
async function openDiagnosticsByTouch(page, app) {
  await openIdle(page, app);
  await tapAt(page, '#controls [data-action="diagnostics"]');
  await until(() => controlsVisible(page), 'the controls to appear');
  await tapAt(page, '#controls [data-action="diagnostics"]');
  await until(() => isOpen(page, 'diagnostics'), 'Diagnostics to open');
}

touchCase('R-CTRL-3 the Diagnostics "Keyboard shortcuts" button opens #shortcuts by touch', { ...TOUCH, settings: seed() }, async ({ page, app }) => {
  await openDiagnosticsByTouch(page, app);
  assert.equal(await isOpen(page, 'shortcuts'), false);
  await tapAt(page, '#diag-shortcuts');
  await until(() => isOpen(page, 'shortcuts'), 'the shortcuts dialog to open');
  const rows = await shortcutRows(page);
  assert.ok(rows.length >= 8, `${rows.length} entries`);
  assert.deepEqual(rows.map((r) => r.key), listShortcuts(defaults()).map((s) => s.key), 'the same list as ?');
  await page.keyboard.press('Escape');
  await until(async () => !(await isOpen(page, 'shortcuts')), 'Esc to close it');
  check(`R-CTRL-3 Diagnostics button: touch tap opens #shortcuts with ${rows.length} entries`);
});

touchCase('R-CTRL-3 with disableShortcuts the Diagnostics shortcuts button is hidden', { ...TOUCH, settings: seed({ disableShortcuts: true }) }, async ({ page, app }) => {
  await openDiagnosticsByTouch(page, app);
  const shown = await page.evaluate(() => {
    const b = document.getElementById('diag-shortcuts');
    return !!b && b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden';
  });
  assert.equal(shown, false, 'the button is absent or hidden');
  check('R-CTRL-3 Diagnostics button hidden with disableShortcuts');
});

touchCase('U13 ? typed into a text field is text, not a shortcut', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await page.keyboard.press('s');
  await until(() => isOpen(page, 'settings'), 'Settings to open');
  await page.evaluate(() => (document.getElementById('manual-connection').open = true));
  await page.fill('#settings-form [name="serverUrl"]', '');
  await page.click('#settings-form [name="serverUrl"]');
  await page.keyboard.press('?');
  assert.equal(await isOpen(page, 'shortcuts'), false);
  assert.equal(await page.inputValue('#settings-form [name="serverUrl"]'), '?');
  check('U13 ? in a field types');
});

// ---------------------------------------------------------------- r3: K58, TLM1-TLM4

touchCase('K58 unconfigured display: a touch tap on the #empty backdrop where the hidden Rotate button sits only reveals the bar; Open settings still works on the first tap', { ...TOUCH, settings: { pixelShift: false } }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForFunction(() => !document.getElementById('empty').hidden, null, { timeout: 15000 });
  await waitIdle(page);
  const { x, y } = await centreOf(page, '#controls [data-action="rotate"]');
  assert.equal(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.id, [x, y]), 'empty', 'the hidden Rotate button sits under the #empty backdrop');
  await page.touchscreen.tap(x, y);
  await until(() => controlsVisible(page), 'the first tap to reveal the bar');
  await pause(400);
  assert.equal((await stored(page)).rotation ?? 0, 0, 'the first tap did not rotate');
  await animationsDone(page);
  await page.tap('#controls [data-action="rotate"]');
  await until(async () => (await stored(page)).rotation === 90, 'the second tap to rotate');
  check('K58 empty backdrop: first tap reveals only, second tap rotates');
});

touchCase('K58 the empty card itself is not swallowed: Open settings after the bar hid works on the first tap (backdrop rule leaves the card alone)', { ...TOUCH, settings: { pixelShift: false } }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForFunction(() => !document.getElementById('empty').hidden, null, { timeout: 15000 });
  await waitIdle(page);
  await page.tap('#empty [data-action="settings"]');
  await until(() => isOpen(page, 'settings'), 'Settings to open on the first tap');
  check('K58 Open settings first tap');
});

touchCase('TLM2 a touch press that yields no click, then Enter on a focused control button: the button acts', { settings: seed() }, async ({ page, app }) => {
  await openIdle(page, app);
  await page.evaluate(() =>
    document.getElementById('stage').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, cancelable: true })),
  ); // a press with no click after it (a long press into a context menu, say)
  await until(() => controlsVisible(page), 'the press to reveal the controls');
  await page.focus('#controls [data-action="settings"]');
  await page.keyboard.press('Enter');
  await until(() => isOpen(page, 'settings'), 'Enter on the focused Settings button');
  check('TLM2 keyboard Enter after an orphaned touch press acts');
});

touchCase('TLM1 Settings has a Control labels select (Auto / Always / Never); choosing Always shows labels on desktop after Save', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await page.keyboard.press('s');
  await until(() => isOpen(page, 'settings'), 'Settings to open');
  const options = await page.$$eval('#settings-form select[name="controlLabels"] option', (os) => os.map((o) => o.value));
  assert.deepEqual(options, ['auto', 'always', 'never']);
  assert.equal(await page.inputValue('#settings-form select[name="controlLabels"]'), 'auto');
  await page.selectOption('#settings-form select[name="controlLabels"]', 'always');
  await page.click('#settings-save');
  await until(async () => !(await isOpen(page, 'settings')), 'Save to close Settings');
  assert.equal((await stored(page)).controlLabels, 'always');
  await revealControls(page);
  assertStacked(await labelsOf(page), 'desktop after Save');
  check('TLM1 Control labels select: Always shows labels on desktop');
});

touchCase('TLM3 the O key cap in the shortcuts dialog cannot be read as a zero', { settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await page.keyboard.press('?');
  await until(() => isOpen(page, 'shortcuts'), 'the dialog to open');
  const cap = await page.$eval('#shortcuts [data-shortcut="o"] kbd', (k) => ({ text: k.textContent, aria: k.getAttribute('aria-label') }));
  assert.equal(cap.text, 'o', 'a lower-case o, not a capital that looks like 0');
  assert.match(cap.aria || '', /letter o/i, 'with an accessible "letter O" label');
  check('TLM3 O cap shows o with a "letter O" label');
});

touchCase('TLM4 opening Diagnostics does not put first focus on the Keyboard shortcuts button', { viewport: { width: 1920, height: 1080 }, settings: seed() }, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await page.keyboard.press('d');
  await until(() => isOpen(page, 'diagnostics'), 'Diagnostics to open');
  const active = await page.evaluate(() => document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName);
  assert.notEqual(active, 'diag-shortcuts', 'the shortcuts button does not take the initial focus');
  assert.equal(active, 'diag-copy', 'first focus stays where it was before the button existed (Copy)');
  check(`TLM4 Diagnostics first focus: ${active}`);
});

// ---------------------------------------------------------------- K36: long-press menu in kiosk mode

const PIN = '2468';
const pinAuth = await createPinAuth(PIN);
touchCase(
  'K36 kiosk: the context menu is prevented on the stage, the PIN keypad and Diagnostics, and not in Settings text fields',
  { settings: seed({ kioskMode: true, settingsPinHash: pinAuth.hash, settingsPinSalt: pinAuth.salt }) },
  async ({ page, app }) => {
    await page.goto(app.url);
    await posterShown(page);
    /** Fires a cancelable contextmenu on `sel`; true when something called preventDefault. */
    const prevented = (sel) =>
      page.evaluate((q) => {
        const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        document.querySelector(q).dispatchEvent(e);
        return e.defaultPrevented;
      }, sel);
    const enterPin = async () => {
      await page.waitForFunction(() => document.getElementById('pin-dialog').open, null, { timeout: 5000 });
      for (const d of PIN) await page.click(`#pin-dialog [data-key="${d}"]`);
      await page.click('#pin-dialog [data-key="ok"]');
    };
    assert.equal(await prevented('#stage'), true, 'on the stage');

    await page.keyboard.press('s'); // PIN first
    await page.waitForFunction(() => document.getElementById('pin-dialog').open, null, { timeout: 5000 });
    assert.equal(await prevented('#pin-dialog [data-key="5"]'), true, 'on a PIN keypad key');
    assert.equal(await prevented('#pin-dialog [data-key="ok"]'), true, 'on the OK key');
    assert.equal(await prevented('#pin-dots'), true, 'on the PIN entry');
    assert.equal(await prevented('#pin-dialog'), true, 'on the PIN dialog itself');
    assert.equal(await prevented('#stage'), true, 'the stage behind the PIN dialog');
    await enterPin();
    await until(() => isOpen(page, 'settings'), 'Settings to open after the PIN');
    await page.evaluate(() => (document.getElementById('manual-connection').open = true));
    assert.equal(await prevented('#settings-form [name="serverUrl"]'), false, 'in the Settings server field');
    assert.equal(await prevented('#settings-form [name="plexToken"]'), false, 'in the Settings token field');
    assert.equal(await prevented('#settings-form [name="username"]'), false, 'in another Settings text field');
    assert.equal(await prevented('#stage'), true, 'the stage behind Settings');
    await page.click('#settings-cancel');
    await until(async () => !(await isOpen(page, 'settings')), 'Settings to close');

    await page.keyboard.press('d');
    await enterPin();
    await until(() => isOpen(page, 'diagnostics'), 'Diagnostics to open after the PIN');
    assert.equal(await prevented('#diag-close'), true, 'in Diagnostics');
    assert.equal(await prevented('#diagnostics'), true, 'on the Diagnostics sheet itself');
    check('K36 contextmenu: stage, PIN keypad and Diagnostics prevented; Settings fields not');
  },
);

// ---------------------------------------------------------------- run

const WORKERS = Number(process.env.E2E_TOUCH_WORKERS || 3);
const only = process.env.E2E_TOUCH_ONLY ? new RegExp(process.env.E2E_TOUCH_ONLY) : null;
const selected = only ? cases.filter((c) => only.test(c.name)) : cases;
const failures = [];
let next = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (next < selected.length) {
      const { name, opts, fn } = selected[next++];
      try {
        await withApp(opts, fn);
      } catch (err) {
        failures.push({ name, err });
      }
    }
  }),
);
for (const { name, err } of failures) console.error(`case ${name} failed:\n${err?.stack || err}`);
if (failures.length) {
  console.error(`${failures.length} of ${selected.length} touch-controls cases failed`);
  process.exit(1);
}
console.log(`all ${selected.length} touch-controls cases passed`);
