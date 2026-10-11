Agent: e2e-harness-builder-r2 · dispatched: 2026-10-08T22:20:27Z
produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: low · phase: e2e-harness · round: r2
status: complete        failure_class: n/a
paths: .github/workflows/ci.yml, package-lock.json, package.json, scripts/check-precache.mjs, tests/e2e/lib.mjs, tests/e2e/run.mjs, tests/e2e/smoke.spec.mjs (all staged, not committed; r2 edited ci.yml, lib.mjs, run.mjs, smoke.spec.mjs)
criteria:
- r2 item 1 (per-spec deadline, group kill, signal cleanup, CI timeout-minutes: 20): met. Commands below.
- r2 item 2 (smoke asserts whatsNew, dailyReload, wakeLock.request, viewport, isMobile): met. `npm run test:e2e -- smoke` prints PASS. isMobile signal is a page without a viewport meta laying out at 980px (mobile) vs 500px (default); UA "Mobile" and pointer:coarse were tried and do not distinguish isMobile in this Chromium (coarse comes from hasTouch alone, UA lacks "Mobile").
- r2 item 3 (faithful stub: released getter, release listeners, held--, releases++): met, asserted in smoke.
- r2 item 4 (check-precache before the Chromium install in CI): met.
- plan 1 npm test: met (exit 0). 2 node --check loop: met. 3 check-precache: met (23 files OK). 4 recursive vendor: met (fails on js/vendor/x.js, then 2 files OK). 5 smoke: met (PASS smoke). 6 package.json: met. 7 lockfile: met. 8 lib.mjs greps: met. 9 ci.yml greps: met. 10 scope probe: met. All run with E2E_PORT=18080 E2E_MOCK_PORT=18401, each exit 0.
deviations: none. No design change beyond the brief; the stub also invokes an optional `onrelease` handler.
questions: none

## Evidence (scratch copy made with mktemp -d; hang spec never in the worktree; scratch dir removed)

Timeout (hang spec uses serveArgs:[] so it has a dedicated server + Chromium):
```
$ E2E_SPEC_TIMEOUT=5 node tests/e2e/run.mjs hang smoke
exit=1
DEDICATED 39471 39881
FAIL hang (timeout)
PASS smoke
port 39471: 000   port 39881: 000   port 18080: 000   port 18401: 000   (curl http_code, 000 = refused)
pgrep -af 'chrom|serve.mjs|spec.mjs' -> no procs
```
Total run time about 10 s with a 5 s deadline.

SIGTERM to the runner while hang2 spec running:
```
before: runner, shared serve.mjs (18080), hang2.spec.mjs, dedicated serve.mjs (42407), 5 headless_shell processes
kill -TERM <runner>   -> runner exit=130
after: ports 42407 / 40171 / 18080 / 18401 all 000; pgrep chrom|serve.mjs|hang2 -> no procs
```

Plan criteria tail (smoke):
```
  ok  whatsNew seeded, dailyReload false
  ok  wake-lock stub counts and sentinel released/release event are faithful
  ok  viewport sets innerWidth
  ok  isMobile gives a mobile signal (980px layout without viewport meta)
PASS smoke
```
git status --short: M ci.yml, A package-lock.json, M package.json, A check-precache.mjs, A lib.mjs, A run.mjs, A smoke.spec.mjs (all staged).
