import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import {
  buildOutdoorArtifactPlan,
  type OutdoorArtifactMaterial,
  type OutdoorArtifactPart,
  type OutdoorArtifactPlan,
} from "../shared/outdoor-artifacts";
import { renderBudget, type RenderQuality } from "../shared/render-quality";

/** Generic material response is an interpretation, not a sampled photograph.
 * Painted steel is dielectric; only exposed galvanized surfaces are metallic. */
const SURFACES: Record<
  OutdoorArtifactMaterial,
  readonly [color: string, metallic: number, roughness: number]
> = {
  "outdoor-wood": ["#806342", 0, 0.85],
  "outdoor-dark-metal": ["#38403d", 0.08, 0.68],
  "outdoor-galvanized": ["#969d99", 0.82, 0.48],
  "outdoor-green": ["#426347", 0.02, 0.77],
  "outdoor-black": ["#252826", 0, 0.94],
  "outdoor-board": ["#536154", 0.02, 0.78],
  "outdoor-paper": ["#d8d4bd", 0, 0.9],
  "outdoor-concrete": ["#94968b", 0, 0.94],
  "outdoor-pink": ["#d5639d", 0.02, 0.43],
  "outdoor-pink-dark": ["#913a68", 0.02, 0.54],
  "outdoor-ivory": ["#d7d4c4", 0.02, 0.59],
  "outdoor-glass": ["#43585d", 0.02, 0.2],
};

type Batch = {
  artifactId: string;
  material: OutdoorArtifactMaterial;
  lod: "both" | "near";
  parts: OutdoorArtifactPart[];
  vertices: number;
  indices: number;
};

type ArtifactState = {
  root: TransformNode;
  radius: number;
  skyline: boolean;
  visible: boolean;
  detail: boolean;
  both: Mesh[];
  near: Mesh[];
  bothTriangles: number;
  nearTriangles: number;
};

/** Parts stay grouped by source object, material and detail level. Relative
 * vertices retain precision, while one editable root preserves mapped identity.
 * No source geometry or collider is changed by rendering or distance budgets. */
export function createOutdoorArtifacts(
  scene: Scene,
  plan: OutdoorArtifactPlan = buildOutdoorArtifactPlan(),
) {
  const artifacts = new Map(
    plan.artifacts.map((artifact) => [artifact.id, artifact]),
  );
  if (artifacts.size !== plan.artifacts.length)
    throw new Error("Outdoor artifact IDs must be unique");
  const batches = new Map<string, Batch>();
  const bounds = new Map<string, { minY: number; radiusSquared: number }>();
  // Validate references before allocating scene resources. Group references
  // first, then allocate each destination vertex/index buffer exactly once.
  for (const part of plan.parts) {
    const artifact = artifacts.get(part.artifactId);
    if (!artifact)
      throw new Error(`Missing outdoor artifact source: ${part.artifactId}`);
    if (!part.positions.length || !part.indices.length) continue;
    const lod = part.lod ?? "both";
    const key = `${part.artifactId}/${part.material}/${lod}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = {
        artifactId: part.artifactId,
        material: part.material,
        lod,
        parts: [],
        vertices: 0,
        indices: 0,
      };
      batches.set(key, batch);
    }
    batch.parts.push(part);
    batch.vertices += part.positions.length / 3;
    batch.indices += part.indices.length;
    let bound = bounds.get(part.artifactId);
    if (!bound) {
      bound = { minY: Infinity, radiusSquared: 0 };
      bounds.set(part.artifactId, bound);
    }
    for (let i = 0; i < part.positions.length; i += 3) {
      bound.minY = Math.min(bound.minY, part.positions[i + 1]);
      const dx = part.positions[i] - artifact.x;
      const dz = part.positions[i + 2] - artifact.z;
      bound.radiusSquared = Math.max(bound.radiusSquared, dx * dx + dz * dz);
    }
  }
  const meshes: Mesh[] = [];
  const materials = new Map<OutdoorArtifactMaterial, PBRMaterial>();
  const states = new Map<string, ArtifactState>();
  const material = (kind: OutdoorArtifactMaterial) => {
    let result = materials.get(kind);
    if (result) return result;
    const [color, metallic, roughness] = SURFACES[kind];
    result = new PBRMaterial(`outdoor-artifacts:${kind}`, scene);
    result.albedoColor = Color3.FromHexString(color).toLinearSpace();
    result.metallic = metallic;
    result.roughness = roughness;
    result.enableSpecularAntiAliasing = true;
    result.environmentIntensity = 0.75;
    result.metadata = {
      sourcePack: "outdoor-artifacts",
      surfaceInterpretation: true,
      sourceMeasured: false,
    };
    materials.set(kind, result);
    return result;
  };
  for (const batch of batches.values()) {
    const artifact = artifacts.get(batch.artifactId)!;
    let state = states.get(artifact.id);
    if (!state) {
      const bound = bounds.get(artifact.id)!;
      const root = new TransformNode(
        `world-asset:outdoor:${artifact.id}`,
        scene,
      );
      root.position.set(artifact.x, bound.minY, artifact.z);
      root.metadata = {
        worldAsset: true,
        key: `outdoor:${artifact.id}`,
        kind: artifact.kind,
        sourceId: artifact.osmId || artifact.id,
        sourceType: artifact.osmType,
        sourceUrl: artifact.source,
        sourcePack: "outdoor-artifacts",
        artifactId: artifact.id,
        sourceOrigin: { x: artifact.x, y: bound.minY, z: artifact.z },
        provenance: artifact,
      };
      state = {
        root,
        radius: Math.sqrt(bound.radiusSquared),
        skyline: artifact.kind === "tower",
        visible: true,
        detail: false,
        both: [],
        near: [],
        bothTriangles: 0,
        nearTriangles: 0,
      };
      states.set(artifact.id, state);
    }
    const positions = new Float32Array(batch.vertices * 3);
    const normals = new Float32Array(batch.vertices * 3);
    const uvs = new Float32Array(batch.vertices * 2);
    const indices =
      batch.vertices > 65535
        ? new Uint32Array(batch.indices)
        : new Uint16Array(batch.indices);
    let vertexOffset = 0,
      indexOffset = 0;
    for (const part of batch.parts) {
      for (let i = 0; i < part.positions.length; i += 3) {
        const destination = vertexOffset * 3 + i;
        positions[destination] = part.positions[i] - state.root.position.x;
        positions[destination + 1] =
          part.positions[i + 1] - state.root.position.y;
        positions[destination + 2] =
          part.positions[i + 2] - state.root.position.z;
      }
      normals.set(part.normals, vertexOffset * 3);
      uvs.set(part.uvs, vertexOffset * 2);
      for (const index of part.indices)
        indices[indexOffset++] = index + vertexOffset;
      vertexOffset += part.positions.length / 3;
    }
    const mesh = new Mesh(
      `outdoor-artifact:${artifact.id}:${batch.material}:${batch.lod}`,
      scene,
    );
    const data = new VertexData();
    Object.assign(data, { positions, normals, uvs, indices });
    data.applyToMesh(mesh);
    mesh.parent = state.root;
    mesh.sideOrientation = 1;
    mesh.material = material(batch.material);
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.metadata = {
      sourcePack: "outdoor-artifacts",
      assetKey: state.root.metadata.key,
      artifactId: artifact.id,
      artifactKind: artifact.kind,
      sourceId: artifact.osmId || artifact.id,
      source: artifact.source,
      provenance: artifact,
      lod: batch.lod,
      depthCaster: "opaque",
    };
    mesh.computeWorldMatrix(true);
    state[batch.lod].push(mesh);
    if (batch.lod === "near") {
      state.nearTriangles += batch.indices / 3;
      mesh.setEnabled(false);
    } else state.bothTriangles += batch.indices / 3;
    meshes.push(mesh);
  }
  const objects = [...states.values()];
  const assetRoots = objects.map((state) => state.root);
  const stats = {
    ...plan.stats,
    meshes: meshes.length,
    materials: materials.size,
    nearTriangles: objects.reduce(
      (sum, state) => sum + state.bothTriangles + state.nearTriangles,
      0,
    ),
    farTriangles: objects.reduce((sum, state) => sum + state.bothTriangles, 0),
    visibleArtifacts: objects.length,
    detailArtifacts: 0,
    enabledMeshes: objects.reduce((sum, state) => sum + state.both.length, 0),
    enabledTriangles: objects.reduce(
      (sum, state) => sum + state.bothTriangles,
      0,
    ),
    detail: false,
  };
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.onDisposeObservable.removeCallback(dispose);
    for (const mesh of meshes) mesh.dispose();
    for (const root of assetRoots) root.dispose();
    for (const value of materials.values()) value.dispose(false, false);
    materials.clear();
    stats.visibleArtifacts =
      stats.detailArtifacts =
      stats.enabledMeshes =
      stats.enabledTriangles =
        0;
    stats.detail = false;
  }
  scene.onDisposeObservable.addOnce(dispose);
  return {
    plan,
    meshes,
    assetRoots,
    stats,
    update(x: number, z: number, quality: RenderQuality = "low") {
      if (disposed || !Number.isFinite(x) || !Number.isFinite(z)) return;
      const detailRange = renderBudget(quality).architectureDetailMetres;
      const range = detailRange * 3 + 40;
      let visibleArtifacts = 0,
        detailArtifacts = 0,
        enabledMeshes = 0,
        enabledTriangles = 0;
      // One allocation-free pass; mesh traversal happens only on a transition.
      // Tower silhouette remains eligible even beyond the walkable campus.
      for (const state of objects) {
        const dx = x - state.root.position.x,
          dz = z - state.root.position.z;
        const distanceSquared = dx * dx + dz * dz;
        const radius =
          state.radius *
          Math.max(
            Math.abs(state.root.scaling.x),
            Math.abs(state.root.scaling.z),
          );
        const visibleRange = range + radius + (state.visible ? 12 : 0);
        const visible =
          state.skyline || distanceSquared < visibleRange * visibleRange;
        const nearRange = detailRange + radius + (state.detail ? 8 : 0);
        const detail =
          visible &&
          state.near.length > 0 &&
          distanceSquared < nearRange * nearRange;
        if (visible !== state.visible) {
          state.root.setEnabled(visible);
          state.visible = visible;
        }
        if (detail !== state.detail) {
          for (const mesh of state.near) mesh.setEnabled(detail);
          state.detail = detail;
        }
        if (visible) {
          visibleArtifacts++;
          enabledMeshes += state.both.length;
          enabledTriangles += state.bothTriangles;
          if (detail) {
            detailArtifacts++;
            enabledMeshes += state.near.length;
            enabledTriangles += state.nearTriangles;
          }
        }
      }
      stats.visibleArtifacts = visibleArtifacts;
      stats.detailArtifacts = detailArtifacts;
      stats.enabledMeshes = enabledMeshes;
      stats.enabledTriangles = enabledTriangles;
      stats.detail = detailArtifacts > 0;
    },
    dispose,
  };
}

export type OutdoorArtifactsController = ReturnType<
  typeof createOutdoorArtifacts
>;
