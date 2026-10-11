produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: metadata-and-now-playing · round: r2 · mode: cold
**Verdict:** CHANGES REQUESTED

Reviewer: metadata-and-now-playing-review-cold-r2 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T16:40:35Z · Method: cold diff review · Scope: metadata-and-now-playing, r2, base f0b3425, tree bc50606

### Critical

None.

### Important

1. **The cached-rating re-check only covers the first 100 cached titles, but the cache can hold up to 300. The rest keep stale ratings and can come back offline above the limit.** (code-bug)
   - Location: `js/engine.js` `RECHECK_MAX = 100` and `cachedKeys().slice(0, RECHECK_MAX)` in `recheckCachedRatings`. `js/settings.js:73` allows `posterCacheLimit: [100, strictNum(10, 300, …)]`, and `js/main.js:20` passes it to `createPosterCache`. `cache.entries()` lists the newest first, so entries 101 to 300 (the oldest) are never asked about.
   - Evidence: I ran a scratch script with `createEngine`, 300 cached keys, a PG limit and key 250 re-rated to R on the server. Output: `re-checked 100 of 300 ; key 250 re-checked: false`. Entry 250 keeps its old stored rating (for example PG). `cache.random()` filters only on that stored rating, so `handleFailure` can show it offline.
   - Why it matters: this breaks the stated invariant that an above-limit title never comes back from the offline cache after a re-rating. The unit test `D37: at most 100 cached keys are asked about` locks the cap in, but nothing covers the keys that fall outside it.
   - Fix (either one):
     - Split the keys into batches of 100 so every cached key is checked. That is ceil(n/100) requests, at most 3.
     - Or fail closed: send `{ratingKey, contentRating: ''}` to `onRatings` for every key past the cap.
   - Add a test with more than 100 cached keys that asserts every key ends up confirmed or marked unrated. If a 100-key cap was a deliberate decision, the decision needs to say what happens to the keys past it. As it stands, it fails open.

### Minor

1. **With now-playing on, a 500 or network failure on `/status/sessions` still stops live rotation.** (spec-gap)
   - `sessionList` rethrows any error that is not an auth error, including the poll's `sessionsError`. `decide()` throws and `handleFailure` takes over: cached-only rotation, the "Can't reach Plex" status, then backoff. This happens even when the library endpoints are healthy.
   - This is no worse than before (`decide` used to re-request and fail the same way), and the tests deliberately expect the error to propagate (`K18: other errors … still propagate`; e2e case 10 checks only the request count).
   - The `pollPlayback` doc says "Awake, the failure is only logged and rotation carries on". That holds only when `showNowPlaying` is off. If "a failed what's-playing call must not stop rotation" is meant to cover 5xx errors too, the criteria do not say so and nothing implements it.
2. **Changing `showProgress` or `showPlayer` in settings updates nothing until the next tick that completes.** (code-bug, cosmetic)
   - `display.apply()` re-renders `setTitle` but not `setNowPlaying`. A live preview never shows the bar or label change.
   - After Save, `tick({force:false})` returns early if a tick is already busy, and `forceAfter` is set only for connection or limit changes. So the toggle can wait a full interval.
   - Fix: keep the last session in display, or call `updateNowPlaying()` from `applySettings`.
3. **A `buffering` session animates the bar as though it were playing.** (code-bug, cosmetic)
   - `display.setNowPlaying` freezes the bar only for `paused`. `playerState` is exposed but not used. The next poll snaps the bar back, so the effect is limited to one poll interval.
4. **The re-check runs only on online pool loads.** (spec-gap)
   - `loadPool` is never reached while a now-playing or pinned poster wins, and the pool is reused for 30 minutes.
   - If a title is re-rated after the last pool load and the server then goes offline, the cached copy keeps its old rating. The invariant holds only as far as the last pool load. This may be acceptable, but nothing states it.

### Strengths

- Fails closed when the batch request throws or omits keys. Unit tests cover both cases, and I confirmed with mutations that they catch a wrong implementation (below).
- The ratings written back are facts and do not depend on the limit, so a limit change during the awaited re-check cannot write a wrong value. `refreshRating` ignores keys that have been evicted since. The `busy` guard serialises ticks.
- One request per tick on a failed poll: `sessionsError` is handed to `decide()`. The unit tests and e2e case 10 (500 and 403) check this.
- The overlay and the label use `textContent` and `createElement`, with no HTML injection path for server titles, ratings or player names.
- The progress bar uses a single compositor transform transition per poll, with no per-frame timer. It handles paused, `viewOffset > duration` and `duration = 0`. It is cleared on stop, block, failure, a mismatched poster, or a title above the limit. CSS `poster-blocked` also hides the bar and label.
- `toMs` handles strings from XML attributes and junk values safely.
- The mock's comma-batched `/library/metadata` lookup behaves like Plex: a single unknown key is a 404, unknown keys in a list are left out.

### Declined to judge

- The year appears twice when both `showTitle` and `showMeta` are on ("Title (1972)" and "PG-13 · 2 h 14 m · 1972"). That is a product and layout choice.
- How Plex itself behaves on `/library/metadata/a,b,c` when every key is gone: probably a 404, which the code turns into "all unrated", failing closed. This is outside the diff.
- Other agents' `/tmp/*/wt` worktrees are still registered in this repo. They are not mine, so I left them.

### Recommendations

Fix Important 1 by batching or failing closed past the cap, and add a test with more than 100 cached keys. Minors 2 and 3 are cheap to fix. Minors 1 and 4 need a decision from whoever owns the criteria.

### What I read and ran

- Read: `git diff --cached` (all files), `js/poster-cache.js`, and the relevant parts of `js/main.js` (`showPoster`, `pollPlayback`, `handleFailure`, `applySettings`, `togglePin`, `rotate`), `js/settings.js:73`, `js/display.js` (the `apply` and `setTitle` callers), and parts of `tests/e2e/run.mjs`, `tests/e2e/now-playing.spec.mjs` and `tests/e2e/metadata.spec.mjs`.
- Scratch setup: `mktemp -d` gave `/tmp/tmp.TO7f4lV61D`. I ran `git worktree add --detach $D/wt HEAD` and applied the staged diff there with `git diff --cached | git apply`. Afterwards I removed the worktree and the directory and ran `git worktree prune`. The live tree is unchanged: `git write-tree` still gives bc50606.
- `node --test tests/*.test.js`: 230 passed, 0 failed.
- `E2E_PORT=21610 E2E_MOCK_PORT=21611 node tests/e2e/run.mjs metadata now-playing`: PASS metadata, PASS now-playing. All cases passed, including 401/403/500 on sessions and the offline case for a re-rated title.
- Mutations, each reverted afterwards (confirmed with `git diff --stat`):
  - Dropping the unrated fallback for missing keys: 2 D37 tests fail.
  - Removing the `sessionsError` short-circuit: 2 C8M1 tests fail.
  - Removing the auth-means-nothing-playing branch: K18 and C8M1 tests fail.
- Script `cap.mjs` (300 cached keys): only 100 re-checked; key 250 never re-checked.

Files read: js/plex.js, js/engine.js, js/display.js, js/poster-cache.js, js/main.js, js/settings.js (line 73), index.html (diff), css/app.css (diff), scripts/mock-plex.mjs (diff), tests/engine.test.js (diff), tests/e2e/run.mjs (head), tests/e2e/now-playing.spec.mjs (lines 195-249), tests/e2e/metadata.spec.mjs (grep), package.json.

**Verdict:** CHANGES REQUESTED
