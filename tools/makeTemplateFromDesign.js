// Converts a designed template PNG that has a solid black circle as its
// "photo goes here" placeholder into a template with REAL alpha
// transparency in that circle, ready to drop into templates/card_template.png.
//
// Usage: node makeTemplateFromDesign.js <input.png> <outputDir>
// Auto-detects the black circle's center + radius, then punches a true
// transparent hole (slightly inset so the gold ring in the design still
// frames the photo cleanly) and prints the config.js values to use.

const sharp = require('sharp');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

// Finds the LARGEST connected black blob (not just a global bbox of all
// dark pixels) so stray dark text/shading elsewhere in the design doesn't
// throw off the detected circle. Uses a simple flood fill over a
// downsampled grid for speed.
async function detectBlackCircle(inputPath) {
  const { data, info } = await sharp(inputPath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const isBlack = (x, y) => {
    const idx = (y * width + x) * channels;
    return data[idx] < 25 && data[idx + 1] < 25 && data[idx + 2] < 25;
  };

  const visited = new Uint8Array(width * height);
  let best = null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const flatIdx = y * width + x;
      if (visited[flatIdx] || !isBlack(x, y)) continue;

      // BFS flood fill for this blob
      const stack = [[x, y]];
      visited[flatIdx] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, count = 0;

      while (stack.length) {
        const [cx0, cy0] = stack.pop();
        count++;
        if (cx0 < minX) minX = cx0;
        if (cx0 > maxX) maxX = cx0;
        if (cy0 < minY) minY = cy0;
        if (cy0 > maxY) maxY = cy0;

        const neighbors = [[cx0 + 1, cy0], [cx0 - 1, cy0], [cx0, cy0 + 1], [cx0, cy0 - 1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (visited[nIdx]) continue;
          if (!isBlack(nx, ny)) continue;
          visited[nIdx] = 1;
          stack.push([nx, ny]);
        }
      }

      if (!best || count > best.count) {
        best = { minX, maxX, minY, maxY, count };
      }
    }
  }

  if (!best) throw new Error('No black circle detected — check the threshold or input image.');

  const cx = (best.minX + best.maxX) / 2;
  const cy = (best.minY + best.maxY) / 2;
  const r = Math.min(best.maxX - best.minX, best.maxY - best.minY) / 2;

  return { cx: Math.round(cx), cy: Math.round(cy), r: Math.round(r), width, height };
}

async function punchTransparentCircle(inputPath, outputPath, { cx, cy, r, width, height }) {
  // Expand slightly beyond the detected radius to fully remove the
  // anti-aliased dark fringe pixels around the original black circle's
  // edge (those pixels are lighter than the black threshold so the
  // connected-component scan doesn't include them, but they're still
  // visibly dark) — without eating into the gold ring artwork itself.
  const expand = 6;
  const holeRadius = r + expand;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const img = await loadImage(inputPath);
  ctx.drawImage(img, 0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, holeRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
  return { holeRadius };
}

async function main() {
  const inputPath = process.argv[2];
  const outDir = process.argv[3] || '.';
  if (!inputPath) {
    console.error('Usage: node makeTemplateFromDesign.js <input.png> [outputDir]');
    process.exit(1);
  }

  const circle = await detectBlackCircle(inputPath);
  console.log('Detected black circle:', circle);

  const outputPath = path.join(outDir, 'card_template.png');
  const { holeRadius } = await punchTransparentCircle(inputPath, outputPath, circle);

  console.log('\nWrote transparent-hole template to:', outputPath);
  console.log('\n--- Update src/config.js CIRCLE with these values ---');
  console.log(`  CIRCLE: {
    cx: ${circle.cx},
    cy: ${circle.cy},
    r: ${holeRadius},       // hole radius (photo diameter = r*2)
    ringWidth: 0,           // ring is already baked into the design art
    ringColor: 'transparent',
  },`);
  console.log(`\nAlso set CARD_WIDTH: ${circle.width}, CARD_HEIGHT: ${circle.height} if they differ from current config.js.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
