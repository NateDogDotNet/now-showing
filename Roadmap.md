# Project Roadmap – Plex Poster Display

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

## 🔜 Ideas

### Auto-discover Plex servers on the local network
Find Plex servers on the LAN automatically so first-run setup is "pick your server, approve the code" instead of typing an IP address and port.

- **Why:** today a new display needs either *Sign in with Plex* (which finds servers through your plex.tv account) or a hand-typed `http://<ip>:32400`. Neither shows the servers on your network before you've signed in, and a keyboardless TV makes typing an address painful.
- **How it can work:**
  - **GDM (Plex's own LAN discovery):** Plex servers answer a UDP multicast/broadcast query (`M-SEARCH`, ports 32410–32414) with their name, port and machine id *(verify exact ports and reply format)*. Browsers can't send UDP, so this runs in the local `scripts/serve.mjs` as an opt-in, loopback-only endpoint (e.g. `GET /__discover`) that the app calls when it's served from that server.
  - **Browser-only fallback:** probe `http://localhost:32400/identity` and the page's own host on port 32400. `/identity` answers without a token and returns the server's machine id and version *(verify)*. This covers Plex running on the same machine as the display.
- **In the app:** a "Servers found on your network" list on the first-run screen. Picking one fills the server URL and starts the sign-in code flow; the token still comes from *Sign in with Plex* or manual entry, since discovery finds servers but never grants access.
- **Constraints:** discovery is opt-in, never sends the token anywhere, and works only on the local network segment (multicast doesn't cross VLANs, so an IoT-VLAN setup still needs sign-in or a manual URL). On an https-hosted copy, browsers block `http://` LAN addresses, so discovered servers are matched to their secure `plex.direct` address after sign-in.

### Scheduled dimming / sleep
Blank or dim the screen during configured hours (e.g. 1am–7am).

### Multiple libraries
Mix posters from several libraries (movies + TV) in the random pool.

### Collections & filters
Limit random posters to a Plex collection, genre or decade.

### "Coming soon" mode
Show recently added titles with a "Coming Soon" / "New Arrival" frame.

### Playback progress
Thin progress bar along the frame while something is playing.

### Remote control
Change poster or settings from a phone on the same network.

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
