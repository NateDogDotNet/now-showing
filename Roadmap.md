# Project Roadmap – Now Showing

## ✅ Done in 2.0 (PWA rewrite)

- **Progressive web app**: manifest, icons, service worker, installable, auto-update
- **Offline poster caching**: last 30 posters in the Cache API, rotated while Plex is unreachable, with an "offline" indicator
- **Retry with backoff**: exponential backoff with jitter; status pill shows when the next retry happens
- **Position and scale poster**: size, X/Y offset and fit mode, relative to the frame's window, with live preview
- **Rotate display**: 0/90/180/270° via button, `O` key or settings
- **Toggle now playing**: on/off, optional per-user filter, optional TV episodes
- **Static poster**: pin the current poster from the controls; unpin from controls or settings
- **Config import/export**: JSON file with optional token, plus `config.json` provisioning
- **Pause refresh**: toggle with icon change, not persisted
- Sign in with Plex (plex.tv/link PIN) and automatic server/connection discovery
- Screen wake lock, auto-hiding cursor, keyboard shortcuts, diagnostics log

## ✅ Done in 2.1 (display protection and kiosk)

2.1 is built and covered by unit and browser tests against a mock Plex server. Real-server and Raspberry Pi validation is still pending, so the README tags every unproven flag, command and Plex parameter "(verify)". The version number in the files moves to 2.1.0 at release.

- **Sleep schedule and idle sleep**: a black screen on a schedule or after N hours without playback; the wake lock stays held so playback can wake it
- **Pixel shift**: the picture glides a few pixels every few minutes, on by default
- **Frame brightness and night dim**: a fixed frame brightness and a stepped dim that eases in and out at night
- **Quiet status dot**: no status text on screen, only a tiny dim dot when something needs attention
- **Kiosk mode and a settings PIN**: hidden controls, a corner or Enter hold to reveal them, a lockout after wrong tries, and a loopback-only `resetPin` recovery (the PIN is a deterrent, not security)
- **Household content-rating limit**: random, cached and now-playing posters held to a chosen rating, failing closed
- **Now-playing extras**: rating, runtime and year, a progress bar, and the player name
- **Cache-first posters**: cached posters are reused, not downloaded again, with a cache limit of 100 by default
- **Guarded daily reload**: only where a service worker controls the page and the server answers
- **Device helper**: opt-in `serve.mjs --helper` to switch the TV off while asleep and show the CPU temperature
- **Recommended protection**: one tap turns on the protections for a 24/7 screen, plus a one-time "What's new" notice
- **First-run code on the empty screen**: a keyboardless display shows the plex.tv code by itself
- **Settings rework**: connected summary, minute presets, an Advanced fold, library counts, and error messages with fix buttons
- **Touch and labels**: control labels, a first tap that only wakes the controls, and a `?` shortcuts overlay
- **Rotation of the whole UI**: controls and dialogs turn with the picture
- **Local server hardening**: only app files are served, and `config.json` only to the device itself
- **Browser tests**: `npm run test:e2e` runs Playwright specs against the mock server

## ⏭ Planned for 2.2

Moved out of 2.1 so the screen-protection features ship sooner (D41). Both are fully specified in `docs/integration-plan.md` (phases 22 and 23).

### Drag and nudge poster positioning
Place the poster by dragging it, or with the arrow keys, while Settings is open, instead of with tiny sliders. Works at every rotation (R-SET-5).

### Landscape fill: blurred backdrop or info panel
Use the empty sides of a landscape screen for a dimmed, blurred copy of the poster or a synopsis panel (R-FILL-1).

## 🔜 Ideas

### Auto-discover Plex servers on the local network
Find Plex servers on the LAN automatically so first-run setup is "pick your server, approve the code" instead of typing an IP address and port.

- **Why:** today a new display needs either *Sign in with Plex* (which finds servers through your plex.tv account) or a hand-typed `http://<ip>:32400`. Neither shows the servers on your network before you've signed in, and a keyboardless TV makes typing an address painful.
- **How it can work:**
  - **GDM (Plex's own LAN discovery):** Plex servers answer a UDP multicast/broadcast query (`M-SEARCH`, ports 32410–32414) with their name, port and machine id *(verify exact ports and reply format)*. Browsers can't send UDP, so this runs in the local `scripts/serve.mjs` as an opt-in, loopback-only endpoint (e.g. `GET /__discover`) that the app calls when it's served from that server.
  - **Browser-only fallback:** probe `http://localhost:32400/identity` and the page's own host on port 32400. `/identity` answers without a token and returns the server's machine id and version *(verify)*. This covers Plex running on the same machine as the display.
- **In the app:** a "Servers found on your network" list on the first-run screen. Picking one fills the server URL and starts the sign-in code flow; the token still comes from *Sign in with Plex* or manual entry, since discovery finds servers but never grants access.
- **Constraints:** discovery is opt-in, never sends the token anywhere, and works only on the local network segment (multicast doesn't cross VLANs, so an IoT-VLAN setup still needs sign-in or a manual URL). On an https-hosted copy, browsers block `http://` LAN addresses, so discovered servers are matched to their secure `plex.direct` address after sign-in.

### Multiple libraries
Mix posters from several libraries (movies + TV) in the random pool.

### Collections & filters
Limit random posters to a Plex collection, genre or decade.

### "Coming soon" mode
Show recently added titles with a "Coming Soon" / "New Arrival" frame.

### Remote control
Change poster or settings from a phone on the same network. Deferred from 2.1 (D1, D7).

- **Why it waits:** it is the largest new attack surface for the smallest gain. It opens a listener on the home network, which conflicts with the settings PIN, with a display shared with children, and with putting the display on an isolated VLAN. It also cannot solve first-run setup, which the code on the empty screen already solves.
- **How it could work:** an opt-in `serve.mjs --remote` second listener with a rotating pairing code, an allowlist of non-secret settings, and a loopback-only queue the display polls. A QR code would carry the pairing code and never the Plex token.
- **Constraints (D7):** the QR code appears only inside PIN-locked settings, and no protective setting (sleep, dimming, the content limit, kiosk mode, the PIN) can be changed from the phone.

### Multi-poster landscape layout
Show two or three posters side by side on a landscape screen.

- **Why it waits (D1):** it is a refactor of `js/display.js`, which assumes a single stage, and it lights more of an OLED panel. The 2.2 landscape fill (blurred backdrop or info panel) already covers most of the need.

### Frame per poster source
Choose the frame by where the poster comes from (now playing, random, or a title that is not in the library yet), including new "Coming Attractions" artwork.

- **Why it waits (D1):** it is a cosmetic change that stays inert until the owner draws the "Coming Attractions" artwork, which is a human asset. It pairs naturally with the "Coming soon" mode and the source adapters below.

### Animated frame bulbs
Animate the marquee frame's bulbs.

- **Why it waits (D1):** a moving overlay does not rest the pixels underneath it, which is what burn-in protection needs, and an endless animation keeps a Pi compositing around the clock.

### Frame rotation
Swap the frame daily or weekly to spread wear.

- **Why it waits (D1):** the three built-in frames put their bulb rings within about 1.5 points of each other, so rotating gives little relief beyond pixel shift.

### Sources other than Plex
Show posters from Jellyfin first (Emby is close behind), and optionally mix in "coming soon" titles from TMDB or a Radarr/Sonarr calendar.

- **Why:** many self-hosters run Jellyfin instead of Plex, and a "Coming Soon" frame is better with films that aren't in the library yet.
- **How:** turn `js/plex.js` into the first *source adapter*. Each adapter provides a random pool, what's playing now, poster images and a content rating, in the shape `toPoster` already produces. Two Plex leaks need cleaning up first: the engine imports `pickNowPlaying` from `plex.js`, and some settings and UI text say "Plex". Then add Jellyfin with its own mock server and real-server checklist rows. TMDB and Radarr/Sonarr mix in as extras (for example, one "Coming Soon" poster in every ten) rather than replacing the main source. Radarr/Sonarr are self-hosted, so they probably go through the device helper.
- **Constraints:** every adapter maps its own ratings for the household limit and fails closed (unknown is hidden while a limit is set), with its own adversarial review like `content-rating-filter` had. Jellyfin may need cross-origin requests allowed on the server. TMDB needs a free API key and attribution. Streaming services are out: no public APIs, and scraping breaks their terms.

### "Now showing" theatre mode
When playback starts, show the playing title with a marquee caption such as "Now Showing in the Living Room", using the frame artwork, instead of only switching posters.

### Seasonal schedules
Pick a collection or frame by date range: horror in October, holiday films in December, a kids' collection on weekend mornings. Reuses the schedule helpers that sleep and night dim already use.

### Trailer on demand
Hold OK to play the current title's trailer when Plex has one. It must respect kiosk mode, the PIN and the household content limit.

### Health beacon
An optional status line, served by the device helper, with the time the last poster was shown, the wake lock state and the CPU temperature. Home Assistant or Uptime Kuma can then warn you before you notice a wall display has quietly stopped.

### Home Assistant / MQTT hooks
Sleep and wake the frame from home automations ("lights off → frame sleeps") and publish what's playing. This belongs in the device helper, not the page.

### Presence-based sleep
Wake on motion and sleep when nobody is around, using a PIR sensor on a Pi GPIO pin read by the device helper. It protects the panel better than a fixed schedule.

### Update channel
Diagnostics shows "update available", applies it in one tap, and rolls back if the new version fails its startup check.

### Shared settings for several displays
One `config.json` read by several frames, each with its own rotation and position, for a home theatre with more than one poster frame.

### Synchronised displays
Two frames flanking a screen change together, or show a matching pair (poster and backdrop). Needs coordination between displays, so it is bigger than it looks.

### Panel-aware protection presets
Separate "OLED", "LCD" and "e-ink" choices that set pixel shift, dimming and sleep to suit the panel, extending the recommended-protection preset.

### Burn-in report
Track how many hours a day the frame art stays lit and suggest stronger protection when the number is high.

## 🛠 Engineering backlog

### Split `js/main.js`
It is about 1,440 lines and every feature phase added wiring to it. After 2.1, move sleep and display power, the PIN gate and display protection into their own modules. Do it before the source-adapter work, and not during the 2.1 run, when every remaining phase edits the file.

### Validate on the real server early
Run the core real-server checklist (`docs/validation/real-server-core.md`) as soon as the leaked token is rotated, before more features land. Much of the code rests on unverified guesses, such as the poster download needed for caching, the rating filter syntax and the batched rating re-check (D42).

### Pull request and merge for 2.1
The 2.1 work lives on its own branch. When it is ready, open a pull request so CI (`.github/workflows/ci.yml`) runs on it, and merge once validation passes. Merging is the owner's call (D13).

### Tidy the build workspace
Delete leftover per-phase git worktrees once their phases have landed.

### 2.1.x polish
Two small follow-ups found while writing the 2.1 docs.

- **Recommended protection list shows an internal value.** The night-dim row reads "Dim the whole picture: stage". It should read "The whole picture", the label the Dim select uses. The list prints the stored value (`stage`) instead of the option's label.
- **Pin the "What's new" marker with an e2e.** Add an end-to-end case that an unconfigured boot writes `plexPoster.whatsNew` without showing the notice, so a fresh install never sees it later (K60).
