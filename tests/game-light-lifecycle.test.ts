import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import {
  StandardMaterial,
  StandardMaterialDefines,
} from "@babylonjs/core/Materials/standardMaterial";
import { PrepareDefinesForLights } from "@babylonjs/core/Materials/materialHelper.functions";
import { StableLightState } from "../client/stable-light-state";
import { GltfLightBudget } from "../client/gltf-light-budget";

// Extract the production lifecycle code instead of restating its hook calls.
// Only browser/render IO is replaced: real Babylon scene, materials, lights and
// both controllers still execute. This is a wiring/ownership test, not GPU QA.
const source = ts.createSourceFile(
  "game.ts",
  readFileSync(
    process.env.GAME_LIGHT_SOURCE ??
      new URL("../client/game.ts", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
);
const gameClass = source.statements.find(
  (node): node is ts.ClassDeclaration =>
    ts.isClassDeclaration(node) && node.name?.text === "Game",
)!;
function member(name: string) {
  const result = gameClass.members.find(
    (node) => node.name?.getText(source) === name,
  );
  assert.ok(result, `Game.${name} must exist`);
  return result;
}
function findNodes<T extends ts.Node>(
  node: ts.Node,
  predicate: (node: ts.Node) => node is T,
) {
  const result: T[] = [];
  function visit(node: ts.Node) {
    if (predicate(node)) result.push(node);
    node.forEachChild(visit);
  }
  visit(node);
  return result;
}
function compile(body: string, environment: Record<string, unknown> = {}) {
  const compiled = ts.transpileModule(`function run() { ${body} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Script(`(function(environment) {
    const { Scene, StableLightState, GltfLightBudget, window, document, sessionDiagnostics } = environment;
    ${compiled}
    return run;
  })`).runInThisContext()({
    Scene,
    StableLightState,
    GltfLightBudget,
    ...environment,
  });
}
function fixture(t: import("node:test").TestContext) {
  const engine = new NullEngine();
  const game = { engine } as {
    engine: NullEngine;
    scene: Scene;
    stableLights: StableLightState;
    gltfLightBudget: GltfLightBudget;
    disposed: boolean;
  };
  t.after(() => {
    game.stableLights?.dispose();
    game.gltfLightBudget?.dispose();
    game.scene?.dispose();
    engine.dispose();
  });
  const constructor = gameClass.members.find(ts.isConstructorDeclaration)!;
  const statements = [...constructor.body!.statements];
  const sceneAt = statements.findIndex((node) =>
    node.getText(source).startsWith("this.scene = new Scene("),
  );
  const stableAt = statements.findIndex((node) =>
    node
      .getText(source)
      .startsWith("this.stableLights = new StableLightState("),
  );
  const budgetAt = statements.findIndex((node) =>
    node
      .getText(source)
      .startsWith("this.gltfLightBudget = new GltfLightBudget("),
  );
  assert.equal(
    budgetAt,
    sceneAt + 1,
    "capture budgets before world/loaders/materials",
  );
  assert.equal(
    stableAt,
    budgetAt + 1,
    "one order controller belongs to this scene",
  );
  compile(
    statements
      .slice(sceneAt, stableAt + 1)
      .map((node) => node.getText(source))
      .join("\n"),
  ).call(game);
  assert.ok(game.stableLights instanceof StableLightState);
  assert.ok(game.gltfLightBudget instanceof GltfLightBudget);
  return game;
}

test("Game installs one scene-owned budget/order pair before world creation", (t) => {
  const game = fixture(t);
  const material = new StandardMaterial("later world material", game.scene);
  game.gltfLightBudget.update();
  assert.equal(material.maxSimultaneousLights, 4);
  assert.equal(game.gltfLightBudget.stats.trackedMaterials, 1);
  assert.throws(() => new GltfLightBudget(game.scene), /already owns/);
});

test("both production render callsites canonicalize actual light slots before drawing", (t) => {
  const game = fixture(t);
  const ambient = new HemisphericLight("ambient", Vector3.Up(), game.scene);
  const lamp = new PointLight("lamp", Vector3.Zero(), game.scene);
  const mesh = MeshBuilder.CreateBox("receiver", {}, game.scene);
  mesh.material = new StandardMaterial("receiver", game.scene);
  const defines = () => {
    const result = new StandardMaterialDefines();
    PrepareDefinesForLights(game.scene, mesh, result, true, 4);
    return result.toString();
  };
  game.stableLights.update();
  const canonical = defines();
  const contributors = mesh.lightSources.map((light) => light.uniqueId).sort();
  const calls = findNodes(
    gameClass,
    (node): node is ts.CallExpression =>
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "this.scene.render",
  );
  assert.equal(
    calls.length,
    2,
    "cover preload and gameplay; new render sites need explicit review",
  );
  for (const call of calls) {
    const statement = call.parent;
    assert.ok(ts.isExpressionStatement(statement));
    assert.ok(ts.isBlock(statement.parent));
    const siblings = [...statement.parent.statements];
    const before = siblings[siblings.indexOf(statement) - 1];
    const budget = siblings[siblings.indexOf(statement) - 2];
    assert.equal(before?.getText(source), "this.stableLights.update();");
    assert.equal(
      budget?.getText(source),
      "this.gltfLightBudget.prepareFrame();",
    );
    // Toggle the first canonical light off/on: Babylon appends it to the end.
    const first = mesh.lightSources[0];
    first.setEnabled(false);
    first.setEnabled(true);
    assert.notEqual(
      defines(),
      canonical,
      "baseline really contains history-dependent slots",
    );
    let draws = 0;
    game.scene.render = () => {
      draws++;
      assert.equal(defines(), canonical, "draw receives canonical defines");
      assert.deepEqual(
        mesh.lightSources.map((light) => light.uniqueId).sort(),
        contributors,
      );
    };
    compile(
      `${budget.getText(source)}\n${before.getText(source)}\n${statement.getText(source)}`,
    ).call(game);
    assert.equal(draws, 1);
  }
  assert.equal(ambient.intensity, 1);
  assert.equal(lamp.intensity, 1);
  const frame = member("frame");
  const frameCalls = findNodes(frame, (node): node is ts.CallExpression =>
    ts.isCallExpression(node),
  );
  const stabilize = frameCalls.find(
    (call) => call.expression.getText(source) === "this.stableLights.update",
  )!;
  const environment = frameCalls.find(
    (call) =>
      call.expression.getText(source) === "this.updateRenderEnvironment",
  );
  assert.ok(environment && environment.end < stabilize.pos);
  const environmentCalls = findNodes(
    member("updateRenderEnvironment"),
    (node): node is ts.CallExpression => ts.isCallExpression(node),
  );
  for (const update of [
    "applyArtLighting",
    "this.vehicleLighting?.update",
    "this.flashlight?.update",
    "this.cinematic?.update",
  ]) {
    const call = environmentCalls.find(
      (node) => node.expression.getText(source) === update,
    );
    assert.ok(call, `${update} must finish before canonicalization`);
  }
});

test("actual preload callback does no controller work or render after cancellation", (t) => {
  const game = fixture(t);
  const preload = findNodes(
    member("start"),
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "preloadRender",
  )[0];
  assert.ok(preload?.initializer);
  let draws = 0;
  game.scene.render = () => {
    draws++;
  };
  const render = compile(`return ${preload.initializer.getText(source)};`).call(
    game,
  );
  render();
  const stats = { ...game.stableLights.stats };
  game.disposed = true;
  render();
  assert.equal(draws, 1);
  assert.deepEqual(game.stableLights.stats, stats);
});

test("actual Game disposal detaches controllers before scene teardown and is idempotent", (t) => {
  const game = fixture(t);
  const ambient = new HemisphericLight("ambient", Vector3.Up(), game.scene);
  game.stableLights.update();
  const disposeMethod = member("dispose") as ts.MethodDeclaration;
  const order: string[] = [];
  for (const [name, controller] of [
    ["stable", game.stableLights],
    ["budget", game.gltfLightBudget],
    ["scene", game.scene],
  ] as const) {
    const original = controller.dispose.bind(controller);
    controller.dispose = () => {
      order.push(name);
      original();
    };
  }
  const noop = Object.assign(() => {}, {
    dispose() {},
    removeEventListener() {},
  });
  const context = new Proxy(
    Object.assign(game, {
      disposed: false,
      benchmark: undefined,
      canvas: noop,
      resetDiagnosticContext: noop,
      engine: { stopRenderLoop: () => order.push("stop"), dispose() {} },
    }),
    {
      get: (object, key) =>
        Reflect.has(object, key) ? Reflect.get(object, key) : noop,
    },
  );
  const dispose = compile(
    disposeMethod
      .body!.statements.map((node) => node.getText(source))
      .join("\n"),
    {
      window: noop,
      document: noop,
      sessionDiagnostics: { event() {} },
    },
  );
  dispose.call(context);
  dispose.call(context);
  assert.deepEqual(order, ["stop", "stable", "budget", "scene"]);
  assert.equal(
    ambient.onEffectiveEnabledStateChangedObservable.observers.filter(
      (observer) => !observer._willBeUnregistered,
    ).length,
    0,
  );
  const stats = { ...game.stableLights.stats };
  game.stableLights.update();
  game.gltfLightBudget.update();
  assert.deepEqual(game.stableLights.stats, stats);
  assert.equal(game.gltfLightBudget.stats.trackedMaterials, 0);
});
