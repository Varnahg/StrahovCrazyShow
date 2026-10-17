import test from "node:test";
import assert from "node:assert/strict";
import { Observable } from "@babylonjs/core/Misc/observable";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine.pure";
import { WebGPUShaderProcessorWGSL } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL.pure";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext";
import {
  WebGpuCompilationProfile,
  type CompilationProfileOptions,
} from "../client/webgpu-compilation-profile";
import type { RenderOperationKind } from "../client/render-health";
import {
  sanitizeDiagnosticsData,
  validateDiagnosticsBatch,
  diagnosticsByteLength,
  MAX_DIAGNOSTICS_RECORD_BYTES,
} from "../shared/session-diagnostics";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function fixture() {
  let time = 0;
  const tick = (ms: number) => {
    time += ms;
  };
  class Device {
    readonly module = {
      getCompilationInfo: () => {
        tick(1);
        return Promise.resolve({ messages: [] as unknown[] });
      },
    };
    pipeline = {};
    pending = deferred<object>();
    failSync: unknown;
    queue = {
      submit: (buffers: unknown) => {
        tick(7);
        return buffers;
      },
    };
    createShaderModule(descriptor: unknown) {
      assert.equal(this instanceof Device, true);
      tick(3);
      return this.module;
    }
    createRenderPipeline(descriptor: unknown) {
      assert.equal(this instanceof Device, true);
      tick(31);
      if (this.failSync) throw this.failSync;
      return this.pipeline;
    }
    createRenderPipelineAsync(descriptor: unknown) {
      assert.equal(this instanceof Device, true);
      tick(2);
      return this.pending.promise;
    }
  }
  class Cache {
    static NumCacheHitWithoutHash = 100;
    static NumCacheHitWithHash = 200;
    static NumCacheMiss = 300;
    static NumPipelineCreationLastFrame = 4;
  }
  const device = new Device();
  const engine = {
    isWebGPU: true,
    _device: device as Device | undefined,
    _tintWASM: undefined as
      { convertSpirV2WGSL(value: unknown): unknown } | undefined,
    _cacheRenderPipeline: new Cache(),
    countersLastFrame: {
      numEnableEffects: 8,
      numEnableDrawWrapper: 9,
      numBundleCreationNonCompatMode: 3,
      numBundleReuseNonCompatMode: 12,
    },
    onDisposeObservable: new Observable<void>(),
    onContextRestoredObservable: new Observable<void>(),
    _initializeLimits() {
      return this._device?.createShaderModule({ label: "engine init" });
    },
    _compileRawShaderToSpirV(value: unknown, stage: unknown) {
      tick(11);
      return value;
    },
    prepareGlslangAndTintAsync() {
      return Promise.resolve().then(() => {
        this._tintWASM = {
          convertSpirV2WGSL: (value: unknown) => {
            tick(13);
            return value;
          },
        };
      });
    },
    _createPipelineStageDescriptor(value: unknown) {
      return this._tintWASM!.convertSpirV2WGSL(value);
    },
    _preparePipelineContextAsync(context: unknown) {
      tick(5);
      return Promise.resolve(context);
    },
  };
  return { engine, device, Device, tick, now: () => time };
}

const pinnedWGSL = (WebGPUEngine.prototype as unknown as {
  _getWGSLShader(source: string, type: string, defines?: string): string;
})._getWGSLShader;

function inventoryFixture(options: CompilationProfileOptions = {}) {
  const f = fixture();
  const engine = Object.assign(f.engine, { _getWGSLShader: pinnedWGSL });
  const profile = new WebGpuCompilationProfile(engine, {
    captureShaderInventory: true, now: f.now, ...options,
  });
  const emit = (body: string, defines = "", role: "vertex" | "fragment" = "vertex") => {
    const code = engine._getWGSLShader(body, role, defines);
    const result = f.device.createShaderModule({ code, label: role });
    assert.equal(result, f.device.module);
    return code;
  };
  return { ...f, engine, profile, emit };
}

function unusedFixture(options: CompilationProfileOptions = {}, realFinalize = false,
  configure?: (processor: WebGPUShaderProcessorWGSL) => void) {
  const f = fixture();
  const processor = new WebGPUShaderProcessorWGSL();
  processor.pureMode = true;
  const context = new WebGPUShaderProcessingContext(1, true);
  processor.initializeShaders(context);
  if (!realFinalize) processor.finalizeShaders = (vertexCode, fragmentCode) => ({ vertexCode, fragmentCode });
  configure?.(processor);
  const engine = Object.assign(f.engine, {
    _getWGSLShader: pinnedWGSL, _shaderProcessorWGSL: processor,
    _getShaderProcessor() { return this._shaderProcessorWGSL; },
  });
  const profile = new WebGpuCompilationProfile(engine, {
    captureShaderInventory: true, captureUnusedDefineInventory: true, now: f.now, ...options,
  });
  const post = (body: string, defines: Record<string, string>, fragment = false) =>
    processor.postProcessor(body, [], fragment, context, {} as never, defines, {});
  const emit = (vertex: string, fragment: string, defines: Record<string, string>, shaderName = false) => {
    processor.initializeShaders(context);
    const v = post(vertex, defines), fCode = post(fragment, defines, true);
    const final = processor.finalizeShaders(v, fCode);
    for (const role of ["vertex", "fragment"] as const) {
      const body = (shaderName ? `//#define SHADER_NAME ${role}:default\n` : "") + final[role + "Code" as "vertexCode" | "fragmentCode"];
      const code = engine._getWGSLShader(body, role, "#define DIAGNOSTIC_OUTER_PREFIX");
      assert.equal(engine._device!.createShaderModule({ code, label: role }), engine._device!.module);
      assert.match(code, /const /, "runtime arguments retain all generated declarations");
    }
    return final;
  };
  return { ...f, processor, engine, profile, post, emit };
}

test("unused define observation follows pinned post/finalize/Effect prefix without changing shader text", async () => {
  const f = unusedFixture({}, true);
  try {
    const vertex = "@vertex fn main(input: VertexInputs) -> FragmentInputs { vertexOutputs.position = vec4f(f32(USED)); }";
    const fragment = "@fragment fn main(input: FragmentInputs) -> FragmentOutputs { fragmentOutputs.color = vec4f(f32(USED)); }";
    f.profile.setStage("current-off");
    const a = f.emit(vertex, fragment, { UNUSED_SWITCH: "0", USED: "1" }, true);
    f.profile.setStage("current-on");
    const b = f.emit(vertex, fragment, { UNUSED_SWITCH: "1", USED: "1" }, true);
    assert.notEqual(a.vertexCode, b.vertexCode);
    assert.match(a.vertexCode, /const UNUSED_SWITCH = 0;/);
    await settle();
    const inv = f.profile.snapshot().shaderInventory!;
    assert.equal(inv.rawRepeated, 0);
    assert.equal(inv.bodyRepeated, 0);
    assert.equal(inv.unusedDefines!.analyzed, 4);
    assert.equal(inv.unusedDefines!.unknown, 0);
    assert.equal(inv.unusedDefines!.repeated, 2);
    assert.equal(inv.unusedDefines!.duplicateGroups, 2);
    assert.equal(inv.unusedDefines!.removedDeclarations, 4);
    assert.equal(inv.unusedDefines!.retainedDeclarations, 4);
    assert.equal(inv.unusedDefines!.pendingCodeUnits, 0);
    assert.deepEqual(inv.unusedDefines!.duplicates[0].stages, [0, 1, 1]);
    assert.equal(f.profile.snapshot().metrics.shaderValidation.calls, 4);
    assert.equal(f.profile.snapshot().observerErrors, 0);
  } finally { f.profile.dispose(); }
});

test("references in bounds attributes assertions and all WGSL line endings are kept; nested comments are ignored", async () => {
  const breaks = ["\n", "\r", "\r\n", "\v", "\f", "\u0085", "\u2028", "\u2029"];
  for (const separator of breaks) {
    const f = unusedFixture();
    try {
      const body = `// ignored comment${separator}const_assert USED > 0;\n` +
        "@group(GROUP) @binding(0) var<uniform> data: array<u32, SIZE>;\n" +
        "/* UNUSED /* USED */ UNUSED */\nfn main() {}";
      f.emit(body, body, { USED: "1", GROUP: "0", SIZE: "4", UNUSED: "0" });
      f.emit(body, body, { USED: "1", GROUP: "0", SIZE: "4", UNUSED: "1" });
      await settle();
      const inv = f.profile.snapshot().shaderInventory!.unusedDefines!;
      assert.equal(inv.analyzed, 4, JSON.stringify(separator));
      assert.equal(inv.removedDeclarations, 4);
      assert.equal(inv.retainedDeclarations, 12);
      assert.equal(inv.repeated, 3);
    } finally { f.profile.dispose(); }
  }
});

test("unsafe initializers retain transitive references and narrow literal/name checks never erase errors", async () => {
  const f = unusedFixture();
  try {
    const body = "fn main() {}";
    const defines = { A: "1+B", B: "1+C", C: "1", ZERO_DIVISION: "1/0", BIG: "2147483648",
      FLOAT: "1.0", lower: "1", NULL: "1", _: "1", UNUSED: "0" };
    f.emit(body, body, defines);
    f.emit(body, body, { ...defines, UNUSED: "1" });
    await settle();
    const inv = f.profile.snapshot().shaderInventory!.unusedDefines!;
    assert.equal(inv.analyzed, 4);
    assert.equal(inv.removedDeclarations, 4);
    assert.equal(inv.retainedDeclarations, 36);
    assert.equal(inv.unsafeDeclarations, 32);
    assert.equal(inv.repeated, 3);
    assert.equal(inv.names.find((entry) => entry.name === "C")!.retained, 2);
  } finally { f.profile.dispose(); }
  const invalidDefines: Record<string, string>[] = [
    { INJECT: "1; const_assert false" }, { "BAD-NAME": "1" },
    { DUP: "1;\nconst DUP = 2" }, { BAD: "1/* unterminated" },
  ];
  for (const defines of invalidDefines) {
    const invalid = unusedFixture();
    try {
      invalid.emit("fn main() {}", "fn main() {}", defines);
      await settle();
      assert.equal(invalid.profile.snapshot().shaderInventory!.unusedDefines!.analyzed, 0);
      assert.equal(invalid.profile.snapshot().shaderInventory!.unusedDefines!.unknown, 2);
    } finally { invalid.profile.dispose(); }
  }
});

test("unknown provenance and non top-level or unsupported bodies never become derived matches", async () => {
  const bodies = ["/* unterminated", "fn main() {", "fn main() { let λ = 1; }", "#unknown directive\nfn main() {}"];
  for (const body of bodies) {
    const f = unusedFixture();
    try {
      f.emit(body, body, { UNUSED: "1" });
      await settle();
      assert.equal(f.profile.snapshot().shaderInventory!.unusedDefines!.unknown, 2);
    } finally { f.profile.dispose(); }
  }
  const f = unusedFixture();
  try {
    const code = f.engine._getWGSLShader("const UNUSED = 1;\nfn main() {}", "vertex", "");
    f.device.createShaderModule({ code });
    const posted = f.post("fn main() {}", { UNUSED: "1" });
    f.processor.finalizeShaders("fn outer() {" + posted + "}", posted);
    f.device.createShaderModule({ code: f.engine._getWGSLShader("fn outer() {" + posted + "}", "vertex", "") });
    await settle();
    assert.equal(f.profile.snapshot().shaderInventory!.unusedDefines!.analyzed, 0);
    assert.equal(f.profile.snapshot().shaderInventory!.unusedDefines!.unknown, 2);
  } finally { f.profile.dispose(); }
});

test("unused define capture requires both flags and never evaluates processor accessors", () => {
  for (const options of [
    { captureUnusedDefineInventory: true }, { captureShaderInventory: true },
    { captureShaderInventory: true, captureUnusedDefineInventory: true },
  ]) {
    const f = fixture(); let reads = 0;
    Object.defineProperty(f.engine, "_shaderProcessorWGSL", { get() { reads++; throw new Error("not ours to read"); } });
    Object.defineProperty(f.engine, "_getShaderProcessor", { get() { reads++; throw new Error("method accessor"); } });
    const p = new WebGpuCompilationProfile(f.engine, options);
    assert.equal(reads, 0);
    assert.equal(p.snapshot().observerErrors, 0);
    if (!options.captureShaderInventory) assert.equal(p.snapshot().shaderInventory, null);
    else assert.equal(p.snapshot().shaderInventory!.unusedDefines !== null, !!options.captureUnusedDefineInventory);
    p.dispose();
  }
});

test("derived fingerprint collisions require exact region equality", async () => {
  const f = unusedFixture();
  try {
    // These valid function bodies collide under FNV after the retained newline.
    for (const body of ["fn q1qfy3cn1y5i9di() {}", "fn q1llmv0o1pf2m9o() {}"])
      f.emit(body, body, { UNUSED: "1" });
    await settle();
    const inv = f.profile.snapshot().shaderInventory!.unusedDefines!;
    assert.equal(inv.analyzed, 4);
    assert.equal(inv.repeated, 2);
    assert.equal(inv.duplicateGroups, 2);
    assert.ok(inv.hashConflicts > 0);
    assert.deepEqual(inv.duplicates.map((entry) => entry.fingerprint), ["c465019e", "c465019e"]);
    assert.notEqual(inv.duplicates[0].id, inv.duplicates[1].id);
  } finally { f.profile.dispose(); }
});

test("conflicting generated-table provenance for the same raw text becomes ambiguous", async () => {
  const f = unusedFixture({}, false, (processor) => {
    const order = (code: string) => {
      const lines = code.split("\n");
      return [...lines.filter((line) => line.startsWith("const ")).sort(),
        ...lines.filter((line) => !line.startsWith("const "))].join("\n");
    };
    processor.finalizeShaders = (v, fCode) => ({ vertexCode: order(v), fragmentCode: order(fCode) });
  });
  try {
    f.emit("const B = 2;\nfn main() {}", "const B = 2;\nfn main() {}", { A: "1" });
    f.emit("const A = 1;\nfn main() {}", "const A = 1;\nfn main() {}", { B: "2" });
    await settle();
    const inv = f.profile.snapshot().shaderInventory!.unusedDefines!;
    assert.equal(inv.analyzed, 2);
    assert.equal(inv.unknown, 2);
    assert.equal(inv.ambiguous, 1);
  } finally { f.profile.dispose(); }
});

test("provenance capacity shares the text budget, evicts stale evidence and remains explicit", async () => {
  const f = unusedFixture({ shaderInventoryLimits: { maxCodeUnits: 1000, maxRows: 1 } });
  try {
    for (let i = 0; i < 20; i++) f.post(`fn notCompiled${i}() {}`, { UNUSED: String(i) });
    let inv = f.profile.snapshot().shaderInventory!;
    assert.ok(inv.unusedDefines!.pendingEntries <= 8);
    assert.ok(inv.retainedCodeUnits <= 1000);
    assert.ok(inv.unusedDefines!.provenanceLimited > 0);
    f.emit("fn main() {}", "fn main() {}", { UNUSED: "1", NEXT: "2" });
    await settle();
    inv = f.profile.snapshot().shaderInventory!;
    assert.equal(inv.unusedDefines!.analyzed, 2);
    assert.equal(inv.unusedDefines!.names.length, 1);
    assert.equal(inv.unusedDefines!.exportTruncated, true);
    assert.ok(inv.retainedCodeUnits <= 1000);
  } finally { f.profile.dispose(); }
  const limited = unusedFixture({ shaderInventoryLimits: { maxCodeUnits: 20 } });
  try {
    limited.emit("fn main() {}", "fn main() {}", { UNUSED: "1" });
    await settle();
    const inv = limited.profile.snapshot().shaderInventory!;
    assert.equal(inv.unusedDefines!.analyzed, 0);
    assert.equal(inv.unusedDefines!.unknown, 2);
    assert.ok(inv.unusedDefines!.provenanceLimited > 0);
    assert.ok(inv.retainedCodeUnits <= 20);
  } finally { limited.profile.dispose(); }
});

test("processor provenance respects generation, cleanup, later owners and original throws", async () => {
  const failure = new Error("original processor failure");
  const f = unusedFixture({}, false, (processor) => {
    const original = processor.postProcessor;
    processor.postProcessor = function (...args) {
      const result = original.apply(this, args);
      if (args[0] === "fail") throw failure;
      return result;
    };
  });
  const retained = f.processor.postProcessor;
  assert.throws(() => f.post("fail", { UNUSED: "1" }), (error) => error === failure);
  assert.equal(f.profile.snapshot().shaderInventory!.unusedDefines!.pendingCodeUnits, 0);
  f.post("fn old() {}", { UNUSED: "1" });
  f.engine._device = new f.Device();
  f.engine.onContextRestoredObservable.notifyObservers();
  assert.equal(f.profile.snapshot().shaderInventory!.unusedDefines!.pendingCodeUnits, 0);
  f.emit("fn newStage() {}", "fn newStage() {}", { UNUSED: "1" });
  await settle();
  assert.equal(f.profile.snapshot().shaderInventory!.unusedDefines!.analyzed, 2);
  const laterOwner = () => "later owner";
  f.processor.postProcessor = laterOwner;
  f.profile.dispose();
  const before = f.profile.snapshot().shaderInventory!;
  assert.equal(before.retainedCodeUnits, 0);
  assert.equal(before.unusedDefines!.pendingEntries, 0);
  assert.equal(f.processor.postProcessor, laterOwner);
  assert.match(retained.call(f.processor, "fn late() {}", [], false, {} as never, {} as never, { UNUSED: "1" }, {}), /fn late/);
  assert.deepEqual(f.profile.snapshot().shaderInventory, before);
});

test("finalize observation never invokes accessors and rejects duplicate or nested generated tables", async () => {
  let reads = 0;
  const accessor = unusedFixture({}, false, (processor) => {
    processor.finalizeShaders = (vertexCode, fragmentCode) => ({
      get vertexCode() { reads++; return vertexCode; },
      get fragmentCode() { reads++; return fragmentCode; },
    });
  });
  try {
    accessor.emit("fn main() {}", "fn main() {}", { UNUSED: "1" });
    await settle();
    assert.equal(reads, 2, "only fixture caller reads each result property");
    assert.equal(accessor.profile.snapshot().shaderInventory!.unusedDefines!.unknown, 2);
  } finally { accessor.profile.dispose(); }
  for (const transform of [(code: string) => `fn outer() {${code}}`, (code: string) => code + code]) {
    const f = unusedFixture({}, false, (processor) => {
      processor.finalizeShaders = (v, fCode) => ({ vertexCode: transform(v), fragmentCode: transform(fCode) });
    });
    try {
      f.emit("fn main() {}", "fn main() {}", { UNUSED: "1" });
      await settle();
      assert.equal(f.profile.snapshot().shaderInventory!.unusedDefines!.analyzed, 0);
      assert.equal(f.profile.snapshot().shaderInventory!.unusedDefines!.unknown, 2);
    } finally { f.profile.dispose(); }
  }
});

test("fully populated derived inventory survives real diagnostics privacy limits without shader bodies", async () => {
  const f = unusedFixture();
  try {
    for (let i = 0; i < 40; i++) {
      f.profile.setStage(`phase-${i % 20}`);
      const body = `fn PRIVATE_SHADER_BODY_${i}() {}`;
      f.emit(body, body, { [`UNUSED_${i}`]: "0" });
      f.emit(body, body, { [`UNUSED_${i}`]: "0" });
      f.emit(body, body, { [`UNUSED_${i}`]: "1" });
    }
    await settle();
    const timing = f.profile.snapshot();
    assert.doesNotMatch(JSON.stringify(timing), /PRIVATE_SHADER_BODY|const |#define/);
    assert.equal(timing.shaderInventory!.unusedDefines!.duplicates.length, 16);
    assert.equal(timing.shaderInventory!.unusedDefines!.names.length, 16);
    const sanitized = sanitizeDiagnosticsData({ timing });
    assert.deepEqual(sanitized.timing, timing);
    const record = { seq: 0, atMs: 10, kind: "webgpu-inventory", data: sanitized };
    assert.ok(diagnosticsByteLength(record) < MAX_DIAGNOSTICS_RECORD_BYTES);
    const wire = validateDiagnosticsBatch({ schemaVersion: 1,
      sessionId: "11111111-1111-4111-8111-111111111111", batchId: 0, records: [record] });
    assert.ok(wire);
    assert.deepEqual(wire.records[0].data, sanitized);
  } finally { f.profile.dispose(); }
});

test("inventory uses actual pinned WGSL construction and exact raw/body equality across stages", async () => {
  const f = inventoryFixture();
  try {
    f.profile.setStage("current-off");
    const vertex = "@vertex fn vertexMain() {}", fragment = "@fragment fn fragmentMain() {}";
    const raw = f.emit(vertex, "#define LIGHT0\n#define POINTLIGHT0");
    assert.equal(raw, "//#define LIGHT0\n//#define POINTLIGHT0\n" + vertex);
    f.emit(vertex, "#define LIGHT0\n#define POINTLIGHT0");
    f.emit(fragment, "#define LIGHT0", "fragment");
    f.profile.setStage("current-on");
    f.emit(vertex, "#define LIGHT0\n#define SPOTLIGHT0");
    f.emit(fragment, "#define LIGHT0\n#define LIGHT1", "fragment");
    await settle();
    const inv = f.profile.snapshot().shaderInventory!;
    assert.equal(inv.calls, 5);
    assert.equal(inv.rawKnown, 5);
    assert.equal(inv.rawRepeated, 1);
    assert.equal(inv.bodyKnown, 5);
    assert.equal(inv.bodyRepeated, 3);
    assert.equal(inv.bodyUnknown, 0);
    assert.equal(inv.rawDuplicateGroups, 1);
    assert.equal(inv.bodyDuplicateGroups, 2);
    const v = inv.bodyDuplicates.find((entry) => entry.vertex === 3)!;
    assert.equal(v.variants, 2);
    assert.deepEqual(v.stages, [0, 2, 1]);
    assert.equal(inv.bodyDuplicates.find((entry) => entry.fragment === 2)!.variants, 2);
    assert.equal(f.profile.snapshot().metrics.shaderValidation.calls, 5);
    assert.equal(f.profile.snapshot().observerErrors, 0);
  } finally { f.profile.dispose(); }
});

test("known FNV collisions never count unequal raw or body text as duplicates", async () => {
  const f = inventoryFixture();
  try {
    f.emit("costarring");
    f.emit("liquid");
    let inv = f.profile.snapshot().shaderInventory!;
    assert.equal(inv.rawRepeated, 0);
    assert.equal(inv.bodyRepeated, 0);
    assert.ok(inv.rawHashConflicts > 0);
    assert.ok(inv.bodyHashConflicts > 0);
    f.emit("costarring");
    f.emit("liquid");
    await settle();
    inv = f.profile.snapshot().shaderInventory!;
    assert.equal(inv.rawDuplicateGroups, 2);
    assert.equal(inv.bodyDuplicateGroups, 2);
    assert.deepEqual(inv.rawDuplicates.map((entry) => entry.fingerprint), ["5e4daa9d", "5e4daa9d"]);
    assert.notEqual(inv.rawDuplicates[0].id, inv.rawDuplicates[1].id);
    assert.equal(inv.rawRepeated, 2);
  } finally { f.profile.dispose(); }
});

test("body identity preserves original comments and rejects unobserved or ambiguous prefix guesses", async () => {
  const f = inventoryFixture();
  try {
    const body = "//#define USER_COMMENT\n@vertex fn main() {}";
    f.emit(body, "#define FIRST");
    f.emit(body, "#define SECOND");
    f.emit("@vertex fn main() {}", "#define SECOND");
    const raw = f.emit("fn another() {}", "#define FIRST");
    f.emit(raw); // Same raw text, now observed with a different decomposition.
    f.device.createShaderModule({ code: "//#define UNSEEN\nfn unseen() {}" });
    await settle();
    const inv = f.profile.snapshot().shaderInventory!;
    assert.equal(inv.bodyRepeated, 1, "only identical original bodies are duplicates");
    assert.equal(inv.bodyUnknown, 2, "ambiguous and unobserved prefixes stay unknown");
    assert.equal(inv.ambiguousBodies, 1);
    assert.equal(inv.rawRepeated, 1);
    assert.equal(inv.bodyDuplicates[0].chars, body.length);
  } finally { f.profile.dispose(); }
});

test("inventory never reads shader accessors twice and an observation error cannot suppress validation", async () => {
  const f = fixture();
  let codeReads = 0;
  const original = f.device.createShaderModule;
  f.device.createShaderModule = function (descriptor) {
    void (descriptor as { code: unknown }).code; // The original API owns this read.
    return original.call(this, descriptor);
  };
  const errors: unknown[] = [];
  f.device.module.getCompilationInfo = () => Promise.resolve({
    messages: [{ type: "error", message: "still validated" }],
  });
  const profile = new WebGpuCompilationProfile(f.engine, {
    captureShaderInventory: true,
    onError: (_channel, error) => errors.push(error),
  });
  try {
    const descriptor = { get code() { codeReads++; return "accessor body"; } };
    assert.equal(f.device.createShaderModule(descriptor), f.device.module);
    assert.equal(codeReads, 1);
    f.device.createShaderModule(new Proxy({ code: "proxy body" }, {
      getOwnPropertyDescriptor(_target, name) {
        if (name === "code") throw new Error("observer descriptor trap");
        return undefined;
      },
    }));
    await settle();
    assert.equal(profile.snapshot().shaderInventory!.descriptorUnknown, 2);
    assert.equal(profile.snapshot().observerErrors, 1);
    assert.equal(profile.snapshot().metrics.shaderValidation.calls, 2);
    assert.equal(errors.length, 2);
  } finally { profile.dispose(); }
});

test("disabled inventory does no descriptor or stage text work and installs no WGSL hook", async () => {
  const f = fixture();
  const engine = Object.assign(f.engine, { _getWGSLShader: pinnedWGSL });
  let reads = 0;
  const profile = new WebGpuCompilationProfile(engine);
  try {
    profile.setStage({ toString() { throw new Error("must not stringify"); } } as unknown as string);
    f.device.createShaderModule({ get code() { reads++; return "unread"; } });
    await settle();
    assert.equal(reads, 0);
    assert.equal(engine._getWGSLShader, pinnedWGSL);
    assert.equal(profile.snapshot().shaderInventory, null);
    assert.equal(profile.snapshot().hooks["engine._getWGSLShader"], undefined);
    assert.equal(profile.snapshot().observerErrors, 0);
  } finally { profile.dispose(); }
});

test("entry, text, stage and exported row limits remain explicit without losing known repeats", async () => {
  const f = inventoryFixture({ shaderInventoryLimits: {
    maxEntries: 2, maxCodeUnits: 5, maxStages: 3, maxRows: 1,
  } });
  try {
    f.profile.setStage("assets");
    f.emit("aa"); f.emit("aa");
    f.profile.setStage("current-off");
    f.emit("bbb"); f.emit("bbb");
    f.profile.setStage("current-on");
    f.emit("c"); f.emit("too large");
    f.emit("aa");
    await settle();
    const inv = f.profile.snapshot().shaderInventory!;
    assert.equal(inv.calls, 7);
    assert.equal(inv.limited, 2);
    assert.equal(inv.evidenceTruncated, true);
    assert.equal(inv.rawRepeated, 3);
    assert.equal(inv.retainedEntries, 2);
    assert.equal(inv.retainedCodeUnits, 5);
    assert.equal(inv.stages.length, 3);
    assert.equal(inv.stageOverflow, 2);
    assert.equal(inv.rawDuplicateGroups, 2);
    assert.equal(inv.bodyDuplicateGroups, 2);
    assert.equal(inv.rawDuplicates.length, 1);
    assert.equal(inv.bodyDuplicates.length, 1);
    assert.equal(inv.exportTruncated, true);
    assert.equal(inv.stages[2].name, "overflow");
  } finally { f.profile.dispose(); }
});

test("unrecognized WGSL method output remains raw-only and input/return/throw semantics stay intact", async () => {
  const f = fixture();
  const failure = new Error("original failure");
  const engine = Object.assign(f.engine, {
    _getWGSLShader(source: string, type: string, defines: string) {
      assert.equal(this, engine);
      if (source === "throw") throw failure;
      assert.deepEqual([source, type, defines], ["body", "vertex", "#define ONE"]);
      return "custom transformed body";
    },
  });
  const profile = new WebGpuCompilationProfile(engine, { captureShaderInventory: true });
  try {
    const raw = engine._getWGSLShader("body", "vertex", "#define ONE");
    assert.equal(raw, "custom transformed body");
    f.device.createShaderModule({ code: raw, label: "vertex" });
    assert.throws(() => engine._getWGSLShader("throw", "vertex", ""), (error) => error === failure);
    await settle();
    assert.equal(profile.snapshot().shaderInventory!.unrecognizedPrefix, 1);
    assert.equal(profile.snapshot().shaderInventory!.bodyUnknown, 1);
  } finally { profile.dispose(); }
});

test("restoration drops old evidence and disposal releases text while retaining bounded numeric results", async () => {
  const f = inventoryFixture();
  const wrapper = f.engine._getWGSLShader;
  f.profile.setStage("current-on");
  f.emit("first"); f.emit("first");
  const next = new f.Device();
  f.engine._device = next;
  f.engine.onContextRestoredObservable.notifyObservers();
  assert.equal(f.profile.snapshot().generation, 2);
  assert.equal(f.profile.snapshot().shaderInventory!.calls, 0);
  assert.equal(f.profile.snapshot().shaderInventory!.retainedCodeUnits, 0);
  const code = f.engine._getWGSLShader("second", "fragment", "");
  next.createShaderModule({ code }); next.createShaderModule({ code });
  await settle();
  let snapshot = f.profile.snapshot().shaderInventory!;
  assert.equal(snapshot.bodyDuplicates[0].fragment, 2);
  snapshot.bodyDuplicates[0].stages[0] = 999;
  assert.equal(f.profile.snapshot().shaderInventory!.bodyDuplicates[0].stages[0], 2);
  f.profile.dispose();
  snapshot = f.profile.snapshot().shaderInventory!;
  assert.equal(snapshot.retainedCodeUnits, 0);
  assert.equal(snapshot.retainedEntries, 0);
  assert.equal(snapshot.released, true);
  assert.equal(snapshot.bodyDuplicateGroups, 1);
  assert.equal(f.engine._getWGSLShader, pinnedWGSL);
  wrapper.call(f.engine, "late", "vertex", "");
  f.profile.setStage("late");
  assert.deepEqual(f.profile.snapshot().shaderInventory, snapshot);
});

test("bounded inventory survives the real client and server privacy filters without any shader text", async () => {
  const f = inventoryFixture({ shaderInventoryLimits: {
    maxEntries: Number.MAX_SAFE_INTEGER, maxCodeUnits: Infinity,
    maxStages: 999, maxRows: 999,
  } });
  try {
    for (let index = 0; index < 40; index++) {
      f.profile.setStage(`phase-${index % 20}`);
      const body = `PRIVATE_SHADER_TEXT_${index}`;
      f.emit(body, "#define ONE");
      f.emit(body, "#define ONE");
      f.emit(body, "#define TWO");
    }
    await settle();
    const timing = f.profile.snapshot();
    assert.equal(timing.shaderInventory!.limits.maxEntries, 1024);
    assert.equal(timing.shaderInventory!.limits.maxCodeUnits, 32 * 1024 * 1024);
    assert.equal(timing.shaderInventory!.limits.maxStages, 16);
    assert.equal(timing.shaderInventory!.limits.maxRows, 16);
    const data = { stage: "preparation-end", timing };
    assert.doesNotMatch(JSON.stringify(data), /PRIVATE_SHADER_TEXT|#define/);
    const sanitized = sanitizeDiagnosticsData(data);
    assert.deepEqual(sanitized.timing, timing);
    const record = { seq: 0, atMs: 10, kind: "webgpu-inventory", data: sanitized };
    assert.ok(diagnosticsByteLength(record) < MAX_DIAGNOSTICS_RECORD_BYTES);
    const wire = validateDiagnosticsBatch({
      schemaVersion: 1, sessionId: "11111111-1111-4111-8111-111111111111",
      batchId: 0, records: [record],
    });
    assert.ok(wire);
    assert.deepEqual(wire.records[0].data, sanitized);
    assert.equal(timing.shaderInventory!.rawDuplicates.length, 16);
    assert.equal(timing.shaderInventory!.bodyDuplicates.length, 16);
    assert.equal(timing.shaderInventory!.exportTruncated, true);
  } finally { f.profile.dispose(); }
});

test("only compilation-info diagnostics receive the validation kind, regardless of channel and label", async () => {
  const f = fixture();
  const tracked: {
    channel: string; label: string; kind: RenderOperationKind;
  }[] = [];
  const info = deferred<{ messages: unknown[] }>();
  f.device.module.getCompilationInfo = () => info.promise;
  const profile = new WebGpuCompilationProfile(f.engine, {
    track: (operation, channel, label, kind) => {
      tracked.push({ channel, label, kind });
      return operation;
    },
  });
  try {
    f.device.createShaderModule({ label: "same label" });
    const pipeline = f.device.createRenderPipelineAsync({
      label: "shader-validation",
    });
    await f.engine._preparePipelineContextAsync({ _name: "same label" });
    await f.engine.prepareGlslangAndTintAsync();
    assert.deepEqual(tracked, [
      { channel: "shader", label: "same label", kind: "shader-validation" },
      { channel: "pipeline", label: "shader-validation", kind: "preparation" },
      { channel: "shader", label: "same label", kind: "preparation" },
      { channel: "shader", label: "compilerLoad", kind: "preparation" },
    ]);
    f.device.pending.resolve({});
    info.resolve({ messages: [] });
    await pipeline;
    await settle();
    assert.equal(profile.snapshot().observerErrors, 0);
  } finally {
    profile.dispose();
  }
});

test("profile preserves returns and receivers, separates CPU phases and marks shared cache scope", async () => {
  const f = fixture();
  const slow: unknown[] = [];
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    onSlowCall: (event) => slow.push(event),
  });
  try {
    const source = {},
      descriptor = { label: "real pipeline" };
    assert.equal(f.engine._compileRawShaderToSpirV(source, "vertex"), source);
    assert.equal(
      f.device.createShaderModule({ label: "fragment" }),
      f.device.module,
    );
    assert.equal(f.device.createRenderPipeline(descriptor), f.device.pipeline);
    const buffers = [{}];
    assert.equal(f.device.queue.submit(buffers), buffers);
    await settle();
    const result = profile.snapshot();
    assert.equal(result.metrics.glslToSpirv.cpuTotalMs, 11);
    assert.equal(result.metrics.shaderModule.cpuTotalMs, 3);
    assert.equal(result.metrics.shaderValidation.cpuTotalMs, 1);
    assert.equal(result.metrics.syncPipeline.cpuTotalMs, 31);
    assert.equal(result.metrics.submit.cpuTotalMs, 7);
    assert.equal(result.metrics.shaderValidation.failures, 0);
    assert.deepEqual(slow, [
      {
        phase: "syncPipeline",
        label: "real pipeline",
        cpuMs: 31,
        generation: 1,
      },
    ]);
    assert.equal(
      result.bundleCountersLastFrame?.numBundleReuseNonCompatMode,
      12,
    );
    assert.match(result.sharedCacheCounters.scope, /all engines/);
    assert.equal(result.sharedCacheCounters.values?.NumCacheMiss, 300);
    result.metrics.syncPipeline.calls = 999;
    assert.equal(profile.snapshot().metrics.syncPipeline.calls, 1);
  } finally {
    profile.dispose();
  }
});

test("async pipeline keeps original Promise identity, records completion latency and reports rejection once", async () => {
  const f = fixture(),
    errors: unknown[] = [],
    tracked: string[] = [];
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    onError: (_channel, error) => errors.push(error),
    track: (promise, channel, label) => {
      tracked.push(`${channel}:${label}`);
      return promise.catch((error) => {
        errors.push(error);
        throw error;
      });
    },
  });
  try {
    const promise = f.device.createRenderPipelineAsync({ label: "async" });
    assert.equal(promise, f.device.pending.promise);
    assert.equal(profile.snapshot().metrics.asyncPipeline.pending, 1);
    f.tick(43);
    const failure = new Error("pipeline rejected");
    const rejected = assert.rejects(promise, (error) => error === failure);
    f.device.pending.reject(failure);
    await rejected;
    await settle();
    assert.deepEqual(errors, [failure]);
    assert.deepEqual(tracked, ["pipeline:async"]);
    const stats = profile.snapshot().metrics.asyncPipeline;
    assert.equal(stats.cpuTotalMs, 2);
    assert.equal(stats.asyncTotalMs, 45);
    assert.equal(stats.failures, 1);
    assert.equal(stats.pending, 0);
  } finally {
    profile.dispose();
  }
});

test("fulfilled shader compilation information with error messages invalidates the shader channel", async () => {
  const f = fixture(),
    errors: { channel: string; error: unknown; label: string }[] = [];
  f.device.module.getCompilationInfo = () =>
    Promise.resolve({
      messages: [
        { type: "error", message: "bad binding", lineNum: 4, linePos: 7 },
      ],
    });
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    onError: (channel, error, label) => errors.push({ channel, error, label }),
  });
  try {
    assert.equal(
      f.device.createShaderModule({ label: "native sky" }),
      f.device.module,
    );
    await settle();
    assert.equal(errors.length, 1);
    assert.equal(errors[0].channel, "shader");
    assert.equal(errors[0].label, "native sky");
    assert.match(String(errors[0].error), /4:7 bad binding/);
    const result = profile.snapshot();
    assert.equal(result.metrics.shaderModule.failures, 0);
    assert.equal(result.metrics.shaderValidation.failures, 1);
    assert.equal(result.metrics.shaderValidation.pending, 0);
  } finally {
    profile.dispose();
  }
});

test("fulfilled compilation errors use the health tracking branch without a duplicate callback", async () => {
  const f = fixture(),
    failures: string[] = [];
  f.device.module.getCompilationInfo = () =>
    Promise.resolve({ messages: [{ type: "error", message: "invalid WGSL" }] });
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    onError: () =>
      assert.fail("tracked async failures must not also call onError"),
    track: (promise, channel, label) =>
      promise.catch((error) => {
        failures.push(`${channel}:${label}:${String(error)}`);
        throw error;
      }),
  });
  f.device.createShaderModule({ label: "new native variant" });
  await settle();
  assert.equal(failures.length, 1);
  assert.match(failures[0], /shader:new native variant:.*invalid WGSL/);
  assert.equal(profile.snapshot().metrics.shaderValidation.failures, 1);
  assert.equal(profile.snapshot().observerErrors, 0);
  profile.dispose();
});

test("late compilation information cannot invalidate a disposed owner", async () => {
  const f = fixture(),
    errors: unknown[] = [];
  const information = deferred<{ messages: unknown[] }>();
  f.device.module.getCompilationInfo = () => information.promise;
  const original = f.device.createShaderModule;
  const profile = new WebGpuCompilationProfile(f.engine, {
    onError: (_channel, error) => errors.push(error),
  });
  f.device.createShaderModule({ label: "disposing" });
  assert.equal(profile.snapshot().metrics.shaderValidation.pending, 1);
  profile.dispose();
  information.resolve({
    messages: [{ type: "error", message: "late stale result" }],
  });
  await settle();
  assert.equal(f.device.createShaderModule, original);
  assert.deepEqual(errors, []);
  assert.equal(profile.snapshot().metrics.shaderValidation.pending, 0);
  assert.equal(profile.snapshot().metrics.shaderValidation.failures, 0);
});

test("compilation-info API failure is reported without replacing the original shader module or including observer cost", () => {
  const f = fixture();
  const failure = new Error("compilation info unavailable");
  f.device.module.getCompilationInfo = () => {
    f.tick(2);
    throw failure;
  };
  const errors: unknown[] = [];
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    onError: (_channel, error) => {
      errors.push(error);
      f.tick(1000);
    },
  });
  assert.equal(f.device.createShaderModule({}), f.device.module);
  assert.deepEqual(errors, [failure]);
  assert.equal(profile.snapshot().metrics.shaderModule.cpuTotalMs, 3);
  assert.equal(profile.snapshot().metrics.shaderValidation.cpuTotalMs, 2);
  profile.dispose();
});

test("warnings do not become failures and native async preparation retains original rejection identity", async () => {
  const f = fixture(),
    errors: unknown[] = [];
  f.device.module.getCompilationInfo = () =>
    Promise.resolve({ messages: [{ type: "warning", message: "unused" }] });
  const pending = deferred<unknown>();
  f.engine._preparePipelineContextAsync = () => pending.promise;
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    onError: (_channel, error) => errors.push(error),
  });
  try {
    f.device.createShaderModule({});
    const result = f.engine._preparePipelineContextAsync({
      _name: "pbr variant",
    });
    assert.equal(result, pending.promise);
    const failure = new Error("shader translation failed");
    const rejected = assert.rejects(result, (error) => error === failure);
    pending.reject(failure);
    await rejected;
    await settle();
    assert.deepEqual(errors, [failure]);
    assert.equal(profile.snapshot().metrics.shaderValidation.failures, 0);
    assert.equal(profile.snapshot().metrics.shaderPreparation.failures, 1);
  } finally {
    profile.dispose();
  }
});

test("restore detaches the old device and late old operations cannot taint the new generation", async () => {
  const f = fixture(),
    errors: unknown[] = [];
  const oldMethod = f.device.createRenderPipeline;
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    onError: (_channel, error) => errors.push(error),
  });
  const oldPromise = f.device.createRenderPipelineAsync({ label: "old" });
  const next = new f.Device();
  f.engine._device = next;
  f.engine.onContextRestoredObservable.notifyObservers();
  assert.equal(f.device.createRenderPipeline, oldMethod);
  assert.equal(profile.snapshot().generation, 2);
  const failure = new Error("old device failure");
  const rejected = assert.rejects(oldPromise, (error) => error === failure);
  f.device.pending.reject(failure);
  await rejected;
  await settle();
  assert.deepEqual(errors, []);
  assert.equal(profile.snapshot().metrics.asyncPipeline.calls, 0);
  next.createRenderPipeline({});
  assert.equal(profile.snapshot().metrics.syncPipeline.calls, 1);
  profile.dispose();
});

test("pre-init attachment observes init resources and lazy Tint's very first conversion", async () => {
  const f = fixture();
  f.engine._device = undefined;
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    track: (operation) => operation.then((value) => value),
  });
  try {
    assert.equal(profile.attachedAfterDeviceCreation, false);
    assert.equal(
      profile.snapshot().hooks["device.createShaderModule"],
      "not-created",
    );
    f.engine._device = f.device;
    f.engine._initializeLimits();
    await f.engine.prepareGlslangAndTintAsync();
    const source = {};
    assert.equal(f.engine._createPipelineStageDescriptor(source), source);
    await settle();
    const result = profile.snapshot();
    assert.equal(result.metrics.shaderModule.calls, 1);
    assert.equal(result.metrics.compilerLoad.calls, 1);
    assert.equal(result.metrics.spirvToWgsl.calls, 1);
    assert.equal(result.metrics.spirvToWgsl.cpuTotalMs, 13);
  } finally {
    profile.dispose();
  }
});

test("cleanup restores inherited/own methods, preserves a later owner and disables retained wrappers", () => {
  const f = fixture();
  const original = f.device.createRenderPipeline;
  assert.equal(Object.hasOwn(f.device, "createRenderPipeline"), false);
  const profile = new WebGpuCompilationProfile(f.engine, { now: f.now });
  const retained = f.device.createRenderPipeline;
  const laterOwner = () => ({ owner: "later" });
  f.device.createRenderPipeline = laterOwner;
  f.engine.onDisposeObservable.notifyObservers();
  assert.equal(f.device.createRenderPipeline, laterOwner);
  assert.equal(profile.snapshot().active, false);
  assert.equal(retained.call(f.device, {}), f.device.pipeline);
  assert.equal(profile.snapshot().metrics.syncPipeline.calls, 0);
  profile.dispose();
  const other = fixture();
  const next = new WebGpuCompilationProfile(other.engine);
  next.dispose();
  assert.equal(Object.hasOwn(other.device, "createRenderPipeline"), false);
  assert.equal(typeof original, "function");
});

test("instrumentation callbacks cannot replace sync throws or returned values and slow labels are bounded", () => {
  const f = fixture();
  const failure = new Error("driver failure");
  f.device.failSync = failure;
  const labels: string[] = [];
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    slowCallMs: 20,
    onError: () => {
      f.tick(1000);
      throw new Error("observer failed");
    },
    onSlowCall: ({ label }) => {
      labels.push(label);
      throw new Error("event failed");
    },
  });
  assert.throws(
    () => f.device.createRenderPipeline({ label: "x".repeat(10000) }),
    (error) => error === failure,
  );
  const result = profile.snapshot();
  assert.equal(
    result.metrics.syncPipeline.cpuTotalMs,
    31,
    "observer work is excluded from API duration",
  );
  assert.equal(result.metrics.syncPipeline.failures, 1);
  assert.equal(result.observerErrors, 2);
  assert.equal(labels[0].length, 160);
  profile.dispose();
});

test("absent or immutable hooks stay explicitly unavailable and WebGL remains untouched", () => {
  const f = fixture();
  const original = f.device.createRenderPipeline;
  Object.defineProperty(f.device, "createRenderPipeline", {
    value: original,
    writable: false,
    configurable: false,
  });
  const profile = new WebGpuCompilationProfile(f.engine);
  assert.equal(
    profile.snapshot().hooks["device.createRenderPipeline"],
    "unavailable",
  );
  assert.equal(f.device.createRenderPipeline, original);
  assert.throws(() => new WebGpuCompilationProfile(f.engine), /already/);
  profile.dispose();
  const gl = fixture();
  gl.engine.isWebGPU = false;
  const method = gl.device.createShaderModule;
  const skipped = new WebGpuCompilationProfile(gl.engine);
  assert.equal(gl.device.createShaderModule, method);
  assert.equal(skipped.snapshot().backend, "other");
  assert.equal(
    skipped.snapshot().hooks["device.createShaderModule"],
    "unavailable",
  );
  skipped.dispose();
});
