# Brief — display-decode-hang r1

Agent name: display-decode-hang-builder-r1 · phase: display-decode-hang · round: r1 · effort: high

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-display-decode-hang` (branch `orch/display-decode-hang` from `9bce60c`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/display-decode-hang--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — display-decode-hang r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Use E2E_PORT=20220 E2E_MOCK_PORT=20221. TDD: write tests/e2e/display-decode.spec.mjs first (criterion 2: refreshes spaced exactly crossfadeMs + 200 ms apart, 60 presses with crossfadeMs 0 and again with 1200; after each press the next refresh must be accepted and the active poster layer must change; detect a stuck decode — e.g. wrap HTMLImageElement.prototype.decode in an init script to count pending decodes, or assert the refresh is accepted within a bound). Run it against the current js/display.js and paste the failure (it must fail there — the race is confirmed: removing src before load leaves decode() pending forever in Chromium). Then fix js/display.js at the root: the previous draw's cleanup timer must never clear the src of a layer that a newer draw owns (a draw-generation counter checked by the timer is the expected shape), and bound decode() so a decode that cannot settle rejects (the caller already handles a failed show) instead of hanging. Keep the crossfade looking the same. Run criteria 1–4 and paste outputs; run the spec at least 3 times.

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
- Touch only js/display.js and tests/e2e/display-decode.spec.mjs. Do not edit js/main.js (another phase is changing it in parallel).

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
### 28. `display-decode-hang` — Rotation never stalls on a pending image decode (added at stop 9, D30)

- **Goal:** A draw that starts while the previous draw's cleanup timer is due can never leave `decode()` pending forever, so rotation never stops until a reload.
- **Findings:** Q25 (confirmed by the `content-rating-filter` r4 anchored review) · **Requirements:** — (rotation reliability; no spec row names it) · **Rulings:** D30
- **Mode:** afk · **Tags:** — · **Blocked by:** `rotation-layout-and-shell`
- **Output:** `js/display.js`, `tests/e2e/display-decode.spec.mjs`
- **Acceptance criteria:**
  1. `npm test`
  2. `npm run test:e2e -- display-decode`  (refreshes spaced exactly crossfadeMs + 200 ms apart, 60 presses each with `crossfadeMs: 0` and `crossfadeMs: 1200`: every press settles — the next refresh is accepted and the active poster layer changes — and no `decode()` is left pending; the spec fails against the `js/display.js` at the base commit)
  3. `node scripts/check-precache.mjs`
  4. `test -z "$(git status --porcelain -- js/main.js index.html css sw.js)"`
  5. narrated: independent reviewer tries to stall rotation (rapid refreshes, a now-playing switch, a forced tick, a slow image, an image that fails to load) and confirms the crossfade still looks the same.
- **Notes/hazards:**
  - Root cause (Chromium): removing `src` from an `<img>` before its load finishes leaves `decode()` pending forever; the cleanup timer for the previous draw (crossfadeMs + 200 ms) removes the `src` of the layer the next draw is decoding on. The fix must make the cleanup never touch a layer that a newer draw owns (e.g. a draw generation counter checked by the timer), and/or bound `decode()` so a stuck decode rejects instead of hanging.
  - `content-rating-filter` case 18 flaked on this race; once this lands that spec should be stable.

---

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: display-decode-hang · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: display-decode-hang-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
