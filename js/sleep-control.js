// Sleep on the page: asks Plex whether anything is playing, applies the sleep decision (sleep.js) to the veil and the
// TV, keeps the sleep clock honest across wall-clock steps, and turns a touch or key press into a manual wake.
// `createSleepControl` takes the page's state and callbacks; nothing here reads the page when the module loads.

import { BRIGHTNESS_JUMP_MS } from './brightness-timer.js';
import { isPlausibleClock } from './schedule.js';
import { decideSleep, MANUAL_WAKE_MS } from './sleep.js';

const MAX_POLL_FAILURES = 3;
const SWALLOW_MS = 800;

// Playback can change the sleep decision only if it wakes a schedule sleep or restarts the idle clock.
export const playbackMatters = (s) => (s.sleepEnabled && s.wakeOnPlayback) || s.idleSleepHours > 0;

/** Settings and Diagnostics sit above the veil; input aimed at them is never swallowed. */
const inOpenDialog = (e) => e.target instanceof Element && Boolean(e.target.closest('dialog[open]'));

/**
 * `state` is the page's shared state object (read and written live); `getClient()` and `getEngine()` return the current
 * Plex client and poster engine (rebuilt when the connection changes); `tv` is createTvPower(), `reload` is
 * createReload(), `brightness` is createBrightnessTimer(); `$` looks an element up by id.
 */
export function createSleepControl({ state, log, $, getClient, getEngine, tick, syncFirstRun, tv, reload, brightness }) {
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
      sessions = await getClient().sessions();
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
    state.playing = Boolean(await getEngine().playing(sessions));
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
      reload.shiftBoot(jump);
      if (state.manualWakeUntil) state.manualWakeUntil += jump;
    }
    if (Math.abs(jump) > BRIGHTNESS_JUMP_MS) brightness.evaluate(); // the clock moved: the night dim may be wrong now
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
    if (!asleep && why !== 'manual wake') reload.requestReloadAfterWake(); // a manual wake would lose its 60 s to the reload (K39)
    const next = () => !state.busy && !state.paused && tick(); // asleep: look for playback now; awake: show a poster now
    if (asleep) {
      tv.powerOffAfterVeil();
      next();
    } else if (tv.isOff && state.settings.deviceHelper) {
      // The TV is off because we switched it off: power it on even if a helper read has failed since (helper.available only
      // says whether the last read worked; a helper that is really gone just fails the call, and the wake goes on).
      tv.wakeTv().then(tv.afterTvWake);
    } else {
      tv.clearOff(); // the setting was switched off since the power off: no helper call at all
      next();
    }
  }

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

  /** Installs the capture-phase listeners that turn presses into a manual wake and swallow the click after one. */
  function listenForManualWake() {
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
  }

  return { pollPlayback, syncSleepClock, evaluateSleep, listenForManualWake };
}
