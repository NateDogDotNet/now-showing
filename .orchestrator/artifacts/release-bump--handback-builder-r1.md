produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: release-bump · round: r1
status: complete        failure_class: n/a
paths: sw.js, js/main.js, package.json, package-lock.json, tests/e2e/release.spec.mjs, README.md, Roadmap.md (all staged, not committed; node_modules symlink removed)
criteria: 1 met (node -e version check, rc 0) · 2 met (token-rotation grep, rc 0) · 3 met (both validation files, rc 0) · 4 met (npm test: 327 pass, 0 fail) · 5 met (npm run test:e2e with E2E_PORT=18380 E2E_MOCK_PORT=18701: rc 0, 0 FAIL lines, PASS release) · 6 met (check-precache: 31 precached files OK) · 7 met (status test, rc 0, exactly the seven files) · 9 met (full grep, rc 0; docs criterion 6 greps also still pass) · 8 narrated, conductor's
deviations: none. release.spec.mjs was shown red with sw.js at 2.0.0 (FAIL release) and green at 2.1.0. The Roadmap keeps no separate "Frame rotation" heading; the name lives inside "Frame and marquee styles".
questions: none

Agent: release-builder-r1 · dispatched: 2026-10-14T21:24:12Z

## Notes
- Version: lockfile changed only the two version lines. The spec registers a stale shell-2.0.0 cache before the service worker registers (it wraps register), then waits for shell-2.1.0 present and shell-2.0.0 gone.
- Full e2e log: /tmp/claude-1000/-home-nathan-plex-poster-app/d46a0785-7a80-4504-996b-2b91961196cb/scratchpad/e2e.log (105 PASS lines, tail "PASS ui-rotation / rc=0").

## README tags
Removed or changed:
- Line 11 banner: real-server validation done (core 17/17, extended 15 non-Pi rows); Pi pending; "(verify)" now means not yet verified on a Raspberry Pi.
- Line 144: *.plex.direct from outside (V1-E24) and relay fallback (V1-E25) stated as verified.
- Line 358: contentRating name and comma syntax (V1-E03) and batched re-check (V1-E27) verified.
- Docs r3 wording: reload waits while any app window is open (Settings, Diagnostics, PIN pad, shortcuts list); "a key, touch or click".
Kept (not proven): country-prefixed rating values (V1-E04, test server has none, still (verify)); managed user line 348; every Pi item (lines 150-156, 227, 249, 258, 268-279, 300-307, 377, 405 and the rest).

## Roadmap
D51-D71 entries added (Poster playlist, Rating schedule, Viewer profiles, Poster selection, Weighting, On this day, Marquee captions, Info captions, Frame and marquee styles, Poster transitions, Touch gestures, Theme music, Find a poster, QR code, Play now, Movie-night countdown, Clear-logo marquees, Poster artwork sources, Birthday mode, Picture frame mode, Browse first mode, Home controls, Sources other than Plex extended, Multiple displays, Ambient light sync); "## 🧭 Suggested order" added before Ideas; Landscape fill gained gap fill; "(K60)" dropped; Done in 2.1 paragraph updated; "Validate on the real server early" replaced by "Validate on a Raspberry Pi". Old names kept as text. Unconfirmed items (TMDB terms, Google Photos/iCloud, Hubitat/Homey/SmartThings/HomeKit, Watchlist and theme APIs) carry their caveats.
