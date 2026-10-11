produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: docs · round: r3 · mode: anchored
**Verdict:** APPROVE

Reviewer: docs-review-anchored-r3 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T21:02:52Z · Method: anchored doc review (delta-scoped confirmation round) · Scope: phase docs, round r3, delta 3b1f39a..5a4b5a9 (staged index of /home/user/wt-docs; `git write-tree` = 5a4b5a997ffd)

Criterion 8: PASS (doc-review band A-)

## What I read and ran

- Read: the r2 review (/home/user/plex-poster-app/.orchestrator/artifacts/docs--review-r2.md); plan `### 25. docs` criteria (docs/integration-plan.md:566-590); `git diff 3b1f39a 5a4b5a9` (README.md +6/-6, Roadmap.md +1/-1).
- Code checked, read-only, in /home/user/wt-docs (no worktree, no edits): js/main.js:408-428 (dailyReloadBlocker, reloadMustWait), 447-481, 580-592 (wake caller), 620-650 (manualWake); js/sleep.js:18-31; index.html `<dialog>` ids.
- Ran: `grep -niE "15 ?(s\b|sec)|hides? (itself|again)|K[0-9]+" README.md Roadmap.md`; criteria 1-7 verbatim from /home/user/wt-docs (all exit 0); `git diff --cached --check` (exit 0); `git diff --quiet -- README.md Roadmap.md` (exit 0, worktree == index); `git status --porcelain` (only `M README.md`, `M Roadmap.md`).

## Earlier findings

- **Important 1 (token-hide timer): resolved.** README.md:318 now reads "The token hides again when Settings closes." Matches settings-ui.js close/open paths cited in r2. The grep finds one other "15 seconds", README.md:309 ("Two holds do, for 15 seconds"), which is the controls reveal after a corner/Enter hold (kiosk.js REVEAL_MS). No other sentence claims a token timer.
- **Minor 1 (manual wake and 12 h reload): resolved.** README.md:192 "Waking the screen by a key or a touch does not trigger that 12-hour reload" matches main.js:588 `if (!asleep && why !== 'manual wake') requestReloadAfterWake()`; manualWake is bound to pointerdown and keydown (main.js:638-639). Wait list vs reloadMustWait (main.js:422-427): poster loads (`state.busy`), TV waking (`state.tvWaking`), manual wake (`manualWakeUntil`), mid-fade (`lastDrawAt` + crossfade), all present. The dialog condition is broader in code than in the text: see new Minor 1.
- **Minor 2: resolved.** README.md:298: `("never"; the value 2 itself is (verify))`.
- **Minor 3: resolved.** README.md:256 "... are unaffected (verify)."
- **Minor 4: resolved.** README.md:393 "should also end a command still running (verify)."
- **Minor 5: resolved.** "(K61)" removed from Roadmap.md:19.
- **Minor 6: resolved.** Banner (README.md:9), daily reload (192) and helper safety (393) are each split into short sentences. No meaning lost: the banner still lists flags, policies, package names, OS commands, helper commands and real-server behaviour.
- **Nothing else changed:** the diff touches only those seven lines.

## Strengths

- Every fix was made with the smallest possible edit, and the reload paragraph is now both correct and easier to read.
- The (verify) tags were added where real hardware decides the claim, and nowhere else.

## Issues

### Critical

None.

### Important

None.

### Minor

1. **The reload wait list names only Settings and Diagnostics. The code waits while any dialog is open.** code-bug (incomplete, does not mislead in a harmful direction). README.md:192 "The reload waits while Settings or Diagnostics is open." Code main.js:423 `if (document.querySelector('dialog[open]')) return 'a dialog is open';`. index.html also has `pin-dialog` and `shortcuts`. Fix (optional): "The reload waits while any window of the app is open (Settings, Diagnostics, the PIN pad or the shortcuts overlay)." Not blocking: the README never says a reload can happen while those two are open.
2. **"by a key or a touch" leaves out a mouse click.** code-bug, cosmetic. manualWake listens on `pointerdown`, which includes a mouse click (main.js:638). Fix (optional): "a key, touch or click", to match README.md:309's "A touch, click or key press".

## Declined to judge

- Roadmap.md:155 still cites "(K60)" in the engineering backlog. It is outside this delta, and r2 Minor 5 named only K61 in the user-facing 2.1 sentence. Backlog entries are aimed at developers.
- The rest of the README and Roadmap: r2 passed it and the delta does not touch it.

## Recommendations

- If anyone edits README.md:192 again, fold in both Minors. Neither needs another review round.

## Assessment

Every r2 finding is fixed as asked, with no collateral changes, and criteria 1-7 still pass on tree 5a4b5a9. The two new Minors are small omissions, not wrong statements a user would act on. Band A-, criterion 8 passes.

Files read: docs--review-r2.md, docs/integration-plan.md:566-590, the 3b1f39a..5a4b5a9 diff, js/main.js (408-481, 580-592, 620-650), js/sleep.js (via grep), index.html (dialog ids via grep), README.md/Roadmap.md (via grep).

**Verdict:** APPROVE
