produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: low · phase: validation-checklists · round: r2
status: complete        failure_class: n/a
paths: docs/validation/real-server-core.md, docs/validation/real-server-extended.md (both in /home/user/wt-validation-checklists, staged, not committed)
criteria:
- plan AC1 met (grep -c PENDING core>=10, extended>=14; core 17 rows, extended 23)
- plan AC2 met (Overall: PENDING exact in both)
- plan AC3 met (loop of core keywords, no output)
- plan AC4 met (loop of extended keywords, no output)
- plan AC5 met (files exist, no token-like string)
- plan AC6 met (Result values line exact in both)
- Critical 1 C07 met: row now C08; says Diagnostics `Token` shows at most first 4 chars + `…`, nothing else anywhere; uses Test connection button and the manual fold
- Critical 1 C03 met: split into C03 (expiry: `Code expired — try again.`, button re-enabled, press again for new code) and C04 (Cancel closes panel silently, button re-enabled)
- I1 met: C06/C07 now Save, then Diagnostics (D or info button), read the `Server` line
- I2 met: C11 names type, thumb/grandparentThumb, User.title, Player.state; extended E08 keeps viewOffset/duration/Player.title; pause (C12) and stop (C13) are separate rows
- I3 met: builder phases named on C16 (status-indicator), E01, E02, E05, E06, E07, E08, E16, E17, E20, E21, E23 (settings-sheet, content-rating-filter, metadata-and-now-playing, sleep-mode, pixel-shift, device-helper-server, device-helper-integration, kiosk-and-pin); core rows use only existing code or core blockers
- I4 met: E11 no longer says "matching the README"; records the package name per OS; README text arrives in `docs`
- m1 met: Server select described (only with 2+ servers, ` (shared)` suffix); C02 observable is panel closing plus `✓ ... — N libraries`; C01 step/expected separated
- m2 met: Test connection and the Enter token and server manually fold named
- m3 met: Save added to library persistence row (C09)
- m4 met: E16 uses `Wake lock: held`
- m5 met: Task Manager memory measure in C17; E09 names the three plex.tv endpoints and Network tab; E18 precondition split from expected
- m6 met: E10 notes Home-user/server-specific token caveat; E22 names the TV-wake constant
- m7 met: C14 says do not copy the request URL
deviations: core rows renumbered C01-C17 (two splits), so old V1-Cnn ids shifted; the in-file cross-reference (C07 repeats C06) was updated. Extended ids unchanged.
questions: none
