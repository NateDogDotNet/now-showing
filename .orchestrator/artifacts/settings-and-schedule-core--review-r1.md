Reviewer: settings-and-schedule-core-review-anchored-r1 · Model: opus · Dispatched: 2026-10-08T22:49:41Z · Method: anchored code review · Scope: settings-and-schedule-core, round r1, base d409ad7, staged tree ffe69fd

## What I read and ran

**Read:**
- the staged diff (`git diff --cached` in /home/user/wt-settings-and-schedule-core, byte-identical to `.orchestrator/artifacts/settings-and-schedule-core--diff-r1.patch`, checked with `diff`)
- the full `js/settings.js` after the change, and `js/settings-ui.js:41` and `js/main.js:419-425` for how settings reach `sanitize`/`fromImport`
- plan section "### 2. `settings-and-schedule-core`"
- spec: "Settings model changes", R-PROT-6, R-CACHE-2 (plus R-PROT-1/3 and R-FRM-4 for context)
- decisions D4/D5/D6, and questions Q19–Q23 with the conductor-alone rulings

**Ran,** all in a throwaway `git worktree add --detach` of HEAD d409ad7 at `/tmp/tmp.wHR0psUL76/wt`, with the staged patch applied. I removed it afterwards with `git worktree remove` + `prune`. The reviewed worktree's status and `git write-tree` (ffe69fd) are unchanged. Node v22.22.0.

- **Criteria 1–10:** each passes with the plan's exact commands.
  - C1: 34 pass / 0 fail.
  - C2 (`npm test`): 67 / 0.
  - C3: NY 14/0, London 14/0.
  - C4: "24 precached files OK". `VERSION` is still `'2.0.0'`, not bumped.
  - C5–C9: exit 0.
  - C10: empty porcelain.
- **`tests/schedule.test.js` in more zones:** 14/0 in each of Australia/Sydney, Asia/Kolkata, Pacific/Chatham, UTC, Australia/Lord_Howe, America/Santiago, America/Havana and Africa/Casablanca.
- **Independent brute-force probe of `msUntilNext`** (my own script, outside the repo).
  - Reference semantics: the next fire is the first instant of each local date whose wall-clock minute is at or after HH:MM. That means a gap time resolves to the transition instant and a repeated time fires at its first occurrence.
  - Inputs: 96 quarter-hour times plus gap-edge times (02:29/02:31/02:45/03:44/03:45/01:59/23:59/00:01). Each was chained for 400 days from 2026-01-01 00:00:07 local, plus 200 random start instants per time.
  - Zones: America/New_York, Europe/London, Australia/Sydney, Asia/Kolkata, Pacific/Chatham (45-min offset, 02:45→03:45 gap), UTC, Australia/Lord_Howe (30-min DST shift), America/Santiago and America/Havana (midnight gaps).
  - Result: `problems 0` in every zone, with no mismatch, double fire, ≤0 delay or NaN.
- **Hostile-input probe of `sanitize`, `load`, legacy migration, legacy-shape import, bare-object import, export/import round trip:** output quoted under Strengths and Issues.
- **Mutation testing in the throwaway copy** (each mutation reverted; `diff` against saved originals confirmed the revert):
  - Killed: M1 export keeps PIN, M2 import accepts PIN, M3 loose `hhmm`, M4 start==end treated as 24 h, M5 no gap walk-back, M6 `<` instead of `<=`, M7 "tomorrow = +24 h", M8 `>` instead of `>=` year, M9 hex accepts anything, M10 changed default, M11 NaN on bad input, M13 `getUTCHours` in `inWindow`, M14b gap fires 1 min before the transition.
  - Survived: **M12** (cross-midnight start made exclusive, `m > s`) in NY and London. **M15** (prefer the *later* occurrence of a repeated fall-back time) under TZ=America/New_York and Australia/Sydney; London killed it. See Issue 1.
  - One mutation, M14 (subtract 30 min before the walk-back), turned out equivalent: the loop re-corrects it. I discarded it and replaced it with M14b.

## Strengths

- **Schema matches the spec table.** Every key in the spec's settings table is present with the ruled default and rule (`js/settings.js` SCHEMA additions). This covers D4 (`idleSleepHours` 0, `wakeOnPlayback` true), D5 (`maxContentRating` '' and `limitNowPlaying` true) and D6 (pixel shift, status dot, cache 100 and daily reload on; sleep and night dim off; `nightDimTarget` 'frame'). The deferred keys and the `multi` fill value are absent: `sanitize({fillMode:'multi'})` gives 'none'. Existing keys are untouched.
- **`hhmm` is strict.** Every hostile value fell back to the default: `'25:00'`, `'7:00'`, `' 07:00'`, `'07:00 '`, `'07:00\n'` (JS `$` without the `m` flag does not match before a trailing newline), `'07:00\u0000'`, fullwidth digits, `'23:60'`, `'-1:00'`, `700`, `null`, `['07:00']`, an object whose `toString` gives `'07:00'`, and `true`. It never trims, so no padded value slips through.
- **PIN material is handled correctly.**
  - `NEVER_EXPORT_KEYS` is dropped on export even with `includeSecrets:true`.
  - `fromImport` ignores those keys for wrapped files, bare objects and `config.json` (which goes through `fromImport` at `js/main.js:424`). A planted hash cannot overwrite the current one: an import with `{settingsPinHash:'ff'}` over current `'aa'` keeps `'aa'`.
  - An export/import round trip keeps the device's own PIN (`cd`).
  - A file containing only PIN keys is rejected as "No recognised settings".
- **Migration and old exports still work.**
  - Legacy migration: `PLEX_TOKEN` + `REFRESH_INTERVAL_MS=60000` gives source `legacy`, token carried over, `rotateSeconds` 60, new keys at their defaults.
  - Legacy-shape import: `REFRESH_INTERVAL_MS:120000` gives 120.
  - 2.0.0 exports import with the new keys at their defaults, and `EXPORT_VERSION` stays 1.
- **`js/schedule.js` meets the Notes.**
  - It is pure (callers pass `now`) and uses local wall-clock time.
  - `inWindow` uses [start, end), crosses midnight, and treats start===end as empty.
  - A gap time walks back to the transition instant, which is the first valid instant after the gap. This is correct for 60-min (NY), 30-min (Lord Howe) and 45-min-offset (Chatham) zones and for midnight gaps (Santiago, Havana).
  - A repeated time fires once, because V8 resolves ambiguous local times to the earlier occurrence (verified on NY's 2026-11-01: from 01:29 EDT the next fire is 01:30 EDT; from the second 01:30 EST it is 2026-11-02 01:30).
  - `msUntilNext` has a final `Number.isFinite && > 0` guard that falls back to 24 h.
  - `MIN_PLAUSIBLE_YEAR = 2026` sits at the top of the file and `isPlausibleClock` uses `>=` (Q23).
- **`sw.js` precache.** `js/schedule.js` is added to `SHELL` in sorted position, with no `VERSION` bump (criterion 4).
- **The tests mostly have teeth.** 13 of 15 meaningful mutations were killed.

## Issues

### Important

**1. The "fall-back" test never examines a fall-back night under TZ=America/New_York (one of the two zones criterion 3 names) or Australia/Sydney. Criterion 3's fall-back clause is only exercised in London.**

- **Location:** `tests/schedule.test.js`, test `fall-back: 01:30 fires once; inWindow(01:00-07:00) true at both 01:30s`. The day search scans `start` to `start + 25 * 3600_000` and accepts the first day with two 01:30 hits.
- **Evidence:** I replayed that loop. On a 23-hour spring-forward day, a 25-hour scan reaches 01:30 of the *next* day, so it finds two 01:30s on two different dates:
  ```
  America/New_York test picks: Sun Mar 08 2026 01:30:00 GMT-0500 (EST) | Mon Mar 09 2026 01:30:00 GMT-0400 (EDT)
  Europe/London   test picks: Sun Oct 25 2026 01:30:00 GMT+0100 (BST) | Sun Oct 25 2026 01:30:00 GMT+0000 (GMT)
  Australia/Sydney test picks: Sun Oct 04 2026 01:30:00 GMT+1000 (AEST) | Mon Oct 05 2026 01:30:00 GMT+1100 (AEDT)
  ```
  Mutation M15 confirms this. I made `occurrence` return the later of two repeated occurrences, which is a real "fires at the wrong 01:30" bug. The test still passes under NY and Sydney (`# fail 0`) and fails only under London (`# fail 1`).
- **Why it matters:** Criterion 3 and R-PROT-6 require both of these under both zones:
  - `inWindow('01:00','07:00')` is true at both occurrences of 01:30 on a fall-back night;
  - a fall-back time fires once.

  In NY the test checks two ordinary 01:30s on Mar 8 and Mar 9 and reports success. The production code is correct: I checked it directly on NY's real 2026-11-01 night and with the brute-force probe. But the test that is supposed to guard it is vacuous in one required zone, and a later regression would go unnoticed there.
- **Class:** code-bug (the test does not meet criterion 3 as written for America/New_York).
- **Fix:** scan exactly one local date, from `new Date(y, m, d, 0, 0)` to `new Date(y, m, d + 1, 0, 0)`, or require `localDay(hits[0]) === localDay(hits[1])`. Then assert that the test actually found a fall-back day (`found === true`) whenever the zone has DST in 2026 (for example, when `new Date(2026,0,1).getTimezoneOffset() !== new Date(2026,6,1).getTimezoneOffset()`). That way a vacuous pass cannot recur. The spring-forward test has the same silent-skip shape: it is vacuous in London, where 02:30 exists. Consider the same assertion there, or also probe a time inside London's 01:00–02:00 gap (for example `01:30`).

### Minor

**2. The cross-midnight window's start boundary is untested.**

- **Location:** `tests/schedule.test.js`, `inWindow handles windows crossing midnight`.
- **Evidence:** Mutation M12 (`m >= s || m < e` changed to `m > s || m < e`) survives under NY and London (`# fail 0`). The same-day test covers `09:00` inclusive, but no assertion checks `inWindow(at(22,0),'22:00','07:00') === true`.
- **Why it matters:** At sleepStart / nightDimStart the screen would act a minute late. That is small, but it is exactly the boundary later phases rely on.
- **Class:** code-bug (test strength; the implementation is correct).
- **Fix:** add `assert.equal(inWindow(at(22, 0), '22:00', '07:00'), true)`.

**3. For the new numeric keys, out-of-range values clamp instead of falling back to the default, and wrong-typed values (`''`, `true`, `false`, `[]`, `'  '`) become the minimum.**

- **Location:** `js/settings.js`, the `num(min,max)` sanitiser (pre-existing, reused for `posterCacheLimit`, `idleSleepHours`, `pixelShiftMinutes`, `frameBrightness`, `nightDimLevel`).
- **Evidence (probe output for `posterCacheLimit`, default 100):**
  - `-5`, `0`, `9`, `''`, `true`, `false`, `[]`, `'  '` all give `10`;
  - `301` and `1e9` give `300`;
  - `Infinity`, `NaN` and `'abc'` give `100`;
  - `10.5` stays `10.5`.
- **Context:** `js/settings-ui.js:41` stores `el.value` (a string) as-is, so a cleared number field is `''`. When the `posterCacheLimit` control lands it would turn into 10, evicting the cache to 10 posters. That re-introduces the downloads and SD writes R-CACHE-2 exists to stop.
- **Why it matters / ruling needed:** The spec says the sanitisers "coerce bad input to the default". The table gives ranges such as "10-300" without saying clamp vs reject, and the existing keys have always clamped. The new test (`numeric ranges clamp and junk falls back`) pins clamping.
  - Clamping an out-of-range *number* is a defensible reading of the spec.
  - Turning `''` or a boolean into the minimum is not "the default".
- **Class:** spec-gap (the spec is silent on clamp vs default for out-of-range values, and the behaviour is inherited from the unchanged `num`). The `''` / boolean case borders on a code-bug, but fixing it here would change existing keys, which the spec says stay unchanged.
- **Fix (conductor's call):** either rule "clamp" explicitly in the spec, or add a stricter numeric sanitiser for the new keys that returns the default for non-numbers and blank strings (and optionally `Math.round` for counts). Alternatively, leave it to `settings-sheet` to never submit `''`.

## Declined to judge

- **Whether `hex` should enforce a length or lower case** for `settingsPinHash` / `settingsPinSalt`. The spec says only "hex string". The format of the hash and salt belongs to `kiosk-and-pin`.
- **Behaviour of the daily-reload, sleep and night-dim consumers** (re-arm loops, clock-jump re-evaluation per the Q23 ruling). They are outside this diff and belong to later phases. `isPlausibleClock` itself matches Q23.
- **`npm test` without `TZ`.** It runs the DST tests in the host zone, where they may be vacuous. Criterion 3 deliberately covers DST with explicit zones, so I did not treat this as an issue.
- **Fractional values such as `posterCacheLimit: 10.5` are accepted.** This is pre-existing `num` behaviour and a product choice. It is noted in Issue 3 but not ruled on.

## Recommendations

1. Fix Issue 1. Make the fall-back and spring-forward tests pick the correct day within a single local date, and fail when a DST zone yields no case.
2. Add the 22:00 start-boundary assertion (Issue 2).
3. Route Issue 3 to the spec owner as a clamp-vs-default ruling before `settings-sheet` adds number inputs for these keys.

## Assessment

**Production code:** `js/settings.js`, `js/schedule.js` and `sw.js` do what the phase asks, and the brute-force probe found them correct in every zone I tried, including 30-min, 45-min and midnight transitions.

**Tests:** one of the tests that carry criterion 3 is vacuous in America/New_York, a zone criterion 3 names explicitly. The criterion's command passes there without checking the fall-back case, so the criterion is not met as written. That is a small test-only fix.

**Verdict:** CHANGES REQUESTED
