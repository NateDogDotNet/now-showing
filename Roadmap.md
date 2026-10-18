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

2.1.0 is closed (D79). It is built and covered by unit and browser tests against a mock Plex server, and the real-server validation is done (2026-10-14, against a real Plex Media Server: the core checklist 17 of 17 and the extended checklist 15 of 15 rows that need no Raspberry Pi). The 12 Raspberry Pi rows (V1-E11 to V1-E22) were skipped because no Pi was available, and the owner closed the release without them, so the README keeps "(verify)" on every flag, command and path that only a Pi can prove until someone runs those rows (see the engineering backlog). The leaked Plex token was rotated and the git history purged (`docs/security/`). Version 2.1.0 is on `main` (pull request #1, merged 2026-10-15) and is what GitHub Pages serves; no git tag or GitHub release was made for it, by the owner's choice.

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

## ✅ Done in 2.1.1 (the 2.1.x polish items and the `js/main.js` split)

2.1.1 is a point release of the 2.1.x polish items and the split of `js/main.js`. It was merged to `main` on 2026-10-15 (pull request #2), with no git tag and no GitHub release (D79, D13). The TV power behaviour below is covered by tests with a fake helper and has not been run on a Raspberry Pi with HDMI-CEC.

- **Recommended protection list shows the Dim label**: the night-dim row reads "The whole picture", the label the Dim select uses, not the stored value `stage`
- **TV power-on after a failed helper read (partial fix)**: the wake no longer depends on `helper.available`; power-on is sent whenever the display switched the TV off, also when the setting is switched off while the TV is off. "Do not let a single failed read clear `available`" is not done, because it lives in `js/helper.js` (see "Carried from 2.1.1"): until the next probe (boot, Settings opening, the setting switched on), a sleep right after a failed read may skip the power-off
- **`tick()` during a TV wake**: a tick inside the 4 s wake window is queued and runs after it; Pause inside the window drops it
- **One batched rating re-check**: `refreshRatings(posters)` reads the cache index once and writes it at most once, and the re-check is fetched alongside the pool and applied after it
- **One HH:MM parser**: the daily reload and `js/settings.js` use `parseHHMM` from `js/schedule.js`
- **The release e2e reads the version**: `tests/e2e/release.spec.mjs` reads `VERSION` from `sw.js`, so a version bump no longer breaks it
- **`js/main.js` split**: sleep, TV power, the reloads, brightness and the PIN gate moved to `js/sleep-control.js`, `js/tv-power.js`, `js/reload.js`, `js/brightness-timer.js`, `js/pin-gate.js` and `js/poster-pin.js` (1,472 lines became 1,098), with no change in behaviour; each module is a factory that main.js constructs, with unit tests

## ✅ Done in 2.2 (2.2.0, on branch `2.2`, not yet merged to `main`)

Three 2.2 features are built and tested on branch `2.2`. `VERSION` is 2.2.0 on that branch, but nothing here is on `main` yet (`main` still has 2.1.1), and nothing has been run on a Raspberry Pi (D79).

- **Drag and nudge positioning (D86)**: Settings > Frame & layout > **Position poster** sets the modal sheet aside for a small non-modal bar. Drag the poster with a mouse or a finger, or nudge it with the arrow keys (0.1 % of the stage per press, Shift for ten times that; Shift applies to the arrows only). `+`, `=`, `-` and `_` (and the numpad keys) change the size by 1 within 50 to 150. **Done** or Esc returns to the sheet with the new values; **Cancel** still reverts. The global keyboard shortcuts are off while positioning. The bar keeps off the poster and the frame wherever a clear spot exists (bottom, else the wider side margin, else the top, measured over the whole pixel-shift orbit); where nothing clears, as on a near-square screen, it is a see-through strip at the bottom with only Done taking clicks or taps; the keys still work. The offset sliders now span -100 to 100. Position poster is disabled, with the reason shown as text, whenever the empty card shows (the sign-in card or an error card), because there is no poster to place.
- **Landscape fill (D85)**: Settings > Frame & layout > **Landscape fill** uses the empty sides of a landscape screen for a dimmed poster backdrop or an info panel. It is off by default (`fillMode` is `none`). The backdrop is a tiny canvas (48 px wide, 64 px at most) scaled up by CSS, not a CSS blur filter, and its opacity is capped at 0.25 so it lights little of an OLED. The info panel shows the title, rating, runtime and year, and a synopsis cut to 300 characters plus an ellipsis; an episode shows its own synopsis (D84). The panel uses the right side only, and it is hidden when its box is narrower than 8 em of the title size, so 4:3 and 5:4 screens get the backdrop and no panel in info mode. The backdrop cross-fades with the poster; the text switches at once.
- **Gap fill (D89)**: Settings > Frame & layout > **Gap fill** (Off, Dimmed blurred poster, Colour matte) fills the bands the poster leaves inside the frame window, as at "Fit inside window" or at a size below 100 %. The blurred copy is a tiny canvas lined up with the poster (same centre and aspect, scaled up from its centre to cover the window); the matte is one flat colour, the average of the poster's outer 2 %. Both are capped at 0.25 brightness, like the landscape backdrop, and both cross-fade with the poster. A gap under 4 px on its own is closed by growing or cropping the poster a few pixels, not filled. It is off by default (`gapFill` is `none`), and nothing of a blocked poster shows (D37). Not in scope: backdrop art, smart crop and better-fitting artwork, which stay planned.

## 🧭 Suggested order

Ordered by what each item needs first, not by size (D53). Each entry below also states its own place.

1. **2.1.x:** done (2.1.1), including the `js/main.js` split that the source-adapter work needed first.
2. **2.2:** drag-and-nudge positioning, the landscape fill and the gap fill are done on branch `2.2` (2.2.0, not yet merged to `main`); then, roughly in this order: the rating schedule, poster selection (libraries, genres, ratings) with weighting and no repeats, viewer profiles (a profile bundles a selection and a limit), "On this day", the playlist and Find a poster (they share the list storage), frame and marquee styles with the marquee captions and info captions, poster transitions, touch gestures (which reuse the transitions' slide and the styles), and theme music. The playlist stores each entry as source plus item ID, never a Plex-only key, so it keeps working once other sources exist.
3. **2.3:** the source-adapter refactor with Plex as the first adapter and no change in behaviour, then Jellyfin, then Emby (close to Jellyfin's API); multiple servers in poster selection; Play now; the movie-night countdown; birthday and occasion mode; and the Picture frame sources (Plex Photos first, then a folder and Immich, then museum art). Every adapter maps its own ratings for the household limit and fails closed, with its own adversarial review.
4. **2.4:** the no-server mode as a TMDB adapter. It needs the adapter layer, a TMDB key the user supplies (stored like the Plex token), TMDB's attribution, a certification mapping for the household limit, and it has no now-playing. Clear-logo marquees, poster artwork sources and the filter on any production house come with it; Coming Soon for titles not in the library comes after 2.4.
5. **3.0:** Browse first mode (with the Browse button in poster mode), the main-screen choice (Posters, Browse first, Picture frame, Home controls) and Home controls. It is built from Find a poster, the gestures and Play now, so it comes after them.
6. **Later:** the rest of the Ideas. Multiple displays comes last among the large features, lowest risk first (Change together and Mirror, then Chain, then Controller), because Controller opens the largest attack surface. It needs the source adapters' item IDs first (the `js/main.js` split is done in 2.1.1).

## ⏭ Planned for 2.2

Drag and nudge positioning and the landscape fill were moved out of 2.1 so the screen-protection features ship sooner (D41); both are built, and so is the gap fill inside the frame (D67, phase 38, D89); see "Done in 2.2". Three styles of the gap fill are still deferred (D88).

### Gap fill inside the frame: the deferred styles
The Gap fill setting ships with **Off**, **Dimmed blurred poster** and **Colour matte**. D67 specifies more choices for the same gap (when the poster does not match the frame window's shape: "Fit inside window", or a poster scaled or offset smaller than the window):

- **Backdrop art:** the title's background art from the server.
- **Smart crop:** fill the window by cropping, but keep the title and faces in view instead of a plain centre crop. Smart crop never crops away the title text when the poster has one, and how well face and text detection run on a Pi is (verify); otherwise the crop stays a simple centre crop.
- **Better-fitting artwork:** pick an alternate poster closer to the window's shape, with the poster artwork sources entry; it waits for the TMDB sources (2.4).
- **Constraints that carry over:** a fill is dimmer than the poster and does not light more of an OLED than the poster would; it moves with pixel shift and changes with the poster's transition.

## 🔜 Ideas

Each idea states its place in the suggested order above.

### Auto-discover Plex servers on the local network
Find Plex servers on the LAN automatically so first-run setup is "pick your server, approve the code" instead of typing an IP address and port.

- **Why:** today a new display needs either *Sign in with Plex* (which finds servers through your plex.tv account) or a hand-typed `http://<ip>:32400`. Neither shows the servers on your network before you've signed in, and a keyboardless TV makes typing an address painful.
- **How it can work:**
  - **GDM (Plex's own LAN discovery):** Plex servers answer a UDP multicast/broadcast query (`M-SEARCH`, ports 32410–32414) with their name, port and machine id *(verify exact ports and reply format)*. Browsers can't send UDP, so this runs in the local `scripts/serve.mjs` as an opt-in, loopback-only endpoint (e.g. `GET /__discover`) that the app calls when it's served from that server.
  - **Browser-only fallback:** probe `http://localhost:32400/identity` and the page's own host on port 32400. `/identity` answers without a token and returns the server's machine id and version *(verify)*. This covers Plex running on the same machine as the display.
- **In the app:** a "Servers found on your network" list on the first-run screen. Picking one fills the server URL and starts the sign-in code flow; the token still comes from *Sign in with Plex* or manual entry, since discovery finds servers but never grants access.
- **Constraints:** discovery is opt-in, never sends the token anywhere, and works only on the local network segment (multicast doesn't cross VLANs, so an IoT-VLAN setup still needs sign-in or a manual URL). On an https-hosted copy, browsers block `http://` LAN addresses, so discovered servers are matched to their secure `plex.direct` address after sign-in.

### Poster playlist
A user-chosen list of posters shown in a fixed order, instead of the random pool (D51).

- **Why:** the random pool cannot show "this week's picks" or a themed run in a set order, and Favourites (see Touch gestures) is a playlist the user fills by tapping.
- **How:** each entry is stored as source plus item ID, never a Plex-only key, so a playlist keeps working once other sources exist. Settings builds the list (Find a poster is how it gets filled); the display cycles through it in order and loops. Plex's own playlists can be read as a source too.
- **Constraints:** every poster still obeys the household limit and the rating schedule slot in force, so a playlist cannot show a title the limit hides. Order: 2.2, with Find a poster.

### Rating schedule
Time slots, each with its own household limit, for example G from 06:00 when the children get up, PG-13 from 15:00 when the teenagers are home, and no limit from 22:00 (D59).

- **How:** optionally per weekday, set in Settings next to the household limit, and the library or collection allowed can change per slot too. It reuses what 2.1 ships: the schedule helpers that sleep and night dim use (`js/schedule.js`: `inWindow`, `msUntilNext`) and the content filter that already holds random, cached and now-playing posters to one limit.
- **Constraints:** it fails closed, as the 2.1 limit does: when the clock is not plausible (`isPlausibleClock`) or a slot cannot be read, the strictest slot applies. At a slot change to a stricter limit, a poster above it leaves the screen at once instead of at the next rotation, and the offline cache is filtered by the slot in force. Unrated titles stay hidden in any slot that sets a limit, so "R or above" means a slot with no limit. Changing the schedule asks for the PIN.
- **Order:** first of the 2.2 features, since it is small and needs nothing new. The "Seasonal schedules" idea shares its schedule editor and follows it.

### Viewer profiles
Named bundles (Kids, Teens, Adults) of household limit, poster selection, frame style, music and captions (D64).

- **How:** the Rating schedule switches profiles instead of single settings, and a profile can follow the Plex Home user of the session now playing.
- **Constraints:** the household ceiling of a profile can only be changed behind the PIN. Order: 2.2, after the Rating schedule and Poster selection, because a profile bundles a selection and a limit.

### Poster selection
Choose posters by multi-select servers, libraries, genres and ratings, not just one library and one rating (D60, D63). This merges the earlier ideas "Multiple libraries" (mix movies and TV in the pool) and "Collections & filters" (limit the pool to a collection, genre or decade).

- **How:** the pool is every chosen library on every chosen server, narrowed to titles in any chosen genre (none chosen: all genres) and any chosen rating. Collections and decades stay as further filters.
  - **Step 1 (2.2):** choose a Plex **smart collection** or playlist as a source. Plex builds those from any field it filters on (actor, director, writer, studio, country, year, critic or audience rating, resolution, label and more), so "movies with this actor rated 7 or higher" is made once in Plex and the display only reads it.
  - **Step 2 (later in 2.2 or 2.3):** an in-app rule builder for the common fields (actor, director, writer, studio, genre, decade, critic and audience rating, label), each rule a field, a comparison and a value, combined with all-of or any-of, and saved per Rating schedule slot. With source adapters each adapter maps the fields it supports and says which it does not.
- **Constraints:** the household limit stays a ceiling and wins: the rating multi-select only picks among ratings at or under the limit in force, and it can never let in an unrated or above-limit title. A multi-library pool samples each library in proportion to its title count, so one large library does not crowd out a small one unless the user says so. The Plex `genre` filter parameter and its multi-value form, and the exact filter parameter for each metadata field, are (verify) items checked on the real server like `contentRating` was. "Movie score from" is read two ways: a critic or audience rating threshold, which Plex stores and filters on; or the score's composer, which Plex does not usually store, so that one depends on the metadata agent and is checked before it is promised. Studio is one value per title (for example "Pixar"); a title's full list of production companies is not in Plex's metadata as usually stored, so filtering on any production house comes with the TMDB source or a TMDB lookup by the title's TMDB ID.
- **Order:** libraries, genres and ratings in 2.2 right after the Rating schedule and before Viewer profiles (they share the Settings section and the pool request); multiple servers in 2.3 with the source adapters.

### Weighting and no repeats
Weight the pool toward unwatched or highly rated titles, and keep a no-repeat window (for example 3 days) remembered across reloads (D64). Order: 2.2, with Poster selection (same pool request).

### On this day
Titles from the user's own libraries released on today's date, or round-number anniversaries (D64). Uses the server's release dates, a (verify) field. Order: 2.2.

### Marquee captions: Now Showing, Now Playing, Coming Soon
One marquee caption feature with three captions (D54). It absorbs the earlier ideas "Now showing theatre mode", "Coming soon mode" and "Frame per poster source" and keeps their names here.

- **How:** a caption on the marquee frame says **Now Showing** for a poster from the library, **Now Playing** while something plays (optionally "in the Living Room"), and **Coming Soon** for a title that is not watchable yet. Frame per poster source also lets the frame follow where the poster comes from (now playing, random, or a title that is not in the library yet), including new "Coming Attractions" artwork.
- **Constraints:** the captions follow the household content limit like every poster. The caption artwork (the "Coming Attractions" frame) is the owner's to supply; until then the caption is drawn as text. It stays inert for a title not in the library until the TMDB source exists.
- **Order:** the marquee with Now Showing and Now Playing, plus Coming Soon fed by the server's recently added titles, needs no new source and goes in 2.2. Coming Soon for titles not in the library at all needs the TMDB adapter (or a Radarr/Sonarr calendar) and comes after 2.4.

### Info captions
An optional caption style with the tagline, top-billed cast or a critic score badge (D64). It obeys the caption layout of the marquee captions and the poster transitions, and stays inside the poster window. Order: 2.2, with the marquee captions.

### Frame and marquee styles
Several built-in styles of clearly different looks, in addition to the user's own uploaded frame and marquee (D58). Today the app ships three frames, all marquee variants (`js/frames.js`: marquee, marquee-glow, marquee-narrow, PNGs in `assets/frames/`), plus no frame and a custom image URL.

- **How:** for example classic theatre marquee, art deco, modern minimal, retro neon, drive-in and a plain gallery mat, each with a matching caption style for the marquee captions, chosen in Settings and by the swipe in Touch gestures. This also revives "Frame rotation" (swap the frame daily or weekly to spread wear): the Ideas shelved it because the three marquee frames put their bulbs within about 1.5 points of each other, which styles with different geometry no longer do.
- **Constraints:** every style is original or openly licensed artwork with its licence recorded beside it in the repo, never a studio's or chain's trademarked design. Each style declares its poster window the way the built-in frames do now. Dark, low-light styles are preferred for OLED, and a style with large bright areas says so (frame brightness and night dim still apply). Styles stay small enough for the precache budget on a Pi, or load on demand.
- **Order:** 2.2, built with the marquee captions and before the frame swipe in Touch gestures, which needs more than one look to swipe through.

### Poster transitions
A choice of style, with length and easing controls (D62). 2.1 has one transition, a crossfade whose length is set in Settings (`crossfadeMs`, 0 to 10000 ms, default 1200; 0 is a cut).

- **How:** crossfade, cut, fade through black, slide, push, zoom, and a random mix of the chosen ones. The slide direction follows the swipe in Touch gestures and the Chain mode of Multiple displays.
- **Constraints:** the frame never moves, only the poster inside its window. Every style animates only opacity and transform so a Pi's compositor runs it smoothly, and each is checked for dropped frames on a Pi (verify). Slides and pushes follow the viewer's rotation. The user's reduced-motion preference turns every style into a crossfade. A pixel-shift glide and a transition should not overlap; whether 2.1 already keeps them apart is checked when the entry is planned.
- **Order:** 2.2, before Touch gestures, which reuse the slide.

### Touch gestures
Swipes and taps on the poster (D56).

- **How:** swipe left or right for the previous or next poster (the previous one comes from a short history of shown posters, shared with Recently shown in Find a poster); swipe up or down to change the frame (the built-in frames and a custom frame, `frameId`); double tap or long press on the poster to add it to a **Favourites** list or to the owner's **Watch later** (Plex's Watchlist on plex.tv). Favourites is a playlist the user fills by tapping, stored the same way (source plus item ID).
- **Constraints:** gestures follow the viewer's rotation like the controls do. In kiosk mode they are off unless the PIN is entered, and the 3 s bottom-right hold that reveals the controls keeps priority over any long press. The first tap that only wakes the controls is kept, so a double tap must not also wake them. A swipe never changes a protective setting. A favourite or watch-later item obeys the household limit. On a display shared with children, adding to Watch later (which writes to the owner's plex.tv account) asks for the PIN. The Plex Watchlist API has to be checked on the real account first (verify).
- **Order:** 2.2, with the playlist. Watch later comes later for Jellyfin, Emby and TMDB with each adapter.

### Theme music
When a poster appears, play part of that title's theme from the server, with Settings for on/off, volume, how long it plays, and fade-in and fade-out lengths (D61). Plex exposes a `theme` on items that have one: TV shows usually do, movies only when a theme was added.

- **Constraints:** off by default. Silent while anything plays on a Plex client (now playing) and while the display sleeps, and never during the sleep schedule or the night-dim window unless the user allows it. A play length longer than the rotation is cut at the poster change with the fade-out. A title with no theme stays silent rather than playing something else. The theme follows the poster, so the household limit and the Rating schedule slot already apply. The browser's autoplay rule blocks sound until a user gesture, so a kiosk needs a Chromium flag (`--autoplay-policy=no-user-gesture-required`). The Plex theme path, the movie-theme coverage and the flag are (verify) items for the real server and a Pi.
- **Order:** 2.2, after Poster selection. It pairs with "Trailer on demand", which shares the audio controls.

### Find a poster
Easy ways to find particular posters (D66): a search box (type a title, or an actor or director once Poster selection's fields exist) with results as a poster grid, and browse lists for Favourites, playlists, recently added and **Recently shown** (the posters this display has shown, so "that one from a minute ago" is one tap, sharing the swipe history of Touch gestures).

- **How:** from any result, one tap to show it now (2.1's pin), add it to a playlist or Favourites, or Play now. Built for every input the display has: touch, mouse, a keyboard, and a D-pad remote with an on-screen keyboard. Searching uses the server's own search, a (verify) endpoint.
- **Constraints:** results show only titles the household limit and the Rating schedule slot allow, so search cannot reach a hidden title. In kiosk mode search sits behind the controls' reveal hold and, if the owner chooses, the PIN. Searching never sends the token anywhere else.
- **Order:** 2.2, with the playlist and Favourites, since search is how a playlist gets filled.

### QR code to the title
A small optional QR code that opens the title in the Plex app or its trailer on a phone (D64). Read-only, carries no token, hidden in kiosk mode unless allowed. Order: 2.2 or 2.3.

### Play now
Play the title on screen from a control button, or from the double tap or long press of Touch gestures (which then opens a small menu: Favourites, Watch later, Play now) (D65).

- **How:** play either **here** (in the display's own browser, through the server's transcoder) or **on a chosen device** (a Plex player on the account, such as the living-room TV, picked from a list the display gets from plex.tv), with "resume where I left off" when there is a saved position.
- **Allowed devices:** a per-display list of the players it may start playback on, set in Settings behind the PIN and stored only on that display. It starts empty, so a new display can play nowhere until the owner allows a device; with exactly one allowed device, Play now goes straight to it without a menu. Players are matched by their Plex client identifier, not their name, so renaming a TV does not widen or break the list; a player that has disappeared from the account shows as unavailable. "Here" is its own entry in the list. No other display, the Controller mode of Multiple displays included, can change this list or play on a device it does not allow.
- **Constraints:** asking the TV to play is the display controlling another device, so it is off by default and, on a display shared with children, asks for the PIN each time. Only titles the household limit and the Rating schedule slot allow can be played, and the target list shows only players that advertise remote control. Local playback is opt-in per display, since a Pi may not play every format smoothly (verify on a Pi); it pauses the poster rotation and returns to posters when playback ends. The Plex remote-control (companion) call and the transcoder path are (verify) items for the real server. Nothing sends the token to a player except through plex.tv's own flow.
- **Order:** 2.3, after Touch gestures (2.2) whose menu it joins and alongside the source adapters; Jellyfin and Emby get it per adapter.

### Movie-night countdown
A showtime switches the display to that film with a "Feature presentation begins in mm:ss" marquee, plus an optional "Tonight's lineup" board from a playlist (D64). Needs the Poster playlist and the marquee captions. Order: 2.3.

### Clear-logo marquees
The title's logo art (fanart.tv or TMDB) in the marquee instead of text (D64). Needs a user-supplied API key and the source's attribution. Order: with the TMDB work, 2.4.

### Poster artwork sources
Prefer textless posters, pick the artwork language, or take higher-resolution or alternate art from TMDB or fanart.tv when the server's art is poor (D64). Downloaded art goes through the same cache-first path and cache limit as 2.1's posters. Order: 2.4.

### Birthday and occasion mode
On a set date, a poster with a family member's name ("Starring Emma") or their favourite films, and holiday takeovers (D64). Names and dates are personal data: kept only in the display's own settings, never sent anywhere, left out of exports unless chosen, like the token. Needs the Frame and marquee styles. Order: 2.3.

### Picture frame mode
A third main-screen choice: personal photos or art shown in picture-frame styles instead of posters in a marquee frame (D70). Each display picks its main screen: **Posters** (today), **Browse first** or **Picture frame**, and Home controls is a fourth choice; the browse screens and Home controls open over any of them the same way.

- **How:** photos in frames (wood, metal, gallery mat; the Frame and marquee styles pack gains photo frames, and the marquee and captions are off by default), with the poster transitions plus a slow pan and zoom, the gap fill for photos whose shape does not match, and optional captions (date, place, album, or artist and title for art). Photo sources, each a source adapter: a **Plex Photos library**; a **folder on the display or the network**, read through the local device helper; **Immich** and other self-hosted photo servers; **open-access art collections** from museums that publish public-domain images with an API (for example The Met, the Art Institute of Chicago, the Rijksmuseum), with each work's credit shown as their terms require. **Google Photos and iCloud** are (verify) and unconfirmed: Google limited what its Photos API lets other apps read, and iCloud has no general public photo API, so both are researched before they are promised.
- **Constraints:** personal photos never leave the home network and are never uploaded or sent to another service. Photo location data is shown only if the owner turns it on. Photos follow the image's orientation data. The household content limit does not apply to photos (they have no rating), so a display shared with children shows only albums the owner picks, behind the PIN. All 2.1 protections (sleep, pixel shift, dimming, cache-first downloads, cache limit) apply unchanged.
- **Order:** with the source adapters in 2.3 (Plex Photos first, since it reuses the Plex adapter, then the folder and Immich, then museum art); the main-screen choice itself ships with Browse first mode (3.0).

### Browse first mode
Make picking and playing the main screen, not displaying posters, like a cinema lobby kiosk (D68). A per-display choice.

- **How:** a poster wall to browse (by library, genre, playlist, Favourites, recently added, and the Poster selection filters), search (Find a poster), a title page with synopsis, cast, trailer (the "Trailer on demand" entry) and Play now to an allowed device or here. The rotating poster display becomes the attract screen it returns to after a set idle time.
- **Browse button:** the browse screens can also be opened from poster mode, from a **Browse button** in the controls, a gesture, or a remote key; the display returns to posters after the idle time. The gesture must not collide with Touch gestures: swipes and the double tap and long press are taken, so the entry proposes a swipe in from the screen's bottom edge (as the viewer sees it, following rotation) or a two-finger tap, chosen in Settings, and the Menu or a long OK press on a D-pad remote. The first tap still only wakes the controls (2.1). In kiosk mode the gesture is off unless the owner allows it, the controls' 3 s reveal hold reaches the Browse button, and the owner can require the PIN.
- **Constraints:** every list and search obeys the household limit and the Rating schedule slot (or the Viewer profile). Playing goes only to the display's Allowed devices. In kiosk mode the browse screens are reachable but Settings stays behind the PIN. The attract screen keeps every 2.1 protection (sleep, pixel shift, dimming), while the browse screens, which are bright and static, time out back to it so they never sit lit for hours. It works by touch, mouse, keyboard and D-pad remote.
- **Order:** after Find a poster (2.2), the gestures and Play now (2.3) and the source adapters, since it is built from them. It is large enough to be its own major release (3.0) and comes before Multiple displays, whose Controller mode can reuse its screens on a phone.

### Home controls
A panel of home-automation controls, Home Assistant first (D69, D71). Research done on 2026-10-14 from the official Home Assistant, openHAB and Zigbee2MQTT documentation (recorded as D69 in `docs/decisions.md`) confirmed that Home Assistant's WebSocket API lets a client read states, follow `state_changed` events and call actions with an access token, and its http integration has a cross-origin allow-list; openHAB has a REST API with API tokens and pushed events; Zigbee2MQTT's frontend uses WebSockets with an optional token. Hubitat, Homey, SmartThings and HomeKit could not be confirmed from their docs and stay unconfirmed.

- **How:** a panel opened the way the browse screens are (button, gesture, remote key), showing an owner-chosen allow-list of lights, scenes, scripts, media players and thermostats with live state. The local device helper holds a Home Assistant token for a non-admin user and exposes only the allow-list to the page, so no home-automation token sits in the shared display's browser and cross-origin and mixed-content limits do not apply; a direct WebSocket from the page is the fallback for a display with no helper.
- **As a main screen (D71):** Home controls is the fourth main-screen choice, so the panel can stay on all day. On an always-on display it dims after an idle time and, if the owner picks one, falls back to posters or the picture frame as a **screen saver**, waking on a touch; the panel's layout shifts slightly from time to time like pixel shift; and sleep and night dim apply.
- **Constraints:** off by default. The allow-list and token are set behind the PIN. In kiosk mode or on a display shared with children each control can require the PIN. As an overlay, the panel times out back to posters like the browse screens. Unconfirmed systems (Hubitat, Homey, SmartThings, HomeKit) are added only after their APIs are checked on a real install.
- **To verify first on a real Home Assistant:** a non-admin token can open the WebSocket and call `light.turn_on` and `scene.turn_on`; whether it can be limited to chosen entities; the CORS entry from the app's origin; the default X-Frame-Options (for the iframe alternative); and re-authentication after a dropped connection.
- **Order:** after the browse screens (3.0), which it reuses, and after the Home Assistant / MQTT hooks entry, which builds the helper's Home Assistant link.

### Sources other than Plex
Show posters from other media servers (Jellyfin first, Emby close behind), and make the app work with no media server at all, using The Movie Database (TMDB) (D51).

- **Why:** many self-hosters run Jellyfin or Emby instead of Plex, some people have no media server and just want a poster wall, and a "Coming Soon" caption is better with films that aren't in the library yet.
- **How:** turn `js/plex.js` into the first *source adapter*. Each adapter provides a random pool, what's playing now, poster images and a content rating, in the shape `toPoster` already produces. Two Plex leaks need cleaning up first: the engine imports `pickNowPlaying` from `plex.js`, and some settings and UI text say "Plex". Then add Jellyfin with its own mock server and real-server checklist rows, then Emby. The **no-server mode** is its own adapter: posters from TMDB, which has a free API (a key the user supplies, stored like the Plex token) and requires attribution under its terms. IMDb offers no free public API, so it would only work through a licensed data source and is not promised. TMDB and Radarr/Sonarr calendars can also mix in as extras (for example, one "Coming Soon" poster in every ten) beside a main source. Radarr/Sonarr are self-hosted, so they probably go through the device helper. The TMDB adapter has no now-playing and needs a certification mapping for the household limit.
- **Constraints:** every adapter maps its own ratings for the household limit and fails closed (unknown is hidden while a limit is set), with its own adversarial review like `content-rating-filter` had. Jellyfin may need cross-origin requests allowed on the server. TMDB's terms are to be checked before it is promised (unconfirmed). Streaming services are out: no public APIs, and scraping breaks their terms.
- **Order:** the adapter refactor, Jellyfin and Emby in 2.3; the TMDB no-server mode in 2.4.

### Multiple displays
Displays that know about each other, in four modes (D57). This merges the earlier ideas "Synchronised displays", "Remote control" and "Shared settings for several displays" and keeps their names here.

- **Modes:** **Mirror** (every display in a group shows the same poster at the same moment); **Change together** (each shows its own poster but all change at once); **Chain** (a poster passes from one display to the next along an ordered row); and **Controller** (a phone or computer running the app steers one display or a group; formerly Remote control, "Change poster or settings from a phone on the same network", deferred from 2.1 (D1, D7)). The old Synchronised displays idea was two frames flanking a screen changing together or showing a matching pair (poster and backdrop); Shared settings for several displays was one `config.json` read by several frames, each with its own rotation and position.
- **How it can work:** browsers cannot find each other, so one coordinator on the LAN does it, an opt-in mode of `serve.mjs` (like `--helper`, and the earlier `serve.mjs --remote` design), and displays join a named group with a pairing code (a rotating one; a QR code would carry the pairing code and never the Plex token). Displays agree on time through the coordinator so a change lands within a frame or two. A display that loses the coordinator keeps rotating on its own. Controller uses an allowlist of non-secret settings.
- **Why Controller waits:** it is the largest new attack surface for the smallest gain. It opens a listener on the home network, which conflicts with the settings PIN, with a display shared with children, and with putting the display on an isolated VLAN. It also cannot solve first-run setup, which the code on the empty screen already solves.
- **Constraints (D7):** the pairing code and QR code appear only inside PIN-locked settings, and no protective setting (sleep, dimming, the content limit, kiosk mode, the PIN) can be changed from another device. Every display applies its own household content limit to any poster it is sent and skips one above it. Nothing ever sends a Plex token between devices.
- **Order:** last among the large features, and inside it lowest risk first: Change together and Mirror (displays only exchange "show item X at time T"), then Chain, then Controller, which opens the largest attack surface. It needs the source adapters' item IDs (source plus item ID) first (the `js/main.js` split is done in 2.1.1).

### Multi-poster landscape layout
Show two or three posters side by side on a landscape screen.

- **Why it waits (D1):** it is a refactor of `js/display.js`, which assumes a single stage, and it lights more of an OLED panel. The 2.2 landscape fill (blurred backdrop or info panel) already covers most of the need.

### Animated frame bulbs
Animate the marquee frame's bulbs.

- **Why it waits (D1):** a moving overlay does not rest the pixels underneath it, which is what burn-in protection needs, and an endless animation keeps a Pi compositing around the clock.

### Seasonal schedules
Pick a collection or frame by date range: horror in October, holiday films in December, a kids' collection on weekend mornings. Reuses the schedule helpers that sleep and night dim already use. Order: after the Rating schedule, which shares its schedule editor.

### Trailer on demand
Hold OK to play the current title's trailer when Plex has one. It must respect kiosk mode, the PIN and the household content limit.

### Health beacon
An optional status line, served by the device helper, with the time the last poster was shown, the wake lock state and the CPU temperature. Home Assistant or Uptime Kuma can then warn you before you notice a wall display has quietly stopped.

### Home Assistant / MQTT hooks
Sleep and wake the frame from home automations ("lights off → frame sleeps") and publish what's playing. This belongs in the device helper, not the page.

### Ambient light sync
Send the poster's dominant colour to Hue or WLED lights through Home Assistant (D64). It runs from the device helper (the Home Assistant / MQTT hooks entry), never from the page; off by default, rate-limited, and dimmed with night dim. Order: after the Home Assistant hooks.

### Presence-based sleep
Wake on motion and sleep when nobody is around, using a PIR sensor on a Pi GPIO pin read by the device helper. It protects the panel better than a fixed schedule.

### Update channel
Diagnostics shows "update available", applies it in one tap, and rolls back if the new version fails its startup check.

### Panel-aware protection presets
Separate "OLED", "LCD" and "e-ink" choices that set pixel shift, dimming and sleep to suit the panel, extending the recommended-protection preset.

### Burn-in report
Track how many hours a day the frame art stays lit and suggest stronger protection when the number is high.

## 🛠 Engineering backlog

### Validate on a Raspberry Pi
Optional, whenever a Pi is at hand; 2.1 was closed without it (D79). The real-server validation is done (2026-10-14; `docs/validation/real-server-core.md` and `docs/validation/real-server-extended.md`). Unrun are the 12 extended rows that need a Pi (V1-E11 to V1-E22: Chromium package names and flags, the DevTools policy, autostart, the RAM disk cache, the wake lock under labwc, HDMI-CEC and the helper's screen commands). Run them on a real Pi, then take the matching "(verify)" tags off the README. Also unverified: the country-prefixed rating values (V1-E04: the test server stores none), a managed user's token, and which plex.tv route revoked the old token (V1-E10). Also to check on a real screen, where headless screenshots cannot: whether native `<select>` popups and tooltips render unrotated on a rotated UI (an open unknown from the touch-and-labels phase).

### Carried from 2.1.1
Left over when 2.1.1 closed.

- **A single failed helper read still clears `helper.available`.** The fix lives in `js/helper.js`; see the TV power-on bullet under "Done in 2.1.1".
- **Overlapping TV wake windows.** A sleep and a wake again within 4 s let the first window's end clear `tvWaking` early. This was already so before 2.1.1 and is unlikely.
- **Stale names in comments.** Two comments in `tests/e2e/content-rating.spec.mjs` (lines 961, 974) still say `refreshRating`.
- **Rating re-check after a pool failure.** The re-check still sends its remaining batches and discards them; there is no effect on correctness.
- **Comments that still place moved code in `js/main.js`.** `js/sleep.js:1` and `tests/e2e/helper.spec.mjs:254` (which copies `TV_WAKE_MS`, now exported by `js/tv-power.js`).
- **`tests/tv-power.test.js` replaces `requestAnimationFrame` globally without restoring it.** Harmless while node:test runs each file in its own process; a test tidy-up.

### Carried from 2.2
Owner follow-ups from the 2.2 features; polish, not shipped.

- **The info panel has no top or bottom margin of its own** (D85).
- **The translucent position bar's hint can lose contrast over lit marquee bulbs** on near-square screens (D86).
- **Faint ghosts in very wide blurred gap bands**: the blurred copy continues the poster's edges, so faint smudges of the poster's own detail can remain in a very wide band (D89).
