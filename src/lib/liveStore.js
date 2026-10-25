// One shared connection for the whole app. Pages subscribe to topics ("resources", "door", "users");
// when a topic's counter changes on the server, the pages that care reload their data.
//
// Two ways to learn that a counter changed:
//  - Push (when Neon Realtime is set up on the server): a live connection delivers changes as they
//    commit. GET /api/live is then called only about once a minute, to renew the 60-second sealed
//    query and as a safety net.
//  - Poll (always available, and the fallback): GET /api/live every few seconds.
// Polling pauses while the tab is hidden and resumes as soon as it is visible again.
import { api } from '../api.js';
import { changedTopics } from './logic.js';

export const FAST_MS = 3000;  // polling pace while there is no live connection
export const SLOW_MS = 10000; // polling pace while the server cannot be reached
export const RENEW_BEFORE_MS = 10000; // renew the sealed query this long before it expires
// Limits on the gap between /live calls while push is live
export const MIN_PUSH_POLL_MS = 5000;
export const MAX_PUSH_POLL_MS = 50000;

const changeListeners = new Set(); // (changedTopics) => void
const buildListeners = new Set();  // (buildId) => void
let authLost = null;               // called when the server says this login is no longer valid

let holders = 0;      // number of subscribers; polling runs only while there is at least one
let running = false;
let inFlight = false; // a /live request is in progress, so never start a second one
let timer = null;
let snapshot = null;  // last counters we saw
let failures = 0;     // failed check-ins in a row
let lastBuild = null; // given straight away to anyone who subscribes later

// Live connection (Neon Realtime)
let pushClient = null;
let pushUrl = null;
let pushSub = null;
let pushLive = false;   // the live connection is delivering authoritative results right now
let pushBroken = false; // could not even be set up: stop trying for this page load
let pushPollMs = MAX_PUSH_POLL_MS;

// Server messages that mean this login is no longer valid
const AUTH_ERRORS = /not authenticated|invalid or expired|no longer exists/i;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const visible = () => document.visibilityState === 'visible';

// Compare with what we last saw and tell the pages whose data changed. Both push and polling use this,
// so the same change arriving twice (push, then a poll) is only announced once.
// The very first result only sets the baseline, so nothing is announced then.
function applyTopics(next) {
  if (snapshot) {
    const changed = changedTopics(snapshot, next);
    if (changed.length) changeListeners.forEach((fn) => fn(changed));
  }
  snapshot = next;
}

// Back off when the server is failing; relax to renewal pace while push is live
const nextDelay = () => (failures ? SLOW_MS : pushLive ? pushPollMs : FAST_MS);

function reschedule() {
  if (!running || inFlight) return;
  clearTimeout(timer);
  timer = setTimeout(poll, nextDelay());
}

// Push (Neon Realtime)

function onPush({ status, data }) {
  const live = status === 'live';
  // Rows are only authoritative while "live". While hidden we ignore them: the check that runs when
  // the tab comes back compares against our old snapshot and catches up on everything missed.
  if (live && data && visible()) applyTopics(Object.fromEntries(data.map((row) => [row.topic, Number(row.version)])));
  if (pushLive === live) return;
  pushLive = live;
  if (live) failures = 0;
  reschedule(); // live: slow down to renewal pace; not live: back to fast polling
}

// Start the live connection, or renew the sealed query so it does not expire.
async function syncPush(realtime, serverNow) {
  try {
    // Time the next renewal by the SERVER's clock, so a wrong clock on this device cannot cause a request storm
    pushPollMs = clamp(realtime.query.expiresAt - serverNow - RENEW_BEFORE_MS, MIN_PUSH_POLL_MS, MAX_PUSH_POLL_MS);

    const state = pushSub?.getState?.().status;
    if (pushSub && (state === 'error' || state === 'closed')) {
      pushSub.unsubscribe();
      pushSub = null;
      pushLive = false;
    }
    if (!pushSub) {
      if (!pushClient || pushUrl !== realtime.url) {
        pushClient?.close();
        const { createRealtimeClient } = await import('@neon/realtime/client'); // only loaded when push is on
        if (!running) return;
        pushClient = createRealtimeClient({ url: realtime.url });
        pushUrl = realtime.url;
      }
      pushSub = pushClient.subscribe(realtime.query);
      pushSub.onChange(onPush);
    } else {
      await pushSub.renew(realtime.query);
    }
  } catch {
    // Never let the live connection take the app down: if it could not be set up, keep polling.
    if (!pushSub) pushBroken = true;
  }
}

function closePush() {
  try { pushSub?.unsubscribe(); } catch { /* already closed */ }
  try { pushClient?.close(); } catch { /* already closed */ }
  pushSub = null;
  pushClient = null;
  pushUrl = null;
  pushLive = false;
  pushBroken = false;
}

// The check-in request (GET /api/live)

async function poll() {
  timer = null;
  if (!running || inFlight) return;
  // A hidden tab skips the request; wake() checks right away when it is visible again
  if (visible()) {
    inFlight = true;
    try {
      const { topics = {}, build = null, now = Date.now(), realtime = null } = await api('/live');
      failures = 0;
      applyTopics(topics);
      if (build) {
        lastBuild = build;
        buildListeners.forEach((fn) => fn(build));
      }
      if (realtime && !pushBroken) await syncPush(realtime, now);
    } catch (err) {
      if (AUTH_ERRORS.test(err.message)) authLost?.(); // login is no longer valid: let the app sign out
      failures += 1;
    } finally {
      inFlight = false;
    }
  }
  if (running) timer = setTimeout(poll, nextDelay());
}

// Back on screen or back online: check right away instead of waiting for the next timer tick
function wake() {
  if (!running || !visible()) return;
  clearTimeout(timer);
  poll();
}

function start() {
  running = true;
  failures = 0;
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  poll();
}

function stop() {
  running = false;
  clearTimeout(timer);
  timer = null;
  snapshot = null;
  failures = 0;
  lastBuild = null;
  closePush();
  document.removeEventListener('visibilitychange', wake);
  window.removeEventListener('online', wake);
}

// Polling starts with the first subscriber and stops with the last
const hold = () => { if (holders++ === 0) start(); };
const release = () => { if (--holders === 0) stop(); };

export const setAuthLostHandler = (fn) => { authLost = fn; };

export function onChange(fn) {
  changeListeners.add(fn);
  hold();
  return () => { changeListeners.delete(fn); release(); };
}
export function onBuild(fn) {
  buildListeners.add(fn);
  hold();
  if (lastBuild) fn(lastBuild);
  return () => { buildListeners.delete(fn); release(); };
}
