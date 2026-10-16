// Position mode (R-SET-5, U5): Settings steps aside for a bar, the poster takes pointer drag and the arrow keys, Done brings the
// sheet back with the new values, Cancel afterwards restores the originals. Every case names pixelShift: false (convention 7)
// and runs against its own mock Plex (serveArgs: []).

import assert from 'node:assert/strict';
import { withApp } from './lib.mjs';

const cases = [];
const posCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], viewport: { width: 1920, height: 1080 }, ...opts }, fn });
const check = (name) => console.log(`  ok  ${name}`);

const seed = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  rotateSeconds: 3600,
  showNowPlaying: false,
  pixelShift: false,
  staticRatingKey: '3',
  staticTitle: 'Velvet Curtain',
  ...extra,
});

const posterShown = (page) => page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
const settled = (page) => page.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 15000 });
const prepare = async (page, app) => {
  await page.goto(app.url);
  await posterShown(page);
  await settled(page);
  await page.waitForTimeout(150);
};

const slider = (page, name) => page.evaluate((n) => Number(document.querySelector(`#settings-form [name="${n}"]`).value), name);
const setSlider = (page, name, value) => page.evaluate(([n, v]) => {
  const el = document.querySelector(`#settings-form [name="${n}"]`);
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, [name, value]);
const box = (page) => page.evaluate(() => {
  const r = document.getElementById('poster-box').getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});
const stageSize = (page) => page.evaluate(() => ({ w: document.getElementById('stage').offsetWidth, h: document.getElementById('stage').offsetHeight }));
const sheetOpen = (page) => page.evaluate(() => document.getElementById('settings').open);
const barShown = (page) => page.evaluate(() => {
  const b = document.getElementById('position-bar');
  const r = b.getBoundingClientRect();
  return !b.hidden && getComputedStyle(b).display !== 'none' && r.width > 0 && r.height > 0;
});
const alt = (page) => page.evaluate(() => document.querySelector('.poster-layer.active')?.alt);
const stageRotation = (page) => page.evaluate(() => document.getElementById('stage').style.getPropertyValue('--rotation'));

async function openSheet(page) {
  await page.keyboard.press('s');
  await page.waitForSelector('#settings[open]');
}
async function startPositioning(page) {
  await openSheet(page);
  // Enabled: the button no longer points at the (hidden) disabled reason, which a screen reader would still read out.
  assert.equal(await page.evaluate(() => document.getElementById('position-btn').disabled), false, 'the button is enabled');
  assert.equal(await page.evaluate(() => document.getElementById('position-btn').getAttribute('aria-describedby')), null, 'an enabled button has no aria-describedby');
  await page.click('#position-btn');
  await page.waitForSelector('#position-bar:not([hidden])');
  assert.equal(await sheetOpen(page), false, 'the modal sheet is closed');
  assert.equal(await barShown(page), true, 'the bar is visible');
}
async function dragBy(page, dx, dy, from = { x: 960, y: 540 }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 });
  await page.mouse.up();
}
const SHORTCUT_WAIT_MS = 2000; // the same wait for a shortcut to act outside position mode and to prove it did nothing inside
const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg}: ${actual} vs ${expected} (+-${tol})`);

// 1. Press Position poster: the sheet collapses to a bar; the bar is clear of the poster's centre and reachable by touch.
posCase('1 Position poster collapses the sheet to a bar', { settings: seed() }, async ({ page, app }) => {
  await prepare(page, app);
  await startPositioning(page);
  const r = await page.evaluate(() => {
    const b = document.getElementById('position-bar').getBoundingClientRect();
    const d = document.getElementById('position-done').getBoundingClientRect();
    return { bar: { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, doneH: d.height, doneW: d.width, role: document.getElementById('position-bar').tagName, label: document.getElementById('position-bar').getAttribute('aria-label'), done: document.getElementById('position-done').tagName };
  });
  assert.ok(r.doneH >= 44 && r.doneW >= 44, `Done is a touch target: ${r.doneW}x${r.doneH}`);
  assert.ok(!(r.bar.left < 960 && r.bar.right > 960 && r.bar.top < 540 && r.bar.bottom > 540), 'the bar does not cover the screen centre');
  assert.equal(r.done, 'BUTTON');
  assert.ok(r.label);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'position-done', 'focus moved to the bar');
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('controls')).display), 'none', 'the controls step aside');
  check('bar shown, sheet closed, Done focused and 44 px or more');
});

// 1b. The bar never overlaps the poster box, the frame or the stage: at the viewer's bottom edge on a portrait screen, in a
//     side margin on a landscape one; with the marquee frame and with none; at rotation 0 and 90.
for (const vp of [{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { width: 1280, height: 720 }]) {
  for (const frameId of ['marquee', 'none']) {
    for (const rotation of [0, 90]) {
      posCase(`1b the bar clears the poster: ${vp.width}x${vp.height}, frame ${frameId}, rotation ${rotation}`, { viewport: vp, settings: seed({ frameId, rotation }) }, async ({ page, app }) => {
        await prepare(page, app);
        await startPositioning(page);
        const r = await page.evaluate(() => {
          const rect = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, w: b.width, h: b.height }; };
          return { bar: rect('position-bar'), others: { 'poster-box': rect('poster-box'), frame: rect('frame'), stage: rect('stage') }, dock: document.getElementById('position-bar').dataset.dock, hint: getComputedStyle(document.querySelector('.position-hint')).fontSize };
        });
        const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        for (const [name, o] of Object.entries(r.others)) {
          if (o.w > 0 && o.h > 0) assert.equal(overlap(r.bar, o), 0, `the bar overlaps the ${name} (bar ${JSON.stringify(r.bar)}, ${name} ${JSON.stringify(o)})`);
        }
        assert.ok(r.bar.left >= 0 && r.bar.top >= 0 && r.bar.right <= vp.width && r.bar.bottom <= vp.height, `the bar is on screen ${JSON.stringify(r.bar)}`);
        assert.ok(await page.evaluate(() => document.getElementById('position-done').getBoundingClientRect().height >= 44), 'Done is 44 px or more');
        assert.equal(r.hint, '16px');
        check(`${vp.width}x${vp.height} ${frameId} r${rotation}: bar docked ${r.dock}, zero overlap`);
      });
    }
  }
}

// 1c. The hint: names Escape, keeps "+ and −" on one line, at most two lines at 1080 px wide.
posCase('1c the hint names Escape, keeps + and - together, fits two lines at 1080 wide', { viewport: { width: 1080, height: 1920 }, settings: seed() }, async ({ page, app }) => {
  await prepare(page, app);
  await startPositioning(page);
  const h = await page.evaluate(() => {
    const el = document.querySelector('.position-hint');
    const nb = el.querySelector('.nowrap');
    return { text: el.textContent, lines: Math.round(el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight)), nowrap: getComputedStyle(nb).whiteSpace, nbText: nb.textContent, nbLines: nb.getClientRects().length };
  });
  assert.match(h.text, /Esc/);
  assert.equal(h.nowrap, 'nowrap');
  assert.equal(h.nbText, '+ and −');
  assert.equal(h.nbLines, 1);
  assert.ok(h.lines <= 2, `the hint is ${h.lines} lines`);
  check(`hint: ${h.lines} lines, "${h.nbText}" unbroken`);
});

// 1d. M2: the idle rule hides the cursor everywhere (body.idle.hide-cursor *); position mode still shows grab, grabbing while dragging.
posCase('1d the cursor stays grab over the poster after the idle class is set', { settings: seed() }, async ({ page, app }) => {
  await prepare(page, app);
  await startPositioning(page);
  await page.evaluate(() => document.body.classList.add('idle', 'hide-cursor'));
  const cursor = (sel) => page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).cursor, sel);
  for (const sel of ['#app', '#poster-box', '.poster-layer.active', '#frame']) assert.equal(await cursor(sel), 'grab', sel);
  await page.mouse.move(960, 540);
  await page.mouse.down();
  await page.mouse.move(1000, 560, { steps: 3 });
  for (const sel of ['#app', '.poster-layer.active']) assert.equal(await cursor(sel), 'grabbing', `${sel} while dragging`);
  await page.mouse.up();
  check('idle + hide-cursor: grab on every layer, grabbing while dragging');
});

// 1e. U4: nothing to position while the empty card shows, and the card's Open settings still opens the sheet.
posCase('1e Position poster is disabled while the empty card shows', { settings: { pixelShift: false } }, async ({ page, app }) => {
  await page.goto(app.url);
  await page.waitForSelector('#empty:not([hidden])');
  await page.click('#empty button[data-action="settings"]');
  await page.waitForSelector('#settings[open]');
  assert.equal(await page.evaluate(() => document.getElementById('position-btn').disabled), true, 'disabled');
  const reason = await page.evaluate(() => {
    const b = document.getElementById('position-btn');
    const r = document.getElementById(b.getAttribute('aria-describedby'));
    return { text: r.textContent, shown: !r.hidden && r.getBoundingClientRect().height > 0, title: b.getAttribute('title'), cursor: getComputedStyle(b).cursor };
  });
  assert.match(reason.text, /Connect to Plex/);
  assert.equal(reason.shown, true, 'the reason is visible text');
  assert.equal(reason.title, null, 'and not a title');
  assert.equal(reason.cursor, 'default', 'the disabled button has the default cursor');
  check('disabled with a reason while the card shows; Open settings opened the sheet');
});

// 2. A 100 px drag on a 1000 px wide stage is 10 percent, at rotation 0.
posCase('2 a 100 px drag moves the offset by 10 on a 1000 px stage', { viewport: { width: 1000, height: 1800 }, settings: seed() }, async ({ page, app }) => {
  await prepare(page, app);
  const st = await stageSize(page);
  assert.equal(st.w, 1000, `the stage is 1000 px wide (${st.w})`);
  const before = await box(page);
  await startPositioning(page);
  await dragBy(page, 100, 0, { x: 500, y: 900 });
  await page.waitForTimeout(100);
  const x = await slider(page, 'posterOffsetX');
  near(x, 10, 0.2, 'posterOffsetX');
  near(await slider(page, 'posterOffsetY'), 0, 0.01, 'posterOffsetY');
  const after = await box(page);
  near(after.left - before.left, 100, 2, 'the poster box followed the pointer');
  near(after.top - before.top, 0, 1, 'and stayed level');
  check(`drag 100 px -> posterOffsetX ${x}, box moved ${(after.left - before.left).toFixed(1)} px`);
});

// 3. The same drag at rotation 90 lands on the mapped axes: right is -y, down is +x, in percent of the stage's own size.
posCase('3 rotation 90 maps the drag onto the rotated axes', { settings: seed({ rotation: 90 }) }, async ({ page, app }) => {
  await prepare(page, app);
  const st = await stageSize(page);
  const before = await box(page);
  await startPositioning(page);
  await dragBy(page, 100, 0);
  near(await slider(page, 'posterOffsetY'), -(100 / st.h) * 100, 0.2, 'right drag -> posterOffsetY');
  near(await slider(page, 'posterOffsetX'), 0, 0.01, 'posterOffsetX untouched by a sideways drag');
  const moved = await box(page);
  near(moved.left - before.left, 100, 2, 'on screen the box moved right by the drag');
  await dragBy(page, 0, 100);
  near(await slider(page, 'posterOffsetX'), (100 / st.w) * 100, 0.2, 'down drag -> posterOffsetX');
  const moved2 = await box(page);
  near(moved2.top - moved.top, 100, 2, 'on screen the box moved down by the drag');
  check(`rotation 90: stage ${st.w}x${st.h}, right 100 px -> Y ${(-(100 / st.h) * 100).toFixed(2)}, down 100 px -> X ${((100 / st.w) * 100).toFixed(2)}`);
});

for (const rotation of [180, 270]) {
  posCase(`3 rotation ${rotation} follows the pointer on screen`, { settings: seed({ rotation }) }, async ({ page, app }) => {
    await prepare(page, app);
    const before = await box(page);
    await startPositioning(page);
    await dragBy(page, 80, 60);
    const after = await box(page);
    near(after.left - before.left, 80, 2, 'screen x');
    near(after.top - before.top, 60, 2, 'screen y');
    check(`rotation ${rotation}: the box moved with the pointer`);
  });
}

// 4. Arrow keys: 0.1, Shift 1.0, in the on-screen direction; + and - change the size.
posCase('4 arrow keys, Shift and size keys', { settings: seed() }, async ({ page, app }) => {
  await prepare(page, app);
  await startPositioning(page);
  await page.keyboard.press('ArrowRight');
  near(await slider(page, 'posterOffsetX'), 0.1, 0.001, 'ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  near(await slider(page, 'posterOffsetX'), 1.1, 0.001, 'Shift+ArrowRight adds 1.0');
  await page.keyboard.press('ArrowDown');
  near(await slider(page, 'posterOffsetY'), 0.1, 0.001, 'ArrowDown');
  await page.keyboard.press('ArrowLeft');
  near(await slider(page, 'posterOffsetX'), 1.0, 0.001, 'ArrowLeft');
  const s0 = await slider(page, 'posterScale');
  const w0 = (await box(page)).width;
  await page.keyboard.press('+');
  near(await slider(page, 'posterScale'), s0 + 1, 0.001, '+ grows by 1');
  near((await box(page)).width / w0, (s0 + 1) / s0, 0.002, 'the poster box grew by the same ratio');
  await page.keyboard.press('=');
  near(await slider(page, 'posterScale'), s0 + 2, 0.001, '= grows by 1');
  await page.keyboard.press('-');
  near(await slider(page, 'posterScale'), s0 + 1, 0.001, '- shrinks by 1');
  near((await box(page)).width / w0, (s0 + 1) / s0, 0.002, 'and the box shrank back by the ratio');
  await page.keyboard.press('Shift+-');
  near(await slider(page, 'posterScale'), s0, 0.001, 'Shift+- still shrinks by 1');
  await page.keyboard.press('Shift+=');
  near(await slider(page, 'posterScale'), s0 + 1, 0.001, 'Shift+= (the + key) grows by 1');
  check('arrows 0.1 / 1.0, + = - size 1 with or without Shift');
});

posCase('4 arrow keys follow the screen at rotation 90', { settings: seed({ rotation: 90 }) }, async ({ page, app }) => {
  await prepare(page, app);
  const before = await box(page);
  await startPositioning(page);
  await page.keyboard.press('Shift+ArrowRight');
  near(await slider(page, 'posterOffsetY'), -1, 0.001, 'ArrowRight is -y at 90');
  await page.keyboard.press('Shift+ArrowDown');
  near(await slider(page, 'posterOffsetX'), 1, 0.001, 'ArrowDown is +x at 90');
  const after = await box(page);
  assert.ok(after.left > before.left && after.top > before.top, 'the box moved right and down on screen');
  check('rotation 90: ArrowRight/Down move the poster right/down on screen');
});

posCase('4 offsets and size clamp at the slider ends', { settings: seed({ posterOffsetX: 99.9, posterScale: 149.5 }) }, async ({ page, app }) => {
  await prepare(page, app);
  await startPositioning(page);
  await page.keyboard.press('Shift+ArrowRight');
  assert.equal(await slider(page, 'posterOffsetX'), 100);
  await page.keyboard.press('+');
  assert.equal(await slider(page, 'posterScale'), 150);
  check('clamped at 100 and 150');
});

// 5. Global shortcuts do nothing in position mode.
posCase('5 every shortcut key is inert in position mode', { settings: seed({ staticRatingKey: '', staticTitle: '' }) }, async ({ page, app }) => {
  await prepare(page, app);
  // Count what the shortcuts would change: a poster layer swap (r), the pause button's state (p), a fullscreen request (f).
  await page.evaluate(() => {
    window.__swaps = 0;
    window.__fs = 0;
    new MutationObserver((rs) => { window.__swaps += rs.length; }).observe(document.getElementById('poster-box'), { attributes: true, subtree: true, attributeFilter: ['class', 'src'] });
    document.documentElement.requestFullscreen = () => { window.__fs++; return Promise.resolve(); };
  });
  const paused = () => page.evaluate(() => document.querySelector('[data-action="pause"]').getAttribute('aria-pressed'));
  // The control: outside position mode the same keys DO act, so the counters can see them.
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.__swaps > 0, null, { timeout: SHORTCUT_WAIT_MS });
  await page.keyboard.press('f');
  assert.equal(await page.evaluate(() => window.__fs), 1, 'f requests full screen outside position mode');
  await page.keyboard.press('p');
  assert.equal(await paused(), 'true', 'p pauses outside position mode');
  await page.keyboard.press('p');
  await settled(page);
  await page.evaluate(() => { window.__swaps = 0; window.__fs = 0; });
  const alt0 = await alt(page);
  const rot0 = await stageRotation(page);
  await startPositioning(page);
  await page.waitForTimeout(500); // the preview that entering the mode applies has settled
  await page.evaluate(() => { window.__swaps = 0; });
  for (const k of ['o', 's', 'r', 'p', 'f', 'd', '?', 'ArrowLeft', 'ArrowUp']) await page.keyboard.press(k);
  await page.waitForTimeout(SHORTCUT_WAIT_MS); // as long as the control was given to show a swap
  assert.equal(await sheetOpen(page), false, 's did not reopen the sheet');
  assert.equal(await barShown(page), true, 'still in position mode');
  assert.equal(await stageRotation(page), rot0, 'o did not rotate the stage');
  assert.equal(await alt(page), alt0, 'r did not swap the poster');
  assert.equal(await page.evaluate(() => window.__swaps), 0, 'no poster layer changed (r)');
  assert.equal(await paused(), 'false', 'p did not pause');
  assert.equal(await page.evaluate(() => window.__fs), 0, 'f did not ask for full screen');
  assert.equal(await page.evaluate(() => document.querySelector('dialog[open]') === null), true, 'no dialog opened (d, ?)');
  check('with a live control (r, f and p all act outside position mode), o s r p f d ? did nothing inside it');
});

// 6. Done reopens the sheet with the new values; Cancel afterwards restores the originals.
posCase('6 Done reopens the sheet with the new values, Cancel restores the originals', { settings: seed({ posterOffsetX: 2 }) }, async ({ page, app }) => {
  await prepare(page, app);
  const original = await box(page);
  await openSheet(page);
  assert.equal(await slider(page, 'posterOffsetX'), 2);
  await page.click('#position-btn');
  await page.waitForSelector('#position-bar:not([hidden])');
  await dragBy(page, 150, 90);
  const x = await slider(page, 'posterOffsetX');
  const y = await slider(page, 'posterOffsetY');
  const dragged = await box(page);
  assert.ok(dragged.left > original.left + 100, 'the preview moved the poster');
  await page.click('#position-done');
  await page.waitForSelector('#settings[open]');
  assert.equal(await barShown(page), false, 'the bar is gone');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'position-btn', 'focus returns to Position poster');
  assert.equal(await slider(page, 'posterOffsetX'), x, 'the slider shows the dragged X');
  assert.equal(await slider(page, 'posterOffsetY'), y, 'the slider shows the dragged Y');
  const outputs = await page.evaluate(() => document.querySelector('output[data-for="posterOffsetX"]').textContent);
  assert.equal(outputs, `+${x}%`, 'and so does its readout');
  assert.deepEqual(await box(page), dragged, 'the preview still shows the dragged poster');
  // The live preview matches the sliders: set the slider to the same number directly and the box does not move.
  await setSlider(page, 'posterOffsetX', x);
  await setSlider(page, 'posterOffsetY', y);
  const direct = await box(page);
  near(direct.left, dragged.left, 0.5, 'box.left');
  near(direct.top, dragged.top, 0.5, 'box.top');
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  await page.waitForTimeout(150);
  const restored = await box(page);
  near(restored.left, original.left, 0.5, 'Cancel restores left');
  near(restored.top, original.top, 0.5, 'Cancel restores top');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));
  assert.equal(saved.posterOffsetX, 2, 'nothing was stored');
  check(`dragged to ${x}/${y}, Done showed it in the sheet, Cancel restored the box`);
});

// 7. Save after Done stores the positioned values; the slider is an exact mirror of the preview.
posCase('7 Save after Done stores the new offsets', { settings: seed() }, async ({ page, app }) => {
  await prepare(page, app);
  await startPositioning(page);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  const withKeys = await box(page);
  await page.click('#position-done');
  await page.waitForSelector('#settings[open]');
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings')));
  assert.equal(saved.posterOffsetX, 1);
  assert.equal(saved.posterOffsetY, 1);
  const after = await box(page);
  near(after.left, withKeys.left, 0.5, 'saved box.left');
  near(after.top, withKeys.top, 0.5, 'saved box.top');
  check('Save stored offsets 1 / 1 and the poster stayed put');
});

// 8. Escape leaves position mode like Done; pointer and touch drag both work.
posCase('8 Escape leaves position mode like Done', { settings: seed() }, async ({ page, app }) => {
  await prepare(page, app);
  await startPositioning(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#settings[open]');
  assert.equal(await barShown(page), false);
  near(await slider(page, 'posterOffsetX'), 0.1, 0.001, 'the nudge is kept');
  await page.click('#settings-cancel');
  await page.waitForFunction(() => !document.getElementById('settings').open);
  assert.equal(await page.evaluate(() => document.body.classList.contains('positioning')), false);
  check('Escape = Done');
});

posCase('9 touch drag at a 1080x1920 portrait screen', { viewport: { width: 1080, height: 1920 }, hasTouch: true, settings: seed() }, async ({ page, app }) => {
  await prepare(page, app);
  const st = await stageSize(page);
  await openSheet(page);
  await page.click('#position-btn');
  await page.waitForSelector('#position-bar:not([hidden])');
  const before = await box(page);
  // A touch drag via CDP: one finger from the middle, 100 px right and 150 px down.
  const cdp = await page.context().newCDPSession(page);
  const pt = (x, y) => [{ x, y }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(540, 900) });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(540 + 20 * i, 900 + 30 * i) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  near(await slider(page, 'posterOffsetX'), (100 / st.w) * 100, 0.2, 'touch X');
  near(await slider(page, 'posterOffsetY'), (150 / st.h) * 100, 0.2, 'touch Y');
  const after = await box(page);
  near(after.left - before.left, 100, 2, 'box x');
  near(after.top - before.top, 150, 2, 'box y');
  check('touch drag moved the poster and the sliders');
});

posCase('10 the same flow at 1080x1920 and the Done button is reachable', { viewport: { width: 1080, height: 1920 }, settings: seed() }, async ({ page, app }) => {
  await prepare(page, app);
  await startPositioning(page);
  const r = await page.evaluate(() => {
    const d = document.getElementById('position-done').getBoundingClientRect();
    const b = document.getElementById('position-bar').getBoundingClientRect();
    return { d, b: { left: b.left, right: b.right, top: b.top, bottom: b.bottom } };
  });
  assert.ok(r.b.left >= 0 && r.b.right <= 1080 && r.b.top >= 0 && r.b.bottom <= 1920, `the bar is inside the screen: ${JSON.stringify(r.b)}`);
  await page.keyboard.press('Shift+ArrowRight');
  near(await slider(page, 'posterOffsetX'), 1, 0.001, 'nudge');
  await page.click('#position-done');
  await page.waitForSelector('#settings[open]');
  check('portrait: bar on screen, nudge, Done');
});


// ---------- r3: the placement is measured every time ----------

const OVER_BG = /rgba\(.*0\.6\)/;

/** The bar's overlap (px squared) with each thing it must clear, and whether it is whole on the screen. */
const barReport = (page) => page.evaluate(() => {
  const rect = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, w: b.width, h: b.height }; };
  const bar = rect('position-bar');
  const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const out = {};
  for (const id of ['poster-box', 'frame', 'stage']) { const o = rect(id); out[id] = o.w > 0 && o.h > 0 ? area(bar, o) : 0; }
  const el = document.getElementById('position-bar');
  return { overlap: out, bar, dock: el.dataset.dock, side: el.dataset.side || '', onScreen: bar.left >= -0.5 && bar.top >= -0.5 && bar.right <= window.innerWidth + 0.5 && bar.bottom <= window.innerHeight + 0.5, background: getComputedStyle(el).backgroundColor, hintOpacity: getComputedStyle(document.querySelector('.position-hint')).opacity };
});
const assertClear = (r, what) => {
  for (const [name, a] of Object.entries(r.overlap)) assert.equal(a, 0, `${what}: the bar overlaps the ${name} by ${a} px2 (${JSON.stringify(r.bar)}, dock ${r.dock})`);
  assert.equal(r.onScreen, true, `${what}: the bar is whole on the screen ${JSON.stringify(r.bar)}`);
};
/** Clear, or the translucent "over" bar when no placement can be. */
const assertClearOrOver = (r, what) => {
  if (r.dock === 'over') assert.match(r.background, OVER_BG, `${what}: over is translucent`);
  else assertClear(r, what);
};
const where = (r) => `${r.dock}${r.side ? '-' + r.side : ''}`;

// I1. A resize in position mode: the bar is placed against the stage as re-laid, both ways.
posCase('11 resizing 1920x1080 -> 1080x1920 -> 1920x1080 keeps the bar clear and on screen', { settings: seed({ frameId: 'none' }) }, async ({ page, app }) => {
  await prepare(page, app);
  await startPositioning(page);
  assertClear(await barReport(page), '1920x1080 at start');
  for (const vp of [{ width: 1080, height: 1920 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(600);
    assertClear(await barReport(page), `after resizing to ${vp.width}x${vp.height}`);
  }
  check('resized to portrait and back: zero overlap and on screen each time');
});

// I2. A saved size past 100 puts the poster box beyond the stage: every placement is measured against it. At 1920x1080 a clear
// side placement exists for all four seeds, so each must be clear AND docked at the side (the translucent 'over' fallback
// would hide a placement that ignores the poster box). Size 120 steps up with +, size 150 (the maximum) steps down with -.
for (const frameId of ['none', 'marquee']) {
  for (const posterScale of [120, 150]) {
    posCase(`12 saved size ${posterScale}, frame ${frameId}: the bar is clear and at the side, at start and after ${posterScale === 150 ? '-' : '+'} x10`, { settings: seed({ frameId, posterScale }) }, async ({ page, app }) => {
      await prepare(page, app);
      await startPositioning(page);
      const r0 = await barReport(page);
      assertClear(r0, 'at start');
      assert.equal(r0.dock, 'side', `at start the bar is docked at the side (dock ${where(r0)})`);
      const key = posterScale === 150 ? '-' : '=';
      for (let i = 0; i < 10; i++) await page.keyboard.press(key);
      await page.waitForTimeout(500);
      assert.equal(await slider(page, 'posterScale'), posterScale + (posterScale === 150 ? -10 : 10), 'the size key took effect');
      const r1 = await barReport(page);
      assertClear(r1, `after ${key} x10`);
      assert.equal(r1.dock, 'side', `after the size change the bar is still at the side (dock ${where(r1)})`);
      check(`size ${posterScale} ${frameId}: start ${where(r0)}, after ${key} x10 ${where(r1)}`);
    });
  }
}

// M13. Pixel shift on: the stage glides up to its room (16 px here) away on each axis with no input. Shift step 5 puts it 16 px
// left of its rest; the bar is placed there, and steps 6, 7 and 8 carry it on to 16 px right. A bar measured against the stage
// where it stood at step 5 would be 16 px under at step 8, so the placement must allow for the whole orbit.
posCase('12b pixel shift: a side bar placed at one end of the orbit stays clear at the other', {
  settings: seed({ frameId: 'none', pixelShift: true, pixelShiftMinutes: 3 }),
  clock: { time: new Date('2026-06-01T12:00:00Z') },
}, async ({ page, app }) => {
  await prepare(page, app);
  const shiftStep = async () => {
    await page.clock.runFor(3 * 60 * 1000);
    await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
    return page.evaluate(() => getComputedStyle(document.getElementById('stage')).translate);
  };
  for (let i = 0; i < 5; i++) await shiftStep();
  assert.match(await page.evaluate(() => getComputedStyle(document.getElementById('stage')).translate), /^-16px/, 'step 5 is 16 px left of rest');
  await startPositioning(page);
  const r0 = await barReport(page);
  assertClear(r0, 'at start (shift step 5)');
  assert.equal(r0.dock, 'side', `placed at the side so the orbit matters (dock ${where(r0)})`);
  for (let step = 6; step <= 8; step++) {
    const t = await shiftStep();
    assertClear(await barReport(page), `after shift step ${step} (translate ${t})`);
  }
  assert.match(await page.evaluate(() => getComputedStyle(document.getElementById('stage')).translate), /^16px/, 'step 8 is 16 px right of rest');
  check(`pixel shift: bar ${where(r0)} placed at -16 px stayed clear through +16 px`);
});

// Ruling 1: the bar dims during a drag and re-places when it ends: a poster dragged under it is clear after the release.
posCase('13 a poster dragged toward the bar: the bar dims, then re-places clear', { viewport: { width: 1080, height: 1920 }, settings: seed({ frameId: 'none' }) }, async ({ page, app }) => {
  await prepare(page, app);
  await startPositioning(page);
  const opacity = () => page.evaluate(() => Number(getComputedStyle(document.getElementById('position-bar')).opacity));
  assert.equal(await opacity(), 1);
  await page.mouse.move(540, 900);
  await page.mouse.down();
  await page.mouse.move(540, 1200, { steps: 6 });
  await page.waitForTimeout(400);
  const dimmed = await opacity();
  assert.ok(dimmed < 0.5, `the bar dims during the drag (${dimmed})`);
  await page.mouse.move(540, 1500, { steps: 6 }); // the poster now reaches past the bottom edge, under the bar
  await page.mouse.up();
  await page.waitForTimeout(700);
  assert.equal(await opacity(), 1, 'full opacity again');
  const r = await barReport(page);
  assertClearOrOver(r, 'after the release');
  check(`dimmed to ${dimmed}, released: bar docked ${where(r)}`);
});

// Ruling 2: the synopsis panel is hidden while positioning, back after Done.
posCase('14 the synopsis panel is hidden in position mode and back after Done', { settings: seed({ fillMode: 'info' }) }, async ({ page, app }) => {
  await prepare(page, app);
  const shown = () => page.evaluate(() => { const el = document.getElementById('info-panel'); return !el.hidden && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0; });
  assert.equal(await shown(), true, 'the panel shows before');
  await startPositioning(page);
  assert.equal(await shown(), false, 'hidden in position mode');
  await page.click('#position-done');
  await page.waitForSelector('#settings[open]');
  assert.equal(await shown(), true, 'back after Done');
  check('info panel hidden while positioning, back after Done');
});

// Ruling 3: near-square screens. Whichever candidate wins is clear, or it is the translucent "over" bar with only Done clickable.
for (const vp of [{ width: 1080, height: 1080 }, { width: 920, height: 720 }]) {
  for (const frameId of ['none', 'marquee']) {
    posCase(`15 ${vp.width}x${vp.height}, frame ${frameId}: clear, or translucent over`, { viewport: vp, settings: seed({ frameId }) }, async ({ page, app }) => {
      await prepare(page, app);
      await startPositioning(page);
      const r = await barReport(page);
      assertClearOrOver(r, `${vp.width}x${vp.height}`);
      if (r.dock === 'over') {
        assert.ok(Number(r.hintOpacity) < 1, 'and the hint is dimmed');
        assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('position-bar')).pointerEvents), 'none');
        assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('position-done')).pointerEvents), 'auto');
      }
      check(`${vp.width}x${vp.height} ${frameId}: ${where(r)}`);
    });
  }
}

// ---------- run ----------

const WORKERS = Number(process.env.E2E_POSITION_WORKERS || 3);
const failures = [];
let nextCase = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (nextCase < cases.length) {
      const { name, opts, fn } = cases[nextCase++];
      try {
        await withApp(opts, fn);
        console.log(`PASS case ${name}`);
      } catch (err) {
        failures.push({ name, err });
      }
    }
  }),
);
for (const { name, err } of failures) console.error(`case ${name} failed:\n${err?.stack || err}`);
if (failures.length) process.exit(1);
