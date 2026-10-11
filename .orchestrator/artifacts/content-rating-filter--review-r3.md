produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: content-rating-filter · round: r3 · mode: anchored
**Verdict:** APPROVE

Reviewer: content-rating-filter-review-anchored-r3 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T04:24:25Z · Method: anchored full review (risk:high, ui) · Scope: content-rating-filter, r3, base e9394ec, tree a59b8b375ba964fa67011652f36f8656c8797df6 (staged index of /home/user/wt-content-rating-filter)

Criterion 6 attacks: PASS
UI screenshots: PASS

## What I read and ran

Read: plan §13 `content-rating-filter` (docs/integration-plan.md:319-347), spec R-FILT-1 (docs/spec.md:232-250), D5 / D21 K5 / D28 A8-d (docs/decisions.md:11,49,75), Q19 ruling (.orchestrator/questions.md:17,24,29), phase record (.orchestrator/phases/content-rating-filter.md: K19, K20, K22, R2/K21), the full staged source diff (`git diff --cached -- js/ css/ index.html sw.js scripts/`), js/display.js:101-150 (show), js/main.js tick/fetchImage/handleFailure/applySettings/togglePin, js/settings.js:76-77, and the e2e spec tests/e2e/content-rating.spec.mjs.

Ran, in a scratch extract `D=$(mktemp -d)` = /tmp/tmp.BCkP1cPcnu made with `git archive a59b8b3 | tar -x` (node_modules symlinked from the worktree; nothing written to the live tree or the index; the scratch directory is removed; `git write-tree` in the worktree still gives a59b8b3):
- `npm test`: 205 pass, 0 fail.
- `E2E_PORT=19510 E2E_MOCK_PORT=19511 npm run test:e2e -- content-rating`: all 13 cases PASS.
- My own attack spec (scratch only, `tests/e2e/review-attacks.spec.mjs`, ports 19520/19521). A MutationObserver records every active layer and whether `body.poster-blocked` or `.asleep` was set at the time:
  - A, pinned poster: title 4 (R) shown with no limit, pinned, then PG-13 saved through the UI. It stays (exempt), also after a reload. Unpinning removes it in 2 ms and it is never visible again. PASS.
  - B, now-playing: PG-13 with `limitNowPlaying:false`, `mock.play(4)`, so title 4 shows. Ticking "Apply the limit to what's playing" and saving replaces it with title 2. In 10 refreshes title 4 is never visible. PASS.
  - C, sleep/wake: title 4 up, the clock moves into the 01:00 window (asleep), PG-13 is saved (the press wakes the screen manually; state right after the save is `{"asleep":false,"blocked":true,"alt":""}`), then the clock runs through the manual-wake expiry and past 07:00. After the save title 4 is never visible and the screen wakes to title 1. PASS.
- Plex ignoring the filter: in the scratch copy I mutated scripts/mock-plex.mjs:93 to `const ratings = null` so the mock ignores `contentRating`, then ran cases 1, 2, 4, 5 and 12 (ports 19530/19531). All PASS: 50 PG-13 refreshes show only titles 1, 2, 3 and 6, now-playing is blocked, the offline cache is filtered, and the in-flight R4 path holds. Mutation reverted (checked with grep).
- Unknown or corrupt limit reaching the engine (node, scratch). `allows(l,'G')` is false and `allowedValues(l)` is `[]` for `'PG13'`, `'pg-13'`, `'x'`, `0`, `false` and `'NC17'`. `createEngine(...).decide({force:true})` with `maxContentRating:'PG13'` or `'garbage'` over a G/R/unrated pool throws `kind:'empty'`, so nothing is shown and the setting fails closed. (js/settings.js:76 `oneOf(...)` turns such a stored value into `''` before it reaches the engine. That is K21, outside the Output, and not a finding here.)
- PG-13 request list (node): `G TV-Y TV-G PG TV-Y7 TV-PG PG-13 TV-14 gb/U gb/PG gb/12 gb/12A de/0 de/6 de/12 au/G au/PG au/M ca/G ca/PG ca/14A fr/U fr/10 fr/12 nl/AL nl/6 nl/9 nl/12 nl/14`. It has every allowed ladder value and every mapped prefixed value at or below PG-13 per the Q19 table, and nothing above it (no R, TV-MA, NC-17, gb/15, de/16, au/MA15+, ca/18A, fr/16 or nl/16).
- Mutation checks for the carried must-fixes (scratch, reverted and grep-checked afterwards):
  - A8-d: changing the heal-path guard `if (!state.asleep)` at js/main.js:176 to `if (true)` makes case 9 fail with "the re-downloaded poster is not drawn under the veil". The test has teeth.
  - K5: replacing the drop-and-retry in handleFailure's catch (js/main.js:223-226, `cache.delete` + `continue`) with `break` makes case 8 fail with "the undecodable entry (title 1) was dropped from the index". The test has teeth.
- Screenshots (scratch spec, ports 19550/19551):
  - .orchestrator/artifacts/content-rating-filter--shot-settings-household-off.png: toggle off, no select, no limitNowPlaying (both also checked hidden by `isVisible`).
  - .orchestrator/artifacts/content-rating-filter--shot-settings-household-on.png: toggle on, select at "PG-13 (TV-14)", "Apply the limit to what's playing right now" visible and checked.
  - .orchestrator/artifacts/content-rating-filter--shot-empty-offline-limit.png: offline, only title 4 cached, PG-13 saved. 0 active layers and the empty card reads "No posters within the household limit are available while Plex is unreachable."

## Route-by-route (criterion 6)

| Route | Result | Evidence |
|---|---|---|
| Random | blocked | engine.js filters the loaded pool through `allows` before `pickRandom`; e2e case 1 (50 picks: 1, 2, 3, 6) |
| Offline cache | blocked | poster-cache.js `random(excludeKey, max)` filters by `allows`; handleFailure passes the current limit; case 4 (20 offline rotations) |
| Now-playing | blocked; allowed with `limitNowPlaying:false` | engine.js now-playing branch; case 5; my attack B (switching it on while R plays) |
| Cached pre-2.1 entry (no rating) | blocked | `allows(limit, undefined)` is false; case 4 second part |
| Pinned poster | allowed (exempt), as required | `allowedOnScreen` checks staticRatingKey; my attack A, including reload and unpin |
| Plex ignores the filter parameter | blocked | mock mutation run above: cases 1, 2, 4, 5, 12 pass |
| Limit saved while a download is in flight | blocked | `showPoster` re-checks before the draw; cases 12 and 13 (heal path) |
| Limit saved offline with an above-limit poster up | blocked at once | `applySettings` → `blockPoster`; cases 10 and 11 (gone within ms) |
| Sleep/wake around a limit change | blocked | my attack C |
| Unknown or corrupt limit at the engine | fails closed | node run above |
| K5 | holds | case 8 plus the mutation |
| A8-d | holds | case 9 plus the mutation |

## Strengths
- One predicate, `allows()`, does all the enforcing: in the engine (random and now-playing), in the cache (offline) and in main.js (what is already on screen). An unknown limit allows nothing (js/ratings.js `allows`, `max < 0 → false`).
- The guarantee is checked at the draw against the *current* settings, not the settings the tick started with. That closes the in-flight and offline-save routes, and a refused draw is never marked as shown.
- `blockPoster` hides the image with no fade, clears `alt`, the title card and `display.currentPoster`. Diagnostics, pinning (togglePin uses `display.currentPoster`) and the offline "due" check all see it as nothing on screen.
- The mock honours the list strictly, so an incomplete request list fails e2e case 1. The client-side guarantee survives a mock that ignores the list.

## Critical
None.

## Important
None.

## Minor
None. One observation that I did not raise as a finding is under Recommendations.

## Declined to judge
- **Multi-value syntax on a real Plex server.** URLSearchParams sends the list as `contentRating=G%2CTV-Y%2C…` (comma percent-encoded, `+` in `au/MA15+` encoded as `%2B`). Whether real Plex splits on an encoded comma is a **(verify)** item in the plan, checked in `real-server-validation-extended`. D5 makes the client-side filter the guarantee, and the ignore-filter run shows a wrong server parameter cannot leak a title.
- **K21 / R2** (js/settings.js sanitises an unknown stored limit to `''`, which fails open). This is an owner question outside the phase's Output, so it is not a finding here, per the dispatch.
- **K22** (no test for the post-decode re-check). This is a conductor ruling, already made.
- **Copy wording** of the help text and the empty-card message. That is a product question. The current text is accurate to the behaviour.

## Recommendations
- `tick()` returns at once when `state.busy` (js/main.js:155). A limit saved during a busy tick therefore loses its forced tick. If the in-flight tick's `decide()` had already returned null, the screen stays blocked (black, `poster-blocked`) until the next scheduled tick instead of getting a replacement within ~1 s. This fails closed, so it is not a child-safety route, and I did not reproduce it. If it matters for UX, a later phase could re-run a tick in `finally` when `poster-blocked` is set.

## Assessment
Every route listed in criterion 6 and in the dispatch was attacked. Each one either blocks the above-limit title or, for the pinned poster, correctly exempts it, including with the server filter disabled. The K5 and A8-d must-fixes hold, and their tests fail when the fixes are removed. The request value list for PG-13 matches the Q19 table exactly. The UI matches the plan: the toggle reveals the select defaulting to PG-13, limitNowPlaying appears only while the toggle is on, and the empty card shows offline when nothing within the limit is cached. Criteria 1 to 3 re-run green in the scratch copy.

**Verdict:** APPROVE
