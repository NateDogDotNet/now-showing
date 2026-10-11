Agent: planning-review-skeptic-r1 · Model: opus · Dispatched: 2026-10-08T20:44:44Z · Method: skeptic + architect + ux technical-feasibility review · Scope: phase planning, round r1, base 4667a0f, staged tree ed72fd4

# Planning review r1: skeptic, architecture and UX lens

## What I read and ran

**Read:** `~/.claude/agents/orchestrator-reviewer.md`, `README.md`, `Roadmap.md`, all of `docs/spec.md` (320 lines) and `docs/integration-plan.md` (988 lines), `css/app.css`, `index.html`, `js/main.js`, `js/display.js`, `js/layout.js`, `js/plex.js` (request, session, pool, transcode and PIN parts), `js/poster-cache.js`, `js/frames.js`, `js/settings.js` (`fromImport`), `sw.js`, `scripts/serve.mjs`, `scripts/mock-plex.mjs` (head), `.github/workflows/ci.yml`, `.gitignore`, `.orchestrator/questions.md`.

**Ran.** Everything ran in a scratch `git worktree` under `mktemp -d` (`/tmp/tmp.SWSmXOWu5N`). The live tree was never modified. The scratch dir has been removed and the server process is gone. During the review HEAD moved to `b44560c` (a conductor commit). `git diff --stat ed72fd4 HEAD -- docs` is empty, so the reviewed docs are byte-identical to the dispatched tree.
- `npm test`: 29 tests, 29 pass (this confirms the plan preamble's "29 tests pass").
- `node scripts/serve.mjs --port 18081 --mock-port 18402 --mock`. Then a Playwright probe (global install, Chromium 1194) seeded settings and measured `#stage`/`#frame` boxes at 1920x1080, 1080x1920 and 1280x800, at each of the four rotations, once with the CSS at base and once with the proposed fix injected.
- A Playwright probe for `<dialog>` top-layer behaviour versus an ancestor `rotate(90deg)`, and for whether `::backdrop` accepts a transform (checked by sampling pixels).
- A probe for individual `translate` composing with `transform` at rotation 90.
- `curl` against `serve.mjs` for files it serves outside the app: `/.orchestrator/x.md` (a planted file) returned 200, `/docs/spec.md` returned 200, `/package.json` returned 200.
- Web searches on Chromium kiosk switches, `vcgencmd display_power` under KMS, the Chromium package name on Pi OS Trixie, and Plex `contentRating` filter syntax. Sources are at the end.

## Strengths

- **The F1 diagnosis and fix are exactly right.** At base, 1920x1080 at rotation 90 gives a stage box of `116,304 → 1804,1384`: the centre is at y=844, not 540, and `.app` overflows (`scrollHeight 1384` against `clientHeight 1080`). 1280x800 at rotation 90 is 225 px low. With the proposed `position:absolute; left/top:50%; transform: translate(-50%,-50%) rotate(...)`, all 12 cases are centred to within 0.5 px, sit inside the viewport and have no overflow.
- **The cache-first design (R-CACHE-1/2) is correct and cheap.** The validity rule (same `thumb`, and stored size at least the requested size) and "do not reorder the index on a hit" both show a real understanding of the write path.
- **The `config.json` guard is well specified.** It normalises the path before checking, uses the socket peer address and never a header, handles `::ffff:` addresses, adds a Host check against DNS rebinding, and states the reverse-proxy hazard.
- **The helper's CSRF defence is sound.** A custom header forces a preflight, no `Access-Control-Allow-*` is ever sent, the Host check stops rebinding, and commands run through `execFile` with fixed argv, a lock and a timeout.
- **The content filter has a client-side safety net**, so a wrong Plex parameter cannot leak a title. The (verify) discipline is applied consistently, and both hitl validation phases are well placed.
- **R-FILL-1 deliberately avoids `filter: blur()` and `backdrop-filter`.** The tiny canvas scaled up by CSS is the right technique for a Pi.
- **The plan mechanics are careful:** Output whitelists, the scope checks with `git diff --quiet`, the single version bump, and the rule that nothing is registered in `FRAMES`/`SHELL` before its PNG exists.

## Claim verification

| # | Claim (location) | Verdict | Evidence |
|---|---|---|---|
| C1 | F1 root cause: the grid row grows to the sideways stage, so the stage lands about 300 px low and clipped (R-ROT-1, plan §5) | **CONFIRMED** | Probe at base, 1920x1080 rot 90: stage `116,304,1804,1384`, centre y 844 (304 px low), `app.scroll=1384/1080`. 1280x800 rot 90: centre y 625. Portrait viewports are unaffected. |
| C2 | The proposed CSS fix centres the stage with no overflow | **CONFIRMED** | Same probe with the fix injected: all 12 viewport x rotation cases are centred (±0.5 px), inside the viewport, and `scroll == client`. |
| C3 | Individual `translate` composes outside `transform`, so the offset is in screen space at every rotation (R-PROT-2) | **CONFIRMED** | Fix plus `translate:16px 0` at rot 90 moves the box to `132,0,1820,1080`, which is +16 px on screen x. The spec order is translate·rotate·scale·transform. Shipped in Chromium 104. |
| C4 | A top-layer `<dialog>` ignores ancestor transforms (R-ROT-2, Q1) | **CONFIRMED** | A modal dialog inside a `rotate(90deg)` wrapper keeps its box at `300x50`. A normal sibling measures `50x300`. |
| C5 | "`::backdrop` cannot be transformed" (plan §8 notes) | **WRONG** | `dialog::backdrop{transform:scale(.5)}` computes to `matrix(0.5,…)`, and the corner pixel (5,5) renders black rather than the red backdrop, so the transform applied. This does not affect the design, since the backdrop stays full-screen. |
| C6 | `totalSize` with `X-Plex-Container-Start=0&X-Plex-Container-Size=0` (R-SET-4) | **UNVERIFIABLE here; plausible** | This is the technique python-plexapi uses for its section counts. No real server was available. It is correctly carried into V1-extended. |
| C7 | Plex `contentRating` filter and its multi-value syntax (R-FILT-1) | **UNVERIFIABLE** | Search found no authoritative statement. Community knowledge is comma-separated OR. The client-side net makes this safe. |
| C8 | `/status/sessions` exposes `viewOffset`, `duration` and `Player.title`/`Player.state` (R-NP-1) | **UNVERIFIABLE here; plausible** | `pickNowPlaying` already reads `Player.state` (`js/plex.js:99`). The fields are standard in plexapi session objects. Note that `viewOffset` only updates when the client reports its timeline (about every 10 s). |
| C9 | `/photo/:/transcode` with `url,width,height,minSize,upscale` | **CONFIRMED as current code** | `js/plex.js:160-167`. It is already in use against the mock. Real CORS behaviour is correctly put in V1-core. |
| C10 | plex.tv PIN flow `POST /api/v2/pins strong=false`, 4-character code at plex.tv/link | **CONFIRMED as current code** | `js/plex.js:185-194`. Not re-run against plex.tv. |
| C11 | Wake Lock is released on hidden and must be re-requested on visible | **CONFIRMED** | Current code already does this (`main.js:363-382`). **But see I3:** acquiring a lock does not wake a display that the OS has already blanked. |
| C12 | Principle 4: "the token never appears in a URL" (spec principle 4, Security section) | **WRONG** | Every Plex request puts `X-Plex-Token` in the query string (`js/plex.js:122`, `buildUrl(... auth)`), as does `imageUrl` (`:166`). In `directImages` mode the token becomes an `<img src>`. The plan's own 401 check also passes the token in a curl URL (plan §3, criterion 4). |
| C13 | `filter: brightness()` on the frame is "rasterised once, not per frame" (R-FRM-4) | **UNVERIFIABLE; likely wrong once anything animates** | For a composited layer Chromium applies CSS filters at composite time as a render pass. That costs nothing while the page is static, but costs every frame while the bulb animation (R-FRM-3) or a transition is running. Needs a Pi measurement. |
| C14 | Opacity-only bulb keyframes mean "no measurable main-thread work while idle" | **CONFIRMED but misleading** | It is true for the main thread. However, an infinite CSS animation keeps the compositor and GPU producing frames at vsync, 24/7. The page is fully static today (no frames produced), so this is a new continuous GPU load on a Pi. See I5. |
| C15 | `backdrop-filter` is expensive on a Pi | **CONFIRMED (general)** | It is a well-known blur and readback pass. The impact is low because the sheet is rarely open, but the change is cheap. |
| C16 | `--overscroll-history-navigation=0` and `--disable-pinch` | **CONFIRMED that they exist; effectiveness doubtful** | Both are long-standing switches. Kiosk users report that `--overscroll-history-navigation=0` does not always stop swipe-back on touch Linux builds (balena forum). The README should also recommend CSS `overscroll-behavior: none` on `html, body` (the app already sets `overflow:hidden`). The spec's alternative `--disable-features=OverscrollHistoryNavigation` is unverified. |
| C17 | `vcgencmd display_power` is legacy/fkms only and does not work under KMS | **CONFIRMED** | Multiple reports for Bullseye and Bookworm KMS: it returns `display_power=1` and does nothing. The plan states this correctly. |
| C18 | `wlr-randr --output HDMI-A-1 --off/--on` | **CONFIRMED syntax; deployment hazard not covered** | It needs `WAYLAND_DISPLAY` and `XDG_RUNTIME_DIR` from the compositor session. The README's `systemctl --user` + linger service starts outside that session, so the helper's `execFile` will fail unless the env is passed. There is also no X11 (`xrandr`) strategy for users who switch back to X11. |
| C19 | `cec-client -s -d 1` with `on 0`/`standby 0` on stdin | **CONFIRMED syntax; UNVERIFIABLE under KMS** | Under KMS, CEC goes through `/dev/cec0`. `cec-ctl -d /dev/cec0 --to 0 --standby` (v4l-utils) is the more reliable fallback and should be a listed strategy. It also needs `video` group access. |
| C20 | `ddcutil setvcp 10 <n>` for brightness | **CONFIRMED syntax; useless for the persona** | VCP 0x10 is brightness, but consumer TVs (and OLED TVs specifically) almost never implement DDC/CI over HDMI. It needs `i2c-dev` and the `i2c` group. |
| C21 | `/sys/class/backlight/*/brightness` | **CONFIRMED path; not applicable to HDMI** | It exists only for DSI panels. Writing needs root or a udev rule, and the helper runs as the user. |
| C22 | `/sys/class/thermal/thermal_zone0/temp` / 1000 | **CONFIRMED** | Standard millidegree file. |
| C23 | Overlay FS via raspi-config (Performance Options > Overlay File System) | **CONFIRMED path; side effect not covered** | With the overlay on, every localStorage and Cache API write lands in RAM and is lost on reboot. Settings changed later (including by phone remote), the poster cache and the PIN lockout all reset. See M3. |
| C24 | `--disk-cache-dir=/dev/shm/...`, `--disk-cache-size` | **CONFIRMED (long-standing switches)** | Unverified on the installed build, and correctly marked (verify). |
| C25 | 288 downloads and writes per day at a 5-minute rotation | **CONFIRMED arithmetic** | 1440/5 = 288. Note that about 300 × ~200 KB/day is negligible SD wear next to Chromium's own profile writes, so the SD-wear framing is overstated. Cache-first is still worth it for network and latency. |
| C26 | The Chromium package for the README (current `chromium-browser`) | **Partly stale (spec-gap)** | Debian 13 / Pi OS Trixie ships `chromium` (`/usr/bin/chromium`). Bookworm used `chromium-browser`. The docs phases should cover both. |
| C27 | The existing CI precache check would accept `js/vendor/qrcode.js` | **WRONG** | `ci.yml` uses `fs.readdirSync("js")`, which returns the `vendor` directory itself, and that entry is not in `SHELL`. CI fails as soon as `js/vendor/` exists unless `check-precache.mjs` walks subdirectories. |
| C28 | The CI job runs `npm ci` | **Fails as planned** | `npm ci` requires `package-lock.json`, which the plan makes conditional ("only if npm install runs"). |

## Issues

### Critical

None. I found nothing in the documents that would ship a broken or dangerous build if executed as written.

### Important

**I1: `pixel-shift` (default on) breaks `rotation.spec` and `layout-rotation-fix` cannot see it.** Class: code-bug.
- **Location:** plan §5 criterion 1 (centre within 1 px; limiting dimension within 2 px of the viewport), §12 (default `pixelShift:true`, stage at 97 %), §34 criterion 4 (re-runs `rotation`), p1-gate criterion 2.
- **Evidence:** The §12 Output does not include `tests/e2e/rotation.spec.mjs`, and §5 does not seed `pixelShift:false`. After `pixel-shift` lands, the stage is 3 % smaller and shifted by up to about 16 px. The C3 probe moved it 16 px at rot 90. `npm run test:e2e` in `p1-gate` then fails and no phase may fix the spec.
- **Fix:** §5 seeds `pixelShift:false` in `rotation.spec` (settings can carry unknown keys harmlessly until the schema lands), or §12 adds `rotation.spec.mjs` to its Output with the margin and shift tolerances. Audit `ui-rotation`, `status` and `position` the same way.

**I2: The idle-sleep trigger defeats UC2, and the Recommended preset turns it on.** Class: spec-gap.
- **Location:** R-PROT-1 ("idle" = no playback for `idleSleepHours`), R-PROT-5 (3 h).
- **Why it matters:** The app's main idle job is random rotation while nothing plays (UC2). In most households nothing plays for most of the day. With the preset, the hallway screen is black about 3 h after the last movie ends, which in practice means most of every day. A touch only wakes it for 60 s. The owner pressed a button labelled "protection" and lost the feature.
- **Fix:** Drop idle sleep from the preset. Alternatively, redefine "idle" as no human input and no playback, with a much larger default, or present it as "Sleep when nothing has played for N hours (screen stays black between movies)".

**I3: Releasing the wake lock is not a sleep mechanism, and re-acquiring it does not wake the screen.** Class: code-bug (the spec's mechanism is wrong as written).
- **Location:** R-PROT-1 ("wake lock released so OS/TV power saving can act … On wake, the wake lock is re-acquired"), plan §14.
- **Evidence:** The Screen Wake Lock API only prevents future dimming and locking. It never turns a blanked display back on. If OS blanking (Pi OS "Screen Blanking", Android's screen timeout) fires during sleep, then on playback the veil lifts behind a dark screen and stays dark until a human touches the device. On a tablet, an OS sleep also suspends the page, which then cannot poll for playback at all. The e2e stub (`__wakeLock.held`) cannot see this.
- **Fix:**
  - State plainly that wake-on-playback works only while the page keeps the panel lit (black veil, lock held) or via the helper's power-on.
  - Make "hold the lock while asleep" the default when `wakeOnPlayback` is on.
  - Document that OS blanking must be off on a Pi kiosk. There is also an unverified risk: Chromium's Linux wake lock may not inhibit labwc/swayidle at all.

**I4: The content filter leaks through now-playing and the offline cache.** Class: spec-gap (now-playing) and code-bug (cache).
- **Location:** R-FILT-1 ("now-playing and an owner-pinned poster are deliberate and not filtered"), `js/main.js:129-136` (`cache.random()` offline fallback), R-CACHE-1 (every shown poster is cached, now-playing included).
- **Why it matters:** For UC6, a parent watching an R film in the bedroom puts its poster in the hallway. That is not "deliberate" for the child in the hallway. Worse, that poster is now in the cache, and the next outage rotates it as a "random" (`source: 'cache'`) poster. The ladder filter never sees it, because the index has no `contentRating` until `metadata-overlay`, which lands later.
- **Fix:**
  - Add `contentRating` to the cache index in `content-rating-filter`.
  - Apply the limit to `source: 'cache'`.
  - Add a setting (default on when a limit is set) to apply the limit to now-playing as well. Owner-pinned can stay exempt.
  - Move the `toPoster.contentRating` and index-entry work into `content-rating-filter`'s Output (`js/poster-cache.js`).

**I5: The bulb animation does not protect the bulbs and costs continuous GPU time.** Class: code-bug (the mechanism does not meet its stated aim).
- **Location:** R-FRM-3, plan §15, default `bulbAnimation:true`.
- **Evidence:**
  - The `#bulbs` layer is bright radial-gradient dots at 35-100 % opacity drawn *over* the PNG bulbs. The underlying bulb pixels stay at their full static brightness the whole time, so the brightest static pixels are never rested. A twinkle that brightens a bulb wears it more, not less.
  - Per C14, an `infinite` CSS animation keeps Chromium compositing at vsync around the clock on a Pi 4. Today the page produces no frames between posters, and the plan itself cites Pi heat (E9).
  - "Subtle" twinkling is visible, so defaulting it on contradicts principle 3 (only imperceptible protections default on).
- **Fix:** If kept, use *dark* dots, or an opacity dip of the frame's bulb ring, to actually lower bulb luminance. Animate in steps (for example a change every 30-60 s with a 2 s transition) rather than an infinite animation, so the compositor idles between steps. Default it off. Better still, defer the whole phase (see Cut).

**I6: The phone remote bypasses the kiosk PIN and the content limit, and the QR sits on the wall for children.** Class: spec-gap (security and persona conflict).
- **Location:** R-REM-1 (allowlist includes `maxContentRating`, sleep and fill; the QR is shown in "the first-run empty state"), plan §39 ("honour the kiosk PIN only for the Settings sheet, not for the phone").
- **Evidence:** `showEmpty(true, err.message)` also shows the empty card on any failure with no current poster (`js/main.js:139`), so the QR appears outside first run as well, ungated. Any child with a phone can scan it and set `maxContentRating:''`, which defeats E12/E14 for the hallway-OLED persona.
- **Additional gaps:**
  - "single use per session" has no defined session or phone credential. If the phone keeps the code, it loses access every 10 min.
  - The lockout is per IP. Per-IP is defeatable with IPv6 privacy addresses; a global lockout instead becomes a LAN DoS.
- **Fix:**
  - Show the QR only inside the PIN-gated Settings, never in the empty card.
  - Remove `maxContentRating`, `kioskMode` and anything protective from the allowlist, or require the PIN in the phone page when one is set.
  - Define the pairing result as a short-lived session token issued by `/__remote/apply`.

**I7: UC4 (first-time setup without a keyboard) is not actually delivered.** Class: spec-gap.
- **Location:** Goal and UC4; Personas ("no keyboard on the device"); current flow `main.js:443` opens Settings, but the PIN flow starts only on a click of `#signin-btn`. R-REM-1 cannot set the token or server (excluded from the allowlist).
- **Why it matters:** A Pi with only a TV attached cannot press "Sign in with Plex". The QR remote cannot help because it cannot carry the connection. The only keyboardless path is `config.json`, which needs filesystem access.
- **Fix:** When unconfigured, start the plex.tv PIN flow automatically and show the 4-character code on the empty-state card (large, upright), refreshing it on expiry. This is a small change in `settings-ui.js`/`main.js` and is worth more than the whole remote feature for UC4.

**I8: Under `--host 0.0.0.0`, `serve.mjs` serves `.orchestrator/` and `docs/` to the LAN.** Class: spec-gap (R-SEC-1 scope).
- **Location:** `scripts/serve.mjs:38` (`BLOCKED` covers only `.git|node_modules|tests|scripts|design`), R-SEC-1.
- **Evidence:** A planted `/.orchestrator/x.md` returned **200**, and so did `/docs/spec.md`. The plan's hitl phases write `docs/security/token-rotation.md` and `docs/validation/*` (validation notes ask for pasted Diagnostics output: server URL, token prefix and log). The audit trail may hold anything an agent wrote.
- **Fix:** In `serve-config-guard`, switch to an allowlist of served paths (`index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `assets/`, `config.json` loopback-only), or at least block every dotfile, `docs/` and `package*.json`. Add LAN-address 404 assertions for `/.orchestrator/…` and `/docs/…` to criterion 1.

**I9: Device-helper strategies fail as deployed, and the brightness half does not fit any persona.** Class: spec-gap.
- **Location:** R-HELP-1, plan §19. Claims C18 to C21.
- **Why it matters:**
  - The helper runs inside the `systemctl --user` service, which has no `WAYLAND_DISPLAY`, so `wlr-randr` fails.
  - CEC under KMS wants `/dev/cec0` and the `video` group.
  - `ddcutil` is unsupported on TVs, and the backlight sysfs files do not exist on HDMI.
  - When a TV is put in standby via CEC, or the output is turned off, the Pi can lose hotplug/EDID. The compositor may then reconfigure or resize the kiosk window, and Chromium may mark the page hidden. Hidden pages get intensive timer throttling (about once a minute after 5 min), which delays wake-on-playback.
- **Fix:**
  - Scope the helper to power (CEC via `cec-ctl` or `cec-client`, plus `wlr-randr` with an explicit `--wayland-display`/env passthrough) and temperature.
  - Drop real brightness.
  - Add README notes for `hdmi_force_hotplug`/`video=HDMI-A-1:…` and the user groups.
  - Add a V1-extended row: "after power-off then power-on, the window is still full-screen and playback wakes within N s".

**I10: The first-tap-swallow rule, as written, eats the first tap inside Settings and on the empty-state button.** Class: code-bug.
- **Location:** R-CTRL-2 ("a tap anywhere … only reveals the controls; no action fires"), plan §28.
- **Evidence:** `wake()` runs on every `pointerdown` document-wide (`main.js:354`) and hides the controls after 3.5 s even while a dialog is open. Under the rule as worded, after 3.5 s of reading Settings the next tap on Save or a toggle is swallowed. The same happens to "Open settings" on the empty card.
- **Fix:** Swallow only when `wasVisible` is false **and** the target is inside `#controls` (or the bare stage), **and** no dialog is open, **and** `pointerType !== 'mouse'`. Add those cases to the e2e criterion.

**I11: The country-prefixed ratings rule empties non-US libraries, and the preset applies it unasked.** Class: spec-gap.
- **Location:** Q7 (exclude `gb/15` and similar), R-PROT-5 (PG-13 in the preset).
- **Why it matters:** Libraries using non-US metadata agents store ratings like `gb/15`, `de/12` or `au/M`. A non-US owner who presses "Recommended protection" gets "No posters found". A household without children gets a content limit from a button labelled *protection* (the per-row untick is easy to miss).
- **Fix:** Take Q7 option C, mapping the common `gb/`, `de/`, `au/`, `ca/`, `fr/` and `nl/` prefixes onto the ladder. Leave the content limit out of the preset and offer it as its own "Household with children" toggle.

### Minor

**m1: The `::backdrop` claim is wrong** (C5). Class: code-bug. Location: plan §8 note. Fix: delete the claim (harmless to the design).

**m2: Principle 4 is false for the existing code** (C12). Class: code-bug.
- **Fix:** Reword it to "never in a QR, export, log, helper or remote response". Optionally move Plex requests to the `X-Plex-Token` header, where CORS allows it; images cannot, since `<img>` cannot send headers. The §3 owner check should send `-H "X-Plex-Token: $OLD_PLEX_TOKEN"` rather than putting the token in the URL (shell history and proxy logs).

**m3: The Host check must ignore the port.** Class: code-bug.
- **Location:** R-SEC-1, R-HELP-1 ("Host must be `localhost`, `127.0.0.1` or `[::1]`").
- **Why it matters:** Browsers send `localhost:8080`, so a literal comparison refuses the app itself.
- **Fix:** Parse with `new URL('http://'+host).hostname`, compare the hostname case-insensitively, and allow the port. Never consult `X-Forwarded-For` or `Forwarded` (state it explicitly so no one "helpfully" adds it).

**m4: `check-precache` must recurse into `js/vendor/`** (C27). Class: code-bug. Location: plan §1 criterion 3, §39. Fix: walk subdirectories and require `js/vendor/qrcode.js` in `SHELL`.

**m5: `npm ci` without a committed lockfile** (C28). Class: code-bug. Location: plan §1 criterion 8 and Output. Fix: make `package-lock.json` mandatory, or use `npm install --no-save` in CI.

**m6: R-PROT-4 and R-FRM-4 contradict each other.** Class: code-bug. R-PROT-4 says "no animated `filter`", while the R-FRM-4 / plan §13 notes allow "a single 60 s CSS transition on the filter value". Fix: pick stepped minute updates and say so in both places.

**m7: Night dim leaves the poster at full brightness.** Class: spec-gap. The poster is most of the lit area at night, so dimming only the frame is of limited use for a dark hallway. Fix: add an option to dim the whole stage (one opacity or brightness on `#stage`, stepped).

**m8: Pixel shift steps are instant 16 px jumps** (`transition` covers only `transform`, `css/app.css:43`). Class: spec-gap. On a 55" panel such a jump is visible when someone is looking. Fix: give `translate` a 1-2 s transition (allowed by R-PROT-2's ≤2 s rule) and say so.

**m9: The daily reload drops API fullscreen** for tablets in a browser tab (`requestFullscreen` needs a user gesture). Class: spec-gap. Fix: skip the reload when `display-mode` is `browser` and `document.fullscreenElement` was set, or document it.

**m10: Frame rotation offers little burn-in relief.** Class: spec-gap. The three built-in frames are all marquees whose bulb rings and windows sit at nearly the same percentages (`js/frames.js` windows within about 1.5 points). Rotating among them moves bulbs by only a few pixels, which pixel shift already does. See Cut.

**m11: The R-SEC-2 claim that "sign out of all devices" rotates the token is under-specified.** Class: spec-gap. Plex revokes per device under Authorized Devices. A password change with "sign out of connected devices" is the documented account-wide reset. Fix: list both in the hand-off and keep (verify).

**m12: The Kiosk + `disableShortcuts` + TV-remote persona can lock itself out.** Class: spec-gap. The reveal is pointer-only, so a landscape-TV owner with only a D-pad cannot get back in, and there is no PIN recovery anywhere. Fix: add a key reveal (hold Enter/OK 3 s) and a documented recovery (a `config.json` with `"resetPin": true`, loopback-only, or `?reset` on loopback).

## Cut / defer recommendations (proportionality)

The plan is 44 phases for a roughly 1,500-line hobby app, which is about 3 phases per 100 lines of existing code. Each phase carries an e2e spec, a review and a gate, so maintenance cost will outlive the features. For the three personas, here is the value per phase as I see it:

| Keep (high value per cost) | Defer / cut | Why |
|---|---|---|
| e2e-harness, serve-config-guard (+I8), layout-rotation-fix, cache-first-fetch, status-indicator (drop the drifting dot: just hide the pill when idle), rotate-plex-token, real-server-validation, settings core | **multi-poster-layout** (cut) | `risk:high`, a refactor of `display.js`, lights more OLED area, and no persona asked for it. |
| sleep-mode (with I2/I3 fixed), pixel-shift, pi-stability, content-rating-filter (with I4/I11), kiosk-and-pin, docs-hardening | **remote-config-server + remote-config-ui** (defer) | It is the largest new attack surface (LAN listener, vendored runtime file, devDependency), it conflicts with the kids persona (I6) and the VLAN advice (R-DOC-5), and it cannot solve UC4 (I7). Auto-starting the PIN flow covers UC4 instead. |
| connection-card, settings-time-and-advanced, actionable-errors, touch-and-labels (with I10) | **bulb-animation** (defer or redesign, I5); **frame-rotation** (cut, m10) | Questionable protection value, continuous GPU cost, and frame-rotation is on the critical path. Cutting both shortens the critical path by 4 phases. |
| device-helper-server/integration **narrowed to power + temperature** | **frame-per-source + coming-attractions-artwork + -register** (defer) | Three phases, one of them hitl, for a cosmetic header change that stays inert until the owner draws artwork. |
| frame-brightness (whole-stage dim option, m7) | **position-drag-nudge, fill info panel, metadata-overlay, now-playing player label** (defer to a 2.2 polish milestone) | Nice to have, and they edit the same hot files, which serialises the plan. |
| | **Gates:** merge p0..p3 into two | Each gate re-runs the full suite. Two gates (after P0 and before release) give the same assurance. |
| | **purge-git-history** keep as optional hitl | It is already correctly optional and placed last. |

With these cuts the plan comes to about 22-24 phases and loses most of its `risk:high` tags.

**Defaults that would surprise a real user.**
- Bulb twinkle on by default (visible).
- Pixel shift shrinking the frame 3 % on upgrade (just perceptible, but acceptable).
- The preset adding a PG-13 limit and 3 h idle blackout (I2, I11).
- The daily reload dropping tab fullscreen (m9).

**Conflicts.**
- Wake lock versus sleep (I3).
- Bulbs versus Pi heat (I5).
- Remote versus PIN and kids (I6).
- Remote versus VLAN isolation (already noted).
- Pixel shift versus the rotation tests (I1).
- Pixel shift versus UI rotation: no conflict (C3 confirmed).

## UX soundness of proposed designs

- **Connected card:** sound.
- **Minute presets:** sound. The plan correctly stores seconds and adds no migration.
- **Kiosk long-press:** fine for touch, but D-pad users need a key equivalent (m12). 96 px is about 1 cm on a 55" 1080p panel, which works for a mouse, but put the zone in the hint text.
- **QR pairing:** see I6/I7. The flow is also clumsy when the code rotates every 10 min while the phone page is open.
- **First-tap wake:** right idea, but the scope is wrong (I10).
- **Fill modes:** blur via tiny-canvas upscaling is right on a Pi, but expect visible bilinear banding at about 80x scale. A 48-64 px canvas still costs nothing. The info panel is fine but deferrable.
- **Frame per source:** a reasonable mechanism, but worthless until the artwork exists.

## Missing (neither document covers)

- **M1: PIN recovery** for a forgotten PIN on a keyboardless kiosk (m12).
- **M2: Insecure-context degradation for the tablet persona.** A tablet loading the app from the Pi over `http://<lan-ip>` has no service worker, no install, no Cache API, no Wake Lock and no `crypto.subtle`. The tablet persona's "installed PWA" therefore needs https hosting (and then `plex.direct`), and then none of the `serve.mjs` features (config guard, helper, remote) apply. The spec should state the supported tablet topology.
- **M3: Overlay FS side effects** (C23). Settings, cache and lockout are lost on reboot. The documented flow must be "configure everything, then enable the overlay", and phone-remote changes will not survive a reboot.
- **M4: Clock at boot.** A Pi has no RTC. Until NTP syncs, the sleep and dim schedules and the 04:00 reload run on the wrong time. Defer schedule evaluation until a plausible clock (for example a year ≥ the build year, or the first successful Plex `Date` header).
- **M5: DST transitions** for `msUntilNext`/`inWindow`: a 01:00-07:00 window on change nights, and a 02:30 daily reload that may not exist or may occur twice. Add unit cases.
- **M6: OS screen blanking and Chromium devtools on the Pi.** Recommend turning off Pi OS Screen Blanking (I3), and setting the Chromium policy `DeveloperToolsAvailability: 2`. Otherwise anyone with a USB keyboard reads the token from localStorage in two keystrokes.
- **M7: Chromium package name** on Trixie-based Pi OS (C26), and labwc autostart versus XDG autostart for the README kiosk recipe.
- **M8: Upgrade notice.** 2.0 to 2.1 auto-reloads installed clients into visibly different behaviour (smaller stage, twinkle) with no changelog toast.
- **M9: `overscroll-behavior: none`** on `html, body` as the in-page backstop for swipe-back (C16), which costs nothing next to the Chromium flags.

## Declined to judge

- **Q1 (rotate the whole shell versus OS rotation).** This is a product call. I note that every persona can rotate at OS level except a Chromecast-class browser, which has no input anyway. Option B would remove about 60 lines of per-dialog CSS and a `risk:high` phase, but I do not rule on it.
- **Q8 (history purge).** This is the owner's call. The plan handles it correctly.
- **Q3 (vendoring a QR library).** I recommend deferring the remote feature entirely, so I make no ruling on the encoder choice.
- **Whether the Playwright 1.56.1 pin matches Chromium build 1194.** Not checked against the Playwright release table. The harness phase will discover it immediately.
- **Bulb detection accuracy** (the "about 58 bulbs" estimate on `marquee.png`). Not run. It is moot if the phase is deferred.
- **Exact Plex filter syntax and session fields** (C6 to C8). Correctly routed to the hitl validation; no real server was available here.

## Assessment

The documents are unusually careful about mechanics: whitelists, verification, secret hygiene, the precache invariant and hitl routing. The P0 core is technically correct; I reproduced F1 and confirmed the fix.

The problems are in the P1 and P3 *design* layer:
- Two protection features do not do what they claim. Bulbs do not rest the bulb pixels (I5), and releasing the wake lock cannot be undone by re-acquiring it (I3).
- The Recommended preset turns the display black most of the day and can empty non-US libraries (I2, I11).
- The content filter, the headline child-safety feature, leaks through now-playing and the offline cache (I4), and the phone remote bypasses it and the PIN (I6).
- The keyboardless first run (UC4) is still not delivered (I7).
- The dev server exposes `.orchestrator/` and `docs/` to the LAN (I8).
- One test conflict, pixel shift against the rotation spec (I1), would fail the P1 gate with no phase allowed to fix it.

Separately, the plan is roughly twice the size these personas justify. I recommend cutting or deferring about 20 phases, with remote config, multi-poster, frame rotation, bulbs and coming-attractions first.

None of this is Critical, but I1 to I11 should be resolved in the spec and plan before dispatch, because each one changes either a default, an Output list or a requirement's mechanism.

Sources: [balena forum: swipe-back still works with the flag](https://forums.balena.io/t/how-to-disable-left-swipe-on-chromium/368877) · [404techsupport: overscroll-history-navigation](https://www.404techsupport.com/2014/02/disable-backforward-navigation-swiping-gestures-in-google-chrome-for-windows/) · [DietPi: display blanking under KMS](https://dietpi.com/forum/t/display-blanking-under-kms/19149) · [MagicMirror forum: vcgencmd under KMS](https://forum.magicmirror.builders/topic/16865/mmm-remotecontrol-or-vcgencmd-issue/14) · [Debian trixie arm64 chromium file list](https://packages.debian.org/ja/trixie/arm64/chromium/filelist) · [linuxiac: Raspberry Pi OS on Debian 13](https://linuxiac.com/raspberry-pi-os-based-on-debian-13-now-available-for-download/) · [python-plexapi search rewrite PR](https://github.com/pushingkarmaorg/python-plexapi/pull/693)

**Verdict:** CHANGES REQUESTED
