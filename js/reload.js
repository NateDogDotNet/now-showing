// The automatic reload (R-PROT-3, D6, D73): the daily one that sheds Chromium's memory growth, the one after a first
// wake from a long sleep, and the one into a new service-worker version. All three wait for the same quiet moments.
// `createReload` takes the page's state and a few callbacks; nothing here reads the page when the module loads.

import { isPlausibleClock, parseHHMM } from './schedule.js';

// An automatic reload hands the idle-sleep clock to the next page through sessionStorage, so it does not read as
// fresh playback (C8M3, D28). A normal load never finds it.
const CARRY_KEY = 'plexPoster.carry';
const CARRY_MAX_AGE_MS = 2 * 60_000;

/** `lastPlaybackAt` left by an automatic reload that just happened, read once; null on any other load. */
export function takeCarriedPlayback() {
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

// A display that runs for weeks sheds Chromium's memory growth with a reload each day, but only where a reload cannot
// strand it: a service worker controls the page (so the reload is answered from the shell cache even if the host is
// down) AND an uncached probe of index.html just succeeded (so the host is up now). Anything else is skipped and logged.
const LAST_RELOAD_KEY = 'plexPoster.lastReload'; // a plain key, not a setting: it is the loop guard
const RELOAD_STALE_MS = 12 * 60 * 60_000; // the first wake from sleep reloads if the last reload is older than this
const RELOAD_GAP_MS = 10 * 60_000; // never two reloads closer than this
const RELOAD_PROBE_MS = 5000;

/**
 * `state` is the page's shared state object (read live: settings, busy, tvWaking, manualWakeUntil, lastPlaybackAt);
 * `getLastDrawAt()` is the performance.now() of the last poster draw.
 */
export function createReload({ state, storage, log, getLastDrawAt }) {
  let bootAt = Date.now(); // moved with the clock when it is set after boot (shiftBoot)

  let reloadPending = ''; // 'scheduled' | 'wake' | 'update' | '': a reload is wanted and waits for a quiet moment
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
    if (document.body?.classList.contains('positioning')) return 'the poster is being positioned'; // an unsaved placement would be lost (D86)
    if (state.busy || state.tvWaking) return 'a poster is loading';
    if (Date.now() < state.manualWakeUntil) return 'a manual wake is running'; // it would lose its 60 s to the reload
    if (performance.now() - getLastDrawAt() < (state.settings.crossfadeMs ?? 0) + 250) return 'a poster is fading in';
    return '';
  }

  function skipReload(why) {
    if (reloadPending !== 'update') reloadPending = ''; // a wanted update reload is not the daily reload's to cancel
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
    if (reloadPending === 'update') {
      // A new version took over (D73). Kiosks are unattended, so it reloads into it, but only at the same quiet moments
      // as the daily reload. It is not the daily reload: the setting, the 10 minute gap and the probe do not apply.
      if (reloadMustWait()) return; // stays pending: looked at again in a second
      log.info('Reloading into the new version');
      return reloadAutomatically();
    }
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
      const at = parseHHMM(state.settings.dailyReloadTime);
      const due = at !== null && now.getHours() * 60 + now.getMinutes() >= at;
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

  return {
    dailyReloadTick,
    dailyReloadRow,
    requestReloadAfterWake,
    /** A new service worker took over: reload into it at the next quiet moment. */
    requestUpdateReload() {
      reloadPending = 'update';
    },
    /** The daily reload time changed: the new time is not "passing" until it does. */
    rearm() {
      reloadArmed = false;
    },
    /** The wall clock stepped by `jump` ms: the page-load time moves with it. */
    shiftBoot(jump) {
      bootAt += jump;
    },
  };
}
