import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  PHOTO_LAMPS,
  LAMP_PLACEMENTS,
  STREET_COLLISIONS,
} from "../shared/streets";
import { groundHeight, PARKING_SLOTS } from "../shared/terrain";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Light } from "@babylonjs/core/Lights/light";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { buildStreets } from "../client/streets-renderer";

test("added parking lamps have unchanged historical photo evidence, recoverable pixels and explicit uncertainty", () => {
  const image = readFileSync(PHOTO_LAMPS.sourceImage);
  assert.equal(
    createHash("sha256").update(image).digest("hex"),
    PHOTO_LAMPS.sourceImageSha256,
  );
  const geo = JSON.parse(readFileSync(PHOTO_LAMPS.sourceGeoreference, "utf8"));
  assert.equal(geo.captureDate, "2024-06-08");
  assert.equal(geo.sha256, PHOTO_LAMPS.sourceImageSha256);
  assert.equal(
    PHOTO_LAMPS.placements.length,
    2,
    "ambiguous northern and tree-covered candidates were not added",
  );
  for (const lamp of PHOTO_LAMPS.placements) {
    const x =
      geo.worldBounds.minX +
      (lamp.basePixel[0] / geo.width) *
        (geo.worldBounds.maxX - geo.worldBounds.minX);
    const z =
      geo.worldBounds.minZ +
      (lamp.basePixel[1] / geo.height) *
        (geo.worldBounds.maxZ - geo.worldBounds.minZ);
    assert.ok(Math.abs(lamp.x - x) < 0.01 && Math.abs(lamp.z - z) < 0.01);
    assert.equal(lamp.provenance, "reference-interpreted-not-surveyed");
    assert.ok(lamp.positionUncertaintyMetres >= 0.6);
    assert.match(lamp.heightProvenance, /not-measured|not-surveyed/);
    assert.ok(lamp.sourceNodes.length > 0);
    assert.ok(
      PARKING_SLOTS.every(
        (car) => Math.hypot(car.x - lamp.x, car.z - lamp.z) > 2.5,
      ),
      "new pole must not be planted into an authored parked car",
    );
  }
});

test("clean parking fixtures and collisions use shared bases, and practical PBR light has the same bounded falloff as Standard", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    lights: PointLight[] = [];
  const result = buildStreets({ scene, lights });
  for (const lamp of LAMP_PLACEMENTS) {
    const light = lights.find(
      (entry) => entry.name === "mapped-lamp:" + lamp.id,
    )!;
    assert.ok(light);
    assert.equal(light.falloffType, Light.FALLOFF_STANDARD);
    assert.equal(light.range, 22);
    assert.equal(
      light.metadata.lightingProvenance,
      "simulated-bounded-art-light-not-measured-lumens",
    );
    const pole = STREET_COLLISIONS.find(
      (entry) => entry.id === "lamp:" + lamp.id + ":pole",
    )!;
    assert.equal(pole.x, lamp.x);
    assert.equal(pole.z, lamp.z);
    assert.ok(
      Math.abs(pole.y - pole.h / 2 - groundHeight(lamp.x, lamp.z)) < 1e-12,
    );
  }
  const fixtureMaterials = result.meshes.find(
    (mesh) => mesh.name === "mapped-lamp-fixtures",
  )!.material as MultiMaterial;
  assert.ok(
    fixtureMaterials.subMaterials.some(
      (material) => material?.name === "street:photo white parking poles",
    ),
    "photo fixture must actually retain its white material in the batched render mesh",
  );
  scene.dispose();
  engine.dispose();
});
