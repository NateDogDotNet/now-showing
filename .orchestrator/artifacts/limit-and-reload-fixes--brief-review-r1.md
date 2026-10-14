# Brief — limit-and-reload-fixes review r1 (anchored)

Agent name: fixes-review-anchored-r1 · phase: limit-and-reload-fixes · round: r1 · dispatched: 2026-10-14T23:52:06Z

You are the `orchestrator-reviewer`, anchored lens. Read-only on the repository; write only your verdict file. Do not run the full e2e suite (the conductor has); single specs (`E2E_PORT=18580 E2E_MOCK_PORT=18901 node tests/e2e/run.mjs <name>` from the worktree, after `ln -s /home/nathan/plex-poster-app/node_modules node_modules`, removed afterwards) and `node --test` are fine, one at a time.

Review the staged diff in `/home/nathan/wt-limit-and-reload-fixes` (`git -C /home/nathan/wt-limit-and-reload-fixes diff --cached`, base 6363763) against:
- the phase `### 30. \`limit-and-reload-fixes\`` in `/home/nathan/plex-poster-app/docs/integration-plan.md` (Output, criteria 1–9, Notes);
- `docs/decisions.md` D73 (the four findings and the routing), D37 (fail closed offline; the batched re-check), D33;
- the four findings verbatim in `.orchestrator/artifacts/release-bump--code-review-r1-transcribed.md` (lines 238, 1241, 1433, 315 of js/main.js as it was);
- the builder brief `.orchestrator/artifacts/limit-and-reload-fixes--brief-r1.md` (hazards) and handback `limit-and-reload-fixes--handback-builder-r1.md` (its three recorded deviations).

Check, with a command or quoted line for each claim:
1. **F1, the offline limit:** with the diff applied, walk the review's scenario (limit PG; a TV-MA show cached from the pool; a TV-PG episode of it plays; Plex unreachable) through `toPoster` → `permitted`/the engine → `cache.refreshRating` → `fetchImage` → `cache.put` → `cache.random`. Does the show's stored rating stay TV-MA? Then the inverse (an unrated episode must not hide a PG show). Then a show never cached before whose episode plays: stored '' → hidden offline under a limit (D37 fail closed) — confirm. Does the now-playing episode itself still obey the ONLINE limit by its own rating (2.1 behaviour: `permitted` checks the episode's rating when "apply the limit to what's playing" is on)? Does `grandparentContentRating`, when Plex sends it, flow correctly? Is there any other writer of the index's `contentRating` (grep `contentRating` in js/) the fix missed?
2. **F7, the update reload:** `reloadPending = 'update'` is consumed by `runDailyReload`; confirm who calls it and how often when the daily reload setting is OFF (the builder's deviation: the daily-reload blocker, 10-minute gap and probe do not apply to the update reload; is that right, and can an 'update' reload loop or fire during the PIN prompt, a decode, a manual wake, or the sleep veil?). Does `skipReload` still clear a 'scheduled'/'wake' reload correctly? Is there a path where an 'update' pending reload is never serviced (e.g. the tick that calls runDailyReload only runs with dailyReload on)?
3. **F5:** the marker is written at provisioning; confirm an upgraded stored install (settings stored, no marker) still sees the toast, and a first boot with no config.json and no settings does not.
4. **F6:** the limit wording appears only when cached entries exist and none passes `allows()`; confirm `allows` and `cache.entries()` are in scope in main.js and that `entries()` is cheap enough on the failure path.
5. **Tests pin the behaviour:** for each new unit/e2e case, would it fail against the base commit? (Reason from the code; running a single spec against the base is allowed if cheap.) Name any case that would pass before the fix.
6. **Scope and hazards:** only the Output paths staged; the cache key scheme unchanged; `VERSION` untouched; `tests/e2e/lib.mjs` untouched; the mock's new `episode=1` option changes no existing behaviour.

Write your verdict to `/home/nathan/plex-poster-app/.orchestrator/artifacts/limit-and-reload-fixes--review-anchored-r1.md`. First line: `Agent: fixes-review-anchored-r1 · model: <model> · dispatched: 2026-10-14T23:52:06Z`. Then `Verdict: APPROVE | REQUEST CHANGES`, then `## Issues` (each `N. **Critical|Major|Minor · code-bug|spec-gap**, file:line`, with the command or quote that shows it), then `## Checked and clean`.
