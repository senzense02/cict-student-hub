// Review board: upload, browse, vote. Admins verify and delete.
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { one, query, tx } from '../db.js';
import auth, { requireRole } from '../middleware/auth.js';
import { asyncHandler, httpError, iso, str } from '../lib.js';
import { openFile, removeFile, saveFile } from '../storage.js';
import { bump } from '../live.js';

const router = express.Router();
router.use(auth);

const ALLOWED = ['.pdf', '.md', '.txt', '.js', '.py', '.java', '.c', '.cpp', '.html', '.css', '.sql'];
const MAX_BYTES = 4 * 1024 * 1024; // Vercel rejects request bodies over 4.5 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) =>
    ALLOWED.includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true)
      : cb(httpError(400, 'Unsupported file type')),
});
const uploadOne = (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return next(httpError(400, 'That file is over 4 MB'));
    next(err);
  });

const likeEscape = (s) => s.replace(/[\\%_]/g, '\\$&');

// One resource joined with its uploader, verifier and this user's vote
const SELECT_RESOURCE = `
  SELECT r.*, u.name AS uploader_name, u.program AS uploader_program, v.name AS verifier_name,
         (SELECT rv.value FROM resource_votes rv WHERE rv.resource_id = r.id AND rv.user_id = $1) AS my_vote
  FROM resources r
  JOIN users u ON u.id = r.uploader_id
  LEFT JOIN users v ON v.id = r.verified_by`;

const shape = (r) => ({
  _id: r.id,
  title: r.title,
  description: r.description,
  courseCode: r.course_code,
  program: r.program,
  yearLevel: r.year_level,
  fileName: r.file_name,
  fileType: r.file_type,
  uploader: { _id: r.uploader_id, name: r.uploader_name, program: r.uploader_program ?? undefined },
  verified: Boolean(r.verified),
  verifiedBy: r.verified_by ? { _id: r.verified_by, name: r.verifier_name } : undefined,
  score: Number(r.score),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
  myVote: Number(r.my_vote || 0),
});

const getShaped = async (id, userId) => {
  const row = await one(`${SELECT_RESOURCE} WHERE r.id = $2`, [userId, id]);
  return row ? shape(row) : null;
};

// GET /api/resources?program=BSCS&yearLevel=2&courseCode=CS101&q=arrays&sort=top|new&verified=true
router.get('/', asyncHandler(async (req, res) => {
  const { program, yearLevel, courseCode, q, sort, verified } = req.query;
  const params = [req.user.id];
  const add = (v) => `$${params.push(v)}`;
  const where = [];

  if (program && program !== 'ALL') where.push(`r.program IN (${add(String(program))}, 'BOTH')`);
  if (yearLevel && yearLevel !== 'ALL' && Number.isInteger(Number(yearLevel))) where.push(`r.year_level = ${add(Number(yearLevel))}`);
  if (courseCode) where.push(`LOWER(r.course_code) LIKE ${add(`%${likeEscape(String(courseCode).trim().toLowerCase())}%`)} ESCAPE '\\'`);
  if (q) where.push(`LOWER(r.title) LIKE ${add(`%${likeEscape(String(q).trim().toLowerCase())}%`)} ESCAPE '\\'`);
  if (verified === 'true') where.push('r.verified = TRUE');
  if (verified === 'false') where.push('r.verified = FALSE');

  const order = sort === 'new' ? 'r.created_at DESC' : 'r.score DESC, r.created_at DESC';
  const rows = await query(
    `${SELECT_RESOURCE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT 100`,
    params
  );
  res.json(rows.map(shape));
}));

// POST /api/resources  (multipart/form-data, field "file")
router.post('/', uploadOne, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const title = str(body.title, 200);
  const courseCode = str(body.courseCode, 40).toUpperCase();
  const { program } = body;
  const yearLevel = Number(body.yearLevel);

  if (!req.file) return res.status(400).json({ message: 'Please attach a file' });
  if (!title || !courseCode || !program || !body.yearLevel)
    return res.status(400).json({ message: 'Title, course code, program and year level are required' });
  if (!['BSCS', 'BSIS', 'BOTH'].includes(program)) return res.status(400).json({ message: 'Invalid program' });
  if (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 4) return res.status(400).json({ message: 'Year level must be 1 to 4' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  const contentType = ext === '.pdf' ? 'application/pdf' : 'text/plain; charset=utf-8';
  const storageKey = await saveFile({ buffer: req.file.buffer, ext, contentType });

  const id = randomUUID();
  const autoVerified = req.user.role === 'admin';
  try {
    await query(
      `INSERT INTO resources (id, title, description, course_code, program, year_level, storage_key, content_type,
                              file_name, file_type, uploader_id, verified, verified_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [id, title, str(body.description, 2000), courseCode, program, yearLevel, storageKey, contentType,
       str(req.file.originalname, 255), ext, req.user.id, autoVerified, autoVerified ? req.user.id : null]
    );
  } catch (err) {
    await removeFile(storageKey); // don't leave an orphan file behind
    throw err;
  }
  await bump('resources');
  res.status(201).json(await getShaped(id, req.user.id));
}));

// GET /api/resources/:id/file  -> the file itself (PDFs inline; everything else as plain text)
router.get('/:id/file', asyncHandler(async (req, res) => {
  const r = await one('SELECT storage_key, content_type, file_name FROM resources WHERE id = $1', [req.params.id]);
  if (!r) return res.status(404).json({ message: 'Resource not found' });
  const file = await openFile(r.storage_key);
  if (!file) return res.status(404).json({ message: 'File not found' });

  res.set('Content-Type', r.content_type);
  res.set('Content-Disposition', `inline; filename="${encodeURIComponent(r.file_name)}"`);
  res.set('X-Content-Type-Options', 'nosniff');
  if (file.buffer) return res.send(file.buffer);
  await pipeline(file.stream, res);
}));

// POST /api/resources/:id/verify  (admin) toggles the "verified" badge
router.post('/:id/verify', requireRole('admin'), asyncHandler(async (req, res) => {
  const rows = await query(
    `UPDATE resources
     SET verified = NOT verified,
         verified_by = CASE WHEN verified THEN NULL ELSE CAST($2 AS TEXT) END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING id`,
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Resource not found' });
  await bump('resources');
  res.json(await getShaped(req.params.id, req.user.id));
}));

// DELETE /api/resources/:id  (admin) removes the reviewer, its votes and its stored file
router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const rows = await query('DELETE FROM resources WHERE id = $1 RETURNING storage_key', [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Resource not found' });
  await removeFile(rows[0].storage_key);
  await bump('resources');
  res.json({ ok: true });
}));

// POST /api/resources/:id/vote   body: { value: 1 | -1 }  (sending the same value again removes the vote)
router.post('/:id/vote', asyncHandler(async (req, res) => {
  const value = Number(req.body?.value);
  if (![1, -1].includes(value)) return res.status(400).json({ message: 'value must be 1 or -1' });
  if (!(await one('SELECT id FROM resources WHERE id = $1', [req.params.id])))
    return res.status(404).json({ message: 'Resource not found' });

  await tx(async (q) => {
    const [mine] = await q('SELECT value FROM resource_votes WHERE resource_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (mine && Number(mine.value) === value) {
      await q('DELETE FROM resource_votes WHERE resource_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    } else {
      await q(
        `INSERT INTO resource_votes (resource_id, user_id, value) VALUES ($1, $2, $3)
         ON CONFLICT (resource_id, user_id) DO UPDATE SET value = EXCLUDED.value`,
        [req.params.id, req.user.id, value]
      );
    }
    await q(
      `UPDATE resources
       SET score = (SELECT CAST(COALESCE(SUM(value), 0) AS INTEGER) FROM resource_votes WHERE resource_id = $1),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [req.params.id]
    );
    await bump('resources', q);
  });
  res.json(await getShaped(req.params.id, req.user.id));
}));

export default router;
