produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: metadata-and-now-playing · round: r1
status: complete        failure_class: n/a
paths: js/plex.js, tests/plex.test.js, js/engine.js, tests/engine.test.js, js/display.js, js/poster-cache.js, js/main.js, index.html, css/app.css, scripts/mock-plex.mjs, tests/e2e/metadata.spec.mjs, tests/e2e/now-playing.spec.mjs (all staged in /home/user/wt-metadata-and-now-playing, nothing committed; `git status --porcelain` shows exactly these 12). Also appended Q-mnp1 and Q-mnp2 to /home/user/plex-poster-app/.orchestrator/questions.md.
criteria:
  1. met — `test -f tests/plex.test.js && test -f tests/engine.test.js && node --test tests/plex.test.js tests/engine.test.js` -> 70 tests, 70 pass, exit 0
  2. met — `npm test` -> 230 tests, 230 pass, exit 0
  3. met — `E2E_PORT=21420 E2E_MOCK_PORT=21421 npm run test:e2e -- metadata` -> PASS metadata (8 cases), exit 0
  4. met — `E2E_PORT=21420 E2E_MOCK_PORT=21421 npm run test:e2e -- now-playing` -> PASS now-playing (14 cases incl. K18 x4 and C8M1 x2), exit 0
  5. met — `grep -Eq 'pixelShift: *false' tests/e2e/now-playing.spec.mjs && grep -q 'name="showMeta"' index.html && grep -q 'id="progress"' index.html` -> exit 0
  6. met — `node scripts/check-precache.mjs` -> "26 precached files OK", exit 0
  Routed must-fixes: C8I1/D37 met (metadata.spec case 8, engine unit tests); K18 met (now-playing.spec case 9, four variants); C8M1 met (now-playing.spec case 10, two variants).
  Extra: the whole e2e suite (`npm run test:e2e`, E2E_PORT=21420) also passed: cache-first, content-rating, display-decode, metadata, now-playing, rotation, sleep, smoke, ui-rotation.
deviations: none from the brief. Readings I built on (both asked as questions, see below): batch-request failure fails closed; episode year/duration. Unspecified details I chose, all small: formatRuntime gives `2 h` (not `2 h 0 m`) for whole hours and '' under 30 s; with showTitle and showMeta both on, the card shows the 2.0.0 title line and the meta line as two lines; the bar is `transform: scaleX()` with one `transform` transition (compositor-run) rather than a `width` transition, and `#progress` sits in `#poster-box` (inside `#stage`) as the fill itself with no track; `#player-label` is a separate element at the top of the poster window (the plan says "info area", which does not exist until fill-blur-and-info). No sw.js change: no new js/ file. tests/plex.test.js: the existing pool() deepEqual gained `duration: 0` because toPoster has a new field.
questions: Q-mnp1 (a failed batched re-rating request stores '' for every key it asked about; pool load still succeeds), Q-mnp2 (episode year = grandparentYear when sent else ''; episode duration is the episode's own because the bar needs the playing item's length)

Agent: metadata-and-now-playing-builder-r1 · dispatched: 2026-10-10T16:11:08Z

## What changed
- js/plex.js: `formatRuntime(ms)` exported; `toPoster` carries `duration` (ms, 0 = unknown), year for episodes from `grandparentYear`; `pickNowPlaying` adds `viewOffset`, `playerTitle`, `playerState`, `paused` (JSON and XML string attributes both); new `client.items(keys)` = ONE `GET /library/metadata/k1,k2,...` (literal commas).
- js/engine.js: `engine.session` (latest snapshot, set on every decide(), null when nothing playing / showNowPlaying off / filter hides it); K18 (an `auth` error from the sessions fetch = nothing playing); C8M1 (`decide({ sessionsError })` never asks again; auth error = nothing playing, any other error is rethrown as the second fetch would have); D37 (`cachedKeys`/`onRatings` options; on every actual online pool load under a limit, one batched `items()` for at most 100 cached keys, every returned item re-rated, every other asked key (or all of them if the request failed) gets '').
- js/poster-cache.js: index entry stores `duration` (only when known); year/contentRating were already stored; no summary.
- js/display.js: `setTitle` renders title line (showTitle) and/or `rating · runtime · year` (showMeta); `setNowPlaying(session)` sets the bar to viewOffset/duration then ONE linear transition for the remaining time, frozen when paused, plus the "Playing in X" label.
- js/main.js: wires engine options to the poster cache, passes `sessionsError` from the failed poll into decide(), `updateNowPlaying()` after each tick (only while that session's poster is on screen and allowed), cleared in blockPoster/handleFailure.
- index.html / css/app.css: `#progress` (3 px, bottom of `#poster-box`, inside `#stage`), `#player-label`, three settings checkboxes bound by name (`showMeta`, `showProgress`, `showPlayer`; settings-ui.js binds generically so it is untouched); the poster-blocked rule also hides both.
- scripts/mock-plex.mjs: durations (item 3 = PG-13, 8,040,000 ms, 1972; item 8 has no rating and no runtime), `/__mock/play` takes offset/duration/player/state and returns `Player: { title, state }`, `/__mock/rate`, `/__mock/sessions-status`, `/__mock/log` (cleared by reset-stats), and `/library/metadata/<k1>,<k2>,...` answers the batched request.

## Pre-implementation failures (RED, before any js/ change)
Unit (`node --test tests/plex.test.js tests/engine.test.js`, saved /tmp/mnp/red-unit.txt):
```
# SyntaxError: The requested module '../js/plex.js' does not provide an export named 'formatRuntime'
not ok 2 - tests/plex.test.js
not ok 36 - the engine exposes the latest session snapshot even when decide() returns null for an unchanged poster
not ok 37 - the snapshot is null when nothing is playing, when showNowPlaying is off, and when the filter hides the title
not ok 38 - K18: a 401/403 on the engine's own /status/sessions fetch means nothing is playing and rotation carries on
not ok 40 - C8M1: decide({ sessionsError }) does not fetch /status/sessions again; a refused poll is nothing playing
not ok 41 - C8M1: decide({ sessionsError }) rethrows any other failed poll, still without a second request
not ok 43..48 - D37: (six cases)
# tests 49   # pass 37   # fail 12
```
E2E (`E2E_PORT=21420 E2E_MOCK_PORT=21421 npm run test:e2e -- metadata now-playing`, /tmp/mnp/red-e2e.txt): `FAIL metadata` (cases 1, 2, 5, 6, 7, 8 failed; 3 and 4 passed because they assert the unchanged 2.0.0 behaviour) and `FAIL now-playing` (all 14 cases failed).

## Mutation check (in a scratch copy under /tmp/mnp, not the worktree)
With the K18 catch removed, `sessionsError` not passed from main.js, and the recheck call removed: case 8 (C8I1) failed "the stored rating of title 4 to follow Plex did not happen", all four K18 cases failed, both C8M1 cases failed with "forced tick 1 with 500/403 on sessions: 2 /status/sessions requests". So each must-fix test fails without its fix. (The scratch copy was left in /tmp/mnp/mut.*; my `rm -rf` of it was refused by the safety check, so it is still there and can be deleted.)

## Final command output tails
```
$ node --test tests/plex.test.js tests/engine.test.js        -> # tests 70  # pass 70  # fail 0   (exit 0)
$ npm test                                                   -> # tests 230 # pass 230 # fail 0  (exit 0)
$ npm run test:e2e -- metadata                               -> PASS case 8 C8I1 re-rated title is never shown offline / PASS metadata (exit 0)
$ npm run test:e2e -- now-playing                            -> PASS case 10 C8M1 403 poll, one request per tick / PASS now-playing (exit 0)
$ grep pixelShift/showMeta/progress checks                   -> exit 0
$ node scripts/check-precache.mjs                            -> 26 precached files OK
$ npm run test:e2e (full)                                    -> PASS cache-first, content-rating, display-decode, metadata, now-playing, rotation, sleep, smoke, ui-rotation; exit 0
```
Key e2e lines: "600 s of 6000 s: #progress is 10 % of the poster window, 3 px high, inside #stage, on the bottom edge"; "the bar moved 10.0 % -> 12.0 % with one linear transition of 90s"; "after the next poll with offset 1200000 the bar is 20 %"; "state=paused: the bar sits at 60 % and does not move"; "showMeta:true: #title-card reads "PG-13 · 2 h 14 m · 1972""; "one online pool load under PG-13: one batched GET /library/metadata/1,...,8; the index now says title 4 is R"; "24 offline rotations after the re-rating never show title 4 (shown: 2,3,6)"; "403 on /status/sessions: a tick with a failed playback poll makes exactly one request (3 forced ticks)".

## Notes for the conductor
- (verify) carried: `viewOffset`, `duration`, `Player.title` in /status/sessions, and the batched `GET /library/metadata/k1,k2,...` request format on a real server (real-server-validation-extended, per D37).
- I did not touch js/sleep.js, js/settings.js, js/schedule.js, js/settings-ui.js, tests/e2e/lib.mjs, sw.js, or any doc.
