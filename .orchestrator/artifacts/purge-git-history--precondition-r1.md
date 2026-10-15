Agent: purge-precondition-r1 · model: claude-opus-5-5 · dispatched: 2026-10-15T00:28:43Z
Verdict: PRECONDITIONS NOT MET

Method: anchored precondition review (orchestrator-reviewer) · Scope: purge-git-history, r1, target tip 86fc4d8 (tree f7a302d9), origin `NateDogDotNet/plex-poster-app`.
Read: the brief; `docs/integration-plan.md` §27 (criteria and Notes/hazards); `docs/decisions.md` D49, the D49 note, D52, D76; `.orchestrator/artifacts/purge-git-history--rehearsal-r1.txt`, `--plainclone-r1.txt`, `--security-review-r1.md`; `.orchestrator/artifacts/limit-and-reload-fixes--ac7-r2.json`; `.orchestrator/phases/limit-and-reload-fixes.md:11-57`; the two r2 review headers (grep for `156b877`).
Ran: read-only git commands in `/home/nathan/plex-poster-app`; read-only `gh api` GETs; one rewrite rehearsal in a throwaway clone at `/tmp/tmp.EsaulnqBP8` (`git clone --no-local` of the local repo, never of origin, no remote writes), deleted afterwards. `git status --porcelain` in the checkout was empty before and after. The leaked value was held only in a shell variable. Personal strings (the owner's surname, the four shared-server names) were held only in shell variables or in a list file inside that temp directory; they appear nowhere in this file.

The git/GitHub preconditions (items 1, 2, 3, 4, 5-tooling, 6) are met. The blocker is the D49 note's own goal: the run-time replace list as specified (the `%USERPROFILE%` path plus four server names) leaves the owner's full name in the rewritten tip and in history, in two other spellings. A rehearsal proves it (item 5). Because the push to the new public repository cannot be taken back, this has to be fixed before the approval pause.

## 1. Target commit

```
$ git branch --show-current ; git rev-parse --short HEAD ; git rev-parse HEAD
claude/intelligent-rubin-4vsi63
86fc4d8
86fc4d8986fc81c97578634215627a3f28013635
$ git ls-remote origin
ee6fbbe3fbcc9e1527decf4fa6f0ace31ea0fc14	HEAD
86fc4d8986fc81c97578634215627a3f28013635	refs/heads/claude/intelligent-rubin-4vsi63
ee6fbbe3fbcc9e1527decf4fa6f0ace31ea0fc14	refs/heads/main
13af5b02811af0dabc39ba4114fb4e754f44277b	refs/pull/1/head
$ git merge-base --is-ancestor 090d231 HEAD; echo $?      -> 0
$ git log --oneline 090d231..HEAD
86fc4d8 Close limit-and-reload-fixes (090d231); claim purge-git-history and dispatch its precondition review
$ git merge-base --is-ancestor ee6fbbe HEAD; echo $?      -> 1
$ git log --format='%h %p %s' -1 ee6fbbe
ee6fbbe 5c4a716 13af5b0 Merge pull request #1 from NateDogDotNet/claude/intelligent-rubin-4vsi63
$ git diff --stat 13af5b0 ee6fbbe                          -> (empty: identical trees)
$ git merge-base --is-ancestor 13af5b0 HEAD; echo $?      -> 0
$ git tag -l                                               -> (none; origin has no tags either)
```

- The origin tip equals the local tip (86fc4d8), one conductor commit after 090d231.
- **`main` (ee6fbbe) is NOT an ancestor of the tip. I am reporting this as the brief asks.** ee6fbbe is the GitHub merge of PR #1, with parents `5c4a716` (the token commit) and `13af5b0` (the PR head). Its tree is identical to 13af5b0, which *is* an ancestor of the tip. So main carries no content that the tip lacks. The only thing it adds is the merge commit itself. The rewrite handles this: the rehearsal mapped ee6fbbe to 82ef01c with the tree unchanged. The purge is not blocked by it. See Declined to judge for what Pages will serve.
- Refs on origin: 2 branches (`main`, `claude/intelligent-rubin-4vsi63`), 0 tags, and **only `refs/pull/1/head`** (→ 13af5b0, which reaches 5c4a716). `refs/pull/1/merge` does not exist. That is normal for a closed, merged PR. It does not change the plan, since deleting the repository removes `refs/pull/*` either way.
- Local-only branches `orch/limit-and-reload-fixes` (87cd9bf), `orch/release-bump` (4bc98ac) and `orch/rename-now-showing` (a189d2c) are not on origin and not ancestors of the tip (they are the pre-cherry-pick worktree commits). All three reach 5c4a716. A fresh clone of origin does not include them, so the rewrite never sees them. Step (7)'s re-sync has to delete them, or the conductor's checkout keeps the token object reachable.

## 2. Clean tree

```
$ git status --porcelain --untracked-files=all            -> (empty)
$ git status --porcelain --ignored
!! .playwright-mcp/      (ignored via .git/info/exclude:7; 13 MCP console/page logs; never pushed)
!! node_modules/
$ git worktree list
/home/nathan/plex-poster-app  86fc4d8 [claude/intelligent-rubin-4vsi63]
$ git stash list ; git notes list                         -> (empty)
```

Clean, with nothing uncommitted. This brief (`purge-git-history--brief-precondition-r1.md`) is already committed in 86fc4d8. There is a single worktree.

## 3. Suite green at the target

```
$ ac7-r2.json: cmd "npm test && npm run test:e2e && node scripts/check-precache.mjs", exit 0, 1015.28 s, launched true, stderr_tail ""
$ git rev-parse 87cd9bf^{tree}
156b877c0b257f2579607f63c659e6b9d63ffb92        (the worktree commit that 090d231 cherry-picks; phases/limit-and-reload-fixes.md:55)
$ git diff --stat 156b877c HEAD -- js sw.js scripts tests index.html css manifest.webmanifest package.json   -> (empty)
$ git diff --stat 156b877c HEAD -- package-lock.json                                                           -> (empty)
$ git diff --stat 156b877c HEAD -- . ':!.orchestrator'
 README.md | 2 +-   Roadmap.md | 4 ++++   docs/decisions.md | 13 +++   docs/handoff.md | 2 ++   docs/integration-plan.md | 6 +++---
```

The code paths at the tip are byte-identical to tree 156b877c. The only differences outside `.orchestrator/` are docs (README clone URL per D76, Roadmap, decisions, handoff, plan). Caveat: `ac7-r2.json` does not record the tree it ran on. Tying it to 156b877c relies on the trail: the phase record runs ac7-r2 in `../wt-limit-and-reload-fixes`, and both r2 reviewers recomputed that staged tree as 156b877c. I accept that chain. I did not run the suite.

For information: GitHub Actions CI runs 103 to 106 (e09b8b7…86fc4d8) still show `in_progress`. The last completed run (102, c13652e) was `success`. Deleting the repository discards them.

## 4. The leaked value

```
$ git log --all --oneline -- config.js
3a7b688 Rewrite as an installable, offline-capable progressive web app
5c4a716 first commit
$ (every commit in git rev-list --all, 124 commits incl. local orch/*) whose tree has config.js:   5c4a716 only
$ git log --all --format= --name-only | grep -iE 'config\.js' | sort -u    -> config.js   (no other path of that name, ever)
$ T=<PLEX_TOKEN from git show 5c4a716:config.js>   (len=20; never printed)
$ git grep -c -F "$T" HEAD ; echo $?                      -> (nothing) 1
$ grep -rlF "$T" <working tree, excl .git/node_modules>   -> (nothing)
$ git log --all -S"$T" --oneline
3a7b688 Rewrite as an installable, offline-capable progressive web app
5c4a716 first commit
$ (every commit tree grepped for the value)                -> 5c4a716 only
$ git log --all -F --grep="$T" --oneline                   -> (nothing: in no commit message)
$ git grep -q -F "$T" 13af5b0 ; echo $?                    -> 1
```

`config.js` (and the leaked value with it) exists only in 5c4a716's tree. 5c4a716 adds it. **3a7b688** is the one successor that removes it (`config.js | 10 -`). The value is in no tip file, no other commit's diff and no commit message.

## 5. Rehearsal still valid

```
$ ls -l /home/nathan/.local/bin/git-filter-repo
-> /home/nathan/.local/pipx/venvs/git-filter-repo/bin/git-filter-repo
$ git-filter-repo --version ; git filter-repo --version   -> a40bce548d2c (exit 0) both    (git 2.39.5, Python 3.11.2)
$ git ls-files | grep -iE 'replace|expressions|filter-repo|redact'
.orchestrator/artifacts/settings-sheet--mutation-k52-newer-code-replaces-r6.txt   (a mutation-test output, not a list)
$ git grep -l -E '==>' HEAD                                -> (nothing: no replace-text syntax committed)
```

- The tool is the same build the rehearsal used (a40bce548d2c). There are no new `config.js` paths since the 2026-10-13 rehearsal at e411e14, and none in all history. No replace list is committed.
- The rehearsal showed that a plain fresh clone turns both remote branches into local heads ("remotes left: 0"), so `git push --all` sends both. That still holds.
- **What changed since the rehearsal: the D49 note added `--replace-text`, and the rehearsal never exercised it.** I rehearsed it now, in `/tmp/tmp.EsaulnqBP8`: a fresh `--no-local` clone of the local repo, a list built as the note specifies (the `C:\Users\<First Last>` profile path extracted from `f6e1dc1`, plus the four shared-server names from `84cf765^`), and `git filter-repo --invert-paths --path config.js --replace-text <list>`:

```
filter_exit=0 ; config.js commits after: 0
list line len=23 (profile path): git log --all -F -S hits after = 0
four server-name lines: 0 / 0 / 0 / 0
surname (case-insensitive) in rewritten tip files: 2 ; commits whose tree still has it: 58
  HEAD:.orchestrator/artifacts/purge-git-history--security-review-r1.md
  HEAD:.orchestrator/artifacts/real-server-validation--home-play-r1.txt
tip tree before f7a302d934680a72662e17980c6c574431b8f17d  after f7a302d934680a72662e17980c6c574431b8f17d  (unchanged)
```

  Across all history the full name appears in three spellings (counts are file-in-commit occurrences, masked):
  - `C:\Users\<F> <S>\pl…` ×148. The `%USERPROFILE%` line catches this one.
  - `C:/Users/<F>%20<S>/pl…` ×58. **Not caught.** It is still at HEAD in `real-server-validation--home-play-r1.txt:22`. Commit 9507326 ("Mask the validation host's user-profile path") masked the two backslash lines and missed this URL-encoded `file:///` line, so the D49 note's "masked at HEAD" is false for it.
  - `-E '<F>|<S>'` ×20. **Not caught.** It is at HEAD in `purge-git-history--security-review-r1.md:14`: the security review that raised the finding wrote the owner's first name and surname, unmasked, into its own `git grep` command line (commit 409ae22).
- The four shared-server names are fine: 0 tip files, present only in f6e1dc1, 5c664af and 84cf765, and the rehearsal removes them. Caution: with the ` (shared)` suffix stripped, one name is 4 characters. A literal that short is replaced wherever it occurs in any blob of any commit. The tip tree came out unchanged, but use the exact option strings (with the suffix) so it cannot hit anything else.
- **The D49 note's added criterion-1 check is vacuous.** `test -z "$(git -C "$d/fresh" log --all -S"$(cat <replace-list>)" --oneline)"` passes `-S` a single five-line string, which no blob contains. It returned 0 hits in the rehearsal, and it would return 0 even with no rewrite at all. Run the check once per line instead (see item 7).
- Also, the plan's §27 text was not updated as the D49 note says: hand-off step (3) still lacks `--replace-text`, and criterion 1 lacks the extra check. Only the decision log carries them.

## 6. GitHub preconditions

```
$ gh auth status
  Logged in to github.com account NateDogDotNet ; Token scopes: 'delete:packages', 'delete_repo', 'gist', 'read:org', 'repo', 'workflow', 'write:packages'
$ gh api repos/NateDogDotNet/plex-poster-app
  visibility public, fork false, forks_count 0, open_issues_count 0, stargazers_count 0, watchers 0, subscribers 0,
  has_wiki true, has_pages true, default_branch main, homepage https://natedogdotnet.github.io/plex-poster-app/, archived false
$ /hooks -> 0 ; /actions/secrets -> 0 ; /actions/variables -> 0 ; /releases -> 0 ; /tags -> 0 ; /forks -> 0 ; /keys -> 0 ; /rulesets -> 0
$ /collaborators -> 1 (NateDogDotNet) ; /actions/artifacts -> 0
$ /pulls?state=all -> #1 closed, merged 2026-10-11T22:08:00Z, claude/intelligent-rubin-4vsi63 -> main
$ /issues?state=all -> only #1 (the PR), 0 comments
$ /pages -> status built, build_type legacy, source {"branch":"main","path":"/"}, html_url https://natedogdotnet.github.io/plex-poster-app/, https_enforced true
$ /pages/builds/latest -> built from ee6fbbe, 2026-10-11T22:08:01Z
$ /environments -> github-pages (deployment branch policy: custom, branch "main"); /deployments -> 2
$ /actions/runs -> 107 runs (CI workflow .github/workflows/ci.yml)
$ gh repo view NateDogDotNet/now-showing   -> GraphQL: Could not resolve to a Repository ... (exit 1)
$ gh api repos/NateDogDotNet/now-showing   -> 404 Not Found
```

The `delete_repo` scope is present. Nothing would be lost beyond what D49 lists: PR #1, the Pages setting, the `github-pages` environment and its deployments, and Actions run history. The wiki is enabled; whether it has pages cannot be read through the API, but D49 says it has none. The name `now-showing` is free.

## 7. The exact commands (for the owner to read; not run)

`<PROFILE>` is the Windows `%USERPROFILE%` of the validation host (`C:\Users\<First Last>`). `<SERVERS>` are the four shared-server option strings from the C05 row. Both are built at run time into a file outside the repository and deleted at the end. The three lines marked NEW are this review's fix (see Blockers).

```bash
set -euo pipefail
OLD=NateDogDotNet/plex-poster-app ; NEW=NateDogDotNet/now-showing
W=$(mktemp -d) ; L=$(mktemp)                                    # both outside the repository

# 0. (NEW, before anything below) a conductor commit masks HEAD's two remaining spellings
#    (real-server-validation--home-play-r1.txt:22 and purge-git-history--security-review-r1.md:14), pushed to OLD.

# 1. backup
git clone -q --mirror "https://github.com/$OLD.git" "$W/backup.git"

# 2. replace list (never committed, never printed)
printf '%s\n' '<PROFILE>' > "$L"                                 # C:\Users\<First Last>
printf '%s\n' '<PROFILE as C:/Users/<First>%20<Last>>' >> "$L"   # NEW: the file:/// spelling
printf '%s\n' '<First>|<Last>' >> "$L"                           # NEW: the security review's grep pattern
printf '%s\n' '<SERVERS: 4 lines, exact option strings>' >> "$L"

# 3. rewrite in a plain fresh clone
git clone -q --no-local "$W/backup.git" "$W/work"
git -C "$W/work" filter-repo --invert-paths --path config.js --replace-text "$L"
cp "$W/work/.git/filter-repo/commit-map" "$W/commit-map"        # audit trail
# verify before anything irreversible:
test -z "$(git -C "$W/work" log --all --oneline -- config.js)"
while IFS= read -r s; do s=${s%%==>*}; test -z "$(git -C "$W/work" log --all -F -S"$s" --oneline)"; done < "$L"   # per line, not $(cat)
git -C "$W/work" fsck --no-dangling
git -C "$W/work" for-each-ref refs/heads                         # expect main and claude/intelligent-rubin-4vsi63

# 4. POINT OF NO RETURN 1: delete (PR #1, refs/pull/1/head, Pages, Actions history gone for good)
gh repo delete "$OLD" --yes

# 5. create and push. POINT OF NO RETURN 2: once this push lands, its content is public under the new name
gh repo create "$NEW" --public
git -C "$W/work" remote add origin "https://github.com/$NEW.git"
git -C "$W/work" push origin --all
git -C "$W/work" push origin --tags
gh repo edit "$NEW" --default-branch main

# 6. Pages and homepage
gh api -X POST "repos/$NEW/pages" -f 'source[branch]=main' -f 'source[path]=/'
gh repo edit "$NEW" --homepage https://natedogdotnet.github.io/now-showing/
# wait for the build, then load https://natedogdotnet.github.io/now-showing/

# criterion 1 (and the D49 check, per line) against the new origin
d=$(mktemp -d) && git clone -q "https://github.com/$NEW.git" "$d/fresh" \
  && test -z "$(git -C "$d/fresh" log --all --oneline -- config.js)" \
  && test -z "$(git ls-remote "https://github.com/$NEW.git" "refs/pull/*")"
while IFS= read -r s; do s=${s%%==>*}; test -z "$(git -C "$d/fresh" log --all -F -S"$s" --oneline)"; done < "$L"

rm -f "$L"     # the list goes; keep $W/backup.git somewhere safe and offline

# 7. re-sync the conductor checkout (fetch --prune --force from NEW, reset each branch,
#    delete local orch/* branches, which still reach 5c4a716), record Purged: yes (step 9),
#    then as the LAST act: mv /home/nathan/plex-poster-app /home/nathan/now-showing && git worktree repair
```

## Blockers

1. **(Critical, spec-gap) The replace list in the D49 note does not remove the owner's full name, which is what it exists to do.** Location: `real-server-validation--home-play-r1.txt:22` (`file:///C:/Users/<F>%20<S>/…`, 58 commit-file occurrences) and `purge-git-history--security-review-r1.md:14` (`'<F>|<S>'`, 20 occurrences), both at HEAD. Evidence: the item-5 rehearsal left the tip tree unchanged (f7a302d9 → f7a302d9), with the surname in 2 tip files and 58 commits. Why it matters: the push to `now-showing` is the moment the history is republished, and re-cleaning afterwards means another delete and re-create. The criteria and the D49 note are what is incomplete, not an implementation, so this is a spec-gap. Fix: first mask both HEAD lines in a conductor commit, so the rewritten tip carries no name. Then add the two spellings to the run-time list: the forward-slash `%20` form of `%USERPROFILE%`, and `<First>|<Last>`. Or use the bare surname as one literal: across all history it occurs only in these three spellings and four `.orchestrator/artifacts` files. Re-run the per-line check afterwards.
2. **(Important, spec-gap) The D49 note's criterion-1 extension cannot fail.** `-S"$(cat <replace-list>)"` searches for one multi-line string. Rehearsal: 0 hits, the same result as no rewrite. Fix: loop over the list one line at a time, as in item 7. Also bring §27's hand-off step (3) and criterion 1 into line with the D49 note: the plan text still has neither.

Not blockers, but the conductor should act on them:
- Step (7) must delete the local `orch/*` branches, which reach 5c4a716.
- Set the default branch to `main` explicitly after `push --all` (included in item 7).
- Use the exact server option strings: one bare name is 4 characters.

## Declined to judge

- **What the new Pages site serves.** Pages builds from `main` (ee6fbbe, tree = 13af5b0, the 2026-10-11 PR #1 state). That predates the 2.1.0 release, the rename and D76's README change, all of which exist only on `claude/intelligent-rubin-4vsi63`. After re-creation, `https://natedogdotnet.github.io/now-showing/` will serve that older app. Whether to merge or fast-forward the branch into `main` before the purge is a release/product question for the owner. It is outside this phase's criteria and does not affect the rewrite.
- **Other personal data the security review recorded as below threshold** (the owner's server name "Castle Anthrax", a private LAN address, viewing history). The owner's ruling under D49 covers only the profile path and the four shared-server names. I did not test the other strings.
- **GitHub Support cache purge for 5c4a716** (step 8): optional and outside the commands.

Verdict: PRECONDITIONS NOT MET
