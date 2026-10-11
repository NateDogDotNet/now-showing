produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: planning · round: r3
status: complete        failure_class: n/a
paths: docs/spec.md (revised, staged), docs/integration-plan.md (revised, staged), .orchestrator/artifacts/planning--handback-builder-r3.md (this file; git-ignored)
criteria:
- N1 (pi-stability probe): fixed — plan `pi-stability` Output now lists `sw.js` (:405); #2 scenario makes the app server unreachable via `serveArgs: []` + `app.stop()`, never `mock.down()`; new criterion 5 `grep -q 'no-store' sw.js && node scripts/check-precache.mjs` (:411); Notes say the SW sends `request.cache === 'no-store'` to the network; spec R-PROT-3 wording and acceptance bullets updated to match
- N2 (first-run row): fixed — `validation-checklists` #3 core loop now `'plex.tv/link' 'Sign in with Plex' firstReachable ...` (no `first-run code`), #4 extended loop starts with `'first-run code'`; Notes for core/extended, `real-server-validation-extended` Goal, `rotate-plex-token` checklist step (3) and the `real-server-validation` note changed; spec R-VAL-1 and R-VAL-2 edited
- N3 (serve comment vs grep): fixed — `serve-config-guard` Notes require the comment worded exactly "proxy headers are never consulted" and forbid the words `forwarded`/`x-forwarded` in `serve.mjs`/`net.mjs`; criterion 4 unchanged; fixture check below prints N3-ok
- N4 (token regex): fixed — `rotate-plex-token` criterion 4 uses `{20,}`; spec R-SEC-2 says "alphanumeric run of 20 or more characters"; fixture: 21 chars caught, hyphenated word passes
- N5 (dialogs at rotation 90): fixed — `kiosk-and-pin` #3 and spec R-KIOSK-1 add `#pin-dialog` angle 90 and box inside viewport; `touch-and-labels` #3 and spec R-CTRL-3 add `#shortcuts` likewise
- N6 (harness options, helper log): fixed — `e2e-harness` #5 gains one assertion each for `serveArgs: []` (dedicated server on free ports, `app.stop()`), `serveArgs` pass-through (`app.argv`), `serviceWorkers: 'allow'`, `clock`, `hasTouch`, `localStorage`; contract note defines `app = { url, port, mockPort, argv, stop() }` and the second-server spawn; I picked the endpoint option: `device-helper-server` #1 specifies fake-mode-only `GET /__helper/calls` (404 without `--helper-fake`), `device-helper-integration` #3 and spec R-HELP-1/R-HELP-2 read it
- N7 (config.json interception): fixed — spec R-KIOSK-1 and R-FIRST-1 and plan `kiosk-and-pin` #3 and `settings-sheet` #4 all say "intercepted by `context.route`"
- N8 (rating request list): fixed — spec R-FILT-1 (request value list = every allowed ladder value and every mapped prefixed value at or below the limit); `content-rating-filter` unit list, e2e (`page.on('request')` sees `gb/12`) and mock note (strict list, so a missing `gb/12` fails the e2e)
- N9 (README items): fixed — spec R-DOC-8 (rotateUi/OS rotation, `hdmi_force_hotplug`, `video` group) and its acceptance line; `docs` #1 keyword loop adds `rotateUi`, `hdmi_force_hotplug`, `video group`, `fake-hwclock`; `docs` Notes sections list them
- N10 (free ports): fixed — plan convention 3 (every spawned test server on a free port), `serve-config-guard` #1 (free port probed, passed as `--port`), `e2e-harness` dedicated server note; spec R-SEC-1 last bullet
- Q19: reflected — spec table header "ruled, Q19"; open-questions table rewritten as conductor rulings; plan `content-rating-filter` note says ruled
- Q20: reflected — plan preamble ruling list and `recommended-protection-preset` note ("ruled; untickable row"); spec Q20 row
- Q21: reflected — `kiosk-and-pin` note says ruled, Diagnostics warns, README says remove; spec Q21 row
- Q22: reflected — `metadata-and-now-playing` Rulings line and note say kept, default off, ruled; spec Q22 row
- Q23: reflected — spec Q23 row and R-DOC-8 (fake-hwclock staleness sentence); `docs` #1 keyword `fake-hwclock`; `settings-and-schedule-core` Notes point to `docs`
- Unchanged: graph (27 phases, acyclic), release-bump ancestry, D1-D16 not relaxed, Roadmap/code/decisions.md untouched
deviations: (1) N1: the spec leaves the exact way to take the server down open ("stops its own serve.mjs child, or aborts the probe with an offline emulation that also covers SW fetches"); the plan fixes it to `serveArgs: []` + `app.stop()` because route-based interception of SW fetches is not reliable. (2) N1 adds a fifth `pi-stability` criterion (`grep -q 'no-store' sw.js` + precache check) so the new Output path has a check. (3) N6 adds `app.argv` and `app.stop()` to the `withApp` contract and defines `serviceWorkers: 'allow'` as the opt-in value; these were implied, not named, in r2. (4) The spec "Open questions" new-in-r2 table was replaced by a rulings table. (5) The coverage loop was reconstructed (`grep -cw` per ID); its counts may differ from r2's loop by definition, but no ID is at 0.
questions: none

Agent: planning-builder-r3 · dispatched: 2026-10-08T21:27:39Z

## Commands run (output tails)

### Coverage loop (spec count / plan count, D1 included)
```
F1 spec=2 plan=4;F2 spec=2 plan=4;F3 spec=3 plan=4;F4 spec=2 plan=4;F5 spec=2 plan=4;S1 spec=3 plan=3;V1 spec=5 plan=7;
U1 spec=2 plan=3;U2 spec=2 plan=3;U3 spec=2 plan=3;U4 spec=2 plan=3;U5 spec=2 plan=2;U6 spec=2 plan=1;U7 spec=3 plan=4;
U8 spec=2 plan=1;U9 spec=3 plan=3;U10 spec=2 plan=3;U11 spec=2 plan=3;U12 spec=2 plan=3;U13 spec=2 plan=2;U14 spec=2 plan=3;
E1 spec=2 plan=4;E2 spec=2 plan=3;E3 spec=2 plan=1;E4 spec=2 plan=4;E5 spec=2 plan=1;E6 spec=4 plan=3;E7 spec=2 plan=2;
E8 spec=3 plan=3;E9 spec=3 plan=4;E10 spec=2 plan=3;E11 spec=2 plan=2;E12 spec=2 plan=3;E13 spec=2 plan=2;E14 spec=2 plan=3;
E15 spec=2 plan=2;E16 spec=2 plan=2;E17 spec=2 plan=2;D1 spec=21 plan=18
lines with spec=0 or plan=0: 0
```

### python3 .orchestrator/artifacts/planning--graphcheck-r2.py (head and tail)
```
phases 27 unknown edges []
cycle False
release ancestors missing: []
sinks ['purge-git-history']
 1 e2e-harness                        afk   architecture                   <- —
 ...
 8 release-bump                       afk   —                              <- docs, rotate-plex-token, real-server-validation, real-server-validation-extended
 9 purge-git-history                  hitl  irreversible                   <- rotate-plex-token, release-bump
```
Dependency table and `Blocked by` lines are unchanged from r2 (no edge was added or removed).

### Fixture checks
```
N3-ok            (comment "proxy headers are never consulted" passes criterion 4's grep)
N4-21-caught     (21-character run is now caught)
N4-hyphen-ok     (hyphenated word still passes)
```

### git diff --stat c817080 -- docs/
```
 docs/integration-plan.md | 70 +++++++++++++++++++++++++-----------------------
 docs/spec.md             | 55 ++++++++++++++++++-------------------
 2 files changed, 64 insertions(+), 61 deletions(-)
```

### git status --short (both docs staged, nothing committed)
```
M  docs/integration-plan.md
M  docs/spec.md
```
