import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { createElement, isValidElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as quality from "../shared/render-quality";
import { GraphicsSettingsPanel, GraphicsSettingsDialog, GraphicsApplyingOverlay, editGraphicsDraft } from "../client/graphics-settings";
import { setLocale } from "../client/i18n";

const idle = { applying: false, phase: null, error: null, restartRequired: false } as const;
function elements(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement(node) ? [node, ...elements((node.props as any).children)] : [];
}
function controls(tree: any) {
  const all = elements(tree);
  return {
    preset: all.find(n => n.type === "select"),
    scale: all.find(n => n.type === "input" && n.props.type === "range"),
    switches: all.filter(n => n.type === "input" && n.props.type === "checkbox"),
    apply: all.find(n => n.type === "button" && n.props.children === "Použít"),
    cancel: all.find(n => n.type === "button" && ["Zrušit změny", "Zrušit přípravu", "Obnovuji původní grafiku…"].includes(n.props.children)),
    fieldset: all.find(n => n.type === "fieldset"),
  };
}
/** Execute the real component handlers with deterministic hook storage; no DOM/GPU substitute claims. */
function panel(props: Parameters<typeof GraphicsSettingsPanel>[0]) {
  const source = readFileSync(new URL("../client/graphics-settings.tsx", import.meta.url), "utf8");
  const slots: any[] = []; let cursor = 0, dirty = false, writes = 0;
  const effects: (() => void)[] = [];
  const react = {
    useState(initial: any) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value: any) => { const next = typeof value === "function" ? value(slots[index]) : value; if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; writes++; } }]; },
    useRef(initial: any) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useId() { return "graphics-test"; },
    useEffect(callback: () => (() => void) | void, deps: any[]) { const index = cursor++, previous = slots[index];
      if (!previous || deps.some((v, i) => !Object.is(v, previous.deps[i]))) effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: callback() }; }); },
  };
  const exports: Record<string, any> = {};
  new Script(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)
    .runInNewContext({ exports, require: (name: string) => name === "react" ? react : name === "react/jsx-runtime" ? jsxRuntime : name === "../shared/render-quality" ? quality : name === "./i18n" ? { t: (s: string) => s } : { useDialogFocus() {} } });
  let tree: any;
  const render = () => { do { dirty = false; cursor = 0; tree = exports.GraphicsSettingsPanel(props); while (effects.length) effects.shift()!(); } while (dirty); return tree; };
  render();
  return { render, controls: () => controls(render()), props, writes: () => writes, unmount: () => { for (const s of slots) s?.cleanup?.(); } };
}

test("both settings surfaces expose all presets and keep game rendering out of the form", () => {
  for (const locale of ["cs", "en"] as const) {
    setLocale(locale);
    const props = { preferences: quality.createRenderPreferences("ultra"), onApply: () => true };
    const html = renderToStaticMarkup(createElement(GraphicsSettingsPanel, props));
    for (const mode of ["auto", "ultra", "low", "medium", "high", "custom"]) assert.ok(html.includes('value="' + mode + '"'));
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 5);
    assert.match(html, /min="50" max="100"/); assert.doesNotMatch(html, /<canvas/);
    const dialog = renderToStaticMarkup(createElement(GraphicsSettingsDialog, { ...props, onClose() {} }));
    assert.match(dialog, /role="dialog" aria-modal="true"/);
    assert.ok(dialog.includes(locale === "cs" ? "Ultra úsporná" : "Ultra saver"));
    const pending = renderToStaticMarkup(createElement(GraphicsApplyingOverlay, { state: { ...idle, applying: true, phase: "preparing" }, onCancel() {} }));
    assert.match(pending, /role="status"/); assert.ok(pending.includes(locale === "cs" ? "připojení zůstává aktivní" : "connection stays active"));
  }
});

test("manual edits freeze actual automatic quality, while pending draft selection has precedence", () => {
  const prefs = quality.createRenderPreferences("auto"), effective = quality.resolveVisualSettings(prefs, { quality: "low", hardwareScaling: 1.65 });
  const next = editGraphicsDraft(prefs, effective, { features: { shadows: false } });
  assert.equal(next.mode, "custom"); if (next.mode !== "custom") throw Error("Expected custom");
  assert.equal(next.quality, "low"); assert.equal(next.renderScale, 1 / 1.65); assert.equal(next.features.shadows, false);
  const high = editGraphicsDraft(quality.createRenderPreferences("high"), effective, { features: { clouds: false } });
  assert.equal(high.mode, "custom"); if (high.mode === "custom") assert.equal(high.quality, "high");
  assert.equal(editGraphicsDraft(next, effective, { renderScale: NaN }), next);
});

test("changing controls is a draft; discard and unmount do not apply it", () => {
  let calls = 0, cancelled = 0;
  const p = panel({ preferences: quality.createRenderPreferences("low"), onApply() { calls++; return true; }, onCancel() { cancelled++; } });
  p.controls().switches[0].props.onChange({ target: { checked: false } });
  assert.equal(p.controls().preset.props.value, "custom"); assert.equal(calls, 0);
  p.controls().cancel.props.onClick();
  assert.equal(p.controls().preset.props.value, "low"); assert.equal(p.controls().switches[0].props.checked, true);
  p.controls().scale.props.onChange({ target: { value: "50" } }); p.unmount();
  assert.equal(calls, 0); assert.equal(cancelled, 0);
});

test("Apply is single-flight, failure retains the draft and cancellation restores committed preferences", async () => {
  let finish!: (accepted: boolean) => void, count = 0, cancels = 0;
  const p = panel({ preferences: quality.createRenderPreferences("low"), onApply() { count++; return new Promise<boolean>(r => { finish = r; }); }, onCancel() { cancels++; } });
  p.controls().preset.props.onChange({ target: { value: "ultra" } });
  const click = p.controls().apply.props.onClick;
  const first = click(); await click(); assert.equal(count, 1); assert.equal(p.controls().fieldset.props.disabled, true);
  finish(false); await first; assert.equal(p.controls().preset.props.value, "ultra"); assert.equal(p.controls().fieldset.props.disabled, false);
  const second = p.controls().apply.props.onClick(); p.controls().cancel.props.onClick(); assert.equal(cancels, 1);
  finish(false); await second; assert.equal(p.controls().preset.props.value, "low");
});

test("unmount cancels an owned pending Apply and ignores its late continuation", async () => {
  let finish!: (accepted: boolean) => void, cancels = 0;
  const p = panel({ preferences: quality.createRenderPreferences("medium"), onApply() { return new Promise<boolean>(r => { finish = r; }); }, onCancel() { cancels++; } });
  p.controls().preset.props.onChange({ target: { value: "ultra" } });
  const pending = p.controls().apply.props.onClick(); p.unmount(); const writes = p.writes();
  finish(false); await pending; assert.equal(cancels, 1); assert.equal(p.writes(), writes);
});

function applyHandler(env: Record<string, unknown>) {
  const source = ts.createSourceFile("ui.tsx", readFileSync(new URL("../client/ui.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let apply: ts.ArrowFunction | undefined;
  const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === "applyGraphicsPreferences" && node.initializer && ts.isCallExpression(node.initializer)) apply = node.initializer.arguments[0] as ts.ArrowFunction; ts.forEachChild(node, visit); };
  visit(source); assert.ok(apply);
  return new Script(ts.transpileModule("(" + apply.getText(source) + ")", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext(env) as (p: quality.RenderPreferences) => Promise<boolean>;
}

/** Run the App's actual reader and effect, retaining React's dependency semantics. */
function preferenceStorage(initial: unknown) {
  const source = ts.createSourceFile("ui.tsx", readFileSync(new URL("../client/ui.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let reader: ts.Expression | undefined, effect: ts.CallExpression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "readRenderPreferences") reader = node.initializer;
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect") {
      const callback = node.arguments[0]?.getText(source) ?? "";
      if (callback.includes("localStorage.setItem") && callback.includes('"strahov.rendering"')) effect = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(reader); assert.ok(effect);
  const storage = new Map<string, string>([["strahov.rendering", JSON.stringify(initial)]]), writes: { key: string; value: string }[] = [];
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem(key: string, value: string) { writes.push({ key, value }); storage.set(key, value); },
  };
  const compile = (text: string) => new Script(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
  const read = compile("(" + reader.getText(source) + ")").runInNewContext({ localStorage, ...quality }) as () => quality.RenderPreferences;
  const storageEffect = compile(effect.getText(source));
  let committed = read(), previousDeps: unknown[] | undefined;
  const render = () => storageEffect.runInNewContext({ localStorage, renderPreferences: committed,
    useEffect(callback: () => void, deps: unknown[]) {
      if (!previousDeps || deps.some((value, index) => !Object.is(value, previousDeps![index]))) callback();
      previousDeps = deps;
    },
  });
  return { read, render, writes, committed: () => committed, setRenderPreferences: (next: quality.RenderPreferences) => { committed = next; } };
}

test("actual App storage effect persists and reloads every accepted Ultra and Custom preference", async () => {
  const ultra = quality.createRenderPreferences("ultra", 120);
  const custom: quality.RenderPreferences = { version: 2, mode: "custom", targetFps: 144, quality: "high", renderScale: 0.63,
    features: { shadows: false, clouds: true, groundVegetation: false, trees: "far-only", postProcesses: true } };
  for (const next of [ultra, custom]) {
    const storage = preferenceStorage({ mode: "medium", targetFps: 60 });
    assert.deepEqual(storage.read(), quality.createRenderPreferences("medium"));
    storage.render();
    const baselineWrites = storage.writes.length;
    let finish!: (accepted: boolean) => void;
    const owner = { applyRenderPreferences: () => new Promise<boolean>(resolve => { finish = resolve; }) };
    const apply = applyHandler({ game: { current: owner }, graphicsApplyOwner: { current: null }, modeRef: { current: "multi" },
      renderPreferencesRef: { current: storage.committed() }, setRenderPreferences: storage.setRenderPreferences });
    const pending = apply(next); storage.render();
    assert.equal(storage.writes.length, baselineWrites, "unconfirmed Apply cannot reach localStorage");
    finish(true); assert.equal(await pending, true); storage.render();
    assert.equal(storage.writes.length, baselineWrites + 1);
    assert.deepEqual(storage.writes.at(-1), { key: "strahov.rendering", value: JSON.stringify(next) });
    assert.deepEqual(storage.read(), next, "the actual startup reader restores all saved fields");
    storage.render(); assert.equal(storage.writes.length, baselineWrites + 1, "an unchanged render cannot write again");
  }
});

test("actual App storage effect never writes graphics drafts, rejected Apply or a retired Game result", async () => {
  const storage = preferenceStorage(quality.createRenderPreferences("low"));
  storage.render(); const baseline = [...storage.writes];
  let finish!: (accepted: boolean) => void;
  const owner = { applyRenderPreferences: () => new Promise<boolean>(resolve => { finish = resolve; }) };
  const game = { current: owner };
  const apply = applyHandler({ game, graphicsApplyOwner: { current: null }, modeRef: { current: "multi" },
    renderPreferencesRef: { current: storage.committed() }, setRenderPreferences: storage.setRenderPreferences });
  const p = panel({ preferences: storage.committed(), onApply: apply });
  p.controls().preset.props.onChange({ target: { value: "ultra" } }); storage.render();
  assert.deepEqual(storage.writes, baseline, "changing the form remains a draft");
  const rejected = p.controls().apply.props.onClick(); finish(false); await rejected; storage.render();
  assert.deepEqual(storage.writes, baseline);
  const retired = p.controls().apply.props.onClick(); game.current = { ...owner }; finish(true); await retired; storage.render();
  assert.deepEqual(storage.writes, baseline, "successful work from a replaced Game cannot persist");
  p.controls().cancel.props.onClick(); p.unmount(); storage.render();
  assert.deepEqual(storage.writes, baseline);
  assert.deepEqual(storage.read(), quality.createRenderPreferences("low"));
});

test("actual App commits preferences only after its still-current Game confirms Apply", async () => {
  const before = quality.createRenderPreferences("low"), next = quality.createRenderPreferences("ultra");
  let finish!: (v: boolean) => void; const commits: unknown[] = [];
  const owner = { applyRenderPreferences: () => new Promise<boolean>(r => { finish = r; }) };
  const game = { current: owner as typeof owner | null }, renderPreferencesRef = { current: before }, graphicsApplyOwner = { current: null };
  const apply = applyHandler({ game, renderPreferencesRef, graphicsApplyOwner, modeRef: { current: "multi" }, setRenderPreferences: (p: unknown) => commits.push(p) });
  const pending = apply(next); assert.equal(commits.length, 0); assert.equal(renderPreferencesRef.current, before);
  finish(false); assert.equal(await pending, false); assert.equal(commits.length, 0);
  const accepted = apply(next); finish(true); assert.equal(await accepted, true); assert.equal(renderPreferencesRef.current, next); assert.deepEqual(commits, [next]);
  const late = apply(before); game.current = { ...owner }; finish(true); assert.equal(await late, false); assert.deepEqual(commits, [next]);
});

test("actual App saves pre-entry preferences without constructing a Game", async () => {
  const commits: unknown[] = [], ref = { current: quality.createRenderPreferences() }, next = quality.createRenderPreferences("ultra");
  const apply = applyHandler({ game: { current: null }, renderPreferencesRef: ref, graphicsApplyOwner: { current: null }, modeRef: { current: "menu" }, setRenderPreferences: (p: unknown) => commits.push(p) });
  assert.equal(await apply(next), true); assert.equal(ref.current, next); assert.deepEqual(commits, [next]);
});


test("restoring graphics disables repeated cancellation in panel and modal overlay", () => {
  let cancels = 0;
  const state = { ...idle, applying: true, phase: "restoring" as const };
  const p = panel({ preferences: quality.createRenderPreferences("low"), state, onApply: () => false, onCancel() { cancels++; } });
  assert.equal(p.controls().cancel.props.disabled, true);
  assert.equal(p.controls().cancel.props.children, "Obnovuji původní grafiku…");
  p.controls().cancel.props.onClick();
  assert.equal(cancels, 0);
  setLocale("cs");
  const html = renderToStaticMarkup(createElement(GraphicsApplyingOverlay, { state, onCancel() { cancels++; } }));
  assert.match(html, /<button[^>]*disabled=""[^>]*>Obnovuji původní grafiku…<\/button>/);
  // Escape and click share the real modal cancellation guard.
  const source = ts.createSourceFile("graphics-settings.tsx", readFileSync(new URL("../client/graphics-settings.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler: ts.Expression | undefined, focusUsesGuard = false;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "requestCancel") handler = node.initializer;
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useDialogFocus" && node.arguments[2]?.getText(source) === "requestCancel") focusUsesGuard = true;
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(handler); assert.equal(focusUsesGuard, true);
  for (const restoring of [true, false]) {
    const cancel = new Script("(" + handler.getText(source) + ")").runInNewContext({ restoring, onCancel: () => cancels++ }) as () => void;
    cancel(); assert.equal(cancels, restoring ? 0 : 1);
  }
});
