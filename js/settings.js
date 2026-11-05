// Settings schema, persistence, legacy migration and import/export.
// Everything is stored as one JSON blob so it can be exported and validated as a unit.

import { sanitizeSlots } from './limit-schedule.js';
import { cleanProfiles } from './profiles.js';
import { parseHHMM } from './schedule.js';
import { belongsTo, cleanGenres, cleanKeys, cleanNames, cleanRatings, cleanServerId, cleanSource, keyFor, memberBelongsTo, splitKey } from './selection.js';
import { cleanDays, cleanWeighting } from './weighting.js';

export const STORAGE_KEY = 'plexPoster.settings';
export const EXPORT_FORMAT = 'plex-poster-display/settings';
export const EXPORT_VERSION = 1;

const num = (min, max) => (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
/** Strict numeric sanitiser for the keys added in 2.1: junk (non-numbers, booleans, arrays, blank strings) gives the default; finite numbers clamp; `int` rounds. */
const strictNum = (min, max, { int = false } = {}) => (v, d) => {
  if (typeof v !== 'number' && !(typeof v === 'string' && v.trim() !== '')) return d;
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.min(max, Math.max(min, int ? Math.round(n) : n));
};
const bool = (v, d) => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : d);
const str = (v, d) => (typeof v === 'string' ? v.trim() : d);
const oneOf = (...allowed) => (v, d) => (allowed.includes(v) ? v : d);
const hhmm = (v, d) => (parseHHMM(v) !== null ? v : d);
const hex = (v, d) => (typeof v === 'string' && /^[0-9a-f]*$/i.test(v) ? v : d);
/** The address of a server as it is compared and stored: trimmed, with no trailing slash. */
export const addressOf = (v) => (typeof v === 'string' ? v.trim().replace(/\/+$/, '') : '');

/** How many servers a household may have, the first one included (D156 7). */
export const MAX_SERVERS = 3;

/**
 * One more server (the second or third, D156 7) as stored: its own server id (required: it is how its posters, pin and history are told
 * apart, D156 2), type, address, token and, for Emby, user id. A value without an id, a type or an address is not a server. Its token is
 * its own and goes only to its own address (D157 4); it is in SECRET_KEYS.
 */
export function cleanServer(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const id = cleanServerId(v.id);
  const type = typeof v.type === 'string' ? v.type.trim().slice(0, 40) : '';
  const url = addressOf(v.url);
  if (!id || !type || !url) return null;
  return { id, type, url, token: str(v.token, ''), userId: str(v.userId, ''), name: str(v.name, '') };
}

/** The extra servers: at most MAX_SERVERS - 1 are kept, in the order stored, and the rest are dropped on load (D157 11). */
const cleanServers = (v) => (Array.isArray(v) ? v.map(cleanServer).filter(Boolean).slice(0, MAX_SERVERS - 1) : []);

const rotation = (v, d) => {
  const n = Number(v);
  return [0, 90, 180, 270].includes(n) ? n : d;
};

/** Each entry: [default, sanitiser]. Sanitisers coerce bad input back to the default. */
const SCHEMA = {
  // Connection
  // Which media server the display talks to (D134): picks the source adapter in js/sources ('plex', 'jellyfin' or 'emby'). Absent in a 2.3.1
  // object, which is Plex. A value this build has no adapter for is kept as written, never turned into Plex: the display then shows a
  // connection error that names it (D139 1), and a Save from Settings keeps it until a type is chosen.
  serverType: ['plex', (v, d) => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 40) : d)],
  // The access token of whichever server type is set (the key keeps its 2.3.1 name). Jellyfin's and Emby's is the AccessToken a sign-in returns; a password is never stored (D141 8, D145 2).
  plexToken: ['', str],
  serverUrl: ['', (v, d) => str(v, d).replace(/\/+$/, '')],
  // The id of the user an Emby sign-in returned (D145 2: not a secret). Emby lists a user's libraries only at /Users/{UserId}/Views, so the
  // Emby adapter needs it; Plex and Jellyfin leave it empty. It belongs to the token and the address it came with and is set aside with them.
  serverUserId: ['', str],
  serverName: ['', str],
  // Several servers (R-SRC-4, D156, D157). The keys above describe the FIRST server, as they did in 2.4.0, and `servers` holds up to two more.
  // `serverId` is the first server's own id, '' while it has not been read (a 2.4.0 object has none): it is recorded when the household
  // changes the address or adds a server, never rewritten on upgrade. `serverCarried` marks the entry that owns the bare ids (the offline
  // cache, the pin, the no-repeat history, the library keys stored without a server id), and no other entry owns one (D157 1, D162 1). That is
  // the entry carried over from 2.4.0, or a server that replaced it in the first place while alone, after the bare entries were cleared. A
  // server moved into the first place from `servers` (the first server was removed) keeps its scoped ids and is never carried. True when absent.
  serverId: ['', (v) => cleanServerId(v)],
  serverCarried: [true, bool],
  servers: [[], cleanServers],
  libraryKey: ['', (v, d) => str(String(v ?? ''), d)],
  libraryName: ['', str],
  // The poster selection (R-SEL-1, D107): the chosen movie libraries (libraryKey/libraryName always mirror the first), the genres and
  // ratings that narrow them, or one collection/playlist that replaces them. Applied on Save, never live-previewed.
  libraryKeys: [[], (v) => cleanKeys(v)],
  libraryNames: [[], (v) => cleanNames(v)],
  genres: [[], (v) => cleanGenres(v)],
  ratings: [[], (v) => cleanRatings(v)],
  source: [null, (v) => cleanSource(v)],
  username: ['', str],

  // What to show
  showNowPlaying: [true, bool],
  includeEpisodes: [true, bool],
  unwatchedOnly: [true, bool],
  randomPoolSize: [100, num(1, 1000)],
  // Weighting and the no-repeat window (R-SEL-2, D113): which titles the pool leans toward, and how many whole days a shown title stays away. Applied on Save.
  weighting: ['off', cleanWeighting],
  noRepeatDays: [0, cleanDays],
  staticRatingKey: ['', (v, d) => str(String(v ?? ''), d)],
  staticTitle: ['', str],

  // Timing (seconds)
  rotateSeconds: [300, num(10, 86400)],
  nowPlayingPollSeconds: [20, num(5, 3600)],

  // Display
  frameId: ['marquee', str],
  customFrameUrl: ['', str],
  posterFit: ['cover', oneOf('cover', 'contain', 'fill')],
  posterScale: [100, num(10, 300)],
  posterOffsetX: [0, num(-100, 100)],
  posterOffsetY: [0, num(-100, 100)],
  rotation: [0, rotation],
  crossfadeMs: [1200, num(0, 10000)],
  showTitle: [false, bool],

  // Device
  keepAwake: [true, bool],
  hideCursor: [true, bool],

  // Display, orientation and status
  rotateUi: [true, bool],
  statusIndicator: ['dot', oneOf('dot', 'off')],
  controlLabels: ['auto', oneOf('auto', 'always', 'never')],
  fillMode: ['none', oneOf('none', 'blur', 'info')],
  gapFill: ['none', oneOf('none', 'blur', 'matte')],

  // Cache
  posterCacheLimit: [100, strictNum(10, 300, { int: true })],

  // Content filter
  // An unknown limit (a typo, a hand-edited file) fails closed to PG-13, never to "no limit" (K21, D31). Absent stays ''.
  maxContentRating: ['', (v) => (['', 'G', 'PG', 'PG-13', 'R', 'NC-17'].includes(v) ? v : 'PG-13')],
  limitNowPlaying: [true, bool],
  // The limit by time of day (R-FILT-2, D101): applied only while a household limit is set; no slots = the limit above all day.
  limitSlots: [[], (v) => sanitizeSlots(v)],
  // Viewer profiles (R-PROF-1, D117): named bundles of limit, now-playing rule, selection, weighting and frame, at most 6. A slot may name one. Applied on Save, never live-previewed.
  profiles: [[], (v) => cleanProfiles(v)],

  // Display protection
  sleepEnabled: [false, bool],
  sleepStart: ['01:00', hhmm],
  sleepEnd: ['07:00', hhmm],
  idleSleepHours: [0, strictNum(0, 48, { int: true })],
  wakeOnPlayback: [true, bool],
  pixelShift: [true, bool],
  pixelShiftMinutes: [3, strictNum(1, 60, { int: true })],
  frameBrightness: [100, strictNum(10, 100)],
  nightDim: [false, bool],
  nightDimStart: ['22:00', hhmm],
  nightDimEnd: ['07:00', hhmm],
  nightDimLevel: [60, strictNum(10, 100)],
  nightDimTarget: ['frame', oneOf('frame', 'stage')],
  dailyReload: [true, bool],
  dailyReloadTime: ['04:00', hhmm],

  // Kiosk
  kioskMode: [false, bool],
  disableShortcuts: [false, bool],
  settingsPinHash: ['', hex],
  settingsPinSalt: ['', hex],
  deviceHelper: [false, bool],

  // Now playing
  showMeta: [false, bool],
  showProgress: [true, bool],
  showPlayer: [false, bool],
};

/** The keys that name a server connection: a file that carries one of them and no `serverType` is a 2.3.1 (Plex) file. */
const CONNECTION_KEYS = ['serverUrl', 'plexToken', 'libraryKey', 'libraryKeys'];

/** Keys that hold secrets and are optional on export. */
export const SECRET_KEYS = ['plexToken', 'servers.token'];
// A key written `list.field` is the field `field` of every entry of the list `list`: each extra server holds its own token (D157 4).

/** Keys that are this display's own state: never written to an export and never accepted from an import file (a file must not say which server owns the 2.4.0 keys). */
export const LOCAL_KEYS = ['serverId', 'serverCarried'];

/** Takes the secrets named in SECRET_KEYS out of a settings object (a copy). */
export function withoutSecrets(data) {
  const out = { ...data };
  for (const k of SECRET_KEYS) {
    const [list, field] = k.split('.');
    if (!field) delete out[list];
    else if (Array.isArray(out[list])) out[list] = out[list].map(({ [field]: _secret, ...rest }) => rest);
  }
  return out;
}

/** PIN material: never written to an export and never accepted from an import file. */
export const NEVER_EXPORT_KEYS = ['settingsPinHash', 'settingsPinSalt'];

/** A default that is a list is copied, so no caller can change the schema's own. */
const copyOf = (d) => (Array.isArray(d) ? [...d] : d);

export function defaults() {
  return Object.fromEntries(Object.entries(SCHEMA).map(([k, [d]]) => [k, copyOf(d)]));
}

/** Returns a complete, valid settings object; unknown keys are dropped. */
export function sanitize(input = {}) {
  const out = {};
  for (const [key, [def, fix]] of Object.entries(SCHEMA)) {
    out[key] = key in input && input[key] !== undefined && input[key] !== null ? fix(input[key], def) : copyOf(def);
  }
  return reconcileServers(reconcileLibraries(out));
}

/** A server whose id is already in the list is not a second server: the later entry is dropped (D157 6). The first server's id counts when it is known. */
function reconcileServers(out) {
  const seen = new Set(out.serverId ? [out.serverId] : []);
  out.servers = out.servers.filter((e) => !seen.has(e.id) && seen.add(e.id));
  return out;
}

/**
 * The household's servers, the first one first (D156 7): `{ id, carried, type, url, token, userId, name }`. A settings object from 2.4.0 is a
 * list of one: the first server, carried over, with no id yet. The other entries are never carried (D157 1).
 */
export function serverList(s) {
  const first = { id: cleanServerId(s?.serverId), carried: s?.serverCarried !== false, type: s?.serverType || 'plex', url: addressOf(s?.serverUrl), token: s?.plexToken || '', userId: s?.serverUserId || '', name: s?.serverName || '' };
  const more = (Array.isArray(s?.servers) ? s.servers : []).slice(0, MAX_SERVERS - 1).map((e) => ({ ...e, carried: false }));
  return [first, ...more];
}

/** The servers of `before` that `after` no longer has: an entry stays when its server id is in the list still, or when it is the carried one and still carried. */
export function removedServers(before, after) {
  return before.filter((e) => !after.some((n) => (e.id && n.id && e.id === n.id) || (e.carried && n.carried)));
}

/**
 * `settings` without everything that belonged to the servers in `gone` (D157 1, 2): their library keys (also inside profiles), a collection
 * or playlist, and a pin that names them. The pin goes whatever its rating, never re-resolved on another server (D122 1).
 */
export function withoutServers(settings, gone) {
  if (!gone.length) return settings;
  const mine = (id) => gone.some((e) => belongsTo(id, e));
  const prune = (o) => {
    const keys = cleanKeys(o.libraryKeys);
    const names = cleanNames(o.libraryNames);
    const keep = keys.map((k, i) => [k, names[i] || '']).filter(([k]) => !mine(k));
    const base = { ...o, libraryKeys: keep.map(([k]) => k), libraryNames: keep.map(([, n]) => n) };
    if (typeof o.libraryKey === 'string' && mine(o.libraryKey)) Object.assign(base, { libraryKey: keep[0]?.[0] || '', libraryName: keep[0]?.[1] || '' });
    if (o.source && gone.some((e) => memberBelongsTo(`${o.source.kind}:${o.source.key}`, e))) base.source = null;
    return base;
  };
  const next = prune(settings);
  if (settings.staticRatingKey && mine(settings.staticRatingKey)) Object.assign(next, { staticRatingKey: '', staticTitle: '' });
  if (Array.isArray(settings.profiles)) next.profiles = settings.profiles.map((p) => (p && typeof p === 'object' ? prune(p) : p));
  return next;
}

/**
 * libraryKey and libraryName are the first chosen library, so everything that reads one library (isConfigured, the Connected card,
 * diagnostics) keeps working. A 2.2 object, with only libraryKey, becomes that one library in the list (D107 ruling 2). The names line
 * up with the keys.
 */
function reconcileLibraries(out) {
  if (!out.libraryKeys.length) {
    if (out.libraryKey) {
      out.libraryKeys = [out.libraryKey];
      out.libraryNames = [out.libraryName];
    } else {
      out.libraryNames = [];
    }
    return out;
  }
  out.libraryNames = out.libraryKeys.map((_, i) => out.libraryNames[i] || '');
  if (out.libraryKey && out.libraryKey !== out.libraryKeys[0]) out.libraryName = ''; // that name belonged to another library
  out.libraryKey = out.libraryKeys[0];
  out.libraryName = out.libraryNames[0] || out.libraryName;
  return out;
}

export function isConfigured(s) {
  return Boolean(s.plexToken && s.serverUrl && (s.libraryKey || s.staticRatingKey || s.source?.key)); // a collection or playlist is a source of its own
}

/**
 * Settings written by the original single-file app used one localStorage key per value.
 * Connection details carry over; poster geometry used a different model so it resets.
 */
const LEGACY_KEYS = {
  PLEX_TOKEN: 'plexToken',
  PLEX_SERVER_URL: 'serverUrl',
  PLEX_USERNAME: 'username',
  LIBRARY_KEY: 'libraryKey',
  REFRESH_INTERVAL_MS: 'rotateSeconds',
};
const LEGACY_DROP = ['FRAME_PATH', 'POSTER_SCALE', 'POSTER_OFFSET_X', 'POSTER_OFFSET_Y'];

/** Accepts the old CONFIG object shape (PLEX_TOKEN, …) in imported files. */
function translateLegacyShape(obj) {
  const out = { ...obj };
  for (const [oldKey, newKey] of Object.entries(LEGACY_KEYS)) {
    if (!(oldKey in out)) continue;
    if (!(newKey in out)) out[newKey] = newKey === 'rotateSeconds' ? Math.round(Number(out[oldKey]) / 1000) : out[oldKey];
    delete out[oldKey];
  }
  return out;
}

export function migrateLegacy(storage) {
  const found = {};
  let any = false;
  for (const [oldKey, newKey] of Object.entries(LEGACY_KEYS)) {
    const v = storage.getItem(oldKey);
    if (v === null) continue;
    any = true;
    found[newKey] = newKey === 'rotateSeconds' ? Math.round(Number(v) / 1000) : v;
  }
  if (!any) return null;
  for (const k of [...Object.keys(LEGACY_KEYS), ...LEGACY_DROP]) storage.removeItem(k);
  return found;
}

export function load(storage) {
  let raw = null;
  try {
    raw = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
  } catch {
    raw = null;
  }
  if (!raw) {
    const legacy = migrateLegacy(storage);
    if (legacy) {
      const migrated = sanitize(legacy);
      save(storage, migrated);
      return { settings: migrated, source: 'legacy' };
    }
    return { settings: defaults(), source: 'defaults' };
  }
  return { settings: sanitize(raw), source: 'storage' };
}

export function save(storage, settings) {
  const clean = sanitize(settings);
  storage.setItem(STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

export function toExport(settings, { includeSecrets = false } = {}) {
  const data = sanitize(settings);
  const out = includeSecrets ? data : withoutSecrets(data);
  for (const k of [...NEVER_EXPORT_KEYS, ...LOCAL_KEYS]) delete out[k];
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), settings: out };
}

/** The token of the extra server in `list` that is the same server as `e` (same id, type and address), or ''. */
function sameServer(e, list) {
  const mine = cleanServer({ ...e, token: '' });
  const hit = mine && (Array.isArray(list) ? list : []).find((c) => c && c.id === mine.id && c.type === mine.type && addressOf(c.url) === mine.url);
  return hit && typeof hit.token === 'string' ? hit.token : '';
}

/**
 * Parses an exported file (or a bare settings object, e.g. a hand-written config.json)
 * and merges it over `current`. Throws with a readable message on bad input.
 */
export function fromImport(text, current = defaults()) {
  let parsed;
  try {
    parsed = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object.');
  }
  let incoming = parsed;
  if (parsed.format !== undefined) {
    if (parsed.format !== EXPORT_FORMAT) throw new Error(`Unknown file format "${parsed.format}".`);
    if (Number(parsed.version) > EXPORT_VERSION) throw new Error('File was exported by a newer version of the app.');
    incoming = parsed.settings || {};
  }
  incoming = translateLegacyShape(incoming);
  const known = Object.keys(incoming).filter((k) => k in SCHEMA && !NEVER_EXPORT_KEYS.includes(k) && !LOCAL_KEYS.includes(k));
  if (known.length === 0) throw new Error('No recognised settings in file.');
  const merged = { ...current };
  // A 2.2-shaped file names one library: it replaces the whole selection (that library, no genres, no rating subset, no source), not just the list.
  if (known.includes('libraryKey') && !known.includes('libraryKeys')) Object.assign(merged, { libraryKeys: [], libraryNames: [], genres: [], ratings: [], source: null });
  for (const k of known) merged[k] = incoming[k];
  // A server in the file with no token of its own keeps the token of the server it replaces only when it is the same server at the same
  // address (the same id, type and address): a token never travels to another address (D157 4, D144 1).
  if (known.includes('servers')) merged.servers = (Array.isArray(incoming.servers) ? incoming.servers : []).map((e) => (e && typeof e === 'object' && typeof e.token !== 'string' ? { ...e, token: sameServer(e, current.servers) } : e));
  // A file that names a connection but no server type is a 2.3.1 file, which is Plex: it must not graft a Plex address onto another type's display.
  if (!known.includes('serverType') && known.some((k) => CONNECTION_KEYS.includes(k))) merged.serverType = 'plex';
  return sanitize(merged);
}

/**
 * An import as the Settings sheet applies it: `fromImport`, plus what happens to the connection (D142 2, D144 1). The current token
 * belongs to the current server: when the file names another server type or another server address and carries no token of its own,
 * the result has no token or user id (the display asks to sign in) and `setAside` is true. The sheet then files the old token, address
 * and name under the old server type in its `held` list. For a file that moves to ANOTHER TYPE they come back when that type is chosen
 * again. For a move to another address of the SAME type they do not come back: the next choice of a type files the form as it then is
 * (an empty token) over that entry first, so the old token is gone from the sheet, and Cancel restores the stored one. A file for another
 * server type also leaves the current address behind when it names none. A file that carries a token keeps it. `settings` is what the
 * sheet writes; nothing is stored here.
 */
export function importWithConnection(text, current = defaults()) {
  const merged = fromImport(text, current);
  const parsed = typeof text === 'string' ? JSON.parse(text) : text;
  const incoming = parsed?.settings && parsed.format !== undefined ? parsed.settings : parsed;
  const typeMoved = merged.serverType !== (current.serverType || 'plex');
  const urlMoved = !typeMoved && merged.serverUrl !== sanitize({ serverUrl: current.serverUrl }).serverUrl;
  const brought = typeof incoming.plexToken === 'string' || typeof incoming.PLEX_TOKEN === 'string';
  // The user id travels with its token (D149 2): the file's id counts only when the file brings its own token, and then it is the file's or none.
  const userId = brought && 'serverUserId' in incoming ? merged.serverUserId : brought ? '' : null;
  if (!typeMoved && !urlMoved) return { settings: { ...merged, serverUserId: userId ?? sanitize({ serverUserId: current.serverUserId }).serverUserId }, setAside: false };
  const named = 'serverUrl' in incoming || 'PLEX_SERVER_URL' in incoming;
  return {
    settings: { ...merged, plexToken: brought ? merged.plexToken : '', serverUrl: typeMoved && !named ? '' : merged.serverUrl, serverName: '', serverUserId: userId ?? '' },
    setAside: true,
  };
}


// ---- what a Save does to the servers (D156 3, D157 2, 3, 5, 6) ----

/**
 * `settings` with the ids in the selection that belong to `from` (the library keys and a collection or playlist, also inside profiles) moved to
 * `to`: another server's entry (scoped by its id) or the carried one (bare). Ids that belong to neither are left alone.
 */
function moveSelection(settings, from, to) {
  const move = (k) => (belongsTo(k, from) && (to.carried || to.id) ? keyFor(to, splitKey(k).key) : k); // a server with no id to scope by takes nothing: what was its predecessor's goes with it
  const fix = (o) => {
    const out = { ...o };
    if (Array.isArray(o.libraryKeys)) out.libraryKeys = o.libraryKeys.map((k) => move(String(k)));
    if (typeof o.libraryKey === 'string' && o.libraryKey) out.libraryKey = move(o.libraryKey);
    if (o.source && typeof o.source === 'object' && o.source.key) out.source = { ...o.source, key: move(String(o.source.key)) };
    return out;
  };
  const out = fix(settings);
  if (Array.isArray(settings.profiles)) out.profiles = settings.profiles.map((p) => (p && typeof p === 'object' ? fix(p) : p));
  return out;
}

const EARLY_CONNECTION = ['serverType', 'serverUrl', 'plexToken', 'serverUserId', 'serverName', 'serverId', 'serverCarried', 'servers']; // only the connection keys wait for the reads (D162 5)
const EARLY_SELECTION = ['libraryKey', 'libraryName', 'libraryKeys', 'libraryNames', 'genres', 'ratings', 'source'];
const EARLY_PIN = ['staticRatingKey', 'staticTitle'];
const EARLY_PROFILE_SELECTION = ['libraryKeys', 'libraryNames', 'genres', 'ratings', 'source']; // what a viewer profile draws from; its limit and the rest of its bundle do not wait
const takeFrom = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

/** Is a different server now first (D172 1)? Its type, its address as `addressOf` compares it, or its id (a Remove of the first server) differs from the first server's before the Save. */
function firstEntryChanged(prev, next) {
  const [a, b] = [serverList(prev)[0], serverList(next)[0]];
  return a.type !== b.type || a.url !== b.url || Boolean(a.id && b.id && a.id !== b.id);
}

/**
 * The settings shown while a Save reads who answers at a server (D162 5, D172, D173): every setting that is not a connection key applies
 * at once, the limit first, and the connection keys stay as they were until the reads answer. When the old settings are configured and the
 * first entry of the server list changes, the old selection (the libraries, genres, ratings and the collection or playlist) waits with the
 * connection, and so does the old pin, and so does what each viewer profile draws from, so no poster and no pin of the new selection is drawn from the old server (D165 1, 4; D174 1). A Save that unpins
 * applies the unpin at once (D173 1), except when the display would then read unconfigured (D176 1). The pin keeps its exemption from the household limit (D122 1), so nothing here hides it for the limit.
 * Nothing is stored here.
 */
export function earlySettings(prev, next) {
  let early = { ...next, ...takeFrom(prev, EARLY_CONNECTION) };
  if (!isConfigured(prev)) return early; // a first configure holds nothing
  if (firstEntryChanged(prev, next)) {
    early = { ...early, ...takeFrom(prev, EARLY_SELECTION), ...(next.staticRatingKey ? takeFrom(prev, EARLY_PIN) : {}) };
    // A viewer profile in force replaces the selection (R-PROF-1), so each profile keeps the selection it had before the Save (D174 1). Its limit and the
    // rest of its bundle, and the slots, apply at once (D162 5): a lowered limit must not wait. A profile that did not exist before the Save holds only
    // the new server's selection, so it is left out until the settle; a slot naming it gives G meanwhile (D120 2) and shows the held household selection.
    const old = new Map((Array.isArray(prev.profiles) ? prev.profiles : []).map((p) => [p?.id, p]));
    if (Array.isArray(early.profiles)) early.profiles = early.profiles.filter((p) => old.has(p?.id)).map((p) => ({ ...p, ...takeFrom(old.get(p.id), EARLY_PROFILE_SELECTION) }));
  }
  // D176 1, which extends D174 2 to every branch: while the reads run the display must stay configured. The old connection with a selection the sheet
  // cleared (the sign-in was set aside), or with a pin-only display unpinned in the same Save, reads as unconfigured and would open the first-run card
  // (and a plex.tv sign-in) for a server that is about to be replaced. The old selection and the old pin wait, then. This is the one place an unpin waits
  // for the settle (D173 1 stands everywhere else).
  if (!isConfigured(early)) early = { ...early, ...takeFrom(prev, [...EARLY_SELECTION, ...EARLY_PIN]) };
  return early;
}

/** Does the settings object hold any scoped id (the selection, a pin, a profile)? Then it already had more than one server's worth of ids (D162 1, D163 3). */
function holdsScopedId(s) {
  const keysOf = (o) => [...(Array.isArray(o?.libraryKeys) ? o.libraryKeys : []), o?.libraryKey, o?.source?.key];
  return [...keysOf(s), s?.staticRatingKey, ...(Array.isArray(s?.profiles) ? s.profiles.flatMap(keysOf) : [])].some((k) => splitKey(k).serverId);
}

/**
 * May the sign-in made for `basis` go to the server of `type` at `url`? The one rule Save (`settleServers`) and Test connection (the Settings
 * sheet) both follow (D157 3, D162 3, D163, D165 3). `basis` is the server the sign-in was made for, `{ type, url, token, id }` (the saved first
 * server, or the server Remove moved into its place). `readId(type, url)` asks who answers WITHOUT a token (see `settleServers`).
 *  - A token that is not `basis`'s (typed or pasted in the sheet, or made for the new server) belongs to the address it was made at: it may go.
 *  - The same type at the same address is the same server: it may go, and nothing is read. Save never takes this shortcut (`needsAnswer`): it has
 *    already found the address changed on the raw comparison, and `addressOf` is not idempotent (`"x /"` gives `"x "`), so the cleaned forms can
 *    be equal when the stored ones are not. Save then reads the id there, as it always has (D178 1).
 *  - Otherwise it may go only when the same type answers there with `basis`'s own id (`basis.id`, or the id read at `basis.url` when none was
 *    recorded). A change of type is always another server (D157 2).
 *  - Another server is told the token only when the caller says a change of type alone keeps it: `keepsTypeChange`, which Save sets for a household
 *    of one server (D163 2, Q5); the sheet never does.
 *  - `needsAnswer`: Save. It records the id read at `url` whatever the token and the type, so it is read even when the verdict does not need it.
 * Returns `{ go, same, answered }`: `same` is whether the server at `url` is `basis`'s, `answered` the id read there (null when nothing answered,
 * undefined when nothing was read). A verdict that needs no read is returned as it is, not as a promise; one that needs a read comes back as a
 * promise of it. The sheet relies on that: its Test connection goes on in the same turn when nothing is to be read, as it did before the rule was
 * shared, and the redraw it makes does not land after the scroll that Open settings in js/main.js makes right after the sheet opens.
 */
export function oldTokenMayGo({ basis, type, url, token, keepsTypeChange = false, needsAnswer = false }, readId) {
  const sameType = type === basis.type;
  if (!needsAnswer && sameType && addressOf(url) === addressOf(basis.url)) return { go: true, same: true, answered: undefined };
  const holds = Boolean(token) && token === basis.token;
  if (!holds && !needsAnswer) return { go: true, same: false, answered: undefined };
  const verdict = (answered, recorded) => {
    const same = Boolean(recorded) && answered === recorded; // `recorded` is null after a change of type: always another server (D157 2)
    return { go: same || !holds || (!sameType && keepsTypeChange), same, answered };
  };
  const readsNew = needsAnswer || sameType;
  const readsOld = sameType && !basis.id;
  if (!readsNew && !readsOld) return verdict(undefined, sameType ? basis.id : null);
  return Promise.all([readsNew ? readId(type, url) : undefined, sameType ? basis.id || readId(type, basis.url) : null]).then(([answered, recorded]) => verdict(answered, recorded));
}

/**
 * The servers as a Save stores them. `readId(type, url)` asks who answers at an address WITHOUT a token and resolves to the server's own id,
 * or null when nothing answers or the reply holds no usable id (the adapters' `publicIdentity`). Returns `{ next, notes, removed, gone, promoted, sameRecorded }`; nothing is stored here.
 *  - The first server's address changes (D156 3, D157 2, 3): its id is read at the new address before the old token goes there. The same id as
 *    the recorded one keeps the server's entries, the pin and the token. A different id, or none, makes it another server: its token is set
 *    aside (the household signs in) and its entries go (the caller clears what `removedServers` names). A change of type is always another server.
 *    An entry whose id was never recorded (a 2.4.0 object) is compared with the id read at its old address; when they match it is the same
 *    server (the pin still goes, as in 2.4.0, D147 2, and the cache and the history stay), and when they do not, or one cannot be read, it is another.
 *  - Another server in the first place is the carried entry when it is alone (what was bare was cleared, so bare ids mean it), and is told apart
 *    by its id when there are others: its ids move to it. With no id read it contributes nothing until a Save reads one.
 *  - A server added or changed in the list is kept only when it answers with the id it carries (D157 6); the first server's id is recorded the
 *    first time a second server is added, so a duplicate is found.
 */
export async function settleServers(prev, next, readId) {
  const notes = [];
  let out = { ...next };
  const type = out.serverType || 'plex';
  const address = addressOf(out.serverUrl);
  const prior = serverList(prev);
  const before = prior[0];
  // A Save that changes nothing about any server asks no server anything. It still reads the first server's id while that id is unknown and
  // there are other servers: that read is what removes a duplicate added while the first server was down (D162 7).
  const sig = (list) => JSON.stringify(list.map(({ id, carried, type: t, url, token, userId }) => [id, carried, t, url, token, userId]));
  if (sig(prior) === sig(serverList(out)) && (before.id || !out.servers.length)) return { next: out, notes, removed: [], gone: [], promoted: false, sameRecorded: false };
  // A server whose id is one of the entries of `servers` is that server moved into the first place (the first server was removed), whatever
  // its address now is: it is never carried and keeps its scoped ids (D162 1), and its token stays only at the address it was checked at
  // (D162 3, D157 3). The comparison for an address or type change is with that entry, not with the old first server, which is always removed.
  const promotedFrom = out.serverId ? prior.slice(1).find((e) => e.id === out.serverId) : undefined;
  const base = promotedFrom || before;
  const typeChanged = base.type !== type;
  const urlChanged = base.url !== address;
  let another = null; // set when the first server is now another server: { id }
  let freshToken = false; // the token at Save is a sign-in made for the new server, not the old first server's
  // More than one server before this Save (D163 3): `servers` is not empty, or any scoped id is stored.
  const multi = prior.length > 1 || holdsScopedId(prev);
  // A first connection (the first server had no address) has nothing to compare with and nothing to clear: no read is made.
  if (address && base.url && (typeChanged || urlChanged)) {
    // The old token was made for another server: it goes whatever changed, the type included, in a household with more than one server
    // (D163 3). A one-server household that changes only the type keeps the 2.4.0 behaviour (D163 2, Q5; tests/e2e/jellyfin.spec.mjs 13b).
    const { go, same, answered } = await oldTokenMayGo({ basis: base, type, url: address, token: out.plexToken, keepsTypeChange: !multi, needsAnswer: true }, readId);
    if (same) out.serverId = answered;
    else {
      another = { id: answered || '' };
      // A sign-in the sheet made for the new server differs from the old first server's token; one that is the same is the old server's.
      freshToken = Boolean(out.plexToken) && out.plexToken !== base.token;
      if (!go) Object.assign(out, { plexToken: '', serverUserId: '', serverName: '' });
    }
  } else if (address && !out.serverCarried && !out.serverId) {
    out.serverId = (await readId(type, address)) || '';
  }
  if (out.servers.length && address && !another && !out.serverId) out.serverId = (await readId(type, address)) || '';
  if (promotedFrom && !another) out.serverCarried = false;
  const own = another ? another.id : out.serverId;
  const kept = [];
  for (const e of out.servers) {
    const was = (prev.servers || []).find((p) => p.id === e.id);
    const unchanged = was && was.type === e.type && addressOf(was.url) === e.url;
    if (own && e.id === own) notes.push(`${e.name || e.url} is the same server as your first one, so it was not added.`);
    else if (unchanged) kept.push(e);
    else if ((!was || was.type === e.type) && (await readId(e.type, e.url)) === e.id) kept.push(e);
    else notes.push(`${e.name || e.url} did not answer as the server it was added as, so it was not kept.`);
  }
  out.servers = kept;
  if (another) {
    // A promoted server that turns out to be another server is never carried: the bare ids were the removed first server's and go with it.
    const now = { id: another.id, carried: !promotedFrom && (kept.length === 0 || !another.id) };
    // More than one server before this Save (D163 3): the first server's keys leave every profile and none moves onto the new server (D163 1);
    // the main selection moves, as the sheet holds the household's own choice from the new address. One server keeps the 2.4.0 behaviour: the
    // profiles keep their ids as stored (D163 2).
    const profiles = out.profiles;
    // The main selection follows the new server only when the household signed in to it in this sheet (a fresh token). A retype saved with the old
    // token, never signed in, leaves the old first server's keys in the main selection too: they go (D163 1).
    out = multi && !freshToken ? withoutServers(out, [before, base]) : moveSelection(out, base, now);
    if (multi) out.profiles = withoutServers({ profiles }, [before, base]).profiles;
    Object.assign(out, { serverId: another.id, serverCarried: now.carried });
  }
  // `removed`: servers no longer in the list, whose library keys, collection and pin go with them. `gone` adds the first server when it was
  // replaced in its place: its cache entries and history go too, and the keys the sheet holds are the new server's own. `sameRecorded`: the
  // address changed to one whose server id is the recorded one, so the pin stays (D156 3).
  const removed = removedServers(prior, serverList(out));
  const gone = (another || promotedFrom) && !removed.includes(before) ? [before, ...removed] : removed;
  return { next: out, notes, removed, gone, promoted: Boolean(promotedFrom) && !another, sameRecorded: urlChanged && !typeChanged && !another && Boolean(base.id) && !promotedFrom };
}
