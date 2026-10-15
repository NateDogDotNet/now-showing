# limit-and-reload-fixes

- Mode: afk        Tags: risk:high        Blocked by: release-bump (done 1450d71)
- Agent type: orchestrator-builder; model sonnet, effort high
- Commit(s): 090d231
- Claimed: 2026-10-14T22:18:26Z
- Worktree: ../wt-limit-and-reload-fixes on branch orch/limit-and-reload-fixes from 6363763 (D12).
- Plan: added by D73 (release-bump's close-time code review, findings 1, 7, 5, 6).

## Pre-flight
- Pre-dispatch run against the current tree in ../wt-limit-and-reload-fixes: ac1 exit 0, ac2 exit 0 (the existing suites; the new cases do not exist yet), ac8 exit 0 (clean tree). ac3–ac7 are the e2e suites, green at 1450d71 (release-bump ac4/ac5-r1) with no new cases yet.
- PROBE: `node -e "import('./js/plex.js').then(({toPoster})=>…toPoster({type:'episode',ratingKey:'900',grandparentRatingKey:'42',contentRating:'TV-PG',…})"` → `{"ratingKey":"42","contentRating":"TV-PG","title":"Show"}`: an episode's descriptor carries the SHOW's key with the EPISODE's rating, and `js/poster-cache.js:47-68` (`put`, `refreshRating`) store that rating under the show's key — fails criterion 1 — D73
- PROBE: `sed -n 1239,1242p js/main.js` → the controllerchange handler checks only `settingsUI.isOpen`; `reloadMustWait()` is at line 422 and is not called there — fails criterion 4 — D73
- PROBE: `sed -n 1431,1434p js/main.js` → `announceWhatsNew` writes the marker then toasts whenever `isConfigured(state.settings)`, and a config.json-provisioned boot is configured before the marker exists — fails criterion 5 — D73
- PROBE: `sed -n 314,316p js/main.js` → `limited = state.settings.maxContentRating && !fatal` picks the limit wording without looking at the cache — fails criterion 6 — D73
- PROBE: `grep -n whatsNew tests/e2e/lib.mjs` → line 205: the harness seeds the marker by default (convention 7), so criterion 5's cases must opt out of the seed (`localStorage` option) — meets criterion 5 (the harness supports it)
- git log of the Output paths: last touched by landed phases (1450d71 touched js/main.js's VERSION line only); no draft work for this phase.
- Step 3: orchestrator-builder fixes-builder-r1, sonnet, high; brief artifacts/limit-and-reload-fixes--brief-r1.md; closer preflight ok
- Dispatched: 2026-10-14T22:19:21Z        Re-dispatches: 0

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-limit-and-reload-fixes)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (poster-cache unit tests, new cases) | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac1-r1.json` |
| 2 | plan criterion 2 (plex unit tests, new cases) | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac2-r1.json` |
| 3 | plan criterion 3 (e2e content-rating, offline limit cases) | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac3-r1.json` |
| 4 | plan criterion 4 (e2e pi-stability, update reload waits) | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac4-r1.json` |
| 5 | plan criterion 5 (e2e preset, What's new marker) | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac5-r1.json` |
| 6 | plan criterion 6 (e2e status, empty-card wording) | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac6-r1.json` |
| 7 | plan criterion 7 (full suite + precache) | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac7-r1.json` |
| 8 | plan criterion 8 (nothing else changed) | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac8-r1.json` |
| 9 | plan criterion 9, narrated: cold and anchored reviews; findings quoted with their tests | handback quotes F1/F5/F6/F7 with the pinning tests (checked by command); reviews at Step 7 | 0 | `limit-and-reload-fixes--ac9-r1.json`; reviews below |
- Conductor read of the js diff: toPoster keeps the show's key and marks an episode's own rating (`episodeRating: true`) unless Plex sends `grandparentContentRating`; `put()` keeps the stored show rating for such posters ('' when never seen) and `refreshRating()` ignores them; `controllerchange` sets `reloadPending = 'update'`, serviced by the 1 s `dailyReloadTick` (`js/main.js:502`, not gated on the daily-reload setting) through `reloadMustWait()`; the marker is written at provisioning; the empty card checks `cache.entries()` against `allows()`.
- Step 4 tally r1: see above. closer predispatch --kind code run. Step 7: two reviewers (risk:high) — fixes-review-anchored-r1 and fixes-review-cold-r1, orchestrator-reviewer, opus; briefs artifacts/limit-and-reload-fixes--brief-review-r1.md and --brief-review-cold-r1.md; dispatched 2026-10-14T23:52:06Z (the 2026-10-14T23:17:26Z stamp was written before the tally completed and was not used)
- ac7-r1 (full suite, 1439 s) exit 1 and ac8-r1 exit 1 — both environmental, kept as `-r1` and superseded: ac8 failed because the conductor's node_modules symlink (created before the criterion ran) is untracked and `.gitignore`'s `node_modules/` matches directories only; `ac8-r1b` (no symlink) exit 0 and `scope-r1` exit 0 with the exact ten-file list. ac7 failed in first-run (ERR_ABORTED during page.goto, "frame was detached"), pixel-shift (renderer "Target crashed") and sleep (15 s waits timing out) while the box ran at load 13–20 with swap full (free -m: 48–180 MB free; a chrome-headless-shell left over from a run about 18 h earlier, 426 MB, was killed by PID). A/B under the same conditions afterwards: the three specs pass on the unfixed base (`control-base-*-r1.json`: first-run 0, pixel-shift 0, sleep 0) AND on the fixed tree (`rerun-*-r1b.json`: 0, 0, 0); the first fixed-tree re-run (`rerun-*-r1.json`), made while swap was still full, failed the same three. The failing cases touch none of the changed paths (no service worker, no config.json, no cache failure path). ac7-r1b is the full suite re-run with the machine quieter.
- Step 7 r1 verdicts: anchored `limit-and-reload-fixes--review-anchored-r1.md` REQUEST CHANGES (Important 1 code-bug: grandparentContentRating replaces the item's own rating in the live check; Minor 2 no e2e for that path; Minor 3 three cases pass at the base, regression guards); cold `limit-and-reload-fixes--review-cold-r1.md` APPROVE with three Minor (1 the same loosening, spec-gap in its words; 2 empty-string series rating overwrites the stored rating; 3 fixed waits in content-rating cases 23/24). Both lenses raised the loosening: not dismissable (spec 235) → D75. Real-server probe `real-server-validation-extended--home-gpcr-r1.txt`: 0 of 355 episodes carry the field (driver `real-server-validation-extended--home-gpcr-r1.mjs`). Nothing dismissed.
- Re-dispatch r2: fixes-builder-r1 resumed with D75, 2026-10-14T23:56:31Z. Re-dispatches: 1.

## Plan acceptance — Step 4 r2 (evidence.py exec in ../wt-limit-and-reload-fixes)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac1-r2.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac2-r2.json` |
| 3 | plan criterion 3 (content-rating; cases 23–25) | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac3-r2.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac4-r2.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac5-r2.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac6-r2.json` |
| 7 | plan criterion 7 (full suite + precache) | evidence.py exec (plan command) | 0 | `limit-and-reload-fixes--ac7-r2.json` |
| 8 | plan criterion 8 | evidence.py exec (plan command), run before the node_modules link existed | 0 | `limit-and-reload-fixes--ac8-r2.json` |
| 9 | plan criterion 9, narrated | handback r2 quotes the D75 fix and its tests (checked by command); reviews r2 below | 0 | `limit-and-reload-fixes--ac9-r2.json` |
- Conductor read of the r2 js diff: `contentRating` is the item's own rating for every poster; `seriesRating` only for a non-empty `grandparentContentRating`; `put()` stores `seriesRating` when present, else the stored show rating ('' when never seen); `refreshRating()` returns early for an episode without a series rating and otherwise writes `seriesRating || contentRating`. js/main.js unchanged since r1.
- Step 7 r2: full re-reviews, both lenses (risk:high): fixes-review-anchored-r2 and fixes-review-cold-r2, orchestrator-reviewer, opus; briefs --brief-review-r2.md, --brief-review-cold-r2.md; dispatched 2026-10-15T00:23:19Z
- Step 7 r2 verdicts: anchored `limit-and-reload-fixes--review-anchored-r2.md` APPROVE (r1 issues closed; one Minor test-quality: case 25 part 1 rates episode and show alike, unit test 70 pins the value); cold `limit-and-reload-fixes--review-cold-r2.md` APPROVE (one Minor test-quality: case 23 lacks a `seen.size >= 2` check; the case still fails on revert through its stored-rating assertion). Both reviewers reverted the two poster-cache changes in their own temp worktrees: 3 unit tests fail each time (28, 29, 32), the killed mutants.
- Dismissed (anchored, Minor): case 25 part 1 cannot tell the show's rating from the episode's — unit test 70 pins the stored value, and the mock keeps one rating per title (the reviewer's own finding), so the e2e case is a regression guard; not re-dispatched. Dismissed (cold, Minor): case 23 has no `seen.size >= 2` guard — the case fails on revert via its stored-rating assertion (both reviewers), and cases 10 and 20 already prove offline rotation; noted for the 2.1.x test tidy-up, not re-dispatched.
- Landed: 090d231 — "Fix the offline limit for episodes, the update reload's timing and two notices" (cherry-pick of the worktree commit 87cd9bf86ffd237c0ef59602505f0186cfaac756)

## Pre-commit — lint (node --check), format (git diff --check), tests (ac7-r2 full suite), security, scope: all exit 0 (precommit-lint-r2, precommit-format-r2, precommit-security-r2, precommit-tests-r2, scope-r2); review-check-r2 (no Critical/Major/Important in either r2 review), dlog-check-r2, attribution-r2

## Step 8 tally — limit-and-reload-fixes--tally-step8-r2.md
| Category | Score |
|---|---|
| acceptance criteria pass fresh _critical_ | 35/35 |
| diff scope matches phase | 15/15 |
| CLAUDE.md conventions | 15/15 |
| decision log respected | 10/10 |
| code reads cleanly | 10/10 |
| commit message accurate | 5/5 |
| **Total** | **90/90** (100%) |
**Band:** COMPLETE
**Caps applied:** none
