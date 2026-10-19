// Student roster + NFC card linking (staff / teacher / admin)
import express from 'express';
import { query } from '../db.js';
import auth, { requireRole } from '../middleware/auth.js';
import { asyncHandler, isDuplicate, normalizeToken, str } from '../lib.js';

const router = express.Router();
router.use(auth, requireRole('staff', 'teacher', 'admin'));

// The phone caches this list in localStorage (students_db) so it can scan offline.
router.get('/', asyncHandler(async (req, res) => {
  const list = await query(
    `SELECT id, student_id, name, program, year_level, section, nfc_token
     FROM users WHERE role = 'student' ORDER BY name LIMIT 5000`
  );
  res.json(list.map((s) => ({
    id: s.id, studentId: s.student_id, name: s.name, program: s.program,
    yearLevel: s.year_level, section: s.section || '', nfcToken: s.nfc_token || null,
  })));
}));

// body: { nfcToken?: string ("" removes the card), section?: string }
router.patch('/:id', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const sets = [];
  const params = [];
  const add = (column, value) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if ('nfcToken' in body) {
    const token = normalizeToken(body.nfcToken);
    if (!token) add('nfc_token', null);
    else if (token.length < 8) return res.status(400).json({ message: 'That does not look like a card ID' });
    else add('nfc_token', token);
  }
  if ('section' in body) add('section', str(body.section, 60));
  if (!sets.length) return res.status(400).json({ message: 'Nothing to update' });

  params.push(req.params.id);
  let rows;
  try {
    rows = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} AND role = 'student' RETURNING id, nfc_token, section`,
      params
    );
  } catch (err) {
    if (isDuplicate(err)) return res.status(409).json({ message: 'That card is already linked to another student' });
    throw err;
  }
  if (!rows.length) return res.status(404).json({ message: 'Student not found' });
  res.json({ id: rows[0].id, nfcToken: rows[0].nfc_token || null, section: rows[0].section || '' });
}));

export default router;
