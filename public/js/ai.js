// Scrawl automaton: a bot wizard that reads the page, defends, and "draws" its runes stroke by stroke.
import { W, H, MID, WIZ_X, WIZ_R, FORMS, makeRune } from './data.js';
import { runeCost, isMover } from './sim.js';

export const LEVELS = [
  { id: 'apprentice', name: 'Wick', title: 'Apprentice automaton', think: 1.0, draw: 0.95, aim: 90, q: [0.3, 0.7], react: 0.45, combo: 0 },
  { id: 'adept', name: 'Marrow', title: 'Adept automaton', think: 0.75, draw: 0.72, aim: 45, q: [0.5, 0.85], react: 0.65, combo: 0.12 },
  { id: 'archmage', name: 'The Archivist', title: 'Archmage automaton', think: 0.4, draw: 0.45, aim: 18, q: [0.8, 1], react: 0.85, combo: 0.15 },
];
const LOADOUTS = [
  [['fire', 'bolt', 'triangle'], ['storm', 'bolt', 'zigzag'], ['earth', 'wall', 'square'], ['life', 'shield', 'circle'], ['void', 'orb', 'spiral'], ['frost', 'sigil', 'cross']],
  [['storm', 'scatter', 'zigzag'], ['frost', 'bolt', 'caret'], ['earth', 'wall', 'square'], ['venom', 'rain', 'wave'], ['life', 'mend', 'circle'], ['void', 'familiar', 'spiral']],
  [['storm', 'bolt', 'zigzag'], ['radiant', 'beam', 'arrow'], ['iron', 'mirror', 'hourglass'], ['fire', 'comet', 'star'], ['life', 'shield', 'circle'], ['umbral', 'hex', 'moon']],
];
export const botLoadout = lvl => LOADOUTS[lvl].map(([el, form, shape], i) => {
  const r = makeRune(el, form, shape, 101 + i * 13 + lvl * 7);
  return { el, form, glyph: r.samples[0] };
});

export class Bot {
  constructor(lvl, p = 1) { this.L = LEVELS[lvl]; this.p = p; this.thinkT = 1.2; this.job = null; }

  // returns a new drawing job or null. Wizards stand still, so the bot defends by walling off,
  // shielding or shooting incoming spells down, and attacks the rest of the time.
  update(S, dt) {
    const p = this.p, w = S.wiz[p], foe = S.wiz[1 - p], side = p === 0 ? 1 : -1;
    if (S.phase !== 'fight') { this.job = null; return null; }
    if (this.job || w.silenceT > 0 || w.shockT > 0) return null;
    this.thinkT -= dt;
    if (this.thinkT > 0) return null;
    this.thinkT = this.L.think * (0.7 + Math.random() * 0.6);

    const lo = S.loadouts[p];
    const ready = (...forms) => lo.map((r, i) => ({ r, i })).filter(({ r, i }) => forms.includes(r.form) && w.cds[i] <= 0 && w.mana >= runeCost(r.form, 1.45));
    const role = ro => ready(...Object.keys(FORMS).filter(f => FORMS[f].role === ro));
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const near = x => p === 0 ? Math.max(WIZ_X[0] + 90, Math.min(MID - 60, x)) : Math.min(WIZ_X[1] - 90, Math.max(MID + 60, x));
    const blocked = e => S.ents.some(o => o.k === 'wall' && o.o === p && Math.abs((o.x - e.x) * e.vy - (o.y - e.y) * e.vx) / (Math.hypot(e.vx, e.vy) || 1) < o.len / 2 && Math.sign(o.x - e.x) === Math.sign(e.vx));
    const threat = S.ents.filter(e => isMover(e) && e.o !== p && !blocked(e))
      .map(e => ({ e, tt: Math.hypot(w.x - e.x, w.y - e.y) / Math.max(60, Math.hypot(e.vx, e.vy)) }))
      .filter(o => o.tt < 1.6 && o.tt > 0.3 && (o.e.dmg >= 11 || o.e.k !== 'bolt' || o.e.ram)).sort((a, b) => b.e.dmg - a.e.dmg)[0];
    const lob = S.ents.find(e => (e.k === 'sigil' || e.k === 'comet' || e.k === 'rain') && e.o !== p && Math.hypot(e.x - w.x, e.y - w.y) < e.r + WIZ_R);
    const self = (arr, size = 110) => arr.length ? { ...pick(arr), cx: w.x, cy: w.y, size } : null;
    let choice = null;

    if ((threat || lob) && this.react(threat ? threat.e.id : lob.id)) {
      if (lob) choice = self(ready('shield', 'thorns').filter(() => w.shield <= 0));
      else {
        const e = threat.e, k = 0.45 + Math.random() * 0.2;
        const px = e.x + (w.x - e.x) * k, py = e.y + (w.y - e.y) * k;
        const big = e.dmg > 18 || e.k !== 'bolt' || e.ram;
        const guards = ready('wall', 'mirror', 'vortex', 'mire', 'mine'), shots = ready('bolt', 'scatter');
        if (guards.length && big && w.mana > 30) choice = { ...pick(guards), cx: near(px), cy: py, size: 130 };
        else if (shots.length) choice = { ...pick(shots), cx: near(px), cy: py, size: 60 + Math.random() * 60 };
        else if (w.shield <= 0) choice = self(ready('shield', 'thorns'));
      }
    }
    const bad = (w.poisonN >= 2) + (w.hexT > 1) + (w.markT > 1) + (w.burnT > 1) + (w.chillT > 1);
    if (!choice && bad >= 2) choice = self(ready('cleanse'));
    if (!choice && w.hp < 110 && Math.random() < 0.35) choice = self(w.shield <= 0 ? ready('mend', 'shield', 'thorns') : ready('mend'));
    if (!choice && Math.random() < this.L.combo) {
      const myWall = S.ents.find(e => e.k === 'wall' && e.o === p), bolts = ready('bolt');
      if (myWall && bolts.length) choice = { ...pick(bolts), cx: myWall.x, cy: myWall.y, size: 110 };
    }
    if (!choice) {
      const opts = [];
      const sh = role('shot'); if (sh.length) opts.push(() => ({ ...pick(sh), cx: near(w.x + side * (130 + Math.random() * 300)), cy: 150 + Math.random() * 600, size: 70 + Math.random() * 90 }), () => ({ ...pick(sh), cx: near(w.x + side * 200), cy: 200 + Math.random() * 500, size: 120 }));
      const lb = role('lob'); if (lb.length && (foe.shield <= 0 || Math.random() < 0.2)) opts.push(() => ({ ...pick(lb), cx: foe.x + (Math.random() - 0.5) * this.L.aim, cy: foe.y + (Math.random() - 0.5) * this.L.aim, size: 120 }));
      const tu = role('turret'); if (tu.length && w.mana > 50) opts.push(() => ({ ...pick(tu), cx: near(w.x + side * 160), cy: w.y + (Math.random() - 0.5) * 300, size: 110 }));
      const cu = role('curse'); if (cu.length && w.mana > 40) opts.push(() => ({ ...pick(cu), cx: foe.x, cy: foe.y, size: 110 }));
      const buff = ready('haste', 'echo'); if (buff.length && w.mana > 45 && w.last) opts.push(() => self(buff));
      const gd = ready('wall', 'mirror', 'mine', 'mire', 'vortex'); if (gd.length && w.mana > 75 && Math.random() < 0.3) opts.push(() => ({ ...pick(gd), cx: w.x + side * 180, cy: w.y + (Math.random() - 0.5) * 160, size: 150 }));
      if (opts.length) choice = pick(opts)();
    }
    if (!choice) return null;
    return this.makeJob(choice, lo[choice.i]);
  }
  react(id) {
    this.seen ||= new Map();
    if (!this.seen.has(id)) { this.seen.set(id, Math.random() < this.L.react); if (this.seen.size > 200) this.seen.clear(); }
    return this.seen.get(id);
  }
  makeJob(c, rune) {
    const size = c.size, cx = Math.max(60, Math.min(W - 60, c.cx)), cy = Math.max(70, Math.min(H - 70, c.cy));
    const strokes = rune.glyph.map(s => s.map(([x, y]) => [cx + (x - 50) / 100 * size, cy + (y - 50) / 100 * size, 3.5 + Math.random() * 1.5]));
    const [q0, q1] = this.L.q;
    this.job = { slot: c.i, strokes, dur: this.L.draw * (0.7 + Math.random() * 0.6), t: 0,
      spec: { slot: c.i, cx, cy, w: size, h: size, ang: null, q: q0 + Math.random() * (q1 - q0) } };
    return this.job;
  }
}
