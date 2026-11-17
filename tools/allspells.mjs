// Every element x form gets cast in a live match; checks nothing throws or goes NaN.
import { EL_IDS, FORM_IDS, makeRune } from '../public/js/data.js';
import { newMatch, step, cast } from '../public/js/sim.js';
let n = 0, bad = 0;
for (const el of EL_IDS) for (const form of FORM_IDS) {
  const lo = [{ el, form }, { el: 'earth', form: 'wall' }, { el: 'fire', form: 'bolt' }, { el: 'life', form: 'shield' }, { el: 'void', form: 'orb' }, { el: 'frost', form: 'sigil' }];
  const S = newMatch([lo, lo], ['A', 'B']); S.phase = 'fight';
  for (let t = 0; t < 600; t++) {
    if (t % 40 === 0) { cast(S, 0, { slot: 0, cx: 500, cy: 300 + (t % 300), w: 120, h: 120, ang: null, q: 0.8 }); cast(S, 1, { slot: (t / 40) % 6 | 0, cx: 1100, cy: 450, w: 120, h: 120, ang: null, q: 0.8 }); n += 2; }
    if (t % 97 === 0) cast(S, 0, { slot: 0, cx: 500, cy: 450, quick: true });
    step(S, 1 / 60);
    const vals = [...S.wiz.flatMap(w => [w.hp, w.mana, ...w.cds]), ...S.ents.flatMap(e => [e.x, e.y, e.dmg ?? 0, e.hp ?? 0])];
    if (vals.some(v => !isFinite(v))) { console.log('NaN with', el, form); bad++; break; }
    S.ev.length = 0;
    if (S.phase !== 'fight') S.phase = 'fight';
  }
}
console.log(`all spells: ${EL_IDS.length * FORM_IDS.length} combos, ${n} casts, ${bad ? bad + ' broke' : 'no errors'}`);
if (bad) process.exit(1);
