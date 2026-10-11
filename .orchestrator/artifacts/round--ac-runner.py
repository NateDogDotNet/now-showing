#!/usr/bin/env python3
"""Run a phase's acceptance criteria exactly as docs/integration-plan.md states them.

usage: round--ac-runner.py <phase> <round-label> <worktree> [--plan <plan path>] [--dry]

Extracts each numbered criterion's first backticked command from the phase's section,
runs it through evidence.py exec (so the exit code is authoritative) with the worktree as
cwd, and writes .orchestrator/artifacts/<phase>--ac<N>-<round-label>.json. Narrated
criteria are listed, not run. Prints a summary table. Append-only: never edit this file
after it has run; write a new version instead.
"""
import json, os, re, subprocess, sys

ART = os.path.dirname(os.path.abspath(__file__))
EVID = os.path.expanduser('~/.claude/scripts/cc_utils/evidence.py')


def criteria(plan_text, phase):
    secs = re.split(r'\n(?=### \d+\. `)', plan_text)
    sec = next((s for s in secs if re.match(r'### \d+\. `%s`' % re.escape(phase), s)), None)
    if sec is None:
        sys.exit(f'phase {phase} not found')
    body = sec.split('**Acceptance criteria:**', 1)[1].split('- **Notes/hazards:**', 1)[0]
    out = []
    for m in re.finditer(r'^\s{2}(\d+)\. (.*)$', body, re.M):
        n, rest = int(m.group(1)), m.group(2)
        if rest.startswith('narrated:'):
            out.append((n, None, rest))
            continue
        c = re.match(r'`((?:[^`]|``)+)`', rest)
        out.append((n, c.group(1) if c else None, rest))
    return out


def main():
    phase, label, wt = sys.argv[1:4]
    plan = sys.argv[sys.argv.index('--plan') + 1] if '--plan' in sys.argv else os.path.join(wt, 'docs/integration-plan.md')
    dry = '--dry' in sys.argv
    rows = []
    for n, cmd, text in criteria(open(plan).read(), phase):
        if cmd is None:
            rows.append((n, 'narrated', '—', text[:90]))
            continue
        if dry:
            rows.append((n, 'cmd', '?', cmd[:90]))
            continue
        res = subprocess.run(['python3', EVID, 'exec', '--kind', 'test', '--timeout', '2400', '--shell', cmd],
                             cwd=wt, capture_output=True, text=True,
                             env={**os.environ, 'CI': '1'})
        path = os.path.join(ART, f'{phase}--ac{n}-{label}.json')
        with open(path, 'w') as f:
            f.write(res.stdout)
        try:
            ex = json.loads(res.stdout).get('exit')
        except Exception:
            ex = 'parse-error'
        rows.append((n, 'cmd', ex, cmd[:90]))
    print(f'| # | kind | exit | criterion ({phase}, {label}) |')
    print('|---|---|---|---|')
    for r in rows:
        print('| %s | %s | %s | `%s` |' % (r[0], r[1], r[2], r[3].replace('|', '\\|')))


if __name__ == '__main__':
    main()
