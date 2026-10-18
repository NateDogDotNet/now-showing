// Landscape fill (R-FILL-1, D1): what goes in the empty sides of a landscape screen. A dimmed backdrop made from the
// poster, or a synopsis panel. Pure helpers only; display.js owns the elements. Single-poster layouts only (D1).
//
// The blur is a tiny canvas drawn once per poster and upscaled by CSS, never `filter: blur()` or `backdrop-filter` on a
// full-screen layer: that is the Pi GPU cost pi-stability removed.

/** Intrinsic width of the backdrop canvas. A hard cap (64) applies whatever a caller asks for. */
export const BACKDROP_WIDTH = 48;
const BACKDROP_MAX_WIDTH = 64;
/** The backdrop is never brighter than this fraction (OLED: a large lit area shortens panel life). */
export const BACKDROP_OPACITY = 0.25;
/**
 * The info panel is hidden when its box is narrower than this many em of the title's font size: a column that narrow
 * wraps a title word by word and a synopsis into a ribbon (owner ruling, 2026-10-15). The backdrop is unaffected.
 */
export const PANEL_MIN_EM = 8;
// The title's font size is `clamp(INFO_TITLE_MIN_PX, INFO_TITLE_VMIN vmin, INFO_TITLE_MAX_PX)`. display.js sets it on the
// panel as --info-title-size from infoTitleSize(), so the width rule and the CSS use the one number.
export const INFO_TITLE_VMIN = 4.4;
const INFO_TITLE_MIN_PX = 22;
const INFO_TITLE_MAX_PX = 72;
/** A stored or shown summary is cut to this many characters (plus one ellipsis). */
export const SUMMARY_MAX = 300;

/** Whether the screen is wider than tall as the viewer sees it: a sideways rotation (90/270) swaps width and height. */
export function isLandscape({ w, h, rotation = 0 }) {
  const sideways = rotation === 90 || rotation === 270;
  return (sideways ? h : w) > (sideways ? w : h);
}

/** The fill that applies: 'blur' or 'info' on a landscape screen, otherwise 'none'. */
export function fillState({ mode, w, h, rotation = 0 }) {
  return (mode === 'blur' || mode === 'info') && isLandscape({ w, h, rotation }) ? mode : 'none';
}

/**
 * A synopsis cut to at most `max` characters on a word boundary, then one ellipsis (U+2026): at most max + 1
 * characters. Whitespace is collapsed; anything that is not a string is ''. Never splits a surrogate pair.
 */
export function trimSummary(text, max = SUMMARY_MAX) {
  if (typeof text !== 'string') return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  let cut = flat.slice(0, max);
  if (flat[max] !== ' ') {
    const space = cut.lastIndexOf(' ');
    if (space > 0) cut = cut.slice(0, space);
  }
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1); // half a pair
  return `${cut.replace(/[\s,;:.\-–—]+$/, '')}…`;
}

/**
 * Draws `img` into `canvas` at BACKDROP_WIDTH (capped at 64) pixels wide, keeping its aspect. CSS scales the canvas up
 * and the smooth upscaling is the blur. Returns false, drawing nothing, for an image that has not loaded or a canvas
 * that cannot draw; a backdrop is decoration, so it never throws.
 */
export function drawBackdrop(canvas, img, width = BACKDROP_WIDTH) {
  const nw = img?.naturalWidth;
  const nh = img?.naturalHeight;
  if (!(nw > 0 && nh > 0)) return false;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const w = Math.max(1, Math.min(BACKDROP_MAX_WIDTH, Math.round(width)));
  const h = Math.max(1, Math.round((w * nh) / nw));
  try {
    canvas.width = w;
    canvas.height = h;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return true;
  } catch {
    return false;
  }
}

/**
 * The backdrop box in stage pixels (relative to the stage's top-left): the whole screen, centred on the stage, plus
 * `margin` on every side so pixel shift never exposes an edge.
 */
export function backdropBox({ stageW, stageH, screenW, screenH, margin = 0 }) {
  return {
    left: (stageW - screenW) / 2 - margin,
    top: (stageH - screenH) / 2 - margin,
    width: screenW + 2 * margin,
    height: screenH + 2 * margin,
  };
}

/** The info title's font size in px on a screen `screenW` x `screenH` (vmin is the shorter side as the viewer sees it). */
export function infoTitleSize(screenW, screenH) {
  const px = (INFO_TITLE_VMIN * Math.min(screenW, screenH)) / 100;
  return Math.min(INFO_TITLE_MAX_PX, Math.max(INFO_TITLE_MIN_PX, px));
}

/** The right edge, in stage pixels, of what shows of the poster: the frame (the stage) or the scaled poster box, whichever reaches further. */
export function visibleRight({ stageW, box }) {
  return Math.max(stageW, box.left + box.width);
}

/**
 * The info panel box in stage pixels: from the visible poster's right edge (`posterRight`, default the stage's edge) plus a
 * gap, to the screen's edge minus a gap and `margin` (the pixel-shift glide, which carries the panel with the stage), as tall
 * as the stage. Width 0 when that is narrower than PANEL_MIN_EM of the title's font size: no panel.
 */
export function infoBox({ stageW, stageH, screenW, screenH, posterRight = stageW, margin = 0 }) {
  const gap = Math.round(screenH * 0.04);
  const left = posterRight + gap;
  const width = Math.floor((stageW + screenW) / 2 - gap - margin - left);
  const tooNarrow = width < PANEL_MIN_EM * infoTitleSize(screenW, screenH);
  return { left, top: 0, width: tooNarrow ? 0 : width, height: stageH };
}

/**
 * What a backdrop change does to the two canvases (one per poster layer). `next` is the index of the canvas for the poster
 * that is coming up: with `enabled` (blur mode) it is drawn from `img` and becomes the active one, the other fades out.
 * When it is not drawn, or the draw fails, NO canvas stays active: a stale image of an earlier poster must never show.
 * Returns whether the new canvas is showing.
 */
export function swapBackdrop(canvases, next, img, enabled) {
  const drew = Boolean(enabled) && drawBackdrop(canvases[next], img);
  canvases[next].classList.toggle('active', drew);
  canvases[1 - next].classList.remove('active');
  return drew;
}

/**
 * What the info panel says: the title, "rating · runtime · year" (missing parts left out) and the trimmed summary.
 * `formatRuntime` is injected (plex.js owns it, and plex.js imports this module).
 */
export function infoParts(poster, formatRuntime) {
  if (!poster) return { title: '', meta: '', summary: '' };
  return {
    title: poster.title || '',
    meta: [poster.contentRating, formatRuntime(poster.duration), poster.year].filter(Boolean).join(' · '),
    summary: trimSummary(poster.summary, SUMMARY_MAX),
  };
}

// ---- Gap fill inside the frame window (R-FILL-1, D67) ----
// The same tiny-canvas technique as the backdrop, for the empty bands inside the frame window: 'blur' is the poster at 48 px
// upscaled by CSS; 'matte' is one flat colour from the poster's edge. Both sit at BACKDROP_OPACITY inside the stage.

/** The gap fill's styles; 'none' draws nothing. */
export const GAP_STYLES = ['none', 'blur', 'matte'];
/** The share of a poster's width and height, per side, that edgeColour averages. */
export const EDGE_SHARE = 0.02;

/**
 * The average colour of the outermost 2 % of a poster's pixels (a ring at least one pixel thick) as `rgb(r, g, b)`.
 * Pure. Transparent pixels do not count; null when there is nothing to average.
 */
export function edgeColour({ width, height, data }) {
  if (!(width > 0 && height > 0) || !data || data.length < width * height * 4) return null;
  const t = Math.max(1, Math.ceil(EDGE_SHARE * Math.min(width, height)));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    const edgeRow = y < t || y >= height - t;
    for (let x = 0; x < width; x++) {
      if (!edgeRow && x >= t && x < width - t) {
        x = Math.max(x, width - t - 1); // skip the interior of this row
        continue;
      }
      const i = (y * width + x) * 4;
      if (data[i + 3] === 0) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  if (!n) return null;
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}

/**
 * Draws the gap fill for `img` into `canvas`. 'blur' is drawBackdrop. 'matte' reads the poster at 48 px, takes edgeColour
 * and leaves a 1 x 1 canvas of that colour. A canvas the browser will not let us read (a cross-origin poster) draws nothing:
 * false, never a throw, so the matte shows nothing rather than a guess.
 */
export function drawGapFill(canvas, img, style) {
  if (style === 'blur') return drawBackdrop(canvas, img);
  if (style !== 'matte') return false;
  if (!drawBackdrop(canvas, img)) return false;
  try {
    const ctx = canvas.getContext('2d');
    const colour = edgeColour(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (!colour) return false;
    canvas.width = 1;
    canvas.height = 1;
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    return true;
  } catch {
    try {
      canvas.width = 1; // a tainted canvas keeps nothing readable; clear it
    } catch {
      // nothing more to do
    }
    return false;
  }
}

/** swapBackdrop for the gap fill: `style` 'blur' or 'matte' draws the canvas for the poster coming up, anything else shows none. */
export function swapGapFill(canvases, next, img, style) {
  const drew = drawGapFill(canvases[next], img, style);
  canvases[next].classList.toggle('active', drew);
  canvases[1 - next].classList.remove('active');
  return drew;
}

/** Whether the gap layer shows: a style is on and the poster leaves at least one band. The layer fades to this with the poster. */
export function gapLayerOpen(style, bands) {
  return (style === 'blur' || style === 'matte') && Array.isArray(bands) && bands.length > 0;
}
