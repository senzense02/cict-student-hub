import express from 'express';
import auth from '../middleware/auth.js';
import { asyncHandler } from '../lib.js';
import { versions } from '../live.js';

const router = express.Router();

// GET /api/live -> { topics: { resources: 12, door: 40, users: 5 }, build: "a1b2c3d4e5f6" | null }
// Tiny on purpose: pages call it every few seconds. `build` is the deployed version, so open pages
// can tell as soon as a new deploy is live.
router.get('/', auth, asyncHandler(async (req, res) => {
  res.json({
    topics: await versions(),
    build: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12) : null,
  });
}));

export default router;
