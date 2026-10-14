## Dependency audit — now-showing (plex-poster-app), 2026-10-14

Run by conductor-2 for `release-bump` criterion 8 (close-time reviews). Read-only; nothing was upgraded.

**Manifests detected:** `package.json` + `package-lock.json` (lockfileVersion 3). No other manifest (no pyproject, Cargo, go.mod, Gemfile, composer, pom, gradle).
**Audit tools available:** `npm audit`, `npm outdated`, `npm view`, `npm ls`, the npm downloads API (`api.npmjs.org/downloads/point/last-week/<pkg>`), `depaudit.py` (outdated / license / typosquat / suspicious buckets).
**Audit tools missing:** `depcheck` (unused-dep confirmation; `npx depcheck` would install it on demand — not run, the one dependency's use is shown by grep below).

Direct dependencies: **0 runtime**, **1 dev** (`playwright` `1.56.1`, pinned exactly). The app ships no dependency at all (static files; `scripts/serve.mjs` uses Node built-ins only).

### Summary
| Dimension | Status | Findings |
|---|---|---|
| Outdated | 0 major / 1 minor / 0 patch behind | playwright 1.56.1 → 1.64.1 |
| Deprecated | 0 | `npm view playwright@1.56.1 deprecated` → empty |
| Security (CVEs) | 0 critical / 0 high / 0 medium | `npm audit --json` → `{"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}` |
| License | 0 conflicts / 0 missing | project MIT; playwright Apache-2.0 → OK |
| Unused (heuristic) | 0 candidates | imported in `tests/e2e/lib.mjs:25` (live test harness) |
| Suspicious | 0 flagged / 1 direct dep checked | see Suspicious patterns |

### Action plan (per package — act here, not per-dimension)
| Package | Worst finding (across all dims) | Priority | Single recommended action | Blast radius (what it clears) |
|---|---|---|---|---|
| playwright | minor-behind (1.56.1 → 1.64.1; current release 362 days old) | MEDIUM | After 2.1.0 ships: bump the pin to 1.64.1 in `package.json` and `package-lock.json`, re-run `npm run test:e2e` (the browsers it downloads change with the version; CI runs `npx playwright install --with-deps chromium`). Not in `release-bump` (criterion 7 fixes its file set; a test-harness bump is a 2.1.x item). | clears the only finding |

### CRITICAL (must fix)
none

### HIGH
none

### MEDIUM
- playwright @ 1.56.1 — [priority MEDIUM] depaudit outdated bucket: MEDIUM — "minor behind (minor-behind, 6–12mo old)" (`depaudit.py outdated --current 1.56.1 --latest 1.64.1 --age-days 362 --last-release-days 0`). Default bucket, not moved. Cross: none (not deprecated, no CVE, licence OK, used).

### LOW / INFO
- The exact pin (`"playwright": "1.56.1"`, no caret) means `npm outdated` reports wanted = current; the bump is a deliberate edit, not an `npm update`.

### Suspicious patterns
| Direct dep | Weekly downloads | Last publish (time.modified) | Maintainer change ≤90d? | Typosquat edit-dist? | Verdict |
|---|---|---|---|---|---|
| playwright | 113,562,399 (2026-10-06 to 2026-10-12) | 2026-10-14T11:54:50Z (1.64.1) | not checked — npm exposes the current maintainer list only (5 maintainers: two individuals and three Microsoft accounts), no history | none (`depaudit.py typosquat --name playwright --registry npm` → "no close match"; it is the canonical package) | clean |

Data source: `npm view playwright version deprecated license time.modified maintainers --json`; `npm view playwright time --json` (1.56.1 published 2025-10-17T00:51:31Z; 1.64.1 published 2026-10-14T11:54:49Z); `curl https://api.npmjs.org/downloads/point/last-week/playwright`; `depaudit.py suspicious --published-days 0 --downloads 113562399` → "outside supply-chain risk window".

### Outdated table (full)
| Package | Current | Wanted | Latest | Days behind | Manifest |
|---|---|---|---|---|---|
| playwright | 1.56.1 | 1.56.1 (exact pin) | 1.64.1 | 362 (current release age) | package.json (devDependencies) |

### License inventory
| License | Count | Examples |
|---|---|---|
| Apache-2.0 | 1 | playwright (`depaudit.py license --project MIT --dep Apache-2.0` → OK, compatible) |

Project license: MIT (`package.json`). Transitive tree: `npm ls playwright` → `now-showing@2.0.0 └── playwright@1.56.1` (its own dependency `playwright-core` is bundled under the same licence); `npm audit` covers the whole lockfile and reports 0 advisories.

### Recommendations (prioritized)
The Action plan table above is the canonical list; it has one row. Nothing blocks the 2.1.0 release.
