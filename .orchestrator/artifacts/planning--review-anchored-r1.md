Reviewer: planning-review-anchored-r1 · Model: claude-opus-5-5 · Dispatched: 2026-10-08T20:44:44Z · Method: anchored PRD/plan review (qa + pm lenses) · Scope: phase planning, round r1, base 4667a0f, staged tree ed72fd4

## What I read and ran

**Read:** `~/.claude/agents/orchestrator-reviewer.md`; `.orchestrator/artifacts/planning--brief-r1.md`; `.orchestrator/questions.md` (Q1–Q13); the handback header; `docs/spec.md` (all 320 lines); `docs/integration-plan.md` (all 988 lines); `~/.claude/skills/integration-orchestrator/SKILL.md`: floor and "Count the change", graph, tag routing, phase types, HITL, Steps 2/3/4/5/7, Invocation. Code at HEAD: `js/main.js`, `js/display.js`, `js/layout.js`, `js/poster-cache.js`, `js/frames.js`, `js/settings.js`, and the relevant parts of `js/settings-ui.js`, `js/plex.js`, `js/engine.js` and `js/util.js`. Also `scripts/serve.mjs`, `scripts/mock-plex.mjs`, `sw.js`, `index.html` (ids), `css/app.css` (grep), `package.json`, `.github/workflows/ci.yml`, `Roadmap.md` and `.gitignore`.

**Ran.** Everything ran in `mktemp -d` → `/tmp/tmp.RlSWSsX8Z1`, with `git worktree add --detach … HEAD` at 4667a0f. I removed it afterwards (`git worktree remove --force`) and checked that `git worktree list` was clean.
- `npm test`: `# tests 29 / # pass 29 / # fail 0`. This matches the preamble's "29 tests pass".
- Environment claims. `/opt/pw-browsers` holds `chromium-1194`. `npm root -g` gives `/opt/node22/lib/node_modules`, and the global playwright `version` is `1.56.1`. `npm view playwright@1.56.1` gives `1.56.1`, so the registry is reachable. Node is v22.22.0. The machine has a non-loopback IPv4, `192.0.2.2`. `file assets/frames/marquee.png` gives `1080 x 1688, 8-bit/color RGBA`. All three frames are under 1.5 MB (largest 1,105,129 bytes). **All of these claims verified.**
- **F1 repro.** I wrote a throwaway Playwright probe that loads the global playwright via `createRequire(npm root -g)`, the same approach the plan proposes for `lib.mjs`. It ran `serve.mjs --mock --port 18080 --mock-port 18401` with settings seeded the way the smoke spec seeds them.
  - Rotation 0: `top 0, bottom 1080, cy 540, scrollHeight 1080`.
  - Rotation 90: `top 304, bottom 1384, cy 844, scrollHeight 1384 > clientHeight 1080`.
  - No console errors in either case. So F1 reproduces exactly as stated (about 300 px low). The smoke-spec approach works: global resolve, seeding, poster `naturalWidth>0`, no console errors.
- **Command forms.** I exercised 23 acceptance-command forms with stdin `/dev/null` (table under Runnability).
- **Graph parse.** A Python script parsed the dependency table and compared it with each phase's `Blocked by:` line (no mismatches). It also checked for cycles and sinks, computed the ancestors of `release-bump`, recomputed the waves (all match the plan), found the longest path, and checked the concurrency groups for Output overlap.
- **Note.** During the review the branch moved. Commit 1f4d3e2 committed the two documents, and its tree `ed72fd40…` is the staged tree I was asked to review, so this review applies to it unchanged. Commit b44560c then added a Roadmap idea; see Declined to judge.

## Strengths

- **Code citations are accurate.** Each one I checked is correct:
  - `js/main.js`: `fetchImage` (always fetches and puts, at :63–83), `setInterval(updateStatus, 1000)`, `KEYS`, `wake()` (3500 ms), `updateWakeLock`, `state.busy`, `state.directImages`.
  - `js/display.js`: `detectFromImage` (an inner function using a 600 px canvas).
  - `js/layout.js`: `stageSize`, and `requestSize` with its 100 px steps.
  - `js/poster-cache.js`: `createPosterCache({limit=30})`.
  - `js/plex.js`: the `PlexError.kind` set and `firstReachable`.
  - `js/engine.js`: `err.kind==='empty'`.
  - `js/util.js`: `toast()` takes one action.
  - `js/settings-ui.js`: binds controls generically by `name` (:24–41), which justifies "feature phases need no settings-ui change".
  - `scripts/serve.mjs`: `--port`, `--mock-port`, the BLOCKED regex, and listen-at-import.
- **Coverage is complete.** The brief's grep loop gives a non-zero count for all 38 IDs in both files. Every finding is delivered by a concrete runnable criterion (table below), not just mentioned.
- **The e2e harness is designed well.** It uses exact spec-name matching, a wake-lock stub, blocked service workers by default, and `page.clock`. My probe confirmed the global-playwright fallback actually resolves.
- **The hazards sections are high quality.** Examples: top-layer `<dialog>` ignores ancestor transforms; the CSS individual `translate` property composes in screen space; the U12 root cause (`pointer-events:none` then `click` delivered to the newly hit-testable button); the canvas-downscale blur instead of `filter: blur`; never registering a frame before its PNG exists, because `cache.addAll` rejects; the DNS-rebinding Host guard; CSRF via a custom header with no CORS grant.
- **The spec follows the brief.** Sections are in the brief's order. Defaults are tabled for every key. (verify) items are collected for V1.

## Coverage: the criterion that delivers each finding

| ID | Delivering criterion (phase #crit) |
|---|---|
| F1 | `layout-rotation-fix` #1 `npm run test:e2e -- rotation`: boxes inside the viewport and centred within 1 px, `scrollHeight == clientHeight` |
| F2 | `ui-rotation-shell` #1: computed transform angle = rotation for controls, toast, empty card, settings, diagnostics and dot. Holds only under Q1-A |
| F3 | `cache-first-fetch` #3: `transcode <= 8`, `Cache.put <= 8`, and 0 after reload |
| F4 | `serve-config-guard` #1: LAN 403 on `/config.json` plus normalisation bypasses. Runnable here, since a non-loopback IPv4 exists |
| F5 | `status-indicator` #1: pill hidden, dot ≤8 px and ≤0.4 opacity, 0 mutations, dot moves after 5 min |
| S1 | `rotate-plex-token` #1–3: receipt `Rotated: yes` plus no token-like string. The purge is optional (#44) |
| V1 | `real-server-validation` #1–2 and `-extended` #1–2: no `PENDING`, `Overall:` line. Weak: FAIL is accepted, see I5 |
| U1/U4 | `connection-card-and-libraries` #3 (`#connected-card`, `Movies · 8 titles`, fallback on 500) and #1 (`totalSize`) |
| U2/U3 | `settings-time-and-advanced` #3: presets 60/300/900/3600, custom 2.5 min saves 150, `details#advanced` |
| U5 | `position-drag-nudge` #3 (drag maps to offset at 0/90, arrow ±0.1, Shift ±1.0) and #1 |
| U6 | `remote-config-server` #1 and `remote-config-ui` #3. #3 is not runnable as written, see I6 |
| U7 | `fill-blur-and-info` #3 and `multi-poster-layout` #3 |
| U8 | `frame-per-source` #3 (mechanism), `coming-attractions-artwork` #1, `coming-attractions-register` #2 |
| U9 | `now-playing-extras` #3: progress at 10% then 20%, paused freezes, `Playing in Living Room` |
| U10 | `metadata-overlay` #3: `^PG-13 · 2 h 14 m · 1993$` |
| U11–U13 | `touch-and-labels` #3: first tap only wakes, `(hover:none)` labels, `?` dialog ≥8 entries |
| U14 | `actionable-errors` #1: Sign in again, Diagnostics/Test connection, Turn off unwatched |
| E1 | `sleep-mode` #3: veil, wake-lock release recorded, no transcode while asleep, `mock.play()` wakes |
| E2 | `pixel-shift` #3 (≥9 distinct positions, in viewport) and #4 (margin) |
| E3 | `bulb-animation` #3: 40–80 bulbs, opacity-only keyframes, reduced-motion handled |
| E4 | `frame-brightness` #3: `brightness(0.6)` at 23:00, poster unfiltered |
| E5 | `frame-rotation` #3: daily/weekly switch with a fake clock |
| E6 | `device-helper-server` #1 (argv via fake `execFile`, 403/400 paths) and `device-helper-integration` #3 |
| E7/E8/E11/E13/E15/E17 | `docs-hardening` #1 keyword grep (`smart plug`, `Overlay File System`, `disk-cache-dir`, `swelling`, flags, `managed user`, `32400`, `VLAN`). E8's code half is in `cache-first-fetch` |
| E9 | `pi-stability` #1 `! grep backdrop-filter` and `device-helper-integration` #3 (CPU temperature) |
| E10 | `pi-stability` #2 |
| E12/E16 | `kiosk-and-pin` #3: no reveal except a 3 s corner hold, PIN gate, `#token-toggle` asks for the PIN, `disableShortcuts` |
| E14 | `content-rating-filter` #3: under PG-13, 50 refreshes show no R, TV-MA, `gb/15` or unrated title |

## Runnability (sampled forms, run at HEAD in the worktree)

At HEAD most of these are *expected* to fail, because the feature does not exist yet. What matters is whether the form parses, resolves and could pass once the blocking phases have landed.

| Phase #crit | Exit at HEAD | Form verdict |
|---|---|---|
| e2e-harness #5 `node -e "require('./package.json')…"` | 1 | OK. Under `"type":"module"`, `-e` still runs as CJS. Forces Q5-A (M9) |
| e2e-harness #6 grep ci.yml | 1 | OK |
| settings-core #4 dynamic `import('./js/settings.js')` | 1, prints `['rotateUi','pixelShift']` | OK |
| settings-core #6 toExport | **0** | Passes vacuously at HEAD because `sanitize` drops unknown keys. It gains teeth once the keys exist. Acceptable |
| settings-core #7 fromImport | 1 | OK |
| settings-core #8 `import('./js/schedule.js')` | 1, `ERR_MODULE_NOT_FOUND` | OK |
| rotate-plex-token #3, on the plan's own receipt template | 0 | OK. **False positive** on a 20+ char hyphenated word: `Method: signed-out-all-devices-via-plex-web` gives exit 1 (M5) |
| pixel-shift #4 stageSize margin | 1 | OK |
| frame-brightness #5 | 0 | OK |
| pi-stability #1 | 1 (`189: backdrop-filter`) | OK, created by the phase itself |
| fill-blur-and-info #5 | 1 (`189: backdrop-filter`) | **Depends on `pi-stability`, which does not block it** (I4) |
| device-helper-server #3 and #4, `! grep … scripts/device-helper.mjs` | **0, file missing** | Vacuous pass on a missing file (M4) |
| remote-config-server #3, `! grep … remote/*.html remote/*.js` | **0, files missing** | Vacuous (M4) |
| docs-hardening #3 link check | 0 | OK |
| docs-features #1 module listing | 0 | OK. It only gains teeth when new files land |
| docs-features #4 Roadmap sed | 1 | OK. Roadmap line 17 `## 🔜 Ideas` is followed by the three headings |
| release-bump #1 VERSION regex | 1, prints `2.0.0 2.0.0 2.0.0` | OK. The regex matches both `const` and `export const` |
| coming-attractions-artwork #1, `file` pattern on `marquee.png` | 0 | OK. The pattern matches the real `file` output |
| purge-git-history #1 | 1 (5c4a716, 3a7b688) | Form OK, but not satisfiable from the repo root as the checklist runs it (M6) |
| gate #5 `git status --porcelain -- . ':!.orchestrator'` | 0 | OK |
| frame-per-source #4 | 0 | OK |
| e2e smoke (my equivalent probe) | ran; poster loaded, no console errors | OK |
| remote-config-ui #3 phone at 127.0.0.1 | — | **Not satisfiable under the server's default bind** (I6) |

## Issues

### Important

**I1. The release path does not include the P0 human gates, and `p0-gate` is a dangling node.**
- **Location:** dependency graph; `release-bump` Blocked by; `p0-gate`.
- **Evidence:** the graph script printed `sinks ['p0-gate', 'purge-git-history']` and `NOT ancestors of release-bump: ['rotate-plex-token', 'real-server-validation', 'p0-gate', 'p3-gate', 'purge-git-history']`. `p3-gate` #4 checks only `real-server-extended.md`. Nothing ever checks `Overall: PASS` on the core file or `Rotated: yes` after M1.
- **Why it matters:** 2.1.0 can be bumped and gated with the leaked token never rotated (S1) and the core real-server validation never done (V1). Both are "fix-first" in the brief. No P1 phase waits for P0 to close either, so the milestone ordering is advisory only.
- **Class:** code-bug.
- **Fix:** add `rotate-plex-token` and `real-server-validation` (or the merged replacement, see the proposal) to `release-bump`'s Blocked by. Add `grep -qx 'Rotated: yes' docs/security/token-rotation.md && grep -qx 'Overall: PASS' docs/validation/real-server-core.md` to the release criteria.

**I2. An optional human asset sits on the critical path and blocks the release.**
- **Location:** `coming-attractions-artwork` Blocked by `frame-per-source`; `docs-features` and `release-bump` Blocked by `coming-attractions-register`, `multi-poster-layout` and `remote-config-ui`.
- **Evidence:**
  - The artwork's criteria are only `file …` and `stat …` on a PNG the owner draws in Paint.NET. Nothing it does consumes `frame-per-source`, so that edge is not a prerequisite.
  - The computed longest path runs through it: `e2e-harness -> settings-and-schedule-core -> sleep-mode -> bulb-animation -> frame-rotation -> frame-per-source -> coming-attractions-artwork -> coming-attractions-register -> docs-features -> release-bump -> p3-gate -> purge-git-history`.
  - Q4 and Q12 call these features droppable, yet the release cannot run without them.
- **Why it matters:** the whole release waits on a hobby art task, which surfaces at wave 6. If the owner never supplies the PNG, nothing ships, and every protection feature already built stays unreleased.
- **Class:** code-bug.
- **Fix:** set the artwork to `Blocked by: none`, so the owner can draw it on day one. Make `coming-attractions-register`, `multi-poster-layout` and `remote-config-*` non-blockers of the release, or state explicitly that `release-bump` drops any droppable phase still open. Turn `docs-features` #2's keywords for those features into conditionals.

**I3. The concurrency list conflicts with the plan's own scope criteria.**
- **Location:** "Phases that can run concurrently", together with convention 2's `git diff --quiet HEAD -- <paths>` criteria.
- **Evidence:** the groups are Output-disjoint (the script printed `disjoint` for all 8 pairs). But in a shared working tree, each probe below sees its round-mate's edits:
  - `e2e-harness` #7 lists `scripts/serve.mjs`, which `serve-config-guard` edits.
  - `layout-rotation-fix` #3 lists `js index.html sw.js scripts`, which `settings-and-schedule-core` (`js/settings.js`, `sw.js`) and `device-helper-server` (`scripts/*`) edit.
  - `device-helper-server` #5 lists `js …`, which `settings-and-schedule-core` edits.
  - `remote-config-server` #5 lists `js css …`, which `cache-first-fetch` (`js/main.js`) edits.
  - `docs-hardening` #4 (`git diff --name-only HEAD | grep -vx README.md`) sees `multi-poster-layout`'s files.

  So 5 of the 8 concurrent pairs fail a criterion they would pass alone. Separately, `git diff HEAD` cannot see untracked new files, so these probes miss a new `js/foo.js` unless it is staged.
- **Why it matters:** this produces false RE-DISPATCH bands, or the conductor "overrides" its own criteria, which the skill forbids without quoting.
- **Class:** code-bug.
- **Fix:** do one of two things. State that concurrent phases run in their own worktrees, each with its own `E2E_PORT`/`E2E_MOCK_PORT`. Or replace these probes with the skill's reconcile (`evidence.py git --reconcile`) and drop them as criteria. Ask this as a question (see Missing questions).

**I4. Missing edge: `fill-blur-and-info` needs `pi-stability`.**
- **Location:** `fill-blur-and-info` #5 `! grep -nE 'backdrop-filter|filter: *blur' css/app.css`.
- **Evidence:** at HEAD this exits 1 on `css/app.css:189 backdrop-filter: blur(8px);`, which `pi-stability` removes. `fill-blur-and-info` is blocked only by `metadata-overlay` and `ui-rotation-shell`, so the frontier can offer it first.
- **Why it matters:** either the criterion fails, or the fill agent removes the `.sheet` blur itself. That is work belonging to E9/`pi-stability`, and it would make `pi-stability` #1 pass with no work done.
- **Class:** code-bug.
- **Fix:** add `pi-stability` to `fill-blur-and-info`'s Blocked by, or scope the grep to the new rules.

**I5. V1 validation passes on `Overall: FAIL`.**
- **Location:** `real-server-validation` #2 vs #4; `real-server-validation-extended` #2; `p3-gate` #4.
- **Evidence:**
  - #2 accepts `^Overall: (PASS|FAIL \(.+\))$`, so criteria 1–3 can be satisfied together by a FAIL result. Narrated #4 says the phase "is not done until a later run records PASS", which contradicts the computed criteria.
  - `p3-gate` #4 accepts FAIL on the extended file, so the release gate passes over a failed real-server validation.
- **Why it matters:** the skill's Step 5 scores the commands. The phase closes on FAIL, and V1 is "delivered" without anything having been validated.
- **Class:** code-bug.
- **Fix:** core and the release gate should require `grep -qx 'Overall: PASS'`. A FAIL keeps the phase open and spawns a fix phase through reconcile. Extended may allow `SKIPPED` rows for the Pi but must end in `Overall: PASS`.

**I6. `remote-config-ui` #3 cannot run under `remote-config-server`'s design.**
- **Location:** `remote-config-ui` #3 ("phone … opens that URL (LAN address replaced by 127.0.0.1)") vs `remote-config-server` Notes (the LAN listener binds `--remote-host`, default the first non-internal IPv4).
- **Evidence:** this host's first non-internal IPv4 is `192.0.2.2`. With harness `serveArgs: ['--remote']`, nothing listens on `127.0.0.1:8090`. If the listener were bound to 127.0.0.1 instead, `remote-config-server` #1's "403 from the LAN address" scenario would no longer describe the same listener. The fixed port 8090 also collides with any concurrent run.
- **Why it matters:** the skill's Invocation check requires each acceptance command's form to be exercisable against the mandated layout. This one is not.
- **Class:** code-bug.
- **Fix:** have the e2e open the real `data-url` (the LAN address is reachable from the same host). Or pass `serveArgs: ['--remote','--remote-host','127.0.0.1','--remote-port', <free>]` and say so. Either way, make the remote port configurable through the harness env.

**I7. Right-sizing: 44 phases is well above what the change needs.**
- **Location:** the whole plan.
- **Evidence:**
  - Four gates (`p0-gate` to `p3-gate`) have `Output: none`. Their criteria (`npm test`, `npm run test:e2e`, `check-precache`, clean tree, `/phase-gate`) are one evidence run that the skill already performs. Step 7 says: "Any phase that closes an epic or a plan-level milestone: run `/phase-gate` on it". Each gate costs a claim, a zero-subject tally and a Step 8 record.
  - Several splits share one pre-flight and one evidence run, which "Count the change" says to merge:
    - F1 is a few CSS lines, and F2 builds on the same rotation e2e matrix.
    - `connection-card-and-libraries` and `settings-time-and-advanced` both edit the same settings sheet (`index.html`/`js/settings-ui.js`) and share one e2e run.
    - `metadata-overlay` and `now-playing-extras` both edit `toPoster`/`tests/plex.test.js`/the mock/the overlay slot. The plan itself notes "now-playing-extras also edits toPoster; this phase lands first".
    - `frame-rotation` and `frame-per-source` both edit `js/frame-rotation.js`, its test, and the same frame-swap hook.
    - `docs-hardening` and `docs-features` are two README passes. The second must re-verify the first after `real-server-validation-extended` anyway.
    - The `p3-gate` criteria are a subset of `release-bump`'s.
- **Why it matters:** the brief requires right-sized phases ("the skill merges those"). Every extra phase costs a dispatch, reviews and five-redispatch headroom.
- **Class:** code-bug, against the brief and the skill rule.
- **Fix:** see the Right-sizing proposal (about 33 phases).

**I8. The `dailyReload` default of true can leave a display dead on plain-http LAN origins.**
- **Location:** spec R-PROT-3, Settings table (`dailyReload: true`), `pi-stability` Notes.
- **Evidence:** `registerServiceWorker()` returns early when `!window.isSecureContext` (`js/main.js`, the "Not a secure context" branch). A display served from `http://<lan-ip>:8080` therefore has no service worker. A 04:00 `location.reload()` while that host is down produces Chromium's "This site can't be reached" page, which nothing will reload: the app is gone until someone intervenes. The plan's hazards cover reload loops and open dialogs, not this case.
- **Why it matters:** a protection that defaults on should not brick a kiosk ("protect without surprising").
- **Class:** spec-gap. The brief and findings are silent on it.
- **Fix:** reload only when `navigator.serviceWorker.controller` is set, or after a `fetch('index.html',{cache:'no-store'})` probe succeeds. Add an e2e case with the server down. Alternatively, make the default conditional.

### Minor

- **M1. Output gap in `frame-per-source`.** The phase adds "a second frame select (`frameIdRandom`) … 'Same as above'", but the existing frame select's options are built in JS at `js/settings-ui.js:21` (`[...FRAMES, NO_FRAME, …].map(f => new Option(…))`), and `js/settings-ui.js` is not in its Output. *Fix:* add it. Class: code-bug.
- **M2. Hidden dependency in `sleep-mode` #3.** "No `/photo/:/transcode` requests while asleep" relies on `mock.stats()`, i.e. `/__mock/stats`. That endpoint is created by `cache-first-fetch`, which does not block `sleep-mode`, and `sleep-mode`'s Output has no `scripts/mock-plex.mjs`. *Fix:* count with `page.on('request')`, or add the edge. Class: code-bug.
- **M3. Wrong edges for `remote-config-server`.** It is blocked by `device-helper-server`, which is only Output overlap (`serve.mjs`, `net.mjs`). The plan's own convention 4 says overlap is not an edge. It is *not* blocked by `settings-and-schedule-core`, yet it validates the types of allowlisted keys such as `frameRotation`, `sleep*` and `fillCount`, which exist only after that phase. *Fix:* swap the edge. Class: code-bug.
- **M4. Vacuous negative greps.** `! grep … file` exits 0 when the file is missing (probe: `device-helper-server` #3 and #4, `remote-config-server` #3 all gave exit 0 with "No such file"). *Fix:* write `test -f F && ! grep … F`. Class: code-bug.
- **M5. Over-broad token regex in `rotate-plex-token` #3.** The `[A-Za-z0-9_-]{20,}` alternative matches ordinary hyphenated words; the probe got exit 1 on `signed-out-all-devices-via-plex-web`. *Fix:* match `X-Plex-Token` or a 20-character `[A-Za-z0-9]` run bounded by non-word characters, or just grep the receipt for the old token's first 4 characters, which Diagnostics shows. Class: code-bug.
- **M6. `purge-git-history` #1 checks the wrong repo.** It runs `git log --all -- config.js` at the repo root, but the checklist purges "in a fresh clone". The conductor's checkout keeps `main`, `origin/*` and the working branch with the old objects, so the criterion stays at exit 1. *Fix:* add a re-sync step to the checklist (`git fetch --prune --force`, reset each local branch, drop stale refs), or run the criterion against a fresh clone of `origin`. Class: code-bug.
- **M7. The precache check misses nested files.** `scripts/check-precache.mjs` is specified to check only `js/*.js`, so `js/vendor/qrcode.js` (from `remote-config-ui`) could be left out of `SHELL` silently, breaking offline. (The current CI inline check uses `fs.readdirSync("js")` and would flag the `js/vendor` directory itself.) *Fix:* make the check recursive. Class: code-bug.
- **M8. Two `release-bump` criteria lack teeth.**
  - The `release.spec` assertion "no `shell-2.0.0` cache remains" is vacuous in a fresh browser context, because 2.0.0 was never installed there. *Fix:* install the 2.0.0 SW first, or drop the clause.
  - #5 relies on prose ("with a lockfile, add it to the expected list"). The command as written fails when `package-lock.json` exists, and it will exist, because `e2e-harness` narrated #8 needs `npm ci`. *Fix:* make the lockfile unconditional in `e2e-harness`.
  - Class: code-bug.
- **M9. Criteria fix open-question options.**
  - `e2e-harness` #5 requires `devDependencies.playwright`, which fails under Q5-B.
  - `settings-and-schedule-core` #5 hard-codes `rotateUi===true` (Q1-A), but the plan's "Open rulings" list does not name `settings-and-schedule-core` under Q1. That phase runs in wave 1, before `ui-rotation-shell`.

  *Fix:* list both phases as held by Q5 and Q1 respectively, or write criteria that hold under every option. Class: code-bug.
- **M10. Tag routing needs adjustment.**
  - `risk:high` is not warranted on `rotate-plex-token` (a hitl receipt with no code to review cold), `ui-rotation-shell` (CSS, fully e2e-covered, visible failure) or `multi-poster-layout` (`architecture` already routes `/arch-review`, and the phase is droppable).
  - `risk:high` *is* arguably warranted on `content-rating-filter`, the child-safety guarantee for the kids-in-the-house persona.
  - `publish` on `release-bump` routes "before anything leaves the repo" reviews, yet the phase says "Do not tag, push or publish anything". Keep it only if the run ends in a push or PR (ask).
  - `ui` is inconsistent: it is on `frame-rotation`, `device-helper-integration` and `coming-attractions-register` (a `FRAMES` entry), but not on `content-rating-filter`, which also adds a select.
  - `e2e-harness` adds an external tool (Playwright plus CI), but no tag routes `/tool-fit review` for it.
  - All hitl phases are genuine human acts: owner credentials, a real server, owner art, owner force-push.

  Class: code-bug.
- **M11. Stale starting commit.** The preamble says `3a7b688`, but the run's actual start is 4667a0f (`.gitignore`), and the docs commit is now 1f4d3e2. `docs-*` criteria using `3a7b688..HEAD` therefore include non-phase commits. This is harmless, but the brief itself is stale. Class: spec-gap.
- **M12. `bulbAnimation` default true is a visible change.** For an upgrading 2.0.0 user it is new motion in a living room, which contradicts "imperceptible protections on" (Q10). The same applies, more weakly, to `pixelShift`'s 1.5% border on full-bleed portrait displays. This is a product call, but Q10 should list both explicitly. Class: spec-gap.
- **M13. Missing acceptance bullets in the spec.** About 20 requirements have prose but no separate acceptance bullets: R-SET-1..4 and 6, R-CTRL-1..3, R-FRM-1/2/4, R-FILL-1/2, R-PROT-3..5, R-KIOSK-2, R-HELP-2, R-DOC-*, R-REL-1. The plan's criteria carry them, but the brief asks for "testable acceptance statements" per requirement. Class: code-bug, low impact.
- **M14. R-SEC-1 is a one-file denylist.** `serve.mjs --host 0.0.0.0` still serves `.orchestrator/`, `docs/validation/*` (the owner pastes Diagnostics there) and `docs/security/*` to the LAN. Only `.git|node_modules|tests|scripts|design` are blocked. An allowlist of app paths is the more robust fix. Class: spec-gap.
- **M15. Q6's rationale is partly wrong.** Q6 says per-phase bumps "would auto-reload installed clients into unfinished work". But any phase that edits `SHELL` changes `sw.js` bytes, which already triggers a service-worker update and a `controllerchange` reload. With an unchanged cache name, `install` also overwrites `shell-2.0.0` in place while the old worker serves from it (`sw.js` activate/fetch), which mixes shell versions. This is harmless if nobody runs the branch, but the decision should rest on the real trade-off. Class: spec-gap.

## Right-sizing proposal (44 → 33)

This proposal drops the 4 gate phases (their criteria move into `release-bump`, and `/phase-gate` runs at Step 7 on whichever phase closes each milestone) and makes 6 merges. It cuts `multi-poster-layout` (Q12 recommendation becomes B, drop: U7 lists the fill modes with "or", so blur plus info satisfies it). It merges the two README phases, absorbs `p3-gate` into `release-bump`, and unblocks the artwork.

| # | Phase | Merges | Blocked by (key) |
|---|---|---|---|
| 1 | `e2e-harness` | — | — |
| 2 | `settings-and-schedule-core` | — | 1 |
| 3 | `rotate-plex-token` (hitl) | — | — |
| 4 | `serve-config-guard` | — | — |
| 5 | `rotation-layout-and-shell` | `layout-rotation-fix` + `ui-rotation-shell` (F1+F2; under Q1-B it is F1 plus docs) | 1, 2, 7 |
| 6 | `cache-first-fetch` | — | 1, 2 |
| 7 | `status-indicator` | — | 1, 2 |
| 8 | `validation-checklists` | — | — |
| 9 | `real-server-validation` (hitl) | — | 4, 6, 8 |
| 10 | `pixel-shift` | — | 5 |
| 11 | `frame-brightness` | — | 2 |
| 12 | `sleep-mode` | — | 2, 6 |
| 13 | `bulb-animation` | — | 12 |
| 14 | `frame-rotation-and-source` | `frame-rotation` + `frame-per-source` (E5 + U8 mechanism) | 13 |
| 15 | `content-rating-filter` | — | 2 |
| 16 | `kiosk-and-pin` | — | 5 |
| 17 | `device-helper-server` | — | 4 |
| 18 | `device-helper-integration` | — | 17, 12, 11 |
| 19 | `pi-stability` | — | 12 |
| 20 | `recommended-protection-preset` (closes M2 → `/phase-gate`) | `p1-gate` criteria | 10–19 |
| 21 | `settings-sheet-polish` | `connection-card-and-libraries` + `settings-time-and-advanced` (U1–U4) | 1 |
| 22 | `actionable-errors` | — | 21 |
| 23 | `touch-and-labels` | — | 16 |
| 24 | `metadata-and-now-playing` | `metadata-overlay` + `now-playing-extras` (U10+U9) | 15, 10 |
| 25 | `position-drag-nudge` (closes M3) | `p2-gate` criteria | 5 |
| 26 | `fill-blur-and-info` | — | 24, 5, 19 |
| 27 | `coming-attractions-artwork` (hitl, optional) | — | **none** |
| 28 | `coming-attractions-register` (droppable) | — | 27, 14 |
| 29 | `remote-config-server` | — | 4, 2 |
| 30 | `remote-config-ui` | — | 29, 5 |
| 31 | `real-server-validation-extended` (hitl) | — | 8, 15, 21, 24, 17 |
| 32 | `docs` | `docs-hardening` + `docs-features` | 31 and all shipped feature phases |
| 33 | `release-bump` | `p3-gate` criteria; requires `Rotated: yes` and core plus extended `Overall: PASS` | 3, 9, 31, 32; **not** 28/30 if dropped |
| 34 | `purge-git-history` (optional, irreversible) | — | 3, 33 |

That is 33 phases, or 34 counting the optional purge. A further optional merge would fold `actionable-errors` into `settings-sheet-polish` (31/32). I would keep `device-helper-server` separate from `device-helper-integration`, and `remote-config-server` separate from `remote-config-ui`, so that the security-bearing server diffs get their own `risk:high` reviews.

## Open questions: assessment and missing ones

- **Q1** Sound. Also list `settings-and-schedule-core` as held by it (M9).
- **Q2** Sound. A is the only option with a real channel; the reason given for rejecting B is correct.
- **Q3** Sound. Also make `check-precache` recursive (M7).
- **Q4** Sound on who draws the art. Missing: unblock the artwork phase, and say what happens if the PNG never arrives (I2).
- **Q5** Sound. The environment verifies it: 1.56.1 global, chromium-1194.
- **Q6** Decision acceptable, rationale imprecise (M15).
- **Q7** Sound.
- **Q8** Sound.
- **Q9** Sound.
- **Q10** Mostly sound. Re-ask for `bulbAnimation` and `dailyReload` (M12, I8).
- **Q11** Sound.
- **Q12** Recommend changing the default to B (drop), or at minimum taking it off the release path (I2).
- **Q13** Split sound. But core must block the release and both must require PASS (I1, I5).

**Missing questions:**
- **Q14.** Do droppable or optional phases (artwork, multi-poster, remote) gate the release?
- **Q15.** Do concurrent phases run in separate worktrees with separate e2e ports? (I3)
- **Q16.** Does the run end in a push, PR or merge to `main`? This decides whether `publish` belongs on `release-bump` (M10).
- **Q17.** Should `dailyReload` be guarded, or default off, on origins without a service worker? (I8)
- **Q18.** Should the F4 fix be an allowlist of served paths rather than a `config.json` special case? (M14)

## Declined to judge

- **Commit b44560c** added a Roadmap "Auto-discover Plex servers" idea after the reviewed tree. It is outside the reviewed tree and not a finding. Note only that `docs-features` #4 does not touch it, and that its GDM/UDP helper overlaps the `serve.mjs` surfaces. Whether it belongs in this run is the owner's call.
- **Commit 1f4d3e2.** The brief said "Do not commit", but the documents were committed, by the conductor as far as I can tell. That was not the builder's act, so I make no ruling.
- **Product calls:** kiosk mode plus `disableShortcuts` leaves a remote-only landscape TV with no way to reach settings (the corner hold needs a pointer). Also whether the 15-minute PIN lockout ceiling is right. Neither is a criterion defect.
- **Hardware and Plex facts:** whether the (verify) items (Plex `contentRating` syntax, `totalSize`, CEC/vcgencmd/wlr-randr/ddcutil, Chromium flags) are correct cannot be checked here. They are correctly routed to V1.
- **Phase sizing inside the large feature phases** (`kiosk-and-pin`, `sleep-mode`, `remote-config-*`): I did not estimate line counts.

## Recommendations

1. Fix I1, I2, I4 and I5 in the graph and criteria. These are small edits.
2. Answer I3 and Q15 before the policy approval.
3. Fix I6's e2e form.
4. Adopt the 33-phase merge list, or justify each split it keeps.
5. Apply M1–M10 while editing. They are mostly one-line changes.
6. Add Q14–Q18 to `.orchestrator/questions.md`.

## Assessment

The spec and plan are thorough, accurately grounded in the code, and every finding has a runnable delivering criterion. The e2e approach is proven feasible here. The defects are structural:
- The release path skips the two P0 human gates.
- An optional art asset sits on the critical path and blocks the release.
- Validation phases close on FAIL.
- The concurrency list conflicts with the plan's own scope probes.
- One missing edge (I4), and one e2e criterion that cannot run as written (I6).
- The plan is about a third larger than the skill's "count the change" rule allows.

None of these needs a redesign, but together they would cause false re-dispatches and an unsafe release gate.

**Verdict:** CHANGES REQUESTED
