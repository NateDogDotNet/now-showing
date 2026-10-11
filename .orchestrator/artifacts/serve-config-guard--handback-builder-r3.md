produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: low · phase: serve-config-guard · round: r3
status: complete        failure_class: n/a
paths: /home/user/wt-serve-config-guard/tests/serve.test.js (staged; scripts/serve.mjs and scripts/net.mjs remain staged from r2, untouched this round)
criteria:
- item 1 (FIFO + directory under assets/ 404 within 2 s, server keeps answering): met. New test 12. Mutant with the isFile() line removed: test 12 fails (13 pass, 1 fail).
- item 2 (config.json symlink to outside file, loopback request, 404): met. New test 13 (own server and root). Mutant with `rel.startsWith('/..') ||` removed: test 13 fails.
- item 3 (served root that is a symlink): met. New test 14: app files 200, config.json 200 with loopback Host, 403 with foreign Host, 403 from the LAN peer, /docs/spec.md 404. Extra mutant `REAL_ROOT = ROOT` fails test 14.
- item 4 (Forwarded / X-Real-IP / X-Forwarded-Host from the LAN peer, Host localhost: 403): met. New test 6; header names are built by join in the test.
- plan 1: met, `node --test tests/serve.test.js` gives pass 14, fail 0, skipped 0.
- plan 2: met, `npm test` gives tests 43, pass 43, fail 0.
- plan 3: met (exit 0).
- plan 4: met (exit 0).
- plan 5: met (exit 0).
- plan 6 (narrated): met. skipped 0 on this host, which has a LAN IPv4, so the LAN tests ran.
deviations: none. I refactored the test's start() into spawnServer(rootDir), and get() gained optional `at` and `timeout` options; both are test-only. No real bug exposed in scripts/. The directory case already returned 404 via the catch path, and only the FIFO case discriminates the isFile mutant.
questions: none

Agent: serve-config-guard-builder-r3 · dispatched: 2026-10-08T22:23:00Z

Mutants were run in a mktemp -d copy, not in the worktree. Output tails:
noisfile: not ok 12 - a FIFO or directory under assets/ ... # pass 13 # fail 1
nocontain: not ok 13 - config.json that is a symlink leaving the root ... # pass 13 # fail 1
rootlink-mutant: not ok 14 - a served root that is itself a symlink ... # pass 13 # fail 1
Plan criteria on the real worktree:
C1: # pass 14 # fail 0 # skipped 0
C2: # tests 43 # pass 43 # fail 0
C3: 0   C4: 0   C5: 0
git status --short: A scripts/net.mjs, M scripts/serve.mjs, A tests/serve.test.js
