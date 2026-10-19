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
  sessions: () => read('class_sessions', []),
  setSessions: (v) => write('class_sessions', v),
  marks: () => read('class_marks', {}), // { "<sessionId>:<studentId>": mark }
  setMarks: (v) => write('class_marks', v),
  activeSession: () => read('active_session', null),
  setActiveSession: (v) => write('active_session', v),
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
  const door = role === 'staff' || role === 'admin';
  const cls = role === 'teacher' || role === 'admin';
  let n = 0;
  if (door) n += store.events().length;
  if (cls) {
    n += store.sessions().filter((s) => s.dirty).length;
    n += Object.values(store.marks()).filter((m) => m.dirty).length;
  }
  return n;
}

// Uploads everything this role is allowed to upload. Safe to repeat: the server ignores duplicates.
export async function syncAll(role) {
  const door = role === 'staff' || role === 'admin';
  const cls = role === 'teacher' || role === 'admin';
  const events = door ? store.events() : [];
  const sessions = cls ? store.sessions().filter((s) => s.dirty) : [];
  const marks = cls ? Object.values(store.marks()).filter((m) => m.dirty) : [];
  if (!events.length && !sessions.length && !marks.length) return { sent: 0 };

  const { accepted, rejected } = await api('/attendance/sync', { method: 'POST', body: { events, sessions, marks } });

  const doneEvents = new Set(accepted.events);
  store.setEvents(store.events().filter((e) => !doneEvents.has(e.clientId)));

  const sentSessions = new Map(sessions.map((s) => [s.clientId, s]));
  store.setSessions(
    store.sessions().map((s) =>
      accepted.sessions.includes(s.clientId) && sentSessions.get(s.clientId)?.endedAt === s.endedAt ? { ...s, dirty: false } : s
    )
  );

  const sentMarks = new Map(marks.map((m) => [m.clientId, m]));
  const current = store.marks();
  for (const key of Object.keys(current)) {
    const m = current[key];
    const sent = sentMarks.get(m.clientId);
    // only clear the flag if the mark wasn't changed again while the request was in flight
    if (accepted.marks.includes(m.clientId) && sent && sent.markedAt === m.markedAt && sent.status === m.status)
      current[key] = { ...m, dirty: false };
  }
  store.setMarks(current);

  return { sent: accepted.events.length + accepted.sessions.length + accepted.marks.length, rejected };
}
