produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: low · phase: serve-config-guard · round: r2
status: complete        failure_class: n/a
paths: scripts/serve.mjs, scripts/net.mjs, tests/serve.test.js (all staged in /home/user/wt-serve-config-guard, not committed; net.mjs unchanged from r1)
criteria:
- Item 1 (XFF teeth): met. Test sends Host localhost:<port> from the LAN peer with the proxy header (name built in the test only) and expects 403. Mutant "server reads peer from the header": now 1 failed (was 7/7 pass).
- Item 2 (loose loopback): met. Unit cases 127.0.0.1.evil, 1270.0.0.1, 127.0.0.256, 127.1, '127.0.0.1 ', ::ffff:127.0.0.256 expect false. Mutant startsWith('127'): 1 failed.
- Item 3 (dir prefix): met. LAN /assets-private/x.png and /jsx/a.js expect 404. Mutant DIRS without slash: 1 failed.
- Item 4 (symlink): met. serve.mjs compares realpath to the root realpath and requires the real path to be an app path; assets/link.png (outside file) and assets/cfg.png (-> config.json) are 404 from the LAN. Mutant dropping the app-path check on the real path: 1 failed. CAVEAT: mutant removing only the `rel.startsWith('/..')` clause survives (0 failed), because the app-path check on the real path already rejects outside targets; that clause only matters for a config.json that is itself a symlink out of the root, which no test covers.
- Item 5 (dotfiles): met. Any segment starting with '.' is 404; /js/.env expects 404. Mutant removing the dot check: 1 failed.
- Item 6 (pinned codes): met. Foreign-Host loopback refusals now assert 403; LAN config.json variants assert 403 for the exact spelling after decoding (/config.json, /config.json?x=1, /%63onfig.json) and 404 for the rest; loopback variants assert 404.
- Plan 1: met. `node --test tests/serve.test.js` -> # pass 10, # fail 0, # skipped 0.
- Plan 2: met. `npm test` -> # pass 39, # fail 0.
- Plan 3: met. grep isLoopback checks pass (net.mjs unchanged).
- Plan 4: met. grep for forwarded/x-forwarded in scripts/serve.mjs scripts/net.mjs -> clean.
- Plan 5: met. git status --porcelain on js css index.html sw.js scripts/mock-plex.mjs is empty.
- Plan 6: met. LAN tests not skipped (skipped 0).
deviations: none. Note: /%63onfig.json decodes to the exact spelling, so it is refused 403 rather than 404 (never 200, as the plan requires).
questions: none

Agent: serve-config-guard-builder-r2 · dispatched: 2026-10-08T22:15:18Z

Mutations were run in a throwaway git worktree under mktemp -d, since removed.
