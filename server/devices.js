// "Trusted phones" for tap-only sign-in (see card_devices in schema.js).
// The browser makes a random 256-bit key once and keeps it in localStorage. The server only stores its hash,
// and ties it to a user after that user confirmed with their password.
import { createHash } from 'node:crypto';
import { query } from './db.js';

const KEY_FORMAT = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const MAX_DEVICES = 5; // per account; the least recently used one is dropped
const EXPIRES_AFTER = '180 days'; // unused this long and the phone must confirm with the password again

export const validKey = (k) => typeof k === 'string' && KEY_FORMAT.test(k);
const hash = (k) => createHash('sha256').update(k).digest('hex'); // key is random, so a fast hash is fine

// Remember this phone for the user. Call only right after their password was checked.
export async function trustDevice(userId, key) {
  if (!validKey(key)) return;
  await query(
    `INSERT INTO card_devices (user_id, key_hash) VALUES ($1, $2)
     ON CONFLICT (user_id, key_hash) DO UPDATE SET last_used_at = CURRENT_TIMESTAMP`,
    [userId, hash(key)]
  );
  await query(
    `DELETE FROM card_devices WHERE user_id = $1 AND key_hash NOT IN
       (SELECT key_hash FROM card_devices WHERE user_id = $1 ORDER BY last_used_at DESC LIMIT $2)`,
    [userId, MAX_DEVICES]
  );
}

// True (and refreshes "last used") when this phone was trusted by that user and not left unused too long.
export async function isTrusted(userId, key) {
  if (!validKey(key)) return false;
  const rows = await query(
    `UPDATE card_devices SET last_used_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND key_hash = $2 AND last_used_at > CURRENT_TIMESTAMP - INTERVAL '${EXPIRES_AFTER}'
     RETURNING 1`,
    [userId, hash(key)]
  );
  return rows.length > 0;
}

// Used when the card changes or the password is reset: every phone has to confirm again.
export const forgetDevices = (userId) => query('DELETE FROM card_devices WHERE user_id = $1', [userId]);
