// Where uploaded reviewer files live.
//  - On Vercel with a (private) Blob store connected: Vercel Blob. Files are never public; they are only
//    served through GET /api/resources/:id/file after the login check.
//  - Otherwise (local development, or Blob not set up yet): the `files` table in Postgres.
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { one, query } from './db.js';

const useBlob = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

// Returns a storage key such as "blob:reviewers/abc.pdf" or "db:<uuid>"
export async function saveFile({ buffer, ext, contentType }) {
  if (useBlob()) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`reviewers/${randomUUID()}${ext}`, buffer, { access: 'private', contentType });
    return `blob:${blob.pathname}`;
  }
  const id = randomUUID();
  await query('INSERT INTO files (id, data) VALUES ($1, $2)', [id, buffer]);
  return `db:${id}`;
}

// -> { buffer } | { stream } | null
export async function openFile(key) {
  if (key.startsWith('blob:')) {
    const { get } = await import('@vercel/blob');
    const result = await get(key.slice(5), { access: 'private' });
    if (!result || result.statusCode !== 200) return null;
    return { stream: Readable.fromWeb(result.stream) };
  }
  const row = await one('SELECT data FROM files WHERE id = $1', [key.slice(3)]);
  return row ? { buffer: Buffer.from(row.data) } : null;
}

// Best effort: a leftover file is harmless, a failed delete must never break the request.
export async function removeFile(key) {
  try {
    if (key.startsWith('blob:')) {
      const { del } = await import('@vercel/blob');
      await del(key.slice(5));
    } else {
      await query('DELETE FROM files WHERE id = $1', [key.slice(3)]);
    }
  } catch (err) {
    console.error('Could not remove file', key, err.message);
  }
}
