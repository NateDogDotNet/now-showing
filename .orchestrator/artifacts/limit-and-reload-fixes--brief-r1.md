# Brief — limit-and-reload-fixes r1

Agent name: fixes-builder-r1 · phase: limit-and-reload-fixes · round: r1 · effort: high

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/nathan/wt-limit-and-reload-fixes` (branch `orch/limit-and-reload-fixes` from 6363763). Work ONLY there; never touch `/home/nathan/plex-poster-app` except the two `.orchestrator` paths below. No node_modules in the worktree: `ln -s /home/nathan/plex-poster-app/node_modules node_modules` to run tests and remove the link before you hand back (it must not be staged).
- E2E ports: `E2E_PORT=18480 E2E_MOCK_PORT=18801` (D12). The machine is short on memory: one e2e command at a time; the full suite takes about 16 min, so run single specs (`node tests/e2e/run.mjs content-rating`) while you work and the full suite once at the end.
- Handback: `/home/nathan/plex-poster-app/.orchestrator/artifacts/limit-and-reload-fixes--handback-builder-r1.md`. Questions: append to `/home/nathan/plex-poster-app/.orchestrator/questions.md` as `Q<n> — limit-and-reload-fixes r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Invoke superpowers:test-driven-development (each fix starts with the failing test the criterion names; show it red, then green) and superpowers:verification-before-completion before you hand back. Read `docs/decisions.md` D73, D37, D33 and the review `/home/nathan/plex-poster-app/.orchestrator/artifacts/release-bump--code-review-r1-transcribed.md` first.

## The four findings to fix (verbatim from the review; the conductor confirmed each by reading the code)
- **F1** `js/main.js:238` — A now-playing episode's own contentRating is written into the poster cache under the SHOW's ratingKey (refreshRating here and put() at line 204), so the offline household limit judges a series by one episode's rating.
  Scenario: Household limit PG. Series rated TV-MA is cached from the pool with TV-MA. Someone plays an episode Plex rates TV-PG: toPoster (js/plex.js:134,140) returns ratingKey=grandparentRatingKey with contentRating='TV-PG'; permitted() allows it; tick() calls cache.refreshRating and fetchImage() calls cache.put with that poster, so the index entry for the TV-MA show now reads TV-PG. Plex goes unreachable -> handleFailure -> cache.random(…, 'PG') returns the TV-MA series poster. Inverse: an episode with no contentRating stores '' and hides a correctly rated show offline until the next pool-load recheck (up to 30 min). Fix: never write an episode's rating under the grandparent key (skip refreshRating/put rating for isEpisode posters, or key them by the episode).
- **F5** `js/main.js:1433` — announceWhatsNew treats 'configured and no marker' as an upgrade, but a config.json-provisioned first boot is configured before the marker exists, so a fresh install shows the 'What's new in 2.1' upgrade toast.
  Scenario: Fresh device, serve.mjs with config.json beside index.html. boot(): source==='defaults' and config!==null -> provisionedSettings saved -> isConfigured true. announceWhatsNew(): marker absent -> writes it -> isConfigured -> toasts 'What's new in 2.1' with an 'Open settings' action on a display that has never run 2.0. Fix: write the marker when settings are provisioned (or decide 'upgrade' from load().source === 'stored' before provisioning), not from isConfigured alone.
- **F6** `js/main.js:315` — handleFailure attributes an empty screen to the household limit whenever a limit is set and the error is non-fatal, even when the cache is simply empty, so the empty card gives the wrong reason.
  Scenario: Limit PG set on a display whose cache was just cleared (or a first run that never cached anything). Plex times out (kind 'timeout'): cache.random returns null for lack of entries, display.currentPoster is null, and the card reads 'No posters within the household limit are available while Plex is unreachable.' instead of the timeout message; the owner raises the limit expecting posters to come back. Fix: use the limit wording only when cache.entries() is non-empty but none passed allows(), else show err.message.
- **F7** `js/main.js:1241` — The service-worker 'controllerchange' reload only checks settingsUI.isOpen and bypasses the new reloadMustWait() guard that the daily reload honours (any open dialog, in-flight poster, manual wake, running crossfade).
  Scenario: reg.update() (every 6 h) finds a new version while the PIN dialog or Diagnostics is open, or mid-decode: reloadAutomatically() fires at once, closing the PIN prompt the owner is typing into / losing the manual-wake minute, the exact cases reloadMustWait() was written to avoid for the daily reload. Deeper fix: route the SW-update reload through the same pending/runDailyReload path (reloadPending = 'update') instead of a separate special case.

## Hazards (each is a prohibition)
- Do not change the cache key scheme: an episode's poster stays keyed by its show's ratingKey (one cache entry per show). Fix what rating is stored and when. The household limit fails closed (D37): when the show's rating is unknown offline, the show is hidden, never shown.
- Do not change `VERSION` (already 2.1.0). Do not touch sw.js, index.html, css or js/settings.js.
- Do not loosen `reloadMustWait()` or the daily reload; the SW-update reload must honour the same waits (any open dialog, in-flight poster, TV waking, manual wake, crossfade).
- The e2e harness seeds `plexPoster.whatsNew` by default (tests/e2e/lib.mjs:205, convention 7): criterion 5's cases must opt out of the seed to see the fresh-install path; the "upgraded stored install still shows it" case keeps a stored settings object and no marker.
- `scripts/mock-plex.mjs` is in Output only so a now-playing EPISODE session with its own contentRating (and optionally `grandparentContentRating`) can be served; add the fixture, change no existing behaviour of the mock.
- Match the idioms: plain ES modules, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs` (not editable), the mock helper (`mock.get`/`mock.post`).

Run criteria 1–8 from the worktree root and paste each command's real output tail. Criterion 9 is narrated: quote each finding in the handback with the test that now pins it.

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
### 30. `limit-and-reload-fixes` — Four close-time review fixes that ship in 2.1.0 (D73)

- **Goal:** The offline household limit never judges a show by one episode's rating; a service-worker update reload honours the same wait rules as the daily reload; a fresh config.json install shows no "What's new" upgrade notice; the empty card blames the limit only when the limit is what emptied it.
- **Findings:** release-bump code review r1 findings 1, 7, 5, 6 · **Requirements:** R-RATE (fail closed offline), R-DOC-1 (README claim) · **Rulings:** D73, D37, D33
- **Mode:** afk · **Tags:** risk:high (content limit) · **Blocked by:** `release-bump`
- **Output:** `js/plex.js`, `js/poster-cache.js`, `js/main.js`, `js/engine.js` (only if the fix needs it), `tests/poster-cache.test.js`, `tests/plex.test.js`, `tests/e2e/content-rating.spec.mjs`, `tests/e2e/pi-stability.spec.mjs`, `tests/e2e/preset.spec.mjs`, `tests/e2e/status.spec.mjs`, `scripts/mock-plex.mjs`
- **Acceptance criteria:**
  1. `test -f tests/poster-cache.test.js && node --test tests/poster-cache.test.js`  (new cases: a now-playing episode poster, keyed by its show, never changes the show's stored contentRating through `put` or `refreshRating`; an episode with no rating never stores '' over the show's rating; the show's rating still follows Plex when the SHOW item is seen)
  2. `test -f tests/plex.test.js && node --test tests/plex.test.js`  (an episode's poster descriptor carries the show's rating when Plex sends `grandparentContentRating`, else marks the rating as the episode's so the cache can ignore it; the chosen mechanism is the builder's, the test pins the behaviour)
  3. `npm run test:e2e -- content-rating`  (new case: limit PG, a TV-MA show cached from the pool, a TV-PG episode of it plays, Plex becomes unreachable → the show's poster is NOT shown from the cache; and the inverse: an unrated episode does not hide a PG-rated show offline)
  4. `npm run test:e2e -- pi-stability`  (new case: a new service worker arrives while the PIN prompt is open → no reload until it closes; the reload then happens)
  5. `npm run test:e2e -- preset`  (new case, K60: a fresh boot provisioned from config.json writes `plexPoster.whatsNew` and shows no "What's new" toast; an upgraded stored install still shows it)
  6. `npm run test:e2e -- status`  (new case: limit set, empty cache, Plex times out → the empty card shows the timeout message, not the household-limit wording; with cached posters all above the limit → the limit wording)
  7. `npm test && npm run test:e2e && node scripts/check-precache.mjs`
  8. `test -z "$(git status --porcelain --untracked-files=all | awk '{print $2}' | grep -v '^\.orchestrator/' | grep -vxE '(js/plex.js|js/poster-cache.js|js/main.js|js/engine.js|tests/poster-cache.test.js|tests/plex.test.js|tests/e2e/content-rating.spec.mjs|tests/e2e/pi-stability.spec.mjs|tests/e2e/preset.spec.mjs|tests/e2e/status.spec.mjs|scripts/mock-plex.mjs)')"`  (nothing else changed; `VERSION` stays 2.1.0)
  9. narrated: cold and anchored reviews (risk:high); each of the four review findings is quoted in the handback with the test that now pins it.
- **Notes/hazards:**
  - Do not change the cache key scheme (posters stay keyed by the show's ratingKey so an episode's poster and the show's poster are one cache entry); fix what rating is stored and when, not the key.
  - `VERSION` is already 2.1.0 (release-bump); do not bump it. The fixes are part of 2.1.0, which is not yet published (D13).
  - The Roadmap's 2.1.x polish bullet for the What's new e2e (K60) is delivered by criterion 5; release-bump's Roadmap text may be amended in the close tail, not here.

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: limit-and-reload-fixes · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <anything done differently from the brief, or none>
questions: <ids or none>
```
Then a blank line, `Agent: fixes-builder-r1 · dispatched: 2026-10-14T22:19:21Z`, then each acceptance command with its real output tail, and for criterion 9 the four findings each with its pinning test.
