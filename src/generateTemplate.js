// One-off script: builds a placeholder branded background PNG with a
// transparent circular hole where the user photo will be composited.
// This is intentionally simple — swap TEMPLATE_PATH's file for real
// design art later; the compositor only cares about the circle geometry
// in config.js lining up.

const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const { CARD_WIDTH, CARD_HEIGHT, CIRCLE, TEMPLATE_PATH, TEXT } = require('./config');

function drawPalm(ctx, x, y, scale, color = '#0F5C3E') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-10, -40, 0, -80);
  ctx.stroke();
  for (let i = -1; i <= 1; i += 0.5) {
    ctx.beginPath();
    ctx.moveTo(0, -80);
    ctx.quadraticCurveTo(i * 40, -100, i * 70, -70 + Math.abs(i) * 10);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.stroke();
  }
  ctx.restore();
}

function generate() {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background gradient (deep tropical green)
  const grad = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  grad.addColorStop(0, '#0B4A32');
  grad.addColorStop(1, '#0F5C3E');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Decorative border
  ctx.strokeStyle = '#F2C744';
  ctx.lineWidth = 10;
  ctx.strokeRect(20, 20, CARD_WIDTH - 40, CARD_HEIGHT - 40);
  ctx.strokeStyle = '#E040C0';
  ctx.lineWidth = 3;
  ctx.strokeRect(34, 34, CARD_WIDTH - 68, CARD_HEIGHT - 68);

  // Header band
  ctx.fillStyle = '#F2C744';
  ctx.font = '600 26px "Arial"';
  ctx.textAlign = 'center';
  ctx.fillText('GOA, INDIA  ·  28 – 31 OCT 2026', CARD_WIDTH / 2, 90);

  ctx.font = '900 84px "Georgia"';
  ctx.fillStyle = '#F2C744';
  ctx.fillText('HACKER HOUSE', CARD_WIDTH / 2, 180);

  // Motto / quote line (was mistaken for a timestamp — static branding text)
  ctx.font = TEXT.quote.font;
  ctx.fillStyle = TEXT.quote.color;
  ctx.fillText('"Build fast. Ship faster."', CARD_WIDTH / 2, 230);

  // Hashtag
  ctx.font = TEXT.hashtag.font;
  ctx.fillStyle = TEXT.hashtag.color;
  ctx.fillText(TEXT.hashtag.text, CARD_WIDTH / 2, TEXT.hashtag.y);

  // Decorative palms
  drawPalm(ctx, 140, CARD_HEIGHT - 60, 1.3, '#0B4A32aa');
  drawPalm(ctx, CARD_WIDTH - 140, CARD_HEIGHT - 60, 1.3, '#0B4A32aa');

  // Circular photo window: cut a transparent hole + draw the gold ring
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(CIRCLE.cx, CIRCLE.cy, CIRCLE.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(CIRCLE.cx, CIRCLE.cy, CIRCLE.r + CIRCLE.ringWidth / 2, 0, Math.PI * 2);
  ctx.lineWidth = CIRCLE.ringWidth;
  ctx.strokeStyle = CIRCLE.ringColor;
  ctx.stroke();

  // Cream info card at the bottom
  const cardX = (CARD_WIDTH - TEXT.cardWidth) / 2;
  ctx.fillStyle = '#FBF3DC';
  roundRect(ctx, cardX, TEXT.cardTop, TEXT.cardWidth, TEXT.cardHeight, 24);
  ctx.fill();

  fs.writeFileSync(TEMPLATE_PATH, canvas.toBuffer('image/png'));
  console.log('Template written to', TEMPLATE_PATH);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

if (require.main === module) generate();
module.exports = { generate };
