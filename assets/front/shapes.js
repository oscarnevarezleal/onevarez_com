// Station sculptures: one particle target per particle per station, in station-local space (about ±2.4 units).
// Each target is [x, y, z, w]. w packs the colour and, for the Nullcolor plates, the layer: w = palette + 8 * (layer + 1). A negative w marks
// world-space dust (palette = -w - 1), which stays put across stations and gives the flights depth.
// Palette: 0 ink, 1 signal, 2 lime, 3 muted, 4 slate, 5 blue, 6 green, 7 sand.

export const STATIONS = ["hero", "services", "work", "nullcolor", "about", "contact"];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick a component by weight. Components are [weight, fn(r) => [x, y, z, w]].
function mixer(parts) {
  const total = parts.reduce((s, p) => s + p[0], 0);
  let acc = 0;
  const cdf = parts.map((p) => (acc += p[0] / total));
  return (r) => {
    const u = r();
    for (let i = 0; i < cdf.length; i++) if (u <= cdf[i]) return parts[i][1](r);
    return parts[parts.length - 1][1](r);
  };
}

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const jit = (r, s) => (r() - 0.5) * 2 * s;
// A point on a segment with a little thickness.
const seg = (r, a, b, s = 0.012) => { const p = lerp3(a, b, r()); return [p[0] + jit(r, s), p[1] + jit(r, s), p[2] + jit(r, s)]; };
// A point on a ring in the plane spanned by u and v.
const ring = (r, c, rad, u = [1, 0, 0], v = [0, 1, 0], s = 0.01) => {
  const a = r() * Math.PI * 2, ca = Math.cos(a) * rad, sa = Math.sin(a) * rad;
  return [c[0] + u[0] * ca + v[0] * sa + jit(r, s), c[1] + u[1] * ca + v[1] * sa + jit(r, s), c[2] + u[2] * ca + v[2] * sa + jit(r, s)];
};
const sphere = (r, c, rad) => {
  const z = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - z * z);
  return [c[0] + rad * q * Math.cos(a), c[1] + rad * z, c[2] + rad * q * Math.sin(a)];
};
const bez = (a, b, c, d, t) => {
  const s = 1 - t;
  return [0, 1, 2].map((k) => s * s * s * a[k] + 3 * s * s * t * b[k] + 3 * s * t * t * c[k] + t * t * t * d[k]);
};
const W = (p, pal, level = 0) => [p[0], p[1], p[2], pal + 8 * level];

// 0 · Hero: the ONE VAREZ mark (a square with its diagonals) inside two orbit rings and a dot grid.
function hero() {
  const h = 1.2, t = 0.07, d = 0.13;
  const C = [[-h, -h], [h, -h], [h, h], [-h, h]];
  const bars = [[C[0], C[1]], [C[1], C[2]], [C[2], C[3]], [C[3], C[0]], [C[0], C[2]], [C[1], C[3]]];
  const lens = bars.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  const bar = (r) => {
    let u = r() * lens.reduce((s, l) => s + l, 0), k = 0;
    while (u > lens[k] && k < 5) u -= lens[k++];
    const [a, b] = bars[k], f = u / lens[k];
    const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
    return W([x + jit(r, t * (k > 3 ? 0.7 : 1)), y + jit(r, t * (k > 3 ? 0.7 : 1)), jit(r, d)], 0);
  };
  const tilt = 1.15, u = [1, 0, 0], v = [0, Math.cos(tilt), Math.sin(tilt)];
  const u2 = [Math.cos(0.9), 0, -Math.sin(0.9)], v2 = [0, 1, 0];
  return mixer([
    [0.5, bar],
    [0.2, (r) => W(ring(r, [0, 0, 0], 2.05, u, v, 0.012), 1)],
    [0.09, (r) => W(ring(r, [0, 0, 0], 1.85, u2, v2, 0.008), 3)],
    [0.06, (r) => { const i = Math.floor(r() * 18), x = -1.2 + (i % 6) * 0.13, y = 1.5 + Math.floor(i / 6) * 0.13; return W([x + jit(r, 0.018), y + jit(r, 0.018), 0], 1); }],
    [0.06, (r) => { const s = r() < 0.5, k = jit(r, 2.6); return W(s ? [k, 0, jit(r, 0.01)] : [0, k, jit(r, 0.01)], 3); }],
    [0.09, (r) => W(sphere(r, [0, 0, 0], 2.9 + r() * 0.2), 3)],
  ]);
}

// 1 · Services: documents in, a model router in the middle, a platform rack out.
function services() {
  const sheets = [0, 1, 2, 3].map((j) => ({ x: -1.95 + j * 0.13, y: 0.15 - j * 0.1, z: -j * 0.28, a: -0.35 + j * 0.05 }));
  const sheet = (r) => {
    const s = sheets[Math.floor(r() * 4)], w = 0.42, hh = 0.58;
    let x, y, pal = 0;
    const m = r();
    if (m < 0.32) { // outline
      const e = r() * 4, f = r() * 2 - 1;
      [x, y] = e < 1 ? [f * w, hh] : e < 2 ? [f * w, -hh] : e < 3 ? [w, f * hh] : [-w, f * hh];
    } else { // text lines, the first one in signal
      const line = Math.floor(r() * 9), len = line === 0 ? 0.5 : 0.55 + ((line * 37) % 10) / 25;
      x = -w + 0.08 + r() * (2 * w - 0.16) * len; y = hh - 0.16 - line * 0.11;
      pal = line === 0 ? 1 : 3;
    }
    const ca = Math.cos(s.a), sa = Math.sin(s.a);
    return W([s.x + x * ca + jit(r, 0.006), s.y + y, s.z + x * sa + jit(r, 0.006)], pal);
  };
  const router = [0, 0.05, 0];
  const outs = [[1.7, 0.75, 0], [1.7, 0.05, 0], [1.7, -0.65, 0]];
  const link = (r) => {
    if (r() < 0.45) { const s = sheets[Math.floor(r() * 4)]; const a = [s.x + 0.4, s.y, s.z]; return W(seg(r, a, router, 0.006), 3); }
    const o = outs[Math.floor(r() * 3)], t = r();
    return W(bez(router, [0.8, router[1], 0], [0.9, o[1], 0], [o[0] - 0.45, o[1], 0], t).map((c) => c + jit(r, 0.006)), 0);
  };
  const rack = (r) => {
    const o = outs[Math.floor(r() * 3)], bw = 0.45, bh = 0.1, bd = 0.3;
    if (r() < 0.16) return W([o[0] - bw + 0.12 + Math.floor(r() * 4) * 0.08, o[1], bd + 0.01], 2);
    const e = Math.floor(r() * 12), f = r() * 2 - 1;
    const X = [-1, 1], edges = [];
    for (const a of X) for (const b of X) { edges.push([f * bw, a * bh, b * bd]); edges.push([a * bw, f * bh, b * bd]); edges.push([a * bw, b * bh, f * bd]); }
    const p = edges[e];
    return W([o[0] + p[0], o[1] + p[1], p[2]], 0);
  };
  return mixer([
    [0.32, sheet],
    [0.16, (r) => W(sphere(r, router, 0.48), 1)],
    [0.05, (r) => W(sphere(r, router, 0.12 + r() * 0.1), 0)],
    [0.17, link],
    [0.25, rack],
    [0.05, (r) => W(sphere(r, [0, 0, 0], 2.9 + r() * 0.2), 3)],
  ]);
}

// 2 · Work: freight routes arcing over a terrain grid, and a capsule for the pharmacy.
function work() {
  const n = (x, z) => 0.16 * Math.sin(x * 1.7 + 0.5) * Math.cos(z * 2.1) + 0.06 * Math.sin(x * 4.3 + z * 3.1);
  const ground = (x, z) => -0.9 + n(x, z);
  const R = rng(7);
  const nodes = Array.from({ length: 8 }, () => { const x = -2.1 + R() * 4.2, z = -1.3 + R() * 2.6; return [x, ground(x, z), z]; });
  const pairs = Array.from({ length: 13 }, (_, i) => [i % 8, (i * 3 + 1 + Math.floor(R() * 5)) % 8]).filter(([a, b]) => a !== b);
  const terrain = (r) => {
    const i = Math.floor(r() * 64), j = Math.floor(r() * 40), x = -2.4 + i * (4.8 / 63), z = -1.5 + j * (3 / 39);
    return W([x, ground(x, z), z], 3);
  };
  const arc = (r) => {
    const [a, b] = pairs[Math.floor(r() * pairs.length)].map((k) => nodes[k]);
    const t = r(), p = lerp3(a, b, t), d = Math.hypot(b[0] - a[0], b[2] - a[2]);
    return W([p[0] + jit(r, 0.008), p[1] + Math.sin(Math.PI * t) * d * 0.45, p[2] + jit(r, 0.008)], 1);
  };
  const pillar = (r) => {
    const k = Math.floor(r() * 8), nd = nodes[k], hgt = 0.25 + (k % 4) * 0.15;
    if (r() < 0.3) return W(ring(r, [nd[0], nd[1] + 0.002, nd[2]], 0.09, [1, 0, 0], [0, 0, 1], 0.004), 1);
    return W([nd[0] + jit(r, 0.008), nd[1] + r() * hgt, nd[2] + jit(r, 0.008)], 0);
  };
  const cap = [1.45, 0.95, -0.2], ax = [Math.cos(0.65), Math.sin(0.65), 0], len = 0.42, rad = 0.3;
  const capsule = (r) => {
    // a capsule along ax: cylinder plus two half spheres, one half ink and one half signal
    const a = r() * Math.PI * 2, side = r() < 0.5 ? -1 : 1;
    let along, radial;
    if (r() < 0.6) { along = side * r() * len; radial = rad; }
    else { const z = r(); along = side * (len + rad * z); radial = rad * Math.sqrt(1 - z * z); }
    const n1 = [-ax[1], ax[0], 0], n2 = [0, 0, 1];
    const p = [0, 1, 2].map((k) => cap[k] + ax[k] * along + (n1[k] * Math.cos(a) + n2[k] * Math.sin(a)) * radial);
    return W(p, side < 0 ? 0 : 1);
  };
  return mixer([[0.38, terrain], [0.28, arc], [0.1, pillar], [0.19, capsule], [0.05, (r) => W(sphere(r, [0, 0, 0], 2.9 + r() * 0.2), 3)]]);
}

// 3 · Nullcolor: the six plates Kineto composites into one frame. The layer drives the lift on scroll.
function nullcolor() {
  const PW = 1.6, PD = 1.0, pad = 0.14;
  const fillRect = (r, cx, cz, w, d) => [cx + jit(r, w), 0, cz + jit(r, d)];
  const outline = (r, cx, cz, w, d) => {
    const e = r() * 2 * (w + d), f = r() * 2 - 1;
    return e < w ? [cx + f * w, 0, cz - d] : e < 2 * w ? [cx + f * w, 0, cz + d] : e < 2 * w + d ? [cx - w, 0, cz + f * d] : [cx + w, 0, cz + f * d];
  };
  const disc = (r, cx, cz, rad) => { const a = r() * Math.PI * 2, q = Math.sqrt(r()) * rad; return [cx + Math.cos(a) * q, 0, cz + Math.sin(a) * q]; };
  const ww = PW - pad * 2, wd = PD - pad * 2;
  const plate = (L, pal, fn) => (r) => { const p = fn(r); return [p[0], p[1] + L * 0.05 + jit(r, 0.006), p[2], pal + 8 * (L + 1)]; };
  return mixer([
    [0.24, plate(0, 2, (r) => (r() < 0.25 ? outline(r, 0, 0, PW, PD) : fillRect(r, 0, 0, PW, PD)))],
    [0.14, plate(1, 4, (r) => fillRect(r, 0.08, 0.1, ww, wd))],
    [0.24, plate(2, 5, (r) => {
      const m = r();
      if (m < 0.45) return outline(r, 0, 0, ww, wd);
      if (m < 0.6) return [jit(r, ww), 0, -wd + 0.16];
      if (m < 0.7) return disc(r, -ww + 0.12 + Math.floor(r() * 3) * 0.1, -wd + 0.08, 0.03);
      return fillRect(r, 0, 0.08, ww * 0.92, wd * 0.82);
    })],
    [0.08, plate(3, 1, (r) => (r() < 0.6 ? ring(r, [0.35, 0, 0.1], 0.17, [1, 0, 0], [0, 0, 1], 0.006) : disc(r, 0.35, 0.1, 0.05)))],
    [0.13, plate(4, 6, (r) => (r() < 0.4 ? ring(r, [ww - 0.32, 0, wd - 0.3], 0.26, [1, 0, 0], [0, 0, 1], 0.006) : disc(r, ww - 0.32, wd - 0.3, 0.25)))],
    [0.17, plate(5, 1, (r) => {
      // corner brackets of the auto-zoom frame
      const bw = ww * 0.62, bd = wd * 0.62, arm = 0.28, sx = r() < 0.5 ? -1 : 1, sz = r() < 0.5 ? -1 : 1;
      return r() < 0.5 ? [sx * (bw - r() * arm), 0, sz * bd] : [sx * bw, 0, sz * (bd - r() * arm)];
    })],
  ]);
}

// 4 · About: twenty-plus rings, one per year, wound along an axis. The newest ring is in signal.
function about() {
  const N = 21;
  const yearRing = (r) => {
    const j = Math.floor(r() * N), t = j / (N - 1), y = -1.75 + t * 3.5, rad = 0.45 + 0.75 * Math.sin(Math.PI * (0.15 + 0.7 * t));
    const tw = t * 2.2, u = [Math.cos(tw), 0, Math.sin(tw)], v = [-Math.sin(tw) * 0.25, 0.3, Math.cos(tw)];
    const vn = Math.hypot(...v);
    return W(ring(r, [0, y, 0], rad, u, v.map((c) => c / vn), 0.008), j === N - 1 ? 1 : j % 5 === 0 ? 0 : 3);
  };
  const helix = (r) => { const t = r(), a = t * Math.PI * 9; return W([Math.cos(a) * 1.45, -1.9 + t * 3.8, Math.sin(a) * 1.45].map((c) => c + jit(r, 0.008)), 2); };
  return mixer([[0.74, yearRing], [0.08, (r) => W([jit(r, 0.01), jit(r, 2.1), jit(r, 0.01)], 0)], [0.12, helix], [0.06, (r) => W(sphere(r, [0, 0, 0], 2.9 + r() * 0.2), 3)]]);
}

// 5 · Contact: the Code 39 barcode for *ONEVAREZ* wrapped on a shallow cylinder, inside a crosshair.
function contact() {
  const C39 = { "*": "nwnnwnwnn", O: "wnnnwnnwn", N: "nnnnwnnww", E: "wnnnwwnnn", V: "nwwnnnnnw", A: "wnnnnwnnw", R: "wnnnnnwwn", Z: "nwwnwnnnn" };
  const units = [];
  for (const ch of "*ONEVAREZ*") { [...C39[ch]].forEach((w, i) => units.push([i % 2 === 0, w === "w" ? 3 : 1])); units.push([false, 1]); }
  const total = units.reduce((s, [, w]) => s + w, 0), k = 4.4 / total, bars = [];
  let x = -2.2;
  for (const [bar, w] of units) { if (bar) bars.push([x, w * k]); x += w * k; }
  const area = bars.reduce((s, b) => s + b[1], 0), cdf = [];
  let acc = 0;
  for (const b of bars) cdf.push((acc += b[1] / area));
  const Rc = 4.2;
  const bar = (r) => {
    const u = r();
    let i = 0;
    while (cdf[i] < u) i++;
    const [x0, w] = bars[i], bx = x0 + r() * w, y = -0.95 + r() * 1.9, a = bx / Rc;
    return W([Math.sin(a) * Rc, y, Math.cos(a) * Rc - Rc + jit(r, 0.03)], 0);
  };
  const chev = (r) => { const s = r() < 0.5 ? -1 : 1, t = r(); return W([s * (2.55 + 0.3 * (1 - Math.abs(t * 2 - 1))), (t * 2 - 1) * 0.5, -0.5], 1); };
  return mixer([
    [0.66, bar],
    [0.14, (r) => W(ring(r, [0, 0, -0.3], 2.7, [1, 0, 0], [0, 1, 0], 0.01), 1)],
    [0.06, (r) => { const s = r() < 0.5; const k2 = (r() < 0.5 ? -1 : 1) * (2.5 + r() * 0.5); return W(s ? [k2, 0, -0.3] : [0, k2, -0.3], 0); }],
    [0.06, chev],
    [0.08, (r) => W(sphere(r, [0, 0, 0], 3.1 + r() * 0.2), 3)],
  ]);
}

// All stations into one Float32Array: station s, particle i at (s * N + i) * 4.
export function buildTargets(N) {
  const out = new Float32Array(N * 4 * STATIONS.length);
  const makers = [hero, services, work, nullcolor, about, contact];
  const dustR = rng(99);
  const dust = new Float32Array(N * 4);
  const isDust = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = dustR();
    if (r < 0.05) {
      isDust[i] = 1;
      const p = sphere(dustR, [0, -4, 0], 14 + dustR() * 26);
      dust.set([p[0], p[1], p[2], -(dustR() < 0.12 ? 1 : 3) - 1], i * 4);
    }
  }
  makers.forEach((make, s) => {
    const r = rng(1000 + s), sample = make();
    for (let i = 0; i < N; i++) {
      const o = (s * N + i) * 4;
      if (isDust[i]) out.set(dust.subarray(i * 4, i * 4 + 4), o);
      else out.set(sample(r), o);
    }
  });
  return out;
}
