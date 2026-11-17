// Scrawl duel simulation. Pure state + step(); runs in AI duels and on the host in online rooms.
// Players: 0 = left page, 1 = right page.
import { W, H, MID, TOP, BOT, WIZ_X, WIZ_R, EL, FORMS, ROUND_T, MAX_HP, MAX_MANA, MANA_REGEN, fusionName } from './data.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hyp = Math.hypot;

export function elStats(els) {
  const s = { dmg: 1, speed: 1, hp: 1 };
  for (const e of els) { s.dmg *= EL[e].dmg; s.speed *= EL[e].speed; s.hp *= EL[e].hp; }
  s.burn = els.includes('fire'); s.chill = els.includes('frost'); s.pierce = els.includes('void'); s.life = els.includes('life');
  return s;
}
// damage multiplier of a against b
export function adv(a, b) {
  const up = a.some(x => EL[x].beats && b.includes(EL[x].beats)), down = b.some(x => EL[x].beats && a.includes(EL[x].beats));
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
export const runeCost = (form, pw) => Math.round(FORMS[form].cost * (0.6 + 0.4 * pw));
export const sizePower = (w, h) => clamp(0.6 + (hyp(w, h) - 60) / 300, 0.6, 1.5);

function mkWiz(p) {
  return { x: WIZ_X[p], y: H / 2, hp: MAX_HP, mana: 60, shield: 0, shieldMax: 0, shieldT: 0, shieldEls: [], burnT: 0, chillT: 0,
    cds: [0, 0, 0, 0, 0, 0], dir: 0, hurtT: 0, castT: 0, chain: 0, chainT: -9 };
}
const mkStats = () => ({ dmg: 0, casts: 0, fused: 0, best: '' });

export function newMatch(loadouts, names) {
  return { t: 0, phase: 'count', phaseT: 3, round: 1, roundT: ROUND_T, wins: [0, 0], names, loadouts,
    wiz: [mkWiz(0), mkWiz(1)], ents: [], ev: [{ type: 'round', round: 1 }], nid: 1, winner: -1, stats: [mkStats(), mkStats()] };
}
function nextRound(S) {
  S.round++; S.wiz = [mkWiz(0), mkWiz(1)]; S.ents = []; S.phase = 'count'; S.phaseT = 3; S.roundT = ROUND_T;
  S.ev.push({ type: 'round', round: S.round });
}

export function setMove(S, p, d) { S.wiz[p].dir = clamp(Math.round(d) || 0, -1, 1); }

function hurtWiz(S, p, amount, els, x, y) {
  if (S.phase !== 'fight' || amount <= 0) return;
  const w = S.wiz[p], o = S.wiz[1 - p];
  let a = amount, shielded = 0;
  if (w.shield > 0) {
    const m = adv(w.shieldEls, els) > 1 ? 0.5 : adv(w.shieldEls, els) < 1 ? 1.5 : 1;
    const absorb = Math.min(w.shield, a * m);
    w.shield -= absorb; shielded = absorb / m; a -= shielded;
    if (w.shield <= 0.01) { w.shield = 0; w.shieldT = 0; S.ev.push({ type: 'shieldbreak', p }); }
  }
  if (a > 0.05) {
    w.hp = Math.max(0, w.hp - a); w.hurtT = 0.35;
    if (els.includes('fire')) w.burnT = 3;
    if (els.includes('frost')) w.chillT = 2.5;
  }
  S.stats[1 - p].dmg += a;
  if (els.includes('life') && a > 0) o.hp = Math.min(MAX_HP, o.hp + a * 0.5);
  S.ev.push({ type: 'hit', p, x, y, amt: Math.round(a), shielded: Math.round(shielded), els });
}

// spec: { slot, cx, cy, w, h, ang, q }  (world coords, q = neatness 0..1)
export function cast(S, p, spec) {
  if (S.phase !== 'fight') return { ok: false, reason: 'wait' };
  const rune = S.loadouts[p]?.[spec.slot];
  if (!rune) return { ok: false, reason: 'unknown' };
  const w = S.wiz[p], F = FORMS[rune.form];
  const pw = sizePower(spec.w || 0, spec.h || 0), cost = runeCost(rune.form, pw);
  if (w.cds[spec.slot] > 0) { S.ev.push({ type: 'fail', p, reason: 'cd', x: spec.cx, y: spec.cy }); return { ok: false, reason: 'cd' }; }
  if (w.mana < cost) { S.ev.push({ type: 'fail', p, reason: 'mana', x: spec.cx, y: spec.cy }); return { ok: false, reason: 'mana' }; }
  w.mana -= cost; w.cds[spec.slot] = F.cd; w.castT = 0.4;
  w.chain = S.t - w.chainT < 1.6 ? Math.min(w.chain + 1, 5) : 0; w.chainT = S.t;
  const q = clamp(spec.q ?? 0.6, 0, 1);
  let power = pw * (0.85 + 0.3 * q) * (1 + 0.08 * w.chain);
  let els = [rune.el], fused = null, host = null;

  // Fusion: draw a rune on top of one of your own spells.
  for (const e of S.ents) {
    if (e.o !== p || e.dead) continue;
    const d = e.k === 'wall' ? segDist(spec.cx, spec.cy, e) : hyp(spec.cx - e.x, spec.cy - e.y);
    const reach = e.k === 'wall' ? 40 : e.k === 'sigil' ? e.r * 0.8 : e.k === 'orb' ? e.r + 34 : -1;
    if (d < reach) { host = e; break; }
  }
  if (host) {
    const set = [...new Set([...host.els, rune.el])];
    els = set.length > 2 ? [set[set.length - 2], set[set.length - 1]] : set;
    power *= els.length === 1 ? 1.45 : 1.3;
    fused = fusionName(els); host.dead = true;
    S.stats[p].fused++;
  }
  const st = elStats(els), side = p === 0 ? 1 : -1;
  const ownX = x => p === 0 ? clamp(x, WIZ_X[0] + 50, MID - 30) : clamp(x, MID + 30, WIZ_X[1] - 50);
  const base = { id: S.nid++, o: p, els, t: 0, power };
  let ram = false;
  switch (rune.form) {
    case 'bolt': {
      if (host && host.k === 'wall') {
        ram = true;
        const sp = 720 * st.speed * 0.55;
        S.ents.push({ ...base, k: 'bolt', ram: true, x: host.x, y: host.y, vx: side * sp, vy: 0, r: clamp(host.len * 0.28, 24, 70), dmg: 11 * power * st.dmg + host.hp * 0.7 });
      } else {
        const sp = 720 * st.speed;
        S.ents.push({ ...base, k: 'bolt', x: host ? host.x : ownX(spec.cx), y: clamp(host ? host.y : spec.cy, TOP - 50, BOT + 50), vx: side * sp, vy: 0, r: 9 + 7 * power, dmg: 11 * power * st.dmg });
      }
      break;
    }
    case 'wall': {
      const len = clamp(Math.max(spec.w, spec.h) * 1.15, 90, 340) * (host ? 1.2 : 1);
      const hp = 30 * power * st.hp;
      S.ents.push({ ...base, k: 'wall', x: host ? host.x : ownX(spec.cx), y: clamp(host ? host.y : spec.cy, TOP - 60, BOT + 60), ang: host?.k === 'wall' ? host.ang : (spec.ang ?? Math.PI / 2), len, hp, maxhp: hp, life: 9 });
      break;
    }
    case 'shield': {
      const amt = 28 * power * (st.hp > 1.2 ? 1.3 : 1);
      w.shield = Math.max(w.shield, amt); w.shieldMax = w.shield; w.shieldT = 6; w.shieldEls = els;
      break;
    }
    case 'sigil': {
      S.ents.push({ ...base, k: 'sigil', x: clamp(host ? host.x : spec.cx, 40, W - 40), y: clamp(host ? host.y : spec.cy, 60, H - 60), r: (55 + 45 * power) * (host ? 1.15 : 1), dmg: 20 * power * st.dmg, delay: 1.25 / Math.sqrt(st.speed) });
      break;
    }
    case 'orb': {
      const sp = 230 * st.speed, x = host ? host.x : ownX(spec.cx), y = clamp(host ? host.y : spec.cy, TOP - 50, BOT + 50);
      const a = Math.atan2(S.wiz[1 - p].y - y, S.wiz[1 - p].x - x);
      const dmg = 22 * power * st.dmg;
      S.ents.push({ ...base, k: 'orb', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp, r: 14 + 6 * power, dmg, life: 9 });
      break;
    }
  }
  S.stats[p].casts++;
  if (fused && (!S.stats[p].best || els.length > 1)) S.stats[p].best = ram ? fused + ' Ram' : fused + ' ' + F.name;
  const sh = rune.form === 'shield' ? { x: w.x, y: w.y } : S.ents[S.ents.length - 1];
  S.ev.push({ type: 'cast', p, form: rune.form, els, x: sh.x, y: sh.y, fused, ram, chain: w.chain, power });
  return { ok: true };
}

const mover = e => e.k === 'bolt' || e.k === 'orb';

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
    const w = S.wiz[p], slow = w.chillT > 0;
    w.y = clamp(w.y + w.dir * 270 * (slow ? 0.55 : 1) * dt, TOP, BOT);
    w.hurtT = Math.max(0, w.hurtT - dt); w.castT = Math.max(0, w.castT - dt);
    if (S.phase !== 'fight') continue;
    w.mana = Math.min(MAX_MANA, w.mana + MANA_REGEN * (slow ? 0.5 : 1) * dt);
    w.chillT = Math.max(0, w.chillT - dt);
    if (w.burnT > 0) { w.burnT -= dt; w.hp = Math.max(0, w.hp - 3 * dt); S.stats[1 - p].dmg += 3 * dt; }
    if (w.shieldT > 0) {
      w.shieldT -= dt;
      if (w.shieldEls.includes('life')) w.hp = Math.min(MAX_HP, w.hp + 4 * dt);
      if (w.shieldT <= 0) { w.shield = 0; w.shieldT = 0; }
    }
    for (let i = 0; i < w.cds.length; i++) w.cds[i] = Math.max(0, w.cds[i] - dt);
  }
  if (S.phase === 'count') {
    S.phaseT -= dt;
    if (S.phaseT <= 0) { S.phase = 'fight'; S.ev.push({ type: 'go' }); }
    return;
  }
  S.roundT -= dt;

  // entities
  for (const e of S.ents) {
    if (e.dead) continue;
    e.t += dt;
    const foe = S.wiz[1 - e.o];
    if (e.k === 'bolt') {
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.x < -80 || e.x > W + 80) e.dead = true;
    } else if (e.k === 'orb') {
      const want = Math.atan2(foe.y - e.y, foe.x - e.x), cur = Math.atan2(e.vy, e.vx);
      let d = want - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      const a = cur + clamp(d, -2.2 * dt, 2.2 * dt);
      e.vx = Math.cos(a) * e.sp; e.vy = Math.sin(a) * e.sp;
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.t > e.life) { e.dead = true; S.ev.push({ type: 'fade', x: e.x, y: e.y, els: e.els }); }
    } else if (e.k === 'wall') {
      if (e.els.includes('life')) e.hp = Math.min(e.maxhp, e.hp + 3 * dt);
      if (e.t > e.life) { e.dead = true; S.ev.push({ type: 'fade', x: e.x, y: e.y, els: e.els }); }
    } else if (e.k === 'sigil' && e.t >= e.delay) {
      e.dead = true;
      S.ev.push({ type: 'blast', x: e.x, y: e.y, r: e.r, els: e.els, o: e.o });
      if (hyp(foe.x - e.x, foe.y - e.y) < e.r + WIZ_R * 0.5) hurtWiz(S, 1 - e.o, e.dmg, e.els, foe.x, foe.y);
      for (const o of S.ents) {
        if (o.dead || o.o === e.o) continue;
        if (o.k === 'wall' && segDist(e.x, e.y, o) < e.r) { o.hp -= e.dmg * adv(e.els, o.els); if (o.hp <= 0) breakWall(S, o); }
        else if (mover(o) && hyp(o.x - e.x, o.y - e.y) < e.r) { o.dead = true; S.ev.push({ type: 'clash', x: o.x, y: o.y, els: o.els }); }
      }
    }
    if (mover(e) && !e.dead && hyp(foe.x - e.x, foe.y - e.y) < WIZ_R + e.r) {
      e.dead = true; hurtWiz(S, 1 - e.o, e.dmg, e.els, e.x, e.y);
    }
  }
  // movers against enemy walls and enemy movers
  const ents = S.ents;
  for (const m of ents) {
    if (m.dead || !mover(m)) continue;
    for (const w of ents) {
      if (w.dead || w.k !== 'wall' || w.o === m.o) continue;
      if (segDist(m.x, m.y, w) > m.r + 9) continue;
      const a = adv(m.els, w.els);
      if (elStats(m.els).pierce && !m.ram) {
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
      if (w.hp <= 0) breakWall(S, w);
      if (m.dead) break;
    }
    if (m.dead) continue;
    for (const o of ents) {
      if (o === m || o.dead || !mover(o) || o.o === m.o) continue;
      if (hyp(o.x - m.x, o.y - m.y) > o.r + m.r) continue;
      const am = adv(m.els, o.els), ao = adv(o.els, m.els), a = m.dmg * am, b = o.dmg * ao;
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

function breakWall(S, w) {
  if (w.dead) return;
  w.dead = true;
  S.ev.push({ type: 'wallbreak', x: w.x, y: w.y, els: w.els, ang: w.ang, len: w.len });
}

// compact copy for the network (rounded numbers, no loadouts)
export function snapshot(S, ev) {
  const { loadouts, ...rest } = S;
  return JSON.stringify({ ...rest, ev }, (k, v) => typeof v === 'number' ? Math.round(v * 10) / 10 : v);
}
