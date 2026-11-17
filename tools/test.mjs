// Headless checks: rune recognition accuracy, scribble rejection, and bot-vs-bot matches at every level.
import { SHAPES, jitter, rng, makeRune, DEFAULT_RUNES } from '../public/js/data.js';
import { templatesFor, recognize } from '../public/js/recognizer.js';
import { newMatch, step, cast } from '../public/js/sim.js';
import { Bot, botLoadout } from '../public/js/ai.js';

let bad = 0;
const runes = DEFAULT_RUNES.map((r, i) => makeRune(r.el, r.form, r.shape, 11 + i * 7));
const T = templatesFor(runes), rnd = rng(99);
let ok = 0, n = 0; const miss = {};
for (const [i, d] of DEFAULT_RUNES.entries()) for (let k = 0; k < 40; k++) {
  const s = jitter(SHAPES[d.shape](), rnd, 2.2).map(st => st.map(([x, y]) => [x * 1.6 + 300, y * 1.6 + 200]));
  const res = recognize(s, T); n++;
  if (res && res.slot === i) ok++; else miss[d.shape] = (miss[d.shape] || 0) + 1;
}
console.log(`recognizer: ${ok}/${n} sloppy runes recognized`, Object.keys(miss).length ? miss : '');
if (ok / n < 0.9) bad++;
let rej = 0;
for (let k = 0; k < 60; k++) {
  let x = 300, y = 300; const st = [];
  for (let j = 0; j < 40; j++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; st.push([x, y]); }
  const res = recognize([st], T); if (!res || res.slot < 0) rej++;
}
console.log(`scribbles rejected: ${rej}/60`);

for (let lv = 0; lv < 3; lv++) {
  for (let m = 0; m < 3; m++) {
    const S = newMatch([botLoadout(lv), botLoadout(lv)], ['A', 'B']);
    const bots = [new Bot(lv, 0), new Bot(lv, 1)];
    let t = 0, casts = 0, fails = 0, fusions = 0;
    while (S.phase !== 'over' && t < 700) {
      for (const b of bots) {
        b.update(S, 1 / 60);
        if (b.job) { b.job.t += 1 / 60; if (b.job.t >= b.job.dur) { const r = cast(S, b.p, b.job.spec); r.ok ? casts++ : fails++; b.job = null; } }
      }
      step(S, 1 / 60);
      for (const e of S.ev) if (e.type === 'cast' && e.fused) fusions++;
      S.ev.length = 0; t += 1 / 60;
      const nan = [...S.wiz.flatMap(w => [w.hp, w.mana, w.y]), ...S.ents.flatMap(e => [e.x, e.y, e.dmg ?? 0, e.hp ?? 0])].some(v => !isFinite(v));
      if (nan) { console.log('NaN in state', JSON.stringify(S).slice(0, 400)); bad++; break; }
    }
    console.log(`level ${lv} match ${m}: ${S.phase} wins ${S.wins.join('-')} rounds ${S.round} time ${t.toFixed(0)}s casts ${casts} refused ${fails} fusions ${fusions} dmg ${S.stats.map(s => Math.round(s.dmg)).join('/')}`);
    if (S.phase !== 'over') bad++;
  }
}
if (bad) { console.log(`${bad} problem(s)`); process.exit(1); }
console.log('all ok');
