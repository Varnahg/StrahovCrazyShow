import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import {
  buildLandmarkPlan,
  distanceToStadium,
  type LandmarkMaterial,
  type LandmarkPlan,
} from "../shared/landmark-reality";
import { renderBudget, type RenderQuality } from "../shared/render-quality";
import type { Building, Vec3 } from "../shared/types";
import {
  getWorldAssetRoot,
  attachWorldAssetNode,
  disposeEmptyWorldAssetRoots,
} from "./world-asset-identity";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/** Replaces the old stadium and B1 skins; do not overlay those old components.
 * All solid steps, piers and decks are generated from the shared plan supplied
 * to Rapier. The B1 solid itself remains the original OSM building collider. */
export function buildLandmarkReality(options: {
  scene: Scene;
  plan?: LandmarkPlan;
  buildings?: Building[];
  baseElevation?: (building: Building) => number;
  stadiumBaseY?: number;
}) {
  const { scene } = options;
  const plan = options.plan ?? buildLandmarkPlan(options);
  const materials = new Map<LandmarkMaterial, Material>();
  const material = (kind: LandmarkMaterial) => {
    let value = materials.get(kind);
    if (value) return value;
    if (kind.startsWith("stadium-")) {
      const m = new PBRMaterial(`landmark:${kind}`, scene);
      const colors: Record<string, string> = {
        "stadium-glass": "#4b6a80",
        "stadium-frame": "#636c70",
        "stadium-cladding": "#aab3b5",
        "stadium-soffit": "#434a48",
        "stadium-rail": "#242a2a",
      };
      m.albedoColor = Color3.FromHexString(colors[kind]);
      m.metallic =
        kind === "stadium-cladding"
          ? 0.52
          : kind === "stadium-frame"
            ? 0.65
            : kind === "stadium-glass"
              ? 0.1
              : 0.12;
      m.roughness =
        kind === "stadium-glass"
          ? 0.23
          : kind === "stadium-cladding"
            ? 0.48
            : kind === "stadium-frame"
              ? 0.53
              : 0.78;
      m.enableSpecularAntiAliasing = true;
      m.environmentIntensity = kind === "stadium-glass" ? 1 : 0.65;
      m.metadata = {
        sourcePack: "landmark-reality",
        landmarkGlass: kind === "stadium-glass",
        sourceMeasured: false,
        sourceDetail: "user-photo-interpreted-east-pavilion",
      };
      materials.set(kind, m);
      return m;
    }
    if (["glass", "metal", "infill"].includes(kind)) {
      const m = new PBRMaterial(`landmark:${kind}`, scene);
      m.albedoColor = Color3.FromHexString(
        kind === "glass"
          ? "#384542"
          : kind === "infill"
            ? "#8bafa6"
            : "#a2afac",
      );
      m.metallic = kind === "metal" ? 0.78 : kind === "glass" ? 0.12 : 0.02;
      m.roughness = kind === "glass" ? 0.2 : kind === "infill" ? 0.48 : 0.35;
      // Opaque office/stand glazing hides unimplemented interiors while still
      // reflecting the game's actual procedural sky environment.
      m.metadata = {
        landmarkGlass: kind === "glass",
        sourcePack: "landmark-reality",
      };
      value = m;
    } else {
      const m = new StandardMaterial(`landmark:${kind}`, scene);
      const colors: Partial<Record<LandmarkMaterial, string>> = {
        concrete: "#92978e",
        pale: "#b5b8a7",
        trim: "#e0e0d3",
        blind: "#b9b5a3",
        base: "#767783",
        brick: "#926c55",
        seat: "#999b8b",
        roof: "#6d756e",
      };
      m.diffuseColor = Color3.FromHexString(colors[kind] ?? "#a5aa9c");
      m.specularColor.setAll(0.025);
      if (["concrete", "seat", "roof"].includes(kind))
        m.metadata = {
          surfaceKind: "concrete",
          uvMetresPerRepeat: 3,
          sourcePack: "landmark-reality",
        };
      if (kind === "pale")
        m.metadata = {
          surfaceKind: "plaster",
          uvMetresPerRepeat: 3,
          sourcePack: "landmark-reality",
        };
      value = m;
    }
    materials.set(kind, value);
    return value;
  };
  const lods = new Map<
    string,
    {
      near: Mesh[];
      far: Mesh[];
      center: { x: number; z: number };
      radius: number;
      active: boolean;
    }
  >();
  const all: Mesh[] = [];
  const assetRoots = new Map<string, TransformNode>();
  // Derive each pivot from its own source geometry, never from an all-campus
  // batch. Facades created earlier may already own the same building root.
  for (const part of plan.parts) {
    if (assetRoots.has(part.asset.key)) continue;
    const positions = plan.parts
      .filter((p) => p.asset.key === part.asset.key)
      .flatMap((p) => p.positions);
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]);
      maxX = Math.max(maxX, positions[i]);
      minY = Math.min(minY, positions[i + 1]);
      minZ = Math.min(minZ, positions[i + 2]);
      maxZ = Math.max(maxZ, positions[i + 2]);
    }
    assetRoots.set(
      part.asset.key,
      getWorldAssetRoot(scene, part.asset, {
        x: (minX + maxX) / 2,
        y: minY,
        z: (minZ + maxZ) / 2,
      }),
    );
  }
  for (const part of plan.parts) {
    if (!part.indices.length) continue;
    const mesh = new Mesh(
        `landmark ${part.group} ${part.material} ${part.lod}`,
        scene,
      ),
      vd = new VertexData();
    vd.positions = part.positions;
    vd.normals = part.normals;
    vd.indices = part.indices;
    vd.uvs = part.uvs;
    if (part.colors) vd.colors = part.colors;
    vd.applyToMesh(mesh);
    mesh.sideOrientation = Mesh.FRONTSIDE;
    // Shared geometry uses outward CCW normals. Explicit sideOrientation is
    // required in the game's right-handed scene (same as architecture pack).
    mesh.sideOrientation = 1;
    mesh.material = material(part.material);
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.metadata = {
      depthCaster:
        part.material === "glass" ||
        part.material === "stadium-glass" ||
        part.material === "infill" ||
        part.material === "seat"
          ? false
          : "opaque",
      sourcePack: "landmark-reality",
      landmark: part.group,
      lod: part.lod,
      sourceMeasured: false,
    };
    attachWorldAssetNode(mesh, assetRoots.get(part.asset.key)!);
    all.push(mesh);
    if (part.lod !== "both") {
      let group = lods.get(part.group);
      if (!group) {
        group = {
          near: [],
          far: [],
          center: { x: 0, z: 0 },
          radius: 0,
          active: false,
        };
        lods.set(part.group, group);
      }
      group[part.lod].push(mesh);
      mesh.setEnabled(part.lod === "far");
    }
  }
  for (const [name, group] of lods) {
    const parts = plan.parts.filter((p) => p.group === name);
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const p of parts)
      for (let i = 0; i < p.positions.length; i += 3) {
        minX = Math.min(minX, p.positions[i]);
        maxX = Math.max(maxX, p.positions[i]);
        minZ = Math.min(minZ, p.positions[i + 2]);
        maxZ = Math.max(maxZ, p.positions[i + 2]);
      }
    group.center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
    group.radius = Math.hypot(maxX - minX, maxZ - minZ) / 2;
  }
  return {
    plan,
    assetRoots: [...assetRoots.values()],
    meshes: all,
    metrics: {
      meshCount: all.length,
      nearTriangles: plan.parts
        .filter((p) => p.lod !== "far")
        .reduce((s, p) => s + p.indices.length / 3, 0),
      farTriangles: plan.parts
        .filter((p) => p.lod !== "near")
        .reduce((s, p) => s + p.indices.length / 3, 0),
      collisionTriangles: plan.collision.indices.length / 3,
      commonEntrances: plan.entrances.length,
      b1Height: plan.b1Roof?.height ?? null,
      stadiumRows: plan.stadium.rows,
    },
    update(position: Pick<Vec3, "x" | "z">, quality: RenderQuality = "low") {
      const distance = renderBudget(quality).architectureDetailMetres;
      for (const [name, group] of lods) {
        // A 500 m stadium's circumscribed circle reaches almost to the campus;
        // using it would select detailed tiers hundreds of metres too early.
        const d =
          name === "stadium"
            ? distanceToStadium(position)
            : Math.hypot(
                position.x - group.center.x,
                position.z - group.center.z,
              ) - group.radius;
        const near = d < distance + (group.active ? 9 : 0);
        if (near === group.active) continue;
        group.active = near;
        for (const mesh of group.near) mesh.setEnabled(near);
        for (const mesh of group.far) mesh.setEnabled(!near);
      }
    },
    dispose() {
      for (const mesh of all) mesh.dispose();
      disposeEmptyWorldAssetRoots(assetRoots.values());
      for (const m of materials.values()) m.dispose(false, true);
    },
  };
}
export type LandmarkRealityController = ReturnType<typeof buildLandmarkReality>;
