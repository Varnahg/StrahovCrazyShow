import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { AvatarLodController } from "../client/avatar-lod";
import { applyAvatarPreset } from "../client/avatar-presets";
import { DEFAULT_AVATAR } from "../shared/types";
import { pngFixture } from "./png-fixture";
import { wholeHairVolumeOverlap } from "./hair-fit-fixture";
import before from "../assets/sources/characters/student-hair/short04-before-ear-contour.json";
import earSource from "../assets/sources/characters/student-hair/ear-source-audit.json";
import repair from "../assets/sources/characters/student-hair/short04-ear-repair.json";
import hair from "../client/data/student-hair.json";
type Geometry = typeof before.plain.near;
const scale = new Vector3(0.184, 0.235, 0.195);
const sourceBytes = (name: string) =>
  readFileSync(
    new URL(
      "../assets/sources/characters/student-hair/" + name,
      import.meta.url,
    ),
  );
const digest = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

test("complete original ear face sets explain the missed front contour and match unchanged runtime anatomy", () => {
  assert.equal(
    digest(sourceBytes("ear-source-audit.json")),
    repair.sourceEarAuditSha256,
  );
  assert.equal(
    digest(sourceBytes("short04-before-ear-contour.json")),
    repair.beforeShort04Sha256,
  );
  assert.equal(earSource.verification.sourceVertexCount, 472);
  assert.equal(earSource.verification.excludedByOldMaskCount, 86);
  assert.ok(earSource.verification.maximumRuntimeVertexErrorMetres < 2e-8);
  assert.deepEqual(earSource.ears.map((ear) => ear.faceSet).sort(), [4, 5]);
  for (const ear of earSource.ears) {
    const volume = repair.volumes.find((value) => value.side === ear.side)!;
    assert.equal(volume.marginMetres, 0.0025);
    assert.deepEqual(volume.planes[0], [ear.side, 0, 0, -0.055]);
    for (const point of ear.pointsHeadLocalMetres)
      assert.ok(
        volume.planes.every(
          ([x, y, z, d]) =>
            x * point[0] + y * point[1] + z * point[2] + d >= -1e-9,
        ),
      );
    assert.ok(
      Math.max(...ear.pointsHeadLocalMetres.map((point) => point[2])) > 0.042,
    );
  }
});

test("short04 correction preserves every original attribute and triangle outside the source ear cut", () => {
  for (const fit of ["plain", "glasses"] as const) {
    const original = before[fit].near,
      output = hair.styles.short04[fit].near,
      changes = repair.changes[fit];
    assert.ok(wholeHairVolumeOverlap(original, repair.volumes) > 1e-5);
    assert.ok(wholeHairVolumeOverlap(output, repair.volumes) < 1e-8);
    assert.deepEqual(
      output.positions.slice(0, original.positions.length),
      original.positions,
    );
    assert.deepEqual(
      output.normals.slice(0, original.normals.length),
      original.normals,
    );
    assert.deepEqual(output.uvs.slice(0, original.uvs.length), original.uvs);
    assert.deepEqual(output, hair.styles.short04[fit].medium);
    const affected = new Set(changes.affectedOriginalTriangles);
    const outputsFor = new Map<number, number[]>();
    changes.outputTriangleOriginalIds.forEach((source, index) => {
      let list = outputsFor.get(source);
      if (!list) outputsFor.set(source, (list = []));
      list.push(index);
    });
    for (let source = 0; source < original.indices.length / 3; source++)
      if (!affected.has(source)) {
        const ids = outputsFor.get(source)!;
        assert.equal(ids.length, 1, `unaffected ${fit} triangle ${source}`);
        assert.deepEqual(
          output.indices.slice(ids[0] * 3, ids[0] * 3 + 3),
          original.indices.slice(source * 3, source * 3 + 3),
        );
      }
    const point = (g: Geometry, index: number) =>
      Vector3.FromArray(g.positions, index * 3).multiply(scale);
    for (
      let target = 0;
      target < changes.outputTriangleOriginalIds.length;
      target++
    ) {
      const source = changes.outputTriangleOriginalIds[target];
      if (!affected.has(source)) continue;
      const ids = original.indices.slice(source * 3, source * 3 + 3),
        a = point(original, ids[0]),
        ab = point(original, ids[1]).subtract(a),
        ac = point(original, ids[2]).subtract(a);
      const normal = Vector3.Cross(ab, ac),
        uu = Vector3.Dot(ab, ab),
        uv = Vector3.Dot(ab, ac),
        vv = Vector3.Dot(ac, ac),
        denominator = uu * vv - uv * uv;
      assert.ok(Math.abs(denominator) > 1e-24);
      for (const index of output.indices.slice(target * 3, target * 3 + 3)) {
        const delta = point(output, index).subtract(a),
          wu = Vector3.Dot(delta, ab),
          wv = Vector3.Dot(delta, ac),
          u = (vv * wu - uv * wv) / denominator,
          v = (uu * wv - uv * wu) / denominator;
        assert.ok(Math.min(u, v, 1 - u - v) >= -1e-7);
        assert.ok(
          Math.abs(Vector3.Dot(delta, normal)) / normal.length() < 1e-9,
        );
        for (let channel = 0; channel < 2; channel++) {
          const expected =
            original.uvs[ids[0] * 2 + channel] * (1 - u - v) +
            original.uvs[ids[1] * 2 + channel] * u +
            original.uvs[ids[2] * 2 + channel] * v;
          assert.ok(
            Math.abs(output.uvs[index * 2 + channel] - expected) < 1e-7,
          );
        }
      }
    }
    assert.ok(
      changes.removedAreaMetres2 > 0 &&
        changes.removedAreaMetres2 < changes.beforeAreaMetres2 * 0.02,
    );
  }
});

test("real profile camera reproduces the old opaque tragus wedge and clears it after the source-based cut", () => {
  // Exact camera/canvas from the root GPU screenshot: full screen 1280x720,
  // canvas 980x635 starting y85, alpha0/beta1.5/radius1/target1.6786444.
  const engine = new NullEngine({
    renderWidth: 980,
    renderHeight: 635,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const pool = new AvatarPrimitivePool(scene),
    camera = new ArcRotateCamera(
      "captured ear QA camera",
      0,
      1.5,
      1,
      new Vector3(0, 1.6786444, 0),
      scene,
    );
  camera.fov = 0.54;
  camera.minZ = 0.03;
  const texture = pngFixture(
    readFileSync(
      new URL(
        "../public/models/characters/student-hair/short04/diffuse.png",
        import.meta.url,
      ),
    ),
  );
  const pixels = [
    [442, 454],
    [444, 454],
    [442, 458],
    [444, 458],
    [442, 460],
    [444, 460],
    [442, 462],
    [444, 462],
  ];
  let oldBlocked = 0,
    correctedBlocked = 0,
    samples = 0;
  const blocks = (geometry: Geometry, ray: Ray, limit: number) => {
    const vertices = Array.from(
      { length: geometry.positions.length / 3 },
      (_, i) => Vector3.FromArray(geometry.positions, i * 3),
    );
    for (let i = 0; i < geometry.indices.length; i += 3) {
      const [a, b, c] = geometry.indices.slice(i, i + 3),
        hit = ray.intersectsTriangle(vertices[a], vertices[b], vertices[c]);
      if (!hit || hit.distance >= limit) continue;
      const u = hit.bu!,
        v = hit.bv!,
        uvX =
          geometry.uvs[a * 2] * u +
          geometry.uvs[b * 2] * v +
          geometry.uvs[c * 2] * (1 - u - v),
        uvY =
          geometry.uvs[a * 2 + 1] * u +
          geometry.uvs[b * 2 + 1] * v +
          geometry.uvs[c * 2 + 1] * (1 - u - v);
      if (texture.bilinearChannel(uvX, uvY, 3) >= 0.42) return true;
    }
    return false;
  };
  for (const glasses of [false, true]) {
    const config = { ...applyAvatarPreset(3, DEFAULT_AVATAR), glasses },
      rig = createAvatarRig(scene, config, pool),
      lod = new AvatarLodController(scene, pool, rig, config),
      fit = glasses ? "glasses" : "plain";
    for (const level of ["near", "medium"] as const)
      for (const side of [1, -1]) {
        lod.update({
          distance: level === "near" ? 0 : 20,
          quality: "low",
          position: { x: 0, y: 0, z: 0 },
          yaw: 0,
        });
        camera.alpha = side === 1 ? 0 : Math.PI;
        camera.getViewMatrix(true);
        camera.getProjectionMatrix(true);
        scene.updateTransformMatrix(true);
        const mesh = rig.head
            .getChildMeshes()
            .find((value) => value.metadata?.avatarHair && value.isEnabled())!,
          face = rig.head
            .getChildMeshes()
            .find((value) =>
              value.name.endsWith(level === "near" ? " face" : " face medium"),
            )!;
        const inverse = mesh.computeWorldMatrix(true).clone().invert();
        face.computeWorldMatrix(true);
        for (const [pixelX, pixelY] of pixels) {
          const x = side === 1 ? pixelX : 980 - pixelX,
            worldRay = scene.createPickingRay(
              x,
              pixelY - 85,
              Matrix.Identity(),
              camera,
              false,
            ),
            skin = worldRay.intersectsMesh(face, false);
          assert.ok(skin.hit && skin.pickedPoint);
          const local = Ray.Transform(worldRay, inverse),
            limit = Vector3.Distance(
              local.origin,
              Vector3.TransformCoordinates(skin.pickedPoint, inverse),
            );
          if (blocks(before[fit][level], local, limit)) oldBlocked++;
          if (blocks(hair.styles.short04[fit][level], local, limit))
            correctedBlocked++;
          samples++;
        }
      }
    rig.root.dispose();
    pool.pruneUnused();
  }
  assert.equal(samples, 64);
  assert.ok(
    oldBlocked >= 24,
    `the real before defect must reproduce: ${oldBlocked}/${samples}`,
  );
  assert.equal(correctedBlocked, 0);
  console.info(
    JSON.stringify({
      cameraTragusSamples: samples,
      opaqueHairBeforeSkinBefore: oldBlocked,
      opaqueHairBeforeSkinAfter: correctedBlocked,
    }),
  );
  pool.dispose();
  scene.dispose();
  engine.dispose();
});
