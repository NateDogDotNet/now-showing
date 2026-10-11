Reviewer: validation-checklists-review-doc-r1 · Model: opus · Dispatched: 2026-10-08T22:13:32Z · Method: anchored /doc-review (artifact-review skill, doc mode) · Scope: validation-checklists, round r1, base 0f1f82e, staged files docs/validation/real-server-core.md and docs/validation/real-server-extended.md in /home/user/wt-validation-checklists

## Doc review: docs/validation/real-server-core.md, docs/validation/real-server-extended.md

**Overall assessment:** Needs Work
**Artifact class:** Tier 3 operational guides. These are two human-run validation checklist templates (step, expected result, result slot), not a spec or an architecture doc. Rubric item 8 (Bar comparison) does not apply because no `bar_path` was set. It is left out of the JSON and has no subsection.
**As-of anchor:** worktree `/home/user/wt-validation-checklists`, HEAD `0f1f82e41bacee970a7336ec5ff5cbec0c7d405d`, staged tree `a8907e74839c7bb9134b709deee5a89dbdd51543` (`git write-tree`). Both files are staged as `A` and nothing else is modified. Every artifact and app-code `file:line` below is read at this tree. The anchor docs are read from `/home/user/plex-poster-app` as they stood on 2026-10-08 at the time of review.
**Scope reviewed:** these files, read in full unless marked otherwise:
- `docs/validation/real-server-core.md` (43 lines)
- `docs/validation/real-server-extended.md` (49 lines)
- `/home/user/plex-poster-app/docs/integration-plan.md` (752 lines): read lines 1-50, 182-260, 549-564; also grepped for `(verify` and for lines 132, 333-336, 398, 400-420, 453, 576-581
- `/home/user/plex-poster-app/docs/spec.md` (436 lines): read R-VAL-1/2 (lines 90, 93), the (verify) list (lines 387-389) and lines 200-215; grepped for every `verify` marker
- `/home/user/plex-poster-app/docs/decisions.md` (28 lines, full)
- App code: `index.html` lines 52-215; `js/main.js` lines 20-85, 192-223, 250-341; `js/settings-ui.js` lines 80-220; `js/plex.js` lines 86-260; `js/settings.js` lines 20-60; `README.md` (grep only)
- `CLAUDE.md` (graphify note only, no conventions that bear on this review)

Scope filter: given by the caller as the two staged files (2 discovered → 2 kept).
**Secondary referenced:** the plan's phase 8 criteria and Notes, spec R-VAL-1, R-VAL-2 and the (verify) list, decision D11.

### What I ran (all read-only, in the worktree; no files changed)
- Ran phase 8 acceptance criteria 1-6 verbatim. **All six PASS.**
- Format check: `grep -cE '^- \[ \] V1-[CE][0-9]{2} — .+ — expected: .+ — Result: PENDING — Notes:$'`. Core: 15 rows, 15 match. Extended: 23 rows, 23 match. No row has text after `Notes:`.
- Secrets scan: `grep -nEo '[A-Za-z0-9_-]{18,}' docs/validation/*.md` finds only phase names, flags and Plex parameter names. There is no token-like string. The curl example at extended:9 reads the token from fd 3.
- (verify) coverage: grepped every spec and plan `(verify` marker, then grepped the extended file for each key term (see the table below).
- Score engine: run on the current JSON and on the projected JSON (pasted below).

### Strengths
- Every mechanical contract holds: ACs 1-6 pass, and all 38 rows use the required format. `Overall: PENDING` (core:43, extended:49) and the `Result values:` line (core:7, extended:7) are exact.
- Both files print the secrets rule at the top (core:5, extended:5). The extended file shows a safe header-from-fd pattern for manual requests (extended:9). Neither file contains a token or a token-like example.
- Every item in the spec's "(verify) list carried into V1" (spec.md:389) and every inline spec (verify) has a row (table below). The first-run-code row is in the extended file, which matches the plan Note at plan:233-234 (extended:13, which names `settings-sheet`).
- Several rows name the phase to reopen, which serves D11 ("A failed validation reopens the phase it names", decisions.md:20): core:36 (`cache-first-fetch`), extended:13, :15, :16 and :43.
- The Image mode row (core:36) quotes the exact Diagnostics strings. `downloaded + cached` and `direct` match js/main.js:272 (`'direct (no offline cache)' : 'downloaded + cached'`).

### Spec (verify) coverage map (grep at the as-of tree)
| Spec (verify) item (spec.md:389 unless noted) | Row |
|---|---|
| `contentRating` parameter, multi-value syntax, country-prefixed values | E03 (ext:15), E04 (ext:16), E05 |
| `totalSize` with `X-Plex-Container-Size=0` (spec:118) | E06 (ext:18) |
| `viewOffset`, `duration`, `Player.title` (spec:156) | E08 (ext:20) |
| `X-Plex-Container-Size` oversampling limits | E07 (ext:19) |
| plex.tv sign-in endpoints over https | E09 (ext:21) |
| rotation route and `GET /api/v2/user` 401 (spec:83) | E10 (ext:25) |
| Chromium flags and `DeveloperToolsAvailability` (spec:263, 275) | E12, E13 (ext:30-31) |
| package names on Bookworm and Trixie, labwc and XDG autostart (spec:275) | E11, E14 (ext:29, 32) |
| `cec-ctl`, `cec-client`, `wlr-randr` with compositor env, `/dev/cec0` group, window after a power cycle (spec:205) | E18-E20, E22 (ext:39-41, 43) |
| `hdmi_force_hotplug=1` (spec:275 "verify both") | E18 (ext:39) |
| individual `translate` support | E17 (ext:35) |
| `thermal_zone0` | E21 (ext:42) |
| Wake Lock under labwc | E16 (ext:34) |
| `--disk-cache-dir` / `--disk-cache-size` (spec:257) | E15 (ext:33) |

**Missing from the spec's (verify) list: none.** Two plan-only (verify) markers are only partly carried (see Minor m6). The (verify) for the `git-filter-repo` package name (plan:617) belongs to the optional `purge-git-history` phase. I declined to judge it (see Declined to judge).

### Critical gaps (must fix)
1. **Two core expected results cannot be met by the app as written, so `real-server-validation` cannot honestly reach `Overall: PASS` (rubric item 4, Code ↔ Tier 3).** Severity: Critical, because it blocks correct closure of the M1 gate phase under D11 (decisions.md:20: "requires ... `Overall: PASS` on the core ... validation"). No phase owns a code change that would make these rows pass. Class: **code-bug**. Both sides were read at the as-of tree.
   - **C07, token in Diagnostics.** The artifact says (core:24): "the signed-in token is never shown in the toast or in Diagnostics". The code renders the first four characters of the token on purpose: js/main.js:263 `Token: s.plexToken ? \`${s.plexToken.slice(0, 4)}…\` : '—'`. A careful human sees a token fragment and marks FAIL with no phase to reopen. **Recommended fix (lower blast radius, matches what the code intends):** amend the row to "Diagnostics shows at most the first 4 characters of the token followed by `…`, and the toast and Recent events never show it".
   - **C03, expiry or cancel.** The artifact says (core:17): "Let a fresh code expire ... or press cancel — expected: the app shows an expired or cancelled message and offers a new code". In the code, expiry sets `'Code expired — try again.'` and re-enables the button (js/settings-ui.js:136, :156). It does not offer a new code by itself. Cancel hides the panel and shows no message (js/settings-ui.js:176-181 `cancelSignIn` only aborts and hides `#signin-panel`). **Recommended fix:** split the row in two. C03a: expiry shows `Code expired — try again.` and pressing **Sign in with Plex** again gets a new code. C03b: **Cancel** closes the code panel and re-enables **Sign in with Plex**, with no spinner left behind.

### Important issues
- **I1. C05 reads a Diagnostics line that does not exist, before the value has been saved (item 4, partial; code-bug).** The artifact says (core:19): "Pick a server, then open Diagnostics and read the connection firstReachable chose". The code has no "connection" row. The chosen URI goes into the `serverUrl` field (js/settings-ui.js:171) and appears only in the `Server` row (js/main.js:262 `Server: \`${s.serverName || ''} ${s.serverUrl}\``). That row reads `state.settings`, which changes only on save: `serverUrl` is not inside the `data-live` fieldset (index.html:97 vs :144), and preview applies only data-live fields (js/main.js:222). The Settings sheet is also a modal dialog, and the `d` key is ignored inside dialogs (js/main.js:335). The test result line already shows the URI implicitly through `✓ <name> (vX) — N libraries` (settings-ui.js:101). **Fix:** "Pick a server, press Save, then open Diagnostics (D or the info button) and read the `Server` line; write whether the URL is a LAN `http://` address or `https://*.plex.direct`". Apply the same change to C06.
- **I2. C10's `/status/sessions` shape check cannot be observed (items 1 and 4; code-bug).** R-VAL-1 lists "`/status/sessions` shape" (spec.md:90). The row says "the response has the fields the app reads" (core:30) and does not name them. A human cannot check this. The app reads `type`, `thumb`/`grandparentThumb`/`parentThumb`, `ratingKey`/`grandparentRatingKey`, `title`/`grandparentTitle`, `year`, `User.title` and `Player.state` (js/plex.js:92-117). **Fix:** list those fields in the expected result. In C11 (core:31), name `Player.state="paused"` as the observable value, and split the "stop playback" check into its own row.
- **I3. Rows that depend on UI not yet built do not name the phase that builds it (item 6; code-bug against the prompt's rule).** Without the builder named, the human cannot fill `FAIL (<phase to reopen>)` (core:7). These rows lack it:
  - core C14 (core:37, status dot, `status-indicator`)
  - E02 (ext:14, code refresh, `settings-sheet`)
  - E05 (ext:17, household limit and "raise the limit" hint, `content-rating-filter`)
  - E06 (ext:18, "Title · N titles" labels, `settings-sheet`, plan:451-453)
  - E07 (ext:19, oversampling, `content-rating-filter`, plan:326)
  - E08 (ext:20, progress bar, `metadata-and-now-playing`)
  - E16 (ext:34, sleep and wake on playback, `sleep-mode`)
  - E17 (ext:35, pixel shift, `pixel-shift`)
  - E20 and E21 (ext:41-42, `--helper` flags and `/__helper/status`, `device-helper-server`; CPU temperature in Diagnostics, `device-helper-integration`)
  - E23 (ext:47, Show behind the PIN, `kiosk-and-pin`)

  **Fix:** add "(built by `<phase>`; FAIL reopens it)" to each of these rows.
- **I4. E11 checks against a README that will not have the fact yet (item 4; code-bug).** The artifact says (ext:29): "expected: `chromium-browser` on Bookworm, `chromium` on Trixie, matching the README". The README at the as-of tree names only `chromium-browser` (README.md:71, :94). The plan writes the Trixie line in `docs`, which runs after this validation (plan:562 "Do this before `docs` so verified facts ... reach the README"). The Trixie half would FAIL against a correct tree. **Fix:** drop "matching the README" and record the package name per OS in Notes. The `docs` phase consumes it.

### Minor issues
- **m1 (item 4, code-bug).** C04 (core:18) says "open the server list". There is no list to open: a `Server` select appears only after sign-in and only with two or more servers (js/settings-ui.js:148, `server-pick hidden = servers.length < 2`), and shared servers carry a ` (shared)` suffix (js/settings-ui.js:147). C02 (core:16) expects the app to show "you as signed in", but the observable result is that the code panel closes and the test result reads `✓ <server> (vX) — N libraries` (settings-ui.js:101, :171). C01 (core:15) puts an expected result ("A code is shown ...") inside the step.
- **m2 (item 4, code-bug).** C07 (core:24) says "Press the connection test". The button is **Test connection** (index.html:102). The wrong-URL check needs the **Enter token and server manually** fold opened first (index.html:88-98).
- **m3 (item 7, code-bug).** C08 (core:25) says "selecting one persists after reload" but never says to press **Save**. Saving is the only way to persist (js/main.js:192-194).
- **m4 (item 4, code-bug).** E16 (ext:34) says "the sleep veil in Diagnostics reports it held". The Diagnostics row is `Wake lock: held` (js/main.js:273).
- **m5 (item 7, code-bug).** C15 (core:41) expects "memory use not climbing steadily" but gives no way to measure it, such as Chromium Task Manager (Shift+Esc) readings at start and end in Notes. E09 (ext:21) does not name the three endpoints (`/api/v2/pins` POST, `/api/v2/pins/{id}`, `/api/v2/resources`; js/plex.js:185, :194, :204) or say where to look (the Network tab during C01-C04). E18 (ext:39) puts a precondition (`hdmi_force_hotplug=1`) and an untested negative case ("without the group") inside the expected result.
- **m6 (item 2, code-bug).** Plan Convention 9 (plan:26) says every (verify) is carried into `docs/validation/`. Two plan-only markers are carried only partly. The first is the server-specific or Home-user token caveat on the rotation route (plan:132), which E10 (ext:25) omits. The second is the TV-wake delay "named constant, (verify) on hardware" (plan:398), which E22 (ext:43) records only as "note the seconds" without naming the constant.
- **m7 (item 7, code-bug).** C12 (core:35) sends the human to the Network tab for a `/photo/:/transcode` request whose URL carries `X-Plex-Token` as a query parameter (js/plex.js:121, :159). The top-of-file rule covers this, but this row is where a token URL is most likely to be pasted. Add an inline "do not copy the request URL".

### Fix path (in order) + ship-gate
1. Critical 1 (item 4): rewrite C07 to match the 4-character token prefix in Diagnostics, and split C03 into the expiry and Cancel behaviours the code actually has.

**Ship-gate:** closing item 1 moves the band to **Complete**. Computed by flipping item 4 to pass:
```
$ sed 's/"verdict":"partial","tags":\["critical"\]/"verdict":"pass"/' v.json | python3 ~/.claude/scripts/cc_utils/score.py rubric --md
| Section | Pass | Partial | Fail | N/A | Score |
|---|---|---|---|---|---|
| doc | 3 | 4 | 0 | 0 | 7/10 |
| **Overall** | 3 | 4 | 0 | 0 | **7/10** |

Computed scores: doc: round(10 × (3 + 0.5·4)/7) = round(7.14286) = 7/10
**Overall assessment:** Complete
```
I1-I4 and m1-m7 sit below the gate, but I1-I4 should be fixed in the same pass. Each one would produce a false FAIL or an unfillable `FAIL (<phase>)` when the human runs the checklist.

### Rubric verdicts (doc mode)
| # | Item | Verdict | Evidence | Severity |
|---|---|---|---|---|
| 1 | Spec ↔ artifact drift (R-VAL-1/2 contract) | partial | Each R-VAL-1 element has a row: sign-in core:15-17, discovery and firstReachable core:18-20, CORS and transcode core:35-36, sessions core:30-31, LAN vs plex.direct core:19-20. The "shape" in C10 is unspecified (core:30). | Recommended (Important I2): quality, not a build block |
| 2 | Tier 1 ↔ Tier 2 alignment (spec and plan (verify) → rows) | partial | All items in the spec.md:389 list are covered (table above). Plan markers plan:132 and :398 are partly carried (m6). | Recommended (Minor) |
| 3 | Cross-reference integrity | pass | IDs C01-C15 and E01-E23 are unique and sequential. `V1-C05` (core:20) resolves. Every cited phase exists as a plan heading (`cache-first-fetch` plan:182, `settings-sheet` :444, `content-rating-filter` :319, `device-helper-integration` :383). `Q19` resolves (spec.md:381). | — |
| 4 | Code ↔ Tier 3 accuracy | partial | core:17 vs settings-ui.js:136/176-181; core:24 vs main.js:263; core:19 vs main.js:262/222; ext:29 vs README.md:71; ext:34 vs main.js:273 | **Critical**: blocks the D11 gate (Critical 1) |
| 5 | Schema / contract compliance | pass | AC1-6 pass. Format regex matches 38/38 rows. `Overall: PENDING` at core:43 and ext:49. Result-values line at core:7 and ext:7. The secrets rule is at core:5 and ext:5. | — |
| 6 | Completeness | partial | All (verify) items are present. Builder phases are missing on 12 rows (I3). | Recommended (Important I3) |
| 7 | Quality | partial | Some rows bundle several checks or alternatives: core:17 ("or press cancel"), core:31 (pause plus stop), ext:39. Some rows have no way to measure the expected result: core:41 (memory), ext:21 (endpoints). | Recommended (Minor) |
| 8 | Bar comparison | n/a | No `bar_path` was set, so the item is structurally inapplicable. It is excluded from the JSON. | — |

### Score engine
Verdict JSON (also at `/home/user/plex-poster-app/.orchestrator/artifacts/validation-checklists--review-doc-r1.json`):
```
{"score_max":10,"band_rules":[{"if":{"fail_ge":2},"band":"Major Gaps"},{"if":{"fail_ge":1},"band":"Needs Work"},{"if":{"critical_ge":1},"band":"Needs Work"},{"if":{"partial_ge":1},"band":"Complete"},{"if":{"all_pass":true},"band":"Ready"}],"sections":[{"name":"doc","items":[{"id":"1-spec-code-drift","verdict":"partial"},{"id":"2-tier1-tier2-alignment","verdict":"partial"},{"id":"3-cross-reference-integrity","verdict":"pass"},{"id":"4-code-tier3-accuracy","verdict":"partial","tags":["critical"]},{"id":"5-schema-contract-compliance","verdict":"pass"},{"id":"6-completeness","verdict":"partial"},{"id":"7-quality","verdict":"partial"}]}]}
```
`python3 ~/.claude/scripts/cc_utils/score.py rubric --md` output, verbatim:
```
| Section | Pass | Partial | Fail | N/A | Score |
|---|---|---|---|---|---|
| doc | 2 | 5 | 0 | 0 | 6/10 |
| **Overall** | 2 | 5 | 0 | 0 | **6/10** |

Computed scores: doc: round(10 × (2 + 0.5·5)/7) = round(6.42857) = 6/10
**Overall assessment:** Needs Work
```

### Checklist scores
| Section | Pass | Partial | Fail | N/A |
|---|---|---|---|---|
| doc | 2 | 5 | 0 | 0 |

(The Bar item is excluded from the table and from the engine, per the skill.)

### Declined to judge
- The `git-filter-repo` package-name (verify) (plan:617) belongs to the optional `purge-git-history` phase. D11 says optional phases never block the release, and phase 8's Notes do not list it. This is outside phase 8's scope.
- Whether a 4-character token prefix in Diagnostics is acceptable as a product choice. That is existing behaviour outside this diff. I ruled only that the checklist must describe it accurately.
- Whether the extra non-(verify) rows (E05, E23) belong in the extended file. They are reasonable, nothing forbids them, and it is a scope preference.
- Whether "about 15 min" is the real plex.tv PIN lifetime. The code falls back to 15 min only when `expiresAt` is absent (settings-ui.js:127). Checking this needs the real server, which is the purpose of the checklist.

### Recommendations
Apply Critical 1, then I1-I4, in one edit to the two files. Re-run phase ACs 1-6, which are format-only and will still pass. Then request a confirmation round. The minor items can go in the same pass at little cost.

### Assessment
The templates meet every mechanical criterion in phase 8, carry every spec (verify) item, and handle secrets correctly. They fail where the plan's narrated criterion 7 bites hardest: exact steps with observable expected results that match what the app actually shows. Two core rows (C03, C07) describe behaviour the app does not have, so the M1 validation phase could not close honestly. Several more rows point at the wrong Diagnostics label or at UI whose builder they do not name. Band: **Needs Work**.

**Verdict:** CHANGES REQUESTED
