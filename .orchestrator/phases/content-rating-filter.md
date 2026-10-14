# content-rating-filter

- Mode: afk        Tags: ui, risk:high        Blocked by: settings-and-schedule-core (done 33976fe), cache-first-fetch (done e764aee)
- Status: done · landed f0b3425 · confidence 100
- Commit(s): f0b3425
- Agent type: orchestrator-builder (no BMad install); model sonnet, effort high (risk:high)
- Claimed: 2026-10-09T03:30Z
- Worktree: ../wt-content-rating-filter on branch orch/content-rating-filter from e9394ec (D12). Serial with the other unblocked ui phases (all output index.html and css/app.css); chosen first: heads the longest remaining chain (→ metadata-and-now-playing → fill-blur-and-info / position-drag-nudge → docs) and carries the K5 and A8-d must-fixes.

## Pre-flight
- Pre-dispatch run (ac-runner label pre-r1): criteria 1, 3, 5 exit 1 (deliverables missing); 2 (npm test) and 4 (precache) exit 0. `closer preflight` ok.
- `git log -- js/ratings.js tests/ratings.test.js tests/e2e/content-rating.spec.mjs`: empty
- PROBE: `sed -n 15,23p scripts/mock-plex.mjs` → 8 MOVIES (titles 1–8) — meets criterion 3 (8 titles, ratings to add)
- PROBE: `grep -n "pool(" js/plex.js` → line 141, sends X-Plex-Container-Size (line 146) — meets criterion 1 (pool size rule lives here)
- PROBE: `grep -n "random(" js/poster-cache.js` → line 88 — meets criterion 1 (cache.random filter)
- Carried must-fixes (state follow-ups with deadline content-rating-filter): K5 (D21), A8-d (D28) — in the brief.
- Step 3: orchestrator-builder content-rating-filter-builder-r1, sonnet, high; brief artifacts/content-rating-filter--brief-r1.md
- Dispatched: 2026-10-09T03:27:02Z        Re-dispatches: 0        Inner revision rounds: 0

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-content-rating-filter, E2E_PORT=19430)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac1-r1.json` |
| 2 | plan criterion 2 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac2-r1.json` |
| 3 | plan criterion 3 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac3-r1.json` |
| 4 | plan criterion 4 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac4-r1.json` |
| 5 | plan criterion 5 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac5-r1.json` |
| 6 | narrated: reviewer tries every route (risk:high) | review row (Step 7): anchored + cold reviewer | pending | review-rows 6 |
- Pre-commit r1 (round--step4-generic-r2.sh, r1e config): **lint exit 1 — REAL**: tests/e2e/content-rating.spec.mjs:145:84 "'contentRating' is defined but never used". format/tests/security/scope exit 0.
- Mutations r1 (conductor, unit files): unrated-allowed 10 · random-unfiltered 5 · nowplaying-unfiltered 4 · cache-unfiltered 5 · corrupt-limit-open 1 — killed. random-unfiltered-e2e 0 — expected (the mock honours the server filter strictly, like Plex is believed to); the guarantee without the server filter is proven at unit level (random-unfiltered 5 failed).
- Builder deviations ruled: forced tick when maxContentRating/limitNowPlaying changes (replaces an on-screen poster at once) — CONDUCTOR RULING K19: accepted (it is the guarantee applied to what is already on screen). K5 offline path no longer calls engine.shown() on a failed show — accepted (correct).
- Builder residual routes: (R1) offline + limit raised while an above-limit poster is up → it stays until the next due rotation — CHILD-SAFETY ROUTE in main.js (in Output) → r2 under CONDUCTOR RULING K20. (R2) js/settings.js sanitize turns an unknown stored limit (e.g. 'PG13' from a hand-written config.json/import) into '' = no limit — fails OPEN, but js/settings.js is outside this phase's Output (convention 10) → owner question K21 at the next stop. (R3) pre-2.1 unrated cache entries are skipped offline under a limit — fail-closed, no action.
- Re-dispatch r2: recipient content-rating-filter-builder-r2 (fresh), forced by the real lint error and R1. Re-dispatches: 1
- Brief artifacts/content-rating-filter--brief-r2.md.

## Plan acceptance — Step 4 r2 (E2E_PORT=19440)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac1-r2.json` |
| 2 | plan criterion 2 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac2-r2.json` |
| 3 | plan criterion 3 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac3-r2.json` |
| 4 | plan criterion 4 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac4-r2.json` |
| 5 | plan criterion 5 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac5-r2.json` |
| 6 | narrated: reviewer tries every route (risk:high) | review row (Step 7) | pending | review-rows 6 |
- r2: lint fixed; K20 in js/main.js (allowedOnScreen / blockPoster / showPoster, body.poster-blocked in css/app.css), e2e cases 10–11. Pre-commit r2: lint/format/tests/security/scope exit 0.
- Mutations r2 (conductor): limit-change-leaves-poster — see record. Builder residual (R4): a tick already downloading when a stricter limit is saved can still draw its old-limit poster (no check between download and draw) — child-safety route in main.js → r3 (K20 extended: re-check allowedOnScreen before every draw).
- Re-dispatch r3: fresh builder. Re-dispatches: 2

## Plan acceptance — Step 4 r3 (E2E_PORT=19450)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac1-r3.json` |
| 2 | plan criterion 2 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac2-r3.json` |
| 3 | plan criterion 3 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac3-r3.json` |
| 4 | plan criterion 4 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac4-r3.json` |
| 5 | plan criterion 5 (see the plan) | evidence.py exec (plan command) | 0 | `content-rating-filter--ac5-r3.json` |
| 6 | narrated: reviewer tries every route (risk:high) | review row (Step 7): anchored + cold | pending | review-rows 6 |
- r3: showPoster() re-checks allowedOnScreen against the current settings before every draw (tick, heal re-download, offline cached path) and again after the decode (blocks if the limit tightened meanwhile); a refused draw retries in 1 s. e2e 12 (random path) and 13 (heal path) hold title 4's image in flight and save PG-13. Pre-commit r3: lint/format/tests/security/scope exit 0.
- Mutations r3 (conductor, e2e): predraw-check-removed 1 — killed. **postdecode-check-removed 0 — SURVIVES**: the window is the browser's image decode (milliseconds) after the pre-draw check; it cannot be held open from Playwright without decode-delay test hooks. Conductor call K22 (quoted override): the post-decode re-check is a narrow backstop (a stricter limit saved inside a decode); the path needs the save to land in that window, and test infrastructure to hold a decode costs more than it prevents; no further round; listed at the next stop. random-unfiltered-e2e (r1) is equivalent at e2e level (mock filters server-side) and killed at unit level.
- Step 4 re-tally `content-rating-filter--tally-step4-r3-c1.json` (--correction, quoted above). Counted under corrections.
- predispatch --kind code ok (04:24:21Z), before any reviewer. Step 7 dispatched 2026-10-09T04:24:25Z: content-rating-filter-review-anchored-r3 and -cold-r3 (opus; risk:high → full); tree a59b8b3

## Step 7 — cold r3 (artifacts/content-rating-filter--review-cold-r3.md, CHANGES REQUESTED) — triage held for the anchored r3 review
- CCI1 (Important, code-bug, reproduced): settings live preview bypasses the saved limit — read() in js/settings-ui.js takes maxContentRating from the unsaved household toggle; any Frame & layout change or an import sends it through onPreview; applySettings(..., {preview:true}) returns before blockPoster() and the forced tick. Probe: PG-13 saved, toggle unchecked unsaved → titles 6 and 8 drawn behind the dialog; after Cancel the stored limit is PG-13 but title 8 (unrated) stays on screen until the next rotation. Fix: keep maxContentRating/limitNowPlaying out of preview (or take them from saved settings), and make the preview path re-check the on-screen poster; e2e preview-then-cancel case.
- CCM1 (code-bug, test): e2e case 7 flaky under 4-way parallelism (sampleUntil reads 250 ms after the click, before a slow tick finishes) — failed once at content-rating.spec.mjs:242 in the full run.
- Held up (reviewer): allows() fail-closed on unrated/unmapped/corrupt limit; engine filters every pool item and now-playing; offline cache filters on stored rating; showPoster double check has no frame for a refused poster; saving a limit online/offline removes an over-limit poster at once; reviewer mutants all caught.

## Step 7 triage — r3 (anchored `content-rating-filter--review-r3.md` APPROVE, no findings, "Criterion 6 attacks: PASS", "UI screenshots: PASS" — every route blocked incl. Plex ignoring the filter, corrupt limit fails closed, PG-13 request list exact, K5 and A8-d proven; cold `--review-cold-r3.md` CHANGES REQUESTED)
- CCI1 (Important, code-bug): preview bypass → r4.
- CCM1 (code-bug, test): case 7 flaky under parallelism → r4.
- A3-rec (anchored recommendation, fails closed): a limit saved while a tick runs loses its forced tick (state.busy) → blank until the next scheduled tick → r4 (queue the forced tick).
- Re-dispatch r4/r5 (third re-dispatch → BRANCH, two candidates from tree a59b8b3): r4 = keep maxContentRating and limitNowPlaying OUT of the live preview (preview uses the saved values; only Save changes the limit); r5 = let the preview carry the limit but run it through the same guarded path as Save (re-check the on-screen poster and force a tick on every preview change and on Cancel). Both fix CCM1 and A3-rec. Re-dispatches: 3 (and 4 for the second candidate).

## Plan acceptance — Step 4 r4 (branch candidate: limit kept out of the preview (saved values))
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac1-r4.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac2-r4.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac3-r4.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac4-r4.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac5-r4.json` |
| 6 | narrated: reviewer routes (risk:high) | review row (Step 7) | pending | review-rows 6 |
- Pre-commit r4 (round--step4-generic-r2.sh): lint/format/tests/security/scope exit 0.

## Plan acceptance — Step 4 r5 (branch candidate: preview carries the stricter of saved/previewed limit through the guarded path; display.js hang worked around in the spec (Q25))
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac1-r5.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac2-r5.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac3-r5.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac4-r5.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac5-r5.json` |
| 6 | narrated: reviewer routes (risk:high) | review row (Step 7) | pending | review-rows 6 |
- Pre-commit r5 (round--step4-generic-r2.sh): lint/format/tests/security/scope exit 0.
- Mutations r4 (conductor, MUT_WT=-r4): preview-carries-limit 1 · forced-tick-dropped 1 — killed. Mutations r5 (conductor, MUT_WT=-r5): preview-not-guarded and forced-tick-dropped — see records.

## Branch pick — `content-rating-filter--pick-r5.json`: winner r4 (both 75/75; tie → r4). r4's js/main.js and tests/e2e/content-rating.spec.mjs staged into ../wt-content-rating-filter; tree 71b9b7e (= r4 candidate).
- Carried from the losing candidate r5: Q25 — js/display.js show(): the previous draw's cleanup timer (crossfadeMs + 200 ms) clears the src of a layer whose next decode() is still pending; the decode never settles, state.busy stays set and rotation stops until reload. Root cause of the content-rating e2e flakes under load (r4 noted single flakes of cases 4 and 10 that it did not harden). display.js is outside this phase. CONDUCTOR RULING K23: route the display.js fix to `pixel-shift` (the next phase that edits js/display.js) as a must-fix with a regression test; until then the content-rating spec may flake under load — if CI flakes, the fix moves up. Listed at the next stop.
- predispatch before reviewers (below).
- predispatch --kind code ok; Step 7 dispatched 2026-10-09T05:41:21Z: content-rating-filter-review-anchored-r4 and -cold-r4 (opus; full); tree 71b9b7e

## Step 7 — cold r4 (artifacts/content-rating-filter--review-cold-r4.md, CHANGES REQUESTED; no route shows an above-limit or unrated poster beyond a moment) — triage held for the anchored r4 review
- C4I1 (Important, test gap) = K22: the post-decode re-check (main.js:110-114) has no test; reviewer suggests holding the DECODE (chunked/very large image) or unit-testing showPoster with an injected display.
- C4M1 (code-bug): applySettings awaits display.apply (custom frame load, no timeout) before blockPoster — a Save that tightens the limit and changes the frame leaves the above-limit poster up during the frame load. Fix: check and block before the await.
- C4M2 (spec-gap): with limitNowPlaying:false an above-limit now-playing poster can be PINNED, and pins are exempt → shown for good. Product question.
- C4M3 (spec-gap) = K21 (settings.js maps an invalid limit to '').
- C4M4 (test gap, low risk): `limitNowPlaying !== false` → `=== true` survives unit tests (stored settings are always boolean).
- C4M5 (test gap): no e2e with a server that ignores the filter (unit tests catch removal of the client filter: 9 engine + 5 cache failures).
- Container restart stopped the anchored r4 reviewer before a verdict; re-dispatched 2026-10-09T06:00:01Z with the same prompt (tree 71b9b7e unchanged).

## Step 7 triage — r4 (anchored `content-rating-filter--review-r4.md` APPROVE, no findings, "Criterion 6 attacks: PASS"; every r3 fix held by a failing-without-it e2e; Q25 CONFIRMED real in Chromium — removing src before load leaves decode() pending; field likelihood low; child safety unaffected (an above-limit poster still comes down) → K23 routing stands; cold `--review-cold-r4.md` CHANGES REQUESTED)
- C4I1 (Important, test gap) → r6: test the post-decode re-check (hold the decode: e.g. route the image to a slow/chunked large response the browser decodes after the pre-draw check, or make showPoster testable with an injected display). This replaces conductor call K22 (no longer "no test").
- C4M1 (code-bug) → r6: check the limit and blockPoster() BEFORE awaiting display.apply in applySettings.
- C4M4 (test gap, cheap) → r6: a unit or e2e case where limitNowPlaying is undefined/absent behaves as on (kills `!== false` → `=== true`).
- C4M2 (spec-gap: pinning an above-limit now-playing poster with limitNowPlaying off) → owner question K24 at the next stop.
- C4M3 = K21 (owner). C4M5 (no e2e with a filter-ignoring server) — no action: the anchored reviewer ran exactly that (mock ignoring the filter, nine cases pass) and the unit tests catch removal of the client filter.
- Re-dispatch r6 (fresh builder): Re-dispatches: 5 — THE LAST under the cap.

## Plan acceptance — Step 4 r6 (E2E_PORT=19900)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac1-r6.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac2-r6.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac3-r6.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac4-r6.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac5-r6.json` |
| 6 | narrated: reviewer routes (risk:high) | review row (Step 7): anchored + cold | pending | review-rows 6 |
- r6: C4I1 e2e case 18 (decode held via an HTMLImageElement.prototype.decode wrapper) — K22 RETIRED (the post-decode re-check now has a test); C4M1 blockPoster before awaiting display.apply, e2e case 17; C4M4 unit test for absent limitNowPlaying. Pre-commit r6: lint/format/tests/security/scope exit 0.
- Mutations r6 (conductor): postdecode-check-removed 1 (the r3 survivor, now killed) · block-after-frame-load 1 · nowplaying-gate-strict 1 — killed.
- Flake measurement: the builder saw case 13 fail once in 5 runs under load; the conductor ran the spec 6 more times back to back (plus the ac3 run): all pass. ≈1 in 12 under load — attributed to Q25 (display.js decode hang, confirmed real by the anchored r4 reviewer) → K23 routes the fix to pixel-shift; CI-risk listed at the next stop.
- Step 4 re-tally `content-rating-filter--tally-step4-r6-c1.json` (--correction: tests row read the e2e-equivalent random-unfiltered-e2e-r1; quoted). Counted under corrections.
- predispatch --kind code ok; Step 7 dispatched 2026-10-09T06:43:28Z: content-rating-filter-review-anchored-r6 and -cold-r6 (opus; full); tree a9da765

## Step 7 — cold r6 (artifacts/content-rating-filter--review-cold-r6.md, CHANGES REQUESTED) — triage held for the anchored r6 review; cap reached (5/5)
- C6I1 (Important, code-bug, reproduced): an IMPORT in the Settings dialog applies an unsaved pin through the preview (the preview keeps the saved limit but not the saved staticRatingKey/staticTitle, and pins are exempt in allowedOnScreen; previews skip the on-screen re-check) → the R title is drawn as a "pin" before anything is saved, and Cancel (another preview) leaves it up until the next due rotation (up to 86400 s). Probe: PG-13, import {"staticRatingKey":"4"}, refresh, Cancel → title 4 (R) on screen. Fix: the preview also keeps the saved pin (or the exemption is computed from saved settings) and every apply, previews included, re-checks the on-screen poster; e2e import → refresh → Cancel.
- C6M1 (spec-gap) = K21 (settings.js maps an unknown limit to '').
- C6M2 (spec-gap, unverified against real Plex): episodes are checked by the EPISODE's contentRating but show (and cache under the show's key) the SHOW's poster; a lower-rated episode of a higher-rated show could pass the check online and come back from the offline cache under the lower rating.
- Held: every other route funnels through allows(); races hold; reviewer mutants all caught; 206/206 unit, 18/18 e2e.

## Step 7 — anchored r6 (artifacts/content-rating-filter--review-r6.md, CHANGES REQUESTED; "Criterion 6 attacks: PASS"; C4I1/C4M1/C4M4 confirmed by mutants; Plex-ignoring-filter mock: 18/18 pass)
- A6I1 (Important, code-bug, test): the content-rating spec failed 2 of 6 full runs, both on case 18's last wait ("title 6 did not come up … (on screen: 3)"); reviewer instrumented and CONFIRMED it is the Q25 display.js race (revoke timer hits the forced tick's layer → decode fails → cached title 3 shown, which is allowed). Not a safety leak. Fix: case 18's final wait accepts any allowed title; or move the K23 display.js fix forward (K23's "if CI flakes" trigger is met).

## Cap reached — stop 9 (5/5 re-dispatches used)
Persistent failure mode: each round closed its findings and every route through allows() holds; what keeps surfacing is the settings-dialog preview path (r3 limit bypass → r4 fixed; r6 an imported unsaved PIN) and test flakes caused by the separate display.js race (Q25).

## Stop message 9
**Stop 9 — household content filter at its retry limit (one reply)**

Progress since stop 7: `sleep-mode` is committed and pushed (e6f426b). `content-rating-filter` has used all 5 retries. Both final reviews confirm the filter holds on every route they tried — random posters, offline cache, now playing, Plex ignoring the filter, a limit saved mid-download or mid-decode, sleep — but two things remain:

1. **One child-safety bug and one flaky test.**
   - C6I1 In Settings, importing a file that pins an R-rated title shows that poster before you save (pins are exempt from the limit), and pressing Cancel leaves it on screen until the next rotation. Reproduced.
   - A6I1 One test fails about 1 run in 3 because of the separate display bug Q25 (a rare timing race where an image never finishes loading and the display freezes; confirmed real, low likelihood in normal use, routed to `pixel-shift` as K23). It is not a safety leak, but it would make CI unreliable.
   **Recommended: (a) allow one more round that fixes C6I1 (the dialog's preview keeps the saved pin and every change re-checks the screen) and makes that test accept any allowed poster — and pull the Q25 display fix forward now as its own small step before this phase lands**, so CI stays reliable. (b) The extra round only, Q25 stays with `pixel-shift`. (c) Something else.
2. **K21 A typo'd limit turns the filter off.** A hand-written `config.json` or import with `"PG13"` (not `"PG-13"`) is read as "no limit". The fix is in the settings file, which belongs to an earlier phase. **Recommended: (a) fix it in that extra round — an unknown limit becomes PG-13 (fails closed)**, extending the round to the settings file and its test. (b) Leave it.
3. **K24 Pinning above the limit.** With "apply the limit to what's playing" off, someone could pin an R title that is playing, and pins are exempt. **Recommended: (a) leave it** — pins are exempt by your D5, and `kiosk-and-pin` will put Settings and the pin control behind your PIN. (b) Refuse pinning an above-limit poster while a limit is set.
4. **C6M2 TV episodes.** An episode is checked by its own rating but shows the show's poster; if an episode is rated lower than its show, the show's poster could pass. **Recommended: (a) check what your real Plex server returns during hardware validation** (I'll add a checklist row) and fix only if it happens. (b) Use the stricter of the episode and show ratings now.
5. **Rulings I made alone** (reply "keep" or name any to change): K19 changing the limit replaces the poster on screen at once; K20 offline, it is replaced by an allowed cached poster or the empty card; K23 the display fix (Q25) goes to `pixel-shift` unless you choose 1a; K22 (retired) — I had called the after-decode re-check untestable, but round 6 added a test for it, so nothing is left to decide. **Recommended: keep.**
6. **Still open from stop 8:** P1 (my process slip on `sleep-mode` — no action needed; reply "noted"), and your four token-rotation lines.

Reply e.g. "1a, 2a, 3a, 4a, keep, noted" — or "defaults".
<!-- end stop 9 -->
- Stop 9 sent 2026-10-09T06:58:22Z verbatim from `closer show --stop 9` (stopcheck ok after adding K22 to item 5).

- Answer to stop message 9: "defaults" — chat; recorded by the conductor at 2026-10-10T12:46:56.438525Z
- Stop 9 answered "defaults" (2026-10-09T21:57:46Z, `closer answer`) → D29–D34; committed e5f03a3. display-decode-hang added as plan phase 28 (9bce60c) and runs in parallel.
- Re-dispatch r7 (fresh builder; OWNER-AUTHORISED past the cap by D29/D31; scope C6I1, A6I1, K21 — Output extended to js/settings.js and tests/settings.test.js). Re-dispatches: 6 (1 beyond the cap, by owner decision).
- Conductor defect: `content-rating-filter--review-check-r6.json` was written with a hard-coded `exit 1` instead of the real check; `content-rating-filter--review-check-r6b.json` runs the real awk check (exit 1: both r6 reviews have Important items) and is the evidence. The r6 Step 7 tally was derived from the hard-coded record; same outcome (RE-DISPATCH).

## Plan acceptance — Step 4 r7 (E2E_PORT=20300)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac1-r7.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac2-r7.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac3-r7.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac4-r7.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac5-r7.json` |
| 6 | narrated: reviewer routes (risk:high) | review row (Step 7): anchored + cold | pending | review-rows 6 |
- r7 (D29, D31): preview holds the saved pin too and the on-screen re-check runs on every apply (e2e case 19); case 18's last wait accepts any allowed title; js/settings.js unknown limit → 'PG-13' (tests/settings.test.js). Pre-commit r7 (Output extended per D31): lint/format/tests/security/scope exit 0.
- Mutations r7 (conductor): preview-applies-pin and unknown-limit-fails-open — see records. The preview branch of the every-apply re-check is unreachable by an e2e route once the preview holds both the limit and the pin (builder's finding: a preview cannot change whether the on-screen poster is allowed) — equivalent, kept as D29 asks.
- Step 4 re-tally `content-rating-filter--tally-step4-r7-c1.json` (--correction, same quoted reason as r6). Counted under corrections.
- predispatch --kind code ok; Step 7 dispatched 2026-10-10T13:00:30Z: content-rating-filter-review-anchored-r7 and -cold-r7 (opus; full); tree 7989149

## Step 7 — cold r7 (artifacts/content-rating-filter--review-cold-r7.md, CHANGES REQUESTED; guarantee holds — no non-pin route shows an above-limit/unrated poster beyond Minor 1; e2e 19/19 twice; reviewer mutants caught) — triage held for the anchored r7 review
- C7I1 (Important, code-bug, REGRESSION from r7, fails closed): import then Save drops the imported pin — the preview resets staticRatingKey/staticTitle to the saved values and read() in js/settings-ui.js starts from getSettings() with no pin field, so Save stores the old pin while the dialog shows the imported one. Repro: import {"staticRatingKey":"4","staticTitle":"Popcorn Skies"}, Save → saved staticRatingKey "". Fix: settings-ui keeps the dialog's pending pin (set by write(), cleared by unpin, used by read()); e2e import → Save.
- C7M1 (code-bug, narrow): a limit saved during a crossfade (crossfadeMs up to 10 s) leaves the OUTGOING above-limit poster visible while it fades (only display.currentPoster is checked).
- C7M2 (spec-gap): a cache hit never refreshes the stored contentRating, so a title re-rated in Plex keeps its old rating for the offline fallback.
- C7M3 (spec-gap) = C6M2 (D33, real-server check).

## Step 7 — anchored r7 (artifacts/content-rating-filter--review-r7.md, APPROVE; "Criterion 6 attacks: PASS"; C6I1, A6I1, K21/D31 resolved with failing-without-fix tests; spec 2/2 full runs; full e2e suite green)
- A7M1 (spec-gap): an explicit `"maxContentRating": null` still means no limit (null is treated as absent for every key; D31 names unknown values only). Low risk (an import shows the toggle off and needs Save; config.json only seeds the first run).

## Stop message 10
**Stop 10 — content filter: one regression from the last round, plus small items (one reply)**

Both final reviews say the child-safety guarantee holds on every route (random, offline, now playing, Plex ignoring the filter, preview/import/Cancel, mid-download, mid-decode, a frame change, sleep, a typo'd limit now fails closed). The display-freeze fix (D30) is in its review and lands first. Left over:

1. **Recommended: (a) one more small round for these, then land:**
   - C7I1 (regression from the last round) Importing a settings file that pins a poster and pressing Save drops the imported pin — the dialog shows it, the saved settings don't. It fails safe (no pin), but it is wrong.
   - C7M1 If you save a stricter limit during a crossfade (1.2 s by default, up to 10 s), the poster fading out can be above the new limit and stays visible while it fades.
   - C7M2 A cached poster keeps the rating it had when it was cached; if a title is re-rated in Plex, the offline fallback uses the old rating until the artwork changes. Refresh the stored rating whenever the poster is seen online.
   (b) Land as is and hand these to later phases. (c) Something else.
2. **A7M1 An explicit `null` limit.** A hand-written file with `"maxContentRating": null` means "no limit" (missing means no limit too). **Recommended: (a) leave it** — only an explicit typo now fails closed, and a null is the same as leaving the setting out. (b) Treat null as PG-13.
3. **Token rotation** is still open — reply with the four lines whenever you've done it.

Reply e.g. "1a, 2a" — or "defaults".
<!-- end stop 10 -->
- Stop 10 sent 2026-10-10T13:15:47Z verbatim from `closer show --stop 10` (stopcheck ok).

- Answer to stop message 10: "I agree" — chat; recorded by the conductor at 2026-10-10T13:53:46.558823Z
- Stop 10 answered "I agree" (2026-10-10T13:53:31Z, `closer answer`) → D35, D36; committed. Conductor rebased ../wt-content-rating-filter onto af55616 (display-decode-hang landed): temporary local WIP commit → rebase → soft reset; the staged r7 changes are unchanged (17 files), the base now includes the Q25 fix.
- Re-dispatch r8 (fresh builder; OWNER-AUTHORISED by D35; scope C7I1, C7M1, C7M2). Brief artifacts/content-rating-filter--brief-r8.md. Re-dispatches: 7 (2 beyond the cap, by owner decision).

## Plan acceptance — Step 4 r8 (base af55616; E2E_PORT=21000)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac1-r8.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac2-r8.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac3-r8.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac4-r8.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `content-rating-filter--ac5-r8.json` |
| 6 | narrated: reviewer routes (risk:high) | review row (Step 7): anchored + cold | pending | review-rows 6 |
- r8 (D35): settings-ui pending pin (e2e 20); cutOutgoing() + .poster-layer.cut (e2e 21); poster-cache refreshRating() from tick (unit + e2e 22). Pre-commit r8: lint/format/tests/security/scope exit 0.
- Mutations r8 (conductor): import-pin-dropped 1 · outgoing-not-cut 1 · rating-not-refreshed 1 — killed.
- Builder-reported limit (for the reviewers): a title re-rated UPWARD in Plex leaves the server-filtered pool, so refreshRating never sees it and its cached copy keeps the old lower rating for the offline fallback until evicted.
- Step 4 re-tally `content-rating-filter--tally-step4-r8-c1.json` (--correction, same quoted reason). Counted under corrections.
- predispatch --kind code ok; Step 7 dispatched 2026-10-10T14:08:29Z: content-rating-filter-review-anchored-r8 and -cold-r8 (opus; full); tree a1a3b84

## Step 7 — cold r8 (artifacts/content-rating-filter--review-cold-r8.md, CHANGES REQUESTED) — triage held for the anchored r8 review
- C8I1 (Important, code-bug, probe-confirmed): a cached title re-rated UPWARD keeps its stale lower rating and is shown OFFLINE — refreshRating only runs for the chosen poster, and under a limit an above-limit title is never chosen nor returned by the filtered pool. Probe: cache 8 titles, stored rating of 4 forced to PG (really R), save PG-13, 30 online refreshes, mock down → offline shown 1,2,3,4,6. Real-world trigger: Plex re-rates a cached title upward (rare). Proportionate fail-closed fix (conductor): while a limit is set, the offline fallback only uses entries whose rating was confirmed online since the limit was set (or since the last limit change); refresh ratings from every pool/session item seen.
- C8M1 (spec-gap, copy): with limitNowPlaying off an above-limit now-playing poster is shown, but the help text (index.html:39) says posters above the limit are never shown and names only the pin as an exception → fix the wording.
- C8M2 (spec-gap) = an unrated episode fails closed (D33 area; safe direction).

## Step 7 — anchored r8 (artifacts/content-rating-filter--review-r8.md, APPROVE; "Criterion 6 attacks: PASS"; C7I1, C7M1, C7M2 resolved and tested; spec 22/22 over 2 full runs; full e2e 7/7; filter-ignoring mock 22/22)
- A8M1 (spec-gap) = C8I1: upward re-rate is reachable but narrow (title cached while lower-rated, then re-rated, then an offline fallback while still cached; window open until eviction after 100 newer downloads). Smallest fix: on each online pool load under a limit, one batched GET /library/metadata/<cached keys> (≤100) → refreshRating for each returned item, '' (fail closed) for any key not returned; the comma-key syntax needs real-server verification. Do NOT treat absence from the random pool as re-rated.

## Stop message 11
**Stop 11 — content filter approved by the child-safety review; one narrow edge left (one reply)**

The anchored review APPROVES: every route holds (Plex ignoring the filter included), the last round's three fixes are in and tested, and the tests passed twice in a row. The cold review found one narrow route, which the anchored review confirms is real but rare:

1. **C8I1 A title Plex re-rates upward.** If a poster was cached while rated, say, PG and Plex later re-rates it R, the app — which no longer asks Plex for R titles — never learns the new rating, and the old cached copy can be shown when Plex is offline. The fix is one extra request to Plex per refresh that re-checks the cached titles' ratings (and hides any it can't confirm), but the request format needs checking against your real server.
   **Recommended: (a) land the content filter now and make this fix a must-do for `metadata-and-now-playing`** (which already edits that code), with a row in the real-server checklist to confirm the request format. (b) One more content-filter round for it now. (c) Something else.
2. **C8M1 Help text.** The Settings help says posters above the limit are "never shown", but if you untick "Apply the limit to what's playing right now", a playing title above the limit is shown. **Recommended: (a) correct the wording in `settings-sheet`**, which reworks the Settings text. (b) Fix it now in the same round as 1b.
3. **Token rotation** is still open — reply with the four lines whenever you've done it.

Reply e.g. "1a, 2a" — or "defaults".
<!-- end stop 11 -->
- Stop 11 sent 2026-10-10T14:24:11Z verbatim from `closer show --stop 11` (stopcheck ok).

- Answer to stop message 11: "Defaults" — chat; recorded by the conductor at 2026-10-10T16:00:25.982135Z
- Stop 11 answered "Defaults" (2026-10-10T15:59:50Z, `closer answer`) → D37 (land; C8I1 → metadata-and-now-playing + real-server row), D38 (C8M1 help text → settings-sheet); committed e71ae1d.

## Step 7 triage — r8 (anchored APPROVE, no Critical/Important; cold CHANGES REQUESTED on C8I1 only)
- C8I1 and A8M1: routed by the owner (D37) — must-fix for metadata-and-now-playing, request format confirmed in real-server-validation-extended. C8M1: routed (D38) to settings-sheet. C8M2: D33 (safe direction). No open finding in this phase: Step 7 closes.
- Carried must-fixes fulfilled here: K5 (e2e case 8) and A8-d (e2e case 9), both confirmed by reviewer mutants — dropped from the follow-up index with that reason.
- Step 7 re-tally `content-rating-filter--tally-step7-r8-c1.json` (--correction: review-check fails only on C8I1, routed by D37; quoted). Counted under corrections.

## Pre-commit — lint/format/tests/security/scope exit 0 (round--step4-generic-r2.sh, -r8)

## Seam check (merged: + display-decode-hang, content-rating-filter)
- `round--seam-w3-r6.json` exit 0 (npm test, full npm run test:e2e incl. display-decode and content-rating, check-precache: 26 files)

## Step 8 tally (`content-rating-filter--tally-step8-r8-c1.json`; correction quoted — review-check fails only on C8I1 routed by D37; e2e-equivalent mutant)
| Category | Score |
|---|---|
| acceptance criteria pass fresh _critical_ | 35/35 |
| diff scope matches phase | 15/15 |
| CLAUDE.md conventions | 15/15 |
| tests where implied | 10/10 |
| decision log respected | 10/10 |
| code reads cleanly | 10/10 |
| commit message accurate | 5/5 |
| **Total** | **100/100** (100%) |
**Band:** COMPLETE
**Caps applied:** none

- Landed: f0b3425 — "Add a household content-rating limit that never shows above-limit posters" (worktree rebased onto af55616 before r8; cherry-picked onto e71ae1d cleanly)
- Read-back ok; attribution (commit form, r8) ok

## Reviews
- r1–r8 anchored + cold (see each Step 7 section). Branch pick r4/r5 → r4. Re-dispatches: 8 (5 under the cap + 3 owner-authorised: D29, D35; r7 per D29/D31).

## Notes / reconciliation
- Unknowns: Plex's real contentRating strings and filter syntax (real-server-validation-extended). Routed must-fixes: C8I1 → metadata-and-now-playing (+ real-server row), C8M1 → settings-sheet. Fulfilled here: K5, A8-d. Invalidated: none.

## Index items carried (verbatim from .orchestrator/state.md; added 2026-10-14 by conductor-2 for closer index-check)
these rulings and deferrals were recorded in this phase's stop messages and in docs/decisions.md in other words; closer index-check requires the index text itself in a phase file, so it is copied here unchanged.
- K24 — content-rating-filter cold r4 Minor 2: with 'apply the limit to what's playing' off, an above-limit now-playing poster can be pinned, and pins are exempt, so it stays shown; refuse that pin? list at the next stop
- K22 — content-rating-filter: the post-decode re-check (limit tightened during an image decode) has no test — the window is milliseconds and cannot be held open from Playwright; kept as a backstop, no further round; list at the next stop
- K21 — content-rating-filter R2: js/settings.js turns an unknown stored maxContentRating (e.g. 'PG13' in a hand-written config.json) into '' (no limit) — fails open; fix belongs to settings.js (outside this phase); owner question at the next stop
- K20 — content-rating-filter: when the limit changes and the poster on screen is not allowed, it is replaced at once even offline — by an allowed cached poster, or by the empty card with the poster hidden if none qualifies; list at the next stop
- K19 — content-rating-filter: changing the household limit (or limitNowPlaying) forces an immediate rotation so an on-screen poster above the new limit is replaced at once; list at the next stop
