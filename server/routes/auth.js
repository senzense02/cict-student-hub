import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { one, query } from '../db.js';
import auth, { jwtSecret } from '../middleware/auth.js';
import { asyncHandler, isDuplicate, normalizeToken, str } from '../lib.js';
import { bucketFor, clearFails, isBlocked, recordFail } from '../throttle.js';

const router = express.Router();

// Accepts "25-1167" and "2025-01234" style IDs. Adjust if your school's format differs.
const STUDENT_ID_REGEX = /^\d{2,4}-\d{3,6}$/;
const TOO_MANY = { message: 'Too many attempts. Wait a few minutes and try again.' };

// Compared against when the account doesn't exist, so response time doesn't reveal which IDs are real
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const sign = (user) => jwt.sign({ id: user.id }, jwtSecret(), { expiresIn: '14d' });
const publicUser = (u) => ({
  id: u.id,
  studentId: u.student_id,
  name: u.name,
  role: u.role,
  program: u.program ?? undefined,
  yearLevel: u.year_level ?? undefined,
  section: u.section || undefined,
});

// Self-registration is for students only. Teacher/staff accounts are created by an admin.
router.post('/register', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const studentId = str(body.studentId, 30);
  const name = str(body.name, 120);
  const password = typeof body.password === 'string' ? body.password : '';
  const { program } = body;
  const yearLevel = Number(body.yearLevel);

  if (!studentId || !name || !password || !program || !body.yearLevel)
    return res.status(400).json({ message: 'All fields are required' });
  if (!STUDENT_ID_REGEX.test(studentId))
    return res.status(400).json({ message: 'Invalid Student ID format (e.g. 25-1167)' });
  if (password.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  if (!['BSCS', 'BSIS'].includes(program))
    return res.status(400).json({ message: 'Program must be BSCS or BSIS' });
  if (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 4)
    return res.status(400).json({ message: 'Year level must be 1 to 4' });

  const id = randomUUID();
  try {
    await query(
      `INSERT INTO users (id, student_id, name, password_hash, role, program, year_level)
       VALUES ($1, $2, $3, $4, 'student', $5, $6)`,
      [id, studentId, name, await bcrypt.hash(password, 10), program, yearLevel]
    );
  } catch (err) {
    if (isDuplicate(err)) return res.status(409).json({ message: 'Student ID is already registered' });
    throw err;
  }
  const user = await one('SELECT * FROM users WHERE id = $1', [id]);
  res.status(201).json({ token: sign(user), user: publicUser(user) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const id = String(body.studentId || '').trim();
  const bucket = bucketFor(req, id);
  if (await isBlocked(bucket)) return res.status(429).json(TOO_MANY);

  const user = await one('SELECT * FROM users WHERE student_id = $1', [id]);
  const ok = await bcrypt.compare(String(body.password || ''), user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    await recordFail(bucket);
    return res.status(401).json({ message: 'Incorrect ID or password' });
  }
  await clearFails(bucket);
  res.json({ token: sign(user), user: publicUser(user) });
}));

// Sign in by tapping the school ID card AND entering the account password.
// The card only says "which account"; the password proves it's really that student.
router.post('/nfc-login', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const token = normalizeToken(body.token);
  const password = String(body.password || '');
  if (!token || !password) return res.status(400).json({ message: 'Tap your ID card and enter your password' });

  const bucket = bucketFor(req, token);
  if (await isBlocked(bucket)) return res.status(429).json(TOO_MANY);

  const user = await one('SELECT * FROM users WHERE nfc_token = $1', [token]);
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    await recordFail(bucket);
    return res.status(401).json({ message: 'Card or password is incorrect' });
  }
  await clearFails(bucket);
  res.json({ token: sign(user), user: publicUser(user) });
}));

router.get('/me', auth, asyncHandler(async (req, res) => {
  const user = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user: publicUser(user) });
}));

export default router;
