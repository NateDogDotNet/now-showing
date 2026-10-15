import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRuntime } from '../js/plex.js';
import { BACKDROP_OPACITY, BACKDROP_WIDTH, PANEL_MIN_EM, SUMMARY_MAX, backdropBox, drawBackdrop, fillState, infoBox, infoParts, infoTitleSize, isLandscape, swapBackdrop, trimSummary, visibleRight } from '../js/fill.js';
import { posterBox } from '../js/layout.js';

test('isLandscape is the effective aspect: 90 and 270 swap width and height', () => {
  assert.equal(isLandscape({ w: 1920, h: 1080, rotation: 0 }), true);
  assert.equal(isLandscape({ w: 1920, h: 1080, rotation: 180 }), true);
  assert.equal(isLandscape({ w: 1920, h: 1080, rotation: 90 }), false);
  assert.equal(isLandscape({ w: 1920, h: 1080, rotation: 270 }), false);
  assert.equal(isLandscape({ w: 1080, h: 1920, rotation: 0 }), false);
  assert.equal(isLandscape({ w: 1080, h: 1920, rotation: 90 }), true);
  assert.equal(isLandscape({ w: 1080, h: 1920, rotation: 270 }), true);
  assert.equal(isLandscape({ w: 1000, h: 1000, rotation: 0 }), false, 'square is not landscape');
  assert.equal(isLandscape({ w: 1920, h: 1080 }), true, 'rotation defaults to 0');
  assert.equal(isLandscape({ w: 0, h: 0, rotation: 0 }), false);
});

test('trimSummary leaves a short text alone and collapses its whitespace', () => {
  assert.equal(trimSummary('A short plot.', 300), 'A short plot.');
  assert.equal(trimSummary('  Two\n\nlines   here. ', 300), 'Two lines here.');
  assert.equal(trimSummary('', 300), '');
  assert.equal(trimSummary(undefined, 300), '');
  assert.equal(trimSummary(42, 300), '');
});

test('trimSummary cuts on a word boundary with one ellipsis character', () => {
  const text = 'alpha beta gamma delta epsilon';
  assert.equal(trimSummary(text, 13), 'alpha beta…', 'cut inside "gamma": back to the last whole word');
  assert.equal(trimSummary(text, 16), 'alpha beta gamma…', 'the word ends exactly at the limit: kept');
  assert.equal(trimSummary(text, 30), text, 'exactly at the limit: unchanged, no ellipsis');
  assert.equal(trimSummary('one two. three', 8), 'one two…', 'no stray punctuation before the ellipsis');
  assert.equal(trimSummary('alpha, beta gamma', 7), 'alpha…');
});

test('trimSummary: a long text is at most max + 1 characters and ends in U+2026', () => {
  const long = 'The quick brown fox jumps over the lazy dog. '.repeat(40);
  const out = trimSummary(long, 300);
  assert.ok(out.length <= 301, `length ${out.length}`);
  assert.ok(out.endsWith('…'));
  assert.equal([...out].filter((c) => c === '…').length, 1);
  assert.ok(long.replace(/\s+/g, ' ').startsWith(out.slice(0, -1)), 'a prefix of the text');
  assert.equal(SUMMARY_MAX, 300);
});

test('trimSummary: one huge word is cut hard, and a surrogate pair is never split', () => {
  assert.equal(trimSummary('x'.repeat(50), 10), `${'x'.repeat(10)}…`);
  const pairs = '\u{1F3AC}'.repeat(20); // each is two UTF-16 units
  const out = trimSummary(pairs, 5);
  assert.equal(out, `${'\u{1F3AC}'.repeat(2)}…`, 'a half pair is dropped');
});

test('fillState: blur and info need a landscape screen, none stays none', () => {
  const land = { w: 1920, h: 1080, rotation: 0 };
  assert.equal(fillState({ mode: 'blur', ...land }), 'blur');
  assert.equal(fillState({ mode: 'info', ...land }), 'info');
  assert.equal(fillState({ mode: 'none', ...land }), 'none');
  assert.equal(fillState({ mode: 'blur', w: 1080, h: 1920, rotation: 0 }), 'none');
  assert.equal(fillState({ mode: 'info', ...land, rotation: 90 }), 'none');
  assert.equal(fillState({ mode: 'info', w: 1080, h: 1920, rotation: 270 }), 'info');
  assert.equal(fillState({ mode: 'bogus', ...land }), 'none');
  assert.equal(fillState({ mode: undefined, ...land }), 'none');
});

test('the backdrop is a tiny canvas drawn at most 25 percent bright', () => {
  assert.ok(BACKDROP_WIDTH <= 64);
  assert.ok(BACKDROP_OPACITY <= 0.25);
});

function fakeCanvas() {
  const calls = [];
  const ctx = { imageSmoothingEnabled: false, imageSmoothingQuality: 'low', drawImage: (...a) => calls.push(a) };
  return { width: 300, height: 150, calls, ctx, getContext: (kind) => (kind === '2d' ? ctx : null) };
}

test('drawBackdrop sizes the canvas to BACKDROP_WIDTH and keeps the poster aspect', () => {
  const canvas = fakeCanvas();
  const img = { naturalWidth: 600, naturalHeight: 900 };
  assert.equal(drawBackdrop(canvas, img), true);
  assert.equal(canvas.width, BACKDROP_WIDTH);
  assert.equal(canvas.height, Math.round((BACKDROP_WIDTH * 900) / 600));
  assert.deepEqual(canvas.calls, [[img, 0, 0, canvas.width, canvas.height]]);
  assert.equal(canvas.ctx.imageSmoothingEnabled, true);
  assert.equal(canvas.ctx.imageSmoothingQuality, 'high');
});

test('drawBackdrop never exceeds the limit, whatever width is asked for', () => {
  const canvas = fakeCanvas();
  drawBackdrop(canvas, { naturalWidth: 100, naturalHeight: 100 }, 5000);
  assert.equal(canvas.width, 64);
});

test('drawBackdrop does nothing for an image that has not loaded, or a canvas without a 2d context', () => {
  const canvas = fakeCanvas();
  assert.equal(drawBackdrop(canvas, { naturalWidth: 0, naturalHeight: 0 }), false);
  assert.equal(canvas.calls.length, 0);
  assert.equal(canvas.width, 300, 'untouched');
  assert.equal(drawBackdrop({ ...canvas, getContext: () => null }, { naturalWidth: 10, naturalHeight: 10 }), false);
  const throwing = { width: 1, height: 1, getContext: () => ({ drawImage() { throw new Error('tainted'); } }) };
  assert.equal(drawBackdrop(throwing, { naturalWidth: 10, naturalHeight: 10 }), false, 'a draw error is not fatal');
});

test('backdropBox covers the screen around the stage, with room for pixel shift', () => {
  assert.deepEqual(backdropBox({ stageW: 691, stageH: 1080, screenW: 1920, screenH: 1080, margin: 0 }), { left: -614.5, top: 0, width: 1920, height: 1080 });
  const b = backdropBox({ stageW: 691, stageH: 1080, screenW: 1920, screenH: 1080, margin: 20 });
  assert.deepEqual(b, { left: -634.5, top: -20, width: 1960, height: 1120 });
});

test('infoBox sits to the right of the stage, inside the empty side, centred on the stage', () => {
  const b = infoBox({ stageW: 691, stageH: 1080, screenW: 1920, screenH: 1080 });
  assert.equal(b.top, 0);
  assert.equal(b.height, 1080);
  assert.ok(b.left > 691, 'right of the stage');
  assert.ok(b.left + b.width <= 691 + (1920 - 691) / 2, 'inside the side');
  assert.ok(b.width > 300, `wide enough to read: ${b.width}`);
  assert.deepEqual(infoBox({ stageW: 1000, stageH: 600, screenW: 1000, screenH: 600 }).width, 0, 'no side space, no panel width');
});

test('infoParts: title, "rating · runtime · year" and the summary; missing parts are left out', () => {
  const p = { title: 'Velvet Curtain', year: '1972', contentRating: 'PG-13', duration: 8_040_000, summary: 'A plot.' };
  assert.deepEqual(infoParts(p, formatRuntime), { title: 'Velvet Curtain', meta: 'PG-13 · 2 h 14 m · 1972', summary: 'A plot.' });
  assert.deepEqual(infoParts({ title: 'Encore', year: '2023', contentRating: '', duration: 0 }, formatRuntime), { title: 'Encore', meta: '2023', summary: '' });
  assert.deepEqual(infoParts(null, formatRuntime), { title: '', meta: '', summary: '' });
});

test('infoParts trims a summary that is too long, whatever produced it', () => {
  const long = 'word '.repeat(200);
  assert.ok(infoParts({ title: 'A', summary: long }, formatRuntime).summary.length <= 301);
});

// ---- r2: the panel starts at the visible poster, and is hidden when too narrow (owner ruling) ----

const MARQUEE_WINDOW = { x: 10, y: 14, w: 80, h: 72 }; // a framed window, as frames.js describes one (percent of the stage)
const NO_FRAME_WINDOW = { x: 0, y: 0, w: 100, h: 100 };

test('infoTitleSize follows the shorter side, clamped to 22..72 px', () => {
  assert.equal(infoTitleSize(1920, 1080), 47.52);
  assert.equal(infoTitleSize(1080, 1920), 47.52, 'the shorter side whichever way round');
  assert.equal(infoTitleSize(400, 200), 22);
  assert.equal(infoTitleSize(7680, 4320), 72);
});

test('infoBox hides the panel below 8 title em and shows it just above', () => {
  const stageW = 691;
  const screenH = 1080;
  const gap = Math.round(screenH * 0.04);
  const min = PANEL_MIN_EM * infoTitleSize(1920, screenH); // 380.16 px
  assert.equal(PANEL_MIN_EM, 8);
  const screenWFor = (panelW) => stageW + 2 * (panelW + 2 * gap); // the screen that leaves exactly this panel width
  const above = infoBox({ stageW, stageH: screenH, screenW: screenWFor(Math.ceil(min) + 1), screenH });
  const below = infoBox({ stageW, stageH: screenH, screenW: screenWFor(Math.floor(min) - 1), screenH });
  assert.equal(above.width, Math.ceil(min) + 1, 'just above: shown');
  assert.equal(below.width, 0, 'just below: no panel');
  assert.equal(infoBox({ stageW, stageH: screenH, screenW: screenWFor(Math.ceil(min)), screenH }).width, Math.ceil(min), 'at or over the threshold: shown');
});

test('infoBox on the screens that are not 16:9: 4:3 and 5:4 are too narrow, 16:10 is not', () => {
  const at = (screenW, screenH) => {
    const stageW = Math.floor(screenH * 0.64);
    return infoBox({ stageW, stageH: screenH, screenW, screenH }).width;
  };
  assert.equal(at(1440, 1080), 0, '4:3');
  assert.equal(at(1280, 1024), 0, '5:4');
  assert.equal(at(1024, 768), 0, '4:3 at 1024');
  assert.ok(at(1280, 800) > 0, '16:10');
  assert.ok(at(1366, 768) > 0 && at(1920, 1080) > 0 && at(1280, 720) > 0, '16:9 and its relatives');
});

test('infoBox starts at the visible poster at poster scale 1, 1.5 and 2, and hides when there is no room left', () => {
  const stageW = 691;
  const stageH = 1080;
  const screen = { screenW: 1920, screenH: 1080 };
  const gap = Math.round(1080 * 0.04);
  const at = (win, scale) => {
    const box = posterBox({ stageW, stageH, win, scale: scale * 100 });
    const posterRight = visibleRight({ stageW, box });
    return { posterRight, panel: infoBox({ stageW, stageH, ...screen, posterRight }) };
  };
  const one = at(MARQUEE_WINDOW, 1);
  assert.equal(one.posterRight, stageW, 'framed at 100 %: the frame is the edge');
  assert.equal(one.panel.left, stageW + gap);
  assert.ok(one.panel.width > 0);
  const big = at(MARQUEE_WINDOW, 1.5);
  assert.ok(big.posterRight > stageW, 'a 150 % poster pokes out of the frame');
  assert.equal(big.panel.left, big.posterRight + gap, 'the panel starts after the scaled poster, never over it');
  assert.ok(big.panel.left > one.panel.left);
  assert.ok(big.panel.width > 0 && big.panel.left + big.panel.width <= (stageW + 1920) / 2 - gap, 'still inside the screen');
  assert.equal(at(MARQUEE_WINDOW, 2).panel.width, 0, '200 %: no room, no panel');
  assert.equal(at(NO_FRAME_WINDOW, 1).panel.width > 0, true, 'no frame at 100 %');
  assert.equal(at(NO_FRAME_WINDOW, 1.5).panel.width, 0, 'no frame at 150 %: the poster takes the side');
  for (const win of [MARQUEE_WINDOW, NO_FRAME_WINDOW]) {
    for (const scale of [1, 1.5, 2]) {
      const { posterRight, panel } = at(win, scale);
      if (panel.width > 0) assert.ok(panel.left >= posterRight, `no overlap (${scale})`);
    }
  }
});

test('infoBox keeps the pixel-shift margin off the screen edge', () => {
  const base = infoBox({ stageW: 691, stageH: 1080, screenW: 1920, screenH: 1080 });
  const shifted = infoBox({ stageW: 691, stageH: 1080, screenW: 1920, screenH: 1080, margin: 30 });
  assert.equal(shifted.left, base.left);
  assert.equal(shifted.width, base.width - 30);
});

function fakeClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, force) => (force ? set.add(c) : set.delete(c)),
    contains: (c) => set.has(c),
  };
}
const fakeLayerCanvas = (drawOk = true) => ({ ...fakeCanvas(), classList: fakeClassList(), getContext: () => (drawOk ? fakeCanvas().ctx : { drawImage() { throw new Error('boom'); } }) });
const loaded = { naturalWidth: 100, naturalHeight: 150 };

test('swapBackdrop shows the drawn canvas and fades the other (blur mode)', () => {
  const [a, b] = [fakeLayerCanvas(), fakeLayerCanvas()];
  a.classList.add('active');
  assert.equal(swapBackdrop([a, b], 1, loaded, true), true);
  assert.equal(b.classList.contains('active'), true);
  assert.equal(a.classList.contains('active'), false);
});

test('swapBackdrop never leaves a stale image showing: a failed draw, an unloaded image or another mode clears both', () => {
  for (const [name, canvases, img, enabled] of [
    ['draw throws', [fakeLayerCanvas(), fakeLayerCanvas(false)], loaded, true],
    ['image not loaded', [fakeLayerCanvas(), fakeLayerCanvas()], { naturalWidth: 0, naturalHeight: 0 }, true],
    ['not blur mode', [fakeLayerCanvas(), fakeLayerCanvas()], loaded, false],
  ]) {
    canvases[0].classList.add('active'); // the previous poster's backdrop
    canvases[1].classList.add('active'); // and a stale one from two draws back
    assert.equal(swapBackdrop(canvases, 1, img, enabled), false, name);
    assert.equal(canvases[0].classList.contains('active'), false, `${name}: the old canvas is off`);
    assert.equal(canvases[1].classList.contains('active'), false, `${name}: the stale canvas is off`);
  }
});
