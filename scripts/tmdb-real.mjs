#!/usr/bin/env node
// Opt-in checks against the REAL TMDB (section M of docs/validation/real-server-extended.md). Not part of `npm test` or CI: those use the mock TMDB.
//
//   TMDB_KEY=<v3 key or read access token> npm run test:tmdb-real
//   TMDB_KEY_FILE=/path/to/file npm run test:tmdb-real        (default file: ~/.config/now-showing/tmdb-key)
//
// With no key it prints SKIP and exits 0. The key is never printed: every line this script writes passes through redact(), which blanks the key and its
// URL-encoded form, and no request URL is printed whole. It drives the app's own TMDB client (js/sources/tmdb.js) and choosers (js/artwork.js), so a pass
// means the shipped code reads the real replies. It sends a modest number of requests (about 150) and never bursts to force a 429.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { API_BASE, IMAGE_BASE, LISTS, createTmdbClient, discoverKey, keyForm } from '../js/sources/tmdb.js';
import { choosePoster, chooseLogo } from '../js/artwork.js';

export const DEFAULT_KEY_FILE = join(homedir(), '.config', 'now-showing', 'tmdb-key');

/** The key from TMDB_KEY, else from TMDB_KEY_FILE, else from the default file; '' when there is none. */
export function loadKey(env = process.env) {
  if (typeof env.TMDB_KEY === 'string' && env.TMDB_KEY.trim()) return env.TMDB_KEY.trim();
  for (const file of [env.TMDB_KEY_FILE, DEFAULT_KEY_FILE].filter(Boolean)) {
    try {
      const text = readFileSync(file, 'utf8').trim();
      if (text) return text;
    } catch {
      // no such file: try the next
    }
  }
  return '';
}

/** `text` with every copy of the key (as typed, without "Bearer ", and URL-encoded) replaced by "<key>". */
export function redact(text, key) {
  let out = String(text);
  const value = keyForm(key).value;
  for (const secret of new Set([key, value, encodeURIComponent(value)].filter((s) => s && s.length >= 8))) out = out.split(secret).join('<key>');
  return out;
}

async function main() {
  const key = loadKey();
  if (!key) {
    console.log('SKIP: no TMDB key (set TMDB_KEY, or TMDB_KEY_FILE, or write the key to ~/.config/now-showing/tmdb-key).');
    return 0;
  }
  const form = keyForm(key);
  const say = (line) => console.log(redact(line, key));
  let failed = 0;
  const result = async (row, what, fn) => {
    try {
      const note = await fn();
      say(`PASS ${row} ${what}${note ? ` — ${note}` : ''}`);
    } catch (err) {
      failed++;
      say(`FAIL ${row} ${what} — ${err?.message ?? err}`);
    }
  };
  const info = (row, line) => say(`INFO ${row} ${line}`);
  const check = (ok, message) => {
    if (!ok) throw new Error(message);
  };

  // A raw API GET as the client sends it (the key in the query or the header), for the replies the client does not expose whole.
  const raw = (path, params = {}, extra = {}) => {
    const url = new URL(path, API_BASE);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (form.kind === 'v3') url.searchParams.set('api_key', form.value);
    return fetch(url, { headers: { ...(form.kind === 'token' ? { Authorization: `Bearer ${form.value}` } : {}), ...extra } });
  };
  const rawJson = async (path, params) => {
    const res = await raw(path, params);
    check(res.ok, `HTTP ${res.status} on ${path}`);
    return res.json();
  };

  const client = createTmdbClient({ key });
  say(`Real TMDB checks, key form: ${form.kind === 'v3' ? 'v3 API key (api_key query)' : 'read access token (Bearer header)'}`);

  await result('V1-T01', 'the key connects (Test connection)', async () => {
    await client.identity();
  });
  if (failed) {
    say('The key was not accepted: nothing else is asked. Check the key, then run again.');
    return 1;
  }

  for (const list of LISTS) {
    await result('V1-T02', `list ${list.key}`, async () => {
      const pool = await client.pool({ libraryKey: list.key, size: 10 });
      check(pool.length > 0, 'no posters');
      check(pool.every((p) => /^\/[^/]+\.\w+$/.test(p.thumb) && p.ratingKey.startsWith(`${list.type}:`)), 'a poster without a file path or of the other type');
      const rated = pool.filter((p) => p.contentRating).length;
      return `${pool.length} posters, ${rated} with a US certification${pool.partial ? ', partial' : ''}`;
    });
  }

  await result('V1-T03', 'genre lists and Discover with Animation|Comedy', async () => {
    const genres = await client.genres('movie/popular');
    check(genres.some((g) => g.key === '16') && genres.some((g) => g.key === '35'), 'Animation (16) or Comedy (35) missing from genre/movie/list');
    const tv = await client.genres('tv/popular');
    check(tv.length > 0, 'genre/tv/list is empty');
    const pool = await client.pool({ libraryKey: discoverKey({ type: 'movie' }), size: 10, genres: ['16', '35'] });
    check(pool.length > 0, 'Discover returned nothing');
    return `${genres.length} movie genres, ${tv.length} TV genres, Discover ${pool.length} posters`;
  });

  await result('V1-T04', 'certification of known titles (Fight Club R, Breaking Bad TV-MA)', async () => {
    const movie = await client.item('movie:550');
    check(movie.contentRating === 'R', `movie 550 read as "${movie.contentRating}"`);
    const show = await client.item('tv:1396');
    check(show.contentRating === 'TV-MA', `tv 1396 read as "${show.contentRating}"`);
  });

  await result('V1-T05', 'the household limit PG on Popular', async () => {
    const pool = await client.pool({ libraryKey: 'movie/popular', size: 20, maxContentRating: 'PG' });
    const bad = pool.filter((p) => !['G', 'PG'].includes(p.contentRating));
    check(!bad.length, `${bad.length} posters above PG or unrated: ${bad.map((p) => `${p.title} (${p.contentRating || 'none'})`).join(', ')}`);
    return `${pool.length} posters, all G or PG`;
  });

  // V1-T06: no burst is sent (the app never bursts, and TMDB asks clients not to). What a browser could read is what CORS exposes.
  await result('V1-T06', 'CORS on the API (what a browser may read)', async () => {
    const res = await raw('configuration', {}, { Origin: 'https://example.org' });
    const allow = res.headers.get('access-control-allow-origin');
    const expose = res.headers.get('access-control-expose-headers') ?? '';
    check(allow === '*' || allow === 'https://example.org', `access-control-allow-origin is "${allow}"`);
    const readable = expose.split(',').some((h) => ['*', 'retry-after'].includes(h.trim().toLowerCase()));
    info('V1-T06', `exposed headers: "${expose || '(none)'}" on a 200; Retry-After ${readable ? 'would be' : 'would NOT be'} readable from a browser if a 429 carries the same CORS headers (no burst is sent, so the 429 itself is not seen)`);
    return `allow-origin ${allow}`;
  });

  const FILMS = [
    ['movie', 550],
    ['movie', 603],
    ['movie', 862],
    ['tv', 1396],
    ['tv', 1399],
  ];

  await result('V1-T07', 'language and include_image_language on the images route', async () => {
    const [type, id] = FILMS[0];
    const counts = {};
    for (const [label, params] of [
      ['include_image_language=null', { include_image_language: 'null' }],
      ['include_image_language=en', { include_image_language: 'en' }],
      ['include_image_language=en,null', { include_image_language: 'en,null' }],
      ['language=fr', { language: 'fr' }],
      ['language=fr&include_image_language=en,null', { language: 'fr', include_image_language: 'en,null' }],
      ['(neither)', {}],
    ]) {
      const reply = await rawJson(`${type}/${id}/images`, params);
      const langs = new Set((reply.posters ?? []).map((p) => (p.iso_639_1 === null ? 'null' : p.iso_639_1)));
      counts[label] = `${(reply.posters ?? []).length} posters [${[...langs].sort().join(',')}], ${(reply.logos ?? []).length} logos`;
    }
    for (const [label, line] of Object.entries(counts)) info('V1-T07', `${type} ${id} ${label}: ${line}`);
    const viaClient = await client.images(type, id, ['null', 'en']);
    check(viaClient.every((p) => p.iso_639_1 === null || p.iso_639_1 === 'en'), 'the client asked for null,en and got another language');
    return `the client's null,en request returned ${viaClient.length} posters, all null or en`;
  });

  const KEYS = ['file_path', 'width', 'height', 'iso_639_1', 'vote_average', 'vote_count', 'aspect_ratio'];
  const fileTypes = { poster: new Map(), logo: new Map() };
  for (const [type, id] of FILMS) {
    await result('V1-T08', `images reply of ${type} ${id}`, async () => {
      const reply = await rawJson(`${type}/${id}/images`, { include_image_language: 'en,null' });
      check(Array.isArray(reply.posters) && Array.isArray(reply.logos), 'posters or logos is not a list');
      for (const p of [...reply.posters, ...reply.logos]) check(KEYS.every((k) => k in p) && /^\/[^/]+\.\w+$/.test(p.file_path), `an entry lacks a field or a plain file_path: ${JSON.stringify(p)}`);
      for (const p of reply.posters) fileTypes.poster.set(p.file_path.split('.').pop(), (fileTypes.poster.get(p.file_path.split('.').pop()) ?? 0) + 1);
      for (const p of reply.logos) fileTypes.logo.set(p.file_path.split('.').pop(), (fileTypes.logo.get(p.file_path.split('.').pop()) ?? 0) + 1);
      const textless = choosePoster(reply.posters, 'textless');
      const largest = choosePoster(reply.posters, 'largest', '', ['null', 'en']);
      const logo = chooseLogo(reply.logos, 'en');
      check(largest, 'Largest chose no poster');
      return `${reply.posters.length} posters, ${reply.logos.length} logos; textless ${textless ? 'found' : 'none'}, logo ${logo ? logo.split('.').pop() : 'none'}`;
    });
  }
  info('V1-T08', `poster file types: ${[...fileTypes.poster].map(([t, n]) => `${t} ${n}`).join(', ') || 'none'}; logo file types: ${[...fileTypes.logo].map(([t, n]) => `${t} ${n}`).join(', ') || 'none'}`);

  await result('V1-T08/T09', 'image host: a poster and a logo download without a key, CORS open', async () => {
    const [type, id] = FILMS[0];
    const reply = await rawJson(`${type}/${id}/images`, { include_image_language: 'en,null' });
    const poster = choosePoster(reply.posters, 'largest', '', ['null', 'en']);
    const notes = [];
    const get = async (url) => {
      check(!url.includes(form.value), 'an image URL holds the key');
      const res = await fetch(url, { headers: { Origin: 'https://example.org' } });
      check(res.ok, `HTTP ${res.status} for ${url.replace(IMAGE_BASE, '')}`);
      await res.arrayBuffer();
      return `${url.replace(IMAGE_BASE, '')}: ${res.headers.get('content-type')}, allow-origin ${res.headers.get('access-control-allow-origin') ?? '(none)'}`;
    };
    notes.push(await get(client.imageUrl(poster, { width: 500 })));
    const png = reply.logos.find((l) => l.file_path.endsWith('.png'));
    const svg = reply.logos.find((l) => l.file_path.endsWith('.svg'));
    if (png) notes.push(await get(`${IMAGE_BASE}w500${png.file_path}`));
    if (svg) {
      notes.push(await get(`${IMAGE_BASE}original${svg.file_path}`));
      const w500 = await fetch(`${IMAGE_BASE}w500${svg.file_path}`);
      notes.push(`an SVG at w500 answers HTTP ${w500.status} ${w500.headers.get('content-type')}`);
      await w500.arrayBuffer();
    }
    for (const n of notes) info('V1-T08/T09', n);
    return `${notes.length} files`;
  });

  await result('V1-T12', 'company search "pixar" and Discover by house', async () => {
    const houses = await client.houses('movie/popular', { query: 'pixar' });
    const pixar = houses.find((h) => h.title === 'Pixar');
    check(pixar, `no company named Pixar in ${houses.length} results`);
    const pool = await client.pool({ libraryKey: discoverKey({ type: 'movie' }), size: 10, houses: [pixar.key] });
    check(pool.length > 0, 'Discover with that house returned nothing');
    check(pool.every((p) => (p.companyIds ?? []).includes(pixar.key)), 'a poster not from Pixar');
    return `${houses.length} results, Pixar id ${pixar.key}${pixar.country ? ` (${pixar.country})` : ''}; Discover ${pool.length} Pixar posters`;
  });

  info('V1-T10/T11/T13', 'need a real Plex, Jellyfin or Emby server: not run here');
  say(failed ? `${failed} check(s) FAILED` : 'All real TMDB checks passed');
  return failed ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(redact(`ERROR ${err?.stack ?? err}`, loadKey()));
      process.exit(2);
    },
  );
}
