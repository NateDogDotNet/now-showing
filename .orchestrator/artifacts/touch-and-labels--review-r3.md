produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: touch-and-labels · round: r3 · mode: anchored
**Verdict:** APPROVE

Reviewer: touch-and-labels-review-anchored-r3 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T18:13:10Z · Method: anchored delta review · Scope: touch-and-labels, r3, base 6a96b33 (r2 tree), tree d8d9a3d (staged index of /home/user/wt-touch-and-labels; `git write-tree` = d8d9a3da5bae…, the same before and after my run)

## What I read and ran
- Read: `git diff 6a96b33 d8d9a3d` (index.html +9/-1, js/main.js +6/-3, tests/e2e/touch-controls.spec.mjs +78), the r2 review, the phase record (Step 7 triage r2, K58, K59), js/settings-ui.js write()/read() (l.77–113), the CSS label hooks at css/app.css:221–244.
- Scratch copies made with `mktemp -d` and `git checkout-index -a --prefix=` (A = /tmp/tmp.GvKwgdNoto for the full suite, B = /tmp/tmp.oLweS8zgdu for mutations and probes). Playwright 1.56.1 was symlinked from /opt/node-tools. Ports were 24912/24913 (full suite) and 24920–24931 (B). I deleted both copies afterwards. The live worktree was not touched.
- Full e2e in A: `node tests/e2e/run.mjs` gave **exit 0. All 18 specs passed and 103 PASS lines**, smoke included. `ok  clock install + runFor` passed this run, so I saw no K59 failure. Nothing in this delta touches the clock, the engine or smoke.spec. The builder's one-off failure fits the running-fake-clock race recorded as K59 and is not caused by this delta.
- Mutations in B, run with `run.mjs touch-controls`. The baseline passed. After each mutation I restored the file with `checkout-index -f`, and `diff -r` against A showed no difference.
  - M1: dropped `|| target === $('empty')`. FAIL "the first tap did not rotate". The K58 case has teeth.
  - M2: `swallowTapClick && e.detail > 0` changed to `swallowTapClick`. FAIL "timed out waiting for Enter on the focused Settings button". The TLM2 case has teeth.
  - M3: removed `autofocus` from #diag-copy. FAIL "the shortcuts button does not take the initial focus". The TLM4 case has teeth.
  - M4: disabled the `aria-label 'letter O'`. FAIL "with an accessible 'letter O' label". The TLM3 case has teeth.
- Probe spec in B (not in the reviewed tree). Results:
  - Diagnostics first focus: `diag-copy`, `:focus-visible` true, in the viewport, at 1920x1080 and 1280x720. It is the same on reopen.
  - After Esc, focus goes to BODY.
  - Settings (`s`) first focus is the sheet DIV and shortcuts (`?`) first focus is shortcuts-close. Both are unchanged, because the delta adds no focus code anywhere except the one autofocus attribute in the Diagnostics dialog.
  - Control labels "Never" saves: stored `never`, `#controls[data-labels="never"]`, the label is `display:none` on hover. It survives a reload and the select reads `never` after the reload.
  - Empty state (390x844 touch): a touch tap on the empty card's own edge, then a tap on "Open settings", opens Settings. The card is not swallowed.

## Confirmations
- **K58: resolved.** main.js:1115 adds `target === $('empty')`, an identity test on the backdrop only. `.empty-card`, its text and its buttons fail that test and fail `closest('#controls, #stage')`, so they act on the first tap (spec case "Open settings works on the first tap", plus my card-edge probe). The new case shows `elementFromPoint` = `empty` under the hidden Rotate button. The first tap leaves rotation at 0 and the second tap rotates (M1 kills it). The comment at l.1101 cites K58.
- **TLM2: resolved.** The case dispatches an orphan touch `pointerdown` on #stage, then Enter on a focused control. M2 kills it.
- **TLM1: resolved.** index.html adds `<select name="controlLabels">` with auto/always/never. settings-ui.js write()/read() pick it up through the generic `form.elements` loop, and `sanitize` validates it through `oneOf` (settings.js:69). The e2e case covers Always. My probe covers Never and persistence across a reload.
- **TLM3: resolved.** Single-character caps show lower case (`o`), and the O cap carries `aria-label="letter O"`. M4 kills the check. Other caps (`?`, space and named keys) still go through `keyCap` for multi-character keys. A single-character key such as `?` is unchanged by `toLowerCase()`.
- **TLM4: resolved.** `autofocus` on #diag-copy works with `showModal()` (main.js:968). Copy gets the first focus at both sizes and nothing else's first focus changed.
- **Nothing else changed:** the diff touches only the three files above, and the hunks are the ones listed.

### Critical
None.

### Important
None.

### Minor
1. **The closed Control labels select truncates the Auto option** (spec-gap, cosmetic). At both sizes the 369 px select shows "Auto (text on touch screens, tooltip with a mou…" (see the two screenshots below; scrollWidth 367 vs offsetWidth 369 plus padding and the chevron). The setting is still usable, because the full text is in the open list. Fix: shorter option text, for example "Auto (text on touch, tooltip with mouse)", with the explanation as a hint line. The plan names no wording, so this is not a code-bug.
2. **"Never" is terse next to the other two options** (spec-gap, wording). With `never`, hover shows no label and no tooltip, because K56 removed the native titles. A user may expect "Never" to mean "never show text but keep the tooltip". Consider "Never (icons only)". Behaviour follows R-CTRL-1 as built and is out of this delta's scope to change.

## UI screenshots
- `/home/user/plex-poster-app/.orchestrator/artifacts/touch-and-labels--shot-1920x1080-labels-select-r3.png`: Settings, Display section. "Control labels" sits between Rotation and the checkboxes and is focused (gold ring). It is aligned with the other selects and nothing overlaps. The Auto text is truncated (Minor 1).
- `/home/user/plex-poster-app/.orchestrator/artifacts/touch-and-labels--shot-1280x720-labels-select-r3.png`: the same at 1280x720. The select is fully visible above the Save/Cancel footer, with the same truncation.

UI screenshots: PASS

## Declined to judge
- The K59 smoke.spec clock race: it is routed to recommended-protection-preset, did not reproduce here, and smoke.spec is outside this phase's Output.
- Settings first focus landing on the sheet DIV: this is behaviour from before this delta and out of scope.

## Recommendations
Optionally shorten the Auto/Never option wording (Minors 1–2) in the docs/settings phase. Neither blocks this phase.

## Assessment
Every r2 finding the conductor routed to r3 is fixed. Each fix has a test, and each test fails under its mutation. The full suite is green. The two remaining items are wording polish.

**Verdict:** APPROVE
