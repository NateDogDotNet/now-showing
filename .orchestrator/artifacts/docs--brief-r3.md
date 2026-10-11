# Brief — docs r3 (re-dispatch 2)

Agent name: docs-builder-r3 · effort: medium · worktree `/home/user/wt-docs` (r2 staged). The r1 brief binds. Stage, do not commit. Edit only README.md and Roadmap.md. Review: `/home/user/plex-poster-app/.orchestrator/artifacts/docs--review-r2.md`.

1. DOI1 (a wrong statement, must fix): README.md:~318 says a revealed token hides itself after 15 s in kiosk mode. There is no such timer (js/settings-ui.js has no setTimeout; the token hides when Settings opens or closes, or Hide is pressed). Replace it with "The token hides again when Settings closes." (or equivalent, true to the code). Check the rest of the README for any other claim built on the same mistake (REVEAL_MS is only the 15 s the controls stay up after a corner or Enter hold).
2. DOM1: in the daily-reload text (~l.192) say plainly that waking the screen by a key or touch does not trigger the 12-hour reload, and that the reload also waits while a poster loads or the TV is waking (js/main.js reloadMustWait, l.~588).
3. DOM2–DOM4: tag "(verify)": the `DeveloperToolsAvailability` value 2 itself (~l.298-305), "installed PWAs and --kiosk Chromium are unaffected" (~l.256), and systemd `KillMode=control-group` ending a running command (~l.393).
4. DOM5: remove the internal id "(K61)" from Roadmap.md:~19 (say it plainly, or drop it).
5. DOM6: split the long sentences at README:~9, ~192 and ~393 into short ones.
Then re-run criteria 1–7 and `git diff --cached --check`, and paste outputs.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/docs--handback-builder-r3.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: docs · round: r3`, header fields, blank line, `Agent: docs-builder-r3 · dispatched: <stamp>`.
