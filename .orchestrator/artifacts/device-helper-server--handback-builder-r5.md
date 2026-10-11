produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: device-helper-server · round: r5
status: complete        failure_class: n/a
paths: tests/device-helper.test.js (in /home/user/wt-device-helper-server-r5; staged). scripts/device-helper.mjs and scripts/serve.mjs unchanged this round (still staged from r3).
criteria:
  1. test -f tests/device-helper.test.js && node --test tests/device-helper.test.js -> met (46 tests, 46 pass; 4 new)
  2. npm test -> met (89 pass, 0 fail)
  3. grep exec/execSync/shell:true in device-helper.mjs -> met (exit 0)
  4. no Access-Control-Allow -> met
  5. no brightness/ddcutil/backlight -> met
  6. scope probe on js css index.html sw.js net.mjs mock-plex.mjs -> met
  eslint -c round--eslint-r1d.config.mjs on the three files -> exit 0
deviations: none (no source change; no real bug found)
questions: none

Agent: device-helper-server-builder-r5 · dispatched: 2026-10-08T23:36:14Z

New tests (no injected execFile; real realExecFile with fake scripts first on PATH in mktemp dirs):
1. "arguments reach the binary literally and no shell sits between": wlr-randr fake records argv, stdin and `/proc/$PPID/comm`; asserts exact argv `--output HDMI-A-1.x_y --off` and that the parent is `node` (a `sh -c` parent means a shell). Metacharacter outputs (`a;touch M`, `$(touch M)`, backtick, space, pipe, leading `-`) are rejected at createHelper and the marker is never created. A PATH dir named with shell metacharacters still runs cec-ctl with exact argv.
2. cec-client: argv `-s -d 1`, stdin `standby 0\n`, env has no secret.
3. Timeout: fake cec-ctl forks `sleep 300`; timeoutMs 400 -> 504 in <4 s, grandchild pid dead on return, then the binary is swapped for a succeeding one and the next call returns 200 (lock free).
4. fake vcgencmd printing `temp=48.3'C` -> status tempC 48.3, temperature 'vcgencmd'; cec-ctl exit 3 (with stdout) -> 502, output not echoed, lock released; missing binary -> 502.

Mutant check (temp clone in mktemp -d): changing realExecFile spawn to `shell: true` -> test 37 (literal args / no shell) fails (45 pass, 1 fail). Note the argv itself is fixed and flag values are validated, so no metacharacter can reach argv; the shell is detected through the parent process (`sh` vs `node`), which is why that assertion carries the mutant.

Tails: `node --test tests/device-helper.test.js` -> tests 46, pass 46, fail 0. `npm test` -> tests 89, pass 89, fail 0. git status: A device-helper.mjs, M serve.mjs, A device-helper.test.js (staged, not committed).
