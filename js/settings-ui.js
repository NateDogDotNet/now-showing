// Settings sheet: form binding, live layout preview, sign-in (Plex, Jellyfin, Emby) and import/export.

import { formatMinutes, presetFor, secondsFromMinutes } from './duration.js';
import { FRAMES, NO_FRAME, CUSTOM_FRAME_ID } from './frames.js';
import { createSource, createSources, DEFAULT_LIBRARY, discoverKey, needsSources, readPlayers, readServerId, signInFlow, sourceOf, validYear } from './sources/index.js';
import { describeLimitNow, MAX_SLOTS, NO_LIMIT, wasUnreadable } from './limit-schedule.js';
import { createPositionMode } from './position.js';
import { addProfile, BUNDLE_KEYS, bundleHasSource, bundleOf, checkName, describeProfile, MAX_PROFILES, removeProfile, renameProfile, updateProfile } from './profiles.js';
import { parseHHMM } from './schedule.js';
import { LIMITS } from './ratings.js';
import { belongsTo, genreRequestValue, genresAreAll, houseRequestValue, housesNarrowAList, memberBelongsTo, offeredRatings, selectionOf } from './selection.js';
import { addressOf as cleanAddress, defaults, followNames, importWithConnection, isConfigured, MAX_SERVERS, oldTokenMayGo, PLAYER_STATES, playerRows, sanitize, serverList, serversDroppedByTmdbImport, setAllowed, tmdbDroppedByImport, toExport } from './settings.js';
import { actionButton, downloadJson, sleep, toast } from './util.js';

const LAYOUT_KEYS = ['posterScale', 'posterOffsetX', 'posterOffsetY'];

/**
 * "Recommended protection" (R-PROT-5, D4/D5/D6, Q20): the values the one-tap button would set, kept here (not in the
 * schema) so the preset can evolve without a settings change. It never touches idle sleep, the content limit, the
 * connection or any key not listed. `locked` rows are shown but cannot be unticked (the night-dim target, Q20).
 */
export const PROTECTION_PRESET = [
  { key: 'sleepEnabled', value: true, label: 'Go black on a schedule' },
  { key: 'sleepStart', value: '01:00', label: 'Sleep from' },
  { key: 'sleepEnd', value: '07:00', label: 'Sleep until' },
  { key: 'nightDim', value: true, label: 'Dim automatically at night' },
  { key: 'nightDimLevel', value: 60, label: 'Night brightness (%)' },
  { key: 'nightDimTarget', value: 'stage', label: 'Dim the whole picture', locked: true },
  { key: 'pixelShift', value: true, label: 'Shift the picture now and then' },
  { key: 'dailyReload', value: true, label: 'Reload the page once a day' },
];
const showValue = (v) => (v === true ? 'on' : v === false ? 'off' : String(v));
/** How the preset list prints a value: a select shows the label of its option, as the form does; the rest as showValue. */
function showFormValue(el, v) {
  const option = el.tagName === 'SELECT' ? [...el.options].find((o) => o.value === String(v)) : null;
  return option ? option.textContent.trim() : showValue(v);
}

// ---- the words that follow the server type (D139 5) ----

// Every element marked data-srv keeps the Plex words it has in index.html; a Jellyfin or Emby display swaps in these.
const JELLYFIN_TEXT = {
  lead: 'In Jellyfin, open your user menu, choose <strong>Quick Connect</strong> and enter this code:',
  hint: 'Welcome! Sign in with Quick Connect (or a user name and password), choose a library, then save.',
  legend: 'Jellyfin connection',
  signin: 'Sign in with Quick Connect',
  'panel-lead': 'In Jellyfin, open your user menu, choose <strong>Quick Connect</strong> and enter this code:',
  token: 'Jellyfin access token',
  user: 'Only for this Jellyfin user',
  position: 'Connect to Jellyfin first, then you can position the poster.',
};
const JELLYFIN_DESCRIPTION = 'Full-screen Jellyfin movie poster display with a decorative frame — built for always-on screens.';
// Emby has no Quick Connect: its sign-in is the user name and password form, so the lines about a code are not shown for it.
const EMBY_TEXT = {
  lead: 'Sign in with your Emby user name and password.',
  hint: 'Welcome! Sign in with your Emby user name and password, choose a library, then save.',
  legend: 'Emby connection',
  signin: 'Sign in to Emby',
  'panel-lead': 'Sign in with your Emby user name and password.',
  token: 'Emby access token',
  user: 'Only for this Emby user',
  position: 'Connect to Emby first, then you can position the poster.',
};
const EMBY_DESCRIPTION = 'Full-screen Emby movie poster display with a decorative frame — built for always-on screens.';
// TMDB has no sign-in: the lines about a code or a token read as a key to enter (the card and the sign-in controls stay hidden for it).
const TMDB_TEXT = {
  lead: 'Enter your TMDB key in Settings.',
  hint: 'Welcome! Enter your TMDB key, choose where the posters come from, then save.',
  legend: 'TMDB connection',
  signin: 'Enter your TMDB key',
  'panel-lead': 'Enter your TMDB key in Settings.',
  token: 'TMDB key',
  user: 'Only for this user',
  position: 'Connect to TMDB first, then you can position the poster.',
};
const TMDB_DESCRIPTION = 'Full-screen movie poster display with a decorative frame, showing posters from TMDB — built for always-on screens.';
const SERVER_WORDS = { jellyfin: [JELLYFIN_TEXT, JELLYFIN_DESCRIPTION], emby: [EMBY_TEXT, EMBY_DESCRIPTION], tmdb: [TMDB_TEXT, TMDB_DESCRIPTION] };

/** Sets every data-srv line (and the page description) to the words of this server type; Plex, or one no adapter knows, reads the index.html words. */
export function applyServerText(type, root = document) {
  const [text, description] = SERVER_WORDS[type] || [null, null];
  for (const el of root.querySelectorAll('[data-srv]')) {
    el.dataset.plexHtml ??= el.innerHTML;
    const words = text ? text[el.dataset.srv] ?? el.dataset.plexHtml : el.dataset.plexHtml;
    if (el.innerHTML !== words) el.innerHTML = words;
  }
  const meta = root.querySelector('meta[name="description"]');
  if (meta) {
    meta.dataset.plexContent ??= meta.content;
    meta.content = description || meta.dataset.plexContent;
  }
}

// ---- the plex.tv code (shared by the Settings sheet and the empty card's first run) ----

const PIN_POLL_MS = 5000; // K50: one poll per 5 s while the code is fresh
const PIN_POLL_MAX_MS = 30_000; // polls back off to this while plex.tv does not answer
const PIN_DEFAULT_LIFE_S = 15 * 60; // when plex.tv does not say how long the code lives
const PIN_MIN_LIFE_MS = 5000; // a lifetime shorter than this is not believed: it must not turn into a request loop

/**
 * One round of the plex.tv/link flow (or, for Jellyfin, a Quick Connect code): asks for a code, hands it to `onCode`, and polls until
 * it is approved. Resolves to the access token when it is, or to null when the code expires (a fresh call makes a fresh code; a poll
 * that throws an error marked `expired` ends the round at once) or `signal` aborts. Throws a
 * SourceError when the code cannot be had at all (the caller decides how to retry). A poll that fails is not an error: the
 * code stays good, so it just waits longer before the next one. The lifetime is plex.tv's own `expiresIn`, counted on this
 * device's monotonic clock, so a device with the wrong date neither expires a code at once nor holds a dead one.
 */
export async function pinSignIn(clientId, { signal, onCode, fetchImpl, pollMs = PIN_POLL_MS, minLifeMs = PIN_MIN_LIFE_MS, settings, version } = {}) {
  const { createPin, checkPin } = signInFlow(settings, { version, fetchImpl });
  const pin = await createPin(clientId, fetchImpl ? { fetchImpl } : {});
  if (signal?.aborted) return null;
  onCode?.(pin.code);
  const lifeMs = Math.max(minLifeMs, (pin.expiresIn ?? PIN_DEFAULT_LIFE_S) * 1000);
  const startedAt = performance.now();
  let failures = 0;
  while (!signal?.aborted && performance.now() - startedAt < lifeMs) {
    const left = lifeMs - (performance.now() - startedAt);
    await sleep(Math.min(left, PIN_POLL_MAX_MS, pollMs * 2 ** failures), signal);
    if (signal?.aborted) return null;
    try {
      const token = await checkPin(clientId, pin.id, fetchImpl ? { fetchImpl } : {});
      failures = 0;
      if (token) return token;
    } catch (err) {
      if (err?.expired) return null; // the server no longer knows the code: the caller asks for a fresh one
      failures = Math.min(failures + 1, 5);
    }
  }
  return null;
}

// ---- the time slots (R-FILT-2): rows of start time, limit and days, held in the list itself until Save ----

const DAY_SETS = { all: undefined, weekdays: [1, 2, 3, 4, 5], weekends: [0, 6] };
const sameDays = (a, b) => a.length === b.length && a.every((d, i) => d === b[i]);

/** The `days` select value for a stored weekday set; anything that is not a preset is 'custom' (kept as it is, shown as "Selected days"). */
const daysChoice = (days) => (days ? Object.keys(DAY_SETS).find((k) => DAY_SETS[k] && sameDays(DAY_SETS[k], days)) || 'custom' : 'all');

const countLabel = (n) => `${n.toLocaleString('en-US')} ${n === 1 ? 'title' : 'titles'}`;

/**
 * `requestPin()` is the app's one PIN check (true at once when no PIN is set); the token reveal, the token export,
 * an import and Reset everything all go through it. `choosePin()` asks for a new PIN twice and gives { hash, salt }.
 */
export function createSettingsUI({ getSettings, clientId, version = '', log, onPreview, onSave, onClearCache, onReset, requestPin, choosePin, fixesFor = () => [], runFix = () => {} }) {
  const $ = (id) => document.getElementById(id);
  const dialog = $('settings');
  const form = $('settings-form');
  const field = (name) => form.elements.namedItem(name);
  let original = null;
  let pinAbort = null;
  let servers = [];
  // The pin the dialog would save: set by write() (open and import), cleared by Unpin, used by read(). It is separate
  // from the saved pin, which the live preview keeps applying until Save (an unsaved pin is never drawn, D29).
  let pendingPin = { key: '', title: '' };
  // The PIN material the dialog would save, like pendingPin: set from the saved settings by write(), changed by the
  // Set / Remove buttons, saved by Save. An import never changes it (fromImport ignores PIN material).
  let pendingAuth = { hash: '', salt: '' };
  // The sign-in controls show when nothing is connected yet, or after Change; otherwise the "Connected to" card does.
  let connectionOpen = true;
  let testing = false;
  let testRun = 0; // bumped when the connection under test is dropped (a type change, an import, a fresh open): a late answer is then ignored
  let keepOriginal = false; // set when the sheet closes FOR position mode: the close event then leaves the preview and `original` alone
  let countRun = 0; // bumped whenever the library list is rebuilt or the sheet closes, so a late count is ignored
  // The poster selection the sheet would save (R-SEL-1): set by write(), changed by the lists, saved by Save, like pendingPin.
  // `offered` is what the server listed on the last connection test; a stored choice the server did not list stays shown and ticked.
  let sel = { libraries: [], genres: [], houses: [], ratings: [], source: null };
  // The profiles the dialog would save (R-PROF-1): set by write(), changed by the profile editor, saved by Save, like pendingPin.
  let pendingProfiles = [];
  // The profile open in the sheet (D120 1), or null: { id (null for a new one), name, household } where `household` holds the household's own
  // values, set aside while the controls show the profile's.
  let editing = null;
  let offered = { libraries: [], genres: [], collections: [], playlists: [], counts: {} };
  let genreRun = 0; // bumped whenever the genre list is asked for again, so a late genre answer is ignored
  // The production houses the sheet offers (Run 13): `list` is a server's studios of the ticked libraries, `found` the TMDB companies the last search named. Only a choice: what is ticked is `sel.houses`.
  let houseOffer = { list: [], found: [], loading: false, failed: false, searched: '', searching: false };
  const houseCountries = new Map(); // company id -> `origin_country`, filled by every search, so a ticked company keeps its country tag when a later search shows a same-named one (ux r2 N2)
  let houseRun = 0; // bumped whenever the studio list or a company search is asked for again, so a late answer is ignored
  let sourceRun = 0; // the same for the collection and playlist list: its own counter, so ticking a library never throws its answer away
  let offerClient = null; // the client of the last successful connection test
  // The other servers (up to two) and what the first one is: its own id once known, and whether it is the entry carried over from 2.4.0 (D157 1).
  // Set by write(), changed by Add and Remove, saved by Save, like pendingPin.
  let pending = { servers: [], id: '', carried: true };
  let removedNames = []; // the servers Remove took out in this sheet, as the sheet named them: { id, carried, name }, for the Save toast
  let promoted = null; // the server Remove moved into the first place, { type, url, token }: its own sign-in, not one carried to another address
  let held = {}; // the token, address, server name and user id set aside for the server type the sheet is not showing, so a change of mind loses nothing
  // The allowed devices the sheet would save (R-PLAY-1, D186): `{ id, name }` entries, set by write(), changed by the list, saved by Save, like pendingPin.
  // They are kept apart from what the list shows, so a Save never writes what is on screen: a read still loading or failed leaves them as they are (D186 5).
  let allowed = [];
  // What the Allowed devices list is showing: 'closed' (not opened since the sheet opened; nothing is read), 'loading', 'ok' (the players plex.tv lists, in
  // `listed`), 'failed' (plex.tv could not be read: the stored entries are shown as not checked) or 'none' (no Plex server is signed in).
  let players = { phase: 'closed', listed: [], error: '' };
  let playersRun = 0; // bumped when the list is opened and when the sheet closes, so a late answer from plex.tv is ignored

  /** The server type the sheet shows. */
  const formType = () => field('serverType').value || 'plex';
  const addressOf = () => cleanAddress(field('serverUrl').value);
  /** The sign-in flow of the type the sheet shows (the saved one may differ until Save). A type no adapter knows reads the Plex flow's words here. */
  const flow = () => {
    try {
      return signInFlow({ serverType: formType(), serverUrl: addressOf(), serverUserId: field('serverUserId').value }, { version });
    } catch {
      return signInFlow({ serverType: 'plex' });
    }
  };

  // Frame options are built from the registry so new frames only need adding there.
  $('frame-select').replaceChildren(
    ...[...FRAMES, NO_FRAME, { id: CUSTOM_FRAME_ID, name: 'Custom image…' }].map((f) => new Option(f.name, f.id)),
  );

  function write(s) {
    for (const el of form.elements) {
      if (!el.name || !(el.name in s)) continue;
      if (el.type === 'checkbox') el.checked = Boolean(s[el.name]);
      else el.value = String(s[el.name]);
    }
    held = {};
    pending = { servers: (s.servers || []).map((e) => ({ ...e })), id: s.serverId || '', carried: s.serverCarried !== false };
    promoted = null;
    removedNames = [];
    dropTest();
    syncServerType();
    // The household toggle is UI-only: on when a limit is set; off stores ''. The select keeps PG-13 while off.
    $('household-toggle').checked = Boolean(s.maxContentRating);
    field('maxContentRating').value = s.maxContentRating || 'PG-13';
    resetEditingUI(); // an import (or a fresh open) ends an open profile: the controls are about to be set from `s`
    pendingProfiles = s.profiles.map((p) => ({ ...p }));
    $('profile-error').hidden = true;
    $('profile-name').value = '';
    $('profile-notice').textContent = ''; // "<name> kept" belongs to the last open of the sheet: a Save or Cancel ended it
    renderProfiles();
    renderSlots(s.limitSlots); // before the ratings, which are offered up to the loosest of the limit and the slots
    sel = selectionOf(s);
    offered = { libraries: [], genres: [], collections: [], playlists: [], counts: {} };
    resetHouses();
    genreRun++;
    sourceRun++;
    offerClient = null; // the client of an earlier connection test is not this sheet's: genres and sources come from the server the test finds now
    renderSelection();
    pendingPin = { key: s.staticRatingKey || '', title: s.staticTitle || '' };
    $('pinned-title').textContent = s.staticRatingKey ? s.staticTitle || `item ${s.staticRatingKey}` : 'none';
    $('unpin-btn').hidden = !s.staticRatingKey;
    pendingAuth = { hash: s.settingsPinHash || '', salt: s.settingsPinSalt || '' };
    allowed = (s.allowedPlayers || []).map((p) => ({ ...p })); // an import leaves the display's own list (a file never carries one), so this is the list as it was
    renderPlayers(); // an open list keeps showing the list as it is; `renderConnection` below ends in `renderServers`, which shuts it only if this fill changed a server (D190)
    connectionOpen = !isConfigured(s);
    syncPin();
    syncRotate();
    syncDependent();
    renderConnection();
  }

  /** The sheet's settings as it would save them. While a profile is open that is the household's own values, set aside (D120 1). */
  function read() {
    if (!editing) return readControls();
    // While a profile is open the bundled keys are the set-aside household values (nothing a profile holds is previewed, D120 1); every
    // other key comes from the controls, so the household's live controls keep previewing (D122 4).
    const household = Object.fromEntries([...BUNDLE_KEYS, 'libraryKey', 'libraryName'].map((k) => [k, editing.household[k]]));
    return { ...readControls(), ...household, profiles: pendingProfiles };
  }

  /** What the controls show now: the household's values, or, while a profile is open, that profile's (its limit may be "No limit"). */
  function readControls() {
    const s = { ...getSettings() };
    for (const el of form.elements) {
      if (!el.name || !(el.name in s)) continue;
      s[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    s.maxContentRating = editing || $('household-toggle').checked ? field('maxContentRating').value : '';
    s.limitSlots = readSlots(); // kept whatever the toggle says: with it off they are saved but not applied
    s.profiles = pendingProfiles;
    s.libraryKeys = sel.libraries.map((l) => l.key);
    s.libraryNames = sel.libraries.map((l) => l.name);
    s.libraryKey = s.libraryKeys[0] || '';
    s.libraryName = sel.libraries[0]?.name || '';
    s.houses = sel.houses; // like the genres: kept while a collection or playlist is the source, and a profile keeps the household's
    s.genres = sel.genres; // kept while a collection or playlist is the source: the engine ignores them there, and the libraries again restore them (D112 item 3)
    s.ratings = sel.ratings; // a tick above the offered range is kept: the engine's intersection with the limit in force decides what is shown (D110 item 6)
    s.source = sel.source;
    s.servers = pending.servers.map((e) => ({ ...e }));
    s.serverId = pending.id;
    s.serverCarried = pending.carried;
    s.staticRatingKey = pendingPin.key;
    s.staticTitle = pendingPin.title;
    s.settingsPinHash = pendingAuth.hash;
    s.settingsPinSalt = pendingAuth.salt;
    s.allowedPlayers = allowed.map((p) => ({ ...p }));
    return sanitize(s);
  }

  // ---- the time slots ----

  function slotRow(slot) {
    const li = document.createElement('li');
    li.className = 'slot-row';
    const labelled = (text, control) => {
      const label = document.createElement('label');
      label.append(text, control);
      return label;
    };
    const start = document.createElement('input');
    start.type = 'time';
    start.className = 'slot-start';
    start.value = slot.start;
    const limit = document.createElement('select');
    limit.className = 'slot-limit';
    fillSlotChoices(limit, slot.profile === undefined ? slot.limit : `${PROFILE_PREFIX}${slot.profile}`);
    const days = document.createElement('select');
    days.className = 'slot-days';
    days.append(new Option('Every day', 'all'), new Option('Weekdays', 'weekdays'), new Option('Weekends', 'weekends'));
    const choice = daysChoice(slot.days);
    if (choice === 'custom') {
      days.append(new Option('Selected days', 'custom'));
      li.dataset.days = JSON.stringify(slot.days);
    }
    days.value = choice;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn small slot-remove';
    remove.textContent = 'Remove';
    const name = () => (parseHHMM(start.value) === null ? 'Remove this slot' : `Remove the ${start.value} slot`);
    remove.setAttribute('aria-label', name());
    start.addEventListener('input', () => {
      remove.setAttribute('aria-label', name());
      clearSlotError(li);
      clearSlotRefusal();
    });
    const error = document.createElement('p');
    error.className = 'slot-error error';
    error.id = `slot-error-${++slotRowCount}`;
    error.hidden = true;
    error.setAttribute('role', 'alert');
    start.setAttribute('aria-describedby', error.id);
    remove.addEventListener('click', () => {
      li.remove();
      clearSlotRefusal();
      syncSlots();
      $('slot-add').focus();
    });
    li.append(labelled('From', start), labelled('Show up to', limit), labelled('Days', days), remove, error);
    return li;
  }

  let slotRowCount = 0;

  const PROFILE_PREFIX = 'profile:';

  /**
   * The choices of a slot: the same labels as the main limit select ("PG-13 (TV-14)"), "No limit", then the profiles (R-PROF-1). A slot that
   * names a profile no longer in the list keeps that choice, marked missing, so it is not lost silently (it fails closed in force).
   */
  function fillSlotChoices(select, value) {
    select.replaceChildren(...[...field('maxContentRating').options].filter((o) => o.value !== NO_LIMIT).map((o) => new Option(o.textContent.trim(), o.value)), new Option('No limit', NO_LIMIT));
    const missing = value.startsWith(PROFILE_PREFIX) && !pendingProfiles.some((p) => PROFILE_PREFIX + p.id === value);
    if (pendingProfiles.length > 0 || missing) {
      const group = document.createElement('optgroup');
      group.label = 'Use a profile instead';
      group.append(...pendingProfiles.map((p) => new Option(`Profile: ${p.name}`, PROFILE_PREFIX + p.id)));
      if (missing) group.append(new Option('Profile: missing', value));
      select.append(group);
    }
    select.value = value;
  }

  /** Rebuilds every slot's choices after the profiles changed, keeping each slot's choice. */
  function refreshSlotChoices() {
    for (const select of $('slot-list').querySelectorAll('.slot-limit')) fillSlotChoices(select, select.value);
    renderRatings();
  }

  // ---- the profiles (R-PROF-1, D117, D120): rows of name, summary and two buttons, held in pendingProfiles until Save ----

  const frameNames = new Map([...FRAMES, NO_FRAME, { id: CUSTOM_FRAME_ID, name: 'Custom image' }].map((f) => [f.id, f.name]));

  function showProfileError(message) {
    $('profile-error').textContent = message;
    $('profile-error').hidden = !message;
  }

  function profileRow(profile) {
    const li = document.createElement('li');
    li.className = 'profile-row';
    li.dataset.id = profile.id;
    const label = document.createElement('label');
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'profile-rename';
    name.maxLength = 24;
    name.autocomplete = 'off';
    name.value = profile.name;
    name.setAttribute('aria-describedby', 'profile-error profile-help');
    label.append('Profile name', name);
    const summary = document.createElement('p');
    summary.className = 'profile-summary muted small';
    summary.textContent = describeProfile(profile, (id) => frameNames.get(id) || id);
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn small profile-edit';
    edit.textContent = 'Edit';
    edit.setAttribute('aria-label', `Edit ${profile.name}`);
    edit.setAttribute('aria-describedby', 'profile-help');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn small profile-remove';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete ${profile.name}`);
    const actions = document.createElement('div');
    actions.className = 'profile-actions';
    actions.append(edit, remove);
    // A rename is committed in place: the rows are not rebuilt, so focus stays where the person put it and a click on another row's
    // button that began this change is not lost (D120 7). Enter commits and keeps focus in the renamed box; it never saves the sheet.
    const commit = () => {
      const current = pendingProfiles.find((p) => p.id === profile.id);
      if (!current || name.value.trim() === current.name) return;
      const done = renameProfile(pendingProfiles, profile.id, name.value);
      if (done.error) {
        showProfileError(done.error);
        name.value = current.name;
        return;
      }
      showProfileError('');
      pendingProfiles = done.profiles;
      name.value = done.profiles.find((p) => p.id === profile.id).name;
      edit.setAttribute('aria-label', `Edit ${name.value}`);
      remove.setAttribute('aria-label', `Delete ${name.value}`);
      refreshSlotChoices();
    };
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
    });
    name.addEventListener('change', commit);
    edit.addEventListener('click', () => {
      commit();
      const now = pendingProfiles.find((p) => p.id === profile.id) ?? profile; // the profile as it is now, after a rename in this row
      startEditing({ id: now.id, name: now.name, bundle: now });
    });
    remove.addEventListener('click', () => {
      const done = removeProfile(pendingProfiles, profile.id, readSlots());
      if (done.error) return showProfileError(done.error);
      showProfileError('');
      pendingProfiles = done.profiles;
      renderProfiles();
      refreshSlotChoices();
      $('profile-name').focus();
    });
    li.append(label, summary, actions);
    return li;
  }

  /** Redraws the list and the add control. */
  function renderProfiles() {
    $('profile-list').replaceChildren(...pendingProfiles.map(profileRow));
    $('profile-empty').hidden = pendingProfiles.length > 0;
    const full = pendingProfiles.length >= MAX_PROFILES;
    $('profile-add').disabled = full;
    $('profile-add').title = full ? `${MAX_PROFILES} profiles is the most` : '';
  }

  // ---- editing one profile apart from the household's own values (D120 1) ----

  /** Puts a bundle's values into the bundled controls: the limit, the now-playing rule, the selection, the weighting and window, the frame. */
  function showBundle(b) {
    field('maxContentRating').value = b.maxContentRating;
    field('limitNowPlaying').checked = Boolean(b.limitNowPlaying);
    field('weighting').value = b.weighting;
    field('noRepeatDays').value = String(b.noRepeatDays);
    field('frameId').value = b.frameId;
    sel = { ...selectionOf(b), houses: sel.houses }; // a profile draws from the household's production houses (it has none of its own), so they pass through
    renderSelection();
    syncDependent();
  }

  /** Opens a profile in the sheet: a banner names it, the controls show its values, the household's own are set aside. */
  function startEditing({ id, name, bundle }) {
    if (editing) return;
    const household = readControls();
    editing = { id, name, household };
    const none = new Option('No limit', NO_LIMIT);
    field('maxContentRating').append(none); // a profile may have no limit, as a slot may
    $('profile-notice').textContent = ''; // the notice about the last profile kept does not belong to this one
    showBundle(bundleOf(bundle));
    loadGenres(); // the genre list follows the libraries now shown; a load in flight for the household's is dropped (D122 3)
    $('profile-banner-text').textContent = `Editing the profile \u201c${name}\u201d. The limit, the now-playing rule, the selection (except the production houses, which stay the household's), the weighting and days, and the frame below are this profile's. Your own household values are set aside until you press Done or Discard.`;
    $('profile-banner-error').hidden = true;
    $('profile-banner').hidden = false;
    $('profile-editor').inert = true;
    $('household-toggle').disabled = true;
    $('position-btn').disabled = true;
    $('settings-save').hidden = true;
    $('settings-cancel').hidden = true;
    $('profile-banner').scrollIntoView({ block: 'start' });
    $('profile-banner').focus();
  }

  /** Back to the household's own values, with the controls as the sheet has them. Does not set the controls itself when `restore` is false. */
  function resetEditingUI(restore = false) {
    const was = editing;
    editing = null;
    for (const o of [...field('maxContentRating').options]) if (o.value === NO_LIMIT) o.remove();
    $('profile-banner').hidden = true;
    $('profile-editor').inert = false;
    $('household-toggle').disabled = false;
    $('settings-save').hidden = false;
    $('settings-cancel').hidden = false;
    syncPositionButton();
    if (restore && was) {
      showBundle({ ...bundleOf(was.household), maxContentRating: was.household.maxContentRating || 'PG-13' });
      loadGenres();
      // No preview here (D134 ruling 5, D135 5): a profile's values are never previewed, so there is nothing to put back, and a
      // household control that does not preview live must not reach the display before Save.
    }
  }

  function finishEditing(commit) {
    if (!editing) return;
    const { id, name } = editing;
    let done = null;
    if (commit) {
      const bundle = bundleOf(readControls());
      if (!bundleHasSource(bundle)) {
        $('profile-banner-error').textContent = 'Choose at least one library, or a collection or playlist, for this profile.';
        $('profile-banner-error').hidden = false;
        return;
      }
      done = id === null ? addProfile(pendingProfiles, name, bundle) : updateProfile(pendingProfiles, id, bundle);
      if (done.error) {
        $('profile-banner-error').textContent = done.error;
        $('profile-banner-error').hidden = false;
        return;
      }
      pendingProfiles = done.profiles;
    }
    resetEditingUI(true);
    if (id === null && commit) $('profile-name').value = '';
    showProfileError('');
    $('profile-notice').textContent = commit ? `${name} kept; it applies when you press Save.` : '';
    renderProfiles();
    refreshSlotChoices();
    const target = id === null && commit ? $('profile-name') : id === null ? $('profile-name') : $('profile-list').querySelector(`[data-id="${CSS.escape(id)}"] .profile-edit`);
    target?.focus();
  }
  $('profile-done').addEventListener('click', () => finishEditing(true));
  $('profile-discard').addEventListener('click', () => finishEditing(false));

  function addNewProfile() {
    if (pendingProfiles.length >= MAX_PROFILES) return showProfileError(`${MAX_PROFILES} profiles is the most. Delete one to add another.`);
    const checked = checkName(pendingProfiles, $('profile-name').value);
    if (checked.error) return showProfileError(checked.error);
    showProfileError('');
    startEditing({ id: null, name: checked.name, bundle: bundleOf(readControls()) });
  }
  $('profile-add').addEventListener('click', addNewProfile);
  $('profile-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Enter here opens the new profile; it must not save the whole sheet
      addNewProfile();
    }
  });
  $('profile-name').addEventListener('input', () => showProfileError(''));

  function clearSlotError(li) {
    li.querySelector('.slot-error').hidden = true;
    li.querySelector('.slot-start').removeAttribute('aria-invalid');
  }

  /** Marks every row whose time is empty or unreadable, beside the row; true when there is one. Save is refused then (D103). */
  function markBadSlotTimes() {
    let first = null;
    for (const li of $('slot-list').children) {
      const start = li.querySelector('.slot-start');
      if (parseHHMM(start.value) !== null) continue;
      const error = li.querySelector('.slot-error');
      error.textContent = 'Set a start time for this slot, or remove it.';
      error.hidden = false;
      start.setAttribute('aria-invalid', 'true');
      first ??= start;
    }
    first?.focus();
    slotRefusal = Boolean(first);
    return slotRefusal;
  }

  /**
   * The line under the household options (visible with the toggle off too): the limit in force now and until when, for the SAVED
   * settings (unsaved edits count after Save), so it starts "Saved:".
   */
  function syncSlotStatus() {
    const text = describeLimitNow(getSettings(), new Date());
    const saved = getSettings();
    // A pinned poster is exempt from every limit (D5, D32), so a stricter slot or profile leaves it up: the line says why.
    const pinned = saved.staticRatingKey && saved.maxContentRating ? ' The pinned poster stays up whatever the limit; unpin it to apply the limit to it.' : '';
    const line = `Saved: ${text[0].toLowerCase()}${text.slice(1)}${pinned}`;
    if ($('slot-status').textContent !== line) $('slot-status').textContent = line; // a live region is written only when its words change, or a screen reader says it again every second (D106 3)
  }

  let slotRefusal = false; // the footer shows the missing-start-time message

  /** The footer message goes when no row is left with a bad time (the time was fixed, or the row removed). */
  function clearSlotRefusal() {
    if (!slotRefusal || $('slot-list').querySelector('[aria-invalid]')) return;
    $('form-error').textContent = '';
    slotRefusal = false;
  }

  function syncSlots() {
    const rows = $('slot-list').children.length;
    $('slot-empty').hidden = rows > 0;
    $('slot-add').disabled = rows >= MAX_SLOTS;
    $('slot-add').title = rows >= MAX_SLOTS ? `${MAX_SLOTS} time slots is the most` : '';
    renderRatings(); // a slot added or removed changes which ratings are offered
  }

  function renderSlots(slots) {
    // A stored or imported schedule with a time that could not be read became G all day: say so, until the slots are edited.
    $('slot-unreadable').hidden = !wasUnreadable(slots);
    $('slot-list').replaceChildren(...slots.map(slotRow));
    syncSlots();
  }

  /** The slots as the list shows them now. One unreadable time makes the whole schedule G all day (no row is dropped); Save refuses it first. */
  function readSlots() {
    return [...$('slot-list').children].map((li) => {
      const choice = li.querySelector('.slot-days').value;
      const days = choice === 'custom' ? JSON.parse(li.dataset.days) : DAY_SETS[choice];
      const chosen = li.querySelector('.slot-limit').value;
      const slot = { start: li.querySelector('.slot-start').value, ...(chosen.startsWith(PROFILE_PREFIX) ? { profile: chosen.slice(PROFILE_PREFIX.length) } : { limit: chosen }) };
      return days ? { ...slot, days: [...days] } : slot;
    });
  }

  // The slot in force changes at its boundary while the sheet is open, so the status line is re-read once a second, only while it is open
  // (a timer that runs with the sheet closed has nothing to do). Started where the sheet opens, cleared when it closes; never twice.
  let slotStatusTimer = null;
  function startSlotStatusTimer() {
    if (slotStatusTimer === null) slotStatusTimer = setInterval(() => dialog.open && syncSlotStatus(), 1000);
  }
  function stopSlotStatusTimer() {
    clearInterval(slotStatusTimer);
    slotStatusTimer = null;
  }

  $('slot-add').addEventListener('click', () => {
    const row = slotRow({ start: '08:00', limit: field('maxContentRating').value });
    $('slot-list').append(row);
    syncSlots();
    row.querySelector('.slot-start').focus();
  });

  function syncPin() {
    const set = Boolean(pendingAuth.hash);
    const changed = pendingAuth.hash !== (getSettings().settingsPinHash || '');
    $('pin-status').textContent = set ? (changed ? 'set (saved with Settings)' : 'set') : changed ? 'removed (saved with Settings)' : 'not set';
    $('pin-set-btn').textContent = set ? 'Change PIN…' : 'Set PIN…';
    $('pin-clear-btn').hidden = !set;
  }

  function setTokenShown(shown) {
    field('plexToken').type = shown ? 'text' : 'password';
    $('token-toggle').textContent = shown ? 'Hide' : 'Show';
    field('tmdbKey').type = shown ? 'text' : 'password';
    $('tmdb-key-toggle').textContent = shown ? 'Hide' : 'Show';
    $('tmdb-key-toggle').setAttribute('aria-label', shown ? 'Hide key' : 'Show key');
  }

  // ---- the rotation time: buttons in minutes over the stored seconds ----

  // `rotateSeconds` stays a (hidden) field holding the stored seconds, so everything that reads or writes the form by name
  // keeps working. The preset buttons (`rotatePreset`) and the Custom field (`rotateMinutes`) are UI only: they set it, and
  // write() sets them from it. A stored value that matches no preset opens as Custom; saving without touching it keeps it as is.
  function syncRotate() {
    const seconds = field('rotateSeconds').value;
    const preset = presetFor(seconds);
    for (const radio of form.querySelectorAll('input[name="rotatePreset"]')) radio.checked = radio.value === String(preset);
    $('rotate-custom').hidden = preset !== 'custom';
    if (preset === 'custom') field('rotateMinutes').value = formatMinutes(seconds);
  }

  function pickPreset(value) {
    if (value === 'custom') {
      $('rotate-custom').hidden = false;
      field('rotateMinutes').value = formatMinutes(field('rotateSeconds').value);
      return;
    }
    field('rotateSeconds').value = value;
    $('rotate-custom').hidden = true;
  }

  // ---- Recommended protection ----

  function currentFormValue(key) {
    const el = field(key);
    return el.type === 'checkbox' ? el.checked : el.value;
  }

  function closePreset() {
    $('preset-panel').hidden = true;
    $('preset-list').replaceChildren();
  }

  /** Lists every key the preset sets, each with a tick box (the locked row stays ticked), and what it is now. */
  function openPreset() {
    const items = PROTECTION_PRESET.map((row) => {
      const li = document.createElement('li');
      li.dataset.presetKey = row.key;
      if (row.locked) li.dataset.locked = '';
      const label = document.createElement('label');
      label.className = 'check';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = true;
      box.disabled = Boolean(row.locked);
      const now = currentFormValue(row.key);
      const hint = document.createElement('span');
      hint.className = 'muted small';
      hint.textContent = String(now) === String(row.value) ? 'already set' : `now ${showFormValue(field(row.key), now)}`;
      label.append(box, document.createTextNode(`${row.label}: ${showFormValue(field(row.key), row.value)}`), hint);
      li.append(label);
      return li;
    });
    $('preset-list').replaceChildren(...items);
    $('preset-panel').hidden = false;
  }

  /** Fills the form with the ticked rows; nothing is stored until Save. Goes through 'change' so the live preview follows. */
  function applyPreset() {
    for (const li of $('preset-list').children) {
      const row = PROTECTION_PRESET.find((r) => r.key === li.dataset.presetKey);
      if (!row || !li.querySelector('input').checked) continue;
      const el = field(row.key);
      if (el.type === 'checkbox') el.checked = row.value;
      else el.value = String(row.value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    closePreset();
  }

  // ---- the "Connected to" card ----

  function renderConnected() {
    const server = form.dataset.serverName || getSettings().serverName || `your ${flow().label} server`;
    const library = sel.source
      ? sel.source.title || sel.source.kind // a collection or playlist replaces the libraries: it is what is shown
      : sel.libraries.map((l) => l.name).filter(Boolean).join(', ') || (sel.libraries.length && getSettings().libraryName) || '';
    const list = sheetServers();
    if (list.length > 1) {
      // Several servers: every server is named, and a library is named with its server.
      const libs = sel.source ? [sel.source.title || sel.source.kind] : sel.libraries.map((l) => `${l.name || 'a library'} (${nameOf(list[Math.max(0, list.findIndex((e) => belongsTo(l.key, e)))], Math.max(0, list.findIndex((e) => belongsTo(l.key, e))))})`);
      $('connected-text').textContent = `Connected to ${list.map(nameOf).join(', ')}${libs.length ? ` · ${libs.join(', ')}` : ''}`;
    } else {
      $('connected-text').textContent = `Connected to ${server}${library ? ` · ${library}` : ''}`;
    }
    renderServers();
  }

  function renderConnection() {
    const tmdb = isTmdb(); // TMDB has no card, no sign-in and no address: its key field is the whole connection
    $('connected-card').hidden = connectionOpen || tmdb;
    $('signin-controls').hidden = !connectionOpen || tmdb; // the manual token and URL fold stays where it is: it is how a token is shown or exported
    $('manual-connection').hidden = tmdb; // no "Add a server" either: it shows only with an address (renderServers), and TMDB has none (D210 5)
    $('tmdb-credit').hidden = !(tmdb || field('tmdbKey').value.trim());
    renderConnected();
  }

  /** Shows the sign-in controls in place of the card. */
  function openConnection() {
    connectionOpen = true;
    if (formType() === 'emby') $('jf-password').open = true;
    renderConnection();
  }

  function syncDependent() {
    $('custom-frame-row').hidden = field('frameId').value !== CUSTOM_FRAME_ID;
    // Showing or hiding the Household options keeps the toggle where it was on screen, so the schedule and the profiles come into view
    // below it instead of the sheet's scroll position moving the toggle away.
    const toggleTop = $('household-toggle').getBoundingClientRect().top;
    $('household-options').hidden = !$('household-toggle').checked;
    const moved = $('household-toggle').getBoundingClientRect().top - toggleTop;
    if (moved) dialog.querySelector('.sheet-body').scrollTop += moved;
    field('username').disabled = !field('showNowPlaying').checked;
    field('includeEpisodes').disabled = !field('showNowPlaying').checked;
    for (const out of form.querySelectorAll('output[data-for]')) {
      const v = Number(field(out.dataset.for).value);
      // Sizes and brightness are plain percentages; the offsets are signed.
      out.textContent = out.dataset.for === 'posterScale' || out.dataset.for === 'frameBrightness' ? `${v}%` : `${v > 0 ? '+' : ''}${v}%`;
    }
  }

  // ---- the poster selection (R-SEL-1, D107) ----

  /** A ticked row: a checkbox and its text. The text is a span of its own so a count can be written into it later. */
  function pickRow(value, text, checked, { disabled = false, data = {} } = {}) {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = value;
    box.checked = checked;
    box.disabled = disabled;
    Object.assign(box.dataset, data);
    const span = document.createElement('span');
    span.textContent = text;
    label.append(box, span);
    li.append(label);
    return li;
  }

  /** The ratings the sheet offers (D109 item 1): up to the loosest limit of the base and every time slot, all five while the toggle is off. */
  function shownRatings() {
    const limits = readSlots().map((slot) => (slot.profile === undefined ? slot : { limit: pendingProfiles.find((p) => p.id === slot.profile)?.maxContentRating ?? NO_LIMIT }));
    return offeredRatings(editing || $('household-toggle').checked ? field('maxContentRating').value : '', limits);
  }

  function renderLibraries() {
    const chosen = new Map(sel.libraries.map((l) => [l.key, l.name]));
    const list = sheetServers();
    const many = list.length > 1;
    // The server a library is on: by its key (a bare key is the carried first server's), shown by that server's name.
    const slotOf = (key) => Math.max(0, list.findIndex((e) => belongsTo(key, e)));
    const rows = offered.libraries.map((l) => ({ key: l.key, title: l.title }));
    for (const [key, name] of chosen) if (!rows.some((r) => r.key === key)) rows.push({ key, title: name || `Library ${key}` }); // a stored choice the server did not list
    const locked = Boolean(sel.source);
    if (!rows.length) {
      $('library-list').replaceChildren(Object.assign(document.createElement('li'), { className: 'muted small', textContent: 'Test the connection to load your libraries.' }));
      return;
    }
    const row = (r) => {
      const count = offered.counts[r.key];
      return pickRow(r.key, count === undefined ? r.title : `${r.title} · ${countLabel(count)}`, chosen.has(r.key), { disabled: locked, data: { title: r.title } });
    };
    if (!many) return void $('library-list').replaceChildren(...rows.map(row));
    // Several servers: each server's libraries sit under that server's name.
    $('library-list').replaceChildren(
      ...list.flatMap((entry, slot) => {
        const mine = rows.filter((r) => slotOf(r.key) === slot);
        if (!mine.length) return [];
        return [Object.assign(document.createElement('li'), { className: 'server-heading', textContent: nameOf(entry, slot) }), ...mine.map(row)];
      }),
    );
  }

  function renderGenres() {
    const chosen = new Set(sel.genres.map((g) => g.title.toLowerCase()));
    const rows = [...offered.genres];
    for (const g of sel.genres) if (!rows.some((r) => r.title.toLowerCase() === g.title.toLowerCase())) rows.push(g);
    rows.sort((a, b) => a.title.localeCompare(b.title));
    const locked = Boolean(sel.source);
    $('genre-list').replaceChildren(...rows.map((g) => pickRow(genreRequestValue(g), g.title, chosen.has(g.title.toLowerCase()), { disabled: locked, data: { key: g.key, title: g.title } })));
    syncGenreText(rows.length);
  }

  /** The count and the help under the genre box. Ticking a genre updates only these: the rows stay, so focus and scroll stay (walk r1). */
  function syncGenreText(rowCount = $('genre-list').children.length) {
    const locked = Boolean(sel.source);
    $('genre-count').textContent = !locked && sel.genres.length ? `· ${sel.genres.length} chosen` : '';
    $('genre-help').textContent = locked
      ? 'A collection or playlist takes no genre.'
      : offered.genresLoading
        ? 'Loading the genres…'
        : offered.genresFailed
        ? "Couldn't load the genres. Test the connection to try again."
        : rowCount
          ? `None ticked: every genre. A title shows only when it ${genresAreAll(sel) ? 'has every ticked genre' : 'matches a ticked genre'} and, when ratings are ticked, a ticked rating.`
          : offerClient
            ? sel.libraries.length
              ? 'The ticked libraries list no genres.'
              : 'Tick a library to see its genres.'
            : 'Test the connection to load the genres.';
  }

  function renderRatings() {
    const shown = shownRatings();
    // A kept tick above the offered range stays visible and ticked, marked, so a parent can see it and untick it (D111 item 1).
    const kept = LIMITS.filter((r) => sel.ratings.includes(r) && !shown.includes(r));
    $('rating-list').replaceChildren(...LIMITS.filter((r) => shown.includes(r) || kept.includes(r)).map((r) => pickRow(r, kept.includes(r) ? `${r} — above the limit now` : r, sel.ratings.includes(r))));
  }

  function renderSource() {
    const select = $('source-select');
    const value = sel.source ? `${sel.source.kind}:${sel.source.key}` : '';
    const many = offered.libraries.length > 1;
    const option = (kind, item, suffix = '') => {
      const o = new Option(`${item.title}${suffix}`, `${kind}:${item.key}`);
      o.dataset.title = item.title;
      return o;
    };
    const collections = Object.assign(document.createElement('optgroup'), { label: 'Collections' });
    collections.append(...offered.collections.map((c) => option('collection', c, `${c.smart ? ' (smart)' : ''}${many && c.library ? ` · ${c.library}` : ''}`)));
    const playlists = Object.assign(document.createElement('optgroup'), { label: 'Playlists' });
    playlists.append(...offered.playlists.map((p) => option('playlist', p)));
    select.replaceChildren(new Option('The libraries above', ''), ...(collections.children.length ? [collections] : []), ...(playlists.children.length ? [playlists] : []));
    if (value && ![...select.options].some((o) => o.value === value)) {
      const o = new Option(sel.source.title || `${sel.source.kind} ${sel.source.key}`, value);
      o.dataset.title = sel.source.title;
      select.append(o);
    }
    select.value = value;
  }

  // ---- TMDB (R-TMDB-1): the pool is one choice from a list, and Discover adds its own years and genre mode; the choice is the library key (js/sources/tmdb.js) ----

  const isTmdb = () => formType() === 'tmdb';

  /**
   * Shows the TMDB choice in place of the libraries and collections when TMDB is the type, and puts the sheet's `sel` in it. With `controls` the choice
   * is written into the controls (the sheet opened, a type was chosen, a file was imported); without, they stay as typed (the years while somebody types).
   * A stored library key that is no TMDB choice (a media server's) becomes the default list, with no genre: its ids mean nothing to TMDB.
   */
  function renderTmdbSource({ controls = true } = {}) {
    const tmdb = isTmdb();
    $('tmdb-source-group').hidden = !tmdb;
    $('library-group').hidden = tmdb;
    $('source-row').hidden = tmdb;
    $('source-help').hidden = tmdb;
    if (!tmdb) return;
    let src = sourceOf(sel.libraries[0]?.key);
    if (!src) {
      sel.libraries = [{ key: DEFAULT_LIBRARY, name: 'Popular' }];
      sel.genres = [];
      sel.source = null;
      src = sourceOf(DEFAULT_LIBRARY);
    }
    $('tmdb-discover').hidden = src.kind !== 'discover';
    if (!controls) return;
    $('tmdb-list').value = src.path;
    $('tmdb-mode').value = src.kind === 'discover' ? src.mode : 'or';
    $('tmdb-from').value = src.kind === 'discover' ? src.from : '';
    $('tmdb-to').value = src.kind === 'discover' ? src.to : '';
    syncYearsNote();
  }

  /** The choice the TMDB controls show, as the library the sheet would save. */
  function readTmdbChoice() {
    const base = $('tmdb-list').value;
    const discover = base.startsWith('discover/');
    const key = discover ? discoverKey({ type: base.endsWith('/tv') ? 'tv' : 'movie', mode: $('tmdb-mode').value, from: $('tmdb-from').value, to: $('tmdb-to').value }) : base;
    sel.libraries = [{ key, name: $('tmdb-list').selectedOptions[0]?.textContent.trim() || '' }];
    $('tmdb-discover').hidden = !discover;
    syncYearsNote();
    syncGenreText(); // "any" or "every" ticked genre: the help says which
    syncHouseText(); // a house list on a list is only narrowed; on Discover it is not (D216)
  }

  /** A year that is not four digits from 1800 to 2200 is ignored by Discover (js/sources/tmdb.js); the field says so rather than showing it as if it counted. */
  function syncYearsNote() {
    const bad = [['From', 'tmdb-from'], ['To', 'tmdb-to']]
      .map(([label, id]) => [label, $(id), $(id).value.trim()])
      .filter(([, , value]) => value !== '' && !validYear(value));
    for (const id of ['tmdb-from', 'tmdb-to']) $(id).toggleAttribute('aria-invalid', bad.some(([, el]) => el.id === id));
    $('tmdb-years-note').hidden = bad.length === 0;
    $('tmdb-years-note').textContent = bad.map(([label, , value]) => `${label} year "${value.slice(0, 12)}" is not a year from 1800 to 2200, so it is ignored.`).join(' ');
  }

  function renderSelection() {
    renderTmdbSource();
    renderLibraries();
    renderSource();
    renderGenres();
    renderHouses();
    renderRatings();
    renderConnected();
  }

  /** The libraries ticked now, in the list's order, as { key, name }. */
  function readLibraries() {
    return [...$('library-list').querySelectorAll('input:checked')].map((box) => ({ key: box.value, name: box.dataset.title || '' }));
  }

  /** Genres are asked for from every ticked library and merged by title. A failed request leaves that library's genres out. Choosing a source does not ask again: the box stays as it was, greyed. */
  async function loadGenres() {
    loadHouses();
    const run = ++genreRun;
    offered.genres = [];
    offered.genresFailed = false;
    offered.genresLoading = false;
    if (!offerClient || !sel.libraries.length) return renderGenres();
    // The list shown until now belongs to other libraries (the household's, while a profile opens): it goes now, not when the answer comes.
    offered.genresLoading = true;
    renderGenres();
    const client = offerClient;
    const lists = await Promise.all(sel.libraries.map((l) => client.genres(l.key).catch(() => null)));
    if (run !== genreRun) return;
    offered.genresLoading = false;
    offered.genresFailed = lists.every((l) => l === null);
    const seen = new Map();
    for (const g of lists.flat().filter(Boolean)) if (!seen.has(g.title.toLowerCase())) seen.set(g.title.toLowerCase(), g);
    offered.genres = [...seen.values()];
    renderGenres();
  }

  // ---- production houses (Run 13): a server's studios are listed, a TMDB company is searched by name ----

  function resetHouses() {
    houseRun++;
    houseCountries.clear();
    houseOffer = { list: [], found: [], loading: false, failed: false, searched: '', searching: false, searchingFor: '' };
  }

  /** The rows: what is ticked, then what was offered (the studios of the ticked libraries, or the companies the search found), once each. */
  function renderHouses() {
    const id = (h) => h.key || h.title.toLowerCase();
    const chosen = new Set(sel.houses.map(id));
    const rows = [...sel.houses];
    for (const h of isTmdb() ? houseOffer.found : houseOffer.list) if (!chosen.has(id(h)) && !rows.some((r) => id(r) === id(h))) rows.push(h);
    // A server's studios are alphabetical; a TMDB search keeps TMDB's own order (best match first), the ticked ones staying on top (ux F6).
    if (!isTmdb()) rows.sort((a, b) => a.title.localeCompare(b.title));
    // Two companies of one name are told apart by the country TMDB gives them (ux F6); a company with no known country keeps its plain name.
    const countries = houseCountries;
    const names = rows.map((h) => h.title.toLowerCase());
    const label = (h) => (countries.has(h.key) && names.indexOf(h.title.toLowerCase()) !== names.lastIndexOf(h.title.toLowerCase()) ? `${h.title} (${countries.get(h.key)})` : h.title);
    const locked = Boolean(sel.source) || Boolean(editing);
    $('house-search-row').hidden = !isTmdb();
    $('house-search').disabled = locked;
    $('house-search-btn').disabled = locked; // never disabled by a search under way: that would drop the keyboard focus the button holds (ux F5)
    $('house-list').replaceChildren(...rows.map((h) => pickRow(houseRequestValue(h), label(h), chosen.has(id(h)), { disabled: locked, data: { key: h.key, title: h.title } })));
    syncHouseText(rows.length);
  }

  /** The count and the help under the production house box. Ticking a house updates only these, so focus and scroll stay. */
  function syncHouseText(rowCount = $('house-list').children.length) {
    const locked = Boolean(sel.source) || Boolean(editing);
    $('house-count').textContent = !locked && sel.houses.length ? `· ${sel.houses.length} chosen` : '';
    const tmdb = isTmdb();
    const base = tmdb
      ? 'A TMDB company: search by name, then tick it. A title shows only when TMDB lists one of the ticked companies for it.'
      : "A server lists the main studio of each title, usually one, not every production company. A title shows only when its studio is a ticked one.";
    // The static help is not a live region, so a library tick or a re-render never has it re-read; only the short transient status below is announced (ux r2 N1).
    const list = housesNarrowAList(sel, formType()); // D216: a house list on a TMDB list only narrows it
    const listNote = list ? ' This list is only narrowed to those houses; Discover finds every title from them.' : '';
    const help = editing
      ? "Production houses are the household's in 2.5, not the profile's. To change them, close the profile first."
      : sel.source
        ? 'A collection or playlist takes no production house.'
        : !tmdb && !rowCount && !houseOffer.loading && !houseOffer.failed
          ? offerClient
            ? sel.libraries.length
              ? 'The ticked libraries list no studios.'
              : 'Tick a library to see its studios.'
            : 'Test the connection to load the studios.'
          : `None ticked: every house. ${base}${listNote}`;
    const status = locked
      ? ''
      : houseOffer.searching
        ? 'Searching…'
        : houseOffer.failed
          ? tmdb
            ? "Couldn't search TMDB. Test the connection and try again."
            : "Couldn't load the studios. Test the connection to try again."
          : houseOffer.loading
            ? 'Loading the studios…'
            : tmdb && houseOffer.searched && !houseOffer.found.length
              ? `No company found for "${houseOffer.searched.slice(0, 40)}".`
              : tmdb && houseOffer.searched
                ? `${houseOffer.found.length} ${houseOffer.found.length === 1 ? 'company' : 'companies'} found.`
                : '';
    if ($('house-help').textContent !== help) $('house-help').textContent = help;
    if ($('house-status').textContent !== status) $('house-status').textContent = status; // set only on a change, so ticking a row announces nothing
  }

  /** A server's studios of every ticked library, merged by name. A failed request leaves that library's studios out. TMDB has no list: it is searched. */
  async function loadHouses() {
    const run = ++houseRun;
    houseOffer = { list: [], found: houseOffer.found, loading: false, failed: false, searched: houseOffer.searched, searching: false, searchingFor: '' };
    if (isTmdb() || !offerClient || !sel.libraries.length) return renderHouses();
    houseOffer.loading = true;
    renderHouses();
    const client = offerClient;
    const lists = await Promise.all(sel.libraries.map((l) => client.houses(l.key).catch(() => null)));
    if (run !== houseRun) return;
    houseOffer.loading = false;
    houseOffer.failed = lists.every((l) => l === null);
    const seen = new Map();
    for (const h of lists.flat().filter(Boolean)) if (!seen.has(h.title.toLowerCase())) seen.set(h.title.toLowerCase(), h);
    houseOffer.list = [...seen.values()];
    renderHouses();
  }

  /** Searches TMDB for the companies whose name holds what was typed. */
  async function searchHouses() {
    const typed = $('house-search').value.trim();
    if (!typed || !offerClient) {
      houseOffer.failed = false;
      houseOffer.searched = '';
      houseOffer.found = [];
      renderHouses();
      if (typed && !offerClient) $('house-status').textContent = 'Test the connection to search TMDB.';
      return;
    }
    if (houseOffer.searching && houseOffer.searchingFor === typed) return; // the same search is under way: a second press waits for it, and the button stays enabled
    const run = ++houseRun;
    houseOffer.searching = true;
    houseOffer.searchingFor = typed;
    houseOffer.failed = false;
    renderHouses();
    try {
      const found = await offerClient.houses(sel.libraries[0]?.key || '', { query: typed });
      if (run !== houseRun) return;
      houseOffer.found = found;
      for (const h of found) if (h.country) houseCountries.set(h.key, h.country);
      houseOffer.searched = typed;
    } catch {
      if (run !== houseRun) return;
      houseOffer.failed = true;
    }
    houseOffer.searching = false;
    houseOffer.searchingFor = '';
    renderHouses();
  }

  /** The collections of every movie library and the video playlists, for the "Posters from" list. A failed request leaves its part out. */
  async function loadSources(client, libraries) {
    const run = sourceRun;
    const [collections, playlists] = await Promise.all([
      Promise.all(libraries.map((l) => client.collections(l.key).then((list) => list.map((c) => ({ library: l.title, ...c }))).catch(() => []))),
      client.playlists().catch(() => []),
    ]);
    if (run !== sourceRun) return;
    // A collection id is unique on a server: one that every library listed (Jellyfin's BoxSets belong to no library) is offered once.
    const seen = new Set();
    offered.collections = collections.flat().filter((c) => !seen.has(c.key) && seen.add(c.key));
    offered.playlists = playlists;
    renderSource();
  }

  /** "Movies · 1,240 titles": asked for after the list is on show and never waited for. A count that fails leaves the title alone. */
  function loadCounts(client, libs) {
    const run = countRun;
    for (const l of libs) {
      client.libraryCount(l.key).then((n) => {
        if (run !== countRun || n === null) return;
        offered.counts[l.key] = n;
        renderLibraries();
      });
    }
  }

  /** The server's movie libraries are on show: keep the ticked ones the server still has (any type), or tick the first movie library. */
  function offerLibraries(all, client, down = []) {
    const movies = all.filter((l) => l.type === 'movie');
    countRun++;
    offered = { libraries: movies, genres: [], collections: [], playlists: [], counts: {} };
    const known = new Map(all.filter((l) => l.type === 'movie' || l.type === 'show').map((l) => [l.key, l.title]));
    // A chosen library of a server that did not answer stays: it is not known to be gone, and only a removed server's keys leave (D157 9).
    const unheard = (key) => down.some((e) => belongsTo(key, e));
    sel.libraries = sel.libraries.filter((l) => known.has(l.key) || unheard(l.key)).map((l) => ({ key: l.key, name: known.get(l.key) ?? l.name }));
    if (!sel.libraries.length && !sel.source && movies.length) sel.libraries = [{ key: movies[0].key, name: movies[0].title }];
    for (const l of all) if (l.type === 'show' && sel.libraries.some((c) => c.key === l.key) && !offered.libraries.some((o) => o.key === l.key)) offered.libraries.push(l);
    renderSelection();
    offerClient = client;
    sourceRun++;
    loadGenres();
    loadSources(client, movies);
    return offered.libraries;
  }

  /** The verdict line under the Test button; a failure carries the buttons that fix it (the same ones the empty card shows). */
  function setResult(text, kind) {
    $('test-result').replaceChildren(
      document.createTextNode(text),
      ...fixesFor(kind).map((fix) => actionButton(fix.label, () => runFix(fix.id), { primary: false })),
    );
  }

  /**
   * The sign-in the sheet holds was made for the saved server. Test connection asks `oldTokenMayGo` (js/settings.js, the rule Save follows too)
   * whether it may go to the address and type in the sheet: at the same address, or at another one whose server, read without it, is found to be
   * the same one (D157 3). Otherwise it is set aside here, and the household signs in to that server. A change of type is always another server.
   */
  async function tokenMayGo(s) {
    const type = s.serverType || 'plex';
    // The sign-in the sheet holds was made for one server at one address: the saved first server, or, after Remove moved another server
    // into the first place, that server (its own token, checked at its own address, D162 3). Anywhere else it goes only after the server
    // there is read without it and found to be the same one (D157 3).
    const basis = promoted || (original && { type: original.serverType || 'plex', url: original.serverUrl, token: original.plexToken, id: original.serverId });
    if (!basis) return true;
    // A verdict that needs no read comes back at once: awaiting it anyway would put Test connection one turn later than it ran before the rule
    // was shared, and the redraw it makes would land after the scroll that Open settings in js/main.js makes as the sheet opens.
    const verdict = oldTokenMayGo({ basis, type, url: s.serverUrl, token: s.plexToken }, readId);
    if ((verdict instanceof Promise ? await verdict : verdict).go) return true;
    field('plexToken').value = '';
    field('serverUserId').value = '';
    // With several servers, or a first server that is not the carried one, the library ticked for the server whose sign-in was set aside and its
    // name no longer stand: the card and the list refresh, and the household chooses again from the new server (D163 1). One server keeps its choice.
    if (!pending.carried || sheetServers().length > 1) {
      const first = sheetServers()[0];
      sel.libraries = sel.libraries.filter((l) => !belongsTo(l.key, first));
      if (sel.source && memberBelongsTo(`${sel.source.kind}:${sel.source.key}`, first)) sel.source = null;
      form.dataset.serverName = '';
      offered = { libraries: [], genres: [], collections: [], playlists: [], counts: {} };
      offerClient = null;
      renderSelection();
    }
    connectionOpen = true;
    renderConnection();
    setResult(`✗ That is not the server your sign-in was made for, so the sign-in was not sent. Sign in to ${flow().label} at this address.`);
    return false;
  }

  /** Test connection for TMDB: `GET /3/authentication` with the key typed; nothing else is asked, and no address is involved. */
  async function testTmdb(s) {
    if (!s.tmdbKey) {
      setResult('Enter your TMDB key first.');
      return false;
    }
    setResult('Connecting…');
    const run = ++testRun;
    testing = true;
    $('test-btn').disabled = true;
    try {
      const client = createSource(s, { clientId, version });
      await client.identity();
      if (run !== testRun) return false;
      offerClient = client;
      setResult('✓ Connected to TMDB');
      log.info('Connection test OK: TMDB');
      loadGenres();
      return true;
    } catch (err) {
      if (run !== testRun) return false;
      setResult(`✗ ${err.message}`, err.kind);
      log.warn(`Connection test failed: ${err.message}`);
      return false;
    } finally {
      if (run === testRun) {
        testing = false;
        $('test-btn').disabled = false;
      }
    }
  }

  async function testConnection() {
    if (testing) return false;
    const s = read();
    if (s.serverType === 'tmdb') return testTmdb(s);
    if (!s.serverUrl || !s.plexToken) {
      setResult(formType() !== 'plex' ? 'Enter the server address and sign in first.' : 'Enter a token and server URL first (or sign in).');
      return false;
    }
    if (location.protocol === 'https:' && s.serverUrl.startsWith('http:')) {
      setResult(flow().words.httpsBlocked);
      return false;
    }
    if (!(await tokenMayGo(s))) return false;
    setResult('Connecting…');
    const run = ++testRun;
    testing = true;
    $('test-btn').disabled = true;
    try {
      const client = (needsSources(s) ? createSources : createSource)(s, { clientId, version });
      const id = await client.identity();
      const libs = await client.libraries();
      if (run !== testRun) return false; // the household moved on to another server type while this one answered: its answer is not theirs
      const usable = offerLibraries(libs, client, (libs.failed || []).map((f) => serverList(s)[f.slot]).filter(Boolean));
      if (!(typeof id.slot === 'number' && id.slot !== 0)) form.dataset.serverName = id.name; // when the first server did not answer, its name stays as it was
      const list = serverList(s);
      if (list.length > 1) {
        // Several servers: the verdict says, per server, which answered (with its libraries) and which did not.
        const down = new Set((libs.failed || []).map((f) => f.slot));
        const answered = list.map((e, slot) => [e, slot]).filter(([, slot]) => !down.has(slot));
        const unreached = [...down].map((slot) => nameOf(list[slot], slot));
        setResult(`✓ ${answered.map(([e, slot]) => `${nameOf(e, slot)} — ${libs.filter((l) => belongsTo(l.key, e)).length} libraries`).join('; ')}${unreached.length ? `. Couldn't reach ${unreached.join(' or ')}: the others still show posters.` : ''}`);
      } else {
        setResult(`✓ ${id.name || 'Server'}${id.version ? ` (v${id.version.split('-')[0]})` : ''} — ${libs.length} libraries`);
      }
      renderConnected();
      log.info(`Connection test OK: ${id.name}`);
      loadCounts(client, usable); // after the verdict: never part of it
      return true;
    } catch (err) {
      if (run !== testRun) return false;
      setResult(`✗ ${err.message}`, err.kind);
      log.warn(`Connection test failed: ${err.message}`);
      return false;
    } finally {
      if (run === testRun) {
        testing = false;
        $('test-btn').disabled = false;
      }
    }
  }

  // ---- the household's servers (R-SRC-4, D156): the first one is the form above, the others are held here until Save ----

  const typeLabel = (type) => {
    try {
      return signInFlow({ serverType: type }).label;
    } catch {
      return type;
    }
  };

  /** Who answers at an address, read without a token (js/sources/index.js). */
  const readId = (type, url) => readServerId(type, url, { clientId, version });

  /** A server as the sheet names it: its name (the first server's is the one the connection test read), else its type's label. */
  const nameOf = (entry, slot) => (slot === 0 ? form.dataset.serverName || entry.name : entry.name) || `${typeLabel(entry.type)}`;

  /** The servers the sheet would save, the first one first. */
  const sheetServers = () => serverList(read());

  let serversShown = '';
  let serversPlaced = []; // the server (its type and address) at each place of the list as last drawn
  function renderServers() {
    syncPlayersToServers(); // every route that changes the servers (add, remove, sign in, type, import) ends here
    const list = sheetServers();
    const first = list[0];
    $('server-list').hidden = list.length < 2;
    // TMDB cannot be one of several servers (D210 5): while other servers are in the list the choice is not offered.
    const crowded = list.length > 1;
    form.querySelector('input[name="serverTypeTmdb"]').disabled = crowded;
    $('tmdb-pick-help').textContent = crowded ? 'TMDB cannot be one of several servers. Remove the other servers to use it.' : 'No media server? Show posters from TMDB instead.';
    // The heading names the type's own words for one server; for several it names none of them (a Jellyfin or Emby server is no "Plex connection").
    const legend = document.querySelector('legend[data-srv="legend"]');
    if (legend && list.length > 1) legend.textContent = 'Media server connections'; // one server is the "Connected to" card above: the list shows from two
    // Rebuilt only when what it shows changes: a rebuild above a reader's scroll position would cost the browser its scroll anchor.
    const shown = JSON.stringify([list.map((e) => [e.name, e.type, e.url]), form.dataset.serverName || '']);
    if (shown === serversShown) return;
    serversShown = shown;
    // A rebuild takes focus with the button that had it (the connection test names the first server a moment after the sheet opens, D168 2): the
    // Remove button of the same place gets it back. Nothing else is moved: focus elsewhere in the sheet is not the list's to take.
    const held = document.activeElement?.closest?.('#server-list') ? document.activeElement.dataset?.slot : undefined;
    const placed = list.map((e) => `${e.type} ${e.url}`);
    const sameServer = held !== undefined && placed[held] !== undefined && placed[held] === serversPlaced[held]; // a Remove moves the next server into the place: its button is not the one that had focus
    serversPlaced = placed;
    $('server-list').replaceChildren(
      ...list.map((entry, slot) => {
        const li = document.createElement('li');
        li.className = 'server-row';
        const name = Object.assign(document.createElement('span'), { className: 'server-name', textContent: nameOf(entry, slot) });
        const where = Object.assign(document.createElement('span'), { className: 'server-where muted small', textContent: entry.url ? `${typeLabel(entry.type)} · ${entry.url}` : typeLabel(entry.type) });
        li.append(name, where);
        if (list.length > 1) {
          const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'btn small', textContent: 'Remove' });
          remove.dataset.slot = String(slot);
          remove.setAttribute('aria-label', `Remove ${name.textContent}`);
          li.append(remove);
        }
        return li;
      }),
    );
    if (sameServer) $('server-list').querySelector(`button[data-slot="${held}"]`)?.focus({ preventScroll: true });
    const full = list.length >= MAX_SERVERS;
    $('server-add').hidden = full || !first.url;
    $('servers-help').hidden = list.length < 2;
    $('servers-help').textContent = full ? 'Three servers is the most. Remove one to add another. One household limit applies to every poster, whichever server it came from.' : 'One household limit applies to every poster, whichever server it came from.';
  }

  /** Takes a server out of the sheet's list. Its libraries, a collection or playlist of its and a pin of its go with it; Save clears its cached posters and history. */
  function removeServer(slot) {
    const list = sheetServers();
    const entry = list[slot];
    if (!entry || list.length < 2) return;
    removedNames.push({ id: entry.id, carried: entry.carried, name: nameOf(entry, slot) });
    sel.libraries = sel.libraries.filter((l) => !belongsTo(l.key, entry));
    if (sel.source && memberBelongsTo(`${sel.source.kind}:${sel.source.key}`, entry)) sel.source = null;
    if (pendingPin.key && belongsTo(pendingPin.key, entry)) {
      pendingPin = { key: '', title: '' };
      $('pinned-title').textContent = 'none (unpinned on save)';
      $('unpin-btn').hidden = true;
    }
    if (slot === 0) {
      // The next server takes the first place: the form above now shows it.
      const next = pending.servers.shift();
      field('serverType').value = next.type;
      field('plexToken').value = next.token;
      field('serverUrl').value = next.url;
      field('serverUserId').value = next.userId;
      form.dataset.serverName = next.name;
      promoted = { type: next.type, url: next.url, token: next.token, id: next.id };
      held = {};
      pending.id = next.id;
      pending.carried = false;
    } else {
      pending.servers.splice(slot - 1, 1);
    }
    syncServerType();
    offered = { libraries: [], genres: [], collections: [], playlists: [], counts: {} };
    offerClient = null;
    countRun++;
    genreRun++;
    sourceRun++;
    renderSelection();
    renderServers();
    if (!$('server-add').hidden) $('server-add').querySelector('summary')?.focus({ preventScroll: true }); // the button that had focus is gone: a held or double Enter must not reach another server's Remove (D179 2)
    renderConnection();
    if (field('plexToken').value && field('serverUrl').value) testConnection();
  }

  let addAbort = null;

  function syncAddType() {
    const type = form.querySelector('input[name="addTypePick"]:checked')?.value || 'plex';
    $('add-plex').hidden = type !== 'plex';
    $('add-mb').hidden = type === 'plex';
    $('add-address').placeholder = 'http://192.168.1.10:8096';
    $('add-status').textContent = '';
  }

  /** The server just signed in to: read its id with no token, refuse a duplicate by name, then keep it in the sheet's list. */
  async function addServer({ type, url, token, userId = '' }) {
    const status = $('add-status');
    if (sheetServers().length >= MAX_SERVERS) {
      status.textContent = 'Three servers is the most. Remove one to add another.';
      return false;
    }
    status.textContent = 'Checking which server answers…';
    const id = await readId(type, url);
    if (!id) {
      status.textContent = `Couldn't tell which server answers at ${url}. Check the address and try again.`;
      return false;
    }
    let name = '';
    try {
      name = (await createSource({ serverType: type, serverUrl: url, plexToken: token, serverUserId: userId }, { clientId, version }).identity()).name;
    } catch (err) {
      status.textContent = `Signed in, but ${typeLabel(type)} would not answer with that sign-in: ${err.message}`;
      return false;
    }
    // The first server's id is read now when the form has never recorded it, so adding the same server twice is found.
    const firstId = pending.id || (await readId(field('serverType').value || 'plex', addressOf()));
    const taken = [firstId, ...pending.servers.map((e) => e.id)].includes(id);
    if (taken) {
      status.textContent = `${name || typeLabel(type)} is already in the list.`;
      return false;
    }
    if (!pending.id && firstId) pending.id = firstId;
    pending.servers.push({ id, type, url: cleanAddress(url), token, userId, name: name || typeLabel(type) });
    status.textContent = `Added ${name || typeLabel(type)}. Tick its libraries below to show its posters.`;
    $('server-add').open = false;
    renderServers();
    await testConnection(); // loads every server's libraries
    return true;
  }

  async function addPlex() {
    addAbort?.abort();
    const ctrl = new AbortController();
    addAbort = ctrl;
    const status = $('add-status');
    $('add-plex-btn').disabled = true;
    try {
      $('add-prompt').hidden = false;
      $('add-prompt').textContent = 'Asking plex.tv for a code…';
      status.textContent = '';
      const token = await pinSignIn(clientId, {
        settings: { serverType: 'plex' },
        signal: ctrl.signal,
        version,
        onCode: (code) => {
          $('add-prompt').textContent = 'On any device, go to plex.tv/link and enter this code:';
          $('add-code').hidden = false;
          $('add-code').textContent = code;
        },
      });
      if (ctrl.signal.aborted) return;
      $('add-code').hidden = true;
      if (!token) {
        status.textContent = 'Code expired. Press Sign in with Plex to try again.';
        return;
      }
      status.textContent = 'Signed in. Finding your servers…';
      const found = await signInFlow({ serverType: 'plex' }).discoverServers(clientId, token, { secureOnly: location.protocol === 'https:' });
      for (const server of found) {
        const url = await signInFlow({ serverType: 'plex' }).firstReachable(server.connections, server.accessToken, clientId);
        if (!url || ctrl.signal.aborted) continue;
        if (await addServer({ type: 'plex', url, token: server.accessToken })) return;
        if (/already in the list/.test(status.textContent)) continue; // try the next server on the account
        return;
      }
      if (!ctrl.signal.aborted && !/already in the list|Three servers/.test(status.textContent)) status.textContent = 'Signed in, but no reachable server was found that is not in the list already.';
    } catch (err) {
      status.textContent = `Sign-in failed: ${err.message}`;
    } finally {
      $('add-plex-btn').disabled = false;
      $('add-code').hidden = true;
      $('add-prompt').hidden = true;
      if (addAbort === ctrl) addAbort = null;
    }
  }

  async function addMediaBrowser() {
    const type = form.querySelector('input[name="addTypePick"]:checked').value;
    const url = cleanAddress($('add-address').value);
    const status = $('add-status');
    if (!url) return void (status.textContent = 'Enter the server address first.');
    if (!$('add-user').value.trim()) return void (status.textContent = 'Enter the user name.');
    if (location.protocol === 'https:' && url.startsWith('http:')) return void (status.textContent = signInFlow({ serverType: type, serverUrl: url }).words.httpsBlocked);
    status.textContent = 'Signing in…';
    $('add-mb-btn').disabled = true;
    try {
      const { token, userId } = await signInFlow({ serverType: type, serverUrl: url }, { version }).signInWithPassword(clientId, $('add-user').value.trim(), $('add-pass').value);
      if (await addServer({ type, url, token, userId })) {
        $('add-user').value = '';
        $('add-address').value = '';
      }
    } catch (err) {
      status.textContent = err.kind === 'auth' ? 'That user name or password was not accepted.' : `Couldn't sign in to ${typeLabel(type)} at ${url}. (${err.message})`;
    } finally {
      $('add-pass').value = ''; // the password is used once and never kept
      $('add-mb-btn').disabled = false;
    }
  }

  // ---- Sign in with Plex (plex.tv/link PIN), or with Jellyfin (Quick Connect, or a user name and password) ----

  /**
   * Signs in with a plex.tv code or a Quick Connect code, shown in the sheet; or, given the `token` the empty card's code (or a
   * password sign-in) already earned, from "Signed in" onwards. Either way the rest is the same: find the servers, pick the first
   * reachable one, test it. Jellyfin needs the server's address first, and offers the password form when Quick Connect is off.
   */
  async function signIn({ token = null, userId = '' } = {}) {
    cancelSignIn();
    if (isTmdb()) {
      // TMDB signs in with a key typed here, not a code: the fix for a rejected key is to enter another.
      setResult('TMDB did not accept the key. Enter a valid key, then press Test connection.');
      field('tmdbKey').focus();
      return;
    }
    const sign = flow();
    if (sign.needsAddress) {
      if (!sign.serverUrl) {
        openConnection();
        setResult('Enter the server address first.');
        $('jf-address').focus();
        return;
      }
      if (location.protocol === 'https:' && sign.serverUrl.startsWith('http:')) {
        openConnection();
        setResult(sign.words.httpsBlocked);
        return;
      }
      $('test-result').replaceChildren(); // an earlier "enter the address" line does not outlive the address
    }
    const ctrl = new AbortController();
    pinAbort = ctrl;
    openConnection();
    $('signin-btn').disabled = true;
    try {
      let quickConnect = true;
      if (!token && sign.quickConnectEnabled) {
        try {
          quickConnect = await sign.quickConnectEnabled(clientId);
        } catch (err) {
          if (ctrl.signal.aborted) return;
          // The server did not answer: the address is the trouble, not Quick Connect (D143 1).
          setResult(`✗ Couldn't reach ${sign.label} at ${sign.serverUrl}. Check the address and try again. (${err.message})`, err.kind);
          $('jf-address').focus();
          return;
        }
      }
      if (!quickConnect) {
        if (ctrl.signal.aborted) return;
        $('jf-status').textContent = sign.words.passwordOnly ?? 'Quick Connect is off on this server. Sign in with a user name and password.';
        $('jf-password').open = true;
        $('jf-user').focus();
        return;
      }
      if (ctrl.signal.aborted) return;
      $('signin-panel').hidden = false;
      // A flow with no code (Emby) shows neither a code placeholder nor the line about entering one: only its status (UX M1).
      $('signin-code').hidden = !sign.createPin;
      document.querySelector('#signin-panel [data-srv="panel-lead"]').hidden = !sign.createPin;
      $('signin-status').textContent = token ? 'Signed in. Finding your servers…' : 'Requesting a code…';
      if (!token) {
        token = await pinSignIn(clientId, {
          settings: { serverType: formType(), serverUrl: sign.serverUrl },
          signal: ctrl.signal,
          onCode: (code) => {
            $('signin-code').textContent = code;
            $('signin-status').textContent = 'Waiting for you to approve…';
          },
        });
        if (ctrl.signal.aborted) return;
        if (!token) {
          $('signin-status').textContent = 'Code expired — try again.';
          return;
        }
        $('signin-status').textContent = 'Signed in. Finding your servers…';
      }
      field('plexToken').value = token;
      field('serverUserId').value = formType() === 'emby' ? userId : ''; // only Emby needs the user id (C1); it goes with its token
      syncPlayersToServers(); // the account changed, whatever the sign-in does next: an open list is of the old one (D187 1, D189 1)
      servers = await sign.discoverServers(clientId, token, { secureOnly: location.protocol === 'https:' });
      if (ctrl.signal.aborted) return;
      if (!servers.length) {
        $('signin-status').textContent = 'Signed in, but no reachable servers were found on this account.';
        return;
      }
      const select = $('server-select');
      select.replaceChildren(...servers.map((sv, i) => new Option(`${sv.name}${sv.owned ? '' : ' (shared)'}`, String(i))));
      $('server-pick').hidden = servers.length < 2;
      await useServer(0);
      $('signin-panel').hidden = true;
      log.info(`Signed in with ${sign.label}`);
    } catch (err) {
      $('signin-status').textContent = `Sign-in failed: ${err.message}`;
      log.warn(`Sign-in failed: ${err.message}`);
    } finally {
      $('signin-btn').disabled = false;
      if (pinAbort === ctrl) pinAbort = null;
    }
  }

  async function useServer(index) {
    const sv = servers[index];
    if (!sv) return;
    setResult(`Finding a working address for ${sv.name}…`);
    const uri = await flow().firstReachable(sv.connections, sv.accessToken, clientId);
    if (!uri) {
      setResult(`✗ Couldn't reach ${sv.name} from this device.`);
      return;
    }
    field('plexToken').value = sv.accessToken;
    field('serverUrl').value = uri;
    form.dataset.serverName = sv.name;
    syncPlayersToServers(); // the server changed, whether or not the test below passes
    await testConnection();
  }

  function cancelSignIn() {
    pinAbort?.abort();
    pinAbort = null;
    $('signin-panel').hidden = true;
    $('signin-btn').disabled = false;
  }

  // ---- the server type (R-SRC-2): Plex or Jellyfin, chosen in the sheet and stored by Save, never before ----

  /** Shows the controls and words of the type in the hidden field: the choice buttons, the Jellyfin address and password form, every data-srv line. */
  function syncServerType() {
    const type = formType();
    for (const radio of form.querySelectorAll('input[name="serverTypePick"]')) radio.checked = radio.value === type;
    const tmdb = type === 'tmdb';
    for (const radio of form.querySelectorAll('input[name="serverTypeTmdb"]')) radio.checked = tmdb; // its own group: the three above are unchecked here, not by the browser
    $('tmdb-connection').hidden = !tmdb;
    for (const row of form.querySelectorAll('[data-media-only]')) row.hidden = tmdb; // nothing plays on TMDB, and it has no watched state or users
    // "Unwatched titles first" favours by watch count, which TMDB titles do not have: the choice is not offered (a stored one reads as "Nothing" while the sheet is for TMDB).
    const unwatchedChoice = field('weighting').querySelector('option[value="unwatched"]');
    unwatchedChoice.hidden = tmdb;
    unwatchedChoice.disabled = tmdb;
    if (tmdb && field('weighting').value === 'unwatched') field('weighting').value = 'off';
    const addressed = type === 'jellyfin' || type === 'emby'; // the types that sign in at an address the household types
    const codeless = type === 'emby'; // Emby has no code to approve: the user name and password form is its only sign-in and shows open
    $('jf-address-row').hidden = !addressed;
    $('jf-password').hidden = !addressed;
    $('jf-password').open = codeless;
    $('jf-password').querySelector('summary').hidden = codeless; // Emby's only sign-in shows open, not under a heading that can be folded away (D147 4)
    $('jf-login').classList.toggle('primary', codeless); // ... and is the primary button, since there is no other (D147 4)
    $('signin-btn').hidden = codeless;
    $('jf-status').textContent = '';
    $('jf-address').value = field('serverUrl').value;
    field('serverUrl').placeholder = addressed ? 'http://192.168.1.10:8096' : 'http://192.168.1.10:32400';
    applyServerText(type);
  }

  /** Drops a connection test in flight: its answer will be ignored, and a new test may start at once. */
  function dropTest() {
    const unfinished = testing;
    testRun++;
    testing = false;
    $('test-btn').disabled = false;
    // The dropped test will not write its verdict, so a "Connecting…" it left on the line would stay for good (D144 2): the line says what is left to do.
    if (unfinished) setResult('Connection not tested yet. Press Test connection.');
  }

  /**
   * The person picked a server type in the sheet. The token, address and server name belong to the type they were made for, so they are set
   * aside (and come back if the person picks that type again): a Plex token is never offered to a Jellyfin server. The selection, the
   * profiles and the slots stay as stored (D141 3). Nothing is saved, so Cancel undoes it.
   */
  function chooseServerType(type) {
    const from = formType();
    if (type === from) return;
    cancelSignIn();
    // A library, genre or collection of a media server means nothing to TMDB and the other way round: moving to or from TMDB sets the selection aside with the
    // type it was made for (the ratings, which mean the same everywhere, stay). Between media servers it stays as stored (D141 3).
    const crossing = from === 'tmdb' || type === 'tmdb';
    held[from] = { token: field('plexToken').value, url: field('serverUrl').value, name: form.dataset.serverName || '', userId: field('serverUserId').value, ...(crossing ? { sel: { libraries: sel.libraries, genres: sel.genres, houses: sel.houses, source: sel.source } } : {}) };
    const back = held[type] || { token: '', url: '', name: '', userId: '' };
    if (crossing) sel = { ...sel, ...(back.sel ?? { libraries: [], genres: [], houses: [], source: null }) };
    field('plexToken').value = back.token;
    field('serverUserId').value = back.userId;
    field('serverUrl').value = back.url;
    form.dataset.serverName = back.name;
    field('serverType').value = type;
    dropTest();
    offered = { libraries: [], genres: [], collections: [], playlists: [], counts: {} };
    resetHouses();
    $('house-search').value = '';
    offerClient = null;
    countRun++;
    genreRun++;
    sourceRun++;
    $('test-result').replaceChildren();
    connectionOpen = !(back.token && back.url);
    syncServerType();
    renderSelection();
    renderConnection();
  }

  /**
   * Closes the sheet and hides the token in the same step. The dialog's own 'close' event (which also hides it) is queued
   * for a later task, so `dialog.open` is already false while it has not run yet: nothing may rely on that event alone.
   */
  function closeSheet() {
    setTokenShown(false);
    countRun++;
    dialog.close();
  }

  // ---- the allowed devices (R-PLAY-1, D181, D186, D187, D188): the Plex players this display may play on, kept on this display only ----

  let playerStates = 0; // numbers the state lines, so a control can be described by its own
  let playersServers = ''; // the servers (type, address, token, user) the open list was read for

  /** The servers the open list depends on, as the sheet holds them now. */
  const serversKey = () => JSON.stringify(serverList(read()).map((e) => [e.type, e.url, e.token, e.userId]));

  /** The servers changed under an open list: it shuts, and one line says why (D189 1). The players of the old account must not stay tickable (D187 1). */
  function closeForServers() {
    if (players.phase === 'closed') return;
    const heldFocus = $('players-body').contains(document.activeElement);
    closePlayers();
    $('players-closed-note').textContent = 'The servers changed, so the list was closed. Open it again to read the players.';
    if (heldFocus) $('players-open').focus({ preventScroll: true }); // the control that had focus is gone
  }

  /** Called wherever the sheet changes a server: typed, picked, signed in, added, removed or imported. */
  function syncPlayersToServers() {
    if (players.phase !== 'closed' && serversKey() !== playersServers) closeForServers();
  }

  /** What a state says, beside the word, for the eye and for assistive technology (D188 3): the control is described by it. */
  function playerState(state, meaning) {
    const span = document.createElement('span');
    span.className = 'player-state muted small';
    span.id = `players-state-${++playerStates}`;
    span.dataset.state = state;
    span.textContent = `${state}: ${meaning}`;
    return span;
  }

  /** A player plex.tv lists: a tick that allows it, named for the player it allows. A player that is not present is still allowable. */
  function listedPlayerRow(row) {
    const li = document.createElement('li');
    li.className = 'player-row';
    li.dataset.id = row.id;
    const label = document.createElement('label');
    label.className = 'check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.player = row.id;
    box.dataset.name = row.name;
    box.checked = row.allowed;
    box.setAttribute('aria-label', `Allow ${row.name}`);
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = row.name;
    label.append(box, name);
    li.append(label);
    if (row.state) {
      const state = playerState(row.state, row.meaning);
      box.setAttribute('aria-describedby', state.id);
      li.append(state);
    }
    return li;
  }

  /** An allowed player that cannot be ticked: plex.tv no longer lists it ("unavailable") or could not be asked ("not checked"). It can be removed. */
  function storedPlayerRow(row) {
    const li = document.createElement('li');
    li.className = 'player-row';
    li.dataset.id = row.id;
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = row.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn small player-remove';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${row.name} from the allowed devices`);
    const state = playerState(row.state, row.meaning);
    remove.setAttribute('aria-describedby', state.id);
    li.append(name, remove, state);
    return li;
  }

  /** Words for a list of names: "A", "A and B", "A, B and C". */
  const joinServers = (names) => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

  /**
   * The line for a read that failed (D187 2, D188 2): which server's account, and which of three things happened, in plain words (no status code,
   * no protocol word). A read that failed for no reason the error names is "answered with something that could not be read".
   */
  function failedLine(error) {
    const list = sheetServers();
    const said = (error?.failed?.length ? error.failed : [{ kind: 'parse', slots: [] }]).map(({ kind, slots }) => {
      const who = joinServers([...new Set(slots.map((slot) => nameOf(list[slot], slot)))]) || 'your Plex account';
      const head = `Could not read the players of ${who}:`;
      if (kind === 'network' || kind === 'timeout') return `${head} plex.tv did not answer.`;
      if (kind === 'server') return `${head} plex.tv had a problem and could not answer. Try again later.`;
      if (kind === 'auth') return `${head} plex.tv refused the sign-in. Sign in to ${who} again under the connection above.`;
      return `${head} plex.tv answered with something that could not be read.`;
    });
    return `${said.join(' ')} The allowed devices below are as stored and were not checked. You can remove one, but not add one.`;
  }

  /**
   * The words under the status line when a read answered with no player. An empty list is usual on an account with several Plex devices: plex.tv
   * lists an app only while it is open and offers itself for control from another device, and the current Plex apps no longer do. So the words say
   * which apps can be listed and how to read again (the list is read when it is opened), and the empty list does not read as a fault of this
   * display. They are their own paragraph, not part of the status line, so the line stays short enough to be in view when it takes the focus (D197 2).
   */
  const NO_PLAYERS_HELP =
    'Plex lists an app only while it is open and can be controlled from another device: ' +
    'Plex HTPC, Plexamp (music only), or an older Plex app on a TV or streaming box with "Advertise as Player" turned on in its settings. ' +
    'The current Plex apps on phones, tablets, Apple TV and Android TV, Plex in a browser and Plex for Windows or Mac are not listed, whatever their settings. ' +
    'Open the Plex app on the device, then close Settings and open this list again.';

  /** Redraws the Allowed devices section from `players` and `allowed`. Nothing is read here. Focus on a row stays on that player (D188), else on the line. */
  function renderPlayers() {
    const opened = players.phase !== 'closed';
    $('players-open').hidden = opened;
    $('players-body').hidden = !opened;
    $('players-pin-note').hidden = Boolean(getSettings().settingsPinHash); // the PIN that asks is the saved one (requestPin)
    if (!opened) {
      $('players-list').replaceChildren();
      $('players-status').textContent = '';
      $('players-none-help').hidden = true;
      $('players-retry').hidden = true;
      return;
    }
    const was = document.activeElement;
    const rowHad = $('players-list').contains(was) ? was.closest('li')?.dataset.id : undefined;
    // Only a list plex.tv answered can be ticked; a read still loading or failed, or no Plex server to ask, shows the stored entries, not checked.
    const rows = playerRows(allowed, players.phase === 'ok' ? players.listed : null, { noServer: players.phase === 'none' });
    $('players-list').replaceChildren(...rows.map((row) => (row.listed ? listedPlayerRow(row) : storedPlayerRow(row))));
    $('players-status').textContent = {
      loading: 'Reading your players from plex.tv…',
      failed: players.error,
      none: `No Plex server is signed in on this display, so there are no Plex players to list.${allowed.length ? ' Your allowed devices are kept and were not checked. You can remove one, but not add one.' : ''}`,
      ok: players.listed.length ? 'Tick a player to allow it.' : 'plex.tv lists no players on your account.',
    }[players.phase];
    $('players-none-help').textContent = NO_PLAYERS_HELP;
    $('players-none-help').hidden = !(players.phase === 'ok' && !players.listed.length);
    $('players-retry').hidden = players.phase !== 'failed';
    if (rowHad !== undefined) {
      const row = [...$('players-list').children].find((li) => li.dataset.id === rowHad);
      (row?.querySelector('input, button') || $('players-status')).focus({ preventScroll: true });
    }
  }

  /**
   * After a state change the element that has focus is in the visible part of the sheet (D188). Focus in the list: that control is scrolled to,
   * since new rows above it may have pushed it down. Focus on the line or on "Try again": both are brought into view. Focus anywhere else is left alone.
   */
  function showPlayersState() {
    const at = document.activeElement;
    if ($('players-list').contains(at)) at.scrollIntoView({ block: 'nearest' });
    else if (at === $('players-status') || at === $('players-retry')) {
      $('players-status').scrollIntoView({ block: 'nearest' });
      ($('players-retry').hidden ? $('players-status') : $('players-retry')).scrollIntoView({ block: 'nearest' });
    }
  }

  /** Reads the players, for the list just opened (the PIN has been given) or for "Try again" (no new PIN): once, over every Plex account of the household. */
  function openPlayers() {
    const run = ++playersRun;
    $('players-closed-note').textContent = '';
    const household = read();
    playersServers = serversKey();
    players = { phase: 'loading', listed: [], error: '' };
    renderPlayers();
    $('players-status').focus({ preventScroll: true }); // the button that was pressed is gone: keyboard focus stays in the section
    showPlayersState();
    readPlayers(household, { clientId }).then(
      ({ accounts, players: listed }) => {
        if (run !== playersRun) return;
        // An allowed player keeps its allowance when its name changes: it is matched by its client identifier, and the stored name follows the new one (on Save).
        allowed = followNames(allowed, listed);
        players = { phase: accounts ? 'ok' : 'none', listed: accounts ? listed : [], error: '' };
        renderPlayers();
        showPlayersState();
      },
      (err) => {
        if (run !== playersRun) return;
        players = { phase: 'failed', listed: [], error: failedLine(err) };
        renderPlayers();
        showPlayersState();
      },
    );
  }

  /** The list is shut again: the sheet closed or filled afresh, or its servers changed, so the next opening asks for the PIN and reads again. */
  function closePlayers() {
    playersRun++;
    $('players-closed-note').textContent = '';
    players = { phase: 'closed', listed: [], error: '' };
    renderPlayers();
  }

  // ---- events ----

  form.addEventListener('input', (e) => {
    syncPlayersToServers();
    syncDependent();
    if (e.target.closest('[data-live]')) onPreview(read()); // while a profile is open read() is the household's own values, so a profile's are never previewed (D120 1)
  });
  form.addEventListener('change', (e) => {
    syncPlayersToServers();
    syncDependent();
    if (e.target.closest('[data-live]')) onPreview(read());
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (editing) return; // Enter in a field must not save the sheet while a profile is open
    const s = read();
    s.serverName = form.dataset.serverName || s.serverName;
    const err = $('form-error');
    if (markBadSlotTimes()) {
      // Refused: a slot with no readable time would make the whole schedule the strictest limit (D103). The rows are hidden while the toggle is off.
      err.textContent = $('household-toggle').checked ? 'A time slot has no start time. Set it or remove the slot.' : 'A time slot has no start time. Turn on Household with children to see it, then set the time or remove the slot.';
      return;
    }
    if (s.plexToken && s.serverUrl && !s.libraryKey && !s.source && !s.staticRatingKey) { // a collection or playlist is enough
      err.textContent = 'Choose a library (test the connection to load them).';
      return;
    }
    err.textContent = '';
    slotRefusal = false;
    original = null;
    cancelSignIn();
    closeSheet();
    onSave(s, { removed: removedNames });
    removedNames = [];
  });

  $('settings-cancel').addEventListener('click', closeSheet);
  dialog.addEventListener('close', () => {
    if (!dialog.open) stopSlotStatusTimer(); // a close queued before a reopen (position mode's Done) must not stop the open sheet's timer
    closePreset();
    setTokenShown(false); // the token is hidden again whenever the sheet closes
    $('jf-pass').value = '';
    $('add-pass').value = '';
    addAbort?.abort();
    cancelSignIn();
    if (keepOriginal) {
      keepOriginal = false;
      return;
    }
    closePlayers();
    if (original) onPreview(original); // undo live preview
    original = null;
  });

  // ---- position mode (R-SET-5): the modal sheet makes the page inert, so it steps aside for a non-modal bar ----

  const FIELD_OF = { offsetX: 'posterOffsetX', offsetY: 'posterOffsetY', scale: 'posterScale' };
  const num = (name) => Number(field(name).value);
  const position = createPositionMode({
    bar: $('position-bar'),
    doneButton: $('position-done'),
    surface: $('app'),
    stage: $('stage'),
    avoid: [$('stage'), $('poster-box'), $('frame')],
    read: () => ({ offsetX: num('posterOffsetX'), offsetY: num('posterOffsetY'), scale: num('posterScale'), rotation: num('rotation') }),
    write: (change) => {
      for (const [key, value] of Object.entries(change)) field(FIELD_OF[key]).value = value;
      syncDependent();
      onPreview(read());
    },
    onDone: resumeSheet,
  });

  /** What open() asks of the sheet once it is up; `auto` adds the connection test a fresh open runs for a saved connection. */
  function runOpenOptions({ wantSignIn, token, userId = '', test, section }, auto) {
    if (section === 'protection') $('protection-fieldset').scrollIntoView({ block: 'start' });
    else if (section === 'layout') $('layout-fieldset').scrollIntoView({ block: 'start' });
    else if (section === 'household') {
      $('household-fieldset').scrollIntoView({ block: 'start' });
      // Focus starts in Household too, so the first Tab or arrow press stays where the reader was sent, not back at Plex connection.
      $('household-toggle').focus({ preventScroll: true });
    }
    if (token) signIn({ token, userId });
    else if (wantSignIn) signIn();
    else if (test || (auto && (original.serverType === 'tmdb' ? original.tmdbKey : original.plexToken && original.serverUrl))) testConnection();
  }

  /** The first-run card's choice of server type and address, put in the sheet's controls. */
  function takeConnection(type, url) {
    chooseServerType(type);
    if (type === 'tmdb') field('tmdbKey').focus({ preventScroll: false }); // TMDB has only a key to enter: the cursor is in it
    if (url) {
      field('serverUrl').value = url;
      $('jf-address').value = url;
    }
    // No check for an open Allowed devices list here, on purpose, and no case can pin one: a type change ends in `renderServers` through
    // `chooseServerType`; a token handed over with the choice goes through `signIn`, which checks; the address written here is a Jellyfin or Emby
    // first server's (the card hands over an address only for those types), which the players read never uses; and the first-run choice is
    // handed over only when the empty card's "Open settings" is pressed, and that card is hidden in the one state that resumes this sheet from the position tool with the display unconfigured (a pin that vanished).
  }

  /** Done or Escape: the sheet comes back with the values just set and the SAME `original`, so Cancel still reverts. */
  function resumeSheet() {
    if (!dialog.open) dialog.showModal();
    startSlotStatusTimer(); // the sheet comes back from position mode, which closed it
    syncDependent();
    $('position-btn').focus();
  }

  // Nothing to position while the empty or sign-in card is up (the same signal main.js uses: the card's own hidden flag).
  function syncPositionButton() {
    const noPoster = !$('empty').hidden;
    $('position-btn').disabled = noPoster || Boolean(editing);
    $('position-reason').hidden = !noPoster;
    // A hidden element that aria-describedby names still supplies the description, so the link exists only while the reason shows.
    if (noPoster) $('position-btn').setAttribute('aria-describedby', 'position-reason');
    else $('position-btn').removeAttribute('aria-describedby');
  }
  new MutationObserver(syncPositionButton).observe($('empty'), { attributes: true, attributeFilter: ['hidden'] });
  syncPositionButton();

  $('position-btn').addEventListener('click', () => {
    keepOriginal = true;
    closeSheet();
    position.start();
  });

  $('preset-btn').addEventListener('click', openPreset);
  $('preset-cancel').addEventListener('click', closePreset);
  $('preset-apply').addEventListener('click', applyPreset);
  $('signin-btn').addEventListener('click', () => signIn());
  $('server-list').addEventListener('click', (e) => {
    const button = e.target.closest('button[data-slot]');
    if (button) removeServer(Number(button.dataset.slot));
  });
  for (const radio of form.querySelectorAll('input[name="addTypePick"]')) radio.addEventListener('change', syncAddType);
  $('add-plex-btn').addEventListener('click', addPlex);
  $('add-mb-btn').addEventListener('click', addMediaBrowser);
  for (const input of [$('add-address'), $('add-user'), $('add-pass')]) {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      $('add-mb-btn').click();
    });
  }
  $('connected-change').addEventListener('click', openConnection);
  $('library-list').addEventListener('change', () => {
    sel.libraries = readLibraries();
    renderConnected();
    loadGenres();
  });
  $('genre-list').addEventListener('change', () => {
    sel.genres = [...$('genre-list').querySelectorAll('input:checked')].map((box) => ({ key: box.dataset.key || '', title: box.dataset.title }));
    syncGenreText(); // not renderGenres(): rebuilding the rows would drop keyboard focus and scroll the box back to the top
  });
  $('house-list').addEventListener('change', () => {
    sel.houses = [...$('house-list').querySelectorAll('input:checked')].map((box) => ({ key: box.dataset.key || '', title: box.dataset.title }));
    syncHouseText(); // not renderHouses(): rebuilding the rows would drop keyboard focus and scroll the box back to the top
  });
  $('house-search-btn').addEventListener('click', searchHouses);
  $('house-search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // Enter in the search field searches; it never saves the sheet
    searchHouses();
  });
  $('rating-list').addEventListener('change', () => {
    sel.ratings = [...$('rating-list').querySelectorAll('input:checked')].map((box) => box.value);
  });
  $('source-select').addEventListener('change', () => {
    const o = $('source-select').selectedOptions[0];
    const [kind, ...rest] = (o?.value || '').split(':');
    sel.source = o?.value ? { kind, key: rest.join(':'), title: o.dataset.title || '' } : null;
    renderLibraries();
    renderGenres(); // greyed while a source is set, and ticked as it was
    renderConnected();
  });
  // The ratings offered follow the household limit, its toggle and the time slots as they are edited.
  for (const el of [$('household-toggle'), field('maxContentRating')]) el.addEventListener('change', renderRatings);
  $('slot-list').addEventListener('change', (e) => e.target.closest('.slot-limit') && renderRatings());
  // Any edit of the slots (a time, a limit, days, Add or Remove) is the owner taking the schedule in hand: the unreadable notice goes.
  const slotsEdited = () => ($('slot-unreadable').hidden = true);
  $('slot-editor').addEventListener('input', slotsEdited);
  $('slot-editor').addEventListener('change', slotsEdited);
  $('slot-editor').addEventListener('click', (e) => e.target.closest('button') && slotsEdited());

  // The preset buttons and the Custom field (UI only) set the stored seconds. A half-typed or junk entry leaves them alone.
  for (const radio of form.querySelectorAll('input[name="rotatePreset"]')) radio.addEventListener('change', () => radio.checked && pickPreset(radio.value));
  field('rotateMinutes').addEventListener('input', (e) => {
    field('rotateSeconds').value = String(secondsFromMinutes(e.target.value, field('rotateSeconds').value));
  });
  field('rotateMinutes').addEventListener('change', (e) => {
    e.target.value = formatMinutes(field('rotateSeconds').value); // shows what will be saved
  });
  $('signin-cancel').addEventListener('click', cancelSignIn);
  for (const radio of form.querySelectorAll('input[name="serverTypePick"]')) radio.addEventListener('change', () => radio.checked && chooseServerType(radio.value));
  $('jf-address').addEventListener('input', () => {
    field('serverUrl').value = $('jf-address').value.trim();
  });
  field('serverUrl').addEventListener('input', () => {
    $('jf-address').value = field('serverUrl').value;
  });
  $('jf-login').addEventListener('click', async () => {
    const status = $('jf-status');
    const sign = flow();
    if (!sign.serverUrl) return void (status.textContent = 'Enter the server address first.');
    if (!$('jf-user').value.trim()) return void (status.textContent = 'Enter the user name.');
    status.textContent = 'Signing in…';
    $('jf-login').disabled = true;
    try {
      const { token, userId } = await sign.signInWithPassword(clientId, $('jf-user').value.trim(), $('jf-pass').value);
      status.textContent = '';
      await signIn({ token, userId });
    } catch (err) {
      if (err.kind === 'network' || err.kind === 'timeout') {
        // The server did not answer: the address is the trouble, and it is named here and can be changed (D143 1, D145 8).
        status.textContent = '';
        setResult(`✗ Couldn't reach ${sign.label} at ${sign.serverUrl}. Check the address and try again. (${err.message})`, err.kind);
        $('jf-address').focus();
      } else {
        status.textContent = err.kind === 'auth' ? 'That user name or password was not accepted.' : `Sign-in failed: ${err.message}`;
      }
    } finally {
      $('jf-pass').value = ''; // the password is used once and never kept
      $('jf-login').disabled = false;
    }
  });
  // Enter in the password form signs in; it never saves the sheet.
  for (const input of [$('jf-user'), $('jf-pass'), $('jf-address')]) {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (input === $('jf-address')) $('signin-btn').click();
      else $('jf-login').click();
    });
  }
  $('server-select').addEventListener('change', (e) => useServer(Number(e.target.value)));
  $('test-btn').addEventListener('click', testConnection);
  for (const radio of form.querySelectorAll('input[name="serverTypeTmdb"]')) radio.addEventListener('change', () => radio.checked && chooseServerType('tmdb'));
  $('tmdb-list').addEventListener('change', () => {
    const before = sourceOf(sel.libraries[0]?.key)?.type;
    readTmdbChoice();
    if (before !== sourceOf(sel.libraries[0].key).type) sel.genres = []; // a movie genre id is not a show's
    renderTmdbSource({ controls: false });
    renderConnected();
    loadGenres();
  });
  for (const id of ['tmdb-mode', 'tmdb-from', 'tmdb-to']) {
    $(id).addEventListener('input', readTmdbChoice);
    $(id).addEventListener('change', readTmdbChoice);
  }
  field('tmdbKey').addEventListener('input', () => {
    $('tmdb-credit').hidden = !(isTmdb() || field('tmdbKey').value.trim());
  });
  $('tmdb-key-toggle').addEventListener('click', async () => {
    if (field('tmdbKey').type === 'password') {
      if (!(await requestPin()) || !dialog.open) return; // showing the key needs the PIN, as showing the token does; hiding it does not
      setTokenShown(true);
    } else {
      setTokenShown(false);
    }
  });
  $('token-toggle').addEventListener('click', async () => {
    if (field('plexToken').type === 'password') {
      if (!(await requestPin()) || !dialog.open) return; // showing the token needs the PIN; hiding it does not
      setTokenShown(true);
    } else {
      setTokenShown(false);
    }
  });

  // The Allowed devices list opens behind the PIN (D186 4): one prompt, then it can be read and changed until the sheet closes. No PIN set, no prompt.
  $('players-open').addEventListener('click', async () => {
    if (!(await requestPin()) || !dialog.open) return;
    openPlayers();
  });
  // A tick allows a listed player, and clears the allowance; both are sheet changes, stored by Save and undone by Cancel (D186 5).
  // "Try again" reads again with no new PIN: the list is open (D188 1). Nothing can be ticked until plex.tv answers.
  $('players-retry').addEventListener('click', openPlayers);
  $('players-list').addEventListener('change', (e) => {
    const box = e.target.closest('input[data-player]');
    if (!box) return;
    allowed = setAllowed(allowed, { id: box.dataset.player, name: box.dataset.name }, box.checked);
  });
  $('players-list').addEventListener('click', (e) => {
    const button = e.target.closest('button.player-remove');
    if (!button) return;
    const row = button.closest('li');
    const rows = [...$('players-list').children];
    const at = rows.indexOf(row);
    allowed = allowed.filter((p) => p.id !== row.dataset.id);
    renderPlayers();
    // Focus goes to the next row's control, or the one before, or the section's own line: never back to the top of the sheet.
    const left = [...$('players-list').children];
    const next = left[at] || left[at - 1];
    (next?.querySelector('input, button') || $('players-status')).focus();
  });

  $('pin-set-btn').addEventListener('click', async () => {
    const auth = await choosePin();
    if (!auth || !dialog.open) return;
    pendingAuth = auth;
    syncPin();
  });
  $('pin-clear-btn').addEventListener('click', () => {
    pendingAuth = { hash: '', salt: '' };
    syncPin();
  });

  $('reset-layout').addEventListener('click', () => {
    const d = defaults();
    for (const k of LAYOUT_KEYS) field(k).value = d[k];
    syncDependent();
    onPreview(read());
  });

  $('unpin-btn').addEventListener('click', (e) => {
    pendingPin = { key: '', title: '' };
    e.target.hidden = true;
    $('pinned-title').textContent = 'none (unpinned on save)';
  });

  $('export-btn').addEventListener('click', async () => {
    const includeSecrets = $('export-secrets').checked;
    if (includeSecrets && !(await requestPin())) return; // the file would carry the token
    downloadJson('plex-poster-settings.json', toExport(read(), { includeSecrets }));
    if (includeSecrets) toast(`Exported with your ${flow().label} token — keep that file private.`);
  });

  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!(await requestPin())) return; // the gate sits on the file arriving, not on the button, so a scripted change event is gated too
    try {
      const text = await file.text();
      const from = formType();
      const away = { token: field('plexToken').value, url: field('serverUrl').value, name: form.dataset.serverName || '', userId: field('serverUserId').value };
      // A file for another server (another type, or another address) never receives this display's token: without its own, none is kept (D142 2, D144 1).
      const before = read(); // the household as the sheet holds it, for what the file would leave out
      const { settings: s, setAside } = importWithConnection(text, before);
      const leftOut = serversDroppedByTmdbImport(text, before).map((e) => e.name || typeLabel(e.type));
      write(s);
      if (setAside) {
        held[from] = away;
        form.dataset.serverName = '';
        setResult('Connection not tested yet. Press Test connection.'); // the old server's "✓ … libraries" is not this connection's (D147 3)
      }
      onPreview(s);
      // One notice, so none of it is lost to the next: TMDB cannot be one of several servers (D210 5), and what the file would leave out is named before Save (D211 2).
      toast(
        [
          'Settings imported — review and press Save.',
          tmdbDroppedByImport(text),
          leftOut.length ? `TMDB is your only source in this file, so ${joinServers(leftOut)} would be left out. Cancel keeps ${leftOut.length > 1 ? 'them' : 'it'}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
      log.info(`Imported settings from ${file.name}`);
    } catch (err) {
      $('form-error').textContent = `Import failed: ${err.message}`;
    }
  });

  $('clear-cache-btn').addEventListener('click', async () => {
    await onClearCache();
    toast('Poster cache cleared.');
  });

  $('reset-btn').addEventListener('click', async () => {
    if (!(await requestPin())) return;
    if (!confirm(`Reset all settings, including your ${flow().label} token, and clear cached posters?`)) return;
    original = null;
    closeSheet();
    onReset();
  });

  return {
    /**
     * Opens the sheet. `signIn` starts a plex.tv code in it at once (the fix for a rejected token); `token` is one the empty
     * card's code already earned, so the sheet picks up at "Signed in"; `test` runs the connection test even when it would not
     * run by itself; `section` ('protection' or 'layout') scrolls the sheet to that fieldset. `serverType` and `serverUrl` are the
     * choice the empty card's first run made before it earned `token`: the sheet shows them, and nothing is stored until Save.
     */
    open({ signIn: wantSignIn = false, token = null, userId = '', test = false, section = '', serverType = '', serverUrl = '' } = {}) {
      if (position.active) {
        // Finish position mode (the sheet returns with the values set so far and the same `original`), then honour the
        // options as a normal open would: a sign-in started from the empty card must still sign in.
        position.stop();
        resumeSheet();
        if (serverType) takeConnection(serverType, serverUrl);
        runOpenOptions({ wantSignIn, token, userId, test, section }, false);
        return;
      }
      if (dialog.open) return;
      original = getSettings();
      $('form-error').textContent = '';
      slotRefusal = false;
      $('test-result').replaceChildren();
      $('first-run-hint').hidden = isConfigured(original);
      form.dataset.serverName = original.serverName;
      write(original);
      syncSlotStatus();
      setTokenShown(false);
      $('advanced').open = false;
      $('manual-connection').open = Boolean(original.plexToken && !original.serverName);
      closePreset();
      dialog.showModal();
      startSlotStatusTimer();
      if (serverType) takeConnection(serverType, serverUrl);
      runOpenOptions({ wantSignIn, token, userId, test, section }, true);
    },
    /** For the fix buttons, while the sheet is already open. */
    startSignIn: () => signIn(),
    test: () => testConnection(),
    get isOpen() {
      return dialog.open;
    },
  };
}
