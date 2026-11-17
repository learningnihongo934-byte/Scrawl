// $P point-cloud gesture recognizer (Vatavu, Anthony & Wobbrock, 2012), compact version.
// Works for multi-stroke glyphs and ignores stroke order and direction, so players can draw runes their own way.

const N = 32;
export const REJECT = 1.7;  // cloud distance above this = not a rune

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// strokes: [[[x, y], ...], ...] -> 32 normalized points
export function normalize(strokes) {
  let pts = [];
  strokes.forEach((s, id) => s.forEach(p => pts.push({ x: p[0], y: p[1], id })));
  if (pts.length < 2) return null;
  pts = resample(pts, N);
  // uniform scale by the larger side so lines and dots keep their shape
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  let cx = 0, cy = 0;
  pts = pts.map(p => ({ x: (p.x - minX) / size, y: (p.y - minY) / size, id: p.id }));
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  return pts.map(p => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
}

function resample(src, n) {
  const pts = src.map(p => ({ ...p }));
  let len = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].id === pts[i - 1].id) len += dist(pts[i - 1], pts[i]);
  const I = len / (n - 1) || 1;
  let D = 0;
  const out = [{ ...pts[0] }];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].id !== pts[i - 1].id) continue;
    const d = dist(pts[i - 1], pts[i]);
    if (D + d >= I && d > 0) {
      const t = (I - D) / d;
      const q = { x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y), id: pts[i].id };
      out.push(q); pts.splice(i, 0, q); D = 0;
      if (out.length >= n) break;
    } else D += d;
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] });
  return out;
}

function cloudDistance(a, b, start) {
  const matched = new Array(N).fill(false);
  let sum = 0, i = start;
  do {
    let min = Infinity, idx = -1;
    for (let j = 0; j < N; j++) if (!matched[j]) { const d = dist(a[i], b[j]); if (d < min) { min = d; idx = j; } }
    matched[idx] = true;
    sum += (1 - ((i - start + N) % N) / N) * min;
    i = (i + 1) % N;
  } while (i !== start);
  return sum;
}

export function match(a, b) {
  const step = Math.floor(Math.pow(N, 0.5));
  let min = Infinity;
  for (let i = 0; i < N; i += step) min = Math.min(min, cloudDistance(a, b, i), cloudDistance(b, a, i));
  return min;
}

// templates: [{ slot, pts }]; returns { slot, d, q } or null when nothing is close enough
export function recognize(strokes, templates) {
  const pts = normalize(strokes);
  if (!pts || !templates.length) return null;
  let best = null;
  for (const t of templates) { const d = match(pts, t.pts); if (!best || d < best.d) best = { slot: t.slot, d }; }
  if (!best || best.d > REJECT) return best ? { slot: -1, d: best.d, near: best.slot, q: 0 } : null;
  best.q = Math.max(0, Math.min(1, (REJECT - best.d) / 1.1));
  return best;
}

export const templatesFor = runes => runes.flatMap((r, slot) => r.samples.map(s => ({ slot, pts: normalize(s) })).filter(t => t.pts));

// shape facts used to place the spell: bounding box, centre, and the long axis angle (or upright if it is not elongated)
export function shapeOf(strokes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0, mx = 0, my = 0, len = 0;
  for (const s of strokes) for (let i = 0; i < s.length; i++) {
    const [x, y] = s[i];
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    mx += x; my += y; n++;
    if (i) len += Math.hypot(x - s[i - 1][0], y - s[i - 1][1]);
  }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const s of strokes) for (const [x, y] of s) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  const w = maxX - minX, h = maxY - minY;
  const elong = Math.max(w, h) / (Math.min(w, h) + 1);
  const ang = elong > 1.6 ? 0.5 * Math.atan2(2 * sxy, sxx - syy) : Math.PI / 2;
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w, h, ang, len };
}
