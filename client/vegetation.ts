import { PhotographicGrass, type PhotoGrassStats } from "./photographic-grass";
import { TreeRenderer } from "./tree-renderer";
import { TreeLitter, type TreeLitterStats } from "./tree-litter";
import type { TreeRenderStats } from "./tree-renderer";
import type { TreeAssetFile, TreePilotOptions } from "../shared/tree-asset-types";
import type { TreeSeasonState } from "../shared/tree-season";
export { TreeWindPlugin } from "./tree-wind";
export { attachAuthoredTreeMesh } from "./tree-renderer";
export { decodeTreeRuntimeChunk } from "./tree-asset-loader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { createGrassMaterial, type GrassWindState } from "./grass-material";
import { chunkStaticMesh } from "./static-submesh-chunks";
import { GrassPatchSelection } from "./vegetation-selection";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import "@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration";
import "@babylonjs/core/Shaders/ShadersInclude/instancesVertex";
import "@babylonjs/loaders/glTF";
import earcut from "earcut";
import { BUILDINGS, BOUNDS, MAP, TREES } from "../shared/world";
import {
  LANDCOVER,
  createGrassPatches,
  grassLod,
  grassSurface,
  polygonBounds,
  sampleHash,
  surfaceColor,
  surfaceElevation,
  type GrassPatch,
} from "../shared/vegetation";
import type { Vec3 } from "../shared/types";
import { drapeTriangles, groundHeight, groundNormal } from "../shared/terrain";

export type VegetationTreeOptions = {
  treePilot?: TreePilotOptions;
  treeCatalog?: TreeAssetFile;
};

function authoredSurfaceTexture(scene: Scene, color: string) {
  const base = Color3.FromHexString(color),
    pixels = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) {
    const x = i % 64,
      z = Math.floor(i / 64);
    const variation =
      0.94 +
      sampleHash(Math.floor(x / 3) * 89 + Math.floor(z / 3) * 313) * 0.12;
    pixels[i * 4] = Math.round(base.r * 255 * variation);
    pixels[i * 4 + 1] = Math.round(base.g * 255 * variation);
    pixels[i * 4 + 2] = Math.round(base.b * 255 * variation);
    pixels[i * 4 + 3] = 255;
  }
  const texture = RawTexture.CreateRGBATexture(
    pixels,
    64,
    64,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.name = "authored quiet ground " + color;
  texture.anisotropicFilteringLevel = 2;
  return texture;
}

/** Mapped material patches are below roads and never add collision geometry. */
export function buildLandcover(
  scene: Scene,
  excludeAreas: ReadonlySet<string> = new Set(),
) {
  const groups = new Map<string, Mesh[]>();
  const materials = new Map<string, StandardMaterial>();
  for (const area of LANDCOVER.areas) {
    if (excludeAreas.has(area.osmId)) continue;
    const bounds = polygonBounds(area.points);
    if (
      bounds.maxX < BOUNDS.minX ||
      bounds.minX > BOUNDS.maxX ||
      bounds.maxZ < BOUNDS.minZ ||
      bounds.minZ > BOUNDS.maxZ
    )
      continue;
    const color = surfaceColor(area);
    let material = materials.get(color);
    if (!material) {
      material = new StandardMaterial("mapped ground " + color, scene);
      material.diffuseColor = Color3.White();
      material.diffuseTexture = authoredSurfaceTexture(scene, color);
      material.specularColor.set(0.015, 0.015, 0.015);
      material.backFaceCulling = false;
      material.zOffset = -1;
      material.zOffsetUnits = -1;
      material.metadata = {
        uvMetresPerRepeat: 5,
        surfaceKind: grassSurface(area)
          ? "grass"
          : area.surface === "asphalt"
            ? "asphalt"
            : ["concrete", "paving_stones"].includes(area.surface ?? "")
              ? "concrete"
              : undefined,
      };
      materials.set(color, material);
    }
    const mesh = new Mesh(
      (area.referenceId ? "reference landcover " : "OSM landcover ") +
        area.osmId,
      scene,
    );
    const data = new VertexData();
    const draped = drapeTriangles(
      area.points,
      earcut(area.points.flat(), undefined, 2),
      surfaceElevation(area),
    );
    Object.assign(data, draped);
    data.uvs = [];
    for (let i = 0; i < draped.positions.length; i += 3)
      data.uvs.push(draped.positions[i] / 5, draped.positions[i + 2] / 5);
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.metadata = {
      sourceFootprintId: area.osmId,
      source: area.source,
      referenceId: area.referenceId,
      provenance: area.provenance ?? "OSM mapped surface",
      rawOsmModified: false,
    };
    const group = groups.get(color) ?? [];
    group.push(mesh);
    groups.set(color, group);
  }
  for (const [color, meshes] of groups) {
    const sourceFootprints = meshes.map((mesh) => ({
      id: mesh.metadata.sourceFootprintId,
      referenceId: mesh.metadata.referenceId,
      source: mesh.metadata.source,
    }));
    const merged = Mesh.MergeMeshes(
      meshes,
      true,
      true,
      undefined,
      false,
      false,
    );
    if (merged) {
      merged.name = "mapped surface " + color;
      merged.metadata = {
        vegetation: "mapped-surface",
        attribution: LANDCOVER.attribution,
        terrainDraped: true,
        shadowCaster: false,
        sourceFootprints,
      };
      merged.isPickable = false;
      merged.freezeWorldMatrix();
      chunkStaticMesh(merged);
    }
  }
}

export type VegetationInput = {
  dt: number;
  time: number;
  wind: { x: number; z: number; speed: number };
  daylight: number;
  player: Vec3;
  quality: string;
  season?: TreeSeasonState;
};
export type VegetationStats = TreeRenderStats & {
  treeLitter?: TreeLitterStats;
  mappedTrees: number;
  inferredTrees: number;
  photoInterpretedTrees: number;
  grassTiles: number;
  grassClumps: number;
  visibleGrassTiles: number;
  visibleGrassClumps: number;
  photographicGrass?: PhotoGrassStats;
};

function grassSource(scene: Scene, material: PBRMaterial) {
  const mesh = new Mesh("shared curved 16-blade grass clump", scene),
    data = new VertexData();
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const levels = { low: [] as number[], medium: [] as number[], high: indices };
  for (let blade = 0; blade < 16; blade++) {
    const angle = sampleHash(83 + blade * 31) * Math.PI * 2,
      c = Math.cos(angle),
      s = Math.sin(angle),
      offset = positions.length / 3,
      spread = Math.sqrt(sampleHash(151 + blade * 43)) * 1.15,
      centreAngle = blade * 2.399963,
      cx = Math.cos(centreAngle) * spread,
      cz = Math.sin(centreAngle) * spread,
      height = 0.8 + sampleHash(271 + blade * 29) * 0.4,
      width = 0.022 + sampleHash(991 + blade * 71) * 0.013,
      lean = (sampleHash(331 + blade * 19) - 0.5) * 0.48;
    for (const t of [0, 0.55, 1]) {
      const halfWidth = (width * (1 - t * 0.93)) / 2;
      for (const sign of [-1, 1]) {
        const x = sign * halfWidth + lean * t * t;
        positions.push(cx + c * x, t * height, cz + s * x);
        uvs.push(sign > 0 ? 1 : 0, t);
      }
    }
    const bladeIndices: number[] = [];
    for (let row = 0; row < 2; row++) {
      const i = offset + row * 2;
      bladeIndices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
    indices.push(...bladeIndices);
    if (blade % 2 === 0) levels.medium.push(...bladeIndices);
    if (blade % 4 === 0) levels.low.push(...bladeIndices);
  }
  VertexData.ComputeNormals(positions, indices, normals);
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.material = material;
  mesh.isVisible = false;
  mesh.isPickable = false;
  mesh.metadata = { grassIndicesByQuality: levels, authoredMasterBlades: 16 };
  return mesh;
}

type PatchMesh = { mesh: Mesh; patch: GrassPatch; enabled: boolean };
export class VegetationController {
  readonly stats: VegetationStats;
  private patches: PatchMesh[] = [];
  private grassSelection?: GrassPatchSelection;
  private photographicGrass?: PhotographicGrass;
  private grassBudget = grassLod("");
  private readonly treeRenderer: TreeRenderer;
  private treeLitter?: TreeLitter;
  private preparationRevision?: { grass?: object; litter?: object };
  private sources: Mesh[] = [];
  private materials: (PBRMaterial | StandardMaterial)[] = [];
  private grassMaterial: PBRMaterial;
  private grassIndexLevels!: {
    low: number[];
    medium: number[];
    high: number[];
  };
  private grassWind: GrassWindState = {
    time: 0,
    windX: 0,
    windZ: 0,
    playerX: 0,
    playerY: 0,
    playerZ: 0,
    range: 35,
  };
  private wind = Vector3.Zero();
  private player = Vector3.Zero();
  private lastSelection = -Infinity;
  private previousQuality = "";
  private disposed = false;

  constructor(private scene: Scene, options: VegetationTreeOptions & { skipLegacyGrass?: boolean } = {}) {
    this.grassMaterial = createGrassMaterial(scene, this.grassWind);
    this.materials.push(this.grassMaterial);
    const patches = options.skipLegacyGrass ? [] : createGrassPatches(BOUNDS, BUILDINGS, MAP.paths);
    this.grassSelection = new GrassPatchSelection(patches);
    const source = grassSource(scene, this.grassMaterial);
    this.grassIndexLevels = source.metadata.grassIndicesByQuality;
    this.sources.push(source);
    const scaling = Vector3.One(),
      rotation = Quaternion.Identity(),
      tilt = Quaternion.Identity(),
      yawRotation = Quaternion.Identity(),
      up = Vector3.Up(),
      normal = Vector3.Up(),
      matrix = Matrix.Identity();
    for (const patch of patches) {
      const mesh = source.clone("grass tile " + patch.id, null, true)!;
      mesh.isVisible = true;
      mesh.isPickable = false;
      mesh.position.set(patch.x, 0.003, patch.z);
      mesh.metadata = {
        vegetation: "grass",
        osmMapped: true,
        tile: patch.id,
        terrainAnchored: true,
        shadowCaster: false,
        depthCaster: false,
      };
      const matrices = new Float32Array(patch.points.length * 16);
      patch.points.forEach((point, index) => {
        scaling.set(point.size, point.size, point.size);
        const worldX = patch.x + point.x,
          worldZ = patch.z + point.z,
          n = groundNormal(worldX, worldZ);
        normal.set(n.x, n.y, n.z);
        Quaternion.FromUnitVectorsToRef(up, normal, tilt);
        Quaternion.RotationYawPitchRollToRef(point.yaw, 0, 0, yawRotation);
        tilt.multiplyToRef(yawRotation, rotation);
        this.player.set(point.x, groundHeight(worldX, worldZ), point.z);
        Matrix.ComposeToRef(scaling, rotation, this.player, matrix);
        matrix.copyToArray(matrices, index * 16);
      });
      mesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
      mesh.thinInstanceRefreshBoundingInfo();
      // The shader bends blades by at most 7.1 cm at the 16 m/s wind cap.
      // Keep the full master bounds at every LOD and include that displacement,
      // so a tile cannot disappear while its wind-bent blades are still visible.
      const box = mesh.getBoundingInfo().boundingBox;
      mesh.setBoundingInfo(
        new BoundingInfo(
          box.minimum.subtract(new Vector3(0.1, 0, 0.1)),
          box.maximum.add(new Vector3(0.1, 0, 0.1)),
        ),
      );
      mesh.freezeWorldMatrix();
      mesh.setEnabled(false);
      this.patches.push({ mesh, patch, enabled: false });
    }
    this.stats = {
      treeInstances: 0,
      mappedTrees: TREES.filter((t) => t.provenance === "mapped-osm-node")
        .length,
      inferredTrees: TREES.filter(
        (t) => t.provenance === "inferred-within-mapped-forest",
      ).length,
      photoInterpretedTrees: TREES.filter(
        (t) => t.provenance === "reference-interpreted-not-surveyed",
      ).length,
      grassTiles: patches.length,
      grassClumps: patches.reduce((sum, patch) => sum + patch.points.length, 0),
      visibleGrassTiles: 0,
      visibleGrassClumps: 0,
    };
    this.treeRenderer = new TreeRenderer(scene, { treePilot: options.treePilot, treeCatalog: options.treeCatalog, stats: this.stats });
  }

  async loadPhotographicGrass() {
    const grass = await PhotographicGrass.load(this.scene);
    if (this.disposed || this.scene.isDisposed) { grass.dispose(); return; }
    this.photographicGrass = grass;
    this.stats.photographicGrass = grass.stats;
    for (const {mesh} of this.patches) mesh.dispose(false,false);
    for (const source of this.sources) source.dispose(false,false);
    for (const material of this.materials) material.dispose(false,true);
    this.patches=[]; this.sources=[]; this.materials=[]; this.grassSelection=undefined;
  }

  async loadTrees() {
    await this.treeRenderer.load();
    if (this.disposed || this.scene.isDisposed || this.treeLitter) return;
    const materials = this.treeRenderer.litterMaterials;
    // Baseline comparisons retain the legacy texture/load path. New ground
    // litter borrows only the successfully loaded photographic tree maps.
    if (!materials) return;
    const litter = new TreeLitter(this.scene, materials);
    try { litter.setTrees(this.treeRenderer.litterSources()); }
    catch (error) { litter.dispose(); throw error; }
    this.treeLitter = litter; this.stats.treeLitter = litter.stats;
  }
  setTreeTransform(id: string, position: Vec3, yaw = 0) {
    const changed = this.treeRenderer.setTreeTransform(id, position, yaw);
    if (changed) this.treeLitter?.setTrees(this.treeRenderer.litterSources());
    return changed;
  }
  refreshTreeTransform(id: string) {
    const changed = this.treeRenderer.refreshTreeTransform(id);
    if (changed) this.treeLitter?.setTrees(this.treeRenderer.litterSources());
    return changed;
  }

  update(input: VegetationInput) {
    if (this.disposed || this.scene.isDisposed) return;
    const length = Math.hypot(input.wind.x, input.wind.z);
    const speed = Number.isFinite(input.wind.speed)
      ? Math.max(0, Math.min(16, input.wind.speed))
      : 0;
    this.wind.set(
      length > 1e-6 ? (input.wind.x / length) * speed : 0,
      0,
      length > 1e-6 ? (input.wind.z / length) * speed : 0,
    );
    this.player.set(input.player.x, input.player.y, input.player.z);
    this.treeRenderer.update(input);
    this.treeLitter?.update(input);
    const qualityChanged = this.previousQuality !== input.quality;
    if (qualityChanged) {
      this.grassBudget = grassLod(input.quality);
      const key =
        input.quality === "low"
          ? "low"
          : input.quality === "high"
            ? "high"
            : "medium";
      // One shared index buffer selects 4/8/16 authored blades. Vertex data and
      // conservative bounds retain the complete master, with no extra tile meshes.
      if (!this.photographicGrass) this.sources[0]?.geometry!.setIndices(this.grassIndexLevels[key]);
    }
    const lod = this.grassBudget;
    if (this.photographicGrass) {
      this.photographicGrass.update({time: input.time, quality: input.quality, wind: {x:this.wind.x,z:this.wind.z}, focus: input.player, flowerBloom: input.season?.ground.flowerBloom});
      const photo=this.photographicGrass.stats;
      this.stats.grassTiles=photo.cachedTiles;this.stats.grassClumps=photo.instances;
      this.stats.visibleGrassTiles=photo.activeTiles;this.stats.visibleGrassClumps=photo.instances;
    }
    this.grassWind.time = Number.isFinite(input.time) ? input.time : 0;
    this.grassWind.windX = this.wind.x;
    this.grassWind.windZ = this.wind.z;
    this.grassWind.playerX = input.player.x;
    this.grassWind.playerY = input.player.y;
    this.grassWind.playerZ = input.player.z;
    this.grassWind.range = lod.range;
    if (
      input.time - this.lastSelection < 0.15 &&
      this.previousQuality === input.quality
    )
      return;
    this.lastSelection = input.time;
    this.previousQuality = input.quality;
    if (this.photographicGrass) return;
    const selection = this.grassSelection!;
    if (
      !selection.update(input.player.x, input.player.z, lod.range, lod.tiles) &&
      !qualityChanged
    )
      return;
    this.stats.visibleGrassTiles = selection.selected.length;
    this.stats.visibleGrassClumps = 0;
    for (let i = 0; i < this.patches.length; i++) {
      const patch = this.patches[i];
      const enabled = selection.isSelected(i);
      if (enabled !== patch.enabled) {
        patch.mesh.setEnabled(enabled);
        patch.enabled = enabled;
      }
      if (enabled) {
        patch.mesh.thinInstanceCount = Math.max(
          1,
          Math.floor(patch.patch.points.length * lod.density),
        );
        this.stats.visibleGrassClumps += patch.mesh.thinInstanceCount;
      }
    }
  }

  get grassPreparationRevision(): object | undefined {
    const grass = this.photographicGrass?.shaderPreparationRevision, litter = this.treeLitter?.preparationRevision;
    if (!grass && !litter) return undefined;
    if (this.preparationRevision?.grass !== grass || this.preparationRevision?.litter !== litter)
      this.preparationRevision = { grass, litter };
    return this.preparationRevision;
  }
  beginGrassPreparation(): (() => void) | undefined {
    if (this.disposed || this.scene.isDisposed) return;
    const restoreGrass = this.photographicGrass?.beginShaderPreparation();
    let restoreLitter: (() => void) | undefined;
    try { restoreLitter = this.treeLitter?.beginPreparation(); }
    catch (error) { restoreGrass?.(); throw error; }
    if (!restoreGrass && !restoreLitter) return undefined;
    let restored = false;
    return () => {
      if (restored) return; restored = true;
      try { restoreLitter?.(); } finally { restoreGrass?.(); }
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.photographicGrass?.dispose();
    this.treeLitter?.dispose();
    this.treeRenderer.dispose();
    for (const { mesh } of this.patches) mesh.dispose(false, false);
    for (const source of this.sources) source.dispose(false, false);
    for (const material of this.materials) material.dispose(false, true);
    this.patches = [];
    this.grassSelection = undefined;
    this.sources = [];
  }
}

/** One original tree pack, individual crowns with shared photographic materials. */
export async function loadVegetation(scene: Scene, options: VegetationTreeOptions = {}) {
  const controller = new VegetationController(scene, {...options, skipLegacyGrass:true});
  try {
    await Promise.all([controller.loadTrees(), controller.loadPhotographicGrass()]);
    return controller;
  } catch(error) { controller.dispose(); throw error; }
}
