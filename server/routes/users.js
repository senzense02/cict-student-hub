// Admin-only account management: list, create event staff or students, reset passwords, delete.
//
// Why admins can't create admins: an admin can already see and change everything, so a stolen or careless
// admin session could otherwise mint more of them and keep access after the original is fixed. The only
// admin is the one seeded at first start from ADMIN_ID / ADMIN_PASSWORD (see ensureAdmin in db.js).
import express from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { query } from '../db.js';
import auth, { requireRole } from '../middleware/auth.js';
import { asyncHandler, isDuplicate, isYearLevel, PROGRAMS, STUDENT_ID_REGEX, str } from '../lib.js';
import { removeFile } from '../storage.js';
import { bump } from '../live.js';
import { forgetDevices } from '../devices.js';

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

// Creates an event staff or student account. A student made here is the same as one who registered
// themselves (same ID format, program and year rules), e.g. for a student who has no phone to sign up with.
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const studentId = str(body.studentId, 30);
  const name = str(body.name, 120);
  const password = typeof body.password === 'string' ? body.password : '';
  const { role, program } = body;
  const yearLevel = Number(body.yearLevel);

  if (role === 'admin') return res.status(403).json({ message: 'Admin accounts cannot be created here' });
  if (!['staff', 'student'].includes(role)) return res.status(400).json({ message: 'Role must be staff or student' });
  if (!studentId || !name || !password) return res.status(400).json({ message: 'ID, name and password are required' });
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

  // Only students have a program, year and a school-style ID. Staff log in with a free-form username.
  const isStudent = role === 'student';
  if (isStudent) {
    if (!STUDENT_ID_REGEX.test(studentId)) return res.status(400).json({ message: 'Invalid Student ID format (e.g. 25-1167)' });
    if (!PROGRAMS.includes(program)) return res.status(400).json({ message: 'Program must be BSCS or BSIS' });
    if (!isYearLevel(yearLevel)) return res.status(400).json({ message: 'Year level must be 1 to 4' });
  }

  const id = randomUUID();
  try {
    await query(
      `INSERT INTO users (id, student_id, name, password_hash, role, program, year_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, studentId, name, await bcrypt.hash(password, 10), role, isStudent ? program : null, isStudent ? yearLevel : null]
    );
  } catch (err) {
    if (isDuplicate(err)) return res.status(409).json({ message: 'That ID is already taken' });
    throw err;
  }
  await bump('users'); // the scanner's roster and the ID cards tab pick up the new student within seconds
  res.status(201).json({ id, studentId, name, role, ...(isStudent && { program, yearLevel }) });
}));

router.patch('/:id/password', asyncHandler(async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  const rows = await query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id', [await bcrypt.hash(password, 10), req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'User not found' });
  await forgetDevices(req.params.id); // a reset password also signs every phone out of tap-only sign-in
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ message: 'You cannot delete your own account' });
  // Their uploads are deleted with them (ON DELETE CASCADE), so remove the stored files too.
  // The file keys are read first, because the rows are gone after the delete.
  const files = await query('SELECT storage_key FROM resources WHERE uploader_id = $1', [req.params.id]);
  const rows = await query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'User not found' });
  // Their votes went with them, so refresh every reviewer's score
  await query(
    `UPDATE resources SET score = (SELECT CAST(COALESCE(SUM(value), 0) AS INTEGER) FROM resource_votes WHERE resource_id = resources.id)`
  );
  await Promise.all(files.map((f) => removeFile(f.storage_key)));
  await Promise.all([bump('users'), bump('resources'), bump('door')]); // their uploads, votes and door taps change too
  res.json({ ok: true });
}));

export default router;
