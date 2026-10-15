Agent: fixes-review-cold-r2 · model: claude-opus-5-5 · dispatched: 2026-10-15T00:23:19Z
Verdict: APPROVE

Reviewer: fixes-review-cold-r2 · Model: claude-opus-5-5 · Dispatched: 2026-10-15T00:23:19Z · Method: cold full re-review · Scope: limit-and-reload-fixes, r2, base 6363763, staged tree 156b877c0b257f2579607f63c659e6b9d63ffb92

## What I read and ran

- `git -C /home/nathan/wt-limit-and-reload-fixes diff --cached` (10 files, +285/-9). `git write-tree` gave the staged tree `156b877c`. It wrote one tree object to the object store and did not change the index or the working tree.
- I extracted that tree with `git archive 156b877c | tar -x -C $(mktemp -d)` into `/tmp/tmp.B6tThu42jJ`, a throwaway directory and not a worktree. I deleted it afterwards. Nothing in either checkout was modified. No node_modules link was made.
- `node --test tests/poster-cache.test.js tests/plex.test.js` in the extract: 71/71 pass.
- Mutation 1: deleted the `refreshRating` early return (`poster-cache.js:67`). Tests 28, 29 and 32 fail.
- Mutation 2: restored the pre-fix `put` rating (`poster.seriesRating || poster.contentRating || ""`). Tests 28, 29 and 32 fail.
- I reverted both mutations and checked with `diff` against `git show 156b877c:js/poster-cache.js` (identical).
- `node -e` on `ratings.allows`: `allows('PG', undefined)` = false, `('PG','')` = false, `('PG','TV-PG')` = true, `('PG','bogus')` = false, `('', undefined)` = true.
- I ran no e2e spec. Every claim below was settled by reading the code.

## Issues

1. **Minor**, `tests/e2e/content-rating.spec.mjs` (case 23, `offlineTitles` then `assert.ok(!seen.has(5))`). Unlike cases 10 and 20, the offline half never asserts `seen.size >= 2`. If the offline rotation stalls, `seen` holds one title and the "never shown offline" claim passes without testing anything. Concrete input: a slow host where 300 ms after `runFor(361_000)` is not enough for the cached draw, so `activeAlt` keeps returning the first title. The case still has teeth, because the earlier index assertion (`contentRating` stays `TV-MA`) fails with the fix reverted. Class: test quality, not a code bug. Fix: add `assert.ok(seen.size >= 2, ...)`, as in the sibling cases.

No Critical or Important issues.

## Checked and clean

**`contentRating` / `seriesRating` / `episodeRating`: every writer and reader.**
- Writer: `toPoster` (`plex.js:130-149`). `contentRating` is always the item's own. A non-empty string `grandparentContentRating` on an episode becomes `seriesRating`. Any other episode gets `episodeRating: true`. A movie or show gets neither flag.
- Callers of `toPoster`: `pickNowPlaying` (`plex.js:106`), the random pool (`:203`) and `items()`/static (`:210`, `:220`).
- Through `items()`, the D37 batched re-check (`engine.js:43-55`) asks for show keys. Those come back as `type: 'show'` with no flag, so `refreshRating` updates them as before. The fail-closed placeholder `{ ratingKey, contentRating: '' }` has no flag, so it still blanks the entry.
- Index writers: `put` (`poster-cache.js:52-54`) and `refreshRating` (`:66-73`).
  - An episode without a series rating keeps the show's stored rating. If the show was never stored, the entry gets `''`, which hides it under a limit (fails closed).
  - An empty `seriesRating` is falsy, so it never overwrites the stored rating.
  - The index is read after the `await cache.put`, so the stored rating is current at write time.
- Index readers: `random()` (`:112`), the empty-card check (`main.js:316-317`) and `lookup` (thumb and size only). Each reads only the stored `contentRating`.
- Live readers: `engine.permitted` (`engine.js:71`), `allowedOnScreen` (`main.js:122`) and the overlay meta (`display.js:255`). Each reads the episode's own `contentRating`, which is unchanged from the base.
- The extra fields on a poster object reach `engine.shown` (spread copy), the pin (`main.js:912`, which reads only `ratingKey` and `title`) and the export (settings only). None of these reads or serialises the new fields.
- Entries cached before 2.1 have `contentRating` undefined. `allows` returns false for them under a limit, and `put` with `episodeRating` turns `undefined` into `''`.

**`reloadPending = 'update'`.**
- Every assignment of `reloadPending`:
  - `main.js:433`: `skipReload` now preserves `'update'`.
  - `:453`: wake uses `||=`.
  - `:508`: scheduled uses `||=`.
  - `:1250`: `controllerchange`.
  - Wake and scheduled cannot overwrite a pending update. The `runDailyReload().catch(skipReload)` path cannot clear it either.
- `runDailyReload` (`:457-465`):
  - A pending update waits only on `reloadMustWait`, which covers any `dialog[open]` (Settings, Diagnostics, PIN, Shortcuts are all `<dialog>`, `index.html:73,343,357,381`), a busy or waking tick, a manual wake and a crossfade.
  - It runs once those clear, through the 1 s `dailyReloadTick`.
  - `reloading` and `reloadChecking` still guard re-entry.
- An update that arrives during a daily-reload probe: if the probe succeeds, the daily reload reloads into the new version anyway. If the probe fails, `skipReload` keeps `'update'` and the next tick reloads.
- A second update while one is pending sets the same value again, which is harmless.
- The base code (`!settingsUI.isOpen`) reloaded with the PIN dialog open and silently dropped an update that arrived while Settings was open. The new code fixes both.

**Provisioning marker** (`main.js:1404-1409`).
- `WHATS_NEW_KEY` is a `const` at `:1436`, but it is used only after `await readConfigJson()`, and `boot()` is called at `:1454`. There is no TDZ risk.
- The marker is written only when `provisionedSettings` returned settings, so a config.json that fails to provision falls through to `announceWhatsNew`, which handles an unconfigured install as before.
- The PIN reset (`:1412`) is independent of the marker.
- A stored 2.0 install (source not `defaults`) never reaches this branch, so it still gets the toast. The second preset case covers this.

**Empty card** (`main.js:315-318`).
- The card blames the limit only when a limit is set, the error is not fatal, the index is non-empty and no entry passes `allows`.
- An empty cache shows the real error. An index with allowed entries whose blobs are missing or unreadable also shows the real error, which is correct.
- Unrated 2.0 entries count as "limited", which is correct because they are hidden under a limit.
- `allows` is already imported (it is used at `:122`).

**New tests.** The mutations above show the unit tests catch a revert. By reading:
- status 'nothing cached' fails on the base, which gave the limit wording.
- preset K60 fresh fails on the base, which showed the toast.
- pi-stability 15 fails on the base, which reloaded under the PIN prompt. Its waits use the fake clock (`advance`) and are deterministic.
- content-rating 23 and 24 fail on the base, through `refreshRating` overwriting the show's rating.
- Case 24's `seen.has(2)` is deterministic: under PG only titles 1 and 2 are allowed, and `random()` excludes the current poster, so the rotation alternates.
- Case 25's live half guards against a regression and would also pass on the base.

## Declined to judge

- **Behaviour the diff did not change** (an update reload or a daily reload can still fire under the sleep veil or while the first-run sign-in code is on the card): both reloaded there before this change too. Outside the diff.
- **A loop guard for update reloads** (no 10-minute gap and no `storage.persistent` check): the base had none either. A loop would need a server that changes `sw.js` on every request. It is pathological and not new.
- **The pinned TV-PG test in `plex.test.js`**: it checks `allows` on the `toPoster` fields rather than the cache. That is a choice of test level. The cache side is covered in `poster-cache.test.js`.
- **An episode with no `grandparentRatingKey`**: it is keyed by its own `ratingKey` and is never refreshed by D37 when it lacks a series rating. It stays `''`, which hides it under a limit (fails closed). Plex sessions carry the key, so I treat this as theoretical.

## Recommendations

- Add the `seen.size >= 2` guard to case 23 (Issue 1).

## Assessment

The four fixes do what their code says. I found no input sequence that breaks them. The new fields are read only by the cache's rating writers, and every other consumer ignores them. A pending update can no longer be cancelled by the daily-reload path, and it waits for the same quiet moments.

Files read: the staged diff; in the extract, `js/main.js` (80-130, 185-245, 280-330, 395-520, 580-610, 1235-1275, 1378-1454), `js/engine.js` (30-130), `js/poster-cache.js` (42-130), `js/plex.js` (95-149), `js/ratings.js` (allows), `scripts/mock-plex.mjs` (grep), `tests/e2e/content-rating.spec.mjs` (helpers and cases 20/10/11/23-25), `tests/e2e/pi-stability.spec.mjs` (helpers), `tests/e2e/lib.mjs` (grep: clock, play), `index.html` (grep: dialog), `js/settings-ui.js` and `js/settings.js` (grep).

**Verdict:** APPROVE
