import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHORTCUTS, keyMap, listShortcuts, normalizeKey } from '../js/shortcuts.js';
import { defaults } from '../js/settings.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the table has r p space o f s d ? and each has a label', () => {
  assert.deepEqual(SHORTCUTS.map((s) => s.key).sort(), ['?', 'd', 'f', 'o', 'p', 'r', 's', 'space']);
  for (const s of SHORTCUTS) {
    assert.equal(typeof s.label, 'string', `${s.key} label`);
    assert.ok(s.label.trim().length > 0, `${s.key} has a label`);
    assert.equal(typeof s.action, 'string', `${s.key} action`);
  }
});

test('no duplicate keys and no duplicate labels for different actions', () => {
  const keys = SHORTCUTS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  const byLabel = new Map();
  for (const s of SHORTCUTS) {
    if (byLabel.has(s.label)) assert.equal(byLabel.get(s.label), s.action, `"${s.label}" names two actions`);
    byLabel.set(s.label, s.action);
  }
});

test('the keys map to the actions the controls use', () => {
  assert.deepEqual({ ...keyMap() }, {
    s: 'settings',
    d: 'diagnostics',
    r: 'refresh',
    space: 'pause',
    p: 'pause',
    o: 'rotate',
    f: 'fullscreen',
    '?': 'shortcuts',
  });
});

test('keyboard event keys are normalised: case folded, the space bar is "space"', () => {
  assert.equal(normalizeKey(' '), 'space');
  assert.equal(normalizeKey('R'), 'r');
  assert.equal(normalizeKey('r'), 'r');
  assert.equal(normalizeKey('?'), '?');
  assert.equal(keyMap()[normalizeKey(' ')], 'pause');
  assert.equal(keyMap()[normalizeKey('Enter')], undefined);
  assert.equal(keyMap()[normalizeKey('constructor')], undefined, 'no prototype keys');
});

test('listShortcuts lists the whole table, and nothing with disableShortcuts', () => {
  assert.deepEqual(listShortcuts(defaults()), SHORTCUTS);
  assert.equal(listShortcuts({}).length, 8);
  assert.deepEqual(listShortcuts({ disableShortcuts: true }), []);
  assert.deepEqual(listShortcuts({ ...defaults(), disableShortcuts: true }), []);
});

test('the table is frozen so nothing can drift at run time', () => {
  assert.ok(Object.isFrozen(SHORTCUTS));
  assert.throws(() => SHORTCUTS.push({ key: 'x', action: 'x', label: 'x' }), TypeError);
});

test('main.js builds KEYS from the table and every action in it exists there', () => {
  const main = read('../js/main.js');
  assert.match(main, /from '\.\/shortcuts\.js'/, 'main.js imports the table');
  assert.match(main, /const KEYS = keyMap\(\)/, 'KEYS comes from the table');
  const block = main.match(/const actions = \{([\s\S]*?)\n\};/);
  assert.ok(block, 'actions object found');
  const names = new Set([...block[1].matchAll(/^\s{2}(\w+)\s*[:,]/gm)].map((m) => m[1]));
  for (const s of SHORTCUTS) assert.ok(names.has(s.action), `main.js has an action "${s.action}" for ${s.key}`);
  assert.doesNotMatch(main, /'o': 'rotate'|o: 'rotate'/, 'no second key table in main.js');
});

test('the shortcuts dialog and the precache list are in place', () => {
  assert.match(read('../index.html'), /id="shortcuts"/);
  assert.match(read('../sw.js'), /'js\/shortcuts\.js'/);
});
