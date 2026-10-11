| # | kind | exit | criterion (device-helper-server, pre-r1) |
|---|---|---|---|
| 1 | cmd | 1 | `test -f tests/device-helper.test.js && node --test tests/device-helper.test.js` |
| 2 | cmd | 0 | `npm test` |
| 3 | cmd | 1 | `test -f scripts/device-helper.mjs && ! grep -nE "\bexec\(\|execSync\|shell: *true" scripts/d` |
| 4 | cmd | 1 | `test -f scripts/device-helper.mjs && test -f scripts/serve.mjs && ! grep -n 'Access-Contro` |
| 5 | cmd | 1 | `test -f scripts/device-helper.mjs && ! grep -niE 'brightness\|ddcutil\|backlight\|vcgencmd di` |
| 6 | cmd | 0 | `test -z "$(git status --porcelain -- js css index.html sw.js scripts/net.mjs scripts/mock-` |
| 7 | narrated | — | `narrated: independent reviewer (risk:high; this phase runs commands on the device) tries t` |
