// gpcr-r1: does Plex send grandparentContentRating on episodes (allLeaves items) and in /status/sessions? Read-only;
// prints field names and counts only, never a title, the token or a URL.
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
const base = await page.evaluate(async () => { const s = JSON.parse(localStorage.getItem('plexPoster.settings') || '{}'); const cid = localStorage.getItem('plexPoster.clientId'); const r = await fetch(`https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&X-Plex-Client-Identifier=${encodeURIComponent(cid)}`, { headers: { Accept: 'application/json', 'X-Plex-Token': s.plexToken } }); const sv = (await r.json()).find((x) => x.name === 'Castle Anthrax'); const direct = (sv?.connections || []).filter((c) => !c.relay && c.protocol === 'https'); const pick = direct.find((c) => c.local) || direct[0]; return pick ? pick.uri : s.serverUrl; });
out('this run uses a direct connection:', base.includes('relay') ? 'no (relay)' : 'yes');
const api = (path) => page.evaluate(async ({ p, b }) => { const s = JSON.parse(localStorage.getItem('plexPoster.settings') || '{}'); for (let t = 0; t < 2; t++) { try { const r = await fetch(`${b}${p}`, { headers: { Accept: 'application/json', 'X-Plex-Token': s.plexToken } }); return { status: r.status, body: r.ok ? await r.json() : null }; } catch (e) { if (t) throw e; await new Promise((res) => setTimeout(res, 1500)); } } }, { p: path, b: base });

await step('GPCR', async () => {
  const shows = (await api('/library/sections/2/all?X-Plex-Container-Start=0&X-Plex-Container-Size=30')).body?.MediaContainer?.Metadata || [];
  let withField = 0, without = 0, eps = 0, sample = null;
  for (const s of shows.filter((x) => x.contentRating).slice(0, 10)) {
    const r = await api(`/library/metadata/${encodeURIComponent(s.ratingKey)}/allLeaves?X-Plex-Container-Start=0&X-Plex-Container-Size=50`);
    for (const e of r.body?.MediaContainer?.Metadata || []) { eps++; if ('grandparentContentRating' in e) withField++; else without++; if (!sample) sample = Object.keys(e).filter((k) => /rating|grandparent|type/i.test(k)); }
  }
  const ses = await api('/status/sessions');
  const items = ses.body?.MediaContainer?.Metadata || [];
  row('GPCR', eps ? 'DONE' : 'NOT COMPLETED', `episodes read ${eps} from 10 rated shows: with grandparentContentRating ${withField}, without ${without}; rating-ish keys of the first episode: ${JSON.stringify(sample)}; /status/sessions → ${ses.status}, ${items.length} item(s): ${JSON.stringify(items.map((m) => ({ type: m.type, hasOwnRating: 'contentRating' in m, hasGrandparentRating: 'grandparentContentRating' in m })))}`);
});
out('all console errors:', JSON.stringify(errors.slice(-5)));
await ctx.close();
serve.kill();
process.exit(0);
