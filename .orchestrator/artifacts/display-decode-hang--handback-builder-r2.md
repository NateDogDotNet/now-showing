produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: display-decode-hang · round: r2
status: complete        failure_class: n/a
paths: tests/e2e/display-decode.spec.mjs (staged; js/display.js remains staged from r1, untouched this round)
criteria:
1. npm test — met (pass 160, fail 0)
2. npm run test:e2e -- display-decode (E2E_PORT=20220 E2E_MOCK_PORT=20221) — met, 4 of 4 runs PASS; fails against base js/display.js (press 7 did not draw within 5000 ms, pending decode age 5008)
3. node scripts/check-precache.mjs — met (25 precached files OK)
4. test -z "$(git status --porcelain -- js/main.js index.html css sw.js)" — met (exit 0)
5. narrated — not attempted (reviewer's)
r2 items: (1) object-URL leak assertion — met; fails when the claiming draw's revoke block is deleted (temp copy), passes on real code. (2) drift count printed and asserted <=10% — met; fails when DRIFT_MS forced to 0 (temp copy).
deviations: none. Drift is measured per consecutive-keydown gap (in-page Date.now() in a capturing keydown listener) against crossfadeMs+200; the old `late` counter was removed.
questions: none

Agent: display-decode-hang-builder-r2 · dispatched: 2026-10-10T13:17:49Z

## What changed (tests/e2e/display-decode.spec.mjs only)
- instrument() now wraps URL.createObjectURL/revokeObjectURL (live Set, created/revoked counts) and records keydown 'r' timestamps.
- End-of-case assertions: every live object URL is one a .poster-layer still shows (so nothing unrevoked beyond the two layers); created > PRESSES (probe saw the URLs); 60 keydowns recorded; drifted gaps (|gap - (crossfadeMs+200)| > 50 ms) <= 10% of 59 gaps, else fail with a "machine too slow" message. The drift count is printed on the ok line.

## Spec runs (real output tails)
run 1: ok crossfadeMs 0: 60 presses, 62 decodes, 61 object URLs (1 live), 2/59 presses drifted over 50 ms from 200 ms
       ok crossfadeMs 1200: ... 61 object URLs (1 live), 2/59 presses drifted over 50 ms from 1400 ms · PASS display-decode
runs 2-4: 0/59 drifted for both cases, 1 live, PASS display-decode each

## Mutations (in mktemp -d copy /tmp/tmp.32yDABASK6, live tree untouched)
- delete `if (stale) { URL.revokeObjectURL(stale); objectUrls.delete(next); }` from js/display.js: FAIL display-decode (deepStrictEqual on the leaked blob: URL list, expected []).
- DRIFT_MS=0 in the spec copy: FAIL display-decode (ERR_ASSERTION, drift assertion).
- base js/display.js (9bce60c): FAIL — `crossfadeMs 0: press 7 did not draw within 5000 ms (draws 7, active layer 1, pending decode ages [5008])`.

## Lint
npx eslint -c .../round--eslint-r1e.config.mjs tests/e2e/display-decode.spec.mjs → exit 0, no output.

git status --short (worktree): `M  js/display.js`, `A  tests/e2e/display-decode.spec.mjs`.
