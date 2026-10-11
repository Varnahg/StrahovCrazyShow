import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import {
  createAvatarRig,
  AvatarPrimitivePool,
} from "../client/avatar-renderer";
import { AvatarAnimator } from "../client/animation";
import { AvatarLodController } from "../client/avatar-lod";
import { DEFAULT_AVATAR } from "../shared/types";
import { applyAvatarPreset } from "../client/avatar-presets";
import anatomy from "../client/data/skinned-character-geometry.json";
import sourceMetadata from "../assets/sources/characters/blender-human-base/source.json";

const key = (v: ArrayLike<number>, i: number) =>
  [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]].join(",");
const parts = ["shirt", "sleeves", "skin", "trousers"] as const;
type Form = typeof anatomy.bodies.male.near.shirt;

test("CC0 anatomy source is preserved with bundled explicit licence and immutable hash", () => {
  const source = readFileSync(
    "assets/sources/characters/blender-human-base/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend",
  );
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    anatomy.source.blendSha256,
  );
  assert.equal(anatomy.source.license, "CC0-1.0");
  assert.equal(sourceMetadata.blendSha256, anatomy.source.blendSha256);
  assert.equal(sourceMetadata.licenseFile, "source-license.txt");
  assert.equal(
    sourceMetadata.licenseTextSha256,
    "98d7fbbdecead1b44a1e694de0e1a7175253e2d973195fe595ac8d2997133ad8",
  );
  const licence = readFileSync(
    "assets/sources/characters/blender-human-base/" +
      sourceMetadata.licenseFile,
  );
  assert.equal(
    createHash("sha256").update(licence).digest("hex"),
    sourceMetadata.licenseTextSha256,
  );
  assert.match(
    licence.toString("utf8"),
    /All provided assets are public domain under the CC0 license/,
  );
});

test("source derivatives have finite human-sized geometry, normalized normals and four normalized GPU weights", () => {
  for (const sex of ["male", "female"] as const)
    for (const level of ["near", "medium"] as const)
      for (const part of parts) {
        const g = anatomy.bodies[sex][level][part];
        assert.equal(g.positions.length, g.normals.length);
        assert.equal(g.matricesWeights.length, (g.positions.length / 3) * 4);
        assert.equal(g.matricesIndices.length, g.matricesWeights.length);
        assert.ok(
          [...g.positions, ...g.normals, ...g.uvs, ...g.matricesWeights].every(
            Number.isFinite,
          ),
        );
        for (let i = 0; i < g.positions.length / 3; i++) {
          assert.ok(
            Math.abs(Math.hypot(...g.normals.slice(i * 3, i * 3 + 3)) - 1) <
              1e-5,
          );
          assert.ok(
            Math.abs(
              g.matricesWeights
                .slice(i * 4, i * 4 + 4)
                .reduce((a, b) => a + b, 0) - 1,
            ) < 1e-6,
          );
          assert.ok(
            g.matricesIndices
              .slice(i * 4, i * 4 + 4)
              .every((b) => Number.isInteger(b) && b >= 0 && b < 13),
          );
          assert.ok(
            g.positions[i * 3 + 1] > 0.07 && g.positions[i * 3 + 1] < 1.46,
          );
          assert.ok(Math.abs(g.positions[i * 3]) < 0.4);
        }
        assert.ok(
          g.indices.every(
            (i) => Number.isInteger(i) && i >= 0 && i < g.positions.length / 3,
          ),
        );
      }
});

test("medium reduction preserves every material and cuff seam with identical skin weights", () => {
  for (const sex of ["male", "female"] as const) {
    const maps = Object.fromEntries(
      (["near", "medium"] as const).map((level) => [
        level,
        Object.fromEntries(
          parts.map((part) => {
            const g = anatomy.bodies[sex][level][part];
            return [
              part,
              new Map(
                Array.from({ length: g.positions.length / 3 }, (_, i) => [
                  key(g.positions, i),
                  { i, g },
                ]),
              ),
            ];
          }),
        ),
      ]),
    ) as Record<
      "near" | "medium",
      Record<(typeof parts)[number], Map<string, { i: number; g: Form }>>
    >;
    let seams = 0;
    for (let p = 0; p < parts.length; p++)
      for (let q = p + 1; q < parts.length; q++) {
        for (const [position, vertex] of maps.near[parts[p]]) {
          const peer = maps.near[parts[q]].get(position);
          if (!peer) continue;
          seams++;
          const medium = maps.medium[parts[p]].get(position),
            other = maps.medium[parts[q]].get(position);
          assert.ok(
            medium && other,
            `${sex} ${parts[p]}/${parts[q]} seam ${position} moved during LOD reduction`,
          );
          for (const v of [peer, medium, other]) {
            assert.deepEqual(
              v.g.matricesIndices.slice(v.i * 4, v.i * 4 + 4),
              vertex.g.matricesIndices.slice(vertex.i * 4, vertex.i * 4 + 4),
            );
            assert.deepEqual(
              v.g.matricesWeights.slice(v.i * 4, v.i * 4 + 4),
              vertex.g.matricesWeights.slice(vertex.i * 4, vertex.i * 4 + 4),
            );
            assert.deepEqual(
              v.g.normals.slice(v.i * 3, v.i * 3 + 3),
              vertex.g.normals.slice(vertex.i * 3, vertex.i * 3 + 3),
              "a material split or LOD must not create a hard lighting seam",
            );
          }
        }
      }
    assert.ok(
      seams > 100,
      "shoulders, wrists, neckline and waist must all contribute tested seams",
    );
  }
});

function skin(
  positions: ArrayLike<number>,
  weights: ArrayLike<number>,
  indices: ArrayLike<number>,
  matrices: Float32Array,
) {
  // All vertices in this sample use the same palette. Reuse its matrices and
  // scratch vectors rather than allocating a Matrix/Vector3 per influence.
  const transforms = Array.from({ length: matrices.length / 16 }, (_, i) =>
      Matrix.FromArray(matrices, i * 16),
    ),
    point = new Vector3(),
    transformed = new Vector3(),
    result = new Vector3(),
    out = new Array<number>(positions.length);
  for (let i = 0; i < positions.length / 3; i++) {
    point.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    result.set(0, 0, 0);
    for (let j = 0; j < 4; j++) {
      const w = weights[i * 4 + j];
      if (!w) continue;
      Vector3.TransformCoordinatesToRef(
        point,
        transforms[indices[i * 4 + j]],
        transformed,
      );
      result.x += transformed.x * w;
      result.y += transformed.y * w;
      result.z += transformed.z * w;
    }
    out[i * 3] = result.x;
    out[i * 3 + 1] = result.y;
    out[i * 3 + 2] = result.z;
  }
  return out;
}

test("actual Babylon bone matrices preserve bind pose and deform welded elbow/knee seams while existing IK plants feet", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  const rig = createAvatarRig(
    scene,
    applyAvatarPreset(0, DEFAULT_AVATAR),
    pool,
    "deformation audit",
  );
  const body = rig.skinnedBody!;
  assert.equal(body.skeleton.bones.length, 13);
  for (const bone of anatomy.bones) {
    const node = rig[bone.name as keyof typeof rig] as typeof rig.hips;
    node.rotation.set(0, 0, 0);
  }
  body.skeleton.prepare(true);
  const mesh = body.near.find((m) => m.metadata?.garmentPart === "upper")!,
    rest = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)!,
    indices = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind)!;
  const bound = skin(
    rest,
    weights,
    indices,
    body.skeleton.getTransformMatrices(mesh),
  );
  assert.ok(
    bound.every((n, i) => Math.abs(n - rest[i]) < 2e-6),
    "linked transform nodes must start in the true bind pose",
  );
  const animator = new AvatarAnimator(rig);
  let maxDeformation = 0,
    heelSamples = 0,
    toeOffSamples = 0,
    stationaryContactSamples = 0,
    maximumAnkleLift = 0,
    maximumStartingContactError = 0;
  const previousContact = new Map<
      typeof rig.leftFoot,
      { pivotZ: number; point: Vector3 }
    >(),
    solePivot = new Vector3();
  for (let frame = 0; frame < 180; frame++) {
    rig.root.position.set(0, 0, frame * 0.045);
    animator.update(
      {
        position: rig.root.position,
        yaw: 0,
        emote: frame > 120 ? "👋" : undefined,
      },
      1 / 60,
    );
    body.skeleton.prepare(true);
    const deformed = skin(
      rest,
      weights,
      indices,
      body.skeleton.getTransformMatrices(mesh),
    );
    for (let i = 0; i < deformed.length; i++) {
      assert.ok(Number.isFinite(deformed[i]));
      maxDeformation = Math.max(
        maxDeformation,
        Math.abs(deformed[i] - rest[i]),
      );
    }
    for (const [contact, foot] of [
      [animator.contacts.left, rig.leftFoot],
      [animator.contacts.right, rig.rightFoot],
    ] as const) {
      if (contact.planted) {
        foot.computeWorldMatrix(true);
        // Heel/toe roll intentionally raises the ankle. Its physical sole
        // pivot, evaluated through the actual FK matrix, must stay on y=0.
        const pivotZ = contact.toe < 0 ? -0.085 : 0.191;
        solePivot.set(0, -rig.measurements.ankleHeight, pivotZ);
        const actualContact = Vector3.TransformCoordinates(
          solePivot,
          foot.getWorldMatrix(),
        );
        const ankleError = Vector3.Distance(
          foot.getAbsolutePosition(),
          new Vector3(contact.target.x, contact.target.y, contact.target.z),
        );
        if (frame <= 60) {
          // Startup blends the standing pelvis into support. Audit that
          // transient separately; do not mistake it for a fixed stance.
          maximumStartingContactError = Math.max(
            maximumStartingContactError,
            Math.abs(actualContact.y),
            ankleError,
          );
        } else {
          assert.ok(
            Math.abs(actualContact.y) < 1e-6,
            `rolled sole contact left the floor (frame ${frame}, y ${actualContact.y})`,
          );
          assert.ok(
            ankleError < 3e-6,
            "actual ankle must still reach the rolled target to floating-point precision",
          );
        }
        const previous = previousContact.get(foot);
        if (frame > 61 && previous && previous.pivotZ === pivotZ) {
          assert.ok(
            Vector3.Distance(actualContact, previous.point) < 3e-6,
            `a supported heel/toe pivot must not slide while the body advances (frame ${frame}, ${Vector3.Distance(actualContact, previous.point)}m)`,
          );
          stationaryContactSamples++;
        }
        previousContact.set(foot, { pivotZ, point: actualContact });
        if (contact.toe < -0.01) heelSamples++;
        if (contact.toe > 0.01) toeOffSamples++;
        maximumAnkleLift = Math.max(
          maximumAnkleLift,
          foot.getAbsolutePosition().y -
            rig.measurements.ankleHeight * rig.root.scaling.y,
        );
      } else previousContact.delete(foot);
    }
  }
  assert.ok(
    maximumStartingContactError < 0.003,
    `startup support blend exceeded 3mm: ${maximumStartingContactError}m`,
  );
  assert.ok(
    heelSamples > 10 && toeOffSamples > 10 && stationaryContactSamples > 50,
    "the audit must exercise heel contact, toe-off and fixed world support",
  );
  assert.ok(
    maximumAnkleLift > 0.04,
    "toe-off must actually roll the shoe rather than silently reverting to a flat ankle",
  );
  assert.ok(
    maxDeformation > 0.12,
    "the rig must actually deform the new mesh while walking and gesturing",
  );
  const lod = new AvatarLodController(scene, pool, rig, DEFAULT_AVATAR);
  lod.update({
    distance: 20,
    quality: "low",
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
  });
  assert.ok(
    body.medium.every((m) => m.isEnabled() && scene.meshes.includes(m)),
  );
  assert.ok(
    body.near.every((m) => !m.isEnabled() && !scene.meshes.includes(m)),
  );
  rig.root.dispose();
  assert.equal(scene.skeletons.includes(body.skeleton), false);
  pool.dispose();
  scene.dispose();
  engine.dispose();
});

test("six custom presets share anatomy buffers and keep material, head and camera customization", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  for (let index = 0; index < 6; index++) {
    const config = applyAvatarPreset(index, DEFAULT_AVATAR),
      rig = createAvatarRig(scene, config, pool, "custom " + index),
      copy = createAvatarRig(scene, config, pool, "copy " + index);
    assert.ok(
      rig.skinnedBody!.near.every(
        (mesh, i) => mesh.geometry === copy.skinnedBody!.near[i].geometry,
      ),
    );
    assert.ok(
      rig.skinnedBody!.near.every(
        (mesh, i) => mesh.skeleton !== copy.skinnedBody!.near[i].skeleton,
      ),
    );
    const lod = new AvatarLodController(scene, pool, rig, config);
    assert.ok(lod.counts.nearTriangles < 36000);
    assert.ok(lod.counts.mediumTriangles < 16000);
    assert.ok(lod.counts.farTriangles <= 256);
    assert.ok(lod.counts.near <= 32);
    assert.ok(rig.eyeHeight > 1.52 && rig.eyeHeight < 1.72);
    assert.equal(
      rig.skinnedBody!.near.find((m) => m.metadata?.garmentPart === "upper")!
        .material!.metadata.paletteColor,
      config.shirt,
    );
    assert.equal(
      rig.skinnedBody!.near.find((m) => m.metadata?.garmentPart === "trousers")!
        .material!.metadata.paletteColor,
      config.trousers,
    );
    rig.root.dispose();
    copy.root.dispose();
  }
  pool.pruneUnused();
  assert.equal(scene.skeletons.length, 0);
  pool.dispose();
  scene.dispose();
  engine.dispose();
});

test("material pruning retains detached far-body resources until the last owner is disposed", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  const config = { ...applyAvatarPreset(3, DEFAULT_AVATAR), shirt: "#973a80" };
  const a = createAvatarRig(scene, config, pool, "far owner A"),
    b = createAvatarRig(scene, config, pool, "far owner B");
  const lodA = new AvatarLodController(scene, pool, a, config),
    lodB = new AvatarLodController(scene, pool, b, config);
  const material = b.skinnedBody!.near[0].material!;
  let disposed = false;
  material.onDisposeObservable.add(() => (disposed = true));
  for (const lod of [lodA, lodB])
    lod.update({
      distance: 100,
      quality: "low",
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
    });
  a.root.dispose();
  pool.pruneUnused();
  assert.equal(disposed, false);
  assert.ok(
    scene.materials.includes(material),
    "far-body materials must survive reversible removal from scene.meshes",
  );
  lodB.update({
    distance: 0,
    quality: "low",
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
  });
  assert.equal(b.skinnedBody!.near[0].material, material);
  b.root.dispose();
  pool.pruneUnused();
  assert.equal(disposed, true);
  pool.dispose();
  scene.dispose();
  engine.dispose();
});
