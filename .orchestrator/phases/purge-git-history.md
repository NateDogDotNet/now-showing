# purge-git-history

- Mode: hitl        Tags: irreversible        Blocked by: rotate-plex-token, release-bump
- Agent type: none (hitl; the owner runs the force-push, plan criterion 4)
- Claimed: n/a — not claimed; blocked by rotate-plex-token and release-bump (only pre-claim preparation below)
- Dispatched: n/a        Re-dispatches: 0        Inner revision rounds: 0
- Last verification: 2026-10-13T16:45:10Z (rehearsal)
- Commit(s): n/a — no phase commit yet

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
- PROBE: after the push, the stand-in still holds 1 commit and 1 blob with the value, through `refs/pull/1/head` → 13af5b0, which reaches 2 config.js commits. A plain clone fetches only branches, so criterion 1 cannot see it. GitHub does not accept pushes to `refs/pull/*` — fails the phase's goal ("remove config.js from every commit"); a spec-gap, asked before the action (FOLLOW-UP below)
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

