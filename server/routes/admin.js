// What the admin sees on the Overview page, in one request
import express from 'express';
import { query } from '../db.js';
import auth, { requireRole } from '../middleware/auth.js';
import { asyncHandler, dayWindow, iso } from '../lib.js';
import { doorEvents, shapeEvent, venueState } from '../door.js';

const router = express.Router();
router.use(auth, requireRole('admin'));

router.get('/overview', asyncHandler(async (req, res) => {
  const { from: today } = dayWindow(); // midnight in the school's time zone, so "today" matches what staff see

  const [roles, students, resources, pending, doorToday, venue, recent] = await Promise.all([
    query('SELECT role, CAST(COUNT(*) AS INTEGER) AS n FROM users GROUP BY role'),
    query(`SELECT CAST(COUNT(*) AS INTEGER) AS total,
                  CAST(COALESCE(SUM(CASE WHEN nfc_token IS NULL THEN 0 ELSE 1 END), 0) AS INTEGER) AS with_card
           FROM users WHERE role = 'student'`),
    query(`SELECT CAST(COUNT(*) AS INTEGER) AS total,
                  CAST(COALESCE(SUM(CASE WHEN verified THEN 1 ELSE 0 END), 0) AS INTEGER) AS verified
           FROM resources`),
    query(`SELECT r.id, r.title, r.course_code, r.created_at, u.name AS uploader_name
           FROM resources r JOIN users u ON u.id = r.uploader_id
           WHERE r.verified = FALSE ORDER BY r.created_at DESC LIMIT 5`),
    query(`SELECT CAST(COUNT(DISTINCT CASE WHEN action = 'CHECK_IN' THEN student_id END) AS INTEGER) AS checked_in,
                  CAST(COALESCE(SUM(CASE WHEN action = 'UNKNOWN_CARD' THEN 1 ELSE 0 END), 0) AS INTEGER) AS unknown
           FROM event_logs WHERE scanned_at >= $1`, [today]),
    venueState(today),
    doorEvents({ limit: 8 }),
  ]);

  const byRole = Object.fromEntries(roles.map((r) => [r.role, Number(r.n)]));
  const states = Object.values(venue);
  const total = Number(resources[0].total);
  const verified = Number(resources[0].verified);

  res.json({
    users: { student: byRole.student || 0, staff: byRole.staff || 0, admin: byRole.admin || 0 },
    students: { total: Number(students[0].total), withCard: Number(students[0].with_card) },
    resources: { total, verified, pending: total - verified },
    door: {
      checkedInToday: Number(doorToday[0].checked_in),
      inside: states.filter((s) => s === 'INSIDE').length,
      outside: states.filter((s) => s === 'OUTSIDE').length,
      unknownToday: Number(doorToday[0].unknown),
    },
    pendingResources: pending.map((r) => ({
      _id: r.id, title: r.title, courseCode: r.course_code, uploader: r.uploader_name, createdAt: iso(r.created_at),
    })),
    recent: recent.map(shapeEvent),
    generatedAt: new Date().toISOString(),
  });
}));

export default router;
