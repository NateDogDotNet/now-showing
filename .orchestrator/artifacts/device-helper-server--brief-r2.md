# Brief — device-helper-server r2 (re-dispatch)

Agent name: device-helper-server-builder-r2 · round r2 · worktree `/home/user/wt-device-helper-server` (r1 staged). The r1 brief binds (effort high, risk:high). Read both reviews (`artifacts/device-helper-server--review-r1.md`, `artifacts/device-helper-server--review-cold-r1.md`) and the triage in `.orchestrator/phases/device-helper-server.md` ("Step 7 triage — r1"). Touch only `scripts/device-helper.mjs`, `scripts/serve.mjs`, `tests/device-helper.test.js`. Stage, do not commit.

Fix exactly, each with a test that fails without the fix:
1. An oversized body (> 1 KiB) gets an HTTP 413 response with a JSON error, not a connection reset (read and discard the rest, or respond then close cleanly); the 413 message is accurate.
2. In fake mode `GET /__helper/status` reports `power: 'fake'` (or the explicit `--helper-power` flag value when given), never the host's auto-detected strategy.
3. A test asserts the exact child `env` for cec-ctl and cec-client (PATH only; nothing from the helper's own environment) as well as for wlr-randr.
4. Each command is spawned so its whole process group can be killed (`detached: true` + `process.kill(-pid, 'SIGKILL')`) on timeout; the lock is released only after the group is gone. Test: a fake binary that forks a long-lived grandchild and hangs is killed with its grandchild within the timeout (use a short injected timeout).
5. Temperature per spec R-HELP-1: `/sys/class/thermal/thermal_zone0/temp` ÷ 1000, else `vcgencmd measure_temp` (execFile, fixed argv, same timeout/lock rules, parse `temp=48.3'C`); `status` returns `{ power, temperature, tempC }` where `temperature` is the source (`'thermal_zone0' | 'vcgencmd' | null`) — conductor ruling K2. Criterion 5's grep forbids only `vcgencmd display_power`, which must still not appear.
6. Accept an absolute `WAYLAND_DISPLAY` socket path (validated, no `..`) as well as a bare name.
7. Fake-mode call log keeps only the last 100 calls.

All plan criteria 1–6 must still pass (paste outputs). Handback `/home/user/plex-poster-app/.orchestrator/artifacts/device-helper-server--handback-builder-r2.md` (round r2; criteria lines for items 1–7 and plan 1–6). First body line `Agent: device-helper-server-builder-r2 · dispatched: <stamp>`.
