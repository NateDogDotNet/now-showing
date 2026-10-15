// The TV side of the opt-in device helper (R-HELP-2, D8): power the screen off once the sleep veil is up, power it on
// at wake and give it time before the first poster, and read the CPU temperature for Diagnostics. The helper itself
// (the HTTP client) is helper.js; this holds what the page does with it. `createTvPower` takes the page's state and a
// few callbacks; nothing here reads the page when the module loads.

// How long the TV gets to wake after the power-on request before the first poster is fetched. (verify) on hardware:
// the V1-E22 checklist row measures it.
export const TV_WAKE_MS = 4000;
export const DIAG_TEMP_MS = 5000; // CPU temperature refresh, only while Diagnostics is open

/**
 * `state` is the page's shared state object (read live: settings, asleep, tvWaking, tickAfterWake, busy, paused,
 * forceAfter); `tick` is the poster tick; `diagnosticsOpen()` and `renderDiagnostics()` reach the Diagnostics dialog.
 */
export function createTvPower({ state, helper, tick, diagnosticsOpen, renderDiagnostics }) {
  let tvOff = false; // we asked the TV to switch off and have not switched it on again
  let powerChain = Promise.resolve(); // power requests go out one at a time, in order
  let helperInfo = { available: false, tempC: null, temperature: null };

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

  /** The TV wake window ended: run the tick that arrived during it (asleep too: the playback poll must not stop), else the wake's own. */
  function afterTvWake() {
    const queued = state.tickAfterWake;
    state.tickAfterWake = null;
    if (!queued) return !state.asleep && !state.busy && !state.paused && tick();
    if (queued.force && state.busy) state.forceAfter = true; // the tick in flight began before the call that wanted it forced
    return tick(queued);
  }

  /** The setting was switched off while we had the TV powered off: one power on so the screen is not stranded, then silence. */
  function releaseTv() {
    if (!tvOff) return;
    tvOff = false;
    queuePower(true); // we switched the TV off, whatever the last read said; a failure is logged once by the helper, nothing more is sent
  }

  async function refreshTemperature() {
    if (!helperActive()) return;
    helperInfo = await helper.status();
    if (diagnosticsOpen()) renderDiagnostics();
  }

  return {
    helperActive,
    probeHelper,
    powerOffAfterVeil,
    wakeTv,
    afterTvWake,
    releaseTv,
    refreshTemperature,
    /** We asked the TV to switch off and have not switched it on again. */
    get isOff() {
      return tvOff;
    },
    /** The setting was switched off since the power off: forget it, no helper call at all. */
    clearOff() {
      tvOff = false;
    },
    /** The last probe or temperature read: { available, tempC, temperature }. */
    get info() {
      return helperInfo;
    },
  };
}
