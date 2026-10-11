# Brief — device-helper-server r6 (re-dispatch 5 of 5 — the last)

Agent name: device-helper-server-builder-r6 · effort: high · worktree `/home/user/wt-device-helper-server` (staged tree f9da92e = r3 source + r4 tests). The r1–r4 briefs in this folder bind. Free ports only. Stage, do not commit. Touch only scripts/device-helper.mjs, scripts/serve.mjs, tests/device-helper.test.js.

Fix every finding in `artifacts/device-helper-server--review-r4.md` (anchored) and `artifacts/device-helper-server--review-cold-r4.md` (cold), as triaged in `.orchestrator/phases/device-helper-server.md` ("Step 7 triage — r4"):

1. A1/C2 — timeout path: send the 504 when the 5 s timeout fires (do not hold the response on the group wait). Keep the lock until the process group is gone; treat a group whose remaining members are all zombies as gone (on Linux read `/proc/<pid>/stat` state `Z` for the members, or equivalent; keep it small). If the group is still alive after a bounded wait (10 s), log a warning naming the pgid and release the lock — never silently. Update the header comment to say exactly this. Add a test that FAILS if the wait loop is removed (e.g. a real forked grandchild that survives the first SIGKILL is not possible, so use the injectable killGroup/alive seam or a real group and assert the lock is held while a member is alive).
2. A2 — bound the hung-command test: a short sleep (e.g. 30 s) and a per-test `timeout` so a regressed group kill fails fast (< 40 s) instead of hanging.
3. C1 — a real-executor test with a stub binary on PATH that exits 3 → HTTP 502 (and the error body the code already uses).
4. C3 / ruling K8 — after every command, success or failure, kill its process group (`kill(-pgid, SIGKILL)`, ESRCH ignored) and wait as in item 1 before releasing the lock. Test: a stub that exits 0 after backgrounding a `sleep` leaves no process behind.

For items 1, 3 and 4, paste each new test failing before the code change. Plan criteria 1–6 must still pass; paste them. Lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/device-helper-server--handback-builder-r6.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: device-helper-server · round: r6`, then the header fields (status, paths, criteria, deviations, questions), blank line, `Agent: device-helper-server-builder-r6 · dispatched: <stamp>`.
