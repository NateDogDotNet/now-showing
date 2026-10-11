# Stop 2 — approve the orchestration policy for docs/integration-plan.md

**Goal line.** Owners of always-on Plex poster displays (Pi kiosk, OLED TV, wall tablet) can set one up without a keyboard and leave it running for years without burn-in, needless hardware wear, exposed credentials or unsuitable posters for the household.

**Floor check.** 27 phases, four human-action phases, one irreversible phase → above the floor; orchestrate.

**Phases by wave** (a wave starts when its blockers are done; phases in a wave run in parallel only when their files don't overlap, each in its own worktree — D12):
1. `e2e-harness`, `serve-config-guard`, `validation-checklists`, `rotate-plex-token` *(you)*
2. `settings-and-schedule-core`, `device-helper-server`
3. `rotation-layout-and-shell`, `cache-first-fetch`, `frame-brightness`, `sleep-mode`
4. `status-indicator`, `pixel-shift`, `content-rating-filter`, `kiosk-and-pin`, `device-helper-integration`, `pi-stability`, `settings-sheet`
5. `real-server-validation` *(you)*, `recommended-protection-preset`, `touch-and-labels`, `metadata-and-now-playing`
6. `position-drag-nudge`, `fill-blur-and-info`, `real-server-validation-extended` *(you)*
7. `docs`
8. `release-bump` — needs the token rotated and both real-server checks at PASS (D11)
9. `purge-git-history` *(optional, you, irreversible)* — skipped unless you say the repo is public (D14)

**Tags and the reviews they trigger.**
- Every phase: my own re-run of every acceptance command, an anchored code review, the pre-commit checks (lint, tests, security grep), commit message read back.
- `risk:high` — `serve-config-guard`, `sleep-mode`, `content-rating-filter`, `kiosk-and-pin`, `device-helper-server`: a second, cold reviewer that sees only the diff.
- `ui` — 14 interface phases: design guidance in the brief, then a simulated-user UX review (`/ux-simulate`) of the result.
- `architecture` — `e2e-harness`: architecture review plus a fit review of Playwright as a new tool.
- `docs` — `validation-checklists`, `docs`: drift check while writing, scored doc review as the evidence.
- `irreversible` — `purge-git-history`: security review, a precondition check, then your explicit approval before anything runs.
- Human-action phases — `rotate-plex-token`, `real-server-validation`, `real-server-validation-extended`, `purge-git-history`: I hand you a checklist and verify the result file; no agent touches them.
- Milestone closers run `/phase-gate`: `real-server-validation` (fix-first), `recommended-protection-preset` (protection), `position-drag-nudge` (polish), `release-bump` (release).

**Roles.**
| Role | Model | Effort |
|---|---|---|
| Conductor (me: verify, score, commit, ask) | this session's model | high |
| Builders | Sonnet | medium; high on `risk:high` |
| Reviewers (anchored and cold) | Opus | medium |
| Research for questions | Haiku | low |
The `orchestrator-*` agent definitions aren't registered as agent types here, so each runs as a general-purpose agent with the same brief and its model pinned per call. Not installed here: the superpowers and frontend-design plugins — their steps run from the brief and my own checks instead.

**Scoring (each phase, out of 100; done only at ≥ 99).** Acceptance criteria pass when I re-run them 35 · diff touches only the phase's files 15 · lint/format/tests/security clean 15 · decision log respected 10 · no open Important review findings 10 · tests proven by a mutation that they catch 10 · commit message matches what landed 5. Below 99: re-dispatch with the named gaps; after 5 re-dispatches on one phase I stop and tell you why.

**What every builder gets.** A saved brief with the phase's criteria verbatim, its file list, hazards and the D-entries it must honour; it stages but never commits, parks questions in `.orchestrator/questions.md`, and writes a report opening with:
```
produced_by · model · effort · phase · round
status: complete|blocked|failed   failure_class
paths: every file touched
criteria: one line per acceptance criterion, with the command run
deviations · questions
```

**Where I will stop and ask you.**
- Each human-action phase (checklist in the message).
- Before `purge-git-history` runs — only if you choose it.
- Batched question rounds when builders or reviews raise product questions.
- A phase that fails 5 re-dispatches, a graph deadlock, or a plan contradiction.

**Rulings I made alone since stop 1** (say if you want any changed): Q19 country-rating table as in the spec · Q20 the protection preset dims the whole picture at night · Q21 the `config.json` PIN reset applies while the flag is present (Diagnostics warns) · Q22 keep the "Playing in <room>" label, off by default · Q23 the schedule waits for a plausible clock (year ≥ 2026) · N8 the server-side rating filter includes mapped country ratings · N9 README covers OS rotation and `hdmi_force_hotplug` · N10 every test server uses a free port.

**Cost estimate.** Planning took 6 agent calls, about 1 agent-hour and 1.4 M tokens. The build is 23 agent-run phases with a builder and 1–2 reviewers each: roughly 10–15 M tokens and 20–30 agent-hours, plus your three checklists.

Reply **"approve"** to start with wave 1 (and `rotate-plex-token`'s checklist), or name what to change.
<!-- end stop 2 -->
