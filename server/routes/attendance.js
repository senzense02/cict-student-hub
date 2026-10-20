// Door scanner data. Only staff upload taps; only admins read the full log.
import express from 'express';
import { insertRows, tx } from '../db.js';
import auth, { requireRole } from '../middleware/auth.js';
import { asyncHandler, dayWindow, str, toDate, validId } from '../lib.js';
import { doorEvents, shapeEvent, venueState } from '../door.js';
import { bump } from '../live.js';

const router = express.Router();
router.use(auth);

const DOOR_ACTIONS = ['CHECK_IN', 'TEMPORARY_EXIT', 'RE_ENTRY', 'UNKNOWN_CARD'];
const okClientId = (v) => v != null && String(v).length > 0 && String(v).length <= 100;

// Idempotent upload of everything queued on a phone. Safe to call again after a dropped connection.
// body: { events: [] }  ->  { accepted: { events: [clientId] }, rejected: { events: n } }
router.post('/sync', requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 2000) : [];
  const accepted = { events: [] };
  const rejected = { events: 0 };

  const rows = [];
  for (const e of events) {
    if (!okClientId(e?.clientId) || !DOOR_ACTIONS.includes(e.action)) { rejected.events++; continue; }
    const clientId = String(e.clientId);
    rows.push([clientId, validId(e.student) ? e.student : null, str(e.token, 100), e.action, toDate(e.scannedAt), req.user.id]);
    accepted.events.push(clientId);
  }
  // A tap that was already uploaded is ignored (same client_id). One transaction: all or nothing.
  await tx(async (q) => {
    await insertRows(q, 'event_logs', ['client_id', 'student_id', 'token', 'action', 'scanned_at', 'by_id'], rows, 'ON CONFLICT (client_id) DO NOTHING');
    if (rows.length) await bump('door', q);
  });

  res.json({ accepted, rejected });
}));

// Latest door state per student, so a fresh phone starts from the server's picture
router.get('/venue-state', requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  res.json(await venueState());
}));

// GET /api/attendance/log?date=2026-10-18  (admin) every door tap of that day, newest first
router.get('/log', requireRole('admin'), asyncHandler(async (req, res) => {
  const day = dayWindow(req.query.date);
  const rows = await doorEvents({ from: day.from, to: day.to, limit: 5000 });
  res.json({ date: day.date, events: rows.map(shapeEvent) });
}));

export default router;
