# Brief — rename-now-showing r1

Agent name: rename-builder-r1 · phase: rename-now-showing · round: r1 · effort: high

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/nathan/wt-rename-now-showing` (branch `orch/rename-now-showing` from 5bd76c3). Work ONLY there; never touch `/home/nathan/plex-poster-app` except the two `.orchestrator` paths below.
- For the e2e suite set your own ports: `E2E_PORT=18180 E2E_MOCK_PORT=18501` (D12). The machine is short on memory: run one e2e command at a time, never in parallel.
- Handback: `/home/nathan/plex-poster-app/.orchestrator/artifacts/rename-now-showing--handback-builder-r1.md`. Questions: append to `/home/nathan/plex-poster-app/.orchestrator/questions.md` as `Q<n> — rename-now-showing r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Invoke superpowers:test-driven-development for the spec fix and superpowers:verification-before-completion before you hand back.

Rulings to read first in `docs/decisions.md`: D52 (the rename's scope and what stays unchanged) and D55 (the rotation spec race). The probes in `/home/nathan/plex-poster-app/.orchestrator/phases/rename-now-showing.md` list every place the old name appears today.

Hazards (each is a prohibition):
- Do not change any `plexPoster.*` storage key, the `shell-${VERSION}` cache name, the client identifier, or `EXPORT_FORMAT = 'plex-poster-display/settings'` in `js/settings.js`, nor the tests that use that format string (D52; probe: `grep -rn "plex-poster-display" js tests` → js/settings.js:5, tests/settings.test.js:94,198,212, tests/e2e/kiosk.spec.mjs:686).
- Do not change `VERSION` anywhere; `release-bump` does that (convention 5).
- Do not rename the GitHub repository, its Pages address, or any URL that contains `plex-poster-app` (D52).
- The README may keep the old name at most once, in one "formerly Plex Poster Display" line (criterion 2). Say in the README that displays signed in before the update keep their old "Plex Poster Display" entry under plex.tv Authorized Devices until they sign in again (the phase's Notes/hazards).
- "Plex" stays in sentences that mean the Plex service or server; only the product name changes.
- D55: the empty-card measurement in `tests/e2e/ui-rotation.spec.mjs` must not race the app's poster tick (`js/main.js:271` calls `showEmpty(false)` on each successful tick). Fix it in the spec only; do not change `js/main.js` or `tests/e2e/lib.mjs`. You choose the mechanism; the spec must still measure the empty card at every rotation.

Run criteria 1–5 from the worktree root and paste each command's real output tail. Criterion 4 is the full suite; run it once after everything else passes.

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
- Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`).

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
### 29. `rename-now-showing` — Rename the app "Now Showing" (D52)

- **Goal:** Every name a user sees reads "Now Showing" instead of "Plex Poster Display", while signed-in displays keep their settings and sign-in through the update.
- **Findings:** — · **Requirements:** — · **Rulings:** D52
- **Mode:** afk · **Tags:** ui, docs · **Blocked by:** `docs`
- **Output:** `index.html`, `manifest.webmanifest`, `js/plex.js`, `scripts/serve.mjs`, `package.json`, `package-lock.json`, `README.md`, `Roadmap.md`, any test under `tests/` that asserts the old name, and `tests/e2e/ui-rotation.spec.mjs` (D55: the empty-card race)
- **Acceptance criteria:**
  1. `grep -q '<title>Now Showing</title>' index.html && grep -q '<h1>Now Showing</h1>' index.html && node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));const p=require('./package.json'),l=require('./package-lock.json');if(!(m.name==='Now Showing'&&m.short_name==='Now Showing'&&p.name==='now-showing'&&l.name==='now-showing'&&l.packages[''].name==='now-showing')){console.error(m.name,m.short_name,p.name,l.name);process.exit(1)}" && grep -q "PRODUCT = 'Now Showing'" js/plex.js && grep -q '^# Now Showing' README.md`
  2. `! git grep -n 'Plex Poster Display' -- . ':!docs/' ':!.orchestrator/' ':!README.md'` and `test "$(grep -c 'Plex Poster Display' README.md)" -le 1`  (the old name survives at most once, in a "formerly" line in the README)
  3. `for k in plexPoster.settings plexPoster.clientId plexPoster.carry plexPoster.lastReload plexPoster.pinLock plexPoster.posterIndex plexPoster.whatsNew; do grep -rqF "$k" js/ || { echo "storage key renamed: $k"; exit 1; }; done && grep -q 'shell-\${VERSION}' sw.js`  (stored settings, the client identifier and the cache names keep their names)
  4. `npm test && npm run test:e2e && node scripts/check-precache.mjs`
  5. `for i in 1 2 3; do node tests/e2e/run.mjs ui-rotation || exit 1; done`  (D55: the rotation spec passes three runs in a row)
  6. narrated: the GitHub repository name and the Pages address are not changed here (D52: public, the owner decides, at the D49 re-creation at the earliest); `docs/` keeps its history as written.
- **Notes/hazards:**
  - plex.tv lists a device by its `X-Plex-Product`; displays signed in before the update keep their old entry until they sign in again. Say so in the README.

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: rename-now-showing · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: rename-builder-r1 · dispatched: 2026-10-14T19:47:59Z`, then each acceptance command with its real output tail.
