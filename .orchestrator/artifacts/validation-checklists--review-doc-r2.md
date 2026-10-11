Reviewer: validation-checklists-review-doc-r2 · Model: opus · Dispatched: 2026-10-08T22:23:13Z · Method: anchored /doc-review confirmation (artifact-review skill, doc mode, full scope — no reviewed base blob was saved for a delta) · Scope: validation-checklists, round r2, staged docs/validation/real-server-core.md and docs/validation/real-server-extended.md in /home/user/wt-validation-checklists

## Doc review: docs/validation/real-server-core.md, docs/validation/real-server-extended.md

**Overall assessment:** Complete
**Artifact class:** Tier 3 operational guides. These are two checklist templates that a human runs (step, expected result, result slot), not a spec. Rubric item 8 (Bar comparison) is n/a because no `bar_path` was set, so it is left out of the JSON and has no subsection.
**As-of anchor:** worktree `/home/user/wt-validation-checklists`, HEAD `0f1f82e41bacee970a7336ec5ff5cbec0c7d405d`, staged tree `bbc944751adda4d2504516721fa3973076e6a4f1` (`git write-tree`). Both files are staged `A` and nothing else is changed. App code is unchanged from HEAD. Every artifact `file:line` below is a line of the staged blob (`git show :<path> | cat -n`). Anchor docs were read from `/home/user/plex-poster-app/docs` on 2026-10-08 at review time. App code and artifact were read at the same tree.
**Scope reviewed:** scope is the two staged files, as given by the caller (2 discovered → 2 kept). Files read:
- `docs/validation/real-server-core.md` (45 lines, read in full)
- `docs/validation/real-server-extended.md` (49 lines, read in full)
- `/home/user/plex-poster-app/docs/integration-plan.md` (752 lines): lines 16-31, 119-260, 319-399, 444-466 and 549-564 read; grepped for `firstReachable` and `plex.direct`
- `/home/user/plex-poster-app/docs/spec.md` (436 lines): lines 80-100 (R-SEC-2, R-VAL-1, R-VAL-2, R-FIRST-1) and 380-392 (the (verify) list) read; grepped for `plex.direct` and `firstReachable`
- `/home/user/plex-poster-app/docs/decisions.md` (28 lines, read in full)
- r1 review `.orchestrator/artifacts/validation-checklists--review-doc-r1.md` and `.json` (read in full)
- App code in the worktree: `js/plex.js` (238 lines, read in full); `js/settings-ui.js` (292 lines), lines 55-225; `js/main.js` (447 lines), lines 125-140 and 245-345, 415-447, plus a grep; `js/engine.js` (84 lines), lines 60-84; `index.html` (220 lines), lines 50-215; `package.json` (grep for `start`)
- `CLAUDE.md`: only a graphify note, with no conventions that bear on this review

**Secondary referenced:** the plan's phase 8 criteria and Notes; the blocker phases of phase 9 (`cache-first-fetch`, `serve-config-guard`, `rotation-layout-and-shell`, `status-indicator`, `rotate-plex-token`); spec R-VAL-1, R-VAL-2 and the (verify) list; D11.

### What I ran (read-only; no file in either repo was modified except the two artifacts this review writes)
- I copied the staged blobs into a `mktemp -d` directory under the session scratchpad and ran phase 8 ACs 1-6 there verbatim. Result: `AC1 PASS` … `AC6 PASS`. I removed the directory afterwards.
- Format check: `grep -cE '^- \[ \] V1-[CE][0-9]{2} — .+ — expected: .+ — Result: PENDING — Notes:$'`. Core: 17 rows, 17 match. Extended: 23 rows, 23 match. IDs run C01-C17 and E01-E23 with no gaps. The only repeated ID is `V1-C06`, because C07 cites it ("repeat V1-C06", core:21). It is not a duplicate row.
- Secrets scan: `grep -nEo '[A-Za-z0-9_-]{18,}'` finds only phase names, flags and Plex parameter names. No token-like string appears.
- Connection ranking: I ran the real `rankConnections` from `js/plex.js` on a typical plex.tv connection list with `node --input-type=module`. Output (`'https://192-168-1-10.abc.plex.direct:32400', 'http://192.168.1.10:32400', 'https://203-0-113-5…', relay`) shows that the local https `plex.direct` address ranks **before** the local http address (see I1).
- I ran the score engine on the current verdicts and on the projected verdicts (pasted below).

### r1 findings: status
| r1 finding | Status | r2 evidence |
|---|---|---|
| Critical 1a: C07 token never shown in Diagnostics | resolved | core:25 (now C08): "the Diagnostics `Token` row shows at most the first 4 characters of the token followed by `…`". This matches js/main.js:263 `s.plexToken.slice(0, 4)}…`. |
| Critical 1b: C03 expiry/cancel merged and inaccurate | resolved | core:17 (C03) expects `Code expired — try again.` and a re-enabled button, which matches settings-ui.js:136 and the `finally` at :156. core:18 (C04) expects Cancel to close the panel "with no message", which matches settings-ui.js:176-181. |
| I1: nonexistent "connection" Diagnostics line, no Save | resolved | core:20 (C06): "press Save, then open Diagnostics (press D or the info button) and read the `Server` line". This matches main.js:262. core:21 (C07) repeats C06. (A new, separate issue on the same row is I1 below.) |
| I2: `/status/sessions` shape unobservable; pause and stop bundled | resolved | core:31 names `type`, `thumb`/`grandparentThumb`, `User.title`, `Player.state` (plex.js:95-100). core:32 expects `Player.state` `paused`. Stop is split into core:33 (C13). |
| I3: later-phase rows do not name their builder | resolved | core:39 (`status-indicator`), ext:14 and ext:18 (`settings-sheet`), ext:17 and ext:19 (`content-rating-filter`), ext:20 (`metadata-and-now-playing`), ext:34 (`sleep-mode`), ext:35 (`pixel-shift`), ext:41 (`device-helper-server`), ext:42 (`device-helper-integration`), ext:47 (`kiosk-and-pin`) |
| I4: E11 "matching the README" | resolved | ext:29: "record the name per OS in Notes (the README text arrives in the `docs` phase, which consumes this record)" |
| m1: C04/C02/C01 wording | resolved | core:19 names the Server select, the ` (shared)` suffix and the case with one server (settings-ui.js:147-148). core:16 gives the test-result line (settings-ui.js:101). core:15 keeps the step and the expected result apart. |
| m2: button name and manual fold | resolved | core:25: "Press Test connection … open the Enter token and server manually fold" (index.html:88, :102) |
| m3: no Save in library row | resolved | core:26: "choose a library, press Save, and reload" |
| m4: Wake lock label | resolved | ext:34: "Diagnostics shows `Wake lock: held`" (main.js:273) |
| m5: unmeasurable soak, endpoints, E18 bundling | resolved | core:43 Task Manager (Shift+Esc) readings; ext:21 names the three endpoints; ext:39 states the precondition and makes the negative case optional |
| m6: plan-only (verify) markers | resolved | ext:25 adds the Home user and server-specific token note (plan:132). ext:43 adds "the constant's name" (plan:398). |
| m7: inline secrets warning on the Network-tab rows | resolved | core:37 and core:31: "do not copy the request URL, it carries a token" |

All 13 r1 findings are resolved.

### Strengths
- All mechanical contracts hold: ACs 1-6 pass, and all 40 rows match the item format. `Overall: PENDING` is at core:45 and ext:49. The Result-values line is at core:7 and ext:7. The secrets rule is at core:5 and ext:5.
- The sign-in rows now follow the code path closely. Expiry (core:17), Cancel (core:18), the select shown only for two or more servers with the `(shared)` suffix (core:19) and the test-result line (core:16) all match `js/settings-ui.js` at the as-of tree.
- The Setup line (core:11) sends the human to a cleared site, so an earlier sign-in is not silently reused.
- Every core row is runnable once phase 9's blockers land. The only core row that depends on blocker-built UI (the status dot, core:39) names `status-indicator`. The Image-mode row names `cache-first-fetch` (core:38). No core row depends on a non-blocker phase.
- Each extended row whose UI is built later names the phase that builds it, so `FAIL (<phase>)` can always be filled in.

### Critical gaps (must fix)
None.

### Recommended improvements
- **I1 (Important, item 4, code-bug). C06's expected result describes the opposite connection preference from the code.** Both sides were read at the as-of tree.
  - Artifact, core:20: "firstReachable normally picks the local http address on the LAN, and falls back to the `*.plex.direct` address when the page is https or the LAN is unreachable". The Notes split at core:20 ("a LAN `http://` address or an `https://` `*.plex.direct` address") also misses the case where both apply: a local `plex.direct` address.
  - Code, js/plex.js:219: `const score = (c) => (c.local ? 0 : 2) + (c.relay ? 4 : 0) + (c.protocol === 'https' ? 0 : 1);`. Local https scores 0 and local http scores 1. `discoverServers` requests `includeHttps: 1` (plex.js:204). My `node` run printed the local `https://192-168-1-10.abc.plex.direct:32400` first and `http://192.168.1.10:32400` second.
  - Why it matters: on a typical server with secure connections enabled, the human sees a `*.plex.direct` address on the LAN. The row says to expect plain http, so the human may record a false FAIL that no phase can fix, or may lose confidence in the row. The row's actual pass condition ("an address that works") can still be met, so this is not a gate block. That keeps the severity Recommended (Severity rule: a quality and accuracy improvement that does not block build). The local http address is chosen only when the local plex.direct name fails, for example on a router with DNS-rebind protection.
  - Fix (recommended, lower blast radius; the code's order is deliberate): reword the expected result as "firstReachable tries the local `https` `*.plex.direct` address first, then local `http`, then remote `https`, then relay. The line shows the server name and the address it picked." Change the Notes choice to "local plex.direct / local http / remote plex.direct / relay".
- **m1 (Minor, item 7, code-bug).** C02 (core:16) expects the panel to close "within about 5 s". The code has no such bound. It polls every 2 s (settings-ui.js:129), then runs discovery and `firstReachable`, and each unreachable connection can take up to the 8 s identity timeout (plex.js:126). Suggested fix: "within about 5 s, or up to about 10 s per unreachable address". Alternatively, keep 5 s as a soft note and not as a criterion.
- **m2 (Minor, item 7, code-bug).** C11 (core:31) expects "the Diagnostics `Now playing` row reads `on`". When "Only for this Plex user" is filled in, the row reads `on for <user>` (main.js:265). The row also does not name the clearest observable, the Diagnostics `Poster` row ending `— now-playing` (main.js:266, plex.js:102). Suggested fix: "reads `on` (or `on for <user>`), and the `Poster` row ends `— now-playing`".
- **m3 (Minor, item 7, code-bug).** Setup (core:11) clears site data but does not mention `config.json`. With empty storage, `boot()` loads a `config.json` from the server root (main.js:419-438), so a provisioned file with the old or a revoked token is reused despite the clear. Suggested fix: add "move any `config.json` beside `index.html` aside for this run".
- **m4 (Minor, item 7, code-bug).** C16 (core:39) expects "the status dot reflects the offline state". Under `status-indicator`, the dot appears only after the controls idle-hide (plan:207, "controls idle-hidden after 4 s"). Suggested fix: "do not touch the screen or mouse for at least 5 s".
- **m5 (Minor, item 7, code-bug), extended.** E07 (ext:19) expects "the larger one returns more items", which holds only if the library has more than 150 titles. State that precondition or record the title count. E05 (ext:17) gives the human no way to see a poster's rating; point to the Plex web page for the title, or to the metadata overlay once `metadata-and-now-playing` has landed. E09 (ext:21) runs after `settings-sheet`, where `#signin-btn` is hidden until **Change** is pressed (plan:456). Add "press Change first if the connected card shows". E12-E15, E18 and E19 do not say which phase a FAIL reopens. Suggested routing: `pi-stability` for the overscroll backstop, `device-helper-server` for the `cec-*` argv (plan:369), and `docs` for README facts. This is optional, because these rows check Chromium and OS facts, not app UI.

### Fix path (in order) + ship-gate
There are no Critical items, so the ordered list of blockers is empty.

**Ship-gate:** "Close items 1–0 → Complete." The current verdicts already reach Complete (engine output under Score engine below). For reference, I also computed the result of closing every Recommended item (I1 and m1-m5) by flipping both partials to pass:
```
$ sed 's/"verdict":"partial"/"verdict":"pass"/g' v2.json | python3 ~/.claude/scripts/cc_utils/score.py rubric --md
| Section | Pass | Partial | Fail | N/A | Score |
|---|---|---|---|---|---|
| doc | 7 | 0 | 0 | 0 | 10/10 |
| **Overall** | 7 | 0 | 0 | 0 | **10/10** |

Computed scores: doc: round(10 × (7 + 0.5·0)/7) = round(10) = 10/10
**Overall assessment:** Ready
```

### Spec (verify) coverage map (grep at the as-of tree)
| Spec (verify) item (spec.md:389 unless noted) | Row |
|---|---|
| `contentRating` parameter, multi-value syntax, country-prefixed values | E03 (ext:15), E04 (ext:16), E05 (ext:17) |
| `totalSize` with `X-Plex-Container-Size=0` | E06 (ext:18) |
| `viewOffset`, `duration`, `Player.title` | E08 (ext:20) |
| `X-Plex-Container-Size` oversampling limits | E07 (ext:19) |
| plex.tv sign-in endpoints over https | E09 (ext:21) |
| rotation route and `GET /api/v2/user` 401, plus the Home user and server-specific token caveat (plan:132) | E10 (ext:25) |
| Chromium flags and `DeveloperToolsAvailability` | E12, E13 (ext:30-31) |
| package names on Bookworm and Trixie, labwc and XDG autostart | E11, E14 (ext:29, :32) |
| `cec-ctl`, `cec-client`, `wlr-randr` with compositor env, `/dev/cec0` group, window after a power cycle | E18-E20, E22 (ext:39-41, :43) |
| individual `translate` | E17 (ext:35) |
| `thermal_zone0` | E21 (ext:42) |
| Wake Lock under labwc | E16 (ext:34) |
| `--disk-cache-dir` (spec:257) | E15 (ext:33) |
| TV-wake delay constant (plan:398) | E22 (ext:43) |

Missing: none.

### Rubric verdicts (doc mode)
| # | Item | Verdict | Evidence | Severity |
|---|---|---|---|---|
| 1 | Spec ↔ artifact drift (R-VAL-1/2) | pass | Each R-VAL-1 element (spec.md:90) has a row: the PIN flow through the button at core:15-18, discovery at core:19, firstReachable and LAN vs plex.direct at core:20-21, CORS and transcode at core:37-38, sessions shape at core:31-32. R-VAL-2 (spec.md:93): the first-run code is at ext:13-14, followed by every (verify) item (map above). | — |
| 2 | Tier 1 ↔ Tier 2 alignment ((verify) → rows) | pass | Every item in the spec.md:389 list, and plan markers :132 and :398, has a row (map above). | — |
| 3 | Cross-reference integrity | pass | IDs C01-C17 and E01-E23 are unique and sequential. `V1-C06` (core:21) resolves to core:20. Every named phase exists as a plan heading (`cache-first-fetch` plan:182, `status-indicator` :200, `content-rating-filter` :319, `kiosk-and-pin` :339, `device-helper-server` :361, `device-helper-integration` :383, `settings-sheet` :444, `metadata-and-now-playing` :485, `docs` :564). `Q19` resolves (spec.md:381). | — |
| 4 | Code ↔ Tier 3 accuracy | partial | core:20 vs js/plex.js:219 (I1). The other rows match the code: core:17 vs settings-ui.js:136; core:18 vs :176-181; core:25 vs main.js:263; core:38 vs main.js:272; core:32 vs plex.js:100. | Recommended (I1: false-FAIL risk, the pass condition can still be met) |
| 5 | Schema / contract compliance | pass | ACs 1-6 pass. The format regex matches 40/40 rows. `Overall: PENDING` at core:45 and ext:49. Result-values line at core:7 and ext:7. Secrets rule at core:5 and ext:5. | — |
| 6 | Completeness | pass | Every row whose UI is built later names its builder (r1 I3 table above). Every (verify) item is present. The core rows cover everything in the phase 8 Notes (plan:233). | — |
| 7 | Quality | partial | core:16 (unbounded "5 s"), core:31 (`on` vs `on for`), core:11 (`config.json`), core:39 (idle precondition), ext:19, ext:17, ext:21 | Recommended (m1-m5) |
| 8 | Bar comparison | n/a | No `bar_path` was set, so the item cannot apply. It is excluded from the JSON. | — |

### Score engine
Verdict JSON (also at `/home/user/plex-poster-app/.orchestrator/artifacts/validation-checklists--review-doc-r2.json`):
```
{"score_max":10,"band_rules":[{"if":{"fail_ge":2},"band":"Major Gaps"},{"if":{"fail_ge":1},"band":"Needs Work"},{"if":{"critical_ge":1},"band":"Needs Work"},{"if":{"partial_ge":1},"band":"Complete"},{"if":{"all_pass":true},"band":"Ready"}],"sections":[{"name":"doc","items":[{"id":"1-spec-code-drift","verdict":"pass"},{"id":"2-tier1-tier2-alignment","verdict":"pass"},{"id":"3-cross-reference-integrity","verdict":"pass"},{"id":"4-code-tier3-accuracy","verdict":"partial"},{"id":"5-schema-contract-compliance","verdict":"pass"},{"id":"6-completeness","verdict":"pass"},{"id":"7-quality","verdict":"partial"}]}]}
```
`python3 ~/.claude/scripts/cc_utils/score.py rubric --md < v2.json`, verbatim:
```
| Section | Pass | Partial | Fail | N/A | Score |
|---|---|---|---|---|---|
| doc | 5 | 2 | 0 | 0 | 9/10 |
| **Overall** | 5 | 2 | 0 | 0 | **9/10** |

Computed scores: doc: round(10 × (5 + 0.5·2)/7) = round(8.57143) = 9/10
**Overall assessment:** Complete
```

### Checklist scores
| Section | Pass | Partial | Fail | N/A |
|---|---|---|---|---|
| doc | 5 | 2 | 0 | 0 |

(The Bar item is excluded from the table and from the engine.)

### Declined to judge
- Whether C15's FAIL should reopen `cache-first-fetch` (core:38) when the cause is the server's CORS policy rather than app code. The plan places this failure mode there (plan:196 and :256), and r1 accepted it. It is a routing question for the conductor.
- Whether real plex.tv returns local http connections at all when the server's Secure connections setting is "Required". This needs the real server, which is the purpose of the checklist. I1 stands either way, because the code's order is https first.
- Whether Settings labels such as "Check for now playing every" (core:31) will still exist if the core checklist is re-run after `settings-sheet` moves them under Advanced (plan:455). That would be a re-run after later phases, outside this phase's timing.
- The `git-filter-repo` (verify) (plan:617) belongs to the optional `purge-git-history` phase, which D11 excludes from the gate. r1 also declined it.

### Recommendations
Fix I1 in the same edit pass as m1-m5, since each is a one-line wording change. None of them changes the format, so ACs 1-6 will keep passing. No further review round is needed for these unless the conductor wants one. The phase can proceed.

### Assessment
Round 2 resolves all 13 r1 findings, with evidence at the cited lines. The checklists now track the sign-in, Diagnostics and session behaviour the app actually has, name the builder for every row that needs later UI, and stay runnable once `real-server-validation`'s blockers are done. One row (C06) still misstates the code's connection preference: it says local http, but the code prefers local https plex.direct. That risks a false FAIL, but the row's pass condition can still be met. The remaining issues are minor wording fixes. Band: **Complete**, with no Critical.

**Verdict:** APPROVE
