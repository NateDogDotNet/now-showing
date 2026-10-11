# Brief — docs r1

Agent name: docs-builder-r1 · phase: docs · round: r1 · effort: high

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-docs` (branch `orch/docs` from `bbb2e47`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/docs--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — docs r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Edit ONLY README.md and Roadmap.md (criterion 7). Read the code, docs/spec.md, docs/decisions.md (D1–D44) and the landed commits since 46257c3 (`git log --oneline 46257c3..HEAD`) so the README describes 2.1 as it actually shipped, not as planned. Follow the plan's section list for the README (Supported setups; Hardening for 24/7 displays; Tablets; Kiosk; Network; Accounts; The helper; Rotation; Clock; config.json) plus the feature docs (criterion 5) and the project layout (criterion 4: every js/*.js and scripts/*.mjs named with one line each). Plain, short sentences; a reader is a home-theatre owner, not a developer, except in the developer sections.
Must reflect what shipped (check the code, do not trust the plan where they differ): sleep (schedule + idle; the screen wake lock stays held; turn OS blanking off), pixel shift, frame brightness and night dim, the quiet status dot, kiosk mode and the PIN (a deterrent — say so), the loopback-only resetPin recovery, the content-rating household limit (fails closed; episodes; pins), metadata/now-playing extras, cache-first offline posters, the guarded daily reload (needs https or localhost; an http LAN page never reloads), the device helper (opt-in deviceHelper, `serve.mjs --helper`), Recommended protection (what it does and does not change), the first-run plex.tv code on the empty screen (polling cadence K50), control labels and the first-tap rule, the `?` shortcuts overlay and the Diagnostics button, error messages with fix buttons, `npm run test:e2e`. Landscape fill and drag/nudge positioning are NOT in 2.1 (D41) — mention them only as planned for 2.2.
K61: nothing has run on a real Plex server or a Pi yet. Every Chromium flag, policy, package name, OS command, helper command and real-server behaviour that the spec marked (verify) must be tagged "(verify)" or "not yet verified" in the README (criterion 2), and the README says plainly near the top that 2.1's real-server and Raspberry Pi validation is pending. Do not claim anything works on real hardware.
Roadmap.md: keep every existing entry added at the owner's request (b5f6882: Sources other than Plex, Now showing theatre mode, Seasonal schedules, Trailer on demand, Health beacon, Home Assistant/MQTT hooks, Presence-based sleep, Update channel, Shared settings for several displays, Synchronised displays, Panel-aware protection presets, Burn-in report; the "Planned for 2.2" section; the Engineering backlog). Apply criterion 6: extend Remote control with D7's PIN-locked constraint; add Multi-poster landscape layout, Frame per poster source ("Coming Attractions" artwork), Animated frame bulbs and Frame rotation, each with its reason from the spec's Non-goals table; remove Scheduled dimming/sleep and Playback progress from the Ideas (shipped) — move them to a "Done in 2.1" list with the other shipped features. Add an Engineering backlog entry "2.1.x polish": the Recommended protection list shows the internal value "stage" for the night-dim row instead of "The whole picture", and an e2e should pin that an unconfigured boot writes plexPoster.whatsNew (K60).
Run criteria 1–7 and paste outputs. For criterion 8 (narrated) list in the handback every command or flag you tagged (verify) and where.

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
- Accuracy over completeness: if the code and the spec disagree, document the code and list the disagreement in the handback.

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
### 25. `docs` — README and Roadmap: hardening, setups and shipped features

- **Goal:** Document everything a page cannot do (smart plug, SD wear, overlay FS, battery, Chromium flags and policy, OS blanking, VLAN, managed user, helper, config.json, supported setups), bring the feature docs to 2.1 reality, and record each D1 deferral on the Roadmap.
- **Findings:** E7, E8, E11, E13, E15, E17, F4 · **Requirements:** R-DOC-1, R-DOC-2, R-DOC-3, R-DOC-4, R-DOC-5, R-DOC-6, R-DOC-7, R-DOC-8, R-DOC-9, R-TOPO-1 · **Rulings:** D1, D7, D9, D16
- **Mode:** afk · **Tags:** docs · **Blocked by:** `recommended-protection-preset`, `touch-and-labels` (K61: no longer waits on `real-server-validation-extended`; every unproven command or flag is tagged (verify) and `release-bump` updates the tags from the validation results; position-drag-nudge and fill-blur-and-info deferred, D41)
- **Output:** `README.md`, `Roadmap.md`
- **Acceptance criteria:**
  1. `for k in 'smart plug' 'Overlay File System' 'disk-cache-dir' 'lost on reboot' 'swelling' 'overscroll-history-navigation' 'disable-pinch' 'overscroll-behavior' 'managed user' 'Plex Home' '32400' 'VLAN' '--helper' 'cec-ctl' 'wlr-randr' 'config.json' 'resetPin' 'reverse proxy' 'Recommended protection' 'Household with children' 'DeveloperToolsAvailability' 'chromium-browser' 'labwc' 'screen blanking' 'Supported setups' 'deterrent' 'Fullscreen' 'rotateUi' 'hdmi_force_hotplug' 'video group' 'fake-hwclock'; do grep -qiF -- "$k" README.md || { echo "missing: $k"; exit 1; }; done`
  2. `grep -Eqi 'not (yet )?verified|unverified' README.md`  (unverified flags and commands are labelled as such)
  3. `node -e "const fs=require('fs');const t=fs.readFileSync('README.md','utf8');const bad=[...t.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)].map(m=>m[1].split('#')[0]).filter(p=>p&&!fs.existsSync(p));if(bad.length){console.error(bad);process.exit(1)}"`  (relative links resolve)
  4. `for f in js/*.js scripts/*.mjs; do grep -q "$(basename "$f")" README.md || { echo "undocumented: $f"; exit 1; }; done`  (project layout lists every module and script)
  5. `for k in 'Sleep' 'Pixel shift' 'Kiosk' 'PIN' 'Content rating' 'Progress' 'Recommended protection' 'npm run test:e2e'; do grep -qiF -- "$k" README.md || { echo "missing: $k"; exit 1; }; done && grep -qi 'shortcuts overlay' README.md`
  6. `for k in 'Multi-poster landscape layout' 'Frame per poster source' 'Animated frame bulbs' 'Frame rotation' 'Remote control'; do grep -qF -- "$k" Roadmap.md || { echo "roadmap missing: $k"; exit 1; }; done && grep -q 'PIN-locked' Roadmap.md && ! sed -n '/Ideas/,$p' Roadmap.md | grep -qE 'Scheduled dimming|Playback progress'`  (every D1 deferral has an entry, the existing Remote control idea carries D7's constraint, and shipped ideas left the list)
  7. `test -z "$(git status --porcelain -- . ':!README.md' ':!Roadmap.md')"`  (only the two documents changed; `.orchestrator/` is git-ignored)
  8. narrated: `/doc-review` band; `keep-docs-current` over `git diff --name-only 46257c3..HEAD`; every command and flag is tagged (verify)/unverified unless proven in `real-server-validation-extended`; `Roadmap.md` deferral entries each state their reason (spec Non-goals table).
- **Notes/hazards:**
  - Merged (r2) from the two r1 README passes. Sections: *Supported setups* (the three topologies of R-TOPO-1 and what the http LAN page loses), *Hardening for 24/7 displays* (sleep and the recommended preset, OS screen blanking off, smart plug schedule with a clean-shutdown caution, read-only overlay FS via `raspi-config` with "configure, then enable the overlay", Chromium disk cache in RAM), *Tablets* (charge limit / smart plug, battery swelling, the reload-drops-fullscreen note), *Kiosk* (flags `--kiosk --noerrdialogs --disable-session-crashed-bubble --app=` plus `--overscroll-history-navigation=0` and `--disable-pinch`, `DeveloperToolsAvailability` policy, package `chromium-browser` on Bookworm and `chromium` on Trixie, labwc/XDG autostart, the PIN-is-deterrence statement and the `resetPin` recovery), *Network* (IoT/guest VLAN reaching only Plex 32400 and plex.tv 443), *Accounts* (Plex Home managed user limited to one library; "Household with children" toggle), *The helper* (`--helper`, `cec-ctl`/`cec-client`/`wlr-randr`, compositor environment, loopback only, `hdmi_force_hotplug=1` in the boot config and membership of the `video` group for `/dev/cec0`, both (verify)), *Rotation* (turning the OS or compositor instead: `rotateUi` off with app rotation 0 is supported, D2), *Clock* (Pi OS `fake-hwclock` restores a stale time after a long power-off until NTP syncs, Q23), *config.json* (loopback-only, delete after first run, never behind a reverse proxy).
  - Roadmap: extend "Remote control" with D7's constraints; add entries for multi-poster landscape layout, frame per poster source with "Coming Attractions" artwork, animated frame bulbs and frame rotation, each with its reason from the spec's Non-goals table; remove "Scheduled dimming / sleep" and "Playback progress" (shipped).
  - The `Findings` list includes F4 because the README documents the loopback `config.json` and allowlist behaviour.

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: docs · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: docs-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
