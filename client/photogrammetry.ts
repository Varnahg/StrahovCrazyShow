import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { RenderQuality } from "../shared/render-quality";
import {
  decodeI3SGeometry,
  photogrammetryCoverage,
  photogrammetryEvictableNodes,
  photogrammetryIndex,
  photogrammetryNodeCenter,
  photogrammetryPositions,
  photogrammetryVisibleNodes,
  photogrammetryWantedNodes,
  partitionPhotogrammetryTriangles,
  type PhotogrammetryManifest,
  type PhotogrammetryNode,
  type PhotogrammetryPoint,
  type PhotogrammetryTriangleClassifier,
} from "../shared/photogrammetry";

type Viewer = Pick<PhotogrammetryPoint, "x" | "z"> &
  Partial<Pick<PhotogrammetryPoint, "y">>;

export type PhotogrammetryOptions = {
  /** Documented derived ground correction; original buffers/atlases stay intact. */
  transformPositions?: (positions: Float32Array) => Float32Array;
  configureMaterial?: (material: PBRMaterial, node: PhotogrammetryNode) => void;
  manifest?: PhotogrammetryManifest;
  manifestUrl?: string;
  initialPosition?: Viewer;
  /** Explicit playable-interior cutouts only. Original files remain intact. */
  excludeTriangle?: (
    a: PhotogrammetryPoint,
    b: PhotogrammetryPoint,
    c: PhotogrammetryPoint,
    node: PhotogrammetryNode,
  ) => boolean;
  /** Name source index ranges, for example b6-shell; never alters source UVs. */
  sourceRegion?: PhotogrammetryTriangleClassifier;
  regionVisible?: (region: string, player: Viewer) => boolean;
  /** Soft GPU cache limit. Visible coverage and fallback parents are pinned. */
  maxCachedMiB?: number;
  maxConcurrentLoads?: number;
};
export type PhotogrammetryStats = {
  provider: string;
  capture: string;
  highestSourceLevel: number;
  sourceNodes: number;
  sourceLeaves: number;
  ready: boolean;
  visibleNodes: number;
  visibleMeshes: number;
  visibleHighestNodes: number;
  visibleTriangles: number;
  residentNodes: number;
  residentTriangles: number;
  residentMiB: number;
  cacheBudgetMiB: number;
  cacheBudgetExceeded: boolean;
  queuedNodes: number;
  loadingNodes: number;
  errors: string[];
  sourceTexturesUnmodified: true;
  staticScannedVegetation: true;
};
export type PhotogrammetryController = {
  update: (player: Viewer, quality: RenderQuality) => void;
  setLighting: (daylight: number) => void;
  whenSettled: () => Promise<void>;
  stats: () => PhotogrammetryStats;
  dispose: () => void;
};

type Resident = {
  meshes: Array<{ mesh: Mesh; region: string; triangles: number }>;
  material: PBRMaterial;
  texture: Texture;
  bytes: number;
  triangles: number;
  lastUsed: number;
};

/** Kept separate so source color handling is testable without a GPU/network. */
export function createPhotogrammetryMaterial(
  scene: Scene,
  node: Pick<PhotogrammetryNode, "id">,
  texture: Texture,
  daylight = 1,
) {
  texture.gammaSpace = true;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  const material = new PBRMaterial(`IPR 2023 original mesh ${node.id}`, scene);
  material.albedoTexture = texture;
  material.albedoColor = Color3.White().scale(daylightTint(daylight));
  material.metallic = 0;
  material.roughness = 1;
  material.backFaceCulling = false; // The source material declares doubleSided.
  material.twoSidedLighting = true;
  // Aerial atlases contain the capture's daylight and shadows. Unlit PBR
  // avoids multiplying them by a second unrelated set of sunlight shadows.
  material.unlit = true;
  material.metadata = {
    sourcePack: "ipr-photogrammetry-2023",
    sourceUnmodified: true,
    bakedLighting: true,
  };
  return material;
}

/** Loads IPR's coarse SOURCE nodes first, then streams their unmodified finest
 * children. Switching is atomic per branch; JPEG failures retain the parent.
 * The archive contains every highest source tile, independently of GPU LRU. */
export async function loadPhotogrammetry(
  scene: Scene,
  options: PhotogrammetryOptions = {},
): Promise<PhotogrammetryController> {
  const manifest =
    options.manifest ?? (await fetchManifest(options.manifestUrl));
  const index = photogrammetryIndex(manifest);
  const residents = new Map<string, Resident>();
  const loading = new Set<string>();
  const failures = new Map<
    string,
    { attempts: number; message: string; retryAt: number }
  >();
  const abort = new AbortController();
  const cancels = new Set<() => void>();
  const maxConcurrent = Math.min(
    4,
    Math.max(1, options.maxConcurrentLoads ?? 4),
  );
  const cacheBytes = (options.maxCachedMiB ?? 384) * 1024 * 1024;
  let player = options.initialPosition ?? { x: 8, z: -84 };
  let quality: RenderQuality = "high";
  let wanted = new Set(index.roots.map((node) => node.id));
  let visible = new Set<string>();
  let queue: PhotogrammetryNode[] = [];
  let disposed = false;
  let lastUpdate = -Infinity;
  let daylight = 1;
  let settleWaiters: Array<() => void> = [];
  const now = () => performance.now();

  const loadTexture = (node: PhotogrammetryNode) =>
    new Promise<Texture>((resolve, reject) => {
      let texture: Texture | undefined;
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cancels.delete(cancel);
        if (error || disposed) {
          texture?.dispose();
          reject(error ?? new Error("Photogrammetry disposed"));
        } else resolve(texture!);
      };
      const cancel = () => finish(new Error("Photogrammetry disposed"));
      const timeout = setTimeout(
        () => finish(new Error(`Texture timeout ${node.id}`)),
        30_000,
      );
      cancels.add(cancel);
      // I3S's UVs are retained. Its atlas has glTF-compatible top-left image
      // coordinates; Babylon must not apply its ordinary image-loader Y flip.
      texture = new Texture(
        node.texture,
        scene,
        false,
        false,
        Texture.TRILINEAR_SAMPLINGMODE,
        () => finish(),
        (message, error) => finish(new Error(message ?? String(error))),
      );
      texture.name = `IPR 2023 original JPEG ${node.id}`;
      texture.gammaSpace = true;
      texture.wrapU = Texture.CLAMP_ADDRESSMODE;
      texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      texture.anisotropicFilteringLevel = 4;
      texture.metadata = {
        provider: manifest.provider,
        originalSha256: node.textureSha256,
        sourceUnmodified: true,
      };
    });

  const loadNode = async (node: PhotogrammetryNode) => {
    const response = await fetch(node.geometry, { signal: abort.signal });
    if (!response.ok)
      throw new Error(`Geometry ${node.id}: HTTP ${response.status}`);
    const geometry = decodeI3SGeometry(await response.arrayBuffer());
    if (geometry.vertexCount !== node.vertices)
      throw new Error(`Geometry ${node.id}: manifest vertex count differs`);
    const sourcePositions = photogrammetryPositions(geometry, node, manifest);
    const positions =
      options.transformPositions?.(sourcePositions) ?? sourcePositions;
    const partition =
      options.excludeTriangle || options.sourceRegion
        ? partitionPhotogrammetryTriangles(positions, node, options)
        : {
            indices: geometry.indices,
            ranges: [
              {
                region: "",
                indexStart: 0,
                indexCount: geometry.indices.length,
              },
            ],
          };
    const indices = partition.indices;
    const normals = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, normals, {
      useRightHandedSystem: true,
    });
    const texture = await loadTexture(node);
    if (disposed) {
      texture.dispose();
      return;
    }
    const material = createPhotogrammetryMaterial(
      scene,
      node,
      texture,
      daylight,
    );
    options.configureMaterial?.(material, node);
    const sourceMesh = new Mesh(
      `IPR photogrammetry ${node.id} L${node.level}`,
      scene,
    );
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.normals = normals;
    vertexData.uvs = geometry.uvs;
    vertexData.indices = indices;
    vertexData.applyToMesh(sourceMesh, false);
    const ranges = partition.ranges.length
      ? partition.ranges
      : [{ region: "", indexStart: 0, indexCount: 0 }];
    const meshes = ranges.map((range, i) => {
      const mesh =
        i === 0
          ? sourceMesh
          : sourceMesh.clone(`${sourceMesh.name} ${range.region}`, null, true);
      // Mesh.clone shares Geometry: only the draw's index range differs.
      mesh.releaseSubMeshes(true);
      if (range.indexCount)
        new SubMesh(
          0,
          0,
          geometry.vertexCount,
          range.indexStart,
          range.indexCount,
          mesh,
        );
      mesh.material = material;
      mesh.sideOrientation = 1;
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      mesh.metadata = {
        sourcePack: "ipr-photogrammetry-2023",
        sourceNode: node.id,
        sourceLevel: node.level,
        sourceRegion: range.region,
        derivedGeometryRepaired: !!options.transformPositions,
        sourceGeometrySha256: node.geometrySha256,
        sourceTextureSha256: node.textureSha256,
        originalGeometryVertices: node.vertices,
        retainedTriangles: range.indexCount / 3,
        depthCaster: false,
        staticScannedVegetation: true,
      };
      mesh.setEnabled(false);
      mesh.freezeWorldMatrix();
      return { mesh, region: range.region, triangles: range.indexCount / 3 };
    });
    const size = texture.getSize();
    residents.set(node.id, {
      meshes,
      material,
      texture,
      triangles: indices.length / 3,
      lastUsed: now(),
      bytes:
        positions.byteLength +
        normals.byteLength +
        geometry.uvs.byteLength +
        indices.byteLength +
        Math.ceil((size.width * size.height * 4 * 4) / 3),
    });
    failures.delete(node.id);
  };

  const refreshVisibility = () => {
    visible = photogrammetryVisibleNodes(
      index,
      wanted,
      new Set(residents.keys()),
    );
    for (const [id, resident] of residents) {
      const active = visible.has(id);
      for (const part of resident.meshes) {
        const enabled =
          active &&
          part.triangles > 0 &&
          (options.regionVisible?.(part.region, player) ?? true);
        if (part.mesh.isEnabled() !== enabled) part.mesh.setEnabled(enabled);
      }
      if (active) resident.lastUsed = now();
    }
  };
  const evict = () => {
    let bytes = [...residents.values()].reduce(
      (sum, node) => sum + node.bytes,
      0,
    );
    if (bytes <= cacheBytes) return;
    // Coarse roots always remain available. Hidden intermediate parents may
    // leave the cache when their complete child coverage is already visible.
    const removableIds = new Set(
      photogrammetryEvictableNodes(
        index,
        wanted,
        new Set(residents.keys()),
        visible,
      ),
    );
    const removable = [...residents.entries()]
      .filter(([id]) => removableIds.has(id))
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [id, resident] of removable) {
      if (bytes <= cacheBytes) break;
      resident.meshes.forEach((part) => part.mesh.dispose(false, false));
      resident.material.dispose(false, false);
      resident.texture.dispose();
      residents.delete(id);
      bytes -= resident.bytes;
    }
  };
  const notifySettled = () => {
    if (!loading.size && !queue.length) {
      settleWaiters.splice(0).forEach((resolve) => resolve());
    }
  };
  const pump = () => {
    while (!disposed && loading.size < maxConcurrent && queue.length) {
      const node = queue.shift()!;
      if (residents.has(node.id) || loading.has(node.id)) continue;
      loading.add(node.id);
      void loadNode(node)
        .catch((error: unknown) => {
          if (disposed) return;
          const attempts = (failures.get(node.id)?.attempts ?? 0) + 1;
          failures.set(node.id, {
            attempts,
            message: error instanceof Error ? error.message : String(error),
            retryAt: now() + Math.min(30_000, attempts * attempts * 1000),
          });
        })
        .finally(() => {
          loading.delete(node.id);
          if (!disposed) {
            refreshVisibility();
            evict();
            pump();
          }
          notifySettled();
        });
    }
    notifySettled();
  };
  const update = (position: Viewer, nextQuality: RenderQuality) => {
    if (disposed) return;
    player = position;
    const changedQuality = nextQuality !== quality;
    quality = nextQuality;
    if (!changedQuality && now() - lastUpdate < 200) {
      if (options.regionVisible) {
        for (const id of visible) {
          for (const part of residents.get(id)!.meshes) {
            const enabled =
              part.triangles > 0 && options.regionVisible(part.region, player);
            if (part.mesh.isEnabled() !== enabled)
              part.mesh.setEnabled(enabled);
          }
        }
      }
      return;
    }
    lastUpdate = now();
    wanted = photogrammetryWantedNodes(manifest, index, player, quality);
    const coverage = photogrammetryCoverage(index, new Set(residents.keys()));
    queue = [...wanted]
      .filter((id) => {
        const failed = failures.get(id);
        const node = index.nodes.get(id)!;
        const alreadyCoveredByWantedChildren =
          node.children.length > 0 &&
          node.children.every(
            (child) => wanted.has(child) && coverage.has(child),
          );
        return (
          !residents.has(id) &&
          !loading.has(id) &&
          !alreadyCoveredByWantedChildren &&
          (!failed || (failed.attempts < 3 && now() >= failed.retryAt))
        );
      })
      .map((id) => index.nodes.get(id)!)
      .sort((a, b) => {
        // Coverage ancestors before finest detail; nearest within that level.
        if (a.level !== b.level) return a.level - b.level;
        const ac = photogrammetryNodeCenter(a, manifest),
          bc = photogrammetryNodeCenter(b, manifest);
        return (
          Math.hypot(ac.x - player.x, ac.z - player.z) -
          Math.hypot(bc.x - player.x, bc.z - player.z)
        );
      });
    refreshVisibility();
    evict();
    pump();
  };
  const whenSettled = () =>
    !loading.size && !queue.length
      ? Promise.resolve()
      : new Promise<void>((resolve) => settleWaiters.push(resolve));
  const stats = (): PhotogrammetryStats => {
    const all = [...residents.values()];
    const activeIds = [...visible].filter((id) =>
      residents.get(id)!.meshes.some((part) => part.mesh.isEnabled()),
    );
    const active = activeIds.map((id) => residents.get(id)!);
    const bytes = all.reduce((sum, node) => sum + node.bytes, 0);
    return {
      provider: manifest.provider,
      capture: manifest.capture,
      highestSourceLevel: manifest.highestDetailLevel,
      sourceNodes: manifest.nodes.length,
      sourceLeaves: manifest.leafCount,
      ready: index.roots.every((node) => residents.has(node.id)),
      visibleNodes: activeIds.length,
      visibleMeshes: active
        .flatMap((node) => node.meshes)
        .filter((part) => part.mesh.isEnabled()).length,
      visibleHighestNodes: activeIds.filter(
        (id) => index.nodes.get(id)!.level === manifest.highestDetailLevel,
      ).length,
      visibleTriangles: active
        .flatMap((node) => node.meshes)
        .filter((part) => part.mesh.isEnabled())
        .reduce((sum, part) => sum + part.triangles, 0),
      residentNodes: residents.size,
      residentTriangles: all.reduce((sum, node) => sum + node.triangles, 0),
      residentMiB: Math.round((bytes / 1024 / 1024) * 10) / 10,
      cacheBudgetMiB: cacheBytes / 1024 / 1024,
      cacheBudgetExceeded: bytes > cacheBytes,
      queuedNodes: queue.length,
      loadingNodes: loading.size,
      errors: [...failures.values()].map((failure) => failure.message),
      sourceTexturesUnmodified: true,
      staticScannedVegetation: true,
    };
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    abort.abort();
    cancels.forEach((cancel) => cancel());
    for (const resident of residents.values()) {
      resident.meshes.forEach((part) => part.mesh.dispose(false, false));
      resident.material.dispose(false, false);
      resident.texture.dispose();
    }
    residents.clear();
    queue = [];
    settleWaiters.splice(0).forEach((resolve) => resolve());
  };

  // All low-resolution root patches are required. A failed initial patch is
  // reported to the caller; returning a successful controller with holes
  // would conceal missing source assets.
  scene.onDisposeObservable.addOnce(dispose);
  queue = index.roots.slice();
  pump();
  await whenSettled();
  if (!stats().ready) {
    const errors = stats().errors.join("; ");
    dispose();
    throw new Error(`IPR photogrammetry base coverage failed: ${errors}`);
  }
  update(player, "high");
  return {
    update,
    whenSettled,
    stats,
    dispose,
    setLighting(value) {
      if (disposed) return;
      const next = Math.max(0, Math.min(1, value));
      if (Math.abs(next - daylight) < 0.005) return;
      daylight = next;
      residents.forEach((resident) =>
        resident.material.albedoColor.setAll(daylightTint(daylight)),
      );
    },
  };
}

function daylightTint(daylight: number) {
  return 0.1 + 0.9 * daylight;
}
async function fetchManifest(
  url = "/models/photogrammetry/ipr2023/manifest.json",
) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Photogrammetry manifest: HTTP ${response.status}`);
  return (await response.json()) as PhotogrammetryManifest;
}
