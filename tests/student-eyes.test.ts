import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { pngFixture } from "./png-fixture";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { AvatarLodController } from "../client/avatar-lod";
import { EYE_PALETTES, irisLandmarks } from "../client/avatar-eyes";
import { applyAvatarPreset } from "../client/avatar-presets";
import { DEFAULT_AVATAR } from "../shared/types";
import eyes from "../client/data/student-eyes.json";

const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const at = (distance: number) => ({
  distance,
  quality: "low",
  position: { x: 0, y: 0, z: 0 },
  yaw: 0,
});

const atlasPixels = (path: string) => pngFixture(readFileSync(path)).nearest;

// Exercise the production private functions with controlled surfaces without
// exporting a test API or reproducing their interpolation algorithm.
const surfaceSource = ts.createSourceFile(
  "avatar-renderer.ts",
  readFileSync(new URL("../client/avatar-renderer.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TS,
);
const surfaceCode = ts.transpileModule(
  surfaceSource.statements
    .filter(ts.isFunctionDeclaration)
    .filter((node) =>
      ["frontSurfaceZ", "faceSurfaceZ", "shirtSurfaceZ"].includes(
        node.name?.text ?? "",
      ),
    )
    .map((node) => node.getText(surfaceSource))
    .join("\n") + "\n({ faceSurfaceZ, shirtSurfaceZ });",
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
type Surface = { positions: number[]; indices: number[] };
function surfaceFitting(head: Surface, male = head, female = male) {
  return runInNewContext(surfaceCode, {
    anatomy: {
      head,
      bodies: {
        male: { near: { shirt: male } },
        female: { near: { shirt: female } },
      },
    },
  }) as {
    faceSurfaceZ(x: number, y: number, width: number): number;
    shirtSurfaceZ(preset: number, x: number, y: number): number;
  };
}

test("surface fitting preserves face coordinates, front depth and the stricter shirt border", () => {
  const surface = {
    positions: [0, 0, 2, 1, 0, 2, 0, 1, 2],
    indices: [0, 1, 2],
  };
  const fitting = surfaceFitting(surface);
  for (const [x, y] of [
    [0, 0],
    [0.5, 0],
    [0, 0.5],
    [0.5, 0.5],
  ]) {
    assert.equal(fitting.faceSurfaceZ(x * 0.4, y * 0.235, 0.4), 0.39);
    assert.equal(fitting.shirtSurfaceZ(0, x, y), 2);
  }
  for (const [x, y] of [
    [-0.5e-6, 0.25],
    [0.25, -0.5e-6],
    [1 + 0.5e-6, 0],
  ]) {
    assert.ok(
      Math.abs(fitting.faceSurfaceZ(x * 0.4, y * 0.235, 0.4) - 0.39) < 1e-14,
    );
    assert.equal(fitting.shirtSurfaceZ(0, x, y), 0.14);
  }
  for (const [x, y] of [[-2e-6, 0.25], [0.25, -2e-6], [1 + 2e-6, 0]])
    assert.equal(fitting.faceSurfaceZ(x * 0.4, y * 0.235, 0.4), 0.082);

  const sloped = surfaceFitting({
    positions: [0, 0, 1, 1, 0, 3, 0, 1, 5],
    indices: [0, 1, 2],
  });
  assert.equal(sloped.faceSurfaceZ(0.1, 0.1175, 0.4), 3.5 * 0.195);
  assert.equal(sloped.shirtSurfaceZ(0, 0.25, 0.5), 3.5);
  for (const indices of [[0, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 0]]) {
    const layered = surfaceFitting({
      positions: [...surface.positions, 0, 0, -3, 1, 0, -3, 0, 1, -3],
      indices,
    });
    assert.equal(layered.faceSurfaceZ(0.1, 0.1175, 0.4), 0.39);
    assert.equal(layered.shirtSurfaceZ(0, 0.25, 0.5), 2);
  }
  const female = {
    ...surface,
    positions: surface.positions.map((v, i) => (i % 3 === 2 ? 3 : v)),
  };
  const presets = surfaceFitting(surface, surface, female);
  for (const preset of [0, 1, 3, 5, -1, 2.1, NaN])
    assert.equal(presets.shirtSurfaceZ(preset, 0.25, 0.5), 2);
  for (const preset of [2, 4])
    assert.equal(presets.shirtSurfaceZ(preset, 0.25, 0.5), 3);
});

test("surface fitting preserves determinant cutoff and finite fallbacks", () => {
  for (const height of [0, 0.5e-12, 1e-12]) {
    const fitting = surfaceFitting({
      positions: [0, 0, 2, 1, 0, 2, 0, height, 2],
      indices: [0, 1, 2],
    });
    assert.equal(fitting.faceSurfaceZ(0, 0, 0.4), height < 1e-12 ? 0.082 : 0.39);
    assert.equal(fitting.shirtSurfaceZ(0, 0, 0), height < 1e-12 ? 0.14 : 2);
  }
  for (const surface of [
    { positions: [], indices: [] },
    { positions: [0, 0, NaN, 1, 0, 2, 0, 1, 2], indices: [0, 1, 2] },
    { positions: [0, 0, Infinity, 1, 0, 2, 0, 1, 2], indices: [0, 1, 2] },
  ]) {
    const fitting = surfaceFitting(surface);
    assert.equal(fitting.faceSurfaceZ(0.1, 0.1175, 0.4), 0.082);
    assert.equal(fitting.shirtSurfaceZ(0, 0.25, 0.5), 0.14);
  }
  const fitting = surfaceFitting({
    positions: [0, 0, -3, 1, 0, -3, 0, 1, -3],
    indices: [0, 1, 2],
  });
  assert.equal(fitting.faceSurfaceZ(0.1, 0.1175, 0.4), -3 * 0.195);
  assert.equal(fitting.shirtSurfaceZ(0, 0.25, 0.5), -3);
  for (const [x, y] of [[2, 2], [NaN, 0], [0, Infinity]]) {
    assert.equal(fitting.faceSurfaceZ(x, y, 0.4), 0.082);
    assert.equal(fitting.shirtSurfaceZ(0, x, y), 0.14);
  }
});

test("runtime instance UVs address opaque pupils and light sclerae in all three real PNG atlases", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  scene.useRightHandedSystem = true;
  for (let preset = 0; preset < 3; preset++) {
    const config = applyAvatarPreset(preset, DEFAULT_AVATAR);
    const rig = createAvatarRig(scene, config, pool, `atlas UV ${preset}`);
    const controller = new AvatarLodController(scene, pool, rig, config);
    const sample = atlasPixels(
      `public/models/characters/student-eyes/${EYE_PALETTES[preset].atlas}.png`,
    );
    for (const level of ["near", "medium"] as const) {
      controller.update(at(level === "near" ? 0 : 20));
      for (const mesh of rig.head.getChildMeshes())
        mesh.computeWorldMatrix(true);
      const eye = rig.head
        .getChildMeshes()
        .find((mesh) => mesh.metadata?.anatomicalEye && mesh.isEnabled())!;
      const texture = (eye.material as PBRMaterial)
        .albedoTexture as import("@babylonjs/core/Materials/Textures/texture").Texture;
      assert.equal(
        texture.url,
        `/models/characters/student-eyes/${EYE_PALETTES[preset].atlas}.png`,
      );
      for (const landmark of irisLandmarks(level, config))
        for (const offset of [0, -0.008, 0.008]) {
          const local = Vector3.FromArray(landmark.point);
          local.x += offset;
          const target = Vector3.TransformCoordinates(
            local,
            rig.head.computeWorldMatrix(true),
          );
          const camera = target.add(new Vector3(0, 0, 1));
          const hit = scene.pickWithRay(
            new Ray(camera, new Vector3(0, 0, -1), 2),
            (mesh) => mesh === eye,
          );
          const uv = hit?.getTextureCoordinates();
          assert.ok(uv);
          const pixel = sample(uv.x, uv.y, texture.invertY);
          assert.equal(pixel[3], 255);
          if (offset === 0)
            assert.ok(
              Math.max(...pixel.slice(0, 3)) < 20,
              `${preset}/${level} pupil ${pixel}`,
            );
          else
            assert.ok(
              Math.min(...pixel.slice(0, 3)) > 110,
              `${preset}/${level} sclera ${pixel}`,
            );
        }
    }
    rig.root.dispose();
    pool.pruneUnused();
  }
  pool.dispose();
  scene.dispose();
  engine.dispose();
});

test("production eyes preserve licensed sources, UVs and the untouched anatomical head", () => {
  assert.equal(
    hash("client/data/skinned-character-geometry.json"),
    eyes.unchangedHeadBodySha256,
  );
  for (const file of eyes.source.files)
    assert.equal(
      hash("assets/sources/characters/student-eyes/" + file.path),
      file.sha256,
    );
  for (const { atlas } of EYE_PALETTES)
    assert.equal(
      hash(`public/models/characters/student-eyes/${atlas}.png`),
      hash(
        `assets/sources/characters/student-eyes/eyes/materials/${atlas}_eye.png`,
      ),
    );
  assert.equal(eyes.sourceSurfaces.near.excludedTransparentCornealFaces, 490);
  for (const level of ["near", "medium"] as const) {
    const geometry = eyes.levels[level];
    assert.equal(geometry.positions.length, geometry.normals.length);
    assert.equal(geometry.uvs.length, (geometry.positions.length / 3) * 2);
    assert.equal(geometry.indices.length / 3, level === "near" ? 1060 : 172);
    assert.ok(
      [...geometry.positions, ...geometry.normals, ...geometry.uvs].every(
        Number.isFinite,
      ),
    );
    assert.ok(
      geometry.indices.every(
        (index) => index >= 0 && index < geometry.positions.length / 3,
      ),
    );
    for (let i = 0; i < geometry.normals.length; i += 3)
      assert.ok(
        Math.abs(Math.hypot(...geometry.normals.slice(i, i + 3)) - 1) < 1e-6,
      );
  }
});

test("actual production near/medium LOD keeps both pupils visible through head turns and the entire face slider", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  scene.useRightHandedSystem = true;
  let rayCount = 0;
  for (let preset = 0; preset < 6; preset++)
    for (const face of [0, 0.5, 1]) {
      const config = { ...applyAvatarPreset(preset, DEFAULT_AVATAR), face };
      const rig = createAvatarRig(
        scene,
        config,
        pool,
        `eye review ${preset}:${face}`,
      );
      const lod = new AvatarLodController(scene, pool, rig, config);
      assert.ok(
        !rig.head
          .getChildMeshes()
          .some((mesh) => / (?:eye|iris|pupil)$/.test(mesh.name)),
      );
      for (const level of ["near", "medium"] as const)
        for (const angle of [0, 0.65, -0.65]) {
          lod.update(at(level === "near" ? 0 : 20));
          rig.head.rotation.y = angle;
          for (const mesh of rig.root.getChildMeshes())
            mesh.computeWorldMatrix(true);
          const eyeMeshes = rig.head
            .getChildMeshes()
            .filter((mesh) => mesh.metadata?.anatomicalEye);
          const visibleEye = eyeMeshes.find((mesh) => mesh.isEnabled())!;
          assert.equal(eyeMeshes.filter((mesh) => mesh.isEnabled()).length, 1);
          assert.equal(visibleEye.metadata.avatarBodyLod, level);
          const camera = new Vector3(0, rig.eyeHeight + 0.1, 1.03);
          for (const landmark of irisLandmarks(level, config)) {
            const pupil = Vector3.TransformCoordinates(
              Vector3.FromArray(landmark.point),
              rig.head.computeWorldMatrix(true),
            );
            const ray = new Ray(
              camera,
              pupil.subtract(camera).normalize(),
              Vector3.Distance(camera, pupil) + 0.005,
            );
            const hit = scene.pickWithRay(
              ray,
              (mesh) =>
                mesh.isDescendantOf(rig.head) &&
                mesh.isEnabled() &&
                (/ face(?: medium)?$/.test(mesh.name) ||
                  mesh.metadata?.anatomicalEye),
              false,
            );
            assert.equal(
              hit?.pickedMesh,
              visibleEye,
              JSON.stringify({
                preset,
                face,
                level,
                angle,
                side: landmark.side,
                firstHit: hit?.pickedMesh?.name,
              }),
            );
            rayCount++;
          }
        }
      lod.update(at(100));
      assert.ok(
        rig.head
          .getChildMeshes()
          .filter((mesh) => mesh.metadata?.anatomicalEye)
          .every((mesh) => !mesh.isEnabled() && !scene.meshes.includes(mesh)),
      );
      assert.ok(
        lod.counts.farTriangles <= 204,
        "far silhouette must not gain ocular boxes",
      );
      lod.update(at(0));
      assert.equal(
        rig.head
          .getChildMeshes()
          .filter((mesh) => mesh.metadata?.anatomicalEye && mesh.isEnabled())
          .length,
        1,
      );
      rig.root.dispose();
      pool.pruneUnused();
    }
  assert.equal(rayCount, 216);
  pool.dispose();
  scene.dispose();
  engine.dispose();
});

test("ocular instances share two geometries, three opaque atlas materials and bounded resources across edits", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  for (let cycle = 0; cycle < 4; cycle++) {
    const people = Array.from({ length: 12 }, (_, i) =>
      createAvatarRig(
        scene,
        applyAvatarPreset(i % 6, DEFAULT_AVATAR),
        pool,
        `eye cache ${cycle}:${i}`,
      ),
    );
    const meshes = people.flatMap((rig) =>
      rig.head.getChildMeshes().filter((mesh) => mesh.metadata?.anatomicalEye),
    ) as InstancedMesh[];
    assert.equal(meshes.length, 24);
    assert.ok(meshes.every((mesh) => mesh instanceof InstancedMesh));
    assert.equal(new Set(meshes.map((mesh) => mesh.sourceMesh)).size, 6);
    assert.equal(
      new Set(meshes.map((mesh) => mesh.sourceMesh.geometry)).size,
      2,
    );
    const materials = new Set(
      meshes.map((mesh) => mesh.material as PBRMaterial),
    );
    assert.equal(materials.size, 3);
    for (const material of materials) {
      assert.equal(material.transparencyMode, PBRMaterial.PBRMATERIAL_OPAQUE);
      assert.equal(material.albedoTexture?.hasAlpha, false);
      assert.equal(material.albedoTexture?.gammaSpace, true);
      assert.equal(material.clearCoat.isEnabled, true);
      assert.deepEqual(material.albedoColor.asArray(), [1, 1, 1]);
    }
    people[0].root.dispose();
    pool.pruneUnused();
    assert.ok(meshes[12].isEnabled());
    assert.ok(scene.materials.includes(meshes[12].material!));
    for (const rig of people.slice(1)) rig.root.dispose();
    pool.pruneUnused();
    assert.equal(
      scene.materials.filter(
        (material) => material.metadata?.characterSurface === "ocular",
      ).length,
      0,
    );
    assert.equal(
      scene.meshes.filter(
        (mesh) => mesh.name.includes("eyes-") || mesh.metadata?.anatomicalEye,
      ).length,
      0,
    );
    assert.equal(
      scene.geometries.filter((geometry) => geometry.id.includes("eyes-"))
        .length,
      0,
    );
    assert.equal(
      scene.textures.filter((texture) => texture.name.includes("student-eyes/"))
        .length,
      3,
    );
  }
  pool.dispose();
  assert.equal(
    scene.textures.filter((texture) => texture.name.includes("student-eyes/"))
      .length,
    0,
  );
  scene.dispose();
  engine.dispose();
});
