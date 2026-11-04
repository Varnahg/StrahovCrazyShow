import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const support = new URL("../docs/performance/evidence/shader-syntax-cache-20261103/", import.meta.url);
const { sources, baselineModule, ownedPath, applySection } = await import(new URL("stage.mjs", support).href);
const { runner, identity, uniqueEffects } = await import(new URL("runner.mjs", support).href);
const { captureCorpus } = await import(new URL("../shader-cpu-kernel-20261103/fixtures.mjs", support).href);
const override = process.env.STRAHOV_SHADER_SYNTAX_TEST_MODULE;
assert.ok(override || !process.env.STRAHOV_SHADER_SYNTAX_PREIMAGE_DIR, "default native test cannot bypass installed identity with a captured preimage");
const processing = override
  ? await import(pathToFileURL(ownedPath(resolve(override))).href)
  : await import("@babylonjs/core/Engines/Processors/shaderProcessor");
assert.equal(typeof processing.CreateShaderSyntaxCache, "function", "installed API required; staged preinstallation is explicit only");
const baseline = await baselineModule();
type Lease = { setEnabled(enabled: boolean): void; reset(): void; dispose(): void; snapshot(): Record<string, number | boolean> };
const lease = (processor: object, options?: object): Lease => processing.CreateShaderSyntaxCache(processor, options);
const processor = () => ({ shaderLanguage: 1, noPrecision: true });
function text(module: any, proc: object, code: string, defines: string[] = [], extra: object = {}) {
  let output: string | undefined;
  module.Process(code, { processor: proc, processingContext: {}, defines, indexParameters: {}, isFragment: false,
    supportsUniformBuffers: true, includesShadersStore: {}, shadersRepository: "", version: "100", platformName: "WEBGPU", ...extra },
    (value: string) => { output = value; });
  assert.equal(typeof output, "string"); return output;
}

test("staging preserves explicit EOF newline changes in forward and reverse patch application", () => {
  const change = "@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n";
  assert.equal(applySection("old", change), "new\n");
  assert.equal(applySection("new\n", change, true), "old");
  const both = "@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n";
  assert.equal(applySection("old", both), "new");
  assert.equal(applySection("new", both, true), "old");
});

test("syntax cache is explicit, isolated, bounded, releasable and exposes only copied primitive stats", () => {
  const a = processor(), b = processor(), cache = lease(a);
  try {
    text(processing, a, "A;"); text(processing, a, "A;");
    assert.equal(cache.snapshot().requests, 0); assert.equal(cache.snapshot().entries, 0);
    assert.throws(() => lease(a), /owner/);
    cache.setEnabled(true); text(processing, a, "A;"); text(processing, a, "A;"); text(processing, a, "A;"); text(processing, b, "A;");
    const before = cache.snapshot();
    assert.equal(before.hits, 1); assert.equal(before.misses, 2); assert.equal(before.entries, 1);
    assert.equal(before.promotions, 1); assert.equal(before.deferred, 1); assert.equal(before.residentEntries, 1);
    assert.ok(Object.values(before).every(value => typeof value === "number" || typeof value === "boolean"));
    before.hits = 99; assert.equal(cache.snapshot().hits, 1);
    cache.setEnabled(false); assert.equal(cache.snapshot().entries, 0); assert.equal(cache.snapshot().hits, 1);
    cache.reset(); assert.equal(cache.snapshot().requests, 0); assert.equal(cache.snapshot().enabled, false);
    cache.setEnabled(true); text(processing, a, "A;"); assert.equal(cache.snapshot().misses, 1);
    cache.dispose(); const ended = cache.snapshot(); cache.dispose(); assert.deepEqual(cache.snapshot(), ended);
    assert.equal(ended.textUnits, 0); assert.equal(ended.nodes, 0); assert.equal(ended.operators, 0);
    assert.throws(() => cache.reset(), /disposed/); assert.throws(() => cache.setEnabled(true), /disposed/);
    const next = lease(a, { enabled: true }); next.dispose();
  } finally { cache.dispose(); }
  for (const options of [{ enabled: 1 }, { maxEntries: 0 }, { maxEntries: 65 }, { maxTextUnits: null }, { maxNodes: NaN }, { maxOperators: Infinity }])
    assert.throws(() => lease(processor(), options));
});

test("cached syntax remains immutable while every variant walk gets fresh defines and callbacks", t => {
  const p = { ...processor(), lineProcessor: (line: string) => line }, cache = lease(p, { enabled: true });
  t.after(() => cache.dispose());
  const frozen: any[] = [], originalFreeze = Object.freeze;
  t.mock.method(Object, "freeze", ((value: any) => { const result = originalFreeze(value);
    if (value && Array.isArray(value.children)) frozen.push(value); return result; }) as typeof Object.freeze);
  const code = "#if defined(A) && N > 1\n#define BRANCH 7\nfirst;\n#else\nsecond;\n#endif\n#ifdef BRANCH\nselected;\n#endif";
  for (const defines of [["#define A", "#define N 2"], ["#define N 0"], ["#define A", "#define N 3"]]) {
    let calls = 0; p.lineProcessor = line => { calls++; return line; };
    assert.equal(text(processing, p, code, defines), text(baseline, { ...p }, code, defines));
    assert.ok(calls > 0, "cached syntax cannot skip processor callbacks");
  }
  assert.equal(cache.snapshot().misses, 2); assert.equal(cache.snapshot().hits, 1);
  assert.ok(frozen.length > 0 && frozen.every(node => Object.isFrozen(node) && Object.isFrozen(node.children)));
  const frozenExpression = (value: any): boolean => !value || Object.isFrozen(value) && frozenExpression(value.leftOperand) && frozenExpression(value.rightOperand);
  assert.ok(frozen.some(node => node.testExpression));
  assert.ok(frozen.every(node => frozenExpression(node.testExpression)));
});

test("processor ownership and current language flags remain separate from cached syntax", () => {
  const a = processor(), b = { ...processor(), shaderLanguage: 0 }, first = lease(a, { enabled: true }), second = lease(b, { enabled: true });
  const code = "#ifdef GL_ES\nes;\n#else\nwgsl;\n#endif";
  try {
    for (let i = 0; i < 3; i++) { assert.equal(text(processing, a, code), "wgsl;\n"); assert.equal(text(processing, b, code), "es;\n"); }
    assert.equal(first.snapshot().hits, 1); assert.equal(second.snapshot().hits, 1);
    a.shaderLanguage = 0;
    assert.equal(text(processing, a, code), text(baseline, a, code));
    assert.equal(first.snapshot().hits, 2, "language is re-evaluated by the fresh variant dictionaries");
    first.dispose(); assert.equal(text(processing, b, code), "es;\n"); assert.equal(second.snapshot().hits, 2);
  } finally { first.dispose(); second.dispose(); }
});

test("exact post-include key tracks indexParameters, mutable include bytes and afterIncludes output", () => {
  const p = processor(), cache = lease(p, { enabled: true }), includes: Record<string, string> = { leaf: "value{X};" };
  const code = "#include<leaf>[0..count]";
  try {
    for (const count of [1, 2, 1, 1]) {
      const options = { includesShadersStore: includes, indexParameters: { count } };
      assert.equal(text(processing, p, code, [], options), text(baseline, p, code, [], options));
    }
    assert.equal(cache.snapshot().misses, 3); assert.equal(cache.snapshot().hits, 1);
    includes.leaf = "changed{X};";
    assert.equal(text(processing, p, code, [], { includesShadersStore: includes, indexParameters: { count: 1 } }), "changed0;\n");
    for (const suffix of ["one;", "two;", "one;", "one;"]) {
      const options = { processCodeAfterIncludes: (_stage: string, source: string) => source + "\n" + suffix };
      assert.equal(text(processing, p, "base;", [], options), text(baseline, p, "base;", [], options));
    }
    assert.equal(cache.snapshot().misses, 7); assert.equal(cache.snapshot().hits, 2);
  } finally { cache.dispose(); }
});

test("native Standard/PBR/shadow first unique-Effect sweep preserves full WGSL and binding context", async t => {
  await sources();
  const corpus = await captureCorpus(); t.after(() => corpus.dispose());
  const reference = runner(baseline), cached = runner(processing, { enabled: true }); t.after(() => cached.dispose());
  assert.equal(corpus.length, 32); assert.equal(uniqueEffects(corpus).length, 24);
  for (const item of corpus) assert.equal(identity(cached.run(item)), identity(reference.run(item)), item.name);
  const stats = cached.cache.snapshot();
  assert.equal(stats.requests, 64); assert.equal(stats.misses, 12); assert.equal(stats.hits, 52);
  assert.equal(stats.promotions, 6); assert.equal(stats.probationEntries, 0); assert.equal(stats.residentEntries, 6);
  assert.equal(stats.entries, 6); assert.equal(stats.nodes, 19659); assert.equal(stats.operators, 5044);
  assert.equal(stats.textUnits, 1426379);
  const pbr = corpus.find((item: any) => item.shader === "pbr");
  const variant = { ...pbr, attributeKinds: { position: 3, normal: -3 } };
  assert.equal(identity(cached.run(variant)), identity(reference.run(variant)), "fresh nonfloat attribute bindings on syntax hit");
  const standard = corpus.find((item: any) => item.shader === "default");
  const fewer = { ...standard, indexParameters: { ...standard.indexParameters, maxSimultaneousLights: 2 } };
  assert.equal(identity(cached.run(fewer)), identity(reference.run(fewer)), "new include range");
});

test("LRU and each oversize budget preserve native results and never evict for an uncacheable entry", () => {
  const p = processor(), cache = lease(p, { enabled: true, maxEntries: 2 });
  try {
    for (const code of ["A;", "B;", "A;", "C;", "A;", "B;"]) assert.equal(text(processing, p, code), text(baseline, p, code));
    assert.equal(cache.snapshot().hits, 1); assert.equal(cache.snapshot().misses, 5); assert.equal(cache.snapshot().evictions, 2);
  } finally { cache.dispose(); }
  for (const [options, code] of [[{ maxNodes: 1 }, "A;"], [{ maxOperators: 1 }, "#if A && B\nA;\n#endif"], [{ maxTextUnits: 4 }, "longword;"]] as const) {
    const p = processor(), cache = lease(p, { ...options, enabled: true });
    try {
      for (let i = 0; i < 3; i++) assert.equal(text(processing, p, code), text(baseline, p, code));
      const keyTooLarge = "maxTextUnits" in options;
      assert.equal(cache.snapshot().oversized, keyTooLarge ? 3 : 2); assert.equal(cache.snapshot().entries, keyTooLarge ? 0 : 1);
      assert.equal(cache.snapshot().bypassEntries, keyTooLarge ? 0 : 1);
      assert.equal(cache.snapshot().residentEntries, 0); assert.equal(cache.snapshot().nodes, 0);
    } finally { cache.dispose(); }
  }
  const q = processor(), small = lease(q, { enabled: true, maxTextUnits: 8 });
  try { text(processing, q, "A;"); text(processing, q, "unretainable;"); text(processing, q, "A;"); text(processing, q, "A;");
    assert.equal(small.snapshot().hits, 1); assert.equal(small.snapshot().evictions, 0); assert.equal(small.snapshot().entries, 1);
  } finally { small.dispose(); }
});

test("parse and variant callback exceptions retain original identity without poisoning later contexts", t => {
  const p: any = processor(), cache = lease(p, { enabled: true }), failure = new Error("original parser clock failure");
  t.after(() => cache.dispose());
  const clock = t.mock.method(Date, "now", () => { throw failure; });
  const code = "#if A && B\nselected;\n#endif";
  assert.throws(() => text(baseline, p, code), error => error === failure);
  assert.throws(() => text(processing, p, code), error => error === failure);
  assert.equal(cache.snapshot().parseErrors, 1); assert.equal(cache.snapshot().entries, 0); clock.mock.restore();
  const callbackFailure = new Error("original callback failure");
  p.lineProcessor = () => { throw callbackFailure; };
  assert.throws(() => text(processing, p, "A;"), error => error === callbackFailure);
  p.lineProcessor = (line: string) => line;
  assert.equal(text(processing, p, "A;"), text(baseline, p, "A;"));
  text(processing, p, "A;");
  assert.equal(cache.snapshot().hits, 1);
});

test("reentrant reset and release during parsing cannot publish stale generations", t => {
  for (const mode of ["reset", "dispose", "toggle"] as const) {
    const p = processor(), cache = lease(p, { enabled: true }); let replacement: Lease | undefined, once = false;
    const now = Date.now;
    const clock = t.mock.method(Date, "now", () => {
      if (!once) { once = true; if (mode === "reset") cache.reset(); else if (mode === "dispose") { cache.dispose(); replacement = lease(p, { enabled: true }); }
        else { cache.setEnabled(false); cache.setEnabled(true); } }
      return now();
    });
    try {
      const code = "#if A && B\nselected;\n#else\nother;\n#endif";
      assert.equal(text(processing, p, code), "other;\n");
      const active = replacement ?? cache;
      assert.equal(active.snapshot().entries, 0);
      clock.mock.restore();
      const misses = Number(active.snapshot().misses);
      text(processing, p, code); assert.equal(active.snapshot().misses, misses + 1); assert.equal(active.snapshot().entries, 1);
    } finally { clock.mock.restore(); replacement?.dispose(); cache.dispose(); }
  }
});

test("reset during variant walk does not alter its output or retain the cleared tree", () => {
  const p: any = processor(), cache = lease(p, { enabled: true }); let once = false;
  p.lineProcessor = (line: string) => { if (!once) { once = true; cache.reset(); } return line; };
  try {
    assert.equal(text(processing, p, "A;\nB;"), "A;\nB;\n"); assert.equal(cache.snapshot().entries, 0);
    text(processing, p, "A;\nB;"); assert.equal(cache.snapshot().entries, 1);
  } finally { cache.dispose(); }
});

test("reentrant admission of the same key during parsing or freezing cannot double-account retained syntax", t => {
  for (const trigger of ["parse", "freeze"] as const) {
    const p = processor(), q = processor(), cache = lease(p, { enabled: true, maxEntries: 1 }), reference = lease(q, { enabled: true, maxEntries: 1 });
    const code = trigger === "parse" ? "#if A && B\nselected;\n#else\nother;\n#endif" : "one;\ntwo;";
    if (trigger === "freeze") { text(processing, p, code); text(processing, q, code); }
    let once = false;
    const reenter = () => { if (!once) { once = true; text(processing, p, code); } };
    const now = Date.now, freeze = Object.freeze;
    const hook = trigger === "parse" ? t.mock.method(Date, "now", () => { reenter(); return now(); })
      : t.mock.method(Object, "freeze", ((value: any) => { if (Array.isArray(value)) reenter(); return freeze(value); }) as typeof Object.freeze);
    try {
      const result = text(processing, p, code); hook.mock.restore();
      assert.equal(result, text(processing, q, code)); assert.ok(once);
      const actual = cache.snapshot(), expected = reference.snapshot();
      assert.equal(actual.requests, trigger === "freeze" ? 3 : 2); assert.equal(actual.misses, trigger === "freeze" ? 3 : 2); assert.equal(actual.entries, 1);
      for (const key of ["sourceUnits", "nodeStringUnits", "textUnits", "nodes", "operators"])
        assert.equal(actual[key], expected[key], trigger + ": " + key);
      text(processing, p, "replacement;"); text(processing, q, "replacement;");
      assert.equal(cache.snapshot().evictions, 1);
      for (const key of ["sourceUnits", "nodeStringUnits", "textUnits", "nodes", "operators"])
        assert.equal(cache.snapshot()[key], reference.snapshot()[key], "no phantom retained totals after eviction");
    } finally { hook.mock.restore(); cache.dispose(); reference.dispose(); }
  }
});

test("nonprimitive prepared input keeps native parsing without identity-keyed stale syntax", () => {
  let body = "first;";
  const boxed: any = new String(""); boxed.split = () => body.split("\n");
  const p = { ...processor(), preProcessor: () => boxed }, cache = lease(p, { enabled: true });
  try {
    for (body of ["first;", "second;"]) assert.equal(text(processing, p, "ignored;"), text(baseline, p, "ignored;"));
    assert.equal(cache.snapshot().requests, 0); assert.equal(cache.snapshot().entries, 0);
  } finally { cache.dispose(); }
});

test("unknown native node shape is processed without admission or misleading oversized accounting", t => {
  const p = processor(), cache = lease(p, { enabled: true }), getPrototypeOf = Object.getPrototypeOf;
  t.after(() => cache.dispose());
  text(processing, p, "one;\ntwo;");
  const hook = t.mock.method(Object, "getPrototypeOf", ((value: any) => value && Array.isArray(value.children) ? {} : getPrototypeOf(value)) as typeof Object.getPrototypeOf);
  try { assert.equal(text(processing, p, "one;\ntwo;"), text(baseline, p, "one;\ntwo;")); }
  finally { hook.mock.restore(); }
  assert.equal(cache.snapshot().entries, 1); assert.equal(cache.snapshot().oversized, 0); assert.equal(cache.snapshot().unsupported, 1);
  assert.equal(cache.snapshot().bypassEntries, 1);
  text(processing, p, "one;\ntwo;"); assert.equal(cache.snapshot().unsupported, 2); assert.equal(cache.snapshot().residentEntries, 0);
  cache.reset(); text(processing, p, "one;\ntwo;"); text(processing, p, "one;\ntwo;"); assert.equal(cache.snapshot().residentEntries, 1);
});

test("probation, resident and bypass keys share the same entry/text budgets and LRU", () => {
  const p = processor(), cache = lease(p, { enabled: true, maxEntries: 2, maxTextUnits: 8 });
  try {
    text(processing, p, "A;"); text(processing, p, "B;");
    assert.equal(cache.snapshot().probationEntries, 2); assert.equal(cache.snapshot().sourceUnits, 4); assert.equal(cache.snapshot().nodes, 0);
    text(processing, p, "A;"); text(processing, p, "C;");
    assert.equal(cache.snapshot().residentEntries, 1); assert.equal(cache.snapshot().probationEntries, 1); assert.equal(cache.snapshot().entries, 2);
    text(processing, p, "C;"); assert.equal(cache.snapshot().textUnits, 8); assert.equal(cache.snapshot().residentEntries, 2);
    text(processing, p, "D;");
    assert.equal(cache.snapshot().textUnits, 6); assert.equal(cache.snapshot().residentEntries, 1); assert.equal(cache.snapshot().probationEntries, 1);
    assert.equal(cache.snapshot().peakEntries, 2); assert.ok(Number(cache.snapshot().peakTextUnits) <= 8);
  } finally { cache.dispose(); }
});

test("oversized bypass marker skips repeated census but still runs native parse and walk", t => {
  let probes = 0, calls = 0;
  const p = { ...processor(), lineProcessor: (line: string) => { calls++; return line; } }, cache = lease(p, { enabled: true, maxNodes: 1 });
  t.after(() => cache.dispose());
  const original = Object.getPrototypeOf;
  const hook = t.mock.method(Object, "getPrototypeOf", ((value: any) => { if (value && Array.isArray(value.children)) probes++; return original(value); }) as typeof Object.getPrototypeOf);
  try {
    text(processing, p, "A;"); assert.equal(probes, 0); assert.equal(calls, 1);
    text(processing, p, "A;"); assert.ok(probes > 0); const before = probes;
    text(processing, p, "A;"); assert.equal(probes, before); assert.equal(calls, 3);
    const stats = cache.snapshot(); assert.equal(stats.bypasses, 1); assert.equal(stats.promotionSkips, 1);
    assert.equal(stats.bypassEntries, 1); assert.equal(stats.nodes, 0); assert.equal(stats.sourceUnits, 2);
  } finally { hook.mock.restore(); }
});

test("reentrant eviction/refill cannot promote a retired probation entry", t => {
  const p = processor(), cache = lease(p, { enabled: true, maxEntries: 1 }), code = "#if A && B\nselected;\n#else\nother;\n#endif";
  t.after(() => cache.dispose()); text(processing, p, code);
  let once = false; const now = Date.now;
  const hook = t.mock.method(Date, "now", () => { if (!once) { once = true; text(processing, p, "B;"); text(processing, p, "C;"); } return now(); });
  try { assert.equal(text(processing, p, code), "other;\n"); } finally { hook.mock.restore(); }
  const stats = cache.snapshot(); assert.equal(stats.entries, 1); assert.equal(stats.sourceUnits, 2); assert.equal(stats.promotions, 0);
  assert.equal(stats.probationEntries, 1); text(processing, p, "C;"); assert.equal(cache.snapshot().residentEntries, 1);
});

test("nested same-key calls can publish one resident without outer duplicate promotion", t => {
  const p = processor(), cache = lease(p, { enabled: true }), code = "#if A && B\nselected;\n#else\nother;\n#endif";
  t.after(() => cache.dispose()); let once = false; const now = Date.now;
  const hook = t.mock.method(Date, "now", () => { if (!once) { once = true; text(processing, p, code); text(processing, p, code); } return now(); });
  try { assert.equal(text(processing, p, code), "other;\n"); } finally { hook.mock.restore(); }
  assert.equal(cache.snapshot().entries, 1); assert.equal(cache.snapshot().residentEntries, 1); assert.equal(cache.snapshot().promotions, 1);
  assert.equal(cache.snapshot().sourceUnits, code.length);
});
