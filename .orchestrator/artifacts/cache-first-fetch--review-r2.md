Reviewer: cache-first-fetch-review-anchored-r2 · Model: claude-opus-5-5 · Dispatched: 2026-10-08T23:45:07Z · Method: anchored confirmation review · Scope: cache-first-fetch, round r2, base 33976fe, staged tree f327745

## What I read and ran

Read: `git diff --cached` in /home/user/wt-cache-first-fetch; `js/main.js` (fetchImage, tick, handleFailure, applySettings, settingsUI wiring), `js/display.js` `show()`, `js/settings.js` (`strictNum`, `posterCacheLimit`), `js/settings-ui.js` `read()`, `tests/poster-cache.test.js` (helpers and the r2 tests), `tests/e2e/lib.mjs` (mock helpers), `scripts/mock-plex.mjs` (the `down` branch); plan section "### 6. `cache-first-fetch`"; R-CACHE-1/2 in docs/spec.md; my r1 review; the r2 brief; ruling K4 in .orchestrator/phases/cache-first-fetch.md.

I did all the runs in a private scratch worktree: `mktemp -d` gave /tmp/tmp.eFC6G9LZA1. I ran `git worktree add --detach .../wt 33976fe`, then `git apply --index` of `git diff --cached --binary`. `git write-tree` there gave `f327745b6fd8e37d41dcc64bea8366be5d685a97`, the reviewed tree. I removed the worktree afterwards. The live tree is unchanged: same porcelain status, and `git write-tree` there still gives f327745.

- Criterion 1: `node --test tests/poster-cache.test.js` gives 16 pass / 0 fail.
- Criterion 2: `npm test` gives 83 pass / 0 fail.
- Criterion 4: `git status --porcelain -- index.html css sw.js` prints nothing.
- Criterion 3 plus the full suite: `E2E_PORT=18740 E2E_MOCK_PORT=18741 npm run test:e2e -- cache-first` passes all 3 checks, including "corrupted cache: each poster fetched once (transcode 8), no decode loop, cache valid again". Unfiltered `npm run test:e2e` gives `PASS cache-first`, `PASS smoke`.
- Mutation testing (each applied alone, restored from a saved copy, and `git diff --stat` empty afterwards):
  - (a) Deleted `cachedBlobs.add(hit);` in `js/main.js`. Result: `AssertionError: transcode after corruption 0`, `FAIL cache-first`. Killed.
  - (b) Replaced the M1 guard with `return Math.max(0, n);`. Result: `not ok 9 - a non-numeric or non-finite limit falls back to 100…`. Killed.
- Probe spec `tests/e2e/zzprobe.spec.mjs` (scratch only, deleted before the worktree was removed). I filled all 8 entries, then:
  - **A, offline with a corrupt cache.** I corrupted every blob and sent `POST /__mock/down`, then clicked refresh 12 times. The index still had 8 entries, the status read "Can't reach Plex · showing cached posters", and the only logs were `ERR_EMPTY_RESPONSE` / "Could not reach Plex". `engine.decide` fails before `fetchImage`, so nothing is deleted while offline. After `up` and `reset-stats`, 40 shows gave `transcode 8`, index 8, 0 "could not be decoded" logs, and 0 "showing posters directly" logs, so `directImages` was not flipped.
  - **B, the network also returns undecodable bytes.** I routed `/photo/:/transcode` to return `garbage` and re-corrupted the cache. 10 clicks gave 10 "unreadable; downloading it again" warnings and 10 "could not be decoded" errors. That is exactly one retry per tick and no loop inside a tick. The error goes to `handleFailure`.
- `node -e` probe of `createPosterCache` with `limit: () => X`, then two puts: `null`, `""`, `0`, `false` and `[]` each leave **0 entries and 0 blobs**; `undefined` leaves 2.
- `new WeakSet().has('http://x')` gives `false`, and `.add('s')` throws `TypeError`.

## Status of r1 findings

- **I1 (a corrupt cached blob never heals): resolved.** `tick()` (`js/main.js` ~L107-117) catches the `display.show` failure only when `cachedBlobs.has(image)`. It then awaits `cache.delete(ratingKey)` (errors swallowed) and makes one `fetchImage(poster, { skipCache: true })` followed by one `display.show`. A failure there propagates to `handleFailure`. There is no loop, which matches K4. Evidence: the e2e corrupt case gives exactly 8 transcodes, the cache decodes 8/8 afterwards, and mutation (a) is killed. Probe B confirms it is bounded to one retry per tick.
- **M1 (a non-numeric limit empties the cache): resolved for the cases r1 raised** (`undefined`, `NaN`, `'abc'`, `Infinity` fall back to 100; there is a unit test and mutation (b) is killed). A residual gap remains: see new Minor 1.
- **M2 ("re-downloaded exactly once" is not asserted directly): resolved.** The unit test "artwork change: miss, then one put, then served from the cache" checks that the new thumb is a miss, does one put (`calls.put == 2`), checks 3 hits returning `'new'`, checks no further puts, and checks one index entry.
- **M3 (the "`get` throwing" test is hard to read): resolved.** One shared `memoryStorage()`, with `good`/`broken` instances and a comment.

## Strengths

- The heal path is gated by blob identity (`WeakSet`), not by a flag. In `directImages` mode `fetchImage` returns the URL string before the lookup, so `cachedBlobs.add` never sees a non-object, and `cachedBlobs.has(url)` is `false`, which rethrows. So the URL-string case is safe. Freshly downloaded blobs are not in the set, so a network blob that fails to decode is never retried.
- `delete()` is awaited before the re-fetch, and `skipCache: true` also bypasses lookup. The conductor's mutation notes record these as redundant safeguards. The fresh blob is stored through the existing `put` path, so the 20 s timeout and the CORS/`directImages` detection stay on the network path unchanged.
- Offline behaviour is not degraded. Corrupt entries are not purged while Plex is unreachable (probe A), and recovery after reconnect costs exactly one download per corrupt poster.
- The e2e case is strict. `transcode == 8` would catch both a missing heal and a double download, and the per-blob `img.decode()` check confirms the cache really holds valid data afterwards.
- r1 behaviour is intact: criteria 1-4 pass, smoke passes, and the read-only hit and lazy limit are unchanged.

## Issues

### Critical

None.

### Important

None.

### Minor

1. **The M1 guard still empties the cache for `null`, `''`, `false`, `[]` or `0`.** `code-bug` (against r2 brief item 2, "a non-numeric … limit falls back to the default")
   - Location: `js/poster-cache.js` `maxEntries`: `Number(...)` followed by `Number.isFinite(n) ? Math.max(0, n) : DEFAULT_LIMIT`.
   - Evidence: the node probe above. `Number(null)`, `Number('')`, `Number(false)` and `Number([])` are all `0`, which is finite, so `splice(0)` evicts every entry and deletes every blob.
   - Why it matters: I found no live path that triggers it. `posterCacheLimit` always passes through `strictNum(10, 300)`, via `load`/`save` and `settings-ui.js` `read()` (which calls `sanitize`). The defensive guard the brief asked for therefore only half-holds. The unit test checks `undefined/NaN/'abc'/Infinity` but not these values.
   - Fix: accept only `typeof v === 'number'` or a non-blank numeric string (the same rule as `strictNum`), and floor at 1, e.g. `Number.isFinite(n) && n >= 1 ? n : DEFAULT_LIMIT`. Add `null` and `''` to the test's `bad` list.

2. **There are two different defaults.** `code-bug` (cosmetic)
   - Location: `js/poster-cache.js`: the signature has `limit = 30`, while the junk fallback is `DEFAULT_LIMIT = 100`.
   - Why it matters: `createPosterCache({ storage })` with no limit caps at 30, while a junk limit caps at 100. The spec default is 100 (R-CACHE-2). `main.js` always passes a function, so runtime behaviour is unaffected. It is only confusing for the next reader.
   - Fix: `limit = DEFAULT_LIMIT`, with the constant hoisted to module scope.

## Declined to judge

- **The `handleFailure` offline fallback can pick a corrupt entry.** `cache.random()` may return an undecodable blob; `display.show(...).catch(() => {})` swallows the failure, and `engine.shown(cached.poster)` is still recorded. This predates the diff, and the plan says `cache.random()` is unchanged in this phase (`content-rating-filter` extends it). It is worth noting for that phase.
- **The status pill reads "Can't reach Plex" when a poster fails to decode** (probe B). This is the existing failure labelling in `handleFailure`/`updateStatus`, outside this diff.
- **A transient `img.decode()` rejection on a valid cached blob** (for example under memory pressure on a Pi) would delete a good entry and cost one re-download. K4 accepts this trade-off as written, so I treated it as ruled.
- **A server that keeps returning undecodable bytes** costs one download plus one put per tick (probe B). That is bounded and matches the pre-phase per-rotation cost. Whether such a poster should be blacklisted is a product question.

## Recommendations

1. Optionally tighten the `maxEntries` guard and unify the default (Minor 1 and 2). Both are one-liners and neither is reachable today, so they need not block the merge.
2. Carry the `cache.random()` corrupt-entry point forward to `content-rating-filter`, which touches that function.

## Assessment

I1 is fixed as K4 rules: delete the entry, make one network attempt, and fall through to the existing failure handling, with no loop. The fix is tested end to end, the test has teeth (mutation (a) is killed), and it behaves correctly offline and when the network blob is bad too. M1, M2 and M3 are resolved. Plan criteria 1-4 and the smoke suite pass at tree f327745, and I found no regression. The two new findings are minor and unreachable through the current settings paths.

**Verdict:** APPROVE
