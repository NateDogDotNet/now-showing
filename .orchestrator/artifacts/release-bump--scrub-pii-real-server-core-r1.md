# scrub-pii — docs/validation/real-server-core.md (conductor-2, 2026-10-14T21:45:53Z)

```
SOURCE-BINDING
$ git ls-files real-server-core.md
(untracked — present on disk: docs/validation/real-server-core.md)
$ wc -l docs/validation/real-server-core.md
46 docs/validation/real-server-core.md
first 3:
  L1: # Real-server validation: core (V1, R-VAL-1)
  L2: 
  L3: Template for a human to fill in against a real Plex server and the real plex.tv. Only `Overall: PASS` closes the `real-server-validation` phase (D11). A FAIL names the phase to reopen.
last 3:
  L44: 
  L45: - [x] V1-C17 — Leave the display running for 24 h with the Diagnostics panel closed. At the start and the end record the Chromium Task Manager (Shift+Esc) memory for the tab in Notes, then reopen Diagnostics and the DevTools Console. Note start and end time, poster count and any errors in Notes — expected: still changing posters, no growing error list, no frozen image, and end memory not more than about double the start reading — Result: PASS — Notes: Two runs. (1) Agent soak on HOME (headless Edge 155, Diagnostics closed, rotation 60 s), started 2026-10-14T03:22:56Z, logged hourly to `driver\soak.log`; recorded at hour 15 (18:23:11Z), not at 24 h, on the owner's call ("I have been running it already on my phone for over 24 hrs and it is stil working. I think we can continue on past that."). Start: Edge working set 460 MB, JS heap 1 MB, 1 console error (the absent config.json 404). Hour 15: Edge 698 MB (about 1.5× start; the readings at hours 1 and 11, 987 and 1078 MB, were taken while other validation runs had Edge open on the same machine), JS heap 2 MB, flat from hour 1. 872 poster changes (about 60 an hour, as set), a poster on screen at every check, 0 crashes, 2 console errors in all (the second is the same config.json 404 after the page reloaded itself at hour 6), so the error list did not grow. (2) The owner has run the app on a phone for more than 24 h and it still changes posters. The Chromium Task Manager reading was replaced by the browser process working set and the page JS heap, read by the driver. Evidence: `.orchestrator/artifacts/real-server-validation--home-soak-r1b-log-h15.txt`.
  L46: Overall: PASS
```
> note: file is untracked-but-present — OK to scrub.

**PII candidates:** 2 — {'zip': 2}

| # | Line | Value found (verbatim substring) | Verbatim source line | Type | Proposed replacement | Hint |
|---|------|----------------------------------|----------------------|------|----------------------|------|
| 1 | 18 | 10793 | - [x] V1-C02 — On a second device open plex.tv/link, enter the code and approve — expected: within about 5 s (up to about 10 s per unreachable address) the code panel closes without a manual refresh and the line beside Test connection reads `✓ <server name> (v<version>) — N libraries` — Result: PASS | zip | 99999 |  |
| 2 | 27 | 10793 | - [x] V1-C08 — Press Test connection in Settings. Then open the Enter token and server manually fold, change Server URL to a wrong address and press Test connection again, then restore it — expected: the first test reads `✓ <server name> (v<version>) — N libraries`; the wrong URL reads `✗ ` followed | zip | 99999 |  |

$ grep -nP '\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b' docs/validation/real-server-core.md   # phones outside 555-01XX
(no matches)

$ grep -nP '\b\d{5}(?:-\d{4})?\b' docs/validation/real-server-core.md   # ZIPs not 99999 / 9000X
18:- [x] V1-C02 — On a second device open plex.tv/link, enter the code and approve — expected: within about 5 s (up to about 10 s per unreachable address) the code panel closes without a manual refresh and the line beside Test connection reads `✓ <server name> (v<version>) — N libraries` — Result: PASS
27:- [x] V1-C08 — Press Test connection in Settings. Then open the Enter token and server manually fold, change Server URL to a wrong address and press Test connection again, then restore it — expected: the first test reads `✓ <server name> (v<version>) — N libraries`; the wrong URL reads `✗ ` followed
  → residual real PII on 2 line(s): 10793, 10793

$ grep -nP '\b\d{3}-\d{2}-\d{4}\b' docs/validation/real-server-core.md   # SSNs not 000-00-0000
(no matches)

$ grep -nP '\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b' docs/validation/real-server-core.md   # emails not @example.com
(no matches)

$ grep -nP '\b(\d+)\s+([A-Za-z0-9 ]*?\b(?:AVE|AVENUE|STREET|ST|ROAD|RD|BLVD|DRIVE|DR|LANE|LN|WAY|CT|COURT|PL|PLACE|TER|TERRACE)\b)' docs/validation/real-server-core.md   # street addresses not '… FAKE …'
(no matches)

$ grep -nP '["'"'"']?\b(name|customer|contact|company|org|organization|full_?name|first_?name|last_?name)["'"'"']?\s*[:=]\s*["'"'"']([^"'"'"']{2,})["'"'"']' docs/validation/real-server-core.md   # names not PERSON_/ORG_
(no matches)

$ grep -nP '\b(id|account|customer|member|acct|cust)["'"'"'\s:=_-]{1,4}(\d{5,})\b' docs/validation/real-server-core.md   # account IDs not 9000X
(no matches)

**PRE-SCRUB: real PII present — EXPECTED, proceed to Step 4 (not a terminal verdict)** (stage: dirty)

## PII Scrub Inventory decisions (conductor-2)
No row proposes a replacement: every candidate is an operational identifier.

### False positives & operational-identifier decisions

| Line | Token (verbatim) | Verbatim source line | Pattern matched | Adjudication | Decision |
|------|------------------|----------------------|-----------------|--------------|----------|
| 18 | 10793 | - [x] V1-C02 — On a second device open plex.tv/link, enter the code and approve — expected: within about 5 s (up to … | ZIP \b\d{5}\b | the Plex Media Server build number inside "v1.43.3.10793", a software version, not a postal code | KEEP (operational identifier) |
| 27 | 10793 | - [x] V1-C08 — Press Test connection in Settings. Then open the Enter token and server manually fold, change Server UR… | ZIP \b\d{5}\b | the Plex Media Server build number inside "v1.43.3.10793", a software version, not a postal code | KEEP (operational identifier) |

## Step 5 — final re-scan
$ grep -nP '\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b' docs/validation/real-server-core.md   # phones outside 555-01XX
(no matches)

$ grep -nP '\b\d{5}(?:-\d{4})?\b' docs/validation/real-server-core.md   # ZIPs not 99999 / 9000X
18:- [x] V1-C02 — On a second device open plex.tv/link, enter the code and approve — expected: within about 5 s (up to about 10 s per unreachable address) the code panel closes without a manual refresh and the line beside Test connection reads `✓ <server name> (v<version>) — N libraries` — Result: PASS
27:- [x] V1-C08 — Press Test connection in Settings. Then open the Enter token and server manually fold, change Server URL to a wrong address and press Test connection again, then restore it — expected: the first test reads `✓ <server name> (v<version>) — N libraries`; the wrong URL reads `✗ ` followed
  → residual real PII on 2 line(s): 10793, 10793

$ grep -nP '\b\d{3}-\d{2}-\d{4}\b' docs/validation/real-server-core.md   # SSNs not 000-00-0000
(no matches)

$ grep -nP '\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b' docs/validation/real-server-core.md   # emails not @example.com
(no matches)

$ grep -nP '\b(\d+)\s+([A-Za-z0-9 ]*?\b(?:AVE|AVENUE|STREET|ST|ROAD|RD|BLVD|DRIVE|DR|LANE|LN|WAY|CT|COURT|PL|PLACE|TER|TERRACE)\b)' docs/validation/real-server-core.md   # street addresses not '… FAKE …'
(no matches)

$ grep -nP '["'"'"']?\b(name|customer|contact|company|org|organization|full_?name|first_?name|last_?name)["'"'"']?\s*[:=]\s*["'"'"']([^"'"'"']{2,})["'"'"']' docs/validation/real-server-core.md   # names not PERSON_/ORG_
(no matches)

$ grep -nP '\b(id|account|customer|member|acct|cust)["'"'"'\s:=_-]{1,4}(\d{5,})\b' docs/validation/real-server-core.md   # account IDs not 9000X
(no matches)

**NOT SAFE — residual PII present after scrub** (stage: final)

**Status:** CLEAN — NO PII FOUND (the only hits are the version number adjudicated above; 0 Edits proposed, 0 applied)
