// The household limit by time of day (R-FILT-2, D101). A list of slots, each with a start time and either its own limit or the id
// of a profile (R-PROF-1, D117: the slot then takes that profile's limit). `limitInForce()` is the ONE function that says which
// limit applies at a moment; `slotInForce()` also says which slot gave it. Every reader of the limit (the engine, the offline cache
// fallback, the check on what is on screen) goes through them, or through the resolver in js/profiles.js that builds on them, instead
// of reading `maxContentRating`, which is only the base limit: what applies with no slots, and the floor of the fail-closed cases.
//
// Fail closed (D5, D101 ruling 6, D117 5): a clock that is not set, an unreadable slot or an unreadable schedule gives the
// strictest limit, never "no limit"; a slot that names a profile that does not exist is read like an unreadable slot: G (D120 2). Nothing here reads the clock or the
// DOM; callers pass `date`.

import { LIMITS } from './ratings.js';
import { isPlausibleClock, parseHHMM } from './schedule.js';

/** The strictest limit: what every fail-closed case returns. */
export const STRICTEST = LIMITS[0];

/** At most this many slots: a schedule with more is read as unreadable as a whole (D105), not cut down to this many. */
export const MAX_SLOTS = 8;

/** The limit text of a slot that sets no limit (the same as `maxContentRating` with the household toggle off). */
export const NO_LIMIT = '';

const DAYS = [0, 1, 2, 3, 4, 5, 6]; // Date.getDay(): 0 = Sunday

/** Strictness order: the rung in LIMITS (lower is stricter), "no limit" above every rung, anything else below every rung. */
const rank = (limit) => (limit === NO_LIMIT ? LIMITS.length : LIMITS.includes(limit) ? LIMITS.indexOf(limit) : -1);
const strictest = (a, b) => (rank(a) <= rank(b) ? a : b);
/** A limit as a slot or a profile may state it; anything unknown becomes the strictest value. */
export const cleanLimit = (v) => (typeof v === 'string' && (v === NO_LIMIT || LIMITS.includes(v)) ? v : STRICTEST);
const slotLimit = cleanLimit;

/**
 * Marks the schedule that stands for an unreadable one, so the editor can say why it shows G all day. A symbol is never written
 * by JSON.stringify: once that schedule is saved it is an ordinary one-slot schedule, the owner's own choice.
 */
const UNREADABLE = Symbol('unreadable schedule');

/** The schedule that stands for an unreadable one: the strictest limit, all day, every day. */
const unreadable = () => Object.defineProperty([{ start: '00:00', limit: STRICTEST }], UNREADABLE, { value: true }); // not enumerable: the value equals [{ 00:00, G }]

/** True when `slots` is the G-all-day schedule that sanitizeSlots put in place of an unreadable one (it is not yet saved). */
export const wasUnreadable = (slots) => Boolean(slots?.[UNREADABLE]);

/**
 * One raw slot as `{ start, limit, days? }` or, when it names a profile, `{ start, profile, days? }`; null when its time is unreadable
 * (the caller then reads the whole schedule as unreadable). An unknown limit becomes the strictest; `days` (weekdays, 0 = Sunday) is
 * optional, and an unreadable set makes the slot apply every day at the strictest limit (a profile slot then becomes that limit slot).
 * A slot gives a limit OR a profile (D117 3): when both are present the profile wins and the limit is dropped. A profile id that is not
 * text becomes the empty id, which no profile has, so the slot fails closed (D117 5).
 */
function cleanSlot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || parseHHMM(raw.start) === null) return null;
  const named = raw.profile !== undefined && raw.profile !== null;
  let limit = slotLimit(raw.limit);
  let days = null; // null = every day
  let badDays = false;
  if (raw.days !== undefined && raw.days !== null) {
    badDays = !(Array.isArray(raw.days) && raw.days.length > 0 && raw.days.every((d) => DAYS.includes(d)));
    if (badDays) limit = STRICTEST;
    else if (new Set(raw.days).size < DAYS.length) days = [...new Set(raw.days)].sort((a, b) => a - b);
  }
  const gives = named && !badDays ? { profile: typeof raw.profile === 'string' ? raw.profile : '' } : { limit };
  return days ? { start: raw.start, ...gives, days } : { start: raw.start, ...gives };
}

/**
 * The schedule as stored: [] when there is none (absent, null or an empty list); otherwise up to MAX_SLOTS clean slots,
 * earliest start first. A schedule that is not a list, that has more than MAX_SLOTS slots (D105), or in which ANY slot has an
 * unreadable time (D103), is an unreadable schedule as a whole and becomes the strictest limit all day: no slot is dropped for its time, because dropping a stricter
 * slot can loosen the schedule.
 */
export function sanitizeSlots(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || wasUnreadable(raw)) return unreadable(); // a stand-in read again (settings are sanitised more than once) stays marked
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

const profileList = (settings) => (Array.isArray(settings?.profiles) ? settings.profiles.filter((p) => p && typeof p === 'object') : []);
/** The profile a slot names, or undefined when there is none (a missing profile fails closed). */
export const profileOf = (settings, id) => (typeof id === 'string' && id !== '' ? profileList(settings).find((p) => p.id === id) : undefined);
/** The limit a slot gives: its own, or its profile's; the strictest when it names a profile that does not exist (D120 2). */
const slotGives = (settings, slot) => {
  if (slot.profile === undefined) return slot.limit;
  const profile = profileOf(settings, slot.profile);
  return profile ? cleanLimit(profile.maxContentRating) : STRICTEST;
};

/**
 * Which slot is in force at `date`, and the limit it gives: `{ limit, slot }`. `slot` is the clean slot (`{ start, limit | profile,
 * days? }`) in force, or null when none is: no slots, the base limit applying before any slot, or a fail-closed case.
 *
 * - No slots: the base limit, untouched (a 2.2 display behaves as before).
 * - Slots (D103, D104, D105): a slot applies only on the days in its set (no set = every day). Today, the slot in force is the one
 *   with the latest start at or before the time among the slots that apply today; two at the same start: the stricter wins (the
 *   first of equals). Before today's first applicable slot, the slots in force at the end of yesterday (the latest start among
 *   yesterday's slots, the stricter of two at the same start) run on only when EVERY one of them also applies today. Otherwise the
 *   latest-starting of yesterday's slots that also apply today carries over, never looser than the base limit; when there is none,
 *   the base limit applies.
 * - A slot that names a profile that does not exist gives G while it is in force (D120 2); it is returned as the slot in force, and
 *   no bundle goes with it.
 * - Fail closed (D5): a clock that is not set gives the strictest of the base limit and every slot (a missing profile counts as G),
 *   and, when any slot names a profile, every profile. The slot is then null.
 * - Base limit '' (the household toggle off): the limit is '' and no slot is in force: slots and profiles are kept, not applied (D120 4).
 * - Settings that are not an object: the strictest limit.
 */
export function slotInForce(settings, date) {
  if (!settings || typeof settings !== 'object') return { limit: STRICTEST, slot: null };
  const base = settings.maxContentRating ?? NO_LIMIT;
  const slots = sanitizeSlots(settings.limitSlots);
  if (slots.length === 0) return { limit: base, slot: null };
  const found = locate(settings, base, slots, date);
  return base === NO_LIMIT ? { limit: NO_LIMIT, slot: null } : found;
}

function locate(settings, base, slots, date) {
  const entries = slots.map((slot) => ({ slot, limit: slotGives(settings, slot) }));
  const floor = base === NO_LIMIT || LIMITS.includes(base) ? base : STRICTEST;
  if (!isPlausibleClock(date)) {
    let limit = floor;
    for (const e of entries) limit = strictest(limit, e.limit);
    if (slots.some((s) => s.profile !== undefined)) for (const p of profileList(settings)) limit = strictest(limit, cleanLimit(p.maxContentRating));
    return { limit, slot: null };
  }

  const strictestEntry = (list) => list.reduce((best, e) => (rank(e.limit) < rank(best.limit) ? e : best));
  const startOf = (e) => parseHHMM(e.slot.start);
  const on = (e, weekday) => appliesOn(e.slot, weekday);
  const minute = minuteOfDay(date);
  const today = date.getDay();
  const started = entries.filter((e) => on(e, today) && startOf(e) <= minute);
  if (started.length > 0) {
    const latest = Math.max(...started.map(startOf));
    return strictestEntry(started.filter((e) => startOf(e) === latest));
  }
  // Before today's first applicable slot (D105):
  // 1. the slots in force at the end of yesterday run on when every one of them also applies today (a slot runs until the next one starts);
  const yesterday = entries.filter((e) => on(e, (today + 6) % 7));
  if (yesterday.length > 0) {
    const lastStart = Math.max(...yesterday.map(startOf));
    const final = yesterday.filter((e) => startOf(e) === lastStart);
    if (final.every((e) => on(e, today))) return strictestEntry(final);
  }
  // 2. otherwise the latest-starting of yesterday's slots that also apply today (the stricter of two at the same start), but
  //    never looser than the base limit; 3. when there is none, the base limit.
  const carrying = yesterday.filter((e) => on(e, today));
  if (carrying.length === 0) return { limit: floor, slot: null };
  const last = Math.max(...carrying.map(startOf));
  const best = strictestEntry(carrying.filter((e) => startOf(e) === last));
  return rank(best.limit) <= rank(floor) ? best : { limit: floor, slot: null };
}

/**
 * The limit in force at `date`, for a settings object: '' (no limit) or one of LIMITS. Base limit '' (the household toggle off) is
 * no limit, whatever the slots say (saved slots are kept, not applied); an absent or null `maxContentRating` is read as the
 * settings default, ''. Otherwise it is `slotInForce(...).limit`.
 */
export function limitInForce(settings, date) {
  if (!settings || typeof settings !== 'object') return STRICTEST;
  if ((settings.maxContentRating ?? NO_LIMIT) === NO_LIMIT) return NO_LIMIT;
  return slotInForce(settings, date).limit;
}

/** The profile the slot in force names, or null (none, missing, or the household toggle off: D120 4). */
export function profileInForce(settings, date) {
  const { slot } = slotInForce(settings, date);
  return slot?.profile === undefined ? null : profileOf(settings, slot.profile) ?? null;
}

/** Does the base limit, or any slot (through its profile too), set a limit? A slot that names a missing profile counts: it gives G. */
export function anyLimitSet(settings) {
  if (!settings || typeof settings !== 'object') return true;
  if (settings.maxContentRating) return true;
  return sanitizeSlots(settings.limitSlots).some((slot) => slotGives(settings, slot) !== NO_LIMIT);
}

/** Does the slot in force name a profile that does not exist? (It then gives G.) */
export const hasMissingProfile = (settings, date) => {
  const { slot } = slotInForce(settings, date);
  return slot !== null && slot.profile !== undefined && !profileOf(settings, slot.profile);
};

/**
 * The limit in force at `date` and when it next changes: `{ limit, until }`, where `until` is the Date of the next slot start
 * at which the limit in force, or the profile in force, differs, within the coming 8 days, or null (it does not change; also a clock
 * that is not set). `until` is always after `date`: in the repeated hour of a fall-back change a start that already passed in the
 * hour's first pass is not named.
 */
export function nextLimitChange(settings, date) {
  const limit = limitInForce(settings, date);
  const profile = slotInForce(settings, date).slot?.profile ?? null;
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
      if (at.getTime() <= date.getTime()) continue; // already past: the repeated hour of a fall-back change (D106 2)
      if (limitInForce(settings, at) !== limit || (slotInForce(settings, at).slot?.profile ?? null) !== profile) return { limit, until: at };
    }
  }
  return { limit, until: null };
}

/** How a limit is written for a person: "No limit" or the rating. */
export const limitLabel = (limit) => (limit === NO_LIMIT ? 'No limit' : limit);

/**
 * The one line the slot editor shows: the limit in force now and until when, for the settings it is given (the saved ones).
 * `until` is a time of day today, "tomorrow HH:MM", a weekday and time, or "next <weekday> HH:MM" when it is a week away. A slot in
 * force that names a profile says so: "G (Kids profile)".
 */
export function describeLimitNow(settings, date) {
  const base = settings?.maxContentRating ?? NO_LIMIT;
  const slots = settings && typeof settings === 'object' ? sanitizeSlots(settings.limitSlots) : [];
  if (settings && typeof settings === 'object' && base === NO_LIMIT) {
    const kept = slots.length > 0 ? (slots.some((slot) => slot.profile !== undefined) ? ' (the slots and profiles are kept, not applied)' : ' (the slots are kept, not applied)') : '';
    return `No limit applies: the household limit is off${kept}.`;
  }
  if (!isPlausibleClock(date) && settings && typeof settings === 'object' && slots.length > 0) {
    return `The clock is not set, so the strictest limit applies: ${limitLabel(limitInForce(settings, date))}.`;
  }
  if (slots.length > 0 && settings && typeof settings === 'object' && hasMissingProfile(settings, date)) {
    return `The slot in force names a profile that does not exist, so G applies. Choose another profile or a limit for that slot.`;
  }
  const { limit, until } = nextLimitChange(settings, date);
  const profile = profileInForce(settings, date);
  const what = `${limitLabel(limit)}${profile ? ` (${profile.name} profile)` : ''}`;
  if (!until) return `In force now: ${what}${slots.length > 0 ? ' all day' : ''}.`;
  const hhmm = `${String(until.getHours()).padStart(2, '0')}:${String(until.getMinutes()).padStart(2, '0')}`;
  const days = Math.round((new Date(until.getFullYear(), until.getMonth(), until.getDate()) - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86400_000);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][until.getDay()];
  const when = days === 0 ? hhmm : days === 1 ? `tomorrow ${hhmm}` : days >= 7 ? `next ${weekday} ${hhmm}` : `${weekday} ${hhmm}`;
  return `In force now: ${what} until ${when}.`;
}

/**
 * Notices a change of what the schedule puts in force: the limit, or the profile (a profile change can leave the limit as it was). One
 * reading of the settings and the clock serves a whole check.
 * `check()` is called often (a timer, a return to the tab); it calls `onChange(next, previous)` (the limits) once when either differs
 * from the last one seen. `sync()` adopts the current state without calling (a Save has already dealt with it).
 */
export function createLimitWatch({ getSettings, now = () => new Date(), onChange }) {
  const read = () => {
    const settings = getSettings();
    const date = now();
    return { limit: limitInForce(settings, date), profile: slotInForce(settings, date).slot?.profile ?? null };
  };
  let last = read();
  return {
    check() {
      const next = read();
      if (next.limit === last.limit && next.profile === last.profile) return;
      const previous = last;
      last = next;
      onChange(next.limit, previous.limit);
    },
    sync() {
      last = read();
    },
    get limit() {
      return last.limit;
    },
    get profile() {
      return last.profile;
    },
  };
}
