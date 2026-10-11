Reviewer: e2e-harness-review-anchored-r2 · Model: opus · Dispatched: 2026-10-08T22:24:39Z · Method: anchored confirmation code review, delta-scoped · Scope: e2e-harness, round r2, reviewed base tree 6357fda (r1) → staged tree c5b1cb8

## What I read and ran

Read: my r1 review (`e2e-harness--review-r1.md`), the r2 brief (`e2e-harness--brief-r2.md`), the r2 delta (`e2e-harness--delta-r2.patch`, 6357fda → c5b1cb8). For context I also looked at the `spawn` lines in `tests/e2e/lib.mjs` and at `node_modules/playwright-core/lib/server/utils/processLauncher.js:108-111`.

Where I ran things: I made a private directory with `mktemp -d` under the session scratchpad (`rev2.4x5t`). I created a worktree there with `git worktree add --detach … HEAD`, then ran `git read-tree -u --reset c5b1cb8`, and `git write-tree` printed `c5b1cb8f…`. I ran `npm ci` in it. Every run used `E2E_PORT=28080 E2E_MOCK_PORT=28401`. I wrote my throwaway specs (`zhang`, `zquick`, `zstray`) there and deleted them afterwards. I reverted every `lib.mjs` mutation with `cp ../lib.orig` and checked that `git write-tree` was still `c5b1cb8`. At the end I removed the worktree (`git worktree remove --force`, `rm -rf`). The live worktree's `git write-tree` still prints `c5b1cb8`, and no process is left holding 28080 or 28401.

| Check | Result |
|---|---|
| `npm run test:e2e -- smoke` | all 12 `ok` lines, `PASS smoke`, 6.5 s |
| `npm test` | `# pass 29`, `# fail 0` |
| `node scripts/check-precache.mjs` | `23 precached files OK` |
| Hanging spec (`withApp({serveArgs:[]})`, `waitForFunction(()=>false,{timeout:0})`), then `zquick`, with `E2E_SPEC_TIMEOUT=5` | prints exactly `FAIL zhang (timeout)`, then `PASS zquick`; `exit=1` after 7 s total. The dedicated ports (39471, 34187) and the shared ports (28080, 28401) all return `000` afterwards. No Chromium process is left |
| SIGTERM to the runner 4 s into `zhang` (`E2E_SPEC_TIMEOUT=60`) | runner `exit=130`. Dedicated ports (33463, 36335) and shared ports return `000`. `pgrep chrom\|zhang` finds 0 |
| SIGINT, same setup | `exit=130`. All ports return `000`, 0 processes left |
| Spec that exits normally but leaves a non-detached child running (`zstray`), followed by `zquick` and `smoke` | `PASS zstray`, `PASS zquick`, `PASS smoke`, `exit=0`. The stray pid 30732 is gone. The sweep killed the straggler without harming the next specs |
| `E2E_SPEC_TIMEOUT=abc` with `zquick` | `FAIL zquick (timeout)`, `exit=1` (see Minor 1) |
| CI YAML parsed with `yaml.safe_load` | `timeout-minutes: 20`. Step order: `npm ci`, `npm test`, `check-precache`, `playwright install`, `test:e2e` |

A process tree taken during the SIGTERM test (`ps -eo pid,pgid,ppid`) shows the runner (pgid 30547), the shared server (pgid 30547), the spec (pid/pgid 30562) and its dedicated server (pgid 30562). Chromium `headless_shell` is pid 30580 in **its own group, 30580**, because Playwright spawns it with `detached: process.platform !== "win32"` (`processLauncher.js:111`).

Mutation teeth on `lib.mjs`. After each mutation I ran smoke and then reverted.

| Mutation | Smoke |
|---|---|
| `whatsNew` not seeded | FAIL |
| `dailyReload: true` default | FAIL |
| `sentinel.released = true` removed | FAIL |
| release listeners not called | FAIL |
| `wl.held--` removed | FAIL |
| `viewport` ignored (always 1280) | FAIL |
| `isMobile` forced to false | FAIL |
| double-release guard removed | PASS (not asserted; trivial) |

## Status of r1 findings

1. **Important 1, no spec deadline and orphans after a signal: resolved.**
   - `run.mjs` now does what the brief asks:
     - it reads `E2E_SPEC_TIMEOUT` (default 180 s);
     - it spawns each spec with `detached: true` and kills it with `process.kill(-pid,'SIGKILL')` on the deadline;
     - it prints exactly `FAIL <name> (timeout)`, moves on to the next spec, and exits non-zero at the end;
     - `cleanup` kills both the current spec's group and the shared server, and it runs on `exit`, which SIGINT and SIGTERM reach through `process.exit(130)`.
   - CI now has `timeout-minutes: 20`.
   - Evidence: the hang, SIGTERM and SIGINT rows above.
2. **Minor 2, smoke left contract defaults unasserted: resolved.** The new assertions check `whatsNew`, `dailyReload`, the request and release counters, `innerWidth`, and the isMobile 980 px layout against a non-mobile 500 px control. Every one has teeth: each related mutation fails smoke.
3. **Minor 3, wake-lock stub fidelity: resolved.**
   - `released` becomes true after `release()`.
   - `'release'` listeners fire, and so does `onrelease`.
   - `held` goes down and `releases` goes up on release.
   - Smoke asserts the exact counter objects before and after release, plus `fired === 1`. The mutations fail.
4. **Minor 4, CI step order: resolved.** `check-precache` now runs before the Chromium install (YAML parse above).
5. **Minor 5, pass-through check reads `app.spawned`: accepted.** It was not in the r2 brief, so the conductor did not take it up. The risk is unchanged and low.

## Strengths

- When a spec exits normally, the `killGroup(p)` call in the exit handler sweeps any stragglers left in its group. It cannot hit the next spec, because the next spec is spawned only after the promise resolves and gets a new group. `ESRCH` is swallowed. Shown with `zstray`.
- The timeout path and the normal-exit path share one `exit` listener that clears the timer and resets `current`, so a timer cannot fire late and kill a reused pid.
- Because specs are detached, a terminal Ctrl-C reaches only the runner's foreground group. The runner then kills the spec group itself, so specs get deterministic cleanup, not a racing SIGINT.
- The isMobile assertion uses a real layout signal (a 980 px layout viewport when there is no viewport meta) and checks it against a non-mobile control at the same window size. It is not a UA string comparison.

## Issues

**Minor**

1. **A non-numeric `E2E_SPEC_TIMEOUT` turns into an immediate timeout for every spec.**
   - Location: `tests/e2e/run.mjs:22`, `Number(process.env.E2E_SPEC_TIMEOUT || 180) * 1000`.
   - Evidence: `E2E_SPEC_TIMEOUT=abc` gives `FAIL zquick (timeout)` and `exit=1`. The value is `NaN`, and `setTimeout` treats `NaN` as 1 ms.
   - Why it matters: it fails loud, not falsely green, so the harm is a confusing message. A negative value behaves the same way.
   - Class: spec-gap. The brief does not say how bad values should be handled.
   - Fix: if the value is not a positive finite number, either fall back to 180 or exit with `invalid E2E_SPEC_TIMEOUT`.

2. **The comment on the sweep is inaccurate about Chromium, and Chromium's cleanup depends on Chromium itself.**
   - Location: `run.mjs`, the comment `// sweep stragglers (Chromium, dedicated server) left in the group`.
   - Evidence: Chromium runs in its own process group (pgid 30580, not the spec's 30562; `processLauncher.js:111` sets `detached`), so `process.kill(-spec.pid)` never signals it.
   - What happens in practice: after the spec is SIGKILLed, Chromium exits on its own when its `--remote-debugging-pipe` parent goes away. In the timeout, SIGTERM and SIGINT runs, 0 Chromium processes were left. The brief's proof ("no … Chromium behind") holds as observed, but the reason is Chromium's pipe-close behaviour, not the group kill.
   - Class: code-bug (the comment is wrong). Behaviour is fine.
   - Fix: correct the comment. Optionally, have `lib.mjs` record the browser pid and kill it too, but that is not needed.

## Declined to judge

- **Portability:** negative-pid kill on Windows and macOS is out of scope, as the prompt says; CI is Linux.
- **The mid-spec signal window:** if a signal arrives between `current = null` and the next `spawn`, there is nothing left to kill, and I see no race. I did not test that narrow window directly.
- **Unchanged r1 code** outside the delta.

## Recommendations

1. Optionally validate `E2E_SPEC_TIMEOUT` (Minor 1), and fix the sweep comment (Minor 2). Neither blocks approval.

## Assessment

The delta closes every item in the r2 brief. Each one was shown by a run in an isolated worktree on non-default ports:
- the deadline prints exactly `FAIL <name> (timeout)` and the run continues;
- SIGTERM and SIGINT leave no spec, server or Chromium behind;
- the normal-exit sweep kills stragglers without touching the next spec;
- the new smoke assertions all have teeth;
- the stub is faithful;
- the CI order and the timeout are correct.

Plan checks C1, C3 and C5 still pass. The two remaining findings are Minor.

**Verdict:** APPROVE
