// The poster selection (R-SEL-1, D107): which libraries, genres, ratings, collection or playlist the pool is drawn from.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  belongsTo,
  cleanServerId,
  memberBelongsTo,
  scopeKey,
  splitKey,
  cleanGenres,
  cleanHouses,
  houseRequestValue,
  cleanKeys,
  cleanNames,
  cleanRatings,
  cleanSource,
  describeSelection,
  genresAreAll,
  entryInSelection,
  genreRequestValue,
  libraryShares,
  memberId,
  narrows,
  posterAllowed,
  ratingValues,
  selectionKey,
  selectionOf,
} from '../js/selection.js';
import { allowedValues } from '../js/ratings.js';

const sel = (over = {}) => selectionOf({ libraryKeys: ['1'], libraryNames: ['Movies'], ...over });

test('a 2.2 settings object with only libraryKey is one library and nothing else', () => {
  const s = selectionOf({ libraryKey: '1', libraryName: 'Movies' });
  assert.deepEqual(s, { libraries: [{ key: '1', name: 'Movies' }], genres: [], houses: [], ratings: [], source: null });
  assert.equal(narrows(s), false);
});

test('libraryKeys win over libraryKey, with their names', () => {
  const s = selectionOf({ libraryKey: '9', libraryKeys: ['1', '3'], libraryNames: ['Movies', 'Kids Movies'] });
  assert.deepEqual(s.libraries, [{ key: '1', name: 'Movies' }, { key: '3', name: 'Kids Movies' }]);
});

test('no library at all is an empty selection', () => {
  assert.deepEqual(selectionOf({}).libraries, []);
  assert.deepEqual(selectionOf({ libraryKey: '' }).libraries, []);
});

test('narrows: several libraries, a genre, a rating subset, a collection or a playlist each narrow; one library does not', () => {
  assert.equal(narrows(sel()), false);
  assert.equal(narrows(selectionOf({ libraryKeys: ['1', '3'] })), true, 'two libraries');
  assert.equal(narrows(sel({ genres: [{ key: '12', title: 'Comedy' }] })), true, 'a genre');
  assert.equal(narrows(sel({ ratings: ['G'] })), true, 'a rating subset');
  assert.equal(narrows(sel({ source: { kind: 'collection', key: '101', title: 'Double Features' } })), true, 'a collection');
  assert.equal(narrows(sel({ source: { kind: 'playlist', key: '201', title: 'Friday' } })), true, 'a playlist');
});

test('sanitisers: keys, names, genres, ratings and source coerce junk to nothing', () => {
  assert.deepEqual(cleanKeys(['1', 3, '', ' 3 ', '1', null, {}]), ['1', '3'], 'strings and numbers, trimmed, no blanks, no repeats');
  assert.deepEqual(cleanKeys('1'), []);
  assert.deepEqual(cleanKeys(undefined), []);
  assert.deepEqual(cleanNames(['Movies', 4, null]), ['Movies', '', '']);
  assert.deepEqual(cleanNames('x'), []);
  assert.deepEqual(cleanGenres([{ key: 12, title: 'Comedy' }, { title: 'Drama' }, { key: '3' }, 'x', null, { key: '12', title: 'comedy' }]), [{ key: '12', title: 'Comedy' }, { key: '', title: 'Drama' }], 'a genre needs a title; the same title once');
  assert.deepEqual(cleanGenres('Comedy'), []);
  assert.deepEqual(cleanRatings(['R', 'G', 'bogus', 'G', 'PG-13', 7]), ['G', 'PG-13', 'R'], 'only ladder values, once, lowest first');
  assert.deepEqual(cleanRatings('G'), []);
  assert.deepEqual(cleanSource({ kind: 'collection', key: 101, title: 'Top' }), { kind: 'collection', key: '101', title: 'Top' });
  assert.deepEqual(cleanSource({ kind: 'playlist', key: '201' }), { kind: 'playlist', key: '201', title: '' });
  assert.equal(cleanSource({ kind: 'album', key: '1' }), null, 'unknown kind');
  assert.equal(cleanSource({ kind: 'collection', key: '' }), null, 'no key');
  assert.equal(cleanSource('x'), null);
  assert.equal(cleanSource(null), null);
});

test('libraryShares splits the total by title count (largest remainder) and always sums to the total', () => {
  assert.deepEqual(libraryShares(100, [8, 5]), [62, 38]);
  assert.deepEqual(libraryShares(100, [1000, 10]), [99, 1]);
  assert.deepEqual(libraryShares(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(libraryShares(100, [0, 5]), [0, 100], 'an empty library gets nothing');
  for (const counts of [[8, 5], [3, 3, 3], [1, 99], [7, 0, 13], [5, 5, 5, 5, 5]]) {
    for (const total of [1, 2, 3, 7, 50, 100, 333, 1000]) {
      const sizes = libraryShares(total, counts);
      assert.equal(sizes.reduce((a, b) => a + b, 0), total, `${counts} / ${total}`);
      sizes.forEach((n, i) => assert.ok(Math.abs(n - (total * counts[i]) / counts.reduce((a, b) => a + b, 0)) < 1, `${counts} / ${total} #${i}`));
    }
  }
});

test('libraryShares: a count that is unknown, or all counts zero, splits evenly', () => {
  assert.deepEqual(libraryShares(100, [8, null]), [50, 50]);
  assert.deepEqual(libraryShares(101, [null, null]), [51, 50]);
  assert.deepEqual(libraryShares(10, [0, 0]), [5, 5]);
  assert.deepEqual(libraryShares(100, [8]), [100]);
  assert.deepEqual(libraryShares(100, []), []);
});

test('ratingValues: only the chosen rungs, only at or under the limit, nothing above or unrated', () => {
  const pg = ratingValues(['PG'], 'PG-13');
  assert.deepEqual([...pg].sort(), ['PG', 'TV-PG', 'TV-Y7', 'au/PG', 'ca/PG', 'de/6', 'fr/10', 'gb/PG', 'nl/6', 'nl/9'].sort());
  assert.ok(!pg.includes('G') && !pg.includes('PG-13'), 'not the neighbours');
  assert.deepEqual(ratingValues(['R'], 'PG'), [], 'a rating above the limit is dropped');
  assert.deepEqual(ratingValues(['G', 'PG'], 'PG-13').sort(), [...ratingValues(['G'], 'PG-13'), ...ratingValues(['PG'], 'PG-13')].sort());
  assert.deepEqual(ratingValues(['R'], 'R').filter((v) => !allowedValues('R').includes(v)), [], 'nothing outside the limit values');
  assert.ok(ratingValues(['R'], '').includes('TV-MA'), 'no limit in force: any chosen rung');
  assert.deepEqual(ratingValues([], 'PG-13'), []);
  assert.deepEqual(ratingValues(['G'], 'bogus'), [], 'a corrupt limit allows nothing');
});

test('genreRequestValue: the key when there is one, else the title', () => {
  assert.equal(genreRequestValue({ key: '12', title: 'Comedy' }), '12');
  assert.equal(genreRequestValue({ key: '', title: 'Comedy' }), 'Comedy');
});

const P = (over) => ({ ratingKey: '1', contentRating: 'PG', genres: ['Comedy'], ...over });

test('posterAllowed: the limit in force always applies', () => {
  assert.equal(posterAllowed(sel(), 'PG', P({ contentRating: 'PG-13' })), false, 'above the limit');
  assert.equal(posterAllowed(sel(), 'PG', P({ contentRating: '' })), false, 'unrated under a limit');
  assert.equal(posterAllowed(sel(), 'PG', P()), true);
  assert.equal(posterAllowed(sel(), '', P({ contentRating: '' })), true, 'no limit allows unrated');
});

test('posterAllowed: a rating subset is intersected with the limit and never adds a rating', () => {
  const s = sel({ ratings: ['G', 'PG', 'R'] });
  assert.equal(posterAllowed(s, 'PG-13', P({ contentRating: 'G' })), true);
  assert.equal(posterAllowed(s, 'PG-13', P({ contentRating: 'TV-PG' })), true, 'same rung as PG');
  assert.equal(posterAllowed(s, 'PG-13', P({ contentRating: 'PG-13' })), false, 'at the limit but not chosen');
  assert.equal(posterAllowed(s, 'PG-13', P({ contentRating: 'R' })), false, 'chosen but above the limit');
  assert.equal(posterAllowed(s, 'PG-13', P({ contentRating: '' })), false, 'unrated');
  assert.equal(posterAllowed(s, '', P({ contentRating: 'R' })), true, 'no limit: the chosen R is shown');
  assert.equal(posterAllowed(s, '', P({ contentRating: '' })), false, 'no limit but a subset: unrated is still not chosen');
  assert.equal(posterAllowed(s, '', P({ contentRating: 'NC-17' })), false);
});

test('posterAllowed: a genre set keeps titles with any chosen genre, by the title own genres, and fails closed without them', () => {
  const s = sel({ genres: [{ key: '12', title: 'Comedy' }, { key: '11', title: 'Drama' }] });
  assert.equal(posterAllowed(s, '', P({ genres: ['Thriller', 'comedy'] })), true, 'case does not matter');
  assert.equal(posterAllowed(s, '', P({ genres: ['Thriller'] })), false);
  assert.equal(posterAllowed(s, '', P({ genres: [] })), false);
  assert.equal(posterAllowed(s, '', P({ genres: undefined })), false, 'a reply with no genres cannot be shown to be in the set');
  assert.equal(posterAllowed(sel(), '', P({ genres: undefined })), true, 'no genre chosen: genres are not looked at');
});

test('posterAllowed: a collection or playlist takes no genre filter', () => {
  const s = sel({ genres: [{ key: '12', title: 'Comedy' }], source: { kind: 'collection', key: '101', title: 'DF' } });
  assert.equal(posterAllowed(s, '', P({ genres: ['Drama'] })), true);
  assert.equal(posterAllowed(s, 'PG', P({ contentRating: 'R' })), false, 'but the limit still applies');
});

test('entryInSelection: with the 2.2 selection every entry counts, old ones too', () => {
  assert.equal(entryInSelection({ ratingKey: '1' }, sel(), 'PG'), true);
  assert.equal(entryInSelection({ ratingKey: '1' }, null, 'PG'), true);
});

test('entryInSelection: an entry without the new fields is never chosen under a narrowing selection', () => {
  const old = { ratingKey: '1', contentRating: 'G' };
  assert.equal(entryInSelection(old, selectionOf({ libraryKeys: ['1', '3'] }), ''), false, 'two libraries');
  assert.equal(entryInSelection(old, sel({ genres: [{ key: '', title: 'Comedy' }] }), ''), false, 'a genre');
  assert.equal(entryInSelection(old, sel({ ratings: ['G'] }), ''), false, 'a rating subset: it has a rating but no library');
  assert.equal(entryInSelection(old, sel({ source: { kind: 'playlist', key: '201', title: 'P' } }), ''), false, 'a playlist');
});

test('entryInSelection: libraries', () => {
  const two = selectionOf({ libraryKeys: ['1', '3'] });
  assert.equal(entryInSelection({ libraryKey: '3', contentRating: 'G' }, two, ''), true);
  assert.equal(entryInSelection({ libraryKey: '2', contentRating: 'G' }, two, ''), false, 'another library');
  assert.equal(entryInSelection({ libraryKey: 3, contentRating: 'G' }, two, ''), false, 'a key that is not a string is not recorded membership');
});

test('entryInSelection: genres need the entry to record one of them', () => {
  const s = sel({ genres: [{ key: '12', title: 'Comedy' }] });
  assert.equal(entryInSelection({ libraryKey: '1', genres: ['Drama', 'comedy'] }, s, ''), true);
  assert.equal(entryInSelection({ libraryKey: '1', genres: ['Drama'] }, s, ''), false);
  assert.equal(entryInSelection({ libraryKey: '1' }, s, ''), false, 'no genres recorded');
  assert.equal(entryInSelection({ libraryKey: '2', genres: ['Comedy'] }, s, ''), false, 'right genre, wrong library');
});

test('entryInSelection: a rating subset is checked on the entry rating, under the limit', () => {
  const s = sel({ ratings: ['G', 'PG'] });
  assert.equal(entryInSelection({ libraryKey: '1', contentRating: 'TV-G' }, s, 'PG-13'), true);
  assert.equal(entryInSelection({ libraryKey: '1', contentRating: 'PG-13' }, s, 'PG-13'), false);
  assert.equal(entryInSelection({ libraryKey: '1', contentRating: '' }, s, ''), false);
  assert.equal(entryInSelection({ libraryKey: '1' }, s, ''), false);
  assert.equal(entryInSelection({ libraryKey: '1', contentRating: 'PG' }, sel({ ratings: ['PG'] }), 'G'), false, 'a chosen rating above the limit is never in');
});

test('entryInSelection: a collection or playlist needs recorded membership of exactly that source, not the library', () => {
  const c = sel({ source: { kind: 'collection', key: '101', title: 'DF' } });
  assert.equal(entryInSelection({ libraryKey: '1', members: ['collection:101'] }, c, ''), true);
  assert.equal(entryInSelection({ libraryKey: '1', members: ['collection:102', 'playlist:101'] }, c, ''), false);
  assert.equal(entryInSelection({ libraryKey: '1' }, c, ''), false, 'in the library, not recorded in the collection');
  assert.equal(entryInSelection({ libraryKey: '1', members: 'collection:101' }, c, ''), false, 'members is a list');
  const p = sel({ source: { kind: 'playlist', key: '201', title: 'P' } });
  assert.equal(entryInSelection({ members: ['playlist:201'] }, p, ''), true);
  assert.equal(entryInSelection({ members: ['collection:201'] }, p, ''), false);
  assert.equal(memberId({ kind: 'playlist', key: '201' }), 'playlist:201');
});

test('entryInSelection: a source ignores the genre set but keeps the rating subset', () => {
  const s = sel({ genres: [{ key: '', title: 'Comedy' }], ratings: ['G'], source: { kind: 'collection', key: '101', title: 'DF' } });
  assert.equal(entryInSelection({ members: ['collection:101'], genres: ['Drama'], contentRating: 'G' }, s, ''), true);
  assert.equal(entryInSelection({ members: ['collection:101'], contentRating: 'PG' }, s, ''), false);
});

test('selectionKey changes with every selection field and not with names', () => {
  const base = selectionKey(sel());
  const keys = [
    selectionKey(selectionOf({ libraryKeys: ['1', '3'] })),
    selectionKey(sel({ genres: [{ key: '12', title: 'Comedy' }] })),
    selectionKey(sel({ ratings: ['G'] })),
    selectionKey(sel({ source: { kind: 'collection', key: '101', title: 'x' } })),
    selectionKey(sel({ source: { kind: 'playlist', key: '101', title: 'x' } })),
  ];
  assert.equal(new Set([base, ...keys]).size, keys.length + 1);
  assert.equal(selectionKey(selectionOf({ libraryKeys: ['1'], libraryNames: ['Renamed'] })), base, 'a library renamed in Plex is the same selection');
});

test('describeSelection names the libraries, genres, ratings, collection or playlist', () => {
  assert.equal(describeSelection(selectionOf({ libraryKeys: ['1', '3'], libraryNames: ['Movies', 'Kids Movies'] })), 'Movies and Kids Movies');
  assert.equal(describeSelection(selectionOf({ libraryKeys: ['1'], libraryNames: [''] , genres: [{ key: '1', title: 'Comedy' }, { key: '2', title: 'Drama' }], ratings: ['G', 'PG'] })), 'library 1, genres Comedy or Drama, rated G or PG');
  assert.equal(describeSelection(sel({ genres: [{ key: '1', title: 'Comedy' }] })), 'Movies, genre Comedy');
  assert.equal(describeSelection(sel({ source: { kind: 'collection', key: '1', title: 'Top Rated' }, ratings: ['G'], genres: [{ key: '1', title: 'Comedy' }] })), 'the collection "Top Rated", rated G');
  assert.equal(describeSelection(sel({ source: { kind: 'playlist', key: '1', title: '' } })), 'the playlist');
});

// ---- r2 (D109 item 1): the ratings Settings offers run up to the loosest limit of the base and every time slot ----
import { offeredRatings } from '../js/selection.js';

test('offeredRatings: up to the base limit with no slots, all five with no limit', () => {
  assert.deepEqual(offeredRatings('PG', []), ['G', 'PG']);
  assert.deepEqual(offeredRatings('PG-13', undefined), ['G', 'PG', 'PG-13']);
  assert.deepEqual(offeredRatings('NC-17', []), ['G', 'PG', 'PG-13', 'R', 'NC-17']);
  assert.deepEqual(offeredRatings('', []), ['G', 'PG', 'PG-13', 'R', 'NC-17'], 'the toggle off: no limit');
  assert.deepEqual(offeredRatings('', [{ start: '06:00', limit: 'G' }]), ['G', 'PG', 'PG-13', 'R', 'NC-17'], 'toggle off: slots are not applied, and do not narrow what is offered');
});

test('offeredRatings: a looser slot widens it, a stricter slot does not narrow it, a "No limit" slot offers everything', () => {
  assert.deepEqual(offeredRatings('PG-13', [{ start: '22:00', limit: 'R' }]), ['G', 'PG', 'PG-13', 'R']);
  assert.deepEqual(offeredRatings('PG-13', [{ start: '06:00', limit: 'G' }]), ['G', 'PG', 'PG-13'], 'the base still counts');
  assert.deepEqual(offeredRatings('PG-13', [{ start: '06:00', limit: 'G' }, { start: '22:00', limit: '' }]), ['G', 'PG', 'PG-13', 'R', 'NC-17']);
  assert.deepEqual(offeredRatings('G', [{ start: '06:00', limit: 'PG' }, { start: '15:00', limit: 'PG-13' }]), ['G', 'PG', 'PG-13']);
});

test('offeredRatings: junk in the slots offers no more than the base', () => {
  assert.deepEqual(offeredRatings('PG', [null, 7, { limit: 'XX' }, {}, { start: '1:00', limit: undefined }]), ['G', 'PG']);
  assert.deepEqual(offeredRatings('PG', 'not a list'), ['G', 'PG']);
});

// ---- r2 gap 13 (D109 item 4): the extended validation file asks whether a list reply carries every Genre tag ----
import { readFileSync } from 'node:fs';

test('r2 gap 13: docs/validation/real-server-extended.md has a (verify) row for the Genre tags of a list reply, and every selection row is unrun', () => {
  const doc = readFileSync(new URL('../docs/validation/real-server-extended.md', import.meta.url), 'utf8');
  const row = doc.split('\n').find((l) => l.startsWith('- [ ] V1-E35'));
  assert.ok(row, 'row V1-E35 is there');
  assert.match(row, /carries every tag the title has/);
  assert.match(row, /Result: PASS \| FAIL \(poster-selection\)/);
  for (let n = 28; n <= 35; n++) assert.ok(doc.includes(`- [ ] V1-E${n} `), `V1-E${n}`);
  assert.match(doc, /Overall: PENDING \(section H, V1-E28 to V1-E35/);
});

// ---- r3 gap 1 (D110 item 1): does the poster on screen still match the saved selection? ----
import { posterMatches } from '../js/selection.js';

test('posterMatches: a poster from another library, genre or rating, or outside the collection, no longer matches', () => {
  const on = (over) => ({ ratingKey: '1', source: 'random', contentRating: 'G', libraryKey: '1', genres: ['Comedy'], ...over });
  const kids = selectionOf({ libraryKeys: ['3'] });
  assert.equal(posterMatches(kids, '', on({ libraryKey: '1' })), false, 'another library');
  assert.equal(posterMatches(kids, '', on({ libraryKey: '3' })), true);
  assert.equal(posterMatches(sel({ genres: [{ key: '', title: 'Drama' }] }), '', on()), false, 'another genre');
  assert.equal(posterMatches(sel({ genres: [{ key: '', title: 'comedy' }] }), '', on()), true);
  assert.equal(posterMatches(sel({ ratings: ['NC-17'] }), '', on()), false, 'a rating not chosen');
  assert.equal(posterMatches(sel({ ratings: ['G'] }), '', on()), true);
  assert.equal(posterMatches(sel(), 'G', on({ contentRating: 'PG' })), false, 'above the limit in force');
  const c = sel({ source: { kind: 'collection', key: '101', title: 'x' } });
  assert.equal(posterMatches(c, '', on({ members: ['collection:101'] })), true);
  assert.equal(posterMatches(c, '', on({ members: ['playlist:101'] })), false);
  assert.equal(posterMatches(c, '', on()), false, 'a library poster is not in the collection');
  assert.equal(posterMatches(sel({ genres: [{ key: '', title: 'Drama' }], source: { kind: 'collection', key: '1', title: 'x' } }), '', on({ members: ['collection:1'] })), true, 'a source takes no genre');
});

test('posterMatches: the 2.2 selection only drops a poster recorded in another library; a missing record fails closed only when narrowing', () => {
  assert.equal(posterMatches(sel(), '', { source: 'random', contentRating: 'G' }), true, 'one library, no library recorded: stays (as in 2.2)');
  assert.equal(posterMatches(sel(), '', { source: 'random', contentRating: 'G', libraryKey: '3' }), false);
  assert.equal(posterMatches(selectionOf({ libraryKeys: ['1', '3'] }), '', { source: 'random', contentRating: 'G' }), false, 'narrowing and no record: not shown to belong');
  assert.equal(posterMatches(sel({ genres: [{ key: '', title: 'Comedy' }] }), '', { source: 'cache', contentRating: 'G', libraryKey: '1', genres: ['Comedy'] }), true, 'a cached poster is judged the same');
});

test('posterMatches: a pinned or playing poster is not the selection\'s to judge', () => {
  const narrow = sel({ ratings: ['NC-17'], genres: [{ key: '', title: 'Western' }] });
  for (const source of ['static', 'now-playing']) assert.equal(posterMatches(narrow, '', { source, contentRating: 'G' }), true, source);
});

test('r3 D110 item 4: the rating help in Settings and R-SEL-1 both say ratings are offered up to the loosest of the limit and the time slots', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="rating-help"[^>]*>[^<]*offered up to the loosest of the limit and the time slots/);
  assert.doesNotMatch(html, /Only ratings at or under the limit are offered/);
  const spec = readFileSync(new URL('../docs/spec.md', import.meta.url), 'utf8');
  const block = spec.slice(spec.indexOf('**R-SEL-1'), spec.indexOf('### Documentation'));
  assert.match(block, /offers ratings up to the loosest of the limit and the time slots/);
  assert.doesNotMatch(block, /offers only ratings at or under the limit/);
});

test('r4 gap 4: the R-SEL-1 "Empty result" bullet gives the wording the engine prints and the condition for "add a library"', () => {
  const spec = readFileSync(new URL('../docs/spec.md', import.meta.url), 'utf8');
  const bullet = spec.split('\n').find((l) => l.startsWith('- **Empty result'));
  for (const text of ['add a library', 'only when the server lists a movie library that is not ticked', 'tick fewer genres or ratings', 'use the libraries instead of the collection', 'then `tick fewer ratings` when ratings are ticked', 'No posters found in Movies, genre Western (add a library or tick fewer genres).']) assert.ok(bullet.includes(text), text);
});

test('D112 item 2: every library with titles gets at least one slot of the pool, and the shares stay proportional otherwise', () => {
  assert.deepEqual(libraryShares(100, [10000, 10]), [99, 1]);
  assert.deepEqual(libraryShares(100, [100000, 10]), [99, 1], 'a share that rounds to nothing is lifted to one, taken from the largest');
  assert.deepEqual(libraryShares(100, [10, 10000]), [1, 99]);
  assert.deepEqual(libraryShares(100, [10000, 10, 10]), [98, 1, 1]);
  assert.deepEqual(libraryShares(100, [10000, 0, 10]), [99, 0, 1], 'an empty library still gets nothing');
  assert.deepEqual(libraryShares(2, [10000, 10, 10]), [1, 1, 0], 'when the pool is too small for every library, the lift stops at the pool size');
  for (const counts of [[100000, 3], [5000, 1, 1, 1], [1, 100000], [7, 7, 7], [123456, 2, 55]]) {
    for (const total of [3, 10, 100, 1000]) {
      const sizes = libraryShares(total, counts);
      assert.equal(sizes.reduce((a, b) => a + b, 0), total, `${total} over ${counts}`);
      if (total >= counts.length) assert.ok(sizes.every((n, i) => counts[i] === 0 || n >= 1), `${total} over ${counts}: ${sizes}`);
    }
  }
});

// ---- ids by server (D156 2, D157 1, 12) ----

test('a scoped id names its server and an id stored by 2.4.0 never looks scoped (D157 12)', () => {
  assert.equal(scopeKey('abc-1', '42'), '@abc-1/42');
  assert.deepEqual(splitKey('@abc-1/a/b'), { serverId: 'abc-1', key: 'a/b' }, 'the first "/" ends the server id');
  for (const bare of ['42', '90000000000000000000000000000a01', '', 'collection:5', '/library/metadata/5/thumb/17']) assert.deepEqual(splitKey(bare), { serverId: '', key: bare }, bare);
  assert.equal(scopeKey('', '42'), '42', 'no server id: the id stays bare');
  assert.equal(scopeKey('bad id!', '42'), '42');
  assert.equal(cleanServerId(' mock '), 'mock');
  for (const bad of ['', 'a/b', 'a b', '@x', 5, null]) assert.equal(cleanServerId(bad), '');
});

test('a bare id belongs to the carried entry and to no other; a scoped id to the entry with that id (D157 1)', () => {
  const carried = { id: '', carried: true };
  const known = { id: 'jf-1', carried: false };
  const other = { id: 'em-1', carried: false };
  assert.deepEqual([belongsTo('42', carried), belongsTo('42', known), belongsTo('42', other)], [true, false, false]);
  assert.deepEqual([belongsTo('@jf-1/42', known), belongsTo('@jf-1/42', other), belongsTo('@jf-1/42', carried)], [true, false, false]);
  assert.equal(belongsTo('@jf-1/42', { id: 'jf-1', carried: true }), true, 'a carried entry that learned its id owns both forms');
  assert.equal(belongsTo('@/42', known), false);
  assert.equal(belongsTo('@jf-1/42', { id: '', carried: false }), false, 'an entry that does not know its id owns no scoped id');
  assert.deepEqual([memberBelongsTo('collection:5', carried), memberBelongsTo('collection:@jf-1/5', known), memberBelongsTo('collection:@jf-1/5', carried), memberBelongsTo('nonsense', carried)], [true, true, false, false]);
});

test('a second server makes the selection narrowing, so the offline cache draws only entries that record belonging to it', () => {
  const one = selectionOf({ libraryKeys: ['1'] });
  assert.equal(narrows(one), false, 'a one-server household: nothing changes from 2.4.0');
  const two = selectionOf({ libraryKeys: ['1'], servers: [{ id: 'jf-1', type: 'jellyfin', url: 'http://j', token: '' }] });
  assert.equal(narrows(two), true);
  assert.equal(entryInSelection({ ratingKey: '@jf-1/9', contentRating: 'G' }, two, 'PG'), false, 'an entry with no recorded library is not drawn');
  assert.equal(entryInSelection({ ratingKey: '9', libraryKey: '1', contentRating: 'G' }, two, 'PG'), true);
  assert.equal(entryInSelection({ ratingKey: '@jf-1/9', libraryKey: '@jf-1/b1', contentRating: 'G' }, two, 'PG'), false, 'a library that is not ticked');
});

test('every poster from every server passes the limit in force, whichever server it came from (D5)', () => {
  const sel = selectionOf({ libraryKeys: ['1', '@jf-1/b1'] });
  const from = (id, contentRating) => ({ ratingKey: id, contentRating });
  for (const id of ['10', '@jf-1/10']) {
    assert.equal(posterAllowed(sel, 'PG', from(id, 'G')), true);
    assert.equal(posterAllowed(sel, 'PG', from(id, 'PG')), true);
    for (const above of ['PG-13', 'R', 'NC-17', '', undefined, 'TV-MA', '15']) assert.equal(posterAllowed(sel, 'PG', from(id, above)), false, `${id} ${above}`);
  }
});

// ---- TMDB Discover's "every ticked genre" (Run 13, tmdb-source r2: R4) ----

test('describeSelection joins genres with "and" when Discover is set to every ticked genre, and with "or" otherwise', () => {
  const genres = [{ key: '35', title: 'Comedy' }, { key: '18', title: 'Drama' }, { key: '27', title: 'Horror' }];
  const of = (key, extra = {}) => describeSelection(selectionOf({ libraryKeys: [key], libraryNames: ['Discover TV'], genres, ...extra }));
  assert.equal(of('discover/tv?mode=and'), 'Discover TV, genres Comedy, Drama and Horror');
  assert.equal(of('discover/movie?from=2000&mode=and&to=2010'), 'Discover TV, genres Comedy, Drama and Horror', 'the mode is found among the other parts of the key');
  assert.equal(of('discover/tv?mode=and', { genres: genres.slice(0, 2) }), 'Discover TV, genres Comedy and Drama');
  assert.equal(of('discover/tv?mode=and', { genres: genres.slice(0, 1), ratings: ['PG'] }), 'Discover TV, genre Comedy, rated PG');
  assert.equal(of('discover/tv'), 'Discover TV, genres Comedy, Drama or Horror', 'any ticked genre is unchanged');
  assert.equal(of('discover/tv?mode=or'), 'Discover TV, genres Comedy, Drama or Horror');
  assert.equal(of('movie/popular'), 'Discover TV, genres Comedy, Drama or Horror', 'a list takes any ticked genre');
  assert.equal(of('1'), 'Discover TV, genres Comedy, Drama or Horror', 'a media server library does too');
  assert.equal(of('mode=and'), 'Discover TV, genres Comedy, Drama or Horror', 'only a Discover key says "every"');
  assert.equal(of('discover/tv?mode=android'), 'Discover TV, genres Comedy, Drama or Horror');
  assert.equal(of('discover/tv?xmode=and'), 'Discover TV, genres Comedy, Drama or Horror');
});

test('genresAreAll reads only the Discover library keys of the selection', () => {
  const sel = (...keys) => ({ libraries: keys.map((key) => ({ key, name: '' })) });
  assert.equal(genresAreAll(sel('discover/movie?mode=and')), true);
  assert.equal(genresAreAll(sel('discover/tv?mode=and&from=2000')), true);
  assert.equal(genresAreAll(sel('1', 'discover/tv?mode=and')), true);
  for (const bad of [sel('discover/tv'), sel('discover/tv?from=2000'), sel('movie/popular?mode=and'), sel(), {}, null, undefined, { libraries: [null, {}] }]) assert.equal(genresAreAll(bad), false);
});

// ---- Production house (Run 13, production-house-filter; D203 6, D211, D213): a server's studio, a TMDB company ----

const PIXAR = { key: '', title: 'Pixar' };
const A24 = { key: '', title: 'A24' };
const PIXAR_TMDB = { key: '3', title: 'Pixar' };
const A24_TMDB = { key: '41077', title: 'A24' };

test('houses: cleanHouses keeps a title (and an id), drops junk and repeats', () => {
  assert.deepEqual(cleanHouses([{ key: 3, title: ' Pixar ' }, { key: '3', title: 'Pixar again' }, { title: 'A24' }, { title: 'a24' }, { key: '9' }, null, 'Pixar', { title: '' }]), [{ key: '3', title: 'Pixar' }, { key: '', title: 'A24' }]);
  assert.deepEqual(cleanHouses('Pixar'), []);
  assert.deepEqual(cleanHouses(undefined), []);
  assert.deepEqual(sel().houses, []);
  assert.deepEqual(sel({ houses: [PIXAR] }).houses, [PIXAR]);
});

test('houses: a house list narrows, changes the selection key, and is named on the empty card', () => {
  assert.equal(narrows(sel({ houses: [PIXAR] })), true);
  assert.equal(narrows(sel({ houses: [] })), false);
  assert.notEqual(selectionKey(sel({ houses: [PIXAR] })), selectionKey(sel()));
  assert.notEqual(selectionKey(sel({ houses: [PIXAR] })), selectionKey(sel({ houses: [A24] })));
  assert.notEqual(selectionKey(sel({ houses: [PIXAR_TMDB] })), selectionKey(sel({ houses: [{ key: '4', title: 'Pixar' }] })));
  assert.match(describeSelection(sel({ houses: [PIXAR, A24] })), /production houses Pixar or A24/);
  assert.match(describeSelection(sel({ houses: [PIXAR] })), /production house Pixar/);
  assert.doesNotMatch(describeSelection(sel()), /production/);
});

test('houses: houseRequestValue is the TMDB id when there is one, else the name', () => {
  assert.equal(houseRequestValue(PIXAR_TMDB), '3');
  assert.equal(houseRequestValue(PIXAR), 'Pixar');
});

test('posterAllowed: a house list passes a poster whose studio is in it (any case) and refuses one with none', () => {
  const s = sel({ houses: [PIXAR] });
  assert.equal(posterAllowed(s, '', P({ studios: ['Pixar'] })), true);
  assert.equal(posterAllowed(s, '', P({ studios: ['pixar'] })), true, 'case does not matter');
  assert.equal(posterAllowed(s, '', P({ studios: ['A24'] })), false, 'H1: another house');
  assert.equal(posterAllowed(s, '', P({ studios: [] })), false);
  assert.equal(posterAllowed(s, '', P({ studios: undefined })), false, 'a title with no studio fails closed');
  assert.equal(posterAllowed(s, '', P({ studios: 'Pixar' })), false, 'studios is a list');
});

test('posterAllowed: a TMDB house list reads the poster company ids', () => {
  const s = sel({ houses: [PIXAR_TMDB] });
  assert.equal(posterAllowed(s, '', P({ companyIds: ['3', '9'] })), true);
  assert.equal(posterAllowed(s, '', P({ companyIds: ['41077'] })), false);
  assert.equal(posterAllowed(s, '', P({ companyIds: [] })), false);
  assert.equal(posterAllowed(s, '', P()), false, 'H7: companies unknown: refused');
  assert.equal(posterAllowed(s, '', P({ studios: ['Pixar'] })), false, 'a name is not a company id');
});

test('posterAllowed: several houses are OR', () => {
  const s = sel({ houses: [PIXAR, A24] });
  assert.equal(posterAllowed(s, '', P({ studios: ['Pixar'] })), true, 'H2: one of two');
  assert.equal(posterAllowed(s, '', P({ studios: ['A24'] })), true);
  assert.equal(posterAllowed(s, '', P({ studios: ['Mock Studios'] })), false);
  assert.equal(posterAllowed(sel({ houses: [PIXAR_TMDB, A24_TMDB] }), '', P({ companyIds: ['41077'] })), true);
});

test('posterAllowed: an empty house list filters nothing', () => {
  assert.equal(posterAllowed(sel({ houses: [] }), '', P({ studios: undefined })), true);
  assert.equal(posterAllowed(sel(), '', P({ studios: ['Pixar'] })), true);
});

test('posterAllowed: a house list never lets in a title the limit or the rating subset refuses (D5)', () => {
  const s = sel({ houses: [A24] });
  assert.equal(posterAllowed(s, 'PG', P({ studios: ['A24'], contentRating: 'R' })), false, 'H5: the limit comes first');
  assert.equal(posterAllowed(s, 'PG', P({ studios: ['A24'], contentRating: '' })), false, 'unrated under a limit');
  assert.equal(posterAllowed(s, 'PG', P({ studios: ['A24'], contentRating: 'PG' })), true);
  assert.equal(posterAllowed(sel({ houses: [A24], ratings: ['G'] }), '', P({ studios: ['A24'], contentRating: 'PG' })), false, 'the rating subset still applies');
  assert.equal(posterAllowed(sel({ houses: [A24_TMDB] }), 'PG', P({ companyIds: ['41077'], contentRating: 'R' })), false);
});

test('posterAllowed: a house list works with a genre list (both must hold)', () => {
  const s = sel({ houses: [PIXAR], genres: [{ key: '', title: 'Comedy' }] });
  assert.equal(posterAllowed(s, '', P({ studios: ['Pixar'], genres: ['Comedy'] })), true);
  assert.equal(posterAllowed(s, '', P({ studios: ['Pixar'], genres: ['Drama'] })), false);
  assert.equal(posterAllowed(s, '', P({ studios: ['A24'], genres: ['Comedy'] })), false);
});

test('posterAllowed: a collection or playlist takes no house filter, as it takes no genre filter', () => {
  const s = sel({ houses: [PIXAR], source: { kind: 'collection', key: '101', title: 'DF' } });
  assert.equal(posterAllowed(s, '', P({ studios: ['A24'] })), true);
  assert.equal(posterAllowed(s, 'PG', P({ studios: ['A24'], contentRating: 'R' })), false, 'but the limit still applies');
});

test('entryInSelection: under a house list an entry must record a studio or company id that is in it (D107)', () => {
  const s = sel({ houses: [PIXAR] });
  assert.equal(entryInSelection({ libraryKey: '1', studios: ['Pixar'] }, s, ''), true);
  assert.equal(entryInSelection({ libraryKey: '1', studios: ['A24'] }, s, ''), false);
  assert.equal(entryInSelection({ libraryKey: '1' }, s, ''), false, 'H3: no studios recorded: never drawn');
  assert.equal(entryInSelection({ libraryKey: '1', studios: [] }, s, ''), false);
  assert.equal(entryInSelection({ libraryKey: '2', studios: ['Pixar'] }, s, ''), false, 'right house, wrong library');
  const t = sel({ houses: [PIXAR_TMDB, A24_TMDB] });
  assert.equal(entryInSelection({ libraryKey: '1', companyIds: ['41077'] }, t, ''), true, 'OR');
  assert.equal(entryInSelection({ libraryKey: '1', companyIds: ['9'] }, t, ''), false);
  assert.equal(entryInSelection({ libraryKey: '1' }, t, ''), false, 'no company ids recorded');
  assert.equal(entryInSelection({ libraryKey: '1' }, sel({ houses: [] }), ''), true, 'no house list: nothing is asked of the entry');
});

test('entryInSelection: the rating subset and the limit still apply under a house list', () => {
  const s = sel({ houses: [PIXAR], ratings: ['G'] });
  assert.equal(entryInSelection({ libraryKey: '1', studios: ['Pixar'], contentRating: 'G' }, s, ''), true);
  assert.equal(entryInSelection({ libraryKey: '1', studios: ['Pixar'], contentRating: 'PG' }, s, ''), false);
});

test('entryInSelection: a source ignores the house list', () => {
  const s = sel({ houses: [PIXAR], source: { kind: 'collection', key: '101', title: 'DF' } });
  assert.equal(entryInSelection({ members: ['collection:101'], studios: ['A24'] }, s, ''), true);
});
