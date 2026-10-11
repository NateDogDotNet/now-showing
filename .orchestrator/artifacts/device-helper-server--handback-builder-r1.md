produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: device-helper-server · round: r1
status: complete        failure_class: n/a
paths: scripts/device-helper.mjs, scripts/serve.mjs, tests/device-helper.test.js (all staged, not committed); also appended to /home/user/plex-poster-app/.orchestrator/questions.md
criteria:
  1. met — `test -f tests/device-helper.test.js && node --test tests/device-helper.test.js` -> 29 tests, 0 fail
  2. met — `npm test` -> tests 72, pass 72, fail 0
  3. met — grep for exec(/execSync/shell:true finds nothing (rc 0)
  4. met — no Access-Control-Allow in either file (rc 0)
  5. met — no brightness/ddcutil/backlight/vcgencmd display_power in device-helper.mjs (rc 0)
  6. met — `test -z "$(git status --porcelain -- js css index.html sw.js scripts/net.mjs scripts/mock-plex.mjs)"` rc 0
  7. narrated — left to the independent reviewer
deviations: none. Tests were written first (failed on missing module), then the implementation. The tests were adjusted once after the module existed (createHelper became async; null sentinel for missing host/peer in the test driver).
questions: Q-dhs1, Q-dhs2

Agent: device-helper-server-builder-r1 · dispatched: 2026-10-08T22:29:18Z

## Notes
- `createHelper` (async, exported from scripts/device-helper.mjs) takes injected `execFile`, `thermalPath`, `which`, `env`, `timeoutMs`. Its `handle(req,res)` returns false for URLs outside `/__helper/`.
- serve.mjs: `--helper`, `--helper-fake` (inert without `--helper`), `--helper-power`, `--helper-output`, `--helper-wayland-display`, `--helper-xdg-runtime-dir`. Bad values print an error and exit 1 before listening. The allowlist and loopback-only config.json logic is untouched.
- Hardening: execFile with fixed argv, `shell:false`. Output and Wayland names match `^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$`. The XDG dir must be an absolute path with no spaces, newlines or `..`. Child env is only PATH, plus WAYLAND_DISPLAY and XDG_RUNTIME_DIR for wlr-randr. The lock refuses a second command with 503. A 5 s timeout is enforced by both execFile and an own timer, which sends SIGKILL and returns 504. The body is capped at 1 KiB. Command output is never echoed. The guards run before the body is read. Unknown routes, wrong methods and brightness all return 404.
- Status codes and the auto-detect/cec-ctl-on choices are proposals in Q-dhs1 and Q-dhs2. All command syntax is (verify) on real hardware.
