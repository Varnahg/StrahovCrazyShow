import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { sanitizeDiagnosticsText } from "../shared/session-diagnostics";

test("actual feedback keyboard/error effect opens F8 outside text entry and releases its listeners", () => {
  const source = ts.createSourceFile(
    "ui.tsx",
    readFileSync(new URL("../client/ui.tsx", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let effect: ts.ArrowFunction | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "useEffect" &&
      ts.isArrowFunction(node.arguments[0]) &&
      node.arguments[0]
        .getText(source)
        .includes("recentFeedbackErrors.current =")
    )
      effect = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(effect);
  const listeners = new Map<string, (event: any) => void>();
  const recentFeedbackErrors = {
    current: [] as { atMs: number; kind: string; detail: string }[],
  };
  let opens = 0;
  const js = ts.transpileModule(
    "const effect=" + effect.getText(source) + "; effect();",
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const cleanup = new Script(js).runInNewContext({
    window: {
      addEventListener: (name: string, listener: (event: unknown) => void) =>
        listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    },
    recentFeedbackErrors,
    sanitizeDiagnosticsText,
    performance: { now: () => 100 },
    openFeedback: () => opens++,
  });
  const press = (patch = {}) =>
    listeners.get("keydown")!({
      code: "F8",
      repeat: false,
      defaultPrevented: false,
      target: { closest: () => null },
      preventDefault() {},
      ...patch,
    });
  press();
  press({ repeat: true });
  press({ defaultPrevented: true });
  press({ target: { closest: () => ({}) } });
  assert.equal(opens, 1);
  for (let i = 0; i < 40; i++)
    listeners.get("error")!({
      message: "Failed https://example.com/asset?token=private",
    });
  assert.equal(recentFeedbackErrors.current.length, 30);
  assert.ok(
    recentFeedbackErrors.current.every((e) => !e.detail.includes("private")),
  );
  cleanup();
  assert.equal(listeners.size, 0);
});


test("native feedback focus captures the trigger before opening and restores it after node removal", () => {
  const source = ts.createSourceFile("feedback.tsx", readFileSync(new URL("../client/feedback.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect: ts.ArrowFunction | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && ts.isArrowFunction(node.arguments[0]) && node.arguments[0].getText(source).includes("element.showModal()")) effect = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(effect);
  const js = ts.transpileModule("const effect=" + effect.getText(source) + "; effect();", { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const calls: string[] = [];
  class Element {
    isConnected = true;
    constructor(readonly name: string) {}
    focus() { calls.push(this.name); doc.activeElement = this; }
  }
  const trigger = new Element("trigger"), close = new Element("close"), description = new Element("description");
  const doc = { activeElement: trigger };
  const dialog = { current: {
    showModal() { close.focus(); },
    close() { calls.push("native-close"); },
  } };
  const cleanup = new Script(js).runInNewContext({ open: true, nativeDialog: true, dialog, description: { current: description }, document: doc, HTMLElement: Element });
  assert.equal(doc.activeElement, description);
  // Unmount can detach the description before passive effect cleanup.
  description.isConnected = false;
  cleanup();
  assert.equal(doc.activeElement, trigger);
  assert.deepEqual(calls, ["close", "description", "native-close", "trigger"]);
  calls.length = 0;
  doc.activeElement = trigger;
  const detachedCleanup = new Script(js).runInNewContext({ open: true, nativeDialog: true, dialog, description: { current: description }, document: doc, HTMLElement: Element });
  trigger.isConnected = false;
  detachedCleanup();
  assert.equal(calls.includes("trigger"), false);
});


test("actual central feedback opener retires pre-entry graphics and preserves an in-flight Apply owner", () => {
  const source = ts.createSourceFile("ui.tsx", readFileSync(new URL("../client/ui.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback: ts.ArrowFunction | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "openFeedback" && node.initializer && ts.isCallExpression(node.initializer))
      callback = node.initializer.arguments[0] as ts.ArrowFunction;
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(callback);
  for (const applying of [false, true]) {
    const state = { graphicsOpen: true, feedbackOpen: false, panel: "settings", cancelled: 0, modal: false };
    const events: string[] = [];
    const open = new Script(ts.transpileModule("(" + callback.getText(source) + ")", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({
      setGraphicsOpen(value: boolean) { state.graphicsOpen = value; events.push("graphics:" + value); },
      setFeedbackOpen(value: boolean) { state.feedbackOpen = value; events.push("feedback:" + value); },
      setJournalOpen() {}, setEmotesOpen() {}, setShowForm() {},
      setPanel(value: string) { state.panel = value; if (applying && !value) state.cancelled++; },
      graphicsStateRef: { current: { applying } },
      game: { current: { setUiModal(value: boolean) { state.modal = value; } } },
      document: { pointerLockElement: null },
    }) as () => void;
    open();
    assert.equal(state.graphicsOpen, false);
    assert.equal(state.feedbackOpen, true);
    assert.equal(state.modal, true);
    assert.deepEqual(events, ["graphics:false", "feedback:true"]);
    assert.equal(state.panel, applying ? "settings" : "");
    assert.equal(state.cancelled, 0, "feedback must not unmount/cancel a pending graphics Apply");
  }
});

test("feedback is the sole modal focus owner and current Apply state controls restoration", () => {
  const source = ts.createSourceFile("ui.tsx", readFileSync(new URL("../client/ui.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let condition: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "GraphicsApplyingOverlay") {
      assert.ok(ts.isBinaryExpression(node.parent));
      condition = node.parent.left;
    }
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(condition);
  const shown = (applying: boolean, feedbackOpen: boolean) => new Script(condition!.getText(source)).runInNewContext({ graphicsState: { applying }, feedbackOpen });
  assert.equal(shown(true, false), true, "Apply owns focus before feedback opens");
  assert.equal(shown(true, true), false, "native feedback dialog is the only focus owner");
  assert.equal(shown(true, false), true, "closing feedback restores a still-active Apply overlay");
  assert.equal(shown(false, true), false);
  assert.equal(shown(false, false), false, "a completed Apply must not regain an old overlay after feedback closes");
});


test("actual map, journal and emote shortcuts cannot replace the graphics Apply owner", () => {
  const source = ts.createSourceFile("ui.tsx", readFileSync(new URL("../client/ui.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect: ts.ArrowFunction | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && ts.isArrowFunction(node.arguments[0]) && node.arguments[0].getText(source).includes('window.addEventListener("toggle-map"')) effect = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(effect);
  for (const applying of [false, true]) {
    const listeners = new Map<string, () => void>(), changes: string[] = [];
    const graphicsStateRef = { current: { applying } };
    const cleanup = new Script(ts.transpileModule('const effect=' + effect.getText(source) + '; effect();', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({
      graphicsStateRef, graphicsApplyOwner: { current: { cancelGraphicsApply() { changes.push("cancel"); } } },
      window: { addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) },
      setPanel: () => changes.push("panel"), setJournalOpen: () => changes.push("journal"), setEmotesOpen: () => changes.push("emotes"),
      setFeedbackOpen: () => changes.push("feedback"), setShowForm: () => changes.push("form"),
    }) as () => void;
    for (const name of ["toggle-map", "toggle-journal", "toggle-emotes"]) listeners.get(name)!();
    if (applying) assert.deepEqual(changes, []);
    else { assert.ok(changes.includes("panel")); assert.ok(changes.includes("journal")); assert.ok(changes.includes("emotes")); }
    cleanup(); assert.equal(listeners.size, 0);
  }
});
