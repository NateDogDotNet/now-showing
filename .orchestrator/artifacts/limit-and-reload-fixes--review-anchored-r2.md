Agent: fixes-review-anchored-r2 · model: claude-opus-5-5 · dispatched: 2026-10-15T00:23:19Z
Verdict: APPROVE

Reviewer: fixes-review-anchored-r2 · Model: claude-opus-5-5 · Dispatched: 2026-10-15T00:23:19Z · Method: anchored phase review (confirmation round, full re-review, risk:high) · Scope: limit-and-reload-fixes, r2, base 6363763, staged tree 156b877c0b257f2579607f63c659e6b9d63ffb92 (10 files, +285/-9)

## What I read and ran
- Read: the r2 review brief; my r1 verdict and the cold r1 verdict; the builder r2 handback; D75 (docs/decisions.md:245); plan phase 30 (Output, criteria 1-9, Notes); the full staged diff (`git -C /home/nathan/wt-limit-and-reload-fixes diff --cached`); js/main.js 116-130, 196-245, 425-470, 500-515, 1244-1252, 1396-1465; js/poster-cache.js 42-75; grep of `contentRating|seriesRating|episodeRating` across js/; tests/e2e/content-rating.spec.mjs 60-74; tests/e2e/lib.mjs 157-165; scripts/mock-plex.mjs 86-112.
- Ran in my own worktree: `T=$(mktemp -d)` gave `/tmp/tmp.cSkSfhYEvj`. In a `set -e` chain I ran `git worktree add --detach $T/wt 6363763`, then `git apply --index` with the staged diff. `git write-tree` printed `156b877c…`, which matches the reviewed tree.
  - `node --test tests/plex.test.js tests/poster-cache.test.js` gave `# tests 71 # pass 71 # fail 0`.
  - I ran five mutations, one at a time. Each was reverted with `git checkout -q -- js` (see the table below).
  - I then removed the worktree with `git worktree remove --force` and deleted the temp dir. `git worktree list` no longer shows it.
- I ran no e2e spec and made no node_modules link (`ls node_modules` in the builder's worktree: "No such file or directory").
- I ran the criterion 8 scope probe read-only in the builder's worktree. It printed `[]` (clean).

Mutation results (head = staged r2):

| # | Mutation | Result |
|---|---|---|
| M1 | plex.js `contentRating: seriesRating \|\| ownRating` (the r1 behaviour) | fails 37, 39 |
| M2 | plex.js: an empty `grandparentContentRating` still yields `{ seriesRating }` (cold r1 #2) | fails 38 |
| M3 | poster-cache `put` ignores `seriesRating` | fails 70 |
| M4 | `refreshRating` ignores `seriesRating` | fails 70 |
| M5 | `refreshRating` guard becomes `if (poster.episodeRating) return;` | passes (equivalent mutant: `toPoster` never sets both flags, plex.js:146) |

## Earlier findings: status

- **Anchored r1 #1 (Important, live limit loosened by `grandparentContentRating`): resolved.**
  - plex.js:145 is `contentRating: ownRating`, and plex.js:146 carries the series rating apart: `...(seriesRating ? { seriesRating } : isEpisode ? { episodeRating: true } : {})`.
  - The live readers still read only `contentRating`: engine.js:71 `permitted`, engine.js:132 (np refused when `limitNowPlaying !== false`), main.js:122 `allowedOnScreen`.
  - The plex.test case "a TV-MA episode of a TV-PG show is refused live under PG" asserts `allows('PG', p.contentRating) === false`, and M1 makes it fail.
  - e2e case 25 part 2 would fail on r1 code, because r1 made the np poster TV-PG, so it would pass PG and title 5 would be displayed.
  - This honours D75 as written.
- **Anchored r1 #2 (Minor spec-gap, no e2e case for the series path): resolved**, with a weakness noted in Issue 1 below.
- **Anchored r1 #3 (regression guards that pass at base): accepted.** D75 rules that they stay as guards.
- **Cold r1 #1 (same as anchored #1): resolved** (see above).
- **Cold r1 #2 (an empty `grandparentContentRating` overwrites with ''): resolved.**
  - `seriesRating` is `''` for an empty string or a non-string (plex.js:136), and `''` is falsy at plex.js:146, so the poster gets `episodeRating: true`.
  - Test 38 iterates `{}`, `{grandparentContentRating: ''}` and `{grandparentContentRating: 7}`, and M2 makes it fail.
  - poster-cache.js:53 and :70 also use `poster.seriesRating ||`, so an empty value cannot be stored even when it is set by hand.
- **Cold r1 #3 (fixed waits in cases 23/24): resolved.**
  - The diff no longer has the 500 ms or 1500 ms waits. `offlineTitles` waits on `posterShown` after the reload.
  - The remaining `waitForTimeout(300)` per round follows a `clock.runFor(361_000)`. That is a settle after a fake-clock jump, not a wait for a write.
  - The builder's reasoning holds: `cache.refreshRating(decision.poster)` runs synchronously before `fetchImage` (main.js:238-239), so once the poster is shown it has run.

## Issues

1. **Minor · code-bug (test quality)**, tests/e2e/content-rating.spec.mjs case 25, part 1: `mock.play('5', { episode: '1', episodeRating: 'TV-PG', grandparentRating: 'TV-PG' })` followed by `indexRatingIs(page, '5', 'TV-PG')`.
   - **What is wrong.** The episode's own rating and the series' rating are the same value. So the assertion cannot tell whether the cache stored the series rating or the episode's own rating.
   - **Evidence, by reasoning on the M3/M4 mutants.** A poster with `seriesRating` has no `episodeRating`. A `put` or `refreshRating` that ignores `seriesRating` therefore falls back to `poster.contentRating` = TV-PG, and part 1 still passes. The base code also writes the episode's TV-PG under key 5 (base `put`: `contentRating: poster.contentRating || ''`), so part 1 passes at base too. Part 1 fails only if `seriesRating` is dropped entirely (`episodeRating: true` keeps TV-MA).
   - **Why it is only Minor.** Unit test 70 ("seriesRating is stored … even beside a different own rating": own TV-MA, series TV-PG/PG-13) pins the value, and M3 and M4 both make it fail. The behaviour is covered. The e2e case covers less than its title claims.
   - **Fix (optional).** Give the episode a different own rating that still passes PG, for example `episodeRating: 'G', grandparentRating: 'TV-PG'`. Then a cache that stored the own rating would show G and fail the assertion.

## The left-out case 25 assertion: test gap or mock limitation?
The handback says it left out an assertion that title 5 is still cached as TV-PG after the pool re-check. The cause is mostly a mock limitation, and the cost of the missing assertion is low.
- **Why the assertion fails.** The mock has one rating per title (`ratings` map, mock-plex.mjs:109-111). That rating serves both the pool item that the D37 re-check reads by key (engine.js:43-54, items by show key) and the title "taken as a series". The re-check therefore writes TV-MA back, and that is correct behaviour for what the mock serves.
- **Why `rate` does not solve it.** `mock.post('rate', { ratingKey: '5', contentRating: 'TV-PG' })` exists (used in metadata.spec.mjs:165) and could make the mock consistent. But it would put title 5 into the PG pool and break part 2's `!seen.has(5)` sampling. So it is not a drop-in fix.
- **What the assertion would have pinned, and where that is covered.** It would have pinned only that `seriesRating` keeps winning on later ticks. Unit test 70 (via `refreshRating`) covers this already. A refused now-playing episode never reaches `refreshRating` or `put`, because `decision` is then a random poster (engine.js:132, main.js:238).
- **Verdict on the gap.** It is not a blocking gap.

## Checked and clean
- **F1, offline limit, walked with the r2 code.** Limit PG, TV-MA show 5 cached, a TV-PG episode plays, no `grandparentContentRating` (the real server's case: D75 records 0 of 355 episodes carrying it).
  1. `toPoster` gives `{ratingKey:'5', contentRating:'TV-PG', episodeRating:true}`.
  2. `permitted` passes it live, by the episode's own rating, as in 2.1.
  3. main.js:238 `refreshRating` returns at poster-cache.js:67.
  4. `fetchImage` then either hits the cache (no write) or calls `put`, which stores `stored || ''` = TV-MA (poster-cache.js:52-53).
  5. `random(_, 'PG')` filters on the index (poster-cache.js:112), so the show stays hidden offline.

  Two more cases follow the same path:
  - **Inverse.** An unrated episode keeps PG (unit test "an episode without a rating never stores ''…").
  - **Show never cached.** It stores '', and `allows('PG','')` is false, so it fails closed (D37).

  With `grandparentContentRating` present, the series rating feeds `put`/`refreshRating` and `contentRating` stays the episode's own (M1, M3, M4 above). Other writers of the index rating: grep finds only `put`, `refreshRating` and engine.js:54 `onRatings`. `onRatings` passes show/movie items by key, with no flags, or a fallback `{ratingKey, contentRating:''}`. None was missed. A movie never gets either flag (test 38, final assertions).
- **F7, update reload (main.js unchanged in r2; re-read).**
  - `setInterval(dailyReloadTick, 1000)` is unconditional (main.js:513). `if (reloadPending) runDailyReload()` (main.js:511) does not depend on `dailyReload`, so an 'update' is always serviced.
  - The 'update' branch (main.js:459-465) waits on `reloadMustWait()`. That covers any `dialog[open]` (PIN, settings, diagnostics, shortcuts), `state.busy`/`tvWaking` (a decode), `manualWakeUntil`, and the crossfade.
  - Skipping the blocker, the gap and the probe is right: the old code applied none of them, and case 14b expects an update reload with `dailyReload:false`.
  - It cannot loop: `reloading` short-circuits, and `controllerchange` only sets a flag.
  - It may reload under the sleep veil, like the daily reload. The idle clock carries over through CARRY_KEY in `reloadAutomatically`.
  - `skipReload` (main.js:432-436) still clears 'scheduled'/'wake' and keeps only 'update'.
- **F5.** The marker is written only inside `source === 'defaults' && config !== null && provisioned` (main.js:1403-1409).
  - A stored install has `source` 'stored'/'legacy', so it gets no marker. `announceWhatsNew` then sees a configured display and shows the toast.
  - A first boot with no config.json and no settings writes the marker in `announceWhatsNew` and returns at `!isConfigured`, so there is no toast.
  - `WHATS_NEW_KEY` is a module const declared before the `boot()` call (main.js:1436 vs the end of the file).
- **F6.**
  - `allows` is imported (main.js:11) and `cache` is module-level.
  - `entries()` is `readIndex()` (poster-cache.js:42-44): one JSON parse of an index capped at `posterCacheLimit`, on the failure path only.
  - main.js:317 requires `stored.length > 0 && !stored.some(allows…)`.
- **Tests fail before the fix.**
  - At base: plex.test 37, 38 and 39 (base has no `seriesRating`/`episodeRating`), poster-cache 28 and 29 (base `put` writes the episode's rating), and e2e 23, pi-stability 15, preset K60 case 1 and status case 1.
  - Against the r1 tree: plex.test 37 and 39, and e2e case 25 part 2.
  - Pass at base (guards): poster-cache "the show rating still follows Plex when the show item itself is seen", "an empty seriesRating never overwrites" (disclosed by the builder), preset K60 case 2, status "limit … every cached poster above it", and case 25 as a whole (part 1 per Issue 1; part 2 because base also refused the TV-MA episode). Case 24's assertion that an unrated episode does not hide the PG show is the D73 regression the cache fix addresses, so it fails at base, where `put`/`refreshRating` write ''.
- **Scope and hazards.**
  - The criterion 8 probe printed `[]`.
  - `VERSION` is `'2.1.0'` in both js/main.js:20 and sw.js:5.
  - Neither tests/e2e/lib.mjs nor sw.js is in `git diff --cached --name-only` (count 0).
  - The cache key is still `keyUrl(poster.ratingKey)`, and `ratingKey` is still `grandparentRatingKey` for an episode (plex.js:139).
  - The mock's `episode=1` block is guarded by `url.searchParams.get('episode') === '1' && movie`, and every other path is unchanged.

## Declined to judge
- An update reload landing while the first-run sign-in card or a `pendingToken` is showing (neither is a `<dialog>`). This is unchanged from the old behaviour and outside D73's four findings.
- The Diagnostics wording "Daily reload skipped" logged for a deferred update. This is cosmetic and was noted in r1.

## Recommendations
Optionally, apply Issue 1's one-line change to case 25 (episode rated G, series TV-PG). Nothing blocks the phase.

## Assessment
The r2 change does what D75 rules.
- The live check reads the item's own rating everywhere.
- A non-empty series rating feeds only the cache.
- An empty or non-string series rating is guarded.
- Cases 23 and 24 have no fixed waits that the result depends on.

Every finding from both r1 lenses is resolved or accepted, and the unit tests have teeth (four of five mutants killed; the survivor is equivalent). The one remaining item is a Minor weakness in an e2e case whose behaviour is pinned at unit level.

**Verdict:** APPROVE
