// Renders the frame and poster: sizing, rotation and cross-fades.

import { detectWindow, findFrame, NO_FRAME, CUSTOM_FRAME_ID } from './frames.js';
import { formatRuntime } from './plex.js';
import { blurPlan, closeGap, gapBands, imageRect, posterBox, shiftOffset, shiftRoom, stageSize } from './layout.js';
import { backdropBox, fillState, infoBox, infoParts, gapLayerOpen, infoTitleSize, swapBackdrop, swapGapFill, visibleRight } from './fill.js';

const POSTER_ASPECT = 2 / 3;
// Empty border per side while pixel shift is on; the stage moves inside it.
const SHIFT_MARGIN = 0.015;
// A decode that has not settled by now never will (the same bound main.js puts on a poster download).
const DECODE_TIMEOUT_MS = 20000;

/** img.decode() that rejects instead of staying pending when the image cannot settle. */
function decodeWithin(img, ms) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Image decode timed out.')), ms);
  });
  return Promise.race([img.decode(), limit]).finally(() => clearTimeout(timer));
}

export function createDisplay(root = document) {
  const el = {
    stage: root.getElementById('stage'),
    box: root.getElementById('poster-box'),
    layers: [root.getElementById('poster-a'), root.getElementById('poster-b')],
    frame: root.getElementById('frame'),
    title: root.getElementById('title-card'),
    backdrop: root.getElementById('fill-backdrop'),
    canvases: [root.getElementById('fill-a'), root.getElementById('fill-b')], // one per poster layer: they cross-fade together
    gap: root.getElementById('gap-fill'),
    gapCanvases: [root.getElementById('gap-a'), root.getElementById('gap-b')], // the gap fill's pair, cross-fading with the poster layers
    info: root.getElementById('info-panel'),
    infoTitle: root.getElementById('info-title'),
    infoMeta: root.getElementById('info-meta'),
    infoSummary: root.getElementById('info-summary'),
    progress: root.getElementById('progress'),
    playerLabel: root.getElementById('player-label'),
  };
  let settings = null;
  let nowPlaying = null; // { session, at }: what setNowPlaying last drew, so a settings change can redraw it
  let frame = { src: '', window: NO_FRAME.window, aspect: POSTER_ASPECT };
  let front = 0;
  const objectUrls = new WeakMap();
  // Which draw owns each layer. A cleanup timer may only touch a layer its own draw still owns:
  // removing src before a load finishes leaves decode() pending forever, which stalled rotation.
  const owners = new WeakMap();
  let drawSeq = 0;
  let shiftStep = 0;
  let shiftTimer = null;
  let shiftEveryMs = 0;
  let fill = 'none'; // the landscape fill in force: 'none' | 'blur' | 'info' (fillMode on a landscape screen)
  let infoRoom = false; // the empty side is wide enough for the info panel
  let gapHideTimer = null; // fallback: takes the gap layer away if the tint's transitionend never comes after gapFill was turned off
  let gapHideCancel = null; // removes the pending transitionend listener of that hide
  let gapStyle = 'none'; // the gap fill in force: 'none' | 'blur' | 'matte' (the gapFill setting; the layer shows only while a band does)
  let infoText = false; // the poster on screen has a title for the panel to show

  /** Runs the pixel-shift step timer while `pixelShift` is on, restarting it only when the interval changes. */
  function syncShiftTimer() {
    const every = settings?.pixelShift ? Math.max(1, settings.pixelShiftMinutes) * 60000 : 0;
    if (every === shiftEveryMs) return;
    clearInterval(shiftTimer);
    shiftTimer = null;
    shiftEveryMs = every;
    if (every) {
      shiftTimer = setInterval(() => {
        shiftStep++;
        layout();
      }, every);
    }
  }

  async function loadFrame(s) {
    const builtIn = findFrame(s.frameId);
    const src = s.frameId === CUSTOM_FRAME_ID ? s.customFrameUrl : builtIn?.src ?? findFrame('marquee').src;
    if (!src) {
      frame = { src: '', window: NO_FRAME.window, aspect: POSTER_ASPECT };
      el.frame.hidden = true;
      el.frame.removeAttribute('src');
      return;
    }
    if (src === frame.src) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    try {
      await img.decode();
    } catch {
      throw new Error(`Could not load frame image "${src}".`);
    }
    let win = builtIn && s.frameId !== CUSTOM_FRAME_ID ? builtIn.window : null;
    if (!win) win = detectFromImage(img) || NO_FRAME.window;
    frame = { src, window: win, aspect: img.naturalWidth / img.naturalHeight };
    el.frame.src = src;
    el.frame.hidden = false;
  }

  function detectFromImage(img) {
    try {
      // Sample at reduced size: plenty of precision for percentages, much cheaper.
      const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return detectWindow(ctx.getImageData(0, 0, c.width, c.height));
    } catch {
      return null; // cross-origin frame: canvas is tainted
    }
  }

  /** The gap fill of the poster on screen (after the style changed), drawn from its decoded layer; none when there is none to draw. */
  function drawFrontGap() {
    const img = el.layers[front];
    const style = img.classList.contains('active') ? gapStyle : 'none';
    // The blur needs the layout (its plan), so layoutGap draws it; it is never drawn from here, whole and ghost-making (D95).
    swapGapFill(el.gapCanvases, front, img, style === 'blur' ? 'none' : style);
  }

  /**
   * Fits the poster box to the frame window and shows the gap fill in the bands the poster leaves (D67). A gap under 4 px is
   * closed, never filled: a contained poster grows evenly about its centre until it meets the window, and is cropped a few pixels
   * only when the box's own bands are under 4 px. Returns the box to use.
   * With gapFill off nothing changes: the box is the one posterBox gave and the gap layer stays hidden.
   */
  function layoutGap(stageW, stageH, box) {
    const want = settings.gapFill === 'blur' || settings.gapFill === 'matte' ? settings.gapFill : 'none';
    let fit = settings.posterFit;
    let out = box;
    let open = false;
    const was = gapStyle;
    gapStyle = want;
    let plan = null;
    if (want !== 'none') {
      const win = posterBox({ stageW, stageH, win: frame.window });
      const img = el.layers[front];
      const known = img.classList.contains('active') && img.naturalWidth > 0;
      const aspect = known ? img.naturalWidth / img.naturalHeight : POSTER_ASPECT;
      const closed = closeGap({ win, box, aspect, fit });
      out = closed.box;
      fit = closed.fit;
      open = gapLayerOpen(want, gapBands({ win, box: out, aspect, fit }));
      Object.assign(el.gap.style, { left: `${win.left}px`, top: `${win.top}px`, width: `${win.width}px`, height: `${win.height}px` });
      // The blurred copy continues the poster: the poster sits on its tile and the poster's edge rows and columns are stretched
      // out to the window, so a wide band shows no inner detail of the poster (D95). Drawn again here, as the layout decides it.
      plan = want === 'blur' && known ? blurPlan({ win, shown: imageRect({ box: out, aspect, fit }), imageAspect: aspect, fit }) : null;
      if (plan) {
        swapGapFill(el.gapCanvases, front, img, 'blur', plan);
        Object.assign(el.gapCanvases[front].style, { left: `${plan.rect.left}px`, top: `${plan.rect.top}px`, width: `${plan.rect.width}px`, height: `${plan.rect.height}px` });
      } else {
        // The matte (one pixel) and a blur with no plan cover the whole window: a rectangle left over from an earlier blur would
        // leave part of the bands black after a resize (D89: the matte is unchanged).
        Object.assign(el.gapCanvases[front].style, { left: '0px', top: '0px', width: `${win.width}px`, height: `${win.height}px` });
      }
    }
    // A change of style redraws the matte or clears the canvas. A blur drawn from its plan above is not touched again: it would be
    // cleared and drawn once more (or left cleared) for the want of the plan that only this function has (D95).
    if (want !== was && !plan) drawFrontGap();
    // The layer stays in the page while the style is on; its tint fades with the poster (css/app.css), so a poster with no band
    // fades it out and one with a band fades it in, instead of either switching at once. Its black window stays opaque to the
    // end of the fade, and the poster box stays transparent over it, so nothing behind the window (the landscape backdrop) shows.
    clearTimeout(gapHideTimer);
    if (gapHideCancel) gapHideCancel();
    el.gap.classList.toggle('open', open);
    if (want !== 'none') el.gap.hidden = false;
    if (open) {
      el.box.classList.add('gap-open');
    } else if (want !== 'none' ? el.box.classList.contains('gap-open') : !el.gap.hidden) {
      // No band now (a poster with none, or the style turned off): the tint fades out first, and the box stays transparent over the
      // layer until that fade ends, so the dim band does not snap to black. Then the box takes its black back, and the layer
      // goes too when the style is off. The end is the tint's own transitionend for opacity; the timer only covers a missed event.
      // Either one cancels the other, and the next pass cancels both.
      const tint = el.gap.firstElementChild;
      const done = () => {
        if (gapHideCancel) gapHideCancel();
        if (want === 'none') el.gap.hidden = true;
        el.box.classList.remove('gap-open');
      };
      const onEnd = (e) => {
        if (e.target === tint && e.propertyName === 'opacity') done();
      };
      tint.addEventListener('transitionend', onEnd);
      gapHideCancel = () => {
        tint.removeEventListener('transitionend', onEnd);
        clearTimeout(gapHideTimer);
        gapHideCancel = null;
      };
      gapHideTimer = setTimeout(done, (settings?.crossfadeMs ?? 0) + 500);
    }
    return { box: out, fit };
  }

  /** The backdrop of the poster on screen, drawn from its (already decoded) layer; nothing shows when there is none to draw. */
  function drawFrontBackdrop() {
    const img = el.layers[front];
    swapBackdrop(el.canvases, front, img, img.classList.contains('active'));
  }

  /**
   * Cuts a backdrop canvas with its poster layer. main.js hides a poster that is fading out and no longer allowed with
   * `.cut` (K20, C7M1); the canvas of the same index gets `.cut` in the same task (a mutation observer's microtask), so
   * a blurred copy of the title the limit just disallowed does not finish its fade.
   */
  function mirrorCut() {
    el.layers.forEach((layer, i) => {
      const cut = layer.classList.contains('cut');
      el.canvases[i].classList.toggle('cut', cut);
      el.gapCanvases[i].classList.toggle('cut', cut); // the gap fill is a copy of the poster too
    });
  }
  if (typeof MutationObserver === 'function') {
    const watcher = new MutationObserver(mirrorCut);
    el.layers.forEach((layer) => watcher.observe(layer, { attributes: true, attributeFilter: ['class'] }));
  }

  function syncInfoVisibility() {
    el.info.hidden = !(fill === 'info' && infoRoom && infoText);
  }

  /**
   * Lets the synopsis take the lines left under the title and the facts, so a long one ends in an ellipsis inside the box
   * instead of running off its bottom. Measured, so it runs only while the panel shows (on a change of box or text).
   */
  function fitInfoSummary() {
    const summary = el.infoSummary;
    summary.style.removeProperty('--info-lines');
    if (el.info.hidden || summary.hidden) return;
    const lineHeight = parseFloat(getComputedStyle(summary).lineHeight);
    if (!(lineHeight > 0)) return;
    const parts = [el.infoTitle, el.infoMeta].filter((part) => !part.hidden);
    const gap = parseFloat(getComputedStyle(el.infoTitle.parentElement).rowGap) || 0;
    const used = parts.reduce((sum, part) => sum + part.offsetHeight, 0) + parts.length * gap;
    summary.style.setProperty('--info-lines', String(Math.max(1, Math.floor((el.info.clientHeight - used) / lineHeight))));
  }

  /**
   * Places the landscape fill (stage pixels; the stage's rotation and pixel shift carry it) and shows the one that applies.
   * `posterRight` is where the visible poster ends, in stage pixels: the info panel starts after it.
   */
  function layoutFill(stageW, stageH, screenW, screenH, posterRight) {
    const mode = fillState({ mode: settings.fillMode, w: window.innerWidth, h: window.innerHeight, rotation: settings.rotation });
    const was = fill;
    fill = mode;
    el.backdrop.hidden = mode !== 'blur';
    // Room for the pixel-shift glide, so an edge of the screen is never bare and the panel never slides off it.
    const margin = settings.pixelShift ? Math.ceil(SHIFT_MARGIN * Math.max(screenW, screenH)) + 2 : 0;
    if (mode === 'blur') {
      const b = backdropBox({ stageW, stageH, screenW, screenH, margin });
      Object.assign(el.backdrop.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
      if (was !== 'blur') drawFrontBackdrop();
    }
    if (mode === 'info') {
      const b = infoBox({ stageW, stageH, screenW, screenH, posterRight, margin });
      Object.assign(el.info.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
      el.info.style.setProperty('--info-title-size', `${infoTitleSize(screenW, screenH)}px`);
      infoRoom = b.width > 0;
    }
    syncInfoVisibility();
    fitInfoSummary();
  }

  function layout() {
    if (!settings) return null;
    const { width, height } = stageSize({
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      aspect: frame.aspect,
      rotation: settings.rotation,
      margin: settings.pixelShift ? SHIFT_MARGIN : 0,
    });
    el.stage.style.width = `${width}px`;
    el.stage.style.height = `${height}px`;
    const sideways = settings.rotation === 90 || settings.rotation === 270;
    if (settings.pixelShift) {
      // Room left on the tighter axis, in screen pixels (the stage is rotated into place by CSS).
      const room = shiftRoom({ viewportW: window.innerWidth, viewportH: window.innerHeight, stageW: width, stageH: height, rotation: settings.rotation });
      const { x, y } = shiftOffset(shiftStep, room);
      el.stage.style.translate = `${x}px ${y}px`;
    } else {
      el.stage.style.removeProperty('translate');
    }
    el.stage.style.setProperty('--rotation', `${settings.rotation}deg`);

    // The UI shell follows the stage unless rotateUi is off (OS-level rotation). --vw/--vh are the
    // screen's size as the viewer sees it, used by the controls, toast and top-layer dialogs.
    const uiRotation = settings.rotateUi === false ? 0 : settings.rotation;
    const uiSideways = uiRotation === 90 || uiRotation === 270;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--ui-rotation', `${uiRotation}deg`);
    rootStyle.setProperty('--vw', `${uiSideways ? window.innerHeight : window.innerWidth}px`);
    rootStyle.setProperty('--vh', `${uiSideways ? window.innerWidth : window.innerHeight}px`);

    const planned = posterBox({
      stageW: width,
      stageH: height,
      win: frame.window,
      scale: settings.posterScale,
      offsetX: settings.posterOffsetX,
      offsetY: settings.posterOffsetY,
    });
    const { box, fit } = layoutGap(width, height, planned);
    Object.assign(el.box.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });
    el.box.style.setProperty('--poster-fit', fit);
    rootStyle.setProperty('--fade-ms', `${settings.crossfadeMs}ms`);
    layoutFill(width, height, sideways ? window.innerHeight : window.innerWidth, sideways ? window.innerWidth : window.innerHeight, visibleRight({ stageW: width, box }));
    return box;
  }

  function drawNowPlaying(session, elapsed) {
    const bar = el.progress;
    const showBar = Boolean(settings?.showProgress && session && session.duration > 0);
    bar.hidden = !showBar;
    bar.style.transition = 'none';
    if (showBar) {
      const playing = session.playerState === 'playing'; // paused and buffering sit still
      const offset = Math.min(session.duration, session.viewOffset + (playing ? elapsed : 0));
      bar.style.transform = `scaleX(${offset / session.duration})`;
      if (playing && offset < session.duration) {
        void bar.offsetWidth; // commit the start position, so the transition begins from it
        bar.style.transition = `transform ${session.duration - offset}ms linear`;
        bar.style.transform = 'scaleX(1)';
      }
    } else {
      bar.style.transform = 'scaleX(0)';
    }
    const label = settings?.showPlayer && session?.playerTitle ? `Playing in ${session.playerTitle}` : '';
    el.playerLabel.hidden = !label;
    el.playerLabel.textContent = label;
  }

  return {
    /**
     * Sets the brightness filter on the frame or the whole stage and clears it on the other. Never the poster
     * layers or #poster-box. No transition or animation: callers change it once a minute.
     */
    setBrightness(level, target) {
      const value = level < 1 ? `brightness(${level})` : '';
      const dim = target === 'stage' ? el.stage : el.frame;
      const clear = dim === el.stage ? el.frame : el.stage;
      dim.style.filter = value;
      clear.style.filter = '';
    },
    async apply(s) {
      const barOrLabelChanged = settings && (settings.showProgress !== s.showProgress || settings.showPlayer !== s.showPlayer);
      settings = s;
      syncShiftTimer();
      // The bar and the label follow their settings at once, a live preview included; the poster on screen is unchanged.
      if (barOrLabelChanged) this.redrawNowPlaying();
      await loadFrame(s).catch((err) => {
        frame = { src: '', window: NO_FRAME.window, aspect: POSTER_ASPECT };
        el.frame.hidden = true;
        throw err;
      }).finally(layout);
      this.setTitle(this.currentPoster);
    },

    layout,

    /** Current poster box size in CSS pixels (used to request a right-sized image). */
    posterSize() {
      const b = layout();
      return b ? { width: b.width, height: b.height } : { width: 600, height: 900 };
    },

    currentPoster: null,

    /** Shows an image (Blob or URL) with a cross-fade. Resolves once it is visible. */
    async show(poster, image) {
      const next = el.layers[1 - front];
      const prev = el.layers[front];
      const url = image instanceof Blob ? URL.createObjectURL(image) : image;
      owners.set(next, ++drawSeq); // from here no earlier draw's timer may clear this layer
      const stale = objectUrls.get(next); // its earlier draw's timer will now skip it, so release here
      if (stale) {
        URL.revokeObjectURL(stale);
        objectUrls.delete(next);
      }
      next.src = url;
      next.alt = poster.title ? `Poster: ${poster.title}` : 'Poster';
      try {
        await decodeWithin(next, DECODE_TIMEOUT_MS);
      } catch {
        if (image instanceof Blob) URL.revokeObjectURL(url);
        throw new Error('Poster image could not be decoded.');
      }
      if (image instanceof Blob) objectUrls.set(next, url);
      next.classList.add('active');
      prev.classList.remove('active');
      // The backdrop changes in the same task as the poster, through the same transition, so the two stay in step.
      swapBackdrop(el.canvases, 1 - front, next, fill === 'blur');
      // and the gap fill, through the same transition: the matte now, the blur by layout() just below, which knows where it goes
      swapGapFill(el.gapCanvases, 1 - front, next, gapStyle === 'blur' ? 'none' : gapStyle);
      front = 1 - front;
      if (settings) layout(); // this poster's shape decides which bands it leaves
      this.currentPoster = poster;
      this.setTitle(poster);

      const old = objectUrls.get(prev);
      if (old) {
        const owner = owners.get(prev);
        setTimeout(() => {
          if (owners.get(prev) === owner && !prev.classList.contains('active')) {
            URL.revokeObjectURL(old);
            objectUrls.delete(prev);
            prev.removeAttribute('src');
          }
        }, (settings?.crossfadeMs ?? 0) + 200);
      }
    },

    /**
     * The overlay slot: the 2.0.0 title line when `showTitle`, and "rating · runtime · year" when `showMeta`.
     * It also fills the landscape info panel (title, the same meta line, the trimmed summary) from the same poster.
     */
    setTitle(poster) {
      const info = infoParts(poster, formatRuntime);
      el.infoTitle.textContent = info.title;
      el.infoMeta.textContent = info.meta;
      el.infoMeta.hidden = !info.meta;
      el.infoSummary.textContent = info.summary;
      el.infoSummary.hidden = !info.summary;
      infoText = Boolean(info.title);
      syncInfoVisibility();
      fitInfoSummary();
      const lines = [];
      if (settings?.showTitle && poster?.title) lines.push([poster.title, poster.year && `(${poster.year})`].filter(Boolean).join(' '));
      if (settings?.showMeta && poster) {
        const meta = [poster.contentRating, formatRuntime(poster.duration), poster.year].filter(Boolean).join(' · ');
        if (meta) lines.push(meta);
      }
      el.title.hidden = !lines.length;
      el.title.replaceChildren(
        ...lines.map((text) => {
          const line = document.createElement('div');
          line.textContent = text;
          return line;
        }),
      );
    },

    /**
     * The playback progress bar and the optional player label for the session on screen (null: neither).
     * The bar is set to where the session is (`viewOffset` of `duration`) and then given ONE linear transition to
     * the end lasting the remaining time, so it advances between polls with no timer; only a `playing` session moves (paused and buffering sit still).
     * The next poll sets it again, which is where a jump shows (Plex reports `viewOffset` every ~10 s).
     */
    setNowPlaying(session) {
      nowPlaying = session ? { session, at: Date.now() } : null;
      drawNowPlaying(session, 0);
    },

    /** Draws the last session again under the current settings, moved on by the time since it was drawn while it plays. */
    redrawNowPlaying() {
      if (nowPlaying) drawNowPlaying(nowPlaying.session, Date.now() - nowPlaying.at);
    },
  };
}
