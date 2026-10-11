produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: device-helper-server · round: r4
status: complete        failure_class: n/a
paths: /home/user/wt-device-helper-server-r4/tests/device-helper.test.js (changed this round); already staged from r3, untouched: scripts/device-helper.mjs, scripts/serve.mjs
criteria: 1 met (node --test tests/device-helper.test.js: 43/43) · 2 met (npm test: 86/86) · 3 met · 4 met · 5 met · 6 met · eslint (round--eslint-r1d.config.mjs, 3 files) exit 0 · 7 narrated, not attempted
deviations: none. scripts/device-helper.mjs unchanged (no real bug found).
questions: none

Agent: device-helper-server-builder-r4 · dispatched: 2026-10-08T23:36:14Z

Added one test, 'the real default executor runs the binary directly, with no shell (argv literal, env exactly PATH)'. It does not inject execFile, so it drives realExecFile. A fake cec-ctl (a node script, shebang is process.execPath) sits alone on PATH and writes its argv and process.env keys to a file.

It asserts argv equals the fixed cec-ctl standby argv, env keys equal exactly ['PATH'], and a marker file from `;touch marker` in the request body is never created.

Design note: the helper validates every user-controlled value (output, display, dir) to charsets with no shell metacharacters, so a metachar argument cannot reach the executor. The test therefore detects a shell through the child environment. The shell adds PWD. The marker assertion is weak by itself and passes either way. The env assertion is what kills the mutant.

Mutation check, in a mktemp -d copy: `shell: false` -> `shell: true` in realExecFile. Result: 42 pass, 1 fail, and the failing test is the new one (actual env had extra 'PWD'). Unmutated: 43/43. The live tree was not mutated.

Commands and tails:
- node --test tests/device-helper.test.js -> # tests 43 / # pass 43 / # fail 0
- npm test -> # tests 86 / # pass 86 / # fail 0
- eslint exit 0
- criteria 3,4,5,6 grep/status probes all exit 0
- git status: A scripts/device-helper.mjs, M scripts/serve.mjs, A tests/device-helper.test.js (all staged, not committed)
