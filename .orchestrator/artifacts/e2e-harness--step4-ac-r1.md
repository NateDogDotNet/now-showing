| # | kind | exit | criterion (e2e-harness, r1) |
|---|---|---|---|
| 1 | cmd | 0 | `npm test` |
| 2 | cmd | 0 | `for f in tests/e2e/*.mjs scripts/check-precache.mjs; do node --check "$f" \|\| exit 1; done` |
| 3 | cmd | 0 | `node scripts/check-precache.mjs` |
| 4 | cmd | 0 | `d=$(mktemp -d) && mkdir -p "$d/js/vendor" && touch "$d/index.html" "$d/js/vendor/x.js" && ` |
| 5 | cmd | 0 | `npm run test:e2e -- smoke` |
| 6 | cmd | 0 | `node -e "const p=require('./package.json'); if (p.dependencies \|\| !p.devDependencies \|\| p.` |
| 7 | cmd | 0 | `node -e "const l=require('./package-lock.json'); if (!l.packages \|\| !l.packages['node_modu` |
| 8 | cmd | 0 | `grep -Eq 'pixelShift: *false' tests/e2e/lib.mjs && grep -Eq 'dailyReload: *false' tests/e2` |
| 9 | cmd | 0 | `grep -q 'npm ci' .github/workflows/ci.yml && grep -q 'playwright install' .github/workflow` |
| 10 | cmd | 0 | `test -z "$(git status --porcelain -- js css index.html sw.js scripts/serve.mjs scripts/moc` |
| 11 | narrated | — | `narrated: `/tool-fit review` of the Playwright devDependency (version pin, size, licence) ` |
