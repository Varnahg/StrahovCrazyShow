/** Read-only exhaustive original-resource audit and source-surface navigation
 * probes. It never cleans, rewrites or decimates IPR's original files. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import manifestRaw from "../shared/data/photogrammetry.json";
import {
  decodeI3SGeometry,
  photogrammetryPositions,
  photogrammetryIndex,
  type PhotogrammetryManifest,
  type PhotogrammetryNode,
} from "../shared/photogrammetry";
import { groundHeight, sourceGroundHeight } from "../shared/terrain";
import { SPAWN, PLACES } from "../shared/world";
import { findCampusWalkRoute } from "../shared/campus-routes";
import { sampleWalkingPath, TRANSIT_NAVIGATION } from "../shared/transit";

const started = performance.now(),
  manifest = manifestRaw as unknown as PhotogrammetryManifest;
photogrammetryIndex(manifest);
const leaves = manifest.nodes.filter((n) => !n.children.length),
  highestTriangles = leaves.reduce((s, n) => s + n.triangles, 0),
  highestPositions = new Float32Array(highestTriangles * 9),
  leafRanges: { first: number; last: number; id: string }[] = [];
let triangleCursor = 0,
  job = 0,
  done = 0;
const errors: unknown[] = [],
  nodes: any[] = [];
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
function jpegSize(b: Buffer) {
  if (
    b[0] !== 255 ||
    b[1] !== 216 ||
    b.lastIndexOf(Buffer.from([255, 217])) < 2
  )
    throw Error("Missing JPEG SOI/EOI");
  let p = 2;
  while (p < b.length - 4) {
    if (b[p++] !== 255) continue;
    while (b[p] === 255) p++;
    const marker = b[p++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = b.readUInt16BE(p);
    if (length < 2 || p + length > b.length)
      throw Error("Invalid JPEG segment");
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      const height = b.readUInt16BE(p + 3),
        width = b.readUInt16BE(p + 5);
      if (!width || !height) throw Error("Empty JPEG dimensions");
      return {
        width,
        height,
        bits: b[p + 2],
        components: b[p + 7],
        progressive: marker === 0xc2,
      };
    }
    p += length;
  }
  throw Error("Missing JPEG SOF dimensions");
}
async function check(node: PhotogrammetryNode) {
  const record: any = {
    id: node.id,
    level: node.level,
    leaf: !node.children.length,
    triangles: node.triangles,
    errors: [],
  };
  try {
    const [geometry, texture] = await Promise.all([
      readFile(path.join("public", node.geometry)),
      readFile(path.join("public", node.texture)),
    ]);
    record.geometrySha256 = hash(geometry);
    record.textureSha256 = hash(texture);
    if (geometry.length !== node.geometryBytes)
      record.errors.push("geometry-byte-length");
    if (texture.length !== node.textureBytes)
      record.errors.push("texture-byte-length");
    if (record.geometrySha256 !== node.geometrySha256)
      record.errors.push("geometry-sha256");
    if (record.textureSha256 !== node.textureSha256)
      record.errors.push("texture-sha256");
    record.jpeg = jpegSize(texture);
    const decoded = decodeI3SGeometry(geometry),
      p = photogrammetryPositions(decoded, node, manifest);
    if (
      decoded.vertexCount !== node.vertices ||
      decoded.vertexCount / 3 !== node.triangles
    )
      record.errors.push("manifest-vertex-count");
    let uvMin = Infinity,
      uvMax = -Infinity,
      uvOutside = 0;
    for (const uv of decoded.uvs) {
      uvMin = Math.min(uvMin, uv);
      uvMax = Math.max(uvMax, uv);
      if (uv < -0.00001 || uv > 1.00001) uvOutside++;
    }
    record.uv = { min: uvMin, max: uvMax, outsideUnitRange: uvOutside };
    const bounds = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity,
    };
    let degenerate = 0,
      sourceDegenerate = 0,
      tiny = 0,
      largestEdge = 0,
      upward = 0,
      downward = 0,
      vertical = 0,
      nearGroundUp = 0,
      nearGroundDown = 0;
    for (let i = 0; i < p.length; i += 9) {
      for (let v = 0; v < 9; v += 3) {
        const x = p[i + v],
          y = p[i + v + 1],
          z = p[i + v + 2];
        if (!Number.isFinite(x + y + z))
          throw Error("Nonfinite transformed vertex");
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxY = Math.max(bounds.maxY, y);
        bounds.minZ = Math.min(bounds.minZ, z);
        bounds.maxZ = Math.max(bounds.maxZ, z);
      }
      const ax = p[i],
        ay = p[i + 1],
        az = p[i + 2],
        bx = p[i + 3],
        by = p[i + 4],
        bz = p[i + 5],
        cx = p[i + 6],
        cy = p[i + 7],
        cz = p[i + 8],
        ux = bx - ax,
        uy = by - ay,
        uz = bz - az,
        vx = cx - ax,
        vy = cy - ay,
        vz = cz - az,
        nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx,
        n = Math.hypot(nx, ny, nz),
        area = n / 2;
      if (area < 1e-12) degenerate++;
      else if (area < 1e-6) tiny++;
      const sp = decoded.positions,
        scale = manifest.localPositionScale ?? manifest.metresPerMercatorUnit,
        sux = (sp[i + 3] - sp[i]) * scale,
        suy = sp[i + 5] - sp[i + 2],
        suz = -(sp[i + 4] - sp[i + 1]) * scale,
        svx = (sp[i + 6] - sp[i]) * scale,
        svy = sp[i + 8] - sp[i + 2],
        svz = -(sp[i + 7] - sp[i + 1]) * scale;
      if (
        Math.hypot(
          suy * svz - suz * svy,
          suz * svx - sux * svz,
          sux * svy - suy * svx,
        ) /
          2 <
        1e-12
      )
        sourceDegenerate++;
      largestEdge = Math.max(
        largestEdge,
        Math.hypot(ux, uy, uz),
        Math.hypot(vx, vy, vz),
        Math.hypot(cx - bx, cy - by, cz - bz),
      );
      const normalY = n ? ny / n : 0;
      if (normalY > 0.7) upward++;
      else if (normalY < -0.7) downward++;
      else vertical++;
      const x = (ax + bx + cx) / 3,
        z = (az + bz + cz) / 3,
        y = (ay + by + cy) / 3;
      if (
        x >= manifest.bounds.minX &&
        x <= manifest.bounds.maxX &&
        z >= manifest.bounds.minZ &&
        z <= manifest.bounds.maxZ &&
        Math.abs(y - groundHeight(x, z)) < 1.5
      ) {
        if (normalY > 0.7) nearGroundUp++;
        if (normalY < -0.7) nearGroundDown++;
      }
    }
    record.bounds = bounds;
    record.geometry = {
      degenerateAreaBelow1e12: degenerate,
      sourceLocalDegenerateAreaBelow1e12: sourceDegenerate,
      tinyAreaBelow1e6: tiny,
      largestEdge,
      upward,
      downward,
      vertical,
      nearGroundUp,
      nearGroundDown,
    };
    if (record.leaf) {
      const first = triangleCursor;
      highestPositions.set(p, first * 9);
      triangleCursor += node.triangles;
      leafRanges.push({ first, last: triangleCursor, id: node.id });
    }
  } catch (error) {
    record.errors.push(String(error));
  }
  if (record.errors.length) errors.push({ id: node.id, errors: record.errors });
  nodes.push(record);
  if (++done % 500 === 0)
    console.log(
      `Checked ${done}/${manifest.nodes.length} original geometry/JPEG pairs`,
    );
}
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (job < manifest.nodes.length) {
      const node = manifest.nodes[job++];
      await check(node);
    }
  }),
);
nodes.sort((a, b) => a.id.localeCompare(b.id));
console.log(
  "Resource pass complete; indexing original highest-detail triangles",
  { leaves: leaves.length, triangles: triangleCursor, errors: errors.length },
);
const bucketMetres = 8,
  buckets = new Map<string, number[]>();
for (let id = 0; id < triangleCursor; id++) {
  const i = id * 9,
    p = highestPositions,
    minX = Math.min(p[i], p[i + 3], p[i + 6]),
    maxX = Math.max(p[i], p[i + 3], p[i + 6]),
    minZ = Math.min(p[i + 2], p[i + 5], p[i + 8]),
    maxZ = Math.max(p[i + 2], p[i + 5], p[i + 8]);
  for (
    let x = Math.floor(minX / bucketMetres);
    x <= Math.floor(maxX / bucketMetres);
    x++
  )
    for (
      let z = Math.floor(minZ / bucketMetres);
      z <= Math.floor(maxZ / bucketMetres);
      z++
    ) {
      const key = x + ":" + z;
      let entries = buckets.get(key);
      if (!entries) {
        entries = [];
        buckets.set(key, entries);
      }
      entries.push(id);
    }
}
function sourceId(triangle: number) {
  let lo = 0,
    hi = leafRanges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1,
      r = leafRanges[mid];
    if (triangle < r.first) hi = mid - 1;
    else if (triangle >= r.last) lo = mid + 1;
    else return r.id;
  }
  return "unknown";
}
function surface(x: number, z: number) {
  const ground = groundHeight(x, z),
    hits: { y: number; normalY: number; triangle: number; nodeId: string }[] =
      [],
    nearby =
      buckets.get(
        Math.floor(x / bucketMetres) + ":" + Math.floor(z / bucketMetres),
      ) ?? [];
  for (const triangle of nearby) {
    const i = triangle * 9,
      p = highestPositions,
      ax = p[i],
      az = p[i + 2],
      bx = p[i + 3],
      bz = p[i + 5],
      cx = p[i + 6],
      cz = p[i + 8],
      den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(den) < 1e-10) continue;
    const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den,
      b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den,
      c = 1 - a - b;
    if (Math.min(a, b, c) < -1e-6) continue;
    const ay = p[i + 1],
      by = p[i + 4],
      cy = p[i + 7],
      y = a * ay + b * by + c * cy,
      nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay),
      ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az),
      nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax),
      normalY = ny / Math.hypot(nx, ny, nz);
    hits.push({ y, normalY, triangle, nodeId: sourceId(triangle) });
  }
  hits.sort((a, b) => Math.abs(a.y - ground) - Math.abs(b.y - ground));
  const support = hits.find(
    (h) => Math.abs(h.y - ground) <= 3 && Math.abs(h.normalY) >= 0.45,
  );
  return {
    x,
    z,
    dmrY: ground,
    sourceDmrY: sourceGroundHeight(x, z),
    support,
    allHits: hits.map((h) => ({
      y: h.y,
      normalY: h.normalY,
      nodeId: h.nodeId,
    })),
    nearbyNodeIds: [...new Set(nearby.map(sourceId))],
  };
}
const routes: {
    id: string;
    points: [number, number][];
    length: number;
    provenance: string;
  }[] = [],
  unresolvedRouteRequests: unknown[] = [];
for (const id of ["stadium191a", "stadium191b"]) {
  const goal = PLACES.find((p) => p.id === id)!;
  const route = findCampusWalkRoute([SPAWN.x, SPAWN.z], [goal.x, goal.z]);
  if (route)
    routes.push({
      id,
      points: route.points,
      length: route.length,
      provenance: "connected public OSM walking ways, existing campus router",
    });
}
for (const [id, end] of [
  ["rko-east-approach", [145, -58]],
  ["central-court-west", [80, 0]],
  ["central-court-east", [225, 24]],
] as [string, [number, number]][]) {
  const route = findCampusWalkRoute([SPAWN.x, SPAWN.z], end, 10);
  if (route)
    routes.push({
      id,
      points: route.points,
      length: route.length,
      provenance:
        "mapped public walking route to a named approach; endpoint connector explicitly allowed <=10m",
    });
  else
    unresolvedRouteRequests.push({
      id,
      end,
      reason:
        "Nearest public way components are not connected within a <=10m endpoint attachment; dense source-surface area probes are supplied instead. No invented route.",
    });
}
routes.push({
  id: "b6-north-door-surface",
  points: [
    [-4.85, -85],
    [-4.85, -77.67],
  ],
  length: 7.33,
  provenance:
    "photo/plan-interpreted B6 exterior approach; original scan before playable-interior cutout",
});
for (const journey of TRANSIT_NAVIGATION.journeys.filter(
  (j) => j.stopId === "U981Z1P",
)) {
  const points = journey.points.slice(-3) as [number, number][];
  routes.push({
    id: "north-entry-" + journey.buildingId,
    points,
    length: points
      .slice(1)
      .reduce(
        (s, p, i) => s + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]),
        0,
      ),
    provenance:
      "published north entrance approach; comparison only, not an assertion that scan has clean stairs",
  });
}
const routeReports: any[] = [],
  issues: any[] = [];
for (const route of routes) {
  let missing = 0,
    offset = 0,
    steps = 0,
    steep = 0,
    previous: any;
  const samples: any[] = [];
  for (let distance = 0; distance <= route.length + 0.001; distance += 0.5) {
    const pose = sampleWalkingPath(
        route.points,
        Math.min(distance, route.length),
      ).position,
      r = surface(pose.x, pose.z),
      support = r.support;
    let kind: string | undefined;
    if (!support) {
      missing++;
      kind = "missing-near-DMR-source-support";
    } else {
      if (Math.abs(support.y - r.dmrY) > 0.45) {
        offset++;
        kind = "source-DMR-difference-over-0.45m";
      }
      if (Math.abs(support.normalY) < 0.7) {
        steep++;
        kind = "source-steep-support";
      }
      if (
        previous?.support &&
        Math.abs(support.y - previous.support.y) > 0.22
      ) {
        steps++;
        kind = "source-height-jump-over-0.22m-per-0.5m";
      }
    }
    const sample = { distance, ...r };
    samples.push(sample);
    if (kind) issues.push({ routeId: route.id, kind, ...sample });
    previous = sample;
  }
  routeReports.push({
    ...route,
    sampleCount: samples.length,
    missingSupport: missing,
    dmrDifferenceOver045: offset,
    heightJumpsOver022: steps,
    steepSupport: steep,
    samples,
  });
}
const probes = [
  { id: "spawn", x: SPAWN.x, z: SPAWN.z },
  { id: "b6-door", x: -4.85, z: -77.67 },
  { id: "court-center", x: 130, z: 12 },
  { id: "rko-business-POI-not-door", x: 103.08, z: -57.81 },
  { id: "191A", x: -241.879, z: 254.4 },
  { id: "191B", x: -281.968, z: 273.747 },
].map((p) => ({ id: p.id, ...surface(p.x, p.z) }));
const areaReports: any[] = [];
for (const area of [
  { id: "spawn", minX: 18, maxX: 27, minZ: -19, maxZ: -9 },
  { id: "b6-north-approach", minX: -8, maxX: 0, minZ: -86, maxZ: -76 },
  { id: "central-asphalt-court", minX: 84, maxX: 160, minZ: -12, maxZ: 32 },
  { id: "rko-north-public-edge", minX: 95, maxX: 110, minZ: -79, maxZ: -72.5 },
  {
    id: "rko-east-public-edge",
    minX: 139.5,
    maxX: 145.5,
    minZ: -68,
    maxZ: -54,
  },
  { id: "191A", minX: -249, maxX: -234, minZ: 248, maxZ: 260 },
  { id: "191B", minX: -290, maxX: -275, minZ: 268, maxZ: 280 },
]) {
  let samples = 0,
    voids = 0,
    occluded = 0,
    offset = 0,
    steep = 0;
  const flagged: any[] = [];
  for (let x = area.minX; x <= area.maxX; x += 0.5)
    for (let z = area.minZ; z <= area.maxZ; z += 0.5) {
      const r = surface(x, z);
      samples++;
      let kind: string | undefined;
      if (!r.support) {
        if (!r.allHits.length) {
          voids++;
          kind = "scan-void-at-vertical-ray";
        } else {
          occluded++;
          kind = "no-near-ground-hit-under-object-roof-or-steep-surface";
        }
      } else if (Math.abs(r.support.y - r.dmrY) > 0.45) {
        offset++;
        kind = "source-DMR-difference-over-0.45m";
      } else if (Math.abs(r.support.normalY) < 0.7) {
        steep++;
        kind = "source-steep-support";
      }
      if (kind) flagged.push({ kind, ...r });
    }
  areaReports.push({
    ...area,
    spacing: 0.5,
    samples,
    voids,
    occluded,
    offset,
    steep,
    flagged,
  });
}
const summary = {
  checkedAt: new Date().toISOString(),
  elapsedSeconds: (performance.now() - started) / 1000,
  sourceManifestSha256: hash(await readFile("shared/data/photogrammetry.json")),
  capture: manifest.capture,
  license: manifest.license,
  originalFilesChanged: false,
  nodes: manifest.nodes.length,
  leaves: leaves.length,
  highestTriangles,
  checkedOriginalResources: nodes.length * 2,
  resourceFailures: errors.length,
  jpegDimensions: Object.fromEntries(
    [
      ...new Set(
        nodes
          .filter((n) => n.jpeg)
          .map((n) => n.jpeg.width + "x" + n.jpeg.height),
      ),
    ].map((key) => [
      key,
      nodes.filter((n) => n.jpeg && n.jpeg.width + "x" + n.jpeg.height === key)
        .length,
    ]),
  ),
  uvOutsideNodes: nodes.filter((n) => n.uv?.outsideUnitRange).map((n) => n.id),
  degenerateLeafTriangles: nodes
    .filter((n) => n.leaf)
    .reduce((s, n) => s + (n.geometry?.degenerateAreaBelow1e12 ?? 0), 0),
  tinyLeafTriangles: nodes
    .filter((n) => n.leaf)
    .reduce((s, n) => s + (n.geometry?.tinyAreaBelow1e6 ?? 0), 0),
  nearGroundWinding: {
    positiveY: nodes
      .filter((n) => n.leaf)
      .reduce((s, n) => s + (n.geometry?.nearGroundUp ?? 0), 0),
    negativeY: nodes
      .filter((n) => n.leaf)
      .reduce((s, n) => s + (n.geometry?.nearGroundDown ?? 0), 0),
  },
  routeSamples: routeReports.reduce((s, r) => s + r.sampleCount, 0),
  routeSummary: routeReports.map(({ samples, points, ...r }) => r),
  issueSamples: issues.length,
  criticalProbes: probes,
  limits: [
    "SHA/byte/JPEG-header/geometry/UV checks cover every downloaded original node. JPEG entropy pixels were not independently decoded.",
    "Triangle normals use mathematical right-handed cross products; negative ground-facing normals are reported, not automatically declared corrupt. Source material is double sided.",
    "A missing near-DMR hit can be occlusion, a genuine scan hole or an object/roof; source node IDs and all vertical hits are retained for targeted visual/collision inspection.",
    "DMR is a different source/date and B6 has an explicit game-foundation adaptation. A height difference is not automatically a photogrammetry error.",
    "The static 2023 mesh includes trees/cars and baked lighting. This audit is not a 2026 survey, dynamic avoidance or GPU/FPS measurement.",
  ],
};
await mkdir("docs/photogrammetry", { recursive: true });
Object.assign(summary, {
  originalSourceDegenerateLeafTriangles: nodes
    .filter((n) => n.leaf)
    .reduce(
      (s, n) => s + (n.geometry?.sourceLocalDegenerateAreaBelow1e12 ?? 0),
      0,
    ),
  unresolvedRouteRequests,
  areaSummary: areaReports.map(({ flagged, ...area }) => area),
});
await Promise.all([
  writeFile(
    "docs/photogrammetry/source-quality-summary.json",
    JSON.stringify(summary, null, 2) + "\n",
  ),
  writeFile(
    "docs/photogrammetry/source-quality-resources.json",
    JSON.stringify({ errors, nodes }) + "\n",
  ),
  writeFile(
    "docs/photogrammetry/source-quality-routes.json",
    JSON.stringify({ probes, routes: routeReports, issues }) + "\n",
  ),
  writeFile(
    "docs/photogrammetry/source-quality-areas.json",
    JSON.stringify({ areas: areaReports }) + "\n",
  ),
]);
console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
