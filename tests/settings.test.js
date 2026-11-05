import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, earlySettings, fromImport, importWithConnection, isConfigured, LOCAL_KEYS, load, MAX_SERVERS, removedServers, sanitize, save, SECRET_KEYS, serverList, settleServers, STORAGE_KEY, toExport, withoutSecrets, withoutServers } from '../js/settings.js';

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

test('sanitize fills defaults, clamps numbers and drops unknown keys', () => {
  const s = sanitize({ rotateSeconds: 1, posterScale: 'abc', rotation: 45, serverUrl: 'http://x:32400///', bogus: 1 });
  assert.equal(s.rotateSeconds, 10);
  assert.equal(s.posterScale, defaults().posterScale);
  assert.equal(s.rotation, 0);
  assert.equal(s.serverUrl, 'http://x:32400');
  assert.equal('bogus' in s, false);
});

test('booleans accept string forms', () => {
  assert.equal(sanitize({ showNowPlaying: 'false' }).showNowPlaying, false);
  assert.equal(sanitize({ showNowPlaying: 'nope' }).showNowPlaying, true);
});

test('isConfigured needs token, server and a library or pinned item', () => {
  assert.equal(isConfigured(defaults()), false);
  assert.equal(isConfigured({ ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1' }), true);
  assert.equal(isConfigured({ ...defaults(), plexToken: 't', serverUrl: 'http://s', staticRatingKey: '9' }), true);
});

test('load migrates the original per-key localStorage format', () => {
  const storage = memoryStorage({
    PLEX_TOKEN: 'tok',
    PLEX_SERVER_URL: 'http://192.168.1.2:32400',
    PLEX_USERNAME: 'nate',
    LIBRARY_KEY: '1',
    REFRESH_INTERVAL_MS: '120000',
    POSTER_SCALE: '90',
  });
  const { settings, source } = load(storage);
  assert.equal(source, 'legacy');
  assert.equal(settings.plexToken, 'tok');
  assert.equal(settings.username, 'nate');
  assert.equal(settings.rotateSeconds, 120);
  assert.equal(settings.posterScale, 100);
  assert.deepEqual(storage.keys(), [STORAGE_KEY]);
});

test('load survives corrupt JSON', () => {
  const { settings, source } = load(memoryStorage({ [STORAGE_KEY]: '{oops' }));
  assert.equal(source, 'defaults');
  assert.deepEqual(settings, defaults());
});

test('save + load round-trips', () => {
  const storage = memoryStorage();
  save(storage, { ...defaults(), plexToken: 'abc', rotation: 90 });
  const { settings } = load(storage);
  assert.equal(settings.plexToken, 'abc');
  assert.equal(settings.rotation, 90);
});

test('export omits the token unless asked', () => {
  const s = { ...defaults(), plexToken: 'secret' };
  assert.equal('plexToken' in toExport(s).settings, false);
  assert.equal(toExport(s, { includeSecrets: true }).settings.plexToken, 'secret');
});

test('import merges over current settings and keeps the existing token', () => {
  const current = { ...defaults(), plexToken: 'keep' };
  const file = JSON.stringify(toExport({ ...defaults(), rotation: 180, rotateSeconds: 60 }));
  const s = fromImport(file, current);
  assert.equal(s.plexToken, 'keep');
  assert.equal(s.rotation, 180);
  assert.equal(s.rotateSeconds, 60);
});

test('import accepts a bare object and the old CONFIG shape', () => {
  const s = fromImport({ PLEX_TOKEN: 't', PLEX_SERVER_URL: 'http://s:32400', LIBRARY_KEY: '3', REFRESH_INTERVAL_MS: 300000 });
  assert.equal(s.plexToken, 't');
  assert.equal(s.libraryKey, '3');
  assert.equal(s.rotateSeconds, 300);
});

test('import rejects bad files with a readable message', () => {
  assert.throws(() => fromImport('not json'), /not valid JSON/);
  assert.throws(() => fromImport('[]'), /JSON object/);
  assert.throws(() => fromImport('{"format":"other"}'), /Unknown file format/);
  assert.throws(() => fromImport('{"hello":1}'), /No recognised settings/);
  assert.throws(() => fromImport(JSON.stringify({ format: 'plex-poster-display/settings', version: 99, settings: {} })), /newer version/);
});

// ---- settings-and-schedule-core: new keys ----

import { NEVER_EXPORT_KEYS, EXPORT_VERSION } from '../js/settings.js';

const NEW_DEFAULTS = {
  rotateUi: true, statusIndicator: 'dot', posterCacheLimit: 100, maxContentRating: '', limitNowPlaying: true,
  sleepEnabled: false, sleepStart: '01:00', sleepEnd: '07:00', idleSleepHours: 0, wakeOnPlayback: true,
  pixelShift: true, pixelShiftMinutes: 3, frameBrightness: 100, nightDim: false, nightDimStart: '22:00',
  nightDimEnd: '07:00', nightDimLevel: 60, nightDimTarget: 'frame', dailyReload: true, dailyReloadTime: '04:00',
  kioskMode: false, disableShortcuts: false, settingsPinHash: '', settingsPinSalt: '', deviceHelper: false,
  controlLabels: 'auto', limitSlots: [], showMeta: false, showProgress: true, showPlayer: false, fillMode: 'none', gapFill: 'none',
};

test('defaults table for the new keys', () => {
  const d = defaults();
  for (const [k, v] of Object.entries(NEW_DEFAULTS)) assert.deepEqual(d[k], v, k);
});

test('deferred keys do not exist', () => {
  const d = defaults();
  for (const k of ['bulbAnimation', 'frameRotation', 'frameRotationIds', 'frameIdRandom', 'fillCount']) assert.equal(k in d, false, k);
  assert.equal(sanitize({ fillMode: 'multi' }).fillMode, 'none');
});

test('hhmm sanitiser accepts HH:MM and falls back otherwise', () => {
  assert.equal(sanitize({ sleepStart: '00:00' }).sleepStart, '00:00');
  assert.equal(sanitize({ sleepStart: '23:59' }).sleepStart, '23:59');
  for (const bad of ['24:00', '12:60', '7:00', '0700', 'ab:cd', '', 5, true, '12:00:00', ' 1:00']) {
    assert.equal(sanitize({ sleepStart: bad }).sleepStart, '01:00', String(bad));
    assert.equal(sanitize({ nightDimEnd: bad }).nightDimEnd, '07:00', String(bad));
    assert.equal(sanitize({ dailyReloadTime: bad }).dailyReloadTime, '04:00', String(bad));
  }
});

test('hhmm sanitiser pins each boundary case for every HH:MM key', () => {
  for (const [bad, name] of [['24:00', '24:00'], ['9:00', '9:00'], ['09:60', '09:60'], ['', 'empty'], [null, 'null'], [900, 'number']]) {
    assert.equal(sanitize({ dailyReloadTime: bad }).dailyReloadTime, '04:00', name);
  }
  assert.equal(sanitize({ dailyReloadTime: '00:00' }).dailyReloadTime, '00:00');
  assert.equal(sanitize({ dailyReloadTime: '23:59' }).dailyReloadTime, '23:59');
});

test('numeric ranges clamp finite numbers; junk falls back to the default; counts round', () => {
  assert.equal(sanitize({ posterCacheLimit: 1 }).posterCacheLimit, 10);
  assert.equal(sanitize({ posterCacheLimit: 9999 }).posterCacheLimit, 300);
  assert.equal(sanitize({ idleSleepHours: 99 }).idleSleepHours, 48);
  assert.equal(sanitize({ idleSleepHours: -1 }).idleSleepHours, 0);
  assert.equal(sanitize({ pixelShiftMinutes: 0 }).pixelShiftMinutes, 1);
  assert.equal(sanitize({ pixelShiftMinutes: 500 }).pixelShiftMinutes, 60);
  assert.equal(sanitize({ frameBrightness: 0 }).frameBrightness, 10);
  assert.equal(sanitize({ nightDimLevel: 1000 }).nightDimLevel, 100);
  assert.equal(sanitize({ nightDimLevel: 'x' }).nightDimLevel, 60);
  // numeric strings (form fields) are accepted
  assert.equal(sanitize({ posterCacheLimit: '50' }).posterCacheLimit, 50);
  // junk -> default, not the minimum
  for (const junk of ['', '  ', true, false, [], [5], {}, 'abc', NaN, Infinity, -Infinity]) {
    const s = sanitize({ posterCacheLimit: junk, idleSleepHours: junk, pixelShiftMinutes: junk, frameBrightness: junk, nightDimLevel: junk });
    assert.equal(s.posterCacheLimit, 100, `posterCacheLimit ${String(junk)}`);
    assert.equal(s.idleSleepHours, 0, `idleSleepHours ${String(junk)}`);
    assert.equal(s.pixelShiftMinutes, 3, `pixelShiftMinutes ${String(junk)}`);
    assert.equal(s.frameBrightness, 100, `frameBrightness ${String(junk)}`);
    assert.equal(s.nightDimLevel, 60, `nightDimLevel ${String(junk)}`);
  }
  // count keys round to integers
  assert.equal(sanitize({ posterCacheLimit: 10.5 }).posterCacheLimit, 11);
  assert.equal(sanitize({ posterCacheLimit: '99.4' }).posterCacheLimit, 99);
  assert.equal(sanitize({ idleSleepHours: 2.6 }).idleSleepHours, 3);
  assert.equal(sanitize({ pixelShiftMinutes: 2.2 }).pixelShiftMinutes, 2);
  // existing 2.0 keys keep their clamping behaviour
  assert.equal(sanitize({ rotateSeconds: 1 }).rotateSeconds, 10);
});

test('enumerations fall back to the default', () => {
  assert.equal(sanitize({ statusIndicator: 'text' }).statusIndicator, 'dot');
  assert.equal(sanitize({ statusIndicator: 'off' }).statusIndicator, 'off');
  for (const r of ['', 'G', 'PG', 'PG-13', 'R', 'NC-17']) assert.equal(sanitize({ maxContentRating: r }).maxContentRating, r);
  // K21 (D31): an unknown limit fails closed to PG-13, never to "no limit"; absent or null still means no limit.
  for (const junk of ['X', 'PG13', 'pg13', 'pg-13', 'R18', ' R ', 'NC17', 5, true, {}, []]) {
    assert.equal(sanitize({ maxContentRating: junk }).maxContentRating, 'PG-13', `maxContentRating ${JSON.stringify(junk)}`);
  }
  assert.equal(sanitize({}).maxContentRating, '');
  assert.equal(sanitize({ maxContentRating: null }).maxContentRating, '');
  assert.equal(sanitize({ maxContentRating: undefined }).maxContentRating, '');
  assert.equal(defaults().maxContentRating, '');
  assert.equal(sanitize({ nightDimTarget: 'stage' }).nightDimTarget, 'stage');
  assert.equal(sanitize({ nightDimTarget: 'x' }).nightDimTarget, 'frame');
  for (const c of ['auto', 'always', 'never']) assert.equal(sanitize({ controlLabels: c }).controlLabels, c);
  assert.equal(sanitize({ controlLabels: 'x' }).controlLabels, 'auto');
  for (const f of ['none', 'blur', 'info']) assert.equal(sanitize({ fillMode: f }).fillMode, f);
});

test('PIN material sanitiser accepts hex only', () => {
  assert.equal(sanitize({ settingsPinHash: 'ab12' }).settingsPinHash, 'ab12');
  assert.equal(sanitize({ settingsPinHash: 'zz' }).settingsPinHash, '');
  assert.equal(sanitize({ settingsPinSalt: 5 }).settingsPinSalt, '');
});

test('NEVER_EXPORT_KEYS is exactly the two PIN keys and export drops them', () => {
  assert.deepEqual(NEVER_EXPORT_KEYS, ['settingsPinHash', 'settingsPinSalt']);
  const s = { ...defaults(), plexToken: 't', settingsPinHash: 'a'.repeat(64), settingsPinSalt: 'bb' };
  for (const opts of [undefined, { includeSecrets: true }]) {
    const o = toExport(s, opts).settings;
    for (const k of NEVER_EXPORT_KEYS) assert.equal(k in o, false, k);
  }
  assert.equal(toExport(s, { includeSecrets: true }).settings.plexToken, 't');
  assert.equal(EXPORT_VERSION, 1);
});

test('import cannot plant or clear a PIN', () => {
  const file = JSON.stringify({ format: 'plex-poster-display/settings', version: 1, settings: { settingsPinHash: 'a'.repeat(64), settingsPinSalt: 'b', rotateSeconds: 60 } });
  const s = fromImport(file);
  assert.equal(s.settingsPinHash, '');
  assert.equal(s.settingsPinSalt, '');
  assert.equal(s.rotateSeconds, 60);
  assert.equal(s.pixelShift, true);
  const kept = fromImport(file, { ...defaults(), settingsPinHash: 'cc', settingsPinSalt: 'dd' });
  assert.equal(kept.settingsPinHash, 'cc');
  assert.equal(kept.settingsPinSalt, 'dd');
  // only PIN keys in the file: nothing recognised
  assert.throws(() => fromImport({ settingsPinHash: 'aa' }), /No recognised settings/);
});

test('a 2.0.0 export imports with the new keys at their defaults', () => {
  const old = { format: 'plex-poster-display/settings', version: 1, settings: { rotateSeconds: 90, rotation: 180 } };
  const s = fromImport(JSON.stringify(old));
  assert.equal(s.rotation, 180);
  for (const [k, v] of Object.entries(NEW_DEFAULTS)) assert.deepEqual(s[k], v, k);
});

test('stored 2.0.0 settings load with new keys filled', () => {
  const { settings } = load(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ rotateSeconds: 60 }) }));
  assert.equal(settings.rotateSeconds, 60);
  assert.equal(settings.pixelShift, true);
});

test('gapFill: default none; none, blur and matte are kept, anything else falls back to none', () => {
  assert.equal(defaults().gapFill, 'none');
  for (const v of ['none', 'blur', 'matte']) assert.equal(sanitize({ gapFill: v }).gapFill, v);
  for (const bad of ['info', 'BLUR', '', null, 7, true, undefined]) assert.equal(sanitize({ gapFill: bad }).gapFill, 'none', String(bad));
});

test('gapFill migrates: stored settings without it load as none; one saved with it round-trips; imports and exports carry it', () => {
  const old = load(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ rotateSeconds: 60 }) })).settings;
  assert.equal(old.gapFill, 'none');
  const storage = memoryStorage();
  save(storage, { ...defaults(), gapFill: 'matte' });
  assert.equal(load(storage).settings.gapFill, 'matte');
  const exported = toExport({ ...defaults(), gapFill: 'blur' });
  assert.equal(exported.settings.gapFill, 'blur');
  assert.equal(fromImport(JSON.stringify(exported)).gapFill, 'blur');
  const bad = { format: 'plex-poster-display/settings', version: 1, settings: { rotateSeconds: 60, gapFill: 'sepia' } };
  assert.equal(fromImport(JSON.stringify(bad)).gapFill, 'none');
});

// ---- R-FILT-2 (D101): the time slots ----

test('limitSlots survives save and load, an export and an import', () => {
  const slots = [{ start: '06:00', limit: 'G' }, { start: '15:00', limit: 'PG-13', days: [1, 2, 3, 4, 5] }, { start: '22:00', limit: '' }];
  const storage = memoryStorage();
  save(storage, { ...defaults(), maxContentRating: 'PG-13', limitSlots: slots });
  assert.deepEqual(load(storage).settings.limitSlots, slots);
  const file = toExport({ ...defaults(), limitSlots: slots });
  assert.deepEqual(file.settings.limitSlots, slots);
  assert.deepEqual(fromImport(JSON.stringify(file), defaults()).limitSlots, slots);
});

test('limitSlots from storage written before 2.3 (no key) is no slots, which changes nothing', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ maxContentRating: 'PG' }) });
  const s = load(storage).settings;
  assert.deepEqual(s.limitSlots, []);
  assert.equal(s.maxContentRating, 'PG');
});

test('limitSlots from a hand-edited or corrupt file fails closed through the sanitiser', () => {
  const bad = (limitSlots) => fromImport({ limitSlots }, defaults()).limitSlots;
  assert.deepEqual(bad('06:00'), [{ start: '00:00', limit: 'G' }], 'not a list: the strictest limit all day');
  assert.deepEqual(bad([{ start: '06:00', limit: 'bogus' }]), [{ start: '06:00', limit: 'G' }], 'unknown limit -> G');
  assert.deepEqual(bad([{ start: '06:00', limit: 'R' }, { start: '25:00', limit: '' }]), [{ start: '00:00', limit: 'G' }], 'an unreadable time: the whole schedule is G all day, no slot dropped');
  assert.deepEqual(bad(Array.from({ length: 20 }, (_, i) => ({ start: `${String(i).padStart(2, '0')}:00`, limit: 'PG' }))), [{ start: '00:00', limit: 'G' }], 'more than 8 slots: G all day');
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ maxContentRating: 'R', limitSlots: { start: '06:00' } }) });
  assert.deepEqual(load(storage).settings.limitSlots, [{ start: '00:00', limit: 'G' }]);
});

test('limitSlots: the default list is not shared between callers', () => {
  const a = defaults();
  a.limitSlots.push({ start: '06:00', limit: 'G' });
  assert.deepEqual(defaults().limitSlots, []);
  const b = sanitize({});
  b.limitSlots.push({ start: '06:00', limit: 'G' });
  assert.deepEqual(sanitize({}).limitSlots, []);
});

// ---- the poster selection (R-SEL-1, D107) ----

import { selectionOf } from '../js/selection.js';

test('the selection keys default to nothing chosen', () => {
  const d = defaults();
  assert.deepEqual([d.libraryKeys, d.libraryNames, d.genres, d.ratings, d.source], [[], [], [], [], null]);
});

test('settings saved before 2.3 with only libraryKey load as that one library and nothing else changes', () => {
  const storage = memoryStorage({ 'plexPoster.settings': JSON.stringify({ plexToken: 't', serverUrl: 'http://s', libraryKey: '1', libraryName: 'Movies', maxContentRating: 'PG' }) });
  const { settings, source } = load(storage);
  assert.equal(source, 'storage');
  assert.deepEqual([settings.libraryKeys, settings.libraryNames, settings.libraryKey, settings.libraryName], [['1'], ['Movies'], '1', 'Movies']);
  assert.deepEqual([settings.genres, settings.ratings, settings.source], [[], [], null]);
  const before = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1', libraryName: 'Movies', maxContentRating: 'PG' };
  for (const k of Object.keys(before)) if (!['libraryKeys', 'libraryNames'].includes(k)) assert.deepEqual(settings[k], before[k], `${k} unchanged`);
  assert.deepEqual(selectionOf(settings), { libraries: [{ key: '1', name: 'Movies' }], genres: [], ratings: [], source: null });
});

test('a library list sets libraryKey and libraryName to its first library, and the names line up with the keys', () => {
  const s = sanitize({ libraryKeys: ['3', '1'], libraryNames: ['Kids Movies', 'Movies'], libraryKey: '9', libraryName: 'Old' });
  assert.deepEqual([s.libraryKey, s.libraryName], ['3', 'Kids Movies']);
  assert.deepEqual(sanitize({ libraryKeys: ['1', '3'], libraryNames: ['A'] }).libraryNames, ['A', '']);
  assert.deepEqual(sanitize({ libraryKeys: ['1'], libraryNames: ['A', 'B', 'C'] }).libraryNames, ['A']);
  const unnamed = sanitize({ libraryKeys: ['1'], libraryName: 'Movies' });
  assert.equal(unnamed.libraryName, 'Movies', 'a first library with no recorded name keeps the stored name');
  assert.deepEqual(sanitize({ libraryKeys: ['', ' '] }).libraryKeys, []);
});

test('an empty library list leaves libraryKey alone (that is a 2.2 file)', () => {
  const s = sanitize({ libraryKeys: [], libraryKey: '4', libraryName: 'Four' });
  assert.deepEqual([s.libraryKeys, s.libraryNames, s.libraryKey], [['4'], ['Four'], '4']);
});

test('genres, ratings and a source survive save and load, an export and an import', () => {
  const chosen = {
    libraryKeys: ['1', '3'], libraryNames: ['Movies', 'Kids Movies'],
    genres: [{ key: '12', title: 'Comedy' }], ratings: ['G', 'PG'], source: { kind: 'collection', key: '102', title: 'Top Rated' },
  };
  const storage = memoryStorage();
  save(storage, { ...defaults(), ...chosen });
  const back = load(storage).settings;
  for (const [k, v] of Object.entries(chosen)) assert.deepEqual(back[k], v, k);
  const file = toExport({ ...defaults(), ...chosen });
  for (const [k, v] of Object.entries(chosen)) assert.deepEqual(file.settings[k], v, `export ${k}`);
  const imported = fromImport(JSON.stringify(file), defaults());
  for (const [k, v] of Object.entries(chosen)) assert.deepEqual(imported[k], v, `import ${k}`);
});

test('junk in the selection keys is nothing chosen', () => {
  const s = sanitize({ libraryKeys: 'x', libraryNames: 4, genres: 'Comedy', ratings: ['XX', 3], source: { kind: 'album', key: '1' } });
  assert.deepEqual([s.libraryKeys, s.libraryNames, s.genres, s.ratings, s.source], [[], [], [], [], null]);
  assert.deepEqual(sanitize({ ratings: ['R', 'G', 'G'] }).ratings, ['G', 'R']);
});

test('a hand-written 2.2 file that sets libraryKey replaces a chosen library list instead of being overruled by it', () => {
  const current = sanitize({ ...defaults(), libraryKeys: ['1', '3'], libraryNames: ['Movies', 'Kids Movies'] });
  const s = fromImport(JSON.stringify({ libraryKey: '3' }), current);
  assert.deepEqual([s.libraryKey, s.libraryKeys], ['3', ['3']]);
  const both = fromImport(JSON.stringify({ libraryKey: '9', libraryKeys: ['1'] }), current);
  assert.deepEqual(both.libraryKeys, ['1'], 'a file that sends the list is the list');
  const other = fromImport(JSON.stringify({ rotateSeconds: 60 }), current);
  assert.deepEqual(other.libraryKeys, ['1', '3'], 'a file that says nothing about the library leaves it');
});

test('library names with no library are dropped, and a stale libraryName never labels another library', () => {
  assert.deepEqual(sanitize({ libraryNames: ['Orphan'] }).libraryNames, []);
  const s = sanitize({ libraryKey: '9', libraryName: 'Old nine', libraryKeys: ['1'] });
  assert.deepEqual([s.libraryKey, s.libraryName, s.libraryNames], ['1', '', ['']]);
});

test('r2 gap 3: a 2.2 file that sets only libraryKey replaces the whole selection: that library, no genres, no rating subset, no source', () => {
  const current = sanitize({
    ...defaults(), libraryKeys: ['1', '3'], libraryNames: ['Movies', 'Kids Movies'], genres: [{ key: '12', title: 'Comedy' }], ratings: ['G'], source: { kind: 'collection', key: '102', title: 'Top Rated' },
  });
  const s = fromImport(JSON.stringify({ libraryKey: '3', libraryName: 'Kids Movies' }), current);
  assert.deepEqual([s.libraryKey, s.libraryKeys, s.libraryNames, s.genres, s.ratings, s.source], ['3', ['3'], ['Kids Movies'], [], [], null]);
  // The legacy per-key shape is a 2.2 file too.
  const legacy = fromImport(JSON.stringify({ LIBRARY_KEY: '1' }), current);
  assert.deepEqual([legacy.libraryKeys, legacy.genres, legacy.ratings, legacy.source], [['1'], [], [], null]);
  // A file that sends any selection key keeps what it does not send, and one that says nothing about the library changes nothing.
  assert.deepEqual(fromImport(JSON.stringify({ libraryKey: '3', genres: [{ key: '', title: 'Drama' }] }), current).genres, [{ key: '', title: 'Drama' }]);
  const other = fromImport(JSON.stringify({ rotateSeconds: 60 }), current);
  assert.deepEqual([other.genres, other.ratings, other.source.key], [[{ key: '12', title: 'Comedy' }], ['G'], '102']);
});

test('r2 gap 7: a collection or playlist is enough to be configured, a library or a pin is not needed', () => {
  const base = { ...defaults(), plexToken: 't', serverUrl: 'http://s' };
  assert.equal(isConfigured({ ...base, source: { kind: 'collection', key: '102', title: 'Top Rated' } }), true);
  assert.equal(isConfigured(sanitize({ ...base, source: { kind: 'playlist', key: '201' } })), true);
  assert.equal(isConfigured({ ...base, source: null }), false);
  assert.equal(isConfigured({ ...base, source: { kind: 'collection', key: '' } }), false, 'no key: not a source');
  assert.equal(isConfigured({ plexToken: '', serverUrl: 'http://s', source: { kind: 'collection', key: '1' } }), false, 'still needs the connection');
});

// ---- weighting and the no-repeat window (R-SEL-2, D113) ----

test('weighting defaults to off and the no-repeat window to 0 days, and a 2.2 object loads with exactly those', () => {
  const d = defaults();
  assert.equal(d.weighting, 'off');
  assert.equal(d.noRepeatDays, 0);
  const old = sanitize({ plexToken: 't', serverUrl: 'http://x', libraryKey: '1' });
  assert.equal(old.weighting, 'off');
  assert.equal(old.noRepeatDays, 0);
});

test('weighting is one of off / unwatched / rated; anything else is off', () => {
  for (const v of ['off', 'unwatched', 'rated']) assert.equal(sanitize({ weighting: v }).weighting, v);
  for (const v of ['Rated', 'on', '', 3, true, ['rated'], {}]) assert.equal(sanitize({ weighting: v }).weighting, 'off', JSON.stringify(v));
});

test('the no-repeat window is whole days, clamped to 0 to 30; junk is 0', () => {
  assert.equal(sanitize({ noRepeatDays: 3 }).noRepeatDays, 3);
  assert.equal(sanitize({ noRepeatDays: '14' }).noRepeatDays, 14);
  assert.equal(sanitize({ noRepeatDays: 2.5 }).noRepeatDays, 3);
  assert.equal(sanitize({ noRepeatDays: -1 }).noRepeatDays, 0);
  assert.equal(sanitize({ noRepeatDays: 99 }).noRepeatDays, 30);
  for (const v of ['', 'soon', true, [], {}, NaN]) assert.equal(sanitize({ noRepeatDays: v }).noRepeatDays, 0, JSON.stringify(v));
});

test('the two keys are saved, loaded, exported and imported with the other settings; the shown record is not a setting', () => {
  const storage = memoryStorage();
  save(storage, { ...defaults(), weighting: 'rated', noRepeatDays: 7 });
  const { settings } = load(storage);
  assert.deepEqual([settings.weighting, settings.noRepeatDays], ['rated', 7]);
  const exported = toExport(settings);
  assert.deepEqual([exported.settings.weighting, exported.settings.noRepeatDays], ['rated', 7]);
  const back = fromImport(JSON.stringify(exported), defaults());
  assert.deepEqual([back.weighting, back.noRepeatDays], ['rated', 7]);
  assert.ok(!/shownAt/.test(JSON.stringify(exported)), 'the last-shown record is never exported');
  assert.ok(!Object.keys(settings).some((k) => /shownAt|history/i.test(k)));
});

// ---- serverType and the access token (D134, D139 1, D141 2, 8) ----

test('serverType: plex and jellyfin are kept, a missing or blank one is plex, an unknown one is kept (never turned into Plex)', () => {
  assert.equal(defaults().serverType, 'plex');
  assert.equal(sanitize({ serverType: 'jellyfin' }).serverType, 'jellyfin');
  assert.equal(sanitize({ serverType: ' jellyfin ' }).serverType, 'jellyfin');
  assert.equal(sanitize({}).serverType, 'plex');
  for (const blank of ['', '   ', null, undefined, 3, false, {}]) assert.equal(sanitize({ serverType: blank }).serverType, 'plex', String(blank));
  assert.equal(sanitize({ serverType: 'emby' }).serverType, 'emby');
  assert.equal(sanitize({ serverType: 'x'.repeat(100) }).serverType.length, 40);
});

test('an object saved by 2.3.1, with no serverType, loads as plex and is not a switch', () => {
  const stored = { ...defaults(), plexToken: 't', serverUrl: 'http://s', libraryKey: '1' };
  delete stored.serverType;
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(stored) });
  const { settings } = load(storage);
  assert.equal(settings.serverType, 'plex');
  assert.equal(settings.serverType, defaults().serverType);
  assert.equal(isConfigured(settings), true);
});

test('the access token is a secret: never exported without the secrets option; the password and the device id are no setting at all', () => {
  assert.ok(SECRET_KEYS.includes('plexToken'));
  const s = { ...defaults(), serverType: 'jellyfin', plexToken: 'jf-secret', serverUrl: 'http://jf:8096' };
  const plain = toExport(s);
  assert.equal(JSON.stringify(plain).includes('jf-secret'), false);
  assert.equal(plain.settings.serverType, 'jellyfin');
  assert.equal(toExport(s, { includeSecrets: true }).settings.plexToken, 'jf-secret');
  const keys = Object.keys(defaults());
  assert.deepEqual(keys.filter((k) => /pass|pw|secret|deviceId|clientId/i.test(k)), []);
  assert.equal(JSON.stringify(save(memoryStorage(), { ...s, password: 'hunter2', Pw: 'hunter2', deviceId: 'd' })).includes('hunter2'), false);
});

test('a Jellyfin export imports back as Jellyfin, and a file with an unknown type keeps it', () => {
  const back = fromImport(JSON.stringify(toExport({ ...defaults(), serverType: 'jellyfin', serverUrl: 'http://jf:8096' })));
  assert.equal(back.serverType, 'jellyfin');
  assert.equal(fromImport(JSON.stringify({ serverType: 'emby', serverUrl: 'http://e' })).serverType, 'emby');
});

test('an import that names a connection but no server type is a Plex file; one that names none leaves the type alone (D142 2)', () => {
  const onJellyfin = { ...defaults(), serverType: 'jellyfin', serverUrl: 'http://jf:8096', plexToken: 'jf-secret' };
  assert.equal(fromImport(JSON.stringify({ serverUrl: 'http://plex:32400', libraryKey: '1' }), onJellyfin).serverType, 'plex');
  assert.equal(fromImport(JSON.stringify({ PLEX_SERVER_URL: 'http://plex:32400' }), onJellyfin).serverType, 'plex');
  assert.equal(fromImport(JSON.stringify({ rotation: 90 }), onJellyfin).serverType, 'jellyfin');
  assert.equal(fromImport(JSON.stringify({ serverType: 'jellyfin', serverUrl: 'http://x' }), { ...defaults() }).serverType, 'jellyfin');
});

// ---- an import never sends this display's token to another server (D142 2, D144 1) ----

for (const type of ['plex', 'jellyfin', 'emby']) {
  const here = { ...defaults(), serverType: type, serverUrl: 'http://mine:8096', plexToken: `${type}-secret`, serverName: 'Mine' };
  const file = (settings) => JSON.stringify({ format: 'plex-poster-display/settings', version: 1, settings });

  test(`${type}: an import that names another server address and brings no token leaves no token and asks to sign in (D144 1)`, () => {
    const { settings, setAside } = importWithConnection(file({ serverType: type, serverUrl: 'http://friend:8096', rotation: 90 }), here);
    assert.equal(setAside, true);
    assert.equal(settings.plexToken, '', 'the friend\'s address never receives this display\'s token');
    assert.equal(settings.serverUrl, 'http://friend:8096');
    assert.equal(settings.serverName, '');
    assert.equal(settings.rotation, 90);
    assert.equal(isConfigured(settings), false);
  });

  test(`${type}: a bare settings file (a config.json) behaves the same, and a legacy file names no type`, () => {
    assert.equal(importWithConnection({ serverType: type, serverUrl: 'http://friend:8096' }, here).settings.plexToken, '');
    if (type === 'plex') assert.equal(importWithConnection({ PLEX_SERVER_URL: 'http://friend:32400' }, here).settings.plexToken, '');
  });

  test(`${type}: an import that brings its own token keeps it; one for the same address, or none, keeps this display's`, () => {
    const own = importWithConnection(file({ serverType: type, serverUrl: 'http://friend:8096', plexToken: 'theirs' }), here);
    assert.equal(own.settings.plexToken, 'theirs');
    assert.equal(own.setAside, true, 'the old token is still set aside');
    for (const same of [{ serverType: type, serverUrl: 'http://mine:8096' }, { serverType: type, serverUrl: 'http://mine:8096/' }, { rotation: 90 }]) {
      const r = importWithConnection(file(same), here);
      assert.equal(r.settings.plexToken, `${type}-secret`, JSON.stringify(same));
      assert.equal(r.setAside, false);
    }
  });
}

test('an import for another server type brings no token and no address unless the file has them (D142 2)', () => {
  const here = { ...defaults(), serverType: 'plex', serverUrl: 'http://mine:32400', plexToken: 'plex-secret' };
  const bare = importWithConnection(JSON.stringify({ serverType: 'emby', rotation: 90 }), here);
  assert.equal(bare.setAside, true);
  assert.equal(bare.settings.plexToken, '');
  assert.equal(bare.settings.serverUrl, '');
  const named = importWithConnection(JSON.stringify({ serverType: 'emby', serverUrl: 'http://e:8096' }), here);
  assert.equal(named.settings.serverUrl, 'http://e:8096');
  assert.equal(named.settings.plexToken, '');
});

test('an Emby token is a secret: an export without secrets leaves it out, one with secrets keeps it, and an import restores it', () => {
  const s = { ...defaults(), serverType: 'emby', serverUrl: 'http://e:8096', plexToken: 'emby-secret' };
  assert.ok(SECRET_KEYS.includes('plexToken'));
  assert.equal('plexToken' in toExport(s).settings, false);
  assert.equal(toExport(s, { includeSecrets: true }).settings.plexToken, 'emby-secret');
  assert.equal(fromImport(JSON.stringify(toExport(s, { includeSecrets: true }))).plexToken, 'emby-secret');
  assert.equal(sanitize({ serverType: 'emby' }).serverType, 'emby');
});

// ---- the user id an Emby sign-in returns (C1, D145 2): a setting, not a secret, that goes with the token ----

test('serverUserId: kept as written (trimmed), empty by default, saved, exported without secrets, and not a secret', () => {
  assert.equal(defaults().serverUserId, '');
  assert.equal(sanitize({ serverUserId: '  u-1  ' }).serverUserId, 'u-1');
  assert.equal(sanitize({ serverUserId: 7 }).serverUserId, '');
  assert.ok(!SECRET_KEYS.includes('serverUserId'));
  const s = { ...defaults(), serverType: 'emby', serverUrl: 'http://e:8096', plexToken: 'emby-secret', serverUserId: 'u-1' };
  assert.equal(toExport(s).settings.serverUserId, 'u-1');
  assert.equal(load({ getItem: () => JSON.stringify(save({ setItem() {} }, s)) }).settings.serverUserId, 'u-1');
});

for (const type of ['plex', 'jellyfin', 'emby']) {
  test(`${type}: an import that sets the token aside sets the user id aside with it; one that brings a token keeps the file's id (C1)`, () => {
    const here = { ...defaults(), serverType: type, serverUrl: 'http://mine:8096', plexToken: 'mine-secret', serverUserId: 'my-user' };
    const file = (settings) => JSON.stringify({ format: 'plex-poster-display/settings', version: 1, settings });
    const away = importWithConnection(file({ serverType: type, serverUrl: 'http://friend:8096' }), here);
    assert.equal(away.settings.plexToken, '');
    assert.equal(away.settings.serverUserId, '', 'the old server\'s user id does not stay with a display that has no token for it');
    const own = importWithConnection(file({ serverType: type, serverUrl: 'http://friend:8096', plexToken: 'theirs', serverUserId: 'their-user' }), here);
    assert.equal(own.settings.serverUserId, 'their-user');
    const same = importWithConnection(file({ rotation: 90 }), here);
    assert.equal(same.settings.serverUserId, 'my-user', 'no move: the id stays with its token');
  });
}

// ---- the user id takes the file's only with the file's own token (D149 2) ----

for (const type of ['plex', 'jellyfin', 'emby']) {
  const here = { ...defaults(), serverType: type, serverUrl: 'http://mine:8096', plexToken: 'mine-secret', serverUserId: 'my-user' };
  const file = (settings) => JSON.stringify({ format: 'plex-poster-display/settings', version: 1, settings });

  test(`${type}: a same-address file with no token keeps this display's token AND its own user id, whatever id the file names (D149 2)`, () => {
    for (const same of [{ serverUserId: 'their-user' }, { serverType: type, serverUrl: 'http://mine:8096', serverUserId: 'their-user', rotation: 90 }]) {
      const r = importWithConnection(file(same), here);
      assert.equal(r.settings.plexToken, 'mine-secret', JSON.stringify(same));
      assert.equal(r.settings.serverUserId, 'my-user', 'the file\'s id does not replace the id that belongs to this display\'s token');
      assert.equal(r.setAside, false);
    }
  });

  test(`${type}: a file with its own token for another address brings the file's user id, or none, never this display's old one (D149 2)`, () => {
    const withId = importWithConnection(file({ serverType: type, serverUrl: 'http://friend:8096', plexToken: 'theirs', serverUserId: 'their-user' }), here);
    assert.deepEqual([withId.settings.plexToken, withId.settings.serverUserId], ['theirs', 'their-user']);
    const noId = importWithConnection(file({ serverType: type, serverUrl: 'http://friend:8096', plexToken: 'theirs' }), here);
    assert.deepEqual([noId.settings.plexToken, noId.settings.serverUserId], ['theirs', ''], 'the old id does not stay with the file\'s token');
    const sameAddressOwnToken = importWithConnection(file({ plexToken: 'theirs' }), here);
    assert.deepEqual([sameAddressOwnToken.settings.plexToken, sameAddressOwnToken.settings.serverUserId], ['theirs', ''], 'a new token for this address does not keep the old token\'s id');
  });
}

// ---- several servers (R-SRC-4, D156, D157) ----

const JF = (extra = {}) => ({ id: 'jf-id-1', type: 'jellyfin', url: 'http://jf:8096', token: 'jf-token', userId: '', name: 'Den Jellyfin', ...extra });
const EM = (extra = {}) => ({ id: 'em-id-1', type: 'emby', url: 'http://em:8096', token: 'em-token', userId: 'u1', name: 'Den Emby', ...extra });
/** A settings object as 2.4.0 stored it: no server list, no server id, bare keys. */
const v240 = () => ({ serverType: 'plex', serverUrl: 'http://plex:32400', plexToken: 'plex-token', libraryKey: '1', libraryKeys: ['1', '3'], libraryNames: ['Movies', 'Kids'], staticRatingKey: '42', staticTitle: 'Pinned' });

test('a 2.4.0 settings object loads as a one-server list, and nothing is stored or rewritten (D156 2)', () => {
  const raw = JSON.stringify(v240());
  const writes = [];
  const storage = { getItem: (k) => (k === STORAGE_KEY ? raw : null), setItem: (k) => writes.push(k), removeItem: (k) => writes.push(k) };
  const { settings, source } = load(storage);
  assert.equal(source, 'storage');
  assert.deepEqual(writes, [], 'loading writes and removes nothing');
  const list = serverList(settings);
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].type, list[0].url, list[0].token, list[0].carried, list[0].id], ['plex', 'http://plex:32400', 'plex-token', true, ''], 'the entry carried over from 2.4.0, with no id yet');
  assert.deepEqual([settings.libraryKeys, settings.staticRatingKey, settings.servers], [['1', '3'], '42', []], 'the bare keys are what 2.4.0 stored');
});

test('a fourth server is refused: only three are kept, and a fourth stored entry is dropped on load (D156 7, D157 11)', () => {
  assert.equal(MAX_SERVERS, 3);
  const many = [JF({ id: 'a1' }), EM({ id: 'a2' }), JF({ id: 'a3', url: 'http://third' }), JF({ id: 'a4', url: 'http://fourth' })];
  const s = sanitize({ ...v240(), servers: many });
  assert.deepEqual(s.servers.map((e) => e.id), ['a1', 'a2'], 'the first server plus two more');
  assert.equal(serverList(s).length, 3);
  const storage = { getItem: () => JSON.stringify({ ...v240(), servers: many }), setItem() {}, removeItem() {} };
  assert.equal(serverList(load(storage).settings).length, 3, 'a fourth stored entry is dropped on load');
});

test('a server with no id, type or address is not a server', () => {
  const s = sanitize({ servers: [JF({ id: '' }), JF({ type: '' }), JF({ url: '' }), 'x', null, JF()] });
  assert.deepEqual(s.servers.map((e) => e.id), ['jf-id-1']);
});

test('a duplicate server id is refused: the later entry is dropped, also against the first server\'s id (D157 6)', () => {
  assert.deepEqual(sanitize({ servers: [JF(), JF({ url: 'http://other' })] }).servers.map((e) => e.url), ['http://jf:8096']);
  assert.deepEqual(sanitize({ ...v240(), serverId: 'jf-id-1', servers: [JF()] }).servers, [], "the first server's id counts");
});

test('every entry has its own token in SECRET_KEYS, and an export without secrets carries none of them (D157 4)', () => {
  assert.ok(SECRET_KEYS.includes('plexToken') && SECRET_KEYS.includes('servers.token'));
  const s = sanitize({ ...v240(), servers: [JF(), EM()] });
  const plain = toExport(s).settings;
  assert.equal('plexToken' in plain, false);
  assert.deepEqual(plain.servers.map((e) => 'token' in e), [false, false]);
  assert.deepEqual(plain.servers.map((e) => e.url), ['http://jf:8096', 'http://em:8096'], 'the addresses stay in the file');
  const full = toExport(s, { includeSecrets: true }).settings;
  assert.deepEqual([full.plexToken, ...full.servers.map((e) => e.token)], ['plex-token', 'jf-token', 'em-token']);
  assert.equal(JSON.stringify(toExport(s)).includes('jf-token'), false);
  assert.deepEqual(withoutSecrets({ plexToken: 'a', servers: [{ token: 'b', url: 'u' }] }), { servers: [{ url: 'u' }] });
});

test('an export carries no server id and no carried flag, and an import never takes them from a file (D157 1)', () => {
  const s = sanitize({ ...v240(), serverId: 'mine', servers: [JF()] });
  const out = toExport(s).settings;
  for (const k of LOCAL_KEYS) assert.equal(k in out, false, k);
  const merged = fromImport({ serverId: 'theirs', serverCarried: false, serverUrl: 'http://x:32400' }, s);
  assert.deepEqual([merged.serverId, merged.serverCarried], ['mine', true]);
});

test('an import keeps the token of a server only when it is the same server at the same address (D157 4)', () => {
  const current = sanitize({ ...v240(), servers: [JF()] });
  const same = fromImport({ servers: [{ ...JF(), token: undefined }] }, current);
  assert.equal(same.servers[0].token, 'jf-token', 'same id, type and address: the token stays');
  const moved = fromImport({ servers: [{ ...JF({ url: 'http://elsewhere:8096' }), token: undefined }] }, current);
  assert.equal(moved.servers[0].token, '', 'another address: no token travels there');
  const given = fromImport({ servers: [JF({ url: 'http://elsewhere:8096', token: 'own' })] }, current);
  assert.equal(given.servers[0].token, 'own');
});

test('removedServers: the carried entry is the same entry while it stays carried, a server is the same by its id (D157 1)', () => {
  const before = serverList(sanitize({ ...v240(), servers: [JF()] }));
  assert.deepEqual(removedServers(before, serverList(sanitize({ ...v240(), servers: [JF()] }))), []);
  assert.deepEqual(removedServers(before, serverList(sanitize({ ...v240() }))).map((e) => e.id), ['jf-id-1'], 'removing the second server');
  const promoted = sanitize({ serverType: 'jellyfin', serverUrl: 'http://jf:8096', plexToken: 'jf-token', serverId: 'jf-id-1', serverCarried: false });
  assert.deepEqual(removedServers(before, serverList(promoted)).map((e) => e.carried), [true], 'removing the carried entry: its bare keys go with it, and the promoted server inherits none');
});

test('withoutServers takes a removed server\'s libraries, collection, pin and profile libraries, and nothing of the others (D157 1, 2)', () => {
  const s = sanitize({
    ...v240(),
    libraryKeys: ['1', '@jf-id-1/b1', '@em-id-1/c1'],
    libraryNames: ['Movies', 'JF', 'EM'],
    source: { kind: 'collection', key: '@jf-id-1/d1', title: 'Box' },
    staticRatingKey: '@jf-id-1/a1',
    staticTitle: 'Pinned JF',
    servers: [JF(), EM()],
    profiles: [{ id: 'p1', name: 'Kids', libraryKeys: ['3', '@jf-id-1/b2'] }],
  });
  const jf = serverList(s)[1];
  const out = withoutServers(s, [jf]);
  assert.deepEqual(out.libraryKeys, ['1', '@em-id-1/c1']);
  assert.deepEqual(out.libraryNames, ['Movies', 'EM']);
  assert.equal(out.source, null);
  assert.deepEqual([out.staticRatingKey, out.staticTitle], ['', '']);
  assert.deepEqual(out.profiles[0].libraryKeys, ['3']);
  const carried = withoutServers(s, [serverList(s)[0]]);
  assert.deepEqual(carried.libraryKeys, ['@jf-id-1/b1', '@em-id-1/c1'], 'removing the carried entry takes the bare keys and no scoped one');
  assert.equal(carried.staticRatingKey, '@jf-id-1/a1', 'a pin of another server stays');
  const bare = withoutServers({ ...s, staticRatingKey: '42' }, [jf]);
  assert.equal(bare.staticRatingKey, '42', 'a bare pin is the carried entry\'s, not the removed server\'s');
});

// settleServers: who answers at an address is read WITHOUT a token, and the token goes only to the server it was made for.
const reader = (answers) => {
  const asked = [];
  const read = async (type, url) => (asked.push(`${type} ${url}`), answers[url] ?? null);
  return { read, asked };
};
const settled = (s) => sanitize(s);

test('settle: a new address whose server has the same id keeps the entries, the pin and the token (D156 3, D157 2)', async () => {
  const prev = settled({ ...v240(), serverId: 'plex-id' });
  const { read, asked } = reader({ 'http://new:32400': 'plex-id' });
  const r = await settleServers(prev, settled({ ...prev, serverUrl: 'http://new:32400' }), read);
  assert.deepEqual([r.removed, r.gone, r.sameRecorded, r.next.plexToken, r.next.serverCarried, r.next.serverId], [[], [], true, 'plex-token', true, 'plex-id']);
  assert.deepEqual(asked, ['plex http://new:32400'], 'the id is read at the new address, with no token');
});

test('settle: a different id, or none on Save, makes it another server: its entries go and its token is set aside (D156 3, D157 2, 3)', async () => {
  const prev = settled({ ...v240(), serverId: 'plex-id', libraryKeys: ['1'], libraryKey: '1' });
  for (const answer of ['other-id', null]) {
    const r = await settleServers(prev, settled({ ...prev, serverUrl: 'http://new:32400' }), reader({ 'http://new:32400': answer }).read);
    assert.equal(r.gone.length, 1, `answer ${answer}: the old server's entries are cleared`);
    assert.equal(r.gone[0].carried, true);
    assert.deepEqual([r.next.plexToken, r.next.serverUserId, r.next.serverId], ['', '', answer || ''], `answer ${answer}: the token is not kept for another server`);
    assert.equal(r.sameRecorded, false);
  }
});

test('settle: a change of type is always another server, even with the same id (D157 2)', async () => {
  const prev = settled({ ...v240(), serverId: 'same-id' });
  const r = await settleServers(prev, settled({ ...prev, serverType: 'jellyfin', serverUrl: 'http://jf:8096' }), reader({ 'http://jf:8096': 'same-id' }).read);
  assert.equal(r.gone.length, 1);
  assert.equal(r.sameRecorded, false);
});

test('settle: an entry whose id was never recorded (2.4.0) is compared with the id read at its old address (D157 5)', async () => {
  const prev = settled(v240()); // no serverId
  const same = await settleServers(prev, settled({ ...prev, serverUrl: 'http://new:32400' }), reader({ 'http://plex:32400': 'm', 'http://new:32400': 'm' }).read);
  assert.deepEqual([same.gone.length, same.next.serverId, same.next.plexToken, same.sameRecorded], [0, 'm', 'plex-token', false], 'the same server: it is recorded, the token stays; the pin still goes as in 2.4.0 (sameRecorded is false)');
  const differ = await settleServers(prev, settled({ ...prev, serverUrl: 'http://new:32400' }), reader({ 'http://plex:32400': 'm', 'http://new:32400': 'n' }).read);
  assert.deepEqual([differ.gone.length, differ.next.plexToken], [1, '']);
  const unsure = await settleServers(prev, settled({ ...prev, serverUrl: 'http://new:32400' }), reader({ 'http://new:32400': 'n' }).read);
  assert.deepEqual([unsure.gone.length, unsure.next.plexToken], [1, ''], 'the old address does not answer: it cannot be confirmed, so it is another server');
});

test('settle: an upgrade that changes nothing reads nothing and clears nothing (D156 2)', async () => {
  const prev = settled(v240());
  const { read, asked } = reader({});
  const r = await settleServers(prev, settled({ ...prev, rotateSeconds: 60 }), read);
  assert.deepEqual([asked, r.gone, r.removed, r.next.serverCarried, r.next.serverId, r.next.libraryKeys, r.next.staticRatingKey], [[], [], [], true, '', ['1', '3'], '42']);
});

test('settle: adding a server records the first one\'s id and keeps the new one only when it answers with its id (D157 6)', async () => {
  const prev = settled(v240());
  const next = settled({ ...prev, servers: [JF()] });
  const ok = await settleServers(prev, next, reader({ 'http://plex:32400': 'plex-id', 'http://jf:8096': 'jf-id-1' }).read);
  assert.deepEqual([ok.next.serverId, ok.next.servers.map((e) => e.id), ok.notes], ['plex-id', ['jf-id-1'], []]);
  const liar = await settleServers(prev, next, reader({ 'http://plex:32400': 'plex-id', 'http://jf:8096': 'someone-else' }).read);
  assert.deepEqual([liar.next.servers, liar.notes.length], [[], 1]);
  const twin = await settleServers(prev, next, reader({ 'http://plex:32400': 'jf-id-1', 'http://jf:8096': 'jf-id-1' }).read);
  assert.deepEqual([twin.next.servers, twin.notes.length], [[], 1], 'the same server twice is not added');
});

test('settle: another server in the first place is the carried entry when alone, and told apart by its id beside others', async () => {
  const prev = settled({ ...v240(), serverId: 'plex-id', libraryKey: '1', libraryKeys: ['1'], libraryNames: ['Movies'] });
  const alone = await settleServers(prev, settled({ ...prev, serverType: 'jellyfin', serverUrl: 'http://jf:8096', plexToken: 'jf-token' }), reader({ 'http://jf:8096': 'jf-id-1' }).read);
  assert.deepEqual([alone.next.serverCarried, alone.next.serverId, alone.next.libraryKeys], [true, 'jf-id-1', ['1']], 'alone it keeps bare keys: nothing else is in the list');
  const beside = await settleServers(prev, settled({ ...prev, serverType: 'jellyfin', serverUrl: 'http://jf:8096', plexToken: 'jf-token', servers: [EM()] }), reader({ 'http://jf:8096': 'jf-id-1', 'http://em:8096': 'em-id-1' }).read);
  assert.deepEqual([beside.next.serverCarried, beside.next.serverId, beside.next.libraryKeys], [false, 'jf-id-1', ['@jf-id-1/1']], 'beside others its ids move to its own id');
});

test('settle: a first connection (no address before) reads nothing and clears nothing', async () => {
  const prev = settled({});
  const { read, asked } = reader({});
  const r = await settleServers(prev, settled({ ...prev, serverUrl: 'http://plex:32400', plexToken: 't', libraryKey: '1' }), read);
  assert.deepEqual([asked, r.gone, r.next.serverCarried, r.next.plexToken], [[], [], true, 't']);
});

// ---- removing the FIRST server (D162 1, 2, 3) ----

/** The settings the sheet hands to Save after Remove on the first row: the first extra server in the first place, the old first one gone. */
const afterRemovingFirst = (prev, rest = {}) => {
  const e = prev.servers[0];
  return sanitize({ ...prev, serverType: e.type, serverUrl: e.url, plexToken: e.token, serverUserId: e.userId, serverName: e.name, serverId: e.id, serverCarried: false, servers: prev.servers.slice(1), ...rest });
};
const noRead = async () => assert.fail('a server moved into the first place is not read again');

test('removing the first of two: the server that stays is never carried, keeps its scoped ids, its pin and its own token, and the old first one is removed (D162 1, 3)', async () => {
  const prev = sanitize({
    ...v240(),
    serverId: 'plex-id',
    plexToken: 'shared-account-token',
    libraryKeys: ['1', '@jf-id-1/b1'],
    libraryNames: ['Movies', 'JF Movies'],
    staticRatingKey: '@jf-id-1/a1',
    servers: [JF({ token: 'shared-account-token' })], // an account token two servers share
  });
  const r = await settleServers(prev, afterRemovingFirst(prev, { libraryKeys: ['@jf-id-1/b1'], libraryNames: ['JF Movies'], libraryKey: '@jf-id-1/b1' }), noRead);
  assert.deepEqual([r.next.serverCarried, r.next.serverId, r.next.serverType, r.next.servers, r.promoted], [false, 'jf-id-1', 'jellyfin', [], true]);
  assert.equal(r.next.plexToken, 'shared-account-token', 'its own token stays, even when it equals the old first server\'s');
  assert.deepEqual(r.removed.map((e) => [e.id, e.carried]), [['plex-id', true]], 'the old first server is the one removed');
  assert.deepEqual(r.gone, r.removed);
  const out = withoutServers(r.next, r.removed);
  assert.deepEqual([out.libraryKeys, out.staticRatingKey], [['@jf-id-1/b1'], '@jf-id-1/a1'], 'its libraries and its pin survive');
  assert.equal(serverList(out)[0].carried, false);
});

test('removing the first: the removed server\'s libraries leave every profile, with two servers and with three, and nothing is moved to another server (D162 2, D157 1)', async () => {
  const profile = (libraryKeys) => ({ id: 'p1', name: 'Kids', libraryKeys, libraryNames: libraryKeys.map(() => 'L') });
  // two servers
  const two = sanitize({ ...v240(), serverId: 'plex-id', libraryKeys: ['1'], libraryKey: '1', servers: [JF()], profiles: [profile(['1', '@jf-id-1/b2'])] });
  const r2 = await settleServers(two, afterRemovingFirst(two, { libraryKeys: [], libraryKey: '' }), noRead);
  assert.deepEqual(withoutServers(r2.next, r2.removed).profiles[0].libraryKeys, ['@jf-id-1/b2'], 'the bare key was the removed first server\'s: it is gone, and it was not given to the server that stays');
  // three servers
  const three = sanitize({ ...v240(), serverId: 'plex-id', libraryKeys: ['1'], libraryKey: '1', servers: [JF(), EM()], profiles: [profile(['1', '@jf-id-1/b2', '@em-id-1/c1'])] });
  const r3 = await settleServers(three, afterRemovingFirst(three, { libraryKeys: [], libraryKey: '' }), noRead);
  assert.deepEqual([r3.next.serverCarried, r3.next.servers.map((e) => e.id)], [false, ['em-id-1']]);
  assert.deepEqual(withoutServers(r3.next, r3.removed).profiles[0].libraryKeys, ['@jf-id-1/b2', '@em-id-1/c1'], 'with three servers the bare key is not rewritten into the promoted server\'s scope');
});

// ---- Remove the first server, then retype the promoted server's address (D162 1, 2, 3; D157 3) ----

const retyped = (prev, url, rest = {}) => afterRemovingFirst(prev, { serverUrl: url, libraryKeys: [], libraryKey: '', ...rest });
const promoteBase = () => sanitize({
  ...v240(),
  serverId: 'plex-id',
  libraryKeys: ['1', '@jf-id-1/b1'],
  libraryNames: ['Movies', 'JF Movies'],
  libraryKey: '1',
  servers: [JF()],
  profiles: [{ id: 'p1', name: 'Kids', libraryKeys: ['1', '@jf-id-1/b2'], libraryNames: ['A', 'B'] }],
});

test('remove the first, retype the promoted server\'s address to another server: its token is set aside, it is not carried and inherits no bare key, and the old first server is removed (D162 1, 2, 3)', async () => {
  const prev = promoteBase();
  for (const answer of ['other-server-id', null]) {
    const { read, asked } = reader({ 'http://elsewhere:8096': answer });
    const r = await settleServers(prev, retyped(prev, 'http://elsewhere:8096', { libraryKeys: ['@jf-id-1/b1'], libraryKey: '@jf-id-1/b1' }), read);
    assert.deepEqual(asked, ['jellyfin http://elsewhere:8096'], 'the id is read at the new address without a token');
    assert.equal(r.next.plexToken, '', `answer ${answer}: its token is not kept for the new address`);
    assert.equal(r.next.serverCarried, false, `answer ${answer}: it is never carried`);
    assert.equal(r.next.serverId, answer || '');
    assert.deepEqual(r.removed.map((e) => e.carried).sort(), [false, true], 'the old first server and the server that was retyped are both removed');
    assert.ok(r.gone.some((e) => e.carried), 'the old first server is counted as removed');
    const out = withoutServers(r.next, r.removed);
    assert.deepEqual(out.profiles[0].libraryKeys, [], `answer ${answer}: the removed first server's bare profile key '1' is gone, the retyped server's own key is gone, and nothing moved onto the new server (D163 1)`);
    assert.equal(r.promoted, false);
  }
});

test('remove the first, retype the promoted server\'s address to the same server: the id read there matches, so it keeps its token, its pin and its scoped ids (D157 3)', async () => {
  const prev = promoteBase();
  const r = await settleServers(prev, retyped(prev, 'http://other-name:8096', { libraryKeys: ['@jf-id-1/b1'], libraryKey: '@jf-id-1/b1', staticRatingKey: '@jf-id-1/a1' }), reader({ 'http://other-name:8096': 'jf-id-1' }).read);
  assert.deepEqual([r.next.plexToken, r.next.serverCarried, r.next.serverId, r.promoted, r.next.staticRatingKey], ['jf-token', false, 'jf-id-1', true, '@jf-id-1/a1']);
  assert.deepEqual(r.removed.map((e) => e.carried), [true], 'only the old first server is removed');
  assert.deepEqual(withoutServers(r.next, r.removed).profiles[0].libraryKeys, ['@jf-id-1/b2'], 'the bare key of the removed first server is gone; the staying server keeps its own');
});

test('a Save that changes nothing about any server asks no server anything when the first server\'s id is known, or when there are no other servers (cold M1)', async () => {
  const known = settled({ ...v240(), serverId: 'plex-id', servers: [JF()] });
  const a = reader({});
  const r = await settleServers(known, settled({ ...known, rotateSeconds: 60, staticRatingKey: '' }), a.read);
  assert.deepEqual([a.asked, r.removed, r.gone], [[], [], []]);
  const alone = settled(v240()); // one server, id never recorded
  const b = reader({});
  await settleServers(alone, settled({ ...alone, rotateSeconds: 60 }), b.read);
  assert.deepEqual(b.asked, [], 'a one-server household reads nothing');
});

test('a duplicate added while the first server was down is removed at the first Save at which the first server answers (D162 7)', async () => {
  const prev = settled({ ...v240(), servers: [JF({ id: 'aaa', url: 'http://a2:32400', name: 'Same as first' })] }); // the first server's id was never recorded
  const { read, asked } = reader({ 'http://plex:32400': 'aaa' });
  const r = await settleServers(prev, settled({ ...prev, rotateSeconds: 60 }), read);
  assert.deepEqual(asked, ['plex http://plex:32400'], 'the first server is asked who it is');
  assert.deepEqual([r.next.serverId, r.next.servers, r.notes.length], ['aaa', [], 1]);
  assert.match(r.notes[0], /same server as your first one/);
});

test('when the first server turns out to be another server: in a household with several servers no profile key moves onto it and its keys leave every profile; a one-server household keeps its profiles as stored (D163)', async () => {
  const profile = { id: 'p1', name: 'Kids', libraryKeys: ['5'], libraryNames: ['Kids'] };
  const multi = sanitize({ ...v240(), serverId: 'plex-id', libraryKeys: ['5'], libraryKey: '5', servers: [JF()], profiles: [profile] });
  const m = await settleServers(multi, settled({ ...multi, serverUrl: 'http://new:32400' }), reader({ 'http://new:32400': 'new-id' }).read);
  assert.deepEqual(m.next.profiles[0].libraryKeys, [], 'the Plex profile key 5 does not become @new-id/5');
  assert.equal(m.gone.length > 0, true);
  const scopedOnly = sanitize({ ...v240(), serverId: 'plex-id', libraryKeys: ['5'], libraryKey: '5', profiles: [{ ...profile, libraryKeys: ['5', '@jf-id-1/b2'] }] });
  const sc = await settleServers(scopedOnly, settled({ ...scopedOnly, serverUrl: 'http://new:32400' }), reader({ 'http://new:32400': 'new-id' }).read);
  assert.deepEqual(sc.next.profiles[0].libraryKeys, ['@jf-id-1/b2'], 'a scoped id stored means several servers: the first server\'s key leaves, another server\'s stays');
  const one = sanitize({ ...v240(), serverId: 'plex-id', libraryKeys: ['5'], libraryKey: '5', profiles: [profile] });
  const o = await settleServers(one, settled({ ...one, serverUrl: 'http://new:32400' }), reader({ 'http://new:32400': 'new-id' }).read);
  assert.deepEqual([o.next.profiles[0].libraryKeys, o.next.serverCarried, o.next.libraryKeys], [['5'], true, ['5']], 'one server: the 2.4.0 behaviour');
});

test('several servers: the old token goes when the first server is found to be another server, whatever changed, the type included; a fresh sign-in is kept (cold r3 N1, D163 3)', async () => {
  const prev = settled({ ...v240(), serverId: 'plex-id', servers: [JF()] });
  const r = await settleServers(prev, settled({ ...prev, serverType: 'jellyfin', serverUrl: 'http://jf2:8096' }), reader({ 'http://jf2:8096': 'jf-id-2' }).read);
  assert.equal(r.next.plexToken, '', 'the Plex token is not left on the Jellyfin server');
  const unknown = await settleServers(prev, settled({ ...prev, serverType: 'kodi', serverUrl: 'http://k:1' }), reader({}).read);
  assert.equal(unknown.next.plexToken, '', 'with several servers an unknown type does not keep the old token either');
  const fresh = await settleServers(prev, settled({ ...prev, serverType: 'jellyfin', serverUrl: 'http://jf2:8096', plexToken: 'signed-in-fresh' }), reader({ 'http://jf2:8096': 'jf-id-2' }).read);
  assert.equal(fresh.next.plexToken, 'signed-in-fresh', 'a sign-in made for the new server is kept');
});

test('one server: a Save that changes only the type keeps the token as in 2.4.0, and an address change to another server still sets it aside (D163 2, Q5)', async () => {
  const prev = settled({ ...v240(), serverId: 'plex-id' });
  const kodi = await settleServers(prev, settled({ ...prev, serverType: 'kodi', serverUrl: 'http://k:1' }), reader({}).read);
  assert.deepEqual([kodi.next.serverType, kodi.next.plexToken], ['kodi', 'plex-token'], 'the imported type and the token stay as written (jellyfin.spec 13b)');
  const jf = await settleServers(prev, settled({ ...prev, serverType: 'jellyfin', serverUrl: 'http://jf:8096' }), reader({ 'http://jf:8096': 'jf-id-1' }).read);
  assert.equal(jf.next.plexToken, 'plex-token', 'a one-server household keeps the 2.4.0 behaviour on a type change');
  const moved = await settleServers(prev, settled({ ...prev, serverUrl: 'http://new:32400' }), reader({ 'http://new:32400': 'other-id' }).read);
  assert.equal(moved.next.plexToken, '', 'another address of the same type that answers as another server sets the token aside (D157 3)');
});

test('several servers, a retype to another server: the main selection follows the new server only with a fresh sign-in; with the old token the old first server\'s keys leave the main selection too (D163 1)', async () => {
  const prev = sanitize({ ...v240(), serverId: 'plex-id', libraryKeys: ['5'], libraryKey: '5', libraryNames: ['Kids'], servers: [JF()] });
  const answers = { 'http://new:32400': 'new-id' };
  const stale = await settleServers(prev, settled({ ...prev, serverUrl: 'http://new:32400' }), reader(answers).read);
  assert.deepEqual([stale.next.libraryKeys, stale.next.libraryKey], [[], ''], 'saved with the old token and no test: the old first server\'s key 5 is gone');
  const fresh = await settleServers(prev, settled({ ...prev, serverUrl: 'http://new:32400', plexToken: 'signed-in-fresh' }), reader(answers).read);
  assert.deepEqual(fresh.next.libraryKeys, ['@new-id/5'], 'a sign-in made in the sheet: the ticks made there follow the new server');
});

test('a promoted server stored with serverCarried: true is stored not carried, and no profile keeps the removed first server\'s bare key (the carried guard)', async () => {
  const prev = promoteBase();
  const next = afterRemovingFirst(prev, { libraryKeys: ['@jf-id-1/b1'], libraryKey: '@jf-id-1/b1', serverCarried: true });
  assert.equal(next.serverCarried, true, 'the sheet handed in a carried flag');
  const r = await settleServers(prev, next, noRead);
  assert.equal(r.next.serverCarried, false);
  assert.deepEqual(withoutServers(r.next, r.removed).profiles[0].libraryKeys, ['@jf-id-1/b2'], 'the bare key of the removed first server is gone');
});

test('several servers, a retype to another server saved with a FRESH sign-in: the main selection follows the new server, and no profile keeps the old first server\'s key or gains a moved copy of it (D163 1)', async () => {
  const prev = sanitize({
    ...v240(),
    serverId: 'plex-id',
    libraryKeys: ['5'],
    libraryKey: '5',
    libraryNames: ['Kids'],
    servers: [JF()],
    profiles: [{ id: 'p1', name: 'Kids', libraryKeys: ['5', '@jf-id-1/b2'], libraryNames: ['Kids', 'JF Kids'] }],
  });
  const r = await settleServers(prev, settled({ ...prev, serverUrl: 'http://new:32400', plexToken: 'signed-in-fresh' }), reader({ 'http://new:32400': 'new-id' }).read);
  assert.deepEqual(r.next.libraryKeys, ['@new-id/5'], 'the main selection, ticked in the sheet from the new server, follows it');
  assert.deepEqual(r.next.profiles[0].libraryKeys, ['@jf-id-1/b2'], 'the profile keeps no key of the old first server, and no @new-id/5 was made from it; another server\'s key stays');
});

// ---- earlySettings: what the display shows while a Save reads who answers at the first server (D162 5, D165 1, D165 4, D172, D173) ----

/** Before the Save: Plex first (the old selection and an old pin of its own), Jellyfin second, the first id recorded. */
const heldBase = () =>
  sanitize({
    ...v240(),
    serverId: 'plex-id',
    libraryKey: '1',
    libraryKeys: ['1', '@jf-id-1/b1'],
    libraryNames: ['Movies', 'JF Movies'],
    genres: ['Drama'],
    ratings: ['PG'],
    source: { kind: 'collection', key: '77', title: 'Old collection' },
    staticRatingKey: '42',
    staticTitle: 'Old pin',
    maxContentRating: 'PG-13',
    servers: [JF()],
  });
/** What the sheet hands in for a Save: the new selection and pin (ids of the new server), the connection keys as typed. */
const newPicks = { libraryKey: '5', libraryKeys: ['5'], libraryNames: ['New Movies'], genres: ['Horror'], ratings: ['R'], source: { kind: 'playlist', key: '88', title: 'New list' }, staticRatingKey: '99', staticTitle: 'New pin' };
const SELECTION = ['libraryKey', 'libraryName', 'libraryKeys', 'libraryNames', 'genres', 'ratings', 'source'];
const PIN = ['staticRatingKey', 'staticTitle'];
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const CONNECTION = ['serverType', 'serverUrl', 'plexToken', 'serverUserId', 'serverName', 'serverId', 'serverCarried', 'servers'];

test('early: a first server at another address holds the old selection and the old pin together, and the old connection (D172 1, 2)', () => {
  const prev = heldBase();
  const next = sanitize({ ...prev, ...newPicks, serverUrl: 'http://new:32400' });
  const early = earlySettings(prev, next);
  assert.deepEqual(pick(early, SELECTION), pick(prev, SELECTION), 'the old selection, in full');
  assert.deepEqual(pick(early, PIN), pick(prev, PIN), 'the old pin');
  assert.deepEqual(pick(early, CONNECTION), pick(prev, CONNECTION), 'the old connection');
});

test('early: the first server\'s type, or a different server in the first place, holds the same set (D172 1)', () => {
  const prev = heldBase();
  const retyped = sanitize({ ...prev, ...newPicks, serverType: 'jellyfin' });
  const swapped = sanitize({ ...prev, ...newPicks, serverUrl: 'http://jf:8096', serverId: 'jf-id-1', serverType: 'jellyfin', plexToken: 'jf-token', serverCarried: false, servers: [] });
  for (const [what, next] of [['type', retyped], ['another server first', swapped]]) {
    const early = earlySettings(prev, next);
    assert.deepEqual([pick(early, SELECTION), pick(early, PIN)], [pick(prev, SELECTION), pick(prev, PIN)], `${what}: the old selection and pin`);
  }
});

test('early: a different server in the first place at the same address and type holds the same set (D172 1)', () => {
  const prev = heldBase();
  const next = sanitize({ ...prev, ...newPicks, serverId: 'another-id', serverCarried: false });
  const early = earlySettings(prev, next);
  assert.deepEqual([pick(early, SELECTION), pick(early, PIN)], [pick(prev, SELECTION), pick(prev, PIN)]);
});

test('early: an address that addressOf reads as the same (trailing slashes, spaces) holds nothing (D172 1)', () => {
  const prev = heldBase();
  const next = sanitize({ ...prev, ...newPicks, serverUrl: ' http://plex:32400/// ' });
  const early = earlySettings(prev, next);
  assert.deepEqual(pick(early, [...SELECTION, ...PIN]), pick(next, [...SELECTION, ...PIN]), 'the new selection and pin apply at once');
});

test('early: a token-only or name-only change, a change to the second or third server only, and an unknown first id hold nothing (D172 1)', () => {
  const prev = heldBase();
  const unknownId = sanitize({ ...prev, serverId: '' });
  const changes = [
    ['token', sanitize({ ...prev, ...newPicks, plexToken: 'another-token' })],
    ['name', sanitize({ ...prev, ...newPicks, serverName: 'Renamed' })],
    ['second server address', sanitize({ ...prev, ...newPicks, servers: [JF({ url: 'http://jf-moved:8096' })] })],
    ['second server removed', sanitize({ ...prev, ...newPicks, servers: [] })],
    ['a third server added', sanitize({ ...prev, ...newPicks, servers: [JF(), EM()] })],
  ];
  for (const [what, next] of changes) {
    const early = earlySettings(prev, next);
    assert.deepEqual(pick(early, [...SELECTION, ...PIN]), pick(next, [...SELECTION, ...PIN]), `${what}: the new selection and pin apply at once`);
  }
  const unknownNext = sanitize({ ...unknownId, ...newPicks, servers: [JF(), EM()] });
  const unknown = earlySettings(unknownId, unknownNext);
  assert.deepEqual(pick(unknown, [...SELECTION, ...PIN]), pick(unknownNext, [...SELECTION, ...PIN]), 'an unknown first id with no first-entry change: no hold');
});

test('early: a first configure (the old settings unconfigured) holds nothing (D172 1)', () => {
  const prev = sanitize({ ...defaults() });
  assert.equal(isConfigured(prev), false);
  const next = sanitize({ ...prev, ...newPicks, serverType: 'plex', serverUrl: 'http://new:32400', plexToken: 'fresh' });
  const early = earlySettings(prev, next);
  assert.deepEqual(pick(early, [...SELECTION, ...PIN]), pick(next, [...SELECTION, ...PIN]), 'the new selection and pin apply at once');
  assert.deepEqual(pick(early, ['serverUrl', 'plexToken']), pick(prev, ['serverUrl', 'plexToken']), 'the connection still waits for the reads');
});

test('early: an unpin applies at once even while the selection is held (D173 1)', () => {
  const prev = heldBase();
  const next = sanitize({ ...prev, ...newPicks, staticRatingKey: '', staticTitle: '', serverUrl: 'http://new:32400' });
  const early = earlySettings(prev, next);
  assert.deepEqual(pick(early, SELECTION), pick(prev, SELECTION), 'the selection is held');
  assert.deepEqual(pick(early, PIN), { staticRatingKey: '', staticTitle: '' }, 'the pin is gone at once');
});

test('early: a Save that keeps the pin holds it, and one that sets a pin where there was none holds none (D173 1)', () => {
  const prev = heldBase();
  const kept = earlySettings(prev, sanitize({ ...prev, ...newPicks, staticRatingKey: '42', staticTitle: 'Old pin', serverUrl: 'http://new:32400' }));
  assert.deepEqual(pick(kept, PIN), pick(prev, PIN), 'the kept pin');
  const unpinned = sanitize({ ...prev, staticRatingKey: '', staticTitle: '' });
  const fresh = earlySettings(unpinned, sanitize({ ...unpinned, ...newPicks, serverUrl: 'http://new:32400' }));
  assert.deepEqual(pick(fresh, PIN), { staticRatingKey: '', staticTitle: '' }, 'a new pin from the new server does not show during the read');
  assert.deepEqual(pick(fresh, SELECTION), pick(unpinned, SELECTION));
});

test('early: every other setting, the limit first, applies at once in a held Save (D162 5, D172 3)', () => {
  const prev = heldBase();
  const next = sanitize({ ...prev, ...newPicks, serverUrl: 'http://new:32400', maxContentRating: 'G', rotateSeconds: 77, showNowPlaying: false });
  const early = earlySettings(prev, next);
  assert.deepEqual(pick(early, ['maxContentRating', 'rotateSeconds', 'showNowPlaying']), pick(next, ['maxContentRating', 'rotateSeconds', 'showNowPlaying']));
  assert.equal(early.maxContentRating, 'G');
});

test('early: a Save that only lowers the limit applies it at once with the selection, pin and connection as they were (D162 5)', () => {
  const prev = heldBase();
  const next = sanitize({ ...prev, maxContentRating: 'G' });
  const early = earlySettings(prev, next);
  assert.equal(early.maxContentRating, 'G');
  assert.deepEqual(pick(early, [...SELECTION, ...PIN, ...CONNECTION]), pick(prev, [...SELECTION, ...PIN, ...CONNECTION]));
});

test('early: the display stays configured when a Save cleared the selection and the pin and only a second server changed (the 2.4.1 fallback)', () => {
  const prev = heldBase();
  const next = sanitize({ ...prev, libraryKey: '', libraryKeys: [], libraryNames: [], source: null, staticRatingKey: '', staticTitle: '', servers: [JF(), EM()] });
  const early = earlySettings(prev, next);
  assert.equal(isConfigured(early), true);
  assert.deepEqual(pick(early, SELECTION), pick(prev, SELECTION));
});

// ---- earlySettings and the viewer profiles / rating-schedule slots (D174 1) ----

const kidsProfile = (extra = {}) => ({ id: 'p1', name: 'Kids', maxContentRating: 'G', limitNowPlaying: true, libraryKeys: ['1'], libraryNames: ['Movies'], genres: ['Drama'], ratings: ['G'], source: { kind: 'collection', key: '77', title: 'Old collection' }, weighting: 'off', noRepeatDays: 0, frameId: 'marquee', ...extra });
const PROFILE_SELECTION = ['libraryKeys', 'libraryNames', 'genres', 'ratings', 'source'];
const withProfile = () => sanitize({ ...heldBase(), maxContentRating: 'PG', limitSlots: [{ start: '00:00', profile: 'p1' }], profiles: [kidsProfile()] });
const sheetProfile = (extra = {}) => kidsProfile({ libraryKeys: ['5'], libraryNames: ['New Movies'], genres: ['Horror'], ratings: ['R'], source: { kind: 'playlist', key: '88', title: 'New list' }, ...extra });

test('early: a held Save keeps the old selection of each profile in force, and the profile\'s limit and other settings apply at once (D174 1, D162 5)', () => {
  const prev = withProfile();
  const next = sanitize({ ...prev, ...newPicks, serverUrl: 'http://new:32400', profiles: [sheetProfile({ maxContentRating: 'PG', weighting: 'unwatched', frameId: 'other' })] });
  const early = earlySettings(prev, next);
  assert.deepEqual(pick(early.profiles[0], PROFILE_SELECTION), pick(prev.profiles[0], PROFILE_SELECTION), 'the profile draws from the old selection');
  assert.deepEqual(pick(early.profiles[0], ['id', 'name', 'maxContentRating', 'weighting', 'frameId']), pick(next.profiles[0], ['id', 'name', 'maxContentRating', 'weighting', 'frameId']), 'its limit and the rest of its bundle apply at once');
});

test('early: a held Save leaves the slots as handed in, so a lowered slot limit applies at once, and a profile made in this Save is not shown (D174 1, D162 5)', () => {
  const prev = withProfile();
  const made = sheetProfile({ id: 'p2', name: 'New one' });
  const next = sanitize({ ...prev, ...newPicks, serverUrl: 'http://new:32400', limitSlots: [{ start: '00:00', profile: 'p2' }, { start: '20:00', limit: 'G' }], profiles: [sheetProfile(), made] });
  const early = earlySettings(prev, next);
  assert.deepEqual(early.limitSlots, next.limitSlots);
  assert.deepEqual(early.profiles.map((p) => p.id), ['p1'], 'a profile that did not exist before the Save has only the new server\'s selection, so it waits');
});

test('early: without a first-entry change the profiles apply at once (D174 1)', () => {
  const prev = withProfile();
  const next = sanitize({ ...prev, ...newPicks, plexToken: 'another-token', profiles: [sheetProfile(), sheetProfile({ id: 'p2', name: 'New one' })] });
  const early = earlySettings(prev, next);
  assert.deepEqual(early.profiles, next.profiles);
  assert.deepEqual(early.limitSlots, next.limitSlots);
});

test('early: a first configure holds no profile (D174 1)', () => {
  const prev = sanitize({ ...defaults() });
  const next = sanitize({ ...prev, ...newPicks, serverUrl: 'http://new:32400', plexToken: 'fresh', profiles: [sheetProfile()] });
  assert.deepEqual(earlySettings(prev, next).profiles, next.profiles);
});

// ---- the stay-configured rule wins in every branch (D176 1) ----

/** A display configured by its pin alone: a connection, no library, no collection, a pin of its own. */
const pinOnly = () => sanitize({ ...heldBase(), libraryKey: '', libraryKeys: [], libraryNames: [], genres: [], ratings: [], source: null, profiles: [], limitSlots: [] });

test('early: a pin-only display saved with a first-server change and an unpin is never stored unconfigured; the old pin waits for the settle (D176 1)', () => {
  const prev = pinOnly();
  assert.equal(isConfigured(prev), true);
  const next = sanitize({ ...prev, ...newPicks, staticRatingKey: '', staticTitle: '', serverUrl: 'http://new:32400' });
  const early = earlySettings(prev, next);
  assert.equal(isConfigured(early), true, 'the first-run card never opens during the read');
  assert.deepEqual(pick(early, PIN), pick(prev, PIN), 'the pin is restored for the read');
  assert.deepEqual(pick(early, SELECTION), pick(prev, SELECTION), 'and the old (empty) selection is held');
});

test('early: a pin-only display with a first-server change that keeps its pin is configured, and an unpin that leaves a library is applied at once (D176 1, D173 1)', () => {
  const prev = pinOnly();
  const kept = earlySettings(prev, sanitize({ ...prev, ...newPicks, serverUrl: 'http://new:32400' }));
  assert.deepEqual([isConfigured(kept), kept.staticRatingKey], [true, '42']);
  const held = heldBase();
  const unpinned = earlySettings(held, sanitize({ ...held, ...newPicks, staticRatingKey: '', staticTitle: '', serverUrl: 'http://new:32400' }));
  assert.deepEqual(pick(unpinned, PIN), { staticRatingKey: '', staticTitle: '' }, 'the old selection keeps the display configured, so the unpin stands');
});

test('early: addresses that differ only as addressOf trims them (a trailing slash, surrounding spaces) hold nothing, compared without sanitize (D172 1)', () => {
  const prev = heldBase();
  for (const typed of ['http://plex:32400/', '  http://plex:32400  ', ' http://plex:32400// ']) {
    const next = { ...prev, ...newPicks, serverUrl: typed };
    const early = earlySettings(prev, next);
    assert.deepEqual(pick(early, [...SELECTION, ...PIN]), pick(next, [...SELECTION, ...PIN]), `"${typed}": the new selection and pin apply at once`);
  }
});

test('early: the stay-configured restore brings back only the old selection and pin, and leaves the limit, the slots and the profiles as the Save handed them in (D176 1, D162 5)', () => {
  const prev = sanitize({ ...pinOnly(), maxContentRating: 'PG-13', limitSlots: [{ start: '08:00', limit: 'PG' }, { start: '20:00', profile: 'p1' }], profiles: [kidsProfile({ maxContentRating: 'PG' })] });
  assert.equal(isConfigured(prev), true);
  const next = sanitize({
    ...prev,
    ...newPicks,
    staticRatingKey: '',
    staticTitle: '',
    serverUrl: 'http://new:32400',
    maxContentRating: 'G',
    limitSlots: [{ start: '09:00', limit: 'G' }, { start: '21:00', profile: 'p1' }],
    profiles: [sheetProfile({ maxContentRating: 'G', weighting: 'unwatched' })],
  });
  const early = earlySettings(prev, next);
  assert.equal(isConfigured(early), true, 'the restore ran');
  assert.deepEqual([pick(early, PIN), pick(early, SELECTION)], [pick(prev, PIN), pick(prev, SELECTION)], 'the old pin and selection came back');
  assert.equal(early.maxContentRating, 'G', 'the lowered limit applies at once');
  assert.deepEqual(early.limitSlots, next.limitSlots, 'the slots are the Save\'s');
  assert.deepEqual(early.profiles.map((p) => [p.id, p.maxContentRating, p.weighting]), [['p1', 'G', 'unwatched']], 'the profile\'s limit and bundle are the Save\'s');
  assert.deepEqual(pick(early.profiles[0], PROFILE_SELECTION), pick(prev.profiles[0], PROFILE_SELECTION), 'a profile still draws from its old selection');
});
