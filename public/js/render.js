// Scrawl 2D layers: the parchment page texture (ink, stains, sigil circles, splatter) that the 3D book shows,
// and the HUD overlay (life, ink, runes, timer, pops, banners). Canvas 2D, all drawn in code.
import { W, H, EL, FORMS, MAX_HP, MAX_MANA } from './data.js';
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

const STATUS = [
  ['burnT', 'burning', '#b0391d'], ['chillT', 'chilled', '#2c5d8c'], ['shockT', 'shocked', '#6b4c9c'], ['windT', 'winded', '#3f8580'],
  ['dazzleT', 'dazzled', '#b8840f'], ['hexT', 'hexed', '#4d2c55'], ['markT', 'marked', '#8e2b1e'], ['silenceT', 'silenced', '#2a2017'],
  ['hasteT', 'hasted', '#3f8580'], ['regenT', 'mending', '#3c6d37'], ['leechT', 'leeching', '#3c6d37'],
];
export function statusList(w) {
  const out = STATUS.filter(([k]) => w[k] > 0).map(([, n, c]) => [n, c]);
  if (w.poisonN > 0) out.splice(1, 0, [`poison ×${w.poisonN}`, '#6a7f1c']);
  if (w.thorns && w.shield > 0) out.push(['thorns', '#7d5a22']);
  return out;
}

// The page texture (what the 3D book shows) plus the HUD overlay.
export class PageLayer {
  constructor() {
    this.cv = document.createElement('canvas'); this.cv.width = W; this.cv.height = H;
    this.g = this.cv.getContext('2d');
    this.paper = makeParchment();
    this.stain = document.createElement('canvas'); this.stain.width = W; this.stain.height = H;
    this.sg = this.stain.getContext('2d');
    this.slip = makeParchment(320, 160, false);
    this.parts = []; this.pops = []; this.glyphs = []; this.rings = []; this.live = new Map();
    this.banner = null; this.thumbs = new WeakMap(); this.t = 0; this.guide = null; this.shake = 0;
  }
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

  event(e) {
    switch (e.type) {
      case 'cast':
        if (e.form !== 'beam') this.ring(e.x, e.y, e.form === 'wall' ? 60 : 40, e.els, 0.45, 2.5);
        if (e.fused) this.pop(e.x, e.y, e.fused + (e.ram ? ' Ram!' : '!'), elc(e.els), 32, 1.4);
        else if (e.echoed) this.pop(e.x, e.y, `Echo: ${FORMS[e.echoed].name}`, elc(e.els), 22, 1);
        else if (e.chain >= 2) this.pop(e.x, e.y, `Flourish ×${(1 + 0.08 * e.chain).toFixed(2)}`, INK, 20, 0.9);
        break;
      case 'hit':
        if (e.amt > 0) {
          stampBlot(this.sg, e.x + (R() - 0.5) * 30, e.y + (R() - 0.5) * 30, 6 + Math.min(18, e.amt * 0.6), elc(e.els), 0.32);
          this.pop(e.x, e.y, `−${e.amt}`, HP_INK, 24 + Math.min(16, e.amt * 0.6));
          this.shake = Math.min(1, this.shake + e.amt * 0.03);
        }
        if (e.shielded > 0) this.pop(e.x, e.y - 30, `(${e.shielded} warded)`, MANA_INK, 18);
        break;
      case 'wallhit': this.splash(e.x, e.y, e.els, 6, 180, 3); stampBlot(this.sg, e.x, e.y, 5, elc(e.els), 0.18); break;
      case 'pierce': case 'reflect': this.ring(e.x, e.y, 26, e.els, 0.3, 2); if (e.type === 'reflect') this.pop(e.x, e.y, 'reflected', elc(e.els), 18, 0.8); break;
      case 'clash': this.splash(e.x, e.y, e.els, 14, 300, 4); this.ring(e.x, e.y, 34, e.els, 0.35, 3); stampBlot(this.sg, e.x, e.y, 9, elc(e.els), 0.22); this.shake = Math.min(1, this.shake + 0.15); break;
      case 'wallbreak': {
        const [ax, ay, bx, by] = wallEnds(e);
        for (let i = 0; i <= 6; i++) this.splash(ax + (bx - ax) * i / 6, ay + (by - ay) * i / 6, e.els, 3, 200, 4);
        break;
      }
      case 'blast': {
        this.ring(e.x, e.y, e.r, e.els, 0.6, 6); this.splash(e.x, e.y, e.els, e.small ? 12 : 30, 420, 5);
        const gr = this.sg.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);
        gr.addColorStop(0, 'rgba(60,35,15,0.22)'); gr.addColorStop(0.7, 'rgba(60,35,15,0.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        this.sg.fillStyle = gr; this.sg.beginPath(); this.sg.arc(e.x, e.y, e.r, 0, 7); this.sg.fill();
        stampBlot(this.sg, e.x, e.y, e.r * 0.18, elc(e.els), 0.3);
        this.shake = Math.min(1, this.shake + (e.comet ? 0.9 : 0.5));
        break;
      }
      case 'beam': {
        const g = this.sg; g.strokeStyle = elc(e.els); g.globalAlpha = 0.25; g.lineWidth = 6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(e.x1, e.y1); g.lineTo(e.x2, e.y2); g.stroke(); g.globalAlpha = 1;
        this.splash(e.x2, e.y2, e.els, 10, 260, 4);
        break;
      }
      case 'curse': this.pop(e.x, e.y, FORMS[e.form].name.toLowerCase() + (e.form === 'leech' ? '' : 'ed'), elc(e.els), 24, 1.2); break;
      case 'buff': this.pop(e.x ?? 0, e.y ?? 0, '', INK, 1, 0.01); break;
      case 'fade': this.splash(e.x, e.y, e.els, 5, 90, 3); break;
      case 'fail': this.pop(e.x, e.y, e.reason === 'mana' ? 'not enough ink' : e.reason === 'silenced' ? 'silenced' : e.reason === 'echo' ? 'nothing to echo' : 'still drying', '#6b5a48', 20, 1); break;
    }
  }
  liveInk(key, strokes) { if (strokes) this.live.set(key, strokes); else this.live.delete(key); }
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

  // ---- the page texture ----
  drawPage(S, dt) {
    const g = this.g; this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    g.drawImage(this.paper, 0, 0);
    g.drawImage(this.stain, 0, 0);
    if (S) for (const e of S.ents) {
      if (e.k === 'sigil' || e.k === 'comet') this.sigil(g, e);
      else if (e.k === 'zone') this.zone(g, e);
      else if (e.k === 'rain') { g.globalAlpha = 0.12; g.fillStyle = elc(e.els); g.beginPath(); g.arc(e.x, e.y, e.r, 0, 7); g.fill(); g.globalAlpha = 1; }
    }
    if (this.guide) {
      const gd = this.guide, a = 0.25 + 0.15 * Math.sin(this.t * 4);
      g.save(); g.setLineDash([10, 8]); drawGlyph(g, gd.strokes, gd.x - gd.size / 2, gd.y - gd.size / 2, gd.size, gd.c, 5); g.restore();
      g.globalAlpha = a; g.strokeStyle = gd.c; g.lineWidth = 2; g.beginPath(); g.arc(gd.x, gd.y, gd.size * 0.62, 0, 7); g.stroke(); g.globalAlpha = 1;
    }
    for (const r of this.rings) {
      r.t += dt; const k = r.t / r.life;
      g.globalAlpha = Math.max(0, 1 - k); g.strokeStyle = r.c; g.lineWidth = r.width * (1 - k * 0.6);
      g.beginPath(); g.arc(r.x, r.y, r.r * (0.6 + k * 0.6), 0, 7); g.stroke();
    }
    this.rings = this.rings.filter(r => r.t < r.life);
    for (const p of this.parts) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 4; p.vy *= 1 - dt * 4;
      g.globalAlpha = 1; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
      if (p.t >= p.life) stampBlot(this.sg, p.x, p.y, p.r * 0.9, p.c, 0.28);
    }
    this.parts = this.parts.filter(p => p.t < p.life);
    for (const gl of this.glyphs) {
      gl.t += dt; const k = gl.t / gl.life;
      if (gl.mode === 'cast') {
        g.save(); g.shadowColor = gl.c; g.shadowBlur = 14 * (1 - k);
        for (const s of gl.strokes) brush(g, s, gl.c, Math.max(0, 1 - k), 1 + k * 0.6);
        g.restore();
        for (const s of gl.strokes) brush(g, s, INK, Math.max(0, 0.9 - k * 2.2));
      } else for (const s of gl.strokes) brush(g, s.map(p => [p[0] + (R() - 0.5) * 2, p[1] + k * k * 26, p[2]]), gl.c, Math.max(0, 0.8 - k * 0.9), 1 + k);
    }
    this.glyphs = this.glyphs.filter(gl => gl.t < gl.life);
    for (const [, strokes] of this.live) for (const s of strokes) brush(g, s, INK, 0.95);
    g.globalAlpha = 1;
  }
  sigil(g, e) {
    const c = elc(e.els), c2 = elc(e.els, 1), k = Math.min(1, e.t / e.delay), t = this.t;
    g.save(); g.translate(e.x, e.y);
    g.globalAlpha = 0.07 + 0.2 * k; g.fillStyle = c; g.beginPath(); g.arc(0, 0, e.r, 0, 7); g.fill();
    g.globalAlpha = 0.9; g.strokeStyle = c; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, e.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
    g.rotate(t * 0.6); g.strokeStyle = c2; g.lineWidth = 1.5; g.setLineDash([6, 6]);
    g.beginPath(); g.arc(0, 0, e.r * 0.62, 0, 7); g.stroke(); g.setLineDash([]);
    g.strokeStyle = INK; g.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) { if (i / 6 > k) break; const a = i / 6 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * e.r * 0.62, Math.sin(a) * e.r * 0.62); g.lineTo(Math.cos(a) * e.r * 0.95, Math.sin(a) * e.r * 0.95); g.stroke(); }
    if (e.k === 'comet') { g.globalAlpha = 0.6; g.beginPath(); g.moveTo(-e.r * 0.3, 0); g.lineTo(e.r * 0.3, 0); g.moveTo(0, -e.r * 0.3); g.lineTo(0, e.r * 0.3); g.stroke(); }
    else { g.beginPath(); for (let i = 0; i <= 5; i++) { const a = i * Math.PI * 4 / 5 - Math.PI / 2; g.lineTo(Math.cos(a) * e.r * 0.3, Math.sin(a) * e.r * 0.3); } g.stroke(); }
    g.restore(); g.globalAlpha = 1;
  }
  zone(g, e) {
    const c = elc(e.els), fade = Math.min(1, (e.life - e.t) / 0.6, e.t / 0.2), t = this.t;
    g.save(); g.translate(e.x, e.y); g.globalAlpha = 0.16 * fade; g.fillStyle = c; g.beginPath(); g.arc(0, 0, e.r, 0, 7); g.fill();
    g.globalAlpha = 0.7 * fade; g.strokeStyle = c; g.lineWidth = 2;
    if (e.z === 'vortex') {
      g.rotate(-t * 3);
      for (let k = 0; k < 3; k++) { g.beginPath(); for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2 + k * 2.1, r = e.r * (1 - i / 32); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); }
    } else {
      for (let i = 0; i < 7; i++) { const a = i * 2.4 + t * 0.4, r = e.r * (0.3 + (i % 3) * 0.22); g.beginPath(); g.ellipse(Math.cos(a) * r, Math.sin(a) * r * 0.6, 14, 6, 0, 0, 7); g.stroke(); }
    }
    g.restore(); g.globalAlpha = 1;
  }

  // ---- overlay: HUD, floating numbers, banners. project(x, y) -> [sx, sy] in W x H screen space ----
  drawOverlay(g, S, view, dt, project) {
    g.setTransform(g.canvas.width / W, 0, 0, g.canvas.width / W, 0, 0);
    g.clearRect(0, 0, W, H);
    if (S) this.hud(g, S, view);
    for (const p of this.pops) {
      p.t += dt; const k = p.t / p.life;
      const at = project(p.x, p.y); if (!at) continue;
      g.globalAlpha = Math.max(0, 1 - k * k); g.textAlign = 'center'; g.font = `italic ${p.size}px ${FELL}`;
      g.lineWidth = 4; g.strokeStyle = 'rgba(241,228,196,0.9)'; g.strokeText(p.text, at[0], at[1] - 40 - k * 40);
      g.fillStyle = p.color; g.fillText(p.text, at[0], at[1] - 40 - k * 40);
    }
    this.pops = this.pops.filter(p => p.t < p.life);
    if (this.banner) {
      const b = this.banner; b.t += dt; const k = b.t / b.life;
      const a = k < 0.15 ? k / 0.15 : k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1;
      g.globalAlpha = a * 0.92; this.slipAt(g, W / 2 - 330, H / 2 - 110, 660, b.sub ? 190 : 150);
      g.globalAlpha = a; g.textAlign = 'center'; g.fillStyle = b.color;
      g.font = `${92 + (1 - Math.min(1, k * 4)) * 26}px ${FELL_SC}`; g.fillText(b.text, W / 2, H / 2 + 6);
      if (b.sub) { g.font = `italic 26px ${FELL}`; g.fillText(b.sub, W / 2, H / 2 + 52); }
      if (b.t > b.life) this.banner = null;
    }
    g.globalAlpha = 1;
  }
  slipAt(g, x, y, w, h) {
    const a = g.globalAlpha;
    g.fillStyle = 'rgba(10,6,3,0.45)'; g.fillRect(x + 5, y + 6, w, h);
    g.globalAlpha = a; g.drawImage(this.slip, x, y, w, h);
    g.strokeStyle = INK; g.lineWidth = 1.4; roughRect(g, x, y, w, h, 0.6);
  }
  // rune cells of the player's own strip, in overlay space (for tap-to-quick-cast)
  cells(n = 6) {
    const sz = 64, gap = 74, y0 = H - 30 - sz;
    return Array.from({ length: n }, (_, i) => ({ x: 60 + i * gap, y: y0, w: sz, h: sz }));
  }
  hud(g, S, view) {
    const me = view.me;
    for (const side of [0, 1]) {
      const p = side === 0 ? me : 1 - me, w = S.wiz[p];
      const bx = side === 0 ? 60 : W - 60 - 380, al = side === 0 ? 'left' : 'right', nx = side === 0 ? 60 : W - 60;
      this.slipAt(g, bx - 22, 18, 424, 128);
      g.textAlign = al; g.fillStyle = SIDE_INK[side]; g.font = `italic 27px ${FELL}`;
      g.fillText(S.names?.[p] || (side ? 'Rival' : 'You'), nx, 52);
      for (let i = 0; i < 2; i++) {
        const cx = side === 0 ? nx + 300 + i * 30 : nx - 300 - i * 30;
        g.globalAlpha = 1; g.strokeStyle = '#7a2418'; g.lineWidth = 1.6; g.beginPath(); g.arc(cx, 44, 11, 0, 7);
        if (S.wins[p] > i) { g.fillStyle = '#9a2a1c'; g.fill(); g.strokeStyle = '#5c160c'; }
        g.stroke();
      }
      const hp = Math.max(0, w.hp) / MAX_HP, fw = 380 * hp;
      g.fillStyle = HP_INK; g.globalAlpha = 0.85; g.fillRect(side === 0 ? bx : bx + 380 - fw, 64, fw, 16);
      if (w.shield > 0) { g.fillStyle = elc(w.shieldEls); g.globalAlpha = 0.5; const sw = Math.min(380, 380 * w.shield / MAX_HP); g.fillRect(side === 0 ? bx : bx + 380 - sw, 64, sw, 6); }
      g.globalAlpha = 1; g.strokeStyle = INK; g.lineWidth = 1.6; roughRect(g, bx, 64, 380, 16, 0.8);
      const mw = 380 * w.mana / MAX_MANA;
      g.fillStyle = MANA_INK; g.globalAlpha = w.chillT > 0 ? 0.5 : 0.8; g.fillRect(side === 0 ? bx : bx + 380 - mw, 86, mw, 8);
      g.globalAlpha = 1; g.lineWidth = 1; roughRect(g, bx, 86, 380, 8, 0.6);
      g.font = `14px ${FELL}`; g.fillStyle = INK; g.textAlign = al;
      g.fillText(`${Math.ceil(w.hp)} life · ${Math.floor(w.mana)} ink`, side === 0 ? bx : bx + 380, 112);
      // statuses
      let sx = side === 0 ? bx : bx + 380;
      g.font = `italic 14px ${FELL}`;
      for (const [n, c] of statusList(w)) {
        const tw = g.measureText(n).width;
        if (side === 1) sx -= tw;
        g.fillStyle = c; g.textAlign = 'left'; g.fillText(n, sx, 132);
        sx += side === 0 ? tw + 10 : -10;
      }
      // rune strip
      const lo = S.loadouts?.[p]; if (!lo) continue;
      const mine = p === me, sz = mine ? 64 : 44, gap = mine ? 74 : 52, y0 = H - 30 - sz;
      const x0 = side === 0 ? 60 : W - 60 - sz - (lo.length - 1) * gap;
      this.slipAt(g, x0 - 14, y0 - (mine ? 34 : 12), (lo.length - 1) * gap + sz + 28, sz + (mine ? 58 : 30));
      lo.forEach((r, i) => {
        const x = x0 + i * gap;
        const cost = runeCost(r.form, 1), cd = w.cds[i], ready = cd <= 0 && w.mana >= cost && !(w.silenceT > 0);
        g.globalAlpha = ready ? 1 : 0.45; g.drawImage(this.thumb(r), x, y0, sz, sz);
        g.strokeStyle = INK; g.lineWidth = 1.2; roughRect(g, x, y0, sz, sz, 0.7);
        if (cd > 0) { g.globalAlpha = 0.7; g.fillStyle = PAPER; g.fillRect(x + 1, y0 + 1, sz - 2, (sz - 2) * Math.min(1, cd / FORMS[r.form].cd)); }
        g.globalAlpha = 1;
        if (mine) {
          g.font = `12px ${FELL}`; g.fillStyle = INK; g.textAlign = 'center';
          g.fillText(`${i + 1} · ${FORMS[r.form].name}`, x + sz / 2, y0 + sz + 15);
          g.textAlign = 'right'; g.fillStyle = MANA_INK; g.fillText(cost, x + sz - 3, y0 + 13);
        }
      });
      if (mine && S.t - w.chainT < 1.6 && w.chain >= 0 && w.castT === 0 && S.phase === 'fight') {
        g.font = `italic 17px ${FELL}`; g.fillStyle = HP_INK; g.textAlign = 'left';
        g.fillText(`flourish ×${(1 + 0.08 * Math.min(5, w.chain + 1)).toFixed(2)} if you cast now`, x0, y0 - 12);
      }
    }
    // timer
    this.slipAt(g, W / 2 - 80, 18, 160, 96);
    g.textAlign = 'center'; g.fillStyle = INK; g.globalAlpha = 1;
    g.font = `18px ${FELL_SC}`; g.fillText(S.tut ? 'Practice' : `Round ${['I', 'II', 'III', 'IV', 'V'][S.round - 1] || S.round}`, W / 2, 46);
    const tt = Math.max(0, Math.ceil(S.roundT)); g.font = `42px ${FELL_SC}`;
    g.fillStyle = tt <= 10 && S.phase === 'fight' ? HP_INK : INK;
    g.fillText(S.tut ? '∞' : `${Math.floor(tt / 60)}:${String(tt % 60).padStart(2, '0')}`, W / 2, 92);
    if (S.phase === 'count') {
      g.font = `130px ${FELL_SC}`; g.lineWidth = 8; g.strokeStyle = 'rgba(241,228,196,0.85)';
      g.strokeText(String(Math.ceil(S.phaseT)), W / 2, H / 2 + 40); g.fillStyle = INK; g.fillText(String(Math.ceil(S.phaseT)), W / 2, H / 2 + 40);
    }
  }
}
