# Brief — docs r2 (re-dispatch 1)

Agent name: docs-builder-r2 · effort: low · worktree `/home/user/wt-docs` (r1 staged). The r1 brief binds. Stage, do not commit. Edit only README.md.

One item: `git diff --cached --check` reports `README.md:355: trailing whitespace.` Remove the trailing whitespace (check the whole file: `git diff --cached --check` must print nothing). Change nothing else. Then re-run criteria 1–7 and `git diff --cached --check`, and paste outputs.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/docs--handback-builder-r2.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: docs · round: r2`, header fields, blank line, `Agent: docs-builder-r2 · dispatched: <stamp>`.
