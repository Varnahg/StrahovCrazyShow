import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { AvatarAnimator } from "../client/animation";
import { AvatarLodController } from "../client/avatar-lod";
import { installStudentGarments } from "../client/avatar-garments";
import { applyAvatarPreset, avatarPreset } from "../client/avatar-presets";
import { DEFAULT_AVATAR } from "../shared/types";
import garments from "../client/data/student-garments.json";
import anatomy from "../client/data/skinned-character-geometry.json";

test("garment review preserves pinned anatomy and documents genuine CC0 fitting and painted weights", () => {
  assert.equal(
    createHash("sha256")
      .update(readFileSync("client/data/skinned-character-geometry.json"))
      .digest("hex"),
    garments.unchangedAnatomySha256,
  );
  assert.deepEqual(garments.bones, anatomy.bones);
  assert.equal(
    JSON.parse(
      readFileSync(
        "assets/sources/characters/makehuman-clothes/default_weights.mhw",
        "utf8",
      ),
    ).license,
    "CC0",
  );
  assert.match(
    readFileSync(
      "assets/sources/characters/makehuman-clothes/base.obj",
      "utf8",
    ),
    /explicitly released as CC0/,
  );
  for (const family of [
    "male_casualsuit02",
    "male_casualsuit05",
    "male_casualsuit06",
  ]) {
    assert.match(
      readFileSync(
        `assets/sources/characters/makehuman-clothes/clothes/${family}/${family}.mhclo`,
        "utf8",
      ),
      /explicitly released as CC0/,
    );
  }
});

test("sewn source garments retain UVs, finite outward data and normalized thirteen-bone GPU weights", () => {
  for (const [fit, families] of [
    ["male", garments.families],
    ["female", garments.femaleFamilies],
  ] as const)
    for (const [family, levels] of Object.entries(families))
      for (const [level, parts] of Object.entries(levels))
        for (const [part, g] of Object.entries(parts)) {
          const label = `${fit}/${family}/${level}/${part}`;
          assert.equal(g.positions.length, g.normals.length, label);
          assert.equal(g.uvs.length, (g.positions.length / 3) * 2, label);
          assert.equal(g.colors.length, (g.positions.length / 3) * 4, label);
          assert.ok(
            g.colors.every((v, i) =>
              i % 4 === 3 ? v === 1 : v >= 0.75 && v <= 1,
            ),
            label,
          );
          assert.equal(g.cuffSides.length, g.positions.length / 3, label);
          if (part === "upper")
            for (const side of [-1, 1])
              assert.ok(
                g.cuffSides.filter((v) => v === side).length > 8,
                label + " has physical cuff samples",
              );
          assert.ok(
            [...g.positions, ...g.normals, ...g.matricesWeights].every(
              Number.isFinite,
            ),
            label,
          );
          assert.equal(
            g.matricesWeights.length,
            (g.positions.length / 3) * 4,
            label,
          );
          for (let i = 0; i < g.positions.length / 3; i++) {
            assert.ok(
              Math.abs(g.positions[i * 3]) < 0.6 &&
                g.positions[i * 3 + 1] > -0.03 &&
                g.positions[i * 3 + 1] < 1.65,
              label,
            );
            assert.ok(
              Math.abs(Math.hypot(...g.normals.slice(i * 3, i * 3 + 3)) - 1) <
                1e-5,
              label,
            );
            assert.ok(
              Math.abs(
                g.matricesWeights
                  .slice(i * 4, i * 4 + 4)
                  .reduce((a, b) => a + b, 0) - 1,
              ) < 1e-6,
              label,
            );
            assert.ok(
              g.matricesIndices
                .slice(i * 4, i * 4 + 4)
                .every((i) => i >= 0 && i < 13 && Number.isInteger(i)),
              label,
            );
          }
          assert.ok(
            g.indices.every((i) => i >= 0 && i < g.positions.length / 3),
            label,
          );
        }
});

test("opt-in clothing changes preserve head, hair, eye height, skeleton and chosen colours for all six presets", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  for (let index = 0; index < 6; index++) {
    const config = applyAvatarPreset(index, DEFAULT_AVATAR),
      rig = createAvatarRig(scene, config, pool, "sewn " + index, {
        studentGarments: false,
      });
    const head = rig.head.getChildMeshes(),
      skeleton = rig.skinnedBody!.skeleton,
      eyeHeight = rig.eyeHeight,
      bodyHeight = rig.bodyHeight;
    const result = installStudentGarments(scene, rig, config);
    assert.equal(rig.skinnedBody!.skeleton, skeleton);
    assert.equal(skeleton.bones.length, 13);
    assert.equal(rig.eyeHeight, eyeHeight);
    assert.equal(rig.bodyHeight, bodyHeight);
    assert.deepEqual(rig.head.getChildMeshes(), head);
    assert.ok(head.every((m) => !m.isDisposed()));
    assert.equal(
      result.family,
      index === 2 ? "jacket" : index === 3 ? "tee" : "sweatshirt",
    );
    const upper = rig.skinnedBody!.near.find(
        (m) => m.metadata?.garmentPart === "upper",
      )!,
      pants = rig.skinnedBody!.near.find(
        (m) => m.metadata?.garmentPart === "trousers",
      )!;
    assert.equal(upper.material!.metadata.paletteColor, config.shirt);
    assert.equal(pants.material!.metadata.paletteColor, config.trousers);
    assert.equal(
      (upper.material as PBRMaterial).transparencyMode,
      PBRMaterial.PBRMATERIAL_OPAQUE,
    );
    assert.equal((upper.material as PBRMaterial).alpha, 1);
    const lod = new AvatarLodController(scene, pool, rig, config);
    for (const [distance, level] of [
      [0, "near"],
      [20, "medium"],
      [100, "far"],
    ] as const) {
      assert.equal(
        lod.update({
          distance,
          quality: "low",
          position: { x: 0, y: 0, z: 0 },
          yaw: 0,
        }).level,
        level,
      );
      assert.equal(
        scene.meshes.filter((m) => m.isDescendantOf(rig.root) && m.isEnabled())
          .length,
        level === "far"
          ? 1
          : level === "medium"
            ? lod.counts.medium
            : lod.counts.near,
      );
    }
    lod.update({
      distance: 0,
      quality: "low",
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
    });
    const animation = new AvatarAnimator(rig);
    for (let frame = 0; frame < 120; frame++)
      animation.update(
        { position: { x: 0, y: 0, z: frame * 0.03 }, yaw: 0, emote: "👋" },
        1 / 60,
      );
    skeleton.prepare(true);
    assert.ok([...skeleton.getTransformMatrices(upper)].every(Number.isFinite));
    rig.root.dispose();
  }
  pool.pruneUnused();
  assert.equal(scene.skeletons.length, 0);
  assert.equal(
    scene.materials.filter((m) => m.name.startsWith("CC0 student garment"))
      .length,
    0,
  );
  pool.dispose();
  scene.dispose();
  engine.dispose();
});

test("production creates sewn clothes directly and near/medium/far never reactivate obsolete anatomical outfits", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  for (let index = 0; index < 6; index++) {
    const config = {
        ...applyAvatarPreset(index, DEFAULT_AVATAR),
        badge: "Kvízový nadšenec",
      },
      rig = createAvatarRig(scene, config, pool, "production garment " + index),
      body = rig.skinnedBody!,
      lod = new AvatarLodController(scene, pool, rig, config);
    for (const level of ["near", "medium"] as const) {
      assert.equal(body[level].length, index === 3 ? 4 : 3);
      assert.equal(
        body[level].filter((m) => m.metadata?.studentGarment).length,
        2,
      );
      assert.ok(
        body[level].every(
          (m) =>
            m.metadata?.studentGarment || /anatomy (skin|sleeves)/.test(m.name),
        ),
      );
      assert.ok(
        body[level]
          .filter((m) => m.name.includes("anatomy sleeves"))
          .every((m) => index === 3 && m.metadata.characterSurface === "skin"),
      );
    }
    assert.ok(
      !rig.root
        .getChildMeshes()
        .some((m) =>
          / (?:hood|hoodie pocket|drawstring|jacket zip|jacket collar|jacket pocket)$/.test(
            m.name,
          ),
        ),
    );
    const full = [...body.near, ...body.medium];
    for (const [distance, level] of [
      [20, "medium"],
      [100, "far"],
      [0, "near"],
      [20, "medium"],
    ] as const) {
      lod.update({
        distance,
        quality: "low",
        position: { x: 0, y: 0, z: 0 },
        yaw: 0,
      });
      assert.ok(
        full.every(
          (m) => m.isEnabled() === (m.metadata.avatarBodyLod === level),
        ),
      );
      assert.ok(
        full.every(
          (m) =>
            scene.meshes.includes(m) === (m.metadata.avatarBodyLod === level),
        ),
      );
      assert.ok(
        scene.meshes
          .filter(
            (m) => m.isDescendantOf(rig.root) && m.metadata?.skinnedAnatomy,
          )
          .every((m) => full.includes(m as Mesh)),
      );
    }
    const badge = rig.root
      .getChildMeshes()
      .find((m) => m.name.endsWith(" badge"))!;
    assert.ok(Number.isFinite(badge.position.z) && badge.position.z > 0.08);
    rig.root.dispose();
  }
  pool.pruneUnused();
  pool.dispose();
  scene.dispose();
  engine.dispose();
});

function opening(mesh: Mesh, side: number) {
  const p = mesh.getVerticesData(VertexBuffer.PositionKind)!,
    indices = mesh.getIndices()!;
  const keys = Array.from({ length: p.length / 3 }, (_, i) =>
    [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]].map((v) => v.toFixed(6)).join(","),
  );
  const indexByKey = new Map(keys.map((k, i) => [k, i])),
    edges = new Map<string, number>(),
    pairs = new Map<string, [string, string]>();
  for (let i = 0; i < indices.length; i += 3)
    for (const [a, b] of [
      [indices[i], indices[i + 1]],
      [indices[i + 1], indices[i + 2]],
      [indices[i + 2], indices[i]],
    ]) {
      const edge = [keys[a], keys[b]].sort().join("/");
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
      pairs.set(edge, [keys[a], keys[b]]);
    }
  const adjacent = new Map<string, Set<string>>();
  for (const [edge, count] of edges)
    if (count === 1) {
      const [a, b] = pairs.get(edge)!;
      if (
        Number(a.split(",")[0]) * side <= 0 ||
        Number(b.split(",")[0]) * side <= 0
      )
        continue;
      for (const [x, y] of [
        [a, b],
        [b, a],
      ]) {
        if (!adjacent.has(x)) adjacent.set(x, new Set());
        adjacent.get(x)!.add(y);
      }
    }
  const unseen = new Set(adjacent.keys()),
    loops: number[][] = [];
  while (unseen.size) {
    const first = unseen.values().next().value!;
    unseen.delete(first);
    const pending = [first],
      loop: number[] = [];
    while (pending.length) {
      const v = pending.pop()!;
      loop.push(indexByKey.get(v)!);
      for (const next of adjacent.get(v) ?? [])
        if (unseen.delete(next)) pending.push(next);
    }
    if (loop.length > 5) loops.push(loop);
  }
  return loops.sort(
    (a, b) =>
      b.reduce((s, i) => s + p[i * 3 + 1], 0) / b.length -
      a.reduce((s, i) => s + p[i * 3 + 1], 0) / a.length,
  )[0];
}
function skinnedMean(mesh: Mesh, selected: number[], matrices: Matrix[]) {
  const p = mesh.getVerticesData(VertexBuffer.PositionKind)!,
    weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)!,
    bones = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind)!;
  const result = new Vector3();
  for (const i of selected) {
    const point = new Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    for (let j = 0; j < 4; j++)
      if (weights[i * 4 + j])
        result.addInPlace(
          Vector3.TransformCoordinates(
            point,
            matrices[bones[i * 4 + j]],
          ).scaleInPlace(weights[i * 4 + j]),
        );
  }
  return result.scaleInPlace(1 / selected.length);
}

function posedPoints(
  positions: ArrayLike<number>,
  weights: ArrayLike<number>,
  bones: ArrayLike<number>,
  selected: number[],
  matrices: Matrix[],
) {
  return selected.map((i) => {
    const point = new Vector3(
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2],
    );
    const result = new Vector3();
    for (let j = 0; j < 4; j++)
      if (weights[i * 4 + j])
        result.addInPlace(
          Vector3.TransformCoordinates(
            point,
            matrices[bones[i * 4 + j]],
          ).scaleInPlace(weights[i * 4 + j]),
        );
    return result;
  });
}
function radialExtent(points: Vector3[], axis: Vector3) {
  const centre = points
    .reduce((sum, p) => sum.addInPlace(p), new Vector3())
    .scaleInPlace(1 / points.length);
  return Math.max(
    ...points.map((p) => {
      const d = p.subtract(centre);
      return d.subtractInPlace(axis.scale(Vector3.Dot(d, axis))).length();
    }),
  );
}

test("posed wrist opening and adjacent forearm keep source-scale radius and axial overlap, not bell distortions", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  let maximumOpeningRatio = 0,
    maximumForearmRatio = 0;
  for (const index of [0, 2, 4]) {
    const config = applyAvatarPreset(index, DEFAULT_AVATAR),
      rig = createAvatarRig(scene, config, pool, "cuff radius " + index);
    const animation = new AvatarAnimator(rig),
      sex = index === 2 || index === 4 ? "female" : "male";
    for (let frame = 0; frame < 90; frame++) {
      animation.update(
        {
          position: { x: 0, y: 0, z: 0 },
          yaw: 0,
          emote: frame > 20 ? "👋" : undefined,
        },
        1 / 60,
      );
      rig.skinnedBody!.skeleton.prepare(true);
      const matrices = Array.from({ length: 13 }, (_, i) =>
        Matrix.FromArray(
          rig.skinnedBody!.skeleton.getTransformMatrices(
            rig.skinnedBody!.near[0],
          ),
          i * 16,
        ),
      );
      for (const level of ["near", "medium"] as const) {
        const upper = rig.skinnedBody![level].find(
            (m) => m.metadata?.garmentPart === "upper",
          )!,
          skin = rig.skinnedBody![level].find((m) =>
            m.name.includes("anatomy skin"),
          )!;
        const garment = (
          sex === "female" ? garments.femaleFamilies : garments.families
        )[upper.metadata.garmentFamily as keyof typeof garments.families][level]
          .upper;
        const p = upper.getVerticesData(VertexBuffer.PositionKind)!,
          w = upper.getVerticesData(VertexBuffer.MatricesWeightsKind)!,
          b = upper.getVerticesData(VertexBuffer.MatricesIndicesKind)!;
        const source = anatomy.bodies[sex][level].sleeves,
          sourcePositions = source.positions.slice();
        // Match the renderer's width morph without creating a masked old arm.
        const build = avatarPreset(config.preset).build;
        for (let i = 0; i < sourcePositions.length; i++)
          sourcePositions[i] = source.positions[i] * (i % 3 === 0 ? build : 1);
        for (const side of [-1, 1]) {
          const bone = side < 0 ? 10 : 12,
            axis = Vector3.TransformNormal(
              Vector3.Up(),
              matrices[bone],
            ).normalize();
          const cuff = garment.cuffSides.flatMap((s, i) =>
              s === side ? [i] : [],
            ),
            reference = opening(skin, side);
          const cuffPoints = posedPoints(p, w, b, cuff, matrices),
            skinPoints = posedPoints(
              skin.getVerticesData(VertexBuffer.PositionKind)!,
              skin.getVerticesData(VertexBuffer.MatricesWeightsKind)!,
              skin.getVerticesData(VertexBuffer.MatricesIndicesKind)!,
              reference,
              matrices,
            );
          const openingRatio =
            radialExtent(cuffPoints, axis) / radialExtent(skinPoints, axis);
          maximumOpeningRatio = Math.max(maximumOpeningRatio, openingRatio);
          assert.ok(
            openingRatio < 1.55,
            `preset${index}/${level} cuff radius ratio ${openingRatio}`,
          );
          const overlap = Vector3.Dot(
            skinnedMean(upper, cuff, matrices).subtract(
              skinnedMean(skin, reference, matrices),
            ),
            axis,
          );
          assert.ok(
            overlap > -0.04 && overlap < 0.012,
            `preset${index}/${level} axial overlap ${overlap}`,
          );
          const y =
            cuff.reduce((sum, i) => sum + p[i * 3 + 1], 0) / cuff.length;
          const select = (
            pos: ArrayLike<number>,
            weights: ArrayLike<number>,
            bones: ArrayLike<number>,
          ) =>
            Array.from({ length: pos.length / 3 }, (_, i) => i).filter(
              (i) =>
                pos[i * 3] * side > 0.1 &&
                pos[i * 3 + 1] > y + 0.03 &&
                pos[i * 3 + 1] < y + 0.12 &&
                Array.from({ length: 4 }, (_, j) =>
                  bones[i * 4 + j] === bone ? weights[i * 4 + j] : 0,
                ).reduce((a, c) => a + c, 0) > 0.6,
            );
          const band = select(p, w, b),
            sourceBand = select(
              sourcePositions,
              source.matricesWeights,
              source.matricesIndices,
            );
          assert.ok(band.length > 8 && sourceBand.length > 8);
          const ratio =
            radialExtent(posedPoints(p, w, b, band, matrices), axis) /
            radialExtent(
              posedPoints(
                sourcePositions,
                source.matricesWeights,
                source.matricesIndices,
                sourceBand,
                matrices,
              ),
              axis,
            );
          maximumForearmRatio = Math.max(maximumForearmRatio, ratio);
          assert.ok(
            ratio < 1.65,
            `preset${index}/${level} forearm radius ratio ${ratio}`,
          );
        }
      }
    }
    rig.root.dispose();
  }
  console.info(
    "Maximum posed opening/forearm radial ratios:",
    maximumOpeningRatio,
    maximumForearmRatio,
  );
  pool.dispose();
  scene.dispose();
  engine.dispose();
});
test("actual posed cuffs remain attached to unchanged wrist/upper-arm openings while waving", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  let maximum = 0;
  for (const index of [0, 2, 3, 4]) {
    const config = applyAvatarPreset(index, DEFAULT_AVATAR),
      rig = createAvatarRig(scene, config, pool, "cuff pose " + index);
    const levels = (["near", "medium"] as const).map((level) => {
      const upper = rig.skinnedBody![level].find(
        (m) => m.metadata?.garmentPart === "upper",
      )!;
      const family = upper.metadata
        .garmentFamily as keyof typeof garments.families;
      const skin = rig.skinnedBody![level].find((m) =>
        m.name.includes(family === "tee" ? "anatomy sleeves" : "anatomy skin"),
      )!;
      const source = (
        index === 2 || index === 4 ? garments.femaleFamilies : garments.families
      )[family][level].upper;
      const selections = [-1, 1].map((side) => ({
        reference: opening(skin, side),
        cuff: source.cuffSides.flatMap((s, i) => (s === side ? [i] : [])),
      }));
      return { level, upper, skin, selections };
    });
    const animation = new AvatarAnimator(rig);
    for (let frame = 0; frame < 120; frame++) {
      animation.update(
        {
          position: { x: 0, y: 0, z: 0 },
          yaw: 0,
          emote: frame > 30 ? "👋" : undefined,
        },
        1 / 60,
      );
      rig.skinnedBody!.skeleton.prepare(true);
      const transforms = rig.skinnedBody!.skeleton.getTransformMatrices(
        levels[0].upper,
      );
      const matrices = Array.from({ length: 13 }, (_, i) =>
        Matrix.FromArray(transforms, i * 16),
      );
      for (const { level, upper, skin, selections } of levels)
        for (const { reference, cuff } of selections) {
          assert.ok(reference?.length > 5 && cuff.length > 8);
          const distance = Vector3.Distance(
            skinnedMean(skin, reference, matrices),
            skinnedMean(upper, cuff, matrices),
          );
          maximum = Math.max(maximum, distance);
          assert.ok(
            distance < 0.04,
            `preset${index}/${level} detached cuff ${distance}m`,
          );
        }
    }
    rig.root.dispose();
  }
  console.info("Maximum posed cuff/opening centre separation metres:", maximum);
  pool.dispose();
  scene.dispose();
  engine.dispose();
});
