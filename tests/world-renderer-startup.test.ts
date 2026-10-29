import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Geometry } from "@babylonjs/core/Meshes/geometry";
import type { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
  buildWorld,
  createWorldBuildJob,
  type WorldBuildContext,
  type WorldBuildResult,
} from "../client/world-renderer";
import type { WorldBuildPhaseTiming } from "../client/world-build-stages";

// Real world geometry/material/controller factories, with the same primitive
// factory semantics as Game. NullEngine does not validate canvas texture pixels.
function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const materials = new Map<string, StandardMaterial>();
  const labels: unknown[] = [];
  const mat = (color: string) => {
    let material = materials.get(color);
    if (!material) {
      material = new StandardMaterial("m" + color, scene);
      material.diffuseColor = Color3.FromHexString(color);
      material.specularColor = new Color3(0.08, 0.08, 0.08);
      materials.set(color, material);
    }
    return material;
  };
  const context: WorldBuildContext = {
    scene,
    mat,
    staticMeshes: new Map(),
    huntMeshes: [],
    clouds: [],
    lights: [],
    box(name, x, y, z, w, h, d, color, staticGroup = true, yaw = 0) {
      const mesh = MeshBuilder.CreateBox(
        name,
        { width: w, height: h, depth: d },
        scene,
      );
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      const material = mat(color);
      mesh.material = material;
      if (staticGroup) {
        const group = context.staticMeshes.get(material) ?? [];
        group.push(mesh);
        context.staticMeshes.set(material, group);
      }
      return mesh;
    },
    sphere(name, x, y, z, size, color) {
      const mesh = MeshBuilder.CreateSphere(
        name,
        { diameter: size, segments: 6 },
        scene,
      );
      mesh.position.set(x, y, z);
      mesh.material = mat(color);
      return mesh;
    },
    label(text, x, y, z, width = 4) {
      labels.push({ text, x, y, z, width });
    },
    polygonBuilding() {
      throw new Error(
        "Modern authored world unexpectedly requested legacy polygonBuilding",
      );
    },
  };
  return {
    engine,
    scene,
    context,
    labels,
    dispose: () => {
      scene.dispose();
      engine.dispose();
    },
  };
}

function snapshot(value: ReturnType<typeof fixture>, result: WorldBuildResult) {
  const { scene } = value;
  const geometryHashes = new Map<Geometry, string>();
  const geometryHash = (geometry: Geometry | null) => {
    if (!geometry) return null;
    let result = geometryHashes.get(geometry);
    if (result) return result;
    const hash = createHash("sha256");
    for (const kind of geometry.getVerticesDataKinds().sort()) {
      hash.update(kind);
      const data = Float64Array.from(geometry.getVerticesData(kind) ?? []);
      hash.update(Buffer.from(data.buffer));
    }
    const indices = Float64Array.from(geometry.getIndices() ?? []);
    result = hash.update(Buffer.from(indices.buffer)).digest("hex");
    geometryHashes.set(geometry, result);
    return result;
  };
  const materialIndex = new Map<Material, number>(
    scene.materials.map((material, index) => [material, index]),
  );
  const evidence = (metadata: Record<string, unknown> | null) =>
    Object.fromEntries(
      [
        "worldAsset",
        "key",
        "assetKey",
        "sourceId",
        "sourceOrigin",
        "sourcePack",
        "provenance",
        "shadowCaster",
        "depthCaster",
        "artStatic",
        "building",
        "block",
        "kind",
        "b6Fallback",
        "canonicalFaceFactory",
      ]
        .filter((key) => metadata?.[key] !== undefined)
        .map((key) => [key, metadata![key]]),
    );
  return {
    meshes: scene.meshes.map((mesh) => ({
      name: mesh.name,
      class: mesh.getClassName(),
      parent: mesh.parent?.name ?? null,
      matrix: mesh.computeWorldMatrix(true).asArray(),
      enabled: mesh.isEnabled(false),
      visible: mesh.isVisible,
      geometry: geometryHash(
        mesh instanceof Mesh
          ? mesh.geometry
          : mesh instanceof InstancedMesh
            ? mesh.sourceMesh.geometry
            : null,
      ),
      material: mesh.material ? materialIndex.get(mesh.material) : null,
      subMeshes: mesh.subMeshes?.map(
        ({
          materialIndex,
          indexStart,
          indexCount,
          verticesStart,
          verticesCount,
        }) => [
          materialIndex,
          indexStart,
          indexCount,
          verticesStart,
          verticesCount,
        ],
      ),
      metadata: evidence(mesh.metadata),
    })),
    roots: scene.transformNodes.map((node) => ({
      name: node.name,
      parent: node.parent?.name ?? null,
      matrix: node.computeWorldMatrix(true).asArray(),
      metadata: evidence(node.metadata),
    })),
    materials: scene.materials.map((material) => ({
      name: material.name,
      class: material.getClassName(),
      alpha: material.alpha,
      backFaceCulling: material.backFaceCulling,
      diffuse:
        material instanceof StandardMaterial
          ? material.diffuseColor.asArray()
          : null,
      specular:
        material instanceof StandardMaterial
          ? material.specularColor.asArray()
          : null,
      albedo:
        material instanceof PBRMaterial ? material.albedoColor.asArray() : null,
      roughness: material instanceof PBRMaterial ? material.roughness : null,
      metallic: material instanceof PBRMaterial ? material.metallic : null,
      parts:
        material instanceof MultiMaterial
          ? material.subMaterials.map((part) =>
              part ? materialIndex.get(part) : null,
            )
          : null,
    })),
    lights: scene.lights.map((light) => ({
      name: light.name,
      enabled: light.isEnabled(),
      intensity: light.intensity,
    })),
    labels: value.labels,
    hunt: value.context.huntMeshes.map((mesh) => mesh.name),
    result: {
      keys: Object.keys(result),
      b6Fallback: result.b6Fallback.name,
      b6Root: result.b6Root.name,
      architecture: result.architecture?.metrics,
      landmarks: result.landmarks?.metrics,
      campus: result.campusExterior?.stats,
      outdoor: result.outdoorArtifacts?.stats,
    },
  };
}

function disposeControllers(result: WorldBuildResult | undefined) {
  result?.outdoorArtifacts?.dispose();
  result?.campusExterior?.dispose();
  result?.landmarks?.dispose();
  result?.architecture?.dispose();
}

test(
  "scheduled construction preserves the real synchronous world geometry, materials, identity, labels and controller output",
  { timeout: 60000 },
  async (t) => {
    const sync = fixture();
    let staged: ReturnType<typeof fixture> | undefined;
    const timings: WorldBuildPhaseTiming[] = [];
    let syncResult: WorldBuildResult | undefined,
      stagedResult: WorldBuildResult | undefined;
    try {
      syncResult = buildWorld(sync.context);
      const expected = structuredClone(snapshot(sync, syncResult));
      // Keep the immutable digest/transform snapshot, not two full worlds, while
      // the scheduler parity scene is built alongside the rest of the test suite.
      disposeControllers(syncResult);
      syncResult = undefined;
      sync.dispose();
      staged = fixture();
      const job = createWorldBuildJob(staged.context, {
        sliceBudgetMs: 4,
        onPhase: (timing) => timings.push(timing),
      });
      const run = job.run();
      assert.equal(job.run(), run);
      stagedResult = await run;
      const actual = snapshot(staged, stagedResult);
      for (const key of [
        "meshes",
        "roots",
        "materials",
        "lights",
        "labels",
        "hunt",
      ] as const) {
        assert.equal(actual[key].length, expected[key].length, `${key} count`);
        for (let i = 0; i < actual[key].length; i++)
          assert.deepEqual(actual[key][i], expected[key][i], `${key}[${i}]`);
      }
      assert.deepEqual(actual.result, expected.result);
      assert.equal(staged.context.staticMeshes.size, 0);
      assert.deepEqual(
        timings
          .map((timing) =>
            timing.phase.startsWith("streets-") ? "streets" : timing.phase,
          )
          .filter(
            (phase, index, phases) =>
              index === 0 || phase !== phases[index - 1],
          ),
        [
          "campus-plan",
          "terrain",
          "landcover",
          "streets",
          "road-details",
          "reality-ground",
          "architecture",
          "foundations",
          "b6-structure",
          "b6-stairs",
          "b6-labels",
          "landmarks",
          "campus-exterior",
          "outdoor-artifacts",
          "place-labels",
          "hunt",
          "static-merge",
          "material-finish",
        ],
      );
      assert.ok(timings.every((timing) => timing.outcome === "complete"));
      assert.ok(
        timings.find((timing) => timing.phase === "b6-structure")!.operations >
          3,
      );
      t.diagnostic(
        JSON.stringify({
          scope: "NullEngine CPU smoke, not production/GPU timing",
          atomicOperationsOver10Ms: timings
            .filter((timing) => timing.maxOperationMs > 10)
            .map(({ phase, maxOperation, maxOperationMs }) => ({
              phase,
              maxOperation,
              maxOperationMs: Math.round(maxOperationMs),
            })),
        }),
      );
      const before = staged.scene.meshes.length;
      job.cancel();
      assert.equal(
        staged.scene.meshes.length,
        before,
        "successful job transferred ownership to its host",
      );
    } finally {
      disposeControllers(syncResult);
      disposeControllers(stagedResult);
      sync.dispose();
      staged?.dispose();
    }
  },
);

test(
  "aborted construction releases completed controllers but preserves foreign scene objects until host disposal",
  { timeout: 30000 },
  async () => {
    const host = fixture(),
      abort = new AbortController();
    const foreign = MeshBuilder.CreateBox(
      "host-owned foreign object",
      {},
      host.scene,
    );
    let architectureMeshes: Mesh[] = [];
    try {
      const job = createWorldBuildJob(host.context, {
        signal: abort.signal,
        onPhase: (timing) => {
          if (timing.phase !== "architecture") return;
          architectureMeshes = host.scene.meshes.filter(
            (mesh): mesh is Mesh =>
              mesh instanceof Mesh &&
              mesh.metadata?.sourcePack === "architecture-reality",
          );
          abort.abort();
        },
      });
      await assert.rejects(job.run(), { name: "AbortError" });
      assert.ok(architectureMeshes.length > 0);
      assert.ok(architectureMeshes.every((mesh) => mesh.isDisposed()));
      assert.equal(foreign.isDisposed(), false);
      assert.equal(host.scene.isDisposed, false);
      job.cancel();
      host.scene.dispose();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(host.scene.meshes.length, 0);
    } finally {
      host.dispose();
    }
  },
);

test("disposing a host with a queued first task cancels it without a late write", async () => {
  const host = fixture();
  const pending = new Set<() => void>();
  let stale: (() => void) | undefined;
  const job = createWorldBuildJob(host.context, {
    scheduleTask: (callback) => {
      stale = callback;
      pending.add(callback);
      return () => {
        pending.delete(callback);
      };
    },
  });
  const run = job.run();
  host.scene.dispose();
  await assert.rejects(run, { name: "AbortError" });
  assert.equal(pending.size, 0);
  stale?.();
  await Promise.resolve();
  assert.equal(host.scene.meshes.length, 0);
  assert.equal(host.context.staticMeshes.size, 0);
  host.dispose();
});

test(
  "failure after a returned controller cleans it and retains the original exception",
  { timeout: 30000 },
  async () => {
    const host = fixture();
    const failure = new Error("host material factory failure");
    const original = host.context.mat;
    let armed = false;
    host.context.mat = (color) => {
      if (armed && color === "#797c75") throw failure;
      return original(color);
    };
    try {
      await assert.rejects(
        createWorldBuildJob(host.context, {
          onPhase: (phase) => {
            if (phase.phase === "architecture") armed = true;
          },
        }).run(),
        (error) => error === failure,
      );
      assert.equal(armed, true);
      assert.equal(
        host.scene.meshes.some(
          (mesh) => mesh.metadata?.sourcePack === "architecture-reality",
        ),
        false,
      );
      assert.equal(host.scene.isDisposed, false);
    } finally {
      host.dispose();
    }
  },
);
