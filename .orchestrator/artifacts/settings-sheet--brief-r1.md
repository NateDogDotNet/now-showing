# Brief — settings-sheet r1

Agent name: settings-sheet-builder-r1 · phase: settings-sheet · round: r1 · effort: high

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-settings-sheet` (branch `orch/settings-sheet` from `1df3be1`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/settings-sheet--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — settings-sheet r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Use E2E_PORT=24020 E2E_MOCK_PORT=24021. TDD: write the new unit cases (criterion 1: `client.libraryCount(key)` in js/plex.js, `presetFor`/`secondsFromMinutes` in a new js/duration.js) and tests/e2e/settings-sheet.spec.mjs and tests/e2e/first-run.spec.mjs (every case in criteria 3 and 4; seed `pixelShift: false`) first; watch them fail and paste the failures; then implement. Follow the plan's notes for D3 (automatic plex.tv code on an unconfigured display, shown large and upright on the empty card, refreshed on expiry, backoff, Settings not forced open), the one kind→actions table in main.js reused by the empty card, the toast (js/util.js toast() takes a list of actions) and the test result, lazy library counts that never block testConnection(), the minute presets as a UI-only radio group mapped in read()/write() (storage stays seconds), the `details#advanced` fold, and the mock toggles. Precache js/duration.js in sw.js.
Carried must-fixes (deadline: this phase; the gate refuses without them):
- C8M2 (D28): when Save is the press that wakes the display, rebuild the Plex client BEFORE the wake tick runs (in applySettings, rebuildClient before evaluateSleep when the connection changed). e2e: asleep, open Settings over the veil, change the server/library, Save → the first poster after waking comes from the NEW connection.
- C8M1 (D38): correct the household-limit help text (index.html, l.~149) to say posters above the limit are never shown, except a poster the owner pinned and saved, and the title playing right now when "Apply the limit to what's playing right now" is off. Keep it short and plain.
- K30: the Display protection fieldset is not live, but an unsaved pixel-shift change rides along when a live layout field moves. Make it consistent the same way kiosk, PIN and deviceHelper already are: add `pixelShift`, `pixelShiftMinutes`, `dailyReload`, `dailyReloadTime` to the keys a live preview never changes (applySettings' preview destructure in js/main.js); the brightness controls in their own `data-live` block stay live. e2e: untick pixel shift, move a live layout field, Cancel → pixel shift still running; Save → it stops.
- K31: the Frame brightness slider shows its current value with `<output data-for>` in the same unsigned format posterScale uses, and its "10–100 %" hint no longer wraps.
Do not change js/settings.js, js/engine.js, js/display.js or js/layout.js (criterion 8). Run criteria 1–8 and the full `npm run test:e2e` once at the end (~13 min); paste outputs. If the dispatch proves too large, stop after the U1–U4 part plus the carried items, say so in the handback, and leave U14 + first run for a second dispatch (the plan allows that split).

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
- Full process (D42): anchored + cold reviews; sign-in and the first-run code flow touch plex.tv, so treat network failures, retries and token handling carefully (no token in logs or the DOM beyond the existing masked field).

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
### 19. `settings-sheet` — Connection card, libraries, minute presets, Advanced fold, actionable errors and the keyboardless first run

- **Goal:** Open Settings on a "Connected to ... Change" card with library counts, offer rotation time in minutes with the rare settings under Advanced, make errors carry their fix, and start the plex.tv code flow automatically on an unconfigured display.
- **Findings:** U1, U2, U3, U4, U14 · **Requirements:** R-SET-1, R-SET-2, R-SET-3, R-SET-4, R-SET-6, R-FIRST-1 · **Rulings:** D3
- **Mode:** afk · **Tags:** ui · **Blocked by:** `rotation-layout-and-shell`, `settings-and-schedule-core`
- **Output:** `index.html`, `css/app.css`, `js/settings-ui.js`, `js/main.js`, `js/plex.js`, `tests/plex.test.js`, `js/duration.js`, `tests/duration.test.js`, `js/util.js`, `scripts/mock-plex.mjs`, `sw.js`, `tests/e2e/settings-sheet.spec.mjs`, `tests/e2e/first-run.spec.mjs`
- **Acceptance criteria:**
  1. `test -f tests/plex.test.js && test -f tests/duration.test.js && node --test tests/plex.test.js tests/duration.test.js`  (new `client.libraryCount(key)` reads `totalSize` from a JSON and from an XML container, returns `null` on error or missing attribute, and requests `X-Plex-Container-Start=0` and `X-Plex-Container-Size=0`; `presetFor(seconds)` -> 60/300/900/3600 or `'custom'`; `secondsFromMinutes('2.5')` = 150; below the schema minimum of 10 s clamps; non-numeric returns the previous value)
  2. `npm test`
  3. `npm run test:e2e -- settings-sheet`  (configured settings: `#connected-card` visible with text containing `Connected to Mock Plex`, `Movies` and a **Change** button, `#signin-btn` hidden until Change is pressed; library options read `Movies · 8 titles`; with the mock's count request returning 500 the option reads `Movies` and the connection test still succeeds; Music is not listed; preset buttons set `rotateSeconds` to 60/300/900/3600 on save; Custom with `2.5` saves 150; a stored 420 s opens as Custom showing `7`; `details#advanced` is closed by default and contains `nowPlayingPollSeconds`, `randomPoolSize`, `crossfadeMs`, and a change inside it persists; the rotation field label no longer contains `seconds`; errors: token `bad` -> the empty-state card shows **Sign in again** and pressing it starts a pin request on the intercepted plex.tv route; `mock.down()` -> **Diagnostics** and **Test connection** appear and work; `mock.post('empty')` -> **Turn off "unwatched only"** appears and pressing it saves `unwatchedOnly:false` and refreshes; the connection-test result carries the same buttons)
  4. `npm run test:e2e -- first-run`  (unconfigured, plex.tv intercepted by Playwright `context.route`: without any click `#signin-code-large` shows the code in a computed font size >= 64 px, exactly one `POST /api/v2/pins` was made and Settings is not open; when the intercepted pin expires a new code replaces it and exactly one new pin is created; at rotation 90 the code block's transform angle equals 90; a configured app and a `config.json`-provisioned app (`config.json` intercepted by `context.route`) make no pin request; a plex.tv network failure retries at most once per 30 s with no console error spam; the empty card's **Open settings** still works)
  5. `grep -Eq 'pixelShift: *false' tests/e2e/settings-sheet.spec.mjs tests/e2e/first-run.spec.mjs`
  6. `node scripts/check-precache.mjs`
  7. `grep -q 'totalSize' js/plex.js && grep -q 'id="connected-card"' index.html && grep -q 'id="signin-code-large"' index.html && grep -q 'Sign in again' js/main.js index.html && grep -q 'id="advanced"' index.html`
  8. `test -z "$(git status --porcelain -- js/settings.js js/engine.js js/display.js js/layout.js)"`
- **Notes/hazards:**
  - Merged because these edit the same Settings sheet and empty-state card and share one e2e run. If the dispatch proves too large the conductor may split at the seam "U1-U4 + U2/U3" versus "U14 + first run" (the second depends on the first only through `index.html`).
  - D3: when `isConfigured()` is false and no `config.json` provisioned settings, start the plex.tv PIN flow automatically (reuse `createPin`/`checkPin` in `js/plex.js`; refactor `signIn()` in `js/settings-ui.js` so Settings and the empty card share it), show the code large and upright on the empty-state card, refresh on expiry, and do not force Settings open (today's `boot()` opens it on first run). Network failures back off, no loop. After approval the existing post-sign-in flow runs unchanged. Local-network discovery stays on the Roadmap only.
  - `PlexError.kind` (`auth`, `network`, `timeout`, `http`, `parse`) and `err.kind === 'empty'` already exist; map kind -> actions in one table in `main.js`, reuse it for the empty card, the toast and the test result. `toast()` supports one action; extend `js/util.js` to accept a list of actions.
  - `totalSize` with `X-Plex-Container-Size=0` is **(verify)** against a real server (extended validation). Counts load lazily after the list renders; never block `testConnection()` on them.
  - Storage stays seconds: no migration. The preset group is a radio group with `name` outside the schema (UI-only), mapped in `read()`/`write()`.
  - Mock: `GET /library/sections/{key}/all` with `X-Plex-Container-Size=0` returns `{ MediaContainer: { size: 0, totalSize: 8 } }`; `POST /__mock/counts-fail`, `POST /__mock/empty`, `POST /__mock/nonempty` toggles. The mock keeps its 8 titles.

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: settings-sheet · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: settings-sheet-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
