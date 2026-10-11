| # | kind | exit | criterion (serve-config-guard, pre-r1) |
|---|---|---|---|
| 1 | cmd | 1 | `test -f tests/serve.test.js && node --test tests/serve.test.js` |
| 2 | cmd | 0 | `npm test` |
| 3 | cmd | 1 | `grep -q 'isLoopback' scripts/serve.mjs && grep -q 'export function isLoopback' scripts/net` |
| 4 | cmd | 1 | `test -f scripts/serve.mjs && test -f scripts/net.mjs && ! grep -qiE 'x-forwarded\|forwarded` |
| 5 | cmd | 0 | `test -z "$(git status --porcelain -- js css index.html sw.js scripts/mock-plex.mjs)"` |
| 6 | narrated | — | `narrated: run `node --test tests/serve.test.js 2>&1 \| grep -E '^# (pass\|fail\|skipped)'` on` |
