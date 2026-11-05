# Now Showing

*Formerly Plex Poster Display.* Displays that were signed in before the rename keep their old entry under plex.tv Authorized Devices until they sign in again; new sign-ins list as "Now Showing". Stored settings and sign-in carry over unchanged.

An installable, offline-capable **progressive web app** that shows a Plex movie poster full-screen inside a decorative frame. It's built for Raspberry Pi kiosks, wall-mounted tablets and any other always-on screen.

There's no build step, no backend and no dependencies: just static files that talk to your Plex server directly from the browser.

![Poster inside the marquee frame](assets/screenshots/portrait.png)

> **Status of versions 2.1 to 2.4.1: 2.4.1 is the newest version, on `main` (merged on 2026-11-05 from the branch `2.4.1`, with no pull request, no tag and no GitHub release; D13, D79, D170). It lets one household draw posters from more than one server (up to three, in any mix of Plex, Jellyfin and Emby) and is tested against mock servers only. 2.4.0, also on `main` (merged on 2026-11-03 from the branch `2.4`, with no pull request, no tag and no GitHub release; D13, D79, D155). It adds Jellyfin and Emby as poster sources beside Plex, and it is tested against mock servers only, so every Jellyfin and Emby request is a **(verify)** item (see "Jellyfin and Emby" below). 2.3.1, also on `main` (merged on 2026-11-02 from the branch `2.3.1`, with no pull request, no tag and no GitHub release): it fixes the 2.3 follow-ups (see "Done in 2.3.1" in [`Roadmap.md`](Roadmap.md)). 2.3.0, also on `main` (merged on 2026-11-02 from the branch `2.3`, with no pull request): it has no tag and no GitHub release, and is tested against a mock Plex server only. It adds the rating schedule, poster selection, weighting with no repeats, and viewer profiles (see "Done in 2.3" in [`Roadmap.md`](Roadmap.md)). 2.2.3 (on `main` before 2.3) made the remote's arrow keys move between the control buttons (no tag, no GitHub release). 2.2.2 added the 30 s timeout of keyboard focus on the controls and made the mouse wheel count as activity. 2.2.1 was merged on 2026-10-18 through pull request #4. 2.2.0 was merged on 2026-10-18 through pull request #3. 2.1.0 was validated against a real Plex server; 2.1.1 and 2.2.x are tested against a mock Plex server only. Nothing has been run on a Raspberry Pi (D79).** Version 2.2.0 adds drag-and-nudge positioning (`js/position.js`), the landscape fill (`js/fill.js`) and the gap fill inside the frame (`js/layout.js` and `js/fill.js`). The code and its tests (`npm test`, `npm run test:e2e`) run against a mock Plex server, and on 2026-10-14 the app was also checked against a real Plex Media Server: all 17 core rows and the 15 extended rows that need no Pi passed. The 12 Raspberry Pi rows (V1-E11 to V1-E22) were skipped because no Pi was available, and the release was closed without them. Version 2.1.1 (merged on 2026-10-15 through pull request #2) added the 2.1.x fixes and split `js/main.js` into modules; the validation above was done on 2.1.0, not on 2.1.1 or 2.2.x. Anything below that nobody has checked on a Pi is tagged **(verify)**, which means "not yet verified": on a Raspberry Pi or, for one item, with data the test server lacks (the country-prefixed ratings, V1-E04). That covers every Chromium flag, policy and package name, and every OS and helper command. The checklists are in [`docs/validation/real-server-core.md`](docs/validation/real-server-core.md) and [`docs/validation/real-server-extended.md`](docs/validation/real-server-extended.md). If a Pi row is ever run and passes, its tag comes off here.

---

## Contents

- [Features](#features) and [keyboard shortcuts](#keyboard-shortcuts)
- [Quick start](#quick-start)
- [Supported setups](#supported-setups)
- [Raspberry Pi setup](#raspberry-pi-setup)
- [Hardening for 24/7 displays](#hardening-for-247-displays)
- [Tablets](#tablets)
- [Kiosk](#kiosk) (Chromium flags, kiosk mode, the PIN)
- [Network](#network)
- [Jellyfin and Emby](#jellyfin-and-emby)
- [Accounts](#accounts)
- [The helper](#the-helper)
- [Rotation](#rotation)
- [Clock](#clock)
- [config.json](#configjson)
- [Project layout](#project-layout) and [development](#development)
- [Security notes](#security-notes)

---

## Features

| | |
|---|---|
| **Now playing** | Shows the poster of whatever is playing, optionally only for one Plex user. TV episodes show the series poster. |
| **Random rotation** | When nothing is playing, cycles through the top-rated (optionally unwatched) titles of the libraries you choose, and avoids the last 10 shown by default (a number of days can be set instead). |
| **Poster selection** | Settings > Poster selection: tick several movie libraries, narrow them to chosen genres and ratings, or show one Plex collection or playlist instead. The household limit stays a ceiling. (2.3.0) |
| **Favour and no repeats** | Settings > What to show: favour unwatched titles or the best reviewed, and keep a shown poster away for 0 to 30 days, remembered across reloads. The household limit still decides what can show. (2.3.0) |
| **Rating schedule** | Settings > Household > Change the limit during the day: up to 8 time slots, each with its own rating limit (for example G from 06:00, PG-13 from 15:00, no limit from 22:00), every day, weekdays or weekends. If the clock cannot be trusted, the strictest limit you have set applies (the base limit, every slot, and, when any slot names a profile, every profile). (2.3.0) |
| **Viewer profiles** | Settings > Household: named profiles (for example Kids, Teens, Adults), each a limit, the now-playing rule, a poster selection, weighting and a frame. A time slot can switch to a profile. The limit in force stays a ceiling. (2.3.0) |
| **Jellyfin and Emby** | The connection section at the top of Settings (and "Your media server" on the first-run card): pick Plex, Jellyfin or Emby. Jellyfin signs in with a Quick Connect code, or a user name and password when Quick Connect is off; Emby with a user name and password. The household limit works the same for each. (2.4.0, **(verify)** on real servers) |
| **More than one server** | Settings > Add a server: one household draws posters from up to three servers, in any mix of Plex, Jellyfin and Emby. One household limit applies to every poster, whichever server it came from. (2.4.1, on `main`, **(verify)** on real servers) |
| **Pin a poster** | Keeps one poster on screen until you unpin it. |
| **Sign in with Plex** | Enter a 4-character code at [plex.tv/link](https://plex.tv/link) from your phone. The app finds your servers and picks a working address. A manual token and URL are still supported. |
| **Code on the empty screen** | A display that is not set up yet asks plex.tv for a code by itself and shows it large on the empty screen. No keyboard needed. |
| **Frames** | Three built-in marquee frames, no frame, or your own transparent PNG. The poster window is detected automatically. |
| **Live layout controls** | Poster size, X/Y offset and fit mode, previewed live behind the settings panel. |
| **Position poster** | Settings > Frame & layout > Position poster sets the settings sheet aside for a small bar, so you can drag the poster with a mouse or a finger, or nudge it with the arrow keys (Shift for bigger steps). `+` and `-` change the size; Done or Esc keeps the placement, Cancel reverts. (2.2.0) |
| **Landscape fill** | Settings > Frame & layout > Landscape fill uses the empty sides of a landscape screen for a dimmed copy of the poster or a panel with the title, rating, runtime, year and synopsis. Off by default. (2.2.0) |
| **Gap fill** | Settings > Frame & layout > Gap fill fills the empty bands inside the frame window (as at "Fit inside window", or when the poster is sized below 100 %) with a dimmed blurred copy of the poster or one colour from its edge. Off by default. (2.2.0) |
| **Rotation** | 0/90/180/270° for portrait screens mounted sideways. The controls and dialogs turn with the picture. |
| **Works offline** | The app shell is precached by a service worker. Posters you have seen are kept on the device (100 by default) and are reused instead of downloaded again, so the display keeps rotating real artwork while Plex is down, then retries with exponential backoff. Needs https or localhost. |
| **Pause** | Freezes the current poster (not persisted, so a reboot resumes). |
| **Sleep** | A black screen on a schedule (for example 01:00 to 07:00) and, if you want, after N hours without playback. Playback wakes it. See [Sleep](#sleep). |
| **Pixel shift** | Moves the picture a few pixels every few minutes so no pixel stays lit for hours. On by default. |
| **Frame brightness and night dim** | A fixed brightness for the frame, and an automatic dim at night that eases in and out. |
| **Quiet status dot** | No status text on screen. A tiny dim dot appears only when something needs attention (paused, offline). |
| **Kiosk mode and a PIN** | Hides the controls completely. An optional PIN guards Settings, Diagnostics and the token. The PIN is a deterrent, not security. |
| **Content rating limit** | "Household with children": never show posters above a chosen rating, online or from the offline cache. |
| **Now-playing extras** | Optional rating, runtime and year under the poster, a thin progress bar while something plays, and the name of the player. |
| **Recommended protection** | One button in Settings that turns on the protections a 24/7 screen should have. You see the list first. |
| **Daily reload** | A guarded page reload once a day (04:00 by default) so a display that runs for weeks stays fresh. |
| **Device helper** | Optional, off by default. Lets the display switch the TV off while asleep and show the CPU temperature. |
| **Touch-friendly controls** | Labels under the icons on touch screens, and the first tap only wakes the controls. |
| **Errors with a fix** | A message such as "token rejected" comes with the button that fixes it. |
| **Import / export** | Settings as JSON (token optional), or drop a `config.json` beside the app to provision a device. |
| **Diagnostics** | Connection state, cache, service worker, wake lock, sleep, daily reload and clock status, the CPU temperature when the helper is on, plus a log of recent events. |

Choosing posters from more than one server is new in 2.4.1 (on `main`). Jellyfin and Emby as poster sources are new in 2.4 (2.4.0, on `main`). Position poster, Landscape fill and Gap fill are new in 2.2 (2.2.0, on `main`). The poster selection, favouring and no repeats, the rating schedule and viewer profiles are new in 2.3 (2.3.0, on `main`). See "Done in 2.2", "Done in 2.3", "Done in 2.4" and "Done in 2.4.1" in [`Roadmap.md`](Roadmap.md).

### Keyboard shortcuts

Press `?` on the display to see this list in a dialog. The dialog is built from the same table the keys use, so it cannot be out of date. The **Diagnostics** dialog has a **Keyboard shortcuts** button for the same list.

| Key | Action |
|---|---|
| `R` | Next poster |
| `P` / `Space` | Pause / resume |
| `O` | Rotate 90° |
| `F` | Full screen |
| `S` | Settings |
| `D` | Diagnostics |
| `?` | Show the shortcuts overlay |

Tick **Ignore the keyboard shortcuts** (Settings > Kiosk) to switch all of them off, `?` included.

The arrow keys of a TV remote move between the control buttons, in the direction they point on the screen: the first press on hidden controls only shows them, later presses move the focus, and OK or Enter presses the focused button. This is navigation, so the setting above does not switch it off. See R-CTRL-5 in [`docs/spec.md`](docs/spec.md).

### Control labels and the first tap

- **Labels.** Settings > Frame & layout > **Control labels**: *Auto* (the default) puts a text label under each icon on touch screens and a tooltip on hover on a desktop. *Always* and *Never* override that.
- **The first tap only wakes the controls.** When the controls are hidden, the first touch on them or on the poster brings them up and does nothing else, so a pocket-touch or a child cannot hit Settings by accident. Tap again to use a button. A mouse click or a key press works at once. A tap inside Settings or Diagnostics, or on a button of the empty screen, is never swallowed.

### Errors that carry their fix

When Plex can't be reached, the message says what to do and offers the button:

| What went wrong | Button |
|---|---|
| The token was rejected | **Sign in again** (opens Settings and starts the plex.tv code) |
| Plex is unreachable or too slow | **Diagnostics** and **Test connection** |
| No posters found | **Turn off "unwatched only"** (offered only when it is on) |

The buttons appear on the empty screen, under **Test connection** in Settings, and in a toast when you press *Next poster* and it fails. Automatic rotations that fail stay quiet.

---

## Quick start

You need [Node.js](https://nodejs.org) 20+ only for the bundled dev server. Any static web server works.

```bash
npm start            # http://localhost:8080
```

Open the page. A display with no settings yet shows a large code on the empty screen:

1. On your phone go to **plex.tv/link**, sign in and enter the code. The display polls plex.tv every 5 seconds while the code is fresh. If three codes in a row run out unused, it rests for 5 minutes before asking for another (so an unattended display doesn't hammer plex.tv), and it asks for nothing while asleep.
2. When the code is approved, Settings opens with the token, server and movie library filled in. Check them and press **Save**.

Prefer the settings panel? Press **Open settings** on the empty screen, click **Sign in with Plex**, or open *Enter token and server manually* and paste a token ([how to find it](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)) and a URL such as `http://192.168.1.10:32400`. Pick a **library**, then **Save**.

To try the app without a Plex server, run `npm run demo`. Then use token `demo-token` and server `http://localhost:32401`, which is a mock server with generated posters. The demo also starts a mock Jellyfin and Emby server on the Plex mock's port plus 1000 (`http://localhost:33401`).

---

## Supported setups

A page's abilities depend on how it is loaded. Browsers treat **https** and **localhost** as secure contexts and give pages the service worker, the install prompt, the Cache API and the screen wake lock. A plain `http://192.168.x.x` address gets none of them. Diagnostics shows `Secure context: yes|no` and `Service worker: controlling|none` so you can see which kind of page you have.

| Setup | What it is | Status |
|---|---|---|
| **Kiosk Pi with a local server** | Chromium on the Pi opens `http://localhost:8080`, served by `scripts/serve.mjs` on the same Pi. | Supported and recommended. Everything works, including the [helper](#the-helper). Not yet verified on a real Pi. |
| **Installed tablet or TV browser** | The app is hosted over https (GitHub Pages, Netlify, Caddy or nginx with a certificate) and the device installs it. Plex is reached through its `*.plex.direct` https address, which **Sign in with Plex** picks for you. | Supported. The dev server's `config.json` guard and the [helper](#the-helper) do not apply, because they belong to `serve.mjs`. |
| **Tablet loading the Pi's `http://` LAN address** | The Pi runs `serve.mjs --host 0.0.0.0` and the tablet opens `http://<pi-address>:8080`. | Works only as a plain web page. See below. Use one of the two setups above instead. |

**What the plain `http://` LAN page loses:**

- no service worker, so no offline start and no install prompt;
- no Cache API, so no offline posters and no cache-first download saving;
- no screen wake lock, so the tablet or browser may blank the screen;
- no `crypto.subtle`, so the PIN uses a slower built-in hash (it still works);
- the daily reload never happens (it only runs when a service worker controls the page);
- `config.json` is not served to it (the server gives it only to the device itself, see [config.json](#configjson)).

### Installing it as an app

- **On the device itself** (recommended for a Pi): serve the app on `localhost` and open it there. Chrome or Edge will offer *Install*.
- **From other devices**: host the folder on https.

> **https and your Plex server.** A page served over https can't call an `http://` Plex address, because the browser blocks it as mixed content. **Sign in with Plex** handles this by picking your server's secure `*.plex.direct` address automatically. If you enter a URL by hand on an https page, use that `https://…plex.direct:32400` address. Over `http://localhost`, a plain LAN address is fine. Both were checked against a real server: `*.plex.direct` addresses work from outside your home (row V1-E24 of the extended checklist), and the relay fallback works when no direct address is reachable (row V1-E25).

---

## Raspberry Pi setup

This is the recipe for a Pi that serves the app and shows it in a kiosk browser. Every command here is untested on a real Pi in this release, so each is tagged **(verify)** where it depends on your OS.

Install the packages. On Raspberry Pi OS Bookworm the browser package is `chromium-browser`. On Trixie it is `chromium` (verify both names):

```bash
sudo apt install -y chromium-browser nodejs git      # Bookworm (verify)
# sudo apt install -y chromium nodejs git            # Trixie (verify)
git clone https://github.com/NateDogDotNet/now-showing.git ~/poster-display
```

Serve the app on boot with a systemd user service:

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/poster-display.service <<'EOF'
[Unit]
Description=Now Showing web server
[Service]
ExecStart=/usr/bin/node %h/poster-display/scripts/serve.mjs --port 8080
Restart=always
[Install]
WantedBy=default.target
EOF
systemctl --user enable --now poster-display
sudo loginctl enable-linger "$USER"
```

`serve.mjs` listens on `127.0.0.1` only unless you pass `--host`. That is what you want for a Pi that shows its own screen.

To set the Pi up without a keyboard, copy `config.example.json` to `config.json`, fill it in, and the app loads it on first run. Read [config.json](#configjson) before you do.

Then set up the browser as described under [Kiosk](#kiosk), turn off the OS's screen blanking and read [Hardening for 24/7 displays](#hardening-for-247-displays).

---

## Hardening for 24/7 displays

A web page can't switch a screen off, can't stop an SD card wearing out and can't protect a battery. This section is what the page does by itself, what you switch on, and what you have to do outside the app.

### What is on by default

- **Cache-first posters.** A poster that is already cached (same artwork, big enough) is not downloaded again, so a rotating display stops writing to the SD card all day. The cache holds 100 posters by default (`posterCacheLimit`, 10 to 300, set in `config.json` or an imported file; Settings has a **Clear poster cache** button).
- **Pixel shift.** Every 3 minutes (Settings > Display protection) the picture glides about 1.5 seconds to a new spot inside a thin margin. The picture is about 3 % smaller to make room. Untick it to fill the screen edge to edge.
- **A quiet status dot.** With the controls hidden, nothing is drawn while all is well. When the display is paused or offline, a dim dot of at most 8 pixels appears and changes corner every 5 minutes. `statusIndicator` set to `off` (in `config.json` or an imported file) hides it.
- **A guarded daily reload** at 04:00. It also runs on the first wake from sleep if the last reload was over 12 hours ago. Waking the screen by a key, touch or click does not trigger that 12-hour reload. The reload needs a service worker to control the page (https or localhost). The app server must also answer a fresh request just before reloading. Otherwise the reload is skipped and Diagnostics says why. An `http://` LAN page never reloads. The reload waits while any window of the app is open (Settings, Diagnostics, the PIN pad or the shortcuts list). It also waits mid-fade, while a poster loads, while the TV is waking, and during a manual wake. A reload that was skipped is not retried the same day. Two reloads are never closer than 10 minutes.

### What you turn on

Off by default, because you would notice them: sleep, night dim, the content limit, kiosk mode and the helper.

#### Recommended protection

Settings > Display protection > **Recommended protection** lists what it will change and lets you untick rows. **Apply** fills the form and **Save** stores it. Nothing changes before Save. It sets:

- sleep on a schedule, 01:00 to 07:00;
- night dim on, at 60 %, dimming **the whole picture** (this row can't be unticked, because dimming only the border does little in a dark hallway);
- pixel shift on;
- daily reload on.

It **does not** turn on idle sleep, set a content limit, or change the connection, kiosk mode, the PIN or the helper. Use [Household with children](#accounts) and the [PIN](#kiosk) separately.

After you upgrade a configured display to 2.3 (2.3.0), a toast "What's new in 2.3: rating limits by time of day, viewer profiles, and choosing which posters show, favouring unwatched ones." with an **Open settings** button shows once; the button opens Settings at Household, where the rating schedule and the profiles are. A new, unconfigured display shows nothing.

#### Sleep

Settings > Sleep. Two triggers, either is enough:

- **Go black on a schedule** (from / until, windows may cross midnight, local time of the device);
- **Also go black after N hours without playback** (0 = off, the default). With this one the screen stays black between movies.

Asleep means a pure black full-screen cover with the controls hidden and no new posters fetched. **The screen wake lock stays held** while asleep, so the screen stays lit and playback can wake it. Releasing the wake lock would not turn a screen off. A touch or key press wakes it for a minute, then it goes back to sleep. **Wake the screen when something starts playing** (on by default) wakes it for playback, even inside the scheduled window. Pause stops the display from watching for playback, so a paused display will not wake for a movie.

**Turn off your system's own screen blanking**, or the OS will blank the screen by itself and playback can no longer wake it:

- Raspberry Pi OS: in `raspi-config` open Display Options and turn Screen Blanking off, or turn off blanking in the desktop's power settings (verify; the setting differs between X11 and Wayland/labwc).
- Android and iPadOS: set the screen timeout to the longest value or "stay awake while charging" (verify for your device; see [Tablets](#tablets)).

Whether the Pi's Chromium keeps the screen awake under labwc with the wake lock (V1-E16) is not yet verified.

With the [helper](#the-helper) on, sleep also switches the TV off, which is gentler on the panel than black.

#### Frame brightness and night dim

Settings > Display protection. **Frame brightness** (10 to 100 %) dims the frame image for good. **Dim automatically at night** (default 22:00 to 07:00, 60 %) dims further. The dim eases in over the first 10 minutes and out over the last 10, one step a minute, never as a jump. You choose whether it dims *the frame only* or *the whole picture*. The lower of the two values applies. The schedule waits until the clock is set (see [Clock](#clock)).

#### Content rating

See [Accounts](#accounts).

### Smart plug or timer (belt and braces)

Software sleep is a black screen, not a switched-off one. For the best protection, also cut power to the screen at night with a smart plug, a router timer or the TV's own timer.

> **Do not cut power to a Pi that is running.** Pulling power can corrupt the SD card. Shut it down cleanly first (a `shutdown -h` from cron or a systemd timer a few minutes before the plug turns off) or run it with a read-only root (next section). A plug that only powers the screen, not the Pi, has no such risk.

### SD-card wear: read-only root and the Chromium cache

Pi SD cards wear out from constant small writes. Cache-first posters cut most of them. Two further steps:

1. **Read-only root with the Overlay File System.** In `raspi-config` open Performance Options > Overlay File System and enable it (verify the menu names on your OS release). With the overlay on, every write goes to RAM and **is lost on reboot**: your saved settings (they live in Chromium's `localStorage`), the poster cache and the PIN lockout. So **configure everything first, shut the browser down cleanly, then enable the overlay**. The state you saved is what the Pi returns to at every boot. Any later change needs the overlay switched off, then on again. Whether Chromium has flushed its settings to disk by the time you enable it is not yet verified.
2. **Keep Chromium's disk cache in RAM.** Add `--disk-cache-dir=/dev/shm/chromium-cache` and a `--disk-cache-size=<bytes>` to the Chromium command line (verify that both flags are still accepted by your Chromium). `/dev/shm` is memory, so nothing reaches the card.

---

## Tablets

- **Battery.** A tablet held at 100 % charge 24 hours a day risks battery swelling. Use the vendor's charge limit (for example 80 %, if your tablet has one) or put the charger on a smart plug with a timer that cuts power for part of the day.
- **Screen on.** The wake lock only works on https or localhost. Also set the tablet's own screen timeout to its longest value (verify for your device).
- **Fullscreen.** In a browser *tab*, a page reload drops the Fullscreen API state, and the page needs a tap to go full screen again. The daily reload would cause that every night. Installed PWAs and Chromium in `--kiosk` mode are unaffected (verify). On a tablet in a plain browser tab, install the app first or untick **Reload the page once a day**.
- **Swipe-back and pinch.** The page sets `overscroll-behavior: none` so a swipe from the edge does not go back a page. Chromium's own flags for this are under [Kiosk](#kiosk), and they are not yet verified on every touch build.
- **Touch.** The first tap only wakes the controls (see above).

---

## Kiosk

### Chromium command line

Launch Chromium full-screen on the app with these flags (all names are **(verify)**; newer builds may have renamed or removed them):

```bash
chromium-browser --kiosk --noerrdialogs --disable-session-crashed-bubble \
  --overscroll-history-navigation=0 --disable-pinch \
  --app=http://localhost:8080/
```

- `--kiosk --app=…` opens the page full-screen with no address bar.
- `--noerrdialogs --disable-session-crashed-bubble` stop the "Chromium didn't shut down correctly" bubble after a power cut.
- `--overscroll-history-navigation=0` and `--disable-pinch` stop swipe-back and pinch-zoom leaving the app. The first is reported not to work on every touch build. Newer Chromium may need `--disable-features=OverscrollHistoryNavigation` instead (verify). The in-page `overscroll-behavior: none` is the backstop.
- On Trixie the command is `chromium` (verify).

### Autostart

- **Wayland with labwc** (current Raspberry Pi OS): add the command line above to `~/.config/labwc/autostart` (verify the path).
- **X11:** use an XDG autostart file:

```bash
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/poster-display.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Poster Display
Exec=chromium-browser --kiosk --noerrdialogs --disable-session-crashed-bubble --overscroll-history-navigation=0 --disable-pinch --app=http://localhost:8080/
EOF
```

Which of the two your Pi uses depends on the OS release and the session type (verify, row V1-E14).

### Lock out the browser developer tools

Anyone with a USB keyboard can press F12 and read the Plex token from the page's storage in two keystrokes. Set the Chromium policy `DeveloperToolsAvailability` to `2` ("never"; the value 2 itself is (verify)), for example:

```bash
sudo mkdir -p /etc/chromium/policies/managed
echo '{ "DeveloperToolsAvailability": 2 }' | sudo tee /etc/chromium/policies/managed/devtools.json
```

The policy name is documented by Chromium. The directory differs between builds (verify), and you can check what Chromium really loaded at `chrome://policy`.

### Kiosk mode

Settings > Kiosk > **Hide the controls (kiosk mode)** removes the controls completely. They can't be reached with Tab either. A touch, click or key press never brings them back. Two holds do, for 15 seconds:

- press and hold for 3 seconds in the **bottom-right corner as the viewer sees it** (a 96-pixel square, it follows [rotation](#rotation)), with a finger or the mouse;
- hold **OK/Enter** for 3 seconds (for D-pad remotes).

Both work with the keyboard shortcuts switched off. In kiosk mode the long-press menu of touch screens is blocked, except in Settings text fields.

### The PIN

Settings > Kiosk > **Set PIN…**. A PIN is 4 to 8 digits, entered twice. It applies when you press Save. With a PIN set, these ask for it every time: opening Settings, opening Diagnostics, showing the token, exporting with the token, importing a file, **Reset everything**, and the **Turn off "unwatched only"** fix. Hiding the token again needs none. The token hides again when Settings closes. The keypad is on screen, so touch works.

Five wrong PINs in a row lock it for 60 seconds. Each further wrong PIN doubles the lock, up to 15 minutes. Tries while locked are not counted. A right PIN clears the lock.

**The PIN is a deterrent, not security.** It keeps children and visitors out of Settings. It is checked in the browser and stored on the device, so anyone who controls the device (browser developer tools, the file system, a different browser profile) can get around it. There is no server to enforce it. It is never exported, and an imported file's PIN is ignored. Pair it with the developer-tools policy above, and with a [managed user](#accounts) so a stolen token exposes little.

### Forgot the PIN: resetPin

Reset works only from the device itself. In the app folder, add `"resetPin": true` to `config.json`:

```json
{ "resetPin": true }
```

Reload the page. While that flag is in the file, every load clears the PIN and the lock, and Settings opens without a PIN when you ask for it. Diagnostics shows **PIN reset flag present**. A PIN you set while the flag is still there lasts only until the next load. **Delete the flag (or the file) when you are done.** Nobody on the network can use this, because `config.json` is only served to the device itself (see [config.json](#configjson)).

---

## Network

Put the display on an IoT or guest VLAN that can reach **only** your media server (Plex on port **32400**; a Jellyfin or Emby server on its own port, see [Jellyfin and Emby](#jellyfin-and-emby)), and plex.tv on port 443 if you use **Sign in with Plex** or Plex's relay. A stolen or hacked display then can't reach the rest of your home network. A Pi also needs NTP to set its clock (see [Clock](#clock)). Your router's rules differ; this has not been tested on a real network.

Plex's local network discovery does not cross VLANs and this app doesn't use it. Sign in with Plex, or type the server address.

---

## Jellyfin and Emby

Since 2.4 the display can take its posters from a Jellyfin or an Emby server instead of Plex. Choose **Your media server** on the first-run card, or the Plex | Jellyfin | Emby choice in the connection section at the top of Settings.

- **Jellyfin** signs in with a Quick Connect code: enter the server address, press Sign in, and approve the code in Jellyfin. When Quick Connect is off on the server, it asks for a user name and password instead.
- **Emby** signs in with a user name and password, on the first-run card or in Settings. Emby has no Quick Connect.
- **Child safety holds for every source.** Ratings fail closed: an unknown or malformed rating is hidden under any limit. A Jellyfin or Emby rating counts only when it is written exactly as a US value, so a lower-case `pg` is unknown there; Plex ratings read as before. A Jellyfin or Emby household's own CustomRating counts. The app itself is the gate, as with Plex.
- **More than one server (2.4.1).** One household can draw posters from more than one server, up to three, in any mix of Plex, Jellyfin and Emby. Press **Add a server** in Settings: Plex is added by the plex.tv code, Jellyfin or Emby by address, user name and password. Tick libraries from each server, and **Remove** takes a server out. One household limit applies to every poster, whichever server it came from. The server you already had is always the first, and the servers cannot be reordered.
- **Changing server.** A change of server type or address clears the pinned poster. A change of type also clears the offline cache and the no-repeat history. Upgrading from 2.3.1 is not a switch. This display's token is set aside on a change of server type, and on an imported file that changes the server and brings no token of its own. An address you type in Settings receives the token when you press **Test connection** or **Save**, as in 2.3, so type only an address you trust.
- **Cross-origin requests.** A Jellyfin server allows any origin by default. Emby's default is unconfirmed, a **(verify)** row (V1-M03).
- **Tested against mock servers only.** Jellyfin and Emby have not been run against a real server, so every request and field is a **(verify)** item. The rows to run are in [`docs/validation/real-server-extended.md`](docs/validation/real-server-extended.md): section I, Jellyfin (V1-J01 to V1-J22), and section J, Emby (V1-M01 to V1-M14), and section K, more than one server. Once a row passes, its tag comes off here.

---

## Accounts

- **Use a managed user for the display.** In Plex Home, create a managed user and share only the library the display should show (for example Movies). Sign the display in as that user. If the display is stolen, its token reaches that one library and nothing else. Whether a managed user's token can approve the plex.tv/link code and whether it may read what's playing are not yet verified (a managed token may be refused the playing list; the display then just rotates posters).
- **Household with children.** Settings > Household > **Household with children** shows a rating select. Pick the highest rating to allow (G, PG, PG-13, R, NC-17). Then:
  - Random posters above the limit are never shown, and **posters from the offline cache are held to the same limit**.
  - What's playing right now is hidden too while **Apply the limit to what's playing right now** is ticked (it is by default). A hidden title means the display shows an allowed random poster instead.
  - A poster **you pinned and saved** is exempt. When the tick above is off, so is the title playing right now.
  - **Unrated, missing or unrecognised ratings are hidden** while a limit is set (it fails closed). TV ratings (TV-Y to TV-MA) are matched to the same ladder. Country-prefixed ratings Plex stores (`gb/`, `de/`, `au/`, `ca/`, `fr/`, `nl/`) are mapped onto it: for example `gb/12A` counts as PG-13 and `gb/15` as R.
  - A playing TV episode is judged on the rating Plex sends for the episode itself.
  - While a limit is set the app re-checks the cached titles' ratings against Plex whenever it reloads the pool online (at most every 30 minutes), so a title Plex has since rated higher can't come back from the cache. A title Plex does not confirm is treated as unrated.
  - An unknown value in `maxContentRating` (a typo in `config.json`) becomes PG-13, never "no limit".
  - **Rating schedule (2.3.0).** Under the limit, **Change the limit during the day** lists time slots (a start time, a limit or "No limit", and every day, weekdays or weekends). The slot in force replaces the limit above for as long as it lasts. A stricter slot takes a poster above it off the screen at once, and the offline cache follows the slot too. If the clock is not plausible, the strictest limit you have set applies (the base limit and every slot, and, when any slot names a profile, every profile); if the schedule cannot be read, G applies all day; unrated titles stay hidden in any slot that sets a limit. Only Settings, behind the PIN, changes the slots.
  - **Viewer profiles (2.3.0).** A profile bundles a limit, the now-playing rule, a poster selection, weighting and a frame under a name. A time slot can name a profile instead of a limit. A profile's limit is a ceiling, with two exceptions that hold for the household limit too: a poster you pinned and saved stays up, and the title playing now shows when the profile's "apply the limit to what's playing" rule is off. A missing profile gives the strictest limit (G). Turning "Household with children" off keeps the slots and the profiles and applies neither.

  The app filters by itself, which is the guarantee. It also asks Plex to filter the pool; the parameter name and its comma-separated syntax (V1-E03) and the batched rating re-check (V1-E27) were checked against a real server. The country-prefixed values could not be: the test server stores none (V1-E04), so how Plex writes them is still **(verify)**. Recommended protection does not turn the limit on. Set a [PIN](#the-pin) so a child can't turn it off.

---

## The helper

A web page can't switch a TV off or read the Pi's temperature. The optional helper can. It is part of `scripts/serve.mjs`, **off by default**, and answers only the device it runs on.

Start the server with `--helper` and tick Settings > Display protection > **Switch the screen off while asleep and show the CPU temperature** (setting `deviceHelper`). With the setting off the page makes no helper request at all. Without `--helper` the page probes once, finds nothing and carries on silently.

```bash
node scripts/serve.mjs --helper                                  # auto-detect how to switch the screen
node scripts/serve.mjs --helper --helper-power cec-ctl           # or choose: cec-ctl | cec-client | wlr-randr | none
node scripts/serve.mjs --helper --helper-power wlr-randr --helper-output HDMI-A-1 \
  --helper-wayland-display wayland-0 --helper-xdg-runtime-dir /run/user/1000
```

Options take a value after a space (`--helper-power cec-ctl`, not `=`). A value option without a value stops the server starting.

**How the screen is switched.** All of these are **(verify)** on real hardware:

| Method | Needs | Commands the helper runs |
|---|---|---|
| `cec-ctl` | the `v4l-utils` package; a CEC-capable TV; the user in the `video` group so `/dev/cec0` opens | `cec-ctl -d /dev/cec0 --to 0 --standby`, and `--image-view-on` to wake |
| `cec-client` | the libcec tools (package `cec-utils`) | `standby 0` and `on 0` through stdin |
| `wlr-randr` | a Wayland session (labwc) and `--helper-output <name>` | `wlr-randr --output <name> --off` and `--on` |

With no `--helper-power`, the helper tries `cec-ctl`, then `cec-client`, then `wlr-randr`, and uses the first it finds. It tries `wlr-randr` only if you also give `--helper-output` (the output name, found by running `wlr-randr`); naming `wlr-randr` without an output stops the server starting. If nothing is found, or you say `--helper-power none`, the helper still runs and reports no power control.

**Things the Pi needs for HDMI-CEC** (verify each):

- `hdmi_force_hotplug=1` in the Pi boot config (`/boot/firmware/config.txt` on current releases), so the HDMI output stays alive while the TV is off.
- Membership of the **video group** so the service can open `/dev/cec0` (`sudo usermod -aG video "$USER"`, then log out and in).
- For `wlr-randr`: a service started with `systemctl --user` doesn't live inside your desktop session and has neither `WAYLAND_DISPLAY` nor `XDG_RUNTIME_DIR`. Pass `--helper-wayland-display` and `--helper-xdg-runtime-dir`, as above.

**What the page does with it.** When sleep starts and the black cover is up, it asks the helper to switch the display off. On wake it switches it on first, then waits a few seconds (4 s, a guess to be measured) for the TV before fetching a poster. Whether the window is still full-screen after a power-off and on is not yet verified (V1-E22). Diagnostics shows **CPU temperature** (read from `/sys/class/thermal/thermal_zone0/temp`, falling back to `vcgencmd measure_temp`; both (verify)) while it is open.

**Safety.** The helper answers only the machine it runs on. That means a loopback peer with a loopback Host. It needs the header `X-Poster-Helper: 1`. That header makes other websites' scripts fail the browser's cross-site check. It runs fixed commands with no shell. It accepts only an on/off flag. Each command runs alone, with a 5 second limit. If you stop the service under systemd, `KillMode=control-group` (the default) should also end a command still running (verify). A reverse proxy on the same machine would make every client look local and defeat the guards (see [config.json](#configjson)). There is no brightness control: TVs rarely accept it from a Pi.

Routes, for developers: `GET /__helper/status`, `POST /__helper/display` with `{"on": true|false}`, and with `--helper-fake` (record calls, run nothing, for tests) `GET /__helper/calls`.

---

## Rotation

The app can rotate itself: the rotate button, the `O` key, or Settings > Frame & layout > **Rotation** (0, 90, 180, 270). With `rotateUi` on (the default), the controls, toast, status dot, empty screen and dialogs turn with the picture, so they read upright. A PIN keypad and the kiosk corner follow too.

**Or rotate the screen instead.** If you would rather turn the screen in the OS or the compositor (for example the Pi's Screen Configuration, or `wlr-randr --transform` under labwc (verify)), set **`rotateUi` to `false`** and leave the app's own rotation at **0**. That setup is supported. `rotateUi` has no switch in the Settings sheet in 2.1, so set it in `config.json` before first run or in an imported settings file:

```json
{ "rotateUi": false, "rotation": 0 }
```

---

## Clock

A Pi has no battery-backed clock. Until the network time (NTP) arrives, its clock can be years off. The schedules (sleep, night dim, daily reload) therefore **wait for a plausible clock** (a year of 2026 or later) and Diagnostics says **Clock not set** until then. Idle sleep doesn't need the clock.

Raspberry Pi OS runs `fake-hwclock`, which restores the time of the last shutdown at boot. After a long power-off the clock then looks plausible but is **stale until NTP syncs**, so a schedule can be wrong until then (verify on your Pi). Keep the display's network able to reach an NTP server (see [Network](#network)).

The year is a constant, `MIN_PLAUSIBLE_YEAR` in `js/schedule.js`, which a developer bumps as time passes.

---

## config.json

`config.json` lets you set up a device without a keyboard. Copy `config.example.json`, fill in the token, server URL and library key, and place the file beside `index.html`. It holds your **Plex token**, so:

- **Only the device itself gets it.** `serve.mjs` serves `config.json` to a request that comes from a loopback address (`127.0.0.1`, `::1`) with a `Host` of `localhost`, `127.0.0.1` or `[::1]`. Any other client gets 403. The server never trusts `X-Forwarded-For` or `Forwarded`. Every other file outside the app (this README, `docs/`, `scripts/`, `package.json`, dotfiles) is 404 for everyone.
- **Never put a reverse proxy in front of `serve.mjs`.** A reverse proxy on the same machine (Caddy, nginx, Nginx Proxy Manager) connects from loopback, so every client on your network would look local and could download the token (and drive the helper). If you must serve it through a proxy, serve only the app files and block `/config.json` and `/__helper/` in the proxy (not yet verified), or don't keep a `config.json` there.
- **It is read on the first run only.** If the device has no saved settings, the file seeds them. It does not override settings you saved later. The one exception is `resetPin` (see [Kiosk](#kiosk)), which is read on every load.
- **Delete it after the first run.** The token is saved in the browser by then. Delete it, and any `resetPin` flag, once you have used it. It is git-ignored; never commit it.
- **What it can contain.** Every key of an exported settings file works, except the PIN (`settingsPinHash`, `settingsPinSalt`). Keys you can't find in the Settings sheet but can set here: `rotateUi`, `statusIndicator` (`dot` or `off`), `posterCacheLimit` and `resetPin`. A bad value falls back to the default. `fillMode` is accepted but does nothing in 2.1; since 2.2.0 it is the Landscape fill select, and `gapFill` (`none`, `blur` or `matte`) is the Gap fill select.

```json
{
  "plexToken": "YOUR_PLEX_TOKEN",
  "serverUrl": "http://192.168.1.10:32400",
  "libraryKey": "1",
  "rotateSeconds": 300,
  "frameId": "marquee",
  "sleepEnabled": true,
  "kioskMode": true
}
```

---

## Project layout

```
index.html              app shell (markup only)
manifest.webmanifest    PWA manifest
sw.js                   service worker (precache + offline shell)
config.example.json     a starting point for config.json
css/app.css             styles
js/
  main.js               bootstrap and glue: scheduling, offline fallback, controls, Settings, Diagnostics, kiosk, first run
  engine.js             decides which poster to show; applies the content limit (pure, unit-tested)
  sources/              the media-server adapters: index.js (the adapter choice), errors.js (the shared error kinds), plex.js (Plex server + plex.tv client: sign-in, discovery, sessions, ratings, runtime format), jellyfin.js, emby.js
  display.js            frame/poster rendering, rotation, pixel shift, cross-fade, progress bar
  fill.js               landscape fill: the dimmed backdrop and the info panel, and the gap fill (blur or colour matte) (2.2.0)
  layout.js             geometry: stage size, poster box, pixel-shift orbit, the gap-fill bands and the under-4 px close (pure, unit-tested)
  poster-cache.js       offline poster cache (Cache API) with a limit and stored ratings
  ratings.js            the content-rating ladder and country table; the one rule that allows or hides a rating (pure)
  settings.js           schema, validation, migration, import/export
  settings-ui.js        settings panel, Recommended protection, the plex.tv code flow
  limit-schedule.js     which limit applies at a moment: the time slots, failing closed (pure) (2.3.0)
  selection.js          poster selection: libraries, genres, ratings, a collection or playlist (pure) (2.3.0)
  weighting.js          favouring unwatched or best reviewed titles, and the no-repeat window (pure) (2.3.0)
  profiles.js           viewer profiles and the one resolver for the settings in force (pure) (2.3.0)
  position.js           position mode: drag or nudge the poster, the small bar (2.2.0)
  schedule.js           local-time helpers: windows across midnight, DST, plausible clock (pure)
  sleep.js              the sleep decision: schedule, idle, playback wake, manual wake (pure)
  brightness.js         frame brightness and the stepped night dim (pure)
  brightness-timer.js   applies the brightness to the display once a minute
  sleep-control.js      sleep on the page: playback poll, the veil, the sleep clock, manual wake
  tv-power.js           TV power off at sleep, power on at wake, CPU temperature (uses helper.js)
  reload.js             the daily, after-wake and update reloads, and what they wait for
  pin-gate.js           the one settings-PIN check (builds the prompt from kiosk.js)
  poster-pin.js         the Pin/Unpin button: pins the poster on screen
  kiosk.js              PIN hashing and lockout, the corner hold, the resetPin flag, the PIN prompt
  helper.js             page-side client of the device helper (screen power, CPU temperature)
  shortcuts.js          the one keyboard-shortcut table, used by the keys and the `?` overlay
  duration.js           minutes shown in Settings against the seconds that are stored
  frames.js             built-in frames + transparent-window detection
  backoff.js            exponential backoff with jitter for retries
  util.js               storage, event log, toast and other small helpers
assets/frames/          frame overlays (PNG with a transparent window)
assets/icons/           app icons
design/                 Paint.NET sources and poster-size notes
scripts/
  serve.mjs             zero-dependency static server: allowlist, config.json guard, --mock, --helper
  device-helper.mjs     the opt-in loopback helper that serve.mjs --helper mounts
  net.mjs               loopback checks shared by the server and the helper
  mock-plex.mjs         fake Plex server for demos and tests
  mock-jellyfin.mjs     fake Jellyfin and Emby server for demos and tests
  check-precache.mjs    checks that every js/ file and every sw.js SHELL entry agree
tests/                  node --test unit tests
tests/e2e/              Playwright browser tests (run.mjs runs them; lib.mjs is the shared harness)
docs/                   spec, decisions, integration plan, real-server checklists (docs/validation/)
```

### Adding a frame

Drop a PNG with a transparent window into `assets/frames/` and add it to `FRAMES` in `js/frames.js` (and to `SHELL` in `sw.js` so it works offline). You can also use **Frame → Custom image…** in settings, which detects the window automatically.

### Development

```bash
npm test                       # unit tests (node --test, no dependencies)
npm run demo                   # app + mock Plex server (and a mock Jellyfin/Emby server on the Plex mock's port + 1000)
node scripts/check-precache.mjs   # every js/ file is precached and every precached file exists
npm ci && npx playwright install chromium   # once, for the browser tests
npm run test:e2e               # browser tests against the mock server
```

`npm run test:e2e` starts one `serve.mjs --mock` and runs each spec in `tests/e2e/` in its own process. Playwright is a dev dependency only; the app has none. It uses ports 18080 (app) and 18401 (mock) by default. Set `E2E_PORT` and `E2E_MOCK_PORT` to other free ports when you run two copies at once, and `E2E_SPEC_TIMEOUT` (seconds, default 180) to change a spec's time limit. Pass spec names to run only those: `npm run test:e2e -- smoke`. Specs that start their own server pick a free port at run time.

When you change any precached file, bump `VERSION` in `sw.js` (and in `js/main.js`, `package.json` and `package-lock.json`, which holds it twice). Installed clients pick up the new version and reload automatically. Any new file under `js/` also goes into `SHELL` in `sw.js`.

The design is in [`docs/spec.md`](docs/spec.md) and the decisions that bind it are in [`docs/decisions.md`](docs/decisions.md). What is planned or only an idea is in [`Roadmap.md`](Roadmap.md).

---

## Security notes

- Your media server token (Plex, Jellyfin or Emby) is stored in the browser's `localStorage` on the display device. It appears in Plex request URLs (Plex's API needs it there), and in a Jellyfin or Emby poster URL as `api_key`. Only run this on devices you trust. Use a [managed user](#accounts) with one library, and a [VLAN](#network).
- **Exported settings** leave the token out unless you tick *include token*. They never contain the PIN.
- The [PIN](#the-pin) is a deterrent, not security.
- `config.json` holds the token. It is served to the device itself only, git-ignored and meant to be deleted after first run. Never commit it, and never put a reverse proxy in front of the server.
- The dev server serves only the app's own files, and the helper is opt-in and local-only.
- Nothing is sent anywhere except to your own media server (Plex, Jellyfin or Emby) and to plex.tv for Plex sign-in.

## License

MIT
