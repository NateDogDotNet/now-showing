import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SECONDS, MIN_SECONDS, formatMinutes, presetFor, secondsFromMinutes } from '../js/duration.js';

test('presetFor maps the four presets and nothing else', () => {
  assert.equal(presetFor(60), 60);
  assert.equal(presetFor(300), 300);
  assert.equal(presetFor(900), 900);
  assert.equal(presetFor(3600), 3600);
  for (const other of [10, 59, 61, 150, 420, 7200, 86400, 0, -60]) assert.equal(presetFor(other), 'custom', String(other));
});

test('presetFor treats a numeric string like the number and junk as custom', () => {
  assert.equal(presetFor('300'), 300);
  assert.equal(presetFor('3600'), 3600);
  for (const junk of ['', 'abc', null, undefined, NaN, Infinity, [], {}]) assert.equal(presetFor(junk), 'custom', String(junk));
});

test('secondsFromMinutes turns minutes (a string from a field, or a number) into whole seconds', () => {
  assert.equal(secondsFromMinutes('2.5'), 150);
  assert.equal(secondsFromMinutes(2.5), 150);
  assert.equal(secondsFromMinutes('1'), 60);
  assert.equal(secondsFromMinutes('7'), 420);
  assert.equal(secondsFromMinutes(' 15 '), 900);
  assert.equal(secondsFromMinutes('1.25'), 75);
  assert.equal(secondsFromMinutes('0.3'), 18);
  assert.equal(secondsFromMinutes('0.55'), 33, 'rounded to a whole second');
});

test('secondsFromMinutes clamps below the schema minimum of 10 s', () => {
  assert.equal(secondsFromMinutes('0.1'), 10, '6 s');
  assert.equal(secondsFromMinutes('0.05'), 10);
  assert.equal(secondsFromMinutes('0'), 10);
  assert.equal(secondsFromMinutes('-3'), 10);
  assert.equal(secondsFromMinutes('0.17'), 10, '10.2 s rounds to the minimum itself');
  assert.equal(secondsFromMinutes('0.2'), 12);
});

test('secondsFromMinutes clamps above the schema maximum of 24 h', () => {
  assert.equal(secondsFromMinutes('1440'), 86400);
  assert.equal(secondsFromMinutes('99999'), 86400);
});

test('secondsFromMinutes returns the previous value for anything that is not a finite number', () => {
  for (const junk of ['abc', '', '  ', '1e', 'Infinity', '-Infinity', 'NaN', null, undefined, NaN, Infinity, true, [], {}]) {
    assert.equal(secondsFromMinutes(junk, 300), 300, String(junk));
  }
  assert.equal(secondsFromMinutes('abc'), undefined, 'no previous value given: undefined, not a made-up number');
});

test('formatMinutes shows whole minutes plainly and fractions with as many decimals as they need', () => {
  assert.equal(formatMinutes(420), '7');
  assert.equal(formatMinutes(150), '2.5');
  assert.equal(formatMinutes(3600), '60');
  assert.equal(formatMinutes(60), '1');
  assert.equal(formatMinutes(90), '1.5');
  assert.equal(formatMinutes(15), '0.25', '15 s is a quarter of a minute, not 0.3');
  assert.equal(formatMinutes(153), '2.55');
  assert.equal(formatMinutes(10), '0.17', 'the shortest text that still saves 10 s');
  assert.equal(formatMinutes(86400), '1440');
  assert.equal(formatMinutes('300'), '5');
});

test('what formatMinutes shows saves the same seconds when it is typed back (every whole second the schema allows)', () => {
  for (let seconds = MIN_SECONDS; seconds <= MAX_SECONDS; seconds++) {
    const shown = formatMinutes(seconds);
    assert.equal(secondsFromMinutes(shown, -1), seconds, `${seconds} s shown as "${shown}"`);
    assert.ok(shown.length <= 8, `${seconds} s shown as "${shown}" is short`);
  }
});

test('typing a value and reading back what is shown is stable (the Custom field never drifts)', () => {
  for (const typed of ['0.25', '2.55', '0.3', '0.17', '-3', '0.01', '2.5555', '1e1', '1440', '99999']) {
    const seconds = secondsFromMinutes(typed, 300);
    const shown = formatMinutes(seconds);
    assert.equal(secondsFromMinutes(shown, 300), seconds, `${typed} -> ${seconds} s -> "${shown}"`);
  }
});

test('formatMinutes is empty for junk', () => {
  for (const junk of ['', 'abc', null, undefined, NaN, Infinity]) assert.equal(formatMinutes(junk), '', String(junk));
});
