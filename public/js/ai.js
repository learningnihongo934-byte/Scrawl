// Scrawl automaton: a bot wizard that reads the page, dodges, and "draws" its runes stroke by stroke.
import { W, MID, TOP, BOT, WIZ_X, WIZ_R, FORMS, makeRune } from './data.js';
import { runeCost } from './sim.js';

export const LEVELS = [
  { id: 'apprentice', name: 'Wick', title: 'Apprentice automaton', think: 1.0, draw: 0.95, aim: 90, q: [0.3, 0.7], dodge: 0.45, combo: 0 },
  { id: 'adept', name: 'Marrow', title: 'Adept automaton', think: 0.65, draw: 0.7, aim: 45, q: [0.5, 0.85], dodge: 0.7, combo: 0.25 },
  { id: 'archmage', name: 'The Archivist', title: 'Archmage automaton', think: 0.38, draw: 0.48, aim: 18, q: [0.7, 1], dodge: 0.92, combo: 0.5 },
];
const LOADOUTS = [
  [['fire', 'bolt', 'triangle'], ['storm', 'bolt', 'zigzag'], ['earth', 'wall', 'square'], ['life', 'shield', 'circle'], ['void', 'orb', 'spiral'], ['frost', 'sigil', 'cross']],
  [['storm', 'bolt', 'zigzag'], ['frost', 'bolt', 'caret'], ['earth', 'wall', 'square'], ['fire', 'sigil', 'cross'], ['life', 'shield', 'circle'], ['void', 'orb', 'spiral']],
  [['storm', 'bolt', 'zigzag'], ['void', 'bolt', 'caret'], ['earth', 'wall', 'square'], ['fire', 'sigil', 'cross'], ['frost', 'shield', 'circle'], ['fire', 'orb', 'wave']],
];
export const botLoadout = lvl => LOADOUTS[lvl].map(([el, form, shape], i) => {
  const r = makeRune(el, form, shape, 101 + i * 13 + lvl * 7);
  return { el, form, glyph: r.samples[0] };
});

export class Bot {
  constructor(lvl, p = 1) {
    this.L = LEVELS[lvl]; this.p = p; this.thinkT = 1.2; this.job = null; this.wanderY = null; this.wanderT = 0;
  }
  // returns a new drawing job { slot, spec, strokes, dur } or null; also steers the wizard
  update(S, dt) {
    const p = this.p, w = S.wiz[p], foe = S.wiz[1 - p], side = p === 0 ? 1 : -1;
    if (S.phase !== 'fight') { w.dir = 0; this.job = null; return null; }
    // --- movement: dodge sigils and incoming spells, otherwise wander ---
    let dir = 0;
    const sig = S.ents.find(e => e.k === 'sigil' && e.o !== p && Math.hypot(e.x - w.x, e.y - w.y) < e.r + WIZ_R + 10);
    const threat = S.ents.filter(e => (e.k === 'bolt' || e.k === 'orb') && e.o !== p && Math.sign(w.x - e.x) === Math.sign(e.vx || side * -1))
      .map(e => ({ e, tt: Math.abs(w.x - e.x) / Math.max(60, Math.abs(e.vx)) }))
      .filter(o => o.tt < 1.3 && Math.abs(o.e.y - w.y) < WIZ_R + o.e.r + 14).sort((a, b) => a.tt - b.tt)[0];
    if (sig && Math.random() < this.L.dodge + 0.3) dir = w.y >= sig.y ? 1 : -1;
    else if (threat && this.reactRoll(threat.e.id)) dir = threat.e.y > w.y ? -1 : 1;
    else {
      this.wanderT -= dt;
      if (this.wanderT <= 0 || this.wanderY === null) { this.wanderY = TOP + Math.random() * (BOT - TOP); this.wanderT = 1.5 + Math.random() * 2; }
      if (Math.abs(this.wanderY - w.y) > 14) dir = this.wanderY > w.y ? 1 : -1;
    }
    if ((dir < 0 && w.y <= TOP + 4) || (dir > 0 && w.y >= BOT - 4)) dir = -dir;
    w.dir = dir;

    if (this.job) return null;
    this.thinkT -= dt;
    if (this.thinkT > 0) return null;
    this.thinkT = this.L.think * (0.7 + Math.random() * 0.6);

    // --- choose a spell ---
    const lo = S.loadouts[p];
    const ready = form => lo.map((r, i) => ({ r, i })).filter(({ r, i }) => r.form === form && w.cds[i] <= 0 && w.mana >= runeCost(r.form, 1.1));
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const near = x => p === 0 ? Math.min(MID - 60, x) : Math.max(MID + 60, x);
    const aim = () => foe.y + foe.dir * 120 * 0.6 + (Math.random() - 0.5) * this.L.aim * 2;
    let choice = null;

    if (threat && threat.tt > 0.35 && threat.e.dmg > 9 && Math.random() < this.L.dodge) {
      const wl = ready('wall'), sh = ready('shield');
      if (wl.length && Math.random() < 0.6) choice = { ...pick(wl), cx: w.x + side * 150, cy: threat.e.y, size: 130 };
      else if (sh.length) choice = { ...pick(sh), cx: w.x, cy: w.y - 10, size: 110 };
    }
    if (!choice && w.hp < 55 && w.shield <= 0 && Math.random() < 0.35) { const sh = ready('shield'); if (sh.length) choice = { ...pick(sh), cx: w.x, cy: w.y, size: 110 }; }
    if (!choice && Math.random() < this.L.combo) {
      const myWall = S.ents.find(e => e.k === 'wall' && e.o === p);
      const bolts = ready('bolt');
      if (myWall && bolts.length) choice = { ...pick(bolts), cx: myWall.x, cy: myWall.y, size: 110 };
    }
    if (!choice) {
      const opts = [];
      const b = ready('bolt'); if (b.length) opts.push(() => ({ ...pick(b), cx: near(w.x + side * (130 + Math.random() * 200)), cy: aim(), size: 70 + Math.random() * 90 }));
      const o = ready('orb'); if (o.length && w.mana > 55) opts.push(() => ({ ...pick(o), cx: near(w.x + side * 160), cy: w.y, size: 120 }));
      const s = ready('sigil'); if (s.length && (foe.chillT > 0 || foe.dir === 0 || Math.random() < 0.4)) opts.push(() => ({ ...pick(s), cx: foe.x + (Math.random() - 0.5) * 30, cy: foe.y + foe.dir * 60 + (Math.random() - 0.5) * this.L.aim, size: 120 }));
      const wl = ready('wall'); if (wl.length && w.mana > 70 && Math.random() < 0.3) opts.push(() => ({ ...pick(wl), cx: w.x + side * 170, cy: foe.y, size: 150 }));
      if (opts.length) choice = pick(opts)();
    }
    if (!choice) return null;
    return this.makeJob(choice, lo[choice.i]);
  }
  reactRoll(id) {
    this.seen ||= new Map();
    if (!this.seen.has(id)) { this.seen.set(id, Math.random() < this.L.dodge); if (this.seen.size > 200) this.seen.clear(); }
    return this.seen.get(id);
  }
  makeJob(c, rune) {
    const size = c.size, cx = Math.max(60, Math.min(W - 60, c.cx)), cy = Math.max(170, Math.min(800, c.cy));
    const strokes = rune.glyph.map(s => s.map(([x, y]) => [cx + (x - 50) / 100 * size, cy + (y - 50) / 100 * size, 3.5 + Math.random() * 1.5]));
    const [q0, q1] = this.L.q;
    this.job = { slot: c.i, strokes, dur: this.L.draw * (0.7 + Math.random() * 0.6), t: 0,
      spec: { slot: c.i, cx, cy, w: size, h: size, ang: Math.PI / 2, q: q0 + Math.random() * (q1 - q0) } };
    return this.job;
  }
}
void WIZ_X; void FORMS;
