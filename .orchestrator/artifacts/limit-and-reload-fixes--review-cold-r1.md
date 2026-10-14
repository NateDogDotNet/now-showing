Agent: fixes-review-cold-r1 · model: claude-opus-5-5 · dispatched: 2026-10-14T23:52:06Z
Verdict: APPROVE

Reviewer: fixes-review-cold-r1 · Model: claude-opus-5-5 · Dispatched: 2026-10-14T23:52:06Z · Method: cold code review · Scope: limit-and-reload-fixes, r1, base 6363763, staged diff of /home/nathan/wt-limit-and-reload-fixes (10 files, +226 −8)

## What I ran, and where

- `git -C /home/nathan/wt-limit-and-reload-fixes diff --cached` (read only).
- My own scratch worktree: `mktemp -d` gave `/tmp/tmp.vKYZXndTjM`. I ran `git worktree add --detach .../wt 6363763` and `git apply` with the staged diff, inside a `set -e` chain. `git status` there showed exactly the 10 staged files.
- `node --test tests/plex.test.js tests/poster-cache.test.js` → 68 pass, 0 fail.
- Mutation 1: I replaced `if (poster.episodeRating) return;` in `refreshRating` with `if (false) return;`. Tests 28 and 29 failed. Reverted.
- Mutation 2: I replaced the `put` rating line with the pre-change `poster.contentRating || ''`. Tests 28 and 29 failed. Reverted. Afterwards `git diff --stat` showed exactly the patch again.
- I removed the worktree with `git worktree remove --force` and deleted the temp dir. `git worktree list` no longer shows it. The reviewed tree still has its 10 staged files. I made no node_modules link and ran no e2e spec, because every e2e claim below could be settled by reading the code.

## Issues

1. **Minor**, js/plex.js:135,144 (class: spec-gap). When Plex sends `grandparentContentRating`, `toPoster` now uses the series rating as `contentRating` for the **live** check too, not only for the cache. The engine's `permitted` (js/engine.js:71) and `allowedOnScreen` (js/main.js:122) both read `poster.contentRating`. Breaking input: limit `PG-13`, `limitNowPlaying` on, and a now-playing episode with `contentRating: 'TV-MA'` and `grandparentContentRating: 'TV-14'`. Before this change the episode was refused. Now it passes and the overlay (js/display.js:255) shows "TV-14". The art on screen is the series poster (`_poster = grandparentThumb`, js/plex.js:99), so the series rating is defensible. Still, it loosens the live check for that case, and no test or comment says it was meant to. The unit test at tests/plex.test.js:449 only covers the direction that tightens it (TV-PG episode, TV-MA series). Fix: either decide that the live check should take the stricter of the two ratings (keep the series rating only for the cache), or state that the series rating governs the series poster and add a test for the loosening direction.

2. **Minor**, js/plex.js:135 (class: code-bug, edge). If `grandparentContentRating` is present but `''`, `seriesRating` is `''`, not `null`. The `??` keeps it, so the poster is not flagged `episodeRating`. `put` and `refreshRating` then overwrite the show's stored rating with `''`. This fails closed under a limit, and the D37 recheck restores it on the next pool load while a limit is set. It is the "unrated episode blanks the show" case that test 24 guards against, but reached through an empty series field. Fix: `typeof … === 'string' && m.grandparentContentRating !== ''`, or `|| null`.

3. **Minor**, tests/e2e/content-rating.spec.mjs (cases 23 and 24, `offlineTitles`) (class: code-bug, test quality). These cases depend on timing: `waitForTimeout(500)` before reading the index, `waitForTimeout(1500)` after the offline reload, and `waitForTimeout(300)` per round. A slow put just makes the 500 ms index check meaningless rather than failing it. Case 23 still has teeth through the offline sampling: an unguarded `put` would store TV-PG and title 5 would join the PG pool. But that check is probabilistic over 8 samples, not a deterministic assertion. Fix: wait for the put to land, for example by polling the index until key `5` has a fresh `savedAt`, before asserting.

## Checked and clean

- **`episodeRating` readers and writers.** It is set only in `toPoster` (js/plex.js:145) and read only in `put` and `refreshRating`. The index meta is built field by field (js/poster-cache.js:54), so the flag is never stored. `random()` returns `{...meta, source:'cache'}` without it. The overlay, `engine.shown`, `pickRandom`/`recent`, the pin and `items()` never look at it. In the D37 recheck (js/engine.js:54), cached keys are show keys, so `items()` yields `type: 'show'` items with no flag, and fallback objects `{ratingKey, contentRating:''}` have none either. The recheck therefore still corrects stale 2.0 entries, including 2.0 entries that stored an episode's rating under the show's key, whenever a limit is set.
- **`put` for an episode-only (never seen) show.** It stores `''`, which `allows()` rejects under any limit (js/ratings.js:48–54). This fails closed. With no limit, `allows('', …)` is true, so nothing is hidden.
- **Unit tests have teeth.** Each of the two cache guards, reverted alone, fails tests 28 and 29 (see above). The plex.test.js cases pin both branches of `toPoster`.
- **`reloadPending = 'update'`.**
  - The only writer is `controllerchange` (js/main.js:1250).
  - `requestReloadAfterWake` and `dailyReloadTick` use `||=`, so they cannot downgrade it.
  - `skipReload` now keeps it, and so does the `.catch(skipReload)` in the tick.
  - `runDailyReload` handles it first. It ignores the setting, the gap and the probe, and still honours `reloadMustWait`: any `dialog[open]` (which covers settings, PIN, diagnostics and shortcuts, index.html:73,343,357,381), busy or TV-waking, the manual-wake window, and the crossfade. So the PIN-dialog case that the old `!settingsUI.isOpen` check missed is now covered.
  - The old code silently dropped an update that arrived while Settings was open. The new code keeps it pending.
  - A second `controllerchange` is idempotent. `reloading` stops a second reload.
  - If an update arrives during a daily probe, the daily path either reloads or calls `skipReload`, which keeps 'update'.
  - pi-stability case 15 would fail on the old code, which reloaded at once because Settings was not open, only the PIN prompt.
- **Provisioning marker** (js/main.js:1406–1409).
  - It is written only when `source === 'defaults'` and `provisionedSettings` succeeded.
  - If config.json fails to parse, it falls through to `announceWhatsNew`, which sees an unconfigured display, writes the marker and shows no toast. Same result.
  - `WHATS_NEW_KEY` is a module-level const evaluated before `boot()` runs (js/main.js:1436 vs the `boot()` call at the end), so there is no TDZ error.
  - The PIN-reset block is independent of the marker.
  - preset.spec K60 case 1 fails on the old code, because a provisioned display is configured and gets the toast. Case 2 confirms that a stored install with config.json beside it still gets the toast.
- **Empty card** (js/main.js:315–318).
  - `cache.entries()` is a synchronous localStorage read that never throws (readIndex catches).
  - The limit wording now needs a non-empty index with no entry passing `allows()`.
  - An empty cache gives the error message. An index of all-unrated 2.0 entries under a limit gives the limit wording, which is correct.
  - If the index has allowed entries but their blobs are gone, the card gives the network error, which is accurate.
  - status.spec case 1 would fail on the old code, which used the limit wording whenever a limit was set.
- **mock-plex `episode=1`.** It strips the movie's `contentRating` before optionally adding the episode's own, so "absent" really means absent.

## Declined to judge

- Whether Plex's `/status/sessions` actually sends `grandparentContentRating` for episodes. That is outside the diff and cannot be checked here. If it never does, the series-rating branch only matters for non-session sources.
- An update reload landing while the first-run sign-in code is on the empty card, or while a `pendingToken` waits. Neither is a dialog, so `reloadMustWait` does not hold the reload. The old code had the same behaviour (it reloaded at once), so this is not a regression from this diff.
- An update reload while asleep. The daily reload already does the same. Whether that is wanted is a product question.
- Settings that were stored but are corrupt load as `source: 'defaults'`. If config.json is present, that suppresses the upgrade toast. This is an edge case and a product call.

## Recommendations

Address issue 2 with a one-line change. Make a deliberate call on issue 1, either taking the stricter rating for the live check or documenting that the series rating governs, and add a test for the loosening direction. Issue 3 can wait.

## Assessment

Each of the four changes does what its code comment claims. The cache guards and the reload gating are covered by tests that fail with the fix reverted, which I checked by mutation for the unit tests and by reading for the e2e cases. The remaining issues are a policy edge on the live limit, an empty-string edge case, and some timing-dependent waits in tests.

Files read: staged diff of /home/nathan/wt-limit-and-reload-fixes; js/main.js (80–130, 180–245, 280–330, 395–520, 580–610, 1235–1290, 1360–1470); js/poster-cache.js (full); js/engine.js (30–80); js/ratings.js (1–70); js/plex.js (95–110, 200–222); js/settings.js (165–188); index.html (dialog lines via grep); scripts/mock-plex.mjs (grep); tests/e2e/content-rating.spec.mjs (grep of helpers); tests/e2e/pi-stability.spec.mjs (helpers 24–85); tests/e2e/preset.spec.mjs (126–160); the brief.

**Verdict:** APPROVE
