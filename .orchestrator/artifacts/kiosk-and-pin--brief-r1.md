# Brief — kiosk-and-pin r1

Agent name: kiosk-and-pin-builder-r1 · phase: kiosk-and-pin · round: r1 · effort: high

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-kiosk-and-pin` (branch `orch/kiosk-and-pin` from `9263977`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/kiosk-and-pin--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — kiosk-and-pin r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Use E2E_PORT=22420 E2E_MOCK_PORT=22421. TDD: write tests/kiosk.test.js (every case in criterion 1, pure functions in js/kiosk.js: salted hash/verify with Web Crypto SHA-256 and a small pure-JS SHA-256 fallback when `crypto.subtle` is missing — test the fallback against known SHA-256 vectors; lockout 5 failures → 60 s, doubling to 15 min max, cleared on success; `cornerZone(rotation, viewport)` = the viewer's bottom-right 96x96 at 0/90/180/270; a hold-timer helper that cancels on > 12 px movement or early release; `shouldResetPin(config)` true only for `{resetPin: true}`) and tests/e2e/kiosk.spec.mjs (every case in criterion 3; seed `pixelShift: false`) first; watch both fail, paste the failures; then implement.
Design constraints (plan notes, D10, D16, Q21):
- ONE gate: `requestSettings()`, `requestDiagnostics()`, and the import / reset / token-reveal paths all go through the PIN check; the `s` key, the Settings button, `d`, any `data-action` dispatch, and the token toggle use them — no path opens Settings/Diagnostics/import/reset/token without the PIN when one is set (the risk:high reviewer will try keyboard, Tab focus, synthetic `data-action` clicks, URL tricks, a long-press without release).
- kioskMode: controls never get `.visible` from pointer/tap/key and are `inert` (unfocusable); a 3 s pointer hold in cornerZone (pointerdown/pointerup/pointercancel; positioned with `--ui-rotation`) or a 3 s Enter hold (keydown timing, cancel on keyup; works with disableShortcuts) reveals them for 15 s. disableShortcuts ignores s, d, r, p, o, f, space.
- PIN dialog `#pin-dialog` (top-layer, rotates with the UI like the other dialogs, D2) with an on-screen keypad usable by touch; the UI says the PIN is a deterrent (the word "deterrent" in index.html and js/kiosk.js), not security. PIN set/clear lives in Settings. `#token-toggle` asks for the PIN and the token field re-hides when the sheet closes.
- Lockout state in memory plus localStorage `plexPoster.pinLock` (survives reload; not a security boundary).
- PIN reset: fetch `config.json` on EVERY load (today loadProvisionedConfig runs only on first run — keep first-run provisioning as is, add the reset check on every load); while it serves `{"resetPin": true}`, clear settingsPinHash/settingsPinSalt and open Settings without a PIN; Diagnostics shows `PIN reset flag present` while it is served. No network reset path of any kind.
- Export with 'include token' never contains PIN material and an imported file's PIN material is ignored (NEVER_EXPORT_KEYS in js/settings.js already exists — verify, do not edit js/settings.js).
- Must keep working with what landed: sleep's input swallowing (a press that wakes from sleep is swallowed), the settings sheet's live preview, the status dot, rotation of dialogs.
Run criteria 1–6 and paste outputs.

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
- risk:high: keep the change minimal and readable; reviewers (anchored + cold) will attack every path to Settings, Diagnostics, import, reset and the token.
- Do not touch js/settings.js, js/display.js, js/sleep.js, js/brightness.js or scripts/serve.mjs (the loopback guard is serve-config-guard's, already landed).

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
### 14. `kiosk-and-pin` — Kiosk mode, settings PIN, recovery

- **Goal:** Hide the controls entirely, reveal them by a 3 s corner hold or a 3 s Enter hold, gate settings and token reveal behind an optional PIN, and allow a loopback-only PIN reset.
- **Findings:** E12, E16 · **Requirements:** R-KIOSK-1, R-KIOSK-2 · **Rulings:** D10, D16
- **Mode:** afk · **Tags:** ui, risk:high · **Blocked by:** `rotation-layout-and-shell`, `settings-and-schedule-core`
- **Output:** `js/kiosk.js`, `tests/kiosk.test.js`, `js/main.js`, `js/settings-ui.js`, `index.html`, `css/app.css`, `sw.js`, `tests/e2e/kiosk.spec.mjs`
- **Acceptance criteria:**
  1. `test -f tests/kiosk.test.js && node --test tests/kiosk.test.js`  (hash/verify round trip with salt; wrong PIN fails; lockout: 5 failures lock 60 s, doubling to 15 min, clears on success; fallback hasher used when `crypto.subtle` is missing; `cornerZone(rotation, viewport)` returns the viewer's bottom-right 96x96 region for 0/90/180/270; hold timer cancels on movement > 12 px or early release; `shouldResetPin(config)` is true only for `{resetPin: true}`)
  2. `npm test`
  3. `npm run test:e2e -- kiosk`  (`kioskMode:true`: pointer move, tap and key press never add `.visible` to `#controls`, and the controls are `inert`; a 3 s press in the corner does, for 15 s, at rotation 0 and 90; holding Enter for 3 s does, including with `disableShortcuts:true`; with a PIN set, `s` and the Settings button show the PIN dialog (at rotation 90 `#pin-dialog`'s computed transform angle is 90 and its bounding box lies inside the viewport); a wrong PIN keeps Settings closed; the correct PIN opens it; `#token-toggle` asks for the PIN and the field re-hides when the sheet closes; `disableShortcuts:true` ignores `s`, `d`, `r`, `p`, `o`, `f`, space; the PIN dialog has an on-screen keypad usable by touch; export with 'include token' contains no PIN material and an import file carrying PIN material is ignored; with `config.json` intercepted by `context.route` to `{"resetPin": true}` Settings opens without a PIN and `localStorage` holds no PIN hash or salt, and without the flag the PIN stays; Diagnostics shows `PIN reset flag present` while the flag is served)
  4. `node scripts/check-precache.mjs`
  5. `grep -q 'name="kioskMode"' index.html && grep -q 'id="pin-dialog"' index.html`
  6. `grep -q 'deterrent' index.html js/kiosk.js`  (the UI states the PIN is deterrence, D16)
  7. narrated: independent reviewer (risk:high) tries to reach settings, Diagnostics, import, reset or the token without the PIN (keyboard, URL, Tab focus into hidden controls, `data-action` click via dispatch, long-press without release), and tries to trigger `resetPin` from a non-loopback origin (the server refuses `config.json`; verified in `serve-config-guard`).
- **Notes/hazards:**
  - D10 and Q21 (ruled): the PIN reset works through a loopback-only `config.json` flag `{"resetPin": true}`, fetched on **every** load (not only first run) and honoured while present; Diagnostics warns while the flag is present and the README says to remove it afterwards. Do not add a network reset path.
  - The PIN is deterrence only (D16); the UI and README say so. Hash with salted SHA-256 via Web Crypto (requires a secure context; `localhost` and https qualify), fall back to a small pure-JS SHA-256 on plain-http LAN origins.
  - Hidden controls must also be unfocusable (`inert` or `display:none`) in kiosk mode, otherwise Tab reaches them.
  - Hold detection uses pointer events (`pointerdown`/`pointerup`/`pointercancel`) so it works for mouse, touch and pen, plus `keydown` Enter timing for remotes (cancel on `keyup`). Place the zone with the `--ui-rotation` variable the shell uses.
  - `s` key and the Settings button both route through one `requestSettings()` that applies the PIN gate; same for Diagnostics, import and reset.
  - Lockout state is kept in memory plus `localStorage` (`plexPoster.pinLock`) so a reload does not reset it; this is not a security boundary.

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: kiosk-and-pin · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: kiosk-and-pin-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
