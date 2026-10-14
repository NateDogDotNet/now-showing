Agent: rename-review-r1 · model: claude-opus-5-5 · dispatched: 2026-10-14T20:38:28Z
Verdict: APPROVE

Reviewer: rename-review-r1 · Model: claude-opus-5-5 · Dispatched: 2026-10-14T20:38:28Z · Method: anchored phase review · Scope: rename-now-showing, r1, base 5bd76c3, staged tree 306b43e9bf293dbc4e2eb008ae6f6ea33c1cc71e

## What I read and ran

Read: the brief `.orchestrator/artifacts/rename-now-showing--brief-review-r1.md`; plan phase 29 in `docs/integration-plan.md`; D52 and D55 in `docs/decisions.md` (lines 141, 152); the builder brief `.orchestrator/artifacts/rename-now-showing--brief-r1.md`; the full staged diff (`git -C /home/nathan/wt-rename-now-showing diff --cached`); `tests/e2e/ui-rotation.spec.mjs` (whole measure function); `css/app.css` (lines 1-34, 125-146); `js/main.js:688-698` (showEmpty); `js/plex.js:140-152, 222-245`; `js/util.js:43-51` (clientId); README.md:280-295.

Ran: I exported the staged diff, made a detached worktree at 5bd76c3 under `mktemp -d` (`/tmp/tmp.hUi9VlqEtH/wt`), ran `git apply --index`, and confirmed that `git write-tree` equals the staged tree 306b43e9 (TREE-MATCH). In that worktree I ran criteria 1, 2 and 3, `node scripts/check-precache.mjs`, `npm test` (unit tests only) and `node --check` on the spec. I then removed the worktree (`git worktree remove --force` and `rm -rf`). The brief told me not to run the e2e suite, so I did not run criteria 4 (the e2e part) or 5. My conclusion on the D55 fix rests on reading the code and the CSS, not on a run, and the mutation test is not done.

Results (worktree at the staged tree):
- c1: exit=0
- c2: `! git grep -n 'Plex Poster Display' -- . ':!docs/' ':!.orchestrator/' ':!README.md'` exit=0. README count=1 (`test … -le 1` exit=0)
- c3: exit=0 (all seven plexPoster.* keys are present in js/, and `shell-${VERSION}` is in sw.js)
- `node scripts/check-precache.mjs` printed "31 precached files OK" and exited 0
- `npm test` gave 327 tests, 327 passed, 0 failed
- `node --check tests/e2e/ui-rotation.spec.mjs` exited 0

## Check 1: user-visible "Plex Poster Display" outside docs/

Command: `git grep -n -i -E 'plex poster|poster display|plex-poster|"Posters"|Posters<' -- . ':!docs/' ':!.orchestrator/' ':!node_modules'`. The only remaining hits are:
- README.md:3, the single "Formerly Plex Poster Display" line. Criterion 2 allows it.
- README.md:157, the repository URL `plex-poster-app`. D52 keeps this.
- README.md:291 `Name=Poster Display` and the path/unit name `poster-display`. These are not the old product name. See Declined.
- index.html:13 `apple-mobile-web-app-title content="Posters"`. See finding 1.
- js/poster-cache.js:6 `plex-posters-v1`, a cache name that is never shown to the user.
- js/settings-ui.js:503 `plex-poster-settings.json`, the export filename. See Declined.
- js/settings.js:5 and the tests, which hold the EXPORT_FORMAT string. D52 keeps it.

`assets/` holds only PNGs and `icons/icon.svg`. `grep -rn -i '<title' assets/` found nothing. `grep -rn -i -E 'poster ?display|plex-poster' sw.js .github scripts assets` found nothing outside the serve.mjs line that was already changed. The diff changes everything else D52 lists: title, h1, manifest name and short_name, PRODUCT, the serve.mjs start line, package.json and both lockfile names, the README and Roadmap titles, and the systemd Description.

## Check 2: nothing D52 keeps was changed

`git diff --cached 5bd76c3 -- js/settings.js js/util.js sw.js tests/settings.test.js tests/e2e/kiosk.spec.mjs | wc -l` returned 0. `git diff --cached 5bd76c3 | grep -nE '^[-+].*(plexPoster\.|VERSION|EXPORT_FORMAT|clientId|plex-poster-display/settings|"version")'` found no lines (grep exit 1). The package.json and lockfile `version` lines still read 2.0.0, and the diff only shows them as context.

## Check 3: the D55 race fix

`tests/e2e/ui-rotation.spec.mjs:43-58`: `read(selector, reveal)` now unhides `#empty`, calls `getBoundingClientRect()`, reads `getComputedStyle(el).transform` and hides the element again, all inside one synchronous `page.evaluate` callback. `showEmpty(false)` (`js/main.js:692`) runs on the page's main thread, so it cannot run in the middle of that callback. That removes the race D55 describes. The spec still measures the empty card at every rotation and in both rotateUi modes: `measure()` is called once per case and line 76 always runs. The asserts at lines 119-123 (shown, angle == rotation, inside the viewport) are unchanged, and so is the rotateUi-off loop.

Could the transform be caught mid-transition? `.empty-card` has `transform: rotate(var(--ui-rotation)); transition: transform 0.5s ease` (css/app.css:137-138). It sits inside `#empty`, and `[hidden] { display: none !important; }` (css/app.css:34) hides that. An element that was `display:none` has no before-change style, so making it visible does not start a transition (CSS Transitions §3). The computed value is therefore the final `rotate(<ui-rotation>)`. `--ui-rotation` is an unregistered custom property, so it does not animate either. The page had also settled before this point (`document.getAnimations().length === 0`, line 28). The old code made the same unhide-then-read sequence across two evaluates, so the new code is no weaker. I did not confirm this in a browser because of the e2e restriction. Criterion 5's three green runs are still owed by the conductor or builder evidence.

## Check 4: Plex service wording, and the README "Formerly" line

The diff touches no sentence about the Plex service or server. index.html:7 and manifest:4 still say "Full-screen Plex movie poster display…", and the empty-card message still says "Connect to your Plex server". These were correctly left alone: they describe the service, and they are not the product name.

Does sign-in carry over? The client identifier comes from `js/util.js:43-50` (key `plexPoster.clientId`, a random UUID). It is not derived from PRODUCT. PRODUCT is used only as the `X-Plex-Product` and `X-Plex-Device-Name` header values (js/plex.js:148, 235, 237). `grep -rn PRODUCT js tests scripts` finds no stored value keyed on it. The token lives in `plexPoster.settings`, which is unchanged. So "Stored settings and sign-in carry over unchanged" (README.md:3) is accurate. The rest of that line covers the phase's Notes/hazards item: older displays keep their old entry until they sign in again.

## Check 5: scope

Staged paths: README.md, Roadmap.md, index.html, js/plex.js, manifest.webmanifest, package-lock.json, package.json, scripts/serve.mjs, tests/e2e/ui-rotation.spec.mjs. All nine are in Output. `git status --short` also shows `?? node_modules`. This is a symlink to `/home/nathan/plex-poster-app/node_modules` (`ls -ld`). It is not staged. `.gitignore`'s `node_modules/` does not match it because a trailing-slash pattern skips symlinks. Do not stage it and remove it before commit. It is not a finding against the change.

## Strengths

- The rename is small and exact. D52's list is fully covered, and everything D52 keeps has a zero-line diff.
- The D55 fix is minimal and confined to the spec. It adds no wait or retry that could hide a real regression, and the assertions are unchanged.
- The README "Formerly" line combines the one permitted mention of the old name with the Authorized Devices note the Notes ask for.

## Issues

1. **Minor · spec-gap**, index.html:13 `<meta name="apple-mobile-web-app-title" content="Posters" />`.
   - Evidence: the grep in Check 1 above.
   - Why it matters: the diff changes manifest `short_name` from "Posters" to "Now Showing". This meta tag is the iOS/Safari counterpart of short_name: it sets the label under the home-screen icon. So an iPad added to the home screen will be labelled "Posters" while Android and Chromium show "Now Showing". D52 names only the manifest `name` and `short_name`, and criteria 1 and 2 check only for "Plex Poster Display". The change therefore meets the plan as written, but the plan is silent on this second short-name source.
   - Fix (if the conductor accepts it): set the tag to "Now Showing". index.html is already in Output.

## Declined to judge

- **The README's claim that old displays keep their "Plex Poster Display" entry until they sign in again.** This repeats the plan's Notes/hazards item. Whether plex.tv updates a device's product name when an existing client identifier later sends a different `X-Plex-Product` (for example on `/api/v2/resources` during server discovery) cannot be tested offline. This is plex.tv behaviour. It fits a (verify) row under convention 9, and it is not a defect in the diff.
- **`js/settings-ui.js:503`, export filename `plex-poster-settings.json`.** The user sees this name, but it is not the old product name, the file is outside this phase's Output, and D52 does not mention it. It is a product question for the owner.
- **README.md:287-291, `poster-display.desktop` / `Name=Poster Display` and the `poster-display.service` unit and directory names.** D52 asks only for the systemd Description, which the diff changes. Renaming install paths or unit names would break existing Pi setups, so that is the owner's call.
- **The GitHub repository and Pages URL (criterion 6, narrated).** Unchanged: README.md:157 still points to `plex-poster-app`. That is correct under D52.

## Recommendations

- The conductor should run criterion 5 (three ui-rotation runs) and the full criterion 4 once the machine is free. This review did not run them.
- Decide on finding 1. Accepting it costs a one-line edit.

## Assessment

The change does what phase 29 and D52 ask. It honours every exclusion in D52. It fixes the D55 race without weakening the empty-card check. Criteria 1-3 and the precache and unit parts of criterion 4 pass on the exact staged tree. The one finding is a Minor spec-gap and does not block.

**Verdict:** APPROVE
