// e08-r1: V1-E08 on profile-ext2 (the core profile is busy with the soak). The owner is playing a title. Reads
// /status/sessions from inside the page and samples the progress bar's computed scaleX against viewOffset/duration.
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

await step('V1-E08', async () => {
  const ses = () => page.evaluate(async () => { const s = JSON.parse(localStorage.getItem('plexPoster.settings') || '{}'); const r = await fetch(`${s.serverUrl}/status/sessions`, { headers: { Accept: 'application/json', 'X-Plex-Token': s.plexToken } }); const j = await r.json(); return (j.MediaContainer?.Metadata || []).map((m) => ({ title: m.grandparentTitle || m.title, state: m.Player?.state ?? null, player: m.Player?.title ?? null, viewOffset: m.viewOffset ?? null, duration: m.duration ?? null })); });
  const bar = () => page.evaluate(() => { const b = document.querySelector('#progress'); const t = getComputedStyle(b).transform; const m = /matrix\(([^,]+)/.exec(t); return { hidden: b.hidden, scale: m ? Number(m[1]) : (t === 'none' ? 1 : null) }; });
  const settings = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('plexPoster.settings') || '{}'); return { showProgress: s.showProgress, poll: s.nowPlayingPollSeconds }; });
  out('settings:', JSON.stringify(settings));
  let first = null; const t0 = Date.now();
  while (Date.now() - t0 < 120000) { const s = await ses(); if (s.some((m) => m.duration)) { first = s; break; } out('no session yet'); await page.waitForTimeout(5000); }
  if (!first) throw new Error('no session with a duration within 2 min');
  await page.waitForTimeout(((settings.poll || 20) + 5) * 1000);
  const samples = [];
  for (let i = 0; i < 8; i++) {
    const s = (await ses()).find((m) => m.duration); const b = await bar();
    const srv = s ? s.viewOffset / s.duration : null;
    samples.push({ t: ts(), state: s?.state, player: s?.player, viewOffsetS: s ? Math.round(s.viewOffset / 1000) : null, durationS: s ? Math.round(s.duration / 1000) : null, server: srv?.toFixed(4), bar: b.scale?.toFixed(4), hidden: b.hidden, diffS: s && b.scale != null ? Math.round((b.scale - srv) * s.duration / 1000) : null });
    out('sample', JSON.stringify(samples.at(-1)));
    await page.waitForTimeout(10000);
  }
  const playing = samples.filter((x) => x.state === 'playing');
  const fieldsOk = samples.every((x) => Number.isFinite(x.viewOffsetS) && x.durationS > 0 && x.player);
  const visible = samples.every((x) => x.hidden === false);
  const close = samples.every((x) => x.diffS !== null && Math.abs(x.diffS) <= 30);
  const moves = playing.length >= 2 ? Number(playing.at(-1).bar) > Number(playing[0].bar) : false;
  row('V1-E08', fieldsOk && visible && close && moves ? 'PASS' : 'FAIL (metadata-and-now-playing)', `session fields: viewOffset and duration in ms, Player.title "${samples[0].player}"; progress bar visible in every sample: ${visible}; bar vs server position within 30 s of playback in every sample: ${close} (diffs in s ${JSON.stringify(samples.map((x) => x.diffS))}); bar advanced while playing: ${moves}; samples ${JSON.stringify(samples.map(({ t, state, viewOffsetS, durationS, bar }) => ({ t, state, viewOffsetS, durationS, bar })))}`);
});

out('all console errors:', JSON.stringify(errors.slice(-30)));
await ctx.close();
serve.kill();
process.exit(0);
