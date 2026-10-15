// Applies the frame brightness and night dim (R-FRM-4, R-PROT-4) to the display, once a minute. The level itself is
// brightness.js (pure); this holds the timer that re-applies it. `createBrightnessTimer` takes the display and the
// settings getter; nothing here reads the page when the module loads.

import { effectiveBrightness } from './brightness.js';

/** A wall-clock step bigger than this makes the sleep code ask for a fresh level (the night dim may be wrong now). */
export const BRIGHTNESS_JUMP_MS = 2 * 60_000;

export function createBrightnessTimer({ display, getSettings }) {
  let brightnessTimer = 0;

  /** Sets the frame (or stage) brightness for the current minute and re-arms the timer for the next minute boundary. */
  function evaluateBrightness() {
    const now = new Date();
    const settings = getSettings();
    display.setBrightness(effectiveBrightness(now, settings), settings.nightDimTarget);
    clearTimeout(brightnessTimer);
    // Aligned to the minute boundary; a timer that fires a hair early just re-arms for the remaining sliver.
    brightnessTimer = setTimeout(evaluateBrightness, 60_000 - (now.getTime() % 60_000));
  }

  return { evaluate: evaluateBrightness };
}
