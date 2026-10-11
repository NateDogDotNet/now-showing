import test from 'node:test';
import assert from 'node:assert/strict';
import { createHelper } from '../js/helper.js';

const json = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(handler) {
  const calls = [];
  const logs = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
  const log = { info: (m) => logs.push(['info', m]), warn: (m) => logs.push(['warn', m]), error: (m) => logs.push(['error', m]) };
  return { helper: createHelper({ fetchImpl, log }), calls, logs };
}

const header = (init) => new Headers(init.headers).get('X-Poster-Helper');

test('probe: a good status reply is available and carries the temperature', async () => {
  const { helper, calls } = setup(() => json({ power: 'cec-ctl', temperature: 'thermal_zone0', tempC: 42.5 }));
  const r = await helper.probe();
  assert.equal(r.available, true);
  assert.equal(r.tempC, 42.5);
  assert.equal(r.temperature, 'thermal_zone0');
  assert.equal(helper.available, true);
  assert.equal(calls[0].url, '__helper/status');
  assert.ok((calls[0].init.method || 'GET') === 'GET');
});

test('probe: 404, network error, bad JSON and a non-object body are available:false and never throw', async () => {
  const cases = [
    () => json('no', 404),
    () => { throw new TypeError('Failed to fetch'); },
    () => json('{not json'),
    () => json('null'),
    () => json('"text"'),
    () => json({}, 503),
  ];
  for (const handler of cases) {
    const { helper } = setup(handler);
    const r = await helper.probe();
    assert.equal(r.available, false);
    assert.equal(helper.available, false);
  }
});

test('probe: tempC that is not a finite number is dropped', async () => {
  const { helper } = setup(() => json({ power: null, temperature: null, tempC: 'hot' }));
  const r = await helper.probe();
  assert.equal(r.available, true);
  assert.equal(r.tempC, null);
});

test('every request carries X-Poster-Helper: 1 and a relative same-origin URL', async () => {
  const { helper, calls } = setup((url) => (url.endsWith('status') ? json({ power: 'x', temperature: null, tempC: null }) : json({ ok: true })));
  await helper.probe();
  await helper.status();
  await helper.power(true);
  await helper.power(false);
  assert.equal(calls.length, 4);
  for (const c of calls) {
    assert.equal(header(c.init), '1');
    assert.match(c.url, /^__helper\/(status|display)$/);
    assert.doesNotMatch(c.url, /^[a-z]+:|^\//i);
  }
});

test('power(false) posts {"on":false}; power(true) posts {"on":true}', async () => {
  const { helper, calls } = setup(() => json({ ok: true }));
  assert.deepEqual(await helper.power(false), { ok: true });
  await helper.power(true);
  assert.equal(calls[0].url, '__helper/display');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { on: false });
  assert.deepEqual(JSON.parse(calls[1].init.body), { on: true });
});

test('power: an HTTP error or a network error is {ok:false} and never throws', async () => {
  for (const handler of [() => json({ error: 'busy' }, 503), () => { throw new TypeError('nope'); }]) {
    const { helper } = setup(handler);
    assert.deepEqual(await helper.power(false), { ok: false });
  }
});

test('failures are logged once per kind, not on every call', async () => {
  const { helper, logs } = setup(() => { throw new TypeError('down'); });
  for (let i = 0; i < 5; i++) {
    await helper.probe();
    await helper.status();
    await helper.power(false);
  }
  const kinds = logs.length;
  assert.equal(kinds, 3, `one line each for probe, status and power: ${JSON.stringify(logs)}`);
  assert.equal(logs.filter(([level]) => level === 'error').length, 0, 'never logged as an error');
});

test('a success re-arms the log: a later failure is logged again', async () => {
  let fail = true;
  const { helper, logs } = setup(() => (fail ? json('x', 500) : json({ ok: true })));
  await helper.power(true);
  await helper.power(true);
  assert.equal(logs.length, 1);
  fail = false;
  await helper.power(true);
  fail = true;
  await helper.power(true);
  assert.equal(logs.length, 2);
});

test('createHelper works without a log', async () => {
  const helper = createHelper({ fetchImpl: async () => json('x', 404) });
  assert.equal((await helper.probe()).available, false);
});
