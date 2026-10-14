# real-server-validation-extended

- Mode: hitl        Tags: —        Blocked by: validation-checklists, real-server-validation (24 h soak still running; started early under D50), content-rating-filter, settings-sheet, metadata-and-now-playing, device-helper-integration, pi-stability
- Agent type: none dispatched; the conductor drives the checklist on HOME at the owner's request (D50)
- Claimed: 2026-10-14T03:37:25Z
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
