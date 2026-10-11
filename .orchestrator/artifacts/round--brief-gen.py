#!/usr/bin/env python3
"""Generate a builder brief for one phase from docs/integration-plan.md (append-only script).

usage: round--brief-gen.py <phase> <base-sha> <effort> <process-text-file> [<extra-text-file>]

Writes .orchestrator/artifacts/<phase>--brief-r1.md with: worktree and handback paths, the
process text, binding rulings, conventions verbatim, the phase section verbatim and the fixed
handback header (header first, no line above it).
"""
import re, sys

phase, base, effort, proc = sys.argv[1:5]
extra = open(sys.argv[5]).read().strip() if len(sys.argv) > 5 else ''
plan = open('docs/integration-plan.md').read()
conv = plan.split('### Conventions every phase follows', 1)[1].split('### Tag assignment', 1)[0]
sec = [s for s in re.split(r'\n(?=### \d+\. `)', plan) if re.match(rf'### \d+\. `{re.escape(phase)}`', s)][0]
sec = sec.split('\n## ', 1)[0]
b = f"""# Brief — {phase} r1

Agent name: {phase}-builder-r1 · phase: {phase} · round: r1 · effort: {effort}

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-{phase}` (branch `orch/{phase}` from `{base}`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/{phase}--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — {phase} r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
{open(proc).read().strip()}

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
{extra}

## Conventions every phase follows (verbatim from the plan)
{conv.strip()}

## The phase (verbatim from the plan)
{sec.strip()}

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: {phase} · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: {phase}-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
"""
open(f'.orchestrator/artifacts/{phase}--brief-r1.md', 'w').write(b)
print(phase, len(b))
