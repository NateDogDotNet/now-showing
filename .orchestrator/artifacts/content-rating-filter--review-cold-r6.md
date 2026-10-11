produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: content-rating-filter · round: r6 · mode: cold
**Verdict:** CHANGES REQUESTED

Reviewer: content-rating-filter-review-cold-r6 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T06:43:28Z · Method: cold phase review · Scope: content-rating-filter, r6, base HEAD e9394ec, tree a9da765

### Critical

(none)

### Important

1. **Importing settings in the dialog applies an unsaved pin, and Cancel leaves an above-limit poster on screen (code-bug)**
   - Location: js/main.js `applySettings` (the preview branch near line 425 and the re-check guard `if (!preview && ...)` near line 430), with `allowedOnScreen` (around line 82), which exempts `state.settings.staticRatingKey`. The trigger is js/settings-ui.js:252-260 (import then `onPreview(s)`) and :216-219 (Cancel then `onPreview(original)`).
   - What happens: a preview keeps the saved limit (`maxContentRating`, `limitNowPlaying`) but takes `staticRatingKey` from the form. `allowedOnScreen` treats that key as the pin exemption. An imported file that pins an R title therefore makes that title exempt before anything is saved. The engine also uses it, because `getSettings` returns `state.settings`, so the next tick draws it. On Cancel, the original settings come back as a preview, and previews skip the re-check ("A preview never changes the limit, so there is nothing to re-check"). The above-limit poster stays up with no pin and no stored change. With the pin gone, `decide()` returns null until rotation is due, which is `rotateSeconds`, up to 86400 s.
   - Evidence: I added a scratch case to tests/e2e/content-rating.spec.mjs in a throwaway worktree. It seeds the limit at PG-13, opens Settings, imports `{"staticRatingKey":"4","staticTitle":"Popcorn Skies"}` (title 4 is rated R), refreshes once, then clicks Cancel. Output:
     ```
     dialog open, unsaved import, on screen: 4
     after Cancel on screen: 4 stored pin: undefined limit PG-13
     ```
     The default settings (now playing on, 20 s poll) tick every 20 s, so the draw happens without a manual refresh too.
   - Why it matters: with a limit saved, an R poster is shown, and it stays after the adult has cancelled. The comment's claim that Cancel has nothing to undo for the limit is false: the limit's effect also depends on the pin, and the preview changes the pin.
   - Fix: in the preview branch, also keep `staticRatingKey` and `staticTitle` from `prev`, as is done for the limit. Better still, compute the pin exemption from the saved settings and not from `state.settings`. Run the `allowedOnScreen` re-check on every `applySettings` call, previews included. Add an e2e case for this sequence: import a pin, refresh, Cancel.

### Minor

1. **A corrupt or misspelt limit falls open, not closed (spec-gap; the code is outside the diff)**
   - js/settings.js `maxContentRating: ['', oneOf('', 'G', 'PG', 'PG-13', 'R', 'NC-17')]` turns any unknown value into `''`, which means no limit. An imported or hand-written config with `"maxContentRating": "PG13"` or `"pg-13"` silently switches the filter off. js/ratings.js documents "A limit that is not one of LIMITS allows nothing: a corrupt setting fails closed", but `allows()` never sees the corrupt value, because sanitize has already replaced it.
   - Fix: map a non-empty unknown value to the strictest limit (G), or reject the import with an error.
2. **Episode now-playing is judged by the episode's rating but shows and caches the show's poster (spec-gap, unverified against a real PMS)**
   - js/plex.js:99 and :112-118: for an episode the poster is `grandparentThumb`, the key is `grandparentRatingKey` (the show), and `contentRating` is the episode's own `m.contentRating`. If an episode carries a lower rating than its show, two things follow. Online, the show's poster passes the check. `cache.put` then writes the show's key with the episode's rating, which replaces any stored show rating, so the show's poster can come back from `cache.random` offline under that lower rating.
   - Fix: prefer `grandparentContentRating` when present, or the stricter of the two ratings.

### Declined to judge

- The pinned-poster exemption itself ("A pinned poster is always shown", index.html and `allowedOnScreen`): this is a product decision disclosed in the UI. I ruled only on the unsaved pin leaking through the preview (Important 1).
- The syntax of the Plex server-side `contentRating=` filter: the code treats it as an optimisation only and re-checks every poster on the client, so whether PMS honours it is not a safety question.
- Over-blocking of ratings that are valid but unmapped (`TV-Y7-FV`, `us/PG-13`, `NR`): they fail closed, which is safe. Whether to map them is a product question.

### Strengths

- Every route funnels through `allows()`: the random pool in the engine, now playing (when `limitNowPlaying` is on), `cache.random`, and `showPoster` both before and after the decode. The re-check after the decode runs in the same microtask chain as `display.show`'s layer swap, so no frame is painted between them.
- Fail-closed rules hold everywhere I looked: unrated, missing, or unmapped ratings and cache entries from before 2.1 are refused, and an unknown limit passed to `allows()` allows nothing.
- `forceAfter`, the block-before-frame-load ordering, and the 1 s retry after a refusal close the earlier race windows.
- The tests have teeth. Each mutation below was reverted afterwards:
  - `permitted = () => true` in the engine: 10 engine tests failed.
  - Inverting the `limitNowPlaying` default: 1 test failed.
  - Removing the `cache.random` filter: 5 poster-cache tests failed.
  - Making unrated ratings allowed in `allows()`: 11 tests failed.
  - Removing the re-check after the decode in `showPoster`: e2e case 18 failed with "title 4 was taken down after its decode (on screen: 4)".

### What I read and ran

- Files read: the `git diff --cached` of /home/user/wt-content-rating-filter (all files); js/settings.js, js/engine.js, js/display.js, js/poster-cache.js and js/main.js in full; js/plex.js lines 94-160; js/settings-ui.js lines 10-56 and 185-270; package.json; tests/e2e/run.mjs lines 1-60; tests/e2e/content-rating.spec.mjs lines 1-80, 528-560 and 735-758; the export list of tests/e2e/lib.mjs.
- Ran, in a scratch worktree under a `mktemp -d` directory in the session scratchpad (staged diff applied, `git write-tree` = a9da765; playwright linked from /home/user/wt-e2e-harness/node_modules):
  - `node --test tests/*.test.js`: 206/206 pass.
  - `E2E_PORT=20131 E2E_MOCK_PORT=20132 node tests/e2e/run.mjs content-rating`: all 18 cases pass in 1m25s.
  - The mutations listed under Strengths, each reverted, with the tree checked back to a9da765.
  - The scratch import-then-Cancel case (case 99), reverted.
- The worktree was removed afterwards. The live tree is unchanged (`git write-tree` = a9da765).
