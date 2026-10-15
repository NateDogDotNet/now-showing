# Brief — limit-and-reload-fixes review r2 (cold, full re-review)

Agent name: fixes-review-cold-r2 · round: r2 · dispatched: 2026-10-15T00:23:19Z

You are the `orchestrator-reviewer`, cold lens: you get the diff and the code it touches, and nothing that explains intent. Read-only on the repository; write only your verdict file. You may run `node --test <file>` and single e2e specs from the worktree (`ln -s /home/nathan/plex-poster-app/node_modules node_modules`, `E2E_PORT=18680 E2E_MOCK_PORT=19001 node tests/e2e/run.mjs <name>`, remove the link afterwards), one at a time; not the full suite.

Diff: `git -C /home/nathan/wt-limit-and-reload-fixes diff --cached` (base 6363763). The repository is a static browser PWA (plain ES modules) that shows Plex movie posters on an always-on display, with an offline poster cache in the Cache API plus a localStorage index, a household content-rating limit, a daily page reload with wait rules, a service-worker update path, and a `config.json` provisioning path on first boot. Read the touched functions in full plus their callers (`js/main.js`, `js/plex.js`, `js/poster-cache.js`, `js/engine.js`, `js/ratings.js`), the touched tests and `scripts/mock-plex.mjs`.

Try to break it. For each change ask: what input or sequence makes it do the wrong thing? In particular:
- The cache index's `contentRating` and the new `episodeRating` flag: every writer and reader of that field; what happens to a poster object that carries `episodeRating` when it reaches code that did not expect the field (the overlay, the pin, the export, `random()`, the batched re-check in `js/engine.js`, `items()`); what a stale index entry from a 2.0 install contains and how it is read.
- `reloadPending = 'update'`: every assignment and read of `reloadPending`; whether an update reload can fire at a wrong moment or never; interaction with `skipReload`, `reloadMustWait`, the sleep veil, the manual wake, the PIN dialog; what happens when a second update arrives while one is pending.
- The provisioning marker write: ordering with `announceWhatsNew`, the PIN reset flag, and a config.json that fails to provision.
- The empty-card condition: `cache.entries()` on the failure path, `allows()` semantics for '' and unknown values.
- The new tests: do they test the behaviour or the implementation; could they pass with the fix reverted; are there timing-dependent waits.

Write your verdict to `/home/nathan/plex-poster-app/.orchestrator/artifacts/limit-and-reload-fixes--review-cold-r2.md`. First line: `Agent: fixes-review-cold-r2 · model: <model> · dispatched: 2026-10-15T00:23:19Z`. Then `Verdict: APPROVE | REQUEST CHANGES`, then `## Issues` (each `N. **Critical|Major|Minor**, file:line`, with the command or quote that shows it and the concrete breaking input), then `## Checked and clean`.
