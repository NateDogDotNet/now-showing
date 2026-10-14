# Brief — release-bump r1

Agent name: release-builder-r1 · phase: release-bump · round: r1 · effort: high

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/nathan/wt-release-bump` (branch `orch/release-bump` from fdcf53d). Work ONLY there; never touch `/home/nathan/plex-poster-app` except the two `.orchestrator` paths below. The worktree has no node_modules: `ln -s /home/nathan/plex-poster-app/node_modules node_modules` to run tests and remove the link before you hand back (it must not be staged).
- E2E ports: `E2E_PORT=18380 E2E_MOCK_PORT=18701` (D12). The machine is short on memory: one e2e command at a time, never in parallel; the full suite takes about 16 min.
- Handback: `/home/nathan/plex-poster-app/.orchestrator/artifacts/release-bump--handback-builder-r1.md`. Questions: append to `/home/nathan/plex-poster-app/.orchestrator/questions.md` as `Q<n> — release-bump r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Invoke superpowers:test-driven-development for `tests/e2e/release.spec.mjs` (model it on `tests/e2e/pi-stability.spec.mjs` lines ~180–210, which already runs with `serviceWorkers: 'allow'`) and superpowers:verification-before-completion before you hand back.

Three jobs, all in this phase:
1. **Version 2.1.0** in `sw.js`, `js/main.js`, `package.json` and `package-lock.json` (both `version` and `packages[""].version`; edit the lockfile by hand or with `npm version --no-git-tag-version 2.1.0`, then check nothing else in it changed). Criterion 1 is the test. Write `tests/e2e/release.spec.mjs` as criterion 5 describes.
2. **README.md: update the (verify) tags from the validation results (K61, D48).** Read `docs/validation/real-server-core.md` (17 PASS) and `docs/validation/real-server-extended.md` (15 PASS, 12 Pi rows SKIPPED) and change only what a passing row proves:
   - The status banner (README line 11): the real-server validation is done (2026-10-14, against a real Plex Media Server, core 17/17 and extended 15/15 non-Pi rows); the Raspberry Pi validation is still pending (rows V1-E11 to E22 skipped, no Pi); "(verify)" from here on means "not yet verified on a Raspberry Pi".
   - Line 144: `*.plex.direct` from outside the home (V1-E24) and the relay fallback (V1-E25) are verified; say so instead of "not yet verified".
   - Line 358: the contentRating parameter name and multi-value syntax (V1-E03) and the batched rating re-check (V1-E27) are verified; the country-prefixed values could NOT be exercised (V1-E04: the test server has none), so that part stays tagged.
   - Line 348 (managed user): unchanged; no managed user was tested.
   - Every Pi item stays tagged (lines 150–156, 227, 249, 258, 268–279, 300–307, 377, 405): nothing ran on a Pi.
   - The docs r3 review's two optional wording fixes (`.orchestrator/artifacts/docs--review-r3.md` lines 42–43, D48): the daily-reload sentence says the reload waits while ANY dialog is open (Settings, Diagnostics, the PIN prompt, the shortcuts list; code `js/main.js` `document.querySelector('dialog[open]')`), and "by a key or a touch" becomes "a key, touch or click" (manualWake listens on pointerdown).
3. **Roadmap.md: the owner's 2026-10-14 requests, D51–D71 in `docs/decisions.md`.** Each D-entry is the spec for its entry; write them as Roadmap entries in the Roadmap's existing voice (a heading, one or two sentences, then **Why** / **How** / **Constraints** bullets where the D-entry gives them), merging where the D-entry says to merge and keeping the old names inside the merged entry (D57 note: "Remote control", "Frame per poster source", "Synchronised displays", "Shared settings for several displays", "Multiple libraries", "Collections & filters", "Now showing theatre mode", "Coming soon mode" must still appear as text, so the done `docs` phase's criterion 6 keeps passing). Add the "## Suggested order" section D53 describes, placed with D64–D71's order notes. Drop "(K60)" from the 2.1.x polish line. Update the "Done in 2.1" paragraph (real-server validation done; Pi pending) and the "Validate on the real server early" backlog entry (done; say so or remove it). Criterion 9 greps every entry name; run it.

Hazards (each is a prohibition):
- Change no behaviour and no file outside Output. `VERSION` changes here and nowhere else.
- Untag nothing a passing row does not prove. A SKIPPED row proves nothing.
- Do not promise anything in the Roadmap a D-entry marks (verify) or unconfirmed (TMDB/IMDb terms, Google Photos/iCloud, Hubitat/Homey/SmartThings/HomeKit, Plex theme and watchlist APIs); carry the caveat into the entry.
- Do not edit docs/, the plan, the spec or docs/decisions.md.
- The README's "Formerly Plex Poster Display" line stays as it is (criterion 2 of the done rename phase allows the old name once).

Run criteria 1–7 and 9 from the worktree root and paste each command's real output tail. Criterion 7 passes only when exactly the seven Output files are modified and nothing else (no node_modules link, no stray file). Criteria 4–6 are the full suite; run them once after everything else passes.

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

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
### 26. `release-bump` — Bump the version once; the release gate

- **Goal:** Set `VERSION` to 2.1.0 in `sw.js`, `js/main.js` and `package.json` (and the lockfile) so installed clients update, only after the token is rotated and both real-server validations PASS.
- **Findings:** — · **Requirements:** R-REL-1 · **Rulings:** D11, D13, D16
- **Mode:** afk · **Tags:** — · **Blocked by:** `docs`, `rotate-plex-token`, `real-server-validation`, `real-server-validation-extended`, `rename-now-showing` (D52)
- **Output:** `sw.js`, `js/main.js`, `package.json`, `package-lock.json`, `tests/e2e/release.spec.mjs`, `README.md`, `Roadmap.md` (D48: follow-up K61 and the docs r3 wording)
- **Acceptance criteria:**
  1. `node -e "const fs=require('fs');const g=(f)=>fs.readFileSync(f,'utf8').match(/VERSION = '([^']+)'/)[1];const a=g('sw.js'),b=g('js/main.js'),p=require('./package.json'),l=require('./package-lock.json');if(!(a===b&&b===p.version&&a==='2.1.0'&&l.version==='2.1.0'&&l.packages[''].version==='2.1.0')){console.error(a,b,p.version,l.version);process.exit(1)}"`
  2. `test -f docs/security/token-rotation.md && grep -qx 'Rotated: yes' docs/security/token-rotation.md`  (D11: token rotated)
  3. `for f in docs/validation/real-server-core.md docs/validation/real-server-extended.md; do test -f "$f" && grep -qx 'Overall: PASS' "$f" && ! grep -q 'PENDING' "$f" || { echo "validation not PASS: $f"; exit 1; }; done`  (D11: both validation files PASS; a FAIL or PENDING blocks the release)
  4. `npm test`
  5. `npm run test:e2e`  (includes `release.spec.mjs`: with service workers enabled, a stale `shell-2.0.0` cache is created in the page before registration, then after activation `shell-2.1.0` exists and `shell-2.0.0` is gone)
  6. `node scripts/check-precache.mjs`
  7. `test "$(git status --porcelain --untracked-files=all | awk '{print $2}' | grep -v '^\.orchestrator/' | LC_ALL=C sort | tr '\n' ' ')" = "README.md Roadmap.md js/main.js package-lock.json package.json sw.js tests/e2e/release.spec.mjs "`  (nothing else changed; the tracked `.orchestrator/` snapshot is the conductor's, D48)
  9. `grep -Eqi 'play ?list' Roadmap.md && grep -Eqi 'jellyfin|emby|other media servers' Roadmap.md && grep -qi 'TMDB\|The Movie Database' Roadmap.md && grep -qi '^## .*Suggested order' Roadmap.md && grep -qi 'Now Playing' Roadmap.md && grep -qi 'Coming Soon' Roadmap.md && grep -qi 'marquee' Roadmap.md && grep -qi 'Touch gestures' Roadmap.md && grep -qi 'Favourites\|Favorites' Roadmap.md && grep -qi 'Watch later' Roadmap.md && grep -qi 'Multiple displays' Roadmap.md && grep -qi 'Mirror' Roadmap.md && grep -qi 'Chain' Roadmap.md && grep -qi 'Controller' Roadmap.md && grep -q 'PIN-locked' Roadmap.md && grep -qi 'Frame and marquee styles' Roadmap.md && grep -qi 'Rating schedule' Roadmap.md && grep -qi 'Poster selection' Roadmap.md && grep -qi 'genre' Roadmap.md && grep -qi 'multi-select' Roadmap.md && grep -qi 'Theme music' Roadmap.md && grep -qi 'Poster transitions' Roadmap.md && grep -qi 'smart collection' Roadmap.md && for k in 'Movie-night countdown' 'Clear-logo marquees' 'Poster artwork sources' 'Viewer profiles' 'Birthday and occasion mode' 'Weighting and no repeats' 'On this day' 'Info captions' 'Ambient light sync' 'QR code to the title' 'Play now' 'Find a poster' 'Recently shown' 'Allowed devices' 'colour matte' 'smart crop' 'Browse first mode' 'Browse button' 'Home controls' 'Picture frame mode' 'screen saver'; do grep -qiF -- "$k" Roadmap.md || { echo "roadmap missing: $k"; exit 1; }; done`  (D51: the playlist, other-media-server and no-server (TMDB) ideas are on the Roadmap; D53: the suggested build order section; D54: the marquee caption entry; D56: the touch gestures entry; D57: the multiple-displays entry, which keeps D7's PIN-locked constraint; D58: the built-in style pack entry; D59: the rating schedule entry; D60: the poster selection entry; D61: the theme music entry; D62: the poster transitions entry; D63: metadata rules in the poster selection entry; D64: the ten suggested entries; D65: the play now entry; D66: the find a poster entry; D67: gap fill inside the frame; D68: the browse first mode entry; D69: the home controls entry; D70: the picture frame mode entry; D71: home controls as a main screen)
  8. narrated: the close-time reviews (full `code-review` of `46257c3..HEAD`, `security-scan` over the repo, `dependency-audit` of the devDependencies, `scrub-pii` on `docs/validation/*` and `docs/security/*`) are the conductor's Step 8 close work; this plan has no `publish` tag (D13).
- **Notes/hazards:**
  - Decision (D16): one bump here, not per phase, for clean releases (the r1 rationale that per-phase bumps would reload clients was wrong: any `sw.js` edit already triggers an update).
  - The release path includes the four D11 prerequisites only; optional and deferred phases (including `purge-git-history`) never block it. `release-bump` is blocked by `rotate-plex-token`, `real-server-validation` and `real-server-validation-extended`, so a FAIL in either file cannot pass criterion 3.
  - Closes M4 and the whole run: `npm test`, `npm run test:e2e` and the precache check are the final full-suite evidence (criteria 4-6), replacing the r1 gate phases.
  - Do not tag, push or publish anything: the conductor pushes the working branch only (D13); a PR or merge happens only when the owner asks.

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: release-bump · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: release-builder-r1 · dispatched: 2026-10-14T21:24:12Z`, then each acceptance command with its real output tail, and the list of README tags you removed and kept (criterion 8).
