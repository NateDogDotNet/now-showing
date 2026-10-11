produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: metadata-and-now-playing · round: r3 · mode: anchored
**Verdict:** APPROVE
Reviewed base: bc50606 (delta-scoped)

Reviewer: metadata-and-now-playing-review-anchored-r3 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T17:16:06Z · Method: anchored confirmation review (delta-scoped) · Scope: metadata-and-now-playing, r3, base tree bc50606, tree f35fa8f (staged index of /home/user/wt-metadata-and-now-playing; `git write-tree` = f35fa8f9…, unchanged after review)

## What I read and ran
- Read: `git diff bc50606 f35fa8f` (js/engine.js, js/display.js, tests/engine.test.js, tests/e2e/now-playing.spec.mjs); docs/decisions.md D37; phase record "Step 7 triage — r2" plus K27; f35fa8f:js/plex.js:100-110 (where `playerState` comes from); f35fa8f:js/main.js:120-140 and 470-495 (blockPoster / updateNowPlaying / applySettings order).
- Scratch copy: checked out f35fa8f into a `mktemp -d` dir (/tmp/tmp.2NYg7GyVTu, now removed). Side effect: my first command ran `git commit-tree f35fa8f`, which left one unreferenced commit object in the worktree's object store. Working tree, index and refs were not touched.
- `node --test tests/*.test.js`: 233 pass, 0 fail (engine.test.js: 51/51).
- Mutation A (engine: `break` after the first batch): 4 unit tests fail. Reverted.
- Mutation B (engine: no per-batch try/catch, so one failed batch throws): tests 47 and 51 fail. Reverted.
- E2E (playwright, E2E_PORT=21710/21711): `E2E_NP_ONLY='^(3|11|12) '`, cases 3, 11 and 12 PASS.
- Mutation C (display: drop `redrawNowPlaying()` from `apply`): with E2E_PORT=21720, case 12 FAILS ("the previewed bar did not happen within 2000 ms"). Reverted.

## Confirmations
- **MCI1: resolved.** At engine.js:44-55 all `cachedKeys()` go out in slices of 100, for at most 3 requests (`n < RECHECK_REQUESTS && n*RECHECK_BATCH < keys.length`). Each batch has its own try/catch, so a failed batch does not stop later batches. `onRatings` gets every cached key, and a key with no confirmed row is stored as `contentRating: ''`. That covers a key the response leaves out, every key of a failed batch, and keys past 300 that are never asked. Tests 46-49 cover 250 keys split [100,100,50], a failed middle batch, a key left out of batch 2, and 350 keys (3 requests, keys 301+ unrated). Mutations A and B are both caught by these tests. This meets D37's fail-closed rule. Splitting the "one batched request" into at most 3 batches is what the r2 triage ruled.
- **MCM2: resolved.** `apply()` calls `redrawNowPlaying()` when showProgress or showPlayer changes. It does this synchronously, before the frame load, and does not wait for a tick. The live preview goes through the same `display.apply` call (main.js:485), so the preview gets the redraw too. E2E case 12 covers preview, Cancel, and Save while a `/status/sessions` poll is held back, and mutation C makes it fail. No jump: a redraw places the bar at `viewOffset + (Date.now() - drawnAt)`, but only while the session is `playing`. That is the same position the linear transition has reached, and the transition is then restarted for the remaining time.
- **MCM3: resolved.** The bar now animates only when `playerState === 'playing'`. plex.js:109 sets `playerState`, and the field was already there at bc50606. Buffering and paused sessions sit still. E2E case 11 checks the bar stays at 50% with no running animations, then advances once the state is `playing` again. The conductor's buffering-animates mutation was killed.
- **Content-rating guarantee: not weakened.** `redrawNowPlaying` only redraws the session that `setNowPlaying` last stored. In applySettings, `blockPoster()` (which calls `setNowPlaying(null)`) runs before `display.apply` (main.js:479-485). So a now-playing title that a newly saved limit disallows is cleared first, and the redraw does nothing. A preview never changes the limit (main.js:474-477). The redraw can show only the bar and "Playing in <player>", never a poster or a title. The engine's fail-closed set only grew: from the 100 newest keys to all of them.

## Strengths
- The per-batch try/catch plus the single `onRatings` call over the full key list keeps the fail-closed rule in one place.
- The tests assert the batch split, the order the keys are asked in, and the key count, so a regression to "first 100 only" or "stop at first failure" is caught.

### Critical
None.

### Important
None.

### Minor
1. **The "bar does not jump" part of MCM2 has no test with teeth** (spec-gap, test coverage only). Case 12 uses a 6000 s duration and a ±0.02 tolerance. A mutation that redraws with `elapsed = 0` (the bar snaps back to the last poll's offset) would still pass. The code is correct (display.js:126-127). Fix, optional: in case 12, use a short duration (for example 20 s), wait about 2 s, toggle the label only, and assert the bar's ratio did not drop.

## Declined to judge
- MCM1 (K18 scope) and MCM4 (re-check cadence, ruled by K27): both ruled earlier, not reopened.
- Files outside the delta (css/app.css, index.html, js/main.js beyond the lines read): outside this delta-scoped review.

## Recommendations
- Optionally tighten E2E case 12 as described in Minor 1.

## Assessment
The delta resolves MCI1, MCM2 and MCM3 as the r2 triage asked. The new tests catch regressions (mutations A, B and C were all caught), and the content-rating guarantee from D37 is unchanged or stronger.

**Verdict:** APPROVE
