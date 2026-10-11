# Brief — cache-first-fetch r1

Agent name: cache-first-fetch-builder-r1 · phase: cache-first-fetch · round: r1 · effort: medium

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-cache-first-fetch` (branch `orch/cache-first-fetch` from `33976fe`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/cache-first-fetch--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — cache-first-fetch r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Use E2E_PORT=18620 E2E_MOCK_PORT=18621. TDD: write `tests/poster-cache.test.js` (every case in criterion 1 with fake `caches`/`storage`) and `tests/e2e/cache-first.spec.mjs` first, watch them fail, then implement cache-first in `js/main.js` `fetchImage` and `js/poster-cache.js` (validity: same thumb AND stored width >= requested; lazy limit; no index re-order or `cache.put` on a hit) and the mock's `/__mock/stats` + `/__mock/reset-stats`. Run criteria 1–4 and paste outputs. The mock keeps exactly 8 titles.

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
### 6. `cache-first-fetch` — Cache-first poster fetch

- **Goal:** `fetchImage()` serves posters from `poster-cache.js` when it already holds them and only downloads/writes on a miss.
- **Findings:** F3, E8 · **Requirements:** R-CACHE-1, R-CACHE-2 · **Rulings:** D6
- **Mode:** afk · **Tags:** — · **Blocked by:** `e2e-harness`, `settings-and-schedule-core`
- **Output:** `js/main.js`, `js/poster-cache.js`, `scripts/mock-plex.mjs`, `tests/poster-cache.test.js`, `tests/e2e/cache-first.spec.mjs`
- **Acceptance criteria:**
  1. `test -f tests/poster-cache.test.js && node --test tests/poster-cache.test.js`  (fake `caches` and `storage`: hit, miss, thumb changed -> miss, stored size smaller than requested -> miss, stored size larger -> hit, `get` throwing -> miss, limit as a function re-read on each `put`, eviction deletes the evicted entries)
  2. `npm test`
  3. `npm run test:e2e -- cache-first`  (mock `GET /__mock/stats` returns `{transcode:n}`; show the 8 mock posters 3 times each using the refresh control: `transcode <= 8` and a `Cache.prototype.put` counter installed by `addInitScript` `<= 8`; after a page reload and `POST /__mock/reset-stats`, showing the same 8 again produces `transcode == 0`)
  4. `test -z "$(git status --porcelain -- index.html css sw.js)"`
- **Notes/hazards:**
  - Validity rule: cached `thumb === poster.thumb` AND cached width >= requested width (`requestSize()` rounds up to 100 px steps). `put()` records `width`/`height` in the index entry. A hit does not call `cache.put`, so no SD write; do not re-order the index on hit (that would write `localStorage` every rotation).
  - Lazy limit: `createPosterCache({ limit })` accepts a number or a function; `main.js` passes `() => state.settings.posterCacheLimit`. Default 100 with the default pool of 100 means steady state is all hits. `cache.random()` (offline fallback) is unchanged here; `content-rating-filter` extends it.
  - Mock additions: `GET /__mock/stats` -> `{transcode, other}` counting `/photo/:/transcode` hits; `POST /__mock/reset-stats`. The mock keeps exactly 8 titles; later phases add fields, not titles.
  - `directImages` (CORS-blocked) mode is untouched and still bypasses the cache; Diagnostics already reports it. V1 checks real CORS behaviour.
  - Hazard: `fetchImage` is called before `display.show`; keep the `AbortSignal.timeout(20000)` on the network path.

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: cache-first-fetch · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: cache-first-fetch-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
