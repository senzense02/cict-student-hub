// The Express app. Shared by local development (server/dev.js) and Vercel (api/index.js);
// each feature's routes live in routes/.
import express from 'express';
import { ensureReady } from './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import studentRoutes from './routes/students.js';
import attendanceRoutes from './routes/attendance.js';
import resourceRoutes from './routes/resources.js';
import adminRoutes from './routes/admin.js';
import liveRoutes from './routes/live.js';

const app = express();
app.disable('x-powered-by');
// Behind Vercel's proxy the real client IP comes from the forwarded header (needed for login throttling)
if (process.env.VERCEL || process.env.TRUST_PROXY) app.set('trust proxy', 1);

// 2 MB is plenty for JSON (a phone's queued taps are capped at 2000 per upload). File uploads
// are handled separately in routes/resources.js.
app.use(express.json({ limit: '2mb' }));

// Every API answer is per-user and changes often, so browsers and proxies must never reuse a stored one
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Create the tables (first request only) before any route touches the database
app.use('/api', (req, res, next) => ensureReady().then(() => next(), next));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/live', liveRoutes);
// Unknown /api paths answer with JSON instead of falling through to the web page
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

// Central error handler (bad input, upload limits, database errors, ...)
app.use((err, req, res, next) => {
  if (res.headersSent) return res.end();
  const status = err.status || err.statusCode || (err.name === 'MulterError' ? 400 : 500);
  console.error(`${req.method} ${req.originalUrl} -> ${status}:`, err);
  res.status(status).json({ message: status < 500 || err.expose ? err.message : 'Something went wrong on the server' });
});

export default app;
