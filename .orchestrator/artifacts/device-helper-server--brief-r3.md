# Brief — device-helper-server r3 (re-dispatch, same builder)

Forced by `artifacts/device-helper-server--tally-step4-r2.json` (60/75 RE-DISPATCH, conventions 0/15). Same worktree. Fix exactly:
1. Lint: remove the unused `mkdirSync` import at tests/device-helper.test.js:6 (eslint no-unused-vars). Run `eslint --no-config-lookup -c /home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1d.config.mjs scripts/device-helper.mjs scripts/serve.mjs tests/device-helper.test.js` and paste exit 0.
2. scripts/device-helper.mjs:13 comment still says "Commands run through execFile"; make it describe the spawn-based executor (fixed argv, no shell, detached process group).
3. Re-issue your r2 handback header-first (format only): rewrite `/home/user/plex-poster-app/.orchestrator/artifacts/device-helper-server--handback-builder-r2.md` so its FIRST line is the `produced_by:` line, then the other header fields, a blank line, then your `Agent:` line and the rest unchanged. (The original is preserved by the conductor.)
4. Write your r3 handback `/home/user/plex-poster-app/.orchestrator/artifacts/device-helper-server--handback-builder-r3.md`, first line `produced_by: … · round: r3`, criteria lines for items 1–2 and plan criteria 1–6 (re-run them).
Touch nothing else; stage, do not commit.
