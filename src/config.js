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
  TEMPLATE_PATH: path.join(__dirname, '..', 'templates', 'card_template2.png'),

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
    hashtag: { x: 540, y: 335, font: '600 30px "RobotoRegular"', color: '#E040C0', text: '#FRAMEINGOA' },
    // Short quote line used in the header band
    quote: { font: 'italic 20px "Georgia"', color: '#F2C744' },
    // Card zone geometry — detected from templates/card_template.jpg
    // (template-work/find_dividers.js): two divider lines inside the
    // cream card at y=928 and y=1019. Title+name live above the first
    // divider; role lives between the two dividers; below the second
    // divider is decorative padding only.
    // Cream card zone in card_template2.png — spans from y≈756 to y≈1080,
    // x from ~148 to ~940. Two baked-in divider lines sit at approx y=937 and y=1030.
    cardLeft: 148,
    cardTop: 756,
    cardWidth: 792,
    cardHeight: 324,
    divider1Y: 937,
    divider2Y: 1030,
    // Text colours match the reference design: dark forest-green on cream for
    // title/name; deep golden-yellow for role.
    title: { y: 820, font: 'italic bold 26px "RobotoItalic"', color: '#2B4A14' },
    name:  { yStart: 905, font: 'bold 54px "Roboto"', color: '#1C3A0E', lineHeight: 62 },
    role:  { y: 1010, font: 'bold 48px "Roboto"', color: '#C8960A' },
  },

  STORAGE_TTL_MS: 1000 * 60 * 60 * 24, // 24h — generated cards auto-expire
};
