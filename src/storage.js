const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const { STORAGE_TTL_MS } = require('./config');

const IS_VERCEL = !!process.env.VERCEL;

const LOCAL_STORAGE_DIR = path.join(__dirname, '..', 'storage');

const index = new Map();

/**
 * Save a generated card PNG.
 *
 * On Vercel:
 *   Uploads the PNG to Vercel Blob.
 *
 * Locally:
 *   Writes the PNG to storage/.
 *
 * @returns {{ id: string, publicUrl: string|null }}
 */
async function saveCard(pngBuffer, fields) {
  const id = nanoid(10);

  if (IS_VERCEL) {
    // Vercel Blob authentication is handled automatically
    // through the connected Vercel Blob store / OIDC.
    const { put } = require('@vercel/blob');

    const blob = await put(
      `hh-goa-cards/${id}.png`,
      pngBuffer,
      {
        access: 'public',
        contentType: 'image/jpeg',
      }
    );

    index.set(id, {
      publicUrl: blob.url,
      createdAt: Date.now(),
      fields,
    });

    return {
      id,
      publicUrl: blob.url,
      downloadUrl: blob.downloadUrl
    };
  }

  // Local development
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  }

  const filePath = path.join(
    LOCAL_STORAGE_DIR,
    `${id}.png`
  );

  fs.writeFileSync(filePath, pngBuffer);

  index.set(id, {
    filePath,
    createdAt: Date.now(),
    fields,
  });

  return {
    id,
    publicUrl: null,
  };
}

function getCard(id) {
  const entry = index.get(id);

  if (!entry) {
    return null;
  }

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
      } catch (err) {
        // Best-effort cleanup
      }
    } else if (entry.filePath) {
      try {
        fs.unlinkSync(entry.filePath);
      } catch (err) {
        // Best-effort cleanup
      }
    }
  }

  index.delete(id);
}

// Periodic sweep for expired cards
setInterval(() => {
  const now = Date.now();

  for (const [id, entry] of index.entries()) {
    if (now - entry.createdAt > STORAGE_TTL_MS) {
      cleanupOne(id);
    }
  }
}, 1000 * 60 * 30).unref();

module.exports = {
  saveCard,
  getCard,
};