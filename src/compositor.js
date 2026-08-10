const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { CARD_WIDTH, CARD_HEIGHT, CIRCLE, TEMPLATE_PATH, TEXT } = require('./config');

/**
 * Wraps text to a max width, returns array of lines (used for long names).
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
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
  const ctx = canvas.getContext('2d');

  // 1. Draw the user's photo first (so the template's circle hole reveals it)
  const photoImg = await loadImage(circlePhotoBuffer);
  ctx.save();
  ctx.beginPath();
  ctx.arc(CIRCLE.cx, CIRCLE.cy, CIRCLE.r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(
    photoImg,
    CIRCLE.cx - CIRCLE.r,
    CIRCLE.cy - CIRCLE.r,
    CIRCLE.r * 2,
    CIRCLE.r * 2
  );
  ctx.restore();

  // 2. Draw the branded template on top (has a transparent hole exactly
  //    where the photo should show through, plus the gold ring, hashtag,
  //    header, and all other static branding already baked into the art)
  const templateImg = await loadImage(TEMPLATE_PATH);
  ctx.drawImage(templateImg, 0, 0, CARD_WIDTH, CARD_HEIGHT);

  // 3. Dynamic text only: builder title, name, role — positioned to sit
  //    inside the two divider lines already present in the design.
  const cardCenterX = CARD_WIDTH / 2;
  ctx.textAlign = 'center';

  ctx.font = TEXT.title.font;
  ctx.fillStyle = TEXT.title.color;
  ctx.fillText(`✦ ${fields.builderTitle.toUpperCase()} ✦`, cardCenterX, TEXT.title.y);

  ctx.font = TEXT.name.font;
  ctx.fillStyle = TEXT.name.color;
  const nameLines = wrapText(ctx, fields.name.toUpperCase(), TEXT.cardWidth - 100);
  let nameY = TEXT.name.yStart;
  for (const line of nameLines.slice(0, 2)) {
    ctx.fillText(line, cardCenterX, nameY);
    nameY += TEXT.name.lineHeight;
  }

  ctx.font = TEXT.role.font;
  ctx.fillStyle = TEXT.role.color;
  ctx.fillText(fields.role.toUpperCase(), cardCenterX, TEXT.role.y);

  return canvas.toBuffer('image/png');
}

module.exports = { composeCard };
