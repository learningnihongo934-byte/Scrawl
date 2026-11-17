// Scrawl: shared constants, elements, forms, fusions and the default runebook shapes.
// Used by the browser game and by nothing on the server (the room server only relays).

export const W = 1600, H = 900, MID = 800;
export const TOP = 140, BOT = 770;          // wizard walking range (y)
export const WIZ_X = [92, W - 92], WIZ_R = 34;
export const ROUND_T = 90, MAX_HP = 200, MAX_MANA = 100, MANA_REGEN = 10;

// Each element beats two others (x1.5 when it hits them, x0.67 the other way round) and carries one on-hit status.
export const EL = {
  fire:    { name: 'Fire',    ink: '#b0391d', beats: ['life', 'iron'],     dmg: 1.2,  speed: 1,    hp: 1,   status: 'Burn',    blurb: 'Hits hardest and burns.' },
  frost:   { name: 'Frost',   ink: '#2c5d8c', beats: ['fire', 'gale'],     dmg: 0.9,  speed: 0.9,  hp: 1.1, status: 'Chill',   blurb: "Chills: the enemy's ink refills slower." },
  storm:   { name: 'Storm',   ink: '#6b4c9c', beats: ['frost', 'iron'],    dmg: 0.85, speed: 1.7,  hp: 0.9, status: 'Shock',   blurb: 'Very fast. Hits shock the enemy so they cannot cast for a moment.' },
  earth:   { name: 'Earth',   ink: '#7d5a22', beats: ['storm', 'venom'],   dmg: 1.35, speed: 0.65, hp: 1.7, status: null,      blurb: 'Slow and heavy. Walls and totems are far tougher.' },
  void:    { name: 'Void',    ink: '#2a2433', beats: ['radiant'],          dmg: 0.85, speed: 1,    hp: 0.9, status: null,      blurb: 'Passes straight through walls.' },
  life:    { name: 'Life',    ink: '#3c6d37', beats: ['earth', 'venom'],   dmg: 0.9,  speed: 1,    hp: 1,   status: 'Drain',   blurb: 'Heals you: hits drain life, mending is stronger, walls regrow.' },
  venom:   { name: 'Venom',   ink: '#6a7f1c', beats: ['gale', 'iron'],     dmg: 0.75, speed: 1,    hp: 1,   status: 'Poison',  blurb: 'Poisons: damage over time that stacks three deep.' },
  gale:    { name: 'Gale',    ink: '#3f8580', beats: ['earth', 'fire'],    dmg: 0.8,  speed: 1.4,  hp: 0.8, status: 'Winded',  blurb: "Swift. Winds the enemy so their runes dry slower." },
  iron:    { name: 'Iron',    ink: '#56606c', beats: ['frost', 'earth'],   dmg: 1.15, speed: 0.85, hp: 1.4, status: 'Shatter', blurb: 'Heavy. Breaks through shields at double strength.' },
  radiant: { name: 'Radiant', ink: '#b8840f', beats: ['umbral', 'void'],   dmg: 1,    speed: 1.15, hp: 1,   status: 'Dazzle',  blurb: "Dazzles: the enemy's spells come out weaker for a while." },
  umbral:  { name: 'Umbral',  ink: '#4d2c55', beats: ['life', 'gale'],     dmg: 1,    speed: 1,    hp: 1,   status: 'Hex',     blurb: 'Hexes: the enemy deals less damage for a while.' },
};
export const EL_IDS = Object.keys(EL);

// role tells the automatons how to use a form
export const FORMS = {
  bolt:     { name: 'Bolt',     cost: 14, cd: 0.9, role: 'shot',  blurb: 'Flies at the enemy from where you draw it.' },
  scatter:  { name: 'Scatter',  cost: 18, cd: 1.6, role: 'shot',  blurb: 'Three smaller bolts in a fan.' },
  beam:     { name: 'Beam',     cost: 22, cd: 3,   role: 'shot',  blurb: 'An instant ray from where you draw it. Stops at the first wall.' },
  orb:      { name: 'Orb',      cost: 30, cd: 6,   role: 'shot',  blurb: 'A slow seeker that hunts the enemy wizard.' },
  familiar: { name: 'Familiar', cost: 24, cd: 5,   role: 'shot',  blurb: 'A little creature that walks over and bites. Tough to shoot down.' },
  sigil:    { name: 'Sigil',    cost: 26, cd: 4.5, role: 'lob',   blurb: 'Draw it anywhere, even on the enemy. Ignites a moment later.' },
  comet:    { name: 'Comet',    cost: 34, cd: 7,   role: 'lob',   blurb: 'Falls from the sky onto the spot you drew. Slow but huge.' },
  rain:     { name: 'Rain',     cost: 26, cd: 5,   role: 'lob',   blurb: 'Pours over an area for a few seconds, wearing down whatever is under it.' },
  totem:    { name: 'Totem',    cost: 30, cd: 8,   role: 'turret', blurb: 'A turret on your half that keeps firing small bolts.' },
  wall:     { name: 'Wall',     cost: 18, cd: 3.5, role: 'guard', blurb: 'A barrier where you draw it, on your half. It faces the enemy unless you draw a long line.' },
  mirror:   { name: 'Mirror',   cost: 24, cd: 6,   role: 'guard', blurb: 'A wall that bounces enemy bolts back at them.' },
  shield:   { name: 'Shield',   cost: 24, cd: 7,   role: 'self',  blurb: 'Wraps your wizard and soaks damage for six seconds.' },
  thorns:   { name: 'Thorns',   cost: 26, cd: 8,   role: 'self',  blurb: 'A smaller shield that hurts whoever hits it.' },
  mine:     { name: 'Mine',     cost: 14, cd: 3,   role: 'guard', blurb: 'Lies on your half and bursts when an enemy spell passes over it.' },
  mire:     { name: 'Mire',     cost: 20, cd: 6,   role: 'guard', blurb: 'A swamp patch on your half. Enemy spells crawl through it.' },
  vortex:   { name: 'Vortex',   cost: 28, cd: 7,   role: 'guard', blurb: 'Pulls enemy spells in and crushes them at its heart.' },
  mend:     { name: 'Mend',     cost: 22, cd: 8,   role: 'self',  blurb: 'Heals you over five seconds.' },
  haste:    { name: 'Haste',    cost: 20, cd: 12,  role: 'self',  blurb: 'For five seconds your ink refills twice as fast and runes dry sooner.' },
  cleanse:  { name: 'Cleanse',  cost: 14, cd: 9,   role: 'self',  blurb: 'Washes off burn, poison, chill, hex, mark, silence and the rest.' },
  echo:     { name: 'Echo',     cost: 20, cd: 6,   role: 'self',  blurb: 'Casts your last spell again at 70% strength, in the same spot.' },
  hex:      { name: 'Hex',      cost: 18, cd: 7,   role: 'curse', blurb: 'The enemy deals 30% less damage for five seconds.' },
  mark:     { name: 'Mark',     cost: 16, cd: 6,   role: 'curse', blurb: 'The enemy takes 25% more damage for four seconds.' },
  silence:  { name: 'Silence',  cost: 24, cd: 10,  role: 'curse', blurb: "Every enemy rune takes two more seconds to dry, and they can't cast for a moment." },
  leech:    { name: 'Leech',    cost: 22, cd: 8,   role: 'curse', blurb: "A tether that drinks the enemy's ink and life for four seconds." },
};
export const FORM_IDS = Object.keys(FORMS);

const F = (a, b, n) => [[a, b].sort().join('+'), n];
const FUSE = Object.fromEntries([
  F('fire', 'frost', 'Steam'), F('fire', 'storm', 'Plasma'), F('fire', 'earth', 'Magma'), F('fire', 'void', 'Hellfire'), F('fire', 'life', 'Phoenix'),
  F('frost', 'storm', 'Blizzard'), F('frost', 'earth', 'Glacier'), F('frost', 'void', 'Rime'), F('frost', 'life', 'Dew'),
  F('storm', 'earth', 'Sandstorm'), F('storm', 'void', 'Tempest'), F('storm', 'life', 'Squall'),
  F('earth', 'void', 'Abyss'), F('earth', 'life', 'Thicket'), F('void', 'life', 'Lich'),
  F('fire', 'venom', 'Brimstone'), F('frost', 'venom', 'Nightshade'), F('storm', 'venom', 'Acid Rain'), F('earth', 'venom', 'Bog'), F('void', 'venom', 'Miasma'), F('life', 'venom', 'Thornvine'),
  F('fire', 'gale', 'Firestorm'), F('frost', 'gale', 'Hailwind'), F('storm', 'gale', 'Hurricane'), F('earth', 'gale', 'Dust Devil'), F('void', 'gale', 'Howl'), F('life', 'gale', 'Zephyr'),
  F('fire', 'iron', 'Forge'), F('frost', 'iron', 'Rimesteel'), F('storm', 'iron', 'Lightning Rod'), F('earth', 'iron', 'Ironstone'), F('void', 'iron', 'Black Iron'), F('life', 'iron', 'Ironwood'),
  F('fire', 'radiant', 'Solar Flare'), F('frost', 'radiant', 'Prism'), F('storm', 'radiant', 'Aurora'), F('earth', 'radiant', 'Geode'), F('void', 'radiant', 'Eclipse'), F('life', 'radiant', 'Halo'),
  F('fire', 'umbral', 'Witchfire'), F('frost', 'umbral', 'Black Ice'), F('storm', 'umbral', 'Nightstorm'), F('earth', 'umbral', 'Grave'), F('void', 'umbral', 'Nether'), F('life', 'umbral', 'Twilight'),
  F('gale', 'venom', 'Plague Wind'), F('iron', 'venom', 'Rust'), F('radiant', 'venom', 'Blight'), F('umbral', 'venom', 'Hemlock'),
  F('gale', 'iron', 'Shrapnel'), F('gale', 'radiant', 'Sunwind'), F('gale', 'umbral', 'Banshee'),
  F('iron', 'radiant', 'Gilded'), F('iron', 'umbral', 'Shadowsteel'), F('radiant', 'umbral', 'Dusk'),
]);
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
  star:     () => [seg([[50, 0], [80, 100], [0, 38], [100, 38], [20, 100], [50, 0]], 8)],
  hourglass:() => [seg([[0, 0], [100, 0], [0, 100], [100, 100], [0, 0]], 8)],
  arrow:    () => [seg([[0, 50], [100, 50]]), seg([[65, 15], [100, 50], [65, 85]])],
  loop:     () => [Array.from({ length: 49 }, (_, i) => { const a = i / 48 * Math.PI * 2; return [50 + 48 * Math.sin(a), 50 + 30 * Math.sin(2 * a)]; })],
  check:    () => [seg([[0, 55], [35, 100], [100, 0]])],
  moon:     () => [Array.from({ length: 31 }, (_, i) => { const a = Math.PI * 0.25 + i / 30 * Math.PI * 1.5; return [50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)]; }).concat(Array.from({ length: 21 }, (_, i) => { const a = Math.PI * 1.75 - i / 20 * Math.PI * 1.5; return [62 + 32 * Math.cos(a), 50 + 40 * Math.sin(a)]; }))],
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
