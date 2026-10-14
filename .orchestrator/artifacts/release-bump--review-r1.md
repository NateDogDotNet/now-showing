Agent: release-review-r1 · model: claude-opus-5-5 · dispatched: 2026-10-14T22:03:04Z
Verdict: APPROVE

Method: anchored phase review · Scope: release-bump, round r1, base fdcf53d, staged tree d299c508e52b2b937d9291388515a578499a9a7b (`git -C /home/nathan/wt-release-bump write-tree`, read-only).

Read: the staged diff (`git diff --cached`); plan phase 26 and `docs` criterion 6 (`docs/integration-plan.md:578`); `docs/decisions.md` D11, D13, D48, D51–D71; builder brief r1 and handback r1; `docs/validation/real-server-core.md`, `docs/validation/real-server-extended.md`; `.orchestrator/artifacts/docs--review-r3.md:40-43`; `tests/e2e/lib.mjs:173-245`, `tests/e2e/run.mjs`, `tests/e2e/pi-stability.spec.mjs:175-215`, `sw.js:40-58`, `js/main.js:418-426,619-640`, `index.html` dialogs.
Ran (all in `/home/nathan/wt-release-bump`, read-only, no e2e, no worktree needed): criteria 1, 7 and 9 verbatim; `docs` criterion 6 verbatim; `node --check tests/e2e/release.spec.mjs`; greps for VERSION strings, `(verify)` tags, row results and `.orchestrator` references. No mutation was made, so nothing needed reverting.

## Issues

1. **Minor · code-bug**, `Roadmap.md:46`. The Suggested order's 2.4 item says "Clear-logo marquees, poster artwork sources, Coming Soon for titles not in the library, and the filter on any production house come with it." D53 item 4 says ideas that want titles outside the library ("Coming soon" mode, ...) "come after it", and D54 says Coming Soon for titles not in the library "comes after 2.4". The Roadmap's own marquee entry agrees with the decisions and so contradicts line 46: `Roadmap.md:118` "...needs the TMDB adapter (or a Radarr/Sonarr calendar) and comes after 2.4." Brief check 3 asks that the per-entry order notes do not contradict the section. Fix: in line 46, move Coming Soon out of "come with it", for example "...and the filter on any production house come with it; Coming Soon for titles not in the library follows it."

2. **Minor · spec-gap**, `README.md:11`. The banner now defines the tag as Pi-only: "**(verify)**, which from here on means "not yet verified on a Raspberry Pi"" and "Once a Pi row passes, its tag comes off here." Line 358 still uses the tag for a real-server item that no Pi row covers: "The country-prefixed values could not be: the test server stores none (V1-E04), so how Plex writes them is still **(verify)**." So the banner's definition is wrong for at least that tag (and loosely for the device-timeout "(verify for your device)" notes at lines 225 and 257). The builder copied the definition word for word from its brief ("'(verify)' from here on means 'not yet verified on a Raspberry Pi'"), so the spec is what's wrong here, not the build. Fix: "...means "not yet verified on a Raspberry Pi" (and, where the text says so, on a real server: the country-prefixed rating values)" and "Once a row passes, its tag comes off here."

3. **Minor · spec-gap**, `Roadmap.md:196`. Conductor observation confirmed. The Home controls entry cites `.orchestrator/artifacts/research--home-automation-panel-r1.md`. That is an internal trail file, and the published Roadmap is the one place it must not dangle. I could not find the rule that drops `.orchestrator/` before a PR in D13's text (`docs/decisions.md:22`: "Work is pushed to the working branch only. A PR or merge happens only when the owner asks"). The rule may be in the handoff note, which I did not read, and the tree still tracks `.orchestrator/` today (`git ls-files .orchestrator | head`). Whether or not the folder survives, a reader-facing Roadmap should not depend on it. The class is spec-gap because D69 carries the path as provenance and no criterion covers links. Replacement wording: "Research (2026-10-14, from the official Home Assistant, openHAB and Zigbee2MQTT documentation; recorded as D69 in `docs/decisions.md`) confirmed that ...". You could also drop the parenthesis entirely and keep "Research on 2026-10-14 confirmed from official docs that ...".

4. **Minor · spec-gap**, `Roadmap.md:44,96,105`. Two entries both claim "right after the Rating schedule": Viewer profiles (`:96` "Order: 2.2, right after the Rating schedule, which it generalises.") and Poster selection (`:105` "libraries, genres and ratings in 2.2 right after the Rating schedule"). The Suggested order (`:44`) puts profiles first. But a profile bundles "household limit, poster selection, frame style, music and captions" (`:93`), so by D53's own rule ("ordered by what each item needs first") profiles need poster selection, styles and theme music to exist first. The conflict comes from the decisions themselves (D60 and D64 item 4 both say "right after the D59 schedule"), and the builder carried both faithfully. Fix (owner or conductor): rule which one follows the schedule. The natural reading is schedule, then selection, then profiles later in 2.2. Then align `:44`, `:96` and `:105`.

5. **Minor · spec-gap**, `tests/e2e/release.spec.mjs:18,27,33`. The spec hard-codes `'shell-2.1.0'` and `'shell-2.0.0'`. The next version bump (2.1.1) will turn the full e2e suite red until someone edits this release spec, which is a trap for whoever does the 2.1.x polish. Criterion 5 names the versions literally, so the build matches the spec. Fix (later, optional): read the current version from `sw.js` (`/VERSION = '([^']+)'/`) and seed a stale `shell-0.0.0-stale` cache, so the spec proves "old shell caches are deleted on activation" for any version.

## Checked and clean

- **K61 tags removed, each backed by a PASS row.** Banner counts: `grep -c "Result: PASS"` gives core 17, extended 15; `grep -c "Result: SKIPPED"` gives extended 12. The rows are V1-E11 to V1-E22 (`real-server-extended.md:29-42`, each "SKIPPED (no Pi)"), and both files end `Overall: PASS` (core :46, extended :55). For line 144, V1-E24 PASS (:48, "remote https `*.plex.direct` address ... not local, not relay") and V1-E25 PASS (:49, "the saved Server address is the relay connection"). E25 used an in-browser block standing in for Remote Access off, and the run note at :11 discloses that. The README wording "the relay fallback works when no direct address is reachable" is supported. For line 358, V1-E03 PASS (:17, "the parameter name and the comma separator are correct", which matches "comma-separated syntax") and V1-E27 PASS (:53, 100 keys, HTTP 200, 100 items).
- **K61 tags kept.** V1-E04 (:18) passed vacuously ("No country-prefixed values occur"), so the README keeps (verify) on it, as it should. The managed-user line (`README.md:348`) is unchanged. Every Pi item is still tagged: `grep -n -i verify README.md` shows lines 150-156, 224, 227, 249-250, 258-259, 268, 278-279, 283, 296, 300, 307, 377, 387, 393, 405 and 417 all still carry the tag or "not yet verified". Nothing a SKIPPED row covers was untagged.
- **docs r3 wording (D48).** `README.md:194` now reads "The reload waits while any window of the app is open (Settings, Diagnostics, the PIN pad or the shortcuts list)". That matches `js/main.js:423` `document.querySelector('dialog[open]')` and the four dialogs in `index.html` (73 settings, 343 diagnostics, 357 pin-dialog, 381 shortcuts). The wake wording is "a key, touch or click", which matches `js/main.js:639-640` (`pointerdown` and `keydown` on manualWake).
- **Roadmap vs D51–D71: substance, constraints and caveats carried.** I read each entry against its D-entry:
  - D51: playlist; Sources other than Plex extended with the no-server TMDB adapter. "IMDb ... is not promised" and "TMDB's terms are to be checked before it is promised (unconfirmed)".
  - D53: section placed before Ideas. Its 2.1.x, 2.2, 2.3, 2.4 and Later items match, apart from issue 1.
  - D54: one marquee entry naming theatre mode, Coming soon mode and Frame per poster source.
  - D56: all six constraints present; Watch later is (verify).
  - D57: Mirror, Change together, Chain and Controller; "PIN-locked settings"; the old Remote control security design kept; no token between devices.
  - D58: licence, poster window, OLED and precache constraints; Frame rotation revived.
  - D59: fails closed, immediate removal at a stricter slot, unrated hidden, PIN.
  - D60 and D63 (with the D63 note): ceiling, proportional sampling, `genre` (verify), smart collection step, the two readings of "score from", studio vs production companies.
  - D61: off by default, autoplay flag, theme path (verify).
  - D62: opacity and transform only, Pi (verify), reduced motion.
  - D64: all ten names present with their order.
  - D65 and the D65 note: Allowed devices (starts empty, matched by client identifier), companion and transcoder (verify).
  - D66: Recently shown, search (verify).
  - D67: gap fill inside Landscape fill, with colour matte and smart crop; Pi detection (verify).
  - D68 and the D68 note: Browse button, gesture collision, 3.0, before Multiple displays.
  - D69: helper-held non-admin token, allow-list, Hubitat, Homey, SmartThings and HomeKit unconfirmed, the verify-first list.
  - D70: four source types; Google Photos and iCloud "(verify) and unconfirmed"; privacy constraints.
  - D71: fourth main screen, screen saver, layout shift.

  No unconfirmed item is promised.
- **Old names kept as text.** The `docs` criterion 6 command (`integration-plan.md:578`) run verbatim gives `docs6=0`. Also present: Synchronised displays, Shared settings for several displays, Multiple libraries, Collections & filters, Now showing theatre mode, Coming soon mode (grep -F, all "ok"). "Multi-poster landscape layout" and "Animated frame bulbs" keep their own entries. "(K60)" is gone. The "Validate on the real server early" entry was replaced by "Validate on a Raspberry Pi" (`Roadmap.md:263-264`).
- **Criterion 9** run verbatim: `c9=0`. **Criterion 1** run verbatim: `c1=0`.
- **Version.** `grep -rn "2\.1\.0"` over js, mjs, json and html (excluding the lockfile) shows `sw.js:5`, `js/main.js:20`, `package.json:3` and the release spec only. The lockfile diff is exactly the two version lines (`version` and `packages[""].version`). No other 2.0.0 literal is a live VERSION: those in `js/display.js:250`, `tests/settings.test.js` and `tests/e2e/metadata.spec.mjs` are comments or test names about 2.0.0 behaviour.
- **Release spec meets criterion 5 and has teeth.** `node --check` passes, and `tests/e2e/run.mjs:20` picks up every `*.spec.mjs`, so the full suite runs it. `withApp` does not navigate before calling `fn` (`lib.mjs:200-241`), so the spec's `page.addInitScript` runs before the app's `register('sw.js')` (`js/main.js:1244`). Because the init script wraps `register`, the stale `shell-2.0.0` cache exists before install. It then waits for a controller and for `shell-2.1.0` present with `shell-2.0.0` absent, and asserts that the shell keys equal `['shell-2.1.0']`.
  - With `sw.js` at 2.0.0, `SHELL_CACHE` is `shell-2.0.0` (`sw.js:6`). Install reuses the stale cache, and activate deletes only `shell-*` keys other than `SHELL_CACHE` (`sw.js:55`), so `shell-2.1.0` never appears, the 20 s `waitForFunction` times out, and the spec fails. That matches the builder's report of red at 2.0.0.
  - With `sw.js` at 2.1.0, activate deletes `shell-2.0.0`, and the spec passes.
- **Scope.** Criterion 7 run verbatim gives `c7=0`. `git status --porcelain --untracked-files=all --ignored` lists only the seven staged Output paths, with no node_modules link and no stray or ignored file. Behaviour is unchanged: the only code edits are the two VERSION literals.
- README keeps the "Plex Poster Display" line exactly once (`grep -c` gives 1).

## Declined to judge

- `Roadmap.md:124` "in addition to the user's own uploaded frame and marquee": the app today takes a custom image URL, not an upload. The phrase is the owner's own (D58 request), so whether to reword it is a product call.
- `Roadmap.md:267` "merge once validation passes": this line was already there before the phase and is not in the diff. Whether the owner merges now is D13's question.
- Where QR code (2.2 or 2.3) and Seasonal schedules sit in the Suggested order: D53 does not place them, and each entry states its own place. That is an editorial choice, not a contradiction.
- Criteria 4–6 (`npm test`, the e2e suite, check-precache): per the brief, the conductor ran these. I relied on the handback and did not rerun them.

## Recommendations

Fold issues 1–3 into one small Roadmap/README edit before the push. They are each one sentence. Route issue 4 to the owner (or rule it under D44) because it changes D60 or D64. Leave issue 5 for 2.1.x.

## Assessment

The version bump, the release spec, scope, the README untagging and the Roadmap transcription of D51–D71 all meet the phase. All five findings are Minor wording or order consistency points, and none changes behaviour or promises an unconfirmed item.

**Verdict:** APPROVE
