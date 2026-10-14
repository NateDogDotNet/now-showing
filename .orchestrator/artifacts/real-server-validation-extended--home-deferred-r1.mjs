// deferred-r1: the two checks routed to this phase at earlier stops, on profile-ext2 (signed in). D33: does Plex rate
// TV episodes lower than their show? C8I1/D37: does Plex accept the batched GET /library/metadata/k1,k2,... that
// js/plex.js items() sends (commas literal, 100 keys per request)? Read-only; never prints the token or a URL.
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

// V1-E26 (D33)
await step('V1-E26', async () => {
  const shows = (await api('/library/sections/2/all?X-Plex-Container-Start=0&X-Plex-Container-Size=200')).body?.MediaContainer?.Metadata || [];
  const rated = shows.filter((s) => s.contentRating);
  out(`TV Shows: ${shows.length} shows, ${rated.length} with a contentRating`);
  const lower = []; let same = 0, higher = 0, unrated = 0, episodes = 0, checked = 0;
  for (const s of rated.slice(0, 40)) {
    const r = await api(`/library/metadata/${encodeURIComponent(s.ratingKey)}/allLeaves?X-Plex-Container-Start=0&X-Plex-Container-Size=500`);
    const eps = r.body?.MediaContainer?.Metadata || [];
    if (r.status !== 200) { out(`allLeaves → ${r.status} for one show`); continue; }
    checked++;
    for (const e of eps) {
      episodes++;
      const er = e.contentRating ?? '';
      if (!er) { unrated++; continue; }
      if (er === s.contentRating) { same++; continue; }
      const underShow = allowedValues(s.contentRating).includes(er);
      const underEp = allowedValues(er).includes(s.contentRating);
      if (underShow && !underEp) lower.push(`${s.title}: show ${s.contentRating}, episode ${er}`);
      else higher++;
    }
  }
  const distinctLower = [...new Set(lower)];
  row('V1-E26', checked > 0 ? 'PASS' : 'NOT COMPLETED', `shows checked ${checked} of ${rated.length} rated (of ${shows.length}); episodes ${episodes}: same rating as the show ${same}, lower ${lower.length}, higher or other ${higher}, unrated ${unrated}; distinct show/episode pairs rated lower: ${JSON.stringify(distinctLower.slice(0, 12))}`);
});

// V1-E27 (C8I1, D37)
await step('V1-E27', async () => {
  const movies = (await api('/library/sections/1/all?X-Plex-Container-Start=0&X-Plex-Container-Size=100')).body?.MediaContainer?.Metadata || [];
  const keys = movies.map((m) => String(m.ratingKey));
  const path = `/library/metadata/${keys.map(encodeURIComponent).join(',')}`;
  const r = await api(path);
  const got = (r.body?.MediaContainer?.Metadata || []);
  const gotKeys = new Set(got.map((m) => String(m.ratingKey)));
  const allAsked = got.every((m) => keys.includes(String(m.ratingKey)));
  const withRating = got.filter((m) => 'contentRating' in m).length;
  const r3 = await api(`/library/metadata/${keys.slice(0, 3).map(encodeURIComponent).join(',')}`);
  const n3 = (r3.body?.MediaContainer?.Metadata || []).length;
  row('V1-E27', r.status === 200 && got.length === keys.length && allAsked && r3.status === 200 && n3 === 3 ? 'PASS' : 'FAIL (metadata-and-now-playing)', `100 keys in one GET /library/metadata/k1,...,k100 (commas literal, as js/plex.js items() sends; path length ${path.length} chars) → HTTP ${r.status}, ${got.length} items back, ${gotKeys.size} distinct, all among the asked keys: ${allAsked}, ${withRating} carry contentRating; 3 keys → HTTP ${r3.status}, ${n3} items`);
});

out('all console errors:', JSON.stringify(errors.slice(-10)));
await ctx.close();
serve.kill();
process.exit(0);
