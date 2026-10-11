| # | kind | exit | criterion (settings-and-schedule-core, pre-r1) |
|---|---|---|---|
| 1 | cmd | 1 | `test -f tests/settings.test.js && test -f tests/schedule.test.js && node --test tests/sett` |
| 2 | cmd | 0 | `npm test` |
| 3 | cmd | 1 | `test -f tests/schedule.test.js && TZ=America/New_York node --test tests/schedule.test.js &` |
| 4 | cmd | 0 | `node scripts/check-precache.mjs` |
| 5 | cmd | 1 | `node -e "import('./js/settings.js').then(m=>{const d=m.defaults();const need=['rotateUi','` |
| 6 | cmd | 1 | `node -e "import('./js/settings.js').then(m=>{const d=m.defaults();const ok=d.pixelShift===` |
| 7 | cmd | 0 | `node -e "import('./js/settings.js').then(m=>{const o=m.toExport({...m.defaults(),plexToken` |
| 8 | cmd | 1 | `node -e "import('./js/settings.js').then(m=>{const s=m.fromImport(JSON.stringify({format:'` |
| 9 | cmd | 1 | `node -e "import('./js/schedule.js').then(m=>{for(const f of ['parseHHMM','inWindow','msUnt` |
| 10 | cmd | 0 | `test -z "$(git status --porcelain -- index.html css js/main.js js/display.js js/engine.js ` |
