<!-- Conductor transcription by closer transcribe at 2026-10-14T22:18:43.716376Z. Agent: code-review-r1. Why: the /code-review skill (forked agent) returns its findings as text and writes no file; this is its return verbatim. sha256 of the return text: 8e8681a6c7a6f560d17f5c14f4589f4d787f5c3dedf462bfe271d84d96ed50e9. The text below is the agent's return, verbatim; it is testimony the conductor copied, not a file the agent wrote. -->

HEAD advanced to `a7582bb` (the release bump landed); the only source changes since my reads are the three `VERSION` lines, so the version-mismatch candidate is resolved and dropped. Everything else reviewed stands.

```json
[
  {
    "file": "/home/nathan/plex-poster-app/js/main.js",
    "line": 238,
    "summary": "A now-playing episode's own contentRating is written into the poster cache under the SHOW's ratingKey (refreshRating here and put() at line 204), so the offline household limit judges a series by one episode's rating.",
    "failure_scenario": "Household limit PG. Series rated TV-MA is cached from the pool with TV-MA. Someone plays an episode Plex rates TV-PG: toPoster (js/plex.js:134,140) returns ratingKey=grandparentRatingKey with contentRating='TV-PG'; permitted() allows it; tick() calls cache.refreshRating and fetchImage() calls cache.put with that poster, so the index entry for the TV-MA show now reads TV-PG. Plex goes unreachable -> handleFailure -> cache.random(…, 'PG') returns the TV-MA series poster. Inverse: an episode with no contentRating stores '' and hides a correctly rated show offline until the next pool-load recheck (up to 30 min). Fix: never write an episode's rating under the grandparent key (skip refreshRating/put rating for isEpisode posters, or key them by the episode)."
  },
  {
    "file": "/home/nathan/plex-poster-app/js/main.js",
    "line": 596,
    "summary": "One failed helper status/probe read clears helper.available (js/helper.js:41), and the wake path then takes the 'setting switched off' branch: it resets tvOff without ever sending power-on, leaving the TV physically off while the display is awake.",
    "failure_scenario": "deviceHelper on, display asleep, TV switched off by powerOffAfterVeil (tvOff=true). Owner opens Diagnostics (allowed above the veil); refreshTemperature -> helper.status() times out once on a busy Pi (8 s AbortSignal) -> available=false. At sleepEnd, evaluateSleep: `tvOff && helperActive()` is false -> `tvOff = false; next()`. No power(true) is queued and tvOff is cleared, so releaseTv()/a later re-probe will not send one either. Screen stays black all day with the app 'awake'. Fix: on wake, attempt power-on whenever tvOff is set (regardless of available), and/or do not let a single failed status read clear `available`."
  },
  {
    "file": "/home/nathan/plex-poster-app/js/main.js",
    "line": 228,
    "summary": "tick() returns early while state.tvWaking without rescheduling or queuing (forceAfter is set only when busy), so the poll/rotation loop survives the 4 s TV wake only via wakeTv()'s single `.then(() => !state.asleep && next())`.",
    "failure_scenario": "Helper active, display wakes -> wakeTv() sets tvWaking for 4 s. The pending schedule() timer fires inside that window and is dropped. Within the same window a Save turns the sleep schedule on (applySettings -> evaluateSleep -> asleep -> next() -> tick() dropped again; the forced tick from applySettings is also dropped since busy is false). wakeTv's .then sees state.asleep and does nothing: no timer exists, pollPlayback never runs, wakeOnPlayback cannot wake the screen until the schedule window ends or someone touches it. Fix: in tick(), when tvWaking, set state.forceAfter (or reschedule) instead of returning silently."
  },
  {
    "file": "/home/nathan/plex-poster-app/js/main.js",
    "line": 92,
    "summary": "onRatings calls cache.refreshRating once per cached key; each call re-reads and JSON-parses the whole index and rewrites it to localStorage, so a 300-entry cache costs ~300 full parses and up to 300 whole-index synchronous writes on every pool load under a limit, and the recheck is awaited sequentially after pool() inside decide().",
    "failure_scenario": "posterCacheLimit=300, limit set: each 30-min pool load (and every limit/library change) does 300 x readIndex()+writeIndex() of a ~60 KB index on the tick path (tens of MB of JSON parse + SD-card writes on a Pi), and engine.loadPool (js/engine.js:29) serialises up to 3 items() requests (10 s timeout each) before the poster can be chosen, so a slow server delays the first poster by up to 30 s. Cheaper: a batch cache.refreshRatings(posters) with one read and at most one write, and run recheckCachedRatings() concurrently with client.pool() via Promise.all."
  },
  {
    "file": "/home/nathan/plex-poster-app/js/main.js",
    "line": 1433,
    "summary": "announceWhatsNew treats 'configured and no marker' as an upgrade, but a config.json-provisioned first boot is configured before the marker exists, so a fresh install shows the 'What's new in 2.1' upgrade toast.",
    "failure_scenario": "Fresh device, serve.mjs with config.json beside index.html. boot(): source==='defaults' and config!==null -> provisionedSettings saved -> isConfigured true. announceWhatsNew(): marker absent -> writes it -> isConfigured -> toasts 'What's new in 2.1' with an 'Open settings' action on a display that has never run 2.0. Fix: write the marker when settings are provisioned (or decide 'upgrade' from load().source === 'stored' before provisioning), not from isConfigured alone."
  },
  {
    "file": "/home/nathan/plex-poster-app/js/main.js",
    "line": 315,
    "summary": "handleFailure attributes an empty screen to the household limit whenever a limit is set and the error is non-fatal, even when the cache is simply empty, so the empty card gives the wrong reason.",
    "failure_scenario": "Limit PG set on a display whose cache was just cleared (or a first run that never cached anything). Plex times out (kind 'timeout'): cache.random returns null for lack of entries, display.currentPoster is null, and the card reads 'No posters within the household limit are available while Plex is unreachable.' instead of the timeout message; the owner raises the limit expecting posters to come back. Fix: use the limit wording only when cache.entries() is non-empty but none passed allows(), else show err.message."
  },
  {
    "file": "/home/nathan/plex-poster-app/js/main.js",
    "line": 1241,
    "summary": "The service-worker 'controllerchange' reload only checks settingsUI.isOpen and bypasses the new reloadMustWait() guard that the daily reload honours (any open dialog, in-flight poster, manual wake, running crossfade).",
    "failure_scenario": "reg.update() (every 6 h) finds a new version while the PIN dialog or Diagnostics is open, or mid-decode: reloadAutomatically() fires at once, closing the PIN prompt the owner is typing into / losing the manual-wake minute, the exact cases reloadMustWait() was written to avoid for the daily reload. Deeper fix: route the SW-update reload through the same pending/runDailyReload path (reloadPending = 'update') instead of a separate special case."
  },
  {
    "file": "/home/nathan/plex-poster-app/js/main.js",
    "line": 491,
    "summary": "dailyReloadTick re-implements HH:MM parsing with split(':').map(Number) instead of the shared parseHHMM() in js/schedule.js (and settings.js's `hhmm` sanitiser duplicates parseHHMM's regex).",
    "failure_scenario": "Two parsers for the same format: a future change to the accepted time syntax (e.g. 'H:MM' or seconds) has to be made in schedule.js, settings.js and main.js, and only parseHHMM validates its input, so this copy silently yields NaN minutes and never triggers if the stored value ever bypasses the sanitiser. Replace with `const mins = parseHHMM(state.settings.dailyReloadTime); const due = mins !== null && now.getHours()*60+now.getMinutes() >= mins`."
  }
]
```