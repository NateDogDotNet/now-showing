# Brief — metadata-and-now-playing r3 (re-dispatch 2)

Agent name: metadata-and-now-playing-builder-r3 · effort: high · worktree `/home/user/wt-metadata-and-now-playing` (r2 staged). Earlier briefs bind. E2E_PORT=21420 E2E_MOCK_PORT=21421. Stage, do not commit. Touch only the phase Outputs.

From the r2 reviews (`artifacts/metadata-and-now-playing--review-r2.md` Important 1 and `--review-cold-r2.md` Important 1 + Minors 2, 3); tests first, paste them failing on the r2 tree:
1. MCI1 (child safety, D37): the rating re-check must cover EVERY cached key, not only the newest 100 — split the cached keys into batches of 100 (the cache holds at most 300, so ≤3 requests per pool load); keys not returned, keys of a failed batch, and any key not asked for at all are stored as unrated (fail closed). Unit test with 250 cached keys: all 250 are reported, and a key whose batch fails is unrated; e2e if natural.
2. MCM2: toggling the progress bar or the player label in Settings shows in the live preview, and after Save it applies at once even while a tick is running.
3. MCM3: buffering freezes the bar like paused (only `playing` animates).
Criteria 1–6 must still pass; paste them. Lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`. Write nothing outside the worktree except the handback (scratch → /tmp, never the filesystem root).

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/metadata-and-now-playing--handback-builder-r3.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: metadata-and-now-playing · round: r3`, header fields, blank line, `Agent: metadata-and-now-playing-builder-r3 · dispatched: <stamp>`.
