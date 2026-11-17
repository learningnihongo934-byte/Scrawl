// Scrawl: screens, pen input, game loop, AI duels, tutorial and online rooms (host runs the sim, guest sends casts).
import { W, H, EL, FORMS, runeName, fusionName } from './data.js';
import { newMatch, step, cast, snapshot, runeCost, sizePower } from './sim.js';
import { recognize, templatesFor, shapeOf, REJECT } from './recognizer.js';
import { INK, drawGlyph, elc } from './render.js';
import { Book3D } from './render3d.js';
import { audioInit, sfx, scratchStart, scratchStop, scratchSpeed, getVol, setVol } from './audio.js';
import { Bot, LEVELS, botLoadout } from './ai.js';
import { loadBook, loadoutOf, mountBook, defaultBook } from './runebook.js';

const $ = s => document.querySelector(s);
const gl = $('#gl');
const R = new Book3D(gl, $('#hud'));
const L = R.layer;

let book = loadBook(), tmpls = templatesFor(book.runes), activeTmpls = tmpls;
let name = 'Scribe';
try { name = (localStorage.getItem('scrawl.name') || 'Scribe').slice(0, 16); } catch {}

let mode = 'menu';            // menu | ai | tut | host | guest
let S = null, me = 0, bot = null, aiLevel = 0, acc = 0;
let net = null, netEv = [], snapClock = 0, again = { me: false, them: false }, guestLo = null, guestNames = null;
const remote = new Map();     // live ink from the other player, by group id

// ---------- screens ----------
function show(id) {
  document.querySelectorAll('.screen').forEach(s => { s.hidden = s.id !== id; });
  $('#bar').hidden = !(mode !== 'menu' && !id);
  $('#tut').hidden = !(mode === 'tut' && !id);
  $('#fusepanel').hidden = !(mode !== 'menu' && !id);
}
function toMenu(note) {
  if (net) { net.close(); net = null; }
  mode = 'menu'; S = null; bot = null; tut = null; L.guide = null; R.setView(0); L.reset(); R.clearInk(); remote.clear(); activeTmpls = tmpls;
  show('menu');
  $('#menunote').textContent = note || '';
}

$('#name').value = name;
$('#name').oninput = e => { name = e.target.value.replace(/[<>]/g, '').slice(0, 16) || 'Scribe'; try { localStorage.setItem('scrawl.name', name); } catch {} };
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { audioInit(); sfx('page'); show(b.dataset.go); if (b.dataset.go === 'book') bookUI.open(); });
document.querySelectorAll('[data-menu]').forEach(b => b.onclick = () => { sfx('page'); toMenu(); });

LEVELS.forEach((lv, i) => {
  const b = document.createElement('button');
  b.className = 'level';
  b.innerHTML = `<b>${lv.name}</b><span>${lv.title}</span>`;
  b.onclick = () => { audioInit(); startAI(i); };
  $('#levels').append(b);
});

const vol = $('#vol');
const paintVol = () => { vol.textContent = getVol() > 0 ? 'Sound on' : 'Sound off'; };
vol.onclick = () => { audioInit(); setVol(getVol() > 0 ? 0 : 0.7); paintVol(); };
paintVol();

const bookUI = mountBook($('#book'), () => book, b => { book = b; tmpls = templatesFor(book.runes); if (mode !== 'tut') activeTmpls = tmpls; });

$('#leave').onclick = () => { if (mode === 'tut' || confirm('Leave this duel?')) toMenu(); };

function begin(loadouts, names, opts, view) {
  S = newMatch(loadouts, names, opts); me = view; R.setView(view); L.reset(); R.clearEnts(); remote.clear(); acc = 0;
  buildFusePanel(loadouts[view]);
}

// ---------- side panel: every fusion your six runes can make ----------
let fuseOpen = true;
try { fuseOpen = localStorage.getItem('scrawl.fusepanel') !== 'closed'; } catch {}
const glyphIcon = r => { const c = document.createElement('canvas'); c.width = c.height = 52; drawGlyph(c.getContext('2d'), r.glyph, 2, 2, 48, elc([r.el]), 4); c.title = runeName(r); return c; };
function buildFusePanel(lo) {
  const ul = $('#fuselist'); ul.innerHTML = '';
  const fname = (a, b) => (a.form === 'wall' && b.form === 'bolt') || (a.form === 'bolt' && b.form === 'wall') ? 'Ram' : FORMS[b.form].name;
  for (let i = 0; i < lo.length; i++) for (let j = i + 1; j < lo.length; j++) {
    const a = lo[i], b = lo[j], els = [...new Set([a.el, b.el])], name = fusionName(els);
    const f1 = fname(a, b), f2 = fname(b, a);
    const li = document.createElement('li');
    li.append(glyphIcon(a), Object.assign(document.createElement('i'), { textContent: '+' }), glyphIcon(b));
    const t = document.createElement('div');
    t.innerHTML = `<b style="color:${elc(els)}">${name}</b><small>${f1 === f2 ? f1 : `${f1} or ${f2}`}</small>`;
    li.append(t); ul.append(li);
  }
  paintFuse();
}
function paintFuse() { $('#fusepanel').classList.toggle('closed', !fuseOpen); }
$('#fusehead').onclick = () => { fuseOpen = !fuseOpen; try { localStorage.setItem('scrawl.fusepanel', fuseOpen ? 'open' : 'closed'); } catch {} paintFuse(); };

// ---------- AI duel ----------
function startAI(lvl) {
  aiLevel = lvl; mode = 'ai'; bot = new Bot(lvl, 1); activeTmpls = tmpls;
  begin([loadoutOf(book), botLoadout(lvl)], [name, LEVELS[lvl].name], {}, 0);
  show(null);
}

// ---------- tutorial ----------
const STARTER = defaultBook();
const TUT = [
  { slot: 0, at: [470, 330], text: 'Draw the <b>Fire Bolt</b> rune, a triangle, on your half of the page. Trace the faint guide if you like. Lift the pen and pause, and it casts.', done: e => e.type === 'cast' && e.p === 0 && e.form === 'bolt' },
  { slot: 2, at: [330, 450], dummy: true, text: 'The dummy is firing back. Draw the <b>Earth Wall</b> rune, a square, between you and it to block the next shot.', done: e => e.type === 'wallhit' },
  { slot: 3, at: [300, 280], text: 'Draw the <b>Life Shield</b> rune, a circle, anywhere. It wraps your wizard and soaks damage.', done: e => e.type === 'cast' && e.p === 0 && e.form === 'shield' },
  { slot: 5, at: [1508, 450], text: 'Sigils can go anywhere, even on your rival. Draw the <b>Frost Sigil</b>, a cross, right on top of the dummy.', done: e => e.type === 'blast' && e.o === 0 },
  { slot: 4, at: [520, 600], text: 'Draw the <b>Void Orb</b> rune, a spiral. Orbs hunt the enemy, and Void slips through walls.', done: e => e.type === 'cast' && e.p === 0 && e.form === 'orb' },
  { slot: 2, at: [470, 450], text: '<b>Fusion:</b> draw two runes connected, like a square flowing straight into a triangle, all in one go. Wall + Bolt fuse into a <b>Ram</b>. Your fusions are listed on the left (press F).', done: e => e.type === 'cast' && e.p === 0 && e.ram },
  { text: '<b>Quick cast:</b> press a number key 1 to 6, or tap a rune in your strip. It fires at a set spot at 70% strength, with no drawing needed.', done: e => e.type === 'cast' && e.p === 0 && e.quick },
  { end: true, text: 'Bigger drawings hit harder, and neater ones too. Casting again within 1.6 seconds builds a <b>Flourish</b>. There are 11 elements and 24 forms: teach your own runes in the <b>Runebook</b>.' },
];
let tut = null;
function startTut() {
  mode = 'tut'; bot = null; activeTmpls = templatesFor(STARTER.runes);
  const dummyLo = Array.from({ length: 6 }, () => ({ el: 'earth', form: 'bolt', glyph: STARTER.runes[0].samples[0] }));
  begin([loadoutOf(STARTER), dummyLo], [name, 'Training Dummy'], { tut: true }, 0);
  tut = { i: 0, fireT: 2 };
  showTutStep();
  show(null);
}
function showTutStep() {
  const st = TUT[tut.i];
  $('#tuttext').innerHTML = st.text;
  $('#tutstep').textContent = st.end ? 'Done' : `Lesson ${tut.i + 1} of ${TUT.length - 1}`;
  $('#tutnext').hidden = !!st.end; $('#tutend').hidden = !st.end;
  if (st.slot !== undefined) {
    const r = STARTER.runes[st.slot];
    L.guide = { strokes: r.samples[0], x: st.at[0], y: st.at[1], size: 140, c: EL[r.el].ink };
  } else L.guide = null;
  L.dirty = true;
}
function tutEvent(e) {
  if (!tut || TUT[tut.i].end) return;
  if (TUT[tut.i].done(e)) { tut.i++; sfx('fuse'); L.setBanner('Well drawn', '', 1, '#3c6d37'); showTutStep(); }
}
$('#tutnext').onclick = () => { if (tut && !TUT[tut.i].end) { tut.i++; showTutStep(); } };
$('#tutend').onclick = () => { toMenu(); show('pick'); };
$('#tutbtn').onclick = () => { audioInit(); sfx('page'); startTut(); };

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
  mode = 'host'; netEv = []; again = { me: false, them: false };
  begin([loadoutOf(book), guestLo], [name, guestNames], {}, 0);
  net.send({ t: 'start', lo: S.loadouts, names: S.names });
  show(null);
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
      mode = 'guest'; me = 1; R.setView(1); L.reset(); R.clearEnts(); remote.clear(); again = { me: false, them: false }; activeTmpls = tmpls;
      S = null; guestLo = m.lo; guestNames = m.names;
      buildFusePanel(m.lo[1]);
      show(null);
      break;
    case 's':
      if (mode !== 'guest' || !m.s) return;
      S = { ...m.s, loadouts: guestLo, names: guestNames };
      handleEvents(m.s.ev || []);
      break;
    case 'cast':
      if (mode !== 'host' || !S || !m.spec) return;
      cast(S, 1, { slot: num(m.spec.slot, 0, 5) | 0, cx: num(m.spec.cx, 0, W), cy: num(m.spec.cy, 0, H), w: num(m.spec.w, 0, W), h: num(m.spec.h, 0, H),
        ang: typeof m.spec.ang === 'number' ? num(m.spec.ang, -4, 4) : null, q: num(m.spec.q, 0, 1), quick: !!m.spec.quick, host: Number.isInteger(m.spec.host) ? m.spec.host : null, with: Number.isInteger(m.spec.with) ? num(m.spec.with, 0, 5) : null });
      break;
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

// ---------- casting ----------
function sendCast(spec, rune, strokes, last = true, inkEls = null) {
  const end = (res, el) => { if (strokes && last) net?.send({ t: 'inkEnd', g: pen.g, res, el }); };
  if (mode === 'guest') {
    const w = S.wiz[me], pw = spec.quick ? 1 : sizePower(spec.w, spec.h), partner = Number.isInteger(spec.with) ? S.loadouts[me][spec.with] : null;
    const cost = runeCost(rune.form, pw) + (partner ? runeCost(partner.form, pw) : 0);
    const why = w.silenceT > 0 || w.shockT > 0 ? 'silenced' : w.cds[spec.slot] > 0 || (partner && w.cds[spec.with] > 0) ? 'cd' : w.mana < cost ? 'mana' : null;
    if (why) { L.event({ type: 'fail', reason: why, x: spec.cx, y: spec.cy }); if (strokes) R.glyphDone(strokes, 'fizzle'); sfx('fizzle'); end('fizzle'); return; }
    net.send({ t: 'cast', spec });
    if (strokes) R.glyphDone(strokes, 'cast', inkEls || [rune.el]); end('cast', rune.el);
  } else {
    const r = cast(S, me, spec);
    if (r.ok) { if (strokes) R.glyphDone(strokes, 'cast', inkEls || [rune.el]); end('cast', rune.el); }
    else { if (strokes) R.glyphDone(strokes, 'fizzle'); sfx('fizzle'); end('fizzle'); }
  }
}
// hotkey / tap: a fixed spot that suits the form
function quickCast(slot) {
  if (!S || S.phase !== 'fight') return;
  const rune = S.loadouts[me][slot]; if (!rune) return;
  const w = S.wiz[me], foe = S.wiz[1 - me], side = me === 0 ? 1 : -1, role = FORMS[rune.form].role;
  const at = role === 'lob' || role === 'curse' ? [foe.x, foe.y] : role === 'self' ? [w.x, w.y] : [w.x + side * 190, w.y];
  sendCast({ slot, cx: at[0], cy: at[1], w: 100, h: 100, ang: null, q: 0.3, quick: true }, rune, null);
}

// ---------- pen ----------
const pen = { strokes: [], scr: [], cur: null, curS: null, timer: null, last: null, g: 0, dirty: false, sentAt: 0 };
gl.onpointerdown = e => {
  if (!S || mode === 'menu') return;
  audioInit();
  const [ox, oy] = R.toOverlay(e.clientX, e.clientY);
  const cell = L.cells().findIndex(c => ox >= c.x && ox <= c.x + c.w && oy >= c.y && oy <= c.y + c.h);
  if (cell >= 0 && !pen.strokes.length) { quickCast(cell); return; }
  if (S.phase !== 'fight') return;
  const at = R.pick(e.clientX, e.clientY); if (!at) return;
  try { gl.setPointerCapture(e.pointerId); } catch {}
  clearTimeout(pen.timer);
  if (!pen.strokes.length) pen.g++;
  pen.cur = [[at[0], at[1], 4]]; pen.curS = [[e.clientX, e.clientY]];
  pen.strokes.push(pen.cur); pen.scr.push(pen.curS);
  pen.last = { x: e.clientX, y: e.clientY, t: performance.now() };
  scratchStart(); R.liveInk('me', pen.strokes); pen.dirty = true;
};
gl.onpointermove = e => {
  if (!pen.cur) return;
  const co = e.getCoalescedEvents?.();
  for (const ev of co && co.length ? co : [e]) {
    const now = performance.now(), d = Math.hypot(ev.clientX - pen.last.x, ev.clientY - pen.last.y);
    if (d < 3) continue;
    const at = R.pick(ev.clientX, ev.clientY); if (!at) continue;
    const v = d / Math.max(1, now - pen.last.t) * 1000;
    pen.cur.push([at[0], at[1], Math.max(2.4, Math.min(7.5, 8 - v * 0.004))]); pen.curS.push([ev.clientX, ev.clientY]);
    pen.last = { x: ev.clientX, y: ev.clientY, t: now }; scratchSpeed(v);
  }
  pen.dirty = true;
  // light up my own spell when the drawing is over it, so you can see a fusion is aimed
  const t = performance.now();
  if (t - (pen.hintAt || 0) > 120) { pen.hintAt = t; R.fuseHint(R.pickHost(pen.scr.flatMap(s => s.filter((_, j) => j % 3 === 0)), me)); }
};
gl.onpointerup = gl.onpointercancel = () => {
  if (!pen.cur) return;
  pen.cur = null; scratchStop();
  clearTimeout(pen.timer);
  pen.timer = setTimeout(finishRune, pen.strokes.length >= 5 ? 0 : 300);
};
const slimW = (s, n = 50) => { const step = Math.max(1, s.length / n), out = []; for (let i = 0; i < s.length; i += step) out.push(s[Math.floor(i)]); out.push(s[s.length - 1]); return out.map(p => [Math.round(p[0]), Math.round(p[1]), Math.round(p[2] * 10) / 10]); };

function finishRune() {
  const keep = pen.strokes.map((s, i) => s.length > 1 ? i : -1).filter(i => i >= 0);
  const strokes = keep.map(i => pen.strokes[i]), scr = keep.map(i => pen.scr[i]);
  pen.strokes = []; pen.scr = []; R.liveInk('me', null); R.fuseHint(null);
  const end = res => net?.send({ t: 'inkEnd', g: pen.g, res });
  if (!S || S.phase !== 'fight' || !strokes.length) { end('none'); return; }
  const sh = shapeOf(strokes.map(s => s.map(p => [p[0], p[1]])));
  if (sh.len < 26) { end('none'); return; }
  // Recognize what the player saw on screen. A drawing can be one rune, or two runes drawn connected
  // (separate strokes, or one continuous stroke) which fuse into one spell.
  const whole = recognize(scr, activeTmpls);
  const plen = st => st.reduce((t, s) => t + s.reduce((u, p, i) => i ? u + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : 0, 0), 0);
  const total = plen(scr);
  let best = null;
  const tryCut = (a, b) => {
    if (plen(a) < total * 0.2 || plen(b) < total * 0.2) return;
    const r1 = recognize(a, activeTmpls), r2 = recognize(b, activeTmpls);
    if (r1 && r1.slot >= 0 && r2 && r2.slot >= 0) { const d = (r1.d + r2.d) / 2; if (!best || d < best.d) best = { d, r1, r2 }; }
  };
  for (let k = 1; k < scr.length; k++) tryCut(scr.slice(0, k), scr.slice(k));
  scr.forEach((s, si) => {
    if (s.length < 14) return;
    // cut the stroke in two, also dropping a short joining line between the two runes
    for (let f = 0.2; f <= 0.8; f += 0.05) for (const gap of [0, 0.05, 0.1, 0.15]) {
      const c1 = Math.floor(s.length * f), c2 = Math.min(s.length - 2, c1 + Math.floor(s.length * gap));
      tryCut([...scr.slice(0, si), s.slice(0, c1 + 1)], [s.slice(c2), ...scr.slice(si + 1)]);
    }
  });
  const wholeOk = whole && whole.slot >= 0;
  const useSplit = best && (!wholeOk || best.d < whole.d - 0.25);
  // drawn on top of one of my own spells and nearly a rune: the intent is clear, so cast the closest match
  const near = whole && whole.slot < 0 && whole.near !== undefined ? whole.near : -1;
  const look = scr.flatMap(s => s.filter((_, j) => j % 4 === 0));
  let res = useSplit ? null : wholeOk ? whole : null;
  if (!res && !useSplit && near >= 0 && whole.d < REJECT + 0.5 && R.pickHost(look, me) !== null) res = { slot: near, d: whole.d, q: 0.15 };
  if (!res && !useSplit) {
    R.glyphDone(strokes, 'fizzle'); sfx('fizzle');
    L.pop(sh.cx, sh.cy, near >= 0 ? `fizzled (closest: ${runeName(S.loadouts[me][near])})` : 'fizzled', '#6b5a48', 22);
    end('fizzle'); return;
  }
  const lo = S.loadouts[me];
  if (useSplit) {
    const { r1, r2 } = best;
    sendCast({ slot: r2.slot, with: r1.slot, cx: sh.cx, cy: sh.cy, w: sh.w, h: sh.h, ang: sh.ang, q: Math.min(r1.q, r2.q) }, lo[r2.slot], strokes, true, [lo[r1.slot].el, lo[r2.slot].el]);
  } else {
    sendCast({ slot: res.slot, cx: sh.cx, cy: sh.cy, w: sh.w, h: sh.h, ang: sh.ang, q: res.q, host: R.pickHost(look, me) }, lo[res.slot], strokes);
  }
}

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key.toLowerCase() === 'f' && S && mode !== 'menu') { $('#fusehead').click(); return; }
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 6 && S && mode !== 'menu') { quickCast(n - 1); e.preventDefault(); }
});

// ---------- events -> effects, sounds, banners ----------
function handleEvents(evs) {
  for (const e of evs) {
    R.event(e);
    if (mode === 'tut') tutEvent(e);
    switch (e.type) {
      case 'cast': sfx(e.form === 'scatter' || e.form === 'beam' ? 'bolt' : e.form === 'comet' || e.form === 'rain' ? 'sigil' : e.form === 'mirror' || e.form === 'totem' || e.form === 'mine' ? 'wall' : ['mend', 'haste', 'cleanse', 'thorns', 'echo'].includes(e.form) ? 'shield' : ['hex', 'mark', 'silence', 'leech', 'mire', 'vortex', 'familiar'].includes(e.form) ? 'orb' : e.form); if (e.fused) sfx('fuse'); break;
      case 'hit': if (e.amt > 0) sfx('hit'); break;
      case 'wallhit': sfx('wallhit'); break;
      case 'wallbreak': case 'shieldbreak': sfx('break'); break;
      case 'clash': case 'pierce': case 'reflect': sfx('clash'); break;
      case 'blast': sfx('blast'); break;
      case 'beam': sfx('clash'); break;
      case 'round': L.reset(); if (mode !== 'tut') L.setBanner(`Round ${e.round}`, e.round === 1 && mode === 'ai' ? 'Draw a rune from your strip, anywhere on the page' : '', 1.6); break;
      case 'go': if (mode !== 'tut') { L.setBanner('Scrawl!', '', 0.9, '#8e2b1e'); sfx('bell'); } break;
      case 'roundEnd': {
        const t = e.winner < 0 ? 'Even' : e.winner === me ? 'Round won' : 'Round lost';
        L.setBanner(t, e.timeout ? 'Out of time' : '', 2.4, e.winner === me ? '#3c6d37' : e.winner < 0 ? INK : '#8e2b1e');
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
  if (mode === 'ai' && won) arcadeScore((aiLevel + 1) * 100 + Math.round(S.wiz[me].hp / 2), { level: LEVELS[aiLevel].id });
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
let prev = performance.now(), lastCount = 0, idleFrame = 0;
function runBot(dt) {
  const job = bot.update(S, dt);
  if (job) R.liveInk('bot', []);
  if (!bot.job) return;
  const j = bot.job; j.t += dt;
  const total = j.strokes.reduce((a, s) => a + s.length, 0);
  let n = Math.floor(total * Math.min(1, j.t / j.dur));
  R.liveInk('bot', j.strokes.map(s => { const k = Math.min(s.length, Math.max(0, n)); n -= k; return s.slice(0, k); }).filter(s => s.length));
  if (j.t >= j.dur) {
    bot.job = null; R.liveInk('bot', null);
    const r = cast(S, bot.p, j.spec);
    R.glyphDone(j.strokes, r.ok ? 'cast' : 'fizzle', r.ok ? [S.loadouts[bot.p][j.slot].el] : null);
  }
}
function runDummy(dt) {
  if (!tut || !TUT[tut.i].dummy || S.phase !== 'fight') return;
  tut.fireT -= dt;
  if (tut.fireT <= 0) { tut.fireT = 2.6; cast(S, 1, { slot: 0, cx: 1250, cy: 450, w: 90, h: 90, ang: null, q: 0.4 }); S.wiz[1].mana = 100; S.wiz[1].cds.fill(0); }
}
function loop(now) {
  // behind the menus the desk only needs half the frames
  if (!S && mode === 'menu' && (idleFrame++ & 1)) { requestAnimationFrame(loop); return; }
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
  if (S && (mode === 'ai' || mode === 'host' || mode === 'tut')) {
    acc += dt;
    while (acc >= 1 / 60) {
      if (bot) runBot(1 / 60);
      if (mode === 'tut') runDummy(1 / 60);
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
    // smooth between snapshots
    for (const e of S.ents) { if (e.vx !== undefined) { e.x += e.vx * dt; e.y += e.vy * dt; } e.t += dt; }
    for (const w of S.wiz) for (let i = 0; i < w.cds.length; i++) w.cds[i] = Math.max(0, w.cds[i] - dt);
    if (S.phase === 'fight') S.roundT -= dt; else S.phaseT -= dt;
    S.t += dt;
  }
  if (S && pen.dirty && net && now - pen.sentAt > 50) { pen.dirty = false; pen.sentAt = now; net.send({ t: 'ink', g: pen.g, s: pen.strokes.map(s => slimW(s)) }); }
  if (S && S.phase === 'count') { const c = Math.ceil(S.phaseT); if (c !== lastCount && c > 0) { lastCount = c; sfx('tick'); } } else lastCount = 0;
  R.frame(S, { me }, dt);
  requestAnimationFrame(loop);
}
addEventListener('resize', () => R.resize());
requestAnimationFrame(loop);

const qp = new URLSearchParams(location.search).get('room');
if (qp) { $('#joincode').value = qp.toUpperCase().slice(0, 4); show('join'); } else show('menu');

// test hook
window.__scrawl = {
  get S() { return S; }, get mode() { return mode; }, get tut() { return tut; }, book: () => book, R,
  cast: (slot, x, y, size = 100) => S && cast(S, me, { slot, cx: x, cy: y, w: size, h: size, ang: null, q: 0.8 }),
  quickCast, startAI, startTut, runeName, project: (x, y) => R.project(x, y, 0),
};
