# Brief — touch-and-labels r1

Agent name: touch-and-labels-builder-r1 · phase: touch-and-labels · round: r1 · effort: high

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-touch-and-labels` (branch `orch/touch-and-labels` from `ca4de29`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/touch-and-labels--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — touch-and-labels r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Use E2E_PORT=24720 E2E_MOCK_PORT=24721. TDD: write tests/shortcuts.test.js (criterion 1) and tests/e2e/touch-controls.spec.mjs (every case in criterion 3; seed `pixelShift: false`; use a touch context — `hasTouch: true`, `isMobile` where needed — and `page.tap`) first; watch both fail and paste the failures; then implement.
Design constraints (plan notes): js/shortcuts.js holds the one shortcut table (key, action, label) and `listShortcuts(settings)`; main.js's KEYS (l.~1007) is built from it so the `?` overlay and the handler cannot drift. The first-tap rule: record `wasVisible` on `pointerdown` in the capture phase and swallow the following `click` ONLY when wasVisible was false AND the target is inside #controls or is the bare stage AND no dialog is open AND `pointerType !== 'mouse'` — never inside Settings or other dialogs, never on the empty card's buttons, never for a mouse. Keep sleep's manual-wake swallowing (a tap while #sleep-veil is up wakes and triggers nothing) and kiosk mode (controls hidden and inert; the first-tap rule only applies when the controls can be revealed) exactly as they are. Labels: `controlLabels` ('auto' default, 'always', 'never' — already in js/settings.js; do not edit it): 'auto' shows a text label under each of the 7 icons when `(hover: none)`, and a tooltip on hover/focus with no persistent label on desktop; the bar stacks icon over text and may wrap at phone width and at rotation 90. `#shortcuts` dialog (top-layer, rotates with the UI, D2) opened by `?`, lists the table, Esc closes; `?` does nothing with disableShortcuts. Precache js/shortcuts.js.
Routed items (deadline: this phase; the gate refuses without them):
- K36 (D40): in kiosk mode the long-press/contextmenu exemption (main.js l.~1102, currently every `dialog[open]`) applies only inside the Settings sheet's text fields (and other text inputs), not the PIN keypad or other dialogs. e2e (touch-controls spec): kiosk on, PIN set — contextmenu on a PIN keypad key is prevented; on the Settings server/token input it is not; on the stage it is.
- engine.js hint (Output K54): the empty-library message says 'try turning off "unwatched only"' only when unwatchedOnly is on (js/engine.js l.~152); unit test in tests/engine.test.js for both cases (with and without a limit).
- K53 (D43): during the 5-minute first-run rest the empty card hides the general "Connect to your Plex server to get started." line and shows only the rest message. e2e in first-run.spec.mjs.
- S6C1/S6C2 (Output K54, test-only, first-run.spec.mjs): add a K50 assertion that the card's status changes and the `resting` class is off once the rest ends; raise the `freshUntil` helper's real-time timeout so six parallel runs of first-run cannot time out (counts stay on the frozen clock). Show first-run passing with 6 copies in parallel.
Run criteria 1–5 and the full `npm run test:e2e` once at the end (~15 min); lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`; paste outputs.

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
- Do not touch js/settings.js, js/settings-ui.js, js/kiosk.js, js/sleep.js or tests/e2e/lib.mjs.

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
### 20. `touch-and-labels` — Control labels, first-tap-only wake and shortcut overlay

- **Goal:** Label the icon-only controls, make the first touch only wake them (without eating taps inside dialogs), and list shortcuts under `?`.
- **Findings:** U11, U12, U13 · **Requirements:** R-CTRL-1, R-CTRL-2, R-CTRL-3
- **Mode:** afk · **Tags:** ui · **Blocked by:** `kiosk-and-pin`, `sleep-mode`
- **Output:** `js/shortcuts.js`, `tests/shortcuts.test.js`, `js/main.js`, `index.html`, `css/app.css`, `sw.js`, `tests/e2e/touch-controls.spec.mjs`, `js/engine.js`, `tests/engine.test.js`, `tests/e2e/first-run.spec.mjs` (K54: the routed engine.js empty-library hint and the settings-sheet first-run test fixes)
- **Acceptance criteria:**
  1. `test -f tests/shortcuts.test.js && node --test tests/shortcuts.test.js`  (the table has `r p space o f s d ?` with a label each; no duplicate keys; `listShortcuts({disableShortcuts:true})` is empty)
  2. `npm test`
  3. `npm run test:e2e -- touch-controls`  (touch context, controls idle-hidden: a tap on the Settings button's position reveals the controls and does NOT open Settings; a second tap opens it; the same with Pin and Rotate (rotation unchanged after the first tap); **no swallow outside the rule:** with Settings open for longer than the controls' hide delay a touch tap on Save works on the first tap; a touch tap on the empty-state card's **Open settings** works on the first tap; a mouse click on a visible button works on the first click; a tap while `#sleep-veil` is up wakes and does not trigger a control; `(hover: none)` emulation shows a text label under each of the 7 icons, desktop shows a tooltip on hover/focus and no persistent label; `controlLabels:'always'`/`'never'` override; `?` opens the shortcuts dialog listing at least 8 entries generated from `shortcuts.js` (at rotation 90 `#shortcuts`' computed transform angle is 90 and its bounding box lies inside the viewport), Esc closes it; with `disableShortcuts:true` `?` does nothing)
  4. `node scripts/check-precache.mjs`
  5. `grep -q 'id="shortcuts"' index.html`
- **Notes/hazards:**
  - Root cause of U12: `.controls` has `pointer-events:none` until `.visible`; `pointerdown` adds `.visible` and the browser then dispatches the `click` to the button that just became hit-testable. Record `wasVisible` at `pointerdown` (capture phase) and swallow the following `click` **only when** `wasVisible` was false, the target is inside `#controls` or is the bare stage, no dialog is open, and `pointerType !== 'mouse'` (sceptic I10: `wake()` runs on every `pointerdown` document-wide and hides the controls after 3.5 s even with a dialog open, so an unconditional rule would eat the first tap inside Settings).
  - `KEYS` in `main.js` is rebuilt from `js/shortcuts.js` so the overlay and the handler cannot drift.
  - Touch labels must fit seven buttons on a phone-width bar: stack icon over text, allow the bar to wrap; check at rotation 90.
  - Kiosk mode hides the controls entirely; this phase's first-tap rule applies only when they can be revealed.

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: touch-and-labels · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: touch-and-labels-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
