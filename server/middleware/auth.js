// Login check for protected routes (default export) and role check (requireRole).
import jwt from 'jsonwebtoken';
import { one } from '../db.js';
import { httpError } from '../lib.js';

// A missing secret is a setup mistake, so its message is allowed through to the browser (expose = true)
export const jwtSecret = () => {
  if (!process.env.JWT_SECRET) throw httpError(500, 'JWT_SECRET is not set on the server.', true);
  return process.env.JWT_SECRET;
};

export default async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Not authenticated' });

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret());
    } catch (err) {
      if (err.expose) throw err; // missing JWT_SECRET is a server problem, not a bad token
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // The token only carries the id. The role is looked up on every request, so a deleted account is
    // signed out and a role is never out of date.
    const user = await one('SELECT id, role FROM users WHERE id = $1', [String(payload.id)]);
    if (!user) return res.status(401).json({ message: 'This account no longer exists' });
    req.user = { id: user.id, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

// Use after auth, which sets req.user
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'Your account cannot do that' });
