// Postgres access: the connection pool, a small query/transaction API, and first-run setup
// (create the tables, then the first admin).
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { SCHEMA } from './schema.js';
import { httpError } from './lib.js';

const LOCK_ID = 727401; // advisory lock so two cold starts never run the setup at the same time
let pool = null;
let ready = null; // the setup promise: null before the first request, and again after a failed attempt

function getPool() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw httpError(500, 'The database is not configured: DATABASE_URL is missing.', true);
  if (!pool) {
    // Small pool: every serverless instance has its own, and Neon pools connections for us.
    pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
    pool.on('error', (e) => console.error('Database pool error:', e.message));
  }
  return pool;
}

// Run SQL with $1, $2 ... placeholders (never build SQL from user input).
// query(sql, params) -> array of rows
export const query = async (text, params = []) => (await getPool().query(text, params)).rows;
export const one = async (text, params = []) => (await query(text, params))[0] || null;

// tx(async (q) => { ... }) runs everything in one transaction; q has the same shape as query().
export async function tx(fn) {
  const client = await getPool().connect();
  const q = async (text, params = []) => (await client.query(text, params)).rows;
  try {
    await client.query('BEGIN');
    const out = await fn(q);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw err;
  } finally {
    client.release();
  }
}

// Multi-row INSERT in chunks (one round trip per chunk instead of one per row).
// `tail` is raw SQL added after VALUES, e.g. 'ON CONFLICT (id) DO NOTHING', so only ever pass constants.
// 200 rows per chunk keeps the parameter count far below Postgres' limit of 65,535.
export async function insertRows(q, table, columns, rows, tail = '', chunk = 200) {
  for (let i = 0; i < rows.length; i += chunk) {
    const params = [];
    const tuples = rows.slice(i, i + chunk).map(
      (row) => `(${row.map((v) => { params.push(v); return `$${params.length}`; }).join(',')})`
    );
    await q(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${tuples.join(',')} ${tail}`, params);
  }
}

// Creates the first admin account if none exists yet.
// This is the only way an admin comes into being: the app cannot create admins (see routes/users.js).
// It does nothing once any admin exists, so changing ADMIN_PASSWORD later does not reset that password.
async function ensureAdmin(client) {
  const { rows } = await client.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
  if (rows.length) return;

  const loginId = process.env.ADMIN_ID || 'admin';
  const fromEnv = Boolean(process.env.ADMIN_PASSWORD);
  // With no ADMIN_PASSWORD set we invent one and print it once below; only its hash is ever stored
  const password = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');

  await client.query(
    `INSERT INTO users (id, student_id, name, password_hash, role)
     VALUES ($1, $2, 'Administrator', $3, 'admin')
     ON CONFLICT (student_id) DO NOTHING`, // if another account already uses this login ID, set ADMIN_ID to something else
    [randomUUID(), loginId, await bcrypt.hash(password, 10)]
  );
  console.log('\n  Admin account created');
  console.log(`  Login ID : ${loginId}`);
  console.log(fromEnv ? '  Password : (the value of ADMIN_PASSWORD)\n' : `  Password : ${password}\n  SAVE THIS NOW - it is shown only once.\n`);
}

// Tables first, then the admin. Both steps are repeatable, and the lock makes concurrent cold starts take turns.
async function setup() {
  const client = await getPool().connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    try {
      await client.query(SCHEMA);
      await ensureAdmin(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

// Called before every API request; the work happens once per server instance.
export function ensureReady() {
  if (!ready) {
    ready = setup().catch((err) => {
      ready = null; // try again on the next request
      throw err;
    });
  }
  return ready;
}
