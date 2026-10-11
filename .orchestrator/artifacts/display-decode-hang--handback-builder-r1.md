produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: display-decode-hang · round: r1
status: complete        failure_class: n/a
paths: js/display.js, tests/e2e/display-decode.spec.mjs (both staged with git add, not committed)
criteria:
1. npm test — met (`npm test`: 160 pass, 0 fail)
2. npm run test:e2e -- display-decode — met (E2E_PORT=20220 E2E_MOCK_PORT=20221; PASS in 5 consecutive runs after the fix; FAIL in 3 of 3 runs against base js/display.js)
3. node scripts/check-precache.mjs — met ("25 precached files OK")
4. test -z "$(git status --porcelain -- js/main.js index.html css sw.js)" — met (exit 0)
5. narrated: reviewer stall attempts — not attempted (reviewer's job). Crossfade unchanged: only cleanup-timer guard and a bounded decode were added; no CSS/class/timing change.
deviations: none. One addition beyond the bare guard: a draw that claims a layer now revokes that layer's stale object URL at once (otherwise the skipped timer would leak it).
questions: none

Agent: display-decode-hang-builder-r1 · dispatched: 2026-10-10T12:48:44Z

## Fix (js/display.js)
- `owners` WeakMap + `drawSeq` counter: each `show()` stamps the layer it draws on (`next`). The cleanup timer captures the owner stamp of `prev` when scheduled and only revokes/removes src if `owners.get(prev) === owner` and the layer is not active.
- A draw that claims a layer revokes the layer's stale object URL before setting `src` (the earlier timer will skip it).
- `decodeWithin(img, 20000)`: `Promise.race` of `img.decode()` and a 20 s timer (same bound main.js puts on a poster download); a decode that cannot settle rejects, so show() throws the existing "Poster image could not be decoded." and tick() handles it. loadFrame's decode is untouched.

## Spec (tests/e2e/display-decode.spec.mjs)
Seeds crossfadeMs 0 then 1200 (rotateSeconds 3600), init script wraps `HTMLImageElement.prototype.decode` (pending map) and a MutationObserver counts draws (a poster layer gaining `.active`). Presses `R` (forced tick) 60 times at exactly crossfadeMs + 200 ms spacing; after each press a draw must complete within 5 s and the active layer index must change; at the end draws == 61, no decode pending, started == settled, active layer keeps its src.

## Commands and output tails
Base js/display.js (spec only, 3 runs, each FAIL):
  AssertionError: crossfadeMs 0: press 6 did not draw within 5000 ms (draws 6, active layer 0, pending decode ages [4999])
  AssertionError: crossfadeMs 0: press 15 did not draw within 5000 ms (draws 15, active layer 1, pending decode ages [5005])
  AssertionError: crossfadeMs 0: press 16 did not draw within 5000 ms (draws 16, active layer 0, pending decode ages [4998])
  FAIL display-decode

After fix (`E2E_PORT=20220 E2E_MOCK_PORT=20221 npm run test:e2e -- display-decode`), 4 runs then a 5th after a cosmetic spec tweak:
  ok  crossfadeMs 0: 60 presses, 62 decodes, 1 late      (x4; the tweak made it "0 late")
  ok  crossfadeMs 1200: 60 presses, 62 decodes, 1 late
  PASS display-decode   (x5)
npm test: tests 160, pass 160, fail 0
node scripts/check-precache.mjs: 25 precached files OK
scope probe (js/main.js index.html css sw.js): exit 0
git status --short: M  js/display.js / A  tests/e2e/display-decode.spec.mjs

Backstop probe (in a mktemp -d copy, not the live tree): guard removed and timeout set to 1000 ms with a tolerant copy of the spec: 55 of 61 draws completed, 0 pending decodes at the end, so the timeout alone keeps rotation going (some presses lost while a stuck decode waited).
Note: the spec takes about 100 s (60 presses at 200 ms plus 60 at 1400 ms); run.mjs allows 180 s per spec.
