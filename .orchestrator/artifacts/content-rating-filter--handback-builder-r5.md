produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: content-rating-filter · round: r5
status: complete        failure_class: n/a
paths: js/main.js, tests/e2e/content-rating.spec.mjs (changed this round, both staged in /home/user/wt-content-rating-filter-r5); earlier-round files still staged and unchanged this round: css/app.css, index.html, js/engine.js, js/plex.js, js/poster-cache.js, js/ratings.js, js/settings-ui.js, scripts/mock-plex.mjs, sw.js, tests/engine.test.js, tests/plex.test.js, tests/poster-cache.test.js, tests/ratings.test.js; also appended Q25 to /home/user/plex-poster-app/.orchestrator/questions.md
criteria:
  1. met - `test -f` x4 && `node --test tests/ratings.test.js tests/plex.test.js tests/engine.test.js tests/poster-cache.test.js` -> tests 85, pass 85, fail 0
  2. met - `npm test` -> tests 205, pass 205, fail 0
  3. met - `E2E_PORT=19470 E2E_MOCK_PORT=19471 npm run test:e2e -- content-rating` -> PASS content-rating, exit 0 (16 cases); also 5 consecutive direct runs of the spec under 4-way parallelism, with the r4 candidate running on the same machine: 5/5 exit 0, about 85 s each (below run.mjs's 180 s spec timeout)
  4. met - `node scripts/check-precache.mjs` -> "26 precached files OK"
  5. met - the four-grep command -> exit 0
  6. narrated (independent reviewer), not run by me
  full suite: `npm run test:e2e` -> PASS cache-first, content-rating, rotation, sleep, smoke, ui-rotation (exit 0)
  lint: met - eslint --no-config-lookup -c round--eslint-r1e.config.mjs on every staged js/mjs file -> exit 0; `git diff --cached --check` -> exit 0; working tree equals the index (`git diff --name-only` empty)
  r5 item 1 CCI1: met - new e2e cases 14 and 15 (below)
  r5 item 2 CCM1: met - case 7 and every refresh loop now wait for the poster to change (below)
  r5 item 3 A3-rec: met - new e2e case 16 (below)
deviations: (a) Two behaviours the brief leaves open, both inside js/main.js. First, "let the preview carry the unsaved limit" and "no title above the saved limit is ever drawn while an unsaved looser toggle is previewed" can only both hold if the limit in force during a preview is the STRICTER of the saved limit and the previewed one (and `limitNowPlaying` is on if either is on). So a previewed stricter limit applies at once, a previewed looser one waits for Save, and Cancel (which previews the saved settings again) puts the limit back through the same path. (b) The e2e now seeds `crossfadeMs: 0` and spaces refreshes 350 ms apart; see "Root cause of the flake" below. js/settings-ui.js needed no change (it still passes the unsaved form to onPreview; main.js applies the guard).
questions: Q25 (display.js decode/revoke race; not fixed, outside Output)

Agent: content-rating-filter-builder-r5 · dispatched: 2026-10-09T04:33:17Z

## What changed
js/main.js
- `committed` holds the settings last applied for real (boot, Save, pin, rotate). A live preview never replaces it.
- `guardedPreview(next)`: for a preview, `maxContentRating` = the stricter of saved and previewed (no limit is the loosest; a value off the ladder counts as strictest, fail closed), `limitNowPlaying` = saved || previewed.
- `enforceLimit(prev)`: if the effective limit or `limitNowPlaying` changed, or the poster on screen is no longer allowed, it calls `blockPoster()` (no fade, offline too) and reports that a forced tick is due. Save and preview both use it; preview runs it before anything is awaited.
- `requestTick({force})`: a tick asked for while `state.busy` is queued in `state.rerun` and `tick()` runs it (forced) in its `finally`. Used by Save (connection or limit change) and by a preview that changed the limit. So a limit saved while a tick is running no longer loses its forced tick.
- Cancel/close: `onPreview(original)` goes through the same guard, so restoring the saved settings re-checks the poster and forces a tick.

tests/e2e/content-rating.spec.mjs (cases 14 to 16 are new; 7 changed)
- `showNextSettled(page)`: click refresh, poll until the active alt changes (repeat the click every 2 s, fail after 15 s), then wait SETTLE_MS (350). `sample` and `sampleUntil` use it, so case 7 and cases 1, 2, 3, 5, 12, 13 no longer read a fixed 250 ms after the click.
- 14 CCI1: PG-13 saved; open Settings, untick the household toggle (unsaved), change Poster fit (live control), refresh until an above-limit title would be up (or 30 times) -> nothing above PG-13 or unrated is ever drawn (MutationObserver recorder), stored limit still PG-13; Cancel -> nothing above the limit on screen, 12 more refreshes only allowed titles.
- 15 CCI1 stricter: no limit; title 4 (R) up; open Settings, tick the toggle, select G (unsaved), change Poster fit -> title 4 is replaced by title 1 (the only G title) at once and only title 1 is drawn; nothing saved; Cancel -> the saved no-limit applies again and title 4 can return.
- 16 A3-rec: hold the first image request, save PG-13 through the UI, release -> the held poster is drawn, then a new allowed poster follows within 8 s (rotateSeconds 3600).

## e2e first, failing on a59b8b3 (the staged tree's js/main.js, in a mktemp copy)
```
case 14 CCI1 live preview of an unsaved looser limit vs the saved limit failed:
AssertionError [ERR_ASSERTION]: no title above PG-13 or unrated was drawn while Settings was open: 2,4,6
case 15 CCI1 live preview of a stricter unsaved limit, then Cancel failed:
AssertionError [ERR_ASSERTION]: the previewed G limit replaced title 4 with the only G title (on screen: 4)
case 16 A3 limit saved during a running tick keeps its forced tick failed:
AssertionError [ERR_ASSERTION]: a new poster followed without waiting for the rotation (the saved limit was not left without its forced tick)
```
(Re-run with the final spec against a59b8b3's js/main.js: the same three fail, case 14 with "...while Settings was open: 2,8".)

## Mutations (mktemp copy of the staged tree; each reverted)
```
guardedPreview clamp removed (preview carries the looser limit) -> case 14 fails: "...while Settings was open: 6,8"; 15 and 16 pass
enforceLimit not run for a preview                                -> case 15 fails: "...replaced title 4 with the only G title (on screen: 4)"; 14 and 16 pass
state.rerun not set (forced tick dropped while busy)              -> case 16 fails: "a new poster followed without waiting for the rotation"; 14 and 15 pass
```

## Root cause of the case 1/2/5/7/15 flake (CCM1), and Q25
Replacing the 250 ms read with "wait until the poster changes" first made things worse: cases 1, 2, 5 and 15 failed with "the refresh did not change the poster within 15000 ms". Diagnostics showed no pending request and no error; the inactive poster layer had its `alt` set but `src` null. Cause is in js/display.js `show()`: after a draw it schedules, crossfadeMs + 200 ms later, a timer that revokes the previous layer's object URL and runs `prev.removeAttribute('src')` if that layer is not active. If the next refresh is decoding on that very layer when the timer fires, its `src` is removed mid-`decode()`, the decode never settles, `state.busy` stays true and every later refresh is ignored. That is also what the r3 reviewers saw as "title 4 not on screen" in case 7 and as case 1 showing only 1,3,6: the 250 ms sampling simply hid the stall. In the field it needs a draw less than about 1.4 s after the previous one, so it is rare (rotateSeconds >= 10), but it is a real hang. display.js is outside this phase's Output, so I did not change it; recorded as Q25. The spec avoids it: cases seed `crossfadeMs: 0` (timer 200 ms) and refreshes are spaced 350 ms apart, so a decode never straddles the timer. With that, 5/5 spec runs and the full e2e passed.

## Command tails
```
== c1  # tests 85  # pass 85  # fail 0   (c1 exit 0)
== c2  # tests 205 # pass 205 # fail 0
== c4  26 precached files OK              (exit 0)
== c5  exit 0
== c3  npm run test:e2e -- content-rating
  ok  20 offline rotations under PG-13 never show title 4 (shown: 1,2,3,6)
  ok  cached entries without a stored rating (pre-2.1) are never shown offline while a limit is set
PASS case 4 cached posters offline
PASS content-rating
c3 exit 0
== full e2e (E2E_PORT=19470 E2E_MOCK_PORT=19471)
PASS cache-first / content-rating (cases 1-16 each PASS) / rotation / sleep / smoke / ui-rotation   (exit 0)
5 direct spec runs: run 1..5 exit 0, 85-86 s each
```
Case 7 itself, final form (title 4 up via `sampleUntil`, then PG-13 saved, replaced): `PASS case 7 tightening the limit replaces the poster on screen` in every run above.

## Notes for the reviewer
- Pin edge, not changed: a Settings preview that unpins (Unpin clicked, then a layout control touched) can take a pinned above-limit poster down; Cancel then restores the pin but no tick is forced, so the replacement stays until the next rotation. It fails closed and involves the pin, not the limit.
- Residuals R2 and R3 from earlier rounds are unchanged.
