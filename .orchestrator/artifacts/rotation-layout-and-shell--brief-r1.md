# Brief — rotation-layout-and-shell r1

Agent name: rotation-layout-and-shell-builder-r1 · phase: rotation-layout-and-shell · round: r1 · effort: medium

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-rotation-layout-and-shell` (branch `orch/rotation-layout-and-shell` from `33976fe`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/rotation-layout-and-shell--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — rotation-layout-and-shell r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Use E2E_PORT=18610 E2E_MOCK_PORT=18611. TDD: write `tests/e2e/rotation.spec.mjs` and `tests/e2e/ui-rotation.spec.mjs` first (every viewport × rotation case in criteria 1 and 2, `pixelShift:false` in their own settings), run them and watch criterion 1 fail on the current CSS at 1920x1080 / rotation 90 (paste that failure in the handback — it proves the spec detects F1). Then fix `css/app.css`, `index.html` and `js/display.js` (D2: the whole UI shell rotates; top-layer dialogs need their own rotation rules; expose `--ui-rotation`; `rotateUi:false` turns UI rotation off). Keep the rotation transition and the reduced-motion override. Run criteria 1–7 and paste outputs. If you use `frontend-design` guidance, keep the existing visual style (dark panels, the accent colour) — this phase changes geometry, not look.

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.


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
### 5. `rotation-layout-and-shell` — Rotated stage centred and on screen; the whole UI rotates with it

- **Goal:** At rotation 90/270 on a landscape viewport the stage is centred and fully visible, and controls, toast, empty card, Settings and Diagnostics read upright on a physically rotated screen (setting `rotateUi`, default on).
- **Findings:** F1, F2 · **Requirements:** R-ROT-1, R-ROT-2 · **Rulings:** D2
- **Mode:** afk · **Tags:** ui · **Blocked by:** `e2e-harness`, `settings-and-schedule-core`
- **Output:** `css/app.css`, `index.html`, `js/display.js`, `tests/e2e/rotation.spec.mjs`, `tests/e2e/ui-rotation.spec.mjs`
- **Acceptance criteria:**
  1. `npm run test:e2e -- rotation`  (viewports 1920x1080, 1080x1920, 1280x800 x rotations 0/90/180/270 with `pixelShift:false`: `#stage` and `#frame` bounding boxes inside the viewport (1 px tolerance), centre within 1 px of viewport centre, limiting dimension within 2 px of the viewport, `.app` `scrollHeight == clientHeight`)
  2. `npm run test:e2e -- ui-rotation`  (for rotation 90/180/270 and viewports 1920x1080 and 1080x1920: open settings (`s`) and diagnostics (`d`), trigger a toast and the empty state; each of `#controls`, `#toast`, `.empty-card`, `#settings`, `#diagnostics` has a computed transform angle equal to the rotation and a bounding box inside the viewport; the controls bar sits at the viewer's bottom-right; with `rotateUi:false` none is rotated; rotation 0 bounding boxes equal those recorded with `rotateUi:false`)
  3. `grep -Eq 'pixelShift: *false' tests/e2e/rotation.spec.mjs tests/e2e/ui-rotation.spec.mjs`  (these specs name the seed, convention 7)
  4. `npm test`
  5. `node scripts/check-precache.mjs`
  6. `grep -q -- '--ui-rotation' css/app.css && grep -q -- '--ui-rotation' js/display.js`
  7. `test -z "$(git status --porcelain -- js/settings.js js/engine.js js/plex.js js/main.js sw.js scripts)"`
  8. narrated: the reviewer shows the `rotation` spec failing against the CSS at `3a7b688` (a throwaway `git worktree` of that commit with `tests/e2e/` copied in) at 1920x1080 / rotation 90, proving the test detects the bug; then runs `E2E_SHOTS=$(mktemp -d) npm run test:e2e -- ui-rotation` and looks at the rotation-90 settings and controls screenshots (Step 7 `/ux-simulate`): text reads upright when the screenshot is turned 90 degrees, nothing clipped.
- **Notes/hazards:**
  - Root cause of F1: `.app { display:grid; place-items:center }` sizes the grid row to the sideways stage's layout box (e.g. 1080x1687 inside 1920x1080), so the row grows and the rotated result lands low. Fix: `.stage { position:absolute; left:50%; top:50%; transform: translate(-50%,-50%) rotate(var(--rotation,0deg)) }` and drop reliance on grid centring. Keep `transition: transform .5s` so rotation still animates; check the reduced-motion rule still removes it.
  - `pixel-shift` later uses the individual `translate` property, which composes before `transform`; do not use `translate` here.
  - F2 (D2): a top-layer `<dialog>` (`showModal`) ignores ancestor transforms. Give each dialog its own rule: swap `width`/`height` using `--vw`/`--vh` custom properties set by `display.layout()` and rotate with a `transform-origin` chosen per angle so the sheet docks to the viewer's right edge. The backdrop stays full-screen. Expose `--ui-rotation` for `kiosk-and-pin` and `status-indicator`.
  - `rotateUi:false` is the supported path for Pi users who rotate the OS (`wlr-randr`/`xrandr`) and keep app rotation at 0. `display.apply(settings)` already receives the settings, so `js/main.js` is not touched.
  - Not `risk:high`: CSS only, fully e2e-covered, failures are visible.

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: rotation-layout-and-shell · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: rotation-layout-and-shell-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
