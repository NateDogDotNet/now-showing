// V1-C07 (LAN address blocked, the checklist's alternative to a device off the LAN) and V1-C03 (code expiry),
// agent-run on HOME. Reuses the signed-in profile. Blocks, inside the browser only, every request to a private-range
// address or a local *.plex.direct name, so sign-in discovery has to pick a remote address. Before that it keeps the
// saved local server URL in page memory, and afterwards writes it back through the manual fold, so the display ends
// on the local address. Never prints the token, a request URL or the server URL.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(process.cwd(), '..');
const ts = () => new Date().toISOString().slice(11, 19) + 'Z';
let token = null;
const clean = (s) => { let t = String(s ?? '').replace(/X-Plex-Token=[^&\s"']+/gi, 'X-Plex-Token=<masked>'); if (token) t = t.split(token).join('<token>'); return t; };
const out = (...a) => console.log(ts(), ...a.map(clean));
const row = (id, result, notes) => console.log(`\n=== ${id} ${result} (${ts()})\n${clean(notes)}`);
const cue = (s) => console.log(`\n>>> ${s} (${ts()}) <<<\n`);

const serve = spawn(process.execPath, ['scripts/serve.mjs', '--port', '8091'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => serve.stdout.on('data', (d) => /8091/.test(String(d)) && res()));
const ctx = await chromium.launchPersistentContext(join(ROOT, 'profile'), { channel: 'msedge', headless: true, viewport: { width: 1080, height: 1920 } });
const page = ctx.pages()[0] || (await ctx.newPage());
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`${ts()} ${m.text()}`));
await page.goto('http://localhost:8091/');
token = await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings') || '{}').plexToken || null);
await page.evaluate(() => { window.__origUrl = JSON.parse(localStorage.getItem('plexPoster.settings') || '{}').serverUrl; });
await page.waitForTimeout(2000);

const code = () => page.evaluate(() => document.querySelector('#signin-code')?.innerText.trim() ?? '');
const waitCode = async (not = '') => { await page.waitForFunction((n) => { const c = document.querySelector('#signin-code')?.innerText.trim() ?? ''; return /^[A-Z0-9]{4}$/.test(c) && c !== n; }, not, { timeout: 20000 }); return code(); };
const openSettings = async () => { if (!(await page.locator('#settings').evaluate((d) => d.open))) await page.keyboard.press('s'); await page.locator('#settings[open]').waitFor({ timeout: 5000 }); };
const diag = async () => { await page.keyboard.press('d'); await page.locator('#diag-list').waitFor({ state: 'visible', timeout: 5000 }); const o = await page.evaluate(() => { const el = [...document.querySelectorAll('#diag-list > *')]; const r = {}; for (let i = 0; i < el.length; i += 2) r[el[i].textContent] = el[i + 1].textContent; return r; }); await page.keyboard.press('Escape'); return o; };
const kindOf = (s) => (/\.plex\.direct/.test(s) ? (/https:\/\/(10|192-168|172-(1[6-9]|2\d|3[01]))-/.test(s) ? 'local https plex.direct' : 'remote https plex.direct') : /http:\/\/(10\.|192\.168\.|172\.)/.test(s) ? 'local http' : /relay/i.test(s) ? 'relay' : 'other');
const privateHost = (h) => /^(10|192-168|172-(1[6-9]|2\d|3[01]))-[\d-]+\./.test(h) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
let blocked = 0;

// V1-C07
try {
  await ctx.route('**/*', (r) => { const h = new URL(r.request().url()).hostname; if (privateHost(h)) { blocked++; return r.abort('addressunreachable'); } return r.continue(); });
  out('LAN addresses blocked inside the browser (private ranges and local *.plex.direct names)');
  await openSettings();
  if (await page.locator('#connected-card').isVisible()) await page.locator('#connected-change').click();
  await page.locator('#signin-btn').click();
  const c = await waitCode();
  cue(`APPROVE THIS CODE AT plex.tv/link: ${c}`);
  const e0 = errors.length;
  await page.locator('#signin-panel').waitFor({ state: 'hidden', timeout: 14 * 60 * 1000 });
  await page.waitForFunction(() => /^(✓|✗)/.test(document.querySelector('#test-result')?.innerText.trim() ?? ''), null, { timeout: 120000 }).catch(() => {});
  const res = (await page.locator('#test-result').innerText()).trim();
  out('connection line:', res);
  const libs = await page.locator('#library-select option').allInnerTexts();
  const movies = libs.find((l) => /^Movies/.test(l));
  if (movies) await page.locator('#library-select').selectOption({ label: movies });
  await page.locator('#settings-save').click();
  await page.locator('#settings').waitFor({ state: 'hidden', timeout: 10000 });
  await page.keyboard.press('r');
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('/photo/:/transcode')), null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const d = await diag();
  const kind = kindOf(d.Server || '');
  const hits = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/photo/:/transcode')).map((e) => e.responseStatus));
  const mixed = errors.slice(e0).filter((e) => /Mixed Content|CORS/i.test(e));
  const shown = await page.evaluate(() => [...document.querySelectorAll('#poster-a, #poster-b')].some((i) => i.naturalWidth > 0 && getComputedStyle(i).opacity !== '0'));
  row('V1-C07', kind === 'remote https plex.direct' && /^✓/.test(res) && shown && !mixed.length ? 'PASS' : 'FAIL (settings-sheet)',
    `method: LAN addresses blocked inside the browser on HOME (${blocked} requests refused); connection line "${res}"; Diagnostics Server: address type ${kind}; library ${d.Library}; poster on screen ${shown}, Poster "${d.Poster}"; poster downloads ${JSON.stringify(hits)}; mixed-content/CORS console errors ${JSON.stringify(mixed)}`);
} catch (e) { row('V1-C07', 'NOT COMPLETED', `error: ${e.message.split('\n')[0]}`); }

// restore the local address
try {
  await ctx.unroute('**/*');
  await openSettings();
  await page.locator('#manual-connection > summary').click();
  await page.evaluate(() => { const f = document.querySelector('input[name="serverUrl"]'); f.value = window.__origUrl; f.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#settings-save').click();
  await page.locator('#settings').waitFor({ state: 'hidden', timeout: 10000 });
  const d = await diag();
  out('restored: Diagnostics Server address type', kindOf(d.Server || ''));
} catch (e) { out('restore failed:', e.message.split('\n')[0]); }

// V1-C03
try {
  await openSettings();
  if (await page.locator('#connected-card').isVisible()) await page.locator('#connected-change').click();
  await page.locator('#signin-btn').click();
  const c1 = await waitCode();
  cue(`DO NOT APPROVE ${c1}: it is the expiry test`);
  const t0 = Date.now();
  await page.getByText('Code expired — try again.').waitFor({ timeout: 40 * 60 * 1000 });
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  const enabled = await page.locator('#signin-btn').isEnabled();
  const waiting = await page.getByText('Waiting for you to approve').isVisible().catch(() => false);
  await page.locator('#signin-btn').click();
  const c2 = await waitCode(c1);
  await page.locator('#signin-cancel').click();
  await page.locator('#settings-cancel').click();
  row('V1-C03', enabled && !waiting && c2 !== c1 ? 'PASS' : 'FAIL (settings-sheet)', `code ${c1} expired after ${mins} min (real lifetime); "Code expired — try again." shown; button enabled ${enabled}; "Waiting" left ${waiting}; pressing again gave ${c2}`);
} catch (e) { row('V1-C03', 'NOT COMPLETED', `error: ${e.message.split('\n')[0]}`); }

out('all console errors:', JSON.stringify(errors));
await ctx.close();
serve.kill();
process.exit(0);
