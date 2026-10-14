# scrub-pii — docs/security/token-rotation.md (conductor-2, 2026-10-14T21:45:53Z)

```
SOURCE-BINDING
$ git ls-files token-rotation.md
(untracked — present on disk: docs/security/token-rotation.md)
$ wc -l docs/security/token-rotation.md
13 docs/security/token-rotation.md
first 3:
  L1: # Token rotation receipt
  L2: 
  L3: Rotated: yes
last 3:
  L11: The 401 check ran on 2026-10-14 at 00:57 UTC, at the owner's request, from the conductor's shell. The old token went to plex.tv `GET /api/v2/user` in a request header read from a file descriptor. plex.tv answered HTTP 401, so the plan's check (status equals 401) holds. A made-up token sent the same way also got 401, as expected. The token was never printed or written to any file.
  L12: 
  L13: No token appears in this file.
```
> note: file is untracked-but-present — OK to scrub.

**PII candidates:** 0 — {}

| # | Line | Value found (verbatim substring) | Verbatim source line | Type | Proposed replacement | Hint |
|---|------|----------------------------------|----------------------|------|----------------------|------|

$ grep -nP '\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b' docs/security/token-rotation.md   # phones outside 555-01XX
(no matches)

$ grep -nP '\b\d{5}(?:-\d{4})?\b' docs/security/token-rotation.md   # ZIPs not 99999 / 9000X
(no matches)

$ grep -nP '\b\d{3}-\d{2}-\d{4}\b' docs/security/token-rotation.md   # SSNs not 000-00-0000
(no matches)

$ grep -nP '\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b' docs/security/token-rotation.md   # emails not @example.com
(no matches)

$ grep -nP '\b(\d+)\s+([A-Za-z0-9 ]*?\b(?:AVE|AVENUE|STREET|ST|ROAD|RD|BLVD|DRIVE|DR|LANE|LN|WAY|CT|COURT|PL|PLACE|TER|TERRACE)\b)' docs/security/token-rotation.md   # street addresses not '… FAKE …'
(no matches)

$ grep -nP '["'"'"']?\b(name|customer|contact|company|org|organization|full_?name|first_?name|last_?name)["'"'"']?\s*[:=]\s*["'"'"']([^"'"'"']{2,})["'"'"']' docs/security/token-rotation.md   # names not PERSON_/ORG_
(no matches)

$ grep -nP '\b(id|account|customer|member|acct|cust)["'"'"'\s:=_-]{1,4}(\d{5,})\b' docs/security/token-rotation.md   # account IDs not 9000X
(no matches)

**residual scan CLEAN — basis for SAFE TO COMMIT (final stage)** (stage: dirty)

### False positives & operational-identifier decisions

none

## Step 5 — final re-scan
$ grep -nP '\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b' docs/security/token-rotation.md   # phones outside 555-01XX
(no matches)

$ grep -nP '\b\d{5}(?:-\d{4})?\b' docs/security/token-rotation.md   # ZIPs not 99999 / 9000X
(no matches)

$ grep -nP '\b\d{3}-\d{2}-\d{4}\b' docs/security/token-rotation.md   # SSNs not 000-00-0000
(no matches)

$ grep -nP '\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b' docs/security/token-rotation.md   # emails not @example.com
(no matches)

$ grep -nP '\b(\d+)\s+([A-Za-z0-9 ]*?\b(?:AVE|AVENUE|STREET|ST|ROAD|RD|BLVD|DRIVE|DR|LANE|LN|WAY|CT|COURT|PL|PLACE|TER|TERRACE)\b)' docs/security/token-rotation.md   # street addresses not '… FAKE …'
(no matches)

$ grep -nP '["'"'"']?\b(name|customer|contact|company|org|organization|full_?name|first_?name|last_?name)["'"'"']?\s*[:=]\s*["'"'"']([^"'"'"']{2,})["'"'"']' docs/security/token-rotation.md   # names not PERSON_/ORG_
(no matches)

$ grep -nP '\b(id|account|customer|member|acct|cust)["'"'"'\s:=_-]{1,4}(\d{5,})\b' docs/security/token-rotation.md   # account IDs not 9000X
(no matches)

**residual scan CLEAN — basis for SAFE TO COMMIT (final stage)** (stage: final)

**Status:** CLEAN — NO PII FOUND (0 candidates, 0 Edits)
