# Brief — settings-sheet r6 (re-dispatch 4 of 5)

Agent name: settings-sheet-builder-r6 · effort: high · worktree `/home/user/wt-settings-sheet-r4` (the picked r4 tree staged). The r1–r4 briefs bind. E2E_PORT=24520 E2E_MOCK_PORT=24521. Stage, do not commit. Touch only the phase Output. Reviews: `/home/user/plex-poster-app/.orchestrator/artifacts/settings-sheet--review-r4.md` (Minors 1–5) and `--review-cold-r4.md`; triage in `.orchestrator/phases/settings-sheet.md` (Step 7 triage — r4).

1. S4A5 — the full suite must be green twice in a row. first-run's "a plex.tv network failure retries at most once per 30 s" failed under load ('2 pins after 29 s') because its fake clock runs in real time. Put that case (and any other first-run case that counts requests over simulated time) on a paused clock stepped with runFor/fastForward, or the checked-pause helper pattern from r3, so it measures simulated time only. Show it passing 20 runs under load (npm test looping alongside).
2. S4A1 — K52: in the cancel test, read the pin count BEFORE `page.click('#pin-cancel')`; show the mutant (remove `!pendingToken` from firstRunWanted) failing.
3. S4A2 — K51: extend the hour test to ~66 min and assert 5 quiet minutes after the 4th unused code; show the mutant (`unused = 0` after the rest) failing.
4. S4A3 — in tests/e2e/lib.mjs, a plex.tv request counts as answered only after fulfill or abort; continue() to plex.tv is flagged (it reaches the real service). Show the guard flagging a continue().
5. S4A4 — the empty card: during the 5-minute rest show only the rest message (no "enter this code:" and no placeholder squares); with an approved token waiting after a cancelled PIN, say the sign-in worked and to open Settings to finish, with the Open settings button. e2e for both; keep wording short and plain.
Run criteria 1–8 and the full `npm run test:e2e` TWICE in a row at the end; both must exit 0; paste both summaries. Lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/settings-sheet--handback-builder-r6.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: settings-sheet · round: r6`, header fields, blank line, `Agent: settings-sheet-builder-r6 · dispatched: <stamp>`.
