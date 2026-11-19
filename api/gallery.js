import { randomUUID } from 'node:crypto';
import { put, list, del } from '@vercel/blob';
import { isOwner, sameOrigin, SITE_ORIGIN } from '../lib/gallery-auth.js';

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const PHOTO_ID = /^\d{13}-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(jpg|png|webp)$/;
export const config = { api: { bodyParser: false } };

class GalleryError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function contentType(data) {
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff &&
      data.at(-2) === 0xff && data.at(-1) === 0xd9) return ['image/jpeg', 'jpg'];
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      data.toString('ascii', 12, 16) === 'IHDR') return ['image/png', 'png'];
  if (data.length >= 20 && data.toString('ascii', 0, 4) === 'RIFF' &&
      data.toString('ascii', 8, 12) === 'WEBP') return ['image/webp', 'webp'];
  throw new GalleryError(415, 'invalid_image');
}

async function readImage(req) {
  const size = Number(req.headers?.['content-length']);
  if (Number.isFinite(size) && size > MAX_PHOTO_BYTES) throw new GalleryError(413, 'image_too_large');
  if (req.headers?.['content-type']?.split(';')[0] !== 'application/octet-stream') {
    throw new GalleryError(415, 'invalid_content_type');
  }
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > MAX_PHOTO_BYTES) throw new GalleryError(413, 'image_too_large');
    return req.body;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_PHOTO_BYTES) throw new GalleryError(413, 'image_too_large');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function photo(blob) {
  const id = blob.pathname?.replace(/^gallery\//, '');
  if (!PHOTO_ID.test(id || '') || blob.pathname !== `gallery/${id}`) return null;
  try {
    const url = new URL(blob.url);
    if (url.protocol !== 'https:' || !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname) ||
        url.pathname !== `/gallery/${id}` || url.search || url.hash) return null;
    return { id, src: url.href, createdAt: new Date(blob.uploadedAt).toISOString() };
  } catch { return null; }
}

export function createGalleryHandler({
  storage = { put, list, del }, secret = () => process.env.GALLERY_SESSION_SECRET,
  ready = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
  now = Date.now, uuid = randomUUID, origin = SITE_ORIGIN
} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const url = new URL(req.url, origin);
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, DELETE');
      return res.status(405).json({ error: 'method_not_allowed' });
    }
    if (req.method !== 'GET') {
      if (!isOwner(req, secret(), now())) return res.status(401).json({ error: 'owner_required' });
      if (!sameOrigin(req, origin)) return res.status(403).json({ error: 'forbidden' });
    }
    if (!ready()) return res.status(503).json({ error: 'gallery_not_configured' });
    try {
      if (req.method === 'GET') {
        const photos = [], cursors = new Set();
        let cursor;
        do {
          const page = await storage.list({ prefix: 'gallery/', limit: 1000, ...(cursor ? { cursor } : {}) });
          for (const blob of page.blobs) {
            const item = photo(blob);
            if (item) photos.push(item);
          }
          if (!page.hasMore) break;
          if (!page.cursor || cursors.has(page.cursor) || cursors.size >= 99) throw new Error('invalid_pagination');
          cursor = page.cursor;
          cursors.add(cursor);
        } while (true);
        photos.sort((a, b) => b.id.localeCompare(a.id));
        const fresh = url.searchParams.get('owner') === '1' && isOwner(req, secret(), now());
        res.setHeader('Cache-Control', fresh ? 'private, no-store' : 'public, max-age=0, s-maxage=5, stale-while-revalidate=5');
        // Authenticated fresh requests must not populate the shared CDN cache.
        res.setHeader('Vary', 'Cookie');
        return res.status(200).json({ photos });
      }
      if (req.method === 'POST') {
        const bytes = await readImage(req);
        const [type, extension] = contentType(bytes);
        const id = `${now()}-${uuid()}.${extension}`;
        const blob = await storage.put(`gallery/${id}`, bytes, {
          access: 'public', contentType: type, addRandomSuffix: false,
          cacheControlMaxAge: 60, allowOverwrite: false
        });
        const item = photo({ ...blob, uploadedAt: new Date(now()) });
        if (!item) throw new Error('invalid_storage_response');
        return res.status(201).json({ photo: item });
      }
      const ids = url.searchParams.getAll('id');
      if (ids.length !== 1 || !PHOTO_ID.test(ids[0])) return res.status(400).json({ error: 'invalid_photo' });
      await storage.del(`gallery/${ids[0]}`);
      return res.status(204).end();
    } catch (error) {
      return res.status(error instanceof GalleryError ? error.status : 503)
        .json({ error: error instanceof GalleryError ? error.message : 'gallery_unavailable' });
    }
  };
}

// Published photos stay in Blob storage; the deployed gallery is read-only.
const readGallery = createGalleryHandler();
export default function publicGallery(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  return readGallery(req, res);
}
