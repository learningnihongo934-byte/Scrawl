// Scrawl duel simulation. Pure state + step(); runs in AI duels and on the host in online rooms.
// Players: 0 = left page, 1 = right page. Wizards stand still; spells are aimed at the enemy wizard.
import { W, H, MID, WIZ_X, WIZ_R, EL, FORMS, ROUND_T, MAX_HP, MAX_MANA, MANA_REGEN, fusionName } from './data.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hyp = Math.hypot;
const MOVERS = new Set(['bolt', 'orb', 'fam']);
export const isMover = e => MOVERS.has(e.k);

export function elStats(els) {
  const s = { dmg: 1, speed: 1, hp: 1 };
  for (const e of els) { s.dmg *= EL[e].dmg; s.speed *= EL[e].speed; s.hp *= EL[e].hp; }
  s.pierce = els.includes('void'); s.life = els.includes('life'); s.iron = els.includes('iron');
  return s;
}
// damage multiplier of a against b
export function adv(a, b) {
  const up = a.some(x => EL[x].beats.some(y => b.includes(y))), down = b.some(x => EL[x].beats.some(y => a.includes(y)));
  return up && !down ? 1.5 : down && !up ? 0.67 : 1;
}
export function wallEnds(e) {
  const c = Math.cos(e.ang) * e.len / 2, s = Math.sin(e.ang) * e.len / 2;
  return [e.x - c, e.y - s, e.x + c, e.y + s];
}
function segDist(px, py, e) {
  const [ax, ay, bx, by] = wallEnds(e), dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return hyp(px - (ax + dx * t), py - (ay + dy * t));
}
// where segment p->q crosses segment a->b, as a fraction along p->q (or null)
function cross(px, py, qx, qy, ax, ay, bx, by) {
  const rx = qx - px, ry = qy - py, sx = bx - ax, sy = by - ay, d = rx * sy - ry * sx;
  if (Math.abs(d) < 1e-9) return null;
  const t = ((ax - px) * sy - (ay - py) * sx) / d, u = ((ax - px) * ry - (ay - py) * rx) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}
export const runeCost = (form, pw) => Math.round(FORMS[form].cost * (0.6 + 0.4 * pw));
export const sizePower = (w, h) => clamp(0.6 + (hyp(w, h) - 60) / 300, 0.6, 1.5);

// statuses: timers in seconds (poison also has a stack count)
const BAD = ['burnT', 'chillT', 'shockT', 'windT', 'dazzleT', 'hexT', 'markT', 'silenceT'];
function mkWiz(p) {
  return { x: WIZ_X[p], y: H / 2, hp: MAX_HP, mana: 60, shield: 0, shieldMax: 0, shieldT: 0, shieldEls: [], thorns: false,
    burnT: 0, chillT: 0, shockT: 0, windT: 0, dazzleT: 0, hexT: 0, markT: 0, silenceT: 0, poisonN: 0, poisonT: 0,
    hasteT: 0, regenT: 0, regen: 0, leechT: 0, leech: 0,
    cds: [0, 0, 0, 0, 0, 0], hurtT: 0, castT: 0, chain: 0, chainT: -9, last: null };
}
const mkStats = () => ({ dmg: 0, casts: 0, fused: 0, best: '' });

export function newMatch(loadouts, names, opts = {}) {
  return { t: 0, phase: 'count', phaseT: opts.tut ? 1 : 3, tut: !!opts.tut, round: 1, roundT: ROUND_T, wins: [0, 0], names, loadouts,
    wiz: [mkWiz(0), mkWiz(1)], ents: [], ev: [{ type: 'round', round: 1 }], nid: 1, winner: -1, stats: [mkStats(), mkStats()] };
}
function nextRound(S) {
  S.round++; S.wiz = [mkWiz(0), mkWiz(1)]; S.ents = []; S.phase = 'count'; S.phaseT = 3; S.roundT = ROUND_T;
  S.ev.push({ type: 'round', round: S.round });
}

function onHitStatus(w, els) {
  if (els.includes('fire')) w.burnT = 3;
  if (els.includes('frost')) w.chillT = 2;
  if (els.includes('storm')) w.shockT = 0.4;
  if (els.includes('venom')) { w.poisonN = Math.min(3, w.poisonN + 1); w.poisonT = 5; }
  if (els.includes('gale')) w.windT = 2.5;
  if (els.includes('radiant')) w.dazzleT = 3;
  if (els.includes('umbral')) w.hexT = 3;
}

// damage to wizard p from player 1-p
function hurtWiz(S, p, amount, els, x, y) {
  if (S.phase !== 'fight' || amount <= 0) return;
  const w = S.wiz[p], o = S.wiz[1 - p];
  let a = amount * (o.hexT > 0 ? 0.7 : 1) * (w.markT > 0 ? 1.25 : 1), shielded = 0;
  if (w.shield > 0) {
    let m = adv(w.shieldEls, els) > 1 ? 0.5 : adv(w.shieldEls, els) < 1 ? 1.5 : 1;
    if (els.includes('iron')) m *= 2;
    const absorb = Math.min(w.shield, a * m);
    w.shield -= absorb; shielded = absorb / m; a -= shielded;
    if (w.thorns && shielded > 0) { o.hp = Math.max(S.tut ? 1 : 0, o.hp - shielded * 0.6); S.ev.push({ type: 'hit', p: 1 - p, x: o.x, y: o.y, amt: Math.round(shielded * 0.6), shielded: 0, els: w.shieldEls }); }
    if (w.shield <= 0.01) { w.shield = 0; w.shieldT = 0; w.thorns = false; S.ev.push({ type: 'shieldbreak', p }); }
  }
  if (a > 0.05) {
    w.hp = Math.max(S.tut ? 1 : 0, w.hp - a); w.hurtT = 0.35;
    onHitStatus(w, els);
  }
  S.stats[1 - p].dmg += a;
  if (els.includes('life') && a > 0) o.hp = Math.min(MAX_HP, o.hp + a * 0.5);
  S.ev.push({ type: 'hit', p, x, y, amt: Math.round(a), shielded: Math.round(shielded), els });
}

// spec: { slot, cx, cy, w, h, ang, q, quick }  (page coords, q = neatness 0..1, ang null = face the enemy)
// quick = hotkey cast: fixed spot, 70% power, never fuses
export function cast(S, p, spec) {
  if (S.phase !== 'fight') return { ok: false, reason: 'wait' };
  const rune = S.loadouts[p]?.[spec.slot];
  if (!rune) return { ok: false, reason: 'unknown' };
  const w = S.wiz[p], Fm = FORMS[rune.form];
  const quick = !!spec.quick, pw = quick ? 1 : sizePower(spec.w || 0, spec.h || 0), cost = runeCost(rune.form, pw);
  const fail = reason => { S.ev.push({ type: 'fail', p, reason, x: spec.cx, y: spec.cy }); return { ok: false, reason }; };
  if (w.silenceT > 0 || w.shockT > 0) return fail('silenced');
  if (w.cds[spec.slot] > 0) return fail('cd');
  if (w.mana < cost) return fail('mana');
  if (rune.form === 'echo' && !w.last) return fail('echo');
  w.mana -= cost; w.cds[spec.slot] = Fm.cd; w.castT = 0.4;
  w.chain = S.t - w.chainT < 1.6 ? Math.min(w.chain + 1, 5) : 0; w.chainT = S.t;
  const q = quick ? 0.3 : clamp(spec.q ?? 0.6, 0, 1);
  let power = pw * (0.85 + 0.3 * q) * (1 + 0.08 * w.chain) * (quick ? 0.7 : 1) * (w.dazzleT > 0 ? 0.8 : 1);
  S.stats[p].casts++;

  if (rune.form === 'echo') {
    const L = w.last;
    spawn(S, p, L.form, [...L.els], L.spec, L.power * 0.7, null, true);
    S.ev.push({ type: 'cast', p, form: 'echo', els: [rune.el], x: L.spec.cx, y: L.spec.cy, echoed: L.form, chain: w.chain, power });
    return { ok: true };
  }

  // Fusion: draw a rune on top of one of your own spells
  let els = [rune.el], host = null;
  for (const e of quick ? [] : S.ents) {
    if (e.o !== p || e.dead) continue;
    const d = e.k === 'wall' ? segDist(spec.cx, spec.cy, e) : hyp(spec.cx - e.x, spec.cy - e.y);
    const reach = e.k === 'wall' ? 40 : (e.k === 'sigil' || e.k === 'comet' || e.k === 'zone' || e.k === 'rain') ? e.r * 0.8 : (e.k === 'orb' || e.k === 'totem' || e.k === 'mine' || e.k === 'fam') ? (e.r || 20) + 34 : -1;
    if (d < reach) { host = e; break; }
  }
  if (host) {
    const set = [...new Set([...host.els, rune.el])];
    els = set.length > 2 ? set.slice(-2) : set;
    power *= els.length === 1 ? 1.45 : 1.3;
    host.dead = true; S.stats[p].fused++;
  }
  const fused = host ? fusionName(els) : null;
  const at = spawn(S, p, rune.form, els, spec, power, host, false);
  w.last = { form: rune.form, els, spec: { cx: spec.cx, cy: spec.cy, w: spec.w, h: spec.h, ang: spec.ang }, power };
  if (fused && (!S.stats[p].best || els.length > 1)) S.stats[p].best = (at.ram ? fused + ' Ram' : fused + ' ' + Fm.name);
  S.ev.push({ type: 'cast', p, form: rune.form, els, x: at.x, y: at.y, fused, ram: !!at.ram, chain: w.chain, power, quick });
  return { ok: true };
}

// put a spell on the page; returns where it appeared
function spawn(S, p, form, els, spec, power, host, echo) {
  const w = S.wiz[p], foe = S.wiz[1 - p], st = elStats(els);
  const aimAt = (x, y) => Math.atan2(foe.y - y, foe.x - x);
  const ownX = x => p === 0 ? clamp(x, WIZ_X[0] + 50, MID - 30) : clamp(x, MID + 30, WIZ_X[1] - 50);
  const hx = host ? host.x : spec.cx, hy = host ? host.y : spec.cy;
  const px = ownX(hx), py = clamp(hy, 60, H - 60);
  const base = { id: S.nid++, o: p, els, t: 0, power };
  const push = e => { S.ents.push(e); return e; };
  const bolt = (x, y, a, dmg, r, sp, extra = {}) => push({ ...base, id: S.nid++, k: 'bolt', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, dmg, ...extra });
  switch (form) {
    case 'bolt': {
      if (host && host.k === 'wall') {
        const sp = 720 * st.speed * 0.55;
        return bolt(host.x, host.y, aimAt(host.x, host.y), 11 * power * st.dmg + host.hp * 0.7, clamp(host.len * 0.28, 24, 70), sp, { ram: true });
      }
      return bolt(px, py, aimAt(px, py), 11 * power * st.dmg, 9 + 7 * power, 720 * st.speed);
    }
    case 'scatter': {
      const a = aimAt(px, py);
      for (const d of [-0.2, 0, 0.2]) bolt(px, py, a + d, 5.5 * power * st.dmg, 7 + 4 * power, 680 * st.speed);
      return { x: px, y: py };
    }
    case 'beam': {
      const x2 = foe.x, y2 = foe.y, dmg = 13 * power * st.dmg;
      let best = null;
      for (const e of S.ents) {
        if (e.dead || e.o === p) continue;
        let t = null;
        if (e.k === 'wall' && !st.pierce) { const [ax, ay, bx, by] = wallEnds(e); t = cross(px, py, x2, y2, ax, ay, bx, by); }
        else if (e.k === 'totem') {
          const dx = x2 - px, dy = y2 - py, L2 = dx * dx + dy * dy, tt = clamp(((e.x - px) * dx + (e.y - py) * dy) / L2, 0, 1);
          if (hyp(px + dx * tt - e.x, py + dy * tt - e.y) < e.r) t = tt;
        }
        if (t !== null && (!best || t < best.t)) best = { t, e };
      }
      if (best) {
        const e = best.e, ex = px + (x2 - px) * best.t, ey = py + (y2 - py) * best.t;
        e.hp -= dmg * adv(els, e.els); if (e.hp <= 0) breakThing(S, e);
        S.ev.push({ type: 'beam', x1: px, y1: py, x2: ex, y2: ey, els, blocked: true });
      } else {
        S.ev.push({ type: 'beam', x1: px, y1: py, x2, y2, els });
        hurtWiz(S, 1 - p, dmg, els, foe.x, foe.y);
      }
      return { x: px, y: py };
    }
    case 'orb': {
      const sp = 230 * st.speed, a = aimAt(px, py);
      return push({ ...base, k: 'orb', x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp, r: 14 + 6 * power, dmg: 22 * power * st.dmg, life: 9 });
    }
    case 'familiar': {
      const sp = 140 * st.speed, a = aimAt(px, py);
      return push({ ...base, k: 'fam', x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp, r: 18, dmg: 20 * power * st.dmg, armor: 1.6 });
    }
    case 'sigil': case 'comet': case 'rain': {
      const x = clamp(hx, 40, W - 40), y = clamp(hy, 60, H - 60), big = host ? 1.15 : 1;
      if (form === 'sigil') return push({ ...base, k: 'sigil', x, y, r: (55 + 45 * power) * big, dmg: 20 * power * st.dmg, delay: 1.25 / Math.sqrt(st.speed) });
      if (form === 'comet') return push({ ...base, k: 'comet', x, y, r: (60 + 40 * power) * big, dmg: 32 * power * st.dmg, delay: 1.7 / Math.sqrt(st.speed) });
      return push({ ...base, k: 'rain', x, y, r: (80 + 50 * power) * big, dps: 9 * power * st.dmg, life: 2.8, tick: 0 });
    }
    case 'totem': {
      const hp = 26 * power * st.hp;
      return push({ ...base, k: 'totem', x: px, y: py, r: 26, hp, maxhp: hp, life: 7, fire: 0.6, dmg: 5 * power * st.dmg });
    }
    case 'wall': case 'mirror': {
      const len = clamp(Math.max(spec.w || 0, spec.h || 0) * 1.15, 90, 340) * (host ? 1.2 : 1);
      const hp = (form === 'mirror' ? 20 : 30) * power * st.hp;
      const ang = host?.k === 'wall' ? host.ang : typeof spec.ang === 'number' ? spec.ang : aimAt(px, py) + Math.PI / 2;
      return push({ ...base, k: 'wall', mirror: form === 'mirror', x: px, y: py, ang, len, hp, maxhp: hp, life: form === 'mirror' ? 6 : 9 });
    }
    case 'mine': return push({ ...base, k: 'mine', x: px, y: py, r: 34, dmg: 14 * power * st.dmg, life: 12 });
    case 'mire': return push({ ...base, k: 'zone', z: 'mire', x: px, y: py, r: 90 + 50 * power, life: 7 });
    case 'vortex': return push({ ...base, k: 'zone', z: 'vortex', x: px, y: py, r: 80 + 50 * power, life: 5 });
    case 'shield': case 'thorns': {
      const amt = (form === 'thorns' ? 18 : 28) * power * (st.hp > 1.2 ? 1.3 : 1);
      w.shield = Math.max(w.shield, amt); w.shieldMax = w.shield; w.shieldT = 6; w.shieldEls = els; w.thorns = form === 'thorns';
      return { x: w.x, y: w.y };
    }
    case 'mend': w.regenT = 5; w.regen = 30 * power * (st.life ? 1.4 : 1) / 5; S.ev.push({ type: 'buff', p, form, els }); return { x: w.x, y: w.y };
    case 'haste': w.hasteT = 5 * Math.min(1.3, power); S.ev.push({ type: 'buff', p, form, els }); return { x: w.x, y: w.y };
    case 'cleanse':
      for (const k of BAD) w[k] = 0; w.poisonN = 0; w.poisonT = 0;
      w.hp = Math.min(MAX_HP, w.hp + 8 * power); S.ev.push({ type: 'buff', p, form, els }); return { x: w.x, y: w.y };
    case 'hex': case 'mark': case 'silence': case 'leech': {
      if (form === 'hex') foe.hexT = 5 * Math.min(1.3, power);
      if (form === 'mark') foe.markT = 4 * Math.min(1.3, power);
      if (form === 'silence') { for (let i = 0; i < foe.cds.length; i++) foe.cds[i] += 2 * Math.min(1.3, power); foe.silenceT = 0.8; }
      if (form === 'leech') { w.leechT = 4; w.leech = power * st.dmg; }
      onHitStatus(foe, els);
      S.ev.push({ type: 'curse', p: 1 - p, form, els, x: foe.x, y: foe.y });
      return { x: foe.x, y: foe.y };
    }
  }
  void echo;
  return { x: px, y: py };
}

function breakThing(S, e) {
  if (e.dead) return;
  e.dead = true;
  if (e.k === 'wall') S.ev.push({ type: 'wallbreak', x: e.x, y: e.y, els: e.els, ang: e.ang, len: e.len });
  else S.ev.push({ type: 'clash', x: e.x, y: e.y, els: e.els });
}

function detonate(S, e, foe) {
  e.dead = true;
  S.ev.push({ type: 'blast', x: e.x, y: e.y, r: e.r, els: e.els, o: e.o, comet: e.k === 'comet' });
  if (hyp(foe.x - e.x, foe.y - e.y) < e.r + WIZ_R * 0.5) hurtWiz(S, 1 - e.o, e.dmg, e.els, foe.x, foe.y);
  for (const o of S.ents) {
    if (o.dead || o.o === e.o) continue;
    if (o.k === 'wall') { if (segDist(e.x, e.y, o) < e.r) { o.hp -= e.dmg * adv(e.els, o.els); if (o.hp <= 0) breakThing(S, o); } }
    else if (hyp(o.x - e.x, o.y - e.y) < e.r + (o.r || 0) * 0.5) {
      if (o.hp !== undefined) { o.hp -= e.dmg * adv(e.els, o.els); if (o.hp <= 0) breakThing(S, o); }
      else if (isMover(o)) { o.dead = true; S.ev.push({ type: 'clash', x: o.x, y: o.y, els: o.els }); }
    }
  }
}

export function step(S, dt) {
  S.t += dt;
  if (S.phase === 'over') return;
  if (S.phase === 'end') {
    S.phaseT -= dt;
    if (S.phaseT <= 0) {
      if (S.wins[0] >= 2 || S.wins[1] >= 2 || S.round >= 5) {
        S.phase = 'over'; S.winner = S.wins[0] === S.wins[1] ? -1 : S.wins[0] > S.wins[1] ? 0 : 1;
        S.ev.push({ type: 'over', winner: S.winner });
      } else nextRound(S);
    }
    return;
  }
  // wizards
  for (let p = 0; p < 2; p++) {
    const w = S.wiz[p], o = S.wiz[1 - p];
    w.hurtT = Math.max(0, w.hurtT - dt); w.castT = Math.max(0, w.castT - dt);
    if (S.phase !== 'fight') continue;
    const floor = S.tut ? 1 : 0;
    w.mana = Math.min(MAX_MANA, w.mana + MANA_REGEN * (w.chillT > 0 ? 0.75 : 1) * (w.hasteT > 0 ? 2 : 1) * (S.tut ? 2.5 : 1) * dt);
    for (const k of BAD) w[k] = Math.max(0, w[k] - dt);
    if (w.burnT > 0) { w.hp = Math.max(floor, w.hp - 3 * dt); S.stats[1 - p].dmg += 3 * dt; }
    if (w.poisonT > 0) { w.poisonT -= dt; w.hp = Math.max(floor, w.hp - 2 * w.poisonN * dt); S.stats[1 - p].dmg += 2 * w.poisonN * dt; if (w.poisonT <= 0) w.poisonN = 0; }
    if (w.regenT > 0) { w.regenT -= dt; w.hp = Math.min(MAX_HP, w.hp + w.regen * dt); }
    if (w.hasteT > 0) w.hasteT -= dt;
    if (w.leechT > 0) {
      w.leechT -= dt;
      const ink = Math.min(o.mana, 4 * w.leech * dt), life = 2 * w.leech * dt;
      o.mana -= ink; w.mana = Math.min(MAX_MANA, w.mana + ink);
      o.hp = Math.max(floor, o.hp - life); w.hp = Math.min(MAX_HP, w.hp + life); S.stats[p].dmg += life;
    }
    if (w.shieldT > 0) {
      w.shieldT -= dt;
      if (w.shieldEls.includes('life')) w.hp = Math.min(MAX_HP, w.hp + 4 * dt);
      if (w.shieldT <= 0) { w.shield = 0; w.shieldT = 0; w.thorns = false; }
    }
    const dry = dt * (w.hasteT > 0 ? 1.6 : 1) * (w.windT > 0 ? 0.5 : 1);
    for (let i = 0; i < w.cds.length; i++) w.cds[i] = Math.max(0, w.cds[i] - dry);
  }
  if (S.phase === 'count') {
    S.phaseT -= dt;
    if (S.phaseT <= 0) { S.phase = 'fight'; S.ev.push({ type: 'go' }); }
    return;
  }
  if (!S.tut) S.roundT -= dt;

  const ents = S.ents;
  // zones shape enemy movers before they move
  const zones = ents.filter(e => e.k === 'zone' && !e.dead);
  for (const e of ents) {
    if (e.dead) continue;
    e.t += dt;
    const foe = S.wiz[1 - e.o];
    if (isMover(e)) {
      let mul = 1;
      for (const z of zones) {
        if (z.o === e.o) continue;
        const dx = z.x - e.x, dy = z.y - e.y, d = hyp(dx, dy);
        if (d > z.r) continue;
        if (z.z === 'mire') mul = Math.min(mul, 0.4);
        else {
          const sp = hyp(e.vx, e.vy) || 1, pull = 900 * dt;
          e.vx += dx / (d || 1) * pull; e.vy += dy / (d || 1) * pull;
          const ns = hyp(e.vx, e.vy) || 1; e.vx *= sp / ns; e.vy *= sp / ns;
          if (d < 22) { e.dead = true; S.ev.push({ type: 'clash', x: e.x, y: e.y, els: [...e.els, ...z.els] }); }
        }
      }
      if (e.dead) continue;
      if (e.k === 'orb' || e.k === 'fam') {
        const want = Math.atan2(foe.y - e.y, foe.x - e.x), cur = Math.atan2(e.vy, e.vx);
        let d = want - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        const turn = e.k === 'orb' ? 2.2 : 3;
        const a = cur + clamp(d, -turn * dt, turn * dt);
        e.vx = Math.cos(a) * e.sp; e.vy = Math.sin(a) * e.sp;
      }
      e.x += e.vx * dt * mul; e.y += e.vy * dt * mul;
      if (e.k === 'orb' && e.t > e.life) { e.dead = true; S.ev.push({ type: 'fade', x: e.x, y: e.y, els: e.els }); }
      if (e.x < -80 || e.x > W + 80 || e.y < -80 || e.y > H + 80) e.dead = true;
      if (!e.dead && hyp(foe.x - e.x, foe.y - e.y) < WIZ_R + e.r) { e.dead = true; hurtWiz(S, 1 - e.o, e.dmg, e.els, e.x, e.y); }
    } else if (e.k === 'wall' || e.k === 'zone' || e.k === 'mine') {
      if (e.k === 'wall' && e.els.includes('life')) e.hp = Math.min(e.maxhp, e.hp + 3 * dt);
      if (e.t > e.life) { e.dead = true; S.ev.push({ type: 'fade', x: e.x, y: e.y, els: e.els }); }
    } else if (e.k === 'totem') {
      e.fire -= dt;
      if (e.fire <= 0) {
        e.fire = 1.2;
        const a = Math.atan2(foe.y - e.y, foe.x - e.x), sp = 600 * elStats(e.els).speed;
        S.ents.push({ id: S.nid++, o: e.o, els: e.els, t: 0, k: 'bolt', x: e.x + Math.cos(a) * 30, y: e.y + Math.sin(a) * 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 8, dmg: e.dmg, power: e.power * 0.5 });
        S.ev.push({ type: 'shot', x: e.x, y: e.y, els: e.els });
      }
      if (e.t > e.life) { e.dead = true; S.ev.push({ type: 'fade', x: e.x, y: e.y, els: e.els }); }
    } else if ((e.k === 'sigil' || e.k === 'comet') && e.t >= e.delay) detonate(S, e, foe);
    else if (e.k === 'rain') {
      e.tick += dt;
      if (e.tick >= 0.25) {
        e.tick -= 0.25;
        if (hyp(foe.x - e.x, foe.y - e.y) < e.r + WIZ_R * 0.5) hurtWiz(S, 1 - e.o, e.dps * 0.25, e.els, foe.x, foe.y);
        for (const o of ents) {
          if (o.dead || o.o === e.o || hyp(o.x - e.x, o.y - e.y) > e.r) continue;
          if (isMover(o)) { o.dmg -= e.dps * 0.25 * adv(e.els, o.els); if (o.dmg <= 1) { o.dead = true; S.ev.push({ type: 'clash', x: o.x, y: o.y, els: o.els }); } }
          else if (o.hp !== undefined && o.k !== 'wall') { o.hp -= e.dps * 0.25; if (o.hp <= 0) breakThing(S, o); }
        }
      }
      if (e.t > e.life) e.dead = true;
    }
  }
  // movers against enemy walls, totems, mines and other movers
  for (const m of ents) {
    if (m.dead || !isMover(m)) continue;
    for (const w of ents) {
      if (w.dead || w.o === m.o || m.dead) continue;
      if (w.k === 'wall') {
        if (segDist(m.x, m.y, w) > m.r + 9) continue;
        const a = adv(m.els, w.els);
        if (w.mirror && m.k === 'bolt' && !m.ram) {
          // bounce it back: the bolt now belongs to the mirror's owner
          const tgt = S.wiz[1 - w.o], sp = hyp(m.vx, m.vy), ang = Math.atan2(tgt.y - m.y, tgt.x - m.x);
          m.o = w.o; m.vx = Math.cos(ang) * sp; m.vy = Math.sin(ang) * sp; m.dmg *= 0.8;
          w.hp -= m.dmg * 0.3 * a; S.ev.push({ type: 'reflect', x: m.x, y: m.y, els: m.els });
        } else if (elStats(m.els).pierce && !m.ram) {
          m.hitW ||= [];
          if (!m.hitW.includes(w.id)) { m.hitW.push(w.id); w.hp -= m.dmg * 0.5 * a; m.dmg *= 0.75; S.ev.push({ type: 'pierce', x: m.x, y: m.y, els: m.els }); }
        } else if (m.ram) {
          const before = w.hp; w.hp -= m.dmg * a; m.dmg -= before / a;
          S.ev.push({ type: 'wallhit', x: m.x, y: m.y, els: m.els });
          if (m.dmg <= 1) m.dead = true;
        } else {
          w.hp -= m.dmg * a; m.dead = true;
          S.ev.push({ type: 'wallhit', x: m.x, y: m.y, els: m.els });
        }
        if (w.hp <= 0) breakThing(S, w);
      } else if (w.k === 'totem') {
        if (hyp(m.x - w.x, m.y - w.y) > m.r + w.r) continue;
        w.hp -= m.dmg * adv(m.els, w.els); m.dead = true;
        S.ev.push({ type: 'wallhit', x: m.x, y: m.y, els: m.els });
        if (w.hp <= 0) breakThing(S, w);
      } else if (w.k === 'mine') {
        if (hyp(m.x - w.x, m.y - w.y) > m.r + w.r) continue;
        w.dead = true; m.dead = true;
        S.ev.push({ type: 'blast', x: w.x, y: w.y, r: 90, els: w.els, o: w.o, small: true });
        for (const o of ents) if (!o.dead && o.o !== w.o && isMover(o) && hyp(o.x - w.x, o.y - w.y) < 90) { o.dmg -= w.dmg; if (o.dmg <= 1) o.dead = true; }
      }
    }
    if (m.dead) continue;
    for (const o of ents) {
      if (o === m || o.dead || !isMover(o) || o.o === m.o) continue;
      if (hyp(o.x - m.x, o.y - m.y) > o.r + m.r) continue;
      const am = adv(m.els, o.els) * (m.armor || 1), ao = adv(o.els, m.els) * (o.armor || 1), a = m.dmg * am, b = o.dmg * ao;
      if (a > b + 0.5) { m.dmg = (a - b) / am; o.dead = true; }
      else if (b > a + 0.5) { o.dmg = (b - a) / ao; m.dead = true; }
      else { m.dead = o.dead = true; }
      S.ev.push({ type: 'clash', x: (m.x + o.x) / 2, y: (m.y + o.y) / 2, els: [...m.els, ...o.els] });
      if (m.dead) break;
    }
  }
  S.ents = ents.filter(e => !e.dead);

  // round end
  const d0 = S.wiz[0].hp <= 0, d1 = S.wiz[1].hp <= 0;
  if (d0 || d1 || S.roundT <= 0) {
    const h0 = S.wiz[0].hp, h1 = S.wiz[1].hp;
    const winner = d0 && d1 ? -1 : d0 ? 1 : d1 ? 0 : Math.abs(h0 - h1) < 0.5 ? -1 : h0 > h1 ? 0 : 1;
    if (winner >= 0) S.wins[winner]++;
    S.phase = 'end'; S.phaseT = 3.2; S.lastWinner = winner;
    S.ev.push({ type: 'roundEnd', winner, timeout: !d0 && !d1 });
  }
}

// compact copy for the network (rounded numbers, no loadouts)
export function snapshot(S, ev) {
  const { loadouts, ...rest } = S;
  return JSON.stringify({ ...rest, ev }, (k, v) => typeof v === 'number' ? Math.round(v * 10) / 10 : v);
}
