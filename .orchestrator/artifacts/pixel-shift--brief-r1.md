# Brief — pixel-shift r1

Agent name: pixel-shift-builder-r1 · phase: pixel-shift · round: r1 · effort: medium

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-pixel-shift` (branch `orch/pixel-shift` from `80d1759`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/pixel-shift--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — pixel-shift r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Use E2E_PORT=22020 E2E_MOCK_PORT=22021. TDD: add the new tests/layout.test.js cases (criterion 1: `stageSize({..., margin})`, `shiftOffset(step, marginPx)` bounded, never the same point twice in a row, 9 distinct points in 9 steps, deterministic) and write tests/e2e/pixel-shift.spec.mjs (every case in criterion 3) first; watch both fail and paste the failures; then implement in js/layout.js, js/display.js, css/app.css and index.html.
Design constraints (plan notes, D6): offset the stage with the individual CSS `translate` property on `.stage` (it composes before the existing `transform: translate(-50%,-50%) rotate(...)`, so the offset is in screen space at every rotation); `transition: translate 1.5s ease-in-out` alongside the existing transform transition — steps, never continuous drift; `prefers-reduced-motion: reduce` makes the translate transition none/0 s (there is already a reduced-motion block in css/app.css). The margin (1.5 % per side, so the stage is ~97 % on the limiting axis) and the offset apply ONLY while `pixelShift` is on; off = today's full-bleed layout and no `translate`. Step every `pixelShiftMinutes` (settings keys already exist in js/settings.js — do not edit it). Stage AND frame stay inside the viewport at every step. Add a "Display protection" fieldset in the settings dialog with `name="pixelShift"` (checkbox) and `name="pixelShiftMinutes"` (number), bound by name so js/settings-ui.js needs no change. Keep display.js's decode-timeout/revoke guards (phase display-decode-hang) intact; a settings save must re-apply the layout at once. The status dot (status-indicator) is independent of pixel shift — leave it alone.
Run criteria 1–7 and paste outputs.

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
- Do not touch js/settings.js, js/settings-ui.js, js/main.js or the status dot. The Pi's Chromium translate support is a real-server (verify) item: note it in the handback, do not build the #shifter fallback.

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
### 10. `pixel-shift` — Pixel shift with a glide

- **Goal:** Move the stage a few pixels every few minutes inside a 1.5% margin, gliding over 1.5 s, so no pixel stays lit for hours.
- **Findings:** E2 · **Requirements:** R-PROT-2 · **Rulings:** D6
- **Mode:** afk · **Tags:** ui · **Blocked by:** `rotation-layout-and-shell`, `settings-and-schedule-core`
- **Output:** `js/layout.js`, `js/display.js`, `css/app.css`, `index.html`, `tests/layout.test.js`, `tests/e2e/pixel-shift.spec.mjs`
- **Acceptance criteria:**
  1. `test -f tests/layout.test.js && node --test tests/layout.test.js`  (existing cases unchanged; new: `stageSize` with `margin: 0.015` is 97% of the margin-less size on the limiting axis; `shiftOffset(step, marginPx)` is bounded by `marginPx`, never returns the same point twice in a row, visits 9 distinct points in 9 steps, is deterministic)
  2. `npm test`
  3. `npm run test:e2e -- pixel-shift`  (fake clock, `pixelShift:true`, `pixelShiftMinutes: 3`, 20 steps at rotations 0 and 90 on 1920x1080 and 1080x1920: >= 9 distinct `translate` values and stage and frame bounding boxes inside the viewport at every step, measured after the glide settles; `.stage` computed `transition-property` includes `translate` and its duration is between 1 s and 2 s; with emulated `prefers-reduced-motion: reduce` the translate transition is `none`/0 s; `pixelShift:false` -> no `translate` and stage size equal to `stageSize()` without margin)
  4. `npm run test:e2e`  (the whole existing suite still passes: the rotation, ui-rotation, status and cache specs run with the harness default `pixelShift:false`)
  5. `node -e "import('./js/layout.js').then(m=>{const a=m.stageSize({viewportW:1920,viewportH:1080,aspect:0.64});const b=m.stageSize({viewportW:1920,viewportH:1080,aspect:0.64,margin:0.015});if(!(b.height<a.height&&b.height>a.height*0.95))process.exit(1)})"`
  6. `grep -q 'pixelShift' js/display.js && grep -q 'name="pixelShift"' index.html`
  7. `node scripts/check-precache.mjs`
- **Notes/hazards:**
  - Use the individual CSS `translate` property on `.stage`: it composes before `rotate`, so the offset is in screen space at every rotation. Support needs Chromium >= 104 **(verify the Pi's Chromium)**; if absent, fall back to wrapping the stage in a `#shifter` element.
  - D6 glide: `transition: translate 1.5s ease-in-out` alongside the existing rotation transition; steps are never instant jumps and never continuous drift (a continuous drift costs a composited animation for nothing).
  - Margin applies only while `pixelShift` is on, so a user who turns it off gets today's full-bleed layout. The ~3% smaller stage on upgrade is announced by the upgrade toast (`recommended-protection-preset`).
  - Creates the **Display protection** fieldset (checkbox + minutes input, bound by `name` so `settings-ui.js` needs no change).
  - Geometry specs written in later phases (`position`, `fill`) seed `pixelShift:false` as well (convention 7).

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: pixel-shift · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: pixel-shift-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
