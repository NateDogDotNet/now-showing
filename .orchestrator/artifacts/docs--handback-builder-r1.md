produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: docs · round: r1
status: complete        failure_class: n/a
paths: README.md, Roadmap.md (both edited and staged in /home/user/wt-docs; nothing else touched except this file)
criteria:
  1. met: the 31-keyword grep loop over README.md printed nothing, exit 0
  2. met: grep -Eqi 'not (yet )?verified|unverified' README.md, exit 0
  3. met: relative-link node check, exit 0 (links: assets/screenshots/portrait.png, docs/validation/real-server-core.md, docs/validation/real-server-extended.md, Roadmap.md, docs/spec.md, docs/decisions.md)
  4. met: every js/*.js and scripts/*.mjs basename found in README.md, exit 0
  5. met: the feature-doc keyword loop plus grep -qi 'shortcuts overlay', exit 0
  6. met: Roadmap keyword loop, 'PIN-locked', and the negative sed|grep over the Ideas-to-end range, exit 0
  7. met: test -z "$(git status --porcelain -- . ':!README.md' ':!Roadmap.md')", exit 0; git status --short shows only "M  README.md" and "M  Roadmap.md"
  8. narrated: see "Criterion 8" below (list of every tagged item). /doc-review and keep-docs-current were NOT run by me (conductor/reviewer step).
deviations: (a) The brief asks for superpowers:verification-before-completion; it is not in my skill list, so I did the equivalent by re-running criteria 1-7 at the end and `npm test` (327 pass, 0 fail). (b) Roadmap "Split js/main.js" entry: I changed "about 930 lines" to "about 1,440 lines" (js/main.js is 1442 lines now) and "adds" to "added"; the entry is otherwise kept. (c) The README Features table lost its emoji (consistency; no content change). (d) I did not run `npm run test:e2e` (docs-only phase; no code changed).
questions: none

Agent: docs-builder-r1 · dispatched: 2026-10-11T20:48:49Z

## Commands run and output tails

```
$ (criterion 1 loop)            -> c1=0 (no "missing:" lines)
$ grep -Eqi 'not (yet )?verified|unverified' README.md   -> c2=0
$ node -e "...relative links..." -> c3=0
$ (criterion 4 loop)            -> c4=0 (no "undocumented:" lines)
$ (criterion 5 loop + shortcuts overlay) -> c5=0
$ (criterion 6 chain)           -> c6=0
$ test -z "$(git status --porcelain -- . ':!README.md' ':!Roadmap.md')" -> c7=0
$ git status --short
M  README.md
M  Roadmap.md
$ npm test | tail
# tests 327
# pass 327
# fail 0
```

## What changed

README.md (rewritten, 2.1 as shipped): a top banner saying 2.1's real-server and Raspberry Pi validation is pending and that "(verify)" means not yet verified; contents; feature table updated; shortcuts table with `?`; control labels and the first-tap rule; error messages with fix buttons; Quick start with the first-run plex.tv code (5 s polling, 3 codes then a 5 min rest, none while asleep); Supported setups (three topologies and what the http LAN page loses); Raspberry Pi setup; Hardening for 24/7 displays (defaults, Recommended protection and what it does not change, Sleep, brightness/night dim, smart plug with clean-shutdown caution, Overlay File System, Chromium cache in RAM); Tablets; Kiosk (flags, autostart, DeveloperToolsAvailability, kiosk mode, PIN as a deterrent, resetPin); Network; Accounts (managed user, Household with children, fail-closed limit, episodes, pins, cached ratings re-check); The helper; Rotation (rotateUi off, app rotation 0); Clock (fake-hwclock); config.json (loopback-only, reverse proxy, first run only, delete after); project layout naming every js/*.js and scripts/*.mjs; development including `npm run test:e2e`, E2E_PORT/E2E_MOCK_PORT; security notes. Landscape fill and drag/nudge appear only as "planned for 2.2".

Roadmap.md: new "Done in 2.1" list; "Scheduled dimming / sleep" and "Playback progress" removed from Ideas; Remote control extended with the reason and D7's PIN-locked constraint; new entries Multi-poster landscape layout, Frame per poster source, Animated frame bulbs, Frame rotation, each with its Non-goals reason; Engineering backlog gains "2.1.x polish" (the "stage" label in the Recommended protection list; an e2e pinning that an unconfigured boot writes plexPoster.whatsNew, K60). All owner-requested entries (b5f6882), the 2.2 section and the other backlog entries are kept.

## Criterion 8 (narrated): everything tagged (verify) or "not yet verified", and where in README.md

- Top banner (line 9): whole-release statement; "(verify)" defined as not yet verified.
- Raspberry Pi setup: package names `chromium-browser` (Bookworm) and `chromium` (Trixie) (lines ~150-154); the apt install lines.
- Supported setups: Plex `*.plex.direct` from outside the home and relay fallback (V1-E24/E25) not yet verified.
- Hardening, Sleep: `raspi-config` Display Options > Screen Blanking, desktop blanking differing between X11 and Wayland/labwc (~222); Android/iPadOS screen timeout (~223); Pi Chromium wake lock under labwc (V1-E16) not yet verified.
- Hardening, SD-card wear: `raspi-config` Performance Options > Overlay File System menu names (~247); Chromium having flushed settings before the overlay is enabled (not yet verified); `--disk-cache-dir=/dev/shm/chromium-cache` and `--disk-cache-size` (~248).
- Tablets: tablet screen timeout (~255); touch-build behaviour of the overscroll flags (not yet verified).
- Kiosk: all Chromium flags `--kiosk --app= --noerrdialogs --disable-session-crashed-bubble --overscroll-history-navigation=0 --disable-pinch`, `--disable-features=OverscrollHistoryNavigation` (~266-277); labwc autostart path `~/.config/labwc/autostart` (~281); XDG autostart vs labwc by session type (V1-E14, ~294); `DeveloperToolsAvailability`=2 and the `/etc/chromium/policies/managed` directory (~305).
- Network: router rules not tested on a real network (stated in prose).
- Accounts: managed-user token approving plex.tv/link and reading /status/sessions (not yet verified); Plex `contentRating` request parameter and syntax, real country-prefixed values, the batched rating re-check (**(verify)**, ~356).
- The helper: `cec-ctl -d /dev/cec0 --to 0 --standby` / `--image-view-on`, `cec-client` `standby 0` / `on 0`, `wlr-randr --output <name> --off|--on` (table, ~375); packages `v4l-utils`, `cec-utils`; `hdmi_force_hotplug=1` and `/boot/firmware/config.txt`; `video` group and `sudo usermod -aG video`; `WAYLAND_DISPLAY`/`XDG_RUNTIME_DIR` values (~385); window still full-screen after power off/on (V1-E22) and the 4 s TV-wake delay ("a guess to be measured"); `thermal_zone0` and `vcgencmd measure_temp` (tagged).
- Rotation: `wlr-randr --transform` and the Pi Screen Configuration route (~403).
- Clock: `fake-hwclock` restoring a stale time (~415).
- config.json: blocking `/config.json` and `/__helper/` in a reverse proxy "not yet verified".

## Code-versus-spec disagreements (I documented the code)

1. Spec R-CTRL-3 says "`?` or a Diagnostics button"; both shipped (index.html has `#diag-shortcuts`), although Q-tl2 recorded no button. README mentions both.
2. `rotateUi`, `statusIndicator` and `posterCacheLimit` have no control in the Settings sheet (grep of index.html); README says they are config.json / import-file only. `fillMode` is in the schema but nothing uses it (D41); README says it is accepted and does nothing in 2.1.
3. `config.json` seeds settings only when the device has no saved settings (js/main.js boot, `source === 'defaults'`); `resetPin` is read on every load. The spec's wording is looser; README states the code's behaviour.
4. Daily reload: the code does not reload on a manual wake (K39) and also waits for a fade, the TV waking and any open dialog (K41); spec R-PROT-3 says "first wake from sleep". README follows the code.
5. Helper auto-detect: `wlr-randr` is tried only with `--helper-output`; `--helper-power wlr-randr` without it refuses to start (device-helper.mjs). README follows the code.
6. The spec's `Dim` option label is "The whole picture" but the Recommended protection list prints "Dim the whole picture: stage" (the 2.1.x polish item).
7. Episodes: toPoster takes the rating from the episode item itself (series poster, year from `grandparentYear`); README says an episode is judged on the rating Plex sends for it. Whether Plex's episode rating matches the show's is unverified (D33).

## Noticed, not changed (outside my Output)

- `sw.js`, `js/main.js` and `package.json` still say VERSION 2.0.0 (release-bump has not run); README and Roadmap say 2.1 and note that the version bump comes at release.
