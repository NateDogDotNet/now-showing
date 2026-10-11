# Brief — serve-config-guard r2 (re-dispatch)

Agent name: serve-config-guard-builder-r2 · phase: serve-config-guard · round: r2. Same worktree `/home/user/wt-serve-config-guard` (your r1 changes are staged there). Read the r1 brief `artifacts/serve-config-guard--brief-r1.md` (all its rules still hold), both reviews (`artifacts/serve-config-guard--review-r1.md`, `artifacts/serve-config-guard--review-cold-r1.md`) and the conductor's mutation records named below. Touch only `scripts/serve.mjs`, `scripts/net.mjs`, `tests/serve.test.js`. Stage, do not commit.

Forced by `artifacts/serve-config-guard--tally-step7-r1.json`: 75/85 RE-DISPATCH, "tests where implied" 0/10. Close exactly these gaps:

1. **X-Forwarded-For test has no teeth** (tests/serve.test.js:101). It sends the LAN address as Host, so the Host check alone refuses it. The test must send `Host: localhost:<port>` from the LAN peer with `X-Forwarded-For: 127.0.0.1` and expect 403. Proof needed: the conductor's mutant `serve-config-guard--mutation-trust-xff-r1.txt` (server reads the peer from the forwarded-for header) currently passes 7/7 and must fail.
2. **Loose loopback match.** Mutant `loose-127` (`isLoopback` returning `a.startsWith('127')`) passes. Add unit cases that a prefix match gets wrong (for example `127.0.0.1.evil`, `1270.0.0.1`, `127.0.0.256`, `127.1`), each expecting false.
3. **Directory prefix without a trailing slash.** Mutant `dir-no-slash` (`DIRS = ['/css','/js','/assets']`) passes. Add LAN cases for sibling paths such as `/assets-private/x.png` and `/jsx/a.js` (present in the temp root) expecting 404.
4. **Symlink escape** (conductor ruling under D9: a symlink whose real path leaves the served root is not an app path). Compare the file's `realpath` with the root's `realpath`; outside → 404. Test: a symlink at `assets/link.png` → a file outside the root, and one → `config.json`, both 404 from the LAN.
5. **Dotfiles** (conductor ruling: R-SEC-1 and D9 both hold). Any path segment starting with `.` is 404, even under `css/`, `js/`, `assets/`. Test `/js/.env` → 404.
6. **Pin the exact status codes** in the tests (403 for the loopback-only refusals, 404 elsewhere) where they currently assert only "not 200".

Keep the code minimal; criteria 1–6 of the plan must still pass (criterion 4: the words `forwarded`/`x-forwarded` must not appear in serve.mjs or net.mjs — build the header name in tests only). Do not add behaviour beyond items 4 and 5.

Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/serve-config-guard--handback-builder-r2.md`, same header with `round: r2`; `criteria:` one line per item 1–6 above plus the plan's criteria 1–6, with commands and output tails. First body line: `Agent: serve-config-guard-builder-r2 · dispatched: <stamp in your prompt>`.
