import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createOutdoorArtifacts } from "../client/outdoor-artifacts";
import { buildOutdoorArtifactPlan } from "../shared/outdoor-artifacts";
import type {
  OutdoorArtifact,
  OutdoorArtifactPart,
  OutdoorArtifactPlan,
} from "../shared/outdoor-artifacts";

function artifact(
  id: string,
  kind: string,
  x: number,
  z: number,
): OutdoorArtifact {
  return {
    id,
    kind,
    x,
    z,
    name: id,
    source: `https://www.openstreetmap.org/node/${id}`,
    yaw: 0,
    points: [[x, z]],
    tags: {},
    osmId: id,
    osmType: "node",
    positionEvidence: "test-fixture",
    orientationEvidence: "test-fixture",
    dimensionsEvidence: "test-fixture",
    nearbyTreeOsmIds: [],
  };
}

function triangle(
  object: OutdoorArtifact,
  material: OutdoorArtifactPart["material"],
  y: number,
  lod?: "both" | "near",
): OutdoorArtifactPart {
  return {
    artifactId: object.id,
    material,
    lod,
    positions: [
      object.x,
      y,
      object.z,
      object.x + 1,
      y,
      object.z,
      object.x,
      y + 1,
      object.z,
    ],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2],
    uvs: [0, 0, 1, 0, 0, 1],
  };
}

function fixture(): OutdoorArtifactPlan {
  const bench = artifact("bench", "bench", 10, 20);
  const distant = artifact("distant", "bench", 500, 20);
  const tower = artifact("tower", "tower", 1000, 20);
  return {
    artifacts: [bench, distant, tower],
    audit: [],
    parts: [
      triangle(bench, "outdoor-wood", 3),
      triangle(bench, "outdoor-wood", 5, "both"),
      triangle(bench, "outdoor-galvanized", 4, "near"),
      triangle(distant, "outdoor-wood", 3),
      triangle(tower, "outdoor-ivory", 30),
    ],
    colliders: [
      {
        artifactId: bench.id,
        x: bench.x,
        y: 3.5,
        z: bench.z,
        w: 1,
        h: 1,
        d: 1,
        yaw: 0,
      },
    ],
    stats: {
      artifactCount: 3,
      triangleCount: 5,
      colliderCount: 1,
      byKind: { bench: 2, tower: 1 },
    },
  };
}

function point(
  mesh: ReturnType<typeof createOutdoorArtifacts>["meshes"][number],
  index = 0,
) {
  mesh.computeWorldMatrix(true);
  return Vector3.TransformCoordinates(
    Vector3.FromArray(mesh.getVerticesData("position")!, index * 3),
    mesh.getWorldMatrix(),
  );
}

test("outdoor parts batch only inside one artifact/material/LOD and preserve shared world geometry", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const plan = fixture(),
    snapshot = JSON.stringify(plan);
  const controller = createOutdoorArtifacts(scene, plan);
  try {
    assert.equal(controller.meshes.length, 4);
    assert.equal(controller.assetRoots.length, 3);
    assert.equal(controller.stats.nearTriangles, 5);
    assert.equal(controller.stats.farTriangles, 4);
    const batch = controller.meshes.find(
      (mesh) => mesh.name === "outdoor-artifact:bench:outdoor-wood:both",
    )!;
    assert.deepEqual(Array.from(batch.getIndices()!), [0, 1, 2, 3, 4, 5]);
    assert.equal(batch.sideOrientation, 1);
    assert.ok(point(batch).equalsWithEpsilon(new Vector3(10, 3, 20), 1e-6));
    assert.ok(point(batch, 3).equalsWithEpsilon(new Vector3(10, 5, 20), 1e-6));
    const benchRoot = controller.assetRoots.find(
      (root) => root.metadata.artifactId === "bench",
    )!;
    assert.equal(
      benchRoot.metadata.provenance.source,
      plan.artifacts[0].source,
    );
    const own = controller.meshes.filter((mesh) => mesh.parent === benchRoot);
    const other = controller.meshes.filter((mesh) => mesh.parent !== benchRoot);
    const before = own.map((mesh) => point(mesh)),
      otherBefore = other.map((mesh) => point(mesh));
    benchRoot.position.x += 3.25;
    benchRoot.position.z -= 2.5;
    own.forEach((mesh, i) =>
      assert.ok(
        point(mesh)
          .subtract(before[i])
          .equalsWithEpsilon(new Vector3(3.25, 0, -2.5), 1e-6),
      ),
    );
    other.forEach((mesh, i) =>
      assert.ok(point(mesh).equalsWithEpsilon(otherBefore[i], 1e-6)),
    );
    assert.equal(
      JSON.stringify(plan),
      snapshot,
      "render parenting must not alter collider coordinates or source geometry",
    );
    assert.ok(
      controller.meshes.every(
        (mesh) =>
          mesh.material instanceof PBRMaterial && mesh.material.alpha === 1,
      ),
    );
    assert.ok(
      controller.meshes.every(
        (mesh) => mesh.metadata.assetKey === mesh.parent!.metadata.key,
      ),
    );
  } finally {
    controller.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("outdoor visibility has detail hysteresis and quality ranges while the tower stays on the skyline", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const plan = fixture(),
    snapshot = JSON.stringify(plan),
    controller = createOutdoorArtifacts(scene, plan);
  const bench = controller.assetRoots.find(
    (root) => root.metadata.artifactId === "bench",
  )!;
  const tower = controller.assetRoots.find(
    (root) => root.metadata.artifactId === "tower",
  )!;
  const near = controller.meshes.find(
    (mesh) =>
      mesh.metadata.artifactId === "bench" && mesh.metadata.lod === "near",
  )!;
  try {
    assert.equal(near.isEnabled(), false);
    controller.update(10, 20, "low");
    assert.equal(near.isEnabled(), true);
    assert.equal(controller.stats.visibleArtifacts, 2);
    controller.update(70, 20, "low");
    assert.equal(
      near.isEnabled(),
      true,
      "small movement over the entry threshold retains detail",
    );
    controller.update(110, 20, "low");
    assert.equal(near.isEnabled(), false);
    assert.equal(bench.isEnabled(), true);
    controller.update(240, 20, "low");
    assert.equal(bench.isEnabled(), false);
    controller.update(240, 20, "high");
    assert.equal(bench.isEnabled(), true);
    controller.update(-10000, -10000, "low");
    assert.equal(
      tower.isEnabled(),
      true,
      "distant tower is never culled as ordinary street furniture",
    );
    assert.equal(controller.stats.visibleArtifacts, 1);
    assert.equal(controller.stats.enabledMeshes, 1);
    assert.equal(controller.stats.enabledTriangles, 1);
    assert.equal(
      JSON.stringify(plan),
      snapshot,
      "quality changes only render eligibility",
    );
  } finally {
    controller.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("outdoor resources remain scene-owned and explicit or scene disposal is idempotent", () => {
  const engine = new NullEngine(),
    firstScene = new Scene(engine),
    secondScene = new Scene(engine);
  const foreign = new PBRMaterial("unrelated", firstScene);
  const baselineTextures = [...firstScene.textures];
  const first = createOutdoorArtifacts(firstScene, fixture());
  const second = createOutdoorArtifacts(secondScene, fixture());
  assert.notEqual(first.meshes[0].material, second.meshes[0].material);
  first.dispose();
  first.dispose();
  first.update(0, 0, "high");
  assert.equal(firstScene.meshes.length, 0);
  assert.equal(firstScene.transformNodes.length, 0);
  assert.deepEqual(firstScene.materials, [foreign]);
  assert.deepEqual(
    firstScene.textures,
    baselineTextures,
    "retain the scene BRDF lookup shared by the unrelated PBR material",
  );
  assert.ok(second.meshes.every((mesh) => !mesh.isDisposed()));
  secondScene.dispose();
  assert.ok(second.meshes.every((mesh) => mesh.isDisposed()));
  assert.equal(second.stats.enabledMeshes, 0);
  second.dispose();
  firstScene.dispose();
  engine.dispose();
});

test("unknown outdoor identities fail before allocating any scene resources", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    plan = fixture();
  plan.parts[1].artifactId = "missing";
  assert.throws(
    () => createOutdoorArtifacts(scene, plan),
    /Missing outdoor artifact source/,
  );
  assert.equal(scene.meshes.length, 0);
  assert.equal(scene.transformNodes.length, 0);
  assert.equal(scene.materials.length, 0);
  scene.dispose();
  engine.dispose();
});

test("mapped inventory uploads retain the source world positions and complete triangle count", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const plan = buildOutdoorArtifactPlan(),
    controller = createOutdoorArtifacts(scene, plan);
  try {
    assert.equal(controller.stats.nearTriangles, plan.stats.triangleCount);
    assert.equal(controller.assetRoots.length, plan.artifacts.length);
    for (const mesh of controller.meshes) {
      const matching = plan.parts.filter(
        (part) =>
          part.artifactId === mesh.metadata.artifactId &&
          `outdoor-artifacts:${part.material}` === mesh.material!.name &&
          (part.lod ?? "both") === mesh.metadata.lod,
      );
      let vertexOffset = 0;
      for (const source of matching) {
        for (const i of [0, source.positions.length / 3 - 1]) {
          assert.ok(
            point(mesh, vertexOffset + i).equalsWithEpsilon(
              Vector3.FromArray(source.positions, i * 3),
              0.0001,
            ),
            `${mesh.name} must match the shared physical plan within 0.1 mm`,
          );
        }
        vertexOffset += source.positions.length / 3;
      }
      assert.equal(mesh.getTotalVertices(), vertexOffset);
    }
  } finally {
    controller.dispose();
    scene.dispose();
    engine.dispose();
  }
});
