import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TreeReconstruction } from "../shared/vegetation";

export const TREE_CROWN_NORMAL_WEIGHT = 0.72;
export const TREE_LEAF_TRANSLUCENCY = 0.12;
export const TREE_APPEARANCE_VERSION = "reference-crown-volume-v1";

/** A lighting proxy from the same source crown parameters used by the authored
 * geometry. It is not a measurement of individual leaf normals or tree species. */
export function deriveTreeCrownNormals(
  positions: ArrayLike<number>,
  normals: ArrayLike<number>,
  reference: TreeReconstruction,
): Float32Array {
  if (positions.length !== normals.length || positions.length % 3)
    throw Error("Tree normal/position shape mismatch");
  const output = new Float32Array(normals.length),
    cos = Math.cos(reference.crownAzimuth),
    sin = Math.sin(reference.crownAzimuth);
  const rx = Math.max(0.2, reference.crownDiameter / 2),
    rz = Math.max(0.2, rx * reference.crownMinorRatio),
    ry = Math.max(0.5, reference.height * 0.28),
    centreY = reference.height * 0.7;
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i] - reference.crownOffset[0],
      dz = positions[i + 2] - reference.crownOffset[1],
      localX = dx * cos + dz * sin,
      localZ = -dx * sin + dz * cos;
    let gx = localX / (rx * rx),
      gz = localZ / (rz * rz),
      gy = (positions[i + 1] - centreY) / (ry * ry);
    if (reference.appearance === "conifer") {
      const radial = Math.max(0.05, Math.hypot(localX / rx, localZ / rz));
      gx /= radial;
      gz /= radial;
      gy = 1 / Math.max(1, reference.height * 0.82);
    }
    let vx = gx * cos - gz * sin,
      vz = gx * sin + gz * cos,
      vy = gy,
      length = Math.hypot(vx, vy, vz);
    if (length < 1e-8) {
      vx = 0;
      vy = 1;
      vz = 0;
      length = 1;
    }
    vx /= length;
    vy /= length;
    vz /= length;
    let nx = normals[i],
      ny = normals[i + 1],
      nz = normals[i + 2];
    if (nx * vx + ny * vy + nz * vz < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    nx = nx * (1 - TREE_CROWN_NORMAL_WEIGHT) + vx * TREE_CROWN_NORMAL_WEIGHT;
    ny = ny * (1 - TREE_CROWN_NORMAL_WEIGHT) + vy * TREE_CROWN_NORMAL_WEIGHT;
    nz = nz * (1 - TREE_CROWN_NORMAL_WEIGHT) + vz * TREE_CROWN_NORMAL_WEIGHT;
    length = Math.hypot(nx, ny, nz);
    output[i] = nx / length;
    output[i + 1] = ny / length;
    output[i + 2] = nz / length;
  }
  return output;
}

/** Apply once after bootstrap import or detail streaming. Original asset bytes,
 * POSITION, UV, indices and collision parameters remain untouched. */
export function applyTreeCrownShading(
  mesh: Mesh,
  reference: TreeReconstruction | undefined,
): boolean {
  if (
    !reference ||
    reference.appearance === "bare" ||
    !mesh.name.endsWith("__leaves")
  )
    return false;
  if (mesh.metadata?.treeDerivedShading?.version === TREE_APPEARANCE_VERSION)
    return false;
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind),
    normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  if (!positions || !normals) return false;
  const derived = deriveTreeCrownNormals(positions, normals, reference);
  mesh.makeGeometryUnique();
  mesh.setVerticesData(VertexBuffer.NormalKind, derived, false);
  mesh.metadata = {
    ...mesh.metadata,
    treeDerivedShading: {
      version: TREE_APPEARANCE_VERSION,
      referenceId: reference.id,
      normalWeight: TREE_CROWN_NORMAL_WEIGHT,
      originalAssetsUnmodified: true,
      positionsUVIndicesUnmodified: true,
      source:
        "shared/data/tree-reconstruction.json; IPR 2023/2024 crown interpretation",
      kind: "runtime lighting proxy, not measured leaf normals",
    },
  };
  return true;
}

/** Share the source colour/normal/roughness maps, never paint over them. */
export function configureTreeMaterial(material: PBRMaterial): boolean {
  const foliage = /leaves|needle/.test(material.name);
  material.metallic = 0;
  if (material.albedoTexture) material.albedoTexture.gammaSpace = true;
  if (material.bumpTexture) material.bumpTexture.gammaSpace = false;
  if (material.metallicTexture) material.metallicTexture.gammaSpace = false;
  if (foliage) {
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
    material.alphaCutOff = 0.5;
    material.backFaceCulling = false;
    // Cluster normals already describe the outward crown volume. Flipping them
    // again for arbitrary card backfaces recreates dark patches during orbit.
    material.twoSidedLighting = false;
    material.subSurface.isTranslucencyEnabled = true;
    material.subSurface.translucencyIntensity = TREE_LEAF_TRANSLUCENCY;
    material.subSurface.translucencyColorTexture = material.albedoTexture;
    material.subSurface.translucencyColor = Color3.White();
    material.subSurface.tintColor = Color3.White();
    material.subSurface.useAlbedoToTintTranslucency = false;
    material.subSurface.minimumThickness = 0;
    material.subSurface.maximumThickness = 0.001;
  }
  material.metadata = {
    ...material.metadata,
    cleanReferenceTree: true,
    source:
      "ambientCG CC0 LeafSet001/LeafSet019 (approximation) / Bark012 (surface photogrammetry)",
    treeAppearanceVersion: TREE_APPEARANCE_VERSION,
    derivedCrownLighting: foliage,
    sourcePixelsModified: false,
    leafTranslucency: foliage ? TREE_LEAF_TRANSLUCENCY : 0,
    depthCaster: foliage ? "alpha-test" : "opaque",
  };
  return foliage;
}
