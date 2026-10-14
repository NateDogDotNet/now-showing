# real-server-validation

- Mode: hitl        Tags: —        Blocked by: validation-checklists, cache-first-fetch, serve-config-guard, rotation-layout-and-shell, status-indicator, rotate-plex-token (all done)
- Agent type: none (hitl — no agent is dispatched; the owner runs the checklist)
- Claimed: 2026-10-14T01:03:08Z
- Handed off: 2026-10-14T01:03:08Z        Re-dispatches: 0        Inner revision rounds: 0
- Output: docs/validation/real-server-core.md (filled in by the owner)

## Checklist

**Run the core real-server checklist against Castle Anthrax and the real plex.tv.** Never paste a token, or a URL that carries one, into the file or this chat.

1. **Set up** as the file's Setup line says: `npm start` on this machine or the display, open `http://localhost:8080` in Chromium, clear the site data first (DevTools > Application > Clear site data), and move any `config.json` aside. The leaked token is dead, so sign in fresh with "Sign in with Plex".
2. **Work through rows V1-C01 to V1-C17** in `docs/validation/real-server-core.md`. For each row, replace `PENDING` after `Result:` with `PASS` or `FAIL (<phase>)` and write what you saw after `Notes:`. Core rows may not be SKIPPED. V1-C03 takes about 15 minutes (a code expiring). V1-C07 needs a device off your home network. V1-C17 is a 24-hour soak.
3. **When every row is PASS**, replace the last line with `Overall: PASS`.
4. **Tell me** "core filled in". I check that the file has `Overall: PASS` and no `PENDING`, and that it holds no token-like string, then close the phase. If a row fails, tell me which one. The file names the phase to reopen.
<!-- end checklist -->
