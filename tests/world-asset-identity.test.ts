import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { buildArchitectureReality } from "../client/architecture-reality";
import { buildLandmarkReality } from "../client/landmark-reality";
import { createCampusExterior } from "../client/campus-exterior";
import { BUILDINGS } from "../shared/world";
import { buildLandmarkPlan } from "../shared/landmark-reality";
import { buildCampusExteriorPlan } from "../shared/campus-exterior";
import {osmAssetIdentity} from "../shared/world-asset-identity";

test("facade, entrance and roof retain one independent source pivot per building with unchanged world vertices", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const buildings = BUILDINGS.filter((b) =>
    ["53929060", "53929073", "7645350"].includes(b.id),
  );
  const architecture = buildArchitectureReality({ scene, buildings });
  const landmarks = buildLandmarkReality({ scene, buildings });
  const exterior = createCampusExterior(scene);
  const b2 = architecture.assetRoots.find(
    (r) => r.metadata.sourceId === "53929060",
  )!;
  const shop = architecture.assetRoots.find(
    (r) => r.metadata.sourceId === "7645350",
  )!;
  assert.ok(b2 && shop);
  assert.ok(
    landmarks.assetRoots.includes(b2),
    "porch and facade must share B2's source root",
  );
  assert.ok(
    exterior.assetRoots.includes(shop),
    "Market roof and facade must share one source root",
  );
  assert.ok(
    !scene.meshes.some(
      (m) =>
        m.name.startsWith("reality 7645350") &&
        m.name.includes("weathered roof"),
    ),
    "generic coplanar roof must not overlay the authored Market roof",
  );
  const ownMeshes = b2.getChildMeshes(),
    otherMeshes = shop.getChildMeshes();
  assert.ok(
    ownMeshes.some((m) => m.metadata?.sourcePack === "landmark-reality"),
  );
  assert.ok(ownMeshes.some((m) => m.name.startsWith("reality 53929060")));
  const point = (mesh: (typeof ownMeshes)[number]) => {
    mesh.computeWorldMatrix(true);
    return Vector3.TransformCoordinates(
      Vector3.FromArray(mesh.getVerticesData("position")!),
      mesh.getWorldMatrix(),
    );
  };
  const before = ownMeshes.map(point),
    otherBefore = otherMeshes.map(point);
  for (const mesh of [...ownMeshes, ...otherMeshes]) {
    const source = Vector3.FromArray(mesh.getVerticesData("position")!);
    assert.ok(
      point(mesh).subtract(source).length() < 1e-6,
      "parenting must preserve original mapped world positions",
    );
  }
  // Translation after hierarchy creation must update all own parts. Frozen
  // child matrices would leave windows/porches behind and fail this check.
  b2.position.x += 3.25;
  b2.position.z -= 2.5;
  ownMeshes.forEach((m, i) => {
    const p = point(m),
      delta = p.subtract(before[i]);
    assert.ok(
      Math.abs(delta.x - 3.25) < 1e-6 && Math.abs(delta.z + 2.5) < 1e-6,
    );
  });
  otherMeshes.forEach((m, i) =>
    assert.ok(point(m).subtract(otherBefore[i]).length() < 1e-8),
  );
  architecture.dispose();
  assert.ok(
    !b2.isDisposed(),
    "disposing a facade must preserve its separately owned porch",
  );
  assert.ok(
    !shop.isDisposed(),
    "disposing a facade must preserve its separately owned roof",
  );
  landmarks.dispose();
  exterior.dispose();
  assert.equal(scene.meshes.length, 0);
  assert.equal(
    scene.transformNodes.filter((n) => n.metadata?.worldAsset).length,
    0,
  );
  scene.dispose();
  engine.dispose();
});

test("no material/LOD batch contains multiple building or court source identities", () => {
  const landmarks = buildLandmarkPlan(),
    exterior = buildCampusExteriorPlan();
  assert.ok(!landmarks.parts.some((p) => p.group === "entries"));
  for (const entry of landmarks.entrances) {
    const own = landmarks.parts.filter(
      (p) => p.group === `entry-${entry.block}`,
    );
    assert.ok(
      own.length > 0 && own.every((p) => p.asset.sourceId === entry.buildingId),
    );
  }
  for (const court of exterior.courts) {
    const own = exterior.parts.filter(
      (p) => p.group === `court-${court.osmId}`,
    );
    assert.ok(
      own.length > 0 && own.every((p) => p.asset.sourceId === court.osmId),
    );
  }
  const expectedRoots=new Set([
    ...exterior.courts.map(court=>osmAssetIdentity("court","way",court.osmId).key),
    osmAssetIdentity("building","way","7645350").key,
  ]);
  assert.deepEqual(new Set(exterior.parts.map(part=>part.asset.key)),expectedRoots,"every court and the separately owned Market roof retain exactly their own source identity");
  assert.ok(exterior.parts.filter(part=>part.group==="market-roof").every(part=>part.asset.key===osmAssetIdentity("building","way","7645350").key));
  assert.ok(
    landmarks.parts
      .filter((p) => p.group === "stadium")
      .every(
        (p) =>
          p.asset.sourceType === "relation" && p.asset.sourceId === "1515034",
      ),
  );
});

test("court detail LOD changes independently for distant mapped courts", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const c = createCampusExterior(scene);
  const west = c.plan.courts[0],
    beach = c.plan.courts[4];
  c.update(west.center.x - west.width / 2 - 20, west.center.z, "low");
  assert.ok(
    c.meshes.some(
      (m) =>
        m.metadata.sourceId === west.osmId &&
        m.metadata.lod === "near" &&
        m.isEnabled(),
    ),
  );
  assert.ok(
    c.meshes
      .filter(
        (m) => m.metadata.sourceId === beach.osmId && m.metadata.lod === "near",
      )
      .every((m) => !m.isEnabled()),
  );
  c.dispose();
  scene.dispose();
  engine.dispose();
});
