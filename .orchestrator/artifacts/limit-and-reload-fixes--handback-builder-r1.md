produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: limit-and-reload-fixes · round: r1
status: complete        failure_class: n/a
paths: js/plex.js, js/poster-cache.js, js/main.js, tests/poster-cache.test.js, tests/plex.test.js, tests/e2e/content-rating.spec.mjs, tests/e2e/pi-stability.spec.mjs, tests/e2e/preset.spec.mjs, tests/e2e/status.spec.mjs, scripts/mock-plex.mjs (all staged with git add, not committed; the node_modules symlink is removed)
criteria:
1. met: `test -f tests/poster-cache.test.js && node --test tests/poster-cache.test.js` -> tests 30, pass 30, fail 0
2. met: `test -f tests/plex.test.js && node --test tests/plex.test.js` -> tests 38, pass 38, fail 0
3. met: `npm run test:e2e -- content-rating` -> PASS content-rating (new cases 23 and 24)
4. met: `npm run test:e2e -- pi-stability` -> PASS pi-stability (new case 15)
5. met: `npm run test:e2e -- preset` -> PASS preset (two new K60 cases)
6. met: `npm run test:e2e -- status` -> PASS status (two new cases)
7. met: `npm test` (332 pass, 0 fail) && `npm run test:e2e` (exit 0, no FAIL lines) && `node scripts/check-precache.mjs` ("31 precached files OK", exit 0)
8. met: the scope probe printed SCOPE_OK; sw.js VERSION is still '2.1.0'
9. narrated: see the findings below
deviations: (a) F6 timeout: the status cases force a true 'timeout' error by stalling every request to the mock with page.route, so the 10 s request timeout fires and the card reads "Plex did not respond in time." (b) F7: the update reload does not pass through the daily-reload blocker, the 10 minute gap or the probe. Existing case 14b (dailyReload false, expects an update reload) requires that, so only reloadMustWait() is shared. (c) The mock gained `episode=1` (plus `episodeRating`, `grandparentRating`) on /__mock/play; existing behaviour is unchanged.
questions: none

Agent: fixes-builder-r1 · dispatched: 2026-10-14T22:19:21Z

## Mechanism
- js/plex.js toPoster: an episode with `grandparentContentRating` carries the series' rating as `contentRating`. Without it, `contentRating` stays the episode's own (the live limit check is unchanged) and the poster gets `episodeRating: true`.
- js/poster-cache.js: `put` and `refreshRating` never take a rating from an `episodeRating` poster. `put` keeps the show's stored rating, or '' for a show never seen, which fails closed under a limit (D37). The key scheme is unchanged.
- js/main.js: no change was needed for F1 beyond the poster flag. F6, F5 and F7 are described below.

## Red / green evidence
- Unit: before the code change, `node --test tests/poster-cache.test.js tests/plex.test.js` printed 4 `not ok` (37, 38, 66, 67), pass 64. After: pass 68, fail 0.
- content-rating 23/24, run with js/plex.js and js/poster-cache.js stashed: case 24 failed `'' !== 'PG'` and case 23 failed `'TV-PG' !== 'TV-MA'`. After: both PASS.
- status, before the js/main.js change: `FAIL limit set, nothing cached...` with the message 'No posters within the household limit are available while Plex is unreachable.'. After: PASS.
- preset, before the js/main.js change: the new first-boot case failed on the toast assertion. After: PASS.
- pi-stability case 15, before: `the PIN prompt is open: the tab navigated` (3 !== 2). After: PASS, and 14a/14b/14c still pass.

## Criterion 9: each finding and the test that pins it
- F1 (`js/main.js:238`, an episode's rating written under the show's key):
  - tests/plex.test.js: "toPoster: an episode carries the series rating when Plex sends grandparentContentRating" and "...marks its rating as the episode's own".
  - tests/poster-cache.test.js: "an episode poster never changes the stored rating of its show, through put or refreshRating"; "an episode without a rating never stores "" over the show rating, and a new episode-only entry has no rating (fails closed)"; "the show rating still follows Plex when the show item itself is seen".
  - tests/e2e/content-rating.spec.mjs: case 23 (TV-PG episode of a cached TV-MA show: the show is never shown offline under PG) and case 24 (unrated episode: the PG show is still shown offline).
- F5 (`js/main.js:1433`, a fresh config.json install shows the upgrade toast): js/main.js writes the marker when settings are provisioned. Pinned by tests/e2e/preset.spec.mjs "K60: a config.json-provisioned first boot writes the marker and shows no toast" and "K60: an upgraded stored install (config.json beside it) still shows the toast".
- F6 (`js/main.js:315`, the limit wording on an empty cache): the limit wording is used only when the cache has entries and none passes allows(). Pinned by tests/e2e/status.spec.mjs "limit set, nothing cached, Plex times out..." and "limit set, every cached poster above it...".
- F7 (`js/main.js:1241`, the controllerchange reload bypasses reloadMustWait()): controllerchange now sets reloadPending='update'. runDailyReload handles it first, waiting on reloadMustWait() and then calling reloadAutomatically(). skipReload no longer clears a pending 'update'. Pinned by tests/e2e/pi-stability.spec.mjs case 15, "a service-worker update waits for the PIN prompt to close, then reloads".

## Commands and output tails
```
node --test tests/poster-cache.test.js  -> # tests 30 # pass 30 # fail 0
node --test tests/plex.test.js          -> # tests 38 # pass 38 # fail 0
E2E_PORT=18480 E2E_MOCK_PORT=18801 npm run test:e2e -- content-rating|pi-stability|preset|status -> PASS for each
npm test -> # tests 332 # pass 332 # fail 0
npm run test:e2e -> ... PASS ui-rotation / e2e exit 0
node scripts/check-precache.mjs -> 31 precached files OK
```
