import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadKey, redact } from '../scripts/tmdb-real.mjs';

const FAKE_V3 = '0123456789abcdef0123456789abcdef';
const FAKE_TOKEN = 'eyFakeReadAccessToken.for-tests_only';

test('the real TMDB checks skip with exit 0 when no key is set', () => {
  const home = mkdtempSync(join(tmpdir(), 'tmdb-real-'));
  const run = spawnSync(process.execPath, ['scripts/tmdb-real.mjs'], { env: { PATH: process.env.PATH, HOME: home }, encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^SKIP: no TMDB key/);
});

test('loadKey reads TMDB_KEY first, then TMDB_KEY_FILE, trimmed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tmdb-real-'));
  const file = join(dir, 'key');
  writeFileSync(file, `  ${FAKE_V3}\n`);
  assert.equal(loadKey({ TMDB_KEY: ` ${FAKE_TOKEN} `, TMDB_KEY_FILE: file }), FAKE_TOKEN);
  assert.equal(loadKey({ TMDB_KEY_FILE: file }), FAKE_V3);
});

test('redact blanks the key as typed, without "Bearer " and URL-encoded', () => {
  assert.equal(redact(`url?api_key=${FAKE_V3}&x=1`, FAKE_V3), 'url?api_key=<key>&x=1');
  const token = 'abc/def+ghi=jkl';
  assert.equal(redact(`Authorization: Bearer ${token}; ${token}; ${encodeURIComponent(token)}`, `Bearer ${token}`), 'Authorization: <key>; <key>; <key>');
  assert.equal(redact('nothing secret here', FAKE_V3), 'nothing secret here');
});
