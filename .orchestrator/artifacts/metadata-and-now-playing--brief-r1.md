# Brief — metadata-and-now-playing r1

Agent name: metadata-and-now-playing-builder-r1 · phase: metadata-and-now-playing · round: r1 · effort: high

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-metadata-and-now-playing` (branch `orch/metadata-and-now-playing` from `f0b3425`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/metadata-and-now-playing--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — metadata-and-now-playing r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Use E2E_PORT=21420 E2E_MOCK_PORT=21421. TDD: write the unit cases for criterion 1 (toPoster fields, formatRuntime, pickNowPlaying from JSON and XML sessions, the engine's latest session snapshot) and tests/e2e/metadata.spec.mjs and tests/e2e/now-playing.spec.mjs (every case in criteria 3 and 4; `pixelShift: false` in their settings) first; watch them fail; then implement in js/plex.js, js/engine.js, js/display.js, js/poster-cache.js, js/main.js, index.html, css/app.css and scripts/mock-plex.mjs exactly as the plan notes say (one linear CSS transition for the progress bar, never a per-frame JS timer; the bar inside #stage, 3 px; cache index stores duration and year only — contentRating is already stored). Paste the pre-implementation failures. Run criteria 1–6 and paste outputs.
Must-fixes the owner routed into this phase (state follow-ups with deadline metadata-and-now-playing; they edit code this phase owns):
- C8I1 (D37, child safety): while a household limit is set, on each online pool load re-fetch the cached titles' ratings with ONE batched `GET /library/metadata/<k1>,<k2>,...` (the cached keys, at most 100), call poster-cache refreshRating for every returned item, and store '' (fails closed: skipped offline under a limit) for every cached key the response does not return. Never treat a title's absence from the random pool as re-rated. The mock must answer the batched request. e2e: cache all 8 titles with no limit, change title 4's rating in the mock to R after caching while its stored rating is still the old lower one, save PG-13, let one online refresh run, `mock.down()` → title 4 is never shown offline.
- K18 (D24): with showNowPlaying on, a 401/403 on /status/sessions must not stop poster rotation (the engine's own now-playing fetch treats a refused sessions call as "nothing playing" and carries on). e2e.
- C8M1 (D28): with showNowPlaying on, a FAILED playback poll must not make decide() fetch /status/sessions a second time in the same tick. e2e counting requests.

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
- The content-rating-filter code just landed: keep every allows()/allowedOnScreen check intact; the overlay must not reveal or draw anything the filter blocks.
- Do not touch js/sleep.js, js/settings.js, js/schedule.js.

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
### 21. `metadata-and-now-playing` — Metadata overlay and playback progress

- **Goal:** An optional overlay of content rating, runtime and year, plus a thin progress bar (and an optional player label) while something plays.
- **Findings:** U9, U10 · **Requirements:** R-NP-1, R-NP-2 · **Rulings:** D1 (U9's player label is kept, default off, Q22)
- **Mode:** afk · **Tags:** ui · **Blocked by:** `content-rating-filter`, `settings-and-schedule-core`
- **Output:** `js/plex.js`, `tests/plex.test.js`, `js/engine.js`, `tests/engine.test.js`, `js/display.js`, `js/poster-cache.js`, `js/main.js`, `index.html`, `css/app.css`, `scripts/mock-plex.mjs`, `tests/e2e/metadata.spec.mjs`, `tests/e2e/now-playing.spec.mjs`
- **Acceptance criteria:**
  1. `test -f tests/plex.test.js && test -f tests/engine.test.js && node --test tests/plex.test.js tests/engine.test.js`  (`toPoster` carries `contentRating`, `duration`, `year` for movies and the series values for episodes; `formatRuntime(8040000)` = `2 h 14 m`, `formatRuntime(2880000)` = `48 m`, missing -> empty; `pickNowPlaying` carries `viewOffset`, `duration`, `playerTitle` (`Player.title`) and paused state from JSON and XML sessions; the engine exposes the latest session snapshot even when it returns `null` because the poster is unchanged)
  2. `npm test`
  3. `npm run test:e2e -- metadata`  (`showMeta:true`: `#title-card` text matches `^PG-13 · 2 h 14 m · 1972$` for mock item 3; missing fields are omitted without stray separators; `showMeta:false` and `showTitle:false` -> hidden; `showTitle:true` alone behaves as in 2.0.0; the poster-cache index entry carries `duration` and `contentRating`, so the overlay also works on an offline cached poster)
  4. `npm run test:e2e -- now-playing`  (`mock.play(3, {offset: 600000, duration: 6000000, player: 'Living Room'})`: `#progress` width is 10% (+-1%) of the poster window; after the next poll with `offset: 1200000` it is 20%; `state=paused` freezes it; `mock.stop()` removes it; `showProgress:false` hides it; `showPlayer:true` shows text `Playing in Living Room`, default hides it; the bar is inside `#stage` and 3 px high)
  5. `grep -Eq 'pixelShift: *false' tests/e2e/now-playing.spec.mjs && grep -q 'name="showMeta"' index.html && grep -q 'id="progress"' index.html`
  6. `node scripts/check-precache.mjs`
- **Notes/hazards:**
  - Merged (r2): both phases edit `toPoster`, `tests/plex.test.js`, the mock and the overlay slot. Export `formatRuntime(ms)` from `js/plex.js`.
  - `viewOffset`, `duration` and `Player.title` in `/status/sessions` are **(verify)** (extended validation). The bar advances between 20 s polls with one linear CSS transition set to the remaining time, never a JS timer per frame; Plex updates `viewOffset` only about every 10 s, so expect a jump on a poll.
  - Mock: add `duration` (ms) and `contentRating` (from `content-rating-filter`) so item 3 is `PG-13`, 8,040,000 ms, 1972; `POST /__mock/play?ratingKey=&offset=&duration=&player=&state=` stores them on the session and returns them in `/status/sessions` (with `Player: { title, state }`).
  - Q22: the "Playing in" label is kept (default off) because D1 does not defer it (ruled, Q22). The bar sits along the bottom edge of the poster window, not on the frame art (frames differ), and moves with pixel shift because it is inside `#stage`.
  - Keep poster-cache index entries small (localStorage): `duration` and `year` only; `summary` is not stored.

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: metadata-and-now-playing · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: metadata-and-now-playing-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
