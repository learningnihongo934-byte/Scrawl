// Scrawl: screens, pen input, game loop, AI duels and online rooms (host runs the sim, guest sends casts).
import { W, H, TOP, BOT, EL, FORMS, runeName } from './data.js';
import { newMatch, step, cast, setMove, snapshot, runeCost, sizePower } from './sim.js';
import { recognize, templatesFor, shapeOf } from './recognizer.js';
import { Renderer, INK } from './render.js';
import { audioInit, sfx, scratchStart, scratchStop, scratchSpeed, getVol, setVol } from './audio.js';
import { Bot, LEVELS, botLoadout } from './ai.js';
import { loadBook, loadoutOf, mountBook, slim } from './runebook.js';

const $ = s => document.querySelector(s);
const cv = $('#page');
const R = new Renderer(cv);

let book = loadBook(), tmpls = templatesFor(book.runes);
let name = 'Scribe';
try { name = (localStorage.getItem('scrawl.name') || 'Scribe').slice(0, 16); } catch {}

let mode = 'menu';            // menu | ai | host | guest
let S = null, me = 0, bot = null, aiLevel = 0, acc = 0;
let net = null, netEv = [], snapClock = 0, lastTick = 0, again = { me: false, them: false }, guestLo = null, guestNames = null;
const remote = new Map();     // live ink from the other player, by group id

// ---------- screens ----------
function show(id) {
  document.querySelectorAll('.screen').forEach(s => { s.hidden = s.id !== id; });
  $('#bar').hidden = !(mode !== 'menu' && !id);
}
function toMenu(note) {
  if (net) { net.close(); net = null; }
  mode = 'menu'; S = null; bot = null; R.flip = false; R.reset(); remote.clear();
  show('menu');
  $('#menunote').textContent = note || '';
}

$('#name').value = name;
$('#name').oninput = e => { name = e.target.value.replace(/[<>]/g, '').slice(0, 16) || 'Scribe'; try { localStorage.setItem('scrawl.name', name); } catch {} };
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { audioInit(); sfx('page'); show(b.dataset.go); if (b.dataset.go === 'book') bookUI.open(); });
document.querySelectorAll('[data-menu]').forEach(b => b.onclick = () => { sfx('page'); toMenu(); });

// difficulty buttons
LEVELS.forEach((L, i) => {
  const b = document.createElement('button');
  b.className = 'level';
  b.innerHTML = `<b>${L.name}</b><span>${L.title}</span>`;
  b.onclick = () => { audioInit(); startAI(i); };
  $('#levels').append(b);
});

const vol = $('#vol');
const paintVol = () => { vol.textContent = getVol() > 0 ? 'Sound on' : 'Sound off'; };
vol.onclick = () => { audioInit(); setVol(getVol() > 0 ? 0 : 0.7); paintVol(); };
paintVol();

const bookUI = mountBook($('#book'), () => book, b => { book = b; tmpls = templatesFor(book.runes); });

$('#leave').onclick = () => { if (confirm('Leave this duel?')) toMenu(); };

// ---------- AI duel ----------
function startAI(lvl) {
  aiLevel = lvl; mode = 'ai'; me = 0; R.flip = false; R.reset(); remote.clear();
  bot = new Bot(lvl, 1);
  S = newMatch([loadoutOf(book), botLoadout(lvl)], [name, LEVELS[lvl].name]);
  show(null); acc = 0;
}

// ---------- online ----------
const CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXZ';
const newCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

function connect(code) {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room/${code}`);
  const api = {
    code, ws,
    send(m) { if (ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); },
    close() { clearInterval(api.ping); api.closed = true; try { ws.close(); } catch {} },
  };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onNet(m); };
  ws.onclose = () => { if (!api.closed && net === api) onNet({ t: 'closed' }); };
  api.ping = setInterval(() => api.send('{"t":"ping"}'), 20000);
  return api;
}

$('#host').onclick = () => {
  audioInit();
  const code = newCode();
  net = connect(code);
  $('#roomcode').textContent = code;
  $('#roomlink').value = `${location.origin}/?room=${code}`;
  $('#lobbymsg').textContent = 'Waiting for a rival to open this page…';
  show('lobby');
};
$('#copylink').onclick = async () => { try { await navigator.clipboard.writeText($('#roomlink').value); $('#copylink').textContent = 'Copied'; } catch { $('#roomlink').select(); } };
$('#joinbtn').onclick = () => {
  audioInit();
  const code = $('#joincode').value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (code.length !== 4) { $('#joinmsg').textContent = 'Room codes are four letters.'; return; }
  net = connect(code);
  $('#joinmsg').textContent = 'Opening the page…';
};
$('#joincode').onkeydown = e => { if (e.key === 'Enter') $('#joinbtn').click(); };

const validLo = lo => Array.isArray(lo) && lo.length === 6 && lo.every(r => r && EL[r.el] && FORMS[r.form] && Array.isArray(r.glyph) && r.glyph.length && r.glyph.length <= 6 &&
  r.glyph.every(s => Array.isArray(s) && s.length >= 1 && s.length <= 60 && s.every(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]))));
const num = (v, a, b, d = 0) => { v = Number(v); return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };

function hostStart() {
  S = newMatch([loadoutOf(book), guestLo], [name, guestNames]);
  mode = 'host'; me = 0; R.flip = false; R.reset(); remote.clear(); netEv = []; again = { me: false, them: false };
  net.send({ t: 'start', lo: S.loadouts, names: S.names });
  show(null); acc = 0;
}

function onNet(m) {
  switch (m.t) {
    case 'role':
      if (m.role === 'guest') net.send({ t: 'hello', name, lo: loadoutOf(book) });
      break;
    case 'full': $('#joinmsg').textContent = 'That room already has two wizards.'; net.close(); net = null; break;
    case 'hello':
      if (mode === 'host' || !net) return;
      guestLo = validLo(m.lo) ? m.lo : botLoadout(0);
      guestNames = String(m.name || 'Rival').replace(/[<>]/g, '').slice(0, 16) || 'Rival';
      hostStart();
      break;
    case 'start':
      if (!Array.isArray(m.lo) || !validLo(m.lo[0]) || !validLo(m.lo[1])) return;
      mode = 'guest'; me = 1; R.flip = true; R.reset(); remote.clear(); again = { me: false, them: false };
      S = null; guestLo = m.lo; guestNames = m.names;
      show(null);
      break;
    case 's':
      if (mode !== 'guest' || !m.s) return;
      S = { ...m.s, loadouts: guestLo, names: guestNames };
      S.wiz[me].dir = lastDir;   // predict our own walking until the host catches up
      handleEvents(m.s.ev || []);
      break;
    case 'cast':
      if (mode !== 'host' || !S || !m.spec) return;
      cast(S, 1, { slot: num(m.spec.slot, 0, 5) | 0, cx: num(m.spec.cx, 0, W), cy: num(m.spec.cy, 0, H), w: num(m.spec.w, 0, W), h: num(m.spec.h, 0, H), ang: num(m.spec.ang, -4, 4, Math.PI / 2), q: num(m.spec.q, 0, 1) });
      break;
    case 'mv': if (mode === 'host' && S) setMove(S, 1, num(m.d, -1, 1)); break;
    case 'ink': {
      if (!Array.isArray(m.s) || m.s.length > 6) return;
      const strokes = m.s.filter(s => Array.isArray(s)).map(s => s.slice(0, 80));
      remote.set(m.g, strokes); R.liveInk('r' + m.g, strokes);
      break;
    }
    case 'inkEnd': {
      const strokes = remote.get(m.g); remote.delete(m.g); R.liveInk('r' + m.g, null);
      if (strokes && m.res !== 'none') R.glyphDone(strokes, m.res === 'cast' ? 'cast' : 'fizzle', EL[m.el] ? [m.el] : null);
      break;
    }
    case 'again':
      again.them = true;
      if (mode === 'host' && again.me) hostStart();
      else $('#overmsg').textContent = `${S?.names?.[1 - me] || 'Your rival'} wants a rematch.`;
      break;
    case 'left': case 'closed':
      if (mode === 'menu' && !$('#lobby').hidden) { $('#lobbymsg').textContent = 'The connection dropped. Open a new room.'; return; }
      if (mode === 'menu') { $('#joinmsg').textContent = "Couldn't reach that room."; return; }
      toMenu('Your rival left the page.');
      break;
  }
}

// ---------- pen ----------
const pen = { strokes: [], cur: null, timer: null, last: null, g: 0, drag: false, dragY: 0, dirty: false, sentAt: 0 };
const keys = new Set();
const keysDir = () => (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
let lastDir = 0;
function setDir(d) {
  if (!S || d === lastDir) return;
  lastDir = d;
  if (mode === 'guest') { S.wiz[me].dir = d; net?.send({ t: 'mv', d }); }
  else setMove(S, me, d);
}
function worldPos(e) {
  const r = cv.getBoundingClientRect();
  let x = (e.clientX - r.left) / r.width * W; const y = (e.clientY - r.top) / r.height * H;
  if (R.flip) x = W - x;
  return [x, y];
}
cv.onpointerdown = e => {
  if (!S || mode === 'menu') return;
  audioInit();
  try { cv.setPointerCapture(e.pointerId); } catch {}
  const [x, y] = worldPos(e), w = S.wiz[me];
  if (!pen.strokes.length && Math.hypot(x - w.x, y - w.y + 10) < 70) { pen.drag = true; pen.dragY = y; return; }
  if (S.phase !== 'fight') return;
  clearTimeout(pen.timer);
  if (!pen.strokes.length) pen.g++;
  pen.cur = [[x, y, 4]]; pen.strokes.push(pen.cur); pen.last = { x, y, t: performance.now() };
  scratchStart(); R.liveInk('me', pen.strokes); pen.dirty = true;
};
cv.onpointermove = e => {
  if (pen.drag) { pen.dragY = worldPos(e)[1]; return; }
  if (!pen.cur) return;
  for (const ev of e.getCoalescedEvents?.() || [e]) {
    const [x, y] = worldPos(ev), now = performance.now(), d = Math.hypot(x - pen.last.x, y - pen.last.y);
    if (d < 2) continue;
    const v = d / Math.max(1, now - pen.last.t) * 1000;
    pen.cur.push([x, y, Math.max(2.2, Math.min(7, 7.5 - v * 0.0028))]);
    pen.last = { x, y, t: now }; scratchSpeed(v);
  }
  pen.dirty = true;
};
cv.onpointerup = cv.onpointercancel = () => {
  if (pen.drag) { pen.drag = false; setDir(keysDir()); return; }
  if (!pen.cur) return;
  pen.cur = null; scratchStop();
  clearTimeout(pen.timer);
  pen.timer = setTimeout(finishRune, pen.strokes.length >= 5 ? 0 : 300);
};
function inkMsg() { return { t: 'ink', g: pen.g, s: pen.strokes.map(s => slimW(s)) }; }
const slimW = (s, n = 50) => { const step = Math.max(1, s.length / n), out = []; for (let i = 0; i < s.length; i += step) out.push(s[Math.floor(i)]); out.push(s[s.length - 1]); return out.map(p => [Math.round(p[0]), Math.round(p[1]), Math.round(p[2] * 10) / 10]); };

function finishRune() {
  const strokes = pen.strokes.filter(s => s.length > 1); pen.strokes = []; R.liveInk('me', null);
  const end = (res, el) => net?.send({ t: 'inkEnd', g: pen.g, res, el });
  if (!S || S.phase !== 'fight') { end('none'); return; }
  const plain = strokes.map(s => s.map(p => [p[0], p[1]]));
  const sh = plain.length ? shapeOf(plain) : null;
  if (!sh || sh.len < 26) { end('none'); return; }
  const res = recognize(plain, tmpls);
  if (!res || res.slot < 0) {
    R.glyphDone(strokes, 'fizzle'); sfx('fizzle'); R.pop(sh.cx, sh.cy - 20, 'fizzled', '#6b5a48', 22);
    end('fizzle'); return;
  }
  const spec = { slot: res.slot, cx: sh.cx, cy: sh.cy, w: sh.w, h: sh.h, ang: sh.ang, q: res.q };
  const rune = S.loadouts[me][res.slot];
  if (mode === 'guest') {
    const w = S.wiz[me], cost = runeCost(rune.form, sizePower(sh.w, sh.h));
    if (w.cds[res.slot] > 0 || w.mana < cost) {
      R.event({ type: 'fail', reason: w.cds[res.slot] > 0 ? 'cd' : 'mana', x: sh.cx, y: sh.cy });
      R.glyphDone(strokes, 'fizzle'); sfx('fizzle'); end('fizzle'); return;
    }
    net.send({ t: 'cast', spec });
    R.glyphDone(strokes, 'cast', [rune.el]); end('cast', rune.el);
  } else {
    const r = cast(S, me, spec);
    if (r.ok) { R.glyphDone(strokes, 'cast', [rune.el]); end('cast', rune.el); }
    else { R.glyphDone(strokes, 'fizzle'); sfx('fizzle'); end('fizzle'); }
  }
}

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down' }[e.key.toLowerCase()];
  if (k) { keys.add(k); if (!pen.drag) setDir(keysDir()); e.preventDefault(); }
});
addEventListener('keyup', e => {
  const k = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down' }[e.key.toLowerCase()];
  if (k) { keys.delete(k); if (!pen.drag) setDir(keysDir()); }
});
addEventListener('blur', () => { keys.clear(); setDir(0); });

// ---------- events -> effects, sounds, banners ----------
function handleEvents(evs) {
  for (const e of evs) {
    R.event(e);
    switch (e.type) {
      case 'cast': sfx(e.form); if (e.fused) sfx('fuse'); break;
      case 'hit': if (e.amt > 0) sfx('hit'); break;
      case 'wallhit': sfx('wallhit'); break;
      case 'wallbreak': sfx('break'); break;
      case 'clash': case 'pierce': sfx('clash'); break;
      case 'blast': sfx('blast'); break;
      case 'shieldbreak': sfx('break'); break;
      case 'round': R.reset(); R.setBanner(`Round ${e.round}`, e.round === 1 && mode === 'ai' ? 'Draw a rune from your strip, anywhere on the page' : '', 1.6); break;
      case 'go': R.setBanner('Scrawl!', '', 0.9, '#8e2b1e'); sfx('bell'); break;
      case 'roundEnd': {
        const t = e.winner < 0 ? 'Even' : e.winner === me ? 'Round won' : 'Round lost';
        R.setBanner(t, e.timeout ? 'Out of time' : '', 2.4, e.winner === me ? '#3c6d37' : e.winner < 0 ? INK : '#8e2b1e');
        sfx(e.winner === me ? 'win' : 'bell');
        break;
      }
      case 'over': setTimeout(() => showOver(e.winner), 900); break;
    }
  }
}

function showOver(winner) {
  if (!S) return;
  const won = winner === me, st = S.stats[me];
  sfx(won ? 'win' : 'lose');
  $('#overtitle').textContent = winner < 0 ? 'A drawn duel' : won ? 'Victory' : 'Defeat';
  $('#oversub').textContent = `${S.wins[me]} rounds to ${S.wins[1 - me]} against ${S.names[1 - me]}`;
  $('#overstats').innerHTML = `<li><b>${Math.round(st.dmg)}</b> damage dealt</li><li><b>${st.casts}</b> spells cast</li><li><b>${st.fused}</b> fusions${st.best ? ` · best: ${st.best}` : ''}</li>`;
  $('#overmsg').textContent = again.them ? `${S.names[1 - me]} wants a rematch.` : '';
  show('over');
  $('#bar').hidden = true;
  if (mode === 'ai' && won) arcadeScore((aiLevel + 1) * 100 + Math.round(S.wiz[me].hp), { level: LEVELS[aiLevel].id });
}
$('#again').onclick = () => {
  sfx('page');
  if (mode === 'ai') return startAI(aiLevel);
  if (!net) return toMenu();
  again.me = true; net.send({ t: 'again' });
  if (mode === 'host' && again.them) hostStart();
  else $('#overmsg').textContent = 'Waiting for your rival…';
};

const arcadeScore = (score, meta) => { try { if (window.parent !== window) window.parent.postMessage({ rennkoArcade: 1, type: 'score', score, meta }, 'https://arcade.rennko.tech'); } catch {} };

// ---------- loop ----------
let prev = performance.now(), lastCount = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
  if (S && (mode === 'ai' || mode === 'host')) {
    if (pen.drag) setDir(Math.abs(pen.dragY - S.wiz[me].y) > 10 ? Math.sign(pen.dragY - S.wiz[me].y) : 0);
    acc += dt;
    while (acc >= 1 / 60) {
      if (bot) {
        const job = bot.update(S, 1 / 60);
        if (job) R.liveInk('bot', []);
        if (bot.job) {
          const j = bot.job; j.t += 1 / 60;
          const total = j.strokes.reduce((a, s) => a + s.length, 0);
          let n = Math.floor(total * Math.min(1, j.t / j.dur));
          R.liveInk('bot', j.strokes.map(s => { const k = Math.min(s.length, Math.max(0, n)); n -= k; return s.slice(0, k); }).filter(s => s.length));
          if (j.t >= j.dur) {
            bot.job = null; R.liveInk('bot', null);
            const r = cast(S, bot.p, j.spec);
            R.glyphDone(j.strokes, r.ok ? 'cast' : 'fizzle', r.ok ? [S.loadouts[bot.p][j.slot].el] : null);
          }
        }
      }
      step(S, 1 / 60); acc -= 1 / 60;
    }
    const evs = S.ev.splice(0);
    handleEvents(evs);
    if (mode === 'host') {
      netEv.push(...evs);
      snapClock += dt;
      if (snapClock >= 0.05) { snapClock = 0; net?.send(`{"t":"s","s":${snapshot(S, netEv)}}`); netEv = []; }
    }
  } else if (S && mode === 'guest') {
    if (pen.drag) setDir(Math.abs(pen.dragY - S.wiz[me].y) > 10 ? Math.sign(pen.dragY - S.wiz[me].y) : 0);
    // smooth between snapshots
    for (const e of S.ents) { if (e.vx !== undefined) { e.x += e.vx * dt; e.y += e.vy * dt; } e.t += dt; }
    for (const w of S.wiz) { w.y = Math.max(TOP, Math.min(BOT, w.y + w.dir * 270 * (w.chillT > 0 ? 0.55 : 1) * dt)); for (let i = 0; i < w.cds.length; i++) w.cds[i] = Math.max(0, w.cds[i] - dt); }
    if (S.phase === 'fight') S.roundT -= dt; else S.phaseT -= dt;
    S.t += dt;
  }
  if (S && pen.dirty && net && now - pen.sentAt > 50) { pen.dirty = false; pen.sentAt = now; net.send(inkMsg()); }
  if (S && S.phase === 'count') { const c = Math.ceil(S.phaseT); if (c !== lastCount && c > 0) { lastCount = c; sfx('tick'); } } else lastCount = 0;
  R.frame(S, { me }, dt);
  requestAnimationFrame(loop);
}
addEventListener('resize', () => R.resize());
requestAnimationFrame(loop);

// open straight into a room from a shared link
const qp = new URLSearchParams(location.search).get('room');
if (qp) { $('#joincode').value = qp.toUpperCase().slice(0, 4); show('join'); } else show('menu');

// test hook
window.__scrawl = {
  get S() { return S; }, get mode() { return mode; }, book: () => book,
  cast: (slot, x, y, size = 100) => S && cast(S, me, { slot, cx: x, cy: y, w: size, h: size, ang: Math.PI / 2, q: 0.8 }),
  startAI, recognize: strokes => recognize(strokes, tmpls), runeName,
};
void lastTick;
