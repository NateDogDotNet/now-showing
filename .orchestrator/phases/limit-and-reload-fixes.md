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
