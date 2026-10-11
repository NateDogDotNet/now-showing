# Brief — sleep-mode r1

Agent name: sleep-mode-builder-r1 · phase: sleep-mode · round: r1 · effort: high

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-sleep-mode` (branch `orch/sleep-mode` from `e764aee`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/sleep-mode--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — sleep-mode r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Use E2E_PORT=18840 E2E_MOCK_PORT=18841. TDD: write `tests/sleep.test.js` (pure `decideSleep` in `js/sleep.js`: every case in criterion 1) and the `engine.playing()` cases in `tests/engine.test.js` first; watch them fail; then implement. Then write `tests/e2e/sleep.spec.mjs` (every case in criterion 3) and watch it fail before wiring `js/main.js`, `index.html` (`#sleep-veil`, the sleep settings fields), `css/app.css` and `sw.js` (precache `js/sleep.js`). Paste both pre-implementation failures in the handback.
Design constraints (D4, plan notes): asleep = an opaque black `#sleep-veil` plus body class `asleep`, with the wake lock still HELD — never release the lock to sleep. While asleep, `tick()` still polls `/status/sessions` through `engine.playing()` (honours `username`, `includeEpisodes`, works with `showNowPlaying` off) but fetches no image and never calls `display.show`. Manual wake: `pointerdown`/`keydown` while asleep lifts the veil for 60 s and must not activate the control under the finger. Schedules use local time and only apply when `isPlausibleClock(now)`; idle sleep does not need a plausible clock. Use the helpers in `js/schedule.js` and the settings keys already in `js/settings.js` (do not edit either file). Diagnostics shows `Sleep: <awake|asleep> (<schedule|idle|manual wake>)`, the local time, and `Clock not set` when implausible.
Conductor ruling for criterion 3: the e2e stub's `window.__wakeLock.held` is a COUNTER (tests/e2e/lib.mjs:137); "held === true" in the plan means `held === 1` (the lock is held), and `releases` must not change while sleeping.
Run criteria 1–5 and paste outputs.

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
- risk:high: keep the change minimal and readable; reviewers will attack it (criterion 6: veil stuck after playback, wake lock lost; offline start, clock change, settings saved while asleep).

## Conventions every phase follows (verbatim from the plan)
1. **Output is a whitelist.** A phase may create or modify only its `Output` paths. The plan file and `.orchestrator/` are never Output. A parenthetical after a path is a condition, not part of the path.
2. **Acceptance criteria are shell commands run from the repo root; exit 0 is a pass.** An item starting `narrated:` is not a command: it names what a human or reviewer checks, and scores as narrated.
3. **Concurrent phases run in separate git worktrees with their own ports (D12).** Each worktree sets its own `E2E_PORT` and `E2E_MOCK_PORT`, so e2e runs do not collide and a worktree's `git status` shows only that phase's edits. Every server a test spawns (unit, integration or e2e) listens on a free port probed at run time, never a fixed one, apart from the shared e2e server's `E2E_PORT`/`E2E_MOCK_PORT`, because every worktree runs `npm test`. Scope probes are therefore valid per worktree. A scope probe is `test -z "$(git status --porcelain -- <paths>)"`: unlike `git diff HEAD` it also sees untracked new files. The conductor's reconcile step is the cross-check.
4. **Negative checks and unit-test lists are guarded.** `! grep … F` passes when `F` is missing, and `node --test a b` silently skips a missing path when another path exists, so every negative grep is written `test -f F && ! grep … F` and every `node --test` criterion is prefixed with `test -f` for each test file it names.
5. **New files under `js/` go into `SHELL` in `sw.js` in the phase that creates them**, which therefore lists `sw.js` in Output. `VERSION` is bumped **once**, in `release-bump` (spec R-REL-1; D16): the rationale is clean releases, not that per-phase bumps would reload clients (any `sw.js` edit already triggers a service-worker update).
6. **Output overlap is a scheduling constraint, not a dependency.** Many UI phases edit `index.html`, `css/app.css`, `js/main.js`, `js/display.js`, `js/settings-ui.js` and `scripts/mock-plex.mjs`. Two phases whose Output lists share a path must not run concurrently even when neither blocks the other. The *Concurrency* section lists only Output-disjoint sets.
7. **Pixel shift is on by default, so geometry specs run without it.** `tests/e2e/lib.mjs` (built in `e2e-harness`) seeds `pixelShift:false`, `dailyReload:false` and the `plexPoster.whatsNew` marker by default; a spec that tests those features sets them explicitly. Every spec that measures stage geometry also names `pixelShift: false` in its own settings.
8. **The e2e `mock` helper is generic** (`mock.get(action)`, `mock.post(action, params)` call `/__mock/<action>`), so later phases add mock endpoints without editing `tests/e2e/lib.mjs`.
9. **(verify)** marks a Plex parameter, Chromium flag or hardware command that could not be exercised in the authoring environment; each is carried into `docs/validation/`.
10. **Settings keys are added once** (`settings-and-schedule-core`); feature phases add controls (bound by `name`) and consume keys, and do not edit `js/settings.js`.
11. **Plan edits commit separately** from phase output. `Findings: —` means the phase delivers no source finding directly (an enabler, or documentation of shipped work).
12. **No gate phases.** The r1 milestone gates are gone. The phase that closes each milestone (named in the *Milestones* table) carries the full-suite criteria (`npm test`, `npm run test:e2e`, `node scripts/check-precache.mjs`), and the conductor runs `/phase-gate` on it at Step 7. `release-bump` carries the release checks (D11).
13. **The run ends with a push to the working branch only (D13).** A pull request or merge happens only when the owner asks, so no phase is tagged `publish`.

## The phase (verbatim from the plan)
### 12. `sleep-mode` — Sleep schedule and idle sleep

- **Goal:** Show pure black during sleep hours or after N idle hours while keeping the wake lock held, and wake on playback.
- **Findings:** E1 · **Requirements:** R-PROT-1 · **Rulings:** D4
- **Mode:** afk · **Tags:** ui, risk:high · **Blocked by:** `settings-and-schedule-core`
- **Output:** `js/sleep.js`, `tests/sleep.test.js`, `js/engine.js`, `tests/engine.test.js`, `js/main.js`, `index.html`, `css/app.css`, `sw.js`, `tests/e2e/sleep.spec.mjs`
- **Acceptance criteria:**
  1. `test -f tests/sleep.test.js && test -f tests/engine.test.js && node --test tests/sleep.test.js tests/engine.test.js`  (`decideSleep`: window crossing midnight, idle expiry at N hours, playback wakes during a window when `wakeOnPlayback`, stays asleep when not, manual wake for 60 s then back to sleep, `sleepEnabled:false` with `idleSleepHours:0` never sleeps, `clockOk:false` ignores the schedule but not idle sleep; engine `playing()` returns the session without fetching art)
  2. `npm test`
  3. `npm run test:e2e -- sleep`  (fake clock inside 01:00-07:00 with `sleepEnabled:true`: `#sleep-veil` visible and opaque black, controls hidden, `window.__wakeLock.held === true` and `releases` unchanged by sleeping, no `/photo/:/transcode` request made while asleep (counted with `page.on('request')`, not the mock stats endpoint); `mock.play()` -> veil hidden within one `nowPlayingPollSeconds`, poster shown; idle sleep: `idleSleepHours:1`, no playback for 61 simulated minutes -> asleep; a key press wakes for 60 s then sleeps again; `wakeOnPlayback:false` keeps the veil during the window; a fake clock at 1970 inside the clock window does not sleep; Diagnostics shows `Sleep: asleep (schedule)`)
  4. `node scripts/check-precache.mjs`
  5. `grep -q 'id="sleep-veil"' index.html && grep -q 'name="sleepEnabled"' index.html`
  6. narrated: independent reviewer (risk:high) tries to produce a state where the veil stays up after playback starts or the wake lock is lost (offline start, clock change, settings saved while asleep).
- **Notes/hazards:**
  - D4: asleep is a black veil with the wake lock **held**; releasing the lock is not a sleep mechanism, and re-acquiring one does not wake a screen the OS already blanked. The README (in `docs`) says to turn OS screen blanking off. Whether Chromium's Linux wake lock inhibits labwc/swayidle is **(verify)** on hardware.
  - While asleep `tick()` must still poll `/status/sessions` (to wake on playback and to refresh `lastPlaybackAt`) but must not fetch images or call `display.show`. Add `engine.playing()` for that; it honours `username` and `includeEpisodes` and works even when `showNowPlaying` is off.
  - Body class `asleep` is the contract other features key off (status dot, kiosk reveal, helper power).
  - Manual wake: any `pointerdown`/`keydown` while asleep lifts the veil for 60 s; it must not trigger the control under the finger (`touch-and-labels` generalises the first-tap rule and treats the veil as "controls hidden").
  - Local time only: browser timezone; schedules wait for a plausible clock (`isPlausibleClock`). Diagnostics shows the local time and `Clock not set` when implausible.

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: sleep-mode · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: sleep-mode-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
