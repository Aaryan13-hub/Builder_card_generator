// Generates the fun "builder title" tag (e.g. "Terminal Wizard")
// shown above the name. Uses role keyword matching first, falls back
// to a random pick from a general pool so it never feels repetitive.

const ROLE_TITLES = {
  frontend: ['Terminal Wizard', 'Pixel Whisperer', 'CSS Sorcerer', 'DOM Tamer'],
  backend: ['Latency Slayer', 'Query Whisperer', 'Server Shaman', 'Byte Herder'],
  fullstack: ['Stack Overlord', 'End-to-End Enigma', 'Full Stack Nomad'],
  design: ['Pixel Perfectionist', 'Vibe Architect', 'Figma Alchemist'],
  ml: ['Gradient Descender', 'Tensor Tamer', 'Model Whisperer'],
  data: ['Data Druid', 'Pipeline Sorcerer', 'Query Ninja'],
  product: ['Roadmap Rogue', 'Scope Shepherd', 'Feature Forger'],
  founder: ['Chaos Coordinator', 'Vision Vagabond', 'Founder Mode: On'],
  devops: ['Uptime Guardian', 'Container Whisperer', 'Deploy Druid'],
};

const GENERIC_TITLES = [
  'Terminal Wizard', 'Bug Whisperer', 'Ship-It Specialist', 'Midnight Committer',
  'Chaos Engineer', 'Prod Firefighter', 'Merge Conflict Survivor', 'Builder Extraordinaire',
];

function pickRandom(arr, seed) {
  const idx = seed != null ? seed % arr.length : Math.floor(Math.random() * arr.length);
  return arr[idx];
}

/**
 * @param {string} role free-text role/stack the user typed in
 * @param {number} [seed] optional deterministic seed (e.g. hash of name) so
 *                 re-generating the same person's card gives the same title
 */
function generateBuilderTitle(role = '', seed) {
  const normalized = role.toLowerCase();
  const matchKey = Object.keys(ROLE_TITLES).find((key) => normalized.includes(key));
  if (matchKey) return pickRandom(ROLE_TITLES[matchKey], seed);
  return pickRandom(GENERIC_TITLES, seed);
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

module.exports = { generateBuilderTitle, hashString };
