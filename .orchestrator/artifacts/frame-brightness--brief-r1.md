# Brief — frame-brightness r1

Agent name: frame-brightness-builder-r1 · phase: frame-brightness · round: r1 · effort: medium

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-frame-brightness` (branch `orch/frame-brightness` from `1b31344`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/frame-brightness--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — frame-brightness r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Use E2E_PORT=22220 E2E_MOCK_PORT=22221. TDD: write tests/brightness.test.js (pure `effectiveBrightness(now, settings)` in js/brightness.js — every case in criterion 1, the DST case run under `TZ=America/New_York`, e.g. a child process or `process.env.TZ` set before the first Date) and tests/e2e/brightness.spec.mjs (every case in criterion 3; seed `pixelShift: false`, convention 7) first; watch both fail and paste the failures; then implement.
Design constraints (R-FRM-4, R-PROT-4, plan notes): the result is a level in [0.1, 1]; night dim ramps in over the first 10 minutes after nightDimStart and out over the last 10 before nightDimEnd in WHOLE-MINUTE steps; a window shorter than 20 minutes peaks below nightDimLevel; the effective value is min(frameBrightness, night level); no night dim when nightDim is false or `isPlausibleClock(now)` is false. Use `inWindow`, `parseHHMM` and `isPlausibleClock` from js/schedule.js (do not edit it; js/settings.js already has every key — do not edit it). Apply `filter: brightness(x)` to `#frame` (nightDimTarget 'frame') or `#stage` ('stage') ONLY — never the poster img layers or #poster-box — and clear the other; `none`/`brightness(1)` at full. NO transition, animation or will-change on filter anywhere (criterion 5). A once-a-minute timer aligned to minute boundaries sets the value; re-evaluate on settings apply (live preview and Save), on `visibilitychange` to visible, and after a clock jump (wall clock moved more than ~2 min from what the timer expected). Add frameBrightness (range or number 10–100), nightDim, nightDimStart, nightDimEnd, nightDimLevel and nightDimTarget controls to the existing "Display protection" fieldset in index.html, bound by name (js/settings-ui.js needs no change). Precache js/brightness.js in sw.js. While asleep (body.asleep, the veil is black) the filter value does not matter but must not break the veil.
Run criteria 1–5 and paste outputs.

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
- Do not touch js/schedule.js, js/settings.js, js/settings-ui.js, js/layout.js or the pixel-shift / status-dot code paths.

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
### 11. `frame-brightness` — Frame brightness and night dim

- **Goal:** Dim the frame (or, optionally, the whole stage) manually and automatically at night, in stepped minute updates.
- **Findings:** E4 · **Requirements:** R-FRM-4, R-PROT-4 · **Rulings:** D6
- **Mode:** afk · **Tags:** ui · **Blocked by:** `settings-and-schedule-core`
- **Output:** `js/brightness.js`, `tests/brightness.test.js`, `js/display.js`, `js/main.js`, `css/app.css`, `index.html`, `sw.js`, `tests/e2e/brightness.spec.mjs`
- **Acceptance criteria:**
  1. `test -f tests/brightness.test.js && node --test tests/brightness.test.js`  (pure `effectiveBrightness(now, settings)`: manual level, night window incl. midnight crossing, the 10-minute ramp in after `nightDimStart` and out before `nightDimEnd` in whole-minute steps, windows shorter than 20 minutes peak below the level, `min` of manual and night level, `nightDim:false`, an implausible clock gives no night dim, a DST night under `TZ=America/New_York`)
  2. `npm test`
  3. `npm run test:e2e -- brightness`  (fake clock 12:00 with `nightDim` on: `#frame` computed `filter` is `none` or `brightness(1)`; 23:00 (after the ramp): `brightness(0.6)` +-0.02; `frameBrightness:50` -> `brightness(0.5)`; target `frame`: the poster `<img>` layers, `#poster-box` and `#stage` have `filter: none`; target `stage`: `#stage` has `brightness(0.6)` and `#frame` none; minute-by-minute across the ramp the value changes in steps and never between minute ticks)
  4. `node scripts/check-precache.mjs`
  5. `test -f css/app.css && ! grep -nE 'will-change: *filter|transition[^;]*filter' css/app.css`  (no animated or transitioned `filter`)
- **Notes/hazards:**
  - Filter on `#frame` (target `frame`) or `#stage` (target `stage`) only. **No CSS transition and no animation on `filter`** (Pi GPU; this resolves the r1 conflict between R-PROT-4 and R-FRM-4): a once-a-minute timer sets the value in whole steps, using `schedule.inWindow` and `isPlausibleClock` from the core phase.
  - Re-evaluate on `visibilitychange` and after a clock jump. The README note on `fake-hwclock` staleness (Q23) is delivered by `docs`.
  - Hardware brightness is dropped (D8); there is no helper interaction here.
  - The `Display protection` fieldset exists after `pixel-shift`; this phase adds its controls beside them (Output overlap serialises the two).

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: frame-brightness · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: frame-brightness-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
