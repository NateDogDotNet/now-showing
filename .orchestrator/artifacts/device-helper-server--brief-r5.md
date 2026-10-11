# Brief — device-helper-server r5 (branched candidate B: re-approach the tests)

Agent name: device-helper-server-builder-r5 · worktree `/home/user/wt-device-helper-server-r5` (r3 staged state already applied). Change ONLY `tests/device-helper.test.js` (and `scripts/device-helper.mjs` only if a test proves a real bug; say so). Stage, do not commit.

Gap: the real default executor (`realExecFile`, spawn-based) is never exercised — every test injects a fake. Add a small end-to-end group of tests that use the REAL executor with fake binaries first on PATH (scripts in a `mktemp -d` dir; use short injected timeouts):
1. arguments reach the binary literally with no shell interpretation (shell metacharacters in an argument never execute; the conductor mutant `shell: true` must fail);
2. on timeout the whole process group dies, including a forked grandchild (check by pid after the call), and the lock is free afterwards;
3. stdout is captured (e.g. a fake `vcgencmd` printing `temp=48.3'C` yields tempC 48.3 through the real executor), and a binary that exits non-zero yields 502.

Run: eslint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1d.config.mjs` on the three files, `node --test tests/device-helper.test.js`, `npm test`, and plan criteria 3–6. Handback `/home/user/plex-poster-app/.orchestrator/artifacts/device-helper-server--handback-builder-r5.md` — FIRST line `produced_by: orchestrator-builder · model: <m> · effort: <e> · phase: device-helper-server · round: r5`, then the header fields, blank line, `Agent: device-helper-server-builder-r5 · dispatched: <stamp>`.
