# Brief — rename-now-showing review r1 (anchored)

Agent name: rename-review-r1 · phase: rename-now-showing · round: r1 · dispatched: 2026-10-14T20:38:28Z

You are the `orchestrator-reviewer`, anchored lens. Read-only on the repository.

Review the staged diff in `/home/nathan/wt-rename-now-showing` (`git -C /home/nathan/wt-rename-now-showing diff --cached`, base 5bd76c3) against:
- the phase `### 29. \`rename-now-showing\`` in `/home/nathan/plex-poster-app/docs/integration-plan.md` (Output, criteria 1–6, Notes/hazards);
- D52 and D55 in `/home/nathan/plex-poster-app/docs/decisions.md`;
- the brief `/home/nathan/plex-poster-app/.orchestrator/artifacts/rename-now-showing--brief-r1.md` (hazards).

Check, with a command for each claim:
1. Every user-visible "Plex Poster Display" outside docs/ is gone, and no place a user sees the product name was missed (search index.html, manifest, js/, scripts/, README.md, Roadmap.md, assets/ SVG titles, icons' metadata, sw.js, .github/).
2. Nothing D52 keeps was changed: plexPoster.* keys, shell-${VERSION}, the client identifier, EXPORT_FORMAT 'plex-poster-display/settings', VERSION.
3. The ui-rotation change removes the race in D55 without weakening the check (the empty card is still measured, at every rotation, with its real transform; consider whether reading the transform in the same task as unhiding can see a mid-transition value).
4. "Plex" wording that means the Plex service is intact; the README's "Formerly" line is accurate (does sign-in really carry over? check js/plex.js for anything keyed on PRODUCT, such as the client identifier or a stored value).
5. Scope: only Output paths changed.

Write your verdict to `/home/nathan/plex-poster-app/.orchestrator/artifacts/rename-now-showing--review-r1.md`. First line: `Agent: rename-review-r1 · model: <model> · dispatched: 2026-10-14T20:38:28Z`. Then `Verdict: APPROVE | REQUEST CHANGES`, then numbered findings (Critical/Major/Minor), each with file:line and the command that shows it.
