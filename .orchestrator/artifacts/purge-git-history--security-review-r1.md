Agent: security-review-r1 · model: claude-opus-5-5 · dispatched: 2026-10-14T21:26:29Z
Verdict: FINDINGS

Scope: `git diff ee6fbbe..HEAD` on `claude/intelligent-rubin-4vsi63` (HEAD 7a9b674): 2560 files, +80172/-78. Read-only. Nothing in the repository was changed apart from this report. Every secret comparison ran with values masked in the output. The leaked `5c4a716:config.js` values went to a scratch file (`/tmp/claude-1000/-home-nathan-plex-poster-app/d46a0785-7a80-4504-996b-2b91961196cb/scratchpad/secrets.txt`) and were compared with `grep -F`. None of them was printed.

## Findings

### F1. The owner's full legal name is committed in validation outputs (Medium, PII / privacy exposure, confidence 9/10)

- **Files and lines:**
  - `.orchestrator/artifacts/real-server-validation--home-core-r1.txt:1`
  - `.orchestrator/artifacts/real-server-validation--home-core-r1b.txt:1`
  - `.orchestrator/artifacts/real-server-validation--home-play-r1.txt:20`, `:21`, `:22`
- **Description:** These driver outputs include the Windows profile path of the validation host, `C:\Users\<First Last>\plex-poster-validation`, which holds the owner's full first and last name. The stack trace at play-r1.txt:22 also has it URL-encoded. The other repository metadata does not expose this name. Every human commit is authored as `NateDogDotNet <…@users.noreply.github.com>` (`git log --format='%an <%ae>'`), and `git grep -E '<owner>' ee6fbbe` finds 0 files on main. The first name alone ("owner: Nathan") appears throughout `.orchestrator/state.md` and `.orchestrator/phases/*.md`. Only these 3 files pair it with the surname.
- **Exposure scenario:** The repository is public. Anyone who reads or clones it can link the pseudonymous GitHub handle `NateDogDotNet` to a real full name. The same files show the account's Plex server name, its LAN layout (see Notes) and the household's viewing history. That gives a starting point for social engineering, for example against plex.tv account recovery, or for doxxing.
- **Recommendation:** Before the branch is pushed or merged, replace the user-profile segment with `%USERPROFILE%` or `<user>` in those 5 lines. If any of these commits already reached the remote, add the string to the purge-git-history replace-text list. The masking helpers in the drivers (`clean()`) do not cover the cwd line or Node stack traces. Future drivers should also replace `os.homedir()` in their output.

## Checked and found clean (or below the reporting threshold)

| Check | Command (on added lines or the HEAD tree) | Result |
|---|---|---|
| Leaked token from `5c4a716:config.js` (20 chars) | `grep -cF` on the added diff lines; `git grep -lF … HEAD` | 0 added lines, 0 files at HEAD |
| `X-Plex-Token` followed by a value | `grep -E 'X-Plex-Token[=: "']+[A-Za-z0-9_-]{6,}'` | 6 hits, all placeholders (`use…`, `dem…` and the word "header"). No real value. |
| 20-char mixed-case alphanumeric runs | Regex filter on the added lines | 1 hit: the npm sha512 integrity hash at `package-lock.json:36` (and its copy in a patch artifact). Not a credential. |
| 32-hex machine identifier | `grep -oE '\b[0-9a-f]{32}\b'` | 0. The single plex.direct URL with a real host part (`real-server-validation-extended--home-inspect-r1.txt:4`) has the machine id masked as `<machine-id>`. |
| 40-hex values | Checked each with `git cat-file -e` | 5 are git objects. The other 16 are tree ids or SHAs from other worktrees in reviewer headers. None is a secret. |
| UUIDs (possible clientId) | 18 distinct | 17 are `blob:http://127.0.0.1` object URLs in a mutation-test output. 1 is a Claude session scratchpad path. No `plexPoster.clientId` value is committed: the inspect output lists only the key name. |
| `authToken` / `accessToken` / `PlexOnlineToken` with a value | `grep -iE` | 0 values. The hits are code that prints only `bool(j.get("authToken"))`, prose, and a test stub. |
| `*.plex.direct` hostnames | `git grep 'plex\.direct' HEAD` | 53 hits. Apart from the masked one above, all are prose, regexes in drivers, or the synthetic `abc.plex.direct` in a review. |
| Public IP addresses | Every dotted quad in the added lines, classified | Only private or loopback addresses and RFC 5737 documentation addresses (`192.0.2.1`, `192.0.2.2`, `203.0.113.5`). No public IP. |
| Email addresses | `grep -oE` | Only `noreply@anthropic.com` (commit trailers) and test fixtures at `evil.com` / `evil.example`. |
| Owner's phone name | Searched the `--home-*.txt` outputs | Masked as `<owner's phone>` in every row of `real-server-validation-extended--home-e08-r1.txt`. The other player name ("TV 2019") is generic. |
| plex.tv link codes and settings PINs | Read every `--home-*.txt` | The link codes (NHRP, 6459, H5LY, …) were 15-minute one-time codes and have expired. The settings PIN `2468` at `home-ext-r1c.txt` was a test PIN, cleared afterwards ("PIN cleared afterwards: true"). Neither is a usable secret. |
| SSH host details | `grep` for `ssh`, `.ssh/`, `id_*`, `-p <port>`, tailscale and CGNAT addresses | Only `ssh exit <n>` lines and the alias "HOME". `.orchestrator/phases/real-server-validation.md:35` records that `~/.ssh/config` was not read. No host, user, port or key. |
| Token-rotation receipt `docs/security/token-rotation.md` | Read | No token. It states that the old token returned 401. |
| Rename commit 7192007 (code files) | `git diff ee6fbbe..7192007 -- index.html manifest.webmanifest js/plex.js scripts/serve.mjs package.json` | Name-only string changes: title, PWA name, `PRODUCT` constant, package name and the serve log line. No security-relevant change. |
| Committed driver scripts `.orchestrator/artifacts/*.mjs` | Every URL host in them; every `spawn`/`writeFile`/`fetch` | They talk only to `http://localhost:809x` (their own `scripts/serve.mjs`), `https://plex.tv`, the saved `serverUrl`, and `192.0.2.1` (a deliberately wrong URL). They read the token from the local browser profile and only compare it inside the page as a boolean. Output passes through `clean()`, which masks `X-Plex-Token=` values, the token itself, URLs and 32-hex ids. They write only `APPROVE-CODE.txt` (a link code) and logs in their own folder. No exfiltration path. |

Notes below the reporting threshold (not findings: no credential, and not exploitable at this confidence):
- The LAN address `192.168.1.x` of the Plex server is at `.orchestrator/artifacts/research--agent-reach-r1.md:6` and, in dashed form, at `real-server-validation-extended--home-inspect-r1.txt:4`. It is a private address and cannot be reached from the internet.
- `real-server-validation--home-core-r1b.txt:22` (V1-C05 row) names the owner's server ("Castle Anthrax") and four friends' shared servers. Several outputs list library sizes and titles that were playing. This is a privacy matter for the owner, not a credential exposure.
- `research--agent-reach-r1.md:9` records that the server's `PlexOnlineToken` sits in the registry of the host "HOME" and that "ssh home works unattended". This is infrastructure detail with no value or address.
- The leaked token's commit `5c4a716` predates this branch (it is in main's history) and is outside scope. The receipt reports that the token is revoked (401).

Files read: `git show 5c4a716:config.js` (values masked, never printed), `git diff ee6fbbe..HEAD` (stat, added lines, rename-commit code diff), every `.orchestrator/artifacts/*--home-*.txt` (long runs masked), `.orchestrator/artifacts/research--agent-reach-r1.md:1-20`, `.orchestrator/phases/real-server-validation.md:30-40`, `docs/security/token-rotation.md`, grep excerpts of `.orchestrator/artifacts/*.mjs`, `.orchestrator/state.md`, `.orchestrator/phases/*.md`, and the files that held UUIDs or 40-hex values.
