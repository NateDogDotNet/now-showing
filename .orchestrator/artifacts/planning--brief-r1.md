# Brief — planning r1: write the spec and the integration plan

You are the builder for the **planning** phase of a run driven by the `integration-orchestrator`
skill (`~/.claude/skills/integration-orchestrator/SKILL.md`). Read that skill's sections
*The Plan Is a Graph*, *Routing off tags*, *Phase types*, *HITL phases* and the Step 4/5 rules
before you write the plan, because the plan you write will be driven by that skill and must be
machine-checkable by it. The conductor never writes; you do.

Repository: `/home/user/plex-poster-app` (branch `claude/intelligent-rubin-4vsi63`, HEAD `3a7b688`).
Read `README.md`, `Roadmap.md`, `package.json`, `index.html`, `css/app.css`, every file in `js/`,
`sw.js`, `scripts/serve.mjs`, `scripts/mock-plex.mjs` and `tests/` before writing. Cite real
file paths and function names; do not invent ones that do not exist.

## Deliverables (Output paths — touch nothing else)

1. `docs/spec.md` — product + technical spec.
2. `docs/integration-plan.md` — phased plan the orchestrator will drive.
3. `.orchestrator/artifacts/planning--handback-builder-r1.md` — your report (header below).
4. Ambiguities → append to `.orchestrator/questions.md` as
   `Q<n> — planning r1: where · why it matters · work held · proposed reading`.

`git add docs/spec.md docs/integration-plan.md`. **Do not commit.**

## Source findings — every ID must be addressed

Every finding below must appear in the spec as a requirement (or an explicit, reasoned
non-goal / docs-only item) AND be delivered by at least one plan phase. Keep the IDs; the
conductor will grep for each one in both files.

### Fix first (verified bugs/risks in the current code)
- **F1** Rotation 90/270° on a landscape viewport overflows: `.app` is `display:grid; place-items:center`
  and the sideways stage (e.g. 1080×1687 inside 1920×1080) is taller than the container, so the grid
  row grows and the rotated stage lands ~300px low and is clipped. Repro: 1920×1080, rotation 90.
- **F2** Settings sheet, controls, toast, status pill and empty-state card do not rotate with the stage,
  so on a physically rotated screen the UI reads sideways. Decide: rotate the whole UI shell, or make
  OS-level rotation the recommended path and keep app rotation for the stage only (open question).
- **F3** `fetchImage` in `js/main.js` always re-downloads the poster from Plex and re-writes it to the
  Cache API even when `poster-cache.js` already holds it — 288 downloads/writes per day at 5-min
  rotation; network + SD-card wear. Cache-first is required.
- **F4** `scripts/serve.mjs` serves `config.json` (contains the Plex token) to any client when started
  with `--host 0.0.0.0`. Must refuse non-loopback requests for it.
- **F5** Status pill (`#status`) is persistent, top-left, re-rendered every second with a countdown:
  distracting in a living room and a static-pixel burn-in risk. Show only with controls; otherwise a
  small, position-shifting indicator dot.
- **S1** (security, from the first review) The original `config.js` committed a real Plex token; it is
  still in git history. User must rotate the token (a human act → `mode: hitl`). Purging history is a
  force-push (→ `irreversible`, only if the user chooses it; offer it as an option, not a default).
- **V1** Nothing has been tested against a real Plex server or the real plex.tv PIN flow (only the
  mock). Real-server validation of: CORS on `/photo/:/transcode` blob download, sign-in, server
  discovery, `contentRating` filtering → a `mode: hitl` phase with a checklist.

### UI/UX
- **U1** When already connected, settings opens with a big "Sign in with Plex" button. Replace with a
  connected-state summary card ("Connected to <server> · <library> · Change").
- **U2** Times entered in seconds ("300 seconds"); use minute presets (1/5/15/60) with a custom option.
- **U3** Collapse rarely-needed settings (now-playing poll interval, pool size, cross-fade) under "Advanced".
- **U4** Library option labels read "Movies (movies)"; show "Movies · 1,240 titles" (Plex sections expose a count via `/library/sections/{key}/all?X-Plex-Container-Size=0` → `totalSize`; verify).
- **U5** Slider-only poster positioning is fiddly on a TV: drag-to-position plus arrow-key nudge (Shift = coarse) while settings is open.
- **U6** Hardest part on a keyboardless TV is configuration: show a QR code that lets a phone configure the display. (Static app, no backend: design must say how the phone's settings reach the display — e.g. the local `serve.mjs` exposing a loopback-protected settings endpoint, or a one-time settings link carrying an encoded settings blob. Open question with a recommendation; mind the token.)
- **U7** Landscape screens are ~⅔ black: optional fill modes — blurred/dimmed poster backdrop, side info panel (synopsis, runtime, rating), or 2–3 posters side by side.
- **U8** Frame always says "NOW SHOWING", even for random picks: frame per poster source ("Now Showing" while playing, "Coming Attractions" for random). New artwork is the user's asset → decide whether the artwork is produced by the user (`hitl`) or generated (text-swap of the header band) — open question.
- **U9** Now-playing extras: thin progress bar along the frame; "Playing in <player/room>" label (Plex session `viewOffset`/`duration`, `Player.title`).
- **U10** Title overlay duplicates the title printed on most posters; replace with useful metadata (content rating, runtime, year) or keep off.
- **U11** Seven icon-only controls are ambiguous (pin, rotate): hover labels; visible text labels on touch devices.
- **U12** On touch, the first tap must only wake the controls, never activate a button.
- **U13** Keyboard shortcuts are discoverable only in tooltips: a `?` overlay listing them.
- **U14** Errors must carry their fix (e.g. "Token rejected" → **Sign in again** button; "Can't reach server" → Diagnostics / Test connection).

### Equipment protection (persona: 55" OLED in portrait in a hallway, Raspberry Pi 4 behind it, 24/7, kids in the house)
- **E1** Sleep: schedule (pure black during set hours) + "sleep after N hours with no playback, wake when something plays". While asleep, release the screen wake lock so OS/TV power saving can act.
- **E2** Pixel shift / orbit: move the stage a few px every few minutes; requires a 1–2% margin (frame currently fills full width).
- **E3** Animated bulbs (slow twinkle/chase) — varies the brightest static pixels. The frame is a raster PNG, so state how (e.g. a CSS/SVG/canvas bulb layer at known bulb positions, or a brightness modulation mask) and keep it cheap on a Pi.
- **E4** Frame brightness slider, auto-dimmed at night (CSS filter on the frame layer).
- **E5** Frame rotation: switch frame daily/weekly.
- **E6** Optional device helper on the Pi (part of `scripts/serve.mjs` or a sibling) to do what a page cannot: display power (HDMI-CEC `cec-client`, `vcgencmd display_power`, `wlr-randr`), real brightness (DDC/CI `ddcutil`, `/sys/class/backlight`), CPU temperature. Loopback-only, opt-in, documented.
- **E7** Docs: smart plug fallback schedule.
- **E8** SD-card wear: F3 + docs for read-only overlay FS (`raspi-config`) and Chromium disk cache in RAM.
- **E9** Heat/GPU load: remove `backdrop-filter` on `.sheet` (expensive on Pi GPU); show CPU temperature in Diagnostics when the helper is present.
- **E10** Daily self-reload (e.g. 04:00 or on wake from sleep) to shed Chromium memory growth.
- **E11** Docs: tablets kept at 100% charge 24/7 risk battery swelling — use charge limit / smart plug.
- **E12** Settings PIN + kiosk mode: hide controls entirely; reveal by long-press (3 s) in a corner; option to disable keyboard shortcuts.
- **E13** Docs: Chromium kiosk flags that stop swipe-back/pinch from leaving the app (`--overscroll-history-navigation=0`, `--disable-pinch`; verify flag names).
- **E14** Content filter: maximum content rating (e.g. PG-13) for random posters (Plex `contentRating` filter on `/library/sections/{key}/all`; verify the exact parameter/semantics; fallback: filter client-side on `contentRating`).
- **E15** Docs: connect with a managed Plex Home user restricted to one library (limits a stolen device's blast radius).
- **E16** "Show token" button sits behind the PIN.
- **E17** Docs: put the display on an IoT/guest network that can reach only Plex port 32400.

## Spec requirements (`docs/spec.md`)

Sections, in this order: Goal line (one sentence, outcome not implementation) · Personas & use
cases (at least the hallway-OLED owner, a wall tablet owner, a landscape-TV owner) · Principles
(e.g. zero runtime dependencies, works offline, no backend required, protect the hardware by
default) · Requirements — one subsection per area, each requirement with an ID `R-<area>-<n>`, the
finding IDs it answers, priority (P0 fix-first / P1 protection / P2 polish / P3 bigger features),
and testable acceptance statements · Non-goals (with reasons) · Settings model changes (new keys
with defaults, added to `js/settings.js` SCHEMA; migration impact) · Security & privacy · Open
questions — numbered, each with options, a **recommended default** and its cost, and which phases
it blocks · Traceability matrix: finding ID → requirement IDs → plan phase names. Every finding ID
F1–F5, S1, V1, U1–U14, E1–E17 appears in the matrix.

Defaults for protection features must protect the hardware without surprising the user (state the
default for each: on/off, values). Research claims you cannot verify in this environment (Plex
parameters, Chromium flags, CEC commands) are marked **(verify)** and listed for V1.

## Plan requirements (`docs/integration-plan.md`)

It is driven by the integration-orchestrator, so:

- A preamble: "every command runs from the repository root"; the starting commit `3a7b688`; how to
  run the mock (`npm run demo`) and the test command (`npm test`).
- Phases with **names** (kebab-case, e.g. `rotation-layout-fix`), numbered only inside the file.
  Each phase has exactly these fields:
  - `Goal:` one line
  - `Findings:` IDs addressed · `Requirements:` R-IDs
  - `Mode:` afk | hitl · `Tags:` from the skill's tag table (`risk:high`, `irreversible`, `ui`,
    `publish`, `planning`, `ideation`, `architecture`, `data`, `docs`, `bar-quality`) ·
    `Blocked by:` phase names (real prerequisites only — not "the previous number")
  - `Output:` the exact paths the phase may create or modify (nothing else; the plan file and
    `.orchestrator/` are never Output)
  - `Acceptance criteria:` numbered; **each one runnable as a shell command from the repo root that
    exits 0 on pass** (unit tests via `node --test`, browser checks via committed Playwright
    scripts against the mock server, `grep`/`test` probes), or explicitly marked `narrated:` with
    what a human/reviewer checks. Prefer commands. Every file a criterion implies is in Output.
  - `Notes/hazards:` known traps (e.g. Pi GPU cost, wake-lock interplay, token exposure).
- Browser-level criteria need a committed e2e harness. Make an early phase that adds one
  (Playwright scripts under `tests/e2e/` driving `scripts/serve.mjs --mock`; Chromium is
  preinstalled at `/opt/pw-browsers`, `PLAYWRIGHT_BROWSERS_PATH` is set; keep the app's runtime
  zero-dependency — a devDependency on `@playwright/test` or using the global `playwright` is an
  open question with a recommendation) and an `npm run test:e2e` script; later UI phases add their
  own e2e specs to it.
- Extend `scripts/mock-plex.mjs` where criteria need it (contentRating, viewOffset/duration,
  Player.title, totalSize) — in the phase that needs it.
- Include `mode: hitl` phases for S1 (token rotation) and V1 (real-server validation) with the
  checklist the user follows and the artifact that proves it (e.g. a results file the user fills in).
  Include the history purge only as an optional `irreversible` phase gated on the user's choice.
- Group phases into four milestones matching the priorities (P0 fix-first, P1 protection, P2
  polish, P3 bigger features). A milestone's last phase may run `/phase-gate`.
- A docs phase (tag `docs`) updates `README.md` (kiosk hardening, Pi hardening, smart plug,
  battery, VLAN, managed user, Chromium flags) — E7, E8 docs, E11, E13, E15, E17.
- Bump `VERSION` in `sw.js`, `js/main.js`, `package.json` in the phase that changes precached files,
  or in one release phase at the end (decide; say which).
- End with a dependency graph listing (phase → blocked by) and a list of phases that can run
  concurrently.
- Keep phases right-sized: a phase is one reviewable change; do not split a few-line fix from its
  sibling if they share a pre-flight and evidence run (the skill merges those).

## Constraints

- Match the existing code's idioms (plain ES modules, no build step, `node --test`).
- Do not change any code — this phase writes two documents only.
- Do not invent APIs. Where unsure, mark **(verify)**.
- Concise but complete; tables where they help. No marketing prose.

## Handback (write before you return)

`.orchestrator/artifacts/planning--handback-builder-r1.md`, opening with:

```
produced_by: general-purpose (orchestrator-builder brief) · model: <model> · effort: medium · phase: planning · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created/edited/staged>
criteria: <one line per deliverable requirement above — met / not met, with the command you ran>
deviations: <or none>
questions: <Q ids appended to .orchestrator/questions.md, or none>
```

Then the commands you ran with their output tails, including:
`for id in F1 F2 F3 F4 F5 S1 V1 U1 U2 U3 U4 U5 U6 U7 U8 U9 U10 U11 U12 U13 U14 E1 E2 E3 E4 E5 E6 E7 E8 E9 E10 E11 E12 E13 E14 E15 E16 E17; do printf "%s spec=%s plan=%s\n" $id $(grep -cw $id docs/spec.md) $(grep -cw $id docs/integration-plan.md); done`

If the harness refuses your Write, return the full report as text with first line `WRITE-BLOCKED: <path>`.
