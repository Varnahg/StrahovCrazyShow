import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

// --snapshot reproduces the inventory from the checked-in primary OSM response.
const directory = "docs/reality-pack/outdoor-artifacts";
const coverage = JSON.parse(
  await readFile("shared/data/campus-coverage.json", "utf8"),
);
const { south, west, north, east } = coverage.osmBBox;
const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${west},${south},${east},${north}`;
await mkdir(directory, { recursive: true });
let xml, fetchedAt;
if (process.argv.includes("--snapshot")) {
  xml = await readFile(`${directory}/osm-source.xml`, "utf8");
  try {
    fetchedAt = JSON.parse(
      await readFile(`${directory}/osm-source.json`, "utf8"),
    ).fetchedAt;
  } catch {
    fetchedAt = new Date().toISOString();
  }
} else {
  const response = await fetch(url, {
    headers: { "User-Agent": "StrahovCrazyShow/0.1 source-backed-world" },
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok)
    throw new Error(`OSM source download failed: ${response.status}`);
  xml = await response.text();
  fetchedAt = new Date().toISOString();
  await writeFile(`${directory}/osm-source.xml`, xml);
}
const decode = (value) =>
  value.replace(
    /&(?:amp|quot|apos|lt|gt);/g,
    (s) =>
      ({
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">",
      })[s],
  );
const attrs = (source) =>
  Object.fromEntries(
    [...source.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [
      m[1],
      decode(m[2]),
    ]),
  );
const project = (latitude, longitude) => [
  +(
    (longitude - coverage.origin.lon) *
    111320 *
    Math.cos((coverage.origin.lat * Math.PI) / 180)
  ).toFixed(2),
  +(-(latitude - coverage.origin.lat) * 111320).toFixed(2),
];
const elements = [
  ...xml.matchAll(/<(node|way)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g),
].map((match) => {
  const a = attrs(match[2]),
    body = match[3] ?? "";
  return {
    type: match[1],
    id: a.id,
    version: Number(a.version),
    timestamp: a.timestamp,
    lat: Number(a.lat),
    lon: Number(a.lon),
    tags: Object.fromEntries(
      [...body.matchAll(/<tag\b([^>]+)\/>/g)].map((m) => {
        const t = attrs(m[1]);
        return [t.k, t.v];
      }),
    ),
    refs: [...body.matchAll(/<nd ref="(\d+)"\/>/g)].map((m) => m[1]),
  };
});
const nodes = new Map(
  elements
    .filter((e) => e.type === "node")
    .map((e) => [e.id, { ...e, point: project(e.lat, e.lon) }]),
);
const ways = elements
  .filter((e) => e.type === "way")
  .map((e) => ({
    ...e,
    points: e.refs.map((ref) => nodes.get(ref)?.point).filter(Boolean),
  }));
const inside = ([x, z], polygon) => {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
};
const inBounds = ([x, z]) =>
  x >= coverage.walkBounds.minX &&
  x <= coverage.walkBounds.maxX &&
  z >= coverage.walkBounds.minZ &&
  z <= coverage.walkBounds.maxZ;
const classify = (tags) =>
  ({
    bench: "bench",
    waste_basket: "waste-basket",
    waste_disposal: "dumpster",
    recycling: "recycling",
    bicycle_parking: "bicycle-rack",
    picnic_table: "picnic-table",
  })[tags.amenity] ??
  (tags.leisure === "picnic_table" ? "picnic-table" : null) ??
  {
    fence: "fence",
    railing: "railing",
    gate: "gate",
    bollard: "bollard",
    cycle_barrier: "cycle-barrier",
  }[tags.barrier] ??
  (tags.tourism === "information" && ["board", "map"].includes(tags.information)
    ? "information-board"
    : null);
// These identifiers establish existence/location, but do not establish the
// shape of a specific artwork, monument or water fixture. Preserve a research
// queue instead of silently dropping them or inventing a generic sculpture.
const deferredKind = (tags) =>
  ({ drinking_water: "drinking-water", fountain: "fountain" })[tags.amenity] ??
  (tags.tourism === "artwork" ? "artwork" : null) ??
  { memorial: "memorial", monument: "monument" }[tags.historic] ??
  (tags.man_made === "flagpole" ? "flagpole" : null);
const nearestSegment = (point, candidates) => {
  let closest = {
    distance: Infinity,
    x: point[0],
    z: point[1],
    dx: 1,
    dz: 0,
    id: "",
  };
  for (const way of candidates)
    for (let i = 1; i < way.points.length; i++) {
      const a = way.points[i - 1],
        b = way.points[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        l2 = dx * dx + dz * dz;
      if (!l2) continue;
      const t = Math.max(
        0,
        Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / l2),
      );
      const x = a[0] + t * dx,
        z = a[1] + t * dz,
        distance = Math.hypot(point[0] - x, point[1] - z);
      if (distance < closest.distance)
        closest = { distance, x, z, dx, dz, id: way.id };
    }
  return closest;
};
const paths = ways.filter((e) => e.tags.highway && e.tags.area !== "yes");
const fences = ways.filter((e) =>
  ["fence", "railing"].includes(e.tags.barrier),
);
const buildings = ways.filter(
  (e) => e.tags.building && e.tags.building !== "no",
);
const names = {
  bench: "Lavička",
  "waste-basket": "Odpadkový koš",
  dumpster: "Kontejner na odpad",
  recycling: "Sběrné nádoby",
  "bicycle-rack": "Stojan na kola",
  "picnic-table": "Piknikový stůl s lavicemi",
  fence: "Oplocení",
  railing: "Zábradlí",
  gate: "Brána",
  bollard: "Sloupek",
  "cycle-barrier": "Zábrana",
  "information-board": "Informační tabule",
};
const inventory = [],
  excluded = [],
  deferredCandidates = [];
const mappedTrees = [...nodes.values()].filter(
  (tree) => tree.tags.natural === "tree",
);
for (const source of [...nodes.values(), ...ways]) {
  const kind = classify(source.tags);
  const candidateKind = deferredKind(source.tags);
  if (!kind && !candidateKind) continue;
  const points = source.type === "node" ? [source.point] : source.points;
  const sourceUrl = `https://www.openstreetmap.org/${source.type}/${source.id}`;
  const point =
    source.type === "node"
      ? points[0]
      : points.reduce(
          (sum, p) => [
            sum[0] + p[0] / points.length,
            sum[1] + p[1] / points.length,
          ],
          [0, 0],
        );
  if (!kind) {
    const ownedByLandmarks =
      source.type === "node" && source.id === "13482792171";
    deferredCandidates.push({
      id: `${source.type}/${source.id}`,
      kind: candidateKind,
      name: source.tags.name ?? source.tags.description ?? candidateKind,
      source: sourceUrl,
      x: +point[0].toFixed(2),
      z: +point[1].toFixed(2),
      points,
      ...(source.type === "node"
        ? { lat: source.lat, lon: source.lon }
        : { nodeIds: source.refs }),
      osmVersion: source.version,
      osmTimestamp: source.timestamp,
      tags: source.tags,
      withinWalkBounds: points.some(inBounds),
      reason: ownedByLandmarks
        ? "owned-by-outdoor-landmarks"
        : "awaiting-source-photo-shape-identification",
      ...(ownedByLandmarks ? { owner: "shared/outdoor-landmarks.ts" } : {}),
    });
    continue;
  }
  if (!points.some(inBounds)) {
    excluded.push({
      id: `${source.type}/${source.id}`,
      kind,
      source: sourceUrl,
      reason: "outside-walk-bounds",
    });
    continue;
  }
  // A battery box inside a mapped building is not an outdoor street prop.
  const building =
    source.type === "node" && buildings.find((b) => inside(point, b.points));
  if (building && !["gate", "bollard"].includes(kind)) {
    excluded.push({
      id: `${source.type}/${source.id}`,
      kind,
      source: sourceUrl,
      reason: `inside-building-${building.id}`,
    });
    continue;
  }
  const path = nearestSegment(point, paths),
    fence = nearestSegment(point, fences);
  let yaw = 0,
    orientation = "north-facing-game-estimate";
  const direction = Number(source.tags.direction);
  if (source.tags.direction !== undefined && Number.isFinite(direction)) {
    yaw = Math.PI - (direction * Math.PI) / 180;
    orientation = "osm-direction-tag";
  } else if (kind === "gate" && fence.distance < 2) {
    yaw = -Math.atan2(fence.dz, fence.dx);
    orientation = `aligned-to-mapped-fence-way/${fence.id}-not-surveyed`;
  } else if (Number.isFinite(path.distance)) {
    // Front is local +Z. Bench fronts face the nearest mapped path; a gate's
    // width axis crosses the path. The inferred orientation is never a survey.
    yaw =
      kind === "gate"
        ? Math.atan2(path.dx, path.dz)
        : Math.atan2(path.x - point[0], path.z - point[1]);
    orientation = `nearest-mapped-path-way/${path.id}-not-surveyed`;
  }
  const nearbyTrees = mappedTrees
    .filter(
      (tree) =>
        Math.hypot(tree.point[0] - point[0], tree.point[1] - point[1]) <= 5,
    )
    .map((tree) => tree.id);
  inventory.push({
    id: `${source.type}/${source.id}`,
    kind,
    name: source.tags.name ?? names[kind],
    source: sourceUrl,
    osmType: source.type,
    osmId: source.id,
    osmVersion: source.version,
    osmTimestamp: source.timestamp,
    x: +point[0].toFixed(2),
    z: +point[1].toFixed(2),
    yaw: +yaw.toFixed(8),
    points,
    ...(source.type === "node"
      ? { lat: source.lat, lon: source.lon }
      : { nodeIds: source.refs }),
    tags: source.tags,
    positionEvidence: "osm-map-coordinate-not-site-survey",
    orientationEvidence: orientation,
    dimensionsEvidence:
      "osm-height-width-capacity-tags-where-present-otherwise-game-estimate",
    nearbyTreeOsmIds: nearbyTrees,
  });
}
const metadata = {
  url,
  fetchedAt,
  sha256: createHash("sha256").update(xml).digest("hex"),
  attribution: "© OpenStreetMap contributors · ODbL 1.0",
  license: "https://www.openstreetmap.org/copyright",
};
await writeFile(
  `${directory}/osm-source.json`,
  JSON.stringify(metadata, null, 2) + "\n",
);
await writeFile(
  "shared/data/outdoor-artifacts.json",
  JSON.stringify(
    {
      schemaVersion: 1,
      source: metadata,
      origin: coverage.origin,
      bounds: coverage.walkBounds,
      artifacts: inventory,
      excluded,
      deferredCandidates,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      artifacts: inventory.length,
      counts: Object.fromEntries(
        Object.entries(Object.groupBy(inventory, (e) => e.kind)).map(
          ([k, v]) => [k, v.length],
        ),
      ),
      excluded: excluded.length,
      deferredCandidates: deferredCandidates.length,
      sha256: metadata.sha256,
    },
    null,
    2,
  ),
);
