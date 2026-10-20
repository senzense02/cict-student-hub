// One shared poller for the whole app. Pages subscribe to topics ("resources", "door", "users");
// when a topic's counter moves on the server, the pages that care refresh their data.
// Polling pauses while the tab is hidden and resumes the moment it is visible again.
import { api } from '../api.js';
import { changedTopics } from './logic.js';

export const FAST_MS = 3000;  // how often an open, visible page checks for changes
export const SLOW_MS = 10000; // while the server cannot be reached

const changeListeners = new Set(); // (changedTopics) => void
const statusListeners = new Set(); // (connected: boolean) => void
const buildListeners = new Set();  // (buildId) => void
let authLost = null;               // called when the server says this login is no longer valid

let holders = 0;
let running = false;
let inFlight = false;
let timer = null;
let snapshot = null; // last counters we saw
let failures = 0;
let connected = null; // null until the first answer
let lastBuild = null;

const AUTH_ERRORS = /not authenticated|invalid or expired|no longer exists/i;

function setConnected(value) {
  if (connected === value) return;
  connected = value;
  statusListeners.forEach((fn) => fn(value));
}

async function poll() {
  timer = null;
  if (!running || inFlight) return;
  if (document.visibilityState === 'visible') {
    inFlight = true;
    try {
      const { topics = {}, build = null } = await api('/live');
      failures = 0;
      setConnected(true);
      if (snapshot) {
        const changed = changedTopics(snapshot, topics);
        if (changed.length) changeListeners.forEach((fn) => fn(changed));
      }
      snapshot = topics;
      if (build) {
        lastBuild = build;
        buildListeners.forEach((fn) => fn(build));
      }
    } catch (err) {
      if (AUTH_ERRORS.test(err.message)) authLost?.();
      failures += 1;
      if (failures >= 2) setConnected(false);
    } finally {
      inFlight = false;
    }
  }
  if (running) timer = setTimeout(poll, failures ? SLOW_MS : FAST_MS);
}

// Back on screen or back online: check right away instead of waiting for the next tick
function wake() {
  if (!running || document.visibilityState !== 'visible') return;
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
  connected = null;
  lastBuild = null;
  document.removeEventListener('visibilitychange', wake);
  window.removeEventListener('online', wake);
}

const hold = () => { if (holders++ === 0) start(); };
const release = () => { if (--holders === 0) stop(); };

export const getStatus = () => connected;
export const setAuthLostHandler = (fn) => { authLost = fn; };

export function onChange(fn) {
  changeListeners.add(fn);
  hold();
  return () => { changeListeners.delete(fn); release(); };
}
export function onStatus(fn) {
  statusListeners.add(fn);
  hold();
  return () => { statusListeners.delete(fn); release(); };
}
export function onBuild(fn) {
  buildListeners.add(fn);
  hold();
  if (lastBuild) fn(lastBuild);
  return () => { buildListeners.delete(fn); release(); };
}
