import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Geometry } from "@babylonjs/core/Meshes/geometry";
import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { AvatarRig } from "./avatar-renderer";
import type { AvatarConfig } from "../shared/types";
import { avatarPreset } from "./avatar-presets";
import garments from "./data/student-garments.json";

type Family = keyof typeof garments.families;
type MaterialEntry = { material: PBRMaterial; users: number };
type Cache = {
  geometries: Map<string, Geometry>;
  materials: Map<string, MaterialEntry>;
  textures: Map<Family, { normal: Texture; ao: Texture }>;
};
const CACHES = new WeakMap<Scene, Cache>();
function cacheFor(scene: Scene) {
  let cache = CACHES.get(scene);
  if (!cache) {
    cache = {
      geometries: new Map(),
      materials: new Map(),
      textures: new Map(),
    };
    CACHES.set(scene, cache);
    scene.onDisposeObservable.addOnce(() => {
      for (const t of cache!.textures.values()) {
        t.normal.dispose();
        t.ao.dispose();
      }
      cache!.materials.clear();
      cache!.geometries.clear();
      cache!.textures.clear();
    });
  }
  return cache;
}
function materialFor(
  scene: Scene,
  cache: Cache,
  family: Family,
  color: string,
  part: "upper" | "trousers",
) {
  const key = `${family}:${part}:${color}`;
  let entry = cache.materials.get(key);
  if (entry) {
    entry.users++;
    return { key, ...entry };
  }
  let maps = cache.textures.get(family);
  if (!maps) {
    const normal = new Texture(
      `/models/characters/student-garments/${family}/normal.png`,
      scene,
      false,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    const ao = new Texture(
      `/models/characters/student-garments/${family}/ao.png`,
      scene,
      false,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    normal.gammaSpace = false;
    ao.gammaSpace = false;
    normal.hasAlpha = false;
    ao.hasAlpha = false;
    normal.level = 0.65;
    maps = { normal, ao };
    cache.textures.set(family, maps);
  }
  const material = new PBRMaterial("CC0 student garment " + key, scene);
  material.albedoColor = Color3.FromHexString(color).toLinearSpace();
  material.metallic = 0;
  material.roughness = part === "trousers" ? 0.94 : 0.88;
  material.bumpTexture = maps.normal;
  material.ambientTexture = maps.ao;
  material.ambientTextureStrength = 0.45;
  material.useAmbientInGrayScale = true;
  material.environmentIntensity = 0.65;
  material.alpha = 1;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
  material.sheen.isEnabled = true;
  material.sheen.intensity = 0.14;
  material.sheen.roughness = 0.85;
  material.metadata = {
    paletteColor: color,
    characterSurface: part === "trousers" ? "denim" : "cloth",
    source: "MakeHuman system clothing",
    license: "CC0-1.0",
    asset: family,
  };
  entry = { material, users: 1 };
  cache.materials.set(key, entry);
  return { key, ...entry };
}

/** Reviewed sewn garments used by the production rig. Head/hair and the original
 * CC0 anatomy data are untouched; hands/IK and all thirteen bones are reused. */
export function installStudentGarments(
  scene: Scene,
  rig: AvatarRig,
  config: AvatarConfig,
) {
  const body = rig.skinnedBody;
  if (!body)
    throw new Error("Student garments require the existing skinned rig");
  const preset = avatarPreset(config.preset),
    family: Family =
      preset.outfit === "jacket"
        ? "jacket"
        : preset.outfit === "tee"
          ? "tee"
          : "sweatshirt";
  const sex = config.preset === 2 || config.preset === 4 ? "female" : "male";
  const cache = cacheFor(scene),
    retained = { near: [] as Mesh[], medium: [] as Mesh[] };
  for (const level of ["near", "medium"] as const) {
    for (const mesh of body[level]) {
      if (
        mesh.name.includes("anatomy skin") ||
        (family === "tee" && mesh.name.includes("anatomy sleeves"))
      )
        retained[level].push(mesh);
      else mesh.dispose();
    }
  }
  for (const mesh of rig.root.getChildMeshes())
    if (
      / (?:hood|hoodie pocket|drawstring|jacket zip|jacket collar|jacket pocket)$/.test(
        mesh.name,
      )
    )
      mesh.dispose();
  for (const level of ["near", "medium"] as const)
    for (const part of ["upper", "trousers"] as const) {
      const source = (
        sex === "female" ? garments.femaleFamilies : garments.families
      )[family][level][part];
      const key = `${family}:${sex}:${preset.build}:${level}:${part}`;
      const mesh = new Mesh(
        rig.root.name +
          " " +
          (part === "upper" ? "clothed torso" : "trouser waist") +
          (level === "medium" ? " medium" : ""),
        scene,
      );
      const existing = cache.geometries.get(key);
      if (existing && !existing.isDisposed()) existing.applyToMesh(mesh);
      else {
        const data = new VertexData();
        data.positions = source.positions.map((v, i) =>
          i % 3 === 0 ? v * preset.build : v,
        );
        data.normals = source.normals.map((v, i) => {
          const start = i - (i % 3),
            x = source.normals[start] / preset.build,
            y = source.normals[start + 1],
            z = source.normals[start + 2];
          return (i % 3 === 0 ? x : v) / Math.hypot(x, y, z);
        });
        data.indices = source.indices;
        data.uvs = source.uvs;
        data.colors = source.colors;
        data.matricesIndices = source.matricesIndices;
        data.matricesWeights = source.matricesWeights;
        data.applyToMesh(mesh);
        cache.geometries.set(key, mesh.geometry!);
      }
      const material = materialFor(
        scene,
        cache,
        family,
        part === "upper" ? config.shirt : config.trousers,
        part,
      );
      mesh.material = material.material;
      mesh.onDisposeObservable.addOnce(() => {
        const entry = cache.materials.get(material.key);
        if (entry && --entry.users === 0) {
          entry.material.dispose(false, false);
          cache.materials.delete(material.key);
        }
      });
      mesh.parent = rig.root;
      mesh.skeleton = body.skeleton;
      mesh.numBoneInfluencers = 4;
      mesh.sideOrientation = Material.CounterClockWiseSideOrientation;
      mesh.isPickable = false;
      mesh.useVertexColors = true;
      mesh.hasVertexAlpha = false;
      mesh.metadata = {
        avatarBodyLod: level,
        avatarDetail: "silhouette",
        characterSurface: part === "upper" ? "cloth" : "denim",
        skinnedAnatomy: true,
        studentGarment: true,
        garmentFamily: family,
        garmentPart: part,
        sourceLicense: "CC0-1.0",
      };
      mesh.setBoundingInfo(
        new BoundingInfo(
          new Vector3(-0.9, -0.15, -0.9),
          new Vector3(0.9, 2.2, 0.9),
        ),
      );
      mesh.setEnabled(level === "near");
      retained[level].push(mesh);
    }
  body.near = retained.near;
  body.medium = retained.medium;
  // Award badges sit on this actual sewn panel, not the older tight anatomy.
  const badge = rig.root
    .getChildMeshes()
    .find((m) => m.name.endsWith(" badge"));
  if (badge) {
    const top = (
      sex === "female" ? garments.femaleFamilies : garments.families
    )[family].near.upper;
    const x = badge.position.x / preset.build;
    const y =
      rig.measurements.hipHeight + rig.torso.position.y + badge.position.y;
    let front = -Infinity;
    for (let i = 0; i < top.indices.length; i += 3) {
      const a = top.indices[i] * 3,
        b = top.indices[i + 1] * 3,
        c = top.indices[i + 2] * 3;
      const ax = top.positions[a],
        ay = top.positions[a + 1];
      const bx = top.positions[b],
        by = top.positions[b + 1];
      const cx = top.positions[c],
        cy = top.positions[c + 1];
      const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(denominator) < 1e-10) continue;
      const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denominator;
      const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denominator;
      if (u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001)
        front = Math.max(
          front,
          u * top.positions[a + 2] +
            v * top.positions[b + 2] +
            (1 - u - v) * top.positions[c + 2],
        );
    }
    if (Number.isFinite(front)) badge.position.z = front + 0.006;
  }
  return {
    family,
    source: garments.source.name,
    anatomyUnchangedSha256: garments.unchangedAnatomySha256,
  };
}
