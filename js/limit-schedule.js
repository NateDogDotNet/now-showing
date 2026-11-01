// The household limit by time of day (R-FILT-2, D101). A list of slots, each with a start time and its own limit;
// `limitInForce()` is the ONE function that says which limit applies at a moment. Every reader of the limit (the engine, the
// offline cache fallback, the check on what is on screen) calls it instead of reading `maxContentRating`, which is only the
// base limit: what applies with no slots, and the floor of the fail-closed cases.
//
// Fail closed (D5, D101 ruling 6): a clock that is not set, an unreadable slot or an unreadable schedule gives the
// strictest limit, never "no limit". Nothing here reads the clock or the DOM; callers pass `date`.

import { LIMITS } from './ratings.js';
import { isPlausibleClock, parseHHMM } from './schedule.js';

/** The strictest limit: what every fail-closed case returns. */
export const STRICTEST = LIMITS[0];

/** At most this many slots are kept. */
export const MAX_SLOTS = 8;

/** The limit text of a slot that sets no limit (the same as `maxContentRating` with the household toggle off). */
export const NO_LIMIT = '';

const DAYS = [0, 1, 2, 3, 4, 5, 6]; // Date.getDay(): 0 = Sunday

/** Strictness order: the rung in LIMITS (lower is stricter), "no limit" above every rung, anything else below every rung. */
const rank = (limit) => (limit === NO_LIMIT ? LIMITS.length : LIMITS.includes(limit) ? LIMITS.indexOf(limit) : -1);
const strictest = (a, b) => (rank(a) <= rank(b) ? a : b);
/** A limit as a slot may state it; anything unknown becomes the strictest value. */
const slotLimit = (v) => (typeof v === 'string' && (v === NO_LIMIT || LIMITS.includes(v)) ? v : STRICTEST);

/** The schedule that stands for an unreadable one: the strictest limit, all day, every day. */
const unreadable = () => [{ start: '00:00', limit: STRICTEST }];

/**
 * One raw slot as `{ start, limit, days? }`, or null when its time is unreadable (the caller then reads the whole schedule as unreadable). An unknown limit becomes the strictest;
 * `days` (weekdays, 0 = Sunday) is optional, and an unreadable set makes the slot apply every day at the strictest limit.
 */
function cleanSlot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || parseHHMM(raw.start) === null) return null;
  let limit = slotLimit(raw.limit);
  let days = null; // null = every day
  if (raw.days !== undefined && raw.days !== null) {
    const ok = Array.isArray(raw.days) && raw.days.length > 0 && raw.days.every((d) => DAYS.includes(d));
    if (!ok) limit = STRICTEST;
    else if (new Set(raw.days).size < DAYS.length) days = [...new Set(raw.days)].sort((a, b) => a - b);
  }
  return days ? { start: raw.start, limit, days } : { start: raw.start, limit };
}

/**
 * The schedule as stored: [] when there is none (absent, null or an empty list); otherwise up to MAX_SLOTS clean slots,
 * earliest start first. A schedule that is not a list, that has more than MAX_SLOTS slots (D105), or in which ANY slot has an
 * unreadable time (D103), is an unreadable schedule as a whole and becomes the strictest limit all day: no slot is dropped for its time, because dropping a stricter
 * slot can loosen the schedule.
 */
export function sanitizeSlots(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return unreadable();
  if (raw.length === 0) return [];
  const clean = raw.map(cleanSlot);
  if (clean.some((slot) => slot === null)) return unreadable();
  if (clean.length > MAX_SLOTS) return unreadable();
  return clean.map((slot, i) => ({ slot, i })).sort((a, b) => parseHHMM(a.slot.start) - parseHHMM(b.slot.start) || a.i - b.i).map((e) => e.slot);
}

/**
 * Minutes since local midnight on the wall clock, except in the repeated hour of a fall-back change: there a slot that
 * started in the hour's first pass has started, so the minute counts as the last minute of the repeated hour (D105).
 */
function minuteOfDay(date) {
  const wall = date.getHours() * 60 + date.getMinutes();
  const shift = date.getTimezoneOffset() - new Date(date.getTime() - 3600_000).getTimezoneOffset();
  if (shift <= 0) return wall;
  let since = 0; // minutes since the clock was set back
  while (since < shift && new Date(date.getTime() - (since + 1) * 60_000).getTimezoneOffset() === date.getTimezoneOffset()) since++;
  return wall - since + shift - 1;
}

const appliesOn = (slot, weekday) => !slot.days || slot.days.includes(weekday);
const strictestOf = (slots) => slots.reduce((acc, s) => strictest(acc, s.limit), NO_LIMIT);

/**
 * The limit in force at `date`, for a settings object: '' (no limit) or one of LIMITS.
 *
 * - Base limit '' (the household toggle off): no limit, whatever the slots say. Saved slots are kept, not applied. An absent
 *   or null `maxContentRating` is read as the settings default, ''.
 * - No slots: the base limit, untouched (a 2.2 display behaves as before).
 * - Slots (D103, D104): a slot applies only on the days in its set (no set = every day). Today, the slot in force is the one with
 *   the latest start at or before the time among the slots that apply today; two at the same start: the stricter wins. Before
 *   today's first applicable slot, the latest-starting of yesterday's slots that also apply today carries over (the stricter of
 *   two at the same start); only when there is none does the base limit apply.
 * - A clock that is not set (isPlausibleClock false): the strictest of the base limit and every slot.
 * - Settings that are not an object: the strictest limit.
 */
export function limitInForce(settings, date) {
  if (!settings || typeof settings !== 'object') return STRICTEST;
  const base = settings.maxContentRating ?? NO_LIMIT;
  if (base === NO_LIMIT) return NO_LIMIT;
  const slots = sanitizeSlots(settings.limitSlots);
  if (slots.length === 0) return base;
  const floor = LIMITS.includes(base) ? base : STRICTEST;
  if (!isPlausibleClock(date)) return slots.reduce((acc, s) => strictest(acc, s.limit), floor);

  const minute = minuteOfDay(date);
  const today = date.getDay();
  const startOf = (s) => parseHHMM(s.start);
  const started = slots.filter((s) => appliesOn(s, today) && startOf(s) <= minute);
  if (started.length > 0) {
    const latest = Math.max(...started.map(startOf));
    return strictestOf(started.filter((s) => startOf(s) === latest));
  }
  // Before today's first applicable slot (D105):
  // 1. the slot in force at the end of yesterday carries over when it also applies today (a slot runs until the next one starts);
  const yesterday = slots.filter((s) => appliesOn(s, (today + 6) % 7));
  if (yesterday.length > 0) {
    const lastStart = Math.max(...yesterday.map(startOf));
    const final = yesterday.filter((s) => startOf(s) === lastStart);
    if (final.every((s) => appliesOn(s, today))) return strictestOf(final);
  }
  // 2. otherwise the latest-starting of yesterday's slots that also apply today (the stricter of two at the same start), but
  //    never looser than the base limit; 3. when there is none, the base limit.
  const carrying = yesterday.filter((s) => appliesOn(s, today));
  if (carrying.length === 0) return floor;
  const last = Math.max(...carrying.map(startOf));
  return strictest(strictestOf(carrying.filter((s) => startOf(s) === last)), floor);
}

/**
 * The limit in force at `date` and when it next changes: `{ limit, until }`, where `until` is the Date of the next slot start
 * at which the limit in force differs, within the coming 8 days, or null (it does not change; also a clock that is not set,
 * and the toggle off).
 */
export function nextLimitChange(settings, date) {
  const limit = limitInForce(settings, date);
  const slots = settings && typeof settings === 'object' ? sanitizeSlots(settings.limitSlots) : [];
  if (slots.length === 0 || !isPlausibleClock(date)) return { limit, until: null };
  // Midnight is a candidate too: a carried-over slot ends there when the new day is not in its set.
  const starts = [...new Set([0, ...slots.map((s) => parseHHMM(s.start))])].sort((a, b) => a - b);
  const minute = date.getHours() * 60 + date.getMinutes();
  for (let day = 0; day <= DAYS.length; day++) {
    for (const start of starts) {
      if (day === 0 && start <= minute) continue;
      let at = new Date(date.getFullYear(), date.getMonth(), date.getDate() + day, Math.floor(start / 60), start % 60);
      // A start inside the spring-forward gap resolves to a later wall time (02:30 becomes 03:30); the limit changes at the first
      // instant whose wall time is at or after the start (03:00), which is what limitInForce reads.
      const wall = (d) => d.getHours() * 60 + d.getMinutes();
      if (wall(at) !== start) {
        let t = at.getTime();
        while (wall(new Date(t - 60_000)) >= start && new Date(t - 60_000).getDate() === at.getDate()) t -= 60_000;
        at = new Date(t);
      }
      if (limitInForce(settings, at) !== limit) return { limit, until: at };
    }
  }
  return { limit, until: null };
}

/** How a limit is written for a person: "No limit" or the rating. */
export const limitLabel = (limit) => (limit === NO_LIMIT ? 'No limit' : limit);

/**
 * The one line the slot editor shows: the limit in force now and until when, for the settings it is given (the saved ones).
 * `until` is a time of day today, "tomorrow HH:MM", or a weekday and time after that.
 */
export function describeLimitNow(settings, date) {
  const base = settings?.maxContentRating ?? NO_LIMIT;
  if (settings && typeof settings === 'object' && base === NO_LIMIT) {
    const kept = sanitizeSlots(settings.limitSlots).length > 0;
    return `No limit applies: the household limit is off${kept ? ' (the slots are kept, not applied)' : ''}.`;
  }
  if (!isPlausibleClock(date) && settings && typeof settings === 'object' && sanitizeSlots(settings.limitSlots).length > 0) {
    return `The clock is not set, so the strictest limit applies: ${limitLabel(limitInForce(settings, date))}.`;
  }
  const { limit, until } = nextLimitChange(settings, date);
  if (!until) return `In force now: ${limitLabel(limit)}${sanitizeSlots(settings?.limitSlots).length > 0 ? ' all day' : ''}.`;
  const hhmm = `${String(until.getHours()).padStart(2, '0')}:${String(until.getMinutes()).padStart(2, '0')}`;
  const days = Math.round((new Date(until.getFullYear(), until.getMonth(), until.getDate()) - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86400_000);
  const when = days === 0 ? hhmm : days === 1 ? `tomorrow ${hhmm}` : `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][until.getDay()]} ${hhmm}`;
  return `In force now: ${limitLabel(limit)} until ${when}.`;
}

/**
 * Notices a change of the limit in force. `check()` is called often (a timer, a return to the tab); it calls
 * `onChange(next, previous)` once when the limit in force differs from the last one seen. `sync()` adopts the current
 * limit without calling (a Save has already dealt with it).
 */
export function createLimitWatch({ getSettings, now = () => new Date(), onChange }) {
  let last = limitInForce(getSettings(), now());
  return {
    check() {
      const next = limitInForce(getSettings(), now());
      if (next === last) return;
      const previous = last;
      last = next;
      onChange(next, previous);
    },
    sync() {
      last = limitInForce(getSettings(), now());
    },
    get limit() {
      return last;
    },
  };
}
