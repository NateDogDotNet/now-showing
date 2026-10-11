produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: metadata-and-now-playing · round: r3
status: complete        failure_class: n/a
paths: js/engine.js, js/display.js, tests/engine.test.js, tests/e2e/now-playing.spec.mjs (changed this round, restaged); r1/r2 staged set unchanged: css/app.css index.html js/main.js js/plex.js js/poster-cache.js scripts/mock-plex.mjs tests/e2e/metadata.spec.mjs tests/plex.test.js
criteria: 1 met (node --test tests/plex.test.js tests/engine.test.js: 73/73) · 2 met (npm test: 233/233) · 3 met (npm run test:e2e -- metadata: PASS) · 4 met (npm run test:e2e -- now-playing: PASS, cases 1-12) · 5 met (grep chain exit 0) · 6 met (check-precache: 26 precached files OK) · lint met (eslint with round--eslint-r1e.config.mjs on all staged JS: exit 0) · full npm run test:e2e: exit 0
deviations: none. MCI1 has no e2e: the mock has 8 titles, so 250 cached keys cannot be built naturally; it is covered by 4 unit tests.
questions: none

Agent: metadata-and-now-playing-builder-r3 · dispatched: 2026-10-10T17:00:27Z

## What changed
1. MCI1 (js/engine.js `recheckCachedRatings`): the cached keys go in batches of 100 (`RECHECK_BATCH`), at most 3 requests (`RECHECK_REQUESTS`, the cache cap of 300). All keys are reported in ONE `onRatings` call, in cache order. A key the response leaves out, every key of a failed batch, and any key beyond 300 (never asked) are stored `contentRating:''`. A failed batch does not stop the later batches. The old test "at most 100 cached keys are asked about" asserted the removed cap and was replaced by four tests.
2. MCM2 (js/display.js): display remembers the last session passed to `setNowPlaying` (cleared with null, so a blocked or non-live session is never redrawn). `apply()` redraws it when `showProgress` or `showPlayer` changed, before any await, so the live preview and Save show it at once whether or not a tick is running. The redraw advances a `playing` bar by the time since it was drawn, so it does not jump back. No main.js change was needed.
3. MCM3 (js/display.js): only `playerState === 'playing'` animates; paused and buffering are frozen.

## Tests first (RED on the r2 tree plus the new tests, before the implementation)
node --test tests/engine.test.js:
  not ok 46 - D37 (MCI1): 250 cached keys are asked about in batches of 100 and every one is reported
  not ok 47 - D37 (MCI1): a key whose batch fails is stored as unrated; the other batches still apply
  not ok 48 - D37 (MCI1): a key a batch leaves out is unrated, in any batch
  not ok 49 - D37 (MCI1): keys beyond what three requests cover are never asked about and are stored as unrated
  # tests 51  # pass 47  # fail 4
E2E_NP_ONLY='^1[12] ' node tests/e2e/now-playing.spec.mjs:
  case 12 failed: AssertionError: the previewed bar did not happen within 2000 ms (last: false)
  case 11 failed: AssertionError: buffering: the bar stays put (0.5033 -> 0.5237)

## Tests after the fix
engine 51/51 pass. e2e now-playing cases 11 and 12 PASS:
  ok  toggling the bar and the label previews at once; Cancel undoes it
  ok  Save with a tick running: the bar and the label appear, and go, at once   (the tick's /status/sessions is held with page.route)
  ok  state=buffering: the bar sits at 50 % with no running transition; state=playing animates it again

## Criteria (E2E_PORT=21420 E2E_MOCK_PORT=21421)
c1=0 (tests 73, pass 73, fail 0) · c2=0 (tests 233, pass 233, fail 0) · c3=0 "PASS metadata" · c4=0 "PASS now-playing" · c5=0 · c6=0 "26 precached files OK" · lint=0 · full `npm run test:e2e` rc=0 (PASS rotation, sleep, smoke, ui-rotation, now-playing, metadata and the rest).
