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
