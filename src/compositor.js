const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const {
  CARD_WIDTH,
  CARD_HEIGHT,
  CIRCLE,
  TEMPLATE_PATH,
  TEXT,
} = require("./config");

// Register bundled fonts so text renders correctly on Vercel's Linux environment
// (Arial and Georgia are Windows/Mac system fonts — not available on Linux).
const FONTS_DIR = path.join(__dirname, '..', 'fonts');
GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Roboto-Bold.ttf'), 'Roboto');
GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Roboto-BoldItalic.ttf'), 'RobotoItalic');
GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Roboto-Regular.ttf'), 'RobotoRegular');

/**
 * Wraps text to a max width, returns array of lines (used for long names).
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawCircularPhoto(ctx, photoImg) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(CIRCLE.cx, CIRCLE.cy, CIRCLE.r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(
    photoImg,
    CIRCLE.cx - CIRCLE.r,
    CIRCLE.cy - CIRCLE.r,
    CIRCLE.r * 2,
    CIRCLE.r * 2,
  );
  ctx.restore();
}

// ---- Template cache -------------------------------------------------------
// The template image never changes between requests — load it once and reuse.
// This saves ~80-120ms of disk I/O + PNG decode on every generation.
let _cachedTemplateImg = null;
let _cachedHasHole = null;

async function getTemplate() {
  if (_cachedTemplateImg) return { templateImg: _cachedTemplateImg, hasHole: _cachedHasHole };

  const templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  _cachedTemplateImg = await loadImage(templateBuffer);

  // Probe once whether the template has a transparent hole
  const probe = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const probeCtx = probe.getContext('2d');
  probeCtx.drawImage(_cachedTemplateImg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  _cachedHasHole = probeCtx.getImageData(CIRCLE.cx, CIRCLE.cy, 1, 1).data[3] < 8;

  return { templateImg: _cachedTemplateImg, hasHole: _cachedHasHole };
}

/**
 * Builds the final card PNG buffer.
 *
 * @param {Buffer} circlePhotoBuffer square JPEG already cropped to the
 *        circle diameter (from imagePrep.cropToCircleSource)
 * @param {object} fields { name, role, builderTitle }
 * @returns {Promise<Buffer>} final PNG buffer
 */
async function composeCard(circlePhotoBuffer, fields) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Use cached template — no disk read or PNG decode after first request
  const { templateImg, hasHole } = await getTemplate();

  // 1. Draw photo and template in the right order:
  //    - transparent-hole templates: photo below template
  //    - opaque templates (e.g. JPG): photo above template
  const photoImg = await loadImage(circlePhotoBuffer);
  if (hasHole) {
    drawCircularPhoto(ctx, photoImg);
    ctx.drawImage(templateImg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  } else {
    ctx.drawImage(templateImg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
    drawCircularPhoto(ctx, photoImg);
  }

  // 2. Dynamic text only: builder title, name, role — positioned to sit
  //    inside the two divider lines already present in the design.
  const cardCenterX = CARD_WIDTH / 2;
  ctx.textAlign = "center";

  ctx.font = TEXT.title.font;
  ctx.fillStyle = TEXT.title.color;
  ctx.fillText(
    `✦ ${fields.builderTitle.toUpperCase()} ✦`,
    cardCenterX,
    TEXT.title.y,
  );

  ctx.font = TEXT.name.font;
  ctx.fillStyle = TEXT.name.color;
  const nameLines = wrapText(
    ctx,
    fields.name.toUpperCase(),
    TEXT.cardWidth - 100,
  );
  let nameY = TEXT.name.yStart;
  for (const line of nameLines.slice(0, 2)) {
    ctx.fillText(line, cardCenterX, nameY);
    nameY += TEXT.name.lineHeight;
  }

  ctx.font = TEXT.role.font;
  ctx.fillStyle = TEXT.role.color;
  ctx.fillText(fields.role.toUpperCase(), cardCenterX, TEXT.role.y);

  // Output JPEG — ~5x faster than PNG compression with negligible quality loss
  // for a social-share card. Quality 0.92 is visually lossless.
  return canvas.toBuffer("image/jpeg", { quality: 0.92 });
}

module.exports = { composeCard };
