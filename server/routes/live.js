import express from 'express';
import auth from '../middleware/auth.js';
import { asyncHandler } from '../lib.js';
import { versions } from '../live.js';
import { realtimeForBrowser } from '../realtime.js';

const router = express.Router();

// GET /api/live ->
//   { topics: { resources: 12, door: 40, users: 5 },   change counters (see live.js)
//     build:  "a1b2c3d4e5f6" | null,                   deployed version, so open pages notice a new deploy
//     now:    1760000000000,                           server clock, used to time renewals without trusting the browser clock
//     realtime: { url, query } }                       only when Neon Realtime is configured: lets the page
//                                                      receive counter changes by push instead of polling
// Pages call this every few seconds when Realtime is off, and about once a minute when it is on
// (that call renews the 60-second sealed query and doubles as a safety net).
router.get('/', auth, asyncHandler(async (req, res) => {
  const topics = await versions();
  const realtime = await realtimeForBrowser();
  res.json({
    topics,
    build: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12) : null,
    realtime: realtime || undefined,
    now: Date.now(), // stamped last, so the sealed query's remaining lifetime is never overestimated
  });
}));

export default router;
