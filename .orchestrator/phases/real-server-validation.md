# real-server-validation

- Mode: hitl        Tags: —        Blocked by: validation-checklists, cache-first-fetch, serve-config-guard, rotation-layout-and-shell, status-indicator, rotate-plex-token (all done)
- Agent type: none (hitl — no agent is dispatched; the owner runs the checklist)
- Claimed: 2026-10-14T01:03:08Z
- Handed off: 2026-10-14T01:03:08Z        Re-dispatches: 0        Inner revision rounds: 0
- Dispatched: n/a — hitl, no agent dispatched; run by conductor-2 at the owner's request (D50)
- Commit(s): 5c664af — the filled checklist
- Output: docs/validation/real-server-core.md (filled in by conductor-2 from runs on HOME, D50)

## Checklist

**Run the core real-server checklist against Castle Anthrax and the real plex.tv.** Never paste a token, or a URL that carries one, into the file or this chat.

1. **Set up** as the file's Setup line says: `npm start` on this machine or the display, open `http://localhost:8080` in Chromium, clear the site data first (DevTools > Application > Clear site data), and move any `config.json` aside. The leaked token is dead, so sign in fresh with "Sign in with Plex".
2. **Work through rows V1-C01 to V1-C17** in `docs/validation/real-server-core.md`. For each row, replace `PENDING` after `Result:` with `PASS` or `FAIL (<phase>)` and write what you saw after `Notes:`. Core rows may not be SKIPPED. V1-C03 takes about 15 minutes (a code expiring). V1-C07 needs a device off your home network. V1-C17 is a 24-hour soak.
3. **When every row is PASS**, replace the last line with `Overall: PASS`.
4. **Tell me** "core filled in". I check that the file has `Overall: PASS` and no `PENDING`, and that it holds no token-like string, then close the phase. If a row fails, tell me which one. The file names the phase to reopen.
<!-- end checklist -->

## Owner request — 2026-10-14, chat: "run the core checklist for me"
The owner asked the conductor to run the checklist instead of running it themselves. This answers research question 2 (agent-run evidence counts for this phase) for this phase only. Run log so far, all from conductor-2. Interim notes and these artifacts: `artifacts/real-server-validation--c03-r1*.{mjs,txt}`.
- The app ran on http://localhost:8091 via `node scripts/serve.mjs --port 8091` (8080 is held by code-server), in the Playwright MCP Chromium, with site data cleared first.
- V1-C01 PASS (01:05:00Z): the code panel with the plex.tv/link link and a 4-character code appeared within ~1 s; the only console error is the config.json 404 at load (K32).
- V1-C04 PASS (01:05:10Z): Cancel closed the panel with no message, and the button was enabled again; pressing it again gave a fresh code.
- V1-C03 not run. Two background attempts (r1b, r1c) ended with "Page crashed". r1c crashed 17 s after start, with 478 MB free on a 6 GB host. ~01:12Z the main browser page also died, losing the unapproved sign-in. The cause is host memory exhaustion (code-server and several other Claude sessions), not shown to be the app.
- Paused: the remaining rows wait for the owner's choice of where to run them.
- 01:24Z single-browser retry: code WG2Z. The owner then wrote "approved WG2Z" twice and "it said device connected", and later corrected this: "i cant see the broweser as i am not local. i lied to you befre". Neither PGFB nor WG2Z was approved. plex.tv's pin record (authToken null, read from the page as presence only) was right. There is no V1-C02 finding against the app, and no orphaned device.
- Control: `artifacts/real-server-validation--pin-control-r1.{sh,txt}` — a curl-created code GZJK, never linked, polled to expiry. It only shows that plex.tv answers; it proves nothing about linking.
- About 01:44Z the main browser page died again (about:blank) before V1-C03's expiry could be read. Host memory: 6 GB, about 1 GB available or less.
- Status: V1-C01 PASS, V1-C04 PASS; everything else not run. Paused for the owner's choice of where to run, and for a real approval of a code at plex.tv/link (any device, the code given in chat).

## Run on HOME — owner choice "d" (2026-10-14)
The owner chose to run the browser on HOME (Windows 11, 8 GB) over ssh. Setup: the app from 61316e2 (`git archive`) in `%USERPROFILE%\plex-poster-validation`, plus `playwright-core@1.56.1` in its `driver` folder only. It drives the installed Edge 155 headless. A safety hook blocked a read of `~/.ssh/config`; the file was not read, and ssh was used directly.
- `home-core-r1` (NHRP never approved; its V1-C05 "PASS" without a sign-in was a false pass and is discarded); `home-core-r1b` (the fix: sign-in guard plus a pin watcher). Owner approved 6459 → C01, C04, C02, C05, C06, C08, C09, C10, C15, C16 PASS. Its C14 row (FAIL, 0 requests) is void: the poster came from the cache after the reload, so there was no download to inspect. Re-checked in play-r1b.
- `home-play-r1`: C11 labelled FAIL only because its filter missed the config.json 404 at load. Edge prints that error without the file name: `"02:54:09Z Failed to load resource: the server responded with a status of 404 (Not Found)"`. Override: K32 makes this 404 expected; every C11 field check held → PASS. C12 NOT COMPLETED (owner: "i pause it for real" after the window).
- `home-play-r1b`: C12 PASS, C13 PASS, C14 PASS (1 transcode download, 200).
- `home-rest-r1`: C07 PASS (method: LAN blocked in the browser, the checklist's alternative); C03 PASS (15.0 min; the printed code label was stale, the timing is from the new code).
- `home-soak-r1` stopped after its first line (Edge filter matched nothing, 0 MB); `home-soak-r1b` started 03:22:56Z, detached on HOME, 24 h; Edge 460 MB at the start. Its end-of-run result fills V1-C17.
- `docs/validation/real-server-core.md`: 16 rows PASS, V1-C17 PENDING, Overall PENDING (uncommitted until the phase closes).

## Plan acceptance
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (no PENDING) | evidence.py exec (plan command) | 0 | `real-server-validation--ac1-r1.json` |
| 2 | plan criterion 2 (Overall: PASS) | evidence.py exec (plan command) | 0 | `real-server-validation--ac2-r1.json` |
| 3 | plan criterion 3 (no token) | evidence.py exec (plan command) | 0 | `real-server-validation--ac3-r1.json` |
| 4 | plan criterion 4 (npm test, e2e, precache) | evidence.py exec (plan command) at 7192007, after D55's spec fix; r1 at 5c664af failed in ui-rotation (D55) | 0 | `real-server-validation--ac4-r2.json` (977 s); r1 kept: `real-server-validation--ac4-r1.json` |
| 5 | plan criterion 5, narrated: only PASS closes; /phase-gate for M1 | checked by command: every M1 phase is done in state.md and Overall is PASS; the full suite is criterion 4 | 0 | `real-server-validation--ac5-r2.json` |

## Pre-commit
N/A — the phase output is one Markdown checklist; criterion 3 is its secret scan.

- Notes: V1-C17 recorded at hour 15 of the 24 h soak on the owner's call (verbatim in the row); the soak keeps running on HOME and its final line is not part of this record.

## Step 8 tally — artifacts/real-server-validation--tally-step8-r2-c1.json (first derive r2 was RE-DISPATCH 50/55; correction quoted: "every acceptance row checks the landed checklist, so all five are commit rows; the first derive read the message as stale against them")
| Category | Score |
|---|---|
| acceptance criteria pass fresh _critical_ | 35/35 |
| diff scope matches phase | 15/15 |
| commit message accurate | 5/5 |
| **Total** | **55/55** (100%) |
**Band:** COMPLETE
**Caps applied:** none

N/A (dropped from the tally): CLAUDE.md conventions, code reads cleanly, tests where implied, decision log respected — no code and no review in a hitl checklist phase.

- Landed: 5c664af — "Record the core real-server checklist: all 17 rows PASS"
- Read-back: artifacts/real-server-validation--readback-5c664af*.json (ok, --commit-rows 1-5)
