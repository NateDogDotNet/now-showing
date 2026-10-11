Agent: planning-review-confirm-r2 · Model: opus · Dispatched: 2026-10-08T21:17:49Z · Method: anchored confirmation review (delta-scoped) · Scope: phase planning, round r2, reviewed base 1f4d3e2 → c817080

# Planning confirmation review r2

## What I read and ran

**Read:** `~/.claude/agents/orchestrator-reviewer.md`; both r1 reviews (anchored and skeptic) in full; `docs/decisions.md` (D1–D16); `.orchestrator/artifacts/planning--brief-r2.md`; `.orchestrator/questions.md` (Q1–Q23 and the rulings); `~/.claude/skills/integration-orchestrator/SKILL.md` (the tag table, the "stage, do not commit" rule at :195, the Invocation cross-checks at :690–720); all of `docs/spec.md` (436 lines) and `docs/integration-plan.md` (750 lines) at c817080. At HEAD I also read `sw.js`, `scripts/mock-plex.mjs` (head and control endpoints), `scripts/serve.mjs` (grep), `js/layout.js` (`stageSize`), `js/settings.js` (exports), `js/main.js` (`loadProvisionedConfig`, `boot`, Diagnostics `Image mode`), `index.html` (icons) and `Roadmap.md` (Ideas headings).

**Ran.** Everything ran in `mktemp -d` → `/tmp/tmp.jwZSvphOY5`, with `git worktree add --detach … c817080`. I removed it afterwards (`git worktree remove --force`). `git worktree list` shows only the live tree, and `git status` there is clean. Small regex and status fixtures ran in separate `mktemp -d` directories, which I also removed.
- `npm test`: `# tests 29 / # pass 29 / # fail 0`. This matches the preamble.
- `git diff --stat 1f4d3e2 c817080 -- docs/spec.md docs/integration-plan.md`: 2 files, +723/−846.
- **Graph script** (Python, parses the table and every phase's `Blocked by:`/`Output:`). 27 phases, the table matches every phase block, no unknown names, no cycle. The waves match the plan's table. The only non-ancestor of `release-bump` is `purge-git-history`, which is the only sink. The longest path to `release-bump` has 8 phases. There are **5 tied longest paths**: the plan names one; two of the others run through the hitl validations. Every `‖` group is Output-disjoint and has no path between its members.
- **Removed-name grep** (`remote-config|multi-poster|frame-per-source|coming-attractions|bulb-animation|frame-rotation|p[0-3]-gate|publish`). The only hits are non-goal and deferred mentions, plus D13 "no publish" statements.
- **Guard audit.** Every `! grep` criterion is preceded by `test -f` on its file, and every `node --test` criterion has `test -f` guards. An awk check found that every `**R-…**` requirement in the spec has acceptance bullets.
- **Command forms exercised at HEAD**, all with stdin `/dev/null`. At HEAD these are expected to fail, because the features do not exist yet; the point is that the form parses and resolves.
  - e2e-harness #4, #6, #7, #9.
  - settings-core #5, #7, #8, #9. #7 passes vacuously at HEAD, the same as r1 accepted.
  - pixel-shift #5 (resolves `stageSize`, exit 1 because `margin` is not implemented yet).
  - frame-brightness #5 (0).
  - pi-stability #1 and fill #6 (both exit 1 on `css/app.css:189 backdrop-filter`).
  - serve-config-guard #4.
  - docs #3 (0), #4 (0), #6 (1, `roadmap missing: Multi-poster landscape layout`), #7 (0).
  - release-bump #1 (prints `2.0.0 2.0.0`), #3 (1).
  - purge #1: a fresh clone of `origin` (github.com/NateDogDotNet/plex-poster-app) succeeded and listed `3a7b688`, `5c4a716`, so the form works.
- **Fixture probes.**
  - rotate-plex-token #4 on the receipt template gives 0, and on `signed-out-all-devices-via-plex-web` gives 0, so r1's M5 is fixed. A 20-character token gives 1 (caught). A **21-character token gives 0 (missed)**.
  - device-helper-server #3: clean file 0, `exec("ls")` 1.
  - release-bump #7: the porcelain/awk form gives 0 on a staged-and-untracked fixture.
  - serve-config-guard #4 against a `serve.mjs` that contains the comment the phase's Notes ask for gives **exit 1**.
- **Service-worker probe** (global Playwright 1.56.1, Chromium 1194). I started `serve.mjs --port 18581` from the worktree and loaded `/`. Once `navigator.serviceWorker.controller` was set, `fetch('index.html',{cache:'no-store'})` returned `ok 200`. I then SIGKILLed the server: the same probe still returned **`ok 200`**, and `page.reload()` still succeeded and rendered `#stage`.

## r1 finding status

### Anchored r1

| ID | Status | Evidence in r2 |
|---|---|---|
| I1 release path skips P0 gates | resolved | plan :586/:651 `release-bump` Blocked by `rotate-plex-token`, `real-server-validation`, `real-server-validation-extended`; criteria :590–591; graph script: all three are ancestors |
| I2 optional asset on the critical path | moot-by-D1 | the artwork phases are gone; graph: the only non-ancestor of the release is `purge-git-history` |
| I3 concurrency vs scope probes | resolved (D12) | plan :20 convention 3 (separate worktrees, own `E2E_PORT`/`E2E_MOCK_PORT`, `git status --porcelain` probes); :672 |
| I4 fill needs pi-stability | resolved | plan :531 Blocked by includes `pi-stability`; :541 |
| I5 validation passes on FAIL | resolved | plan :245, :555 `grep -qx 'Overall: PASS'`; :591; spec :91, :94 |
| I6 remote e2e unrunnable | moot-by-D1 (D7) | spec :292 |
| I7 right-sizing | resolved / accepted-by-D1 | plan :5, 27 phases (26 on the path plus 1 optional), gates removed (:29), merges at :160, :442, :483, :562 |
| I8 dailyReload bricks http LAN | resolved (D6) | spec :185, plan :412. **But the probe half of the guard is untestable as written: see N1** |
| M1 frame-per-source Output gap | moot-by-D1 | — |
| M2 sleep relies on mock stats | resolved | plan :308 "counted with `page.on('request')`, not the mock stats endpoint" |
| M3 remote edges | moot-by-D1 | — |
| M4 vacuous negative greps | resolved | plan :21 convention 4; guard audit is clean |
| M5 token regex false positive | resolved (hyphen case) | plan :129; probe gives 0 on the hyphenated word. **A new under-match is in N4** |
| M6 purge checks the wrong repo | resolved | plan :610 fresh clone of `origin`; form exercised |
| M7 precache not recursive | resolved | plan :14, :79 (fixture with `js/vendor/x.js`) |
| M8 release criteria lack teeth | resolved | plan :593 (stale `shell-2.0.0` seeded first); :74, :82 lockfile mandatory |
| M9 criteria fix open options | resolved by D15/D2 | :81 Playwright pin per D15; `rotateUi` default ruled by D2 |
| M10 tag routing | resolved | plan :36–48: `risk:high` dropped from `rotate-plex-token` and the rotation phase with reasons, added to `content-rating-filter`; `ui` consistent; `architecture` on `e2e-harness` routes `/tool-fit review` (SKILL.md :60 confirms the tag routes it); no `publish` |
| M11 stale start commit | resolved | plan :10 `46257c3`; :576, :596 |
| M12 visible defaults | moot-by-D1 (bulbs) / accepted-by-ruling D6 (pixel shift) | spec :344 |
| M13 missing acceptance bullets | resolved | awk check: every `R-` requirement has bullets |
| M14 one-file denylist | resolved (D9) | spec :77–79; plan :144, :151 |
| M15 Q6 rationale | resolved (D16) | spec :285; plan :22, :598 |

### Skeptic r1

| ID | Status | Evidence in r2 |
|---|---|---|
| I1 pixel shift vs geometry specs | resolved | plan :24 convention 7 (harness seeds `pixelShift:false`); per-spec greps :169, :208, :453, :494, :512, :537; :270 full suite rerun |
| I2 idle sleep in the preset | resolved (D4) | spec :174 (`idleSleepHours` 0 = off), :194; plan :425 |
| I3 wake lock as sleep mechanism | resolved (D4) | spec :174 "stays held"; plan :308 `releases` unchanged, :313 |
| I4 filter leaks via now-playing and cache | resolved (D5) | spec :233–234; plan :324 Output has `js/poster-cache.js`; :328 cached and now-playing cases |
| I5 bulb animation | moot-by-D1 | spec :295 |
| I6 remote bypasses PIN | moot-by-D1 (D7) | spec :292; plan :574 `PIN-locked` |
| I7 UC4 not delivered | resolved (D3) | spec :98–103; plan :452 |
| I8 serve exposes `.orchestrator`/`docs` | resolved (D9) | spec :79; plan :144 |
| I9 helper deployment | resolved (D8 scope) | spec :204–211 (`cec-ctl`, env passthrough, brightness dropped), :213 power-cycle row; plan :227. The README `hdmi_force_hotplug`/groups note is not required: see N9 |
| I10 first-tap swallow scope | resolved | spec :137–139; plan :474, :478 |
| I11 country prefixes, limit in the preset | resolved (D5) | spec :231, :237–244, :194 |
| m1 `::backdrop` claim | resolved | no transform claim remains (plan :414 says only that the darkening stays) |
| m2 principle 4 | resolved | spec :26; plan :130 header from a file descriptor |
| m3 Host check ignores port | resolved | spec :77, :80; plan :144, :152 |
| m4 recursive precache | resolved | plan :79 |
| m5 `npm ci` lockfile | resolved (D15) | plan :74, :82 |
| m6 R-PROT-4 vs R-FRM-4 | resolved | spec :148, :190; plan :292, :294 |
| m7 whole-stage dim | resolved (D6) | spec :148, :151; plan :290 |
| m8 pixel-shift glide | resolved (D6) | spec :179, :182; plan :269 |
| m9 reload drops fullscreen | resolved (documented) | spec :185, :262; plan :569 `Fullscreen` |
| m10 frame rotation | moot-by-D1 | spec :296 |
| m11 rotation routes | resolved | spec :83; plan :132, :227 |
| m12 kiosk lockout | resolved (D10) | spec :219–223; plan :348 |
| M1 PIN recovery | resolved (D10) | spec :220 |
| M2 tablet topology | resolved | spec :30–36; plan :569 `Supported setups`, :408 Diagnostics lines |
| M3 overlay FS | resolved | spec :256; plan :569 `lost on reboot` |
| M4 RTC | resolved | spec :198, :200; plan :111 |
| M5 DST | resolved | spec :199; plan :105 |
| M6 OS blanking, devtools policy | resolved | spec :274–275; plan :569 |
| M7 Chromium package, labwc | resolved | spec :274; plan :569 (`chromium-browser`, `labwc`) |
| M8 upgrade notice | resolved | spec :282–283; plan :426 |
| M9 overscroll-behavior | resolved | spec :190, :192; plan :408 |

No r1 finding remains open. Two of them have follow-on defects, listed as new issues: N1 (from anchored I8) and N4 (from anchored M5).

## D-entry compliance

| D | Implemented as ruled? | Quote |
|---|---|---|
| D1 | Yes | spec :288–297 deferred table, each row "deferred (D1) → Roadmap"; plan :5 "27 phases (26 on the release path plus one optional)". About 24 was the target; 26 on the path is within "about". Roadmap entries: plan :574 |
| D2 | Yes, with a coverage gap (N5) | spec :50 "Setting `rotateUi` (default true)… OS rotation with `rotateUi` off and app rotation 0 stays supported". The new dialogs (`#pin-dialog`, `#shortcuts`) have no rotation check, and the README is not required to document the OS-rotation option (N9) |
| D3 | Yes, but scheduled after a phase that validates it (N2) | spec :98 "starts the plex.tv PIN flow automatically and shows the code **large and upright**… refreshing it when it expires… Local-network discovery is not part of this plan" |
| D4 | Yes | spec :174 "`idleSleepHours`… 0 = off, the default… **The screen wake lock stays held**… releasing the wake lock is not used as a sleep mechanism… The README tells Pi/Android users to turn OS screen blanking off"; :194 "does not turn on idle sleep (D4)"; :322 `wakeOnPlayback` true |
| D5 | Yes | spec :231–235 (random, cached, now-playing with `limitNowPlaying` default true, owner-pinned exempt, prefixes mapped, unrated excluded, own toggle, not in the preset) |
| D6 | Mechanism yes; the probe is untestable (N1) | spec :59, :66, :179 ("glides over 1.5 s"), :148 (`nightDim` false, target `stage`), :185 ("only when `navigator.serviceWorker.controller` is set **and** a `fetch('index.html', {cache: 'no-store'})` probe succeeds") |
| D7 | Yes | spec :271, :292; plan :574 `grep -q 'PIN-locked' Roadmap.md` |
| D8 | Yes | spec :204–211 (`cec-ctl`/`cec-client`, `wlr-randr` with `WAYLAND_DISPLAY`/`XDG_RUNTIME_DIR` passthrough, temperature, "Brightness control is dropped", loopback-only, opt-in); plan :372 |
| D9 | Yes | spec :77 (allowlist, `config.json` loopback-only, "Host check compares the **hostname only** and ignores the port", "`X-Forwarded-For` and `Forwarded` are never consulted"). Criterion :147 conflicts with the Notes at :152 (N3) |
| D10 | Yes | spec :219 ("**holding OK/Enter for 3 s**"), :220 (`"resetPin": true` via the loopback-only `config.json`) |
| D11 | Yes | spec :91, :94, :285–286; plan :586, :590–591, :599 |
| D12 | Yes | plan :20, :90, :672 |
| D13 | Yes | plan :30, :41, :601; spec :306 |
| D14 | Yes | spec :83; plan :607 (Blocked by `release-bump`, outside the path), :613 "explicitly skipped unless…", `irreversible` tag :37 |
| D15 | Yes | spec :23; plan :74, :81–82 |
| D16 | Yes | spec :219 "A PIN is a deterrent… the UI and README say so"; :285 VERSION once with the corrected rationale; :90/:93 core and extended kept separate; plan :351 |

I found no relaxation of any ruling. The gaps are listed below.

## New issues

### Important

**N1. The D6 daily-reload probe cannot fail under the shipped `sw.js`, and the criterion's "mock down → probe fails" scenario cannot happen.** Class: **code-bug**. It is a criterion that cannot be satisfied as written, and the file the fix needs is missing from Output.
- **Location:** spec R-PROT-3 :185–186 ("with the mock server down (probe fails) none and a logged skip"); plan `pi-stability` #2 :408 ("with the mock server down at 04:00 (probe fails) no reload"); `pi-stability` Output :405, which has no `sw.js`.
- **Evidence:**
  - `sw.js` sends every same-origin, non-navigate GET to `caches.match(request, { ignoreSearch: true })` first, and `index.html` is in `SHELL`. A `fetch('index.html',{cache:'no-store'})` from a controlled page is therefore answered from the shell cache. The `no-store` mode governs only the HTTP cache, not the service worker.
  - Probe, run as described above: with the server alive the probe returns `ok 200`; after SIGKILLing `serve.mjs` it still returns `ok 200`. Also, `mock.down()` (`scripts/mock-plex.mjs` :54) only destroys the *Plex mock's* sockets. The app origin that serves `index.html` is a different server, so "mock down" never touches the probe.
  - The same probe showed that a reload with the host down *does* work while the SW controls the page (network-first navigate, falling back to the cached `index.html`). So there is no safety hole; the risk behind I8 is covered by the controller check.
- **Why it matters:** a correct implementation of the spec cannot pass `pi-stability` #2. That means a false RE-DISPATCH, or the builder works around the test in a way that quietly changes D6's mechanism.
- **Fix:**
  - Add `sw.js` to `pi-stability`'s Output, and make the SW pass `request.cache === 'no-store'` requests straight to the network (or exempt a dedicated probe path from `ignoreSearch` caching).
  - Rewrite the e2e scenario as "the **app server** is unreachable at 04:00": stop `serve.mjs`, or abort the probe request with a route/offline emulation that also covers SW fetches. Do not use `mock.down()`.
  - Make the same wording change in spec :186.

**N2. Core validation checks the first-run code, but the phase that builds it is not a prerequisite.** Class: **code-bug** (hidden dependency).
- **Location:**
  - spec R-VAL-1 :90 ("sign-in PIN flow including the automatic first-run flow (R-FIRST-1)").
  - plan `validation-checklists` #3 :226 requires `'first-run code'` in `real-server-core.md`.
  - `real-server-validation` Blocked by :241/:634 has no `settings-sheet`. R-FIRST-1 is delivered by `settings-sheet` (M3, :442).
  - The plan's own `rotate-plex-token` checklist :132 says "the first-run code appears automatically after `settings-sheet`; until then press Sign in with Plex".
- **Evidence:** in the graph script, `settings-sheet` is not an ancestor of `real-server-validation`. Both are frontier-eligible at waves 3 and 4, so the owner can run the core checklist before the feature exists.
- **Why it matters:** only `Overall: PASS` closes the phase (D11). The first-run row would FAIL or stay PENDING, so M1 stalls, or a reopen loop starts against a phase that has not been built yet.
- **Fix (preferred):** move the first-run row and its `'first-run code'` keyword to `real-server-extended.md`, which is already blocked by `settings-sheet` (:551), and edit R-VAL-1/R-VAL-2 to match. **Alternative:** add `settings-sheet` to `real-server-validation`'s Blocked by. That pulls M3 work into M1, so I do not recommend it.

### Minor

- **N3. `serve-config-guard` #4 contradicts its own Notes.** Class: code-bug.
  - Notes :152 say "`X-Forwarded-For` and `Forwarded` are never consulted; say so in a comment". Criterion :147 is `! grep -qiE 'x-forwarded|forwarded' scripts/serve.mjs scripts/net.mjs`.
  - A fixture `serve.mjs` that contains exactly that comment makes the criterion exit 1.
  - *Fix:* tell the builder to word the comment "proxy headers are never consulted", or narrow the grep to code, e.g. `req.headers\[['"](x-)?forwarded`.
- **N4. The receipt token regex misses tokens longer than 20 characters.** Class: code-bug.
  - Plan :129 uses `[A-Za-z0-9]{20}` bounded on both sides by non-alphanumerics, so it matches only runs of *exactly* 20. Fixture: 20 characters → caught (1); 21 characters → passes (0).
  - Spec :85 says "no 20-character alphanumeric run", and the intent is at least 20.
  - *Fix:* `{20,}`. Hyphenated words still pass, because the run is bounded by `-`.
- **N5. D2 says the dialogs rotate, but the dialogs added after the shell phase are never checked.** Class: code-bug.
  - R-ROT-2 :50 covers "every new dialog". Yet the `kiosk-and-pin` e2e (:348) checks the corner zone at rotation 90 but not `#pin-dialog`'s angle, and the `touch-and-labels` e2e (:474) never rotates `#shortcuts`.
  - *Fix:* add "at rotation 90 the dialog's computed angle is 90 and its box is inside the viewport" to both e2e lists.
- **N6. Harness options that later phases rely on are not exercised by `e2e-harness`, and those phases cannot edit the harness.** Class: code-bug.
  - Several phases use options from the `lib.mjs` contract (:91) but cannot edit `lib.mjs`/`run.mjs` (convention 8): `serveArgs` (helper :392), `serviceWorkers` opt-in (pi-stability :408, release :593), `clock`, `hasTouch` and `localStorage`. Note too that `run.mjs` starts "one `serve.mjs --mock` child" (:90), while `serveArgs` implies a second server for each spec.
  - Separately, the helper e2e reads "the helper's call log", but `device-helper-server` (:368) never requires the fake mode to expose that log over HTTP.
  - *Fix:* add one smoke assertion per option to `e2e-harness` #5. Either specify a fake-only `GET /__helper/calls` in `device-helper-server` #1, or reword the helper e2e to assert the page's `/__helper/display` request bodies.
- **N7. Spec and plan disagree on how the kiosk test supplies `config.json`.** Class: code-bug.
  - Spec :223 says "a `config.json` served by the test root". That needs `serve.mjs --root`, which only `serve-config-guard` adds, and that phase is not an ancestor of `kiosk-and-pin`.
  - Plan :348 says "`config.json` intercepted".
  - *Fix:* use "intercepted by `context.route`" in the spec. `settings-sheet` #4's "`config.json`-provisioned app" case needs the same wording.
- **N8. The request-side rating filter's value list is unspecified.** Class: spec-gap.
  - The mock "honours the filter parameter" (:247, :336), and the PG-13 e2e expects title 6 (`gb/12`).
  - If the request lists only US ladder values, a strict mock (and probably real Plex) drops `gb/12` server-side, so the e2e fails. On real servers the request filter would also hide allowed country-rated titles.
  - *Fix:* state that the request list includes every allowed ladder value **and** every mapped prefixed value, or that the request filter is skipped when the library uses prefixed values.
- **N9. Some README items are not required.** Class: spec-gap.
  - D2's "OS-level rotation with `rotateUi` off stays a documented option": `docs` #1 (:569) has no `rotateUi` keyword.
  - Sceptic I9's README note on `hdmi_force_hotplug` and the `video` group: absent from both documents (grep finds only the `video` group, in spec :205 and plan :379).
  - *Fix:* add `rotateUi` and `hdmi_force_hotplug` to the keyword loop, and add the sentences to R-DOC-7/R-DOC-8.
- **N10. The `serve.test.js` integration port is unspecified under D12.** Class: spec-gap.
  - `device-helper-server` says "a free port" (:368), but `serve-config-guard` #1 (:144) does not. Every concurrent worktree's `npm test` runs `tests/serve.test.js`, so a fixed port collides.
  - *Fix:* "spawned on a free port (`--port 0`, or probe for one)".

## Q19–Q23

- **Q19 (country table): sound.**
  - The rows match the national schemes: BBFC U/PG/12A/15/18, FSK 0/6/12/16/18, ACB G/PG/M/MA15+/R18+, the Canadian home-video scheme G/PG/14A/18A/R, CNC U/10/12/16/18, and Kijkwijzer AL/6/9/12/14/16/18.
  - Unmapped values are excluded, which is consistent with D5.
  - Real stored strings (e.g. `de/FSK 16` vs `de/16`, Quebec `ca/13+`) are rightly (verify) in extended validation.
  - Pair it with N8.
- **Q20 (preset dims the `stage`): sound.** The preset lists each key with a checkbox before applying (:433), so a household that wants frame-only can untick the row or change the target.
- **Q21 (`resetPin` honoured while present): sound.** It is the simplest option with no new state, and the exposure is loopback-only by D9. Optional: also show a one-line boot toast while the flag is present. Diagnostics is reachable by then anyway, because the PIN has been cleared.
- **Q22 (keep the player label, default off): sound.** D1 does not defer U9.
- **Q23 (year ≥ 2026): sound, with one caveat for the README.** Pi OS's `fake-hwclock` restores the last shutdown time, so after a long power-off the clock looks plausible but is stale until NTP syncs. The plan already re-evaluates after a clock jump (:295). That makes the effect brief, but the README should mention it.

## Declined to judge

- **Whether the repository is public or shared** (which decides `purge-git-history`, D14). An unauthenticated-looking clone of `origin` succeeded from this host, but the agent proxy may inject credentials, so the result proves nothing. The owner rules.
- **Hardware and Plex facts** (CEC/`wlr-randr` syntax, `totalSize`, `contentRating` syntax, Chromium flags and policy, package names). These are correctly (verify) and routed to extended validation.
- **Whether 26 phases on the release path meets D1's "about 24".** I read it as compliant. Further merging is the conductor's call, for example the seam the plan offers at :458.
- **The critical-path choice.** Five paths tie at 8 phases (graph script). The plan names one, and its claim that no optional or deferred phase sits on any of them is true. Two of the tied paths run through the owner's hitl validations, so owner latency directly sets the schedule. That is a scheduling observation, not a defect.
- **Phase sizing inside `settings-sheet`** (six requirements). The plan names a split seam, and I did not estimate line counts.

## Assessment

The r2 revision closes every r1 finding: resolved, moot by D1/D7, or accepted by D6. It implements D1–D16 without relaxing any of them. The graph is acyclic and the release ancestry is exactly as D11 requires. The negative-grep and `node --test` guards are uniform, and every requirement has acceptance bullets. The command forms I exercised parse and resolve against the mandated layout.

Two defects remain that would cause false re-dispatches or stalls:
- **N1.** The D6 no-store probe is answered by the shell cache, so the `pi-stability` criterion that expects it to fail when "the mock is down" cannot pass. It needs `sw.js` in Output and a scenario that takes the app server down. A probe confirmed both halves.
- **N2.** The M1 core validation checks the first-run code, which is built in M3 with no edge between them. Move the row to extended validation.

The Minor items N3–N10 are one-line fixes.

**Verdict:** CHANGES REQUESTED
