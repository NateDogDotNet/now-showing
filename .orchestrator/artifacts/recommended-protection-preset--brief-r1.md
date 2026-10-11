# Brief — recommended-protection-preset r1

Agent name: recommended-protection-preset-builder-r1 · phase: recommended-protection-preset · round: r1 · effort: medium

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-recommended-protection-preset` (branch `orch/recommended-protection-preset` from `e3c81a6`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/recommended-protection-preset--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — recommended-protection-preset r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Use E2E_PORT=25020 E2E_MOCK_PORT=25021. TDD: write tests/e2e/preset.spec.mjs (every case in criteria 1 and 2; seed `pixelShift: false` where geometry matters) first; watch it fail and paste the failure; then implement in index.html, css/app.css, js/settings-ui.js and js/main.js. Do NOT edit js/settings.js or sw.js (criterion 3).
Design (plan notes, D4/D5/D6, Q20): a "Recommended protection" button in Settings' Display protection fieldset opens a confirm list of exactly the keys it would change (sleepEnabled true, sleepStart 01:00, sleepEnd 07:00, nightDim true, nightDimLevel 60, nightDimTarget 'stage' shown as an untickable row, pixelShift true, dailyReload true), each with a checkbox so a household can untick rows; Cancel changes nothing; Apply fills the form, Save persists. It never enables idle sleep and never touches maxContentRating, limitNowPlaying, the connection, or any key not listed. The preset constants live in js/settings-ui.js. The upgrade toast (R-UPG-1): a configured install without `plexPoster.whatsNew` shows "What's new in 2.1" once with an Open settings action that opens Settings at the Display protection fieldset; an unconfigured install never shows it; the marker is written so it never shows again. If the kiosk PIN is set, Open settings goes through the normal PIN gate.
Routed items (deadline: this phase):
- K59: tests/e2e/smoke.spec.mjs 'clock install + runFor' (l.~58-65) reads Date.now() on a running fake clock and failed once with 'advanced 59995ms' (the Playwright 1.56 running-clock race behind K49). Pause the clock with a checked pause before t0 so the case measures simulated time only; keep the assertion (≥ 60000 and < 62000). Show it passing 20 runs under load.
- touch-and-labels r3 wording: the closed "Control labels" select clips its Auto option at 1280 and 1920 widths; shorten the option labels (e.g. "Auto", "Always", "Never (icons only)").
Run criteria 1–3 and 5, and criterion 4 (the FULL suite, ~16 min; give your own timeout room) once at the end; paste outputs. For criterion 6, write a short narrated scenario in the handback: at rotation 90 with kiosk on and pixel shift on, enter a sleep window, then wake by playback — what you saw.

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
- Milestone close (M2): the full suite must be green on the merged tree; any red test needs a root cause, not a retry.

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
### 18. `recommended-protection-preset` — One-tap recommended protection and the upgrade notice

- **Goal:** A single Settings button that applies the recommended protection values after showing what it will change, and a one-time "What's new in 2.1" toast. Closes M2.
- **Findings:** — (applies the E1, E4 and E2 settings in one tap) · **Requirements:** R-PROT-5, R-UPG-1 · **Rulings:** D4, D5, D6
- **Mode:** afk · **Tags:** ui · **Blocked by:** `sleep-mode`, `frame-brightness`, `pixel-shift`, `pi-stability`, `content-rating-filter`, `kiosk-and-pin`, `device-helper-integration`
- **Output:** `index.html`, `css/app.css`, `js/settings-ui.js`, `js/main.js`, `tests/e2e/preset.spec.mjs`, `tests/e2e/smoke.spec.mjs` (K59: test-only fix for the running fake-clock race)
- **Acceptance criteria:**
  1. `npm run test:e2e -- preset`  (click **Recommended protection**: a list of the keys it will change appears; Cancel changes nothing; Apply then Save persists `sleepEnabled:true`, `sleepStart:'01:00'`, `sleepEnd:'07:00'`, `nightDim:true`, `nightDimLevel:60`, `nightDimTarget:'stage'`, `pixelShift:true`, `dailyReload:true`; `idleSleepHours` stays 0, `maxContentRating` and `limitNowPlaying` keep their seeded values (test with `maxContentRating:'R'` and with `''`), and `plexToken`, `serverUrl`, `libraryKey` are unchanged)
  2. `npm run test:e2e -- preset`  (upgrade toast: with the harness default `plexPoster.whatsNew` removed and the app configured, a toast containing `What's new in 2.1` with an **Open settings** action appears once and not after a reload; unconfigured it never appears)
  3. `test -z "$(git status --porcelain -- js/settings.js sw.js)"`
  4. `npm test && npm run test:e2e && node scripts/check-precache.mjs`  (milestone close: the full suites pass on the merged M2 tree; this is also the seam check for the shared `index.html`/`main.js`/`display.js` edits)
  5. `npm run test:e2e -- sleep pixel-shift kiosk brightness helper content-rating pi-stability`  (the protection features still pass together)
  6. narrated: `/phase-gate` over M2 (story status, test health, doc currency); one combined scenario at rotation 90: sleep window + kiosk + pixel shift, then wake by playback.
- **Notes/hazards:**
  - D4/D5/D6: the preset does **not** enable idle sleep and does **not** set a content limit (that is the separate "Household with children" toggle). The night-dim target `stage` is ruled (Q20); the preset shows it as an untickable row.
  - The preset constants live in `js/settings-ui.js`; the schema phase deliberately did not hard-code them so the preset can evolve without a schema change. Each row in the confirm list has a checkbox so a household can untick any row.
  - Upgrade toast (R-UPG-1): marker `plexPoster.whatsNew` (a plain key); shown once for a configured install; its action opens Settings at the Display protection fieldset. Lives here because that fieldset is what it points to.

---

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: recommended-protection-preset · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: recommended-protection-preset-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
