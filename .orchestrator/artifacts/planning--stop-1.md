# Stop 1 — planning: decisions before the r2 revision

1. **Plan size.** (a) Lean, about 24 phases: defer the phone remote (U6), multi-poster layout (U7, part), frame-per-source + Coming Attractions art (U8), bulb animation (E3) and frame rotation (E5) to the Roadmap with reasons; blur/info fill still covers U7. (b) Full, about 33 phases: keep all of them, merged as the anchored reviewer proposed. **Recommended: (a)** — the deferred items are the largest risk and cost for the least protection; each stays on the Roadmap. Blocks: every phase.
2. **Rotated screens (F2).** (a) Rotate the whole interface with the poster. (b) Recommend OS-level rotation; app rotation stays poster-only. **Recommended: (a)** — fixes it for every setup at the cost of one phase.
3. **Keyboardless first run.** When the app isn't set up, start the plex.tv code automatically and show it large on the empty screen. **Recommended: yes.** Local-network discovery (your new Roadmap item): (a) Roadmap only, as you asked; (b) add it to this plan. **Recommended: (a).** Blocks: settings/first-run phase.
4. **Sleep.** Idle sleep ("no playback for N hours") defaults off and is not in the protection preset; scheduled sleep shows pure black while still holding the wake lock so playback can wake it; README says to turn off OS screen blanking. **Recommended: yes.** Blocks: sleep-mode.
5. **Content filter.** Applies to random and cached posters, and to now-playing too when a limit is set (on by default, switchable); country ratings like `gb/15` are mapped onto the US ladder; the limit is its own "household with children" toggle, not part of the protection preset. **Recommended: yes.** Blocks: content-rating-filter.
6. **Protection defaults.** On by default: cache-first, pixel shift (slow 1–2 s glide), quiet status dot. Off by default: bulb effect (if kept, redesigned to dim rather than brighten bulbs), night dim (with a whole-poster dim option), sleep. Daily reload on by default only where it's safe (service worker active and the server reachable). **Recommended: yes.** Blocks: settings core.
7. **Phone remote (U6).** Covered by item 1(a) if deferred. If kept: QR only inside the PIN-locked settings, no protective settings changeable from the phone. **Recommended: defer.**
8. **Device helper (Pi).** Narrow it to screen power (HDMI-CEC / output off) and CPU temperature; drop brightness control (TVs don't support it over HDMI). **Recommended: yes.**
9. **Local server.** Serve only the app's own files (allowlist) instead of blocking a few paths; `config.json` stays local-only. **Recommended: yes.**
10. **Kiosk lock-out recovery.** Add a remote-friendly reveal (hold OK/Enter 3 s) and a documented PIN reset (local `config.json` flag). **Recommended: yes.**
11. **Release gate.** The 2.1 release requires the token rotated and the real-server check passing; optional phases never block it; a failed validation reopens the phase it names. **Recommended: yes.**
12. **Parallel work.** Phases that run at the same time each get their own git worktree and test ports. **Recommended: yes.**
13. **End of the run.** Push to this branch only; a PR or merge only when you ask (so no "publish" review). **Recommended: yes.**
14. **Git history.** Is this repository public or shared with anyone? If yes, purging the old `config.js` from history (a force-push, asked separately before it runs) is worth it; if private, rotating the token is enough. **Recommended: rotate; skip the purge unless public.**
15. **Test tooling.** Add Playwright as a dev-only dependency with a committed lockfile; the app itself stays dependency-free. **Recommended: yes.**

Remaining drafter questions take their recommended readings unless you say otherwise: client-side PIN is deterrence only and the UI says so; one version bump at release; core and extended real-server checks stay separate.

Reply "defaults" to accept every recommendation, or give numbers to change (e.g. "1b, 14: public").
<!-- end stop 1 -->
