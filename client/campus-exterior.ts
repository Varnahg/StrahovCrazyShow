import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import {
  buildCampusExteriorPlan,
  CAMPUS_EXTERIOR_SOURCE,
  type CampusExteriorPlan,
  type ExteriorMaterial,
} from "../shared/campus-exterior";
import { renderBudget, type RenderQuality } from "../shared/render-quality";
import surfaceManifest from "../shared/data/assets/surfaces-manifest.json";
import {
  getWorldAssetRoot,
  attachWorldAssetNode,
  disposeEmptyWorldAssetRoots,
} from "./world-asset-identity";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

const colors: Record<ExteriorMaterial, string> = {
  turf: "#4c6750",
  ochre: "#a2a168",
  blue: "#397c9d",
  red: "#aa5b55",
  sand: "#d2c7a1",
  paint: "#d8d8c6",
  fence: "#4a5851",
  roof: "#aaa9a1",
  roofSeam: "#787c77",
  concrete: "#8f9288",
  courtGreen:"#74836a",
  courtRed:"#a16050",
};
/** Geometry is batched within one source object, material and detail level. Fences use opaque
 * geometric strands, so there is no alpha-blended chain-link sorting/overdraw. */
export function createCampusExterior(
  scene: Scene,
  plan: CampusExteriorPlan = buildCampusExteriorPlan(),
) {
  const materials = new Map<ExteriorMaterial, PBRMaterial>(),
    meshes: Mesh[] = [];
  const assetRoots = new Map<string, TransformNode>(),
    details = new Map<string, boolean>();
  let courtNormal: Texture | undefined, roofNormal: Texture | undefined;
  const material = (kind: ExteriorMaterial) => {
    let m = materials.get(kind);
    if (m) return m;
    m = new PBRMaterial(`campus-exterior:${kind}`, scene);
    m.albedoColor = Color3.FromHexString(colors[kind]).toLinearSpace();
    m.metallic = kind === "fence" || kind === "roofSeam" ? 0.58 : 0;
    m.roughness = kind === "fence" ? 0.63 : kind === "roofSeam" ? 0.52 : 0.94;
    m.backFaceCulling = false;
    // Millimetre offsets alone are below a distant 24-bit depth buffer's
    // precision. An explicit depth bias keeps painted layers stable in motion.
    m.zOffset =
      kind === "paint"
        ? -4
        : kind === "blue"
          ? -3
          : ["turf", "ochre", "red", "sand", "roof", "courtGreen", "courtRed"].includes(kind)
            ? -1
            : 0;
    m.zOffsetUnits = m.zOffset;
    // Reuse the installed original CC0 channels as restrained microgeometry,
    // keeping the observed court colors rather than repainting them as grass.
    if (
      typeof document !== "undefined" &&
      ["turf", "ochre", "blue", "red", "roof", "courtGreen", "courtRed"].includes(kind)
    ) {
      const roof = kind === "roof"||kind==="courtGreen"||kind==="courtRed";
      let t = roof ? roofNormal : courtNormal;
      if (!t) {
        const family = surfaceManifest.assets.find(
          (a) => a.id === (roof ? "Concrete034" : "Grass001"),
        )!;
        t = new Texture(family.channels.normalgl.url, scene, false, false);
        t.gammaSpace = false;
        t.uScale = 1 / family.metresPerRepeat;
        t.vScale = 1 / (family.metresPerRepeatV ?? family.metresPerRepeat);
        t.level = roof ? 0.12 : 0.07;
        if (roof) roofNormal = t;
        else courtNormal = t;
      }
      m.bumpTexture = t;
    }
    m.metadata = {
      sourcePack: "campus-exterior",
      surfaceInterpretation: true,
      source: CAMPUS_EXTERIOR_SOURCE.ortho,
    };
    materials.set(kind, m);
    return m;
  };
  for (const p of plan.parts) {
    let root = assetRoots.get(p.asset.key);
    if (!root) {
      const court = plan.courts.find((c) => c.osmId === p.asset.sourceId);
      const points = court?.points ?? plan.shopRoof.points;
      const x = points.reduce((s, v) => s + v[0], 0) / points.length,
        z = points.reduce((s, v) => s + v[1], 0) / points.length;
      root = getWorldAssetRoot(scene, p.asset, { x, y: 0, z });
      assetRoots.set(p.asset.key, root);
    }
    const mesh = new Mesh(
        `campus-exterior ${p.group} ${p.material} ${p.lod}`,
        scene,
      ),
      data = new VertexData();
    Object.assign(data, {
      positions: p.positions,
      indices: p.indices,
      normals: p.normals,
      uvs: p.uvs,
    });
    data.applyToMesh(mesh);
    mesh.sideOrientation = 1;
    mesh.material = material(p.material);
    mesh.receiveShadows = p.material !== "fence";
    mesh.isPickable = false;
    mesh.metadata = {
      sourcePack: "campus-exterior",
      exteriorGroup: p.group,
      lod: p.lod,
      depthCaster:
        p.material === "roof" || p.material === "roofSeam" ? "opaque" : false,
    };
    attachWorldAssetNode(mesh, root);
    if (p.lod === "near") mesh.setEnabled(false);
    meshes.push(mesh);
  }
  const stats = {
    meshes: meshes.length,
    materials: materials.size,
    courts: plan.courts.length,
    nearTriangles: plan.parts.reduce((s, p) => s + p.indices.length / 3, 0),
    farTriangles: plan.parts
      .filter((p) => p.lod === "both")
      .reduce((s, p) => s + p.indices.length / 3, 0),
    collisionTriangles: plan.collision.indices.length / 3,
    gates: plan.gates.length,
    detail: false,
  };
  return {
    plan,
    meshes,
    assetRoots: [...assetRoots.values()],
    stats,
    update(x: number, z: number, quality: RenderQuality = "low") {
      const range = renderBudget(quality).architectureDetailMetres;
      for (const court of plan.courts) {
        const key = `court:osm:way:${court.osmId}`,
          previous = details.get(key) ?? false;
        const near =
          Math.hypot(x - court.center.x, z - court.center.z) -
            Math.hypot(court.width, court.length) / 2 <
          range + (previous ? 8 : 0);
        if (near === previous) continue;
        details.set(key, near);
        for (const mesh of meshes)
          if (mesh.metadata.assetKey === key && mesh.metadata.lod === "near")
            mesh.setEnabled(near);
      }
      stats.detail = [...details.values()].some(Boolean);
    },
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      disposeEmptyWorldAssetRoots(assetRoots.values());
      for (const m of materials.values()) m.dispose(false, false);
      courtNormal?.dispose();
      roofNormal?.dispose();
    },
  };
}
export type CampusExteriorController = ReturnType<typeof createCampusExterior>;
