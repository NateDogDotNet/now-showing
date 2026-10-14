# scrub-pii — docs/validation/real-server-extended.md (conductor-2, 2026-10-14T21:45:53Z)

```
SOURCE-BINDING
$ git ls-files real-server-extended.md
(untracked — present on disk: docs/validation/real-server-extended.md)
$ wc -l docs/validation/real-server-extended.md
55 docs/validation/real-server-extended.md
first 3:
  L1: # Real-server validation: extended (V1, R-VAL-2)
  L2: 
  L3: Template for a human to fill in against a real Plex server, the real plex.tv and, for the Pi rows, real Raspberry Pi hardware. Every parameter, flag and command the spec marked (verify) is listed. Only `Overall: PASS` closes the `real-server-validation-extended` phase (D11). A FAIL names the phase to reopen.
last 3:
  L53: - [x] V1-E27 — Send the batched request the upward re-rate uses (D37): `GET /library/metadata/<k1>,<k2>,...` with 100 keys, commas literal, built as `js/plex.js` items() builds it — expected: HTTP 200 with every asked item returned; if not, `metadata-and-now-playing` reopens — Result: PASS — Notes: 100 movie keys in one request (path 605 characters) → HTTP 200, 100 items back, 100 distinct, all among the asked keys, 99 carrying a contentRating (the 100th is unrated); 3 keys → HTTP 200, 3 items. It also returned 100 items over the relay connection in r1. Evidence: `.orchestrator/artifacts/real-server-validation-extended--home-deferred-r1.txt` and `-r1b.txt`.
  L54: 
  L55: Overall: PASS
```
> note: file is untracked-but-present — OK to scrub.

**PII candidates:** 4 — {'zip': 4}

| # | Line | Value found (verbatim substring) | Verbatim source line | Type | Proposed replacement | Hint |
|---|------|----------------------------------|----------------------|------|----------------------|------|
| 1 | 15 | 10793 | - [x] V1-E01 — On a display with no saved settings and no `config.json`, open the app (first-run code built by `settings-sheet`) — expected: the first-run code appears large and upright on the empty-state card without any click (R-FIRST-1); approving it at plex.tv/link signs the display in; if it do | zip | 99999 |  |
| 2 | 48 | 32400 | - [x] V1-E24 — Remote address: with Remote Access on in Plex Media Server (Settings > Remote Access shows "Fully accessible outside your network"), open the https-hosted app on a device that is NOT on the server's network (for example a phone on mobile data), sign in with Plex, then open Diagnostics | zip | 99999 |  |
| 3 | 49 | 32400 | - [x] V1-E25 — Relay only: keep the device off the server's network and make the direct remote address unreachable (turn Remote Access off in Plex Media Server, or remove the router's port 32400 forward), reload the app and wait up to 2 min — expected: the `Server` line in Diagnostics shows a relay  | zip | 99999 |  |
| 4 | 49 | 10793 | - [x] V1-E25 — Relay only: keep the device off the server's network and make the direct remote address unreachable (turn Remote Access off in Plex Media Server, or remove the router's port 32400 forward), reload the app and wait up to 2 min — expected: the `Server` line in Diagnostics shows a relay  | zip | 99999 |  |

$ grep -nP '\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b' docs/validation/real-server-extended.md   # phones outside 555-01XX
(no matches)

$ grep -nP '\b\d{5}(?:-\d{4})?\b' docs/validation/real-server-extended.md   # ZIPs not 99999 / 9000X
15:- [x] V1-E01 — On a display with no saved settings and no `config.json`, open the app (first-run code built by `settings-sheet`) — expected: the first-run code appears large and upright on the empty-state card without any click (R-FIRST-1); approving it at plex.tv/link signs the display in; if it do
48:- [x] V1-E24 — Remote address: with Remote Access on in Plex Media Server (Settings > Remote Access shows "Fully accessible outside your network"), open the https-hosted app on a device that is NOT on the server's network (for example a phone on mobile data), sign in with Plex, then open Diagnostics
49:- [x] V1-E25 — Relay only: keep the device off the server's network and make the direct remote address unreachable (turn Remote Access off in Plex Media Server, or remove the router's port 32400 forward), reload the app and wait up to 2 min — expected: the `Server` line in Diagnostics shows a relay 
  → residual real PII on 3 line(s): 10793, 32400, 32400, 10793

$ grep -nP '\b\d{3}-\d{2}-\d{4}\b' docs/validation/real-server-extended.md   # SSNs not 000-00-0000
(no matches)

$ grep -nP '\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b' docs/validation/real-server-extended.md   # emails not @example.com
(no matches)

$ grep -nP '\b(\d+)\s+([A-Za-z0-9 ]*?\b(?:AVE|AVENUE|STREET|ST|ROAD|RD|BLVD|DRIVE|DR|LANE|LN|WAY|CT|COURT|PL|PLACE|TER|TERRACE)\b)' docs/validation/real-server-extended.md   # street addresses not '… FAKE …'
(no matches)

$ grep -nP '["'"'"']?\b(name|customer|contact|company|org|organization|full_?name|first_?name|last_?name)["'"'"']?\s*[:=]\s*["'"'"']([^"'"'"']{2,})["'"'"']' docs/validation/real-server-extended.md   # names not PERSON_/ORG_
(no matches)

$ grep -nP '\b(id|account|customer|member|acct|cust)["'"'"'\s:=_-]{1,4}(\d{5,})\b' docs/validation/real-server-extended.md   # account IDs not 9000X
(no matches)

**PRE-SCRUB: real PII present — EXPECTED, proceed to Step 4 (not a terminal verdict)** (stage: dirty)

## PII Scrub Inventory decisions (conductor-2)
No row proposes a replacement: every candidate is an operational identifier.

### False positives & operational-identifier decisions

| Line | Token (verbatim) | Verbatim source line | Pattern matched | Adjudication | Decision |
|------|------------------|----------------------|-----------------|--------------|----------|
| 15 | 10793 | - [x] V1-E01 — On a display with no saved settings and no `config.json`, open the app (first-run code built by `settin… | ZIP \b\d{5}\b | the Plex Media Server build number inside "v1.43.3.10793", a software version, not a postal code | KEEP (operational identifier) |
| 48 | 32400 | - [x] V1-E24 — Remote address: with Remote Access on in Plex Media Server (Settings > Remote Access shows "Fully acces… | ZIP \b\d{5}\b | Plex's well-known server port 32400, written in the checklist's instructions, not a postal code | KEEP (operational identifier) |
| 49 | 10793 | - [x] V1-E25 — Relay only: keep the device off the server's network and make the direct remote address unreachable (tu… | ZIP \b\d{5}\b | the Plex Media Server build number inside "v1.43.3.10793", a software version, not a postal code | KEEP (operational identifier) |
| 49 | 32400 | - [x] V1-E25 — Relay only: keep the device off the server's network and make the direct remote address unreachable (tu… | ZIP \b\d{5}\b | Plex's well-known server port 32400, written in the checklist's instructions, not a postal code | KEEP (operational identifier) |

## Step 5 — final re-scan
$ grep -nP '\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b' docs/validation/real-server-extended.md   # phones outside 555-01XX
(no matches)

$ grep -nP '\b\d{5}(?:-\d{4})?\b' docs/validation/real-server-extended.md   # ZIPs not 99999 / 9000X
15:- [x] V1-E01 — On a display with no saved settings and no `config.json`, open the app (first-run code built by `settings-sheet`) — expected: the first-run code appears large and upright on the empty-state card without any click (R-FIRST-1); approving it at plex.tv/link signs the display in; if it do
48:- [x] V1-E24 — Remote address: with Remote Access on in Plex Media Server (Settings > Remote Access shows "Fully accessible outside your network"), open the https-hosted app on a device that is NOT on the server's network (for example a phone on mobile data), sign in with Plex, then open Diagnostics
49:- [x] V1-E25 — Relay only: keep the device off the server's network and make the direct remote address unreachable (turn Remote Access off in Plex Media Server, or remove the router's port 32400 forward), reload the app and wait up to 2 min — expected: the `Server` line in Diagnostics shows a relay 
  → residual real PII on 3 line(s): 10793, 32400, 32400, 10793

$ grep -nP '\b\d{3}-\d{2}-\d{4}\b' docs/validation/real-server-extended.md   # SSNs not 000-00-0000
(no matches)

$ grep -nP '\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b' docs/validation/real-server-extended.md   # emails not @example.com
(no matches)

$ grep -nP '\b(\d+)\s+([A-Za-z0-9 ]*?\b(?:AVE|AVENUE|STREET|ST|ROAD|RD|BLVD|DRIVE|DR|LANE|LN|WAY|CT|COURT|PL|PLACE|TER|TERRACE)\b)' docs/validation/real-server-extended.md   # street addresses not '… FAKE …'
(no matches)

$ grep -nP '["'"'"']?\b(name|customer|contact|company|org|organization|full_?name|first_?name|last_?name)["'"'"']?\s*[:=]\s*["'"'"']([^"'"'"']{2,})["'"'"']' docs/validation/real-server-extended.md   # names not PERSON_/ORG_
(no matches)

$ grep -nP '\b(id|account|customer|member|acct|cust)["'"'"'\s:=_-]{1,4}(\d{5,})\b' docs/validation/real-server-extended.md   # account IDs not 9000X
(no matches)

**NOT SAFE — residual PII present after scrub** (stage: final)

**Status:** CLEAN — NO PII FOUND (the only hits are the version number and the port 32400 adjudicated above; 0 Edits proposed, 0 applied)
