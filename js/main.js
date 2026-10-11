// App bootstrap: wires settings, Plex, the poster engine, display and controls together.

import { createBackoff } from './backoff.js';
import { effectiveBrightness } from './brightness.js';
import { createDisplay } from './display.js';
import { createEngine } from './engine.js';
import { createHelper } from './helper.js';
import { cornerZone, createHold, createPinPrompt, HOLD_MS, inZone, REVEAL_MS, shouldResetPin } from './kiosk.js';
import { createPlexClient } from './plex.js';
import { createPosterCache } from './poster-cache.js';
import { allows } from './ratings.js';
import { requestSize } from './layout.js';
import { isPlausibleClock } from './schedule.js';
import { createSettingsUI } from './settings-ui.js';
import { fromImport, isConfigured, load, save, STORAGE_KEY } from './settings.js';
import { decideSleep, MANUAL_WAKE_MS } from './sleep.js';
import { clientId as getClientId, createLog, formatDuration, safeStorage, toast } from './util.js';

export const VERSION = '2.0.0';

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
  lastPlaybackAt: Date.now(),
  manualWakeUntil: 0,
  swallowUntil: 0, // performance.now() until which clicks are swallowed (after a press that only woke the display)
  pollFailing: false,
  tvWaking: false, // between the power-on request at wake and the end of TV_WAKE_MS: no poster is fetched yet
  pollError: null, // the error of this tick's failed playback poll, handed to decide() so it does not ask again
  pollFailures: 0, // consecutive failed playback polls
  sleepClock: { wall: Date.now(), mono: performance.now() },
};

let client = null;
let engine = null;
let pinResetFlag = false; // config.json served {"resetPin": true} on this load
const backoff = createBackoff({ baseMs: 5000, maxMs: 5 * 60 * 1000 });

function rebuildClient() {
  const s = state.settings;
  client = isConfigured(s) ? createPlexClient({ serverUrl: s.serverUrl, token: s.plexToken, clientId: clientIdValue }) : null;
  engine = client
    ? createEngine({
        client,
        getSettings: () => state.settings,
        // D37: while a limit is set, each online pool load re-confirms the cached titles' ratings.
        cachedKeys: () => cache.entries().map((e) => e.ratingKey),
        onRatings: (posters) => posters.forEach((p) => cache.refreshRating(p)),
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

/** May this poster stay on screen under the current settings? A pinned poster is exempt (D5), and so is a now-playing one unless `limitNowPlaying` is on. */
function allowedOnScreen(poster) {
  const s = state.settings;
  if (allows(s.maxContentRating, poster.contentRating)) return true;
  if (s.staticRatingKey && poster.ratingKey === s.staticRatingKey) return true;
  return poster.source === 'now-playing' && s.limitNowPlaying === false;
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
  if (!allowedOnScreen(poster)) return false;
  document.querySelectorAll('.poster-layer.cut').forEach((img) => img.classList.remove('cut'));
  const outgoing = display.currentPoster;
  await display.show(poster, image);
  if (!allowedOnScreen(poster)) {
    blockPoster(); // the limit was tightened during the decode
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

async function tick({ force = false } = {}) {
  if (!engine || state.busy || state.tvWaking) return;
  state.busy = true;
  try {
    const sessions = await pollPlayback(); // fetched once; decide() reuses it
    const sessionsError = state.pollError; // a failed poll is not repeated by decide() (C8M1)
    // Asleep (or the TV still waking, the wake having begun during the poll above): Plex is polled, but no poster
    // is chosen, fetched or shown; the end of the TV wake ticks again.
    const decision = state.asleep || state.tvWaking ? null : await engine.decide({ force: force || document.body.classList.contains('poster-blocked'), sessions, sessionsError });
    let refused = false; // a poster was fetched but the limit no longer allows it
    if (decision) {
      cache.refreshRating(decision.poster); // seen online: its stored rating follows Plex (C7M2)
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
    await handleFailure(err);
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

async function handleFailure(err) {
  display.setNowPlaying(null); // what Plex last said about playback is no longer known
  state.lastError = err.message;
  if (!state.offlineSince) state.offlineSince = Date.now();
  const fatal = err.kind === 'auth' || err.kind === 'empty';
  log[fatal ? 'error' : 'warn'](err.message);

  // Keep the screen interesting while Plex is unavailable: rotate through cached posters. Under a content
  // limit only entries at or below it count (cache.random enforces that); a cached poster that will not
  // decode is dropped from the cache and one more is tried, so a bad entry neither shows nor repeats.
  const current = display.currentPoster ? engine?.current : null; // nothing on screen (blocked) = due at once
  const due = !current || Date.now() - (current.shownAt || 0) >= state.settings.rotateSeconds * 1000;
  if (due && !fatal && !state.asleep) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const cached = await cache.random(current?.ratingKey, state.settings.maxContentRating).catch(() => null);
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
  if (!display.currentPoster) {
    const limited = state.settings.maxContentRating && !fatal;
    showEmpty(true, limited ? 'No posters within the household limit are available while Plex is unreachable.' : err.message);
  }
  // Asleep, the only thing to retry is the playback poll: keep it at its normal rate, not the 5 minute backoff.
  const retryMs = fatal ? 5 * 60 * 1000 : backoff.next();
  schedule(state.asleep ? Math.min(retryMs, state.settings.nowPlayingPollSeconds * 1000) : retryMs);
}

// ---------- Sleep ----------

const MAX_POLL_FAILURES = 3;
// Playback can change the sleep decision only if it wakes a schedule sleep or restarts the idle clock.
const playbackMatters = (s) => (s.sleepEnabled && s.wakeOnPlayback) || s.idleSleepHours > 0;

/**
 * Asks Plex whether anything is playing, when sleep needs to know, and returns the sessions it saw
 * (undefined when it did not ask or could not). May wake the display. A failed poll never refreshes
 * `lastPlaybackAt` and keeps the last `playing` for at most MAX_POLL_FAILURES failures in a row (a blip
 * must not black a movie out; an outage must not hold the display awake all night). Awake, the failure is
 * only logged and rotation carries on (a shared or managed token is often refused /status/sessions);
 * asleep, it goes to handleFailure, which retries at the poll rate.
 */
async function pollPlayback() {
  state.pollError = null;
  if (!playbackMatters(state.settings)) {
    state.playing = false;
    state.pollFailures = 0;
    return undefined;
  }
  let sessions;
  try {
    sessions = await client.sessions();
  } catch (err) {
    state.pollError = err;
    if (++state.pollFailures >= MAX_POLL_FAILURES) state.playing = false; // the 1 s evaluateSleep() timer acts on it
    if (state.asleep) throw err;
    if (!state.pollFailing) log.warn(`Playback check failed: ${err.message}`);
    state.pollFailing = true;
    return undefined;
  }
  state.pollFailing = false;
  state.pollFailures = 0;
  state.playing = Boolean(await engine.playing(sessions));
  if (state.playing) {
    syncSleepClock();
    state.lastPlaybackAt = Date.now();
  }
  evaluateSleep();
  return sessions;
}

/**
 * A clock step (NTP arriving, a manual change) must not read as hours of idleness or a stuck manual wake:
 * compare the wall clock with the monotonic one and shift the stored timestamps by the gap. Call it before
 * every write of a wall-clock timestamp (so the step is absorbed first and the new stamp is not shifted
 * again) and at the top of evaluateSleep().
 */
function syncSleepClock() {
  const wall = Date.now();
  const mono = performance.now();
  const jump = wall - state.sleepClock.wall - (mono - state.sleepClock.mono);
  state.sleepClock = { wall, mono };
  if (Math.abs(jump) > 5000) {
    state.lastPlaybackAt += jump;
    if (state.manualWakeUntil) state.manualWakeUntil += jump;
  }
  if (Math.abs(jump) > BRIGHTNESS_JUMP_MS) evaluateBrightness(); // the clock moved: the night dim may be wrong now
}

// ---------- Device helper (R-HELP-2, D8) ----------

// How long the TV gets to wake after the power-on request before the first poster is fetched. (verify) on hardware:
// the V1-E22 checklist row measures it.
const TV_WAKE_MS = 4000;
const DIAG_TEMP_MS = 5000; // CPU temperature refresh, only while Diagnostics is open

let tvOff = false; // we asked the TV to switch off and have not switched it on again
let powerChain = Promise.resolve(); // power requests go out one at a time, in order
let helperInfo = { available: false, tempC: null, temperature: null };
let diagTimer = 0;

/** The setting is on and the last probe found a helper. Everything else about the helper is gated on this. */
const helperActive = () => state.settings.deviceHelper && helper.available;

/** Probes once (boot, Settings opening, the setting being switched on); a display already asleep is switched off now. */
async function probeHelper() {
  if (!state.settings.deviceHelper) return;
  helperInfo = await helper.probe();
  if (state.asleep) powerOffAfterVeil();
}

const queuePower = (on) => (powerChain = powerChain.then(() => helper.power(on)));

/** Power off only once the veil is up and painted (two frames), and only if the display is still asleep. */
function powerOffAfterVeil() {
  if (!helperActive() || tvOff) return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!state.asleep || tvOff || !helperActive()) return;
      tvOff = true;
      queuePower(false);
    }),
  );
}

/** Wake: power on first, give the TV time, and only then let the poster fetch begin. A failed call does not block. */
async function wakeTv() {
  tvOff = false;
  state.tvWaking = true;
  try {
    await queuePower(true);
    await new Promise((resolve) => setTimeout(resolve, TV_WAKE_MS));
  } finally {
    state.tvWaking = false;
  }
}

/** The setting was switched off while we had the TV powered off: one power on so the screen is not stranded, then silence. */
function releaseTv() {
  if (!tvOff) return;
  tvOff = false;
  if (helper.available) queuePower(true); // a failure is logged once by the helper; either way nothing more is sent
}

async function refreshTemperature() {
  if (!helperActive()) return;
  helperInfo = await helper.status();
  if ($('diagnostics').open) renderDiagnostics();
}

/** Applies decideSleep() to the page: the veil and body.asleep. The wake lock is never touched. */
function evaluateSleep() {
  syncSleepClock();
  const now = new Date();
  const { asleep, why } = decideSleep({
    now,
    settings: state.settings,
    lastPlaybackAt: state.lastPlaybackAt,
    playingNow: state.playing,
    manualWakeUntil: state.manualWakeUntil,
    clockOk: isPlausibleClock(now),
  });
  state.sleepWhy = why;
  if (asleep === state.asleep) return;
  state.asleep = asleep;
  $('sleep-veil').hidden = !asleep;
  $('app').inert = asleep; // top-layer dialogs are outside #app and stay usable
  document.body.classList.toggle('asleep', asleep);
  if (asleep) $('controls').classList.remove('visible');
  log.info(asleep ? `Asleep (${why})` : 'Awake');
  const next = () => !state.busy && !state.paused && tick(); // asleep: look for playback now; awake: show a poster now
  if (asleep) {
    powerOffAfterVeil();
    next();
  } else if (tvOff && helperActive()) {
    wakeTv().then(() => !state.asleep && next());
  } else {
    tvOff = false; // the setting was switched off since the power off: no helper call at all
    next();
  }
}
setInterval(evaluateSleep, 1000);

// ---------- Frame brightness and night dim ----------

const BRIGHTNESS_JUMP_MS = 2 * 60_000;
let brightnessTimer = 0;

/** Sets the frame (or stage) brightness for the current minute and re-arms the timer for the next minute boundary. */
function evaluateBrightness() {
  const now = new Date();
  display.setBrightness(effectiveBrightness(now, state.settings), state.settings.nightDimTarget);
  clearTimeout(brightnessTimer);
  // Aligned to the minute boundary; a timer that fires a hair early just re-arms for the remaining sliver.
  brightnessTimer = setTimeout(evaluateBrightness, 60_000 - (now.getTime() % 60_000));
}

const SWALLOW_MS = 800;

/** Settings and Diagnostics sit above the veil; input aimed at them is never swallowed. */
const inOpenDialog = (e) => e.target instanceof Element && Boolean(e.target.closest('dialog[open]'));

/**
 * A touch, click or key press while asleep only wakes: it never reaches the control under the finger.
 * Clicks stay swallowed until SWALLOW_MS after the last press that began asleep or inside that window, so a
 * second blind tap does not land on the controls the first one uncovered. During a manual wake any press or
 * key restarts the minute, in dialogs too.
 */
function manualWake(e) {
  const swallowing = e.type === 'pointerdown' && performance.now() < state.swallowUntil;
  if (!state.asleep && !swallowing && state.sleepWhy !== 'manual wake') return;
  syncSleepClock();
  state.manualWakeUntil = Date.now() + MANUAL_WAKE_MS;
  if ((state.asleep || swallowing) && !inOpenDialog(e)) {
    e.stopPropagation();
    e.preventDefault();
    if (e.type === 'pointerdown') state.swallowUntil = performance.now() + SWALLOW_MS;
  }
  evaluateSleep();
}
window.addEventListener('pointerdown', manualWake, true);
window.addEventListener('keydown', manualWake, true);
window.addEventListener(
  'pointermove',
  () => {
    if (state.sleepWhy !== 'manual wake') return;
    syncSleepClock();
    state.manualWakeUntil = Date.now() + MANUAL_WAKE_MS;
  },
  { capture: true, passive: true },
);
window.addEventListener(
  'click',
  (e) => {
    if (performance.now() >= state.swallowUntil || inOpenDialog(e)) return;
    e.stopPropagation();
    e.preventDefault();
  },
  true,
);

// ---------- UI state ----------

function showEmpty(show, message) {
  $('empty').hidden = !show;
  if (message) $('empty-message').textContent = message;
}

function statusText() {
  let text = '';
  if (state.paused) text = 'Paused';
  if (state.offlineSince) {
    const retry = state.nextAt ? ` · retrying in ${formatDuration(state.nextAt - Date.now())}` : '';
    text = `${navigator.onLine === false ? 'Offline' : "Can't reach Plex"}${display.currentPoster ? ' · showing cached posters' : ''}${retry}`;
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
  btn.title = pinned ? `Unpin "${state.settings.staticTitle}"` : 'Pin this poster';
}

function setPaused(paused) {
  state.paused = paused;
  const btn = document.querySelector('[data-action="pause"]');
  btn.setAttribute('aria-pressed', String(paused));
  btn.setAttribute('aria-label', paused ? 'Resume auto-refresh' : 'Pause auto-refresh');
  btn.title = paused ? 'Resume auto-refresh (P)' : 'Pause auto-refresh (P)';
  btn.querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
  if (paused) {
    clearTimeout(state.timer);
    state.nextAt = 0;
    log.info('Auto-refresh paused');
  } else {
    log.info('Auto-refresh resumed');
    tick();
  }
  updateStatus();
}

// ---------- Settings ----------

async function applySettings(next, { persist = true, preview = false } = {}) {
  const prev = state.settings;
  // A live preview shows layout only. The household limit and the pin are never previewed (CCI1, C6I1): while the
  // dialog is open the previous, saved values keep applying, so only Save changes them and Cancel has nothing to undo
  // (an imported file that pins an above-limit title must not exempt it before it is saved). The same goes for the
  // kiosk switches, the settings PIN and the device helper: an unsaved change to any of them is never in force.
  if (preview) {
    const { maxContentRating, limitNowPlaying, staticRatingKey, staticTitle, kioskMode, disableShortcuts, settingsPinHash, settingsPinSalt, deviceHelper } = prev;
    next = { ...next, maxContentRating, limitNowPlaying, staticRatingKey, staticTitle, kioskMode, disableShortcuts, settingsPinHash, settingsPinSalt, deviceHelper };
  }
  state.settings = persist ? save(storage, next) : next;
  evaluateBrightness(); // live preview and Save both show at once
  // Whatever is on screen is re-checked against the settings now in force on EVERY apply, previews and Cancel
  // included, even offline (K20, D29). This comes BEFORE the frame is applied, because a custom frame's load has no
  // timeout and must not keep an above-limit poster on screen.
  if (display.currentPoster && !allowedOnScreen(display.currentPoster)) blockPoster();
  else cutOutgoing(); // a poster still fading out under a crossfade is not allowed to finish its fade (C7M1)
  try {
    await display.apply(state.settings);
  } catch (err) {
    log.warn(err.message);
    if (!preview) toast(err.message);
  }
  if (preview) return;

  document.body.classList.toggle('hide-cursor', state.settings.hideCursor);
  if (prev.kioskMode !== state.settings.kioskMode) {
    applyKiosk();
    if (!state.settings.kioskMode) wake();
  }
  updateWakeLock();
  updatePinButton();
  if (state.settings.deviceHelper && !prev.deviceHelper) probeHelper();
  if (!state.settings.deviceHelper && prev.deviceHelper) releaseTv();
  syncSleepClock();
  state.lastPlaybackAt = Date.now(); // a save counts as a fresh start for the idle clock
  evaluateSleep();

  const connectionChanged = ['plexToken', 'serverUrl', 'libraryKey', 'unwatchedOnly', 'randomPoolSize'].some(
    (k) => prev[k] !== state.settings[k],
  );
  if (connectionChanged || !engine) rebuildClient();
  if (!isConfigured(state.settings)) {
    showEmpty(true, 'Connect to your Plex server to get started.');
    return;
  }
  // Online, the forced tick below picks the replacement for a blocked poster; offline, handleFailure shows an
  // allowed cached poster or the empty card.
  const limitChanged = ['maxContentRating', 'limitNowPlaying'].some((k) => prev[k] !== state.settings[k]);
  // A tick already running began before this save and may not honour it, so a forced tick is queued for when it ends.
  const force = connectionChanged || limitChanged;
  if (force && state.busy) state.forceAfter = true;
  tick({ force });
}

// ---------- The PIN gate ----------

const pinPrompt = createPinPrompt({
  dialog: $('pin-dialog'),
  storage,
  getAuth: () => ({ hash: state.settings.settingsPinHash, salt: state.settings.settingsPinSalt }),
});

/**
 * The ONE PIN check (D16: a deterrent, not security). True at once when no PIN is set; otherwise the PIN dialog
 * decides. Settings, Diagnostics, import, Reset everything, the token reveal and the token export all ask here.
 */
const requestPin = () => (state.settings.settingsPinHash ? pinPrompt.verify() : Promise.resolve(true));

/** Opens Settings, after the PIN when one is set. Every route to Settings (button, `s`, empty card, first run) ends here. */
async function requestSettings(options) {
  if (settingsUI.isOpen) return;
  if (await requestPin()) {
    settingsUI.open(options);
    probeHelper();
  }
}

/** Opens Diagnostics, after the PIN when one is set. */
async function requestDiagnostics() {
  if (await requestPin()) openDiagnostics();
}

const settingsUI = createSettingsUI({
  requestPin,
  choosePin: () => pinPrompt.choose(),
  getSettings: () => state.settings,
  clientId: clientIdValue,
  log,
  onPreview: (s) => applySettings(s, { persist: false, preview: true }),
  onSave: (s) => {
    applySettings(s);
    toast('Settings saved.');
  },
  onClearCache: () => cache.clear(),
  onReset: async () => {
    storage.removeItem(STORAGE_KEY);
    await cache.clear();
    location.reload();
  },
});

function togglePin() {
  const s = state.settings;
  const current = display.currentPoster ? engine?.current : null; // a blocked poster is not on screen: it cannot be pinned
  if (s.staticRatingKey) {
    applySettings({ ...s, staticRatingKey: '', staticTitle: '' });
    toast('Unpinned — rotating posters again.');
  } else if (current) {
    applySettings({ ...s, staticRatingKey: current.ratingKey, staticTitle: current.title });
    toast(`Pinned "${current.title}".`);
  } else {
    toast('Nothing to pin yet.');
  }
}

function rotate() {
  applySettings({ ...state.settings, rotation: (state.settings.rotation + 90) % 360 });
}

// ---------- Diagnostics ----------

function renderDiagnostics() {
  const s = state.settings;
  const p = display.currentPoster;
  const rows = {
    Version: VERSION,
    'Service worker': navigator.serviceWorker?.controller ? 'active (works offline)' : 'not active',
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
    ...(helperActive() && helperInfo.tempC !== null
      ? { 'CPU temperature': `${helperInfo.tempC} °C${helperInfo.temperature ? ` (${helperInfo.temperature})` : ''}` }
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
  $('diagnostics').showModal();
  if (helperActive()) {
    refreshTemperature();
    diagTimer = setInterval(refreshTemperature, DIAG_TEMP_MS);
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
  refresh: () => (engine ? tick({ force: true }) : requestSettings()),
  pause: () => setPaused(!state.paused),
  pin: togglePin,
  rotate,
  fullscreen: toggleFullscreen,
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn && actions[btn.dataset.action]) actions[btn.dataset.action]();
});

const KEYS = { s: 'settings', d: 'diagnostics', r: 'refresh', ' ': 'pause', p: 'pause', o: 'rotate', f: 'fullscreen' };
document.addEventListener('keydown', (e) => {
  if (state.settings.disableShortcuts) return;
  // (`dialog[open]`: for a frame after a sheet closes, focus can still sit on a button inside it.)
  if (e.target.closest('input, select, textarea, dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
  const action = KEYS[e.key.toLowerCase()];
  if (action) {
    e.preventDefault();
    actions[action]();
  }
});

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

/** Pointer or key activity shows the controls for a moment. Kiosk mode ignores it: see revealControls(). */
function wake() {
  if (state.settings.kioskMode) return;
  showControls();
  idleTimer = setTimeout(() => {
    if ($('controls').matches(':hover, :focus-within')) return wake();
    hideControls();
  }, 3500);
}
['pointermove', 'pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, wake, { passive: true }));

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
// A long press on the viewer must not open a menu; inside an open dialog it must (paste into a Settings field).
document.addEventListener('contextmenu', (e) => state.settings.kioskMode && !e.target.closest?.('dialog[open]') && e.preventDefault());

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
  if (document.visibilityState === 'visible') evaluateBrightness();
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
    // A new version took over. Kiosks are unattended, so reload into it automatically.
    if (hadController && !settingsUI.isOpen) location.reload();
  });
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      // Check for updates periodically; always-on displays rarely reload on their own.
      setInterval(() => reg.update().catch(() => {}), 6 * 60 * 60 * 1000);
    })
    .catch((err) => log.warn(`Service worker failed: ${err.message}`));
}

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
  evaluateSleep(); // black before config.json is awaited, as before
  const config = await readConfigJson();
  if (source === 'defaults' && config !== null) {
    const provisioned = provisionedSettings(config);
    if (provisioned) state.settings = save(storage, provisioned);
  }
  // The PIN reset (D10, Q21): while config.json serves {"resetPin": true} the PIN is cleared on every load.
  pinResetFlag = config !== null && shouldResetPin(parseJson(config));
  if (pinResetFlag) {
    pinPrompt.resetLock(); // the lockout too
    if (state.settings.settingsPinHash || state.settings.settingsPinSalt) {
      state.settings = save(storage, { ...state.settings, settingsPinHash: '', settingsPinSalt: '' });
    }
    pinPrompt.cancelVerify(); // a prompt opened during the config.json wait asks for a PIN that no longer exists
    log.warn('PIN reset flag present in config.json: the settings PIN was cleared. Remove the flag once you are done.');
  }
  applyKiosk(); // a provisioned file may have switched kiosk mode on
  evaluateSleep(); // black before the first poster, not after
  if (!storage.persistent) log.warn('localStorage unavailable — settings will not survive a reload.');

  registerServiceWorker();
  await applySettings(state.settings, { persist: false });
  probeHelper(); // once at boot; nothing at all when the setting is off
  if (!isConfigured(state.settings)) requestSettings({ firstRun: true });
  wake();
}

boot();
