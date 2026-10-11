produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: content-rating-filter · round: r7 · mode: cold
**Verdict:** CHANGES REQUESTED

Reviewer: content-rating-filter-review-cold-r7 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T13:00:30Z · Method: cold code review · Scope: content-rating-filter, r7, base HEAD e9394ec, staged tree 7989149 (write-tree 79891490e43c)

I found no route that shows an above-limit or unrated poster that is not a pin, apart from the narrow fade-out case in Minor 1. The child-safety guarantee holds. One functional regression blocks approval.

### Critical
(none)

### Important
1. **Saving after an import throws away the pin from the imported file, even though the dialog shows it as pinned.** (code-bug: a regression this change introduced)
   - Location: js/main.js `applySettings` preview branch (the `if (preview) { ... staticRatingKey, staticTitle } = prev` lines), together with js/settings-ui.js `read()`.
   - Cause: `read()` starts from `{ ...getSettings() }`, and the form has no `staticRatingKey`/`staticTitle` field. After an import, the preview resets `state.settings.staticRatingKey` to the saved value. So when the user presses Save, `read()` hands back the old pin, not the imported one. Before this change the preview stored the imported object as-is, so Save kept the imported pin.
   - Evidence: I added a scratch e2e case (scratch copy only). It saves PG-13, opens Settings, imports `{"staticRatingKey":"4","staticTitle":"Popcorn Skies"}` and presses Save. Output: `dialog pinned-title: Popcorn Skies` then `saved staticRatingKey: ""`.
   - Why it matters: the import silently loses part of the file. The UI says "Popcorn Skies" is pinned, and after Save nothing is pinned. The in-code comment says the pin must not take effect *before* it is saved, which implies it should take effect *on* Save. This fails closed, so it is not a safety leak.
   - Fix: keep the dialog's pending pin in settings-ui itself. `write()` sets it from `s` (which covers import), the unpin button clears it, and `read()` uses it instead of `getSettings()` for `staticRatingKey`/`staticTitle`. Add an e2e case: import a pin, Save, and assert it was stored and is now exempt.

### Minor
1. **An above-limit poster can stay visible while it fades out after a limit change.** (code-bug, narrow)
   - Location: js/main.js `applySettings` checks only `display.currentPoster`. js/display.js `show()` fades the previous layer out over `crossfadeMs`, which can be up to 10000 ms.
   - When it happens: the limit is saved within `crossfadeMs` of a rotation from poster A to poster B, and the new limit forbids A but allows B. A is not current, so it is never blocked. It goes on fading out at partial opacity for the rest of the fade.
   - Fix: when the check passes but the other layer still holds a poster, remove that layer's src or snap it hidden. Alternatively, apply `poster-blocked`-style `transition: none` to the inactive layer on every limit change.
2. **Cached rating metadata is never refreshed.** (spec-gap)
   - js/poster-cache.js stores `contentRating` only in `put()`. A `lookup()` hit does not rewrite the index entry.
   - If a title is re-rated in Plex (for example PG becomes R), the offline fallback keeps using the old cached rating until the entry is put again or evicted. This is rare, but the criteria do not say whether cached metadata has to follow rating changes.
3. **Now-playing episodes are checked against the episode's rating, but the poster shown is the show's.** (spec-gap)
   - js/plex.js `pickNowPlaying` uses `grandparentThumb`, while `toPoster` reads `m.contentRating` from the episode.
   - If an episode has no `contentRating`, it is treated as unrated and blocked. That fails closed, but it may block all TV now-playing.
   - If an episode is rated lower than its show, the show's poster appears under the episode's rating.
   - The criteria do not say which rating governs.

### Declined to judge
- **Corrupt settings JSON:** `load()` falls back to `defaults()`, which means no limit. I am not ruling on this. The token is lost too, so the app becomes unconfigured and shows nothing. The only exception is the legacy-key migration, and the legacy app had no limit anyway. The settings loader is outside the diff.
- **Rating mapping choices** (for example nl/9 mapping to PG, ca/R to NC-17, and unmapped values such as TV-Y7-FV, NR, Approved and `us/` prefixes being blocked): these are product rulings. Everything unmapped fails closed, which is the safe direction.
- **Whether the Plex server-side `contentRating=` filter syntax is correct:** I could not check this against a real server. The client re-checks every poster in `engine.decide` through `permitted()`, so a wrong syntax could only cause empty pools, not leaks.
- **An owner pinning a now-playing above-limit title while `limitNowPlaying` is off:** this is owner intent.

### Strengths
- The check is done in one place for each route:
  - `allows()` fails closed for an unknown limit and for unrated or unmapped values.
  - The engine filters both the pool and now-playing, whatever the server returns.
  - `cache.random` filters entries, and entries cached before this change (no rating stored) are excluded.
  - `showPoster` checks before and after the decode. No paint can happen between the class change in `display.show` and the continuation's re-check, because both run in the same microtask drain.
- `applySettings` blocks the poster on screen before `display.apply`, so a slow custom frame cannot delay the block. The preview and Cancel keep the saved limit and pin. When a tick is busy, a forced tick is queued.
- An invalid stored or imported limit is sanitised to PG-13. `limitNowPlaying` only exempts on an explicit `false`.
- The tests have teeth:
  - Mutating `allows()` so unrated passes makes 11 unit tests fail.
  - Removing the post-decode re-check in `showPoster` makes e2e case 18 fail.
  - Both mutations were reverted (the scratch `js/main.js` is byte-identical to the worktree again).

### What I read and ran
- I read the staged diff (`git diff --cached`) and these files it calls: js/display.js, js/main.js (tick, handleFailure, sleep, applySettings, settings wiring, togglePin), js/engine.js, js/plex.js (request, buildUrl, pickNowPlaying, toPoster), js/poster-cache.js, js/settings.js (sanitisers, load, save), js/settings-ui.js (write, read, Save, Cancel, import), tests/e2e/content-rating.spec.mjs (helpers, case 19, runner), tests/e2e/run.mjs, package.json.
- Scratch copy: `/tmp/tmp.jgZPEJCHcY`, made with `git checkout-index -a --prefix=` from the staged index. Nothing in the live worktree or index was modified.
  - `node --test tests/*.test.js`: 206 pass.
  - The content-rating e2e cases 1 to 19, run twice on ports 20533/20534: all PASS both times.
  - The scratch import-then-Save case (ports 20531/20532) gave the output quoted under Important 1.
  - Mutation runs: as listed under Strengths, on ports 20535/20536 for the e2e run.
- The scratch directory is removed after this review is written.

Files read: js/ratings.js, js/plex.js, js/engine.js, js/poster-cache.js, js/main.js, js/settings-ui.js, js/settings.js, js/display.js, scripts/mock-plex.mjs (diff), index.html (diff + grep), css/app.css (diff), sw.js (diff), tests/e2e/content-rating.spec.mjs, tests/e2e/run.mjs, tests/e2e/lib.mjs (grep), package.json
