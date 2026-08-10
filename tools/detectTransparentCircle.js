// Detects the transparent circle (alpha hole) in a PNG template
// Usage: node tools/detectTransparentCircle.js templates/card_template2.png

const sharp = require('sharp');

async function main() {
  const inputPath = process.argv[2] || 'templates/card_template2.png';
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const channels = 4; // RGBA

  // Find all transparent pixels (alpha < 8)
  let minX = width, maxX = 0, minY = height, maxY = 0, found = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * channels + 3];
      if (alpha < 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found++;
      }
    }
  }

  if (!found) {
    console.log('No transparent pixels found — template has no hole.');
    return;
  }

  const cx = Math.round((minX + maxX) / 2);
  const cy = Math.round((minY + maxY) / 2);
  const r  = Math.round(Math.min(maxX - minX, maxY - minY) / 2);

  console.log(`Image size: ${width} x ${height}`);
  console.log(`Transparent pixels: ${found}`);
  console.log(`Bounding box: x[${minX}..${maxX}]  y[${minY}..${maxY}]`);
  console.log('\n--- Paste into config.js ---');
  console.log(`  CIRCLE: {
    cx: ${cx},
    cy: ${cy},
    r:  ${r},
    ringWidth: 0,
    ringColor: 'transparent',
  },`);
  console.log(`\n  CARD_WIDTH:  ${width}`);
  console.log(`  CARD_HEIGHT: ${height}`);
}

main().catch(err => { console.error(err); process.exit(1); });
