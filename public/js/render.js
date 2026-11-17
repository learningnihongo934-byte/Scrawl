// Scrawl renderer: parchment page, ink strokes, wizards, spells, splatter, HUD. Canvas 2D, all drawn in code.
import { W, H, MID, WIZ_R, EL, FORMS, MAX_HP, MAX_MANA } from './data.js';
import { wallEnds, runeCost } from './sim.js';

export const INK = '#2a2017';
export const PAPER = '#e7d6b0';
export const SIDE_INK = ['#2c3d5c', '#6d2a22'];   // you (left of your view), rival (right)
const HP_INK = '#8e2b1e', MANA_INK = '#2c4f7a';
const R = Math.random;
export const elc = (els, i = 0) => EL[els[Math.min(i, els.length - 1)]]?.ink || INK;
const FELL = '"IM Fell English", Georgia, serif', FELL_SC = '"IM Fell English SC", Georgia, serif';

function wob(g, x1, y1, x2, y2, amt = 1.2) {
  const mx = (x1 + x2) / 2 + (R() - 0.5) * amt, my = (y1 + y2) / 2 + (R() - 0.5) * amt;
  g.moveTo(x1, y1); g.quadraticCurveTo(mx, my, x2, y2);
}
export function roughRect(g, x, y, w, h, amt = 1.2) {
  g.beginPath(); wob(g, x, y, x + w, y, amt); wob(g, x + w, y, x + w, y + h, amt); wob(g, x + w, y + h, x, y + h, amt); wob(g, x, y + h, x, y, amt); g.stroke();
}

export function makeParchment(w = W, h = H, border = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260 * (w * h) / (W * H); i++) {
    const x = R() * w, y = R() * h, r = 40 + R() * 220, dark = R() < 0.55;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, dark ? 'rgba(150,110,60,0.07)' : 'rgba(255,248,228,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.lineWidth = 0.6;
  for (let i = 0; i < 1600 * (w * h) / (W * H); i++) {
    const x = R() * w, y = R() * h, a = R() * Math.PI, l = 4 + R() * 18;
    g.strokeStyle = `rgba(110,80,40,${0.04 + R() * 0.06})`;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l / 2 + R() * 3, y + Math.sin(a) * l / 2 + R() * 3, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < 70 * (w * h) / (W * H); i++) {
    g.fillStyle = `rgba(140,90,40,${0.08 + R() * 0.15})`; g.beginPath(); g.arc(R() * w, R() * h, 1 + R() * 5, 0, 7); g.fill();
  }
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8; }
  g.putImageData(id, 0, 0);
  let gr;
  if (border) {
    const mid = w / 2;
    gr = g.createLinearGradient(mid - 70, 0, mid + 70, 0);
    gr.addColorStop(0, 'rgba(80,50,20,0)'); gr.addColorStop(0.42, 'rgba(80,50,20,0.10)'); gr.addColorStop(0.5, 'rgba(60,35,10,0.32)');
    gr.addColorStop(0.58, 'rgba(80,50,20,0.10)'); gr.addColorStop(1, 'rgba(80,50,20,0)');
    g.fillStyle = gr; g.fillRect(mid - 70, 0, 140, h);
  }
  gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.68);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(95,60,22,0.45)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  if (border) {
    g.strokeStyle = 'rgba(42,32,23,0.55)'; g.lineWidth = 2; roughRect(g, 22, 22, w - 44, h - 44);
    g.lineWidth = 0.8; roughRect(g, 30, 30, w - 60, h - 60);
  }
  return c;
}

// brush: pts [[x, y, w], ...]
export function brush(g, pts, color, alpha = 1, wmul = 1) {
  if (!pts || pts.length < 1) return;
  g.strokeStyle = color; g.fillStyle = color; g.globalAlpha = alpha; g.lineCap = 'round'; g.lineJoin = 'round';
  if (pts.length === 1) { g.beginPath(); g.arc(pts[0][0], pts[0][1], (pts[0][2] || 4) * wmul / 2, 0, 7); g.fill(); return; }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    g.lineWidth = Math.max(0.8, ((a[2] || 4) + (b[2] || 4)) / 2 * wmul);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  g.globalAlpha = 1;
}

// glyph fitted into a box; strokes [[x, y], ...]
export function drawGlyph(g, strokes, x, y, size, color, lw = 2.2) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) for (const p of s) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }
  const sc = (size * 0.78) / Math.max(maxX - minX, maxY - minY, 1);
  const ox = x + size / 2 - (minX + maxX) / 2 * sc, oy = y + size / 2 - (minY + maxY) / 2 * sc;
  g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const s of strokes) {
    g.beginPath();
    s.forEach((p, i) => i ? g.lineTo(ox + p[0] * sc, oy + p[1] * sc) : g.moveTo(ox + p[0] * sc, oy + p[1] * sc));
    g.stroke();
  }
}

function blotPath(g, x, y, r, seed, t = 0) {
  g.beginPath();
  for (let k = 0; k <= 12; k++) {
    const a = k / 12 * Math.PI * 2, rr = r * (0.82 + 0.22 * Math.sin(seed * 13.1 + k * 2.3 + t * 7));
    k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}
function stampBlot(g, x, y, r, c, alpha) {
  g.globalAlpha = alpha; g.fillStyle = c;
  blotPath(g, x, y, r, R() * 100); g.fill();
  const n = 4 + (R() * 6 | 0);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = r * (1.1 + R() * 1.1), rr = r * (0.08 + R() * 0.22);
    g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}

export class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.paper = makeParchment();
    this.stain = document.createElement('canvas'); this.stain.width = W; this.stain.height = H;
    this.sg = this.stain.getContext('2d');
    this.parts = []; this.pops = []; this.glyphs = []; this.rings = []; this.live = new Map();
    this.shake = 0; this.flip = false; this.scale = 1; this.banner = null; this.thumbs = new WeakMap(); this.t = 0;
    this.resize();
  }
  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.max(320, Math.round(r.width * dpr)); this.cv.height = Math.round(this.cv.width * H / W);
    this.scale = this.cv.width / W;
  }
  X(x) { return this.flip ? W - x : x; }
  reset() { this.sg.clearRect(0, 0, W, H); this.parts = []; this.pops = []; this.glyphs = []; this.rings = []; this.live.clear(); this.banner = null; }
  setBanner(text, sub = '', life = 1.6, color = INK) { this.banner = { text, sub, t: 0, life, color }; }
  pop(x, y, text, color = INK, size = 26, life = 1.1) { this.pops.push({ x, y, text, color, size, t: 0, life }); }
  splash(x, y, els, n = 10, speed = 260, size = 4) {
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, s = speed * (0.3 + R());
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: size * (0.5 + R()), c: elc(els, i % 2), t: 0, life: 0.35 + R() * 0.4 });
    }
  }
  ring(x, y, r, els, life = 0.5, width = 3) { this.rings.push({ x, y, r, c: elc(els), c2: elc(els, 1), t: 0, life, width }); }

  // turn sim events into ink effects
  event(e) {
    switch (e.type) {
      case 'cast':
        this.ring(e.x, e.y, e.form === 'wall' ? 60 : 40, e.els, 0.45, 2.5);
        this.splash(e.x, e.y, e.els, 6, 140, 3);
        if (e.fused) this.pop(e.x, e.y - 44, e.fused + (e.ram ? ' Ram!' : '!'), elc(e.els), 30, 1.4);
        else if (e.chain >= 2) this.pop(e.x, e.y - 40, `Flourish ×${(1 + 0.08 * e.chain).toFixed(2)}`, INK, 20, 0.9);
        break;
      case 'hit':
        if (e.amt > 0) {
          this.splash(e.x, e.y, e.els, 8 + Math.min(20, e.amt), 320, 5);
          stampBlot(this.sg, e.x + (R() - 0.5) * 30, e.y + (R() - 0.5) * 30, 6 + Math.min(18, e.amt * 0.6), elc(e.els), 0.32);
          this.pop(e.x, e.y - 30, `−${e.amt}`, HP_INK, 22 + Math.min(16, e.amt * 0.6));
          this.shake = Math.min(14, this.shake + e.amt * 0.45);
        }
        if (e.shielded > 0) this.pop(e.x, e.y - 58, `(${e.shielded} warded)`, MANA_INK, 17);
        break;
      case 'wallhit': this.splash(e.x, e.y, e.els, 6, 180, 3); stampBlot(this.sg, e.x, e.y, 5, elc(e.els), 0.18); break;
      case 'pierce': this.ring(e.x, e.y, 26, e.els, 0.3, 2); break;
      case 'clash':
        this.splash(e.x, e.y, e.els, 14, 300, 4); this.ring(e.x, e.y, 34, e.els, 0.35, 3);
        stampBlot(this.sg, e.x, e.y, 9, elc(e.els), 0.22); this.shake = Math.min(10, this.shake + 3);
        break;
      case 'wallbreak': {
        const [ax, ay, bx, by] = wallEnds(e);
        for (let i = 0; i <= 6; i++) this.splash(ax + (bx - ax) * i / 6, ay + (by - ay) * i / 6, e.els, 3, 200, 4);
        this.pop(e.x, e.y - 20, 'broken', INK, 18);
        break;
      }
      case 'blast': {
        this.ring(e.x, e.y, e.r, e.els, 0.6, 6);
        this.splash(e.x, e.y, e.els, 30, 420, 5);
        const gr = this.sg.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);
        gr.addColorStop(0, 'rgba(60,35,15,0.20)'); gr.addColorStop(0.7, 'rgba(60,35,15,0.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        this.sg.fillStyle = gr; this.sg.beginPath(); this.sg.arc(e.x, e.y, e.r, 0, 7); this.sg.fill();
        stampBlot(this.sg, e.x, e.y, e.r * 0.18, elc(e.els), 0.3);
        this.shake = Math.min(14, this.shake + 7);
        break;
      }
      case 'fade': this.splash(e.x, e.y, e.els, 5, 90, 3); break;
      case 'fail': this.pop(e.x, e.y - 30, e.reason === 'mana' ? 'not enough ink' : 'still drying', '#6b5a48', 19, 1); break;
    }
  }

  // ink being drawn right now: key -> { strokes: [[[x,y,w]...]...] }
  liveInk(key, strokes) { if (strokes) this.live.set(key, strokes); else this.live.delete(key); }
  // a finished glyph that turns into its element colour (cast) or smears away (fizzle)
  glyphDone(strokes, mode, els) {
    this.glyphs.push({ strokes: strokes.map(s => s.map(p => [...p])), mode, c: els ? elc(els) : '#6b5a48', t: 0, life: mode === 'cast' ? 0.7 : 0.9 });
  }

  thumb(rune) {
    let c = this.thumbs.get(rune);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = 96;
      drawGlyph(c.getContext('2d'), rune.glyph || rune.samples[0], 4, 4, 88, elc([rune.el]), 5);
      this.thumbs.set(rune, c);
    }
    return c;
  }

  frame(S, view, dt) {
    const g = this.g; this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    const sx = (R() - 0.5) * this.shake, sy = (R() - 0.5) * this.shake;
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    g.globalAlpha = 1;
    g.drawImage(this.paper, 0, 0);
    g.save(); g.translate(sx, sy);
    if (this.flip) { g.translate(W, 0); g.scale(-1, 1); }
    g.drawImage(this.stain, 0, 0);
    if (S) {
      for (const e of S.ents) if (e.k === 'wall') this.wall(g, e);
      for (const e of S.ents) if (e.k === 'sigil') this.sigil(g, e);
      for (let p = 0; p < 2; p++) this.wizard(g, S, p, view);
      for (const e of S.ents) if (e.k === 'orb') this.orb(g, e);
      for (const e of S.ents) if (e.k === 'bolt') this.bolt(g, e);
    }
    // rings
    for (const r of this.rings) {
      r.t += dt; const k = r.t / r.life;
      g.globalAlpha = Math.max(0, 1 - k); g.strokeStyle = r.c; g.lineWidth = r.width * (1 - k * 0.6);
      g.beginPath(); g.arc(r.x, r.y, r.r * (0.6 + k * 0.6), 0, 7); g.stroke();
    }
    this.rings = this.rings.filter(r => r.t < r.life);
    // flying ink drops, stamped onto the page when they land
    for (const p of this.parts) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 4; p.vy *= 1 - dt * 4;
      g.globalAlpha = 1; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
      if (p.t >= p.life) stampBlot(this.sg, p.x, p.y, p.r * 0.9, p.c, 0.28);
    }
    this.parts = this.parts.filter(p => p.t < p.life);
    // glyphs settling into spells
    for (const gl of this.glyphs) {
      gl.t += dt; const k = gl.t / gl.life;
      if (gl.mode === 'cast') {
        g.save(); g.shadowColor = gl.c; g.shadowBlur = 14 * (1 - k);
        for (const s of gl.strokes) brush(g, s, gl.c, Math.max(0, 1 - k), 1 + k * 0.6);
        g.restore();
        for (const s of gl.strokes) brush(g, s, INK, Math.max(0, 0.9 - k * 2.2));
      } else {
        for (const s of gl.strokes) brush(g, s.map(p => [p[0] + (R() - 0.5) * 2, p[1] + k * k * 26, p[2]]), gl.c, Math.max(0, 0.8 - k * 0.9), 1 + k);
      }
    }
    this.glyphs = this.glyphs.filter(gl => gl.t < gl.life);
    for (const [, strokes] of this.live) for (const s of strokes) brush(g, s, INK, 0.95);
    g.restore();
    g.globalAlpha = 1;

    if (S) this.hud(g, S, view);
    // pops
    for (const p of this.pops) {
      p.t += dt; const k = p.t / p.life;
      g.globalAlpha = Math.max(0, 1 - k * k); g.fillStyle = p.color; g.font = `italic ${p.size}px ${FELL}`; g.textAlign = 'center';
      g.fillText(p.text, this.X(p.x), p.y - k * 30);
    }
    this.pops = this.pops.filter(p => p.t < p.life);
    if (this.banner) {
      const b = this.banner; b.t += dt; const k = b.t / b.life;
      const a = k < 0.15 ? k / 0.15 : k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1;
      g.globalAlpha = a; g.textAlign = 'center'; g.fillStyle = b.color;
      g.font = `${96 + (1 - Math.min(1, k * 4)) * 30}px ${FELL_SC}`; g.fillText(b.text, W / 2, H / 2 + 10);
      if (b.sub) { g.font = `italic 30px ${FELL}`; g.fillText(b.sub, W / 2, H / 2 + 58); }
      if (b.t > b.life) this.banner = null;
    }
    g.globalAlpha = 1;
  }

  wizard(g, S, p, view) {
    const w = S.wiz[p], f = p === 0 ? 1 : -1, t = this.t;
    const mine = p === view.me, ink = SIDE_INK[mine ? 0 : 1];
    const bob = Math.sin(t * 2.4 + p * 2) * 2.5, y = w.y + bob, x = w.x;
    g.save(); g.translate(x, y); g.scale(f, 1);
    if (w.hurtT > 0) g.translate((R() - 0.5) * 6, 0);
    g.globalAlpha = 1; g.lineCap = 'round'; g.lineJoin = 'round';
    // shadow
    g.fillStyle = 'rgba(60,40,20,0.18)'; g.beginPath(); g.ellipse(0, 46, 34, 7, 0, 0, 7); g.fill();
    // robe with hatching
    g.beginPath(); g.moveTo(-14, -8); g.quadraticCurveTo(-22, 20, -30, 44); g.lineTo(30, 44); g.quadraticCurveTo(20, 18, 14, -8); g.closePath();
    g.fillStyle = 'rgba(231,214,176,0.9)'; g.fill();
    g.save(); g.clip(); g.strokeStyle = ink; g.globalAlpha = 0.45; g.lineWidth = 1.3;
    for (let i = -60; i < 60; i += 7) { g.beginPath(); g.moveTo(i, 50); g.lineTo(i + 40, -12); g.stroke(); }
    g.restore();
    g.strokeStyle = INK; g.lineWidth = 2.6; g.globalAlpha = 1;
    g.beginPath(); g.moveTo(-14, -8); g.quadraticCurveTo(-22, 20, -30, 44); g.quadraticCurveTo(0, 49, 30, 44); g.quadraticCurveTo(20, 18, 14, -8); g.stroke();
    // sash
    g.strokeStyle = ink; g.lineWidth = 4; g.beginPath(); g.moveTo(-17, 12); g.quadraticCurveTo(0, 17, 18, 11); g.stroke();
    // head
    g.fillStyle = PAPER; g.strokeStyle = INK; g.lineWidth = 2.4;
    g.beginPath(); g.arc(2, -18, 11, 0, 7); g.fill(); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.arc(7, -19, 1.8, 0, 7); g.fill();
    // beard
    g.beginPath(); g.moveTo(-2, -10); g.quadraticCurveTo(6, 6, 12, -10); g.stroke();
    // hat
    g.fillStyle = ink; g.beginPath(); g.moveTo(-20, -24); g.quadraticCurveTo(-4, -30, 22, -25);
    g.lineTo(10, -32); g.quadraticCurveTo(2, -58, -16, -74); g.quadraticCurveTo(-6, -52, -10, -31); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke();
    // staff, raised while casting
    const lift = w.castT > 0 ? Math.sin((w.castT / 0.4) * Math.PI) * 14 : 0;
    g.lineWidth = 3.2; g.strokeStyle = '#4a3420'; g.beginPath(); g.moveTo(26, 46 - lift); g.lineTo(31, -42 - lift); g.stroke();
    g.fillStyle = w.castT > 0 ? HP_INK : INK; g.beginPath(); g.arc(31, -46 - lift, 4.5, 0, 7); g.fill();
    g.restore();
    // shield ward
    if (w.shield > 0) {
      const k = Math.min(1, w.shield / Math.max(1, w.shieldMax)), c = elc(w.shieldEls);
      g.save(); g.translate(x, w.y); g.rotate(t * 0.8 * f);
      g.strokeStyle = c; g.globalAlpha = 0.35 + 0.5 * k; g.lineWidth = 2 + 4 * k; g.setLineDash([16, 9]);
      g.beginPath(); g.arc(0, -6, WIZ_R + 22, 0, 7); g.stroke();
      g.setLineDash([]); g.lineWidth = 1; g.globalAlpha = 0.25; g.beginPath(); g.arc(0, -6, WIZ_R + 28, 0, 7); g.stroke();
      g.restore();
    }
    // status scribbles
    if (w.burnT > 0) {
      g.strokeStyle = EL.fire.ink; g.lineWidth = 2; g.globalAlpha = 0.85;
      for (let i = 0; i < 3; i++) { const bx = x - 14 + i * 14, by = y - 80 - Math.abs(Math.sin(t * 9 + i)) * 8; g.beginPath(); g.moveTo(bx, by + 12); g.quadraticCurveTo(bx + 6, by + 4, bx, by - 4); g.stroke(); }
    }
    if (w.chillT > 0) {
      g.strokeStyle = EL.frost.ink; g.lineWidth = 1.6; g.globalAlpha = 0.85;
      for (let i = 0; i < 3; i++) {
        const cx = x - 20 + i * 20, cy = y + 58 + Math.sin(t * 3 + i) * 3;
        for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(cx - Math.cos(a) * 5, cy - Math.sin(a) * 5); g.lineTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5); g.stroke(); }
      }
    }
    g.globalAlpha = 1;
  }

  bolt(g, e) {
    const c = elc(e.els), c2 = elc(e.els, 1), dir = Math.sign(e.vx) || 1, r = e.r, t = this.t;
    const ang = Math.atan2(e.vy, e.vx);
    g.save(); g.translate(e.x, e.y); g.rotate(ang); g.lineCap = 'round';
    const storm = e.els.includes('storm');
    for (let i = 0; i < 4; i++) {
      const len = r * (3 + i * 1.3), w1 = Math.sin(t * 18 + e.id + i * 1.7) * r * 0.4;
      g.strokeStyle = i % 2 ? c2 : c; g.globalAlpha = 0.6 - i * 0.12; g.lineWidth = Math.max(1, r * (0.9 - i * 0.18));
      g.beginPath(); g.moveTo(0, (i - 1.5) * r * 0.22);
      if (storm) { for (let k = 1; k <= 4; k++) g.lineTo(-len * k / 4, (k % 2 ? 1 : -1) * r * 0.6 + w1 * 0.3); }
      else g.quadraticCurveTo(-len * 0.5, w1, -len, w1 * 1.6);
      g.stroke();
    }
    g.globalAlpha = 1; g.fillStyle = c;
    if (e.els.includes('earth')) { g.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + e.id, rr = r * (0.8 + 0.25 * ((k * 7 + e.id) % 3) / 2); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); }
    else if (e.els.includes('frost')) { g.beginPath(); g.moveTo(r * 1.5, 0); g.lineTo(-r * 0.6, -r * 0.8); g.lineTo(-r * 0.2, 0); g.lineTo(-r * 0.6, r * 0.8); g.closePath(); g.fill(); }
    else { blotPath(g, 0, 0, r, e.id, t); g.fill(); }
    if (e.els.includes('void')) { g.fillStyle = PAPER; g.beginPath(); g.arc(0, 0, r * 0.45, 0, 7); g.fill(); }
    if (e.els.includes('life')) { g.strokeStyle = PAPER; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-r * 0.6, 0); g.lineTo(r * 0.6, 0); g.stroke(); }
    if (e.els.includes('fire')) { g.fillStyle = c2 === c ? '#d8722c' : c2; g.globalAlpha = 0.8; blotPath(g, r * 0.2, 0, r * 0.5, e.id + 3, t * 2); g.fill(); }
    if (e.ram) { g.strokeStyle = INK; g.lineWidth = 1.5; g.globalAlpha = 0.6; for (let k = -r; k < r; k += 7) { g.beginPath(); g.moveTo(k, -r * 0.7); g.lineTo(k + 6, r * 0.7); g.stroke(); } }
    g.restore(); g.globalAlpha = 1;
    void dir;
  }

  wall(g, e) {
    const [ax, ay, bx, by] = wallEnds(e), c = elc(e.els), c2 = elc(e.els, 1);
    const f = Math.max(0.2, e.hp / e.maxhp), fade = Math.min(1, (e.life - e.t) / 0.8, e.t / 0.15);
    g.lineCap = 'round';
    g.globalAlpha = (0.3 + 0.6 * f) * fade; g.strokeStyle = c; g.lineWidth = 15;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    const nx = -(by - ay) / e.len, ny = (bx - ax) / e.len, n = Math.floor(e.len / 11);
    g.lineWidth = 2; g.globalAlpha = 0.85 * fade;
    for (let i = 0; i <= n; i++) {
      const k = i / n, px = ax + (bx - ax) * k, py = ay + (by - ay) * k, l = 11 + (i % 3) * 3;
      g.strokeStyle = i % 2 ? c2 : INK;
      g.beginPath(); g.moveTo(px - nx * l, py - ny * l); g.lineTo(px + nx * l + (bx - ax) / e.len * 5, py + ny * l + (by - ay) / e.len * 5); g.stroke();
    }
    if (f < 0.6) {
      g.strokeStyle = PAPER; g.lineWidth = 2; g.globalAlpha = fade;
      for (let i = 1; i <= 2; i++) { const k = i / 3, px = ax + (bx - ax) * k, py = ay + (by - ay) * k; g.beginPath(); g.moveTo(px - nx * 9, py - ny * 9); g.lineTo(px + 4, py - 3); g.lineTo(px + nx * 9, py + ny * 9); g.stroke(); }
    }
    g.globalAlpha = 1;
  }

  sigil(g, e) {
    const c = elc(e.els), c2 = elc(e.els, 1), k = Math.min(1, e.t / e.delay), t = this.t;
    g.save(); g.translate(e.x, e.y);
    g.globalAlpha = 0.07 + 0.18 * k; g.fillStyle = c; g.beginPath(); g.arc(0, 0, e.r, 0, 7); g.fill();
    g.globalAlpha = 0.9; g.strokeStyle = c; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, e.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
    g.rotate(t * 0.6); g.strokeStyle = c2; g.lineWidth = 1.5; g.setLineDash([6, 6]);
    g.beginPath(); g.arc(0, 0, e.r * 0.62, 0, 7); g.stroke(); g.setLineDash([]);
    g.strokeStyle = INK; g.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; if (i / 6 > k) break; g.beginPath(); g.moveTo(Math.cos(a) * e.r * 0.62, Math.sin(a) * e.r * 0.62); g.lineTo(Math.cos(a) * e.r * 0.95, Math.sin(a) * e.r * 0.95); g.stroke(); }
    g.beginPath(); for (let i = 0; i <= 5; i++) { const a = i * Math.PI * 4 / 5 - Math.PI / 2; g.lineTo(Math.cos(a) * e.r * 0.3, Math.sin(a) * e.r * 0.3); } g.stroke();
    g.restore(); g.globalAlpha = 1;
  }

  orb(g, e) {
    const c = elc(e.els), c2 = elc(e.els, 1), t = this.t;
    g.save(); g.translate(e.x, e.y);
    g.globalAlpha = 0.25; g.fillStyle = c; g.beginPath(); g.arc(0, 0, e.r * 1.3, 0, 7); g.fill();
    g.globalAlpha = 1; g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, e.r, 0, 7); g.stroke();
    g.rotate(t * 4 + e.id); g.strokeStyle = c2; g.lineWidth = 2;
    g.beginPath(); for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 3, rr = e.r * 0.9 * (1 - i / 30); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.stroke();
    g.restore();
    g.fillStyle = c; g.globalAlpha = 0.5;
    for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(e.x - e.vx * 0.04 * i, e.y - e.vy * 0.04 * i, e.r * 0.3 / i, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  }

  hud(g, S, view) {
    const left = this.flip ? 1 : 0;
    for (const side of [0, 1]) {
      const p = side === 0 ? left : 1 - left, w = S.wiz[p];
      const bx = side === 0 ? 56 : W - 56 - 400, al = side === 0 ? 'left' : 'right', nx = side === 0 ? 56 : W - 56;
      g.textAlign = al; g.fillStyle = SIDE_INK[p === view.me ? 0 : 1]; g.font = `italic 28px ${FELL}`;
      g.fillText(S.names?.[p] || (p ? 'Rival' : 'You'), nx, 66);
      // wax seals for rounds won
      for (let i = 0; i < 2; i++) {
        const cx = side === 0 ? nx + 300 + i * 30 : nx - 300 - i * 30;
        g.globalAlpha = 1; g.strokeStyle = '#7a2418'; g.lineWidth = 1.6; g.beginPath(); g.arc(cx, 57, 11, 0, 7);
        if (S.wins[p] > i) { g.fillStyle = '#9a2a1c'; g.fill(); g.strokeStyle = '#5c160c'; }
        g.stroke();
      }
      // health ribbon
      const hp = Math.max(0, w.hp) / MAX_HP;
      g.fillStyle = HP_INK; g.globalAlpha = 0.85;
      const fw = 400 * hp; g.fillRect(side === 0 ? bx : bx + 400 - fw, 80, fw, 16);
      if (w.shield > 0) { g.fillStyle = elc(w.shieldEls); g.globalAlpha = 0.45; const sw = Math.min(400, 400 * w.shield / MAX_HP); g.fillRect(side === 0 ? bx : bx + 400 - sw, 80, sw, 6); }
      g.globalAlpha = 1; g.strokeStyle = INK; g.lineWidth = 1.6; roughRect(g, bx, 80, 400, 16, 0.8);
      // mana
      const mn = w.mana / MAX_MANA, mw = 400 * mn;
      g.fillStyle = MANA_INK; g.globalAlpha = w.chillT > 0 ? 0.45 : 0.8; g.fillRect(side === 0 ? bx : bx + 400 - mw, 102, mw, 8);
      g.globalAlpha = 1; g.lineWidth = 1; roughRect(g, bx, 102, 400, 8, 0.6);
      g.font = `14px ${FELL}`; g.fillStyle = INK; g.textAlign = al;
      g.fillText(`${Math.ceil(w.hp)} life · ${Math.floor(w.mana)} ink`, side === 0 ? bx : bx + 400, 128);
      // rune strip
      const lo = S.loadouts?.[p]; if (!lo) continue;
      const mine = p === view.me, sz = mine ? 62 : 44, gap = mine ? 72 : 52, y0 = H - 56 - sz;
      lo.forEach((r, i) => {
        const x = side === 0 ? 56 + i * gap : W - 56 - sz - (lo.length - 1 - i) * gap;
        const cost = runeCost(r.form, 1), cd = w.cds[i], ready = cd <= 0 && w.mana >= cost;
        g.globalAlpha = ready ? 1 : 0.45; g.drawImage(this.thumb(r), x, y0, sz, sz);
        g.strokeStyle = INK; g.lineWidth = 1.2; roughRect(g, x, y0, sz, sz, 0.7);
        if (cd > 0) { g.globalAlpha = 0.7; g.fillStyle = PAPER; g.fillRect(x + 1, y0 + 1, sz - 2, (sz - 2) * Math.min(1, cd / FORMS[r.form].cd)); }
        g.globalAlpha = 1;
        if (mine) {
          g.font = `12px ${FELL}`; g.fillStyle = INK; g.textAlign = 'center';
          g.fillText(FORMS[r.form].name, x + sz / 2, y0 + sz + 14);
          g.textAlign = 'right'; g.fillStyle = MANA_INK; g.fillText(cost, x + sz - 3, y0 + 13);
        }
      });
      if (p === view.me && S.t - w.chainT < 1.6 && w.chain >= 1) {
        g.font = `italic 20px ${FELL}`; g.fillStyle = HP_INK; g.textAlign = al;
        g.fillText(`flourish ×${(1 + 0.08 * Math.min(5, w.chain + 1)).toFixed(2)} if you cast now`, side === 0 ? 56 : W - 56, y0 - 14);
      }
    }
    // timer
    g.textAlign = 'center'; g.fillStyle = INK; g.globalAlpha = 1;
    g.font = `18px ${FELL_SC}`; g.fillText(`Round ${['I', 'II', 'III', 'IV', 'V'][S.round - 1] || S.round}`, W / 2, 56);
    const tt = Math.max(0, Math.ceil(S.roundT)); g.font = `44px ${FELL_SC}`;
    g.fillStyle = tt <= 10 && S.phase === 'fight' ? HP_INK : INK;
    g.fillText(`${Math.floor(tt / 60)}:${String(tt % 60).padStart(2, '0')}`, W / 2, 100);
    if (S.phase === 'count') {
      g.font = `120px ${FELL_SC}`; g.fillStyle = INK; g.globalAlpha = 0.85;
      g.fillText(String(Math.ceil(S.phaseT)), W / 2, H / 2 + 40);
      g.globalAlpha = 1;
    }
  }
}
