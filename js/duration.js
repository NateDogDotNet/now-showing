// The rotation time as people think of it (minutes) against the setting as it is stored (whole seconds).
// Pure: no DOM. settings-ui.js maps the preset buttons and the Custom field through these in read() and write().

/** The preset buttons, in seconds: 1, 5, 15 and 60 minutes. */
export const PRESET_SECONDS = [60, 300, 900, 3600];

// The schema's own bounds for rotateSeconds (js/settings.js): a value outside them would be clamped there anyway.
export const MIN_SECONDS = 10;
export const MAX_SECONDS = 86400;

/** The preset (in seconds) a stored value matches, or 'custom'. */
export function presetFor(seconds) {
  const n = typeof seconds === 'number' || (typeof seconds === 'string' && seconds.trim() !== '') ? Number(seconds) : NaN;
  return PRESET_SECONDS.includes(n) ? n : 'custom';
}

/**
 * Whole seconds for a number of minutes typed into the Custom field ('2.5' is 150). Below the schema minimum it
 * clamps to 10 s, above the maximum to 24 h. Anything that is not a finite number gives `previous` back, so a
 * half-typed or junk entry never changes the setting.
 */
export function secondsFromMinutes(minutes, previous) {
  const n = typeof minutes === 'number' || (typeof minutes === 'string' && minutes.trim() !== '') ? Number(minutes) : NaN;
  if (!Number.isFinite(n)) return previous;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(n * 60)));
}

/**
 * Seconds as minutes for the Custom field: the shortest text (up to three decimals: '7', '2.5', '0.25') that
 * secondsFromMinutes turns back into the same seconds, so the field shows exactly what will be saved and retyping it
 * changes nothing. '' for junk.
 */
export function formatMinutes(seconds) {
  const n = typeof seconds === 'number' || (typeof seconds === 'string' && seconds.trim() !== '') ? Number(seconds) : NaN;
  if (!Number.isFinite(n)) return '';
  const target = secondsFromMinutes(n / 60); // what the field would save for this value: in range, whole seconds
  let text = '';
  for (let decimals = 0; decimals <= 3; decimals++) {
    text = String(Number((target / 60).toFixed(decimals)));
    if (Math.round(Number(text) * 60) === target) break; // the text itself, not the clamp, gives these seconds
  }
  return text;
}
