produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: low · phase: settings-and-schedule-core · round: r2
status: complete        failure_class: n/a
paths: js/settings.js, js/schedule.js, tests/settings.test.js, tests/schedule.test.js, sw.js (all staged in /home/user/wt-settings-and-schedule-core, not committed; js/schedule.js and sw.js unchanged since r1)
criteria:
item 1 (fall-back test, one local date, found assertion) met: tests/schedule.test.js now scans [midnight, next midnight) of each transition day, requires both hits on one local date, and asserts a fall-back (and spring-forward) day exists whenever the zone has DST in 2026. Mutant later-repeat now fails (# fail 1) under America/New_York, Europe/London and Australia/Sydney. TZ=Australia/Sydney 14/0, TZ=UTC 14/0 (t.diagnostic says no DST day). Also 14/0 in Lord_Howe, Havana, Santiago, Chatham, Kolkata.
item 2 (cross-midnight start boundary) met: added inWindow(at(22,0),'22:00','07:00')===true; end 07:00 false was already asserted. Mutant `m > s || m < e` fails (# fail 1) in NY, London and Sydney.
item 3 (K3 strict numeric sanitiser) met: strictNum(min,max,{int}) in js/settings.js for posterCacheLimit, idleSleepHours, pixelShiftMinutes (int) and frameBrightness, nightDimLevel (no rounding). Non-numbers, booleans, arrays, objects, blank/whitespace strings, NaN, +/-Infinity give the default; numeric strings ("50") are accepted; finite out-of-range numbers clamp. Existing 2.0 keys keep num (test asserts rotateSeconds 1 -> 10). Clamping test rewritten.
plan 1 met: node --test tests/settings.test.js tests/schedule.test.js -> pass 34 fail 0
plan 2 met: npm test -> pass 67 fail 0
plan 3 met: TZ=America/New_York then TZ=Europe/London node --test tests/schedule.test.js -> exit 0 (each 14 pass 0 fail)
plan 4 met: node scripts/check-precache.mjs -> "24 precached files OK", exit 0
plan 5 met: exit 0
plan 6 met: exit 0
plan 7 met: exit 0
plan 8 met: exit 0
plan 9 met: exit 0
plan 10 met: exit 0
deviations: spring-forward test generalised too (reviewer's optional suggestion) so it is not vacuous in London; test-only. Numeric strings accepted by strictNum (settings-ui stores el.value strings); blank strings are not.
questions: none

Agent: settings-and-schedule-core-builder-r2 · dispatched: 2026-10-08T23:01:18Z

Notes: mutations were run in a mktemp -d copy; the worktree schedule.js is untouched. git status --short shows A js/schedule.js, M js/settings.js, M sw.js, A tests/schedule.test.js, M tests/settings.test.js.
