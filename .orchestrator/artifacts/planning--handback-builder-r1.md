produced_by: general-purpose (orchestrator-builder brief) · model: claude-sonnet-5-5 · effort: medium · phase: planning · round: r1
status: complete        failure_class: n/a
paths: docs/spec.md (created, staged), docs/integration-plan.md (created, staged), .orchestrator/questions.md (created, Q1-Q13 appended; git-ignored), .orchestrator/artifacts/planning--handback-builder-r1.md (this file; git-ignored)
criteria:
- docs/spec.md exists with sections in the required order (Goal, Personas & use cases, Principles, Requirements, Non-goals, Settings model changes, Security & privacy, Open questions, Traceability matrix): met — `grep -n '^## ' docs/spec.md`
- Every requirement has an ID R-<area>-<n>, finding IDs, priority and testable acceptance statements; (verify) items listed for V1: met — see "(verify) list carried into V1" in the spec
- Every finding ID appears in spec and plan: met — loop output below, no zero counts
- Traceability matrix lists F1-F5, S1, V1, U1-U14, E1-E17 -> requirement IDs -> plan phase names, and every phase name used in the spec exists in the plan: met — scripted cross-check, only false positive was `backdrop-filter`
- docs/integration-plan.md has preamble (repo root, starting commit 3a7b688, `npm run demo`, `npm test`): met
- Phases are named (kebab-case), with Goal / Findings+Requirements / Mode+Tags+Blocked by / Output / Acceptance criteria / Notes-hazards on each: met — 44 phases, generated from one table so the fields cannot drift
- Acceptance criteria are shell commands (exit 0) or marked `narrated:`; browser criteria rely on a committed e2e harness phase: met — phase 1 `e2e-harness` adds `npm run test:e2e`; later UI phases add their own specs
- hitl phases for S1 and V1 with checklist and proof artifact; history purge only as an optional irreversible phase: met — `rotate-plex-token`, `real-server-validation`, `real-server-validation-extended`, `purge-git-history`
- Four milestones matching P0-P3, each ending in a gate phase: met — M1-M4, `p0-gate`..`p3-gate`
- Docs phase (tag docs) for E7, E8, E11, E13, E15, E17: met — `docs-hardening`
- VERSION bump decision stated: met — single `release-bump` phase (Q6)
- Ends with dependency graph and concurrency list: met — computed from the Blocked-by edges; acyclic and in topological order (the generator asserts it)
- mock-plex.mjs extensions placed in the phases that need them: met
- No code modified: met — `git status --short` shows only `docs/` (new, staged); nothing committed
- Ambiguities parked: met — Q1-Q13
deviations: (1) Added phases the brief did not name but the criteria need: `e2e-harness`, `settings-and-schedule-core` (all new settings keys and pure schedule helpers in one phase so later phases never edit the schema), `validation-checklists`, `recommended-protection-preset`, `device-helper-server`/`device-helper-integration`, `remote-config-server`/`remote-config-ui`, `coming-attractions-*` (3), `fill-blur-and-info`/`multi-poster-layout`. (2) V1 is split into a P0 core validation and a P3 extended one because contentRating/totalSize/viewOffset checks cannot run before those features exist (Q13). (3) The plan file was rendered from a Python table kept in the scratchpad, not in the repo, so `Blocked by`, the graph and concurrency lists agree by construction; only the two documents are in the repo. (4) Concurrency groups are computed from Output-path overlap as well as Blocked-by, and the plan states that overlap is a scheduling constraint, not a dependency. (5) E4 uses CSS `filter: brightness()` on the static frame image as the brief says, with animated/backdrop filters banned.
questions: Q1, Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q10, Q11, Q12, Q13

Agent: planning-builder-r1 · dispatched: 2026-10-08T20:28:12Z

## Commands run (output tails)

### Finding-ID coverage loop (from the brief)
```
F1 spec=2 plan=4
F2 spec=3 plan=5
F3 spec=3 plan=5
F4 spec=2 plan=4
F5 spec=2 plan=5
S1 spec=4 plan=4
V1 spec=5 plan=11
U1 spec=2 plan=3
U2 spec=2 plan=3
U3 spec=2 plan=3
U4 spec=2 plan=3
U5 spec=2 plan=3
U6 spec=3 plan=4
U7 spec=4 plan=5
U8 spec=3 plan=6
U9 spec=2 plan=4
U10 spec=2 plan=4
U11 spec=2 plan=4
U12 spec=2 plan=4
U13 spec=2 plan=3
U14 spec=2 plan=3
E1 spec=3 plan=5
E2 spec=2 plan=3
E3 spec=2 plan=3
E4 spec=2 plan=5
E5 spec=2 plan=4
E6 spec=2 plan=4
E7 spec=2 plan=3
E8 spec=3 plan=4
E9 spec=3 plan=6
E10 spec=2 plan=4
E11 spec=2 plan=3
E12 spec=2 plan=4
E13 spec=2 plan=3
E14 spec=3 plan=5
E15 spec=2 plan=3
E16 spec=2 plan=3
E17 spec=2 plan=3
```
Lines containing `spec=0` or `plan=0`: 0

### Repository state
```
A  docs/integration-plan.md
A  docs/spec.md
--- staged
 docs/integration-plan.md | 988 +++++++++++++++++++++++++++++++++++++++++++++++
 docs/spec.md             | 320 +++++++++++++++
 2 files changed, 1308 insertions(+)
--- unit tests (unchanged tree)
# tests 29
# pass 29
# fail 0
```

### Sanity probes of criteria that can run today
- README relative-link checker used by `docs-hardening`: `links ok`
- `file assets/frames/marquee.png | grep -q '1080 x 1688, 8-bit/color RGBA'` (pattern used by `coming-attractions-artwork`): matches
- `stageSize({viewportW:1920,viewportH:1080,aspect:0.64})` = 691x1080, so the 0.015 margin probe in `pixel-shift` (97% of height, above 95%) is satisfiable.
- Generator assertions: unique kebab-case names, every blocker exists and precedes its dependent, every finding ID delivered by a non-gate, non-enabler phase.

### Notes for the conductor
- Rulings needed before dispatch: Q5 (`e2e-harness`) is the first one; Q10 before `settings-and-schedule-core`; Q1 before `ui-rotation-shell`.
- Environment facts used: Playwright 1.56.1 exists only as a global install (`/opt/node22/lib/node_modules/playwright`), a bare ESM `import 'playwright'` does not resolve it; browsers at `/opt/pw-browsers` (chromium-1194). `.orchestrator/` is git-ignored, so `questions.md` and this report are not staged.
- Facts that could not be verified here and are marked (verify): Plex `contentRating` filter parameter, `totalSize` with container size 0, `viewOffset`/`duration`/`Player.title`, "sign out of all devices" rotating the token, plex.tv `/api/v2/user` 401 for a revoked token, Chromium flag names, CEC/vcgencmd/wlr-randr/ddcutil commands, `translate` property support on the Pi's Chromium.
