// Pure geometry for placing the frame and poster on screen.

/**
 * Size of the stage (frame box) that fits the viewport for a given rotation.
 * When rotated 90/270 the stage is laid out against swapped viewport dimensions,
 * then rotated into place by CSS.
 */
export function stageSize({ viewportW, viewportH, aspect, rotation = 0, margin = 0 }) {
  const sideways = rotation === 90 || rotation === 270;
  // `margin` is a fraction of each axis left empty on both sides (pixel shift needs room to move in).
  const keep = 1 - 2 * margin;
  const availW = (sideways ? viewportH : viewportW) * keep;
  const availH = (sideways ? viewportW : viewportH) * keep;
  let w = availW;
  let h = w / aspect;
  if (h > availH) {
    h = availH;
    w = h * aspect;
  }
  return { width: Math.floor(w), height: Math.floor(h) };
}

// The 9 points of a 3x3 grid in an order that never lands on the same point twice in a row,
// including the wrap from the last step back to the first (fractions of the margin).
const SHIFT_PATH = [
  [0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

/** Pixel-shift offset { x, y } in screen pixels for a step number; each coordinate is within +-marginPx. */
export function shiftOffset(step, marginPx) {
  const n = SHIFT_PATH.length;
  const [fx, fy] = SHIFT_PATH[((Math.trunc(step) % n) + n) % n];
  return { x: fx * marginPx, y: fy * marginPx };
}

/** How many steps the glide's path has; callers walk the whole orbit by this, not by a literal. */
export function shiftSteps() {
  return SHIFT_PATH.length;
}

/**
 * Room for the pixel-shift glide in screen pixels: what is left of the viewport around the stage on the tighter axis,
 * halved. `stageW`/`stageH` are the stage's layout size (a CSS rotation does not change it), so at rotation 90 or 270 the
 * stage's width lies along the screen's height. display.js glides by this and position.js draws the same orbit (D86).
 */
export function shiftRoom({ viewportW, viewportH, stageW, stageH, rotation = 0 }) {
  const sideways = Math.round(rotation / 90) % 2 !== 0;
  const room = Math.min((viewportW - (sideways ? stageH : stageW)) / 2, (viewportH - (sideways ? stageW : stageH)) / 2);
  return Math.max(0, Math.floor(room));
}

/**
 * Poster box inside the stage, in pixels relative to the stage's top-left.
 * `win` is the frame's transparent window in percent; scale grows/shrinks the
 * poster around the window centre and offsets nudge it by % of the stage.
 */
export function posterBox({ stageW, stageH, win, scale = 100, offsetX = 0, offsetY = 0 }) {
  const s = scale / 100;
  const w = (stageW * win.w * s) / 100;
  const h = (stageH * win.h * s) / 100;
  const cx = (stageW * (win.x + win.w / 2)) / 100 + (stageW * offsetX) / 100;
  const cy = (stageH * (win.y + win.h / 2)) / 100 + (stageH * offsetY) / 100;
  return { left: cx - w / 2, top: cy - h / 2, width: w, height: h };
}

/**
 * Pixel size to request from the Plex transcoder. Rounded up to 100px steps so
 * small window resizes reuse the same cached image.
 */
export function requestSize({ width, height }, dpr = 1) {
  const step = (v) => Math.max(100, Math.ceil((v * Math.min(dpr, 3)) / 100) * 100);
  return { width: step(width), height: step(height) };
}
