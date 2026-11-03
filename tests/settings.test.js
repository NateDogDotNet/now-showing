import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, fromImport, importWithConnection, isConfigured, load, sanitize, save, SECRET_KEYS, STORAGE_KEY, toExport } from '../js/settings.js';

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
