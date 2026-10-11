produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: device-helper-server · round: r7
status: complete        failure_class: n/a
paths: /home/user/wt-device-helper-server/scripts/serve.mjs, /home/user/wt-device-helper-server/tests/device-helper.test.js, /home/user/wt-device-helper-server/scripts/device-helper.mjs (staged, content unchanged this round), /home/user/plex-poster-app/.orchestrator/questions.md (Q24 appended), /home/user/plex-poster-app/.orchestrator/artifacts/device-helper-server--handback-builder-r7.md
criteria: 1 met (node --test tests/device-helper.test.js: 52/52, 3 runs ~5.8 s) · 2 met (npm test: 95/95) · 3 met (exit 0) · 4 met (exit 0) · 5 met (exit 0) · 6 met (exit 0) · eslint with round--eslint-r1e.config.mjs on the 3 files: exit 0 · 7 not attempted (narrated, reviewer's) · r7 item 1 met · item 2 met · item 3 met
deviations: (a) Item 1 test passes against the unchanged code, as expected (it adds a test for existing behaviour); its teeth are the mutants below. (b) Item 2: besides the `{ timeout: 5000 }` on the maxMs test (:575), I added it to every other test that waits on a deadline: :272 (vcgencmd hang), :285, :381, :392, :469 (fake `hang`), :526, :542, :556. With a regressed deadline those tests now fail with `testTimeoutFailure`. Both new/changed deadline tests also get a `t.after()` that ends their own wait (a `stop` flag; a real SIGKILL of the sleep), because without it a test that times out leaves the runaway `while (await alive())` loop running and `node --test` never exits (see Mutants, M3 first run). (c) Item 3 reading: the check runs inside the `if (args.includes('--helper'))` block, i.e. where invalid helper values already refuse; a value-less `--helper-power` without `--helper` still starts as before (Q24). `opt()` and the parsing of `--root/--port/--host/...` are untouched. (d) `scripts/device-helper.mjs` is not changed this round; it is listed because it is still staged.
questions: Q24

Agent: device-helper-server-builder-r7 · dispatched: 2026-10-09T01:20:45Z

## What changed

scripts/serve.mjs (+10 lines, inside the `--helper` block, before `createHelper`): for each of `helper-power`, `helper-output`, `helper-wayland-display`, `helper-xdg-runtime-dir`, if the flag is present and the next argument is missing, empty, or starts with `--`, print `device helper: --<name> needs a value` to stderr and `process.exit(1)`. Same missing-value test `opt()` uses.

tests/device-helper.test.js (staged file now 754 lines, 52 tests; 2 new tests, 9 `{ timeout }` additions)
- `the real liveness check sees a live group member: …` (item 1): spawns a real detached `sleep 60`; `killProcessGroup(pid, { kill: (p, sig) => sig === 'SIGKILL' ? undefined : process.kill(p, sig), maxMs: 300, warn })` with the default `alive` (so the real `groupAlive` and its /proc scan). Asserts the call lasted >= 290 ms (and < 3000), exactly one warning that contains `process group <pid> `, and that the sleep was still alive afterwards. Cleanup: the pid is pushed on `strays` (SIGKILLed by the file's `after()`), and a `t.after()` SIGKILLs the group.
- `integration: a helper value option with no value refuses to start and names the option` (item 3): spawns serve.mjs for five cases: `--helper --helper-power --helper-fake` (the brief's), `--helper --helper-fake --helper-power` (last argument), `--helper --helper-output`, `--helper --helper-wayland-display --helper-fake`, `--helper --helper-xdg-runtime-dir --helper-fake`. Each must exit with a non-zero number and stderr must name the option. A server that starts anyway is SIGKILLed after 4 s and the test fails (it does not hang).

## RED for item 3 (before the serve.mjs change)

```
not ok 52 - integration: a helper value option with no value refuses to start and names the option
  error: '--helper --helper-power --helper-fake -> killed by SIGKILL: it started instead of refusing'
# tests 52  # pass 51  # fail 1  # cancelled 0
```
(My first version of this test had no kill timer; against the old code the server started and the run hung until my own 120 s cap. That is why the 4 s kill timer is there.)

After the change: `# tests 52 # pass 52 # fail 0 # cancelled 0`.

## Item 1: the test fails if the liveness scan never reports a live member

Mutant in a mktemp -d copy (`/tmp/tmp.Plw994vPEH`, scripts/ + tests/ copied, file restored and `cmp`'d afterwards): `m[1] !== 'Z'` -> `false`, so line 51 reads `if (m && Number(m[2]) === pgid && false) return true;` and `groupAlive` never sees a live member.

```
not ok 45 - the real liveness check sees a live group member: a SIGKILL that does nothing ends in the bounded wait and a warning
  failureType: 'testCodeFailure'
  error: 'returned after 59 ms: the live member was not seen, so the wait did not last until maxMs'
# tests 52  # pass 51  # fail 1  # cancelled 0
```
Only that one test fails (the r6 anchored reviewer's own mutant of the same line passed 50/50 before).

## Item 2: a regressed deadline fails instead of hanging

Mutant: `if (Date.now() >= deadline)` -> `if (false)` in killProcessGroup (copy, restored after).

```
not ok 43 - killProcessGroup gives up after maxMs, logs a warning naming the pgid, and returns
  failureType: 'testTimeoutFailure'   error: 'test timed out after 5000ms'
not ok 45 - the real liveness check sees a live group member: …
  failureType: 'testTimeoutFailure'   error: 'test timed out after 5000ms'
# tests 52  # pass 50  # fail 0  # cancelled 2      (whole run 15.3 s)
```
Before I added the `t.after()` stop hooks, the same mutant made the two tests fail on time but `node --test` did not exit within 60 s (the loop kept running); with the hooks it ends in 15 s. With the old test file and this mutant the run hung past 110 s (the r6 reviewer's finding).

## Item 3 mutant

serve.mjs `if (i >= 0 && (!args[i + 1] || args[i + 1].startsWith('--')))` -> `if (false)`: test 52 fails with the message in the RED block above; 51 others pass.

## Plan criteria and lint (worktree /home/user/wt-device-helper-server, staged tree 6dc4191e)

```
$ node --test tests/device-helper.test.js   # 3 runs: tests 52 pass 52 fail 0 cancelled 0, duration_ms 5786 / 5836 / 5821
$ npm test                                  # tests 95  pass 95  fail 0  cancelled 0
$ npx eslint -c .orchestrator/artifacts/round--eslint-r1e.config.mjs scripts/device-helper.mjs scripts/serve.mjs tests/device-helper.test.js   -> exit 0
C3 test -f scripts/device-helper.mjs && ! grep -nE "\bexec\(|execSync|shell: *true" scripts/device-helper.mjs   -> exit 0
C4 ! grep -n 'Access-Control-Allow' scripts/device-helper.mjs scripts/serve.mjs                                  -> exit 0
C5 ! grep -niE 'brightness|ddcutil|backlight|vcgencmd display_power' scripts/device-helper.mjs                   -> exit 0
C6 test -z "$(git status --porcelain -- js css index.html sw.js scripts/net.mjs scripts/mock-plex.mjs)"           -> exit 0
git status --short:  A scripts/device-helper.mjs / M scripts/serve.mjs / A tests/device-helper.test.js   (all staged, nothing committed)
```

## Notes for the conductor

- No mutation record was written into .orchestrator/artifacts; the output above is the only record.
- Leftover: the mktemp -d copy `/tmp/tmp.Plw994vPEH` (my mutant copy) and `/tmp/claude-0/dhs-r7-T` (a file holding its name) are still on disk; the safety check blocked my `rm -rf` of the substituted path, so I left them. They hold no running process. A `serve.mjs --mock --port 18962` under the session scratchpad `rv.JGLW` is still running; it is not mine (a reviewer's).
- The earlier hung `node --test` runs I started while writing the item 3 test (the server-started-anyway case) were killed with `pkill`; no `sleep 60` or my serve.mjs remained (checked with pgrep).
