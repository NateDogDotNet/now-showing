import test from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createLimitWatch, describeLimitNow, limitInForce, MAX_SLOTS, nextLimitChange, sanitizeSlots, slotInForce, STRICTEST } from '../js/limit-schedule.js';
import { defaults, sanitize } from '../js/settings.js';

// 2026-01-05 is a Monday. `at(h, m, day)` is local time, so the cases hold in any timezone.
const at = (h, m, day = 5, month = 0, year = 2026) => new Date(year, month, day, h, m);
const MON = 5;
const SAT = 10;
const SUN = 11;

const slot = (start, limit, days) => (days ? { start, limit, days } : { start, limit });
const EXAMPLE = [slot('06:00', 'G'), slot('15:00', 'PG-13'), slot('22:00', '')]; // G from 06:00, PG-13 from 15:00, no limit from 22:00
const withSlots = (limitSlots, maxContentRating = 'PG-13') => ({ maxContentRating, limitSlots });

test('no slots: the limit in force is maxContentRating, whatever the time', () => {
  for (const base of ['', 'G', 'PG', 'PG-13', 'R', 'NC-17']) {
    for (const d of [at(3, 0), at(12, 0), at(23, 59), new Date(1970, 0, 1)]) {
      assert.equal(limitInForce({ maxContentRating: base }, d), base);
      assert.equal(limitInForce({ maxContentRating: base, limitSlots: [] }, d), base);
      assert.equal(limitInForce({ maxContentRating: base, limitSlots: null }, d), base);
    }
  }
  assert.equal(limitInForce({}, at(12, 0)), '', 'an absent maxContentRating is the settings default, no limit');
  assert.equal(limitInForce({ maxContentRating: null, limitSlots: EXAMPLE }, at(7, 0)), '', 'null too, even with slots');
});

test('slots: the slot whose start is the latest at or before the time', () => {
  const s = withSlots(EXAMPLE);
  assert.equal(limitInForce(s, at(6, 0)), 'G', 'a start is inclusive');
  assert.equal(limitInForce(s, at(7, 0)), 'G');
  assert.equal(limitInForce(s, at(14, 59)), 'G');
  assert.equal(limitInForce(s, at(15, 0)), 'PG-13');
  assert.equal(limitInForce(s, at(21, 59)), 'PG-13');
  assert.equal(limitInForce(s, at(22, 0)), '', '"no limit" is a slot value');
  assert.equal(limitInForce(s, at(23, 59)), '');
});

test('slots: before the first start of the day the previous day\'s last slot is still in force (wraps past midnight)', () => {
  const s = withSlots(EXAMPLE);
  assert.equal(limitInForce(s, at(5, 59)), '', 'the 22:00 slot, from yesterday');
  assert.equal(limitInForce(s, at(0, 0)), '');
  // The wrap takes the LAST slot, not whichever is listed first or last: shuffle the list.
  assert.equal(limitInForce(withSlots([EXAMPLE[1], EXAMPLE[2], EXAMPLE[0]]), at(5, 59)), '');
  assert.equal(limitInForce(withSlots([slot('08:00', 'R'), slot('12:00', 'PG')], 'G'), at(7, 0)), 'PG');
  assert.equal(limitInForce(withSlots([slot('08:00', 'R')], 'G'), at(7, 0)), 'R', 'a single slot is in force all day');
  assert.equal(limitInForce(withSlots([slot('08:00', 'R')], 'G'), at(9, 0)), 'R');
});

test('slots are applied only while the household limit is on (base limit "" = off); saved slots are kept, not applied', () => {
  const s = withSlots(EXAMPLE, '');
  for (const d of [at(7, 0), at(16, 0), at(5, 0), new Date(1970, 0, 1)]) assert.equal(limitInForce(s, d), '');
});

test('slots: a slot applies only on the days in its set; a slot with no set applies every day (D103)', () => {
  const s = withSlots([slot('06:00', 'G', [1, 2, 3, 4, 5]), slot('09:00', 'PG', [0, 6])], 'R');
  assert.equal(limitInForce(s, at(10, 0, MON)), 'G', 'Monday 10:00: the weekend slot does not apply (it would be PG without the day filter)');
  assert.equal(limitInForce(s, at(10, 0, SAT)), 'PG');
  assert.equal(limitInForce(s, at(10, 0, SUN)), 'PG');
  assert.equal(limitInForce(s, at(8, 0, MON)), 'G', 'Monday 08:00: the weekday slot, started at 06:00');
  assert.equal(limitInForce(s, at(7, 0, SAT)), 'R', 'Saturday 07:00: no slot of Saturday has started and Friday\'s G slot does not apply on Saturday: the base limit');
  assert.equal(limitInForce(s, at(8, 0, SUN)), 'PG', 'Sunday 08:00: Saturday\'s 09:00 slot also applies on Sunday, so it carries over');
  assert.equal(limitInForce(s, at(5, 0, MON)), 'R', 'Monday 05:00: Sunday\'s PG slot does not apply on Monday: the base limit');
  assert.equal(limitInForce(s, at(5, 0, 6)), 'G', 'Tuesday 05:00: Monday\'s G slot applies on Tuesday too, so it carries over');
});

test('slots: one "no limit from 20:00, weekends" slot with base PG-13 (the UX walk probe)', () => {
  const s = withSlots([slot('20:00', '', [0, 6])], 'PG-13');
  assert.equal(limitInForce(s, at(12, 0, MON)), 'PG-13', 'Monday 12:00: the base limit');
  assert.equal(limitInForce(s, at(22, 0, MON)), 'PG-13', 'Monday 22:00: the slot does not apply on a Monday');
  assert.equal(limitInForce(s, at(8, 0, SAT)), 'PG-13', 'Saturday morning: Friday has no slot to carry over');
  assert.equal(limitInForce(s, at(21, 0, SAT)), '', 'Saturday 21:00: no limit');
  assert.equal(limitInForce(s, at(8, 0, SUN)), '', 'Sunday morning: Saturday\'s slot also applies on Sunday, so it carries over');
  assert.equal(limitInForce(s, at(21, 0, SUN)), '');
  assert.equal(limitInForce(s, at(8, 0, 12)), 'PG-13', 'Monday morning: Sunday\'s slot does not apply on Monday');
});

test('slots: a slot that does not apply today never carries over, and one that does applies from the day\'s first moment', () => {
  const fridays = withSlots([slot('10:00', 'G', [5])], 'R');
  assert.equal(limitInForce(fridays, at(12, 0, 7)), 'R', 'Wednesday: the base limit (no look-back over days that have no slot)');
  assert.equal(limitInForce(fridays, at(9, 0, 9)), 'R', 'Friday 09:00, before the slot starts: Thursday has none to carry over');
  assert.equal(limitInForce(fridays, at(11, 0, 9)), 'G', 'Friday 11:00');
  assert.equal(limitInForce(fridays, at(1, 0, 10)), 'R', 'Saturday 01:00: Friday\'s slot does not apply on Saturday');
  const nightly = withSlots([slot('22:00', 'G', [5, 6])], 'R'); // Friday and Saturday nights
  assert.equal(limitInForce(nightly, at(2, 0, 10)), 'G', 'Saturday 02:00: Friday\'s slot applies on Saturday too, but on Saturday nothing has started: it carries over only when it applies today. It does, so G');
});

test('slots: two slots with the same start and day: the stricter one wins, in either order', () => {
  assert.equal(limitInForce(withSlots([slot('08:00', 'R'), slot('08:00', 'PG')]), at(9, 0)), 'PG');
  assert.equal(limitInForce(withSlots([slot('08:00', 'PG'), slot('08:00', 'R')]), at(9, 0)), 'PG');
  assert.equal(limitInForce(withSlots([slot('08:00', ''), slot('08:00', 'NC-17')]), at(9, 0)), 'NC-17', '"no limit" is the least strict');
  assert.equal(limitInForce(withSlots([slot('08:00', ''), slot('08:00', 'G')]), at(9, 0)), 'G');
});

test('an implausible clock gives the strictest of the base limit and every slot', () => {
  const clocks = [new Date(1970, 0, 1, 12, 0), new Date(2025, 11, 31, 23, 59), new Date(NaN), null, undefined, 'x', 0];
  for (const d of clocks) {
    assert.equal(limitInForce(withSlots(EXAMPLE, 'R'), d), 'G', String(d));
    assert.equal(limitInForce(withSlots([slot('06:00', 'PG-13'), slot('22:00', '')], 'R'), d), 'PG-13', 'the strictest slot');
    assert.equal(limitInForce(withSlots([slot('06:00', ''), slot('22:00', 'R')], 'PG'), d), 'PG', 'the base limit counts too');
    assert.equal(limitInForce(withSlots([slot('06:00', '')], 'R'), d), 'R', 'a no-limit slot never loosens the base');
  }
  assert.equal(limitInForce(withSlots(EXAMPLE, 'R'), at(12, 0, 1, 0, 2026)), 'G', 'the first plausible year is plausible: Jan 1 2026 12:00 is in the 06:00 slot');
  assert.equal(limitInForce(withSlots([slot('00:00', 'R'), slot('12:00', 'G')], 'NC-17'), at(1, 0, 1, 0, 2026)), 'R', 'a plausible clock reads the schedule');
});

test('an implausible clock with no slots is not changed (as today)', () => {
  assert.equal(limitInForce({ maxContentRating: 'R' }, new Date(1970, 0, 1)), 'R');
  assert.equal(limitInForce({ maxContentRating: 'R', limitSlots: [] }, new Date(NaN)), 'R');
});

test('sanitizeSlots: an unknown limit becomes the strictest value; "no limit" is kept', () => {
  for (const bad of ['X', 'PG13', 'pg-13', ' R', undefined, null, 5, true, {}, []]) {
    assert.deepEqual(sanitizeSlots([{ start: '08:00', limit: bad }]), [{ start: '08:00', limit: STRICTEST }], JSON.stringify(bad));
  }
  assert.deepEqual(sanitizeSlots([{ start: '08:00' }]), [{ start: '08:00', limit: 'G' }], 'a slot with no limit key is unknown, not "no limit"');
  for (const ok of ['', 'G', 'PG', 'PG-13', 'R', 'NC-17']) assert.deepEqual(sanitizeSlots([{ start: '08:00', limit: ok }]), [{ start: '08:00', limit: ok }]);
});

test('sanitizeSlots: a schedule with ANY slot whose time is unreadable is the strictest limit all day; no slot is dropped (D103)', () => {
  const good = slot('09:00', 'R');
  const strict = [{ start: '00:00', limit: 'G' }];
  for (const bad of ['24:00', '12:60', '7:00', '0700', '', 'x', 5, null, undefined, '12:00:00']) {
    assert.deepEqual(sanitizeSlots([{ start: bad, limit: 'G' }, good]), strict, JSON.stringify(bad));
    assert.deepEqual(sanitizeSlots([good, { start: bad, limit: '' }]), strict, `last: ${JSON.stringify(bad)}`);
  }
  for (const bad of [null, 'x', 5, [], undefined, true]) assert.deepEqual(sanitizeSlots([bad, good]), strict, `slot ${JSON.stringify(bad)}`);
  // The probe from the review: the stricter slot's time is unreadable and the looser one must not take over.
  assert.equal(limitInForce({ maxContentRating: 'PG-13', limitSlots: [{ start: '25:00', limit: 'G' }, slot('22:00', '')] }, at(7, 0)), 'G');
  assert.equal(limitInForce({ maxContentRating: 'PG-13', limitSlots: [{ start: '25:00', limit: 'G' }, slot('22:00', '')] }, at(23, 0)), 'G');
  // An unreadable slot beyond the eighth still makes the schedule unreadable.
  const nine = [...Array.from({ length: 8 }, (_, i) => slot(`0${i}:00`, 'PG')), { start: 'x', limit: '' }];
  assert.deepEqual(sanitizeSlots(nine), strict);
});

test('sanitizeSlots: an unreadable schedule as a whole is the strictest limit all day', () => {
  const strict = [{ start: '00:00', limit: 'G' }];
  for (const bad of ['06:00', 'G', 5, true, {}, { start: '06:00', limit: 'R' }]) assert.deepEqual(sanitizeSlots(bad), strict, JSON.stringify(bad));
  assert.deepEqual(sanitizeSlots([{ start: 'x', limit: 'R' }]), strict, 'a list with no readable slot');
  assert.deepEqual(sanitizeSlots([null, 5]), strict);
  assert.deepEqual(sanitizeSlots(undefined), []);
  assert.deepEqual(sanitizeSlots(null), []);
  assert.deepEqual(sanitizeSlots([]), [], 'an empty list is no schedule');
  for (const bad of ['06:00', 5, {}]) {
    assert.equal(limitInForce({ maxContentRating: 'R', limitSlots: bad }, at(12, 0)), 'G', `limitInForce reads ${JSON.stringify(bad)} as unreadable`);
  }
  assert.equal(limitInForce({ maxContentRating: 'R', limitSlots: [{ start: 'x' }] }, at(12, 0)), 'G');
});

test(`sanitizeSlots: at most ${MAX_SLOTS} slots; more than that reads as the strictest limit all day (D105)`, () => {
  const many = Array.from({ length: 12 }, (_, i) => slot(`${String(i + 6).padStart(2, '0')}:00`, 'PG'));
  assert.equal(MAX_SLOTS, 8);
  assert.equal(sanitizeSlots(many.slice(0, 8)).length, 8, 'eight are all kept');
  assert.deepEqual(sanitizeSlots(many.slice(0, 9)), [{ start: '00:00', limit: 'G' }], 'nine: G all day');
  assert.deepEqual(sanitizeSlots(many), [{ start: '00:00', limit: 'G' }], 'twelve: G all day');
  assert.equal(limitInForce({ maxContentRating: 'NC-17', limitSlots: many.slice(0, 9) }, at(12, 0)), 'G');
  assert.equal(limitInForce({ maxContentRating: 'NC-17', limitSlots: many.slice(0, 8) }, at(12, 0)), 'PG', 'eight are read as written');
});

test('sanitizeSlots: weekday sets are cleaned; an unreadable set makes the slot apply every day at the strictest limit', () => {
  assert.deepEqual(sanitizeSlots([slot('08:00', 'R', [5, 1, 1, 3])]), [slot('08:00', 'R', [1, 3, 5])], 'sorted, without repeats');
  assert.deepEqual(sanitizeSlots([slot('08:00', 'R', [0, 1, 2, 3, 4, 5, 6])]), [slot('08:00', 'R')], 'all seven days is every day');
  for (const bad of [[], [7], [-1], ['1'], [1.5], 'mon', 3, {}, [null], [1, 8]]) {
    assert.deepEqual(sanitizeSlots([{ start: '08:00', limit: 'R', days: bad }]), [{ start: '08:00', limit: 'G' }], JSON.stringify(bad));
  }
  assert.deepEqual(sanitizeSlots([{ start: '08:00', limit: 'R', days: null }]), [slot('08:00', 'R')], 'null = no set');
});

test('sanitizeSlots: sorted by start (stable), unknown properties dropped, idempotent', () => {
  const raw = [{ start: '22:00', limit: '', extra: 1 }, slot('06:00', 'G'), slot('06:00', 'PG'), slot('15:00', 'PG-13', [1, 2])];
  const out = sanitizeSlots(raw);
  assert.deepEqual(out, [slot('06:00', 'G'), slot('06:00', 'PG'), slot('15:00', 'PG-13', [1, 2]), slot('22:00', '')]);
  assert.deepEqual(sanitizeSlots(out), out);
  assert.equal(sanitizeSlots([slot('08:00', 'R')])[0] !== sanitizeSlots([slot('08:00', 'R')])[0], true, 'a fresh object each call');
});

test('limitInForce reads an unsanitised list the way the sanitiser would', () => {
  const raw = [{ start: '06:00', limit: 'bogus' }, { start: '15:00', limit: 'R' }];
  assert.equal(limitInForce({ maxContentRating: 'NC-17', limitSlots: raw }, at(7, 0)), 'G', 'an unknown limit is the strictest');
  assert.equal(limitInForce({ maxContentRating: 'NC-17', limitSlots: raw }, at(16, 0)), 'R');
  assert.equal(limitInForce({ maxContentRating: 'NC-17', limitSlots: [...raw, { start: '99:99', limit: '' }] }, at(16, 0)), 'G', 'an unreadable time makes the whole schedule G');
});

test('nextLimitChange and describeLimitNow: the limit in force now and until when', () => {
  const s = withSlots(EXAMPLE, 'PG-13');
  assert.deepEqual(nextLimitChange(s, at(7, 0)), { limit: 'G', until: at(15, 0) });
  assert.deepEqual(nextLimitChange(s, at(15, 0)), { limit: 'PG-13', until: at(22, 0) });
  assert.deepEqual(nextLimitChange(s, at(23, 0)), { limit: '', until: at(6, 0, 6) });
  assert.equal(describeLimitNow(s, at(7, 0)), 'In force now: G until 15:00.');
  assert.equal(describeLimitNow(s, at(23, 0)), 'In force now: No limit until tomorrow 06:00.');
  assert.equal(describeLimitNow(s, at(1, 0)), 'In force now: No limit until 06:00.');
  assert.equal(describeLimitNow(withSlots(EXAMPLE, ''), at(7, 0)), 'No limit applies: the household limit is off (the slots are kept, not applied).');
  assert.equal(describeLimitNow({ maxContentRating: '', limitSlots: [] }, at(7, 0)), 'No limit applies: the household limit is off.');
  assert.equal(describeLimitNow(withSlots(EXAMPLE), new Date(1970, 0, 1)), 'The clock is not set, so the strictest limit applies: G.');
  assert.equal(describeLimitNow({ maxContentRating: 'PG', limitSlots: [] }, at(7, 0)), 'In force now: PG.');
  assert.equal(describeLimitNow(withSlots([slot('08:00', 'R')], 'G'), at(9, 0)), 'In force now: R all day.');
  // Weekend-only slot: Friday evening shows the change on Saturday.
  const weekend = withSlots([slot('20:00', '', [0, 6])], 'PG-13');
  assert.equal(describeLimitNow(weekend, at(12, 0, MON)), 'In force now: PG-13 until Sat 20:00.');
  assert.equal(describeLimitNow(weekend, at(21, 0, SUN)), 'In force now: No limit until tomorrow 00:00.', 'the limit drops back when Monday starts: the carry-over ends');
});

test('an unknown base limit is treated as the strictest when slots exist, and passed through when they do not', () => {
  assert.equal(limitInForce({ maxContentRating: 'X', limitSlots: [slot('06:00', '')] }, new Date(1970, 0, 1)), 'G');
  assert.equal(limitInForce({ maxContentRating: 'X' }, at(12, 0)), 'X');
});

test('settings that are not an object give the strictest limit', () => {
  for (const bad of [null, undefined, 'R', 5]) assert.equal(limitInForce(bad, at(12, 0)), 'G', String(bad));
});

test('the settings key: default [] (changes nothing), sanitised through sanitizeSlots, and its own object each time', () => {
  assert.deepEqual(defaults().limitSlots, []);
  assert.notEqual(defaults().limitSlots, defaults().limitSlots);
  assert.deepEqual(sanitize({}).limitSlots, []);
  assert.deepEqual(sanitize({ limitSlots: EXAMPLE }).limitSlots, EXAMPLE);
  assert.deepEqual(sanitize({ limitSlots: 'junk' }).limitSlots, [{ start: '00:00', limit: 'G' }]);
  assert.deepEqual(sanitize({ limitSlots: [{ start: '06:00', limit: 'X' }] }).limitSlots, [{ start: '06:00', limit: 'G' }]);
});

test('createLimitWatch calls onChange once per change of the limit in force, with the new and the old limit', () => {
  let now = at(5, 59);
  const settings = withSlots(EXAMPLE);
  const seen = [];
  const watch = createLimitWatch({ getSettings: () => settings, now: () => now, onChange: (next, previous) => seen.push([next, previous]) });
  assert.equal(watch.limit, '');
  watch.check();
  assert.deepEqual(seen, [], 'no change, no call');
  now = at(6, 0);
  watch.check();
  watch.check();
  assert.deepEqual(seen, [['G', '']]);
  now = at(15, 0);
  watch.check();
  assert.deepEqual(seen, [['G', ''], ['PG-13', 'G']]);
  now = new Date(1970, 0, 1); // a clock that falls back to 1970 is a change too (to the strictest)
  watch.check();
  assert.deepEqual(seen.at(-1), ['G', 'PG-13']);
});

test('createLimitWatch.sync adopts the current limit without a call, and follows changed settings', () => {
  let now = at(12, 0);
  let settings = withSlots(EXAMPLE);
  const seen = [];
  const watch = createLimitWatch({ getSettings: () => settings, now: () => now, onChange: (...a) => seen.push(a) });
  settings = withSlots(EXAMPLE, 'G');
  settings = { ...settings, limitSlots: [slot('00:00', 'R')] };
  watch.sync();
  assert.equal(watch.limit, 'R');
  watch.check();
  assert.deepEqual(seen, [], 'after sync nothing is reported');
  settings = { ...settings, limitSlots: [slot('00:00', 'PG')] };
  watch.check();
  assert.deepEqual(seen, [['PG', 'R']], 'a settings change is seen as a change of the limit in force');
});

// ---- D104: the carry-over takes the latest of yesterday's slots that ALSO apply today ----

test('D104: adding a weekend slot does not move an hour it does not cover to the base limit (the cold probe)', () => {
  const daily = withSlots([slot('06:00', 'G')], 'R');
  const both = withSlots([slot('06:00', 'G'), slot('20:00', 'PG-13', [0, 6])], 'R');
  for (const [name, d] of [['Mon 03:00', at(3, 0, MON)], ['Tue 03:00', at(3, 0, 6)], ['Sat 03:00', at(3, 0, SAT)]]) {
    assert.equal(limitInForce(daily, d), 'G', `daily only, ${name}`);
    assert.equal(limitInForce(both, d), 'G', `with the weekend slot, ${name}`);
  }
  assert.equal(limitInForce(both, at(23, 0, SUN)), 'PG-13', 'Sunday 23:00: the weekend slot started at 20:00');
  assert.equal(limitInForce(both, at(3, 0, SUN)), 'PG-13', 'Sunday 03:00: of Saturday\'s slots that also apply Sunday, the weekend slot (20:00) starts later than the daily one (06:00)');
});

test('D104: with no slot of yesterday that also applies today, the base limit applies', () => {
  const weekend = withSlots([slot('20:00', 'PG-13', [0, 6])], 'R');
  assert.equal(limitInForce(weekend, at(3, 0, MON)), 'R', 'Monday 03:00: Sunday\'s only slot does not apply on Monday');
  assert.equal(limitInForce(weekend, at(3, 0, SAT)), 'R', 'Saturday 03:00: Friday has no slot');
  assert.equal(limitInForce(withSlots([slot('06:00', 'G', [1])], 'R'), at(3, 0, 6)), 'R', 'Tuesday 03:00: a Monday-only slot does not apply on Tuesday');
});

test('D104: at the carry-over the stricter of two slots at the same start wins, in either order', () => {
  const g = slot('22:00', 'G');
  const none = slot('22:00', '');
  assert.equal(limitInForce(withSlots([g, none], 'R'), at(3, 0, 6)), 'G');
  assert.equal(limitInForce(withSlots([none, g], 'R'), at(3, 0, 6)), 'G');
  assert.equal(limitInForce(withSlots([slot('22:00', 'PG'), slot('22:00', 'R'), slot('22:00', 'PG-13')], 'NC-17'), at(3, 0, 6)), 'PG', 'three at one start');
});

test('D105: "G Sundays only" and "no limit every day", both 22:00, base PG-13: Monday 03:00 is the base limit (never looser than it)', () => {
  const s = withSlots([slot('22:00', 'G', [0]), slot('22:00', '')], 'PG-13');
  assert.equal(limitInForce(s, at(3, 0, MON)), 'PG-13', 'Monday 03:00: the Sunday-only G does not run on, so the every-day slot carries but is capped at the base limit');
  assert.equal(limitInForce(s, at(23, 0, SUN)), 'G', 'Sunday 23:00: both applied, the stricter wins');
  assert.equal(limitInForce(s, at(23, 0, MON)), '', 'Monday 23:00: only the every-day slot started');
  assert.equal(limitInForce(s, at(3, 0, 6)), '', 'Tuesday 03:00: the every-day slot ran on from Monday');
});

test('describeLimitNow names the real change time across a spring-forward gap', () => {
  const script = `
    import { describeLimitNow } from ${JSON.stringify(new URL('../js/limit-schedule.js', import.meta.url).href)};
    const s = { maxContentRating: 'G', limitSlots: [{ start: '02:30', limit: '' }, { start: '06:00', limit: 'G' }] };
    // 2026-03-08 is the US spring-forward day: 02:00 -> 03:00, so 02:30 never shows on the clock.
    console.log(JSON.stringify([describeLimitNow(s, new Date(2026, 2, 8, 1, 50)), new Date(2026, 2, 8, 2, 30).getHours()]));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: 'America/New_York' } }).toString();
  assert.deepEqual(JSON.parse(out), ['In force now: G until 03:00.', 3], 'the 02:30 slot starts when the clock reaches 03:00');
  // In a zone with no gap the text is the plain start time.
  const plain = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: 'UTC' } }).toString();
  assert.deepEqual(JSON.parse(plain), ['In force now: G until 02:30.', 2]);
});

// ---- D105: the carry-over grid (the conductor's rows: .orchestrator/artifacts/rating-schedule--carry-grid-r1.out, rule C) ----

const WE = [0, 6];
const WD = [1, 2, 3, 4, 5];
const SUN2 = 11; // 2026-01-11
const GRID = [
  ['walk r1 I1', 'PG-13', [slot('20:00', '', WE)], [[at(12, 0, MON), 'PG-13'], [at(3, 0, SUN2), ''], [at(21, 0, SAT), '']]],
  ['cold r2', 'R', [slot('06:00', 'G'), slot('20:00', 'PG-13', WE)], [[at(3, 0, MON), 'G'], [at(3, 0, SUN2), 'PG-13'], [at(3, 0, SAT), 'G']]],
  ['anchored r2 M1', 'PG-13', [slot('22:00', 'G', [0]), slot('22:00', '')], [[at(3, 0, MON), 'PG-13'], [at(23, 0, SUN2), 'G'], [at(3, 0, 6), '']]],
  ['cold r3 I1', 'PG-13', [slot('21:00', 'G', WD), slot('06:00', '')], [[at(23, 59, 9), 'G'], [at(3, 0, SAT), 'PG-13'], [at(3, 0, MON), ''], [at(3, 0, 6), 'G']]],
  ['every day', 'PG-13', EXAMPLE, [[at(3, 0, MON), ''], [at(7, 0, MON), 'G'], [at(23, 0, MON), '']]],
  ['one every-day slot', 'R', [slot('06:00', 'G')], [[at(3, 0, MON), 'G'], [at(7, 0, MON), 'G']]],
];
for (const [name, base, slots, whens] of GRID) {
  for (const [when, want] of whens) {
    test(`D105 grid: ${name}, base ${base}, ${when.toDateString()} ${when.toTimeString().slice(0, 5)} -> ${want || 'none'}`, () => {
      assert.equal(limitInForce(withSlots(slots, base), when), want);
    });
  }
}

test('D105: the carry-over is never looser than the base limit, but a slot that runs on from yesterday may be', () => {
  // Sunday-only "no limit" at 20:00 under G: Monday 03:00 has no slot running on, no slot carrying: the base.
  assert.equal(limitInForce(withSlots([slot('20:00', '', [0])], 'G'), at(3, 0, MON)), 'G');
  // The same slot every day runs on past midnight, looser than the base.
  assert.equal(limitInForce(withSlots([slot('20:00', '')], 'G'), at(3, 0, MON)), '');
  // A looser carrying slot is capped at the base; a stricter one is kept.
  assert.equal(limitInForce(withSlots([slot('20:00', 'NC-17', [0, 1]), slot('21:00', 'R', [0])], 'PG'), at(3, 0, MON)), 'PG', 'carrying NC-17 is capped at PG');
  assert.equal(limitInForce(withSlots([slot('20:00', 'G', [0, 1]), slot('21:00', 'R', [0])], 'PG-13'), at(3, 0, MON)), 'G', 'carrying G is kept (stricter than the base)');
});

test('D105: in the repeated hour of a fall-back change a slot that has started does not stop applying', () => {
  const script = `
    import { limitInForce } from ${JSON.stringify(new URL('../js/limit-schedule.js', import.meta.url).href)};
    const s = { maxContentRating: 'R', limitSlots: [{ start: '00:30', limit: '' }, { start: '01:30', limit: 'G' }, { start: '02:00', limit: 'PG' }] };
    // 2026-11-01 America/New_York: 02:00 EDT -> 01:00 EST, so 01:00-01:59 happens twice.
    const at = (iso) => limitInForce(s, new Date(iso));
    console.log(JSON.stringify([
      at('2026-11-01T05:10:00Z'), // 01:10 EDT, first pass: before 01:30
      at('2026-11-01T05:40:00Z'), // 01:40 EDT: the G slot has started
      at('2026-11-01T06:10:00Z'), // 01:10 EST, second pass: still G, not back to no limit
      at('2026-11-01T06:50:00Z'), // 01:50 EST
      at('2026-11-01T07:00:00Z'), // 02:00 EST: the 02:00 slot
      at('2026-11-01T04:00:00Z'), // 00:00 EDT: before the 00:30 slot; yesterday's last slot (02:00 PG) runs on
    ]));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: 'America/New_York' } }).toString();
  assert.deepEqual(JSON.parse(out), ['', 'G', 'G', 'G', 'PG', 'PG']);
});

test('describeLimitNow: in a zone that skips midnight (America/Santiago) a slot at 00:00 names 01:00 and the search ends', () => {
  const script = `
    import { describeLimitNow } from ${JSON.stringify(new URL('../js/limit-schedule.js', import.meta.url).href)};
    const s = { maxContentRating: 'G', limitSlots: [{ start: '00:00', limit: '' }, { start: '12:00', limit: 'G' }] };
    // 2026-09-06: Chile sets the clock forward at 00:00 to 01:00, so 00:00 never shows.
    console.log(describeLimitNow(s, new Date(2026, 8, 5, 20, 0)));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: 'America/Santiago' }, timeout: 8000 }).toString().trim();
  assert.equal(out, 'In force now: G until tomorrow 01:00.');
});

// ---- viewer-profiles: slots that name a profile (R-PROF-1, D117), and the carried D106 items ----

const kidsP = { id: 'k', name: 'Kids', maxContentRating: 'G' };
const adultsP = { id: 'a', name: 'Adults', maxContentRating: '' };
const teensP = { id: 't', name: 'Teens', maxContentRating: 'PG-13' };
const pslot = (start, profile, days) => (days ? { start, profile, days } : { start, profile });
const withP = (limitSlots, maxContentRating = 'PG-13', profiles = [kidsP, adultsP, teensP]) => ({ maxContentRating, limitSlots, profiles });

test('sanitizeSlots keeps a profile slot as { start, profile, days? } with no limit; a slot gives a limit OR a profile', () => {
  assert.deepEqual(sanitizeSlots([pslot('06:00', 'k'), pslot('07:00', 'a', [1, 2])]), [pslot('06:00', 'k'), pslot('07:00', 'a', [1, 2])]);
  assert.deepEqual(sanitizeSlots([{ start: '06:00', limit: 'R', profile: 'k' }]), [pslot('06:00', 'k')], 'both given: the profile wins and the limit is dropped');
  assert.deepEqual(sanitizeSlots([{ start: '06:00', profile: 7 }]), [pslot('06:00', '')], 'a profile that is not text names no profile');
  assert.deepEqual(sanitizeSlots([{ start: '06:00', profile: 'k', days: [] }]), [{ start: '06:00', limit: 'G' }], 'unreadable days: every day at the strictest limit, and the profile is not used');
  assert.deepEqual(sanitizeSlots([{ start: '06:00', limit: 'PG', profile: null }]), [{ start: '06:00', limit: 'PG' }], 'a null profile is no profile');
});

test('a profile slot gives its profile\'s limit; carry-over, ties and the base floor work as for a limit', () => {
  const s = withP([pslot('06:00', 'k'), pslot('15:00', 't'), pslot('22:00', 'a')]);
  assert.equal(limitInForce(s, at(7, 0)), 'G');
  assert.equal(limitInForce(s, at(16, 0)), 'PG-13');
  assert.equal(limitInForce(s, at(23, 0)), '');
  assert.equal(limitInForce(s, at(3, 0)), '', 'the 22:00 slot runs past midnight');
  assert.equal(limitInForce(withP([pslot('08:00', 'a'), pslot('08:00', 'k')]), at(9, 0)), 'G', 'the stricter of two at the same start');
  assert.equal(limitInForce(withP([pslot('20:00', 'a', [0])], 'G'), at(3, 0, MON)), 'G', 'carry-over is never looser than the base (D105)');
  assert.equal(limitInForce(withP([pslot('20:00', 'a')], 'G'), at(3, 0, MON)), '', 'a slot that runs on from yesterday may be');
});

test('slotInForce names the slot that gives the limit, or null', async () => {
  const { slotInForce } = await import('../js/limit-schedule.js');
  const s = withP([pslot('06:00', 'k'), slot('15:00', 'PG')]);
  assert.deepEqual(slotInForce(s, at(7, 0)), { limit: 'G', slot: pslot('06:00', 'k') });
  assert.deepEqual(slotInForce(s, at(16, 0)), { limit: 'PG', slot: slot('15:00', 'PG') });
  assert.deepEqual(slotInForce(withP([pslot('06:00', 'k', [1])], 'R'), at(7, 0, 6)), { limit: 'R', slot: null }, 'no slot: the base');
  assert.deepEqual(slotInForce(withP([pslot('06:00', 'a')], ''), at(7, 0)), { limit: '', slot: null }, 'toggle off: no slot is in force, nothing is applied (D120 4)');
  assert.deepEqual(slotInForce(null, at(7, 0)), { limit: STRICTEST, slot: null });
});

test('a slot naming a missing profile gives G while it is in force (D120 2), like an unreadable slot', () => {
  const s = withP([pslot('06:00', 'gone'), slot('15:00', 'R')], 'R', [adultsP, teensP]);
  assert.equal(limitInForce(s, at(7, 0)), 'G', 'in force: G, whatever the other profiles hold');
  assert.equal(limitInForce(s, at(16, 0)), 'R', 'not in force: the slot that is');
  assert.equal(limitInForce(s, at(3, 0)), 'R', 'carried over from the 15:00 slot');
  assert.equal(limitInForce(withP([pslot('06:00', 'gone')], 'R', []), at(7, 0)), 'G', 'with no profile at all');
  assert.equal(limitInForce(withP([pslot('06:00', 'gone')], 'R', undefined), at(7, 0)), 'G');
  assert.equal(limitInForce({ ...s, profiles: 'junk' }, at(7, 0)), 'G');
  assert.equal(limitInForce(withP([pslot('06:00', '')], 'PG', [adultsP]), at(7, 0)), 'G', 'an empty id names no profile');
  // The cold review's import repro: Kids (G) from 07:00, base PG-13, the profile gone: G at 08:00, never the looser base.
  assert.equal(limitInForce(withP([pslot('07:00', 'k')], 'PG-13', []), at(8, 0)), 'G');
  assert.equal(limitInForce(withP([pslot('07:00', 'k')], 'PG-13', [kidsP]), at(8, 0)), 'G');
  assert.equal(limitInForce(withP([pslot('07:00', 'k')], 'R', [{ ...kidsP, maxContentRating: 'PG' }]), at(8, 0)), 'PG', 'the profile present: its own limit');
  assert.equal(limitInForce(withP([pslot('07:00', 'k')], 'R', []), at(8, 0)), 'G', 'removed: G, not the PG it held');
});

test('an implausible clock counts every profile only when a slot names one', () => {
  const d = new Date(1970, 0, 1);
  assert.equal(limitInForce(withP([pslot('06:00', 'a')], 'R'), d), 'G', 'Kids (G) is a profile, so it counts');
  assert.equal(limitInForce(withP([slot('06:00', 'PG-13')], 'R'), d), 'PG-13', 'no slot names a profile: the profiles do not count');
});

test('the household toggle off is no limit even with profile slots', () => {
  assert.equal(limitInForce(withP([pslot('06:00', 'k'), pslot('07:00', 'gone')], ''), at(6, 30)), '');
});

test('anyLimitSet and hasMissingProfile', async () => {
  const { anyLimitSet, hasMissingProfile } = await import('../js/limit-schedule.js');
  assert.equal(anyLimitSet(withP([pslot('06:00', 'k')], '')), true, 'a profile with a limit');
  assert.equal(anyLimitSet(withP([pslot('06:00', 'a')], '')), false, 'a profile with no limit');
  assert.equal(anyLimitSet(withP([pslot('06:00', 'gone')], '')), true, 'a missing profile gives G');
  assert.equal(anyLimitSet(withP([slot('06:00', 'G')], '')), true);
  assert.equal(anyLimitSet(withP([slot('06:00', '')], '')), false);
  assert.equal(anyLimitSet(null), true);
  assert.equal(hasMissingProfile(withP([pslot('06:00', 'gone')]), at(7, 0)), true);
  assert.equal(hasMissingProfile(withP([pslot('06:00', 'gone'), slot('15:00', 'G')]), at(16, 0)), false, 'only while that slot is in force');
  assert.equal(hasMissingProfile(withP([pslot('06:00', 'k'), slot('07:00', 'G')]), at(8, 0)), false);
  assert.equal(hasMissingProfile(withP([pslot('06:00', 'gone')], ''), at(7, 0)), false, 'toggle off: nothing applies');
});

test('describeLimitNow names the profile in force; the toggle-off and missing-profile lines say what applies', () => {
  const s = withP([pslot('06:00', 'k'), pslot('21:00', 'a')]);
  assert.equal(describeLimitNow(s, at(7, 0)), 'In force now: G (Kids profile) until 21:00.');
  assert.equal(describeLimitNow(s, at(22, 0)), 'In force now: No limit (Adults profile) until tomorrow 06:00.');
  assert.equal(describeLimitNow(withP([pslot('06:00', 'k')]), at(7, 0)), 'In force now: G (Kids profile) all day.');
  assert.equal(describeLimitNow(withP([pslot('06:00', 'k')], ''), at(7, 0)), 'No limit applies: the household limit is off (the slots and profiles are kept, not applied).');
  assert.equal(describeLimitNow(withP([slot('06:00', 'G')], ''), at(7, 0)), 'No limit applies: the household limit is off (the slots are kept, not applied).');
  assert.equal(describeLimitNow(withP([pslot('06:00', 'gone')], 'R'), at(7, 0)), 'The slot in force names a profile that does not exist, so G applies. Choose another profile or a limit for that slot.');
  assert.match(describeLimitNow(withP([pslot('06:00', 'gone'), slot('15:00', 'R')], 'R'), at(16, 0)), /^In force now: R until/, 'not in force: no complaint');
});

test('nextLimitChange sees a change of profile that leaves the limit as it was', () => {
  const s = withP([pslot('06:00', 'k'), pslot('15:00', 'k2')], 'PG-13', [kidsP, { ...kidsP, id: 'k2', name: 'Tots' }]);
  assert.deepEqual(nextLimitChange(s, at(7, 0)), { limit: 'G', until: at(15, 0) });
  assert.equal(describeLimitNow(s, at(16, 0)), 'In force now: G (Tots profile) until tomorrow 06:00.');
});

test('createLimitWatch calls onChange when only the profile changes; with the toggle off no profile switches anything', () => {
  let now = at(6, 30);
  const seen = [];
  const s = withP([pslot('06:00', 'k'), pslot('07:00', 'k2')], 'PG-13', [kidsP, { ...kidsP, id: 'k2', name: 'Tots' }]);
  const watch = createLimitWatch({ getSettings: () => s, now: () => now, onChange: (n, p) => seen.push([n, p]) });
  assert.equal(watch.profile, 'k');
  now = at(7, 0);
  watch.check();
  watch.check();
  assert.deepEqual(seen, [['G', 'G']], 'same limit, other profile: one call');
  assert.equal(watch.profile, 'k2');
  const off = { ...s, maxContentRating: '' };
  now = at(5, 59);
  const seenOff = [];
  const w2 = createLimitWatch({ getSettings: () => off, now: () => now, onChange: (n, p) => seenOff.push([n, p]) });
  now = at(6, 0);
  w2.check();
  now = at(7, 0);
  w2.check();
  assert.deepEqual(seenOff, [], 'toggle off: nothing is applied, so nothing changes');
  assert.equal(w2.profile, null);
});

test('createLimitWatch reads the settings and the clock once per check', () => {
  let clock = 0;
  let reads = 0;
  const s = withP([pslot('06:00', 'k'), slot('06:00', 'PG')], 'PG-13');
  const watch = createLimitWatch({ getSettings: () => (reads++, s), now: () => (clock++, at(7, 0)), onChange: () => {} });
  [clock, reads] = [0, 0];
  watch.check();
  assert.deepEqual([clock, reads], [1, 1]);
  watch.sync();
  assert.deepEqual([clock, reads], [2, 2]);
});

test('a carried profile whose limit equals the base still applies its bundle (D105 floor ties go to the slot)', () => {
  const s = withP([pslot('20:00', 'k')], 'G');
  assert.equal(slotInForce(s, at(3, 0, MON)).slot?.profile, 'k', 'Monday 03:00: Kids (G) carries over past midnight and the base is G: the slot, not the bare base');
});

test('two equally strict slots at the same start: the first listed supplies the profile', () => {
  const twin = { ...kidsP, id: 'k2', name: 'Twin' };
  const a = slotInForce(withP([pslot('06:00', 'k2'), pslot('06:00', 'k')], 'PG-13', [kidsP, twin]), at(7, 0));
  assert.equal(a.slot.profile, 'k2');
  const b = slotInForce(withP([pslot('06:00', 'k'), pslot('06:00', 'k2')], 'PG-13', [kidsP, twin]), at(7, 0));
  assert.equal(b.slot.profile, 'k');
});

test('D106 2: in the repeated autumn hour the status line never names a time already past', () => {
  const script = `
    import { describeLimitNow, nextLimitChange } from ${JSON.stringify(new URL('../js/limit-schedule.js', import.meta.url).href)};
    const s = { maxContentRating: 'R', limitSlots: [{ start: '00:30', limit: '' }, { start: '01:20', limit: 'R' }, { start: '01:30', limit: 'G' }, { start: '02:00', limit: 'PG' }] };
    // 2026-11-01 America/New_York: 01:00-01:59 happens twice. 06:10Z is 01:10 EST, the second pass.
    const d = new Date('2026-11-01T06:10:00Z');
    console.log(JSON.stringify([describeLimitNow(s, d), nextLimitChange(s, d).until.toISOString()]));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: 'America/New_York' } }).toString();
  assert.deepEqual(JSON.parse(out), ['In force now: G until 02:00.', '2026-11-01T07:00:00.000Z']);
});

test('D106 4: a change a week away says "next <weekday>"', () => {
  const s = withSlots([slot('08:00', 'G', [1]), slot('09:00', 'R', [1])], 'R');
  assert.equal(describeLimitNow(s, at(9, 30, MON)), 'In force now: R until next Mon 08:00.');
  assert.equal(describeLimitNow(s, at(9, 30, 6)), 'In force now: R until Mon 08:00.', 'six days away is still the bare weekday');
});

test('D106 5: the slots in force at the end of yesterday run on only when every one of them applies today (base G, PG-13 every day, no limit Sundays)', () => {
  const s = withSlots([slot('22:00', 'PG-13'), slot('22:00', '', [0])], 'G');
  assert.equal(limitInForce(s, at(3, 0, MON)), 'G', 'Sunday\'s no-limit slot does not apply on Monday, so the pair does not run on: the carrying PG-13 is capped at the base');
  assert.equal(limitInForce(s, at(23, 0, SUN)), 'PG-13', 'Sunday 23:00: both slots started at 22:00 and the stricter wins');
});
