# real-server-validation-extended

- Mode: hitl        Tags: —        Blocked by: validation-checklists, real-server-validation (24 h soak still running; started early under D50), content-rating-filter, settings-sheet, metadata-and-now-playing, device-helper-integration, pi-stability
- Agent type: none dispatched; the conductor drives the checklist on HOME at the owner's request (D50)
- Claimed: 2026-10-14T03:37:25Z
- Dispatched: n/a — hitl, no agent dispatched; run by conductor-2 at the owner's request (D50)
- Commit(s): 11ed786 (rows E01–E07, E09, E10, E23–E25 and the Pi skips), 8badf7d (E08 and Overall: PASS), 128b62e (V1-E26, V1-E27: the D33 and D37 checks)
- Output: docs/validation/real-server-extended.md

## Checklist
The owner asked the conductor to run `docs/validation/real-server-extended.md` ("run the extended checklist for me"). The owner's part: approve each plex.tv/link code the conductor posts in chat, play, pause and stop a title when asked (V1-E08), and give the rotation facts for V1-E10. The Pi rows V1-E11 to E22 are SKIPPED (no Pi), as the checklist allows.
<!-- end checklist -->

## Run trail
- Results so far (artifacts `real-server-validation-extended--home-*`): E01, E02, E03, E04, E05, E06, E07, E09, E23 PASS; E11–E22 SKIPPED (no Pi).
- V1-E25: r1c code RGK7 and r1d code DD5P expired unapproved (04:39:56Z, 14:27:30Z); owner then said "go" and approved ZSD3 ("i linked zsd3"). r1e (driver `home-ext-r1d.mjs`, output `home-ext-r1e.txt`) → PASS at 18:32:36Z: both direct addresses refused in the browser, connected over the relay ("✓ Castle Anthrax (v1.43.3.10793) — 5 libraries"), relay address saved, 3 posters at ~9.5 s each, poster on screen, Image mode "downloaded + cached".
- Open: E08 (owner playback), E10 (owner rotation facts), E24 (off-network device or in-browser block).
- Owner 2026-10-14 (after E25): "1. Ill do this later" (E08 deferred); "2. you did it for me via the Pulse project. I think." (E10); "3. I have used it on my phone off of the local network and it functiond properly." (E24).
- E10 check of the Pulse transcripts (~/.claude/projects/-home-nathan-Pulse, read with long strings masked): session 6886778a (2026-10-13 16:37–16:41Z) only recommended removing the poster-app entry under plex.tv > Account > Authorized Devices and states it did NOT call plex.tv devices; no Pulse session exists after 16:42Z, and no Pulse session contains a device-delete call. So no agent revoked the token; the route remains unknown. The 401 (00:57:15Z) stands.
- E24: owner report covers "posters rotate" off-network; the row's Server address type, Image mode and console lines are not yet recorded.
- Owner 2026-10-14: "2. nothing from before Oct 14th" (Authorized Devices) and, for E24, the phone's Diagnostics Server line (a remote https plex.direct address in public-IP form, port 32400; the full line is not recorded: it holds the public IP and the server ID) and "downloaded + cached". E10 recorded PASS with the route unconfirmed (conductor's call, offered to the owner to overrule); E24 PASS.
- Commit 11ed786 says "13 rows pass"; the count is 12 (E01–E07, E09, E10, E23, E24, E25). Not amended: it was already pushed.
- V1-E08: owner "playing" → e08-r1 (driver `home-e08-r1.mjs`, profile-ext2, the core profile being busy with the soak) PASS at 19:13:00Z: Player.title present, viewOffset/duration in ms, bar visible in 8/8 samples, within 6 s of the server position, advancing. The player's name was masked in the output.
- Checklist complete: 13 PASS, 12 SKIPPED (Pi), Overall: PASS; criteria 1–3 hold locally. Close (evidence, derive, gate, state done) waits for real-server-validation to close first (it blocks this phase; its soak C17 ends ~2026-10-15T03:23Z).

## Plan acceptance
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (no PENDING) | evidence.py exec (plan command) | 0 | `real-server-validation-extended--ac1-r1.json` |
| 2 | plan criterion 2 (Overall: PASS) | evidence.py exec (plan command) | 0 | `real-server-validation-extended--ac2-r1.json` |
| 3 | plan criterion 3 (no token) | evidence.py exec (plan command) | 0 | `real-server-validation-extended--ac3-r1.json` |
| 4 | plan criterion 4, narrated: only PASS closes; SKIPPED only on Pi rows with a reason | checked by command: no FAIL row, and the only SKIPPED rows are the 12 Pi rows V1-E11–E22 with "(no Pi)" | 0 | `real-server-validation-extended--ac4-r1.json` |

## Pre-commit
N/A — the phase output is one Markdown checklist; criterion 3 is its secret scan.

## Step 8 tally — artifacts/real-server-validation-extended--tally-step8-r1-c1.json (first derive r1 was RE-DISPATCH 40/55, scope 0/15; correction quoted: "8badf7d also carries three conductor trail files (the E08 driver, its output and this phase file) committed with the checklist; they are .orchestrator/ records, not phase output; listed so the scope row reads the real commit, and recorded as a deviation in the phase file")
| Category | Score |
|---|---|
| acceptance criteria pass fresh _critical_ | 35/35 |
| diff scope matches phase | 15/15 |
| commit message accurate | 5/5 |
| **Total** | **55/55** (100%) |
**Band:** COMPLETE
**Caps applied:** none

- DEVIATION (conductor): 11ed786 and 8badf7d each committed the checklist together with .orchestrator trail files instead of the output alone; no code or other output path is in either commit.
N/A (dropped from the tally): CLAUDE.md conventions, code reads cleanly, tests where implied, decision log respected — no code and no review in a hitl checklist phase.

- Landed: 8badf7d — "Record V1-E08: the progress bar tracks playback; extended checklist PASS"

## Deferred checks — run 2026-10-14T21:20Z after the first gate named the two open follow-ups (D33, C8I1/D37)
- Driver `real-server-validation-extended--home-deferred-r1.mjs` (E26 stopped: profile-ext2 keeps the relay address from V1-E25 and the relay closed the connection after some twenty requests) and `-r1b.mjs` (a direct connection for the run only). Outputs `-r1.txt`, `-r1b.txt`.
- V1-E26 PASS: 40 shows, 2,783 episodes, 0 rated lower than the show (D33: nothing to fix). V1-E27 PASS: 100 keys → 200, 100 items (D37 request format confirmed).
- Both rows added to the checklist in 128b62e (the checklist alone). Criteria re-run: ac1–ac4 r2 exit 0.

## Step 8 tally — artifacts/real-server-validation-extended--tally-step8-r2.json (on 128b62e; the r1 tally above was on 8badf7d)
| Category | Score |
|---|---|
| acceptance criteria pass fresh _critical_ | 35/35 |
| diff scope matches phase | 15/15 |
| commit message accurate | 5/5 |
| **Total** | **55/55** (100%) |
**Band:** COMPLETE
**Caps applied:** none

- Landed: 128b62e — "Record the two checks routed to the extended validation (D33, D37)"
- Read-back: artifacts/real-server-validation-extended--readback-128b62e.json (ok, --commit-rows 1-4)
