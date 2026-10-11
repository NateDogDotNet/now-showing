// Settings sheet: form binding, live layout preview, Plex sign-in and import/export.

import { formatMinutes, presetFor, secondsFromMinutes } from './duration.js';
import { FRAMES, NO_FRAME, CUSTOM_FRAME_ID } from './frames.js';
import { createPin, checkPin, createPlexClient, discoverServers, firstReachable } from './plex.js';
import { defaults, fromImport, isConfigured, sanitize, toExport } from './settings.js';
import { actionButton, downloadJson, sleep, toast } from './util.js';

const LAYOUT_KEYS = ['posterScale', 'posterOffsetX', 'posterOffsetY'];

// ---- the plex.tv code (shared by the Settings sheet and the empty card's first run) ----

const PIN_POLL_MS = 5000; // K50: one poll per 5 s while the code is fresh
const PIN_POLL_MAX_MS = 30_000; // polls back off to this while plex.tv does not answer
const PIN_DEFAULT_LIFE_S = 15 * 60; // when plex.tv does not say how long the code lives
const PIN_MIN_LIFE_MS = 5000; // a lifetime shorter than this is not believed: it must not turn into a request loop

/**
 * One round of the plex.tv/link flow: asks for a code, hands it to `onCode`, and polls until it is approved. Resolves to the
 * Plex token when it is, or to null when the code expires (a fresh call makes a fresh code) or `signal` aborts. Throws a
 * PlexError when the code cannot be had at all (the caller decides how to retry). A poll that fails is not an error: the
 * code stays good, so it just waits longer before the next one. The lifetime is plex.tv's own `expiresIn`, counted on this
 * device's monotonic clock, so a device with the wrong date neither expires a code at once nor holds a dead one.
 */
export async function pinSignIn(clientId, { signal, onCode, fetchImpl, pollMs = PIN_POLL_MS, minLifeMs = PIN_MIN_LIFE_MS } = {}) {
  const pin = await createPin(clientId, fetchImpl ? { fetchImpl } : {});
  if (signal?.aborted) return null;
  onCode?.(pin.code);
  const lifeMs = Math.max(minLifeMs, (pin.expiresIn ?? PIN_DEFAULT_LIFE_S) * 1000);
  const startedAt = performance.now();
  let failures = 0;
  while (!signal?.aborted && performance.now() - startedAt < lifeMs) {
    const left = lifeMs - (performance.now() - startedAt);
    await sleep(Math.min(left, PIN_POLL_MAX_MS, pollMs * 2 ** failures), signal);
    if (signal?.aborted) return null;
    try {
      const token = await checkPin(clientId, pin.id, fetchImpl ? { fetchImpl } : {});
      failures = 0;
      if (token) return token;
    } catch {
      failures = Math.min(failures + 1, 5);
    }
  }
  return null;
}

const countLabel = (n) => `${n.toLocaleString('en-US')} ${n === 1 ? 'title' : 'titles'}`;

/**
 * `requestPin()` is the app's one PIN check (true at once when no PIN is set); the token reveal, the token export,
 * an import and Reset everything all go through it. `choosePin()` asks for a new PIN twice and gives { hash, salt }.
 */
export function createSettingsUI({ getSettings, clientId, log, onPreview, onSave, onClearCache, onReset, requestPin, choosePin, fixesFor = () => [], runFix = () => {} }) {
  const $ = (id) => document.getElementById(id);
  const dialog = $('settings');
  const form = $('settings-form');
  const field = (name) => form.elements.namedItem(name);
  let original = null;
  let pinAbort = null;
  let servers = [];
  // The pin the dialog would save: set by write() (open and import), cleared by Unpin, used by read(). It is separate
  // from the saved pin, which the live preview keeps applying until Save (an unsaved pin is never drawn, D29).
  let pendingPin = { key: '', title: '' };
  // The PIN material the dialog would save, like pendingPin: set from the saved settings by write(), changed by the
  // Set / Remove buttons, saved by Save. An import never changes it (fromImport ignores PIN material).
  let pendingAuth = { hash: '', salt: '' };
  // The sign-in controls show when nothing is connected yet, or after Change; otherwise the "Connected to" card does.
  let connectionOpen = true;
  let testing = false;
  let countRun = 0; // bumped whenever the library list is rebuilt or the sheet closes, so a late count is ignored

  // Frame options are built from the registry so new frames only need adding there.
  $('frame-select').replaceChildren(
    ...[...FRAMES, NO_FRAME, { id: CUSTOM_FRAME_ID, name: 'Custom image…' }].map((f) => new Option(f.name, f.id)),
  );

  function write(s) {
    for (const el of form.elements) {
      if (!el.name || !(el.name in s)) continue;
      if (el.type === 'checkbox') el.checked = Boolean(s[el.name]);
      else el.value = String(s[el.name]);
    }
    // The household toggle is UI-only: on when a limit is set; off stores ''. The select keeps PG-13 while off.
    $('household-toggle').checked = Boolean(s.maxContentRating);
    field('maxContentRating').value = s.maxContentRating || 'PG-13';
    ensureLibraryOption(s.libraryKey, s.libraryName);
    field('libraryKey').value = s.libraryKey;
    pendingPin = { key: s.staticRatingKey || '', title: s.staticTitle || '' };
    $('pinned-title').textContent = s.staticRatingKey ? s.staticTitle || `item ${s.staticRatingKey}` : 'none';
    $('unpin-btn').hidden = !s.staticRatingKey;
    pendingAuth = { hash: s.settingsPinHash || '', salt: s.settingsPinSalt || '' };
    connectionOpen = !isConfigured(s);
    syncPin();
    syncRotate();
    syncDependent();
    renderConnection();
  }

  function read() {
    const s = { ...getSettings() };
    for (const el of form.elements) {
      if (!el.name || !(el.name in s)) continue;
      s[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    s.maxContentRating = $('household-toggle').checked ? field('maxContentRating').value : '';
    const lib = field('libraryKey');
    s.libraryName = lib.selectedOptions[0]?.dataset.title || s.libraryName;
    s.staticRatingKey = pendingPin.key;
    s.staticTitle = pendingPin.title;
    s.settingsPinHash = pendingAuth.hash;
    s.settingsPinSalt = pendingAuth.salt;
    return sanitize(s);
  }

  function syncPin() {
    const set = Boolean(pendingAuth.hash);
    const changed = pendingAuth.hash !== (getSettings().settingsPinHash || '');
    $('pin-status').textContent = set ? (changed ? 'set (saved with Settings)' : 'set') : changed ? 'removed (saved with Settings)' : 'not set';
    $('pin-set-btn').textContent = set ? 'Change PIN…' : 'Set PIN…';
    $('pin-clear-btn').hidden = !set;
  }

  function setTokenShown(shown) {
    field('plexToken').type = shown ? 'text' : 'password';
    $('token-toggle').textContent = shown ? 'Hide' : 'Show';
  }

  // ---- the rotation time: buttons in minutes over the stored seconds ----

  // `rotateSeconds` stays a (hidden) field holding the stored seconds, so everything that reads or writes the form by name
  // keeps working. The preset buttons (`rotatePreset`) and the Custom field (`rotateMinutes`) are UI only: they set it, and
  // write() sets them from it. A stored value that matches no preset opens as Custom; saving without touching it keeps it as is.
  function syncRotate() {
    const seconds = field('rotateSeconds').value;
    const preset = presetFor(seconds);
    for (const radio of form.querySelectorAll('input[name="rotatePreset"]')) radio.checked = radio.value === String(preset);
    $('rotate-custom').hidden = preset !== 'custom';
    if (preset === 'custom') field('rotateMinutes').value = formatMinutes(seconds);
  }

  function pickPreset(value) {
    if (value === 'custom') {
      $('rotate-custom').hidden = false;
      field('rotateMinutes').value = formatMinutes(field('rotateSeconds').value);
      return;
    }
    field('rotateSeconds').value = value;
    $('rotate-custom').hidden = true;
  }

  // ---- the "Connected to" card ----

  function renderConnected() {
    const selected = field('libraryKey').selectedOptions[0];
    const server = form.dataset.serverName || getSettings().serverName || 'your Plex server';
    const library = (selected?.value && selected.dataset.title) || (field('libraryKey').value && getSettings().libraryName) || '';
    $('connected-text').textContent = `Connected to ${server}${library ? ` · ${library}` : ''}`;
  }

  function renderConnection() {
    $('connected-card').hidden = connectionOpen;
    $('signin-controls').hidden = !connectionOpen; // the manual token and URL fold stays where it is: it is how a token is shown or exported
    renderConnected();
  }

  /** Shows the sign-in controls in place of the card. */
  function openConnection() {
    connectionOpen = true;
    renderConnection();
  }

  function syncDependent() {
    $('custom-frame-row').hidden = field('frameId').value !== CUSTOM_FRAME_ID;
    $('household-options').hidden = !$('household-toggle').checked;
    field('username').disabled = !field('showNowPlaying').checked;
    field('includeEpisodes').disabled = !field('showNowPlaying').checked;
    for (const out of form.querySelectorAll('output[data-for]')) {
      const v = Number(field(out.dataset.for).value);
      // Sizes and brightness are plain percentages; the offsets are signed.
      out.textContent = out.dataset.for === 'posterScale' || out.dataset.for === 'frameBrightness' ? `${v}%` : `${v > 0 ? '+' : ''}${v}%`;
    }
  }

  function ensureLibraryOption(key, title) {
    const select = field('libraryKey');
    if (!key || [...select.options].some((o) => o.value === key)) return;
    const o = new Option(title || `Library ${key}`, key);
    o.dataset.title = title || '';
    select.append(o);
  }

  /** Fills the list with the movie and TV libraries (titles only; counts follow lazily) and returns them. */
  function fillLibraries(libs, selected) {
    const select = field('libraryKey');
    const usable = libs.filter((l) => l.type === 'movie' || l.type === 'show');
    countRun++;
    select.replaceChildren(new Option('— choose a library —', ''));
    for (const l of usable) {
      const o = new Option(l.title, l.key);
      o.dataset.title = l.title;
      select.append(o);
    }
    const movie = usable.find((l) => l.type === 'movie');
    select.value = usable.some((l) => l.key === selected) ? selected : movie?.key || '';
    return usable;
  }

  /** "Movies · 1,240 titles": asked for after the list is on show and never waited for. A count that fails leaves the title alone. */
  function loadCounts(client, libs) {
    const run = countRun;
    for (const l of libs) {
      client.libraryCount(l.key).then((n) => {
        if (run !== countRun || n === null) return;
        const option = [...field('libraryKey').options].find((o) => o.value === l.key);
        if (option) option.textContent = `${l.title} · ${countLabel(n)}`;
      });
    }
  }

  /** The verdict line under the Test button; a failure carries the buttons that fix it (the same ones the empty card shows). */
  function setResult(text, kind) {
    $('test-result').replaceChildren(
      document.createTextNode(text),
      ...fixesFor(kind).map((fix) => actionButton(fix.label, () => runFix(fix.id), { primary: false })),
    );
  }

  async function testConnection() {
    if (testing) return false;
    const s = read();
    if (!s.serverUrl || !s.plexToken) {
      setResult('Enter a token and server URL first (or sign in).');
      return false;
    }
    if (location.protocol === 'https:' && s.serverUrl.startsWith('http:')) {
      setResult('This page is https, so the browser will block an http:// server. Use the plex.direct https address (Sign in finds it) or serve the app over http on your LAN.');
      return false;
    }
    setResult('Connecting…');
    testing = true;
    $('test-btn').disabled = true;
    try {
      const client = createPlexClient({ serverUrl: s.serverUrl, token: s.plexToken, clientId });
      const id = await client.identity();
      const libs = await client.libraries();
      const usable = fillLibraries(libs, s.libraryKey);
      form.dataset.serverName = id.name;
      setResult(`✓ ${id.name || 'Server'}${id.version ? ` (v${id.version.split('-')[0]})` : ''} — ${libs.length} libraries`);
      renderConnected();
      log.info(`Connection test OK: ${id.name}`);
      loadCounts(client, usable); // after the verdict: never part of it
      return true;
    } catch (err) {
      setResult(`✗ ${err.message}`, err.kind);
      log.warn(`Connection test failed: ${err.message}`);
      return false;
    } finally {
      testing = false;
      $('test-btn').disabled = false;
    }
  }

  // ---- Sign in with Plex (plex.tv/link PIN) ----

  /**
   * Signs in with a plex.tv code, shown in the sheet; or, given the `token` the empty card's code already earned, from
   * "Signed in" onwards. Either way the rest is the same: find the servers, pick the first reachable one, test it.
   */
  async function signIn({ token = null } = {}) {
    cancelSignIn();
    const ctrl = new AbortController();
    pinAbort = ctrl;
    openConnection();
    $('signin-panel').hidden = false;
    $('signin-btn').disabled = true;
    $('signin-status').textContent = token ? 'Signed in. Finding your servers…' : 'Requesting a code…';
    try {
      if (!token) {
        token = await pinSignIn(clientId, {
          signal: ctrl.signal,
          onCode: (code) => {
            $('signin-code').textContent = code;
            $('signin-status').textContent = 'Waiting for you to approve…';
          },
        });
        if (ctrl.signal.aborted) return;
        if (!token) {
          $('signin-status').textContent = 'Code expired — try again.';
          return;
        }
        $('signin-status').textContent = 'Signed in. Finding your servers…';
      }
      field('plexToken').value = token;
      servers = await discoverServers(clientId, token, { secureOnly: location.protocol === 'https:' });
      if (ctrl.signal.aborted) return;
      if (!servers.length) {
        $('signin-status').textContent = 'Signed in, but no reachable servers were found on this account.';
        return;
      }
      const select = $('server-select');
      select.replaceChildren(...servers.map((sv, i) => new Option(`${sv.name}${sv.owned ? '' : ' (shared)'}`, String(i))));
      $('server-pick').hidden = servers.length < 2;
      await useServer(0);
      $('signin-panel').hidden = true;
      log.info('Signed in with Plex');
    } catch (err) {
      $('signin-status').textContent = `Sign-in failed: ${err.message}`;
      log.warn(`Sign-in failed: ${err.message}`);
    } finally {
      $('signin-btn').disabled = false;
      if (pinAbort === ctrl) pinAbort = null;
    }
  }

  async function useServer(index) {
    const sv = servers[index];
    if (!sv) return;
    setResult(`Finding a working address for ${sv.name}…`);
    const uri = await firstReachable(sv.connections, sv.accessToken, clientId);
    if (!uri) {
      setResult(`✗ Couldn't reach ${sv.name} from this device.`);
      return;
    }
    field('plexToken').value = sv.accessToken;
    field('serverUrl').value = uri;
    form.dataset.serverName = sv.name;
    await testConnection();
  }

  function cancelSignIn() {
    pinAbort?.abort();
    pinAbort = null;
    $('signin-panel').hidden = true;
    $('signin-btn').disabled = false;
  }

  /**
   * Closes the sheet and hides the token in the same step. The dialog's own 'close' event (which also hides it) is queued
   * for a later task, so `dialog.open` is already false while it has not run yet: nothing may rely on that event alone.
   */
  function closeSheet() {
    setTokenShown(false);
    countRun++;
    dialog.close();
  }

  // ---- events ----

  form.addEventListener('input', (e) => {
    syncDependent();
    if (e.target.closest('[data-live]')) onPreview(read());
  });
  form.addEventListener('change', (e) => {
    syncDependent();
    if (e.target.closest('[data-live]')) onPreview(read());
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const s = read();
    s.serverName = form.dataset.serverName || s.serverName;
    const err = $('form-error');
    if (s.plexToken && s.serverUrl && !s.libraryKey && !s.staticRatingKey) {
      err.textContent = 'Choose a library (test the connection to load them).';
      return;
    }
    err.textContent = '';
    original = null;
    cancelSignIn();
    closeSheet();
    onSave(s);
  });

  $('settings-cancel').addEventListener('click', closeSheet);
  dialog.addEventListener('close', () => {
    setTokenShown(false); // the token is hidden again whenever the sheet closes
    cancelSignIn();
    if (original) onPreview(original); // undo live preview
    original = null;
  });

  $('signin-btn').addEventListener('click', () => signIn());
  $('connected-change').addEventListener('click', openConnection);
  field('libraryKey').addEventListener('change', renderConnected);

  // The preset buttons and the Custom field (UI only) set the stored seconds. A half-typed or junk entry leaves them alone.
  for (const radio of form.querySelectorAll('input[name="rotatePreset"]')) radio.addEventListener('change', () => radio.checked && pickPreset(radio.value));
  field('rotateMinutes').addEventListener('input', (e) => {
    field('rotateSeconds').value = String(secondsFromMinutes(e.target.value, field('rotateSeconds').value));
  });
  field('rotateMinutes').addEventListener('change', (e) => {
    e.target.value = formatMinutes(field('rotateSeconds').value); // shows what will be saved
  });
  $('signin-cancel').addEventListener('click', cancelSignIn);
  $('server-select').addEventListener('change', (e) => useServer(Number(e.target.value)));
  $('test-btn').addEventListener('click', testConnection);
  $('token-toggle').addEventListener('click', async () => {
    if (field('plexToken').type === 'password') {
      if (!(await requestPin()) || !dialog.open) return; // showing the token needs the PIN; hiding it does not
      setTokenShown(true);
    } else {
      setTokenShown(false);
    }
  });

  $('pin-set-btn').addEventListener('click', async () => {
    const auth = await choosePin();
    if (!auth || !dialog.open) return;
    pendingAuth = auth;
    syncPin();
  });
  $('pin-clear-btn').addEventListener('click', () => {
    pendingAuth = { hash: '', salt: '' };
    syncPin();
  });

  $('reset-layout').addEventListener('click', () => {
    const d = defaults();
    for (const k of LAYOUT_KEYS) field(k).value = d[k];
    syncDependent();
    onPreview(read());
  });

  $('unpin-btn').addEventListener('click', (e) => {
    pendingPin = { key: '', title: '' };
    e.target.hidden = true;
    $('pinned-title').textContent = 'none (unpinned on save)';
  });

  $('export-btn').addEventListener('click', async () => {
    const includeSecrets = $('export-secrets').checked;
    if (includeSecrets && !(await requestPin())) return; // the file would carry the token
    downloadJson('plex-poster-settings.json', toExport(read(), { includeSecrets }));
    if (includeSecrets) toast('Exported with your Plex token — keep that file private.');
  });

  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!(await requestPin())) return; // the gate sits on the file arriving, not on the button, so a scripted change event is gated too
    try {
      const s = fromImport(await file.text(), read());
      write(s);
      onPreview(s);
      toast('Settings imported — review and press Save.');
      log.info(`Imported settings from ${file.name}`);
    } catch (err) {
      $('form-error').textContent = `Import failed: ${err.message}`;
    }
  });

  $('clear-cache-btn').addEventListener('click', async () => {
    await onClearCache();
    toast('Poster cache cleared.');
  });

  $('reset-btn').addEventListener('click', async () => {
    if (!(await requestPin())) return;
    if (!confirm('Reset all settings, including your Plex token, and clear cached posters?')) return;
    original = null;
    closeSheet();
    onReset();
  });

  return {
    /**
     * Opens the sheet. `signIn` starts a plex.tv code in it at once (the fix for a rejected token); `token` is one the empty
     * card's code already earned, so the sheet picks up at "Signed in"; `test` runs the connection test even when it would not
     * run by itself.
     */
    open({ signIn: wantSignIn = false, token = null, test = false } = {}) {
      if (dialog.open) return;
      original = getSettings();
      $('form-error').textContent = '';
      $('test-result').replaceChildren();
      $('first-run-hint').hidden = isConfigured(original);
      form.dataset.serverName = original.serverName;
      write(original);
      setTokenShown(false);
      $('advanced').open = false;
      $('manual-connection').open = Boolean(original.plexToken && !original.serverName);
      dialog.showModal();
      if (token) signIn({ token });
      else if (wantSignIn) signIn();
      else if (test || (original.plexToken && original.serverUrl)) testConnection();
    },
    /** For the fix buttons, while the sheet is already open. */
    startSignIn: () => signIn(),
    test: () => testConnection(),
    get isOpen() {
      return dialog.open;
    },
  };
}
