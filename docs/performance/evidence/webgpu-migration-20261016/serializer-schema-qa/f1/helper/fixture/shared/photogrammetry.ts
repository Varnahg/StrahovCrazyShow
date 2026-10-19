/** IPR Praha's original I3S integrated mesh. No Babylon, browser or game imports. */
export type PhotogrammetryPoint = Readonly<{ x: number; y: number; z: number }>;
export type PhotogrammetryNode = {
  id: string;
  level: number;
  center: readonly number[];
  radius: number;
  children: string[];
  parent?: string;
  vertices: number;
  triangles: number;
  geometry: string;
  texture: string;
  geometrySha256: string;
  textureSha256: string;
  geometryBytes: number;
  textureBytes: number;
};
export type PhotogrammetryManifest = {
  schemaVersion: number;
  provider: string;
  license: string;
  attribution: string;
  source: string;
  sourceItem: string;
  capture: string;
  horizontalCRS: string;
  verticalCRS: string;
  origin: { lat: number; lon: number };
  mercatorOrigin: { x: number; y: number };
  metresPerMercatorUnit: number;
  /** IPR uses EPSG:3857 for both centers and local vertex offsets. */
  localPositionScale?: number;
  worldHeightReference: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  highestDetailLevel: number;
  leafCount: number;
  nodes: PhotogrammetryNode[];
};
export type I3SGeometry = {
  vertexCount: number;
  featureCount: number;
  /** Untouched source offsets in the layer's declared vertexCRS. */
  positions: Float32Array;
  /** Untouched source atlas coordinates; do not flip or reproject these. */
  uvs: Float32Array;
  indices: Uint32Array;
  featureIds: bigint[];
  faceRanges: Array<readonly [number, number]>;
};
export type PhotogrammetryTriangleClassifier = (
  a: PhotogrammetryPoint,
  b: PhotogrammetryPoint,
  c: PhotogrammetryPoint,
  node: PhotogrammetryNode,
) => string | undefined;

/** Split only index ranges for playable interior visibility. Vertex positions,
 * triangle winding and source UVs remain unchanged and shared by every range. */
export function partitionPhotogrammetryTriangles(
  positions: Float32Array,
  node: PhotogrammetryNode,
  options: {
    excludeTriangle?: (
      a: PhotogrammetryPoint,
      b: PhotogrammetryPoint,
      c: PhotogrammetryPoint,
      node: PhotogrammetryNode,
    ) => boolean;
    sourceRegion?: PhotogrammetryTriangleClassifier;
  } = {},
) {
  const groups = new Map<string, number[]>();
  const point = (vertex: number) => ({
    x: positions[vertex * 3],
    y: positions[vertex * 3 + 1],
    z: positions[vertex * 3 + 2],
  });
  for (let vertex = 0; vertex < positions.length / 3; vertex += 3) {
    const a = point(vertex),
      b = point(vertex + 1),
      c = point(vertex + 2);
    if (options.excludeTriangle?.(a, b, c, node)) continue;
    const region = options.sourceRegion?.(a, b, c, node) ?? "";
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region)!.push(vertex, vertex + 1, vertex + 2);
  }
  const ranges: Array<{
    region: string;
    indexStart: number;
    indexCount: number;
  }> = [];
  const indices = new Uint32Array(
    [...groups.values()].reduce((sum, values) => sum + values.length, 0),
  );
  let offset = 0;
  for (const [region, values] of groups) {
    indices.set(values, offset);
    ranges.push({ region, indexStart: offset, indexCount: values.length });
    offset += values.length;
  }
  return { indices, ranges };
}

/** The downloaded IPR layer declares an eight-byte header, position, uv0,
 * UInt64 feature IDs and inclusive UInt32 face ranges. This intentionally
 * rejects other layouts instead of silently interpreting Draco or normals. */
export function decodeI3SGeometry(
  buffer: ArrayBuffer | ArrayBufferView,
): I3SGeometry {
  const view = ArrayBuffer.isView(buffer)
    ? new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new DataView(buffer);
  if (view.byteLength < 8) throw new Error("Truncated I3S geometry header");
  const vertexCount = view.getUint32(0, true);
  const featureCount = view.getUint32(4, true);
  if (!vertexCount || vertexCount % 3)
    throw new Error("IPR I3S geometry must be a nonempty triangle soup");
  const required = 8 + vertexCount * 20 + featureCount * 16;
  if (!Number.isSafeInteger(required) || required !== view.byteLength)
    throw new Error(
      `Unexpected IPR I3S geometry length: ${view.byteLength}/${required}`,
    );
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(vertexCount);
  for (let i = 0; i < positions.length; i++) {
    const value = view.getFloat32(8 + i * 4, true);
    if (!Number.isFinite(value)) throw new Error("Nonfinite I3S position");
    positions[i] = value;
  }
  const uvOffset = 8 + positions.length * 4;
  for (let i = 0; i < uvs.length; i++) {
    const value = view.getFloat32(uvOffset + i * 4, true);
    if (!Number.isFinite(value)) throw new Error("Nonfinite I3S UV");
    uvs[i] = value;
  }
  for (let i = 0; i < vertexCount; i++) indices[i] = i;
  const featureOffset = uvOffset + uvs.length * 4;
  const rangeOffset = featureOffset + featureCount * 8;
  const featureIds: bigint[] = [];
  const faceRanges: Array<readonly [number, number]> = [];
  for (let i = 0; i < featureCount; i++) {
    featureIds.push(view.getBigUint64(featureOffset + i * 8, true));
    const start = view.getUint32(rangeOffset + i * 8, true);
    const end = view.getUint32(rangeOffset + i * 8 + 4, true);
    if (start > end || end >= vertexCount / 3)
      throw new Error("Invalid inclusive I3S feature face range");
    faceRanges.push([start, end]);
  }
  return {
    vertexCount,
    featureCount,
    positions,
    uvs,
    indices,
    featureIds,
    faceRanges,
  };
}

export function photogrammetryNodeCenter(
  node: Pick<PhotogrammetryNode, "center">,
  manifest: Pick<
    PhotogrammetryManifest,
    "mercatorOrigin" | "metresPerMercatorUnit" | "worldHeightReference"
  >,
): PhotogrammetryPoint {
  return {
    x:
      (node.center[0] - manifest.mercatorOrigin.x) *
      manifest.metresPerMercatorUnit,
    y: node.center[2] - manifest.worldHeightReference,
    z:
      -(node.center[1] - manifest.mercatorOrigin.y) *
      manifest.metresPerMercatorUnit,
  };
}

/** East/north/up -> east/up/south is an orientation-preserving transform.
 * Source height is Bpv metres, so Mercator's XY scale NEVER scales height. */
export function photogrammetryPositions(
  geometry: Pick<I3SGeometry, "positions">,
  node: Pick<PhotogrammetryNode, "center">,
  manifest: Pick<
    PhotogrammetryManifest,
    | "mercatorOrigin"
    | "metresPerMercatorUnit"
    | "worldHeightReference"
    | "localPositionScale"
  >,
): Float32Array {
  const center = photogrammetryNodeCenter(node, manifest);
  const scale = manifest.localPositionScale ?? manifest.metresPerMercatorUnit;
  const output = new Float32Array(geometry.positions.length);
  for (let i = 0; i < output.length; i += 3) {
    output[i] = center.x + geometry.positions[i] * scale;
    output[i + 1] = center.y + geometry.positions[i + 2];
    output[i + 2] = center.z - geometry.positions[i + 1] * scale;
  }
  return output;
}

export function photogrammetryIndex(manifest: PhotogrammetryManifest) {
  if (manifest.schemaVersion !== 1 || manifest.horizontalCRS !== "EPSG:3857")
    throw new Error("Unsupported photogrammetry manifest");
  if (!(
    manifest.metresPerMercatorUnit > 0 && manifest.metresPerMercatorUnit <= 1
  ))
    throw new Error("Invalid photogrammetry horizontal scale");
  const nodes = new Map(manifest.nodes.map((node) => [node.id, node]));
  if (nodes.size !== manifest.nodes.length || !nodes.size)
    throw new Error("Missing or duplicate photogrammetry nodes");
  for (const node of nodes.values()) {
    if (
      node.center.length !== 3 ||
      node.center.some((n) => !Number.isFinite(n)) ||
      !(node.radius > 0)
    )
      throw new Error(`Invalid photogrammetry bounds: ${node.id}`);
    for (const id of node.children) {
      if (!nodes.has(id))
        throw new Error(`Missing photogrammetry child: ${id}`);
      if (nodes.get(id)!.parent !== node.id)
        throw new Error(`Inconsistent photogrammetry parent: ${id}`);
    }
    const ancestors = new Set([node.id]);
    let parent = node.parent;
    while (parent && nodes.has(parent)) {
      if (ancestors.has(parent))
        throw new Error("Cyclic photogrammetry hierarchy");
      ancestors.add(parent);
      parent = nodes.get(parent)!.parent;
    }
  }
  return {
    nodes,
    roots: manifest.nodes.filter(
      (node) => !node.parent || !nodes.has(node.parent),
    ),
  };
}

/** Highest ORIGINAL level is requested at the player on every quality.
 * Only the radius of that source level changes; no mesh or JPEG is decimated. */
export function photogrammetryWantedNodes(
  manifest: PhotogrammetryManifest,
  index: ReturnType<typeof photogrammetryIndex>,
  player: Pick<PhotogrammetryPoint, "x" | "z">,
  quality: "low" | "medium" | "high",
): Set<string> {
  const radius = quality === "high" ? 84 : quality === "medium" ? 60 : 40;
  const wanted = new Set<string>();
  const visit = (node: PhotogrammetryNode) => {
    wanted.add(node.id);
    const center = photogrammetryNodeCenter(node, manifest);
    // The source bounding sphere contains unscaled Bpv height as well as XY;
    // its full radius is deliberately conservative when selecting children.
    const distance = Math.max(
      0,
      Math.hypot(center.x - player.x, center.z - player.z) - node.radius,
    );
    const reach =
      radius * 2 ** Math.max(0, manifest.highestDetailLevel - node.level - 1);
    if (node.children.length && distance <= reach)
      node.children.forEach((id) => visit(index.nodes.get(id)!));
  };
  index.roots.forEach(visit);
  return wanted;
}

/** Staged children must survive until the atomic branch switch. A soft cache
 * budget must never cause endless load -> evict -> load of desired detail. */
export function photogrammetryEvictableNodes(
  index: ReturnType<typeof photogrammetryIndex>,
  wanted: Set<string>,
  resident: Set<string>,
  visible: Set<string>,
) {
  const coverage = photogrammetryCoverage(index, resident),
    roots = new Set(index.roots.map((n) => n.id));
  return [...resident].filter((id) => {
    if (roots.has(id) || visible.has(id)) return false;
    if (!wanted.has(id)) return true;
    const node = index.nodes.get(id)!;
    return (
      node.children.length > 0 &&
      node.children.every((child) => wanted.has(child) && coverage.has(child))
    );
  });
}

/** Atomic tree replacement: a parent stays visible until ALL its included
 * children are render-ready. A missing/failed child never opens a hole. */
export function photogrammetryVisibleNodes(
  index: ReturnType<typeof photogrammetryIndex>,
  wanted: ReadonlySet<string>,
  ready: ReadonlySet<string>,
): Set<string> {
  const visible = new Set<string>();
  const coverage = photogrammetryCoverage(index, ready);
  const visit = (node: PhotogrammetryNode) => {
    if (
      node.children.length &&
      node.children.every((id) => wanted.has(id) && coverage.has(id))
    )
      node.children.forEach((id) => visit(index.nodes.get(id)!));
    else if (ready.has(node.id)) visible.add(node.id);
    // Hidden parents may have left the GPU LRU while their complete children
    // remain visible. Keep that coverage during a request for a coarser level.
    else if (
      node.children.length &&
      node.children.every((id) => coverage.has(id))
    )
      node.children.forEach((id) => visit(index.nodes.get(id)!));
  };
  index.roots.forEach(visit);
  return visible;
}

/** Render coverage can be supplied by a node OR every descendant branch.
 * This lets the GPU evict hidden ancestors without reloading them each frame. */
export function photogrammetryCoverage(
  index: ReturnType<typeof photogrammetryIndex>,
  ready: ReadonlySet<string>,
): Set<string> {
  const covered = new Set<string>();
  const visit = (node: PhotogrammetryNode): boolean => {
    // Traverse even when the parent is ready: finer coverage is needed by LOD.
    const childrenCovered = node.children.map((id) =>
      visit(index.nodes.get(id)!),
    );
    const value =
      ready.has(node.id) ||
      (childrenCovered.length > 0 && childrenCovered.every(Boolean));
    if (value) covered.add(node.id);
    return value;
  };
  index.roots.forEach(visit);
  return covered;
}
