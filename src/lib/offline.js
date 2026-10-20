// Local-first storage: everything the scanners need lives in localStorage so taps work with no internet.
import { api } from '../api.js';

const read = (k, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export const store = {
  students: () => read('students_db', []),
  setStudents: (v) => write('students_db', v),
  venue: () => read('venue_state', {}), // { [studentId]: 'INSIDE' | 'OUTSIDE' }
  setVenue: (v) => write('venue_state', v),
  events: () => read('sync_queue', []), // door taps waiting to upload
  setEvents: (v) => write('sync_queue', v),
};

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export async function refreshStudents() {
  const list = await api('/students');
  store.setStudents(list);
  return list;
}

// Only replace local door state when nothing is waiting to upload (otherwise we'd lose local taps)
export async function refreshVenue() {
  if (store.events().length) return null;
  const v = await api('/attendance/venue-state');
  store.setVenue(v);
  return v;
}

export function pendingCount(role) {
  return role === 'staff' || role === 'admin' ? store.events().length : 0;
}

// Uploads the door taps waiting on this phone. Safe to repeat: the server ignores duplicates.
export async function syncAll(role) {
  const events = role === 'staff' || role === 'admin' ? store.events() : [];
  if (!events.length) return { sent: 0 };

  const { accepted, rejected } = await api('/attendance/sync', { method: 'POST', body: { events } });

  const done = new Set(accepted.events);
  store.setEvents(store.events().filter((e) => !done.has(e.clientId)));
  return { sent: accepted.events.length, rejected };
}
