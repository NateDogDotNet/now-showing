Reviewer: cache-first-fetch-review-anchored-r1 · Model: opus · Dispatched: 2026-10-08T23:26:30Z · Method: anchored code review · Scope: cache-first-fetch, round r1, base 33976fe, staged tree b4fb4aa

## What I read and ran

Read: `git diff --cached` in /home/user/wt-cache-first-fetch (and the r1 patch artifact); `js/poster-cache.js`, `js/main.js` (lines 1-140, 186-198), `js/layout.js` (`requestSize`), `js/display.js` (`show`, decode path), `scripts/mock-plex.mjs` (control branch, stats), `tests/e2e/lib.mjs`/`run.mjs` (mock helpers, spec selection), `js/settings.js` (`load`/`save`); plan section "### 6. `cache-first-fetch`" in docs/integration-plan.md; R-CACHE-1/R-CACHE-2 in docs/spec.md; D6 and D18 in docs/decisions.md.

Ran everything in a private `mktemp -d` scratch worktree (`git worktree add --detach <tmp>/wt 33976fe` + `git apply --index` of the r1 patch). `git write-tree` there gave `b4fb4aa752ffe801c20dc0f023b3e3bfa770e400`, the same as the reviewed staged tree. I removed the worktree afterwards. The live tree is unchanged: same status, and the tree is still b4fb4aa.

- Criterion 1 `node --test tests/poster-cache.test.js`: 13 pass / 0 fail.
- Criterion 2 `npm test`: 80 pass / 0 fail.
- Criterion 3 + full suite, `E2E_PORT=28731 E2E_MOCK_PORT=28732 npm run test:e2e`: `PASS cache-first` ("24 shows: transcode 8 <= 8, Cache.put 8 <= 8"; "after reload + reset-stats, 24 shows: transcode == 0"), `PASS smoke` (all 12 checks). The new stats endpoints do not disturb smoke.
- Criterion 4 `git status --porcelain -- index.html css sw.js`: empty.
- Mutation testing of the unit tests (each applied alone to `js/poster-cache.js`, then reverted from a saved copy and checked with `git diff --stat`). All 10 were killed: drop thumb check; drop width check; `>=` to `>`; remove try/catch in `lookup`; re-order/write the index on hit; `cache.put` on hit; read limit once at creation; drop eviction `cache.delete`; don't record width (3 fails); don't record height.
- E2E mutation: `if (hit) return hit;` changed to `if (hit && false)` in `js/main.js` gives `AssertionError: transcode 25 > 8`, `FAIL cache-first`. Reverted with `git checkout -- js/main.js` (back to the staged content; I confirmed line 68 reads `if (hit) return hit;`). The 24 clicks really do produce about 24 shows, so the `<= 8` bounds are meaningful.
- Probe spec (scratch worktree only, `tests/e2e/zzreview.spec.mjs`, deleted with the worktree), ports 28751/28752. After all 8 were cached:
  - A. I deleted every Cache API entry and left the index intact. 24 shows gave `{"transcode":8,"other":24}` and 8 keys re-stored. **Index-hit-but-blob-gone falls back to the network and heals.**
  - B. I overwrote every Cache API entry with `new Response('garbage', {type image/jpeg})`. 24 shows gave `{"transcode":0,"other":24}` and 24 × `[poster] Poster image could not be decoded.`, and **all 8 entries were still corrupt afterwards**.
- `node -e "[1,2,3].splice(Math.max(0, undefined))"` gives `[1,2,3]`. A non-numeric limit evicts everything.

## Strengths

- The validity rule is exactly as the Notes say (`poster-cache.js` `lookup`): same `thumb` AND `entry.width >= size.width`. A legacy entry with no width is a miss (`!(undefined >= n)`). `put()` records `width`/`height`.
- A hit is read-only. There is no `cache.put`, no `writeIndex` and no re-order. The unit test counts `setItem` calls and fake `put`s, and the e2e spec counts `Cache.prototype.put`. Both mutations are killed.
- The lazy limit is re-read on every `put`. `main.js` passes `() => state.settings.posterCacheLimit`; the closure refers to `state` only at call time, so there is no TDZ at module init. Eviction deletes the evicted Cache API entries, and both are tested and mutation-proof.
- The `directImages` early return still comes before the lookup, so CORS mode bypasses the cache unchanged. The `AbortSignal.timeout?.(20000)` stays on the network path. `cache.random()` is unchanged.
- Read errors are a miss at two layers: the try/catch in `lookup` and `.catch(() => null)` in `fetchImage`. A missing blob behind a valid index entry is a miss (unit test plus probe A).
- Quota handling. A `cache.put` QuotaExceededError rejects `put()` and is logged by the existing `.catch(log.warn)` in `fetchImage`. A `localStorage` failure is swallowed by `writeIndex`, and the index then simply doesn't claim the new entry, so lookups miss and fall back to the network (no false hit). Evicted keys whose deletes ran while the index write failed resolve to `get() -> null`, which is a miss.
- The mock still has exactly 8 titles (`MOVIES` untouched). `/__mock/stats` and `/__mock/reset-stats` return early and leave other control actions alone. Counting comes after the token check, so 401s aren't counted.

## Issues

### Important

**I1. A corrupt cached blob is served forever. It never falls back to the network and never heals.** `spec-gap`
- Location: `js/main.js:67-68` (`if (hit) return hit;`) together with `js/display.js:121-124` (decode failure throws `Poster image could not be decoded.`) and `tick()`/`handleFailure`.
- Evidence: probe B above. With every entry corrupted, 24 shows made 0 transcode requests, logged 24 decode errors, and left 8/8 entries corrupt.
- Why it matters: before this change every show re-downloaded and re-`put` the poster, so a damaged entry healed on the next rotation. Now a valid-looking index entry with an undecodable blob is returned on every rotation until the thumb changes, which for a stable library is never. On each such rotation `tick` fails and `handleFailure` sets `lastError`/`offlineSince` (the status shows offline while the server is fine) and tries `cache.random()`, which can pick another corrupt entry. A Pi kiosk on an SD card with power cuts is exactly where Cache API corruption happens. R-CACHE-1 says only "a cache read error falls back to the network". A blob that reads fine and fails to decode is not covered, so the change meets the letter of the criteria, and the criteria are silent. Hence `spec-gap`, not `code-bug`.
- Fix: in `fetchImage`/`tick`, if `display.show` rejects for an image that came from `lookup`, drop that entry from the index (or `cache.delete` it) and retry once through the network path. Alternatively, have `lookup` reject zero-size blobs and `createImageBitmap`-check the blob before returning it. Add an e2e or unit case: corrupt entry, then one network fetch, then the entry is replaced.

### Minor

**M1. A non-numeric limit evicts the whole cache on every put.** `spec-gap`
- Location: `js/poster-cache.js` `list.splice(Math.max(0, maxEntries()))`.
- Evidence: `Math.max(0, undefined)` is `NaN`, and `splice(NaN)` acts as `splice(0)` (output `[1,2,3]` above). `applySettings(next, { persist: false })` (`main.js:196`) assigns unsanitised `next`. Today the settings UI builds `next` from a full settings object and the stored path goes through `sanitize`, so I found no path that triggers it.
- Fix: `const n = Number(maxEntries()); list.splice(Number.isFinite(n) ? Math.max(1, n) : 100)`, or fall back to the default.

**M2. "Re-downloaded exactly once" is not tested end to end.** `spec-gap`
- R-CACHE-1's third bullet ("a poster whose artwork changed is re-downloaded exactly once") is covered only indirectly: the unit test shows thumb-changed is a miss, and a put followed by a hit is covered separately. Plan criterion 3 does not ask for it, so this is not a code-bug. A unit test doing put(old thumb), lookup(new thumb) gives null, put(new thumb), lookup gives a hit, would pin it.

**M3. The unit test for "`get` throwing" is hard to read.** `code-bug` (cosmetic)
- `tests/poster-cache.test.js` "miss: the Cache API get throwing" builds `pc2` with a ternary storage shim. It works and the mutation is killed, but it would be simpler to share one `memoryStorage()` between the two instances.

## Declined to judge

- Width-only validity (height is ignored). The Notes specify width, and `requestSize` scales both sides from a fixed poster aspect, so I am following the plan. Whether R-CACHE-1's "pixel size" should mean both dimensions is a product question.
- Concurrent fire-and-forget `put()` calls racing on `readIndex`/`writeIndex`. This predates the diff and is outside its scope.
- The `directImages` mode ignoring an already-warm cache. The Notes require it to stay untouched, so I treated it as decided.
- E2E timing (300 ms per click, a click during a busy tick is ignored). The spec passed and the mutation was killed. I did not measure flake rate across many runs.

## Recommendations

1. Route I1 to the conductor as a spec-gap. It is a regression in self-healing that this phase introduced, and the cheapest fix (evict and refetch once after a decode failure on a cached blob) is small and fits in `js/main.js`, which this phase owns.
2. Fold M1's guard into the same change. It is one line.
3. Optionally add the M2 unit test.

## Assessment

Plan criteria 1-4 all pass in a clean worktree at the reviewed tree. The validity rule, the read-only hit, the lazy limit, eviction, the `directImages` bypass, the 20 s timeout, the missing-blob fallback and quota handling all behave as the Notes and D6 require, and the tests have teeth: every unit and e2e mutation I tried was killed. D18 is not touched by this diff. The one material problem is outside what the criteria say: a corrupt cached blob now sticks permanently, where the old download-every-time path healed it. That is the corrupt-entry fallback the dispatch asked about, and I consider it worth fixing before merge.

**Verdict:** CHANGES REQUESTED
