const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const { STORAGE_TTL_MS } = require('./config');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

// id -> { filePath, createdAt, fields }
const index = new Map();

function saveCard(pngBuffer, fields) {
  const id = nanoid(10);
  const filePath = path.join(STORAGE_DIR, `${id}.png`);
  fs.writeFileSync(filePath, pngBuffer);
  index.set(id, { filePath, createdAt: Date.now(), fields });
  return id;
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

function cleanupOne(id) {
  const entry = index.get(id);
  if (entry && fs.existsSync(entry.filePath)) {
    fs.unlinkSync(entry.filePath);
  }
  index.delete(id);
}

// periodic sweep for expired cards
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of index.entries()) {
    if (now - entry.createdAt > STORAGE_TTL_MS) cleanupOne(id);
  }
}, 1000 * 60 * 30).unref();

module.exports = { saveCard, getCard };
