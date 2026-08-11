const fs = require('fs');
const { createCanvas } = require('@napi-rs/canvas');

const width = 1500;
const height = 560;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

ctx.clearRect(0, 0, width, height);
ctx.fillStyle = 'transparent';
ctx.fillRect(0, 0, width, height);

// Large headline
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillStyle = '#f5d90a';
ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
ctx.shadowBlur = 24;
ctx.font = 'bold 220px "Times New Roman", Georgia, serif';
ctx.fillText('HACKER HOUSE', width / 2, height * 0.35);

// Accent word
ctx.font = 'bold 130px "Segoe UI", Arial, sans-serif';
ctx.fillStyle = '#f0338a';
ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
ctx.shadowBlur = 28;
ctx.fillText('गोवा', width / 2, height * 0.52);

// Subhead
ctx.font = 'bold 92px "Times New Roman", Georgia, serif';
ctx.fillStyle = '#f5d90a';
ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
ctx.shadowBlur = 20;
ctx.fillText('GOA 2026', width / 2, height * 0.75);

const out = canvas.toBuffer('image/png');
fs.writeFileSync('./public/images/hacker-house-goa.png', out);
console.log('Created public/images/hacker-house-goa.png');
