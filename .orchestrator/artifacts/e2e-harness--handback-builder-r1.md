produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: low · phase: e2e-harness · round: r1
status: complete        failure_class: n/a
paths: package.json, package-lock.json, tests/e2e/run.mjs, tests/e2e/lib.mjs, tests/e2e/smoke.spec.mjs, scripts/check-precache.mjs, .github/workflows/ci.yml (all in /home/user/wt-e2e-harness, staged, not committed)
criteria:
1. met: `npm test` (29 pass, 0 fail)
2. met: node --check loop over tests/e2e/*.mjs and scripts/check-precache.mjs
3. met: `node scripts/check-precache.mjs` -> "23 precached files OK"
4. met: mktemp probe; fails with notPrecached ['js/vendor/x.js'], then passes (rc=0)
5. met: `npm run test:e2e -- smoke` -> 8 "ok" lines, "PASS smoke"
6. met: node -e package.json check, rc=0
7. met: lockfile check and `git ls-files --error-unmatch package-lock.json` (staged), rc=0
8. met: grep of lib.mjs for pixelShift/dailyReload/plexPoster.whatsNew, rc=0
9. met: ci.yml greps, rc=0
10. met: `git status --porcelain` on app/server paths is empty
11. narrated, not attempted (/tool-fit and dependency-audit are for the reviewer). npm install reported 0 vulnerabilities; playwright 1.56.1 is the only package added.
deviations:
- Smoke assertions and lib/run were written in the same pass, so I did not watch the spec fail first.
- Additions beyond the brief's contract: `settings` may be a function of `app` (so a dedicated server's mock port can go into the seed), and `app.spawned` holds the full child argv. Seeding via the init script only writes a key when it is absent, so reloads keep what the app saved.
- The whatsNew marker value is the string 'e2e'. The app does not read the key yet.
- `mock.stats()` calls `/__mock/stats`. The current mock treats any action generically and returns its state.
- serve.mjs ignores `--helper` and `--helper-fake` today, so the child accepts them harmlessly.
questions: none

## Output tails
All commands were run in /home/user/wt-e2e-harness. Real output is shown above in the criteria list. The final `npm run test:e2e -- smoke` output:
```
  ok  poster layer loads, no console errors
  ok  serveArgs [] -> dedicated server, stop() ends it
  ok  serveArgs passed through to the child
  ok  service workers blocked by default
  ok  serviceWorkers 'allow' registers and controls after a reload
  ok  clock install + runFor
  ok  hasTouch toggles maxTouchPoints
  ok  localStorage seed + pixelShift false + wake lock stub
PASS smoke
```
`git status --short`: M ci.yml, A package-lock.json, M package.json, A scripts/check-precache.mjs, A tests/e2e/{lib,run,smoke.spec}.mjs.
