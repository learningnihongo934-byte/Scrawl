// Scrawl: shared constants, elements, forms, fusions and the default runebook shapes.
// Used by the browser game and by nothing on the server (the room server only relays).

export const W = 1600, H = 900, MID = 800;
export const TOP = 140, BOT = 770;          // wizard walking range (y)
export const WIZ_X = [92, W - 92], WIZ_R = 34;
export const ROUND_T = 90, MAX_HP = 100, MAX_MANA = 100, MANA_REGEN = 10;

// Five-way cycle: fire > life > earth > storm > frost > fire. Void sits outside it and slips through walls.
export const EL = {
  fire:  { name: 'Fire',  ink: '#b0391d', beats: 'life',  dmg: 1.2,  speed: 1,    hp: 1,   blurb: 'Hits hardest and leaves a burn.' },
  frost: { name: 'Frost', ink: '#2c5d8c', beats: 'fire',  dmg: 0.9,  speed: 0.9,  hp: 1.1, blurb: 'Chills the enemy: slower feet, slower mana.' },
  storm: { name: 'Storm', ink: '#6b4c9c', beats: 'frost', dmg: 0.85, speed: 1.7,  hp: 0.9, blurb: 'Very fast. Sigils go off sooner.' },
  earth: { name: 'Earth', ink: '#7d5a22', beats: 'storm', dmg: 1.35, speed: 0.65, hp: 1.7, blurb: 'Slow and heavy. Walls are far tougher.' },
  void:  { name: 'Void',  ink: '#2a2433', beats: null,    dmg: 0.85, speed: 1,    hp: 0.9, blurb: 'Passes straight through walls.' },
  life:  { name: 'Life',  ink: '#3c6d37', beats: 'earth', dmg: 0.9,  speed: 1,    hp: 1,   blurb: 'Heals you: bolts drain, shields mend, walls regrow.' },
};
export const EL_IDS = Object.keys(EL);

export const FORMS = {
  bolt:   { name: 'Bolt',   cost: 14, cd: 0.9, blurb: 'Flies straight across the page from where you draw it.' },
  wall:   { name: 'Wall',   cost: 18, cd: 3.5, blurb: 'A barrier where you draw it, on your half. Tall drawings make tall walls.' },
  shield: { name: 'Shield', cost: 24, cd: 7,   blurb: 'Wraps your wizard and soaks damage for six seconds.' },
  sigil:  { name: 'Sigil',  cost: 26, cd: 4.5, blurb: 'Draw it anywhere, even on the enemy. Ignites a moment later.' },
  orb:    { name: 'Orb',    cost: 30, cd: 6,   blurb: 'A slow seeker that hunts the enemy wizard.' },
};
export const FORM_IDS = Object.keys(FORMS);

const FUSE = {
  'fire+frost': 'Steam', 'fire+storm': 'Plasma', 'earth+fire': 'Magma', 'fire+void': 'Hellfire', 'fire+life': 'Phoenix',
  'frost+storm': 'Blizzard', 'earth+frost': 'Glacier', 'frost+void': 'Rime', 'frost+life': 'Dew',
  'earth+storm': 'Sandstorm', 'storm+void': 'Tempest', 'life+storm': 'Squall',
  'earth+void': 'Abyss', 'earth+life': 'Thicket', 'life+void': 'Eclipse',
};
export const fusionName = els => els.length === 1 ? 'Greater ' + EL[els[0]].name : FUSE[[...els].sort().join('+')] || 'Fusion';
export const runeName = r => `${EL[r.el].name} ${FORMS[r.form].name}`;

// ---- default glyph shapes (0..100 box), each a list of strokes of [x, y] ----
const seg = (pts, n = 10) => {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
};
export const SHAPES = {
  triangle: () => [seg([[50, 0], [100, 88], [0, 88], [50, 0]])],
  zigzag:   () => [seg([[22, 0], [78, 28], [22, 62], [78, 100]])],
  square:   () => [seg([[0, 0], [0, 100], [100, 100], [100, 0], [0, 0]])],
  circle:   () => [Array.from({ length: 41 }, (_, i) => { const a = -Math.PI / 2 + i / 40 * Math.PI * 2; return [50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)]; })],
  spiral:   () => [Array.from({ length: 61 }, (_, i) => { const t = i / 60, a = t * Math.PI * 4, r = 50 * (1 - t * 0.85); return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; })],
  cross:    () => [seg([[0, 0], [100, 100]]), seg([[100, 0], [0, 100]])],
  caret:    () => [seg([[0, 100], [50, 0], [100, 100]])],
  wave:     () => [Array.from({ length: 41 }, (_, i) => [i * 2.5, 50 + 40 * Math.sin(i / 40 * Math.PI * 3)])],
};

// A hand-drawn-looking copy of a shape: small rotation, stretch and wobble.
export function jitter(strokes, rand = Math.random, amt = 1) {
  const rot = (rand() - 0.5) * 0.16 * amt, sx = 1 + (rand() - 0.5) * 0.2 * amt, sy = 1 + (rand() - 0.5) * 0.2 * amt;
  const c = Math.cos(rot), s = Math.sin(rot);
  return strokes.map(st => st.map(([x, y]) => {
    x = (x - 50) * sx + (rand() - 0.5) * 4 * amt; y = (y - 50) * sy + (rand() - 0.5) * 4 * amt;
    return [Math.round((50 + x * c - y * s) * 10) / 10, Math.round((50 + x * s + y * c) * 10) / 10];
  }));
}

export const DEFAULT_RUNES = [
  { el: 'fire',  form: 'bolt',   shape: 'triangle' },
  { el: 'storm', form: 'bolt',   shape: 'zigzag' },
  { el: 'earth', form: 'wall',   shape: 'square' },
  { el: 'life',  form: 'shield', shape: 'circle' },
  { el: 'void',  form: 'orb',    shape: 'spiral' },
  { el: 'frost', form: 'sigil',  shape: 'cross' },
];

// small seeded RNG so default runes look the same every load
export function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

export const makeRune = (el, form, shape, seed = 7) => {
  const r = rng(seed);
  return { el, form, samples: [0, 1, 2].map(() => jitter(SHAPES[shape](), r)) };
};
