import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, HISTORY_KEY, chooseTitle, cleanDays, cleanWeighting, createShownStore, drawWeighted, weightOf } from '../js/weighting.js';

// A seeded random (mulberry32) so a run repeats.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const memory = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = String(v)) };
};
const T = (k, extra = {}) => ({ ratingKey: k, title: `Movie ${k}`, ...extra });

test('cleanWeighting keeps off / unwatched / rated and turns anything else into off', () => {
  for (const v of ['off', 'unwatched', 'rated']) assert.equal(cleanWeighting(v, 'off'), v);
  for (const v of ['Rated', 'on', '', null, 3, ['rated'], {}]) assert.equal(cleanWeighting(v, 'off'), 'off', JSON.stringify(v));
});

test('cleanDays: whole days 0 to 30, junk gives the default', () => {
  assert.equal(cleanDays(3, 0), 3);
  assert.equal(cleanDays('7', 0), 7);
  assert.equal(cleanDays(2.6, 0), 3, 'rounded to a whole day');
  assert.equal(cleanDays(-4, 0), 0, 'clamped up');
  assert.equal(cleanDays(31, 0), 30, 'clamped down');
  assert.equal(cleanDays(1e9, 0), 30);
  for (const v of ['', '  ', 'abc', true, [], {}, NaN, Infinity]) assert.equal(cleanDays(v, 0), 0, JSON.stringify(v));
});

test('weightOf: off weighs every title 1', () => {
  for (const p of [T('a'), T('b', { viewCount: 4 }), T('c', { audienceRating: 9.5 })]) assert.equal(weightOf('off', p), 1);
});

test('weightOf unwatched: 3 for no viewCount (or 0), 1 for a watched title', () => {
  assert.equal(weightOf('unwatched', T('a')), 3);
  assert.equal(weightOf('unwatched', T('a', { viewCount: 0 })), 3);
  assert.equal(weightOf('unwatched', T('a', { viewCount: 1 })), 1);
  assert.equal(weightOf('unwatched', T('a', { viewCount: 12 })), 1);
});

test('weightOf rated: rises with audienceRating, else rating; neither gets the lowest weight', () => {
  const w = (extra) => weightOf('rated', T('a', extra));
  assert.ok(w({ audienceRating: 8 }) > w({ audienceRating: 5 }));
  assert.ok(w({ audienceRating: 5 }) > w({ audienceRating: 2 }));
  assert.equal(w({ rating: 7 }), w({ audienceRating: 7 }), 'rating stands in when audienceRating is absent');
  assert.equal(w({ audienceRating: 4, rating: 9 }), w({ audienceRating: 4 }), 'audienceRating wins when both are there');
  assert.equal(w({ audienceRating: 'x', rating: 6 }), w({ rating: 6 }), 'a junk audienceRating counts as absent');
  const lowest = w({});
  assert.ok(lowest > 0);
  for (const extra of [{ audienceRating: 0 }, { audienceRating: -3 }, { rating: -1 }, { audienceRating: 'x' }, { audienceRating: null }]) assert.ok(w(extra) >= lowest, JSON.stringify(extra));
  assert.ok(w({ audienceRating: 0.5 }) > lowest, 'any rating above zero beats none');
  assert.equal(w({ audienceRating: 10 }), w({ audienceRating: 99 }), 'a rating above 10 counts as 10');
});

test('drawWeighted walks the weights in order with the random it is given', () => {
  const items = [T('a'), T('b'), T('c')]; // unwatched mode: weights 3, 1, 3
  items[1].viewCount = 2;
  const at = (r) => drawWeighted(items, 'unwatched', () => r).ratingKey;
  assert.equal(at(0), 'a');
  assert.equal(at(2.99 / 7), 'a');
  assert.equal(at(3.01 / 7), 'b');
  assert.equal(at(3.99 / 7), 'b');
  assert.equal(at(4.01 / 7), 'c');
  assert.equal(at(0.999999), 'c');
  assert.equal(drawWeighted([], 'unwatched', () => 0), null);
});

test('drawWeighted off picks floor(random * length), the same index the unweighted draw used', () => {
  const items = ['a', 'b', 'c', 'd'].map((k) => T(k, { viewCount: k === 'a' ? 0 : 1 }));
  for (const [r, want] of [[0, 'a'], [0.24, 'a'], [0.25, 'b'], [0.74, 'c'], [0.99, 'd']]) assert.equal(drawWeighted(items, 'off', () => r).ratingKey, want);
});

function frequencies(items, mode, picks = 2000, seed = 7) {
  const random = seeded(seed);
  const count = Object.fromEntries(items.map((p) => [p.ratingKey, 0]));
  for (let i = 0; i < picks; i++) count[drawWeighted(items, mode, random).ratingKey]++;
  return count;
}

test('unwatched first: over 2,000 picks an unwatched title is drawn at least twice as often as a watched one', () => {
  const items = [T('u1'), T('u2'), T('w1', { viewCount: 1 }), T('w2', { viewCount: 3 })];
  const c = frequencies(items, 'unwatched');
  assert.ok(Math.min(c.u1, c.u2) >= 2 * Math.max(c.w1, c.w2), JSON.stringify(c));
  const off = frequencies(items, 'off');
  assert.ok(Math.max(...Object.values(off)) < 1.3 * Math.min(...Object.values(off)), `off stays even ${JSON.stringify(off)}`);
});

test('best reviewed first: draw frequency rises with audienceRating, and with rating when audienceRating is absent', () => {
  const byAudience = [2, 4, 6, 8].map((r) => T(`a${r}`, { audienceRating: r }));
  const a = frequencies(byAudience, 'rated');
  assert.ok(a.a2 < a.a4 && a.a4 < a.a6 && a.a6 < a.a8, JSON.stringify(a));
  const byRating = [2, 4, 6, 8].map((r) => T(`r${r}`, { rating: r }));
  const r = frequencies(byRating, 'rated');
  assert.ok(r.r2 < r.r4 && r.r4 < r.r6 && r.r6 < r.r8, JSON.stringify(r));
  const mixed = [T('none'), T('low', { audienceRating: 3 }), T('high', { audienceRating: 9 })];
  const m = frequencies(mixed, 'rated');
  assert.ok(m.none < m.low && m.low < m.high, JSON.stringify(m));
});

// ---- the history store ----

test('the store remembers a title across a reload (a new store on the same storage)', () => {
  const storage = memory();
  createShownStore({ storage }).record('a', 1000, 3);
  assert.deepEqual([...createShownStore({ storage }).windowed(3, 1500)], [['a', 1000]]);
  assert.ok(HISTORY_KEY in storage.data);
});

test('the store keeps a title for the window, and not once the window has passed', () => {
  const storage = memory();
  const store = createShownStore({ storage });
  store.record('a', 0, 3);
  assert.ok(store.windowed(3, 3 * DAY_MS - 1).has('a'), 'a millisecond inside');
  assert.ok(!store.windowed(3, 3 * DAY_MS).has('a'), 'exactly N days later it is outside');
});

test('the store prunes entries older than the window, from storage too', () => {
  const storage = memory();
  const store = createShownStore({ storage });
  store.record('old', 0, 10);
  store.record('new', 9 * DAY_MS, 10);
  assert.deepEqual(Object.keys(JSON.parse(storage.data[HISTORY_KEY])).sort(), ['new', 'old'], 'a 9 day old entry is inside a 10 day window');
  store.record('newer', 9 * DAY_MS + 5, 3); // a shorter window now: "old" is past it
  assert.deepEqual(Object.keys(JSON.parse(storage.data[HISTORY_KEY])).sort(), ['new', 'newer'], 'only entries inside the 3 day window are written back');
  store.windowed(1, 11 * DAY_MS);
  assert.deepEqual(JSON.parse(storage.data[HISTORY_KEY]), {}, 'reading with a window prunes what is past it');
});

test('windowed does not write when nothing was pruned', () => {
  const writes = [];
  const storage = memory();
  const store = createShownStore({ storage: { ...storage, setItem: (k, v) => (writes.push(k), storage.setItem(k, v)) } });
  store.record('a', 0, 3);
  writes.length = 0;
  store.windowed(3, 10);
  assert.deepEqual(writes, []);
});

test('the store starts empty on a corrupt value, then works', () => {
  for (const bad of ['{not json', 'null', '[1,2]', '"text"', '42', '']) {
    const storage = memory({ [HISTORY_KEY]: bad });
    const store = createShownStore({ storage });
    assert.equal(store.windowed(3, 5).size, 0, bad);
    store.record('a', 5, 3);
    assert.deepEqual([...createShownStore({ storage }).windowed(3, 6)], [['a', 5]], `recovers after ${bad}`);
  }
});

test('the store ignores a single junk entry and keeps the good ones', () => {
  const storage = memory({ [HISTORY_KEY]: JSON.stringify({ good: 100, text: 'yesterday', neg: -5, nan: null, big: 1e400 }) });
  assert.deepEqual([...createShownStore({ storage }).windowed(3, 200)], [['good', 100]]);
});

test('the store survives storage that throws, and keeps the session in memory', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  const store = createShownStore({ storage: broken });
  assert.doesNotThrow(() => store.record('a', 1, 3));
  assert.ok(store.windowed(3, 2).has('a'));
  const none = createShownStore({ storage: null });
  none.record('a', 1, 3);
  assert.ok(none.windowed(3, 2).has('a'), 'no storage: kept in memory for the session');
  assert.ok(!none.windowed(3, 1 + 3 * DAY_MS).has('a'), 'and still pruned');
});

test('clear removes the record from storage and from memory, and touches nothing when there is none', () => {
  const removed = [];
  const data = {};
  const live = { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => { removed.push(k); delete data[k]; } };
  const store = createShownStore({ storage: live });
  store.clear();
  assert.deepEqual(removed, [], 'no record, no storage call');
  store.record('a', 1, 3);
  store.clear();
  assert.deepEqual(removed, [HISTORY_KEY]);
  assert.ok(!(HISTORY_KEY in data));
  assert.equal(store.windowed(3, 2).size, 0);
  const broken = { getItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
  const mem = createShownStore({ storage: broken });
  mem.record('a', 1, 3);
  assert.doesNotThrow(() => mem.clear());
  assert.equal(mem.windowed(3, 2).size, 0, 'the in-memory copy is cleared too');
});

// ---- chooseTitle: the window and the weights together ----

const base = (over = {}) => ({ mode: 'off', days: 0, shownAt: new Map(), now: 10 * DAY_MS, random: () => 0, ...over });

test('chooseTitle: a title inside the window is never drawn while another is outside it', () => {
  const items = ['a', 'b', 'c'].map((k) => T(k));
  const shownAt = new Map([['a', 9 * DAY_MS], ['b', 8 * DAY_MS]]);
  for (const r of [0, 0.3, 0.6, 0.99]) assert.equal(chooseTitle(items, base({ days: 3, shownAt, random: () => r })).ratingKey, 'c');
});

test('chooseTitle: a title shown longer ago than the window is back in the draw', () => {
  const items = ['a', 'b'].map((k) => T(k));
  const shownAt = new Map([['a', 6 * DAY_MS], ['b', 9 * DAY_MS]]); // a is 4 days old, b is 1
  assert.equal(chooseTitle(items, base({ days: 3, shownAt })).ratingKey, 'a');
});

test('chooseTitle: every title inside the window gives the least recently shown', () => {
  const items = ['a', 'b', 'c'].map((k) => T(k));
  const shownAt = new Map([['a', 9 * DAY_MS], ['b', 7.5 * DAY_MS], ['c', 8 * DAY_MS]]);
  for (const r of [0, 0.5, 0.99]) assert.equal(chooseTitle(items, base({ days: 3, shownAt, random: () => r })).ratingKey, 'b');
});

test('chooseTitle: the fallback keeps weighting out of it (the least recent wins even if it is watched)', () => {
  const items = [T('a'), T('b', { viewCount: 5 })];
  const shownAt = new Map([['a', 9 * DAY_MS], ['b', 8 * DAY_MS]]);
  assert.equal(chooseTitle(items, base({ mode: 'unwatched', days: 3, shownAt })).ratingKey, 'b');
});

test('chooseTitle: weighting works inside what the window leaves', () => {
  const items = [T('seen', { viewCount: 0 }), T('u1'), T('w1', { viewCount: 2 })];
  const shownAt = new Map([['seen', 9.5 * DAY_MS]]);
  const random = seeded(3);
  const c = { u1: 0, w1: 0, seen: 0 };
  for (let i = 0; i < 2000; i++) c[chooseTitle(items, base({ mode: 'unwatched', days: 3, shownAt, random })).ratingKey]++;
  assert.equal(c.seen, 0);
  assert.ok(c.u1 >= 2 * c.w1, JSON.stringify(c));
});

test('chooseTitle: window 0 ignores the record, and an empty list is null', () => {
  const items = [T('a')];
  const shownAt = new Map([['a', 10 * DAY_MS]]);
  assert.equal(chooseTitle(items, base({ days: 0, shownAt })).ratingKey, 'a');
  assert.equal(chooseTitle([], base({ days: 3 })), null);
});

// ---- the history by server (D156 2, D157 1, 2) ----

test('clearServer forgets one server\'s titles and nothing of the others; a bare key is the carried entry\'s', () => {
  const m = memory();
  const store = createShownStore({ storage: m });
  const t = 1_000_000;
  store.record('7', t, 5); // stored by 2.4.0
  store.record('@jf-1/7', t, 5); // the same number on another server is another title
  store.record('@em-1/9', t, 5);
  store.clearServer({ id: 'jf-1', carried: false });
  assert.deepEqual([...store.windowed(5, t).keys()].sort(), ['7', '@em-1/9']);
  store.clearServer({ id: '', carried: true });
  assert.deepEqual([...store.windowed(5, t).keys()], ['@em-1/9']);
});

test('clearServer writes nothing when the server has no title in the record', () => {
  const writes = [];
  const m = memory({ [HISTORY_KEY]: JSON.stringify({ '@em-1/9': 5 }) });
  const store = createShownStore({ storage: { ...m, setItem: (k, v) => (writes.push(k), m.setItem(k, v)) } });
  store.clearServer({ id: 'jf-1', carried: false });
  assert.deepEqual(writes, []);
});

test('no-repeat applies per item: one film on two servers is two titles (D157 13)', () => {
  const now = 10 * DAY_MS;
  const shownAt = new Map([['@jf-1/5', now - 1000]]);
  const pool = [T('@jf-1/5'), T('@em-1/5')];
  for (let i = 0; i < 20; i++) assert.equal(chooseTitle(pool, { mode: 'off', days: 3, shownAt, now, random: Math.random }).ratingKey, '@em-1/5');
});
