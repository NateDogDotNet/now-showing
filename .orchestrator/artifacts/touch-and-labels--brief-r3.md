# Brief — touch-and-labels r3 (re-dispatch 2)

Agent name: touch-and-labels-builder-r3 · effort: medium · worktree `/home/user/wt-touch-and-labels` (r2 staged). The r1 and r2 briefs bind. E2E_PORT=24720 E2E_MOCK_PORT=24721. Stage, do not commit. Review: `/home/user/plex-poster-app/.orchestrator/artifacts/touch-and-labels--review-r2.md`; triage in `.orchestrator/phases/touch-and-labels.md` (Step 7 triage — r2).

Tests first; paste each failing on r2:
1. K58 (TLI1): the first-tap rule also covers the `#empty` backdrop — a target that IS the #empty element (not its card, buttons or text). e2e: unconfigured display, controls hidden → touch tap where the hidden Rotate button sits → rotation unchanged and the bar shows; second tap rotates. The empty card's Open settings still works on the first tap.
2. TLM2: e2e — a touch press that yields no click, then keyboard Enter on a focused control button → the button acts (pins the `e.detail > 0` guard).
3. TLM1: a `controlLabels` select (Auto / Always / Never) in Settings, bound by name (js/settings-ui.js reads by name; do not edit settings.js). e2e: choosing Always shows labels on desktop after Save.
4. TLM3: the shortcuts dialog's "O" key cap cannot be read as a zero (e.g. show `o`, or a distinct glyph/font, with an accessible "letter O" label).
5. TLM4: opening Diagnostics does not move first focus to the Keyboard shortcuts button (keep the previous first-focus target).
Run criteria 1–5 and the full `npm run test:e2e` once at the end; lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`; paste outputs. Touch only the phase Output (index.html, css/app.css, js/main.js, the specs).

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/touch-and-labels--handback-builder-r3.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: touch-and-labels · round: r3`, header fields, blank line, `Agent: touch-and-labels-builder-r3 · dispatched: <stamp>`.
