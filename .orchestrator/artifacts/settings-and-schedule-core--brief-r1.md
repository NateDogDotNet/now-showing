# Brief — settings-and-schedule-core r1

Agent name: settings-and-schedule-core-builder-r1 · phase: settings-and-schedule-core · round: r1

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-settings-and-schedule-core` (branch `orch/settings-and-schedule-core` from `d409ad7`; contains the e2e harness and the allowlisting serve.mjs). Work ONLY there.
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/settings-and-schedule-core--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md`.
- `git add` Output files only; do not commit.

## Process
TDD: extend `tests/settings.test.js` and write `tests/schedule.test.js` first (defaults table, sanitisers incl. `hhmm`, NEVER_EXPORT_KEYS on export AND import, every DST case in criterion 3 under both zones, `inWindow` midnight-crossing and empty window, `msUntilNext` never negative/NaN and once per local date over 400 days, `isPlausibleClock`), watch them fail, then implement. Run criteria 1–10 and paste outputs. Add `js/schedule.js` to `SHELL` in `sw.js`; do NOT bump VERSION.
Keep existing behaviour: every existing test in tests/settings.test.js must still pass; legacy migration, export/import of 2.0.0 files still work.

## Binding rulings
`docs/decisions.md` D1–D16 (D4 sleep, D5 content filter, D6 defaults). Conductor rulings Q19–Q23 at the end of `.orchestrator/questions.md` (Q23: MIN_PLAUSIBLE_YEAR = 2026 constant at the top of js/schedule.js).

## The settings model (verbatim from docs/spec.md)
## Settings model changes

All new keys are added to `SCHEMA` in `js/settings.js` in one phase (`settings-and-schedule-core`) with sanitisers that coerce bad input to the default, so later phases consume them and do not edit the schema. New helper sanitiser `hhmm` (`HH:MM`, 00:00-23:59, else default). Existing keys are unchanged. `EXPORT_VERSION` stays 1 (purely additive: older exports import with defaults; a new export imported by an older app has its unknown keys dropped by `sanitize`). `settingsPinHash` and `settingsPinSalt` are never exported and never accepted from an import file (new `NEVER_EXPORT_KEYS`). `config.json` provisioning accepts all settings keys except those two, plus the control flag `resetPin` (not a setting).

| Key | Default | Rule | Protects / why | Req |
|---|---|---|---|---|
| `rotateUi` | `true` | bool | UI reads upright (D2) | R-ROT-2 |
| `statusIndicator` | `'dot'` | `dot`\|`off` | no static text; on (D6) | R-STAT-1 |
| `posterCacheLimit` | `100` | 10-300 | SD wear; cache-first on (D6) | R-CACHE-2 |
| `maxContentRating` | `''` (off) | `''`,G,PG,PG-13,R,NC-17 | its own "household with children" toggle (D5) | R-FILT-1 |
| `limitNowPlaying` | `true` | bool | applies the limit to now-playing when a limit is set (D5) | R-FILT-1 |
| `sleepEnabled` | `false` | bool | would blank the screen unasked (D6) | R-PROT-1 |
| `sleepStart` / `sleepEnd` | `'01:00'` / `'07:00'` | hhmm | | R-PROT-1 |
| `idleSleepHours` | `0` (off) | 0-48 | off and not in the preset (D4) | R-PROT-1 |
| `wakeOnPlayback` | `true` | bool | (D4) | R-PROT-1 |
| `pixelShift` | `true` | bool | on (D6) | R-PROT-2 |
| `pixelShiftMinutes` | `3` | 1-60 | | R-PROT-2 |
| `frameBrightness` | `100` | 10-100 | | R-FRM-4 |
| `nightDim` | `false` | bool | visible change, off (D6) | R-FRM-4 |
| `nightDimStart` / `nightDimEnd` | `'22:00'` / `'07:00'` | hhmm | | R-FRM-4 |
| `nightDimLevel` | `60` | 10-100 | | R-FRM-4 |
| `nightDimTarget` | `'frame'` | `frame`\|`stage` | whole-poster dim option (D6) | R-FRM-4 |
| `dailyReload` | `true` | bool | on where safe; the guard decides (D6) | R-PROT-3 |
| `dailyReloadTime` | `'04:00'` | hhmm | | R-PROT-3 |
| `kioskMode` | `false` | bool | | R-KIOSK-1 |
| `disableShortcuts` | `false` | bool | | R-KIOSK-1 |
| `settingsPinHash` / `settingsPinSalt` | `''` | hex string | never exported or imported | R-KIOSK-1/2 |
| `deviceHelper` | `false` | bool | opt-in, runs commands (D8) | R-HELP-2 |
| `controlLabels` | `'auto'` | auto\|always\|never | | R-CTRL-1 |
| `showMeta` | `false` | bool | | R-NP-2 |
| `showProgress` | `true` | bool | | R-NP-1 |
| `showPlayer` | `false` | bool | | R-NP-1 |
| `fillMode` | `'none'` | none\|blur\|info | lit pixels on OLED, opt-in | R-FILL-1 |

Removed from r1 by D1: `bulbAnimation`, `frameRotation`, `frameRotationIds`, `frameIdRandom`, `fillCount` and the `multi` fill value. Non-setting storage keys: `plexPoster.lastReload`, `plexPoster.pinLock`, `plexPoster.whatsNew`.

Each feature phase adds its own controls to the settings sheet (a new "Display protection" fieldset in `index.html` / `js/settings-ui.js` for the P1 keys); the schema phase adds keys only. Migration impact: none for stored settings (`load()` runs `sanitize`, which fills the new keys). Legacy-key migration is untouched. `showTitle` keeps its meaning. A 2.0.0 install upgrading to 2.1.0 therefore gains cache-first fetching, pixel shift (with a 3 % smaller stage), the status dot and the guarded daily reload, and nothing else; it sees the one-time toast of R-UPG-1.

## Conventions every phase follows (verbatim)
1. **Output is a whitelist.** A phase may create or modify only its `Output` paths. The plan file and `.orchestrator/` are never Output. A parenthetical after a path is a condition, not part of the path.
2. **Acceptance criteria are shell commands run from the repo root; exit 0 is a pass.** An item starting `narrated:` is not a command: it names what a human or reviewer checks, and scores as narrated.
3. **Concurrent phases run in separate git worktrees with their own ports (D12).** Each worktree sets its own `E2E_PORT` and `E2E_MOCK_PORT`, so e2e runs do not collide and a worktree's `git status` shows only that phase's edits. Every server a test spawns (unit, integration or e2e) listens on a free port probed at run time, never a fixed one, apart from the shared e2e server's `E2E_PORT`/`E2E_MOCK_PORT`, because every worktree runs `npm test`. Scope probes are therefore valid per worktree. A scope probe is `test -z "$(git status --porcelain -- <paths>)"`: unlike `git diff HEAD` it also sees untracked new files. The conductor's reconcile step is the cross-check.
4. **Negative checks and unit-test lists are guarded.** `! grep … F` passes when `F` is missing, and `node --test a b` silently skips a missing path when another path exists, so every negative grep is written `test -f F && ! grep … F` and every `node --test` criterion is prefixed with `test -f` for each test file it names.
5. **New files under `js/` go into `SHELL` in `sw.js` in the phase that creates them**, which therefore lists `sw.js` in Output. `VERSION` is bumped **once**, in `release-bump` (spec R-REL-1; D16): the rationale is clean releases, not that per-phase bumps would reload clients (any `sw.js` edit already triggers a service-worker update).
6. **Output overlap is a scheduling constraint, not a dependency.** Many UI phases edit `index.html`, `css/app.css`, `js/main.js`, `js/display.js`, `js/settings-ui.js` and `scripts/mock-plex.mjs`. Two phases whose Output lists share a path must not run concurrently even when neither blocks the other. The *Concurrency* section lists only Output-disjoint sets.
7. **Pixel shift is on by default, so geometry specs run without it.** `tests/e2e/lib.mjs` (built in `e2e-harness`) seeds `pixelShift:false`, `dailyReload:false` and the `plexPoster.whatsNew` marker by default; a spec that tests those features sets them explicitly. Every spec that measures stage geometry also names `pixelShift: false` in its own settings.
8. **The e2e `mock` helper is generic** (`mock.get(action)`, `mock.post(action, params)` call `/__mock/<action>`), so later phases add mock endpoints without editing `tests/e2e/lib.mjs`.
9. **(verify)** marks a Plex parameter, Chromium flag or hardware command that could not be exercised in the authoring environment; each is carried into `docs/validation/`.
10. **Settings keys are added once** (`settings-and-schedule-core`); feature phases add controls (bound by `name`) and consume keys, and do not edit `js/settings.js`.
11. **Plan edits commit separately** from phase output. `Findings: —` means the phase delivers no source finding directly (an enabler, or documentation of shipped work).
12. **No gate phases.** The r1 milestone gates are gone. The phase that closes each milestone (named in the *Milestones* table) carries the full-suite criteria (`npm test`, `npm run test:e2e`, `node scripts/check-precache.mjs`), and the conductor runs `/phase-gate` on it at Step 7. `release-bump` carries the release checks (D11).
13. **The run ends with a push to the working branch only (D13).** A pull request or merge happens only when the owner asks, so no phase is tagged `publish`.

## The phase (verbatim)
### 2. `settings-and-schedule-core` — Settings schema additions and schedule helpers

- **Goal:** Add every new settings key (with sanitisers and defaults) and the pure local-time helpers later phases share, so later phases never edit the schema.
- **Findings:** — (supports E1, E4, E10, E12, E14, F3, F5, U7, U9, U10, U11) · **Requirements:** R-CACHE-2, R-PROT-6 and every key in *Settings model changes* · **Rulings:** D4, D5, D6
- **Mode:** afk · **Tags:** — · **Blocked by:** `e2e-harness`
- **Output:** `js/settings.js`, `js/schedule.js`, `tests/settings.test.js`, `tests/schedule.test.js`, `sw.js`
- **Acceptance criteria:**
  1. `test -f tests/settings.test.js && test -f tests/schedule.test.js && node --test tests/settings.test.js tests/schedule.test.js`
  2. `npm test`
  3. `test -f tests/schedule.test.js && TZ=America/New_York node --test tests/schedule.test.js && TZ=Europe/London node --test tests/schedule.test.js`  (DST cases run under two zones: 400-day fire/re-arm simulation for `04:00` and `02:30` fires once per local date and never returns a negative or NaN delay; `inWindow('01:00','07:00')` is true at 01:30 on both occurrences of a fall-back night)
  4. `node scripts/check-precache.mjs`  (`js/schedule.js` added to `SHELL`; `VERSION` is NOT bumped here)
  5. `node -e "import('./js/settings.js').then(m=>{const d=m.defaults();const need=['rotateUi','statusIndicator','posterCacheLimit','maxContentRating','limitNowPlaying','sleepEnabled','sleepStart','sleepEnd','idleSleepHours','wakeOnPlayback','pixelShift','pixelShiftMinutes','frameBrightness','nightDim','nightDimStart','nightDimEnd','nightDimLevel','nightDimTarget','dailyReload','dailyReloadTime','kioskMode','disableShortcuts','settingsPinHash','settingsPinSalt','deviceHelper','controlLabels','showMeta','showProgress','showPlayer','fillMode'];const gone=['bulbAnimation','frameRotation','frameRotationIds','frameIdRandom','fillCount'];const miss=need.filter(k=>!(k in d));const extra=gone.filter(k=>k in d);if(miss.length||extra.length){console.error(miss,extra);process.exit(1)}})"`  (every ruled key exists; the deferred ones do not)
  6. `node -e "import('./js/settings.js').then(m=>{const d=m.defaults();const ok=d.pixelShift===true&&d.dailyReload===true&&d.posterCacheLimit===100&&d.statusIndicator==='dot'&&d.rotateUi===true&&d.sleepEnabled===false&&d.idleSleepHours===0&&d.wakeOnPlayback===true&&d.nightDim===false&&d.nightDimTarget==='frame'&&d.maxContentRating===''&&d.limitNowPlaying===true&&d.kioskMode===false&&d.deviceHelper===false&&d.fillMode==='none'&&d.showProgress===true&&d.showPlayer===false;if(!ok)process.exit(1)})"`  (default table, D4/D5/D6)
  7. `node -e "import('./js/settings.js').then(m=>{const o=m.toExport({...m.defaults(),plexToken:'t',settingsPinHash:'a'.repeat(64),settingsPinSalt:'b'},{includeSecrets:true});if('settingsPinHash' in o.settings||'settingsPinSalt' in o.settings||o.settings.plexToken!=='t')process.exit(1)})"`  (PIN material never exported, token only when ticked)
  8. `node -e "import('./js/settings.js').then(m=>{const s=m.fromImport(JSON.stringify({format:'plex-poster-display/settings',version:1,settings:{settingsPinHash:'a'.repeat(64),settingsPinSalt:'b',rotateSeconds:60}}));if(s.settingsPinHash!==''||s.settingsPinSalt!==''||s.rotateSeconds!==60||s.pixelShift!==true)process.exit(1)})"`  (an import file cannot plant a PIN; a 2.0.0 export still imports; `EXPORT_VERSION` stays 1)
  9. `node -e "import('./js/schedule.js').then(m=>{for(const f of ['parseHHMM','inWindow','msUntilNext','isPlausibleClock'])if(typeof m[f]!=='function')process.exit(1); if(!m.inWindow(new Date(2026,0,5,2,0),'01:00','07:00')||!m.inWindow(new Date(2026,0,5,23,30),'22:00','07:00')||m.inWindow(new Date(2026,0,5,12,0),'22:00','07:00')||m.inWindow(new Date(2026,0,5,3,0),'03:00','03:00'))process.exit(1); if(m.isPlausibleClock(new Date(1970,0,1))||!m.isPlausibleClock(new Date(2026,9,8)))process.exit(1)})"`
  10. `test -z "$(git status --porcelain -- index.html css js/main.js js/display.js js/engine.js js/plex.js js/poster-cache.js js/layout.js scripts tests/e2e)"`  (no UI or behaviour here)
- **Notes/hazards:**
  - Sanitiser `hhmm` returns the default for anything that is not `HH:MM` with valid ranges. `inWindow(date, start, end)` uses local wall-clock time, supports windows that cross midnight, and treats `start === end` as an empty window (never asleep), not 24 h.
  - `msUntilNext(date, 'HH:MM')` returns the delay to the next local occurrence strictly after `date`; on a spring-forward night a time that does not exist fires at the first valid instant after it, on a fall-back night it fires once. Keep helpers pure: callers pass `now`. `isPlausibleClock(date)` is `date.getFullYear() >= MIN_PLAUSIBLE_YEAR` with the constant (2026) at the top of the file (Q23; bump it when it ages).
  - Add `NEVER_EXPORT_KEYS = ['settingsPinHash', 'settingsPinSalt']`; `toExport` drops them and `fromImport` ignores them (a file could plant a PIN hash). The `resetPin` flag is not a setting and is handled in `kiosk-and-pin`.
  - No UI, no behaviour: the keys are unused until later phases. Do not add controls here.

## Handback header
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: settings-and-schedule-core · round: r1
status: complete | blocked | failed        failure_class: <...>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
First body line: `Agent: settings-and-schedule-core-builder-r1 · dispatched: <stamp>`.
