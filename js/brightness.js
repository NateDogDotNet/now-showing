// Frame brightness and night dim (R-FRM-4, R-PROT-4). Pure: callers pass `now`; nothing here reads the clock or the DOM.

import { isPlausibleClock, parseHHMM } from './schedule.js';

/** The dim eases in over this many whole minutes after nightDimStart and out over as many before nightDimEnd. */
export const RAMP_MINUTES = 10;
export const MIN_BRIGHTNESS = 0.1;

const DAY_MIN = 1440;
const clamp = (x) => Math.min(1, Math.max(MIN_BRIGHTNESS, x));

/**
 * Night dim level for `now`, 1 = not dimmed. Counted in wall-clock minutes of the local day, so it steps once
 * a minute, crosses midnight, and a DST change shifts nothing. A window shorter than 2 * RAMP_MINUTES never
 * reaches nightDimLevel.
 */
function nightLevel(now, s) {
  if (!s.nightDim || !isPlausibleClock(now)) return 1;
  const start = parseHHMM(s.nightDimStart);
  const end = parseHHMM(s.nightDimEnd);
  if (start === null || end === null || start === end) return 1;
  const m = now.getHours() * 60 + now.getMinutes();
  const sinceStart = (m - start + DAY_MIN) % DAY_MIN;
  const untilEnd = (end - m + DAY_MIN) % DAY_MIN; // 1..: the minute in progress counts
  const length = (end - start + DAY_MIN) % DAY_MIN;
  if (sinceStart >= length) return 1; // outside [start, end)
  const strength = Math.min(sinceStart, untilEnd, RAMP_MINUTES) / RAMP_MINUTES;
  return 1 - strength * (1 - clamp(s.nightDimLevel / 100));
}

/**
 * The brightness (0.1-1) the frame should have at `now`: the lower of the manual frameBrightness and the
 * night dim level.
 *   settings  frameBrightness, nightDim, nightDimStart, nightDimEnd, nightDimLevel (percent)
 */
export function effectiveBrightness(now, settings) {
  const manual = clamp(settings.frameBrightness / 100);
  return clamp(Math.round(Math.min(manual, nightLevel(now, settings)) * 1000) / 1000);
}
