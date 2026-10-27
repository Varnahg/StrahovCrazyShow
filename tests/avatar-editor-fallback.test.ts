import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { setImmediate as turn } from "node:timers/promises";
import ts from "typescript";
import { RenderFallbackSession, WebGpuInitializationError } from "../client/render-fallback";

const source = ts.createSourceFile("avatar-editor.tsx", readFileSync(new URL("../client/avatar-editor.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect: ts.CallExpression | undefined, canvasNode: ts.JsxSelfClosingElement | undefined;
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.arguments[0]?.getText(source).includes("createAvatarPreview")) effect = node;
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "canvas") canvasNode = node;
  ts.forEachChild(node, visit);
}
visit(source); assert.ok(effect && canvasNode);
const compiled = ts.transpileModule(`const runEffect = ${effect.arguments[0].getText(source)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  transformers: { before: [context => input => {
    const replace: ts.Visitor = node => ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      ? ts.factory.createCallExpression(ts.factory.createIdentifier("loadModule"), undefined, node.arguments)
      : ts.visitEachChild(node, replace, context);
    return ts.visitNode(input, replace) as ts.SourceFile;
  }] },
}).outputText;
const make = new Script(`(env => {
 const {canvas,preview,previewGeneration,currentAvatar,pointer,setPreviewStatus,setPreviewError,setRendererSelection,setRendererGeneration,requestWebGlFallback,WebGpuInitializationError,window,loadModule}=env;
 ${compiled}
 return runEffect;
})`).runInThisContext();

function fixture(search = "") {
  const session = new RenderFallbackSession();
  const location = { hostname: "example.com", search };
  const canvas = { current: {} as object }, preview = { current: null as any }, previewGeneration = { current: 0 };
  const currentAvatar = { current: { preset: 0 } }, pointer = { current: { id: 1, x: 4 } as object | null };
  const states: string[] = [], errors: string[] = [], selections: unknown[] = [], attempts: any[] = [];
  let generation = 0;
  const run = make({ canvas, preview, previewGeneration, currentAvatar, pointer, WebGpuInitializationError,
    setPreviewStatus: (value: string) => states.push(value), setPreviewError: (value: string) => errors.push(value),
    setRendererSelection: (value: unknown) => selections.push(value), setRendererGeneration: (update: (v: number) => number) => generation = update(generation),
    requestWebGlFallback: (error: unknown, value: typeof location, signal?: AbortSignal) => session.request(error, value, signal),
    window: { location }, loadModule: async () => ({ createAvatarPreview: (target: object, profile: object, options: any) => {
      let resolve!: (value: unknown) => void, reject!: (error: unknown) => void;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      attempts.push({ target, profile, options, resolve, reject }); return promise;
    } }),
  }) as () => () => void;
  return { run, canvas, preview, currentAvatar, pointer, states, errors, selections, attempts, session, location, generation: () => generation };
}
function controller() { return { disposed: 0, profiles: [] as number[], dispose() { this.disposed++; }, update(config: { preset: number }) { this.profiles.push(config.preset); } }; }

test("avatar init fallback requests a new keyed canvas and keeps the latest edited profile", async () => {
  const dependencies = effect!.arguments[1];
  assert.ok(ts.isArrayLiteralExpression(dependencies) && dependencies.elements.some(e => e.getText(source) === "rendererGeneration"));
  const key = canvasNode!.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(source) === "key") as ts.JsxAttribute;
  assert.equal(key.initializer?.getText(source), "{rendererGeneration}");
  const f = fixture(), original = f.canvas.current, cleanup = f.run(); await turn();
  f.attempts[0].reject(new WebGpuInitializationError("webgpu", "initialization-failed")); await turn();
  assert.equal(f.generation(), 1); assert.equal(f.pointer.current, null); assert.deepEqual(f.errors, [""]);
  cleanup(); f.canvas.current = {}; f.currentAvatar.current = { preset: 4 };
  const cleanupRetry = f.run(); await turn();
  assert.notEqual(f.attempts[1].target, original);
  assert.deepEqual(f.attempts[1].profile, { preset: 4 });
  assert.equal(f.session.select(f.location).backend, "webgl2");
  const selection = f.session.select(f.location), ready = controller();
  f.attempts[1].options.onRenderer(selection); f.attempts[1].options.onState("ready"); f.attempts[1].resolve(ready); await turn();
  assert.equal(f.selections.at(-1), selection); assert.equal(f.preview.current, ready); assert.deepEqual(ready.profiles, [4]);
  const stateCount = f.states.length;
  f.attempts[0].options.onState("failed", new Error("retired generation"));
  assert.equal(f.states.length, stateCount);
  cleanupRetry(); assert.equal(ready.disposed, 1); assert.equal(f.preview.current, null);
});

test("cancelled or replaced preview generations cannot request fallback or publish errors", async () => {
  for (const replace of [false, true]) {
    const f = fixture(), cleanup = f.run(); await turn();
    if (replace) f.canvas.current = {}; else cleanup();
    f.attempts[0].reject(new WebGpuInitializationError("webgpu", "unavailable")); await turn();
    assert.equal(f.generation(), 0); assert.deepEqual(f.errors, [""]);
    assert.equal(f.session.select(f.location).backend, "webgpu");
    if (replace) cleanup();
  }
});

test("strict URL, import and scene failures remain visible without an automatic backend change", async () => {
  for (const [search, error] of [
    ["?renderBackend=webgpu", new WebGpuInitializationError("webgpu", "unavailable")],
    ["", new Error("import chunk failed")], ["", new Error("shader failed")],
  ] as const) {
    const f = fixture(search), cleanup = f.run(); await turn();
    f.attempts[0].reject(error); await turn();
    assert.equal(f.generation(), 0); assert.equal(f.states.at(-1), search ? "unsupported" : "failed"); assert.equal(f.errors.at(-1), error.message);
    assert.equal(f.session.select(f.location).backend, "webgpu"); cleanup();
  }
});

test("a late controller from an old canvas is disposed without clearing the current preview", async () => {
  const f = fixture(), cleanupOld = f.run(); await turn();
  f.canvas.current = {}; const cleanupNew = f.run(); await turn();
  const old = controller(), current = controller();
  f.attempts[1].resolve(current); await turn(); f.attempts[0].resolve(old); await turn();
  assert.equal(old.disposed, 1); assert.equal(f.preview.current, current);
  cleanupOld(); assert.equal(f.preview.current, current); assert.equal(old.disposed, 1);
  cleanupNew(); assert.equal(current.disposed, 1);
});
