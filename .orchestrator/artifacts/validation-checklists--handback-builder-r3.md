produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: low · phase: validation-checklists · round: r3
status: complete        failure_class: n/a
paths: docs/validation/real-server-core.md, docs/validation/real-server-extended.md
criteria:
- I1 (C06 ranking): met. core C06 now says firstReachable tries local https *.plex.direct first, then local http, then remote https, then relay (from plex.js:219 as quoted in the review); Notes choice is local plex.direct / local http / remote plex.direct / relay. I did not re-read plex.js myself.
- m1 (C02 timing): met. "within about 5 s (up to about 10 s per unreachable address)".
- m2 (C11): met. `on` (or `on for <user>`) and the `Poster` row ends `— now-playing`.
- m3 (Setup): met. Added "Move any `config.json` beside `index.html` aside for this run."
- m4 (C16): met. Added "do not touch the screen or mouse for at least 5 s".
- m5 (E07, E05, E09): met. E07 precondition >150 titles and record the count; E05 points to the title's Plex web page or the metadata overlay; E09 "press Change first if the connected card shows".
- Plan 1-6: format and structure checked only, not the plan's verbatim AC commands. Item-format grep: core 17/17, extended 23/23 rows match. `Overall: PENDING` present at core:45 and ext:49. Secrets rule and Result-values lines unchanged.
deviations: The optional E12-E15/E18/E19 phase-routing suggestion in m5 was not applied (review marks it optional). The "an address that works" wording in C06 became "the address it picked" to fit the new expected text.
questions: none

Agent: validation-checklists-builder-r3 · dispatched: 2026-10-08T22:29:18Z

Files are in /home/user/wt-validation-checklists, staged, not committed.

Commands: python3 string replacement (each target asserted unique), git add of the two files, grep format count (17 and 23), git status shows only the two files `A`.
