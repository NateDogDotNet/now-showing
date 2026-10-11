# metadata-and-now-playing

- Mode: afk        Tags: ui        Blocked by: content-rating-filter (done f0b3425), settings-and-schedule-core (done 33976fe)
- Status: done · landed 51d8ff3 · confidence 100
- Commit(s): 51d8ff3
- Agent type: orchestrator-builder; model sonnet, effort high (carries the C8I1 child-safety must-fix)
- Claimed: 2026-10-10T16:11:08Z
- Worktree: ../wt-metadata-and-now-playing on branch orch/metadata-and-now-playing from f0b3425 (D12). Chosen next: heads the longest remaining chain (→ position-drag-nudge, fill-blur-and-info, real-server-validation-extended → docs) and carries must-fixes C8I1 (D37), K18 (D24), C8M1 (D28).

## Pre-flight
- Pre-dispatch run (ac-runner pre-r1): criteria 3, 4 exit 1 and 5 exit 2 (specs missing); 1, 2, 6 exit 0. `closer preflight` ok.
- PROBE: `grep -n "Velvet Curtain" scripts/mock-plex.mjs` → line 22: 'Velvet Curtain', 1972, 'PG-13' — meets criterion 3 (item 3 is PG-13 / 1972; duration to add)
- PROBE: `grep -n title-card index.html` → line 38 — meets criterion 3 (the overlay slot exists)
- PROBE: `grep -n Player scripts/mock-plex.mjs` → line 56 session has Player.state only — meets criterion 4 once offset/duration/player are added (the plan's mock note)
- Review routing: tag ui → anchored + screenshots; the conductor adds a cold review because C8I1 is a child-safety fix.
- Step 3: orchestrator-builder metadata-and-now-playing-builder-r1, sonnet, high; brief artifacts/metadata-and-now-playing--brief-r1.md
- Dispatched: 2026-10-10T16:11:08Z        Re-dispatches: 0

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-metadata-and-now-playing, E2E_PORT=21430)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac1-r1.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac2-r1.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac3-r1.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac4-r1.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac5-r1.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac6-r1.json` |
- Pre-commit r1: **lint exit 1 — REAL**: scripts/mock-plex.mjs:56:13 "'contentRating' is assigned a value but never used". format/tests/security/scope exit 0.
- Mutations r1 (conductor; unit + metadata + now-playing e2e): unconfirmed-kept 2 (C8I1 fail-closed for keys not returned) · no-recheck 6 (C8I1) · second-sessions-request 2 (C8M1) — killed.
- Questions r1 — conductor rulings (proposed readings accepted; listed at the next stop): Q-mnp1 → K25 (a failed batched rating request stores every asked key as unrated — fails closed — and the pool load still succeeds); Q-mnp2 → K26 (an episode's year is grandparentYear when sent, else blank; its duration is the episode's own).
- Re-dispatch r2: recipient metadata-and-now-playing-builder-r2 (fresh), forced by the real lint error. Re-dispatches: 1

## Plan acceptance — Step 4 r2 (E2E_PORT=21440)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac1-r2.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac2-r2.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac3-r2.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac4-r2.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac5-r2.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac6-r2.json` |
- r2: scripts/mock-plex.mjs current() destructure → copy + delete (same behaviour). Pre-commit r2: see records. r1 conductor mutants stand (engine/plex unchanged).
- predispatch --kind code ok; Step 7 dispatched 2026-10-10T16:40:35Z: metadata-and-now-playing-review-anchored-r2 (opus; ui → screenshots) and -cold-r2 (opus; conductor-added for the C8I1 child-safety fix); tree bc50606

## Step 7 — cold r2 (artifacts/metadata-and-now-playing--review-cold-r2.md, CHANGES REQUESTED) — triage held for the anchored r2 review
- MCI1 (Important, code-bug; root cause partly the conductor's D37 routing text "at most 100"): the re-check slices cached keys to RECHECK_MAX = 100 while posterCacheLimit allows 300; the oldest 101–300 entries are never re-checked and keep a stale rating for the offline fallback. Fix: batches of 100 (≤3 requests), or every key past the cap stored as unrated (fail closed); test with >100 cached keys.
- MCM1 (spec-gap): a 500/network error on sessions with now-playing on still stops live rotation (old behaviour; K18 covers 401/403 only) — no action (consistent with K18 scope).
- MCM2 (code-bug, cosmetic): progress-bar / player-label toggles not shown in live preview; after Save can wait a full interval while a tick runs.
- MCM3 (code-bug, cosmetic): buffering animates the bar as playing; only paused freezes it.
- MCM4 (spec-gap): the re-check runs only on an online pool reload (≤ every 30 min) and not while a now-playing or pinned poster is up — CONDUCTOR RULING K27: accepted (a re-rate inside that window is rare; the next pool load re-checks); listed at the next stop.

## Step 7 triage — r2 (anchored `--review-r2.md` CHANGES REQUESTED, "UI screenshots: PASS" — 6 shots, bar 3 px flush with the poster window, rotates with the stage; K18, C8M1, C8I1-below-100 and the content-rating guarantee confirmed; cold `--review-cold-r2.md` CHANGES REQUESTED)
- MCI1 = anchored Important 1 (both reviewers): the re-check covers only the 100 newest cached keys; the cache holds up to 300 → re-dispatch r3: re-check EVERY cached key (batches of 100, ≤3 requests per pool load) and store any key not confirmed as unrated (fail closed); unit test with >100 (e.g. 250) cached keys.
- MCM2, MCM3 (cosmetic code-bugs) → r3. MCM1: no action (K18 scope). MCM4: K27.
- Re-dispatch r3 (fresh builder). Re-dispatches: 2

## Plan acceptance — Step 4 r3 (E2E_PORT=21450)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac1-r3.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac2-r3.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac3-r3.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac4-r3.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac5-r3.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `metadata-and-now-playing--ac6-r3.json` |
- r3: engine re-checks every cached key in batches of 100 (≤3 requests), unconfirmed / failed-batch / past-300 keys stored unrated (unit tests 46–49, 250 keys); display redraws the last session on showProgress/showPlayer change (e2e 12); only 'playing' animates (e2e 11). Pre-commit r3: lint/format/tests/security/scope exit 0.
- Mutations r3 (conductor): one-batch-only 4 · past-cap-not-failed-closed 1 · buffering-animates 1 — killed.
- predispatch ok; Step 7 dispatched 2026-10-10T17:16:06Z: metadata-and-now-playing-review-anchored-r3 (opus; DELTA-scoped from tree bc50606 — not risk:high, paths inside the r2 set, small delta); tree f35fa8f

## Step 7 triage — r3 (anchored delta `--review-r3.md` APPROVE, base bc50606; MCI1, MCM2, MCM3 confirmed with the reviewer's mutants; content-rating guarantee unweakened)
- A3M1 (spec-gap, cosmetic): no test pins that a toggle redraw does not snap the bar back (case 12's tolerance would pass a snap). Code is correct. CONDUCTOR RULING K28: no further round (cosmetic; a test costs more than it prevents); listed at the next stop.
- No open finding: Step 7 closes.

## Pre-commit — lint/format/tests/security/scope exit 0 (round--step4-generic-r2.sh, -r3)

## Seam check (merged: + metadata-and-now-playing)
- `round--seam-w3-r7.json` exit 0 (npm test, full npm run test:e2e, check-precache)

## Step 8 tally (`metadata-and-now-playing--tally-step8-r3.json`)
| Category | Score |
|---|---|
| acceptance criteria pass fresh _critical_ | 35/35 |
| diff scope matches phase | 15/15 |
| CLAUDE.md conventions | 15/15 |
| tests where implied | 10/10 |
| decision log respected | 10/10 |
| code reads cleanly | 10/10 |
| commit message accurate | 5/5 |
| **Total** | **100/100** (100%) |
**Band:** COMPLETE
**Caps applied:** none

- Landed: 51d8ff3 — "Show rating, runtime and year, a playback progress bar and the player"
- Read-back ok; attribution (commit form, r3) ok

## Reviews
- r2 anchored (CHANGES REQUESTED: MCI1; UI PASS) + cold (CHANGES REQUESTED: MCI1, cosmetics); r3 anchored delta (APPROVE)

## Notes / reconciliation
- Unknowns: viewOffset, duration, Player.title and the batched /library/metadata/k1,k2 syntax on a real server (real-server-validation-extended; C8I1 row routed). Fulfilled here: C8I1, K18, C8M1 (D24/D28/D37). Rulings for the next stop: K25, K26, K27, K28. Invalidated: none.
- Carried must-fixes fulfilled here: C8I1 (D37), C8M1 (D28), K18 (D24) — dropped from the follow-up index with their evidence.
