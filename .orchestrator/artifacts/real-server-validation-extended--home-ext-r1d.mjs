// r1d: V1-E25 alone on profile-ext2 (r1c's relay code RGK7 expired unapproved at 04:39:56Z). Same block as r1c.
// Fixes: openSettings enters the PIN when the prompt opens (r1/r1b set PIN 2468 in E23, then could not reopen Settings);
// E05 reads the on-screen title (Show title below poster) instead of counting downloads (cache-first reuses posters);
// E03 builds the pool request exactly as js/plex.js pool() does and compares it with the same request unfiltered.
// Never prints the token, the server URL or a request URL.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(process.cwd(), '..');
const { allows, allowedValues } = await import(pathToFileURL(join(ROOT, 'js', 'ratings.js')).href);
const PIN = '2468';
const ts = () => new Date().toISOString().slice(11, 19) + 'Z';
let token = null;
const clean = (s) => { let t = String(s ?? '').replace(/X-Plex-Token=[^&\s"']+/gi, 'X-Plex-Token=<masked>').replace(/https?:\/\/\S+/g, '<url>').replace(/[0-9a-f]{32}/g, '<id>'); if (token) t = t.split(token).join('<token>'); return t; };
const out = (...a) => console.log(ts(), ...a.map(clean));
const row = (id, result, notes) => console.log(`\n=== ${id} ${result} (${ts()})\n${clean(notes)}`);
const cue = (s) => console.log(`\n>>> ${s} (${ts()}) <<<\n`);
const step = async (id, fn) => { try { await fn(); } catch (e) { await dump(id); row(id, 'NOT COMPLETED', `error: ${e.message.split('\n')[0]}`); } };

const serve = spawn(process.execPath, ['scripts/serve.mjs', '--port', '8093'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => serve.stdout.on('data', (d) => /8093/.test(String(d)) && res()));
const ctx = await chromium.launchPersistentContext(join(ROOT, 'profile-ext2'), { channel: 'msedge', headless: true, viewport: { width: 1080, height: 1920 }, acceptDownloads: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`${ts()} ${m.text()}`));
await page.goto('http://localhost:8093/');
await page.waitForTimeout(3000);
token = await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings') || '{}').plexToken || null);

async function dump(why) { const st = await page.evaluate(() => ({ open: [...document.querySelectorAll('dialog')].filter((d) => d.open).map((d) => d.id), pinTitle: document.querySelector('#pin-title')?.textContent })).catch((e) => ({ err: e.message })); out('DUMP', why, JSON.stringify(st)); }
const pinOpen = () => page.locator('#pin-dialog[open]').isVisible().catch(() => false);
const pinIn = async (digits) => { await page.locator('#pin-dialog[open]').waitFor({ timeout: 5000 }); for (const d of digits) await page.locator(`#pin-dialog [data-key="${d}"]`).click(); await page.locator('#pin-dialog [data-key="ok"]').click(); await page.waitForTimeout(600); };
const pinSet = async () => Boolean(await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings') || '{}').settingsPinHash));
const openSettings = async () => {
  if (await page.locator('#settings').evaluate((d) => d.open)) return;
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('s');
  await page.waitForTimeout(700);
  if (await pinOpen()) await pinIn(PIN);
  await page.locator('#settings[open]').waitFor({ timeout: 5000 });
};
const save = async () => { await page.locator('#settings-save').click(); await page.locator('#settings').waitFor({ state: 'hidden', timeout: 15000 }); };
const api = (path) => page.evaluate(async (p) => { const s = JSON.parse(localStorage.getItem('plexPoster.settings') || '{}'); const r = await fetch(`${s.serverUrl}${p}`, { headers: { Accept: 'application/json', 'X-Plex-Token': s.plexToken } }); return { status: r.status, body: r.ok ? await r.json() : null }; }, path);

// V1-E25
await step('V1-E25', async () => {
  const conns = await page.evaluate(async () => { const s = JSON.parse(localStorage.getItem('plexPoster.settings') || '{}'); const cid = localStorage.getItem('plexPoster.clientId'); const r = await fetch(`https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&X-Plex-Client-Identifier=${encodeURIComponent(cid)}`, { headers: { Accept: 'application/json', 'X-Plex-Token': s.plexToken } }); const sv = (await r.json()).find((x) => x.name === 'Castle Anthrax'); return (sv?.connections || []).map((c) => ({ host: new URL(c.uri).hostname, relay: Boolean(c.relay) })); });
  const direct = new Set(conns.filter((c) => !c.relay).map((c) => c.host));
  const relayHosts = new Set(conns.filter((c) => c.relay).map((c) => c.host));
  out(`Castle Anthrax: ${direct.size} direct addresses (refused from now on), ${relayHosts.size} relay`);
  let refused = 0;
  await ctx.route('**/*', (r) => { const h = new URL(r.request().url()).hostname; if (direct.has(h) || /^(10|192-168|172-(1[6-9]|2\d|3[01]))-/.test(h) || /^192\.168\./.test(h)) { refused++; return r.abort('addressunreachable'); } return r.continue(); });
  await openSettings();
  if (await page.locator('#connected-card').isVisible()) await page.locator('#connected-change').click();
  await page.locator('#signin-btn').click();
  await page.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#signin-code')?.innerText.trim() ?? ''), null, { timeout: 20000 });
  cue(`APPROVE THIS CODE AT plex.tv/link: ${(await page.locator('#signin-code').innerText()).trim()}  (relay test, row V1-E25)`);
  await page.locator('#signin-panel').waitFor({ state: 'hidden', timeout: 14 * 60 * 1000 });
  await page.waitForFunction(() => /^(✓|✗)/.test(document.querySelector('#test-result')?.innerText.trim() ?? ''), null, { timeout: 180000 }).catch(() => {});
  const line = (await page.locator('#test-result').innerText()).trim();
  const libs = await page.locator('#library-select option').allInnerTexts();
  const movies = libs.find((l) => /^Movies/.test(l));
  if (movies) await page.locator('#library-select').selectOption({ label: movies });
  await save();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings') || '{}').serverUrl || '');
  const host = (() => { try { return new URL(saved).hostname; } catch { return ''; } })();
  const viaRelay = relayHosts.has(host);
  const b0 = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/photo/:/transcode')).length);
  const t0 = Date.now();
  await page.waitForFunction((b) => performance.getEntriesByType('resource').filter((e) => e.name.includes('/photo/:/transcode')).length >= b + 3, b0, { timeout: 180000 }).catch(() => {});
  const n = (await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/photo/:/transcode')).length)) - b0;
  const per = n ? ((Date.now() - t0) / 1000 / n).toFixed(1) : 'n/a';
  await page.keyboard.press('d');
  await page.locator('#diag-list').waitFor({ state: 'visible', timeout: 5000 });
  const mode = await page.evaluate(() => { const el = [...document.querySelectorAll('#diag-list > *')]; for (let i = 0; i < el.length; i += 2) if (el[i].textContent === 'Image mode') return el[i + 1].textContent; return null; });
  await page.keyboard.press('Escape');
  const shown = await page.evaluate(() => [...document.querySelectorAll('#poster-a, #poster-b')].some((i) => i.naturalWidth > 0 && getComputedStyle(i).opacity !== '0'));
  row('V1-E25', /^✓/.test(line) && viaRelay && shown ? 'PASS' : 'FAIL (settings-sheet)', `method: every direct address of Castle Anthrax refused inside the browser (${refused} requests), standing in for Remote Access off, with no change to the server; connection line "${line}"; saved address is the relay connection: ${viaRelay}; ${n} poster downloads over the relay, about ${per} s each (rotation every 12 s); poster on screen ${shown}; Image mode "${mode}"`);
  await ctx.unroute('**/*');
});

out('all console errors:', JSON.stringify(errors.slice(-30)));
await ctx.close();
serve.kill();
process.exit(0);
