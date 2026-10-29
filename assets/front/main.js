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
const POSES = [[0.5, 0.62, 0], [0.22, -0.25, 0], [0.42, -0.35, 0], [0.62, -0.5, 0.04], [0.08, 0.1, 0.12], [0.06, -0.15, 0]];

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
  const amt = k === 0 ? 0.5 : 1;
  const cols = euler([P[0] + sway[1] * 0.12 * amt, P[1] + (Math.sin(t * 0.21 + k) * 0.22 + sway[0] * 0.2) * amt, P[2]]);
  const [bx, by, bz] = s.basis, sc = k === 0 ? 0.72 : 0.92;
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
  light: { clear: "#dcddd6", c: ["#171815", "#e2582a", "#7f9c2c", "#6d6f66", "#5f6f92", "#3f63b0", "#2f8a5c", "#a88a35", "#0b0c0a", "#d9822b", "#9a3412", "#171815"] },
  dark: { clear: "#121310", c: ["#e4e5dd", "#f06a3a", "#c4e36f", "#8c8e85", "#8ea0c7", "#7aa2ff", "#6fd39b", "#e2c46f", "#000000", "#ffb35c", "#fff1d0", "#e4e5dd"] },
};
const darkQ = matchMedia("(prefers-color-scheme: dark)");
for (const p of Object.values(PAL)) { p.rgb = p.c.map(hex); p.bg = hex(p.clear); }
const theme = () => (root.dataset.theme || (darkQ.matches ? "dark" : "light")) === "dark" ? PAL.dark : PAL.light;

// Static fallback: say why in the hero readout, and tell the visitor in a notice (with a way into the 3D version
// when it is only their reduced-motion setting that turned it off).
export function staticReason(text, kind = "gpu") {
  const el = document.getElementById("rd-gpu");
  if (el) { el.dataset.live = "1"; el.textContent = `Static render · ${text}`; }
  const box = document.getElementById("notice");
  if (!box || kind === "off") return;
  box.querySelectorAll("[data-kind]").forEach((n) => (n.hidden = n.dataset.kind !== kind));
  box.hidden = false;
}

/* ---------- backend ---------- */
const failures = [];
async function backend() {
  const force = params.get("gl");
  const host = document.getElementById("stage");
  const fresh = () => { const c = document.createElement("canvas"); c.setAttribute("aria-hidden", "true"); host.replaceChildren(c); return c; };
  // WebGL2 is the default until the WebGPU path is confirmed on real hardware; ?gl=webgpu opts in.
  if (force === "webgpu" && navigator.gpu) {
    try { return await (await import("./webgpu.js")).create(fresh(), cap(coarse ? 65536 : 131072)); }
    catch (e) { console.warn("WebGPU unavailable, trying WebGL2:", e.message); failures.push(`WebGPU: ${e.message}`); }
  }
  if (force !== "webgpu") {
    try { return (await import("./webgl2.js")).create(fresh(), cap(coarse ? 32768 : 65536)); }
    catch (e) { console.warn("WebGL2 unavailable:", e.message); failures.push(`WebGL2: ${e.message}`); }
  }
  host.replaceChildren();
  return null;
}

export async function start() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches && params.get("motion") !== "on") return staticReason("reduced motion is on", "motion");
  if (params.get("gl") === "off") return staticReason("?gl=off", "off");
  const gpu = await backend();
  if (!gpu) return staticReason(failures.join(" · ") || "no WebGL2");
  const N = gpu.N;
  gpu.setTargets(buildTargets(N));
  // Start as a wide cloud around the first station, so the intro condenses into the assembly line.
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
  const tracks = ui.tl ? [...ui.tl.querySelectorAll(".trk[data-layer]")].map((el) => [el, parseFloat(el.style.getPropertyValue("--s"))]) : [];
  const xyzEls = flights.filter(Boolean).map((fl) => fl.querySelector(".fl-xyz"));
  const mapDots = [...document.querySelectorAll("#map [data-st]")];
  // Readouts only touch the DOM when their text changes.
  const shown = new Map();
  const put = (el, text) => { if (el && shown.get(el) !== text) { shown.set(el, text); el.textContent = text; } };
  if (ui.gpu) { ui.gpu.dataset.live = "1"; ui.gpu.textContent = `${gpu.name} · ${N.toLocaleString("en-US")} particles`; }
  cards.forEach((c) => c.querySelectorAll(".unit-body > *").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 8))));
  const onState = cards.map(() => false);

  // Pointer: a ray from the camera that pushes particles aside, fading out when the pointer rests.
  const ptr = { x: 0, y: 0, s: 0, sway: [0, 0] };
  addEventListener("pointermove", (e) => {
    ptr.x = (e.clientX / innerWidth) * 2 - 1; ptr.y = 1 - (e.clientY / innerHeight) * 2; ptr.s = 1;
  }, { passive: true });

  // Layout is measured once per resize (in page coordinates) and offset by scrollY each frame,
  // so the render loop never forces a layout.
  const pageBox = (el) => { let top = 0, n = el; while (n) { top += n.offsetTop; n = n.offsetParent; } return { top, height: el.offsetHeight, left: el.offsetLeft, width: el.offsetWidth }; };
  let L = {};
  const measure = () => { L = { flights: flights.map((f) => f && pageBox(f)), cards: cards.map((c) => { const b = pageBox(c), r = c.getBoundingClientRect(); return { ...b, left: r.left, width: r.width }; }), max: Math.max(1, root.scrollHeight - innerHeight) }; };
  let vw = 0, vh = 0, dpr = 1, lensX = 0, lensY = 0;
  const resize = () => {
    vw = innerWidth; vh = innerHeight; dpr = Math.min(devicePixelRatio || 1, 1.5);
    gpu.resize(Math.round(vw * dpr), Math.round(vh * dpr));
    // On wide screens the cards sit on the left, so the camera's lens shifts the sculpture into the space on the right.
    const r = cards[0].getBoundingClientRect();
    lensX = vw >= 1100 ? ((r.right + vw) / 2 / vw) * 2 - 1 : 0;
    lensY = vw >= 1100 ? 0 : 0.12;
  };
  resize();
  measure();
  addEventListener("resize", () => { resize(); measure(); });
  new ResizeObserver(measure).observe(document.querySelector("main"));

  const U = new Float32Array(UCOUNT * 4);
  const tanH = Math.tan((40 * Math.PI) / 360);
  const t0 = performance.now();
  let last = t0, intro = 0, hidden = false, lastUi = 0;
  document.addEventListener("visibilitychange", () => (hidden = document.hidden));

  function frame(now) {
    requestAnimationFrame(frame);
    if (hidden) return;
    const dt = Math.min(1 / 30, (now - last) / 1000), t = (now - t0) / 1000;
    last = now;
    intro = Math.min(1, intro + dt / 2.4);

    // Scroll: each flight spacer turns into progress from one station to the next.
    const sy = scrollY;
    let P = 0, fk = -1, ff = 0;
    L.flights.forEach((r, k) => {
      if (!r) return;
      const f = clamp01((vh * 0.55 - (r.top - sy)) / (r.height + vh * 0.15));
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
    const nr = L.cards[3];
    const explode = smooth(0, 1, (vh * 0.7 - (nr.top - sy)) / Math.max(nr.height * 0.6, 1));
    const frames = Math.round(explode * 198);
    if (ui.tl && shown.get(ui.tl) !== frames) {
      shown.set(ui.tl, frames);
      ui.tl.style.setProperty("--t", (frames / 198).toFixed(4));
      tracks.forEach(([el, s0]) => el.classList.toggle("on", explode >= s0));
      put(ui.fr, String(frames).padStart(4, "0"));
      put(ui.tc, `00:00:${String(Math.floor(frames / 30)).padStart(2, "0")}:${String(frames % 30).padStart(2, "0")}`);
    }

    const cb = L.cards[active];
    const rc = { left: cb.left, right: cb.left + cb.width, top: cb.top - sy, bottom: cb.top - sy + cb.height };
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
    pal.rgb.forEach((c, k) => U.set([...c, 1], 92 + k * 4));
    gpu.frame(U, pal.bg);

    // Cards: content fades in once the particles have rebuilt its surface, and out as they leave.
    cards.forEach((c, k) => {
      const want = k === active ? (onState[k] ? surf > 0.3 : surf > 0.85) : false;
      if (want !== onState[k]) { onState[k] = want; c.classList.toggle("on", want); }
    });

    // Readouts, ten times a second.
    if (now - lastUi < 100) return;
    lastUi = now;
    put(ui.pct, `STN ${String(active + 1).padStart(2, "0")}/06 · ${String(Math.round((sy / L.max) * 100)).padStart(3, "0")}%`);
    put(ui.sec, fk > 0 ? `${CODES[fk - 1]} → ${CODES[fk]} · ${Math.round(ff * 100)}%` : `ONV · ${STATIONS[active].toUpperCase()}`);
    const xyz = cam.pos.map((v) => (v >= 0 ? "+" : "") + v.toFixed(1)).join(" ");
    put(ui.cam, `CAM ${xyz}`);
    if (fk > 0) put(xyzEls[fk - 1], xyz);
    if (ui.map) {
      const mx = (p) => (66 + p[0] * 2.8).toFixed(1), mz = (p) => (66 + p[2] * 2.8).toFixed(1);
      const tip = add(cam.pos, mul(cam.fwd, 5));
      ui.map.setAttribute("cx", mx(cam.pos)); ui.map.setAttribute("cy", mz(cam.pos));
      ui.cone.setAttribute("x1", mx(cam.pos)); ui.cone.setAttribute("y1", mz(cam.pos));
      ui.cone.setAttribute("x2", mx(tip)); ui.cone.setAttribute("y2", mz(tip));
    }
    if (shown.get(mapDots) !== active) { shown.set(mapDots, active); mapDots.forEach((g) => g.classList.toggle("on", +g.dataset.st === active)); }
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
