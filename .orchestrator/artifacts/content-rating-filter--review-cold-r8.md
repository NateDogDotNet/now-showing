produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: content-rating-filter · round: r8 · mode: cold
**Verdict:** CHANGES REQUESTED

Reviewer: content-rating-filter-review-cold-r8 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T14:08:29Z · Method: cold phase review · Scope: content-rating-filter, r8, base HEAD af55616, staged tree a1a3b84

### Critical

(none)

### Important

1. **A cached title that was re-rated upward keeps its old rating, and is shown offline under the limit.** (code-bug)
   - Location: `js/main.js:201` (`cache.refreshRating(decision.poster)`) is the only caller of `js/poster-cache.js` `refreshRating`. `decision.poster` comes from `engine.decide()`, which drops any random or now-playing poster that `allows()` rejects (`js/engine.js:84`, `:94`). The pool request also asks Plex for allowed ratings only (`js/plex.js:366`). So while a limit is set, a title whose real rating is now above it never becomes a decision, and its cached rating is never corrected. The correction can only make a stored rating *more* permissive, or fix titles that were going to be shown anyway. It never fixes the case that matters: stored PG, now R. The refresh would also have to run while the limit is set, and it doesn't.
   - Evidence: I added a probe case to my scratch copy of `tests/e2e/content-rating.spec.mjs`. With no limit, cache all 8 titles. Set title 4's index entry (really R) to `PG`, as if it had been cached before a re-rating. Save PG-13, reload, then do 30 online refreshes. Mock goes down, then 30 offline rotations. Output: `PROBE: after 30 online refreshes under PG-13 stored rating of 4 = PG; offline shown: 1,2,3,4,6`. So the R title was drawn offline under PG-13. The existing case 22 (C7M2) runs with no limit set (`seed({ randomPoolSize: 4 })`), so it cannot catch this.
   - Why it matters: the brief puts stale and re-rated cache entries in scope. The offline fallback then shows an above-limit poster, and no owner action caused it.
   - Fix: re-validate cached entries while online and a limit is set. One way: after each successful pool load, fetch metadata for every cached ratingKey that has not been confirmed in the last N minutes (`/library/metadata/<k1,k2,...>`, or `client.item`) and call `refreshRating` with the result. Delete entries whose metadata is gone. Another way: drop any cached entry not confirmed since the limit was last changed. Also call `refreshRating` for every pool and session item seen, not just the chosen one. Add an e2e case like the probe above: limit set, stale permissive rating, online, then offline. It must never draw the title.

### Minor

1. **`limitNowPlaying` off shows above-limit now-playing titles, but the help text says above-limit posters are never shown.** (spec-gap)
   - Location: `index.html:37`, `index.html:39`, `js/main.js:136`, `js/engine.js:84`. If the owner unticks "Apply the limit to what's playing right now", an R or unrated now-playing poster is drawn and stays on screen under the limit. The help line just below still says "Posters rated above the limit are never shown ... A pinned poster is always shown."
   - Why: the brief names "the currently playing title" as covered and names only an owner-saved pin as exempt. The opt-out is owner-controlled and on by default (`settings.js` schema `limitNowPlaying: [true, bool]`, which existed before this change), so this is not fail-open. It is still a second exemption the stated rule doesn't mention, and the UI text contradicts it.
   - Fix: either rule the opt-out out of the guarantee and change the help text to name both exceptions, or remove the opt-out.

2. **When Plex sends an episode without `contentRating`, it fails closed and shows nothing.** (spec-gap, no action needed for safety) `toPoster` reads only `m.contentRating` (`js/plex.js:118`). If Plex leaves the field off an episode, a now-playing episode of a G show is hidden. That is the safe direction. I only mention it as a possible usability gap.

### Declined to judge

- Whether the rung mappings in the country table (for example `ca/R` = NC-17, `nl/9` = PG, `au/M` = PG-13) are the right policy. This is a product and regulatory question. Every unmapped or unknown value fails closed (`ratingRank` returns null, so `allows` returns false), which I verified by reading `js/ratings.js:31-49`.
- The exact Plex server filter syntax (`contentRating=a,b,...`). The code itself says it is unverified. It is not load-bearing: the engine re-checks every poster, and if the server ignores the filter it only wastes bandwidth.

### Strengths

- `allows()` fails closed for unknown limits, unrated titles, unmapped strings and non-string input. `sanitize` maps a corrupt stored limit to PG-13, not to ''.
- One gate (`allowedOnScreen`) is checked at draw time, both before and after the decode. `applySettings` checks it again on every apply, previews and Cancel included, before the possibly slow frame load. In-flight downloads, heal re-downloads, decodes and crossfades are covered. `display.show` keeps the incoming layer inactive until the decode settles, and the post-decode check runs in the same microtask chain as the layer becoming active, so the title never paints first.
- Preview never applies the limit or the pin. `pendingPin` stops an imported pin from becoming the exemption until Save.
- The offline fallback filters by stored rating, skips pre-2.1 entries that have no rating, and bounds retries on undecodable entries.
- The tests have teeth. I made `allows` treat unrated as allowed and 11 unit tests failed. I removed the post-decode re-check in `showPoster` and e2e case 18 (C4I1) failed. I reverted both mutations, and the scratch copy was then byte-identical to the live tree (`diff -q`).

### What I read and ran

- Read: `git diff --cached` (all of it except the test bodies). In full or in part: `js/engine.js`, `js/display.js` (show), `js/main.js` (applySettings, settingsUI wiring), `js/settings-ui.js` (preview, cancel, import, unpin), `js/poster-cache.js` (random), `tests/e2e/content-rating.spec.mjs` (cases 4 and 22, seed, run harness), `tests/e2e/run.mjs` (head).
- Ran, in a scratch copy at `/tmp/tmp.t4X1OKrFW7` (made with `mktemp -d` and `git checkout-index -a --prefix`, playwright symlinked from `/home/user/wt-e2e-harness/node_modules`, removed afterwards):
  - `node --test tests/*.test.js`: 209 passed, 0 failed.
  - `E2E_PORT=21230 E2E_MOCK_PORT=21231 node tests/e2e/run.mjs content-rating`: all cases passed.
  - Probe case 99 on ports 21240/21241 (output quoted above).
  - Two mutations, one in `ratings.js` and one in `main.js` on ports 21250/21251, both reverted.
- I did not modify the live worktree. `git status --short` showed only the staged files.

Files read: js/engine.js, js/display.js, js/main.js, js/settings-ui.js, js/poster-cache.js, js/settings.js (grep), tests/e2e/content-rating.spec.mjs, tests/e2e/run.mjs, package.json, git diff --cached output.

**Verdict:** CHANGES REQUESTED
