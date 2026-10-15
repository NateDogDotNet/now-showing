// Release (R-REL-1; D16): 2.1.0 replaces the 2.0.0 shell cache.
// Service workers are allowed (the default blocks them). A stale `shell-2.0.0` cache is created in the page before the
// service worker registers, as an installed 2.0.0 client would have; after the new worker activates, `shell-2.1.0`
// exists and `shell-2.0.0` is gone (sw.js `activate` deletes every other `shell-*` cache).

import assert from 'node:assert/strict';
import { withApp } from './lib.mjs';

const OPTS = {
  serveArgs: [], // a dedicated server, as pi-stability does
  serviceWorkers: 'allow',
  settings: (app) => ({ plexToken: 'demo-token', serverUrl: `http://127.0.0.1:${app.mockPort}`, libraryKey: '1', pixelShift: false, dailyReload: false }),
};

await withApp(OPTS, async ({ page, app }) => {
  // Hold registration back until the stale cache exists, so the new worker's activate step finds it.
  await page.addInitScript(() => {
    const stale = caches.open('shell-2.0.0').then((c) => c.put('/stale-marker', new Response('2.0.0')));
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (...args) => stale.then(() => register(...args));
  });
  await page.goto(app.url);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 });
  await page.waitForFunction(
    async () => {
      const keys = await caches.keys();
      return keys.includes('shell-2.1.0') && !keys.includes('shell-2.0.0');
    },
    null,
    { timeout: 20000 },
  );
  const keys = (await page.evaluate(() => caches.keys())).filter((k) => k.startsWith('shell-'));
  assert.deepEqual(keys, ['shell-2.1.0'], `only the current shell cache remains: ${JSON.stringify(keys)}`);
  console.log('  ok  shell-2.0.0 was replaced by shell-2.1.0 on activation');
});
