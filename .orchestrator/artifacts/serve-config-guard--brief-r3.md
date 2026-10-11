# Brief — serve-config-guard r3 (re-dispatch, tests only)

Agent name: serve-config-guard-builder-r3 · round r3 · worktree `/home/user/wt-serve-config-guard` (r2 staged). r1/r2 briefs bind. Forced by `artifacts/serve-config-guard--tally-step7-r2.json` (85/95, "tests where implied" 0/10). **Change only `tests/serve.test.js`** unless a test exposes a real bug (then say so in the handback). Stage, do not commit.

Add tests so these conductor mutants fail:
1. `serve-config-guard--mutation-no-isfile-r2.txt` (the `isFile()` guard removed): a FIFO (`mkfifo`, skip with a clear message only if mkfifo is unavailable — it is available here) and a directory request under `assets/` must return 404 within 2 s, and the server must still answer the next request.
2. `serve-config-guard--mutation-no-containment-r2.txt` (the `rel.startsWith('/..')` clause removed): with `config.json` in the served root replaced by a symlink to a file outside the root, a loopback request with a loopback Host returns 404 (not the outside file).
3. A served root that is itself a symlink (`--root <link-to-dir>`): app files still 200, config.json still loopback-only.
4. Proxy-header teeth beyond X-Forwarded-For: `Forwarded: for=127.0.0.1`, `X-Real-IP: 127.0.0.1` and `X-Forwarded-Host: localhost` from the LAN peer with `Host: localhost:<port>` → 403. Build header names in the test so `scripts/` never contains the word (plan criterion 4).

Run the plan's criteria 1–6 and paste outputs. Handback `/home/user/plex-poster-app/.orchestrator/artifacts/serve-config-guard--handback-builder-r3.md` (round r3; criteria lines for items 1–4 + plan 1–6). First body line `Agent: serve-config-guard-builder-r3 · dispatched: <stamp>`.
