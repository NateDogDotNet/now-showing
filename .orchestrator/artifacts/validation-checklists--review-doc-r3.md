Reviewer: validation-checklists-review-doc-r3 · Model: opus · Dispatched: 2026-10-08T22:32:12Z · Method: anchored /doc-review, delta-scoped band re-run · Scope: validation-checklists, round r3, reviewed base tree bbc9447 (r2) → staged tree 12e2ea7, files docs/validation/real-server-core.md and docs/validation/real-server-extended.md in /home/user/wt-validation-checklists

## Doc review (delta-scoped): docs/validation/real-server-core.md, docs/validation/real-server-extended.md

**Overall assessment:** Complete (score engine output below)
**Artifact class:** Tier 3 operational guides (checklist templates), unchanged from r2. Rubric item 8 (Bar comparison) is n/a because no `bar_path` was set. It is excluded from the JSON.
**As-of anchor:** worktree `/home/user/wt-validation-checklists`, HEAD `0f1f82e41bacee970a7336ec5ff5cbec0c7d405d`. `git write-tree` = `12e2ea7f2f89d5519e8bcac4b0651e3512dbda2e`, which matches the Scope. `git status --short` shows only the two files, staged `A`. App code is unchanged from HEAD. The delta replaces lines one for one (no lines are added or removed), so r2's line numbers still hold. Every artifact `file:line` below is a line of the staged blob.

### What I read and ran (read-only; the only files written are this review and its JSON)
- r2 verdict JSON and r2 review (read in full). The r3 delta patch (read in full; it touches core:11, :16, :20, :31, :39 and ext:17, :19, :21). The rubric `~/.claude/skills/artifact-review/SKILL.md` (grepped for the partial, severity and band rules).
- Worktree code: `js/plex.js:195-238` (`discoverServers`, `rankConnections`, `firstReachable`), `js/plex.js:102,126`, `js/settings-ui.js:125-132`, `js/main.js:260-268,419-425`.
- I copied the staged blobs into a `mktemp -d` scratch directory and ran the format checks there. Core: 17 rows, 17 match the item regex. Extended: 23 rows, 23 match. Both files end in `Overall: PENDING`. The only repeated ID is `V1-C06`, which C07 cites. The secrets scan (`[A-Za-z0-9_-]{18,}`) found only phase names, flags and parameter names. I removed the directory afterwards.
- I ran the real `rankConnections` with `node --input-type=module` on five connections (local https, local http, remote https, remote http, relay). Output:
  ```
  [ 'https://192-168-1-10.abc.plex.direct:32400',
    'http://192.168.1.10:32400',
    'https://203-0-113-5.abc.plex.direct:32400',
    'http://203.0.113.5:32400',
    'https://relay.plex.direct:8443' ]
  ```
- I ran `score.py rubric --md` on the r3 verdicts (output below).

### r2 findings: status
| r2 finding | Status | r3 evidence |
|---|---|---|
| I1 (Important): C06 states the opposite connection preference | **resolved** | core:20 now reads "firstReachable tries the local `https` `*.plex.direct` address first, then local `http`, then remote `https`, then relay". That matches `js/plex.js:219` `score = (c.local ? 0 : 2) + (c.relay ? 4 : 0) + (c.protocol === 'https' ? 0 : 1)` and the node output above. `firstReachable` (plex.js:229-238) returns the first entry whose `identity()` answers, so "tries … first" is accurate. The Notes split now offers four choices ("local plex.direct, local http, remote plex.direct or relay"). The expected result is "the address it picked", so no reachable path can produce a false FAIL. There is a small residual gap (n1 below). |
| m1: unbounded "about 5 s" in C02 | resolved | core:16: "within about 5 s (up to about 10 s per unreachable address)". This is consistent with the 2 s poll (settings-ui.js:130) and the 8 s identity timeout (plex.js:126). |
| m2: C11 `on` vs `on for <user>`, Poster row | resolved | core:31: "reads `on` (or `on for <user>`), the `Poster` row ends `— now-playing`". This matches main.js:265-266 and plex.js:102 `toPoster(candidates[0], 'now-playing')`. |
| m3: Setup ignores `config.json` | resolved | core:11: "Move any `config.json` beside `index.html` aside for this run." This matches main.js:419-425. |
| m4: C16 idle precondition | resolved | core:39: "do not touch the screen or mouse for at least 5 s". This is longer than the 4 s idle-hide in the plan (as cited in r2, plan:207). |
| m5: extended wording (E07, E05, E09, routing for E12-E15/E18/E19) | **partly resolved; routing part open** | E07 (ext:19) now has "this holds only if the library has more than 150 titles; record the title count in Notes". E05 (ext:17) now has "check each title's rating on its Plex web page, or in the metadata overlay". E09 (ext:21) now has "press Change first if the connected card shows". Still open: E12-E15 (ext:30-33), E18 (ext:39) and E19 (ext:40) still do not say which phase a FAIL reopens. r2 marked this part optional. |

### Strengths
- Every delta edit is a narrow wording change that closes the r2 finding it targets, and each one matches the code at the cited line.
- C06 (core:20) now describes the ranking the code actually uses, and its pass condition can always be checked.
- The mechanical contracts still hold: 40/40 rows match the item format, IDs have no gaps, both files end in `Overall: PENDING`, and no token-like strings appear.

### Critical gaps (must fix)
None.

### Recommended improvements
- **n1 (Minor, item 4, code-bug). C06 leaves out the remote-http tier.** core:20 lists "local `https` … then local `http`, then remote `https`, then relay". The code scores a remote http connection at 3 (plex.js:219). That puts it after remote https and before relay, as the node output shows (`http://203.0.113.5:32400` is fourth). The Notes choices at core:20 have no "remote http" option either. Why it matters: on a server that lists a remote http connection, the row's description of the order is incomplete, and the human has no category to record it under. The pass condition ("the address it picked") is unaffected, so this is a wording fix only. Severity: Recommended, because it does not block build or correctness. Fix: "… then remote `https`, then remote `http`, then relay". Add "remote http" to the Notes choices.
- **m5 residual (Minor, item 7, code-bug), carried from r2.** E12-E15 (ext:30-33), E18 (ext:39) and E19 (ext:40) still have no FAIL routing. Suggested routing, as in r2: `pi-stability` for the overscroll backstop, `device-helper-server` for the `cec-*` argv, and `docs` for README facts. This is optional, because these rows check Chromium and OS facts.

### Rubric verdicts (doc mode)
| # | Item | Verdict | Evidence | Severity |
|---|---|---|---|---|
| 1 | Spec ↔ artifact drift (R-VAL-1/2) | pass | Carried from r2. The delta touches core:20, but the R-VAL-1 element ("firstReachable and LAN vs plex.direct") is still covered at core:20-21. The other cited rows are unchanged: core:15-19, :31-32, :37-38; ext:13-14. | — |
| 2 | Tier 1 ↔ Tier 2 alignment | pass | Carried from r2. The (verify) map rows (ext:15-43) are unchanged except for wording at ext:17, :19 and :21, and each of those rows still covers its item. | — |
| 3 | Cross-reference integrity | pass | Re-judged, because the delta adds a phase name: `metadata-and-now-playing` at ext:17 is a plan heading (plan:485, per r2). `V1-C06` (core:21) still resolves to core:20. No other references changed; the rest is carried from r2. | — |
| 4 | Code ↔ Tier 3 accuracy | partial | Re-judged. I1 is resolved: core:20 matches plex.js:219. core:16 matches settings-ui.js:130 and plex.js:126. core:31 matches main.js:265-266 and plex.js:102. core:11 matches main.js:419-425. The residual n1 is that core:20 omits the remote-http tier (plex.js:219, node output). | Recommended (n1: no false-FAIL risk, does not block build) |
| 5 | Schema / contract compliance | pass | Re-run at 12e2ea7: 17/17 and 23/23 rows match the format regex, and both files end in `Overall: PENDING`. The Result-values and secrets lines (core:5, :7; ext:5, :7) are carried from r2 and are untouched by the delta. | — |
| 6 | Completeness | pass | Carried from r2. Every row whose UI is built later still names its builder. ext:17 adds an observation aid, and no row was removed. | — |
| 7 | Quality | partial | Re-judged. m1-m4 are resolved (core:16, :31, :11, :39). In m5, the E07, E05 and E09 parts are resolved (ext:19, :17, :21). The routing part is still open at ext:30-33, :39 and :40. | Recommended (m5 residual) |
| 8 | Bar comparison | n/a | No `bar_path` was set. Excluded from the JSON. | — |

### Score engine
Verdict JSON (at `/home/user/plex-poster-app/.orchestrator/artifacts/validation-checklists--review-doc-r3.json`):
```
{"score_max":10,"band_rules":[{"if":{"fail_ge":2},"band":"Major Gaps"},{"if":{"fail_ge":1},"band":"Needs Work"},{"if":{"critical_ge":1},"band":"Needs Work"},{"if":{"partial_ge":1},"band":"Complete"},{"if":{"all_pass":true},"band":"Ready"}],"sections":[{"name":"doc","items":[{"id":"1-spec-code-drift","verdict":"pass"},{"id":"2-tier1-tier2-alignment","verdict":"pass"},{"id":"3-cross-reference-integrity","verdict":"pass"},{"id":"4-code-tier3-accuracy","verdict":"partial"},{"id":"5-schema-contract-compliance","verdict":"pass"},{"id":"6-completeness","verdict":"pass"},{"id":"7-quality","verdict":"partial"}]}]}
```
`python3 ~/.claude/scripts/cc_utils/score.py rubric --md < validation-checklists--review-doc-r3.json`, verbatim:
```
| Section | Pass | Partial | Fail | N/A | Score |
|---|---|---|---|---|---|
| doc | 5 | 2 | 0 | 0 | 9/10 |
| **Overall** | 5 | 2 | 0 | 0 | **9/10** |

Computed scores: doc: round(10 × (5 + 0.5·2)/7) = round(8.57143) = 9/10
**Overall assessment:** Complete
```
Ship-gate: there are no Critical items. Fixing n1 and the m5 residual flips both partials to pass. The engine then returns `**Overall assessment:** Ready`.

### Checklist scores
| Section | Pass | Partial | Fail | N/A |
|---|---|---|---|---|
| doc | 5 | 2 | 0 | 0 |

### Declined to judge
- Whether real plex.tv ever lists a remote http connection when `includeHttps=1` is set. That depends on the server's Secure connections setting and needs the real server, which is the purpose of the checklist. n1 stands on the code's ranking either way.
- The phase routing for C15's CORS failure, the label locations after `settings-sheet`, and the `git-filter-repo` (verify) item. All are carried from r2's Declined list unchanged, for the same reasons. The delta does not touch them.

### Recommendations
Fix n1 with a one-phrase edit to core:20. The m5 routing residual is optional. No further review round is needed for either one. The phase can proceed.

### Assessment
The r3 delta resolves the only Important finding from r2 (I1). C06 now states the code's actual order, local https plex.direct before local http, and I confirmed that against `rankConnections` with a real run. m1-m4 are resolved, and so are three of the four parts of m5. What is left is minor: C06 omits the remote-http tier, and six extended rows still have no FAIL routing. Band: **Complete**, with no Critical or Important findings open.

**Verdict:** APPROVE
