produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: display-decode-hang · round: r1 · mode: anchored
**Verdict:** APPROVE

Reviewer: display-decode-hang-review-anchored-r1 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T13:03:26Z · Method: anchored code review · Scope: display-decode-hang, r1, base 9bce60c, tree 086a7de (staged index of /home/user/wt-display-decode-hang)

## Read and ran
- Read: `git diff --cached` in the worktree; `js/display.js` show() (lines 137-173 of the reviewed tree); `js/main.js` tick() and handleFailure() (lines 112-170), fetchImage (85-110), KEYS (498); `tests/e2e/lib.mjs` (withApp, mock helpers); plan phase 28; decisions.md D30; phase record.
- Scratch: `mktemp -d` gave /tmp/tmp.cxCs54jt3B. `git worktree add --detach` at 9bce60c, then the staged patch applied; `git write-tree` = 086a7de (it matches the reviewed tree). node_modules was symlinked. Ports 20710/20711 and 20720/20721. The worktree was removed afterwards, and the live index still writes tree 086a7de.
- `npm test`: pass 160, fail 0. `node scripts/check-precache.mjs`: 25 precached files OK.
- `npm run test:e2e -- display-decode`, run twice: both PASS. Each run printed `60 presses, 62 decodes, 0 late` for crossfadeMs 0 and for 1200.
- Spec against the base `js/display.js` (git show 9bce60c:js/display.js): FAIL, `crossfadeMs 0: press 2 did not draw within 5000 ms (draws 2, active layer 0, pending decode ages [4994])`. The fixed file was restored afterwards.
- Ad-hoc stall spec (scratch only, `tests/e2e/stall.spec.mjs`, deleted with the worktree), for crossfadeMs 1200 and 0:
  - A: 80 seeded-random actions spaced 0 to crossfadeMs+400 ms apart: refresh (R), rotate (O) mid-crossfade, viewport resize, mock now-playing play/switch/stop. Afterwards: a forced refresh still draws, no decode() is pending longer than 3 s, and no live object URL is unreferenced. Result: `A cf1200 ok, pendingOld 0, live 1, orphan 0`; `A cf0 ok, pendingOld 0, live 1, orphan 0`.
  - B: 40 refreshes while the transcode route cycles through normal / 2.5 s slow / 200 with non-image bytes (decode fails) / connection reset. After unroute, a refresh draws and nothing is pending. Result: ok for both crossfades. The reset requests made the app fall back to `directImages` (string URLs), which is why live=0; that is main.js behaviour, outside this diff.
  - C: one poster decode() replaced by a promise that never settles, so the 20 s backstop has to act on its own. Result: `stuck-at-3s=true recovered=true after ~21s`.
- Mutation (scratch): I removed the "revoke stale URL on claim" block. Stall A then reported `live 25, orphan 24` (object URLs leaked). The plan spec still PASSED under this mutation (see Minor 1). Reverted.

## Strengths
- The root cause is closed where it starts. `owners.set(next, ++drawSeq)` runs before `next.src = url`. Each cleanup timer captures `owners.get(prev)` when it is scheduled and acts only if that value is unchanged. The next draw always claims the old `prev` layer (layers alternate), so a timer can never remove the src of a layer a newer draw is decoding on. This matches the plan note's suggested "draw generation counter" and D30.
- No URL leak from the skipped timer. When a draw claims a layer whose earlier URL is still in `objectUrls`, it revokes that URL at once (display.js, the `stale` block). The mutation shows this block is load-bearing (24 orphans without it), and the shipped code ends with 0 orphans.
- The 20 s bound is a sound backstop. `decodeWithin` clears its timer in `finally`. A rejection reaches show()'s catch, which revokes a Blob URL and throws. tick()'s catch then calls handleFailure, and its `finally` clears `state.busy` (main.js 124-148). handleFailure's own `display.show(...).catch(() => {})` runs inside the same busy section, so shows stay serialised. Run C confirms recovery at about 21 s.
- The crossfade is unchanged. The `.active` add/remove order, the `front` flip and the timer delay (`crossfadeMs + 200`) are all the same. No CSS changed (criterion 4 scope), and the computed transitionDuration stayed 1.2s / 0s. The only behavioural difference is that a timer skips a layer a newer draw already re-sourced, which is not visible.
- The spec has teeth: it fails at press 2 against the base, it was stable 2/2 here (5/5 per the builder), and it reports a `late` count instead of failing on scheduler drift.

### Critical
None.

### Important
None.

### Minor
1. **The spec does not detect an object-URL leak** (spec-gap). `tests/e2e/display-decode.spec.mjs` checks draws and pending decodes but not live object URLs. With the stale-revoke block removed, the spec still passes while 24 URLs leak over 80 actions (mutation above). The criteria do not ask for this, so it is not a code-bug, and the shipped code does not leak. Fix, if wanted: wrap `URL.createObjectURL`/`revokeObjectURL` in `instrument()` and assert at the end that no live URL is unreferenced by a `.poster-layer` src.
2. **The timing probe loses force on a loaded runner** (spec-gap, informational). If presses fall `late`, the gap drifts away from crossfadeMs+200 ms and the race window may be missed. The test then still passes, so it does not flake, but it proves less. Both local runs had 0 late. A possible fix: fail, or warn loudly, when `late` exceeds a few presses.

## Declined to judge
- The `directImages` fallback triggered by a connection-reset image fetch (main.js fetchImage) is outside this diff and was not changed by it.
- The extra decode() in each run (62 decodes for 61 draws) comes from a non-poster image (frame or probe) outside show(). It is harmless and outside scope.
- Whether content-rating-filter case 18 becomes stable belongs to that phase.

## Recommendations
- Optional: take up Minor 1 in a later spec touch so a regression in the revoke block is caught.

## Assessment
The fix closes the Q25 race at its source with a per-layer ownership check, releases URLs the skipped timer would have freed, and adds a sound 20 s decode backstop whose rejection the caller already handles. Criteria 1-3 pass here, and criterion 2 fails against the base as the plan requires. None of my stall attempts (rapid and jittered refreshes, now-playing switches, forced ticks, rotate/resize mid-crossfade, slow, undecodable and reset images, a hung decode) stopped rotation.

Criterion 5 stall attempts: PASS

**Verdict:** APPROVE
