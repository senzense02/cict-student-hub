// Student roster (staff + admin) and NFC card linking (admin only)
import express from 'express';
import { query } from '../db.js';
import auth, { requireRole } from '../middleware/auth.js';
import { asyncHandler, isDuplicate, normalizeToken } from '../lib.js';
import { bump } from '../live.js';

const router = express.Router();
router.use(auth);

// Staff need the roster (names + card IDs) so the door scanner can work offline. The phone caches it
// in localStorage as students_db. Only admins can change who owns which card.
router.get('/', requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const list = await query(
    `SELECT id, student_id, name, program, year_level, nfc_token
     FROM users WHERE role = 'student' ORDER BY name LIMIT 5000`
  );
  res.json(list.map((s) => ({
    id: s.id, studentId: s.student_id, name: s.name, program: s.program,
    yearLevel: s.year_level, nfcToken: s.nfc_token || null,
  })));
}));

// body: { nfcToken: string }  ("" removes the card)
router.patch('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!('nfcToken' in body)) return res.status(400).json({ message: 'Nothing to update' });

  const token = normalizeToken(body.nfcToken);
  if (token && token.length < 8) return res.status(400).json({ message: 'That does not look like a card ID' });

  let rows;
  try {
    rows = await query(
      `UPDATE users SET nfc_token = $1 WHERE id = $2 AND role = 'student' RETURNING id, nfc_token`,
      [token || null, req.params.id]
    );
  } catch (err) {
    if (isDuplicate(err)) return res.status(409).json({ message: 'That card is already linked to another student' });
    throw err;
  }
  if (!rows.length) return res.status(404).json({ message: 'Student not found' });
  await bump('users');
  res.json({ id: rows[0].id, nfcToken: rows[0].nfc_token || null });
}));

export default router;
