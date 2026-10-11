# Brief — kiosk-and-pin r5 (re-dispatch 3, BRANCH candidate)

Agent name: kiosk-and-pin-builder-r5 · effort: high · worktree `/home/user/wt-kiosk-and-pin-r5` (the r3 tree staged; branch orch/kiosk-and-pin-r5). The r1–r3 briefs bind. E2E_PORT=22720 E2E_MOCK_PORT=22721. Stage, do not commit. Work ONLY in that worktree. Reviews: `/home/user/plex-poster-app/.orchestrator/artifacts/kiosk-and-pin--review-r3.md` and `--review-cold-r3.md`; triage in `.orchestrator/phases/kiosk-and-pin.md` (Step 7 triage — r3).

APPROACH r5 (single source of truth): the prompt keeps NO in-memory lock copy — `verify()` and `submit()` read `plexPoster.pinLock` through parseLock (with the clamp) every time and write it back after each attempt (a storage-less fallback may keep a module variable only when localStorage is unavailable); the reset branch only clears storage.

Fix, tests first (paste each failing on the r3 code before the fix):
1. KCI1 (cold Important 1): in the PIN dialog ignore keydown with `e.repeat`; an entry shorter than PIN_MIN is never counted as a wrong PIN (show a hint instead). e2e: with a PIN set and the Settings button focused, `keyboard.down("Enter")` ×9 then up → `plexPoster.pinLock` has no failures and the correct PIN then opens Settings.
2. KCM1 (cold Minor 1): a stored `lockedUntil` more than 15 min ahead is clamped to now + 15 min when read (parseLock) and when written. Unit: a lock set 1 day ahead expires 15 min later.
3. KAM1 (anchored Minor 1): the Enter hold starts only on a keydown with `!e.repeat` that was not swallowed by the sleep wake; a held Enter through a wake from sleep does not reveal the controls. e2e if natural.
4. KAM2 (anchored Minor 2): the PIN dialog Cancel button is at least 48 px tall.
5. KAI1 (anchored Important 1 = cold Minor 2): after a resetPin load the lockout is fully cleared for that session — APPROACH BELOW. e2e: seed a PIN with a lock of 9 failures / 14 min, route config.json to {"resetPin": true}, open Settings (no PIN), set a new PIN, Save, press `s`, enter the new PIN → Settings opens; one wrong PIN does NOT lock (failure count restarted).
Run criteria 1–6 and the full `npm run test:e2e`, lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`, and paste outputs. Touch only the phase Output.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/kiosk-and-pin--handback-builder-r5.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: kiosk-and-pin · round: r5`, header fields, blank line, `Agent: kiosk-and-pin-builder-r5 · dispatched: <stamp>`.
