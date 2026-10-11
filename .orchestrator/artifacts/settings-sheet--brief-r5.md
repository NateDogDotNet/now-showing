# Brief — settings-sheet r5 (re-dispatch 3, BRANCH candidate)

Agent name: settings-sheet-builder-r5 · effort: high · worktree `/home/user/wt-settings-sheet-r5` (the r3 tree staged; branch orch/settings-sheet-r5). The r1–r3 briefs bind. E2E_PORT=24320 E2E_MOCK_PORT=24321. Stage, do not commit. Work ONLY in that worktree. Reviews: `/home/user/plex-poster-app/.orchestrator/artifacts/settings-sheet--review-r3.md` and `--review-cold-r3.md`; triage in `.orchestrator/phases/settings-sheet.md` (Step 7 triage — r3); K50 is the conductor's cadence ruling.

APPROACH r5 for item 3: stop the card's code flow as soon as ANY PIN prompt opens (as it already stops when Settings opens) and restart it with a fresh code when the prompt closes without opening Settings, so an approval can never land mid-prompt.

Fix, tests first (paste each failing on the r3 code):
1. SSC1: the "Turn off \"unwatched only\"" fix (`runFix("unwatched")` in js/main.js) goes through requestPin like the other fixes. e2e: PIN set, unwatchedOnly true, empty library → press the fix on the empty card → the PIN dialog opens; wrong PIN keeps unwatchedOnly true; right PIN sets it false. Same from the error toast.
2. SSC2: offer that fix only when unwatchedOnly is on. e2e: limit G with every title rated R, unwatchedOnly off → no unwatched fix on the empty card.
3. SSC3: an approved first-run code is never lost when it is approved while a PIN prompt is open — APPROACH BELOW. e2e that reproduces the loss on r3 first: PIN set, unconfigured, open the PIN prompt (press s), approve the card's code on the routed plex.tv, then enter the PIN → Settings opens pre-filled with the new token (or, per the approach, the code flow was stopped and no approval was possible).
4. SSC4: the Custom minutes field shows exactly what will be saved (no 0.25 → "0.3" drift; retyping what it shows saves the same seconds). Unit or e2e.
5. K50 (SSC5): poll the plex.tv code every 5 s while it is fresh; after 3 codes expire unapproved, wait 5 min before requesting the next; no polling while asleep. e2e with the fake clock and the routed plex.tv: request counts over 1 h stay small.
6. SSA2: in tests/e2e/lib.mjs, a plex.tv request counts as routed only when a route handler actually fulfils or continues it; a token-carrying context that routes only some plex.tv paths gets the rest flagged. Show the guard catching an unrouted path.
Run criteria 1–8 and the full `npm run test:e2e` once at the end; lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`; paste outputs. Touch only the phase Output.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/settings-sheet--handback-builder-r5.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: settings-sheet · round: r5`, header fields, blank line, `Agent: settings-sheet-builder-r5 · dispatched: <stamp>`.
