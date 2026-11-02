import test from 'node:test';
import assert from 'node:assert/strict';
import { addProfile, bundleOf, checkName, cleanBundle, cleanName, cleanProfiles, describeProfile, MAX_PROFILES, NAME_MAX, removeProfile, renameProfile, resolveSettings, updateProfile } from '../js/profiles.js';
import { limitInForce, profileInForce } from '../js/limit-schedule.js';
import { defaults, fromImport, sanitize, toExport } from '../js/settings.js';

// 2026-01-05 is a Monday; local times, so the cases hold in any timezone.
const at = (h, m, day = 5) => new Date(2026, 0, day, h, m);

const kids = { id: 'k', name: 'Kids', maxContentRating: 'G', limitNowPlaying: true, libraryKeys: ['3'], libraryNames: ['Kids Movies'], genres: [], ratings: [], source: null, weighting: 'unwatched', noRepeatDays: 7, frameId: 'marquee' };
const adults = { id: 'a', name: 'Adults', maxContentRating: '', limitNowPlaying: false, libraryKeys: ['1'], libraryNames: ['Movies'], genres: [], ratings: [], source: null, weighting: 'rated', noRepeatDays: 0, frameId: 'none' };
const sheet = { ...defaults(), maxContentRating: 'PG-13', libraryKey: '9', libraryKeys: ['9'], libraryNames: ['Sheet'], frameId: 'marquee-glow', weighting: 'off', limitNowPlaying: true };
const withProfiles = (extra = {}) => ({ ...sheet, profiles: [kids, adults], limitSlots: [{ start: '06:00', profile: 'k' }, { start: '21:00', profile: 'a' }], ...extra });

test('settings with no profiles resolve exactly as before: the stored settings with the limit in force', () => {
  for (const s of [sheet, { ...sheet, limitSlots: [{ start: '06:00', limit: 'G' }] }, { ...sheet, maxContentRating: '' }]) {
    for (const d of [at(3, 0), at(7, 0), at(23, 0), new Date(1970, 0, 1)]) {
      assert.deepEqual(resolveSettings(s, d), { ...s, maxContentRating: limitInForce(s, d) });
    }
  }
});

test('a slot naming a profile yields that profile\'s limit, selection, weighting, window, now-playing rule and frame', () => {
  const r = resolveSettings(withProfiles(), at(7, 0));
  assert.equal(r.maxContentRating, 'G');
  assert.deepEqual([r.libraryKeys, r.libraryKey, r.libraryName, r.weighting, r.noRepeatDays, r.frameId, r.limitNowPlaying], [['3'], '3', 'Kids Movies', 'unwatched', 7, 'marquee', true]);
  const a = resolveSettings(withProfiles(), at(22, 0));
  assert.deepEqual([a.maxContentRating, a.libraryKeys, a.weighting, a.frameId, a.limitNowPlaying], ['', ['1'], 'rated', 'none', false]);
  assert.equal(a.rotateSeconds, sheet.rotateSeconds, 'what a profile does not hold stays the sheet\'s');
});

test('the carry-over after midnight keeps the profile of yesterday\'s last slot', () => {
  assert.equal(resolveSettings(withProfiles(), at(3, 0)).frameId, 'none');
  assert.equal(profileInForce(withProfiles(), at(3, 0)).id, 'a');
});

test('outside every slot the sheet\'s own values apply', () => {
  const s = withProfiles({ limitSlots: [{ start: '06:00', profile: 'k', days: [1] }] });
  const r = resolveSettings(s, at(7, 0, 6)); // Tuesday: the slot is Monday only
  assert.deepEqual([r.maxContentRating, r.libraryKeys, r.frameId], ['PG-13', ['9'], 'marquee-glow']);
});

test('two slots at the same start: the stricter limit decides, and its profile is the one in force', () => {
  const s = withProfiles({ limitSlots: [{ start: '06:00', profile: 'a' }, { start: '06:00', profile: 'k' }] });
  assert.equal(resolveSettings(s, at(7, 0)).frameId, 'marquee');
  assert.equal(resolveSettings(s, at(7, 0)).maxContentRating, 'G');
});

test('a slot naming a missing profile gives G while it is in force; the other settings are the sheet\'s and the profile name is not reported (D120 2)', () => {
  const s = { ...sheet, maxContentRating: 'R', profiles: [{ ...adults, maxContentRating: 'PG' }], limitSlots: [{ start: '06:00', profile: 'gone' }, { start: '09:00', limit: 'NC-17' }] };
  const r = resolveSettings(s, at(7, 0));
  assert.equal(r.maxContentRating, 'G');
  assert.deepEqual([r.libraryKeys, r.frameId, r.weighting, 'profileName' in r], [['9'], 'marquee-glow', 'off', false]);
  assert.equal(resolveSettings(s, at(10, 0)).maxContentRating, 'NC-17', 'not in force: the slot that is');
  // The cold review's import repro: Kids (G) from 07:00, base PG-13; the file drops Kids. G at 08:00, not the looser base.
  const dropped = { ...sheet, maxContentRating: 'PG-13', profiles: [], limitSlots: [{ start: '07:00', profile: 'k' }] };
  assert.equal(resolveSettings(dropped, at(8, 0)).maxContentRating, 'G');
});

test('an implausible clock while a slot names a profile gives the strictest limit among all, and no bundle', () => {
  const s = withProfiles({ maxContentRating: 'R', profiles: [{ ...kids, maxContentRating: 'PG' }, { ...adults, maxContentRating: 'PG-13' }] });
  for (const d of [new Date(1970, 0, 1), new Date(NaN), null]) {
    const r = resolveSettings(s, d);
    assert.equal(r.maxContentRating, 'PG', String(d));
    assert.deepEqual([r.libraryKeys, r.frameId], [['9'], 'marquee-glow'], 'other settings from the sheet');
  }
  const plain = { ...s, limitSlots: [{ start: '06:00', limit: 'PG-13' }] };
  assert.equal(resolveSettings(plain, new Date(1970, 0, 1)).maxContentRating, 'PG-13', 'no slot names a profile: the profiles do not count');
  const missing = { ...s, limitSlots: [{ start: '06:00', profile: 'gone' }] };
  assert.equal(resolveSettings(missing, new Date(1970, 0, 1)).maxContentRating, 'G', 'a missing profile counts as G');
});

test('an unreadable schedule is still G all day', () => {
  const s = withProfiles({ limitSlots: [{ start: 'x', profile: 'k' }] });
  assert.equal(resolveSettings(s, at(12, 0)).maxContentRating, 'G');
  assert.equal(resolveSettings(s, at(12, 0)).frameId, 'marquee-glow');
});

test('a slot that names a profile with unreadable days applies every day at the strictest limit, with no bundle', () => {
  const s = withProfiles({ limitSlots: [{ start: '06:00', profile: 'a', days: [9] }] });
  const r = resolveSettings(s, at(7, 0));
  assert.equal(r.maxContentRating, 'G');
  assert.equal(r.frameId, 'marquee-glow');
});

test('a profile whose limit is unreadable is the strictest limit, never no limit', () => {
  const r = resolveSettings({ ...sheet, profiles: [{ ...kids, maxContentRating: 'XX' }], limitSlots: [{ start: '06:00', profile: 'k' }] }, at(7, 0));
  assert.equal(r.maxContentRating, 'G');
});

test('the household toggle off: slots and profiles are kept and not applied; no profile switches anything (D120 4)', () => {
  const s = withProfiles({ maxContentRating: '' });
  for (const d of [at(7, 0), at(22, 0), at(3, 0)]) {
    const r = resolveSettings(s, d);
    assert.deepEqual(r, { ...s, maxContentRating: '' }, 'exactly the sheet\'s own settings');
  }
  assert.equal(profileInForce(s, at(7, 0)), null);
});

test('the resolver reports the profile in force by name, only while one is', () => {
  assert.equal(resolveSettings(withProfiles(), at(7, 0)).profileName, 'Kids');
  assert.equal('profileName' in resolveSettings(sheet, at(7, 0)), false);
});

test('a carried profile whose limit equals the base still applies its bundle; of two equally strict slots the first listed supplies it', () => {
  const s = withProfiles({ maxContentRating: 'G', limitSlots: [{ start: '20:00', profile: 'k' }] });
  assert.equal(resolveSettings(s, at(3, 0)).frameId, 'marquee', 'Monday 03:00, Kids carries over, base G');
  const twin = { ...kids, id: 'k2', name: 'Twin', frameId: 'none' };
  const tie = withProfiles({ profiles: [kids, twin], limitSlots: [{ start: '06:00', profile: 'k2' }, { start: '06:00', profile: 'k' }] });
  assert.equal(resolveSettings(tie, at(7, 0)).frameId, 'none');
});

test('limitNowPlaying defaults to on when a profile omits it, in the store and in force', () => {
  const { limitNowPlaying, ...bare } = kids;
  assert.equal(cleanBundle(bare).limitNowPlaying, true);
  assert.equal(cleanProfiles([bare])[0].limitNowPlaying, true);
  assert.equal(resolveSettings({ ...sheet, profiles: [bare], limitSlots: [{ start: '06:00', profile: 'k' }], limitNowPlaying: false }, at(7, 0)).limitNowPlaying, true);
});

test('describeProfile adds the weighting when it is on', () => {
  assert.match(describeProfile({ ...kids, weighting: 'unwatched' }), /unwatched first/);
  assert.match(describeProfile({ ...kids, weighting: 'rated' }), /best reviewed first/);
  assert.equal(/first/.test(describeProfile({ ...kids, weighting: 'off' })), false);
});

test('cleanBundle: the ten keys, each clean; an absent or unknown limit is the strictest', () => {
  const b = cleanBundle({ maxContentRating: 'XX', limitNowPlaying: 'false', libraryKeys: ['1', 1, ''], libraryNames: ['A'], genres: 'x', ratings: ['R', 'bogus'], source: { kind: 'bad' }, weighting: 'junk', noRepeatDays: '99', frameId: '  ' });
  assert.deepEqual(b, { maxContentRating: 'G', limitNowPlaying: false, libraryKeys: ['1'], libraryNames: ['A'], genres: [], ratings: ['R'], source: null, weighting: 'off', noRepeatDays: 30, frameId: 'marquee' });
  assert.equal(cleanBundle({}).maxContentRating, 'G');
  assert.equal(cleanBundle({ maxContentRating: '' }).maxContentRating, '', '"no limit" is kept');
  assert.deepEqual(Object.keys(cleanBundle({ extra: 1, plexToken: 'secret', settingsPinHash: 'ab' })).sort(), ['frameId', 'genres', 'libraryKeys', 'libraryNames', 'limitNowPlaying', 'maxContentRating', 'noRepeatDays', 'ratings', 'source', 'weighting']);
  assert.deepEqual(bundleOf(sheet), cleanBundle(sheet));
});

test('cleanProfiles: names are trimmed and cut to 24, unique ignoring case; ids unique; junk dropped; at most 6', () => {
  const long = 'x'.repeat(40);
  const out = cleanProfiles([{ ...kids, name: `  ${long} ` }, { ...kids, id: 'k2', name: 'KIDS' }, { ...kids, id: 'k3', name: 'kids' }, { ...kids, id: 'k', name: 'dup id' }, { ...kids, id: '', name: 'No id' }, { ...kids, id: 'z', name: '   ' }, null, 'x', [], { id: 'n' }]);
  assert.deepEqual(out.map((p) => [p.id, p.name]), [['k', 'x'.repeat(24)], ['k2', 'KIDS']]);
  assert.deepEqual(cleanProfiles('junk'), []);
  assert.deepEqual(cleanProfiles(undefined), []);
  const eight = Array.from({ length: 8 }, (_, i) => ({ ...kids, id: `i${i}`, name: `P${i}` }));
  assert.equal(cleanProfiles(eight).length, MAX_PROFILES);
  assert.deepEqual(cleanProfiles(eight).map((p) => p.id), ['i0', 'i1', 'i2', 'i3', 'i4', 'i5'], 'the first six');
  assert.equal(cleanName(`  ${long}  `).length, NAME_MAX);
});

test('addProfile: 1 to 24 characters after trimming, unique ignoring case, at most 6, never changes its input', () => {
  const list = Object.freeze([kids]);
  const ok = addProfile(list, '  Teens ', { ...kids, maxContentRating: 'PG-13' }, 't');
  assert.deepEqual(ok.profiles.map((p) => [p.id, p.name, p.maxContentRating]), [['k', 'Kids', 'G'], ['t', 'Teens', 'PG-13']]);
  assert.match(addProfile(list, '   ', kids).error, /name/);
  assert.match(addProfile(list, 'x'.repeat(25), kids).error, /24/);
  assert.equal(addProfile(list, 'x'.repeat(24), kids).error, undefined, '24 is allowed');
  assert.match(addProfile(list, 'kIdS', kids).error, /already/);
  const full = Array.from({ length: MAX_PROFILES }, (_, i) => ({ ...kids, id: `i${i}`, name: `P${i}` }));
  assert.match(addProfile(full, 'Seventh', kids).error, /6 profiles/);
  assert.equal(addProfile(full.slice(1), 'Sixth', kids).error, undefined, 'the sixth is allowed');
  assert.ok(addProfile([], 'A', kids).id, 'an id is made when none is given');
  assert.notEqual(addProfile([kids], 'B', kids).id, 'k');
});

test('renameProfile and updateProfile: the profile keeps its id; a name clash with another is refused, with its own is allowed', () => {
  const list = [kids, adults];
  assert.deepEqual(renameProfile(list, 'k', 'Little ones').profiles.map((p) => p.name), ['Little ones', 'Adults']);
  assert.match(renameProfile(list, 'k', 'adults').error, /already/);
  assert.equal(renameProfile(list, 'k', 'KIDS').error, undefined, 'a change of case on its own name is not a clash');
  assert.match(renameProfile(list, 'k', ' ').error, /name/);
  assert.match(renameProfile(list, 'nope', 'X').error, /no longer exists/);
  const upd = updateProfile(list, 'k', { ...sheet, maxContentRating: 'PG', libraryKeys: ['9'], libraryNames: ['Sheet'], frameId: 'none' });
  assert.deepEqual([upd.profiles[0].id, upd.profiles[0].name, upd.profiles[0].maxContentRating, upd.profiles[0].frameId], ['k', 'Kids', 'PG', 'none']);
  assert.deepEqual(upd.profiles[1], adults, 'the others are untouched');
  assert.match(updateProfile(list, 'nope', sheet).error, /no longer exists/);
});

test('removeProfile: refused while a slot names it, saying which slot; allowed once no slot does', () => {
  const slots = [{ start: '06:00', profile: 'k' }, { start: '21:00', profile: 'a' }, { start: '23:00', profile: 'k' }];
  const one = removeProfile([kids, adults], 'a', slots);
  assert.match(one.error, /Adults/);
  assert.match(one.error, /the 21:00 slot/);
  assert.equal(one.profiles, undefined);
  assert.match(removeProfile([kids, adults], 'k', slots).error, /the 06:00 and 23:00 slots/);
  assert.deepEqual(removeProfile([kids, adults], 'a', [{ start: '06:00', profile: 'k' }]).profiles, [kids]);
  assert.deepEqual(removeProfile([kids], 'k', [{ start: '06:00', limit: 'G' }]).profiles, []);
  assert.match(removeProfile([kids], 'zz', []).error, /no longer exists/);
});

test('describeProfile: limit, library or source, frame', () => {
  assert.equal(describeProfile(kids, (id) => `${id} frame`), 'G · Kids Movies · marquee frame · unwatched first');
  assert.equal(describeProfile(adults), 'No limit · Movies · none · best reviewed first');
  assert.match(describeProfile({ ...kids, source: { kind: 'collection', key: '5', title: 'Cartoons' } }), /collection Cartoons/);
  assert.match(describeProfile({ ...kids, libraryNames: [''], libraryKeys: ['1', '2'] }), /2 libraries/);
  assert.match(describeProfile({ ...kids, libraryNames: [], libraryKeys: [] }), /no library/);
});

test('the settings key: default [] (changes nothing), own list each time, cleaned on load and at most 6', () => {
  assert.deepEqual(defaults().profiles, []);
  assert.notEqual(defaults().profiles, defaults().profiles);
  assert.deepEqual(sanitize({}).profiles, []);
  assert.deepEqual(sanitize({ profiles: [kids] }).profiles, [kids]);
  assert.deepEqual(sanitize({ profiles: 'junk' }).profiles, []);
  assert.equal(sanitize({ profiles: Array.from({ length: 9 }, (_, i) => ({ ...kids, id: `i${i}`, name: `P${i}` })) }).profiles.length, 6);
});

test('export carries the profiles and the slots that name them, and never PIN material or a token', () => {
  const s = sanitize({ ...withProfiles(), settingsPinHash: 'abcd', settingsPinSalt: '1234', plexToken: 'tok' });
  const out = toExport(s);
  assert.deepEqual(out.settings.profiles, s.profiles);
  assert.deepEqual(out.settings.limitSlots, [{ start: '06:00', profile: 'k' }, { start: '21:00', profile: 'a' }]);
  assert.equal('settingsPinHash' in out.settings, false);
  assert.equal('settingsPinSalt' in out.settings, false);
  assert.equal('plexToken' in out.settings, false);
  for (const text of [JSON.stringify(out), JSON.stringify(toExport(s, { includeSecrets: true }))]) {
    assert.equal(text.includes('abcd'), false);
    assert.equal(text.includes('1234'), false);
  }
});

test('import carries profiles, cleans them like the sheet\'s own values, and never takes PIN material', () => {
  const file = JSON.stringify({ format: 'plex-poster-display/settings', version: 1, settings: { profiles: [{ ...kids, name: ' Kids ', maxContentRating: 'bogus', noRepeatDays: 99, settingsPinHash: 'ff' }, { id: 'x' }], limitSlots: [{ start: '06:00', profile: 'k' }], settingsPinHash: 'ff', settingsPinSalt: 'ee' } });
  const current = { ...defaults(), settingsPinHash: 'aa', settingsPinSalt: 'bb' };
  const s = fromImport(file, current);
  assert.deepEqual(s.profiles.map((p) => [p.id, p.name, p.maxContentRating, p.noRepeatDays]), [['k', 'Kids', 'G', 30]]);
  assert.deepEqual(s.limitSlots, [{ start: '06:00', profile: 'k' }]);
  assert.equal(s.settingsPinHash, 'aa');
  assert.equal(s.settingsPinSalt, 'bb');
  assert.equal('settingsPinHash' in s.profiles[0], false);
  const seven = fromImport({ profiles: Array.from({ length: 7 }, (_, i) => ({ ...kids, id: `i${i}`, name: `P${i}` })) }, current);
  assert.equal(seven.profiles.length, 6, 'a 7th is not kept');
});

test('an imported slot that names a profile the file does not carry fails closed', () => {
  const s = fromImport({ limitSlots: [{ start: '06:00', profile: 'ghost' }], maxContentRating: 'R', profiles: [{ ...kids, maxContentRating: 'PG' }] }, defaults());
  assert.equal(resolveSettings(s, at(7, 0)).maxContentRating, 'G');
});

test('checkName is the one name rule', () => {
  assert.deepEqual(checkName([], ' A '), { name: 'A' });
});

test('D122 6: the carry-over floor compare: base G, Kids (G) from 20:00 every day, R from 22:00 on Sundays: Monday 03:00 gives the Kids bundle', () => {
  const s = { ...sheet, maxContentRating: 'G', profiles: [{ ...kids, frameId: 'none' }], limitSlots: [{ start: '20:00', profile: 'k' }, { start: '22:00', limit: 'R', days: [0] }] };
  const r = resolveSettings(s, at(3, 0)); // Monday 2026-01-05
  assert.equal(r.profileName, 'Kids', 'Sunday\'s R slot does not apply on Monday, so Kids carries over; its limit equals the base, so the slot still wins the tie');
  assert.equal(r.frameId, 'none');
  assert.equal(r.maxContentRating, 'G');
});
