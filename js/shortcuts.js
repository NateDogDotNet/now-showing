// The one keyboard-shortcut table (R-CTRL-3). main.js builds its key handler from it and the `?` dialog lists it, so
// the two cannot drift. A key is the lower-cased KeyboardEvent.key, except the space bar, which is named "space".

export const SHORTCUTS = Object.freeze(
  [
    { key: 'r', action: 'refresh', label: 'Next poster' },
    { key: 'p', action: 'pause', label: 'Pause or resume auto-refresh' },
    { key: 'space', action: 'pause', label: 'Pause or resume auto-refresh' },
    { key: 'o', action: 'rotate', label: 'Rotate the display 90°' },
    { key: 'f', action: 'fullscreen', label: 'Full screen on or off' },
    { key: 's', action: 'settings', label: 'Settings' },
    { key: 'd', action: 'diagnostics', label: 'Diagnostics' },
    { key: '?', action: 'shortcuts', label: 'Show this list of shortcuts' },
  ].map((entry) => Object.freeze(entry)),
);

/** The table's name for a KeyboardEvent.key value. */
export const normalizeKey = (eventKey) => (eventKey === ' ' ? 'space' : String(eventKey).toLowerCase());

/** key name -> action name. A plain lookup object with no prototype, so "constructor" is not a shortcut. */
export const keyMap = () => Object.assign(Object.create(null), Object.fromEntries(SHORTCUTS.map((s) => [s.key, s.action])));

/** What the dialog lists: every shortcut, or nothing while the shortcuts are switched off. */
export const listShortcuts = (settings) => (settings?.disableShortcuts ? [] : SHORTCUTS);
