produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: docs · round: r2 · mode: anchored
**Verdict:** CHANGES REQUESTED

Reviewer: docs-review-anchored-r2 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T20:56:21Z · Method: anchored doc review · Scope: phase docs, round r2, base HEAD bbb2e47 of /home/user/wt-docs, tree 3b1f39a (staged index)

Criterion 8: FAIL (doc-review band B+; one wrong statement about kiosk token behaviour, see Important 1. With that line fixed the band is A- and criterion 8 would pass.)

## What I read and ran

- Read: `### 25. docs` in /home/user/plex-poster-app/docs/integration-plan.md (lines 566-590); spec.md R-TOPO-1, R-PROT-3, R-PROT-5, R-KIOSK-1/2, R-DOC-1..9, Non-goals table (lines 289-311), the unverified list (line 391); decisions.md D40/D43 (K33-K53); both builder handbacks; the staged README.md and Roadmap.md in full, plus `git diff --cached`.
- Code checked in /home/user/wt-docs (read-only, no worktree, no edits): js/main.js (daily reload 389-504, wake caller 588, fixes 660-690, PIN gate 842-870, Diagnostics 920-945, wake lock 1195-1214, first run 1266-1347, boot 1388-1442), js/settings-ui.js (PROTECTION_PRESET 16-25, token toggle 140-143 and 467-474, open 543-556), js/settings.js schema, js/kiosk.js constants, js/ratings.js, js/engine.js, js/brightness.js, js/poster-cache.js, js/display.js, js/schedule.js, css/app.css (.status-dot), scripts/serve.mjs, scripts/net.mjs, scripts/device-helper.mjs, tests/e2e/run.mjs and lib.mjs, package.json, index.html (labels and fieldsets), docs/validation/real-server-extended.md (row ids).
- Ran criteria 1-7 from /home/user/wt-docs against the staged tree (worktree == index, `git diff --quiet -- README.md Roadmap.md` exit 0): all seven pass (c1 no `missing:`, c2=0, c3=0, c4 no `undocumented:`, c5=0, c6=0, c7=0). `git diff --cached --check` exit 0. Extra: a node script resolving every `](#anchor)` in README against GitHub-style heading slugs printed `anchors bad: []`. A loop over 32 UI labels the README quotes found each in index.html or js/*.js. Owner-requested Roadmap headings from b5f6882 (12) all still present; the only `-` lines in the Roadmap diff are the two shipped ideas, the old Remote control one-liner (extended) and the main.js line count.
- `npm test` / e2e not run: docs-only change, no code in the diff.

## Strengths

- Recommended protection list matches `PROTECTION_PRESET` exactly (settings-ui.js:16-25): sleep 01:00-07:00, night dim 60 % target `stage` locked, pixel shift, daily reload; and what it does not touch.
- Daily reload guard matches code: service-worker controller, `fetch('index.html', {cache:'no-store'})` probe, 10-minute gap, skipped-not-retried, http LAN page never reloads (main.js:408-482).
- config.json: loopback peer AND loopback Host, 403 otherwise, X-Forwarded-For never trusted, allowlist 404, seeded only when `source === 'defaults'`, resetPin read every load (serve.mjs:93-106, net.mjs, main.js:1394-1408). All exact.
- Content limit failing closed (ratings.js:48-54), unknown `maxContentRating` -> PG-13 (settings.js:77), pinned exempt and `limitNowPlaying` (main.js:119-124), 30-minute recheck (engine.js:7,29), country table examples gb/12A, gb/15 correct.
- Helper: flags, the refusal of a value option without a value (serve.mjs:64-70), auto-detect order and `wlr-randr` only with `--helper-output` (device-helper.mjs:125-134), command lines (78-80), 5 s limit, 4 s TV wake (main.js:510) all match.
- First-run polling: 5 s, rest 5 min after 3 unused codes, none while asleep (settings-ui.js:30, main.js:1266-1325).
- PIN: 4-8 digits, 5 wrong -> 60 s doubling to 15 min, right PIN clears (kiosk.js:11-20, 118-124); resetPin behaviour and Diagnostics row (main.js:944, 1399-1408).
- What is NOT in 2.1 is stated twice and correctly: drag/nudge and landscape fill planned for 2.2; `fillMode` accepted and inert.
- Verification tagging is thorough: banner defines (verify), Pi recipe, all Chromium flags, autostart, policy directory, CEC/wlr-randr commands, `hdmi_force_hotplug`, video group, thermal/vcgencmd, fake-hwclock, plex.direct remote/relay, managed-user token, contentRating syntax, reverse-proxy blocking. Nothing claims to work on real hardware; the recommended Pi setup carries "Not yet verified on a real Pi".
- Roadmap: every D1 deferral entry states the spec Non-goals reason (Remote control, Multi-poster, Frame per source, Animated bulbs, Frame rotation all match spec.md:293-297 in substance); Remote control carries D7's PIN-locked and no-protective-setting constraints; 2.2 section cites D41; shipped ideas removed; "Done in 2.1" added; engineering backlog including 2.1.x polish kept.
- Cross-references resolve: relative links, in-page anchors, checklist row ids V1-E14/E16/E22/E24/E25 exist, plan phases 22/23 are the right phases.

## Issues

### Critical

None.

### Important

1. **README claims a revealed token hides itself after 15 seconds in kiosk mode; the code has no such timer.** code-bug.
   - Location: /home/user/wt-docs/README.md:318 ("A revealed token hides itself after 15 seconds in kiosk mode.").
   - Evidence: `grep -n setTimeout js/settings-ui.js` prints nothing. `setTokenShown(false)` is called only at settings-ui.js:408 (close), 443 (sheet close event), 472 (Hide clicked) and 551 (open). The only 15 s constant is `REVEAL_MS` in kiosk.js:20, which is the controls reveal after a corner/Enter hold (main.js:1145). K35 in decisions.md D40 ("15 s kiosk reveal") is the controls reveal, and R-KIOSK-2 says the token "re-hides the field when the sheet closes".
   - Why it matters: it is a security statement a home-theatre owner would rely on (leave the token showing and walk away, trusting it to hide). Criterion 8(b) asks that every changed user-visible behaviour be described correctly.
   - Fix: replace the sentence with "The token hides again when Settings closes." (Optionally move "15 seconds" to the kiosk-mode paragraph, where it is already stated correctly.)

### Minor

1. **Daily reload wording does not say a wake by touch never triggers the 12-hour wake reload.** code-bug (incomplete, misleadable). README.md:192 says "and on the first wake from sleep if the last reload was over 12 hours ago" and later "never ... while a person has just woken the screen by hand". Code: main.js:588 `if (!asleep && why !== 'manual wake') requestReloadAfterWake()` (K39) — a manual wake never requests it at all, not merely delays it; it also waits while a poster loads or the TV is waking (main.js:423-426, K41). Fix: "and when sleep ends on its own or for playback (not when you wake it by touch), if the last reload was over 12 hours ago".
2. **`DeveloperToolsAvailability` = 2 is not itself tagged (verify); only the policy directory is.** spec-gap. README.md:298-305. spec.md:391 lists the policy among unverified items, but R-DOC-8 does not require the tag and the README points to `chrome://policy` for checking. Suggest "(verify at chrome://policy)" on the policy line.
3. **"Installed PWAs and Chromium in `--kiosk` mode are unaffected" (README.md:256) is a real-device behaviour stated without (verify).** spec-gap: spec R-PROT-3 mandates this exact statement and does not tag it. Suggest appending "(verify)".
4. **`KillMode=control-group (the default) also ends a command still running` (README.md:393) and the systemd unit / `loginctl enable-linger` lines (148-173) are untagged.** Minor; line 148 says every command in that recipe is untested, which covers the unit, but the KillMode claim sits in the helper section without a tag. spec-gap.
5. **Internal ids in user-facing prose.** Roadmap.md:19 "(K61)" and README rows like "(V1-E16)" are fine as checklist pointers, but "K61" means nothing to an owner. Suggest dropping "(K61)" from the Roadmap sentence. spec-gap (plain-language guidance, not a criterion).
6. **Long sentences in a few places.** README.md:9 (banner), 192 (daily reload) and 393 (helper safety) run long for a home-theatre owner; the rest is plain and short. Split 192 into three sentences when fixing Minor 1. spec-gap.

## Criterion 8 detail

- (a) Doc-review band **B+**. Accuracy against code: one wrong statement (Important 1), one incomplete one (Minor 1); everything else I spot-checked matched (about 40 numeric defaults, labels and behaviours). Completeness: every section the plan lists is present (Supported setups, Hardening with sleep/preset/blanking/smart plug/overlay/cache, Tablets, Kiosk, Network, Accounts, Helper, Rotation, Clock, config.json, project layout naming every js/*.js and scripts/*.mjs, development with test:e2e). Drift: none against code besides the above; version 2.0.0 in package.json/sw.js is acknowledged as a release-bump step. Cross-refs: all resolve.
- (b) keep-docs-current over `git diff --name-only 46257c3..HEAD` (69 files, 45 commits): every new schema key (controlLabels, dailyReload*, deviceHelper, disableShortcuts, fillMode, frameBrightness, idleSleepHours, kioskMode, limitNowPlaying, maxContentRating, nightDim*, pixelShift*, posterCacheLimit, rotateUi, PIN keys, showMeta/showPlayer/showProgress, sleep*, statusIndicator, wakeOnPlayback) is described; serve.mjs allowlist/guard/helper and net.mjs described; e2e runner described. Riskiest claims: sleep and wake lock (held while asleep, main.js:567, 1197-1214) correct; daily reload correct with Minor 1; kiosk PIN and resetPin correct except Important 1; limit fails closed correct; helper flags correct; config.json loopback-only correct; first-run polling correct; preset keys exact; not-in-2.1 correct. FAIL on Important 1 only.
- (c) Tagging: pass with Minors 2-4. Nothing claims to work on real hardware.
- (d) Roadmap: pass. Each deferral states its Non-goals reason; owner-requested entries, Planned for 2.2, Engineering backlog including 2.1.x polish kept; Scheduled dimming and Playback progress moved out of Ideas.

## Declined to judge

- Builder code-vs-spec notes 1-7 (Diagnostics shortcuts button, settings without controls, config seeding, reload conditions, helper auto-detect, "stage" label, episode rating): the README documents the code in each case, which is what the brief asks; whether the spec should be amended is a conductor/spec question, not this phase's.
- Whether "Not yet verified" vs "(verify)" should be one spelling: both are defined by the banner; style choice.
- The "Done in 2.0" history lines in Roadmap (30 posters, status pill): historical record of 2.0, outside this phase's changes.

## Recommendations

- Fix Important 1 (one sentence) and Minor 1 in the same edit; optionally add (verify) to the policy and the PWA/kiosk fullscreen line. No re-review of the rest is needed beyond confirming those lines.

## Assessment

A careful, accurate rewrite that matches the code almost everywhere and tags unproven OS and Chromium details well. One sentence states a token-hiding behaviour the app does not have; because it is a security-relevant claim and criterion 8(b) requires changed behaviour to be described correctly, I request that one fix.

Files read: listed under "What I read and ran".

**Verdict:** CHANGES REQUESTED
