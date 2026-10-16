// Position mode (R-SET-5, U5): place the poster by dragging it or with the arrow keys while Settings is out of the way,
// instead of with the tiny sliders. On a TV remote the D-pad arrives as arrow keys, so nudging matters more than drag.
// The pure functions are first; createPositionMode() is the controller settings-ui.js wires (nothing happens at import).

import { shiftOffset, shiftRoom, shiftSteps } from './layout.js';

export const OFFSET_MIN = -100;
export const OFFSET_MAX = 100; // the stored range (js/settings.js), also the offset sliders' range
export const SCALE_MIN = 50;
export const SCALE_MAX = 150; // the size slider's range
export const NUDGE_STEP = 0.1; // percent of the stage per arrow press
export const SHIFT_FACTOR = 10;
export const SCALE_STEP = 1; // percent of poster size per + or - press

/**
 * A movement on the screen as a movement along the stage's own axes, unit for unit (no percent yet).
 *
 * The stage is turned by CSS: `.stage { transform: translate(-50%, -50%) rotate(var(--rotation)) }` (css/app.css, set from
 * settings.rotation by display.js), and CSS rotate() is clockwise on a y-down screen. A stage vector (a, b) therefore
 * appears on screen as (a cos t - b sin t, a sin t + b cos t), and the stage-axis movement for a screen movement (sx, sy)
 * is the inverse turn: a = sx cos t + sy sin t, b = -sx sin t + sy cos t. For the four rotations the app allows:
 *    0 : a =  sx, b =  sy
 *   90 : a =  sy, b = -sx   (the stage's x axis points down the screen, its y axis points left)
 *  180 : a = -sx, b = -sy
 *  270 : a = -sy, b =  sx
 */
export function screenToStage({ dx, dy, rotation = 0 }) {
  const turn = ((Math.round(rotation / 90) % 4) + 4) % 4;
  const [x, y] = [[dx, dy], [dy, -dx], [-dx, -dy], [-dy, dx]][turn];
  return { x: x + 0, y: y + 0 }; // `+ 0` turns a -0 into 0
}

/**
 * How far a drag of (dx, dy) screen pixels moves the poster, as a change of the offset fields (percent of the stage's own
 * width and height, as posterBox() reads them). `stageW` and `stageH` are the stage's layout size, which a CSS rotation
 * does not change: 100 px on a 1000 px wide stage is 10 at rotation 0.
 */
export function dragToOffset({ dx, dy, stageW, stageH, rotation = 0 }) {
  const m = screenToStage({ dx, dy, rotation });
  return { x: stageW > 0 ? (m.x / stageW) * 100 : 0, y: stageH > 0 ? (m.y / stageH) * 100 : 0 };
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round1 = (v) => Math.round(v * 10) / 10 + 0;

/** `value` plus `step` (times 10 with Shift), kept inside [min, max]; the range is the offsets' unless given. */
export function nudge(value, step, { shift = false, min = OFFSET_MIN, max = OFFSET_MAX } = {}) {
  return clamp(value + (shift ? step * SHIFT_FACTOR : step), min, max);
}

/**
 * The extent of the glide's whole orbit around the resting position, { minX, maxX, minY, maxY } in screen pixels, read from
 * the same path layout.js steps the stage along (so a change to that path is followed here).
 */
export function shiftOrbit(room) {
  const orbit = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  for (let step = 0; step < shiftSteps(); step++) {
    const { x, y } = shiftOffset(step, room);
    orbit.minX = Math.min(orbit.minX, x) + 0; // `+ 0` turns a -0 into 0
    orbit.maxX = Math.max(orbit.maxX, x) + 0;
    orbit.minY = Math.min(orbit.minY, y) + 0;
    orbit.maxY = Math.max(orbit.maxY, y) + 0;
  }
  return orbit;
}

const ARROWS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
const DOCK_GAP = 16; // px between a side-docked bar and the nearest edge of the stage, poster box or frame (their union)
const DOCK_MIN_W = 200;
const DOCK_MAX_W = 320;
const SIZE_KEYS = { '+': 1, '=': 1, '-': -1, _: -1 };

/**
 * What a key does in position mode: { offsetX, offsetY } for an arrow key (one step in the on-screen direction, so at
 * rotation 90 ArrowRight moves the poster along the stage's y axis) or { scale } for + and -; null for any other key.
 * `current` is { offsetX, offsetY, scale }. Shift multiplies the arrow steps only: a size key always steps by 1, because a US keyboard types `+` with Shift
 * and a plain press must not jump by 10.
 */
export function keyToChange(key, shiftKey, current, rotation = 0) {
  if (key in ARROWS) {
    const [sx, sy] = ARROWS[key];
    const dir = screenToStage({ dx: sx, dy: sy, rotation });
    return {
      offsetX: round1(nudge(current.offsetX, dir.x * NUDGE_STEP, { shift: shiftKey })),
      offsetY: round1(nudge(current.offsetY, dir.y * NUDGE_STEP, { shift: shiftKey })),
    };
  }
  if (key in SIZE_KEYS) {
    return { scale: round1(nudge(current.scale, SIZE_KEYS[key] * SCALE_STEP, { min: SCALE_MIN, max: SCALE_MAX })) };
  }
  return null;
}

/**
 * The controller. Elements and callbacks come in, so nothing here knows about the settings form:
 *   bar, doneButton   the non-modal bar and its Done button (a modal dialog would make the page inert)
 *   surface, stage    the element that takes the drag, and the rotated stage whose size converts pixels to percent
 *   avoid             elements the bar must not overlap (the stage, the poster box, the frame); default [stage]
 *   read()            { offsetX, offsetY, scale, rotation } as the sheet currently has them (previewed values included)
 *   write(change)     applies { offsetX?, offsetY?, scale? } to the sheet's fields and the live preview
 *   onDone()          called after the mode has been left (Done, or Escape)
 * While it is on, `body.positioning` is set: css hides the controls and main.js ignores its shortcut keys.
 */
export function createPositionMode({ bar, doneButton, surface, stage, avoid = [stage], read, write, onDone }) {
  let active = false;
  let drag = null; // { id, x, y, offsetX, offsetY }: the press that is being dragged, with the offsets it started from

  // A drag is measured from the pointer's own two positions, in screen pixels, against the stage's layout size (offsetWidth
  // ignores transforms). Pixel shift only moves the stage by a CSS translate, which cancels out of a difference of two
  // pointer positions, so a drag during a glide measures the same as one at rest.
  function onPointerDown(e) {
    // A press on a button (the empty card's Open settings) is that button's: capturing the pointer would eat its click.
    if (drag || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || bar.contains(e.target) || e.target.closest?.('button, a, input, select')) return;
    const cur = read();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, offsetX: cur.offsetX, offsetY: cur.offsetY };
    surface.setPointerCapture?.(e.pointerId);
    document.body.classList.add('dragging');
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = dragToOffset({ dx: e.clientX - drag.x, dy: e.clientY - drag.y, stageW: stage.offsetWidth, stageH: stage.offsetHeight, rotation: read().rotation });
    write({
      offsetX: round1(clamp(drag.offsetX + d.x, OFFSET_MIN, OFFSET_MAX)),
      offsetY: round1(clamp(drag.offsetY + d.y, OFFSET_MIN, OFFSET_MAX)),
    });
  }

  function onPointerEnd(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    document.body.classList.remove('dragging');
    schedulePlace(); // the poster may now be under the bar
  }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      finish();
      return;
    }
    const cur = read();
    const change = keyToChange(e.key, e.shiftKey, cur, cur.rotation);
    if (!change) return;
    e.preventDefault();
    write(change);
    schedulePlace();
  }

  const intersects = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;

  /**
   * Where an `avoid` element can be at any point of the pixel-shift glide: its rect now, moved back to the resting place
   * (minus the translate it has right now, mid-glide included) and grown by the orbit's extent. The glide carries the stage
   * and what is in it by up to the room on each axis, with no input from the viewer, so the bar is placed clear of all of it.
   * With pixel shift off the stage has no translate and the rect is returned as it is.
   */
  function orbitRect(el) {
    const r = el.getBoundingClientRect();
    if (!stage.style.translate) return r;
    const [tx = 0, ty = 0] = (getComputedStyle(stage).translate || '').split(' ').map((v) => Number.parseFloat(v) || 0); // "none" and a lone "0px" (y omitted) read as 0
    const orbit = shiftOrbit(shiftRoom({ viewportW: window.innerWidth, viewportH: window.innerHeight, stageW: stage.offsetWidth, stageH: stage.offsetHeight, rotation: read().rotation }));
    return { width: r.width, height: r.height, left: r.left - tx + orbit.minX, right: r.right - tx + orbit.maxX, top: r.top - ty + orbit.minY, bottom: r.bottom - ty + orbit.maxY };
  }

  /** The bar is whole on the screen and clear of the poster box, the frame and the stage (every element in `avoid`), over the glide's whole orbit. */
  function isClear() {
    const mine = bar.getBoundingClientRect();
    if (mine.left < -0.5 || mine.top < -0.5 || mine.right > window.innerWidth + 0.5 || mine.bottom > window.innerHeight + 0.5) return false;
    return !avoid.some((el) => {
      const r = orbitRect(el);
      return r.width > 0 && r.height > 0 && intersects(mine, r);
    });
  }

  /**
   * Where everything the bar must clear sits along the viewer's x axis (the UI rotation turns the shell about the screen
   * centre), as offsets from the screen centre: the left and right edges of the union of the `avoid` rects, and the
   * viewer's width. A poster scaled past 100 reaches beyond the stage, so the stage alone is not enough. The rects are the
   * glide's whole orbit (orbitRect), so a side bar stays clear however far the stage has shifted.
   */
  function reachInViewer() {
    const root = getComputedStyle(document.documentElement);
    const theta = ((Number.parseFloat(root.getPropertyValue('--ui-rotation')) || 0) * Math.PI) / 180;
    const cos = Math.round(Math.cos(theta));
    const sin = Math.round(Math.sin(theta));
    let left = Infinity;
    let right = -Infinity;
    for (const el of avoid) {
      const r = orbitRect(el);
      if (!(r.width > 0 && r.height > 0)) continue;
      for (const [x, y] of [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]]) {
        const v = (x - window.innerWidth / 2) * cos + (y - window.innerHeight / 2) * sin;
        left = Math.min(left, v);
        right = Math.max(right, v);
      }
    }
    return { vw: Number.parseFloat(root.getPropertyValue('--vw')) || window.innerWidth, left, right };
  }

  /** Sets the dock: `name` is bottom, top, side or over; a side dock also takes its side and the x and width it is placed with. */
  function setDock(name, side, x, w) {
    bar.dataset.dock = name;
    if (side) bar.dataset.side = side;
    else delete bar.dataset.side;
    if (x === undefined) {
      bar.style.removeProperty('--dock-x');
      bar.style.removeProperty('--dock-w');
    } else {
      bar.style.setProperty('--dock-x', `${x}px`);
      bar.style.setProperty('--dock-w', `${w}px`);
    }
  }

  /**
   * Where the bar goes, tried in this order, each one MEASURED against the poster box, the frame and the stage over the
   * glide's whole orbit (a poster scaled past 100 reaches beyond the stage, a frame or a size changes the margins, so nothing
   * is assumed from the aspect): the viewer's bottom edge (the toast's place); the side margin to the viewer's right, then
   * left, when it is at least DOCK_MIN_W wide; the viewer's top edge; and when none is clear of the poster, the bottom again
   * in a translucent style ('over') so the poster's edge shows through it. Rules and numbers live in css/app.css.
   *
   * `fresh` starts from the first candidate; otherwise a placement that is still clear stays put, so the bar does not hop.
   */
  function place({ fresh = false } = {}) {
    if (!fresh && isClear()) return;
    const { vw, left, right } = reachInViewer();
    const sides = [
      { side: 'right', room: vw / 2 - right - 2 * DOCK_GAP, x: right + DOCK_GAP },
      { side: 'left', room: vw / 2 + left - 2 * DOCK_GAP, x: left - DOCK_GAP },
    ]
      .filter((c) => c.room >= DOCK_MIN_W)
      .sort((a, b) => b.room - a.room); // the wider margin first
    const candidates = [
      () => setDock('bottom'),
      ...sides.map((c) => () => setDock('side', c.side, c.x, Math.min(c.room, DOCK_MAX_W))),
      () => setDock('top'),
    ];
    for (const apply of candidates) {
      apply();
      if (isClear()) return;
    }
    setDock('over');
  }

  // main.js re-lays the stage one animation frame after a resize, from its own resize listener (registered before this
  // one), so a measurement taken in the resize event itself sees the old layout: wait two frames, then place. A preview
  // needs no wait (display.js lays out in a microtask); the wait is for the resize, and the drag-end and key re-places
  // simply share it.
  let pending = 0;
  function schedulePlace() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      pending = requestAnimationFrame(() => {
        pending = 0;
        if (active) place();
      });
    });
  }

  function finish() {
    stop();
    onDone();
  }

  function start() {
    if (active) return;
    active = true;
    document.body.classList.add('positioning');
    bar.hidden = false;
    place({ fresh: true });
    window.addEventListener('resize', schedulePlace);
    surface.addEventListener('pointerdown', onPointerDown);
    surface.addEventListener('pointermove', onPointerMove);
    surface.addEventListener('pointerup', onPointerEnd);
    surface.addEventListener('pointercancel', onPointerEnd);
    document.addEventListener('keydown', onKeyDown);
    doneButton.addEventListener('click', finish);
    doneButton.focus(); // so the arrow keys of a remote work without a click first
  }

  function stop() {
    if (!active) return;
    active = false;
    drag = null;
    document.body.classList.remove('positioning', 'dragging');
    bar.hidden = true;
    window.removeEventListener('resize', schedulePlace);
    cancelAnimationFrame(pending);
    pending = 0;
    surface.removeEventListener('pointerdown', onPointerDown);
    surface.removeEventListener('pointermove', onPointerMove);
    surface.removeEventListener('pointerup', onPointerEnd);
    surface.removeEventListener('pointercancel', onPointerEnd);
    document.removeEventListener('keydown', onKeyDown);
    doneButton.removeEventListener('click', finish);
  }

  return {
    start,
    stop,
    get active() {
      return active;
    },
  };
}
