// V1-C03 r1b (agent-run at the owner's request). r1 read the code before plex.tv answered (placeholder "····")
// and was stopped; this copy waits for a real 4-character code before starting the clock.
// Press Sign in with Plex, do not approve, wait for the code to expire, then check the panel text, the button,
// a fresh code, and no leftover "Waiting" text. Own fresh headless context: shares nothing with the main browser.
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:8091/';
const log = (...a) => console.log(new Date().toISOString(), ...a);
const codeNow = () => document.querySelector('#signin-cancel')?.parentElement?.querySelectorAll('p')[1]?.innerText.trim() ?? '';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().replace(/X-Plex-Token=[^&\s]+/g, 'X-Plex-Token=<redacted>')); });
await page.goto(url);
await page.getByRole('button', { name: 'Open settings' }).click();
const signIn = page.getByRole('button', { name: 'Sign in with Plex' });
await signIn.click();
await page.waitForFunction(`/^[A-Z0-9]{4}$/.test((${codeNow})())`, null, { timeout: 30000 });
const code1 = await page.evaluate(codeNow);
const t0 = Date.now();
log('code shown:', code1);
await page.getByText('Code expired — try again.').waitFor({ timeout: 40 * 60 * 1000 });
const mins = ((Date.now() - t0) / 60000).toFixed(1);
log(`expired after ${mins} min`);
const enabled = await signIn.isEnabled();
const waitingLeft = await page.getByText('Waiting for you to approve').count();
log('button enabled:', enabled, '| "Waiting" text left:', waitingLeft);
await signIn.click();
await page.waitForFunction(`(() => { const t = (${codeNow})(); return /^[A-Z0-9]{4}$/.test(t) && t !== ${JSON.stringify(code1)}; })()`, null, { timeout: 30000 }).catch(() => {});
const code2 = await page.evaluate(codeNow);
log('new code after pressing again:', code2, '| differs:', code2 !== code1);
await page.locator('#signin-cancel').click();
log('console errors:', JSON.stringify(errors));
const pass = enabled && waitingLeft === 0 && code2 !== code1 && /^[A-Z0-9]{4}$/.test(code2);
log('RESULT', pass ? 'PASS' : 'FAIL', `real code lifetime ${mins} min`);
await browser.close();
process.exit(pass ? 0 : 1);
