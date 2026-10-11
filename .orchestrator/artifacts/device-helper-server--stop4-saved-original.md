**Stop 4 — device helper at its retry limit, plus rulings to confirm (one reply covers all)**

Progress since stop 3: `settings-and-schedule-core` (33976fe), `rotation-layout-and-shell` (cc16968) and `cache-first-fetch` (e764aee) are committed and pushed. `sleep-mode` is in its final reviews.

1. **`device-helper-server` has used all 5 retries.** Both final security reviews APPROVE: no attack made it run a command, leak the token or leave a process behind. Every earlier finding is fixed. What's left:
   - A6-1 No test proves the helper notices a process that survives being killed; if that check broke, the lock would release early. (A test gap: the reviewer's mutant passes.)
   - A6-2 One test has no time limit, so a regression would hang the test run instead of failing it.
   - C6-3 A helper option given with no value (`--helper-power --helper-fake`) is silently ignored and the helper auto-detects instead of refusing to start.
   - Shipping as is: A6-3 a command that succeeds but leaves a background child holding its output gets a 504 (the child is still killed; no supported tool does this); A6-4 the reply can wait up to 10 s only when a child survives SIGKILL; C6-1 a child that starts its own session (`setsid`) escapes the kill — inherent to process groups; C6-2 stopping the server mid-command leaves that command running — under systemd (`KillMode=control-group`, the default) stopping the service kills it anyway, and the docs phase will say so; C6-4 a theoretical pid-reuse window in the clean-up kill (sub-millisecond, needs that exact pid reused) — a fix costs more than it prevents.
   **Recommended: (a) allow one more small round for A6-1, A6-2 and C6-3 only (tests plus the option check); ship the rest as is.** (b) Ship everything as is now. (c) Something else.
2. **Rulings I made alone** (reply "keep" or name any to change):
   - K2 The helper's status names where the temperature came from (`thermal_zone0`, `vcgencmd` or none).
   - K3 New number settings: junk or blank → the default; out of range → clamped; counts rounded.
   - K4 A cached poster that won't decode is dropped and downloaded once (no retry loop).
   - K5 Offline, the app can still pick a corrupt cached poster; that fix goes to `content-rating-filter`, which edits that code.
   - K7 The sleep test's "wake lock held" check means exactly one lock held and none released (the test harness counts locks).
   - K8 After every helper command, success included, its whole process group is killed, so nothing it started in the background survives.
   - K9 Sleep: playback always restarts the idle timer (with "wake on playback" off only the scheduled window stays dark); Pause stops the playback check; an open Settings/Diagnostics panel shows above the black screen.
   **Recommended: keep all.**
3. **K6 Product question.** If your Plex server keeps sending a broken image for one poster, the app downloads it once per rotation and shows the next one. Should it stop trying that poster? **Recommended: (a) no, leave it** (it costs one small download per rotation and heals itself when the artwork is fixed). (b) Skip a poster after 3 failures until the app reloads.
4. **Token rotation** is still open — reply with the four lines from the checklist whenever you've done it (it only blocks `real-server-validation` and the release).

Each answer's record lands in the decision log or a phase file.

Reply e.g. "1a, keep, 3a" — or "defaults".
