# Kiosk cursor diagnosis (2.5.2, run 14, phase `cursor-kiosk-diagnosis`)

Date: 2026-11-28. Device: "the kiosk" (Orange Pi, DietPi, Xorg, Chromium as user `dietpi`, no window manager). The app address is written `<app-url>`. No token, address or network name is in this file.

## Finding

With `hideCursor` on, the page does hide the pointer (the `idle` class is on `body` 6 s after the last pointer move, and the computed `cursor` under the pointer is `none`), but Chromium on the kiosk does not apply that change to the real X pointer when no pointer event follows it. The X pointer keeps the arrow it got at the last move. The cause on this device is that the Chromium window is never "focused" (there is no window manager, so `document.hasFocus()` is `false`). When the page has focus, the same CSS change blanks the X pointer at once. Over the controls row the pointer stays drawn for a second, separate reason: a mouse resting on the controls holds them (R-CTRL-4), so `idle` never arrives.

What this means for a fix:

- A page cannot fix the unfocused case. Nothing run from the DevTools console (a forced reflow, toggling the class, an overlay, a scroller, a transform, pointer lock, `window.focus()`, a CSS animation, a synthetic mouse event) changed the X pointer. Only a real pointer move, or a real click that gives the page focus, did.
- A page can fix the controls-row case: a "stillness" class that is set 3.5 s after the last pointer move whatever the controls hold, with `cursor: none` on it, gives `cursor: none` over the controls. On the kiosk that shows only after the page has focus.
- The kiosk's own layer, `unclutter`, is what hides the pointer on this device today. Its effect cannot be read from X (see below), so whether the owner's pointer still shows with `unclutter` running is the owner's observation to make.

Method note (a deviation from the plan, D231 (1)): the real Chromium cannot be debugged. The kiosk's managed policy (`/etc/chromium/policies/managed/now-showing.json`) sets `DeveloperToolsAvailability` to 2, so a remote-debugging port on the real Chromium answers "Target is not inspectable". So the real Chromium was left running and untouched. A second Chromium was started beside it, with the same binary, the same flags and a copy of the real profile's Local Storage (so it had the real saved settings), on a private profile in `/tmp`, with a debugging port on loopback and an empty policy directory that only that process saw (a private mount namespace, so no file on the device changed). All page tests below ran in that second Chromium, over the same Xorg, with the same `unclutter` state as stated per row. A second window with the same startup (no window manager) starts unfocused exactly as the first does, so the focus finding carries over, but it is a probe of the real window, not the real window. What stays unproven on the real window: its own `hasFocus()` value now. A click on the kiosk or a touch would change it (see "Owner's observation").

## Facts about the kiosk

| Item | Value | How it was shown |
|---|---|---|
| Chromium | 156.0.8078.79 | `/usr/lib/chromium/chromium --version` |
| Launch flags (first command line, address masked) | `--show-component-extension-options --enable-gpu-rasterization --no-default-browser-check --disable-pings --media-router=0 --disable-dev-shm-usage --enable-remote-extensions --load-extension --kiosk --start-fullscreen --window-position=0,0 --window-size=1080,1920 --noerrdialogs --disable-session-crashed-bubble --no-first-run --overscroll-history-navigation=0 --disable-pinch --disable-features=OverscrollHistoryNavigation,Translate --check-for-update-interval=31536000 --disk-cache-dir=/dev/shm/chromium-cache --disk-cache-size=67108864 --app=<app-url>` | `tr "\0" "\n" < /proc/1861/cmdline \| sed -E "s#https?://[^ ]+#<app-url>#g"` |
| How the session starts it | `chromium-autostart.sh` loops `startx /usr/local/bin/now-showing-xsession`; that script starts `unclutter`, then `exec`s Chromium | read both files (address masked) |
| Screen | 1080x1920 (rotated right), X server has XFIXES and XTEST | `xdpyinfo` |
| Policy | `DeveloperToolsAvailability: 2`, `TranslateEnabled: false` | `/etc/chromium/policies/managed/now-showing.json` |
| `hideCursor` saved on the kiosk | `true` (the key is saved, not just the default); `kioskMode` is `false` | `localStorage` of the copied profile, read in the page: one flag, nothing else printed |
| `unclutter` | `unclutter-xfixes` (it hides the pointer with `XFixesHideCursor`), run as `unclutter --timeout 4 --jitter 2 --ignore-scrolling --start-hidden` | `readlink -f /usr/bin/unclutter`, `ps` |
| File dates | `chromium-autostart.sh` 2026-11-09 11:07; `now-showing-xsession` 2026-11-09 11:33 (it holds the `unclutter` line and a comment that "the app's own CSS hiding does not take effect reliably without a pointer event"); Chromium and `unclutter` running since 2026-11-09 11:46 | `ls -l --time-style=long-iso` |

On the question whether the owner's report is older than `unclutter` on this device: the repository holds no date for the report, so this cannot be told here. The device files show `unclutter` was added together with the kiosk session on 2026-11-09, and the comment in the session script says the CSS hiding was already seen not to work without a pointer event when it was added. So `unclutter` was added because of this same fault; the report is probably older than `unclutter`, but no document proves it.

The X pointer cannot be read while `unclutter` runs. `XFixesGetCursorImage` returned the same visible 24x24 arrow (272 visible pixels) on the real window with the pointer at rest for hours and `unclutter` running, so `XFixesHideCursor` is not visible to that read. Therefore the rows below with `unclutter` stopped are the only X-level evidence; with `unclutter` running, only the owner's eyes can say.

## Measurements (probe Chromium, `unclutter` stopped, pointer moved with a real X warp, read 6 s after the last pointer move)

The "X read" is `XFixesGetCursorImage` through an ssh-forwarded X socket (a small C program on the devbox). `visible px` is the number of non-transparent pixels. A drawn pointer is a 24x24 arrow with about 270 or 335 visible pixels (335 is the hand over the controls); a hidden one is 1x1 with 0.

| Case | `idle` on body | computed `cursor` under the pointer | X pointer |
|---|---|---|---|
| Unfocused page, pointer over the poster | yes (`hide-cursor idle`) | `none` | DRAWN (24x24, 272 px, the arrow set at the last move) |
| Unfocused page, pointer over a control button | no (`hide-cursor`, controls visible) | `pointer` | DRAWN (24x24, 335 px) |
| Focused page, pointer over the poster | yes | `none` | HIDDEN (1x1, 0 px) |
| Focused page, pointer over a control button | no | `pointer` | DRAWN (24x24, 335 px) |

"Focused" was made by a real click (XTest) on the page, or by the DevTools focus emulation, which is a test aid only. `document.hasFocus()` was `false` on every fresh page and `true` after those two.

## Candidate fixes tried from the console (no repository change)

Each was tried on the unfocused page with `unclutter` stopped, the pointer over the poster at rest (the stale arrow), unless the row says otherwise. Result: works / does not / could not be told.

| Candidate | Result | Why |
|---|---|---|
| (a) `idle` while the pointer rests over the controls: a style `body.hide-cursor.still, body.hide-cursor.still * { cursor: none !important }` plus a listener that sets `still` 3.5 s after the last `pointermove` | Works for the page, does not reach the pointer when unfocused. Works fully when focused. | Unfocused: computed `cursor` became `none` over the controls, X pointer stayed a drawn 335 px hand. Focused: X pointer hidden (1x1, 0 px). |
| (b1) forced refresh: remove and add `idle` with a forced reflow | Does not | X unchanged (serial and 272 px the same). |
| (b2) set and remove an inline `cursor` on `documentElement` | Does not | Same. |
| (b3) a full-screen `cursor: none` overlay, then removed | Does not | Same. |
| (b4) hide and re-show the element under the pointer | Does not | Same. |
| (b5) request pointer lock then exit | Does not | The request was refused (`WrongDocumentError`). |
| (b6) CDP `Input.dispatchMouseEvent` mouseMoved at the same point | Does not (and it wakes the app: `idle` removed) | It is a page-level event; the X pointer stayed the arrow. |
| (b7) DevTools focus emulation, then the page's own idle change | Works | Hides the pointer with no other change. A test aid only: a page cannot turn it on. |
| (b8) `window.focus()` (also with the user-gesture flag) | Does not | `hasFocus()` stayed `false`. |
| (b9) scroll a temporary scroller under the pointer | Does not | Same as (b1). Tried on a page that was already focused, so only "no harm" can be said. |
| (b10) move the element under the pointer 1 px and back | Does not | Same remark as (b9). |
| (d) `cursor: none` on the whole stage at all times | Could not be told | The test selector missed the element under the pointer (the empty card, not the stage). Not retried. By the finding it cannot help the controls row, and over the poster it would hide the pointer while the mouse moves. |
| (f) cursor flip by a CSS animation, no script | Does not | Same as (b1). |
| (g) real X click (XTest) on the page, then idle | Works | The click gave the page focus; the next idle blanked the pointer (1x1, 0 px). Needs a real input event. |

A fix that needs a real input event cannot be done from the page for a kiosk nobody touches. The two device-side routes that would give the window focus are a window manager in the X session, or one click sent at session start. Neither is installed on the kiosk (no window manager, no `xdotool`), and installing is not allowed in this phase, so neither was tried.

## What the app could do (for `cursor-idle-fix`; nothing was changed here)

1. A stillness rule independent of the controls (candidate a): it makes the page right in both cases, and it takes effect on the kiosk only when the window has focus, or beside `unclutter`.
2. Nothing in the page makes the unfocused window apply a cursor change without a pointer event, so the README should name `unclutter` (or a focused window) as the kiosk's own layer.

## Owner's observation still to make

With `unclutter` running (as now), the pointer cannot be read from X. Please look at the kiosk after a mouse move: do not touch the mouse for 6 s and look (1) with the poster showing and (2) with the pointer resting on a control button. Say whether the arrow or hand is drawn after 6 s in each. Expectation from this diagnosis: hidden over the poster, hidden over the controls too when `unclutter` is on (it hides after 4 s), drawn in both without `unclutter`.

## Commands run on the device

All as `root` over `ssh -o BatchMode=yes root@<kiosk>`, host masked. Scratch files only under `/tmp/ns-diag` (removed at the end).

- Read: `ps -eo pid,user,lstart,args` (masked with `sed -E "s#https?://[^ ]+#<app-url>#g"`), `/proc/1861/cmdline`, `chromium-autostart.sh`, `now-showing-xsession`, `/etc/chromium/policies/managed/now-showing.json`, `/etc/chromium.d/default-flags`, `ls -l --time-style=long-iso` of the scripts and `/usr/bin/unclutter*`, `xdpyinfo`, `xwininfo -root -children`, `xprop -id <window> _NET_WM_PID`, `xauth -f /home/dietpi/.Xauthority list` (the cookie went straight into a devbox file, never printed).
- Saved first: `cat /proc/1861/cmdline > /tmp/ns-diag/chromium.cmdline.orig` and `cat /proc/1874/cmdline > /tmp/ns-diag/unclutter.cmdline.orig`, with the environment of the `unclutter` process.
- Stopped `unclutter` (pid 1874) with `kill 1874`. This was a plain kill, not a stop signal, so the old entry stays as a defunct process (its parent, Chromium, does not reap it) until the next session.
- Probe Chromium: `/tmp/ns-diag/ns-launch.sh` = `mount --bind <empty dir> /etc/chromium/policies/managed` inside `unshare -m`, then `runuser -u dietpi -- /tmp/ns-diag/probe-chromium.sh`, which runs `/usr/bin/chromium` with the kiosk flags above plus `--user-data-dir=/tmp/ns-diag/profile --remote-allow-origins=* --remote-debugging-port=9333 --remote-debugging-address=127.0.0.1` and `--app=<app-url>` (taken from `/boot/dietpi.txt` as the session script does). Restarted several times to get fresh unfocused pages; each stopped by its pid. The profile held a copy of the real `Local Storage` directory.
- Tunnels from the devbox: `ssh -L 19333:127.0.0.1:9333` (debugging port) and `ssh -L /tmp/.X11-unix/X77:/tmp/.X11-unix/X0` (X), both stopped by pid.
- On the devbox: a C program (`XFixesGetCursorImage`, `XWarpPointer`, `XTestFakeButtonEvent`, `XGetInputFocus`) linked to the system libraries, and a Node script that talks to the page over CDP.
- One `pkill -f` was used once against the probe's own profile path to stop a probe; later probes were stopped by pid.

## Device restored

- Chromium (pid 1861, started 2026-11-09 11:46:00) was never stopped or restarted, so its first command line is unchanged. Equal sha256 of the NUL-separated command lines computed on the device: saved at the start `968901101c210216...`, live `/proc/1861/cmdline` at the end `968901101c210216...` (first 16 hex digits of each).
- `unclutter` runs again as user `dietpi` with the same arguments: `unclutter --timeout 4 --jitter 2 --ignore-scrolling --start-hidden` (`cmp` of the saved command line against the new process, pid 26485: identical). Same `DISPLAY` and `XAUTHORITY` as before. Differences: it has a new pid and its parent is `runuser`, not Chromium, and the old killed entry (pid 1874) is still listed as defunct.
- The probe Chromium and its profile, the empty policy directory, `/dev/shm/ns-diag-cache` and `/tmp/ns-diag` are removed. `/etc/chromium/policies/managed/now-showing.json` is unchanged (date 2026-11-09 11:03); the bind mount existed only inside the probe's namespace, and `mount` shows none now.
- Not restored exactly: the X input focus. While the probe ran, the X input focus was on the probe's window; after it exited, `XGetInputFocus` returns a window that is not the real Chromium window (id `0x236`). Whether the real Chromium window had X focus, or page focus, before the probe is not known (the first read was taken after the probe existed). The pointer was left at the screen point where the tests ended. Nothing is shown on the kiosk that was not shown before.
- Not touched: networking, `corosync-qnetd`, ssh, any other service; no package installed; no reboot; no file changed on the device outside `/tmp` and `/dev/shm`, both now clean.
