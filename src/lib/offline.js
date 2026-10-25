// Local-first storage: everything the scanners need lives in localStorage so taps work with no internet.
import { api } from '../api.js';

// Blocked or corrupted storage must never crash the scanner, so fall back to the default
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
  // Who is inside is kept per session, so a new event starts with nobody inside
  venue: (sessionId) => read(`venue_${sessionId}`, {}), // { [studentId]: 'INSIDE' | 'OUTSIDE' }
  setVenue: (sessionId, v) => write(`venue_${sessionId}`, v),
  events: () => read('sync_queue', []), // door taps waiting to upload; each carries the id of its session
  setEvents: (v) => write('sync_queue', v),
  // The session this phone is scanning into, and a saved copy of it ({ session, roster }) so a reload with
  // no internet can carry on scanning
  session: () => read('door_session', null),
  setSession: (id) => (id ? write('door_session', id) : localStorage.removeItem('door_session')),
  sessionData: (sessionId) => read(`session_${sessionId}`, null),
  setSessionData: (sessionId, v) => write(`session_${sessionId}`, v),
  // A finished session no longer needs its saved copy on the phone
  dropSession: (sessionId) => {
    localStorage.removeItem(`venue_${sessionId}`);
    localStorage.removeItem(`session_${sessionId}`);
  },
};

// A unique id per tap. The server uses it to drop duplicates, which is what makes re-sending safe.
// (crypto.randomUUID needs HTTPS, so there is a fallback for plain-HTTP development.)
export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Downloads the student list and keeps a copy on the phone for offline scanning
export async function refreshStudents() {
  const list = await api('/students');
  store.setStudents(list);
  return list;
}

// Loads a session from the server: its details, its registration list and who is inside. The saved copy is
// replaced, and the local inside/outside picture only when nothing from this session is waiting to upload
// (otherwise we'd lose taps that the server has not seen yet).
export async function refreshSession(sessionId) {
  const data = await api(`/attendance/sessions/${sessionId}`);
  store.setSessionData(sessionId, { session: data.session, roster: data.roster });
  if (!store.events().some((e) => e.session === sessionId)) store.setVenue(sessionId, data.venue);
  return data;
}

// Only staff and admins upload taps, so a student never has anything waiting
export function pendingCount(role) {
  return role === 'staff' || role === 'admin' ? store.events().length : 0;
}

// Uploads the door taps waiting on this phone. Safe to repeat: the server ignores duplicates.
export async function syncAll(role) {
  const events = role === 'staff' || role === 'admin' ? store.events() : [];
  if (!events.length) return { sent: 0 };

  const { accepted, rejected } = await api('/attendance/sync', { method: 'POST', body: { events } });

  // Only taps the server accepted leave the queue; any it rejected stay on the phone
  const done = new Set(accepted.events);
  store.setEvents(store.events().filter((e) => !done.has(e.clientId)));
  return { sent: accepted.events.length, rejected };
}
