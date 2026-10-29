// WebGPU path: one storage buffer of particles stepped by a WGSL compute pass, drawn as instanced quads.
import { WGSL_SIM, WGSL_DRAW, UCOUNT } from "./shaders.js";

export async function create(canvas, N) {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw Error("No WebGPU adapter");
  const device = await adapter.requestDevice({
    requiredLimits: { maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, N * 16 * 6) },
  });
  const ctx = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  const STORAGE = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const ubuf = device.createBuffer({ size: UCOUNT * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const parts = device.createBuffer({ size: N * 32, usage: STORAGE });
  let tbuf = null, simGroup = null;

  const check = async (module) => {
    const info = await module.getCompilationInfo();
    const errs = info.messages.filter((m) => m.type === "error");
    if (errs.length) throw Error(errs.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join("\n"));
    return module;
  };
  const simMod = await check(device.createShaderModule({ code: WGSL_SIM }));
  const drawMod = await check(device.createShaderModule({ code: WGSL_DRAW }));
  device.pushErrorScope("validation");
  const simPipe = device.createComputePipeline({ layout: "auto", compute: { module: simMod, entryPoint: "sim" } });
  const blend = { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" };
  const drawPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: drawMod, entryPoint: "vs" },
    fragment: { module: drawMod, entryPoint: "fs", targets: [{ format, blend: { color: blend, alpha: blend } }] },
    primitive: { topology: "triangle-list" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });
  let depth = null;
  const drawGroup = device.createBindGroup({
    layout: drawPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 1, resource: { buffer: parts } }],
  });
  const err = await device.popErrorScope();
  if (err) throw Error(err.message);

  return {
    name: "WebGPU", N, texW: 256,
    setTargets(data) {
      tbuf = device.createBuffer({ size: data.byteLength, usage: STORAGE });
      device.queue.writeBuffer(tbuf, 0, data);
      simGroup = device.createBindGroup({
        layout: simPipe.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 1, resource: { buffer: parts } }, { binding: 2, resource: { buffer: tbuf } }],
      });
    },
    setInitial(pos) {
      const both = new Float32Array(N * 8);
      for (let i = 0; i < N; i++) both.set(pos.subarray(i * 4, i * 4 + 4), i * 8);
      device.queue.writeBuffer(parts, 0, both);
    },
    resize(w, h) {
      canvas.width = w; canvas.height = h;
      depth?.destroy();
      depth = device.createTexture({ size: [w, h], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    },
    frame(U, clear) {
      device.queue.writeBuffer(ubuf, 0, U);
      const enc = device.createCommandEncoder();
      const cp = enc.beginComputePass();
      cp.setPipeline(simPipe);
      cp.setBindGroup(0, simGroup);
      cp.dispatchWorkgroups(Math.ceil(N / 256));
      cp.end();
      const rp = enc.beginRenderPass({
        colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: { r: clear[0], g: clear[1], b: clear[2], a: 1 } }],
        depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" },
      });
      rp.setPipeline(drawPipe);
      rp.setBindGroup(0, drawGroup);
      rp.draw(6, N);
      rp.end();
      device.queue.submit([enc.finish()]);
    },
  };
}
