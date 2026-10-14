// r1b: r1's Edge filter doubled the backslashes in the profile path for PowerShell -like and matched nothing (0 MB);
// r1b matches the command line on 'plex-poster-validation' instead.
// V1-C17: 24 h soak, agent-run on HOME at the owner's request ("yes, start the soak after C03"). Started detached
// (WMI Win32_Process Create), so it survives the ssh session; writes soak.log in the driver folder.
// Diagnostics stays closed for the whole run: the page is only sampled from outside (no clicks, no keys).
// Memory: the summed working set of this profile's Edge processes (the Task Manager figure's stand-in) and the page's
// JS heap, at start, hourly and at the end. Posters: the visible layer's source is sampled every 30 s and changes are
// counted. Errors: console errors with a time. Never prints the token or a request URL.
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

const HOURS = Number(process.argv[2] || 24);
const ROOT = join(process.cwd(), '..');
const PROFILE = join(ROOT, 'profile');
const LOG = join(process.cwd(), 'soak.log');
const ts = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
let token = null;
const clean = (s) => { let t = String(s ?? '').replace(/X-Plex-Token=[^&\s"']+/gi, 'X-Plex-Token=<masked>').replace(/https?:\/\/\S+/g, '<url>'); if (token) t = t.split(token).join('<token>'); return t; };
const log = (...a) => appendFileSync(LOG, `${ts()} ${a.map(clean).join(' ')}\n`);

const edgeMB = () => {
  try {
    const ps = `(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -match 'plex-poster-validation' } | ForEach-Object { (Get-Process -Id $_.ProcessId -EA SilentlyContinue).WorkingSet64 } | Measure-Object -Sum).Sum / 1MB`;
    return Math.round(Number(execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim()));
  } catch { return -1; }
};

const serve = spawn(process.execPath, ['scripts/serve.mjs', '--port', '8091'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => serve.stdout.on('data', (d) => /8091/.test(String(d)) && res()));
const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'msedge', headless: true, viewport: { width: 1080, height: 1920 } });
const page = ctx.pages()[0] || (await ctx.newPage());
const errors = [];
let loads = 0;
let crashes = 0;
page.on('console', (m) => m.type() === 'error' && errors.push(`${ts()} ${clean(m.text())}`));
page.on('load', () => { loads++; });
page.on('crash', () => { crashes++; log('PAGE CRASH'); });
await page.goto('http://localhost:8091/');
token = await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings') || '{}').plexToken || null);
const interval = await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.settings') || '{}').rotateSeconds ?? null);
await page.waitForTimeout(60000);

const visible = () => page.evaluate(() => [...document.querySelectorAll('#poster-a, #poster-b')].filter((i) => i.naturalWidth > 0 && getComputedStyle(i).opacity !== '0').map((i) => i.currentSrc.slice(-24)).join('|')).catch(() => '');
const heapMB = () => page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1)).catch(() => -1);

const start = { at: ts(), edge: edgeMB(), heap: await heapMB() };
log(`SOAK START ${HOURS} h; rotate setting ${interval} s; Edge working set ${start.edge} MB; JS heap ${start.heap} MB; console errors so far ${errors.length}`);

let last = await visible();
let changes = 0;
let changesThisHour = 0;
const t0 = Date.now();
let nextHour = t0 + 3600000;
let hour = 0;
while (Date.now() - t0 < HOURS * 3600000) {
  await page.waitForTimeout(30000).catch(() => {});
  const v = await visible();
  if (v && v !== last) { changes++; changesThisHour++; last = v; }
  if (Date.now() >= nextHour) {
    hour++;
    log(`hour ${hour}: Edge ${edgeMB()} MB, JS heap ${await heapMB()} MB, poster changes this hour ${changesThisHour} (total ${changes}), console errors ${errors.length}, page loads ${loads}, crashes ${crashes}, poster on screen ${Boolean(v)}`);
    changesThisHour = 0;
    nextHour += 3600000;
  }
}

const end = { at: ts(), edge: edgeMB(), heap: await heapMB() };
await page.keyboard.press('d').catch(() => {});
await page.waitForTimeout(1500);
const diagRows = await page.evaluate(() => { const el = [...document.querySelectorAll('#diag-list > *')]; const r = {}; for (let i = 0; i < el.length; i += 2) r[el[i].textContent] = el[i + 1].textContent; return { Poster: r.Poster, 'Last error': r['Last error'], 'Cached posters': r['Cached posters'], 'Daily reload': r['Daily reload'], log: [...document.querySelectorAll('#diag-log li')].slice(-15).map((l) => l.textContent) }; }).catch((e) => ({ error: e.message }));
const firstHalf = errors.filter((e) => e < `${new Date(t0 + HOURS * 1800000).toISOString()}`).length;
const pass = changes > 0 && crashes === 0 && end.edge > 0 && end.edge <= 2 * start.edge + 50 && (errors.length - firstHalf) <= firstHalf + 2;
log(`SOAK END. start ${start.at} end ${end.at}; poster changes ${changes}; page loads ${loads} (daily reload included); crashes ${crashes}; Edge ${start.edge} -> ${end.edge} MB; JS heap ${start.heap} -> ${end.heap} MB; console errors ${errors.length} (first half ${firstHalf}); Diagnostics ${JSON.stringify(diagRows)}`);
log(`console errors: ${JSON.stringify(errors.slice(-30))}`);
log(`V1-C17 ${pass ? 'PASS' : 'FAIL (check the hourly lines)'}`);
await ctx.close();
serve.kill();
process.exit(0);
