# purge-git-history

- Mode: hitl        Tags: irreversible        Blocked by: rotate-plex-token, release-bump, limit-and-reload-fixes (D73)
- Agent type: none (hitl; the owner runs the force-push, plan criterion 4)
- Claimed: 2026-10-15T00:28:43Z (every blocker done: rotate-plex-token debe086, release-bump 1450d71, limit-and-reload-fixes 090d231)
- Dispatched: n/a        Re-dispatches: 0        Inner revision rounds: 0
- Last verification: 2026-10-13T16:45:10Z (rehearsal)
- Commit(s): 3efea7c — the receipt (on the rewritten history)

## Pre-claim preparation

### Rehearsal r1 — 2026-10-13T16:45:10Z, conductor-2
Reason: the owner asked for it ("do the purge rehearsal now", 2026-10-13). It runs before the phase is claimed so that anything it finds can be fixed or asked before the irreversible action (skill Step 7). Nothing was pushed to GitHub. The force-push went to a local bare stand-in for origin, and the leaked value was only counted, never printed (`grep -c` of the value over the log → 0).

- Script `artifacts/purge-git-history--rehearsal-r1.sh`, output `artifacts/purge-git-history--rehearsal-r1.txt`. It runs plan steps 1, 3, 4 and 5 against a `--mirror` backup of origin, then plan criteria 1 and 3 verbatim, from a clone whose origin is the stand-in.
- Script `artifacts/purge-git-history--plainclone-r1.sh`, output `artifacts/purge-git-history--plainclone-r1.txt`. It runs plan step 3 literally, in a plain fresh clone.

Results:
- PROBE: backup mirror of origin → refs: claude/intelligent-rubin-4vsi63 e411e14, main ee6fbbe, refs/pull/1/head 13af5b0; 59 commits; 1 commit tree and 1 blob hold the leaked value — meets criterion 4 (precondition evidence)
- PROBE: `git filter-repo --invert-paths --path config.js` in a fresh clone → exit 0; both branches rewritten (main 82ef01c, claude/intelligent-rubin-4vsi63 65e834b); 0 commits, 0 blobs hold the value; 0 commits touch config.js — meets criterion 1 (on branches)
- PROBE: the tip trees before and after are identical on both branches (9c304885644f, 5c04ed041abd), so no file content at any tip changes — meets criterion 4 (precondition evidence)
- PROBE: plain fresh clone (plan step 3 as written) → filter-repo turns origin/* into local branches and removes the remote, so `git push --force-with-lease --all` covers both branches — meets criterion 4 (precondition evidence)
- PROBE: plan criterion 1 verbatim against the stand-in → exit 0 — meets criterion 1 as written
- PROBE: plan criterion 3 verbatim → exit 0 — meets criterion 3
- PROBE: after the push, the stand-in still holds 1 commit and 1 blob with the value, through `refs/pull/1/head` → 13af5b0, which reaches 2 config.js commits. A plain clone fetches only branches, so criterion 1 cannot see it. GitHub does not accept pushes to `refs/pull/*` — fails the phase's goal ("remove config.js from every commit"); a spec-gap, asked before the action (FOLLOW-UP below) — fails criterion 1 as then written (the PR ref keeps the token commit reachable) — D49
- PROBE: commit map `.git/filter-repo/commit-map` → 59 old→new pairs (sample: d409ad7→7938fea, 78b9f67→2cc8112, ee6fbbe→82ef01c). The tracked text holds about 1710 SHA-like tokens (`git grep -Eo '\b[0-9a-f]{7,40}\b' -- .orchestrator docs README.md Roadmap.md | wc -l`) that the rewrite does not update — meets criterion 4 (precondition evidence); FOLLOW-UP below

Findings, classified:
- spec-gap: pull request #1 (`refs/pull/1/head`, read-only on GitHub) keeps the token commit 5c4a716 reachable on GitHub after the force-push, and criterion 1 passes anyway. Only GitHub Support can remove it, or the repository has to be deleted and re-created. The plan's hand-off item 7 asks Support only about "cached views".
- hazard: every SHA on both branches changes (59 commits, including the PR #1 merge `ee6fbbe`). The audit trail's SHA citations then point at commits GitHub no longer serves. Keep the commit map beside the receipt.

- FOLLOW-UP (owner: Nathan): purge rehearsal r1 — after the force-push, pull request #1 (refs/pull/1/head → 13af5b0) still reaches the token commit on GitHub, and plan criterion 1 cannot see it; decide before the purge: ask GitHub Support to remove PR #1's refs, or delete and re-create the repository, and whether criterion 1 should also check the PR refs
- FOLLOW-UP (owner: conductor): purge rehearsal r1 — at the purge, save .git/filter-repo/commit-map as an artifact beside docs/security/history-purge.md so the trail's 59 rewritten SHAs can be mapped

### Owner answer — 2026-10-13T16:51:55Z (transcript time), chat: "b"
The owner chose (b), delete and re-create the repository, for the pull request #1 ref. Recorded as D49. The plan's goal, criterion 1 and hand-off checklist are amended. Probe: `artifacts/purge-git-history--criterion1-grid-r1.sh`, output `artifacts/purge-git-history--criterion1-grid-r1.txt`. Before the purge, the old criterion 1 → exit 1 and the new → 1. After a force-push with the PR ref kept, old → 0 and new → 1. A re-created repository with purged branches → 0 and 0. The grid's fourth row repeats the pre-purge state. This answers the method only. The purge still needs the 401 and the owner's explicit approval (D46).
- PROBE: `gh auth status` → scopes include delete_repo — meets criterion 4 (precondition evidence): this session could technically delete the repository, so the approval rule is the only guard; the deletion waits for the owner (D44, D46)
- PROBE: `gh api repos/NateDogDotNet/plex-poster-app` → public, 0 forks, 0 open issues, 0 stars; hooks 0, secrets 0, releases none; wiki repository not found; Pages legacy from main `/`; homepage https://natedogdotnet.github.io/plex-poster-app/ — meets criterion 4 (precondition evidence): what the deletion loses and what is restored (hand-off steps 4 and 6)

### Owner message — 2026-10-13, chat: "3. yes, go-ahead"
Received as the go-ahead for the purge. Not acted on yet, for three reasons. The owner's own rule (D46, 2026-10-13: "The git history purge only happens with my explicit approval, after the 401 is confirmed.") requires the 401 first, and it is not confirmed. The plan orders the purge after `release-bump` (blocked by). The skill's irreversible gate (a saved approval stop, a precondition review, then `closer approve` and `closer act`) has not run. Asked on its own in chat: run it before the 401 and the release, or hold until both.

### Pre-claim preparation — security-review, 2026-10-14T21:26:29Z, conductor-2
Reason: the skill's irreversible rule (Step 7) runs the phase's `security-review` as pre-claim preparation once the last code phase lands (rename-now-showing, 7192007), before the phase that creates the purge's target commit (release-bump, in progress) commits. The review reads the branch diff `ee6fbbe..HEAD`; the app-code part of it is the rename commit, the rest is docs/ and the `.orchestrator/` trail. Dispatched as a named agent (security-review-r1) writing to `artifacts/purge-git-history--security-review-r1.md`; false-positive filtering per the skill follows if it reports anything.
- Result (security-review-r1, `artifacts/purge-git-history--security-review-r1.md`): verdict FINDINGS, one Medium. F1: the validation host's Windows user-profile path (the owner's full name) in three run outputs (`real-server-validation--home-core-r1.txt:1`, `-core-r1b.txt:1`, `-play-r1.txt:20-22`). Fixed at HEAD in 9507326 (masked to `%USERPROFILE%`); the pushed history keeps it until the purge, so D49 gains a `--replace-text` rule (D49 note). Clean: the leaked token (0 hits at HEAD and in added lines), machine id, public IP, emails, phone name, SSH details; the rename commit is name-only; the committed drivers talk only to localhost, plex.tv and the saved server. Lower-risk, recorded: a private LAN address in two artifacts (kept: private range); the four shared-server names in a core-r1b row (masked to `<shared server N>` in the next commit; they stay in pushed history until the purge, so the D49 replace list carries them too).
- DEVIATION (conductor): the skill's false-positive filter sub-task was not dispatched for F1; the conductor verified the finding directly (`grep -rl` of the path → exactly the three files) before masking. Recorded here instead of pretending a filter ran.


## Step 7 — precondition review (before the approval pause, plan criterion 4)
- Target: the branch tip `090d231` on `claude/intelligent-rubin-4vsi63` (2.1.0 = release 1450d71 + fix 090d231 + docs/trail commits). Reviewer purge-precondition-r1 (orchestrator-reviewer, cold on the repository state), brief `artifacts/purge-git-history--brief-precondition-r1.md`, dispatched 2026-10-15T00:28:43Z.
- Result: `artifacts/purge-git-history--precondition-r1.md` — NOT MET: items 1–4 and 6 pass (tip matches origin; main ee6fbbe is the PR #1 merge whose tree equals 13af5b0, an ancestor of the tip; only refs/pull/1/head on origin; clean tree, one worktree; the three local orch/* branches still reach 5c4a716 and must be deleted at step 7; code paths byte-identical to the suite's tree 156b877c; config.js only in 5c4a716's tree, removed by 3a7b688; delete_repo scope; no forks/stars/hooks/secrets/releases/tags; Pages legacy main / last built from ee6fbbe; now-showing free). Blockers: (1) two spellings of the owner's name survive a list built from %USERPROFILE% alone (play-r1.txt:22 URL-encoded; security-review-r1.md:14 inside its own grep) → masked at HEAD in 2608e28; (2) the D49-note check `-S"$(cat list)"` can never fail → D77: per-line check, the list holds every spelling plus the bare surname and the four shared-server names, step (5) sets the default branch. Owner question raised (Pages serves the old main until merged) → stop 16 item 4.
- Rehearsal r2 (2026-10-15T00:38:26Z, conductor): `artifacts/purge-git-history--rehearsal-r2.sh` → `-r2.txt`. Mirror of origin at 9ab722e (123 commits, 3 refs), replace list of 20 entries built at run time and shredded afterwards; before the rewrite entries hit 2–4 commits each (the token 2, the path spellings 2, the first-last forms 2–4, the surname 4, each server name 3); after `filter-repo --invert-paths --path config.js --replace-text`: config.js in 0 commits, every entry in 0 commits (per-line check exit 0), 0 blobs with the leaked value, both tip trees identical before/after, fsck clean. The output was checked for the token and the surname: 0 hits.
- Precondition re-review (delta: the two blockers): purge-precondition-r1 resumed, 2026-10-15T00:38:26Z.
- Re-check r1b: Blocker 1 resolved (surname 0 hits at the tip, 0 commit trees and 0 blobs after the rewrite in the reviewer's own mirror); Blocker 2 still open: the plan's loop searched whole list lines → fixed (literal part, -F), tree-id comparison, casings wording; run script `artifacts/purge-git-history--run.sh` written with set -e, a --confirm-delete gate before the delete and the new origin. Re-check r1c requested 2026-10-15T00:42:10Z.
- Re-check r1c: NOT MET on one point (the list was shredded before criterion 1 could run against a fresh clone of the new repository) → step 5b added, list kept until then; lower-case surname added; backup in a fresh private dir under $HOME; the re-sync checks the checkout did not move and that 5c4a716 is gone. Re-check r1d requested 2026-10-15T00:45:43Z.
- Re-check r1d: NOT MET on one line: step 5b's && chain fell through to its success message under set -e → guarded with `|| { echo FAILED; exit 1; }`; the output dir must not exist yet; manual continuation commands appended to the script. Minor noted: Pages POST defaults (moderate confidence; the site check is manual after the run).
- Re-check r1e: **PRECONDITIONS MET** (`artifacts/purge-git-history--precondition-r1.md`, final section): the step 5b guard stops every failure case before step 6 (reproduced by the reviewer under set -euo pipefail), the fresh-directory rule and the continuation notes confirmed; Minor accepted: "never /tmp" is a comment only; a continuation after a died step 5 uses `git remote set-url`. Reviewer incident, recorded: while cleaning up it ran `rm -rf /tmp/tmp.*`, which could have removed another agent's mktemp directory; no other agent of this run was active (the conductor's scratch is under /tmp/claude-1000/…, untouched), so no loss is known.
- Reviewer metric: purge-precondition-r1 (orchestrator-reviewer, opus), rounds r1–r1e, ~0.94 M tokens in all, ~16 min wall.

## Stop message 16
**Stop 16 — the history purge (irreversible; waits for your explicit approval, D46/D49)**

Everything before it is done: the token is rotated and rejected (401, receipt `docs/security/token-rotation.md`), both real-server checklists pass, the app is renamed Now Showing, and 2.1.0 is on `claude/intelligent-rubin-4vsi63` (pushed): the release commit `1450d71` plus the four review fixes `090d231`, with the docs and trail commits around them; the purge rewrites the whole branch as it stands when it runs (tip `86fc4d8` now, later trail commits included). The purge rewrites every commit so that `config.js` (the leaked token, commit `5c4a716`) and two privacy strings never existed, then replaces the GitHub repository with the rewritten history. The method is yours from 2026-10-13 ("b"): delete and re-create the repository, because a plain force-push leaves pull request #1's read-only ref reaching the token commit. It was rehearsed locally (`purge-git-history--rehearsal-r1.txt`): the tip trees come out identical, every SHA changes. An independent precondition review (`purge-git-history--precondition-r1.md`) checks the target, the clean tree, the green suite, the leaked value's whereabouts and the GitHub state before this stop is sent; its first verdict was NOT MET on two points (two spellings of your name a list built from the profile path alone would miss, and an ineffective history check); both are fixed (masked at `2608e28`, plan amended under D77) and a second local rehearsal with the full replace list came out clean (`purge-git-history--rehearsal-r2.txt`: 20 entries, each in 0 commits afterwards; tip trees unchanged). After four more delta checks of the run script the reviewer's final line is **Verdict: PRECONDITIONS MET** (re-check r1e).

What I would run, in order, is the script `.orchestrator/artifacts/purge-git-history--run.sh` (committed, reviewed read-only by the precondition reviewer; nothing happens before your answer to item 1). It stops on any failed check before the delete, and without its `--confirm-delete` flag it only rehearses:
1. `git clone --mirror` of origin to a backup folder outside the repository (kept until you say delete).
2. In a fresh clone: `git filter-repo --invert-paths --path config.js --replace-text <list>`; the list holds the leaked token value, HOME's user-profile path (your full name) and the four shared-server names from the C05 row, written from the live values at run time into a file outside the repository and deleted afterwards. The commit map `.git/filter-repo/commit-map` is kept beside the backup.
3. `gh repo delete NateDogDotNet/plex-poster-app --yes` (this session's `gh` has the `delete_repo` scope). This removes pull request #1, its ref, the Pages setting and the homepage. There are no forks, issues, stars, webhooks, secrets, releases or wiki to lose (checked 2026-10-13).
4. `gh repo create NateDogDotNet/now-showing --public` (empty); set `origin` to it; push `--all` and `--tags`; re-enable Pages from `main` `/`; set the homepage to the new address; open the site once to check it loads.
5. Re-sync this checkout, run plan criteria 1–3 from a fresh clone (no `config.js` in any commit, no `refs/pull/*`, `git fsck` clean, and `git log -S` of each replaced string empty), and record `Purged: yes` and the date in `docs/security/history-purge.md`.
6. Not automated: asking GitHub Support to drop cached views of `5c4a716` (optional; say if you want the request text).

Two risks, plainly: (a) between step 3 and step 4 the Pages site is down for a few minutes, and every display that loads it over https shows its cached shell until it is back; (b) anyone who cloned the public repository before now keeps the old history, which is why rotation, not the purge, is what removed the risk.

1. **Approve the purge of the branch as it stands (last code commit `090d231`)?** (a) Yes, run steps 1–5 now. (b) Not yet. (c) Never: close the phase as skipped (D14 allows it; the token is already dead).
2. **Repository name at step 4 — answered by you in advance (2026-10-14, D76): `now-showing`.** Step 4 creates `NateDogDotNet/now-showing`; Pages comes back at `https://natedogdotnet.github.io/now-showing/`; the README's clone URL is already updated. Two consequences to know: GitHub does not redirect a deleted repository, so every display, bookmark or kiosk URL pointing at `…/plex-poster-app/` must be re-pointed by you once; and, as the last act of the session that runs the purge, the local checkout moves to `/home/nathan/now-showing` (any later session opens it there). Nothing to answer here unless you want to change it.
3. **Who runs it.** (a) I do, from this session, with the commands above, reporting each step (needs your "yes" to item 1). (b) You do, following the same steps; I verify afterwards.

4. **GitHub Pages after the purge.** Pages builds from `main`, and `main` is still the 2.0 merge from 11 October: it has neither 2.1.0 nor the rename. So right after the purge the new address serves the OLD app until this branch is merged. (a) After the purge, I open the pull request (dropping the `.orchestrator/` snapshot from it first, as your rule says) and you merge it when you are ready; Pages then serves 2.1.0 as Now Showing. (b) Not yet: leave the branch unmerged and Pages on the old build. Your rule D13 makes a pull request your call, so there is no default here.

Reply with one letter per open item, in the shape `1 <a|b|c> 3 <a|b> 4 <a|b>`. If you answer 1a and 3a, I run the script once without `--confirm-delete` (a last rehearsal on the live mirror), show you its output, and only then run it with the flag. Item 1 is not answered by defaults (D44 excludes irreversible and public actions).
<!-- end stop 16 -->

- Answer to stop message 16: "1 a 3 a 4 a" — chat; recorded by the conductor at 2026-10-15T01:53:44.275338Z

## Owner approval — chat, 2026-10-15T01:52:37.920Z (transcript time): "1 a 3 a 4 a"
`closer approve` recorded it against the transcript (artifacts/purge-git-history--approve record, transcript_checked true). Item 2 was answered in advance (D76). 1a: run the purge; 3a: the conductor runs it; 4a: open the pull request afterwards.

## The run — 2026-10-15T01:54:17Z, `closer act` (artifacts/purge-git-history--act.json, exit 0, ok true)
- Rehearsal on the live mirror first, without --confirm-delete (`purge-git-history--run-rehearsal-r1.txt`): 128 commits, 20 list entries, rewrite verified, stopped before the delete. Then the real run (`--run-r1.txt`, tails in the act record): backup mirror and commit-map kept in `/home/nathan/.now-showing-purge-20261015` (private, 700; holds the token: the owner says when to delete it); `gh repo delete NateDogDotNet/plex-poster-app`; `gh repo create NateDogDotNet/now-showing --public`; push --all/--tags; default branch main; Pages main `/`; homepage set; step 5b criterion 1 against a fresh clone of the new repository: exit 0; re-sync: checkout tip 837f624 (rewritten), config.js in 0 commits, object 5c4a716 gone, orch/* branches deleted.
- After the run: now-showing exists (default main, homepage https://natedogdotnet.github.io/now-showing/), Pages built, site 200; the old repository name resolves to nothing; origin refs: main 82ef01c, the working branch, no refs/pull/*.
- Incident, none. The rehearsal directory `/home/nathan/.now-showing-purge-rehearsal-20261015T015310` also holds a mirror with the token; the safety hook refused the conductor's `rm -rf` outside the checkout, so the owner deletes it.

## Plan acceptance
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (fresh clone of origin: no config.js, no refs/pull/*, every replace-list entry absent per line) | evidence.py exec (plan command, REPLACE_LIST rebuilt from the backup outside the repository and removed after) | 0 | `purge-git-history--ac1-r1.json`; also step 5b of the run |
| 2 | plan criterion 2 (receipt, Purged: yes) | evidence.py exec (plan command) | 0 | `purge-git-history--ac2-r1.json` |
| 3 | plan criterion 3 (git fsck) | evidence.py exec (plan command) | 0 | `purge-git-history--ac3-r1.json` |
| 4 | plan criterion 4, narrated: owner says public → not skipped; precondition review before the pause; the owner approved and the conductor ran it (3a) | the receipt holds no token-like string (checked by command); precondition review MET (r1e); approval and act records | 0 | `purge-git-history--ac4-r1.json`, `--precondition-r1.md`, `--act.json` |

## Pre-commit
N/A — the phase output is one Markdown receipt; criterion 4's check is its secret scan.

## Step 8 tally — purge-git-history--tally-step8-r1.md
| Category | Score |
|---|---|
| acceptance criteria pass fresh _critical_ | 35/35 |
| diff scope matches phase | 15/15 |
| commit message accurate | 5/5 |
| **Total** | **55/55** (100%) |
**Band:** COMPLETE
**Caps applied:** none

- Landed: 3efea7c — "Record the history purge: config.js and the private strings are gone from every commit"

- Follow-up (rehearsal r1, owner conductor) answered: the filter-repo commit-map is saved as `artifacts/purge-git-history--commit-map.txt` (old SHA → new SHA, 128 lines; it holds no secret) beside the receipt's evidence; the original stays with the backup.
- EXCEPTION (rule 2 as the gate reads it): the security review (`--security-review-r1.md`) and the precondition review (`--precondition-r1.md`) ran before any Step 4 tally and without a `closer predispatch` record. The skill says that is by design for an irreversible phase ("an irreversible phase's precondition and security reviews — runs before the Step 4 tally by design; its verdict is a Step 4 row"); they are rows 4's evidence above. Closed with --no-gate quoting this.
