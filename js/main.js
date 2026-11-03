// App bootstrap: wires settings, Plex, the poster engine, display and controls together.

import { createBackoff } from './backoff.js';
import { createBrightnessTimer } from './brightness-timer.js';
import { createDisplay } from './display.js';
import { createEngine } from './engine.js';
import { createHelper } from './helper.js';
import { cornerZone, createHold, HOLD_MS, inZone, REVEAL_MS, shouldResetPin } from './kiosk.js';
import { createPinGate } from './pin-gate.js';
import { createSource, serverTypeOf, signInFlow } from './sources/index.js';
import { createPosterCache } from './poster-cache.js';
import { createPosterPin } from './poster-pin.js';
import { allows } from './ratings.js';
import { createReload, takeCarriedPlayback } from './reload.js';
import { requestSize } from './layout.js';
import { createLimitWatch } from './limit-schedule.js';
import { anyWindow, resolveSettings } from './profiles.js';
import { createShownStore } from './weighting.js';
import { isPlausibleClock } from './schedule.js';
import { posterMatches, selectionKey, selectionOf } from './selection.js';
import { applyServerText, createSettingsUI, pinSignIn } from './settings-ui.js';
import { fromImport, isConfigured, load, save, STORAGE_KEY } from './settings.js';
import { keyMap, listShortcuts, normalizeKey } from './shortcuts.js';
import { createSleepControl, playbackMatters } from './sleep-control.js';
import { createTvPower, DIAG_TEMP_MS } from './tv-power.js';
import { actionButton, clientId as getClientId, createLog, formatDuration, safeStorage, sleep, toast } from './util.js';

export const VERSION = '2.4.0';

const carriedPlayback = takeCarriedPlayback();

const storage = safeStorage();
const log = createLog();
const cache = createPosterCache({ storage, limit: () => state.settings.posterCacheLimit });
const display = createDisplay();
const helper = createHelper({ log });
const clientIdValue = getClientId(storage);
const $ = (id) => document.getElementById(id);

const state = {
  settings: load(storage).settings,
  paused: false,
  timer: 0,
  nextAt: 0,
  offlineSince: 0,
  lastSuccessAt: 0,
  lastError: '',
  lastReason: '',
  directImages: false, // set when the server doesn't allow fetching images (CORS)
  wakeLock: null,
  busy: false,
  forceAfter: false, // a forced tick was asked for while one was running; it runs when that one ends
  asleep: false,
  sleepWhy: '', // 'schedule' | 'idle' | 'manual wake' | ''
  playing: false, // the last poll saw a matching session (only polled while sleep needs it)
  lastPlaybackAt: carriedPlayback ?? Date.now(),
  manualWakeUntil: 0,
  swallowUntil: 0, // performance.now() until which clicks are swallowed (after a press that only woke the display)
  pollFailing: false,
  tvWaking: false, // between the power-on request at wake and the end of TV_WAKE_MS: no poster is fetched yet
  tickAfterWake: null, // a tick() that arrived while tvWaking, { force, notify }: it runs when the window ends
  pollError: null, // the error of this tick's failed playback poll, handed to decide() so it does not ask again
  pollFailures: 0, // consecutive failed playback polls
  sleepClock: { wall: Date.now(), mono: performance.now() },
};

let client = null;
let engine = null;
let lastDrawAt = -Infinity; // performance.now() of the last poster draw: its crossfade may still be running
let pinResetFlag = false; // config.json served {"resetPin": true} on this load
const backoff = createBackoff({ baseMs: 5000, maxMs: 5 * 60 * 1000 });

/** The sign-in flow of the configured server type; its `label` and `words` are what the screens say about the server. A type no adapter knows reads Plex's words here: it is never used to connect (see `sourceError`). */
const signIn = () => {
  try {
    return signInFlow(state.settings);
  } catch {
    return signInFlow({});
  }
};

let sourceError = null; // why no client could be built for a configured display (a stored server type this build has no adapter for), or null

function rebuildClient() {
  const s = state.settings;
  sourceError = null;
  try {
    client = isConfigured(s) ? createSource(s, { clientId: clientIdValue, version: VERSION }) : null;
  } catch (err) {
    client = null; // never a Plex connection by default (D139 1): the card says what is wrong
    sourceError = err;
    log.error(err.message);
  }
  engine = client
    ? createEngine({
        client,
        getSettings: () => state.settings,
        // D37: while a limit is set, each online pool load re-confirms the cached titles' ratings.
        cachedKeys: () => cache.entries().map((e) => e.ratingKey),
        onRatings: (posters) => cache.refreshRatings(posters),
        onMembers: (id, keys) => cache.syncMembers(id, keys), // a collection or playlist listed online: entries that left it lose the membership
      })
    : null;
  state.directImages = false;
}

// ---------- Poster cycle ----------

function intervalMs() {
  const s = state.settings;
  const rotate = s.rotateSeconds * 1000;
  return s.showNowPlaying || playbackMatters(s) ? Math.min(rotate, s.nowPlayingPollSeconds * 1000) : rotate;
}

function schedule(ms) {
  clearTimeout(state.timer);
  state.nextAt = 0;
  if (state.paused || !engine) return;
  state.nextAt = Date.now() + ms;
  state.timer = setTimeout(() => tick(), ms);
}

const REFUSED_RETRY_MS = 1000; // after a poster was refused at the draw, pick another soon, not a rotation later
const cachedBlobs = new WeakSet(); // blobs served from the poster cache (not freshly downloaded)

// ---------- Household limit on what is already on screen ----------

/**
 * The settings in force now (R-FILT-2, R-PROF-1, js/profiles.js): the stored settings with the household limit in force and, while a
 * slot names a profile, that profile's selection, weighting, now-playing rule and frame. Every reader of the limit, the selection or the
 * frame in this file calls this; `state.settings.maxContentRating` is only the base limit and is not read for a decision.
 */
const inForceSettings = () => resolveSettings(state.settings, new Date());
const limitNow = () => inForceSettings().maxContentRating;

/** May this poster stay on screen under the current settings? A pinned poster is exempt (D5), and so is a now-playing one unless `limitNowPlaying` is on. */
function allowedOnScreen(poster) {
  const s = state.settings;
  const inForce = inForceSettings();
  if (allows(inForce.maxContentRating, poster.contentRating)) return true;
  if (s.staticRatingKey && poster.ratingKey === s.staticRatingKey) return true;
  return poster.source === 'now-playing' && inForce.limitNowPlaying === false;
}

/** Does the poster still belong to the selection in force? Only a random or cached poster is the selection's to judge: the pinned one (a random poster that was pinned in place) and a now-playing one are not (D5). */
function inSelectionNow(poster) {
  if (state.settings.staticRatingKey && poster.ratingKey === state.settings.staticRatingKey) return true; // the poster pinned with the Pin button stays, whatever its source (D5, D122 1)
  const inForce = inForceSettings();
  return posterMatches(selectionOf(inForce), inForce.maxContentRating, poster);
}

// The poster that the last crossfade replaced: its layer may still be fading out when the limit changes (C7M1).
let outgoingPoster = null;

/**
 * A poster fading out is still on screen. When it is no longer allowed, its layer is hidden at once (`.cut`, no fade);
 * the poster fading in stays. The class is dropped by the next draw (showPoster).
 */
function cutOutgoing() {
  if (!outgoingPoster || allowedOnScreen(outgoingPoster)) return;
  document.querySelectorAll('.poster-layer:not(.active)').forEach((img) => {
    img.classList.add('cut');
    img.alt = '';
  });
  outgoingPoster = null;
}

/**
 * Takes a poster that is not allowed off the screen at once, online or off (K20): the layers are hidden
 * (`body.poster-blocked`, no fade) and the display forgets it, so a fallback or the empty card follows.
 */
function blockPoster() {
  outgoingPoster = null;
  document.body.classList.add('poster-blocked');
  document.querySelectorAll('.poster-layer').forEach((img) => {
    img.classList.remove('active');
    img.alt = '';
  });
  display.currentPoster = null;
  display.setTitle(null);
  display.setNowPlaying(null);
}

/** Whatever is on screen is checked against the limit in force now: a poster that is not allowed comes off at once, a fading one is cut. */
function enforceOnScreen() {
  if (display.currentPoster && !allowedOnScreen(display.currentPoster)) blockPoster();
  else cutOutgoing(); // a poster still fading out under a crossfade is not allowed to finish its fade (C7M1)
}

// The slot in force changes at a slot boundary with no Save and no reload. A one second check (as sleep and the daily reload
// use) follows the clock through sleep, wake, a tab left hidden and a clock that jumps; it needs no timer to re-arm. A stricter
// limit takes the poster off at once, exactly as a Save does, and a forced tick draws its replacement; a looser one waits for the next rotation.
const limitWatch = createLimitWatch({
  getSettings: () => state.settings,
  onChange: () => {
    enforceOnScreen();
    // A boundary that changes the profile (D117 7): a poster the new profile's selection does not allow comes off at once, as one above
    // the limit does; an allowed one stays. This comes before the frame is applied, which may wait on a custom image.
    if (display.currentPoster && !inSelectionNow(display.currentPoster)) blockPoster();
    display.apply(inForceSettings()).catch((err) => log.warn(err.message)); // a new frame applies without a reload; weighting and the pool follow at the next draw
    // A boundary replaces the poster on screen only when it is no longer allowed (D105): an allowed poster stays, paused or not,
    // and a looser limit takes effect at the next rotation (the pool key already follows the limit in force).
    if (display.currentPoster) return;
    if (state.busy) state.forceAfter = true; // a tick already running began under the old limit
    tick({ force: true });
  },
});

/**
 * The progress bar and player label follow the session the engine saw this tick, but only while that very
 * session's poster is on screen and allowed there (the engine already drops a title the limit hides).
 */
function updateNowPlaying() {
  const session = engine?.session;
  const shown = display.currentPoster;
  const live = session && shown && shown.source === 'now-playing' && shown.ratingKey === session.ratingKey && allowedOnScreen(shown);
  display.setNowPlaying(live ? session : null);
}

/**
 * Draws a poster, but only if the CURRENT settings still allow it (R4): the limit may have been tightened while
 * the image was downloading or decoding. Returns false, drawing nothing, when it is not allowed; the caller
 * must then not mark it shown (the next tick picks another). A successful draw ends a block.
 */
async function showPoster(poster, image) {
  if (!allowedOnScreen(poster) || !inSelectionNow(poster)) return false; // a draw that finishes after a boundary meets the selection in force now (D120 6)
  document.querySelectorAll('.poster-layer.cut').forEach((img) => img.classList.remove('cut'));
  const outgoing = display.currentPoster;
  await display.show(poster, image);
  lastDrawAt = performance.now();
  if (!allowedOnScreen(poster) || !inSelectionNow(poster)) {
    blockPoster(); // the limit was tightened, or the selection changed, during the decode
    return false;
  }
  outgoingPoster = outgoing;
  cutOutgoing(); // the limit may have been tightened during the decode, with the old poster now fading out
  document.body.classList.remove('poster-blocked');
  return true;
}

async function fetchImage(poster, { skipCache = false } = {}) {
  const size = requestSize(display.posterSize(), window.devicePixelRatio || 1);
  const url = client.imageUrl(poster.thumb, size);
  if (state.directImages) return url;
  const hit = skipCache ? null : await cache.lookup(poster, size).catch(() => null);
  if (hit) {
    cachedBlobs.add(hit);
    return hit;
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout?.(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    cache.put(poster, blob, size).catch((err) => log.warn(`Could not cache poster: ${err.message}`));
    return blob;
  } catch (err) {
    // fetch() reports CORS blocks and a dead server the same way. If a plain <img> can
    // still load it, it's CORS: display directly from now on, without offline caching.
    if (err instanceof TypeError && (await imageLoads(url))) {
      state.directImages = true;
      log.warn('Server blocked image download; showing posters directly (offline cache disabled).');
      return url;
    }
    throw err;
  }
}

function imageLoads(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function tick({ force = false, notify = false } = {}) {
  if (!engine || state.busy) return;
  if (state.tvWaking) {
    // No poster is fetched until the TV is awake, but the call is not lost: the end of the window runs it.
    state.tickAfterWake = { force: force || Boolean(state.tickAfterWake?.force), notify: notify || Boolean(state.tickAfterWake?.notify) };
    return;
  }
  state.busy = true;
  try {
    const sessions = await sleepControl.pollPlayback(); // fetched once; decide() reuses it
    const sessionsError = state.pollError; // a failed poll is not repeated by decide() (C8M1)
    // Asleep (or the TV still waking, the wake having begun during the poll above): Plex is polled, but no poster
    // is chosen, fetched or shown; the end of the TV wake ticks again.
    const decision = state.asleep || state.tvWaking ? null : await engine.decide({ force: force || document.body.classList.contains('poster-blocked'), sessions, sessionsError });
    let refused = false; // a poster was fetched but the limit no longer allows it
    if (decision) {
      cache.refreshRatings([decision.poster]); // seen online: its stored rating follows Plex (C7M2)
      let image = await fetchImage(decision.poster);
      // (Asleep by now: the download began before sleep did; it is not drawn under the veil.)
      let drawn = false;
      if (!state.asleep) {
        try {
          drawn = await showPoster(decision.poster, image);
          refused = !drawn;
        } catch (err) {
          if (!cachedBlobs.has(image)) throw err;
          // The cached copy will not decode: drop it and download once (no retry loop).
          log.warn(`Cached poster "${decision.poster.title}" is unreadable; downloading it again.`);
          await cache.delete(decision.poster.ratingKey).catch(() => {});
          image = await fetchImage(decision.poster, { skipCache: true });
          if (!state.asleep) {
            // (Sleep may have begun during this second download too.)
            drawn = await showPoster(decision.poster, image);
            refused = !drawn;
          }
        }
      }
      if (drawn) {
        engine.shown(decision.poster);
        state.lastReason = decision.reason;
        log.info(`Showing "${decision.poster.title}" (${decision.reason})`);
      }
    }
    if (!state.asleep) updateNowPlaying();
    state.lastSuccessAt = Date.now();
    if (state.offlineSince) log.info(`Back online after ${formatDuration(Date.now() - state.offlineSince)}`);
    state.offlineSince = 0;
    state.lastError = '';
    backoff.reset();
    showEmpty(false);
    schedule(refused ? REFUSED_RETRY_MS : intervalMs());
  } catch (err) {
    await handleFailure(err, { notify });
  } finally {
    state.busy = false;
    updateStatus();
    updatePinButton();
    if (state.forceAfter) {
      state.forceAfter = false;
      tick({ force: true });
    }
  }
}

async function handleFailure(err, { notify = false } = {}) {
  display.setNowPlaying(null); // what Plex last said about playback is no longer known
  state.lastError = err.message;
  const fatal = err.kind === 'auth' || err.kind === 'empty';
  // "Can't reach Plex" is for a server that did not answer. An auth or empty result is an answer: the empty card says what is wrong.
  if (fatal) state.offlineSince = 0;
  else if (!state.offlineSince) state.offlineSince = Date.now();
  log[fatal ? 'error' : 'warn'](err.message);

  // Keep the screen interesting while Plex is unavailable: rotate through cached posters. Under a content
  // limit only entries at or below it count (cache.random enforces that); a cached poster that will not
  // decode is dropped from the cache and one more is tried, so a bad entry neither shows nor repeats.
  const current = display.currentPoster ? engine?.current : null; // nothing on screen (blocked) = due at once
  const due = !current || Date.now() - (current.shownAt || 0) >= state.settings.rotateSeconds * 1000;
  if (due && !fatal && !state.asleep) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const cached = await cache.random(current?.ratingKey, limitNow(), selectionOf(inForceSettings())).catch(() => null);
      if (!cached) break;
      try {
        if (!(await showPoster(cached.poster, cached.blob))) continue; // no longer allowed: not drawn, not shown
      } catch {
        log.warn(`Cached poster "${cached.poster.title}" is unreadable; dropping it.`);
        await cache.delete(cached.poster.ratingKey).catch(() => {});
        continue;
      }
      engine?.shown(cached.poster);
      state.lastReason = 'offline – cached';
      break;
    }
  }
  // A saved selection that draws nothing takes a poster that no longer belongs to it off, so the empty card can name the selection;
  // a poster that still matches stays (D110 item 1).
  if (err.kind === 'empty' && display.currentPoster && !posterMatches(selectionOf(inForceSettings()), limitNow(), display.currentPoster)) blockPoster();
  if (!display.currentPoster) {
    // The limit is the reason only when it emptied the cache: posters are cached, and none of them passes it (D73).
    const stored = cache.entries();
    const limit = limitNow();
    const limited = limit && !fatal && stored.length > 0 && !stored.some((e) => allows(limit, e.contentRating));
    showEmpty(true, limited ? `No posters within the household limit are available while ${signIn().label} is unreachable.` : err.message, err.kind);
  }
  // A refresh somebody asked for that fails with a poster still on screen has nothing else to say so: the toast carries the fixes.
  if (notify && fixesFor(err.kind).length) {
    toast(err.message, { actions: fixesFor(err.kind).map((fix) => ({ label: fix.label, onClick: () => runFix(fix.id) })), ms: 15_000 });
  }
  // Asleep, the only thing to retry is the playback poll: keep it at its normal rate, not the 5 minute backoff.
  const retryMs = fatal ? 5 * 60 * 1000 : backoff.next();
  schedule(state.asleep ? Math.min(retryMs, state.settings.nowPlayingPollSeconds * 1000) : retryMs);
}

// ---------- Sleep, display power, reload, brightness ----------

// Their code is in js/sleep-control.js, tv-power.js, reload.js and brightness-timer.js; the timers start here, in this order.
const brightness = createBrightnessTimer({ display, getSettings: () => state.settings });
const reload = createReload({ state, storage, log, getLastDrawAt: () => lastDrawAt });
setInterval(reload.dailyReloadTick, 1000);
const tv = createTvPower({ state, helper, tick, diagnosticsOpen: () => $('diagnostics').open, renderDiagnostics });
const sleepControl = createSleepControl({ state, log, $, tick, syncFirstRun, tv, reload, brightness, getClient: () => client, getEngine: () => engine });
// One timer serves both once-a-second checks (the page has no more one-second timers than it had before the limit watch). The limit watch
// runs first, in its own try/catch, so an error in either can never skip the other.
setInterval(() => {
  try {
    limitWatch.check();
  } catch (err) {
    log.warn(`Limit check failed: ${err.message}`);
  }
  sleepControl.evaluateSleep();
}, 1000);
sleepControl.listenForManualWake();

// ---------- Errors carry their fix (R-SET-6) ----------

/**
 * The ONE table from what went wrong to what can be done about it. The empty card, the toast and the connection test
 * result in Settings all read it (`fixesFor`), and `runFix` does the work, so they cannot drift apart.
 */
const FIXES = {
  signin: 'Sign in again',
  diagnostics: 'Diagnostics',
  test: 'Test connection',
  unwatched: 'Turn off "unwatched only"',
};
const FIXES_BY_KIND = { auth: ['signin'], network: ['diagnostics', 'test'], timeout: ['diagnostics', 'test'], empty: ['unwatched'] };

// A fix that cannot help is not offered: turning "unwatched only" off does nothing when it is already off.
const FIX_APPLIES = { unwatched: (s) => s.unwatchedOnly };

/** The fixes for an error kind, as [{ id, label }]; none for a kind the table does not know. */
const fixesFor = (kind) =>
  (FIXES_BY_KIND[kind] || []).filter((id) => FIX_APPLIES[id]?.(state.settings) ?? true).map((id) => ({ id, label: FIXES[id] }));

async function runFix(id) {
  if (id === 'signin') return requestSettings({ signIn: true });
  if (id === 'test') return requestSettings({ test: true });
  if (id === 'diagnostics') return requestDiagnostics();
  // A saved setting changes only behind the PIN, like every other route to one. It saves, rebuilds the pool request and ticks.
  if (id === 'unwatched' && (await pinGate.requestPin())) return applySettings({ ...state.settings, unwatchedOnly: false });
}

// ---------- UI state ----------

// The toast sits above the control bar, which wraps to two rows of labelled buttons on a phone: CSS reads its height from here.
new ResizeObserver(([entry]) => {
  document.documentElement.style.setProperty('--controls-h', `${Math.round(entry.borderBoxSize?.[0]?.blockSize ?? $('controls').offsetHeight)}px`);
}).observe($('controls'));

/** The empty card: `message` says what is wrong and `kind` (a SourceError kind, or 'empty') picks the fix buttons under it. */
function showEmpty(show, message, kind) {
  $('empty').hidden = !show;
  if (message) $('empty-message').textContent = message;
  if (!show) return;
  const fixes = fixesFor(kind);
  $('empty-actions').replaceChildren(...fixes.map((fix) => actionButton(fix.label, () => runFix(fix.id))));
  document.querySelector('#empty [data-action="settings"]').classList.toggle('primary', !fixes.length);
}

function statusText() {
  let text = '';
  if (state.paused) text = 'Paused';
  if (state.offlineSince) {
    const retry = state.nextAt ? ` · retrying in ${formatDuration(state.nextAt - Date.now())}` : '';
    text = `${navigator.onLine === false ? 'Offline' : `Can't reach ${signIn().label}`}${display.currentPoster ? ' · showing cached posters' : ''}${retry}`;
    if (state.paused) text = `Paused · ${text}`;
  }
  return text;
}

/**
 * The pill lives and updates only while the controls show (body.idle hides it); the once-a-second
 * re-render stops while they are hidden. The dot stands in for it then, when there is anything to say.
 */
function updateStatus() {
  const text = statusText();
  const dot = $('status-dot');
  dot.hidden = !(text && state.settings.statusIndicator === 'dot');
  if (document.body.classList.contains('idle')) return;
  const pill = $('status');
  pill.hidden = !text;
  if (pill.textContent !== text) pill.textContent = text;
  pill.classList.toggle('warn', Boolean(state.offlineSince));
}
setInterval(updateStatus, 1000);

// The dot visits the four corners of the safe area in turn, on its own timer (not pixel shift). The start
// corner follows the clock, so a daily reload does not park it in the same place every time.
const DOT_CYCLE_MS = 5 * 60 * 1000;
let dotCorner = Math.floor(Date.now() / DOT_CYCLE_MS) % 4;
$('status-dot').dataset.corner = dotCorner;
setInterval(() => {
  dotCorner = (dotCorner + 1) % 4;
  $('status-dot').dataset.corner = dotCorner;
}, DOT_CYCLE_MS);

function updatePinButton() {
  const btn = document.querySelector('[data-action="pin"]');
  const pinned = Boolean(state.settings.staticRatingKey);
  btn.setAttribute('aria-pressed', String(pinned));
  btn.setAttribute('aria-label', pinned ? `Unpin "${state.settings.staticTitle}"` : 'Pin this poster');
  btn.querySelector('.label').textContent = pinned ? 'Unpin' : 'Pin';
}

function setPaused(paused) {
  state.paused = paused;
  const btn = document.querySelector('[data-action="pause"]');
  btn.setAttribute('aria-pressed', String(paused));
  btn.setAttribute('aria-label', paused ? 'Resume auto-refresh' : 'Pause auto-refresh');
  btn.querySelector('.label').textContent = paused ? 'Resume' : 'Pause';
  btn.querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
  if (paused) {
    clearTimeout(state.timer);
    state.tickAfterWake = null; // a tick queued by the TV wake window does not run after Pause
    state.nextAt = 0;
    log.info('Auto-refresh paused');
  } else {
    log.info('Auto-refresh resumed');
    tick();
  }
  updateStatus();
}

// ---------- Settings ----------

async function applySettings(next, { persist = true, preview = false, restartIdle = true } = {}) {
  const prev = state.settings;
  const before = resolveSettings(prev, new Date()); // what was in force before this apply, at the same instant
  // A live preview shows layout only. The household limit, its time slots, the profiles, the poster selection and the pin are never previewed (CCI1, C6I1): while the
  // dialog is open the previous, saved values keep applying, so only Save changes them and Cancel has nothing to undo
  // (an imported file that pins an above-limit title must not exempt it before it is saved). The same goes for the
  // kiosk switches, the settings PIN and the device helper: an unsaved change to any of them is never in force. The Display
  // protection fieldset is not live either (K30): a pixel-shift or daily-reload change waits for Save, even when a live
  // layout field moves while it is unsaved. The brightness controls are their own live block and are not listed here.
  if (preview) {
    const { maxContentRating, limitSlots, profiles, limitNowPlaying, staticRatingKey, staticTitle, kioskMode, disableShortcuts, settingsPinHash, settingsPinSalt, deviceHelper } = prev;
    const { pixelShift, pixelShiftMinutes, dailyReload, dailyReloadTime } = prev;
    const { libraryKey, libraryName, libraryKeys, libraryNames, genres, ratings, source } = prev; // the selection (R-SEL-1, D101 ruling 6)
    const { serverType, serverUrl, plexToken, serverUserId } = prev; // the connection keys are stored by Save, never before (D149 1): the Save compares the type, address, token and user id with the stored ones, and a preview never leaves the typed or imported ones in force
    const { weighting, noRepeatDays } = prev; // an unsaved window of 0 must not reach the engine, which would clear the saved record (D114 1, D116 1)
    next = {
      ...next,
      ...{ maxContentRating, limitSlots, profiles, limitNowPlaying, staticRatingKey, staticTitle, kioskMode, disableShortcuts, settingsPinHash, settingsPinSalt, deviceHelper },
      ...{ pixelShift, pixelShiftMinutes, dailyReload, dailyReloadTime },
      ...{ libraryKey, libraryName, libraryKeys, libraryNames, genres, ratings, source },
      ...{ weighting, noRepeatDays },
      serverType, serverUrl, plexToken, serverUserId,
    };
  }
  // A Save that stores a different server type (an absent one counts as Plex) starts over: the pinned poster goes now, and the
  // offline cache and the no-repeat history go once the new client is built (D134 2, D141 3). A preview, a sign-in and a Cancel store nothing.
  const switched = !preview && serverTypeOf(prev) !== serverTypeOf(next);
  // A Save that stores another address of the same type is another server too (D147 2): an id means nothing there, and a pinned poster shows
  // whatever its rating (D122 1), so the pin goes. The offline cache and the no-repeat history stay (D143 6): cached posters still pass the limit in force.
  const addressOf = (s) => String(s?.serverUrl || '').trim().replace(/\/+$/, '');
  const moved = !preview && !switched && addressOf(prev) !== addressOf(next);
  if (switched || moved) next = { ...next, staticRatingKey: '', staticTitle: '' };
  state.settings = persist ? save(storage, next) : next;
  if (!preview) applyServerText(serverTypeOf(state.settings));
  applyControlLabels();
  brightness.evaluate(); // live preview and Save both show at once
  // Whatever is on screen is re-checked against the settings now in force on EVERY apply, previews and Cancel
  // included, even offline (K20, D29). This comes BEFORE the frame is applied, because a custom frame's load has no
  // timeout and must not keep an above-limit poster on screen.
  enforceOnScreen();
  try {
    await display.apply(inForceSettings()); // the frame in force: the profile's while a slot names one
  } catch (err) {
    log.warn(err.message);
    if (!preview) toast(err.message);
  }
  if (preview) return;

  // The Plex client is rebuilt BEFORE evaluateSleep() below (C8M2, D28): when this Save is what wakes the display, the
  // wake tick must already use the new connection, not read a session or a pool from the old one.
  // The poster selection compares by what it draws, not by object: every Save makes new lists.
  const connectionChanged =
    ['serverType', 'plexToken', 'serverUrl', 'libraryKey', 'unwatchedOnly', 'randomPoolSize'].some((k) => prev[k] !== state.settings[k]) ||
    selectionKey(selectionOf(before)) !== selectionKey(selectionOf(inForceSettings())); // what is drawn: the profile's selection while a slot names one
  if (connectionChanged || !engine) rebuildClient();
  if (switched) {
    blockPoster(); // the old server's poster does not stay up under the new server
    if (engine) engine.clearShown();
    if (!engine) createShownStore({ storage }).clear(); // no client to ask (not signed in to the new server yet): the record is in storage all the same
    await cache.clear().catch((err) => log.warn(`Could not clear the poster cache: ${err.message}`));
    updatePinButton();
    log.info(`Server type is now ${serverTypeOf(state.settings)}: the poster cache, the pinned poster and the no-repeat history were cleared.`);
  }
  if (moved && prev.staticRatingKey) {
    blockPoster(); // the old server's pinned poster does not stay up under the new address
    updatePinButton();
    log.info('Server address changed: the pinned poster was cleared.');
  }
  if (!anyWindow(state.settings)) engine?.clearShown(); // no window anywhere keeps no record, so raising one later starts empty (D116 2); one profile's 0 clears nothing (D120 5)

  document.body.classList.toggle('hide-cursor', state.settings.hideCursor);
  if (prev.kioskMode !== state.settings.kioskMode) {
    applyKiosk();
    if (!state.settings.kioskMode) wake();
  }
  updateWakeLock();
  updatePinButton();
  if (state.settings.deviceHelper && !prev.deviceHelper) tv.probeHelper();
  if (!state.settings.deviceHelper && prev.deviceHelper) tv.releaseTv();
  if (prev.dailyReloadTime !== state.settings.dailyReloadTime) reload.rearm(); // a new time is not "passing" until it does
  sleepControl.syncSleepClock();
  if (restartIdle) state.lastPlaybackAt = Date.now(); // a save counts as a fresh start for the idle clock (boot after an automatic reload keeps it)
  sleepControl.evaluateSleep();

  syncFirstRun(); // configured now: the code flow stops; still not: it carries on (or starts)
  if (!isConfigured(state.settings)) {
    showEmpty(true, unconfiguredMessage());
    return;
  }
  if (sourceError) {
    showEmpty(true, `${sourceError.message} Open settings and choose Plex, Jellyfin or Emby.`, sourceError.kind);
    return;
  }
  // Online, the forced tick below picks the replacement for a blocked poster; offline, handleFailure shows an
  // allowed cached poster or the empty card.
  // Slots are compared by what they do now: the limit in force before and after this Save (the same instant). When it differs the
  // watch adopts it here, so the next check does not report the same change again with a second forced draw.
  const after = inForceSettings();
  const inForceChanged = before.maxContentRating !== after.maxContentRating;
  if (inForceChanged) limitWatch.sync();
  const limitChanged = inForceChanged || ['maxContentRating', 'limitNowPlaying'].some((k) => prev[k] !== state.settings[k] || before[k] !== after[k]);
  // A tick already running began before this save and may not honour it, so a forced tick is queued for when it ends.
  const force = connectionChanged || limitChanged;
  if (force && state.busy) state.forceAfter = true;
  tick({ force });
}

// ---------- The PIN gate (js/pin-gate.js) ----------

const pinGate = createPinGate({ dialog: $('pin-dialog'), storage, getSettings: () => state.settings });

/**
 * Opens Settings, after the PIN when one is set. Every route to Settings (button, `s`, empty card, the fixes, first run) ends
 * here. `options` are for the sheet: { signIn } starts a plex.tv code in it, { test } runs the connection test. Already open,
 * the fixes act on the open sheet (no second PIN). A token the empty card's code earned (`pendingToken`) goes into the sheet
 * at the first open that gets past the PIN, so it is never lost to a prompt that was open when the code was approved, and
 * never reaches the sheet, let alone storage, without the PIN.
 */
async function requestSettings(options = {}) {
  if (!settingsUI.isOpen && !(await pinGate.requestPin())) return; // cancelled: a token the card earned stays pending (below)
  if (settingsUI.isOpen) {
    // Open already, or opened a moment ago by another request that shared this PIN prompt: act on the open sheet.
    if (options.signIn) settingsUI.startSignIn();
    else if (options.test) settingsUI.test();
    return;
  }
  const token = pendingToken; // the first open after the PIN takes it, whichever route opened Settings
  const userId = pendingUserId;
  const connection = pendingConnection ?? (firstRunCtl && firstRun.touched ? cardConnection() : null); // the card's choice of type and address, kept when Open settings is pressed
  pendingToken = null;
  pendingUserId = '';
  pendingConnection = null;
  settingsUI.open({ ...options, token, userId, ...(connection ?? {}) });
  syncFirstRun(); // the sheet is its own place to sign in: the card's code steps aside
  tv.probeHelper();
}

/** Opens Diagnostics, after the PIN when one is set. */
async function requestDiagnostics() {
  if (await pinGate.requestPin()) openDiagnostics();
}

const settingsUI = createSettingsUI({
  requestPin: pinGate.requestPin,
  choosePin: () => pinGate.prompt.choose(),
  getSettings: () => state.settings,
  clientId: clientIdValue,
  version: VERSION,
  log,
  onPreview: (s) => applySettings(s, { persist: false, preview: true }),
  onSave: (s) => {
    const was = serverTypeOf(state.settings);
    applySettings(s);
    // A switch of server type says so, naming the new server and what was cleared (D143 2).
    const now = serverTypeOf(s);
    if (was === now) return toast('Settings saved.');
    let label = now;
    try {
      label = signInFlow({ serverType: now }).label;
    } catch {
      // a type this build has no adapter for is named as it was written
    }
    // A switch that leaves no token cannot show posters yet: it says the type changed and asks to sign in (D144 3).
    if (!s.plexToken) return toast(`The server type is now ${label}. Sign in to ${label} to show its posters. The offline posters, the pinned poster and the no-repeat history were cleared.`);
    toast(`Now showing posters from ${label}. The offline posters, the pinned poster and the no-repeat history were cleared.`);
  },
  fixesFor,
  runFix,
  onClearCache: () => cache.clear(),
  onReset: async () => {
    storage.removeItem(STORAGE_KEY);
    await cache.clear();
    location.reload();
  },
});

// A blocked poster is not on screen: it cannot be pinned.
const posterPin = createPosterPin({ getSettings: () => state.settings, getCurrent: () => (display.currentPoster ? engine?.current : null), applySettings });

function rotate() {
  applySettings({ ...state.settings, rotation: (state.settings.rotation + 90) % 360 });
}

// ---------- Diagnostics ----------

let diagTimer = 0; // the CPU temperature refresh, running only while Diagnostics is open

function renderDiagnostics() {
  const s = state.settings;
  const p = display.currentPoster;
  const rows = {
    Version: VERSION,
    'Service worker': navigator.serviceWorker?.controller ? 'controlling' : 'none',
    'Secure context': window.isSecureContext ? 'yes' : 'no',
    'Daily reload': reload.dailyReloadRow(),
    Installed: matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ? 'yes' : 'no (running in a tab)',
    Server: s.serverUrl ? `${s.serverName || ''} ${s.serverUrl}`.trim() : '—',
    Token: s.plexToken ? `${s.plexToken.slice(0, 4)}…` : '—',
    Library: s.libraryKey ? `${s.libraryName || ''} (key ${s.libraryKey})` : '—',
    'Now playing': s.showNowPlaying ? `on${s.username ? ` for ${s.username}` : ''}` : 'off',
    Poster: p ? `${p.title}${p.year ? ` (${p.year})` : ''} — ${p.source}` : '—',
    Reason: state.lastReason || '—',
    'Last success': state.lastSuccessAt ? new Date(state.lastSuccessAt).toLocaleString() : 'never',
    'Next check': state.paused ? 'paused' : state.nextAt ? `in ${formatDuration(state.nextAt - Date.now())}` : '—',
    'Last error': state.lastError || 'none',
    'Cached posters': cache.available ? String(cache.entries().length) : 'unavailable',
    'Image mode': state.directImages ? 'direct (no offline cache)' : 'downloaded + cached',
    Sleep: `${state.asleep ? 'asleep' : 'awake'}${state.sleepWhy ? ` (${state.sleepWhy})` : ''}`,
    'Local time': `${new Date().toLocaleString()}${isPlausibleClock(new Date()) ? '' : ' — Clock not set'}`,
    'Wake lock': state.wakeLock ? 'held' : s.keepAwake ? 'not held' : 'off',
    Storage: storage.persistent ? 'localStorage' : 'memory only (settings will not persist!)',
    Screen: `${innerWidth}×${innerHeight} @${devicePixelRatio}x, rotation ${s.rotation}°`,
    ...(tv.helperActive() && tv.info.tempC !== null
      ? { 'CPU temperature': `${tv.info.tempC} °C${tv.info.temperature ? ` (${tv.info.temperature})` : ''}` }
      : {}),
    ...(pinResetFlag ? { 'PIN reset': 'PIN reset flag present — remove "resetPin" from config.json' } : {}),
  };
  $('diag-list').replaceChildren(
    ...Object.entries(rows).flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = k;
      dd.textContent = v;
      return [dt, dd];
    }),
  );
  $('diag-log').replaceChildren(
    ...log.entries.map((e) => {
      const li = document.createElement('li');
      li.className = e.level;
      li.textContent = `${e.at.toLocaleTimeString()}  ${e.message}`;
      return li;
    }),
  );
}

function openDiagnostics() {
  renderDiagnostics();
  $('diag-shortcuts').hidden = !listShortcuts(state.settings).length; // R-CTRL-3: no list while the shortcuts are off
  $('diagnostics').showModal();
  if (tv.helperActive()) {
    tv.refreshTemperature();
    diagTimer = setInterval(tv.refreshTemperature, DIAG_TEMP_MS);
  }
}
$('diagnostics').addEventListener('close', () => {
  clearInterval(diagTimer); // the temperature is read only while Diagnostics is open
  diagTimer = 0;
});
log.onChange(() => $('diagnostics').open && renderDiagnostics());
$('diag-close').addEventListener('click', () => $('diagnostics').close());
$('diag-copy').addEventListener('click', async () => {
  const text = [
    ...[...$('diag-list').children].reduce((acc, el, i, arr) => (i % 2 ? acc : [...acc, `${el.textContent}: ${arr[i + 1].textContent}`]), []),
    '',
    ...log.entries.map((e) => `${e.at.toISOString()} [${e.level}] ${e.message}`),
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast('Diagnostics copied.');
  } catch {
    toast('Clipboard not available.');
  }
});

// ---------- Controls, keyboard, idle ----------

const actions = {
  settings: () => requestSettings(),
  diagnostics: requestDiagnostics,
  refresh: () => (engine ? tick({ force: true, notify: true }) : requestSettings()),
  pause: () => setPaused(!state.paused),
  pin: posterPin.togglePin,
  rotate,
  fullscreen: toggleFullscreen,
  shortcuts: openShortcuts,
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn && actions[btn.dataset.action]) actions[btn.dataset.action]();
});

const KEYS = keyMap(); // js/shortcuts.js: the same table the `?` dialog lists, so the two cannot drift
document.addEventListener('keydown', (e) => {
  if (state.settings.disableShortcuts) return;
  if (document.body.classList.contains('positioning')) return; // position mode owns the arrows, + and -, and must not rotate or reopen mid-drag
  // (`dialog[open]`: for a frame after a sheet closes, focus can still sit on a button inside it.)
  if (e.target.closest('input, select, textarea, dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
  const action = KEYS[normalizeKey(e.key)];
  if (action) {
    e.preventDefault();
    actions[action]();
  }
});

// ---------- D-pad navigation of the controls (R-CTRL-5, D100) ----------
// A TV remote's arrow keys move focus between the control buttons, in the direction they point on screen (the buttons'
// bounding boxes already include rotation, so rotateUi needs no special case). Navigation, not a shortcut: `disableShortcuts`
// does not switch it off. It does nothing in a dialog (native selects, sliders, text fields and the PIN keypad keep their
// arrows), in position mode (js/position.js owns them; `.controls` is display: none there, so this guard is defence in
// depth), or while the controls are inert (kiosk mode only). It runs in the
// capture phase so it sees whether the controls were hidden before wake() shows them: on hidden controls the first arrow
// only reveals them and puts focus on a control (the last focused one, else the first); it moves nothing and activates
// nothing. An arrow is keyboard use, like Tab, so the 30 s hold applies. preventDefault only when the arrow is consumed.
const ARROW_DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
let lastControlFocus = null;
$('controls').addEventListener('focusin', (e) => (lastControlFocus = e.target.closest('button')));

const centreOfBox = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
};
const navigableControls = () =>
  [...$('controls').querySelectorAll('button:not([disabled])')].filter((b) => b.getClientRects().length && centreOfBox(b).w > 0 && getComputedStyle(b).visibility !== 'hidden');

document.addEventListener(
  'keydown',
  (e) => {
    const dir = ARROW_DIRS[e.key];
    if (!dir || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.body.classList.contains('positioning') || document.querySelector('dialog[open]')) return;
    if (e.target.closest?.('input, select, textarea')) return;
    const controls = $('controls');
    if (controls.inert) return;
    const buttons = navigableControls();
    if (!buttons.length) return;
    const wasHidden = !controls.classList.contains('visible');
    const current = document.activeElement?.closest('#controls button');
    e.preventDefault();
    keyboardFocus = true;
    if (wasHidden || !current || !buttons.includes(current)) {
      (buttons.includes(lastControlFocus) ? lastControlFocus : buttons[0]).focus();
      return;
    }
    const from = centreOfBox(current);
    let best = null;
    let bestScore = Infinity;
    for (const b of buttons) {
      if (b === current) continue;
      const c = centreOfBox(b);
      const along = (c.x - from.x) * dir[0] + (c.y - from.y) * dir[1];
      const across = Math.abs((c.x - from.x) * dir[1] - (c.y - from.y) * dir[0]);
      if (along < 1) continue; // not in that direction on screen
      const score = along + 2 * across;
      if (score < bestScore) [best, bestScore] = [b, score];
    }
    best?.focus();
  },
  { capture: true },
);

// ---------- Shortcuts dialog and control labels (R-CTRL-1, R-CTRL-3) ----------

/** The text on a key cap: "R", "?", "Space". */
const keyCap = (key) => (key.length > 1 ? key[0].toUpperCase() + key.slice(1) : key.toUpperCase());

/** `?` lists every shortcut in the table; it lists none (and does not open) while the shortcuts are switched off. */
function openShortcuts() {
  const entries = listShortcuts(state.settings);
  if (!entries.length || $('shortcuts').open) return;
  $('shortcuts-list').replaceChildren(
    ...entries.map((entry) => {
      const row = document.createElement('div');
      row.dataset.shortcut = entry.key;
      const key = document.createElement('dt');
      const cap = document.createElement('kbd');
      // A capital O reads like a zero in a monospace cap: letters show lower-case, and O is announced as the letter.
      cap.textContent = entry.key.length === 1 ? entry.key.toLowerCase() : keyCap(entry.key);
      if (entry.key === 'o') cap.setAttribute('aria-label', 'letter O');
      key.append(cap);
      const label = document.createElement('dd');
      label.textContent = entry.label;
      row.append(key, label);
      return row;
    }),
  );
  $('shortcuts').showModal();
}
$('diag-shortcuts').addEventListener('click', openShortcuts);
$('shortcuts-close').addEventListener('click', () => $('shortcuts').close());

/** `controlLabels` picks how the buttons are labelled (css/app.css); each label also learns its key, for the tooltip. */
function applyControlLabels() {
  $('controls').dataset.labels = state.settings.controlLabels;
  const entries = listShortcuts(state.settings);
  for (const btn of $('controls').querySelectorAll('[data-action]')) {
    const entry = entries.find((e) => e.action === btn.dataset.action);
    const label = btn.querySelector('.label');
    if (entry) label.dataset.key = keyCap(entry.key);
    else delete label.dataset.key;
  }
}

let idleTimer;

function showControls() {
  const controls = $('controls');
  controls.inert = false;
  controls.classList.add('visible');
  const wasIdle = document.body.classList.contains('idle');
  document.body.classList.remove('idle');
  if (wasIdle) updateStatus(); // catch the pill up before it shows
  clearTimeout(idleTimer);
}

function hideControls() {
  $('controls').classList.remove('visible');
  $('controls').inert = state.settings.kioskMode; // kiosk: not even Tab reaches them
  document.body.classList.add('idle');
  updateStatus(); // the dot takes over from the pill
}

// D96: what holds the controls shown once nothing else happens.
//  - Focus inside them, for a keyboard user only. A closing dialog (and a mouse click or tap on a control) leaves focus on
//    the control, and the old `:focus-within` test then re-armed the timer forever. `keyboardFocus` is set by a Tab outside
//    any open dialog (a Tab between Settings fields is not a walk through the controls) and cleared by a pointer press or
//    by a mouse that actually moved (pointermove also fires at a touch and, with unchanged coordinates, after a relayout).
//    That hold lasts at most KEYBOARD_HOLD_MS (30 s) after the last key press (any key): after that the controls hide even
//    though focus stays where it is (focus is never moved), and the next key press shows them again.
//    A mouse wheel counts as activity (it shows the controls and restarts the 3.5 s timer) and, being a mouse, ends keyboard use.
//  - A pointer over them, unless the last pointer was a touch: a finger leaves Chromium's sticky `:hover` on the button it
//    tapped, which would hold the controls for good after Pause, Pin poster, Refresh or Rotate.
let keyboardFocus = false;
let lastKeyAt = 0; // Date.now() of the last keydown, of any key
const KEYBOARD_HOLD_MS = 30000;
let lastPointerType = 'mouse';
let mouseAt = null;
document.addEventListener(
  'keydown',
  (e) => {
    lastKeyAt = Date.now();
    if (e.key === 'Tab' && !document.querySelector('dialog[open]')) keyboardFocus = true;
  },
  { capture: true, passive: true },
);
document.addEventListener(
  'pointerdown',
  (e) => {
    keyboardFocus = false;
    lastPointerType = e.pointerType;
  },
  { capture: true, passive: true },
);
document.addEventListener('wheel', () => (keyboardFocus = false), { capture: true, passive: true });
document.addEventListener(
  'pointermove',
  (e) => {
    lastPointerType = e.pointerType;
    if (e.pointerType !== 'mouse') return;
    if (mouseAt && (mouseAt.x !== e.clientX || mouseAt.y !== e.clientY)) keyboardFocus = false;
    mouseAt = { x: e.clientX, y: e.clientY };
  },
  { capture: true, passive: true },
);

/** Pointer or key activity shows the controls for a moment. Kiosk mode ignores it: see revealControls(). */
function wake() {
  if (state.settings.kioskMode) return;
  showControls();
  idleTimer = setTimeout(() => {
    const controls = $('controls');
    const keyboardHold = keyboardFocus && controls.matches(':focus-within') && Date.now() - lastKeyAt < KEYBOARD_HOLD_MS;
    if ((lastPointerType !== 'touch' && controls.matches(':hover')) || keyboardHold) return wake();
    hideControls();
  }, 3500);
}
['pointermove', 'pointerdown', 'keydown', 'wheel'].forEach((ev) => document.addEventListener(ev, wake, { passive: true }));

// The first touch on hidden controls only reveals them (R-CTRL-2, U12). `.controls` ignores the pointer until `.visible`;
// the pointerdown below adds it, and the browser then sends the tap's click to the button that just became hit-testable.
// So the state before the press is recorded here (capture phase, ahead of wake()), and the click that follows is swallowed
// only when ALL hold: the controls were hidden, the press was on them or on the bare stage, no dialog is open (wake() runs
// on every pointerdown and hides the controls after 3.5 s even behind Settings, so this must not eat a tap on Save), and it
// was not a mouse. The #empty backdrop itself counts as the bare stage (the bar sits under it on an unconfigured display, K58);
// the empty card, its text and its buttons are none of these, so they are never swallowed. Kiosk mode
// never reveals them by touch, so there is nothing to swallow. A press while asleep never gets here (manualWake owns it).
let swallowTapClick = false;
document.addEventListener(
  'pointerdown',
  (e) => {
    const target = e.target instanceof Element ? e.target : null;
    swallowTapClick =
      Boolean(target) &&
      !$('controls').classList.contains('visible') &&
      !state.settings.kioskMode &&
      e.pointerType !== 'mouse' &&
      !document.querySelector('dialog[open]') &&
      Boolean(target.closest('#controls, #stage') || target === $('app') || target === $('empty'));
  },
  { capture: true, passive: true },
);
document.addEventListener('pointercancel', () => (swallowTapClick = false), { capture: true, passive: true });
window.addEventListener(
  'click',
  (e) => {
    const swallow = swallowTapClick && e.detail > 0; // a keyboard click (detail 0) is not a tap
    swallowTapClick = false;
    if (!swallow) return;
    e.stopPropagation();
    e.preventDefault();
  },
  true,
);

// ---------- Kiosk mode ----------

/** Kiosk mode: the controls are hidden and inert; only a 3 s hold in the corner or on Enter shows them, for 15 s. */
function applyKiosk() {
  document.body.classList.toggle('kiosk', state.settings.kioskMode);
  clearTimeout(idleTimer);
  if (state.settings.kioskMode) hideControls();
  else $('controls').inert = false;
}

function revealControls() {
  if (!state.settings.kioskMode) return;
  showControls();
  idleTimer = setTimeout(hideControls, REVEAL_MS);
}

const uiRotation = () => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-rotation')) || 0;
const cornerHold = createHold({ ms: HOLD_MS, onHold: revealControls });
const enterHold = createHold({ ms: HOLD_MS, onHold: revealControls });
let holdPointer = null; // the pointerId whose press started the corner hold

// Pointer events cover mouse, touch and pen. The zone follows the shell's --ui-rotation, so it is the viewer's corner.
const press = { capture: true, passive: true };
document.addEventListener(
  'pointerdown',
  (e) => {
    if (!state.settings.kioskMode || !e.isPrimary || cornerHold.active) return;
    if (!inZone(cornerZone(uiRotation(), { width: innerWidth, height: innerHeight }), e.clientX, e.clientY)) return;
    holdPointer = e.pointerId;
    cornerHold.start(e.clientX, e.clientY);
  },
  press,
);
document.addEventListener('pointermove', (e) => e.pointerId === holdPointer && cornerHold.move(e.clientX, e.clientY), press);
for (const type of ['pointerup', 'pointercancel']) {
  document.addEventListener(type, (e) => e.pointerId === holdPointer && cornerHold.end(), press);
}

// Remotes: holding OK/Enter. Only the first keydown arms the hold (auto-repeat never does, so a key held through a wake
// from sleep, whose first press is swallowed, cannot start it); keyup ends it. Works with disableShortcuts.
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Enter' && !e.repeat && state.settings.kioskMode && !e.target.closest?.('dialog')) enterHold.start();
  },
  press,
);
document.addEventListener('keyup', (e) => e.key === 'Enter' && enterHold.end(), press);
window.addEventListener('blur', () => {
  cornerHold.end();
  enterHold.end();
});
// A long press on the viewer must not open a menu, nor on the PIN keypad or any dialog but Settings (K36, D40). It may
// where text is typed (a long press pastes into a Settings field) and on the Settings sheet's own box.
const TEXT_FIELD = 'textarea, input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"], [type="reset"], [type="file"], [type="color"], [type="image"], [type="hidden"])';
const allowsContextMenu = (el) => el instanceof Element && (el.matches(TEXT_FIELD) || el === $('settings'));
document.addEventListener('contextmenu', (e) => state.settings.kioskMode && !allowsContextMenu(e.target) && e.preventDefault());

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => toast('Full screen not allowed here.'));
}

// ---------- Screen wake lock ----------

async function updateWakeLock() {
  const want = state.settings.keepAwake && document.visibilityState === 'visible';
  if (!want) {
    await state.wakeLock?.release().catch(() => {});
    state.wakeLock = null;
    return;
  }
  if (state.wakeLock || !('wakeLock' in navigator)) return;
  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => (state.wakeLock = null));
  } catch (err) {
    log.warn(`Wake lock unavailable: ${err.message}`);
  }
}

document.addEventListener('visibilitychange', () => {
  updateWakeLock();
  if (document.visibilityState === 'visible') brightness.evaluate();
  if (document.visibilityState === 'visible') limitWatch.check(); // a hidden tab's timers are slowed: catch up with the clock now
  if (document.visibilityState === 'visible' && !state.paused && state.nextAt && Date.now() >= state.nextAt - 1000) tick();
});
window.addEventListener('online', () => {
  log.info('Network is back');
  if (!state.paused) tick();
});
window.addEventListener('offline', () => log.warn('Network went offline'));

let resizeFrame = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => display.layout());
});

// ---------- Service worker (offline + installable) ----------

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) {
    log.warn('Not a secure context (https or localhost): offline mode and install are unavailable.');
    return;
  }
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A new version took over: reload into it once nothing is in the way (the daily reload's waits).
    if (hadController) reload.requestUpdateReload();
  });
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      if (!reg) return; // (a browser that blocks service workers can resolve register() with nothing)
      // Check for updates periodically; always-on displays rarely reload on their own. Never throws (K16).
      setInterval(() => {
        try {
          reg.update().catch(() => {});
        } catch {
          // the registration is gone: nothing to update
        }
      }, 6 * 60 * 60 * 1000);
    })
    .catch((err) => log.warn(`Service worker failed: ${err.message}`));
}

// ---------- First run: the plex.tv code on the empty card (R-FIRST-1, D3) ----------

// An unconfigured display asks plex.tv for a sign-in code by itself and shows it large on the empty card: whoever stands
// in front of it enters the code at plex.tv/link on a phone. Nothing is forced open. It runs only while nothing is
// configured, config.json has had its say, and Settings (its own place to sign in) is closed. A code that expires is
// replaced at once (a code lives minutes, never less than 5 s here); a plex.tv failure waits 30 s, then 60 s, up to 5 minutes.
// A display nobody is attending must not hammer plex.tv (K50): the code is polled every 5 s while it is fresh, after
// 3 codes in a row expire unused it rests 5 minutes before asking for the next, and an asleep display asks for nothing.
const FIRST_RUN_RETRY_MS = 30_000;
const FIRST_RUN_RETRY_MAX_MS = 5 * 60_000;
const FIRST_RUN_FRESH_CODES = 3;
const FIRST_RUN_REST_MS = 5 * 60_000;
let firstRunCtl = null; // the AbortController of the running flow, or null
let bootSettled = false; // boot has read config.json and applied the settings: "not configured" can be believed
let pendingUserId = ''; // the user id that came with `pendingToken` (an Emby sign-in returns one)
let pendingToken = null; // a token the card's code earned, waiting for the first open of Settings that gets past the PIN
let pendingConnection = null; // with a Jellyfin or Emby token: { serverType, serverUrl } the card chose, handed to the sheet with it (nothing is stored before Save)
// The server type (and, for Jellyfin and Emby, the address) the card signs in to. It starts from the settings and changes with the card's own
// choice; it is held in memory only, so choosing on the card stores nothing and needs no PIN.
const firstRun = { type: 'plex', url: '', touched: false };
const firstRunSettings = () => ({ ...state.settings, serverType: firstRun.type, serverUrl: firstRun.url });
/** The server types that sign in at an address the household types (Plex finds its servers through plex.tv). */
const addressed = (type) => type === 'jellyfin' || type === 'emby';
/** What the card chose, for the sheet: the type and, for Jellyfin and Emby, the address; null when it chose what is stored and Plex (nothing to hand over). A Plex choice over a stored Jellyfin or Emby type is handed over too, so the sheet cannot keep the other type's address for this token (D142 2). */
const cardConnection = () => (addressed(firstRun.type) || firstRun.type !== serverTypeOf(state.settings) ? { serverType: firstRun.type, serverUrl: addressed(firstRun.type) ? firstRun.url : '' } : null);
const firstRunFlow = () => signInFlow(firstRunSettings(), { version: VERSION });

// A pending token ends the flow too: the display is signed in, it only needs somebody to finish in Settings.
const firstRunWanted = () => bootSettled && !isConfigured(state.settings) && !settingsUI.isOpen && !state.asleep && !pendingToken;

/** Starts or stops the code flow to match whether it is wanted. Cheap to call; called wherever that can change. */
function syncFirstRun() {
  if (firstRunWanted()) {
    if (!firstRunCtl) startFirstRun();
  } else if (firstRunCtl) {
    firstRunCtl.abort();
    firstRunCtl = null;
    $('firstrun').hidden = true;
  }
}

/** What the empty card says on an unconfigured display: the invitation, or, once a code was approved, what is left to do. */
const unconfiguredMessage = () => (pendingToken ? 'Signed in. Open settings to finish.' : `Connect to your ${(firstRunCtl ? firstRunFlow() : signIn()).label} server to get started.`);

/** `rest` shows only the status: while the display waits to ask again, "enter this code" over empty squares would mislead. */
function showFirstRun(code, status, { rest = false } = {}) {
  $('firstrun').classList.toggle('resting', rest);
  $('signin-code-large').textContent = code || '····';
  $('signin-code-large').classList.toggle('long', code.length > 4); // a six-digit Quick Connect code is set a little smaller than a four-character Plex one
  $('firstrun-status').textContent = status;
}

function startFirstRun() {
  const ctl = new AbortController();
  firstRunCtl = ctl;
  if (!firstRun.touched) {
    firstRun.type = addressed(serverTypeOf(state.settings)) ? serverTypeOf(state.settings) : 'plex'; // a type this build lacks reads Plex here: the card only offers a sign-in
    firstRun.url = addressed(firstRun.type) ? state.settings.serverUrl : '';
  }
  const flow = firstRunFlow();
  for (const radio of document.querySelectorAll('input[name="firstrunType"]')) radio.checked = radio.value === firstRun.type;
  applyServerText(firstRun.type);
  $('firstrun').hidden = false;
  $('firstrun-login').hidden = true;
  $('firstrun-address').hidden = !(flow.needsAddress && !flow.serverUrl);
  $('firstrun-address').querySelector('label').textContent = `${flow.label} server address`;
  $('firstrun-address').querySelector('input[type="submit"]').value = flow.createPin ? 'Get a code' : 'Continue';
  $('firstrun-lead').hidden = !flow.createPin; // no code is coming for Emby: the lines about one are not shown
  $('signin-code-large').hidden = !flow.createPin; // Emby has no code to show
  $('firstrun-url').value = firstRun.url;
  showEmpty(true, unconfiguredMessage());
  if (!$('firstrun-address').hidden) {
    showFirstRun('', `Enter the address of your ${flow.label} server.`, { rest: true }); // the code needs an address to ask
    $('firstrun-url').focus();
    return;
  }
  showFirstRun('', flow.words.asking);
  runFirstRun(ctl).catch((err) => log.warn(`First-run sign-in stopped: ${err.message}`));
}

/** The card's own choice changed the server type or the address: the running code is dropped and the card starts again. */
function restartFirstRun() {
  firstRunCtl?.abort();
  firstRunCtl = null;
  syncFirstRun();
}

for (const radio of document.querySelectorAll('input[name="firstrunType"]')) {
  radio.addEventListener('change', () => {
    if (!radio.checked || firstRun.type === radio.value) return;
    Object.assign(firstRun, { type: radio.value, touched: true });
    restartFirstRun();
  });
}
$('firstrun-address').addEventListener('submit', (e) => {
  e.preventDefault();
  const url = $('firstrun-url').value.trim().replace(/\/+$/, '');
  if (!url) return void showFirstRun('', `Enter the address of your ${firstRunFlow().label} server.`, { rest: true });
  if (location.protocol === 'https:' && url.startsWith('http:')) return void showFirstRun('', firstRunFlow().words.httpsBlocked, { rest: true });
  Object.assign(firstRun, { url, touched: true });
  restartFirstRun();
});
$('firstrun-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ctl = firstRunCtl;
  if (!ctl) return;
  const user = $('firstrun-user').value.trim();
  if (!user) return void showFirstRun('', 'Enter the user name.', { rest: true });
  showFirstRun('', 'Signing in…', { rest: true });
  try {
    const { token, userId } = await firstRunFlow().signInWithPassword(clientIdValue, user, $('firstrun-pass').value);
    if (firstRunCtl === ctl) finishFirstRun(ctl, token, userId);
  } catch (err) {
    if (firstRunCtl === ctl && (err.kind === 'network' || err.kind === 'timeout')) {
      // The server did not answer: the address is the trouble, and the household can change it here (D143 1, D145 8).
      $('firstrun-address').hidden = false;
      $('firstrun-login').hidden = true;
      $('firstrun-url').value = firstRun.url;
      showFirstRun('', `Couldn't reach ${firstRunFlow().label} at ${firstRun.url}. Check the address and try again.`, { rest: true });
      $('firstrun-url').focus();
    } else {
      showFirstRun('', err.kind === 'auth' ? 'That user name or password was not accepted.' : `Sign-in failed: ${err.message}`, { rest: true });
    }
  } finally {
    $('firstrun-pass').value = ''; // the password is used once and never kept
  }
});

async function runFirstRun(ctl) {
  const flow = firstRunFlow();
  let quickConnect = true;
  if (flow.quickConnectEnabled) {
    try {
      quickConnect = await flow.quickConnectEnabled(clientIdValue);
    } catch {
      if (ctl.signal.aborted) return;
      // The server did not answer: the address is the trouble, and the household can change it here (D143 1).
      $('firstrun-address').hidden = false;
      $('firstrun-url').value = firstRun.url;
      showFirstRun('', `Couldn't reach ${flow.label} at ${firstRun.url}. Check the address and try again.`, { rest: true });
      $('firstrun-url').focus();
      return;
    }
  }
  if (!quickConnect) {
    if (ctl.signal.aborted) return;
    // The server answered that Quick Connect is off: the user name and password form takes its place (D143 1).
    showFirstRun('', flow.words.passwordOnly ?? 'Quick Connect is off on this server. Sign in with a user name and password.', { rest: true });
    $('firstrun-login').hidden = false;
    $('firstrun-user').focus();
    return;
  }
  let failures = 0;
  let unused = 0; // codes in a row that ran out unapproved
  while (!ctl.signal.aborted) {
    try {
      const token = await pinSignIn(clientIdValue, {
        settings: firstRunSettings(),
        version: VERSION,
        signal: ctl.signal,
        onCode: (code) => {
          failures = 0; // the server answered
          showFirstRun(code, 'Waiting for you to approve…');
        },
      });
      if (ctl.signal.aborted) return;
      if (token) return finishFirstRun(ctl, token);
      // The code expired unused: the loop asks for a fresh one, after a rest once three in a row have gone to waste.
      if (++unused >= FIRST_RUN_FRESH_CODES) {
        showFirstRun('', flow.words.ranOut, { rest: true });
        await sleep(FIRST_RUN_REST_MS, ctl.signal);
        if (ctl.signal.aborted) return;
        showFirstRun('', flow.words.asking);
      }
    } catch (err) {
      if (ctl.signal.aborted) return;
      if (failures === 0) log.warn(flow.words.couldNotGet(err.message)); // once per outage, not per retry
      showFirstRun('', flow.words.unreachable);
      await sleep(Math.min(FIRST_RUN_RETRY_MAX_MS, FIRST_RUN_RETRY_MS * 2 ** failures), ctl.signal);
      failures++;
    }
  }
}

/**
 * The code was approved: Settings opens with the token (after the PIN when one is set), and the usual post-sign-in steps
 * (servers, library) run in it. The token waits in `pendingToken` until an open gets past the PIN. A prompt that was
 * already up shares its answer with this request, and one that is cancelled leaves the token waiting for the next open,
 * so the code is never asked for again and never saved without the PIN.
 */
async function finishFirstRun(ctl, token, userId = '') {
  if (firstRunCtl === ctl) firstRunCtl = null;
  $('firstrun').hidden = true;
  log.info('Sign-in code approved');
  pendingToken = token;
  pendingUserId = firstRun.type === 'emby' ? userId : ''; // only Emby needs it
  pendingConnection = cardConnection();
  await requestSettings();
  syncFirstRun(); // opened: the sheet owns sign-in; cancelled: the token waits and the flow stays stopped
  if (pendingToken) showEmpty(true, unconfiguredMessage()); // cancelled: say the sign-in worked and what is left
}
$('settings').addEventListener('close', () => {
  applyServerText(serverTypeOf(state.settings)); // the sheet showed the type it was editing; the saved one reads again
  syncFirstRun();
});

// ---------- Boot ----------

/** config.json beside index.html, fetched on every load (the server only serves it to loopback): its text, or null. */
async function readConfigJson() {
  try {
    const res = await fetch('config.json', { cache: 'no-store', signal: AbortSignal.timeout?.(2500) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** Optional provisioning: the config.json settings seed a first run. */
function provisionedSettings(text) {
  try {
    const s = fromImport(text, state.settings);
    log.info('Loaded settings from config.json');
    return s;
  } catch {
    return null;
  }
}

/** The text parsed as JSON, or null. */
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function boot() {
  const { source } = load(storage);
  if (source === 'legacy') log.info('Migrated settings from the previous version (layout reset to defaults).');
  applyKiosk(); // hidden and inert before anything is awaited
  applyControlLabels();
  sleepControl.evaluateSleep(); // black before config.json is awaited, as before
  const config = await readConfigJson();
  if (source === 'defaults' && config !== null) {
    const provisioned = provisionedSettings(config);
    if (provisioned) {
      state.settings = save(storage, provisioned);
      storage.setItem(WHATS_NEW_KEY, WHATS_NEW_VERSION); // provisioned from nothing: a fresh install, so there is no upgrade to announce (D73)
    }
  }
  // The PIN reset (D10, Q21): while config.json serves {"resetPin": true} the PIN is cleared on every load.
  pinResetFlag = config !== null && shouldResetPin(parseJson(config));
  if (pinResetFlag) {
    pinGate.prompt.resetLock(); // the lockout too
    if (state.settings.settingsPinHash || state.settings.settingsPinSalt) {
      state.settings = save(storage, { ...state.settings, settingsPinHash: '', settingsPinSalt: '' });
    }
    pinGate.prompt.cancelVerify(); // a prompt opened during the config.json wait asks for a PIN that no longer exists
    log.warn('PIN reset flag present in config.json: the settings PIN was cleared. Remove the flag once you are done.');
  }
  applyKiosk(); // a provisioned file may have switched kiosk mode on
  sleepControl.evaluateSleep(); // black before the first poster, not after
  if (!storage.persistent) log.warn('localStorage unavailable — settings will not survive a reload.');

  registerServiceWorker();
  await applySettings(state.settings, { persist: false, restartIdle: carriedPlayback === null });
  tv.probeHelper(); // once at boot; nothing at all when the setting is off
  bootSettled = true;
  syncFirstRun(); // unconfigured after config.json: the code appears on the card by itself; Settings is not forced open
  wake();
  announceWhatsNew();
}

// ---------- The upgrade notice (R-UPG-4) ----------

const WHATS_NEW_KEY = 'plexPoster.whatsNew';
const WHATS_NEW_VERSION = '2.4';

/**
 * Once per release: a configured display whose marker is not this release's value is an upgrade, so it is told what is new
 * and pointed at the server connection section (through the normal PIN gate), where the Plex | Jellyfin | Emby choice lives.
 * An unconfigured one is a fresh install, not an upgrade, so it shows nothing. Either way the marker is written, so it
 * never shows again. The 2.3 notice is retired.
 */
function announceWhatsNew() {
  if (storage.getItem(WHATS_NEW_KEY) === WHATS_NEW_VERSION) return;
  storage.setItem(WHATS_NEW_KEY, WHATS_NEW_VERSION);
  if (!isConfigured(state.settings)) return;
  toast("What's new in 2.4: show posters from a Jellyfin or Emby server as well as Plex.", {
    action: 'Open settings',
    onAction: async () => {
      await requestSettings({ section: 'server' }); // the sheet opens at its top, where the server connection section is
      if (settingsUI.isOpen) document.querySelector('input[name="serverTypePick"]:checked')?.focus({ preventScroll: true });
    },
    ms: 20_000,
  });
}

boot();
