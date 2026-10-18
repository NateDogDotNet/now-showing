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

// ---- Gap fill inside the frame window (R-FILL-1, D67) ----
// Rectangles here are { left, top, width, height } in stage pixels. `win` is the frame window in stage pixels
// (posterBox with scale 100 gives it from the frame's percentages).

/** A gap thinner than this many stage pixels is closed by scaling the poster, never filled (D67). */
export const MIN_GAP_PX = 4;

/**
 * Where the image itself lies inside the poster box. `object-fit: contain` (css/app.css) keeps the image's aspect inside the
 * box and leaves its own bands; cover and fill, or an image whose aspect is not known, take the whole box.
 */
export function imageRect({ box, aspect, fit }) {
  if (fit !== 'contain' || !(aspect > 0) || !(box.width > 0) || !(box.height > 0)) return { ...box };
  let width = box.width;
  let height = width / aspect;
  if (height > box.height) {
    height = box.height;
    width = height * aspect;
  }
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
}

/**
 * The parts of the frame window the poster does not cover, as stage-pixel rectangles clipped to the window: the window
 * minus the image (the poster box, and at fit `contain` the image inside it). Empty when the poster covers the window.
 * A side whose gap is under `minGap` is left out (closeGap makes the poster cover it instead). The left and right bands
 * run the window's full height; the top and bottom bands run between them.
 */
export function gapBands({ win, box, aspect, fit = 'cover', minGap = MIN_GAP_PX }) {
  if (!(win.width > 0) || !(win.height > 0)) return [];
  const img = imageRect({ box, aspect, fit });
  const right = win.left + win.width;
  const bottom = win.top + win.height;
  const il = Math.max(win.left, img.left);
  const ir = Math.min(right, img.left + img.width);
  const it = Math.max(win.top, img.top);
  const ib = Math.min(bottom, img.top + img.height);
  if (ir <= il || ib <= it) return [{ ...win }]; // the poster is not over the window at all
  const gap = { left: il - win.left, right: right - ir, top: it - win.top, bottom: bottom - ib };
  const bands = [];
  if (gap.left >= minGap) bands.push({ left: win.left, top: win.top, width: gap.left, height: win.height });
  if (gap.right >= minGap) bands.push({ left: ir, top: win.top, width: gap.right, height: win.height });
  const x0 = gap.left >= minGap ? il : win.left;
  const x1 = gap.right >= minGap ? ir : right;
  if (gap.top >= minGap) bands.push({ left: x0, top: win.top, width: x1 - x0, height: gap.top });
  if (gap.bottom >= minGap) bands.push({ left: x0, top: ib, width: x1 - x0, height: gap.bottom });
  return bands;
}

/**
 * Closes the gaps thinner than `minGap`: a poster box that stops 1-3 px short of a window edge grows to it, and a `contain`
 * image that stops that short of the window is closed too: cropped by that much (`cover`) when the box's own bands are as thin,
 * otherwise the box grows evenly about its centre (still `contain`, a few px of enlargement, no crop). Returns { box, fit, closed }; `closed` says
 * anything changed. Only the thin gaps close; a wider one is left for gapBands to report.
 */
export function closeGap({ win, box, aspect, fit = 'cover', minGap = MIN_GAP_PX }) {
  const thin = (g) => g > 0 && g < minGap;
  let { left, top, width, height } = box;
  let closed = false;
  const right = left + width;
  const bottom = top + height;
  const winRight = win.left + win.width;
  const winBottom = win.top + win.height;
  if (thin(left - win.left)) { width += left - win.left; left = win.left; closed = true; }
  if (thin(win.left + win.width - right) && right <= winRight) { width += winRight - right; closed = true; }
  if (thin(top - win.top)) { height += top - win.top; top = win.top; closed = true; }
  if (thin(winBottom - bottom) && bottom <= winBottom) { height += winBottom - bottom; closed = true; }
  const grown = { left, top, width, height };
  let nextFit = fit;
  let outBox = grown;
  if (fit === 'contain') {
    // The contained image's gaps are measured against the WINDOW, not the box: a box that overhangs the window (scale above 100,
    // or an offset) can leave a strip of 1-3 px inside the window while its own band is wider. Only the sides where the image
    // stops short of the window count; when every one of them is thin it is closed.
    const img = imageRect({ box: grown, aspect, fit });
    const gx = Math.max(0, img.left - win.left, winRight - (img.left + img.width));
    const gy = Math.max(0, img.top - win.top, winBottom - (img.top + img.height));
    const thinX = gx > 0.001 && gx < minGap;
    const thinY = gy > 0.001 && gy < minGap;
    if ((thinX || thinY) && (thinX || gx <= 0.001) && (thinY || gy <= 0.001)) {
      const dx = (grown.width - img.width) / 2;
      const dy = (grown.height - img.height) / 2;
      if (dx < minGap && dy < minGap) {
        nextFit = 'cover'; // the box's own bands are thin too: cropping them away moves the image a few px
      } else {
        // Keep contain, grow the box evenly about its centre so the image reaches the window on the thin axis: a few px of enlargement, no crop.
        const k = Math.max(thinX ? (img.width + 2 * gx) / img.width : 1, thinY ? (img.height + 2 * gy) / img.height : 1);
        const cx = grown.left + grown.width / 2;
        const cy = grown.top + grown.height / 2;
        outBox = { left: cx - (grown.width * k) / 2, top: cy - (grown.height * k) / 2, width: grown.width * k, height: grown.height * k };
      }
      closed = true;
    }
  }
  return { box: outBox, fit: nextFit, closed };
}

/**
 * The rectangle the blurred copy is drawn into, relative to the window's top-left: centred on the poster's image (`centre`, stage
 * px), the image's own aspect, scaled up from that centre just enough to cover the window, and never smaller than the image
 * itself (`minWidth`). The band beside each poster edge then shows a blurred continuation of that edge, not a stretched copy.
 */
export function blurRect({ win, centre, aspect, minWidth = 0 }) {
  const a = aspect > 0 ? aspect : 2 / 3;
  const halfW = Math.max(centre.x - win.left, win.left + win.width - centre.x);
  const halfH = Math.max(centre.y - win.top, win.top + win.height - centre.y);
  const width = Math.max(minWidth, 2 * halfW, 2 * halfH * a);
  const height = width / a;
  return { left: centre.x - width / 2 - win.left, top: centre.y - height / 2 - win.top, width, height };
}
