// V1-C11, C12, C13 and a re-check of V1-C14, agent-run on HOME with the owner playing, pausing and stopping a title.
// Reuses the signed-in profile from home-core-r1b. Reads /status/sessions from inside the page with the app's own
// stored token in a header, and prints only the fields the checklist names, never the token or a request URL.
// Owner cues are printed as ">>> ... <<<" lines; the conductor relays them in chat.
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
if (!token) { out('not signed in; stopping'); process.exit(1); }
const poll = await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings') || '{}').nowPlayingPollSeconds || 20);
out('signed in; now-playing poll every', poll, 's');

const sessions = () => page.evaluate(async () => {
  const s = JSON.parse(localStorage.getItem('plexPoster.settings') || '{}');
  const r = await fetch(`${s.serverUrl}/status/sessions`, { headers: { Accept: 'application/json', 'X-Plex-Token': s.plexToken } });
  const j = await r.json();
  return { status: r.status, items: (j.MediaContainer?.Metadata || []).map((m) => ({ type: m.type, title: m.grandparentTitle || m.title, hasThumb: Boolean(m.thumb), hasGrandparentThumb: Boolean(m.grandparentThumb), user: m.User?.title ?? null, state: m.Player?.state ?? null, player: m.Player?.title ?? null, viewOffset: m.viewOffset ?? null, duration: m.duration ?? null })) };
});
const diag = async () => {
  await page.keyboard.press('d');
  await page.locator('#diag-list').waitFor({ state: 'visible', timeout: 5000 });
  const o = await page.evaluate(() => { const el = [...document.querySelectorAll('#diag-list > *')]; const r = {}; for (let i = 0; i < el.length; i += 2) r[el[i].textContent] = el[i + 1].textContent; return r; });
  await page.keyboard.press('Escape');
  return o;
};
const settle = (ms) => page.waitForTimeout(ms);
const waitFor = async (pred, maxMs, everyMs = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < maxMs) { const s = await sessions(); if (pred(s)) return s; await settle(everyMs); } return null; };

// V1-C11
await settle((poll + 5) * 1000);
let s = await sessions();
let d = await diag();
const e0 = errors.filter((e) => !/config\.json/.test(e));
const it = s.items[0];
const fieldsOk = it && it.type && (it.type === 'episode' ? it.hasGrandparentThumb : it.hasThumb) && it.user && it.state;
row('V1-C11', s.status === 200 && fieldsOk && /^on/.test(d['Now playing']) && /— now-playing$/.test(d.Poster) && !e0.length ? 'PASS' : 'FAIL (metadata-and-now-playing)',
  `/status/sessions ${s.status}, ${s.items.length} session(s): ${JSON.stringify(s.items.map(({ viewOffset, duration, ...k }) => k))}; Diagnostics Now playing "${d['Now playing']}", Poster "${d.Poster}"; console errors: ${JSON.stringify(e0)}`);
out('extended fields seen (for V1-E08):', JSON.stringify(s.items.map((m) => ({ viewOffset: m.viewOffset, duration: m.duration, player: m.player }))));

// V1-C12
cue('OWNER: PAUSE the playback now');
s = await waitFor((x) => x.items.some((m) => m.state === 'paused'), 5 * 60000);
if (!s) row('V1-C12', 'NOT COMPLETED', 'no paused session seen within 5 min');
else {
  out('paused session seen; waiting one poll interval');
  await settle((poll + 5) * 1000);
  s = await sessions();
  d = await diag();
  const p = s.items.find((m) => m.state === 'paused');
  row('V1-C12', p && /— now-playing$/.test(d.Poster) ? 'PASS' : 'FAIL (metadata-and-now-playing)', `session still listed with Player.state "${p?.state}"; Diagnostics Poster "${d.Poster}"`);
}

// V1-C13
cue('OWNER: STOP the playback now');
s = await waitFor((x) => x.items.length === 0, 5 * 60000);
if (!s) row('V1-C13', 'NOT COMPLETED', 'a session was still listed after 5 min');
else {
  out('no session listed; waiting one poll interval');
  await settle((poll + 10) * 1000);
  d = await diag();
  row('V1-C13', d.Poster !== '—' && !/now-playing$/.test(d.Poster) ? 'PASS' : 'FAIL (metadata-and-now-playing)', `Diagnostics Poster "${d.Poster}" (source after stop)`);
}

// V1-C14 re-check: needs a poster downloaded in this page load (r1b's check ran after a reload served from the cache)
out('V1-C14: waiting for a freshly downloaded poster (interval is 1 min from home-core-r1b)');
await page.keyboard.press('r');
await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('/photo/:/transcode')), null, { timeout: 150000 }).catch(() => {});
const hits = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/photo/:/transcode')).map((e) => e.responseStatus));
const cors = errors.filter((e) => /CORS|Access-Control/i.test(e));
row('V1-C14', hits.length && hits.every((x) => x === 200) && !cors.length ? 'PASS' : 'FAIL (cache-first-fetch)', `/photo/:/transcode requests in this page load: ${hits.length}, statuses ${JSON.stringify(hits)}; CORS console errors: ${JSON.stringify(cors)} (request URLs not recorded)`);

out('all console errors:', JSON.stringify(errors));
await ctx.close();
serve.kill();
process.exit(0);
