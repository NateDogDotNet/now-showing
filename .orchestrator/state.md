# Orchestration State

run 1 · plan docs/integration-plan.md @ 0f1f82e · kernel dotclaude@b4a6fb5 · conductor-1 · started 2026-10-08T22:05Z · goal: owners of always-on Plex poster displays can set one up without a keyboard and leave it running for years without burn-in, needless hardware wear, exposed credentials or unsuitable posters · invocation: phases/_invocation.md · resumed locally 2026-10-13 at 160aca2 (handoff) by conductor-2 on /home/nathan/plex-poster-app; kernel still b4a6fb5 (no cc_utils change since; ~/.claude HEAD 2f1d434e); round--* helper scripts repointed /home/user → /home/nathan (worktrees /home/nathan/wt-<phase>), not phase-hashed · conductor commits 3603ed8 (D46-D48, msg artifacts/conductor--commit-message-d46-d48.txt), a08eeab (plan: release-bump Output + criterion 7, msg artifacts/conductor--commit-message-plan-d48.txt) · rotate-plex-token done 2026-10-14 (debe086) · rotate-plex-token done 2026-10-14 (debe086) · both real-server validations done 2026-10-14 (5c664af, 128b62e; agent-run on HOME, D50) · rename-now-showing done (7192007) · release-bump done 2026-10-14 (1450d71, version 2.1.0; M4 closes) · limit-and-reload-fixes done (090d231) · next action: owner — stop 16 in phases/purge-git-history.md (the purge approval; precondition review first)

| Phase | Status | Mode | Blocked by | Claim | Confidence | Re-dispatches | Tags | Note |
|---|---|---|---|---|---|---|---|---|
| e2e-harness | ✅ done | afk | — | — | 100% | 1 | architecture | d409ad7; Playwright harness + recursive precache check; 1 re-dispatch |
| settings-and-schedule-core | ✅ done | afk | e2e-harness | — | 100% | 1 | — | 33976fe; settings keys + schedule helpers; 1 re-dispatch |
| rotate-plex-token | ✅ done | hitl | — | — | 100% | 0 | — | debe086 receipt; 401 confirmed 2026-10-14 (run at owner's request); method other |
| serve-config-guard | ✅ done | afk | — | — | 100% | 2 | risk:high | 0914090; allowlist + loopback-only config.json; 2 re-dispatches (test strength) |
| rotation-layout-and-shell | ✅ done | afk | e2e-harness, settings-and-schedule-core | — | 100% | 1 | ui | landed cc16968 |
| cache-first-fetch | ✅ done | afk | e2e-harness, settings-and-schedule-core | — | 100% | 2 | — | landed e764aee |
| status-indicator | ✅ done | afk | rotation-layout-and-shell, settings-and-schedule-core | — | 100% | 2 | ui | landed 80d1759; r2+r3 anchored APPROVE; gate ok |
| validation-checklists | ✅ done | afk | — | — | 100% | 2 | docs | 7b49e94; core + extended real-server checklists; 2 re-dispatches |
| real-server-validation | ✅ done | hitl | validation-checklists, cache-first-fetch, serve-config-guard, rotation-layout-and-shell, status-indicator, rotate-plex-token | — | 100% | 0 | — | 5c664af all 17 PASS (C17 at h15, owner's call); suite green at 7192007; gate ok |
| pixel-shift | ✅ done | afk | rotation-layout-and-shell, settings-and-schedule-core | — | 100% | 0 | ui | landed 1b31344; r1 anchored APPROVE; gate ok |
| frame-brightness | ✅ done | afk | settings-and-schedule-core | — | 100% | 1 | ui | landed 9263977; r2 anchored APPROVE; gate ok |
| sleep-mode | ✅ done | afk | settings-and-schedule-core | — | 100% | 6 | ui, risk:high | landed e6f426b |
| content-rating-filter | ✅ done | afk | settings-and-schedule-core, cache-first-fetch | — | 100% | 7 | ui, risk:high | landed f0b3425 |
| kiosk-and-pin | ✅ done | afk | rotation-layout-and-shell, settings-and-schedule-core | — | 100% | 4 | ui, risk:high | landed f7be8a9; r6 anchored + cold APPROVE; gate ok |
| device-helper-server | ✅ done | afk | serve-config-guard | — | 100% | 6 | risk:high | landed 16300a9 |
| device-helper-integration | ✅ done | afk | device-helper-server, sleep-mode | — | 100% | 3 | ui | landed e1b7f07; r4 anchored delta APPROVE; gate ok |
| pi-stability | ✅ done | afk | sleep-mode, settings-and-schedule-core | — | 100% | 2 | ui | landed 1df3be1; r3 anchored + cold APPROVE; K16, C8M3, DHM2 fulfilled; gate ok |
| recommended-protection-preset | ✅ done | afk | sleep-mode, frame-brightness, pixel-shift, pi-stability, content-rating-filter, kiosk-and-pin, device-helper-integration | — | 100% | 0 | ui | landed 9bc93ed; r1 anchored APPROVE (M2 phase-gate PASS); gate ok |
| settings-sheet | ✅ done | afk | rotation-layout-and-shell, settings-and-schedule-core | — | 100% | 4 | ui | landed 51f8aa9; r6 anchored + cold APPROVE; C8M2, C8M1, K30, K31 fulfilled; gate ok |
| touch-and-labels | ✅ done | afk | kiosk-and-pin, sleep-mode | — | 100% | 2 | ui | landed 0bf5655; r3 anchored delta APPROVE; routed items fulfilled; gate ok |
| metadata-and-now-playing | ✅ done | afk | content-rating-filter, settings-and-schedule-core | — | 100% | 2 | ui | landed 51d8ff3 |
| position-drag-nudge | 🚧 blocked | afk | rotation-layout-and-shell, settings-and-schedule-core, settings-sheet, touch-and-labels, metadata-and-now-playing | — | 0% | 0 | ui | deferred to 2.2 (D41, owner agreed 2026-10-11); not in the 2.1 release |
| fill-blur-and-info | 🚧 blocked | afk | metadata-and-now-playing, rotation-layout-and-shell, pi-stability | — | 0% | 0 | ui | deferred to 2.2 (D41, owner agreed 2026-10-11); not in the 2.1 release |
| real-server-validation-extended | ✅ done | hitl | validation-checklists, real-server-validation, content-rating-filter, settings-sheet, metadata-and-now-playing, device-helper-integration, pi-stability | — | 100% | 0 | — | 128b62e; 15 PASS, 12 SKIPPED (no Pi), Overall PASS; D33/D37 checks pass; gate-2 ok |
| docs | ✅ done | afk | recommended-protection-preset, touch-and-labels | — | 100% | 2 | docs | landed 78b9f67; r3 anchored delta APPROVE (A-); gate ok |
| release-bump | ✅ done | afk | docs, rotate-plex-token, real-server-validation, real-server-validation-extended, rename-now-showing | — | 100% | 1 | — | 1450d71 (2.1.0); Step 8 90/90; gate-4 ok; phase-gate PASS; code-review findings routed by D73 |
| purge-git-history | 🚧 blocked | hitl | rotate-plex-token, release-bump, limit-and-reload-fixes | conductor-2 | 0% | 0 | irreversible | stop 16 saved: waiting on the owner's approval (D46, D49, D76, D77) |
| display-decode-hang | ✅ done | afk | rotation-layout-and-shell | — | 100% | 1 | — | landed af55616 |
| rename-now-showing | ✅ done | afk | docs | — | 100% | 1 | ui, docs | landed 7192007; Step 8 90/90; review r1 APPROVE (Minor fixed r2) |
| limit-and-reload-fixes | ✅ done | afk | release-bump | — | 100% | 1 | risk:high | 090d231; Step 8 90/90; both r2 lenses APPROVE; gate ok |

**Progress:** 27/30 phases done
**Frontier:** (none)

## Unknowns

<!-- surfaced but not yet sharp enough to be a phase; graduate or drop -->

- native <select> popups and title tooltips may render unrotated on a rotated UI (headless screenshots cannot show them) — check on hardware during real-server-validation-extended

## Out of scope

<!-- ruled past the destination; recorded, closed, never graduates -->

(none)

## Follow-ups

<!-- deferred work with an owner; asked at the next stop -->

- FOLLOW-UP (owner: conductor): purge rehearsal r1 — at the purge, save .git/filter-repo/commit-map as an artifact beside docs/security/history-purge.md so the trail's 59 rewritten SHAs can be mapped (deadline: purge-git-history)

## Follow-ups answered

- FOLLOW-UP ANSWERED (owner: Nathan, "Approve" at 2026-10-08T22:56:10Z): conductor-alone rulings on serve-config-guard (symlink escape and dotfile 404 under D9; cross-site 127.0.0.1 response dismissed) to list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Approve" at 2026-10-08T22:56:10Z): conductor ruling on e2e-harness (per-spec timeout and signal cleanup added to the harness) to list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Approve" at 2026-10-08T22:56:10Z): confirm that the r1 doc-review Criticals on validation-checklists (C07, C03, citing D11) are resolved by r2, so Step 7 can be scored
- FOLLOW-UP ANSWERED (owner: Nathan, "Approve" at 2026-10-08T22:56:10Z): e2e-harness Important 1: "A hung spec hangs the whole run forever" — ruled in by the conductor (per-spec timeout, process-group cleanup); list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Approve" at 2026-10-08T22:56:10Z): e2e-harness r2 Minor 1: "A non-numeric `E2E_SPEC_TIMEOUT` turns into an immediate timeout for every spec." ships as is; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Approve" at 2026-10-08T22:56:10Z): e2e-harness r2 Minor 2: "The comment on the sweep is inaccurate about Chromium" ships as is; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Approve" at 2026-10-08T22:56:10Z): conductor rulings Q-dhs1 (helper auto-detect order, cec-ctl on = --image-view-on) and Q-dhs2 (helper status codes) to list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Approve" at 2026-10-08T22:56:10Z): device-helper-server rulings Q-dhs1 "auto-detect order cec-ctl" and Q-dhs2 "413 oversized body" — list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Approve" at 2026-10-08T22:56:10Z): X1 serve-config-guard: "a cross-site request to 127.0.0.1 gets the token with status 200" and cold M2/M3 ship as is — list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T01:20:15Z): K3 ruling — new numeric settings: junk/blank → default, out-of-range → clamp, counts rounded; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T01:20:15Z): K4 ruling — a cached poster that fails to decode is dropped and fetched once from the network; list at the next stop
- FOLLOW-UP ANSWERED (owner: conductor, "Defaults" at 2026-10-09T01:20:15Z): K5 — cache-first-fetch r2 review: offline fallback cache.random() can return a corrupt cached poster; route to content-rating-filter (edits that function); list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T01:20:15Z): K6 — cache-first-fetch r2 review: a server that always returns undecodable images costs one download per tick (no blacklist); product question; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T01:20:15Z): K7 — sleep-mode criterion 3 reads "__wakeLock.held === true"; the harness stub counts (held is a number), so the conductor reads it as held === 1 with releases unchanged; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T01:20:15Z): K8 — device-helper-server cold r4 Minor 3: the helper now kills a command's whole process group after every command (success too), so a background child cannot outlive the lock; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T01:20:15Z): K9 — sleep-mode Q-sm1..3 rulings: playback always restarts the idle clock (wakeOnPlayback:false only keeps the scheduled veil); Pause stops playback-wake polling; open Settings/Diagnostics dialogs show above the veil; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T01:20:26Z): K2 ruling — helper status.temperature names the source ('thermal_zone0' | 'vcgencmd' | null); list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T02:40:18Z): K10 — device-helper-server Q24: a helper value option given without a value refuses to start only when --helper is given; without --helper the helper is off and the option is inert; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T02:40:18Z): K11 — sleep-mode: a failed playback poll leaves the last known playing state unchanged and does not refresh lastPlaybackAt; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T02:40:18Z): K12 — sleep-mode: any pointer/key activity during a manual wake, dialogs included, restarts the 60 s; events aimed at an open dialog are never swallowed; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T02:40:18Z): K13 — sleep-mode: page load and every settings save restart the idle-sleep clock; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T02:40:18Z): K14 — sleep-mode: while asleep the playback poll retries no slower than nowPlayingPollSeconds (ignores the 5 min backoff); list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T02:40:18Z): K15 — sleep-mode anchored r2 Minor 4: waking is a hard black-to-full-brightness cut; product question (add a short fade?); list at the next stop
- FOLLOW-UP ANSWERED (owner: conductor, "Defaults" at 2026-10-09T02:40:19Z): K16 — sleep-mode anchored r2: the existing service-worker update timer (js/main.js:517) throws under a fake clock at simulated +6 h; pre-existing; route to pi-stability (daily reload / SW timers); list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T02:40:19Z): K17 — device-helper-server anchored r7: serve.mjs options never accept the --name=value form, so --helper-power=cec-ctl silently auto-detects; pre-existing; support '=' or refuse it? list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-09T02:40:19Z): K11 amended — sleep-mode: a failed playback poll keeps the last playing state for at most 3 consecutive failed polls (about 1 min), then counts as not playing, so a Plex outage after a movie cannot hold the screen awake all night; list at the next stop
- FOLLOW-UP ANSWERED (owner: conductor, "Defaults" at 2026-10-09T02:40:19Z): K18 — sleep-mode anchored r6 (declined): with showNowPlaying on, a 401/403 on /status/sessions still leaves no poster via engine.decide()'s own now-playing fetch (pre-existing, same before sleep-mode); route to metadata-and-now-playing (edits that path); list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-10T12:47:30Z): K24 — content-rating-filter cold r4 Minor 2: with 'apply the limit to what's playing' off, an above-limit now-playing poster can be pinned, and pins are exempt, so it stays shown; refuse that pin? list at the next stop
- FOLLOW-UP ANSWERED (owner: conductor, "defaults" at 2026-10-10T12:47:30Z): K23/Q25 — pixel-shift must fix js/display.js show(): the previous draw's cleanup timer clears the src of a layer whose next decode() is pending, the decode never settles, state.busy sticks and rotation stops until reload; add a regression test; also harden content-rating e2e cases 4 and 10 sampling (wait for the poster to change)
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-10T12:47:30Z): K22 — content-rating-filter: the post-decode re-check (limit tightened during an image decode) has no test — the window is milliseconds and cannot be held open from Playwright; kept as a backstop, no further round; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-10T12:47:30Z): K21 — content-rating-filter R2: js/settings.js turns an unknown stored maxContentRating (e.g. 'PG13' in a hand-written config.json) into '' (no limit) — fails open; fix belongs to settings.js (outside this phase); owner question at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-10T12:47:30Z): K20 — content-rating-filter: when the limit changes and the poster on screen is not allowed, it is replaced at once even offline — by an allowed cached poster, or by the empty card with the poster hidden if none qualifies; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-10T12:47:30Z): K19 — content-rating-filter: changing the household limit (or limitNowPlaying) forces an immediate rotation so an on-screen poster above the new limit is replaced at once; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-10T12:47:30Z): P1 — process defect: sleep-mode reviews ran without a prior closer predispatch record and metric rows lapsed after 2026-10-08T23:38Z; closed with a recorded gate exception (substance held: COMPLETE Step 4 tallies preceded every review); list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-11T02:28:48.049Z): K35 — kiosk-and-pin Q-kp4: a PIN is 4-8 digits entered twice, applies on Save; every token reveal/export, import and reset asks each time; kiosk reveal lasts 15 s; config.json fetch times out after 2.5 s; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-11T02:28:48.049Z): K34 — kiosk-and-pin Q-kp3: the 5th consecutive wrong PIN locks 60 s, each further one doubles it up to 15 min; attempts while locked are refused and not counted; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-11T02:28:48.049Z): K33 — kiosk-and-pin Q-kp2: while config.json serves {resetPin:true} every load clears the PIN and lockout; Settings is not opened automatically but opens without a PIN when asked; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-11T02:28:48.049Z): K32 — kiosk-and-pin Q-kp1: the every-load config.json fetch logs a console 404 (403 on LAN) when there is no config.json; smoke.spec.mjs joins kiosk-and-pin's Output and ignores only that error; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-11T02:28:48.049Z): K29 — status-indicator SIM3: the 1 s status tick keeps running while controls are hidden (it skips the pill and only updates the dot), so the dot can appear if the app goes offline while idle; R-STAT-1's 'runs only while the pill is visible' is read as 'never touches #status while hidden'; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-11T02:28:48.049Z): K28 — metadata-and-now-playing r3: no test pins that toggling the progress bar/label does not make the bar jump back (the code is correct; cosmetic); no further round; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-11T02:28:48.049Z): K27 — metadata-and-now-playing cold r2 Minor 4: cached ratings are re-checked on each online pool reload (at most every 30 min, not while now-playing or a pin is up); a title re-rated inside that window keeps its old rating offline until the next reload; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-11T02:28:48.049Z): K26 — metadata-and-now-playing Q-mnp2: an episode's overlay year is its show's year (grandparentYear) when Plex sends it, else blank; the progress bar uses the episode's own duration; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "defaults" at 2026-10-11T02:28:48.049Z): K25 — metadata-and-now-playing Q-mnp1: if the batched rating re-check request fails, every cached title it asked about is treated as unrated (hidden offline under a limit — fails closed) and rotation carries on; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K52 — settings-sheet Q-ss6: while an approved sign-in token waits for the PIN prompt, the empty card's code flow stays stopped so a newer code cannot replace it; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K51 — settings-sheet Q-ss5: after the first 5-minute rest, each further unused first-run code is followed by another 5-minute rest (the 3-code count does not restart until the flow restarts); list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K50 — settings-sheet SSC5 (proposed default): an unconfigured display checks plex.tv for the code's approval every 5 s while the code is fresh; after 3 codes expire unapproved it waits 5 min before asking for the next; no checking while asleep (was every 2 s forever, ~1,800 requests an hour); list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K49 — settings-sheet: tests/e2e/brightness.spec.mjs and tests/e2e/helper.spec.mjs join the phase's Output for test-only fixes to a Playwright 1.56 fake-clock race (Date.now() can step backwards on a running fake clock) that caused intermittent full-suite failures; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K48 — settings-sheet: tests/e2e/lib.mjs joins the phase's Output so the harness stubs plex.tv by default; no e2e spec may reach the real plex.tv; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K47 — settings-sheet Q-ss4 (deviation from R-SET-1 wording): on a configured display the collapsed manual token/server fold stays reachable without pressing Change (sign-in and the server picker wait behind Change); the token reveal is PIN-gated; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K46 — settings-sheet Q-ss3: the empty card's code flow pauses while Settings is open and restarts with a fresh code when Settings closes unconfigured; 'Sign in again' uses the sheet's own code; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K45 — settings-sheet Q-ss2: a refresh the viewer asked for (button or R) that fails while a poster is on screen shows a toast with the fix buttons; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K44 — settings-sheet Q-ss1: after the plex.tv code is approved on the empty card, Settings opens pre-filled and the owner presses Save; nothing is saved automatically; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K43 — pi-stability PSA2: a daily reload skipped at its time (server down, no service worker, clock unset) is not retried that day, as R-PROT-3 says; the 12 h wake trigger catches up at the next real wake; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K42 — pi-stability Q-ps4: the more opaque --panel (.98) applies to every panel, and Diagnostics reads 'Service worker: controlling|none'; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K41 — pi-stability Q-ps3: the daily reload also waits for the crossfade, the TV wake and any open dialog, not only state.busy; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K40 — pi-stability Q-ps2: with no plexPoster.lastReload recorded, the page's own load time counts as the last reload; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K39 — pi-stability Q-ps1 (changed by the conductor): a manual wake (key press or tap while asleep) does not trigger the 12 h wake reload, which would drop the 60 s manual wake and let the schedule put the screen straight back to sleep; only a wake that ends sleep (schedule end, playback) may; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K38 — pi-stability's Output gains tests/e2e/helper.spec.mjs so it can add the two device-helper wake cases (manual wake, schedule-end wake) routed from device-helper-integration DHM2; test-only; list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Defaults" at 2026-10-11T16:31:46.186Z): K37 — device-helper-integration Q-dhi1: with deviceHelper off the page makes no /__helper/ request at all (not even the boot probe); with it on and no helper served, Chromium logs one 404 line for the probe, which the e2e ignores (only that 404); list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "Always auto accept "defaults" for me when you normally want to stop and ask me a question." at 2026-10-11T21:22:44Z): K61 — docs no longer waits on the hands-on real-server validation: README/Roadmap are written now with every unproven command or flag tagged (verify), and release-bump updates the tags from the validation results; list at the next stop (D44 default)
- FOLLOW-UP ANSWERED (owner: Nathan, "Always auto accept "defaults" for me when you normally want to stop and ask me a question." at 2026-10-11T21:22:44Z): K60 — recommended-protection-preset: the 'What's new in 2.1' marker is written on the first boot without it even when the display is not yet configured, so a fresh install never shows the toast later; only an upgraded, configured 2.0 install sees it once; list at the next stop (D44 default)
- FOLLOW-UP ANSWERED (owner: Nathan, "Always auto accept "defaults" for me when you normally want to stop and ask me a question." at 2026-10-11T21:22:44Z): K58 — touch-and-labels TLI1: the first-tap-only-wakes rule also covers the empty-state screen's backdrop (not its card buttons), so on an unconfigured display a first tap on a hidden control only reveals the bar; list at the next stop (D44: default applied)
- FOLLOW-UP ANSWERED (owner: Nathan, "Always auto accept "defaults" for me when you normally want to stop and ask me a question." at 2026-10-11T21:22:44Z): K57 — touch-and-labels Q-tl2 (changed by the conductor): Diagnostics gets the 'Keyboard shortcuts' button R-CTRL-3 names (the only way to open the list on a touch-only kiosk), hidden with disableShortcuts
- FOLLOW-UP ANSWERED (owner: Nathan, "Always auto accept "defaults" for me when you normally want to stop and ask me a question." at 2026-10-11T21:22:44Z): K56 — touch-and-labels Q-tl3: the seven control buttons drop their native title tooltips so desktop shows one tooltip, generated from the shortcut table; Pin's 'Unpin <title>' text moves to its aria-label
- FOLLOW-UP ANSWERED (owner: Nathan, "Always auto accept "defaults" for me when you normally want to stop and ask me a question." at 2026-10-11T21:22:44Z): K55 — touch-and-labels Q-tl1: in kiosk mode the long-press menu is also allowed on the Settings sheet's own box, not only its text fields (an existing kiosk test asserts it); still prevented on the PIN keypad, Diagnostics and the stage
- FOLLOW-UP ANSWERED (owner: Nathan, "Always auto accept "defaults" for me when you normally want to stop and ask me a question." at 2026-10-11T21:22:44Z): K54 — touch-and-labels' Output gains js/engine.js and tests/engine.test.js (the empty-library hint names 'unwatched only' only when it is on) and tests/e2e/first-run.spec.mjs (settings-sheet's routed test-only fixes S6C1/S6C2); list at the next stop
- FOLLOW-UP ANSWERED (owner: Nathan, "b" at 2026-10-13T16:51:55Z): purge rehearsal r1 — after the force-push, pull request #1 (refs/pull/1/head → 13af5b0) still reaches the token commit on GitHub, and plan criterion 1 cannot see it; decide before the purge: ask GitHub Support to remove PR #1's refs, or delete and re-create the repository, and whether criterion 1 should also check the PR refs
- FOLLOW-UP ANSWERED (owner: conductor, "V1-E26 PASS (conductor-run on Castle Anthrax, 2026-10-14T21:20:35Z): 40 shows, 2,783 episodes, 0 rated lower than their show; nothing to fix" at 2026-10-14T21:21:41Z): D33 — real-server-validation-extended: check whether Plex rates TV episodes lower than their show (an episode's poster is the show's); add the row to docs/validation/real-server-extended.md and fix only if it happens
- FOLLOW-UP ANSWERED (owner: conductor, "V1-E27 PASS (conductor-run on Castle Anthrax, 2026-10-14T21:20:38Z): GET /library/metadata with 100 comma-joined keys → HTTP 200, 100 items" at 2026-10-14T21:21:41Z): C8I1 (D37) — real-server-validation-extended: confirm Plex accepts the batched GET /library/metadata/<k1>,<k2>,... request the upward re-rate fix uses; add the row to docs/validation/real-server-extended.md
- FOLLOW-UP ANSWERED (owner: release-bump, "landed in 1450d71 (release-bump r1/r2): README (verify) tags updated from the validation results, V1-E03/E24/E25/E27 untagged, Pi rows and V1-E04 kept; docs criteria 1-6 re-run, exit 0 (scratchpad/docs-criteria.sh)" at 2026-10-14T22:10:46Z): K61 — after real-server-validation and -extended pass, update README.md's (verify)/unverified tags from their results (a flag or command proven on the real server or Pi loses its tag; a failed one is corrected or removed), then re-run the docs criteria
- FOLLOW-UP ANSWERED (owner: release-bump, "landed in 1450d71: the daily-reload sentence names every dialog (Settings, Diagnostics, the PIN pad, the shortcuts list) and says a key, touch or click wake does not trigger the 12-hour reload; '(K60)' dropped from the Roadmap's 2.1.x line" at 2026-10-14T22:10:46Z): docs r3 wording (with the K61 tag update): README 'Daily reload' — the reload waits while ANY dialog is open (PIN, shortcuts, Settings, Diagnostics), and a key, touch or mouse click wake does not trigger the 12-hour reload; also drop the internal id '(K60)' from Roadmap.md's 2.1.x polish line

<!-- cc_utils:state
{
  "phases": [
    {
      "name": "e2e-harness",
      "status": "done",
      "confidence": 100,
      "redispatch": 1,
      "note": "d409ad7; Playwright harness + recursive precache check; 1 re-dispatch",
      "blocked_by": [],
      "tags": [
        "architecture"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "settings-and-schedule-core",
      "status": "done",
      "confidence": 100,
      "redispatch": 1,
      "note": "33976fe; settings keys + schedule helpers; 1 re-dispatch",
      "blocked_by": [
        "e2e-harness"
      ],
      "tags": [],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "rotate-plex-token",
      "status": "done",
      "confidence": 100,
      "redispatch": 0,
      "note": "debe086 receipt; 401 confirmed 2026-10-14 (run at owner's request); method other",
      "blocked_by": [],
      "tags": [],
      "mode": "hitl",
      "claim": ""
    },
    {
      "name": "serve-config-guard",
      "status": "done",
      "confidence": 100,
      "redispatch": 2,
      "note": "0914090; allowlist + loopback-only config.json; 2 re-dispatches (test strength)",
      "blocked_by": [],
      "tags": [
        "risk:high"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "rotation-layout-and-shell",
      "status": "done",
      "confidence": 100,
      "redispatch": 1,
      "note": "landed cc16968",
      "blocked_by": [
        "e2e-harness",
        "settings-and-schedule-core"
      ],
      "tags": [
        "ui"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "cache-first-fetch",
      "status": "done",
      "confidence": 100,
      "redispatch": 2,
      "note": "landed e764aee",
      "blocked_by": [
        "e2e-harness",
        "settings-and-schedule-core"
      ],
      "tags": [],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "status-indicator",
      "status": "done",
      "confidence": 100,
      "redispatch": 2,
      "note": "landed 80d1759; r2+r3 anchored APPROVE; gate ok",
      "blocked_by": [
        "rotation-layout-and-shell",
        "settings-and-schedule-core"
      ],
      "tags": [
        "ui"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "validation-checklists",
      "status": "done",
      "confidence": 100,
      "redispatch": 2,
      "note": "7b49e94; core + extended real-server checklists; 2 re-dispatches",
      "blocked_by": [],
      "tags": [
        "docs"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "real-server-validation",
      "status": "done",
      "confidence": 100,
      "redispatch": 0,
      "note": "5c664af all 17 PASS (C17 at h15, owner's call); suite green at 7192007; gate ok",
      "blocked_by": [
        "validation-checklists",
        "cache-first-fetch",
        "serve-config-guard",
        "rotation-layout-and-shell",
        "status-indicator",
        "rotate-plex-token"
      ],
      "tags": [],
      "mode": "hitl",
      "claim": ""
    },
    {
      "name": "pixel-shift",
      "status": "done",
      "confidence": 100,
      "redispatch": 0,
      "note": "landed 1b31344; r1 anchored APPROVE; gate ok",
      "blocked_by": [
        "rotation-layout-and-shell",
        "settings-and-schedule-core"
      ],
      "tags": [
        "ui"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "frame-brightness",
      "status": "done",
      "confidence": 100,
      "redispatch": 1,
      "note": "landed 9263977; r2 anchored APPROVE; gate ok",
      "blocked_by": [
        "settings-and-schedule-core"
      ],
      "tags": [
        "ui"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "sleep-mode",
      "status": "done",
      "confidence": 100,
      "redispatch": 6,
      "note": "landed e6f426b",
      "blocked_by": [
        "settings-and-schedule-core"
      ],
      "tags": [
        "ui",
        "risk:high"
      ],
      "mode": "afk",
      "claim": "",
      "done_overrides": [
        {
          "failures": [
            "sleep-mode--gate-3.json is refused and no EXCEPTION: line quotes its failures"
          ],
          "reason": "closer predispatch was not run before the reviews (conductor omission); written afterwards ok; COMPLETE Step 4 tallies r2/r6/r8 preceded every review round (file times in the phase file); all other gate checks pass; P1 at the next stop"
        }
      ]
    },
    {
      "name": "content-rating-filter",
      "status": "done",
      "confidence": 100,
      "redispatch": 7,
      "note": "landed f0b3425",
      "blocked_by": [
        "settings-and-schedule-core",
        "cache-first-fetch"
      ],
      "tags": [
        "ui",
        "risk:high"
      ],
      "mode": "afk",
      "claim": "",
      "dispatch_overrides": [
        {
          "round": 4,
          "reason": "branch candidate r5 dispatched alongside r4 from parent r3 (tally-step7-r3 on disk)"
        }
      ]
    },
    {
      "name": "kiosk-and-pin",
      "status": "done",
      "confidence": 100,
      "redispatch": 4,
      "note": "landed f7be8a9; r6 anchored + cold APPROVE; gate ok",
      "blocked_by": [
        "rotation-layout-and-shell",
        "settings-and-schedule-core"
      ],
      "tags": [
        "ui",
        "risk:high"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "device-helper-server",
      "status": "done",
      "confidence": 100,
      "redispatch": 6,
      "note": "landed 16300a9",
      "blocked_by": [
        "serve-config-guard"
      ],
      "tags": [
        "risk:high"
      ],
      "mode": "afk",
      "claim": "",
      "dispatch_overrides": [
        {
          "round": 4,
          "reason": "branched candidate r5 shares the forcing tally device-helper-server--tally-step4-r3.json with its sibling r4"
        }
      ]
    },
    {
      "name": "device-helper-integration",
      "status": "done",
      "confidence": 100,
      "redispatch": 3,
      "note": "landed e1b7f07; r4 anchored delta APPROVE; gate ok",
      "blocked_by": [
        "device-helper-server",
        "sleep-mode"
      ],
      "tags": [
        "ui"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "pi-stability",
      "status": "done",
      "confidence": 100,
      "redispatch": 2,
      "note": "landed 1df3be1; r3 anchored + cold APPROVE; K16, C8M3, DHM2 fulfilled; gate ok",
      "blocked_by": [
        "sleep-mode",
        "settings-and-schedule-core"
      ],
      "tags": [
        "ui"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "recommended-protection-preset",
      "status": "done",
      "confidence": 100,
      "redispatch": 0,
      "note": "landed 9bc93ed; r1 anchored APPROVE (M2 phase-gate PASS); gate ok",
      "blocked_by": [
        "sleep-mode",
        "frame-brightness",
        "pixel-shift",
        "pi-stability",
        "content-rating-filter",
        "kiosk-and-pin",
        "device-helper-integration"
      ],
      "tags": [
        "ui"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "settings-sheet",
      "status": "done",
      "confidence": 100,
      "redispatch": 4,
      "note": "landed 51f8aa9; r6 anchored + cold APPROVE; C8M2, C8M1, K30, K31 fulfilled; gate ok",
      "blocked_by": [
        "rotation-layout-and-shell",
        "settings-and-schedule-core"
      ],
      "tags": [
        "ui"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "touch-and-labels",
      "status": "done",
      "confidence": 100,
      "redispatch": 2,
      "note": "landed 0bf5655; r3 anchored delta APPROVE; routed items fulfilled; gate ok",
      "blocked_by": [
        "kiosk-and-pin",
        "sleep-mode"
      ],
      "tags": [
        "ui"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "metadata-and-now-playing",
      "status": "done",
      "confidence": 100,
      "redispatch": 2,
      "note": "landed 51d8ff3",
      "blocked_by": [
        "content-rating-filter",
        "settings-and-schedule-core"
      ],
      "tags": [
        "ui"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "position-drag-nudge",
      "status": "blocked",
      "confidence": 0,
      "redispatch": 0,
      "note": "deferred to 2.2 (D41, owner agreed 2026-10-11); not in the 2.1 release",
      "blocked_by": [
        "rotation-layout-and-shell",
        "settings-and-schedule-core",
        "settings-sheet",
        "touch-and-labels",
        "metadata-and-now-playing"
      ],
      "tags": [
        "ui"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "fill-blur-and-info",
      "status": "blocked",
      "confidence": 0,
      "redispatch": 0,
      "note": "deferred to 2.2 (D41, owner agreed 2026-10-11); not in the 2.1 release",
      "blocked_by": [
        "metadata-and-now-playing",
        "rotation-layout-and-shell",
        "pi-stability"
      ],
      "tags": [
        "ui"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "real-server-validation-extended",
      "status": "done",
      "confidence": 100,
      "redispatch": 0,
      "note": "128b62e; 15 PASS, 12 SKIPPED (no Pi), Overall PASS; D33/D37 checks pass; gate-2 ok",
      "blocked_by": [
        "validation-checklists",
        "real-server-validation",
        "content-rating-filter",
        "settings-sheet",
        "metadata-and-now-playing",
        "device-helper-integration",
        "pi-stability"
      ],
      "tags": [],
      "mode": "hitl",
      "claim": ""
    },
    {
      "name": "docs",
      "status": "done",
      "confidence": 100,
      "redispatch": 2,
      "note": "landed 78b9f67; r3 anchored delta APPROVE (A-); gate ok",
      "blocked_by": [
        "recommended-protection-preset",
        "touch-and-labels"
      ],
      "tags": [
        "docs"
      ],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "release-bump",
      "status": "done",
      "confidence": 100,
      "redispatch": 1,
      "note": "1450d71 (2.1.0); Step 8 90/90; gate-4 ok; phase-gate PASS; code-review findings routed by D73",
      "blocked_by": [
        "docs",
        "rotate-plex-token",
        "real-server-validation",
        "real-server-validation-extended",
        "rename-now-showing"
      ],
      "tags": [],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "purge-git-history",
      "status": "blocked",
      "confidence": 0,
      "redispatch": 0,
      "note": "stop 16 saved: waiting on the owner's approval (D46, D49, D76, D77)",
      "blocked_by": [
        "rotate-plex-token",
        "release-bump",
        "limit-and-reload-fixes"
      ],
      "tags": [
        "irreversible"
      ],
      "mode": "hitl",
      "claim": "conductor-2"
    },
    {
      "name": "display-decode-hang",
      "status": "done",
      "confidence": 100,
      "redispatch": 1,
      "note": "landed af55616",
      "blocked_by": [
        "rotation-layout-and-shell"
      ],
      "tags": [],
      "mode": "afk",
      "claim": ""
    },
    {
      "name": "rename-now-showing",
      "status": "done",
      "confidence": 100,
      "redispatch": 1,
      "note": "landed 7192007; Step 8 90/90; review r1 APPROVE (Minor fixed r2)",
      "blocked_by": [
        "docs"
      ],
      "tags": [
        "ui",
        "docs"
      ],
      "mode": "afk",
      "claim": "",
      "dispatch_overrides": [
        {
          "round": 1,
          "reason": "r1 criteria all exit 0; r2 is a one-line Minor from the anchored review, no band needed"
        }
      ],
      "done_overrides": [
        {
          "failures": [
            "rename-now-showing--gate-2.json is refused and no EXCEPTION: line quotes its failures"
          ],
          "reason": "reviewer dispatched before the Step 4 tally and predispatch (rule 2); recorded as EXCEPTION in phases/rename-now-showing.md; all criteria exit 0, tally 90/90"
        }
      ]
    },
    {
      "name": "limit-and-reload-fixes",
      "status": "done",
      "confidence": 100,
      "redispatch": 1,
      "note": "090d231; Step 8 90/90; both r2 lenses APPROVE; gate ok",
      "blocked_by": [
        "release-bump"
      ],
      "tags": [
        "risk:high"
      ],
      "mode": "afk",
      "claim": ""
    }
  ],
  "unknowns": [
    {
      "text": "native <select> popups and title tooltips may render unrotated on a rotated UI (headless screenshots cannot show them) \u2014 check on hardware during real-server-validation-extended"
    }
  ],
  "out_of_scope": [],
  "follow_ups": [
    {
      "text": "purge rehearsal r1 \u2014 at the purge, save .git/filter-repo/commit-map as an artifact beside docs/security/history-purge.md so the trail's 59 rewritten SHAs can be mapped",
      "owner": "conductor",
      "deadline": "purge-git-history"
    }
  ],
  "follow_ups_answered": [
    {
      "text": "conductor-alone rulings on serve-config-guard (symlink escape and dotfile 404 under D9; cross-site 127.0.0.1 response dismissed) to list at the next stop",
      "owner": "Nathan",
      "quote": "Approve",
      "at": "2026-10-08T22:56:10Z",
      "time_source": "reply"
    },
    {
      "text": "conductor ruling on e2e-harness (per-spec timeout and signal cleanup added to the harness) to list at the next stop",
      "owner": "Nathan",
      "quote": "Approve",
      "at": "2026-10-08T22:56:10Z",
      "time_source": "reply"
    },
    {
      "text": "confirm that the r1 doc-review Criticals on validation-checklists (C07, C03, citing D11) are resolved by r2, so Step 7 can be scored",
      "owner": "Nathan",
      "quote": "Approve",
      "at": "2026-10-08T22:56:10Z",
      "time_source": "reply"
    },
    {
      "text": "e2e-harness Important 1: \"A hung spec hangs the whole run forever\" \u2014 ruled in by the conductor (per-spec timeout, process-group cleanup); list at the next stop",
      "owner": "Nathan",
      "quote": "Approve",
      "at": "2026-10-08T22:56:10Z",
      "time_source": "reply"
    },
    {
      "text": "e2e-harness r2 Minor 1: \"A non-numeric `E2E_SPEC_TIMEOUT` turns into an immediate timeout for every spec.\" ships as is; list at the next stop",
      "owner": "Nathan",
      "quote": "Approve",
      "at": "2026-10-08T22:56:10Z",
      "time_source": "reply"
    },
    {
      "text": "e2e-harness r2 Minor 2: \"The comment on the sweep is inaccurate about Chromium\" ships as is; list at the next stop",
      "owner": "Nathan",
      "quote": "Approve",
      "at": "2026-10-08T22:56:10Z",
      "time_source": "reply"
    },
    {
      "text": "conductor rulings Q-dhs1 (helper auto-detect order, cec-ctl on = --image-view-on) and Q-dhs2 (helper status codes) to list at the next stop",
      "owner": "Nathan",
      "quote": "Approve",
      "at": "2026-10-08T22:56:10Z",
      "time_source": "reply"
    },
    {
      "text": "device-helper-server rulings Q-dhs1 \"auto-detect order cec-ctl\" and Q-dhs2 \"413 oversized body\" \u2014 list at the next stop",
      "owner": "Nathan",
      "quote": "Approve",
      "at": "2026-10-08T22:56:10Z",
      "time_source": "reply"
    },
    {
      "text": "X1 serve-config-guard: \"a cross-site request to 127.0.0.1 gets the token with status 200\" and cold M2/M3 ship as is \u2014 list at the next stop",
      "owner": "Nathan",
      "quote": "Approve",
      "at": "2026-10-08T22:56:10Z",
      "time_source": "reply"
    },
    {
      "text": "K3 ruling \u2014 new numeric settings: junk/blank \u2192 default, out-of-range \u2192 clamp, counts rounded; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T01:20:15Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K4 ruling \u2014 a cached poster that fails to decode is dropped and fetched once from the network; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T01:20:15Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K5 \u2014 cache-first-fetch r2 review: offline fallback cache.random() can return a corrupt cached poster; route to content-rating-filter (edits that function); list at the next stop",
      "owner": "conductor",
      "quote": "Defaults",
      "at": "2026-10-09T01:20:15Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K6 \u2014 cache-first-fetch r2 review: a server that always returns undecodable images costs one download per tick (no blacklist); product question; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T01:20:15Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K7 \u2014 sleep-mode criterion 3 reads \"__wakeLock.held === true\"; the harness stub counts (held is a number), so the conductor reads it as held === 1 with releases unchanged; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T01:20:15Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K8 \u2014 device-helper-server cold r4 Minor 3: the helper now kills a command's whole process group after every command (success too), so a background child cannot outlive the lock; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T01:20:15Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K9 \u2014 sleep-mode Q-sm1..3 rulings: playback always restarts the idle clock (wakeOnPlayback:false only keeps the scheduled veil); Pause stops playback-wake polling; open Settings/Diagnostics dialogs show above the veil; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T01:20:15Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K2 ruling \u2014 helper status.temperature names the source ('thermal_zone0' | 'vcgencmd' | null); list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T01:20:26Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K10 \u2014 device-helper-server Q24: a helper value option given without a value refuses to start only when --helper is given; without --helper the helper is off and the option is inert; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T02:40:18Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K11 \u2014 sleep-mode: a failed playback poll leaves the last known playing state unchanged and does not refresh lastPlaybackAt; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T02:40:18Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K12 \u2014 sleep-mode: any pointer/key activity during a manual wake, dialogs included, restarts the 60 s; events aimed at an open dialog are never swallowed; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T02:40:18Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K13 \u2014 sleep-mode: page load and every settings save restart the idle-sleep clock; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T02:40:18Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K14 \u2014 sleep-mode: while asleep the playback poll retries no slower than nowPlayingPollSeconds (ignores the 5 min backoff); list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T02:40:18Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K15 \u2014 sleep-mode anchored r2 Minor 4: waking is a hard black-to-full-brightness cut; product question (add a short fade?); list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T02:40:18Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K16 \u2014 sleep-mode anchored r2: the existing service-worker update timer (js/main.js:517) throws under a fake clock at simulated +6 h; pre-existing; route to pi-stability (daily reload / SW timers); list at the next stop",
      "owner": "conductor",
      "quote": "Defaults",
      "at": "2026-10-09T02:40:19Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K17 \u2014 device-helper-server anchored r7: serve.mjs options never accept the --name=value form, so --helper-power=cec-ctl silently auto-detects; pre-existing; support '=' or refuse it? list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T02:40:19Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K11 amended \u2014 sleep-mode: a failed playback poll keeps the last playing state for at most 3 consecutive failed polls (about 1 min), then counts as not playing, so a Plex outage after a movie cannot hold the screen awake all night; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-09T02:40:19Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K18 \u2014 sleep-mode anchored r6 (declined): with showNowPlaying on, a 401/403 on /status/sessions still leaves no poster via engine.decide()'s own now-playing fetch (pre-existing, same before sleep-mode); route to metadata-and-now-playing (edits that path); list at the next stop",
      "owner": "conductor",
      "quote": "Defaults",
      "at": "2026-10-09T02:40:19Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K24 \u2014 content-rating-filter cold r4 Minor 2: with 'apply the limit to what's playing' off, an above-limit now-playing poster can be pinned, and pins are exempt, so it stays shown; refuse that pin? list at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-10T12:47:30Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K23/Q25 \u2014 pixel-shift must fix js/display.js show(): the previous draw's cleanup timer clears the src of a layer whose next decode() is pending, the decode never settles, state.busy sticks and rotation stops until reload; add a regression test; also harden content-rating e2e cases 4 and 10 sampling (wait for the poster to change)",
      "owner": "conductor",
      "deadline": "pixel-shift",
      "quote": "defaults",
      "at": "2026-10-10T12:47:30Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K22 \u2014 content-rating-filter: the post-decode re-check (limit tightened during an image decode) has no test \u2014 the window is milliseconds and cannot be held open from Playwright; kept as a backstop, no further round; list at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-10T12:47:30Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K21 \u2014 content-rating-filter R2: js/settings.js turns an unknown stored maxContentRating (e.g. 'PG13' in a hand-written config.json) into '' (no limit) \u2014 fails open; fix belongs to settings.js (outside this phase); owner question at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-10T12:47:30Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K20 \u2014 content-rating-filter: when the limit changes and the poster on screen is not allowed, it is replaced at once even offline \u2014 by an allowed cached poster, or by the empty card with the poster hidden if none qualifies; list at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-10T12:47:30Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K19 \u2014 content-rating-filter: changing the household limit (or limitNowPlaying) forces an immediate rotation so an on-screen poster above the new limit is replaced at once; list at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-10T12:47:30Z",
      "time_source": "conductor clock"
    },
    {
      "text": "P1 \u2014 process defect: sleep-mode reviews ran without a prior closer predispatch record and metric rows lapsed after 2026-10-08T23:38Z; closed with a recorded gate exception (substance held: COMPLETE Step 4 tallies preceded every review); list at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-10T12:47:30Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K35 \u2014 kiosk-and-pin Q-kp4: a PIN is 4-8 digits entered twice, applies on Save; every token reveal/export, import and reset asks each time; kiosk reveal lasts 15 s; config.json fetch times out after 2.5 s; list at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-11T02:28:48.049Z",
      "time_source": "reply"
    },
    {
      "text": "K34 \u2014 kiosk-and-pin Q-kp3: the 5th consecutive wrong PIN locks 60 s, each further one doubles it up to 15 min; attempts while locked are refused and not counted; list at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-11T02:28:48.049Z",
      "time_source": "reply"
    },
    {
      "text": "K33 \u2014 kiosk-and-pin Q-kp2: while config.json serves {resetPin:true} every load clears the PIN and lockout; Settings is not opened automatically but opens without a PIN when asked; list at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-11T02:28:48.049Z",
      "time_source": "reply"
    },
    {
      "text": "K32 \u2014 kiosk-and-pin Q-kp1: the every-load config.json fetch logs a console 404 (403 on LAN) when there is no config.json; smoke.spec.mjs joins kiosk-and-pin's Output and ignores only that error; list at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-11T02:28:48.049Z",
      "time_source": "reply"
    },
    {
      "text": "K29 \u2014 status-indicator SIM3: the 1 s status tick keeps running while controls are hidden (it skips the pill and only updates the dot), so the dot can appear if the app goes offline while idle; R-STAT-1's 'runs only while the pill is visible' is read as 'never touches #status while hidden'; list at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-11T02:28:48.049Z",
      "time_source": "reply"
    },
    {
      "text": "K28 \u2014 metadata-and-now-playing r3: no test pins that toggling the progress bar/label does not make the bar jump back (the code is correct; cosmetic); no further round; list at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-11T02:28:48.049Z",
      "time_source": "reply"
    },
    {
      "text": "K27 \u2014 metadata-and-now-playing cold r2 Minor 4: cached ratings are re-checked on each online pool reload (at most every 30 min, not while now-playing or a pin is up); a title re-rated inside that window keeps its old rating offline until the next reload; list at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-11T02:28:48.049Z",
      "time_source": "reply"
    },
    {
      "text": "K26 \u2014 metadata-and-now-playing Q-mnp2: an episode's overlay year is its show's year (grandparentYear) when Plex sends it, else blank; the progress bar uses the episode's own duration; list at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-11T02:28:48.049Z",
      "time_source": "reply"
    },
    {
      "text": "K25 \u2014 metadata-and-now-playing Q-mnp1: if the batched rating re-check request fails, every cached title it asked about is treated as unrated (hidden offline under a limit \u2014 fails closed) and rotation carries on; list at the next stop",
      "owner": "Nathan",
      "quote": "defaults",
      "at": "2026-10-11T02:28:48.049Z",
      "time_source": "reply"
    },
    {
      "text": "K52 \u2014 settings-sheet Q-ss6: while an approved sign-in token waits for the PIN prompt, the empty card's code flow stays stopped so a newer code cannot replace it; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K51 \u2014 settings-sheet Q-ss5: after the first 5-minute rest, each further unused first-run code is followed by another 5-minute rest (the 3-code count does not restart until the flow restarts); list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K50 \u2014 settings-sheet SSC5 (proposed default): an unconfigured display checks plex.tv for the code's approval every 5 s while the code is fresh; after 3 codes expire unapproved it waits 5 min before asking for the next; no checking while asleep (was every 2 s forever, ~1,800 requests an hour); list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K49 \u2014 settings-sheet: tests/e2e/brightness.spec.mjs and tests/e2e/helper.spec.mjs join the phase's Output for test-only fixes to a Playwright 1.56 fake-clock race (Date.now() can step backwards on a running fake clock) that caused intermittent full-suite failures; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K48 \u2014 settings-sheet: tests/e2e/lib.mjs joins the phase's Output so the harness stubs plex.tv by default; no e2e spec may reach the real plex.tv; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K47 \u2014 settings-sheet Q-ss4 (deviation from R-SET-1 wording): on a configured display the collapsed manual token/server fold stays reachable without pressing Change (sign-in and the server picker wait behind Change); the token reveal is PIN-gated; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K46 \u2014 settings-sheet Q-ss3: the empty card's code flow pauses while Settings is open and restarts with a fresh code when Settings closes unconfigured; 'Sign in again' uses the sheet's own code; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K45 \u2014 settings-sheet Q-ss2: a refresh the viewer asked for (button or R) that fails while a poster is on screen shows a toast with the fix buttons; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K44 \u2014 settings-sheet Q-ss1: after the plex.tv code is approved on the empty card, Settings opens pre-filled and the owner presses Save; nothing is saved automatically; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K43 \u2014 pi-stability PSA2: a daily reload skipped at its time (server down, no service worker, clock unset) is not retried that day, as R-PROT-3 says; the 12 h wake trigger catches up at the next real wake; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K42 \u2014 pi-stability Q-ps4: the more opaque --panel (.98) applies to every panel, and Diagnostics reads 'Service worker: controlling|none'; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K41 \u2014 pi-stability Q-ps3: the daily reload also waits for the crossfade, the TV wake and any open dialog, not only state.busy; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K40 \u2014 pi-stability Q-ps2: with no plexPoster.lastReload recorded, the page's own load time counts as the last reload; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K39 \u2014 pi-stability Q-ps1 (changed by the conductor): a manual wake (key press or tap while asleep) does not trigger the 12 h wake reload, which would drop the 60 s manual wake and let the schedule put the screen straight back to sleep; only a wake that ends sleep (schedule end, playback) may; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K38 \u2014 pi-stability's Output gains tests/e2e/helper.spec.mjs so it can add the two device-helper wake cases (manual wake, schedule-end wake) routed from device-helper-integration DHM2; test-only; list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K37 \u2014 device-helper-integration Q-dhi1: with deviceHelper off the page makes no /__helper/ request at all (not even the boot probe); with it on and no helper served, Chromium logs one 404 line for the probe, which the e2e ignores (only that 404); list at the next stop",
      "owner": "Nathan",
      "quote": "Defaults",
      "at": "2026-10-11T16:31:46.186Z",
      "time_source": "reply"
    },
    {
      "text": "K61 \u2014 docs no longer waits on the hands-on real-server validation: README/Roadmap are written now with every unproven command or flag tagged (verify), and release-bump updates the tags from the validation results; list at the next stop (D44 default)",
      "owner": "Nathan",
      "quote": "Always auto accept \"defaults\" for me when you normally want to stop and ask me a question.",
      "at": "2026-10-11T21:22:44Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K60 \u2014 recommended-protection-preset: the 'What's new in 2.1' marker is written on the first boot without it even when the display is not yet configured, so a fresh install never shows the toast later; only an upgraded, configured 2.0 install sees it once; list at the next stop (D44 default)",
      "owner": "Nathan",
      "quote": "Always auto accept \"defaults\" for me when you normally want to stop and ask me a question.",
      "at": "2026-10-11T21:22:44Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K58 \u2014 touch-and-labels TLI1: the first-tap-only-wakes rule also covers the empty-state screen's backdrop (not its card buttons), so on an unconfigured display a first tap on a hidden control only reveals the bar; list at the next stop (D44: default applied)",
      "owner": "Nathan",
      "quote": "Always auto accept \"defaults\" for me when you normally want to stop and ask me a question.",
      "at": "2026-10-11T21:22:44Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K57 \u2014 touch-and-labels Q-tl2 (changed by the conductor): Diagnostics gets the 'Keyboard shortcuts' button R-CTRL-3 names (the only way to open the list on a touch-only kiosk), hidden with disableShortcuts",
      "owner": "Nathan",
      "quote": "Always auto accept \"defaults\" for me when you normally want to stop and ask me a question.",
      "at": "2026-10-11T21:22:44Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K56 \u2014 touch-and-labels Q-tl3: the seven control buttons drop their native title tooltips so desktop shows one tooltip, generated from the shortcut table; Pin's 'Unpin <title>' text moves to its aria-label",
      "owner": "Nathan",
      "quote": "Always auto accept \"defaults\" for me when you normally want to stop and ask me a question.",
      "at": "2026-10-11T21:22:44Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K55 \u2014 touch-and-labels Q-tl1: in kiosk mode the long-press menu is also allowed on the Settings sheet's own box, not only its text fields (an existing kiosk test asserts it); still prevented on the PIN keypad, Diagnostics and the stage",
      "owner": "Nathan",
      "quote": "Always auto accept \"defaults\" for me when you normally want to stop and ask me a question.",
      "at": "2026-10-11T21:22:44Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K54 \u2014 touch-and-labels' Output gains js/engine.js and tests/engine.test.js (the empty-library hint names 'unwatched only' only when it is on) and tests/e2e/first-run.spec.mjs (settings-sheet's routed test-only fixes S6C1/S6C2); list at the next stop",
      "owner": "Nathan",
      "quote": "Always auto accept \"defaults\" for me when you normally want to stop and ask me a question.",
      "at": "2026-10-11T21:22:44Z",
      "time_source": "conductor clock"
    },
    {
      "text": "purge rehearsal r1 \u2014 after the force-push, pull request #1 (refs/pull/1/head \u2192 13af5b0) still reaches the token commit on GitHub, and plan criterion 1 cannot see it; decide before the purge: ask GitHub Support to remove PR #1's refs, or delete and re-create the repository, and whether criterion 1 should also check the PR refs",
      "owner": "Nathan",
      "deadline": "purge-git-history",
      "quote": "b",
      "at": "2026-10-13T16:51:55Z",
      "time_source": "reply"
    },
    {
      "text": "D33 \u2014 real-server-validation-extended: check whether Plex rates TV episodes lower than their show (an episode's poster is the show's); add the row to docs/validation/real-server-extended.md and fix only if it happens",
      "owner": "conductor",
      "deadline": "real-server-validation-extended",
      "quote": "V1-E26 PASS (conductor-run on Castle Anthrax, 2026-10-14T21:20:35Z): 40 shows, 2,783 episodes, 0 rated lower than their show; nothing to fix",
      "at": "2026-10-14T21:21:41Z",
      "time_source": "conductor clock"
    },
    {
      "text": "C8I1 (D37) \u2014 real-server-validation-extended: confirm Plex accepts the batched GET /library/metadata/<k1>,<k2>,... request the upward re-rate fix uses; add the row to docs/validation/real-server-extended.md",
      "owner": "conductor",
      "deadline": "real-server-validation-extended",
      "quote": "V1-E27 PASS (conductor-run on Castle Anthrax, 2026-10-14T21:20:38Z): GET /library/metadata with 100 comma-joined keys \u2192 HTTP 200, 100 items",
      "at": "2026-10-14T21:21:41Z",
      "time_source": "conductor clock"
    },
    {
      "text": "K61 \u2014 after real-server-validation and -extended pass, update README.md's (verify)/unverified tags from their results (a flag or command proven on the real server or Pi loses its tag; a failed one is corrected or removed), then re-run the docs criteria",
      "owner": "release-bump",
      "deadline": "release-bump",
      "quote": "landed in 1450d71 (release-bump r1/r2): README (verify) tags updated from the validation results, V1-E03/E24/E25/E27 untagged, Pi rows and V1-E04 kept; docs criteria 1-6 re-run, exit 0 (scratchpad/docs-criteria.sh)",
      "at": "2026-10-14T22:10:46Z",
      "time_source": "conductor clock"
    },
    {
      "text": "docs r3 wording (with the K61 tag update): README 'Daily reload' \u2014 the reload waits while ANY dialog is open (PIN, shortcuts, Settings, Diagnostics), and a key, touch or mouse click wake does not trigger the 12-hour reload; also drop the internal id '(K60)' from Roadmap.md's 2.1.x polish line",
      "owner": "release-bump",
      "deadline": "release-bump",
      "quote": "landed in 1450d71: the daily-reload sentence names every dialog (Settings, Diagnostics, the PIN pad, the shortcuts list) and says a key, touch or click wake does not trigger the 12-hour reload; '(K60)' dropped from the Roadmap's 2.1.x line",
      "at": "2026-10-14T22:10:46Z",
      "time_source": "conductor clock"
    }
  ],
  "header": "run 1 \u00b7 plan docs/integration-plan.md @ 0f1f82e \u00b7 kernel dotclaude@b4a6fb5 \u00b7 conductor-1 \u00b7 started 2026-10-08T22:05Z \u00b7 goal: owners of always-on Plex poster displays can set one up without a keyboard and leave it running for years without burn-in, needless hardware wear, exposed credentials or unsuitable posters \u00b7 invocation: phases/_invocation.md \u00b7 resumed locally 2026-10-13 at 160aca2 (handoff) by conductor-2 on /home/nathan/plex-poster-app; kernel still b4a6fb5 (no cc_utils change since; ~/.claude HEAD 2f1d434e); round--* helper scripts repointed /home/user \u2192 /home/nathan (worktrees /home/nathan/wt-<phase>), not phase-hashed \u00b7 conductor commits 3603ed8 (D46-D48, msg artifacts/conductor--commit-message-d46-d48.txt), a08eeab (plan: release-bump Output + criterion 7, msg artifacts/conductor--commit-message-plan-d48.txt) \u00b7 rotate-plex-token done 2026-10-14 (debe086) \u00b7 rotate-plex-token done 2026-10-14 (debe086) \u00b7 both real-server validations done 2026-10-14 (5c664af, 128b62e; agent-run on HOME, D50) \u00b7 rename-now-showing done (7192007) \u00b7 release-bump done 2026-10-14 (1450d71, version 2.1.0; M4 closes) \u00b7 limit-and-reload-fixes done (090d231) \u00b7 next action: owner \u2014 stop 16 in phases/purge-git-history.md (the purge approval; precondition review first)"
}
-->
