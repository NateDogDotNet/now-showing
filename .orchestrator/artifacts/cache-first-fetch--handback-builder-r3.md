produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: low · phase: cache-first-fetch · round: r3
status: complete        failure_class: n/a
paths: js/poster-cache.js, tests/poster-cache.test.js (both staged in /home/user/wt-cache-first-fetch; r2 files remain staged)
criteria: 1 met (node --test tests/poster-cache.test.js: 17 pass/0 fail); 2 met (npm test: 84 pass/0 fail); 3 met (E2E_PORT=18710 E2E_MOCK_PORT=18711 npm run test:e2e: PASS cache-first, PASS smoke); 4 met (git status --porcelain -- index.html css sw.js: empty). N1 met, N2 met.
deviations: none. Added one small test (default limit 100 with no limit given, 40 puts keep 40) to cover N2; also added -5 and '  ' to the bad list.
questions: none

Agent: cache-first-fetch-builder-r3 · dispatched: 2026-10-08T23:50:47Z

N1: maxEntries accepts only typeof number, or a non-blank string, then requires finite and >= 1; otherwise DEFAULT_LIMIT.
N2: DEFAULT_LIMIT hoisted to module scope; signature is limit = DEFAULT_LIMIT.

Before the fix (the new bad list added to the test, guard unchanged):
not ok 9 - a non-numeric or non-finite limit falls back to 100 instead of emptying the cache
    limit null
# pass 15  # fail 1
(The loop stops at the first failing value, null; '', false, [], 0 are the same Number()==0 path the review probed.)

After the fix: node --test: pass 17 fail 0; npm test: pass 84 fail 0; e2e: PASS cache-first, PASS smoke.
