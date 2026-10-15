// Release (R-REL-1; D16): the current VERSION (read from sw.js) replaces an older shell cache.
// Service workers are allowed (the default blocks them). A stale `shell-previous` cache is created in the page before the
// service worker registers, as an older installed client would have; after the new worker activates, `shell-<VERSION>`
// exists and the stale cache is gone (sw.js `activate` deletes every other `shell-*` cache).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withApp } from './lib.mjs';

// sw.js is not a module: read its VERSION constant from the text.
const VERSION = /const VERSION = '([^']+)'/.exec(readFileSync(new URL('../../sw.js', import.meta.url), 'utf8'))?.[1];
assert.ok(VERSION, 'sw.js names a VERSION');
const CURRENT = `shell-${VERSION}`;
const STALE = 'shell-previous';

const OPTS = {
  serveArgs: [], // a dedicated server, as pi-stability does
  serviceWorkers: 'allow',
  settings: (app) => ({ plexToken: 'demo-token', serverUrl: `http://127.0.0.1:${app.mockPort}`, libraryKey: '1', pixelShift: false, dailyReload: false }),
};

await withApp(OPTS, async ({ page, app }) => {
  // Hold registration back until the stale cache exists, so the new worker's activate step finds it.
  await page.addInitScript((staleName) => {
    const made = caches.open(staleName).then((c) => c.put('/stale-marker', new Response('stale')));
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (...args) => made.then(() => register(...args));
  }, STALE);
  await page.goto(app.url);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 });
  await page.waitForFunction(
    async ([current, stale]) => {
      const keys = await caches.keys();
      return keys.includes(current) && !keys.includes(stale);
    },
    [CURRENT, STALE],
    { timeout: 20000 },
  );
  const keys = (await page.evaluate(() => caches.keys())).filter((k) => k.startsWith('shell-'));
  assert.deepEqual(keys, [CURRENT], `only the current shell cache remains: ${JSON.stringify(keys)}`);
  console.log(`  ok  ${STALE} was replaced by ${CURRENT} on activation`);
});
