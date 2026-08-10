const fs = require("fs");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const {
  CARD_WIDTH,
  CARD_HEIGHT,
  CIRCLE,
  TEMPLATE_PATH,
  TEXT,
} = require("./config");

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

function hasTransparentHole(templateImg) {
  const probe = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const probeCtx = probe.getContext("2d");
  probeCtx.drawImage(templateImg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  const alpha = probeCtx.getImageData(CIRCLE.cx, CIRCLE.cy, 1, 1).data[3];
  return alpha < 8;
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

  const templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  const templateImg = await loadImage(templateBuffer);

  // 1. Draw photo and template in the right order:
  //    - transparent-hole templates: photo below template
  //    - opaque templates (e.g. JPG): photo above template
  const photoImg = await loadImage(circlePhotoBuffer);
  if (hasTransparentHole(templateImg)) {
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

  return canvas.toBuffer("image/png");
}

module.exports = { composeCard };
