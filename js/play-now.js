// Play now (R-PLAY-1, R-CTRL-1; D65, D181, D191): the control button that starts the title on screen on one of this display's allowed Plex players.
//
// Three parts, none of which sends anything by itself:
//  - the decisions, pure functions of plain inputs: which poster has the button, what a press may do, what to ask the person, and what may be
//    sent at the moment of sending (`showsButton`, `pressDecision`, `chooseStep`, `decideSend`) with the words they say (`refusalText`, `playingText`,
//    `failureText`, `notCheckedText`);
//  - the flow (`createPlayNow`), which runs one press from the click to the answer in the order D191 3 to 6 fix, through the page's callbacks;
//  - the chooser dialog (`createChooser`), the only part that touches the page, and only when it is called.
// `send` inside the flow is the ONE way a command leaves this module: it re-checks the limit in force and the allowed list as they are now, and then
// calls the `play` callback, which goes to the poster's own Plex server. Nothing here contacts a player, and no token appears in any text.

import { allows, ratingRank } from './ratings.js';
import { PLAYER_STATES } from './settings.js';

/** The kinds of Plex item that can be played from a poster (D191 7): a show or a season is not one. */
export const PLAYABLE_KINDS = ['movie', 'episode'];

/** What a person reads as the time into a title: "23:20" or "1:23:45". */
export function clockText(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const two = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(total % 60)}` : `${m}:${two(total % 60)}`;
}

// ---- the decisions ----

/**
 * Does this poster have the button (D191 7)? A movie or an episode from a Plex server, that is not the now-playing poster, while at least one device is
 * allowed. `poster` is the descriptor on screen (or null), `serverType` the type of the server it came from, `allowed` the allowed list.
 */
export function showsButton({ poster, serverType, allowed }) {
  return (
    Boolean(poster) &&
    serverType === 'plex' &&
    PLAYABLE_KINDS.includes(poster.kind) &&
    Boolean(poster.playKey) &&
    poster.source !== 'now-playing' &&
    Array.isArray(allowed) &&
    allowed.length > 0
  );
}

/**
 * May a title with this rating be played under `limit`, the limit in force (D191 1, 2)? It is `allows()` and nothing else: a pinned title is no exception,
 * an unrated one is refused under a limit, no limit allows everything. `reason` says which refusal: 'unrated' (no rating this display can read) or 'limit'.
 */
export function limitVerdict(limit, rating) {
  if (allows(limit, rating)) return { ok: true };
  return { ok: false, reason: ratingRank(rating) === null ? 'unrated' : 'limit' };
}

/**
 * What a press does first. `{ outcome: 'hidden' }`: the button is not there, nothing happens. `{ outcome: 'refused', reason, message }`: the limit in force
 * does not allow the title, so nothing else happens (no PIN, no read, no request). `{ outcome: 'ask' }`: go on with the PIN (when one is set).
 */
export function pressDecision({ poster, serverType, limit, allowed }) {
  if (!showsButton({ poster, serverType, allowed })) return { outcome: 'hidden' };
  const verdict = limitVerdict(limit, poster.contentRating);
  if (!verdict.ok) return { outcome: 'refused', reason: verdict.reason, message: refusalText(poster.title, verdict.reason) };
  return { outcome: 'ask' };
}

/** What each state of an allowed device means when someone is choosing one to play on (D191 5): the words of the Allowed devices list, where they say the same. */
export const PICK_MEANINGS = {
  offline: 'not connected now, so it cannot be picked',
  unavailable: PLAYER_STATES.unavailable,
  'not checked': PLAYER_STATES['not checked'],
};

/**
 * After the PIN and the two reads: what to do next (D191 5, 6). `allowed` is the allowed list, `listed` what plex.tv says (`[{ id, name, present }]`) or null
 * when it could not be read, `position` the saved position in ms (0 for none). Only allowed devices are ever shown or sent to: a player plex.tv lists
 * that is not on the list is not here at all. A device is `pickable` unless plex.tv says it is offline or no longer on the account; when plex.tv was not
 * read every device is "not checked" and pickable. `{ step: 'send', device }` is for exactly one allowed device, plex.tv read, that is present,
 * with no saved position; anything else is `{ step: 'menu', devices, resume, checked }`, where `resume` is `{ ms, text }` when there is a saved position.
 */
export function chooseStep({ allowed, listed, position }) {
  const checked = Array.isArray(listed);
  const byId = new Map(checked ? listed.map((p) => [p.id, p]) : []);
  const devices = allowed
    .map((a) => {
      const now = byId.get(a.id);
      const state = !checked ? 'not checked' : !now ? 'unavailable' : now.present ? '' : 'offline';
      return { id: a.id, name: now?.name || a.name || a.id, state, meaning: state ? PICK_MEANINGS[state] : '', pickable: state === '' || state === 'not checked' };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const resume = Number.isFinite(position) && position > 0 ? { ms: Math.round(position), text: clockText(position) } : null;
  if (checked && devices.length === 1 && devices[0].pickable && !resume) return { step: 'send', device: devices[0] };
  return { step: 'menu', devices, resume, checked };
}

/**
 * The check at the moment of sending (D191 3, D193 1), on what is true NOW: `limit` is the limit in force now resolved from the stored settings and `allowed` the allowed
 * list as it is stored now; `pageLimit` and `pageAllowed` are the same as this page's own settings give them (a Save a full store did not take leaves the two apart), and
 * the title and the device must pass both.
 * The title is the one that was pressed (`poster`), the device the one picked (`deviceId`; `device` is its row of `chooseStep`, which says whether it can be picked).
 * `{ ok: true, target, offset }`: `target` is the client identifier
 * from the allowed list, and `offset` the position in ms, which is `position` when the person chose to resume (and there is one) and 0 otherwise
 * ("Play from start"). `{ ok: false, reason, message }` otherwise: nothing is sent.
 */
export function decideSend({ poster, limit, pageLimit = limit, allowed, pageAllowed = allowed, deviceId, device, resumeChosen, position }) {
  // The title must pass the limit in force as the stored settings give it AND as this page's own give it; the device must be on both allowed lists (D193 1).
  const verdict = [limit, pageLimit].map((l) => limitVerdict(l, poster.contentRating)).find((v) => !v.ok) ?? { ok: true };
  if (!verdict.ok) return { ok: false, reason: verdict.reason, message: refusalText(poster.title, verdict.reason) };
  const name = device?.name || 'That device';
  const onList = (list) => (Array.isArray(list) ? list : []).find((a) => a.id === deviceId);
  const entry = onList(allowed);
  if (!entry || !onList(pageAllowed)) return { ok: false, reason: 'device', message: `${name} is no longer on this display's list of allowed devices, so nothing was sent.` };
  if (!device?.pickable) return { ok: false, reason: 'unpickable', message: `${name} can't be picked${device?.state ? ` (${device.state}: ${device.meaning})` : ''}, so nothing was sent.` };
  return { ok: true, target: entry.id, offset: resumeChosen && Number.isFinite(position) && position > 0 ? Math.round(position) : 0 };
}

// ---- the words: what happened and what helps, with no status code, no address and no token ----

/** Why a title is not played (D191 1, 2). */
export function refusalText(title, reason) {
  return reason === 'unrated'
    ? `"${title}" has no rating this display can read, and a rating limit is set, so it can't be played from here.`
    : `"${title}" is rated above this display's limit, so it can't be played from here.`;
}

/** What was started (D191 3): the title pressed, on the device picked, and from where. */
/** The Diagnostics line of a command the server accepted (D201): what the command carried and what the server answered. No code beyond the answer's own, no address, no token. */
export const acceptedText = ({ title, device, server, sent }) => {
  const parts = sent && typeof sent === 'object' ? [`play queue: ${sent.queue ? 'yes' : 'no'}`, `token for the player: ${sent.token ? 'yes' : 'no'}`, `the answer: ${sent.reply || 'empty'}`] : [];
  return `Play now: ${server} accepted the command to play "${title}" on ${device}${parts.length ? ` (${parts.join(', ')})` : ''}.`;
};
/** The Diagnostics line of the check after a command (D201): what the server shows the player doing. */
export const confirmText = ({ device, server, state }) =>
  state === 'nothing'
    ? `Play now: a few seconds later ${server} shows nothing playing on ${device}. The player took the command and did not start.`
    : state === 'unknown'
      ? `Play now: ${server} could not be asked what ${device} is doing.`
      : `Play now: a few seconds later ${server} shows ${device} ${state}.`;
/** What kind of failure a send was, for Diagnostics: the kind and the HTTP status when there is one. */
export const sendErrorDetail = (error) => [error?.kind || 'unexpected', error?.status ? `HTTP ${error.status}` : ''].filter(Boolean).join(', ');
export const playingText = (title, device, offset) => `Playing "${title}" on ${device}${offset > 0 ? `, from ${clockText(offset)}` : ''}.`;

/** The devices on both allowed lists, as the stored list names them: Play now offers a device only when it is on the stored list and on this page's own, as the send requires (D194 4). */
export const onBothLists = (stored, page) => (Array.isArray(stored) ? stored : []).filter((a) => (Array.isArray(page) ? page : []).some((p) => p.id === a.id));

/** What is said while a wait is on (D192 3): the answer replaces it. */
export const CHECKING_TEXT = 'Checking your devices…';
export const sendingText = (title, device) => `Sending "${title}" to ${device}…`;
export const STILL_WORKING_TEXT = 'Play now is still working…';
/** A Play now another dialog or a rebuilt connection ended before its request was handed over (D193 4). */
export const STOPPED_TEXT = 'Play now was stopped, so nothing was sent.';

/**
 * Why plex.tv's list could not be used (D188 2, D189 3, D192): the dialog says which server's account, which of four things happened, in plain words, and what
 * helps, as the Allowed devices section does. `error` is what `readPlayers` rejected with (`error.failed` is `[{ kind, slots }]`, the places in the household's
 * server list of the servers whose account failed) and `nameOf(slot)` the name of the server in that place; an error that names none reads "your Plex account".
 */
export function notCheckedText(error, nameOf = () => '') {
  const failed = error?.failed?.length ? error.failed : [{ kind: error?.kind, slots: [] }];
  const said = failed.map(({ kind, slots }) => {
    const names = [...new Set(slots.map(nameOf).filter(Boolean))];
    const who = (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`) || 'your Plex account';
    const head = `Could not read the players of ${who}:`;
    if (kind === 'network' || kind === 'timeout') return `${head} plex.tv did not answer.`;
    if (kind === 'server') return `${head} plex.tv had a problem and could not answer. Try again later.`;
    if (kind === 'auth') return `${head} plex.tv refused the sign-in. Sign in to ${who} again in Settings.`;
    return `${head} plex.tv answered with something that could not be read.`;
  });
  return `${said.join(' ')} These devices are not checked, so you can still pick one.`;
}

/**
 * What a failure says. `step` is 'position' (the saved position could not be read), 'prepare' (the server's identifier could not be read, so nothing was
 * sent: it is read before the last check) or 'send' (the answer to the play request itself). The words come from the kind of the error, never from its message:
 * at step 'send' 'timeout' and 'network' both say it is not known whether the player started (a connection can be lost after the server took the command, and the
 * browser cannot tell a connection never made from one lost afterwards; D195), 'auth' that it refused the sign-in, an 'http' error of 5xx that the server had a problem and did not
 * pass the command on (D192 6), any other 'http' error that it could not reach the player, and an answer to the play request that could not be read says it is
 * not known whether the player started.
 */
export function failureText({ step, error, title, device, server }) {
  const kind = error?.kind;
  if (step === 'position') {
    const lead = `Could not read where you stopped watching "${title}", so nothing was sent.`;
    if (kind === 'network' || kind === 'timeout') return `${lead} ${server} did not answer. Try again in a moment.`;
    if (kind === 'auth') return `${lead} ${server} refused the sign-in. Sign in to ${server} again in Settings.`;
    if (kind === 'config') return `${lead} ${server} is not available any more.`;
    return `${lead} Try again in a moment.`;
  }
  if (step === 'prepare') {
    if (kind === 'network' || kind === 'timeout') return `${server} did not answer, so nothing was sent to ${device}. Try again in a moment.`;
    if (kind === 'auth') return `${server} refused the sign-in, so nothing was sent to ${device}. Sign in to ${server} again in Settings.`;
    if (kind === 'config') return `${server} is not available any more, so nothing was sent.`;
    return `${server} did not say who it is, so nothing was sent to ${device}. Try again in a moment.`;
  }
  // The play request itself: no answer in time, or a connection that failed, says nothing about whether the server took the command first, so it is not known
  // whether the device started (D193 3, D195).
  if (kind === 'timeout' || kind === 'network') return `${server} did not answer in time, so it is not known whether ${device} started "${title}". Look at ${device} before you try again.`;
  if (kind === 'auth') return `${server} refused the sign-in, so "${title}" was not sent to ${device}. Sign in to ${server} again in Settings.`;
  if (kind === 'http' && error?.status >= 500) return `${server} had a problem and did not pass "${title}" on to ${device}. Try again later.`;
  if (kind === 'http') return `${server} could not reach ${device}, so "${title}" was not started. Check that ${device} is on and on the same network.`;
  if (kind === 'config') return `${server} is not available any more, so nothing was sent.`;
  return `${server} answered with something this display could not read, so it is not known whether ${device} started "${title}".`;
}

/** How long a failure or a refusal stays on screen (D192 6); a success and a wait use the toast's own times. */
export const FAILURE_MS = 15_000;

// ---- the flow ----

/**
 * One Play now at a time, from the press to the answer (D191 3 to 6, D192). The page's callbacks:
 *   getPoster()            the poster on screen now, or null
 *   serverTypeOf(poster)   the type of the server the poster came from ('plex', 'jellyfin', 'emby'), '' when none
 *   serverName(poster)     the name people know that server by
 *   nameOfSlot(slot)       the name of the server in that place of the household's list (for the note about plex.tv)
 *   getLimit()             the limit in force now, from this page's settings: the press-time check
 *   getStoredLimit()       the limit in force now, resolved from the settings as they are STORED now (household, time slot, profile): the send-time check, with `getLimit()` (D192 2, D193 1)
 *   getAllowed()           the allowed list as it is stored now
 *   getPageAllowed()       the allowed list as this page's own settings hold it (the button, the dialog and the send need the device on both lists)
 *   dropStopped()          forgets a "stopped" line that is still held: a new Play now has begun
 *   requestPin()           resolves true at once when no PIN is set, otherwise when the right PIN is given; false when cancelled
 *   cancelPin()            closes an open PIN question
 *   readPlayers()          plex.tv's players: `{ accounts, players }`, or rejects
 *   savedPosition(poster)  the saved position in ms, or rejects
 *   prepare(poster)        what the command needs from the poster's server and the network (its machine identifier), or rejects; read BEFORE the send-time check
 *   play({ poster, target, offset, machineIdentifier })  asks the poster's own server to play; it starts the request in the turn it is called; resolves or rejects with a SourceError
 *   hasSource()            whether a source is built (a display with nothing configured has none)
 *   otherDialogOpen()      whether any dialog is open (D192 5)
 *   choose(model)          shows the chooser; resolves `{ id, resume }` or null (cancelled)
 *   closeChoice()          closes the chooser, resolving it null
 *   focusBack()            puts focus where a Play now ends: the button, or Pin when the button has left the row
 *   say(text, { ms, later, reached })  tells the person, in words (`ms` 0: until replaced; `later`: the line that says it was stopped, which the page holds while a dialog
 *                          covers it and drops when another notice is up; `reached`: the answer of a request that reached the server, which the page holds while a dialog covers it, with `replaces`, the wait's words it takes off meanwhile)
 *   unsay(text)            takes `text` off the screen when it is still what is shown
 *   onChange()             the flow opened or closed (the button follows `busy`)
 * A late answer (the PIN, plex.tv, the position, the server's identifier) counts only while its flow is still the open one: `cancel()` ends it when the source is
 * rebuilt or another dialog opens. Once `play` has been called, `cancel()` no longer ends the flow: it stays busy until the answer, which is told.
 */
export function createPlayNow(deps) {
  const { getPoster, serverTypeOf, serverName, nameOfSlot, getLimit, getStoredLimit, getAllowed, getPageAllowed, dropStopped, requestPin, cancelPin, readPlayers, savedPosition, prepare, play, hasSource, otherDialogOpen, choose, closeChoice, focusBack, say, unsay, onChange, note = () => {} } = deps;
  let flow = null; // the open flow, or null
  let shown = ''; // the words of a wait that are on screen and that nothing has replaced

  const live = (f) => flow === f;
  const changed = () => onChange?.();
  /** A wait's words: they stay until the answer replaces them. */
  const wait = (f, text) => {
    f.line = text;
    shown = text;
    say(text, { ms: 0 });
  };
  const clearWait = () => {
    if (flow) flow.line = '';
    if (!shown) return;
    unsay(shown);
    shown = '';
  };
  /** The answer: it replaces the wait's words; a failure or a refusal stays longer than a success. */
  const answer = (text, ms, reached = false) => {
    const replaces = shown; // the wait's words still on screen: a held answer takes them off
    shown = '';
    say(text, { ...(ms ? { ms } : {}), ...(reached ? { reached, replaces } : {}) });
  };
  /** A failure or a refusal, on screen and in Diagnostics (D201): the words hold no code, no address and no token. */
  const fail = (text) => {
    note('warn', text);
    answer(text, FAILURE_MS);
  };
  /** The device offered: on the stored list and on this page's own (D194 4). */
  const offered = () => onBothLists(getAllowed(), getPageAllowed());

  async function send(f, deviceId, resumeChosen) {
    if (!live(f)) return;
    const device = f.devices.get(deviceId);
    if (!shown) wait(f, CHECKING_TEXT); // after a pick the dialog has taken the line off: it is checking again until the last check has passed
    // Everything the command needs from the network is read here, BEFORE the check below; the check is then followed by the request with nothing awaited between.
    let machineIdentifier;
    try {
      machineIdentifier = await prepare(f.poster);
    } catch (error) {
      if (live(f)) fail(failureText({ step: 'prepare', error, title: f.poster.title, device: device?.name || 'the device', server: f.server }));
      return;
    }
    if (!live(f)) return;
    const verdict = decideSend({ poster: f.poster, limit: getStoredLimit(), pageLimit: getLimit(), allowed: getAllowed(), pageAllowed: getPageAllowed(), deviceId, device, resumeChosen, position: f.position });
    if (!verdict.ok) return fail(verdict.message);
    f.sending = true;
    wait(f, sendingText(f.poster.title, device.name)); // the last check has passed and the request goes in this same turn
    // From here on the server may have taken the command: its answer is told wherever the person is looking, so it is marked `reached` (D194 3).
    let sent;
    try {
      sent = await play({ poster: f.poster, target: verdict.target, offset: verdict.offset, machineIdentifier });
    } catch (error) {
      const text = failureText({ step: 'send', error, title: f.poster.title, device: device.name, server: f.server });
      note('warn', `${text} (${sendErrorDetail(error)})`);
      return answer(text, FAILURE_MS, true);
    }
    // Diagnostics (D201): what was sent and what the server answered, then what the server shows the player doing a few seconds later.
    note('info', acceptedText({ title: f.poster.title, device: device.name, server: f.server, sent }));
    if (typeof sent?.confirm === 'function') {
      Promise.resolve()
        .then(() => sent.confirm())
        .then((state) => note(state === 'nothing' ? 'warn' : 'info', confirmText({ device: device.name, server: f.server, state })))
        .catch(() => {});
    }
    answer(playingText(f.poster.title, device.name, verdict.offset), 0, true);
  }

  async function run(f) {
    f.awaitingPin = true;
    const pinOk = await requestPin();
    f.awaitingPin = false;
    focusBack(); // the PIN prompt is gone: focus is back where the press was, or on Pin when the button left the row
    if (!pinOk) return; // a wrong or cancelled PIN: nothing more, and no device has been shown
    if (!live(f)) return;
    wait(f, CHECKING_TEXT);
    const [players, position] = await Promise.allSettled([readPlayers(), savedPosition(f.poster)]);
    if (!live(f)) return;
    if (position.status === 'rejected') return fail(failureText({ step: 'position', error: position.reason, title: f.poster.title, server: f.server }));
    f.position = position.value;
    const allowed = offered();
    if (!allowed.length) return fail('No device is allowed on this display any more, so nothing was sent.');
    const step = chooseStep({ allowed, listed: players.status === 'fulfilled' ? players.value.players : null, position: position.value });
    f.devices = new Map((step.step === 'send' ? [step.device] : step.devices).map((d) => [d.id, d]));
    if (step.step === 'send') return send(f, step.device.id, false);
    clearWait(); // the dialog takes over from "Checking your devices…"
    f.choosing = true;
    const picked = await choose({ title: f.poster.title, devices: step.devices, resume: step.resume, checked: step.checked, note: step.checked ? '' : notCheckedText(players.reason, nameOfSlot) });
    f.choosing = false;
    if (!picked) return; // Cancel or Escape: nothing is sent (a pick that comes after the flow ended is stopped by `send`)
    return send(f, picked.id, picked.resume);
  }

  return {
    /** True while a Play now is open or sending: another press does nothing but say it is still working. */
    get busy() {
      return flow !== null;
    },

    /** True while the flow waits for the PIN: that PIN prompt is its own. */
    get awaitingPin() {
      return flow?.awaitingPin === true;
    },

    /** A press of the button. */
    async press() {
      if (flow) return wait(flow, flow.line || STILL_WORKING_TEXT); // one flow at a time, and a press never does nothing silently
      if (!hasSource() || otherDialogOpen()) return;
      const poster = getPoster();
      const decision = pressDecision({ poster, serverType: poster ? serverTypeOf(poster) : '', limit: getLimit(), allowed: offered() });
      if (decision.outcome === 'hidden') return;
      if (decision.outcome === 'refused') return fail(decision.message); // no PIN, no read, no request
      // The title on screen now is the title of this flow, whatever the display shows next.
      const mine = {
        poster: { ratingKey: poster.ratingKey, playKey: poster.playKey, kind: poster.kind, title: poster.title, contentRating: poster.contentRating },
        server: serverName(poster),
        devices: new Map(),
        position: 0,
        line: '',
        awaitingPin: false,
        choosing: false,
        sending: false,
      };
      dropStopped();
      flow = mine;
      changed();
      try {
        await run(mine);
      } catch {
        if (flow === mine) fail('Play now could not finish, so nothing was sent. Try again.');
      } finally {
        if (flow === mine) {
          clearWait();
          flow = null;
        }
        changed();
      }
    },

    /**
     * The poster's server changed or another dialog opened under an open flow: it ends, says in one line that it was stopped and nothing was sent (where it can be
     * read: `later`, so the page holds the line while a dialog covers it), and what is still on its way is ignored. It closes only what the flow itself opened: its own PIN prompt while it waits for it, and its
     * chooser while that is open; a PIN prompt of another action is not its to close. A request already handed to the server is not taken back: that flow stays
     * busy until the answer, which is told (D192 1).
     */
    cancel() {
      if (!flow || flow.sending) return;
      const f = flow;
      clearWait();
      flow = null;
      if (f.awaitingPin) cancelPin();
      if (f.choosing) closeChoice();
      say(STOPPED_TEXT, { ms: FAILURE_MS, later: true });
      changed();
    },
  };
}

// ---- the chooser dialog (the page's part) ----

/**
 * The small dialog that asks which device, and where to start. `dialog` is the `<dialog id="play-now">` of index.html. `open(model)` shows it and resolves
 * `{ id, resume }` (the device picked and whether to resume) or null when it is cancelled by Cancel, Escape or `close()`; it closes before it resolves, and
 * `onClosed()` runs then (the page puts focus back on the Play now button). `model` is `{ title, devices, resume, checked, note }` (see `chooseStep`).
 * A device that cannot be picked is drawn with `aria-disabled` (so it can still be reached and read out) and does nothing when pressed.
 */
export function createChooser({ dialog, onClosed }) {
  const $ = (sel) => dialog.querySelector(sel);
  let pending = null;

  function finish(result) {
    const p = pending;
    if (!p) return;
    pending = null;
    if (dialog.open) dialog.close();
    onClosed?.();
    p(result);
  }

  $('#play-now-cancel').addEventListener('click', () => finish(null));
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault(); // Escape: the dialog closes through finish(), so the answer and the focus follow one path
    finish(null);
  });
  // Tab and Shift+Tab go round inside the dialog: past the last control to the first and back, never out to the page or the browser behind it.
  dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
    const stops = [...dialog.querySelectorAll('input[type="radio"]:checked, button')].filter((el) => el.getClientRects().length);
    const at = stops.indexOf(document.activeElement);
    const wrapTo = e.shiftKey ? (at <= 0 ? stops.at(-1) : null) : at === stops.length - 1 ? stops[0] : null;
    if (!wrapTo) return;
    e.preventDefault();
    wrapTo.focus();
    wrapTo.scrollIntoView({ block: 'nearest' });
  });
  dialog.addEventListener('click', (e) => {
    const button = e.target.closest?.('.play-device');
    if (!button || button.getAttribute('aria-disabled') === 'true') return;
    finish({ id: button.dataset.id, resume: $('#play-now-resume-radio').checked });
  });

  return {
    open({ title, devices, resume, note }) {
      return new Promise((resolve) => {
        pending = resolve;
        $('#play-now-lead').textContent = `Play "${title}" on which device?`;
        const noteEl = $('#play-now-note');
        noteEl.textContent = note;
        noteEl.hidden = !note;
        $('#play-now-start').hidden = !resume;
        $('#play-now-resume-text').textContent = resume ? `Resume at ${resume.text}` : '';
        $('#play-now-resume-radio').checked = true;
        $('#play-now-devices').replaceChildren(
          ...devices.map((d, i) => {
            const li = document.createElement('li');
            li.className = 'player-row';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn play-device';
            button.dataset.id = d.id;
            button.textContent = d.name;
            button.setAttribute('aria-label', `Play "${title}" on ${d.name}`);
            li.append(button);
            if (d.state) {
              const state = document.createElement('p');
              state.className = 'player-state muted small';
              state.id = `play-now-state-${i}`;
              state.dataset.state = d.state;
              state.textContent = `${d.state}: ${d.meaning}`;
              li.append(state);
              button.setAttribute('aria-describedby', state.id);
            }
            if (!d.pickable) button.setAttribute('aria-disabled', 'true');
            return li;
          }),
        );
        dialog.showModal();
        const first = $('.play-device:not([aria-disabled="true"])') || $('#play-now-cancel');
        first.focus();
        first.scrollIntoView({ block: 'nearest' });
      });
    },
    close: () => finish(null),
  };
}
