produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: content-rating-filter · round: r1
status: complete        failure_class: n/a
paths: js/ratings.js, tests/ratings.test.js, js/plex.js, tests/plex.test.js, js/engine.js, tests/engine.test.js, js/poster-cache.js, tests/poster-cache.test.js, js/main.js, js/settings-ui.js, scripts/mock-plex.mjs, index.html, sw.js, tests/e2e/content-rating.spec.mjs (all staged, none committed; css/app.css was not needed and is untouched)
criteria:
  1. met - `test -f ... && node --test tests/ratings.test.js tests/plex.test.js tests/engine.test.js tests/poster-cache.test.js` -> tests 85, pass 85, fail 0, exit 0
  2. met - `npm test` -> tests 205, pass 205, fail 0
  3. met - `E2E_PORT=19420 E2E_MOCK_PORT=19421 npm run test:e2e -- content-rating` -> PASS content-rating (3 consecutive green runs after the last edit; full `npm run test:e2e` also exit 0: cache-first, content-rating, rotation, sleep, smoke, ui-rotation all PASS)
  4. met - `node scripts/check-precache.mjs` -> "26 precached files OK", exit 0
  5. met - the four-grep command -> exit 0
  6. narrated, not run by me (independent reviewer). Routes I closed or considered are listed under Notes.
deviations: (a) main.js `applySettings` forces a tick when `maxContentRating` or `limitNowPlaying` changed (otherwise a poster already up and now above the limit stays until the next rotation, against the Goal). Not named in the plan; case 7 covers it; delete the 3 lines if the conductor disagrees. (b) `engine.shown()` is no longer called in the offline path when `display.show` failed (previously it was called even on failure); needed for K5. (c) Existing assertion in tests/plex.test.js (`pool` deepEqual) gained `contentRating: ''`, and the engine test `fakeClient`/`setup` helpers gained optional params; no existing test was weakened. (d) The brief's process line says to wire css/app.css; it needed no change (checked by screenshot of the sheet), so it is not in `paths`.
questions: none

Agent: content-rating-filter-builder-r1 · dispatched: 2026-10-09T03:27:02Z

## Pre-implementation failures (tests written first, run before js/ratings.js and the wiring existed)

Unit (`node --test` on the four files): `# tests 60 / # pass 41 / # fail 19`
```
not ok 2 - tests/plex.test.js        (ERR_MODULE_NOT_FOUND: js/ratings.js)
not ok 4 - tests/ratings.test.js     (ERR_MODULE_NOT_FOUND: js/ratings.js)
not ok 17..19, 21..24, 26, 27, 31, 34   (engine: limit filter, pool args, cache key, empty hint, now-playing, pinned)
not ok 53..56, 58, 59                   (poster-cache: contentRating stored, random() skips)
```
E2E (`npm run test:e2e -- content-rating`), run after the JS engine/plex/cache/mock were done but BEFORE main.js, index.html and settings-ui.js were wired:
```
PASS case 1 PG-13 random posters / 2 R / 3 no limit / 5 now-playing   (engine+plex+mock were already in)
case 8 K5 undecodable cached poster offline failed: the undecodable entry (title 1) was dropped from the index
case 9 A8-d heal download vs sleep failed: the re-downloaded poster is not drawn under the veil  (+ 'Poster: The Grand Marquee' vs expected 'Midnight Projector')
case 6 household toggle failed: page.isChecked: Timeout 30000ms (#household-toggle missing)
case 7 tightening the limit ... failed: page.check: Timeout 30000ms (#household-toggle missing)
case 4 cached posters offline failed: offline under PG-13 showed title 4
FAIL content-rating
```

## Final runs
```
$ node --test tests/ratings.test.js tests/plex.test.js tests/engine.test.js tests/poster-cache.test.js
# tests 85  # pass 85  # fail 0
$ npm test
# tests 205  # pass 205  # fail 0
$ node scripts/check-precache.mjs
26 precached files OK
$ E2E_PORT=19420 E2E_MOCK_PORT=19421 npm run test:e2e -- content-rating
  ok  PG-13 request: contentRating lists gb/12 and every allowed value, none above; container size 300
  ok  50 refreshes under PG-13 show only titles 1, 2, 3 and 6 (all four appear)
  ok  under R titles 4 (R) and 5 (TV-MA) also appear, and 7 (gb/15); never 8 (unrated): 1,2,3,4,5,6,7
  ok  limit "": all 8 titles appear; no contentRating parameter; container size = pool size
  ok  no limit: title 4 (R) was shown and cached; the index stores contentRating
  ok  20 offline rotations under PG-13 never show title 4 (shown: 1,2,3,6)
  ok  cached entries without a stored rating (pre-2.1) are never shown offline while a limit is set
  ok  mock.play(4) under PG-13: title 4 is never displayed; a random allowed poster is
  ok  limitNowPlaying:false: the playing R title is displayed
  ok  toggle on -> Save stores maxContentRating PG-13 ... / toggle off -> Save clears maxContentRating to "" / toggling on again defaults to PG-13
  ok  saving PG-13 while title 4 (R) is up replaces it at once
  ok  offline: an undecodable cached poster is deleted and another is shown; no uncaught error      (K5)
  ok  heal download in flight when the sleep window opens: not drawn under the veil                 (A8-d)
PASS content-rating
$ grep -q ... (criterion 5)  -> exit 0
```

## Mutation checks (in a mktemp copy, never the worktree)
Each mutant made the named test fail: engine without the random filter (5 unit fails), without the now-playing filter (4), pool key without the limit (1), poster-cache random() without the rating check (5), unrated treated as allowed (10), no 3x oversample (1); e2e: A8-d guard removed -> case 9 fails; K5 `cache.delete` removed -> case 8 fails; limit-change force removed -> case 7 fails; offline `cache.random` called without the limit -> case 4 fails.

## Notes for the reviewer (risk:high)
- Single source of truth: `allows(limit, rating)` in js/ratings.js (fails closed on an unknown limit; '' allows all). Engine applies it to every random pick (re-filtering the cached pool on each decide, so a cache key slip cannot leak) and to now-playing (`limitNowPlaying !== false`, so a missing key also limits). The poster cache applies it in `random()`. The request value list is only an optimisation.
- Pinned poster: `client.item()` path, never filtered (D5). `engine.playing()` is unchanged (sleep still sees above-limit playback; the display then shows a random allowed poster).
- Known residual routes, not fixed because they need files outside Output or unnamed behaviour: (1) offline AND the limit is changed while an above-limit poster is up: handleFailure only rotates when due, and display.js has no clear, so that poster stays until the next due rotation; (2) js/settings.js `sanitize` turns an unknown stored limit (a typo in config.json, e.g. `PG13`) into `''` (no limit), so the engine's fail-closed branch is unreachable from settings; (3) a pre-2.1 cache entry stays unrated while its lookup keeps hitting (no write on a hit, by the existing cache-first test), so under a limit those entries are skipped offline until the artwork changes.
- Plex request syntax (`contentRating=a,b,c`, case, `+` in `au/MA15+`) is (verify) for real-server-validation-extended; the mock is strict about it as specified. Under R the mock also lets title 7 (gb/15) through, because the ruled table maps gb 15 to R.
- pool(): with a limit and `randomPoolSize` > 166 the container size is `min(3 x size, 500)`, so for size 1000 it is 500 (below the unlimited 1000), per the plan text.
