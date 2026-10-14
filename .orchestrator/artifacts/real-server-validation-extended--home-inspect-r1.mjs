// Diagnostic for V1-E23/E25 not opening Settings: a PIN prompt was open. Prints the saved settings of profile-ext2
// with the token and PIN hash/salt reduced to "present"/"absent", and the visible dialogs after a fresh load.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(process.cwd(), '..');
const serve = spawn(process.execPath, ['scripts/serve.mjs', '--port', '8093'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => serve.stdout.on('data', (d) => /8093/.test(String(d)) && res()));
const ctx = await chromium.launchPersistentContext(join(ROOT, 'profile-ext2'), { channel: 'msedge', headless: true, viewport: { width: 1080, height: 1920 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('http://localhost:8093/');
await page.waitForTimeout(3000);
const r = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('plexPoster.settings') || '{}');
  const masked = {};
  for (const [k, v] of Object.entries(s)) masked[k] = /token|pin(hash|salt)/i.test(k) ? (v ? 'present' : 'absent') : v;
  return { settings: masked, keys: Object.keys(localStorage), openDialogs: [...document.querySelectorAll('dialog')].filter((d) => d.open).map((d) => d.id) };
});
console.log(JSON.stringify(r, null, 1));
await ctx.close();
serve.kill();
process.exit(0);
