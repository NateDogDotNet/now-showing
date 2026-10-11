produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: planning · round: r2
status: complete        failure_class: n/a
paths: docs/spec.md (revised, staged), docs/integration-plan.md (revised, staged), .orchestrator/questions.md (Q19-Q23 appended; git-ignored), .orchestrator/artifacts/planning--handback-builder-r2.md (this file; git-ignored)
criteria:
- D1 lean plan (about 22-26 phases): met — 27 phases (26 on the release path + optional `purge-git-history`); the eight listed phases removed; U6, U7 multi-poster part, U8, E3, E5 are spec non-goals `deferred (D1)` with reasons and the `docs` phase adds the Roadmap entries (criterion 6 of `docs`)
- Merges: met — four gates removed (checks moved to the closing phase of each milestone + `release-bump`); `rotation-layout-and-shell`; `settings-sheet` (connection card + libraries + time/advanced + actionable errors + D3 first run); `metadata-and-now-playing`; `docs`; `device-helper-server`/`device-helper-integration` kept separate
- D3 auto PIN flow: met — R-FIRST-1, phase `settings-sheet` criterion 4 (`first-run` spec); LAN discovery Roadmap-only
- D4 sleep: met — R-PROT-1 (black veil, wake lock HELD, wakeOnPlayback true, idle sleep 0, README OS blanking off); `sleep-mode` criterion 3
- D5 content limit: met — R-FILT-1 (random + cache index `contentRating` + now-playing with `limitNowPlaying`, pinned exempt, country table, unrated excluded, "household with children" toggle outside the preset); `content-rating-filter` Output includes `js/poster-cache.js`
- D6 protection defaults: met — settings table (cache-first, pixel shift with 1.5 s glide, status dot on; night dim incl. `nightDimTarget` stage, sleep off); R-PROT-3 guarded daily reload (controller + no-store probe, tablet-fullscreen note); `pi-stability` criterion 2
- D8 helper: met — R-HELP-1 power (cec-ctl, cec-client, wlr-randr with env passthrough) + temperature only, brightness dropped (`device-helper-server` criteria 1 and 5)
- D9 serve allowlist + hostname-only Host check: met — R-SEC-1, `serve-config-guard` criterion 1
- D10 kiosk recovery: met — key-hold (Enter 3 s) reveal + loopback `config.json` `resetPin`, `kiosk-and-pin` criterion 3 (Q21 records the one-shot question)
- D11 release gate: met — `release-bump` Blocked by `rotate-plex-token`, `real-server-validation`, `real-server-validation-extended`; criteria 2-3 require `Rotated: yes` and `Overall: PASS` in both files; validation phases accept only PASS (criterion 2 of each); optional phases never block
- D12 worktrees: met — convention 3 (separate worktrees, own E2E_PORT/E2E_MOCK_PORT, scope probes via `git status --porcelain`)
- D13 no publish tag: met — tag table, convention 13, `release-bump` note
- D14 purge: met — `purge-git-history` optional irreversible hitl, skipped unless public/shared, blocked by `release-bump` (leaf), criterion 1 runs against a fresh clone of origin
- D15 Playwright devDependency + lockfile: met — `e2e-harness` criteria 6 and 7, `package-lock.json` mandatory Output
- D16 Q6 rationale + PIN deterrence copy: met — spec R-REL-1, plan convention 5, `release-bump` notes; `kiosk-and-pin` criterion 6 greps `deterrent` in the UI
- Anchored I1/I5/I11-D11 (release-path gates): fixed — see D11 line; ancestors check below
- Anchored I2 (no optional asset on critical path): moot-by-D1, verified — critical path below has no optional/deferred phase
- Anchored I3 (concurrency vs scope probes): fixed — convention 3 and every scope probe uses `git status --porcelain`
- Anchored I4 (fill needs pi-stability): fixed — `fill-blur-and-info` Blocked by `pi-stability`
- Anchored I6 (remote QR criterion): moot-by-D1
- Anchored I7 (right-sizing): fixed — 44 -> 27
- Anchored M1-M10: M1/M2/M3/M6-remote parts moot-by-D1 (no frame-per-source, remote phases); M4 fixed (guarded negative greps, `test -f F && ! grep`, plus `test -f` guards on every `node --test` list because node silently skips a missing path next to an existing one); M5 fixed (`rotate-plex-token` criterion 4, no hyphenated-word false positive); M6 fixed (`purge-git-history` criterion 1, fresh clone); M7 fixed (`check-precache` recursive, `e2e-harness` criterion 4 proves it); M8 fixed (`release-bump` criteria 1-7, stale-cache seeding, mandatory lockfile); M9 fixed (criteria hold under the ruled options); M10 fixed (risk:high dropped from rotate-plex-token and the rotation phase, added to content-rating-filter; `ui` consistent; `architecture` tag on `e2e-harness` routes /tool-fit review)
- Anchored M11 (start commit): fixed — `46257c3` in the preamble and every `<start>..HEAD` range
- Anchored M13 (acceptance bullets): fixed — every R-* requirement in the spec has explicit acceptance bullets
- Sceptic I1 (pixel shift vs rotation specs): fixed — convention 7, harness default `pixelShift:false` (`e2e-harness` criterion 8), each geometry spec names the seed (criteria in `rotation-layout-and-shell` 3, `status-indicator` 2, `settings-sheet` 5, `metadata-and-now-playing` 5, `position-drag-nudge` 3, `fill-blur-and-info` 4), and `pixel-shift` criterion 4 runs the whole suite
- Sceptic I3/I4 (cache): fixed — D4 and D5 (see above)
- Sceptic I5: moot-by-D1 (bulbs)
- Sceptic I10 (first-tap swallow): fixed — R-CTRL-2 conditions; `touch-and-labels` criterion 3 includes the no-swallow cases
- Sceptic m1 (::backdrop claim): fixed — claim deleted (`rotation-layout-and-shell` notes)
- Sceptic m2 (principle 4 / header check): fixed — spec principle 4 reworded; `rotate-plex-token` criterion 5 sends the token as a header from a file descriptor
- Sceptic m3 (hostname-only Host check): fixed — R-SEC-1, R-HELP-1, `serve-config-guard` criterion 1
- Sceptic m4/m5: fixed — see M7 and D15
- Sceptic m6 (filter contradiction): fixed — R-FRM-4/R-PROT-4: stepped minute updates, 10-minute ramps, no filter transition (`frame-brightness` criteria 1, 3, 5)
- Sceptic m8 (pixel shift glide): fixed — R-PROT-2, `pixel-shift` criterion 3
- Sceptic Missing M2 (topology): fixed — R-TOPO-1 + R-DOC-9; M3 (overlay FS): fixed — R-DOC-2; M4 (no RTC): fixed — R-PROT-6 (`isPlausibleClock`, Q23); M5 (DST): fixed — `settings-and-schedule-core` criterion 3; M6 (OS blanking, DeveloperToolsAvailability): fixed — R-DOC-8; M7 (package names, labwc): fixed — R-DOC-8; M8 (what's new toast): fixed — R-UPG-1 in `recommended-protection-preset`; M9 (overscroll-behavior): fixed — R-PROT-4, `pi-stability` criterion 2
- Sceptic m11 (rotation routes): fixed — R-SEC-2 and `rotate-plex-token` checklist list Authorized Devices removal and password change with "Sign out of connected devices", (verify)
- Unchanged r1 rules: met — every finding ID in the spec and the plan (loop below); fixed field set on every phase (the generator asserts it); graph, concurrency sets and critical path at the end of the plan
- Roadmap.md: not modified (the `docs` phase does it)
- Code, docs/decisions.md: not modified
deviations: (1) r1 criterion "with `R` TV-MA stays hidden" was wrong under the ladder (R and TV-MA share a rung); r2 says TV-MA appears under `R`. (2) The night-dim "eased over 60 s" of r1 cannot be reconciled with stepped minute updates, so r2 uses a 10-minute ramp in whole-minute steps (R-FRM-4). (3) The anchored review's example that mock titles would be added was avoided: the mock keeps exactly 8 titles so the cache-first "8 posters" criterion stays valid; ratings are assigned to the existing 8. (4) The plan was rendered from three part files plus a generator kept in the scratchpad (not in the repo) so `Blocked by`, the graph, waves, concurrency sets, critical path and coverage table agree by construction. (5) The brief's "~/.claude/agents/orchestrator-builder.md" read fine; the builder rules were followed as given.
questions: Q19, Q20, Q21, Q22, Q23

Agent: planning-builder-r2 · dispatched: 2026-10-08T21:02:30Z

## Commands run (output tails)

### Finding-ID coverage loop (spec count / plan count; D1 added)
```
F1 spec=2 plan=4
F2 spec=2 plan=4
F3 spec=3 plan=4
F4 spec=2 plan=4
F5 spec=2 plan=4
S1 spec=3 plan=3
V1 spec=5 plan=7
U1 spec=2 plan=3
U2 spec=2 plan=3
U3 spec=2 plan=3
U4 spec=2 plan=3
U5 spec=2 plan=2
U6 spec=2 plan=1
U7 spec=4 plan=4
U8 spec=2 plan=1
U9 spec=2 plan=4
U10 spec=2 plan=3
U11 spec=2 plan=3
U12 spec=2 plan=3
U13 spec=2 plan=2
U14 spec=2 plan=3
E1 spec=2 plan=4
E2 spec=2 plan=3
E3 spec=2 plan=1
E4 spec=2 plan=4
E5 spec=2 plan=1
E6 spec=4 plan=3
E7 spec=2 plan=2
E8 spec=3 plan=3
E9 spec=3 plan=4
E10 spec=2 plan=3
E11 spec=2 plan=2
E12 spec=2 plan=3
E13 spec=2 plan=2
E14 spec=2 plan=3
E15 spec=2 plan=2
E16 spec=2 plan=2
E17 spec=2 plan=2
D1 spec=21 plan=18
```
Lines containing spec=0 or plan=0: 0

### Graph-check script output (parses the final plan file)
```
phases: 27 table rows: 27
Blocked-by lines match dependency table: True
unknown Blocked-by names: []
acyclic (Kahn): True
release-bump ancestors include: {'rotate-plex-token': True, 'real-server-validation': True, 'real-server-validation-extended': True}
not ancestors of release-bump: ['purge-git-history']
```
Generator assertions (also run): unique kebab-case names, topological file order, every blocker exists and precedes its dependent, every phase has Goal/Findings/Mode/Output/Acceptance criteria/Notes and at least 2 criteria, every finding ID delivered by a phase or deferred. Critical path (excludes the optional leaf): `e2e-harness` -> `settings-and-schedule-core` -> `rotation-layout-and-shell` -> `kiosk-and-pin` -> `touch-and-labels` -> `position-drag-nudge` -> `docs` -> `release-bump` (8 phases).

### `grep -c '^### [0-9]' docs/integration-plan.md`
```
27
```

### grep -nE 'remote-config|multi-poster|frame-per-source|coming-attractions|bulb-animation|frame-rotation|p[0-3]-gate' docs/*.md
```
docs/decisions.md:7:- **D1 Plan size: lean.** Defer to `Roadmap.md` with reasons: phone remote config (U6), multi-poster landscape layout (part of U7), frame-per-source a
docs/integration-plan.md:579:  - Roadmap: extend "Remote control" with D7's constraints; add entries for multi-poster landscape layout, frame per poster source with "Comi
docs/integration-plan.md:725:| U7 | `fill-blur-and-info` ; multi-poster part deferred (D1) → Roadmap |
docs/spec.md:271:**R-DOC-7 (P2) Feature docs and Roadmap.** README feature table, shortcut table (including the `?` overlay), project layout (every `js/*.js` and `scripts
docs/spec.md:293:| Multi-poster landscape layout (2-3 posters side by side) | U7 multi-poster part (was R-FILL-2) | Refactor of `display.js` that assumes one stage; light
docs/spec.md:407:| U7 | R-FILL-1; multi-poster part dropped | `fill-blur-and-info`; multi-poster part deferred (D1) |
```
All hits are non-goal/deferred mentions (the plan's Roadmap note and finding-coverage row, the spec's R-DOC-7 and deferred table and traceability row) or the owner's own `docs/decisions.md` D1 text. None of the 21 removed or renamed phase names (including `p0-gate`..`p3-gate`, `layout-rotation-fix`, `ui-rotation-shell`, `actionable-errors`, `metadata-overlay`, `now-playing-extras`, `docs-hardening`, `docs-features`) appears in either document (scripted check printed nothing).

### Other checks
- Every criterion command (152) passes `bash -n`; all non-network, non-e2e commands were executed in a throwaway worktree of HEAD with no JS SyntaxError/TypeError/ReferenceError (expected exit 1 where the feature does not exist yet).
- `npm test` on the unchanged tree: tests 29, pass 29, fail 0.
- `git status --short`: `M  docs/integration-plan.md`, `M  docs/spec.md` (staged, not committed).
- Spec traceability matrix and Open questions updated: Q1-Q18 recorded as ruled with their D-entries; Q19-Q23 are new proposals.
