import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { loadCar, type CarModelController } from "../client/assets";
import { PARKING_SLOTS, groundHeight } from "../shared/terrain";
import { groundRotation, rotateGroundVector } from "../shared/terrain-entities";
import { CAR_SPAWN } from "../shared/world";
import type { VehicleState } from "../shared/vehicle";

async function fixture(
  run: (models: CarModelController, scene: Scene) => void,
  sourceParking?: boolean,
) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const models = await loadCar(scene, {
    assetSource: new Uint8Array(
      readFileSync(
        new URL("../public/models/strahov-compact.glb", import.meta.url),
      ),
    ),
    sourceParking,
  });
  try {
    run(models, scene);
  } finally {
    models.dispose();
    scene.dispose();
    engine.dispose();
  }
}
function state(overrides: Partial<VehicleState> = {}): VehicleState {
  const position = { x: 0, y: 0, z: 0 },
    rotation = { x: 0, y: 0, z: 0, w: 1 },
    zero = { x: 0, y: 0, z: 0 };
  return {
    id: "campus-car",
    driverId: null,
    parked: true,
    parking: { position, rotation },
    position,
    rotation,
    linvel: zero,
    angvel: zero,
    steering: 0,
    wheelSpin: [0, 0, 0, 0],
    wheelSuspension: [0.25, 0.25, 0.25, 0.25],
    wheelContact: [false, false, false, false],
    force: zero,
    torque: zero,
    sleeping: false,
    ...overrides,
  };
}
function worldMatrices(models: CarModelController) {
  return [...models.parkingRoots.values()].flatMap((root) =>
    root
      .getChildMeshes()
      .map((mesh) => Array.from(mesh.computeWorldMatrix(true).asArray())),
  );
}

test("actual compact GLB creates independent identified vehicle roots instead of a baked campus mesh", async () =>
  fixture((models, scene) => {
    assert.equal(models.parkingRoots.size, PARKING_SLOTS.length);
    assert.equal(models.parkingRoots.size, 24);
    assert.notEqual(models.car, models.parked);
    assert.equal(models.car.metadata.entityId, "campus-car");
    assert.equal(models.parked.metadata.entityId, "campus-car");
    const roots = [models.car, models.parked, ...models.parkingRoots.values()];
    assert.equal(new Set(roots.map((root) => root.id)).size, roots.length);
    assert.equal(
      new Set(roots.map((root) => root.metadata.entityId)).size,
      PARKING_SLOTS.length + 1,
    );
    for (const root of roots) {
      assert.equal(root.parent, null);
      assert.equal(root.metadata.kind, "vehicle");
      const meshes = root.getChildMeshes();
      assert.equal(meshes.length, 13);
      assert.ok(
        meshes.every(
          (mesh) =>
            mesh instanceof InstancedMesh &&
            mesh.metadata.entityId === root.metadata.entityId,
        ),
      );
      const inverse = Matrix.Invert(root.computeWorldMatrix(true));
      const corners = meshes.flatMap((mesh) => {
        mesh.computeWorldMatrix(true);
        return mesh
          .getBoundingInfo()
          .boundingBox.vectorsWorld.map((p) =>
            Vector3.TransformCoordinates(p, inverse),
          );
      });
      assert.ok(
        corners.every(
          (p) =>
            p.x >= -1.021 &&
            p.x <= 1.021 &&
            p.y >= 0.015 &&
            p.y <= 1.561 &&
            p.z >= -1.781 &&
            p.z <= 1.781,
        ),
        "every root must contain one compact in local metres, never campus/world-baked offsets",
      );
    }
    assert.equal(
      scene.geometries.length,
      13,
      "all 24 parked cars and the two driving representations share the original part geometry",
    );
    const first = models.parkingRoots.values().next().value!,
      second = [...models.parkingRoots.values()][1];
    const before = first
      .getChildMeshes()
      .map((mesh) => mesh.computeWorldMatrix(true).getTranslation().clone());
    const other = second
      .getChildMeshes()
      .map((mesh) => Array.from(mesh.computeWorldMatrix(true).asArray()));
    first.position.addInPlace(new Vector3(2.5, 0, 1));
    first.getChildMeshes().forEach((mesh, i) => {
      const after = mesh.computeWorldMatrix(true).getTranslation();
      assert.ok(
        Vector3.Distance(after, before[i].add(new Vector3(2.5, 0, 1))) < 0.0001,
        "editing one root must really move its own parts",
      );
    });
    assert.deepEqual(
      second
        .getChildMeshes()
        .map((mesh) => Array.from(mesh.computeWorldMatrix(true).asArray())),
      other,
      "another car must remain unchanged",
    );
  }));

test("all source parking transforms match the DMR collider placement and keep wheel bottoms close to ground", async () =>
  fixture((models) => {
    let minimum = Infinity,
      maximum = -Infinity;
    for (const slot of PARKING_SLOTS) {
      const root = models.parkingRoots.get(slot.id)!;
      assert.equal(root.id, slot.id);
      assert.equal(root.metadata.simulatedOccupancy, true);
      assert.equal(root.metadata.source, slot.source);
      assert.equal(root.position.x, slot.x);
      assert.equal(root.position.z, slot.z);
      assert.ok(
        Math.abs(root.position.y - groundHeight(slot.x, slot.z) + 0.0112) <
          1e-9,
      );
      const q = groundRotation(slot.x, slot.z, slot.yaw);
      assert.ok(
        Quaternion.Dot(
          root.rotationQuaternion!,
          new Quaternion(q.x, q.y, q.z, q.w),
        ) >
          1 - 1e-10,
      );
      // Independent support check at the authored tyre bottoms, not just helper equality.
      for (const x of [-0.85, 0.85])
        for (const z of [-1.05, 1.05]) {
          const local = rotateGroundVector(q, { x, y: 0.02, z });
          const gap =
            root.position.y +
            local.y -
            groundHeight(root.position.x + local.x, root.position.z + local.z);
          minimum = Math.min(minimum, gap);
          maximum = Math.max(maximum, gap);
          assert.ok(
            gap >= -0.005 && gap < 0.025,
            `${slot.id} tyre/DMR gap ${gap}m`,
          );
        }
    }
    assert.equal(models.parked.position.x, CAR_SPAWN.x);
    assert.equal(models.parked.position.z, CAR_SPAWN.z);
    console.log("Native separate parking DMR support", {
      cars: models.parkingRoots.size,
      minimumTyreGapMetres: minimum,
      maximumTyreGapMetres: maximum,
    });
  }));

test("driving and suspension animation never mutates any separate parked car", async () =>
  fixture((models) => {
    const initial = worldMatrices(models);
    const pivots = models.parked
      .getChildren()
      .filter((node) => node.metadata?.kind === "vehicle-wheel");
    assert.equal(pivots.length, 4);
    models.updateWheels(state());
    assert.ok(
      pivots.every(
        (node) =>
          Math.abs(
            (
              node as import("@babylonjs/core/Meshes/transformNode").TransformNode
            ).position.y - 0.36,
          ) < 1e-9,
      ),
      "an initially parked car without raycast contacts must use authored tyre height instead of floating .07m",
    );
    models.updateWheels(
      state({
        parked: false,
        driverId: "test",
        steering: 0.3,
        wheelSuspension: [0.31, 0.3, 0.29, 0.28],
        wheelContact: [true, true, true, true],
      }),
    );
    for (const node of pivots) {
      const pivot =
          node as import("@babylonjs/core/Meshes/transformNode").TransformNode,
        index = node.metadata.wheelIndex;
      assert.ok(
        Math.abs(pivot.position.y - (0.68 - [0.31, 0.3, 0.29, 0.28][index])) <
          1e-9,
      );
      const forward = new Vector3(0, 0, 1).applyRotationQuaternion(
        pivot.rotationQuaternion!,
      );
      if (index < 2)
        assert.ok(forward.x > 0.25, "front wheels must visibly steer");
      else assert.ok(Math.abs(forward.x) < 1e-9, "rear wheels do not steer");
    }
    models.car.position.addInPlace(new Vector3(8, 0, 4));
    models.car.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), 1.2);
    models.car.computeWorldMatrix(true);
    models.updateWheels(
      state({
        parked: false,
        wheelSpin: [0.3, 0.6, 0.9, 1.2],
        wheelContact: [true, true, true, true],
      }),
    );
    assert.deepEqual(
      worldMatrices(models),
      initial,
      "neither body motion nor shared wheel geometry may move or spin the other cars",
    );
  }));

test("native model materials distinguish reflective dielectric glass from shared paint variants", async () =>
  fixture((models) => {
    const glass = models.parked
      .getChildMeshes()
      .find((mesh) => mesh.material?.name === "Window glass")!
      .material as PBRMaterial;
    assert.ok(glass instanceof PBRMaterial);
    assert.equal(glass.metallic, 0);
    assert.equal(glass.roughness, 0.16);
    assert.equal(glass.indexOfRefraction, 1.52);
    assert.equal(glass.alpha, 1);
    assert.equal(glass.transparencyMode, PBRMaterial.PBRMATERIAL_OPAQUE);
    assert.equal(glass.metadata.glazing, "opaque-tinted-dielectric");
    const paint = models.car
      .getChildMeshes()
      .find((mesh) => mesh.material?.name === "Lime enamel")!
      .material as PBRMaterial;
    assert.equal(paint.clearCoat.isEnabled, true);
    const original = paint.albedoColor.clone();
    const colours = new Set(
      [...models.parkingRoots.values()].map((root) => {
        const material = root
          .getChildMeshes()
          .find((mesh) => mesh.material?.metadata?.vehiclePaint)!
          .material as PBRMaterial;
        assert.equal(material.clearCoat.isEnabled, true);
        return material.albedoColor.toHexString();
      }),
    );
    assert.equal(colours.size, 6);
    assert.ok(
      paint.albedoColor.equals(original),
      "parking paint must not recolour the shared driving material",
    );
  }));

test("parking opt-out, driving visibility and loader disposal do not leave baked or orphan geometry", async () =>
  fixture((models, scene) => {
    assert.equal(models.parkingRoots.size, 0);
    const camera = new UniversalCamera(
      "car-loader-check",
      models.parked.position.add(new Vector3(8, 5, -9)),
      scene,
    );
    camera.setTarget(models.parked.position.add(new Vector3(0, 1, 0)));
    scene.activeCamera = camera;
    scene.render();
    assert.ok(
      scene.getActiveMeshes().length > 0,
      "parked representation must render even with the driving root disabled",
    );
    models.parked.setEnabled(false);
    models.car.setEnabled(true);
    scene.render();
    assert.ok(
      scene.getActiveMeshes().length > 0,
      "driving representation must render independently",
    );
    models.car.setEnabled(false);
    scene.render();
    assert.equal(
      scene.getActiveMeshes().length,
      0,
      "hidden templates must never render as another car at the origin",
    );
    models.dispose();
    models.dispose();
    assert.equal(scene.meshes.length, 0);
    assert.equal(scene.transformNodes.length, 0);
    assert.equal(scene.geometries.length, 0);
    assert.equal(scene.materials.length, 0);
  }, false));
