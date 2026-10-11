# Brief — content-rating-filter r1

Agent name: content-rating-filter-builder-r1 · phase: content-rating-filter · round: r1 · effort: high

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-content-rating-filter` (branch `orch/content-rating-filter` from `e9394ec`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/content-rating-filter--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — content-rating-filter r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Use E2E_PORT=19420 E2E_MOCK_PORT=19421. TDD: write tests/ratings.test.js and the new cases in tests/plex.test.js, tests/engine.test.js and tests/poster-cache.test.js first (every item in criterion 1), watch them fail, then implement js/ratings.js (the ladder and the country-prefix table from Q19 — read the conductor rulings at the end of .orchestrator/questions.md), then wire plex.js (`toPoster` gains `contentRating`; `pool()` sends the contentRating value list and X-Plex-Container-Size = 3 × pool size capped at 500 when a limit is set), engine.js (client-side ladder ALWAYS applied — it is the guarantee; pool cache key includes the limit; empty → `empty` error with a 'raise the limit' hint; now-playing above the limit or unrated = nothing playing unless `limitNowPlaying:false`; an owner-pinned poster is exempt), poster-cache.js (the index entry stores `contentRating`; `random()` skips entries above the limit and entries without a stored rating while a limit is set) and the mock (8 titles keep their titles; add G, PG, PG-13, R, TV-MA, gb/12, gb/15, none; honour a `contentRating=` value list strictly). Then write tests/e2e/content-rating.spec.mjs (every case in criterion 3) and watch it fail before wiring index.html (`id="household-toggle"`, the rating select defaulting to PG-13, `name="limitNowPlaying"` shown only while a limit is set), js/settings-ui.js, js/main.js, css/app.css and sw.js (precache js/ratings.js). Paste both pre-implementation failures in the handback. Run criteria 1–5 and paste outputs.
Must-fixes carried into this phase by the owner (docs/decisions.md D21 K5 and D28 A8-d; both live in code this phase owns):
- K5: the OFFLINE fallback `cache.random()` in js/main.js handleFailure must not show a cached poster that fails to decode (drop that entry, as the online heal path does, and try another or none — no loop). Test it (unit or e2e).
- A8-d: in tick()'s cached-poster heal path (the second, skipCache download after a decode failure), do not draw the re-downloaded poster if sleep began during that download (check `state.asleep` again before the second `display.show`). Test it (e2e, like sleep case 21).

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
- risk:high (child-safety guarantee): reviewers will try every route to show an above-limit title (criterion 6). Keep the client-side check the single source of truth and readable.
- Do not touch js/sleep.js, js/settings.js or js/schedule.js. The settings keys maxContentRating and limitNowPlaying already exist (js/settings.js).

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
### 13. `content-rating-filter` — Household content limit

- **Goal:** With the "Household with children" toggle on, random posters, cached offline posters and now-playing never exceed the chosen rating; unrated and unmapped values are excluded.
- **Findings:** E14 · **Requirements:** R-FILT-1 · **Rulings:** D5
- **Mode:** afk · **Tags:** ui, risk:high · **Blocked by:** `settings-and-schedule-core`, `cache-first-fetch`
- **Output:** `js/ratings.js`, `tests/ratings.test.js`, `js/plex.js`, `tests/plex.test.js`, `js/engine.js`, `tests/engine.test.js`, `js/poster-cache.js`, `tests/poster-cache.test.js`, `js/main.js`, `js/settings-ui.js`, `scripts/mock-plex.mjs`, `index.html`, `css/app.css`, `sw.js`, `tests/e2e/content-rating.spec.mjs`
- **Acceptance criteria:**
  1. `test -f tests/ratings.test.js && test -f tests/plex.test.js && test -f tests/engine.test.js && test -f tests/poster-cache.test.js && node --test tests/ratings.test.js tests/plex.test.js tests/engine.test.js tests/poster-cache.test.js`  (ladder rank for each rung incl. `TV-Y`, `TV-Y7`, `TV-G`, `TV-PG`, `TV-14`, `TV-MA`; every row of the country-prefix table (`gb/`, `de/`, `au/`, `ca/`, `fr/`, `nl/`); `gb/XX`, empty and missing excluded when a limit is set and kept when `''`; `pool()` requests `X-Plex-Container-Size` = 3x pool size capped 500 when a limit is set; the request value list for `PG-13` contains every allowed ladder value and every mapped prefixed value at or below it (`gb/12`, `gb/12A`, `de/12`, `fr/12`, `au/M`, `ca/14A`, `nl/12`) and nothing above (no `R`, `gb/15`); the pool cache key changes with the limit; empty result throws the `empty` error with a 'raise the limit' hint; `cache.random()` skips entries above the limit and entries without a stored rating while a limit is set; the poster-cache index entry stores `contentRating`; now-playing above the limit or unrated is treated as nothing playing, unless `limitNowPlaying:false`; an owner-pinned poster is exempt)
  2. `npm test`
  3. `npm run test:e2e -- content-rating`  (the mock's 8 titles carry G, PG, PG-13, R, TV-MA, `gb/12`, `gb/15` and no rating; with `maxContentRating:'PG-13'` the library request (`page.on('request')`) lists `gb/12` among its `contentRating` values and 50 refreshes show only titles 1, 2, 3 and 6 (read from the active poster layer's `alt`); with `'R'` titles 4 and 5 also appear; with `''` all 8 appear; cached-poster case: show title 4 with no limit, then set `PG-13` and `mock.down()`: 20 offline rotations never show title 4; now-playing case: `mock.play(4)` under `PG-13` does not display title 4, and with `limitNowPlaying:false` it does; the "Household with children" toggle in Settings sets and clears `maxContentRating`, defaulting to `PG-13`)
  4. `node scripts/check-precache.mjs`
  5. `grep -q 'contentRating' js/plex.js && grep -q 'contentRating' js/poster-cache.js && grep -q 'name="limitNowPlaying"' index.html && grep -q 'id="household-toggle"' index.html`
  6. narrated: independent reviewer (risk:high, the child-safety guarantee) tries to show an above-limit title by every route: random, offline cache, now-playing, a cached pre-2.1 entry, a pinned poster (must be allowed), Plex ignoring the filter parameter.
- **Notes/hazards:**
  - D5. The client-side ladder is the guarantee and is always applied, so a wrong server parameter cannot leak an R title. The Plex request parameter and multi-value syntax are **(verify)**. The country table is ruled (Q19); real stored strings are checked in `real-server-validation-extended`.
  - The limit is its own "Household with children" toggle (UI-only; on reveals the select defaulting to `PG-13`; off stores `maxContentRating: ''`) and is **not** part of the protection preset. `limitNowPlaying` (default true) is shown only while a limit is set.
  - `toPoster` gains `contentRating` here; `metadata-and-now-playing` reads it. The poster-cache index entry gains `contentRating` (this phase owns `js/poster-cache.js`, after `cache-first-fetch`). Entries cached before 2.1 have none and are skipped while a limit is set.
  - Mock: add `contentRating` to the existing 8 `MOVIES` (G, PG, PG-13, R, TV-MA, `gb/12`, `gb/15`, none); honour a `contentRating=` comma-separated value list on `/library/sections/1/all` strictly (a title whose rating is not in the list is dropped, so a request list missing `gb/12` fails the PG-13 e2e), the way Plex is believed to **(verify)**; still ignore unknown params. The mock keeps exactly 8 titles.
  - Ladder: `G=TV-Y=TV-G < PG=TV-Y7=TV-PG < PG-13=TV-14 < R=TV-MA < NC-17`; a rating on the same rung as the limit is allowed (`R` allows `TV-MA`).

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: content-rating-filter · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: content-rating-filter-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
