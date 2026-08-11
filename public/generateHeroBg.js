const fs = require('fs');
const { createCanvas } = require('@napi-rs/canvas');

const width = 1920;
const height = 1080;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// sky gradient
const sky = ctx.createLinearGradient(0, 0, 0, height * 0.65);
sky.addColorStop(0, '#fbe37d');
sky.addColorStop(0.35, '#f8ae7f');
sky.addColorStop(0.6, '#72c79b');
sky.addColorStop(1, '#0c4f2e');
ctx.fillStyle = sky;
ctx.fillRect(0, 0, width, height);

// soft light flare behind sun
const sunGlow = ctx.createRadialGradient(width * 0.78, height * 0.28, 10, width * 0.78, height * 0.28, 190);
sunGlow.addColorStop(0, 'rgba(255, 243, 163, 0.95)');
sunGlow.addColorStop(1, 'rgba(255, 243, 163, 0)');
ctx.fillStyle = sunGlow;
ctx.fillRect(0, 0, width, height);

// sun
ctx.beginPath();
ctx.fillStyle = '#ffda6a';
ctx.arc(width * 0.78, height * 0.28, 90, 0, Math.PI * 2);
ctx.fill();

// ocean roll
ctx.fillStyle = '#1f7d5f';
ctx.beginPath();
ctx.moveTo(0, height * 0.58);
ctx.quadraticCurveTo(width * 0.22, height * 0.54, width * 0.44, height * 0.6);
ctx.quadraticCurveTo(width * 0.7, height * 0.7, width, height * 0.6);
ctx.lineTo(width, height);
ctx.lineTo(0, height);
ctx.closePath();
ctx.fill();

ctx.strokeStyle = 'rgba(255,255,255,0.18)';
ctx.lineWidth = 4;
for (let i = 0; i < 8; i++) {
  const y = height * 0.58 + i * 18;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.quadraticCurveTo(width * 0.3, y - 14, width * 0.55, y + 8);
  ctx.quadraticCurveTo(width * 0.75, y + 16, width, y + 8);
  ctx.stroke();
}

// sand
ctx.fillStyle = '#f9d97e';
ctx.beginPath();
ctx.moveTo(0, height * 0.7);
ctx.quadraticCurveTo(width * 0.2, height * 0.78, width * 0.45, height * 0.74);
ctx.quadraticCurveTo(width * 0.68, height * 0.7, width, height * 0.76);
ctx.lineTo(width, height);
ctx.lineTo(0, height);
ctx.closePath();
ctx.fill();

// palm trunk
ctx.fillStyle = '#0d4222';
ctx.beginPath();
ctx.moveTo(width * 0.15, height * 0.58);
ctx.lineTo(width * 0.16, height * 0.27);
ctx.lineTo(width * 0.18, height * 0.28);
ctx.lineTo(width * 0.17, height * 0.59);
ctx.closePath();
ctx.fill();

// palm leaves
ctx.fillStyle = '#10482b';
const leaves = [
  { x: 0.17, y: 0.25, dx: -0.23, dy: -0.08, r: -0.3 },
  { x: 0.17, y: 0.22, dx: -0.18, dy: -0.14, r: -0.25 },
  { x: 0.17, y: 0.18, dx: -0.08, dy: -0.18, r: -0.18 },
  { x: 0.17, y: 0.25, dx: 0.22, dy: -0.08, r: 0.3 },
  { x: 0.17, y: 0.22, dx: 0.18, dy: -0.14, r: 0.25 },
  { x: 0.17, y: 0.18, dx: 0.08, dy: -0.18, r: 0.18 }
];
for (const leaf of leaves) {
  ctx.save();
  ctx.translate(width * leaf.x, height * leaf.y);
  ctx.rotate(leaf.r);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(width * leaf.dx, height * leaf.dy, width * leaf.dx * 1.6, height * leaf.dy * 1.6);
  ctx.quadraticCurveTo(width * leaf.dx * 1.3, height * leaf.dy * 1.65, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('./public/images/hero-bg.png', buffer);
console.log('Created public/images/hero-bg.png');
