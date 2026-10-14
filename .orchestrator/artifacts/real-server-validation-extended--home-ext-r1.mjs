// Extended real-server validation, agent-run on HOME at the owner's request ("run the extended checklist for me").
// Own fresh profile (profile-ext), so it does not touch the soak's profile. Rows: V1-E01, E09, E06, E07, E04, E03, E05,
// E23, then E25 (relay; one more owner approval) and E02 (first-run code expiry, last). Not here: E08 (playback),
// E10 (owner facts), E11-E22 (Pi), E24 (a device off the network).
// Server data is read inside the page with the app's own stored token in a header. Never prints the token or a URL;
// metadata keys are parsed from resource names inside the page and only keys, titles and ratings come out.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(process.cwd(), '..');
const { allows, allowedValues, COUNTRY_TABLE } = await import(pathToFileURL(join(ROOT, 'js', 'ratings.js')).href);
const ts = () => new Date().toISOString().slice(11, 19) + 'Z';
let token = null;
const clean = (s) => { let t = String(s ?? '').replace(/X-Plex-Token=[^&\s"']+/gi, 'X-Plex-Token=<masked>').replace(/https?:\/\/\S+/g, (u) => { try { return `<${new URL(u).hostname}${new URL(u).pathname}>`; } catch { return '<url>'; } }); if (token) t = t.split(token).join('<token>'); return t; };
const out = (...a) => console.log(ts(), ...a.map(clean));
const row = (id, result, notes) => console.log(`\n=== ${id} ${result} (${ts()})\n${clean(notes)}`);
const cue = (s) => console.log(`\n>>> ${s} (${ts()}) <<<\n`);
const step = async (id, fn) => { try { await fn(); } catch (e) { row(id, 'NOT COMPLETED', `error: ${e.message.split('\n')[0]}`); } };

const serve = spawn(process.execPath, ['scripts/serve.mjs', '--port', '8092'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => serve.stdout.on('data', (d) => /8092/.test(String(d)) && res()));
const PROFILE = join(ROOT, 'profile-ext');
rmSync(PROFILE, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'msedge', headless: true, viewport: { width: 1080, height: 1920 }, acceptDownloads: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`${ts()} ${m.text()}`));
const diag = async () => { await page.keyboard.press('d'); await page.locator('#diag-list').waitFor({ state: 'visible', timeout: 5000 }); const o = await page.evaluate(() => { const el = [...document.querySelectorAll('#diag-list > *')]; const r = {}; for (let i = 0; i < el.length; i += 2) r[el[i].textContent] = el[i + 1].textContent; return r; }); await page.keyboard.press('Escape'); return o; };
const openSettings = async () => { if (!(await page.locator('#settings').evaluate((d) => d.open))) await page.keyboard.press('s'); await page.locator('#settings[open]').waitFor({ timeout: 5000 }); };
const save = async () => { await page.locator('#settings-save').click(); await page.locator('#settings').waitFor({ state: 'hidden', timeout: 15000 }); };
// GET from the saved server inside the page; returns parsed JSON (token in a header, never in the URL).
const api = (path) => page.evaluate(async (p) => { const s = JSON.parse(localStorage.getItem('plexPoster.settings') || '{}'); const r = await fetch(`${s.serverUrl}${p}`, { headers: { Accept: 'application/json', 'X-Plex-Token': s.plexToken } }); return { status: r.status, body: r.ok ? await r.json() : null }; }, path);
const plexTvEntries = () => page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /plex\.tv\/api\/v2\/(pins|resources)/.test(e.name)).map((e) => ({ path: new URL(e.name).pathname.replace(/\d{5,}/, '<id>'), scheme: new URL(e.name).protocol, status: e.responseStatus, method: e.initiatorType })));

await page.goto('http://localhost:8092/');

// V1-E01 (and the sign-in for every row after it)
let signedIn = false;
await step('V1-E01', async () => {
  const t0 = Date.now();
  await page.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#signin-code-large')?.innerText.trim() ?? ''), null, { timeout: 30000 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const c = (await page.locator('#signin-code-large').innerText()).trim();
  const look = await page.evaluate(() => { const el = document.querySelector('#signin-code-large'); const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { fontPx: parseFloat(cs.fontSize), transform: cs.transform, w: Math.round(r.width), h: Math.round(r.height), visible: !!el.offsetParent }; });
  out(`first-run code ${c} on the empty card ${secs} s after load, no click; font ${look.fontPx}px, size ${look.w}x${look.h}, transform ${look.transform}`);
  cue(`APPROVE THIS CODE AT plex.tv/link: ${c}  (first-run code, row V1-E01)`);
  await page.locator('#settings[open]').waitFor({ timeout: 14 * 60 * 1000 });
  await page.waitForFunction(() => /^(✓|✗)/.test(document.querySelector('#test-result')?.innerText.trim() ?? ''), null, { timeout: 60000 }).catch(() => {});
  const res = (await page.locator('#test-result').innerText()).trim();
  const libs = await page.locator('#library-select option').allInnerTexts();
  out('libraries offered:', JSON.stringify(libs));
  const movies = libs.find((l) => /^Movies/.test(l));
  await page.locator('#library-select').selectOption({ label: movies });
  await save();
  token = await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings') || '{}').plexToken || null);
  signedIn = Boolean(token) && /^✓/.test(res);
  row('V1-E01', look.visible && look.fontPx >= 32 && look.transform === 'none' && signedIn ? 'PASS' : 'FAIL (settings-sheet)', `code shown large (${look.fontPx}px) and upright (transform ${look.transform}) on the empty card without any click, ${secs} s after load; owner approved it; Settings opened pre-filled (K44): "${res}"; saved with library Movies; signed in: ${signedIn}`);
  globalThis.libLabels = libs;
});

// V1-E09
await step('V1-E09', async () => {
  const e = await plexTvEntries();
  const kinds = { create: e.filter((x) => x.path === '/api/v2/pins'), poll: e.filter((x) => /^\/api\/v2\/pins\/<id>$/.test(x.path)), resources: e.filter((x) => x.path === '/api/v2/resources') };
  const ok = (l) => l.length && l.every((x) => x.scheme === 'https:' && (x.status === 200 || x.status === 201));
  const cors = errors.filter((x) => /CORS|Access-Control/i.test(x));
  row('V1-E09', ok(kinds.create) && ok(kinds.poll) && ok(kinds.resources) && !cors.length ? 'PASS' : 'FAIL (settings-sheet)', `pins create: ${JSON.stringify(kinds.create.map((x) => x.status))}; pin polls: ${kinds.poll.length}, statuses ${JSON.stringify([...new Set(kinds.poll.map((x) => x.status))])}; resources: ${JSON.stringify(kinds.resources.map((x) => x.status))}; all over https: ${e.every((x) => x.scheme === 'https:')}; CORS errors ${JSON.stringify(cors)} (the first-run flow made these requests)`);
});
if (!signedIn) { out('not signed in: stopping'); await ctx.close(); serve.kill(); process.exit(1); }

const sections = (await api('/library/sections')).body?.MediaContainer?.Directory?.map((d) => ({ key: d.key, title: d.title, type: d.type })) || [];
out('sections:', JSON.stringify(sections));
const movieKey = sections.find((s) => s.title === 'Movies')?.key;

// V1-E06
await step('V1-E06', async () => {
  const counts = [];
  for (const s of sections) {
    const r = await api(`/library/sections/${s.key}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=0`);
    counts.push({ title: s.title, status: r.status, totalSize: r.body?.MediaContainer?.totalSize ?? null });
  }
  const labels = globalThis.libLabels || [];
  const match = counts.map((c) => ({ ...c, label: labels.find((l) => l.startsWith(c.title)) ?? null, labelOk: labels.includes(`${c.title} · ${c.totalSize} titles`) }));
  row('V1-E06', match.every((m) => m.status === 200 && Number.isInteger(m.totalSize) && m.labelOk) ? 'PASS' : 'FAIL (settings-sheet)', `per library: ${JSON.stringify(match)}`);
});

// V1-E07
await step('V1-E07', async () => {
  const total = (await api(`/library/sections/${movieKey}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=0`)).body?.MediaContainer?.totalSize;
  const r150 = await api(`/library/sections/${movieKey}/all?sort=rating:desc&X-Plex-Container-Start=0&X-Plex-Container-Size=150`);
  const r500 = await api(`/library/sections/${movieKey}/all?sort=rating:desc&X-Plex-Container-Start=0&X-Plex-Container-Size=500`);
  const n150 = r150.body?.MediaContainer?.Metadata?.length ?? 0;
  const n500 = r500.body?.MediaContainer?.Metadata?.length ?? 0;
  const ok = r150.status === 200 && r500.status === 200 && (total > 150 ? n500 > n150 : n500 === n150);
  row('V1-E07', ok ? 'PASS' : 'FAIL (content-rating-filter)', `Movies has ${total} titles; size 150 → ${r150.status}, ${n150} items; size 500 → ${r500.status}, ${n500} items`);
});

// V1-E04 (also builds the rating map E05 uses)
const ratingOf = new Map();
await step('V1-E04', async () => {
  const seen = new Map();
  for (const s of sections.filter((x) => x.type === 'movie' || x.type === 'show')) {
    const r = await api(`/library/sections/${s.key}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=5000`);
    for (const m of r.body?.MediaContainer?.Metadata || []) {
      const v = m.contentRating ?? '';
      seen.set(v, (seen.get(v) || 0) + 1);
      ratingOf.set(String(m.ratingKey), { title: m.title, rating: v });
    }
  }
  const prefixed = [...seen.keys()].filter((v) => v.includes('/'));
  const outside = prefixed.filter((v) => { const p = v.slice(0, v.indexOf('/') + 1).toLowerCase(); return !(p in COUNTRY_TABLE) || !COUNTRY_TABLE[p].has(v.slice(v.indexOf('/') + 1).toUpperCase()); });
  row('V1-E04', outside.length === 0 ? 'PASS' : 'FAIL (content-rating-filter)', `distinct contentRating values with counts: ${JSON.stringify(Object.fromEntries(seen))}; country-prefixed: ${JSON.stringify(prefixed)}; outside the Q19 table: ${JSON.stringify(outside)}`);
});

// V1-E03
await step('V1-E03', async () => {
  await openSettings();
  if (!(await page.locator('#household-toggle').isChecked())) await page.locator('#household-toggle').check();
  await page.locator('select[name="maxContentRating"]').selectOption('PG-13');
  await save();
  await page.keyboard.press('r');
  await page.waitForTimeout(8000);
  const sent = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => new URL(e.name)).filter((u) => /\/library\/sections\/\d+\/all$/.test(u.pathname) && u.searchParams.has('contentRating')).map((u) => ({ path: u.pathname, contentRating: u.searchParams.get('contentRating'), size: u.searchParams.get('X-Plex-Container-Size') })).pop());
  const r = await api(`${sent.path}?contentRating=${encodeURIComponent(sent.contentRating)}&X-Plex-Container-Start=0&X-Plex-Container-Size=500`);
  const items = r.body?.MediaContainer?.Metadata || [];
  const values = [...new Set(items.map((m) => m.contentRating ?? ''))];
  const bad = values.filter((v) => !sent.contentRating.split(',').includes(v));
  const expected = allowedValues('PG-13').join(',');
  row('V1-E03', r.status === 200 && items.length > 0 && !bad.length && sent.contentRating === expected ? 'PASS' : 'FAIL (content-rating-filter)', `the app sent contentRating with ${sent.contentRating.split(',').length} values joined by ","  (equals allowedValues('PG-13'): ${sent.contentRating === expected}), container size ${sent.size}; replayed: ${r.status}, ${items.length} items, ratings returned ${JSON.stringify(values)}; outside the requested list: ${JSON.stringify(bad)}`);
});

// V1-E05
await step('V1-E05', async () => {
  const lib = [...ratingOf.values()];
  const hasR = lib.some((m) => m.rating === 'R'); const hasGb18 = lib.some((m) => m.rating === 'gb/18');
  await openSettings();
  await page.locator('input[name="rotatePreset"][value="custom"]').check({ force: true });
  await page.locator('input[name="rotateMinutes"]').fill('0.2').catch(() => {});
  await page.locator('input[name="rotateMinutes"]').dispatchEvent('change').catch(() => {});
  await save();
  const seen = []; const t0 = Date.now();
  while (seen.length < 20 && Date.now() - t0 < 12 * 60000) {
    await page.waitForTimeout(5000);
    const keys = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/photo/:/transcode')).map((e) => { try { const inner = new URL(e.name).searchParams.get('url') || ''; const m = inner.match(/\/library\/metadata\/(\d+)/); return m ? m[1] : null; } catch { return null; } }).filter(Boolean));
    for (const k of keys) if (!seen.includes(k)) seen.push(k);
  }
  const shown = seen.slice(0, 20).map((k) => ({ key: k, ...(ratingOf.get(k) || { title: '?', rating: '?' }) }));
  const banned = shown.filter((m) => !allows('PG-13', m.rating));
  row('V1-E05', shown.length >= 20 && !banned.length ? 'PASS' : 'FAIL (content-rating-filter)', `limit PG-13, ${shown.length} distinct posters downloaded: ${JSON.stringify(shown.map((m) => `${m.title} [${m.rating}]`))}; not allowed under PG-13: ${JSON.stringify(banned)}; library holds R titles: ${hasR}, gb/18 titles: ${hasGb18}; all-R library sub-check: no all-R library on this server (not run)`);
});

// V1-E23
await step('V1-E23', async () => {
  await openSettings();
  const pinIn = async (digits) => { await page.locator('#pin-dialog[open]').waitFor({ timeout: 5000 }); for (const d of digits) await page.locator(`#pin-dialog [data-key="${d}"]`).click(); await page.locator('#pin-dialog [data-key="ok"]').click(); await page.waitForTimeout(400); };
  await page.locator('#pin-set-btn').click();
  await pinIn('2468'); await pinIn('2468');
  await save();
  await openSettings();
  await page.locator('#manual-connection > summary').click();
  const typeOf = () => page.locator('input[name="plexToken"]').getAttribute('type');
  await page.locator('#token-toggle').click();
  const asked = await page.locator('#pin-dialog[open]').isVisible();
  await pinIn('1357');
  const afterWrong = await typeOf();
  if (await page.locator('#pin-dialog[open]').isVisible()) await page.locator('#pin-cancel').click();
  await page.locator('#token-toggle').click();
  await pinIn('2468');
  const afterRight = await typeOf();
  await page.locator('#settings-cancel').click();
  await page.waitForTimeout(500);
  await openSettings();
  const afterClose = await typeOf();
  const dl = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#export-btn').click();
  const file = await (await dl).path();
  const data = JSON.parse(readFileSync(file, 'utf8')).settings || {};
  const leaked = ['settingsPinHash', 'settingsPinSalt', 'plexToken'].filter((k) => k in data);
  await page.locator('#pin-clear-btn').click();
  await save();
  row('V1-E23', asked && afterWrong === 'password' && afterRight === 'text' && afterClose === 'password' && !leaked.length ? 'PASS' : 'FAIL (kiosk-and-pin)', `PIN 2468 set and saved; Show asked for the PIN: ${asked}; wrong PIN → field type ${afterWrong}; right PIN → ${afterRight}; after closing and reopening → ${afterClose}; export (include token unticked) contains ${JSON.stringify(leaked)} of [settingsPinHash, settingsPinSalt, plexToken]; PIN cleared afterwards`);
});

// V1-E25: relay only (every direct address of the server refused inside the browser)
await step('V1-E25', async () => {
  const res = await page.evaluate(async () => { const s = JSON.parse(localStorage.getItem('plexPoster.settings') || '{}'); const cid = localStorage.getItem('plexPoster.clientId'); const r = await fetch(`https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&X-Plex-Client-Identifier=${encodeURIComponent(cid)}`, { headers: { Accept: 'application/json', 'X-Plex-Token': s.plexToken } }); const j = await r.json(); const sv = j.find((x) => x.name === 'Castle Anthrax'); return (sv?.connections || []).map((c) => ({ host: new URL(c.uri).hostname, relay: Boolean(c.relay), local: Boolean(c.local) })); });
  const direct = new Set(res.filter((c) => !c.relay).map((c) => c.host));
  out(`Castle Anthrax connections: ${res.filter((c) => !c.relay).length} direct (refused from now on), ${res.filter((c) => c.relay).length} relay`);
  let refused = 0;
  await ctx.route('**/*', (r) => { const h = new URL(r.request().url()).hostname; if (direct.has(h) || /^(10|192-168|172-(1[6-9]|2\d|3[01]))-/.test(h) || /^192\.168\./.test(h)) { refused++; return r.abort('addressunreachable'); } return r.continue(); });
  await openSettings();
  if (await page.locator('#connected-card').isVisible()) await page.locator('#connected-change').click();
  await page.locator('#signin-btn').click();
  await page.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#signin-code')?.innerText.trim() ?? ''), null, { timeout: 20000 });
  const c = (await page.locator('#signin-code').innerText()).trim();
  cue(`APPROVE THIS CODE AT plex.tv/link: ${c}  (relay test, row V1-E25)`);
  await page.locator('#signin-panel').waitFor({ state: 'hidden', timeout: 14 * 60 * 1000 });
  await page.waitForFunction(() => /^(✓|✗)/.test(document.querySelector('#test-result')?.innerText.trim() ?? ''), null, { timeout: 180000 }).catch(() => {});
  const line = (await page.locator('#test-result').innerText()).trim();
  const libs = await page.locator('#library-select option').allInnerTexts();
  const movies = libs.find((l) => /^Movies/.test(l));
  if (movies) await page.locator('#library-select').selectOption({ label: movies });
  await save();
  const before = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/photo/:/transcode')).length);
  const t0 = Date.now();
  await page.waitForFunction((b) => performance.getEntriesByType('resource').filter((e) => e.name.includes('/photo/:/transcode')).length > b + 1, before, { timeout: 120000 }).catch(() => {});
  const per = ((Date.now() - t0) / 2000).toFixed(1);
  const d = await diag();
  const relayAddr = /relay/i.test(d.Server || '') || !(direct.has((d.Server || '').split(' ').pop().replace(/^https?:\/\//, '').split(':')[0]));
  row('V1-E25', /^✓/.test(line) && relayAddr ? 'PASS' : 'FAIL (settings-sheet)', `method: every direct address of Castle Anthrax refused inside the browser (${refused} requests), the checklist's "direct remote address unreachable" without changing the server; connection line "${line}"; Diagnostics Server uses a relay address: ${relayAddr}; about ${per} s per poster download over the relay; Image mode "${d['Image mode']}"`);
  await ctx.unroute('**/*');
});

// V1-E02: a display with no settings, left alone until its first-run code expires
await step('V1-E02', async () => {
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => { if (!sessionStorage.getItem('e02')) { localStorage.clear(); sessionStorage.setItem('e02', '1'); } });
  out('E02 uses a second tab whose storage is cleared once, so it shows the first-run card (this signs the profile out; nothing is needed afterwards)');
  await p2.goto('http://localhost:8092/');
  await p2.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#signin-code-large')?.innerText.trim() ?? ''), null, { timeout: 30000 });
  const c1 = (await p2.locator('#signin-code-large').innerText()).trim();
  cue(`DO NOT APPROVE ${c1}: it is the first-run expiry test (V1-E02)`);
  const t0 = Date.now();
  await p2.waitForFunction((c) => { const t = document.querySelector('#signin-code-large')?.innerText.trim() ?? ''; return /^[A-Z0-9]{4}$/.test(t) && t !== c; }, c1, { timeout: 25 * 60000, polling: 2000 });
  const c2 = (await p2.locator('#signin-code-large').innerText()).trim();
  row('V1-E02', c2 !== c1 ? 'PASS' : 'FAIL (settings-sheet)', `first-run code ${c1} was replaced by ${c2} on its own after ${((Date.now() - t0) / 60000).toFixed(1)} min, with no input`);
});

out('all console errors:', JSON.stringify(errors.slice(-40)));
await ctx.close();
serve.kill();
process.exit(0);
