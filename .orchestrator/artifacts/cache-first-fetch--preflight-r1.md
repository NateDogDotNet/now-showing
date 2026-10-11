| # | kind | exit | criterion (cache-first-fetch, pre-r1) |
|---|---|---|---|
| 1 | cmd | 1 | `test -f tests/poster-cache.test.js && node --test tests/poster-cache.test.js` |
| 2 | cmd | 0 | `npm test` |
| 3 | cmd | 1 | `npm run test:e2e -- cache-first` |
| 4 | cmd | 0 | `test -z "$(git status --porcelain -- index.html css sw.js)"` |
