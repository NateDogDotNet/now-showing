produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: limit-and-reload-fixes · round: r2
status: complete        failure_class: n/a
paths: js/plex.js, js/poster-cache.js, tests/plex.test.js, tests/poster-cache.test.js, tests/e2e/content-rating.spec.mjs (r2 edits). The r1 files js/main.js, scripts/mock-plex.mjs, tests/e2e/pi-stability.spec.mjs, tests/e2e/preset.spec.mjs and tests/e2e/status.spec.mjs are unchanged in r2 and stay staged. The node_modules symlink is removed.
criteria:
1. met: `test -f tests/poster-cache.test.js && node --test tests/poster-cache.test.js` -> tests 32, pass 32, fail 0
2. met: `test -f tests/plex.test.js && node --test tests/plex.test.js` -> tests 39, pass 39, fail 0
3. met: `E2E_PORT=18480 E2E_MOCK_PORT=18801 node tests/e2e/run.mjs content-rating` -> PASS content-rating (cases 23, 24 and the new 25 all PASS)
8. met: the scope probe printed SCOPE_OK; sw.js VERSION is untouched
also run: `npm test` -> pass 335, fail 0. I did not re-run the full e2e suite or criteria 4-7; the conductor runs the full suite.
deviations: none (see "Case 25" below for one assertion I left out, and "Cold Minor 3" for how I read it)
questions: none

Agent: fixes-builder-r1 · dispatched: 2026-10-14T23:56:31Z (r2)

## Changes (D75)
- js/plex.js `toPoster`: `contentRating` is always the item's own rating, so the live check (js/engine.js:71, js/main.js:122) sees an episode's own rating. A NON-EMPTY string `grandparentContentRating` on an episode travels apart as `seriesRating`. An episode without one carries `episodeRating: true`, as in r1. A movie never gets either field.
- js/poster-cache.js: `put` stores `seriesRating` under the show's key when present. Otherwise an `episodeRating` poster keeps the stored show rating ('' when the show was never seen, so it is hidden under a limit, D37). Otherwise the poster's own rating is stored. `refreshRating` follows `seriesRating` when present, ignores an `episodeRating` poster without one, and otherwise uses `contentRating`.

## Tests first
RED before the code change: `node --test tests/poster-cache.test.js tests/plex.test.js` printed 4 `not ok` (37, 38, 39, 70) with pass 67. GREEN afterwards: pass 71, fail 0. Final counts are in criteria 1 and 2 above.
- Fixed the old plex.test.js assertion that put the show's rating into `contentRating`.
- plex.test.js: "an episode keeps its own contentRating and carries a non-empty grandparentContentRating as seriesRating".
- plex.test.js: "...without a non-empty grandparentContentRating marks its rating as the episode's own". It covers the absent, '' and non-string cases (cold Minor 2), and a movie that carries no series field.
- plex.test.js, the anchored review's case: "a TV-MA episode of a TV-PG show is refused live under PG and cached as TV-PG". The live `allows('PG', contentRating)` is false, and `seriesRating` is TV-PG.
- poster-cache.test.js: "seriesRating is stored under the show key by put and refreshRating, even beside a different own rating".
- poster-cache.test.js: "an empty seriesRating never overwrites the stored show rating" (cold Minor 2). That test passes on the first run, because the episode poster in it already carries `episodeRating: true`, which the r1 cache code ignores. It guards the new rule rather than going red first.

## E2E
- Cold Minor 3: cases 23 and 24 no longer use fixed waits.
  - The 500 ms waits after `waitForTitle` are removed. The tick calls `refreshRating` before the fetch, so a shown poster means it has already run.
  - The 1500 ms wait after the offline reload is replaced by `posterShown`.
  - The new helper `indexRatingIs` polls the index entry. Case 25 uses it for the one update that really is asynchronous. Cases 23 and 24 assert that the stored rating does not change, so I did not poll them.
- Case 25 (anchored Minor 2), using the mock's `grandparentRating` option:
  - Limit PG, with the TV-MA show 5 cached. Episode TV-PG with `grandparentRating` TV-PG plays; the index entry for 5 becomes TV-PG, polled with `indexRatingIs`.
  - A TV-MA episode of that TV-PG show plays; over 10 refreshes under PG, title 5 is never displayed. That is the live check using the episode's own rating.
  - I did not assert the index rating after the second part. A pool recheck re-reads the show as a movie from the mock and writes TV-MA back, so that assertion was nondeterministic and failed once.

## Output tails
```
node --test tests/poster-cache.test.js -> # tests 32 # pass 32 # fail 0
node --test tests/plex.test.js         -> # tests 39 # pass 39 # fail 0
E2E_PORT=18480 E2E_MOCK_PORT=18801 node tests/e2e/run.mjs content-rating -> ... PASS case 4 cached posters offline / PASS content-rating
npm test -> # pass 335 # fail 0
```
