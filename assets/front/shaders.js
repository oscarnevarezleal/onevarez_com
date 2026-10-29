// The particle step and draw, in GLSL ES 3.0 and in WGSL. Both read the same uniform block, an array of 31 vec4:
//  0 time, dt, N, texW        1 resX, resY, dpr, pointSize   2 camPos, tanHalfFov   3 right, aspect
//  4 up, lensX               5 forward, lensY              6 cur, next, f, flight  7 surf, explode, intro, surfDepth
//  8 card rect in NDC (x0, y0, x1, y1)                     9 ray origin, strength  10 ray dir, unused
// 11-14 view-projection      15-18 current station matrix  19-22 next station matrix  23-30 palette
// A particle eases toward its goal on the current or next station (handing over as f passes its own threshold),
// rides a divergence-free flow field that swells during a flight, and every fourth particle can leave its sculpture
// to rebuild the active card: its outline and a dot grid behind the text, placed by unprojecting the card's screen rect.

export const UCOUNT = 31;

export const GLSL_SIM = `#version 300 es
precision highp float; precision highp int;
uniform vec4 U[31];
uniform highp sampler2D uPos, uVel, uTgt;
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oVel;
uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float hf(uint v) { return float(pcg(v)) / 4294967295.0; }
vec3 flow(vec3 q, float t) {
  vec3 p = q * 0.6;
  return vec3(sin(p.y * 1.7 + t * 0.6) + 0.5 * sin(p.z * 2.9 - t * 0.4),
              sin(p.z * 1.9 + t * 0.5) + 0.5 * sin(p.x * 3.1 + t * 0.3),
              sin(p.x * 1.6 - t * 0.7) + 0.5 * sin(p.y * 2.7 + t * 0.5));
}
vec3 xf(int c, vec3 l) { return U[c].xyz * l.x + U[c + 1].xyz * l.y + U[c + 2].xyz * l.z + U[c + 3].xyz; }
void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  int W = int(U[0].w);
  uint N = uint(U[0].z);
  uint i = uint(px.y * W + px.x);
  vec4 p = texelFetch(uPos, px, 0), v = texelFetch(uVel, px, 0);
  float t = U[0].x, dt = U[0].y;
  float h1 = hf(i), h2 = hf(i ^ 0x9E3779B9u);
  bool useNext = U[6].z > 0.12 + 0.76 * h1;
  uint ti = uint(useNext ? U[6].y : U[6].x) * N + i;
  vec4 tg = texelFetch(uTgt, ivec2(int(ti % uint(W)), int(ti / uint(W))), 0);
  vec3 goal; float pal; float flag = 0.0;
  float K = mix(16.0, 3.5, U[6].w);
  if (tg.w < 0.0) { goal = tg.xyz; pal = -tg.w - 1.0; }
  else {
    float lv = floor(tg.w / 8.0); pal = tg.w - lv * 8.0;
    vec3 l = tg.xyz; if (lv > 0.0) { l.y += (lv - 3.5) * U[7].y * 0.5; }
    goal = xf(useNext ? 19 : 15, l);
    if ((i & 3u) == 0u && U[7].x > 0.05 + 0.9 * h2) {
      uint j = i >> 2u, M = N >> 2u, Mp = M * 3u / 10u;
      vec4 R = U[8];
      float pw = max((R.z - R.x) * 0.5 * U[1].x, 1.0), ph = max((R.w - R.y) * 0.5 * U[1].y, 1.0);
      vec2 nd;
      if (j < Mp) {
        float per = 2.0 * (pw + ph), u = float(j) / float(Mp) * per;
        vec2 a = u < pw ? vec2(u, 0.0) : u < pw + ph ? vec2(pw, u - pw) : u < 2.0 * pw + ph ? vec2(2.0 * pw + ph - u, ph) : vec2(0.0, per - u);
        nd = vec2(R.x + a.x / pw * (R.z - R.x), R.y + a.y / ph * (R.w - R.y));
        flag = 1.0; pal = 0.0;
      } else {
        float gx = max(1.0, floor(pw / 22.0)), gy = max(1.0, floor(ph / 22.0));
        float k = mod(float(j - Mp), gx * gy), ix = mod(k, gx), iy = floor(k / gx);
        nd = vec2(R.x + (ix + 0.5) / gx * (R.z - R.x), R.y + (iy + 0.5) / gy * (R.w - R.y));
        flag = 2.0; pal = 3.0;
      }
      float d = U[7].w;
      goal = U[2].xyz + d * (U[5].xyz + U[3].xyz * ((nd.x - U[4].w) * U[2].w * U[3].w) + U[4].xyz * ((nd.y - U[5].w) * U[2].w));
      K = 70.0;
    }
  }
  K *= smoothstep(h1 * 0.5, h1 * 0.5 + 0.5, U[7].z);
  vec3 acc = (goal - p.xyz) * K - v.xyz * (1.7 * sqrt(max(K, 1.0)));
  acc += flow(p.xyz, t * 0.5) * (0.35 + 4.0 * U[6].w + (1.0 - U[7].z) * 3.0) * (flag > 0.0 ? 0.1 : 1.0);
  vec3 ro = U[9].xyz, rd = U[10].xyz;
  vec3 dv = p.xyz - (ro + rd * max(0.0, dot(p.xyz - ro, rd)));
  float dl = length(dv);
  if (U[9].w > 0.0 && dl < 0.8 && flag == 0.0) acc += dv / max(dl, 1e-3) * (1.0 - dl / 0.8) * 45.0 * U[9].w;
  v.xyz += acc * dt;
  float sp = length(v.xyz);
  if (sp > 30.0) v.xyz *= 30.0 / sp;
  p.xyz += v.xyz * dt;
  oPos = vec4(p.xyz, pal + 8.0 * flag);
  oVel = vec4(v.xyz, 0.0);
}`;

export const GLSL_QUAD = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

export const GLSL_DRAW_VS = `#version 300 es
precision highp float; precision highp int;
uniform vec4 U[31];
uniform highp sampler2D uPos;
out vec4 vC;
void main() {
  int W = int(U[0].w);
  vec4 p = texelFetch(uPos, ivec2(gl_VertexID % W, gl_VertexID / W), 0);
  vec4 c = mat4(U[11], U[12], U[13], U[14]) * vec4(p.xyz, 1.0);
  gl_Position = c;
  float flag = floor(p.w / 8.0), pal = p.w - flag * 8.0;
  float base = U[1].w * U[1].z;
  float sz = base * clamp(7.0 / max(c.w, 0.1), 0.55, 2.6), a = 0.85;
  if (flag == 2.0) { a = 0.42; sz = base * 1.15; }
  if (flag == 1.0) { sz = base * 1.2; }
  gl_PointSize = sz;
  vC = vec4(U[23 + int(pal + 0.5)].rgb, a);
}`;

export const GLSL_DRAW_FS = `#version 300 es
precision mediump float;
in vec4 vC;
out vec4 o;
void main() {
  float a = vC.a * (1.0 - smoothstep(0.3, 0.5, length(gl_PointCoord - 0.5)));
  if (a < 0.01) discard;
  o = vec4(vC.rgb * a, a);
}`;

const WGSL_HEAD = /* wgsl */ `
struct P { pos: vec4f, vel: vec4f };
@group(0) @binding(0) var<uniform> U: array<vec4f, 31>;
`;

export const WGSL_SIM = WGSL_HEAD + /* wgsl */ `
@group(0) @binding(1) var<storage, read_write> parts: array<P>;
@group(0) @binding(2) var<storage, read> tgts: array<vec4f>;

fn pcg(v: u32) -> u32 { let s = v * 747796405u + 2891336453u; let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
fn hf(v: u32) -> f32 { return f32(pcg(v)) / 4294967295.0; }
fn flow(q: vec3f, t: f32) -> vec3f {
  let p = q * 0.6;
  return vec3f(sin(p.y * 1.7 + t * 0.6) + 0.5 * sin(p.z * 2.9 - t * 0.4),
               sin(p.z * 1.9 + t * 0.5) + 0.5 * sin(p.x * 3.1 + t * 0.3),
               sin(p.x * 1.6 - t * 0.7) + 0.5 * sin(p.y * 2.7 + t * 0.5));
}
fn xf(c: u32, l: vec3f) -> vec3f { return U[c].xyz * l.x + U[c + 1u].xyz * l.y + U[c + 2u].xyz * l.z + U[c + 3u].xyz; }

@compute @workgroup_size(256)
fn sim(@builtin(global_invocation_id) gid: vec3u) {
  let N = u32(U[0].z);
  let i = gid.x;
  if (i >= N) { return; }
  var p = parts[i].pos;
  var v = parts[i].vel;
  let t = U[0].x; let dt = U[0].y;
  let h1 = hf(i); let h2 = hf(i ^ 0x9E3779B9u);
  let useNext = U[6].z > 0.12 + 0.76 * h1;
  let tg = tgts[u32(select(U[6].x, U[6].y, useNext)) * N + i];
  var goal: vec3f; var pal: f32; var flag = 0.0;
  var K = mix(16.0, 3.5, U[6].w);
  if (tg.w < 0.0) { goal = tg.xyz; pal = -tg.w - 1.0; }
  else {
    let lv = floor(tg.w / 8.0); pal = tg.w - lv * 8.0;
    var l = tg.xyz; if (lv > 0.0) { l.y += (lv - 3.5) * U[7].y * 0.5; }
    goal = xf(select(15u, 19u, useNext), l);
    if ((i & 3u) == 0u && U[7].x > 0.05 + 0.9 * h2) {
      let j = i >> 2u; let M = N >> 2u; let Mp = M * 3u / 10u;
      let R = U[8];
      let pw = max((R.z - R.x) * 0.5 * U[1].x, 1.0); let ph = max((R.w - R.y) * 0.5 * U[1].y, 1.0);
      var nd: vec2f;
      if (j < Mp) {
        let per = 2.0 * (pw + ph); let u = f32(j) / f32(Mp) * per;
        var a: vec2f;
        if (u < pw) { a = vec2f(u, 0.0); } else if (u < pw + ph) { a = vec2f(pw, u - pw); }
        else if (u < 2.0 * pw + ph) { a = vec2f(2.0 * pw + ph - u, ph); } else { a = vec2f(0.0, per - u); }
        nd = vec2f(R.x + a.x / pw * (R.z - R.x), R.y + a.y / ph * (R.w - R.y));
        flag = 1.0; pal = 0.0;
      } else {
        let gx = max(1.0, floor(pw / 22.0)); let gy = max(1.0, floor(ph / 22.0));
        let k = f32(j - Mp) % (gx * gy); let ix = k % gx; let iy = floor(k / gx);
        nd = vec2f(R.x + (ix + 0.5) / gx * (R.z - R.x), R.y + (iy + 0.5) / gy * (R.w - R.y));
        flag = 2.0; pal = 3.0;
      }
      let d = U[7].w;
      goal = U[2].xyz + d * (U[5].xyz + U[3].xyz * ((nd.x - U[4].w) * U[2].w * U[3].w) + U[4].xyz * ((nd.y - U[5].w) * U[2].w));
      K = 70.0;
    }
  }
  K *= smoothstep(h1 * 0.5, h1 * 0.5 + 0.5, U[7].z);
  var acc = (goal - p.xyz) * K - v.xyz * (1.7 * sqrt(max(K, 1.0)));
  acc += flow(p.xyz, t * 0.5) * (0.35 + 4.0 * U[6].w + (1.0 - U[7].z) * 3.0) * select(1.0, 0.1, flag > 0.0);
  let ro = U[9].xyz; let rd = U[10].xyz;
  let dv = p.xyz - (ro + rd * max(0.0, dot(p.xyz - ro, rd)));
  let dl = length(dv);
  if (U[9].w > 0.0 && dl < 0.8 && flag == 0.0) { acc += dv / max(dl, 1e-3) * (1.0 - dl / 0.8) * 45.0 * U[9].w; }
  var vel = v.xyz + acc * dt;
  let sp = length(vel);
  if (sp > 30.0) { vel *= 30.0 / sp; }
  parts[i].pos = vec4f(p.xyz + vel * dt, pal + 8.0 * flag);
  parts[i].vel = vec4f(vel, 0.0);
}

`;

export const WGSL_DRAW = WGSL_HEAD + /* wgsl */ `
@group(0) @binding(1) var<storage, read> partsR: array<P>;
struct VO { @builtin(position) pos: vec4f, @location(0) col: vec4f, @location(1) uv: vec2f };

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let q = corners[vi];
  let p = partsR[ii].pos;
  var c = mat4x4f(U[11], U[12], U[13], U[14]) * vec4f(p.xyz, 1.0);
  let flag = floor(p.w / 8.0); let pal = p.w - flag * 8.0;
  let base = U[1].w * U[1].z;
  var sz = base * clamp(7.0 / max(c.w, 0.1), 0.55, 2.6);
  var a = 0.85;
  if (flag == 2.0) { a = 0.42; sz = base * 1.15; }
  if (flag == 1.0) { sz = base * 1.2; }
  let res = vec2f(U[1].x, U[1].y) * U[1].z;
  var o: VO;
  o.pos = vec4f(c.xy + q * sz / res * c.w, (c.z + c.w) * 0.5, c.w);
  o.col = vec4f(U[23u + u32(pal + 0.5)].rgb, a);
  o.uv = q;
  return o;
}

@fragment
fn fs(i: VO) -> @location(0) vec4f {
  let a = i.col.a * (1.0 - smoothstep(0.6, 1.0, length(i.uv)));
  if (a < 0.01) { discard; }
  return vec4f(i.col.rgb * a, a);
}
`;
