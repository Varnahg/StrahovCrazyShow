import { PhotographicGrass, type PhotoGrassStats } from "./photographic-grass";
import { applyTreeCrownShading, configureTreeMaterial } from "./tree-appearance";
import { TreeWindPlugin, type TreeWindState } from "./tree-wind";
export { TreeWindPlugin } from "./tree-wind";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { ShadowDepthWrapper } from "@babylonjs/core/Materials/shadowDepthWrapper";
import { createWebGpuShadowDepthWrapper } from "./webgpu-shadow-readiness";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
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
  treeDetailLevel,
} from "../shared/vegetation";
import type { Vec3 } from "../shared/types";
import { drapeTriangles, groundHeight, groundNormal } from "../shared/terrain";

/** Authored buffers are tree-local in every LOD. Bootstrap glTF nodes carry
 * the historical world translation; streamed chunks carry only local buffers.
 * Discard that node transform exactly once and use the same shared root for
 * both paths, refreshing culling/shadow bounds even for frozen/late meshes. */
export function attachAuthoredTreeMesh(mesh: Mesh, root: TransformNode) {
  mesh.unfreezeWorldMatrix();
  mesh.parent = root;
  mesh.rotationQuaternion = Quaternion.Identity();
  mesh.rotation.setAll(0);
  mesh.scaling.setAll(1);
  mesh.position.setAll(0);
  mesh.computeWorldMatrix(true);
  mesh.refreshBoundingInfo();
  mesh.freezeWorldMatrix();
}

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
    const mesh = new Mesh("OSM landcover " + area.osmId, scene);
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
    const group = groups.get(color) ?? [];
    group.push(mesh);
    groups.set(color, group);
  }
  for (const [color, meshes] of groups) {
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
};
export type VegetationStats = {
  treeInstances: number;
  mappedTrees: number;
  inferredTrees: number;
  photoInterpretedTrees: number;
  grassTiles: number;
  grassClumps: number;
  visibleGrassTiles: number;
  visibleGrassClumps: number;
  uniqueTreeModels?: number;
  treeDetailCounts?: [number, number, number];
  activeTreeTriangles?: number;
  loadedTreeMeshes?: number;
  pendingTreeLoads?: number;
  bootstrapBytes?: number;
  loadError?: string;
  photographicGrass?: PhotoGrassStats;
};

type TreeChunkAccessor = {
  componentType: number;
  count: number;
  components: number;
  byteOffset: number;
  byteLength: number;
};
type TreeChunkPrimitive = {
  name: string;
  material: number;
  attributes: Record<string, TreeChunkAccessor>;
  indices: TreeChunkAccessor;
};
type TreeRuntimeManifest = {
  bootstrap: string;
  bootstrapBytes: number;
  materialNames: string[];
  trees: Record<string, Record<string, { url: string; bytes: number }>>;
};
/** Lossless attributes from the authored GLB; no triangle simplification occurs here. */
export function decodeTreeRuntimeChunk(buffer: ArrayBuffer) {
  const length = new DataView(buffer).getUint32(0, true);
  if (length < 1 || length + 4 > buffer.byteLength)
    throw new Error("Invalid tree chunk header");
  const metadata = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 4, length)),
  ) as {
    version: number;
    id: string;
    lod: number;
    primitives: TreeChunkPrimitive[];
  };
  if (metadata.version !== 1 || ![0, 1].includes(metadata.lod))
    throw new Error("Invalid tree chunk version or LOD");
  const read = (a: TreeChunkAccessor) => {
    const start = 4 + length + a.byteOffset;
    if (
      start + a.byteLength > buffer.byteLength ||
      a.count * a.components * (a.componentType === 5123 ? 2 : 4) !==
        a.byteLength
    )
      throw new Error("Invalid tree attribute bounds");
    return a.componentType === 5126
      ? new Float32Array(buffer, start, a.count * a.components)
      : a.componentType === 5123
        ? new Uint16Array(buffer, start, a.count * a.components)
        : new Uint32Array(buffer, start, a.count * a.components);
  };
  return {
    ...metadata,
    primitives: metadata.primitives.map((p) => ({
      name: p.name,
      material: p.material,
      positions: read(p.attributes.POSITION) as Float32Array,
      normals: read(p.attributes.NORMAL) as Float32Array,
      uvs: read(p.attributes.TEXCOORD_0) as Float32Array,
      indices: read(p.indices) as Uint16Array | Uint32Array,
    })),
  };
}

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
  private trees: Mesh[] = [];
  private treeContainer?: AssetContainer;
  private treeGroups: {
    id: string;
    x: number;
    z: number;
    root: TransformNode;
    lods: Mesh[][];
    active: number;
    desired: number;
  }[] = [];
  private treeRuntime?: TreeRuntimeManifest;
  private sharedTreeMaterials: PBRMaterial[] = [];
  private loadingTrees = new Set<string>();
  private failedTrees = new Set<string>();
  private detailCache = new Map<string, number>();
  private loadControllers = new Set<AbortController>();
  private treeWind: TreeWindState = { time: 0, x: 0, z: 0 };
  private treeShadows: ShadowDepthWrapper[] = [];
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

  constructor(private scene: Scene, options: { skipLegacyGrass?: boolean } = {}) {
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
    try {
      const response = await fetch("/models/vegetation/runtime/manifest.json");
      if (!response.ok)
        throw new Error("Tree runtime manifest HTTP " + response.status);
      this.treeRuntime = (await response.json()) as TreeRuntimeManifest;
      const container = await LoadAssetContainerAsync(
        this.treeRuntime.bootstrap,
        this.scene,
      );
      if (this.disposed || this.scene.isDisposed) {
        container.dispose();
        return;
      }
      this.treeContainer = container;
      container.addAllToScene();
      const groups = new Map(
        TREES.map((tree) => {
          const root = new TransformNode(
            "Native source tree " + tree.osmId,
            this.scene,
          );
          root.position.set(tree.x, groundHeight(tree.x, tree.z), tree.z);
          root.metadata = {
            sourceTreeId: tree.osmId,
            independentlyAuthored: true,
            terrainAnchored: true,
            provenance: tree.provenance,
          };
          return [
            tree.osmId,
            {
              id: tree.osmId,
              x: tree.x,
              z: tree.z,
              root,
              lods: [[], [], []] as Mesh[][],
              active: 2,
              desired: 2,
            },
          ];
        }),
      );
      for (const material of container.materials) {
        if (!(material instanceof PBRMaterial)) continue;
        if (configureTreeMaterial(material)) {
          new TreeWindPlugin(material, this.treeWind);
          const wrapper = createWebGpuShadowDepthWrapper(material, this.scene);
          material.shadowDepthWrapper = wrapper;
          this.treeShadows.push(wrapper);
        }
      }
      this.sharedTreeMaterials = this.treeRuntime.materialNames.map((name) => {
        const material = container.materials.find(
          (candidate) => candidate.name === name,
        );
        if (!(material instanceof PBRMaterial))
          throw new Error("Missing shared tree material " + name);
        return material;
      });
      for (const mesh of container.meshes) {
        if (!(mesh instanceof Mesh) || !mesh.getTotalVertices()) continue;
        const match = /^tree__(.+)__lod([012])__(bark|leaves)$/.exec(mesh.name);
        const group = match ? groups.get(match[1]) : undefined;
        if (!match || !group) {
          mesh.setEnabled(false);
          continue;
        }
        const placement = TREES.find((tree) => tree.osmId === match[1])!;
        const lod = Number(match[2]);
        mesh.isVisible = true;
        mesh.isPickable = false;
        mesh.receiveShadows = true;
        mesh.metadata = {
          vegetation: "tree",
          provenance: placement.provenance,
          osmId: placement.osmId,
          terrainAnchored: true,
          sourceTreeModel: match[1],
          detailLevel: lod,
          appearance: placement.reconstruction?.appearance,
          shadowCaster: true,
          depthCaster: match[3] === "leaves" ? "alpha-test" : "opaque",
          windDeformed: match[3] === "leaves",
        };
        applyTreeCrownShading(mesh, placement.reconstruction);
        mesh.setEnabled(lod === 2);
        attachAuthoredTreeMesh(mesh, group.root);
        group.lods[lod].push(mesh);
        this.trees.push(mesh);
      }
      this.treeGroups = [...groups.values()];
      for (const [id, group] of groups)
        if (!group.lods[2].some((mesh) => mesh.name.endsWith("__bark")))
          throw new Error(
            "Clean tree pack is missing retained branch geometry for " + id,
          );
      this.stats.treeInstances = TREES.length;
      this.stats.uniqueTreeModels = this.treeGroups.length;
      this.stats.treeDetailCounts = [0, 0, this.treeGroups.length];
      this.stats.loadedTreeMeshes = this.trees.length;
      this.stats.bootstrapBytes = this.treeRuntime.bootstrapBytes;
    } catch (error) {
      this.stats.loadError =
        error instanceof Error ? error.message : String(error);
      console.warn("Vegetation tree asset unavailable", error);
    }
  }

  /** Independent tree editing refreshes frozen children and their world bounds. */
  setTreeTransform(id: string, position: Vec3, yaw = 0) {
    const tree = this.treeGroups.find((entry) => entry.id === id);
    if (!tree) return false;
    tree.root.position.set(position.x, position.y, position.z);
    tree.root.rotation.y = yaw;
    tree.x = position.x;
    tree.z = position.z;
    this.refreshTreeTransform(id);
    return true;
  }

  refreshTreeTransform(id: string) {
    const tree = this.treeGroups.find((entry) => entry.id === id);
    if (!tree) return false;
    tree.root.computeWorldMatrix(true);
    for (const meshes of tree.lods)
      for (const mesh of meshes) {
        mesh.unfreezeWorldMatrix();
        mesh.computeWorldMatrix(true);
        mesh.refreshBoundingInfo();
        mesh.freezeWorldMatrix();
      }
    return true;
  }

  private startDetailLoads() {
    if (!this.treeRuntime || this.disposed) return;
    const candidates = this.treeGroups
      .filter((tree) => tree.desired < 2 && !tree.lods[tree.desired].length)
      .sort(
        (a, b) =>
          Math.hypot(a.x - this.player.x, a.z - this.player.z) -
          Math.hypot(b.x - this.player.x, b.z - this.player.z),
      );
    for (const tree of candidates) {
      if (this.loadingTrees.size >= 2) break;
      const lod = tree.desired,
        key = tree.id + ":" + lod;
      const asset = this.treeRuntime.trees[tree.id]?.[String(lod)];
      if (!asset || this.loadingTrees.has(key) || this.failedTrees.has(key))
        continue;
      const abort = new AbortController();
      this.loadControllers.add(abort);
      this.loadingTrees.add(key);
      void fetch(asset.url, { signal: abort.signal })
        .then(async (response) => {
          if (!response.ok)
            throw new Error("Tree detail HTTP " + response.status);
          const decoded = decodeTreeRuntimeChunk(await response.arrayBuffer());
          if (decoded.id !== tree.id || decoded.lod !== lod)
            throw new Error("Tree detail identity mismatch");
          if (this.disposed || this.scene.isDisposed) return;
          const placement = TREES.find((entry) => entry.osmId === tree.id)!;
          const meshes = decoded.primitives.map((primitive) => {
            const mesh = new Mesh(primitive.name, this.scene),
              data = new VertexData();
            data.positions = primitive.positions;
            data.normals = primitive.normals;
            data.uvs = primitive.uvs;
            data.indices = primitive.indices;
            data.applyToMesh(mesh);
            mesh.material = this.sharedTreeMaterials[primitive.material];
            mesh.isPickable = false;
            mesh.receiveShadows = true;
            mesh.metadata = {
              vegetation: "tree",
              provenance: placement.provenance,
              osmId: tree.id,
              terrainAnchored: true,
              sourceTreeModel: tree.id,
              detailLevel: lod,
              appearance: placement.reconstruction?.appearance,
              shadowCaster: true,
              depthCaster: primitive.name.endsWith("__leaves")
                ? "alpha-test"
                : "opaque",
              windDeformed: primitive.name.endsWith("__leaves"),
              streamedTreeDetail: true,
            };
            applyTreeCrownShading(mesh, placement.reconstruction);
            mesh.setEnabled(false);
            attachAuthoredTreeMesh(mesh, tree.root);
            return mesh;
          });
          // Far remains enabled until the complete per-tree branch + leaf pair exists.
          tree.lods[lod] = meshes;
          this.trees.push(...meshes);
          this.detailCache.set(key, performance.now());
          this.stats.loadedTreeMeshes = this.trees.length;
        })
        .catch((error) => {
          if (this.disposed) return;
          this.failedTrees.add(key);
          this.stats.loadError =
            error instanceof Error ? error.message : String(error);
        })
        .finally(() => {
          this.loadingTrees.delete(key);
          this.loadControllers.delete(abort);
          this.stats.pendingTreeLoads = this.loadingTrees.size;
        });
    }
    this.stats.pendingTreeLoads = this.loadingTrees.size;
  }

  private trimDetailCache() {
    if (this.detailCache.size <= 32) return;
    for (const [key] of [...this.detailCache].sort((a, b) => a[1] - b[1])) {
      if (this.detailCache.size <= 32) break;
      const split = key.lastIndexOf(":"),
        id = key.slice(0, split),
        lod = Number(key.slice(split + 1));
      const tree = this.treeGroups.find((entry) => entry.id === id);
      if (!tree || tree.active === lod || tree.desired === lod) continue;
      const removed = new Set(tree.lods[lod]);
      for (const mesh of removed) mesh.dispose(false, false);
      this.trees = this.trees.filter((mesh) => !removed.has(mesh));
      tree.lods[lod] = [];
      this.detailCache.delete(key);
    }
    this.stats.loadedTreeMeshes = this.trees.length;
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
    this.treeWind.time = Number.isFinite(input.time) ? input.time : 0;
    this.treeWind.x = this.wind.x;
    this.treeWind.z = this.wind.z;
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
      this.photographicGrass.update({time: input.time, quality: input.quality, wind: {x:this.wind.x,z:this.wind.z}, focus: input.player});
      const photo=this.photographicGrass.stats;
      this.stats.grassTiles=photo.cachedTiles;this.stats.grassClumps=photo.instances;
      this.stats.visibleGrassTiles=photo.activeTiles;this.stats.visibleGrassClumps=photo.instances;
    }
    this.grassWind.time = this.treeWind.time;
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
    const treeCounts: [number, number, number] = [0, 0, 0];
    let treeTriangles = 0;
    for (const tree of this.treeGroups) {
      tree.desired = treeDetailLevel(
        Math.hypot(tree.x - input.player.x, tree.z - input.player.z),
        input.quality,
      );
      const lod = tree.lods[tree.desired].length
        ? tree.desired
        : tree.desired === 0 && tree.lods[1].length
          ? 1
          : 2;
      if (lod !== tree.active) {
        for (const mesh of tree.lods[tree.active]) mesh.setEnabled(false);
        for (const mesh of tree.lods[lod]) mesh.setEnabled(true);
        tree.active = lod;
      }
      treeCounts[lod]++;
      if (lod < 2) this.detailCache.set(tree.id + ":" + lod, performance.now());
      treeTriangles += tree.lods[lod].reduce(
        (n, mesh) => n + mesh.getTotalIndices() / 3,
        0,
      );
    }
    this.stats.treeDetailCounts = treeCounts;
    this.stats.activeTreeTriangles = treeTriangles;
    this.startDetailLoads();
    this.trimDetailCache();
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
    return this.photographicGrass?.shaderPreparationRevision;
  }
  beginGrassPreparation(): (() => void) | undefined {
    if (this.disposed || this.scene.isDisposed) return;
    return this.photographicGrass?.beginShaderPreparation();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.photographicGrass?.dispose();
    for (const abort of this.loadControllers) abort.abort();
    for (const { mesh } of this.patches) mesh.dispose(false, false);
    for (const wrapper of this.treeShadows) wrapper.dispose();
    this.treeContainer?.dispose();
    for (const mesh of this.trees)
      if (!mesh.isDisposed()) mesh.dispose(false, false);
    for (const tree of this.treeGroups) tree.root.dispose();
    for (const source of this.sources) source.dispose(false, false);
    for (const material of this.materials) material.dispose(false, true);
    this.patches = [];
    this.grassSelection = undefined;
    this.trees = [];
    this.treeGroups = [];
    this.sources = [];
  }
}

/** One original tree pack, individual crowns with shared photographic materials. */
export async function loadVegetation(scene: Scene) {
  const controller = new VegetationController(scene, {skipLegacyGrass:true});
  try {
    await Promise.all([controller.loadTrees(), controller.loadPhotographicGrass()]);
    return controller;
  } catch(error) { controller.dispose(); throw error; }
}
