// Scrawl runebook: six custom runes, saved in this browser. Each rune = 3 drawn samples + element + form.
import { DEFAULT_RUNES, makeRune, EL, FORMS, EL_IDS, FORM_IDS, runeName } from './data.js';
import { templatesFor, recognize, normalize, match } from './recognizer.js';
import { drawGlyph, brush, makeParchment, INK, elc } from './render.js';
import { sfx, audioInit, scratchStart, scratchStop, scratchSpeed } from './audio.js';

const KEY = 'scrawl.book.v1';
export const defaultBook = () => ({ runes: DEFAULT_RUNES.map((r, i) => makeRune(r.el, r.form, r.shape, 11 + i * 7)) });
const okStroke = s => Array.isArray(s) && s.length >= 2 && s.every(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
export const validBook = b => b && Array.isArray(b.runes) && b.runes.length === 6 &&
  b.runes.every(r => EL[r.el] && FORMS[r.form] && Array.isArray(r.samples) && r.samples.length >= 1 && r.samples.length <= 5 && r.samples.every(s => Array.isArray(s) && s.length >= 1 && s.length <= 6 && s.every(okStroke)));
export function loadBook() { try { const b = JSON.parse(localStorage.getItem(KEY)); if (validBook(b)) return b; } catch {} return defaultBook(); }
export function saveBook(b) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch {} }

// thin a stroke to at most n points, rounded, for storage and the network
export const slim = (strokes, n = 40) => strokes.map(s => {
  const step = Math.max(1, s.length / n), out = [];
  for (let i = 0; i < s.length; i += step) out.push(s[Math.floor(i)]);
  if (out[out.length - 1] !== s[s.length - 1]) out.push(s[s.length - 1]);
  return out.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
});
// loadout as the game uses it: element, form and one glyph to show
export const loadoutOf = book => book.runes.map(r => ({ el: r.el, form: r.form, glyph: slim(r.samples[0], 30) }));

// ---------- editor ----------
export function mountBook(root, getBook, setBook) {
  const $ = s => root.querySelector(s);
  const pages = $('#pages'), pad = $('#pad'), pg = pad.getContext('2d'), msg = $('#padmsg');
  const paper = makeParchment(pad.width, pad.height, false);
  let sel = 0, mode = 'test', fresh = [], strokes = [], cur = null, timer = null, last = null, shown = null;

  const book = () => getBook();
  const commit = b => { saveBook(b); setBook(b); };

  function drawPad() {
    pg.drawImage(paper, 0, 0);
    pg.strokeStyle = 'rgba(42,32,23,0.15)'; pg.lineWidth = 1; pg.setLineDash([4, 6]);
    pg.strokeRect(30, 30, pad.width - 60, pad.height - 60); pg.setLineDash([]);
    if (shown) drawGlyph(pg, shown.strokes, 20, 20, pad.width - 40, shown.c, 4);
    for (const s of strokes) brush(pg, s, INK, 1);
  }
  function renderPages() {
    const b = book();
    pages.innerHTML = '';
    b.runes.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'page' + (i === sel ? ' on' : '');
      const c = document.createElement('canvas'); c.width = c.height = 64;
      drawGlyph(c.getContext('2d'), r.samples[0], 4, 4, 56, elc([r.el]), 3);
      const t = document.createElement('div');
      t.innerHTML = `<b>${runeName(r)}</b><span>Rune ${i + 1} · ${r.samples.length} samples</span>`;
      li.append(c, t);
      li.onclick = () => { sel = i; mode = 'test'; fresh = []; strokes = []; shown = null; renderAll(); sfx('page'); };
      pages.append(li);
    });
  }
  function renderEditor() {
    const r = book().runes[sel];
    $('#ename').textContent = runeName(r);
    const els = $('#els'); els.innerHTML = '';
    EL_IDS.forEach(id => {
      const b = document.createElement('button');
      b.className = 'chip' + (r.el === id ? ' on' : ''); b.style.setProperty('--c', EL[id].ink); b.textContent = EL[id].name;
      b.onclick = () => { const bk = book(); bk.runes[sel].el = id; commit(bk); renderAll(); };
      els.append(b);
    });
    $('#eldesc').textContent = EL[r.el].blurb + (EL[r.el].beats ? ` Strong against ${EL[EL[r.el].beats].name}.` : '');
    const fm = $('#forms'); fm.innerHTML = '';
    FORM_IDS.forEach(id => {
      const b = document.createElement('button');
      b.className = 'chip' + (r.form === id ? ' on' : ''); b.textContent = FORMS[id].name;
      b.onclick = () => { const bk = book(); bk.runes[sel].form = id; commit(bk); renderAll(); };
      fm.append(b);
    });
    $('#formdesc').textContent = `${FORMS[r.form].blurb} Costs about ${FORMS[r.form].cost} ink, ${FORMS[r.form].cd}s to dry.`;
    const sm = $('#samples'); sm.innerHTML = '';
    const list = mode === 'record' ? fresh : r.samples;
    for (let i = 0; i < 3; i++) {
      const c = document.createElement('canvas'); c.width = c.height = 56; c.className = 'sample' + (list[i] ? '' : ' empty');
      if (list[i]) drawGlyph(c.getContext('2d'), list[i], 3, 3, 50, mode === 'record' ? INK : elc([r.el]), 2.5);
      sm.append(c);
    }
    $('#redraw').textContent = mode === 'record' ? 'Cancel redraw' : 'Redraw this glyph';
    if (mode === 'record') msg.textContent = `Draw your new glyph on the pad: ${fresh.length + 1} of 3. Pause and it's taken.`;
  }
  function renderAll() { renderPages(); renderEditor(); drawPad(); }

  $('#redraw').onclick = () => {
    if (mode === 'record') { mode = 'test'; fresh = []; msg.textContent = 'Kept the old glyph.'; }
    else { mode = 'record'; fresh = []; shown = null; }
    strokes = []; renderAll();
  };

  const pos = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
  pad.onpointerdown = e => {
    audioInit(); pad.setPointerCapture(e.pointerId); clearTimeout(timer);
    if (!strokes.length) shown = null;
    const [x, y] = pos(e); cur = [[x, y, 4]]; strokes.push(cur); last = { x, y, t: performance.now() };
    scratchStart(); drawPad();
  };
  pad.onpointermove = e => {
    if (!cur) return;
    for (const ev of e.getCoalescedEvents?.() || [e]) {
      const [x, y] = pos(ev), now = performance.now(), d = Math.hypot(x - last.x, y - last.y);
      if (d < 1.5) continue;
      const v = d / Math.max(1, now - last.t) * 1000;
      cur.push([x, y, Math.max(2, Math.min(7, 7 - v * 0.003))]); last = { x, y, t: now }; scratchSpeed(v);
    }
    drawPad();
  };
  pad.onpointerup = pad.onpointercancel = () => {
    if (!cur) return;
    cur = null; scratchStop();
    timer = setTimeout(finish, mode === 'record' ? 650 : 420);
  };

  function finish() {
    const s = strokes.filter(st => st.length > 1); strokes = [];
    const len = s.reduce((a, st) => a + st.reduce((b, p, i) => i ? b + Math.hypot(p[0] - st[i - 1][0], p[1] - st[i - 1][1]) : 0, 0), 0);
    if (len < 30) { drawPad(); return; }
    const plain = slim(s.map(st => st.map(p => [p[0], p[1]])), 48);
    const b = book();
    if (mode === 'record') {
      fresh.push(plain); sfx('tick');
      if (fresh.length >= 3) {
        b.runes[sel].samples = fresh; mode = 'test'; fresh = [];
        commit(b);
        // warn when the new glyph looks like another rune
        const mine = b.runes[sel].samples.map(normalize).filter(Boolean);
        let worst = null;
        b.runes.forEach((r, i) => {
          if (i === sel) return;
          for (const t of r.samples.map(normalize).filter(Boolean)) for (const m of mine) { const d = match(m, t); if (!worst || d < worst.d) worst = { d, i }; }
        });
        msg.textContent = worst && worst.d < 1.05
          ? `Saved, but it looks a lot like your ${runeName(b.runes[worst.i])}. They may get mixed up in a duel.`
          : 'Saved. Draw it on the pad to test it.';
        sfx(worst && worst.d < 1.05 ? 'fizzle' : 'fuse');
      }
      renderAll(); return;
    }
    const res = recognize(plain, templatesFor(b.runes));
    if (!res || res.slot < 0) { msg.textContent = 'Not recognized. That would fizzle in a duel.'; shown = { strokes: plain, c: '#8a7a66' }; sfx('fizzle'); }
    else {
      const r = b.runes[res.slot];
      msg.textContent = `${runeName(r)} (rune ${res.slot + 1}) · neatness ${Math.round(res.q * 100)}%`;
      shown = { strokes: plain, c: elc([r.el]) }; sfx('tick');
      if (res.slot !== sel) { sel = res.slot; }
    }
    renderAll();
  }

  $('#bexport').onclick = () => {
    const blob = new Blob([JSON.stringify({ scrawl: 1, ...book() })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'scrawl-runebook.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('#bimport').onclick = () => $('#bfile').click();
  $('#bfile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const b = JSON.parse(await f.text());
      if (!validBook(b)) throw 0;
      commit({ runes: b.runes.map(r => ({ el: r.el, form: r.form, samples: r.samples })) }); msg.textContent = 'Runebook imported.'; renderAll();
    } catch { msg.textContent = "That file isn't a Scrawl runebook."; }
  };
  $('#breset').onclick = () => {
    if (!confirm('Reset all six runes to the starter runebook?')) return;
    commit(defaultBook()); sel = 0; mode = 'test'; fresh = []; msg.textContent = 'Back to the starter runes.'; renderAll();
  };

  return {
    open() { sel = 0; mode = 'test'; fresh = []; strokes = []; shown = null; msg.textContent = 'Draw any rune on the pad to test it, or pick a page to change it.'; renderAll(); },
  };
}
