// Viewer profiles (R-PROF-1, D117): a named bundle of the household limit, the now-playing rule, the poster selection, weighting and
// the frame. A schedule slot names a profile instead of a bare limit; while that slot is in force the profile's bundle replaces those
// settings. `resolveSettings()` is the ONE function that says which settings are in force at a moment: the engine, the offline
// fallback, now playing, the frame, the empty card and the status line read it, as they read `limitInForce` before profiles.
//
// The limit in force is a ceiling and always wins (D5): the resolver sets `maxContentRating` to `limitInForce` and nothing in a
// bundle can raise it. Pure functions, no DOM and no clock: callers pass `date`.

import { cleanLimit, limitInForce, limitLabel, profileOf, slotInForce } from './limit-schedule.js';
import { cleanGenres, cleanKeys, cleanNames, cleanRatings, cleanSource } from './selection.js';
import { cleanDays, cleanWeighting } from './weighting.js';

/** At most this many profiles; a 7th is refused. */
export const MAX_PROFILES = 6;
/** A name is 1 to this many characters after trimming. */
export const NAME_MAX = 24;

/** The settings a profile holds, and nothing else (D117 1). */
export const BUNDLE_KEYS = ['maxContentRating', 'limitNowPlaying', 'libraryKeys', 'libraryNames', 'genres', 'ratings', 'source', 'weighting', 'noRepeatDays', 'frameId'];

const boolOf = (v, d) => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : d);

/**
 * A bundle as stored: every key present and clean. An unknown or absent limit is the strictest (a profile never loosens by being
 * unreadable); the names line up with the library keys.
 */
export function cleanBundle(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const keys = cleanKeys(r.libraryKeys);
  const names = cleanNames(r.libraryNames);
  return {
    maxContentRating: cleanLimit(r.maxContentRating),
    limitNowPlaying: boolOf(r.limitNowPlaying, true),
    libraryKeys: keys,
    libraryNames: keys.map((_, i) => names[i] || ''),
    genres: cleanGenres(r.genres),
    ratings: cleanRatings(r.ratings),
    source: cleanSource(r.source),
    weighting: cleanWeighting(r.weighting),
    noRepeatDays: cleanDays(r.noRepeatDays),
    frameId: typeof r.frameId === 'string' && r.frameId.trim() ? r.frameId.trim() : 'marquee',
  };
}

/** The bundle a settings object (the sheet's current values) stands for. */
export const bundleOf = (settings) => cleanBundle(settings);

/** A name as stored: trimmed and cut to NAME_MAX; '' when nothing is left. */
export const cleanName = (v) => (typeof v === 'string' ? v.trim().slice(0, NAME_MAX).trim() : '');

/**
 * The profiles as stored: [] unless a list; each `{ id, name, ...bundle }` with a clean bundle. A profile without a text id or a
 * readable name, one whose id or name (ignoring case) repeats an earlier one, and any beyond MAX_PROFILES are dropped. A slot that
 * names a dropped profile then fails closed (D117 5, 6).
 */
export function cleanProfiles(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = new Set();
  const names = new Set();
  const out = [];
  for (const p of raw) {
    if (out.length >= MAX_PROFILES) break;
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const id = typeof p.id === 'string' ? p.id.trim() : '';
    const name = cleanName(p.name);
    if (!id || !name || ids.has(id) || names.has(name.toLowerCase())) continue;
    ids.add(id);
    names.add(name.toLowerCase());
    out.push({ id, name, ...cleanBundle(p) });
  }
  return out;
}

// ---- the editor's operations: each gives { profiles } or { error } and never changes its input ----

/** Is `name` usable for a profile (not `exceptId`'s own)? `{ name }` cleaned, or `{ error }` in words for a person. */
export function checkName(profiles, name, exceptId = null) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return { error: 'Give the profile a name.' };
  if (trimmed.length > NAME_MAX) return { error: `A name is at most ${NAME_MAX} characters.` };
  if (profiles.some((p) => p.id !== exceptId && p.name.toLowerCase() === trimmed.toLowerCase())) return { error: 'Another profile already has that name.' };
  return { name: trimmed };
}

/** A profile id no profile has. */
export function newId(profiles) {
  const taken = new Set(profiles.map((p) => p.id));
  for (;;) {
    const id = `p${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.has(id)) return id;
  }
}

/** Adds a profile holding `bundle` (the sheet's current values). Refused at MAX_PROFILES, or for an unusable name. */
export function addProfile(profiles, name, bundle, id = newId(profiles)) {
  if (profiles.length >= MAX_PROFILES) return { error: `${MAX_PROFILES} profiles is the most. Delete one to add another.` };
  const checked = checkName(profiles, name);
  if (checked.error) return checked;
  return { profiles: [...profiles, { id, name: checked.name, ...cleanBundle(bundle) }], id };
}

export function renameProfile(profiles, id, name) {
  if (!profiles.some((p) => p.id === id)) return { error: 'That profile no longer exists.' };
  const checked = checkName(profiles, name, id);
  if (checked.error) return checked;
  return { profiles: profiles.map((p) => (p.id === id ? { ...p, name: checked.name } : p)) };
}

/** "Done" in the editor: the profile keeps its id and name and takes the edited controls as its bundle. */
export function updateProfile(profiles, id, bundle) {
  if (!profiles.some((p) => p.id === id)) return { error: 'That profile no longer exists.' };
  return { profiles: profiles.map((p) => (p.id === id ? { id: p.id, name: p.name, ...cleanBundle(bundle) } : p)) };
}

/** Deletes a profile, unless a slot names it (D117 6): the refusal names the slot by its start time. */
export function removeProfile(profiles, id, slots) {
  const profile = profiles.find((p) => p.id === id);
  if (!profile) return { error: 'That profile no longer exists.' };
  const using = (Array.isArray(slots) ? slots : []).filter((s) => s && s.profile === id).map((s) => s.start);
  if (using.length > 0) {
    const times = using.length === 1 ? `the ${using[0]} slot` : `the ${using.slice(0, -1).join(', ')} and ${using.at(-1)} slots`;
    return { error: `“${profile.name}” is used by ${times}. Change or remove ${using.length === 1 ? 'that slot' : 'those slots'} first.` };
  }
  return { profiles: profiles.filter((p) => p.id !== id) };
}

/** Does the bundle choose any library or a collection or playlist? ("Done" is refused while it does not; D120 3.) */
export const bundleHasSource = (bundle) => Boolean(bundle.source) || bundle.libraryKeys.length > 0;

const WEIGHTING_WORDS = { unwatched: 'unwatched first', rated: 'best reviewed first' };

/** One line for the list: the limit, the library or source, the frame and, when it is on, the weighting, e.g. "G · Kids Movies · marquee · unwatched first". */
export function describeProfile(profile, frameName = (id) => id) {
  const libs = profile.source ? `${profile.source.kind} ${profile.source.title || profile.source.key}` : profile.libraryNames.filter(Boolean).join(', ') || (profile.libraryKeys.length ? `${profile.libraryKeys.length} libraries` : 'no library');
  return [limitLabel(profile.maxContentRating), libs, frameName(profile.frameId), WEIGHTING_WORDS[profile.weighting]].filter(Boolean).join(' · ');
}

/**
 * Is a no-repeat window above 0 anywhere: the household's own saved one, or any profile's? One shown-titles record serves them all, and it
 * is cleared (D115 4, D116 2) only when this is false (D120 5): a profile with window 0 records nothing and clears nothing.
 */
export const anyWindow = (settings) =>
  cleanDays(settings?.noRepeatDays) > 0 || (Array.isArray(settings?.profiles) ? settings.profiles : []).some((p) => p && typeof p === 'object' && cleanDays(p.noRepeatDays) > 0);

// ---- the resolver ----

/**
 * The settings in force at `date`: the stored settings, with `maxContentRating` set to the limit in force (`limitInForce`) and, while a
 * slot that names a profile is in force, that profile's bundle laid over the rest (`libraryKey` and `libraryName` follow the first
 * library, as the settings keep them). With no profiles and no profile slots it is `{ ...settings, maxContentRating: limitInForce }`,
 * exactly what readers had before (D101 ruling 5). A slot that names a missing profile, or a clock that is not set, puts no bundle in
 * force: G applies (D120 2) and the other settings are the sheet's. With the household toggle off nothing is applied: slots and profiles
 * are kept, and no profile switches anything (D120 4). While a profile is in force its name is `profileName`, for the empty card.
 */
export function resolveSettings(settings, date) {
  const limit = limitInForce(settings, date);
  const resolved = { ...settings, maxContentRating: limit };
  const { slot } = slotInForce(settings, date);
  const profile = slot?.profile === undefined ? null : profileOf(settings, slot.profile);
  if (!profile) return resolved;
  const bundle = cleanBundle(profile);
  delete bundle.maxContentRating; // the limit in force is the profile's limit only through limitInForce; nothing here can raise it
  return { ...resolved, ...bundle, libraryKey: bundle.libraryKeys[0] || '', libraryName: bundle.libraryNames[0] || '', profileName: profile.name };
}

