# limit-and-reload-fixes

- Mode: afk        Tags: risk:high        Blocked by: release-bump (done 1450d71)
- Agent type: orchestrator-builder; model sonnet, effort high
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
