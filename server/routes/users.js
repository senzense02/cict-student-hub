// Admin-only account management
import express from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { one, query } from '../db.js';
import auth, { requireRole } from '../middleware/auth.js';
import { asyncHandler, isDuplicate, str } from '../lib.js';
import { removeFile } from '../storage.js';

const router = express.Router();
router.use(auth, requireRole('admin'));

router.get('/', asyncHandler(async (req, res) => {
  const users = await query(
    `SELECT id, student_id, name, role, program, year_level, nfc_token
     FROM users ORDER BY role, name LIMIT 500`
  );
  res.json(users.map((u) => ({
    id: u.id, studentId: u.student_id, name: u.name, role: u.role,
    program: u.program ?? undefined, yearLevel: u.year_level ?? undefined,
    hasCard: Boolean(u.nfc_token),
  })));
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const studentId = str(body.studentId, 30);
  const name = str(body.name, 120);
  const password = typeof body.password === 'string' ? body.password : '';
  const { role } = body;

  if (!studentId || !name || !password) return res.status(400).json({ message: 'ID, name and password are required' });
  if (!['staff', 'admin'].includes(role)) return res.status(400).json({ message: 'Role must be staff or admin' });
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

  const id = randomUUID();
  try {
    await query(
      `INSERT INTO users (id, student_id, name, password_hash, role) VALUES ($1, $2, $3, $4, $5)`,
      [id, studentId, name, await bcrypt.hash(password, 10), role]
    );
  } catch (err) {
    if (isDuplicate(err)) return res.status(409).json({ message: 'That ID is already taken' });
    throw err;
  }
  res.status(201).json({ id, studentId, name, role });
}));

router.patch('/:id/password', asyncHandler(async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  const rows = await query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id', [await bcrypt.hash(password, 10), req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'User not found' });
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ message: 'You cannot delete your own account' });
  // Their uploads are deleted with them (ON DELETE CASCADE), so remove the stored files too.
  const files = await query('SELECT storage_key FROM resources WHERE uploader_id = $1', [req.params.id]);
  const rows = await query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'User not found' });
  // Their votes went with them, so refresh every reviewer's score
  await query(
    `UPDATE resources SET score = (SELECT CAST(COALESCE(SUM(value), 0) AS INTEGER) FROM resource_votes WHERE resource_id = resources.id)`
  );
  await Promise.all(files.map((f) => removeFile(f.storage_key)));
  res.json({ ok: true });
}));

export default router;
