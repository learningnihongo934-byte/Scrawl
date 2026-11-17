// Scrawl sound: everything synthesized with WebAudio (quill scratch, casts, impacts, bells).
let ac = null, master = null, noise = null, scratch = null, vol = 0.7;
try { const v = parseFloat(localStorage.getItem('scrawl.vol')); if (v >= 0 && v <= 1) vol = v; } catch {}

export function audioInit() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = vol; master.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ac = null; }
}
export const getVol = () => vol;
export function setVol(v) { vol = v; if (master) master.gain.value = v; try { localStorage.setItem('scrawl.vol', String(v)); } catch {} }

function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function nz(t, dur, type, f0, f1, peak, q = 1, a = 0.005) {
  const s = ac.createBufferSource(); s.buffer = noise;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); env(g, t, a, peak, dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + a + 0.05);
}
function tone(t, dur, type, f0, f1, peak, a = 0.005) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); env(g, t, a, peak, dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + a + 0.05);
}

// quill scratching while you draw; speed in px/s
export function scratchStart() {
  if (!ac || scratch) return;
  const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.9;
  const g = ac.createGain(); g.gain.value = 0;
  s.connect(f); f.connect(g); g.connect(master); s.start();
  scratch = { s, f, g };
}
export function scratchSpeed(v) {
  if (!scratch) return;
  const t = ac.currentTime;
  scratch.g.gain.setTargetAtTime(Math.min(0.16, v * 0.00012), t, 0.03);
  scratch.f.frequency.setTargetAtTime(1800 + Math.min(3000, v * 1.2), t, 0.05);
}
export function scratchStop() {
  if (!scratch) return;
  const { s, g } = scratch; scratch = null;
  g.gain.setTargetAtTime(0, ac.currentTime, 0.03); s.stop(ac.currentTime + 0.2);
}

export function sfx(name) {
  if (!ac || vol <= 0) return;
  const t = ac.currentTime + 0.01;
  switch (name) {
    case 'bolt': nz(t, 0.28, 'bandpass', 700, 3200, 0.5, 2); break;
    case 'wall': tone(t, 0.35, 'sine', 120, 55, 0.6); nz(t, 0.25, 'lowpass', 600, 150, 0.4); break;
    case 'shield': tone(t, 0.7, 'sine', 520, 540, 0.18, 0.08); tone(t + 0.04, 0.7, 'sine', 780, 800, 0.12, 0.08); break;
    case 'sigil': tone(t, 0.08, 'triangle', 1300, 1250, 0.25); tone(t + 0.1, 0.08, 'triangle', 1500, 1450, 0.2); break;
    case 'orb': tone(t, 0.45, 'sine', 210, 340, 0.3, 0.05); break;
    case 'blast': nz(t, 0.7, 'lowpass', 1200, 120, 0.8); tone(t, 0.5, 'sine', 90, 35, 0.6); break;
    case 'hit': tone(t, 0.16, 'square', 130, 50, 0.25); nz(t, 0.12, 'lowpass', 1500, 300, 0.5); break;
    case 'clash': nz(t, 0.14, 'highpass', 3500, 2000, 0.4); tone(t, 0.1, 'triangle', 1400, 900, 0.2); break;
    case 'wallhit': nz(t, 0.12, 'lowpass', 900, 200, 0.4); break;
    case 'break': nz(t, 0.4, 'bandpass', 1500, 300, 0.5, 1.5); break;
    case 'fizzle': nz(t, 0.35, 'bandpass', 900, 250, 0.22, 3, 0.02); break;
    case 'fuse': [440, 660, 990].forEach((f, i) => tone(t + i * 0.06, 0.3, 'triangle', f, f, 0.22)); break;
    case 'bell': [660, 990, 1320].forEach((f, i) => tone(t, 1.4 - i * 0.3, 'sine', f, f * 0.995, 0.25 / (i + 1), 0.003)); break;
    case 'tick': tone(t, 0.05, 'sine', 900, 880, 0.15); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.12, 0.6, 'triangle', f, f, 0.25)); break;
    case 'lose': [440, 392, 330, 262].forEach((f, i) => tone(t + i * 0.16, 0.6, 'triangle', f, f, 0.2)); break;
    case 'page': nz(t, 0.25, 'highpass', 2500, 5000, 0.18, 0.7, 0.04); break;
  }
}
