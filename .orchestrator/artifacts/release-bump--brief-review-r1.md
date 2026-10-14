# Brief — release-bump review r1 (anchored)

Agent name: release-review-r1 · phase: release-bump · round: r1 · dispatched: 2026-10-14T22:03:04Z

You are the `orchestrator-reviewer`, anchored lens. Read-only on the repository; write only your verdict file. Do not run the e2e suite (the conductor has run it); `node --check`, grep and small node one-liners are fine.

Review the staged diff in `/home/nathan/wt-release-bump` (`git -C /home/nathan/wt-release-bump diff --cached`, base fdcf53d) against:
- the phase `### 26. \`release-bump\`` in `/home/nathan/plex-poster-app/docs/integration-plan.md` (Output, criteria 1–9, Notes);
- `docs/decisions.md`: D11, D13, D16, D48, and D51–D71 (each is the spec for one Roadmap entry);
- the builder brief `/home/nathan/plex-poster-app/.orchestrator/artifacts/release-bump--brief-r1.md` (its hazards and the README tag list) and the handback `release-bump--handback-builder-r1.md`;
- the validation results `docs/validation/real-server-core.md` and `docs/validation/real-server-extended.md` (what a passing row proves).

Check, with a command or a quoted line for each claim:
1. **README (verify) tags (K61):** every tag the builder removed is backed by a PASS row (name the row); every tag that stays is for something no row proved (Pi rows SKIPPED, V1-E04 country prefixes, the managed-user line). Nothing untagged that a SKIPPED row covers. The banner's numbers (17 core, 15 extended non-Pi, 12 skipped) match the files.
2. **README wording fixes (docs r3, D48):** the daily-reload sentence names every dialog the code waits for (`js/main.js` `dialog[open]`; the dialogs in index.html are settings, diagnostics, pin-dialog, shortcuts) and the wake wording covers key, touch and click (`pointerdown`).
3. **Roadmap vs D51–D71:** for each D-entry, the Roadmap entry carries its substance, its constraints and its order, and does not promise anything the D-entry marks (verify) or unconfirmed (TMDB/IMDb terms; Google Photos/iCloud; Hubitat/Homey/SmartThings/HomeKit; Plex theme and watchlist APIs; smart-crop detection on a Pi). Merged entries keep the old names as text (D57 note; the done `docs` phase's criterion 6 greps "Remote control", "Frame per poster source", "Multi-poster landscape layout", "Animated frame bulbs", "Frame rotation"). The "Suggested order" section matches D53 and the per-entry order notes do not contradict it.
4. **Conductor observation to confirm or dismiss:** the Home controls entry cites the path `.orchestrator/artifacts/research--home-automation-panel-r1.md`. `.orchestrator/` is dropped from the repository before any pull request (D13; the handoff note), so that link will dangle for readers of the published Roadmap. If you agree, class it Minor and say what wording replaces it.
5. **Version and spec:** `VERSION` 2.1.0 in exactly the four files, the lockfile otherwise unchanged; `tests/e2e/release.spec.mjs` does what criterion 5 says and would fail with `sw.js` at 2.0.0 (reason from the code; the builder reports it did).
6. **Scope:** only the seven Output paths are staged; nothing else in the worktree.

Write your verdict to `/home/nathan/plex-poster-app/.orchestrator/artifacts/release-bump--review-r1.md`. First line: `Agent: release-review-r1 · model: <model> · dispatched: 2026-10-14T22:03:04Z`. Then `Verdict: APPROVE | REQUEST CHANGES`, then numbered findings under `## Issues` (each `N. **Critical|Major|Minor · code-bug|spec-gap**, file:line`, with the command or quote that shows it), then `## Checked and clean`.
