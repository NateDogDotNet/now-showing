| # | kind | exit | criterion (validation-checklists, r1) |
|---|---|---|---|
| 1 | cmd | 0 | `test "$(grep -c 'PENDING' docs/validation/real-server-core.md)" -ge 10 && test "$(grep -c ` |
| 2 | cmd | 0 | `grep -qx 'Overall: PENDING' docs/validation/real-server-core.md && grep -qx 'Overall: PEND` |
| 3 | cmd | 0 | `for k in 'plex.tv/link' 'Sign in with Plex' firstReachable CORS '/photo/:/transcode' '/sta` |
| 4 | cmd | 0 | `for k in 'first-run code' contentRating 'gb/' totalSize viewOffset Player.title overscroll` |
| 5 | cmd | 0 | `test -f docs/validation/real-server-core.md && test -f docs/validation/real-server-extende` |
| 6 | cmd | 0 | `for f in docs/validation/real-server-core.md docs/validation/real-server-extended.md; do g` |
| 7 | narrated | — | `narrated: `/doc-review` of both files: each item has an ID, exact steps, expected result, ` |
