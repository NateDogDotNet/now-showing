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
import { createSettingsUI, pinSignIn } from './settings-ui.js';
import { fromImport, isConfigured, load, save, STORAGE_KEY } from './settings.js';
import { keyMap, listShortcuts, normalizeKey } from './shortcuts.js';
import { decideSleep, MANUAL_WAKE_MS } from './sleep.js';
import { actionButton, clientId as getClientId, createLog, formatDuration, safeStorage, sleep, toast } from './util.js';

export const VERSION = '2.1.0';

// An automatic reload (the daily one, or one for a new service worker) hands the idle-sleep clock to the next page
// through sessionStorage, so it does not read as fresh playback (C8M3, D28). A normal load never finds it.
const CARRY_KEY = 'plexPoster.carry';
const CARRY_MAX_AGE_MS = 2 * 60_000;

/** `lastPlaybackAt` left by an automatic reload that just happened, read once; null on any other load. */
function takeCarriedPlayback() {
  try {
    const carried = JSON.parse(sessionStorage.getItem(CARRY_KEY));
    sessionStorage.removeItem(CARRY_KEY);
    const now = Date.now();
    if (Number.isFinite(carried?.lastPlaybackAt) && Number.isFinite(carried?.at) && now - carried.at >= 0 && now - carried.at < CARRY_MAX_AGE_MS) {
      return Math.min(carried.lastPlaybackAt, now);
    }
  } catch {
    // no sessionStorage, or junk in it: a fresh clock
  }
  return null;
}
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
  pollError: null, // the error of this tick's failed playback poll, handed to decide() so it does not ask again
  pollFailures: 0, // consecutive failed playback polls
  sleepClock: { wall: Date.now(), mono: performance.now() },
};

let client = null;
let engine = null;
let lastDrawAt = -Infinity; // performance.now() of the last poster draw: its crossfade may still be running
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
  lastDrawAt = performance.now();
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

async function tick({ force = false, notify = false } = {}) {
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
    showEmpty(true, limited ? 'No posters within the household limit are available while Plex is unreachable.' : err.message, err.kind);
  }
  // A refresh somebody asked for that fails with a poster still on screen has nothing else to say so: the toast carries the fixes.
  if (notify && fixesFor(err.kind).length) {
    toast(err.message, { actions: fixesFor(err.kind).map((fix) => ({ label: fix.label, onClick: () => runFix(fix.id) })), ms: 15_000 });
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
    bootAt += jump;
    if (state.manualWakeUntil) state.manualWakeUntil += jump;
  }
  if (Math.abs(jump) > BRIGHTNESS_JUMP_MS) evaluateBrightness(); // the clock moved: the night dim may be wrong now
}

// ---------- Daily reload (R-PROT-3, D6) ----------

// A display that runs for weeks sheds Chromium's memory growth with a reload each day, but only where a reload cannot
// strand it: a service worker controls the page (so the reload is answered from the shell cache even if the host is
// down) AND an uncached probe of index.html just succeeded (so the host is up now). Anything else is skipped and logged.
const LAST_RELOAD_KEY = 'plexPoster.lastReload'; // a plain key, not a setting: it is the loop guard
const RELOAD_STALE_MS = 12 * 60 * 60_000; // the first wake from sleep reloads if the last reload is older than this
const RELOAD_GAP_MS = 10 * 60_000; // never two reloads closer than this
const RELOAD_PROBE_MS = 5000;
let bootAt = Date.now(); // moved with the clock when it is set after boot (syncSleepClock)

let reloadPending = ''; // 'scheduled' | 'wake' | '': a reload is wanted and waits for a quiet moment
let reloadChecking = false; // the probe is in flight
let reloading = false; // location.reload() was called
let reloadSkip = ''; // why the last attempt was skipped (Diagnostics)
let reloadDay = ''; // the local day whose reload time has been handled
let reloadArmed = false; // reloadDay has been taken from a plausible clock

/** Why a reload cannot happen now, or ''. */
function dailyReloadBlocker() {
  if (!state.settings.dailyReload) return 'turned off in Settings';
  if (!isPlausibleClock(new Date())) return 'the clock is not set';
  if (!storage.persistent) return 'storage is unavailable, so a reload loop could not be prevented';
  if (!navigator.serviceWorker?.controller) return 'no service worker controls this page (it needs https or localhost)';
  return '';
}

const dailyReloadRow = () => {
  const why = dailyReloadBlocker() || reloadSkip;
  return why ? `skipped (${why})` : 'active';
};

/** Not now, but soon: a dialog is open, a poster is loading, or the last poster is still fading in. */
function reloadMustWait() {
  if (document.querySelector('dialog[open]')) return 'a dialog is open';
  if (state.busy || state.tvWaking) return 'a poster is loading';
  if (Date.now() < state.manualWakeUntil) return 'a manual wake is running'; // it would lose its 60 s to the reload
  if (performance.now() - lastDrawAt < (state.settings.crossfadeMs ?? 0) + 250) return 'a poster is fading in';
  return '';
}

function skipReload(why) {
  reloadPending = '';
  reloadSkip = why;
  log.info(`Daily reload skipped: ${why}`);
}

/** Reloads the page on the page's own account (not the user's): the idle-sleep clock carries over. */
function reloadAutomatically() {
  reloading = true;
  try {
    sessionStorage.setItem(CARRY_KEY, JSON.stringify({ lastPlaybackAt: state.lastPlaybackAt, at: Date.now() }));
  } catch {
    // no sessionStorage: the idle clock starts afresh
  }
  location.reload();
}

/** A wake that ends sleep (K39: not a manual wake) reloads when the last reload (or, with none recorded, this page load) is over 12 h old. */
function requestReloadAfterWake() {
  if (!state.settings.dailyReload || !isPlausibleClock(new Date())) return;
  const last = Number(storage.getItem(LAST_RELOAD_KEY)) || bootAt;
  if (Date.now() - last > RELOAD_STALE_MS) reloadPending ||= 'wake';
}

/** Runs a wanted reload once nothing is in the way. Anything unsafe skips it; a busy moment only delays it. */
async function runDailyReload() {
  if (reloading || reloadChecking) return;
  const blocker = dailyReloadBlocker();
  if (blocker) return skipReload(blocker);
  if (reloadMustWait()) return; // stays pending: looked at again in a second
  const last = Number(storage.getItem(LAST_RELOAD_KEY)) || 0;
  const age = Date.now() - last;
  if (last && age >= 0 && age < RELOAD_GAP_MS) return skipReload('the last reload was less than 10 minutes ago');

  reloadSkip = '';
  reloadChecking = true;
  let why = '';
  try {
    const res = await fetch('index.html', { cache: 'no-store', signal: AbortSignal.timeout?.(RELOAD_PROBE_MS) });
    if (!res.ok) why = `the server answered HTTP ${res.status}`;
  } catch {
    why = 'the server did not answer';
  } finally {
    reloadChecking = false;
  }
  if (why) return skipReload(why);
  if (dailyReloadBlocker() || reloadMustWait()) return; // the probe took a moment and things changed: decide again next second
  const stamp = String(Date.now());
  storage.setItem(LAST_RELOAD_KEY, stamp); // BEFORE reloading, so a failing reload cannot loop
  if (storage.getItem(LAST_RELOAD_KEY) !== stamp) return skipReload('the reload could not be recorded');
  log.info('Daily reload');
  reloadAutomatically();
}

/** Once a second: notices dailyReloadTime passing (never one that had passed before this page loaded) and runs a wanted reload. */
function dailyReloadTick() {
  if (reloading) return;
  const now = new Date();
  if (!isPlausibleClock(now)) {
    reloadArmed = false; // when the clock is set, start from there: the time it jumps past is not "04:00 passing"
  } else {
    const [h, m] = state.settings.dailyReloadTime.split(':').map(Number);
    const due = now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
    const day = now.toDateString();
    if (!reloadArmed) {
      reloadArmed = true;
      reloadDay = due ? day : '';
    } else if (due && day !== reloadDay) {
      reloadDay = day;
      if (state.settings.dailyReload) reloadPending ||= 'scheduled';
    }
  }
  if (reloadPending) runDailyReload().catch((err) => skipReload(err.message));
}
setInterval(dailyReloadTick, 1000);

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
  syncFirstRun(); // an asleep display asks plex.tv for nothing (K50)
  $('sleep-veil').hidden = !asleep;
  $('app').inert = asleep; // top-layer dialogs are outside #app and stay usable
  document.body.classList.toggle('asleep', asleep);
  if (asleep) $('controls').classList.remove('visible');
  log.info(asleep ? `Asleep (${why})` : 'Awake');
  if (!asleep && why !== 'manual wake') requestReloadAfterWake(); // a manual wake would lose its 60 s to the reload (K39)
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
  if (id === 'unwatched' && (await requestPin())) return applySettings({ ...state.settings, unwatchedOnly: false });
}

// ---------- UI state ----------

/** The empty card: `message` says what is wrong and `kind` (a PlexError kind, or 'empty') picks the fix buttons under it. */
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
  // A live preview shows layout only. The household limit and the pin are never previewed (CCI1, C6I1): while the
  // dialog is open the previous, saved values keep applying, so only Save changes them and Cancel has nothing to undo
  // (an imported file that pins an above-limit title must not exempt it before it is saved). The same goes for the
  // kiosk switches, the settings PIN and the device helper: an unsaved change to any of them is never in force. The Display
  // protection fieldset is not live either (K30): a pixel-shift or daily-reload change waits for Save, even when a live
  // layout field moves while it is unsaved. The brightness controls are their own live block and are not listed here.
  if (preview) {
    const { maxContentRating, limitNowPlaying, staticRatingKey, staticTitle, kioskMode, disableShortcuts, settingsPinHash, settingsPinSalt, deviceHelper } = prev;
    const { pixelShift, pixelShiftMinutes, dailyReload, dailyReloadTime } = prev;
    next = {
      ...next,
      ...{ maxContentRating, limitNowPlaying, staticRatingKey, staticTitle, kioskMode, disableShortcuts, settingsPinHash, settingsPinSalt, deviceHelper },
      ...{ pixelShift, pixelShiftMinutes, dailyReload, dailyReloadTime },
    };
  }
  state.settings = persist ? save(storage, next) : next;
  applyControlLabels();
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

  // The Plex client is rebuilt BEFORE evaluateSleep() below (C8M2, D28): when this Save is what wakes the display, the
  // wake tick must already use the new connection, not read a session or a pool from the old one.
  const connectionChanged = ['plexToken', 'serverUrl', 'libraryKey', 'unwatchedOnly', 'randomPoolSize'].some(
    (k) => prev[k] !== state.settings[k],
  );
  if (connectionChanged || !engine) rebuildClient();

  document.body.classList.toggle('hide-cursor', state.settings.hideCursor);
  if (prev.kioskMode !== state.settings.kioskMode) {
    applyKiosk();
    if (!state.settings.kioskMode) wake();
  }
  updateWakeLock();
  updatePinButton();
  if (state.settings.deviceHelper && !prev.deviceHelper) probeHelper();
  if (!state.settings.deviceHelper && prev.deviceHelper) releaseTv();
  if (prev.dailyReloadTime !== state.settings.dailyReloadTime) reloadArmed = false; // a new time is not "passing" until it does
  syncSleepClock();
  if (restartIdle) state.lastPlaybackAt = Date.now(); // a save counts as a fresh start for the idle clock (boot after an automatic reload keeps it)
  evaluateSleep();

  syncFirstRun(); // configured now: the code flow stops; still not: it carries on (or starts)
  if (!isConfigured(state.settings)) {
    showEmpty(true, unconfiguredMessage());
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

/**
 * Opens Settings, after the PIN when one is set. Every route to Settings (button, `s`, empty card, the fixes, first run) ends
 * here. `options` are for the sheet: { signIn } starts a plex.tv code in it, { test } runs the connection test. Already open,
 * the fixes act on the open sheet (no second PIN). A token the empty card's code earned (`pendingToken`) goes into the sheet
 * at the first open that gets past the PIN, so it is never lost to a prompt that was open when the code was approved, and
 * never reaches the sheet, let alone storage, without the PIN.
 */
async function requestSettings(options = {}) {
  if (!settingsUI.isOpen && !(await requestPin())) return; // cancelled: a token the card earned stays pending (below)
  if (settingsUI.isOpen) {
    // Open already, or opened a moment ago by another request that shared this PIN prompt: act on the open sheet.
    if (options.signIn) settingsUI.startSignIn();
    else if (options.test) settingsUI.test();
    return;
  }
  const token = pendingToken; // the first open after the PIN takes it, whichever route opened Settings
  pendingToken = null;
  settingsUI.open({ ...options, token });
  syncFirstRun(); // the sheet is its own place to sign in: the card's code steps aside
  probeHelper();
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
  fixesFor,
  runFix,
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
    'Service worker': navigator.serviceWorker?.controller ? 'controlling' : 'none',
    'Secure context': window.isSecureContext ? 'yes' : 'no',
    'Daily reload': dailyReloadRow(),
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
  $('diag-shortcuts').hidden = !listShortcuts(state.settings).length; // R-CTRL-3: no list while the shortcuts are off
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
  refresh: () => (engine ? tick({ force: true, notify: true }) : requestSettings()),
  pause: () => setPaused(!state.paused),
  pin: togglePin,
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
  // (`dialog[open]`: for a frame after a sheet closes, focus can still sit on a button inside it.)
  if (e.target.closest('input, select, textarea, dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
  const action = KEYS[normalizeKey(e.key)];
  if (action) {
    e.preventDefault();
    actions[action]();
  }
});

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
    if (hadController && !settingsUI.isOpen) reloadAutomatically();
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
let pendingToken = null; // a token the card's code earned, waiting for the first open of Settings that gets past the PIN

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
const unconfiguredMessage = () => (pendingToken ? 'Signed in. Open settings to finish.' : 'Connect to your Plex server to get started.');

/** `rest` shows only the status: while the display waits to ask again, "enter this code" over empty squares would mislead. */
function showFirstRun(code, status, { rest = false } = {}) {
  $('firstrun').classList.toggle('resting', rest);
  $('signin-code-large').textContent = code || '····';
  $('firstrun-status').textContent = status;
}

function startFirstRun() {
  const ctl = new AbortController();
  firstRunCtl = ctl;
  $('firstrun').hidden = false;
  showFirstRun('', 'Asking plex.tv for a code…');
  showEmpty(true, 'Connect to your Plex server to get started.');
  runFirstRun(ctl).catch((err) => log.warn(`First-run sign-in stopped: ${err.message}`));
}

async function runFirstRun(ctl) {
  let failures = 0;
  let unused = 0; // codes in a row that ran out unapproved
  while (!ctl.signal.aborted) {
    try {
      const token = await pinSignIn(clientIdValue, {
        signal: ctl.signal,
        onCode: (code) => {
          failures = 0; // plex.tv answered
          showFirstRun(code, 'Waiting for you to approve…');
        },
      });
      if (ctl.signal.aborted) return;
      if (token) return finishFirstRun(ctl, token);
      // The code expired unused: the loop asks for a fresh one, after a rest once three in a row have gone to waste.
      if (++unused >= FIRST_RUN_FRESH_CODES) {
        showFirstRun('', 'That code ran out. Asking plex.tv for a new one in 5 minutes…', { rest: true });
        await sleep(FIRST_RUN_REST_MS, ctl.signal);
        if (ctl.signal.aborted) return;
        showFirstRun('', 'Asking plex.tv for a code…');
      }
    } catch (err) {
      if (ctl.signal.aborted) return;
      if (failures === 0) log.warn(`Could not get a sign-in code from plex.tv: ${err.message}`); // once per outage, not per retry
      showFirstRun('', "Can't reach plex.tv. Trying again soon…");
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
async function finishFirstRun(ctl, token) {
  if (firstRunCtl === ctl) firstRunCtl = null;
  $('firstrun').hidden = true;
  log.info('Sign-in code approved');
  pendingToken = token;
  await requestSettings();
  syncFirstRun(); // opened: the sheet owns sign-in; cancelled: the token waits and the flow stays stopped
  if (pendingToken) showEmpty(true, unconfiguredMessage()); // cancelled: say the sign-in worked and what is left
}
$('settings').addEventListener('close', syncFirstRun);

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
  await applySettings(state.settings, { persist: false, restartIdle: carriedPlayback === null });
  probeHelper(); // once at boot; nothing at all when the setting is off
  bootSettled = true;
  syncFirstRun(); // unconfigured after config.json: the code appears on the card by itself; Settings is not forced open
  wake();
  announceWhatsNew();
}

// ---------- The upgrade notice (R-UPG-1) ----------

const WHATS_NEW_KEY = 'plexPoster.whatsNew';

/**
 * Once per install: a configured display without the marker is an upgrade, so it is told what is new and pointed at the
 * Display protection fieldset (through the normal PIN gate). An unconfigured one is a fresh install, not an upgrade, so it
 * shows nothing. Either way the marker is written, so it never shows again.
 */
function announceWhatsNew() {
  if (storage.getItem(WHATS_NEW_KEY) !== null) return;
  storage.setItem(WHATS_NEW_KEY, '2.1');
  if (!isConfigured(state.settings)) return;
  toast("What's new in 2.1: one-tap display protection for always-on screens.", {
    action: 'Open settings',
    onAction: () => requestSettings({ section: 'protection' }),
    ms: 20_000,
  });
}

boot();
