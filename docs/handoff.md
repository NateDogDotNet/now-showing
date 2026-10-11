# Handoff: continuing the 2.1 integration run in a local session

Written 2026-10-11 when the cloud session handed off. Everything below is on branch
`claude/intelligent-rubin-4vsi63`.

## Where things stand

- **21 of 28 plan phases are done, landed and pushed.** Every 2.1 feature is in, and so are the README and Roadmap.
  Each phase passed its acceptance criteria, its reviews, a full test-suite run on the merged code and the orchestrator's gate.
- **Two phases moved to 2.2** (D41): `position-drag-nudge` and `fill-blur-and-info`. They are marked deferred in the plan
  and listed in `Roadmap.md`.
- **What is left needs the owner:**

  | Phase | Status | What it waits for |
  |---|---|---|
  | `rotate-plex-token` | blocked | The owner rotates the leaked Plex token and sends the four-line receipt below. |
  | `real-server-validation` | pending | Someone runs `docs/validation/real-server-core.md` against the real Plex server. Waits on the token rotation. |
  | `real-server-validation-extended` | pending | Someone runs `docs/validation/real-server-extended.md` on the real Pi. It includes rows V1-E24 (remote address) and V1-E25 (relay). |
  | `release-bump` | pending | Both validations pass. It then updates the README's "(verify)" tags from the results (follow-up K61), applies two small README wording fixes, and sets version 2.1.0. |
  | `purge-git-history` | pending | Only if the owner explicitly approves the history purge, and only after the 401 below is confirmed. This step is irreversible. |

- **Token rotation receipt:** send these four lines. Never paste the token itself anywhere.

  ```
  1 method: (Authorized Devices removal, or password change with "Sign out of connected devices")
  2 date:
  3 old token rejected (401): (run plex.tv GET /api/v2/user with the OLD token as an X-Plex-Token header, in your own shell)
  4 history purge wanted: yes / no
  ```

## Picking it up locally

1. **Get the code.**
   ```
   git fetch origin claude/intelligent-rubin-4vsi63
   git checkout claude/intelligent-rubin-4vsi63
   npm ci
   npx playwright install chromium
   ```
2. **Check it runs.**
   - `npm test` (unit tests, a few seconds).
   - `npm run test:e2e` (the full browser suite). It takes about 16 minutes, mostly simulated-clock waits, not CPU.
     Set `E2E_PORT` and `E2E_MOCK_PORT` if the default ports are busy.
   - `node scripts/check-precache.mjs` (the service-worker file list).
3. **The orchestrator's state is in `.orchestrator/`.** It is normally git-ignored as a local audit trail. For this handoff,
   a snapshot was force-added in one commit so a local session can resume.
   - `state.md` holds the phase table, the frontier and the open follow-ups. `phases/*.md` holds one record per phase,
     and `questions.md` holds the builders' questions and their rulings. `artifacts/` holds the evidence, briefs, reviews and helper scripts.
   - The reviewers' screenshots (about 66 MB of PNGs) were **not** included. They only illustrate finished reviews, and no
     later step reads them.
   - Files under `.orchestrator/` are now tracked, so later edits show up in `git status`. To add a new file there, use
     `git add -f`. Before opening a pull request, drop the snapshot with
     `git rm -r --cached .orchestrator && git commit`. The `.gitignore` entry then applies again.
4. **The orchestration kernel** (`closer.py`, `state.py`, `evidence.py`, `score.py`) comes from the owner's `dotclaude`
   repository. This run used commit `b4a6fb5`, found at `~/.claude/scripts/cc_utils`.
5. **Helper scripts with container paths.** Seven `.orchestrator/artifacts/round--*.py|sh` scripts hard-code
   `/home/user/plex-poster-app` and `/home/user/wt-<phase>`. Before reusing them, point them at your clone and worktree
   locations, for example with `sed -i 's#/home/user/#<your path>/#g'`.
6. **Resume with `/orchestrate`** on `docs/integration-plan.md`. It reads `.orchestrator/state.md`, sees an empty frontier,
   and stops at the owner actions above.

## Standing decisions to keep honouring

All decisions are in `docs/decisions.md`. These change how the run behaves:

- **D44:** stops answer themselves with each item's recommended option, and the stop is still written and reported. The
  token receipt, anything irreversible or public (history purge, force-push, opening or merging a pull request,
  deleting unique work), and the hands-on validation runs are not covered. Those still wait for the owner.
- **D42:** low-risk phases get lighter review rounds. Phases touching reloads, sign-in or child safety keep anchored plus cold reviews.
- **D41:** landscape fill and drag/nudge positioning are 2.2, not 2.1.
- **D11 / D13 / D14:** the release needs `Rotated: yes` and `Overall: PASS` on both validations. Work goes to this branch
  only, and a pull request or merge happens only when the owner asks. The history purge is a separate, irreversible approval.

## Open follow-ups

From `.orchestrator/state.md`:

- **D33** (real-server-validation-extended): check whether Plex rates TV episodes lower than their show.
- **C8I1 / D37** (real-server-validation-extended): confirm Plex accepts the batched `GET /library/metadata/k1,k2` request.
- **K61** (release-bump): update the README's "(verify)" tags from the validation results.
- **docs r3 wording** (release-bump): the "Daily reload" text should say the reload waits for any open dialog and that a
  mouse click also counts as a manual wake. Also drop "(K60)" from the Roadmap's 2.1.x polish line.

## Known tooling issues

- The full e2e suite now takes about 16 minutes. `round--ac-runner.py` was raised to a 2400 s evidence timeout.
- `evidence.py exec` in the kernel crashes with `TypeError: can't concat str to bytes` when a command hits its timeout,
  instead of reporting the timeout. To work around it, pass a generous `--timeout`. The proper fix belongs in the `dotclaude` repository.
- Playwright 1.56's fake clock can step `Date.now()` backwards on a running clock. Specs that measure time must pause
  the clock first, as the brightness, helper, first-run and smoke specs now do.

## Not carried over

The container also held leftover git worktrees with uncommitted code: the losing candidate of each branched phase, and
superseded early rounds. Every winning version is committed on the branch, so nothing that landed depends on them.
