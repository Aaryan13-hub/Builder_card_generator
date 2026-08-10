// Central layout config for the generated card.
// Swap TEMPLATE_PATH for a real designed background later —
// nothing else in the pipeline needs to change as long as
// CIRCLE_* and text zones still line up with the art.

const path = require('path');

module.exports = {
  CARD_WIDTH: 1080,
  CARD_HEIGHT: 1350,

  // Path to the fixed background art (transparent hole where the photo goes).
  // Currently a generated placeholder — replace with final design export.
  TEMPLATE_PATH: path.join(__dirname, '..', 'templates', 'card_template.jpg'),

  // Circular photo window (center x/y, radius) — in card pixel coordinates.
  // Detected from the real design (templates/card_template.jpg) via
  // tools/makeTemplateFromDesign.js — re-run that script and update these
  // if the design art changes.
  CIRCLE: {
    cx: 557,
    cy: 565,
    r: 184,          // matches the actual punched hole radius (detected r=178 + 6px expand) so the photo fills the hole exactly, no gap
    ringWidth: 0,    // ring is already baked into the design art
    ringColor: 'transparent',
  },

  // Minimum "headroom + shoulder" padding ratios used by the fallback
  // auto-crop heuristic when the client doesn't supply a face box.
  FALLBACK_CROP: {
    // assume face sits in the upper-middle of most portrait photos
    verticalBiasTop: 0.12,   // start crop 12% down from top
    verticalBiasHeight: 0.62 // take 62% of image height (face + shoulders)
  },

  // How much room to add around a detected face bounding box
  // to include shoulders, expressed as multipliers of face box size.
  FACE_PADDING: {
    top: 0.55,     // headroom above the face
    bottom: 1.4,   // room below chin for shoulders
    sides: 0.9,    // room left/right
  },

  TEXT: {
    hashtag: { x: 540, y: 335, font: '600 30px "Arial"', color: '#E040C0', text: '#FRAMEINGOA' },
    // Card zone geometry — detected from templates/card_template.jpg
    // (template-work/find_dividers.js): two divider lines inside the
    // cream card at y=928 and y=1019. Title+name live above the first
    // divider; role lives between the two dividers; below the second
    // divider is decorative padding only.
    cardLeft: 240,
    cardWidth: 708,
    divider1Y: 928,
    divider2Y: 1019,
    title: { y: 805, font: 'italic bold 26px "Georgia"', color: '#7A1FA2' },     // "Terminal Wizard"
    name: { yStart: 862, font: 'bold 42px "Arial"', color: '#1B1B1B', lineHeight: 50 },
    role: { y: 978, font: 'bold 30px "Arial"', color: '#7A4A00' },
  },

  STORAGE_TTL_MS: 1000 * 60 * 60 * 24, // 24h — generated cards auto-expire
};
