import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pngFixture } from "./png-fixture";
import { wholeHairVolumeOverlap } from "./hair-fit-fixture";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { AvatarLodController } from "../client/avatar-lod";
import { applyAvatarPreset } from "../client/avatar-presets";
import { DEFAULT_AVATAR } from "../shared/types";
import { irisLandmarks } from "../client/avatar-eyes";
import {
  studentHairGeometry,
  StudentHairTintPlugin,
} from "../client/avatar-hair";
import hair from "../client/data/student-hair.json";
import calibration from "../client/data/student-hair-calibration.json";
import source from "../assets/sources/characters/student-hair/source.json";
import constraints from "../assets/sources/characters/student-hair/constraints.json";
import audit from "../assets/sources/characters/student-hair/geometry-audit.json";
import earRepair from "../assets/sources/characters/student-hair/short04-ear-repair.json";

const bytes = (relative: string) =>
  readFileSync(new URL("../" + relative, import.meta.url));
const digest = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const styles = ["short02", "short04"] as const;
const at = (distance: number) => ({
  distance,
  quality: "low",
  position: { x: 0, y: 0, z: 0 },
  yaw: 0,
});

test("student hair keeps reviewed geometry and all original CC0 UV/alpha source bytes", () => {
  assert.equal(
    digest(bytes("client/data/student-hair.json")),
    source.runtimeGeometrySha256,
  );
  assert.equal(
    digest(
      bytes(
        "assets/sources/characters/student-hair/reviewed-hair-master.blend",
      ),
    ),
    source.editableMasterSha256,
  );
  assert.equal(
    source.derivedFromPrototypeSha256,
    "3926fac7b3819c00e4d16d29d6d2a1d73ce90d7d0dbe157b9881c50d610a5e7c",
  );
  for (const file of source.files) {
    const data = bytes("assets/sources/characters/student-hair/" + file.path);
    assert.equal(digest(data), file.sha256);
    if (/\.(obj|mhclo|mhmat)$/.test(file.path))
      assert.match(data.toString(), /explicitly released as CC0/);
  }
  for (const style of styles) {
    assert.equal(
      digest(
        bytes(`public/models/characters/student-hair/${style}/diffuse.png`),
      ),
      calibration.styles[style].sourceSha256,
    );
    for (const fit of ["plain", "glasses"] as const)
      for (const level of ["near", "medium"] as const) {
        const g = studentHairGeometry(`strands-${style}-${fit}-${level}`);
        assert.equal(
          digest(Buffer.from(JSON.stringify(g))),
          source.geometryVariants[`${style}:${fit}:${level}`],
        );
        assert.equal(g.positions.length, g.normals.length);
        assert.equal(g.uvs.length, (g.positions.length / 3) * 2);
        assert.equal(
          g.indices.length / 3,
          style === "short04"
            ? earRepair.changes[fit].afterTriangles
            : audit.styles[style].fits[fit][level].triangles,
        );
        assert.ok(
          [...g.positions, ...g.normals, ...g.uvs].every(Number.isFinite),
        );
        assert.ok(
          g.indices.every(
            (i) => Number.isInteger(i) && i >= 0 && i < g.positions.length / 3,
          ),
        );
        for (let i = 0; i < g.normals.length; i += 3)
          assert.ok(
            Math.abs(Math.hypot(...g.normals.slice(i, i + 3)) - 1) < 1e-5,
          );
        assert.equal(
          audit.styles[style].fits[fit][level].headSurface
            .visibleAlphaIntersectionSegments,
          0,
        );
        assert.equal(
          audit.styles[style].fits[fit][level].headSurface
            .insideAreaGridSamplesOver1mm,
          0,
        );
      }
  }
  assert.deepEqual(
    hair.styles.short04.plain.near,
    hair.styles.short04.plain.medium,
  );
  assert.deepEqual(
    hair.styles.short04.glasses.near,
    hair.styles.short04.glasses.medium,
  );
});

test("whole triangles clear the actual ear and glasses volumes in both retained source LODs", () => {
  for (const style of styles)
    for (const fit of ["plain", "glasses"] as const)
      for (const level of ["near", "medium"] as const) {
        const g = studentHairGeometry(`strands-${style}-${fit}-${level}`),
          volumes = [
            ...(style === "short04" ? earRepair.volumes : constraints.ears),
            ...(fit === "glasses" ? constraints.temples : []),
          ];
        const area = wholeHairVolumeOverlap(g, volumes);
        assert.ok(area < 1e-8, `${style}/${fit}/${level} overlap ${area}m2`);
      }
});

test("Alex and Sam replace their cap directly; head transforms, glasses and medium/far return remain consistent", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  scene.useRightHandedSystem = true;
  for (const preset of [0, 3])
    for (const glasses of [false, true])
      for (const face of [0, 1]) {
        const config = {
            ...applyAvatarPreset(preset, DEFAULT_AVATAR),
            glasses,
            face,
          },
          rig = createAvatarRig(
            scene,
            config,
            pool,
            `short hair ${preset}:${glasses}:${face}`,
          ),
          lod = new AvatarLodController(scene, pool, rig, config);
        const meshes = rig.head
          .getChildMeshes()
          .filter((m) => m.metadata?.avatarHair) as InstancedMesh[];
        assert.equal(meshes.length, 2);
        assert.ok(meshes.every((m) => m instanceof InstancedMesh));
        assert.equal(
          rig.head.getChildMeshes().filter((m) => m.name.endsWith(" hair"))
            .length,
          2,
        );
        const eyeHeight = rig.eyeHeight;
        const frames = rig.head
          .getChildMeshes()
          .find((mesh) => mesh.name.endsWith(" glasses frames"));
        assert.equal(!!frames, glasses);
        rig.head.rotation.y = 0.65;
        rig.root.rotation.y = 0.8;
        rig.root.position.set(3, 0.1, -2);
        for (const mesh of meshes) {
          assert.equal(mesh.parent, rig.head);
          assert.equal(mesh.metadata.hairFit, glasses ? "glasses" : "plain");
          const p = Vector3.FromArray(mesh.getVerticesData("position")!, 0),
            actual = Vector3.TransformCoordinates(
              p,
              mesh.computeWorldMatrix(true),
            ),
            expected = Vector3.TransformCoordinates(
              p.multiply(mesh.scaling),
              rig.head.computeWorldMatrix(true),
            );
          assert.ok(Vector3.Distance(actual, expected) < 1e-6);
        }
        for (const distance of [20, 100, 0, 20]) {
          lod.update(at(distance));
          const level =
            distance === 100 ? "far" : distance === 20 ? "medium" : "near";
          assert.equal(lod.level, level);
          assert.equal(
            meshes.filter((m) => m.isEnabled()).length,
            level === "far" ? 0 : 1,
          );
          if (frames) {
            assert.equal(frames.isEnabled(), level !== "far");
            assert.equal(scene.meshes.includes(frames), level !== "far");
          }
          if (level !== "far")
            assert.equal(
              meshes.find((m) => m.isEnabled())!.metadata.avatarBodyLod,
              level,
            );
        }
        assert.equal(rig.eyeHeight, eyeHeight);
        assert.ok(lod.counts.farTriangles <= 204);
        rig.root.dispose();
        pool.pruneUnused();
      }
  for (const preset of [1, 2, 4, 5]) {
    const rig = createAvatarRig(
      scene,
      applyAvatarPreset(preset, DEFAULT_AVATAR),
      pool,
    );
    assert.equal(
      rig.head.getChildMeshes().filter((m) => m.metadata?.avatarHair).length,
      0,
    );
    rig.root.dispose();
  }
  pool.dispose();
  scene.dispose();
  engine.dispose();
});

test("colour edits preserve alpha test and source sharing; last-owner pruning does not accumulate materials", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  for (let cycle = 0; cycle < 4; cycle++) {
    const rigs = [0, 3].flatMap((preset) =>
      [false, true].flatMap((glasses) =>
        [0, 1].map((copy) =>
          createAvatarRig(
            scene,
            {
              ...applyAvatarPreset(preset, DEFAULT_AVATAR),
              glasses,
              hair: cycle % 2 ? "#d4b77b" : "#211e1d",
            },
            pool,
            `resources ${cycle}:${preset}:${glasses}:${copy}`,
          ),
        ),
      ),
    );
    const meshes = rigs.flatMap((rig) =>
      rig.head.getChildMeshes().filter((m) => m.metadata?.avatarHair),
    ) as InstancedMesh[];
    assert.equal(new Set(meshes.map((m) => m.sourceMesh.geometry)).size, 6);
    assert.equal(new Set(meshes.map((m) => m.sourceMesh)).size, 6);
    assert.equal(new Set(meshes.map((m) => m.material)).size, 2);
    const shaderCodes = [];
    for (const material of new Set(
      meshes.map((m) => m.material as PBRMaterial),
    )) {
      assert.equal(
        material.transparencyMode,
        PBRMaterial.PBRMATERIAL_ALPHATEST,
      );
      assert.equal(material.needAlphaBlending(), false);
      assert.equal(material.alphaCutOff, 0.42);
      assert.equal(material.backFaceCulling, false);
      assert.equal(material.twoSidedLighting, true);
      assert.equal(material.forceDepthWrite, true);
      assert.equal(material.albedoTexture!.hasAlpha, true);
      assert.equal(material.albedoTexture!.gammaSpace, true);
      assert.equal(
        material.metadata.paletteColor,
        cycle % 2 ? "#d4b77b" : "#211e1d",
      );
      const plugin = material.pluginManager!.getPlugin(
        "StrahovStudentHairTint",
      ) as StudentHairTintPlugin;
      assert.ok(plugin);
      shaderCodes.push(plugin.getCustomCode("fragment"));
      assert.equal(
        material.albedoTexture!.level,
        calibration.styles[
          material.metadata.hairStyle as (typeof styles)[number]
        ].luminanceScale,
      );
    }
    assert.deepEqual(
      shaderCodes[0],
      shaderCodes[1],
      "different brightness calibration must not hide per-style constants behind the same effect key",
    );
    rigs[0].root.dispose();
    pool.pruneUnused();
    assert.ok(meshes[2].isEnabled());
    for (const rig of rigs.slice(1)) rig.root.dispose();
    pool.pruneUnused();
    assert.equal(scene.materials.filter((m) => m.metadata?.hairTint).length, 0);
    assert.equal(
      scene.meshes.filter((m) => m.name.includes("strands-")).length,
      0,
    );
    assert.equal(
      scene.textures.filter((t) => t.name.includes("student-hair/")).length,
      3,
    );
  }
  pool.dispose();
  assert.equal(
    scene.textures.filter((t) => t.name.includes("student-hair/")).length,
    0,
  );
  scene.dispose();
  engine.dispose();
});

test("original card alpha keeps both pupils unobstructed across near/medium and head turns", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  scene.useRightHandedSystem = true;
  const samplers = Object.fromEntries(
    styles.map((style) => [
      style,
      pngFixture(
        bytes(`public/models/characters/student-hair/${style}/diffuse.png`),
      ),
    ]),
  );
  for (const preset of [0, 3])
    for (const glasses of [false, true]) {
      const config = { ...applyAvatarPreset(preset, DEFAULT_AVATAR), glasses },
        rig = createAvatarRig(scene, config, pool),
        lod = new AvatarLodController(scene, pool, rig, config),
        style = preset === 0 ? "short02" : "short04";
      for (const level of ["near", "medium"] as const)
        for (const yaw of [0, -0.65, 0.65]) {
          lod.update(at(level === "near" ? 0 : 20));
          rig.head.rotation.y = yaw;
          const mesh = rig.head
              .getChildMeshes()
              .find((m) => m.metadata?.avatarHair && m.isEnabled())!,
            inverse = mesh.computeWorldMatrix(true).clone().invert(),
            head = rig.head.computeWorldMatrix(true);
          const geometry = studentHairGeometry(
              `strands-${style}-${glasses ? "glasses" : "plain"}-${level}`,
            ),
            vertices = Array.from(
              { length: geometry.positions.length / 3 },
              (_, i) => Vector3.FromArray(geometry.positions, i * 3),
            );
          for (const landmark of irisLandmarks(level, config)) {
            const pupil = Vector3.TransformCoordinates(
                Vector3.TransformCoordinates(
                  Vector3.FromArray(landmark.point),
                  head,
                ),
                inverse,
              ),
              camera = Vector3.TransformCoordinates(
                new Vector3(0, rig.eyeHeight + 0.1, 1.03),
                inverse,
              ),
              vector = pupil.subtract(camera),
              ray = new Ray(camera, vector.normalizeToNew(), vector.length());
            for (let i = 0; i < geometry.indices.length; i += 3) {
              const [a, b, c] = geometry.indices.slice(i, i + 3),
                hit = ray.intersectsTriangle(
                  vertices[a],
                  vertices[b],
                  vertices[c],
                );
              if (!hit || hit.distance >= ray.length) continue;
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
              assert.ok(
                samplers[style].bilinearChannel(uvX, uvY, 3) < 0.42,
                `${style}/${level}/${glasses}/${yaw} covers pupil ${landmark.side}`,
              );
            }
          }
        }
      rig.root.dispose();
      pool.pruneUnused();
    }
  pool.dispose();
  scene.dispose();
  engine.dispose();
});
