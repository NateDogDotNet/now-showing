# Brief — planning r3: close the r2 confirmation findings

You are the builder for **re-dispatch r3** of the `planning` phase. Revise `docs/spec.md` and `docs/integration-plan.md` (HEAD `c817080`) in place to close every finding in `.orchestrator/artifacts/planning--review-confirm-r2.md` (section "New issues"), apply the conductor rulings at the end of `.orchestrator/questions.md` ("Conductor-alone rulings"), and change nothing else. `docs/decisions.md` D1–D16 stay binding.

Fix exactly:
- **N1** — `pi-stability`: add `sw.js` to Output; the service worker sends `request.cache === 'no-store'` requests to the network (or a dedicated probe path bypasses the cache); the e2e scenario makes the **app server** unreachable at 04:00 (stop `serve.mjs` or abort the probe via route/offline emulation that also covers SW fetches), never `mock.down()`. Update spec R-PROT-3 wording to match.
- **N2** — move the first-run code row and its `'first-run code'` keyword from `real-server-core.md` to `real-server-extended.md`; edit R-VAL-1/R-VAL-2 and the `rotate-plex-token` checklist note accordingly.
- **N3** — reword the serve.mjs comment requirement to "proxy headers are never consulted" or narrow the grep to code (`req.headers\[['"](x-)?forwarded`), so the criterion and the Notes agree.
- **N4** — token regex `{20,}`.
- **N5** — `kiosk-and-pin` and `touch-and-labels` e2e lists: at rotation 90 the new dialog's computed angle is 90 and its box is inside the viewport.
- **N6** — `e2e-harness` #5 gains one smoke assertion per harness option later phases rely on (`serveArgs` incl. how a second server is spawned per spec, `serviceWorkers` opt-in, `clock`, `hasTouch`, `localStorage` seeding); `device-helper-server` #1 specifies a fake-mode-only `GET /__helper/calls` (or the helper e2e asserts the page's request bodies instead — pick one and make both phases agree).
- **N7** — spec and plan both say `config.json` is intercepted by `context.route` in the kiosk and settings-sheet e2e.
- **N8, N9, N10** — as ruled in questions.md (rating request list includes mapped prefixed values; README `rotateUi` + `hdmi_force_hotplug` in R-DOC-7/R-DOC-8 and the docs keyword loop; every spawned test server uses a free port).
- **Q19–Q23** — reflect the rulings (Q23: README note on fake-hwclock staleness).

Output: `docs/spec.md`, `docs/integration-plan.md`, `.orchestrator/artifacts/planning--handback-builder-r3.md`. `git add` the two docs; do NOT commit. Handback header as in r2 with `round: r3`; `criteria:` one line per N1–N10 and Q19–Q23 (fixed + the line that shows it). Re-run and paste: the coverage loop (incl. D1), `python3 .orchestrator/artifacts/planning--graphcheck-r2.py`, and `git diff --stat c817080 -- docs/`. If a Write is refused, return the report as text with first line `WRITE-BLOCKED: <path>`.
