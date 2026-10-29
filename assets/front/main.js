// The front: every section is a station in one 3D space. Scrolling through the gap between two sections flies the
// camera from one station to the next on a swirling path, while the particles hand over from one sculpture to the
// other and a share of them rebuilds the next card on screen before its content fades in.
import { buildTargets, STATIONS } from "./shapes.js";
import { UCOUNT } from "./shaders.js";

const root = document.documentElement;
const params = new URLSearchParams(location.search);
const coarse = matchMedia("(pointer: coarse)").matches || innerWidth < 760;
// ?n= caps the particle count (a power of two, at least 1024), for testing on slow GPUs.
const cap = (n) => Math.min(n, 2 ** Math.round(Math.log2(Math.max(1024, +params.get("n") || n))));

const CODES = ["ONV", "SVC", "WRK", "NCL", "ABT", "CTC"];
// Each station's sculpture is posed (pitch, yaw, roll) so its best side faces the camera.
const POSES = [[0.12, -0.3, 0], [0.22, -0.25, 0], [0.42, -0.35, 0], [0.62, -0.5, 0.04], [0.08, 0.1, 0.12], [0.06, -0.15, 0]];

/* ---------- small vector kit ---------- */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const mix = (a, b, t) => add(a, mul(sub(b, a), t));
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => t * t * t * (t * (6 * t - 15) + 10);
// Rotate v around unit axis k by angle a (Rodrigues).
const rot = (v, k, a) => add(add(mul(v, Math.cos(a)), mul(cross(k, v), Math.sin(a))), mul(k, dot(k, v) * (1 - Math.cos(a))));
const euler = ([x, y, z]) => {
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  // columns of Ry * Rx * Rz
  const Rz = [[cz, sz, 0], [-sz, cz, 0], [0, 0, 1]];
  const ap = (c) => { const a = [c[0], c[1] * cx - c[2] * sx, c[1] * sx + c[2] * cx]; return [a[0] * cy + a[2] * sy, a[1], -a[0] * sy + a[2] * cy]; };
  return Rz.map(ap);
};

/* ---------- stations in world space ---------- */
const ST = STATIONS.map((name, k) => {
  const a = k * 1.12;
  const T = [11 * Math.cos(a), -k * 1.9, 11 * Math.sin(a)];
  const dir = norm([Math.cos(a + 0.55), 0.2 + 0.1 * (k % 2), Math.sin(a + 0.55)]);
  const z = dir, x = norm(cross([0, 1, 0], z)), y = cross(z, x);
  return { name, T, dir, basis: [x, y, z] };
});

// Station matrix (column-major): translate(T) * basis * pose(t) * scale.
function stationMatrix(k, t, sway) {
  const s = ST[k], P = POSES[k];
  const cols = euler([P[0] + sway[1] * 0.12, P[1] + Math.sin(t * 0.21 + k) * 0.22 + sway[0] * 0.2, P[2]]);
  const [bx, by, bz] = s.basis, sc = 0.92;
  const m = new Float32Array(16);
  cols.forEach((c, i) => {
    const w = add(add(mul(bx, c[0]), mul(by, c[1])), mul(bz, c[2]));
    m.set([w[0] * sc, w[1] * sc, w[2] * sc, 0], i * 4);
  });
  m.set([s.T[0], s.T[1], s.T[2], 1], 12);
  return m;
}

/* ---------- camera ---------- */
function camera(P, aspect) {
  const i = Math.min(Math.floor(P), ST.length - 1), j = Math.min(i + 1, ST.length - 1);
  const f = i === j ? 0 : P - i, e = ease(f), arc = Math.sin(Math.PI * e);
  const look = mix(ST[i].T, ST[j].T, e);
  let dir = norm(mix(ST[i].dir, ST[j].dir, e));
  // The swirl: swing out around the vertical, rise a little, and bank.
  dir = rot(dir, [0, 1, 0], arc * 0.95 * (i % 2 ? -1 : 1));
  dir = norm(add(dir, [0, arc * 0.35, 0]));
  const fit = aspect < 1 ? 1 / Math.max(0.55, aspect * 1.25) : 1;
  const dist = 7.2 * fit * (1 + 0.6 * arc);
  const pos = add(look, mul(dir, dist));
  const fwd = norm(sub(look, pos));
  const up0 = rot([0, 1, 0], fwd, arc * 0.3 * (i % 2 ? 1 : -1));
  const right = norm(cross(fwd, up0)), up = cross(right, fwd);
  return { pos, fwd, right, up, i, j, f, arc };
}

function viewProj(cam, aspect, tanH, ox, oy) {
  const near = 0.1, far = 200, fy = 1 / tanH, fx = fy / aspect;
  const { right: r, up: u, fwd: f, pos: p } = cam;
  // view matrix rows: right, up, -forward
  const V = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, p), -dot(u, p), dot(f, p), 1];
  const Pm = [fx, 0, 0, 0, 0, fy, 0, 0, -ox, -oy, -(far + near) / (far - near), -1, 0, 0, (-2 * far * near) / (far - near), 0];
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r2 = 0; r2 < 4; r2++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += Pm[k * 4 + r2] * V[c * 4 + k];
    out[c * 4 + r2] = s;
  }
  return out;
}

/* ---------- palette ---------- */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const PAL = {
  light: { clear: "#dcddd6", c: ["#171815", "#e2582a", "#7f9c2c", "#6d6f66", "#5f6f92", "#3f63b0", "#2f8a5c", "#a88a35"] },
  dark: { clear: "#121310", c: ["#e4e5dd", "#f06a3a", "#c4e36f", "#8c8e85", "#8ea0c7", "#7aa2ff", "#6fd39b", "#e2c46f"] },
};
const darkQ = matchMedia("(prefers-color-scheme: dark)");
const theme = () => (root.dataset.theme || (darkQ.matches ? "dark" : "light")) === "dark" ? PAL.dark : PAL.light;

/* ---------- backend ---------- */
async function backend() {
  const force = params.get("gl");
  const host = document.getElementById("stage");
  const fresh = () => { const c = document.createElement("canvas"); c.setAttribute("aria-hidden", "true"); host.replaceChildren(c); return c; };
  if (force !== "webgl2" && navigator.gpu) {
    try { return await (await import("./webgpu.js")).create(fresh(), cap(coarse ? 65536 : 131072)); }
    catch (e) { console.warn("WebGPU unavailable, trying WebGL2:", e.message); }
  }
  if (force !== "webgpu") {
    try { return (await import("./webgl2.js")).create(fresh(), cap(coarse ? 32768 : 65536)); }
    catch (e) { console.warn("WebGL2 unavailable:", e.message); }
  }
  host.replaceChildren();
  return null;
}

export async function start() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || params.get("gl") === "off") return;
  const gpu = await backend();
  if (!gpu) return;
  const N = gpu.N;
  gpu.setTargets(buildTargets(N));
  // Start as a wide cloud around the first station, so the intro condenses into the mark.
  const init = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const z = Math.random() * 2 - 1, a = Math.random() * 6.283, r = 6 + Math.random() * 16, q = Math.sqrt(1 - z * z);
    init.set([ST[0].T[0] + r * q * Math.cos(a), ST[0].T[1] + r * z, ST[0].T[2] + r * q * Math.sin(a), 3], i * 4);
  }
  gpu.setInitial(init);
  root.classList.add("gpu");

  const sections = STATIONS.map((id) => document.getElementById(id));
  const cards = sections.map((s) => s.querySelector(".unit"));
  const flights = sections.map((s) => s.previousElementSibling?.classList.contains("flight") ? s.previousElementSibling : null);
  const $ = (id) => document.getElementById(id);
  const ui = { pct: $("scrollp"), sec: $("secname"), gpu: $("rd-gpu"), cam: $("rd-cam"), map: $("map-cam"), cone: $("map-cone"), tl: $("tl"), tc: $("tc"), fr: $("fr") };
  if (ui.gpu) { ui.gpu.dataset.live = "1"; ui.gpu.textContent = `${gpu.name} · ${N.toLocaleString("en-US")} particles`; }
  cards.forEach((c) => c.querySelectorAll(".unit-body > *").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 8))));
  const onState = cards.map(() => false);

  // Pointer: a ray from the camera that pushes particles aside, fading out when the pointer rests.
  const ptr = { x: 0, y: 0, s: 0, sway: [0, 0] };
  addEventListener("pointermove", (e) => {
    ptr.x = (e.clientX / innerWidth) * 2 - 1; ptr.y = 1 - (e.clientY / innerHeight) * 2; ptr.s = 1;
  }, { passive: true });

  let vw = 0, vh = 0, dpr = 1, lensX = 0, lensY = 0;
  const resize = () => {
    vw = innerWidth; vh = innerHeight; dpr = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 1.75);
    gpu.resize(Math.round(vw * dpr), Math.round(vh * dpr));
    // On wide screens the cards sit on the left, so the camera's lens shifts the sculpture into the space on the right.
    const r = cards[0].getBoundingClientRect();
    lensX = vw >= 1100 ? ((r.right + vw) / 2 / vw) * 2 - 1 : 0;
    lensY = vw >= 1100 ? 0 : 0.12;
  };
  resize();
  addEventListener("resize", resize);

  const U = new Float32Array(UCOUNT * 4);
  const tanH = Math.tan((40 * Math.PI) / 360);
  const t0 = performance.now();
  let last = t0, intro = 0, hidden = false;
  document.addEventListener("visibilitychange", () => (hidden = document.hidden));

  function frame(now) {
    requestAnimationFrame(frame);
    if (hidden) return;
    const dt = Math.min(1 / 30, (now - last) / 1000), t = (now - t0) / 1000;
    last = now;
    intro = Math.min(1, intro + dt / 2.4);

    // Scroll: each flight spacer turns into progress from one station to the next.
    let P = 0, fk = -1, ff = 0;
    flights.forEach((fl, k) => {
      if (!fl) return;
      const r = fl.getBoundingClientRect();
      const f = clamp01((vh * 0.55 - r.top) / (r.height + vh * 0.15));
      P += f;
      if (f > 0 && f < 1) { fk = k; ff = f; }
    });
    let active = Math.round(P), surf = 1;
    if (fk > 0) {
      if (ff < 0.45) { active = fk - 1; surf = 1 - smooth(0, 0.35, ff); }
      else { active = fk; surf = smooth(0.55, 0.92, ff); }
    }
    if (active === 0) surf *= smooth(0.45, 0.95, intro);

    const aspect = vw / vh;
    const cam = camera(P, aspect);
    const flight = fk > 0 ? Math.sin(Math.PI * ff) : 0;
    ptr.s = Math.max(0, ptr.s - dt / 1.2);
    ptr.sway[0] += (ptr.x - ptr.sway[0]) * Math.min(1, dt * 2);
    ptr.sway[1] += (ptr.y - ptr.sway[1]) * Math.min(1, dt * 2);

    // Nullcolor: the stack lifts apart as its card scrolls through, and the timeline playhead follows.
    const nr = cards[3].getBoundingClientRect();
    const explode = smooth(0, 1, (vh * 0.7 - nr.top) / Math.max(nr.height * 0.6, 1));
    if (ui.tl) {
      ui.tl.style.setProperty("--t", explode.toFixed(4));
      ui.tl.querySelectorAll(".trk[data-layer]").forEach((tr) => tr.classList.toggle("on", explode >= parseFloat(tr.style.getPropertyValue("--s"))));
      const frames = Math.round(explode * 198);
      ui.fr.textContent = String(frames).padStart(4, "0");
      ui.tc.textContent = `00:00:${String(Math.floor(frames / 30)).padStart(2, "0")}:${String(frames % 30).padStart(2, "0")}`;
    }

    const rc = cards[active].getBoundingClientRect();
    const rayD = norm(add(cam.fwd, add(mul(cam.right, (ptr.x - lensX) * tanH * aspect), mul(cam.up, (ptr.y - lensY) * tanH))));
    const VP = viewProj(cam, aspect, tanH, lensX, lensY);
    const pal = theme();

    U.set([t, dt, N, gpu.texW], 0);
    U.set([vw, vh, dpr, coarse ? 1.9 : 1.6], 4);
    U.set([...cam.pos, tanH], 8);
    U.set([...cam.right, aspect], 12);
    U.set([...cam.up, lensX], 16);
    U.set([...cam.fwd, lensY], 20);
    U.set([cam.i, cam.j, cam.f, flight], 24);
    U.set([surf, explode, intro, 4.2], 28);
    U.set([(rc.left / vw) * 2 - 1, 1 - (rc.bottom / vh) * 2, (rc.right / vw) * 2 - 1, 1 - (rc.top / vh) * 2], 32);
    U.set([...cam.pos, ptr.s], 36);
    U.set([...rayD, 0], 40);
    U.set(VP, 44);
    U.set(stationMatrix(cam.i, t, ptr.sway), 60);
    U.set(stationMatrix(cam.j, t, ptr.sway), 76);
    pal.c.forEach((h, k) => U.set([...hex(h), 1], 92 + k * 4));
    gpu.frame(U, hex(pal.clear));

    // Cards: content fades in once the particles have rebuilt its surface, and out as they leave.
    cards.forEach((c, k) => {
      const want = k === active ? (onState[k] ? surf > 0.3 : surf > 0.85) : false;
      if (want !== onState[k]) { onState[k] = want; c.classList.toggle("on", want); }
    });

    // Readouts
    const doc = document.documentElement, max = Math.max(1, doc.scrollHeight - vh);
    if (ui.pct) ui.pct.textContent = `STN ${String(active + 1).padStart(2, "0")}/06 · ${String(Math.round((scrollY / max) * 100)).padStart(3, "0")}%`;
    if (ui.sec) ui.sec.textContent = fk > 0 ? `${CODES[fk - 1]} → ${CODES[fk]} · ${Math.round(ff * 100)}%` : `ONV · ${STATIONS[active].toUpperCase()}`;
    const xyz = cam.pos.map((v) => (v >= 0 ? "+" : "") + v.toFixed(1)).join(" ");
    if (ui.cam) ui.cam.textContent = `CAM ${xyz}`;
    flights.forEach((fl, k) => { if (fl) fl.querySelector(".fl-xyz").textContent = xyz; });
    if (ui.map) {
      const mx = (p) => 66 + p[0] * 2.8, mz = (p) => 66 + p[2] * 2.8;
      ui.map.setAttribute("cx", mx(cam.pos).toFixed(1)); ui.map.setAttribute("cy", mz(cam.pos).toFixed(1));
      const tip = add(cam.pos, mul(cam.fwd, 5));
      ui.cone.setAttribute("x1", mx(cam.pos).toFixed(1)); ui.cone.setAttribute("y1", mz(cam.pos).toFixed(1));
      ui.cone.setAttribute("x2", mx(tip).toFixed(1)); ui.cone.setAttribute("y2", mz(tip).toFixed(1));
    }
    document.querySelectorAll("#map [data-st]").forEach((g) => g.classList.toggle("on", +g.dataset.st === active));
  }
  requestAnimationFrame(frame);
}

// Station map: the six stations seen from above, each a link to its section.
export function drawMap() {
  const svg = document.getElementById("map");
  if (!svg) return;
  const mx = (p) => (66 + p[0] * 2.8).toFixed(1), mz = (p) => (66 + p[2] * 2.8).toFixed(1);
  const path = ST.map((s, k) => `${k ? "L" : "M"}${mx(s.T)} ${mz(s.T)}`).join("");
  svg.innerHTML = `<path d="${path}" class="m-path"/>` + ST.map((s, k) =>
    `<a href="#${s.name}" data-st="${k}" aria-label="${s.name}"><circle cx="${mx(s.T)}" cy="${mz(s.T)}" r="3.2"/><text x="${mx(s.T)}" y="${(+mz(s.T) - 7).toFixed(1)}">${CODES[k]}</text></a>`).join("") +
    `<line id="map-cone" class="m-cone"/><circle id="map-cam" class="m-cam" r="2.6"/>`;
}
