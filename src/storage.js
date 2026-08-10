const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const { STORAGE_TTL_MS } = require('./config');

// True when running inside a Vercel serverless function
const IS_VERCEL = !!process.env.VERCEL;

// Local fallback storage directory (only used outside Vercel)
const LOCAL_STORAGE_DIR = path.join(__dirname, '..', 'storage');

// In-memory registry: id → { publicUrl?, filePath?, createdAt, fields }
// NOTE: on Vercel this is per-instance and resets on cold starts, which is
// acceptable for a hackathon — the blob CDN URL itself is always stable.
const index = new Map();

/**
 * Save a generated card PNG.
 * On Vercel → uploads to Vercel Blob (public CDN).
 * Locally   → writes to disk under storage/.
 *
 * @returns {{ id: string, publicUrl: string|null }}
 */
async function saveCard(pngBuffer, fields) {
  const id = nanoid(10);

  if (IS_VERCEL) {
    // Vercel Blob — requires BLOB_READ_WRITE_TOKEN env var set in the project
    const { put } = require('@vercel/blob');
    const blob = await put(`hh-goa-cards/${id}.png`, pngBuffer, {
      access: 'public',
      contentType: 'image/png',
    });
    index.set(id, { publicUrl: blob.url, createdAt: Date.now(), fields });
    return { id, publicUrl: blob.url };
  } else {
    // Local dev — write to disk
    if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
      fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
    }
    const filePath = path.join(LOCAL_STORAGE_DIR, `${id}.png`);
    fs.writeFileSync(filePath, pngBuffer);
    index.set(id, { filePath, createdAt: Date.now(), fields });
    return { id, publicUrl: null };
  }
}

function getCard(id) {
  const entry = index.get(id);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > STORAGE_TTL_MS) {
    cleanupOne(id);
    return null;
  }
  return entry;
}

async function cleanupOne(id) {
  const entry = index.get(id);
  if (entry) {
    if (entry.publicUrl) {
      try {
        const { del } = require('@vercel/blob');
        await del(entry.publicUrl);
      } catch (_) { /* best-effort */ }
    } else if (entry.filePath) {
      try { fs.unlinkSync(entry.filePath); } catch (_) {}
    }
  }
  index.delete(id);
}

// Periodic sweep for expired cards
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of index.entries()) {
    if (now - entry.createdAt > STORAGE_TTL_MS) cleanupOne(id);
  }
}, 1000 * 60 * 30).unref();

module.exports = { saveCard, getCard };
