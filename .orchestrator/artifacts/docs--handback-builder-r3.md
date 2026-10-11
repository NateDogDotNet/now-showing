produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: docs · round: r3
status: complete        failure_class: n/a
paths: README.md, Roadmap.md (in /home/user/wt-docs, staged, not committed)
criteria:
  1 met (loop of 31 keys, no "missing" printed)
  2 met (grep -Eqi 'not (yet )?verified|unverified' README.md)
  3 met (relative-link node check, exit 0)
  4 met (js/*.js scripts/*.mjs loop, no "undocumented" printed)
  5 met (key loop plus 'shortcuts overlay')
  6 met (Roadmap loop, PIN-locked, negative sed|grep)
  7 met (git status --porcelain scope probe empty)
  git diff --cached --check: clean (exit 0)
  8 narrated: not attempted by builder
deviations: none
questions: none

Agent: docs-builder-r3 · dispatched: 2026-10-11T21:01:49Z

Changes this round
1. DOI1: README "A revealed token hides itself after 15 seconds in kiosk mode." replaced with "The token hides again when Settings closes." Checked the rest of the README for the same mistake. The only other "15 seconds" is the controls staying up after a corner or Enter hold (l.309), which is correct.
2. DOM1: daily-reload bullet (~l.192) now says waking by a key or touch does not trigger the 12-hour reload. It also says the reload waits while a poster loads, while the TV is waking, during a manual wake, mid-fade, and while Settings or Diagnostics is open. This matches reloadMustWait in js/main.js (l.422) and the wake rule at l.588.
3. DOM2-4: tagged (verify): the DeveloperToolsAvailability value 2 (l.~298), "installed PWAs and --kiosk Chromium are unaffected" (l.~256), and systemd KillMode=control-group ending a running command (l.~393, reworded to "should also end").
4. DOM5: "(K61)" removed from Roadmap.md l.19. grep -c K61 gives 0 in both files.
5. DOM6: the long sentences at README l.9, ~192 and ~393 are split into short ones.

Command tails
c1..c7 each printed "ok"/"done" with no "missing"/"undocumented"/"roadmap missing" lines.
git diff --cached --check: no output, exit 0.
git status --short: "M  README.md", "M  Roadmap.md".
