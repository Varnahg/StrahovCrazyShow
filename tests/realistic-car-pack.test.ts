import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import {
  acquireCarPack,
  CAR_PACK_MANIFEST,
  type CarLod,
  type CarRig,
} from "../client/car-pack";
import { VEHICLE_WHEELS, VEHICLE_TUNING } from "../shared/vehicle";
import { loadCar } from "../client/assets";
import { PARKING_SLOTS, groundHeight } from "../shared/terrain";
import { groundRotation, rotateGroundVector } from "../shared/terrain-entities";

const sources = Object.fromEntries(
  CAR_PACK_MANIFEST.lods.map((lod) => [
    lod.level,
    new Uint8Array(readFileSync("public" + lod.url)),
  ]),
);
const partCount = CAR_PACK_MANIFEST.lods[0].parts;
const sourceGeometryCount = CAR_PACK_MANIFEST.lods.reduce(
  (sum, lod) => sum + lod.parts,
  0,
);
const shadowGeometryCount = 5;
const visibleParts = (rig: CarRig) =>
  rig.root
    .getChildMeshes()
    .filter((mesh) => mesh.metadata?.kind === "vehicle-part");
function setup() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.useDelayedTextureLoading = true;
  return { engine, scene };
}
const paint = (rig: CarRig) =>
  rig.root
    .getChildMeshes()
    .find((mesh) => mesh.material?.metadata?.vehiclePaint)!
    .material as PBRMaterial;
const matrices = (rig: CarRig) =>
  rig.root
    .getChildMeshes()
    .map((mesh) => Array.from(mesh.computeWorldMatrix(true).asArray()));

test("retained source is exact CC0 master and all published LOD bytes match the canonical manifest", () => {
  assert.equal(
    createHash("sha256")
      .update(readFileSync(CAR_PACK_MANIFEST.sourceFile))
      .digest("hex"),
    "107410e01453abbce452fabbe6d51436fb98a0920672643a893263a8861873d7",
  );
  assert.equal(CAR_PACK_MANIFEST.license, "CC0");
  assert.equal(
    readFileSync("shared/data/assets/vehicles-manifest.json", "utf8"),
    readFileSync("public/models/vehicles/manifest.json", "utf8"),
  );
  for (const definition of CAR_PACK_MANIFEST.lods) {
    const bytes = sources[definition.level];
    assert.equal(bytes.byteLength, definition.bytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      definition.sha256,
    );
  }
  assert.equal(CAR_PACK_MANIFEST.lods[0].triangles, 138750);
  assert.ok(
    CAR_PACK_MANIFEST.lods[1].triangles <
      CAR_PACK_MANIFEST.lods[0].triangles / 3,
  );
  assert.ok(
    CAR_PACK_MANIFEST.lods[2].triangles <
      CAR_PACK_MANIFEST.lods[0].triangles / 10,
  );
});

test("real GLB import fits current wheel physics and keeps four independent round tyres with finite valid geometry", async () => {
  const { engine, scene } = setup(),
    handle = await acquireCarPack(scene, { assetSources: sources }),
    rig = handle.pack.createRig("physics-fit");
  try {
    const corners = visibleParts(rig).flatMap((mesh) => {
      mesh.computeWorldMatrix(true);
      return mesh.getBoundingInfo().boundingBox.vectorsWorld;
    });
    assert.ok(
      corners.every(
        (p) =>
          p.x >= -1.02001 &&
          p.x <= 1.02001 &&
          p.y >= 0.01999 &&
          p.y <= 1.56001 &&
          p.z >= -1.78001 &&
          p.z <= 1.78001,
      ),
    );
    for (let i = 0; i < 4; i++) {
      const pivot = rig.wheels[i],
        connection = VEHICLE_WHEELS[i];
      assert.equal(pivot.position.x, connection.x);
      assert.equal(pivot.position.z, connection.z);
      assert.equal(pivot.position.y, 0.36);
      const points = pivot
        .getChildMeshes()
        .filter((mesh) => !mesh.metadata?.shadowProxy)
        .flatMap((mesh) => {
          mesh.computeWorldMatrix(true);
          return mesh.getBoundingInfo().boundingBox.vectorsWorld;
        });
      assert.ok(Math.abs(Math.min(...points.map((p) => p.y)) - 0.02) < 1e-5);
      assert.ok(
        Math.abs(
          Math.max(...points.map((p) => p.y)) -
            0.36 -
            VEHICLE_TUNING.wheelRadius,
        ) < 1e-5,
      );
      assert.ok(
        Math.abs(
          Math.max(...points.map((p) => p.z)) -
            connection.z -
            VEHICLE_TUNING.wheelRadius,
        ) < 1e-5,
      );
    }
    for (const [level, parts] of handle.pack.templates) {
      let triangles = 0,
        degenerate = 0;
      for (const part of parts.values()) {
        const p = part.source.getVerticesData("position")!,
          n = part.source.getVerticesData("normal")!,
          indices = part.source.getIndices()!;
        assert.ok(p.every(Number.isFinite) && n.every(Number.isFinite));
        triangles += indices.length / 3;
        for (let i = 0; i < indices.length; i += 3) {
          const a = indices[i] * 3,
            b = indices[i + 1] * 3,
            c = indices[i + 2] * 3;
          const ux = p[b] - p[a],
            uy = p[b + 1] - p[a + 1],
            uz = p[b + 2] - p[a + 2],
            vx = p[c] - p[a],
            vy = p[c + 1] - p[a + 1],
            vz = p[c + 2] - p[a + 2];
          if (
            Math.hypot(
              uy * vz - uz * vy,
              uz * vx - ux * vz,
              ux * vy - uy * vx,
            ) /
              2 <
            1e-12
          )
            degenerate++;
        }
      }
      assert.equal(
        triangles,
        CAR_PACK_MANIFEST.lods.find((lod) => lod.level === level)!.triangles,
      );
      assert.equal(
        degenerate,
        0,
        level + " cannot introduce invalid zero-area triangles",
      );
    }
  } finally {
    rig.dispose();
    handle.release();
    scene.dispose();
    engine.dispose();
  }
});

test("scene consumers share one source upload and actual palette materials across independent car entities", async () => {
  const { engine, scene } = setup();
  const [a, b] = await Promise.all([
    acquireCarPack(scene, { assetSources: sources }),
    acquireCarPack(scene, { assetSources: sources }),
  ]);
  const red = a.pack.createRig("red-a", "#aa3322"),
    same = b.pack.createRig("red-b", "#AA3322"),
    blue = b.pack.createRig("original-blue"),
    white = b.pack.createRig("white", "#dddddd");
  try {
    assert.equal(a.pack, b.pack);
    assert.equal(
      scene.geometries.length,
      sourceGeometryCount + shadowGeometryCount,
      "three immutable source LODs plus five shared shadow groups, no new geometry for colour variants or entities",
    );
    assert.equal(visibleParts(red).length, partCount);
    assert.ok(
      red.root.getChildMeshes().every((mesh) => mesh instanceof InstancedMesh),
    );
    assert.equal(paint(red), paint(same));
    assert.notEqual(paint(red), paint(white));
    assert.notEqual(paint(red), paint(blue));
    assert.ok(
      paint(blue).albedoColor.b > paint(blue).albedoColor.r * 3,
      "source blue factor must survive export",
    );
    const before = matrices(same);
    red.root.position.x += 3;
    red.wheels[0].rotationQuaternion = Quaternion.RotationAxis(
      Vector3.Right(),
      1.2,
    );
    assert.deepEqual(matrices(same), before);
    red.dispose();
    a.release();
    assert.ok(
      !same.root.isDisposed() &&
        !(
          same.root.getChildMeshes()[0] as InstancedMesh
        ).sourceMesh.isDisposed(),
    );
  } finally {
    red.dispose();
    same.dispose();
    blue.dispose();
    white.dispose();
    a.release();
    b.release();
    assert.equal(scene.meshes.length, 0);
    assert.equal(scene.transformNodes.length, 0);
    assert.equal(scene.materials.length, 0);
    assert.equal(
      scene.textures.filter(
        (texture) => texture !== scene.environmentBRDFTexture,
      ).length,
      0,
      "only the scene-owned BRDF LUT may remain; no car or palette wrapper texture leaks",
    );
    scene.dispose();
    engine.dispose();
  }
});

test("production loadCar adapter uses the reviewed shared pack with 24 independent grounded parking cars", async () => {
  const { engine, scene } = setup();
  // Pre-acquiring the exact GLB bytes lets the production default adapter use
  // the same real shared pack offline; no model/geometry/material is stubbed.
  const owner = await acquireCarPack(scene, { assetSources: sources });
  const models = await loadCar(scene);
  try {
    assert.equal(models.parkingRoots.size, 24);
    assert.equal(
      visibleParts({ root: models.car } as CarRig).length,
      partCount,
    );
    assert.equal(
      visibleParts({ root: models.parked } as CarRig).length,
      partCount,
    );
    const palette = new Map<string, PBRMaterial>();
    let minimum = Infinity,
      maximum = -Infinity;
    for (const slot of PARKING_SLOTS) {
      const root = models.parkingRoots.get(slot.id)!;
      assert.equal(root.metadata.assetId, "campus-hatchback");
      assert.equal(root.metadata.source, slot.source);
      assert.equal(root.position.x, slot.x);
      assert.equal(root.position.z, slot.z);
      assert.ok(
        Math.abs(root.position.y - groundHeight(slot.x, slot.z) + 0.0112) <
          1e-9,
      );
      const material = root
        .getChildMeshes()
        .find((mesh) => mesh.material?.metadata?.vehiclePaint)!
        .material as PBRMaterial;
      const colour = material.metadata.paletteColour;
      if (palette.has(colour)) assert.equal(material, palette.get(colour));
      else palette.set(colour, material);
      const q = groundRotation(slot.x, slot.z, slot.yaw);
      for (const wheel of VEHICLE_WHEELS) {
        const p = rotateGroundVector(q, { x: wheel.x, y: 0.02, z: wheel.z });
        const gap =
          root.position.y +
          p.y -
          groundHeight(root.position.x + p.x, root.position.z + p.z);
        minimum = Math.min(minimum, gap);
        maximum = Math.max(maximum, gap);
        assert.ok(
          gap >= -0.005 && gap < 0.025,
          slot.id + " wheel/DMR contact " + gap,
        );
      }
    }
    assert.equal(palette.size, 6);
    assert.equal(
      scene.geometries.length,
      sourceGeometryCount + shadowGeometryCount,
    );
    console.log("Reviewed car parking actual DMR support", {
      minimum,
      maximum,
      cars: 24,
      paletteMaterials: palette.size,
    });
    models.setQuality("low");
  } finally {
    models.dispose();
    owner.release();
    assert.equal(scene.meshes.length, 0);
    scene.dispose();
    engine.dispose();
  }
});

test("actual Babylon instance LOD selects retained near, medium and far without extra per-car instances", async () => {
  const { engine, scene } = setup(),
    handle = await acquireCarPack(scene, { assetSources: sources }),
    rig = handle.pack.createRig("lod-proof", "#cc4433");
  const camera = new FreeCamera(
    "real LOD selection camera",
    new Vector3(0, 1, 5),
    scene,
  );
  scene.activeCamera = camera;
  try {
    handle.pack.setQuality("high");
    for (const [distance, level] of [
      [5, "near"],
      [40, "medium"],
      [110, "far"],
    ] as const) {
      camera.position.set(0, 1, distance);
      camera.computeWorldMatrix();
      let triangles = 0;
      for (const mesh of visibleParts(rig)) {
        mesh.computeWorldMatrix(true);
        const lod = mesh.getLOD(camera)!;
        assert.equal(lod.metadata.lod, level);
        triangles += lod.getTotalIndices() / 3;
        if (mesh.material?.metadata?.vehiclePaint)
          assert.equal(
            lod.material,
            mesh.material,
            "colour must remain shared through the native instance LOD",
          );
      }
      assert.equal(
        triangles,
        CAR_PACK_MANIFEST.lods.find((lod) => lod.level === level)!.triangles,
      );
    }
    assert.equal(
      visibleParts(rig).length,
      partCount,
      "LOD must allocate one instance per part, not three complete car copies",
    );
    handle.pack.setQuality("low");
    camera.position.set(0, 1, 50);
    camera.computeWorldMatrix();
    assert.ok(
      visibleParts(rig).every((mesh) => {
        mesh.computeWorldMatrix(true);
        return mesh.getLOD(camera)!.metadata.lod === "far";
      }),
    );
  } finally {
    rig.dispose();
    handle.release();
    scene.dispose();
    engine.dispose();
  }
});

test("night emission belongs only to main source lenses and parked, reversing, brake, glass and paint stay dark", async () => {
  const { engine, scene } = setup(),
    handle = await acquireCarPack(scene, { assetSources: sources });
  const moving = handle.pack.createRig("lit-moving", "#8c3530"),
    parked = handle.pack.createRig("unlit-parked", "#8c3530", false);
  try {
    assert.equal(
      paint(moving),
      paint(parked),
      "lamp state must not duplicate the shared paint palette",
    );
    handle.pack.updateLighting(1);
    for (const [level, parts] of handle.pack.templates) {
      for (const part of parts.values()) {
        const material = part.source.material as PBRMaterial;
        if (material.metadata?.vehicleLensRole)
          assert.ok(
            material.emissiveColor.r > 0,
            level + " source main lens must glow",
          );
        else
          assert.equal(
            material.emissiveColor
              .asArray()
              .reduce((sum, value) => sum + Math.abs(value), 0),
            0,
            material.name + " must not become an emissive whole car",
          );
      }
    }
    assert.ok(
      parked.root
        .getChildMeshes()
        .filter((mesh) => mesh.material?.metadata?.vehicleLensRole)
        .every(
          (mesh) =>
            (mesh.material as PBRMaterial).emissiveColor
              .asArray()
              .reduce((sum, value) => sum + Math.abs(value), 0) === 0,
        ),
    );
    assert.ok(
      moving.root
        .getChildMeshes()
        .filter((mesh) => mesh.material?.metadata?.vehicleLensRole)
        .every((mesh) => (mesh.material as PBRMaterial).emissiveColor.r > 0),
    );
    handle.pack.updateLighting(0);
    assert.ok(
      moving.root
        .getChildMeshes()
        .every(
          (mesh) =>
            (mesh.material as PBRMaterial).emissiveColor
              .asArray()
              .reduce((sum, value) => sum + Math.abs(value), 0) === 0,
        ),
    );
    const centres = CAR_PACK_MANIFEST.lights.frontCentres;
    assert.equal(centres.length, 2);
    assert.ok(
      centres.every(
        (p: number[]) =>
          p[2] > 1.5 &&
          p[1] > 0.5 &&
          p[1] < 1.1 &&
          Math.abs(p[0]) > 0.3 &&
          Math.abs(p[0]) < 0.9,
      ),
    );
    assert.ok(
      centres[0][0] * centres[1][0] < 0 &&
        Math.abs(centres[0][0] + centres[1][0]) < 0.01,
    );
  } finally {
    moving.dispose();
    parked.dispose();
    handle.release();
    scene.dispose();
    engine.dispose();
  }
});
