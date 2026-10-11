# Brief — planning r2: revise the spec and integration plan

You are the builder for **re-dispatch r2** of the `planning` phase. Round r1 produced `docs/spec.md`
and `docs/integration-plan.md` (committed as `1f4d3e2`). Two fresh reviewers returned
**CHANGES REQUESTED**, and the owner has ruled on every product question. Revise both documents so
they satisfy the rulings and close every code-bug finding below. Revise in place; this is not a rewrite
from scratch. Keep what the reviewers praised: accurate code citations, runnable criteria,
secret hygiene and hitl routing.

## Read first (all of them)
- `.orchestrator/artifacts/planning--brief-r1.md` is the original brief. Its rules still hold unless this brief overrides them.
- `docs/decisions.md` holds the owner's rulings **D1–D16**. These are binding: every behaviour they set must appear in the spec and plan exactly as ruled, and each change cites its D-entry.
- `.orchestrator/artifacts/planning--review-anchored-r1.md` and `.orchestrator/artifacts/planning--review-skeptic-r1.md` are the reviews. Read both in full.
- `.orchestrator/questions.md` holds Q1–Q13 and the rulings section at its end.
- `Roadmap.md` now includes the "Auto-discover Plex servers" idea (commit `b44560c`).
- `~/.claude/skills/integration-orchestrator/SKILL.md`: the "Count the change" rule, tag routing, HITL rules, and the Invocation cross-checks.
- The code at HEAD (`js/`, `css/`, `index.html`, `sw.js`, `scripts/`, `tests/`, `.github/workflows/ci.yml`).

## Scope rulings to apply (summary; `docs/decisions.md` is the source)
- **D1 lean plan (target about 22–26 phases).**
  - Remove these phases: `remote-config-server`, `remote-config-ui`, `multi-poster-layout`, `frame-per-source`, `coming-attractions-artwork`, `coming-attractions-register`, `bulb-animation`, `frame-rotation`.
  - Their findings (U6, U8, E3, E5, and the multi-poster part of U7) become spec **non-goals / deferred**, each with its reason and "→ Roadmap".
  - The docs phase adds a Roadmap entry for each deferred item, unless one already exists (the remote/QR idea exists as "Remote control", so extend it). Record each in the traceability matrix as `deferred (D1)`.
- **Merge** as the anchored review proposed:
  - Remove the four gate phases. Their checks move to Step 7 `/phase-gate` on the phase that closes each milestone, and into `release-bump`.
  - `layout-rotation-fix` + `ui-rotation-shell` → one phase.
  - `connection-card-and-libraries` + `settings-time-and-advanced` (+ `actionable-errors` if it shares the e2e run) → one settings-sheet phase.
  - `metadata-overlay` + `now-playing-extras` (now without the player label if that is all that remains; keep the progress bar) → one phase.
  - `docs-hardening` + `docs-features` → one docs phase.
  - Keep `device-helper-server` separate from `device-helper-integration`.
- **D3:** add the auto-started PIN flow with a large code on the empty card. Give it its own requirement and put it in the settings/first-run phase. LAN discovery stays Roadmap-only.
- **D4, D5, D6, D8, D9, D10:** rewrite the affected requirements, defaults table, settings keys and phases exactly as ruled. This includes:
  - the whole-stage dim option;
  - the pixel-shift glide transition;
  - the guarded daily reload (service worker controlling the page + no-store probe; skipped otherwise; tablet-fullscreen note);
  - the content limit applied to the cache index (add `contentRating` to `poster-cache.js` entries in that phase's Output) and to now-playing;
  - the country-prefix mapping;
  - the "household with children" toggle, kept out of the protection preset;
  - the helper narrowed to power and temperature, with the env passthrough and `cec-ctl`;
  - the serve allowlist with a hostname-only Host check;
  - kiosk recovery through a key-hold reveal and a loopback `config.json` PIN reset;
  - the preset with no idle sleep and no content limit.
- **D11:** `release-bump` is blocked by `rotate-plex-token`, `real-server-validation` and `real-server-validation-extended`, and its criteria require `Rotated: yes` and `Overall: PASS` (both files). Validation criteria accept **only** PASS; a FAIL keeps the phase open. Optional phases never block the release.
- **D12:** state in the conventions that concurrent phases run in separate worktrees with their own `E2E_PORT`/`E2E_MOCK_PORT`. Scope probes (`git diff --quiet HEAD -- …`) are then valid per worktree; also note that `git diff HEAD` misses untracked files, so scope probes must use `git status --porcelain -- <paths>` or the conductor's reconcile.
- **D13:** remove the `publish` tag. The run pushes to the branch only.
- **D14:** `purge-git-history` stays only as an optional irreversible hitl phase, explicitly skipped unless the owner says the repo is public or shared. It is outside the release path.
- **D15:** Playwright is a devDependency and `package-lock.json` is a mandatory Output of `e2e-harness`, so CI `npm ci` works.
- **D16:** correct Q6's rationale and state the PIN-is-deterrence copy.

## Code-bug findings to close (each must be fixed; cite the ID in your handback)

**Anchored review**
- **I1/I5/I11-D11:** release-path gates.
- **I2:** no optional asset on the critical path. This is moot after D1, but verify with the graph.
- **I3:** see D12.
- **I4:** `fill-blur-and-info` is blocked by `pi-stability`, or its grep is scoped.
- **I6:** moot after D1 (remote removed).
- **I7:** right-sizing.
- **M1–M10:**
  - drop items that are moot after D1;
  - M4: negative greps use `test -f F && ! grep …`;
  - M5: the token regex;
  - M6: the purge criterion runs against a fresh clone of origin;
  - M7: `check-precache` is recursive;
  - M8: `release-bump` criteria have teeth;
  - M9: criteria hold under the ruled options;
  - M10: re-tag. Drop `risk:high` from `rotate-plex-token` and from the merged rotation phase unless you justify it; add `risk:high` to `content-rating-filter`; keep `ui` consistent; route `/tool-fit review` for Playwright in `e2e-harness` via the `architecture` tag or a note.
- **M11:** the starting commit is now `46257c3` (decisions commit). Use it in the preamble and in every `<start>..HEAD` criterion.
- **M13:** every spec requirement gets explicit acceptance bullets.

**Sceptic review**
- **I1:** pixel shift vs the rotation specs. Seed `pixelShift:false` in the rotation, ui-rotation, status and position specs, or give tolerances; audit every e2e spec that measures stage geometry.
- **I3:** handled by D4.
- **I4 (cache):** handled by D5.
- **I5:** moot after D1.
- **I10:** the first-tap swallow applies only when the controls were hidden, the target is inside `#controls` or the bare stage, no dialog is open, and `pointerType !== 'mouse'`. Add those cases to the e2e criterion.
- **m1:** delete the `::backdrop` claim.
- **m2:** principle 4 is reworded. The token is never in a QR code, export, log, helper response or receipt; it does appear in Plex request URLs by design. The `rotate-plex-token` owner check sends the token as an `-H "X-Plex-Token: …"` header.
- **m3:** hostname-only Host check.
- **m4/m5:** see M7/D15.
- **m6:** resolve the R-PROT-4 vs R-FRM-4 filter contradiction with stepped minute updates.
- **m8:** the pixel-shift glide.

**Sceptic "Missing" items** — add each as a requirement, hazard or doc item, in the phase that fits:
- **M2:** supported tablet topology. An insecure-context http LAN origin has no service worker, install, Cache API or Wake Lock; the spec states this, and the docs say an installed tablet needs https hosting.
- **M3:** the overlay FS loses settings, cache and lockout on reboot. Document "configure, then enable the overlay".
- **M4:** a Pi has no RTC. Defer schedule evaluation until the clock is plausible.
- **M5:** add DST unit cases for the schedule helpers.
- **M6:** OS blanking off, and the Chromium `DeveloperToolsAvailability` policy.
- **M7:** the Chromium package name on both Bookworm (`chromium-browser`) and Trixie (`chromium`), and labwc autostart.
- **M8:** a one-time "What's new in 2.1" toast after the upgrade.
- **M9:** `overscroll-behavior: none` on `html, body`.
- **Sceptic m11:** the token-rotation checklist lists both Authorized Devices removal and a password change with "sign out of connected devices" (verify).

## Unchanged rules from r1
- Every finding ID still appears in the traceability matrix, either delivered by a phase or `deferred (D1)` with its reason.
- Every phase keeps the exact field set: Goal, Findings, Requirements, Mode, Tags, Blocked by, Output, numbered Acceptance criteria runnable from the repo root (or `narrated:`), and Notes/hazards.
- End the plan with the graph, the concurrency sets (Output-disjoint) and the critical path.
- Before handing back, verify by script that the graph has no cycle, that every `Blocked by` name exists, that `release-bump`'s ancestors include `rotate-plex-token`, `real-server-validation` and `real-server-validation-extended`, and that no removed phase name remains anywhere in either document.

## Output (touch nothing else)
- `docs/spec.md`, `docs/integration-plan.md`. Also `Roadmap.md` **only** if you need to fix the deferred-items wording now; normally the docs phase does it later, so leave it alone.
- `.orchestrator/artifacts/planning--handback-builder-r2.md`.
- New questions go to `.orchestrator/questions.md` as `Q<n> — planning r2: …`.

Run `git add docs/spec.md docs/integration-plan.md`. **Do not commit.**

## Handback
Write the same header as r1, with `round: r2`. Under `criteria:`, include one line per finding ID listed above (fixed / moot-by-D1 / not fixed), with the command or section that shows it. Then include:
- the finding-ID coverage loop from r1, extended with `D1`, counted in the spec;
- your graph-check script output;
- `grep -c '^### [0-9]' docs/integration-plan.md`;
- `grep -nE 'remote-config|multi-poster|frame-per-source|coming-attractions|bulb-animation|frame-rotation|p[0-3]-gate' docs/*.md`, which should return only non-goal/deferred mentions.

If the harness refuses a Write, return the report as text with first line `WRITE-BLOCKED: <path>`.
