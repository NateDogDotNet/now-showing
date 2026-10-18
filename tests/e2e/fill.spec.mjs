// Landscape fill (R-FILL-1, U7): a dimmed blurred backdrop or a synopsis panel in the empty sides of a landscape screen.
//
// Mock item 3 is "Velvet Curtain": PG-13, 8,040,000 ms (2 h 14 m), 1972, with a summary over 300 characters.
// Item 8 ("Encore", 2023) has no rating and no runtime. Every case names pixelShift: false (convention 7) and runs
// against its own mock Plex (serveArgs: []), at 1920x1080 unless it says otherwise.

import assert from 'node:assert/strict';
import { withApp } from './lib.mjs';

const cases = [];
const fillCase = (name, opts, fn) => cases.push({ name, opts: { serveArgs: [], viewport: { width: 1920, height: 1080 }, ...opts }, fn });
const check = (name) => console.log(`  ok  ${name}`);

const seed = (extra = {}) => (app) => ({
  plexToken: 'demo-token',
  serverUrl: `http://127.0.0.1:${app.mockPort}`,
  libraryKey: '1',
  rotateSeconds: 3600,
  showNowPlaying: false,
  pixelShift: false,
  staticRatingKey: '3',
  staticTitle: 'Velvet Curtain',
  ...extra,
});

const posterShown = (page) => page.waitForFunction(() => [...document.querySelectorAll('.poster-layer.active')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
const settled = (page) => page.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 15000 });
const visible = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
}, sel);
const rect = (page, sel) => page.evaluate((sel) => {
  const r = document.querySelector(sel).getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}, sel);

/** Any element whose computed filter or backdrop-filter contains blur( (a brightness() filter is by design, display.js). */
const blurred = (page) => page.evaluate(() =>
  [...document.querySelectorAll('*')].filter((el) => {
    const cs = getComputedStyle(el);
    return /blur\(/.test(cs.filter) || /blur\(/.test(cs.backdropFilter || cs.webkitBackdropFilter || '');
  }).map((el) => el.id || el.tagName));

/** opacity of every ancestor multiplied, times any brightness() filter on the way up. */
const effectiveBrightness = (page, sel) => page.evaluate((sel) => {
  let v = 1;
  for (let el = document.querySelector(sel); el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    v *= Number(cs.opacity);
    const m = /brightness\(([\d.]+)\)/.exec(cs.filter);
    if (m) v *= Number(m[1]);
  }
  return v;
}, sel);

const prepare = async (page, app) => {
  await page.goto(app.url);
  await posterShown(page);
  await settled(page);
  await page.waitForTimeout(150);
};

const SUMMARY_FRAGMENT = 'understudy'; // inside the first 300 characters of item 3's summary

// 1. blur: a tiny canvas behind the stage, at most a quarter bright, and no blur filter on any element.
fillCase('1 blur at 1920x1080', { settings: seed({ fillMode: 'blur' }) }, async ({ page, app }) => {
  await prepare(page, app);
  assert.equal(await visible(page, '#fill-backdrop'), true, '#fill-backdrop is shown');
  assert.equal(await visible(page, '#info-panel'), false, 'no info panel in blur mode');
  const widths = await page.evaluate(() => [...document.querySelectorAll('#fill-backdrop canvas')].map((c) => c.width));
  assert.ok(widths.length >= 1, 'the backdrop has a canvas');
  for (const w of widths) assert.ok(w > 0 && w <= 64, `canvas intrinsic width ${w} is at most 64`);
  const active = '#fill-backdrop canvas.active';
  assert.equal(await page.locator(active).count(), 1, 'one canvas is the current backdrop');
  const eff = await effectiveBrightness(page, active);
  assert.ok(eff > 0 && eff <= 0.25 + 1e-9, `effective brightness ${eff} is at most 0.25`);
  for (const sel of ['#fill-backdrop canvas:not(.active)', '#fill-backdrop']) {
    const e = await effectiveBrightness(page, sel);
    assert.ok(e <= 0.25 + 1e-9, `${sel} effective brightness ${e}`);
  }
  assert.deepEqual(await blurred(page), [], 'no element has a blur filter or backdrop-filter');
  // It covers the whole screen, behind the stage.
  const b = await rect(page, '#fill-backdrop');
  assert.ok(b.left <= 0 && b.top <= 0 && b.right >= 1920 && b.bottom >= 1080, `covers the viewport: ${JSON.stringify(b)}`);
  // It was drawn from the poster on screen: not blank.
  const lit = await page.evaluate(() => {
    const c = document.querySelector('#fill-backdrop canvas.active');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    return sum;
  });
  assert.ok(lit > 0, 'the canvas holds the poster, not black');
  check(`blur: canvas ${widths.join('/')} px wide, effective brightness ${eff.toFixed(3)}, no blur filter on any element`);
});

// 2. info: title, runtime, rating, year and a summary of at most 301 characters, beside the poster.
fillCase('2 info at 1920x1080', { settings: seed({ fillMode: 'info' }) }, async ({ page, app }) => {
  await prepare(page, app);
  assert.equal(await visible(page, '#info-panel'), true, '#info-panel is shown');
  assert.equal(await visible(page, '#fill-backdrop'), false, 'no backdrop in info mode');
  const text = await page.evaluate(() => document.getElementById('info-panel').textContent);
  for (const part of ['Velvet Curtain', '2 h 14 m', 'PG-13', '1972']) assert.ok(text.includes(part), `the panel says ${part}: ${JSON.stringify(text)}`);
  const summary = await page.evaluate(() => document.getElementById('info-summary').textContent);
  assert.ok(summary.length > 100 && summary.length <= 301, `summary length ${summary.length}`);
  assert.ok(summary.endsWith('…'), 'a long summary ends in an ellipsis');
  assert.ok(summary.includes(SUMMARY_FRAGMENT));
  const panel = await rect(page, '#info-panel');
  const frame = await rect(page, '#frame');
  assert.ok(panel.left >= frame.right - 1, `the panel is beside the poster, to its right (panel ${panel.left}, frame ${frame.right})`);
  assert.ok(panel.right <= 1920 && panel.left >= 0 && panel.top >= 0 && panel.bottom <= 1080, `inside the screen: ${JSON.stringify(panel)}`);
  const overflow = await page.evaluate(() => { const p = document.getElementById('info-panel'); return p.scrollHeight - p.clientHeight; });
  assert.ok(overflow <= 1, `the text fits the panel (overflow ${overflow})`);
  assert.deepEqual(await blurred(page), [], 'no blur filter in info mode either');
  check(`info: "${text.slice(0, 60)}..." beside the poster; summary ${summary.length} characters`);
});

// 2b. Missing fields leave nothing stray; a short summary has no ellipsis.
fillCase('2b info for an unrated title with no runtime', { settings: seed({ fillMode: 'info', staticRatingKey: '8', staticTitle: 'Encore' }) }, async ({ page, app }) => {
  await prepare(page, app);
  const parts = await page.evaluate(() => {
    const t = (id) => document.getElementById(id).textContent;
    return { title: t('info-title'), meta: t('info-meta'), summary: t('info-summary') };
  });
  assert.equal(parts.title, 'Encore');
  assert.equal(parts.meta, '2023');
  assert.equal(parts.summary, 'One more night, one more show.');
  check('Encore: title, "2023", the whole short summary');
});

// 3. Portrait, or a rotation that makes the effective aspect portrait: neither is shown. Landscape by rotation: shown.
for (const mode of ['blur', 'info']) {
  const sel = mode === 'blur' ? '#fill-backdrop' : '#info-panel';
  const other = mode === 'blur' ? '#info-panel' : '#fill-backdrop';
  const matrix = [
    { vp: { width: 1080, height: 1920 }, rotation: 0, shown: false },
    { vp: { width: 1920, height: 1080 }, rotation: 90, shown: false },
    { vp: { width: 1920, height: 1080 }, rotation: 270, shown: false },
    { vp: { width: 1920, height: 1080 }, rotation: 180, shown: true },
    { vp: { width: 1080, height: 1920 }, rotation: 90, shown: true },
    { vp: { width: 1080, height: 1920 }, rotation: 270, shown: true },
  ];
  for (const { vp, rotation, shown } of matrix) {
    fillCase(`3 ${mode} ${vp.width}x${vp.height} rotation ${rotation}`, { viewport: vp, settings: seed({ fillMode: mode, rotation }) }, async ({ page, app }) => {
      await prepare(page, app);
      assert.equal(await visible(page, sel), shown, `${sel} ${shown ? 'shown' : 'not shown'}`);
      assert.equal(await visible(page, other), false, `${other} never shown in ${mode} mode`);
      if (shown) {
        const r = await rect(page, sel);
        if (mode === 'info') assert.ok(r.left >= 0 && r.top >= 0 && r.right <= vp.width && r.bottom <= vp.height, `the panel is on screen: ${JSON.stringify(r)}`);
        else assert.ok(r.left <= 0 && r.top <= 0 && r.right >= vp.width && r.bottom >= vp.height, `the backdrop covers the screen: ${JSON.stringify(r)}`);
      }
      assert.deepEqual(await blurred(page), []);
      check(`${mode} at ${vp.width}x${vp.height}, rotation ${rotation}: ${shown ? 'shown' : 'not shown'}`);
    });
  }
}

// 4. fillMode none (the default) is today's screen: neither element is there to see, and nothing is drawn or filled.
for (const extra of [{ fillMode: 'none' }, {}]) {
  fillCase(`4 none${Object.keys(extra).length ? ' (explicit)' : ' (default)'}`, { settings: seed(extra) }, async ({ page, app }) => {
    await prepare(page, app);
    assert.equal(await visible(page, '#fill-backdrop'), false);
    assert.equal(await visible(page, '#info-panel'), false);
    const visibleNew = await page.evaluate(() => [...document.querySelectorAll('#fill-backdrop, #fill-backdrop *, #info-panel, #info-panel *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).length);
    assert.equal(visibleNew, 0, 'no new element takes space');
    const stage = await rect(page, '#stage');
    assert.ok(Math.abs((stage.left + stage.right) / 2 - 960) <= 1 && Math.abs(stage.bottom - stage.top - 1080) <= 2, `the stage is where it was: ${JSON.stringify(stage)}`);
    assert.deepEqual(await blurred(page), []);
    check(`fillMode ${extra.fillMode || 'default'}: no backdrop, no panel, same stage`);
  });
}

// 5. The cross-fade keeps backdrop and poster in step, and the backdrop is the poster now on screen.
fillCase('5 cross-fade in step', { settings: seed({ fillMode: 'blur', staticRatingKey: undefined, staticTitle: undefined, crossfadeMs: 4000, randomPoolSize: 8 }) }, async ({ page, app }) => {
  await prepare(page, app);
  const alt = () => page.evaluate(() => document.querySelector('.poster-layer.active')?.alt || '');
  const before = await alt();
  let changed = false;
  for (let i = 0; i < 40 && !changed; i++) {
    await page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
    for (let j = 0; j < 12 && !changed; j++) {
      await page.waitForTimeout(60);
      changed = (await alt()) !== before;
    }
  }
  assert.ok(changed, 'a different poster came up');
  await page.waitForTimeout(500);
  const mid = await page.evaluate(() => {
    const o = (id) => Number(getComputedStyle(document.getElementById(id)).opacity);
    return { poster: [o('poster-a'), o('poster-b')], fill: [o('fill-a'), o('fill-b')] };
  });
  for (let i = 0; i < 2; i++) assert.ok(Math.abs(mid.poster[i] - mid.fill[i]) <= 0.1, `layer ${i}: poster ${mid.poster[i]} vs backdrop ${mid.fill[i]} in step`);
  assert.ok(mid.poster.some((v) => v > 0.02 && v < 0.98), `sampled mid-fade: ${JSON.stringify(mid)}`);
  await settled(page);
  const eff = await effectiveBrightness(page, '#fill-backdrop canvas.active');
  assert.ok(eff <= 0.25 + 1e-9, `effective brightness ${eff}`);
  // After the fade the backdrop's colour is the new poster's.
  const colours = await page.evaluate(() => {
    const img = document.querySelector('.poster-layer.active');
    const canvas = document.querySelector('#fill-backdrop canvas.active');
    const probe = document.createElement('canvas');
    probe.width = canvas.width;
    probe.height = canvas.height;
    const p = probe.getContext('2d');
    p.drawImage(img, 0, 0, probe.width, probe.height);
    const at = (c, fx, fy) => [...c.getContext('2d').getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data].slice(0, 3);
    return { poster: at(probe, 0.1, 0.1), backdrop: at(canvas, 0.1, 0.1) };
  });
  const dist = Math.max(...colours.poster.map((v, i) => Math.abs(v - colours.backdrop[i])));
  assert.ok(dist <= 24, `backdrop ${colours.backdrop} matches the poster ${colours.poster}`);
  check(`mid-fade poster ${mid.poster.map((v) => v.toFixed(2))} vs backdrop ${mid.fill.map((v) => v.toFixed(2))}; backdrop follows the new poster`);
});

// 6. The summary is never stored: not in the poster-cache index, not anywhere in localStorage.
fillCase('6 the summary is never stored', { settings: seed({ fillMode: 'info', staticRatingKey: undefined, staticTitle: undefined, randomPoolSize: 8 }) }, async ({ page, app }) => {
  await prepare(page, app);
  const text = await page.evaluate(() => document.getElementById('info-summary').textContent);
  assert.ok(text.length > 0, 'the panel shows a summary');
  let entries = [];
  for (let i = 0; i < 100 && !entries.length; i++) {
    entries = await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]'));
    if (!entries.length) await page.waitForTimeout(100);
  }
  assert.ok(entries.length >= 1, 'a poster index entry exists');
  for (const e of entries) assert.ok(!('summary' in e), `no summary in the index entry ${e.ratingKey}`);
  const leaked = await page.evaluate((fragments) => Object.entries(localStorage).filter(([, v]) => fragments.some((f) => v.includes(f))).map(([k]) => k), ['understudy', 'Nobody leaves', 'projectionist', 'drive-in', 'One more night']);
  assert.deepEqual(leaked, [], 'no localStorage value holds synopsis text');
  check('the cache index entries carry no summary, and no synopsis text is in localStorage');
});

// 7. The setting: a control in Settings, live-previewed, with the OLED warning in its help text.
fillCase('7 the Settings control', { settings: seed() }, async ({ page, app }) => {
  await prepare(page, app);
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForSelector('#settings[open]');
  const options = await page.evaluate(() => [...document.querySelectorAll('#settings-form select[name="fillMode"] option')].map((o) => o.value));
  assert.deepEqual(options, ['none', 'blur', 'info']);
  assert.equal(await page.inputValue('select[name="fillMode"]'), 'none', 'off by default');
  const help = await page.evaluate(() => document.getElementById('fill-help').textContent);
  assert.match(help, /OLED/, 'the help text warns about OLED');
  await page.selectOption('select[name="fillMode"]', 'blur');
  await page.waitForFunction(() => !document.getElementById('fill-backdrop').hidden, null, { timeout: 5000 });
  await page.selectOption('select[name="fillMode"]', 'info');
  await page.waitForFunction(() => !document.getElementById('info-panel').hidden && document.getElementById('fill-backdrop').hidden, null, { timeout: 5000 });
  const text = await page.evaluate(() => document.getElementById('info-panel').textContent);
  assert.ok(text.includes('Velvet Curtain'), 'the live preview drew the poster on screen');
  await page.selectOption('select[name="fillMode"]', 'none');
  await page.waitForFunction(() => document.getElementById('info-panel').hidden && document.getElementById('fill-backdrop').hidden, null, { timeout: 5000 });
  check('Settings: none, blur, info, each previewed live; help text mentions OLED');
});

// Household limit, driven through the app's own code (Settings, then Save): the pool is the two best-rated titles, 1 and 2,
// and title 1 ("The Grand Marquee") is re-rated R, so PG-13 disallows it and allows title 2 ("Midnight Projector").
const limitPool = (extra = {}) => seed({ staticRatingKey: undefined, staticTitle: undefined, randomPoolSize: 2, ...extra });
const altOf = (page) => page.evaluate(() => document.querySelector('.poster-layer.active')?.alt || '');
const clickRefresh = (page) => page.evaluate(() => document.querySelector('[data-action="refresh"]').click());
const setHouseholdLimit = async (page) => {
  await page.evaluate(() => document.querySelector('[data-action="settings"]').click());
  await page.waitForSelector('#settings[open]');
  await page.check('#household-toggle');
  await page.click('#settings-save');
  await page.waitForFunction(() => !document.getElementById('settings').open);
};
/** Clicks refresh until the active poster's alt satisfies `want`; a click during a busy tick is ignored, so it tries again. */
async function refreshUntil(page, want, what) {
  for (let i = 0; i < 60; i++) {
    if (want(await altOf(page))) return;
    await clickRefresh(page);
    for (let j = 0; j < 10 && !want(await altOf(page)); j++) await page.waitForTimeout(60);
  }
  assert.fail(`${what} never came up (now ${await altOf(page)})`);
}

// 9. I1 (K20, C7M1): a poster the limit cuts while it fades out takes its backdrop with it, at once, with no fade; the incoming
//    poster and its backdrop keep fading in together. The cut is the app's own: Save in Settings with PG-13 while R is leaving.
fillCase('9 I1 a poster cut mid-crossfade takes its backdrop with it', { settings: limitPool({ fillMode: 'blur', crossfadeMs: 6000 }) }, async ({ page, app, mock }) => {
  await mock.post('rate', { ratingKey: '1', contentRating: 'R' });
  await page.goto(app.url);
  await posterShown(page);
  await refreshUntil(page, (alt) => alt === 'Poster: The Grand Marquee', 'title 1 (R)');
  await settled(page); // title 1 is fully up, backdrop and all
  await refreshUntil(page, (alt) => alt === 'Poster: Midnight Projector', 'title 2 (PG)'); // the 6 s crossfade starts
  // Sample the moment the app cuts the outgoing layer (it adds .cut in cutOutgoing()): this observer is registered after
  // display.js's own, so it runs after the backdrop has followed, in the same task as the cut.
  await page.evaluate(() => {
    window.__cuts = [];
    const op = (el) => Number(getComputedStyle(el).opacity);
    const canvasOf = (layer) => document.getElementById(layer.id.replace('poster-', 'fill-'));
    new MutationObserver((records) => {
      for (const { target: layer } of records) {
        if (!layer.classList.contains('cut') || layer.classList.contains('active')) continue;
        const inn = document.querySelector('.poster-layer.active');
        window.__cuts.push({
          alt: layer.alt,
          poster: op(layer),
          canvas: op(canvasOf(layer)),
          canvasTransition: getComputedStyle(canvasOf(layer)).transitionDuration,
          inAlt: inn?.alt,
          inPoster: inn ? op(inn) : null,
          inCanvas: inn ? op(canvasOf(inn)) : null,
          running: document.getAnimations().length,
        });
      }
    }).observe(document.getElementById('poster-box'), { attributes: true, subtree: true, attributeFilter: ['class'] });
  });
  await setHouseholdLimit(page); // PG-13, while title 1 (R) is still fading out
  await page.waitForFunction(() => window.__cuts.length > 0, null, { timeout: 5000 });
  const m = (await page.evaluate(() => window.__cuts))[0];
  assert.equal(m.poster, 0, 'the outgoing poster is gone at once');
  assert.equal(m.canvas, 0, `the outgoing backdrop is gone with it, in the same task (opacity ${m.canvas})`);
  assert.ok(/^0s(, 0s)*$/.test(m.canvasTransition), `with no fade: ${m.canvasTransition}`);
  assert.equal(m.inAlt, 'Poster: Midnight Projector', 'the allowed poster stays up');
  assert.ok(m.running > 0 && m.inPoster > 0 && m.inPoster < 0.98, `the incoming poster is still fading in (${m.inPoster})`);
  assert.ok(Math.abs(m.inPoster - m.inCanvas) <= 0.1, `its backdrop in step: poster ${m.inPoster} vs backdrop ${m.inCanvas}`);
  await settled(page);
  const eff = await effectiveBrightness(page, '#fill-backdrop canvas.active');
  assert.ok(eff > 0.2 && eff <= 0.25 + 1e-9, `the incoming backdrop finished its fade (effective ${eff})`);
  check(`R poster cut while fading out (incoming at ${m.inPoster.toFixed(2)} of a 6 s fade): outgoing poster ${m.poster}, outgoing backdrop ${m.canvas}; the incoming pair keeps fading in step`);
});

// 10. M5: a real block (a limit saved offline, with nothing allowed cached) takes the fill off the screen through the app's own
//     path, and its text with it.
for (const mode of ['blur', 'info']) {
  fillCase(`10 a real block hides the ${mode} fill`, { settings: limitPool({ fillMode: mode, randomPoolSize: 1 }) }, async ({ page, app, mock }) => {
    await mock.post('rate', { ratingKey: '1', contentRating: 'R' });
    await page.goto(app.url);
    await posterShown(page);
    await settled(page);
    assert.equal(await visible(page, mode === 'blur' ? '#fill-backdrop' : '#info-panel'), true, `${mode} fill is up before the block`);
    for (let i = 0; i < 100; i++) {
      if ((await page.evaluate(() => JSON.parse(localStorage.getItem('plexPoster.posterIndex') || '[]'))).length) break;
      await page.waitForTimeout(100);
    }
    await mock.down(); // only title 1 is cached, and it is R: nothing allowed is left to show
    await setHouseholdLimit(page);
    await page.waitForFunction(() => document.body.classList.contains('poster-blocked'), null, { timeout: 5000 });
    assert.equal(await visible(page, '#info-panel'), false, 'no panel');
    const hidden = await page.evaluate(() => [...document.querySelectorAll('#fill-backdrop canvas')].every((c) => getComputedStyle(c).visibility === 'hidden'));
    assert.equal(hidden, true, 'every backdrop canvas is hidden');
    assert.equal(await page.evaluate(() => document.getElementById('info-title').textContent), '', 'and the panel holds no text of the blocked title');
    check(`${mode}: the app blocked R title 1 (poster-blocked), and the fill went with it`);
  });
}

// 11. M4: under a stage dim (night dim, nightDimTarget stage) the backdrop is still at most a quarter bright, and dimmer than the poster.
fillCase('11 the backdrop stays under 0.25 and under the poster while the stage is dimmed', {
  settings: seed({ fillMode: 'blur', nightDim: true, nightDimStart: '22:00', nightDimEnd: '07:00', nightDimLevel: 60, nightDimTarget: 'stage' }),
  clock: { time: new Date(2026, 5, 1, 23, 0, 0) },
}, async ({ page, app }) => {
  await page.goto(app.url);
  await posterShown(page);
  await page.waitForFunction(() => /brightness\(/.test(getComputedStyle(document.getElementById('stage')).filter), null, { timeout: 15000 });
  await settled(page);
  const backdrop = await effectiveBrightness(page, '#fill-backdrop canvas.active');
  const poster = await effectiveBrightness(page, '.poster-layer.active');
  assert.ok(poster > 0.5 && poster < 0.7, `the stage is dimmed to about 0.6: poster ${poster}`);
  assert.ok(backdrop > 0 && backdrop <= 0.25 + 1e-9, `backdrop ${backdrop} is at most 0.25`);
  assert.ok(backdrop < poster, `and below the poster (${backdrop} vs ${poster})`);
  assert.deepEqual(await blurred(page), []);
  check(`stage dim 0.6: poster ${poster.toFixed(2)}, backdrop ${backdrop.toFixed(3)}`);
});

// 12. U1: the panel's text is inside its box. On 4:3 and 5:4 screens the side is narrower than 8 title em: no panel, and the
//     backdrop is unaffected. Where the panel shows, the title, the facts and the last visible line of the synopsis are inside it.
const inside = (inner, outer, tol = 0.5) => inner.left >= outer.left - tol && inner.right <= outer.right + tol && inner.top >= outer.top - tol && inner.bottom <= outer.bottom + tol;
const panelRects = (page) => page.evaluate(() => {
  const r = (id) => {
    const b = document.getElementById(id).getBoundingClientRect();
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  };
  return { panel: r('info-panel'), title: r('info-title'), meta: r('info-meta'), summary: r('info-summary') };
});
for (const vp of [{ width: 1440, height: 1080 }, { width: 1280, height: 1024 }, { width: 1024, height: 768 }]) {
  fillCase(`12 ${vp.width}x${vp.height} has no info panel and keeps its backdrop`, { viewport: vp, settings: seed({ fillMode: 'info' }) }, async ({ page, app }) => {
    await prepare(page, app);
    assert.equal(await visible(page, '#info-panel'), false, 'the side is under 8 title em: no panel');
    assert.equal(await visible(page, '#fill-backdrop'), false);
    check(`info at ${vp.width}x${vp.height}: no panel (too narrow), no text spilling`);
  });
  fillCase(`12 ${vp.width}x${vp.height} blur is unaffected`, { viewport: vp, settings: seed({ fillMode: 'blur' }) }, async ({ page, app }) => {
    await prepare(page, app);
    assert.equal(await visible(page, '#fill-backdrop'), true);
    check(`blur at ${vp.width}x${vp.height}: the backdrop shows`);
  });
}
for (const vp of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1280, height: 800 }, { width: 1280, height: 720 }]) {
  fillCase(`12 ${vp.width}x${vp.height} the panel's text is inside its box`, { viewport: vp, settings: seed({ fillMode: 'info' }) }, async ({ page, app }) => {
    await prepare(page, app);
    assert.equal(await visible(page, '#info-panel'), true);
    const r = await panelRects(page);
    for (const part of ['title', 'meta', 'summary']) assert.ok(inside(r[part], r.panel), `${part} ${JSON.stringify(r[part])} inside the panel ${JSON.stringify(r.panel)}`);
    check(`info at ${vp.width}x${vp.height}: title, facts and synopsis inside the panel`);
  });
}
// A title far longer than any real one, on a screen where the panel is narrow: the synopsis gives way (an ellipsis), the title
// keeps its top, and nothing is above the box.
fillCase('12 a very long title: the synopsis is clamped inside the box, the title is not pushed off', { viewport: { width: 1280, height: 800 }, settings: seed({ fillMode: 'info' }) }, async ({ page, app }) => {
  await prepare(page, app);
  await page.evaluate(() => {
    document.getElementById('info-title').textContent = 'The Extraordinarily Long and Winding Tale of the Velvet Curtain, the Marquee, and Every Projectionist Who Ever Loved Them';
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(() => document.getElementById('info-summary').style.getPropertyValue('--info-lines') !== '', null, { timeout: 5000 });
  await page.waitForTimeout(200);
  const r = await panelRects(page);
  for (const part of ['title', 'meta', 'summary']) assert.ok(inside(r[part], r.panel), `${part} ${JSON.stringify(r[part])} inside the panel ${JSON.stringify(r.panel)}`);
  const lines = await page.evaluate(() => Number(document.getElementById('info-summary').style.getPropertyValue('--info-lines')));
  assert.ok(lines >= 1 && lines < 11, `the synopsis was cut back to ${lines} lines`);
  check(`long title: synopsis clamped to ${lines} lines, all inside the panel`);
});

// 12b. D85 follow-up, D95: when the text fills the panel (a long title takes the room, the synopsis gives way to one line), the title's
//      top and the text's bottom keep the panel's own gap from the screen's edge, 4 % of the screen's height, not 0. A long title and a
//      long synopsis make the body fill the panel (the synopsis takes every line the title leaves), so the case does not depend on the
//      mock's own synopsis.
for (const vp of [{ width: 1920, height: 1080 }, { width: 2560, height: 1080 }]) {
  fillCase(`12b ${vp.width}x${vp.height} overflowing text keeps 4 % of the screen's height from the top and bottom edge`, { viewport: vp, settings: seed({ fillMode: 'info' }) }, async ({ page, app }) => {
    await prepare(page, app);
    await page.evaluate(() => {
      document.getElementById('info-title').textContent = 'The Very Long and Winding Tale of the Velvet Curtain '.repeat(2);
      document.getElementById('info-summary').textContent = 'A synopsis that goes on and on about the projectionist and the marquee. '.repeat(12);
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(() => document.getElementById('info-summary').style.getPropertyValue('--info-lines') !== '', null, { timeout: 5000 });
    await page.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 5000 });
    const m = await page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const body = document.getElementById('info-title').parentElement.getBoundingClientRect();
      return { panel: r('info-panel'), title: r('info-title'), meta: r('info-meta'), summary: r('info-summary'), body, line: parseFloat(getComputedStyle(document.getElementById('info-summary')).lineHeight) };
    });
    const margin = 0.04 * vp.height;
    assert.ok(m.body.height >= m.panel.height - m.line, `the text fills the panel to within a line (body ${m.body.height.toFixed(0)} of ${m.panel.height.toFixed(0)} px), so it is the overflow case`);
    assert.ok(m.title.top >= margin - 0.5, `the title's top (${m.title.top.toFixed(1)}) is at least ${margin} px from the top edge`);
    assert.ok(vp.height - m.summary.bottom >= margin - 0.5, `the synopsis's bottom (${m.summary.bottom.toFixed(1)}) is at least ${margin} px from the bottom edge`);
    assert.ok(vp.height - m.meta.bottom >= margin - 0.5, 'and so is the facts line');
    check(`overflow at ${vp.width}x${vp.height}: title top ${m.title.top.toFixed(1)}, text bottom ${m.summary.bottom.toFixed(1)} of ${vp.height} (margin ${margin})`);
  });
}

// 13. U2: the panel starts after the poster as it is drawn, at every poster size the Settings slider allows (50 to 150 percent), and
//     goes away when the poster leaves too little room.
for (const scale of [50, 100, 150]) {
  fillCase(`13 poster size ${scale} percent: no overlap`, { settings: seed({ fillMode: 'info', posterScale: scale }) }, async ({ page, app }) => {
    await prepare(page, app);
    assert.equal(await visible(page, '#info-panel'), true, 'the panel shows');
    const panel = await rect(page, '#info-panel');
    const poster = await rect(page, '#poster-box');
    const frame = await rect(page, '#frame');
    assert.ok(panel.left >= poster.right, `the panel (${panel.left}) starts after the poster (${poster.right})`);
    assert.ok(panel.left >= frame.right, `and after the frame (${frame.right})`);
    assert.ok(panel.right <= 1920, `inside the screen: ${panel.right}`);
    check(`poster ${scale} %: poster ends ${Math.round(poster.right)}, frame ${Math.round(frame.right)}, panel starts ${Math.round(panel.left)}`);
  });
}
fillCase('13 poster size 200 percent leaves no room: no panel', { settings: seed({ fillMode: 'info', posterScale: 200 }) }, async ({ page, app }) => {
  await prepare(page, app);
  assert.equal(await visible(page, '#info-panel'), false);
  check('poster 200 %: the panel is hidden, not drawn over the poster');
});

// ---------- run ----------

const WORKERS = Number(process.env.E2E_FILL_WORKERS || 3);
if (process.env.E2E_FILL_ONLY) {
  const only = new RegExp(process.env.E2E_FILL_ONLY);
  cases.splice(0, cases.length, ...cases.filter((c) => only.test(c.name)));
}
const failures = [];
let nextCase = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (nextCase < cases.length) {
      const { name, opts, fn } = cases[nextCase++];
      try {
        await withApp(opts, fn);
        console.log(`PASS case ${name}`);
      } catch (err) {
        failures.push({ name, err });
      }
    }
  }),
);
for (const { name, err } of failures) console.error(`case ${name} failed:\n${err?.stack || err}`);
if (failures.length) process.exit(1);
