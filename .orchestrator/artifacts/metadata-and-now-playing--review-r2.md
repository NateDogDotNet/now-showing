produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: metadata-and-now-playing · round: r2 · mode: anchored
**Verdict:** CHANGES REQUESTED

Reviewer: metadata-and-now-playing-review-anchored-r2 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T16:40:35Z · Method: anchored code+UI review · Scope: metadata-and-now-playing, r2, base f0b3425, tree bc50606

UI screenshots: PASS

## What I read and ran

Read: the plan section for phase 21 in docs/integration-plan.md; R-NP-1 and R-NP-2 in docs/spec.md; D1, Q22, D24 (K18), D28 (C8M1) and D37 in docs/decisions.md; the phase record (K25, K26); `git diff --cached` in /home/user/wt-metadata-and-now-playing; tests/e2e/lib.mjs (withApp); the head of tests/e2e/now-playing.spec.mjs; js/settings.js:73; js/poster-cache.js:63-70 and :108; js/plex.js:71-74; index.html:34-44; css/app.css:43-96.

Ran: tree bc50606 extracted with `git archive bc50606 | tar -x` into a `mktemp -d` scratch dir (no git worktree, no change to the live tree; `git write-tree` there is still bc50606 afterwards). The scratch dir has been removed.
- `npm test`: 230 pass, 0 fail (criteria 1 and 2).
- `node scripts/check-precache.mjs`: "26 precached files OK" (criterion 6). Criterion 5 grep chain: exit 0.
- Full e2e suite run twice (`E2E_PORT=21510/21511`, then `21512/21513`, `node tests/e2e/run.mjs`): exit 0. Every spec PASSes: cache-first, content-rating (cases 1-22), display-decode, metadata (cases 1-8), now-playing (cases 1-10, including K18 401/403 in both variants and C8M1 with a 500 and a 403 poll), rotation, sleep, smoke, ui-rotation. This covers criteria 3 and 4 and shows nothing regressed.
- A probe of the re-check coverage (issue 1 below).
- Screenshots: `serve.mjs --mock --port 21520 --mock-port 21521` and a withApp script at 1920x1080 and 1080x1920, writing six PNGs to .orchestrator/artifacts/metadata-and-now-playing--shot-<size>-{meta,playing,rot90}.png, with geometry measured from the DOM.

## Acceptance criteria

| # | Result | Evidence |
|---|---|---|
| 1 | met | `npm test` 230/230. `formatRuntime`, `toPoster` duration and year (K26 grandparentYear), and `pickNowPlaying` viewOffset/playerTitle/paused handle both JSON numbers and XML strings through `toMs` (js/plex.js diff). `engine.session` is set before the "unchanged" `return null`. |
| 2 | met | as above |
| 3 | met | e2e metadata PASS. The screenshot DOM text is `PG-13 · 2 h 14 m · 1972`. |
| 4 | met | e2e now-playing PASS. Measured at 1920x1080: progress rect y=1027.3, h=3, so its bottom is at 1030.3, which equals the poster-box bottom (157.7+872.6). Width 59.2/590.6 = 10.0%. It is a child of `#stage`, with computed height 3px. |
| 5 | met | grep chain exit 0 |
| 6 | met | check-precache OK |

## Must-fixes

- **K18 (D24): met.** `sessionList` (js/engine.js) maps a `kind:'auth'` error to `[]`, and plex.js:71-72 classifies both 401 and 403 as `auth`. e2e now-playing case 9 (four variants) PASSes: rotation continues.
- **C8M1 (D28): met.** `pollPlayback` records `state.pollError`, `tick` passes it as `sessionsError`, and `sessionList` throws it again without fetching. e2e case 10 (500 and 403) PASSes, and it counts requests in the mock log. The conductor's r1 "second-sessions-request" mutants were killed.
- **C8I1 (D37): mostly met, one hole (issue 1).** One batched `client.items(keys)` call runs per online pool load while a limit is set. A key the response leaves out, or a request that fails, is stored as `contentRating:''` (K25), and the offline picker (js/poster-cache.js:108) skips such an entry under a limit. The code never reads absence from the random pool as a re-rating. e2e metadata case 8 PASSes, and the r1 mutants were killed. The exception: keys past the 100th are never asked about and never failed closed.

## Content-rating guarantee

Intact on the overlay paths. `engine.session` is set only after the limit drops `np`. `updateNowPlaying` (js/main.js) draws the bar or label only when the poster on screen is that same now-playing ratingKey and `allowedOnScreen` passes. `blockPoster` and `handleFailure` call `setNowPlaying(null)`. CSS `body.poster-blocked` now also hides `.player-label` and `.progress`. The label shows only the player name, never a title. e2e now-playing case 8 ("an above-limit title playing shows no bar") and metadata case 7 ("a blocked poster takes its metadata with it") PASS. The gap in issue 1 is in the offline cache, not the overlay.

## Strengths

- The bar uses a single `transform: scaleX` transition timed to the remaining playback, with no per-frame timer. Paused sessions freeze it, and `done >= 1` does not start a transition.
- The mock's `/__mock/log`, `/__mock/rate` and `/__mock/sessions-status` let the e2e tests count requests directly, so the C8M1 and C8I1 claims are measured rather than inferred.
- The cache index stays small: only `duration` is added, and only when it is non-zero.

## Issues

### Critical

None.

### Important

1. **C8I1 re-check covers only the 100 most recent cached titles. The rest are neither confirmed nor failed closed.** Class: **code-bug** (fails D37 as written: "fail closed for any title not confirmed").
   - Location: js/engine.js, `RECHECK_MAX = 100` and `const keys = cachedKeys().slice(0, RECHECK_MAX);`. `onRatings` receives only the sliced keys.
   - Evidence: `posterCacheLimit` accepts up to 300 (js/settings.js:73, `strictNum(10, 300, …)`). The offline picker draws from the whole index, filtered only by the stored rating (js/poster-cache.js:108). The probe used `createEngine` with 150 cached keys, a limit of `PG-13`, and an `items` stub that returns every key as `R`. Output: `cached 150 asked 100 reported 100 never re-checked 50`.
   - Why it matters: an owner with a cache limit above 100 keeps up to 200 entries with stale ratings. If one of those titles is re-rated upward on the server, it can still be drawn from the offline cache under the household limit. This is exactly the leak the must-fix was meant to close. It needs a non-default setting, so it is Important rather than Critical. It is still a child-safety gap.
   - Fix: either (a) set the cap to the schema maximum, ideally a shared constant with `posterCacheLimit`'s 300 (300 keys is about 2.4 KB of path, still one request), or (b) store every key past the cap as unrated (`onRatings` over all `cachedKeys()`, with unasked keys falling back to `contentRating:''`). Then add a unit test with more than 100 cached keys that asserts every key is either confirmed or stored as unrated.

### Minor

None blocking.

## UI screenshots

PASS. Six files at /home/user/plex-poster-app/.orchestrator/artifacts/metadata-and-now-playing--shot-{1920x1080,1080x1920}-{meta,playing,rot90}.png. The scenes are: meta (pinned item 3, showMeta), playing (mock item 3 at 600 s of 6000 s, player "Living Room", showMeta and showPlayer on), and rot90 (the same with `rotation:90, rotateUi:true`).
- Legibility: the meta line and the "Playing in Living Room" label are readable on their scrims at both sizes and when rotated.
- Frame art: in every shot the title card, the label and the bar lie inside the `#poster-box` rect. For example, at 1920x1080 the box spans x 665.4-1256.0 and the frame window starts inside the marquee art. Nothing is drawn on the bulbs or the "NOW SHOWING" header.
- Bar: 3 px along the bottom edge of the poster window at rotation 0 (measured above). At rotation 90 it rotates with the stage: it sits on the left screen edge of the window (rect w=3 at x=193.7 and 49.7), which is the poster's own bottom.

## Declined to judge

- **Overlap with the mock poster's printed year.** At 1920x1080 the meta line sits close to the year printed on the mock SVG poster. This is poster artwork in the overlay slot that 2.0.0 already used, not frame art, and real posters vary. It is outside the criteria.
- **Runtime source during playback.** While playing, the meta line shows the session's `duration` ("1 h 40 m" in the shots, because the mock was told 6,000,000 ms). This matches K26 (the playing item's own length). Real Plex sends the same value for the media, so I make no finding.
- **Re-check cadence.** The re-check runs once per pool reload (30 min TTL, or on a settings key change), not on every tick. D37 says "per online refresh", and the conductor's prompt says "per online pool load", so I accept this as ruled.
- **Stale bar under the sleep veil.** The bar's transition keeps running under the sleep veil, but it is hidden behind the black veil. Sleep behaviour is outside this diff.

## Recommendations

Fix issue 1 with option (a) or (b) and add the more-than-100-keys unit test. Nothing else needs to change. A confirmation round only needs `node --test tests/engine.test.js` and `npm run test:e2e -- metadata`.

## Assessment

Criteria 1-6 pass, K18 and C8M1 are fixed and tested, the overlay never reveals or draws a blocked title, the full e2e suite is green, and the UI is correct at both sizes and when rotated. The C8I1 must-fix is complete only up to 100 cached titles, while the schema allows 300. That leaves a real fail-open path for a child-safety decision.

**Verdict:** CHANGES REQUESTED
