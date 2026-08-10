const sharp = require('sharp');
const heicConvert = require('heic-convert');
const { FACE_PADDING, FALLBACK_CROP } = require('./config');

/**
 * Normalizes any supported upload (JPG/PNG/HEIC/WEBP) into a JPEG buffer
 * with EXIF orientation baked in, so all downstream code can assume a
 * plain top-left-origin raster image.
 */
async function normalizeToJpeg(buffer, originalName = '') {
  const isHeic =
    /\.hei[cf]$/i.test(originalName) ||
    (buffer.slice(4, 12).toString('ascii').includes('ftyp') &&
      /hei[cf]|mif1/i.test(buffer.slice(4, 20).toString('ascii')));

  let workingBuffer = buffer;

  if (isHeic) {
    workingBuffer = await heicConvert({
      buffer,
      format: 'JPEG',
      quality: 0.92,
    });
  }

  // sharp: auto-rotate based on EXIF, normalize to sRGB JPEG
  const normalized = await sharp(workingBuffer)
    .rotate() // applies EXIF orientation then strips it
    .toColorspace('srgb')
    .jpeg({ quality: 95 })
    .toBuffer();

  const meta = await sharp(normalized).metadata();
  return { buffer: normalized, width: meta.width, height: meta.height };
}

/**
 * Computes a square crop rectangle (in source image pixel coords) that
 * will be placed into the circular frame.
 *
 * @param {number} imgW source image width
 * @param {number} imgH source image height
 * @param {object|null} faceBox optional { x, y, width, height } in
 *        FRACTIONS of image size (0..1), as returned by client-side face
 *        detection. If omitted, a heuristic center/upper-bias crop is used.
 */
function computeCropRect(imgW, imgH, faceBox) {
  let x0, y0, x1, y1;

  if (faceBox && isFinite(faceBox.x) && isFinite(faceBox.width)) {
    // Convert fractional face box to pixels
    const fx = faceBox.x * imgW;
    const fy = faceBox.y * imgH;
    const fw = faceBox.width * imgW;
    const fh = faceBox.height * imgH;

    // Expand for headroom + shoulders
    x0 = fx - fw * FACE_PADDING.sides;
    x1 = fx + fw + fw * FACE_PADDING.sides;
    y0 = fy - fh * FACE_PADDING.top;
    y1 = fy + fh + fh * FACE_PADDING.bottom;
  } else {
    // Fallback heuristic: assume subject is roughly centered horizontally,
    // face sits in the upper portion of the frame.
    const cropH = imgH * FALLBACK_CROP.verticalBiasHeight;
    y0 = imgH * FALLBACK_CROP.verticalBiasTop;
    y1 = y0 + cropH;
    const cropW = Math.min(imgW, cropH); // keep it roughly square-ish before final square fit
    x0 = (imgW - cropW) / 2;
    x1 = x0 + cropW;
  }

  // Force square (circle needs 1:1), centered on the computed box
  let w = x1 - x0;
  let h = y1 - y0;
  const side = Math.max(w, h);
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;

  x0 = cx - side / 2;
  y0 = cy - side / 2;

  // Clamp to image bounds, preserving square-ness as best as possible
  x0 = Math.max(0, Math.min(x0, imgW - side));
  y0 = Math.max(0, Math.min(y0, imgH - side));
  const finalSide = Math.min(side, imgW - x0, imgH - y0, imgW, imgH);

  return {
    left: Math.round(Math.max(0, x0)),
    top: Math.round(Math.max(0, y0)),
    size: Math.round(Math.max(1, finalSide)),
  };
}

/**
 * Crops + resizes the source image buffer down to a square photo of the
 * given output diameter, ready to be clipped into the circle by the
 * compositor.
 */
async function cropToCircleSource(jpegBuffer, imgW, imgH, faceBox, outputDiameter) {
  const rect = computeCropRect(imgW, imgH, faceBox);
  const out = await sharp(jpegBuffer)
    .extract({ left: rect.left, top: rect.top, width: rect.size, height: rect.size })
    .resize(outputDiameter, outputDiameter, { fit: 'cover' })
    .jpeg({ quality: 95 })
    .toBuffer();
  return out;
}

/**
 * Combined normalize + crop in a single Sharp pipeline.
 * Replaces the two-step normalizeToJpeg → cropToCircleSource flow.
 * Saves one full encode/decode cycle (~30–50ms).
 *
 * @param {Buffer} buffer        raw upload buffer
 * @param {string} originalName  filename (used for HEIC detection)
 * @param {object|null} faceBox  { x,y,width,height } 0..1 fractions, or null
 * @param {number} outputDiameter target square side length for the circle
 * @returns {Promise<Buffer>} JPEG square ready to be clipped into the circle
 */
async function normalizeAndCrop(buffer, originalName, faceBox, outputDiameter) {
  // 1. HEIC → JPEG conversion if needed (most browsers can't decode HEIC)
  const isHeic =
    /\.hei[cf]$/i.test(originalName) ||
    (buffer.slice(4, 12).toString('ascii').includes('ftyp') &&
      /hei[cf]|mif1/i.test(buffer.slice(4, 20).toString('ascii')));

  let workingBuffer = buffer;
  if (isHeic) {
    const heicConvert = require('heic-convert');
    workingBuffer = await heicConvert({ buffer, format: 'JPEG', quality: 0.92 });
  }

  // 2. Get image dimensions via metadata (no full decode needed)
  const meta = await sharp(workingBuffer).rotate().metadata();
  const { width, height } = meta;

  // 3. Compute crop rectangle from face box or fallback heuristic
  const rect = computeCropRect(width, height, faceBox);

  // 4. Single pipeline: rotate → extract → resize → JPEG
  //    One encode/decode saved vs the old two-step approach.
  return sharp(workingBuffer)
    .rotate()
    .extract({ left: rect.left, top: rect.top, width: rect.size, height: rect.size })
    .resize(outputDiameter, outputDiameter, { fit: 'cover' })
    .jpeg({ quality: 95 })
    .toBuffer();
}

module.exports = { normalizeToJpeg, computeCropRect, cropToCircleSource, normalizeAndCrop };
