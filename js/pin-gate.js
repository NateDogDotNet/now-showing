// The settings PIN gate (D16: a deterrent, not security): the one place that asks for the PIN. `createPinGate` builds
// the PIN prompt (kiosk.js) over the page's dialog and returns it with `requestPin`, the check every route to a saved
// setting goes through. Nothing here reads the page when the module loads.

import { createPinPrompt } from './kiosk.js';

/** `dialog` is the PIN dialog element; `getSettings()` returns the current settings (the PIN hash and salt are read live). */
export function createPinGate({ dialog, storage, getSettings }) {
  const prompt = createPinPrompt({
    dialog,
    storage,
    getAuth: () => ({ hash: getSettings().settingsPinHash, salt: getSettings().settingsPinSalt }),
  });

  /**
   * The ONE PIN check. True at once when no PIN is set; otherwise the PIN dialog decides. Settings, Diagnostics, import,
   * Reset everything, the token reveal and the token export all ask here.
   */
  const requestPin = () => (getSettings().settingsPinHash ? prompt.verify() : Promise.resolve(true));

  return { prompt, requestPin };
}
