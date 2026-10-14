// Reproduction: which settings step saves a PIN hash nobody chose? (profile-ext2 had settingsPinHash present after
// home-ext-r1b, whose steps never set a PIN.) Fresh profile, no sign-in. After each step prints PIN hash presence,
// the open dialogs and the form error. Never prints the hash, the salt or a token.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), '..');
const PROFILE = join(ROOT, 'profile-pinrepro');
rmSync(PROFILE, { recursive: true, force: true });
const serve = spawn(process.execPath, ['scripts/serve.mjs', '--port', '8094'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => serve.stdout.on('data', (d) => /8094/.test(String(d)) && res()));
const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'msedge', headless: true, viewport: { width: 1080, height: 1920 } });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('http://localhost:8094/');
await page.waitForTimeout(2000);
const state = async (label) => {
  const s = await page.evaluate(() => ({ pin: Boolean(JSON.parse(localStorage.getItem('plexPoster.settings') || '{}').settingsPinHash), dialogs: [...document.querySelectorAll('dialog')].filter((d) => d.open).map((d) => d.id), pinTitle: document.querySelector('#pin-title')?.textContent, formError: document.querySelector('#form-error')?.textContent, pinStatus: document.querySelector('#pin-status')?.textContent }));
  console.log(new Date().toISOString().slice(11, 19), label.padEnd(44), JSON.stringify(s));
};
const open = async () => { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('s'); await page.waitForTimeout(800); };
const save = async () => { await page.locator('#settings-save').click(); await page.waitForTimeout(1500); };

await state('loaded (fresh, no sign-in)');
await page.getByRole('button', { name: 'Open settings' }).click();
await page.waitForTimeout(800);
await state('settings opened from the empty card');
await page.locator('#household-toggle').check();
await page.locator('select[name="maxContentRating"]').selectOption('PG-13');
await state('household on, PG-13 selected (not saved)');
await save();
await state('after Save (household PG-13)');
if (await page.locator('#settings').evaluate((d) => d.open)) { await page.locator('#settings-cancel').click(); await page.waitForTimeout(500); }
await open();
await state('pressed s');
if (await page.locator('#settings').evaluate((d) => d.open)) {
  await page.locator('label.seg-opt', { hasText: 'Custom' }).click();
  await page.locator('input[name="rotateMinutes"]').fill('0.2');
  await page.locator('input[name="rotateMinutes"]').press('Tab');
  await state('custom 0.2 min typed, Tab pressed');
  await save();
  await state('after Save (custom interval)');
}
await page.waitForTimeout(30000);
await state('30 s later');
await open();
await state('pressed s again');
await ctx.close();
serve.kill();
rmSync(PROFILE, { recursive: true, force: true });
process.exit(0);
