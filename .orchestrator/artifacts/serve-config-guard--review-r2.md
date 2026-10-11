Reviewer: serve-config-guard-review-anchored-r2 · Model: opus · Dispatched: 2026-10-08T22:18:23Z · Method: anchored confirmation code review (full scope; risk:high) · Scope: serve-config-guard, round r2, base 0f1f82e, staged tree 9af4938

## What I read and ran

Read:
- Plan section "### 4. `serve-config-guard`" in `docs/integration-plan.md`
- R-SEC-1 in `docs/spec.md:77-81`
- D9/D12 (via the plan's citations and the r1 anchored review)
- the r2 brief `serve-config-guard--brief-r2.md` (items 1-6 and the two conductor rulings)
- both r1 reviews
- the r2 builder handback
- the staged diff. `git diff --cached` is byte-identical to `serve-config-guard--diff-r2.patch`, and `git write-tree` gives 9af4938.
- the full staged `scripts/serve.mjs` (lines 50-100)
- `sw.js` SHELL (lines 8-32)

Where I ran things:
- `git archive 9af4938 | tar -x` into my own `mktemp -d` (`/tmp/tmp.suZfMEpQqL`).
- Fixtures went into further `mktemp -d` dirs (`/tmp/tmp.KmWBDoZ6Nk`, `/tmp/tmp.jgQjo2qLuw`).
- I removed all three afterwards. The worktree and index are untouched: `git status --short` is unchanged and the tree is still 9af4938.
- Host: Node v22.22.0, LAN IPv4 192.0.2.2, no IPv6.

| Criterion | Command | Result |
|---|---|---|
| Plan 1 | `node --test tests/serve.test.js` | tests 10, pass 10, fail 0, skipped 0 |
| Plan 2 | `npm test` | tests 39, pass 39, fail 0, skipped 0 |
| Plan 3 | grep chain | ok |
| Plan 4 | `! grep -qiE 'x-forwarded\|forwarded' scripts/serve.mjs scripts/net.mjs` | ok |
| Plan 5 | `git status --porcelain -- js css index.html sw.js scripts/mock-plex.mjs` | empty (0 lines) |
| Plan 6 | LAN tests | `# skipped 0` on 192.0.2.2 |

### Raw-socket probes

Setup: `serve.mjs --host 0.0.0.0 --root <F>/link`, where `link -> real` (the **served root is a symlink**). In it:
- `assets/csslink -> ../css` and `js/idx.js -> ../index.html` (inside the root, app targets)
- `assets/doclink -> ../docs` and `js/b -> ../build` (inside the root, non-app targets)
- `assets/g -> ../.git` (a dotdir)
- `assets/out -> <outside dir>`

| Request | Peer | Result |
|---|---|---|
| `/config.json` (Host localhost) | loopback | 200 SECRET |
| `/config.json` (Host localhost) | LAN | 403 |
| `/`, `/index.html`, `/css/a.css` | loopback | 200 (symlinked root works) |
| `/assets/csslink/a.css`, `/js/idx.js` | loopback and LAN | 200 (symlink inside the root to an app path is served) |
| `/assets/doclink/x.md`, `/js/b/b.js` | loopback | 404 (inside the root but not an app path) |
| `/assets/g/HEAD` | loopback | 404 (real path has a dot segment) |
| `/assets/out/o.txt` | loopback | 404 (outside the root) |
| `/js/nope.js`, `/assets/nope.png`, `/nope.json` | loopback | 404. A missing file makes `realpath` throw, and the catch at `serve.mjs:83-84` returns 404, not 500. |
| `/config.json` with config.json deleted | loopback | 404 |
| `/config.json` where config.json is a symlink to an outside file | loopback | 404 (the `rel.startsWith('/..')` clause) |
| `/config.json` where config.json is a symlink to `assets/c.json` (inside) | loopback / LAN | 200 / 403 |

### Real-app regression

The extracted tree served with the default root and host:
- Every `sw.js` SHELL entry, `/sw.js`, every `js/*` file and every file under `assets/` returns 200 (`app-files-fail=0`).
- `/config.json` from `localhost` returns 200.
- A FIFO at `js/f.js` returns 404 straight away (no hang).
- `find css js assets -name '.*'` is empty, so the dotfile rule hides nothing the app uses.

### Performance

2000 sequential `GET /js/main.js` took 2226 ms on r2 and 1747 ms on base `0f1f82e`. The harnesses were not identical (the r2 run created a new Agent per request), so read this as an upper bound: under 0.25 ms extra per request for one `realpath` and one `stat`. That is negligible for a dev server.

### Mutation testing

All mutants ran in the scratch copy. Each was reverted, and the reverted files were `cmp`-identical to `git show :scripts/serve.mjs` and `:scripts/net.mjs`.

| # | Mutant | Result |
|---|---|---|
| M7 | peer taken from X-Forwarded-For (name split) | killed (fail 1) |
| M9 | `isLoopback` returns `a.startsWith('127')` | killed |
| M10 | `DIRS` without trailing slash | killed |
| M2 | drop `!isAppPath(rel)` on the real path | killed |
| M3 | replace `realpath(file)` with a lexical path | killed |
| M5 | drop the dotfile-segment rule | killed |
| M1 | drop `rel.startsWith('/..') \|\|` | **survived** (10/10). The builder disclosed this. |
| M4 | `REAL_ROOT = ROOT` (no realpath of the root) | **survived** (10/10). `os.tmpdir()` is not a symlink on this host. |
| M8 | peer taken from `X-Real-IP` | **survived** |
| M12 | peer taken from `Forwarded: for=` (name built as `'for'+'warded'`, so criterion 4 still passes) | **survived** |
| M6 | dotfile rule narrowed to `seg === '.env'` | survived |
| M11 | drop the `isFile()` check | survived. This is harmless to the suite. My FIFO probe shows the check is what prevents a hang, but no test pins it. |

## Status of r1 findings

**Anchored r1 (mine):**
- **I1 (XFF test has no teeth): resolved.**
  - `tests/serve.test.js` now sends `host: localhost:${port}` from the LAN peer with the XFF header and asserts 403, plus a control without the header.
  - Mutant M7 is killed.
- **M-1 (symlink escape): resolved.**
  - Fix: `serve.mjs:71-73` (realpath plus containment plus app-path check on the real path).
  - Tests: `/assets/link.png` (outside) and `/assets/cfg.png` (-> config.json) are 404.
  - Mutants M2 and M3 are killed, and the probes above agree.
  - The one untested residual clause is new item N1.
- **M-2 (dotfiles): resolved.** The conductor ruled that dotfile segments are 404. `isAppPath` (`serve.mjs:49-50`) applies the rule to the request path and the real path, `/js/.env` is tested for 404, and M5 is killed.
- **M-3 (M9/M11 survive): resolved.** There are new unit cases (`127.0.0.1.evil`, `1270.0.0.1`, `127.0.0.256`, `127.1`, and others) and a sibling-dir test (`/assets-private/x.png`, `/jsx/a.js`). M9 and M10 are killed.

**Cold r1:**
- **I1: resolved** (same as above).
- **M1 (symlinks): resolved** (same as above).
- **M2 (Sec-Fetch-Site / nosniff / no-store on config.json): accepted.**
  - The r2 brief did not route it and says "Do not add behaviour beyond items 4 and 5".
  - It stays a defence-in-depth spec-gap for the conductor. I found no read primitive either.
- **M3 (LAN tests skip silently): accepted.** The plan makes this a narrated check (criterion 6), and it shows `# skipped 0` here.
- **M4 (prefix semantics, exact statuses): resolved.**
  - Statuses are now pinned: 403 for the exact spelling from the LAN and for a foreign Host from loopback, and 404 for variants.
  - The cold reviewer's "variants return 403" mutant would now fail the `assert.equal(..., 404)` lines.

## Strengths

- **Realpath logic matches both rulings.**
  - The real path must stay inside `realpath(ROOT)`, and, unless this is the config branch, it must itself be an app path.
  - That closes the symlink-to-config.json case, which a containment-only check would miss, and dotdirs reached through a link.
  - Symlinks that point inside the root at app files keep working.
- **No existence oracle.** The 403 for config.json is still decided before any filesystem call (`serve.mjs:63`).
- **Error paths fail closed.** Missing files, a missing root (`REAL_ROOT` falls back to `ROOT`), ENOENT from `realpath`, directories and FIFOs all end in 404, never 500 and never a hang.
- **The symlinked root case works**, because `REAL_ROOT` is computed once at start-up and compared against `relative()` of the file's real path.
- **Tests now pin exact codes.** The XFF case is built so that only the proxy header could change the answer, and the header name is assembled in the test, so criterion 4 stays clean.
- **Minimal change.** `net.mjs` is unchanged from r1. Nothing outside the three output files is touched, and the app and `--mock` are unaffected.

## Issues

### Critical

None.

### Important

None.

### Minor

**N1. The `rel.startsWith('/..')` containment clause has no test.**
- Location: `scripts/serve.mjs:73`. Class: `spec-gap`.
- The brief's item 4 names two test cases, and both are present and pass. Neither one exercises this clause, because for app paths `!isAppPath(rel)` already rejects `/../…`. The clause only matters on the config.json branch.
- Evidence: mutant M1 survives 10/10. My probe shows the clause is live: with `config.json -> <outside>/o.txt`, a loopback request gets 404 with the clause and would get the outside file without it.
- Why it matters: it is the only code enforcing the conductor's "real path must stay inside the root" ruling for config.json. The exposure is loopback-only and needs local write access, hence Minor.
- Fix: add a fixture where the root's `config.json` is a symlink to a file outside the root, and assert 404 from loopback with `Host: localhost`. Because the fixture is shared, this needs either a second root or a test that swaps the link.

**N2. Proxy-header teeth cover only `X-Forwarded-For`.**
- Location: `tests/serve.test.js`, the XFF assertion. Class: `spec-gap`, because criterion 1 names only XFF.
- R-SEC-1 (`docs/spec.md:77`) says "`X-Forwarded-For` and `Forwarded` are never consulted".
- Evidence: mutants that take the peer from `Forwarded: for=` (M12) or `X-Real-IP` (M8) both pass 10/10. Criterion 4's grep does not catch M12 when the name is split (`'for'+'warded'`).
- Fix: send `Forwarded: for=127.0.0.1` and `X-Real-IP: 127.0.0.1` on the same LAN request with `Host: localhost`. Both r1 reviews suggested this.

**N3. The symlinked-root path is untested.**
- Location: `serve.mjs:51`. Class: `spec-gap`.
- Evidence: mutant M4 (`REAL_ROOT = ROOT`) passes here, because `os.tmpdir()` is not a symlink on Linux. My probe with `--root <symlink>` shows the real code serves correctly. Without the realpath of the root, every request would be 404: `relative()` of the real path would start with `..`.
- Why it matters: availability only, since the failure is closed. It would show up on macOS (`/tmp -> /private/tmp`) or wherever a user's checkout sits behind a symlink.
- Fix: in the test, pass `--root` through a symlink to the fixture dir.

Two further gaps are too small for separate items. The dotfile test uses a single name (mutant M6), and nothing pins `isFile()` against a FIFO (mutant M11). Adding `/css/.hidden.css` and a FIFO case would close them.

## Declined to judge

- **"Real path must be an app path" is stricter than the ruling's wording ("must stay inside the root").** For example, `css -> ./build/css` would now be 404. It follows from D9's allowlist, and it is what makes the brief's required `cfg.png -> config.json` test pass, so I treat it as within the ruling. Whether such a layout should be supported is a product question.
- **Windows.** Backslashes in the request are rejected (`serve.mjs:57`). `relative(REAL_ROOT, real)` across drives returns an absolute `D:\…`, which becomes `/D:/…`. That fails `startsWith('/..')`, so only the config.json branch could follow a cross-drive symlink, and it stays loopback-only. I have no Windows host to run this, so I did not rule on it.
- **TOCTOU** between `realpath(file)` and `stat`/`readFile(file)`: a link swapped in between could be followed. Exploiting it needs local write access and racing a dev server, which is outside the threat model in R-SEC-1.
- **The stray process `node scripts/serve.mjs --host 0.0.0.0 --port 46025 --root /tmp/tmp.38k2VnHalI` (PID 18904)** belongs to another agent's FIFO mutation run, not to me. I left it alone. The conductor may want to confirm it is reaped.

## Recommendations

1. Optionally close N1 and N2 in a test-only follow-up, or fold them into `device-helper-server`, which reuses the same peer logic and whose spec (R-HELP-1) also names a bad XFF. Neither blocks this phase.
2. N3 can wait. Note it for anyone who runs the suite on macOS.
3. The conductor should keep cold r1 M2 (Sec-Fetch-Site / nosniff / no-store) on its list as a deliberate deferral.

## Assessment

Every r1 finding the conductor routed is resolved, with tests that now kill the mutants that survived r1 (XFF trust, loose `127`, slashless dirs). The two conductor rulings, symlink containment and dotfile segments, are implemented correctly. My own probes confirm it: a missing file gives 404, a symlinked root is served, symlinks inside the root reach app files only, and config.json is still served to loopback. Plan criteria 1-6 all pass. The three remaining gaps are untested defensive branches, and none is a behaviour bug. Each is Minor and not covered by the criteria or the brief's test list.

**Verdict:** APPROVE
