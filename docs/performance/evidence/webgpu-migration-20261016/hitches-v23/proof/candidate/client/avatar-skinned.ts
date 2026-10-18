import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Bone } from "@babylonjs/core/Bones/bone";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Geometry } from "@babylonjs/core/Meshes/geometry";
import { Material } from "@babylonjs/core/Materials/material";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AvatarConfig } from "../shared/types";
import type { AvatarRig, AvatarMeshFactory } from "./avatar-renderer";
import anatomy from "./data/skinned-character-geometry.json";
import { avatarPreset } from "./avatar-presets";

export type SkinnedAvatarBody = {
  skeleton: Skeleton;
  near: Mesh[];
  medium: Mesh[];
};

const GEOMETRIES = new WeakMap<Scene, Map<string, Geometry>>();
const PARTS = ["shirt", "sleeves", "skin", "trousers"] as const;
export type AnatomyBodyPart = (typeof PARTS)[number];

/** Source anatomy is reposed once offline. The game animates the original IK
 * pivots; GPU weights deform a continuous elbow/knee instead of rotating caps. */
export function createSkinnedAvatarBody(
  scene: Scene,
  rig: AvatarRig,
  config: AvatarConfig,
  factory: AvatarMeshFactory,
  options: { parts?: readonly AnatomyBodyPart[] } = {},
): SkinnedAvatarBody | undefined {
  if (!factory.material) return undefined;
  const preset = avatarPreset(config.preset);
  const sex = config.preset === 2 || config.preset === 4 ? "female" : "male";
  const skeleton = new Skeleton(
    rig.root.name + " continuous anatomy",
    rig.root.name,
    scene,
  );
  // Bind matrices deliberately exclude root placement/height and the relaxed
  // starting pose. Each linked node is relative to the matching bone parent.
  const nodes = anatomy.bones.map(
    ({ name }) => rig[name as keyof AvatarRig] as TransformNode,
  );
  for (const [index, descriptor] of anatomy.bones.entries()) {
    const node = nodes[index];
    const local = Matrix.Translation(
      node.position.x,
      node.position.y,
      node.position.z,
    );
    const bone = new Bone(
      descriptor.name,
      skeleton,
      descriptor.parent === null ? null : skeleton.bones[descriptor.parent],
      local,
      local,
      local,
      index,
    );
    bone.linkTransformNode(node);
  }
  skeleton.useTextureToStoreBoneMatrices = true;
  let shared = GEOMETRIES.get(scene);
  if (!shared) GEOMETRIES.set(scene, (shared = new Map()));
  const result: SkinnedAvatarBody = { skeleton, near: [], medium: [] };
  for (const level of ["near", "medium"] as const) {
    for (const part of options.parts ?? PARTS) {
      const authored = anatomy.bodies[sex][level][part];
      const key = `${sex}:${preset.build}:${level}:${part}`;
      const mesh = new Mesh(
        rig.root.name +
          " " +
          (part === "shirt"
            ? "clothed torso"
            : part === "trousers"
              ? "trouser waist"
              : "anatomy " + part) +
          (level === "medium" ? " medium" : ""),
        scene,
      );
      let geometry = shared.get(key);
      if (geometry?.isDisposed()) geometry = undefined;
      if (geometry) geometry.applyToMesh(mesh);
      else {
        const data = new VertexData();
        data.positions = authored.positions.map((value, index) =>
          index % 3 === 0 ? value * preset.build : value,
        );
        // Re-normalize the inverse-transpose normal for the body-width morph.
        data.normals = authored.normals.map((value, index) => {
          const start = index - (index % 3);
          const x = authored.normals[start] / preset.build;
          const y = authored.normals[start + 1],
            z = authored.normals[start + 2];
          return (index % 3 === 0 ? x : value) / Math.hypot(x, y, z);
        });
        data.indices = authored.indices;
        data.uvs = authored.uvs;
        data.matricesIndices = authored.matricesIndices;
        data.matricesWeights = authored.matricesWeights;
        data.applyToMesh(mesh);
        shared.set(key, mesh.geometry!);
      }
      const bareArms = part === "sleeves" && preset.outfit === "tee";
      const surface =
        part === "skin" || bareArms
          ? "skin"
          : part === "trousers"
            ? "denim"
            : "cloth";
      const color =
        surface === "skin"
          ? config.skin
          : surface === "denim"
            ? config.trousers
            : config.shirt;
      const material = factory.material(color, surface);
      mesh.material = material;
      factory.retainMaterial?.(material);
      mesh.onDisposeObservable.addOnce(() =>
        factory.releaseMaterial?.(material),
      );
      mesh.parent = rig.root;
      mesh.skeleton = skeleton;
      mesh.numBoneInfluencers = 4;
      mesh.sideOrientation = Material.CounterClockWiseSideOrientation;
      mesh.isPickable = false;
      mesh.metadata = {
        avatarBodyLod: level,
        avatarDetail: "silhouette",
        characterSurface: surface,
        source: "Blender Studio Human Base Meshes v1.4.1",
        sourceLicense: "CC0-1.0",
        skinnedAnatomy: true,
      };
      // Skinning changes bounds independently of the static imported vertices.
      // Conservative rig-local bounds cover raised hands and a bent knee.
      mesh.setBoundingInfo(
        new BoundingInfo(
          new Vector3(-0.85, -0.15, -0.85),
          new Vector3(0.85, 2.2, 0.85),
        ),
      );
      mesh.setEnabled(level === "near");
      result[level].push(mesh);
    }
  }
  rig.root.onDisposeObservable.addOnce(() => skeleton.dispose());
  return result;
}
