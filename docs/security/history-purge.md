# History purge receipt

Purged: yes
Date: 2026-10-15
Method: delete and re-create the GitHub repository with rewritten history (D49, D76, D77)

What was rewritten: every commit of both branches (`main`, `claude/intelligent-rubin-4vsi63`), 128 commits, with
`git filter-repo --invert-paths --path config.js --replace-text <list>`. `config.js` (the leaked Plex token, formerly
commit 5c4a716) is in no commit. The replace list (20 entries, built at run time outside the repository and deleted
afterwards) removed the token value, every spelling of the validation host's user-profile path, the owner's surname and
four shared-server names from every blob; the tip trees of both branches are byte-identical before and after.

Repository: `NateDogDotNet/plex-poster-app` was deleted (with pull request #1 and its `refs/pull/1/head`, which kept
the token commit reachable) and `NateDogDotNet/now-showing` created empty and pushed (`--all`, `--tags`); default
branch `main`; GitHub Pages re-enabled from `main` `/` at https://natedogdotnet.github.io/now-showing/. GitHub does
not redirect a deleted repository: displays pointed at the old address must be re-pointed once.

Checks after the push, from a fresh clone of the new repository: no `config.js` in any commit, no `refs/pull/*`,
every replace-list entry absent from the whole history (per line), `git fsck --no-dangling` clean. Evidence:
`.orchestrator/artifacts/purge-git-history--run-r1.txt`, `--ac1-r1.json`, `--ac3-r1.json`; the precondition review
`purge-git-history--precondition-r1.md` and the two local rehearsals `--rehearsal-r1.txt`, `--rehearsal-r2.txt`.

Kept outside the repository, by the owner: a mirror backup of the old repository and the filter-repo commit map
(old SHA → new SHA), in a private directory on the conductor's host, until the owner says delete. Anyone who cloned the
public repository before 2026-10-15 keeps the old history; the token itself was rotated and rejected on 2026-10-14
(`docs/security/token-rotation.md`), which is what removed the risk.
