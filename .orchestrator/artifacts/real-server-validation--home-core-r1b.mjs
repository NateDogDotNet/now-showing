// r1b: r1 scored V1-C05 PASS with no sign-in (a false pass); every row needing a sign-in now refuses without one,
// and while waiting for approval the driver prints, once a minute, whether plex.tv's pin record carries a token (yes/no).
// Core real-server validation, agent-run on HOME at the owner's request ("run the core checklist for me", then "d").
// Runs from %USERPROFILE%\plex-poster-validation\driver on HOME: starts the app (scripts/serve.mjs --port 8091), drives
// the installed Microsoft Edge headless through playwright-core, and prints one block per checklist row.
// Never prints the Plex token: every printed string passes through clean(), which masks the token and any X-Plex-Token
// value; URLs are printed as path only; the token is only ever compared inside the page, as a boolean.
// Rows covered: V1-C01, C04, C02, C05, C06, C08, C09, C10, C14, C15, C16, C03. Not here: C07 (off-LAN device),
// C11-C13 (playback on a Plex client), C17 (24 h soak).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), '..');
const PROFILE = join(ROOT, 'profile');
const URL0 = 'http://localhost:8091/';
let token = null;
const clean = (s) => {
  let t = String(s ?? '').replace(/X-Plex-Token=[^&\s"']+/gi, 'X-Plex-Token=<masked>');
  if (token) t = t.split(token).join('<token>');
  return t;
};
const ts = () => new Date().toISOString().slice(11, 19) + 'Z';
const out = (...a) => console.log(ts(), ...a.map(clean));
const row = (id, result, notes) => console.log(`\n=== ${id} ${result} (${ts()})\n${clean(notes)}`);

const serve = spawn(process.execPath, ['scripts/serve.mjs', '--port', '8091'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
serve.stderr.on('data', (d) => out('serve stderr:', String(d).trim()));
await new Promise((res) => serve.stdout.on('data', (d) => /8091/.test(String(d)) && res()));
out('serve.mjs listening on 8091 (cwd', ROOT, ')');

rmSync(PROFILE, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'msedge', headless: true, viewport: { width: 1080, height: 1920 } });
const page = ctx.pages()[0] || (await ctx.newPage());
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`${ts()} ${m.text()}`));
page.on('crash', () => out('PAGE CRASH'));
const newErrors = (from) => errors.slice(from).filter((e) => !/config\.json/.test(e));
out('Edge', ctx.browser()?.version?.() ?? '(persistent context)', 'launched headless, fresh profile');

const $text = (sel) => page.locator(sel).innerText().catch(() => '');
const code = () => page.evaluate(() => document.querySelector('#signin-code')?.innerText.trim() ?? '');
const waitCode = async (not = '') => {
  await page.waitForFunction((n) => { const c = document.querySelector('#signin-code')?.innerText.trim() ?? ''; return /^[A-Z0-9]{4}$/.test(c) && c !== n; }, not, { timeout: 20000 });
  return code();
};
const diag = async () => {
  await page.keyboard.press('d');
  await page.locator('#diag-list').waitFor({ state: 'visible', timeout: 5000 });
  const rows = await page.evaluate(() => { const el = [...document.querySelectorAll('#diag-list > *')]; const o = {}; for (let i = 0; i < el.length; i += 2) o[el[i].textContent] = el[i + 1].textContent; return { rows: o, log: [...document.querySelectorAll('#diag-log li')].map((l) => l.textContent) }; });
  await page.keyboard.press('Escape');
  return rows;
};
const openSettings = async () => {
  if (await page.locator('#settings').evaluate((d) => d.open)) return;
  await page.keyboard.press('s');
  if (!(await page.locator('#settings').evaluate((d) => d.open).catch(() => false))) {
    await page.mouse.click(10, 10);
    await page.locator('#i-settings').click();
  }
  await page.locator('#settings[open]').waitFor({ timeout: 5000 });
};
const tokenLeak = () => page.evaluate(() => {
  const t = JSON.parse(localStorage.getItem('plexPoster.settings') || '{}').plexToken;
  if (!t) return { hasToken: false };
  const where = { body: document.body.innerText, toast: document.querySelector('#toast')?.innerText ?? '', diag: document.querySelector('#diagnostics')?.innerText ?? '' };
  return { hasToken: true, length: t.length, leaked: Object.entries(where).filter(([, v]) => v.includes(t)).map(([k]) => k) };
});
let connected = false;
const NEEDS_SIGNIN = new Set(['V1-C05', 'V1-C06', 'V1-C08', 'V1-C09', 'V1-C10', 'V1-C14', 'V1-C15', 'V1-C16']);
const step = async (id, fn) => { if (NEEDS_SIGNIN.has(id) && !connected) { row(id, 'NOT COMPLETED', 'needs a sign-in, and V1-C02 did not connect'); return; } try { await fn(); } catch (e) { row(id, 'NOT COMPLETED', `error: ${e.message.split('\n')[0]}`); } };

await page.goto(URL0);
await page.waitForTimeout(1500);
out('page loaded; console errors at load:', JSON.stringify(errors));

// V1-C01
await step('V1-C01', async () => {
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.locator('#settings[open]').waitFor({ timeout: 5000 });
  const e0 = errors.length;
  const t0 = Date.now();
  await page.locator('#signin-btn').click();
  const c = await waitCode();
  const ms = Date.now() - t0;
  const link = await page.locator('#signin-panel a[href*="plex.tv/link"]').count();
  const ne = newErrors(e0);
  row('V1-C01', ms < 10000 && link && !ne.length ? 'PASS' : 'FAIL (settings-sheet)', `code ${c} shown after ${ms} ms; plex.tv/link link: ${link ? 'yes' : 'no'}; new console errors: ${JSON.stringify(ne)}`);
});

// V1-C04
let approveCode = '';
await step('V1-C04', async () => {
  const c1 = await code();
  await page.locator('#signin-cancel').click();
  await page.waitForTimeout(800);
  const hidden = await page.locator('#signin-panel').isHidden();
  const msg = (await $text('#form-error')).trim() + (await $text('#test-result')).trim();
  const enabled = await page.locator('#signin-btn').isEnabled();
  await page.locator('#signin-btn').click();
  approveCode = await waitCode(c1);
  row('V1-C04', hidden && !msg && enabled && approveCode !== c1 ? 'PASS' : 'FAIL (settings-sheet)', `cancel: panel hidden ${hidden}, message "${msg}", button enabled ${enabled}; pressed again: fresh code ${approveCode} (was ${c1})`);
});
writeFileSync(join(ROOT, 'APPROVE-CODE.txt'), approveCode);
console.log(`\n>>> APPROVE THIS CODE AT plex.tv/link: ${approveCode}  (${ts()}) <<<\n`);

// V1-C02
await step('V1-C02', async () => {
  const watch = setInterval(async () => {
    try {
      const st = await page.evaluate(async () => { const e = performance.getEntriesByType('resource').filter((x) => /plex\.tv\/api\/v2\/pins\/\d+/.test(x.name)).pop(); if (!e) return 'no pin request seen'; const j = await (await fetch(e.name, { headers: { Accept: 'application/json' } })).json(); return `code ${j.code}: approved on plex.tv ${Boolean(j.authToken)}, expiresIn ${j.expiresIn}`; });
      out('pin watch:', st);
    } catch (e) { out('pin watch failed:', e.message.split('\n')[0]); }
  }, 60000);
  await page.locator('#signin-panel').waitFor({ state: 'hidden', timeout: 14 * 60 * 1000 }).finally(() => clearInterval(watch));
  const tClose = Date.now();
  await page.waitForFunction(() => /^(✓|✗)/.test(document.querySelector('#test-result')?.innerText.trim() ?? ''), null, { timeout: 60000 }).catch(() => {});
  const res = (await $text('#test-result')).trim();
  const after = ((Date.now() - tClose) / 1000).toFixed(1);
  token = await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings') || '{}').plexToken || null);
  connected = /^✓ .+\(v[\d.]+[^)]*\) — \d+ librar/.test(res);
  row('V1-C02', connected ? 'PASS' : 'FAIL (settings-sheet)', `code panel closed without a refresh at ${ts()}; connection line ${after} s later: "${res}"`);
});
if (!connected) out('not connected: rows that need a sign-in will report NOT COMPLETED');

// V1-C05
await step('V1-C05', async () => {
  const pick = await page.locator('#server-pick').isVisible();
  const opts = pick ? await page.locator('#server-select option').allInnerTexts() : [];
  const dup = opts.filter((o, i) => opts.indexOf(o) !== i);
  const ne = newErrors(0).filter((e) => /CORS|net::|Failed to fetch/i.test(e));
  row('V1-C05', (!pick || (opts.length >= 2 && !dup.length)) && !ne.length ? 'PASS' : 'FAIL (settings-sheet)', `Server select shown: ${pick}; options: ${JSON.stringify(opts)}; duplicates: ${JSON.stringify(dup)}; CORS/network console errors: ${JSON.stringify(ne)}`);
});

// V1-C09 (first half) + V1-C06
let libName = '';
await step('V1-C06', async () => {
  const libs = await page.locator('#library-select option').allInnerTexts();
  const pickLib = libs.find((l) => /movie/i.test(l)) || libs.find((l) => !/^—/.test(l));
  await page.locator('#library-select').selectOption({ label: pickLib });
  libName = pickLib.split(' · ')[0];
  out('libraries offered:', JSON.stringify(libs), '→ chose', pickLib);
  await page.locator('#settings-save').click();
  await page.locator('#settings').waitFor({ state: 'hidden', timeout: 10000 });
  await page.waitForTimeout(1500);
  const d = await diag();
  const s = d.rows.Server || '';
  const kind = /\.plex\.direct/.test(s) ? (/https:\/\/(10|192-168|172-(1[6-9]|2\d|3[01]))-/.test(s) ? 'local https plex.direct' : 'remote https plex.direct') : /^.*http:\/\/(10\.|192\.168\.|172\.)/.test(s) ? 'local http' : /relay/i.test(s) ? 'relay' : 'other';
  const name = s.split(' http')[0];
  row('V1-C06', kind === 'local https plex.direct' ? 'PASS' : 'FAIL (settings-sheet)', `Diagnostics Server line: server name "${name}", address type: ${kind} (full line not recorded)`);
});

// V1-C08
await step('V1-C08', async () => {
  await openSettings();
  await page.locator('#test-btn').click();
  await page.waitForFunction(() => /^(✓|✗)/.test(document.querySelector('#test-result')?.innerText.trim() ?? ''), null, { timeout: 30000 });
  const good = (await $text('#test-result')).trim();
  await page.locator('#manual-connection > summary').click();
  const url = page.locator('input[name="serverUrl"]');
  const orig = await url.inputValue();
  await url.fill('http://192.0.2.1:32400');
  await page.evaluate(() => { document.querySelector('#test-result').textContent = ''; });
  await page.locator('#test-btn').click();
  await page.waitForFunction(() => /^(✓|✗)/.test(document.querySelector('#test-result')?.innerText.trim() ?? ''), null, { timeout: 60000 });
  const bad = (await $text('#test-result')).trim();
  await url.fill(orig);
  await page.locator('#settings-cancel').click();
  await page.waitForTimeout(500);
  const d = await diag();
  const tok = d.rows.Token || '';
  const leak = await tokenLeak();
  const logLeak = token ? d.log.some((l) => l.includes(token)) : false;
  const ok = /^✓ .+\(v[\d.]+[^)]*\) — \d+ librar/.test(good) && /^✗ .+/.test(bad) && /^.{4}…$/.test(tok) && !leak.leaked?.length && !logLeak;
  row('V1-C08', ok ? 'PASS' : 'FAIL (settings-sheet)', `first test: "${good}"; wrong URL (192.0.2.1): "${bad}"; URL restored and Settings cancelled; Diagnostics Token row: ${tok.length} chars, form "xxxx…": ${/^.{4}…$/.test(tok)}; token text found in: ${JSON.stringify(leak.leaked)}, in Recent events: ${logLeak}`);
});

// V1-C09 (reload)
await step('V1-C09', async () => {
  await page.reload();
  await page.waitForTimeout(2500);
  const d = await diag();
  const lib = d.rows.Library || '';
  row('V1-C09', libName && lib.startsWith(libName) ? 'PASS' : 'FAIL (settings-sheet)', `after reload, Diagnostics Library row: "${lib}" (chosen: "${libName}")`);
});

// V1-C10
await step('V1-C10', async () => {
  const t0 = Date.now();
  await page.waitForFunction(() => [...document.querySelectorAll('#poster-a, #poster-b')].some((i) => i.naturalWidth > 0 && getComputedStyle(i).opacity !== '0'), null, { timeout: 90000 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const d = await diag();
  const empty = await page.locator('#empty').isVisible();
  row('V1-C10', !empty ? 'PASS' : 'FAIL (cache-first-fetch)', `a poster is on screen ${secs} s after the reload settled; Diagnostics Poster row: "${d.rows.Poster}"; "No posters found" shown: ${empty}`);
});

// V1-C14
await step('V1-C14', async () => {
  const hits = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/photo/:/transcode')).map((e) => e.responseStatus));
  const cors = errors.filter((e) => /CORS|Access-Control/i.test(e));
  row('V1-C14', hits.length && hits.every((s) => s === 200) && !cors.length ? 'PASS' : 'FAIL (cache-first-fetch)', `/photo/:/transcode requests: ${hits.length}, statuses ${JSON.stringify(hits)}; CORS console errors: ${JSON.stringify(cors)} (request URLs not recorded)`);
});

// V1-C15
await step('V1-C15', async () => {
  const d = await diag();
  const m = d.rows['Image mode'];
  row('V1-C15', m === 'downloaded + cached' ? 'PASS' : 'FAIL (cache-first-fetch)', `Diagnostics Image mode: "${m}"; Cached posters: ${d.rows['Cached posters']}`);
});

// V1-C16
await step('V1-C16', async () => {
  await openSettings();
  await page.locator('input[name="rotatePreset"][value="60"]').check({ force: true });
  await page.locator('#settings-save').click();
  await page.locator('#settings').waitFor({ state: 'hidden', timeout: 10000 });
  out('poster interval set to 1 min for this row; letting 2 posters cache');
  await page.waitForTimeout(130000);
  const src = () => page.evaluate(() => [...document.querySelectorAll('#poster-a, #poster-b')].filter((i) => getComputedStyle(i).opacity !== '0').map((i) => i.currentSrc.slice(0, 40)).join('|'));
  const before = await src();
  await ctx.setOffline(true);
  const tOff = Date.now();
  out('offline at', ts(), '- no input from here');
  await page.waitForFunction((b) => { const s = [...document.querySelectorAll('#poster-a, #poster-b')].filter((i) => getComputedStyle(i).opacity !== '0').map((i) => i.currentSrc.slice(0, 40)).join('|'); return s && s !== b; }, before, { timeout: 150000 }).catch(() => {});
  const changed = (await src()) !== before;
  const secs = ((Date.now() - tOff) / 1000).toFixed(0);
  const shown = await page.evaluate(() => [...document.querySelectorAll('#poster-a, #poster-b')].some((i) => i.naturalWidth > 0 && getComputedStyle(i).opacity !== '0'));
  const dot = await page.evaluate(() => ({ hidden: document.querySelector('#status-dot').hidden, idle: document.body.classList.contains('idle') }));
  const blank = await page.locator('#empty').isVisible();
  await ctx.setOffline(false);
  const d = await diag();
  row('V1-C16', shown && !blank && !dot.hidden ? 'PASS' : 'FAIL (status-indicator)', `offline for ${secs} s with no input; poster changed while offline: ${changed}; a poster on screen: ${shown}; empty card shown: ${blank}; controls idle: ${dot.idle}; status dot visible: ${!dot.hidden}; back online; Diagnostics Last error: "${d.rows['Last error']}"`);
});

// V1-C03 (last: it takes the code's full lifetime)
await step('V1-C03', async () => {
  await openSettings();
  if (await page.locator('#connected-card').isVisible()) await page.locator('#connected-change').click();
  await page.locator('#signin-btn').click();
  const c1 = await waitCode();
  console.log(`\n>>> DO NOT APPROVE ${c1}: it is the expiry test (${ts()}) <<<\n`);
  const t0 = Date.now();
  await page.getByText('Code expired — try again.').waitFor({ timeout: 40 * 60 * 1000 });
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  const enabled = await page.locator('#signin-btn').isEnabled();
  const waiting = await page.getByText('Waiting for you to approve').isVisible().catch(() => false);
  await page.locator('#signin-btn').click();
  const c2 = await waitCode(c1);
  await page.locator('#signin-cancel').click();
  await page.locator('#settings-cancel').click();
  row('V1-C03', enabled && !waiting && c2 !== c1 ? 'PASS' : 'FAIL (settings-sheet)', `code ${c1} expired after ${mins} min (real lifetime); "Code expired — try again." shown; button enabled ${enabled}; "Waiting" left: ${waiting}; pressing again gave ${c2}`);
});

out('all console errors this run:', JSON.stringify(errors));
await ctx.close();
serve.kill();
out('done; the signed-in profile stays in', PROFILE, 'for the remaining rows; delete the folder to remove it');
process.exit(0);
