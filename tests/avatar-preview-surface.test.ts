import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import {
  AvatarPreviewModel,
  avatarPreviewMeshesReady,
} from "../client/avatar-renderer";
import { SceneTextureDiagnostics } from "../client/texture-diagnostics";
import type {
  AvatarPreviewSurface,
  PreviewShaderModule,
} from "../client/avatar-preview";
import { DEFAULT_AVATAR, type AvatarConfig } from "../shared/types";
import { applyAvatarPreset } from "../client/avatar-presets";

// Run the actual private surface factory with real Babylon/rig owners. Only
// capture the model reference to inspect buffers; no copied implementation.
const parsed = ts.createSourceFile(
  "avatar-preview.ts",
  readFileSync(new URL("../client/avatar-preview.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const declaration = parsed.statements.find(
  (statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) &&
    statement.name?.text === "createSurface",
);
assert.ok(declaration);
const compiled = ts.transpileModule(`(${declaration.getText(parsed)})`, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;

function fixture(t: TestContext) {
  const engine = new NullEngine();
  const events: { kind: string; data: any }[] = [];
  let model!: AvatarPreviewModel;
  class ObservedModel extends AvatarPreviewModel {
    constructor(scene: Scene, config: AvatarConfig) {
      super(scene, config);
      model = this;
    }
  }
  const createSurface = new Script(compiled).runInNewContext({
    Scene,
    Color3,
    Color4,
    Vector3,
    ArcRotateCamera,
    HemisphericLight,
    DirectionalLight,
    AvatarPreviewModel: ObservedModel,
    avatarPreviewMeshesReady,
    SceneTextureDiagnostics,
    performance,
    sessionDiagnostics: {
      event: (kind: string, data: unknown) => events.push({ kind, data }),
    },
  }) as (
    engine: NullEngine,
    config: AvatarConfig,
    onError: () => void,
  ) => AvatarPreviewSurface;
  const config = applyAvatarPreset(0, DEFAULT_AVATAR);
  const surface = createSurface(engine, config, () =>
    assert.fail("unexpected texture error"),
  );
  const scene = engine.scenes[0];
  t.after(() => {
    surface.dispose();
    engine.dispose();
  });
  return { engine, scene, model, config, surface, events };
}

test("actual native surface preserves old buffers across edits and skips same-value profiles", (t) => {
  const { scene, model, config, surface, events } = fixture(t);
  const before = model.rig;
  const geometries = before.skinnedBody!.near.map(
    (mesh) => (mesh as Mesh).geometry,
  );
  surface.focus("face");
  surface.rotate(0.4);
  const camera = scene.activeCamera as ArcRotateCamera;
  const angle = camera.alpha;
  surface.update({ ...config });
  assert.equal(model.rig, before);
  assert.equal(model.stats.builds, 1);
  assert.deepEqual(
    events.map((event) => event.data.phase),
    ["create"],
  );
  assert.match(
    events[0].data.scope,
    /asynchronous engine initialization excluded/,
  );
  assert.equal(camera.alpha, angle);
  surface.update({ ...config, face: 0.75, hair: "#504535" });
  assert.equal(model.stats.builds, 2);
  model.rig.skinnedBody!.near.forEach((mesh, index) => {
    assert.equal((mesh as Mesh).geometry, geometries[index]);
    assert.equal(geometries[index]!.isDisposed(), false);
  });
  assert.equal(camera.radius, 0.9, "face framing survives a changed profile");
  assert.equal(camera.alpha, angle, "orientation survives a changed profile");
  assert.equal(scene.skeletons.length, 1);
  surface.dispose();
  assert.equal(scene.isDisposed, true);
  assert.equal(scene.skeletons.length, 0);
  assert.deepEqual(
    events.map((event) => event.data.phase),
    ["create", "update", "dispose"],
  );
});

test("actual native surface checks displayed meshes and the source effects of displayed instances only", (t) => {
  const { model, surface, scene, engine } = fixture(t);
  const visible = model.rig.root
    .getChildMeshes()
    .filter(
      (mesh) => mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0,
    );
  const checked = new Set<number>();
  for (const mesh of scene.meshes)
    mesh.isReady = () => {
      checked.add(mesh.uniqueId);
      return true;
    };
  // The old all-scene/global effects gates must not compile irrelevant LODs.
  scene.isReady = () =>
    assert.fail("global scene readiness includes hidden sources");
  engine.areAllEffectsReady = () =>
    assert.fail("global effect readiness includes undisplayed variants");
  assert.equal(surface.ready(), true);
  assert.deepEqual(
    [...checked],
    visible.map((mesh) => mesh.uniqueId),
  );
  assert.ok(
    visible.some((mesh) => mesh.isAnInstance),
    "test exercises source effect ownership",
  );
  const expected = new Set<PreviewShaderModule>();
  const sources = new Set(
    visible.map((mesh) =>
      mesh.isAnInstance ? (mesh as InstancedMesh).sourceMesh : mesh,
    ),
  );
  for (const source of sources) {
    const module: PreviewShaderModule = {
      getCompilationInfo: async () => ({ messages: [] }),
    };
    expected.add(module);
    for (const subMesh of source.subMeshes ?? [])
      Object.defineProperty(subMesh, "effect", {
        configurable: true,
        get: () => ({
          getPipelineContext: () => ({
            stages: { vertexStage: { module }, fragmentStage: { module } },
          }),
        }),
      });
  }
  const hidden = new Mesh("unrelated hidden source", scene);
  hidden.isVisible = false;
  hidden.isReady = () => assert.fail("unrelated source must not be visited");
  assert.deepEqual(new Set(surface.shaderModules()), expected);
});
