# Brief — validation-checklists r1

Agent name: validation-checklists-builder-r1 · phase: validation-checklists · round: r1

You are the `orchestrator-builder` for exactly one phase of `docs/integration-plan.md`, driven by the integration-orchestrator conductor. Follow your agent definition (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- **Worktree:** `/home/user/wt-validation-checklists` (branch `orch/validation-checklists`, based on `0f1f82e`). Work ONLY there. `cd /home/user/wt-validation-checklists` first; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Ports: (docs only). Any extra server you or a test starts must use a free port (D12).
- Handback: write `/home/user/plex-poster-app/.orchestrator/artifacts/validation-checklists--handback-builder-r1.md` (absolute path; the worktree has no `.orchestrator/`).
- Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — validation-checklists r1: where · why it matters · work held · proposed reading`.
- `git add` exactly your Output files in the worktree. **Do not commit.**

## Process
Read docs/spec.md fully and collect every (verify) item and every R-VAL-1/R-VAL-2 row; verification before completion.
These are templates a human fills in; write precise, copy-pasteable steps. Never include a real token, URL with a token, or an example token-like string.

## Binding rulings
`docs/decisions.md` D1–D16 bind (read it). Read `CLAUDE.md` if present (none in this repo), `README.md`, and the code you touch plus two neighbouring files to match idioms (plain ES modules, no build step, `node --test`, comment density like the existing code).

## Hard rules
- Touch only the phase's **Output** paths below. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name. A behaviour question goes to questions.md.
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
### 8. `validation-checklists` — Real-server validation checklists

- **Goal:** Create the two result templates a human fills in against a real Plex server, listing every (verify) item.
- **Findings:** V1 · **Requirements:** R-VAL-1, R-VAL-2 · **Rulings:** D11
- **Mode:** afk · **Tags:** docs · **Blocked by:** none
- **Output:** `docs/validation/real-server-core.md`, `docs/validation/real-server-extended.md`
- **Acceptance criteria:**
  1. `test "$(grep -c 'PENDING' docs/validation/real-server-core.md)" -ge 10 && test "$(grep -c 'PENDING' docs/validation/real-server-extended.md)" -ge 14`
  2. `grep -qx 'Overall: PENDING' docs/validation/real-server-core.md && grep -qx 'Overall: PENDING' docs/validation/real-server-extended.md`
  3. `for k in 'plex.tv/link' 'Sign in with Plex' firstReachable CORS '/photo/:/transcode' '/status/sessions' 'plex.direct' 'Image mode'; do grep -qF -- "$k" docs/validation/real-server-core.md || { echo "core missing: $k"; exit 1; }; done`
  4. `for k in 'first-run code' contentRating 'gb/' totalSize viewOffset Player.title overscroll-history-navigation disable-pinch DeveloperToolsAvailability chromium-browser 'cec-ctl' 'cec-client' wlr-randr WAYLAND_DISPLAY 'power cycle' thermal_zone0 'disk-cache-dir' 'Authorized Devices' 'Sign out of connected devices' 'Wake Lock'; do grep -qF -- "$k" docs/validation/real-server-extended.md || { echo "extended missing: $k"; exit 1; }; done`
  5. `test -f docs/validation/real-server-core.md && test -f docs/validation/real-server-extended.md && ! grep -Eq 'X-Plex-Token[=:] *[A-Za-z0-9_-]{15,}' docs/validation/real-server-core.md docs/validation/real-server-extended.md`
  6. `for f in docs/validation/real-server-core.md docs/validation/real-server-extended.md; do grep -qxF 'Result values: PASS | FAIL (<phase to reopen>) | SKIPPED (<reason>, extended Pi rows only)' "$f" || exit 1; done`
  7. narrated: `/doc-review` of both files: each item has an ID, exact steps, expected result, `Result: PENDING`, `Notes:`.
- **Notes/hazards:**
  - Item format: `- [ ] V1-C03 — <step> — expected: <result> — Result: PENDING — Notes:` ; end of file `Overall: PENDING`. The human replaces each PENDING with PASS/FAIL and the last line with `Overall: PASS`. **Only `Overall: PASS` closes a validation phase (D11);** a FAIL names the phase to reopen.
  - Core: PIN sign-in at plex.tv/link through the Sign in with Plex button (not the automatic first-run code, which `settings-sheet` builds later and the extended file checks), multi-server discovery and the connection `firstReachable` picks (LAN http vs `*.plex.direct` https), token/URL test, library list, `/status/sessions` while playing and paused, blob download of `/photo/:/transcode` without CORS error (Diagnostics shows `Image mode: downloaded + cached`, not `direct`), 24 h soak note.
  - Extended: a `first-run code` row (an unconfigured display shows the code without a click and approving it at plex.tv/link signs in; R-FIRST-1, built by `settings-sheet`, which blocks the extended phase) and every (verify) in the spec's list, including real country-prefixed `contentRating` values and a "window still full-screen and playback wakes after a power cycle" row; Pi-hardware rows marked `skip if no Pi` may end `SKIPPED`.
  - Secrets rule printed at the top of both files: never paste a token or a full `X-Plex-Token` URL.

## Handback header (first lines of your report, every field filled)
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: validation-checklists · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
First body line: `Agent: validation-checklists-builder-r1 · dispatched: <stamp given in your prompt>`. Then each acceptance command with its real output tail.
