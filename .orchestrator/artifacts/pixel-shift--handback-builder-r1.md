produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: pixel-shift · round: r1
status: complete        failure_class: n/a
paths: js/layout.js js/display.js css/app.css index.html tests/layout.test.js tests/e2e/pixel-shift.spec.mjs
criteria:
1. met: test -f tests/layout.test.js && node --test tests/layout.test.js (7 pass, 0 fail)
2. met: npm test (235 pass, 0 fail)
3. met: E2E_PORT=22020 E2E_MOCK_PORT=22021 npm run test:e2e -- pixel-shift -> PASS (4 geometry combos x 20 steps, 9 distinct positions each; reduced motion; off x2)
4. met: npm run test:e2e -> every spec PASS, exit 0
5. met: the node -e stageSize margin check, exit 0
6. met: grep -q 'pixelShift' js/display.js && grep -q 'name="pixelShift"' index.html, exit 0
7. met: node scripts/check-precache.mjs -> "26 precached files OK"
deviations: none. RED round: before implementing, layout.test.js failed (shiftOffset not exported) and the e2e spec failed ("1080x1920 rotation 0: >= 9 distinct translate values, saw 1: none").
questions: none

Agent: pixel-shift-builder-r1 · dispatched: 2026-10-10T18:45:14Z

Notes
- layout.js: stageSize gains `margin` (fraction per side); shiftOffset(step, marginPx) walks a fixed 9-point 3x3 cycle (wrap-around also moves).
- display.js: layout() applies margin 0.015 and the individual `translate` only while pixelShift is on (removed when off). The offset bound is the room left on the tighter screen axis, floored. A setInterval of pixelShiftMinutes steps and re-lays out; apply() re-syncs the timer, so a settings save takes effect at once. Decode-timeout/revoke guards untouched.
- css: `.stage` transition is `transform 0.5s ease, translate 1.5s ease-in-out`; the existing reduced-motion block (`transition: none`) covers it.
- index.html: "Display protection" fieldset (pixelShift checkbox, pixelShiftMinutes number), bound by name.
- Spec measures "settled" by finishing running animations under the fake clock, and checks the glide via computed transition-property/duration.
- (verify) Pi's Chromium must support the `translate` property (>= 104); no #shifter fallback built.
- e2e run on E2E_PORT=22020 / E2E_MOCK_PORT=22021. All six files are staged, nothing committed.
