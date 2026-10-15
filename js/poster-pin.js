// The Pin/Unpin button: pins the poster on screen (it then stays, exempt from the household limit, D5) or lets the
// rotation go on. `createPosterPin` takes the page's callbacks; nothing here reads the page when the module loads.

import { toast } from './util.js';

/**
 * `getSettings()` returns the current settings; `getCurrent()` returns the poster on screen, or null when none is (a
 * blocked poster is not on screen: it cannot be pinned); `applySettings(next)` saves and applies a settings object.
 */
export function createPosterPin({ getSettings, getCurrent, applySettings }) {
  function togglePin() {
    const s = getSettings();
    const current = getCurrent();
    if (s.staticRatingKey) {
      applySettings({ ...s, staticRatingKey: '', staticTitle: '' });
      toast('Unpinned — rotating posters again.');
    } else if (current) {
      applySettings({ ...s, staticRatingKey: current.ratingKey, staticTitle: current.title });
      toast(`Pinned "${current.title}".`);
    } else {
      toast('Nothing to pin yet.');
    }
  }

  return { togglePin };
}
