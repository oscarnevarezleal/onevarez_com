// WebGL2 renderer: particle state lives in two float textures (position, velocity), stepped by a fragment shader
// into a ping-pong pair of framebuffers, then drawn as points that fetch their position by gl_VertexID.
import { GLSL_SIM, GLSL_QUAD, GLSL_DRAW_VS, GLSL_DRAW_FS } from "./shaders.js";

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
  return p;
}

export function create(canvas, N) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: true, powerPreference: "high-performance" });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) throw Error("WebGL2 float targets unavailable");
  const W = 256, H = N / W;
  const tex = (h, data) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, h, 0, gl.RGBA, gl.FLOAT, data);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    return t;
  };
  const state = [0, 1].map(() => {
    const pos = tex(H, null), vel = tex(H, null), fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pos, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, vel, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error("Incomplete framebuffer");
    return { pos, vel, fb };
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  let tgt = null, cur = 0;
  const sim = program(gl, GLSL_QUAD, GLSL_SIM), draw = program(gl, GLSL_DRAW_VS, GLSL_DRAW_FS);
  const loc = (p, n) => gl.getUniformLocation(p, n);
  const L = { simU: loc(sim, "U"), simPos: loc(sim, "uPos"), simVel: loc(sim, "uVel"), simTgt: loc(sim, "uTgt"), drawU: loc(draw, "U"), drawPos: loc(draw, "uPos") };
  const vao = gl.createVertexArray();
  const bind = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); };

  return {
    name: "WebGL2", N, texW: W,
    setTargets(data) { tgt = tex(H * (data.length / (N * 4)), data); },
    setInitial(pos) {
      for (const s of state) {
        gl.bindTexture(gl.TEXTURE_2D, s.pos);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.FLOAT, pos);
        gl.bindTexture(gl.TEXTURE_2D, s.vel);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.FLOAT, new Float32Array(N * 4));
      }
    },
    resize(w, h) { canvas.width = w; canvas.height = h; },
    frame(U, clear) {
      gl.bindVertexArray(vao);
      // step
      const src = state[cur], dst = state[1 - cur];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(sim);
      gl.uniform4fv(L.simU, U);
      bind(0, src.pos); bind(1, src.vel); bind(2, tgt);
      gl.uniform1i(L.simPos, 0); gl.uniform1i(L.simVel, 1); gl.uniform1i(L.simTgt, 2);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      cur = 1 - cur;
      // draw
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(clear[0], clear[1], clear[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // Depth lets the black hole's event horizon hide the disk behind it.
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(draw);
      gl.uniform4fv(L.drawU, U);
      bind(0, dst.pos);
      gl.uniform1i(L.drawPos, 0);
      gl.drawArrays(gl.POINTS, 0, N);
    },
  };
}
