# validation-checklists

- Mode: afk        Tags:         Blocked by: none
- Agent type: orchestrator-builder (no BMad install: `ls _bmad .bmad-core` → absent); model sonnet
- Claimed: 2026-10-08T22:05:57Z
- Worktree: ../wt-validation-checklists on branch orch/validation-checklists from 0f1f82e (D12)

## Pre-flight
- Pre-dispatch acceptance run: artifacts/validation-checklists--preflight-r1.md (failures are the missing deliverables; passing rows: npm test and scope probes)
- `git log --oneline -- <outputs>`: no prior commit touched the new outputs (checked below)
- PROBE: `grep -c "(verify)" docs/spec.md` → 7 (verify) markers in the spec to carry — meets criterion 4
- Dispatched: 2026-10-08T22:06:57Z        Re-dispatches: 2        Inner revision rounds: 0
- Last verification: 2026-10-08T22:58:18Z
- Commit(s): 7b49e94 — one phase, its own commit
- Step 3: orchestrator-builder validation-checklists-builder-r1, model sonnet (agent definition pin), effort medium; brief artifacts/validation-checklists--brief-r1.md

## Plan acceptance — Step 4 r1 (conductor-run via evidence.py exec in ../wt-validation-checklists)
| # | Item (verbatim from the plan) | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | `test "$(grep -c 'PENDING' docs/validation/real-server-core.md)" -ge 10 && test "$(grep -c 'PENDING' docs/validation/real-server-extended.md)" -ge 14`… | evidence.py exec (plan command) | 0 | `validation-checklists--ac1-r1.json` |
| 2 | `grep -qx 'Overall: PENDING' docs/validation/real-server-core.md && grep -qx 'Overall: PENDING' docs/validation/real-server-extended.md`… | evidence.py exec (plan command) | 0 | `validation-checklists--ac2-r1.json` |
| 3 | `for k in 'plex.tv/link' 'Sign in with Plex' firstReachable CORS '/photo/:/transcode' '/status/sessions' 'plex.direct' 'Image mode'; do grep -qF -- "$… | evidence.py exec (plan command) | 0 | `validation-checklists--ac3-r1.json` |
| 4 | `for k in 'first-run code' contentRating 'gb/' totalSize viewOffset Player.title overscroll-history-navigation disable-pinch DeveloperToolsAvailabilit… | evidence.py exec (plan command) | 0 | `validation-checklists--ac4-r1.json` |
| 5 | `test -f docs/validation/real-server-core.md && test -f docs/validation/real-server-extended.md && ! grep -Eq 'X-Plex-Token[=:] *[A-Za-z0-9_-]{15,}' d… | evidence.py exec (plan command) | 0 | `validation-checklists--ac5-r1.json` |
| 6 | `for f in docs/validation/real-server-core.md docs/validation/real-server-extended.md; do grep -qxF 'Result values: PASS \| FAIL (<phase to reopen>) \| … | evidence.py exec (plan command) | 0 | `validation-checklists--ac6-r1.json` |
| 7 | narrated: `/doc-review` of both files: each item has an ID, exact steps, expected result, `Result: PENDING`, `Notes:`.… | doc-review band (Step 4 evidence for a docs phase): `score.py rubric` band ≥ Complete from `validation-checklists--review-doc-r1.json` | pending | reviewer dispatched after this table |

## Scope — reconcile block
- `evidence.py git --reconcile` → MATCH, 2 touched (artifacts/validation-checklists--reconcile-r1.md)
- Conductor probe: every item line matches `^- \[ \] V1-[CE][0-9]+ — .* — expected: .* — Result: PENDING — Notes:` (core 15/15, extended 23/23)
- Step 4 evidence review dispatched 2026-10-08T22:13:32Z: validation-checklists-review-doc-r1 (orchestrator-reviewer, opus), artifact-review doc rubric; predispatch evidence ok

## Step 4 evidence — doc review r1 (artifacts/validation-checklists--review-doc-r1.md + .json)
- Conductor recomputed: `score.py rubric --input validation-checklists--review-doc-r1.json` → 6/10, **Needs Work**; row 7 exec form `validation-checklists--ac7-r1.json` (band ∈ {Complete, Ready}) exit 1.
- Critical C07 confirmed: js/main.js:263 `Token: s.plexToken ? \`${s.plexToken.slice(0, 4)}…\`` — Diagnostics shows the first 4 characters, so "never shown in Diagnostics" is a false FAIL.
- Critical C03 confirmed: js/settings-ui.js cancelSignIn() hides the panel with no message; expiry shows "Code expired — try again." without a new code.
- Important: C05 (no "connection" line in Diagnostics; URL is on `Server`), C10 (session fields unnamed), E11 (README Trixie line arrives in `docs`), 12 rows naming later-phase UI without the phase.
- Re-dispatch r2: recipient validation-checklists-builder-r2 (fresh), forced by band Needs Work (ac7 exit 1). Re-dispatches: 1
- Dispatched r2: 2026-10-08T22:20:27Z (brief artifacts/validation-checklists--brief-r2.md)

## Plan acceptance — Step 4 r2 (artifacts/round--ac-runner.py r2)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `validation-checklists--ac1-r2.json` |
| 2 | plan criterion 2 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `validation-checklists--ac2-r2.json` |
| 3 | plan criterion 3 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `validation-checklists--ac3-r2.json` |
| 4 | plan criterion 4 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `validation-checklists--ac4-r2.json` |
| 5 | plan criterion 5 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `validation-checklists--ac5-r2.json` |
| 6 | plan criterion 6 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `validation-checklists--ac6-r2.json` |
| 7 | narrated: /doc-review band | band ≥ Complete from `validation-checklists--review-doc-r2.json` | pending | doc reviewer r2 dispatched after this table |
- Pre-commit r2 (generic script): lint/format/tests/security/scope exit 0; item format 17/17 core, 23/23 extended

## Step 4 r2 + review r2 (artifacts/validation-checklists--review-doc-r2.md + .json): APPROVE, band Complete 9/10 (conductor recomputed; `validation-checklists--ac7-r2.json` exit 0); Step 4 tally `validation-checklists--tally-step4-r2.json` 65/65 COMPLETE
- Open: I1 (Important, code-bug) "C06's expected result describes the opposite connection preference from the code." Conductor confirmed: js/plex.js rankConnections scores `(c.local ? 0 : 2) + (c.relay ? 4 : 0) + (c.protocol === 'https' ? 0 : 1)`, so local https ranks before local http. `validation-checklists--review-check-r2.json` exit 1.
- Minors m1–m5 (wording, code-bug): ride the r3 push.
- Step 7 derive refused: "validation-checklists--review-doc-r1.md: an open Critical cites a project rule (CLAUDE.md or a D-entry); ask the user in a saved stop and record the answer". The r1 Criticals (C07, C03) are resolved per the r2 review's status table; the kernel needs an owner answer at a stop → carried to the next stop.
- FOLLOW-UP (owner: Nathan): confirm that the r1 doc-review Criticals on validation-checklists (C07, C03, citing D11) are resolved by r2, so Step 7 can be scored
- Re-dispatch r3: recipient validation-checklists-builder-r3 (fresh), forced by the open Important I1 (Step 7 "code reads cleanly" would be 5/10). Re-dispatches: 2
- Dispatched r3: 2026-10-08T22:29:18Z (brief artifacts/validation-checklists--brief-r3.md)
- Doc band r3 dispatched 2026-10-08T22:32:12Z: validation-checklists-review-doc-r3 (opus), delta bbc9447→12e2ea7 (artifacts/validation-checklists--delta-r3.patch)
- Step 4 r3: plan criteria 1–6 exit 0 (`validation-checklists--ac{1..6}-r3.json`); generic pre-commit r3 exit 0; C06 now reads "firstReachable tries the local `https` `*.pl…" (conductor read)
- Doc band r3 (artifacts/validation-checklists--review-doc-r3.md + .json): APPROVE, Complete 9/10 (conductor recomputed); `validation-checklists--ac7-r3.json` exit 0. Step 7 scoring waits on the owner confirmation of the r1 Criticals (kernel rule), asked at stop 3.

## Stop message 3
**Stop 3 — wave 1 decisions (one reply covers all)**

Progress: `serve-config-guard` (0914090) and `e2e-harness` (d409ad7) are committed and pushed; `validation-checklists` is approved and waits only on item 1; `device-helper-server` is in review; `settings-and-schedule-core` is building.

1. **Confirm a resolved review finding.** The first doc review of `validation-checklists` raised two Criticals that cite D11: row C07 expected the token never to appear in Diagnostics (it shows the first 4 characters), and row C03 described cancel/expiry behaviour the app doesn't have. Both rows were rewritten and the later reviews mark them resolved. The kernel needs your word before it scores that phase. **Recommended: (a) confirmed resolved.** (b) Reopen for another look.
2. **Rulings I made alone** (reply "keep" or name any to change):
   - Dev server: symlinks whose real path leaves the app folder are 404, and hidden files (`/js/.env`) are 404 even inside `css/`, `js/`, `assets/` (under D9).
   - H1 Test harness, for "A hung spec hangs the whole run forever, and a runner killed by a signal leaves the running spec, its Chromium and its dedicated server behind.": each browser test has a time limit (`E2E_SPEC_TIMEOUT`, 180 s) and leftover processes are killed; CI job limit 20 min.
   - K1 Device helper (Q-dhs1): "auto-detect order cec-ctl", then cec-client, then wlr-randr (only with an output name); screen-on via `cec-ctl --image-view-on` (to verify on hardware). (Q-dhs2): error codes, "413 oversized body", 503 busy, 504 timeout, 502 failed.
   - Planning rulings N8, N9, N10 were already listed at stop 2 (no change).
   **Recommended: keep all.**
3. **Minor findings shipping as is** (reply "ok" or name any to fix):
   - X1 "a cross-site request to 127.0.0.1 gets the token with status 200" — no other site's page can read the response (no CORS header is sent); cold-review M2 (add `Sec-Fetch-Site`/`nosniff`) and M3 (LAN tests skip on a machine with no LAN address; my exec check fails the run if any test is skipped) stay as they are.
   - H2 "A non-numeric `E2E_SPEC_TIMEOUT` turns into an immediate timeout for every spec." — it fails loudly, never passes silently.
   - H3 "The comment on the sweep is inaccurate about Chromium" — wording only.
   **Recommended: ok.**
4. **Token rotation** is still open — the checklist from earlier still applies; reply with its four lines whenever you've done it (it only blocks `real-server-validation` and the release).

Each answer's record lands outside the history purge (it is a decision-log entry or a phase file).

Reply e.g. "1a, keep, ok" — or "defaults".
<!-- end stop 3 -->

- Answer to stop message 3: "Approve" — chat; recorded by the conductor at 2026-10-08T22:56:21.183090Z

## Stop 3 answer
- Sent 2026-10-08T22:47Z (saved above); reply "Approve" at 2026-10-08T22:56:10.260Z (`closer answer`, artifacts/validation-checklists--answer-stop3.json): items 1–3 answered as recommended → D17, D18, D19; item 4 (token rotation) open, still owned by `rotate-plex-token`.
- Format finding: `validation-checklists--handback-builder-r3.md` opened with the Agent line above the fixed header, so `closer attribution --sha 7b49e94` reports it malformed. The original is kept verbatim as `validation-checklists--handback-builder-r3-malformed-original.txt`; the builder is asked to re-issue its own report header-first (format only, content unchanged). The conductor does not edit it.
- Pushed 7b49e94 before the gate (stop-hook request); phase stays in progress until `closer gate` passes.
- Re-issued handback (header first) verified; diff vs the preserved original: reordered header plus two added lines ("Agent: …" moved, "Files are in /home/user/wt-validation-checklists, staged, not committed.") — no criteria change. Attribution r4 (commit form, 7b49e94): ok, malformed {}.

## Pre-commit (docs phase): format `git diff --cached --check` exit 0, security grep exit 0, doc-review band Complete (`validation-checklists--ac7-r3.json`); lint N/A — no JS in the staged set (record exit 0 says so)

## Step 8 tally (`validation-checklists--tally-step8-r3.json`)
| Category | Score |
|---|---|
| acceptance criteria pass fresh _critical_ | 35/35 |
| diff scope matches phase | 15/15 |
| CLAUDE.md conventions | 15/15 |
| decision log respected | 10/10 |
| code reads cleanly | 10/10 |
| commit message accurate | 5/5 |
| **Total** | **90/90** (100%) |
**Band:** COMPLETE
**Caps applied:** none

- Landed: 7b49e94 — "Add the real-server validation checklists"
- Read-back via closer readback: ok

## Reviews
- doc r1: artifacts/validation-checklists--review-doc-r1.md (Needs Work), r2: artifacts/validation-checklists--review-doc-r2.md (Complete, I1 open), r3: artifacts/validation-checklists--review-doc-r3.md (Complete, delta)

## Notes / reconciliation
- Unknowns: none. Out of scope: none. Invalidated: none. The checklists are the inputs to `real-server-validation` and `real-server-validation-extended` (hitl).
