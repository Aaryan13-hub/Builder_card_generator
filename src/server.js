const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { normalizeAndCrop } = require('./imagePrep');
const { composeCard } = require('./compositor');
const { generateBuilderTitle, hashString } = require('./builderTitles');
const { saveCard, getCard } = require('./storage');
const { CIRCLE } = require('./config');
const { nanoid } = require('nanoid');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/templates', express.static(path.join(__dirname, '..', 'templates')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB, generous for phone camera JPG/HEIC
});

// Share text constants
const SHARE_POST_TEXT =
  'Built my HH Goa 2026 frame and I\u2019m feeling the builder energy. Come join the vibe! #FrameInGoa #HHGoa';

const FRAME_SHARE_POST_TEXT =
  'I just created my Hacker House Goa 2026 profile frame! \u2728 #FrameInGoa #HHGoa2026';

// Base URL used to build absolute links for OG tags / share intents.
// Override with PUBLIC_BASE_URL env var when deployed.
const BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

const IS_VERCEL = !!process.env.VERCEL;
const LOCAL_STORAGE_DIR = path.join(__dirname, '..', 'storage');

// ==============================================================
// BUILDER ID — Existing routes (DO NOT MODIFY)
// ==============================================================

app.get('/api/health', (req, res) => res.json({ ok: true }));

/**
 * POST /api/generate
 * multipart/form-data:
 *   photo       - file (jpg/png/heic/webp)
 *   name        - string
 *   role        - string
 *   faceBox     - optional JSON string { x, y, width, height } in 0..1
 *                 fractions of the image, from client-side face detection
 */
app.post('/api/generate', upload.single('photo'), async (req, res) => {
  const t0 = Date.now();
  try {
    if (!req.file) return res.status(400).json({ error: 'photo file is required' });

    const name = (req.body.name || '').trim();
    const role = (req.body.role || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!role) return res.status(400).json({ error: 'role is required' });

    let faceBox = null;
    if (req.body.faceBox) {
      try {
        faceBox = JSON.parse(req.body.faceBox);
      } catch {
        faceBox = null; // ignore malformed input, fall back to heuristic crop
      }
    }

    // 1+2. Normalize (EXIF rotate, colorspace) AND crop to circle in one Sharp
    //       pipeline — saves a full encode/decode round trip vs the old two-step.
    const circleDiameter = CIRCLE.r * 2;
    const circlePhoto = await normalizeAndCrop(
      req.file.buffer,
      req.file.originalname,
      faceBox,
      circleDiameter
    );

    // 3. Generate the fun builder title (deterministic per name+role so
    //    regenerating the same person doesn't reshuffle it randomly)
    const seed = hashString(name.toLowerCase() + role.toLowerCase());
    const builderTitle = generateBuilderTitle(role, seed);

    // 4. Composite final card
    const cardBuffer = await composeCard(circlePhoto, { name, role, builderTitle });

    // 5. Store + return shareable links
    const { id, publicUrl } = await saveCard(cardBuffer, { name, role, builderTitle });

    // Use the blob CDN URL directly for imageUrl when available (Vercel),
    // otherwise fall back to our own serving endpoint (local dev).
    const imageUrl = publicUrl || `${BASE_URL}/api/card/${id}.png`;
    const downloadUrl = `${BASE_URL}/api/card/${id}.jpg?download=1`;

    res.json({
      id,
      generationMs: Date.now() - t0,
      downloadUrl,
      imageUrl,
      sharePageUrl: `${BASE_URL}/card/${id}`,
      shareIntentUrl: buildTweetIntent(`${BASE_URL}/card/${id}`),
      builderTitle,
    });
  } catch (err) {
    console.error('generate error', err);
    res.status(500).json({ error: 'failed to generate card', detail: String(err.message || err) });
  }
});

/**
 * GET /api/card/:id.jpg — serves the raw generated image.
 * ?download=1 forces a Content-Disposition attachment for the download button.
 */
app.get('/api/card/:id.jpg', async (req, res) => {
  const id = req.params.id;
  const entry = getCard(id);
  if (!entry) return res.status(404).send('Not found or expired');

  res.setHeader('Content-Type', 'image/jpeg');
  if (req.query.download) {
    res.setHeader('Content-Disposition', `attachment; filename="hh-goa-2026-${id}.jpg"`);
  }

  if (entry.publicUrl) {
    // Blob storage: proxy through so we can control headers (e.g. Content-Disposition)
    const upstream = await fetch(entry.publicUrl);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } else {
    // Local dev: serve from disk
    res.sendFile(entry.filePath);
  }
});

/**
 * GET /card/:id — human-facing share page with Open Graph tags so X
 * (and any other platform) shows the actual generated graphic as the
 * link preview, plus a simple download / re-share affordance.
 */
app.get('/card/:id', (req, res) => {
  const id = req.params.id;
  const entry = getCard(id);
  if (!entry) return res.status(404).send('This card has expired or does not exist.');

  // Prefer the blob CDN URL for OG image (stable, publicly accessible);
  // fall back to our own serving route for local dev.
  const imageUrl = entry.publicUrl || `${BASE_URL}/api/card/${id}.jpg`;
  const downloadUrl = entry.downloadUrl || `${BASE_URL}/api/card/${id}.jpg?download=1`;
  const pageUrl = `${BASE_URL}/card/${id}`;
  const { name, builderTitle } = entry.fields;
  const title = `${name} is at Hacker House Goa 2026`;
  const description = `${builderTitle} \u00b7 #FrameInGoa`;
  const tweetIntent = buildTweetIntent(pageUrl);

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />

  <!-- Open Graph -->
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:width" content="1080" />
  <meta property="og:image:height" content="1350" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:type" content="website" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${imageUrl}" />

  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: sans-serif; text-align: center; background: #0B4A32; color: white; padding: 24px; }
    img { max-width: 360px; width: 100%; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.4); }
    a.btn { display: inline-block; margin: 10px 6px; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; }
    a.download { background: #F2C744; color: #0B4A32; }
    a.tweet { background: #1DA1F2; color: white; }
  </style>
</head>
<body>
  <img src="${imageUrl}" alt="${escapeHtml(title)}" />
  <p>${escapeHtml(description)}</p>
  <a class="btn download" href="${imageUrl}?download=1">Download</a>
  <a class="btn tweet" href="${tweetIntent}" target="_blank" rel="noopener">Share to X</a>
</body>
</html>`);
});

// ==============================================================
// PROFILE FRAME — Share endpoints (separate from Builder ID)
// ==============================================================

/**
 * POST /api/frame-share
 * Uploads the JPEG frame to Vercel Blob and builds a clean share URL.
 * The blob store ID is extracted directly from blob.url (100% reliable),
 * encoded as a short ?s= param so the share page can reconstruct the
 * image URL without any token parsing or in-memory state.
 */
app.post('/api/frame-share', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'image is required' });
    const id = nanoid(10);
    const name = (req.body.name || 'Builder').trim();

    const shareBaseUrl = IS_VERCEL
      ? 'https://builder-card-generator.vercel.app'
      : getRequestBaseUrl(req);

    let blobImageUrl;   // full Vercel Blob CDN URL (returned directly from put())
    let storeId = null; // short store subdomain extracted from blobImageUrl

    if (IS_VERCEL) {
      const { put } = require('@vercel/blob');
      const blob = await put(
        `hh-goa-frames/${id}.jpg`,
        req.file.buffer,
        { access: 'public', addRandomSuffix: false, contentType: 'image/jpeg' }
      );
      blobImageUrl = blob.url;
      // Extract store subdomain directly from the URL Vercel gave us.
      // e.g. "https://abc123.public.blob.vercel-storage.com/..." -> "abc123"
      try {
        storeId = new URL(blob.url).hostname.split('.')[0];
      } catch (_) { /* leave null */ }
    } else {
      // Local dev
      if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
        fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
      }
      const filePath = path.join(LOCAL_STORAGE_DIR, `frame-${id}.jpg`);
      fs.writeFileSync(filePath, req.file.buffer);
      blobImageUrl = `${shareBaseUrl}/api/frame-og/${id}`;
    }

    // Build clean share page URL. The ?s= param is only ~16 chars.
    let sharePageUrl = `${shareBaseUrl}/profile-frame/${id}?n=${encodeURIComponent(name)}`;
    if (storeId) sharePageUrl += `&s=${storeId}`;

    res.json({
      imageUrl: blobImageUrl,
      sharePageUrl,
      intentUrl: buildFrameTweetIntent(sharePageUrl),
    });
  } catch (err) {
    console.error('frame-share error:', err);
    res.status(500).json({ error: 'Failed to upload frame image' });
  }
});

/**
 * GET /api/frame-og/:id
 * Image PROXY — fetches the JPEG from Vercel Blob and serves it through
 * our own production domain (builder-card-generator.vercel.app).
 *
 * This is the URL used for og:image / twitter:image because:
 *   1. X's crawler definitely trusts our domain (it already reads our HTML).
 *   2. Removes any CDN / cross-origin issues between X and Vercel Blob.
 *
 * ?s=storeId is used to reconstruct the Blob CDN URL without token parsing.
 */
app.get('/api/frame-og/:id', async (req, res) => {
  const id = req.params.id;
  if (!/^[A-Za-z0-9_-]{10}$/.test(id)) return res.status(404).send('Not found');

  const storeId = (req.query.s || '').trim();

  if (!IS_VERCEL) {
    // Local dev: serve from disk
    const filePath = path.join(LOCAL_STORAGE_DIR, `frame-${id}.jpg`);
    if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    return res.sendFile(path.resolve(filePath));
  }

  let blobUrl;
  if (storeId && /^[a-z0-9]+$/.test(storeId)) {
    blobUrl = `https://${storeId}.public.blob.vercel-storage.com/hh-goa-frames/${id}.jpg`;
  } else {
    // Last resort: list() (slower, eventual consistency)
    try {
      const { list } = require('@vercel/blob');
      const { blobs } = await list({ prefix: `hh-goa-frames/${id}.jpg`, limit: 1 });
      const b = blobs.find((x) => x.pathname === `hh-goa-frames/${id}.jpg`);
      if (!b) return res.status(404).send('Not found');
      blobUrl = b.url;
    } catch (_) {
      return res.status(404).send('Not found');
    }
  }

  try {
    const upstream = await fetch(blobUrl);
    if (!upstream.ok) return res.status(404).send('Image not found');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.send(buf);
  } catch (err) {
    console.error('frame-og proxy error:', err);
    res.status(500).send('Failed to fetch image');
  }
});

/**
 * GET /api/frame-image/:id.jpg — serves locally-stored frame images (dev only).
 */
app.get('/api/frame-image/:id.jpg', (req, res) => {
  const id = req.params.id;
  const filePath = path.join(LOCAL_STORAGE_DIR, `frame-${id}.jpg`);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');
  res.setHeader('Content-Type', 'image/jpeg');
  res.sendFile(path.resolve(filePath));
});

/**
 * GET /profile-frame/:id
 * Share page with fully server-rendered Open Graph + Twitter Card meta tags.
 * og:image and twitter:image both point to /api/frame-og/:id on OUR domain —
 * the same domain X already reads HTML from, so it definitely trusts it.
 * All state is encoded statelessly in query params (?n=name&s=storeId).
 * No JavaScript required for X/Twitter crawlers to read the meta tags.
 */
app.get('/profile-frame/:id', (req, res) => {
  const id = req.params.id;
  if (!/^[A-Za-z0-9_-]{10}$/.test(id)) return res.status(404).send('Frame not found.');

  const shareBaseUrl = IS_VERCEL
    ? 'https://builder-card-generator.vercel.app'
    : getRequestBaseUrl(req);

  const name = req.query.n || 'Builder';
  const storeId = (req.query.s || '').trim();

  // og:image is proxied through OUR domain — same domain X trusts for HTML.
  let ogImageUrl = `${shareBaseUrl}/api/frame-og/${id}`;
  if (storeId) ogImageUrl += `?s=${storeId}`;

  let pageUrl = `${shareBaseUrl}/profile-frame/${id}?n=${encodeURIComponent(name)}`;
  if (storeId) pageUrl += `&s=${storeId}`;

  const title = `${name} is at Hacker House Goa 2026`;
  const description = '#FrameInGoa \u00b7 Hacker House Goa 2026';
  const tweetIntent = buildFrameTweetIntent(pageUrl);

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />

  <!-- Open Graph — rendered server-side, visible without JS -->
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${ogImageUrl}" />
  <meta property="og:image:width" content="1080" />
  <meta property="og:image:height" content="1350" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:type" content="website" />

  <!-- Twitter Card — summary_large_image shows the full card preview -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${ogImageUrl}" />

  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: sans-serif; text-align: center; background: #0B4A32; color: white; padding: 24px; }
    img { max-width: 360px; width: 100%; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.4); }
    a.btn { display: inline-block; margin: 10px 6px; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; }
    a.download { background: #F2C744; color: #0B4A32; }
    a.tweet { background: #1DA1F2; color: white; }
  </style>
</head>
<body>
  <img src="${ogImageUrl}" alt="${escapeHtml(title)}" />
  <p>${escapeHtml(description)}</p>
  <a class="btn download" href="${ogImageUrl}" download="hh-goa-2026-profile-frame.jpg">Download</a>
  <a class="btn tweet" href="${tweetIntent}" target="_blank" rel="noopener">Share to X</a>
</body>
</html>`);
});

// ==============================================================
// Shared helpers
// ==============================================================

function getRequestBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const protocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0];
  const host = String(req.headers['x-forwarded-host'] || req.get('host'));
  return `${protocol}://${host}`;
}

function buildTweetIntent(pageUrl) {
  const params = new URLSearchParams({ text: SHARE_POST_TEXT, url: pageUrl });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

function buildFrameTweetIntent(sharePageUrl) {
  const params = new URLSearchParams({ text: FRAME_SHARE_POST_TEXT, url: sharePageUrl });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`HH Goa card backend listening on :${PORT}`));
}

module.exports = app;
